// 공용 형상 · 재질 도구 — 층 내부(render.js)와 외관(facade.js)이 같이 쓴다
// 로컬 공간 조감도 렌더러(render-three)의 재질 · 질감 · 부품 형상 규칙을 그대로 옮긴 것
import {
  Mesh, MeshStandardMaterial, MeshBasicMaterial, BufferGeometry, BufferAttribute, BoxGeometry, CylinderGeometry, SphereGeometry, LatheGeometry,
  TorusGeometry, ExtrudeGeometry, Shape, Vector2, Vector3, Matrix3, Matrix4, Euler, Color, CanvasTexture,
  SRGBColorSpace, RepeatWrapping,
} from './lib3.js';

export const BASE = { body: '#f5f5f1', black: '#172b34', metal: '#606c72', silver: '#b3bfc5', screen: '#ffffff', screenOff: '#090c10', paper: '#e8e5db', leaf: '#4e7958', grille: '#b2b7b2', linen: '#f9f5eb', stone: '#dfdacd', rug: '#bdbeb1', pot: '#c9bda7', cardboard: '#b19474', glass: '#748c91', light: '#fff8d4', window: '#91bec7' };
const TEXTURED = new Set(['wood', 'floor', 'grille', 'fabric', 'screen']);

export const colorOf = (name, style) => ({ wood: style.wood, fabric: style.fabric, cushion: style.cushion, floor: style.floor, wall: style.wall, ...BASE })[name] || name;

// ---------- 질감 (로컬 렌더러 N_ 그대로) ----------
const texCache = new Map();
export function texture(kind, style) {
  const key = kind + '|' + (kind === 'screen' ? '' : kind === 'wood' ? style.wood : kind === 'floor' ? style.floor : kind === 'fabric' ? style.fabric : '');
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const n = c.getContext('2d');
  if (kind === 'screen') {
    const g = n.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, '#143d6a'); g.addColorStop(0.6, '#317b98'); g.addColorStop(1, '#80bca9');
    n.fillStyle = g; n.fillRect(0, 0, 256, 256);
    n.fillStyle = '#ffffffdd'; n.font = 'bold 18px sans-serif'; n.fillText('SAMSUNG', 18, 38);
    n.fillStyle = '#ffffff33'; n.fillRect(18, 62, 220, 112);
    n.fillStyle = '#ffffffbb';
    for (let o = 0; o < 3; o++) n.fillRect(18, 192 + o * 15, 140 - o * 23, 5);
  } else if (kind === 'wood' || kind === 'floor') {
    n.fillStyle = kind === 'wood' ? style.wood : style.floor; n.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 120; r++) {
      const o = 0.015 + (Math.sin(r * 17.21) * 0.5 + 0.5) * 0.055;
      n.strokeStyle = `rgba(80,50,20,${o})`; n.beginPath(); n.moveTo(r * 2.5, 0); n.bezierCurveTo(r * 2.5 + 4, 80, r * 2.5 - 3, 180, r * 2.5 + 1, 256); n.stroke();
    }
    if (kind === 'floor') {
      n.strokeStyle = '#ffffff66'; n.lineWidth = 2;
      for (let r = 0; r < 4; r++) { n.beginPath(); n.moveTo(r * 64, 0); n.lineTo(r * 64, 256); n.stroke(); }
      n.strokeStyle = '#8d806733'; n.beginPath(); n.moveTo(0, 127); n.lineTo(256, 127); n.stroke();
    }
  } else {
    n.fillStyle = kind === 'fabric' ? style.fabric : '#a2ada9'; n.fillRect(0, 0, 256, 256);
    n.fillStyle = '#152b3128';
    for (let r = 0; r < 256; r += 6) for (let o = 0; o < 256; o += 6) n.fillRect(r, o, 2, 2);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (kind !== 'screen') { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(kind === 'floor' ? 4 : 1, kind === 'floor' ? 4 : 1); }
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

// ---------- 부품 형상 (로컬 렌더러 Fl · I_ 규칙, 건물 단위라 분할 수만 낮춤) ----------
const geoCache = new Map();
const _m4 = new Matrix4();
export function partGeometry(p, size, gt) {
  const gs = (i) => (gt && gt.scale ? gt.scale[i] : 1);
  let g;
  if (p.shape === 'box') {
    // 모서리 반경(2~3cm)은 건물 화면에서 1px 미만이라 직육면체로 그린다
    const s = p.physicalCornerRadius !== undefined && !(p.rotate || []).some(Boolean)
      ? p.size.map((v, i) => v * size[i] * gs(i)) : null;
    if (s) return new BoxGeometry(...s);
    g = new BoxGeometry(...p.size);
  } else if (p.shape === 'lathe') g = new LatheGeometry(p.profile.map(([x, y]) => new Vector2(x, y)), 20).scale(...p.size);
  else if (p.shape === 'torus') g = new TorusGeometry(0.8, 0.2, 8, 24).scale(...p.size);
  else if (p.shape === 'sphere') g = new SphereGeometry(1, 12, 8).scale(...p.size);
  else if (p.shape === 'cylinder') g = new CylinderGeometry(1, 1, 1, 16).scale(...p.size);
  else if (p.shape === 'curvedPanel') {
    const [sx, sy, sz] = p.size, a = p.curve || 0.12, pts = [];
    const f = (h) => (p.arc ? (p.arc.radius - Math.sqrt(Math.max(0, p.arc.radius ** 2 - (h * p.arc.width) ** 2))) / p.arc.depth : a * (1 - 4 * h * h));
    for (let h = 0; h <= 24; h++) { const d = h / 24 - 0.5; pts.push(new Vector2(d * sx, f(d))); }
    for (let h = 24; h >= 0; h--) { const d = h / 24 - 0.5; pts.push(new Vector2(d * sx, f(d) - sz)); }
    g = new ExtrudeGeometry(new Shape(pts), { depth: sy, bevelEnabled: false, steps: 1 });
    g.rotateX(Math.PI / 2).translate(0, sy / 2, 0);
  } else g = new BoxGeometry(...p.size);
  if (p.rotate) g.applyMatrix4(_m4.makeRotationFromEuler(new Euler(...p.rotate)));
  return g.scale(...size.map((v, i) => v * gs(i)));
}
export function cachedPart(a, p, pi) {
  const ck = a.id + '|' + pi;
  let g = geoCache.get(ck);
  if (!g) { g = partGeometry(p, a.s, a.gt); geoCache.set(ck, g); }
  return g;
}
export const partPos = (p, a) => p.position.map((v, i) => (v + (a.gt && a.gt.offset ? a.gt.offset[i] : 0)) * (a.gt && a.gt.scale ? a.gt.scale[i] : 1) * a.s[i]);

// ---------- 같은 재질끼리 합치기 ----------
export class Collector {
  constructor() { this.groups = new Map(); }
  add(key, geo, matrix, color) {
    let g = this.groups.get(key);
    if (!g) this.groups.set(key, (g = []));
    g.push({ geo, matrix: matrix.clone(), color });
  }
}
const _v = new Vector3(), _n3 = new Matrix3(), _c = new Color();
export function merge(items, withColor) {
  let count = 0;
  for (const it of items) count += it.geo.index ? it.geo.index.count : it.geo.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), uv = new Float32Array(count * 2);
  const col = withColor ? new Float32Array(count * 3) : null;
  let o = 0;
  for (const { geo, matrix, color } of items) {
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, I = geo.index;
    _n3.getNormalMatrix(matrix);
    if (col) _c.set(color || '#cccccc');
    const n = I ? I.count : P.count;
    for (let k = 0; k < n; k++, o++) {
      const i = I ? I.getX(k) : k;
      _v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      pos[o * 3] = _v.x; pos[o * 3 + 1] = _v.y; pos[o * 3 + 2] = _v.z;
      if (N) { _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize(); nor[o * 3] = _v.x; nor[o * 3 + 1] = _v.y; nor[o * 3 + 2] = _v.z; }
      if (U) { uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i); }
      if (col) { col[o * 3] = _c.r; col[o * 3 + 1] = _c.g; col[o * 3 + 2] = _c.b; }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('uv', new BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// 재질 키 → 재질 (로컬 렌더러 ee 규칙 + 외벽 유리 vcglass + 스스로 빛나는 정점 색 vcglow — 네온 띠 · 전구)
export function materialFor(key, style) {
  if (key === 'vcglow') return keepBase(new MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  const ceil = key.startsWith('ceil:');
  const k = ceil ? key.slice(5) : key;
  const opt = { roughness: 0.65, metalness: 0.04 };
  if (k === 'vc' || k === 'vc:metal') { opt.vertexColors = true; if (k === 'vc:metal') opt.metalness = 0.5; }
  else if (k === 'vcglass') { opt.vertexColors = true; opt.transparent = true; opt.opacity = 0.62; opt.roughness = 0.12; opt.metalness = 0.06; opt.depthWrite = false; }
  else if (k.startsWith('tex:')) {
    const t = k.slice(4);
    opt.map = texture(t, style); opt.color = '#ffffff';
    if (t === 'screen') { opt.emissive = new Color('#3d7590'); opt.emissiveIntensity = 0.18; opt.polygonOffset = true; opt.polygonOffsetFactor = -1; opt.polygonOffsetUnits = -1; }
  } else if (k === 'glass' || k === 'window') {
    opt.color = BASE[k]; opt.transparent = true; opt.opacity = k === 'window' ? 0.35 : 0.55; opt.roughness = 0.2; opt.depthWrite = false;
  } else if (k === 'light') { opt.color = BASE.light; opt.emissive = new Color('#fff1bf'); opt.emissiveIntensity = 0.18; }
  else opt.color = k;
  if (ceil) { opt.transparent = true; opt.opacity = (opt.opacity || 1) * 0.65; }
  return keepBase(new MeshStandardMaterial(opt));
}
// 투명도 애니메이션(층 걷어 내기)이 원래 값으로 돌아올 수 있게 기억해 둔다
export function keepBase(m) {
  m.userData.baseOpacity = m.opacity;
  m.userData.baseTransparent = m.transparent;
  m.userData.baseDepthWrite = m.depthWrite;
  return m;
}
export function keyOf(mat) {
  if (TEXTURED.has(mat)) return 'tex:' + mat;
  if (mat === 'glass' || mat === 'window' || mat === 'light') return mat;
  if (mat === 'metal' || mat === 'silver') return 'vc:metal';
  return 'vc';
}
// 모은 형상을 재질별 메시로
export function meshesOf(col, style, group, materials, { shadows = true } = {}) {
  for (const [key, items] of col.groups) {
    const geo = merge(items, key.endsWith('vc') || key.endsWith('vc:metal') || key === 'vcglass');
    const mat = materialFor(key, style);
    materials.push(mat);
    const mesh = new Mesh(geo, mat);
    const clear = key === 'window' || key === 'glass' || key === 'vcglass' || key.startsWith('ceil:');
    mesh.castShadow = shadows && !clear;
    mesh.receiveShadow = true;
    if (clear) mesh.renderOrder = 2;
    group.add(mesh);
  }
}
