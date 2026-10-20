// 리포트 HTML — 실행 하나(report.html)와 수정 전 · 후 비교(compare.mjs → index.html). 외부 스크립트 없이 한 파일로 열린다.
import fs from 'node:fs';
import path from 'node:path';
import * as E from '../engine/index.mjs';
import { readJsonl } from './summary.mjs';
import { JUDGE_DIMS } from './judge.mjs';
import { CHECKS } from './checks.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(d).replace(/\.0+$/, ''));
const sign = (v, d = 1) => (v == null ? '–' : (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), d));
export const MODE_LABEL = { scenario: '스토리라인 담당자', expert: '숙련 담당자', weak: '미숙한 담당자(대조)', suggest: '추천 답변만(대조)' };
export const STATUS_LABEL = { won: '설득 성공', lost: '미팅 종료', ended: '결론 없음', error: '오류', running: '진행 중', paused: '멈춤', queued: '대기' };
export const DIM_SHORT = { persona_fidelity: '페르소나 충실도', level_fit: '난이도 적합', concern_realism: '숨은 우려 흐름', satisfaction_plausibility: '만족도 변화', score_calibration: '점수 타당성', outcome_plausibility: '결과 판정', reply_naturalness: '대사 자연스러움' };

export const CSS = `
:root {
  /* 검증 리포트 — 한 줄 단 · 요약 숫자 먼저, 차트는 같은 눈금, 대화 원문은 접어서 */
  --bg: #f5f6f9; --surface: #ffffff; --ink: #151a2c; --ink-2: #4e566e; --ink-3: #868ea3; --line: #dde1ea; --line-2: #eceff4;
  --accent: #1f3fbf; --accent-soft: #e7ecfb; --before: #a2a8b8; --good: #13775a; --good-soft: #e1f2ea; --warn: #9c5d00; --warn-soft: #fbf0db; --bad: #b2352b; --bad-soft: #fbe6e3;
  --f-sans: "IBM Plex Sans KR", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif;
  --f-mono: "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0e1220; --surface: #151a2b; --ink: #e8ebf4; --ink-2: #a8b0c5; --ink-3: #6f7891; --line: #273049; --line-2: #1d2438;
  --accent: #91a8ff; --accent-soft: #1e2752; --before: #5f677e; --good: #4fc69a; --good-soft: #12302a; --warn: #e2a64c; --warn-soft: #33270f; --bad: #f07b70; --bad-soft: #3a1a18; color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #0e1220; --surface: #151a2b; --ink: #e8ebf4; --ink-2: #a8b0c5; --ink-3: #6f7891; --line: #273049; --line-2: #1d2438;
  --accent: #91a8ff; --accent-soft: #1e2752; --before: #5f677e; --good: #4fc69a; --good-soft: #12302a; --warn: #e2a64c; --warn-soft: #33270f; --bad: #f07b70; --bad-soft: #3a1a18; color-scheme: dark; }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font: 15px/1.65 var(--f-sans); margin: 0; -webkit-font-smoothing: antialiased; }
.wrap { max-width: 1120px; margin: 0 auto; padding-block: 40px 72px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 44px; }
header.top { display: grid; gap: 10px; }
.eyebrow { font: 600 12px/1.4 var(--f-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--accent); }
h1 { font-size: clamp(26px, 4vw, 36px); line-height: 1.25; margin: 0; letter-spacing: -.02em; text-wrap: balance; font-weight: 700; }
h2 { font-size: 21px; margin: 0; letter-spacing: -.01em; text-wrap: balance; font-weight: 700; }
h3 { font-size: 16px; margin: 0; font-weight: 600; }
p { margin: 0; max-width: 72ch; }
.lede { color: var(--ink-2); font-size: 16px; }
.meta { color: var(--ink-3); font: 12.5px/1.6 var(--f-mono); }
section { display: grid; gap: 16px; min-width: 0; }
section > .sub { color: var(--ink-2); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 6px; align-content: start; min-width: 0; }
.tile .k { font-size: 12.5px; color: var(--ink-2); }
.tile .v { font: 600 22px/1.2 var(--f-mono); font-variant-numeric: tabular-nums; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.tile .v .was { color: var(--ink-3); font-size: 15px; font-weight: 500; text-decoration: line-through; text-decoration-thickness: 1px; }
.tile .v .arrow { color: var(--ink-3); font-size: 14px; }
.tile .n { font-size: 12px; color: var(--ink-3); }
.tile.good { border-color: color-mix(in srgb, var(--good) 35%, var(--line)); }
.tile.mid { border-color: color-mix(in srgb, var(--warn) 35%, var(--line)); }
.tbl { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-size: 13.5px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line-2); vertical-align: top; }
th { font-weight: 600; color: var(--ink-2); font-size: 12.5px; background: color-mix(in srgb, var(--line-2) 60%, transparent); white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
td.n, th.n { text-align: right; font-family: var(--f-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
td .muted, .muted { color: var(--ink-3); }
.pill { display: inline-block; font-size: 12px; line-height: 1.5; padding: 1px 8px; border-radius: 999px; white-space: nowrap; background: var(--line-2); color: var(--ink-2); }
.pill.good { background: var(--good-soft); color: var(--good); } .pill.warn { background: var(--warn-soft); color: var(--warn); } .pill.bad { background: var(--bad-soft); color: var(--bad); } .pill.acc { background: var(--accent-soft); color: var(--accent); }
.sev { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; vertical-align: 1px; }
.sev.high { background: var(--bad); } .sev.mid { background: var(--warn); } .sev.low { background: var(--ink-3); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: var(--ink-2); align-items: center; }
.legend i { display: inline-block; width: 18px; height: 0; border-top: 2.5px solid var(--accent); vertical-align: middle; margin-right: 6px; }
.legend i.before { border-color: var(--before); } .legend i.win { border-top: 1.5px dashed var(--good); }
.grid-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.pc { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px 10px; display: grid; gap: 6px; min-width: 0; }
.pc .t { font-weight: 600; font-size: 14px; }
.pc .s { font-size: 12px; color: var(--ink-2); }
.pc .r { font: 12px/1.5 var(--f-mono); color: var(--ink-2); display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.pc .ba { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; font: 11.5px/1.5 var(--f-mono); color: var(--ink); }
.pc .ba .l { color: var(--ink-3); }
.pc .ba .was { color: var(--ink-3); }
.pc .exp { font-size: 12px; color: var(--ink-2); }
.db { max-width: 760px; }
svg.ch { width: 100%; height: auto; display: block; }
svg .ax { stroke: var(--line); stroke-width: 1; }
svg .grid { stroke: var(--line-2); stroke-width: 1; }
svg .lbl { fill: var(--ink-3); font: 10px var(--f-mono); }
svg .lbl2 { fill: var(--ink-2); font: 11.5px var(--f-sans); }
svg .ln-b { fill: none; stroke: var(--before); stroke-width: 2; stroke-linejoin: round; }
svg .ln-a { fill: none; stroke: var(--accent); stroke-width: 2.4; stroke-linejoin: round; }
svg .ln-q { fill: none; stroke: var(--ink-3); stroke-width: 1.4; stroke-dasharray: 4 3; }
svg .win { stroke: var(--good); stroke-width: 1; stroke-dasharray: 3 3; }
svg .lose { stroke: var(--bad); stroke-width: 1; stroke-dasharray: 3 3; opacity: .6; }
svg .dot-b { fill: var(--before); } svg .dot-a { fill: var(--accent); } svg .dot-won { fill: var(--good); } svg .dot-lost { fill: var(--bad); }
svg .rv { fill: var(--warn); } svg .rs { fill: var(--good); }
svg .zero { stroke: var(--ink-3); stroke-width: 1; }
svg .bar-b { stroke: var(--before); stroke-width: 6; stroke-linecap: round; }
svg .conn { stroke: var(--line); stroke-width: 2; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--surface); }
.seg label { padding: 6px 12px; font-size: 13px; cursor: pointer; color: var(--ink-2); }
.seg input { position: absolute; opacity: 0; pointer-events: none; }
.seg input:checked + label { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.seg input:focus-visible + label { outline: 2px solid var(--accent); outline-offset: -2px; }
.view-expert { display: none; }
section:has(#v-expert:checked) .view-expert { display: grid; }
section:has(#v-expert:checked) .view-scenario { display: none; }
.issues { display: grid; gap: 10px; }
.issue { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px 22px; }
.issue h3 { grid-column: 1 / -1; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.issue .lab { font-size: 11.5px; letter-spacing: .06em; color: var(--ink-3); text-transform: uppercase; font-family: var(--f-mono); }
.issue p { font-size: 14px; color: var(--ink-2); }
.issue .after { grid-column: 1 / -1; font: 13px/1.6 var(--f-mono); color: var(--ink); background: var(--line-2); border-radius: 6px; padding: 6px 10px; }
@media (max-width: 720px) { .issue { grid-template-columns: minmax(0, 1fr); } }
.decide { display: grid; gap: 10px; }
.decide .d { border-left: 3px solid var(--warn); background: var(--surface); padding: 12px 16px; border-radius: 0 10px 10px 0; display: grid; gap: 6px; }
.decide .d b { font-weight: 600; }
.decide .d p { color: var(--ink-2); font-size: 14px; }
details.tx { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; }
details.tx > summary { cursor: pointer; padding: 12px 16px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; list-style: none; }
details.tx > summary::-webkit-details-marker { display: none; }
details.tx > summary::before { content: "▸"; color: var(--ink-3); }
details.tx[open] > summary::before { content: "▾"; }
details.tx > summary:focus-visible { outline: 2px solid var(--accent); }
.txs { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; padding: 0 16px 16px; }
.txc { min-width: 0; display: grid; gap: 8px; align-content: start; }
.txc > h4 { margin: 0; font-size: 13px; color: var(--ink-2); font-weight: 600; }
.turn { display: grid; gap: 4px; padding: 8px 10px; border-radius: 8px; background: var(--line-2); font-size: 13px; }
.turn .who { font: 600 11px var(--f-mono); color: var(--ink-3); letter-spacing: .04em; }
.turn .me { color: var(--ink); }
.turn .cu { color: var(--ink); border-left: 2px solid var(--accent); padding-left: 8px; }
.turn .ev { font: 11.5px/1.5 var(--f-mono); color: var(--ink-2); display: flex; gap: 4px 10px; flex-wrap: wrap; }
.up { color: var(--good); } .down { color: var(--bad); }
code { font-family: var(--f-mono); font-size: 12.5px; background: var(--line-2); padding: 1px 5px; border-radius: 4px; }
pre.cmd { font: 12.5px/1.6 var(--f-mono); background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; overflow-x: auto; margin: 0; }
ul.plain { margin: 0; padding-left: 18px; color: var(--ink-2); font-size: 14px; display: grid; gap: 4px; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
`;
export const HEAD = (title) => `<title>${esc(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap">
<style>${CSS}</style>`;

/** 파일로 열 때는 완전한 문서로, 아티팩트로 올릴 때는 본문 조각(fragment)으로 */
export const page = (title, body, fragment = false) => (fragment ? `${HEAD(title)}\n${body}` : `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${HEAD(title)}\n</head><body>\n${body}\n</body></html>\n`);

/** 만족도 추이 — before(회색) · after(파랑) 를 같은 눈금에. trend: [{n, sat, q, rv, rs, end}] */
export function trendChart({ before = null, after = null, win, lose, maxN = 14, w = 300, h = 132, quality = false, marks = true }) {
  const L = 26, R = 8, T = 8, B = 20;
  const n = Math.max(maxN, ...(before || []).map((t) => t.n), ...(after || []).map((t) => t.n), 1);
  const x = (i) => L + ((w - L - R) * i) / n; const y = (v) => T + ((h - T - B) * (100 - v)) / 100;
  const pathOf = (tr, key) => tr.filter((t) => t[key] != null).map((t, i) => `${i ? 'L' : 'M'}${x(t.n).toFixed(1)},${y(t[key]).toFixed(1)}`).join('');
  let s = `<svg class="ch" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(`만족도 추이${before ? ' 수정 전 ' + before.map((t) => t.sat).join('→') : ''}${after ? ' 수정 후 ' + after.map((t) => t.sat).join('→') : ''}`)}">`;
  for (const v of [0, 50, 100]) s += `<line class="grid" x1="${L}" x2="${w - R}" y1="${y(v)}" y2="${y(v)}"/><text class="lbl" x="${L - 5}" y="${y(v) + 3}" text-anchor="end">${v}</text>`;
  if (win != null) s += `<line class="win" x1="${L}" x2="${w - R}" y1="${y(win)}" y2="${y(win)}"/>`;
  if (lose != null) s += `<line class="lose" x1="${L}" x2="${w - R}" y1="${y(lose)}" y2="${y(lose)}"/>`;
  for (const t of [0, Math.round(n / 2), n]) s += `<text class="lbl" x="${x(t)}" y="${h - 5}" text-anchor="middle">${t}${t === n ? '턴' : ''}</text>`;
  const endDot = (tr, cls) => { const t = tr[tr.length - 1]; if (!t) return ''; const c = t.end === 'win' ? 'dot-won' : t.end === 'lose' ? 'dot-lost' : cls; return `<circle class="${c}" cx="${x(t.n)}" cy="${y(t.sat)}" r="3.6"/>`; };
  if (quality && after) { const q = pathOf(after, 'q'); if (q) s += `<path class="ln-q" d="${q}"/>`; }
  if (before && before.length) s += `<path class="ln-b" d="${pathOf(before, 'sat')}"/>` + endDot(before, 'dot-b');
  if (after && after.length) {
    s += `<path class="ln-a" d="${pathOf(after, 'sat')}"/>`;
    if (marks) for (const t of after) { if ((t.rv || []).length) s += `<circle class="rv" cx="${x(t.n)}" cy="${y(t.sat)}" r="2.6"/>`; if ((t.rs || []).length) s += `<circle class="rs" cx="${x(t.n)}" cy="${y(t.sat)}" r="2.6"/>`; }
    s += endDot(after, 'dot-a');
  }
  return s + '</svg>';
}

/** 전후 아령 차트 — rows: [{label, before, after}] on [min, max] */
export function dumbbell(rows, { min, max, w = 560, rowH = 30, fmt = (v) => num(v), zero = null, labelW = 128 }) {
  const L = labelW, R = 46, T = 6, H = T + rows.length * rowH + 22;
  const x = (v) => L + ((w - L - R) * (v - min)) / (max - min);
  let s = `<svg class="ch" viewBox="0 0 ${w} ${H}" role="img" aria-label="${esc(rows.map((r) => `${r.label} ${fmt(r.before)}→${fmt(r.after)}`).join(', '))}">`;
  const ticks = []; const step = (max - min) / 4; for (let i = 0; i <= 4; i++) ticks.push(min + step * i);
  for (const t of ticks) s += `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H - 18}"/><text class="lbl" x="${x(t)}" y="${H - 5}" text-anchor="middle">${fmt(t)}</text>`;
  if (zero != null) s += `<line class="zero" x1="${x(zero)}" x2="${x(zero)}" y1="${T}" y2="${H - 18}"/>`;
  rows.forEach((r, i) => {
    const cy = T + i * rowH + rowH / 2;
    s += `<text class="lbl2" x="${L - 10}" y="${cy + 4}" text-anchor="end">${esc(r.label)}</text>`;
    if (r.before != null && r.after != null) s += `<line class="conn" x1="${x(r.before)}" x2="${x(r.after)}" y1="${cy}" y2="${cy}"/>`;
    if (r.before != null) s += `<circle class="dot-b" cx="${x(r.before)}" cy="${cy}" r="5"/>`;
    if (r.after != null) s += `<circle class="dot-a" cx="${x(r.after)}" cy="${cy}" r="5.5"/><text class="lbl" x="${w - R + 8}" y="${cy + 4}">${fmt(r.after)}</text>`;
  });
  return s + '</svg>';
}

export function transcriptCol(title, events) {
  const start = events.find((e) => e.type === 'start') || {};
  const end = events.find((e) => e.type === 'end');
  const turns = events.filter((e) => e.type === 'turn');
  let h = `<div class="txc"><h4>${esc(title)} · ${esc(end ? STATUS_LABEL[end.status] || end.status : '')} · ${turns.length ? turns.length - 1 : 0}턴</h4>`;
  for (const t of turns) {
    const ev = t.ev; const cc = (id) => { const c = (start.concerns || []).find((x) => x.id === id); return c ? c.text.slice(0, 22) : id; };
    h += `<div class="turn">`;
    if (t.seller) h += `<div class="who">#${t.n} 영업</div><div class="me">${esc(t.seller.text)}</div>`;
    h += `<div class="who">${t.n ? '' : '#0 '}고객</div><div class="cu">${esc(t.customer.text)}</div>`;
    h += `<div class="ev"><span>만족 ${ev.satisfaction}${t.n ? ` <span class="${ev.delta > 0 ? 'up' : ev.delta < 0 ? 'down' : ''}">${sign(ev.delta, 0)}</span>` : ''}</span><span>품질 ${ev.quality ?? '–'}</span><span>${esc(ev.stage)}</span>`
      + ev.revealed.map((id) => `<span class="pill warn">드러남 · ${esc(cc(id))}</span>`).join('') + ev.resolved.map((id) => `<span class="pill good">해소 · ${esc(cc(id))}</span>`).join('')
      + (ev.end ? `<span class="pill ${ev.end === 'win' ? 'good' : 'bad'}">${ev.end === 'win' ? '설득 성공' : '미팅 종료'}</span>` : '') + (t.customer.note ? `<span class="pill bad">${esc(t.customer.note)}</span>` : '') + `</div></div>`;
  }
  return h + '</div>';
}

/** 실행 하나의 리포트 (report.html) */
export function renderHtml(S, dir) {
  const r = S.run; const t = S.totals;
  const tiles = [
    ['끝난 세션', `${t.done}/${t.sessions}`, `고객 턴 ${t.turns}번`],
    ['AI 응답 성공', `${num(t.aiRate)}%`, '규칙 대체 · 평가 깨짐 없는 턴'],
    ['엔진 − 독립 심사 점수', sign(t.calibBias), `평균 절대 차 ${num(t.calibMae)}`],
    ['독립 심사 평균', `${t.judgeAvg == null ? '–' : t.judgeAvg.toFixed(2)} / 5`, '7개 항목'],
    ['고객 대사 평균', `${t.avgReplyChars}자`, `응답 ${(t.avgCustMs / 1000).toFixed(1)}초`],
  ];
  const modeRows = Object.entries(S.modes).map(([k, m]) => `<tr><td>${esc(MODE_LABEL[k] || k)}</td><td class="n">${m.n}</td><td class="n">${m.won}</td><td class="n">${m.lost}</td><td class="n">${m.ended}</td><td class="n">${num(m.turns)}</td><td class="n">${num(m.satisfaction)}</td><td class="n">${num(m.quality)}</td><td class="n">${num(m.judgeQuality)}</td></tr>`).join('');
  const cards = S.sessions.map((s) => `<div class="pc"><div class="t">${esc(s.customer)} ${esc(String(s.person || '').split(' · ')[0])}</div><div class="s">${esc(s.levelName)} · ${esc(MODE_LABEL[s.mode] || s.mode)} · ${esc(s.scenario)}</div>${trendChart({ after: s.trend, win: s.win, lose: s.lose, maxN: r.turns || 14, quality: true })}<div class="r"><span>${esc(STATUS_LABEL[s.status] || s.status)} · ${s.turns}턴</span><span>만족 ${s.satisfaction ?? '–'} · 품질 ${s.quality ?? '–'}</span><span>${s.judge ? '심사 ' + num(Object.values(s.judge.scores).filter((v) => v != null).reduce((a, b, _, arr) => a + b / arr.length, 0), 1) : ''}</span></div></div>`).join('');
  const checks = S.checks.map((c) => `<tr><td>${esc(c.label || CHECKS[c.id] || c.id)} <code>${esc(c.id)}</code></td><td><span class="pill ${c.level === 'fail' ? 'bad' : 'warn'}">${c.level}</span></td><td class="n">${c.n}</td><td class="n">${c.sessions}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">걸린 점검 없음</td></tr>';
  const dims = Object.entries(S.judgeDims).map(([k, v]) => ({ label: DIM_SHORT[k] || k, before: null, after: v }));
  const tx = S.sessions.map((s) => { const ev = readJsonl(path.join(dir, 'sessions', s.id + '.jsonl')); return `<details class="tx"><summary><b>${esc(s.customer)} ${esc(String(s.person || '').split(' · ')[0])}</b><span class="muted">${esc(s.levelName)} · ${esc(MODE_LABEL[s.mode] || s.mode)} · ${esc(STATUS_LABEL[s.status] || s.status)}</span></summary><div class="txs">${transcriptCol(s.id, ev)}</div>${s.judge ? `<div class="txs"><p class="muted">심사: ${esc(s.judge.summary)}</p></div>` : ''}</details>`; }).join('');
  return page('시뮬레이션 실행 ' + r.id, `<div class="wrap">
<header class="top"><div class="eyebrow">제안 시뮬레이션 실성능 검증 · 실행 기록</div><h1>${esc(r.id)}</h1>
<p class="meta">고객 · 평가 ${esc(r.models.customer)} · 영업 ${esc(r.models.seller)} · 심사 ${esc(r.models.judge || '-')} · 엔진 ${esc((r.engine && (r.engine.label || r.engine.which)) || '-')} · 최대 ${r.turns}턴${r.personaLevel ? ' · 페르소나 고유 난이도 값 전달' : ''}</p>${r.note ? `<p class="lede">${esc(r.note)}</p>` : ''}</header>
<section><div class="tiles">${tiles.map(([k, v, n]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="n">${n}</div></div>`).join('')}</div></section>
<section><h2>담당자 유형별</h2><div class="tbl"><table><thead><tr><th>유형</th><th class="n">세션</th><th class="n">성공</th><th class="n">실패</th><th class="n">결론 없음</th><th class="n">평균 턴</th><th class="n">최종 만족도</th><th class="n">품질(엔진)</th><th class="n">품질(심사)</th></tr></thead><tbody>${modeRows}</tbody></table></div></section>
<section><h2>세션별 만족도 추이</h2><div class="legend"><span><i></i>만족도</span><span><i class="before" style="border-top-style:dashed"></i>제안 품질</span><span><i class="win"></i>성공 기준</span><span>주황 점 우려 드러남 · 초록 점 우려 해소</span></div><div class="grid-cards">${cards}</div></section>
<section><h2>독립 심사 (1~5)</h2>${dumbbell(dims, { min: 1, max: 5, fmt: (v) => num(v, 1) })}</section>
<section><h2>자동 점검</h2><div class="tbl"><table><thead><tr><th>점검</th><th>수준</th><th class="n">횟수</th><th class="n">세션</th></tr></thead><tbody>${checks}</tbody></table></div></section>
<section><h2>대화 기록</h2>${tx}</section>
</div>`);
}
