import { L, layoutHtml, registerLayout } from './catalog.js';
import { fetchResource } from '../api/client.js';

const images = new Map();
async function dataUrl(url) {
  if (!images.has(url)) images.set(url, (async () => {
    const response = await fetchResource(url);
    if (!response.ok) throw new Error('공유할 이미지 파일을 읽지 못했어요.');
    const blob = await response.blob();
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
  })());
  return images.get(url);
}

export async function packSharedAssets(document) {
  const packed = structuredClone(document);
  const walk = async node => {
    if (!node || typeof node !== 'object') return;
    await Promise.all(Object.entries(node).map(async ([key, value]) => {
      if (typeof value === 'string' && value.startsWith('blob:')) node[key] = await dataUrl(value);
      else if (typeof value === 'string' && value.startsWith('u:')) throw new Error('이 브라우저에서 찾을 수 없는 업로드 이미지가 있어요. 이미지를 다시 넣어 주세요.');
      else if (value && typeof value === 'object') await walk(value);
    }));
  };
  await walk(packed);
  const custom = [...new Set(packed.parts.flatMap(p => p.layouts.map(x => x.f)).filter(f => /^L_MY_/.test(f)))];
  if (custom.length) packed.sharedTemplates = await Promise.all(custom.map(async f => {
    const saved = packed.sharedTemplates?.find(x => x.meta.f === f);
    if (saved && saved.meta.my?.up === L[f]?.my?.up) return saved;
    let html = layoutHtml(f);
    if (!html || !L[f]) throw new Error('공유할 My 레이아웃을 찾을 수 없어요.');
    // Parse attributes before finding URLs: serialized CSS encodes its quotes as
    // &quot;, which must never become part of a blob URL sent to fetch().
    const template = window.document.createElement('template'); template.innerHTML = html;
    const attributes = [...template.content.querySelectorAll('*')].flatMap(el => [...el.attributes]);
    const styles = [...template.content.querySelectorAll('style')];
    const urls = new Set([...attributes.map(a => a.value), ...styles.map(el => el.textContent)].flatMap(value => value.match(/blob:[^"'\s<>)]*/g) || []));
    for (const url of urls) {
      const data = await dataUrl(url);
      for (const attribute of attributes) if (attribute.value.includes(url)) attribute.value = attribute.value.split(url).join(data);
      for (const style of styles) if (style.textContent.includes(url)) style.textContent = style.textContent.split(url).join(data);
    }
    html = template.innerHTML;
    return { meta: structuredClone(L[f]), html };
  }));
  return packed;
}

export function registerSharedAssets(document) {
  for (const template of document.sharedTemplates || []) {
    if (!/^L_MY_/.test(template.meta?.f) || typeof template.html !== 'string') continue;
    const content = window.document.createElement('template'); content.innerHTML = template.html;
    content.content.querySelectorAll('script,iframe,object,embed,link,base,form,meta').forEach(el => el.remove());
    for (const el of content.content.querySelectorAll('*')) for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || ['srcdoc', 'contenteditable'].includes(attr.name)
        || (['src', 'href', 'xlink:href'].includes(attr.name) && /^\s*(javascript|vbscript|data:text\/html):/i.test(attr.value))) el.removeAttribute(attr.name);
    }
    registerLayout(template.meta, content.innerHTML);
  }
}
