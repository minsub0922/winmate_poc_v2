// 차트 장 다시 그리기 — 템플릿의 막대 · 도넛은 견본 모양으로 고정돼 있다. 값 칸에 실제 숫자가 들어오면(시장조사로 채운 값 · 사람이 쓴 값)
// 그 숫자대로 막대 높이 · 도넛 조각을 다시 그린다. 값이 숫자가 아니면(자리표시 [00] 등) 견본 모양 그대로 둔다.
// 숫자와 그림이 어긋난 차트는 틀린 차트다 — 그리는 곳(화면 · PPTX 내보내기)은 모두 applyOverrides 를 거치므로 한 곳에서 맞춘다.
//   L_TOC_TRLINE  (업종 트렌드 · 연도별 추이): 값 v0..v5(칸 3,5,…,13) · 연도 y0..y5(칸 4,6,…,14) · 막대는 값 칸 바로 앞의 div
//   L_TOC_TRSHARE (업종 트렌드 · 구성비): 항목 lb0..lb3(칸 4,6,8,10) · 값 vl0..vl3(칸 5,7,9,11) · 도넛 조각은 svg circle 4개
export const CHART_OF = { L_TOC_TRLINE: 'bars', L_TOC_TRSHARE: 'donut' };
/** 레이아웃 HTML의 뿌리에 차트 종류를 표시한다(catalog.js repaired) */
export const markChart = (f, html) => (CHART_OF[f] && typeof html === 'string' && /^<div /.test(html) ? html.replace(/^<div /, `<div data-chart="${CHART_OF[f]}" `) : html);

const KNUM = [['조', 1e12], ['억', 1e8], ['만', 1e4], ['천', 1e3]];
/** '8만7341' · '32.4' · '1,234' · '약 12' · '63.6%' → 숫자. 숫자로 읽을 수 없으면 null */
export function toNumber(text) {
  let t = String(text == null ? '' : text).replace(/[\s,]/g, '').replace(/^(약|대략|거의)/, '').replace(/(%p?|퍼센트)$/, '');
  if (!t) return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const neg = t.startsWith('-'); if (neg) t = t.slice(1);
  let total = 0; let rest = t; let any = false;
  for (const [name, mul] of KNUM) {
    const m = new RegExp('^(\\d+(?:\\.\\d+)?)' + name).exec(rest);
    if (m) { total += Number(m[1]) * mul; rest = rest.slice(m[0].length); any = true; }
  }
  if (rest) { if (!/^\d+(\.\d+)?$/.test(rest)) return null; total += Number(rest); any = true; }
  return any ? (neg ? -total : total) : null;
}

const BAR = { left: 92, width: 712, w: 66, base: 586, max: 310, on: '#1428a0', off: '#c9d2f3', von: '#1428a0', voff: '#3d4452' };
function redrawBars(root) {
  const cols = [];
  for (let i = 0; i < 6; i++) {
    const v = root.querySelector(`[data-tb="${3 + i * 2}"]`); const y = root.querySelector(`[data-tb="${4 + i * 2}"]`);
    const bar = v && v.previousElementSibling;
    if (!v || !y || !bar || bar.hasAttribute('data-tb')) return;
    const text = v.textContent.trim();
    cols.push({ v, y, bar, text, n: toNumber(text) });
  }
  const shown = cols.filter((c) => c.text !== '');
  // 숫자가 아닌 값(자리표시 · 글)이 섞여 있거나 0 이하의 값이 있으면 견본 모양 그대로 둔다
  if (!shown.length || shown.some((c) => c.n == null || !(c.n > 0))) return;
  const max = Math.max(...shown.map((c) => c.n));
  const n = shown.length; const step = BAR.width / n;
  shown.forEach((c, k) => {
    const h = Math.max(6, Math.round((c.n / max) * BAR.max * 10) / 10);
    const left = Math.round((BAR.left + step * k + (step - BAR.w) / 2) * 10) / 10;
    const last = k === n - 1;
    Object.assign(c.bar.style, { left: left + 'px', top: (BAR.base - h) + 'px', height: h + 'px', background: last ? BAR.on : BAR.off, display: '' });
    Object.assign(c.v.style, { left: (left - 20) + 'px', top: (BAR.base - h - 34) + 'px', color: last ? BAR.von : BAR.voff, display: '' });
    Object.assign(c.y.style, { left: (left - 20) + 'px', display: '' });
  });
  for (const c of cols) if (c.text === '') { c.bar.style.display = 'none'; c.v.style.display = 'none'; c.y.style.display = 'none'; }
}

function redrawDonut(root) {
  const circles = Array.from(root.querySelectorAll('svg circle'));
  if (circles.length !== 4) return;
  const items = [];
  for (let k = 0; k < 4; k++) {
    const lb = root.querySelector(`[data-tb="${4 + k * 2}"]`); const vl = root.querySelector(`[data-tb="${5 + k * 2}"]`);
    if (!lb || !vl) return;
    const text = vl.textContent.trim();
    items.push({ lb, vl, c: circles[k], text, n: toNumber(text) });
  }
  const shown = items.filter((x) => x.text !== '');
  if (!shown.length || shown.some((x) => x.n == null || !(x.n > 0))) return;
  // 합이 100%를 넘으면 구성비가 아니다 — 견본 모양 그대로 둔다
  if (shown.reduce((a, x) => a + x.n, 0) > 100.5) return;
  const r = parseFloat(circles[0].getAttribute('r')) || 139; const C = 2 * Math.PI * r;
  let off = 0;
  for (const x of items) {
    // 빈 항목: 조각 · 범례 줄(이름 · 값 · 색 네모 · 줄 배경)을 감춘다
    const sq = x.lb.previousElementSibling; const card = sq && sq.previousElementSibling;
    const row = [x.lb, x.vl, sq && !sq.hasAttribute('data-tb') ? sq : null, card && !card.hasAttribute('data-tb') ? card : null].filter(Boolean);
    if (x.text === '') { x.c.setAttribute('stroke-dasharray', `0 ${C.toFixed(1)}`); for (const el of row) el.style.display = 'none'; continue; }
    for (const el of row) el.style.display = '';
    const len = (C * x.n) / 100;
    x.c.setAttribute('stroke-dasharray', `${len.toFixed(1)} ${(C - len).toFixed(1)}`);
    x.c.setAttribute('stroke-dashoffset', (-off).toFixed(1));
    off += len;
  }
}

/** applyOverrides 가 글 · 그림을 넣은 뒤 부른다 — 차트 장이 아니면 아무것도 하지 않는다. 그리지 못해도 장은 그대로 보여야 하므로 예외를 삼킨다. */
export function redrawChart(root) {
  const kind = root && root.getAttribute && root.getAttribute('data-chart');
  if (!kind) return;
  try { if (kind === 'bars') redrawBars(root); else if (kind === 'donut') redrawDonut(root); } catch (e) { console.error('차트를 다시 그리지 못했어요', e); }
}
