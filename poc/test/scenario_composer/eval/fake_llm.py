"""Plumbing-only stand-in for Gemini (never reported as a result): echoes the first allowed option / the reference text."""
from __future__ import annotations

import json
import re


class FakeLLM:
    model = 'offline-echo'
    available = True

    def __init__(self) -> None:
        self.usage = {'calls': 0, 'by_stage': {}}

    def json(self, *, stage, prompt, schema, system='', temperature=0.2, validate=None, max_tokens=8192, seed=None):
        self.usage['calls'] += 1
        self.usage['by_stage'][stage] = self.usage['by_stage'].get(stage, 0) + 1
        props = schema.get('properties', {})
        if stage == 'analyze':
            ind = re.search(r'업종은 고객이 정한 (\w+)', prompt)
            return {'industry': ind.group(1) if ind else props['industry']['enum'][0], 'req_type': 'new', 'strategy': 'value', 'ending': 'workshop',
                    'spaces': [], 'needs': [], 'reason': 'offline'}
        if stage == 'storyline':
            base = props['base']['enum'][0]
            return {'base': base, 'plan': [m for m in props['plan']['items']['enum'] if m.startswith(base + '#')], 'reason': 'offline'}
        if stage == 'part_names':
            parts = [{'idx': int(m.group(1)), 'name': m.group(3)[:20], 'items': [m.group(3)[:30], m.group(2)]}
                     for m in re.finditer(r'^(\d+)\. \[(\w+)\] (.+?) — 목표', prompt, re.M)]
            return {'thesis': 'offline', 'parts': parts}
        if stage == 'match_modules':
            picks, cur = [], None
            for line in prompt.splitlines():
                m = re.match(r'파트 (\d+):', line)
                if m:
                    cur = int(m.group(1))
                    continue
                m = re.match(r'\s+- (\S+?):', line)
                if m and cur is not None:
                    picks.append({'part': cur, 'mid': m.group(1)})
                    cur = None
            return {'picks': picks}
        if stage == 'fill_text':
            slides, cur = [], None
            for line in prompt.splitlines():
                m = re.match(r'\[s=(\d+)\]', line)
                if m:
                    cur = {'s': int(m.group(1)), 't': []}
                    slides.append(cur)
                    continue
                if cur is not None and line.strip().startswith('{"i":'):
                    x = json.loads(line.strip())
                    cur['t'].append({'i': x['i'], 'v': x['ref']})
            return {'slides': slides}
        if stage == 'fill_image':
            picks, cur = [], None
            for line in prompt.splitlines():
                m = re.match(r'- 슬롯 (\d+:\w+)', line)
                if m:
                    cur = m.group(1)
                    continue
                m = re.match(r'\s{4}(\S+) :: ', line)
                if m and cur:
                    picks.append({'slot': cur, 'src': m.group(1)})
                    cur = None
            return {'picks': picks}
        raise ValueError(stage)
