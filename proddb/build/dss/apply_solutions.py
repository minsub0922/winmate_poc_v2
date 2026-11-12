"""DSS DB 업데이트 — 솔루션 · 서비스 표식과 분류 URL 정리(staging 출력, 활성 파일은 쓰지 않는다).

입력: <run dir>/sol/pages.json(fetch_solutions.py — 기존에 쓴 솔루션 · 분류 · 근거 URL 전부의 상태 · 최종 URL · 제목 · 본문 해시)
  · 버티컬 솔루션(vertical_space_solution.json solution_catalog): 공식 출처(url · sources 중 삼성 공식 도메인)가 하나라도 200 이면 checkedAt = RUN_AT.
    외부 기사는 기능 설명 참고였을 뿐 표식 근거가 아니다.
  · 앱 솔루션(catalog.json solutions): build/media/data/sol_urls.json 의 <id>|… 공식 URL 이 200 이거나, 같은 솔루션인 버티컬 솔루션(sols.py SOL 대응)이 확인되면 표식.
  · 제품군 분류(vertical_space_product.json product_taxonomy): 404 인 분류 URL 을 이번 사이트 수집이 실제로 쓴 목록 주소(+ 필터)로 바꾸고 verified 를 갱신한다.
사용: python3 proddb/build/dss/apply_solutions.py <run dir> <review dir>"""
import copy, importlib.util, json, os, sys, urllib.parse

RUN_DIR, REVIEW = sys.argv[1], sys.argv[2]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
CFG = json.load(open(os.path.join(REVIEW, 'run.json')))
RUN_AT = CFG['run_at']
J = lambda p: json.load(open(p))
pages = J(os.path.join(RUN_DIR, 'sol/pages.json'))
extra = CFG.get('solution_recheck', {})  # fetch 도구가 못 연 URL(비 ASCII 등)을 인코딩해 다시 연 결과
OFFICIAL = ('samsung.com', 'samsungknox.com', 'samsung.aiibook.net', 'samsungsvc.co.kr')
official = lambda u: any(urllib.parse.urlparse(u).netloc.endswith(d) for d in OFFICIAL)
ok = lambda u: (extra.get(u) or pages.get(u, {}).get('status')) == 200
STAGE = os.path.join(RUN_DIR, 'stage')
os.makedirs(os.path.join(STAGE, 'app/data'), exist_ok=True); os.makedirs(os.path.join(STAGE, 'build/media/data'), exist_ok=True)
report = {'vss': {}, 'app': {}, 'taxonomy': [], 'sol_urls': []}

vss = J(os.path.join(ROOT, 'app/data/vertical_space_solution.json'))
for s in vss['solution_catalog']:
    srcs = [u for u in [s.get('url')] + list(s.get('sources') or []) if u]
    good = [u for u in srcs if official(u) and ok(u)]
    bad = [u for u in srcs if official(u) and not ok(u)]
    report['vss'][s['id']] = {'confirmed': bool(good), 'ok': good, 'notOk': bad}
    if good: s['checkedAt'] = RUN_AT
vss['meta']['checkedAt'] = RUN_AT; vss['meta']['checkedRun'] = CFG['run_id']

spec = importlib.util.spec_from_file_location('sols', os.path.join(ROOT, 'app/scripts/vertical_standard/sols.py'))
sols = importlib.util.module_from_spec(spec); spec.loader.exec_module(sols)
app_of = {}
for sid, row in sols.SOL.items():
    if row[3]: app_of.setdefault(row[3], []).append(sid)
sol_urls = J(os.path.join(ROOT, 'build/media/data/sol_urls.json'))
for x in sol_urls:  # 옮겨진 공식 URL(이번 run 에서 새 주소 확인)
    new = CFG.get('sol_url_moves', {}).get(x['url'])
    if new: report['sol_urls'].append({'key': x['key'], 'from': x['url'], 'to': new}); x['url'] = new
cat = J(os.path.join(ROOT, 'app/data/catalog.json'))
for s in cat['solutions']:
    urls = [x['url'] for x in sol_urls if x['key'].split('|')[0] == s['id']]
    good = [u for u in urls if official(u) and ok(u)]
    via = [sid for sid in app_of.get(s['id'], []) if report['vss'].get(sid, {}).get('confirmed')]
    report['app'][s['id']] = {'confirmed': bool(good or via), 'ok': good, 'viaVertical': via, 'notOk': [u for u in urls if not ok(u)]}
    if good or via: s['checkedAt'] = RUN_AT

vsp = J(os.path.join(ROOT, 'app/data/vertical_space_product.json'))
base = vsp['meta']['base_url']
moves = CFG.get('taxonomy_url_moves', {})
for g in vsp['product_taxonomy']:
    for c in g['categories']:
        u = c.get('url')
        if not u: continue
        full = base + u if u.startswith('/') else u
        if c['id'] in moves:
            old = copy.deepcopy(c); c['url'] = moves[c['id']]; c['verified'] = True
            report['taxonomy'].append({'id': c['id'], 'from': old['url'], 'to': c['url'], 'verifiedBefore': old.get('verified')})
        elif not ok(full) and full in pages:
            report['taxonomy'].append({'id': c['id'], 'url': u, 'status': pages[full]['status'], 'action': 'unresolved'})

json.dump(vss, open(os.path.join(STAGE, 'app/data/vertical_space_solution.json'), 'w'), ensure_ascii=False, indent=1)
json.dump(cat['solutions'], open(os.path.join(STAGE, 'app/data/catalog.solutions.json'), 'w'), ensure_ascii=False, indent=1)
json.dump(sol_urls, open(os.path.join(STAGE, 'build/media/data/sol_urls.json'), 'w'), ensure_ascii=False, indent=1)
# vertical_space_product.json 은 손으로 맞춘 줄 형식이라 다시 쓰지 않는다 — 분류 줄만 promote 단계에서 고친다(report['taxonomy'])
json.dump(report, open(os.path.join(STAGE, 'review/solutions.json'), 'w'), ensure_ascii=False, indent=1)
print('vss confirmed', sum(v['confirmed'] for v in report['vss'].values()), '/', len(report['vss']),
      '| app confirmed', sum(v['confirmed'] for v in report['app'].values()), '/', len(report['app']),
      '| taxonomy', len(report['taxonomy']), '| sol_urls moved', len(report['sol_urls']))
for k, v in list(report['vss'].items()) + list(report['app'].items()):
    if not v['confirmed']: print('unconfirmed', k, v)
