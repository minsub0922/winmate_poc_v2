# Winmate PoC 테스트 벤치

`poc/test` 아래 모듈을 한 웹 페이지에서 실행하고 결과를 검증합니다. 사이드바 탭마다 모듈에 맞는 화면이 있습니다.

## 켜기 · 끄기 (macOS)

- **켜기**: Finder 에서 `start.command` 더블클릭 (또는 터미널에서 `./start.sh`)
  - 처음 한 번 `.venv` 를 만들고 의존성을 설치합니다(uv 가 있으면 uv, 없으면 python3 venv · pip).
  - 서버는 백그라운드로 떠서 터미널 창을 닫아도 계속 실행됩니다. 로그는 `server.log`.
- **주소**: http://127.0.0.1:8787 (포트 고정 — 바꾸려면 `TESTBENCH_PORT=9000 ./start.sh`)
- **끄기**: `stop.command`
- 이 컴퓨터에서만 열리도록 127.0.0.1 에만 붙습니다(같은 네트워크의 다른 기기에서 쓰려면 `TESTBENCH_HOST=0.0.0.0`).

## 로그인

LLM(Gemini) 호출 비용이 생기므로 로그인한 사람만 실행할 수 있습니다.
- 계정 `admin` — 비밀번호는 `auth.json` 에 PBKDF2 해시로만 저장돼 있습니다(평문 없음).
- 바꾸기: `.venv/bin/python set_password.py`
- 로그인은 12시간 유지. 같은 주소에서 10분 안에 5번 틀리면 10분 동안 막습니다.
- API 키는 `poc/.env` 를 각 모듈이 그대로 읽습니다. 화면에는 키가 있는지만 보여 주고 값은 내보내지 않습니다.

## 탭

| 탭 | 모듈 | 검증할 수 있는 것 |
|---|---|---|
| 상태 | — | Gemini · Tavily 키 유무, 모듈 로딩, deepagents 사용 가능 여부, 최근 작업 |
| 원문 정리 실행 | `rfp_pipeline.py` | TC1~5 또는 직접 붙인 원문 → 읽는 방식(통째 · 조각 · 맥락 이월 · 갭 채우기) · 조각 크기 · 백엔드(Gemini · 기록 재생 · 규칙) 선택 → 사업별 Winmate 입력 폼, 정답 체크포인트 대조, 추출 원장(행을 누르면 원문에서 근거 위치 표시), 조각별 맥락 이월, 원문에 없는 숫자. **이 폼으로 레이아웃 Agent 실행** 으로 바로 이어 붙일 수 있음 |
| 저장된 실험 결과 | `results/` | 실행 → TC × 조건 표 → 상세(위와 같은 화면) |
| 배치 실험 | `run_experiment.py` | TC × 조건 × 조각 크기를 한 번에 돌려 results 에 저장 |
| 제안서 구성 실행 | `layout_agent` | TC(30 + holdout 12) · 직접 입력 · JSON → 요구 분석, 맥락 판정(①②③), 표준/Best 매칭 또는 요구 분해, **③ 이면 전략 질문에서 멈춤 → 답하면 이어서 진행**(Gemini 면 deepagents 전략 코파일럿과 대화도 가능), storyboard 우선순위, 슬라이드 미리보기(칸마다 값과 출처), 검토 이슈, proposal.app.json · report.md 받기 |
| 레이아웃 검색(RAG) | `layout_agent` | 질의 · 파트 유형 · 업종 · 맥락 · 전략 · 제품으로 후보 레이아웃과 점수 근거 · 메타데이터 |
| 평가 리포트 | `layout_agent/eval` | 리포트별 TC 점수 · 1 미만 지표 · 미리보기, 새 평가 실행(규칙 · Gemini) |
| 제안 시뮬레이션 · 실성능 검증 | `sim_eval` (Node) | 고객 10명 × 영업 담당자 유형(스토리라인 · 숙련 · 대조군) · 엔진(지금 · 수정 전) · 턴 수 · 동시 실행을 골라 실제 LLM 미팅 실행. **진행 중인 세션마다 만족도 · 품질 추이 그래프와 우려 칩이 1.5초마다 갱신**되고, 세션을 누르면 턴별 대사 · 점수 변화 · 자동 점검 · 독립 심사. 멈춤 → 이어서, 리포트 열기. 터미널에서 돌린 실행도 같은 목록에 보임 |
| 자동 테스트 | 두 모듈 | RFP unittest(Gemini 라이브 테스트는 켤 때만) · 레이아웃 pytest 통과/실패 |
| 작업 기록 | — | 서버가 켜진 뒤 실행한 작업(누르면 그 결과 화면으로) |

긴 작업(Gemini 실행 · 평가)은 서버의 백그라운드 작업으로 돌고, 화면은 1초마다 진행 로그와 단계 막대를 갱신합니다. 탭을 옮겨도 계속 돌고, 돌아오면 마지막 작업을 다시 보여 줍니다. 작업 기록은 서버를 끄면 지워집니다(파일로 저장하는 결과는 각 모듈 폴더에 남음).

## 구조

```
testbench/
  server.py          FastAPI — 로그인 · 작업 · 각 모듈 API · 정적 파일(/img 는 winmatev2/img)
  core.py            경로 · PBKDF2 로그인 · 서명 쿠키 · 백그라운드 작업
  adapters/rfp.py     rfp_pipeline · run_experiment 를 불러 실행(진행 로그를 단계별로 흘림)
  adapters/layout.py  LangGraph 실행(stream) · interrupt 답 · 전략 코파일럿 · RAG 검색 · 리포트
  adapters/selftest.py 테스트 스위트 · 평가 스크립트를 하위 프로세스로
  adapters/sim.py     sim_eval 의 node run.mjs 를 하위 프로세스로 · runs/ 를 읽어 실시간 화면에 (Node 18 이상 필요)
  static/            index.html · app.js · app.css · login.html (빌드 없음)
  start.command · start.sh · stop.command · set_password.py · auth.json
```
모듈 코드는 고치지 않고 그대로 불러 씁니다 — 모듈을 고친 뒤 서버를 다시 켜면 반영됩니다.
