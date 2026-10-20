"""Persist home catalogue counts once per Korea calendar day, across workers/restarts."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import logging
from pathlib import Path
import sqlite3

KST = timezone(timedelta(hours=9))
KEYS = {'layouts', 'industry_layouts', 'products', 'solutions', 'cases'}
logger = logging.getLogger(__name__)


def collect_counts(products, data: Path) -> dict:
    # The canonical export contains the same merged layouts and retirement rules as the UI.
    kb = data / 'runtime/kb'
    manifest = (kb / 'manifest.json').read_bytes()
    layouts = json.loads((kb / 'catalog.json').read_text())['layouts']
    retired = json.loads((kb / 'retired.json').read_text())
    catalog = json.loads((data / 'catalog.json').read_text())
    active = [layout for layout in layouts if not layout.get('retired') and layout['f'] not in retired]
    counts = {
        'layouts': len(active),
        'industry_layouts': sum(bool(layout.get('ind')) for layout in active),
        'products': products.count(),
        'solutions': len(catalog['solutions']),
        'cases': len(catalog['cases']),
    }
    if (kb / 'manifest.json').read_bytes() != manifest:
        raise ValueError('레이아웃 자료를 갱신 중입니다.')
    return counts


class DailyCatalogMetrics:
    def __init__(self, database: Path, collect, clock=None):
        self.database = database
        self.collect = collect
        self.clock = clock or (lambda: datetime.now(KST))
        database.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS daily_metrics (id INTEGER PRIMARY KEY CHECK(id=1), day TEXT NOT NULL, payload TEXT NOT NULL)')

    def connect(self):
        return sqlite3.connect(self.database, timeout=30)

    def get(self) -> dict:
        now = self.clock().astimezone(KST)
        day = now.date().isoformat()
        tomorrow = datetime.combine(now.date() + timedelta(days=1), datetime.min.time(), KST)
        with self.connect() as db:
            # The transaction prevents two requests/workers from collecting the same day twice.
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT day, payload FROM daily_metrics WHERE id=1').fetchone()
            if row and row[0] == day:
                return json.loads(row[1])
            try:
                counts = self.collect()
                if set(counts) != KEYS or any(type(n) is not int or n < 0 for n in counts.values()) or counts['industry_layouts'] > counts['layouts']:
                    raise ValueError('자산 건수 형식이 올바르지 않습니다.')
            except (OSError, ValueError, KeyError, TypeError, sqlite3.Error):
                logger.exception('홈 자산 건수 집계 실패; 마지막 집계를 유지합니다.')
                if not row:
                    raise
                # Preserve the last successful counts; retry later without breaking the home page.
                return {**json.loads(row[1]), 'stale': True, 'next_refresh_at': (now + timedelta(hours=1)).isoformat()}
            result = {'counts': counts, 'updated_at': now.isoformat(), 'next_refresh_at': tomorrow.isoformat(), 'timezone': 'Asia/Seoul', 'stale': False}
            db.execute('INSERT OR REPLACE INTO daily_metrics VALUES (1, ?, ?)', (day, json.dumps(result)))
            return result
