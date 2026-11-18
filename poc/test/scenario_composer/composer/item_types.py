"""What a product looks like in a photo — the visual types the vision check (scripts/identify_items.py) sorts both sides into.

A photo's product is compared only with catalog products of its own visual type (a round 360 cassette with 360 cassettes, a drum
washer with drum washers). The type comes from what can be told apart in a photo (shape · mounting · form factor), not from the
catalog's sales categories: a 4Way cassette is sold under 3 categories, a menu board is an LCD signage of any line.

``TYPES``  code → (label shown to the vision model, family)
``of_product(p)`` the type of a catalog row ('' — not a thing one sees in a room: a controller · an accessory · a service · a solution)
"""
from __future__ import annotations

import re
from typing import Dict, Tuple

TYPES: Dict[str, Tuple[str, str]] = {
    # display
    'sign': ('LCD 사이니지 · 메뉴보드(벽걸이 · 천장 · 스탠드형 일반 화면)', 'display'),
    'vwall': ('비디오월(얇은 베젤 화면 여러 장을 격자로 이어 붙임)', 'display'),
    'led': ('실내 LED 화면 · The Wall(모듈을 이어 만든 대형 화면)', 'display'),
    'outdoor': ('옥외 사이니지 · 옥외 LED(건물 밖 · 드라이브스루 스탠드)', 'display'),
    'window': ('윈도 사이니지(유리창 안쪽에서 밖을 향한 화면)', 'display'),
    'kiosk': ('키오스크(세로형 터치 주문 · 결제 단말)', 'display'),
    'board': ('전자칠판(교실 · 회의실 터치 보드)', 'display'),
    'epaper': ('이페이퍼(전자종이 가격표 · 안내판)', 'display'),
    'tv': ('TV(거실 · 호텔 객실 · 병실의 TV)', 'display'),
    'monitor': ('모니터(책상 위 PC 모니터)', 'display'),
    'cinema': ('영화관 LED 스크린', 'display'),
    # hvac
    'c360': ('원형 천장형 에어컨(360 카세트)', 'hvac'),
    'c4way': ('사각 천장형 에어컨(4방향 카세트)', 'hvac'),
    'c1way': ('슬림 천장형 에어컨(1 · 2방향 카세트)', 'hvac'),
    'duct': ('천장 매립 덕트 · 실링형(천장에 그릴 · 슬롯만 보임)', 'hvac'),
    'stand': ('스탠드형 에어컨(바닥에 세우는 에어컨)', 'hvac'),
    'wall_ac': ('벽걸이 에어컨', 'hvac'),
    'outunit': ('실외기(옥상 · 외벽 · 기계실의 실외기)', 'hvac'),
    'chiller': ('칠러 · 냉동기 · 대형 공조기(기계실 설비)', 'hvac'),
    'purifier': ('공기청정기', 'hvac'),
    'vent': ('환기 · 전열교환기', 'hvac'),
    'heatpump': ('히트펌프 보일러 · 급탕 유닛', 'hvac'),
    'cold': ('업소용 냉장 · 냉동 설비(쇼케이스 · 저장고 · 유닛 쿨러)', 'appliance'),
    # appliance
    'washer': ('세탁기(가정용 드럼 · 통돌이)', 'appliance'),
    'dryer': ('건조기', 'appliance'),
    'combo': ('세탁 · 건조 일체형(콤보 · 원바디)', 'appliance'),
    'laundry': ('상업용 세탁기 · 건조기(빨래방 · 세탁실에 여러 대)', 'appliance'),
    'airdresser': ('의류관리기(에어드레서)', 'appliance'),
    'fridge': ('냉장고', 'appliance'),
    'kimchi': ('김치냉장고', 'appliance'),
    'dishwasher': ('식기세척기', 'appliance'),
    'cooktop': ('인덕션 · 전기레인지', 'appliance'),
    'oven': ('오븐 · 전자레인지', 'appliance'),
    'water': ('정수기', 'appliance'),
    'vacuum': ('청소기', 'appliance'),
    'hood': ('주방 후드', 'appliance'),
    # mobile
    'tablet': ('태블릿', 'mobile'),
    'phone': ('스마트폰', 'mobile'),
    'laptop': ('노트북', 'mobile'),
    'watch': ('스마트워치', 'mobile'),
    # other
    'speaker': ('스피커 · 음향 기기', ''),
    'printer': ('프린터 · 복합기', ''),
    'light': ('조명', ''),
}

# the catalog rows nobody sees as an object in a room — controllers, parts, services, software (by category, then by name)
_HIDDEN_CAT = re.compile(r'제어기|액세서리|케어서비스|세척서비스|시스템에어컨 솔루션|사이니지 솔루션|TV/음향 솔루션|빌딩통합솔루션|설치솔루션|주방가전 액세서리|'
                         r'마운트|배관|분기관|판넬|Kit', re.I)
_HIDDEN_NAME = re.compile(r'^(?:무선|유선)?\s*리모컨|중계기|게이트웨이|제어기|센서|키트|Kit\b|^(?:[^ ]+ )?판넬|패널$|분기관|조인트|헤더|연결관|필터|Drain|데코 ?커버|'
                          r'자재|SmartThings|b\.IoT|MagicINFO|VXT|LYNK|링크 클라우드|Wi-Fi ?Kit|Converter|수신기|Actuator|밸브류|댐퍼|토너|카트리지|드럼 유닛|'
                          r'버즈|Buds|헤드폰|이어폰|TOUR ONE|LIVE \d|XR\b|저장고 도어', re.I)
_RULES = {  # family → [(type, pattern over 'name · cat · sc')] — first hit wins
    '디스플레이': [('cinema', r'시네마|Onyx'), ('epaper', r'이페이퍼|E ?Paper|EM\d{2}'), ('kiosk', r'키오스크|Kiosk'), ('board', r'전자칠판|Flip|WA[DF]'),
                ('window', r'윈도 사이니지|창문형|OM\d{2}'), ('outdoor', r'옥외|실외 LED|OH\d{2}'), ('vwall', r'비디오월|VM\d{2}|VHHX|VMHX|VH\d{2}'),
                ('led', r'LED 사이니지|The Wall|실내용 LED|실내 스마트 LED|Micro LED|IEA|IWA|IWC|IAC'), ('monitor', r'모니터|뷰피니티|오디세이'),
                ('sign', r'사이니지|QM\d{2}|QB\d{2}|QH\d{2}|단독형 UHD|메뉴보드'),
                ('tv', r'TV|더 프레임|The Frame|Neo QLED|QLED|OLED|UHD|Premiere|무빙스타일|Movingstyle|MICRO RGB|Full HD|HD \(')],
    '공조 · 에어컨': [('c360', r'360'), ('c4way', r'4 ?Way'), ('c1way', r'[12] ?Way'), ('duct', r'덕트|실링|매립'),
                  ('stand', r'스탠드|Q9000|상업용 에어컨|중대형|\bPAC\b|항온항습|무풍 ?콤보|에어 ?콤보|무풍 클래식|갤러리'), ('wall_ac', r'벽걸이|윈도우핏'),
                  ('chiller', r'칠러|Chiller|냉동기|냉온수기|냉각탑|OTT[XC]|AHU|공조기|FCU'), ('purifier', r'공기청정|블루스카이'), ('vent', r'환기|전열교환|ERV'),
                  ('heatpump', r'히트펌프|EHS|보일러'), ('cold', r'쇼케이스|콜드체인|저장고|유닛 ?쿨러|콘덴싱|아르네|부성|업소용 냉장'),
                  ('outunit', r'실외기|DVM|실내외기|시스템에어컨|대형건물용|GHP|바닥상치')],
    '주방 · 리빙 가전': [('laundry', r'상업용 세탁|Commercial Laundry|코인'), ('combo', r'콤보|원바디|세탁기/건조기'), ('dryer', r'건조기'),
                    ('washer', r'세탁기'), ('airdresser', r'에어드레서'), ('kimchi', r'김치'), ('fridge', r'냉장고|냉동고|와인셀러|키친핏'),
                    ('dishwasher', r'식기세척기'), ('cooktop', r'인덕션|전기레인지|쿡탑'), ('oven', r'오븐|전자레인지|큐커'), ('water', r'정수기'),
                    ('vacuum', r'청소기|스팀'), ('hood', r'후드'), ('purifier', r'공기청정|제습기')],
    '모바일 · PC': [('tablet', r'탭|Tab|태블릿'), ('watch', r'워치|Watch'), ('laptop', r'북|Book|노트북'), ('phone', r'갤럭시|Galaxy|폰|엑스커버')],
    '오디오': [('speaker', r'.')], '프린팅': [('printer', r'.')], '조명': [('light', r'.')],
}
_COMPILED = {fam: [(t, re.compile(pat, re.I)) for t, pat in rules] for fam, rules in _RULES.items()}


def of_product(p: dict) -> str:
    cat = ' · '.join(str(p.get(k) or '') for k in ('cat', 'sc'))
    name = str(p.get('name') or '')
    if _HIDDEN_CAT.search(cat) or _HIDDEN_NAME.search(name):
        return ''
    text = f'{name} · {cat}'
    for t, rx in _COMPILED.get(p.get('fam') or '', ()):
        if rx.search(text):
            return t
    return ''
