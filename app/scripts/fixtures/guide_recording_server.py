"""Actual API for guide recordings, with isolated account/databases and no models."""
import os
from pathlib import Path
import sys
from dataclasses import replace
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from app.api import main
from app.api.poc import settings, service
import uvicorn
settings._SETTINGS = settings.load_settings({}, [])
main.initialize_poc = lambda: service.initialize(require_provider=False, warm=False)
auth = main.app.state.auth
auth.reconfigure(replace(auth.config, enabled=True, auth_dir=Path(os.environ['WINMATE_AUTH_DIR']), iterations=2000))
auth.set_credentials('admin', 'isolated-guide-recording-password')
uvicorn.run(main.app, host='127.0.0.1', port=int(os.environ['WINMATE_API_PORT']), log_level='warning')
