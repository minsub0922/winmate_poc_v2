// 사진 칸 정리 (2026-11-12 · PPT 템플릿 레이아웃 전면 개선) — layout_cleanup.js 다음에 모든 기본 레이아웃이 거친다.
// 사진을 억지로 늘려 넣느라 생긴 무리한 잘림을 줄인다. 칸 번호(data-tb · data-img)는 그대로 두고 크기 · 위치만 바꾼다.
//  1. 세로로 긴 사진 줄(가로 사진을 좁고 높은 칸에 넣은 열 2개 이상) → 정사각형에 가깝게 줄이고, 그 열 아래 내용을 함께 올린다.
//  2. 아래가 비어 있는 납작한 띠 사진 → 비어 있는 만큼만 높인다.
//  3. 표 행마다 억지로 깔았던 작은 사진 띠(글씨가 사진 위에 얹힌 행) → 사진을 빼고 행 라벨만 남긴다 (RULES).
import { parseLayout, attr, textOf } from './layout_cleanup.js';

const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const SCENE_SKIP = /^(cut|ui|icon|aerial|plan|diagram|kv|logo|qr)$/;

/** a small style editor on top of parseLayout — edits are spliced into the original HTML */
class Editor {
  constructor(html) { this.html = html; const t = parseLayout(html); this.nodes = t.nodes; this.top = t.top; this.css = new Map(); this.drop = new Set(); }
  slotTb(i) { return this.nodes.find((n) => n.tb === String(i)) || null; }
  slotImg(i) { return this.nodes.find((n) => n.img === String(i)) || null; }
  up(n, k = 1) { while (n && k-- > 0) n = n.parent; return n; }
  get(n, prop) { const c = this.css.get(n); if (c && prop in c) return c[prop]; return n.prop(prop); }
  set(n, props) { if (!n || n === this.top) return; this.css.set(n, Object.assign(this.css.get(n) || {}, props)); }
  remove(n) { if (n && n !== this.top) this.drop.add(n); }
  /** root-level absolutely placed boxes — the coordinates every layout family here is drawn with */
  boxes() {
    return this.top.children.filter((n) => n.prop('position') === 'absolute').map((n) => ({ n, x: px(n.prop('left')), y: px(n.prop('top')), w: px(n.prop('width')), h: px(n.prop('height')) }));
  }
  out() {
    if (!this.css.size && !this.drop.size) return this.html;
    const edits = [];
    const dropped = [...this.drop];
    for (const n of dropped) edits.push({ a: n.start, b: n.end, s: '' });
    for (const [n, props] of this.css) {
      if (dropped.some((d) => d.start <= n.start && n.end <= d.end)) continue;
      const style = n.style; // Map
      for (const [k, v] of Object.entries(props)) { if (v == null) style.delete(k); else style.set(k, String(v)); }
      const css = [...style].map(([k, v]) => k + ': ' + v).join('; ');
      const tag = /\bstyle="[^"]*"/.test(n.tag) ? n.tag.replace(/\bstyle="[^"]*"/, 'style="' + css.replace(/"/g, "'") + '"') : n.tag.replace(/^<([a-zA-Z][\w-]*)/, '<$1 style="' + css.replace(/"/g, "'") + '"');
      edits.push({ a: n.start, b: n.openEnd, s: tag });
    }
    edits.sort((a, b) => b.a - a.a);
    let out = this.html, last = Infinity;
    for (const e of edits) { if (e.b > last) continue; out = out.slice(0, e.a) + e.s + out.slice(e.b); last = e.a; }
    return out;
  }
}

/** the picture inside a slot: its kind · whether it is a product cut / screen (never reshaped here) */
function sceneSlot(ed, n) {
  if (n.img == null) return false;
  const kind = attr(n.attrs, 'data-kind') || '';
  if (SCENE_SKIP.test(kind)) return false;
  const im = n.name === 'img' ? n : ed.nodes.find((c) => c.name === 'img' && c.start > n.start && c.end <= n.end);
  if (!im) return true; // an empty slot is a photo slot too
  const fit = im.prop('object-fit');
  if (fit && fit !== 'cover') return false;
  const src = (attr(im.attrs, 'data-fill') || '') + ' ' + (attr(im.attrs, 'src') || '');
  return !/img\/fill\/cut\.json|img\/fill\/ui\.json|img\/prod\/|(^|\/)p-[\w-]+\.png|-front\.png|-persp\.png/.test(src);
}

// 1. 세로 사진 줄 → 정사각형에 가깝게. 사진 아래에 그 열의 내용이 있는 경우만(사진 위에 글을 얹은 카드는 그대로)
function portraitRows(ed) {
  const boxes = ed.boxes();
  // 같은 높이 · 같은 위치의 사진 칸 묶음 (제품 컷이 섞여 있어도 한 줄로 — 같이 줄여야 아래 글이 겹치지 않는다)
  const photos = boxes.filter((b) => b.w && b.h && b.w >= 120 && b.w / b.h < 0.8 && b.w * b.h < 1280 * 720 * 0.22 && b.n.img != null);
  const rows = new Map();
  for (const b of photos) { const k = b.y + ':' + b.h; (rows.get(k) || rows.set(k, []).get(k)).push(b); }
  for (const row of rows.values()) {
    if (row.length < 2 || row.filter((b) => sceneSlot(ed, b.n)).length < 2) continue;
    const { y, h } = row[0];
    const w = Math.min(...row.map((b) => b.w));
    const nh = Math.max(Math.round(w * 0.95), 120);
    const d = h - nh;
    if (d < 24) continue;
    const x0 = Math.min(...row.map((b) => b.x)), x1 = Math.max(...row.map((b) => b.x + b.w));
    const wide = x1 - x0 >= 1152 * 0.6;
    const inCols = (b) => { const cx = b.x + (b.w || 0) / 2; return b.x != null && cx >= x0 - 4 && cx <= x1 + 4; };
    const below = boxes.filter((b) => !row.includes(b) && b.y != null && b.y >= y + h - 2 && b.y < 664 && (wide || inCols(b)));
    if (!below.some(inCols)) continue; // 사진이 곧 카드인 장 — 높이를 줄이면 빈 카드만 남는다
    // 사진 줄이 넓으면(표 · 비교) 그 아래 전부, 아니면 같은 열만 함께 올린다 — 위에서 시작한 카드 안에 든 상자는 카드와 함께 남는다
    const stay = boxes.filter((b) => !row.includes(b) && b.y != null && b.y < y + h * 0.45 && b.w && b.h);
    const inside = (b) => stay.some((c) => c.x <= b.x && b.x < c.x + c.w && c.y <= b.y && b.y < c.y + c.h);
    const move = boxes.filter((b) => !row.includes(b) && b.y != null && b.y < 664 && b.y >= y + h * 0.45 && (wide || inCols(b)) && !inside(b));
    // 옮긴 상자가 남은 상자(카드 · 표 머리)와 새로 겹치면 이 줄은 그대로 둔다
    const hit = (a, ay, c) => a.x < c.x + c.w && c.x < a.x + (a.w || 0) && ay < c.y + c.h && c.y < ay + (a.h || 24);
    const still = boxes.filter((c) => !row.includes(c) && !move.includes(c) && c.y != null && c.w && c.h && c.h < 600 && c.y < 664);
    if (move.some((a) => a.x != null && still.some((c) => !hit(a, a.y, c) && hit(a, Math.max(y, a.y - d), c)))) continue;
    for (const b of row) ed.set(b.n, { height: nh + 'px' });
    for (const b of move) ed.set(b.n, { top: Math.max(y, b.y - d) + 'px' });
  }
}

// 2. 납작한 띠 사진 — 아래가 비어 있으면 그만큼만 높인다 (가로 : 세로 2.2 까지)
function flatStrips(ed) {
  const boxes = ed.boxes();
  for (const b of boxes) {
    if (!b.w || !b.h || b.w / b.h <= 2.7 || b.w > 900 || !sceneSlot(ed, b.n)) continue;
    const want = Math.round(b.w / 2.2) - b.h;
    if (want < 16) continue;
    const below = boxes.filter((o) => o !== b && o.y != null && o.y >= b.y + b.h - 1 && o.x != null && o.x < b.x + b.w && o.x + (o.w || 0) > b.x);
    const room = Math.min(664, ...below.map((o) => o.y)) - (b.y + b.h) - 12;
    const grow = Math.min(want, room);
    if (grow >= 16) ed.set(b.n, { height: b.h + grow + 'px' });
  }
}

// 3. 장마다 따로 정한 정리
const RULES = {
  // 교육 계획 · 점검 캘린더 · 층별 제품 — 행 라벨 밑에 깔린 작은 사진 띠를 빼고 라벨만 또렷하게
  L_PH_TO_A: (ed) => stripRowPhotos(ed),
  L_PH_MT_A: (ed) => stripRowPhotos(ed),
  L_PH_SM_D: (ed) => floorThumbs(ed),
};
/** 업종별 고객 여정 5단계(L_PH_MI_xx_C) — 열마다 10줄이던 글을 줄인다: 장소 부연 · 직원 · 운영 줄 · '+ 솔루션' 줄을 빼고 고객 순간과 삼성 제품만 */
function journeyLean(ed) {
  const tbs = ed.nodes.filter((n) => n.tb != null).sort((a, b) => +a.tb - +b.tb);
  const txt = (n) => textOf(ed.html, n);
  for (let k = 0; k < tbs.length; k++) {
    const n = tbs[k], t = txt(n);
    if (t === '직원 · 운영') { ed.remove(n); if (tbs[k + 1]) ed.remove(tbs[k + 1]); }
    else if (/^\+\s/.test(t)) ed.remove(n);
    else if (/^[1-5]$/.test(t) && tbs[k + 2] && txt(tbs[k + 2]) !== '결정적 순간' && (parseFloat(tbs[k + 2].prop('font-size')) || 14) <= 15) ed.remove(tbs[k + 2]);
  }
}
/** 층별 띠 사진(600×92) → 층 라벨 옆 작은 사진(3:2)으로, 오른쪽 제품 목록을 그만큼 왼쪽으로 넓힌다 */
function floorThumbs(ed) {
  const boxes = ed.boxes();
  const rows = boxes.filter((b) => b.w && b.h && b.w / b.h > 4 && sceneSlot(ed, b.n));
  if (!rows.length) return;
  const x0 = rows[0].x, x1 = rows[0].x + rows[0].w;
  for (const r of rows) {
    const nw = Math.round(r.h * 1.5);
    ed.set(r.n, { width: nw + 'px' });
    const shift = r.w - nw - 8;
    for (const b of boxes) {
      if (b === r || b.y == null || b.x == null || b.y < r.y - 4 || b.y > r.y + r.h || b.x < x1 - 4) continue;
      ed.set(b.n, { left: b.x - shift + 'px', ...(b.w ? { width: b.w + Math.min(shift, 1216 - (b.x + b.w) + shift - (b.x - shift) < 0 ? 0 : shift) + 'px' } : {}) });
    }
  }
}
/** photos under row labels: the photo goes, the label box over it turns into a plain light row label */
function stripRowPhotos(ed, { keepLabel = true } = {}) {
  const boxes = ed.boxes();
  const rows = boxes.filter((b) => b.w && b.h && b.w / b.h > 2.4 && b.h <= 110 && sceneSlot(ed, b.n));
  for (const r of rows) {
    ed.set(r.n, { background: '#f5f6f8' });
    const im = ed.nodes.find((c) => c.name === 'img' && c.start > r.n.start && c.end <= r.n.end);
    if (im) ed.remove(im);
    // dark scrims and label boxes laid on the photo read as plain dark text now
    for (const b of boxes) {
      if (b === r || b.y == null || b.y < r.y - 2 || b.y > r.y + r.h || b.x < r.x - 2 || b.x > r.x + r.w) continue;
      const bg = b.n.prop('background') || b.n.prop('background-color') || '';
      if (/rgba\(\s*(0|5|8|10|12|16|18|20)\s*,/.test(bg) || /linear-gradient/.test(bg)) ed.set(b.n, { background: 'transparent' });
      for (const c of ed.nodes) if (c.start >= b.n.start && c.end <= b.n.end && /#fff\b|#ffffff\b|rgba\(255,\s*255,\s*255/i.test(c.prop('color') || '')) ed.set(c, { color: '#121417' });
    }
    if (!keepLabel) continue;
  }
}

const FAMILY = [[/^L_PH_MI_[A-Z]{2}_C$/, (ed) => { journeyLean(ed); flatStrips(ed); }]];

export function redesignLayoutHtml(f, html) {
  if (!html || html.includes('data-layout-redesign="1"')) return html;
  const ed = new Editor(html);
  if (!ed.top) return html;
  const fam = FAMILY.find(([re]) => re.test(f));
  if (RULES[f]) RULES[f](ed, f);
  else if (fam) fam[1](ed, f);
  else { portraitRows(ed); flatStrips(ed); }
  const out = ed.out();
  return out === html ? html : out.replace(/^(\s*<div\b)/, '$1 data-layout-redesign="1"');
}
