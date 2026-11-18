"""Shared building presets, in the same SQLite store as managed spatial scenes."""
import json
import math

from fastapi import HTTPException


class BuildingTemplates:
    def __init__(self, directory, connect):
        path = directory / 'building-presets.json'
        catalog = json.loads(path.read_text()) if path.is_file() else {}
        self.presets = {p['id']: p for p in catalog.get('presets', [])}
        self.version = catalog.get('version', '')
        self.floors = set(catalog.get('floors', []))
        self.industries = {f['shell']['ind'] for p in self.presets.values() for f in p['floors']}
        self.connect = connect
        with connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS building_template_edits (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, scene TEXT NOT NULL)')

    def edits(self):
        with self.connect() as db:
            return {r['id']: {'revision': r['revision'], 'scene': json.loads(r['scene'])}
                    for r in db.execute('SELECT * FROM building_template_edits') if r['id'] in self.presets}

    def get(self, identifier):
        original = self.presets.get(identifier)
        if original is None:
            raise HTTPException(404, '건물 템플릿을 찾지 못했습니다.')
        with self.connect() as db:
            row = db.execute('SELECT revision,scene FROM building_template_edits WHERE id=?', (identifier,)).fetchone()
        return {'id': identifier, 'revision': row['revision'] if row else 0, 'scene': json.loads(row['scene']) if row else original}

    def clean(self, identifier, scene):
        def number(v):
            return type(v) in (int, float) and math.isfinite(v)
        title = scene.get('title')
        floors = scene.get('floors')
        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 80 or not isinstance(floors, list) or not 1 <= len(floors) <= 30:
            raise ValueError('건물 이름과 층 수를 확인해 주세요.')
        clean, keys = [], set()
        for f in floors:
            shell = f.get('shell') or {}
            key, tpl, fv = f.get('key'), f.get('tpl'), f.get('fv', 0)
            name = f.get('name', '')
            if not isinstance(key, str) or not 1 <= len(key) <= 100 or key in keys or (tpl is not None and tpl not in self.floors):
                raise ValueError('등록된 층 템플릿과 고유한 층 ID가 필요합니다.')
            if (type(fv) is not int or not 0 <= fv <= 30 or not isinstance(name, str) or len(name) > 80
                    or shell.get('ind') not in self.industries or any(not number(shell.get(k)) or not 0 < shell[k] <= 300 for k in ('w', 'd'))):
                raise ValueError('층 이름·외벽·크기를 확인해 주세요.')
            keys.add(key)
            clean.append({'key': key, 'tpl': tpl, 'fv': fv, 'shell': {k: shell[k] for k in ('ind','w','d')}, **({'name': name} if name else {})})
        mode = (scene.get('view') or {}).get('mode', 'exterior')
        camera = scene.get('camera')
        if mode not in ('exterior', 'spread') or camera is not None and (
                not all(number(camera.get(k)) for k in ('azimuth', 'elevation', 'zoom')) or camera['zoom'] <= 0):
            raise ValueError('건물 시점을 확인해 주세요.')
        return {'id': identifier, 'template': identifier, 'title': title.strip(), 'industry': self.presets[identifier]['industry'],
                'floors': clean, 'view': {'mode': mode}, 'camera': {k: camera[k] for k in ('azimuth','elevation','zoom')} if camera else None}

    def save(self, identifier, body):
        if identifier not in self.presets:
            raise HTTPException(404, '건물 템플릿을 찾지 못했습니다.')
        if body.get('confirmed') is not True or type(body.get('revision')) is not int:
            raise HTTPException(422, '건물 변경 사항과 편집 버전을 확인한 뒤 저장해 주세요.')
        try:
            scene = self.clean(identifier, body.get('scene'))
        except (ValueError, AttributeError, TypeError) as exc:
            raise HTTPException(422, str(exc)) from None
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT revision FROM building_template_edits WHERE id=?', (identifier,)).fetchone()
            revision = row['revision'] if row else 0
            if revision != body['revision']:
                raise HTTPException(409, '다른 창에서 먼저 저장했습니다. 건물 템플릿을 다시 열어 주세요.')
            db.execute('INSERT OR REPLACE INTO building_template_edits VALUES (?,?,?)',
                       (identifier, revision + 1, json.dumps(scene, ensure_ascii=False, allow_nan=False)))
        return {'id': identifier, 'revision': revision + 1, 'scene': scene}
