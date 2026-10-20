import { P } from './catalog.js';

// Captions use marketing names while the product DB often stores SM-* SKUs.
// Keep '+' meaningful: S26, S26+ and S26 Ultra are different products.
export const imageNameKey = text => String(text || '').normalize('NFKC').toLowerCase()
  .replace(/galaxy/g, '갤럭시').replace(/ultra/g, '울트라').replace(/fold/g, '폴드')
  .replace(/flip/g, '플립').replace(/watch/g, '워치').replace(/tablet/g, '태블릿')
  .replace(/\btab\b/g, '탭').replace(/book/g, '북').replace(/\bpro\b/g, '프로')
  .replace(/[^a-z0-9가-힣+]/g, '');

const aliases = new Map();
function addAlias(text, id) {
  const key = imageNameKey(text);
  if (key.length < 3) return;
  if (!aliases.has(key)) aliases.set(key, new Set());
  aliases.get(key).add(id);
}
for (const p of Object.values(P)) {
  for (const model of [p.model, ...(p.models || [])].filter(v => typeof v === 'string')) {
    addAlias(model, p.id);
    const mobile = /^(SM-[A-Z]\d{3})/i.exec(model);
    if (mobile) addAlias(mobile[1], p.id);
  }
  const name = String(p.name || '').replace(/\([^)]*\)/g, ' ').replace(/자급제|삼성닷컴(?:전용)?|비즈니스 에디션/g, ' ').trim();
  addAlias(name, p.id);
  const short = imageNameKey(name).replace(/^갤럭시/, '');
  if (/^(?:[as]\d{2}|z(?:폴드|플립)|탭|북|워치)/.test(short)) addAlias(short, p.id);
}
const names = [...aliases].sort(([a], [b]) => b.length - a.length);

export function productsNamedIn(text) {
  const key = imageNameKey(text), found = new Set();
  let longest = 0;
  for (const [name, ids] of names) {
    if (longest && name.length < longest) break;
    const at = key.indexOf(name);
    if (at < 0) continue;
    // Don't read S26 out of S260 or a model prefix out of another ASCII word.
    if (/^[a-z0-9]/.test(name) && /[a-z0-9]/.test(key[at - 1] || '')) continue;
    const next = key[at + name.length] || '';
    if (/[a-z0-9]$/.test(name) && /[a-z0-9]/.test(next) && !(/^sm[a-z]\d{3}$/.test(name) && /[a-z]/.test(next))) continue;
    longest = name.length;
    for (const id of ids) found.add(id);
  }
  return [...found];
}

export function deviceFamily(text) {
  const value = String(text || '').replace(/\([^)]*\)/g, ' ').toLowerCase();
  const types = [
    ['tablet', /태블릿|갤럭시\s*탭|galaxy\s*tab|tablet/],
    ['computer', /갤럭시\s*북|galaxy\s*book|노트북|laptop/],
    ['phone', /스마트폰|휴대폰|핸드폰|모바일\s*앱|smartphone|\bphone\b|갤럭시\s*(?:s\d|a\d|z\s*(?:폴드|플립))|galaxy\s*(?:s\d|a\d|z\s*(?:fold|flip))/],
    ['watch', /워치|smartwatch/], ['audio', /버즈|이어폰|\bbuds\b/], ['tag', /스마트태그|smarttag/],
  ].map(([family, re]) => ({ family, at: re.exec(value)?.index ?? Infinity })).sort((a, b) => a.at - b.at);
  if (types[0].at !== Infinity) return types[0].family;
  if (/갤럭시|galaxy/.test(value)) return 'galaxy';
  return '';
}
const productFamilies = new Map(Object.values(P).map(p => {
  const category = [p.sc, p.cat].filter(Boolean).join(' ');
  return [p.id, /액세서리|소모품|accessor/i.test(category) ? 'accessory' : deviceFamily(category + ' ' + p.name)];
}));

export function matchesDeviceFamily(image, family) {
  const ids = image.products || [];
  if (ids.length && ids.every(id => productFamilies.get(id) === 'accessory')) return false;
  const own = deviceFamily(image.title);
  if (own && own !== 'galaxy') return family === 'galaxy' ? /갤럭시|galaxy/i.test(image.title) : own === family;
  if (ids.length) return ids.some(id => family === 'galaxy'
    ? /갤럭시|galaxy/i.test(P[id]?.name || '') && productFamilies.get(id) !== 'accessory'
    : productFamilies.get(id) === family);
  const described = deviceFamily(image.desc || image.name);
  return family === 'galaxy' ? !!described : described === family;
}

export function knownImage(image, list) {
  if (!image) return null;
  // Actual pixels/address win over a stale data-pid left by an older template.
  return (image.src && list.find(im => im.src === image.src))
    || (image.pid && list.find(im => im.pid === image.pid)) || null;
}
