import { LAYOUT_REPEATS } from '../domain/templates/layout-repeats.js';
// A repeat count describes logical units in the current DOM, not product metadata or image count.
export const MAX_REPEAT_COUNT = 16;
const covers = (a, b, margin = 3) => b.x >= a.x - margin && b.y >= a.y - margin && b.x + b.w <= a.x + a.w + margin && b.y + b.h <= a.y + a.h + margin;
const overlaps = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const near = (a, b) => Math.abs(a - b) <= Math.max(5, Math.max(a, b) * .1);
const leaves = el => [...(el.hasAttribute('data-tb') ? [el] : []), ...el.querySelectorAll('[data-tb]')].filter(e => !e.hasAttribute('data-img') && !e.querySelector('[data-tb]') );
function pictures(el) {
  const result = [...(el.matches('[data-img],img') ? [el] : []), ...el.querySelectorAll('[data-img],img')];
  return result.filter((e, i) => result.indexOf(e) === i && !result.some(other => other !== e && other.hasAttribute('data-img') && other.contains(e)));
}
export function repeatPath(el, root) {
  const path = []; for (let e = el; e && e !== root; e = e.parentElement) path.unshift([...e.parentElement.children].indexOf(e));
  return path;
}
export function visibleRepeatCards(root) { return [...root.querySelectorAll('[data-reflow-card]')].filter(el => !el.parentElement.closest('[data-reflow-card]') && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 && getComputedStyle(el).visibility !== 'hidden'); }
export function repeatNode(root, path) { return path.reduce((el, i) => el?.children[i], root); }
function titleFromNodes(nodes) {
  const text = nodes.map(e => ({ text: e.textContent.trim(), size: parseFloat(getComputedStyle(e).fontSize) || 0 })).filter(t => t.text);
  const named = text.filter(t => /[가-힣A-Za-z]{2}/.test(t.text) && !/^\[[^\]]+\]$/.test(t.text));
  return (named.length ? named : text).sort((a, b) => b.size - a.size)[0]?.text.slice(0, 60) || '';
}
function titleOf(el) {
  return titleFromNodes(leaves(el)) || el.getAttribute('data-hint') || el.querySelector('img')?.alt || '이미지';
}

function unitOf(meta, items, root) {
  const edited = root.getAttribute('data-repeat-unit');
  return edited === 'product' || !edited && (meta.p === 'products' && meta.pc > 0 || items.some(x => x.cuts) && (meta.p === 'products' || /제품.?카드/.test(meta.name || ''))) ? 'product' : 'card';
}
export function repeatLabel(meta, unit, items, root) {
  if (root.getAttribute('data-repeat-label')?.trim()) return root.getAttribute('data-repeat-label');
  if (unit === 'product') return '제품';
  if (/단계|일정|로드맵|타임라인/.test(meta.name || '')) return '단계';
  if (/데이터.?카드/.test(meta.name || '') && !items.some(x => x.nI)) return '데이터 카드';
  if (/범례/.test(meta.name || '') && !items.some(x => x.nI)) return '범례 항목';
  if (/과제/.test(meta.name || '')) return '과제';
  if (/조직.?카드/.test(meta.name || '')) return '조직 카드';
  if (/\d+행/.test(meta.name || '')) return '행';
  if (/KPI|지표|숫자/.test(meta.name || '')) return '지표';
  if (meta.p === 'dss') return '공간';
  if (meta.p === 'case') return '사례 카드';
  if (items.some(x => x.nI)) return '사진 카드';
  return meta.p === 'overview' ? '개요 항목' : '항목';
}

function namedCount(meta) {
  const name = meta.name || '', grid = /카드\s*(\d+)\s*[×x]\s*(\d+)/.exec(name);
  if (grid) return Number(grid[1]) * Number(grid[2]);
  const after = /카드\s*(\d+)/.exec(name), before = /(\d+)\s*(?:단계|기둥|행|등급)/.exec(name);
  return Number(after?.[1] || before?.[1] || 0);
}

/** Synchronous, zoom-independent inspection. No network calls and no mutations to a saved slide. */
export function detectLayoutRepeats(root, meta = {}) {
  if (!root?.isConnected) return { status: 'loading', targets: [], primary: null };
  const origin = root.getBoundingClientRect(), scale = origin.width / 1280;
  if (!(scale > 0)) return { status: 'loading', targets: [], primary: null };
  const boxOf = el => { const r = el.getBoundingClientRect(); return { x: +( (r.x - origin.x) / scale).toFixed(2), y: +((r.y - origin.y) / scale).toFixed(2), w: +(r.width / scale).toFixed(2), h: +(r.height / scale).toFixed(2) }; };
  const describe = el => {
    const text = leaves(el), images = pictures(el), box = boxOf(el);
    return { el, box, nT: text.length, nI: images.length, cuts: images.filter(im => im.getAttribute('data-kind') === 'cut' || /^(?:cut\.)/.test(im.getAttribute('data-pid') || im.querySelector('img')?.getAttribute('data-pid') || '')).length,
      path: repeatPath(el, root), textSlots: text.map(e => e.getAttribute('data-tb')), imageSlots: images.filter(e => e.hasAttribute('data-img')).map(e => e.getAttribute('data-img')), label: titleOf(el) };
  };
  const serialize = (items, id, score, originType) => {
    const unit = unitOf(meta, items, root), label = repeatLabel(meta, unit, items, root);
    const ordered = [...items].sort((a, b) => Math.abs(a.box.y - b.box.y) < 16 ? a.box.x - b.box.x : a.box.y - b.box.y);
    const x = Math.min(...ordered.map(i => i.box.x)), y = Math.min(...ordered.map(i => i.box.y));
    return { id, count: ordered.length, unit, label, score, origin: originType, region: { x, y, w: Math.max(...ordered.map(i => i.box.x + i.box.w)) - x, h: Math.max(...ordered.map(i => i.box.y + i.box.h)) - y },
      items: ordered.map(({ el, cuts, ...item }) => item), title: ordered.map(i => i.label).slice(0, 3).join(' · ') };
  };
  const authored = visibleRepeatCards(root);
  if (authored.length) {
    const target = serialize(authored.map(describe), 'reflow', 100, 'authored');
    return { status: 'ready', targets: [target], primary: target };
  }
  const authoredDefinitions = LAYOUT_REPEATS[meta.f];
  if (authoredDefinitions) {
    const targets = authoredDefinitions.flatMap(definition => {
      const items = definition.items.flatMap(item => {
        const textNodes = item.textSlots.map(i => root.querySelector(`[data-tb="${i}"]`)).filter(Boolean), images = item.imageSlots.map(i => root.querySelector(`[data-img="${i}"]`)).filter(Boolean);
        for (const node of textNodes) if (node.hasAttribute('data-img') && !images.includes(node)) images.push(node);
        const elements = [...textNodes, ...images].filter(el => { const b = boxOf(el); return b.w > 0 && b.h > 0 && getComputedStyle(el).visibility !== 'hidden'; }); if (!elements.length) return [];
        const preferred = item.title && root.querySelector(`[data-tb="${item.title}"]`);
        const anchor = elements.includes(preferred) ? preferred : elements[0], boxes = elements.map(boxOf);
        const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
        return [{ path: repeatPath(anchor, root), textSlots: textNodes.filter(n => !n.hasAttribute('data-img')).map(n => n.getAttribute('data-tb')), imageSlots: images.map(n => n.getAttribute('data-img')), nT: textNodes.length, nI: images.length, label: item.title ? anchor.textContent.trim() : titleOf(anchor), box: { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y } }];
      });
      if (!items.length) return [];
      const x = Math.min(...items.map(i => i.box.x)), y = Math.min(...items.map(i => i.box.y));
      return [{ id: 'contract:' + definition.id, origin: 'contract', unit: definition.unit, label: definition.label, count: items.length, items, score: 100,
        region: { x, y, w: Math.max(...items.map(i => i.box.x + i.box.w)) - x, h: Math.max(...items.map(i => i.box.y + i.box.h)) - y }, title: items.map(i => i.label).slice(0, 3).join(' · ') }];
    });
    if (targets.length) return { status: 'ready', targets, primary: targets[0] };
  }
  if (meta.p === 'cover' && /^표지/.test(meta.name || '')) return { status: 'none', targets: [], primary: null };
  const importedCanvas = /^L_MY_/.test(meta.f || '') || root.hasAttribute('data-my');
  const minBodyY = importedCanvas ? 0 : 125, maxBodyY = importedCanvas ? 720 : 660;
  const allText = leaves(root), allPictures = pictures(root);
  const nodes = [...root.querySelectorAll('div,section,article,li,td,[data-img],img')].flatMap(el => {
    const slot = el.closest('[data-img]'); if (slot && slot !== el) return [];
    const b = boxOf(el);
    if (b.y < minBodyY || b.y >= maxBodyY || b.w < 100 || b.h < 48 || b.h > (importedCanvas ? 720 : 530) || b.x < -2 || b.x + b.w > 1282 || b.y + b.h > (importedCanvas ? 722 : 710)) return [];
    const css = getComputedStyle(el); if (css.visibility === 'hidden' || css.display === 'none') return [];
    const item = describe(el);
    if (!item.nT && !item.nI) {
      const background = css.backgroundColor && !['transparent', 'rgba(0, 0, 0, 0)'].includes(css.backgroundColor);
      if (!(parseFloat(css.borderTopWidth) > 0 || background && parseFloat(css.borderRadius) >= 6)) return [];
      const containedText = allText.filter(t => covers(b, boxOf(t))), containedPictures = allPictures.filter(im => covers(b, boxOf(im)));
      if (containedText.length < 2 && !(containedText.length && containedPictures.length)) return [];
      Object.assign(item, { nT: containedText.length, nI: containedPictures.length, cuts: containedPictures.filter(im => im.getAttribute('data-kind') === 'cut').length,
        textSlots: containedText.map(t => t.getAttribute('data-tb')), imageSlots: containedPictures.filter(im => im.hasAttribute('data-img')).map(im => im.getAttribute('data-img')), label: titleFromNodes(containedText), kind: 'frame' });
      return [item];
    }
    item.kind = item.nI ? item.nT ? 'card' : 'photo' : item.nT >= 2 ? 'text-card' : 'text';
    return [item];
  });
  const buckets = [];
  for (const item of nodes) {
    const bucket = buckets.find(g => g[0].kind === item.kind && g[0].nI === item.nI && near(g[0].box.w, item.box.w) && near(g[0].box.h, item.box.h)
      && !g.some(other => other.el.contains(item.el) || item.el.contains(other.el) || overlaps(other.box, item.box) > Math.min(other.box.w * other.box.h, item.box.w * item.box.h) * .25));
    if (bucket) bucket.push(item); else buckets.push([item]);
  }
  // Photo mosaics may deliberately use different tile widths. One oversized hero is not a repeat.
  const uniquePhotos = new Map();
  for (const item of nodes.filter(i => i.kind === 'photo' && i.nI === 1)) {
    const picture = pictures(item.el)[0], image = picture.closest('[data-img]') || picture, previous = uniquePhotos.get(image);
    if (!previous || item.el === image) uniquePhotos.set(image, item);
  }
  const photoFamilies = [[], []];
  for (const item of uniquePhotos.values()) photoFamilies[item.cuts ? 1 : 0].push(item);
  const mosaics = photoFamilies.flatMap(items => {
    if (items.length < 2) return [];
    const areas = items.map(i => i.box.w * i.box.h).sort((a, b) => a - b), median = areas[Math.floor(areas.length / 2)];
    const peers = /모자이크|격자/.test(meta.name || '') ? items : items.filter(i => i.box.w * i.box.h >= median / 3 && i.box.w * i.box.h <= median * 3);
    return peers.length >= 2 && !peers.some((a, i) => peers.some((b, j) => i !== j && overlaps(a.box, b.box) > Math.min(a.box.w * a.box.h, b.box.w * b.box.h) * .25)) ? [peers] : [];
  });
  let groups = [...buckets.filter(g => g.length >= 2 && g.length <= 64), ...mosaics];
  // A row of two cards is a container, not one repeat unit. Prefer the actual cards across rows.
  groups = groups.filter(g => !groups.some(other => other !== g && other[0].nT && other.length > g.length && g.every(parent => other.filter(child => parent.el.contains(child.el)).length >= 2)));
  // Photo windows, inner white panels and captions inside a card are parts of that same unit.
  groups = groups.filter(g => !groups.some(other => other !== g && other.length >= g.length && other[0].nT && g.every(child => other.some(parent => parent.el !== child.el && parent.el.contains(child.el))) && other[0].box.w * other[0].box.h > g[0].box.w * g[0].box.h * 1.05));
  // Flat templates draw photos and captions as siblings: collapse duplicate targets at the same columns.
  groups = groups.filter(g => !groups.some(other => other !== g && other.length === g.length && other[0].nI && !g[0].nI && g.every(item => other.some(im => Math.abs(item.box.x - im.box.x) < 20 && near(item.box.w, im.box.w)))));
  groups = groups.filter(g => !groups.some(other => other !== g && other.length > g.length && g.every(item => other.some(peer => peer.el === item.el))));
  groups = groups.filter((g, index) => !groups.slice(0, index).some(other => other.length === g.length && g.every(item => other.some(peer => covers(item.box, peer.box, 1) && covers(peer.box, item.box, 1) && item.nT === peer.nT && item.nI === peer.nI))));
  let targets = groups.map(g => {
    const area = g.reduce((n, i) => n + i.box.w * i.box.h, 0), rich = g[0].kind === 'card' || g[0].kind === 'frame' ? 2 : g[0].kind === 'text-card' ? 1.4 : 1;
    const pcHint = meta.p === 'products' && meta.pc === g.length ? 1.3 : 1;
    return serialize(g, 'repeat:' + g.map(i => i.path.join('.')).join('|'), area / (1152 * 520) * rich * pcHint, 'structure');
  }).sort((a, b) => b.score - a.score);
  targets = targets.filter((t, i) => !targets.some((other, j) => j !== i && other.count === t.count && other.score > t.score && t.items.every(child => other.items.some(parent => covers(parent.box, child.box)))));
  const expected = namedCount(meta);
  if (expected && targets.some(t => t.count === expected)) targets.sort((a, b) => Number(b.count === expected) - Number(a.count === expected) || b.score - a.score);
  else if (expected && /카드/.test(meta.name || '')) return { status: 'needs-analysis', targets: [], primary: null };
  if (targets[0]?.unit === 'product') targets = targets.filter((t, i) => !i || t.unit !== 'product' || t.count !== targets[0].count);
  return { status: targets.length ? 'ready' : nodes.length ? 'needs-analysis' : 'none', targets, primary: targets[0] || null };
}

/** Match a displayed target back to current nodes after zoom/selection changes. */
export function resolveRepeatTarget(root, meta, selected) {
  const result = detectLayoutRepeats(root, meta);
  if (!selected) return result.primary;
  if (selected.origin === 'analysis') return selected.items.every(item => item.path && repeatNode(root, item.path)) ? selected : null;
  return result.targets.find(t => t.id === selected.id) || null;
}
