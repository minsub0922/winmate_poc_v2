# 당사의 이해 · 경쟁 우위 — 업종 묶음마다 장 3개: 경쟁 구도 · 통합 솔루션 → 핵심 스펙 → 같은 업종 사례
#   경쟁사보다 나은 점을 세 가지 근거로 보인다(사용자 규칙 2026-11-16): ① 통합 솔루션 ② 제품의 핵심 스펙에 바탕을 둔 key message ③ 여러 사례.
#   세 장의 틀은 같고, 업종마다 달라지는 것은 묶음 파일(<묶음>.py 의 COMPETE)이 정한다 — 영역 축 · 놓이는 제품 · 묶는 솔루션 · 경쟁 유형이 맡는 범위,
#   대표 제품과 스펙별 메시지, 같은 업종 사례.
#   삼성 칸은 모두 실제 값이다(data.py 가 앱 자료에서 읽고, 없으면 멈춘다): 제품 · 컷 · 솔루션 이름 · 스펙 값 · 사례 이름 · 도입 내용 · 사진.
#   경쟁사 칸은 예시(경쟁 유형은 익명) 또는 00 이다 — 제안할 때 조사한 내용으로 바꾼다. 경쟁사의 숫자는 지어 적지 않는다.
from kit import *
import data

AREA_ICON = {'SmartThings Home': 'home', 'SmartThings Safety': 'shield', 'MagicINFO': 'template', 'VXT CMS': 'cloud'}


def rival(C, cfg):
    """경쟁 구도 · 통합 솔루션 — 업종의 영역 축 위에 삼성(영역마다 제품 + 하나로 묶는 솔루션)과 경쟁 유형 둘(맡는 영역만)을 나란히"""
    vid = cfg['rep']; A, B = data.rivals(vid); areas = cfg['areas']; n = len(areas)
    s = sheet(f"L_TOC_UA_{C['id']}_RIVAL", '경쟁 구도', cfg['title'])
    X0, CW, GAP = 268, 178, 14
    col = lambda i: X0 + i * (CW + GAP)
    for i, (area, kind, name) in enumerate(areas):
        s.box(col(i), 128, CW, 56, bg=SURF, r=14)
        s.t(col(i), 144, CW, area, 18, 800, INK, 1.3, name=f'a{i}', align='center', nowrap=True)
    # 삼성 — 영역마다 놓이는 제품(컷) · 솔루션
    s.box(64, 196, 188, 172, bg=BLUE, r=18)
    s.t(84, 214, 148, '삼성', 24, 800, WHITE, 1.3, name='s', nowrap=True)
    s.t(84, 250, 148, '한 공급사', 16, 700, W88, 1.3, name='sl', nowrap=True)
    numu(s, 84, 314, 148, f'{n} / {n}', '영역', 32, 16, color=WHITE, ucolor=W88, name='sc')
    for i, (area, kind, name) in enumerate(areas):
        x = col(i)
        s.box(x, 196, CW, 172, bg=TINT, r=16)
        if kind == 'p':
            s.pic(x + 16, 208, CW - 32, 96, data.product(vid, name)['cut'], f'{area}에 놓이는 삼성 제품 컷', kind='cut', r=12, name=f'pc{i}', bg=WHITE, pad=8)
        else:
            data.solution(vid, name)
            s.box(x + 16, 208, CW - 32, 96, bg=WHITE, r=12)
            s.raw(f'<div style="position: absolute; left: {f(x + CW / 2 - 24)}px; top: 232px">' + svg_icon(AREA_ICON.get(name, 'layers'), 48, BLUE, 1.8) + '</div>')
        s.t(x + 10, 314, CW - 20, name, 16, 800, BLUE, 1.35, name=f'p{i}', align='center', clamp=2)
    # 하나로 묶는 솔루션 — 영역 전체에 걸친 띠
    s.box(64, 380, 1150, 52, bg=BLUE, r=14)
    s.t(84, 396, 172, '하나로 묶는 솔루션', 16, 700, W88, 1.3, name='pl', nowrap=True)
    chips = ''.join(s.tb(f'height: 36px; padding: 0 16px; box-sizing: border-box; border-radius: 999px; background: {GLASS}; color: #ffffff; display: flex; align-items: center; font-size: 16px; font-weight: 800',
                         data.solution(vid, nm), name=f'so{k}') for k, nm in enumerate(cfg['platform']))
    s.raw(f'<div style="position: absolute; left: {X0}px; top: 388px; display: flex; gap: 10px; white-space: nowrap">{chips}</div>')
    # 경쟁 유형 둘 — 맡는 영역만 칸이 차 있다(예시)
    for r, (nm, cells) in enumerate(((A, cfg['a']), (B, cfg['b']))):
        y = 448 + r * 100
        if len(cells) != n: raise SystemExit(f"{C['id']}: 경쟁 유형 칸 수가 영역 수와 다르다")
        s.box(64, y, 188, 88, bg=SURF, r=16)
        s.t(84, y + 12, 150, nm, 16, 800, INK, 1.3, name=f'c{r}', clamp=2)
        numu(s, 84, y + 58, 150, f'{sum(1 for on, _ in cells if on)} / {n}', '영역', 20, 14, color=GRAY, ucolor=MUTE, name=f'c{r}c')
        for i, (on, note) in enumerate(cells):
            s.box(col(i), y, CW, 88, bg=SURF if on else WHITE, r=14, border=None if on else f'1.5px dashed {DASH}')
            s.t(col(i) + 10, y, CW - 20, note, 16, 800 if on else 600, INK2 if on else MUTE, 1.35, name=f'c{r}_{i}', align='center', h=88,
                extra='display: flex; align-items: center; justify-content: center')
    return done(s, C, 7, '경쟁 구도 · 통합 솔루션', f'영역 {n} × 삼성 · 경쟁 유형 2 + 묶는 솔루션 띠',
                '업종의 영역마다 삼성이 놓는 제품과 하나로 묶는 솔루션을 보이고, 경쟁 유형이 맡는 범위와 견줄 때 (경쟁 유형 칸은 예시 — 조사한 내용으로 바꿈)', group='compete')


def edge(C, cfg):
    """핵심 스펙 — 대표 제품의 실제 스펙 값 셋과 그 값이 이 업종에서 뜻하는 것(key message), 경쟁 제품 값은 00(조사해 넣는다)"""
    vid = cfg['vid']; H = data.hero(vid)
    s = sheet(f"L_TOC_UA_{C['id']}_EDGE", '핵심 스펙', cfg.get('title') or f"{H['nm']}, 핵심 스펙으로 보는 차이")
    s.box(64, 128, 360, 520, bg=SURF, r=18)
    s.chip(88, 150, '대표 제품', name='tag', bg=WHITE, color=BLUE, size=14, h=30, pad=12)
    s.pic(94, 196, 300, 264, H['cut'], '대표 제품 컷', kind='cut', r=16, name='pc', bg=WHITE, pad=18)
    s.t(88, 482, 312, H['nm'], 24, 800, INK, 1.3, name='pn', clamp=2)
    s.t(88, 556, 312, H['model'], 16, 700, GRAY, 1.3, name='pm', nowrap=True, extra=NUM)
    if len(cfg['msgs']) != 3: raise SystemExit(f"{C['id']}: 스펙 메시지는 셋")
    for i, m in enumerate(cfg['msgs']):
        label, msg = m[0], m[1]; show = m[2] if len(m) > 2 else None; shown = m[3] if len(m) > 3 else label
        val = data.spec(vid, label, show); y = 128 + i * 180
        size = 48 if len(val) <= 6 else 40 if len(val) <= 9 else 32
        s.box(448, y, 768, 160, bg=WHITE, r=18, border=f'1px solid {LINE}')
        s.box(448, y, 300, 160, bg=BLUE, extra='border-radius: 18px 0 0 18px')
        s.t(472, y + (32 if size == 48 else 38 if size == 40 else 44), 264, val, size, 800, WHITE, 1.15, name=f'v{i}', nowrap=True, extra=NUM + '; letter-spacing: -0.02em')
        s.t(472, y + 108, 264, shown, 16, 700, W88, 1.3, name=f'l{i}', nowrap=True)
        s.t(776, y, 264, msg, 24, 800, INK, 1.35, name=f'm{i}', h=160, extra='display: flex; align-items: center')
        s.box(1064, y + 16, 136, 128, bg=SURF, r=14)
        small(s, 1064, y + 34, '경쟁 제품', MUTE, 136, 'center', name=f'rl{i}')
        s.t(1064, y + 62, 136, Z, 40, 800, GRAY, 1.15, name=f'r{i}', align='center', extra=NUM)
    return done(s, C, 8, '핵심 스펙', '대표 제품 컷 + 스펙 값 3 × 메시지 · 경쟁 제품 값',
                '대표 제품의 핵심 스펙 값과 그 값이 이 업종에서 뜻하는 것을 보이고, 같은 항목의 경쟁 제품 값과 견줄 때 (경쟁 제품 값은 조사해 직접 입력)', group='compete')


def proof(C, cfg):
    """같은 업종 사례 — 공식 도입사례 셋(사진 · 어떤 곳 · 도입한 것 · 도입 포인트) + 같은 업종의 다른 사례 이름, 경쟁사가 낸 사례 수는 00"""
    s = sheet(f"L_TOC_UA_{C['id']}_PROOF", '같은 업종 사례', cfg['title'])
    if len(cfg['cases']) != 3: raise SystemExit(f"{C['id']}: 사례는 셋")
    names = []
    for i, item in enumerate(cfg['cases']):
        name, pi = (item, 1) if isinstance(item, str) else item
        c = data.case(name, C['verticals']); x = 64 + i * 392; names.append(name)
        s.pic(x, 128, 368, 212, c['photos'][min(pi, len(c['photos']) - 1)], f'{name} 도입 현장 사진', r=16, name=f'ph{i}')
        s.t(x, 356, 368, c['cust'], 24, 800, INK, 1.3, name=f'n{i}', nowrap=True)
        s.t(x, 394, 368, c['kind'], 16, 700, GRAY, 1.3, name=f'k{i}', nowrap=True)
        s.t(x, 430, 368, c['items'], 16, 800, BLUE, 1.4, name=f'i{i}', clamp=2)
        s.t(x, 486, 368, c['point'], 18, 700, INK2, 1.4, name=f'p{i}', clamp=2)
        small(s, x, 546, f"{c['when']} · samsung.com 도입사례", MUTE, 368, name=f'w{i}')
    s.box(64, 584, 1152, 64, bg=SURF, r=16)
    s.t(88, 604, 190, '같은 업종의 다른 사례', 16, 800, INK, 1.3, name='ml', nowrap=True)
    chips = ''.join(s.tb(f'height: 36px; padding: 0 14px; box-sizing: border-box; border-radius: 999px; background: #ffffff; border: 1px solid {LINE}; color: {INK2}; display: flex; align-items: center; '
                         f'font-size: 14px; font-weight: 700', nm, name=f'mo{k}') for k, nm in enumerate(data.other_cases(C['verticals'], names)))
    s.raw(f'<div style="position: absolute; left: 272px; top: 598px; width: 650px; overflow: hidden; display: flex; gap: 8px; white-space: nowrap">{chips}</div>')
    s.t(936, 606, 170, '경쟁사가 낸 같은 업종 사례', 14, 800, MUTE, 1.3, name='rl', align='right', nowrap=True)
    numu(s, 1116, 598, 80, Z, '건', 24, 14, color=GRAY, ucolor=MUTE, name='rv', align='right')
    return done(s, C, 9, '같은 업종 사례', '도입사례 3(사진 · 도입한 것 · 포인트) + 다른 사례 이름',
                '같은 업종의 공식 도입사례 여러 건으로 먼저 검증된 것을 보일 때 (경쟁사가 낸 사례 수는 조사해 직접 입력)', group='compete')


def sheets(C, cfg):
    """묶음의 경쟁 우위 장 셋 — 묶음 파일의 SHEETS 뒤에 잇는다"""
    return [lambda: rival(C, cfg['rival']), lambda: edge(C, cfg['edge']), lambda: proof(C, cfg['proof'])]
