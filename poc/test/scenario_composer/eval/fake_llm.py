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
        # ---- composer.auto (레이아웃 자동 구성): a plan the code has to complete, the reference text, the first candidate
        if stage == 'auto_plan':
            ids = re.findall(r'^(P\d+) \[', prompt, re.M)
            able = [m.group(1) for m in re.finditer(r'^(P\d+) \[.*담을 수 있는 것: .*요구 답변', prompt, re.M)]
            out = {'thesis': 'offline thesis', 'storyline': 'offline storyline',
                   'parts': [{'id': i, 'message': f'offline message {i}', 'points': ['R1'] if able and i == able[0] else [], 'refs': [], 'products': [],
                              'solutions': [], 'cases': [], 'spaces': [], 'n_slides': 3} for i in ids]}
            if 'points' in props:
                en = props['points']['items']['properties']['id']['enum']
                out['points'] = [{'id': r, 'text': f'offline 요구 {r}', 'products': [], 'solutions': []} for r in en[:3]]
            if 'placement' in props:
                out['placement'] = []
            return out
        if stage in ('auto_text', 'auto_text_retry', 'auto_text_repair'):
            slides, cur = [], None
            for line in prompt.splitlines():
                m = re.match(r'\[s=(\d+)\]', line)
                if m:
                    cur = {'s': int(m.group(1)), 't': []}
                    slides.append(cur)
                    continue
                if cur is not None and line.strip().startswith('{"i":'):
                    x = json.loads(line.strip())
                    v = x['ref']
                    if x.get('prefix') and not v.startswith(x['prefix'].strip()):
                        v = x['prefix'] + v.split(' · ')[-1]
                    cur['t'].append({'i': x['i'], 'v': v})
            return {'slides': slides}
        if stage == 'auto_text_shorten':
            return {'items': [{'n': json.loads(line)['n'], 'text': json.loads(line)['text'][:json.loads(line)['max']]} for line in prompt.splitlines() if line.startswith('{"n":')]}
        if stage == 'auto_text_verify':  # the claim check: the plumbing-only model finds nothing wrong
            return {'items': [{'n': json.loads(line)['n'], 'ok': True} for line in prompt.splitlines() if line.startswith('{"n":')]}
        if stage == 'auto_image':
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
        if stage == 'auto_image_verify':
            return {'checks': [{'slot': m.group(1), 'reason': 'ok', 'better': 'none'} for m in re.finditer(r'^- 슬롯 (\d+:\w+)', prompt, re.M)]}
        raise ValueError(stage)
