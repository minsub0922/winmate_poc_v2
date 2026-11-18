# 레이아웃별 Decision 분기 — 5샘플 검증

레이아웃 468개 · 결과 있는 레이아웃 423개. 각 행의 상세는 `layouts/<레이아웃>.md`. 모든 흐름의 마지막 단계 ‘최종 점검 · ReAct’(`layout.final`)의 레이아웃별 결과는 각 파일의 「최종 점검 · ReAct」 절, 요약은 [`FINAL-CHECK.md`](FINAL-CHECK.md).

| 레이아웃 | 이름 | Decision 단계 | 모델 시간 LLM → Decision | 감사 문제 LLM → Decision | 칸 값 일치 | 판정 |
|---|---|---|---|---|---|---|
| [L_AC_GOV_01](layouts/L_AC_GOV_01.md) | 제안 대상 · 구매·운영 책임 지도 | pictures · review · verify | 14.6 → 8.6초 | 1.4 → 1.8 | — | 모든 decision 단계 사용 |
| [L_AIS_01](layouts/L_AIS_01.md) | 표지 · 풀블리드 사진 + 흰 띠 | pictures · review · verify | 7.3 → 6.4초 | 0.4 → 0.8 | — | 모든 decision 단계 사용 |
| [L_AIS_02](layouts/L_AIS_02.md) | 목차 · 사진 카드 6 | cells · pictures · review · verify | 10.6 → 8.4초 | 1.4 → 1.2 | 20% | 모든 decision 단계 사용 |
| [L_AIS_03](layouts/L_AIS_03.md) | 간지 · 01 Overview | pictures | 1.5 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_04](layouts/L_AIS_04.md) | Device–Solution–Service  | cells · pictures · review · verify | 11.3 → 12.5초 | 0.2 → 0.8 | 60% | 모든 decision 단계 사용 |
| [L_AIS_05](layouts/L_AIS_05.md) | 간지 · 02 AI 스테이 (주석 포함) | pictures | 1.2 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_06](layouts/L_AIS_06.md) | 니즈 · 기술 · 제안 3열 (현장 사진 · | pictures · review · verify | 19.1 → 12.4초 | 1.0 → 0.8 | — | 모든 decision 단계 사용 |
| [L_AIS_07](layouts/L_AIS_07.md) | 2행 · 3단계 사진 시나리오 (글로벌 응대 | pictures · review · verify | 12.6 → 5.6초 | 1.8 → 1.6 | — | 모든 decision 단계 사용 |
| [L_AIS_09](layouts/L_AIS_09.md) | 2행 · 3단계 사진 시나리오 (맞춤 서비스 | cells · pictures · review · verify | 14.4 → 10.4초 | 1.2 → 0.8 | 40% | 모든 decision 단계 사용 |
| [L_AIS_10](layouts/L_AIS_10.md) | 간지 | pictures | 1.0 → 0.2초 | 0.0 → 0.0 | — | 사진 검수 · 고르기 LLM 유지 |
| [L_AIS_11](layouts/L_AIS_11.md) | 공간 사진 모자이크 + 2열 범례 | cells · pictures · review · verify | 14.5 → 7.2초 | 0.4 → 0.6 | 28% | 모든 decision 단계 사용 |
| [L_AIS_12](layouts/L_AIS_12.md) | 공간 사진 + Key Message + 제품 | cells · pictures · review · verify | 12.9 → 7.6초 | 1.2 → 0.6 | 13% | 모든 decision 단계 사용 |
| [L_AIS_14](layouts/L_AIS_14.md) | 공간 사진 + Key Message + 제품 | cells · pictures · review · verify | 14.7 → 9.6초 | 1.0 → 0.4 | 20% | 모든 decision 단계 사용 |
| [L_AIS_16](layouts/L_AIS_16.md) | 공간 사진 + Key Message + 제품 | cells · pictures · review · verify | 14.0 → 9.5초 | 1.2 → 1.4 | 40% | 모든 decision 단계 사용 |
| [L_AIS_17](layouts/L_AIS_17.md) | 공간 사진 + Key Message + 제품 | cells · pictures · review · verify | 12.9 → 7.5초 | 1.4 → 1.6 | 10% | 모든 decision 단계 사용 |
| [L_AIS_20](layouts/L_AIS_20.md) | 공간 사진 + Key Message + 제품 | cells · pictures · review · verify | 14.3 → 11.4초 | 1.6 → 1.8 | 13% | 모든 decision 단계 사용 |
| [L_AIS_21](layouts/L_AIS_21.md) | 공간 사진 + Key Message + 제품 | cells · pictures · review · verify | 15.1 → 10.8초 | 1.0 → 0.6 | 40% | 모든 decision 단계 사용 |
| [L_AIS_22](layouts/L_AIS_22.md) | AI 스테이 Map · 공간 × 제품 매핑 | cells · pictures · review · verify | 12.6 → 5.8초 | 0.8 → 1.6 | 36% | 모든 decision 단계 사용 |
| [L_AIS_23](layouts/L_AIS_23.md) | 간지 · 04 스테이 솔루션 | pictures | 1.0 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_24](layouts/L_AIS_24.md) | 풀블리드 사진 + 캡션 패널 · 솔루션 소개 | pictures | 0.0 → 0.0초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_26](layouts/L_AIS_26.md) | 원격 관리 도식 · 효익 3 | pictures | 0.0 → 0.0초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_27](layouts/L_AIS_27.md) | 큰 사진 + 서비스 카드 2 × 2 | pictures | 0.0 → 0.0초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_28](layouts/L_AIS_28.md) | 간지 · 05 도입사례 | pictures | 1.1 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_29](layouts/L_AIS_29.md) | 사례 포토 에세이 (대표 사진 · 적용 사진 | pictures | 2.5 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_30](layouts/L_AIS_30.md) | 사례 포토 에세이 + 주석 | pictures | 2.5 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_32](layouts/L_AIS_32.md) | 사옥 사진 + 4P 카드 | pictures | 1.1 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_33](layouts/L_AIS_33.md) | 전문가 조직 카드 3 (사진 머리) | pictures | 1.7 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_34](layouts/L_AIS_34.md) | 통합 오퍼링 3열 (사진 머리 · 가운데 강 | pictures | 1.9 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_AIS_36](layouts/L_AIS_36.md) | 브랜드 가치 막대 · 핵심 수치 4 · 요약 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_AIS_37](layouts/L_AIS_37.md) | 사진 + 브랜드 띠 마감 | pictures · review · verify | 10.4 → 6.7초 | 1.0 → 1.2 | — | 사진 검수 · 고르기 LLM 유지 |
| [L_AX_D](layouts/L_AX_D.md) | 용어 · 약어 | review · verify | 12.9 → 9.7초 | 0.8 → 1.0 | — | 모든 decision 단계 사용 |
| [L_BE02](layouts/L_BE02.md) | 번호 콜아웃 | pictures · review · verify | 12.7 → 8.7초 | 0.8 → 0.8 | — | 사진 검수 · 고르기 LLM 유지 |
| [L_BIT_D](layouts/L_BIT_D.md) | b.IoT 구성도 | pictures · review · verify | 12.2 → 9.9초 | 1.8 → 1.6 | — | 모든 decision 단계 사용 |
| [L_BV_C](layouts/L_BV_C.md) | 전경 + 한 장 요약 | cells · pictures · review · verify | 11.9 → 7.8초 | 1.2 → 1.0 | 60% | 모든 decision 단계 사용 |
| [L_C01](layouts/L_C01.md) | 표지 A · 대표 이미지 | pictures · review · verify | 6.2 → 5.3초 | 1.6 → 1.2 | — | 모든 decision 단계 사용 |
| [L_C02](layouts/L_C02.md) | 표지 B · 와이드 이미지 | pictures · review · verify | 7.5 → 7.5초 | 0.4 → 0.2 | — | 모든 decision 단계 사용 |
| [L_C03](layouts/L_C03.md) | 표지 C · 타이포 중심 | review · verify | 6.0 → 4.3초 | 1.0 → 0.4 | — | 모든 decision 단계 사용 |
| [L_C04](layouts/L_C04.md) | 목차 | review · verify | 7.7 → 5.0초 | 1.2 → 1.2 | — | 모든 decision 단계 사용 |
| [L_C05](layouts/L_C05.md) | 섹션 간지 A · 대형 번호 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_C08](layouts/L_C08.md) | 표지 D · 이미지 3컷 콜라주 | pictures · review · verify | 9.0 → 7.4초 | 0.6 → 0.6 | — | 모든 decision 단계 사용 |
| [L_C10](layouts/L_C10.md) | 목차 B · 섹션 썸네일 | pictures · review · verify | 10.0 → 7.1초 | 0.8 → 0.6 | — | 모든 decision 단계 사용 |
| [L_C12](layouts/L_C12.md) | 마무리 B · 도입 후 모습 (생성 시안) | pictures · review · verify | 13.3 → 6.8초 | 1.0 → 0.6 | — | 모든 decision 단계 사용 |
| [L_CCH_I](layouts/L_CCH_I.md) | 삼성 콜드체인 소개 | pictures · review · verify | 11.2 → 7.3초 | 1.2 → 2.0 | — | 모든 decision 단계 사용 |
| [L_CCH_S_RT](layouts/L_CCH_S_RT.md) | 삼성 콜드체인 공간 시나리오 · 식품 매장 | pictures · review · verify | 13.1 → 12.1초 | 1.6 → 0.8 | — | 모든 decision 단계 사용 |
| [L_CD_D](layouts/L_CD_D.md) | 사례 포토 에세이 · 원문 링크 | pictures · review · verify | 18.7 → 15.4초 | 5.0 → 5.6 | — | 모든 decision 단계 사용 |
| [L_CL_D](layouts/L_CL_D.md) | 사례 사진 카드 6 | cells · pictures · review · verify | 12.6 → 8.3초 | 1.4 → 1.4 | 77% | 모든 decision 단계 사용 |
| [L_CS02](layouts/L_CS02.md) | 2건 비교 | cells · review · verify | 11.1 → 11.5초 | 2.6 → 2.8 | 100% | 모든 decision 단계 사용 |
| [L_GN_C](layouts/L_GN_C.md) | 공간별 지금 → 제안 시안 | cells · pictures · review · verify | 14.6 → 9.5초 | 0.4 → 1.6 | 45% | 모든 decision 단계 사용 |
| [L_GN_D](layouts/L_GN_D.md) | 화면 콘텐츠 시안 3 | pictures · review · verify | 9.5 → 10.1초 | 1.6 → 1.6 | — | 모든 decision 단계 사용 |
| [L_HVC_S_HT](layouts/L_HVC_S_HT.md) | 삼성 통합공조 공간 시나리오 · 호텔형 연수 | pictures · review · verify | 8.6 → 4.3초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_IS_A](layouts/L_IS_A.md) | 현장 조사 · 사진 모자이크 | cells · pictures · review · verify | 13.1 → 7.3초 | 0.2 → 0.8 | 100% | 모든 decision 단계 사용 |
| [L_KCP_I](layouts/L_KCP_I.md) | Knox Capture 소개 | pictures · review · verify | 11.5 → 7.7초 | 1.0 → 1.4 | — | 모든 decision 단계 사용 |
| [L_KCP_S_LG](layouts/L_KCP_S_LG.md) | Knox Capture 공간 시나리오 · 물 | cells · pictures · review · verify | 8.9 → 8.3초 | 2.6 → 3.2 | 80% | 모든 decision 단계 사용 |
| [L_KNX_S_FD](layouts/L_KNX_S_FD.md) | Knox Suite 공간 시나리오 · 제조  | pictures · review · verify | 11.9 → 9.5초 | 1.2 → 1.6 | — | 모든 decision 단계 사용 |
| [L_LYN_S_HT](layouts/L_LYN_S_HT.md) | LYNK Cloud 공간 시나리오 · 비즈니 | pictures · review · verify | 12.3 → 10.1초 | 1.6 → 2.0 | — | 모든 decision 단계 사용 |
| [L_MB_A](layouts/L_MB_A.md) | 무드보드 · 공간 톤 | pictures · review · verify | 14.5 → 12.5초 | 2.0 → 2.0 | — | 모든 decision 단계 사용 |
| [L_MGI_D](layouts/L_MGI_D.md) | MagicINFO 구성도 | cells · pictures · review · verify | 13.1 → 10.6초 | 4.0 → 2.4 | 0% | 모든 decision 단계 사용 |
| [L_MGI_I](layouts/L_MGI_I.md) | MagicINFO 소개 | pictures · review · verify | 11.7 → 8.4초 | 1.4 → 1.2 | — | 모든 decision 단계 사용 |
| [L_OV_C](layouts/L_OV_C.md) | 전제 조건 · 확인 요청 | cells · review · verify | 12.8 → 10.7초 | 2.2 → 2.2 | 75% | 모든 decision 단계 사용 |
| [L_P2D](layouts/L_P2D.md) | 주력 + 보조 (8:4) | cells · pictures · review · verify | 12.8 → 9.8초 | 0.6 → 0.8 | 70% | 모든 decision 단계 사용 |
| [L_P3D](layouts/L_P3D.md) | 주력 1 + 보조 2 | cells · pictures · review · verify | 12.4 → 8.7초 | 2.0 → 0.2 | 40% | 모든 decision 단계 사용 |
| [L_P4D](layouts/L_P4D.md) | 주력 1 + 보조 3 | cells · pictures · review · verify | 12.3 → 11.5초 | 2.2 → 1.6 | 50% | 모든 decision 단계 사용 |
| [L_PH_AIS_08](layouts/L_PH_AIS_08.md) | AI 맞춤 환경 2행 · 3단계 — 장면 사 | pictures · review · verify | 17.6 → 12.3초 | 1.4 → 1.8 | — | 모든 decision 단계 사용 |
| [L_PH_AIS_25](layouts/L_PH_AIS_25.md) | 고객 분석 마케팅 — 수집 · 적용을 객실  | pictures | 0.0 → 0.0초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_PH_AIS_35](layouts/L_PH_AIS_35.md) | 배송 · 설치 · 유지보수 · 서비스 4단계 | pictures | 2.1 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_PH_BM_C](layouts/L_PH_BM_C.md) | 반복 유닛 + 공용부 · 공간 사진 | cells · pictures · review · verify | 11.6 → 7.9초 | 0.8 → 0.6 | 60% | 모든 decision 단계 사용 |
| [L_PH_BM_D](layouts/L_PH_BM_D.md) | 단계별 도입 물량 · 단계 사진 + 제품 컷 | cells · pictures · review · verify | 14.1 → 13.2초 | 2.4 → 2.8 | 68% | 모든 decision 단계 사용 |
| [L_PH_CAL_A](layouts/L_PH_CAL_A.md) | 열두 달 운영 · 시기별 사진 | pictures · review · verify | 18.6 → 12.2초 | 1.2 → 1.8 | — | 모든 decision 단계 사용 |
| [L_PH_CB_B](layouts/L_PH_CB_B.md) | 경영 목표 → 실행 과제 · 사진 | cells · pictures · review · verify | 13.9 → 8.0초 | 0.4 → 1.2 | 33% | 모든 decision 단계 사용 |
| [L_PH_CB_C](layouts/L_PH_CB_C.md) | 운영 흐름 · 포토 스트립 | pictures · review · verify | 15.8 → 9.3초 | 0.8 → 0.6 | — | 모든 decision 단계 사용 |
| [L_PH_CB_E](layouts/L_PH_CB_E.md) | 거점 분포 · 지도 + 매장 유형 사진 | pictures · review · verify | 13.4 → 8.8초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_PH_CB_F](layouts/L_PH_CB_F.md) | KPI 벤치마크 · 지표마다 현장 사진 | pictures · review · verify | 16.6 → 10.8초 | 3.6 → 1.6 | — | 모든 decision 단계 사용 |
| [L_PH_CB_G](layouts/L_PH_CB_G.md) | 성숙도 진단 · 축마다 현장 사진 | pictures · review · verify | 17.9 → 13.1초 | 1.2 → 1.0 | — | 모든 decision 단계 사용 |
| [L_PH_CB_M](layouts/L_PH_CB_M.md) | 수익 구조 · 주체 3 · 현장 사진 | pictures · review · verify | 13.9 → 8.2초 | 3.6 → 1.2 | — | 모든 decision 단계 사용 |
| [L_PH_CB_P](layouts/L_PH_CB_P.md) | 고객사 프로필 · 사진 콜라주 + 숫자 6 | cells · pictures · review · verify | 12.5 → 9.0초 | 0.6 → 0.8 | 0% | 모든 decision 단계 사용 |
| [L_PH_CD_C](layouts/L_PH_CD_C.md) | 성과 수치 + 코멘트 · 사례 사진 | pictures · review · verify | 15.0 → 10.2초 | 2.6 → 2.8 | — | 모든 decision 단계 사용 |
| [L_PH_CH_A](layouts/L_PH_CH_A.md) | 과제 3 · 현장 사진 | pictures · review · verify | 14.7 → 8.9초 | 1.8 → 1.4 | — | 모든 decision 단계 사용 |
| [L_PH_CH_B](layouts/L_PH_CH_B.md) | 지금 → 바라는 모습 · 사진 대비 | pictures · review · verify | 14.3 → 9.6초 | 1.0 → 1.6 | — | 모든 decision 단계 사용 |
| [L_PH_CH_C](layouts/L_PH_CH_C.md) | 문제 → 근본 원인 · 현장 사진 | cells · pictures · review · verify | 11.7 → 7.0초 | 0.0 → 0.2 | 40% | 사진 검수 · 고르기 LLM 유지 |
| [L_PH_CL_C](layouts/L_PH_CL_C.md) | 레퍼런스 포토 월 | cells · pictures · review · verify | 15.6 → 11.1초 | 1.0 → 1.2 | 20% | 모든 decision 단계 사용 |
| [L_PH_CM_A](layouts/L_PH_CM_A.md) | 비교 · 기준마다 현장 사진 | pictures · review · verify | 14.8 → 8.7초 | 2.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_PH_CO_A](layouts/L_PH_CO_A.md) | 구매 방식 3 · 지점 사진 + 누적 비용  | pictures · review · verify | 13.5 → 10.2초 | 1.2 → 1.2 | — | 모든 decision 단계 사용 |
| [L_PH_CO_B](layouts/L_PH_CO_B.md) | 총소유비용 5년 · 제품 컷 + 누적 막대 | pictures · review · verify | 13.3 → 11.6초 | 18.6 → 15.0 | — | 모든 decision 단계 사용 |
| [L_PH_CP_C](layouts/L_PH_CP_C.md) | 5년 총비용 · 제품 컷 + 누적 막대 | cells · pictures · review · verify | 15.6 → 12.0초 | 1.4 → 2.2 | 20% | 문구 작성 · 정해진 보기 칸 LLM 유지 |
| [L_PH_CP_G](layouts/L_PH_CP_G.md) | 포지셔닝 맵 · 삼성은 사진 버블 | pictures · review · verify | 15.8 → 10.7초 | 0.8 → 1.0 | — | 모든 decision 단계 사용 |
| [L_PH_CP_T](layouts/L_PH_CP_T.md) | 경쟁사 주장 → 사실 · 증거 사진 | pictures · review · verify | 15.8 → 10.7초 | 2.4 → 1.2 | — | 모든 decision 단계 사용 |
| [L_PH_CP_W](layouts/L_PH_CP_W.md) | 열위 → 보완 · 보완 장면 사진 | pictures · review · verify | 17.0 → 11.0초 | 4.2 → 5.6 | — | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 |
| [L_PH_CP_X](layouts/L_PH_CP_X.md) | 레이더 종합 비교 · 축마다 사진 | pictures · review · verify | 15.4 → 8.9초 | 2.2 → 1.2 | — | 모든 decision 단계 사용 |
| [L_PH_CU_A](layouts/L_PH_CU_A.md) | 전용 에디션 사양 · 단말 사진 위 번호 | cells · pictures · review · verify | 14.8 → 10.6초 | 1.8 → 1.6 | 27% | 모든 decision 단계 사용 |
| [L_PH_CU_B](layouts/L_PH_CU_B.md) | 맞춤 개발 · 공급 일정 · 단계 사진 | pictures · review · verify | 14.5 → 7.5초 | 1.8 → 1.8 | — | 사진 검수 · 고르기 LLM 유지 |
| [L_PH_EF_A](layouts/L_PH_EF_A.md) | KPI 전 → 후 · 도입 후 사진 | pictures · review · verify | 14.4 → 9.5초 | 3.0 → 0.6 | — | 모든 decision 단계 사용 |
| [L_PH_EF_B](layouts/L_PH_EF_B.md) | 투자 회수 · 도입 후 사진 + 누적 차트 | pictures · review · verify | 13.2 → 8.5초 | 1.2 → 1.4 | — | 모든 decision 단계 사용 |
| [L_PH_EF_C](layouts/L_PH_EF_C.md) | 정량 + 정성 · 현장 사진 | pictures · review · verify | 14.5 → 8.8초 | 0.8 → 1.0 | — | 모든 decision 단계 사용 |
| [L_PH_EF_G](layouts/L_PH_EF_G.md) | 비용 절감 워터폴 · 도입 후 사진 | pictures · review · verify | 14.7 → 8.0초 | 2.2 → 1.6 | — | 모든 decision 단계 사용 |
| [L_PH_EF_I](layouts/L_PH_EF_I.md) | ESG · 탄소 감축 · 풀블리드 사진 | pictures · review · verify | 13.4 → 10.3초 | 1.8 → 2.0 | — | 사진 검수 · 고르기 LLM 유지 |
| [L_PH_EF_P](layouts/L_PH_EF_P.md) | 효과 범위 · KPI 장면 사진 + 범위 막 | cells · pictures · review · verify | 12.6 → 11.2초 | 1.8 → 1.8 | 28% | 모든 decision 단계 사용 |
| [L_PH_ES_A](layouts/L_PH_ES_A.md) | 제안 요약 · 히어로 사진 | cells · pictures · review · verify | 12.0 → 10.7초 | 1.2 → 1.4 | 0% | 모든 decision 단계 사용 |
| [L_PH_IG_B](layouts/L_PH_IG_B.md) | 연동 데이터 흐름 · POS · 매장 화면  | pictures · review · verify | 17.6 → 13.0초 | 1.0 → 1.8 | — | 모든 decision 단계 사용 |
| [L_PH_IM_A](layouts/L_PH_IM_A.md) | 발견 4 → 시사점 → 방향 · 사진 | pictures · review · verify | 14.4 → 9.6초 | 3.0 → 2.6 | — | 모든 decision 단계 사용 |
| [L_PH_IP_B](layouts/L_PH_IP_B.md) | 공사 범위 R&R · 작업별 사진 | pictures · review · verify | 15.9 → 13.1초 | 1.2 → 1.6 | — | 모든 decision 단계 사용 |
| [L_PH_IP_C](layouts/L_PH_IP_C.md) | 무중단 야간 시공 · 구역 사진 일정 | pictures · review · verify | 16.0 → 8.3초 | 2.2 → 2.8 | — | 사진 검수 · 고르기 LLM 유지 |
| [L_PH_MI_AD_C](layouts/L_PH_MI_AD_C.md) | 고객 여정 · 사진 | cells · pictures · review · verify | 15.0 → 11.4초 | 2.4 → 1.4 | 10% | 모든 decision 단계 사용 |
| [L_PH_MI_ED_A](layouts/L_PH_MI_ED_A.md) | 교육 · 캠퍼스 · 시장 · 트렌드 · 사진 | pictures · review · verify | 16.6 → 12.9초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_PH_MI_ED_C](layouts/L_PH_MI_ED_C.md) | 교육 · 캠퍼스 · 고객 여정 · 사진 | cells · pictures · review · verify | 17.5 → 15.6초 | 6.2 → 9.2 | 7% | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 · 문구 작성 · 정해진 보기 칸 LLM 유지 |
| [L_PH_MI_FB_A](layouts/L_PH_MI_FB_A.md) | 외식 · 카페 · 시장 · 트렌드 · 사진 | pictures · review · verify | 17.6 → 12.1초 | 1.6 → 1.0 | — | 모든 decision 단계 사용 |
| [L_PH_MI_FB_B](layouts/L_PH_MI_FB_B.md) | 고객 비즈니스 · 운영 과제 · 사진 | pictures · review · verify | 16.9 → 9.3초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_PH_MI_FN_C](layouts/L_PH_MI_FN_C.md) | 금융 · 고객 여정 · 사진 | cells · pictures · review · verify | 13.4 → 9.7초 | 0.8 → 0.4 | 100% | 모든 decision 단계 사용 |
| [L_PH_MI_HT_B](layouts/L_PH_MI_HT_B.md) | 호텔 · 리조트 · 고객 비즈니스 · 운영  | pictures · review · verify | 17.1 → 11.2초 | 1.0 → 0.8 | — | 모든 decision 단계 사용 |
| [L_PH_MI_HT_C](layouts/L_PH_MI_HT_C.md) | 호텔 · 리조트 · 고객 여정 · 사진 | cells · pictures · review · verify | 14.6 → 12.3초 | 0.6 → 0.6 | 30% | 모든 decision 단계 사용 |
| [L_PH_MI_MD_A](layouts/L_PH_MI_MD_A.md) | 의료 · 요양 · 케어 · 시장 · 트렌드  | pictures · review · verify | 17.1 → 12.8초 | 1.8 → 1.4 | — | 모든 decision 단계 사용 |
| [L_PH_MI_MD_C](layouts/L_PH_MI_MD_C.md) | 의료 · 요양 · 케어 · 고객 여정 · 사 | cells · pictures · review · verify | 13.7 → 11.2초 | 6.4 → 7.8 | 76% | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 · 사진 검수 · 고르기 LLM 유지 |
| [L_PH_MI_MF_B](layouts/L_PH_MI_MF_B.md) | 제조 · 물류 · 현장 · 고객 비즈니스 · | pictures · review · verify | 16.9 → 9.7초 | 0.8 → 4.0 | — | 모든 decision 단계 사용 |
| [L_PH_MI_MF_C](layouts/L_PH_MI_MF_C.md) | 제조 · 물류 · 현장 · 고객 여정 · 사 | cells · pictures · review · verify | 15.6 → 10.6초 | 1.2 → 2.6 | 0% | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 · 문구 작성 · 정해진 보기 칸 LLM 유지 |
| [L_PH_MI_OF_C](layouts/L_PH_MI_OF_C.md) | 오피스 · 업무 빌딩 · 고객 여정 · 사진 | cells · pictures · review · verify | 12.9 → 6.8초 | 6.4 → 2.6 | 84% | 모든 decision 단계 사용 |
| [L_PH_MI_PB_C](layouts/L_PH_MI_PB_C.md) | 공공 · 교통 인프라 · 고객 여정 · 사진 | cells · pictures · review · verify | 14.6 → 12.8초 | 1.8 → 1.6 | 12% | 모든 decision 단계 사용 |
| [L_PH_MI_RS_C](layouts/L_PH_MI_RS_C.md) | 주거 분양 · 주택 · 고객 여정 · 사진 | cells · pictures · review · verify | 13.2 → 12.4초 | 0.4 → 1.4 | 80% | 모든 decision 단계 사용 |
| [L_PH_MI_RT_A](layouts/L_PH_MI_RT_A.md) | 시장 · 트렌드 · 사진 | pictures · review · verify | 16.0 → 11.9초 | 1.4 → 0.8 | — | 모든 decision 단계 사용 |
| [L_PH_MI_RT_B](layouts/L_PH_MI_RT_B.md) | 리테일 · 고객 비즈니스 · 운영 과제 ·  | pictures · review · verify | 14.4 → 6.6초 | 0.6 → 0.4 | — | 모든 decision 단계 사용 |
| [L_PH_MI_RT_C](layouts/L_PH_MI_RT_C.md) | 리테일 · 고객 여정 · 사진 | cells · pictures · review · verify | 14.5 → 9.9초 | 0.6 → 1.2 | 64% | 모든 decision 단계 사용 |
| [L_PH_MI_SV_B](layouts/L_PH_MI_SV_B.md) | 고객 비즈니스 · 운영 과제 · 사진 | pictures · review · verify | 15.3 → 9.9초 | 1.8 → 2.0 | — | 모든 decision 단계 사용 |
| [L_PH_MI_TP_B](layouts/L_PH_MI_TP_B.md) | 고객 비즈니스 · 운영 과제 · 사진 | pictures · review · verify | 15.9 → 8.6초 | 0.4 → 0.8 | — | 모든 decision 단계 사용 |
| [L_PH_MI_TP_C](layouts/L_PH_MI_TP_C.md) | 테마파크 · 관광 · 전시 · 고객 여정 · | cells · pictures · review · verify | 16.4 → 13.3초 | 1.4 → 0.8 | 20% | 모든 decision 단계 사용 |
| [L_PH_MS_C](layouts/L_PH_MS_C.md) | 시장 규모 · 세그먼트 사진 | pictures · review · verify | 16.1 → 10.8초 | 1.6 → 2.0 | — | 모든 decision 단계 사용 |
| [L_PH_MT_A](layouts/L_PH_MT_A.md) | 유지보수 점검 캘린더 · 설비 사진 | cells · pictures · review · verify | 14.7 → 7.8초 | 1.6 → 1.2 | 68% | 모든 decision 단계 사용 |
| [L_PH_MT_B](layouts/L_PH_MT_B.md) | 케어 플랜 3등급 · 장면 사진 카드 | pictures · review · verify | 14.2 → 9.4초 | 1.4 → 1.2 | — | 모든 decision 단계 사용 |
| [L_PH_OG_A](layouts/L_PH_OG_A.md) | 추진 체계 · 팀별 현장 사진 | pictures · review · verify | 14.2 → 8.4초 | 1.0 → 1.4 | — | 모든 decision 단계 사용 |
| [L_PH_OV_A](layouts/L_PH_OV_A.md) | 사업 이해 · 현장 사진 | pictures · review · verify | 15.5 → 12.4초 | 1.0 → 0.6 | — | 모든 decision 단계 사용 |
| [L_PH_OV_E](layouts/L_PH_OV_E.md) | 왜 · 무엇을 · 어떻게 · 얼마나 · 사진 | pictures · review · verify | 17.6 → 11.9초 | 0.4 → 2.2 | — | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 |
| [L_PH_OV_H](layouts/L_PH_OV_H.md) | 세 가지 약속 · 키 비주얼 매장 사진 | pictures · review · verify | 14.9 → 10.0초 | 0.6 → 0.6 | — | 모든 decision 단계 사용 |
| [L_PH_P3_A](layouts/L_PH_P3_A.md) | 제품 3 · 컷 + 설치 장면 | cells · pictures · review · verify | 13.7 → 8.0초 | 1.0 → 1.2 | 60% | 모든 decision 단계 사용 |
| [L_PH_P4_A](layouts/L_PH_P4_A.md) | 제품 4 · 설치 장면 | cells · pictures · review · verify | 15.2 → 10.0초 | 0.6 → 0.6 | 37% | 모든 decision 단계 사용 |
| [L_PH_P5_A](layouts/L_PH_P5_A.md) | 제품 5 · 설치 장면 5열 | pictures · review · verify | 19.6 → 12.3초 | 2.2 → 2.6 | — | 모든 decision 단계 사용 |
| [L_PH_PL_B](layouts/L_PH_PL_B.md) | 파일럿 설계 · 선정 지점 사진 | pictures · review · verify | 14.0 → 7.3초 | 1.4 → 1.6 | — | 모든 decision 단계 사용 |
| [L_PH_P_K](layouts/L_PH_P_K.md) | 공간 조건 → 대응 · 사진 위 번호 | pictures · review · verify | 14.1 → 10.8초 | 2.2 → 1.2 | — | 모든 decision 단계 사용 |
| [L_PH_P_L](layouts/L_PH_P_L.md) | 비디오월 · 실사 + 구성 | pictures · review · verify | 15.6 → 10.1초 | 1.6 → 1.2 | — | 모든 decision 단계 사용 |
| [L_PH_P_N](layouts/L_PH_P_N.md) | 기존 장비 → 교체 · 도입 후 사진 | cells · pictures · review · verify | 13.1 → 11.4초 | 0.8 → 1.2 | 15% | 모든 decision 단계 사용 |
| [L_PH_P_O](layouts/L_PH_P_O.md) | 구성 3안 · 공간 사진 | cells · pictures · review · verify | 14.3 → 9.5초 | 0.8 → 0.8 | 50% | 모든 decision 단계 사용 |
| [L_PH_P_R](layouts/L_PH_P_R.md) | 한 세대 패키지 · 주방 사진 위 번호 | cells · pictures · review · verify | 13.3 → 9.4초 | 0.6 → 0.8 | 49% | 모든 decision 단계 사용 |
| [L_PH_QA_A](layouts/L_PH_QA_A.md) | 예상 질문 여섯 · 질문마다 근거 장면 사진 | pictures · review · verify | 16.1 → 12.6초 | 1.4 → 1.0 | — | 모든 decision 단계 사용 |
| [L_PH_RQ_A](layouts/L_PH_RQ_A.md) | 요구사항 대응 · 분야별 사진 5 | pictures · review · verify | 20.9 → 14.8초 | 0.8 → 1.6 | — | 모든 decision 단계 사용 |
| [L_PH_RQ_B](layouts/L_PH_RQ_B.md) | 평가 항목 · 배점 비례 사진 타일 | cells · pictures · review · verify | 15.2 → 15.3초 | 4.0 → 6.4 | 20% | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 · 문구 작성 · 정해진 보기 칸 LLM 유지 |
| [L_PH_RQ_C](layouts/L_PH_RQ_C.md) | 키맨별 요구 · 인물 사진 4 | cells · pictures · review · verify | 13.9 → 7.5초 | 1.6 → 1.4 | 7% | 모든 decision 단계 사용 |
| [L_PH_RV_A](layouts/L_PH_RV_A.md) | 분양 포인트 4 · 공간 사진 | pictures · review · verify | 17.1 → 11.4초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_PH_SA_B](layouts/L_PH_SA_B.md) | 허브형 · 실사 | pictures · review · verify | 14.9 → 8.9초 | 0.2 → 0.2 | — | 모든 decision 단계 사용 |
| [L_PH_SA_C](layouts/L_PH_SA_C.md) | 구성 레이어 · 층마다 실사 | cells · pictures · review · verify | 14.1 → 7.0초 | 1.8 → 2.0 | 27% | 모든 decision 단계 사용 |
| [L_PH_SC_A](layouts/L_PH_SC_A.md) | 사양 비교 · 제품 사진 3 | cells · pictures · review · verify | 9.8 → 9.5초 | 0.6 → 0.4 | 43% | 모든 decision 단계 사용 |
| [L_PH_SD_G](layouts/L_PH_SD_G.md) | LED 피치 · 시청 거리 — 관람 공간 사 | pictures · review · verify | 14.5 → 11.8초 | 5.6 → 4.2 | — | 모든 decision 단계 사용 |
| [L_PH_SE_A](layouts/L_PH_SE_A.md) | 보안 요건 대응 · Knox 화면 | cells · pictures · review · verify | 14.2 → 15.8초 | 1.4 → 1.0 | 53% | 사진 검수 · 고르기 LLM 유지 |
| [L_PH_SE_C](layouts/L_PH_SE_C.md) | 개인정보 처리 흐름 · 화면 사진 | pictures · review · verify | 15.1 → 8.2초 | 3.2 → 3.0 | — | 모든 decision 단계 사용 |
| [L_PH_SF_B](layouts/L_PH_SF_B.md) | 기능 → 고객 효과 · 현장 + 화면 | pictures · review · verify | 16.2 → 10.7초 | 1.4 → 1.8 | — | 모든 decision 단계 사용 |
| [L_PH_SM_D](layouts/L_PH_SM_D.md) | 층별 · 층마다 공간 사진 | pictures · review · verify | 16.8 → 11.9초 | 1.4 → 1.8 | — | 모든 decision 단계 사용 |
| [L_PH_SOL_S](layouts/L_PH_SOL_S.md) | 솔루션 시나리오 · 장면 4 사진 | pictures · review · verify | 16.6 → 12.0초 | 2.4 → 1.8 | — | 모든 decision 단계 사용 |
| [L_PH_SO_B](layouts/L_PH_SO_B.md) | 장면 → 화면 → 결과 · 인물 사진 3행 | pictures · review · verify | 17.4 → 12.0초 | 1.8 → 1.8 | — | 모든 decision 단계 사용 |
| [L_PH_SS_A](layouts/L_PH_SS_A.md) | 공간 맵 · 포토 모자이크 | cells · pictures · review · verify | 14.5 → 8.2초 | 1.4 → 1.2 | 20% | 모든 decision 단계 사용 |
| [L_PH_SS_AD_C](layouts/L_PH_SS_AD_C.md) | 하루 시나리오 · 시간대 사진 5 | pictures · review · verify | 18.5 → 11.7초 | 10.0 → 11.0 | — | 모든 decision 단계 사용 |
| [L_PH_SS_AD_E](layouts/L_PH_SS_AD_E.md) | 옥외 · 미디어 광고 · 거리 미디어폴 ·  | cells · pictures · review · verify | 15.5 → 11.2초 | 1.4 → 1.0 | 30% | 모든 decision 단계 사용 |
| [L_PH_SS_ED_A](layouts/L_PH_SS_ED_A.md) | 교육 · 캠퍼스 · 공간 맵 · 공간 사진  | cells · pictures · review · verify | 18.2 → 13.2초 | 2.8 → 4.2 | 60% | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 |
| [L_PH_SS_ED_B](layouts/L_PH_SS_ED_B.md) | 교육 · 캠퍼스 · 대표 공간 네 장면 ·  | cells · pictures · review · verify | 15.6 → 9.3초 | 1.8 → 1.6 | 25% | 모든 decision 단계 사용 |
| [L_PH_SS_FB_A](layouts/L_PH_SS_FB_A.md) | 외식 · 카페 · 공간 맵 · 공간 사진 7 | cells · pictures · review · verify | 15.3 → 11.9초 | 1.0 → 2.0 | 42% | 모든 decision 단계 사용 |
| [L_PH_SS_FB_D](layouts/L_PH_SS_FB_D.md) | 운영 모드 둘 · 사진 비교 | cells · pictures · review · verify | 11.5 → 12.7초 | 1.0 → 1.6 | 71% | 모든 decision 단계 사용 |
| [L_PH_SS_FN_E](layouts/L_PH_SS_FN_E.md) | 금융 · 방문 상담 · 현장 영업 · 단계별 | cells · pictures · review · verify | 16.7 → 15.7초 | 1.0 → 1.0 | 33% | 모든 decision 단계 사용 |
| [L_PH_SS_HT_A](layouts/L_PH_SS_HT_A.md) | 호텔 · 리조트 · 공간 맵 · 공간 사진  | cells · pictures · review · verify | 18.0 → 11.4초 | 1.6 → 0.8 | 45% | 모든 decision 단계 사용 |
| [L_PH_SS_HT_B](layouts/L_PH_SS_HT_B.md) | 대표 공간 네 장면 · 사진 | cells · pictures · review · verify | 14.7 → 9.8초 | 3.6 → 3.2 | 45% | 모든 decision 단계 사용 |
| [L_PH_SS_MD_A](layouts/L_PH_SS_MD_A.md) | 의료 · 요양 · 케어 · 공간 맵 · 공간 | cells · pictures · review · verify | 16.9 → 12.2초 | 1.0 → 1.4 | 66% | 모든 decision 단계 사용 |
| [L_PH_SS_OE_B](layouts/L_PH_SS_OE_B.md) | 파트너 전용 단말 · 대표 공간 네 장면 · | cells · pictures · review · verify | 16.6 → 10.4초 | 0.6 → 1.6 | 30% | 모든 decision 단계 사용 |
| [L_PH_SS_OE_D](layouts/L_PH_SS_OE_D.md) | 파트너 전용 단말 · 매장 · 개통 카운터  | cells · pictures · review · verify | 16.7 → 12.6초 | 1.8 → 2.0 | 60% | 모든 decision 단계 사용 |
| [L_PH_SS_OF_A](layouts/L_PH_SS_OF_A.md) | 오피스 · 업무 빌딩 · 공간 맵 · 공간  | cells · pictures · review · verify | 19.4 → 11.6초 | 1.4 → 1.6 | 36% | 모든 decision 단계 사용 |
| [L_PH_SS_OF_D](layouts/L_PH_SS_OF_D.md) | 오피스 · 업무 빌딩 · 로비 · 외벽 ·  | cells · pictures · review · verify | 16.9 → 13.2초 | 1.4 → 3.2 | 8% | 문구 작성 · 정해진 보기 칸 LLM 유지 |
| [L_PH_SS_PB_D](layouts/L_PH_SS_PB_D.md) | 공공 · 교통 인프라 · 역사 · 정류장 · | cells · pictures · review · verify | 16.6 → 15.3초 | 1.8 → 1.2 | 60% | 모든 decision 단계 사용 |
| [L_PH_SS_RS_A](layouts/L_PH_SS_RS_A.md) | 주거 분양 · 주택 · 공간 맵 · 공간 사 | cells · pictures · review · verify | 18.0 → 10.3초 | 1.4 → 1.2 | 30% | 모든 decision 단계 사용 |
| [L_PH_SS_RT_A](layouts/L_PH_SS_RT_A.md) | 리테일 · 공간 맵 · 공간 사진 7 | cells · pictures · review · verify | 18.6 → 14.0초 | 0.2 → 3.6 | 23% | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 · 문구 작성 · 정해진 보기 칸 LLM 유지 |
| [L_PH_SS_RT_D](layouts/L_PH_SS_RT_D.md) | 동선 다섯 지점 · 사진 | cells · pictures · review · verify | 13.3 → 11.5초 | 0.4 → 0.6 | 20% | 모든 decision 단계 사용 |
| [L_PH_SS_TP_A](layouts/L_PH_SS_TP_A.md) | 테마파크 · 관광 · 전시 · 공간 맵 ·  | cells · pictures · review · verify | 19.4 → 12.0초 | 1.0 → 0.8 | 44% | 모든 decision 단계 사용 |
| [L_PH_SS_VN_A](layouts/L_PH_SS_VN_A.md) | 공연장 · 경기장 · 영화관 · 공간 맵 · | cells · pictures · review · verify | 16.8 → 9.6초 | 1.0 → 1.8 | 75% | 모든 decision 단계 사용 |
| [L_PH_ST_A](layouts/L_PH_ST_A.md) | 강점 3 · 풀하이트 사진 | pictures | 2.5 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_PH_SV_B](layouts/L_PH_SV_B.md) | 서비스 · 엔지니어 사진 + SLA | pictures | 2.6 → 0.3초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_PH_TO_A](layouts/L_PH_TO_A.md) | 교육 계획 · 대상별 사진 | pictures · review · verify | 15.4 → 9.7초 | 2.4 → 2.8 | — | 모든 decision 단계 사용 |
| [L_PH_TO_B](layouts/L_PH_TO_B.md) | 운영 이관 3단계 · 단계 사진 | pictures · review · verify | 13.9 → 8.5초 | 1.2 → 0.8 | — | 모든 decision 단계 사용 |
| [L_PH_TR_A](layouts/L_PH_TR_A.md) | 트렌드 4 · 포토 카드 | pictures · review · verify | 17.1 → 12.5초 | 2.4 → 2.6 | — | 모든 decision 단계 사용 |
| [L_PH_US_H](layouts/L_PH_US_H.md) | 사람마다 쓰는 기기 · 인물 사진 + 제품  | pictures · review · verify | 16.4 → 11.3초 | 1.0 → 2.0 | — | 모든 decision 단계 사용 |
| [L_PH_VC_1](layouts/L_PH_VC_1.md) | 한 공간 · 솔루션 N개 · 사진 위 번호 | cells · pictures · review · verify | 14.0 → 10.1초 | 0.6 → 0.4 | 73% | 모든 decision 단계 사용 |
| [L_PH_VP_B](layouts/L_PH_VP_B.md) | 가치 기둥 3 · 포토 | pictures · review · verify | 14.6 → 10.1초 | 2.4 → 2.2 | — | 모든 decision 단계 사용 |
| [L_PH_VP_B2](layouts/L_PH_VP_B2.md) | 가치 기둥 2 · 포토 | pictures · review · verify | 13.1 → 9.1초 | 2.0 → 1.4 | — | 모든 decision 단계 사용 |
| [L_PH_VP_B4](layouts/L_PH_VP_B4.md) | 가치 기둥 4 · 포토 2×2 | pictures · review · verify | 13.7 → 9.5초 | 0.4 → 0.8 | — | 모든 decision 단계 사용 |
| [L_PH_VP_C](layouts/L_PH_VP_C.md) | 한 문장 + 근거 3 · 풀블리드 | pictures · review · verify | 15.5 → 10.2초 | 0.8 → 1.0 | — | 모든 decision 단계 사용 |
| [L_PH_VP_D](layouts/L_PH_VP_D.md) | 이해관계자별 가치 · 사진 | pictures · review · verify | 16.3 → 11.7초 | 2.4 → 2.6 | — | 모든 decision 단계 사용 |
| [L_PH_VP_L](layouts/L_PH_VP_L.md) | 같은 자리 · 도입 전 → 후 사진 | pictures · review · verify | 14.0 → 8.8초 | 2.4 → 2.2 | — | 모든 decision 단계 사용 |
| [L_PH_VP_U](layouts/L_PH_VP_U.md) | 현장 질문 3 · 질문이 나온 자리 사진 | pictures · review · verify | 15.9 → 8.8초 | 1.4 → 1.8 | — | 모든 decision 단계 사용 |
| [L_SAC_S_GF](layouts/L_SAC_S_GF.md) | 시스템에어컨 제어 공간 시나리오 · 스크린골 | cells · pictures · review · verify | 9.9 → 11.3초 | 1.8 → 0.8 | 30% | 모든 decision 단계 사용 |
| [L_SA_D](layouts/L_SA_D.md) | 화면 → 현장 | pictures · review · verify | 14.8 → 10.8초 | 1.2 → 1.0 | — | 모든 decision 단계 사용 |
| [L_SC_B](layouts/L_SC_B.md) | 요구사항 대응표 | cells · review · verify | 12.5 → 14.2초 | 2.6 → 1.4 | 51% | 모든 decision 단계 사용 |
| [L_SD_E](layouts/L_SD_E.md) | 모바일 · 현장 단말 사양 | cells · pictures · review · verify | 10.8 → 11.5초 | 1.4 → 0.6 | 33% | 모든 decision 단계 사용 |
| [L_SD_F](layouts/L_SD_F.md) | 빌트인 가전 사양 | cells · review · verify | 11.6 → 10.4초 | 2.2 → 1.2 | 67% | 모든 decision 단계 사용 |
| [L_SE_B](layouts/L_SE_B.md) | 인증 · 규격 현황 | cells · pictures · review · verify | 11.5 → 12.1초 | 0.8 → 1.0 | 100% | 모든 decision 단계 사용 |
| [L_SF_E](layouts/L_SF_E.md) | 솔루션 포트폴리오 타일 | cells · pictures · review · verify | 13.7 → 6.9초 | 1.0 → 2.0 | 33% | 모든 decision 단계 사용 |
| [L_SOL_03](layouts/L_SOL_03.md) | 공간 지도 · 아이소메트릭 평면도 + 가치  | cells · pictures · review · verify | 11.7 → 7.7초 | 0.8 → 1.0 | 70% | 모든 decision 단계 사용 |
| [L_SPATIAL_2D](layouts/L_SPATIAL_2D.md) | 공간 조감도 · 2D · 공간·제품 연결 | cells · pictures · review · verify | 11.3 → 8.5초 | 0.8 → 0.8 | 87% | 모든 decision 단계 사용 |
| [L_SPATIAL_3D](layouts/L_SPATIAL_3D.md) | 공간 조감도 · 3D · 공간·제품 연결 | cells · pictures · review · verify | 13.7 → 8.5초 | 0.8 → 0.6 | 63% | 모든 decision 단계 사용 |
| [L_SPEC4](layouts/L_SPEC4.md) | 사양 비교표 · 제품 4개 | cells · review · verify | 14.5 → 13.2초 | 1.6 → 2.6 | 50% | 모든 decision 단계 사용 |
| [L_SPEC5](layouts/L_SPEC5.md) | 사양 비교표 · 제품 5개 | cells · review · verify | 12.2 → 9.7초 | 1.4 → 2.4 | 60% | 모든 decision 단계 사용 |
| [L_SS_D](layouts/L_SS_D.md) | 이벤트 대응 시나리오 | cells · pictures · review · verify | 13.2 → 12.1초 | 4.6 → 5.6 | 60% | 모든 decision 단계 사용 |
| [L_STP_I](layouts/L_STP_I.md) | SmartThings Pro 소개 | pictures · review · verify | 11.3 → 8.3초 | 1.0 → 1.0 | — | 모든 decision 단계 사용 |
| [L_STP_S_GF](layouts/L_STP_S_GF.md) | SmartThings Pro 공간 시나리오  | cells · pictures · review · verify | 9.9 → 6.6초 | 2.2 → 1.4 | 0% | 모든 decision 단계 사용 |
| [L_STP_S_OF](layouts/L_STP_S_OF.md) | SmartThings Pro 공간 시나리오  | cells · pictures · review · verify | 10.4 → 7.6초 | 0.8 → 2.0 | 0% | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 · 문구 작성 · 정해진 보기 칸 LLM 유지 |
| [L_ST_D](layouts/L_ST_D.md) | 강점 × 증거 사진 | pictures · review · verify | 11.0 → 6.4초 | 0.6 → 0.4 | — | 모든 decision 단계 사용 |
| [L_SUB_BLUEPASS](layouts/L_SUB_BLUEPASS.md) | B2B 블루패스 · 숫자 3 + 서비스 4 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_CARE4](layouts/L_SUB_CARE4.md) | 전문 케어 4단계 · 사진 + 단계 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_CAREOPT](layouts/L_SUB_CAREOPT.md) | 관리 옵션 비교 · 무상수리 vs 방문케어 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_COMPARE](layouts/L_SUB_COMPARE.md) | 구매 방식 비교 · 일시불 vs 구독 5 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_FLOW](layouts/L_SUB_FLOW.md) | 도입 절차 6 · 단계 + 문의 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_ITEMS](layouts/L_SUB_ITEMS.md) | 구독 품목 8 · 제품 컷 타일 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_ONE](layouts/L_SUB_ONE.md) | 구독 한 장 요약 · 가치 · 조건 · 패키 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_PAIN](layouts/L_SUB_PAIN.md) | 현장의 고민 4 · 사진 + 해결 한 줄 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_PAY3](layouts/L_SUB_PAY3.md) | 맞춤 납부안 3 · 추천 + 비교 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_PKG3](layouts/L_SUB_PKG3.md) | 업종 구독 패키지 상세 · 사진 + 품목 3 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_PKG4](layouts/L_SUB_PKG4.md) | 업종 구독 패키지 상세 · 사진 + 품목 4 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_PROMO](layouts/L_SUB_PROMO.md) | 도입 혜택 · 기간 한정 할인 3 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_TERMS](layouts/L_SUB_TERMS.md) | 구독 조건 · 숫자 4 + 대상 · 조건 · | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SUB_VALUE3](layouts/L_SUB_VALUE3.md) | 구독 가치 3 · 사진 카드 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_SV_C](layouts/L_SV_C.md) | 서비스 현장 4단계 | pictures · review · verify | 11.4 → 6.3초 | 0.2 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_BOM3](layouts/L_TOC_BOM3.md) | 구성 · 수량표 · 공간 3 × 제품 5 | cells · pictures · review · verify | 11.3 → 5.9초 | 2.0 → 0.6 | 64% | 모든 decision 단계 사용 |
| [L_TOC_BOM4](layouts/L_TOC_BOM4.md) | 구성 · 수량표 · 공간 4 × 제품 5 | cells · pictures · review · verify | 10.6 → 6.7초 | 1.4 → 1.0 | 56% | 모든 decision 단계 사용 |
| [L_TOC_BOM5](layouts/L_TOC_BOM5.md) | 구성 · 수량표 · 공간 5 × 제품 5 | cells · pictures · review · verify | 8.9 → 6.4초 | 1.2 → 0.8 | 76% | 모든 decision 단계 사용 |
| [L_TOC_BOM6](layouts/L_TOC_BOM6.md) | 구성 · 수량표 · 공간 6 × 제품 5 | cells · pictures · review · verify | 10.0 → 6.3초 | 1.6 → 1.2 | 56% | 모든 decision 단계 사용 |
| [L_TOC_BOM7](layouts/L_TOC_BOM7.md) | 구성 · 수량표 · 공간 7 × 제품 5 | cells · pictures · review · verify | 11.0 → 6.2초 | 1.8 → 1.4 | 64% | 모든 decision 단계 사용 |
| [L_TOC_BOM8](layouts/L_TOC_BOM8.md) | 구성 · 수량표 · 공간 8 × 제품 5 | cells · pictures · review · verify | 9.4 → 5.6초 | 1.0 → 0.8 | 64% | 모든 decision 단계 사용 |
| [L_TOC_CPPOS](layouts/L_TOC_CPPOS.md) | 경쟁사 비교 · 포지셔닝 맵 (두 축 + 이 | pictures · review · verify | 11.7 → 6.5초 | 1.6 → 1.8 | — | 모든 decision 단계 사용 |
| [L_TOC_CPSCORE](layouts/L_TOC_CPSCORE.md) | 경쟁사 비교 · 기준별 점수표 (기준 5 × | cells · pictures · review · verify | 11.3 → 13.1초 | 3.2 → 1.6 | 22% | 모든 decision 단계 사용 |
| [L_TOC_CPWIN](layouts/L_TOC_CPWIN.md) | 경쟁사 비교 · 차별점 3 (사진 + 숫자  | cells · pictures · review · verify | 13.1 → 9.2초 | 1.0 → 1.4 | 22% | 모든 decision 단계 사용 |
| [L_TOC_INDEX10](layouts/L_TOC_INDEX10.md) | 목차 · 10개 목차 사진 카드 | review · verify | 0.0 → 0.0초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_INDEX4](layouts/L_TOC_INDEX4.md) | 목차 · 4개 목차 사진 카드 | review · verify | 0.0 → 0.0초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_INDEX5](layouts/L_TOC_INDEX5.md) | 목차 · 5개 목차 사진 카드 | review · verify | 0.0 → 0.0초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_INDEX6](layouts/L_TOC_INDEX6.md) | 목차 · 6개 목차 사진 카드 | review · verify | 0.0 → 0.0초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_INDEX7](layouts/L_TOC_INDEX7.md) | 목차 · 7개 목차 사진 카드 | review · verify | 0.0 → 0.0초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_INDEX8](layouts/L_TOC_INDEX8.md) | 목차 · 8개 목차 사진 카드 | review · verify | 0.0 → 0.0초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_INDEX9](layouts/L_TOC_INDEX9.md) | 목차 · 9개 목차 사진 카드 | review · verify | 0.0 → 0.0초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_JOURNEY1](layouts/L_TOC_JOURNEY1.md) | 공간별 가치 제안 · 여정 1공간 + 솔루션 | cells · pictures · review · verify | 10.1 → 8.2초 | 0.4 → 1.0 | 100% | 모든 decision 단계 사용 |
| [L_TOC_JOURNEY1S](layouts/L_TOC_JOURNEY1S.md) | 공간별 가치 제안 · 여정 1공간 + 솔루션 | cells · pictures · review · verify | 9.5 → 7.7초 | 1.0 → 1.4 | 100% | 모든 decision 단계 사용 |
| [L_TOC_JOURNEY2](layouts/L_TOC_JOURNEY2.md) | 공간별 가치 제안 · 여정 2공간 + 솔루션 | cells · pictures · review · verify | 11.6 → 5.8초 | 1.2 → 1.2 | 50% | 모든 decision 단계 사용 |
| [L_TOC_JOURNEY2S](layouts/L_TOC_JOURNEY2S.md) | 공간별 가치 제안 · 여정 2공간 + 솔루션 | cells · pictures · review · verify | 10.8 → 9.1초 | 1.2 → 1.0 | 90% | 모든 decision 단계 사용 |
| [L_TOC_JOURNEY3](layouts/L_TOC_JOURNEY3.md) | 공간별 가치 제안 · 여정 3공간 + 솔루션 | cells · pictures · review · verify | 13.1 → 9.4초 | 1.2 → 1.6 | 100% | 모든 decision 단계 사용 |
| [L_TOC_JOURNEY3S](layouts/L_TOC_JOURNEY3S.md) | 공간별 가치 제안 · 여정 3공간 + 솔루션 | cells · pictures · review · verify | 13.6 → 11.0초 | 1.6 → 1.2 | 93% | 모든 decision 단계 사용 |
| [L_TOC_KPI](layouts/L_TOC_KPI.md) | 기대 효과 · KPI 4 전후 비교 | review · verify | 12.0 → 9.3초 | 3.0 → 2.0 | — | 모든 decision 단계 사용 |
| [L_TOC_PILOT](layouts/L_TOC_PILOT.md) | 파일럿 · 확산 3단계 계단 | review · verify | 11.8 → 7.8초 | 0.4 → 0.6 | — | 모든 decision 단계 사용 |
| [L_TOC_PSPEC](layouts/L_TOC_PSPEC.md) | Spec · 제품 하나 (숫자 3 + 사양  | cells · pictures · review · verify | 12.0 → 7.4초 | 2.6 → 2.8 | 100% | 모든 decision 단계 사용 |
| [L_TOC_PSPEC_R12](layouts/L_TOC_PSPEC_R12.md) | 제품 스펙 · 사양 12줄까지 (1열) | cells · pictures · review · verify | 9.6 → 9.3초 | 2.4 → 1.0 | 100% | 모든 decision 단계 사용 |
| [L_TOC_PSPEC_R24](layouts/L_TOC_PSPEC_R24.md) | 제품 스펙 · 사양 24줄까지 (2열) | cells · pictures · review · verify | 10.3 → 10.5초 | 4.2 → 2.6 | 100% | 모든 decision 단계 사용 |
| [L_TOC_PSPEC_R36](layouts/L_TOC_PSPEC_R36.md) | 제품 스펙 · 사양 36줄까지 (2열 · 촘 | cells · pictures · review · verify | 12.2 → 13.3초 | 7.4 → 2.2 | 100% | 모든 decision 단계 사용 |
| [L_TOC_RFP](layouts/L_TOC_RFP.md) | 요구사항 대응 · 평가 항목 5 | cells · review · verify | 10.0 → 8.5초 | 2.2 → 2.2 | 20% | 모든 decision 단계 사용 |
| [L_TOC_ROADMAP](layouts/L_TOC_ROADMAP.md) | 실행 계획 · 4단계 로드맵 | review · verify | 10.7 → 6.6초 | 0.2 → 0.6 | — | 모든 decision 단계 사용 |
| [L_TOC_SCN_MAP10](layouts/L_TOC_SCN_MAP10.md) | 고객/공간 시나리오 · 활용 맵 · 공간 1 | cells · review · verify | 13.8 → 10.1초 | 1.4 → 3.2 | 55% | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 |
| [L_TOC_SCN_MAP2](layouts/L_TOC_SCN_MAP2.md) | 고객/공간 시나리오 · 활용 맵 · 공간 2 | cells · review · verify | 12.1 → 8.2초 | 1.0 → 1.8 | 33% | 모든 decision 단계 사용 |
| [L_TOC_SCN_MAP3](layouts/L_TOC_SCN_MAP3.md) | 고객/공간 시나리오 · 활용 맵 · 공간 3 | cells · review · verify | 12.6 → 8.7초 | 1.8 → 1.4 | 31% | 모든 decision 단계 사용 |
| [L_TOC_SCN_MAP4](layouts/L_TOC_SCN_MAP4.md) | 고객/공간 시나리오 · 활용 맵 · 공간 4 | cells · review · verify | 13.4 → 7.9초 | 1.8 → 1.4 | 58% | 모든 decision 단계 사용 |
| [L_TOC_SCN_MAP5](layouts/L_TOC_SCN_MAP5.md) | 고객/공간 시나리오 · 활용 맵 · 공간 5 | cells · review · verify | 12.5 → 9.2초 | 1.0 → 1.6 | 38% | 모든 decision 단계 사용 |
| [L_TOC_SCN_MAP6](layouts/L_TOC_SCN_MAP6.md) | 고객/공간 시나리오 · 활용 맵 · 공간 6 | cells · review · verify | 11.3 → 10.3초 | 1.4 → 1.8 | 25% | 모든 decision 단계 사용 |
| [L_TOC_SCN_MAP7](layouts/L_TOC_SCN_MAP7.md) | 고객/공간 시나리오 · 활용 맵 · 공간 7 | cells · review · verify | 12.8 → 10.6초 | 0.8 → 1.2 | 56% | 모든 decision 단계 사용 |
| [L_TOC_SCN_MAP8](layouts/L_TOC_SCN_MAP8.md) | 고객/공간 시나리오 · 활용 맵 · 공간 8 | cells · review · verify | 12.6 → 10.3초 | 1.4 → 0.8 | 25% | 모든 decision 단계 사용 |
| [L_TOC_SCN_MAP9](layouts/L_TOC_SCN_MAP9.md) | 고객/공간 시나리오 · 활용 맵 · 공간 9 | cells · review · verify | 11.7 → 10.6초 | 1.0 → 1.6 | 53% | 모든 decision 단계 사용 |
| [L_TOC_SCN_S2](layouts/L_TOC_SCN_S2.md) | 고객/공간 시나리오 · 공간별 시나리오 ·  | pictures · review · verify | 17.7 → 11.9초 | 3.0 → 2.8 | — | 모든 decision 단계 사용 |
| [L_TOC_SCN_S3](layouts/L_TOC_SCN_S3.md) | 고객/공간 시나리오 · 공간별 시나리오 ·  | pictures · review · verify | 20.1 → 14.8초 | 2.4 → 2.0 | — | 모든 decision 단계 사용 |
| [L_TOC_SPEC](layouts/L_TOC_SPEC.md) | 제품 사양 · 제품 3 비교 | cells · pictures · review · verify | 2.4 → 2.4초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_SUMMARY](layouts/L_TOC_SUMMARY.md) | 제안 요약 · 과제 → 제안 → 효과 → 요 | review · verify | 11.2 → 7.5초 | 1.2 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_SVC_MOBILE](layouts/L_TOC_SVC_MOBILE.md) | 서비스 · 삼성케어플러스 비즈니스 (보증 · | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_TOC_SVC_SAC](layouts/L_TOC_SVC_SAC.md) | 서비스 · 삼성케어플러스 SAC (유지보수  | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_TOC_TCO](layouts/L_TOC_TCO.md) | 비용 · 구매 방식 3 + 5년 총소유비용 | review · verify | 12.7 → 11.3초 | 0.8 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_TECH1](layouts/L_TOC_TECH1.md) | 핵심 기술 · 솔루션 1개 × 키워드 3 | pictures · review · verify | 10.6 → 6.0초 | 1.2 → 1.4 | — | 모든 decision 단계 사용 |
| [L_TOC_TECH2](layouts/L_TOC_TECH2.md) | 핵심 기술 · 솔루션 2개 × 키워드 3 | pictures · review · verify | 10.5 → 7.2초 | 1.0 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_TECH3](layouts/L_TOC_TECH3.md) | 핵심 기술 · 솔루션 3개 × 키워드 3 | pictures · review · verify | 11.6 → 6.6초 | 1.4 → 0.4 | — | 모든 decision 단계 사용 |
| [L_TOC_TECH4](layouts/L_TOC_TECH4.md) | 핵심 기술 · 솔루션 4개 × 키워드 3 | pictures · review · verify | 12.4 → 8.2초 | 1.0 → 2.6 | — | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 |
| [L_TOC_TRKEY](layouts/L_TOC_TRKEY.md) | 업종 트렌드 · 키워드 3 | pictures · review · verify | 11.1 → 6.5초 | 0.4 → 0.6 | — | 모든 decision 단계 사용 |
| [L_TOC_TRLINE](layouts/L_TOC_TRLINE.md) | 업종 트렌드 · 연도별 추이 막대 | review · verify | 12.2 → 8.5초 | 1.2 → 0.6 | — | 모든 decision 단계 사용 |
| [L_TOC_TRSHARE](layouts/L_TOC_TRSHARE.md) | 업종 트렌드 · 구성비 도넛 | review · verify | 10.6 → 6.5초 | 0.6 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_TRSTAT](layouts/L_TOC_TRSTAT.md) | 업종 트렌드 · 핵심 지표 3 | pictures · review · verify | 12.7 → 8.4초 | 0.0 → 0.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UAPAIN](layouts/L_TOC_UAPAIN.md) | 고객 과제 · 사진 3 + 과제 3 | pictures · review · verify | 12.8 → 7.2초 | 1.0 → 2.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UAPROF](layouts/L_TOC_UAPROF.md) | 고객사 분석 · 현황 지표 4 | pictures · review · verify | 12.5 → 7.0초 | 1.6 → 1.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_CU_EDGE](layouts/L_TOC_UA_CU_EDGE.md) | 문화 · 여가 · 집회 시설 · 핵심 스펙 | pictures · review · verify | 12.2 → 9.9초 | 2.2 → 1.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_CU_PROOF](layouts/L_TOC_UA_CU_PROOF.md) | 문화 · 여가 · 집회 시설 · 같은 업종  | pictures · review · verify | 11.4 → 7.1초 | 1.4 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_CU_REVENUE](layouts/L_TOC_UA_CU_REVENUE.md) | 문화 · 여가 · 집회 시설 · 콘텐츠 ·  | review · verify | 10.3 → 8.4초 | 2.0 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_CU_RIVAL](layouts/L_TOC_UA_CU_RIVAL.md) | 문화 · 여가 · 집회 시설 · 경쟁 구도  | pictures · review · verify | 11.0 → 6.8초 | 1.4 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_CU_ROUTE](layouts/L_TOC_UA_CU_ROUTE.md) | 문화 · 여가 · 집회 시설 · 관람 동선 | review · verify | 11.7 → 8.9초 | 1.0 → 0.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_CU_SEASON](layouts/L_TOC_UA_CU_SEASON.md) | 문화 · 여가 · 집회 시설 · 시즌 · 행 | review · verify | 10.8 → 6.0초 | 1.6 → 1.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_CU_VISIT](layouts/L_TOC_UA_CU_VISIT.md) | 문화 · 여가 · 집회 시설 · 규모 · 방 | review · verify | 10.8 → 8.7초 | 1.2 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_ED_BUDGET](layouts/L_TOC_UA_ED_BUDGET.md) | 학교 · 교육 · 예산 · 조달 | review · verify | 10.8 → 8.9초 | 3.2 → 3.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_ED_EDGE](layouts/L_TOC_UA_ED_EDGE.md) | 학교 · 교육 · 핵심 스펙 | pictures · review · verify | 10.2 → 8.2초 | 1.2 → 0.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_ED_PROOF](layouts/L_TOC_UA_ED_PROOF.md) | 학교 · 교육 · 같은 업종 사례 | pictures · review · verify | 12.0 → 5.8초 | 2.6 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_ED_RIVAL](layouts/L_TOC_UA_ED_RIVAL.md) | 학교 · 교육 · 경쟁 구도 · 통합 솔루션 | pictures · review · verify | 9.7 → 5.4초 | 1.4 → 1.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_ED_ROOMS](layouts/L_TOC_UA_ED_ROOMS.md) | 학교 · 교육 · 교실 · 기자재 | review · verify | 11.2 → 11.3초 | 3.0 → 2.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_ED_SCALE](layouts/L_TOC_UA_ED_SCALE.md) | 학교 · 교육 · 학생 · 학급 규모 | pictures · review · verify | 11.9 → 7.4초 | 2.2 → 2.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_ED_TERM](layouts/L_TOC_UA_ED_TERM.md) | 학교 · 교육 · 학사 일정 | review · verify | 10.9 → 8.7초 | 4.0 → 3.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FB_CYCLE](layouts/L_TOC_UA_FB_CYCLE.md) | 외식 · 카페 · 메뉴 · 행사 주기 | review · verify | 10.5 → 5.0초 | 1.4 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FB_EDGE](layouts/L_TOC_UA_FB_EDGE.md) | 외식 · 카페 · 핵심 스펙 | pictures · review · verify | 11.6 → 9.2초 | 2.0 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FB_HQ](layouts/L_TOC_UA_FB_HQ.md) | 외식 · 카페 · 운영 구조 | review · verify | 9.2 → 6.1초 | 0.2 → 0.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FB_PEAK](layouts/L_TOC_UA_FB_PEAK.md) | 외식 · 카페 · 주문 흐름 | review · verify | 9.7 → 8.1초 | 2.6 → 2.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FB_PROOF](layouts/L_TOC_UA_FB_PROOF.md) | 외식 · 카페 · 같은 업종 사례 | pictures · review · verify | 11.8 → 5.2초 | 1.2 → 1.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FB_RIVAL](layouts/L_TOC_UA_FB_RIVAL.md) | 외식 · 카페 · 경쟁 구도 · 통합 솔루션 | pictures · review · verify | 10.2 → 6.1초 | 1.0 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FB_STORES](layouts/L_TOC_UA_FB_STORES.md) | 외식 · 카페 · 매장망 | pictures · review · verify | 11.6 → 7.9초 | 1.0 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FN_BRANCH](layouts/L_TOC_UA_FN_BRANCH.md) | 금융 · 영업망 · 점포 유형 | review · verify | 12.4 → 8.2초 | 2.8 → 2.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FN_EDGE](layouts/L_TOC_UA_FN_EDGE.md) | 금융 · 핵심 스펙 | pictures · review · verify | 11.1 → 7.2초 | 1.6 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FN_PROOF](layouts/L_TOC_UA_FN_PROOF.md) | 금융 · 같은 업종 사례 | pictures · review · verify | 11.2 → 5.6초 | 1.0 → 1.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FN_RIVAL](layouts/L_TOC_UA_FN_RIVAL.md) | 금융 · 경쟁 구도 · 통합 솔루션 | pictures · review · verify | 8.2 → 4.9초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FN_SECURE](layouts/L_TOC_UA_FN_SECURE.md) | 금융 · 보안 · 규제 | review · verify | 10.4 → 8.1초 | 1.4 → 1.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FN_SHIFT](layouts/L_TOC_UA_FN_SHIFT.md) | 금융 · 디지털 전환 | review · verify | 10.5 → 7.2초 | 4.6 → 0.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_FN_VISIT](layouts/L_TOC_UA_FN_VISIT.md) | 금융 · 내점 고객 여정 | review · verify | 10.9 → 9.1초 | 0.8 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_HT_EDGE](layouts/L_TOC_UA_HT_EDGE.md) | 호텔 · 숙박 · 핵심 스펙 | pictures · review · verify | 11.5 → 9.5초 | 0.6 → 1.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_HT_GUEST](layouts/L_TOC_UA_HT_GUEST.md) | 호텔 · 숙박 · 투숙객 · 성수기 | review · verify | 11.1 → 7.9초 | 2.4 → 2.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_HT_PROOF](layouts/L_TOC_UA_HT_PROOF.md) | 호텔 · 숙박 · 같은 업종 사례 | pictures · review · verify | 11.0 → 4.6초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_HT_RIVAL](layouts/L_TOC_UA_HT_RIVAL.md) | 호텔 · 숙박 · 경쟁 구도 · 통합 솔루션 | pictures · review · verify | 10.3 → 6.5초 | 1.4 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_HT_ROOMS](layouts/L_TOC_UA_HT_ROOMS.md) | 호텔 · 숙박 · 객실 · 부대시설 | pictures · review · verify | 12.1 → 9.3초 | 2.8 → 2.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_HT_STD](layouts/L_TOC_UA_HT_STD.md) | 호텔 · 숙박 · 브랜드 표준 · 시스템 | review · verify | 10.6 → 10.4초 | 2.6 → 2.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_HT_TOUCH](layouts/L_TOC_UA_HT_TOUCH.md) | 호텔 · 숙박 · 투숙 여정 | review · verify | 13.4 → 10.5초 | 0.4 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MA_EDGE](layouts/L_TOC_UA_MA_EDGE.md) | 미디어 · 광고 · 핵심 스펙 | pictures · review · verify | 11.2 → 6.6초 | 2.4 → 0.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MA_MEDIA](layouts/L_TOC_UA_MA_MEDIA.md) | 미디어 · 광고 · 매체 현황 | review · verify | 11.8 → 8.1초 | 2.2 → 3.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MA_PROOF](layouts/L_TOC_UA_MA_PROOF.md) | 미디어 · 광고 · 같은 업종 사례 | pictures · review · verify | 11.1 → 5.0초 | 1.4 → 1.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MA_RIVAL](layouts/L_TOC_UA_MA_RIVAL.md) | 미디어 · 광고 · 경쟁 구도 · 통합 솔루 | pictures · review · verify | 10.2 → 6.5초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MA_SALES](layouts/L_TOC_UA_MA_SALES.md) | 미디어 · 광고 · 광고주 · 판매 방식 | review · verify | 10.7 → 7.9초 | 2.2 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MA_SLOT](layouts/L_TOC_UA_MA_SLOT.md) | 미디어 · 광고 · 편성 · 구좌 | review · verify | 10.3 → 10.7초 | 3.2 → 4.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MA_SPEC](layouts/L_TOC_UA_MA_SPEC.md) | 미디어 · 광고 · 규제 · 화질 기준 | review · verify | 10.5 → 9.3초 | 1.4 → 1.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MD_EDGE](layouts/L_TOC_UA_MD_EDGE.md) | 병의원 · 핵심 스펙 | pictures · review · verify | 10.6 → 8.4초 | 2.0 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MD_PATIENT](layouts/L_TOC_UA_MD_PATIENT.md) | 병의원 · 환자 여정 · 대기 | review · verify | 12.1 → 9.5초 | 1.8 → 1.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MD_PROOF](layouts/L_TOC_UA_MD_PROOF.md) | 병의원 · 같은 업종 사례 | pictures · review · verify | 11.2 → 6.0초 | 1.2 → 1.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MD_RIVAL](layouts/L_TOC_UA_MD_RIVAL.md) | 병의원 · 경쟁 구도 · 통합 솔루션 | pictures · review · verify | 2.2 → 2.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MD_RULE](layouts/L_TOC_UA_MD_RULE.md) | 병의원 · 인증 · 감염 · 시스템 | review · verify | 10.9 → 7.7초 | 1.2 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MD_SCALE](layouts/L_TOC_UA_MD_SCALE.md) | 병의원 · 병상 · 진료 규모 | pictures · review · verify | 12.2 → 7.5초 | 1.8 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MD_ZONE](layouts/L_TOC_UA_MD_ZONE.md) | 병의원 · 구역 구성 | review · verify | 11.4 → 7.3초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MF_EDGE](layouts/L_TOC_UA_MF_EDGE.md) | 제조 · 물류 · 핵심 스펙 | pictures · review · verify | 10.6 → 9.3초 | 3.2 → 1.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MF_ENV](layouts/L_TOC_UA_MF_ENV.md) | 제조 · 물류 · 현장 환경 | review · verify | 10.8 → 7.6초 | 2.2 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MF_LINE](layouts/L_TOC_UA_MF_LINE.md) | 제조 · 물류 · 공정 · 물류 흐름 | review · verify | 13.2 → 7.7초 | 1.0 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MF_PROOF](layouts/L_TOC_UA_MF_PROOF.md) | 제조 · 물류 · 같은 업종 사례 | pictures · review · verify | 10.3 → 5.0초 | 1.4 → 1.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MF_RIVAL](layouts/L_TOC_UA_MF_RIVAL.md) | 제조 · 물류 · 경쟁 구도 · 통합 솔루션 | pictures · review · verify | 2.7 → 2.7초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MF_SAFE](layouts/L_TOC_UA_MF_SAFE.md) | 제조 · 물류 · 안전 · 현장 시스템 | review · verify | 9.3 → 5.4초 | 2.6 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_MF_SITE](layouts/L_TOC_UA_MF_SITE.md) | 제조 · 물류 · 사업장 · 교대 근무 | review · verify | 10.9 → 9.8초 | 6.4 → 5.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_OF_EDGE](layouts/L_TOC_UA_OF_EDGE.md) | 오피스 · 핵심 스펙 | pictures · review · verify | 12.3 → 10.1초 | 2.4 → 1.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_OF_MEET](layouts/L_TOC_UA_OF_MEET.md) | 오피스 · 회의 · 협업 | cells · review · verify | 6.4 → 5.7초 | 0.6 → 1.0 | 80% | 모든 decision 단계 사용 |
| [L_TOC_UA_OF_POLICY](layouts/L_TOC_UA_OF_POLICY.md) | 오피스 · IT · 보안 · ESG | review · verify | 11.3 → 6.7초 | 0.2 → 0.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_OF_PROOF](layouts/L_TOC_UA_OF_PROOF.md) | 오피스 · 같은 업종 사례 | pictures · review · verify | 13.8 → 6.9초 | 1.0 → 0.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_OF_RIVAL](layouts/L_TOC_UA_OF_RIVAL.md) | 오피스 · 경쟁 구도 · 통합 솔루션 | pictures · review · verify | 2.6 → 2.6초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_OF_STACK](layouts/L_TOC_UA_OF_STACK.md) | 오피스 · 층별 구성 | review · verify | 11.3 → 11.9초 | 1.4 → 1.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_OF_WORK](layouts/L_TOC_UA_OF_WORK.md) | 오피스 · 인원 · 근무 방식 | review · verify | 10.8 → 8.2초 | 3.2 → 1.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_PB_CERT](layouts/L_TOC_UA_PB_CERT.md) | 공공 · 교통 · 국방 · 인증 · 보안 요 | cells · review · verify | 6.9 → 6.7초 | 1.2 → 4.4 | 0% | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 · 문구 작성 · 정해진 보기 칸 LLM 유지 |
| [L_TOC_UA_PB_EDGE](layouts/L_TOC_UA_PB_EDGE.md) | 공공 · 교통 · 국방 · 핵심 스펙 | pictures · review · verify | 11.3 → 8.9초 | 0.4 → 1.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_PB_FISCAL](layouts/L_TOC_UA_PB_FISCAL.md) | 공공 · 교통 · 국방 · 예산 · 조달 일 | review · verify | 10.6 → 8.9초 | 4.0 → 4.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_PB_ORG](layouts/L_TOC_UA_PB_ORG.md) | 공공 · 교통 · 국방 · 기관 · 이용 규 | review · verify | 11.7 → 9.9초 | 2.2 → 1.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_PB_PROOF](layouts/L_TOC_UA_PB_PROOF.md) | 공공 · 교통 · 국방 · 같은 업종 사례 | pictures · review · verify | 11.8 → 6.1초 | 1.6 → 1.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_PB_RIVAL](layouts/L_TOC_UA_PB_RIVAL.md) | 공공 · 교통 · 국방 · 경쟁 구도 · 통 | pictures · review · verify | 2.7 → 2.7초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_PB_SPACE](layouts/L_TOC_UA_PB_SPACE.md) | 공공 · 교통 · 국방 · 서비스 공간 | review · verify | 12.4 → 9.6초 | 2.4 → 1.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_RS_EDGE](layouts/L_TOC_UA_RS_EDGE.md) | 주거 · 핵심 스펙 | pictures · review · verify | 10.0 → 7.7초 | 1.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_RS_HOME](layouts/L_TOC_UA_RS_HOME.md) | 주거 · 세대 · 커뮤니티 | cells · review · verify | 6.7 → 5.9초 | 0.2 → 0.4 | 0% | 모든 decision 단계 사용 |
| [L_TOC_UA_RS_PHASE](layouts/L_TOC_UA_RS_PHASE.md) | 주거 · 사업 일정 | review · verify | 13.0 → 10.5초 | 6.8 → 8.4 | — | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 |
| [L_TOC_UA_RS_PROOF](layouts/L_TOC_UA_RS_PROOF.md) | 주거 · 같은 업종 사례 | pictures · review · verify | 10.9 → 6.0초 | 1.0 → 1.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_RS_RIVAL](layouts/L_TOC_UA_RS_RIVAL.md) | 주거 · 경쟁 구도 · 통합 솔루션 | pictures · review · verify | 2.2 → 2.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_RS_UNITS](layouts/L_TOC_UA_RS_UNITS.md) | 주거 · 단지 · 평형 | pictures · review · verify | 12.2 → 8.0초 | 2.8 → 2.0 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_RS_WHO](layouts/L_TOC_UA_RS_WHO.md) | 주거 · 의사결정 구조 | cells · review · verify | 10.6 → 8.2초 | 3.4 → 3.2 | 45% | 모든 decision 단계 사용 |
| [L_TOC_UA_RT_EDGE](layouts/L_TOC_UA_RT_EDGE.md) | 리테일 · 서비스 매장 · 핵심 스펙 | pictures · review · verify | 11.5 → 8.9초 | 0.6 → 0.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_RT_FORMAT](layouts/L_TOC_UA_RT_FORMAT.md) | 리테일 · 서비스 매장 · 점포 포맷 | review · verify | 11.0 → 7.7초 | 5.0 → 2.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_RT_HOURS](layouts/L_TOC_UA_RT_HOURS.md) | 리테일 · 서비스 매장 · 운영 시간 · 인 | review · verify | 10.9 → 7.6초 | 5.4 → 3.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_RT_PATH](layouts/L_TOC_UA_RT_PATH.md) | 리테일 · 서비스 매장 · 고객 동선 | review · verify | 12.2 → 8.4초 | 0.6 → 1.2 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_RT_PROMO](layouts/L_TOC_UA_RT_PROMO.md) | 리테일 · 서비스 매장 · 판촉 · 진열 교 | review · verify | 10.5 → 8.8초 | 0.2 → 0.6 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_RT_PROOF](layouts/L_TOC_UA_RT_PROOF.md) | 리테일 · 서비스 매장 · 같은 업종 사례 | pictures · review · verify | 12.1 → 6.0초 | 1.2 → 1.4 | — | 모든 decision 단계 사용 |
| [L_TOC_UA_RT_RIVAL](layouts/L_TOC_UA_RT_RIVAL.md) | 리테일 · 서비스 매장 · 경쟁 구도 · 통 | pictures · review · verify | 2.1 → 2.1초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_US_C](layouts/L_US_C.md) | 사용자 구성 + 니즈 | review · verify | 12.4 → 12.3초 | 5.8 → 5.2 | — | 모든 decision 단계 사용 |
| [L_VC_21](layouts/L_VC_21.md) | 두 공간 · 한 솔루션 | cells · pictures · review · verify | 14.3 → 11.9초 | 1.0 → 1.4 | 68% | 모든 decision 단계 사용 |
| [L_VC_22](layouts/L_VC_22.md) | 두 공간 · 솔루션 2개 | cells · pictures · review · verify | 15.6 → 16.6초 | 0.6 → 1.6 | 10% | 문구 작성 · 정해진 보기 칸 LLM 유지 |
| [L_VC_31](layouts/L_VC_31.md) | 세 공간 · 한 솔루션 | cells · pictures · review · verify | 14.8 → 10.4초 | 1.0 → 2.0 | 85% | 모든 decision 단계 사용 |
| [L_VC_32](layouts/L_VC_32.md) | 세 공간 · 솔루션 2개 | cells · pictures · review · verify | 14.2 → 11.8초 | 1.4 → 1.2 | 53% | 모든 decision 단계 사용 |
| [L_VC_33](layouts/L_VC_33.md) | 세 공간 · 솔루션 3개 | cells · pictures · review · verify | 13.2 → 13.1초 | 0.4 → 1.4 | 57% | 모든 decision 단계 사용 |
| [L_VC_42](layouts/L_VC_42.md) | 네 공간 · 솔루션 2개 | cells · pictures · review · verify | 15.4 → 12.6초 | 2.0 → 2.0 | 45% | 모든 decision 단계 사용 |
| [L_VP_F](layouts/L_VP_F.md) | 가치 기둥 × 제품 · 3개 (기둥 수 n으 | cells · pictures · review · verify | 13.3 → 11.4초 | 0.6 → 1.0 | 25% | 모든 decision 단계 사용 |
| [L_VP_F2](layouts/L_VP_F2.md) | 가치 기둥 × 제품 · 2개 | cells · pictures · review · verify | 12.9 → 9.5초 | 1.6 → 0.8 | 50% | 모든 decision 단계 사용 |
| [L_VP_F4](layouts/L_VP_F4.md) | 가치 기둥 × 제품 · 4개 (2×2) | pictures · review · verify | 17.7 → 11.7초 | 1.4 → 1.8 | — | 사진 검수 · 고르기 LLM 유지 |
| [L_VP_G](layouts/L_VP_G.md) | 한 문장 + 제품 히어로 | cells · pictures · review · verify | 15.9 → 9.0초 | 0.2 → 1.4 | 35% | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 |
| [L_VP_H](layouts/L_VP_H.md) | 이해관계자 × 만나는 화면 | pictures · review · verify | 17.0 → 14.9초 | 3.4 → 2.4 | — | 모든 decision 단계 사용 |
| [L_VP_N](layouts/L_VP_N.md) | 실사 히어로 + 가치 3 | cells · pictures · review · verify | 13.4 → 10.3초 | 1.0 → 1.2 | 30% | 모든 decision 단계 사용 |
| [L_VS_BIRD_B10](layouts/L_VS_BIRD_B10.md) | 표준 건물 조감도 · 층별 10개 공간 범례 | pictures · review · verify | 13.3 → 10.4초 | 1.2 → 1.0 | — | 모든 decision 단계 사용 |
| [L_VS_BIRD_B7](layouts/L_VS_BIRD_B7.md) | 표준 건물 조감도 · 층별 7개 공간 범례 | pictures · review · verify | 11.5 → 7.4초 | 0.6 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_BIRD_B8](layouts/L_VS_BIRD_B8.md) | 표준 건물 조감도 · 층별 8개 공간 범례 | pictures · review · verify | 14.1 → 8.6초 | 1.2 → 1.2 | — | 모든 decision 단계 사용 |
| [L_VS_BIRD_B9](layouts/L_VS_BIRD_B9.md) | 표준 건물 조감도 · 층별 9개 공간 범례 | pictures · review · verify | 12.0 → 9.5초 | 0.6 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_BIRD_S1](layouts/L_VS_BIRD_S1.md) | 공간 조감도 · 1개 공간 범례 | cells · pictures · review · verify | 8.6 → 6.1초 | 0.6 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_BIRD_S2](layouts/L_VS_BIRD_S2.md) | 공간 조감도 · 2개 공간 범례 | cells · pictures · review · verify | 9.4 → 7.1초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_VS_BIRD_S3](layouts/L_VS_BIRD_S3.md) | 공간 조감도 · 3개 공간 범례 | cells · pictures · review · verify | 9.4 → 8.6초 | 0.6 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_BIRD_S4](layouts/L_VS_BIRD_S4.md) | 공간 조감도 · 4개 공간 범례 | cells · pictures · review · verify | 11.0 → 9.7초 | 1.8 → 1.8 | — | 모든 decision 단계 사용 |
| [L_VS_BIRD_S5](layouts/L_VS_BIRD_S5.md) | 공간 조감도 · 5개 공간 범례 | cells · pictures · review · verify | 9.6 → 7.6초 | 1.2 → 1.2 | — | 모든 decision 단계 사용 |
| [L_VS_BIRD_S6](layouts/L_VS_BIRD_S6.md) | 공간 조감도 · 6개 공간 범례 | cells · pictures · review · verify | 10.6 → 8.6초 | 1.2 → 1.0 | — | 모든 decision 단계 사용 |
| [L_VS_CASE](layouts/L_VS_CASE.md) | 도입사례 · 대표 사진 + 적용 사진 3 + | pictures · review · verify | 13.5 → 8.9초 | 1.4 → 2.0 | — | 모든 decision 단계 사용 |
| [L_VS_CORE_1](layouts/L_VS_CORE_1.md) | 핵심 제안 상세 1 · 2행 × 3단계 (가 | pictures · review · verify | 10.0 → 6.6초 | 0.6 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_CORE_2](layouts/L_VS_CORE_2.md) | 핵심 제안 상세 2 · 2행 × 3단계 (가 | pictures · review · verify | 10.9 → 6.2초 | 0.6 → 1.2 | — | 모든 decision 단계 사용 |
| [L_VS_CORE_3](layouts/L_VS_CORE_3.md) | 핵심 제안 상세 3 · 2행 × 3단계 (가 | pictures · review · verify | 9.5 → 5.7초 | 0.6 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_DIV_R1](layouts/L_VS_DIV_R1.md) | 간지 · 풀블리드 사진 + 목록 1줄 | pictures | 1.1 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_VS_DIV_R2](layouts/L_VS_DIV_R2.md) | 간지 · 풀블리드 사진 + 목록 2줄 | pictures | 1.5 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_VS_DIV_R3](layouts/L_VS_DIV_R3.md) | 간지 · 풀블리드 사진 + 목록 3줄 | pictures | 1.2 → 0.2초 | 0.0 → 0.0 | — | 사진 검수 · 고르기 LLM 유지 |
| [L_VS_DIV_R4](layouts/L_VS_DIV_R4.md) | 간지 · 풀블리드 사진 + 목록 4줄 | pictures | 0.9 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_VS_DIV_R5](layouts/L_VS_DIV_R5.md) | 간지 · 풀블리드 사진 + 목록 5줄 | pictures | 1.1 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_VS_DIV_R6](layouts/L_VS_DIV_R6.md) | 간지 · 풀블리드 사진 + 목록 6줄 | pictures | 1.2 → 0.2초 | 0.0 → 0.0 | — | 모든 decision 단계 사용 |
| [L_VS_DSS](layouts/L_VS_DSS.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_AD](layouts/L_VS_DSS_AD.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_ED](layouts/L_VS_DSS_ED.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_FB](layouts/L_VS_DSS_FB.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_FN](layouts/L_VS_DSS_FN.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_HT](layouts/L_VS_DSS_HT.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_ID](layouts/L_VS_DSS_ID.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_MB](layouts/L_VS_DSS_MB.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_MD](layouts/L_VS_DSS_MD.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_MF](layouts/L_VS_DSS_MF.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_MI](layouts/L_VS_DSS_MI.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_OE](layouts/L_VS_DSS_OE.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_OF](layouts/L_VS_DSS_OF.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_PB](layouts/L_VS_DSS_PB.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_RG](layouts/L_VS_DSS_RG.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_RS](layouts/L_VS_DSS_RS.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_RT](layouts/L_VS_DSS_RT.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_SF](layouts/L_VS_DSS_SF.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_SV](layouts/L_VS_DSS_SV.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_TP](layouts/L_VS_DSS_TP.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_DSS_VN](layouts/L_VS_DSS_VN.md) | Device · Solution · Serv | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_END](layouts/L_VS_END.md) | 마무리 · 풀블리드 사진 + SAMSUNG | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_MAP_10](layouts/L_VS_MAP_10.md) | 업종 Map · 공간 10개 × 제품 | pictures · review · verify | 14.4 → 9.8초 | 0.8 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_MAP_2](layouts/L_VS_MAP_2.md) | 업종 Map · 공간 2개 × 제품 | cells · pictures · review · verify | 7.6 → 7.3초 | 1.0 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_MAP_3](layouts/L_VS_MAP_3.md) | 업종 Map · 공간 3개 × 제품 | cells · pictures · review · verify | 8.5 → 9.2초 | 1.4 → 0.8 | — | 모든 decision 단계 사용 |
| [L_VS_MAP_4](layouts/L_VS_MAP_4.md) | 업종 Map · 공간 4개 × 제품 | cells · pictures · review · verify | 9.3 → 9.5초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_VS_MAP_5](layouts/L_VS_MAP_5.md) | 업종 Map · 공간 5개 × 제품 | cells · pictures · review · verify | 10.1 → 7.3초 | 0.4 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_MAP_6](layouts/L_VS_MAP_6.md) | 업종 Map · 공간 6개 × 제품 | cells · pictures · review · verify | 10.9 → 8.6초 | 1.8 → 2.0 | — | 모든 decision 단계 사용 |
| [L_VS_MAP_7](layouts/L_VS_MAP_7.md) | 업종 Map · 공간 7개 × 제품 | pictures · review · verify | 11.9 → 7.2초 | 0.8 → 0.8 | — | 모든 decision 단계 사용 |
| [L_VS_MAP_8](layouts/L_VS_MAP_8.md) | 업종 Map · 공간 8개 × 제품 | pictures · review · verify | 11.6 → 7.9초 | 0.4 → 0.2 | — | 모든 decision 단계 사용 |
| [L_VS_MAP_9](layouts/L_VS_MAP_9.md) | 업종 Map · 공간 9개 × 제품 | pictures · review · verify | 14.8 → 8.9초 | 1.2 → 1.2 | — | 모든 decision 단계 사용 |
| [L_VS_NEEDS](layouts/L_VS_NEEDS.md) | 니즈 · 기술 · 제안 3열 (니즈 문장 · | pictures · review · verify | 12.3 → 7.4초 | 0.8 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_SOL_BIOT](layouts/L_VS_SOL_BIOT.md) | b.IoT · 관제 화면 가운데 + 기능 4 | cells · pictures · review · verify | 10.0 → 6.1초 | 0.8 → 0.8 | 100% | 모든 decision 단계 사용 |
| [L_VS_SOL_BOOKEE](layouts/L_VS_SOL_BOOKEE.md) | 갤럭시 북 EE · 출고 타임라인 + 기능  | cells · pictures · review · verify | 9.5 → 6.4초 | 0.4 → 1.0 | 80% | 모든 decision 단계 사용 |
| [L_VS_SOL_CLASS](layouts/L_VS_SOL_CLASS.md) | 갤럭시 클래스룸 · 교실 사진 + 체크리스트 | pictures · review · verify | 10.7 → 7.3초 | 0.8 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_SOL_COUNTHRU](layouts/L_VS_SOL_COUNTHRU.md) | CounThru · 기능 타일 4 + 구성도 | cells · pictures · review · verify | 10.7 → 6.5초 | 0.6 → 1.0 | 100% | 모든 decision 단계 사용 |
| [L_VS_SOL_DEX](layouts/L_VS_SOL_DEX.md) | 삼성 DeX · 연결 전 → 연결 후 카드  | pictures · review · verify | 9.4 → 5.7초 | 0.6 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_SOL_DMS](layouts/L_VS_SOL_DMS.md) | DMS 2.5 · 기능 5행 + 제어기 사진 | cells · pictures · review · verify | 9.1 → 7.2초 | 0.4 → 1.0 | 80% | 모든 decision 단계 사용 |
| [L_VS_SOL_FIELD](layouts/L_VS_SOL_FIELD.md) | 현장 업무 솔루션 · 사진 + 아이콘 열 3 | cells · pictures · review · verify | 9.9 → 7.3초 | 0.2 → 0.8 | 100% | 모든 decision 단계 사용 |
| [L_VS_SOL_HEALTH](layouts/L_VS_SOL_HEALTH.md) | 삼성헬스 · 워치 사진 + 데이터 칩 5 + | cells · pictures · review · verify | 10.0 → 5.6초 | 0.4 → 1.0 | 80% | 모든 decision 단계 사용 |
| [L_VS_SOL_HOSPITAL](layouts/L_VS_SOL_HOSPITAL.md) | 병원 안내 · 업무 솔루션 · 배너 + 환자 | pictures · review · verify | 13.7 → 9.1초 | 1.2 → 0.6 | — | 모든 decision 단계 사용 |
| [L_VS_SOL_KNOX](layouts/L_VS_SOL_KNOX.md) | Knox · 보안 레이어 5단 + 사진 | cells · pictures · review · verify | 9.9 → 8.1초 | 0.6 → 0.8 | 100% | 모든 decision 단계 사용 |
| [L_VS_SOL_LYNK](layouts/L_VS_SOL_LYNK.md) | LYNK Cloud · 히어로 사진 + 기능 | cells · pictures · review · verify | 8.6 → 4.7초 | 0.4 → 0.4 | 80% | 모든 decision 단계 사용 |
| [L_VS_SOL_MAGIC](layouts/L_VS_SOL_MAGIC.md) | MagicINFO · 세로 사진 + 레이어  | cells · pictures · review · verify | 10.4 → 7.1초 | 1.4 → 0.8 | 20% | 모든 decision 단계 사용 |
| [L_VS_SOL_MEETING](layouts/L_VS_SOL_MEETING.md) | 회의실 예약 솔루션 · 문 앞 태블릿 사진  | cells · pictures · review · verify | 9.1 → 9.3초 | 0.6 → 1.8 | 80% | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 |
| [L_VS_SOL_POS](layouts/L_VS_SOL_POS.md) | 갤럭시 탭 POS · 사진 카드 2 (결제  | cells · pictures · review · verify | 7.8 → 5.7초 | 0.2 → 1.0 | 100% | 모든 decision 단계 사용 |
| [L_VS_SOL_SAFETY](layouts/L_VS_SOL_SAFETY.md) | 안전관리 솔루션 · 감지 → 알림 흐름 4단 | cells · pictures · review · verify | 11.3 → 7.7초 | 0.8 → 0.8 | 0% | 모든 decision 단계 사용 |
| [L_VS_SOL_SECUTHRU](layouts/L_VS_SOL_SECUTHRU.md) | SecuThru · 보안 3단 아이콘 열 + | cells · pictures · review · verify | 11.9 → 6.6초 | 0.8 → 0.4 | 80% | 모든 decision 단계 사용 |
| [L_VS_SOL_STHOME](layouts/L_VS_SOL_STHOME.md) | 스마트싱스 홈 · 배너 사진 + 기능 5열 | pictures · review · verify | 12.4 → 6.6초 | 0.6 → 0.8 | — | 모든 decision 단계 사용 |
| [L_VS_SOL_STP](layouts/L_VS_SOL_STP.md) | SmartThings Pro · 대시보드 + | cells · pictures · review · verify | 10.7 → 6.9초 | 0.8 → 0.4 | 0% | 모든 decision 단계 사용 |
| [L_VS_SOL_SVCMOBILE](layouts/L_VS_SOL_SVCMOBILE.md) | 삼성케어플러스 비즈니스 · 사진 + 혜택 3 | cells · pictures · review · verify | 9.2 → 6.1초 | 0.8 → 1.0 | 100% | 모든 decision 단계 사용 |
| [L_VS_SOL_SVCSAC](layouts/L_VS_SOL_SVCSAC.md) | 삼성케어플러스 SAC · 케어 순환 4 +  | cells · pictures · review · verify | 9.8 → 6.8초 | 0.4 → 0.4 | 80% | 모든 decision 단계 사용 |
| [L_VS_SOL_TOUCH](layouts/L_VS_SOL_TOUCH.md) | 터치 중앙 제어기 · 숫자 타일 4 + 설치 | cells · pictures · review · verify | 11.7 → 8.3초 | 1.0 → 1.0 | 20% | 모든 decision 단계 사용 |
| [L_VS_SOL_VXT](layouts/L_VS_SOL_VXT.md) | VXT CMS · 3단계 흐름(제작 → 운영 | cells · pictures · review · verify | 11.2 → 6.3초 | 0.4 → 1.4 | 60% | 모든 decision 단계 사용 |
| [L_VS_SOL_WIFI](layouts/L_VS_SOL_WIFI.md) | Wi-Fi KIT · 앱 화면 가운데 + 기 | cells · pictures · review · verify | 8.8 → 6.1초 | 0.2 → 0.8 | 0% | 문구 작성 · 정해진 보기 칸 LLM 유지 |
| [L_VS_SPACE](layouts/L_VS_SPACE.md) | 공간별 대표 제품 · 왼쪽 공간 사진 + 오 | cells · pictures · review · verify | 9.7 → 5.7초 | 0.8 → 0.4 | 90% | 모든 decision 단계 사용 |
| [L_VS_SPACE_1](layouts/L_VS_SPACE_1.md) | 공간별 대표 제품 · 제품 1 — 공간 사진 | cells · pictures · review · verify | 10.7 → 6.4초 | 0.6 → 0.6 | 50% | 모든 decision 단계 사용 |
| [L_VS_SPACE_2](layouts/L_VS_SPACE_2.md) | 공간별 대표 제품 · 제품 2 — 공간 사진 | pictures · review · verify | 12.3 → 8.3초 | 4.4 → 2.2 | — | 모든 decision 단계 사용 |
| [L_VS_SPACE_3](layouts/L_VS_SPACE_3.md) | 공간별 대표 제품 · 제품 3 — 공간 사진 | pictures · review · verify | 13.2 → 6.3초 | 0.4 → 1.2 | — | 모든 decision 단계 사용 |
| [L_VS_SPACE_4](layouts/L_VS_SPACE_4.md) | 공간별 대표 제품 · 제품 4 — 공간 사진 | pictures · review · verify | 14.3 → 6.7초 | 0.2 → 0.4 | — | 모든 decision 단계 사용 |
| [L_VS_SPACE_P2](layouts/L_VS_SPACE_P2.md) | 공간별 제품 · 한 공간 제품 2개 — 왼쪽 | pictures · review · verify | 16.1 → 11.7초 | 0.2 → 1.2 | — | 모든 decision 단계 사용 |
| [L_VS_SPACE_P3](layouts/L_VS_SPACE_P3.md) | 공간별 제품 · 한 공간 제품 3개 — 왼쪽 | pictures · review · verify | 15.5 → 11.5초 | 1.4 → 0.8 | — | 모든 decision 단계 사용 |
| [L_VS_SPACE_P4](layouts/L_VS_SPACE_P4.md) | 공간별 제품 · 한 공간 제품 4개 — 왼쪽 | pictures · review · verify | 18.2 → 11.0초 | 2.4 → 2.0 | — | 모든 decision 단계 사용 |
| [L_VS_SPACE_P5](layouts/L_VS_SPACE_P5.md) | 공간별 제품 · 한 공간 제품 5개 — 왼쪽 | pictures · review · verify | 15.1 → 10.1초 | 0.2 → 1.4 | — | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 |
| [L_VS_SPACE_P6](layouts/L_VS_SPACE_P6.md) | 공간별 제품 · 한 공간 제품 6개 — 왼쪽 | pictures · review · verify | 17.5 → 10.7초 | 1.8 → 1.0 | — | 모든 decision 단계 사용 |
| [L_VS_SPACE_P7](layouts/L_VS_SPACE_P7.md) | 공간별 제품 · 한 공간 제품 7개 — 왼쪽 | pictures · review · verify | 20.3 → 14.6초 | 0.8 → 2.0 | — | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 |
| [L_VS_SPACE_P8](layouts/L_VS_SPACE_P8.md) | 공간별 제품 · 한 공간 제품 8개 — 왼쪽 | pictures · review · verify | 21.1 → 13.6초 | 0.8 → 1.2 | — | 모든 decision 단계 사용 |
| [L_VS_TOC](layouts/L_VS_TOC.md) | 목차 · 사진 카드 6 (6장 고정) | cells · review · verify | 9.9 → 6.9초 | 1.0 → 1.2 | 67% | 모든 decision 단계 사용 |
| [L_VS_WHY_1](layouts/L_VS_WHY_1.md) | Why Samsung · Samsung Bu | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_WHY_2](layouts/L_VS_WHY_2.md) | Why Samsung · 최고의 전문가 집단 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_WHY_3](layouts/L_VS_WHY_3.md) | Why Samsung · 통합 오퍼링 (De | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_WHY_4](layouts/L_VS_WHY_4.md) | Why Samsung · 비즈니스 고객 맞춤 | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VS_WHY_5](layouts/L_VS_WHY_5.md) | Why Samsung · 브랜드 가치 (In | — | — | — | — | 모델 단계 없음 · 실행 안 됨 |
| [L_VXT_D](layouts/L_VXT_D.md) | Samsung VXT 구성도 | cells · pictures · review · verify | 9.4 → 10.5초 | 1.2 → 1.2 | 67% | 모든 decision 단계 사용 |
| [L_VXT_S_RT](layouts/L_VXT_S_RT.md) | Samsung VXT 공간 시나리오 · 매장 | pictures · review · verify | 11.9 → 7.4초 | 1.0 → 2.2 | — | 사실 · 요구 검수 LLM 유지 · 파트 검토 LLM 유지 |
