import { putImage } from '../repositories/proposals.js';
import { P, S, C, IMAGE_DB } from './catalog.js';
import { productImages, imageIndustry } from './image-library.js';
import { productsNamedIn, deviceFamily, matchesDeviceFamily, knownImage } from './image-identity.js';
import { pictureId } from './picture-identity.js';
import { sceneItemIssue, spacePhotoIssue } from './picture-items.js';
import { getBootstrap } from '../api/bootstrap.js';
import { requestJson } from '../api/client.js';
import { useEffect, useState } from 'react';

const initialWeights = getBootstrap().image_weights || { caption: 1, place: 1, subject: 1 };
let activeWeights = initialWeights;
export async function loadImageWeights() {
  try {
    const policy = await requestJson('/api/image-search');
    if (['caption', 'place', 'subject'].every(k => Number.isFinite(policy?.[k]))) activeWeights = policy;
  } catch { /* Use the last policy while offline. */ }
  return activeWeights;
}
export function useImageWeights() {
  const [weights, setWeights] = useState(activeWeights);
  useEffect(() => {
    let active = true;
    loadImageWeights().then(value => { if (active) setWeights(value); });
    return () => { active = false; };
  }, []);
  return weights;
}

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
export function relatedImages(list, { current, productIds = [], models = [], kind, hint, contextText = '', weights = activeWeights } = {}) {
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
    return { im, score: ((exact ? 100 : family ? 60 : 0) + (sameSource ? 50 : 0)) * weights.subject + (hit * 5 + ctx) * weights.caption + (KIND_GROUP[kind] === im.group ? 3 : 0) };
  }).filter(Boolean).sort((a, b) => b.score - a.score).map(({ im }) => im);
}

/* ---------- one picture slot, read with its own neighbourhood (layout personalisation) ----------
 * A slot is described by the words right next to it — the caption, the card it sits in — after they have been written for
 * this customer, never by the part name or the template's example picture. `slotTarget` turns those words into what the
 * picture has to show (product · solution · case · product family · kind of place); `slotImageIssue` says why a picture
 * cannot stand there; `slotCandidates` is the short list the model chooses from. */
const CUT_KINDS = new Set(['cut', 'detail']), UI_KINDS = new Set(['ui', 'cms', 'energy', 'phone', 'content', 'diagram']);
/** Slots that hold drawings, not photographs — never re-picked from the photo library. */
export const STATIC_KINDS = new Set(['icon', 'plan', 'aerial']);
const FAMILY_WORDS = [
  ['디스플레이', /사이니지|메뉴보드|키오스크|디스플레이|전자칠판|비디오월|전광판|모니터|(?:^|[^A-Za-z])TV(?![A-Za-z])|LED|스크린|이페이퍼/i],
  ['공조 · 에어컨', /에어컨|공조|냉난방|무풍|카세트|히트펌프|환기|실외기|칠러|냉방|난방|공기질/],
  ['모바일 · PC', /갤럭시|galaxy|스마트폰|태블릿|노트북|워치|단말|(?:^|[^A-Za-z])PC(?![A-Za-z])/i],
  ['주방 · 리빙 가전', /냉장고|세탁|건조기|식기세척|오븐|인덕션|에어드레서|청소기|정수기|주방 ?가전/],
  ['오디오', /스피커|오디오|사운드바|앰프/], ['프린팅', /프린터|복합기/],
];
/** Product families (catalog `fam`) a text talks about. */
export const familiesIn = text => FAMILY_WORDS.filter(([, re]) => re.test(String(text || ''))).map(([family]) => family);
// [업태, 업종 코드, 낱말] — concrete venue nouns only: a caption must name the place for it to count.
const VENUES = [
  ['백화점', 'RT', /백화점|명품관|면세점|아울렛/], ['쇼핑몰', 'RT', /쇼핑몰|복합몰/], ['마트', 'RT', /대형마트|(?<![가-힣])마트|이마트|슈퍼마켓|SSM/], ['편의점', 'RT', /편의점/],
  ['플래그십', 'RT', /플래그십|쇼룸|전시장|자동차 매장|브랜드 ?스토어|팝업 ?스토어/], ['통신 매장', 'RT', /통신 ?매장|휴대폰 매장|대리점/],
  ['카페', 'FB', /(?<!스터디\s?|PC\s?)카페|커피|베이커리|로스팅/], ['패스트푸드', 'FB', /버거|패스트푸드|드라이브스루|드라이브 스루|(?<![A-Za-z])DT(?![A-Za-z])|퀵서비스|QSR|맥도날드/], ['레스토랑', 'FB', /레스토랑|식당|뷔페|다이닝|푸드코트|제면소/],
  ['호텔', 'HT', /호텔|리조트|객실|연회장|볼룸|풀빌라/], ['병원', 'MD', /병원|(?<![가-힣])의원|클리닉|병동|병실|진료실|수술실|요양|산후조리원|의료원/],
  ['학교', 'ED', /학교|교실|강의실|강의장|강당|캠퍼스|대학|학원|도서관|실습실|교육장|연수원/], ['오피스', 'OF', /오피스(?!텔)|사무실|회의실|사옥|집무실|워크스페이스/],
  ['공장', 'MF', /공장|제조|생산 ?라인|물류|창고|작업장/], ['은행', 'FN', /은행|영업점|증권사|금융 ?지점/], ['교통', 'PB', /공항|지하철|터미널|정류장|환승|철도/], ['공공', 'PB', /시청|구청|청사|민원실|관공서|병영|생활관/],
  ['경기장', 'VN', /경기장|야구장|구장|아레나|스타디움|체육관|피트니스|헬스장/], ['영화관', 'VN', /영화관|시네마|상영관|극장|공연장|예배당/], ['주거', 'RS', /아파트|거실|침실|주택|오피스텔|드레스룸|세탁실|별장/],
  ['무인 매장', 'SV', /스터디 ?카페|스터디센터|무인 ?매장|PC ?방|PC ?카페|스크린골프|빨래방|코인/], ['테마파크', 'TP', /테마파크|놀이공원|전시관|미술관|박물관/],
];
/** Kinds of place (업태) a text names. */
export const venuesIn = text => VENUES.filter(([, , re]) => re.test(String(text || ''))).map(([venue]) => venue);
const venueIndustry = Object.fromEntries(VENUES.map(([venue, ind]) => [venue, ind]));
const STOP = new Set(['이미지', '제품', '사진', '공식', '삼성', 'samsung', '제품컷', 'image', 'photo', '모습', '있는', '있으며', '있습니다', '보여지고', '통해', '위한', '대한', '함께', '그리고', '에서', '으로', '합니다', '됩니다', '확인', '필요', '기준', '이번', '우리', '모든', '가능', 'the', 'and', 'for', 'with']);
const stem = word => { for (let k = 0; k < 2; k++) { const m = /^([가-힣]{2,}?)(?:으로|에서|에게|까지|부터|처럼|보다|마다|이나|이며|이고|하는|하고|하며|하여|하게|되는|되고|되어|에는|에도|을|를|은|는|이|가|의|에|와|과|로|도|만|들)$/.exec(word); if (!m) break; word = m[1]; } return word; };
/** Content words of a caption or a description (particles stripped), for matching the two. */
export const captionWords = text => [...new Set((String(text || '').toLowerCase().match(/[a-z][a-z0-9]{2,}|[가-힣]{2,}/g) || []).map(stem).filter(w => w.length >= 2 && !STOP.has(w)))];
const tagCache = new WeakMap();
// text: everything the picture is filed under · place: only what says where it was taken (a product's name is not a place)
const tagsOf = im => {
  let t = tagCache.get(im);
  if (!t) {
    t = { text: [im.desc, im.title, im.model, ...(im.spaces || [])].filter(Boolean).join(' '), place: [im.desc, ...(im.spaces || []), im.cases?.length ? im.model : ''].filter(Boolean).join(' ') };
    t.words = captionWords(t.text); tagCache.set(im, t);
  }
  return t;
};
const hit = (word, tags) => tags.some(t => t === word || (t.length > 2 || word.length > 2) && (t.includes(word) || word.includes(t)));
const noteNames = (ids, table, key) => ids.map(id => table[id]?.[key]).filter(Boolean);
/** Linked products a text names by model or product name. */
export function linkedProductsIn(text, ids = []) {
  const key = modelKey(text);
  const named = ids.filter(id => {
    const p = P[id]; if (!p) return false;
    const models = [p.model, String(p.model || '').replace(/-S$/i, '')].map(modelKey).filter(m => m.length >= 4 && /\d/.test(m) && /[A-Z]/.test(m));
    const name = modelKey(String(p.name || '').replace(/\([^)]*\)/g, ' '));
    return models.some(m => key.includes(m)) || name.length >= 5 && key.includes(name);
  });
  return [...new Set([...named, ...productsNamedIn(text).filter(id => ids.includes(id))])];
}
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let solutionNames;
/** Linked solutions a text names — by official name, the name without 삼성 / Samsung, or the Korean reading of a brand name. */
export function linkedSolutionsIn(text, ids = []) {
  if (!solutionNames) solutionNames = Object.fromEntries(Object.values(S).map(sol => {
    const names = [sol.name, String(sol.name).replace(/^(?:Samsung|삼성)\s+/i, ''), /[A-Za-z]/.test(sol.name) ? sol.kw?.[0] : ''].filter(n => n && n.length >= 2);
    return [sol.id, [...new Set(names)].map(name => ({ name, re: /^[\x20-\x7e]+$/.test(name) ? new RegExp('(?<![A-Za-z])' + escapeRe(name).replace(/\s+/g, '\\s*') + '(?![A-Za-z])', 'i') : new RegExp(escapeRe(name).replace(/\s+/g, '\\s*')) }))];
  }));
  const found = ids.map(id => ({ id, name: (solutionNames[id] || []).filter(n => n.re.test(text)).sort((a, b) => b.name.length - a.name.length)[0]?.name })).filter(v => v.name);
  // "SmartThings Pro" is not also "SmartThings"; "녹스 캡처" is not also "녹스".
  return found.filter(v => !found.some(o => o !== v && o.name.length > v.name.length && o.name.toLowerCase().includes(v.name.toLowerCase()))).map(v => v.id);
}
const productFamily = id => P[id]?.fam || familiesIn([P[id]?.cat, P[id]?.name].join(' '))[0] || '';
const productWords = new Map();
/** The linked product(s) a caption most plainly describes without naming a model ("The Wall 실내 LED 사이니지"): words of
 * the product's name and category, each worth less the more linked products share it; a caption line that is the
 * product's own name or category ("스마트 사이니지", "LED 사이니지") counts double. */
function describedProducts(near, ids) {
  const words = captionWords(near), lines = String(near).split(' · ').map(modelKey).filter(k => k.length >= 4 && k.length <= 40);
  const all = ids.filter(id => P[id]).map(id => {
    if (!productWords.has(id)) productWords.set(id, { words: captionWords([P[id].name, P[id].cat, P[id].sc].filter(Boolean).join(' ')), names: [P[id].name, P[id].cat, P[id].sc].map(modelKey).filter(k => k.length >= 4) });
    return { id, ...productWords.get(id) };
  });
  const said = w => words.some(t => t === w || t.length > w.length && t.startsWith(w));
  const scored = all.map(p => ({ id: p.id, score: p.words.reduce((a, w) => a + (said(w) ? 1 / all.filter(o => o.words.includes(w)).length : 0), 0)
    + (lines.some(line => p.names.some(name => name.includes(line) || line.includes(name))) ? 2 : 0) })).sort((a, b) => b.score - a.score);
  return scored.length && scored[0].score >= 1 ? scored.filter(v => v.score >= scored[0].score - 1e-9).map(v => v.id) : [];
}
/** What the picture in this slot has to show. slot = { kind, fix, near, title, wide, either }, ctx = { products, solutions, cases, ind, venues }.
 * near: the words next to the slot · wide: every word on the sheet (only to tell which one product a product slot is about) ·
 * either: the frame is drawn for a product *or* a solution (its hint says '제품 · 솔루션' — 가치 제안 장의 칸). */
export function slotTarget(slot = {}, ctx = {}) {
  const near = String(slot.near || ''), linked = ctx.products || [];
  let role = CUT_KINDS.has(slot.kind) || slot.fix === 'product' && !slot.kind ? 'cut' : UI_KINDS.has(slot.kind) ? 'ui' : slot.group === 'cut' && !slot.kind ? 'cut' : slot.group === 'ui' && !slot.kind ? 'ui' : 'scene';
  const words = captionWords(near), families = familiesIn(near);
  const solutions = linkedSolutionsIn(near, ctx.solutions || []);
  let products = linkedProductsIn(near, linked), implied = [];
  // A product-or-solution frame whose words name a linked solution and no linked product shows that solution — its screen or
  // key visual, never a product cut (2026-11-17, pn63a3to: every 가치 제안 frame beside 'MagicINFO' got the QM55C cut).
  //   (these frames are declared product frames in slot modes — fix 'product' — the hint is what says a solution may stand there)
  const solutionFrame = role === 'cut' && !!slot.either && (!slot.fix || slot.fix === 'product') && solutions.length > 0 && !products.length;
  if (solutionFrame) role = 'ui';
  if (!products.length) {
    implied = describedProducts(near, linked);
    if (!implied.length) implied = linked.filter(id => families.includes(productFamily(id)));
    // A product slot whose own words are only feature text: the sheet as a whole may be about one product.
    if ((role === 'cut' || slot.fix === 'product') && !implied.length && !families.length && !solutions.length && slot.wide) {
      const named = linkedProductsIn(slot.wide, linked), described = named.length ? [] : describedProducts(slot.wide, linked);
      if (named.length === 1) products = named; else if (described.length === 1) implied = described;
    }
  }
  const cases = (ctx.cases || []).map(String).filter(id => { const name = String(C[id]?.cust || '').split(/[\s(·,]/)[0]; return name.length >= 2 && near.includes(name); });
  return { role, products, implied, families, solutions, cases, venues: [...new Set([...(ctx.venues || []), ...venuesIn(near + ' ' + (slot.title || ''))])], words, before: /도입 ?전|교체 ?전|기존|현재|지금|as-?is|before/i.test(near), solutionFrame };
}
// The products a picture shows. Tags (library · gallery · the slot's own data) are exact. A product read only from the
// caption is weaker: "객실 벽면 호텔 TV" names a kind of product, and the catalog item that happens to be called
// "호텔 TV" is not the point — when the proposal links a product of that kind (or, the two catalogs naming kinds
// differently, of that family), the picture shows that one.
const kindOf = id => modelKey(P[id]?.sc || P[id]?.cat || '');
const shownCache = new Map();
function shownProducts(im, linkedIds = []) {
  if (im.products?.length) return im.products;
  const key = im.src || im.pid || '';
  if (!key || !shownCache.has(key)) shownCache.set(key, imageProducts({ ...im, products: [] }));
  const ids = shownCache.get(key);
  if (!ids.length || ids.some(id => linkedIds.includes(id))) return ids;
  const kinds = new Set(ids.map(kindOf).filter(Boolean)), families = new Set(ids.map(productFamily).filter(Boolean));
  const same = linkedIds.filter(id => kinds.has(kindOf(id))), akin = same.length ? same : linkedIds.filter(id => families.has(productFamily(id)));
  return akin.length ? akin : ids;
}
/** A picture of a product the proposal has not linked (the check behind "현재 선택한 제품과 다른 이미지"). */
export function showsUnlinkedProduct(image, linkedIds = [], list = []) {
  if (!image) return false;
  const known = knownImage(image, list);
  const tags = known?.products?.length ? known.products : image.products || [];
  const ids = shownProducts({ ...image, products: tags, src: image.src || known?.src || '', desc: image.desc || known?.desc }, linkedIds).filter(id => P[id]);
  return ids.length > 0 && !ids.some(id => linkedIds.includes(id));
}
let curated;
const curatedModels = () => curated || (curated = Object.values(P).filter(p => p.cur && modelKey(p.model).length >= 4).map(p => ({ id: p.id, key: modelKey(p.model) })));
const imageFamilies = im => [...new Set([...shownProducts(im).map(productFamily).filter(Boolean), ...familiesIn(tagsOf(im).text)])];
/** Where the picture was taken: 'same' (the caption names the customer's kind of place) · 'kin' (no place named, but filed under
 * the customer's industry) · 'sibling' (same industry, another kind of place) · 'other' / 'elsewhere' (another industry) · '' (unknown). */
export function venueFit(im, target, ctx = {}) {
  const venues = venuesIn(tagsOf(im).place), ind = imageIndustry(im);
  if (venues.length) {
    if (venues.some(v => target.venues.includes(v))) return 'same';
    if (!ctx.ind && !target.venues.length) return '';
    const inds = [...new Set(venues.map(v => venueIndustry[v]))];
    if (ctx.ind ? !inds.includes(ctx.ind) : !target.venues.some(v => inds.includes(venueIndustry[v]))) return 'other';
    return (ctx.venues || []).length ? 'sibling' : '';
  }
  if (ind && ctx.ind) return ind === ctx.ind ? 'kin' : 'elsewhere';
  return '';
}
/** Why this picture cannot stand in the slot ('' when it can). The same rule filters candidates, decides whether the
 * current picture may be kept, and checks the model's pick afterwards. */
export function slotImageIssue(im, slot, ctx = {}, target = slotTarget(slot, ctx)) {
  if (!im || !im.src) return '사진 없음';
  // 사진 속 정확한 제품(사용자 지시 2026-11-18, services/picture-items.js): 공간 사진 칸은 제품이 없거나 그 공간의 제품이 든 사진만 —
  // 같은 종류의 다른 제품(다른 세탁기)이나 무엇인지 모르는 제품이 든 사진은 안 된다. ctx.spaceItems: 그 칸이 보여 주는 공간의 제품(없으면 제안서의 제품)
  if (slot.kind === 'space') { const why = spacePhotoIssue(im.src, ctx.spaceItems?.length ? ctx.spaceItems : ctx.products || []); if (why) return why; }
  else if (target.role === 'scene' && slot.fix !== 'case') { const why = sceneItemIssue(im.src, ctx.products || []); if (why) return why; }
  const ids = shownProducts(im, ctx.products), linked = ids.filter(id => (ctx.products || []).includes(id));
  if (ids.length && !linked.length) return '연결하지 않은 제품 사진';
  // A caption that names a product family the proposal has no product for ("주방가전") leaves the slot without a picture.
  // …and a product slot labelled with a solution shows a product that solution runs on.
  const through = target.solutions.flatMap(id => S[id]?.with || []).filter(id => (ctx.products || []).includes(id));
  const productSlot = target.role === 'cut' || slot.fix === 'product' && !target.solutionFrame;
  const wanted = target.products.length ? target.products : productSlot ? (target.implied.length ? target.implied : through.length ? through : target.families.length ? [] : ctx.products || []) : [];
  const sol = im.solutions || [], cas = (im.cases || []).map(String);
  if (productSlot) {
    if (!ids.some(id => wanted.includes(id))) return target.products.length ? '옆 글의 제품과 다른 사진' : '연결한 제품 사진이 아님';
    if (target.role === 'cut' && im.group === 'ui') return '제품 컷이 아님';
  } else if (target.products.length && ids.length && !ids.some(id => target.products.includes(id))) return '옆 글의 제품과 다른 제품 사진';
  if (target.role === 'cut' || target.products.length && ids.some(id => target.products.includes(id))) {
    // Shared family assets: a title that names another curated model is that model's picture.
    const title = modelKey([im.title, im.desc].join(' '));
    const named = curatedModels().filter(m => title.includes(m.key));
    if (named.length && !named.some(m => wanted.includes(m.id) || target.products.includes(m.id))) return '다른 모델 사진';
  }
  if (slot.fix === 'solution') {
    const want = target.solutions.length ? target.solutions : ctx.solutions || [];
    const names = noteNames(want, S, 'name').map(n => n.toLowerCase());
    const runsOn = want.some(id => (S[id]?.with || []).some(pid => linked.includes(pid)));
    if (!sol.some(id => want.includes(id)) && !names.some(n => tagsOf(im).text.toLowerCase().includes(n)) && !runsOn) return target.solutions.length ? '옆 글의 솔루션과 다른 사진' : '연결한 솔루션 사진이 아님';
  } else if (target.solutions.length && sol.length && !sol.some(id => target.solutions.includes(id)) && !linked.length) return '옆 글의 솔루션과 다른 솔루션 사진';
  if (slot.fix === 'case') {
    const want = target.cases.length ? target.cases : (ctx.cases || []).map(String);
    if (!cas.some(id => want.includes(id))) return target.cases.length ? '옆 글의 사례와 다른 사진' : '연결한 도입사례 사진이 아님';
    return '';
  }
  if (target.role === 'ui' && im.group && im.group !== 'ui') return '화면 · 구성도가 아님';
  // A screen beside a named solution is that solution's own screen · key visual (by tag, name or model).
  if (target.role === 'ui' && target.solutions.length && !sol.some(id => target.solutions.includes(id))
    && !target.solutions.some(id => tagsOf(im).text.toLowerCase().includes(String(S[id]?.name || '\u0000').toLowerCase()))) return '옆 글의 솔루션 화면이 아님';
  if (target.role === 'scene' && (im.group === 'cut' || im.cut)) return '배경 없는 제품 컷';
  // A screen capture stands in a photo slot only for the solution the caption names.
  if (target.role === 'scene' && im.group === 'ui' && slot.fix !== 'solution' && !sol.some(id => target.solutions.includes(id)) && !target.solutions.some(id => tagsOf(im).text.toLowerCase().includes(String(S[id]?.name).toLowerCase()))) return '사진 칸에 맞지 않는 화면 캡처';
  if (im.group === 'gen' && !target.before) return '도입 전 장면용 보정 사진';
  // (a photo with a background in a product frame — 가치 제안 shows the product once as a cut, then in place — is checked like any photo)
  if (target.role !== 'cut' || (im.group && im.group !== 'cut')) {
    const mine = imageFamilies(im);
    if (target.families.length && mine.length && !mine.some(f => target.families.includes(f))) return '옆 글과 다른 제품군 사진';
    const named = cas.some(id => target.cases.includes(id)) || sol.some(id => target.solutions.includes(id)) || ids.some(id => target.products.includes(id));
    const place = venueFit(im, target, ctx);
    if (!named && im.group !== 'ui' && (place === 'other' || place === 'sibling')) return '고객 업종 · 업태와 다른 공간 사진';
    // Another customer's site stands in as a venue photo only when it is plainly the same kind of place.
    if (cas.length && !(ctx.cases || []).map(String).some(id => cas.includes(id)) && place !== 'same' && !(place === 'kin' && !(ctx.venues || []).length)) return '다른 업태 사례 사진';
  }
  return '';
}
/** The short list for one slot, best first: [{ im, score, lex, entity, place }]. ctx.used: pictures already on other sheets of the deck (by picture identity — picture-identity.js).
 * entity: how firmly the picture is tied to what the caption names · lex: share of the caption's words its description carries. */
export function slotCandidates(pool, slot, ctx = {}, limit = 8) {
  const policy = ctx.imageWeights || activeWeights;
  const target = slotTarget(slot, ctx), N = pool.length || 1;
  const weights = target.words.map(word => { let df = 0; for (const im of pool) if (hit(word, tagsOf(im).words)) df++; return { word, w: df ? Math.log(1 + N / df) : 0 }; }).filter(x => x.w);
  const total = weights.reduce((a, x) => a + x.w, 0) || 1;
  const want = { cut: ['cut'], ui: ['ui'], scene: ['life', 'case'] }[target.role];
  const linkedCases = (ctx.cases || []).map(String);
  const ranked = [];
  for (const im of pool) {
    if (slotImageIssue(im, slot, ctx, target)) continue;
    const tags = tagsOf(im).words, ids = shownProducts(im, ctx.products);
    const lex = weights.reduce((a, x) => a + (hit(x.word, tags) ? x.w : 0), 0) / total;
    const place = target.role === 'cut' ? '' : venueFit(im, target, ctx);
    const entity = (ids.some(id => target.products.includes(id)) ? 10 : ids.some(id => target.implied.includes(id)) ? 3 : 0)
      + ((im.solutions || []).some(id => target.solutions.includes(id)) ? 8 : 0) + ((im.cases || []).some(id => target.cases.includes(String(id))) ? 8 : 0);
    // Without any tie to the caption, the product, or the customer's kind of place a photo is only filler.
    if (target.role === 'scene' && !slot.fix && !entity && !lex && place !== 'same' && place !== 'kin') continue;
    const score = entity * policy.subject + lex * 12 * policy.caption + (want.includes(im.group) ? (target.role === 'cut' ? 6 : 3) : 0) + (target.role === 'cut' && /정면/.test(im.desc || '') ? 1 : 0) + (place === 'same' ? 4 : place === 'kin' ? 2 : place ? -4 : 0) * policy.place
      + (target.role === 'scene' && (im.cases || []).length && !linkedCases.some(id => im.cases.includes(id)) ? -1 : 0)
      + (target.role !== 'cut' && ctx.used?.has(pictureId(im.src)) ? -6 : 0) + (slot.current?.src === im.src ? 1 : 0);
    ranked.push({ im, score, lex, place, entity });
  }
  ranked.sort((a, b) => b.score - a.score);
  // A named product photographed in another industry's venue only stands in when its own venue has too few pictures.
  // slot.mixed: the frame may also take a photo of the product in place (가치 제안 — the product's cut is already shown in the part)
  const cuts = target.role === 'cut' && !slot.mixed ? ranked.filter(c => c.im.group === 'cut') : [];
  if (cuts.length >= 2) ranked.splice(0, ranked.length, ...cuts);
  const home = ranked.filter(c => c.place === 'same' || c.place === 'kin' || !c.place);
  const seen = new Set(), list = [];
  for (const item of home.length >= 3 ? home : [...home, ...ranked.filter(c => !home.includes(c))]) {
    const key = item.im.desc || item.im.src; if (seen.has(key)) continue;
    seen.add(key); list.push(item); if (list.length >= limit) break;
  }
  return list;
}

export function rankImages(list, { models = [], kind, hint, current, productIds = [], contextText = '', wModel = 3, wGroup = 2 }) {
  if (current || productIds.length) return relatedImages(list, { models, kind, hint, current, productIds, contextText });
  const g = KIND_GROUP[kind];
  const h = String(hint || '').toLowerCase();
  return list.map((im) => {
    let s = 0;
    if (models.includes(String(im.model).toUpperCase())) s += wModel * activeWeights.subject;
    if (g && im.group === g) s += wGroup;
    if (h && (im.desc + ' ' + im.model).toLowerCase().split(/\s+/).some((w) => w.length > 1 && h.includes(w))) s += 1.5 * activeWeights.caption;
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
