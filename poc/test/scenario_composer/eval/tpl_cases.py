"""Template-driven eval set for 레이아웃 자동 구성 (``composer.auto``).

A case = one customer (requirements + linked 제품 · 솔루션 · 사례, taken from a 샘플 버티컬 시나리오's customer input — the deck
itself is held out), one 목차 템플릿 for the customer's vertical, optionally a 공간 구성. The template slides come from the
app's own code (``scripts/export_templates.mjs`` → toc_templates.js ``ensureTocScenario``), i.e. exactly what the
Storyboard is pre-seeded with.

    from eval.tpl_cases import build_cases
    cases = build_cases()            # [{id, hold, proposal, body}] — body is the ``compose`` step ``auto`` request
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Dict, List, Optional

from composer.library import DATA, HERE, load
from composer.textsim import overlap
from eval import gold as G

# id · customer input (샘플 버티컬 시나리오) · 템플릿 · 버티컬 · 공간 구성 여부 · 조감도 이미지 여부
CASES = [
    {'id': 'cafe_std', 'bs': 'bs01', 'tid': 'std', 'vid': 'fb_cafe', 'spaces': True, 'bird': False},
    {'id': 'mart_std', 'bs': 'bs15', 'tid': 'std', 'vid': 'rt_hyper', 'spaces': True, 'bird': True},
    {'id': 'hotel_pain', 'bs': 'bs07', 'tid': 'pain', 'vid': 'ht_large', 'spaces': False, 'bird': False},
    {'id': 'office_space', 'bs': 'bs02', 'tid': 'space', 'vid': 'of_hq', 'spaces': True, 'bird': False},
    {'id': 'univ_build', 'bs': 'bs03', 'tid': 'build', 'vid': 'ed_univ', 'spaces': True, 'bird': False},
    {'id': 'golf_roi', 'bs': 'bs13', 'tid': 'roi', 'vid': 'sv_screen', 'spaces': False, 'bird': False},
    {'id': 'ltc_stdx', 'bs': 'bs08', 'tid': 'stdx', 'vid': 'md_ltc', 'spaces': True, 'bird': False},
    {'id': 'agency_rfp', 'bs': 'bs11', 'tid': 'rfp', 'vid': 'pb_agency', 'spaces': False, 'bird': False},
]
SMALL = ['cafe_std', 'mart_std', 'hotel_pain']
# customers typed in by hand (not derived from a sample scenario) — the browser runs of 2026-11-13 that exposed template leftovers:
# a single product with no solution and no case · a competitive hotel deck · a café ROI deck whose template talks about energy
CUSTOM = {
    'flip_prod': {'tid': 'prod', 'vid': 'md_hospital', 'spaces': False, 'bird': False, 'input': {
        'id': 'flip_prod', 'title': 'C 대학병원 · 제품 제안서', 'customer': 'C 대학병원', 'ind': 'MD', 'target': '', 'note': '', 'date': '2026. 11. 13',
        'free_text': 'C 대학병원 컨퍼런스룸 12곳에 전자칠판 도입을 계획 중이며, 의료 영상 판독 회의용 필기 및 화면 공유 기능의 안정성을 확보해야 합니다. '
                     '이미 제품이 선정된 상태이므로, 도입 효과와 사양, 유사 병원 사례를 중심으로 제안이 필요합니다.',
        'keymen': [{'name': '의료정보팀장', 'weight': 60, 'reqs': ['판독 회의에서 필기와 화면 공유가 끊기지 않을 것', '컨퍼런스룸 12곳 동일 사양']},
                   {'name': '구매팀', 'weight': 40, 'reqs': ['유사 병원 도입 사례', '사양 근거']}],
        'products': ['flip'], 'solutions': [], 'cases': []}},
    'hotel_compete': {'tid': 'compete', 'vid': 'ht_mid', 'spaces': False, 'bird': False, 'input': {
        'id': 'hotel_compete', 'title': 'B 호텔 · 경쟁 비교 제안서', 'customer': 'B 호텔', 'ind': 'HT', 'target': '', 'note': '', 'date': '2026. 11. 13',
        'free_text': 'B 호텔은 8년 이상 사용 중인 객실 TV 420대와 로비 사이니지 교체를 검토 중이며, 경쟁사 L사 견적과 동일 조건으로 비교 평가할 예정입니다. '
                     '총소유비용, 관리 편의, 사후 서비스를 핵심 평가 기준으로 삼고 있습니다.',
        'keymen': [{'name': '총지배인', 'weight': 50, 'reqs': ['경쟁사 견적과 같은 조건으로 비교', '5년 총소유비용']},
                   {'name': '시설팀장', 'weight': 50, 'reqs': ['객실 TV 원격 관리 편의', '사후 서비스 대응 시간']}],
        'products': ['qm55c', 'hoteltv', 'hoteltv43'], 'solutions': ['lynk'], 'cases': []}},
    'cafe_roi': {'tid': 'roi', 'vid': 'fb_cafe', 'spaces': False, 'bird': False, 'input': {
        'id': 'cafe_roi', 'title': '새 제안서', 'customer': 'A 커피', 'ind': 'FB', 'target': '', 'note': '', 'date': '2026. 11. 13',
        'free_text': 'A 커피는 전국 320개 매장의 종이 메뉴판을 디지털로 전환하며, 본사 일괄 관리와 시즌 프로모션 노출을 목표로 합니다. '
                     '상반기 50개 매장 시범 운영 후 확산하는 계획 하에, 인건비 및 인쇄비 절감 효과를 정량적으로 입증해야 합니다.',
        'keymen': [{'name': '마케팅 본부장', 'weight': 50, 'reqs': ['본사에서 메뉴 · 가격 일괄 관리', '유리창 시즌 프로모션 노출']},
                   {'name': '재무팀', 'weight': 50, 'reqs': ['인쇄비 · 인건비 절감 효과를 숫자로', '50개 매장 시범 후 확산']}],
        'products': ['qm55c', 'window'], 'solutions': ['magicinfo', 'vxt'], 'cases': []}},
}
FAM_CATS = {'디스플레이': ('lcd_', 'led_', 'vwall', 'btv', 'g_kiosk', 'iwb', 'epaper', 'htv', 'tv', 'spatial', 'g_cinema', 'mon'),
            '공조 · 에어컨': ('sac_', 'ac', 'air', 'erv', 'vent'), '주방 · 리빙 가전': ('ref_', 'wash', 'airdresser', 'dish', 'oven', 'cook', 'vac'),
            '모바일 · PC': ('tab', 'phone', 'g_rugged', 'watch', 'book', 'mon', 'pc'), '오디오': ('harman', 'audio'), '프린팅': ('print', 'mfp')}


def template_decks(pairs: List[tuple]) -> Dict[str, dict]:
    """(template id, vertical id) → the template scenario as parts with their slides (cached under the data dir)."""
    cache = DATA / 'tpl_decks.json'
    have: Dict[str, dict] = json.load(open(cache, encoding='utf-8')) if cache.exists() else {}
    miss = [f'{t}:{v}' for t, v in pairs if f'{t}:{v}' not in have]
    if miss:
        tmp = DATA / 'tpl_decks.tmp.json'
        subprocess.run(['node', str(HERE / 'scripts' / 'export_templates.mjs'), str(tmp), ','.join(miss)], check=True, cwd=str(HERE), timeout=300,
                       stdout=subprocess.DEVNULL)
        d = json.load(open(tmp, encoding='utf-8'))
        for dk in d['decks']:
            have[f"{dk['tid']}:{dk['vid']}"] = dk
        have['_templates'] = {t['id']: t for t in d['templates']}
        have['_verticals'] = {v['id']: v for v in d['verticals']}
        cache.write_text(json.dumps(have, ensure_ascii=False), encoding='utf-8')
        tmp.unlink()
    return have


def derive_space_plan(vid: str, products: List[str], bird: bool) -> dict:
    """a 공간 구성 a person could have built: the vertical's spaces, each linked product in the one or two spaces that fit it."""
    lib = load()
    V = lib['verticals'][vid]
    PA = lib['products_all']
    place: Dict[str, List[str]] = {}
    for pid in products:
        p = PA.get(pid)
        if not p:
            continue
        pre = FAM_CATS.get(p.get('fam') or '', ())
        words = ' '.join(map(str, (p.get('spaces') or []) + [p.get('cat') or '', p.get('name') or '']))
        scored = sorted(V['spaces'], key=lambda s: -(2.0 * any(c.startswith(pre) for c in s['cats']) + 3.0 * overlap(words, s['name']) - 0.3 * len(place.get(s['id'], []))))
        for s in scored[:2 if len(products) <= 3 else 1]:
            place.setdefault(s['id'], []).append(pid)
    spaces = [{'id': s['id'], 'name': s['name'], 'products': place.get(s['id'], [])} for s in V['spaces'] if place.get(s['id'])]
    # a person usually keeps a neighbouring space or two in the plan even before deciding its products
    for s in V['spaces']:
        if len(spaces) >= 3:
            break
        if not place.get(s['id']):
            spaces.append({'id': s['id'], 'name': s['name'], 'products': []})
    order = {s['id']: i for i, s in enumerate(V['spaces'])}
    spaces.sort(key=lambda s: order[s['id']])
    plan = {'vertical': {'id': vid, 'name': V['name']}, 'spaces': spaces}
    if bird:
        plan['birdseye'] = {'status': 'done', 'image': f'/api/spatial/previews/eval-{vid}.png'}
    return plan


def to_payload(inp: dict, board: List[dict]) -> dict:
    """composer input → the app's storyboardPayload shape (what the frontend sends as ``proposal``)."""
    t = lambda x: [{'t': x}]
    return {'id': inp['id'], 'title': inp['title'], 'customer': inp['customer'], 'ind': inp['ind'],
            'req': {'free': t(inp['free_text']), 'form': {'project': inp['title'], 'customer': inp['customer'], 'target': inp.get('target') or '', 'note': inp.get('note') or '',
                                                          'keymen': [{'name': k['name'], 'weight': k['weight'], 'reqs': [t(r) for r in k['reqs']]} for k in inp.get('keymen') or []]},
                    'files': []},
            'ctx': {'products': inp['products'], 'solutions': inp['solutions'], 'cases': inp['cases']}, 'parts': board}


def build_cases(only: Optional[List[str]] = None) -> List[dict]:
    lib = load()
    rows = [c for c in CASES if not only or c['id'] in only] + [{'id': k, 'bs': None, **v} for k, v in CUSTOM.items() if only and k in only]
    decks = template_decks([(c['tid'], c['vid']) for c in rows])
    cards = {c['id']: c for c in lib['scenarios']}
    out = []
    for c in rows:
        inp = dict(c['input']) if c.get('input') else G.gold_input(cards[c['bs']])
        dk = decks[f"{c['tid']}:{c['vid']}"]
        T = decks['_templates'][c['tid']]
        V = decks['_verticals'][c['vid']]
        parts, board = [], []
        for i, p in enumerate(dk['parts']):
            pid = f's_{c["id"]}_{i}'
            parts.append({'id': pid, 'type': p['type'], 'name': p['name'], 'toc': p['toc'], 'goal': p['goal'], 'items': p['items'], 'src': None, 'deck': p['deck'],
                          'exemplar': [{'f': x['f'], 'role': x['role'], 't': x['t'], 'img': x['img']} for x in p['exemplar']]})
            board.append({'id': pid, 'type': p['type'], 'name': p['name'], 'items': p['items'], 'deck': p['deck'],
                          'layouts': [{'f': x['f'], 'ov': {'t': x['t']}} for x in p['exemplar']]})
        sp = derive_space_plan(c['vid'], inp['products'], c['bird']) if c['spaces'] else None
        body = {'kind': 'compose', 'step': 'auto', 'proposal': to_payload(inp, board), 'requirement_context': None,
                'template': {'id': T['id'], 'name': T['name'], 'desc': T['desc'], 'vertical': c['vid'], 'vertical_name': V.get('full') or V.get('nm') or ''},
                'parts': parts, 'space_plan': sp, 'used_layouts': []}
        out.append({'id': c['id'], 'bs': c['bs'], 'tid': c['tid'], 'vid': c['vid'], 'hold': [c['bs']] if c['bs'] else [], 'input': inp, 'std_sid': dk['sid'], 'body': body})
    return out
