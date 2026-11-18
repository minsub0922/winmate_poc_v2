// 조감도 시트를 3D로 돌려 볼 장면을 찾는다 (components/birdseye-live.jsx).
//   1) 시트가 가진 사본(ov.spatial · 3D)  2) 제안서 조감도 히스토리(ov.img[0].birdseye)  3) 표준 제안서 조감도 장면 파일
import { fetchResource } from '../api/client.js';
import { standardSceneUrl } from '../domain/spatial/birdseye-sheet.js';
import { getSpatialHistory, loadSpatialLibrary } from './spatial.js';

/** 이 시트에 3D 장면이 있을 수 있는지 (불러오기 전에 버튼 · 안내를 정할 때) */
export function birdseyeSceneKey(ov, historyId) {
  if (ov?.spatial?.version === 1) return ov.spatial.view === '3d' ? 'own' : null;
  const id = ov?.img?.[0]?.birdseye || historyId;
  if (id) return 'history:' + id;
  const url = standardSceneUrl(ov);
  return url ? 'standard:' + url : null;
}

export async function loadBirdseyeScene(ov, historyId) {
  const key = birdseyeSceneKey(ov, historyId);
  if (!key) return null;
  if (key === 'own') return { scene: ov.spatial.scene, library: ov.spatial.library, camera: ov.spatial.camera || null, roomIds: ov.spatial.roomIds };
  if (key.startsWith('history:')) {
    const record = await getSpatialHistory(key.slice(8));
    if (!record?.scene) throw new Error('조감도 장면을 찾지 못했어요.');
    const library = await loadSpatialLibrary(record.scene.assetRevision);
    return { scene: record.scene, library, camera: null };
  }
  const response = await fetchResource(key.slice(9));
  if (!response.ok) throw new Error('표준 조감도 장면을 불러오지 못했어요.');
  const scene = await response.json(), library = await loadSpatialLibrary(scene.assetRevision);
  return { scene, library, camera: null };
}
