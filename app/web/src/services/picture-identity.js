// 같은 그림 — 주소가 달라도 같은 사진(다른 묶음 · 다른 크롭 · 흑백 사본)이면 같은 그림이다.
// app/data/picture_ids.json(app/scripts/build_picture_ids.mjs가 픽셀로 묶는다)을 읽는다. 레이아웃 자동 구성(composer.pictures.pic)과 같은 기준으로,
// 한 제안서에 같은 사진은 한 번만 쓴다 — 제품 컷은 예외(같은 제품이면 여러 장에 다시 쓸 수 있다).
import IDS from '../../../data/picture_ids.json' with { type: 'json' };

const OF = new Map();
for (const group of IDS.groups || []) for (const src of group) OF.set(src, group[0]);

// addresses as the table keys them: 'img/…' without the leading slash, '/assets/…' with it
const norm = (src) => {
  const s = String((src && typeof src === 'object' ? src.src : src) || '');
  return s.startsWith('/img/') ? s.slice(1) : s.startsWith('assets/') ? '/' + s : s;
};

/** the picture's identity — the first address of its group of the same photo, else its own address */
export const pictureId = (src) => { const s = norm(src); return OF.get(s) || s; };

/** two addresses show the same picture */
export const samePicture = (a, b) => !!a && !!b && pictureId(a) === pictureId(b);
