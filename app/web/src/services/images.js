import { putImage } from '../repositories/proposals.js';
import { P, IMAGE_DB } from './catalog.js';

export const GROUPS = [['', '전체'], ['cut', '제품 컷'], ['case', '설치 사례'], ['life', '공식 연출'], ['ui', '솔루션 화면'], ['gen', '생성 이미지']];
export const KIND_GROUP = { cut: 'cut', detail: 'cut', kiosk: 'cut', signage: 'cut', ui: 'ui', cms: 'ui', energy: 'ui', phone: 'ui', insitu: 'life', photo: 'life', menuboard3: 'case', outdoor: 'case', pickup: 'case', space: 'life', people: 'life', kv: 'life', content: 'ui', aerial: 'life' };
export const KIND_NAME = { photo: '사진', cms: 'CMS 화면', menuboard3: '메뉴보드 3면', energy: '에너지 화면', phone: '모바일 화면', outdoor: '옥외', kiosk: '키오스크', pickup: '픽업', signage: '사이니지', space: '공간 사진', people: '사람 · 장면', ui: '솔루션 화면', insitu: '설치 연출', aerial: '조감', kv: '키 비주얼', content: '콘텐츠', detail: '디테일 컷', cut: '제품 컷' };

export function rankImages(list, { models = [], kind, hint, wModel = 3, wGroup = 2 }) {
  const g = KIND_GROUP[kind];
  const h = String(hint || '').toLowerCase();
  return list.map((im) => {
    let s = 0;
    if (models.includes(String(im.model).toUpperCase())) s += wModel;
    if (g && im.group === g) s += wGroup;
    if (h && (im.desc + ' ' + im.model).toLowerCase().split(/\s+/).some((w) => w.length > 1 && h.includes(w))) s += 1.5;
    return { im, s };
  }).sort((a, b) => b.s - a.s).map((x) => x.im);
}

export async function fileToStoredImage(file) {
  if (!file || !/^image\//.test(file.type)) return null;
  const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(file); });
  if (!dataUrl) return null;
  const small = await new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      if (k >= 1 && file.size < 900e3) return res(dataUrl);
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.86));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
  const src = await putImage(small);
  return { src, name: file.name };
}

export function suggestImages(slots, x, productIds) {
  const models = productIds.map((id) => P[id] && P[id].model.toUpperCase()).filter(Boolean);
  const used = new Set();
  const out = [];
  for (const sl of slots) {
    if (x.ov.img && x.ov.img[sl.i]) continue;
    const g = KIND_GROUP[sl.kind];
    const cand = rankImages(IMAGE_DB, { models, kind: sl.kind, hint: sl.hint }).filter((im) => !used.has(im.pid));
    const best = cand.find((im) => models.includes(String(im.model).toUpperCase()) && (!g || im.group === g || g === 'life'));
    if (best) { used.add(best.pid); out.push({ i: sl.i, im: best, hint: sl.hint }); }
  }
  return out;
}
