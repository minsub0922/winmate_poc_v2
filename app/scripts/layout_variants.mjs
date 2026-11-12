#!/usr/bin/env node
// 같은 레이아웃 · 다른 내용 → 레이아웃 하나 + 내용 후보
//   app/web/src/domain/templates/layout_variants.json        묶음 · 대표 장 · 후보 키(업종) · 후보마다 바뀌는 칸 (앱이 바로 읽음)
//   app/web/src/domain/templates/layout_variant_pieces.json  후보마다 대표 장과 다른 내용 조각 (레이아웃을 그릴 때 읽음)
//
//   node app/scripts/layout_variants.mjs            # 다시 만들기 (결정적 — 같은 입력이면 같은 파일)
//   node app/scripts/layout_variants.mjs --check    # 지금 파일이 입력과 맞는지만 확인 (CI)
//   node app/scripts/layout_variants.mjs --report   # 묶음 · 후보 · 바뀌는 칸을 output/layout-variants.md 로
//
// 같은 레이아웃 = 정리된 HTML(repairLayoutUnmarked)을 layout_variants.js layoutHoles로 나눈 '틀'이 글자 하나까지 같은 장.
// 틀에서 빠지는 것(= 내용): 칸 글 · 태그 사이 글 · 사진(src · 크롭 · 종류) · 차트 도형 좌표 · 칸 글의 크기 · 색.
// 대상: 라이브러리에 있는 장(뺀 장 제외) + 업종 기본 표지(L_IND_*). 대표 장 = 업종 순서(catalog.industries)로 첫 업종, 업종이 없으면 목록 순서.
// 후보마다 대표 장의 틀에 자기 조각을 끼우면 원래 HTML과 같아야 한다 — 하나라도 다르면 실패한다.
// 다음 순서로 돌린다: layout_variants.mjs → layout_slot_modes.mjs (칸 구분이 묶음을 읽는다)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DATA = path.join(ROOT, 'app', 'data');
const T = path.join(ROOT, 'app', 'web', 'src', 'domain', 'templates');
const OUT = path.join(T, 'layout_variants.json');
const OUT_PIECES = path.join(T, 'layout_variant_pieces.json');
const imp = (f) => import(pathToFileURL(path.join(T, f)).href);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const { PHOTO_META, PHOTO_HTML } = await imp('photo_layouts.js');
const { STD_META, STD_HTML } = await imp('std_layouts.js');
const { VSTD_META, VSTD_HTML } = await imp('vertical_std_layouts.js');
const { TOC_META, TOC_HTML } = await imp('toc_layouts.js');
const { SPATIAL_META, SPATIAL_HTML } = await imp('spatial-layouts.js');
const { ACCOUNT_META, ACCOUNT_HTML } = await imp('account_layouts.js');
const { COVERS } = await imp('covers.js');
const { RETIRED_R4 } = await imp('retired.js');
const { RETIRED_EXTRA } = await imp('retired_extra.js');
const { repairLayoutUnmarked } = await imp('layout_repairs.js');
const { layoutHoles, fillHoles, diffPieces, slotContents } = await imp('layout_variants.js');

const catalog = readJson(path.join(DATA, 'catalog.json'));
const base = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(DATA, 'layouts.b64'), 'utf8').trim(), 'base64')).toString('utf8'));
const RAW = Object.assign({}, base, COVERS, PHOTO_HTML, STD_HTML, VSTD_HTML, SPATIAL_HTML, ACCOUNT_HTML, TOC_HTML);
const ALL = [...catalog.layouts, ...PHOTO_META, ...STD_META, ...VSTD_META, ...SPATIAL_META, ...ACCOUNT_META, ...TOC_META];
const META = Object.fromEntries(ALL.map((l) => [l.f, l]));
const ORDER = new Map(ALL.map((l, i) => [l.f, i]));
const RETIRED = { ...RETIRED_R4, ...RETIRED_EXTRA };
const IND = catalog.industries.map((i) => i.code);
const IND_NAME = Object.fromEntries(catalog.industries.map((i) => [i.code, i.name]));

const indOf = (f) => (META[f] && META[f].ind) || (/^L_IND_([A-Z]{2})$/.exec(f) || [])[1] || null;
const pool = Object.keys(RAW).filter((f) => RAW[f] && ((META[f] && !RETIRED[f]) || /^L_IND_/.test(f))).sort();
const H = {}, CUT = {};
const bySkel = new Map();
for (const f of pool) {
  H[f] = repairLayoutUnmarked(f, RAW[f]);
  CUT[f] = layoutHoles(H[f]);
  const g = bySkel.get(CUT[f].skel) || [];
  g.push(f); bySkel.set(CUT[f].skel, g);
}

const groups = {}, pieces = {}, problems = [];
for (const g of [...bySkel.values()].filter((x) => x.length > 1)) {
  // 후보 키 = 업종 코드 (업종 없는 범용 장은 '_' — 한 묶음에 하나까지). 업종으로 가를 수 없으면 장 id
  const keyOf = (f) => indOf(f) || '_';
  const byInd = new Set(g.map(keyOf)).size === g.length;
  const rank = (f) => (keyOf(f) === '_' ? -1 : IND.indexOf(keyOf(f)));
  g.sort((a, b) => (byInd ? rank(a) - rank(b) : 0) || (ORDER.get(a) ?? 1e9) - (ORDER.get(b) ?? 1e9) || a.localeCompare(b));
  const canon = g[0];
  // what changes from candidate to candidate
  const contents = Object.fromEntries(g.map((f) => [f, slotContents(H[f])]));
  const vary = (kind) => Object.keys(contents[canon][kind]).filter((i) => new Set(g.map((f) => contents[f][kind][i])).size > 1).map(Number).sort((a, b) => a - b);
  let other = 0;
  for (const f of g.slice(1)) {
    const d = diffPieces(H[canon], H[f]);
    if (!d) { problems.push(`${f}: 틀이 ${canon}과 다름`); continue; }
    if (fillHoles(H[canon], d, CUT[canon]) !== H[f]) { problems.push(`${f}: ${canon} 틀 + 조각이 원래 HTML과 다름`); continue; }
    pieces[f] = d;
    other = Math.max(other, Object.keys(d).filter((k) => !CUT[canon].holes[k][3]).length);
  }
  // 묶음 이름 = 후보 이름들의 공통 끝부분('외식 · 카페 · 하루 시나리오 · 시간대 사진 5' … → '하루 시나리오 · 시간대 사진 5'),
  // 후보 라벨 = 그 앞부분(업종 · 공간). 끝이 같지 않으면 공통 앞부분('간지')을 이름으로, 나머지를 라벨로.
  const segs = g.map((f) => String((META[f] && META[f].name) || f).split(' · '));
  const common = (rev) => { let k = 0; const at = (x, i) => (rev ? x[x.length - 1 - i] : x[i]); while (k < Math.min(...segs.map((x) => x.length)) - 1 && segs.every((x) => at(x, k) === at(segs[0], k))) k++; return k; };
  const tail = common(true), head = tail ? 0 : common(false);
  const name = tail ? segs[0].slice(-tail).join(' · ') : head ? segs[0].slice(0, head).join(' · ') : null;
  const labels = segs.map((x) => (tail ? x.slice(0, x.length - tail) : x.slice(head)).join(' · '));
  const whens = g.map((f) => String((META[f] && META[f].when) || ''));
  let w = whens[0]; for (const x of whens) { let k = 0; while (k < Math.min(w.length, x.length) && w[w.length - 1 - k] === x[x.length - 1 - k]) k++; w = w.slice(w.length - k); }
  if (whens.some((x) => x.length > w.length && !/\s$/.test(x.slice(0, x.length - w.length)))) w = w.replace(/^\S*\s+/, ''); // 잘린 앞 단어
  w = w.trim().replace(/^(고객사\s*—\s*|제안에서\s+)/, '').trim();
  groups[canon] = {
    by: byInd ? 'ind' : 'f',
    ...(name ? { name } : {}), ...(w.length >= 12 && whens.every(Boolean) ? { when: w } : {}),
    members: g.map((f, k) => [f, byInd ? keyOf(f) : f, labels[k] || f]),
    vary: { t: vary('t'), img: vary('img'), frame: other }, // frame: 칸 밖에서 바뀌는 조각 수 (차트 좌표 · 정적 글 …)
  };
}
if (problems.length) { console.error('✗ 후보를 대표 장으로 다시 그릴 수 없습니다:\n  ' + problems.join('\n  ')); process.exit(1); }

const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
const doc = {
  version: 1,
  generator: 'app/scripts/layout_variants.mjs',
  note: '구조가 같고 내용만 다른 장 — 대표 장 하나 + 내용 후보. name · when: 묶음 이름 · 설명 · members: [장 id, 후보 키(업종 코드 · 범용 _ · 또는 장 id), 후보 라벨] · vary: 후보마다 바뀌는 칸',
  groups: sortKeys(groups),
};
const text = JSON.stringify(doc, null, 0).replace(/("L_[A-Za-z0-9_]+":\{"by")/g, '\n$1') + '\n';
const textPieces = JSON.stringify({ version: 1, generator: doc.generator, pieces: sortKeys(pieces) }, null, 0).replace(/("L_[A-Za-z0-9_]+":\{")/g, '\n$1') + '\n';

const argv = process.argv.slice(2);
if (argv.includes('--check')) {
  const a = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '', b = fs.existsSync(OUT_PIECES) ? fs.readFileSync(OUT_PIECES, 'utf8') : '';
  if (a !== text || b !== textPieces) { console.error('✗ layout_variants.json 이 입력과 다릅니다 — node app/scripts/layout_variants.mjs'); process.exit(1); }
  console.log('✓ layout_variants.json 최신'); process.exit(0);
}
fs.writeFileSync(OUT, text);
fs.writeFileSync(OUT_PIECES, textPieces);
const nG = Object.keys(groups).length, nM = Object.values(groups).reduce((a, g) => a + g.members.length, 0);
const lib = Object.values(groups).filter((g) => !/^L_IND_/.test(g.members[0][0]));
console.log(`✓ ${path.relative(ROOT, OUT)} — 묶음 ${nG} · 장 ${nM} → 레이아웃 ${nG} + 후보 ${nM - nG} (라이브러리에서 ${lib.reduce((a, g) => a + g.members.length - 1, 0)}장 줄어듦) · 조각 ${Math.round(textPieces.length / 1024)}KB`);

if (argv.includes('--report')) {
  const lines = ['# 같은 레이아웃 · 다른 내용', '', `생성: node app/scripts/layout_variants.mjs --report · 묶음 ${nG} · 장 ${nM}`, '',
    '| 대표 장 | 이름 | 후보 | 바뀌는 칸 (글 · 사진 · 칸 밖) |', '| --- | --- | --- | --- |'];
  for (const [c, g] of Object.entries(groups)) {
    const name = g.name || (META[c] && META[c].name) || c;
    const keys = g.members.map(([f, k]) => (g.by === 'ind' ? (k === '_' ? '범용' : `${k} ${IND_NAME[k] || ''}`.trim()) : f)).join(' · ');
    lines.push(`| ${c} | ${name.replace(/\|/g, '/')} | ${keys} | ${g.vary.t.length} · ${g.vary.img.length} · ${g.vary.frame} |`);
  }
  const out = path.join(ROOT, 'output', 'layout-variants.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log('✓ ' + path.relative(ROOT, out));
}
