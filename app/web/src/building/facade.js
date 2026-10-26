// 건물 외관 — 층마다 업종이 드러나는 외벽과 간판, 꼭대기 지붕 · 건물 이름 간판, 1층 입구, 셋백 테라스, 대지(포장 · 나무)
// 업종마다 외벽이 3가지 이상(FACADES[업종] = 변형 목록) — 층마다 floors[i].fv(변형 번호)로 고른다.
// 층 외벽은 네 면(S 앞 · E 오른쪽 · N 뒤 · W 왼쪽)을 따로 묶는다 — 카메라 쪽 면만 걷어 내면 안이 보인다(펼쳐 보기 · 층 고르기).
// 좌표: 층 바닥판 윗면 y = -0.03, 외벽 면 = 바닥판 바깥선(평면에서 0.35m 밖). u = 면을 따라(밖에서 봐서 왼→오), v = 위로, t = 밖으로.
import {
  Group, Mesh, BoxGeometry, PlaneGeometry, CylinderGeometry, SphereGeometry, MeshStandardMaterial, CanvasTexture,
  SRGBColorSpace, RepeatWrapping, Matrix4, Vector3, Color,
} from './lib3.js';
import { Collector, merge, materialFor, keepBase, cachedPart, partPos } from './mesh.js';
import { data } from './data.js';

export const SLAB = 0.35;   // 바닥판이 평면 밖으로 나온 폭 = 외벽 면
export const FH = 3.58;     // 외벽 높이 = 층고 4.0 - 바닥판 0.42
const Y0 = -0.03;           // 바닥판 윗면
const WD = 0.16;            // 벽 두께
const FACE_I = { S: 0, E: 1, N: 2, W: 3 };

// ---------- 업종별 외관 — 업종마다 3가지 이상 ----------
// kind: store 상점 전면 · curtain 커튼월 · fin 석재 핀/격자 · punched 창 · ribbon 띠창 · media LED 미디어 · industrial 금속 패널
//       cinema 극장(포스터 · 전광 띠) · billboard 광고판 · mosaic 패턴 타일(백화점) · blocks 색 블록
// 간판: signStyle panel(색 판 + 흰 글자, 기본) · letters(판 없는 입체 글자) · box(흰 라이트 박스) — 글자는 sign(템플릿 sign이 있으면 그것)
const V = (id, label, kind, sign, o) => ({ id, label, kind, sign, ...o });
export const FACADES = {
  FB: [
    V('terrace', '테라스 카페', 'store', '카페 · 레스토랑', { accent: '#a5532f', frame: '#4a3a2f', wall: '#efe6d8', glass: '#a9c4c8', awning: '#b2593a' }),
    V('bistro', '우드 비스트로', 'store', '비스트로 · 다이닝', { accent: '#8a6440', frame: '#1f1d1c', wall: '#363230', glass: '#b6c3be', screen: '#b3865c', canopy: '#1f1d1c', planter: '#2b2826', signStyle: 'letters', signFg: '#f2dfc2', parapet: '#363230' }),
    V('brick', '브릭 베이커리', 'store', '베이커리 카페', { accent: '#2f5b45', frame: '#262626', wall: '#a4553b', brick: '#d8b8a2', glass: '#b0c7c8', pierW: 0.5, transom: 2.3, awning: '#2f5b45', signFg: '#f7efe2', parapet: '#a4553b' }),
  ],
  RT: [
    V('black', '블랙 플래그십', 'store', '브랜드 플래그십', { accent: '#2a2522', frame: '#2a2522', wall: '#2f2a27', glass: '#b8ccd2', trim: '#b99a62', column: true }),
    V('gallery', '화이트 갤러리', 'store', '플래그십 스토어', { accent: '#b9a27a', frame: '#b9a27a', wall: '#efece6', glass: '#c3d3d6', bay: 5.6, pierW: 0.7, bandH: 0.85, mull: 0, trim: '#b9a27a', signStyle: 'letters', signFg: '#3a332c', parapet: '#efece6' }),
    V('mosaic', '패턴 백화점', 'mosaic', '백화점 · 몰', { accent: '#3a3631', frame: '#3a3631', wall: '#6f675d', glass: '#b9cbd0', tiles: ['#ece7df', '#ddd5c8', '#cbbfae'], signFg: '#f3ede3', parapet: '#ddd5c8' }),
  ],
  SV: [
    V('green', '그린 무인 매장', 'store', '무인 스터디카페', { accent: '#2c7861', frame: '#33433c', wall: '#eceee9', glass: '#a9c5c4' }),
    V('neon', '24시 네온', 'store', '24시 무인 스토어', { accent: '#1b1f27', frame: '#1b1f27', wall: '#272c36', glass: '#93abb7', glow: '#5ee6d6', canopy: '#1b1f27', signFg: '#6ff2e2', parapet: '#272c36' }),
    V('wood', '라이트 우드 스터디', 'store', '스터디 카페', { accent: '#6d5a45', frame: '#6d5a45', wall: '#f4f1ea', glass: '#b2c9c6', louver: '#d6b88e', signStyle: 'letters', signFg: '#4a3826', parapet: '#f4f1ea' }),
  ],
  HT: [
    V('fin', '브라운 핀 호텔', 'punched', '호텔', { accent: '#6a4e3e', wall: '#e5dac9', frame: '#5e4b3e', glass: '#7a99a4', fin: '#9b7b5b', bay: 2.5, win: [1.3, 0.7, 2.78] }),
    V('resort', '화이트 리조트', 'punched', '리조트 · 스파', { accent: '#8a6a4b', wall: '#f5f2ec', frame: '#8a6e52', glass: '#8db2b8', bay: 3.4, win: [2.7, 0.12, 2.8], balcony: 'all', balconyCap: '#b98a5e', signStyle: 'letters', signFg: '#7b5b3d', parapet: '#f5f2ec' }),
    V('grand', '클래식 그랜드', 'punched', '그랜드 호텔', { accent: '#9c7b45', wall: '#e3d7c2', frame: '#3b3530', glass: '#6f8e98', bay: 2.8, win: [0.9, 0.55, 2.45], pair: true, gap: 0.42, pilaster: '#efe6d6', cornice: '#d3c4a8', hood: '#d3c4a8', sill: '#d3c4a8', signBg: '#3b3530', signFg: '#e2c48a', parapet: '#d3c4a8' }),
  ],
  TP: [
    V('fins', '컬러 핀 체험관', 'media', '테마 체험관', { accent: '#a4572a', frame: '#3a3f43', glass: '#6f8b94', spandrel: '#465157', fins: ['#e0a43a', '#d0705a', '#5a9bb0', '#7ba05b'] }),
    V('blocks', '팝 컬러 블록', 'blocks', '키즈 어드벤처', { accent: '#e5654b', frame: '#33393d', wall: '#f6f3ec', glass: '#8fb0bb', palette: ['#f2b632', '#e5654b', '#4fa3c7', '#7bbf6a'], parapet: '#f6f3ec' }),
    V('art', '미디어 아트 큐브', 'media', '미디어 아트 전시관', { accent: '#3b2f7a', frame: '#1d2125', glass: '#5d7280', spandrel: '#24292e', full: true, screen: 'art', parapet: '#2a2f34' }),
  ],
  VN: [
    V('arena', '아레나 LED', 'media', '스포츠 아레나', { accent: '#3a3e8c', frame: '#2f3438', glass: '#637a8b', spandrel: '#40494f' }),
    V('stadium', '스타디움 루버', 'curtain', '스타디움', { accent: '#2c4fa3', frame: '#8b959c', glass: '#6f8796', spandrel: '#2f363c', spH: 0.9, slat: { c: '#d3d9de', gap: 0.34, d: 0.32 }, ledBand: 'sports', parapet: '#cfd5da' }),
    V('cinema', '시네마 콤플렉스', 'cinema', '시네마 · 공연장', { accent: '#b8323a', frame: '#16181b', wall: '#2a2c31', band: '#1d1f23', glass: '#5e6f78', signStyle: 'box', signFg: '#b8323a', canopyColor: '#16181b', parapet: '#2a2c31' }),
  ],
  AD: [
    V('wrap', '코너 랩 미디어', 'media', '미디어 센터', { accent: '#9c561a', frame: '#2c3236', glass: '#5e7783', spandrel: '#3c464c', wrap: true }),
    V('full', '풀 파사드 LED', 'media', 'LED 미디어 타워', { accent: '#1d6f75', frame: '#15191c', glass: '#4f6670', spandrel: '#1e2327', full: true, screen: 'promo2', parapet: '#22282c' }),
    V('billboard', '빌보드 타워', 'billboard', '옥외 광고 센터', { accent: '#9c561a', wall: '#d9dcdd', frame: '#3b4247', glass: '#7e98a3', band: '#9c561a', parapet: '#d9dcdd' }),
  ],
  OF: [
    V('blue', '블루 글라스 커튼월', 'curtain', '오피스', { accent: '#245caa', frame: '#d4dbdf', glass: '#8fb3c7', spandrel: '#6f8b9c' }),
    V('vfin', '알루미늄 수직 핀', 'curtain', '오피스 센터', { accent: '#2d3a44', frame: '#c4cacd', glass: '#a2bcc2', spandrel: '#aeb8bd', module: 1.5, vfin: { c: '#dde2e4', d: 0.5, w: 0.08 }, signStyle: 'letters', signFg: '#1f2a33', parapet: '#d5dadc' }),
    V('shade', '수평 차양', 'curtain', '비즈니스 센터', { accent: '#2f6e8e', frame: '#e6e9e8', glass: '#7fa2b1', spandrel: '#eef0ee', spH: 0.8, hfin: { c: '#f3f4f2', at: [[2.72, 0.9], [2.05, 0.5]] }, parapet: '#eef0ee' }),
    V('dark', '다크 타워', 'curtain', '오피스 타워', { accent: '#b07a4f', frame: '#22272b', glass: '#4f6774', spandrel: '#2a3035', vfin: { c: '#22272b', d: 0.22, w: 0.06 }, line: '#b07a4f', signStyle: 'letters', signFg: '#eadfcf', parapet: '#2a3035' }),
  ],
  RS: [
    V('white', '화이트 발코니', 'punched', '레지던스', { accent: '#53704c', wall: '#f1ede6', frame: '#8f877e', glass: '#88a7af', bay: 3.1, win: [1.9, 0.15, 2.6], balcony: 'SN' }),
    V('brick', '브릭 타운하우스', 'punched', '타운하우스', { accent: '#3d4a3a', wall: '#a45d45', frame: '#f2eee8', glass: '#86a5ad', bay: 2.6, win: [1.2, 0.35, 2.75], brick: '#d9b9a7', rail: '#2b2b2b', sill: '#e8e1d6', signStyle: 'letters', signFg: '#f6f1ea', parapet: '#a45d45' }),
    V('wood', '우드 패널 하우스', 'punched', '분양 홍보관', { accent: '#5b4a3a', wall: '#dcdad5', frame: '#4d4a46', glass: '#8fb0b5', bay: 3.2, win: [1.5, 0.12, 2.7], panel: ['#b88a5c', '#a5774b'], panelW: 0.95, parapet: '#dcdad5' }),
  ],
  ID: [
    V('warm', '웜 쇼룸', 'store', '인테리어 쇼룸', { accent: '#7d5f40', frame: '#6a5642', wall: '#e8ddcd', glass: '#b3c7c6' }),
    V('gallery', '블랙 프레임 갤러리', 'store', '리빙 갤러리', { accent: '#1f1f1f', frame: '#1f1f1f', wall: '#f2f1ee', pier: '#1f1f1f', glass: '#c0d0d2', bay: 5.2, pierW: 0.14, bandH: 0.8, mull: 0, transom: 2.55, signStyle: 'letters', signFg: '#1f1f1f', parapet: '#f2f1ee' }),
    V('stone', '스톤 & 우드', 'store', '디자인 쇼룸', { accent: '#5b4a3a', frame: '#5b4a3a', wall: '#d6cec1', glass: '#b5c8c6', pierW: 0.55, louver: '#9b7651', parapet: '#d6cec1' }),
  ],
  ED: [
    V('brick', '붉은 벽돌 캠퍼스', 'punched', '캠퍼스', { accent: '#2c5885', wall: '#bf7b5c', frame: '#efe9e0', glass: '#809da7', bay: 3.0, win: [1.95, 0.85, 2.78], course: true, brick: '#d9a891' }),
    V('color', '컬러 패널 스쿨', 'punched', '미래 학교', { accent: '#2c5885', wall: '#f3f2ee', frame: '#5f6b73', glass: '#8fb0bb', bay: 3.0, win: [1.6, 0.8, 2.75], panel: ['#f2c14e', '#7cbf72', '#5aa6d1', '#ef8a5a'], panelW: 0.75, parapet: '#f3f2ee' }),
    V('grid', '화이트 그리드', 'fin', '러닝 센터', { accent: '#2c5885', fin: '#f1efe9', frame: '#6d7a80', glass: '#87a6b0', bay: 2.2, finW: 0.3, finD: 0.55, beamD: 0.55, topH: 0.62, signStyle: 'letters', signFg: '#2c5885', parapet: '#f1efe9' }),
  ],
  PB: [
    V('pier', '석재 기둥 청사', 'curtain', '공공 · 교통 센터', { accent: '#2a6a85', frame: '#c5c9c4', glass: '#9fbabd', spandrel: '#8d9c9b', pier: '#dbd8d0', pierEvery: 4 }),
    V('civic', '시민 청사', 'fin', '시청 · 행정센터', { accent: '#2a6a85', fin: '#d9d0bf', frame: '#4e5a5c', glass: '#8aa6a8', bay: 2.6, finW: 0.46, finD: 0.32, beamD: 0.32, topH: 0.64, transomV: 1.2, portico: true, canopyColor: '#d9d0bf', signStyle: 'letters', signFg: '#29495a', parapet: '#d9d0bf' }),
    V('transit', '교통 환승센터', 'ribbon', '교통 환승센터', { accent: '#1f6fb2', wall: '#e9ecec', band: '#1f8a70', frame: '#bcc6c6', glass: '#8fb3b8', w0: 0.6, w1: 2.55, canopy: '#2d3439', parapet: '#e9ecec' }),
  ],
  MD: [
    V('ribbon', '화이트 띠창 메디컬', 'ribbon', '메디컬 센터', { accent: '#2c7c85', wall: '#f2f6f6', frame: '#c8dbdb', glass: '#88b5bb', band: '#3c8992' }),
    V('care', '그린 케어 하우스', 'ribbon', '요양 · 케어센터', { accent: '#5f8a4c', wall: '#f6f2ea', frame: '#c9bca8', glass: '#9cbcb5', band: '#7a9a5b', louver: '#c49a6c', planter: '#8a7a68', parapet: '#f6f2ea' }),
    V('clinic', '블루 글라스 클리닉', 'curtain', '메디컬 클리닉', { accent: '#2c7c85', frame: '#eef2f2', glass: '#8fbcc4', spandrel: '#2f8c96', signStyle: 'box', signFg: '#21737b', signIcon: 'cross', parapet: '#eef2f2' }),
  ],
  MF: [
    V('rib', '골강판 팩토리', 'industrial', '스마트 팩토리', { accent: '#33495a', wall: '#bac3c8', rib: '#a4aeb4', glass: '#9cb6be', frame: '#7c878e' }),
    V('precast', '프리캐스트 공장', 'industrial', '정밀 제조센터', { accent: '#2f6db0', wall: '#e4e2dc', rib: '#c6c3bb', glass: '#9cb6be', frame: '#8a9196', precast: true, stripe: '#2f6db0', parapet: '#e4e2dc' }),
    V('logistics', '물류센터', 'industrial', '물류센터', { accent: '#e07a2f', wall: '#5c646b', rib: '#50585f', glass: '#8fa8b1', frame: '#3f464c', stripe: '#e07a2f', dock: 3, parapet: '#5c646b' }),
  ],
  FN: [
    V('fin', '석재 핀 금융센터', 'fin', '금융센터', { accent: '#1f3a59', frame: '#30363b', glass: '#5f7d8b', fin: '#e3dccf', trim: '#b99a62', transomV: 1.12 }),
    V('bronze', '브론즈 커튼월', 'curtain', '프라이빗 뱅킹', { accent: '#7a5c40', frame: '#6b5139', glass: '#536a74', spandrel: '#5e4733', vfin: { c: '#7a5c40', d: 0.18, w: 0.08 }, line: '#c7a76c', canopyColor: '#4b3828', signStyle: 'letters', signFg: '#e6c98e', parapet: '#5e4733' }),
    V('granite', '그라니트 그리드', 'fin', '은행 본점', { accent: '#1f3a59', fin: '#4b4f53', frame: '#2c2f31', glass: '#6d8791', bay: 2.4, finW: 0.5, finD: 0.45, beamD: 0.45, topH: 0.62, canopyColor: '#2c2f31', signStyle: 'letters', signFg: '#e6c98e', parapet: '#4b4f53' }),
  ],
  OE: [
    V('light', '모바일 스토어', 'store', '모바일 스토어', { accent: '#2f55ad', frame: '#2b3440', wall: '#edf0f4', glass: '#adc4d3' }),
    V('glow', '블루 글로우 쇼룸', 'store', '디바이스 쇼룸', { accent: '#1c48b8', frame: '#1c2433', wall: '#f5f6f8', pier: '#1c2433', glass: '#b7cad8', bay: 4.4, pierW: 0.16, mull: 0, glow: '#4d8dff', signStyle: 'box', signFg: '#1c48b8', parapet: '#f5f6f8' }),
    V('pop', '컬러 피어 팝업', 'store', '에디션 팝업', { accent: '#2f55ad', frame: '#2b3440', wall: '#f7f5f0', glass: '#b3c8d6', piers: ['#2f55ad', '#ffc83d', '#ff7a59', '#45b7a6'], pierW: 0.55, parapet: '#f7f5f0' }),
  ],
  MX: [
    V('tenant', '근린 상가', 'store', '근린생활 시설', { accent: '#3c3f42', frame: '#3c3f42', wall: '#ebe7df', glass: '#aac3c8', bay: 3.4, tenants: true, awning: 'tenant', parapet: '#ebe7df' }),
    V('glass', '복합 글라스', 'curtain', '복합 빌딩', { accent: '#3e5a6b', frame: '#e5e8e7', glass: '#8eb0bf', glass2: '#a9c6c4', spandrel: '#d6dad9', module: 1.6, parapet: '#e5e8e7' }),
    V('stone', '석재 복합몰', 'fin', '복합 몰', { accent: '#6b5a47', fin: '#d9cdb8', frame: '#6b5a47', glass: '#93aab0', bay: 3.0, finW: 0.4, finD: 0.3, beamD: 0.3, topH: 0.6, transomV: 1.15, canopyColor: '#6b5a47', signStyle: 'letters', signFg: '#4f3f2f', parapet: '#d9cdb8' }),
  ],
};
export const variantsOf = (ind) => FACADES[ind] || FACADES.OF;
export function kitOf(ind, fv = 0) {
  const vs = variantsOf(ind);
  const k = Math.round(Number(fv) || 0);
  return vs[((k % vs.length) + vs.length) % vs.length];
}
// 고르기 화면 견본 색 — 벽(또는 틀) · 유리 · 업종 색
export function swatchOf(kit) {
  const body = kit.kind === 'fin' ? kit.fin : kit.kind === 'curtain' || kit.kind === 'media' ? kit.spandrel || kit.frame : kit.wall || kit.frame;
  return [body, kit.glass, kit.palette ? kit.palette[0] : kit.piers ? kit.piers[1] : kit.awning && kit.awning !== 'tenant' ? kit.awning : kit.accent];
}

let FONT = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif";
export function setFont(f) { if (f && f.trim()) FONT = f; }

const shade = (hex, k) => '#' + new Color(hex).multiplyScalar(k).getHexString();
const lum = (hex) => { const c = new Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
function hash(n) {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return x >>> 0;
}

// ---------- 글자 · 영상 질감 ----------
// bg가 없으면 투명 바탕(입체 글자). icon 'cross' = 글자 앞 십자 표시(의료)
function textTexture(text, { bg, fg = '#ffffff', px = 74, h = 128, pad = 0.6, weight = 700, line = null, maxW = 2048, icon = null }) {
  const c = document.createElement('canvas');
  let g = c.getContext('2d');
  g.font = `${weight} ${px}px ${FONT}`;
  const tw = Math.ceil(g.measureText(text).width);
  const p = Math.round(px * pad);
  const iw = icon ? Math.round(px * 1.05) : 0;
  c.width = Math.min(maxW, Math.max(Math.round(h * (bg ? 2.2 : 1)), tw + iw + p * 2));
  c.height = h;
  g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, c.width, h); }
  if (line) { g.fillStyle = line; g.fillRect(0, h - Math.round(h * 0.08), c.width, Math.round(h * 0.08)); }
  const fit = Math.min(1, (c.width - p * 2 - iw) / Math.max(1, tw));
  g.font = `${weight} ${Math.floor(px * fit)}px ${FONT}`;
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const cx = c.width / 2 + iw / 2, cy = h / 2 + px * fit * 0.04 - (line ? h * 0.03 : 0);
  g.fillText(text, cx, cy);
  if (icon === 'cross') {
    const s = px * 0.74 * fit, x = cx - (tw * fit) / 2 - iw * 0.62, k = s * 0.32;
    g.fillRect(x - k / 2, cy - s / 2, k, s);
    g.fillRect(x - s / 2, cy - k / 2, s, k);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.own = true; // 층을 지울 때 같이 지운다
  return { tex: t, aspect: c.width / h };
}
function signMaterial(tex, { letters = false, glow = 0.2 } = {}) {
  return keepBase(new MeshStandardMaterial({
    map: tex, roughness: 0.5, metalness: 0, emissive: new Color('#ffffff'), emissiveMap: tex, emissiveIntensity: glow,
    alphaTest: letters ? 0.45 : 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
}

// 그려 둔 캔버스 질감(층마다 같이 쓴다 — 지우지 않음)
const TEX = new Map();
function canvasTex(key, w, h, draw) {
  let e = TEX.get(key);
  if (e) return e;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  e = { tex, aspect: w / h };
  TEX.set(key, e);
  return e;
}
function glowSpot(g, x, y, r, a) {
  const rg = g.createRadialGradient(x, y, 0, x, y, r);
  rg.addColorStop(0, `rgba(255,255,255,${a})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
}
function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const SCREENS = {
  // 광고 — 그라데이션 · 문구 자리(막대) · 원
  promo: [1024, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 1024, 256);
    gr.addColorStop(0, '#16307a'); gr.addColorStop(0.42, '#4b2f92'); gr.addColorStop(0.72, '#b8457c'); gr.addColorStop(1, '#f19a45');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
    for (const [x, y, r, a] of [[210, 40, 200, 0.26], [660, 230, 240, 0.2], [930, 30, 150, 0.24], [430, 140, 120, 0.12]]) glowSpot(g, x, y, r, a);
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(84, 86, 300, 30); g.fillRect(84, 128, 210, 16);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(84, 156, 250, 10);
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 4; g.strokeRect(84, 186, 120, 34);
    g.fillStyle = 'rgba(255,255,255,0.16)'; g.beginPath(); g.arc(800, 128, 88, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.32)'; g.beginPath(); g.arc(800, 128, 52, 0, Math.PI * 2); g.fill();
  }],
  // 전면 LED — 큰 문구
  promo2: [2048, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#0b3b5c'); gr.addColorStop(0.45, '#0f7c8c'); gr.addColorStop(0.8, '#38c79a'); gr.addColorStop(1, '#d9f26b');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (const [x, y, r, a] of [[300, 40, 260, 0.22], [1500, 220, 300, 0.18], [1900, 30, 180, 0.22]]) glowSpot(g, x, y, r, a);
    g.fillStyle = 'rgba(255,255,255,0.96)'; g.textBaseline = 'middle';
    g.font = `800 ${Math.round(h * 0.4)}px ${FONT}`; g.fillText('LED 미디어 파사드', 110, h * 0.45);
    g.fillStyle = 'rgba(255,255,255,0.72)'; g.font = `700 ${Math.round(h * 0.13)}px ${FONT}`; g.fillText('CITY  ·  CULTURE  ·  NOW', 118, h * 0.8);
    g.fillStyle = 'rgba(255,255,255,0.16)'; rrect(g, 1460, 48, 320, 160, 26); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 6; rrect(g, 1460, 48, 320, 160, 26); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(1620, 128, 42, 0, Math.PI * 2); g.fill();
  }],
  // 미디어 아트 — 흐르는 색 띠 · 빛 점
  art: [2048, 256, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, 0);
    bg.addColorStop(0, '#0d1b3d'); bg.addColorStop(0.5, '#1b1446'); bg.addColorStop(1, '#0b2a3a');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const cols = ['#ff5fa2', '#ffd166', '#36d1dc', '#8f6bff', '#7ae582'];
    for (let k = 0; k < cols.length; k++) {
      g.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = h * (0.5 + 0.3 * Math.sin((x / w) * Math.PI * (3 + k * 0.7) + k * 1.7) + 0.08 * Math.sin((x / w) * Math.PI * 11 + k));
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.lineWidth = 22 - k * 3; g.strokeStyle = cols[k]; g.globalAlpha = 0.8; g.stroke();
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 90; i++) {
      const x = (i * 97.3) % w, y = (i * 53.7) % h, r = 1.5 + (i % 4);
      g.fillStyle = `rgba(255,255,255,${0.35 + (i % 3) * 0.2})`; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }],
  // 경기장 띠 전광판 — 홈 · 원정 · 점수 · 안내
  sports: [2048, 128, (g, w, h) => {
    g.fillStyle = '#0c1430'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2c4fa3'; g.fillRect(0, 0, 420, h);
    g.fillStyle = '#c8323b'; g.fillRect(760, 0, 420, h);
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.font = `800 ${Math.round(h * 0.5)}px ${FONT}`; g.fillText('HOME', 210, h / 2); g.fillText('AWAY', 970, h / 2);
    g.fillStyle = '#ffd34d'; g.font = `800 ${Math.round(h * 0.62)}px ${FONT}`; g.fillText('3 : 2', 590, h / 2);
    g.textAlign = 'left'; g.fillStyle = '#ffffff'; g.font = `700 ${Math.round(h * 0.36)}px ${FONT}`;
    g.fillText('오늘의 경기  19:00  ·  WELCOME TO THE STADIUM', 1240, h / 2);
    g.fillStyle = 'rgba(255,255,255,0.18)'; for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 1, h);
  }],
  // 극장 포스터 4장 (가로로 나란히)
  poster: [1024, 384, (g) => {
    const P = [['#c2253a', '#1a0d1f', '액션'], ['#0f6b7a', '#06161c', '어드벤처'], ['#e08a2e', '#2a1036', '판타지'], ['#3d7a3a', '#0d1a12', '드라마']];
    P.forEach(([c1, c2, t], k) => {
      const x = k * 256;
      const gr = g.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.fillRect(x, 0, 256, 384);
      glowSpot(g, x + 128, 120, 120, 0.35);
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(x + 128, 250, 46, 90, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `800 46px ${FONT}`; g.fillText(t, x + 128, 318);
      g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x + 70, 350, 116, 7);
      g.font = `700 18px ${FONT}`; g.fillText('NOW SHOWING', x + 128, 34);
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 6; g.strokeRect(x + 3, 3, 250, 378);
    });
  }],
  // 광고판 4장 (2 × 2)
  billboard: [1024, 576, (g) => {
    const A = [['#ffcf3f', '#1b1b1b', '신제품 출시'], ['#1f6fd6', '#ffffff', '여름 세일'], ['#e2483d', '#ffffff', '여행 페스타'], ['#20a77a', '#ffffff', 'NEW 컬렉션']];
    A.forEach(([bg, fg, t], k) => {
      const x = (k % 2) * 512, y = Math.floor(k / 2) * 288;
      g.fillStyle = bg; g.fillRect(x, y, 512, 288);
      glowSpot(g, x + 400, y + 90, 160, 0.3);
      g.fillStyle = 'rgba(255,255,255,0.28)'; rrect(g, x + 330, y + 70, 130, 150, 22); g.fill();
      g.fillStyle = fg; g.textBaseline = 'middle'; g.textAlign = 'left';
      g.font = `800 50px ${FONT}`; g.fillText(t, x + 36, y + 120);
      g.globalAlpha = 0.7; g.fillRect(x + 38, y + 170, 190, 12); g.fillRect(x + 38, y + 194, 130, 12); g.globalAlpha = 1;
    });
  }],
};
const ATLAS = { poster: [4, 1], billboard: [2, 2] };
function atlasUV(name, k) {
  const [cx, cy] = ATLAS[name], n = cx * cy, i = ((k % n) + n) % n, c = i % cx, r = Math.floor(i / cx);
  return [c / cx, 1 - (r + 1) / cy, (c + 1) / cx, 1 - r / cy];
}
function screenTex(name) {
  const s = SCREENS[name] || SCREENS.promo;
  return canvasTex('scr:' + name, s[0], s[1], s[2]);
}
function mediaMaterial(name) {
  const t = screenTex(name).tex;
  return keepBase(new MeshStandardMaterial({
    map: t, emissive: new Color('#ffffff'), emissiveMap: t, emissiveIntensity: name === 'poster' || name === 'billboard' ? 0.5 : 0.62, roughness: 0.35, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
}
// 근린 상가 — 점포 간판(한 장에 여러 줄)
const TENANTS = [['카페', '#a5532f'], ['편의점', '#2f6db0'], ['베이커리', '#b5813a'], ['약국', '#2f8f5b'], ['스터디카페', '#2c7861'], ['꽃집', '#b4547a'], ['모바일', '#2f55ad'], ['세탁', '#5b6f8f'], ['안경', '#3a3f45'], ['헬스', '#c4583a']];
function tenantAtlas() {
  return canvasTex('tenant', 512, 96 * TENANTS.length, (g) => {
    TENANTS.forEach(([t, c], k) => {
      g.fillStyle = c; g.fillRect(0, k * 96, 512, 96);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `800 54px ${FONT}`; g.fillText(t, 256, k * 96 + 50);
    });
  });
}
const tenantUV = (k) => [0, 1 - (k + 1) / TENANTS.length, 1, 1 - k / TENANTS.length];
let paveTex = null;
function pavingTexture() {
  if (paveTex) return paveTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e4e1da'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const k = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
    const n = (k - Math.floor(k)) * 10 - 5;
    g.fillStyle = `rgb(${226 + n},${223 + n},${216 + n})`;
    g.fillRect(i * 64 + 1, j * 64 + 1, 62, 62);
  }
  paveTex = new CanvasTexture(c);
  paveTex.colorSpace = SRGBColorSpace;
  paveTex.wrapS = paveTex.wrapT = RepeatWrapping;
  paveTex.anisotropy = 4;
  return paveTex;
}

// ---------- 면 하나 그리기 ----------
const UNIT = new BoxGeometry(1, 1, 1);
const UNIT_PLANE = new PlaneGeometry(1, 1);
const PARASOL = new CylinderGeometry(0.06, 1.15, 0.36, 12);
const _m = new Matrix4(), _r = new Matrix4(), _s = new Matrix4(), _axis = new Vector3();
function uvPlane(uv) {
  const g = new PlaneGeometry(1, 1), a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  return g;
}
function sideDefs(w, d) {
  const x0 = -SLAB, x1 = w + SLAB, z0 = -SLAB, z1 = d + SLAB;
  return [
    { id: 'S', o: [x0, z1], u: [1, 0], n: [0, 1], len: x1 - x0, rot: 0, street: true },
    { id: 'E', o: [x1, z1], u: [0, -1], n: [1, 0], len: z1 - z0, rot: Math.PI / 2, street: true },
    { id: 'N', o: [x1, z0], u: [-1, 0], n: [0, -1], len: x1 - x0, rot: Math.PI, street: false },
    { id: 'W', o: [x0, z0], u: [0, 1], n: [-1, 0], len: z1 - z0, rot: -Math.PI / 2, street: false },
  ];
}
class Side {
  constructor(def) {
    Object.assign(this, def);
    // 짧은 면(E · W)은 긴 면의 벽 두께만큼 안쪽에서 시작 — 모서리가 겹치지 않게
    this.a = def.id === 'E' || def.id === 'W' ? WD : 0;
    this.b = def.len - this.a;
    this.col = new Collector();
    this.planes = new Map();
  }
  pos(u, t) { return [this.o[0] + this.u[0] * u + this.n[0] * t, this.o[1] + this.u[1] * u + this.n[1] * t]; }
  box(u0, u1, v0, v1, t0, t1, color, { key = 'vc', tilt = 0 } = {}) {
    const du = u1 - u0, dv = v1 - v0, dt = t1 - t0;
    if (du < 0.005 || dv < 0.005 || dt < 0.002) return;
    const [x, z] = this.pos((u0 + u1) / 2, (t0 + t1) / 2);
    _s.makeScale(Math.abs(this.u[0]) * du + Math.abs(this.n[0]) * dt, dv, Math.abs(this.u[1]) * du + Math.abs(this.n[1]) * dt);
    _m.makeTranslation(x, Y0 + (v0 + v1) / 2, z);
    if (tilt) _m.multiply(_r.makeRotationAxis(_axis.set(this.u[0], 0, this.u[1]), tilt));
    this.col.add(key, UNIT, _m.multiply(_s), color);
  }
  glass(u0, u1, v0, v1, color, t0 = -0.11, t1 = -0.07) { this.box(u0, u1, v0, v1, t0, t1, color, { key: 'vcglass' }); }
  glow(u0, u1, v0, v1, t0, t1, color) { this.box(u0, u1, v0, v1, t0, t1, color, { key: 'vcglow' }); }
  // 세로 막대 — 면 끝을 넘지 않게
  vbar(u, w, v0, v1, t0, t1, color) { this.box(Math.max(this.a, u - w / 2), Math.min(this.b, u + w / 2), v0, v1, t0, t1, color); }
  // 질감 판 — kind = 재질 키(sign · tenant · media:이름 · poster …), uv = 질감에서 쓸 부분 [u0, v0, u1, v1]
  plane(kind, u0, u1, v0, v1, t, uv = null) {
    const [x, z] = this.pos((u0 + u1) / 2, t);
    _s.makeScale(u1 - u0, v1 - v0, 1);
    _m.makeTranslation(x, Y0 + (v0 + v1) / 2, z).multiply(_r.makeRotationY(this.rot)).multiply(_s);
    let list = this.planes.get(kind);
    if (!list) this.planes.set(kind, (list = []));
    list.push({ geo: uv ? uvPlane(uv) : UNIT_PLANE, matrix: _m.clone() });
  }
  // 간판: (테두리 판 +) 글자 면. h = 글자 면 높이, aspect = 질감 가로/세로. edge가 없으면 판 없는 입체 글자
  sign(u, v, h, aspect, edge, { t = 0, maxW = Infinity, kind = 'sign', uv = null } = {}) {
    let w = h * aspect;
    if (w > maxW) { h *= maxW / w; w = maxW; }
    if (edge) {
      this.box(u - w / 2 - 0.05, u + w / 2 + 0.05, v - h / 2 - 0.05, v + h / 2 + 0.05, t, t + 0.07, edge);
      this.plane(kind, u - w / 2, u + w / 2, v - h / 2, v + h / 2, t + 0.072, uv);
    } else this.plane(kind, u - w / 2, u + w / 2, v - h / 2, v + h / 2, t + 0.03, uv);
    return w;
  }
  group(mats) {
    const g = new Group();
    for (const [key, items] of this.col.groups) {
      const mesh = new Mesh(merge(items, true), mats.get(key));
      mesh.castShadow = key === 'vc';
      mesh.receiveShadow = key !== 'vcglow';
      if (key === 'vcglass') mesh.renderOrder = 2;
      g.add(mesh);
    }
    for (const [kind, items] of this.planes) {
      const mat = mats.get(kind);
      if (!mat) continue;
      const mesh = new Mesh(merge(items, false), mat);
      mesh.receiveShadow = true;
      // 간판 글자 면 — 누르면 이름 바꾸기(무대가 맞은 물체에서 이 표시를 찾는다)
      if (kind === 'sign' || kind === 'tenant') mesh.userData.sign = true;
      g.add(mesh);
    }
    g.userData.side = this.id;
    return g;
  }
}
// 재질은 쓰는 것만 만든다
class Mats {
  constructor(make) { this.make = make; this.m = new Map(); }
  get(key) {
    let m = this.m.get(key);
    if (!m) { m = this.make(key); if (m) this.m.set(key, m); }
    return m;
  }
  all() { return [...this.m.values()]; }
}

// 칸 나누기 — 1층 정면은 가운데 칸이 입구가 되도록 홀수 칸
function grid(a, b, target, odd) {
  const len = b - a;
  let n = Math.max(1, Math.round(len / target));
  if (odd && n % 2 === 0) n = len / (n + 1) >= target * 0.82 ? n + 1 : Math.max(1, n - 1);
  const bw = len / n;
  return Array.from({ length: n }, (_, i) => [a + i * bw, a + (i + 1) * bw]);
}
// 입구 칸: 가운데 칸(좁으면 가운데 세 칸, 너무 넓으면 가운데 3.6m)
function entranceOf(bays) {
  const c = Math.floor(bays.length / 2);
  const bw = bays[0][1] - bays[0][0];
  const k = bw < 2.4 && bays.length >= 3 ? 1 : 0;
  const E = { i0: c - k, i1: c + k, u0: bays[c - k][0], u1: bays[c + k][1] };
  E.open = [E.u0, E.u1];
  return E;
}
const inE = (E, i) => E && i >= E.i0 && i <= E.i1;
// 벽돌 줄눈 — v0~v1 사이 step 간격 가로줄, holes([u0, u1, v0, v1])를 피해 끊는다
function coursing(sd, u0, u1, v0, v1, step, holes, color, t0 = -0.01, t1 = 0.004) {
  for (let v = v0 + step; v < v1 - 0.03; v += step) {
    let segs = [[u0, u1]];
    for (const [a, b, c, d] of holes) {
      if (v + 0.018 < c || v > d) continue;
      segs = segs.flatMap(([p, q]) => (b <= p || a >= q ? [[p, q]] : [[p, Math.min(q, a)], [Math.max(p, b), q]].filter(([x, y]) => y - x > 0.04)));
    }
    for (const [p, q] of segs) sd.box(p, q, v, v + 0.018, t0, t1, color);
  }
}
// 1층 가게 앞 차양 (기울어진 천 + 앞 드리개)
function awning(sd, a0, a1, att, color) {
  const th = 0.36, dep = 1.15;
  const vc = att - (dep / 2) * Math.sin(th), tc = (dep / 2) * Math.cos(th);
  sd.box(a0, a1, vc - 0.03, vc + 0.03, tc - dep / 2, tc + dep / 2, color, { tilt: th });
  const vo = att - dep * Math.sin(th), to = dep * Math.cos(th);
  sd.box(a0, a1, vo - 0.24, vo, to - 0.03, to + 0.01, shade(color, 0.8));
}
const darkOf = (kit) => kit.doorFrame || (lum(kit.frame) < 0.04 ? kit.frame : shade(kit.frame, 0.55));

// 1층 입구 — 문틀 · 유리문 · 상부창 · 캐노피(portico = 기둥 두 개가 받치는 깊은 지붕). head = 그 위를 업종 외벽이 덮는 높이
function entrance(sd, kit, E, head, { canopy = true, portico = false } = {}) {
  const { u0, u1 } = E, fr = darkOf(kit);
  const dh = Math.min(2.45, head - 0.12);
  sd.box(u0, u1, 0, 0.05, -WD, 0.02, fr);
  sd.vbar(u0 + 0.06, 0.12, 0, head, -WD, 0.04, fr);
  sd.vbar(u1 - 0.06, 0.12, 0, head, -WD, 0.04, fr);
  sd.box(u0 + 0.12, u1 - 0.12, dh, dh + 0.09, -0.15, 0.0, fr);
  if (head - dh > 0.2) sd.glass(u0 + 0.12, u1 - 0.12, dh + 0.09, head, kit.glass || '#a9c4c8');
  // 문짝 — 유리 + 얇은 틀, 안쪽으로 조금 들어가 있다
  const leaves = u1 - u0 > 3.4 ? 4 : 2, lw = (u1 - u0 - 0.24) / leaves;
  for (let k = 0; k < leaves; k++) {
    const a = u0 + 0.12 + k * lw, b = a + lw;
    sd.glass(a + 0.04, b - 0.04, 0.05, dh, '#9fb9c0', -0.32, -0.29);
    sd.box(a, a + 0.04, 0.05, dh, -0.34, -0.27, fr); sd.box(b - 0.04, b, 0.05, dh, -0.34, -0.27, fr);
    sd.box(a + (k % 2 ? 0.1 : lw - 0.14), a + (k % 2 ? 0.14 : lw - 0.1), 0.95, 1.25, -0.27, -0.24, '#c9ced1'); // 손잡이
  }
  sd.box(u0 + 0.12, u1 - 0.12, 0.0, 0.03, -0.34, -WD, '#c9c6bf'); // 문 앞 바닥
  if (!canopy) return;
  const mid = (u0 + u1) / 2;
  const cc = kit.canopyColor || (kit.kind === 'store' ? kit.accent : lum(kit.frame) < 0.04 ? kit.frame : '#2d3439');
  if (portico) {
    const cw = u1 - u0 + 3.2, dep = 3.3, cv = Math.min(head, FH - 0.6) + 0.02;
    sd.box(mid - cw / 2, mid + cw / 2, cv, cv + 0.34, 0, dep, cc);
    sd.box(mid - cw / 2, mid + cw / 2, cv + 0.34, cv + 0.4, 0.05, dep + 0.05, shade(cc, 0.86));
    sd.box(mid - cw / 2 + 0.5, mid + cw / 2 - 0.5, cv - 0.02, cv, 0.35, dep - 0.35, '#fff3d6');
    for (const s of [-1, 1]) { const x = mid + s * (cw / 2 - 0.5); sd.box(x - 0.21, x + 0.21, 0, cv, dep - 0.72, dep - 0.3, cc); }
    return;
  }
  const cw = u1 - u0 + 1.6, cv = Math.min(head, 2.62) + 0.02; // 위 간판(스팬드럴 · 띠)을 덮지 않는 높이
  sd.box(mid - cw / 2, mid + cw / 2, cv, cv + 0.16, 0, 2.1, cc);
  sd.box(mid - cw / 2, mid + cw / 2, cv - 0.05, cv, 1.96, 2.1, shade(cc, 0.7));
  sd.box(mid - cw / 2 + 0.3, mid + cw / 2 - 0.3, cv - 0.02, cv, 0.2, 1.8, '#fff3d6'); // 캐노피 아래 조명 띠
}
// 1층 거리 쪽 긴 차양(캐노피) — 입구 캐노피 대신
function streetCanopy(sd, v, dep, color, posts = false) {
  sd.box(sd.a + 0.3, sd.b - 0.3, v, v + 0.16, 0, dep, color);
  sd.box(sd.a + 0.3, sd.b - 0.3, v - 0.06, v + 0.16, dep - 0.1, dep, shade(color, 0.75));
  sd.box(sd.a + 0.6, sd.b - 0.6, v - 0.02, v, 0.25, dep - 0.25, '#fff3d6');
  if (posts) for (const u of grid(sd.a + 0.8, sd.b - 0.8, 6, false).map(([p]) => p).concat(sd.b - 0.8)) sd.box(u - 0.09, u + 0.09, 0, v, dep - 0.35, dep - 0.17, '#5b646a');
}

// ---------- 업종별 면 ----------
function store(sd, kit, ctx) {
  const bandH = kit.bandH || 1.0, band = FH - bandH;
  const bandC = kit.band || kit.wall;
  if (!sd.street) {
    // 뒤쪽 면 — 막힌 벽에 작은 창
    sd.box(sd.a, sd.b, 0, FH, -WD, 0, kit.wall);
    const wf = kit.backFrame || (kit.wall === kit.frame ? '#5a524b' : kit.frame);
    const holes = [];
    for (const [u0, u1] of grid(sd.a, sd.b, 3.6, false)) {
      const m = (u0 + u1) / 2;
      sd.box(m - 0.62, m + 0.62, 1.08, 2.42, 0, 0.03, wf);
      sd.glass(m - 0.55, m + 0.55, 1.15, 2.35, kit.glass, 0.03, 0.045);
      sd.box(m - 0.66, m + 0.66, 1.04, 1.1, 0, 0.08, wf);
      holes.push([m - 0.66, m + 0.66, 1.04, 2.42]);
    }
    sd.box(sd.a, sd.b, band, FH, 0, 0.06, bandC);
    if (kit.brick) {
      coursing(sd, sd.a, sd.b, 0, band, 0.24, holes, kit.brick);
      coursing(sd, sd.a, sd.b, band, FH, 0.24, [], kit.brick, 0.05, 0.064);
    }
    if (kit.louver) for (let u = sd.a + 0.14; u < sd.b - 0.08; u += 0.2) sd.box(u - 0.035, u + 0.035, band + 0.05, FH - 0.05, 0.06, 0.15, kit.louver);
    return { signV: FH - 0.5, signH: 0.5, signT: kit.louver ? 0.09 : 0 };
  }
  const bays = grid(sd.a, sd.b, kit.bay || 3.6, ctx.door && sd.id === 'S');
  const E = ctx.door && sd.id === 'S' ? entranceOf(bays) : null;
  const pw = kit.pierW || 0.32;
  sd.box(sd.a, sd.b, 0, 0.1, -WD, 0.02, kit.frame);
  let ti = 0;
  const tenants = [];
  bays.forEach(([u0, u1], i) => {
    if (inE(E, i)) return;
    const g0 = u0 + pw / 2, g1 = u1 - pw / 2;
    sd.glass(g0, g1, 0.1, band, kit.glass);
    sd.box(g0, g1, band - 0.06, band, -0.1, -0.03, kit.frame);
    const nm = kit.mull ?? 1;
    for (let k = 1; k <= nm; k++) { const m = g0 + ((g1 - g0) * k) / (nm + 1); sd.box(m - 0.025, m + 0.025, 0.1, band, -0.1, -0.03, kit.frame); }
    if (kit.transom) sd.box(g0, g1, kit.transom - 0.03, kit.transom + 0.03, -0.1, -0.03, kit.frame);
    // 유리 위쪽 나무 살 가림
    if (kit.screen) for (let u = g0 + 0.1; u < g1 - 0.05; u += 0.17) sd.box(u - 0.028, u + 0.028, band - 1.05, band - 0.06, -0.03, 0.06, kit.screen);
    // 점포(근린 상가) — 칸마다 다른 가게
    const tk = kit.tenants ? (ti++ + ctx.index * 3 + FACE_I[sd.id] * 2) % TENANTS.length : -1;
    if (tk >= 0) tenants.push({ u: (u0 + u1) / 2, w: g1 - g0, k: tk });
    // 차양 (1층)
    if (kit.awning && ctx.index === 0) awning(sd, g0 + 0.14, g1 - 0.14, band - 0.04, tk >= 0 ? TENANTS[tk][1] : kit.awning);
    // 창가 화분 (2층부터)
    if (kit.planter && ctx.index > 0) {
      sd.box(g0 + 0.1, g1 - 0.1, 0.0, 0.42, 0.02, 0.36, kit.planter);
      sd.box(g0 + 0.16, g1 - 0.16, 0.42, 0.56, 0.05, 0.33, '#6f9460');
    }
  });
  const piers = bays.map(([u0]) => u0).concat([sd.b]);
  piers.forEach((u, k) => {
    if (E && k > E.i0 && k <= E.i1) return;
    sd.vbar(u, pw, 0, FH, -WD, 0.04, kit.piers ? kit.piers[(k + ctx.index) % kit.piers.length] : kit.pier || kit.wall);
    if (kit.brick) coursing(sd, Math.max(sd.a, u - pw / 2), Math.min(sd.b, u + pw / 2), 0.1, band, 0.22, [], kit.brick, 0.03, 0.046);
  });
  // 간판 띠
  sd.box(sd.a, sd.b, band, FH, -WD, 0.07, bandC);
  if (kit.brick) coursing(sd, sd.a, sd.b, band, FH, 0.22, [], kit.brick, 0.06, 0.076);
  if (kit.trim) sd.box(sd.a, sd.b, band - 0.05, band, 0, 0.08, kit.trim);
  if (kit.glow) sd.glow(sd.a + 0.1, sd.b - 0.1, band - 0.1, band - 0.05, -0.02, 0.09, kit.glow);
  if (kit.louver) for (let u = sd.a + 0.14; u < sd.b - 0.08; u += 0.2) sd.box(u - 0.035, u + 0.035, band + 0.05, FH - 0.05, 0.07, 0.16, kit.louver);
  // 1층 긴 캐노피
  if (kit.canopy && ctx.index === 0) streetCanopy(sd, band - 0.22, 1.3, kit.canopy);
  // 리테일 1층 — 모서리 미디어 칼럼
  if (kit.column && sd.id === 'S' && ctx.index === 0) {
    const u1 = sd.b - 0.45, u0 = u1 - 1.15;
    sd.box(u0 - 0.06, u1 + 0.06, 0.1, band - 0.1, 0, 0.16, '#1b1d20');
    sd.plane('media:promo', u0, u1, 0.18, band - 0.18, 0.165, [0.62, 0, 0.9, 1]);
  }
  // 점포 간판
  for (const tn of tenants) {
    const h = Math.min(0.48, bandH - 0.36);
    const own = ctx.ownSign;
    sd.sign(tn.u, FH - bandH / 2, h, own ? own.aspect() : 512 / 96, shade(TENANTS[tn.k][1], 0.62), { t: kit.louver ? 0.16 : 0.07, maxW: tn.w - 0.3, kind: own ? 'sign' : 'tenant', uv: own ? null : tenantUV(tn.k) });
  }
  if (E) {
    entrance(sd, kit, E, band, { canopy: !(kit.canopy && ctx.index === 0) });
    if (kit.glow) { sd.glow(E.u0 + 0.02, E.u0 + 0.07, 0.05, band - 0.05, 0.04, 0.08, kit.glow); sd.glow(E.u1 - 0.07, E.u1 - 0.02, 0.05, band - 0.05, 0.04, 0.08, kit.glow); }
  }
  return { E, signV: FH - bandH / 2, signH: Math.min(0.72, bandH - 0.28), signT: kit.louver ? 0.16 : 0.07, tenants: tenants.length > 0 };
}
function punched(sd, kit, ctx) {
  const bays = grid(sd.a, sd.b, kit.bay, ctx.door && sd.id === 'S');
  const E = ctx.door && sd.id === 'S' ? entranceOf(bays) : null;
  const [ww, w0, w1] = kit.win;
  const fr = kit.frame;
  const top = kit.cornice ? FH - 0.32 : FH;
  sd.box(sd.a, sd.b, w1, FH, -WD, 0, kit.wall);
  if (kit.course) sd.box(sd.a, sd.b, FH - 0.3, FH, -WD, 0.035, kit.frame);
  const holes = [];
  bays.forEach(([u0, u1], i) => {
    if (inE(E, i)) return;
    const m = (u0 + u1) / 2, gp = kit.gap || 0.45;
    const wins = kit.pair ? [[m - gp / 2 - ww, m - gp / 2], [m + gp / 2, m + gp / 2 + ww]] : [[m - ww / 2, m + ww / 2]];
    sd.box(u0, u1, 0, w0, -WD, 0, kit.wall);
    let p = u0;
    for (const [a, b] of wins) { sd.box(p, a, w0, w1, -WD, 0, kit.wall); p = b; }
    sd.box(p, u1, w0, w1, -WD, 0, kit.wall);
    for (const [a, b] of wins) {
      holes.push([a - 0.02, b + 0.02, w0, w1]);
      sd.glass(a, b, w0, w1, kit.glass, -0.12, -0.09);
      sd.box(a, b, w0, w0 + 0.06, -0.13, 0.04, fr);
      sd.box(a, b, w1 - 0.06, w1, -0.13, -0.02, fr);
      sd.box(a, a + 0.06, w0, w1, -0.13, -0.02, fr);
      sd.box(b - 0.06, b, w0, w1, -0.13, -0.02, fr);
      if (b - a > 1.6) sd.box((a + b) / 2 - 0.025, (a + b) / 2 + 0.025, w0, w1, -0.12, -0.04, fr);
      if (kit.sill) sd.box(a - 0.06, b + 0.06, w0 - 0.07, w0, 0, 0.1, kit.sill);
      if (kit.hood) sd.box(a - 0.06, b + 0.06, w1 + 0.02, w1 + 0.1, 0, 0.16, kit.hood);
      if (kit.rail) {
        // 프렌치 발코니 난간
        const r1 = Math.min(w1 - 0.2, w0 + 1.0);
        sd.glass(a + 0.04, b - 0.04, w0 + 0.06, r1, '#b9d0d4', 0.07, 0.09);
        sd.box(a, b, r1, r1 + 0.05, 0.04, 0.12, kit.rail);
        sd.box(a, a + 0.04, w0, r1, 0.04, 0.12, kit.rail); sd.box(b - 0.04, b, w0, r1, 0.04, 0.12, kit.rail);
      }
    }
    // 창 옆 색 판
    if (kit.panel) {
      const [, b] = wins[wins.length - 1];
      const pw = Math.min(kit.panelW || 0.7, u1 - b - 0.2);
      if (pw > 0.25) sd.box(b + 0.1, b + 0.1 + pw, w0 + 0.04, w1 - 0.04, 0, 0.05, kit.panel[(i + ctx.index * 2 + FACE_I[sd.id]) % kit.panel.length]);
    }
    if (kit.fin) sd.vbar(u0, 0.1, 0.25, FH - 0.2, 0, 0.32, kit.fin);
    if (kit.pilaster) {
      sd.vbar(u0, 0.42, 0, w1 + 0.14, -WD, 0.09, kit.pilaster);
      sd.vbar(u0, 0.54, w1 + 0.14, w1 + 0.24, -WD, 0.13, kit.pilaster);
    }
    // 발코니 — 앞뒤 긴 면(all = 네 면)
    if (kit.balcony && (kit.balcony === 'all' || sd.id === 'S' || sd.id === 'N')) {
      const p0 = u0 + 0.18, p1 = u1 - 0.18, cap = kit.balconyCap || '#7d766f';
      sd.box(p0, p1, -0.04, 0.1, 0, 1.15, '#f4f2ee');
      sd.glass(p0 + 0.04, p1 - 0.04, 0.1, 1.05, '#b7cfd4', 1.1, 1.13);
      sd.box(p0, p1, 1.05, 1.1, 1.08, 1.16, cap);
      sd.box(p0, p0 + 0.05, 0.1, 1.05, 0.05, 1.16, cap);
      sd.box(p1 - 0.05, p1, 0.1, 1.05, 0.05, 1.16, cap);
    }
  });
  if (kit.fin) sd.vbar(sd.b, 0.1, 0.25, FH - 0.2, 0, 0.32, kit.fin);
  if (kit.pilaster) { sd.vbar(sd.b, 0.42, 0, w1 + 0.14, -WD, 0.09, kit.pilaster); sd.vbar(sd.b, 0.54, w1 + 0.14, w1 + 0.24, -WD, 0.13, kit.pilaster); }
  if (kit.cornice) {
    sd.box(sd.a, sd.b, w1 + 0.14, top, 0, 0.05, kit.wall);                    // 프리즈(간판 자리)
    sd.box(sd.a, sd.b, top, top + 0.12, 0, 0.12, kit.cornice);
    sd.box(sd.a, sd.b, top + 0.12, FH - 0.03, 0, 0.24, kit.cornice);
  }
  if (E) { entrance(sd, kit, E, w1); holes.push([E.u0, E.u1, 0, w1]); }
  if (kit.brick) coursing(sd, sd.a, sd.b, 0, kit.course ? FH - 0.3 : top, 0.24, holes, kit.brick);
  // 핀이 있는 호텔은 핀 앞에, 코니스가 있으면 프리즈에
  if (kit.cornice) return { E, signV: (w1 + 0.24 + top) / 2, signH: Math.min(0.36, top - w1 - 0.34), signT: 0.05 };
  return { E, signV: (w1 + FH) / 2 + (kit.course ? -0.05 : 0), signH: Math.min(kit.course ? 0.56 : 0.62, FH - w1 - 0.14), signT: kit.fin ? 0.33 : kit.course ? 0.035 : 0 };
}
function curtain(sd, kit, ctx) {
  const bays = grid(sd.a, sd.b, kit.module || 1.55, ctx.door && sd.id === 'S');
  const E = ctx.door && sd.id === 'S' ? entranceOf(bays) : null;
  const spH = kit.spH || 0.72, top = FH - spH, fi = FACE_I[sd.id];
  bays.forEach(([u0, u1], i) => { if (!inE(E, i)) sd.glass(u0, u1, 0.06, top, kit.glass2 && (i + ctx.index + fi) % 2 ? kit.glass2 : kit.glass); });
  sd.box(sd.a, sd.b, top, FH, -0.13, -0.03, kit.spandrel);
  sd.box(sd.a, sd.b, 0, 0.06, -0.14, 0.03, kit.frame);
  bays.forEach(([u0, u1], i) => { if (!inE(E, i)) sd.box(u0, u1, top - 0.035, top + 0.035, -0.14, 0.05, kit.frame); });
  if (E) sd.box(E.u0, E.u1, top - 0.035, top + 0.035, -0.14, 0.05, kit.frame);
  if (kit.transom) bays.forEach(([u0, u1], i) => { if (!inE(E, i)) sd.box(u0, u1, kit.transom - 0.025, kit.transom + 0.025, -0.13, 0.03, kit.frame); });
  const vf = kit.vfin;
  const mull = (u, i) => {
    const pier = kit.pierEvery && i % kit.pierEvery === 0;
    sd.vbar(u, pier ? 0.34 : kit.mullW || 0.06, 0, FH, -0.14, pier ? 0.12 : 0.05, pier ? kit.pier : kit.frame);
    if (vf && !pier && !(E && u > E.u0 - 0.9 && u < E.u1 + 0.9)) sd.vbar(u, vf.w || 0.08, 0.04, FH - 0.04, 0.05, vf.d, vf.c);
  };
  bays.forEach(([u0], i) => { if (!(E && i > E.i0 && i <= E.i1)) mull(u0, i); });
  mull(sd.b, bays.length);
  // 수평 차양 날개
  if (kit.hfin) for (const [v, d] of kit.hfin.at) {
    const segs = E && v < 3.15 ? [[sd.a, E.u0 - 0.9], [E.u1 + 0.9, sd.b]] : [[sd.a, sd.b]];
    for (const [p, q] of segs) if (q - p > 0.3) sd.box(p, q, v, v + 0.05, 0.05, d, kit.hfin.c);
  }
  // 촘촘한 세로 루버 (경기장)
  if (kit.slat) {
    const s = kit.slat;
    for (let u = sd.a + 0.2; u < sd.b - 0.1; u += s.gap) {
      if (E && u > E.u0 - 0.95 && u < E.u1 + 0.95) continue;
      sd.box(u - 0.035, u + 0.035, 0.12, top - 0.02, 0.06, 0.06 + s.d, s.c);
    }
    const segs = E ? [[sd.a, E.u0 - 0.95], [E.u1 + 0.95, sd.b]] : [[sd.a, sd.b]];
    for (const [p, q] of segs) if (q - p > 0.3) sd.box(p, q, top - 0.06, top + 0.02, 0.04, 0.1 + s.d, s.c);
  }
  if (kit.line) sd.box(sd.a, sd.b, top - 0.08, top - 0.035, 0.04, 0.09, kit.line);
  if (E) entrance(sd, kit, E, top - 0.04);
  let signU = null, signMax = null;
  // 스팬드럴 LED 띠 (경기장) — 오른쪽 끝은 간판 자리
  if (kit.ledBand && sd.street) {
    const L = sd.b - sd.a, room = Math.min(8.5, L * 0.36);
    const a = sd.a + 0.35, b = sd.b - 0.35 - room;
    if (b - a > 2) {
      sd.box(a - 0.06, b + 0.06, top + 0.04, FH - 0.04, -0.03, 0.07, '#121518');
      sd.plane('media:' + kit.ledBand, a, b, top + 0.09, FH - 0.09, 0.072);
      signU = sd.b - 0.35 - room / 2; signMax = room - 0.6;
    }
  }
  // 간판은 멀리언(0.05) · 핀 앞에
  return { E, signV: FH - spH / 2 - 0.02, signH: Math.min(0.62, spH - 0.12), signU, signMax, signT: vf ? vf.d + 0.01 : 0.04 };
}
function fin(sd, kit, ctx) {
  const bays = grid(sd.a, sd.b, kit.bay || 1.8, ctx.door && sd.id === 'S');
  const E = ctx.door && sd.id === 'S' ? entranceOf(bays) : null;
  const topH = kit.topH || 0.58, top = FH - topH;
  const fw = kit.finW || 0.26, fd = kit.finD ?? 0.42, bd = kit.beamD ?? 0.04;
  const tv = kit.transomV === undefined ? null : kit.transomV;
  bays.forEach(([u0, u1], i) => {
    if (inE(E, i)) return;
    sd.glass(u0, u1, 0.06, top, kit.glass);
    sd.box(u0, u1, top - 0.03, top + 0.03, -0.12, -0.04, kit.frame);
    if (tv) sd.box(u0, u1, tv - 0.02, tv + 0.02, -0.12, -0.05, kit.frame);
    if (u1 - u0 - fw > 1.9) sd.box((u0 + u1) / 2 - 0.025, (u0 + u1) / 2 + 0.025, 0.06, top, -0.12, -0.05, kit.frame);
  });
  sd.box(sd.a, sd.b, top, FH, -0.15, bd, kit.fin);
  sd.box(sd.a, sd.b, 0, 0.08, -0.15, Math.max(0.06, bd * 0.6), kit.fin);
  if (kit.trim) sd.box(sd.a, sd.b, top - 0.05, top, -0.02, Math.max(0.06, bd + 0.01), kit.trim);
  bays.forEach(([u0], i) => { if (!(E && i > E.i0 && i <= E.i1)) sd.vbar(u0, fw, 0, FH, -0.15, fd, kit.fin); });
  sd.vbar(sd.b, fw, 0, FH, -0.15, fd, kit.fin);
  if (E) entrance(sd, kit, E, top, { portico: kit.portico });
  // 간판은 핀 · 보 앞에 가로로 건다
  return { E, signV: FH - topH / 2 + 0.02, signH: Math.min(0.56, topH - 0.1), signT: Math.max(fd, bd) + 0.01 };
}
function ribbon(sd, kit, ctx) {
  const w0 = kit.w0 || 0.95, w1 = kit.w1 || 2.55;
  const bays = grid(sd.a, sd.b, 1.5, ctx.door && sd.id === 'S');
  const E = ctx.door && sd.id === 'S' ? entranceOf(bays) : null;
  sd.box(sd.a, sd.b, w1, FH, -WD, 0, kit.wall);
  sd.box(sd.a, sd.b, FH - 0.42, FH - 0.32, 0, 0.03, kit.band);
  bays.forEach(([u0, u1], i) => {
    if (inE(E, i)) return;
    sd.box(u0, u1, 0, w0, -WD, 0, kit.wall);
    sd.glass(u0, u1, w0, w1, kit.glass);
  });
  sd.box(sd.a, sd.b, w0 - 0.04, w0 + 0.03, -0.13, 0.05, '#ffffff');
  bays.forEach(([u0], i) => { if (!(E && i > E.i0 && i <= E.i1)) sd.vbar(u0, 0.07, w0, w1, -0.13, -0.02, kit.frame); });
  // 모서리마다 흰 벽 기둥
  sd.box(sd.a, sd.a + 0.5, 0, FH, -WD, 0.02, kit.wall);
  sd.box(sd.b - 0.5, sd.b, 0, FH, -WD, 0.02, kit.wall);
  const skip = (u) => E && u > E.u0 - 0.5 && u < E.u1 + 0.5;
  // 나무 세로 루버 (케어 하우스)
  if (kit.louver) {
    for (let u = sd.a + 0.75; u < sd.b - 0.6; u += 0.42) if (!skip(u)) sd.box(u - 0.04, u + 0.04, w0 + 0.03, w1 - 0.02, 0.04, 0.32, kit.louver);
    const segs = E ? [[sd.a + 0.55, E.u0 - 0.5], [E.u1 + 0.5, sd.b - 0.55]] : [[sd.a + 0.55, sd.b - 0.55]];
    for (const [p, q] of segs) if (q - p > 0.3) sd.box(p, q, w1 - 0.07, w1 + 0.01, 0.02, 0.36, kit.louver);
  }
  // 창가 화단 (2층부터)
  if (kit.planter && ctx.index > 0) {
    sd.box(sd.a + 0.6, sd.b - 0.6, w0 - 0.36, w0 + 0.02, 0.05, 0.46, kit.planter);
    sd.box(sd.a + 0.66, sd.b - 0.66, w0 + 0.02, w0 + 0.16, 0.08, 0.43, '#6f9460');
  }
  const canopy = kit.canopy && ctx.index === 0 && sd.street;
  if (canopy) streetCanopy(sd, w1 - 0.1, sd.id === 'S' ? 2.6 : 1.6, kit.canopy, sd.id === 'S');
  if (E) entrance(sd, kit, E, w1, { canopy: !canopy });
  return { E, signV: (w1 + FH - 0.42) / 2 + 0.02, signH: Math.min(0.5, FH - 0.42 - w1 - 0.12), signT: 0 };
}
function media(sd, kit, ctx) {
  const info = curtain(sd, { ...kit, module: kit.module || 1.7 }, ctx);
  const E = info.E;
  const L = sd.b - sd.a;
  // LED 화면 자리 — 아레나 · 체험관은 정면, 미디어 센터는 정면 오른쪽에서 옆면으로 이어지는 코너 화면, full = 거리 쪽 두 면 전체
  let span = null;
  if (kit.full) span = sd.street ? [sd.a + 0.25, sd.b - 0.25] : null;
  else if (kit.wrap) span = sd.id === 'S' ? [sd.a + L * 0.4, sd.b - 0.05] : sd.id === 'E' ? [sd.a + 0.05, sd.a + L * 0.62] : null;
  else if (sd.id === 'S' || (sd.id === 'N' && !kit.fins)) span = [sd.a + L * (kit.fins ? 0.3 : 0.14), sd.b - L * (kit.fins ? 0.3 : 0.14)];
  else if (sd.id === 'E' && !kit.fins) span = [sd.a + 1.6, sd.b - 1.6];
  const spans = [];
  if (span) {
    if (E && E.u1 + 0.5 > span[0] && E.u0 - 0.5 < span[1]) {
      if (E.u0 - 0.5 - span[0] >= 2.4) spans.push([span[0], E.u0 - 0.5]);
      if (span[1] - (E.u1 + 0.5) >= 2.4) spans.push([E.u1 + 0.5, span[1]]);
    } else spans.push(span);
  }
  const v0 = E ? 0.3 : 0.22, v1 = FH - 0.24;
  const scr = 'media:' + (kit.screen || 'promo');
  for (const [a, b] of spans) {
    const o0 = sd.id === 'E' && kit.wrap ? a - 0.2 : a - 0.1, o1 = sd.id === 'S' && kit.wrap ? b + 0.25 : b + 0.1;
    sd.box(o0, o1, v0 - 0.1, v1 + 0.1, 0, 0.2, '#1d2125');
    // 전면 화면은 영상 한 장을 면 길이에 맞춰 늘이지 않고 나눠 보여 준다
    const r = Math.min(1, L / (v1 - v0) / screenTex(kit.screen || 'promo').aspect);
    const uv = kit.full ? [((a - sd.a) / L) * r, 0, ((b - sd.a) / L) * r, 1] : null;
    sd.plane(scr, a, b, v0, v1, 0.203, uv);
  }
  // 체험관 — 화면 밖 칸에 색 핀
  if (kit.fins && sd.street) {
    let k = 0;
    for (let u = sd.a + 0.6; u < sd.b - 0.4; u += 0.9) {
      if (spans.some(([a, b]) => u > a - 0.3 && u < b + 0.3)) continue;
      if (E && u > E.u0 - 0.9 && u < E.u1 + 0.9) continue;
      sd.vbar(u, 0.16, 0.1, FH - 0.1, 0, 0.36, kit.fins[k++ % kit.fins.length]);
    }
  }
  // 간판 — 화면이 없는 쪽 스팬드럴에. 남는 자리가 좁으면 그 면엔 달지 않는다
  if (!spans.length) return { E, signV: FH - 0.4, signH: 0.62 };
  if (kit.full) return { E };
  const gaps = [[sd.a, spans[0][0] - 0.3], [spans[spans.length - 1][1] + 0.3, sd.b]].filter(([a, b]) => b - a >= 3);
  if (!gaps.length) return { E };
  const g = gaps.reduce((p, q) => (q[1] - q[0] > p[1] - p[0] ? q : p));
  return { E, signV: FH - 0.4, signH: 0.62, signU: (g[0] + g[1]) / 2, signMax: g[1] - g[0] - 0.6 };
}
function industrial(sd, kit, ctx) {
  const w0 = FH - 1.15, w1 = FH - 0.5;
  const bays = grid(sd.a, sd.b, 1.6, ctx.door && sd.id === 'S');
  const E = ctx.door && sd.id === 'S' ? entranceOf(bays) : null;
  sd.box(sd.a, sd.b, w1, FH, -WD, 0, kit.wall);
  bays.forEach(([u0, u1], i) => {
    sd.glass(u0, u1, w0, w1, kit.glass, -0.1, -0.07);
    if (!inE(E, i)) sd.box(u0, u1, 0, w0, -WD, 0, kit.wall);
  });
  bays.forEach(([u0]) => sd.vbar(u0, 0.06, w0, w1, -0.12, -0.02, kit.frame));
  // 1층 정면 반입구 (셔터 여러 개)
  const docks = [];
  if (ctx.index === 0 && sd.id === 'S') {
    const n = kit.dock || 1, dw = n > 1 ? 3.2 : 4.4;
    for (let k = 0; k < n; k++) {
      const a = sd.a + 1.6 + k * (dw + 0.9), b = a + dw;
      if (b > sd.b - 1.2) break;
      if (E && b > E.u0 - 0.9 && a < E.u1 + 0.9) continue;
      docks.push([a, b]);
    }
  }
  const inDock = (u) => docks.some(([a, b]) => u > a - 0.1 && u < b + 0.1);
  if (kit.precast) {
    // 프리캐스트 판 줄눈 — 가로 두 줄 + 3m마다 세로
    for (const v of [1.15, w0 - 0.5]) {
      const segs = [[sd.a, sd.b]];
      for (const [a, b] of [...docks, ...(E ? [[E.u0, E.u1]] : [])].sort((p, q) => p[0] - q[0])) {
        const s = segs.pop();
        if (a > s[0]) segs.push([s[0], a - 0.12]);
        segs.push([b + 0.12, s[1]]);
      }
      for (const [p, q] of segs) if (q - p > 0.2) sd.box(p, q, v, v + 0.03, 0, 0.008, kit.rib);
    }
    for (let u = sd.a + 3; u < sd.b - 0.5; u += 3) {
      if ((E && u > E.u0 - 0.1 && u < E.u1 + 0.1) || inDock(u)) continue;
      sd.vbar(u, 0.03, 0.12, w0 - 0.05, 0, 0.008, kit.rib);
      sd.vbar(u, 0.03, w1 + 0.05, FH - 0.05, 0, 0.008, kit.rib);
    }
  } else {
    // 골강판 줄눈
    for (let u = sd.a + 0.3; u < sd.b - 0.2; u += 0.55) {
      if (E && u > E.u0 - 0.1 && u < E.u1 + 0.1) continue;
      sd.vbar(u, 0.045, inDock(u) ? 3.15 : 0.12, w0 - 0.05, 0, 0.05, kit.rib);
      sd.vbar(u, 0.045, w1 + 0.05, FH - 0.08, 0, 0.05, kit.rib);
    }
  }
  sd.box(sd.a, sd.b, 0, 0.12, -WD, 0.05, '#8a949a');
  // 색 띠
  if (kit.stripe) {
    const segs = [[sd.a, sd.b]];
    for (const [a, b] of [...docks, ...(E ? [[E.u0, E.u1]] : [])].sort((p, q) => p[0] - q[0])) {
      const s = segs.pop();
      segs.push([s[0], a - 0.15], [b + 0.15, s[1]]);
    }
    for (const [p, q] of segs) if (q - p > 0.3) sd.box(p, q, w0 - 0.46, w0 - 0.2, 0, 0.03, kit.stripe);
  }
  // 셔터 + 노란 문틀 (+ 여러 개면 반입 캐노피 · 범퍼)
  for (const [a, b] of docks) {
    const dh = w0 - 0.1;
    sd.box(a, b, 0, dh, 0, 0.06, '#6c757b');
    for (let v = 0.28; v < dh - 0.1; v += 0.26) sd.box(a, b, v, v + 0.03, 0.06, 0.075, '#59626a');
    sd.box(a - 0.12, a, 0, dh + 0.1, 0, 0.1, '#e3b33b'); sd.box(b, b + 0.12, 0, dh + 0.1, 0, 0.1, '#e3b33b');
    sd.box(a - 0.12, b + 0.12, dh, dh + 0.1, 0, 0.1, '#e3b33b');
    if (docks.length > 1) for (const u of [a + 0.35, b - 0.35]) sd.box(u - 0.12, u + 0.12, 0.25, 0.6, 0.06, 0.2, '#1f2326');
  }
  if (docks.length > 1) sd.box(docks[0][0] - 0.5, docks[docks.length - 1][1] + 0.5, w0 + 0.02, w0 + 0.16, 0, 1.5, '#3a4045');
  if (E) entrance(sd, kit, E, w0);
  // 간판은 창 아래 벽에 — 반입구와 입구 사이 넓은 쪽
  let signU = null, signMax = null;
  if (docks.length) {
    const end = docks[docks.length - 1][1] + 0.4;
    const gaps = E ? [[end, E.u0 - 0.3], [E.u1 + 0.3, sd.b - 0.3]] : [[end, sd.b - 0.3]];
    const g = gaps.reduce((p, q) => (q[1] - q[0] > p[1] - p[0] ? q : p));
    if (g[1] - g[0] > 2) { signU = (g[0] + g[1]) / 2; signMax = g[1] - g[0] - 0.6; }
  }
  return { E, signV: 1.55, signH: 0.72, signU, signMax };
}
// 극장 — 막힌 벽 · 포스터 라이트박스 · 전구 달린 전광 띠(마퀴)
function cinema(sd, kit, ctx) {
  const bays = grid(sd.a, sd.b, 3.0, ctx.door && sd.id === 'S');
  const E = ctx.door && sd.id === 'S' ? entranceOf(bays) : null;
  const mb = FH - 0.82, head = 2.6;
  if (E) {
    sd.box(sd.a, E.u0, 0, mb, -WD, 0, kit.wall); sd.box(E.u1, sd.b, 0, mb, -WD, 0, kit.wall);
    sd.box(E.u0, E.u1, head, mb, -WD, 0, kit.wall);
  } else sd.box(sd.a, sd.b, 0, mb, -WD, 0, kit.wall);
  sd.box(sd.a, sd.b, mb, FH, -WD, 0.1, kit.band);
  for (const v of [mb + 0.07, FH - 0.07]) for (let u = sd.a + 0.25; u < sd.b - 0.15; u += 0.32) sd.glow(u - 0.035, u + 0.035, v - 0.035, v + 0.035, 0.1, 0.14, '#ffe3a1');
  let k = ctx.index * 3 + FACE_I[sd.id];
  bays.forEach(([u0, u1], i) => {
    if (inE(E, i)) return;
    const m = (u0 + u1) / 2;
    if (sd.street) {
      const pw = Math.min(1.45, u1 - u0 - 0.8), ph = Math.min(2.12, pw * 1.5), p0 = 0.4, p1 = p0 + ph;
      sd.box(m - pw / 2 - 0.08, m + pw / 2 + 0.08, p0 - 0.08, p1 + 0.08, 0, 0.12, '#141619');
      sd.plane('poster', m - pw / 2, m + pw / 2, p0, p1, 0.122, atlasUV('poster', k++));
      sd.glow(m - pw / 2, m + pw / 2, p1 + 0.08, p1 + 0.12, 0.02, 0.16, '#fff1c9');
    } else sd.box(m - 0.03, m + 0.03, 0.1, mb - 0.1, 0, 0.02, shade(kit.wall, 0.8));
  });
  if (E) entrance(sd, kit, E, head);
  return { E, signV: (mb + FH) / 2, signH: 0.52, signT: 0.105 };
}
// 광고판 건물 — 띠창 벽 위에 큰 광고판(16:9)
function billboard(sd, kit, ctx) {
  const info = ribbon(sd, { ...kit, w0: 0.9, w1: 2.5 }, ctx);
  if (!sd.street) return info;
  const E = info.E, L = sd.b - sd.a;
  const n = L > 17 ? 2 : 1, bh = 2.1, bw = bh * 16 / 9, b0 = 0.42, b1 = b0 + bh;
  let k = ctx.index * 2 + FACE_I[sd.id];
  for (let j = 0; j < n; j++) {
    let u = n === 2 ? sd.a + L * (j ? 0.73 : 0.27) : sd.a + L / 2;
    if (E && u + bw / 2 + 0.4 > E.u0 && u - bw / 2 - 0.4 < E.u1) u = u < (E.u0 + E.u1) / 2 ? E.u0 - 0.6 - bw / 2 : E.u1 + 0.6 + bw / 2;
    if (u - bw / 2 < sd.a + 0.6 || u + bw / 2 > sd.b - 0.6) continue;
    sd.box(u - bw / 2 - 0.12, u + bw / 2 + 0.12, b0 - 0.12, b1 + 0.12, 0.28, 0.42, '#2a2f33');
    for (const v of [b0 + 0.35, b1 - 0.35]) sd.box(u - bw / 2 + 0.2, u + bw / 2 - 0.2, v - 0.05, v + 0.05, 0, 0.28, '#4a5257');
    sd.plane('billboard', u - bw / 2, u + bw / 2, b0, b1, 0.422, atlasUV('billboard', k++));
    for (const s of [-0.3, 0.3]) { sd.box(u + s * bw - 0.03, u + s * bw + 0.03, b1 + 0.12, b1 + 0.2, 0.3, 0.8, '#2a2f33'); sd.glow(u + s * bw - 0.1, u + s * bw + 0.1, b1 + 0.12, b1 + 0.17, 0.72, 0.82, '#fff6d8'); }
  }
  return { E, signV: 3.2, signH: 0.42, signT: 0 };
}
// 패턴 타일 (백화점) — 1층 거리 쪽은 쇼윈도
function mosaic(sd, kit, ctx) {
  const shop = ctx.door && sd.street;
  let vb = 0.04, E = null;
  if (shop) {
    const bays = grid(sd.a, sd.b, 3.2, sd.id === 'S');
    E = sd.id === 'S' ? entranceOf(bays) : null;
    const sh = 2.8;
    bays.forEach(([u0, u1], i) => {
      if (inE(E, i)) return;
      sd.glass(u0 + 0.14, u1 - 0.14, 0.1, sh, kit.glass);
      sd.box(u0 + 0.14, u1 - 0.14, sh - 0.06, sh, -0.1, -0.02, kit.frame);
    });
    bays.map(([u0]) => u0).concat(sd.b).forEach((u, i) => { if (!(E && i > E.i0 && i <= E.i1)) sd.vbar(u, 0.28, 0, sh, -WD, 0.05, kit.frame); });
    sd.box(sd.a, sd.b, 0, 0.1, -WD, 0.04, kit.frame);
    if (E) entrance(sd, kit, E, sh);
    vb = sh;
  }
  sd.box(sd.a, sd.b, shop ? vb : 0, FH, -WD, 0, kit.wall);
  const ts = kit.tile || 0.82, fi = FACE_I[sd.id];
  const rows = Math.max(1, Math.round((FH - 0.06 - vb) / ts)), th = (FH - 0.06 - vb) / rows;
  const cols = Math.max(1, Math.round((sd.b - sd.a) / ts)), tw = (sd.b - sd.a) / cols;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const hs = hash(r * 131 + c * 17 + ctx.index * 977 + fi * 7919);
    const u0 = sd.a + c * tw + 0.025, u1 = u0 + tw - 0.05, v0 = vb + 0.03 + r * th + 0.025, v1 = v0 + th - 0.05;
    if (!shop && hs % 9 === 0) { sd.glass(u0, u1, v0, v1, kit.glass, 0.0, 0.025); continue; }
    sd.box(u0, u1, v0, v1, 0, 0.03 + (hs % 3) * 0.025, kit.tiles[(hs >>> 3) % kit.tiles.length]);
  }
  return { E, signV: shop ? FH - 0.38 : FH - 0.5, signH: shop ? 0.5 : 0.62, signT: 0.1 };
}
// 색 블록 (체험관) — 크고 작은 색 판과 유리 칸이 번갈아
function blocks(sd, kit, ctx) {
  const fi = FACE_I[sd.id];
  const E = ctx.door && sd.id === 'S' ? (() => { const m = (sd.a + sd.b) / 2; return { u0: m - 1.8, u1: m + 1.8 }; })() : null;
  const segs = E ? [[sd.a, E.u0], [E.u1, sd.b]] : [[sd.a, sd.b]];
  const W = [2.6, 1.7, 3.3, 2.2, 3.8, 1.5];
  let k = ctx.index * 5 + fi * 3;
  const joints = [];
  for (const [p0, p1] of segs) {
    let u = p0;
    while (u < p1 - 0.05) {
      let w = W[k % W.length];
      if (p1 - (u + w) < 1.2) w = p1 - u;
      if (k % 3 === 1) {
        sd.box(u, u + w, 0, 0.5, -WD, 0, kit.wall);
        sd.glass(u + 0.05, u + w - 0.05, 0.5, FH - 0.5, kit.glass);
        sd.box(u, u + w, FH - 0.5, FH, -WD, 0, kit.wall);
        sd.box(u + 0.05, u + w - 0.05, 0.46, 0.53, -0.12, 0.04, kit.frame);
        sd.box(u + 0.05, u + w - 0.05, FH - 0.53, FH - 0.46, -0.12, 0.02, kit.frame);
      } else {
        const c = kit.palette[(k * 7 + fi) % kit.palette.length];
        if (k % 4 === 0) {
          sd.box(u, u + w, 0, 1.72, -WD, 0.08, c);
          sd.box(u, u + w, 1.72, FH, -WD, 0.15, kit.palette[(k * 7 + fi + 1) % kit.palette.length]);
        } else sd.box(u, u + w, 0, FH, -WD, 0.08 + (k % 2) * 0.07, c);
      }
      joints.push(u);
      u += w; k++;
    }
  }
  for (const u of joints) if (u > sd.a + 0.1) sd.vbar(u, 0.08, 0, FH, -WD, 0.17, kit.wall);
  if (E) { entrance(sd, kit, E, 2.6); sd.box(E.u0, E.u1, 2.6, FH, -WD, 0.08, kit.wall); }
  return { E, signV: FH - 0.48, signH: 0.56, signT: 0.16 };
}
const KINDS = { curtain, fin, store, punched, ribbon, media, industrial, cinema, billboard, mosaic, blocks };
// 업종 기본 간판 글자 — 외벽과 다른 업종 공간을 넣은 층은 그 공간 업종의 간판으로
export const signOfInd = (ind) => ((FACADES[ind] || [])[0] || {}).sign || '';
const cornerOf = (kit) => kit.corner || (kit.kind === 'fin' ? kit.fin : kit.kind === 'curtain' || kit.kind === 'media' ? kit.frame : kit.kind === 'store' && kit.pier ? kit.pier : kit.wall || kit.frame);

// ---------- 층 외벽 ----------
// t = 층 모양 { ind(외벽 업종), w, d, sign?(간판 글자 — 없으면 외벽 변형의 간판), signName?(사용자가 붙인 이름), noSign?(빈 층: 간판 없음) }
// 돌려주는 것: { sides: [{ id, n, group }], materials, kit }
export function buildFacade(t, { index = 0, fv = 0 } = {}) {
  const kit = kitOf(t.ind, fv);
  const text = (t.signName || t.sign || kit.sign || '').trim() || ' ';
  const style = kit.signStyle || 'panel';
  const bg = style === 'box' ? '#ffffff' : style === 'letters' ? null : kit.signBg || kit.accent;
  const fg = kit.signFg || (style === 'box' ? kit.accent : '#ffffff');
  let sg = null;
  // 입체 글자는 판이 없으니 질감을 글자에 꼭 맞게(위아래 여백 적게) 만들어 같은 높이에서 더 크게 보이게
  const sgOf = () => (sg ||= textTexture(text, style === 'letters' ? { bg, fg, pad: 0.16, px: 82, h: 100 } : { bg, fg, icon: kit.signIcon }));
  const edge = style === 'letters' ? null : style === 'box' ? '#cfd4d7' : shade(bg, 0.62);
  const mats = new Mats((key) => {
    if (key === 'sign') return signMaterial(sgOf().tex, { letters: style === 'letters', glow: style === 'box' ? 0.42 : style === 'letters' ? 0.28 : 0.2 });
    if (key === 'tenant') return signMaterial(tenantAtlas().tex, { glow: 0.24 });
    if (key === 'poster' || key === 'billboard') return mediaMaterial(key);
    if (key.startsWith('media:')) return mediaMaterial(key.slice(6));
    return materialFor(key);
  });
  // 이름을 붙인 층은 점포 간판들도 그 이름으로
  const ctx = { index, door: index === 0, ownSign: t.signName ? { aspect: () => sgOf().aspect } : null };
  const cc = cornerOf(kit);
  const sides = sideDefs(t.w, t.d).map((def) => {
    const sd = new Side(def);
    const info = KINDS[kit.kind](sd, kit, ctx) || {};
    // 모서리 기둥 (긴 면 양 끝)
    if (sd.id === 'S' || sd.id === 'N') {
      sd.box(0, 0.24, 0, FH, -WD - 0.02, 0.05, cc);
      sd.box(sd.len - 0.24, sd.len, 0, FH, -WD - 0.02, 0.05, cc);
    }
    // 간판 — 1층 상점 정면은 입구 캐노피를 피해 왼쪽 칸에. 점포 간판을 단 면은 건너뜀
    if (info.signV && !info.tenants && !t.noSign) {
      let u = info.signU != null ? info.signU : (sd.a + sd.b) / 2;
      let maxW = Math.min(9, (sd.b - sd.a) * 0.42, info.signMax || Infinity);
      // 상점 · 포르티코(깊은 입구 지붕)는 가운데 입구 위를 피해 왼쪽 칸에
      const clear = kit.portico ? 3.4 : 1.2;
      if (info.E && info.signU == null && (kit.kind === 'store' || kit.portico) && info.E.u0 - sd.a > 2.8 + clear) {
        u = (sd.a + info.E.u0 - clear + 1.2) / 2;
        maxW = Math.min(maxW, info.E.u0 - sd.a - clear);
      }
      const s = sgOf();
      sd.sign(u, info.signV, info.signH, s.aspect, edge, { t: info.signT || 0, maxW });
    }
    return { id: sd.id, n: new Vector3(sd.n[0], 0, sd.n[1]), group: sd.group(mats) };
  });
  if (sg && !mats.m.has('sign')) sg.tex.dispose();
  return { sides, materials: mats.all(), kit };
}

// ---------- 셋백 테라스 — 위층이 이 층보다 작으면 드러나는 지붕을 덮고 가장자리에 유리 난간 ----------
// up = 위층 바닥판 바깥선(이 층 좌표계 { x0, z0, x1, z1 }), top = 테라스 윗면 높이(이 층 기준)
export function buildTerrace(w, d, up, { top, kit } = {}) {
  const r = { x0: -SLAB, z0: -SLAB, x1: w + SLAB, z1: d + SLAB }, eps = 0.03;
  if (up.x0 <= r.x0 + eps && up.z0 <= r.z0 + eps && up.x1 >= r.x1 - eps && up.z1 >= r.z1 - eps) return null;
  const col = new Collector();
  const put = (x0, x1, y0, y1, z0, z1, c, key = 'vc') => {
    if (x1 - x0 < 0.005 || y1 - y0 < 0.005 || z1 - z0 < 0.005) return;
    _m.makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).multiply(_s.makeScale(x1 - x0, y1 - y0, z1 - z0));
    col.add(key, UNIT, _m, c);
  };
  // 테라스 판 (위층 바닥판보다 3cm 낮게 — 겹치는 곳은 위층 판이 덮는다)
  put(r.x0, r.x1, top - 0.38, top - 0.03, r.z0, r.z1, '#f2f1ec');
  put(r.x0 + 0.1, r.x1 - 0.1, top - 0.03, top, r.z0 + 0.1, r.z1 - 0.1, '#d8d2c6');
  const fence = kit && kit.parapet && lum(kit.parapet) < 0.05 ? kit.parapet : '#8a9197';
  const keep = (lo, hi, a, b, inside) => (inside ? [[lo, Math.min(hi, a)], [Math.max(lo, b), hi]] : [[lo, hi]]).filter(([p, q]) => q - p > 0.25);
  // 가장자리마다 위층에 덮이지 않는 구간에만 난간
  const edges = [
    { axis: 'x', at: r.z1, dir: -1, segs: keep(r.x0, r.x1, up.x0, up.x1, r.z1 > up.z0 - eps && r.z1 < up.z1 + eps), room: r.z1 - up.z1 },
    { axis: 'x', at: r.z0, dir: 1, segs: keep(r.x0, r.x1, up.x0, up.x1, r.z0 > up.z0 - eps && r.z0 < up.z1 + eps), room: up.z0 - r.z0 },
    { axis: 'z', at: r.x1, dir: -1, segs: keep(r.z0, r.z1, up.z0, up.z1, r.x1 > up.x0 - eps && r.x1 < up.x1 + eps), room: r.x1 - up.x1 },
    { axis: 'z', at: r.x0, dir: 1, segs: keep(r.z0, r.z1, up.z0, up.z1, r.x0 > up.x0 - eps && r.x0 < up.x1 + eps), room: up.x0 - r.x0 },
  ];
  for (const e of edges) for (const [p, q] of e.segs) {
    const c0 = e.at + e.dir * 0.02, c1 = e.at + e.dir * 0.2, g0 = e.at + e.dir * 0.09, g1 = e.at + e.dir * 0.12;
    const P = (a, b, y0, y1, s0, s1, c, key) => (e.axis === 'x' ? put(a, b, y0, y1, Math.min(s0, s1), Math.max(s0, s1), c, key) : put(Math.min(s0, s1), Math.max(s0, s1), y0, y1, a, b, c, key));
    P(p, q, top, top + 0.14, c0, c1, '#e7e5df');                 // 턱
    P(p + 0.04, q - 0.04, top + 0.14, top + 1.02, g0, g1, '#b9d0d4', 'vcglass');
    P(p, q, top + 1.0, top + 1.06, c0, c1, fence);               // 손잡이
    for (let s = p + 0.05; s < q; s += Math.max(1.2, (q - p) / Math.ceil((q - p) / 1.6))) P(s, s + 0.05, top + 0.14, top + 1.0, c0, c1, fence);
    P(q - 0.05, q, top + 0.14, top + 1.0, c0, c1, fence);
    // 깊이가 넉넉하면 난간 따라 화분
    if (e.room >= 1.6 && q - p >= 3.2) {
      for (let s = p + 1.2; s + 1.4 < q - 0.6; s += 4.2) {
        const s0 = e.at + e.dir * 0.32, s1 = e.at + e.dir * 0.92;
        P(s, s + 1.4, top, top + 0.5, s0, s1, '#d6d2c8');
        P(s + 0.06, s + 1.34, top + 0.5, top + 0.58, s0 + e.dir * 0.05, s1 - e.dir * 0.05, '#7f9e6c');
      }
    }
  }
  const group = new Group();
  const materials = [];
  for (const [key, items] of col.groups) {
    const mat = materialFor(key);
    materials.push(mat);
    const mesh = new Mesh(merge(items, true), mat);
    mesh.castShadow = key === 'vc'; mesh.receiveShadow = true;
    if (key === 'vcglass') mesh.renderOrder = 2;
    group.add(mesh);
  }
  return { group, materials };
}

// ---------- 지붕 · 건물 이름 ----------
const parapetOf = (kit) => kit.parapet || (kit.kind === 'curtain' || kit.kind === 'media' ? '#e6e8e8' : kit.kind === 'fin' ? kit.fin : kit.wall || '#e6e8e8');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function buildRoof(t, { title = '', kit = FACADES.OF[0] } = {}) {
  const D = data();
  const mats = new Mats((key) => materialFor(key));
  const group = new Group();
  const col = new Collector();
  const put = (x, y, z, w, h, d, c) => { _m.makeTranslation(x, y, z).multiply(_s.makeScale(w, h, d)); col.add('vc', UNIT, _m, c); };
  const W = t.w, Dp = t.d, bar = Dp < 9;
  // 지붕판 · 방수층
  put(W / 2, -0.24, Dp / 2, W + 0.7, 0.42, Dp + 0.7, '#f5f5f1');
  put(W / 2, -0.01, Dp / 2, W + 0.26, 0.04, Dp + 0.26, '#cdd1ce');
  // 계단실 — 뒤 왼쪽(일자형이면 왼쪽 끝)
  const pw = clamp(W * 0.22, 2.8, 5.4), pd = bar ? Math.min(3.2, Dp - 1.8) : clamp(Dp * 0.25, 2.6, 3.8);
  const px = 0.9 + pw / 2, pz = bar ? Dp / 2 : 0.9 + pd / 2;
  put(px, 1.57, pz, pw, 3.2, pd, '#e7e5df');
  put(px, 3.23, pz, pw + 0.4, 0.14, pd + 0.4, '#d9d7d0');
  put(px - pw * 0.13, 1.1, pz + pd / 2 + 0.02, 1.0, 2.1, 0.06, '#5b646a');
  // 실외기 (시스템에어컨 DVM S2) — 뒤 오른쪽
  const n = clamp(Math.floor((W - (px + pw / 2) - 2.4) / 1.6), 1, 4);
  const dx1 = W - 1.05, dx0 = dx1 - (n - 1) * 1.55, dz = bar ? Dp / 2 : 1.75;
  put((dx0 + dx1) / 2, 0.05, dz, dx1 - dx0 + 1.6, 0.12, 1.9, '#cfd0cc');
  const unit = D.assets.find((a) => a.id === 'product:dvms2');
  const parts = unit ? (unit.r && D.recipes[unit.r]) || unit.p || [] : [];
  const tone = { silver: '#c9cfd2', grille: '#a7aeab', body: unit ? unit.bc || '#e4e5e6' : '#e4e5e6', metal: '#7d878d', black: '#2c3135' };
  for (let k = 0; k < n; k++) {
    const x = dx0 + k * 1.55;
    parts.forEach((p, pi) => {
      const pp = partPos(p, unit);
      _m.makeTranslation(x + pp[0], 0.11 + pp[1], dz + pp[2]);
      col.add('vc', cachedPart(unit, p, pi), _m, tone[p.material] || p.material);
    });
  }
  if (kit.kind === 'industrial') {
    // 공장 — 채광창 줄
    const len = W * 0.62, cx = W * 0.56;
    for (const f of bar ? [0.5] : [0.47, 0.69]) {
      put(cx, 0.22, Dp * f, len, 0.42, 1.5, '#9aa4aa');
      put(cx, 0.47, Dp * f, len - 0.4, 0.08, 1.2, '#a9c3ca');
    }
  } else {
    // 옥상 정원 — 데크 · 화분 · 파라솔. 일자형이면 계단실과 실외기 사이, 아니면 앞 왼쪽
    let x0, x1, z0, z1;
    if (bar) { x0 = px + pw / 2 + 0.9; x1 = dx0 - 1.4; z0 = Dp / 2 - 1.55; z1 = Dp / 2 + 1.55; }
    else { const dw = clamp(W * 0.3, 3.4, 7.4), dd = clamp(Dp * 0.32, 2.6, 5.0); x0 = 0.95; x1 = x0 + dw; z1 = Dp - 0.95; z0 = z1 - dd; }
    if (x1 - x0 > 2.6) {
      put((x0 + x1) / 2, 0.04, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, '#b98f68');
      for (let x = x0 + 0.3; x < x1 - 0.1; x += 0.92) put(x, 0.096, (z0 + z1) / 2, 0.03, 0.005, z1 - z0 - 0.1, '#a07a56');
      for (const [x, z, w, d] of [[x0 + 0.25, (z0 + z1) / 2, 0.7, z1 - z0 - 0.4], [(x0 + x1) / 2, z1 - 0.25, x1 - x0 - 0.6, 0.6]]) {
        put(x, 0.33, z, w, 0.56, d, '#d8d4ca');
        put(x, 0.63, z, w - 0.12, 0.06, d - 0.12, '#7f9e6c');
      }
      if (!bar) { put(x1 + 0.2, 0.33, z0 + 0.7, 1.2, 0.56, 1.2, '#d8d4ca'); put(x1 + 0.2, 0.63, z0 + 0.7, 1.08, 0.06, 1.08, '#7f9e6c'); }
      put(x0 + 0.7, 1.0, z1 - 0.3, 0.5, 0.9, 0.5, '#7f9e6c');
      const np = clamp(Math.floor((x1 - x0 - 1.2) / 2.6), 1, 3);
      for (let k = 0; k < np; k++) {
        const x = x0 + 1.2 + ((x1 - x0 - 1.6) * (k + 0.5)) / np, z = (z0 + z1) / 2 - 0.2;
        put(x, 1.1, z, 0.05, 2.1, 0.05, '#8a8f92');
        _m.makeTranslation(x, 2.2, z);
        col.add('vc', PARASOL, _m, '#f1ebdf');
        put(x, 0.4, z, 0.9, 0.06, 0.9, '#f4f2ee');
        put(x, 0.2, z, 0.08, 0.38, 0.08, '#8a8f92');
      }
    }
  }
  // 난간벽(파라펫) · 갓돌 · 이름 간판
  const pc = parapetOf(kit);
  const name = (title || '').trim();
  const tx = name ? textTexture(name, { bg: '#1f2a33', px: 84, h: 140, line: kit.accent }) : null;
  if (tx) mats.m.set('sign', signMaterial(tx.tex));
  const signs = [];
  const sides = sideDefs(W, Dp).map((def) => {
    const sd = new Side(def);
    sd.box(sd.a, sd.b, 0, 0.95, -0.22, 0, pc);
    sd.box(sd.a, sd.b, 0.95, 1.02, -0.25, 0.03, '#f4f3ef');
    if (tx) {
      // 지붕 위 이름 간판 — 갓돌 위 다리 두 개로 세운다. 면마다 따로 묶어 등진 간판은 숨긴다
      const sg = new Side(def);
      const h0 = def.id === 'S' || def.id === 'N' ? 1.3 : 1.05, maxW = (sd.b - sd.a) * 0.72;
      const w = Math.min(maxW, h0 * tx.aspect), h = w / tx.aspect, u = (sd.a + sd.b) / 2, v = 1.02 + 0.2 + h / 2;
      sg.sign(u, v, h, tx.aspect, '#151d24', { t: -0.17, maxW });
      for (const k of [-0.32, 0.32]) sg.box(u + k * w - 0.05, u + k * w + 0.05, 1.02, v - h / 2, -0.165, -0.105, '#151d24');
      signs.push({ id: def.id, n: new Vector3(def.n[0], 0, def.n[1]), side: sg });
    }
    return sd;
  });
  const base = new Group();
  for (const [key, items] of col.groups) {
    const mesh = new Mesh(merge(items, true), mats.get(key));
    mesh.castShadow = true; mesh.receiveShadow = true;
    base.add(mesh);
  }
  group.add(base);
  for (const sd of sides) group.add(sd.group(mats));
  for (const s of signs) { s.group = s.side.group(mats); delete s.side; group.add(s.group); }
  return { group, signs, materials: mats.all(), textures: tx ? [tx.tex] : [] };
}

// ---------- 대지 — 포장 · 가로수 · 화단 ----------
export function buildSite(w, d) {
  const group = new Group();
  const m = { S: 6.4, E: 5.4, N: 3.0, W: 3.0 };
  const x0 = -SLAB - m.W, x1 = w + SLAB + m.E, z0 = -SLAB - m.N, z1 = d + SLAB + m.S;
  const tex = pavingTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set((x1 - x0) / 4, (z1 - z0) / 4);
  const plazaMat = keepBase(new MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0 }));
  const plaza = new Mesh(new BoxGeometry(x1 - x0, 0.14, z1 - z0), plazaMat);
  plaza.position.set((x0 + x1) / 2, -0.52, (z0 + z1) / 2);
  plaza.receiveShadow = true;
  group.add(plaza);
  const col = new Collector(), tcol = new Collector();
  const put = (geo, x, y, z, c, sx = 1, sy = 1, sz = 1, into = col) => { _m.makeTranslation(x, y, z).multiply(_s.makeScale(sx, sy, sz)); into.add('vc', geo, _m, c); };
  // 보도 경계석 — 앞 · 오른쪽 가장자리
  put(UNIT, (x0 + x1) / 2, -0.44, z1 - 0.15, '#cfcbc2', x1 - x0, 0.06, 0.3);
  put(UNIT, x1 - 0.15, -0.44, (z0 + z1) / 2, '#cfcbc2', 0.3, 0.06, z1 - z0);
  // 가로수 — 입구 앞은 비운다. 층을 고르면 시야를 가리지 않게 나무만 따로 걷어 낸다
  const trunk = new CylinderGeometry(0.1, 0.14, 1.9, 8), crown = new SphereGeometry(1, 14, 10);
  const tree = (x, z, s = 1) => {
    put(UNIT, x, -0.44, z, '#c3bdb1', 1.3, 0.04, 1.3);
    put(trunk, x, 0.5, z, '#7b6552', s, s, s, tcol);
    put(crown, x, 2.35 * s, z, '#8ca677', 1.2 * s, 1.05 * s, 1.2 * s, tcol);
    put(crown, x + 0.45 * s, 2.0 * s, z - 0.3 * s, '#7c9a68', 0.8 * s, 0.75 * s, 0.8 * s, tcol);
  };
  const zs = d + SLAB + 3.6;
  const xs = [1.4, 6.6, w - 6.6, w - 1.4].filter((x, i, a) => Math.abs(x - w / 2) > 4.5 && a.findIndex((y) => Math.abs(y - x) < 2.5) === i);
  for (const x of xs) tree(x, zs, x === 1.4 || x === w - 1.4 ? 1.05 : 0.92);
  const ne = Math.max(1, Math.round((d - 1) / 5.4));
  for (let k = 0; k < ne; k++) tree(w + SLAB + 3.0, d * ((k + 0.5) / ne), 0.95);
  // 화단
  if (w > 17) for (const x of [3.9, w - 3.9]) {
    put(UNIT, x, -0.3, zs, '#d6d2c8', 3.2, 0.3, 1.25);
    put(UNIT, x, -0.14, zs, '#93ad84', 3.0, 0.04, 1.05);
  }
  const mat = materialFor('vc'), tmat = materialFor('vc');
  for (const [, items] of col.groups) {
    const mesh = new Mesh(merge(items, true), mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  const trees = new Group();
  for (const [, items] of tcol.groups) {
    const mesh = new Mesh(merge(items, true), tmat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    trees.add(mesh);
  }
  group.add(trees);
  trunk.dispose(); crown.dispose();
  return { group, trees, treeMaterials: [tmat], materials: [plazaMat, mat], textures: [tex], bounds: { x0, x1, z0, z1 } };
}
