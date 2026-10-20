import { fetchResource } from '../api/client.js';

export const DEFAULT_BACKGROUND_EFFECTS = { opacity: 100, blur: 0, overlayColor: '#ffffff', overlayOpacity: 0, dots: 0, dotSize: 12 };
const bounded = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
export function normalizeBackgroundEffects(value = {}) {
  if (!value || typeof value !== 'object') value = {};
  return {
    opacity: bounded(value.opacity, 0, 100, 100), blur: bounded(value.blur, 0, 30, 0),
    overlayColor: /^#[\da-f]{6}$/i.test(value.overlayColor || '') ? value.overlayColor : '#ffffff',
    overlayOpacity: bounded(value.overlayOpacity, 0, 100, 0), dots: bounded(value.dots, 0, 100, 0),
    dotSize: Math.round(bounded(value.dotSize, 4, 32, 12)),
  };
}

export function readBackgroundEffects(root) {
  try {
    const saved = root?.getAttribute('data-bg-effects');
    if (saved) return normalizeBackgroundEffects(JSON.parse(saved));
  } catch { /* Old templates can have no effect settings. */ }
  const strength = Number(root?.getAttribute('data-bg-strength') ?? 100);
  const rgb = (root?.getAttribute('data-bg-tint-color') || '255,255,255').split(',').map(Number);
  const color = '#' + rgb.slice(0, 3).map(v => Math.round(Math.min(255, Math.max(0, v || 0))).toString(16).padStart(2, '0')).join('');
  return normalizeBackgroundEffects({ overlayColor: color, overlayOpacity: 100 - strength });
}

export const hasBackgroundEffects = value => {
  const effect = normalizeBackgroundEffects(value);
  return effect.opacity !== 100 || effect.blur > 0 || effect.overlayOpacity > 0 || effect.dots > 0;
};

const decoded = new Map();
async function imageOf(src) {
  if (!decoded.has(src)) {
    const pending = (async () => {
      const response = await fetchResource(src);
      if (!response.ok) throw new Error('배경 사진을 읽지 못했어요.');
      return createImageBitmap(await response.blob());
    })().catch(error => { decoded.delete(src); throw error; });
    decoded.set(src, pending);
    if (decoded.size > 12) decoded.delete(decoded.keys().next().value);
  }
  return decoded.get(src);
}

function canvasOf(width, height) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  return canvas;
}

// Separable blur keeps the control functional on browsers without Canvas 2D filters.
function softwareBlur(ctx, width, height, radius) {
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = Float32Array.from(image.data), temp = new Float32Array(pixels.length);
  const r = Math.max(1, Math.round(radius)), count = r * 2 + 1;
  const pass = (input, output, horizontal) => {
    const length = horizontal ? width : height, lines = horizontal ? height : width;
    const step = horizontal ? 4 : width * 4, stride = horizontal ? width * 4 : 4;
    for (let line = 0; line < lines; line++) {
      const base = line * stride, sums = [0, 0, 0, 0];
      for (let i = -r; i <= r; i++) {
        const at = base + Math.max(0, Math.min(length - 1, i)) * step;
        for (let c = 0; c < 4; c++) sums[c] += input[at + c];
      }
      for (let i = 0; i < length; i++) {
        const at = base + i * step, add = base + Math.min(length - 1, i + r + 1) * step, remove = base + Math.max(0, i - r) * step;
        for (let c = 0; c < 4; c++) { output[at + c] = sums[c] / count; sums[c] += input[add + c] - input[remove + c]; }
      }
    }
  };
  for (let i = 0; i < 3; i++) { pass(pixels, temp, true); pass(temp, pixels, false); }
  image.data.set(pixels); ctx.putImageData(image, 0, 0);
}

/** One renderer supplies the editor preview and native PPTX background. Foreground stays editable. */
export async function renderBackgroundCanvas(src, settings = {}, { color = '#ffffff', width = 1280, height = 720 } = {}) {
  const effect = normalizeBackgroundEffects(settings), bitmap = await imageOf(src);
  const photo = canvasOf(width, height), image = photo.getContext('2d', { willReadFrequently: effect.dots > 0 });
  const nativeBlur = typeof image.filter === 'string';
  image.fillStyle = '#ffffff'; image.fillRect(0, 0, width, height); image.fillStyle = color; image.fillRect(0, 0, width, height);
  const padding = nativeBlur ? Math.ceil(effect.blur * 2) : 0;
  const scale = Math.max((width + padding * 2) / bitmap.width, (height + padding * 2) / bitmap.height);
  if (nativeBlur) image.filter = effect.blur ? `blur(${effect.blur}px)` : 'none';
  image.drawImage(bitmap, (width - bitmap.width * scale) / 2, (height - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
  if (nativeBlur) image.filter = 'none';
  else if (effect.blur > 0) softwareBlur(image, width, height, effect.blur);
  if (effect.dots > 0) {
    const dots = canvasOf(width, height), dot = dots.getContext('2d');
    dot.fillStyle = '#ffffff'; dot.fillRect(0, 0, width, height);
    dot.fillStyle = color; dot.fillRect(0, 0, width, height);
    const pixels = image.getImageData(0, 0, width, height).data;
    const size = effect.dotSize;
    for (let y = size / 2; y < height; y += size) for (let x = size / 2; x < width; x += size) {
      const offset = (Math.floor(y) * width + Math.floor(x)) * 4;
      const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      const luminance = (.2126 * r + .7152 * g + .0722 * b) / 255;
      dot.fillStyle = `rgb(${r},${g},${b})`; dot.beginPath();
      dot.arc(x, y, size * .46 * (.25 + .75 * Math.sqrt(Math.max(0, 1 - luminance))), 0, Math.PI * 2); dot.fill();
    }
    image.globalAlpha = effect.dots / 100; image.drawImage(dots, 0, 0); image.globalAlpha = 1;
  }
  const canvas = canvasOf(width, height), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = effect.opacity / 100; ctx.drawImage(photo, 0, 0); ctx.globalAlpha = 1;
  if (effect.overlayOpacity > 0) {
    ctx.globalAlpha = effect.overlayOpacity / 100; ctx.fillStyle = effect.overlayColor;
    ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1;
  }
  return canvas;
}

export function createBackgroundPreviewSession() { return { generation: 0, urls: new Set() }; }
export function disposeBackgroundPreviews(session) {
  session.generation++;
  for (const url of session.urls) URL.revokeObjectURL(url);
  session.urls.clear();
}
export async function renderBackgroundPreview(root, session) {
  const src = root?.getAttribute('data-bg');
  if (!src) return;
  const generation = ++session.generation;
  const effect = readBackgroundEffects(root), signature = JSON.stringify(effect);
  root.setAttribute('data-bg-effects', signature);
  root.setAttribute('data-bg-strength', String(effect.opacity));
  // Fold old editable tint shapes into these settings exactly once.
  root.querySelectorAll('[data-bg-tint]').forEach(el => el.remove());
  const current = () => generation === session.generation && root.isConnected && root.getAttribute('data-bg') === src && JSON.stringify(readBackgroundEffects(root)) === signature;
  if (!hasBackgroundEffects(effect)) {
    root.style.backgroundImage = `url("${src}")`; root.removeAttribute('data-bg-rendered'); root.setAttribute('data-bg-rendered-effects', signature); return;
  }
  const canvas = await renderBackgroundCanvas(src, effect, { color: getComputedStyle(root).backgroundColor });
  if (!current()) return;
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .94));
  if (!current() || !blob) return;
  const url = URL.createObjectURL(blob); session.urls.add(url);
  root.style.backgroundImage = `url("${url}")`; root.setAttribute('data-bg-rendered', url);
  root.setAttribute('data-bg-rendered-effects', signature);
  while (session.urls.size > 48) { const old = session.urls.values().next().value; session.urls.delete(old); URL.revokeObjectURL(old); }
}
