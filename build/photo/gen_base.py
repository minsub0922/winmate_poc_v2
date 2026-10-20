# Builder helpers for photo-first layouts (1280×720, data-tb / data-img like the existing canvases)
import json, html as H

PHI = json.load(open('build/photo/ph_images.json'))
EXIST = json.load(open('data/images.json'))['pids']
# official product cuts already published under img/bs/
CUTS = {
    'cut.qm43c': ('img/bs/p-qm43c.png', 'QM43C', '스마트 사이니지 QM43C · 정면'),
    'cut.qm55c': ('img/bs/p-qm55c.png', 'QM55C', '스마트 사이니지 QM55C · 정면'),
    'cut.qm65c': ('img/bs/p-qm65c.png', 'QM65C', '스마트 사이니지 QM65C · 정면'),
    'cut.qm85c': ('img/bs/p-qm85c.png', 'QM85C', '스마트 사이니지 QM85C · 정면'),
    'cut.qb55c': ('img/bs/p-qb55c.png', 'QB55C', '스마트 사이니지 QB55C · 정면'),
    'cut.km24c': ('img/bs/p-km24c.png', 'KM24C', '삼성 키오스크 KM24C · 정면'),
    'cut.oh55a': ('img/bs/p-oh55a-s.png', 'OH55A-S', '옥외 사이니지 OH55A-S · 정면'),
    'cut.om55b': ('img/bs/p-om55b.png', 'OM55B', '윈도 사이니지 OM55B · 정면'),
    'cut.vm55b': ('img/bs/p-vm55b.png', 'VM55B', '비디오월 VM55B · 정면'),
    'cut.wa75d': ('img/bs/p-wa75d.png', 'WM75B', '전자칠판 · 정면'),
    'cut.xhb': ('img/bs/p-xhb.png', 'XHB', '실외 LED 사이니지 캐비닛'),
    'cut.ifr': ('img/bs/p-ifr.png', 'IFR', '실내 스마트 LED 사이니지'),
    'cut.hg55bu': ('img/bs/p-hg55bu.png', 'HG55BU', '호텔 TV 55" · 정면'),
    'cut.hg43bu': ('img/bs/p-hg43bu.png', 'HG43BU', '호텔 TV 43" · 정면'),
    'cut.wf4way': ('img/bs/p-windfree-4way.png', 'WindFree 4Way', '무풍 4Way 카세트'),
    'cut.wf1way': ('img/bs/p-windfree-1way.png', 'WindFree 1Way', '무풍 1Way 카세트'),
    'cut.dvms2': ('img/bs/p-dvm-s2.png', 'DVM S2', '시스템에어컨 실내기 (원형)'),
    'cut.tabs11': ('img/bs/p-sm-x930.png', 'SM-X930', '갤럭시 탭 · 정면'),
    'cut.tabactive5': ('img/bs/p-sm-x350.png', 'SM-X350', '갤럭시 탭 액티브 · 정면'),
    'cut.xcover7': ('img/bs/p-sm-g766.png', 'SM-G766', '갤럭시 XCover · 정면'),
    'cut.purifier': ('img/bs/p-infinite-ai.png', 'Infinite AI', '공기청정기 · 정면'),
    'cut.bi_fridge': ('img/bs/p-bespoke-built-in.png', 'Bespoke Built-in', '비스포크 빌트인 냉장고'),
}

FILL = json.load(open('build/fill/images.json'))  # samsung.com photos packed in img/fill/*.json (build/fill)
R4 = json.load(open('build/photo/r4_images.json'))  # 4차 도입사례 사진 — img/fill/r4-*.json (build/photo/r4_photos.py)
BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'


def img_info(pid):
    if pid.startswith('fill.'): v = FILL[pid[5:]]; return 'fill:' + v['addr'], v['desc']
    if pid.startswith('r4.'): v = R4[pid[3:]]; return 'fill:' + v['addr'], v['desc']
    if pid in PHI: v = PHI[pid]; return ('fill:' + v['addr'] if v.get('addr') else v['file']), v['desc']
    if pid in CUTS: return CUTS[pid][0], CUTS[pid][2]
    v = EXIST[pid]; return v['file'], (v.get('model', '') + ' — ' + v.get('desc', '')).strip(' —')

E = lambda s: H.escape(str(s), quote=False)
EA = lambda s: H.escape(str(s), quote=True)

INK, MUTED, BODY, BLUE, LINE, SOFT, CHIP, FAINT = '#121417', '#596170', '#3d4452', '#1428a0', '#e2e5ea', '#f5f6f8', '#eaeefb', '#8a91a0'
GLASS = 'rgba(12,16,26,0.74)'
LB = '#9db4ff'   # light blue on dark
LT = '#d5d9e0'   # light text on dark
WARN, WARNBG = '#b4441b', '#fdf0ea'
NUM = 'font-family: Manrope, sans-serif'


class B:
    def __init__(self):
        self.t = 0; self.i = 0; self.slots = []; self.texts = []; self.hdr = None; self.foot = ''

    def tb(self, text, style, tag='span'):
        n = self.t; self.t += 1; self.texts.append(str(text))
        return f'<{tag} style="{style}" data-tb="{n}">{E(text)}</{tag}>'

    def img(self, pid, style, fit='cover', pos='50% 50%', kind='photo', hint='', pad=0, bg='transparent', radius=0):
        n = self.i; self.i += 1
        src, desc = img_info(pid)
        self.slots.append({'pid': pid, 'kind': kind, 'hint': hint or desc})
        return (f'<div style="{style}; box-sizing: border-box; padding: {pad}px; overflow: hidden; border-radius: {radius}px; background: {bg};" '
                f'data-slot="Photo" data-pid="{pid}" data-img="{n}" data-kind="{kind}" data-hint="{EA(hint or desc)}">'
                + (f'<img src="{BLANK}" data-fill="{src[5:]}"' if src.startswith('fill:') else f'<img src="{src}"')
                + f' alt="{EA(desc)}" style="display: block; width: 100%; height: 100%; object-fit: {fit}; object-position: {pos};" data-pid="{pid}"></div>')


def ab(x, y, w=None, h=None, extra=''):
    s = f'position: absolute; left: {x}px; top: {y}px'
    if w is not None: s += f'; width: {w}px'
    if h is not None: s += f'; height: {h}px'
    return s + ('; ' + extra if extra else '')


def root(inner, bg='#ffffff', color=INK):
    return (f'<div style="width: 1280px; height: 720px; position: relative; overflow: hidden; background: {bg}; color: {color}; '
            f"font-family: 'Noto Sans KR', system-ui, sans-serif; word-break: keep-all; overflow-wrap: anywhere\">{inner}</div>")


def header(b, eb, hl, sub=None, x=64, w=1100, dark=False, y=44, hsize=30, sub_y=None):
    c1, c2, c3 = (LB, '#ffffff', LT) if dark else (BLUE, INK, MUTED)
    b.hdr = (eb, hl, sub or '')
    s = b.tb(eb, ab(x, y, extra=f'font-size: 13px; font-weight: 700; letter-spacing: 0.06em; color: {c1}'), 'div')
    s += b.tb(hl, ab(x, y + 22, w, extra=f'font-size: {hsize}px; font-weight: 700; line-height: 1.3; letter-spacing: -0.02em; color: {c2}; word-break: keep-all'), 'div')
    if sub is not None:
        sy = sub_y if sub_y is not None else y + 22 + round(hsize * 1.3) + 8
        s += b.tb(sub, ab(x, sy, w, extra=f'font-size: 15px; line-height: 1.5; color: {c3}; word-break: keep-all'), 'div')
    return s


def footer(b, note, page, x0=64, x1=1216, dark=False):
    b.foot = note
    lc, tc = ('rgba(255,255,255,0.28)', 'rgba(255,255,255,0.72)') if dark else (LINE, FAINT)
    bd = 'rgba(255,255,255,0.5)' if dark else '#b8bec8'
    s = f'<div style="{ab(x0, 668, x1 - x0, 1, "background: " + lc)}"></div>'
    s += (f'<div style="{ab(x0, 680, extra=f"display: flex; align-items: center; gap: 12px; font-size: 11px; color: {tc}; max-width: {x1 - x0 - 120}px")}">'
          + b.tb('고객사 로고', f'width: 72px; height: 20px; flex-shrink: 0; box-sizing: border-box; border: 1px dashed {bd}; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 9px')
          + b.tb(note, 'white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += b.tb(f'CONFIDENTIAL · {page}', f'position: absolute; left: {x1 - 110}px; width: 110px; text-align: right; top: 683px; font-size: 11px; color: {tc}; {NUM}', 'div')
    return s


def chip(b, text, color=BLUE, bg=CHIP, size=11.5, h=22, extra=''):
    return b.tb(text, f'align-self: flex-start; height: {h}px; padding: 0 9px; border-radius: 999px; background: {bg}; color: {color}; font-size: {size}px; font-weight: 700; display: inline-flex; align-items: center; white-space: nowrap{"; " + extra if extra else ""}')


def glass_label(b, x, y, top, main, w=None, extra=''):
    """small dark caption on a photo: eyebrow-ish top line + main line"""
    s = f'<div style="{ab(x, y, w, extra=f"box-sizing: border-box; border-radius: 10px; background: {GLASS}; padding: 8px 12px; display: flex; flex-direction: column; gap: 2px; {extra}")}">'
    if top: s += b.tb(top, f'font-size: 11px; font-weight: 700; color: {LB}; letter-spacing: 0.03em')
    s += b.tb(main, 'font-size: 13.5px; font-weight: 700; color: #ffffff') + '</div>'
    return s


def numbadge(b, n, x, y, size=26, bg=BLUE):
    return b.tb(n, ab(x, y, size, size, f'border-radius: 50%; background: {bg}; color: #ffffff; font-size: {round(size * 0.46)}px; font-weight: 800; display: flex; align-items: center; justify-content: center; {NUM}'), 'div')
