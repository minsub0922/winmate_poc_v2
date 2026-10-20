// 제안서 히스토리 샘플 17건 — 업종 16개 · 요구사항 유형 6종 · 전략 7종을 고루 담은 케이스.
// 진행 단계: 레이아웃 값을 전부 채운 Storyboard 8건 · 작성 중인 Storyboard 5건 · 파트만 있는 Storyboard 1건 · 요구사항 단계 3건.
// 원본 데이터는 seeds_cases.json(케이스 빌더로 생성). 슬라이드의 수치는 ① 고객 요구사항 · 첨부에 적힌 값 ② 그 값의 계산
// ③ 공식 통계(출처 · 링크는 각 요소의 근거 ev에 기록) ④ 삼성 공식 사양 · 도입사례 원문 중 하나에서만 가져온다.
// 각 제안서의 meta = { reqType: new|renew|compete|ops|scale|brief, strategy: value|pain|space|roi|rfp|compete|land, level: minimal|ambiguous|complex }
import DATA from './seeds_cases.json';

export const CASE_SEED_IDS = DATA.map((p) => p.id);

export function caseSeeds(t) {
  return DATA.map((src) => {
    const { createdAgoH, updatedAgoH, exported, ...p } = structuredClone(src);
    p.createdAt = t - createdAgoH * 3600e3;
    p.updatedAt = t - updatedAgoH * 3600e3;
    p.exportedAt = exported ? p.updatedAt : null;
    for (const s of p.parts) {
      for (const x of s.layouts) {
        for (const e of Object.values(x.ev || {})) if (e.at == null) e.at = p.updatedAt;
      }
    }
    return p;
  });
}
