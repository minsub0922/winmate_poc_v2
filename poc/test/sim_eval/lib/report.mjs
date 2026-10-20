// summary → report.md · report.html · summary.json
import fs from 'node:fs';
import path from 'node:path';
import * as E from '../engine/index.mjs';
import { runSummary } from './summary.mjs';
import { JUDGE_DIMS } from './judge.mjs';
import { renderHtml } from './report_html.mjs';

const ST = { won: '설득 성공', lost: '미팅 종료(실패)', ended: '결론 없음(턴 소진)', error: '오류', running: '진행 중', queued: '대기' };
export const statusLabel = (s) => ST[s] || s;
const v = (x, suf = '') => (x == null ? '-' : x + suf);

export function buildReport(dir) {
  const S = runSummary(dir);
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(S, null, 1));
  const md = renderMd(S);
  fs.writeFileSync(path.join(dir, 'report.md'), md);
  try { fs.writeFileSync(path.join(dir, 'report.html'), renderHtml(S, dir)); } catch (e) { console.error('report.html 실패:', e.message); }
  const m = S.modes.scenario || {};
  const headline = `세션 ${S.totals.done}/${S.totals.sessions} · AI 응답 ${v(S.totals.aiRate, '%')} · Best Scenario 담당자 설득 ${v(m.won)}/${v(m.n)} · 품질 ${v(m.quality)} · 판별(담당자−미숙) 품질 ${S.totals.discrimination ? S.totals.discrimination.quality : '-'}`;
  return { S, headline };
}

function renderMd(S) {
  const L = [];
  const r = S.run; const t = S.totals;
  L.push(`# 제안 시뮬레이션 실성능 검증 — ${r.id}`, '');
  L.push(`- 실행: ${r.created?.slice(0, 16).replace('T', ' ')} UTC · 최대 ${r.turns}턴 · 페르소나 고유 난이도 값 ${r.personaLevel ? '엔진에 전달' : '전달 안 함(앱 기본)'}`);
  L.push(`- 모델: 고객 · 평가(앱 엔진) **${r.models.customer}** · 영업 담당자 ${r.models.seller} · 독립 심사 ${r.models.judge || '-'}`);
  L.push(`- 엔진: 앱 src/sim 그대로 묶음 (${r.engine && r.engine.built ? r.engine.built.slice(0, 16) : '-'})`, '');
  L.push('## 한눈에', '');
  L.push('| 지표 | 값 |', '|---|---|');
  L.push(`| 세션 · 턴 | ${t.done}/${t.sessions}개 · 고객 턴 ${t.turns}번 |`);
  L.push(`| AI 응답 성공(규칙 대체 · 평가 깨짐 없음) | ${v(t.aiRate, '%')} |`);
  L.push(`| 고객 턴 평균 응답 · 대사 길이 | ${(t.avgCustMs / 1000).toFixed(1)}초 · ${t.avgReplyChars}자 |`);
  L.push(`| 판별력 — Best Scenario 담당자 − 미숙한 담당자 | ${t.discrimination ? `품질 ${t.discrimination.quality > 0 ? '+' : ''}${t.discrimination.quality} · 만족도 ${t.discrimination.satisfaction > 0 ? '+' : ''}${t.discrimination.satisfaction} (심사 기준 품질 차 ${t.discrimination.judgeQuality})` : '-'} |`);
  L.push(`| 엔진 최종 점수 vs 독립 심사 점수 | 평균 절대 차 ${v(t.calibMae)} · 치우침 ${t.calibBias > 0 ? '+' : ''}${v(t.calibBias)} (엔진이 높으면 +) |`);
  L.push(`| 결과 판정 일치(엔진 vs 심사) | ${v(t.outcomeAgree, '%')} |`);
  L.push(`| 대화 단계 일치(영업 의도 vs 엔진) | ${v(t.stageAgree, '%')} |`);
  L.push(`| AI 점수 vs 규칙 점수 차(턴 평균) | ${v(t.ruleGap)} |`, '');
  L.push('## 담당자 유형별', '');
  L.push('| 유형 | 세션 | 성공 | 실패 | 결론 없음 | 최종 만족도 | 최종 품질(엔진) | 품질(심사) | 평균 턴 |', '|---|---|---|---|---|---|---|---|---|');
  for (const [k, m] of Object.entries(S.modes)) L.push(`| ${{ scenario: 'Best Scenario 담당자', expert: '숙련 담당자(스토리라인 + 구체 답변)', weak: '미숙한 담당자(대조)', suggest: '추천 답변 그대로(대조)' }[k] || k} | ${m.n} | ${m.won} | ${m.lost} | ${m.ended} | ${v(m.satisfaction)} | ${v(m.quality)} | ${v(m.judgeQuality)} | ${v(m.turns)} |`);
  L.push('', '## 난이도별 (Best Scenario 담당자)', '');
  L.push('| 난이도 | 세션 | 성공 | 최종 만족도 | 최종 품질 | 평균 턴 |', '|---|---|---|---|---|---|');
  for (const lv of [1, 2, 3]) { const m = S.levels[lv]; if (m && m.n) L.push(`| ${E.LV[lv].name} | ${m.n} | ${m.won} | ${v(m.satisfaction)} | ${v(m.quality)} | ${v(m.turns)} |`); }
  L.push('', '## 세션', '');
  L.push('| 세션 | 고객 · 난이도 | 스토리라인 | 담당자 | 결과 | 턴 | 만족도 추이 | 품질 추이 | 우려(드러남/해소/전체) | 심사(7항목 평균) | 경고 |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const s of S.sessions) {
    const sat = s.trend.map((x) => x.sat).join('→');
    const q = s.trend.filter((x) => x.q != null).map((x) => x.q);
    const cc = s.concerns || [];
    const jd = s.judge ? (Object.values(s.judge.scores).filter((x) => x != null).reduce((a, b) => a + b, 0) / Object.values(s.judge.scores).filter((x) => x != null).length).toFixed(1) : '-';
    const warn = Object.entries(s.checks).map(([k, c]) => `${k}${c.n > 1 ? '×' + c.n : ''}`).join(', ');
    L.push(`| ${s.id} | ${s.customer} ${s.person} · ${s.levelName} | ${s.scenario} | ${s.mode} | ${statusLabel(s.status)} | ${s.turns} | ${sat} | ${q.length ? q[0] + '→' + q[q.length - 1] : '-'} | ${cc.filter((c) => c.revealed).length}/${cc.filter((c) => c.resolved).length}/${cc.length} | ${jd} | ${warn || '-'} |`);
  }
  L.push('', '## 자동 점검', '');
  L.push('| 점검 | 수준 | 횟수 | 세션 수 |', '|---|---|---|---|');
  for (const c of S.checks) L.push(`| ${c.label} (\`${c.id}\`) | ${c.level} | ${c.n} | ${c.sessions} |`);
  L.push('', '## 독립 심사 (1~5)', '');
  L.push('| 항목 | 평균 |', '|---|---|');
  for (const [k, val] of Object.entries(S.judgeDims)) L.push(`| ${JUDGE_DIMS[k]} | ${v(val)} |`);
  L.push('', '### 기준별 엔진 − 심사 (최종 점수)', '');
  L.push('| 기준 | 치우침 | 평균 절대 차 |', '|---|---|---|');
  for (const [id, c] of Object.entries(S.critBias)) L.push(`| ${id} ${c.name} | ${c.bias > 0 ? '+' : ''}${v(c.bias)} | ${v(c.mae)} |`);
  L.push('', '### 심사가 짚은 문제 (high · mid)', '');
  for (const x of S.issues.filter((i) => i.severity !== 'low').sort((a, b) => (a.severity === 'high' ? -1 : 1) - (b.severity === 'high' ? -1 : 1))) L.push(`- [${x.severity}] ${x.session} #${x.turn ?? '-'} (${x.type}) ${x.text}`);
  L.push('', '## 대화 기록', '');
  for (const s of S.sessions) {
    L.push(`### ${s.id} — ${s.customer} ${s.person} · ${s.levelName} · ${s.modeLabel}`, '');
    L.push(`요구: ${s.reqTitle} · 스토리라인 ${s.scenarioTitle} · 수락 조건 "${s.ask}" · 결과 **${statusLabel(s.status)}**`, '');
    if (s.judge) L.push(`> 심사: ${s.judge.summary} (기대 결과 ${s.judge.expected_outcome})`, '');
    if (s.debrief && s.debrief.verdict) L.push(`> 앱 총평: ${s.debrief.verdict}`, '');
  }
  L.push('', '턴별 전체 기록은 sessions/*.jsonl 과 report.html 에 있습니다.');
  return L.join('\n') + '\n';
}

if (process.argv[1] && process.argv[1].endsWith('report.mjs')) {
  const dir = path.resolve(process.argv[2] || '.');
  const { headline } = buildReport(dir);
  console.log(headline);
}
