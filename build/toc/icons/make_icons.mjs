import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../app/web/package.json', import.meta.url));
const sharp = require('sharp');
const map = JSON.parse(fs.readFileSync(new URL('feature_icons.json', import.meta.url), 'utf8'));
const OUT = new URL('../../../app/web/public/assets/toc/icons', import.meta.url).pathname;
const inner = (name) => {
  const svg = fs.readFileSync(new URL(`node_modules/lucide-static/icons/${name}.svg`, import.meta.url), 'utf8');
  return svg.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
};
const tile = (body, bg, fg) => `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
<rect x="0" y="0" width="128" height="128" rx="30" fill="${bg}"/>
<g transform="translate(34 34) scale(2.5)" fill="none" stroke="${fg}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
let n = 0;
for (const [fid, name] of Object.entries(map)) {
  const body = inner(name);
  await sharp(Buffer.from(tile(body, '#1428a0', '#ffffff'))).png({ compressionLevel: 9 }).toFile(`${OUT}/${fid}.on.png`);
  await sharp(Buffer.from(tile(body, '#eef0f4', '#aab1bd'))).png({ compressionLevel: 9 }).toFile(`${OUT}/${fid}.off.png`);
  n++;
}
fs.copyFileSync(new URL('node_modules/lucide-static/LICENSE', import.meta.url), `${OUT}/LICENSE-lucide.txt`);
console.log('icons', n);
