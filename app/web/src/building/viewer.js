// 내보낸 HTML의 3D 건물 보기 — 건물 스튜디오 「HTML 추출」로 만든 파일이 이 화면을 연다(편집 없이 보기만)
// 파일 = 이 모듈 전체(three.js 포함 — 앱 페이지의 #wm-bld-js 그대로) + 그 건물에 쓴 공간 조감도 데이터만 + 아래 CSS · 시작 스크립트.
// 인터넷 없이도 열린다(글꼴만 Google Fonts — 없으면 시스템 글꼴).
import { data } from './data.js';
import { Stage, shapeOf } from './render.js';
import { kitOf } from './facade.js';
import { h, icon } from './dom.js';

const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

export const VIEWER_CSS = `
:root{color-scheme:light dark;--surface:#fff;--surface-2:#f7f8fa;--surface-3:#eef0f4;--ink:#121417;--ink-2:#3d4452;--muted:#596170;--faint:#6e7686;--line:#e2e5ea;--line-2:#d3d8e0;--accent:#1428a0;--accent-soft:#eaeefb;--accent-line:#c5cdf2;--on-accent:#fff;--shadow:0 1px 2px rgba(16,24,40,.05),0 4px 14px rgba(16,24,40,.08)}
@media (prefers-color-scheme:dark){:root{--surface:#161a21;--surface-2:#1b2029;--surface-3:#222833;--ink:#e8ebf1;--ink-2:#c3c9d4;--muted:#a2aab8;--faint:#8e97a7;--line:#2a303b;--line-2:#363d4a;--accent:#93a6ff;--accent-soft:#1e2546;--accent-line:#3b4783;--on-accent:#0b1030;--shadow:0 1px 2px rgba(0,0,0,.3),0 6px 18px rgba(0,0,0,.35)}}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--surface-2);color:var(--ink);font-family:'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
button{font:inherit;color:inherit}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.bv{position:fixed;inset:0;display:flex;flex-direction:column}
.bv-boot{margin:auto;padding:30px;font-size:13px;color:var(--muted);text-align:center}
.bv-top{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px 20px;padding:14px 20px;background:var(--surface);border-bottom:1px solid var(--line)}
.bv-title{min-width:0}
.bv-title h1{margin:0;font-size:17px;font-weight:800;letter-spacing:-.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bv-title p{margin:4px 0 0;font-size:11.5px;color:var(--muted)}
.bv-tools{display:flex;align-items:center;gap:4px}
.bv-seg{display:flex;gap:3px;padding:3px;margin-right:8px;background:var(--surface-2);border:1px solid var(--line);border-radius:8px}
.bv-seg button{border:0;background:none;color:var(--muted);font-size:12px;font-weight:700;border-radius:6px;padding:6px 12px;cursor:pointer;white-space:nowrap}
.bv-seg button[aria-pressed=true]{background:var(--accent-soft);color:var(--accent)}
.bv-icon{display:grid;place-items:center;width:34px;height:34px;flex-shrink:0;border:1px solid transparent;border-radius:8px;background:none;color:var(--ink-2);cursor:pointer}
.bv-icon:hover{background:var(--surface-2);border-color:var(--line)}
.bv-view{position:relative;flex:1;min-height:0;overflow:hidden;isolation:isolate}
.bv-host{position:absolute;inset:0;touch-action:none}
.bv-host canvas{display:block;width:100%;height:100%;outline:none;cursor:grab}
.bv-host canvas:active{cursor:grabbing}
.bv-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.bv-floor-label{position:absolute;display:flex;align-items:center;gap:7px;max-width:260px;transform:translate(-100%,-50%);border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink-2);padding:4px 10px 4px 5px;box-shadow:var(--shadow);font-size:11.5px;font-weight:700;white-space:nowrap;pointer-events:auto;cursor:pointer}
.bv-floor-label.is-in{transform:translate(0,-50%)}
.bv-floor-label span{overflow:hidden;text-overflow:ellipsis}
.bv-floor-label b,.bv-card-head b{flex-shrink:0;font-size:10.5px;font-weight:800;line-height:1.5;color:var(--on-accent);background:var(--accent);border-radius:5px;padding:1px 6px}
.bv-floor-label:hover{border-color:var(--accent-line);color:var(--accent)}
.bv-room-label{position:absolute;display:flex;align-items:center;gap:5px;transform:translate(-50%,-50%);border:1px solid var(--line);border-radius:5px;background:var(--surface);color:var(--muted);padding:3px 7px;box-shadow:var(--shadow);font-size:10px;font-weight:600;white-space:nowrap}
.bv-room-label b{font-size:9px;font-weight:800;color:var(--faint)}
.bv-card{position:absolute;top:14px;right:14px;z-index:2;width:min(300px,calc(100% - 28px));max-height:calc(100% - 28px);overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:11px 10px 8px 14px}
.bv-card[hidden]{display:none}
.bv-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.bv-card-head>div{display:flex;align-items:center;gap:8px;min-width:0}
.bv-card-head strong{font-size:14px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bv-card-head .bv-icon{width:28px;height:28px}
.bv-card-sub{margin:3px 0 8px;font-size:11px;line-height:1.5;color:var(--muted)}
.bv-card ol{list-style:none;margin:0;padding:8px 0 0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:1px}
.bv-card li{display:flex;gap:9px;padding:4px 0}
.bv-card li>span:first-child{font-size:10px;font-weight:800;color:var(--faint);padding-top:2px}
.bv-card li b{display:block;font-size:12px;font-weight:700}
.bv-card li small{display:block;font-size:10.5px;line-height:1.5;color:var(--muted)}
.bv-help{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);border:1px solid var(--line);background:var(--surface);border-radius:20px;padding:6px 13px;color:var(--muted);font-size:10.5px;white-space:nowrap;pointer-events:none;transition:opacity .4s}
.bv-help.is-gone{opacity:0}
.bv-credit{position:absolute;right:14px;bottom:12px;font-size:10px;color:var(--faint);pointer-events:none}
.bv-strip{display:flex;align-items:center;gap:6px;padding:10px 16px;background:var(--surface);border-top:1px solid var(--line);overflow-x:auto;scrollbar-width:thin}
.bv-strip button{display:inline-flex;align-items:center;gap:6px;flex-shrink:0;height:34px;border:1px solid var(--line);border-radius:7px;padding:0 11px;background:var(--surface);color:var(--muted);font-size:11.5px;font-weight:600;white-space:nowrap;cursor:pointer}
.bv-strip button:hover{border-color:var(--accent-line);color:var(--ink)}
.bv-strip button[aria-pressed=true]{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent);font-weight:700}
.bv-strip b{font-size:10px;font-weight:800;opacity:.7}
@media (max-width:700px){.bv-top{padding:12px 14px}.bv-tools{width:100%}.bv-seg{margin-right:auto}.bv-help,.bv-credit{display:none}.bv-card{top:10px;right:10px;width:calc(100% - 20px);max-height:46%}.bv-floor-label{font-size:10.5px;padding:3px 8px 3px 4px}}
`;

// 그 건물에 쓴 템플릿 · 자산 · 레시피만 (자산 번호는 새로 매김, 지붕 실외기 자산은 늘 포함)
export function dataSubset(floors) {
  const R = data().raw;
  const ids = [...new Set(floors.map((f) => (typeof f === 'string' ? f : f.tpl)).filter(Boolean))];
  const tpls = ids.map((id) => R.tpl.find((t) => t.id === id)).filter(Boolean);
  const used = new Set();
  for (const t of tpls) for (const o of t.objs) used.add(o[0]);
  const dvm = R.assets.findIndex((a) => a.id === 'product:dvms2');
  if (dvm >= 0) used.add(dvm);
  const order = [...used].sort((a, b) => a - b);
  const remap = new Map(order.map((k, i) => [k, i]));
  const assets = order.map((k) => R.assets[k]);
  const recipes = {};
  for (const a of assets) if (a && a.r && R.recipes[a.r]) recipes[a.r] = R.recipes[a.r];
  return {
    v: R.v, src: R.src, styles: R.styles, ind: R.ind, recipes, assets,
    tpl: tpls.map((t) => ({ ...t, objs: t.objs.map((o) => [remap.get(o[0]), ...o.slice(1)]) })),
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// <script> 안에 넣어도 안전한 JSON (</script · 줄 구분 문자 막기)
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// 내보낼 HTML 한 장 — js = 모듈 원문(window.__wmBldBoot=…), cfg = { title, floors:[{tpl(없으면 빈 층), fv, ind, w, d}], mode, camera, at }
export function exportDoc({ js, cfg }) {
  const boot = `(function(){var c=${safeJson(cfg)},a=document.getElementById('app');` +
    `function fail(e){a.innerHTML='';var d=document.createElement('div');d.className='bv-boot';d.textContent='3D 건물을 열지 못했어요 · '+(e&&e.message||e);a.appendChild(d)}` +
    `function go(){try{var m=window.__wmBldBoot();m.ready().then(function(){m.viewer(a,c)}).catch(fail)}catch(e){fail(e)}}` +
    `var f=document.fonts&&document.fonts.load?document.fonts.load('700 80px "Noto Sans KR"'):Promise.resolve();` +
    `Promise.race([f,new Promise(function(r){setTimeout(r,1800)})]).then(go,go)})();`;
  return '<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${esc(cfg.title)} · 건물 조감도</title><meta name="generator" content="Winmate 건물 조감도">` +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;800&display=swap">' +
    `<style>${VIEWER_CSS}</style></head><body><div id="app" class="bv"><div class="bv-boot">3D 건물을 여는 중…</div></div>\n` +
    `<script id="wm-bld-data" type="application/json">${safeJson(dataSubset(cfg.floors))}</script>\n` +
    `<script>${js}</script>\n<script>${boot}</script>\n</body></html>\n`;
}

// ---------- 보기 화면 ----------
export function viewer(root, cfg = {}) {
  const D = data();
  // 층 = 껍데기(외벽 업종 · 크기) + 안(공간 조감도, 없으면 빈 층)
  const floors = (cfg.floors || []).map((f) => (typeof f === 'string' ? { tpl: f, fv: 0 } : { ...f, fv: f.fv || 0 })).filter((f) => shapeOf(f));
  const shapes = floors.map(shapeOf);
  const title = String(cfg.title || '').trim() || '건물 조감도';
  let mode = cfg.mode === 'spread' ? 'spread' : 'exterior', stage = null;
  let rooms = 0, area = 0;
  const inds = [];
  for (const s of shapes) { if (s.t) rooms += s.t.rooms.length; area += s.w * s.d; const c = s.t ? s.t.ind : s.ind; if (!inds.includes(c)) inds.push(c); }
  const nameOf = (s) => s.signName || (s.t ? s.t.short : '빈 층'); // 층 이름 > 넣은 공간 > 빈 층
  const sizeOf = (s) => `${Math.round(s.w)}×${Math.round(s.d)}m`;

  const host = h('div', { class: 'bv-host' });
  const labels = h('div', { class: 'bv-labels' });
  const card = h('aside', { class: 'bv-card', hidden: true, 'aria-live': 'polite' });
  const help = h('div', { class: 'bv-help', text: '드래그로 회전 · 휠로 확대 · 층을 누르면 내부' });
  const credit = h('div', { class: 'bv-credit', text: 'Winmate 건물 조감도' + (cfg.at ? ' · ' + new Date(cfg.at).toLocaleDateString('ko-KR') : '') });
  const view = h('div', { class: 'bv-view' }, host, labels, card, help, credit);
  const strip = h('nav', { class: 'bv-strip', 'aria-label': '층' });
  const extBtn = h('button', { type: 'button', 'aria-pressed': String(mode === 'exterior'), onclick: () => setMode('exterior') }, '외관 보기');
  const spreadBtn = h('button', { type: 'button', 'aria-pressed': String(mode === 'spread'), onclick: () => setMode('spread') }, '펼쳐 보기');
  const head = h('header', { class: 'bv-top' },
    h('div', { class: 'bv-title' },
      h('h1', { text: title }),
      h('p', { text: `지상 ${floors.length}층 · ${rooms}개 공간 · 연면적 ${fmt(area)}㎡` + (inds.length ? ' · ' + inds.map((c) => (D.indName[c] || c).split(' · ')[0]).join(' · ') : '') })),
    h('div', { class: 'bv-tools' },
      h('div', { class: 'bv-seg', role: 'group', 'aria-label': '보기' }, extBtn, spreadBtn),
      h('button', { class: 'bv-icon', type: 'button', 'aria-label': '왼쪽으로 돌리기', title: '왼쪽으로 돌리기', onclick: () => stage && stage.rotate(-45) }, icon('rotL', 17)),
      h('button', { class: 'bv-icon', type: 'button', 'aria-label': '오른쪽으로 돌리기', title: '오른쪽으로 돌리기', onclick: () => stage && stage.rotate(45) }, icon('rotR', 17)),
      h('button', { class: 'bv-icon', type: 'button', 'aria-label': '처음 시점으로', title: '처음 시점으로', onclick: () => stage && stage.resetView() }, icon('refresh', 16))));
  root.classList.add('bv');
  root.replaceChildren(head, view, strip);
  document.title = title + ' · 건물 조감도';

  function renderStrip() {
    const f0 = stage ? stage.focus : null;
    strip.replaceChildren(
      h('button', { type: 'button', 'aria-pressed': String(f0 === null), onclick: () => focus(null) }, icon('building', 14), '전체 건물'),
      ...shapes.map((s, i) => h('button', { type: 'button', 'aria-pressed': String(f0 === i), title: s.t ? `${s.t.short} · ${s.t.name}` : `빈 층 · ${sizeOf(s)}`, onclick: () => focus(f0 === i ? null : i) }, h('b', { text: i + 1 + 'F' }), nameOf(s))));
    const cur = strip.querySelector('[aria-pressed=true]');
    cur && cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function focus(i) {
    if (!stage) return;
    stage.reserveRight = 300 + 28;
    stage.setFocus(i, true);
    renderStrip(); updateCard();
  }
  // 층 카드 — 층 이름 · 공간 조합 · 외벽 · 공간 목록
  function updateCard() {
    const i = stage ? stage.focus : null;
    if (i === null || !floors[i]) { card.hidden = true; return; }
    const f = floors[i], s = shapes[i], t = s.t;
    card.hidden = false;
    card.replaceChildren(...[
      h('div', { class: 'bv-card-head' },
        h('div', null, h('b', { text: i + 1 + 'F' }), h('strong', { text: nameOf(s) })),
        h('button', { class: 'bv-icon', type: 'button', 'aria-label': '전체 건물 보기', onclick: () => focus(null) }, icon('x', 15))),
      h('p', { class: 'bv-card-sub', text: (t ? t.name + ' · ' : '') + `${sizeOf(s)} · ${fmt(s.w * s.d)}㎡ · 외벽 ${kitOf(s.ind, f.fv).label}` }),
      t && h('ol', null, t.rooms.map((r, k) => h('li', null,
        h('span', { text: String(k + 1).padStart(2, '0') }),
        h('span', null, h('b', { text: r[1] }), h('small', { text: (t.roomProducts[k] || []).slice(0, 2).map(([n, c]) => n.replace(/\s*\(.*?\)\s*/g, ' ').trim() + (c > 1 ? ' ×' + c : '')).join(' · ') || (r[7] ? '실외 공간' : '가구 중심 공간') })))))].filter(Boolean));
  }
  // 이름표 — 층(왼쪽 바깥) · 고른 층의 공간
  let lastKey = '';
  function updateLabels() {
    if (!stage) return;
    const { floors: fa, rooms: ra } = stage.anchors();
    const key = fa.map((a) => `${a.x | 0},${a.y | 0},${a.alpha > 0.5 ? 1 : 0}`).join('|') + '#' + ra.map((r) => `${r.x | 0},${r.y | 0}`).join('|') + '#' + stage.focus;
    if (key === lastKey) return;
    lastKey = key;
    const fl = stage.focus !== null ? [] : fa.map((a) => {
      const n = nameOf(shapes[a.i]), inside = a.x - 12 < 150;
      return h('button', { type: 'button', class: 'bv-floor-label' + (inside ? ' is-in' : ''), style: { left: (inside ? a.x + 12 : a.x - 12) + 'px', top: a.y + 'px' }, 'aria-label': `${a.i + 1}층 ${n} 자세히 보기`, onclick: () => focus(a.i) },
        h('b', { text: a.i + 1 + 'F' }), h('span', { text: n }));
    });
    const rl = ra.filter((r) => r.visible && r.x > 0 && r.x < stage.w).map((r) => h('span', { class: 'bv-room-label', style: { left: r.x + 'px', top: r.y + 'px' } }, h('b', { text: String(r.k + 1).padStart(2, '0') }), r.name));
    labels.replaceChildren(...fl, ...rl);
  }
  function setMode(m) {
    mode = m;
    extBtn.setAttribute('aria-pressed', String(m === 'exterior'));
    spreadBtn.setAttribute('aria-pressed', String(m === 'spread'));
    if (stage) stage.setSpread(m === 'spread', true);
  }

  try {
    stage = new Stage(host, { onFloorClick: (i) => { if (i !== null) focus(stage.focus === i ? null : i); }, onRender: updateLabels });
    stage.spread = mode === 'spread' ? 1 : 0;
    stage.setFloors(floors, { title });
    const cam = cfg.camera || {};
    stage.aim({ azimuth: cam.azimuth ?? 40, elevation: cam.elevation ?? (mode === 'spread' ? 30 : 22), i: null, zoom: cam.zoom || 1 }, false);
    const hideHelp = () => { help.classList.add('is-gone'); host.removeEventListener('pointerdown', hideHelp); };
    host.addEventListener('pointerdown', hideHelp);
    setTimeout(hideHelp, 8000);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener && mq.addEventListener('change', () => stage.applyTheme());
  } catch (e) {
    view.replaceChildren(h('div', { class: 'bv-boot', text: '3D 건물을 그리지 못했어요 · ' + (e.message || e) }));
  }
  renderStrip();
  return { stage };
}
