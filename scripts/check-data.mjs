// 데이터 일관성 점검 (브라우저 없이): npm run check
//   - 카탈로그의 모든 레이아웃에 src/data/layouts/<f>.html 이 있고, 남는 HTML 파일이 없는가
//   - 레이아웃 HTML 이 1280×720 루트 하나로 시작하고, data-tb 번호가 겹치지 않는가
//   - 레이아웃 HTML · 썸네일이 가리키는 img/… 파일이 public/img 에 있는가
//   - 메타데이터가 가리키는 파트 유형 · 업종 · 솔루션 · 제품 · 원본 장표가 정의돼 있는가
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const json = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const catalog = json('src/data/catalog.json');
const images = json('src/data/images.json');
const partsSrc = fs.readFileSync(path.join(root, 'src/lib/parts.js'), 'utf8');
const PART_KEYS = new Set([...partsSrc.slice(0, partsSrc.indexOf('export const REQ_LABEL')).matchAll(/^\s{2}(\w+): \{ label:/gm)].map((m) => m[1]));
const REQ_KEYS = new Set([...partsSrc.slice(partsSrc.indexOf('export const REQ_LABEL')).matchAll(/(\w+): '/g)].map((m) => m[1]));
const DECKS = new Set(['MI', 'VP', 'SS', 'SP', 'EX', 'CM']);
const IND = new Set(catalog.industries.map((i) => i.code));
const SOL = new Set(catalog.solutions.map((s) => s.id));
const PROD = new Set(catalog.products.map((p) => p.id));

const errs = [];
const dir = path.join(root, 'src/data/layouts');
const files = new Set(fs.readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)));
const imgRefs = new Set(Object.values(images.pids).map((v) => v.file));
const ids = new Set();
for (const l of catalog.layouts) {
  if (ids.has(l.f)) errs.push(`${l.f}: id 중복`);
  ids.add(l.f);
  if (!files.has(l.f)) { errs.push(`${l.f}: HTML 파일 없음`); continue; }
  const html = fs.readFileSync(path.join(dir, l.f + '.html'), 'utf8').trim();
  if (!/^<div style="width: 1280px; height: 720px;/.test(html)) errs.push(`${l.f}: 1280×720 루트 div 로 시작하지 않음`);
  const tb = [...html.matchAll(/data-tb="(\d+)"/g)].map((m) => m[1]);
  if (new Set(tb).size !== tb.length) errs.push(`${l.f}: data-tb 번호 중복`);
  if (l.nT !== tb.length) errs.push(`${l.f}: 텍스트 칸 수 nT=${l.nT}, HTML=${tb.length}`);
  const ni = new Set([...html.matchAll(/data-img="(\d+)"/g)].map((m) => m[1])).size;
  if (l.nI !== ni) errs.push(`${l.f}: 이미지 칸 수 nI=${l.nI}, HTML=${ni}`);
  for (const m of html.matchAll(/(?:src="|url\(['"]?)(img\/[^"')]+)/g)) imgRefs.add(m[1]);
  if (!PART_KEYS.has(l.p)) errs.push(`${l.f}: 파트 유형 '${l.p}' 없음`);
  if (l.p2 && !PART_KEYS.has(l.p2)) errs.push(`${l.f}: 보조 파트 유형 '${l.p2}' 없음`);
  if (!DECKS.has(l.c)) errs.push(`${l.f}: 원본 장표 '${l.c}' 없음`);
  if (l.ind && !IND.has(l.ind)) errs.push(`${l.f}: 업종 '${l.ind}' 없음`);
  for (const s of [l.sol, ...(l.sols || [])].filter(Boolean)) if (!SOL.has(s)) errs.push(`${l.f}: 솔루션 '${s}' 없음`);
  for (const p of l.prods || []) if (!PROD.has(p)) errs.push(`${l.f}: 제품 '${p}' 없음`);
  for (const r of l.req || []) if (!REQ_KEYS.has(r)) errs.push(`${l.f}: 필요한 정보 '${r}' 없음`);
}
for (const f of files) if (!ids.has(f)) errs.push(`${f}.html: 카탈로그에 없는 레이아웃 파일`);
for (const f of imgRefs) if (!fs.existsSync(path.join(root, 'public', f))) errs.push(`public/${f}: 이미지 파일 없음`);

if (errs.length) {
  console.error(errs.slice(0, 50).join('\n'));
  console.error(`\n${errs.length}개 문제`);
  process.exit(1);
}
console.log(`OK · 레이아웃 ${catalog.layouts.length}장 · 이미지 ${imgRefs.size}개 · 파트 유형 ${PART_KEYS.size} · 업종 ${IND.size} · 솔루션 ${SOL.size} · 제품 ${PROD.size}`);
