"""DSS DB 업데이트 — 원장(proddb/dss/ledger.json)과 소스 인벤토리(source-inventory.json)를 staging 에 만든다.

원장이 표식의 정본이다: DSS(제품 · 솔루션 · 서비스)마다 checked_at(이번 run 의 complete 소스에서 확인된 시각) · status · evidence.
앱 레코드의 checkedAt(products_db 행 · curated, catalog.json solutions, vertical_space_solution solution_catalog)은 이 원장과 같아야 한다.
사용: python3 proddb/build/dss/ledger.py <run dir> <review dir>   (apply_run.py · apply_solutions.py 다음)"""
import glob, hashlib, json, os, re, sys, importlib.util

RUN_DIR, REVIEW = sys.argv[1], sys.argv[2]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
CFG = json.load(open(os.path.join(REVIEW, 'run.json')))
RUN_ID, RUN_AT = CFG['run_id'], CFG['run_at']
J = lambda p: json.load(open(p))
STAGE = os.path.join(RUN_DIR, 'stage')
pdb = J(os.path.join(STAGE, 'app/data/products_db.json'))
catalog = J(os.path.join(ROOT, 'app/data/catalog.json'))
sol_stage = {s['id']: s for s in J(os.path.join(STAGE, 'app/data/catalog.solutions.json'))}
vss = J(os.path.join(STAGE, 'app/data/vertical_space_solution.json'))
apply = J(os.path.join(STAGE, 'review/apply-changes.json'))
row_ev = J(os.path.join(STAGE, 'review/row-evidence.json'))['evidence']
solrep = J(os.path.join(STAGE, 'review/solutions.json'))
prev_path = os.path.join(ROOT, 'proddb/dss/ledger.json')
prev = J(prev_path) if os.path.exists(prev_path) else {'version': 1, 'runs': [], 'items': {}}

changed, moved = {}, {}
EVIDENCE_ONLY = {'cdir', 'cpage', 'ec', 'ecat', 'ecatN', 'cprod'}  # e-카탈로그 근거(권 · 쪽) 이동 — 제품 사실이 바뀐 것은 아니다
for c in apply['changes']:
    if c['kind'] not in ('row-changed', 'detail-changed', 'specs-changed', 'curated-changed'): continue
    fields = set(c.get('fields') or ['specs'])
    if fields <= EVIDENCE_ONLY: moved.setdefault(c['id'], set()).update(fields)
    else: changed.setdefault(c['id'], []).append(c['kind'] + ':' + ','.join(sorted(fields - EVIDENCE_ONLY)))
newids = {c['id'] for c in apply['changes'] if c['kind'] == 'new'}
SERVICE = re.compile(r'서비스|케어|세척|보증|케어플랜|유지보수')
def kind_of(p):
    t = ' '.join(str(p.get(k) or '') for k in ('sc', 'cat'))
    return 'service' if SERVICE.search(t) else 'solution' if '솔루션' in t else 'device'
FACT = ('name', 'model', 'models', 'opt', 'cat', 'sc', 'fam', 'url', 'spec', 'gid', 'cdir', 'cpage')
fact_hash = lambda p: 'sha256:' + hashlib.sha256(json.dumps({k: p.get(k) for k in FACT}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
items = {}
def put(key, rec):
    old = prev['items'].get(key, {})
    rec.setdefault('first_seen', old.get('first_seen') or RUN_AT)
    # 지난 run 과 사실 해시가 같으면 바뀐 것이 아니다(같은 run 을 다시 돌린 경우는 비교하지 않는다)
    if old.get('checked_run') != RUN_ID and old.get('hash') and rec.get('hash') and old['hash'] == rec['hash'] and rec['status'] == 'changed': rec['status'] = 'active'
    items[key] = rec

rows = [dict(c, **pdb['curated'].get(c['id'], {}), _cur=True) for c in catalog['products']] + pdb['products']
for p in rows:
    pid = p['id']; stamped = p.get('checkedAt') == RUN_AT
    ev = [dict(e, run=RUN_ID) for e in row_ev.get(pid, [])]
    if p.get('deprecated'): status = 'deprecated'
    elif pid in newids: status = 'new'
    elif not stamped: status = 'unresolved'
    elif pid in changed: status = 'changed'
    else: status = 'active'
    put('product:' + pid, {
        'kind': kind_of(p), 'registry': 'catalog.products' if p.get('_cur') else 'products_db.products', 'id': pid, 'name': re.sub(r'<br\s*/?>', ' ', p.get('name') or ''),
        'keys': {'gid': p.get('gid') or None, 'models': (p.get('models') or ([p['model']] if p.get('model') else []))[:24],
                 'ecat': [{'dir': str(p['cdir']), 'page': p.get('cpage')}] if p.get('cdir') else [], 'urls': [p['url']] if p.get('url') else []},
        'family': {'fam': p.get('fam'), 'sc': p.get('sc'), 'cat': p.get('cat')},
        'checked_at': RUN_AT if stamped else (prev['items'].get('product:' + pid, {}).get('checked_at')), 'checked_run': RUN_ID if stamped else prev['items'].get('product:' + pid, {}).get('checked_run'),
        'changed_at': RUN_AT if (pid in changed or pid in newids) else prev['items'].get('product:' + pid, {}).get('changed_at'),
        'hash': fact_hash(p), 'status': status, 'evidence': ev,
        'aliases': [k for k, v in CFG['alias'].items() if v == pid], 'replaced_by': (p.get('deprecated') or {}).get('replacedBy') or p.get('supersededBy'),
        'deleted_at': None, 'note': '; '.join(x for x in [(p.get('deprecated') or {}).get('reason'), 'samsung.com/sec/business 목록에서 빠짐 — e-카탈로그 근거' if p.get('siteListed') is False else '',
                                                    '같은 제품의 사이트 행으로 대체(선택 목록에서 숨김)' if p.get('supersededBy') else '', ', '.join(changed.get(pid, [])),
                                                    'e-카탈로그 근거 이동(' + ','.join(sorted(moved[pid])) + ')' if pid in moved else ''] if x)})

spec = importlib.util.spec_from_file_location('sols', os.path.join(ROOT, 'app/scripts/vertical_standard/sols.py'))
sols = importlib.util.module_from_spec(spec); spec.loader.exec_module(sols)
for s in catalog['solutions']:
    r = solrep['app'][s['id']]; stamped = sol_stage[s['id']].get('checkedAt') == RUN_AT
    put('solution:' + s['id'], {'kind': 'service' if s.get('cat') == '서비스' else 'solution', 'registry': 'catalog.solutions', 'id': s['id'], 'name': s['name'],
        'keys': {'urls': r['ok'] + r['notOk']}, 'family': {'cat': s.get('cat')}, 'checked_at': RUN_AT if stamped else None, 'checked_run': RUN_ID if stamped else None,
        'changed_at': None, 'hash': None, 'status': 'active' if stamped else 'unresolved',
        'evidence': [{'source': 'official-page', 'url': u, 'run': RUN_ID} for u in r['ok']] + [{'source': 'vertical-solution', 'id': v, 'run': RUN_ID} for v in r['viaVertical']],
        'aliases': [sid for sid, row in sols.SOL.items() if row[3] == s['id']], 'replaced_by': None, 'deleted_at': None,
        'note': '' if stamped else '기록된 공식 근거 URL 이 없음 — 다음 run 전에 근거 페이지를 정해야 함'})
for s in vss['solution_catalog']:
    r = solrep['vss'][s['id']]; stamped = s.get('checkedAt') == RUN_AT
    put('vss:' + s['id'], {'kind': 'service' if s.get('type') == 'service' else 'solution', 'registry': 'vertical_space_solution.solution_catalog', 'id': s['id'], 'name': s['name'],
        'keys': {'urls': [u for u in [s.get('url')] + list(s.get('sources') or []) if u]}, 'family': {'type': s.get('type'), 'parent': s.get('parent')},
        'checked_at': RUN_AT if stamped else None, 'checked_run': RUN_ID if stamped else None, 'changed_at': None, 'hash': None,
        'status': 'active' if stamped else 'unresolved', 'evidence': [{'source': 'official-page', 'url': u, 'run': RUN_ID} for u in r['ok']],
        'aliases': [sols.SOL[s['id']][3]] if s['id'] in sols.SOL and sols.SOL[s['id']][3] else [], 'replaced_by': None, 'deleted_at': None,
        'note': ('공식 출처 중 열리지 않은 URL: ' + ', '.join(r['notOk'])) if r['notOk'] else ''})
for k, v in prev['items'].items():  # 지난 원장에만 있는 항목은 지우지 않는다
    if k not in items: items[k] = v

from collections import Counter
inv = J(os.path.join(REVIEW, 'source-inventory.json'))
cnt = Counter(x['status'] for x in inv['sources'])
st = Counter(v['status'] for v in items.values())
run = {'run_id': RUN_ID, 'run_at': RUN_AT, 'finished_at': CFG.get('finished_at'),
       'sources': {'complete': cnt['complete'] + cnt['same'] + cnt['changed'] + cnt['new'] + cnt['moved'], 'partial': cnt['partial'], 'failed': cnt['failed'], 'gone': cnt['gone']},
       'counts': {'checked': sum(1 for v in items.values() if v.get('checked_run') == RUN_ID), 'new': st['new'], 'changed': st['changed'], 'unresolved': st['unresolved'],
                  'deprecated': st['deprecated'], 'deleted': st['deleted'], 'by_kind': dict(Counter((v['kind'], v['status']) for v in items.values()).most_common()) and
                  {f'{a}:{b}': n for (a, b), n in Counter((v['kind'], v['status']) for v in items.values()).items()}}}
runs = [r for r in prev['runs'] if r['run_id'] != RUN_ID] + [run]
out = {'version': 1, 'about': '표식의 정본 — DSS(제품 · 솔루션 · 서비스)별 마지막 확인 시점. .agents/skills/winmate-update-dss-db 가 run 마다 갱신한다.', 'runs': runs, 'items': dict(sorted(items.items()))}
os.makedirs(os.path.join(STAGE, 'proddb/dss'), exist_ok=True)
json.dump(out, open(os.path.join(STAGE, 'proddb/dss/ledger.json'), 'w'), ensure_ascii=False, indent=0, separators=(',', ':'))
print(json.dumps(run, ensure_ascii=False))
