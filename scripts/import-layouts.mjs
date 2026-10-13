// 원본 Winmate v2 앱 폴더에서 레이아웃 데이터를 가져와 이 저장소의 형식으로 풀어 놓는다.
//
//   node scripts/import-layouts.mjs <winmate-v2 폴더>
//
// 읽는 것 (원본 앱 기준)
//   data/layouts.b64   레이아웃 HTML 전체 — gzip + base64로 묶은 JSON { L_XXX: "<div …>" }
//   data/catalog.json  레이아웃 메타데이터 · 업종 · 제품 · 솔루션 (유관사례 등)
//   data/images.json   이미지 DB (pid → 파일)
//   img/               레이아웃 · 썸네일이 쓰는 이미지 파일
//
// 쓰는 것 (이 저장소)
//   src/data/layouts/<f>.html   레이아웃 하나당 파일 하나 (코드 에이전트 · 사람이 바로 읽고 고칠 수 있게)
//   src/data/catalog.json       이 페이지가 쓰는 부분만 (layouts · industries · products · solutions)
//   src/data/images.json        제품 · 솔루션 썸네일이 쓰는 이미지 항목만
//   public/img/                 레이아웃 HTML과 썸네일이 실제로 참조하는 이미지만
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const src = process.argv[2];
if (!src) {
  console.error('사용법: node scripts/import-layouts.mjs <winmate-v2 폴더>');
  process.exit(1);
}
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(src, p));

// 1) layouts
const html = JSON.parse(zlib.gunzipSync(Buffer.from(read('data/layouts.b64').toString('utf8').trim(), 'base64')).toString('utf8'));
const catalog = JSON.parse(read('data/catalog.json').toString('utf8'));
const layouts = catalog.layouts;
const missing = layouts.filter((l) => !html[l.f]).map((l) => l.f);
if (missing.length) throw new Error('HTML이 없는 레이아웃: ' + missing.join(', '));

const outLayouts = path.join(root, 'src/data/layouts');
fs.mkdirSync(outLayouts, { recursive: true });
for (const f of fs.readdirSync(outLayouts)) if (f.endsWith('.html')) fs.rmSync(path.join(outLayouts, f));
for (const l of layouts) fs.writeFileSync(path.join(outLayouts, l.f + '.html'), html[l.f] + '\n');

// 2) catalog (only what the template page uses)
const { generated, counts, industries, products, solutions } = catalog;
fs.writeFileSync(path.join(root, 'src/data/catalog.json'), JSON.stringify({ generated, counts, layouts, industries, products, solutions }, null, 1) + '\n');

// 3) images: product / solution thumbnails + every img/… the layout HTML points at
const images = JSON.parse(read('data/images.json').toString('utf8'));
const pids = {};
for (const x of [...products, ...solutions]) if (x.img && images.pids[x.img]) pids[x.img] = images.pids[x.img];
fs.writeFileSync(path.join(root, 'src/data/images.json'), JSON.stringify({ pids }, null, 1) + '\n');

const files = new Set(Object.values(pids).map((v) => v.file));
for (const l of layouts) for (const m of html[l.f].matchAll(/(?:src="|url\(['"]?)(img\/[^"')]+)/g)) files.add(m[1]);
const outImg = path.join(root, 'public/img');
fs.rmSync(outImg, { recursive: true, force: true });
for (const f of [...files].sort()) {
  const to = path.join(root, 'public', f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(src, f), to);
}
console.log(`layouts ${layouts.length} · images ${files.size} · solutions ${solutions.length} · products ${products.length}`);
