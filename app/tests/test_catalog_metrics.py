"""Daily counts: Korea midnight, concurrent requests, restarts, changed DBs and failed updates."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import Mock

from app.api.catalog_metrics import DailyCatalogMetrics, collect_counts
from app.api.products import ProductRepository


class CatalogMetricsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / 'metrics.sqlite'
        self.now = datetime(2026, 10, 20, 14, 59, 59, tzinfo=timezone.utc)
        self.counts = {'layouts': 3, 'industry_layouts': 1, 'products': 5, 'solutions': 2, 'cases': 4}
        self.collect = Mock(side_effect=lambda: dict(self.counts))
        self.store = DailyCatalogMetrics(self.path, self.collect, lambda: self.now)

    def test_korea_midnight_refreshes_all_counts_together(self):
        before = self.store.get()
        self.assertEqual(before['next_refresh_at'], '2026-10-21T00:00:00+09:00')
        self.counts = {key: value + 1 for key, value in self.counts.items()}
        self.assertEqual(self.store.get(), before)
        self.now = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)
        after = self.store.get()
        self.assertEqual(after['counts'], self.counts)
        self.assertEqual(after['updated_at'], '2026-10-21T00:00:00+09:00')
        self.assertEqual(self.collect.call_count, 2)

    def test_restart_reuses_the_persisted_day(self):
        before = self.store.get()
        restarted = DailyCatalogMetrics(self.path, Mock(side_effect=AssertionError('must not collect twice')), lambda: self.now)
        self.assertEqual(restarted.get(), before)

    def test_concurrent_workers_collect_once(self):
        stores = [DailyCatalogMetrics(self.path, self.collect, lambda: self.now) for _ in range(8)]
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(lambda store: store.get(), stores))
        self.assertTrue(all(result == results[0] for result in results))
        self.collect.assert_called_once()

    def test_failed_update_preserves_previous_counts_and_retries(self):
        before = self.store.get()
        self.now = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)
        self.collect.side_effect = OSError('source temporarily unavailable')
        with self.assertLogs('app.api.catalog_metrics', level='ERROR'):
            stale = self.store.get()
        self.assertTrue(stale['stale'])
        self.assertEqual(stale['counts'], before['counts'])
        self.assertEqual(stale['updated_at'], before['updated_at'])
        self.assertEqual(stale['next_refresh_at'], '2026-10-21T01:00:00+09:00')
        self.collect.side_effect = lambda: dict(self.counts, products=8)
        self.assertEqual(self.store.get()['counts']['products'], 8)

    def test_invalid_counts_never_replace_successful_counts(self):
        before = self.store.get()
        self.now = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)
        for invalid in [dict(self.counts, products=-1), dict(self.counts, products=True), dict(self.counts, industry_layouts=99), {'products': 5}]:
            with self.subTest(invalid=invalid), self.assertLogs('app.api.catalog_metrics', level='ERROR'):
                self.collect.side_effect = lambda: invalid
                self.assertEqual(self.store.get()['counts'], before['counts'])

    def test_initial_failure_does_not_create_zero_counts(self):
        self.collect.side_effect = OSError('missing catalogue')
        with self.assertLogs('app.api.catalog_metrics', level='ERROR'), self.assertRaises(OSError):
            self.store.get()
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM daily_metrics').fetchone()[0], 0)

    def test_collection_reads_updated_sources_and_excludes_retired_layouts(self):
        kb = self.root / 'runtime/kb'
        kb.mkdir(parents=True)
        (kb / 'manifest.json').write_text('{}')
        (kb / 'catalog.json').write_text(json.dumps({'layouts': [{'f': 'a', 'ind': 'EDU'}, {'f': 'b'}, {'f': 'c', 'ind': 'EDU'}, {'f': 'd', 'retired': True}]}))
        (kb / 'retired.json').write_text(json.dumps({'c': 'a'}))
        (self.root / 'catalog.json').write_text(json.dumps({'solutions': [1, 2], 'cases': [1, 2, 3]}))
        database = self.root / 'products.sqlite'
        with sqlite3.connect(database) as db:
            db.execute('CREATE TABLE wm_ui_product (id TEXT)')
            db.executemany('INSERT INTO wm_ui_product VALUES (?)', [('p1',), ('p2',)])
        products = ProductRepository(database)
        self.assertEqual(collect_counts(products, self.root), {'layouts': 2, 'industry_layouts': 1, 'products': 2, 'solutions': 2, 'cases': 3})
        with sqlite3.connect(database) as db:
            db.execute("INSERT INTO wm_ui_product VALUES ('new')")
        (self.root / 'catalog.json').write_text(json.dumps({'solutions': [1], 'cases': [1]}))
        self.assertEqual(collect_counts(products, self.root), {'layouts': 2, 'industry_layouts': 1, 'products': 3, 'solutions': 1, 'cases': 1})
