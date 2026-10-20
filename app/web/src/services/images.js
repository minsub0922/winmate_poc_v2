import { putImage } from '../repositories/proposals.js';
import { P, IMAGE_DB } from './catalog.js';
import { productImages } from './image-library.js';
import { productsNamedIn, deviceFamily, matchesDeviceFamily, knownImage } from './image-identity.js';

export const GROUPS = [['', '전체'], ['cut', '제품 컷'], ['case', '설치 사례'], ['life', '공식 연출'], ['ui', '솔루션 화면'], ['gen', '생성 이미지']];
export const KIND_GROUP = { cut: 'cut', detail: 'cut', kiosk: 'cut', signage: 'cut', ui: 'ui', cms: 'ui', energy: 'ui', phone: 'ui', insitu: 'life', photo: 'life', menuboard3: 'case', outdoor: 'case', pickup: 'case', space: 'life', people: 'life', kv: 'life', content: 'ui', aerial: 'life' };
export const KIND_NAME = { photo: '사진', cms: 'CMS 화면', menuboard3: '메뉴보드 3면', energy: '에너지 화면', phone: '모바일 화면', outdoor: '옥외', kiosk: '키오스크', pickup: '픽업', signage: '사이니지', space: '공간 사진', people: '사람 · 장면', ui: '솔루션 화면', insitu: '설치 연출', aerial: '조감', kv: '키 비주얼', content: '콘텐츠', detail: '디테일 컷', cut: '제품 컷' };

const modelKey = v => String(v || '').toUpperCase().replace(/[^A-Z0-9가-힣]/g, '');
const words = v => [...new Set((String(v || '').toLowerCase().match(/[a-z0-9]{3,}|[가-힣]{2,}/g) || []).filter(w => !/^\d+$/.test(w) && !['이미지', '제품', '사진', '공식', '삼성', 'samsung', '제품컷', '정면', '후면', '전면', '측면', 'image', 'photo', 'img', 'png', 'jpg', 'jpeg', 'webp'].includes(w)))];
export function imageProducts(image, list = []) {
  if (!image) return [];
  const known = knownImage(image, list);
  const ids = known?.products?.length ? [...known.products] : [...(image.products || [])];
  if (ids.length) return [...new Set(ids)].filter(id => P[id]);
  const ownText = [image.name, image.desc, image.title].filter(Boolean).join(' ').replace(/\([^)]*\)/g, ' ');
  const family = deviceFamily(ownText);
  const primary = productsNamedIn([image.model, ownText, image.pid].filter(Boolean).join(' '));
  if (primary.length) return family && family !== 'galaxy' ? primary.filter(id => matchesDeviceFamily({ products: [id] }, family)) : primary;
  return family ? [] : productsNamedIn([image.model, image.name, image.desc, image.title, image.pid].filter(Boolean).join(' '));
}
/** Identity constrains replacements; a missing match never promotes unrelated products. */
export function relatedImages(list, { current, productIds = [], models = [], kind, hint, contextText = '' } = {}) {
  const currentMeta = knownImage(current, list);
  const identified = imageProducts(current, list);
  const chosen = identified.filter(id => productIds.includes(id));
  const focus = chosen.length ? chosen : identified;
  const selected = productIds.length ? productIds : Object.values(P).filter(p => models.some(m => modelKey(m) === modelKey(p.model))).map(p => p.id);
  const identity = words([current?.name, current?.desc, currentMeta?.desc].filter(Boolean).join(' '));
  const ownText = [current?.name, current?.desc, currentMeta?.desc].filter(Boolean).join(' ');
  const family = !focus.length && (deviceFamily(ownText) || (!identity.length || /모바일|스마트폰|갤럭시|galaxy/i.test(ownText) ? deviceFamily(current?.itemText || hint) : ''));
  const nearby = !focus.length && !identity.length ? productsNamedIn(current?.itemText || hint) : [];
  const target = focus.length ? focus : nearby.length ? nearby : !identity.length && !family && KIND_GROUP[kind] === 'cut' ? selected : [];
  const semantic = identity.length ? identity : words(hint);
  const context = words(contextText);
  return list.map(im => {
    const exact = target.length && (im.products || []).some(id => target.includes(id));
    if (target.length && !exact) return null;
    if (!target.length && family && !matchesDeviceFamily(im, family)) return null;
    // Deduplicated source assets can carry several family associations. An explicit
    // different model title must not outrank the product actually being edited.
    if (target.length) {
      const title = modelKey([im.title, im.desc].join(' '));
      const named = Object.values(P).filter(p => p.cur && modelKey(p.model).length >= 4 && title.includes(modelKey(p.model)));
      if (named.length && !named.some(p => target.includes(p.id))) return null;
    }
    const tags = words([im.desc, im.title, im.note, im.model, ...(im.spaces || [])].join(' '));
    const hit = semantic.filter(w => tags.some(t => t.includes(w) || w.includes(t))).length;
    const ctx = context.filter(w => tags.includes(w)).length;
    const sameSource = !!currentMeta && ['solutions', 'cases'].some(k => currentMeta[k]?.some(id => im[k]?.includes(id)));
    if (!target.length && !family && (currentMeta?.solutions?.length || currentMeta?.cases?.length) && !sameSource) return null;
    if (!target.length && !family && !hit && !sameSource && !identity.length && !(selected.length && im.products?.some(id => selected.includes(id)) && ctx)) return null;
    if (!target.length && !family && identity.length && !hit && !sameSource) return null;
    return { im, score: (exact ? 100 : family ? 60 : 0) + (sameSource ? 50 : 0) + hit * 5 + ctx + (KIND_GROUP[kind] === im.group ? 3 : 0) };
  }).filter(Boolean).sort((a, b) => b.score - a.score).map(({ im }) => im);
}

export function rankImages(list, { models = [], kind, hint, current, productIds = [], contextText = '', wModel = 3, wGroup = 2 }) {
  if (current || productIds.length) return relatedImages(list, { models, kind, hint, current, productIds, contextText });
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
    const cand = relatedImages([...IMAGE_DB, ...productImages(productIds)], { productIds, kind: sl.kind, hint: sl.hint }).filter((im) => !used.has(im.pid));
    const best = cand.find((im) => models.includes(String(im.model).toUpperCase()) && (!g || im.group === g || g === 'life'));
    if (best) { used.add(best.pid); out.push({ i: sl.i, im: best, hint: sl.hint }); }
  }
  return out;
}
