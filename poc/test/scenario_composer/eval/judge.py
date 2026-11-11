"""Blind pairwise judge: gold 샘플 버티컬 시나리오 deck vs a rebuilt deck (composer or baseline), shown as text in random order.

    python -m eval.judge --run runs/<name> [--judge-model gemini-…] [--only …]

The judge sees, slide by slide: part, layout (name · purpose), the visible text (first lines) and the captions of the
pictures shown. It scores each deck 1–5 on storyline · layout fit · picture fit · wording, and says which is better.
Placeholders ([00]) are not penalised: an unknown fact must stay blank, and the gold's numbers are fictional.
"""
from __future__ import annotations

import argparse
import json
import random
import zlib
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
from composer.library import load  # noqa: E402
from composer.llm import GeminiJSON  # noqa: E402
from eval import gold as G  # noqa: E402
from eval.metrics import shown_images, visible_text  # noqa: E402


def deck_text(deck, limit_lines=5) -> str:
    lib = load()
    L, IM = lib['layouts'], lib['images']
    rows, page = [], 0
    for p in deck:
        rows.append(f"## 파트: {p.get('name') or '(표지)'} [{p.get('type')}]")
        for s in p.get('slides') or []:
            page += 1
            l = L.get(s['f'], {})
            txt = [t for t in visible_text(s) if t and len(t) > 1 and not t.startswith('CONFIDENTIAL')][:limit_lines]
            pics = []
            for x in shown_images(s):
                it = IM.get(x['src'])
                pics.append((it or {}).get('desc') or (x['slot'].get('alt') or '?'))
            rows.append(f"{page}. 레이아웃 {l.get('name', s['f'])} — {l.get('when', '')[:50]}\n   문구: " + ' | '.join(t[:60] for t in txt)
                        + ("\n   사진: " + ' | '.join(d[:40] for d in pics[:6]) if pics else ''))
    return '\n'.join(rows)


SCHEMA = {'type': 'OBJECT', 'properties': {
    'A': {'type': 'OBJECT', 'properties': {k: {'type': 'INTEGER'} for k in ('storyline', 'layout', 'pictures', 'wording', 'overall')},
          'required': ['storyline', 'layout', 'pictures', 'wording', 'overall']},
    'B': {'type': 'OBJECT', 'properties': {k: {'type': 'INTEGER'} for k in ('storyline', 'layout', 'pictures', 'wording', 'overall')},
          'required': ['storyline', 'layout', 'pictures', 'wording', 'overall']},
    'better': {'type': 'STRING', 'enum': ['A', 'B', 'tie']}, 'why': {'type': 'STRING'}},
    'required': ['A', 'B', 'better', 'why']}


def judge_one(rec, llm, seed, other=None):
    """other=None → the rebuilt deck vs the gold 샘플 버티컬 시나리오; other=<record of another run> → head-to-head (gold side = other)."""
    c = next(x for x in load()['scenarios'] if x['id'] == rec['id'])
    inp = G.gold_input(c)
    gold = G.gold_deck(c['id'])['parts'] if other is None else other['deck']
    mine = rec['deck']
    flip = random.Random(seed + zlib.crc32(rec['id'].encode()) % 1000).random() < 0.5
    A, B = (mine, gold) if flip else (gold, mine)
    req = '\n'.join([f"고객: {inp['customer']} · {inp['title']}", inp['free_text'][:600]] + [f"- {k['name']}: {' / '.join(k['reqs'])}" for k in inp['keymen']])
    prompt = f"""두 제안서 덱(A, B)을 같은 고객 요구에 대한 삼성전자 B2B 제안서로서 비교 평가하세요. 각 장은 레이아웃·보이는 문구·보이는 사진 설명으로 적었습니다.
평가 기준(1~5):
- storyline: 고객 요구에서 출발해 결정 요청까지 논리적으로 이어지는가, 파트 순서가 자연스러운가
- layout: 각 장의 레이아웃이 그 장의 내용·역할에 맞는가, 상황에 맞지 않는 장(예: 신규 매장에 야간 무중단 시공)이 없는가
- pictures: 사진이 그 칸의 맥락(이 고객의 업종·공간·제품)에 맞는가, 다른 업종 장소 사진이 없는가
- wording: 문구가 이 고객에게 구체적이고 다른 고객 이름이 섞이지 않았는가
- overall: 고객에게 낼 만한 완성도
주의: 숫자의 사실 여부는 판단하지 말고, [00] 같은 자리표시는 감점하지 않습니다(모르는 수치는 비워 두는 것이 맞음).
고객 요구:
{req}

=== 덱 A ===
{deck_text(A)}

=== 덱 B ===
{deck_text(B)}

JSON만: {{"A":{{...}},"B":{{...}},"better":"A|B|tie","why":"한두 문장(100자 이내)"}}"""
    d = llm.json(stage='judge', prompt=prompt, schema=SCHEMA, temperature=0.0, max_tokens=8192)  # Pro's thinking counts here
    mine_s, gold_s = (d['A'], d['B']) if flip else (d['B'], d['A'])
    better = d['better']
    verdict = 'tie' if better == 'tie' else ('mine' if (better == 'A') == flip else 'gold')
    return {'id': rec['id'], 'group': rec['group'], 'mine': mine_s, 'gold': gold_s, 'verdict': verdict, 'why': d.get('why')}


def _records(run: Path):
    return [json.load(open(p)) for p in sorted(run.glob('*.json')) if p.name != 'summary.json' and not p.name.startswith('judge')]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--run', required=True)
    ap.add_argument('--against', default='', help='another run dir: head-to-head instead of vs the gold deck')
    ap.add_argument('--judge-model', default=None)
    ap.add_argument('--only', default='')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--seed', type=int, default=7)
    args = ap.parse_args()
    run = Path(args.run)
    recs = _records(run)
    others = {r['id']: r for r in _records(Path(args.against))} if args.against else None
    if others is not None:
        recs = [r for r in recs if r['id'] in others]
    if args.only:
        want = set(args.only.split(','))
        recs = [r for r in recs if r['id'] in want]
    tag = f"judge_vs_{Path(args.against).name}" if args.against else 'judge'
    cache = run / f'{tag}_items'
    cache.mkdir(exist_ok=True)
    llm = GeminiJSON(model=args.judge_model)

    def one(r):
        f = cache / f"{r['id']}.json"
        if f.exists():
            return json.load(open(f))
        try:
            o = judge_one(r, llm, args.seed, others[r['id']] if others is not None else None)
        except Exception as e:  # noqa: BLE001 — one failed verdict does not lose the others
            print(f"✗ judge {r['id']}: {type(e).__name__}: {str(e)[:160]}", flush=True)
            return None
        f.write_text(json.dumps(o, ensure_ascii=False), encoding='utf-8')
        print(f"✓ judge {r['id']:<34} {o['verdict']}", flush=True)
        return o
    with ThreadPoolExecutor(max_workers=args.jobs) as ex:
        out = [o for o in ex.map(one, recs) if o]
    agg = {}
    for o in out:
        for g in (o['group'], 'ALL'):
            a = agg.setdefault(g, {'n': 0, 'mine_wins': 0, 'ties': 0, 'gold_wins': 0, 'mine': {}, 'gold': {}})
            a['n'] += 1
            a[{'mine': 'mine_wins', 'tie': 'ties', 'gold': 'gold_wins'}[o['verdict']]] += 1
            for side in ('mine', 'gold'):
                for k, v in o[side].items():
                    a[side][k] = a[side].get(k, 0) + v
    for a in agg.values():
        for side in ('mine', 'gold'):
            a[side] = {k: round(v / a['n'], 2) for k, v in a[side].items()}
    (run / f'{tag}.json').write_text(json.dumps({'judge_model': llm.model, 'against': args.against or 'gold', 'agg': agg, 'items': out},
                                               ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps(agg, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
