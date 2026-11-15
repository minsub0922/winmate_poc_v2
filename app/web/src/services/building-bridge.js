// 건물 조감도 모듈(src/building — 아티팩트와 같은 소스를 IIFE로 묶은 독립 모듈)과 앱 사이의 좁은 접점.
//   · 모듈을 한 번 싣는다(BuildingPage · 통합 조감도 목록 · 시작 팝업이 함께 쓴다)
//   · 통합 목록: 건물 히스토리 읽기 · 썸네일 · 삭제 · 변경 알림
import css from '../building/style.css?raw';

let loading = null;
export function ensureBuildingCss() {
  if (document.getElementById('wm-bld-css')) return;
  const style = document.createElement('style');
  style.id = 'wm-bld-css';
  style.textContent = css.trim();
  document.head.append(style);
}
/** 모듈 { mount, app, data, ready, thumbnail, … } — 처음 부를 때 페이지에 데이터 · 스크립트 요소를 넣고 한 번 실행한다 */
export function loadBuildingModule() {
  loading ||= Promise.all([import('virtual:wm-building'), import('../building/bake.b64?raw')]).then(([js, data]) => {
    if (!document.getElementById('wm-bld-data')) {
      const el = document.createElement('script');
      el.id = 'wm-bld-data';
      el.type = 'text/plain';
      el.setAttribute('data-enc', 'gzip-base64');
      el.textContent = data.default.trim();
      document.body.append(el);
    }
    if (!window.__wmBldBoot) {
      const el = document.createElement('script');
      el.id = 'wm-bld-js';
      el.textContent = 'window.__wmBldBoot=function(){' + js.default + ';return __wmBldMod};';
      document.body.append(el);
    }
    return window.__wmBldMod_ || (window.__wmBldMod_ = window.__wmBldBoot());
  });
  loading.catch(() => { loading = null; });
  return loading;
}
export const buildingModuleLoaded = () => !!window.__wmBldMod_;

/** 건물 히스토리 — [{ id, title, example, updatedAt, floors, rooms, products, area, industries }] */
export async function listBuildings() { return (await loadBuildingModule()).app.list(); }
export async function removeBuilding(id) { return (await loadBuildingModule()).app.remove(id); }
/** 건물 기록이 바뀌면(저장 · 삭제 · 계정 동기화) fn을 부른다. 돌려준 함수로 끊는다. */
export function onBuildingsChange(fn) {
  let off = () => {}, dead = false;
  loadBuildingModule().then((m) => { if (!dead) off = m.app.onChange(fn); }).catch(() => {});
  return () => { dead = true; off(); };
}
const thumbs = new Map(); // id → { stamp, url }
/** 카드 썸네일 주소(object URL). 건물이 바뀌면(stamp) 새로 만든다. */
export async function buildingThumbUrl(id, stamp) {
  const cached = thumbs.get(id);
  if (cached && cached.stamp === stamp) return cached.url;
  const blob = await (await loadBuildingModule()).app.thumb(id);
  if (!blob) return null;
  const current = thumbs.get(id);
  if (current && current.stamp === stamp) return current.url;
  if (current) URL.revokeObjectURL(current.url);
  const url = URL.createObjectURL(blob);
  thumbs.set(id, { stamp, url });
  return url;
}

// ---------- 시작 팝업 · 내 조감도를 층으로 ----------
import { bakeSceneFloor } from '../domain/building/floor-bake.js';
/** 공간 조감도 장면 → 건물의 층 묶음(domain/building/floor-bake.js) */
export async function bakeSpaceFloor(scene, library, meta) { return bakeSceneFloor(scene, library, meta); }
/** 건물을 만들고 id를 돌려준다 — { blank:true } 빈 건물 · { title, floors:[{ name, pack }], vertical? } 내 공간을 층으로 */
export async function createBuilding(options) { return (await loadBuildingModule()).app.create(options); }
/** 건물 모듈의 건물 템플릿 고르기 창을 열고, 고르면 만든 건물 id(닫으면 null) */
export async function pickBuildingPreset() { ensureBuildingCss(); return (await loadBuildingModule()).app.pickPreset(); }

// ---------- 내 조감도 → 건물의 층 ----------
// 건물 모듈의 층 고르기 창 「내 조감도」 묶음이 부른다(building/ui.js). 고른 조감도는 그 순간의 사본으로 건물에 들어간다.
import { loadSpatialHistory, getSpatialHistory, loadSpatialLibrary } from './spatial.js';
import { planSvg, svgData } from '../domain/spatial/plan-svg.js';
window.__wmBldSpaceHook = {
  /** 내 공간 조감도(장면이 있는 것, 최근 48개) */
  async list() {
    const [data, library] = await Promise.all([loadSpatialHistory({ page: 1, pageSize: 48 }), loadSpatialLibrary()]);
    // 서버 썸네일이 없으면 평면도로 대신 보여 준다
    const plan = (scene) => { try { return svgData(planSvg(scene, library, { width: 520, height: 334, productPins: false, labels: false, dimensions: false })); } catch { return null; } };
    return data.items.filter((item) => item.preview).map((item) => ({ id: item.id, title: item.title, rooms: item.rooms || item.preview.rooms.length, image: item.thumbnail || plan(item.preview) }));
  },
  /** 조감도 하나를 층 묶음으로 — 저장된 자산 버전의 라이브러리로 바꾼다 */
  async bake(id) {
    const record = await getSpatialHistory(id);
    if (!record || !record.scene) throw new Error('이 조감도에는 아직 배치된 공간이 없어요.');
    const library = await loadSpatialLibrary(), revision = record.scene.assetRevision;
    const frozen = revision && revision !== library.sourceHash ? await loadSpatialLibrary(revision) : library;
    return bakeSceneFloor(record.scene, frozen, { id: 'my:' + id + ':' + Date.now().toString(36), name: record.title });
  },
};
