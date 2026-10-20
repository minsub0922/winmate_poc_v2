import { bgUrl, loadBg } from './packs.js';

const active = new Map();
const TIMEOUT = 30000;
const PACKED = /\.json#\d+$/;

/** One lifecycle for React pictures and static @-tag HTML. No illustration fallback. */
export function manageImage(image) {
  const holder = image?.parentElement;
  if (!holder?.classList.contains('image-state')) return () => {};
  const source = image.getAttribute('data-image-source') || '';
  const previous = active.get(image);
  if (previous?.source === source) return previous.dispose;
  previous?.dispose();
  let live = true, timer, observer;
  const current = () => live && image.getAttribute('data-image-source') === source;
  const set = state => {
    if (!current()) return;
    holder.dataset.imageState = state;
    holder.setAttribute('aria-busy', String(state === 'loading'));
    if (state === 'error') holder.title = '이미지 로드 오류'; else holder.removeAttribute('title');
    if (state !== 'loading') { clearTimeout(timer); observer?.disconnect(); }
  };
  const fail = () => set('error');
  const loaded = async () => {
    if (!current() || !image.complete) return;
    if (!image.naturalWidth || !image.naturalHeight) { fail(); return; }
    // Decode the real pixels before replacing the shimmer, including cached pictures.
    if (image.decode) {
      try { await image.decode(); } catch { if (!image.naturalWidth) { fail(); return; } }
    }
    if (current()) set('loaded');
  };
  const dispose = () => {
    live = false; clearTimeout(timer); observer?.disconnect();
    image.removeEventListener('load', loaded); image.removeEventListener('error', fail);
    if (active.get(image)?.dispose === dispose) active.delete(image);
  };
  active.set(image, { source, dispose });
  set('loading');
  image.addEventListener('load', loaded); image.addEventListener('error', fail);
  if (!source) { fail(); return dispose; }
  const start = async () => {
    if (!current()) return;
    timer = setTimeout(fail, TIMEOUT);
    try {
      const url = bgUrl(source) || await loadBg(source);
      if (!current()) return;
      if (!url) { fail(); return; }
      if (image.getAttribute('src') !== url) image.setAttribute('src', url);
      if (image.complete) loaded();
    } catch { fail(); }
  };
  if (image.loading === 'lazy' && typeof IntersectionObserver !== 'undefined' && holder.isConnected) {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); start(); }
    }, { rootMargin: '240px' });
    observer.observe(holder);
  } else start();
  return dispose;
}

/** Static contentEditable/link chips are not hydrated by React, so observe their image markers. */
export function startImageStates(root = document.body) {
  const find = node => node?.nodeType === 1 ? [
    ...(node.matches('img[data-image-source]') ? [node] : []), ...node.querySelectorAll('img[data-image-source]'),
  ] : [];
  find(root).forEach(manageImage);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') { if (record.target.isConnected) manageImage(record.target); continue; }
      for (const node of record.removedNodes) if (!node.isConnected) find(node).forEach(image => active.get(image)?.dispose());
      for (const node of record.addedNodes) if (node.isConnected) find(node).forEach(manageImage);
    }
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-image-source'] });
  return () => { observer.disconnect(); for (const state of [...active.values()]) state.dispose(); };
}

export const packedImage = source => PACKED.test(source || '');

export const IMAGE_ERROR_PATH = 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M3 17l5-5 4 4 3-3 6 6 M3 3l18 18';
const attribute = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** Same loading/error shell for URL-preview chips inserted as plain HTML. */
export function imageMarkup(source, { alt = '', className = '' } = {}) {
  const src = attribute(source), name = attribute(alt);
  return `<span class="image-state compact ${attribute(className)}" data-image-state="loading" aria-busy="true"><img data-image-source="${src}" ${packedImage(source) || !source ? '' : `src="${src}"`} alt="${name}" loading="lazy" referrerpolicy="no-referrer"><span class="image-state-shimmer" aria-hidden="true"></span><span class="image-state-error" role="img" aria-label="이미지 로드 오류"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${IMAGE_ERROR_PATH}"></path></svg><span>이미지 로드 오류</span></span></span>`;
}
