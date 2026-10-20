# 4차 — 업종별 레이아웃 묶음 공용: 업종 이름 · 예시 고객 · 각주 · 도우미
from gen_base import *

NAMES = {'FB': '외식 · 카페', 'RT': '리테일', 'SV': '생활 편의 · 무인 매장', 'HT': '호텔 · 리조트', 'TP': '테마파크 · 관광 · 전시', 'VN': '공연장 · 경기장 · 영화관',
         'AD': '옥외 · 미디어 광고', 'OF': '오피스 · 업무 빌딩', 'RS': '주거 분양 · 주택', 'ID': '인테리어 · 가구 · 빌트인', 'ED': '교육 · 캠퍼스', 'PB': '공공 · 교통 인프라',
         'MD': '의료 · 요양 · 케어', 'MF': '제조 · 물류 · 현장', 'FN': '금융', 'OE': '파트너 전용 단말'}
CUST = {'FB': 'A 커피', 'RT': 'D 리테일', 'SV': 'N 체인', 'HT': 'B 호텔', 'TP': 'P 테마파크', 'VN': 'V 경기장', 'AD': 'Q 미디어', 'OF': 'C 빌딩',
        'RS': 'R 건설', 'ID': 'I 키친', 'ED': 'E 대학교', 'PB': 'S 지자체', 'MD': 'W 요양병원', 'MF': 'L 제조', 'FN': 'T 은행', 'OE': 'U 통신사'}
DEAL = {'FB': 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안', 'RT': 'D 리테일 체인 · 플래그십 매장 제안', 'SV': 'N 무인 매장 체인 · 무인 운영 제안',
        'HT': 'B 비즈니스 호텔 · 객실 · 로비 제안', 'TP': 'P 테마파크 · 몰입형 전시 제안', 'VN': 'V 스포츠 경기장 · 관람 경험 제안',
        'AD': 'Q 옥외 미디어 · 랜드마크 LED 제안', 'OF': 'C 오피스 빌딩 · 스마트 오피스 제안', 'RS': 'R 건설 · 아파트 분양 제안',
        'ID': 'I 키친 · 인테리어 브랜드 쇼룸 제안', 'ED': 'E 대학교 캠퍼스 · 스마트 교육 환경 제안', 'PB': 'S 지자체 · 공공 인프라 제안',
        'MD': 'W 요양병원 · 케어 환경 제안', 'MF': 'L 제조 공장 · 현장 디지털 제안', 'FN': 'T 은행 · 영업점 디지털 제안', 'OE': 'U 통신사 · 전용 단말 제안'}
# 사진 출처 꼬리 (업종 페이지 · 도입사례)
SRC = {'FB': '외식 · 카페', 'RT': '리테일', 'SV': '생활 편의 · 교육', 'HT': '호텔', 'TP': '테마파크 · 전시', 'VN': '경기장 · 공연장 · 영화관', 'AD': '옥외 광고',
       'OF': '오피스', 'RS': '주거 · 건설', 'ID': '인테리어 · 주거', 'ED': '교육', 'PB': '공공 · 교통', 'MD': '의료 · 요양', 'MF': '제조 · 물류', 'FN': '금융', 'OE': '모바일 · 통신'}


LOWRES = []   # (layout, pid, slot w×h, photo w×h) — 사진이 칸보다 작아 흐려지는 곳 (gen_all 이 알림)
_CUR = ['']


def native(pid):
    if pid.startswith('r4.'): return tuple(R4[pid[3:]]['size'])
    if pid.startswith('fill.'): return tuple(FILL[pid[5:]]['size'])
    if pid in PHI and PHI[pid].get('w'): return PHI[pid]['w'], PHI[pid]['h']
    return None


def layout(L, **meta):
    def deco(fn):
        b = B(); _CUR[0] = meta['f']; html = fn(b)
        L.append({**meta, 'html': root(html), '_b': b})
        return fn
    return deco


def glass(inner, x, y, w=None, h=None, pad='10px 14px', gap=3, extra=''):
    return f'<div style="{ab(x, y, w, h, f"box-sizing: border-box; border-radius: 12px; background: {GLASS}; padding: {pad}; display: flex; flex-direction: column; gap: {gap}px; {extra}")}">{inner}</div>'


def pill(b, text, bg=BLUE, color='#ffffff', size=11.5, extra=''):
    return b.tb(text, f'align-self: flex-start; height: 22px; padding: 0 9px; border-radius: 999px; background: {bg}; color: {color}; font-size: {size}px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap{"; " + extra if extra else ""}')


def numtag(b, n, size=24, bg=BLUE):
    return b.tb(n, f'width: {size}px; height: {size}px; flex-shrink: 0; border-radius: 50%; background: {bg}; color: #ffffff; font-size: {round(size * 0.46)}px; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; {NUM}')


def clamp(n):
    return f'display: -webkit-box; -webkit-line-clamp: {n}; -webkit-box-orient: vertical; overflow: hidden'


def photo(b, pid, x, y, w, h, pos='50% 50%', hint='', radius=12, kind='space'):
    cut = pid.startswith('cut.') or (pid.startswith('fill.') and FILL[pid[5:]]['kind'] in ('cut', 'ill'))
    n = None if cut else native(pid)
    if n and max(w / n[0], h / n[1]) > 1.15: LOWRES.append((_CUR[0], pid, f'{w}x{h}', f'{n[0]}x{n[1]}'))
    if n and not 1 / 2.8 < (n[0] / n[1]) / (w / h) < 2.8: LOWRES.append((_CUR[0], pid, f'{w}x{h}', f'{n[0]}x{n[1]}', 'CROP'))
    return b.img(pid, ab(x, y, w, h), pos=pos, fit='contain' if cut else 'cover', kind='cut' if cut else kind,
                 hint=hint, radius=radius, pad=14 if cut else 0, bg=SOFT if cut else 'transparent')


def kpi(b, label, val, w=None, dark=False):
    bg, lc, vc = ('rgba(255,255,255,0.12)', LT, '#ffffff') if dark else (CHIP, MUTED, BLUE)
    return (f'<div style="box-sizing: border-box; {"width: " + str(w) + "px; " if w else ""}border-radius: 10px; background: {bg}; padding: 7px 12px; display: flex; flex-direction: column; gap: 1px; min-width: 0">'
            + b.tb(label, f'font-size: 11px; font-weight: 700; color: {lc}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
            + b.tb(val, f'{NUM}; font-size: {18 if len(val) <= 12 else 15}px; font-weight: 800; color: {vc}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')


def pin(b, n, x, y, bg=BLUE, size=30):
    return b.tb(n, ab(x - size // 2, y - size // 2, size, size, f'box-sizing: border-box; border-radius: 50%; background: {bg}; color: #ffffff; border: 2px solid #ffffff; font-size: {round(size * 0.43)}px; font-weight: 800; display: flex; align-items: center; justify-content: center; {NUM}'), 'div')


import json as _json
HDR = _json.load(open('build/photo/r4_orig_hdr.json'))  # 원본 eyebrow · 제목 · 부제 (그대로 씀)


ORIG = _json.load(open('build/photo/r4_orig_foot.json'))  # 원본 각주 · 쪽 번호 · 예시 고객 · 오른쪽 위 태그


def foot(f, code, extra='수치는 예시'):
    o = ORIG[f]
    return f"{o['note']} · {extra} · 사진: samsung.com {SRC[code]} 도입사례 · 비즈니스 페이지", o['page']


def tagpill(b, text):
    """variant tag at the top right (원본 장표의 오른쪽 위 태그 — '… · 운영 모드' 등)"""
    return b.tb(text, f'position: absolute; right: 64px; top: 40px; height: 24px; padding: 0 11px; border-radius: 999px; background: {CHIP}; color: {BLUE}; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap', 'div')
