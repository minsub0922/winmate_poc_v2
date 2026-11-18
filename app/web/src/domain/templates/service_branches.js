// 서비스 제안의 갈래 — 고른 서비스에 따라 나뉜다(사용자 지시 2026-11-17: "구독 상품 제안은 서비스 하위로 넣기. 서비스 2개가 선택에 따라 분류되듯,
//   구독 상품 선택시 구독 상품 제안의 흐름이 나오도록"). 앱(part_catalog.js · toc_templates.js B.svc · services/dss.js)과 관리자 「전체 파트」(part-flows.js)가 같이 읽는다.
//   id · 이름 · 무엇을 고르면 나오나 · 쓰는 장(이 순서로). 고르는 규칙: services/dss.js serviceBranches
export const SERVICE_BRANCHES = [
  { id: 'sac', label: '삼성케어플러스 SAC', when: '케어 서비스 + 공조 제품', fams: ['L_TOC_SVC_SAC'] },
  { id: 'mobile', label: '삼성케어플러스 비즈니스', when: '케어 서비스 + 갤럭시 모바일', fams: ['L_TOC_SVC_MOBILE'] },
  { id: 'sub', label: '구독 상품 제안', when: '구독', fams: ['L_SUB_PAIN', 'L_SUB_VALUE3', 'L_SUB_COMPARE', 'L_SUB_PKG', 'L_SUB_CARE4', 'L_SUB_BLUEPASS', 'L_SUB_TERMS', 'L_SUB_PAY3'] },
];
/** 장(레이아웃 묶음) → 갈래 id */
export const branchOf = (fam) => (SERVICE_BRANCHES.find((b) => b.fams.some((x) => fam === x || String(fam).startsWith(x))) || {}).id || null;
