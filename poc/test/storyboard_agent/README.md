# Storyboard 설계 에이전트 (poc/test/storyboard_agent)

요구사항 · 제품/솔루션 선택 결과 · 업종 · (있으면) 이전 storyboard 로 제안서 **storyboard 전체**를 설계한다.
Best Scenario 21개를 레퍼런스로 쓰되 골격만 빌리고(패턴 카드), 내용은 고객 입력에서만 가져온다. 설계: [DESIGN.md](DESIGN.md) · 실험 결과: [REPORT.md](REPORT.md)

표준 라이브러리만 쓴다(Python 3.9+, `pip install` 없음). LLM 은 Gemini REST — 키는 `poc/.env` 의 `GEMINI_API_KEY` · `GEMINI_MODEL` 을 그대로 읽는다.

## 실행

```bash
cd poc/test/storyboard_agent
python3 -m sbagent --seed p_case_f7                          # 히스토리 샘플 하나 · 규칙(LLM 없음)
python3 -m sbagent --seed p_case_f6 --keep 4 --backend gemini  # 앞 4파트를 이전 storyboard 로 두고 이어서
python3 -m sbagent --proposal my_proposal.json --backend gemini --strategy pain --out sb.json   # 앱 제안서 JSON
python3 -m unittest -v tests.test_agent                      # 오프라인 회귀 테스트

python3 eval/make_tasks.py                                    # 히스토리 샘플 → 평가 과제 38개
python3 eval/run_eval.py --name live --backend gemini --runs 3 --workers 6
python3 eval/run_eval.py --name live --backend replay --runs 3           # 기록된 응답(cache/)으로 네트워크 없이 재현
```

```bash
python3 eval/stats.py --run live                              # 에이전트 − 비교 조건 차이 · 과제 단위 bootstrap 95% 구간 → stats.md
python3 eval/judge_pack.py --run live --out judge/ --tag a     # 이름 가린 심사 묶음(batch_a1.md …) + 키(key_a.json — 심사자에게 주지 않음)
python3 eval/judge_pack.py --run live --out judge/ --tag b --seed 7   # 후보 순서를 달리 섞은 두 번째 벌
python3 eval/judge_score.py --scores judge/ --keys <키 폴더> --tags a,b --out results/live/judge.md
```

결과: `results/<이름>/summary.md`(조건별 지표) · `stats.md`(신뢰구간) · `judge.md`(독립 심사) · `outputs.jsonl`(과제 × 조건 × 반복마다 storyboard · 지표 · 추적).
최신 실험은 `results/live-v2/` — 정리는 [REPORT.md](REPORT.md).

## 구조

```
sbagent/
  brief.py       ① 요구 원장 — 키맨 요구 · 자유형식 · 제작자 의견 · 첨부 · 선택 결과
  situation.py   ② 상황 판정 — 요구 유형 · 맥락 수준 · 전략 후보 3 · 결말 · 분량
  references.py  ③ Best Scenario 검색 · 다양성 선택 · 패턴 카드(골격 · 다른 점 · 쓰지 말 표현)
  planner.py     ④ LLM 설계 프롬프트 · 스키마 / 규칙 설계(오프라인 대체)
  validate.py    ⑤ 검증 · ⑥ 규칙 수리 (이전 파트 보존 · 요구 미반영 · 선택 밖 이름 · 근거 없는 수치 · 다른 업종 표현 · 마무리)
  agent.py       ①~⑥ 연결 · 앱 파트 모양으로 변환(to_app_parts)
  baselines.py   비교 조건 — 앱 규칙(fallbackStoryboard) · 앱 AI 방식 · 레퍼런스 원문 LLM · 레퍼런스 복제
  llm.py         Gemini · replay 백엔드(캐시 · 재시도 · 반복 폭주 감지)
eval/            과제 만들기 · 지표 · 실행 · 신뢰구간(stats.py) · 독립 심사 묶음/집계(judge_pack.py · judge_score.py)
data/            앱 src 스냅샷(파트 유형 · Best Scenario · 카탈로그 요약 · 히스토리 샘플) — scripts/export_source.mjs 로 갱신
```
