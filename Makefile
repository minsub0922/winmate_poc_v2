.PHONY: up prepare test test-browser test-live smoke tunnel
up:
	./start.sh
tunnel:
	bash app/scripts/cloudflare.sh
prepare:
	node app/scripts/export_agent_data.mjs
	app/.venv/bin/python -B app/scripts/prepare_data.py
test:
	PYTHONDONTWRITEBYTECODE=1 app/.venv/bin/python -B -m pytest app/tests -q
	node app/tests/catalog-metrics.mjs
	node app/tests/requirement-summary.mjs
	node app/tests/layout-usage.mjs
	node app/tests/transport.mjs
	node app/tests/sample-history.mjs
	node app/tests/sample-reviews.mjs
	node app/tests/review-criteria.mjs
	node app/tests/simulation-skills.mjs
	app/.venv/bin/python -B app/tests/strict_contracts.py
test-browser:
	node app/tests/functional-contracts.mjs
	node app/tests/real-functional-e2e.mjs
	node app/tests/input_readers.mjs
	node app/tests/explorers.mjs
test-live:
	app/.venv/bin/python -B app/tests/run_live_suite.py
smoke:
	app/.venv/bin/python -B app/scripts/smoke.py --prompt
