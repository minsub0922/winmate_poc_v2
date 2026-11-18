"""Isolated authenticated server; spatial history never touches the user's data."""
import os
from pathlib import Path
import sys
from dataclasses import replace
os.environ.setdefault('WINMATE_TEMPLATE_DB',str(Path(os.environ['WINMATE_AUTH_DIR'])/'my_templates.sqlite'))
os.environ.setdefault('WINMATE_SPATIAL_DB',str(Path(os.environ['WINMATE_AUTH_DIR'])/'spatial.sqlite'))
os.environ.setdefault('WINMATE_STORYBOARD_DIR',str(Path(os.environ['WINMATE_AUTH_DIR'])/'storyboards'))
# 계정 자료(제안서 · 히스토리)도 임시 폴더로 — 주지 않으면 이 격리 서버가 실제 app/data/runtime/account_data.sqlite에 쓴다
os.environ.setdefault('WINMATE_ACCOUNT_DATA_DB',str(Path(os.environ['WINMATE_AUTH_DIR'])/'account_data.sqlite'))
sys.path.insert(0,str(Path(__file__).resolve().parents[4]))
from app.api import main
from app.api.poc import service
import uvicorn
main.initialize_poc=lambda:service.initialize(require_provider=False,warm=False)
auth=main.app.state.auth
auth.reconfigure(replace(auth.config,enabled=True,auth_dir=Path(os.environ['WINMATE_AUTH_DIR']),iterations=2000))
auth.set_credentials('admin','spatial-isolated-test-password')
uvicorn.run(main.app,host='127.0.0.1',port=int(os.environ['WINMATE_API_PORT']),log_level='warning')
