import pytest

from admin import origins
from admin.engine import EngineError


@pytest.fixture(autouse=True)
def offline_origins(monkeypatch):
    """원본 대조는 시험에서 실제 사이트에 연결하지 않는다 — 필요한 시험이 origins.fetch 를 가짜 원본으로 다시 바꾼다."""
    def blocked(url, **options):
        raise EngineError('시험 환경에서는 원본에 연결하지 않습니다.')
    monkeypatch.setattr(origins, 'fetch', blocked)


@pytest.fixture(autouse=True)
def offline_provider_timer(monkeypatch):
    """Provider 탭의 정기 점검(08~22시 30분마다, 외부 API 포함)은 시험에서 돌지 않는다 — 서버를 띄우는 시험이 실제 외부 API 에
    연결하지 않게. test_providers.py 는 이 값을 지우고 가짜 외부 API(External)로 시간표를 시험한다."""
    monkeypatch.setenv('WINMATE_PROVIDER_CHECK_INTERVAL', 'off')
