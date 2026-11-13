# 글자 역할(PROPOSAL_TYPE)을 구워 넣는 장 빌더 — build/toc/base.py 의 T 와 같은 그리기, 글자 크기만 역할 크기로.
# 샘플 시나리오(scenarios.js SCENARIOS)에 쓰이는 장은 모든 글 칸이 data-type-role 을 갖고 그 역할 크기여야 한다
# (app/tests/vertical-proposals.mjs). 업종별 표준 제안서 장(L_VS_*, app/scripts/vertical_standard/layouts.py)처럼
# 루트에 data-proposal-typography="2" 를 달아 앱의 타이포 보정(proposal_typography.js)이 다시 손대지 않게 한다.
# 쓰는 곳: 구독 장 L_SUB_*(build/subs/layouts.py) · 목차 사진 카드 L_TOC_INDEX4–8(build/toc/layouts.py index).
import re
from base import T, BLUE, INK, MUTE, LINE, DASH

# app/web/src/domain/templates/proposal_typography.js PROPOSAL_TYPE 와 같은 값
ROLE = {'fineprint': (10, 1.35), 'utility': (12, 1.35), 'label': (14, 1.35), 'dense': (16, 1.4), 'body': (18, 1.4),
        'heading': (20, 1.3), 'subheading': (24, 1.25), 'title': (32, 1.25), 'metric': (40, 1.2), 'cover': (48, 1.2), 'display': (56, 1.15)}
# 예전 크기 → 역할. 한 칸 차이(13 · 15 · 17 · 19)는 한 단계 위로, 그보다 큰 크기는 가까운 쪽(같으면 작은 쪽)으로.
SNAP = {9: 'fineprint', 10: 'fineprint', 11: 'utility', 11.5: 'utility', 12: 'utility', 13: 'label', 14: 'label', 15: 'dense', 16: 'dense',
        17: 'body', 18: 'body', 19: 'heading', 20: 'heading', 21: 'heading', 22: 'heading', 23: 'subheading', 24: 'subheading', 26: 'subheading',
        28: 'subheading', 30: 'title', 32: 'title', 34: 'title', 36: 'title', 40: 'metric', 44: 'metric', 48: 'cover', 50: 'cover', 52: 'cover',
        56: 'display', 60: 'display'}
FS = re.compile(r'font-size:\s*([\d.]+)px')


def role_of(size):
    size = float(size)
    if size in SNAP: return SNAP[size]
    raise ValueError(f'역할 표에 없는 글자 크기 {size}px — typed.SNAP 에 넣는다')


class TT(T):
    """T 와 같은 장 — 글 칸마다 data-type-role + 그 역할 크기. 머리(눈썹 · 제목) · 바닥은 표준 제안서 장(L_VS_*)과 같은 자리 · 크기."""
    def tb(self, style, content, tag='div', plain_text=None, name=None):
        m = FS.search(style)
        if not m: raise ValueError(f'{self.fid}: 글자 크기가 없는 칸({name or self.ntb}) — 크기를 적는다')
        role = role_of(m.group(1))
        style = style[:m.start()] + f'font-size: {ROLE[role][0]}px' + style[m.end():]
        return super().tb(style, content, tag, plain_text, name).replace(' data-tb="', f' data-type-role="{role}" data-tb="', 1)

    def head2(self, eb, title):
        self.raw(self.tb(f'position: absolute; left: 64px; top: 44px; width: 1000px; min-height: 19px; font-size: 14px; font-weight: 700; line-height: 1.35; letter-spacing: 0.06em; color: {BLUE}; white-space: nowrap', eb, name='eb'))
        self.raw(self.tb(f'position: absolute; left: 64px; top: 64px; width: 1152px; min-height: 40px; font-size: 32px; font-weight: 700; line-height: 1.25; letter-spacing: -0.02em; color: {INK}; white-space: nowrap', title, name='title'))  # 표준 장처럼 잘라 숨기지 않음 — 넘치면 렌더 확인이 잡는다

    def foot(self, text, page, dark=False):
        line = 'rgba(255,255,255,0.22)' if dark else LINE
        col = 'rgba(255,255,255,0.8)' if dark else MUTE
        bd = 'rgba(255,255,255,0.5)' if dark else DASH
        self.raw(f'<div style="position: absolute; left: 64px; top: 668px; width: 1152px; height: 1px; background: {line}"></div>')
        self.raw(self.tb(f'position: absolute; left: 64px; top: 680px; width: 72px; height: 20px; box-sizing: border-box; border: 1px dashed {bd}; border-radius: 4px; text-align: center; '
                         f'font-size: 12px; line-height: 18px; color: {col}; white-space: nowrap; overflow: hidden', '고객사 로고', name='logo'))
        self.raw(self.tb(f'position: absolute; left: 148px; top: 682px; width: 760px; font-size: 12px; line-height: 1.35; color: {col}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis', text, name='foot'))
        self.raw(self.tb(f'position: absolute; left: 996px; top: 682px; width: 220px; font-size: 12px; line-height: 1.35; text-align: right; color: {col}; font-family: Manrope, sans-serif; letter-spacing: .04em; white-space: nowrap',
                         f'CONFIDENTIAL · {page}', name='conf'))

    def html(self):
        return super().html().replace('<div ', '<div data-proposal-typography="2" ', 1)
