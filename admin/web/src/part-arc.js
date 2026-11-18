// 「전체 파트」 팝업 — 파트의 기승전결과 색 (사용자 지시 2026-11-16: "기승전결이 느껴지게 서로 다른 색을 부여해")
//   파트마다 제안 이야기에서 맡는 자리(기 · 승 · 전 · 결)가 있고, 파트마다 서로 다른 색을 준다. 색은 자리를 따라 흐른다:
//     기  여는 이야기 — 배경 · 고객 이해      차분한 회색 · 옅은 보라(아직 색이 오르기 전)  Overview · 고객사의 이해
//     승  전개 — 무엇을 제안하는가            파랑 → 청록 → 초록으로 쌓아 올린다        3 Value Props · 공간별 제안 · 공간별 가치 제안 · 솔루션 · Spec
//     전  전환 — 도입 방식을 바꾸고 증명한다   따뜻한 색으로 넘어간다(금색 → 주황 → 빨강)  구독 솔루션 · 서비스 · 도입사례 · 유관사례
//     결  결론 — 왜 삼성인가                 짙은 삼성 남색으로 맺는다                  Why Samsung
//   자리는 앱이 목차를 Storyboard 단계에 놓는 자리와 같다(toc_templates.js STAGE_KEY: context → 기, value · space · build → 승, proof · plan → 전, close → 결).
//   화면 없이 계산만 한다(node 테스트도 그대로 부른다). 카드에 입히는 것은 part-arc.jsx · part-arc.css.
import { PART_COLORS as C } from '../../../app/web/src/domain/templates/part_colors.js';
// 파트 색은 앱과 같은 한 곳(part_colors.js)에서 — Storyboard 추천 구성 버블 · 관리자 추천 구성 목록과 같은 색(2026-11-16)
export const ARC_STAGES = [
  { id: 'gi', mark: '기', hint: '여는 이야기 — 배경 · 고객 이해', color: C.overview },
  { id: 'seung', mark: '승', hint: '전개 — 무엇을 제안하는가', color: '#17976f' },
  { id: 'jeon', mark: '전', hint: '전환 — 도입 방식 · 증명', color: C.svc },
  { id: 'gyeol', mark: '결', hint: '결론 — 왜 삼성인가', color: '#1428a0' },
];
// 파트(목록의 key) → [자리, 색] — 목록에 보이는 파트는 모두 서로 다른 색. 같은 자리 안에서는 이야기 순서대로 색이 이어진다
const PART_ARC = {
  overview: ['gi', C.overview], ua: ['gi', C.ua],
  needs: ['seung', C.needs], space: ['seung', C.space], value: ['seung', C.value], sol: ['seung', C.sol], pspec: ['seung', C.pspec],
  subscription: ['jeon', C.subx], svc: ['jeon', C.svc], case: ['jeon', C.case], pcase: ['jeon', C.pcase], // svc: 서비스(2026-11-16) — 구독 다음
  why: ['gyeol', C.why],
};
// 목록에서 뺀 목차 · 나중에 더해질 목차의 자리(색은 그 자리의 기본 색) — 목록에 올릴 때는 PART_ARC 에 제 색을 정한다
const STAGE_OF = { summary: 'gi', subone: 'gi', tech: 'seung', vp: 'seung', vpd: 'seung', rfp: 'seung', bom: 'seung', spec: 'seung', subs: 'seung', subpkg: 'seung', subcare: 'seung',
  effect: 'jeon', cost: 'jeon', pilot: 'jeon', plan: 'jeon', subterm: 'jeon', subsol: 'jeon' };
const stage = id => ARC_STAGES.find(s => s.id === id);
const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
/** 흰색을 섞은 옅은 색 — t: 흰색 비율 */
export const tint = (hex, t) => '#' + channels(hex).map(v => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('');

/** 파트의 자리와 색 — { stage: { id, mark, hint }, order(이야기 순서), color, soft(옅은 바탕), line(옅은 테두리), own(제 색이 정해진 파트) } */
export function partArc(key) {
  const own = PART_ARC[key];
  const s = stage(own ? own[0] : STAGE_OF[key] || 'seung');
  const color = own ? own[1] : s.color;
  const keys = Object.keys(PART_ARC);
  return { stage: s, order: own ? keys.indexOf(key) : keys.length, color, soft: tint(color, 0.9), line: tint(color, 0.68), own: !!own };
}
