// 기능 아이콘 — 배경 없는 선 아이콘 + 밑줄(사용자 지시 2026-11-17: "아이콘 배경을 없애고 밑줄을 넣어서 그 밑에 텍스트가 있어야해 … 아이콘 사이즈는 좀더 커야겠지").
// 고객/공간 시나리오 · 공간별 시나리오 장(L_TOC_SCN_S2 · S3)의 기능 칸이 쓴다: 그림 = 아이콘 + 칸 너비 밑줄(켬 파랑 · 끔 회색), 밑줄 아래 글(기능 이름 짧게)은 장의 글 칸.
// 켬/끔은 그림을 바꿔 보인다(밑줄 색도 그림에 들어 있어 칸마다 바뀐다). 표시 크기 72 × 38 — 아이콘 30 · 밑줄 2(아래 35–37).
// 타일 아이콘(make_icons.mjs: <fid>.on.png · .off.png)은 그대로 둔다 — 다른 장이 쓴다.
//   node build/toc/icons/make_line_icons.mjs   (build/toc/icons 에서 npm install 로 lucide-static 을 받아 둔다)
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
// 4배로 그린다(288 × 152 → 72 × 38): 아이콘 120(= 30) 가운데 · 밑줄 y 140–148(= 35–37) 칸 너비 전부
const line = (body, fg, rule) => `<svg xmlns="http://www.w3.org/2000/svg" width="288" height="152" viewBox="0 0 288 152">
<g transform="translate(84 0) scale(5)" fill="none" stroke="${fg}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</g>
<rect x="0" y="140" width="288" height="8" rx="4" fill="${rule}"/></svg>`;
let n = 0;
for (const [fid, name] of Object.entries(map)) {
  const body = inner(name);
  await sharp(Buffer.from(line(body, '#1428a0', '#1428a0'))).png({ compressionLevel: 9, palette: true, colours: 32 }).toFile(`${OUT}/${fid}.line-on.png`);
  await sharp(Buffer.from(line(body, '#b3b9c4', '#dde1e8'))).png({ compressionLevel: 9, palette: true, colours: 32 }).toFile(`${OUT}/${fid}.line-off.png`);
  n++;
}
console.log('line icons', n);
