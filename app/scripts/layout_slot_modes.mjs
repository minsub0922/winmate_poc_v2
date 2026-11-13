#!/usr/bin/env node
// 레이아웃 칸별 '고정 / 교체 / AI' 분류 → app/web/src/domain/templates/slot_modes.json
//
//   node app/scripts/layout_slot_modes.mjs            # 분류 다시 만들기 (결정적 — 같은 입력이면 같은 파일)
//   node app/scripts/layout_slot_modes.mjs --report   # 분류 요약 · 레이아웃별 칸 목록을 output/layout-slot-modes.md 로
//   node app/scripts/layout_slot_modes.mjs --check    # 지금 파일이 입력과 맞는지만 확인 (CI)
//
// 모드 (칸에 data-fix 로 붙음 — layout_slot_modes.js)
//   fixed     고정 — 고객이 바뀌어도 그대로인 내용 (Why Samsung · 솔루션 설명 · 구조 라벨 · SAMSUNG 로고)
//   product   제품 교체 — 제품 이름 · 모델 · 사양 · 제품 컷. 제품을 바꿀 때만 제품 DB 값으로 바뀐다
//   solution  솔루션 교체 — 범용 장의 솔루션 이름 · 기능 · 화면. 솔루션을 바꿀 때만 솔루션 정보로 바뀐다
//   case      사례 교체 — 도입사례의 고객 · 성과 · 사진. 사례를 바꿀 때만 사례 DB 값으로 바뀐다
//   section   목차 번호 — 눈썹 · 간지 번호 · 장 이름. 제안서 목차 순서로 자동
//   pick      후보 선택 — 같은 레이아웃 묶음(layout_variants.json)에서 업종 후보마다 정해진 글 · 사진. 고른 업종의 후보 값을 쓴다
//   (없음)    AI 작성 — 고객 · 업종 · 요구에 맞춰 AI가 쓰는 칸
//
// 판단 근거 (위에서부터)
//   1. 장 단위 규칙: Why Samsung · 마감 장 = 전부 고정, 간지 = 목차 번호, 도입사례 = 사례 교체 …
//      구독 장(L_SUB_*) = 칸 이름(SUBS_SLOTS)으로 — 구독 레지스트리 원문 · 패키지 · 조건 · 납부 방법은 고정, 제목 · 현장 고민 · 예산 금액은 AI
//   2. 샘플 시나리오(표준 제안서 44종 · 버티컬 · 어카운트 · 고객별)에서 실제로 채운 값 — 여러 업종 덱에서 늘 같은 값이면 고정,
//      제품 · 사례 이름이면 교체, 업종마다 다르면 AI
//   3. 같은 구조의 업종 변형(L_PH_MI_xx_B 등 16업종)끼리 글이 같은 칸 = 구조 라벨 → 고정
//   4. 글 모양: 제품 모델 · 사양 값 → 제품 교체, 솔루션 이름 · 기능(솔루션 장) → 고정/솔루션, 샘플 고객 이름 · [00] 자리표시 → AI
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DATA = path.join(ROOT, 'app', 'data');
const T = path.join(ROOT, 'app', 'web', 'src', 'domain', 'templates');
const OUT = path.join(T, 'slot_modes.json');
const imp = (f) => import(pathToFileURL(path.join(T, f)).href);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const { PHOTO_META, PHOTO_HTML } = await imp('photo_layouts.js');
const { STD_META, STD_HTML } = await imp('std_layouts.js');
const { VSTD_META, VSTD_HTML } = await imp('vertical_std_layouts.js');
const { TOC_META, TOC_HTML, TOC_SLOTS } = await imp('toc_layouts.js');
const { SUBS_META, SUBS_HTML, SUBS_SLOTS } = await imp('subs_layouts.js');
const { SPATIAL_META, SPATIAL_HTML } = await imp('spatial-layouts.js');
const { ACCOUNT_META, ACCOUNT_HTML } = await imp('account_layouts.js');
const { COVERS } = await imp('covers.js');
const { repairLayoutBase } = await imp('layout_repairs.js');
const { cleanupLayoutHtml, parseLayout, textOf, attr } = await imp('layout_cleanup.js');
const { redesignLayoutHtml } = await imp('layout_redesign.js');
const { FILLS } = await imp('scenario_fills.js');
const VARIANTS = readJson(path.join(T, 'layout_variants.json')).groups; // layout_variants.mjs가 먼저

const catalog = readJson(path.join(DATA, 'catalog.json'));
const pdb = readJson(path.join(DATA, 'products_db.json'));
const vsol = readJson(path.join(DATA, 'vertical_space_solution.json'));
const base = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(DATA, 'layouts.b64'), 'utf8').trim(), 'base64')).toString('utf8'));
const RAW = Object.assign({}, base, COVERS, PHOTO_HTML, STD_HTML, VSTD_HTML, SPATIAL_HTML, ACCOUNT_HTML, TOC_HTML, SUBS_HTML);
const META = Object.fromEntries([...catalog.layouts, ...PHOTO_META, ...STD_META, ...VSTD_META, ...SPATIAL_META, ...ACCOUNT_META, ...TOC_META, ...SUBS_META].map((l) => [l.f, l]));

// ---------------------------------------------------------------- dictionaries
const MODELS = new Set(), PNAMES = new Set();
for (const p of [...catalog.products, ...pdb.products]) {
  const m = String(p.model || '').trim();
  if (m.length >= 4) {
    const u = m.toUpperCase();
    MODELS.add(u); MODELS.add(u.replace(/-.*$/, ''));
    const sm = /^(SM-[A-Z]\d{3,4})/.exec(u); if (sm) MODELS.add(sm[1]); // 갤럭시 SM-X930NZ… → SM-X930
    const lh = /^L[HSF](\d{2}[A-Z]{2,4})/.exec(u); if (lh) MODELS.add(lh[1]); // LH55QMC… → 55QMC
  }
  const n = String(p.name || '').trim();
  if (n.length >= 3) PNAMES.add(n);
}
try {
  const vsp = readJson(path.join(DATA, 'vertical_space_product.json'));
  (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { for (const k of ['name', 'product', 'title']) if (typeof x[k] === 'string' && x[k].length >= 3 && x[k].length <= 30 && /[가-힣A-Za-z]/.test(x[k]) && (x.cat || x.fam || x.sc || x.model || x.products)) PNAMES.add(x[k]); Object.values(x).forEach(walk); } })(vsp.product_taxonomy || vsp.products || {});
} catch (e) { /* optional */ }
// short model stems used in layouts (QM55C, KM24C, OH55A, WM75B …)
const MODEL_RE = /\b(?:[A-Z]{1,3}\d{2,3}[A-Z]{0,3}(?:-[A-Z0-9]{1,4})?|S\d{2}\s?(?:Ultra|FE|\+)?|Z\s?(?:Fold|Flip)\s?\d)\b/;
const PRODUCT_WORD = /(Infinite AI|WindFree|AirDresser|Bespoke|비스포크 AI|사이니지|키오스크|The Wall|비디오월|전자칠판|Flip|갤럭시|Galaxy|탭\s?S\d|탭 액티브|엑스커버|스마트폰|모니터|ViewFinity|Odyssey|호텔 TV|비즈니스 TV|에어컨|무풍|시스템에어컨|실외기|실내기|공기청정기|에어드레서|비스포크|BESPOKE|냉장고|세탁기|건조기|오븐|인덕션|식기세척기|프로젝터|LED|E-Paper|e-Paper|DVM|EHS|칠러|냉동기|쇼케이스|노트북|갤럭시 북|PC|프린터|복합기|버즈|워치|링)/;
const SPEC_RE = /^[\s[(~약]*[\d.,]+\s*(nit|cd\/㎡|형|인치|"|Hz|W|kW|RT|kg|mm|cm|m|ms|dB|K|°|℃|L|ℓ|GB|TB|시간|h|mAh|등급|%)\b|^(4K|8K|UHD|FHD|QHD|24\/7|IP\d{2}|IP5X|USB-C|Wi-Fi|5G|LTE)\b/;
const SOLUTIONS = new Set([...catalog.solutions.map((s) => s.name), ...(vsol.solution_catalog || []).map((s) => s.name), 'MagicINFO', 'VXT', 'Samsung VXT', 'SmartThings Pro', 'SmartThings', '스마트싱스', 'b.IoT', 'LYNK Cloud', 'LYNK', 'Knox', 'Knox Suite', 'Knox Capture', 'Knox Manage', 'Knox Configure', 'DeX', 'Samsung DeX', 'DMS', 'CounThru', 'SecuThru', 'Tizen', '삼성케어플러스', 'Samsung Health', '삼성헬스', '갤럭시 클래스룸']);
const SOL_RE = new RegExp('(' + [...SOLUTIONS].filter((s) => s.length >= 3).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|') + ')');
const CASE_CUSTS = new Set(catalog.cases.map((c) => String(c.cust || '').trim()).filter((x) => x.length >= 2));

// structural labels — the grammar of a layout, not its content
const LABELS = new Set(['지금', '지금 문제', '문제', '과제', '원인', '공통 원인', '근본 원인', '해결', '결과', '효과', '기대 효과', '핵심', '핵심 제안', '제안', '삼성', '삼성 제안', '삼성의 답', '근거', '증거', '도입 전', '도입 후', '전', '후', 'AS-IS', 'TO-BE', 'Before', 'After', 'BEFORE', 'AFTER', 'KEY MESSAGE', 'Key Message', 'POINT', 'Point', '대표 제품', '대표 장면', '적용 공간', '도입 포인트', '고객 니즈', 'AI 기술', '세부 제안', '운영', '이용', '본사 운영', '현장', '관리자', '직원', '손님', '고객', '기간', '범위', '일정', '담당', '산출물', '구분', '항목', '내용', '비고', '합계', '총계', '소계', '단계', '목표', '지표', '현재', '목표치', '개선', '절감', '수량', '단가', '금액', '제품', '솔루션', '서비스', '공간', '기능', '특징', '사양', '모델', '설치', '구성', '연동', '보안', '교육', '유지보수', '파일럿', '확산', '필수', '선택', '가점', '충족', '대응', '요구', '요구사항', '평가 항목', '배점', 'DEVICE', 'SOLUTION', 'SERVICE', 'Device', 'Solution', 'Service', 'CONTENTS', '목차', '다음 단계', '결정 요청', '연락처', '감사합니다', 'THANK YOU', 'Thank you', 'Q&A']);
const ORDINAL = /^(0?\d{1,2}|[A-H]|[①-⑩]|STEP\s?\d+|Step\s?\d+|단계\s?\d+|Phase\s?\d+|PHASE\s?\d+|\d+단계|\d+차|[IVX]{1,4})$/;
const FIXED_WORDS = /^(SAMSUNG|Samsung|BUSINESS PROPOSAL|PROPOSAL|SAMSUNG BUSINESS|Samsung Business|제안사 로고|samsung\.com)$/;
const SAMPLE_CUST = /(^|[\s("“'·—])[A-Z]\s?(커피|호텔|빌딩|리테일|대학교|은행|요양병원|병원|제조|경기장|미디어|체인|테마파크|건설|지자체|백화점|다이닝|통신사|키친|오피스|스터디카페|물류센터|물류|학원|스크린골프|식품|리조트|편의점|보험|파크|볼파크|시네마|비즈니스|공유오피스|임대형|프랜차이즈|무인|매장|캠퍼스|공장|아파트|센터)/;
const PLACEHOLDER = /\[[^\]]{0,24}\]/;

// ---------------------------------------------------------------- sample fills
const fillSets = [FILLS, ...['standard_vertical_scenarios.json', 'vertical_scenarios.json', 'account_scenarios.json'].map((f) => readJson(path.join(T, f)).fills)];
const STATS = {};
for (const fills of fillSets) for (const [sid, slides] of Object.entries(fills || {})) {
  if (!Array.isArray(slides)) continue;
  for (const x of slides) {
    if (!x || !x.f) continue;
    // 구독 샘플(bs_sub_*)은 같은 업종의 표준 제안서 장을 그대로 다시 쓴다 — 그 장들의 근거로 두 번 세지 않는다(구독 장은 칸 이름으로 정함)
    if (sid.startsWith('bs_sub_') && !x.f.startsWith('L_SUB_')) continue;
    const s = STATS[x.f] = STATS[x.f] || { decks: new Set(), t: {}, img: {}, rows: [] };
    s.decks.add(sid);
    const row = {};
    for (const [i, v] of Object.entries(x.t || {})) {
      const val = (v && typeof v === 'object' ? (v.html ?? '') : String(v ?? '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const e = s.t[i] = s.t[i] || new Map(); e.set(val, (e.get(val) || 0) + 1);
      row[i] = val;
    }
    s.rows.push(row);
    for (const [i, v] of Object.entries(x.img || {})) {
      const e = s.img[i] = s.img[i] || new Map(); const k = (v && (v.src || v.name)) || ''; e.set(k, (e.get(k) || 0) + 1);
    }
  }
}

// ---------------------------------------------------------------- slots
function slotsOf(f) {
  const html = redesignLayoutHtml(f, cleanupLayoutHtml(f, repairLayoutBase(f, RAW[f])));
  const { nodes, top } = parseLayout(html);
  const yOf = (n) => { let y = 0; for (let p = n; p && p !== top && p.prop; p = p.parent) { const pos = p.prop('position'); if (pos === 'absolute' || pos === 'relative') y += parseFloat(p.prop('top')) || 0; } return y; };
  const fsOf = (n) => { for (let p = n; p && p.prop; p = p.parent) { const v = parseFloat(p.prop('font-size')); if (Number.isFinite(v)) return v; } return 16; };
  const t = [], img = [];
  const tbCount = (g) => (g._tb != null ? g._tb : (g._tb = nodes.filter((c) => c.tb != null && c.start > g.start && c.end <= g.end).length));
  for (const n of nodes) {
    if (n.tb != null && !t.some((x) => x.i === +n.tb)) {
      // the small box the slot sits in (a KPI tile · a spec cell: 2–3 text slots) — its siblings share its mode
      let g = n.parent, gid = -1;
      for (let up = 0; g && g !== top && up < 4; g = g.parent, up++) { const c = tbCount(g); if (c >= 2 && c <= 3) { gid = g.start; break; } if (c > 3) break; }
      // look of the slot without its place — parallel cards repeat it ('Galaxy AI' · 'Bespoke AI' · 'LYNK Cloud')
      const sig = (attr(n.attrs, 'style') || '').split(';').map((d) => d.trim()).filter((d) => d && !/^(left|top|right|bottom|width|height|max-width|max-height|min-width|min-height|z-index)\s*:/.test(d)).join(';');
      t.push({ i: +n.tb, s: textOf(html, n), fs: fsOf(n), y: yOf(n), fw: parseInt(n.prop('font-weight') || '0', 10) || 0, ls: !!n.prop('letter-spacing'), role: attr(n.attrs, 'data-type-role') || '', g: gid, sig: sig && `${fsOf(n)}|${attr(n.attrs, 'data-type-role') || ''}|${sig}` });
    }
    if (n.img != null && !img.some((x) => x.i === +n.img)) {
      const im = n.name === 'img' ? n : nodes.find((c) => c.name === 'img' && c.start > n.start && c.end <= n.end);
      img.push({ i: +n.img, kind: attr(n.attrs, 'data-kind') || '', hint: attr(n.attrs, 'data-hint') || '', pid: attr(n.attrs, 'data-pid') || (im && attr(im.attrs, 'data-pid')) || '', src: (im && ((attr(im.attrs, 'data-fill') || '') + ' ' + (attr(im.attrs, 'src') || ''))) || '' });
    }
  }
  t.sort((a, b) => a.i - b.i); img.sort((a, b) => a.i - b.i);
  return { t, img };
}

// industry-variant families: same structure across 16 industries
const famKey = (f) => {
  let m = /^L_PH_(MI|SS)_([A-Z]{2})_([A-E])$/.exec(f); if (m) return `L_PH_${m[1]}_*_${m[3]}`;
  m = /^L_(MI|SS)_([A-Z]{2})_([A-E])$/.exec(f); if (m) return `L_${m[1]}_*_${m[3]}`;
  m = /^L_([A-Z]{3})_S_([A-Z]{2})$/.exec(f); if (m) return `L_${m[1]}_S_*`;
  m = /^L_VP_U_?C?_([A-Z]{2})$/.exec(f); if (m) return 'L_VP_U_*';
  m = /^L_TOC_(INDEX|TECH|JOURNEY|BOM)\d+S?$/.exec(f); if (m) return 'L_TOC_' + m[1];
  m = /^L_VS_(DIV_R|BIRD_[SB]|MAP_)\d+$/.exec(f); if (m) return 'L_VS_' + m[1];
  m = /^L_VS_CORE_\d$/.exec(f); if (m) return 'L_VS_CORE';
  return null;
};

const SLOTS = {};
for (const f of Object.keys(RAW)) if (RAW[f]) SLOTS[f] = slotsOf(f);
const FAM = {};
for (const f of Object.keys(SLOTS)) { const k = famKey(f); if (k) (FAM[k] = FAM[k] || []).push(f); }
// text shared by the same slot number across a family
const famSame = (f, i, s) => {
  const k = famKey(f); if (!k || !s) return false;
  const sib = FAM[k].filter((g) => g !== f);
  if (sib.length < 2) return false;
  const same = sib.filter((g) => SLOTS[g].t.find((x) => x.i === i)?.s === s).length;
  return same >= Math.min(3, sib.length) && same / sib.length >= 0.6;
};
// labels used on many different layouts (like the PoC agent's label_freq)
const LABEL_FREQ = new Map();
// 구독 장(L_SUB_*)은 칸 이름으로 정하므로 빼고 센다 — 구독 품목 이름(전자칠판 · 정수기 …)이 다른 장의 라벨 빈도를 올리지 않게
for (const f of Object.keys(SLOTS)) if (!SUBS_SLOTS[f]) for (const x of new Set(SLOTS[f].t.map((x) => x.s).filter((s) => s && s.length <= 10))) LABEL_FREQ.set(x, (LABEL_FREQ.get(x) || 0) + 1);

// ---------------------------------------------------------------- classify
const isEyebrow = (x, k) => x.fs <= 15 && ((x.y <= 60 && ((k === 0 && (x.ls || /^\d{1,2}\s*[·.]/.test(x.s) || x.s === x.s.toUpperCase() || x.role === 'label')) || (k === 1 && /^\d{1,2}\s*[·.]/.test(x.s))))
  || (k <= 1 && x.y <= 110 && /^\d{1,2}\s*·\s*\S/.test(x.s))); // 사진 위 어두운 상자 안의 눈썹 ('01 · MARKET INTELLIGENCE')
const isProductText = (s) => {
  if (!s || s.length > 48) return false;
  if (/^[A-Z]{1,3}\s?(시리즈|Series)$/.test(s.trim())) return true; // 'QM 시리즈'
  const up = s.toUpperCase();
  const tokens = up.match(/[A-Z0-9][A-Z0-9-]{3,}/g) || [];
  if (tokens.some((t) => MODELS.has(t) || MODELS.has(t.replace(/-.*$/, '')))) return true;
  if (MODEL_RE.test(s) && PRODUCT_WORD.test(s)) return true;
  if ([...PNAMES].some((n) => n.length >= 5 && s.includes(n)) && s.length <= 32) return true;
  return false;
};
const SPEC_SEG = /^[\s[(~약]*[\d.,]+\s*(nit|cd\/㎡|형|인치|"|Hz|W|kW|RT|kg|mm|cm|ms|dB|K|°|℃|L|ℓ|GB|TB|mAh|등급)|^(4K|8K|UHD|FHD|QHD|24\/7|24시간|16\/7|IP\d{2}|IP5X|USB-C|Wi-Fi|5G|LTE|Tizen|Android|Windows)\b|^\d{2}\s?·\s?\d{2}/;
const isSpec = (s) => {
  if (!s) return false;
  if (SPEC_RE.test(s) && s.length <= 24) return true;
  const segs = s.split(/\s*[·,|]\s*/).filter(Boolean);
  return segs.length >= 2 && s.length <= 60 && segs.filter((x) => SPEC_SEG.test(x)).length / segs.length >= 0.6;
};
const VERB_END = /(합니다|됩니다|입니다|해요|돼요|니다|어요|아요|한다|된다|요)$/;
const isProductName = (s, productPart = true) => !!s && s.length <= 26 && !VERB_END.test(s) && !/[[\]]/.test(s) && (isProductText(s) || (productPart && PRODUCT_WORD.test(s) && s.split(/\s+/).length <= 4 && !/(시장|점유율|나라|흐름|트렌드|성장)/.test(s)));
// a card twin of a swap slot takes its mode only when it reads like an item itself ('Galaxy AI' · '55" · 터치' · 'MagicINFO 편성 스케줄')
const ITEM_HINT = /(Infinite AI|WindFree|AirDresser|Bespoke|비스포크|사이니지|키오스크|The Wall|비디오월|전자칠판|Flip Pro|갤럭시|Galaxy|탭\s?S\d|탭 액티브|엑스커버|XCover|스마트폰|모니터(?!링)|ViewFinity|Odyssey|호텔 TV|비즈니스 TV|에어컨|무풍|실외기|실내기|공기청정기|에어드레서|냉장고|세탁기|건조기|프로젝터|DVM|EHS|칠러|쇼케이스|카세트|\bLED\b)/;
const swapLike = (s, m) => {
  if (!s || s.length > 60 || VERB_END.test(s) || PLACEHOLDER.test(s) || SAMPLE_CUST.test(s)) return false;
  if (m === 'case') return CASE_CUSTS.has(s);
  const segs = s.replace(/^[※*·→\s]+/, '').replace(/^삼성\s*·\s*/, '').split(/\s*[·,+]\s*/).filter(Boolean);
  return segs.some((g) => isProductText(g) || ITEM_HINT.test(g) || SOL_RE.test(g) || /^\d{2,3}\s?("|”|인치|형)/.test(g) || SPEC_SEG.test(g));
};
const UNIT_ONLY = /^(%|%p|억 원|조 원|만 원|원|곳|개|명|대|실|층|분|초|시간|일|주|개월|년|배|건|점|개국|만 대|만 명|천 명|회|가지|단계|kWh|MWh|톤|㎡|평)$/;

function classify(f) {
  const l = META[f] || { f, p: f.startsWith('L_IND_') ? 'cover' : null };
  const { t, img } = SLOTS[f];
  const st = STATS[f];
  const nDecks = st ? st.decks.size : 0;
  const out = { t: {}, img: {} };
  const p = l.p, name = l.name || '';
  const solLayout = !!l.sol || /^L_VS_SOL_/.test(f) || /^L_(MGI|VXT|STP|BIT|LYN|KNX|KCP|DEX|CCH|HVC|SAC)_[IDS]/.test(f);
  const solScenario = /^L_[A-Z]{3}_S(_|$)/.test(f) || /^L_VS_SOL_/.test(f) || l.p2 === 'scenario';
  // Why Samsung — 삼성의 역량 · 서비스 · 브랜드 장은 전부 고정. 경쟁 비교 · 요구 대응처럼 고객마다 다른 장은 칸별로 판단
  const whyFixed = p === 'why' && !/(비교|경쟁|열위|요구|주장|레이더|반론)/.test(name);
  const closing = /^L_VS_END$|^L_SOL_15$/.test(f) || (p === 'closing' && /감사|THANK/i.test(t.map((x) => x.s).join(' ')));
  const divider = /^L_VS_DIV_R\d$/.test(f) || (p === 'cover' && /간지/.test(name));
  const cover = (p === 'cover' && /^표지/.test(name)) || /^L_IND_/.test(f);
  const caseSheet = p === 'case' && !/^L_PH_SO_/.test(f);
  const tocSlots = TOC_SLOTS && TOC_SLOTS[f] ? Object.fromEntries(Object.entries(TOC_SLOTS[f].t || {}).map(([k, v]) => [v, k])) : null;
  const tocImgs = TOC_SLOTS && TOC_SLOTS[f] ? Object.fromEntries(Object.entries(TOC_SLOTS[f].img || {}).map(([k, v]) => [v, k])) : null;
  // 구독 장(build/subs) — 내용이 구독 레지스트리(app/data/subscriptions.json)의 원문이라 칸 이름으로 정한다
  const subSlots = SUBS_SLOTS && SUBS_SLOTS[f] ? Object.fromEntries(Object.entries(SUBS_SLOTS[f].t || {}).map(([k, v]) => [v, k])) : null;
  const subImgs = SUBS_SLOTS && SUBS_SLOTS[f] ? Object.fromEntries(Object.entries(SUBS_SLOTS[f].img || {}).map(([k, v]) => [v, k])) : null;
  const productPart = /^(products|spec|bom|dss)$/.test(p || '');
  const valsOf = (i) => (st && st.t[i] ? [...st.t[i].keys()].filter(Boolean) : []);
  const varying = (i) => nDecks >= 4 && valsOf(i).length > 1;
  // slots whose sample values are product names → the product slots of this layout
  const prodSlots = new Set(t.filter((x) => { const v = valsOf(x.i); return nDecks >= 4 && v.length > 1 && v.filter(isProductName).length / v.length >= 0.6; }).map((x) => x.i));
  // co-varies with a product slot: each product keeps (almost) one value here
  const followsProduct = (i) => {
    if (!st || !prodSlots.size || prodSlots.has(i)) return false;
    for (const pi of prodSlots) {
      const by = new Map();
      for (const r of st.rows) if (r[pi] && r[i]) { const e = by.get(r[pi]) || new Set(); e.add(r[i]); by.set(r[pi], e); }
      if (by.size < 3) continue;
      // evidence: products that appear in 2+ sample slides keep the same value here
      const seen = new Map(); for (const r of st.rows) if (r[pi] && r[i]) seen.set(r[pi], (seen.get(r[pi]) || 0) + 1);
      const repeated = [...by.entries()].filter(([pv]) => (seen.get(pv) || 0) >= 2);
      if (repeated.length < 2) continue;
      const avg = repeated.reduce((a, [, e]) => a + e.size, 0) / repeated.length;
      if (avg <= 1.25) return true;
    }
    return false;
  };

  t.forEach((x, k) => {
    const s = x.s;
    if (!s) return;
    const sample = SAMPLE_CUST.test(s) || (l.sample && l.sample.length >= 3 && s.includes(l.sample));
    const ph = PLACEHOLDER.test(s);
    const headline = x.fs >= 26 && k <= 3;
    const vary = varying(x.i), distinct = valsOf(x.i).length;
    let mode = null, decided = false;
    if (subSlots && subSlots[x.i]) {
      // 눈썹 = 목차 번호 · 제목 · 현장 고민(PAIN) · 예산 금액(BUDGET [00]) = AI · 나머지(가치 · 품목 · 패키지 · 케어 · 조건 · 납부 · 혜택 · 절차 · FAQ) = 고정
      const n = subSlots[x.i]; decided = true;
      mode = n === 'eb' ? 'section' : (n === 'title' || (/_PAIN$/.test(f) && /^p[tle]\d$/.test(n)) || (/_BUDGET$/.test(f) && /^[ab]v\d$/.test(n))) ? null : 'fixed';
    } else if (tocSlots && tocSlots[x.i]) {
      const n = tocSlots[x.i]; decided = true;
      if (n === 'eb' || /^n[om]\d$/.test(n) || /^st\dn$/.test(n)) mode = 'section';
      else if (/^(nm|in|kw|kl|sn)\d/.test(n) && /TECH|JOURNEY/.test(f)) mode = 'solution';
      else if (/^(nm|md|sl|sv)\d/.test(n) && /SPEC/.test(f)) mode = 'product';
      else if (/^cn\d$/.test(n) && /BOM/.test(f)) mode = 'product';
      else if (/^h[0-4]$/.test(n) && /SUMMARY|CPMATRIX/.test(f)) mode = 'fixed';
      else if (/^(ax|ay)$/.test(n)) mode = 'fixed';
    } else if (isEyebrow(x, k) && !cover) { mode = 'section'; decided = true; }
    else if (divider) { mode = 'section'; decided = true; }
    else if (FIXED_WORDS.test(s)) { mode = 'fixed'; decided = true; }
    else if (cover) decided = true;
    else if ((closing || whyFixed) && !sample) { mode = 'fixed'; decided = true; }
    else if (caseSheet) {
      // 도입사례 장: 사례 내용은 사례 DB에서만 — 라벨만 고정, 맨 위 제목은 AI가 우리 고객과 잇는다
      decided = true;
      if (ORDINAL.test(s) || LABELS.has(s) || (!vary && nDecks >= 4)) mode = 'fixed';
      else if (headline && !CASE_CUSTS.has(s) && !(vary && valsOf(x.i).some((v) => CASE_CUSTS.has(v)))) mode = null;
      else mode = 'case';
    }
    if (!decided && vary) {
      // 샘플 덱마다 값이 다른 칸 — 제품을 따라가면 제품 교체, 사례 이름이면 사례 교체, 솔루션 장의 적게 변하는 기능 목록은 고정
      if (!headline && (prodSlots.has(x.i) || followsProduct(x.i))) mode = 'product';
      else if (valsOf(x.i).filter((v) => CASE_CUSTS.has(v)).length / distinct >= 0.5) mode = 'case';
      else if (solLayout && !headline && distinct < nDecks * 0.5 && !sample && !ph) mode = 'fixed';
    }
    if (!decided && mode == null) {
      // 고정 라벨 — 샘플 덱에서 늘 같은 값 · 구조 라벨 · 16업종 변형에서 같은 글 · 여러 장에 쓰이는 짧은 라벨 (샘플마다 바뀌는 칸은 제외)
      if (!vary && st && nDecks >= 4 && !sample && !ph && !headline) mode = 'fixed';
      else if (UNIT_ONLY.test(s)) mode = null; // 단위는 AI가 쓰는 값과 함께 바뀐다
      else if (!vary && (ORDINAL.test(s) || LABELS.has(s))) mode = 'fixed';
      else if (!vary && famSame(f, x.i, s) && !sample && !ph && s.length <= 40 && !headline) mode = 'fixed';
      else if (isProductName(s, productPart) && !headline) mode = 'product';
      else if (isSpec(s) && productPart) mode = 'product';
      else if (!vary && s.length <= 10 && (LABEL_FREQ.get(s) || 0) >= 4 && !sample && !ph && !/\d/.test(s)) mode = 'fixed';
      else if (solLayout && !sample && !ph && !vary) {
        // 솔루션 전용 장: 솔루션 이름 · 설명 · 기능 = 고정. 시나리오 장의 고객 장면 · 제목은 AI
        const scene = solScenario && (headline || (VERB_END.test(s) && s.length > 24));
        if (!scene) mode = 'fixed';
      } else if (SOL_RE.test(s) && s.length <= 28 && p === 'solution' && !headline) mode = 'solution';
    }
    if (mode === 'product' && sample) mode = null; // 샘플 고객이 들어간 칸은 AI
    if (mode) out.t[x.i] = mode;
  });
  // a short label in the same small box as a product spec value goes with the product ('500' + 'nit 밝기')
  for (const x of t) {
    if (!productPart || out.t[x.i] || !x.s || x.s.length > 10 || /·/.test(x.s) || VERB_END.test(x.s) || x.g < 0) continue;
    const mates = t.filter((y) => y !== x && y.g === x.g);
    if (!mates.length || mates.length > 2) continue;
    const joined = [x, ...mates].sort((a, b) => a.i - b.i).map((y) => y.s).join(' ');
    if (mates.some((y) => out.t[y.i] === 'product') || SPEC_SEG.test(joined)) { out.t[x.i] = 'product'; for (const y of mates) if (!out.t[y.i]) out.t[y.i] = 'product'; }
  }

  // parallel cards: the same kind of short slot in every card takes the swap mode its twins already have
  const bySig = new Map();
  for (const x of t) if (x.s && x.sig) { const g = bySig.get(x.sig) || []; g.push(x); bySig.set(x.sig, g); }
  for (const g of bySig.values()) {
    if (g.length < 2 || g.length > 6 || g.some((y) => y.s.length > 60 || VERB_END.test(y.s))) continue;
    const modes = g.map((y) => out.t[y.i]).filter(Boolean);
    if (!modes.length || modes.some((m) => m !== modes[0]) || !/^(product|solution|case)$/.test(modes[0]) || modes.length * 3 < g.length) continue;
    const same = new Set(g.filter((y) => out.t[y.i]).map((y) => y.s));
    for (const y of g) if (!out.t[y.i] && !(l.sample && l.sample.length >= 3 && y.s.includes(l.sample)) && ((same.has(y.s) && !PLACEHOLDER.test(y.s) && /[A-Za-z가-힣]/.test(y.s)) || swapLike(y.s, modes[0]))) out.t[y.i] = modes[0];
  }

  img.forEach((x) => {
    const stat = st && st.img[x.i];
    const distinct = stat ? stat.size : 0;
    const cut = x.kind === 'cut' || /^cut\.|^(qm55c|km24c|oh55a|ac360)\b/.test(x.pid) || /img\/fill\/cut\.json|img\/prod\/|(^|\/)p-[\w-]+\.png|-front\.png|-persp\.png/.test(x.src) || /제품 (컷|사진|정면|이미지)/.test(x.hint);
    const ui = x.kind === 'ui' || /^ui\./.test(x.pid) || /img\/fill\/ui\.json/.test(x.src) || (/(화면|UI|대시보드|콘솔|앱)/.test(x.hint) && !/화면을 보는/.test(x.hint));
    let mode = null;
    if (subImgs && subImgs[x.i]) {
      // 구독 품목 · 패키지 제품 컷 · 케어 단계 · 혜택 품목 사진 = 고정, 대표 · 장면 사진은 AI가 고른다
      mode = /^(p\d|p\d_\d|pk\d)$/.test(subImgs[x.i]) || /_(ITEMS|PROMO|CARE4)$/.test(f) ? 'fixed' : null;
    } else if (tocImgs && tocImgs[x.i]) {
      const n = tocImgs[x.i];
      if (/^(ki|fi)\d/.test(n)) mode = 'solution';
      else if (/^ci\d/.test(n)) mode = 'product';
      else if (/^ic\d/.test(n)) mode = 'fixed';
    } else if (closing || whyFixed) mode = 'fixed';
    else if (x.kind === 'icon' || /로고|logo|QR|아이콘/i.test(x.hint)) mode = 'fixed';
    else if (st && nDecks >= 4 && distinct === 1) mode = 'fixed';
    else if (cut) mode = 'product';
    else if (caseSheet) mode = 'case';
    else if (ui) mode = solLayout ? 'fixed' : 'solution';
    if (mode) out.img[x.i] = mode;
  });
  const nT = t.filter((x) => x.s).length;
  const counts = { fixed: 0, product: 0, solution: 0, case: 0, section: 0 };
  for (const m of Object.values(out.t)) counts[m]++;
  const ai = nT - Object.values(counts).reduce((a, b) => a + b, 0);
  return { ...out, n: nT, ai, counts };
}

const order = Object.keys(SLOTS).sort();
const CLS = Object.fromEntries(order.map((f) => [f, classify(f)]));
// 같은 레이아웃 묶음(layout_variants.json) — 칸 구분은 묶음 하나에 하나. 후보(업종판)마다 글이 다른 칸은 '후보 선택'(pick):
// 업종마다 정해진 글이라 AI가 새로 쓰지 않고, 고른 업종의 후보 값을 쓴다. 제품 · 솔루션 · 사례 칸은 그대로 교체, AI 칸은 AI.
const SWAP = /^(product|solution|case)$/;
const most = (xs) => { const c = new Map(); for (const x of xs) c.set(x, (c.get(x) || 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0]; };
// members: 후보마다의 칸 구분 · ev: 그 후보에 샘플 덱 근거가 있는가 (근거 없는 후보의 'AI'는 표로 세지 않는다)
function mergeModes(members, ev, ids, vary, ai) {
  const out = {};
  for (const i of ids) {
    const ms = members.map((m) => m[i] || null);
    let mode;
    const swaps = ms.filter((m) => m && SWAP.test(m));
    if (swaps.length) mode = most(swaps);
    else if (!vary.has(+i)) mode = ms[0];
    else if (ms.includes('section')) mode = 'section';
    else if (ai && ai(+i)) mode = null; // 제목 · 샘플 고객 이름 · [00] — 고객마다 새로 쓴다
    else {
      const fixed = ms.filter((m) => m === 'fixed').length, free = ms.filter((m, k) => m === null && ev[k]).length;
      mode = fixed && fixed >= free ? 'pick' : null;
    }
    if (mode) out[i] = mode;
  }
  return out;
}
for (const g of Object.values(VARIANTS)) {
  const mem = g.members.map(([f]) => f).filter((f) => CLS[f]);
  if (mem.length < 2) continue;
  const tIds = [...new Set(SLOTS[mem[0]].t.filter((x) => x.s).map((x) => String(x.i)))];
  const iIds = [...new Set(SLOTS[mem[0]].img.map((x) => String(x.i)))];
  const ev = mem.map((f) => !!(STATS[f] && STATS[f].decks.size >= 4));
  const texts = mem.map((f) => Object.fromEntries(SLOTS[f].t.map((x) => [x.i, x])));
  const aiOnly = (i) => texts.some((tx) => { const x = tx[i]; return x && (SAMPLE_CUST.test(x.s) || PLACEHOLDER.test(x.s) || (x.fs >= 26 && x.y <= 160)); });
  const t = mergeModes(mem.map((f) => CLS[f].t), ev, tIds, new Set(g.vary.t), aiOnly);
  const img = mergeModes(mem.map((f) => CLS[f].img), ev, iIds, new Set(g.vary.img), null);
  const counts = { fixed: 0, product: 0, solution: 0, case: 0, section: 0, pick: 0 };
  for (const m of Object.values(t)) counts[m]++;
  const n = CLS[mem[0]].n, ai = n - Object.values(counts).reduce((a, b) => a + b, 0);
  for (const f of mem) CLS[f] = { t, img, n, ai, counts };
}
const result = {};
for (const f of order) {
  const c = CLS[f];
  const enc = (o) => { const g = {}; for (const [i, m] of Object.entries(o)) (g[m] = g[m] || []).push(+i); for (const m of Object.keys(g)) g[m].sort((a, b) => a - b); return g; };
  const e = { ...enc(c.t) };
  const im = enc(c.img);
  if (Object.keys(im).length) e.img = im;
  // 장 성격: 전부 고정 · 고정 + 교체(후보 선택 포함)만 · AI 칸 적음 · AI 위주
  e.lock = c.ai === 0 ? (Object.values(c.t).every((m) => m === 'fixed' || m === 'section') ? 'fixed' : 'data') : (c.ai <= Math.max(1, Math.round(c.n * 0.2)) ? 'mostly' : 'ai');
  result[f] = e;
}
const doc = {
  version: 1,
  generator: 'app/scripts/layout_slot_modes.mjs',
  modes: { fixed: '고정', product: '제품 교체', solution: '솔루션 교체', case: '사례 교체', pick: '후보 선택', section: '목차 번호', ai: 'AI 작성' },
  layouts: result,
};
const text = JSON.stringify(doc, null, 0).replace(/("L_[A-Za-z0-9_]+":)/g, '\n$1') + '\n';
const argv = process.argv.slice(2);
if (argv.includes('--check')) {
  const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (now !== text) { console.error('✗ slot_modes.json 이 입력과 다릅니다 — node app/scripts/layout_slot_modes.mjs'); process.exit(1); }
  console.log('✓ slot_modes.json 최신'); process.exit(0);
}
fs.writeFileSync(OUT, text);
const tally = { fixed: 0, data: 0, mostly: 0, ai: 0 };
for (const e of Object.values(result)) tally[e.lock]++;
console.log(`✓ ${path.relative(ROOT, OUT)} — 레이아웃 ${order.length}장 · 전부 고정 ${tally.fixed} · 고정+교체만 ${tally.data} · AI 칸 적음 ${tally.mostly} · AI 위주 ${tally.ai}`);

if (argv.includes('--report')) {
  const active = new Set(Object.values(META).filter((l) => l.f).map((l) => l.f));
  const canonOf = {}; for (const [c, g] of Object.entries(VARIANTS)) for (const [f] of g.members) canonOf[f] = c;
  const lines = ['# 레이아웃 칸별 고정 / 교체 / AI 분류', '', '| 레이아웃 | 이름 | 목차 | 성격 | 고정 · 목차 | 교체 | 후보 선택 | AI | 같은 레이아웃 |', '|---|---|---|---|---|---|---|---|---|'];
  for (const f of order) {
    if (!active.has(f)) continue;
    const l = META[f], e = result[f], c = CLS[f];
    const sw = c.counts.product + c.counts.solution + c.counts.case;
    lines.push(`| ${f} | ${(l.name || '').replace(/\|/g, '/')} | ${l.p || ''} | ${e.lock} | ${c.counts.fixed + c.counts.section} | ${sw} | ${c.counts.pick || 0} | ${c.ai} | ${canonOf[f] && canonOf[f] !== f ? '→ ' + canonOf[f] : canonOf[f] ? '대표' : ''} |`);
  }
  const rep = path.join(ROOT, 'output', 'layout-slot-modes.md');
  fs.mkdirSync(path.dirname(rep), { recursive: true });
  fs.writeFileSync(rep, lines.join('\n') + '\n');
  console.log('  보고서', path.relative(ROOT, rep));
}
