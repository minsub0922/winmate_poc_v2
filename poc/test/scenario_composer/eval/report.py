"""Compare runs on the same decks: metrics (mean over the decks every run finished) + blind-judge results.

    python -m eval.report --runs gold,base,base-ho,r1,r2 [--set base|all] [--out runs/REPORT_TABLES.md]

--set base  → the 38 decks the baseline also ran (20 frontier · 10 vertical · 5 standard · 3 account — bs21 · bs22 · 예전 표준 20종은 2026-11-12 삭제, 표준은 새 bs_std_<버티컬>로 대체)
--set all   → every deck each run finished
Failures (a run that produced no deck) are counted per run, not averaged away.
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
from eval.run_eval import RUNS  # noqa: E402

BASE_SET = ('bs01,bs02,bs03,bs04,bs05,bs06,bs07,bs08,bs09,bs10,bs11,bs12,bs13,bs14,bs15,bs16,bs17,bs18,bs19,bs20,'
            'bs_v_ai_store_1,bs_v_smart_hotel_2,bs_v_smart_office_1,bs_v_smart_hospital_2,bs_v_smart_school_1,bs_v_smart_factory_2,'
            'bs_v_smart_finance_1,bs_v_smart_retail_2,bs_v_smart_public_1,bs_v_entertainment_2,bs_std_ht_large,bs_std_rt_small,'
            'bs_std_of_sme,bs_std_md_hospital,bs_std_ed_k12,bs_account_inspire,bs_account_paulbassett,bs_account_episode').split(',')
ROWS = [('스토리라인', 'type_lcs', '파트 순서 유사도(정답 대비, 0~1)'),
        ('', 'slides', '장 수'), ('', 'slides_gold', '정답 장 수'), ('', 'req_ok', '상황(요구 유형) 판정 일치율'),
        ('레이아웃', 'layout_recall', '정답 레이아웃 재현율'), ('', 'layout_violation_rate', '부적합 레이아웃 비율(다른 업종 변형 · 미선택 솔루션 · 빈 제품 칸 · 중복)'),
        ('', 'lay_dup', '중복 레이아웃 수'),
        ('사진', 'img_fill_rate', '사진 칸 채움률(빈 칸은 레이아웃 견본 사진이 그대로 보임)'),
        ('', 'img_ok_rate', '사진 적합률(다른 업종 장소 · 다른 제품 · 종류 불일치 제외)'), ('', 'img_ok_rate_b', '사진 적합률 + 타사 간판·외관 오용 제외'),
        ('', 'img_unset', '빈 사진 칸(견본 사진 노출)'), ('', 'img_place_mismatch', '다른 업종 장소 사진'), ('', 'img_prod_mismatch', '고르지 않은 제품 사진'),
        ('', 'img_brand_misuse', '타사 간판·외관 사진(사례 파트 밖)'), ('', 'img_dup', '같은 사진 반복'),
        ('문구', 'txt_leak', '다른 고객 이름 노출'), ('', 'txt_unsupported_numbers', '근거 없는 수치'), ('', 'txt_placeholders', '자리표시 [00]')]


def rescore(r: dict) -> dict:
    """metrics recomputed with the current metric code (runs made on another machine / an older kit stay comparable)."""
    from composer.library import load
    from eval import gold as G
    from eval.metrics import score
    c = next(x for x in load()['scenarios'] if x['id'] == r['id'])
    inp = G.gold_input(c)
    gold = G.gold_deck(c['id'])
    deck = gold['parts'] if r.get('_gold') else r['deck']
    return score(deck, inp, gold, r.get('analysis'))


def load_run(name: str, fresh: bool = True):
    d = RUNS / name
    recs = {}
    for p in sorted(d.glob('*.json')):
        if p.name == 'summary.json' or p.name.startswith('judge'):
            continue
        r = json.load(open(p, encoding='utf-8'))
        if fresh:
            r['metrics'] = rescore(r)
        m = r['metrics']
        m['img_fill_rate'] = round(m['img_set'] / m['img_slots'], 3) if m.get('img_slots') else None
        recs[r['id']] = r
    summ = json.load(open(d / 'summary.json', encoding='utf-8')) if (d / 'summary.json').exists() else {}
    errs = {e['id']: e['error'] for e in summ.get('errors') or []}
    judges = {}
    for p in d.glob('judge*.json'):
        judges[p.stem] = json.load(open(p, encoding='utf-8'))
    return recs, errs, judges


def mean(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return round(statistics.mean(xs), 3) if xs else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--runs', default='gold,base,base-ho,r1,r2')
    ap.add_argument('--set', default='base', help="base (the baseline's 40) · all · run:<name> (the decks that run finished)")
    ap.add_argument('--out', default='')
    args = ap.parse_args()
    names = [n for n in args.runs.split(',') if (RUNS / n).exists()]
    data = {n: load_run(n) for n in names}
    if args.set.startswith('run:'):
        ref = args.set[4:]
        want = [i for i in BASE_SET if i in data[ref][0]] + sorted(i for i in data[ref][0] if i not in BASE_SET)
        title = f'{ref} 가 완성한 {len(want)}개 덱'
    elif args.set == 'base':
        want, title = BASE_SET, 'Layout Agent 와 같은 40개 덱'
    else:
        want, title = sorted({i for n in names for i in data[n][0]}), '각 실행의 전체 덱'
    lines = [f"# 실험 결과 비교 ({title})", '']
    lines.append('| 구분 | 지표 | ' + ' | '.join(names) + ' |')
    lines.append('|---|---|' + '---|' * len(names))
    done = {n: [i for i in want if i in data[n][0]] for n in names}
    fail = {n: [i for i in want if i in data[n][1] and i not in data[n][0]] for n in names}
    lines.append('| 실행 | 완성 / 실패 | ' + ' | '.join(f"{len(done[n])} / {len(fail[n])}" for n in names) + ' |')
    for grp, k, label in ROWS:
        vals = [mean([data[n][0][i]['metrics'].get(k) for i in done[n]]) for n in names]
        lines.append(f'| {grp} | {label} | ' + ' | '.join('' if v is None else str(v) for v in vals) + ' |')
    # per-group type_lcs
    lines += ['', '## 그룹별 스토리라인 유사도(type_lcs) · 사진 적합률', '', '| 그룹 | ' + ' | '.join(names) + ' |', '|---|' + '---|' * len(names)]
    for g in ('bs', 'vertical', 'std', 'account'):
        cells = []
        for n in names:
            ids = [i for i in done[n] if data[n][0][i]['group'] == g]
            cells.append(f"{mean([data[n][0][i]['metrics'].get('type_lcs') for i in ids])} · {mean([data[n][0][i]['metrics'].get('img_ok_rate_b') or data[n][0][i]['metrics'].get('img_ok_rate') for i in ids])} (n={len(ids)})")
        lines.append(f'| {g} | ' + ' | '.join(cells) + ' |')
    # judges
    lines += ['', '## 블라인드 심사 (Gemini Pro, A/B 순서 무작위)', '']
    for n in names:
        for tag, j in sorted(data[n][2].items()):
            items = [o for o in j.get('items') or [] if o['id'] in want]
            if not items:
                continue
            other = j.get('against') or 'gold'
            other = Path(other).name if other != 'gold' else '정답(샘플 버티컬 시나리오)'
            w = sum(1 for o in items if o['verdict'] == 'mine')
            t = sum(1 for o in items if o['verdict'] == 'tie')
            l_ = sum(1 for o in items if o['verdict'] == 'gold')
            sc = {side: {k: mean([o[side].get(k) for o in items]) for k in ('storyline', 'layout', 'pictures', 'wording', 'overall')} for side in ('mine', 'gold')}
            lines.append(f"- **{n} vs {other}** (n={len(items)}): {n} 우세 {w} · 무승부 {t} · {other} 우세 {l_}  ")
            lines.append(f"  점수(1~5) {n}: " + ' · '.join(f"{k} {v}" for k, v in sc['mine'].items()) + f"  /  {other}: " + ' · '.join(f"{k} {v}" for k, v in sc['gold'].items()))
    md = '\n'.join(lines)
    if args.out:
        Path(args.out).write_text(md + '\n', encoding='utf-8')
    print(md)


if __name__ == '__main__':
    main()
