// Headless entry of the server-side 3D 조감도 preview renderer (app/scripts/spatial_render_worker.mjs).
// It uses the editor's own render-three.js, so a server preview has the same geometry, lights and camera as the studio.
// The worker serves /__spatial/library/<revision>.json and the static assets from disk; nothing here calls the app API.
import { createSpatialRenderer } from '../domain/spatial/render-three.js';
import { computeSpatial } from '../domain/spatial/compute.js';
import { setRenderData } from '../building/data.js';
import { thumbnail, disposeThumbs } from '../building/render.js';

const libraries = new Map();
function library(revision) {
  if (!/^[a-f0-9]{8}$/.test(revision || '')) return Promise.reject(new Error('invalid library revision'));
  if (!libraries.has(revision)) {
    libraries.set(revision, fetch('/__spatial/library/' + revision + '.json').then(response => {
      if (!response.ok) throw new Error('library ' + revision + ' unavailable (' + response.status + ')');
      return response.json().then(value => { if(value.sourceHash !== revision)throw new Error('오브젝트 버전이 일치하지 않습니다.');return value; });
    }).catch(error => { libraries.delete(revision); throw error; }));
  }
  return libraries.get(revision);
}

window.__winmateSpatialCompute = async ({ revision, input }) => computeSpatial(input, await library(revision));
window.__winmateBuildingSnapshot = async ({ input }) => {
  setRenderData(input.data);
  await Promise.all([...document.fonts].filter(font=>font.family.includes('Noto Sans KR')).map(font=>font.load()));
  try {
    const blob=await thumbnail(input.options);
    const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
    return {image};
  } finally { disposeThumbs(); }
};

window.__winmateSpatialSnapshot = async ({ scene, revision, options = {} }) => {
  const lib = await library(revision);
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:1600px;height:1025px';
  document.body.appendChild(host);
  let renderer;
  try {
    renderer = createSpatialRenderer(host, { pixelRatio: 1 });
    renderer.setScene(scene, lib);
    if (options.camera) renderer.setCameraState(options.camera);
    await renderer.ready();
    const snapshot = renderer.snapshot({ ...options, pixelRatio: options.pixelRatio || 1 });
    if (options.preview) snapshot.preview = renderer.snapshot({ w: 480, h: 308, type: 'image/jpeg', quality: .82, pixelRatio: 1 }).image;
    return snapshot;
  } finally {
    renderer?.dispose();
    host.remove();
  }
};
window.__winmateSpatialPreview = async ({ scene, revision, width = 1600, height = 1025 }) =>
  (await window.__winmateSpatialSnapshot({ scene, revision, options: { w: width, h: height } })).image;
window.__winmateSpatialReady = true;
