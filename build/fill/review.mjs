// 채운 레이아웃 확인용 장표 묶음 — node build/fill/review.mjs <out prefix> [cols] [f …]
// data-fill 은 build/fill/img 의 원본 파일로 바꿔 그린다(앱에서는 img/fill/*.json 묶음).
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'fs';
import zlib from 'zlib';
const [prefix, colsS = '3', ...only] = process.argv.slice(2);
const H = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync('data/layouts.b64', 'utf8').trim(), 'base64')).toString('utf8'));
const PLAN = JSON.parse(fs.readFileSync('build/fill/plan.json', 'utf8'));
const IM = JSON.parse(fs.readFileSync('build/fill/images.json', 'utf8'));
const list = only.length ? only : Object.keys(PLAN).sort();
const exe = process.env.CHROME; const b = await chromium.launch(exe ? { executablePath: exe } : {});
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
const SHOT = `_review${process.pid}.html`;
const cols = +colsS, TW = 520, TH = 293, per = cols * 4;
let sheet = 0;
for (let s = 0; s < list.length; s += per) {
  const chunk = list.slice(s, s + per); const shots = [];
  for (const f of chunk) {
    const html = (H[f] || '').replace(/<img([^>]*?)data-fill="[^"]*"([^>]*?)>/g, (m) => {
      const pid = (m.match(/data-pid="fill\.([^"]+)"/) || [])[1];
      return IM[pid] ? m.replace(/src="[^"]*"/, `src="${IM[pid].file}"`) : m;
    });
    fs.writeFileSync(SHOT, `<html><head><meta charset="utf-8"><style>body{margin:0} @font-face{font-family:'Noto Sans KR';src:local('Noto Sans CJK KR');} @font-face{font-family:'Noto Sans KR';font-weight:700;src:local('Noto Sans CJK KR Bold');}</style></head><body>${html}</body></html>`);
    await pg.goto('file://' + process.cwd() + '/' + SHOT, { waitUntil: 'load' });
    const buf = await pg.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } });
    shots.push(await sharp(buf).resize(TW, TH).png().toBuffer());
    if (process.env.FULL) fs.writeFileSync(`${prefix}_${f}.png`, buf);
  }
  const rows = Math.ceil(chunk.length / cols);
  const comp = shots.map((x, i) => ({ input: x, left: (i % cols) * (TW + 8), top: Math.floor(i / cols) * (TH + 26) + 22 }));
  const labels = chunk.map((f, i) => `<text x="${(i % cols) * (TW + 8) + 4}" y="${Math.floor(i / cols) * (TH + 26) + 16}" font-size="15" font-family="sans-serif" fill="#000">${f}</text>`).join('');
  const W = cols * (TW + 8), Ht = rows * (TH + 26);
  await sharp({ create: { width: W, height: Ht, channels: 3, background: '#cfd3da' } }).composite([...comp, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Ht}">${labels}</svg>`), left: 0, top: 0 }]).jpeg({ quality: 80 }).toFile(`${prefix}${sheet}.jpg`);
  sheet++;
}
fs.unlinkSync(SHOT);
await b.close();
console.log(sheet, 'sheets');
