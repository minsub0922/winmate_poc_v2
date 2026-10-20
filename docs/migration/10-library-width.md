# 10 — 라이브러리 페이지 너비와 목록 PPTX 버튼

확인일: 2026-10-20 KST.

## 반영

- PPT 레이아웃 템플릿, Best Scenario, My, 찜이 공유하는 `.tl-in` 최대 너비를 1320px에서 1800px로 늘렸다.
- 너비는 `tokens.css`의 `--library-page-max-width` 한 곳에서 관리한다. 기존 여백·카드 열 수·모바일 규칙은 유지하며 작은 화면에서는 화면 너비에 맞춘다.
- `이 목록 PPTX로 받기` 버튼, 120장 제한 안내, 전용 팝업·상태·미사용 import를 제거했다.
- 개별 장표와 개별 Best Scenario의 PPTX 받기는 유지되며, 브라우저 검사에서도 버튼이 남아 있는지 확인했다.

기존 My 페이지 회귀 스크립트의 목록 다운로드 기대값도 버튼 부재로 맞췄다. 이번 검증은 아래의 범위별 브라우저 검사로 실행했으며 My 편집·공유 등 다른 기능 전체를 재검사한 것으로 취급하지 않는다.

## 검증

| 환경 | 범위 | 결과 |
|---|---|---|
| 고정한 소스의 웹 빌드 | 4페이지 × 2560/1920/900/390px | 16/16 통과 |
| 실제 Cloudflare 주소 | 4페이지 × 1920/390px | 8/8 통과 |
| 실제 사용자 Chrome | 1920px에서 너비와 버튼 부재 확인, 크기 복원 | 통과, 콘솔 오류 없음 |

큰 화면에서 각 페이지 본문이 1800px까지 확장되는지, 좁은 화면에서 가로 넘침이 없는지, 요청한 버튼과 옛 제한 안내가 사라졌는지 검사했다. Light/Dark를 포함하고, 찜은 격리 브라우저에서 실제 ♡ 조작으로 항목을 만든 뒤 확인했다. 개별 장표·시나리오의 PPTX 받기 UI도 확인했다. 사용자 브라우저의 My·찜 자료를 수정하지 않았다. 모델 호출은 차단했다.

증거: [검증용 빌드](evidence/stage10/source-report.json), [외부 주소](evidence/stage10/production-report.json), [1920px 실제 Chrome](evidence/stage10/catalog-wide.jpg).

## 배포

검증한 assets를 먼저 배치한 뒤 index를 원자적으로 교체하고 기존 assets는 보존했다. API·Cloudflare는 재시작하지 않았다. 임시 검증 서버만 검사 후 종료한다. 다른 작업 중 변경은 되돌리거나 이번 커밋에 넣지 않았으며, 원본 `src/`, `dist/`, `poc/`, `proddb/`도 수정하지 않았다.

```sh
WINMATE_LIBRARY_WEB=http://127.0.0.1:5192 WINMATE_TEST_PASSWORD='현재 비밀번호' node app/tests/library-width.mjs
WINMATE_LIBRARY_WEB=https://배포주소 WINMATE_LIBRARY_SUITE=smoke WINMATE_TEST_PASSWORD='현재 비밀번호' node app/tests/library-width.mjs
```
