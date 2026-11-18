"""Isolated account-data API for app/tests/account-sync.mjs: python account_data_server.py <port> <sqlite path>."""
from pathlib import Path
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI  # noqa: E402
import uvicorn  # noqa: E402

from app.api.account_data import AccountDataStore, build_router  # noqa: E402

app = FastAPI()
app.state.auth = SimpleNamespace(config=SimpleNamespace(enabled=False))
app.state.account_data = AccountDataStore(Path(sys.argv[2]))
app.include_router(build_router())


@app.get('/health')
def health():
    return {'ok': True}


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=int(sys.argv[1]), log_level='warning')
