.PHONY: up prepare test test-browser test-live smoke tunnel
up:
	./start.sh
tunnel:
	bash app/scripts/cloudflare.sh
prepare:
	node app/scripts/export_agent_data.mjs
	app/.venv/bin/python -B app/scripts/prepare_data.py
test:
	PYTHONDONTWRITEBYTECODE=1 app/.venv/bin/python -B -m pytest app/tests/test_stage1_api.py app/tests/test_strict_policy.py app/tests/test_provider_strict.py app/tests/test_job_retry.py app/tests/test_auth.py app/tests/test_delivery.py -q
	node app/tests/transport.mjs
	node app/tests/sample-history.mjs
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
