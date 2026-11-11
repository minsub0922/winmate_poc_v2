# -*- coding: utf-8 -*-
"""공간별 제안 장의 '대표 제품'과 그 아래 한 문장(그 공간에서 하는 일)을 함께 고른다.

vertical_space_product.json 의 공간 제품 목록과 vertical_space_solution.json 의 공간 시나리오는 따로 쓰였으므로,
제품을 먼저 정하고 문장을 따로 고르면 '호텔 TV' 장 아래에 '공기청정기를 자동으로 가동합니다'가 붙는 식으로 어긋난다.
여기서는 시나리오 문장이 실제로 가리키는 기기를 읽어(named), 그 기기를 대표 제품으로 고르고 그 문장을 함께 쓴다.
맞는 문장이 하나도 없는 공간만 제품을 기준으로 쓴 문장(ROLE)으로 채운다.
"""
import re
import prod

# 문장 속 기기 이름 — 구체적인 것부터 찾고 찾은 자리는 지워서('비즈니스 TV'의 'TV'를 두 번 세지 않게) 뒤의 일반 이름과 겹치지 않게 한다
DEV = [
    ('light', r'LED\s?조명|조명'),
    ('htv', r'호텔\s?TV|객실 TV|호실 TV|병실 TV'),
    ('btv', r'비즈니스\s?TV'),
    ('tv', r'TV'),
    ('epaper', r'E-?Paper|이페이퍼'),
    ('vwall', r'비디오\s?월'),
    ('cinema', r'시네마'),
    ('led', r'LED|The Wall|전광판|리본보드|미디어\s?파사드'),
    ('kmode', r'키오스크 모드'),          # 태블릿을 키오스크 모드로 고정 — 키오스크 기기가 아니다
    ('kiosk', r'키오스크'),
    ('tab', r'갤럭시 탭|태블릿|탭 POS'),
    ('phone', r'스마트폰|휴대폰|업무폰|폰'),
    ('watch', r'워치'),
    ('nb', r'노트북|갤럭시 북'),
    ('mon', r'모니터(?!링)'),
    ('iwb', r'전자칠판|판서'),
    ('xr', r'XR|헤드셋'),
    ('signage', r'사이니지|메뉴보드|메뉴판|디지털 캔버스'),
    ('ehs', r'급탕|온수|히트펌프|바닥난방'),
    ('cold', r'쇼케이스|콘덴싱|저온|콜드체인'),
    ('sac', r'냉난방|에어컨|냉방|난방|공조|실내기|실외기|칠러|냉동기|중앙 제어기|DVM'),
    ('ref', r'냉장고|냉장|식자재|식재료'),
    ('air', r'공기청정|미세먼지'),
    ('vent', r'환기|전열교환'),
    ('airdresser', r'에어드레서|슈드레서'),
    ('laundry', r'세탁기|건조기|세탁'),
    ('dish', r'식기세척'),
    ('kitchen', r'인덕션|오븐|전자레인지|후드'),
    ('print', r'출력|복합기|프린터|인쇄'),
    ('audio', r'오디오|스피커|음향|JBL|하만'),
    ('water', r'정수'),
    # 기기 이름이 아닌 일반 낱말 — 약한 근거로만 쓴다
    ('dash', r'대시보드|맵뷰'),
    ('screen', r'화면|띄우|띄운|송출|재생|편성'),
    ('device', r'단말'),
    ('appliance', r'가전'),
    ('temp', r'온도|쾌적'),
]
# 제품 → 그 제품을 가리키는 기기 이름
CLS = {
    'epaper': {'epaper'}, 'vwall': {'vwall'}, 'led_in': {'led'}, 'led_out': {'led'}, 'g_cinema': {'cinema', 'led'},
    'htv': {'htv', 'tv'}, 'tv': {'tv'}, 'btv': {'btv', 'tv', 'signage'}, 'lcd_std': {'signage'}, 'lcd_out': {'signage'},
    'lcd_win': {'signage'}, 'spatial': {'signage'}, 'iwb': {'iwb'}, 'xr': {'xr'},
    'g_kiosk': {'kiosk'}, 'tab': {'tab', 'kmode'}, 'g_rugged': {'tab', 'kmode'}, 'phone': {'phone'}, 'watch': {'watch'},
    'nb': {'nb'}, 'mon': {'mon'},
    'sac_l_in': {'sac'}, 'sac_l_out': {'sac'}, 'sac_sm': {'sac'}, 'sac_res': {'sac'}, 'sac_ctr': {'sac'}, 'ac': {'sac'},
    'sac_ehs': {'ehs'}, 'sac_vent': {'vent'}, 'sac_cold': {'cold'},
    'ref_comm': {'ref'}, 'ref_home': {'ref'}, 'ref_bi': {'ref'}, 'kimchi': {'ref'},
    'laundry_b2b': {'laundry'}, 'wash': {'laundry'}, 'dry': {'laundry'}, 'airdresser': {'airdresser'}, 'air': {'air'},
    'range': {'kitchen'}, 'oven': {'kitchen'}, 'mw': {'kitchen'}, 'hood': {'kitchen', 'vent'}, 'dish': {'dish'},
    'dmfp': {'print'}, 'mfp': {'print'}, 'harman': {'audio'}, 'light': {'light'}, 'water': {'water'},
}
DISPLAY = {'iwb', 'epaper', 'vwall', 'led_in', 'led_out', 'g_cinema', 'htv', 'tv', 'btv', 'lcd_std', 'lcd_out', 'lcd_win', 'spatial'}
DISPLAY_NAMED = {'htv', 'btv', 'tv', 'epaper', 'vwall', 'cinema', 'led', 'kiosk', 'tab', 'iwb', 'mon', 'xr'}
MOBILE = {'tab', 'phone', 'g_rugged', 'nb', 'watch'}
KITCHEN = {'ref_comm', 'ref_home', 'ref_bi', 'kimchi', 'dish', 'range', 'oven', 'mw', 'hood', 'water'}
KITCHEN_SPACE = r'주방|급식|식당|키친|탕비|스낵|팬트리|친교실|F&B|푸드|매점|조리'
HVAC = {'sac_l_in', 'sac_l_out', 'sac_sm', 'sac_res', 'sac_ctr', 'ac', 'sac_ehs'}
OUTDOOR = r'실외|옥외|외벽|외부|야외|파사드|광장|정류장|게이트'
MEETING = r'회의|미팅|세미나|교육|강의|교실|스터디'
# 그냥 '사이니지 · 화면'이라고만 한 문장은 스마트 사이니지 · 비즈니스 TV가 맡고, 창문형 · 옥외 · 3D는 문장이 그 자리를 말할 때만
SIGN_CTX = {'lcd_win': r'쇼윈도|창문|창가|윈도', 'lcd_out': OUTDOOR, 'spatial': r'3D|입체|스페이셜'}


def named(s):
    out = set()
    for cls, pat in DEV:
        if re.search(pat, s):
            out.add(cls)
            s = re.sub(pat, ' ', s)
    return out


def level(c, scene, space=''):
    """2 = 문장이 이 제품의 기기를 말한다 · 1 = 일반 낱말(화면 · 단말 · 가전 · 온도)로 이 제품을 가리킬 수 있다 · 0 = 아니다"""
    n = named(scene)
    own = CLS.get(c, set())
    if c in ('led_in', 'led_out') and 'led' in n:
        return 2 if bool(re.search(OUTDOOR, scene)) == (c == 'led_out') else 1
    if own & n - {'signage', 'screen'}: return 2
    if c in MOBILE and 'device' in n and not n & {'tab', 'phone', 'nb', 'watch', 'kmode'}: return 1
    if c in KITCHEN and 'appliance' in n and re.search(KITCHEN_SPACE, space): return 1
    if c in HVAC and 'temp' in n: return 1
    if c == 'vwall' and 'dash' in n and not (n & DISPLAY_NAMED) - own: return 1
    if c in DISPLAY and c not in ('htv', 'tv'):   # TV는 이름(TV)으로 말할 때만 — '화면'만으로는 객실 · 병실 TV를 뜻하지 않는다
        if (n & DISPLAY_NAMED) - own: return 0
        if n & {'signage', 'screen'}:
            ok = c not in SIGN_CTX or re.search(SIGN_CTX[c], scene)
            # '사이니지 · 메뉴보드'라고 말하면 사이니지, 그냥 '화면'이면 회의 · 수업 공간이 아닐 때만 사이니지로 본다
            if 'signage' in own and ok and ('signage' in n or not re.search(MEETING, space)): return 2
            return 1
    return 0


def ranked(sp):
    """공간 이름이 바라는 제품(prod.CONTEXT)과 나머지(대표성 순)"""
    cats = [c for c in sp['products'] if c in prod.P]
    pref = []
    for pat, lst in prod.CONTEXT:
        if re.search(pat, sp['name']):
            pref = [c for c in lst if c in cats]
            if pref: break
    rest = sorted([c for c in cats if c not in pref], key=lambda c: -prod.PRI.get(c, 0))
    return pref, rest


def pick(sp, solutions, used):
    """(대표 제품, 그 제품이 나오는 시나리오 문장 또는 None) — 문장이 기기 이름으로 말하는 제품을 먼저(공간 이름이 바라는
    제품 → 대표성 순, 앞 공간에서 쓴 제품은 뒤로), 없으면 일반 낱말(화면 · 단말 · 가전 · 온도)로 가리키는 제품."""
    pref, rest = ranked(sp)
    best = {}
    for c in pref + rest:
        lv, sc = 0, None
        for s in solutions:
            L = level(c, s['scenario'], sp['name'])
            if L > lv: lv, sc = L, s['scenario']
        best[c] = (lv, sc)
    passes = [(pref, True, (2,)), (rest, True, (2,)), (pref + rest, False, (2,)), (pref, True, (1,)), (rest, True, (1,)), (pref + rest, False, (1,))]
    for cands, fresh, levels in passes:
        for c in cands:
            if (not fresh or c not in used) and best[c][0] in levels:
                return c, best[c][1]
    c = next((c for c in pref + rest if c not in used), (pref + rest)[0])
    return c, None


# 맞는 시나리오 문장이 없는 공간 — 제품을 기준으로 그 공간에서 하는 일을 쓴다 (평서형, build.py가 polite()로 바꾼다)
ROLE_SPACE = [
    ('vwall', r'수술', '{sp} 대형 화면에 수술 영상과 환자 정보를 함께 띄워 의료진이 같은 화면을 본다.'),
    ('vwall', r'방송|부조정', '{sp} 비디오월에 카메라 · 송출 화면을 한데 띄워 중계 상황을 살핀다.'),
    ('mon', r'진료', '{sp}에서 고해상도 모니터에 진료 기록과 검사 결과를 넓게 띄워 환자와 함께 본다.'),
    ('mon', r'콜센터', '{sp} 상담석마다 모니터에 상담 화면과 고객 정보를 나란히 띄워 응대한다.'),
]
ROLE = {
    'nb': '{sp} 직원이 갤럭시 북으로 업무 시스템에 접속해 문서 · 보고 업무를 처리한다.',
    'mon': '{sp}에서 고해상도 모니터에 업무 화면을 넓게 띄워 여러 자료를 한 번에 본다.',
    'iwb': '{sp}에서 발표 자료를 전자칠판에 띄우고, 함께 쓰고 그리며 {act} 진행한다.',
    'vwall': '{sp} 비디오월에 여러 시스템 화면을 한데 띄워 상황을 한눈에 본다.',
    'ref_comm': '{sp}의 식자재를 업소용 냉장고에 넉넉히 보관해 조리 · 배식 준비를 빠르게 한다.',
    'tv': '{sp}에서 TV로 방송 · OTT 콘텐츠를 큰 화면으로 즐긴다.',
}


def iwb_act(ind, space):
    if ind == 'ED': return '수업을'
    return '교육을' if re.search(r'교육|세미나|강당|강의|연수', space) else '회의를'


def role(c, space, ind):
    for code, pat, tpl in ROLE_SPACE:
        if code == c and re.search(pat, space): return tpl.format(sp=space)
    if c not in ROLE:
        raise KeyError(f'{space}: {c}의 시나리오 문장이 없고 scene_match.ROLE에도 문장이 없습니다')
    return ROLE[c].format(sp=space, act=iwb_act(ind, space))


def tailor(c, feats, ind, space):
    """같은 제품이라도 업종 · 공간에 따라 특징 설명 속 대상이 달라지는 곳"""
    f = [list(x) for x in feats]
    if c == 'htv':
        f[0][1] = {'HT': '객실 TV를 클라우드로 한 번에 관리하고 투숙객 맞춤 웰컴 화면을 보여 줍니다.',
                   'MD': '병실 TV를 클라우드로 한 번에 관리하고 맞춤 안내 화면을 보여 줍니다.',
                   'ED': '호실 TV를 클라우드로 한 번에 관리하고 맞춤 안내 화면을 보여 줍니다.'}.get(ind, f[0][1])
        who = {'HT': '투숙객', 'MD': '환자 · 보호자', 'ED': '학생'}.get(ind, '이용자')
        f[1][1] = f'구글 캐스트 · 애플 에어플레이로 {who}의 휴대폰 콘텐츠를 바로 띄웁니다.'
    elif c == 'tab':
        for pat, work in ((r'간호|진료|케어|병동|요양', '차트 확인 · 기록 · 서명 업무를'), (r'상담|창구', '상담 · 전자서식 · 서명 업무를'),
                          (r'체험|데모', ''), (r'주문|계산|카운터|결제', '주문 · 결제 업무를'),
                          (r'체크인|접수|출입|데스크|안내|로비', '접수 · 안내 · 서명 업무를'), (r'교실|컴퓨터실|학습', '수업 · 필기 · 과제를'),
                          (r'현장|스태프|역무|관람|도슨트|창고', '현장 업무와 기록을'), (r'사무|관리', '매장 관리 · 보고 업무를')):
            if re.search(pat, space):
                f[0][1] = f'넓은 화면과 S펜으로 {work} 한 기기에서 처리합니다.' if work else '넓은 화면과 S펜으로 고객이 제품 기능과 데모 콘텐츠를 직접 체험합니다.'
                break
    elif c == 'iwb':
        f[0][1] = f'최대 20명이 동시에 쓰고 그리는 4K 터치 화면으로 {iwb_act(ind, space)} 이끕니다.'
    elif c == 'laundry_b2b' and re.search(r'리넨|하우스키핑|라커|수건|유니폼', space):
        f[1] = ['앱으로 원격 관리', '앱으로 세탁 진행 · 완료와 기기 상태를 확인해 세탁 운영을 간편하게 관리합니다.']
    elif c == 'sac_cold' and re.search(r'창고|저온|콜드', space):
        f[1][1] = '최대 48℃ 환경에서도 80% 이상의 냉장 성능을 유지해 보관 중인 물품을 지킵니다.'
    return [tuple(x) for x in f]
