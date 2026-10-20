// 수정 전 · 후 비교 리포트 — 여러 실행(runs/<id>)을 묶어 한 페이지로.
//
//   node compare.mjs reports/20261018.notes.json            # → reports/20261018.html · 20261018.json
//   node compare.mjs --before a,b --after c [--out reports/x.html]
//
// notes 파일: 비교할 실행 id(before · after · iterations)와 사람이 쓴 설명(문제 · 수정 · 판단할 것). 숫자는 모두 실행 기록에서 다시 계산한다.
import fs from 'node:fs';
import path from 'node:path';
import { RUNS, ROOT } from './lib/env.mjs';
import { readJsonl, sessionSummary, aggregateSessions } from './lib/summary.mjs';
import { CHECKS } from './lib/checks.mjs';
import { JUDGE_DIMS } from './lib/judge.mjs';
import * as E from './engine/index.mjs';
import { page, esc, trendChart, dumbbell, transcriptCol, MODE_LABEL, STATUS_LABEL, DIM_SHORT } from './lib/report_html.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const notesFile = argv[0] && !argv[0].startsWith('--') ? path.resolve(argv[0]) : null;
const N = notesFile ? JSON.parse(fs.readFileSync(notesFile, 'utf8')) : { title: '제안 시뮬레이션 비교', headline: '수정 전 · 후', before: String(arg('before', '')).split(',').filter(Boolean), after: String(arg('after', '')).split(',').filter(Boolean), issues: [], iterations: [], decisions: [] };
const OUT = path.resolve(arg('out', notesFile ? notesFile.replace(/\.notes\.json$/, '.html') : path.join(ROOT, 'reports', 'compare.html')));

// ---------- 데이터 ----------
const runCache = {};
function loadRun(id) {
  if (runCache[id]) return runCache[id];
  const dir = path.join(RUNS, id);
  const run = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
  const hasSessions = run.sessions.some((m) => fs.existsSync(path.join(dir, 'sessions', m.id + '.jsonl')));
  let sessions = null; let events = {};
  if (hasSessions) {
    sessions = run.sessions.map((m) => { const ev = readJsonl(path.join(dir, 'sessions', m.id + '.jsonl')); events[m.id] = ev; return { ...sessionSummary(ev, m), run: id }; });
  } else if (fs.existsSync(path.join(dir, 'summary.json'))) {
    sessions = JSON.parse(fs.readFileSync(path.join(dir, 'summary.json'), 'utf8')).sessions.map((s) => ({ ...s, run: id }));
    events = null;
  }
  runCache[id] = { id, dir, run, sessions, events };
  return runCache[id];
}
const mean = (a) => { const v = a.filter((x) => x != null && Number.isFinite(x)); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const judgeMean = (s) => (s.judge ? mean(Object.values(s.judge.scores)) : null);
const refLeakOf = (ids) => ids.reduce((a, id) => { const R = loadRun(id); if (!R.events) return a; for (const ev of Object.values(R.events)) for (const e of ev) if (e.type === 'turn' && /@\w|\[(product|solution|case)\s*:/.test(e.customer.text)) a++; return a; }, 0);

function group(ids, filter = () => true) {
  const sessions = ids.flatMap((id) => loadRun(id).sessions || []).filter(filter);
  const A = aggregateSessions(sessions);
  const sc = sessions.filter((s) => s.mode === 'scenario' && s.level === 3);
  A.custom = { refLeak: refLeakOf(ids), l3Turns: r1(mean(sc.map((s) => s.turns))) };
  A.sessions = sessions;
  return A;
}
const B = group(N.before); const A = group(N.after);
const runsMeta = [...N.before, ...N.after].map((id) => loadRun(id).run);
const models = runsMeta[runsMeta.length - 1].models;

// ---------- 포맷 ----------
const num = (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(d).replace(/\.0+$/, ''));
const sgn = (v, d = 1) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '±') + num(Math.abs(v), d));
const checkN = (G, id) => { const c = G.checks.find((x) => x.id === id); return c ? c.n : 0; };
/** 지표 하나 → {label, before, after, unit, better} */
function metric(m) {
  if (m.check) return { label: CHECKS[m.check], before: checkN(B, m.check), after: checkN(A, m.check), unit: '건', lower: true, d: 0, code: m.check };
  if (m.crit) return { label: `${m.crit} ${E.critName(m.crit)} — 엔진 − 심사`, before: B.critBias[m.crit].bias, after: A.critBias[m.crit].bias, signed: true, lower: true, abs: true, d: 1 };
  if (m.dim) return { label: `심사 · ${DIM_SHORT[m.dim]}`, before: B.judgeDims[m.dim], after: A.judgeDims[m.dim], unit: '/5', lower: false, d: 1 };
  if (m.total) return { label: m.label, before: B.totals[m.total], after: A.totals[m.total], unit: m.unit || '', lower: !!m.lowerBetter, abs: !!m.abs, signed: m.total === 'calibBias', d: m.unit === '%' ? 1 : 1 };
  if (m.custom) return { label: m.label, before: B.custom[m.custom], after: A.custom[m.custom], unit: m.unit || '건', lower: !!m.lowerBetter, d: 1 };
  return null;
}
function verdict(x) {
  if (x.before == null || x.after == null) return '';
  const b = x.abs ? Math.abs(x.before) : x.before; const a = x.abs ? Math.abs(x.after) : x.after;
  if (Math.abs(a - b) < 1e-9) return 'same';
  return (x.lower ? a < b : a > b) ? 'good' : 'bad';
}
const fmtM = (x, v) => (x.signed ? sgn(v, x.d) : num(v, x.d)) + (x.unit && x.unit !== '건' ? x.unit : x.unit === '건' ? '건' : '');

// ---------- 섹션 ----------
const tilesDef = [
  { k: '엔진 점수 − 독립 심사', b: B.totals.calibBias, a: A.totals.calibBias, f: (v) => sgn(v), lower: true, abs: true, n: `평균 절대 차 ${num(B.totals.calibMae)} → ${num(A.totals.calibMae)}` },
  { k: '근거 없는 고득점', b: checkN(B, 'ungrounded_high'), a: checkN(A, 'ungrounded_high'), f: (v) => v + '건', lower: true, n: '말하지 않은 사례 · 수치 · 제품에 높은 점수' },
  { k: '평가 깨짐 · 내부 표기 노출', b: checkN(B, 'eval_broken') + checkN(B, 'meta_leak') + B.custom.refLeak, a: checkN(A, 'eval_broken') + checkN(A, 'meta_leak') + A.custom.refLeak, f: (v) => v + '건', lower: true, n: `AI 응답 성공 ${num(B.totals.aiRate)}% → ${num(A.totals.aiRate)}%` },
  { k: '우려가 남았는데 성공', b: checkN(B, 'win_open_concern'), a: checkN(A, 'win_open_concern'), f: (v) => v + '건', lower: true, n: `결정 요청 없이 성공 ${checkN(B, 'win_no_ask')} → ${checkN(A, 'win_no_ask')}건` },
  { k: '독립 심사 평균', b: B.totals.judgeAvg, a: A.totals.judgeAvg, f: (v) => (v == null ? '–' : Number(v).toFixed(2)), lower: false, n: '7개 항목 · 5점 만점' },
  { k: '최고 난이도 평균 턴', b: B.custom.l3Turns, a: A.custom.l3Turns, f: (v) => num(v) + '턴', lower: false, n: '스토리라인 담당자 · 까다로운 고객 3명' },
  { k: '고객 대사 평균', b: B.totals.avgReplyChars, a: A.totals.avgReplyChars, f: (v) => v + '자', lower: true, n: `4문장 넘는 대사 ${checkN(B, 'reply_sentences')} → ${checkN(A, 'reply_sentences')}번` },
  { k: '결과 판정 일치', b: B.totals.outcomeAgree, a: A.totals.outcomeAgree, f: (v) => num(v) + '%', lower: false, n: '엔진 성공 · 실패 vs 심사 기대 결과', flat: true },
];
function tile(t) {
  const v = verdict({ before: t.b, after: t.a, lower: t.lower, abs: t.abs });
  const cls = t.flat || v === 'same' ? 'mid' : v === 'good' ? 'good' : 'mid';
  return `<div class="tile ${cls}"><div class="k">${esc(t.k)}</div><div class="v"><span class="was">${esc(t.f(t.b))}</span><span class="arrow">→</span><span>${esc(t.f(t.a))}</span></div><div class="n">${esc(t.n)}</div></div>`;
}

function exampleBlock(ex) {
  if (!ex) return '';
  const R = loadRun(ex.run); if (!R.events) return '';
  const ev = R.events[ex.session] || []; const start = ev.find((e) => e.type === 'start') || {};
  const t = ev.find((e) => e.type === 'turn' && e.n === ex.turn); if (!t) return '';
  const open = (t.concerns || []).filter((c) => !c.resolved).map((c) => (start.concerns.find((x) => x.id === c.id) || {}).text).filter(Boolean);
  return `<div class="after" style="font-family:var(--f-sans)"><span class="muted">수정 전 · ${esc(start.customer)} ${esc(String(start.person).split(' · ')[0])} (${esc(start.levelName)}) #${t.n}</span><br>영업: ${esc(t.seller.text.slice(0, 140))}${t.seller.text.length > 140 ? '…' : ''}<br>고객: “${esc(t.customer.text)}”<br><span class="muted">엔진 판정: 만족도 ${t.ev.satisfaction}(${sgn(t.ev.delta, 0)}) · <b>설득 성공</b> — 남은 우려: ${esc(open.join(' / ') || '-')}</span></div>`;
}
function issueCard(x) {
  const ms = (x.metrics || []).map(metric).filter(Boolean);
  const rows = ms.map((m) => { const v = verdict(m); return `<tr><td>${esc(m.label)}${m.code ? ` <code>${esc(m.code)}</code>` : ''}</td><td class="n muted">${esc(fmtM(m, m.before))}</td><td class="n">${esc(fmtM(m, m.after))}</td><td>${v === 'good' ? '<span class="pill good">개선</span>' : v === 'bad' ? '<span class="pill bad">악화</span>' : '<span class="pill">같음</span>'}</td></tr>`; }).join('');
  return `<article class="issue"><h3><span class="sev ${x.severity}"></span>${esc(x.title)}<span class="pill ${x.severity === 'high' ? 'bad' : 'warn'}">${x.severity === 'high' ? '명확한 성능 저하' : '품질 저하'}</span></h3>
<div><div class="lab">증상</div><p>${esc(x.symptom)}</p></div><div><div class="lab">원인</div><p>${esc(x.cause)}</p></div>
<div style="grid-column:1/-1"><div class="lab">수정</div><p>${esc(x.fix)}</p></div>
${exampleBlock(x.example)}
<div class="tbl" style="grid-column:1/-1"><table><thead><tr><th>지표</th><th class="n">수정 전</th><th class="n">수정 후</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></article>`;
}

// 고객별 추이 (스토리라인 · 숙련 담당자)
const personas = [...new Set(A.sessions.filter((s) => s.mode === 'scenario').map((s) => s.pid))];
function personaCard(pid, mode) {
  const b = B.sessions.find((s) => s.pid === pid && s.mode === mode); const a = A.sessions.find((s) => s.pid === pid && s.mode === mode);
  const s = a || b; if (!s) return '';
  const ST = { won: '성공', lost: '실패', ended: '결론 없음', error: '오류' };
  const line = (x) => (x ? `${ST[x.status] || x.status} ${x.turns}턴 · 만족 ${x.satisfaction ?? '–'} · 품질 ${x.quality ?? '–'}` : '–');
  const exp = (x) => [b && b.judge && a && a.judge ? `심사 ${num(judgeMean(b))} → ${num(judgeMean(a))}` : '', x && x.judge ? '심사가 본 결과: ' + { win: '성공', lose: '실패', undecided: '결정 보류' }[x.judge.expected_outcome] : ''].filter(Boolean).join(' · ');
  return `<div class="pc"><div class="t">${esc(s.customer)} · ${esc(String(s.person || '').split(' · ')[0])}</div><div class="s">${esc(s.indName)} · ${esc(s.levelName)} · ${esc(s.scenario)}</div>
${trendChart({ before: b ? b.trend : null, after: a ? a.trend : null, win: s.win, lose: s.lose, maxN: 14 })}
<div class="ba"><span class="l">전</span><span class="was">${esc(line(b))}</span><span class="l">후</span><span>${esc(line(a))}</span></div><div class="exp">${esc(exp(a))}</div></div>`;
}

// 담당자 유형
const modeOrder = ['scenario', 'expert', 'suggest', 'weak'];
const modeRows = modeOrder.filter((k) => B.modes[k] || A.modes[k]).map((k) => {
  const b = B.modes[k] || {}; const a = A.modes[k] || {};
  const c = (x, y, d = 1) => `<td class="n"><span class="muted">${num(x, d)}</span> → ${num(y, d)}</td>`;
  return `<tr><td>${esc(MODE_LABEL[k] || k)}</td><td class="n"><span class="muted">${b.won ?? '–'}/${b.n ?? '–'}</span> → ${a.won ?? '–'}/${a.n ?? '–'}</td>${c(b.turns, a.turns)}${c(b.satisfaction, a.satisfaction)}${c(b.quality, a.quality)}${c(b.judgeQuality, a.judgeQuality)}${c(b.sellerQ, a.sellerQ)}</tr>`;
}).join('');

// 심사 7항목 · 기준별 치우침
const dimRows = Object.keys(JUDGE_DIMS).map((k) => ({ label: DIM_SHORT[k], before: B.judgeDims[k], after: A.judgeDims[k] }));
const critRows = E.SIM_CRIT.map((id) => ({ label: `${id} ${E.critName(id)}`.slice(0, 16), before: B.critBias[id].bias, after: A.critBias[id].bias }));
const critMax = Math.ceil(Math.max(10, ...critRows.flatMap((r) => [Math.abs(r.before || 0), Math.abs(r.after || 0)])) / 10) * 10;

// 수정 과정
function iterRow(it) {
  const runs = it.runs.filter((id) => fs.existsSync(path.join(RUNS, id, 'run.json')));
  if (!runs.length) return '';
  if (it.abandoned) {
    const r = loadRun(runs[0]).run; const st = r.sessions.map((m) => m.status);
    return `<tr><td><b>${esc(it.label)}</b><div class="muted meta">${esc(runs.join(' + '))}</div></td><td>${esc(it.change)}</td><td colspan="5" class="muted">${esc(it.abandoned)} (성공 ${st.filter((x) => x === 'won').length} · 결론 없음 ${st.filter((x) => x === 'ended').length} · 멈춤 ${st.filter((x) => x === 'paused').length})</td></tr>`;
  }
  const G = group(runs);
  const sc = G.modes.scenario || {}; const sg = G.modes.suggest;
  return `<tr><td><b>${esc(it.label)}</b><div class="muted meta">${esc(runs.join(' + '))}</div></td><td>${esc(it.change)}</td><td class="n">${G.totals.judgeAvg == null ? '–' : G.totals.judgeAvg.toFixed(2)}</td><td class="n">${sgn(G.totals.calibBias)} <span class="muted">(${num(G.totals.calibMae)})</span></td><td class="n">${num(G.totals.outcomeAgree)}%</td><td class="n">${num(sc.turns)} <span class="muted">/ ${num(G.custom.l3Turns)}</span></td><td class="n">${sg ? `${sg.won}/${sg.n}` : '–'}</td></tr>`;
}

// 페르소나 값 실험
let plvLine = '';
if (N.plv && fs.existsSync(path.join(RUNS, N.plv.run, 'run.json'))) {
  const P = group([N.plv.run]); const Q = group([N.plv.base], (s) => s.mode === 'scenario');
  plvLine = `심사 평균 ${num(Q.totals.judgeAvg, 2)} → ${num(P.totals.judgeAvg, 2)}, 페르소나 충실도 ${num(Q.judgeDims.persona_fidelity)} → ${num(P.judgeDims.persona_fidelity)}, 엔진 − 심사 평균 절대 차 ${num(Q.totals.calibMae)} → ${num(P.totals.calibMae)}, 최고 난이도 평균 턴 ${num(Q.custom.l3Turns)} → ${num(P.custom.l3Turns)}이었습니다`;
}
const wins = A.sessions.filter((s) => ['scenario', 'expert'].includes(s.mode) && s.status === 'won');
const fill = (t) => t.replace('{winExpectedWin}', `${wins.filter((s) => s.judge && s.judge.expected_outcome === 'win').length}/${wins.length}`)
  .replace('{suggestJudge}', num(A.modes.suggest && A.modes.suggest.judgeQuality)).replace('{expertJudge}', num(A.modes.expert && A.modes.expert.judgeQuality)).replace('{winRange}', `${Math.min(...wins.map((s) => s.turns))}~${Math.max(...wins.map((s) => s.turns))}`).replace('{plvLine}', plvLine || '(실행 기록 없음)');

// 방법 — 10명
let set = null; try { set = JSON.parse(fs.readFileSync(path.join(ROOT, 'sets', 'diverse10.json'), 'utf8')); } catch (e) { /* noop */ }
const REQ = { new: '신규 도입', renew: '교체 · 갱신', ops: '운영 개선', scale: '확장' };
const personaRows = (set ? set.items : []).map((it) => { const s = A.sessions.find((x) => x.pid === it.pid) || {}; return `<tr><td class="n">${esc(it.pid)}</td><td>${esc(s.customer || '')} · ${esc(s.person || '')}</td><td>${esc(it.indName)}</td><td>${esc(E.LV[it.level].name)}</td><td>${esc(REQ[it.reqType] || it.reqType)}</td><td>${esc(it.scenario)}<div class="muted" style="font-size:12px">${esc((it.why || []).join(' · '))} · 적합도 ${num(it.match)}</div></td></tr>`; }).join('');

// 대화 원문
const tx = personas.map((pid) => {
  const b = B.sessions.find((s) => s.pid === pid && s.mode === 'scenario'); const a = A.sessions.find((s) => s.pid === pid && s.mode === 'scenario');
  const evB = b && loadRun(b.run).events ? loadRun(b.run).events[b.id] : null; const evA = a && loadRun(a.run).events ? loadRun(a.run).events[a.id] : null;
  const s = a || b;
  return `<details class="tx"><summary><b>${esc(s.customer)} · ${esc(String(s.person || '').split(' · ')[0])}</b><span class="muted">${esc(s.levelName)} · ${esc(s.scenario)} · 전 ${esc(STATUS_LABEL[b && b.status] || '-')} ${b ? b.turns : '-'}턴 → 후 ${esc(STATUS_LABEL[a && a.status] || '-')} ${a ? a.turns : '-'}턴</span></summary>
<div class="txs">${evB ? transcriptCol('수정 전', evB) : ''}${evA ? transcriptCol('수정 후', evA) : ''}</div>${a && a.judge ? `<div class="txs"><p class="muted">심사(수정 후): ${esc(a.judge.summary)}</p></div>` : ''}</details>`;
}).join('');

const totalSessions = B.sessions.length + A.sessions.length; const totalTurns = B.totals.turns + A.totals.turns;
const body = `<div class="wrap">
<header class="top"><div class="eyebrow">Winmate v2 · 제안 시뮬레이션 · ${esc(N.date || '')}</div><h1>${esc(N.headline)}</h1>
<p class="lede">${esc(N.lede || '')}</p>
<p class="meta">미팅 ${totalSessions}회 · 고객 턴 ${totalTurns}번 · 고객 · 평가 ${esc(models.customer)} · 영업 ${esc(models.seller)} · 독립 심사 ${esc(models.judge)} · 최대 14턴</p></header>

<section aria-labelledby="h-sum"><h2 id="h-sum">한눈에</h2>
${(N.verdict || []).map((v) => `<p>${esc(v)}</p>`).join('')}
<div class="tiles">${tilesDef.map(tile).join('')}</div>
<p class="meta">왼쪽(취소선)이 수정 전, 오른쪽이 수정 후. 같은 엔진을 다시 돌려도 심사 평균은 ±0.06, 결과 일치는 ±8%p 정도 움직입니다.</p></section>

<section aria-labelledby="h-iss"><h2 id="h-iss">찾은 문제와 고친 것</h2><p class="sub">턴마다 자동 점검(${Object.keys(CHECKS).length}가지)과 세션마다 독립 심사(${esc(models.judge)})로 찾았습니다. 아래 다섯 가지는 앱 엔진(src/sim/engine.js)에서 바로 고쳤습니다.</p>
<div class="issues">${(N.issues || []).map(issueCard).join('')}</div></section>

<section aria-labelledby="h-tr"><h2 id="h-tr">고객별 만족도 추이</h2><p class="sub">같은 고객 · 같은 스토리라인을 수정 전(회색)과 수정 후(파랑)에 각각 진행했습니다. 초록 점선이 성공 기준, 빨간 점선이 실패 기준입니다.</p>
<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><div class="seg" role="radiogroup" aria-label="담당자 유형"><input type="radio" name="v" id="v-scenario" checked><label for="v-scenario">스토리라인 담당자</label><input type="radio" name="v" id="v-expert"><label for="v-expert">숙련 담당자</label></div>
<div class="legend"><span><i class="before"></i>수정 전</span><span><i></i>수정 후</span><span>주황 점 우려 드러남 · 초록 점 우려 해소</span></div></div>
<div class="views"><div class="grid-cards view-scenario">${personas.map((p) => personaCard(p, 'scenario')).join('')}</div><div class="grid-cards view-expert">${personas.map((p) => personaCard(p, 'expert')).join('')}</div></div></section>

<section aria-labelledby="h-mode"><h2 id="h-mode">담당자 유형별</h2><p class="sub">미숙한 담당자(과장 · 일반론 · 서두름)와 추천 답변만 보내는 담당자는 엔진이 잘하는 영업과 못하는 영업을 가려내는지 보려는 대조군입니다.</p>
<div class="tbl"><table><thead><tr><th>담당자</th><th class="n">성공</th><th class="n">평균 턴</th><th class="n">최종 만족도</th><th class="n">품질(엔진)</th><th class="n">품질(심사)</th><th class="n">영업 품질(심사 1~5)</th></tr></thead><tbody>${modeRows}</tbody></table></div></section>

<section aria-labelledby="h-dim"><h2 id="h-dim">독립 심사 7항목</h2><p class="sub">${esc(models.judge)} 가 대화 전체를 읽고 1~5점으로 매겼습니다. 회색 수정 전, 파랑 수정 후.</p>
<div class="tbl" style="padding:8px 4px"><div class="db">${dumbbell(dimRows, { min: 1, max: 5, fmt: (v) => num(v, 1), w: 620 })}</div></div></section>

<section aria-labelledby="h-crit"><h2 id="h-crit">평가 기준별 치우침 (엔진 최종 점수 − 심사 점수)</h2><p class="sub">0 에 가까울수록 엔진 점수가 독립 심사와 맞습니다. +면 엔진이 후하게 줬다는 뜻입니다.</p>
<div class="tbl" style="padding:8px 4px"><div class="db">${dumbbell(critRows, { min: -10, max: critMax, zero: 0, fmt: (v) => sgn(v, 0), w: 620, rowH: 26, labelW: 150 })}</div></div></section>

<section aria-labelledby="h-dec"><h2 id="h-dec">판단이 필요한 것</h2><div class="decide">${(N.decisions || []).map((d, i) => `<div class="d"><b>${i + 1}. ${esc(d.title)}</b><p>${esc(fill(d.body))}</p>${d.options ? `<ul class="plain">${d.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div></section>

<section aria-labelledby="h-it"><h2 id="h-it">수정 과정</h2><p class="sub">매 차수마다 같은 26세션을 다시 돌렸습니다. 마지막 줄은 스토리라인 담당자 10세션만입니다.</p>
<div class="tbl"><table><thead><tr><th>차수</th><th>바꾼 것</th><th class="n">심사 평균</th><th class="n">엔진 − 심사 (절대 차)</th><th class="n">결과 일치</th><th class="n">스토리라인 턴 / 최고 난이도</th><th class="n">추천 답변 대조 성공</th></tr></thead><tbody>${(N.iterations || []).map(iterRow).join('')}</tbody></table></div></section>

<section aria-labelledby="h-how"><h2 id="h-how">어떻게 측정했나</h2>
<ul class="plain"><li>고객 10명: 150명 페르소나에서 업종 · Best Scenario 가 겹치지 않고, 난이도 3 · 4 · 3명, 성별 5 · 5, 요구 유형이 고루 섞이도록 뽑았습니다(sets/diverse10.json).</li>
<li>스토리라인: 고객마다 업종 · 요구 유형 · 전략 · 제품이 가장 잘 맞는 Best Scenario 를 붙이고, 영업 LLM 이 그 단계(오프닝 → 니즈 → 제안 → 근거 → 이의 → 클로징)를 따라 말합니다.</li>
<li>고객 · 평가: 앱의 src/sim 을 그대로 묶어(engine/winmate_sim.mjs) 앱과 같은 프롬프트 · 같은 판정 코드로 돌렸습니다. 매 턴 만족도 · 13개 기준 점수 · 드러난/해소된 우려를 기록합니다.</li>
<li>점검: 턴마다 자동 점검, 세션이 끝나면 다른 모델이 대화 전체를 읽고 독립 심사(7항목 1~5점 + 13기준 0~100 + 기대 결과).</li></ul>
<div class="tbl"><table><thead><tr><th class="n">id</th><th>고객사 · 담당자</th><th>업종</th><th>난이도</th><th>요구</th><th>Best Scenario 스토리라인</th></tr></thead><tbody>${personaRows}</tbody></table></div>
<pre class="cmd">cd poc/test/sim_eval
node run.mjs --tag mytest --modes scenario,expert          # 26세션 · 실시간 기록은 runs/&lt;id&gt;/sessions/*.jsonl
node run.mjs --resume mytest-YYYYMMDD-HHMM                  # 끊긴 실행 이어서
node run.mjs --engine baseline --tag before                 # 수정 전 엔진으로 같은 실험
node compare.mjs reports/20261018.notes.json                # 이 페이지 다시 만들기
# 실시간 보기: poc/test/testbench → '제안 시뮬레이션 · 실성능 검증' 탭</pre></section>

<section aria-labelledby="h-tx"><h2 id="h-tx">대화 원문 (스토리라인 담당자)</h2><p class="sub">고객마다 수정 전 · 후 대화를 나란히 펼칩니다. 턴 아래 숫자는 엔진이 매긴 만족도 · 제안 품질 · 대화 단계입니다.</p>${tx}</section>
</div>`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, page(N.title, body));
if (arg('fragment')) fs.writeFileSync(path.resolve(arg('fragment')), page(N.title, body, true)); // 아티팩트 게시용 본문 조각
const strip = (G) => ({ totals: G.totals, custom: G.custom, modes: G.modes, levels: G.levels, judgeDims: G.judgeDims, critBias: G.critBias, checks: G.checks });
fs.writeFileSync(OUT.replace(/\.html$/, '.json'), JSON.stringify({ notes: notesFile ? path.relative(ROOT, notesFile) : null, before: N.before, after: N.after, B: strip(B), A: strip(A) }, null, 1));
console.log(`■ ${path.relative(process.cwd(), OUT)} · 수정 전 ${B.sessions.length}세션 → 수정 후 ${A.sessions.length}세션 · 심사 ${B.totals.judgeAvg} → ${A.totals.judgeAvg} · 엔진−심사 ${sgn(B.totals.calibBias)} → ${sgn(A.totals.calibBias)}`);
