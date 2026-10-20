"""Repair only unchanged, authored appendix sheets in admin's saved shared examples."""
import copy
import json
from pathlib import Path
import time


def repair_document(document, original, replacement):
    before = {layout['uid']: layout for part in original['parts'] for layout in part['layouts']}
    replacements = {part['name']: part['layouts'][0] for part in replacement['parts'][-4:]}
    repaired = copy.deepcopy(document)
    changed = 0
    for part in repaired.get('parts', []):
        target = replacements.get(part.get('name'))
        if not target:
            continue
        for layout in part.get('layouts', []):
            source = before.get(layout.get('uid'))
            if not source or layout.get('f') != 'L_AIS_32' or layout.get('ov') != source.get('ov'):
                continue
            layout.update(f=target['f'], ov=copy.deepcopy(target['ov']), status='done')
            layout.pop('adaptation', None)
            changed += 1
    return repaired, changed


def repair_shared_examples(store, directory=None):
    directory = directory or Path(__file__).resolve().parents[1] / 'web/src/domain/review'
    current = json.loads((directory / 'linked-review-examples.json').read_text())
    if not current.get('layoutRevision'):
        return 0
    replacements = {example['scenario']: example['proposal'] for example in current['examples']}
    originals = {}
    for version in (3, 4, 5):
        archive = json.loads((directory / f'linked-review-examples-v{version}.json').read_text())
        for example in archive['examples']:
            originals[example['proposal']['id']] = (example['proposal'], replacements[example['scenario']])
    changed = 0
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        rows = db.execute('SELECT token, source, content FROM storyboards WHERE owner=?', ('user:admin',)).fetchall()
        for row in rows:
            pair = originals.get(row['source'])
            if not pair:
                continue
            document, count = repair_document(json.loads(row['content']), *pair)
            if count:
                db.execute('UPDATE storyboards SET content=?, revision=revision+1, updated_at=? WHERE token=?',
                           (json.dumps(document, ensure_ascii=False), int(time.time() * 1000), row['token']))
                changed += count
    return changed
