// 턴마다 자동 점검 — 앱 엔진(고객 대사 + 평가)이 프롬프트 규칙과 앱 규칙을 지키는지.
// level: fail(명백한 오류) · warn(의심) · info(기록용)
import * as E from '../engine/index.mjs';

export const CHECKS = {
  ai_fallback: 'AI 응답 실패 → 규칙으로 대체',
  eval_broken: '대사는 왔지만 평가 JSON 이 깨짐 → 평가만 규칙',
  reply_long: '고객 대사가 200자 규칙을 넘음',
  reply_sentences: '고객 대사가 4문장을 넘음',
  meta_leak: '대사에 평가 · 형식 · 메타 정보가 섞임',
  stage_direction: '대사에 지문 · 괄호 설명 · 이모지',
  sat_jump: '만족도가 한 턴에 ±15 넘게 움직임',
  multi_reveal: '숨은 우려를 한 턴에 2개 이상 드러냄',
  early_reveal: '첫 인사에서 숨은 우려를 드러냄',
  instant_resolve: '우려가 드러난 그 턴에 바로 해소 처리',
  score_drop: '누적 점수가 한 턴에 20 넘게 떨어짐',
  ungrounded_high: '영업이 말하지 않은 근거로 높은 점수',
  win_open_concern: '풀리지 않은 우려가 남았는데 설득 성공 처리',
  win_no_ask: '결정 요청이 없었는데 설득 성공 처리',
  suggest_short: '추천 답변이 3개 미만',
  suggest_bad_ref: '추천 답변에 자료에 없는 id',
  slow: '고객 턴 응답이 20초를 넘음',
  repeat: '고객이 직전 대사를 거의 그대로 반복',
};

const ABS_ASK = ['진행', '승인', '다음 단계', '일정', '시작', '착수', '계약', '결정', '파일럿', '시범', '합의', '확정', '해도 될까요', '하시겠', '어떠실까요', '어떠세요'];
const NUM = /\d[\d,.]*\s*(%|퍼센트|원|만\s?원|억|배|일|주|개월|시간|분|대|곳|개소|매장|명|실|년)/;

function bigrams(s) { const t = String(s).replace(/\s+/g, ''); const o = new Set(); for (let i = 0; i < t.length - 1; i++) o.add(t.slice(i, i + 2)); return o; }
function jaccard(a, b) { const A = bigrams(a); const B = bigrams(b); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); }

/**
 * @param {object} before  턴 전 sim (영업 발화까지 들어간 상태)
 * @param {object} r       customerTurn 결과 { text, ev, ai, note }
 * @param {object} raw     LLM 원문 { text, ms } (규칙 대체면 null)
 * @param {boolean} opening
 */
export function checkTurn(before, r, raw, opening) {
  const out = [];
  const add = (id, level, detail = '') => out.push({ id, level, msg: CHECKS[id] + (detail ? ' — ' + detail : '') });
  const ev = r.ev || {};
  const text = String(r.text || '');
  if (!r.ai) add('ai_fallback', 'fail', r.note || '');
  else if (r.note) add('eval_broken', 'fail', r.note);
  if (text.length > 320) add('reply_long', 'fail', text.length + '자');
  else if (text.length > 200) add('reply_long', 'warn', text.length + '자');
  const sentences = text.split(/(?<=[.?!。])\s+/).filter((x) => x.trim().length > 1).length;
  if (sentences > 4) add('reply_sentences', 'warn', sentences + '문장');
  if (/<<<|>>>|\{\s*"|satisfaction|scores|평가 기준|롤플레이|영업 담당자님?의 (제안|점수)|만족도(가|는)? \d/.test(text)) add('meta_leak', 'fail', text.slice(0, 40));
  if (/^\s*[(（[]|[(（][^)）]{2,24}[)）]\s*$|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)) add('stage_direction', 'warn');
  const rv = ev.revealedNow || []; const rs = ev.resolvedNow || [];
  if (opening && rv.length) add('early_reveal', 'warn', rv.join(','));
  if (!opening && Math.abs(ev.delta || 0) > 15) add('sat_jump', 'warn', `${ev.delta > 0 ? '+' : ''}${ev.delta}`);
  if (rv.length > 1) add('multi_reveal', 'warn', rv.length + '개');
  const wasRevealed = new Set(before.profile.concerns.filter((c) => c.revealed).map((c) => c.id));
  const instant = rs.filter((id) => !wasRevealed.has(id));
  if (instant.length) add('instant_resolve', 'warn', instant.join(','));
  if (!opening && before.cur.scores && ev.scores) {
    const drops = E.SIM_CRIT.filter((id) => before.cur.scores[id] != null && ev.scores[id] != null && before.cur.scores[id] - ev.scores[id] > 20);
    if (drops.length) add('score_drop', 'warn', drops.map((id) => `${id} ${before.cur.scores[id]}→${ev.scores[id]}`).join(', '));
  }
  if (!opening && ev.scores) {
    const said = before.msgs.filter((m) => m.who === 'me');
    const t = said.map((m) => E.msgPlain(m)).join('\n');
    const refs = said.flatMap((m) => E.segRefs(m.segs || []));
    const hasCase = refs.some((x) => x.startsWith('case:')) || /사례|도입한 곳|레퍼런스/.test(t);
    const hasNum = NUM.test(t);
    const hasProd = refs.some((x) => x.startsWith('product:')) || Object.values(E.P).some((p) => t.includes(p.model));
    const bad = [];
    if (ev.scores.VS5 > 60 && !hasCase) bad.push('VS5 ' + ev.scores.VS5 + '(사례 언급 없음)');
    if (ev.scores.VS2 > 60 && !hasNum) bad.push('VS2 ' + ev.scores.VS2 + '(수치 없음)');
    if (ev.scores.PR3 > 60 && !hasProd) bad.push('PR3 ' + ev.scores.PR3 + '(제품 언급 없음)');
    if (bad.length) add('ungrounded_high', 'warn', bad.join(', '));
  }
  if (ev.end === 'win') {
    const open = (ev.concerns || []).filter((c) => c.revealed && !c.resolved);
    if (open.length) add('win_open_concern', 'fail', open.map((c) => c.short).join(', '));
    const last = before.msgs.filter((m) => m.who === 'me').slice(-1)[0];
    if (last && !ABS_ASK.some((w) => E.msgPlain(last).includes(w))) add('win_no_ask', 'warn');
  }
  const sug = ev.suggest || [];
  if (sug.length < 3) add('suggest_short', 'warn', sug.length + '개');
  if (raw && raw.text) {
    const bad = [...String(raw.text).matchAll(/@(product|solution|case):([A-Za-z0-9_-]+)/g)].filter((m) => !(m[1] === 'product' ? E.P[m[2]] : m[1] === 'solution' ? E.S[m[2]] : E.C[m[2]])).map((m) => m[0]);
    if (bad.length) add('suggest_bad_ref', 'warn', [...new Set(bad)].slice(0, 3).join(', '));
    if (raw.ms > 20000) add('slow', 'warn', Math.round(raw.ms / 1000) + '초');
  }
  const prevCust = before.msgs.filter((m) => m.who === 'cust').slice(-2).map((m) => m.text);
  const rep = prevCust.map((x) => jaccard(x, text)).reduce((a, b) => Math.max(a, b), 0);
  if (rep >= 0.6) add('repeat', 'warn', 'Jaccard ' + rep.toFixed(2));
  return out;
}

/** 스토리라인 단계 key → 앱 대화 단계(SIM_STAGES) */
export function storyToSimStage(key) {
  const st = E.SIM_STAGES.find((s) => s.keys.includes(key));
  return st ? st.k : null;
}
