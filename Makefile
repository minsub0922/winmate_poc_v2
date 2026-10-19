.PHONY: up prepare test smoke
up:
	./start.sh
prepare:
	node app/scripts/export_agent_data.mjs
	app/.venv/bin/python -B app/scripts/prepare_data.py
test:
	WINMATE_AUTH=off WINMATE_ENV_FILES=none app/.venv/bin/python -B -m pytest app/tests/test_stage1_api.py app/tests/test_poc_adapters.py app/tests/test_feature_flags.py app/tests/test_auth.py -q
smoke:
	app/.venv/bin/python -B app/scripts/smoke.py
