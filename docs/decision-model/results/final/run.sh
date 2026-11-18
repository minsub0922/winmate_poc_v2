#!/usr/bin/env bash
# Reproduce the final evaluation (docs/decision-model/FINAL-REPORT.md).
#
# Run it on a frozen copy of the tree when anything else may rewrite app/data/runtime/kb meanwhile (the final run used an
# APFS clone of app · poc · data + the KB, with .env and app/.venv symlinked). Every chunk runs four independent processes
# in parallel; each stops before its next TC after BUDGET seconds (exit 75) and resumes from its JSON — run this script
# again until it prints exit 0 for all four. Then:
#   app/.venv/bin/python -B app/tests/decision_eval.py --combine $D/openrouter.json $D/gemma.json $D/decision.json $D/think.json --out $D/final.json
# The combine step fails if two runs saw different TC inputs (fingerprints differ).
cd "$(dirname "$0")/../../../.." || exit 1
D=${OUT_DIR:-docs/decision-model/results/final}
PY="app/.venv/bin/python -B app/tests/decision_eval.py --resume --budget ${BUDGET:-420}"
$PY --branches llm --out $D/openrouter.json >> $D/openrouter.log 2>&1 & a=$!
$PY --branches gemma --out $D/gemma.json >> $D/gemma.log 2>&1 & b=$!
$PY --branches decision,decision_raw,clef,clef_raw --clef http://127.0.0.1:8790/v1 --out $D/decision.json >> $D/decision.log 2>&1 & c=$!
$PY --tasks search.rerank --branches llm_think --out $D/think.json >> $D/think.log 2>&1 & d=$!
wait $a; ea=$?; wait $b; eb=$?; wait $c; ec=$?; wait $d; ed=$?
echo "exit openrouter=$ea gemma=$eb decision=$ec think=$ed"
