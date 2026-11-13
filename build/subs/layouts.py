# L_SUB_* — B2B 삼성 AI 구독 시트(장표 구분 SU). 목차 템플릿 장(L_TOC_*)과 같은 디자인 체계(build/toc/base.py).
# 기본 글 · 사진은 구독 레지스트리(app/data/subscriptions.json — 원문 확인 사실)에서 가져온다. 추론 결제안은 '협의안' 칩으로만, 숫자는 [00].
# 규칙: 눈썹(eb) + 제목 한 줄, 사진 · 아이콘 · 숫자 중심, 부제 · 각주 없음(조건은 칩 · 칸으로), 카드 왼쪽 색 띠 없음.
# 글자: 모든 칸이 역할 크기(fineprint 10 · utility 12 · label 14 · dense 16 · body 18 · heading 20 · subheading 24 · title 32 · metric 40 · cover 48 · display 56).
# 생성: python3 build/subs/gen_module.py → app/web/src/domain/templates/subs_layouts.js (SUBS_META · SUBS_HTML · SUBS_SLOTS)
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'toc'))
from base import *  # noqa: F401,F403 — T · svg_icon · 색 · 글꼴
from typed import TT as T  # 글자 역할(PROPOSAL_TYPE)을 구운 T — 샘플 시나리오 장은 역할 크기여야 한다(build/toc/typed.py)

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
REG = json.load(open(os.path.join(ROOT, 'app/data/subscriptions.json'), encoding='utf-8'))
ITEM = {x['id']: x for x in REG['items']}
PROG = ITEM['sub_b2b_ai']; BP = ITEM['sub_bluepass_b2b']
PKGS = [x for x in REG['items'] if x['type'] == 'package']
PROMO = next((x for x in REG['items'] if x['type'] == 'promotion'), None)
PAYS = [x for x in REG['items'] if x['type'] == 'payment']
CATS = {c['id']: c for c in REG['categories']}
A = lambda k: f'/assets/subs/{k}.webp'
CUT = lambda cid: (CATS[cid]['rep'] or {}).get('img')
PID = lambda cid: (CATS[cid]['rep'] or {}).get('product')
FOOT = 'H 대학교 · B2B 삼성 AI 구독 제안서'
EB = '03 · B2B 삼성 AI 구독'
WARM = '#5b6070'
ICONS.update({  # Lucide(ISC) 결 — 구독 장 전용
  'receipt': 'M6 3h12v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2z M9 8h6 M9 11.5h6 M9 15h3.5',
  'headset': 'M4 14v-2a8 8 0 0 1 16 0v2 M4 14h3v5H4z M17 14h3v5h-3z M17 19c0 1.5-1.5 2-3 2h-2',
  'repeat': 'M17 2l4 4-4 4 M3 11v-1a4 4 0 0 1 4-4h14 M7 22l-4-4 4-4 M21 13v1a4 4 0 0 1-4 4H3',
  'sparkles': 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-5.2-1.8L5 10l5.2-1.8z M19 3v4 M17 5h4',
  'truck': 'M3 6h11v10H3z M14 10h4l3 3v3h-7z M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M17.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  'handshake': 'M11 17l2 2a1.4 1.4 0 0 0 2-2 M14 14l2.5 2.5a1.4 1.4 0 0 0 2-2l-3.9-3.9a2.8 2.8 0 0 0-4 0l-.9.9a1.4 1.4 0 0 1-2-2l2.8-2.8a5 5 0 0 1 5.6-1l.4.2a5 5 0 0 0 2.7.6H21 M21 3v11h-2 M3 3h8 M3 4v10h2l5.5 5.5a1.4 1.4 0 0 0 2-2',
  'percent': 'M19 5L5 19 M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  'x': 'M6 6l12 12 M18 6L6 18', 'minus': 'M5 12h14', 'phone2': 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2z',
  'wind2': 'M3 8h11a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h7', 'building2': 'M5 21V4h10v17 M15 9h4v12 M8 8h4 M8 12h4 M8 16h4 M3 21h18',
})
META = []; HTML = {}; SLOTS = {}


def reg(s, name, when, p2, req, subs, prods=(), extra=None):
    m = {'f': s.fid, 'c': 'SU', 'code': s.fid[2:].replace('_', '-'), 'name': name, 'when': when, 'g': 'B2B 삼성 AI 구독 · ' + name.split(' · ')[0],
         'p': 'subscription', 'p2': p2, 'ind': None, 'sol': None, 'sample': '대학교', 'eb': s.texts[0] if s.texts else '', 'hl': s.texts[1] if len(s.texts) > 1 else '',
         'sub': '', 'foot': FOOT, 'nT': s.ntb, 'nI': s.nimg, 'ik': sorted(set(s.kinds)), 'ih': s.hints[:12], 'ph': sum(t.count('[') for t in s.texts),
         'phs': sorted(set(x for t in s.texts for x in re.findall(r'\[[^\]]{1,8}\]', t)))[:6], 'pc': s.kinds.count('cut'), 'req': req, 'prods': [x for x in dict.fromkeys(prods) if x],
         'sols': [], 'txt': ' '.join(t for t in s.texts if t)[:1600], 'pf': round(min(1.0, s.area / (1280 * 720)), 2), 'subs': list(subs), 'toc': True}
    if extra: m.update(extra)
    META.append(m); HTML[s.fid] = s.html(); SLOTS[s.fid] = {'t': s.names, 'img': s.imgnames}
    return s


def box(s, x, y, w, h, bg=SURF, r=18, border=None, extra=''):
    s.box(x, y, w, h, bg=bg, r=r, border=border, extra=extra)


def check_icon(s, x, y, color=BLUE, size=22):
    s.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px">' + svg_icon('check', size, color, 2.4) + '</div>')


def place_chip(s, x, y, text, name):
    """사진 위 장소 칩 — 어두운 반투명 바탕(원문 이미지의 라벨 자리)"""
    s.chip(x, y, text, name=name, bg=CAP, color='#ffffff', size=14, h=32, pad=14)


def numunit(s, x, y, w, val, unit, size=44, usize=17, color=BLUE, ucolor=GRAY, vname=None, uname=None):
    s.raw(f'<div style="position: absolute; left: {f(x)}px; top: {f(y)}px; width: {f(w)}px; display: flex; align-items: baseline; gap: 6px; white-space: nowrap">'  # 숫자 글리프가 줄 상자보다 커서 감싼 칸이 자르지 않게(overflow 없음)
          + s.tb(f'font-family: {NUMF}; font-size: {size}px; font-weight: 800; line-height: 1.0; letter-spacing: -0.03em; color: {color}', val, 'span', name=vname)
          + s.tb(f'font-size: {usize}px; font-weight: 800; line-height: 1.0; color: {ucolor}', unit, 'span', name=uname) + '</div>')


# ------------------------------------------------------------------ 1 · 구독 개요 (대표 이미지 + 가치 3)
VAL3 = [('coin', '초기 비용 부담은 낮추고', '월 분할 납부 · 무상 A/S로 초기 투자비와 A/S 비용 절감'),
        ('wrench', '시설 관리는 편해지고', '전문 엔지니어의 주기적인 관리로 제품 고장 빈도 감소'),
        ('users', '고객 만족도는 올라가고', '위생적인 사업장 · 최신 제품으로 쾌적한 방문 경험')]


def hero():
    s = T('L_SUB_HERO')
    s.raw(s.tb(f'position: absolute; left: 64px; top: 44px; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; color: {BLUE}; white-space: nowrap', EB, name='eb'))
    s.chip(64, 108, PROG['badge'], name='badge', size=15, h=36, pad=16)
    s.t(64, 162, 600, '기업 운영 환경에 맞춘 전문 케어,', 40, 800, INK, 1.4, name='t1', nowrap=True, extra='letter-spacing: -0.03em')
    s.t(64, 218, 600, PROG['name'], 40, 800, BLUE, 1.4, name='t2', nowrap=True, extra='letter-spacing: -0.03em')
    for i, (ic, tt, ln) in enumerate(VAL3):
        y = 318 + i * 106
        s.ico(64, y, ic, size=64, r=18)
        s.t(150, y + 4, 480, tt, 22, 800, INK, 1.3, name=f'vt{i}', nowrap=True)
        s.t(150, y + 38, 480, ln, 16, 600, GRAY, 1.45, name=f'vl{i}', clamp=2)
    box(s, 664, 104, 552, 544, bg='#e7eefb', r=22)
    s.pic(664, 104, 552, 544, A('kv-grid'), '구독 품목 대표 이미지 (제품 컷 모음)', kind='space', r=22, name='img', fit='cover')
    s.foot2(FOOT, 3)
    return reg(s, '구독 개요 · 대표 이미지 + 가치 3', 'B2B 삼성 AI 구독이 무엇이고 무엇이 좋은지 구독 목차의 첫 장으로 보여 줄 때', 'overview', ['values', 'images'], ['sub_b2b_ai'])


# ------------------------------------------------------------------ 2 · 현장의 고민 4 → 해결
def pains():
    s = T('L_SUB_PAIN'); s.head2(EB + ' · 현장의 고민', '부담되는 초기 비용, 손이 가는 시설 관리 — 현장의 네 가지 고민')
    s.pic(64, 128, 392, 520, A('pkg-public'), '현장 사진 (시설 관리 · A/S 장면)', kind='space', r=18, name='img', pos='68% 50%')
    W, Hh = 368, 196
    for i, pn in enumerate(PROG['pains']):
        x = 480 + (i % 2) * 380; y = 128 + (i // 2) * (Hh + 16)
        box(s, x, y, W - 12, Hh, bg=SURF, r=18)
        s.ico(x + 24, y + 24, pn['icon'] if pn['icon'] in ICONS else 'alert', size=48, r=14, bg='#ffffff')
        s.t(x + 88, y + 34, W - 124, pn['title'], 20, 800, INK, 1.3, name=f'pt{i}', nowrap=True)
        s.t(x + 24, y + 96, W - 60, pn['line'], 15, 600, GRAY, 1.5, name=f'pl{i}', clamp=2)
        s.t(x + 24, y + 150, W - 60, pn['emph'], 17, 800, BLUE, 1.35, name=f'pe{i}', nowrap=True)
    box(s, 480, 552, 736, 96, bg=BLUE, r=18)
    s.t(512, 584, 600, '기업 현장에 맞춘 전문 케어로 해결해드립니다', 22, 800, '#ffffff', 1.35, name='band', nowrap=True)
    s.raw(f'<div style="position: absolute; left: 1160px; top: 584px">' + svg_icon('arrow', 30, '#ffffff', 2.4) + '</div>')
    s.foot2(FOOT, 4)
    return reg(s, '현장의 고민 4 · 사진 + 해결 한 줄', '초기 비용 · A/S · 피크 시즌 민원 · 세척 관리처럼 고객이 지금 겪는 문제를 짚고 구독으로 넘어갈 때', 'challenge', ['challenges', 'images'], ['sub_b2b_ai'])


# ------------------------------------------------------------------ 3 · 구독 가치 3 (사진 카드)
def values3():
    s = T('L_SUB_VALUE3'); s.head2(EB + ' · 구독 가치', '왜 B2B 삼성 AI 구독일까요 — 세 가지 이유')
    pics = [(A('kv-grid'), '구독 품목 사진'), (A('care-1'), '전문 엔지니어 점검 사진'), (A('pkg-stay'), '쾌적한 고객 공간 사진')]
    W = 368
    for i, v in enumerate(PROG['values']):
        x = 64 + i * (W + 24)
        box(s, x, 128, W, 520, bg='#ffffff', r=18, border=f'1px solid {LINE}')
        s.pic(x + 1, 129, W - 2, 214, pics[i][0], pics[i][1], kind='space', r=17, name=f'img{i}', bg=SURF)
        s.t(x + 28, 366, 80, f'{i+1:02d}', 34, 800, BLUE, 1.0, name=f'no{i}', extra=f'font-family: {NUMF}')
        s.t(x + 28, 414, W - 56, v['title'].rstrip('!'), 24, 800, INK, 1.3, name=f'tt{i}', nowrap=True)
        s.t(x + 28, 456, W - 56, v['head'], 18, 800, BLUE, 1.35, name=f'hd{i}', nowrap=True)
        s.t(x + 28, 494, W - 56, v['line'].rstrip('!'), 16, 600, INK2, 1.55, name=f'ln{i}', clamp=4)
    s.foot2(FOOT, 5)
    return reg(s, '구독 가치 3 · 사진 카드', '비용 · 시설 관리 · 고객 만족 세 가지 가치를 사진과 함께 카드로 보여 줄 때', 'value', ['values', 'images'], ['sub_b2b_ai'])


# ------------------------------------------------------------------ 4 · 일시불 구매 vs 구독
CMP_ICON = ['coin', 'alert', 'headset', 'wrench', 'receipt']


def compare():
    s = T('L_SUB_COMPARE'); s.head2(EB + ' · 구매 방식 비교', '일시불 구매와 구독, 무엇이 달라질까요')
    c = PROG['compare']; W = 470; L0, R0 = 64, 746
    s.chip(L0, 132, c['left'], name='lh', bg=WARM, color='#ffffff', size=17, h=42, pad=22)
    s.chip(R0, 132, c['right'], name='rh', bg=BLUE, color='#ffffff', size=17, h=42, pad=22)
    for i, (a, b) in enumerate(c['rows']):
        y = 196 + i * 90
        box(s, L0, y, W, 74, bg=SURF, r=16)
        s.ico(L0 + 16, y + 13, CMP_ICON[i], size=48, r=14, bg='#ffffff', color=MUTE)
        s.t(L0 + 84, y + 24, W - 104, a, 19, 700, INK2, 1.35, name=f'l{i}', nowrap=True)
        box(s, R0, y, W, 74, bg=SKY, r=16, border='1.5px solid #c9d2f3')
        s.ico(R0 + 16, y + 13, CMP_ICON[i], size=48, r=14, bg='#ffffff', color=BLUE)
        s.t(R0 + 84, y + 24, W - 136, b, 19, 800, BLUE, 1.35, name=f'r{i}', nowrap=True)
        check_icon(s, R0 + W - 44, y + 26)
    s.raw(f'<div style="position: absolute; left: {L0 + W + 18}px; top: 400px; width: 176px; border-top: 2px dashed {DASH}"></div>')
    s.chip(L0 + W + 26, 380, c['mid'].rstrip('!'), name='mid', bg='#ffffff', color=BLUE, size=15, h=40, pad=16, border=f'1.5px solid {BLUE}')
    s.raw(f'<div style="position: absolute; left: {R0 - 30}px; top: 389px">' + svg_icon('arrow', 22, BLUE, 2.4) + '</div>')
    s.foot2(FOOT, 6)
    return reg(s, '구매 방식 비교 · 일시불 vs 구독 5', '일시불로 살 때와 구독할 때 달라지는 다섯 가지를 나란히 비교할 때', 'cost', ['costs', 'values'], ['sub_b2b_ai'])


# ------------------------------------------------------------------ 5 · 구독 품목 8
ITEM8 = [('냉장고 / 김치냉장고', 'ref'), ('세탁기 / 건조기', 'washdry'), ('에어컨', 'ac'), ('공기청정기', 'air'), ('정수기', 'water'),
         ('TV / 전자칠판', 'iwb'), ('에어드레서 / 식기세척기', 'airdresser'), ('모니터 · 갤럭시 북', 'mon')]


def items8():
    s = T('L_SUB_ITEMS'); s.head2(EB + ' · 구독 품목', '다양한 최신 AI 가전도 부담 없이 구독으로')
    W, Hh = 276, 222
    for i, (lb, cid) in enumerate(ITEM8):
        x = 64 + (i % 4) * (W + 16); y = 128 + (i // 4) * (Hh + 16)
        box(s, x, y, W, Hh, bg=SURF, r=18)
        s.pic(x + 28, y + 16, W - 56, 140, CUT(cid), f'{lb} 제품 컷', kind='cut', r=10, name=f'img{i}', bg=SURF)
        s.t(x + 20, y + 172, W - 40, lb, 19, 800, INK, 1.3, name=f'lb{i}', nowrap=True, align='center')
    s.chip(64, 608, '휴대폰 · 시스템에어컨 등 일부 제품은 구독 제한', name='rs', bg='#ffffff', color=GRAY, size=15, h=40, pad=18, border=f'1px solid {LINE}')
    s.chip(476, 608, '외 다양한 품목 — 품목 · 모델은 구독 문의로 확인', name='more', bg='#ffffff', color=GRAY, size=15, h=40, pad=18, border=f'1px solid {LINE}')
    s.foot2(FOOT, 7)
    return reg(s, '구독 품목 8 · 제품 컷 타일', '구독할 수 있는 품목을 제품 사진으로 한눈에 보여 줄 때', 'products', ['products', 'images'], ['sub_b2b_ai'], [PID(c) for _, c in ITEM8])


# ------------------------------------------------------------------ 6 · 케어 4단계
def care4():
    s = T('L_SUB_CARE4'); s.head2(EB + ' · 전문 케어', '삼성 전문 엔지니어가 정기적 · 체계적으로 점검하고 관리합니다')
    W = (1152 - 3 * 20) / 4
    for i, st in enumerate(PROG['care']['steps']):
        x = 64 + i * (W + 20)
        box(s, x, 128, W, 448, bg=SURF, r=18)
        s.pic(x, 128, W, 236, A(f'care-{i+1}'), f'{st["title"]} 사진', kind='space', r=18, name=f'img{i}')
        s.num2(x + 24, 388, i + 1, d=36, size=16, name=f'no{i}')
        s.t(x + 24, 438, W - 48, st['title'], 23, 800, INK, 1.3, name=f'st{i}', nowrap=True)
        s.t(x + 24, 480, W - 48, st['line'], 17, 600, GRAY, 1.5, name=f'sl{i}', clamp=2)
    s.chip(64, 600, '방문케어 주기 6 · 12 · 36개월 중 선택 (품목별로 다름)', name='c0', size=15, h=40, pad=18)
    s.chip(560, 600, '점검 · 세척은 방문케어를 고를 때 제공', name='c1', bg='#ffffff', color=GRAY, size=15, h=40, pad=18, border=f'1px solid {LINE}')
    s.foot2(FOOT, 8)
    return reg(s, '전문 케어 4단계 · 사진 + 단계', '성능 점검 · 필터 · 클리닝 · 전문 세척으로 이어지는 정기 케어를 사진으로 보여 줄 때', 'execution', ['images'], ['sub_b2b_ai', 'sub_care_visit'])


# ------------------------------------------------------------------ 7 · B2B 블루패스
BP_EX = {'timecare': '예) 은행 지점 — 영업 종료 후 여러 지점 한꺼번에', 'urgent48': '예) 병원 · 의료시설 — 위생 관리 공백 최소화'}


def bluepass():
    s = T('L_SUB_BLUEPASS'); s.head2(EB + ' · B2B 블루패스', '기업 운영 환경에 맞춘 B2B 블루패스 네 가지')
    s.pic(64, 128, 400, 520, A('val-dorm'), 'B2B 전문 엔지니어 사진', kind='space', r=18, name='img', pos='62% 50%')
    box(s, 64, 528, 400, 120, bg='rgba(12,16,26,0.78)', r=0, extra='border-radius: 0 0 18px 18px')
    s.t(92, 548, 344, 'B2B 블루패스', 15, 800, '#9db4ff', 1.3, name='bk', nowrap=True, extra='letter-spacing: 0.04em')
    s.t(92, 576, 344, '삼성전자서비스 · 삼성전자로지텍의 B2B 전문 엔지니어가 기업별 운영 환경에 맞춰 관리', 16, 700, '#ffffff', 1.45, name='bl', clamp=2)
    tiles = [('6', '년', '최대 무상 AS'), ('48', '시간', '영업일 기준 긴급 출동'), ('+1', '종', '방문 시 추가 무상점검')]
    W = (1216 - 488 - 2 * 16) / 3
    for i, (v, u, lb) in enumerate(tiles):
        x = 488 + i * (W + 16)
        box(s, x, 128, W, 116, bg=SKY, r=16)
        numunit(s, x + 22, 150, W - 44, v, u, size=40, usize=17, vname=f'kv{i}', uname=f'ku{i}')
        s.t(x + 22, 202, W - 44, lb, 15, 700, INK2, 1.3, name=f'kl{i}', nowrap=True)
    for i, sv in enumerate(BP['services']):
        y = 264 + i * 96
        box(s, 488, y, 728, 84, bg='#ffffff', r=16, border=f'1px solid {LINE}')
        s.ico(504, y + 14, sv['icon'] if sv['icon'] in ICONS else 'check', size=56, r=16)
        s.t(578, y + 14, 260, sv['name'], 20, 800, INK, 1.3, name=f'sn{i}', nowrap=True)
        s.t(578, y + 46, 620, sv['line'], 15, 600, GRAY, 1.4, name=f'sd{i}', nowrap=True)
        if sv['id'] in BP_EX: s.chip(842, y + 12, BP_EX[sv['id']], name=f'se{i}', bg=SURF, color=INK2, size=13, h=28, pad=12, maxw=358)
    s.foot2(FOOT, 9)
    return reg(s, 'B2B 블루패스 · 숫자 3 + 서비스 4', '시간맞춤 집중케어 · 48시간 긴급 출동 · 엔지니어 담당제 · 하나 더 서비스로 기업 전용 관리 체계를 보여 줄 때', 'why', ['images'], ['sub_bluepass_b2b'])


# ------------------------------------------------------------------ 8 · 사업장별 구독 패키지 4
def packs():
    s = T('L_SUB_PACKS'); s.head2(EB + ' · 구독 패키지', '사업장에 맞춘 구독 패키지 네 가지')
    W = (1152 - 3 * 20) / 4; prods = []
    for i, pk in enumerate(PKGS):
        x = 64 + i * (W + 20)
        box(s, x, 128, W, 520, bg='#ffffff', r=18, border=f'1px solid {LINE}')
        s.pic(x + 1, 129, W - 2, 190, pk['photo'], f'{pk["place"]} 사진', kind='space', r=17, name=f'img{i}')
        place_chip(s, x + 14, 141, pk['place'], name=f'pl{i}')
        s.t(x + 22, 338, W - 44, pk['name'], 21, 800, BLUE, 1.3, name=f'nm{i}', nowrap=True)
        s.t(x + 22, 372, W - 44, pk['title'], 16, 700, INK, 1.45, name=f'tt{i}', clamp=2)
        cw = (W - 44 - 10) / 2
        for k, it in enumerate(pk['items'][:4]):
            cx = x + 22 + (k % 2) * (cw + 10); cy = 432 + (k // 2) * 104
            box(s, cx, cy, cw, 94, bg=SURF, r=12)
            s.pic(cx + 8, cy + 6, cw - 16, 60, it['img'], f'{it["label"]} 제품 컷', kind='cut', r=6, name=f'p{i}_{k}', bg=SURF)
            s.t(cx + 6, cy + 70, cw - 12, it['label'], 13, 800, INK2, 1.2, name=f'pn{i}_{k}', nowrap=True, align='center')
            prods.append(it.get('product'))
    s.foot2(FOOT, 10)
    return reg(s, '구독 패키지 4 · 사업장별 사진 + 품목', '공공 · 숙박 · 의료 · 오피스 패키지를 사진과 품목으로 나란히 보여 줄 때', 'products', ['products', 'images'], [p['id'] for p in PKGS], prods)


# ------------------------------------------------------------------ 9 · 업종 구독 패키지 상세 (품목 4 · 3)
def pkg_detail(n):
    pk = PKGS[0]
    s = T(f'L_SUB_PKG{n}'); s.head2('04 · 대학교 구독 패키지', f'{pk["title"]}, {pk["name"]}로')
    s.pic(64, 128, 560, 520, pk['photo'], '업종 대표 공간 사진', kind='space', r=18, name='img')
    place_chip(s, 84, 148, '대학교 기숙사', name='pl')
    s.chip(648, 128, pk['name'], name='nm', size=16, h=38, pad=16)
    s.t(648, 182, 568, pk['line'], 19, 700, INK, 1.5, name='ln', clamp=2)
    prods = []
    items = pk['items'][:n]
    if n == 4:
        W, Hh = 278, 196
        for k, it in enumerate(items):
            x = 648 + (k % 2) * (W + 12); y = 256 + (k // 2) * (Hh + 12)
            box(s, x, y, W, Hh, bg=SURF, r=16)
            s.pic(x + 20, y + 12, W - 40, 118, it['img'], f'{it["label"]} 제품 컷', kind='cut', r=8, name=f'p{k}', bg=SURF)
            s.t(x + 20, y + 140, W - 40, it['label'], 18, 800, INK, 1.3, name=f'pn{k}', nowrap=True)
            s.t(x + 20, y + 166, W - 40, it.get('model') or it.get('note') or '', 13, 700, MUTE, 1.3, name=f'pm{k}', nowrap=True, extra=f'font-family: {NUMF}')
            prods.append(it.get('product'))
    else:
        for k, it in enumerate(items):
            y = 256 + k * 132
            box(s, 648, y, 568, 120, bg=SURF, r=16)
            s.pic(664, y + 10, 150, 100, it['img'], f'{it["label"]} 제품 컷', kind='cut', r=8, name=f'p{k}', bg=SURF)
            s.t(840, y + 32, 360, it['label'], 20, 800, INK, 1.3, name=f'pn{k}', nowrap=True)
            s.t(840, y + 66, 360, it.get('model') or it.get('note') or '', 14, 700, MUTE, 1.3, name=f'pm{k}', nowrap=True, extra=f'font-family: {NUMF}')
            prods.append(it.get('product'))
    s.foot2(FOOT, 12)
    return reg(s, f'업종 구독 패키지 상세 · 사진 + 품목 {n}', f'한 업종에 맞춘 구독 패키지를 대표 공간 사진과 품목 {n}개로 보여 줄 때', 'products', ['products', 'images', 'industry'], [pk['id']], prods)


# ------------------------------------------------------------------ 10 · 구독 조건
def terms():
    s = T('L_SUB_TERMS'); s.head2(EB + ' · 구독 조건', '구독 조건, 한 장으로 확인합니다')
    tiles = [('3~6', '년', '구독 기간 · 1년 단위'), ('6·12·36', '개월', '방문케어 주기 선택'), ('6', '년', '최대 무상 AS'), ('해지', '가능', '위약금 · 회수비 발생 가능')]
    W = (1152 - 3 * 16) / 4
    for i, (v, u, lb) in enumerate(tiles):
        x = 64 + i * (W + 16)
        box(s, x, 128, W, 150, bg=SKY if i < 3 else SURF, r=18)
        numunit(s, x + 24, 160, W - 48, v, u, size=44 if i < 3 else 36, usize=18, color=BLUE if i < 3 else INK, vname=f'kv{i}', uname=f'ku{i}')
        s.t(x + 24, 226, W - 48, lb, 16, 700, INK2, 1.3, name=f'kl{i}', nowrap=True)
    rows = [('building2', '구독 대상', '정부 · 지자체 · 공공기관, 일정 신용등급 이상의 법인'),
            ('handshake', '구매 조건 · 수량', '고객 신용도와 품목에 따라 달라요 — 구독 문의로 확인'),
            ('alert', '구독 제한 품목', '휴대폰 · 시스템에어컨 등 일부 제품')]
    for i, (ic, lb, vl) in enumerate(rows):
        y = 302 + i * 116
        box(s, 64, y, 748, 104, bg='#ffffff', r=16, border=f'1px solid {LINE}')
        s.ico(84, y + 22, ic, size=60, r=16)
        s.t(164, y + 22, 600, lb, 15, 800, MUTE, 1.3, name=f'rl{i}', nowrap=True)
        s.t(164, y + 50, 620, vl, 20, 800, INK, 1.35, name=f'rv{i}', nowrap=True)
    s.pic(836, 302, 380, 336, A('pkg-office'), '구독을 쓰는 사업장 사진', kind='space', r=18, name='img')
    s.foot2(FOOT, 13)
    return reg(s, '구독 조건 · 숫자 4 + 대상 · 조건 · 제한', '구독 기간 · 방문 주기 · 무상 AS · 해지와 대상 · 조건 · 제한 품목을 한 장으로 보여 줄 때', 'cost', ['costs', 'images'], ['sub_b2b_ai'])


# ------------------------------------------------------------------ 11 · 관리 옵션 비교 (무상수리 · 방문케어)
def careopt():
    s = T('L_SUB_CAREOPT'); s.head2(EB + ' · 관리 옵션', '무상수리만 받을까, 방문케어까지 받을까')
    LX, AX, BX = 64, 560, 896; AW = 312; BW = 320
    box(s, AX, 128, AW, 172, bg=SURF, r=18)
    s.ico(AX + 24, 150, 'wrench', size=60, r=16, bg='#ffffff', color=MUTE)
    s.t(AX + 24, 228, AW - 48, '무상수리 서비스', 22, 800, INK, 1.3, name='an', nowrap=True)
    s.t(AX + 24, 262, AW - 48, '고장 날 때 무상 A/S', 15, 700, GRAY, 1.3, name='as', nowrap=True)
    s.pic(BX, 128, BW, 172, A('care-2'), '방문케어 사진', kind='space', r=18, name='img')
    box(s, BX, 128, BW, 172, bg='linear-gradient(180deg, rgba(20,40,160,0) 30%, rgba(20,40,160,0.88) 100%)', r=18)
    s.t(BX + 24, 228, BW - 48, '방문케어', 22, 800, '#ffffff', 1.3, name='bn', nowrap=True)
    s.t(BX + 24, 262, BW - 48, '정기 방문 점검 · 세척까지', 15, 700, '#ffffff', 1.3, name='bs', nowrap=True)
    rows = [('무상 A/S', True, True), ('성능 점검 — 스마트진단 · 냉매/누수', False, True), ('필터 · 소모품 관리', False, True),
            ('내 · 외부 클리닝 — UV 살균 · 도어패킹', False, True), ('전문 세척 — 열교환기 · 세탁조 분해', False, True)]
    for i, (lb, a, b) in enumerate(rows):
        y = 320 + i * 58
        s.hline(LX, y - 6, 1152)
        s.t(LX, y + 10, 480, lb, 18, 700, INK, 1.3, name=f'rl{i}', nowrap=True)
        for (x, w, ok) in ((AX, AW, a), (BX, BW, b)):
            s.raw(f'<div style="position: absolute; left: {f(x + w / 2 - 14)}px; top: {y + 8}px">' + (svg_icon('check', 28, BLUE, 2.6) if ok else svg_icon('minus', 28, DASH, 2.4)) + '</div>')
    y = 320 + 5 * 58
    s.hline(LX, y - 6, 1152)
    s.t(LX, y + 10, 480, '방문 주기', 18, 700, INK, 1.3, name='rl5', nowrap=True)
    s.t(AX, y + 10, AW, '—', 18, 700, DASH, 1.3, name='a5', align='center')
    s.t(BX, y + 10, BW, '6 · 12 · 36개월', 18, 800, BLUE, 1.3, name='b5', align='center', nowrap=True)
    s.foot2(FOOT, 14)
    return reg(s, '관리 옵션 비교 · 무상수리 vs 방문케어', '무상수리만 고를 때와 방문케어를 고를 때 받는 관리를 항목별로 비교할 때', 'execution', ['costs', 'images'], ['sub_care_repair', 'sub_care_visit'])


# ------------------------------------------------------------------ 12 · 결제 · 납부 방법 5 (기본 1 + 협의안 4)
def pay5():
    s = T('L_SUB_PAY5'); s.head2(EB + ' · 결제 · 납부', '예산 구조에 맞춰 고르는 구독 납부 방법')
    base = next(p for p in PAYS if p['basis'] == 'official'); alts = [p for p in PAYS if p['basis'] != 'official'][:4]
    box(s, 64, 128, 1152, 148, bg=BLUE, r=18)
    s.ico(92, 158, base['icon'], size=88, r=22, bg='rgba(255,255,255,0.16)', color='#ffffff', isz=42)
    s.chip(204, 152, '기본', name='bk', bg='#ffffff', color=BLUE, size=13, h=26, pad=10)
    s.t(262, 151, 640, base['name'], 26, 800, '#ffffff', 1.25, name='bn', nowrap=True)
    s.t(204, 196, 700, base['summary'], 17, 600, 'rgba(255,255,255,0.9)', 1.5, name='bd', clamp=2)
    for k, pt in enumerate(base['points'][:3]):
        s.chip(930, 146 + k * 38, pt, name=f'bp{k}', bg='rgba(255,255,255,0.16)', color='#ffffff', size=13, h=30, pad=12, maxw=270)
    W = (1152 - 3 * 16) / 4
    for i, p in enumerate(alts):
        x = 64 + i * (W + 16)
        box(s, x, 296, W, 352, bg=SURF, r=18)
        s.ico(x + 22, 318, p['icon'] if p['icon'] in ICONS else 'coin', size=52, r=14, bg='#ffffff')
        s.chip(x + W - 92, 326, '협의안', name=f'tag{i}', bg='#ffffff', color=GRAY, size=13, h=28, pad=12, border=f'1px dashed {DASH}')
        s.t(x + 22, 384, W - 44, p['name'], 19, 800, INK, 1.35, name=f'pn{i}', clamp=2)
        s.t(x + 22, 444, W - 44, p['summary'], 15, 600, INK2, 1.55, name=f'pd{i}', clamp=3)
        s.hline(x + 22, 540, W - 44)
        s.t(x + 22, 552, W - 44, '맞는 고객', 13, 800, MUTE, 1.3, name=f'fl{i}', nowrap=True)
        s.t(x + 22, 574, W - 44, p['fit'], 15, 700, BLUE, 1.45, name=f'pf{i}', clamp=2)
    s.foot2(FOOT, 15)
    return reg(s, '결제 · 납부 방법 5 · 기본 + 협의안 4', '월 구독료(기본)와 선납 · 연 단위 · 본사 일괄 · 단계 도입 협의안을 고객 예산 구조에 맞춰 고를 때', 'cost', ['costs'], [p['id'] for p in PAYS],
               extra={'basis': 'mixed'})


# ------------------------------------------------------------------ 13 · 이 고객에 맞는 납부안 3
def pay3():
    s = T('L_SUB_PAY3'); s.head2(EB + ' · 결제 · 납부', '이 고객에 맞는 납부 방법 세 가지')
    pick = [ITEM['sub_pay_annual'], ITEM['sub_pay_monthly'], ITEM['sub_pay_prepay']]
    W = 368
    for i, p in enumerate(pick):
        x = 64 + i * (W + 24); hi = i == 0
        box(s, x, 128, W, 520, bg=BLUE if hi else SURF, r=18)
        col, sub = ('#ffffff', 'rgba(255,255,255,0.86)') if hi else (INK, INK2)
        s.t(x + 26, 150, 90, f'{i+1:02d}', 40, 800, '#ffffff' if hi else BLUE, 1.2, name=f'no{i}', extra=f'font-family: {NUMF}')  # 번호(아이콘 아님) — 조립기가 순서를 바꿔도 맞음
        s.chip(x + W - 118, 164, '기본 방식' if p['basis'] == 'official' else '협의안', name=f'tag{i}', bg='#ffffff', color=BLUE if hi else GRAY, size=13, h=28, pad=12)
        s.t(x + 26, 238, W - 52, p['name'], 23, 800, col, 1.3, name=f'pn{i}', nowrap=True)
        s.t(x + 26, 278, W - 52, p['summary'], 16, 600, sub, 1.55, name=f'pd{i}', clamp=3)
        for k, pt in enumerate(p['points'][:3]):
            y = 380 + k * 44
            check_icon(s, x + 26, y + 1, '#ffffff' if hi else BLUE)
            s.t(x + 58, y, W - 84, pt, 17, 700, col, 1.4, name=f'pp{i}_{k}', nowrap=True)
        s.hline(x + 26, 528, W - 52, 'rgba(255,255,255,0.3)' if hi else LINE)
        s.t(x + 26, 546, W - 52, '확인할 것', 13, 800, 'rgba(255,255,255,0.7)' if hi else MUTE, 1.3, name=f'cl{i}', nowrap=True)
        s.t(x + 26, 570, W - 52, ' · '.join(p['confirm'][:2]), 15, 700, col, 1.45, name=f'pc{i}', clamp=2)
    s.foot2(FOOT, 16)
    return reg(s, '맞춤 납부안 3 · 추천 + 비교', '고객 예산 구조(공공 연 예산 · 월 운영비 · 선납)에 맞는 납부 방법 셋을 골라 첫 안을 추천할 때', 'cost', ['costs'], [p['id'] for p in pick], extra={'basis': 'mixed'})


# ------------------------------------------------------------------ 14 · 예산 흐름 비교 (일시불 vs 구독)
def budget():
    s = T('L_SUB_BUDGET'); s.head2(EB + ' · 예산 흐름', '일시불은 첫해에 몰리고, 구독은 해마다 같은 예산으로')
    def chart(x0, title, bars, color, tag, name):
        box(s, x0, 128, 560, 380, bg=SURF, r=18)
        s.t(x0 + 28, 150, 360, title, 20, 800, color if color != DASH else INK, 1.3, name=name + 't', nowrap=True)
        s.chip(x0 + 560 - 28 - 170, 148, tag, name=name + 'g', bg='#ffffff', color=GRAY, size=13, h=28, pad=12, maxw=170)
        base_y = 456; bw = 52; gap = (560 - 56 - 6 * bw) / 5
        s.hline(x0 + 28, base_y, 504, DASH)
        for k, (hgt, c) in enumerate(bars):
            bx = x0 + 28 + k * (bw + gap)
            s.box(bx, base_y - hgt, bw, hgt, bg=c, r=6)
            s.t(bx - 10, base_y - hgt - 26, bw + 20, '[00]', 13, 800, INK2, 1.2, name=f'{name}v{k}', align='center', nowrap=True)
            s.t(bx - 10, base_y + 10, bw + 20, f'{k+1}년차', 13, 700, MUTE, 1.2, name=f'{name}y{k}', align='center', nowrap=True)
    chart(64, '일시불 구매', [(220, '#9aa1ad')] + [(26, '#cfd3da')] * 5, DASH, '세척 · 수리 비용 별도', 'a')
    chart(656, 'B2B 삼성 AI 구독', [(84, BLUE)] * 6, BLUE, '케어 · A/S 포함', 'b')
    pts = [('coin', '첫해 목돈 대신 해마다 같은 예산'), ('wrench', '무상 A/S · 세척 · 케어 비용 포함'), ('calendar', '3~6년, 1년 단위로 기간 선택')]
    W = (1152 - 2 * 16) / 3
    for i, (ic, t) in enumerate(pts):
        x = 64 + i * (W + 16)
        box(s, x, 528, W, 120, bg='#ffffff', r=16, border=f'1px solid {LINE}')
        s.ico(x + 20, 556, ic, size=56, r=16)
        s.t(x + 92, 570, W - 112, t, 18, 800, INK, 1.4, name=f'k{i}', clamp=2)
    s.foot2(FOOT, 17)
    return reg(s, '예산 흐름 비교 · 일시불 vs 구독 6년', '일시불은 첫해에 몰리고 구독은 해마다 같은 예산이라는 흐름을 막대로 보여 줄 때 (금액은 견적으로 채움)', 'cost', ['costs'], ['sub_b2b_ai'])


# ------------------------------------------------------------------ 15 · 도입 혜택 (기간 한정)
def promo():
    p = PROMO
    s = T('L_SUB_PROMO'); s.head2(EB + ' · 도입 혜택', '지금 구독하면 받는 런칭 기념 혜택')
    per = f"{p['validFrom'][:4]}.{int(p['validFrom'][5:7])}.{int(p['validFrom'][8:])} – {int(p['validTo'][5:7])}.{int(p['validTo'][8:])} 계약 고객"
    s.chip(64, 128, per, name='per', bg=INK, color='#ffffff', size=15, h=36, pad=16)
    s.chip(330, 128, '품목 · 모델에 따라 할인율 다름', name='nt', bg='#ffffff', color=GRAY, size=14, h=36, pad=14, border=f'1px solid {LINE}')
    b = p['benefits']
    cards = [(b[0]['value'], b[0]['unit'], b[0]['title'], ' · '.join(b[0]['items'])), ('+' + b[1]['value'], '추가 할인', b[1]['title'], '총 구독료 기준 · ' + ' · '.join(b[1]['items'][:4]) + ' 등'),
             ('+' + b[2]['value'], '추가 할인', b[2]['title'], '총 구독료 기준 · ' + ' · '.join(b[2]['items'][:4]) + ' 등')]
    xs = [(64, 456), (536, 332), (884, 332)]
    for i, ((v, u, tt, ln), (x, w)) in enumerate(zip(cards, xs)):
        hi = i == 0
        box(s, x, 184, w, 260, bg=BLUE if hi else SKY, r=18)
        numunit(s, x + 28, 214, w - 56, v, u, size=60 if hi else 50, usize=20, color='#ffffff' if hi else BLUE, ucolor='rgba(255,255,255,0.85)' if hi else INK2, vname=f'v{i}', uname=f'u{i}')
        s.t(x + 28, 300, w - 56, tt, 20, 800, '#ffffff' if hi else INK, 1.35, name=f't{i}', clamp=2)
        s.t(x + 28, 372, w - 56, ln, 14, 600, 'rgba(255,255,255,0.86)' if hi else INK2, 1.5, name=f'l{i}', clamp=2)
    cuts = [('냉장고', 'ref'), ('세탁기 · 건조기', 'washdry'), ('에어컨', 'ac'), ('공기청정기', 'air'), ('정수기', 'water'), ('TV', 'tv')]
    W = (1152 - 5 * 12) / 6
    for i, (lb, cid) in enumerate(cuts):
        x = 64 + i * (W + 12)
        box(s, x, 464, W, 184, bg=SURF, r=16)
        s.pic(x + 18, 476, W - 36, 120, CUT(cid), f'{lb} 제품 컷', kind='cut', r=8, name=f'img{i}', bg=SURF)
        s.t(x + 10, 608, W - 20, lb, 15, 800, INK2, 1.3, name=f'il{i}', nowrap=True, align='center')
    s.foot2(FOOT, 18)
    ex = {'until': p['validTo']}
    if p.get('state') != 'active': ex['retired'] = 'L_SUB_TERMS'  # 혜택이 끝나면 새로 고르는 곳에서만 빠지고 저장된 제안서는 그대로 그림
    return reg(s, '도입 혜택 · 기간 한정 할인 3', f"B2B 삼성 AI 구독 런칭 혜택(최대 20% + 추가 할인)을 보여 줄 때 — {p['validTo']}까지 계약분, 기간이 지나면 DSS run 이 은퇴(retired)시킴", 'cost', ['costs', 'products'],
               [p['id']], [PID(c) for _, c in cuts], extra=ex)


# ------------------------------------------------------------------ 16 · 도입 절차 6
FLOW = [('phone2', '구독 문의', '1588-3366 · 구독 문의하기', False), ('handshake', '조건 확인', '신용도 · 품목 · 수량', False), ('doc', '계약', '기간 3~6년 · 관리 옵션 · 방문 주기', False),
        ('truck', '배송 · 설치', '사업장별 설치 일정 협의', True), ('wrench', '정기 케어 · A/S', '방문케어 · B2B 블루패스', False), ('repeat', '만기 · 재계약', '만기 후 처리 협의', True)]


def flow():
    s = T('L_SUB_FLOW'); s.head2(EB + ' · 도입 절차', '문의부터 정기 케어까지, 구독 도입은 이렇게 진행됩니다')
    W = (1152 - 5 * 16) / 6
    for i, (ic, tt, ln, inf) in enumerate(FLOW):
        x = 64 + i * (W + 16)
        box(s, x, 128, W, 236, bg=SURF, r=18)
        s.num2(x + 20, 148, i + 1, d=30, size=14, name=f'no{i}')
        s.ico(x + 20, 196, ic if ic in ICONS else 'check', size=52, r=14, bg='#ffffff')
        s.t(x + 20, 266, W - 40, tt, 19, 800, INK, 1.3, name=f'st{i}', nowrap=True)
        s.t(x + 20, 298, W - 40, ln, 14, 600, GRAY, 1.45, name=f'sl{i}', clamp=2)
        if inf: s.chip(x + W - 72, 150, '협의', name=f'tg{i}', bg='#ffffff', color=GRAY, size=12, h=26, pad=10, border=f'1px dashed {DASH}')
        if i < 5: s.raw(f'<div style="position: absolute; left: {f(x + W - 2)}px; top: 236px">' + svg_icon('arrow', 18, DASH, 2.4) + '</div>')
    s.pic(64, 384, 420, 264, A('kv-grid'), '업종 공간 · 구독 품목 사진', kind='space', r=18, name='img')
    box(s, 508, 384, 708, 264, bg=BLUE, r=18)
    s.t(540, 414, 500, '구독 문의', 16, 800, '#9db4ff', 1.3, name='ck', nowrap=True, extra='letter-spacing: 0.04em')
    s.t(540, 440, 500, PROG['inquiry']['phone'], 52, 800, '#ffffff', 1.3, name='cp', nowrap=True, extra=f'font-family: {NUMF}; letter-spacing: -0.02em')
    s.t(540, 518, 640, '제품 · 서비스 · 구독 문의 / samsung.com/sec/business 견적문의', 16, 700, 'rgba(255,255,255,0.86)', 1.5, name='cl', clamp=2)
    s.chip(540, 588, '대상: 정부 · 지자체 · 공공기관 · 일정 신용등급 이상 법인', name='ct', bg='rgba(255,255,255,0.16)', color='#ffffff', size=13, h=30, pad=12, maxw=640)
    s.foot2(FOOT, 19)
    return reg(s, '도입 절차 6 · 단계 + 문의', '구독 문의 · 조건 확인 · 계약 · 설치 · 정기 케어 · 만기까지 도입 단계를 보여 주고 문의처로 닫을 때', 'execution', ['timeline', 'contacts', 'images'], ['sub_b2b_ai'])


# ------------------------------------------------------------------ 17 · FAQ 6
def faq():
    s = T('L_SUB_FAQ'); s.head2('부록 · B2B 삼성 AI 구독', '구독 도입 전에 자주 묻는 질문 여섯 가지')
    W, Hh = (1152 - 2 * 16) / 3, 252
    for i, q in enumerate(PROG['faq']):
        x = 64 + (i % 3) * (W + 16); y = 128 + (i // 3) * (Hh + 16)
        box(s, x, y, W, Hh, bg=SURF, r=18)
        s.num2(x + 22, y + 24, 'Q', d=34, size=15, name=f'qn{i}')
        s.t(x + 68, y + 26, W - 92, q['q'], 18, 800, INK, 1.4, name=f'q{i}', clamp=2)
        a = re.sub(r'\s*자세한 내용은.*$', '', q['a']).rstrip(' ,') or q['a']
        a = a.replace('있으므로', '있습니다.') if a.endswith('있으므로') else a
        s.t(x + 22, y + 104, W - 44, a, 15, 600, INK2, 1.6, name=f'a{i}', clamp=5)
    s.foot2(FOOT, 22)
    return reg(s, 'FAQ 6 · 구독 조건 질문과 답', '구매 조건 · 제한 품목 · 수량 · 기간 · 방문 주기 · 해지를 질문과 답으로 정리할 때', 'appendix', ['costs'], ['sub_b2b_ai'])


# ------------------------------------------------------------------ 18 · 업종별 구독 가치 4
def ind4():
    s = T('L_SUB_IND4'); s.head2(EB + ' · 업종별 가치', '사업장마다 다른 구독의 가치')
    W = (1152 - 3 * 20) / 4
    photo = {'dorm': (A('val-dorm'), '60% 50%'), 'hospital': (A('val-hospital'), '40% 50%'), 'hotel': (A('val-hotel'), '62% 50%'), 'office': (A('val-office'), '55% 50%')}
    for i, it in enumerate(PROG['industries']):
        x = 64 + i * (W + 20); ph, pos = photo.get(it['key'], (A('kv-grid'), '50% 50%'))
        s.pic(x, 128, W, 330, ph, f'{it["place"]} 사진', kind='space', r=18, name=f'img{i}', pos=pos)
        place_chip(s, x + 14, 142, it['place'], name=f'pl{i}')
        s.t(x, 482, W, it['title'], 20, 800, INK, 1.4, name=f'tt{i}', clamp=2)
        s.t(x, 548, W, it['line'], 16, 600, GRAY, 1.6, name=f'ln{i}', clamp=3)
    s.foot2(FOOT, 11)
    return reg(s, '업종별 구독 가치 4 · 사진 카드', '대학교 기숙사 · 병원 · 호텔 · 오피스에서 구독이 주는 가치를 사진으로 보여 줄 때', 'scenario', ['images', 'values'], ['sub_b2b_ai'])


# ------------------------------------------------------------------ 19 · 구독 한 장 요약
def one():
    s = T('L_SUB_ONE'); s.head2(EB, '초기 비용은 낮추고 관리는 삼성이 — B2B 삼성 AI 구독 한 장 요약')
    s.pic(64, 128, 392, 520, A('kv-grid'), '구독 품목 대표 이미지', kind='space', r=18, name='img')
    W = (1216 - 480 - 2 * 14) / 3
    ONE3 = [('coin', '초기 비용 부담 감소', '월 분할 납부 · 무상 A/S'), ('wrench', '시설 관리 효율화', '전문 엔지니어 정기 관리'), ('users', '고객 만족도 향상', '위생적인 사업장 · 최신 제품')]
    for i, (ic, tt, ln) in enumerate(ONE3):
        x = 480 + i * (W + 14)
        box(s, x, 128, W, 128, bg=SURF, r=16)
        s.ico(x + 18, 146, ic, size=44, r=12, bg='#ffffff')
        s.t(x + 74, 158, W - 92, tt, 16, 800, INK, 1.35, name=f'vt{i}', nowrap=True)  # dense — 원문 가치 문구('초기 비용 부담 감소')가 한 줄에
        s.t(x + 18, 208, W - 36, ln, 14, 700, BLUE, 1.4, name=f'vl{i}', nowrap=True)
    nums = [('3~6', '년', '구독 기간'), ('6·12·36', '개월', '방문 주기'), ('6', '년', '최대 무상 AS'), ('48', '시간', '긴급 출동')]
    W2 = (1216 - 480 - 3 * 12) / 4
    for i, (v, u, lb) in enumerate(nums):
        x = 480 + i * (W2 + 12)
        box(s, x, 272, W2, 108, bg=SKY, r=16)
        numunit(s, x + 18, 292, W2 - 36, v, u, size=30, usize=14, vname=f'kv{i}', uname=f'ku{i}')
        s.t(x + 18, 338, W2 - 36, lb, 14, 700, INK2, 1.3, name=f'kl{i}', nowrap=True)
    W3 = (1216 - 480 - 3 * 12) / 4
    for i, pk in enumerate(PKGS):
        x = 480 + i * (W3 + 12)
        s.pic(x, 396, W3, 100, pk['photo'], f'{pk["place"]} 사진', kind='space', r=12, name=f'pk{i}')
        s.t(x, 506, W3, pk['name'], 15, 800, INK, 1.3, name=f'pn{i}', nowrap=True)
        s.t(x, 528, W3, ' · '.join(it['label'] for it in pk['items'][:2]) + ' …', 12, 600, GRAY, 1.3, name=f'pi{i}', nowrap=True)
    box(s, 480, 564, 736, 84, bg=BLUE, r=16)
    s.t(504, 580, 200, '구독 문의', 14, 800, '#9db4ff', 1.3, name='ck', nowrap=True)
    s.t(504, 602, 220, PROG['inquiry']['phone'], 26, 800, '#ffffff', 1.2, name='cp', nowrap=True, extra=f'font-family: {NUMF}')
    s.t(744, 588, 452, '정부 · 지자체 · 공공기관 · 일정 신용등급 이상 법인 대상', 15, 700, 'rgba(255,255,255,0.9)', 1.45, name='ct', clamp=2)
    s.foot2(FOOT, 3)
    return reg(s, '구독 한 장 요약 · 가치 · 조건 · 패키지 · 문의', '구독 제안을 한 장으로 끝내야 할 때 — 가치 3 · 숫자 4 · 패키지 4 · 문의처', 'overview', ['values', 'costs', 'contacts', 'images'], [p['id'] for p in PKGS] + ['sub_b2b_ai', 'sub_bluepass_b2b'])


# ------------------------------------------------------------------ 20 · 계약 전 확인 6
CHK = [('calendar', '구독 기간 · 방문 주기', '3~6년(1년 단위) · 6 · 12 · 36개월 중 선택', False), ('wrench', '관리 옵션', '무상수리만 · 방문케어(점검 · 세척 포함)', False),
       ('coin', '납부 방식', '월 구독료 · 선납 혼합 · 연 단위 납부', True), ('building2', '계약 · 청구 단위', '본사 일괄 계약 · 사업장별 청구', True),
       ('handshake', '수량 · 신용 조건', '고객 신용도 · 품목에 따라 달라짐', False), ('repeat', '해지 · 만기', '중도 해지 시 위약금 · 회수비, 만기 후 처리', True)]


def check():
    s = T('L_SUB_CHECK'); s.head2(EB + ' · 계약 전 확인', '계약 전에 함께 정할 여섯 가지')
    W, Hh = (1152 - 2 * 16) / 3, 252
    for i, (ic, tt, ln, inf) in enumerate(CHK):
        x = 64 + (i % 3) * (W + 16); y = 128 + (i // 3) * (Hh + 16)
        box(s, x, y, W, Hh, bg=SURF if not inf else '#ffffff', r=18, border=None if not inf else f'1.5px dashed {DASH}')
        s.t(x + 26, y + 26, 80, f'{i+1:02d}', 30, 800, BLUE, 1.0, name=f'no{i}', extra=f'font-family: {NUMF}')
        s.ico(x + W - 80, y + 22, ic, size=56, r=16, bg='#ffffff' if not inf else SURF)
        s.t(x + 26, y + 104, W - 52, tt, 22, 800, INK, 1.3, name=f'tt{i}', nowrap=True)
        s.t(x + 26, y + 144, W - 52, ln, 16, 600, INK2, 1.55, name=f'ln{i}', clamp=2)
        s.chip(x + 26, y + Hh - 54, '협의' if inf else '원문 조건', name=f'tg{i}', bg='#ffffff' if not inf else SURF, color=GRAY if inf else BLUE, size=13, h=28, pad=12,
               border=f'1px dashed {DASH}' if inf else None)
    s.foot2(FOOT, 20)
    return reg(s, '계약 전 확인 6 · 원문 조건 + 협의 항목', '기간 · 관리 옵션 · 납부 · 청구 단위 · 수량 · 해지처럼 계약 전에 정할 것을 원문 조건과 협의 항목으로 나눠 보여 줄 때', 'execution',
               ['costs', 'quantities'], ['sub_b2b_ai'] + [p['id'] for p in PAYS if p['basis'] != 'official'], extra={'basis': 'mixed'})


def build():
    hero(); pains(); values3(); compare(); items8(); care4(); bluepass(); packs(); pkg_detail(4); pkg_detail(3)
    terms(); careopt(); pay5(); pay3(); budget()
    if PROMO: promo()  # 끝난 혜택도 장은 남긴다(저장 문서 호환) — meta.retired 로 새 선택에서만 뺌
    flow(); faq(); ind4(); one(); check()
    return META, HTML, SLOTS


if __name__ == '__main__':
    M, H, S = build()
    print(len(M), 'layouts')
