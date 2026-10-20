"""Move only one account's My templates/images between independent deployments.

No passwords, sessions, API keys or other users' records are exported.
"""
import argparse
import base64
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from app.api.my_templates import TemplateStore, TOKEN


def export_account(store, owner):
    manifest = []; after = ''
    while True:
        page = store.list(owner, after)
        manifest.extend(row for row in page['items'] if not row['deleted'])
        after = page['next']
        if not after:
            break
    items = [store.get(owner, row['f']) for row in manifest]
    images = {}
    for identifier in {identifier for row in items for identifier in TOKEN.findall(row['html'])}:
        mime, data = store.image(owner, identifier)
        images[identifier] = 'data:' + mime + ';base64,' + base64.b64encode(data).decode()
    return {'version': 1, 'owner': owner, 'items': items, 'images': images}


def import_account(store, owner, value):
    if value.get('version') != 1 or value.get('owner') != owner or not isinstance(value.get('items'), list):
        raise ValueError('계정과 내보내기 파일 형식이 일치하지 않습니다.')
    stored = 0
    for row in value['items']:
        images = {identifier: value['images'][identifier] for identifier in set(TOKEN.findall(row['html']))}
        result = store.save(owner, {'mode': 'migrate', 'items': [row], 'images': images})
        stored += result['stored']
    return stored


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['export', 'import'])
    parser.add_argument('--db', type=Path, required=True, help='The deployment account/template SQLite database')
    parser.add_argument('--username', required=True)
    parser.add_argument('--file', type=Path, required=True)
    args = parser.parse_args()
    if not args.db.is_file():
        parser.error('DB 파일을 찾지 못했습니다.')
    store = TemplateStore(args.db)
    if args.action == 'export':
        value = export_account(store, args.username)
        # Refuse to overwrite an existing export accidentally.
        with args.file.open('x', encoding='utf-8') as file:
            json.dump(value, file, ensure_ascii=False)
        print(json.dumps({'owner': args.username, 'templates': len(value['items']), 'images': len(value['images']), 'file': str(args.file)}, ensure_ascii=False))
    else:
        value = json.loads(args.file.read_text())
        print(json.dumps({'owner': args.username, 'imported': import_account(store, args.username, value)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
