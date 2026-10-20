// Current rubric shared with the API and Agent KB. Legacy ratings retain their own schema.
import schema from './schema.json' with { type: 'json' };
import schemaV2 from './schema-v2.json' with { type: 'json' };
import schemaV3 from './schema-v3.json' with { type: 'json' };
import schemaV4 from './schema-v4.json' with { type: 'json' };
import * as legacy from './criteria-v1.js';
export { band, verdictOf } from './criteria-v1.js';
export const REVIEW_CRITERIA_VERSION = schema.version;
export const REVIEW_CRITERIA_SCHEMA = schema;
export const CATS = schema.cats;
export const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));

const gates = {
  always: () => [true, '모든 제안서'],
  geometry: x => [['pptx', 'winmate'].includes(x.kind) || !!x.visual, '도형 위치 또는 실제 화면이 있는 문서'],
  products: x => [!!((x.products || []).length + (x.unknownModels || []).length), '제품 · 모델 언급'],
  products_or_solutions: x => [!!((x.products || []).length + (x.unknownModels || []).length + (x.solutions || []).length), '제품 · 솔루션 언급'],
  figures3: x => [(x.figures || 0) >= 3, '수치 3개 이상'],
  charts_or_figures8: x => [!!(x.charts || x.tables || x.figures >= 8), '차트 · 표 또는 수치가 있는 문서'],
  linked_req: x => [!!(x.linkedReq || x.req_list?.length || x.rfpLike), '고객 요구사항 또는 RFP'],
  rfp_format: x => [!!x.rfpFormat, 'RFP 제출 조건'],
  market_or_figures: x => [!!(x.marketUnits || x.figures >= 4), '시장 분석 또는 데이터'],
  years_or_figures: x => [!!(x.years?.length || x.figures >= 4), '연도 또는 데이터 언급'],
  units8: x => [x.units >= 8, '8장 이상 본 제안'],
  fonts: x => [!!x.fontCount, '폰트 정보'],
  visual: x => [!!x.visual, '실제 장표 화면'],
  slides_units5: x => [!!x.slides && x.units >= 5, '5장 이상 장표'],
  brand: x => [!!x.brandTerms?.length, '브랜드 · 솔루션 명칭'],
};
const criteriaOf = spec => spec.criteria.map(c => ({ ...c, when(x) {
  const checks = c.when_any.map(name => {
    if (!gates[name]) throw new Error('알 수 없는 평가 적용 조건: ' + name);
    return gates[name](x);
  });
  const applied = checks.filter(([ok]) => ok);
  return applied.length ? [true, [...new Set(applied.map(([, why]) => why))].join(' · ')] : [false, '적용 조건 없음 · ' + checks.map(([, why]) => why).join(' / ')];
} }));
export const CRITERIA = criteriaOf(schema);
export const CR = Object.fromEntries(CRITERIA.map(c => [c.id, c]));
const CURRENT = { version: REVIEW_CRITERIA_VERSION, CATS, CAT, CRITERIA, CR, scoring: schema.scoring };
const LEGACY = { version: 1, CATS: legacy.CATS, CAT: legacy.CAT, CRITERIA: legacy.CRITERIA, CR: legacy.CR };
const v2Criteria = criteriaOf(schemaV2);
const V2 = { version: 2, CATS: schemaV2.cats, CAT: Object.fromEntries(schemaV2.cats.map(c => [c.id, c])), CRITERIA: v2Criteria, CR: Object.fromEntries(v2Criteria.map(c => [c.id, c])) };
const v3Criteria = criteriaOf(schemaV3);
const V3 = { version: 3, CATS: schemaV3.cats, CAT: Object.fromEntries(schemaV3.cats.map(c => [c.id, c])), CRITERIA: v3Criteria, CR: Object.fromEntries(v3Criteria.map(c => [c.id, c])) };
const v4Criteria = criteriaOf(schemaV4);
const V4 = { version: 4, CATS: schemaV4.cats, CAT: Object.fromEntries(schemaV4.cats.map(c => [c.id, c])), CRITERIA: v4Criteria, CR: Object.fromEntries(v4Criteria.map(c => [c.id, c])), scoring: schemaV4.scoring };
export const LEGACY_REVIEW_CRITERIA = LEGACY;
export function criteriaForReview(review) {
  if (!review) return CURRENT;
  const version = review.criteriaVersion ?? review.poc?.result?.criteriaVersion ?? 1;
  return version === REVIEW_CRITERIA_VERSION ? CURRENT : version === 4 ? V4 : version === 3 ? V3 : version === 2 ? V2 : LEGACY;
}
const currentIds = (id, version) => version === REVIEW_CRITERIA_VERSION ? (CR[id] ? [id] : []) : schema.version_maps[String(version)]?.[id] || [];
export function currentCriterionId(id, version = REVIEW_CRITERIA_VERSION) { return currentIds(id, version)[0] || null; }
export function normalizeCriteriaIds(ids, version = REVIEW_CRITERIA_VERSION) { return [...new Set(ids.flatMap(id => currentIds(id, version)))]; }
export function normalizeReviewOverrides(override = {}, version = REVIEW_CRITERIA_VERSION) {
  const out = {};
  for (const [old, enabled] of Object.entries(override)) {
    for (const id of currentIds(old, version)) out[id] = !!out[id] || !!enabled;
  }
  return out;
}
