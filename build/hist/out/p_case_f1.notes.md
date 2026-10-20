# F1 · N 스터디카페 — 메모

- 결과: 파트 8 × 2장 + 표지 1 = 17장, 전부 done. `check.mjs` 오류 0 (확인 6: UI 화면의 흰 배경 · EF_Q 파트 유형 경고).
- 흐름: 기(시장 환경 → 고객사 이해) → 승(리모컨에 묶인 냉난방) → 전(가치 → 솔루션) → 결(기대 효과 → 실행 계획 → 다음 단계).

## 레이아웃
| 파트 | 장 |
|---|---|
| deck | L_C02 사진 표지 |
| 기 market | L_PH_MS_A 핵심 수치 4 · L_PH_TR_A 트렌드 4(정성, 숫자는 34.7% · 64건만) |
| 기 customer | L_PH_CB_A 현장 3컷 + 요약 · L_PH_CB_P 숫자 6 프로필 |
| 승 challenge | L_PH_CH_A 과제 3 · L_PH_CH_B 지금(흑백) → 바라는 모습 |
| 전 value | L_PH_VP_B 가치 기둥 3 · L_PH_VP_A 과제 ↔ 해결 |
| 전 solution | L_PH_SA_B 허브형 · L_PH_SOL_S 무인 지점의 하루(SmartThings Pro) |
| 결 effect | L_PH_EF_C 정량 + 정성 · L_PH_EF_M 계산 사슬 6타일(210만 → 109.2만 → 15% → 16.4만 → 2.36억 → 약 28개월) |
| 결 execution | L_PH_PL_A 시범 → 1차 → 2차 · L_PH_EF_Q 측정 지표 4(파트 유형은 effect — 시범 계측 설계를 담을 실행 장이 없어 사용, 경고만) |
| 결 closing | L_PH_C13 다음 단계 3 · L_C12 도입 후 모습 + 담당 |

## 정확성 메모
- 숫자는 전부 브리프 대장 · 요구사항 · 제작자 메모 값. 15% · 15.84 같은 목표 · 가정은 ‘목표 · 산출 · 가정’ 표기.
- 무풍 4Way 최대 50% 는 ‘부재 시 무풍 + 인체감지 절전제어(센서 옵션 · 학습 진입 전) 자사 실험치’ 단서를 VP_B 부제에 적음.
- SmartThings Pro 는 % 절감 없이 기능(스케줄 · 원격 제어 · 사용량 리포트 · 비효율 감지 화면)만.
- 24시간 무인 지점이라 ‘영업 외 시간’ 대신 ‘이용이 적은 시간’으로 씀.
- EF_C 인용 칸은 지어낸 인용 대신 키맨 요구 원문(“점주 야간 방문 없애기” · “온도 민원 월 64건 줄이기”)과 출처(가맹사업팀장 · 시설팀장 요구).
- ledger 추가: `20`(게이트 2 = 시범 8주 + 1차 12주, 20주 차) · `27.47`(450 ÷ 16.38, 메모에 있는 값을 EF_M 에 표기).

## 새 사진 (build/hist/newimg, 출처 samsung.com 토즈 스터디센터 도입사례 페이지)
- `f1-toz-qr` — case-study_0151_06 오른쪽 아래 크롭(휴대폰 QR 입실)
- `f1-dvm-outdoor` — 같은 페이지의 DVM S 실외기 썸네일(Solutions_Landing_05System_01Thumbnail_PC)
- `f1-toz-cafe-gray` — case-study_0151_01(라이브러리 img/ph/sv-studycafe 원본) 흑백 변환 — CH_B ‘지금’ 장면용

## 남은 점 · 판단
- 스터디카페 실사진이 적어 일부 칸은 같은 업종이 아닌 samsung.com 사진(라운지 · 카페 좌석 · 도서관 열람실 · 오피스)과 Unsplash 2장(bs13-8-0 야간 입구, bs03-10-3 열람실 — 꼬리말에 Unsplash 표기)을 씀.
- 표지(sv-study-open)와 마무리 L_C12(sv-study-night)는 같은 장면의 밝은/어두운 버전 — 의도한 처음 · 끝 대칭이며 L_C12 하단에 ‘어둡게 보정한 참고 이미지’ 고지.
- UI 렌더 중 같은 화면의 다른 파일 두 쌍이 있음: ui-stp-energy(VP_B) ≈ ui.json#15(EF_Q), ui-stp-schedule(VP_A) ≈ ui.json#13(EF_Q). 파일은 달라 검사는 통과하지만 감사 때 바꿀 후보.
- CB_A · EF_C 꼬리말의 토즈 스터디센터는 사진 출처 표기(고객과 무관).
- 도구: addphoto.py 가 dist/img/hist 에도 씀(가이드상 dist 무수정이지만 도구 동작이라 그대로 둠).

## 감사 반영 (MAJOR 4 · MINOR 1–22)
- 글: 감사 지시 문구 그대로 반영(CH_A t6 사용량 비중, TR_A t4 · t1 · t24, C13 t17 · t7, MS_A t1 · t11, 설문 표기 4곳, CB_A t11 · t12 · t18 · t20, CB_P t22 · t23, VP_B t2, VP_A t5 · t8, SOL_S t23, EF_C t1 · 파트 이름, EF_M t15 · t25, PL_A t11, EF_Q t1 · t6 · t12 · t24 · t36, C12 t6). 토즈 크레딧 → ‘사진: samsung.com(참고 이미지)’.
- 사진: 토즈 로고 사진(sv-study-open · sv-study-night · toz-cafe-gray) 전부 뺌. 같은 그림 중복(UI 캡처 2쌍 · 표지/마무리 보정본) 없앰. 업종 안 맞는 사진 교체.
- 새 사진: f1-lib-desks · f1-lib-lounge(광교푸른숲도서관 suwonlib_02 좌우 크롭 · 흰 여백 제거), f1-toz-open(case_0151_04 왼쪽 — 유리창 엠블럼 영역 잘라냄), f1-toz-oa(case_0151_06 오른쪽 위 O/A 존), f1-sac-app · f1-sac-roof · f1-sac-ceiling(samsung.com/sec/business/system-air-conditioners), f1-sac-ceiling-gray(흑백, CH_B ‘지금’). 지운 것: f1-toz-cafe-gray.
- 남은 점: f1-toz-qr 태블릿 위 작은 ‘T.O.C’ 글자(로고 아님, 작음). TR_A 03 hotel.json#9 · EF_M ui.json#14 · VP_B bs13-6-2 · SOL_S f1-sac-app 은 흰 배경 캡처/사진(어두운 STP 캡처는 EF_Q 에 몰아 줌 — 서로 다른 STP 렌더가 7종뿐). 일부 칸은 학습 공간 대체 사진(도서관 · 학원 · 강의실).
