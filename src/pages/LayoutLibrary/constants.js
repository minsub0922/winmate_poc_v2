import { LAYOUTS } from '../../lib/catalog.js';
import { REQ_LABEL } from '../../lib/parts.js';

/** 구분 1 — Storyboard 파트 유형을 제안서 흐름 순서대로 묶은 탭 */
export const PART_GROUPS = [
  { k: 'analysis', label: '분석 · 이해', hue: 'blue', parts: ['overview', 'requirements', 'market', 'customer', 'user', 'competition', 'insight'] },
  { k: 'value', label: '과제 · 가치', hue: 'violet', parts: ['challenge', 'value', 'effect'] },
  { k: 'space', label: '공간 · 제품', hue: 'teal', parts: ['dss', 'products', 'bom', 'scenario', 'birdseye', 'spec'] },
  { k: 'proof', label: '솔루션 · 근거', hue: 'amber', parts: ['solution', 'case', 'why'] },
  { k: 'exec', label: '실행 · 비용', hue: 'green', parts: ['execution', 'cost'] },
  { k: 'frame', label: '표지 · 마무리', hue: 'slate', parts: ['cover', 'closing', 'appendix'] },
];
/** 파트 유형 → 탭 키 */
export const GROUP_OF = Object.fromEntries(PART_GROUPS.flatMap((g) => g.parts.map((p) => [p, g.k])));
/** 파트 유형별 보기의 섹션 순서 */
export const PART_ORDER = PART_GROUPS.flatMap((g) => g.parts);

/** 카탈로그 순서(원본 장표별 보기의 정렬 기준) */
export const IDX = Object.fromEntries(LAYOUTS.map((l, i) => [l.f, i]));
/** 묶음 이름 — 메타데이터 g 의 " — " 앞부분 */
export const gName = (l) => String(l.g || '').split(' — ')[0].trim() || '기타';

/** 이미지 칸 필터: 값 → 표시 */
export const IMG_OPTS = [['', '이미지 칸 전체'], ['0', '텍스트만 (이미지 없음)'], ['1', '이미지 1–3칸'], ['4', '이미지 4칸 이상']];
/** 실제 레이아웃에 나오는 '필요한 정보' 키만 */
export const REQ_KEYS = Object.keys(REQ_LABEL).filter((k) => LAYOUTS.some((l) => (l.req || []).includes(k)));

/**
 * 필터 상태 — 브라우저에 저장된다(lib/uiPrefs.js 'lib' 키).
 *   q 검색어 · by 'part'(파트 유형별) | 'deck'(원본 장표별) · tab 'all' | PART_GROUPS.k | DECKS.k · part 파트 유형(by=part 일 때)
 *   ind '' | '_gen'(범용) | '_ind'(업종 맞춤 전체) | 업종 코드 · sol '' | '_none'(솔루션 전용 제외) | 솔루션 id
 *   img '' | '0' | '1' | '4' · req '' | REQ_LABEL 키
 */
export const DEFAULT_FILTER = { q: '', by: 'part', tab: 'all', part: '', ind: '', sol: '', img: '', req: '' };

/** 검색 결과가 없을 때 보여 주는 예시 검색어 */
export const QUICK_QUERIES = ['경쟁사 비교표', '매장 하루 동선', '도입 효과 KPI', '설치 일정', '조감도', '스펙 비교'];

/** 한 번에 PPTX로 받을 수 있는 최대 장 수 */
export const MAX_EXPORT = 120;
