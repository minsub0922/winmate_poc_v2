"""DSS 원장 공용 규칙 — 종류 판정(device · solution · service · subscription)과 구독(subscription) 항목.
ledger.py(전체 run)와 proddb/build/subs/ledger_run.py(구독만 확인하는 run)가 같이 쓴다."""
import hashlib, json, re

# 서비스: 케어 · 세척 서비스 · 보증 · 유지보수. '식기세척기 · 세척기'는 제품(device)이다 — 예전 규칙이 '세척'만 보고 식기세척기를 서비스로 읽었다.
SERVICE = re.compile(r'서비스|케어|(?<!식기)세척(?!기)|보증|케어플랜|유지보수')
SERVICE_STRONG = re.compile(r'케어|(?<!식기)세척(?!기)|보증|유지보수')


def kind_of(p):
    """제품 DB 행(sc · cat · name)의 DSS 종류 — '솔루션 · 서비스'처럼 둘 다 적힌 분류는 이름이 케어 · 세척 · 보증이 아니면 솔루션."""
    t = ' '.join(str(p.get(k) or '') for k in ('sc', 'cat'))
    if '솔루션' in t and not SERVICE_STRONG.search(t + ' ' + str(p.get('name') or '')): return 'solution'
    if SERVICE.search(t): return 'service'
    return 'solution' if '솔루션' in t else 'device'


VOLATILE = {'status', 'checkedAt', 'checkedRun', 'firstSeen', 'evidence', 'inferredAt', 'state'}


def sub_hash(item):
    return 'sha256:' + hashlib.sha256(json.dumps({k: v for k, v in item.items() if k not in VOLATILE}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def subscription_items(prev_items, reg, run_id, run_at):
    """구독 레지스트리(app/data/subscriptions.json) → 원장 항목 subscription:<id>.
    status: new(처음) · active · changed(사실 해시가 바뀜) · unresolved(소스 불완전 · 원문 대조 실패) · inferred(추론 결제안 — 표식 대상 아님) · expired(혜택 기간 끝남).
    지난 원장에만 있는 구독 항목은 지우지 않는다(호출한 쪽이 합칠 때 남김)."""
    out = {}
    for x in reg['items']:
        key = 'subscription:' + x['id']; prev = prev_items.get(key, {}); h = sub_hash(x)
        st = x.get('status')
        if st == 'inferred': status = 'inferred'
        elif st == 'expired': status = 'expired'
        elif st in ('needs-review', 'unresolved'): status = 'unresolved'
        elif not prev or prev.get('first_seen') == run_at: status = 'new'  # 같은 run 을 다시 돌려도 new 로 남는다
        elif prev.get('hash') and prev['hash'] != h: status = 'changed'
        elif prev.get('changed_at') == run_at and prev.get('status') == 'changed': status = 'changed'
        else: status = 'active'
        note = {'inferred': 'B2B 원문에 없는 결제 방법 — 추론 협의안(proddb/subs/inferred.json), 표식 대상 아님',
                'expired': f"혜택 기간 종료({x.get('validTo')}) — 장은 남기고 새 선택에서만 뺌",
                'unresolved': '원문 소스가 complete 가 아니거나 원문 문장 · 이미지가 확인 때와 달라 사람이 다시 읽어야 함(registry issues)'}.get(status, '')
        models = [it['model'] for it in x.get('items') or [] if isinstance(it, dict) and it.get('model')] if x['type'] == 'package' else []
        out[key] = {
            'kind': 'subscription', 'registry': 'subscriptions.' + x['type'], 'id': x['id'], 'name': x['name'],
            'keys': {'urls': sorted({e['url'] for e in x.get('evidence') or []}), 'models': models},
            'family': {'type': x['type'], 'basis': x.get('basis'), 'parent': x.get('parent')},
            'checked_at': x.get('checkedAt'), 'checked_run': x.get('checkedRun'),
            'changed_at': run_at if status in ('new', 'changed') else prev.get('changed_at'), 'hash': h, 'status': status,
            'evidence': [dict({k: e[k] for k in ('source', 'kind', 'url') if k in e}, **({'sha256': e['sha256']} if e.get('sha256') else {}), **({'textHash': e['textHash']} if e.get('textHash') else {}), run=run_id)
                         for e in x.get('evidence') or []],
            'aliases': [], 'replaced_by': None, 'deleted_at': None, 'note': note, 'first_seen': prev.get('first_seen') or run_at,
        }
        if x['type'] == 'promotion': out[key]['valid'] = {'from': x.get('validFrom'), 'to': x.get('validTo'), 'state': x.get('state')}
    for key, prev in prev_items.items():  # 레지스트리에서 빠진 구독 항목 — 지우지 않고 deprecated 로 표시(사이트 원문에서 사라짐)
        if prev.get('kind') != 'subscription' or key in out: continue
        if prev.get('status') == 'deprecated': out[key] = prev; continue
        out[key] = dict(prev, status='deprecated', changed_at=run_at, note=f'구독 레지스트리에서 빠짐({run_id}) — 원문 소스에서 사라져 새 선택에서 뺌, 기록은 남김')
    return out
