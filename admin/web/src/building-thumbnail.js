import packed from '../../../app/web/src/building/bake.b64';
import { ready } from '../../../app/web/src/building/data.js';
import { thumbnail } from '../../../app/web/src/building/render.js';

const cache = new Map();
export async function renderBuildingThumbnail(thumb, visible) {
  if (cache.has(thumb.key)) return cache.get(thumb.key);
  await ready(packed);
  if (!visible()) return null;
  const res = await fetch('/api/spatial/building-templates/' + encodeURIComponent(thumb.template));
  if (!res.ok) throw new Error('건물 템플릿을 불러오지 못했습니다.');
  const {scene} = await res.json();
  const floors = scene.floors.map(f => ({...f.shell, tpl: f.tpl, fv: f.fv, name: f.name}));
  const blob = await thumbnail({floors, title: scene.title, camera: scene.camera, spread: Number(scene.view.mode === 'spread'),
    w: 480, h: 308, type: 'image/webp', wanted: visible});
  const image = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob);
  });
  cache.set(thumb.key, image);
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  return image;
}
