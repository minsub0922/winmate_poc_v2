"""Auto-selection assigns distinct layouts without dropping slides or altering the PoC module."""
from types import SimpleNamespace
import json
from pathlib import Path
import tempfile
import unittest

from app.api.poc.jobs import ModelFailure
from app.api.poc.layout_uniqueness import build_graph, unique_assemble
from app.api.review_example_layouts import repair_document, repair_shared_examples
from app.api.storyboards import StoryboardStore


def assemble(kb, parts, rows):
    return [{'part_id': row['part_id'], 'f': row['candidates'][0]['f'], 'alternates': []} for row in rows]


def rank_slide(*args, top=12):
    return {'candidates': [{'f': 'used'}, {'f': 'fresh'}], 'top': top}


def paginate(kb, slides, analysis):
    return slides


def graph_factory(kb, llm, index):
    return {'assemble': assemble, 'rank': rank_slide, 'paginate': paginate}


def candidate(f, score=10):
    return {'f': f, 'score': score, 'code': f, 'name': f}


class LayoutUniquenessTests(unittest.TestCase):
    def rows(self, choices):
        return [{'part_id': 'p', 'slide': i, 'candidates': [candidate(f, 100-j) for j, f in enumerate(fs)]} for i, fs in enumerate(choices)]

    def select(self, choices, excluded=()):
        return unique_assemble(assemble, None, [{'id': 'p', 'slides': len(choices)}], self.rows(choices), excluded)

    def test_constrained_slide_keeps_its_only_layout(self):
        result = self.select([['shared', 'other'], ['shared']])
        self.assertEqual([s['f'] for s in result], ['other', 'shared'])

    def test_reassigns_earlier_choices_instead_of_repeating_or_dropping_a_slide(self):
        result = self.select([['a', 'b'], ['b', 'c'], ['a', 'b']])
        self.assertEqual(len(result), 3)
        self.assertEqual({s['f'] for s in result}, {'a', 'b', 'c'})

    def test_existing_manual_layout_is_reserved(self):
        result = self.select([['used', 'fresh'], ['used', 'other']], ['used'])
        self.assertEqual({s['f'] for s in result}, {'fresh', 'other'})

    def test_exhaustion_and_empty_slots_fail_without_silently_dropping_content(self):
        for choices in [[['a'], ['a']], [[]], [['used']]]:
            with self.subTest(choices=choices), self.assertRaises(ModelFailure):
                self.select(choices, ['used'])

    def test_alternates_never_suggest_a_layout_already_used_in_this_deck(self):
        result = self.select([['a', 'b', 'c'], ['b', 'a', 'd']])
        used = {s['f'] for s in result}
        self.assertTrue(all(a['f'] not in used for s in result for a in s['alternates']))

    def test_graph_policy_is_private_to_each_job(self):
        modules = SimpleNamespace(graph=SimpleNamespace(build_graph=graph_factory))
        kb = SimpleNamespace(cards={'used': {}, 'fresh': {}})
        restricted = build_graph(modules, kb, None, None, ['used'])
        normal = build_graph(modules, kb, None, None)
        self.assertEqual(restricted['rank']()['candidates'], [{'f': 'fresh'}])
        self.assertEqual(normal['rank']()['candidates'], [{'f': 'used'}, {'f': 'fresh'}])
        self.assertEqual(rank_slide()['candidates'], [{'f': 'used'}, {'f': 'fresh'}])
        self.assertIs(graph_factory(None, None, None)['assemble'], assemble)

    def test_automatic_pagination_cannot_reintroduce_duplicate_templates(self):
        modules = SimpleNamespace(graph=SimpleNamespace(build_graph=graph_factory))
        graph = build_graph(modules, SimpleNamespace(cards={}), None, None)
        with self.assertRaises(ModelFailure):
            graph['paginate'](None, [{'f': 'a'}, {'f': 'a'}], {})

    def test_shared_example_migration_preserves_owner_permission_and_user_edits(self):
        data = Path(__file__).resolve().parents[1] / 'web/src/domain/review'
        original = json.loads((data / 'linked-review-examples-v5.json').read_text())['examples'][2]['proposal']
        replacement = json.loads((data / 'linked-review-examples.json').read_text())['examples'][2]['proposal']
        edited = json.loads(json.dumps(original))
        edited['parts'][-4]['layouts'][0]['ov']['t']['5'] = '사용자가 직접 작성한 내용'
        repaired, changed = repair_document(edited, original, replacement)
        self.assertEqual(changed, 3)
        self.assertEqual(repaired['parts'][-4], edited['parts'][-4])
        with tempfile.TemporaryDirectory() as directory:
            store = StoryboardStore(Path(directory))
            with store.connect() as db:
                for token, owner in [('admin-example', 'user:admin'), ('member-example', 'user:member')]:
                    db.execute('INSERT INTO storyboards VALUES (?, ?, ?, ?, ?, ?, ?)',
                               (token, owner, original['id'], 'edit', 7, json.dumps(original), 1))
            self.assertEqual(repair_shared_examples(store), 4)
            self.assertEqual(repair_shared_examples(store), 0)
            with store.connect() as db:
                row = db.execute("SELECT * FROM storyboards WHERE token='admin-example'").fetchone()
                self.assertEqual(row['owner'], 'user:admin')
                self.assertEqual(row['permission'], 'edit')
                self.assertEqual(row['revision'], 8)
                document = json.loads(row['content'])
                ids = [x['f'] for p in document['parts'] for x in p['layouts']]
                self.assertEqual(len(ids), len(set(ids)))
                self.assertEqual(db.execute("SELECT revision FROM storyboards WHERE token='member-example'").fetchone()[0], 7)
