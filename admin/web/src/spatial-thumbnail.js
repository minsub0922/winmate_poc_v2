import { captureSpatialLocal } from '../../../app/web/src/services/spatial-capture.js';

const libraries = new Map(), images = new Map();
let queue = Promise.resolve();
async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('조감도를 불러오지 못했습니다.');
  return response.json();
}
export function renderThumbnail(thumb, visible) {
  if (images.has(thumb.key)) return Promise.resolve(images.get(thumb.key));
  const task = queue.then(async () => {
    if (!visible()) return null;
    if (images.has(thumb.key)) return images.get(thumb.key);
    const {scene} = await json('/api/spatial/templates/' + encodeURIComponent(thumb.template) + '?managed=1');
    const rev = scene.assetRevision;
    if (!libraries.has(rev)) libraries.set(rev, json('/api/spatial/library/' + rev).catch(e => { libraries.delete(rev); throw e; }));
    const library = await libraries.get(rev);
    if (!visible()) return null;
    const {image} = await captureSpatialLocal(scene, library, { w: 480, h: 308, type: 'image/webp' });
    images.set(thumb.key, image);
    if (images.size > 80) images.delete(images.keys().next().value);
    return image;
  });
  queue = task.catch(() => {});
  return task;
}
