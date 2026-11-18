#!/usr/bin/env python3
"""DSS 종류 분류 — 수집한 항목을 LLM 으로 제품(device) · 솔루션(solution) · 서비스(service) · 구독(subscription)으로 나눈다.

samsung.com/business 의 제품 목록에는 제품만 있지 않다. 사이트 분류 이름이 '시스템에어컨 솔루션' · '환기 솔루션' · '빌딩통합솔루션'
이어도 그 아래는 실내기 · 전열교환기 · 센서 같은 기기이고, '모바일 솔루션' 아래에 보증연장 서비스가, 제품 카드 사이에 세척 ·
케어 서비스와 소프트웨어(MagicINFO · Knox · b.IoT)가 섞여 있다. 분류 이름 · 키워드 규칙(subs_ledger.kind_of)으로는 못 가르므로
수집한 뒤 항목마다 이름 · 분류 · 설명을 LLM 이 읽고 판정한다.

    python3 proddb/build/dss/classify.py                      # 활성 데이터(app/data) 전부 — 바뀐 항목만 모델을 부른다
    python3 proddb/build/dss/classify.py --apply              # + products_db.json 행의 dssKind · 원장 종류 · SQLite(dss_db.py)
    python3 proddb/build/dss/classify.py --profile gemini     # LLM 프로필(기본: 앱이 고른 LLM — app/api/poc/settings.py)
    전체 run(README 9-1단계): --db $R/stage/app/data/products_db.json --details $R/stage/app/data/product-details
                              --out $R/stage/proddb/dss/kinds.json --review $V/kinds-review.json --run <RUN_ID> --apply-rows

정본 proddb/dss/kinds.json — 항목 id 마다 {kind, conf, why, by, rule, hash, model, at, run, review?}
- 같은 입력(이름 · 분류 · 설명의 해시)과 같은 판정 기준(PROMPT_VERSION)이면 지난 판정을 그대로 쓴다(모델을 부르지 않는다).
- 확신이 낮거나 지난 규칙과 다르면 한 항목씩 다시 묻는다(설명을 더 길게). 두 답이 같으면 확정, 다르면 두 번째 답 + review.
- 사람의 판정 proddb/dss/kind-overrides.json({id: {kind, by, why}})이 늘 이긴다(by 'manual').
- 모델에 보내는 글에는 모델 코드가 없다(이름 · 설명의 코드는 '모델'로) — 종류 판정에 코드는 필요 없다.
- 솔루션으로 판정한 행은 한 번 더: 앱 솔루션 카탈로그(catalog.json solutions)의 어느 것과 같은 것(그 판매 단위)인지 — same.
  같은 것이 있으면 앱의 솔루션 목록에는 카탈로그 항목만 보인다(행은 그 항목으로 잇는다 — products_db 행 dssSame).
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import glob
import hashlib
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

KINDS = ('device', 'solution', 'service', 'subscription')
LABEL = {'device': '제품', 'solution': '솔루션', 'service': '서비스', 'subscription': '구독'}
PROMPT_VERSION = 1
BATCH = 10   # (약한 모델: 한 번에 10개 · 프롬프트 약 3천 자)
WORKERS = 4
KST = timezone(timedelta(hours=9))
CODE = re.compile(r'(?<![A-Za-z0-9])(?:[A-Z]{1,5}-?\d{2,}[A-Z0-9]*(?:-[A-Z0-9]+)*|\d{2,}[A-Z]{2,}[A-Z0-9]*)(?![A-Za-z0-9])')
SPEC = re.compile(r'^(IP|IK|USB|HDR|UHD|DDR|LTE|CPU|GPU|SSD|HDD)\d')   # (규격은 코드가 아니다)
KEYWORD_DUMP = re.compile(r'(,\s*[^,]{1,30}){5,}')                   # ('SAMSUNG Business, 삼성 비즈니스, …' — 검색어 나열은 설명이 아니다)

SYSTEM = (
    "삼성전자 B2B 판매 목록(samsung.com/business 제품 카드 · B2B e-카탈로그 행)의 항목마다 DSS 종류 하나를 고릅니다.\n"
    "- device(제품): 사서 설치 · 사용하는 물리적인 것 — 기기 · 부품 · 액세서리 · 소모품 · 제어기 · 리모컨 · 센서 · 밸브 · 키트 · 배관 자재. "
    "분류 이름에 '솔루션'이 붙어도 물건이면 device(예: 환기 솔루션의 전열교환기, 빌딩통합솔루션의 센서 · 제어기).\n"
    "- solution(솔루션): 소프트웨어 · 플랫폼 · 클라우드 · 라이선스 · 앱 — 기능을 쓰는 것(콘텐츠 관리 · 기기 관리 · 빌딩 관리 · 보안 · 업무 앱). "
    "기기를 제어해도 그 자체가 소프트웨어면 solution.\n"
    "- service(서비스): 사람이 해 주는 일 — 세척 · 점검 · 유지보수 · 수리 · 설치 · 보증 연장 · 케어 프로그램 · 관리 대행 · 교육 · 컨설팅.\n"
    "- subscription(구독): 정기 요금(월 · 연)으로 기기 · 서비스를 함께 쓰는 상품 — 구독 · 이용료 요금제 · 렌탈형 이용.\n"
    "이름 · 분류 · 설명으로 판단합니다. 두 종류에 걸치면 고객이 값을 내는 중심을 고르고 conf 는 low.\n"
    'JSON만: {"items":[{"id":"항목 id","kind":"device|solution|service|subscription","conf":"high|low","why":"판단 근거 15자 이내"}]} '
    "— 받은 항목 전부.")
ONE = "한 항목만 자세히 봅니다. 설명을 끝까지 읽고 고릅니다."
SAME = ("삼성전자 B2B 솔루션 항목마다, 아래 앱 솔루션 목록에서 같은 것을 고릅니다. 같은 것 = 같은 소프트웨어 · 플랫폼의 판매 단위"
        "(에디션 · 버전 · 표기만 다른 것 포함). 다른 제품이거나 확실하지 않으면 none.\n앱 솔루션: {catalog}\n"
        'JSON만: {{"items":[{{"id":"항목 id","same":"앱 솔루션 id 또는 none"}}]}}')
SCHEMA = {'type': 'OBJECT', 'properties': {'items': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
    'id': {'type': 'STRING'}, 'kind': {'type': 'STRING', 'enum': list(KINDS)}, 'conf': {'type': 'STRING', 'enum': ['high', 'low']},
    'why': {'type': 'STRING'}}, 'required': ['id', 'kind', 'conf']}}}, 'required': ['items']}


def now() -> str:
    return datetime.now(KST).isoformat(timespec='seconds')


def uncode(text: str) -> str:
    """모델 코드 없이 — 이름 · 설명의 코드는 '모델'로(규격 IP65 · USB-C 는 그대로)"""
    out = CODE.sub(lambda m: m.group(0) if SPEC.match(m.group(0)) else '모델', str(text or ''))
    out = re.sub(r'(모델)(\s*[·,/]?\s*모델)+', r'\1', out)
    return re.sub(r'\s+', ' ', out).strip()


def load_details(folder: Path) -> dict:
    out = {}
    for f in sorted(glob.glob(str(folder / 'd*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        out.update(d.get('items', d) if isinstance(d, dict) else {})
    return out


def describe(detail: dict, limit: int) -> str:
    """상세의 설명 · 특장점 제목 · 첫 본문 — 종류를 가를 말만, ``limit`` 자 안"""
    parts = []
    desc = str(detail.get('desc') or '').strip()
    if desc and not KEYWORD_DUMP.search(desc):
        parts.append(desc)
    feats = [f for f in detail.get('feats') or [] if isinstance(f, dict)]
    parts += [str(f.get('h') or '').strip() for f in feats[:4] if f.get('h')]
    body = next((str(f.get('b') or '').strip() for f in feats if f.get('b')), '')
    if body:
        parts.append(body)
    return uncode(' · '.join(dict.fromkeys(p for p in parts if p)))[:limit]


def items_of(db: dict, catalog: dict, details: dict, limit: int = 160) -> dict:
    """분류할 항목 — products_db 행(사이트 sg_ · 카탈로그 ec_) + 큐레이션 제품(catalog.json products + products_db curated)"""
    out = {}
    for r in db.get('products') or []:
        cat = ' › '.join(dict.fromkeys(str(x) for x in (r.get('fam'), r.get('sc'), r.get('cat')) if x))
        out[r['id']] = {'id': r['id'], 'name': uncode(r.get('name')), 'cat': cat, 'text': describe(details.get(r['id']) or {}, limit),
                        'src': 'site' if str(r['id']).startswith('sg_') else 'ecat', '_row': r}
    cur = db.get('curated') or {}
    for p in (catalog or {}).get('products') or []:
        c = cur.get(p['id']) or {}
        cat = ' › '.join(dict.fromkeys(str(x) for x in (c.get('fam'), c.get('sc'), p.get('cat')) if x))
        text = uncode(' · '.join(x for x in (p.get('spec'), ' · '.join(p.get('kw') or [])) if x))[:limit]
        out[p['id']] = {'id': p['id'], 'name': uncode(p.get('name')), 'cat': cat, 'text': text, 'src': 'curated', '_row': {**c, **p}}
    return out


def same_hash(sols: list) -> str:
    return 'sha256:' + hashlib.sha256(json.dumps([[x['id'], x['name'], x.get('cat')] for x in sols], ensure_ascii=False).encode()).hexdigest()[:16]


def basis_hash(it: dict) -> str:
    body = json.dumps({k: it[k] for k in ('name', 'cat', 'text')}, ensure_ascii=False, sort_keys=True)
    return 'sha256:' + hashlib.sha256(f'{PROMPT_VERSION}\n{body}'.encode()).hexdigest()[:24]


def rule_kind(row: dict) -> str:
    from subs_ledger import kind_of   # (지난 규칙 — 비교 · 모델을 못 쓸 때의 기본값)
    return kind_of({k: row.get(k) for k in ('sc', 'cat', 'name')})


class Asker:
    """LLM 에 묶음으로 묻고 답을 검사한다 — 빠진 항목은 한 번 더, 그래도 없으면 None"""

    def __init__(self, profile: str | None):
        from app.api.poc.provider import get_provider, get_provider_for
        from app.api.poc.settings import get_settings
        if profile:
            self.p, why = get_provider_for(profile)
        else:
            self.p, why = get_provider(get_settings())
        if self.p is None:
            raise SystemExit(f'LLM 을 쓸 수 없습니다 ({why}) — --profile 로 키가 있는 프로필을 고르세요')
        self.model = getattr(self.p, 'model', '') or ''
        self.calls = 0
        self.tokens = [0, 0]

    def ask_same(self, batch: list, sols: list) -> dict:
        """솔루션 행마다 앱 솔루션 카탈로그의 같은 것(id) 또는 None"""
        ids = [x['id'] for x in sols]
        schema = {'type': 'OBJECT', 'properties': {'items': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
            'id': {'type': 'STRING'}, 'same': {'type': 'STRING', 'enum': ids + ['none']}}, 'required': ['id', 'same']}}}, 'required': ['items']}
        system = SAME.format(catalog='; '.join(f"{x['id']}={uncode(x['name'])}({x.get('cat') or ''})" for x in sols))
        want = {it['id'] for it in batch}
        got: dict = {}
        for _ in range(2):
            left = [it for it in batch if it['id'] not in got]
            if not left:
                break
            try:
                r = self.p.generate_json(stage='dss_kind_same', system=system, user=json.dumps(
                    [{k: it[k] for k in ('id', 'name', 'cat', 'text') if it.get(k)} for it in left], ensure_ascii=False), schema=schema,
                    temperature=0.0, max_output_tokens=1024)
            except Exception as exc:  # noqa: BLE001
                print('  호출 실패:', type(exc).__name__, str(exc)[:160], file=sys.stderr)
                continue
            self.calls += 1
            self.tokens[0] += r.prompt_tokens or 0
            self.tokens[1] += r.output_tokens or 0
            for x in (r.data or {}).get('items') or []:
                if isinstance(x, dict) and x.get('id') in want and x.get('same') in ids + ['none'] and x['id'] not in got:
                    got[x['id']] = None if x['same'] == 'none' else x['same']
        return got

    def ask(self, batch: list, one: bool = False) -> dict:
        user = json.dumps([{k: it[k] for k in ('id', 'name', 'cat', 'text') if it.get(k)} for it in batch], ensure_ascii=False)
        want = {it['id'] for it in batch}
        got: dict = {}
        for attempt in range(2):
            left = [it for it in batch if it['id'] not in got]
            if not left:
                break
            if attempt:
                user = json.dumps([{k: it[k] for k in ('id', 'name', 'cat', 'text') if it.get(k)} for it in left], ensure_ascii=False)
            try:
                r = self.p.generate_json(stage='dss_kind', system=SYSTEM + ('\n' + ONE if one else ''), user=user, schema=SCHEMA,
                                         temperature=0.0, max_output_tokens=2048)
            except Exception as exc:  # noqa: BLE001 — a failed call leaves its items unjudged (kept as they were)
                print('  호출 실패:', type(exc).__name__, str(exc)[:160], file=sys.stderr)
                continue
            self.calls += 1
            self.tokens[0] += r.prompt_tokens or 0
            self.tokens[1] += r.output_tokens or 0
            for x in (r.data or {}).get('items') or []:
                if isinstance(x, dict) and x.get('id') in want and x.get('kind') in KINDS and x['id'] not in got:
                    got[x['id']] = {'kind': x['kind'], 'conf': 'low' if x.get('conf') == 'low' else 'high', 'why': str(x.get('why') or '')[:40]}
        return got


def classify(items: dict, prev: dict, overrides: dict, asker: Asker | None, run: str, details: dict, force: bool = False, sols: list = ()) -> tuple:
    """(decisions, review) — 지난 판정 재사용 · 묶음 판정 · 다시 보기 · 사람 판정"""
    at = now()
    out, todo = {}, []
    for pid, it in items.items():
        h = basis_hash(it)
        old = prev.get(pid) or {}
        rk = rule_kind(it['_row'])
        if not force and old.get('hash') == h and old.get('by') in ('llm', 'manual') and old.get('kind') in KINDS:
            out[pid] = {**old, 'rule': rk}
        else:
            todo.append(it)
            out[pid] = {'kind': old.get('kind') if old.get('kind') in KINDS else rk, 'conf': 'low', 'why': '판정 전', 'by': 'rule', 'rule': rk,
                        'hash': h, 'at': at, 'run': run}
    review = []
    if todo and asker is not None:
        batches = [todo[k:k + BATCH] for k in range(0, len(todo), BATCH)]
        print(f'LLM 판정: 항목 {len(todo)} · 묶음 {len(batches)} · 모델 {asker.model}', file=sys.stderr)
        with cf.ThreadPoolExecutor(WORKERS) as ex:
            for got in ex.map(asker.ask, batches):
                for pid, g in got.items():
                    out[pid] = {**g, 'by': 'llm', 'rule': out[pid]['rule'], 'hash': out[pid]['hash'], 'model': asker.model, 'at': at, 'run': run}
        # 다시 보기: 확신이 낮거나 지난 규칙과 다른 것 — 한 항목씩, 설명을 더 길게
        again = [items[pid] for pid in (it['id'] for it in todo) if out[pid]['by'] == 'llm' and (out[pid]['conf'] == 'low' or out[pid]['kind'] != out[pid]['rule'])]
        if again:
            long = {it['id']: {**it, 'text': describe(details.get(it['id']) or {}, 360) or it['text']} for it in again}
            print(f'다시 보기: {len(again)}', file=sys.stderr)
            with cf.ThreadPoolExecutor(WORKERS) as ex:
                for it, got in zip(again, ex.map(lambda x: asker.ask([long[x['id']]], one=True), again)):
                    g = got.get(it['id'])
                    first = out[it['id']]
                    if not g:
                        first['review'] = True
                        continue
                    if g['kind'] == first['kind']:
                        out[it['id']] = {**first, 'conf': 'high' if g['conf'] == 'high' or first['conf'] == 'high' else 'low', 'second': g['kind']}
                    else:
                        out[it['id']] = {**first, **g, 'second_of': first['kind'], 'review': True}
    # 같은 것: 솔루션 행이 앱 솔루션 카탈로그의 어느 것의 판매 단위인지(카탈로그가 같고 입력이 같으면 지난 답)
    sh = same_hash(list(sols))
    for pid, o in out.items():
        old = prev.get(pid) or {}
        if o['kind'] == 'solution' and old.get('same_hash') == sh and old.get('hash') == o.get('hash') and 'same' in old and not force:
            o['same'], o['same_hash'] = old.get('same'), sh
        elif o['kind'] != 'solution':
            o.pop('same', None)
            o.pop('same_hash', None)
    ask_same = [items[pid] for pid, o in out.items() if o['kind'] == 'solution' and 'same_hash' not in o]
    if ask_same and asker is not None and sols:
        print(f'같은 것 찾기: 솔루션 {len(ask_same)}', file=sys.stderr)
        batches = [ask_same[k:k + BATCH] for k in range(0, len(ask_same), BATCH)]
        with cf.ThreadPoolExecutor(WORKERS) as ex:
            for got in ex.map(lambda b: asker.ask_same(b, list(sols)), batches):
                for pid, same in got.items():
                    out[pid]['same'], out[pid]['same_hash'] = same, sh
    for pid, o in (overrides or {}).items():
        if pid in out and o.get('kind') in KINDS:
            out[pid] = {**out[pid], 'kind': o['kind'], 'by': 'manual', 'conf': 'high', 'why': str(o.get('why') or '사람 판정')[:40],
                        'manual_by': o.get('by'), 'review': False}
            if 'same' in o:
                out[pid]['same'] = o['same'] or None
    for pid, o in out.items():
        it = items[pid]
        if o.get('by') == 'rule' or o.get('review') or (o.get('by') == 'llm' and o.get('conf') == 'low'):
            review.append({'id': pid, 'name': it['_row'].get('name'), 'cat': it['cat'], 'src': it['src'], 'kind': o['kind'], 'rule': o['rule'],
                           'conf': o.get('conf'), 'why': o.get('why'), 'second_of': o.get('second_of'), 'by': o.get('by')})
    return out, review


def apply_rows(db_path: Path, decisions: dict, meta: dict) -> dict:
    """products_db.json 행 · 큐레이션에 dssKind, 위 dss 에 분류 기록 — 파일 형식은 그대로(쉼표 · 콜론만, 한 줄)"""
    db = json.load(open(db_path, encoding='utf-8'))
    changed = 0
    for r in db.get('products') or []:
        d = decisions.get(r['id']) or {}
        k = d.get('kind')
        if k and r.get('dssKind') != k:
            r['dssKind'] = k
            changed += 1
        same = d.get('same') if k == 'solution' else None
        if same and r.get('dssSame') != same:
            r['dssSame'] = same
            changed += 1
        elif not same and 'dssSame' in r:
            del r['dssSame']
            changed += 1
    for pid, c in (db.get('curated') or {}).items():
        k = (decisions.get(pid) or {}).get('kind')
        if k and c.get('dssKind') != k:
            c['dssKind'] = k
            changed += 1
    counts = {}
    for r in db.get('products') or []:
        counts[r.get('dssKind') or 'device'] = counts.get(r.get('dssKind') or 'device', 0) + 1
    db['dss'] = {**(db.get('dss') or {}), 'kinds': {'file': 'proddb/dss/kinds.json', **meta, 'rows': dict(sorted(counts.items()))}}
    raw = json.dumps(db, ensure_ascii=False, separators=(',', ':'))
    db_path.write_text(raw, encoding='utf-8')
    return {'rows_changed': changed, 'rows_by_kind': counts}


def apply_ledger(ledger_path: Path, decisions: dict, run: str, at: str) -> dict:
    """원장의 제품 행 · 큐레이션 항목 종류를 판정대로 — 바뀐 항목은 reclassified 로 run 기록에 남긴다(표식 · 상태는 그대로)"""
    L = json.load(open(ledger_path, encoding='utf-8'))
    moved = []
    for key, item in L.get('items', {}).items():
        if item.get('registry') not in ('products_db.products', 'catalog.products'):
            continue
        k = (decisions.get(item.get('id')) or {}).get('kind')
        if k and item.get('kind') != k:
            moved.append({'key': key, 'from': item.get('kind'), 'to': k})
            item['kind'] = k
    if moved:
        by = {}
        for m in moved:
            by[f"{m['from']}→{m['to']}"] = by.get(f"{m['from']}→{m['to']}", 0) + 1
        L['runs'].append({'run_id': run, 'run_at': at, 'finished_at': now(), 'scope': ['kinds'],
                          'counts': {'reclassified': len(moved), 'by_change': by}, 'reclassified': moved})
        ledger_path.write_text(json.dumps(L, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    return {'reclassified': len(moved)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--db', default=str(ROOT / 'app/data/products_db.json'))
    ap.add_argument('--catalog', default=str(ROOT / 'app/data/catalog.json'))
    ap.add_argument('--details', default=str(ROOT / 'app/data/product-details'))
    ap.add_argument('--out', default=str(ROOT / 'proddb/dss/kinds.json'))
    ap.add_argument('--prev', default=None, help='지난 판정(기본: --out 의 파일, 없으면 proddb/dss/kinds.json)')
    ap.add_argument('--overrides', default=str(ROOT / 'proddb/dss/kind-overrides.json'))
    ap.add_argument('--review', default=None, help='다시 볼 항목 목록(기본: --out 옆 kinds-review.json)')
    ap.add_argument('--profile', default=os.environ.get('WINMATE_DSS_KIND_PROFILE') or None)
    ap.add_argument('--run', default=None)
    ap.add_argument('--force', action='store_true', help='지난 판정을 쓰지 않고 다시 묻는다')
    ap.add_argument('--no-llm', action='store_true', help='모델을 부르지 않는다(지난 판정 · 사람 판정 · 규칙만)')
    ap.add_argument('--apply-rows', action='store_true', help='--db 의 행에 dssKind 를 쓴다')
    ap.add_argument('--apply', action='store_true', help='--apply-rows + 원장 종류 + SQLite(dss_db.py) — 활성 데이터에서만')
    a = ap.parse_args(argv)

    out_path = Path(a.out)
    prev_path = Path(a.prev) if a.prev else (out_path if out_path.exists() else ROOT / 'proddb/dss/kinds.json')
    try:
        prev_doc = json.load(open(prev_path, encoding='utf-8')) if prev_path.exists() else {}
    except ValueError:   # (빈 파일 · 처음부터 다시)
        prev_doc = {}
    prev = prev_doc.get('items') or {}
    overrides = json.load(open(a.overrides, encoding='utf-8')) if Path(a.overrides).exists() else {}
    db = json.load(open(a.db, encoding='utf-8'))
    catalog = json.load(open(a.catalog, encoding='utf-8')) if Path(a.catalog).exists() else {}
    details = load_details(Path(a.details))
    items = items_of(db, catalog, details)
    run = a.run or 'kinds-' + datetime.now(KST).strftime('%Y%m%d-%H%M')
    asker = None if a.no_llm else Asker(a.profile)
    t0 = time.time()
    decisions, review = classify(items, prev, overrides, asker, run, details, force=a.force, sols=(catalog or {}).get('solutions') or [])
    counts = {}
    for d in decisions.values():
        counts[d['kind']] = counts.get(d['kind'], 0) + 1
    changed = sum(1 for pid, d in decisions.items() if d['kind'] != (prev.get(pid) or {}).get('kind', d.get('rule')))
    doc = {'version': 1, 'about': 'DSS 종류의 정본 — 수집한 항목을 LLM 이 판정(proddb/build/dss/classify.py). 사람 판정은 kind-overrides.json. '
                                   'same = 앱 솔루션 카탈로그의 같은 것(그 판매 단위).',
           'prompt_version': PROMPT_VERSION, 'model': asker.model if asker else prev_doc.get('model'), 'updated_at': now(), 'run': run,
           'counts': dict(sorted(counts.items())), 'items': dict(sorted(decisions.items()))}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    review_path = Path(a.review) if a.review else out_path.with_name('kinds-review.json')
    review_path.write_text(json.dumps({'run': run, 'at': now(), 'items': review}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    rep = {'items': len(items), 'by_kind': doc['counts'], 'changed_from_before': changed, 'review': len(review),
           'llm_calls': asker.calls if asker else 0, 'tokens': asker.tokens if asker else [0, 0], 'sec': round(time.time() - t0, 1)}
    meta = {'model': doc['model'], 'at': doc['updated_at'], 'run': run}
    if a.apply or a.apply_rows:
        rep['rows'] = apply_rows(Path(a.db), decisions, meta)
    if a.apply:
        rep['ledger'] = apply_ledger(ROOT / 'proddb/dss/ledger.json', decisions, run, doc['updated_at'])
        import subprocess
        r = subprocess.run([sys.executable, '-B', str(ROOT / 'proddb/build/dss_db.py')], cwd=str(ROOT), capture_output=True, text=True)
        rep['sqlite'] = 'ok' if r.returncode == 0 else ('failed: ' + (r.stderr or r.stdout)[-300:])
    print(json.dumps(rep, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
