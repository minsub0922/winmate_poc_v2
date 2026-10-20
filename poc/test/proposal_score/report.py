"""결과 리포트(markdown) — results/<run_id>/ 의 JSON 에서 만든다."""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List, Optional

from .criteria import CriteriaSet, load_criteria
from .pipeline import PERTURB
from .taxonomy import load_taxonomy


def _load_dir(d: Path) -> List[dict]:
    return [json.loads(f.read_text(encoding='utf-8')) for f in sorted(d.glob('*.json'))] if d.exists() else []


def _fmt(v, nd=1):
    return '—' if v is None else (f'{v:.{nd}f}' if isinstance(v, float) else str(v))


def build_report(run_dir: Path, meta: dict) -> str:
    cs: CriteriaSet = load_criteria()
    tax = load_taxonomy()
    main = [r for r in _load_dir(run_dir / 'main') if 'scores' in r]
    order = {f'bs{i:02d}': i for i in range(1, 30)}
    main.sort(key=lambda r: order.get(r['id'], 99))
    fine = {f['id']: f for f in tax['fine']}
    coarse = {c['id']: c for c in tax['coarse']}
    L: List[str] = []
    A = L.append
    A(f"# 제안서 평가(proposal_score) PoC 결과 — {meta.get('run_id', run_dir.name)}\n")
    A(f"- 모델: `{meta.get('model')}` · 백엔드 {meta.get('backend')} · 온도 {meta.get('temperature')} · 기준 예산 {meta.get('budget')}개(최소 {meta.get('min_k')})")
    u = meta.get('usage', {})
    A(f"- 호출 {u.get('calls')}회(실호출 {u.get('live_calls')} · 기록 재사용 {u.get('cached_calls')} · 오류 {u.get('errors')}) · 입력 {u.get('prompt_tokens', 0):,} · 출력 {u.get('output_tokens', 0):,} 토큰 · 단계별 {u.get('by_stage')}")
    A(f"- 대상: Best Scenario {len(main)}개 · {sum(r['n_sheets'] for r in main)}장 (앱 레이아웃 · 채운 값으로 실제 렌더링해 추출)\n")

    # ---- taxonomy
    st = tax['stats']
    A('## 1. 평가 기준 계층(커뮤니티)\n')
    A(f"기준 {st['criteria']}개 · 개념 {st['concepts']}개 · 간선 {st['edges']}개 → 세부 커뮤니티(L2) {st['fine']}개(모듈러리티 {st['modularity_fine']}, γ={tax['params']['gamma_fine']}) → 상위 커뮤니티(L1) {st['coarse']}개(γ={tax['params']['gamma_coarse']}) → 루트. "
      f"세부 커뮤니티 {st['fine']}개 중 {st['mixed_app_categories']}개가 앱의 7개 분류를 가로질러 묶였어요. 요약: {tax['summarized_by']}.\n")
    A('| L1 | L2 | 이름 | 기준 |')
    A('|---|---|---|---|')
    for c in tax['coarse']:
        for k, fid in enumerate(c['children']):
            f = fine[fid]
            A(f"| {c['id'] + ' ' + c['name'] if k == 0 else ''} | {fid} | {f['name']} | {', '.join(i + ' ' + cs[i].name for i in f['criteria'])} |")
    A('')

    # ---- per scenario
    A('## 2. 시나리오별 결과\n')
    A('점수는 고른 기준만으로 낸 값: 1·2·3점 → 0·50·100, 앱 분류 가중치로 묶음. 등급 85↑ 우수 · 70↑ 양호 · 50↑ 보완 · 50↓ 미흡(앱과 같은 기준).\n')
    A('| 시나리오 | 장 | 요구 유형 · 전략 | 적용 가능 → LLM 채점 · 규칙 통과 | 위험 신호 → 채점 | 점수 | 1~3 평균 | 1·2·3점 개수 | 근거 인용 일치 |')
    A('|---|---|---|---|---|---|---|---|---|')
    for r in main:
        a = r['aggregate']
        risk = r.get('risk') or r['route'].get('risk') or []
        rsel = sum(1 for i in risk if i in r['route']['selected'])
        A(f"| {r['id']} {r['customer']} | {r['n_sheets']} | {r['req']} · {r['strategy']} | {a['n_applicable']} → {a['n_selected']} · {len(r.get('rule_pass') or [])} | {len(risk)} → {rsel} | **{_fmt(a['total'])}** {a['band']} | {_fmt(a['rubric_mean'], 2)} | {a['dist']['1']}·{a['dist']['2']}·{a['dist']['3']} | {_fmt(r.get('grounded_mean'), 2)} |")
    tot = [r['aggregate']['total'] for r in main if r['aggregate']['total'] is not None]
    sel = [r['aggregate']['n_selected'] for r in main]
    app = [r['aggregate']['n_applicable'] for r in main]
    A('')
    if tot:
        A(f"- 평균 점수 {sum(tot) / len(tot):.1f} (최저 {min(tot):.1f} · 최고 {max(tot):.1f}) · 고른 기준 평균 {sum(sel) / len(sel):.1f}개 / 적용 가능 {sum(app) / len(app):.1f}개 / 전체 54개\n")

    # ---- routing analysis
    A('## 3. 라우팅 — 어떤 기준을 골랐나\n')
    freq = Counter(i for r in main for i in r['route']['selected'])
    l1sel = Counter(x['id'] for r in main for x in r['route'].get('l1', []) if x.get('relevance', 0) >= 2)
    rr = [sum(1 for i in (r.get('risk') or []) if i in r['route']['selected']) / len(r['risk']) for r in main if r.get('risk')]
    la = []
    for r in main:
        loc = r['route'].get('local') or {}
        top = [i for i in loc if i in r['route']['gates'] and r['route']['gates'][i]['applies'] and i not in (r.get('rule_pass') or [])][:5]
        if top:
            la.append(sum(1 for i in top if i in r['route']['selected']) / len(top))
    A(f"- 위험 신호가 있는 기준을 채점에 넣은 비율(위험 재현율) 평균 {_fmt(sum(rr) / len(rr) if rr else None, 2)} · 맥락 연결 점수 상위 5개 중 고른 비율 평균 {_fmt(sum(la) / len(la) if la else None, 2)} · "
      f"규칙 통과로 LLM 채점을 생략한 위생 기준 평균 {sum(len(r.get('rule_pass') or []) for r in main) / max(1, len(main)):.1f}개\n")
    A('상위 커뮤니티(L1) 선택 횟수: ' + ' · '.join(f"{cid} {coarse[cid]['name']} {l1sel.get(cid, 0)}/{len(main)}" for cid in coarse) + '\n')
    by_req = defaultdict(Counter)
    for r in main:
        for i in r['route']['selected']:
            by_req[r['req']][i] += 1
    A('| 기준 | 고른 횟수 | 평균 점수 | 1점 횟수 |')
    A('|---|---|---|---|')
    sc_by = defaultdict(list)
    for r in main:
        for s in r['scores']:
            if s['score']:
                sc_by[s['id']].append(s['score'])
    for i, n in freq.most_common():
        v = sc_by.get(i, [])
        A(f"| {i} {cs[i].name} | {n} | {_fmt(sum(v) / len(v) if v else None, 2)} | {sum(1 for x in v if x == 1)} |")
    never = [i for i in cs.ids() if i not in freq]
    A(f"\n한 번도 고르지 않은 기준 {len(never)}개: " + ', '.join(f'{i} {cs[i].name}' for i in never) + '\n')
    A('요구 유형별로 많이 고른 기준(상위 5):\n')
    for req, c in sorted(by_req.items()):
        A(f"- {req}: " + ', '.join(f'{i} {cs[i].name}({n})' for i, n in c.most_common(5)))
    A('')

    # ---- detail per scenario (low scores)
    A('## 4. 시나리오별 보완점 (1점 · 2점 중 가중치 높은 것)\n')
    for r in main:
        a = r['aggregate']
        cats = ' · '.join(f"{cs.cat_by_id[c]['short']} {v:.0f}" for c, v in a['categories'].items())
        A(f"### {r['id']} {r['customer']} — {_fmt(a['total'])} {a['band']} ({cats})")
        l1 = [x for x in r['route'].get('l1', []) if x.get('relevance', 0) >= 2]
        if l1:
            A('라우팅: ' + ' / '.join(f"{x['id']} {coarse.get(x['id'], {}).get('name', '')}({x['relevance']}) — {x['reason']}" for x in l1)[:700])
        low = sorted([s for s in r['scores'] if s['score'] and s['score'] < 3], key=lambda s: (s['score'], -cs[s['id']].w))[:4]
        for s in low:
            ev = '; '.join(f"{e['sheet']}장 “{e['quote']}”" for e in s['evidence'] if e.get('quote'))[:160]
            A(f"- **{s['id']} {cs[s['id']].name} = {s['score']}점** — {s['anchor']}" + (f" · 근거: {ev}" if ev else '') + (f" · 고칠 점: {s['improve']}" if s['improve'] else ''))
        A('')

    # ---- validation
    A('## 5. 검증\n')
    g = [r['grounded_mean'] for r in main if r.get('grounded_mean') is not None]
    fb = sum(r.get('fallbacks', 0) for r in main)
    allsc = [s for r in main for s in r['scores']]
    A(f"- 근거 인용 대조(인용 문구가 그 장에 실제로 있는 비율): 평균 {_fmt(sum(g) / len(g) if g else None, 3)} · 인용이 하나도 없는 채점 {sum(1 for s in allsc if not any(e.get('quote') for e in s['evidence']))}/{len(allsc)}")
    A(f"- LLM 응답 누락 · 실패로 규칙 점수를 쓴 기준: {fb}개 · 라우팅 대체(rules-fallback): {sum(1 for r in main if r['route']['mode'] != 'llm')}건")
    conf = Counter(s.get('confidence') for s in allsc)
    A(f"- 확신도 분포: {dict(conf)}\n")
    stab = meta.get('stability')
    if stab:
        A(f"### 안정성 — 같은 {len(stab['rows'])}개 제안서를 온도 {meta.get('stability_temperature')}로 다시 실행\n")
        A(f"- 고른 기준 겹침(Jaccard) 평균 {stab['mean_jaccard']} · 공통 기준 {stab['pairs']}개의 점수 완전 일치 {stab['exact_agreement']} · ±1 이내 {stab['within1']} · 총점 차이 평균 {stab['mean_abs_total_diff']}점")
        A('| 시나리오 | Jaccard | 공통 기준 | 같은 점수 | 총점(기본 → 재실행) |')
        A('|---|---|---|---|---|')
        for x in stab['rows']:
            A(f"| {x['id']} | {x['jaccard']} | {x['common']} | {x['exact']} | {_fmt(x['total_a'])} → {_fmt(x['total_b'])} |")
        A('')
    pt = meta.get('perturb')
    if pt:
        A('### 교란 대조군 — 일부러 망가뜨린 제안서에서 목표 기준 점수가 떨어지나\n')
        A('원본(앱 규칙 메모 제외)과 교란본을 비교. routed = 라우터가 기준을 고르는 전체 경로, forced = 목표 기준만 강제로 채점(채점기 단독 민감도), '
          'same = 교란본을 원본이 고른 기준 그대로 채점(같은 기준일 때 총점 비교).\n')
        A('| 교란 | 무엇을 바꿈 | 목표 기준 | forced: 하락 · 평균(원본 → 교란) | routed: 위험 신호 · 고름 · 하락 |')
        A('|---|---|---|---|---|')
        agg = defaultdict(lambda: {'n': 0, 'fd': 0, 'fb': [], 'fv': [], 'rs': 0, 'rd': 0, 'rk': 0})
        for x in pt:
            v = agg[(x['kind'], x['target'])]
            v['n'] += 1
            v['fd'] += int(x['forced_drop'])
            v['rs'] += int(x['routed_selected'])
            v['rd'] += int(x['routed_drop'])
            v['rk'] += int(x.get('risk_variant', False))
            if x['base']:
                v['fb'].append(x['base'])
            if x['forced']:
                v['fv'].append(x['forced'])
        for (kind, t), v in sorted(agg.items()):
            A(f"| {kind} | {PERTURB[kind]['what']} | {t} {cs[t].name} | {v['fd']}/{v['n']} · {_fmt(sum(v['fb']) / len(v['fb']) if v['fb'] else None, 2)} → {_fmt(sum(v['fv']) / len(v['fv']) if v['fv'] else None, 2)} | {v['rk']}/{v['n']} · {v['rs']}/{v['n']} · {v['rd']}/{v['n']} |")
        A('')
        seen = {}
        for x in pt:
            seen.setdefault((x['id'], x['kind']), x)
        sv = [x for x in seen.values() if x.get('total_same') is not None and x.get('total_base') is not None]
        if sv:
            dn = sum(1 for x in sv if x['total_same'] < x['total_base'])
            up = sum(1 for x in sv if x['total_variant'] is not None and x['total_variant'] >= x['total_base'])
            A(f"- 총점: 교란본을 원본과 같은 기준으로 채점하면 {dn}/{len(sv)}건에서 총점이 내려감(평균 {_fmt(sum(x['total_base'] - x['total_same'] for x in sv) / len(sv))}점 하락). "
              f"라우터가 기준을 다시 고르게 두면 {up}/{len(sv)}건은 총점이 그대로거나 오름 — 고른 기준이 바뀌면 총점은 서로 비교하지 않는다.\n")
        A('| 시나리오 | 교란 | 목표 | 원본 | forced | routed(고름 · 점수) | 총점 원본 → 교란(routed) | 총점 원본 → 교란(same) |')
        A('|---|---|---|---|---|---|---|---|')
        for x in pt:
            A(f"| {x['id']} | {x['kind']} | {x['target']} | {_fmt(x['base'])} | {_fmt(x['forced'])} | {'고름 ' + _fmt(x['routed']) if x['routed_selected'] else ('규칙 통과' if x.get('rule_pass_variant') else '안 고름')} | {_fmt(x['total_base'])} → {_fmt(x['total_variant'])} | {_fmt(x['total_base'])} → {_fmt(x.get('total_same'))} |")
        A('')
    fu = meta.get('full')
    if fu and fu.get('rows'):
        A('## 6. 라우팅 평가 vs 전체 기준 평가(대조군)\n')
        A('같은 제안서를 라우팅 없이 적용 가능한 기준 전부(평균 약 48개)로 LLM 채점해, 라우터가 고른 12개 안팎의 평가와 비교.\n')
        A(f"- 총점 평균: 라우팅 {fu['mean_total_routed']} · 전체 {fu['mean_total_full']} · 같은 제안서 차이 평균 {fu['mean_abs_total_diff']}점")
        A(f"- 문제 재현율: 전체 평가에서 1점인 기준 {fu['low_total']}개 중 라우터가 골라 채점한 것 {_fmt(fu['low_recall'], 3)} · 규칙 통과로 넘긴 것 {fu['low_in_rule_pass']}개")
        A(f"- 같은 기준의 점수 일치(두 평가 모두 채점한 {fu['pairs']}개): {_fmt(fu['same_score_rate'], 3)}")
        A(f"- 비용: 호출 수 {_fmt(fu['calls_ratio'], 3)}배 · 입력 토큰 {_fmt(fu['tokens_ratio'], 3)}배(라우팅 / 전체)")
        ul = fu.get('unselected_low') or {}
        if ul:
            A('- 라우터가 고르지 않았는데 전체 평가에서 1점이 나온 기준(횟수): ' + ', '.join(f'{i} {cs[i].name}({k})' for i, k in sorted(ul.items(), key=lambda kv: -kv[1])))
        A('')
        A('| 시나리오 | 총점 라우팅 → 전체 | 1~3 평균 라우팅 → 전체 | 채점 기준 수 | 호출 | 전체 평가 1점 기준 | 라우터가 놓친 것 |')
        A('|---|---|---|---|---|---|---|')
        for x in fu['rows']:
            A(f"| {x['id']} | {_fmt(x['total_routed'])} → {_fmt(x['total_full'])} | {_fmt(x['rubric_routed'], 2)} → {_fmt(x['rubric_full'], 2)} | {x['n_routed']} → {x['n_full']} | {x['calls_routed']} → {x['calls_full']} | "
              f"{', '.join(x['low_full']) or '없음'} | {', '.join(x['missed'] + [i + '(규칙 통과)' for i in x['missed_rule_pass']]) or '없음'} |")
        A('')
    return '\n'.join(L)
