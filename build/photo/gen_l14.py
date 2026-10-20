# 4차 — 공간 하나 깊이 보기: 업종별 L_SS_xx_D · L_SS_xx_E 의 사진 버전 (ind 지정, 원본의 오른쪽 위 태그 그대로)
# 원본 32장은 다섯 가지 짜임 — 짜임마다 사진 레이아웃 하나:
#   route   동선 순서   — 지점 다섯 사진 + 지점별 하는 일 · 솔루션 · 지표, 아래 동선 전체 지표
#   users   이용자별    — 공간 사진 + 세 사람 장면 사진 · 지금 · 삼성 · 가치
#   problem 문제 → 해결 — 공간 사진 + 문제 셋, 문제마다 장면 사진 · 지금 · 솔루션 · 가치
#   mode    운영 모드   — 두 모드 사진 나란히 + 화면 · 설비 · 사람 세 줄 비교, 가운데 전환 방식
#   phased  단계별 도입 — 공간 사진 + 왜 단계적으로, 세 단계마다 사진 · 범위 · 더하는 것 · 운영 · 넘어가는 기준
# 데이터: r4data/ss_de.py (원본 f → kind + 내용)
from gen_ind import *
from r4data.ss_de import D
L = []
KN = {'route': '동선 다섯 지점 · 사진', 'users': '세 사람 · 장면 사진', 'problem': '문제 → 해결 · 장면 사진', 'mode': '운영 모드 둘 · 사진 비교', 'phased': '단계별 도입 · 단계 사진'}
KW = {'route': '한 공간의 동선을 따라 다섯 지점마다 움직이는 솔루션 · 기기와 지표를 지점 사진으로',
      'users': '같은 공간을 쓰는 세 사람이 겪는 순간과 얻는 가치를, 공간 사진과 사람마다 장면 사진으로',
      'problem': '한 공간에서 매일 생기는 문제 셋을 지금 → 솔루션 → 가치로, 문제마다 장면 사진과 함께',
      'mode': '같은 기기로 두 운영 모드(피크 · 한산, 낮 · 밤 등)를 바꾸는 것을, 두 모드 사진을 나란히 놓고',
      'phased': '한 공간에 시범 → 확대 → 전체로 단계적으로 들이는 계획을, 단계마다 사진 · 범위 · 넘어가는 기준과 함께'}
ARROW = lambda x, y, c=BLUE: f'<div style="{ab(x, y, 16, 16, f"display: flex; align-items: center; justify-content: center; color: {c}; font-size: 15px; font-weight: 800")}">→</div>'


def label(b, t, color=MUTED, w=None):
    return b.tb(t, f'font-size: 10.5px; font-weight: 800; color: {color}; white-space: nowrap' + (f'; width: {w}px; flex-shrink: 0' if w else ''))


# ---------------------------------------------------------------- route
def route(b, d):
    s = f'<div style="{ab(120, 168, 1040, 0, f"border-top: 2px dashed {BLUE}")}"></div>'
    for i, (nm, where, pid, pos, what, sol, dev, kl, kv) in enumerate(d['pts']):
        x = 64 + i * 234; w = 218
        s += photo(b, pid, x, 186, w, 196, pos=pos, hint=f'지점 {i + 1} · {nm} 사진', radius=12)
        s += numbadge(b, str(i + 1), x + 96, 155, size=26)
        s += (f'<div style="{ab(x, 392, w, 118, "display: flex; flex-direction: column; gap: 4px")}">'
              + '<span style="display: flex; align-items: baseline; gap: 6px; min-width: 0">' + b.tb(nm, 'font-size: 15px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + (b.tb(where, f'flex-shrink: 0; font-size: 11px; color: {MUTED}; white-space: nowrap') if where else '') + '</span>'
              + b.tb(what, f'font-size: 12.5px; line-height: 1.5; color: {BODY}; {clamp(2)}')
              + chip(b, sol, size=11, h=20, extra='margin-top: 2px; max-width: 100%; overflow: hidden; text-overflow: ellipsis')
              + b.tb(dev, f'font-size: 11px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        s += f'<div style="{ab(x, 516, w, 52)}">' + kpi(b, kl, kv) + '</div>'
    s += f'<div style="{ab(64, 584, 1152, 64, f"box-sizing: border-box; border-radius: 14px; background: {SOFT}; padding: 0 18px; display: flex; align-items: center; gap: 20px")}">'
    s += b.tb(d.get('total_title', '동선 전체'), 'width: 110px; flex-shrink: 0; font-size: 14px; font-weight: 800')
    for kl, kv in d['total']:
        s += (f'<span style="flex: 1; min-width: 0; display: flex; align-items: baseline; gap: 10px; padding-left: 18px; border-left: 1px solid {LINE}">'
              + b.tb(kl, f'min-width: 0; font-size: 12.5px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(kv, f'{NUM}; flex-shrink: 0; font-size: 17px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</span>')
    return s + '</div>'


# ---------------------------------------------------------------- users
def space_glass(b, no, nm, lines, chips_, x, y, w):
    inner = ('<span style="display: flex; align-items: center; gap: 8px">' + (numtag(b, no, 22) if no else '')
             + b.tb(nm, 'font-size: 16px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>')
    for t, st in lines:
        inner += b.tb(t, st)
    if chips_:
        inner += '<span style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px">' + ''.join(chip(b, c, color='#ffffff', bg='rgba(255,255,255,0.18)', size=10.5, h=20) for c in chips_) + '</span>'
    return glass(inner, x, y, w, None, pad='11px 14px', gap=4, extra='bottom: auto')


def users(b, d):
    no, nm, where, desc, pid, pos, sols = d['space']
    s = photo(b, pid, 64, 152, 380, 496, pos=pos, hint=f'{nm} 공간 사진 (고객 공간으로 교체)', radius=16)
    s += f'<div style="{ab(76, 152, 356, 484, "display: flex; flex-direction: column; justify-content: flex-end")}">' + space_glass(
        b, no, nm, [(where, f'font-size: 11.5px; font-weight: 700; color: {LB}'), (desc, f'font-size: 12px; line-height: 1.5; color: {LT}; {clamp(3)}'),
                    (d['one'], f'font-size: 12px; font-weight: 700; line-height: 1.45; color: #ffffff; {clamp(2)}')], sols, 0, 0, 356).replace('position: absolute; left: 0px; top: 0px; width: 356px;', 'position: relative; width: 356px;') + '</div>'
    for i, (who, role, when, ppid, ppos, now, act, dev, val, kl, kv) in enumerate(d['ppl']):
        y = 152 + i * 170
        s += photo(b, ppid, 464, y, 176, 158, pos=ppos, hint=f'{who} 장면 사진', radius=12, kind='people')
        s += (f'<div style="{ab(656, y, 384, 158, "display: flex; flex-direction: column; gap: 4px")}">'
              + '<span style="display: flex; align-items: center; gap: 8px; min-width: 0">' + b.tb(who, 'font-size: 16px; font-weight: 800; white-space: nowrap')
              + chip(b, role, size=10.5, h=19) + b.tb(when, f'min-width: 0; font-size: 11.5px; font-weight: 700; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
              + '<span style="display: flex; gap: 8px">' + label(b, '지금') + b.tb(now, f'font-size: 12.5px; line-height: 1.45; color: {MUTED}; {clamp(2)}') + '</span>'
              + '<span style="display: flex; gap: 8px">' + label(b, '삼성', BLUE) + b.tb(act, f'font-size: 13px; font-weight: 700; line-height: 1.45; {clamp(2)}') + '</span>'
              + b.tb(dev, f'margin-top: auto; font-size: 11px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        s += (f'<div style="{ab(1056, y, 160, 158, "display: flex; flex-direction: column; gap: 6px")}">'
              + b.tb(val, f'font-size: 12.5px; font-weight: 800; line-height: 1.45; color: {INK}; {clamp(3)}') + '<span style="margin-top: auto"></span>' + kpi(b, kl, kv) + '</div>')
        if i < 2: s += f'<div style="{ab(464, y + 164, 752, 1, f"background: {LINE}")}"></div>'
    return s


# ---------------------------------------------------------------- problem → solution
def problem(b, d):
    nos, nm, ppl, pid, pos, prods, sols = d['space']
    s = photo(b, pid, 64, 152, 300, 496, pos=pos, hint=f'{nm} 공간 사진 (고객 공간으로 교체)', radius=16)
    lines = [(ppl, f'font-size: 11.5px; font-weight: 700; color: {LB}')]
    lines += [('· ' + p, f'font-size: 11.5px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') for p in prods]
    s += f'<div style="{ab(76, 152, 276, 484, "display: flex; flex-direction: column; justify-content: flex-end")}">' + space_glass(
        b, nos, nm, lines, sols, 0, 0, 276).replace('position: absolute; left: 0px; top: 0px; width: 276px;', 'position: relative; width: 276px;') + '</div>'
    for hd, x in [('지금의 문제', 556), ('솔루션이 하는 일', 794), ('가치', 1078)]:
        s += b.tb(hd, ab(x, 152, 130, 16, f'font-size: 11px; font-weight: 800; color: {BLUE if hd != "지금의 문제" else WARN}'), 'div')
    for i, (tag, title, now, ppid, ppos, chips_, desc, dev, kl, kv, note) in enumerate(d['rows']):
        y = 174 + i * 160; h = 148
        s += photo(b, ppid, 384, y, 160, h, pos=ppos, hint=f'문제 {i + 1} · {tag} 장면 사진', radius=12)
        s += (f'<div style="{ab(556, y, 214, h, "display: flex; flex-direction: column; gap: 4px")}">'
              + '<span style="display: flex; align-items: center; gap: 6px">' + numtag(b, str(i + 1), 20) + b.tb(tag, f'font-size: 11px; font-weight: 700; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
              + b.tb(title, f'font-size: 14.5px; font-weight: 800; line-height: 1.4; {clamp(2)}')
              + '<span style="margin-top: auto; display: flex; flex-direction: column; gap: 1px">' + label(b, '지금', WARN) + b.tb(now, f'font-size: 12px; line-height: 1.45; color: {BODY}; {clamp(2)}') + '</span></div>')
        s += ARROW(772, y + h // 2 - 8)
        s += (f'<div style="{ab(792, y, 270, h, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; padding: 10px 12px; display: flex; flex-direction: column; gap: 5px")}">'
              + '<span style="display: flex; gap: 4px; flex-wrap: wrap">' + ''.join(chip(b, c, color='#ffffff', bg=BLUE, size=10.5, h=20) for c in chips_) + '</span>'
              + b.tb(desc, f'font-size: 12.5px; font-weight: 700; line-height: 1.45; color: {INK}; {clamp(3)}')
              + b.tb('기기 · ' + dev, f'margin-top: auto; font-size: 11px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        s += ARROW(1062, y + h // 2 - 8)
        s += (f'<div style="{ab(1078, y, 138, h, "display: flex; flex-direction: column; gap: 6px")}">' + kpi(b, kl, kv)
              + b.tb(note, f'font-size: 11.5px; line-height: 1.45; color: {BODY}; {clamp(3)}') + '</div>')
    return s


# ---------------------------------------------------------------- two operating modes
def mode_panel(b, m, x, dark):
    title, when, pid, pos, rows, vl, vv = m
    w = 520
    s = (f'<div style="{ab(x, 150, w, 28, "display: flex; align-items: center; justify-content: space-between; gap: 10px")}">'
         + b.tb(title, 'font-size: 17px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
         + b.tb(when, f'flex-shrink: 0; height: 22px; padding: 0 10px; border-radius: 999px; background: {BLUE if dark else CHIP}; color: {"#ffffff" if dark else BLUE}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap') + '</div>')
    s += photo(b, pid, x, 184, w, 158, pos=pos, hint=f'{title} 장면 사진', radius=12)
    for i, (what, det) in enumerate(rows):
        y = 350 + i * 56
        s += (f'<div style="{ab(x, y, w, 50, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 7px 12px 7px 92px; display: flex; flex-direction: column; justify-content: center; gap: 1px")}">'
              + b.tb(what, f'font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(det, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += (f'<div style="{ab(x, 522, w, 46, f"box-sizing: border-box; border-radius: 10px; background: {BLUE if dark else CHIP}; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px")}">'
          + b.tb(vl, f'min-width: 0; font-size: 12.5px; font-weight: 800; color: {"#ffffff" if dark else INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
          + b.tb(vv, f'{NUM}; flex-shrink: 0; font-size: 18px; font-weight: 800; color: {"#ffffff" if dark else BLUE}; white-space: nowrap') + '</div>')
    return s


def mode(b, d):
    s = mode_panel(b, d['A'], 64, False) + mode_panel(b, d['B'], 696, True)
    for i, r in enumerate(d['rows']):
        y = 350 + i * 56
        for x in (64, 696):
            s += b.tb(r, ab(x + 12, y + 16, 74, 18, f'font-size: 11px; font-weight: 800; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 'div')
        s += b.tb('↔ ' + d['swaps'][i], ab(590, y + 14, 100, 22, f'box-sizing: border-box; border-radius: 999px; background: #ffffff; border: 1px solid {LINE}; color: {BLUE}; font-size: 10.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap; overflow: hidden'), 'div')
    s += f'<div style="{ab(639, 230, 0, 330, f"border-left: 1.5px dashed {LINE}")}"></div>'
    s += (f'<div style="{ab(592, 150, 96, 196, "display: flex; flex-direction: column; align-items: center; gap: 5px; text-align: center")}">'
          + f'<span style="width: 34px; height: 34px; border-radius: 50%; background: {BLUE}; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800">⇄</span>'
          + b.tb('전환 방식', f'font-size: 10.5px; color: {MUTED}')
          + b.tb(d['method'], f'font-size: 11.5px; font-weight: 800; line-height: 1.4; color: {BLUE}; {clamp(3)}')
          + ''.join(b.tb(c, f'box-sizing: border-box; width: 96px; height: 20px; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap; overflow: hidden') for c in d['sols']) + '</div>')
    s += f'<div style="{ab(64, 584, 1152, 64, f"box-sizing: border-box; border-radius: 14px; background: {SOFT}; padding: 0 18px; display: flex; align-items: center; gap: 12px")}">'
    s += b.tb(d['stack'], 'flex-shrink: 0; font-size: 14px; font-weight: 800; padding-right: 8px')
    s += ''.join(chip(b, c, color=INK, bg='#ffffff', size=11.5, h=24, extra=f'border: 1px solid {LINE}').replace('align-self: flex-start', 'align-self: center') for c in d['devices'])
    return s + '</div>'


# ---------------------------------------------------------------- phased rollout
def phased(b, d):
    no, nm, ppl, pid, pos = d['space']
    s = photo(b, pid, 64, 148, 300, 84, pos=pos, hint=f'{nm} 공간 사진 (고객 공간으로 교체)', radius=12)
    s += glass('<span style="display: flex; align-items: center; gap: 6px">' + numtag(b, no, 18) + b.tb(nm, 'font-size: 12.5px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
               + b.tb(ppl, f'font-size: 10.5px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'),
               72, 178, 284, 48, pad='5px 10px', gap=1, extra='border-radius: 8px; justify-content: center')
    s += (f'<div style="{ab(380, 148, 836, 84, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 9px 16px; display: flex; flex-direction: column; gap: 4px")}">'
          + '<span style="display: flex; align-items: center; gap: 6px; min-width: 0">' + b.tb('왜 단계적으로 가나', f'font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap')
          + '<span style="margin-left: auto; display: flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden">' + label(b, '지금')
          + ''.join(chip(b, c, color=MUTED, bg='#ffffff', size=10.5, h=20, extra=f'border: 1px solid {LINE}').replace('align-self: flex-start', 'flex-shrink: 0') for c in d['now']) + '</span></span>'
          + b.tb(d['why'], f'font-size: 12px; line-height: 1.5; color: {BODY}; {clamp(2)}') + '</div>')
    cw = (1152 - 2 * 36) / 3
    for i, (st, title, per, ppid, ppos, scope, adds, adesc, ops, cl, cv) in enumerate(d['phases']):
        x = round(64 + i * (cw + 36)); w = round(cw); last = i == 2
        s += (f'<div style="{ab(x, 244, w, 332, f"box-sizing: border-box; border-radius: 14px; border: 1px solid {BLUE if last else LINE}; background: {CHIP if last else "#ffffff"}")}"></div>')
        s += photo(b, ppid, x + 10, 254, w - 20, 136, pos=ppos, hint=f'{st} {title} 사진', radius=9)
        s += (f'<div style="{ab(x + 14, 398, w - 28, 170, "display: flex; flex-direction: column; gap: 5px")}">'
              + '<span style="display: flex; align-items: center; gap: 7px; min-width: 0">'
              + b.tb(st, f'flex-shrink: 0; height: 20px; padding: 0 8px; border-radius: 999px; background: {BLUE}; color: #ffffff; font-size: 10.5px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')
              + b.tb(title, 'min-width: 0; font-size: 14.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(per, f'{NUM}; margin-left: auto; flex-shrink: 0; font-size: 11px; font-weight: 700; color: {MUTED}') + '</span>'
              + '<span style="display: flex; gap: 8px">' + label(b, '범위', w=48) + b.tb(scope, f'font-size: 12px; line-height: 1.45; color: {BODY}; {clamp(2)}') + '</span>'
              + '<span style="display: flex; gap: 8px; align-items: flex-start">' + label(b, '더하는 것', w=48) + '<span style="display: flex; flex-direction: column; gap: 3px; min-width: 0">'
              + '<span style="display: flex; gap: 4px; flex-wrap: wrap">' + ''.join(chip(b, c, size=10.5, h=19) for c in adds) + '</span>'
              + b.tb(adesc, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span></span>'
              + '<span style="display: flex; gap: 8px">' + label(b, '운영', w=48) + b.tb(ops, f'font-size: 12px; line-height: 1.45; color: {INK}; {clamp(2)}') + '</span>'
              + f'<span style="margin-top: auto; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; border-top: 1px solid {LINE}; padding-top: 6px">'
              + b.tb(cl, f'min-width: 0; font-size: 11px; font-weight: 700; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(cv, f'{NUM}; flex-shrink: 0; font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</span></div>')
        if i < 2: s += ARROW(x + w + 10, 402)
    # overall schedule bar
    s += f'<div style="{ab(64, 588, 1152, 56, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 0 14px; display: flex; align-items: center; gap: 8px")}">'
    s += b.tb('전체 일정', 'width: 76px; flex-shrink: 0; font-size: 13px; font-weight: 800')
    for i, ph in enumerate(d['phases']):
        bg, fg = [('#ffffff', INK), ('#c9d2f2', INK), (BLUE, '#ffffff')][i]
        s += (f'<span style="flex: {1 + i * 0.4}; min-width: 0; height: 30px; border-radius: 8px; background: {bg}; color: {fg}; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11.5px; font-weight: 800">'
              + b.tb(f'{ph[0]} · {ph[1]}', 'min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + b.tb(ph[2], f'{NUM}; flex-shrink: 0') + '</span>')
    return s + '</div>'


R = {'route': route, 'users': users, 'problem': problem, 'mode': mode, 'phased': phased}
for f0, d in D.items():
    code = f0.split('_')[2]; v = f0.split('_')[3]
    eb, hl, sub = HDR[f0]; sub = d.get('sub', sub); hl = d.get('hl', hl)
    note, page = foot(f0, code, '수치는 예시 · 유사 사례 기준')
    tag = (ORIG[f0]['tag'] or [''])[0]

    @layout(L, f=f'L_PH_SS_{code}_{v}', code=f'PH-SS-{code}-{v}', p='scenario', ind=code, name=f'{NAMES[code]} · {tag.rsplit(" · ", 1)[0]} · {KN[d["kind"]]}',
            when=f'{NAMES[code]} 고객사 — {KW[d["kind"]]}', pv=[f0], sample=ORIG[f0]['sample'], grp='공간 · 제품')
    def _(b, code=code, d=d, eb=eb, hl=hl, sub=sub, note=note, page=page, tag=tag):
        s = header(b, eb, hl, sub, w=1152 if not tag else 1152)
        if tag: s += tagpill(b, tag)
        s += R[d['kind']](b, d)
        s += footer(b, note, page)
        return s
