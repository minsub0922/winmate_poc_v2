-- Metabase에서 바로 쓰는 뷰. loader.py가 스냅샷을 적재할 때마다 같은 트랜잭션에서 다시 만든다.
-- 시간 컬럼은 timestamptz(Metabase 보고 시간대 Asia/Seoul로 표시), 날짜 묶음(day_kst)은 한국 시간 기준.
DROP VIEW IF EXISTS winmate.v_llm_calls, winmate.v_daily_ai_usage, winmate.v_daily_activity, winmate.v_user_activity,
  winmate.v_errors, winmate.v_jobs, winmate.v_proposals, winmate.v_voc CASCADE;

-- 실제 모델 요청 1건 = 1행 (재시도도 각각). langfuse_url로 같은 요청의 Langfuse trace를 연다.
CREATE VIEW winmate.v_llm_calls AS
SELECT s.started_at, (s.started_at AT TIME ZONE 'Asia/Seoul')::date AS day_kst, s.username, s.feature, s.stage, s.model,
       s.status, s.code, s.duration_ms, s.input_tokens, s.output_tokens, s.thought_tokens, s.cached_tokens, s.total_tokens,
       s.usage_known, s.job_id, s.trace_id,
       st.langfuse_url || '/project/' || st.langfuse_project || '/traces/' || s.langfuse_trace_id AS langfuse_url
FROM winmate.spans s CROSS JOIN winmate.sync_status st
WHERE s.kind = 'llm.usage';

CREATE VIEW winmate.v_daily_ai_usage AS
SELECT day_kst, feature, model, count(*) AS calls, count(*) FILTER (WHERE status = 'error') AS errors,
       sum(coalesce(input_tokens, 0)) AS input_tokens,
       sum(coalesce(output_tokens, 0) + coalesce(thought_tokens, 0)) AS output_tokens,
       sum(coalesce(total_tokens, 0)) AS total_tokens,
       count(*) FILTER (WHERE NOT coalesce(usage_known, false)) AS usage_unreported,
       round(avg(duration_ms)) AS avg_duration_ms
FROM winmate.v_llm_calls
GROUP BY day_kst, feature, model;

CREATE VIEW winmate.v_daily_activity AS
SELECT (started_at AT TIME ZONE 'Asia/Seoul')::date AS day_kst,
       count(DISTINCT username) FILTER (WHERE username NOT IN ('system', 'anonymous', 'scheduler')) AS active_users,
       count(*) FILTER (WHERE kind = 'screen.enter') AS visits,
       count(*) FILTER (WHERE kind = 'action') AS actions,
       count(*) FILTER (WHERE kind = 'http') AS requests,
       count(*) FILTER (WHERE kind = 'job') AS jobs,
       count(*) FILTER (WHERE kind = 'llm.usage') AS llm_calls,
       coalesce(sum(total_tokens) FILTER (WHERE kind = 'llm.usage'), 0) AS total_tokens,
       count(*) FILTER (WHERE status = 'error') AS errors
FROM winmate.spans
GROUP BY 1;

CREATE VIEW winmate.v_user_activity AS
WITH people AS (
  SELECT username FROM winmate.users
  UNION
  SELECT DISTINCT username FROM winmate.spans WHERE username NOT IN ('system', 'anonymous', 'scheduler')
), recent AS (
  SELECT * FROM winmate.spans WHERE started_at >= now() - interval '30 days'
), activity AS (
  SELECT username, max(started_at) AS last_seen,
         count(*) FILTER (WHERE kind = 'screen.enter') AS visits_30d,
         count(*) FILTER (WHERE kind = 'action') AS actions_30d,
         count(*) FILTER (WHERE kind = 'job') AS jobs_30d,
         count(*) FILTER (WHERE kind = 'llm.usage') AS llm_calls_30d,
         coalesce(sum(total_tokens) FILTER (WHERE kind = 'llm.usage'), 0) AS tokens_30d,
         count(*) FILTER (WHERE status = 'error') AS errors_30d
  FROM recent GROUP BY username
)
SELECT p.username, u.display_name, u.role, u.active, u.last_login, a.last_seen,
       coalesce(a.visits_30d, 0) AS visits_30d, coalesce(a.actions_30d, 0) AS actions_30d, coalesce(a.jobs_30d, 0) AS jobs_30d,
       coalesce(a.llm_calls_30d, 0) AS llm_calls_30d, coalesce(a.tokens_30d, 0) AS tokens_30d, coalesce(a.errors_30d, 0) AS errors_30d,
       (SELECT count(*) FROM winmate.proposals x WHERE x.username = p.username AND NOT coalesce(x.archived, false)) AS proposals,
       (SELECT count(*) FROM winmate.customer_voice v WHERE v.owner = p.username) AS voc
FROM people p
LEFT JOIN winmate.users u ON u.username = p.username
LEFT JOIN activity a ON a.username = p.username;

CREATE VIEW winmate.v_errors AS
SELECT s.started_at, s.username, s.kind, s.feature, s.page, s.path, s.http_status, s.code, s.message, s.model, s.job_id, s.trace_id,
       CASE WHEN s.kind IN ('llm.usage', 'llm.logical', 'job')
            THEN st.langfuse_url || '/project/' || st.langfuse_project || '/traces/' || s.langfuse_trace_id END AS langfuse_url
FROM winmate.spans s CROSS JOIN winmate.sync_status st
WHERE s.status = 'error';

-- 서버 AI 작업(rfp · requirements · layout · storyboard · review) 1건 = 1행
CREATE VIEW winmate.v_jobs AS
SELECT s.job_id, s.feature AS job_kind, s.username, s.status, s.started_at, s.ended_at, s.duration_ms, s.code, s.message,
       coalesce(l.llm_calls, 0) AS llm_calls, coalesce(l.total_tokens, 0) AS total_tokens,
       st.langfuse_url || '/project/' || st.langfuse_project || '/traces/' || s.langfuse_trace_id AS langfuse_url
FROM winmate.spans s
CROSS JOIN winmate.sync_status st
LEFT JOIN (SELECT job_id, count(*) AS llm_calls, coalesce(sum(total_tokens), 0) AS total_tokens
           FROM winmate.spans WHERE kind = 'llm.usage' AND job_id IS NOT NULL GROUP BY job_id) l ON l.job_id = s.job_id
WHERE s.kind = 'job';

CREATE VIEW winmate.v_proposals AS
SELECT username, record_id, title, customer, industry, stage, scenario, created_at, updated_at, exported_at,
       exported_at IS NOT NULL AS exported, archived, revision, parts, slides, products, solutions, cases, keymen, req_files, shared
FROM winmate.proposals;

-- 고객의 소리(VOC). 처리 상태 변경은 Winmate 관리자 화면에서 한다(원본은 Winmate DB).
CREATE VIEW winmate.v_voc AS
SELECT v.id, v.created_at, v.owner, v.message, v.status,
       CASE v.status WHEN 'new' THEN '신규' WHEN 'reviewing' THEN '검토 중' WHEN 'closed' THEN '처리 완료' ELSE v.status END AS status_label,
       v.updated_at, v.work_type, v.work_id, v.stage, v.path,
       round((extract(epoch FROM (CASE WHEN v.status = 'closed' THEN v.updated_at ELSE now() END) - v.created_at) / 3600.0)::numeric, 1) AS age_hours,
       p.title AS proposal_title
FROM winmate.customer_voice v
LEFT JOIN winmate.proposals p ON p.record_id = v.work_id AND p.username = v.owner;
