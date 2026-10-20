# P3 · G 오피스 · 14개 지점 회의실 표준화 — 메모

- 파트 8 · 장 16 + 표지 1 = 17장. 상태(감사 반영 후): 기 · 승 done(4장 + 표지) → 전 done 3장(VP_B2 · VP_D · P1_C) · partial 2장(SS_OF_B · P2_C) · empty 3장 → 결 empty 4장.
- 검사: `node build/hist/check.mjs p_case_p3 --shots` 오류 0 · 확인 2(BM_A 는 bom 레이아웃을 execution 파트에 둠 — PLAN 그대로 · SS_OF_B 솔루션 화면 흰 여백), `dupcheck.py p_case_p3` ✗ 0 · ? 0. 시트 5장 눈으로 확인.

## 파트 · 장
| 막 | 파트 | 장 | 상태 |
|---|---|---|---|
| 표지 | — | L_C02 (빌딩 외관 참고) | done |
| 기 | customer「14개 지점 · 회의실 186실」 | L_PH_CB_A (라운지 · 대회의실 · 소회의실 + 한 줄 요약) → L_PH_CB_P (숫자 6: 14곳 · 186실 · 42실 · 144실 · 월 210건 · 예약은 앱) | done · done |
| 승 | challenge「지점마다 다른 장비가 만든 문의 월 210건」 | L_PH_CH_A (장비 210건 · 문 앞 186실 종이 · 냉난방 · 조명 14곳 제어 방식 확인) → L_PH_CH_B (지금 → 바라는 모습) | done · done |
| 전 | value「어느 지점이든 같은 회의실」 | L_PH_VP_B2 (감사 통과한 L_VP02 값 그대로 옮김) → L_PH_VP_D (운영총괄 · 공간기획팀장 · IT 운영 · 입주사) | done · done |
| 전 | scenario「예약부터 회의 종료까지」 | L_PH_SS_OF_B (장면 1 예약 후 문 앞 · 장면 2 입실 예약 연동까지 작성, 3 · 4 미작성 · 사진은 다섯 칸 모두 채움) → L_PH_SS_OF_C | partial · empty |
| 전 | products「대회의실 Flip Pro, 소회의실 QB55C」 | L_PH_P2_C (감사 통과한 L_P2C 값: 화면 · 수량 · 해상도 세 줄, 소비전력 · 가격대 · 결론은 미작성) → L_PH_P1_C (EM32DX 문 앞 · 공식 사양 · 연결 · 전원 · 관리 · 설치 위치) | partial · done |
| 전 | solution「예약 · 문 앞 · 공간이 함께 움직인다」 | L_PH_SA_B → L_PH_SF_B | empty · empty |
| 결 | execution「지점 구성과 설치 순서」 | L_PH_BM_A (구성표) → L_PH_PL_A | empty · empty |
| 결 | closing「다음 단계」 | L_PH_C13 → L_C12 | empty · empty |

- PLAN 과 다른 점: 승의 CH_B 를 partial 이 아니라 done 으로 했다. 비워 둔 오른쪽 칸에 레이아웃 기본 사진(은행 창구 · 캐릭터 포스터)이 그대로 보여, 상태 요약(“기 · 승 done”)대로 끝까지 채웠다.
- 시나리오 시각은 지어내지 않으려 ‘예약 후 · 입실’로 썼다(시각 숫자 없음). 효과 수치 칸(가동률 · 준비 시간 등)은 기능 표기(‘원격 교체’ · ‘예약 연동’)로 채움. SmartThings Pro 는 % 없이 기능만.
- 숫자: 14 · 186 · 42 · 144 · 210 · 2026 · 15(산출) · 75 · 55 + EM32DX 공식 값(32형 · 31.5" · QHD 2,560×1,440 · 0.00W IEC62301). 새 계산 없음 → **ledger 추가 없음**.

## 새 사진 (2장 · samsung.com 패스트파이브 도입사례 https://www.samsung.com/sec/business/insights/case-study/reference-fastfive/)
- `img/hist/p3-ff-small.jpg` — 02-31.jpg 왼쪽 사진(두 장 붙은 이미지에서 잘라냄): 소회의실 전자칠판 회의
- `img/hist/p3-ff-present.jpg` — 02-31.jpg 오른쪽 사진: 이동식 전자칠판 발표
- F8 에서 가져온 사진 재사용(감사 후): f8-4way-ceiling · f8-flip-mirror · f8-flip-wall · f8-mod-tabctl.
- 패스트파이브 04 사진(유리문 ‘10A by Samsung Flip’)은 그 회사 표식이 보여 쓰지 않음.

## 남은 문제
- 도구: check.mjs 의 사진 중복 검사는 img 를 적은 칸만 센다 — partial 장의 기본 사진이 다른 장과 겹쳐도 안 잡힌다(이번엔 SS_OF_B 사진을 모두 채워 피함).

## 독립 감사 반영 (10/19)
- 표지: 팩토리얼 성수 외관 → p3-board-room(Flip Pro 제품 페이지 공식 연출 회의실 · 설명 그림 제외). F8 표지(스톡 캠퍼스)와 겹치지 않음.
- partial 규칙(꼬리말 · 사진 · 캡션은 이 케이스 값): VP_D 넷째 칸(입주사)까지 채워 **done**, 꼬리말 · 사진(운영총괄 = 운영실, 입주사 = of-lounge-tv 이동). P1_C 아래 줄(연결 Wi-Fi · 블루투스 / 전원 착탈식 충전 배터리 / 관리 솔루션 VXT / 설치 위치 벽 · 문 확인 필요) · 꼬리말까지 채워 **done**. SS_OF_B 는 3 · 4장면 제품 줄(Flip Pro WM75B · 무선 미러링 / SmartThings Pro · 냉난방 · 조명) · ‘공유’ · ‘종료’ · ‘자동 OFF’ · 꼬리말 · 사진 다섯 칸 채움(남은 예시: 3 · 4장면 설명 · ‘[0]분 → [0]분’ 칸 — partial). P2_C 는 ‘+’ · 용도 행 · 결론 · 꼬리말(남은 예시: 소비전력 행 — partial).
- 글: CB_A 한 줄 요약 “어느 지점에 가도 같은 회의실이 되도록 표준화하고 싶습니다”, VP_D t15 ‘예약 앱 연동(방식 확인 후)…’, VP_B2 t2 ‘사진은 오피스 도입사례 참고 장면 · 제품 화면 예시’.
- 사진 교체: 팩토리얼 성수 실내 3장(Berkley 상호) · 자판기 로고(office#22) · 한국IBM 회의실 · 주방 사진(office#17) · 예약 태블릿 · 카페 중앙제어기 · 신발 광고 컷 · 서울교대 이페이퍼 포스터 모두 뺌. 새로 p3-meet-empty · p3-wmfx-meet · p3-wmfx-arch · p3-video-call(Flip Pro 제품 페이지 공식 연출), p3-epaper-wall(US 디스플레이 페이지 벽면 이페이퍼 · 사람 제외), ed-print-zone · office#10 · #19 · #21 · ui 화면(라이브러리).
- **p3-em32dx-room-front.png**: EM32DX 공식 제품 컷의 화면(신발 광고)을 ‘회의실 예약 안내’ 예시 화면으로 바꾼 합성 — 숫자 없음, 화면 하단과 사진 이름에 ‘화면 예시(합성)’ 표기. SS_OF_B 1장면 · VP_B2 02 · P1_C 제품 컷에 씀.
- 못 바꾼 것: QB55C 컷(p-qb55c.png)은 QM 시리즈와 같은 렌더 — 제품 DB 묶음(img/prod)에도 QB 단독 컷이 없어(같은 렌더의 패키지 컷뿐) 그대로. 오피스 문 앞에 설치된 이페이퍼 실사는 samsung.com 에 없어 P1_C 설치 장면은 벽면 이페이퍼 연출 사진(참고)으로, 이름도 ‘벽에 건 컬러 이페이퍼’로 정직하게 씀. empty 장(SF_B % 칩 · BM_A 5칸 · PL_A 수치 기준)은 채울 때 주의 — 지금은 그대로.
- 덱 간 같은 사진(허용): f8-flip-wall · f8-flip-mirror · f8-4way-ceiling · f8-mod-tabctl, Flip Pro 연출 2장(다른 자름). 표지 · 고객 이해 대표 사진은 F8 과 겹치지 않음.
