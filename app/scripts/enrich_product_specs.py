"""Review existing product specifications against captured primary sources.

No crawl, product creation/removal, or writes through app/data/static. Run first
without --apply to inspect the per-product ledger, then --apply the reviewed stage.
"""
from __future__ import annotations
import argparse
import copy
import csv
import hashlib
import json
from pathlib import Path
import re
import shutil
import sqlite3

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / 'proddb/reviews/specs-20261020'
DATE = '2026-10-20'
LEGAL = re.compile(r'(상품 기본정보|안전인증|인증정보|EMC|RF모듈|제조|A/S|품질보증|KC 인증)')
LEGAL_ATTRIBUTE = re.compile(r'^(제품명|모델명|제조자.*|제조국.*|제조년.*|동일모델.*|A/S.*|KC 인증.*|품질보증.*|소비자.*전화.*)$')


def load(path):
    return json.loads(path.read_text())


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')))


def clean(rows):
    result = []
    for row in rows:
        if len(row) != 3:
            continue
        g, n, v = [str(x or '').strip() for x in row]
        if not n or not v or LEGAL.search(g) or LEGAL_ATTRIBUTE.search(n) or v in ('해당없음', '해당 없음', '-'):
            continue
        item = [g, n, v]
        if item not in result:
            result.append(item)
    return result


def norm(value):
    return re.sub(r'\s+', '', str(value)).casefold()


def main(apply=False):
    inventory = load(REVIEW / 'source-inventory.json')['products']
    exported = load(REVIEW / 'before/app/data/products_db.json')
    catalog = load(REVIEW / 'before/app/data/catalog.json')
    products = {p['id']: dict(p, **exported['curated'].get(p['id'], {}), cur=True) for p in catalog['products']}
    products.update({p['id']: p for p in exported['products']})
    details, packs = {}, {}
    for file in sorted((REVIEW / 'before/app/data/static/img/prod').glob('d*.json')):
        for pid, detail in load(file)['items'].items():
            details[pid], packs[pid] = detail, int(file.stem[1:])
    original = copy.deepcopy(details)
    source_db = sqlite3.connect(f'file:{REVIEW / "before/proddb/winmate_products.sqlite"}?mode=ro', uri=True)
    source_db.row_factory = sqlite3.Row
    catalog_rows = {r['id']: dict(r) for r in source_db.execute('SELECT * FROM catalog_product')}
    catalog_pages = {(r['dir'], r['page']): r['text'] for r in source_db.execute('SELECT * FROM catalog_page')}
    models = {r['model_code']: r['goods_id'] for r in source_db.execute('SELECT * FROM product_model')}
    live = {p.stem: load(p) for p in (REVIEW / 'live-specs').glob('*.json')}
    live_by_model = {record['model']: record for record in live.values() if record.get('status') == 200 and clean(record.get('rows', []))}
    plan = load(REVIEW / 'mapping-plan.json')
    reviews = {}
    rejected = []

    def source(url, kind, model='', evidence='', **extra):
        return dict(url=url, kind=kind, model=model, checkedAt=DATE, evidence=evidence, **extra)

    def catalog_source(cid):
        p = catalog_rows[cid]
        return source(f'https://samsung.aiibook.net/b2b/access/ecatalogt.php?eclang=ko&Dir={p["dir"]}&start={(load_text(p["pages_json"]) or [1])[0]}', 'catalog',
                      evidence='proddb/winmate_products.sqlite:catalog_page', dir=p['dir'], pages=load_text(p['pages_json']))

    def from_live(data, url=''):
        if data.get('status') != 200:
            return None
        rows = clean(data.get('rows', []))
        if not rows:
            return None
        model = data.get('model', '')
        url = url or data.get('url') or data.get('source') or data.get('endpoint')
        if url and url.startswith('/'):
            url = 'https://www.samsung.com' + url
        return dict(label=model, model=model, scope='model', specs=rows,
                    sources=[source(url, 'official-api', model, sha256=data.get('sha256', ''))])

    def set_specs(pid, variants, note='', scope=None):
        variants = [v for v in variants if v and clean(v['specs'])]
        if not variants:
            return False
        dt = details.setdefault(pid, {})
        first = variants[0]
        dt.update(specs=clean(first['specs']), specProductId=pid,
                  specScope=scope or ('family' if len(variants) > 1 else first['scope']),
                  specModel=first['model'], specSources=first['sources'], specReviewedAt=DATE)
        if len(variants) > 1:
            dt['specVariants'] = variants
        else:
            dt.pop('specVariants', None)
        if note:
            dt['specNote'] = note
        packs.setdefault(pid, 0)
        reviews[pid] = True
        return True

    # Every original ID is visited, including entries already rich in specs.
    for item in inventory:
        pid = item['id']
        if pid not in details:
            details[pid] = {}
        p = products[pid]
        data = live.get(item.get('goods_id'))
        exact_model = plan['curated_models'].get(pid, p.get('model'))
        data = live_by_model.get(exact_model) or data
        if data:
            first = from_live(data, item.get('url', ''))
            if first:
                # Option models remain independently selectable; never combine columns.
                variants = [first]
                if not p.get('cur'):
                    for row in details[pid].get('models', []):
                        if row[0] != first['model'] and row[0] in live_by_model:
                            alternative = from_live(live_by_model[row[0]], item.get('url', ''))
                            if alternative:
                                variants.append(alternative)
                set_specs(pid, variants)
        if item['source'] == 'catalog':
            cid = 'ec' + pid[3:]
            if cid in catalog_rows and details[pid].get('specs'):
                set_specs(pid, [dict(label=p.get('model') or p['name'], model=p.get('model') or '',
                                    scope='family' if p.get('nm', 0) > 1 or not p.get('model') else 'model',
                                    specs=details[pid]['specs'], sources=[catalog_source(cid)])])

    # Official package components are retrieved through goodsSpec, not guessed
    # from package suffixes. The group always identifies the component model.
    for path in sorted((REVIEW / 'package-specs').glob('*.json')):
        package = load(path)
        pid = 'sg_' + package['parent'].lower()
        if pid not in products:
            continue
        rows, sources = [], []
        for component in package['components']:
            if component.get('status') != 200:
                continue
            rows += [[component['model'] + (' · ' + g if g else ''), n, v] for g, n, v in clean(component.get('rows', []))]
            sources.append(source(products[pid].get('url', ''), 'official-package-component', component['model'], str(path.relative_to(ROOT)), sha256=component.get('sha256', '')))
        set_specs(pid, [dict(label=products[pid]['model'], model=products[pid]['model'], scope='package', specs=rows, sources=sources)],
                  '구성품별 공식 사양입니다. 각 항목의 구성품 모델을 확인하세요.', 'package')

    # Strict model matches from public Samsung search. Similarity-only search
    # candidates are deliberately not accepted.
    for path in sorted((REVIEW / 'search-specs').glob('*.json')):
        data = load(path)
        pid = data.get('id', path.stem)
        if pid not in products or not data.get('specs'):
            continue
        valid = []
        for row in data['specs']:
            query = re.sub(r'[^A-Z0-9]', '', products[pid].get('model', '').upper())
            candidate = re.sub(r'[^A-Z0-9]', '', row.get('model', '').upper())
            if not query or not candidate.startswith(query):
                continue
            result = next((x for x in data['results'] if x['model'] == row['model']), {})
            valid.append(from_live(row, result.get('url', '')))
        if valid:
            set_specs(pid, valid)
    for path in sorted((REVIEW / 'selected-specs').glob('*.json')):
        data = load(path)
        if data['id'] in products:
            set_specs(data['id'], [from_live(v) for v in data['variants']],
                      '제품군의 경우 선택한 모델 기준의 사양입니다. 모델·크기·통신 방식에 따라 달라집니다.' if products[data['id']].get('model') not in [v['model'] for v in data['variants']] else '')

    # Extracted additions must have a verbatim supporting quote in the exact
    # input page. Rejections are recorded, never silently accepted.
    for path in sorted((REVIEW / 'catalog-review-batches').glob('b*.review.json')):
        inputs = {p['id']: p for p in load(path.with_name(path.name.replace('.review.json', '.json')))}
        for entry in load(path)['reviews']:
            pid = entry['id']
            if pid not in products:
                raise ValueError('Unknown reviewed product: ' + pid)
            additions, sources = [], []
            for row in entry.get('rows', []):
                page = next((p for p in inputs[pid]['sourcePages'] if str(p['dir']) == str(row['dir']) and p['page'] == row['page']), None)
                if not page or not norm(row.get('quote')) or norm(row['quote']) not in norm(page['text']):
                    rejected.append(dict(id=pid, row=row, reason='quote_not_in_original_page'))
                    continue
                # All numeric quantities must be supported by that quote.
                numbers = re.findall(r'\d+(?:[.,]\d+)?', row['value'])
                if any(n not in row['quote'] and n not in re.sub(r'\s+', '', row['quote']) for n in numbers):
                    rejected.append(dict(id=pid, row=row, reason='quantity_not_in_quote'))
                    continue
                additions.append([row['group'], row['name'], row['value']])
                url = page.get('url') or f'https://samsung.aiibook.net/b2b/access/ecatalogt.php?eclang=ko&Dir={row["dir"]}&start={row["page"]}'
                s = source(url, 'official-page-extract', products[pid].get('model', ''), str(path.relative_to(ROOT)),
                           dir=row['dir'], page=row['page'], quote=row['quote'])
                if s not in sources:
                    sources.append(s)
            dt = details[pid]
            if additions:
                rows = clean(dt.get('specs', []) + additions)
                set_specs(pid, [dict(label=products[pid].get('model') or products[pid]['name'], model=products[pid].get('model', ''),
                                    scope=entry.get('scope', 'model'), specs=rows, sources=dt.get('specSources', []) + sources)])
                regional = {
                    'epaper': ('LH32EMDIBGBXZW', '대만'),
                    'kiosk': ('LH24KMCCBGCXXS', '싱가포르'),
                    'hoteltv': ('HG55BU800NFXZA', '미국'),
                    'hoteltv43': ('HG43BU800NFXZA', '미국'),
                    'led_outdoor': ('LH100XHBTAS/EN', '아일랜드'),
                    'led_indoor': ('LH025IFRCLS/EN', '영국'),
                }
                if pid in regional:
                    model, country = regional[pid]
                    dt['specModel'] = model
                    dt['specScope'] = 'regional-reference'
                    dt['specNote'] = f'{country} 삼성 공식 페이지의 {model} 참고 사양입니다. 국내 납품 모델의 옵션·규격은 별도로 확인하세요.'
            dt['specReviewNote'] = entry.get('reason', '')

    # Additional manually checked primary sources use the same provenance schema.
    manual = REVIEW / 'verified-primary-specs.json'
    if manual.exists():
        for record in load(manual):
            pid = record['id']
            assert pid in products
            set_specs(pid, record['variants'], record.get('note', ''), record.get('scope'))

    # Curated product families inherit only explicitly reviewed corresponding
    # catalog families or named representative models, with their scope visible.
    for pid, cids in plan['catalog'].items():
        if len(details.get(pid, {}).get('specs', [])) >= 4:
            continue
        variants = []
        for cid in cids:
            cp = catalog_rows[cid]
            app_id = 'ec_' + cid[2:]
            rows = details.get(app_id, {}).get('specs') or [['카탈로그', n, v] for n, v in load_text(cp['specs_json'])]
            variants.append(dict(label=cp['name'], model=' / '.join(load_text(cp['models_json'])[:4]) or cp['series'] or cp['name'],
                                 scope='family', specs=rows, sources=[catalog_source(cid)]))
        if variants:
            set_specs(pid, variants, '해당 제품군의 공식 카탈로그 사양입니다. 모델별 값과 범위를 함께 확인하세요.', 'family')
            if pid == 'thewall_aio':
                details[pid]['specNote'] = '카드의 IAA 모델 표기는 공식 자료에서 확인되지 않았습니다. 아래는 The Wall All-in-One IAB 제품군의 참고 사양이며, IAA의 확정 사양이 아닙니다.'
                details[pid]['specModelUnverified'] = True
    for pid, ids in plan['app_products'].items():
        variants = []
        for ref in ids:
            dt = details.get(ref, {})
            if not dt.get('specSources'):
                continue
            variants.extend(dt.get('specVariants') or [dict(label=products[ref]['name'], model=dt.get('specModel', products[ref].get('model', '')),
                             scope=dt.get('specScope', 'family'), specs=dt['specs'], sources=dt['specSources'])])
        if variants:
            set_specs(pid, variants, '연결된 제품군·모델의 사양입니다. 실제 납품 모델과 옵션을 확인하세요.', 'family')

    ledger = []
    for item in inventory:
        pid = item['id']
        dt = details[pid]
        if pid == 'thewall_aio':
            dt['specModelUnverified'] = True
        if pid == 'ec_228_049':
            dt['specModelUnverified'] = True
            # A category label ("power amplifier") is not a technical spec.
            dt['specs'] = []
            dt['specNote'] = '원본 카탈로그에는 Crown CS 시리즈로 표기되어 있습니다. 제조사의 세부 모델을 확인하지 못해 유사한 CTs 제품의 수치를 대신 넣지 않았습니다.'
        rows = clean(dt.get('specs', []))
        dt['specs'] = rows
        count = len(rows)
        variants = dt.get('specVariants') or []
        if count:
            packs.setdefault(pid, item.get('pack') if item.get('pack') is not None else 0)
        # No artificial completeness threshold: sparse manufacturer data is
        # recorded as limited even when the existing table is nonempty.
        status = 'model_identity_unverified' if dt.get('specModelUnverified') else 'verified_detailed' if count >= 4 and dt.get('specSources') else 'limited_official_data' if count else 'needs_primary_source'
        dt['specReviewStatus'] = status
        dt['specReviewedAt'] = DATE
        ledger.append(dict(id=pid, name=item['name'], model=item['model'], before=item['before_rows'], after=count,
                           options=len(variants), status=status, changed=dt.get('specs') != original.get(pid, {}).get('specs'),
                           scope=dt.get('specScope', ''), sources=dt.get('specSources', []), note=dt.get('specReviewNote', '')))
    assert len(ledger) == len(products) == 1068
    stage = REVIEW / 'stage'
    for p in exported['products']:
        if p['id'] in packs:
            p['d'] = packs[p['id']]
    for p in catalog['products']:
        if p['id'] in packs:
            exported['curated'].setdefault(p['id'], {})['d'] = packs[p['id']]
    exported['specReview'] = dict(date=DATE, total=1068, ledger='proddb/reviews/specs-20261020/product-review.json')
    dump(stage / 'products_db.json', exported)
    for n in sorted(set(packs.values())):
        dump(stage / 'product-details' / f'd{n:02d}.json', dict(items={pid: details[pid] for pid in products if packs.get(pid) == n}))
    dump(REVIEW / 'product-review.json', ledger)
    dump(REVIEW / 'rejected-extractions.json', rejected)
    with (REVIEW / 'product-review.csv').open('w') as f:
        writer = csv.DictWriter(f, fieldnames=['id', 'name', 'model', 'before', 'after', 'options', 'status', 'changed', 'scope', 'note'], extrasaction='ignore')
        writer.writeheader(); writer.writerows(ledger)
    counts = {status: sum(r['status'] == status for r in ledger) for status in sorted({r['status'] for r in ledger})}
    summary = dict(total=len(ledger), changed=sum(r['changed'] for r in ledger), before_missing=sum(not r['before'] for r in ledger),
                   after_missing=sum(not r['after'] for r in ledger), statuses=counts, rejected=len(rejected))
    dump(REVIEW / 'summary.json', summary)
    lines = ['# 제품 사양 검토 — 2026-10-20', '', '기존 1,068개 제품을 각각 검토했습니다. 제품 추가·삭제와 이미지 변경은 범위에서 제외했습니다.', '',
             f'- 상세 사양 0행: {summary["before_missing"]} → {summary["after_missing"]}', f'- 실제 사양표 변경: {summary["changed"]}개',
             f'- 검토 상태: {json.dumps(counts, ensure_ascii=False)}', '', '행 수만으로 입력 완료로 판정하지 않습니다. 제품군·묶음 구성품·선택 모델의 적용 범위와 공식 출처를 상세에 표시합니다.', '',
             '## 원문 정보가 제한되어 추가 확인이 필요한 항목', '', '| ID | 제품 | 사양 행 | 상태 |', '|---|---|---:|---|']
    lines.extend(f'| {r["id"]} | {r["name"]} | {r["after"]} | {r["status"]} |' for r in ledger if r['status'] != 'verified_detailed')
    lines += ['', f'자료 제한 {counts.get("limited_official_data", 0)}건은 공식 자료에 사양이 1~3행만 있는 경우입니다. 모델 미확정 2건(IAA, Crown CS)은 확인 완료로 처리하지 않았습니다.',
              'Crown CS는 제품 분류만 확인되어 기술 사양표를 비워 두었습니다. IAA 항목에는 명확히 구분한 IAB 제품군 참고값만 표시합니다.',
              'PC4NUHK1의 호환 조건은 2018년 카탈로그, MLT-W709는 제조사 사용 설명서 p.160에 근거하며 해당 조건과 원문 단위를 보존합니다.',
              '', '전체 개별 검토 기록: [product-review.csv](product-review.csv), 출처·적용 범위: [product-review.json](product-review.json).',
              '자료에서 확인할 수 없는 수치와 다른 모델의 수치는 채우지 않았습니다. 기존 원본과 SHA-256 목록은 before/ 및 before-manifest.json에 보관합니다.']
    (REVIEW / 'REPORT.md').write_text('\n'.join(lines) + '\n')

    if apply:
        # Update the live source DB transactionally; preserve other agents' tables
        # and changes by backing up the current DB, never restoring the old copy.
        target = ROOT / 'proddb/winmate_products.sqlite'
        pending = target.with_suffix('.spec-review.sqlite')
        current = sqlite3.connect(target)
        updated = sqlite3.connect(pending)
        try:
            current.backup(updated)
            updated.execute('CREATE TABLE IF NOT EXISTS product_spec_review (id TEXT PRIMARY KEY, model TEXT NOT NULL, reviewed_at TEXT NOT NULL, detail_json TEXT NOT NULL)')
            updated.executemany('INSERT OR REPLACE INTO product_spec_review VALUES (?,?,?,?)',
                                [(pid, products[pid].get('model', ''), DATE, json.dumps(dt, ensure_ascii=False)) for pid, dt in details.items() if pid in packs])
            for goods_id, record in live.items():
                if record.get('status') != 200 or not record.get('rows'):
                    continue
                row = updated.execute('SELECT family_id, model_code FROM spec_value WHERE goods_id=? LIMIT 1', (goods_id,)).fetchone()
                if not row:
                    continue
                updated.execute('DELETE FROM spec_value WHERE goods_id=?', (goods_id,))
                updated.executemany('INSERT INTO spec_value(goods_id,model_code,family_id,seq,group_name,attr_name,value_raw) VALUES (?,?,?,?,?,?,?)',
                                    [(goods_id, row[1], row[0], i, *r) for i, r in enumerate(record['rows'])])
            updated.commit()
            assert updated.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
            assert not updated.execute('PRAGMA foreign_key_check').fetchall()
        finally:
            current.close(); updated.close()
        pending.replace(target)
        # All destination paths are app-owned files, never the static symlink.
        # Preserve concurrent catalog/image/index work; this review owns pack
        # addresses and specReview metadata only.
        active_export = load(ROOT / 'app/data/products_db.json')
        assert {p['id'] for p in active_export['products']} == {p['id'] for p in exported['products']}
        for p in active_export['products']:
            if p['id'] in packs:
                p['d'] = packs[p['id']]
        for pid in exported['curated']:
            if pid in packs:
                active_export['curated'].setdefault(pid, {})['d'] = packs[pid]
        active_export['specReview'] = exported['specReview']
        dump(ROOT / 'app/data/products_db.json', active_export)
        for path in (stage / 'product-details').glob('d*.json'):
            dest = ROOT / 'app/data/product-details' / path.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)
    source_db.close()
    print(json.dumps(summary, ensure_ascii=False, indent=2))


def load_text(value):
    return json.loads(value or '[]')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    main(parser.parse_args().apply)
