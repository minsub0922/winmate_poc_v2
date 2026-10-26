// 건물 조감도 3D 렌더러
// 한 층 = 공간 조감도 한 장. 로컬 공간 조감도 렌더러(render-three · createSpatialRenderer)의
// 재질 · 조명 · 공간 껍데기 · 부품 형상 규칙을 그대로 옮기고, 여러 층을 쌓는 부분과 외관(facade.js)을 더했다.
// 층마다 같은 재질끼리 형상을 하나로 합쳐 그리기 횟수를 줄인다.
// 보기: spread 0 = 외관 보기(층을 붙여 쌓고 외벽 · 지붕 · 대지), 1 = 펼쳐 보기(층 사이를 벌리고 앞쪽 외벽을 걷어 냄)
// 크기가 다른 층은 가장 큰 층 가운데에 맞춰 쌓고, 위층이 작으면 드러난 지붕에 테라스(유리 난간)를 깐다.
import {
  WebGLRenderer, Scene, OrthographicCamera, Group, Mesh, LineBasicMaterial, LineDashedMaterial,
  BufferGeometry, BoxGeometry, SphereGeometry, PlaneGeometry, Vector2, Vector3, Matrix4, Color,
  HemisphereLight, DirectionalLight, ShadowMaterial, Raycaster, Line, LineSegments, EdgesGeometry,
  MeshBasicMaterial, SRGBColorSpace, ACESFilmicToneMapping, PCFShadowMap, OrbitControls,
} from './lib3.js';
import { data, tplOf } from './data.js';
import { colorOf, keyOf, cachedPart, partPos, Collector, meshesOf } from './mesh.js';
import { buildFacade, buildRoof, buildSite, buildTerrace, setFont, kitOf, signOfInd, SLAB } from './facade.js';

// 화면 사진(displayFaces)이 있는 제품 — 원본은 사진을 붙이고, 여기서는 켜진 화면 질감으로 대신한다
const FACE_PRODUCTS = new Set(['product:qm43c', 'product:oh55a', 'product:qm55c', 'product:sg_g000184177', 'product:qm65c', 'product:hoteltv', 'product:led_indoor', 'product:led_outdoor', 'product:flip']);
export const PITCH_STACK = 4.0;   // 외관 보기 층고 (바닥판 포함)
export const PITCH_SPREAD = 8.6;  // 펼쳐 보기 층 간격
const ROOM_H = 3.1;
const CUT_DOT = 0.2;              // 카메라 쪽을 보는 면(법선·시선 > 이 값)을 걷어 낸다

// ---------- 한 층 만들기 ----------
const _obj = new Matrix4(), _part = new Matrix4();
function addBox(col, style, x, y, z, w, h, d, mat) {
  const g = new BoxGeometry(w, h, d);
  _part.makeTranslation(x, y, z);
  col.add(keyOf(mat), g, _part, colorOf(mat, style));
}
export function buildFloor(tplId, { people = true } = {}) {
  const D = data();
  const t = tplOf(tplId);
  if (!t) throw new Error('공간 조감도를 찾지 못했어요: ' + tplId);
  const style = D.styles[t.style] || D.styles.warm;
  const col = new Collector();
  // 바닥판 (로컬 렌더러와 같은 0.42m 판)
  addBox(col, style, t.w / 2, -0.24, t.d / 2, t.w + 0.7, 0.42, t.d + 0.7, 'body');
  // 공간 껍데기: 바닥 · 뒷벽 · 옆벽 · 낮은 벽 · 문 · 창
  for (const r of t.rooms) {
    const [, , , x, z, w, d, outdoor] = r;
    addBox(col, style, x + w / 2, -0.015, z + d / 2, w, 0.07, d, outdoor ? '#aebf9d' : 'floor');
    if (outdoor) continue;
    const he = x + w / 2;
    addBox(col, style, he, 1.15 / 2, z, w, 1.15, 0.15, 'wall');
    addBox(col, style, x, 1.15 / 2, z + d / 2, 0.15, 1.15, d, 'wall');
    addBox(col, style, x + w, 0.16, z + d / 2, 0.14, 0.32, d, 'wall');
    for (const s of [-1, 1]) addBox(col, style, he + s * (w + 1.2) / 4, 0.14, z + d, (w - 1.2) / 2, 0.28, 0.15, 'wall');
    for (const f of [0.3, 0.74]) {
      const gx = x + w * f;
      addBox(col, style, gx, 1.05, z - 0.015, w * 0.25, 0.65, 0.055, 'window');
      addBox(col, style, gx, 0.73, z - 0.035, w * 0.25, 0.035, 0.1, 'metal');
    }
    addBox(col, style, he, 0.025, z + d, 1.2, 0.025, 0.16, 'wood');
  }
  // 가구 · 제품
  for (const o of t.objs) {
    const [ai, x, z, elev, rot, , ceil] = o;
    const a = D.assets[ai];
    if (!a) continue;
    const parts = (a.r && D.recipes[a.r]) || a.p || [];
    _obj.makeRotationY(-(rot || 0) * Math.PI / 180).setPosition(x, elev, z);
    parts.forEach((p, pi) => {
      const g = cachedPart(a, p, pi);
      const pp = partPos(p, a);
      _part.makeTranslation(pp[0], pp[1], pp[2]).premultiply(_obj);
      let mat = p.material;
      if (a.pid && (mat === 'screen' || mat === 'screenOff')) mat = FACE_PRODUCTS.has(a.id) ? 'screen' : 'screenOff';
      else if (a.pid && mat === 'body' && a.bc) mat = a.bc;
      col.add((ceil ? 'ceil:' : '') + keyOf(mat), g, _part, colorOf(mat, style));
    });
  }
  // 사람 — 원본의 사람 부품(층당 600여 개) 대신 같은 위치 · 키 · 옷 색의 단순한 인물로
  if (people) {
    for (const p of t.ppl) {
      const [x, y, z, h, , shirt, pants, skin, hair] = p;
      const r = Math.max(0.075, Math.min(0.115, h * 0.08));
      const legH = h * 0.42, torsoH = Math.max(0.2, h - legH - r * 2.05);
      const box = (w, hh, d, cy, c) => { _part.makeTranslation(x, cy, z); col.add('vc', new BoxGeometry(w, hh, d), _part, c); };
      box(0.26, legH, 0.22, y + legH / 2, pants);
      box(0.36, torsoH, 0.24, y + legH + torsoH / 2, shirt);
      _part.makeTranslation(x, y + h - r, z);
      col.add('vc', new SphereGeometry(r, 10, 8), _part, skin);
      _part.makeScale(1.06, 0.62, 1.06).setPosition(x, y + h - r * 0.62, z);
      col.add('vc', new SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), _part, hair);
    }
  }
  const group = new Group();
  const materials = [];
  meshesOf(col, style, group, materials);
  group.userData = { tplId, w: t.w, d: t.d };
  return { group, materials, tpl: t };
}

// 빈 층 — 바닥판 · 바닥 마감 · 기둥 격자만 (공간을 아직 고르지 않은 층)
export function buildEmptyFloor(w, d) {
  const D = data();
  const style = D.styles.warm || Object.values(D.styles)[0];
  const col = new Collector();
  addBox(col, style, w / 2, -0.24, d / 2, w + 0.7, 0.42, d + 0.7, 'body');
  addBox(col, style, w / 2, -0.015, d / 2, w, 0.07, d, 'floor');
  // 약 8m 간격 기둥 — 빈 층도 구조가 보이게
  const nx = Math.max(1, Math.round((w - 1.2) / 8)), nz = Math.max(1, Math.round((d - 1.2) / 8));
  for (let i = 0; i <= nx; i++) for (let k = 0; k <= nz; k++) {
    const x = 0.6 + (w - 1.2) * i / nx, z = 0.6 + (d - 1.2) * k / nz;
    addBox(col, style, x, ROOM_H / 2, z, 0.42, ROOM_H, 0.42, 'wall');
  }
  const group = new Group();
  const materials = [];
  meshesOf(col, style, group, materials);
  group.userData = { tplId: null, w, d };
  return { group, materials };
}

// 층 하나 = 껍데기(외벽 업종 · 바닥 크기 — 건물 형태) + 안(공간 조감도, 없으면 빈 층)
// x: 공간 조감도 id 또는 { tpl(없으면 빈 층), fv, ind(외벽 업종), w, d, name(층 이름 = 간판) } → 무대가 쓰는 모양(못 그리면 null)
export function shapeOf(x) {
  const it = typeof x === 'string' ? { tpl: x } : x || {};
  const t = it.tpl ? tplOf(it.tpl) : null;
  if (it.tpl && !t) return null;
  const ind = it.ind || (t && t.ind), w = it.w || (t && t.w), d = it.d || (t && t.d);
  if (!ind || !w || !d) return null;
  const sh = { id: t ? t.id : null, t, ind, w, d, fv: it.fv || 0, rooms: t ? t.rooms : [] };
  return Object.assign(sh, signFields(it.name, t, ind));
}
// 층 간판 — 붙인 이름 > 넣은 공간(복합층은 그 간판, 외벽과 다른 업종이면 그 업종 간판, 같은 업종이면 외벽 변형의 간판) > 빈 층은 간판 없음
function signFields(name, t, ind) {
  const signName = String(name || '').trim() || undefined;
  if (signName) return { signName, sign: undefined, noSign: false };
  if (!t) return { signName: undefined, sign: undefined, noSign: true };
  return { signName: undefined, sign: t.sign || (t.ind !== ind ? signOfInd(t.ind) : undefined), noSign: false };
}

// ---------- 카메라 맞추기 (로컬 렌더러와 같은 정사영 · 여백 1.12배) ----------
const _v = new Vector3();
function fitFrustum(camera, box, aspect, pad = 1.12) {
  camera.updateMatrixWorld();
  const inv = camera.matrixWorldInverse;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    _v.set(x, y, z).applyMatrix4(inv);
    minX = Math.min(minX, _v.x); maxX = Math.max(maxX, _v.x); minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y);
  }
  return Math.max(maxY - minY, (maxX - minX) / aspect) * pad;
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function cssVar(el, name, fb) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fb;
}
// 투명도 적용 (층 걷어 내기 · 지붕 · 대지 나타나기)
function fade(materials, alpha) {
  for (const m of materials) {
    const tr = m.userData.baseTransparent || alpha < 0.999;
    if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
    m.opacity = m.userData.baseOpacity * alpha;
    m.depthWrite = m.userData.baseDepthWrite && alpha >= 0.999;
  }
}
function visibleChain(o, stop) {
  for (; o && o !== stop; o = o.parent) if (!o.visible) return false;
  return true;
}

// ---------- 스튜디오 무대 ----------
export class Stage {
  constructor(host, { onFloorClick, onFacadeClick, onSignClick, onRender, onError } = {}) {
    this.host = host;
    this.onFloorClick = onFloorClick;
    this.onFacadeClick = onFacadeClick; // 외관 보기에서 외벽을 누르면 (없으면 층 고르기로)
    this.onSignClick = onSignClick;     // 외관 보기에서 간판 글자를 누르면 — (층 | null = 지붕 건물 이름, 자리)
    this.onRender = onRender;
    try {
      this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    } catch (e) {
      onError && onError(e);
      throw new Error('이 브라우저에서 WebGL을 사용할 수 없어 3D 건물을 그릴 수 없어요.');
    }
    setFont(getComputedStyle(host).fontFamily);
    const R = this.renderer;
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    R.shadowMap.enabled = true;
    R.shadowMap.type = PCFShadowMap;
    R.outputColorSpace = SRGBColorSpace;
    R.toneMapping = ACESFilmicToneMapping;
    R.toneMappingExposure = 1.05;
    R.domElement.setAttribute('role', 'img');
    R.domElement.setAttribute('aria-label', '3D 건물 조감도 · 드래그로 회전, 휠로 확대, 층을 눌러 내부 보기');
    host.appendChild(R.domElement);
    this.scene = new Scene();
    this.camera = new OrthographicCamera(-10, 10, 10, -10, 0.1, 3000);
    this.fit = 30;
    const c = (this.controls = new OrbitControls(this.camera, R.domElement));
    c.enableDamping = false;
    c.minPolarAngle = 0.15;
    c.maxPolarAngle = Math.PI * 0.47;
    c.minZoom = 0.35;
    c.maxZoom = 8;
    c.addEventListener('change', () => this.render());
    this.scene.add(new HemisphereLight('#ffffff', '#b8baa9', 1.2));
    const key = (this.key = new DirectionalLight('#fff5df', 3.4));
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -3e-4;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 3;
    this.scene.add(key, key.target);
    const fill = new DirectionalLight('#dcecff', 0.8);
    fill.position.set(20, 15, -12);
    this.scene.add(fill);
    this.root = new Group();
    this.scene.add(this.root);
    this.floors = [];
    this.spread = 0;
    this.focus = null;
    this.roofAlpha = 1;
    this.title = '';
    this.facades = true;
    this.anims = new Set();
    this.hl = null; // 외벽 고르는 층(강조)
    this.dead = false;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    // 클릭(드래그가 아닌) — 외관 보기에서 외벽(층의 네 면)을 누르면 외벽 고르기, 나머지(층 안 · 지붕 · 테라스)는 층 고르기.
    // 숨은 면(걷어 낸 외벽)은 건너뛴다
    const rc = (this.rc = new Raycaster()), ndc = new Vector2();
    let down = null;
    this._down = (e) => {
      if (e.button === 0) down = { x: e.clientX, y: e.clientY };
      clearTimeout(this._hoverT); this._hoverT = 0;
      R.domElement.style.cursor = '';
    };
    this._up = (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
      down = null;
      const b = R.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      rc.setFromCamera(ndc, this.camera);
      const targets = this.floors.map((f) => f.content);
      if (this.roof && this.roof.group.visible) targets.push(this.roof.group);
      const { i, facade, sign, roofSign } = this.classify(rc.intersectObjects(targets, true));
      const pt = { x: e.clientX - b.left, y: e.clientY - b.top };
      if (this.onSignClick && this.exterior() && (sign || roofSign)) this.onSignClick(roofSign ? null : i, pt);
      else if (facade && this.onFacadeClick && this.exterior()) this.onFacadeClick(i, pt);
      else this.onFloorClick && this.onFloorClick(i);
    };
    // 외벽 위에서는 손가락 모양 — 초당 10번까지, 멈춘 자리도 한 번 더 검사
    this._move = (e) => {
      if (!this.onFacadeClick || e.buttons) return;
      this._hoverPt = { x: e.clientX, y: e.clientY };
      if (this._hoverT) return;
      const wait = 100 - (performance.now() - (this._hoverAt || 0));
      if (wait > 0) this._hoverT = setTimeout(() => this.hover(), wait);
      else this.hover();
    };
    this._leave = () => { clearTimeout(this._hoverT); this._hoverT = 0; R.domElement.style.cursor = ''; };
    R.domElement.addEventListener('pointerdown', this._down);
    R.domElement.addEventListener('pointerup', this._up);
    R.domElement.addEventListener('pointermove', this._move);
    R.domElement.addEventListener('pointerleave', this._leave);
    R.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onError && onError(new Error('3D 그래픽 연결이 끊어졌어요. 화면을 다시 열어 주세요.')); });
    this.applyTheme();
  }

  hover() {
    this._hoverT = 0;
    this._hoverAt = performance.now();
    if (this.dead || !this._hoverPt) return;
    const R = this.renderer;
    let on = false;
    if (this.exterior()) {
      const b = R.domElement.getBoundingClientRect(), ndc = new Vector2();
      ndc.set(((this._hoverPt.x - b.left) / b.width) * 2 - 1, -((this._hoverPt.y - b.top) / b.height) * 2 + 1);
      this.rc.setFromCamera(ndc, this.camera);
      const targets = [];
      this.floors.forEach((f, k) => {
        if (!f.content.visible) return;
        if (k === this.focus) { targets.push(f.content); return; } // 고른 층은 안까지 — 안을 누르면 층 고르기
        if (f.sides) for (const s of f.sides) if (s.group.visible) targets.push(s.group);
        if (f.terrace && f.terrace.group.visible) targets.push(f.terrace.group);
      });
      if (this.roof && this.roof.group.visible) targets.push(this.roof.group);
      const c = this.classify(this.rc.intersectObjects(targets, true));
      on = c.facade || (!!this.onSignClick && c.roofSign);
    }
    R.domElement.style.cursor = on ? 'pointer' : '';
  }

  // 맞은 것 중 맨 앞(보이는 것) → 층 번호 · 외벽인지. 지붕(파라펫 포함) · 테라스 · 층 안은 외벽이 아님
  // sign = 층 간판 글자, roofSign = 지붕 건물 이름 간판
  classify(hits) {
    let i = null, facade = false, sign = false, roofSign = false;
    for (const h of hits) {
      if (!visibleChain(h.object, this.scene)) continue;
      let o = h.object, side = false;
      const text = !!h.object.userData.sign;
      while (o && o.userData.floor === undefined) { if (o.userData.side) side = true; o = o.parent; }
      if (!o) continue;
      i = o.userData.floor;
      facade = side && !o.userData.roof;
      sign = facade && text;
      roofSign = !!o.userData.roof && text;
      if (this.focus === null || i === this.focus || (this.floors[i] && this.floors[i].alpha > 0.5)) break;
    }
    return { i, facade, sign, roofSign };
  }

  // 외벽을 고르는 층 둘레에 강조색 테두리 (null = 끔). 고르는 외벽 색이 그대로 보이게 물들이지는 않는다
  setHighlight(i) {
    this.hl = i === null || i === undefined || !this.floors[i] ? null : i;
    this.applyHighlight();
    this.render();
  }
  dropFrame() {
    const g = this.hlFrame;
    if (!g) return;
    if (g.parent) g.parent.remove(g);
    g.children.forEach((m) => m.geometry.dispose());
    g.userData.mat.dispose();
    this.hlFrame = null;
  }
  applyHighlight() {
    this.dropFrame();
    const f = this.hl === null ? null : this.floors[this.hl];
    if (!f) return;
    // 층 바닥판 아래 ~ 외벽 위(다음 층 바닥판 아래)까지, 외벽 면 바로 바깥의 모서리 12개
    const e = 0.08, t = 0.11;
    const x0 = -SLAB - e, x1 = f.tpl.w + SLAB + e, z0 = -SLAB - e, z1 = f.tpl.d + SLAB + e, y0 = -0.45, y1 = PITCH_STACK - 0.45;
    const mat = new MeshBasicMaterial({ color: this.theme.accent, toneMapped: false });
    const g = new Group();
    g.userData.mat = mat;
    const bar = (cx, cy, cz, sx, sy, sz) => {
      const m = new Mesh(new BoxGeometry(sx, sy, sz), mat);
      m.position.set(cx, cy, cz);
      m.raycast = () => {}; // 누르기 · 손가락 모양 검사에서 빼기
      g.add(m);
    };
    for (const y of [y0, y1]) {
      bar((x0 + x1) / 2, y, z0, x1 - x0 + t, t, t);
      bar((x0 + x1) / 2, y, z1, x1 - x0 + t, t, t);
      bar(x0, y, (z0 + z1) / 2, t, t, z1 - z0 + t);
      bar(x1, y, (z0 + z1) / 2, t, t, z1 - z0 + t);
    }
    for (const x of [x0, x1]) for (const z of [z0, z1]) bar(x, (y0 + y1) / 2, z, t, y1 - y0, t);
    f.content.add(g);
    this.hlFrame = g;
  }
  // 층(외벽 포함)이 화면에서 차지하는 영역 — 외벽 고르기 팝업이 그 층을 가리지 않게
  rectOf(i) {
    const f = this.floors[i];
    if (!f) return null;
    const y = f.content.position.y, m = SLAB + 0.8;
    let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
    for (const x of [-m, f.tpl.w + m]) for (const z of [-m, f.tpl.d + m]) for (const dy of [-0.45, PITCH_STACK - 0.45]) {
      const p = this.project(f.ox + x, y + dy, f.oz + z);
      l = Math.min(l, p.x); r = Math.max(r, p.x); t = Math.min(t, p.y); b = Math.max(b, p.y);
    }
    return { left: l, right: r, top: t, bottom: b };
  }

  applyTheme() {
    const h = this.host;
    this.theme = {
      ground: cssVar(h, '--surface-3', '#eef0f4'),
      line: cssVar(h, '--line-2', '#d3d8e0'),
      guide: cssVar(h, '--faint', '#6e7686'),
      accent: cssVar(h, '--accent', '#1428a0'),
    };
    if (this.guides) this.guides.forEach((l) => l.material.color.set(this.theme.guide));
    for (const f of this.floors) f.edges.material.color.set(this.theme.line);
    if (this.hl !== null) this.applyHighlight();
    this.render();
  }

  resize() {
    const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
    this.w = w; this.h = h;
    this.renderer.setSize(w, h, false);
    this.applyFrustum();
    this.render();
  }
  applyFrustum() {
    const a = this.w / this.h, x = this.fit, cam = this.camera;
    cam.left = -x * a / 2; cam.right = x * a / 2; cam.top = x / 2; cam.bottom = -x / 2;
    cam.updateProjectionMatrix();
  }

  render() {
    if (this.dead || this.pending) return;
    this.pending = true;
    requestAnimationFrame(() => {
      this.pending = false;
      if (this.dead) return;
      this.renderNow();
      this.onRender && this.onRender();
    });
  }
  renderNow() {
    this.updateCut();
    this.renderer.render(this.scene, this.camera);
  }
  // 걷어 내는 층은 카메라 쪽 외벽 면만 숨긴다 — 뒤쪽 벽은 남아 어떤 건물의 층인지 보인다
  updateCut() {
    if (!this.facades) return;
    const d = _v.copy(this.camera.position).sub(this.controls.target);
    d.y = 0;
    if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
    d.normalize();
    for (const f of this.floors) {
      if (!f.sides) continue;
      for (const s of f.sides) s.group.visible = !f.cut || s.n.dot(d) < CUT_DOT;
    }
    // 지붕 이름 간판은 등진 면을 숨긴다 (뒤에서 보면 검은 판만 보여서)
    if (this.roof && this.roof.signs) for (const s of this.roof.signs) s.group.visible = s.n.dot(d) > -0.25;
  }

  pitch() { return PITCH_STACK + (PITCH_SPREAD - PITCH_STACK) * ease(this.spread); }

  // 층 구성 바꾸기 — items: 아래층부터 공간 조감도 id 또는 { tpl(없으면 빈 층), fv(외벽 변형 번호), ind · w · d(껍데기) }
  setFloors(items, { title = this.title, facades = this.facades } = {}) {
    this.dropFrame();
    for (const f of this.floors) this.disposeFloor(f);
    this.disposeShell();
    this.floors = [];
    const list = items.map(shapeOf).filter(Boolean);
    // 진행 중이던 층 걷기 애니메이션은 끊고, 지붕 · 가로수는 지금 초점에 맞춘다
    if (this.focusJob) this.focusJob.done = true;
    if (this.focus !== null && !list[this.focus]) this.focus = null;
    this.roofAlpha = this.focus === null ? 1 : 0;
    this.title = title || '';
    this.facades = facades;
    const tpls = list; // 층마다 껍데기 크기(w · d)로 쌓는다
    const W = Math.max(0, ...tpls.map((t) => t.w)), Dd = Math.max(0, ...tpls.map((t) => t.d));
    list.forEach((x, i) => {
      const tpl = x;
      let group, materials;
      if (x.t) {
        ({ group, materials } = buildFloor(x.t.id));
        // 안의 공간이 껍데기와 크기가 다르면 가운데에
        if (Math.abs(x.t.w - x.w) > 0.01 || Math.abs(x.t.d - x.d) > 0.01) group.position.set((x.w - x.t.w) / 2, 0, (x.d - x.t.d) / 2);
      } else ({ group, materials } = buildEmptyFloor(x.w, x.d));
      const ox = (W - tpl.w) / 2, oz = (Dd - tpl.d) / 2;
      const content = new Group();
      content.add(group);
      content.position.set(ox, 0, oz);
      content.userData.floor = i;
      // 바닥판 윤곽선
      const eg = new EdgesGeometry(new BoxGeometry(tpl.w + 0.7, 0.42, tpl.d + 0.7));
      const edges = new LineSegments(eg, new LineBasicMaterial({ color: this.theme.line, transparent: true }));
      edges.position.set(tpl.w / 2, -0.24, tpl.d / 2);
      edges.raycast = () => {}; // 윤곽선은 누르기 검사에서 뺀다(선은 1m 안팎까지 맞은 것으로 쳐서 외벽 · 간판 클릭을 가로챔)
      content.add(edges);
      let sides = null, kit = null, terrace = null, faMats = null;
      if (facades) {
        const fa = buildFacade(tpl, { index: i, fv: x.fv });
        sides = fa.sides;
        kit = fa.kit;
        faMats = fa.materials;
        for (const s of sides) content.add(s.group);
        materials.push(...fa.materials);
        // 위층이 더 작으면 드러난 지붕에 테라스
        const up = tpls[i + 1];
        if (up) {
          const ux = (W - up.w) / 2 - ox, uz = (Dd - up.d) / 2 - oz;
          terrace = buildTerrace(tpl.w, tpl.d, { x0: ux - SLAB, z0: uz - SLAB, x1: ux + up.w + SLAB, z1: uz + up.d + SLAB }, { top: PITCH_STACK - 0.06, kit });
          if (terrace) { content.add(terrace.group); materials.push(...terrace.materials); }
        }
      }
      this.root.add(content);
      this.floors.push({ id: x.id, fv: x.fv, i, tpl, content, materials, edges, sides, kit, faMats, terrace, ox, oz, alpha: 1, cut: false });
    });
    // 초점을 둔 채 다시 지으면(외벽 바꾸기) 걷어 낸 모양 그대로
    if (this.focus !== null) {
      const ext = this.spread < 0.5;
      this.floors.forEach((f, k) => (f.alpha = k === this.focus ? 1 : k > this.focus ? 0 : ext ? 1 : 0.1));
    }
    if (this.hl !== null && !this.floors[this.hl]) this.hl = null;
    this.buildSite();
    this.buildShell();
    if (this.hl !== null) this.applyHighlight();
    this.layout();
  }

  disposeFloor(f) {
    f.content.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
    for (const m of f.materials) { if (m.map && m.map.userData.own) m.map.dispose(); m.dispose(); }
    f.edges.material.dispose();
    this.root.remove(f.content);
  }

  // 외벽만 바꾸기 — changes: [[층, 외벽 변형 번호], …]. 층 안(공간 · 제품)은 그대로 두고
  // 그 층의 외벽 · 테라스(맨 위층이면 지붕도)만 다시 짓는다. 시점 · 초점은 그대로
  setFacade(changes, force = false) {
    if (!this.facades) return;
    const top = this.floors.length - 1;
    let roof = false;
    for (const [i, fv] of changes) {
      const f = this.floors[i];
      if (!f || (f.fv === fv && !force)) continue;
      const old = [...(f.faMats || []), ...(f.terrace ? f.terrace.materials : [])];
      const drop = (g) => { f.content.remove(g); g.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); }); };
      for (const s of f.sides || []) drop(s.group);
      if (f.terrace) drop(f.terrace.group);
      for (const m of old) { if (m.map && m.map.userData.own) m.map.dispose(); m.dispose(); }
      const materials = f.materials.filter((m) => !old.includes(m));
      const fa = buildFacade(f.tpl, { index: i, fv });
      for (const s of fa.sides) f.content.add(s.group);
      materials.push(...fa.materials);
      let terrace = null;
      const up = this.floors[i + 1];
      if (up) {
        const ux = up.ox - f.ox, uz = up.oz - f.oz;
        terrace = buildTerrace(f.tpl.w, f.tpl.d, { x0: ux - SLAB, z0: uz - SLAB, x1: ux + up.tpl.w + SLAB, z1: uz + up.tpl.d + SLAB }, { top: PITCH_STACK - 0.06, kit: fa.kit });
        if (terrace) { f.content.add(terrace.group); materials.push(...terrace.materials); }
      }
      Object.assign(f, { fv, sides: fa.sides, kit: fa.kit, faMats: fa.materials, terrace, materials });
      if (i === top) roof = true;
    }
    if (roof) this.buildRoofOnly();
    if (this.hl !== null) this.applyHighlight();
    this.layout();
  }

  // 층 이름(간판) 바꾸기 — 그 층 외벽만 다시
  setSign(i, name) {
    const f = this.floors[i];
    if (!f) return;
    Object.assign(f.tpl, signFields(name, f.tpl.t, f.tpl.ind));
    this.setFacade([[i, f.fv]], true);
  }

  // 지붕(건물 이름) · 대지 — 외관 보기에서만
  buildShell() {
    if (!this.facades || !this.floors.length) return;
    this.buildRoofOnly();
    this.site = buildSite(this.size.w, this.size.d);
    this.root.add(this.site.group);
  }
  // 지붕만 다시 — 맨 위층 외벽(난간 · 갓돌 색)과 건물 이름을 따른다
  buildRoofOnly() {
    const s = this.roof;
    if (s) {
      s.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      s.materials.forEach((m) => m.dispose());
      (s.textures || []).forEach((t) => t.dispose());
      this.root.remove(s.group);
      this.roof = null;
    }
    const top = this.floors[this.floors.length - 1];
    this.roof = buildRoof(top.tpl, { title: this.title, kit: top.kit || kitOf(top.tpl.ind, top.fv) });
    this.roof.group.userData.floor = this.floors.length - 1;
    this.roof.group.userData.roof = true;
    this.roof.group.position.set(top.ox, 0, top.oz);
    this.root.add(this.roof.group);
  }
  disposeShell() {
    for (const k of ['roof', 'site']) {
      const s = this[k];
      if (!s) continue;
      s.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      [...s.materials, ...(s.treeMaterials || [])].forEach((m) => m.dispose());
      (s.textures || []).forEach((t) => t.dispose());
      this.root.remove(s.group);
      this[k] = null;
    }
  }
  // 건물 이름이 바뀌면 지붕 간판만 다시
  setTitle(title) {
    title = (title || '').trim();
    if (title === this.title) return;
    this.title = title;
    if (!this.facades || !this.floors.length) return;
    this.buildRoofOnly();
    this.layout();
  }

  // 대지 · 모서리 안내선
  buildSite() {
    if (this.ground) { this.root.remove(this.ground); this.ground.geometry.dispose(); this.ground.material.dispose(); this.ground = null; }
    if (this.guides) { for (const l of this.guides) { this.root.remove(l); l.geometry.dispose(); l.material.dispose(); } this.guides = null; }
    if (!this.floors.length) return;
    const w = Math.max(...this.floors.map((f) => f.tpl.w)), d = Math.max(...this.floors.map((f) => f.tpl.d));
    this.size = { w, d };
    // 대지는 그림자만 받는 투명 판 — 화면 배경색이 그대로 보여 밝은 · 어두운 화면 모두 어울린다
    const g = new Mesh(new PlaneGeometry(w * 12, d * 12), new ShadowMaterial({ color: '#1b2430', opacity: 0.16 }));
    g.rotation.x = -Math.PI / 2;
    g.position.set(w / 2, -0.6, d / 2);
    g.receiveShadow = true;
    this.ground = g;
    this.root.add(g);
    this.guides = [[-0.35, -0.35], [w + 0.35, -0.35], [-0.35, d + 0.35], [w + 0.35, d + 0.35]].map(([x, z]) => {
      const geo = new BufferGeometry().setFromPoints([new Vector3(x, -0.6, z), new Vector3(x, 1, z)]);
      const l = new Line(geo, new LineDashedMaterial({ color: this.theme.guide, dashSize: 0.45, gapSize: 0.35, transparent: true, opacity: 0.55 }));
      l.computeLineDistances();
      this.root.add(l);
      return l;
    });
  }

  // 층 높이 · 외벽 걷기 · 투명도 반영
  layout() {
    const P = this.pitch(), s = this.spread;
    this.floors.forEach((f, i) => {
      f.content.position.y = i * P;
      f.cut = s > 0.02 || this.focus === i;
      // 테라스는 층을 붙여 쌓은 외관에서만 (걷어 낸 층 · 펼쳐 보기에선 안이 보이게)
      if (f.terrace) f.terrace.group.visible = !f.cut;
      f.edges.material.opacity = Math.max(0.12, f.alpha);
      f.content.visible = f.alpha > 0.01;
      fade(f.materials, f.alpha);
    });
    if (this.roof) {
      const ra = this.roofAlpha * (s < 0.02 ? 1 : 0);
      this.roof.group.position.y = this.floors.length * P;
      this.roof.group.visible = ra > 0.01;
      fade(this.roof.materials, ra);
    }
    if (this.site) {
      const sa = Math.max(0, 1 - s * 1.6), ta = sa * this.roofAlpha;
      this.site.group.visible = sa > 0.01;
      fade(this.site.materials, sa);
      // 층을 고르면 가로수가 시야를 가리지 않게 같이 걷어 낸다
      this.site.trees.visible = ta > 0.01;
      fade(this.site.treeMaterials, ta);
    }
    if (this.guides && this.floors.length) {
      const top = (this.floors.length - 1) * P + 0.2;
      for (const l of this.guides) {
        const a = l.geometry.attributes.position;
        a.setY(1, top);
        a.needsUpdate = true;
        l.computeLineDistances();
        l.visible = s > 0.05 && this.floors.length > 1 && this.focus === null;
        l.material.opacity = 0.55 * s;
      }
    }
    this.placeLight();
    this.render();
  }

  exterior() { return this.facades && this.spread < 0.5; }
  bounds(i = null) {
    const { w, d } = this.size || { w: 24, d: 15 };
    const P = this.pitch();
    if (i === null) {
      if (this.exterior()) {
        const top = this.floors.length * P + (this.title ? 2.7 : 1.1);
        return { min: new Vector3(-1.6, -0.55, -1.6), max: new Vector3(w + 2.6, top, d + 3.2) };
      }
      return { min: new Vector3(-0.35, -0.5, -0.35), max: new Vector3(w + 0.35, (this.floors.length - 1) * P + ROOM_H, d + 0.35) };
    }
    const f = this.floors[i];
    const ox = f ? f.ox : 0, oz = f ? f.oz : 0, fw = f ? f.tpl.w : w, fd = f ? f.tpl.d : d;
    return { min: new Vector3(ox, i * P - 0.45, oz), max: new Vector3(ox + fw, i * P + ROOM_H, oz + fd) };
  }
  center(b) { return new Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2); }

  placeLight() {
    if (!this.floors.length) return;
    const b = this.bounds(), c = this.center(b);
    const F = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, b.max.y - b.min.y) * 1.15;
    this.key.position.set(c.x - F * 0.4, b.max.y + F * 0.9, c.z + F * 0.65);
    this.key.target.position.copy(c);
    Object.assign(this.key.shadow.camera, { left: -F, right: F, top: F, bottom: -F, near: 0.5, far: F * 4 });
    this.key.shadow.camera.updateProjectionMatrix();
  }

  // 목표 시점: 방위 · 고도(도), 대상 영역(i = 층, null = 건물 전체)에 맞춘 카메라
  goal({ azimuth, elevation, i = this.focus, zoom = 1, pad = 1.12 } = {}) {
    const cam = this.camera, ctl = this.controls;
    const off = cam.position.clone().sub(ctl.target);
    const az = azimuth !== undefined ? azimuth * Math.PI / 180 : Math.atan2(off.x, off.z);
    const el = elevation !== undefined ? elevation * Math.PI / 180 : Math.asin(Math.min(1, Math.max(-1, off.y / (off.length() || 1))));
    const b = this.bounds(i), target = this.center(b);
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    // 목표 시점에서 화면 맞춤 크기 계산
    const probe = cam.clone();
    probe.position.copy(target).addScaledVector(dir, 400);
    probe.lookAt(target);
    // 층을 볼 때는 오른쪽 정보 카드 자리를 비워 둔다
    const reserve = i !== null && this.w >= 760 ? Math.min(this.reserveRight || 0, this.w * 0.4) : 0;
    const fit = fitFrustum(probe, b, (this.w - reserve) / this.h, pad);
    if (reserve) target.addScaledVector(new Vector3(Math.cos(az), 0, -Math.sin(az)), reserve * fit / (2 * this.h));
    return { t: target, dir, fit, zoom };
  }
  aim(opts = {}, animate = true) { this.moveCam(this.goal(opts), animate ? 450 : 0); }
  moveCam(to, ms) {
    if (this.camJob) this.camJob.done = true;
    if (!ms) { this.setCam(to.t, to.dir, to.fit, to.zoom); return; }
    const cam = this.camera, ctl = this.controls;
    const from = { t: ctl.target.clone(), dir: cam.position.clone().sub(ctl.target).normalize(), fit: this.fit, zoom: cam.zoom };
    this.camJob = this.animate(ms, (k) => {
      const e = ease(k);
      this.setCam(from.t.clone().lerp(to.t, e), from.dir.clone().lerp(to.dir, e).normalize(), from.fit + (to.fit - from.fit) * e, from.zoom + (to.zoom - from.zoom) * e);
    });
  }
  setCam(target, dir, fit, zoom, dist = 400) {
    this.controls.target.copy(target);
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.zoom = zoom;
    this.fit = fit;
    this.camera.lookAt(target);
    this.applyFrustum();
    this.controls.update();
    this.render();
  }

  animate(ms, step) {
    const t0 = performance.now();
    const job = { done: false };
    this.anims.add(job);
    const tick = () => {
      if (this.dead || job.done) return;
      const k = Math.min(1, (performance.now() - t0) / ms);
      step(k);
      if (k < 1) requestAnimationFrame(tick); else { job.done = true; this.anims.delete(job); }
    };
    requestAnimationFrame(tick);
    return job;
  }

  // on = 펼쳐 보기, off = 외관 보기 — 도착 시점을 먼저 계산해 층이 벌어지는 동안 카메라도 같이 움직인다
  setSpread(on, animate = true) {
    const to = on ? 1 : 0, from = this.spread;
    if (this.spreadJob) this.spreadJob.done = true;
    this.spread = to;
    const goal = this.goal({ elevation: on ? 30 : 22 });
    this.spread = from;
    if (!animate) { this.spread = to; this.layout(); this.moveCam(goal, 0); return; }
    this.moveCam(goal, 600);
    this.spreadJob = this.animate(600, (k) => {
      this.spread = from + (to - from) * k;
      this.layout();
    });
  }

  setFocus(i, animate = true) {
    this.focus = i === null || i === undefined || !this.floors[i] ? null : i;
    // 위층은 걷어 내고, 고른 층은 앞쪽 외벽을 걷어 안을 보인다. 펼쳐 보기에선 아래층을 흐리게
    const ext = this.spread < 0.5;
    const targets = this.floors.map((f, k) => (this.focus === null || k === this.focus ? 1 : k > this.focus ? 0 : ext ? 1 : 0.1));
    const froms = this.floors.map((f) => f.alpha);
    const rTo = this.focus === null ? 1 : 0, rFrom = this.roofAlpha;
    if (this.focusJob) this.focusJob.done = true;
    if (!animate) {
      this.floors.forEach((f, k) => (f.alpha = targets[k]));
      this.roofAlpha = rTo;
      this.layout(); this.aim({ i: this.focus }, false);
      return;
    }
    this.focusJob = this.animate(420, (k) => {
      const e = ease(k);
      this.floors.forEach((f, n) => (f.alpha = froms[n] + (targets[n] - froms[n]) * e));
      this.roofAlpha = rFrom + (rTo - rFrom) * e;
      this.layout();
    });
    this.aim({ i: this.focus }, true);
  }

  resetView(animate = true) {
    this.aim({ azimuth: 40, elevation: this.spread > 0.5 ? 30 : 22, i: this.focus }, animate);
  }
  rotate(deg) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const az = Math.atan2(off.x, off.z) * 180 / Math.PI + deg;
    this.aim({ azimuth: az, i: this.focus }, true);
  }
  cameraState() {
    const off = this.camera.position.clone().sub(this.controls.target);
    return { azimuth: Math.round(Math.atan2(off.x, off.z) * 1800 / Math.PI) / 10, elevation: Math.round(Math.asin(off.y / off.length()) * 1800 / Math.PI) / 10, zoom: Math.round(this.camera.zoom * 100) / 100 };
  }

  // 화면 좌표 — 층 이름표(가장 왼쪽 모서리) · 초점 층의 공간 이름표
  project(x, y, z) {
    _v.set(x, y, z).project(this.camera);
    return { x: (_v.x + 1) / 2 * this.w, y: (1 - _v.y) / 2 * this.h, visible: _v.z >= -1 && _v.z <= 1 };
  }
  anchors() {
    const P = this.pitch(), ext = this.exterior();
    const floors = this.floors.map((f, i) => {
      // 외관 보기에선 층 가운데 높이에, 펼쳐 보기에선 바닥판 높이에
      const y = i * P + (ext ? 1.6 : 0);
      const pts = [[-0.35, -0.35], [f.tpl.w + 0.35, -0.35], [-0.35, f.tpl.d + 0.35], [f.tpl.w + 0.35, f.tpl.d + 0.35]].map(([x, z]) => this.project(f.ox + x, y, f.oz + z));
      const left = pts.reduce((a, b) => (b.x < a.x ? b : a));
      return { i, x: left.x, y: left.y, alpha: f.alpha };
    });
    let rooms = [];
    if (this.focus !== null && this.floors[this.focus]) {
      const f = this.floors[this.focus], y = this.focus * P;
      rooms = f.tpl.rooms.map((r, k) => ({ k, name: r[1], ...this.project(f.ox + r[3] + r[5] / 2, y + 0.1, f.oz + r[4] + r[6] / 2) }));
    }
    return { floors, rooms };
  }

  // 이미지로 — 저장 · 썸네일용
  async snapshot({ w = 1600, h = 1000, type = 'image/png', quality, background = null } = {}) {
    const R = this.renderer, keep = { w: this.w, h: this.h, pr: R.getPixelRatio() };
    const bg = this.scene.background;
    if (background) this.scene.background = new Color(background);
    this.w = w; this.h = h;
    R.setPixelRatio(1);
    R.setSize(w, h, false);
    this.applyFrustum();
    this.renderNow();
    const blob = await new Promise((res) => R.domElement.toBlob(res, type, quality));
    this.scene.background = bg;
    this.w = keep.w; this.h = keep.h;
    R.setPixelRatio(keep.pr);
    R.setSize(keep.w, keep.h, false);
    this.applyFrustum();
    this.render();
    return blob;
  }

  dispose() {
    this.dead = true;
    clearTimeout(this._hoverT);
    this.dropFrame();
    for (const j of this.anims) j.done = true;
    this.ro.disconnect();
    for (const f of this.floors) this.disposeFloor(f);
    this.floors = [];
    this.disposeShell();
    this.buildSite();
    this.controls.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this._down);
    this.renderer.domElement.removeEventListener('pointerup', this._up);
    this.renderer.domElement.removeEventListener('pointermove', this._move);
    this.renderer.domElement.removeEventListener('pointerleave', this._leave);
    this.renderer.dispose();
    this.renderer.forceContextLoss && this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

// ---------- 썸네일 (화면 밖에서 한 장씩) ----------
// single: 공간 조감도 한 장(외벽 없이 위에서), 아니면 건물(기본 외관). floors: id 또는 { tpl, fv }
// wanted: 차례가 왔을 때 아직 필요한지 — 아니면 그리지 않고 'skip'으로 끝낸다(고르기 창을 닫은 뒤 남은 줄)
let thumbStage = null, thumbHost = null, thumbQueue = Promise.resolve();
export function thumbnail({ floors, spread = 0, w = 640, h = 410, single = false, title = '', type = 'image/png', quality, wanted = null }) {
  const job = thumbQueue.then(async () => {
    if (wanted && !wanted()) throw Object.assign(new Error('skip'), { skip: true });
    if (!thumbStage) {
      thumbHost = document.createElement('div');
      thumbHost.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px;pointer-events:none;opacity:0`;
      thumbHost.setAttribute('aria-hidden', 'true');
      document.body.appendChild(thumbHost);
      thumbStage = new Stage(thumbHost, {});
    }
    const S = thumbStage;
    thumbHost.style.width = w + 'px'; thumbHost.style.height = h + 'px';
    S.w = w; S.h = h;
    S.renderer.setSize(w, h, false);
    S.spread = single ? 1 : spread;
    S.focus = null;
    S.roofAlpha = 1;
    S.setFloors(floors, { title, facades: !single });
    // 그림자 판은 그리지 않아 밝은 · 어두운 화면 어디에 놓여도 어울리게
    if (S.ground) S.ground.visible = false;
    S.aim({ azimuth: 40, elevation: single ? 48 : S.spread > 0.5 ? 30 : 22, i: null, pad: single ? 1.02 : 1.0 }, false);
    return S.snapshot({ w, h, type, quality });
  });
  thumbQueue = job.catch(() => {});
  return job;
}
export function disposeThumbs() {
  if (thumbStage) { thumbStage.dispose(); thumbHost.remove(); thumbStage = null; thumbHost = null; }
}
