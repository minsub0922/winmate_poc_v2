// 자리표시([00] · [0]주 · [확인 필요] …)는 제안서에 남기지 않는다 — 판별 · 문장 칸 정리 · 대체 레이아웃 고르기 (domain/slides/placeholders.js)
import assert from 'node:assert/strict';
import { hasPlaceholder, stripPlaceholders, numberOnly, unitOnly, alternativeLayouts, ALTERNATIVE_LAYOUTS, VALUE_LABELS } from '../web/src/domain/slides/placeholders.js';

// ---- 1. 무엇이 자리표시인가 ----
for (const text of ['[00]', '월 전기료 [00]% 절감', '[0]주', '[000]곳', '[0.0]', '[0,000]만 원', '[00/00]', '[ ]', '[N]명', '[30]%', '[확인 필요]', '[확인 필요: 매장 수]', '[모델명]', '[번호]',
  '[제안 부서명]', '[지역]', '[고객사]', '[미정]', '출처: [ ]', 'TBD', '[00.0]', '[0000.00]'])
  assert.equal(hasPlaceholder(text), true, text);
for (const text of ['', '월 전기료 절감', '운영 매장 140개', '24시간 · 365일', '[샘플 버티컬 시나리오 · 다점포 무인 매장]', 'A/S 4시간 대응', 'QM55C [Wi-Fi 지원]', '도입 후 · 분', 'TBDX', '3곳'])
  assert.equal(hasPlaceholder(text), false, text);
console.log('PASS bracketed zeros, sample numbers, blanks and "to be filled" words are placeholders; ordinary text and long bracketed notes are not');

// ---- 2. 문장 칸: 수치 자리만 걷어 내고 뜻은 남긴다 ----
const cases = [
  ['월 전기료 [00]% 절감', '월 전기료 절감'],
  ['전기료 [00]% ↓', '전기료 ↓'],
  ['점주 교육 [00]%', '점주 교육'],
  ['시범 매장 [0]곳 착수', '시범 매장 착수'],
  ['메뉴 반영 [0]일 → 당일', '메뉴 반영 → 당일'],
  ['[0]일 → 당일', '당일'],
  ['대기 12분 → [0]분', '대기 12분'],
  ['화면 장애 [0]건 이하', '화면 장애'],
  ['설치 속도 주 [0]곳', '설치 속도'],
  ['권역별 A/S [0]시간 대응', '권역별 A/S 대응'],
  ['일시 구매 [00]', '일시 구매'],
  ['약 [00]% 절감 · 연 [0,000]만 원', '절감'],
  ['직영 [0]곳 → 가맹 [00]곳', '직영 → 가맹'],
  ['[확인 필요] 매장에 설치', '매장에 설치'],
  ['출처: [ ]', ''],
  ['[00]', ''], ['[0]주', ''], ['[00]곳', ''], ['[00]% 개선', '개선'], ['[0,000]만 원', ''], ['최대 [00]%', ''], ['[N]', ''], ['TBD', ''],
  ['운영 매장 140개', '운영 매장 140개'],
  // 실제 견본 문구에서 나온 꼴 — 부호 · 쪽 번호 · 곱하기 · 분수 · 월 · 줄
  ['연 −[00]%', ''], ['−[00]%', ''], ['+[00]%', ''], ['▼ [00]%', ''], ['[0]일 → [0]분', ''], ['[00]/[00]', ''],
  ['근거 · 솔루션 구성 p.[00]', '근거 · 솔루션 구성'],
  ['외식 매장 도입 [00]곳 이상', '외식 매장 도입'],
  ['시범 매장 10곳 [00]월 착수', '시범 매장 10곳 착수'],
  ['피크 시간 주문 줄 [0]줄', '피크 시간 주문 줄'],
  ['계약 후 [00]주', '계약 후'],
  ['QM55C × [00]', 'QM55C'], ['키오스크 ×[000]', '키오스크'], ['[0]×[0] 비디오월', '비디오월'],
  ['객실 [000]실 · 연회장 [0]곳', '객실 · 연회장'],
  ['전력 [00]%가 냉난방', '전력 냉난방'], ['매장 [0]곳이 대상', '매장 대상'],
  // 수치에 바로 붙은 말은 그 수치의 단위다(표에 없는 단위도) · 수치가 빠져 숫자 · 비율 표시만 남으면 빈 칸
  ['[0]등급', ''], ['[N]구', ''], ['[00]h', ''], ['[00]HP', ''], ['[0]F', ''], ['[00]/7', ''], ['+[0.0]%/년', ''], ['[00]/[00]까지', ''], ['[000] W/명', ''],
  ['[00.0] 대 1', ''], ['[00]분 → 0', ''], ['[00]억 달러', ''], ['[3]개 동 · 옥상', '옥상'], ['[0000]년 도입', '도입'],
  ['[00] W · [000] nit', ''],
];
for (const [before, after] of cases) assert.equal(stripPlaceholders(before), after, before);
for (const [before] of cases) assert.equal(hasPlaceholder(stripPlaceholders(before)), false, 'still a placeholder: ' + before);
console.log('PASS a phrase loses only the missing figure with its unit and comparison word; nothing is left of a figure-only cell');

// ---- 3. 숫자만 들어가는 칸 — 값을 모르면 채울 방법이 없다(레이아웃을 바꿀 이유) ----
for (const text of ['[00]', '[0]주', '[00]곳', '[0,000]만 원', '최대 [00]%', '[N]', '[00] 명'])
  assert.equal(numberOnly(text), true, text);
for (const text of ['월 전기료 [00]% 절감', '일시 구매 [00]', '[00]% 개선', '운영 매장', '140'])
  assert.equal(numberOnly(text), false, text);
for (const text of ['명', '만 원', '%', ' 곳 ', '시간']) assert.equal(unitOnly(text), true, text);
for (const text of ['', '매장', '도입 후 · 분', '140', '명 이상']) assert.equal(unitOnly(text), false, text);
console.log('PASS a cell that is nothing but the missing figure is told apart from a phrase that mentions one');

// ---- 4. 대체 레이아웃 ----
const catalog = {
  L_TOC_UAPROF: { p: 'customer' }, L_TOC_UAPAIN: { p: 'challenge' }, L_TOC_KPI: { p: 'effect' }, L_TOC_VP3: { p: 'value' },
  L_TOC_TRSTAT: { p: 'market' }, L_TOC_TRKEY: { p: 'market' }, L_TOC_TRLINE: { p: 'market' },
  L_TOC_TCO: { p: 'cost' }, L_TOC_SUMMARY: { p: 'overview' }, L_TOC_BOM3: { p: 'bom' }, L_TOC_SPEC: { p: 'spec' }, L_TOC_PFEAT: { p: 'products' },
  L_PH_EF_A: { p: 'effect' }, L_PH_EF_B: { p: 'effect' }, L_PH_VA_A: { p: 'value' }, L_PH_OLD: { p: 'effect', retired: true },
  L_VS_HT_EFFECT: { p: 'effect', ind: 'HT' }, L_VS_OF_EFFECT: { p: 'effect', ind: 'OF' }, L_VS_WHY_1: { p: 'why' },
};
const free = new Set(['L_TOC_UAPAIN', 'L_TOC_VP3', 'L_TOC_TRKEY', 'L_TOC_SPEC', 'L_TOC_PFEAT', 'L_PH_EF_B', 'L_PH_VA_A', 'L_PH_OLD', 'L_VS_HT_EFFECT', 'L_VS_OF_EFFECT']);
const pick = (f, options = {}) => alternativeLayouts(f, catalog, { isFree: id => free.has(id), ...options });
assert.deepEqual(pick('L_TOC_UAPROF'), ['L_TOC_UAPAIN'], 'customer figures → customer challenges');
assert.deepEqual(pick('L_TOC_KPI'), ['L_TOC_VP3'], 'KPI figures → value cards');
assert.deepEqual(pick('L_TOC_TRSTAT'), ['L_TOC_TRKEY']);
assert.deepEqual(pick('L_TOC_BOM3'), ['L_TOC_SPEC', 'L_TOC_PFEAT']);
assert.deepEqual(pick('L_TOC_KPI', { used: ['L_TOC_VP3'] }), [], 'a layout already in the deck is not used twice');
assert.deepEqual(pick('L_TOC_TCO'), [], 'no layout stands in for the cost sheet');
assert.deepEqual(pick('L_TOC_SUMMARY'), []);
// 표에 없는 레이아웃: 같은 묶음(L_PH_ …) · 같은 용도 · 자리표시 없는 것만. 다른 업종 것 · 내려간 것 · 자기 자신은 빼고
assert.deepEqual(pick('L_PH_EF_A'), ['L_PH_EF_B']);
assert.deepEqual(pick('L_VS_OF_EFFECT', { ind: 'HT' }), ['L_VS_HT_EFFECT']);
assert.deepEqual(pick('L_VS_HT_EFFECT', { ind: 'RT' }), [], 'another industry’s sheet is not offered');
assert.deepEqual(pick('L_UNKNOWN'), []);
// 값 칸이 모두 비면 함께 비울 이름표 칸(목차 템플릿의 칸 이름)
assert.deepEqual(VALUE_LABELS.L_TOC_TCO, [{ label: 'tl', values: ['tv0', 'tv1', 'tv2'] }]);
for (const [from, list] of Object.entries(ALTERNATIVE_LAYOUTS)) { assert(Array.isArray(list)); assert(!list.includes(from)); }
console.log('PASS a sheet whose figures cannot be filled is replaced by a sheet that needs none — once per deck, same family, same industry');
