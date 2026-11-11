"""Layout HTML → editable slots (stdlib only).

Text slots are the elements with ``data-tb`` (value = index), image slots the elements with ``data-img``.
The parser keeps what the composer needs to adapt a slide without seeing it:

- text slot: index, ``data-type-role`` (title · body · label · heading · metric …), the layout's own sample text,
  font size (px, when inline) and box width — used for the length budget of a rewritten value.
- image slot: index, ``data-kind`` (space · cut · ui …), hint/label, box size, ``object-fit`` of the inner picture
  and the layout's own sample picture (``data-fill`` pack address + ``alt``) — the sample is a second exemplar
  of what the slot is for.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Dict, List, Optional

VOID = {'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'param', 'track'}
_PX = re.compile(r'(?:^|;)\s*(width|height|font-size)\s*:\s*([0-9.]+)px', re.I)
_FIT = re.compile(r'object-fit\s*:\s*(contain|cover|fill|none|scale-down)', re.I)


def _style(st: str) -> Dict[str, float]:
    out: Dict[str, float] = {}
    for k, v in _PX.findall(st or ''):
        out.setdefault(k.lower(), float(v))
    return out


class _Parser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: List[dict] = []
        self.texts: Dict[int, dict] = {}
        self.images: Dict[int, dict] = {}
        self.static: List[str] = []  # text outside every data-tb (fixed layout wording)
        self.seq = 0                   # document order of slots (captions follow their picture)

    # ------------------------------------------------------------------ helpers
    def _open_tb(self) -> Optional[dict]:
        for e in reversed(self.stack):
            if e.get('tb') is not None:
                return e
        return None

    def _open_img(self) -> Optional[dict]:
        for e in reversed(self.stack):
            if e.get('img') is not None:
                return e
        return None

    # ------------------------------------------------------------------ events
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        st = a.get('style') or ''
        node = {'tag': tag}
        if 'data-tb' in a and re.fullmatch(r'\d+', a['data-tb'] or ''):
            i = int(a['data-tb'])
            node['tb'] = i
            sz = _style(st)
            self.seq += 1
            self.texts.setdefault(i, {'i': i, 'o': self.seq, 'role': a.get('data-type-role') or '', 'text': [], 'font': sz.get('font-size'),
                                      'w': sz.get('width'), 'h': sz.get('height'), 'shape': a.get('data-layout-shape') or '',
                                      'img': 'data-img' in a})
        if 'data-img' in a and re.fullmatch(r'\d+', a['data-img'] or ''):
            i = int(a['data-img'])
            node['img'] = i
            sz = _style(st)
            self.seq += 1
            self.images.setdefault(i, {'i': i, 'o': self.seq, 'kind': a.get('data-kind') or '', 'hint': a.get('data-hint') or a.get('data-label') or '',
                                       'w': sz.get('width'), 'h': sz.get('height'), 'fit': '', 'sample': '', 'alt': '',
                                       'pid': a.get('data-pid') or '', 'tb': int(a['data-tb']) if re.fullmatch(r'\d+', a.get('data-tb') or '') else None})
            if tag == 'img':
                self._img_inner(self.images[i], a)
        elif tag == 'img':
            owner = self._open_img()
            if owner is not None:
                self._img_inner(self.images[owner['img']], a)
        if tag not in VOID:
            self.stack.append(node)

    def _img_inner(self, rec: dict, a: dict) -> None:
        m = _FIT.search(a.get('style') or '')
        if m and not rec['fit']:
            rec['fit'] = m.group(1).lower()
        if not rec['sample']:
            rec['sample'] = a.get('data-fill') or ('' if (a.get('src') or '').startswith('data:') else (a.get('src') or ''))
        if not rec['alt']:
            rec['alt'] = a.get('alt') or ''

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        for j in range(len(self.stack) - 1, -1, -1):
            if self.stack[j]['tag'] == tag:
                del self.stack[j:]
                return

    def handle_data(self, data):
        if not data.strip():
            return
        tb = self._open_tb()
        if tb is not None:
            self.texts[tb['tb']]['text'].append(data)
        elif self._open_img() is None:
            self.static.append(data.strip())


def parse(html: str) -> dict:
    p = _Parser()
    p.feed(html or '')
    p.close()
    texts = []
    for i in sorted(p.texts):
        t = p.texts[i]
        s = re.sub(r'\s+', ' ', ''.join(t['text'])).strip()
        texts.append({**{k: v for k, v in t.items() if k != 'text'}, 'text': s})
    images = [p.images[i] for i in sorted(p.images)]
    static = [s for s in (re.sub(r'\s+', ' ', x) for x in p.static) if s]
    return {'texts': texts, 'images': images, 'static': static}
