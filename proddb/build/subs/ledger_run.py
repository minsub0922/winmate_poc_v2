"""구독(subscription)만 확인하는 DSS run — 원장(proddb/dss/ledger.json)에 subscription:<id> 항목과 run 기록을 합친다.

전체 run 은 ledger.py 가 같은 규칙(proddb/build/dss/subs_ledger.py)으로 구독까지 함께 쓴다. 이 스크립트는 구독 소스만 다시 볼 때
(사이트 구독 메뉴 · 혜택 페이지가 바뀜, 혜택 기간 만료 확인) 쓴다. 제품 · 솔루션 항목은 상태 · 확인 시점을 건드리지 않고,
종류(kind) 판정 규칙이 바뀐 행만 고쳐 run 기록의 reclassified 에 남긴다.

  python3 proddb/build/subs/ledger_run.py proddb/reviews/<run_id> [--dry-run]
  · <review>/run.json            run_id · run_at · finished_at · scope ['subscriptions']
  · <review>/source-inventory.json  collect.py inventory(+ 발견 링크) — sources 상태 집계
  · app/data/subscriptions.json  build.py 가 이번 run 원문으로 만든 레지스트리"""
import json, os, sys
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, os.path.join(HERE, '..', 'dss'))
from subs_ledger import kind_of, subscription_items

REVIEW = sys.argv[1]; DRY = '--dry-run' in sys.argv
J = lambda p: json.load(open(p, encoding='utf-8'))
CFG = J(os.path.join(REVIEW, 'run.json')); RUN_ID, RUN_AT = CFG['run_id'], CFG['run_at']
inv = J(os.path.join(REVIEW, 'source-inventory.json'))
reg = J(os.path.join(ROOT, 'app/data/subscriptions.json'))
if reg.get('run') != RUN_ID: sys.exit(f"레지스트리 run({reg.get('run')})이 이번 run({RUN_ID})과 다르다 — build.py 를 이 run 으로 다시 돌린다")
LEDGER = os.path.join(ROOT, 'proddb/dss/ledger.json')
prev = J(LEDGER) if os.path.exists(LEDGER) else {'version': 1, 'runs': [], 'items': {}}

items = dict(prev['items'])
subs = subscription_items(prev['items'], reg, RUN_ID, RUN_AT)
items.update(subs)
same_run = next((r for r in prev['runs'] if r['run_id'] == RUN_ID), {})
reclassified = list(same_run.get('reclassified') or [])  # 같은 run 을 다시 돌려도 이미 고친 기록은 남긴다
for k, v in prev['items'].items():  # 종류 판정 규칙 변경(식기세척기 = 제품 · '솔루션 · 서비스' 분류의 비케어 행 = 솔루션)
    if not k.startswith('product:'): continue
    f = v.get('family') or {}
    nk = kind_of({'sc': f.get('sc'), 'cat': f.get('cat'), 'name': v.get('name')})
    if nk != v['kind']:
        items[k] = dict(v, kind=nk); reclassified.append({'key': k, 'name': v['name'], 'from': v['kind'], 'to': nk})

cnt = Counter(s['status'] for s in inv['sources'])
st = Counter(v['status'] for v in subs.values())
run = {'run_id': RUN_ID, 'run_at': RUN_AT, 'finished_at': CFG.get('finished_at'), 'scope': CFG.get('scope') or ['subscriptions'],
       'sources': {'complete': cnt['complete'] + cnt['same'] + cnt['changed'] + cnt['new'] + cnt['moved'], 'partial': cnt['partial'], 'failed': cnt['failed'], 'gone': cnt['gone']},
       'counts': {'checked': sum(1 for v in subs.values() if v.get('checked_run') == RUN_ID), 'new': st['new'], 'changed': st['changed'], 'unresolved': st['unresolved'],
                  'deprecated': st['deprecated'], 'deleted': st['deleted'], 'inferred': st['inferred'], 'expired': st['expired'],
                  'by_kind': {f'{a}:{b}': n for (a, b), n in Counter((v['kind'], v['status']) for v in subs.values()).items()},
                  'reclassified': len(reclassified)},
       'reclassified': reclassified}
runs = [r for r in prev['runs'] if r['run_id'] != RUN_ID] + [run]
out = {'version': 1, 'about': '표식의 정본 — DSS(제품 · 솔루션 · 서비스 · 구독)별 마지막 확인 시점. .agents/skills/winmate-update-dss-db 가 run 마다 갱신한다.',
       'runs': runs, 'items': dict(sorted(items.items()))}
if not DRY:
    json.dump(out, open(LEDGER, 'w', encoding='utf-8'), ensure_ascii=False, indent=0, separators=(',', ':'))
print(json.dumps({k: v for k, v in run.items() if k != 'reclassified'}, ensure_ascii=False))
print('reclassified', Counter(f"{r['from']}→{r['to']}" for r in reclassified))
