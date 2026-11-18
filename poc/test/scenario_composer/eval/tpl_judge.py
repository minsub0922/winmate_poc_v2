"""Blind judges for the template-driven composer (a stronger model than the one that composes).

    python -m eval.tpl_judge --runs base180,a5 [--set small|full] [--only …] [--what story,pics] [--judge-model gemini-3.1-pro-preview]

story   pairwise, text only, random A/B order: the two decks for the same customer as outlines (part → slide → visible
        text). Scores 1–5 each: flow (does one part lead to the next) · no_repeat (the same content is not told twice) ·
        fit (answers *this* customer's requirements with what they linked) · wording (complete, natural, no leftovers).
pics    rendered slides (the layout HTML with the deck's texts and pictures, screenshot by headless Chrome) shown to a
        vision model, one deck at a time, system unknown: per slide pic_fit 1–5 (do the pictures fit the text next to
        them and the customer's business) and the number of pictures that are clearly wrong.

Results: runs/<run>/judge_story_vs_<other>.json · runs/<run>/judge_pics.json, and a table on stdout.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import random
import re
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zlib
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))

from composer.auto import CONF, slide_kind  # noqa: E402
from composer.fill import plain  # noqa: E402
from composer.library import DATA, ROOT, load  # noqa: E402
from eval.render import CSS, layout_html, resolve  # noqa: E402
from eval.tpl_cases import CASES, SMALL, build_cases  # noqa: E402
from eval.tpl_metrics import _texts  # noqa: E402

RUNS = HERE / 'runs'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
CACHE = Path(os.environ.get('WM_EVAL_CACHE') or (DATA / 'llm_cache_app')) / 'judge'


def _key() -> str:
    k = os.environ.get('GEMINI_API_KEY') or ''
    if not k:
        for line in open(ROOT / '.env', encoding='utf-8'):
            m = re.match(r'\s*GEMINI_API_KEY\s*=\s*(.*?)\s*$', line)
            if m:
                k = m.group(1).strip('"\'')
    return k


USAGE = {'calls': 0, 'cached': 0, 'in': 0, 'out': 0}


def gemini(model: str, prompt: str, schema: dict, images=(), max_tokens: int = 8000) -> dict:
    """one structured call (text + optional PNG/JPEG images), cached on disk. The key is never printed."""
    h = hashlib.sha256(json.dumps([model, prompt, schema, [hashlib.sha256(b).hexdigest() for _, b in images]], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    cp = CACHE / h[:2] / (h + '.json')
    if cp.exists():
        USAGE['cached'] += 1
        return json.loads(cp.read_text(encoding='utf-8'))
    parts = [{'text': prompt}] + [{'inline_data': {'mime_type': mt, 'data': base64.b64encode(b).decode()}} for mt, b in images]
    body = {'contents': [{'role': 'user', 'parts': parts}],
            'generationConfig': {'temperature': 0.1, 'responseMimeType': 'application/json', 'responseSchema': schema, 'maxOutputTokens': max_tokens}}
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'
    last = None
    for attempt in range(4):
        req = urllib.request.Request(url, data=json.dumps(body).encode(), method='POST', headers={'Content-Type': 'application/json', 'x-goog-api-key': _key()})
        try:
            with urllib.request.urlopen(req, timeout=240) as r:
                out = json.loads(r.read().decode())
            meta = out.get('usageMetadata') or {}
            USAGE['calls'] += 1
            USAGE['in'] += int(meta.get('promptTokenCount') or 0)
            USAGE['out'] += int(meta.get('candidatesTokenCount') or 0) + int(meta.get('thoughtsTokenCount') or 0)
            raw = ''.join(p.get('text', '') for p in ((out.get('candidates') or [{}])[0].get('content') or {}).get('parts') or [] if not p.get('thought'))
            data = json.loads(raw)
            cp.parent.mkdir(parents=True, exist_ok=True)
            cp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
            return data
        except urllib.error.HTTPError as e:
            last = f'http_{e.code}: {e.read().decode("utf-8", "ignore")[:200]}'
            if e.code not in (429, 500, 502, 503, 504):
                break
        except Exception as e:  # noqa: BLE001
            last = f'{type(e).__name__}: {str(e)[:200]}'
        time.sleep(3 * (attempt + 1))
    raise RuntimeError(f'judge call failed: {last}')


# ------------------------------------------------------------------------------------------------ story (pairwise text)
def outline(parts, limit=7) -> str:
    L = load()['layouts']
    rows = []
    foot = {}
    for p in parts:
        for x in p['layouts']:
            for i, v, st, mode in _texts(x):
                if mode == 'chrome':
                    foot[v] = foot.get(v, 0) + 1
    foot = {v for v, c in foot.items() if c >= 3}
    page = 0
    for p in parts:
        rows.append(f"## 파트: {p.get('name') or '(표지 · 목차)'}")
        for x in p['layouts']:
            page += 1
            if slide_kind(x['f']) in ('static',):
                rows.append(f"{page}. [고정 장] {L.get(x['f'], {}).get('name', x['f'])[:40]}")
                continue
            txt = [v for i, v, st, mode in _texts(x) if v and len(v) > 3 and mode != 'chrome' and v not in foot and not CONF.match(v)][:limit]
            rows.append(f"{page}. {L.get(x['f'], {}).get('name', x['f'])[:36]} — " + ' | '.join(t.replace('\n', ' ')[:70] for t in txt))
    return '\n'.join(rows)


DIM = ('flow', 'no_repeat', 'fit', 'wording', 'overall')
STORY_SCHEMA = {'type': 'OBJECT', 'properties': {
    **{side: {'type': 'OBJECT', 'properties': {k: {'type': 'INTEGER'} for k in DIM}, 'required': list(DIM)} for side in ('A', 'B')},
    'better': {'type': 'STRING', 'enum': ['A', 'B', 'tie']}, 'repeated_A': {'type': 'STRING'}, 'repeated_B': {'type': 'STRING'}, 'reason': {'type': 'STRING'}},
    'required': ['A', 'B', 'better', 'repeated_A', 'repeated_B', 'reason']}


def judge_story(case, deck_a, deck_b, model) -> dict:
    lib = load()
    ctx = case['body']['proposal']['ctx']
    names = (', '.join(lib['products_all'][p]['name'] for p in ctx['products'] if p in lib['products_all']) + ' / ' + ', '.join(lib['solutions'][s]['name'] for s in ctx['solutions'] if s in lib['solutions'])
             + ' / 사례: ' + ', '.join(str(lib['cases'][c]['cust']) for c in ctx['cases'] if c in lib['cases']))
    inp = case['input']
    reqs = ' / '.join(r for k in inp.get('keymen') or [] for r in k['reqs'])
    prompt = f"""당신은 B2B 제안서 심사자입니다. 같은 고객 · 같은 목차 템플릿으로 만든 제안서 두 벌(A, B)의 개요를 보고 채점합니다. 어느 쪽을 어떤 시스템이 만들었는지는 모릅니다.

[고객] {inp['customer']} — {inp['title']}
상황: {inp['free_text'][:900]}
고객 요구: {reqs[:900]}
고객이 연결한 제품 / 솔루션 / 사례: {names}

채점 (1~5, 5가 가장 좋음)
- flow: 파트가 앞에서 뒤로 자연스럽게 이어지는가(문제 → 제안 → 공간/제품 → 근거 → 마무리), 각 파트가 자기 역할을 하는가.
- no_repeat: 같은 내용(같은 문장 · 같은 요구에 대한 같은 답 · 같은 제품 설명)이 여러 파트에 되풀이되지 않는가. 되풀이가 많을수록 낮은 점수.
- fit: 이 고객의 요구에 구체적으로 답하는가. 고객이 연결한 제품 · 솔루션 · 사례로 채워졌는가(연결하지 않은 제품 · 다른 업종 내용 · 다른 고객 이름이 남아 있으면 감점).
- wording: 문장이 완결되고 자연스러운가(잘린 문장, 뜻 없는 자리표시 [00] 남발, 견본 안내문, 한자 섞임은 감점). 수치를 모를 때 [00] 를 몇 개 두는 것은 감점하지 않습니다.
- overall: 영업 담당자가 그대로 고객에게 가져갈 수 있는 정도.
repeated_A / repeated_B 에는 각 덱에서 되풀이된 내용의 예를 한 줄로(없으면 빈 문자열). better 는 A · B · tie. reason 은 두세 문장.

=== 제안서 A ===
{outline(deck_a)}

=== 제안서 B ===
{outline(deck_b)}
JSON만 답하세요."""
    return gemini(model, prompt, STORY_SCHEMA)


# ------------------------------------------------------------------------------------------------ pics (rendered slides)
def pick_slides(parts, n=8):
    """slides whose pictures the system had to get right (photo or product slots outside the fixed pages), spread over the deck."""
    L = load()['layouts']
    cand = []
    page = 0
    for p in parts:
        for x in p['layouts']:
            page += 1
            lay = L.get(x['f'])
            if not lay or slide_kind(x['f']) in ('static', 'toc', 'unknown', 'dss'):
                continue
            slots = [im for im in lay['images'] if (im.get('kind') or '') not in ('icon', 'logo', 'plan')]
            if not slots or len(slots) > 8:
                continue
            cand.append((page, p, x))
    if len(cand) <= n:
        return cand
    step = len(cand) / n
    return [cand[int(i * step)] for i in range(n)]


APPLY = """
for (const el of document.querySelectorAll('img[data-fill]')) { const u = FILL[el.getAttribute('data-fill')]; if (u) el.src = u; }
for (const [i, v] of Object.entries(T)) for (const el of document.querySelectorAll('[data-tb="' + i + '"]')) { if (!el.hasAttribute('data-img')) el.innerText = v; }
for (const [k, v] of Object.entries(IMG)) for (const el of document.querySelectorAll('[data-img="' + k + '"]')) {
  const im = el.tagName === 'IMG' ? el : el.querySelector('img');
  if (v.hidden) { if (im) im.style.visibility = 'hidden'; continue; }
  if (!v.src) continue;
  if (im) { im.src = v.src; im.style.objectFit = v.fit; }
  else { el.innerHTML = ''; const n = document.createElement('img'); n.src = v.src; n.style.cssText = 'display:block;width:100%;height:100%;object-fit:' + v.fit; el.appendChild(n); }
}
"""


def slide_html(x) -> str:
    """one slide as the app draws it: the layout HTML, then the deck's text / picture overrides applied in the page (no lxml needed)."""
    raw = layout_html(x['f'])
    fill = {m: resolve(m) for m in set(re.findall(r'data-fill="([^"]+)"', raw))}
    t = {str(k): plain(v) for k, v in (x['ov'].get('t') or {}).items()}
    img = {}
    for k, v in (x['ov'].get('img') or {}).items():
        if isinstance(v, dict) and v.get('hidden'):
            img[str(k)] = {'hidden': True}
        elif isinstance(v, dict) and v.get('src'):
            img[str(k)] = {'src': resolve(v['src']) or v['src'], 'fit': v.get('fit') or 'cover'}
    return (f'<!DOCTYPE html><html><head><meta charset="utf-8"><style>{CSS} body{{background:#fff}} .slide{{box-shadow:none}}</style></head><body>'
            f'<div class="slide">{raw}</div><script>const FILL={json.dumps(fill)};const T={json.dumps(t, ensure_ascii=False)};const IMG={json.dumps(img)};{APPLY}</script></body></html>')


def shoot(x, page, out: Path) -> bool:
    html = slide_html(x)
    with tempfile.NamedTemporaryFile('w', suffix='.html', delete=False, encoding='utf-8') as f:
        f.write(html)
        tmp = f.name
    try:
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=0.75', '--window-size=1280,720',
                        '--virtual-time-budget=3000', f'--screenshot={out}', 'file://' + tmp], check=True, timeout=90, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:  # noqa: BLE001
        return False
    finally:
        os.unlink(tmp)
    return out.exists() and out.stat().st_size > 2000


PIC_SCHEMA = {'type': 'OBJECT', 'properties': {'slides': {'type': 'ARRAY', 'items': {'type': 'OBJECT', 'properties': {
    'n': {'type': 'INTEGER'}, 'pic_fit': {'type': 'INTEGER'}, 'wrong': {'type': 'INTEGER'}, 'text_ok': {'type': 'INTEGER'}, 'issue': {'type': 'STRING'}},
    'required': ['n', 'pic_fit', 'wrong', 'text_ok', 'issue']}}}, 'required': ['slides']}


def judge_pics(case, parts, run: str, model: str, n=8) -> dict:
    lib = load()
    inp = case['input']
    ctx = case['body']['proposal']['ctx']
    names = ', '.join(lib['products_all'][p]['name'] for p in ctx['products'] if p in lib['products_all'])
    shots_dir = RUNS / run / 'shots' / case['id']
    shots_dir.mkdir(parents=True, exist_ok=True)
    picked = pick_slides(parts, n)
    images, rows = [], []
    for k, (page, p, x) in enumerate(picked, 1):
        out = shots_dir / f'{page:02d}_{x["f"]}.png'
        if not out.exists() and not shoot(x, page, out):
            continue
        images.append(('image/png', out.read_bytes()))
        rows.append((len(images), page, p.get('name') or '', x['f']))
    if not images:
        return {'slides': [], 'n': 0}
    prompt = f"""당신은 B2B 제안서의 장표를 검수합니다. 아래 이미지 {len(images)}장은 한 제안서의 장표입니다(순서대로 1번부터).
[고객] {inp['customer']} — {inp['title']} · 업종: {case['body']['template']['vertical_name']}
고객이 연결한 제품: {names}
장표마다 채점합니다.
- pic_fit (1~5): 장표에 들어간 사진 · 제품 그림이 바로 옆 문구(제목 · 캡션)와 이 고객의 업종에 맞는가. 5 = 모든 그림이 문구가 말하는 공간 · 제품 그대로, 4 = 대체로 맞음, 3 = 무난하지만 일반적, 2 = 어색한 그림이 있음, 1 = 다른 업종 · 다른 공간 · 다른 제품 · 다른 회사 간판처럼 명백히 틀린 그림이 있음. 빈 그림 칸은 틀린 그림으로 세지 않지만 4점 이하.
- wrong: 명백히 틀린 그림의 수(다른 업종 장소, 문구와 다른 제품, 문구와 다른 공간, 다른 회사 간판이 주인공인 사진).
  배경 없는 공식 제품 컷은 그 제품이 문구의 제품과 같으면 맞는 그림입니다 — 제품 화면 속 데모 영상(풍경 · 모델 등)은 문제 삼지 않습니다. '고객사 로고' 자리는 그림으로 세지 않습니다.
- text_ok (1~5): 글이 칸에 맞게 들어갔는가(넘침 · 잘림 · 견본 문구 · 뜻 없는 자리표시가 없을수록 높음).
- issue: 가장 큰 문제 한 줄(없으면 빈 문자열).
JSON만: {{"slides":[{{"n":1,"pic_fit":4,"wrong":0,"text_ok":5,"issue":""}}]}} — 모든 장표를 n 순서로."""
    d = gemini(model, prompt, PIC_SCHEMA, images)
    by = {s['n']: s for s in d.get('slides') or [] if isinstance(s, dict)}
    out = []
    for n_, page, pname, f in rows:
        s = by.get(n_)
        if s:
            out.append({'page': page, 'part': pname, 'f': f, **{k: s.get(k) for k in ('pic_fit', 'wrong', 'text_ok', 'issue')}})
    return {'slides': out, 'n': len(out)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--runs', required=True, help='baseline,candidate (story is judged pairwise in this order; pics for each)')
    ap.add_argument('--set', default='small', choices=['small', 'full'])
    ap.add_argument('--only', default='')
    ap.add_argument('--what', default='story,pics')
    ap.add_argument('--judge-model', default=os.environ.get('JUDGE_MODEL') or 'gemini-3.1-pro-preview')
    ap.add_argument('--slides', type=int, default=8)
    args = ap.parse_args()
    names = args.runs.split(',')
    only = args.only.split(',') if args.only else (SMALL if args.set == 'small' else [c['id'] for c in CASES])
    cases = {c['id']: c for c in build_cases(only)}
    decks = {n: {cid: json.load(open(RUNS / n / f'{cid}.json', encoding='utf-8'))['parts'] for cid in cases if (RUNS / n / f'{cid}.json').exists()} for n in names}
    what = args.what.split(',')
    if 'story' in what and len(names) == 2:
        a, b = names
        both = [cid for cid in cases if cid in decks[a] and cid in decks[b]]

        def one(cid):
            flip = zlib.crc32(cid.encode()) % 2 == 1  # the candidate is A for half of the cases
            da, db = (decks[b][cid], decks[a][cid]) if flip else (decks[a][cid], decks[b][cid])
            d = judge_story(cases[cid], da, db, args.judge_model)
            sa, sb = (d['B'], d['A']) if flip else (d['A'], d['B'])
            better = {'A': b if flip else a, 'B': a if flip else b, 'tie': 'tie'}[d['better']]
            return {'id': cid, a: sa, b: sb, 'better': better, 'reason': d.get('reason'), f'repeated_{a}': d.get('repeated_B' if flip else 'repeated_A'),
                    f'repeated_{b}': d.get('repeated_A' if flip else 'repeated_B')}
        with ThreadPoolExecutor(max_workers=3) as ex:
            res = list(ex.map(one, both))
        (RUNS / b / f'judge_story_vs_{a}.json').write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'\n== story (pairwise, n={len(res)}) — judge {args.judge_model}')
        print('| | ' + ' | '.join(DIM) + ' | wins |\n|---|' + '---|' * (len(DIM) + 1))
        for n in (a, b):
            print(f'| {n} | ' + ' | '.join(str(round(statistics.mean(r[n][k] for r in res), 2)) for k in DIM) + f" | {sum(1 for r in res if r['better'] == n)} |")
        print('ties', sum(1 for r in res if r['better'] == 'tie'))
        for r in res:
            print(f"- {r['id']}: better={r['better']} · {(r['reason'] or '')[:260]}")
    if 'pics' in what:
        print(f'\n== pictures on rendered slides — judge {args.judge_model}')
        print('| run | decks | slides | pic_fit | slides with a wrong picture | wrong pictures / slide | text_ok |\n|---|---|---|---|---|---|---|')
        for n in names:
            def one(cid, n=n):
                return {'id': cid, **judge_pics(cases[cid], decks[n][cid], n, args.judge_model, args.slides)}
            with ThreadPoolExecutor(max_workers=2) as ex:
                res = list(ex.map(one, list(decks[n])))
            (RUNS / n / 'judge_pics.json').write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding='utf-8')
            sl = [s for r in res for s in r['slides'] if isinstance(s.get('pic_fit'), int)]
            if sl:
                print(f"| {n} | {len(res)} | {len(sl)} | {round(statistics.mean(s['pic_fit'] for s in sl), 2)} | {round(sum(1 for s in sl if (s.get('wrong') or 0) > 0) / len(sl), 3)} | "
                      f"{round(sum((s.get('wrong') or 0) for s in sl) / len(sl), 3)} | {round(statistics.mean(s['text_ok'] for s in sl), 2)} |")
    print('judge usage', USAGE)


if __name__ == '__main__':
    main()
