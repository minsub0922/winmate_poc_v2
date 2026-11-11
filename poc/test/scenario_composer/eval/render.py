"""Render composed (or gold) decks to a self-contained HTML page — the slides exactly as the app would draw them
(layout HTML + ov.t text overrides + ov.img pictures), with packed pictures resolved to data URLs.

    python -m eval.render runs/<name>/<id>.json [--gold] [--out file.html] [--png dir]
"""
from __future__ import annotations

import argparse
import base64
import gzip
import html as _html
import json
import mimetypes
import re
import sys
from pathlib import Path
from typing import Dict, List

from lxml import html as LH

HERE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(HERE))
from composer.library import KB, ROOT, load  # noqa: E402
from composer.fill import plain  # noqa: E402

_PACKS: Dict[str, List[str]] = {}
_HTML: Dict[str, str] = {}


def layout_html(f: str) -> str:
    if not _HTML:
        _HTML.update(json.load(gzip.open(KB / 'layout_html.json.gz')))
    return _HTML.get(f, '')


def resolve(src: str) -> str:
    if not src:
        return ''
    if src.startswith('data:'):
        return src
    m = re.match(r'(.+\.json)#(\d+)$', src)
    if m:
        pack = m.group(1).lstrip('/')
        if pack not in _PACKS:
            for base in (ROOT, ROOT / 'reference' / 'live'):
                p = base / pack
                if p.exists():
                    _PACKS[pack] = json.load(open(p))['images']
                    break
            else:
                _PACKS[pack] = []
        arr = _PACKS[pack]
        i = int(m.group(2))
        return arr[i] if i < len(arr) else ''
    rel = src.lstrip('/')
    for base in (ROOT, ROOT / 'reference' / 'live', ROOT / 'app' / 'web' / 'public'):
        p = base / rel
        if p.exists() and p.is_file():
            mt = mimetypes.guess_type(str(p))[0] or 'image/jpeg'
            return f'data:{mt};base64,' + base64.b64encode(p.read_bytes()).decode()
    return ''


def render_slide(slide: dict, page: int = 0) -> str:
    raw = layout_html(slide['f'])
    if not raw:
        return f'<div class="missing">{slide["f"]}</div>'
    root = LH.fragment_fromstring(raw, create_parent='div')
    # the layout's own sample pictures (packed) — hydrate like the app
    for el in root.xpath('.//img[@data-fill]'):
        u = resolve(el.get('data-fill'))
        if u:
            el.set('src', u)
    for i, v in (slide.get('t') or {}).items():
        for el in root.xpath(f'.//*[@data-tb="{i}"]'):
            txt = plain(v)
            for ch in list(el):
                el.remove(ch)
            el.text = txt
    for k, v in (slide.get('img') or {}).items():
        if not isinstance(v, dict) or not v.get('src'):
            continue
        sel = f'.//*[@data-tb="{k[1:]}"]' if re.fullmatch(r't\d+', k) else f'.//*[@data-img="{k}"]'
        u = resolve(v['src'])
        for el in root.xpath(sel):
            fit = v.get('fit') or 'cover'
            pos = v.get('pos') or '50% 50%'
            if el.tag == 'img':
                el.set('src', u)
                el.set('style', (el.get('style') or '') + f';object-fit:{fit}')
                continue
            inner = el.xpath('.//img')
            if inner and v.get('keep', True):
                inner[0].set('src', u)
                st = re.sub(r'object-fit:\s*\w+;?', '', inner[0].get('style') or '')
                inner[0].set('style', st + f';object-fit:{fit};object-position:{pos}')
                continue
            for ch in list(el):
                el.remove(ch)
            el.text = None
            img = LH.Element('img')
            img.set('src', u)
            img.set('style', f'display:block;width:100%;height:100%;object-fit:{fit};object-position:{pos}')
            el.append(img)
    for el in root.xpath('.//*[@data-tb]'):
        if re.fullmatch(r'CONFIDENTIAL · \d+', (el.text_content() or '').strip()) and page:
            el.text = f'CONFIDENTIAL · {page}'
    inner = ''.join(LH.tostring(ch, encoding='unicode') for ch in root)
    return inner


CSS = """body{margin:0;background:#e9ecf2;font-family:'Noto Sans CJK KR','Noto Sans KR',sans-serif}
.deck{padding:24px;display:flex;flex-direction:column;gap:28px;align-items:center}
.part{width:1280px;font:700 18px sans-serif;color:#1428a0;margin-top:12px}
.meta{width:1280px;font:13px/1.5 monospace;color:#444;white-space:pre-wrap}
.slide{width:1280px;height:720px;position:relative;overflow:hidden;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.15)}
.slide>div{width:1280px;height:720px}
.cap{width:1280px;font:12px monospace;color:#666}"""


def render_deck(deck: List[dict], title: str = '', meta: str = '') -> str:
    out = [f'<!DOCTYPE html><html><head><meta charset="utf-8"><title>{_html.escape(title)}</title><style>{CSS}</style></head><body><div class="deck">',
           f'<div class="part">{_html.escape(title)}</div>', f'<div class="meta">{_html.escape(meta)}</div>']
    page = 0
    for p in deck:
        out.append(f'<div class="part">▶ {_html.escape(p.get("name") or "")} <small>[{p.get("type")}] {_html.escape(" / ".join(p.get("items") or []))}</small></div>')
        for s in p.get('slides') or []:
            page += 1
            L = load()['layouts'].get(s['f'], {})
            cap = f'{page}. {s["f"]} · {L.get("name", "")} · from {s.get("ex") or "-"} {("· " + ", ".join(s.get("adapt") or [])) if s.get("adapt") else ""}'
            out.append(f'<div class="cap">{_html.escape(cap)}</div><div class="slide">{render_slide(s, page)}</div>')
    out.append('</div></body></html>')
    return '\n'.join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('run')
    ap.add_argument('--gold', action='store_true')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()
    r = json.load(open(args.run))
    if args.gold:
        from eval.gold import gold_deck
        deck = gold_deck(r['id'])['parts']
        title = f"GOLD {r['id']}"
    else:
        deck = r['deck']
        title = f"{r['id']} — composed"
    meta = json.dumps({k: r.get(k) for k in ('analysis', 'storyline', 'thesis')}, ensure_ascii=False, indent=1)[:3000] if not args.gold else ''
    out = Path(args.out or str(Path(args.run).with_suffix('')) + ('.gold.html' if args.gold else '.html'))
    out.write_text(render_deck(deck, title, meta), encoding='utf-8')
    print(out)


if __name__ == '__main__':
    main()
