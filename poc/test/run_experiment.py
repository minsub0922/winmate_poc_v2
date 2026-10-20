"""RFP TC 실험 실행기 — 조건(single / chunk_nocarry / chunk_carry) × TC × 조각 크기를 돌리고 결과를 저장한다.

예)
  python3 run_experiment.py --backend gemini                      # 전체(4건 + 통합 문서) × 3조건
  python3 run_experiment.py --backend gemini --tc TC5 --max-chars 1500 3000
  python3 run_experiment.py --backend replay                      # 기록된 Gemini 응답으로 네트워크 없이 재현
  python3 run_experiment.py --backend rules                       # LLM 없이 같은 파이프라인(기준선)
  python3 run_experiment.py --backend gemini --enrich             # + Tavily 로 인증 · 법 조항 출처 수집

결과: results/<run_id>/<TC>/<조건>/{result,winmate_form}.json · results/<run_id>/summary.{json,md} · results/LATEST.md
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import rfp_pipeline as rp  # noqa: E402

CONDS = ['single', 'chunk_nocarry', 'chunk_carry', 'chunk_carry_gap']


def make_backend(name: str, env: dict, cache_root: Path, rpm: int = 30):
    model = env.get('GEMINI_MODEL') or 'gemini-3.1-flash-lite'
    if name == 'gemini':
        return rp.GeminiBackend(env.get('GEMINI_API_KEY', ''), model, cache_root / model, rpm=rpm, base_url=env.get('GEMINI_BASE_URL', ''))
    if name == 'replay':
        return rp.ReplayBackend(model, cache_root / model)
    return rp.RulesBackend()


def run_one(tc: dict, cond: str, max_chars: int, backend, enrich_key: str = '', sources=None) -> dict:
    cfg = rp.RunConfig(condition=cond, max_chars=max_chars, enrich=bool(enrich_key))
    n0 = len(backend.calls)
    t0 = time.time()
    res = rp.run_pipeline(tc['input'], backend, cfg)
    if enrich_key:
        res.enrich = rp.enrich_terms(res.forms, enrich_key)
    sc = rp.score(res, tc, sources)
    calls = backend.calls[n0:]
    cost = {'calls': len(calls), 'cached': sum(c.cached for c in calls), 'prompt_tokens': sum(c.prompt_tokens for c in calls),
            'output_tokens': sum(c.output_tokens for c in calls), 'ms': int((time.time() - t0) * 1000),
            'errors': [c.error for c in calls if c.error]}
    return {'res': res, 'score': sc, 'cost': cost}


def save(dirp: Path, out: dict):
    """조건 하나의 결과: result.json(조각 · 원장 · 폼 · 추적 · 가드 · 점수 · 비용) + winmate_form.json(앱 입력 폼 모양)."""
    dirp.mkdir(parents=True, exist_ok=True)
    res = out['res']
    full = {'score': out['score'], 'cost': out['cost'], 'guards': res.guards, 'profile': res.profile, 'chunks': res.chunks,
            'trace': res.trace, 'forms': res.forms, 'items': res.items, 'enrich': res.enrich}
    (dirp / 'result.json').write_text(json.dumps(full, ensure_ascii=False, indent=1), encoding='utf-8')
    # Winmate 히스토리로 바로 넣어 볼 수 있는 모양(seeds_rfp.js 의 req.form 과 같은 필드)
    winmate = [{'project': f['project'], 'customer': f['customer'], 'target': f['target'], 'free': f['free'], 'note': f['note'],
                'keymen': [{'name': k['name'], 'weight': k['weight'], 'reqs': k['reqs']} for k in f['keymen']]} for f in res.forms]
    (dirp / 'winmate_form.json').write_text(json.dumps(winmate, ensure_ascii=False, indent=1), encoding='utf-8')


def row_of(tc_id, cond, mc, out):
    sc, g, c = out['score'], out['res'].guards, out['cost']
    unsup = sum(len(v) for v in g.get('unsupported_numbers', {}).values())
    return {'tc': tc_id, 'cond': cond, 'max_chars': mc, 'recall': sc['recall'],
            'recall_with_summary': round(sum(p['recall_with_summary'] for p in sc['per_project']) / max(1, len(sc['per_project'])), 3),
            'projects': f"{sc['projects_matched']}/{sc['projects_expected']}", 'misattributed': sc['misattributed'],
            'chunks': len(out['res'].chunks), 'items': g['items'], 'lines': sum(len(k['reqs']) for f in out['res'].forms for k in f['keymen']), 'grounded': g['grounded_rate'], 'unsupported_nums': unsup,
            'near_dups': g['near_duplicates'], 'calls': c['calls'], 'tokens': c['prompt_tokens'] + c['output_tokens'], 'ms': c['ms'],
            'missed': [m for p in sc['per_project'] for m in p['missed']][:12], 'errors': c['errors'][:2]}


def summary_md(meta: dict, rows: list) -> str:
    h = ['# RFP → 요구사항 실험 결과', '',
         f"- 실행: {meta['run_id']} · 백엔드 `{meta['backend']}` · 모델 `{meta.get('model', '-')}` · 프롬프트 {meta.get('prompt_version', '-')}",
         f"- 사용 가능한 키(.env.example 기준): {', '.join(k + ('=있음' if v else '=없음') for k, v in meta['keys'].items())}",
         f"- 조건: single(문서 통째로 1회) · chunk_nocarry(조각 독립) · chunk_carry(전역 맥락 + 원장 + 이월 메모 + 미해결 참조) · chunk_carry_gap(+ 빠진 원문 줄만 다시 묻는 갭 채우기)",
         '- recall: 정답 체크포인트 중 입력 폼(키맨 요구사항 · 사업명 · 고객사)에 들어간 비율 · +요약: 자유형식 요약 · 제작자 의견까지 포함',
         '- grounded: 항목 근거 인용이 원문에서 확인되는 비율 · unsup#: 출력 숫자 중 원문에 없는 것 · misattr: 다른 사업으로 잘못 들어간 체크포인트(통합 문서)', '',
         '| TC | 조건 | 조각 | recall | +요약 | 사업 | misattr | 항목 | 폼 줄 | grounded | unsup# | 중복 | 호출 | 토큰 | ms |',
         '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|']
    for r in rows:
        h.append(f"| {r['tc']} | {r['cond']}@{r['max_chars']} | {r['chunks']} | {r['recall']:.3f} | {r['recall_with_summary']:.3f} | {r['projects']} | {r['misattributed']} | {r['items']} | {r.get('lines', '-')} | {r['grounded']:.2f} | {r['unsupported_nums']} | {r['near_dups']} | {r['calls']} | {r['tokens']} | {r['ms']} |")
    h += ['', '## 놓친 체크포인트 (조건별 상위 12개)', '']
    for r in rows:
        if r['missed']:
            h.append(f"- **{r['tc']} · {r['cond']}@{r['max_chars']}**: " + ' / '.join(r['missed']))
        if r['errors']:
            h.append(f"  - 오류: {' / '.join(r['errors'])}")
    # 조건별 평균
    h += ['', '## 조건별 평균', '', '| 조건 | recall | +요약 | grounded | unsup# | misattr |', '|---|---|---|---|---|---|']
    keys = sorted({(r['cond'], r['max_chars']) for r in rows}, key=lambda x: (CONDS.index(x[0]) if x[0] in CONDS else 9, x[1]))
    for cond, mc in keys:
        rs = [r for r in rows if r['cond'] == cond and r['max_chars'] == mc]
        avg = lambda k: sum(r[k] for r in rs) / len(rs)  # noqa: E731
        h.append(f"| {cond}@{mc} | {avg('recall'):.3f} | {avg('recall_with_summary'):.3f} | {avg('grounded'):.2f} | {avg('unsupported_nums'):.1f} | {avg('misattributed'):.1f} |")
    return '\n'.join(h) + '\n'


def rescore(run_dir: Path, keys: dict):
    tcs = {t['id']: t for t in json.loads((HERE / 'tc' / 'rfp_tc.json').read_text(encoding='utf-8'))['tcs']}
    sources = {t['expected']['projects'][0]['key']: rp.norm(t['input']) for t in tcs.values() if t['kind'] == 'single'}
    old = json.loads((run_dir / 'summary.json').read_text(encoding='utf-8'))
    rows = []
    for r in old['rows']:
        f = run_dir / r['tc'] / f"{r['cond']}@{r['max_chars']}" / 'result.json'
        if not f.exists():
            rows.append(r)
            continue
        full = json.loads(f.read_text(encoding='utf-8'))
        res = rp.RunResult(full['profile'], full['chunks'], full['items'], full['forms'], full['trace'], full['guards'], full.get('enrich', []))
        full['score'] = rp.score(res, tcs[r['tc']], sources)
        f.write_text(json.dumps(full, ensure_ascii=False, indent=1), encoding='utf-8')
        rows.append(row_of(r['tc'], r['cond'], r['max_chars'], {'res': res, 'score': full['score'], 'cost': full['cost']}))
    meta = dict(old['meta'], keys=keys, rescored=time.strftime('%Y-%m-%d %H:%M'))
    (run_dir / 'summary.json').write_text(json.dumps({'meta': meta, 'rows': rows}, ensure_ascii=False, indent=1), encoding='utf-8')
    (run_dir / 'summary.md').write_text(summary_md(meta, rows), encoding='utf-8')
    print(f'rescored → {run_dir}')
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--backend', choices=['gemini', 'replay', 'rules'], default='gemini')
    ap.add_argument('--cond', nargs='*', default=CONDS)
    ap.add_argument('--tc', nargs='*', default=None)
    ap.add_argument('--max-chars', nargs='*', type=int, default=[3000])
    ap.add_argument('--enrich', action='store_true', help='Tavily 로 인증 · 법 조항 출처 수집(요구사항에는 섞지 않음)')
    ap.add_argument('--out', default=str(HERE / 'results'))
    ap.add_argument('--run-id', default=None)
    ap.add_argument('--rpm', type=int, default=30, help='분당 호출 상한(무료 등급이면 10~15 권장)')
    ap.add_argument('--rescore', default=None, help='LLM 호출 없이 저장된 results/<run_id> 의 폼을 지금 채점 기준으로 다시 채점')
    a = ap.parse_args(argv)

    env = rp.load_env()
    keys = rp.available_keys(env)
    if a.rescore:
        return rescore(Path(a.out) / a.rescore, keys)
    tcs = json.loads((HERE / 'tc' / 'rfp_tc.json').read_text(encoding='utf-8'))['tcs']
    sources = {t['expected']['projects'][0]['key']: rp.norm(t['input']) for t in tcs if t['kind'] == 'single'}
    if a.tc:
        tcs = [t for t in tcs if t['id'] in a.tc]
    out_root = Path(a.out)
    backend = make_backend(a.backend, env, out_root / 'cache', a.rpm)
    if a.backend == 'gemini':
        try:
            print(backend.preflight())
        except (rp.BackendError, OSError) as e:
            print(f'Gemini 사전 확인 실패 — {e}')
            raise SystemExit(2)
    run_id = a.run_id or time.strftime('%Y%m%d-%H%M%S') + '-' + a.backend
    run_dir = out_root / run_id
    meta = {'run_id': run_id, 'prompt_version': rp.PROMPT_VERSION, 'backend': a.backend, 'model': env.get('GEMINI_MODEL') if a.backend != 'rules' else 'rules', 'keys': keys,
            'conds': a.cond, 'max_chars': a.max_chars, 'tcs': [t['id'] for t in tcs]}
    print(f"[{run_id}] keys: {keys}")
    rows = []
    enrich_key = env.get('TAVILY_API_KEY', '') if a.enrich else ''
    for tc in tcs:
        for cond in a.cond:
            for mc in (a.max_chars if cond != 'single' else [len(tc['input'])]):
                tag = f'{cond}@{mc}'
                try:
                    out = run_one(tc, cond, mc, backend, enrich_key, sources)
                except rp.BackendError as e:
                    print(f'  {tc["id"]} {tag}: 실패 — {e}')
                    rows.append({'tc': tc['id'], 'cond': cond, 'max_chars': mc, 'recall': 0.0, 'recall_with_summary': 0.0, 'projects': '-', 'misattributed': 0,
                                 'chunks': 0, 'items': 0, 'grounded': 0.0, 'unsupported_nums': 0, 'near_dups': 0, 'calls': 0, 'tokens': 0, 'ms': 0,
                                 'missed': [], 'errors': [str(e)[:300]]})
                    continue
                save(run_dir / tc['id'] / tag, out)
                r = row_of(tc['id'], cond, mc, out)
                rows.append(r)
                print(f"  {tc['id']} {tag:<20} recall {r['recall']:.3f} (+요약 {r['recall_with_summary']:.3f}) 사업 {r['projects']} misattr {r['misattributed']} "
                      f"항목 {r['items']} grounded {r['grounded']:.2f} unsup {r['unsupported_nums']} 호출 {r['calls']} {r['ms']}ms")
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / 'summary.json').write_text(json.dumps({'meta': meta, 'rows': rows}, ensure_ascii=False, indent=1), encoding='utf-8')
    md = summary_md(meta, rows)
    (run_dir / 'summary.md').write_text(md, encoding='utf-8')
    (out_root / 'LATEST.md').write_text(md, encoding='utf-8')
    print(f'saved → {run_dir}')
    return rows


if __name__ == '__main__':
    main()
