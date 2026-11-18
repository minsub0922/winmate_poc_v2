// 파트(목차 = Storyboard 버블) 하나가 덱에서 어떤 장으로 이뤄지는지 — 모든 구성 × 모든 업종 덱을 조립해 모아 본다.
//   관리자 「레이아웃 구성 관리」의 '전체 파트 확인하기' 팝업이 쓴다(layout-parts.jsx). 화면 없이 계산만 하므로 node 테스트도 그대로 부른다.
//   흐름의 종류는 손으로 적지 않고 덱에서 잰다 — 목차 · 장 구조가 바뀌면 표시도 따라 바뀐다.
//     fixed     완전 고정: 장 · 순서 · 장 수 · 내용이 모든 덱에서 같다(꼬리말 · 쪽 번호 · 장 번호만 바뀐다) — Why Samsung
//     flow      순서 고정: 장 · 순서 · 장 수가 같고 업종마다 내용만 바뀐다 — AI {업종}(니즈 → 가치 제안 1 · 2 · 3) …
//     repeat    순서 고정 · 장 수만 달라짐: 같은 장이 무엇의 수만큼 이어진다 — 공간별 제안(제품 수) · 솔루션(솔루션 수) …
//     template  구성마다 다름: 구성마다 고른 장을 쓰고, 같은 구성 안에서는 늘 같다 — 당사의 이해(잰 값. 목록에서는 업종 묶음마다 항목 · 장을 따로 정했다 — sector)
//     free      정해진 흐름 없음: 같은 구성 안에서도 업종(가치 구성)에 따라 장이 달라진다 — Value Prop 상세
// 같은 자리에서 칸 수만 다른 장(간지 R1–R6 · 조감도 S3–B10 · Map 3–10 …)은 한 장으로 묶어 '모양 n종'으로 센다.
import { SPACE_SHEET, SPACE_MAP, spaceSheetId, spaceMapId, spaceSheetPlan, spaceMapPlan, spaceMapRows, spaceMapLabel, spacePartSheets, spaceSplitLabel, spaceSheetUsedFor } from '../../../app/web/src/domain/templates/space_sheet_plan.js';
import { mapCardCapacity } from '../../../app/web/src/domain/templates/space_map_sheet.js';
import { SPEC_MAX, specSheetRanges } from '../../../app/web/src/domain/templates/spec_sheet_plan.js';
import { SERVICE_BRANCHES, branchOf } from '../../../app/web/src/domain/templates/service_branches.js';
import { SCN, scnSetId, scnMapId, scenarioRouteTables } from '../../../app/web/src/domain/templates/scenario_plan.js';

const FAMILY = [
  [/^L_VS_SPACE(_\d)?$/, 'L_VS_SPACE'], // 공간별 대표 제품 — 제품 1 · 2 · 3 · 4개 장(space_sheets.py)도 같은 자리
  [/^L_VS_DIV_R\d$/, 'L_VS_DIV'], [/^L_VS_BIRD_[SB]\d+$/, 'L_VS_BIRD'], [/^L_VS_MAP_\d+(_[0-9x-]+)?$/, 'L_VS_MAP'], [/^L_VS_SOL_[A-Z0-9]+$/, 'L_VS_SOL'],
  [/^L_TOC_TECH\d$/, 'L_TOC_TECH'], [/^L_TOC_BOM\d$/, 'L_TOC_BOM'], [/^L_TOC_JOURNEY\dS?$/, 'L_TOC_JOURNEY'], [/^L_SUB_PKG\d$/, 'L_SUB_PKG'],
  [/^L_TOC_SCN_S\d$/, 'L_TOC_SCN_S'], [/^L_TOC_SCN_MAP\d+$/, 'L_TOC_SCN_MAP'], // 고객/공간 시나리오 — 공간별 시나리오(공간 3 · 2곳) · 활용 맵(공간 2–10곳)
];
export const familyOf = f => (FAMILY.find(([re]) => re.test(f)) || [null, f])[1];
/** 같은 묶음 안 장 순서 — 칸 수 차례(S3 · S4 … B10) */
const byShape = (a, b) => a.localeCompare(b, 'en', { numeric: true });
/** 같은 장이 이어질 때 — 무엇의 수만큼 */
export const REPEAT_BY = { L_VS_SPACE: '제품 수', L_VS_SOL: '솔루션 수', L_TOC_JOURNEY: '여정 수', L_VS_CASE: '사례 수', L_TOC_SCN_S: '공간 묶음 수' };
// 파트마다 다른 경우 — Value Prop 상세의 공간별 제품 장은 제품 하나가 놓이는 대표 공간마다 한 장
const PART_REPEAT_BY = { vpd: { L_VS_SPACE: '대표 공간 수' } };
const repeatBy = (key, fam) => (PART_REPEAT_BY[key] && PART_REPEAT_BY[key][fam]) || REPEAT_BY[fam] || '';
/** 같은 자리에서 모양(칸 수)만 바뀌는 장 — 무엇에 맞춰 고르나 */
export const SHAPE_BY = { L_VS_DIV: '다루는 항목 수(목록 줄 수)', L_VS_BIRD: '공간 수 · 공간 조감도 / 건물 조감도', L_VS_MAP: '공간 수', L_TOC_TECH: '솔루션 수', L_TOC_BOM: '공간 수',
  L_TOC_JOURNEY: '여정이 지나는 공간 수 · 솔루션 수', L_SUB_PKG: '패키지 품목 수', L_VS_SOL: '솔루션마다 정해진 장', L_TOC_SCN_S: '묶음의 공간 수(3 · 2)', L_TOC_SCN_MAP: '공간 수' };
export const KIND = {
  fixed: { label: '완전 고정', note: '장 · 순서 · 내용까지 모든 업종에서 같아요. 꼬리말 · 쪽 번호만 바뀝니다.' },
  // 잰 값이 아니라 파트 목록 정의(PART_CATALOG.industry)가 정한다 — 업종 묶음마다 레이아웃 · 내용이 정해진 고정 시트(Overview)
  industry: { label: '업종별 고정', note: '업종마다 정해 둔 시트를 그대로 써요. 레이아웃 · 내용은 업종마다 다르고, 내용을 채우거나 고치지 않습니다.' },
  // 파트 목록 정의(PART_CATALOG.sector)가 정한다 — 업종 묶음마다 다루는 항목과 장이 통째로 다른 파트(당사의 이해)
  sector: { label: '업종마다 다름', note: '업종 묶음마다 다루는 항목과 장이 달라요. 같은 묶음 안에서는 장과 순서가 정해져 있고, 내용은 고객사마다 채웁니다.' },
  flow: { label: '순서 고정', note: '장과 순서가 정해져 있어요. 업종마다 내용만 바뀝니다.' },
  repeat: { label: '순서 고정 · 장 수만 달라짐', note: '' },
  template: { label: '구성마다 다름', note: '구성마다 고른 장을 이 순서로 써요. 같은 구성 안에서는 늘 같습니다.' },
  free: { label: '정해진 흐름 없음', note: '같은 구성 안에서도 업종마다 쓰는 장과 순서가 달라져요.' },
  // 파트 목록 정의(PART_CATALOG.branched)가 정한다 — 고른 서비스에 따라 갈래의 장만 들어가는 파트(서비스 제안: 삼성케어플러스 SAC · 비즈니스 · 구독 상품, 2026-11-17)
  branch: { label: '고른 서비스에 따라', note: '고른 서비스(케어 · 구독)에 맞는 갈래의 장만 들어가요. 갈래 안의 장과 순서는 정해져 있습니다.' },
};
export const KIND_ORDER = ['fixed', 'industry', 'sector', 'branch', 'flow', 'repeat', 'template', 'free'];
/** 장과 순서가 정해진 흐름 — 장에 차례 번호를 붙인다 */
export const ORDERED = new Set(['fixed', 'industry', 'sector', 'branch', 'flow', 'repeat']);

/** 사진 겹침 방지로 바꾼 사진(scenario_image_swaps.json) → 원래 사진 — '레이아웃|칸|바꾼 주소' → 원래 주소 */
function swapBack(SWAPS) {
  const back = new Map();
  for (const pages of Object.values((SWAPS && SWAPS.swaps) || {})) for (const slots of Object.values(pages)) for (const [slot, x] of Object.entries(slots)) {
    if (x && x.from && x.to && x.to.src) back.set(`${x.f}|${slot}|${x.to.src}`, x.from);
  }
  return back;
}
/** 장 내용 — 덱마다 바뀌는 꼬리말(고객사 · 덱 이름) · 쪽 번호 · 장 번호는 빼고, 겹침 방지로 바꾼 사진은 원래 사진으로 견준다.
 *  → { key, swapped } (swapped: 바꾼 사진을 되돌렸다) */
function contentOf(f, o, cust, back) {
  if (!o) return { key: '', swapped: false };
  const t = {};
  for (const [k, v] of Object.entries(o.t || {})) {
    const s = typeof v === 'string' ? v : v && typeof v === 'object' && typeof v.html === 'string' ? v.html : JSON.stringify(v);
    if (/^CONFIDENTIAL · \d+$/.test(s) || (cust && s.includes(cust))) continue;
    t[k] = s.replace(/^\d{2} · /, '');
  }
  let swapped = false;
  const img = Object.fromEntries(Object.entries(o.img || {}).map(([k, v]) => {
    const src = v && v.src; const from = src && back.get(`${f}|${k}|${src}`);
    if (from) swapped = true;
    return [k, from || src];
  }));
  return { key: JSON.stringify([t, img]), swapped };
}

/** 덱 하나에서 파트마다 장 목록 — [{ key, sheets: [{ f, role, o }] }] (표지 · 목차 장은 뺀다) */
function partsOfDeck(T, s, fills) {
  const out = []; let no = 0; let k = 0;
  for (const g of s.flow) {
    const front = !!g.deck || g.key === 'open';
    const key = front ? null : T.tocs[no]; if (!front) no += 1;
    const sheets = [];
    for (const x of g.slides) { if (key && x.f !== 'L_VS_TOC') sheets.push({ f: x.f, role: x.role, o: fills ? fills[k] : null }); k += 1; }
    if (key) out.push({ key, sheets });
  }
  return out;
}
/** 이어지는 같은 장을 묶는다 — [{ fam, fs: [f …] }] */
function runsOf(sheets) {
  const runs = [];
  for (const x of sheets) { const fam = familyOf(x.f); const last = runs[runs.length - 1]; if (last && last.fam === fam) last.fs.push(x.f); else runs.push({ fam, fs: [x.f], roles: [] }); runs[runs.length - 1].roles.push(x.role); }
  return runs;
}

/**
 * 모든 파트의 흐름 — toc: toc_templates.js 모듈(콘텐츠 로드 뒤),
 *   fills: { FILLS, FILL_CUSTOMER }(scenario_fills.js — 없으면 '완전 고정'을 재지 않는다) + SWAPS(scenario_image_swaps.json — 겹침 방지로 바꾼 사진을 되돌려 견준다)
 * → [{ key, name, type, goal, kind, swapped, tpls: [id], decks, sheets: { min, max }, rep: { tid, vid }, slots: [{ fam, f, fs: [f …], n: { min, max }, repN, step, tpls, roles, by, shape, fixed, swapped }] }]
 *   slot.fixed: 그 장의 내용이 모든 덱에서 같다(장 단위 내용 고정 — 파트가 완전 고정이 아니어도) · swapped: 겹침 방지로 사진만 바뀐 업종 수(파트 값은 완전 고정일 때만)
 */
export function partFlows(toc, fills = {}, repV = 'fb_qsr') {
  const verts = toc.tocVerticals();
  const order = [repV, ...verts.map(v => v.id).filter(id => id !== repV)];
  const acc = new Map(); // key → { tpls:Set, decks:[{ tid, vid, runs, sheets, cust }] }
  for (const T of toc.TOC_TEMPLATES) {
    for (const vid of order) {
      let s = null;
      try { s = toc.ensureTocScenario(T.id, vid); } catch (e) { s = null; }
      if (!s) continue;
      const F = fills.FILLS && fills.FILLS[s.id]; const cust = fills.FILL_CUSTOMER && fills.FILL_CUSTOMER[s.id];
      for (const p of partsOfDeck(T, s, F)) {
        const a = acc.get(p.key) || { tpls: new Set(), decks: [] };
        a.tpls.add(T.id); a.decks.push({ tid: T.id, vid, sheets: p.sheets, runs: runsOf(p.sheets), cust });
        acc.set(p.key, a);
      }
    }
  }
  const back = swapBack(fills.SWAPS);
  const keys = Object.keys(toc.TOCS).filter(k => acc.has(k));
  return keys.map(key => {
    const { tpls, decks } = acc.get(key); const TOC = toc.TOCS[key];
    const pat = d => d.runs.map(r => r.fam).join(' ');
    const patterns = new Set(decks.map(pat));
    const byTpl = new Map(); for (const d of decks) byTpl.set(d.tid, (byTpl.get(d.tid) || new Set()).add(pat(d)));
    const rep = decks[0];
    const lens = decks.map(d => d.sheets.length);
    const base = { key, name: TOC.name, type: TOC.type, goal: TOC.goal, tpls: [...tpls], decks: decks.length, sheets: { min: Math.min(...lens), max: Math.max(...lens) }, rep: { tid: rep.tid, vid: rep.vid },
      ...(TOC.custom ? { custom: true, look: TOC.look } : {}) }; // 관리자가 직접 만든 파트(「구성 추가하기」) — 고른 색 · 아이콘
    // 장(레이아웃)마다 내용이 고정인가 — 이 파트의 모든 덱에서 그 레이아웃의 장 내용이 하나뿐이면 고정.
    //   간지는 장 번호 · 쪽 · 다루는 것 목록이 늘 바뀌므로 고정으로 세지 않는다. 겹침 방지로 사진만 바뀐 업종(swaps)은 따로 센다.
    const contents = new Map(); // f → { keys: Set, swaps: Set(vid) }
    if (fills.FILLS) for (const d of decks) for (const y of d.sheets) {
      if (familyOf(y.f) === 'L_VS_DIV') continue;
      const e = contents.get(y.f) || { keys: new Set(), swaps: new Set() };
      const c = contentOf(y.f, y.o, d.cust, back); e.keys.add(c.key); if (c.swapped) e.swaps.add(d.vid);
      contents.set(y.f, e);
    }
    const fixedOf = fs => !TOC.custom && !!fills.FILLS && fs.length > 0 && fs.every(f => contents.has(f) && contents.get(f).keys.size === 1);
    const swapsOf = fs => new Set(fs.flatMap(f => (contents.has(f) ? [...contents.get(f).swaps] : []))).size;
    if (patterns.size === 1) {
      const slots = rep.runs.map((r, i) => {
        const all = decks.map(d => d.runs[i]);
        const ns = all.map(x => x.fs.length); const fs = [...new Set(all.flatMap(x => x.fs))].sort(byShape);
        return { fam: r.fam, f: r.fs[0], fs, n: { min: Math.min(...ns), max: Math.max(...ns) }, repN: r.fs.length, step: i + 1, tpls: [...tpls], roles: r.roles, by: repeatBy(key, r.fam), shape: fs.length > 1 ? SHAPE_BY[r.fam] || '칸 수' : '',
          fixed: fixedOf(fs), swapped: swapsOf(fs) };
      });
      const varies = slots.some(x => x.n.min !== x.n.max);
      // 간지를 뺀 모든 장의 내용이 고정이고 장 수도 같으면 파트가 완전 고정
      const body = slots.filter(x => x.fam !== 'L_VS_DIV');
      const whole = !varies && body.length > 0 && body.every(x => x.fixed);
      return { ...base, kind: whole ? 'fixed' : varies ? 'repeat' : 'flow', swapped: whole ? swapsOf(body.flatMap(x => x.fs)) : 0, slots };
    }
    // 흐름이 하나가 아니다 — 쓰이는 장을 모아 덱 안 평균 자리 순서로 늘어놓는다
    const kind = [...byTpl.values()].every(set => set.size === 1) ? 'template' : 'free';
    const fams = new Map();
    for (const d of decks) d.runs.forEach((r, i) => {
      const e = fams.get(r.fam) || { fam: r.fam, fs: new Set(), pos: 0, seen: 0, tpls: new Set(), ns: [], roles: r.roles };
      r.fs.forEach(f => e.fs.add(f)); e.pos += d.runs.length > 1 ? i / (d.runs.length - 1) : 0; e.seen += 1; e.tpls.add(d.tid); e.ns.push(r.fs.length);
      fams.set(r.fam, e);
    });
    const slots = [...fams.values()].sort((a, b) => a.pos / a.seen - b.pos / b.seen).map(e => {
      const fs = [...e.fs].sort(byShape); const own = rep.runs.find(r => r.fam === e.fam);
      return { fam: e.fam, f: own ? own.fs[0] : fs[0], fs, n: { min: Math.min(...e.ns), max: Math.max(...e.ns) }, repN: own ? own.fs.length : 0, step: 0, tpls: [...e.tpls], roles: e.roles,
        uses: e.seen, by: repeatBy(key, e.fam), shape: fs.length > 1 ? SHAPE_BY[e.fam] || '칸 수' : '', fixed: fixedOf(fs), swapped: swapsOf(fs) };
    });
    return { ...base, kind, slots };
  });
}

/* ---------------- 전체 파트 목록(카탈로그) — 잰 흐름 위에 얹는 정의 (사용자 지시 2026-11-16) ----------------
   '전체 파트 확인하기' 팝업은 잰 흐름(partFlows) 그대로가 아니라 이 정의를 거친 목록을 보여 준다.
   지금은 **목록만** 정리한다 — 추천 구성 · 실제 덱 · 장 내용은 그대로다(목록에서 뺀 목차도 추천 구성에서는 아직 쓰인다).
     1) hidden     목록에서 뺀 목차
     2) names      목록에서 쓰는 이름(사용자 지시 2026-11-16) — Overview → 제안 개요 · 당사의 이해 → 시장 분석 (MI) · AI {업종} → 가치 제안 (VP) · 공간별 가치 제안 → 고객/공간 시나리오
                   · {업종} 솔루션 → 솔루션 제안 · 도입사례 → 유관 사례 · Spec → 제품 스펙 · 구독 솔루션 → 구독 상품 제안. 관리자 화면(이 목록 · 추천 구성 버블 · 구성 만들기)은 이 이름을 쓴다.
                   목록에만 있는 새 장의 눈썹 글도 같은 이름(build/toc/ua/kit.py · build/toc/gen_spec_sheets.py). 앱의 목차 이름(toc_templates.js TOCS)과 실제 덱은 아직 옛 이름이다
     3) unlimited  장 수를 한정하지 않는 장 — 사례 장(샘플 덱은 늘 2건이지만 사례 수만큼 늘린다)
     4) merged     여러 목차를 한 파트로 — 구독: 고민 → 효과 → 비교 → 제품 묶음 → 케어 1 → 케어 2 → 구독 조건 → 결제 (그 밖의 구독 장은 뺀다)
                   zero: 숫자를 00 으로 고정해 보여 주는 장(작성자가 직접 입력) — 케어 2 · 구독 조건 · 결제. 이 장들은 전체 내용도 고정이다
                   fixed: 내용을 고정으로 정한 장 — 비교. (잰 값으로 이미 내용이 같은 장은 정의 없이도 고정으로 표시된다: 케어 1 …)
     5) routed     제품 수에 따라 시트를 골라 쓰는 장 — 공간별 제안의 「공간별 대표 제품」: 제품 1 · 2 · 3 · 4개 장을 제품 수에 맞춰 나눠 쓰고
                   (3개 이하 한 장씩 · 4개 2/2 · 5개 3/2 · 6개 3/3 · 7개 4/3 · 8개 4/4), 8개를 넘으면 조감도부터 다시 시작한다(space_sheet_plan.js).
                   목록은 라우팅과 상관없이 시트 4종을 모두 보여 준다. bird: 묶음마다 다시 나오는 조감도 장
                   map: 공간 수에 맞는 시트를 골라 쓰는 업종 Map — 공간 2~8곳(L_VS_MAP_2 … 8) 7종. 1곳이면 두지 않고, 8곳을 넘으면 조감도 묶음마다 한 장
                        공간마다 제품을 하나 이상 놓고, 제품 수에 따라 카드 크기 · 배치가 달라진다(space_map_sheet.js — 장 이름은 'L_VS_MAP_5_4-2-3x-1-2'처럼 칸마다 카드 수가 붙는다)
     6) industry   업종별 고정 시트를 쓰는 파트 — Overview: 업종마다 쓰는 제품 · 솔루션이 크게 달라, 업종 묶음(외식 · 의료 · 교육 · 오피스 … 세부 업종은 한 묶음)마다
                   레이아웃(같은 계열 · 칸 수가 다름)과 내용이 정해진 시트 한 장을 그대로 쓴다. fam: 그 시트가 놓이는 장. 시트는 overview-sheets.json
                   (app/scripts/vertical_standard/overview_industry.py), 화면은 overview-industry.jsx — 파트 이름 오른쪽 드롭다운으로 업종을 고른다
     7) sector     업종 묶음마다 다루는 항목 · 장이 다른 파트 — 당사의 이해: 파트는 하나지만 업종에 따라 짚어야 할 것이 크게 달라, 업종을 크게 묶어
                   (병의원은 대형 · 중소형 · 의원 · 요양이 한 묶음, 학교와 오피스는 다른 묶음) 묶음마다 이해 항목을 따로 정하고 항목마다 새 장을 그렸다.
                   기존 당사의 이해 장(L_TOC_UAPROF …)은 쓰지 않는다. 항목 · 장은 ua-catalog.json(build/toc/gen_ua_catalog.py), 규칙은 ua-sectors.js,
                   화면은 ua-industry.jsx — 파트 이름 오른쪽 드롭다운으로 업종 묶음을 고르면 간지 + 그 묶음의 항목 장으로 카드가 통째로 바뀐다
     8) branched   고른 서비스에 따라 갈래가 나뉘는 파트 — 서비스 제안(사용자 지시 2026-11-17: "구독 상품 제안은 서비스 하위로 … 구독 상품 선택시 구독 상품 제안의 흐름이 나오도록"):
                   삼성케어플러스 SAC(케어 서비스 + 공조 제품) · 비즈니스(케어 서비스 + 갤럭시 모바일) · 구독 상품(구독 — 고민 → … → 결제). 실제 덱도 이 갈래로 조립한다
                   (toc_templates.js B.svc · part_catalog.js 변형). 구독 상품 제안(subx)은 목록에서 빠졌다(hidden — 구독 제안서는 아직 쓴다)
     9) scenario   공간 구성으로 시트를 고르는 파트 — 고객/공간 시나리오(사용자 지시 2026-11-17 · 2차): 조감도 → 활용 맵(솔루션 · 서비스 × 공간, 공간 2–10곳 시트) →
                   공간별 시나리오(공간 3곳씩 한 장 · 한 곳만 남지 않게 — 3곳 · 2곳 시트: 사진 + 제품 겹쳐 보기 · 통합 시나리오 · 아래 솔루션 · 서비스 고정 줄 + 기능 on/off).
                   규칙 scenario_plan.js · 실제 덱도 이 장으로 조립한다 */
// 구독 상품 제안의 장 — 고민 → 효과 → 비교 → 제품 묶음 → 케어 1 → 케어 2 → 구독 조건 → 결제(숫자 00 장은 내용도 고정). 2026-11-17 부터 서비스 제안의 구독 갈래
const SUB_SHEETS = [{ fam: 'L_SUB_PAIN', role: '고민' }, { fam: 'L_SUB_VALUE3', role: '효과', photos: { 1: { from: 'L_SUB_IND4', index: 3 } } }, { fam: 'L_SUB_COMPARE', role: '비교', fixed: true },
  { fam: 'L_SUB_PKG', role: '제품 묶음', photos: { 0: { from: 'L_SUB_IND4', index: 2 } } },
  { fam: 'L_SUB_CARE4', role: '케어 1' }, { fam: 'L_SUB_BLUEPASS', role: '케어 2', zero: true }, { fam: 'L_SUB_TERMS', role: '구독 조건', zero: true }, { fam: 'L_SUB_PAY3', role: '결제', zero: true }];
export const PART_CATALOG = {
  hidden: ['summary', 'effect', 'pilot', 'plan', 'rfp', 'spec', 'bom', 'vp', 'vpd', 'subone', 'subsol', 'tech', 'cost', 'subx'], // subx: 서비스 제안의 갈래로(2026-11-17)
  // 2026-11-17: 공간별 제안 → 제품 제안 · 서비스 → 서비스 제안
  names: { overview: '제안 개요', ua: '시장 분석 (MI)', needs: '가치 제안 (VP)', space: '제품 제안', value: '고객/공간 시나리오', sol: '솔루션 제안', case: '유관 사례', pspec: '제품 스펙', subx: '구독 상품 제안', svc: '서비스 제안' },
  // 목록에서 쓰는 파트 키 — 구독 솔루션은 목차 키가 subx 지만 목록에서는 처음 정한 이름(subscription)을 그대로 쓴다(파트 색 part-arc.js · 화면 검사가 이 키로 찾는다)
  keys: { subx: 'subscription' },
  unlimited: { case: ['L_VS_CASE'], pcase: ['L_VS_CASE'] },
  // 구독 솔루션 — 이제 실제 덱에서도 한 파트다(toc_templates.js subx: 고민 → 효과 → 비교 → 제품 묶음 → 케어 1 → 케어 2 → 구독 조건 → 결제, 숫자 00). 목록 정의는 장마다 구실 이름과 표식만 얹는다.
  merged: [], // 여러 목차를 한 파트로 보여 주던 정의 — 구독을 실제로 한 파트로 합친 뒤로는 비어 있다
  // sheets: 파트 → 장마다 { fam, role(구실 이름), zero(숫자 00 — 미리보기도 00 으로), fixed(내용 고정으로 정한 장), photos(예시 사진이 겹치는 자리에 쓸 사진) }
  //   photos: 장의 n번째 사진(0부터)을 다른 구독 장(from)의 index번째 사진으로 — 미리보기는 레이아웃 기본 사진이라 한 카드에 모으면 겹친다(한 카드에 같은 사진을 두 번 쓰지 않는다).
  //   효과의 '점검' 사진은 케어 1 '성능 점검'과 같은 사진 → 관리되는 사무 공간 사진, 제품 묶음의 공간 사진은 고민의 현장 사진과 같은 사진 → 객실 사진
  sheets: {
    subx: SUB_SHEETS,
    // 서비스 제안 — 삼성케어플러스 두 장 + 구독 상품 갈래(구독 상품 제안의 장 그대로)
    svc: [{ fam: 'L_TOC_SVC_SAC', role: '삼성케어플러스 SAC' }, { fam: 'L_TOC_SVC_MOBILE', role: '삼성케어플러스 비즈니스' }, ...SUB_SHEETS],
  },
  branched: { svc: SERVICE_BRANCHES },
  scenario: { value: { set: 'L_TOC_SCN_S', map: 'L_TOC_SCN_MAP' } },
  routed: { space: { fam: 'L_VS_SPACE', bird: 'L_VS_BIRD', map: 'L_VS_MAP', by: '제품 수', mapBy: '공간 수' } },
  industry: { overview: { fam: 'L_VS_DSS' } },
  sector: { ua: {} },
  // 제품 스펙(Spec) — 제품마다 한 장(× 제품 수) · 사양 줄 수에 맞는 시트 3종 · 위쪽 대표 스펙 3칸 없음 (spec_sheet_plan.js · specPart)
  spec: { pspec: { fam: 'L_TOC_PSPEC' } },
};
/**
 * 제품 스펙(Spec) 파트 (사용자 지시 2026-11-16) — 제품마다 사양 줄 수가 달라 줄 수에 맞는 시트를 골라 쓰고, 장은 제품마다 한 장, 위쪽 대표 스펙 3칸은 없다.
 *   잰 장(L_TOC_PSPEC: 숫자 3 + 사양 8줄 고정)의 자리에 새 시트 3종을 얹는다 — 화면은 '시트 여러 종' 표시(space-route.jsx RoutedSheets)를 그대로 쓴다.
 *   그 장: routed · sheetsOf 'spec'(미리보기 자료 — spec-route.js) · variants(시트 3종) · route(사양 줄 수 → 시트 표) · by '사양 줄 수' · times '제품 수' · n { min 1, max null }
 *   파트: spec · kind 'repeat'(순서 고정 · 장 수만 달라짐 — 제품 수만큼) · sheets { min 2, max null }. 실제 덱에는 아직 반영 전
 */
function specPart(p, R) {
  const at = p.slots.findIndex(x => x.fam === R.fam);
  if (at < 0) return p;
  const tiers = specSheetRanges();
  const shape = t => (t.cols === 1 ? '1열' : t.per * t.cols === t.cap && t.per <= 12 ? '2열' : '2열 · 촘촘하게');
  const variants = tiers.map(t => ({ f: t.f, per: t.cap, used: [t.cap], badge: `사양 ${t.cap}줄까지`, name: shape(t), when: `사양 ${t.from}–${t.to}줄`,
    holds: `제품 컷 + 사양 표 ${t.cols}열(열마다 ${t.per}줄까지) — 대표 스펙 칸 없음`, live: false, deck: '반영 전 — 지금은 숫자 3 + 사양 8줄 고정(TOC-PSPEC)' }));
  const route = { title: '사양 줄 수 → 시트', unit: '줄', rows: tiers.map(t => ({ n: `${t.from}–${t.to}`, label: shape(t), sheets: 1, birds: 1, pers: [t.cap] })),
    more: `${SPEC_MAX}줄을 넘으면 우선순위가 높은 ${SPEC_MAX}줄만` };
  const slots = p.slots.map((x, i) => (i === at ? { ...x, routed: true, sheetsOf: 'spec', variants, route, by: '사양 줄 수', times: '제품 수', n: { min: 1, max: null } } : x));
  const fixedCount = slots.filter(x => x.n.max !== null).reduce((n, x) => n + x.n.min, 0);
  // goal: 잰 목차의 한 줄(핵심 숫자와 사양을 한 장으로)은 대표 스펙 칸을 없앤 뒤로 맞지 않는다
  return { ...p, slots, spec: true, kind: 'repeat', sheets: { min: fixedCount + 1, max: null }, goal: '제품마다 한 장씩, 사양 줄 수에 맞는 시트로 사양을 보여 준다' };
}
/** 시트 한 종이 담는 것 — 제품 1개 장만 key message 가 있고, 스펙은 1 · 2개 장까지 */
const SPACE_HOLDS = {
  1: 'key message · 특징 2 · 주요 스펙 4 — 공간 사진 옆에 제품 컷',
  2: '특징 2 · 스펙 3 — 공간 사진 위에 제품 컷 (key message 없음)',
  3: '특징 2까지만 — 공간 사진 위에 제품 컷',
  4: '특징 2까지만 — 공간 사진 위에 제품 컷',
};
/** 제품 수 → 나눔 표 — 1~8 과 조감도를 나누는 첫 두 경우(9 · 10): [{ n, label, sheets, birds, pers }] */
export function spaceRouteTable() {
  const rows = [];
  for (let n = 1; n <= SPACE_SHEET.max + 2; n++) {
    const plan = spaceSheetPlan(n);
    rows.push({ n, label: spaceSplitLabel(n), sheets: plan.reduce((a, g) => a + g.sheets.length, 0), birds: plan.length, pers: [...new Set(plan.flatMap(g => g.sheets.map(x => x.per)))] });
  }
  return rows;
}
/** 공간 수 → Map 시트 표 — 1(없음) · 2~8 과 묶음마다 한 장이 되는 첫 두 경우(9 · 10): [{ n, label, sheets, birds, pers }] (pers: 쓰는 시트의 공간 수) */
export function spaceMapTable() {
  const rows = [];
  for (let n = 1; n <= SPACE_MAP.max + 2; n++) {
    const maps = spaceMapPlan(n);
    rows.push({ n, label: spaceMapLabel(n) || '없음', sheets: maps.length, birds: spaceSheetPlan(n).length, pers: [...new Set(maps.map(m => m.spaces))] });
  }
  return rows;
}
/**
 * 제품(공간) 수에 따라 시트를 골라 쓰는 파트 — 잰 흐름(제품마다 한 장 · Map 한 장)의 그 자리에 시트 n종을 얹는다. 잰 장(f · fs)은 그대로 둔다.
 *   공간별 대표 제품 장: routed · variants(제품 1 · 2 · 3 · 4개 장) · products { min, max }(덱에서 잰 제품 수) · n(그 범위에서 쓰는 장 수) · route(나눔 표)
 *   업종 Map 장: routed · variants(공간 2 … 8곳 시트) · n(그 범위에서 쓰는 장 수) · count(장 수 설명) · route(공간 수 → Map 시트 표)
 *   시트 한 종(variants): { f, per, used: [제품(공간) 수 …], badge, name, when, holds, live(지금 덱도 쓰는 시트인가), deck(실제 덱과의 사이) }
 *   route: { title, unit, rows: [{ n, label, sheets, birds, pers }], more }
 *   조감도 장: n 이 묶음 수 범위로 · split(조감도 하나가 맡는 제품 수) · count(장 수 설명)
 *   파트: routed · route(제품 나눔 표) · sheets(그 제품 수 범위에서 파트 전체 장 수)
 */
function routePart(p, R) {
  const at = p.slots.findIndex(x => x.fam === R.fam);
  if (at < 0) return p;
  const products = { ...p.slots[at].n };
  const counts = []; for (let n = products.min; n <= products.max; n++) counts.push(n);
  const plans = counts.map(n => spaceSheetPlan(n));
  const range = list => ({ min: Math.min(...list), max: Math.max(...list) });
  const variants = [];
  for (let per = 1; per <= SPACE_SHEET.per; per++) {
    const used = spaceSheetUsedFor(per);
    const when = per === 1 ? `제품 ${SPACE_SHEET.single}개 이하 — 제품마다 한 장` : '제품 ' + used.map(n => `${n}개(${spaceSplitLabel(n)})`).join(' · ');
    variants.push({ f: spaceSheetId(per), per, used, badge: `제품 ${per}개`, name: `제품 ${per}개 장`, when, holds: SPACE_HOLDS[per] || '', live: false, deck: '반영 전 — 지금은 제품마다 한 장(기존 시트)' });
  }
  const over = SPACE_SHEET.max + 1;
  const slots = p.slots.map((x, i) => {
    if (i === at) {
      return { ...x, routed: true, variants, products, by: R.by, n: range(plans.map(g => g.reduce((a, b) => a + b.sheets.length, 0))),
        route: { title: '제품 수 → 장 나눔', unit: '개', rows: spaceRouteTable(), more: `${over}개부터는 조감도도 나눠 다시 시작` } };
    }
    if (x.fam === R.bird) return { ...x, n: range(plans.map(g => g.length)), split: SPACE_SHEET.max, count: `보통 1장 · 제품이 ${SPACE_SHEET.max}개를 넘으면 묶음마다 1장` };
    if (R.map && x.fam === R.map) {
      const maps = [];
      for (let n = SPACE_MAP.min; n <= SPACE_MAP.max; n++) {
        // 공간마다 제품을 하나 이상 — 제품 수에 따라 카드 크기 · 배치가 달라지는 장(space_map_sheet.js 가 조립). cap: 칸 하나에 놓는 카드 수 상한(줄마다 칸 너비가 다르면 범위)
        const rows = spaceMapRows(n); const f = spaceMapId(n); const cap = mapCardCapacity(n); const most = cap.min === cap.max ? String(cap.max) : `${cap.min}–${cap.max}`;
        maps.push({ f, per: n, used: [n], rows, cap, badge: `공간 ${n}곳`, name: `공간 ${n}곳`, when: '',
          holds: (rows.length === 1 ? `한 줄 ${n}칸` : `두 줄 ${rows.join(' + ')}칸`) + ` — 칸마다 제품 카드 최대 ${most}개` + (rows.length === 1 ? ' · 하는 일' : ''),
          cards: `제품 수에 따라 크기 · 배치가 달라짐 — 칸마다 최대 ${most}개, 넘치면 '외 N종'`,
          live: false, deck: '반영 전 — 지금 덱은 공간마다 대표 제품 컷 하나 + 제품 목록 글' });
      }
      return { ...x, routed: true, variants: maps, by: R.mapBy || R.by, n: range(counts.map(n => spaceMapPlan(n).length)),
        count: `보통 1장 · 공간이 ${SPACE_MAP.max}곳을 넘으면 묶음마다 1장`,
        route: { title: '공간 수 → Map 시트', unit: '곳', rows: spaceMapTable(), more: `${over}곳부터는 조감도 묶음마다 한 장 · 1곳은 Map 없음` } };
    }
    return x;
  });
  return { ...p, slots, routed: true, route: spaceRouteTable(), sheets: range(counts.map(spacePartSheets)) };
}
/**
 * 고른 서비스에 따라 갈래가 나뉘는 파트(서비스 제안) — 장마다 branch(갈래 id), 파트에 branches([{ id, label, when, steps: [장 차례] }]) · kind 'branch'.
 *   장 수는 갈래를 하나만 고른 경우(가장 적은 갈래)부터 모두 고른 경우까지.
 */
function branchPart(p, list) {
  const slots = p.slots.map(x => ({ ...x, branch: branchOf(x.fam) }));
  const branches = list.map(b => ({ id: b.id, label: b.label, when: b.when, steps: slots.filter(x => x.branch === b.id).map(x => x.step) })).filter(b => b.steps.length);
  if (!branches.length) return p;
  const div = slots.filter(x => !x.branch).length;
  const sizes = branches.map(b => b.steps.length);
  return { ...p, kind: 'branch', slots, branches, sheets: { min: div + Math.min(...sizes), max: div + sizes.reduce((a, b) => a + b, 0) } };
}
/** 공간 구성으로 시트를 고르는 파트(고객/공간 시나리오) — 공간 한 장(제품 0–4)과 활용 맵(공간 2–10곳)의 자리에 시트 n종을 얹는다(실제 덱도 쓰는 시트 · live) */
function scenarioPart(p, R) {
  const T = scenarioRouteTables();
  const slots = p.slots.map(x => {
    if (x.fam === R.set) {
      const variants = [3, 2].map(m => ({ f: scnSetId(m), per: m, used: [m], badge: `공간 ${m}곳`, name: `공간 ${m}곳 장`,
        when: m === 3 ? '공간을 3곳씩 — 기본' : '나머지 2곳(4곳 → 2 + 2 · 7곳 → 3 + 2 + 2) · 공간이 2곳일 때',
        holds: `공간 사진 ${m} + 제품 컷 · 이름 겹쳐 보기(공간마다 ${SCN.cuts}개) · 공간마다 시나리오 → · 솔루션 · 서비스 ${SCN.useRows}줄 고정 + 기능 ${SCN.useIcons}칸 on/off`, live: true, deck: '쓰는 중 — 공간 3곳씩 한 장' }));
      return { ...x, routed: true, sheetsOf: 'scenario', variants, by: '묶음의 공간 수', times: '공간 묶음 수',
        route: { title: '공간 수 → 공간별 시나리오 장', unit: '곳', rows: T.sets, more: `한 곳만 쓰는 장은 없다 · 솔루션 · 서비스가 ${SCN.useRows}개를 넘으면 마지막 줄이 '그 밖에 N개'` } };
    }
    if (x.fam === R.map) {
      const variants = [];
      for (let n = SCN.mapMin; n <= SCN.mapMax; n++) variants.push({ f: scnMapId(n), per: n, used: [n], badge: `공간 ${n}곳`, name: `공간 ${n}곳`, when: '',
        holds: `솔루션 · 서비스 ${SCN.rows}줄 × 공간 ${n}칸 · 줄마다 쓰는 공간 수`, live: true, deck: '쓰는 중 — 공간 수에 맞는 한 장' });
      return { ...x, routed: true, sheetsOf: 'scenario', variants, by: '공간 수', count: `보통 1장 · 공간이 ${SCN.mapMax}곳을 넘으면 나눠 여러 장 · 1곳이면 없음`,
        route: { title: '공간 수 → 활용 맵', unit: '곳', rows: T.maps, more: `솔루션 · 서비스가 ${SCN.rows}개를 넘으면 여덟째 줄이 '그 밖에 N개'` } };
    }
    return x;
  });
  return { ...p, slots, scenario: true };
}
/** 목록의 파트 수 — 흐름을 재지 않고 센다(버튼 옆 숫자) */
export function catalogSize(toc, catalog = PART_CATALOG) {
  const used = Object.keys(toc.TOCS).filter(k => toc.TOC_TEMPLATES.some(t => t.tocs.includes(k)) && !catalog.hidden.includes(k));
  const mergedAway = catalog.merged.reduce((n, m) => n + Math.max(0, m.from.filter(k => used.includes(k)).length - 1), 0);
  return used.length - mergedAway;
}
/**
 * 잰 흐름(partFlows) → 목록 — { parts, hidden: [{ key, name, tpls }] }
 *   파트에 더해지는 값: title(목록 이름) · defined(잰 값이 아니라 정의한 구성 — 실제 덱에는 아직 반영 전) · dropped([fam] 합치며 뺀 장)
 *   장에 더해지는 값: role(정의한 구실 이름) · zero(숫자 00 고정) · fixed/fixedBy(내용 고정 — measured 잰 값 · defined 목록 정의) · photos(정해 둔 예시 사진) · n.max === null(장 수 제한 없음)
 *   제품 수에 따라 시트를 골라 쓰는 파트: 파트에 routed · route(나눔 표), 그 장에 routed · variants(시트 n종) — 실제 덱에는 아직 반영 전
 *   업종별 고정 시트를 쓰는 파트: kind 'industry' · 파트에 industry({ fam }), 그 장에 industry: true — 실제 덱에는 아직 반영 전
 *   업종 묶음마다 항목 · 장이 다른 파트: kind 'sector' · 파트에 sector — 장은 화면이 고른 묶음의 것으로 바꾼다(ua-sectors.js withSector). 실제 덱에는 아직 반영 전
 */
export function curateParts(flows, catalog = PART_CATALOG) {
  const by = Object.fromEntries(flows.map(p => [p.key, p]));
  const hidden = flows.filter(p => catalog.hidden.includes(p.key)).map(p => ({ key: p.key, name: p.name, tpls: p.tpls }));
  const mergedOf = key => catalog.merged.find(m => m.from.includes(key));
  const done = new Set(); const parts = [];
  for (const p of flows) {
    if (catalog.hidden.includes(p.key)) continue;
    const M = mergedOf(p.key);
    if (M) {
      if (done.has(M.key)) continue;
      done.add(M.key);
      const src = M.from.map(k => by[k]).filter(Boolean);
      const all = src.flatMap(x => x.slots);
      const div = all.filter(x => x.fam === 'L_VS_DIV');
      const tpls = [...new Set(src.flatMap(x => x.tpls))];
      const slots = [
        ...(div.length ? [{ ...div[0], fs: [...new Set(div.flatMap(x => x.fs))].sort(byShape), tpls, shape: SHAPE_BY.L_VS_DIV }] : []),
        // 내용 고정 — 잰 값이 고정이거나(fixedBy measured) 목록 정의가 고정으로 정한 장(defined: fixed · 숫자 00 인 장은 전체 내용도 고정)
        ...M.sheets.map(sh => { const x = all.find(y => y.fam === sh.fam); return x ? { ...x, n: { min: 1, max: 1 }, role: sh.role, zero: !!sh.zero, photos: sh.photos || null,
          fixed: !!x.fixed || !!sh.fixed || !!sh.zero, fixedBy: x.fixed ? 'measured' : sh.fixed || sh.zero ? 'defined' : '' } : null; }).filter(Boolean),
      ].map((x, i) => ({ ...x, step: i + 1 }));
      const kept = new Set(slots.map(x => x.fam));
      parts.push({ key: M.key, name: M.name, title: M.name, type: M.type, goal: M.goal, kind: 'flow', swapped: 0, tpls, decks: Math.max(...src.map(x => x.decks)),
        sheets: { min: slots.length, max: slots.length }, rep: src[0].rep, slots, defined: true, from: src.map(x => x.key), dropped: [...new Set(all.map(x => x.fam))].filter(f => !kept.has(f)) });
      continue;
    }
    let q = { ...p, key: (catalog.keys && catalog.keys[p.key]) || p.key, toc: p.key, title: catalog.names[p.key] || '' }; // key: 목록에서의 키 · toc: 실제 목차 키
    // 장마다 얹는 정의 — 구실 이름 · 숫자 00 · 내용 고정(잰 값이 고정이면 measured, 목록 정의가 정했으면 defined: fixed · 숫자 00 인 장은 전체 내용도 고정) · 예시 사진
    const defs = catalog.sheets && catalog.sheets[p.key];
    if (defs) q = { ...q, slots: q.slots.map(x => { const sh = defs.find(d => d.fam === x.fam);
      return sh ? { ...x, role: sh.role, zero: !!sh.zero, photos: sh.photos || null, fixed: !!x.fixed || !!sh.fixed || !!sh.zero, fixedBy: x.fixed ? 'measured' : sh.fixed || sh.zero ? 'defined' : '' } : x; }) };
    const free = catalog.unlimited[p.key];
    if (free && q.slots.some(x => free.includes(x.fam))) {
      const slots = q.slots.map(x => (free.includes(x.fam) ? { ...x, n: { min: 1, max: null }, by: x.by || '장 수' } : x));
      const fixedCount = slots.filter(x => x.n.max !== null).reduce((n, x) => n + x.n.min, 0);
      q = { ...q, slots, kind: q.kind === 'flow' || q.kind === 'fixed' ? 'repeat' : q.kind, sheets: { min: fixedCount + 1, max: null } };
    }
    if (catalog.routed && catalog.routed[p.key]) q = routePart(q, catalog.routed[p.key]); // 제품 수에 따라 시트를 골라 쓰는 장
    const I = catalog.industry && catalog.industry[p.key]; // 업종별 고정 시트 — 그 장(fam)이 있는 파트만
    if (I && q.slots.some(x => x.fam === I.fam)) q = { ...q, kind: 'industry', industry: I, slots: q.slots.map(x => (x.fam === I.fam ? { ...x, industry: true } : x)) };
    if (catalog.spec && catalog.spec[p.key]) q = specPart(q, catalog.spec[p.key]); // 제품 스펙 — 제품마다 한 장 · 사양 줄 수에 맞는 시트
    if (catalog.sector && catalog.sector[p.key]) q = { ...q, kind: 'sector', sector: catalog.sector[p.key] }; // 업종 묶음마다 항목 · 장이 다른 파트(당사의 이해)
    if (catalog.branched && catalog.branched[p.key]) q = branchPart(q, catalog.branched[p.key]); // 고른 서비스에 따라 갈래(서비스 제안)
    if (catalog.scenario && catalog.scenario[p.key]) q = scenarioPart(q, catalog.scenario[p.key]); // 공간 구성으로 시트를 고르는 장(고객/공간 시나리오)
    parts.push(q);
  }
  return { parts, hidden };
}
