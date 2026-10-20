"""App-owned review schema and PoC bridge; preserve the original research modules."""
from __future__ import annotations
import json
import time
from functools import lru_cache
from .imports import ROOT

@lru_cache(maxsize=1)
def schema() -> dict:
    return json.loads((ROOT / 'app/web/src/domain/review/schema.json').read_text(encoding='utf-8'))


def remap_checks(raw: dict) -> dict:
    spec = schema()
    known = {c['id'] for c in spec['criteria']}
    out = {i: [] for i in known}
    for old, notes in raw.items():
        # Retained research checks use v1 IDs; map each note to one current owner.
        target = spec['legacy_map'].get(old, old if old in known else None)
        if target:
            for note in notes:
                if note not in out[target]:
                    out[target].append(note)
    return out


def applicable(cs, profile: dict, gate) -> dict:
    definitions = {c['id']: c for c in schema()['criteria']}
    out = {}
    for c in cs.items:
        checks = [gate(name, profile) for name in definitions[c.id]['when_any']]
        matched = [why for ok, why in checks if ok]
        out[c.id] = (bool(matched), ' · '.join(dict.fromkeys(matched)) if matched else ' / '.join(why for _, why in checks))
    return out


def evaluate(p, ctx, ps, force=None) -> dict:
    """Same PoC route → real-model score → aggregate, with current gates and note IDs.

    No module globals are patched: concurrent jobs and the retained PoC stay isolated.
    The strict adapter still rejects every fallback/non-model result afterwards.
    """
    pipe = ps.pipeline
    started = time.monotonic()
    profile = pipe.profile(p, ctx.catalog)
    gates = applicable(ctx.cs, profile, ps.criteria.gate)
    checks = remap_checks(pipe.auto_checks(p, ctx.catalog, ctx.others))
    if force:
        from proposal_score.router import Route
        route = Route([i for i in ctx.cs.ids() if i in force], gates, mode='forced')
    else:
        route = pipe.route(p, ctx.cs, ctx.tax, gates, checks, ctx.backend, ctx.budget, ctx.min_k, ctx.temperature)
    if schema().get('scoring', {}).get('id') == 'checkpoints-4x4':
        from . import detailed_review
        scores = detailed_review.score_selected(p, ctx, route.selected, checks, schema())
        aggregate = detailed_review.aggregate(ctx.cs, scores, gates, route.selected)
    else:
        scores = pipe.score_selected(p, ctx.cs, ctx.tax, route.selected, checks, ctx.backend, ctx.temperature)
        aggregate = pipe.aggregate(ctx.cs, ctx.tax, scores, gates, route.selected)
    grounded = [s.grounded for s in scores if s.grounded is not None]
    tag = p.id + p.variant
    calls = [c for c in (ctx.backend.calls if ctx.backend else []) if c.tag == tag or c.tag.startswith(tag + ':')]
    return {
        'criteria_version': schema()['version'], 'id': p.id, 'variant': p.variant, 'title': p.title, 'customer': p.customer, 'n_sheets': p.n,
        'req': p.meta.get('req_label'), 'strategy': p.meta.get('strategy_label'), 'ind': p.meta.get('ind_name'),
        'route': route.to_dict(), 'scores': [s.to_dict() for s in scores], 'aggregate': aggregate,
        'rule_pass': route.rule_pass, 'risk': route.risk, 'auto_checks': checks,
        'grounded_mean': round(sum(grounded) / len(grounded), 3) if grounded else None,
        'fallbacks': sum(s.mode not in ('llm', 'rules') for s in scores),
        'profile': {k: v for k, v in profile.items() if k != 'req_list'},
        'calls': len(calls), 'tokens': {'prompt': sum(c.prompt_tokens for c in calls), 'output': sum(c.output_tokens for c in calls)},
        'seconds': round(time.monotonic() - started, 1),
    }
