import { readBackgroundEffects, normalizeBackgroundEffects } from './background-effects.js';
/** Background originals and adjustable effects are stored separately from foreground content. */
function fullSlide(root, el) {
  const rect = root.getBoundingClientRect(), r = el.getBoundingClientRect();
  return rect.width > 0 && r.width >= rect.width * .98 && r.height >= rect.height * .98
    && Math.abs(r.left - rect.left) < 3 && Math.abs(r.top - rect.top) < 3;
}

export function clearLayoutBackground(root) {
  root.querySelectorAll('img').forEach(el => {
    if (!fullSlide(root, el)) return;
    const slot = el.closest('[data-img]');
    if (slot && slot !== root && fullSlide(root, slot) && !slot.querySelector('[data-tb]')) slot.remove(); else el.remove();
  });
  for (const el of root.querySelectorAll('div')) {
    if (fullSlide(root, el) && getComputedStyle(el).backgroundImage === 'none') el.style.backgroundColor = 'transparent';
  }
  root.style.backgroundImage = 'none';
  for (const attr of ['data-bg', 'data-bg-wait', 'data-bg-source', 'data-bg-id', 'data-bg-name', 'data-bg-strength', 'data-bg-tint-color', 'data-bg-effects', 'data-bg-rendered', 'data-bg-rendered-effects']) root.removeAttribute(attr);
  root.querySelectorAll('[data-bg-fill],[data-bg-tint]').forEach(el => el.remove());
}

export function backgroundState(root) {
  if (!root) return { src: '', hasPhoto: false, strength: 100 };
  const cover = [...root.querySelectorAll('img')].find(el => fullSlide(root, el));
  const src = root.getAttribute('data-bg') || /url\(["']?([^"')]+)["']?\)/.exec(root.style.backgroundImage)?.[1] || cover?.src || '';
  const effects = readBackgroundEffects(root);
  return { src, preview: root.getAttribute('data-bg-rendered') || src, effects, hasPhoto: !!src || !!root.querySelector('[data-bg-fill]'), native: !!root.getAttribute('data-bg'), source: root.getAttribute('data-bg-source') || '', id: root.getAttribute('data-bg-id') || '', name: root.getAttribute('data-bg-name') || '현재 배경 사진', strength: root.hasAttribute('data-bg-effects') ? effects.opacity : Number(root.getAttribute('data-bg-strength') || 100) };
}

export function setBackgroundStrength(root, strength) {
  setBackgroundEffects(root, { opacity: strength });
}

export function setBackgroundEffects(root, patch) {
  const effects = normalizeBackgroundEffects({ ...readBackgroundEffects(root), ...patch });
  root.setAttribute('data-bg-effects', JSON.stringify(effects));
  root.setAttribute('data-bg-strength', String(effects.opacity));
  root.querySelectorAll('[data-bg-tint]').forEach(el => el.remove());
}

export function setLayoutBackground(root, src, image, strength) {
  // Imported background fills and full-bleed cover photos otherwise hide a newly selected background.
  const rgb = getComputedStyle(root).backgroundColor.match(/[\d.]+/g)?.map(Number) || [255, 255, 255];
  const dark = (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) < 100 && (rgb[3] ?? 1) > 0;
  const effects = root.hasAttribute('data-bg-effects') || root.hasAttribute('data-bg') ? readBackgroundEffects(root) : normalizeBackgroundEffects({ overlayColor: dark ? '#000000' : '#ffffff', overlayOpacity: dark ? 25 : 65 });
  clearLayoutBackground(root);
  root.style.backgroundImage = `url("${src}")`;
  root.style.backgroundSize = 'cover'; root.style.backgroundPosition = 'center'; root.style.backgroundRepeat = 'no-repeat';
  root.setAttribute('data-bg', src);
  root.setAttribute('data-bg-source', image.src);
  root.setAttribute('data-bg-id', image.id || 'upload');
  root.setAttribute('data-bg-name', image.title || '내 배경 사진');
  root.setAttribute('data-bg-tint-color', dark ? '0,0,0' : '255,255,255');
  setBackgroundEffects(root, { ...effects, ...(strength == null ? {} : { opacity: strength }) });
}
