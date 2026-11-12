// 경쟁사 비교 장의 기준 아이콘 — Lucide(ISC) 선 아이콘, 투명 바탕 · 파란 선 96px → app/web/public/assets/toc/icons/cp-<key>.png
// 장에서는 연한 파란 칸(TINT) 위에 놓는다. 실행: cd build/toc/icons && npm i && node make_cp_icons.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../app/web/package.json', import.meta.url));
const sharp = require('sharp');
const OUT = new URL('../../../app/web/public/assets/toc/icons', import.meta.url).pathname;
export const CP_ICONS = {
  layers: 'layers', screen: 'monitor', content: 'clapperboard', link: 'link', energy: 'zap', comfort: 'thermometer', cold: 'snowflake',
  security: 'shield-check', privacy: 'lock', service: 'wrench', pay: 'credit-card', price: 'tag', show: 'sparkles', safety: 'hard-hat',
  tv: 'tv', print: 'printer', tablet: 'tablet', data: 'activity', laundry: 'shirt', audio: 'speaker', color: 'palette', builtin: 'refrigerator',
  home: 'house', meeting: 'users', class: 'presentation', guide: 'map-pin', ward: 'clipboard-list', cert: 'badge-check', broadcast: 'radio-tower',
  proof: 'receipt', store: 'store', building: 'building-2', rugged: 'smartphone', kitchen: 'chef-hat', air: 'fan',
};
const inner = (name) => fs.readFileSync(new URL(`node_modules/lucide-static/icons/${name}.svg`, import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
<g transform="translate(8 8) scale(3.3333)" fill="none" stroke="#1428a0" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${inner(body)}</g></svg>`;
for (const [k, v] of Object.entries(CP_ICONS)) await sharp(Buffer.from(svg(v))).png({ compressionLevel: 9 }).toFile(`${OUT}/cp-${k}.png`);
console.log(Object.keys(CP_ICONS).length, 'icons');
