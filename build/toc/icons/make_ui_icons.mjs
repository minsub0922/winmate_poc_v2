import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../app/web/package.json', import.meta.url));
const sharp = require('sharp');
const OUT = new URL('../../../app/web/public/assets/toc/icons', import.meta.url).pathname;
const MAP = { store: 'store', chart2: 'chart-column', clock: 'clock', monitor: 'monitor', users: 'users', map: 'map', bolt: 'zap', home: 'house', calendar: 'calendar',
  device: 'monitor-smartphone', phone: 'smartphone', grid: 'layout-grid', film: 'clapperboard', chat: 'message-circle', doc: 'file-text' };
const inner = (name) => fs.readFileSync(new URL(`node_modules/lucide-static/icons/${name}.svg`, import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const tile = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect x="0" y="0" width="128" height="128" rx="30" fill="#ffffff"/>
<g transform="translate(34 34) scale(2.5)" fill="none" stroke="#1428a0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner(body)}</g></svg>`;
for (const [k, v] of Object.entries(MAP)) await sharp(Buffer.from(tile(v))).png({ compressionLevel: 9 }).toFile(`${OUT}/ui-${k}.png`);
console.log(Object.keys(MAP).length);
