"""extract-decisions.json(사람이 쪽 텍스트·이미지로 확인한 판정)을 staging extract 에 적용한다.
사용: python3 apply_extract_decisions.py <decisions.json> <staging extract dir> <app products_db.json>"""
import json, sys, os
dec_f, exdir, pdb_f = sys.argv[1:4]
dec = json.load(open(dec_f))
app = {p['id'] for p in json.load(open(pdb_f))['products']}
log = []
for fn, d in dec.items():
    if not fn.endswith('.json'): continue
    path = os.path.join(exdir, fn)
    items = json.load(open(path))
    byid = {it['id']: it for it in items}
    for i, u in (d.get('update') or {}).items():
        it = byid[i]
        for k in ('name', 'models', 'pages', 'specs', 'features', 'series', 'note'):
            if k in u: it[k] = u[k]
        for a, b in (u.get('models_replace') or {}).items():
            it['models'] = [b if m == a else m for m in it['models']]
        for a, v in (u.get('specs_set') or {}).items():
            it['specs'] = [[x, v if x == a else y] for x, y in it['specs']]
        log.append(('update', i, u.get('why', '')))
    drop = set(d.get('drop') or {}) | set(d.get('deprecated') or {})
    for i, it in byid.items():
        r = (d.get('repoint') or {}).get(i)
        if r:
            old = (it['dir'], it['pages'])
            it['dir'], it['pages'] = r['dir'], r['pages']
            it['note'] = '; '.join(x for x in [it.get('note'), f"사양은 Dir 203(DVM Home 일반용 카탈로그, 2026-11 목록·Dir 삭제) 원문 기준 — 현재 근거 Dir {r['dir']} p.{','.join(map(str, r['pages'][:4]))}"] if x)
            log.append(('repoint', i, f'{old} -> {r}'))
    if fn == 'a_light_dacor_harman.json':  # Dir 203 항목 중 앱 행이 없는 것(사이트 카드 대응 · 다른 권 항목과 묶임)은 근거 권이 없어졌으므로 뺀다
        for i, it in byid.items():
            if str(it['dir']) == '203' and i not in (d.get('repoint') or {}) and ('ec_' + i[2:]) not in app:
                drop.add(i); log.append(('drop-no-app-row', i, it['name']))
    items = [it for it in items if it['id'] not in drop]
    for i in sorted(drop): log.append(('drop', i, (d.get('drop') or d.get('deprecated') or {}).get(i, '')))
    items += d.get('add') or []
    for a in d.get('add') or []: log.append(('add', a['id'], a['name']))
    left = [it['id'] for it in items if str(it['dir']) == '203']
    assert not left, left
    json.dump(items, open(path, 'w'), ensure_ascii=False, indent=1)
for x in log: print(*x)
