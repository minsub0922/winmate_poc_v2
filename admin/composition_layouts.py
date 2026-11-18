"""Sheets authored for composition management, exposed in the sheet inventory too.

Keep their original ids and HTML. These definitions remain owned by the composition
builders; sparse library edits would not update those builders, so they are read-only.
"""
import re
from functools import lru_cache

from app.api import layout_library as live


def supplemental(root):
    files = ('overview-sheets.json', 'ua-catalog.json', 'space-sheets.json', 'spec-sheets.json')
    stamps = tuple((root / 'admin/web/src' / f).stat().st_mtime_ns for f in files)
    return _supplemental(root, stamps)


@lru_cache(maxsize=2)
def _supplemental(root, stamps):
    source = root / 'admin/web/src'
    metas, html = {}, {}

    def add(f, name, code, body, part, when='', fixed=False):
        body = re.sub(r'^.*?<body[^>]*>', '', body, flags=re.S | re.I) if '<body' in body else body
        body = re.sub(r'</body>.*$', '', body, flags=re.S | re.I)
        ss = live.slots(body)
        metas[f] = {'f': f, 'code': code, 'name': name, 'when': when, 'p': part,
                    'nT': sum(s['kind'] == 't' for s in ss), 'nI': sum(s['kind'] == 'img' for s in ss),
                    'fx': 'fixed' if fixed else live.lock_for(ss), 'compositionOnly': True}
        html[f] = body

    overview = live.read(source / 'overview-sheets.json')
    for s in overview['sheets']:
        body = re.sub(r'@img\d+@', lambda m: overview['images'][m[0]], s['html'])
        add(s['layout'], 'Device · Solution · Service 도식 · ' + s['name'], s['code'], body, 'overview', fixed=True)
    ua = live.read(source / 'ua-catalog.json')
    for f, s in ua['layouts'].items():
        # The admin's sectorBook uses the same embedded photo map.
        body = re.sub(r'src="[^"]*" data-fill="([^"]+)"',
                      lambda m: 'src="' + ua['photos'][m[1]] + '"' if m[1] in ua['photos'] else m[0], s['html'])
        body = re.sub(r'src="((?!data:)[^"]+)"', lambda m: 'src="' + ua['photos'][m[1]] + '"' if m[1] in ua['photos'] else m[0], body)
        add(f, s['name'], s['code'], body, 'market', s.get('when', ''))
    for name, part in [('space-sheets', 'products'), ('spec-sheets', 'spec')]:
        data = live.read(source / (name + '.json'))
        for s in data['sheets']:
            body = re.sub(r'@img\d+@', lambda m: data['images'][m[0]], s['html'])
            add(s['f'], s['name'], s['code'], body, part, s.get('when', ''))
    return metas, html


def inventory(root):
    catalog, layouts, html = live.base(root)
    extra, bodies = supplemental(root)
    # Existing ids keep their meaning and slot geometry (notably the Map sheets).
    missing = {f: m for f, m in extra.items() if f not in layouts}
    return catalog, {**layouts, **missing}, {**html, **{f: bodies[f] for f in missing}}
