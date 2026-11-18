"""DSS DB 를 고친 뒤(업데이트 · 삭제) 제품 · 솔루션 DB 에서 나오는 것을 다시 만들어, 연관 자료가 항상 지금 DB 와 같게 한다.
  python3 proddb/build/dss/cascade.py [--root R] [--only projection,spatial,scenarios,kb] [--changed id,id] [--no-render] [--prune-thumbnails]

  projection  원본 SQLite 의 원장(dss_*) · 이미지 라이브러리(lib_image*) 표, 지운 제품의 검토 사양 행 → app/scripts/prepare_data.py --force
              → 홈의 하루 단위 자산 건수 보관분을 비움(다음 요청에서 지금 DB 로 다시 집계)
  spatial     build_spatial_products.py(조감도 오브젝트) → build_spatial_library.mjs(라이브러리 · 템플릿 · 장면, 지난 버전은 versions/ 에 남아 저장된 장면이 열린다)
              → 없는 썸네일이 있으면 build_spatial_object_previews.mjs(Chrome 필요 · --no-render 로 건너뜀).
              지워진 제품만 쓰던 썸네일은 남긴다 — 저장된 장면이 여는 지난 라이브러리 버전이 그 주소를 쓴다(--prune-thumbnails 로 지울 수 있다)
  scenarios   rebuild_vertical_best.py 로 샘플 버티컬 시나리오를 다시 만들어 달라졌을 때만 바꿔 쓴다(제품 사진 · 연결 제품이 DB 를 따른다)
  kb          export_agent_data.mjs(에이전트 KB)
생성기를 그대로 부른다 — 생성 파일을 손으로 고치지 않는다. 진행은 '@@progress <pct> <글>', 결과는 마지막 '@@result <json>'.
--changed 는 이번에 바뀐 · 지운 제품 id — 결과의 references 에 그 id 를 아직 쓰는 샘플 시나리오 · 레이아웃 파일을 적는다(글을 다시 볼 곳).
끝난 코드 0 = 모두 다시 만듦, 1 = 실패한 단계가 있음.
"""
import argparse, filecmp, json, os, shutil, sqlite3, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL_ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
STEPS = ('projection', 'spatial', 'scenarios', 'kb')
THUMBS = 'app/web/public/assets/spatial-objects'


def progress(pct, text):
    print(f'@@progress {int(pct)} {text}', flush=True)


def python_of(root):
    for c in (os.path.join(root, 'app/.venv/bin/python'), os.path.join(TOOL_ROOT, 'app/.venv/bin/python')):
        if os.path.exists(c):
            return c
    return sys.executable


def run(root, cmd, timeout=1800):
    r = subprocess.run(cmd, cwd=root, capture_output=True, text=True, timeout=timeout, env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'})
    if r.returncode:
        raise RuntimeError(' '.join(os.path.basename(str(c)) for c in cmd[:3]) + f' 실패(exit {r.returncode}): ' + (r.stderr or r.stdout)[-800:])
    return (r.stdout or '').strip().splitlines()[-1:] or ['']


def thumb(asset):
    """오브젝트 썸네일 주소 — app/web/src/domain/spatial/catalog.js spatialObjectThumbnail 과 같은 규칙"""
    return asset.get('thumbnail') or '/assets/spatial-objects/' + ('recipe-' + str(asset.get('recipe') or asset.get('kind')) if asset.get('productId') else str(asset.get('id', '')).replace(':', '-')) + '.webp'


def projection(root, py):
    out = {}
    src = os.path.join(root, 'proddb/winmate_products.sqlite')
    pdb = json.load(open(os.path.join(root, 'app/data/products_db.json'), encoding='utf-8'))
    removed = [t['id'] for t in pdb.get('removed', [])]
    if os.path.isfile(src) and os.path.realpath(src).startswith(os.path.realpath(root) + os.sep):
        build = os.path.join(root, 'proddb/build') if os.path.isfile(os.path.join(root, 'proddb/build/dss_db.py')) else os.path.join(TOOL_ROOT, 'proddb/build')
        sys.path.insert(0, build)
        from dss_db import write_dss
        from imglib_db import write_imglib
        db = sqlite3.connect(src)
        try:
            out['dss_item'] = write_dss(db, os.path.join(root, 'proddb/dss/ledger.json'))
            idx = os.path.join(root, 'proddb/imglib/index.json')
            if os.path.isfile(idx):
                write_imglib(db, idx)
                out['lib_image'] = db.execute('SELECT COUNT(*) FROM lib_image').fetchone()[0]
            if removed and db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='product_spec_review'").fetchone():
                cur = db.executemany('DELETE FROM product_spec_review WHERE id=?', [(i,) for i in removed])
                out['spec_review_removed'] = cur.rowcount
            db.commit()
        finally:
            db.close()
    out['runtime'] = run(root, [py, '-B', os.path.join(root, 'app/scripts/prepare_data.py'), '--force'])[0]
    # 홈의 자산 건수는 하루에 한 번 집계해 runtime 에 보관한다(app/api/catalog_metrics.py). DB 가 바뀌었으니 오늘 보관분을 비워
    # 다음 요청에서 지금 DB 로 다시 집계하게 한다 — 그러지 않으면 자정까지 지운 제품이 건수에 남는다.
    metrics = os.path.join(root, 'app/data/runtime/catalog_metrics.sqlite')
    if os.path.isfile(metrics):
        db = sqlite3.connect(metrics, timeout=30)
        try:
            if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='daily_metrics'").fetchone():
                out['daily_metrics_cleared'] = db.execute('DELETE FROM daily_metrics').rowcount
                db.commit()
        finally:
            db.close()
    return out


def spatial(root, py, render=True, prune=False):
    lib = os.path.join(root, 'app/data/spatial/library.json')
    before = json.load(open(lib, encoding='utf-8')) if os.path.isfile(lib) else {'assets': []}
    out = {'objects': run(root, [py, '-B', os.path.join(root, 'app/scripts/build_spatial_products.py')])[0][:200]}
    out['library'] = run(root, ['node', os.path.join(root, 'app/scripts/build_spatial_library.mjs')], timeout=3600)[0][-160:]
    after = json.load(open(lib, encoding='utf-8'))
    used = {thumb(a) for a in after.get('assets', [])}
    kept = {a.get('productId') for a in after.get('assets', []) if a.get('productId')}
    # 지워진 제품의 오브젝트만 쓰던 썸네일 — 남은 오브젝트가 하나라도 쓰면 지우지 않는다
    old_product = {thumb(a) for a in before.get('assets', []) if a.get('productId') and a['productId'] not in kept}
    out['sourceHash'] = after.get('sourceHash')
    out['products'] = sum(1 for a in after.get('assets', []) if a.get('productId'))
    folder = os.path.join(root, THUMBS)
    orphan, gone = [], []
    if os.path.isdir(folder) and os.path.realpath(folder).startswith(os.path.realpath(root) + os.sep):
        for t in sorted(old_product - used):  # 이제 지금 라이브러리의 어떤 오브젝트도 쓰지 않는 제품 썸네일
            f = os.path.join(root, 'app/web/public', t.lstrip('/'))
            if t.startswith('/assets/spatial-objects/') and os.path.isfile(f):
                orphan.append(os.path.basename(f))
                if prune:
                    os.remove(f)
                    gone.append(os.path.basename(f))
    out['thumbnails_orphaned'] = len(orphan)  # 지난 라이브러리 버전(versions/)만 쓰는 썸네일 — 저장된 장면용으로 남긴다
    out['thumbnails_removed'] = gone
    missing = sorted(t for t in {thumb(a) for a in after.get('assets', []) if a.get('productId') and a.get('physical')}
                     if t.startswith('/assets/spatial-objects/') and not os.path.isfile(os.path.join(root, 'app/web/public', t.lstrip('/'))))
    out['thumbnails_missing'] = len(missing)
    if missing and render:
        try:
            run(root, ['node', os.path.join(root, 'app/scripts/build_spatial_object_previews.mjs')], timeout=3600)
            out['thumbnails_missing'] = 0
        except Exception as e:  # noqa: BLE001 — 썸네일은 브라우저가 있어야 그린다. 못 그리면 경고로 남긴다
            out['warning'] = f'없는 오브젝트 썸네일 {len(missing)}개를 그리지 못함: {str(e)[:200]}'
    return out


def scenarios(root, py):
    gen = os.path.join(root, 'app/scripts/rebuild_vertical_best.py')
    live = os.path.join(root, 'app/web/src/domain/templates/vertical_scenarios.json')
    if not os.path.isfile(gen):
        return {'skipped': 'rebuild_vertical_best.py 없음'}
    tmp = tempfile.mkdtemp(prefix='dss-cascade-')
    try:
        out = os.path.join(tmp, 'vertical_scenarios.json')
        last = run(root, [py, '-B', gen, '--out', out])[0]
        same = os.path.isfile(live) and filecmp.cmp(out, live, shallow=False)
        if not same:
            shutil.copyfile(out, live)
        return {'vertical_scenarios': 'same' if same else 'rewritten', 'generator': last[-120:]}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def kb(root, py):
    return {'kb': run(root, ['node', os.path.join(root, 'app/scripts/export_agent_data.mjs')], timeout=1800)[0][-200:]}


def references(root, ids):
    """바뀐 · 지운 제품을 아직 쓰는 샘플 시나리오 · 레이아웃 · 생성기 입력(글을 다시 볼 곳)"""
    sys.path.insert(0, HERE)
    from dssrefs import Repo, product_codes
    repo = Repo(root)
    out = []
    for pid in ids:
        p = repo.products.get(pid) or repo.removed.get(pid)
        if not p:
            continue
        codes = product_codes(p)
        for rel in repo.mention_files():
            n = repo.row_hits(rel).get(pid, 0) + (repo.text(rel).count('"' + pid + '"') if not pid.startswith(('sg_', 'ec_')) else 0)
            hit = sorted(codes & repo.tokens(rel))
            if n or hit:
                out.append({'id': pid, 'file': rel, 'id_refs': n, 'codes': hit[:8]})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--root', default=TOOL_ROOT)
    ap.add_argument('--only', default=','.join(STEPS))
    ap.add_argument('--changed', default='')
    ap.add_argument('--no-render', action='store_true')
    ap.add_argument('--prune-thumbnails', action='store_true')
    a = ap.parse_args()
    root = os.path.realpath(a.root)
    only = [s for s in a.only.split(',') if s]
    bad = [s for s in only if s not in STEPS]
    if bad:
        sys.exit('모르는 단계: ' + ', '.join(bad))
    py = python_of(root)
    label = {'projection': 'runtime projection', 'spatial': '조감도 오브젝트 · 템플릿', 'scenarios': '샘플 버티컬 시나리오', 'kb': '에이전트 KB'}
    fn = {'projection': lambda: projection(root, py), 'spatial': lambda: spatial(root, py, not a.no_render, a.prune_thumbnails), 'scenarios': lambda: scenarios(root, py), 'kb': lambda: kb(root, py)}
    steps, failed = [], False
    todo = [s for s in STEPS if s in only]
    for i, s in enumerate(todo):
        progress(100 * i / len(todo), label[s] + ' 다시 만드는 중')
        t0 = time.monotonic()
        try:
            steps.append({'step': s, 'ok': True, 'seconds': 0, **fn[s]()})
        except Exception as e:  # noqa: BLE001
            steps.append({'step': s, 'ok': False, 'error': f'{type(e).__name__}: {e}'[:1200]})
            failed = True
        steps[-1]['seconds'] = round(time.monotonic() - t0)
        if failed:
            break
    ids = [x for x in a.changed.split(',') if x]
    result = {'ok': not failed, 'root': root, 'steps': steps, 'references': references(root, ids) if ids and not failed else []}
    progress(100, '다시 만들기 ' + ('완료' if not failed else '실패'))
    print('@@result ' + json.dumps(result, ensure_ascii=False), flush=True)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
