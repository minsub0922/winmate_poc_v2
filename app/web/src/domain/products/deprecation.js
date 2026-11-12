// 판매 종료(deprecated) 제품 — DSS DB 업데이트(.agents/skills/winmate-update-dss-db)가 공식 소스 재검토로 확정한 제품.
// 데이터는 지우지 않는다: 기존 제안서 · 샘플 시나리오 · 히스토리는 그대로 그리고, 새로 고르는 곳(탐색기 · @태그 · 추천 · 교체)에서만 뺀다.
// 제안서를 PPTX로 내보낼 때 덱에 판매 종료 제품이 들어 있으면 한 번 더 확인받는다(viewer.jsx ExportModal · 샘플 시나리오 받기).
// 제품 행의 표시: deprecated = { at, run, replacedBy, reason } (products_db.json 행 · curated, catalog.json products)
import { PRODUCTS, P, IMAGE_DB, layoutHtml } from '../../services/catalog.js';

export const isDeprecated = (p) => !!(p && p.deprecated);
export const DEPRECATED_PRODUCTS = PRODUCTS.filter(isDeprecated);

const key = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// 모델코드 → 판매 종료 제품 (5자 이상만 — 짧은 글자열이 다른 낱말에 걸리지 않게)
const MODEL_OF = new Map();
for (const p of DEPRECATED_PRODUCTS) for (const m of [p.model, ...(p.models || [])]) { const k = key(m); if (k.length >= 5 && !MODEL_OF.has(k)) MODEL_OF.set(k, p); }
// 사진 주소 · 이미지 pid → 판매 종료 제품 (제품 사진 묶음 주소, 큐레이션 제품 컷 pid, 같은 모델의 이미지 DB 컷)
const IMG_OF = new Map();
for (const p of DEPRECATED_PRODUCTS) for (const a of [p.th, ...(p.gal || []), p.img]) if (a) IMG_OF.set(a, p);
for (const im of IMAGE_DB) { const p = MODEL_OF.get(key(im.model)); if (p) { IMG_OF.set(im.pid, p); if (im.src) IMG_OF.set(im.src, p); } }

/** 대체 제품(같은 제품군에서 고른 판매 중 제품) — 없으면 null */
export function replacementOf(p) {
  const r = p && p.deprecated && p.deprecated.replacedBy;
  return r && P[r] && !P[r].deprecated ? P[r] : null;
}

const plain = (v) => String((v && v.html) ?? v ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ');
const modelHits = (text) => String(text).toUpperCase().split(/[^A-Z0-9-]+/).map(key).filter((t) => t.length >= 5).map((t) => MODEL_OF.get(t)).filter(Boolean);

/** 한 장에 실제로 나가는 글 · 사진에서 판매 종료 제품을 찾는다. 사용자가 바꾼 칸은 바꾼 값만 본다. */
function sheetHits(x) {
  const ov = x.ov || {}, t = ov.t || {}, img = ov.img || {};
  const out = [];
  const html = layoutHtml(x.f) || '';
  if (html && typeof DOMParser !== 'undefined') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const el of doc.querySelectorAll('[data-tb]')) if (t[el.getAttribute('data-tb')] != null) el.textContent = ''; // 바꾼 칸은 원래 글 대신 아래 ov.t로
    for (const el of doc.querySelectorAll('[data-img]')) if (img[el.getAttribute('data-img')]) el.remove();
    out.push(...modelHits(doc.body ? doc.body.textContent : ''));
    for (const el of doc.querySelectorAll('[data-pid],img[src]')) for (const v of [el.getAttribute('data-pid'), el.getAttribute('src')]) if (v && IMG_OF.has(v)) out.push(IMG_OF.get(v));
  } else if (html) {
    out.push(...modelHits(plain(html)));
  }
  for (const v of Object.values(t)) out.push(...modelHits(plain(v)));
  for (const v of Object.values(img)) for (const a of [v && v.src, v && v.pid]) if (a && IMG_OF.has(a)) out.push(IMG_OF.get(a));
  return out;
}

/**
 * 내보낼 장들(+ 제안서에 연결된 제품)에 든 판매 종료 제품.
 * slides: [{ x: { f, ov } , n? }] (viewer.jsx flatSlides 결과 그대로) — 반환: [{ p, where: ['연결된 제품', '3쪽' …], replacement }]
 */
export function deprecatedInDeck(proposal, slides) {
  if (!DEPRECATED_PRODUCTS.length) return [];
  const hits = new Map();
  const add = (p, where) => {
    if (!p) return;
    const h = hits.get(p.id) || { p, where: [], replacement: replacementOf(p) };
    if (!h.where.includes(where)) h.where.push(where);
    hits.set(p.id, h);
  };
  for (const id of (proposal && proposal.ctx && proposal.ctx.products) || []) if (isDeprecated(P[id])) add(P[id], '연결된 제품');
  (slides || []).forEach((z, i) => { const x = z.x || z; for (const p of sheetHits(x)) add(p, (z.n || i + 1) + '쪽'); });
  return [...hits.values()];
}

/** 확인 문구용 한 줄 — '스마트 사이니지 QM55C (QM55C) · 3쪽, 7쪽 · 대체: …' */
export const deprecatedLine = ({ p, where, replacement }) =>
  `${p.name}${p.model && !p.name.includes(p.model) ? ' (' + p.model + ')' : ''} · ${where.join(', ')}${replacement ? ' · 대체: ' + replacement.name : ''}`;
