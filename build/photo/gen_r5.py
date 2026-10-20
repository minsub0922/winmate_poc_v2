# 5차 — 경쟁사 분석 · 시사점 / 제안 방향 레이아웃 공용 도우미 (gen_l16 ~ gen_l19 가 씀)
# 원칙: 경쟁사는 익명(경쟁사 A · B · C), 경쟁사 제품 자리에는 삼성 사진을 쓰지 않고 회색 실루엣(rival)을 둔다.
#       수치는 자리표시([00]% 등)와 ‘출처: [ ]’, 사진은 samsung.com 도입사례 · 비즈니스 페이지 · 공식 제품 컷.
from gen_ind import *

EB_CP = '03 · COMPETITION'          # 경쟁사 분석 장표의 eyebrow
EB_WHY = '07 · WHY SAMSUNG'         # Why Samsung 쪽으로 쓰는 비교 장표
EB_IN = '04 · INSIGHT & DIRECTION'  # 시사점 · 제안 방향 장표의 eyebrow


def ARR(x, y, w=44, h=20, size=18, color=BLUE, ch='→'):
    return f'<div style="{ab(x, y, w, h, f"display: flex; align-items: center; justify-content: center; color: {color}; font-size: {size}px; font-weight: 800")}">{ch}</div>'


def box(x, y, w, h, bg=SOFT, radius=12, extra=''):
    """plain background box (no text)"""
    return f'<div style="{ab(x, y, w, h, f"box-sizing: border-box; border-radius: {radius}px; background: {bg}; {extra}")}"></div>'


def rect(x, y, w, h, color, radius=0, extra=''):
    return f'<div style="{ab(x, y, w, h, f"background: {color}; border-radius: {radius}px; {extra}")}"></div>'


def rival(b, kind, x, y, w, h, hint='', radius=12, pad=16, bg=SOFT):
    """경쟁사 제품 자리 — 일반 형태 회색 실루엣. kind: signage · kiosk · outdoor · tablet · cassette · led · phone"""
    return b.img('ph.gen-rival-' + kind, ab(x, y, w, h), fit='contain', kind='cut',
                 hint=hint or '경쟁사 제품 사진 (공개 자료로 교체)', radius=radius, pad=pad, bg=bg)


def cut(b, pid, x, y, w, h, hint='', radius=12, pad=14, bg=SOFT):
    """삼성 제품 컷 (cut.* · fill.* kind cut) — 칸 안에 contain"""
    return b.img(pid, ab(x, y, w, h), fit='contain', kind='cut', hint=hint, radius=radius, pad=pad, bg=bg)


def tag_on(b, text, x, y, dark=True, size=12):
    """사진 위 왼쪽 위 작은 알약 라벨"""
    bg, c = (GLASS, '#ffffff') if dark else ('#ffffff', BLUE)
    return b.tb(text, ab(x, y, extra=f'border-radius: 999px; background: {bg}; color: {c}; font-size: {size}px; font-weight: 800; padding: 5px 11px; white-space: nowrap'), 'div')


def label_on(b, top, main, x, y, w, lines=2):
    """사진 아래쪽 유리 캡션: 위 작은 줄 + 굵은 한두 줄"""
    return glass(b.tb(top, f'font-size: 11px; font-weight: 800; color: {LB}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
                 + b.tb(main, f'font-size: 14px; font-weight: 800; line-height: 20px; color: #ffffff; {clamp(lines)}'), x, y, w, None, pad='9px 13px', gap=2)


def mark(b, m, x, y, w, h, hi=False, size=22):
    """● 충족 · ◐ 일부 · ○ 미흡 (글자 기호, 가운데 정렬)"""
    return b.tb(m, ab(x, y, w, h, f'display: flex; align-items: center; justify-content: center; font-size: {size}px; color: {BLUE if hi else "#7c8597"}'), 'div')


def legend_marks(b, x, y):
    return b.tb('● 충족 · ◐ 일부 · ○ 미흡', ab(x, y, 220, 16, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap'), 'div')


def sup(b, name, sub='', hi=False, size=15):
    """공급사 이름 + 작은 설명 (flex 칸 안에 넣는 조각)"""
    return (b.tb(name, f'font-size: {size}px; font-weight: 800; color: {BLUE if hi else INK}; white-space: nowrap')
            + (b.tb(sub, f'font-size: 11px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') if sub else ''))


def bignum(b, val, unit='', size=44, color=BLUE, unit_size=None, pre=''):
    """큰 숫자 + 단위 (baseline 정렬 span)"""
    us = unit_size or max(14, round(size * 0.42))
    return ('<span style="display: flex; align-items: baseline; gap: 4px">'
            + (b.tb(pre, f'font-size: {us}px; font-weight: 800; color: {color}') if pre else '')
            + b.tb(val, f'{NUM}; font-size: {size}px; font-weight: 800; line-height: 1.05; color: {color}; white-space: nowrap')
            + (b.tb(unit, f'font-size: {us}px; font-weight: 800; color: {color}') if unit else '') + '</span>')


def evid(b, text, color=MUTED, bg='#ffffff', border=LINE):
    """근거 칩 (출처 · 사례 · 쪽 번호)"""
    return b.tb(text, f'align-self: flex-start; height: 20px; padding: 0 8px; border-radius: 6px; background: {bg}; border: 1px solid {border}; color: {color}; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; white-space: nowrap')


def card(inner, x, y, w, h, bg=SOFT, pad='14px 16px', gap=6, radius=12, border=None, extra=''):
    """flex column card"""
    bd = f'border: 1.5px solid {border}; ' if border else ''
    return f'<div style="{ab(x, y, w, h, f"box-sizing: border-box; border-radius: {radius}px; background: {bg}; {bd}padding: {pad}; display: flex; flex-direction: column; gap: {gap}px; {extra}")}">{inner}</div>'
