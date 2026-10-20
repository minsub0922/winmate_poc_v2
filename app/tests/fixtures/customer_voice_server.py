"""Real app/admin feedback paths in temporary account/auth/admin stores; no real model calls."""
import os
from dataclasses import replace
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from admin import server
from app.api.poc import settings, service
import uvicorn

settings._SETTINGS = settings.load_settings({}, [])
import app.api.main as main
main.initialize_poc = lambda: service.initialize(require_provider=False, warm=False)
auth = server.winmate.state.auth
auth.reconfigure(replace(auth.config, enabled=True, auth_dir=Path(os.environ['WINMATE_AUTH_DIR']), iterations=2000))
if not auth.configured():
    auth.set_credentials('voice-admin', 'voice-browser-test-password')
server.service.start = lambda: None
uvicorn.run(server.app, host='127.0.0.1', port=int(os.environ['WINMATE_API_PORT']), log_level='warning')
