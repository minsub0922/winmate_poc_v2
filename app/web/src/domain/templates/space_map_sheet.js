// 업종 Map — 공간마다 제품을 하나 이상 놓는 장을 그때그때 조립한다 (사용자 지시 2026-11-16).
//   "이 맵에서 각 공간에 하나 이상의 제품이 들어갈 수 있어. 이를 동적으로 여러 개 놓을 수 있도록 … 그에 따라 각 제품 카드 사이즈와 배치가 달라질 거야."
//   공간 칸(공간 2~8곳 — space_sheet_plan.js spaceMapRows)마다 제품 카드(제품 컷 + 이름)를 제품 수만큼 놓는다.
//   카드 크기 · 배치는 칸의 제품 자리 크기와 제품 수로 정한다(arrangeCards): 줄 · 열을 바꿔 가며 카드 안 그림이 가장 크게 보이는 배치를 고르고,
//   덜 찬 마지막 줄은 가운데로 모은다. 카드가 읽히는 최소 크기(MAP_CARD.minW × minH)보다 작아져야 하면 더 놓지 않고 마지막 자리에 '외 N종'을 둔다.
// 화면 없이 계산만 한다(문자열 HTML). 장은 표준 제안서 장(L_VS_*, app/scripts/vertical_standard/layouts.py)과 같은 틀 · 글자 역할 · 색을 쓴다:
//   1280×720 · 글 칸 data-tb · 그림 칸 data-img · data-proposal-typography="2".
// 장 이름(f)은 공간 수와 칸마다 놓은 카드 수로 정해진다 — 'L_VS_MAP_5_4-2-3x-1-2'(x = '외 N종' 자리). 같은 이름이면 같은 장이다.
// 지금은 관리자 '전체 파트' 목록(admin/web/src/space-route.jsx)이 쓴다 — 실제 덱의 Map(L_VS_MAP_3 … 10)은 아직 공간마다 대표 제품 컷 하나 + 제품 목록 글이다.
import { SPACE_MAP, spaceMapRows, spaceMapId } from './space_sheet_plan.js';

/* ---------------- 틀 · 글자 역할 · 색 (layouts.py 와 같은 값) ---------------- */
const ROLE = { utility: [12, 1.35], label: [14, 1.35], dense: [16, 1.4], body: [18, 1.4], title: [32, 1.25] };
const BLUE = '#1428a0'; const INK = '#121417'; const INK2 = '#3d4452'; const GRAY = '#596170'; const MUTE = '#8a91a0'; const SURF = '#f5f6f8'; const TINT = '#eaeefb';
const MAN = "Manrope, 'Noto Sans KR', sans-serif";
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');

/* ---------------- 공간 칸 ---------------- */
export const MAP_GRID = { x: 64, top: 152, bottom: 648, width: 1152, gap: 12, pad: 14, head: 52, note: 68 }; // head: 번호 + 공간 이름 줄 · note: 한 줄 배치일 때 '하는 일' 자리
/** 공간 n곳(2~8)의 칸 — [{ x, y, w, h, single, area: { x, y, w, h } }]. area = 제품 카드를 놓는 자리. 4곳 이하(한 줄)는 칸 아래에 '하는 일' 한 문장 자리를 둔다 */
export function mapCells(n) {
  const rows = spaceMapRows(n); const G = MAP_GRID; const single = rows.length === 1;
  const rh = Math.floor((G.bottom - G.top - G.gap * (rows.length - 1)) / rows.length);
  const out = [];
  rows.forEach((cnt, ri) => {
    const cw = (G.width - G.gap * (cnt - 1)) / cnt; const y = G.top + ri * (rh + G.gap);
    for (let c = 0; c < cnt; c++) {
      const x = Math.round(G.x + c * (cw + G.gap)); const w = Math.round(cw);
      const ay = y + G.head; const ah = rh - G.head - G.pad - (single ? G.note + 12 : 0);
      out.push({ x, y, w, h: rh, single, area: { x: x + G.pad, y: ay, w: w - 2 * G.pad, h: ah } });
    }
  });
  return out;
}

/* ---------------- 제품 카드 배치 ---------------- */
// gap: 카드 사이 · minW × minH: 제품 컷과 이름 한 줄이 읽히는 최소 카드 · pad: 카드 안 여백 · aspect: 견주는 그림 비율(4:3) · max: 칸 하나에 놓는 자리 수 상한
export const MAP_CARD = { gap: 8, minW: 96, minH: 78, pad: 8, aspect: [4, 3], max: 9 };
/** 카드 너비에 맞는 이름 글자 — [역할, 줄 높이(px)] */
export const cardName = (w) => (w >= 220 ? ['dense', 24] : w >= 120 ? ['label', 20] : ['utility', 18]);
/** 카드 안 그림(4:3으로 견준) 크기 — 클수록 잘 보인다 */
function pictureSize(w, h) {
  const C = MAP_CARD; const iw = w - 2 * C.pad; const ih = h - cardName(w)[1] - 2 * C.pad;
  return Math.min(iw / C.aspect[0], ih / C.aspect[1]);
}
/**
 * 자리(W × H)에 카드 k장 — { cols, rows, w, h, cards: [{ x, y, w, h }] } (좌표는 자리 왼쪽 위 기준) 또는 null(최소 크기로도 못 놓음)
 *   열 수를 1…k 로 바꿔 가며 카드 안 그림이 가장 큰 배치를 고른다. 빈자리가 남는 배치(3 + 1 …)는 그만큼 낮게 친다. 덜 찬 마지막 줄은 가운데로.
 */
export function arrangeCards(k, W, H) {
  if (!Number.isInteger(k) || k < 1) return null;
  const C = MAP_CARD; let best = null;
  for (let cols = 1; cols <= k; cols++) {
    const rows = Math.ceil(k / cols);
    const w = (W - C.gap * (cols - 1)) / cols; const h = (H - C.gap * (rows - 1)) / rows;
    if (w < C.minW || h < C.minH) continue;
    const score = pictureSize(w, h) * Math.sqrt(k / (cols * rows));
    if (!best || score > best.score + 1e-9) best = { cols, rows, w, h, score };
  }
  if (!best) return null;
  const { cols, rows, w, h } = best; const cards = [];
  for (let i = 0; i < k; i++) {
    const r = Math.floor(i / cols); const inRow = r === rows - 1 ? k - cols * (rows - 1) : cols;
    const off = ((cols - inRow) * (w + C.gap)) / 2; // 덜 찬 마지막 줄은 가운데로
    cards.push({ x: Math.round(off + (i % cols) * (w + C.gap)), y: Math.round(r * (h + C.gap)), w: Math.floor(w), h: Math.floor(h) });
  }
  return { cols, rows, w: Math.floor(w), h: Math.floor(h), cards };
}
/** 자리에 놓을 수 있는 카드 수(최소 크기 기준) */
export function cardCapacity(W, H) {
  let k = 0;
  while (k < MAP_CARD.max && arrangeCards(k + 1, W, H)) k++;
  return k;
}
/**
 * 제품 k개를 자리에 — { shown, more, slots, layout }
 *   shown: 카드로 놓는 제품 수 · more: 못 놓아 '외 N종'으로 묶는 제품 수 · slots: 자리 수(shown + '외 N종' 한 자리) · layout: arrangeCards(slots)
 *   다 놓을 수 있으면 more 0. 넘치면 놓을 수 있는 자리의 마지막 한 칸을 '외 N종'에 쓴다.
 */
export function placeProducts(k, W, H) {
  const cap = cardCapacity(W, H);
  if (k <= 0 || cap === 0) return { shown: 0, more: Math.max(0, k), slots: 0, layout: null };
  if (k <= cap) return { shown: k, more: 0, slots: k, layout: arrangeCards(k, W, H) };
  const shown = Math.max(0, cap - 1);
  return { shown, more: k - shown, slots: cap, layout: arrangeCards(cap, W, H) };
}
/** 배치 이름 — '1' · '2' · '2+1' · '2×2' · '3×2' (줄마다 카드 수가 같으면 열×줄, 다르면 줄마다 더해서) */
export function arrangeLabel(layout, k) {
  if (!layout) return '';
  const { cols, rows } = layout; const n = k == null ? layout.cards.length : k;
  if (rows === 1) return String(n);
  const last = n - cols * (rows - 1);
  return last === cols ? `${cols}×${rows}` : [...Array(rows - 1).fill(cols), last].join('+');
}

/* ---------------- 장 조립 ---------------- */
function sheet(f) {
  const parts = []; const t = {}; const img = {}; let nt = 0; let ni = 0;
  const api = {
    box(x, y, w, h, style) { parts.push(`<div style="position: absolute; left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px; box-sizing: border-box; ${style} pointer-events: none;"></div>`); },
    circle(x, y, d, label) {
      parts.push(`<div style="position: absolute; left: ${x}px; top: ${y}px; width: ${d}px; height: ${d}px; min-width: ${d}px; min-height: ${d}px; max-width: ${d}px; max-height: ${d}px; border-radius: 50%; background: ${BLUE}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-family: ${MAN}; font-size: 12px; font-weight: 800; line-height: 1; pointer-events: none;" data-layout-shape="circle">${esc(label)}</div>`);
    },
    text(role, x, y, w, value, style, h, fixed) {
      const [size, lead] = ROLE[role]; const i = nt; nt += 1; t[i] = value;
      const hh = h ? (fixed ? ` height: ${h}px;` : ` min-height: ${h}px;`) : '';
      parts.push(`<div style="position: absolute; left: ${x}px; top: ${y}px; width: ${w}px;${hh} font-size: ${size}px; line-height: ${lead}; white-space: pre-line; overflow-wrap: anywhere; word-break: keep-all; min-width: 0; max-width: 100%; ${style}" data-tb="${i}" data-type-role="${role}">${esc(value)}</div>`);
      return i;
    },
    image(x, y, w, h, hint, src, name, pad) {
      const i = ni; ni += 1; if (src) img[i] = { src, fit: 'contain', name: name || hint, keep: true };
      parts.push(`<div style="position: absolute; left: ${x}px; top: ${y}px; width: ${w}px; height: ${h}px; box-sizing: border-box; padding: ${pad}px; overflow: hidden; border-radius: 8px; background: transparent;" data-slot="Photo" data-img="${i}" data-kind="cut" data-hint="${attr(hint)}">`
        + `<img src="${attr(src || BLANK)}" alt="${attr(name || hint)}" style="display: block; width: 100%; height: 100%; object-fit: contain; object-position: 50% 50%;"></div>`);
      return i;
    },
    done() {
      return { f, t, img, nT: nt, nI: ni, html: `<div data-proposal-typography="2" style="width: 1280px; height: 720px; position: relative; overflow: hidden; background: #ffffff; color: ${INK}; font-family: 'Noto Sans KR', system-ui, sans-serif; word-break: keep-all; overflow-wrap: anywhere">${parts.join('')}</div>` };
    },
  };
  return api;
}
const ONE = 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';

/** 칸마다 놓는 제품 수 → 장 이름과 칸 배치 — { f, n, cells: [{ …칸, shown, more, slots, layout }] } */
export function spaceMapPlanOf(counts) {
  const n = counts.length; const cells = mapCells(n).map((c, i) => ({ ...c, ...placeProducts(Math.max(0, counts[i] | 0), c.area.w, c.area.h) }));
  return { f: `${spaceMapId(n)}_${cells.map((c) => c.shown + (c.more ? 'x' : '')).join('-')}`, n, cells };
}

/**
 * 업종 Map 한 장 — 공간마다 제품 카드.
 *   data: { eb, title, sub, cust, foot, page, spaces: [{ name, note, products: [{ name, src }] }] } — 공간 2~8곳, 공간마다 제품 1개 이상
 *   → { f, html, t, img, nT, nI, n, cells: [{ shown, more, slots, layout: { cols, rows, w, h, cards } }] }
 *   글 칸: 0 장 표식 · 1 제목 · 2 부제, 공간마다 [공간 이름 · 제품 이름 …(카드 순서) · ('외 N종') · (한 줄 배치일 때 하는 일)], 꼬리말 3(고객사 로고 · 덱 이름 · 쪽)
 *   그림 칸: 공간 순서 → 카드 순서대로 제품 컷
 */
export function spaceMapSheet(data) {
  const spaces = (data && data.spaces) || []; const n = spaces.length;
  if (n < SPACE_MAP.min || n > SPACE_MAP.max) throw new RangeError('Map 은 공간 ' + SPACE_MAP.min + '~' + SPACE_MAP.max + '곳만 다룹니다: ' + n);
  const plan = spaceMapPlanOf(spaces.map((s) => (s.products || []).length));
  const b = sheet(plan.f); const G = MAP_GRID; const C = MAP_CARD;
  b.text('label', 64, 44, 1000, data.eb || '03 · 공간별 제안', `font-weight: 700; letter-spacing: 0.06em; color: ${BLUE}; white-space: nowrap;`, 19);
  b.text('title', 64, 64, 1152, data.title || '업종 Map', `font-weight: 700; letter-spacing: -0.02em; color: ${INK}; white-space: nowrap;`, 40);
  b.text('body', 64, 110, 1152, data.sub || `${n}개 공간 × 삼성 제품 — 공간마다 놓이는 제품을 한눈에`, `color: ${GRAY}; white-space: nowrap;`, 25);
  plan.cells.forEach((cell, k) => {
    const s = spaces[k]; const products = s.products || [];
    b.box(cell.x, cell.y, cell.w, cell.h, `border-radius: 14px; background: ${SURF};`);
    b.circle(cell.x + G.pad, cell.y + 14, 24, String(k + 1));
    b.text('dense', cell.x + 46, cell.y + 14, cell.w - 58, s.name || '공간', `font-weight: 800; color: ${INK}; ${ONE}`, 22);
    const L = cell.layout;
    if (L) {
      const [role, nameH] = cardName(L.w);
      L.cards.forEach((r, i) => {
        const x = cell.area.x + r.x; const y = cell.area.y + r.y;
        if (i >= cell.shown) { // '외 N종'
          b.box(x, y, r.w, r.h, `border-radius: 10px; background: ${TINT};`);
          b.text(role, x + 4, y + Math.round((r.h - nameH) / 2), r.w - 8, `외 ${cell.more}종`, `font-weight: 800; color: ${BLUE}; text-align: center; ${ONE}`, nameH);
          return;
        }
        const p = products[i] || {};
        b.box(x, y, r.w, r.h, 'border-radius: 10px; background: #ffffff;');
        b.image(x, y, r.w, r.h - nameH - 4, '제품 컷', p.src, p.name, C.pad);
        b.text(role, x + 6, y + r.h - nameH - 5, r.w - 12, p.name || '제품', `font-weight: 700; color: ${INK2}; text-align: center; ${ONE}`, nameH);
      });
    }
    if (cell.single) b.text('dense', cell.x + G.pad, cell.y + cell.h - G.pad - G.note, cell.w - 2 * G.pad, s.note || '이 공간에서 하는 일', `color: ${INK};`, G.note);
  });
  b.text('utility', 64, 680, 72, data.cust || '고객사 로고', `height: 20px; border-radius: 4px; background: ${SURF}; text-align: center; color: ${GRAY}; white-space: nowrap; overflow: hidden; line-height: 20px; box-sizing: border-box;`, 20, true);
  b.text('utility', 148, 682, 760, data.foot || '업종 · AI 제안', `color: ${GRAY}; white-space: nowrap;`, 16);
  b.text('utility', 996, 682, 220, 'CONFIDENTIAL · ' + (data.page || 1), `font-family: ${MAN}; color: ${MUTE}; text-align: right; white-space: nowrap; letter-spacing: .04em;`, 16);
  return { ...b.done(), n, cells: plan.cells.map((c) => ({ shown: c.shown, more: c.more, slots: c.slots, layout: c.layout, area: c.area })) };
}

/** 칸 수만으로 만든 빈 장(샘플 글 · 빈 그림) — counts: 칸마다 제품 수 */
export function spaceMapLayout(counts) {
  return spaceMapSheet({ spaces: counts.map((k) => ({ name: '공간', note: '이 공간에서 하는 일', products: Array.from({ length: k }, () => ({ name: '제품' })) })) });
}

/** 공간 n곳 장에서 칸 하나에 놓을 수 있는 제품 카드 수 — { min, max } (줄마다 칸 너비가 다르면 다르다) */
export function mapCardCapacity(n) {
  const caps = mapCells(n).map((c) => cardCapacity(c.area.w, c.area.h));
  return { min: Math.min(...caps), max: Math.max(...caps) };
}
