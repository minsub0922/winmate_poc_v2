"""판매 종료 DSS 삭제(proddb/build/dss/deletions.py) · 연관 자료 점검(refcheck.py) — 작은 사본 root 에서만 돈다(네트워크 · 브라우저 없음).

실제 저장소의 삭제 후보는 건드리지 않는다. 생성기가 없는 사본이라 다시 만들기(cascade.py)는 --skip-cascade 로 건너뛴다.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / 'proddb/build/dss'
D1, D2, R, A = 'sg_g000000001', 'sg_g000000003', 'sg_g000000002', 'ec_1_001'  # 지울 제품 · 장표 글에 남은 제품 · 대체 제품 · 그냥 파는 제품
DEP = lambda to: {'at': '2026-11-12T14:45:05+09:00', 'run': 'dss-x', 'replacedBy': to, 'reason': '목록에서 빠짐'}


def write(path, data, **kw):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, **kw), encoding='utf-8')


@pytest.fixture
def repo(tmp_path):
    rows = [
        {'id': D1, 'name': '모니터 옛 모델 (LS24OLD1)', 'model': 'LS24OLD1UAKXKR', 'models': ['LS24OLD1UAKXKR'], 'kw': ['LS24OLD1'], 'cat': '모니터', 'src': 'site', 'd': 0,
         'th': 'img/prod/t00.json#1', 'gal': ['img/prod/g00.json#1', 'img/prod/g00.json#2'], 'deprecated': DEP(R)},
        {'id': R, 'name': '모니터 새 모델 (LS24NEW2)', 'model': 'LS24NEW2UAKXKR', 'models': ['LS24NEW2UAKXKR'], 'kw': ['LS24NEW2'], 'cat': '모니터', 'src': 'site', 'd': 0,
         'th': 'img/prod/t00.json#7', 'gal': ['img/prod/g00.json#17']},
        {'id': D2, 'name': '청소기 옛 모델', 'model': 'VS15OLD3N5', 'models': ['VS15OLD3N5'], 'kw': [], 'cat': '청소기', 'src': 'site', 'd': 0, 'deprecated': DEP(R)},
        {'id': A, 'name': '카탈로그 제품', 'model': 'AM023KEEP1', 'models': ['AM023KEEP1'], 'kw': [], 'cat': '에어컨', 'src': 'catalog', 'd': 0},
    ]
    write(tmp_path / 'app/data/products_db.json', {'generated': 'x', 'counts': {'site_rows': 3, 'catalog_rows': 1, 'deprecated': 2, 'superseded': 0, 'total': 5}, 'curated': {'cur1': {'d': 0}},
                                                 'products': rows, 'specReview': {'date': '2026-11-12', 'total': 5, 'ledger': 'proddb/reviews/dss-x/product-review.json'}}, separators=(',', ':'))
    write(tmp_path / 'app/data/catalog.json', {'products': [{'id': 'cur1', 'name': '큐레이션 제품', 'model': 'CUR1X', 'd': 0}],
                                              'solutions': [{'id': 'solA', 'name': '솔루션 A', 'with': ['cur1', D1]}],
                                              'layouts': [{'f': 'L1', 'prods': ['cur1'], 'sols': ['solA'], 'txt': '레이아웃 글'}], 'cases': [{'id': 1, 'txt': '도입사례 원문 VS15OLD3N5'}]}, separators=(',', ':'))
    write(tmp_path / 'app/data/product-details/d00.json', {'items': {i: {'specs': []} for i in (D1, R, D2, A, 'cur1')}}, separators=(',', ':'))
    write(tmp_path / 'app/data/vertical_space_solution.json', {'solution_catalog': [{'id': 's_x', 'name': 'X'}], 'verticals': [{'spaces': [{'solutions': [{'solution': 's_x'}]}]}]})
    write(tmp_path / 'app/data/subscriptions.json', {'categories': [{'id': 'c', 'products': [D1, R, A], 'rep': {'product': R}}], 'items': []}, indent=1)
    write(tmp_path / 'app/web/src/domain/templates/sample_scenarios.json', {
        'scenarios': [{'id': 's1', 'products': [D1, R, 'cur1'], 'solutions': ['solA']}, {'id': 's2', 'products': [D1, A], 'solutions': []}],
        'fills': {'s1': [{'f': 'L1', 't': {'1': '새 모니터를 놓습니다'}, 'img': {'0': {'src': 'img/prod/g00.json#2'}, '1': {'src': 'img/prod/g00.json#17'}}}],
                  's2': [{'f': 'L1', 't': {'1': '청소기 VS15OLD3N5 를 씁니다'}}]}}, separators=(',', ':'))
    write(tmp_path / 'app/web/src/domain/spatial/space-equipment.js', f"export const WORK_MONITOR='{D1}'; // 옛 모니터\nexport const OTHER='{A}';\n")
    write(tmp_path / 'app/data/spatial/product-evidence.json', {D1: {'recipe': 'monitor'}, 'window': {'recipe': 'window'}}, indent=1)
    write(tmp_path / 'img/lib/index.json', {'generated': 'x', 'n': 3, 'images': [{'i': 'a', 'p': [D1]}, {'i': 'b', 'p': [D1, R]}, {'i': 'c', 'p': [A]}]}, separators=(',', ':'))
    write(tmp_path / 'proddb/imglib/index.json', {'generated': 'x', 'about': '', 'images': [{'id': 'a', 'products': [D1]}, {'id': 'b', 'products': [D1, R]}, {'id': 'c', 'products': [A]}]}, indent=0, separators=(',', ':'))
    write(tmp_path / 'proddb/ecat/photos.json', {'generated': 'x', 'items': {D1: {'pics': []}, A: {'pics': []}}})
    item = lambda kind, reg, ident, name, status='active', **kw: {'kind': kind, 'registry': reg, 'id': ident, 'name': name, 'keys': {}, 'status': status, 'replaced_by': None, 'deleted_at': None, 'note': '', **kw}
    write(tmp_path / 'proddb/dss/ledger.json', {'version': 1, 'runs': [{'run_id': 'dss-x', 'run_at': '2026-11-12T14:45:05+09:00'}], 'items': {
        'product:' + D1: item('device', 'products_db.products', D1, '모니터 옛 모델', 'deprecated', replaced_by=R),
        'product:' + D2: item('device', 'products_db.products', D2, '청소기 옛 모델', 'deprecated', replaced_by=R),
        'product:' + R: item('device', 'products_db.products', R, '모니터 새 모델'), 'product:' + A: item('device', 'products_db.products', A, '카탈로그 제품'),
        'product:cur1': item('device', 'catalog.products', 'cur1', '큐레이션 제품'), 'solution:solA': item('solution', 'catalog.solutions', 'solA', '솔루션 A'),
        'vss:s_x': item('solution', 'vertical_space_solution.solution_catalog', 's_x', 'X')}}, indent=0, separators=(',', ':'))
    write(tmp_path / 'proddb/reviews/dss-x/product-review.json', [{'id': i, 'after': 0} for i in (D1, R, D2, A, 'cur1')], separators=(',', ':'))
    return tmp_path


def tool(name, *args):
    r = subprocess.run([sys.executable, '-B', str(TOOLS / name), *map(str, args)], capture_output=True, text=True)
    return r.returncode, r.stdout, r.stderr


def tree(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file() and 'output/' not in str(p.relative_to(root))}


def load(root, rel):
    return json.loads((root / rel).read_text(encoding='utf-8'))


def test_list_shows_references_and_what_blocks(repo):
    code, out, err = tool('deletions.py', 'list', '--root', repo)
    assert code == 0, err
    cands = {c['id']: c for c in json.loads(out)['candidates']}
    assert set(cands) == {D1, D2}
    c = cands[D1]
    assert c['key'] == 'product:' + D1 and c['replacement'] == {'id': R, 'name': '모니터 새 모델 (LS24NEW2)'} and c['blocked'] == []
    actions = {(r['file'], r['action']) for r in c['refs']}
    assert ('app/web/src/domain/templates/sample_scenarios.json', 'replace') in actions  # id + 제품 사진
    assert ('app/web/src/domain/spatial/space-equipment.js', 'replace') in actions
    assert ('app/data/subscriptions.json', 'drop') in actions and ('img/lib/index.json', 'drop') in actions and ('app/data/products_db.json', 'drop') in actions
    assert ('app/data/catalog.json', 'replace') in actions  # 솔루션 연동 제품(with)
    # 장표 글에 그 제품만의 모델코드가 남아 있으면 자동으로 지우지 않는다(도입사례 원문은 장표 글이 아니다)
    blocked = cands[D2]
    assert blocked['blocked'] and any(r['action'] == 'manual' and r['file'].endswith('sample_scenarios.json') for r in blocked['refs'])
    assert not any(r['file'] == 'app/data/catalog.json' and r['action'] == 'manual' for r in blocked['refs'])


def test_dry_run_and_blocked_change_nothing(repo):
    before = tree(repo)
    code, out, _ = tool('deletions.py', 'apply', '--root', repo, '--ids', 'product:' + D1, '--by', 'tester', '--dry-run', '--report', repo / 'output/dry.json')
    assert code == 0 and load(repo, 'output/dry.json')['status'] == 'dry-run' and tree(repo) == before
    code, out, _ = tool('deletions.py', 'apply', '--root', repo, '--ids', f'product:{D1},product:{D2}', '--by', 'tester', '--skip-cascade', '--report', repo / 'output/blocked.json')
    report = load(repo, 'output/blocked.json')
    assert code == 3 and report['status'] == 'blocked' and [b['key'] for b in report['blocked']] == ['product:' + D2] and tree(repo) == before
    code, _, _ = tool('deletions.py', 'apply', '--root', repo, '--ids', 'product:' + R, '--by', 'tester', '--skip-cascade')  # 판매 중인 제품은 후보가 아니다
    assert code == 3 and tree(repo) == before


def test_apply_removes_rewrites_and_leaves_tombstone(repo):
    code, out, err = tool('deletions.py', 'apply', '--root', repo, '--ids', 'product:' + D1, '--by', 'tester', '--skip-cascade', '--report', repo / 'output/apply.json')
    assert code == 0, out + err
    report = load(repo, 'output/apply.json')
    assert report['status'] == 'deleted' and report['verification'] == {'ok': True, 'findings': []}
    pdb = load(repo, 'app/data/products_db.json')
    assert [r['id'] for r in pdb['products']] == [R, D2, A]
    assert pdb['counts'] == {'site_rows': 2, 'catalog_rows': 1, 'deprecated': 1, 'superseded': 0, 'total': 4, 'removed': 1}
    tomb = pdb['removed'][0]
    assert (tomb['id'], tomb['replacedBy'], tomb['by'], tomb['model']) == (D1, R, 'tester', 'LS24OLD1UAKXKR') and tomb['photos'][0] == 'img/prod/t00.json#1'
    assert pdb['specReview']['total'] == 4 and D1 not in [x['id'] for x in load(repo, pdb['specReview']['ledger'])]
    assert (repo / 'app/data/products_db.json').read_text().startswith('{"generated":"x","counts":')  # 형식(한 줄 JSON)을 지킨다
    assert D1 not in load(repo, 'app/data/product-details/d00.json')['items']
    # 샘플 시나리오: 대체 제품으로 바꾸되 이미 있으면 빼고, 그 제품 사진은 대체 제품 사진으로
    sc = load(repo, 'app/web/src/domain/templates/sample_scenarios.json')
    assert sc['scenarios'][0]['products'] == [R, 'cur1'] and sc['scenarios'][1]['products'] == [R, A]
    assert sc['fills']['s1'][0]['img'] == {'0': {'src': 'img/prod/g00.json#17'}, '1': {'src': 'img/prod/g00.json#17'}}
    assert load(repo, 'app/data/catalog.json')['solutions'][0]['with'] == ['cur1', R]
    assert f"WORK_MONITOR='{R}'" in (repo / 'app/web/src/domain/spatial/space-equipment.js').read_text()
    assert load(repo, 'app/data/subscriptions.json')['categories'][0]['products'] == [R, A]
    assert list(load(repo, 'app/data/spatial/product-evidence.json')) == ['window'] and list(load(repo, 'proddb/ecat/photos.json')['items']) == [A]
    # 이미지 라이브러리: 그 제품만의 사진은 색인에서 빼고(원본 색인에는 기록), 함께 쓰던 사진은 연결만 끊는다
    app_idx, src_idx = load(repo, 'img/lib/index.json'), load(repo, 'proddb/imglib/index.json')
    assert app_idx['n'] == 2 and [(o['i'], o['p']) for o in app_idx['images']] == [('b', [R]), ('c', [A])]
    assert [o['id'] for o in src_idx['images']] == ['b', 'c'] and [o['id'] for o in src_idx['retired']] == ['a']
    # 원장: 흔적은 남고, 삭제 기록은 전체 run 과 구분된다
    ledger = load(repo, 'proddb/dss/ledger.json')
    it = ledger['items']['product:' + D1]
    assert it['status'] == 'deleted' and it['deleted_by'] == 'tester' and it['deleted_at'] and it['replaced_by'] == R
    assert ledger['runs'][-1]['scope'] == ['deletions'] and ledger['runs'][-1]['deleted'] == ['product:' + D1] and ledger['runs'][0]['run_id'] == 'dss-x'
    assert load(repo, report['record'])['by'] == 'tester'
    assert tool('refcheck.py', '--root', repo)[0] == 0
    assert [c['id'] for c in json.loads(tool('deletions.py', 'list', '--root', repo)[1])['candidates']] == [D2]


def test_failed_verification_restores_every_file(repo):
    # 주소 안에 id 가 든 참조는 자동으로 바꾸지 않는다 — 확인했다고 넘기면(--accept-manual) 검증에서 걸리고 전부 되돌린다
    write(repo / 'app/data/extra.json', {'thumb': f'/assets/products/{D1}-0.webp'})
    before = tree(repo)
    code, _, _ = tool('deletions.py', 'apply', '--root', repo, '--ids', 'product:' + D1, '--by', 'tester', '--skip-cascade')
    assert code == 3 and tree(repo) == before
    code, out, _ = tool('deletions.py', 'apply', '--root', repo, '--ids', 'product:' + D1, '--by', 'tester', '--skip-cascade', '--accept-manual', '--report', repo / 'output/fail.json')
    report = load(repo, 'output/fail.json')
    assert code == 1 and report['status'] == 'failed' and report['restored'] and '검증 실패' in report['error']
    assert tree(repo) == before and not list((repo / 'proddb/reviews').glob('deletions-*'))


def test_refcheck_finds_lost_rows_and_dangling_references(repo):
    assert tool('refcheck.py', '--root', repo)[0] == 0
    pdb = load(repo, 'app/data/products_db.json')
    pdb['products'] = [r for r in pdb['products'] if r['id'] != A]  # 도구를 거치지 않고 행이 사라짐
    write(repo / 'app/data/products_db.json', pdb, separators=(',', ':'))
    code, out, _ = tool('refcheck.py', '--root', repo, '--json')
    codes = {f['code'] for f in json.loads(out)['findings']}
    assert code == 1 and {'count', 'unknown-ref', 'ledger', 'detail'} <= codes


def test_projection_follows_declared_total_and_skips_deleted_details(tmp_path):
    spec = importlib.util.spec_from_file_location('prepare_data_deletions', ROOT / 'app/scripts/prepare_data.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    data, source = tmp_path / 'app/data', tmp_path / 'proddb/winmate_products.sqlite'
    (data / 'static/img/prod').mkdir(parents=True); (data / 'product-details').mkdir(); source.parent.mkdir()
    products = [{'id': f'p{i}', 'name': f'Product {i}', 'model': f'M{i}', 'd': 0} for i in range(6)]
    (data / 'catalog.json').write_text(json.dumps({'products': products[:2]}))
    (data / 'layouts.b64').write_text('fixture'); (data / 'static/index.html').write_text('fixture')
    (data / 'static/img/prod/d00.json').write_text(json.dumps({'items': {'p0': {'specs': []}, 'gone': {'specs': []}}}))  # 동결본에는 지운 제품의 상세가 남아 있다
    with sqlite3.connect(source) as db:
        db.executescript('CREATE TABLE product_family(id TEXT,goods_id TEXT);')
    module.ROOT, module.DATA, module.DATABASE = tmp_path, data, data / 'runtime/winmate_products.sqlite'
    pdb = {'curated': {}, 'products': products[2:], 'counts': {'total': 6}, 'removed': [{'id': 'gone', 'name': '지운 제품', 'replacedBy': 'p3'}]}
    (data / 'products_db.json').write_text(json.dumps(pdb))
    with sqlite3.connect(module.prepare(force=True)) as db:
        assert db.execute('SELECT count(*) FROM wm_ui_product').fetchone()[0] == 6
        assert [r[0] for r in db.execute('SELECT id FROM wm_ui_detail')] == ['p0']
        assert json.loads(db.execute("SELECT payload FROM wm_ui_meta WHERE key='curated_rows'").fetchone()[0]) == 2
        assert json.loads(db.execute("SELECT payload FROM wm_ui_meta WHERE key='products'").fetchone()[0])['removed'][0]['id'] == 'gone'
    (data / 'products_db.json').write_text(json.dumps({**pdb, 'products': products[2:5]}))  # 기준값을 바꾸지 않고 행만 사라지면 막는다
    with pytest.raises(ValueError, match='기준값'):
        module.prepare(force=True)


def test_curated_product_and_solution_are_deleted_only_through_known_fields(repo):
    """큐레이션 제품 · 솔루션 id 는 흔한 낱말이라 정해진 필드(prods · products · with · sols · solutions)의 값만 바꾼다. 대체가 없으면 막는다."""
    ledger = load(repo, 'proddb/dss/ledger.json')
    ledger['items']['solution:solA'].update(status='deprecated')
    ledger['items']['product:cur1'].update(status='deprecated', replaced_by=R)
    ledger['items']['solution:solB'] = dict(ledger['items']['solution:solA'], id='solB', name='솔루션 B', status='active')
    write(repo / 'proddb/dss/ledger.json', ledger, indent=0, separators=(',', ':'))
    cat = load(repo, 'app/data/catalog.json')
    cat['products'][0]['deprecated'] = DEP(R)
    cat['solutions'].append({'id': 'solB', 'name': '솔루션 B', 'with': []})
    write(repo / 'app/data/catalog.json', cat, separators=(',', ':'))
    write(repo / 'app/data/media.json', {'sol': {'solA': {'n': 1}, 'solB': {'n': 2}}}, separators=(',', ':'))
    cands = {c['key']: c for c in json.loads(tool('deletions.py', 'list', '--root', repo)[1])['candidates']}
    assert cands['solution:solA']['blocked'] and cands['solution:solA']['replacement'] is None  # 바꿔야 할 참조가 있는데 대체가 없다
    assert cands['product:cur1']['blocked'] == [] and cands['product:cur1']['replacement']['id'] == R
    before = tree(repo)
    assert tool('deletions.py', 'apply', '--root', repo, '--ids', 'solution:solA', '--by', 'tester', '--skip-cascade')[0] == 3 and tree(repo) == before
    ledger['items']['solution:solA']['replaced_by'] = 'solB'
    write(repo / 'proddb/dss/ledger.json', ledger, indent=0, separators=(',', ':'))
    code, out, err = tool('deletions.py', 'apply', '--root', repo, '--ids', 'solution:solA,product:cur1', '--by', 'tester', '--skip-cascade', '--report', repo / 'output/cur.json')
    assert code == 0, out + err
    cat = load(repo, 'app/data/catalog.json')
    assert cat['products'] == [] and [s['id'] for s in cat['solutions']] == ['solB']
    assert cat['layouts'][0]['prods'] == [R] and cat['layouts'][0]['sols'] == ['solB']
    sc = load(repo, 'app/web/src/domain/templates/sample_scenarios.json')['scenarios']
    assert sc[0]['products'] == [D1, R] and sc[0]['solutions'] == ['solB']
    pdb = load(repo, 'app/data/products_db.json')
    assert pdb['curated'] == {} and pdb['counts']['total'] == 4 and pdb['removed'][0]['id'] == 'cur1'
    assert list(load(repo, 'app/data/media.json')['sol']) == ['solB']
    ledger = load(repo, 'proddb/dss/ledger.json')['items']
    assert ledger['solution:solA']['status'] == ledger['product:cur1']['status'] == 'deleted'
    assert tool('refcheck.py', '--root', repo)[0] == 0
