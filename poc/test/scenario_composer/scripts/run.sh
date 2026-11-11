#!/usr/bin/env bash
# Scenario Composer 실험 — 샘플 버티컬 시나리오 재구성(leave-one-out) · 현재 Layout Agent 비교 · 블라인드 심사
#   bash scripts/run.sh smoke                 # 12개 덱으로 빠르게 확인 (~5분)
#   bash scripts/run.sh composer <이름> [rank|llm] [all|base]
#                                             # 재구성 (rank: 뼈대 = 상황 1순위 고정 · 기본) · all=85개 / base=Layout Agent 와 같은 40개
#   bash scripts/run.sh baseline              # 현재 Layout Agent — 평가 대상 샘플 버티컬 시나리오를 숨긴 공정 기준선 (runs/base-ho)
#   bash scripts/run.sh judge <이름> [상대]    # 블라인드 심사: 정답 대비 (상대 없음) 또는 상대 run 과 1:1 (예: base-ho)
#   bash scripts/run.sh report [run,run,…]    # 같은 덱 기준 비교표 (runs/REPORT_TABLES.md)
# 키: 저장소의 poc/.env (GEMINI_API_KEY · GEMINI_MODEL) — 출력하지 않음. 결과: runs/<이름>/ (summary.md · <id>.json · judge*.json)
set -euo pipefail
KIT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${WM_REPO_ROOT:-$(cd "$KIT/../../.." && pwd)}"
[ -d "$REPO/app" ] || REPO="$(cd "$KIT/../.." && pwd)"  # kit copied to <repo>/.wm_tmp/<kit>
PY="$REPO/app/.venv/bin/python"; [ -x "$PY" ] || PY="$(command -v python3)"
export WM_REPO_ROOT="$REPO" PYTHONDONTWRITEBYTECODE=1
if [ -f "$REPO/poc/.env" ]; then set -a; . "$REPO/poc/.env"; set +a; fi
export WM_COMPOSER_MODEL="${WM_COMPOSER_MODEL:-${GEMINI_MODEL:-gemini-3.1-flash-lite}}"
JUDGE_MODEL="${JUDGE_MODEL:-gemini-3.1-pro-preview}"
BASE_SET="bs01,bs02,bs03,bs04,bs05,bs06,bs07,bs08,bs09,bs10,bs11,bs12,bs13,bs14,bs15,bs16,bs17,bs18,bs19,bs20,bs_v_ai_store_1,bs_v_smart_hotel_2,bs_v_smart_office_1,bs_v_smart_hospital_2,bs_v_smart_school_1,bs_v_smart_factory_2,bs_v_smart_finance_1,bs_v_smart_retail_2,bs_v_smart_public_1,bs_v_entertainment_2,bs_std_ht_large,bs_std_rt_small,bs_std_of_sme,bs_std_md_hospital,bs_std_ed_k12,bs_account_inspire,bs_account_paulbassett,bs_account_episode"
SMOKE="bs01,bs07,bs11,bs13,bs17,bs19,bs_v_smart_hotel_1,bs_v_smart_factory_2,bs_v_ai_store_2,bs_std_ed_k12,bs_std_md_hospital,bs_account_inspire"
cd "$KIT"; mkdir -p runs
need_key() { [ -n "${GEMINI_API_KEY:-}" ] || { echo "GEMINI_API_KEY 가 없습니다 ($REPO/poc/.env)"; exit 1; }; }
composer() {  # <name> <rank|llm> <only>
  need_key
  WM_COMPOSER_BASE="$2" "$PY" -m eval.run_eval --name "$1" --llm gemini --mode self --jobs 4 --resume ${3:+--only "$3"} 2>&1 | tee -a "runs/$1.log"
}
judge() { need_key; "$PY" -m eval.judge --run "runs/$1" ${2:+--against "runs/$2"} --judge-model "$JUDGE_MODEL" --jobs 3 2>&1 | tee -a "runs/$1.judge${2:+-vs-$2}.log" | tail -40; }
step="${1:-smoke}"
case "$step" in
  smoke)    composer smoke rank "$SMOKE" ;;
  composer) n="${2:?이름}"; mode="${3:-rank}"; set_="${4:-base}"; composer "$n" "$mode" "$([ "$set_" = base ] && echo "$BASE_SET")" ;;
  baseline) need_key; WINMATE_LLM_PROVIDER=gemini "$PY" -m eval.baseline --name base-ho --only "$BASE_SET" --holdout 2>&1 | tee -a runs/base-ho.log ;;
  judge)    judge "${2:?이름}" "${3:-}" ;;
  report)   "$PY" -m eval.report --runs "${2:-gold,base-ho,r1,r2,r3}" --set base --out runs/REPORT_TABLES.md ;;
  *) echo "사용법: bash scripts/run.sh smoke|composer|baseline|judge|report"; exit 1 ;;
esac
