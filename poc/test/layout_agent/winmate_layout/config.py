"""환경 설정 — poc/.env (또는 test/.env) 에서 GEMINI_API_KEY · GEMINI_MODEL 을 읽는다."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent  # 이 프로젝트 폴더(poc/test 또는 poc/test/layout_agent)


def _app_root(start: Path) -> Path:
    """winmatev2 본 앱 루트 — img/ 와 src/ 가 있는 가장 가까운 상위 폴더."""
    for anc in (start, *start.parents):
        if (anc / "img").is_dir() and (anc / "src").is_dir():
            return anc
    return start.parent.parent


APP_ROOT = _app_root(ROOT)
for p in (ROOT / ".env", ROOT.parent / ".env", ROOT.parent.parent / ".env"):  # 가까운 .env 우선(보통 poc/.env)
    if p.exists():
        load_dotenv(p, override=False)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")
GEMINI_EMBED_MODEL = os.getenv("GEMINI_EMBED_MODEL", "gemini-embedding-001")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# offline | gemini | auto(키가 있으면 gemini)
LLM_MODE = os.getenv("WINMATE_LLM", "auto")
# tfidf | gemini  (dense 검색 백엔드)
DENSE_MODE = os.getenv("WINMATE_DENSE", "tfidf")
CACHE_DIR = ROOT / "data" / "cache"
