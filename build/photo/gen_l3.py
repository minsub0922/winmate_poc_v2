from gen_base import *
L = []
def layout(**meta):
    def deco(fn):
        b = B(); html = fn(b)
        L.append({**meta, 'html': html, '_b': b})
        return fn
    return deco

# ---------------------------------------------------------------- 18 solution · feature → effect, site + screen
@layout(f='L_PH_SF_B', code='PH-SF-B', p='solution', name='기능 → 고객 효과 · 현장 + 화면', when='솔루션 기능을 실제 화면으로, 그 효과가 나는 현장은 사진으로 함께 보여줄 때',
        pv=['L_SF_B', 'L_SOL03'], sample='A 커피', grp='솔루션 · 근거', sols=['stpro'])
def _(b):
    s = b.img('ph.fb-lounge-ac', ab(0, 0, 460, 720), pos='62% 50%', kind='space', hint='솔루션이 일하는 현장 (세로로 길게)')
    s += glass_label(b, 24, 612, '효과가 나는 현장', '매장 좌석 · 천장 360 카세트', w=300)
    s += header(b, '05 · 솔루션 제안', 'SmartThings Pro — 기능이 매장에서 이렇게 달라집니다', '기능을 고객의 언어로 — 왼쪽은 현장, 오른쪽은 실제 관리 화면', x=516, w=700, sub_y=148)
    for i, (pid, f, e, k) in enumerate([
        ('ui.stp.energy', '매장별 에너지 사용량 대시보드', '어느 매장이 전기를 많이 쓰는지 본사에서 바로 보고, 기준을 맞춥니다', '전력 [00]% ↓'),
        ('ui.stp.schedule', '영업시간 연동 냉난방 스케줄', '오픈 전 미리 켜고 마감 후 자동으로 끕니다 — 점장이 따로 챙기지 않아도 됩니다', '수동 조작 [0]회'),
        ('ui.stp.detect', '비효율 운전 · 이상 감지 알림', '문 열고 냉방 · 필터 막힘을 먼저 알려 민원과 고장을 줄입니다', '민원 [00]% ↓')]):
        y = 204 + i * 150
        s += f'<div style="{ab(516, y, 700, 136, f"box-sizing: border-box; border-top: 1px solid {LINE}; padding-top: 12px; display: flex; gap: 20px")}">'
        s += b.img(pid, 'position: relative; width: 206px; height: 120px; flex-shrink: 0; border: 1px solid #e2e5ea', fit='cover', pos='50% 0%', kind='ui', hint='솔루션 실제 화면', radius=10)
        s += ('<div style="display: flex; flex-direction: column; gap: 5px; min-width: 0">' + b.tb(f'기능 0{i + 1}', f'font-size: 11.5px; font-weight: 800; color: {BLUE}')
              + b.tb(f, 'font-size: 16.5px; font-weight: 800') + b.tb('→ ' + e, f'font-size: 13.5px; line-height: 1.55; color: {BODY}') + chip(b, k) + '</div></div>')
    s += footer(b, 'A 커피 프랜차이즈 · 매장 냉난방 제안 · 화면: SmartThings Pro · 사진: samsung.com 도입사례', 18, x0=516)
    return root(s)

# ---------------------------------------------------------------- 19 solution · a day timeline with photos
@layout(f='L_PH_OP_A', code='PH-OP-A', p='solution', p2='scenario', name='단계 타임라인 · 포토', when='솔루션이 하루 · 이벤트 흐름에 따라 무엇을 하는지 시간대 사진으로 보여줄 때',
        pv=['L_SOL02', 'L_OP_B'], sample='A 커피', grp='솔루션 · 근거', sols=['magicinfo'])
def _(b):
    s = header(b, '05 · 솔루션 제안', 'MagicINFO가 A 커피 매장의 하루를 이렇게 바꿉니다', '단계 타임라인 — 시간이 되면 화면이 알아서 바뀌고, 본사는 결과만 확인합니다')
    s += f'<div style="{ab(64, 175, 1152, 2, f"background: {LINE}")}"></div>'
    steps = [('ph.fb-cafe-dark', '40% 50%', '06:30', '오픈 준비', '아침 메뉴 · 세트 가격으로 자동 전환, 매장 직원은 손대지 않습니다', ['예약 송출', '시간대 템플릿']),
             ('ph.fb-counter-menu', '50% 40%', '11:30', '점심 피크', 'POS와 연동해 품절 메뉴는 즉시 숨기고, 대기가 길면 빠른 메뉴를 앞에', ['POS 연동', '품절 자동 반영']),
             ('ph.fb-cafe-bright', '45% 40%', '15:00', '오후 프로모션', '본사가 만든 시즌 프로모션을 전 매장에 같은 시각 송출합니다', ['일괄 배포', '적용 확인']),
             ('ph.fb-cafe-signage', '50% 50%', '21:30', '마감', '화면을 자동으로 끄고 밝기 · 전력 기록을 본사로 보냅니다', ['자동 종료', '전력 리포트'])]
    s += f'<div style="{ab(64, 160, 1152, 440, "display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px")}">'
    for pid, pos, t, ti, d, cs in steps:
        s += ('<div style="display: flex; flex-direction: column; gap: 9px; min-width: 0">'
              + f'<span style="display: flex; align-items: center; gap: 8px"><i style="width: 12px; height: 12px; border-radius: 50%; background: #ffffff; border: 3px solid {BLUE}; box-sizing: border-box; flex-shrink: 0"></i>' + b.tb(t, f'{NUM}; font-size: 20px; font-weight: 800; color: {BLUE}; background: #ffffff; padding-right: 8px') + '</span>'
              + b.img(pid, 'position: relative; width: 100%; height: 228px', pos=pos, kind='insitu', hint=f'{ti} 시간대 장면', radius=14)
              + b.tb(ti, 'font-size: 17.5px; font-weight: 800; margin-top: 2px') + b.tb(d, f'font-size: 13.5px; line-height: 1.55; color: {BODY}')
              + '<span style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto">' + ''.join(chip(b, c) for c in cs) + '</span></div>')
    s += '</div>'
    s += (f'<div style="{ab(64, 612, 1152, 44, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 18px; display: flex; align-items: center; gap: 14px")}">'
          + b.tb('본사 운영', f'font-size: 12px; font-weight: 800; color: {BLUE}; flex-shrink: 0') + b.tb('콘텐츠 제작 · 스케줄 · 적용 현황을 본사 PC 한 곳에서 — 매장은 손님에게만 집중합니다', 'font-size: 14px; font-weight: 600') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례 · 공식 연출', 16)
    return root(s)

# ---------------------------------------------------------------- 20 solution · hub with real devices
@layout(f='L_PH_SA_B', code='PH-SA-B', p='solution', name='허브형 · 실사', when='솔루션 하나가 여러 기기를 묶을 때 — 가운데 화면, 둘레에 실제 설치 사진',
        pv=['L_SA_B', 'L_SOL01'], sample='A 커피', grp='솔루션 · 근거', sols=['magicinfo'])
def _(b):
    s = header(b, '05 · 솔루션 제안', '본사 콘솔 하나가 매장의 모든 화면을 움직입니다', '허브형 구성 — 가운데는 MagicINFO 관리 화면, 둘레는 실제로 연결되는 매장 기기')
    # connectors (fixed drawing)
    s += (f'<svg style="{ab(0, 0, 1280, 720)}" viewBox="0 0 1280 720" fill="none" stroke="{BLUE}" stroke-width="2" stroke-dasharray="6 6">'
          '<path d="M364 262 H392 V340 H420"/><path d="M364 512 H392 V440 H420"/><path d="M916 262 H888 V340 H860"/><path d="M916 512 H888 V440 H860"/></svg>')
    s += b.img('ui.mi.overview', ab(420, 282, 440, 200), fit='cover', pos='50% 50%', kind='ui', hint='솔루션 관리 화면 (가운데 허브)', radius=16)
    s += f'<div style="{ab(420, 282, 440, 200, f"box-sizing: border-box; border: 3px solid {BLUE}; border-radius: 16px")}"></div>'
    s += b.tb('MagicINFO · 본사 콘솔', ab(540, 250, 200, 26, f'border-radius: 999px; background: {BLUE}; color: #fff; font-size: 12.5px; font-weight: 800; display: flex; align-items: center; justify-content: center'), 'div')
    devs = [(64, 172, 'ph.fb-counter-menu', '50% 30%', '카운터 메뉴보드', 'QM55C × 3'), (64, 422, 'ph.fb-dt-menu', '40% 40%', '드라이브스루', 'OH55A-S'),
            (916, 172, 'ph.fb-table-order', '50% 50%', '테이블 주문', 'Galaxy Tab'), (916, 422, 'ph.fb-cafe-signage', '50% 40%', '벽면 · 윈도 사이니지', 'QM43C')]
    for x, y, pid, pos, t, m in devs:
        s += b.img(pid, ab(x, y, 300, 180), pos=pos, kind='insitu', hint=f'{t} 설치 사진', radius=14)
        s += (f'<div style="{ab(x + 10, y + 132, extra=f"box-sizing: border-box; border-radius: 9px; background: {GLASS}; padding: 5px 10px; display: flex; gap: 8px; align-items: baseline")}">'
              + b.tb(t, 'font-size: 13px; font-weight: 800; color: #ffffff') + b.tb(m, f'font-size: 11.5px; font-weight: 700; color: {LB}') + '</div>')
    s += (f'<div style="{ab(420, 500, 440, 96, "display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center")}">'
          + b.tb('본사 PC 한 곳에서 [000]개 매장 · [0,000]대 화면', 'font-size: 16px; font-weight: 800')
          + b.tb('콘텐츠 제작 → 승인 → 예약 배포 → 적용 확인까지 같은 콘솔에서', f'font-size: 13px; color: {MUTED}') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 화면: MagicINFO · 사진: samsung.com 도입사례 · 공식 연출', 17)
    return root(s)

# ---------------------------------------------------------------- 21 products · 3 with cut + install scene
@layout(f='L_PH_P3_A', code='PH-P3-A', p='products', name='제품 3 · 컷 + 설치 장면', when='제품 세 개를 공식 제품 컷과 실제 설치 장면으로 함께 보여줄 때',
        pv=['L_P3A', 'L_P3C'], sample='A 커피', grp='공간 · 제품', pc=3, prods=['qm55c', 'kiosk', 'oh55a'])
def _(b):
    s = header(b, '04 · 공간별 제품 — 카운터', '카운터를 완성하는 세 가지 제품', '공식 제품 컷 + 실제 설치 장면 — 사양은 삼성 공식 사양 기준')
    s += f'<div style="{ab(64, 160, 1152, 492, "display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px")}">'
    for scene, spos, cut, cat, model, spec, role in [
        ('ph.fb-counter-menu', '50% 30%', 'cut.qm55c', '스마트 사이니지', 'QM55C', '55" · 500nit · 4K UHD · 24/7 운영', '카운터 상단 3연 메인 메뉴보드'),
        ('life.km24c.bakery', '50% 45%', 'cut.km24c', '키오스크', 'KM24C', '24" · 터치 · 결제 모듈', '피크 시간 주문 · 결제 분산'),
        ('ph.fb-dt-order', '45% 45%', 'cut.oh55a', '옥외 사이니지', 'OH55A-S', '55" · 3,500nit(최대 4,000) · IP56', '드라이브스루 첫 메뉴판')]:
        s += ('<div style="display: flex; flex-direction: column; gap: 9px; min-width: 0">'
              + '<div style="position: relative; height: 334px">' + b.img(scene, 'position: relative; width: 100%; height: 334px', pos=spos, kind='insitu', hint=f'{model} 설치 장면', radius=16)
              + b.img(cut, 'position: absolute; right: 12px; bottom: 12px; width: 132px; height: 100px', fit='contain', kind='cut', hint=f'{model} 공식 제품 컷', pad=8, bg='#ffffff', radius=12) + '</div>'
              + chip(b, cat, extra='margin-top: 4px') + b.tb(model, 'font-size: 21px; font-weight: 800; letter-spacing: -0.01em')
              + b.tb(spec, f'font-size: 13px; color: {MUTED}') + b.tb(role, f'font-size: 14.5px; line-height: 1.55; color: {BODY}; border-top: 1px solid {LINE}; padding-top: 9px; margin-top: auto') + '</div>')
    s += '</div>'
    s += footer(b, 'A 커피 프랜차이즈 · 카운터 제품 제안 · 제품 컷 · 사진: samsung.com', 14)
    return root(s)

# ---------------------------------------------------------------- 22 products · 4 install scenes
@layout(f='L_PH_P4_A', code='PH-P4-A', p='products', name='제품 4 · 설치 장면', when='제품 네 개를 설치된 공간 사진 위주로 보여줄 때 — 제품 컷은 작게 곁들임',
        pv=['L_P4A', 'L_P4C'], sample='B 호텔', grp='공간 · 제품', pc=4, prods=['hoteltv', 'qm55c', 'led_outdoor', 'wf4way'])
def _(b):
    s = header(b, '04 · 공간별 제품', 'B 호텔의 네 공간, 네 가지 제품', '객실부터 외관까지 — 사진은 같은 업종의 실제 설치 현장')
    s += f'<div style="{ab(64, 160, 1152, 492, "display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px")}">'
    for scene, spos, cut, sp, model, spec, role in [
        ('ph.ht-room-tv', '68% 50%', 'cut.hg55bu', '객실', '호텔 TV HG55BU', '55" · LYNK Cloud · 웰컴 화면', '체크인하면 이름이 뜨는 웰컴 화면'),
        ('ph.ht-lobby-signage', '82% 50%', 'cut.qm55c', '로비', '스마트 사이니지 QM55C', '55" · 세로 설치 · 24/7', '오늘의 행사 · 층별 안내'),
        ('ph.ht-exterior-led', '50% 40%', 'cut.xhb', '외관', '실외 LED 사이니지 XHB', '고휘도 · 방수 · 외벽 구성', '건물 전체가 브랜드 간판'),
        ('ph.ht-lobby', '50% 50%', 'cut.wf4way', '로비 · 라운지', '무풍 4Way 카세트', '무풍 4방향 · 대공간', '바람 없이 쾌적한 높은 천장')]:
        s += ('<div style="display: flex; flex-direction: column; gap: 8px; min-width: 0">'
              + '<div style="position: relative; height: 344px">' + b.img(scene, 'position: relative; width: 100%; height: 344px', pos=spos, kind='insitu', hint=f'{sp} 설치 장면', radius=14)
              + b.tb(sp, f'position: absolute; left: 10px; top: 10px; border-radius: 999px; background: {GLASS}; color: #fff; font-size: 12px; font-weight: 800; padding: 4px 11px')
              + b.img(cut, 'position: absolute; right: 10px; bottom: 10px; width: 96px; height: 70px', fit='contain', kind='cut', hint='공식 제품 컷', pad=6, bg='#ffffff', radius=10) + '</div>'
              + b.tb(model, 'font-size: 16.5px; font-weight: 800; margin-top: 4px') + b.tb(spec, f'font-size: 12.5px; color: {MUTED}')
              + b.tb(role, f'font-size: 13.5px; line-height: 1.5; color: {BODY}; border-top: 1px solid {LINE}; padding-top: 8px; margin-top: auto') + '</div>')
    s += '</div>'
    s += footer(b, 'B 호텔 · 객실 · 공용부 제품 제안 · 사진: samsung.com 호텔 도입사례 · 제품 컷: samsung.com', 15)
    return root(s)

# ---------------------------------------------------------------- 23 products · mood full-bleed
@layout(f='L_PH_P_I', code='PH-P-I', p='products', name='무드 컷 · 풀블리드', when='사양보다 분위기로 설득할 때 — 설치된 공간 사진 한 장에 제품 이름과 핵심 세 가지',
        pv=['L_P_I'], sample='B 호텔', grp='공간 · 제품', pc=1, prods=['hoteltv'])
def _(b):
    s = b.img('ph.ht-room-night', ab(0, 0, 1280, 720), pos='50% 50%', kind='space', hint='제품이 놓인 공간의 분위기 사진 (가로 전체)')
    s += f'<div style="{ab(48, 384, 620, 268, f"box-sizing: border-box; border-radius: 18px; background: {GLASS}")}"></div>'
    s += b.tb('04 · 공간별 제품 — 객실', ab(84, 414, extra=f'font-size: 13px; font-weight: 700; letter-spacing: 0.06em; color: {LB}'), 'div')
    s += b.tb('창밖 야경까지 객실의 일부로', ab(84, 440, 560, extra='font-size: 36px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.25; color: #ffffff'), 'div')
    s += b.tb('호텔 TV HG55BU — 슬림한 디자인이 객실 인테리어에 녹아들고, 웰컴 화면이 투숙객을 먼저 맞습니다', ab(84, 496, 560, extra=f'font-size: 15px; line-height: 1.55; color: {LT}'), 'div')
    s += f'<div style="{ab(84, 572, 560, 40, "display: flex; gap: 8px; flex-wrap: wrap")}">'
    for t in ['55" 슬림 디자인', 'LYNK Cloud 웰컴 화면', '모바일 미러링']:
        s += b.tb(t, 'height: 30px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.55); color: #ffffff; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; box-sizing: border-box')
    s += '</div>'
    s += f'<div style="{ab(0, 662, 1280, 58, "background: rgba(10,14,24,0.62)")}"></div>'
    s += footer(b, 'B 호텔 · 객실 TV 제안 · 사진: samsung.com 호텔 도입사례(롯데 시그니엘 서울)', 13, dark=True)
    return root(s, bg='#0b0d12', color='#ffffff')

# ---------------------------------------------------------------- 24 products · one product, many spaces
@layout(f='L_PH_P_S', code='PH-P-S', p='products', name='한 제품 · 여러 공간 사진', when='한 모델로 통일하되 공간마다 역할이 다를 때 — 공간 사진 네 장으로',
        pv=['L_P_S'], sample='D 리테일 복합몰', grp='공간 · 제품', pc=1, prods=['ac360'])
def _(b):
    s = header(b, '04 · 공간별 제품', '한 모델, 네 공간 — 360 카세트로 통일합니다', '같은 제품을 공간마다 다른 역할로 — 사진은 실제 설치 현장')
    s += f'<div style="{ab(64, 160, 330, 492, f"box-sizing: border-box; border-radius: 16px; background: {SOFT}; padding: 22px; display: flex; flex-direction: column; gap: 10px")}">'
    s += b.img('ac360', 'position: relative; width: 100%; height: 170px', fit='contain', kind='cut', hint='제품 공식 컷', pad=10, bg='#ffffff', radius=12)
    s += chip(b, '시스템에어컨', extra='margin-top: 6px') + b.tb('360 카세트', 'font-size: 24px; font-weight: 800') + b.tb('원형 360° 기류 · 인테리어 조화', f'font-size: 13px; color: {MUTED}')
    s += f'<div style="display: flex; flex-direction: column; gap: 7px; border-top: 1px solid {LINE}; padding-top: 12px; margin-top: 4px">' + b.tb('한 모델로 통일하면', f'font-size: 12px; font-weight: 800; color: {BLUE}')
    for t in ['천장 디자인 · 부품 · 필터를 하나로 관리', '구역마다 다른 바람만 설정으로 바꿉니다', '증설 · 교체 때 같은 사양으로 바로']:
        s += f'<span style="display: flex; gap: 8px; align-items: baseline"><i style="width: 5px; height: 5px; border-radius: 50%; background: {BLUE}; flex-shrink: 0; transform: translateY(-2px)"></i>' + b.tb(t, f'font-size: 13.5px; line-height: 1.5; color: {BODY}') + '</span>'
    s += '</div></div>'
    for i, (pid, pos, sp, role) in enumerate([('ph.fb-lounge-ac', '55% 35%', '식음 · 카페', '좌석마다 고른 바람, 오래 머무는 자리'),
                                              ('ph.rt-mall-ac', '50% 35%', '매장 · 통로', '사람이 몰리는 통로는 강하게'),
                                              ('ph.sv-studycafe', '50% 35%', '라운지 · 스터디', '조용하게, 직바람 없이'),
                                              ('ph.of-kids-ac', '50% 30%', '사무 · 휴게', '근무 시간에 맞춘 스케줄 운전')]):
        x = 418 + (i % 2) * 409; y = 160 + (i // 2) * 252
        s += b.img(pid, ab(x, y, 389, 236), pos=pos, kind='insitu', hint=f'{sp} 설치 장면', radius=14)
        s += (f'<div style="{ab(x + 12, y + 160, 365, extra=f"box-sizing: border-box; border-radius: 10px; background: {GLASS}; padding: 8px 12px; display: flex; flex-direction: column; gap: 2px")}">'
              + b.tb(sp, f'font-size: 11.5px; font-weight: 700; color: {LB}') + b.tb(role, 'font-size: 14px; font-weight: 700; color: #ffffff') + '</div>')
    s += footer(b, 'D 리테일 복합몰 · 공조 통합 제안 · 사진: samsung.com 도입사례(카페 · 두타면세점 · 토즈 · 레고 코리아)', 16)
    return root(s)

# ---------------------------------------------------------------- 25 products · install options with photos
@layout(f='L_PH_P_G', code='PH-P-G', p='products', name='설치 방식 옵션 · 사진', when='제품은 정했고 다는 방식을 고를 때 — 방식마다 실제 설치 사진으로',
        pv=['L_P_G'], sample='A 커피', grp='공간 · 제품', pc=1, prods=['qm55c'])
def _(b):
    s = header(b, '04 · 공간별 제품 — 설치 방식', '같은 화면, 네 가지 설치 방식', '공간 · 동선 · 천장 구조에 맞춰 고릅니다 — 사진은 실제 설치 사례 · 공식 연출')
    s += f'<div style="{ab(64, 160, 1152, 492, "display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px")}">'
    for pid, pos, k, t, d, good, care in [
        ('life.qm55c.wall', '50% 50%', 'A', '벽걸이', '슬림 브래킷으로 벽에 바짝 — 카운터 뒤 · 벽면 메뉴', '공간을 차지하지 않음', '벽체 보강 · 전원 위치'),
        ('ph.ht-lobby-signage', '84% 50%', 'B', '스탠드 · 세로형', '바닥 스탠드 · 함체로 세워 둡니다 — 입구 · 로비 안내', '위치를 쉽게 옮김', '동선 간섭 · 넘어짐 방지'),
        ('ph.fb-pickup', '55% 25%', 'C', '천장 매달기', '카운터 위에 3연으로 — 멀리서도 메뉴가 보입니다', '시야 확보 · 연속 화면', '천장 구조 · 높이 검토'),
        ('life.km24c.mounts', '50% 50%', 'D', '카운터 · 스탠드 거치', '키오스크를 카운터 · 벽 · 스탠드 중 골라 겁니다', '주문 동선 분리', '결제 단말 · 배선')]:
        s += ('<div style="display: flex; flex-direction: column; gap: 8px; min-width: 0">'
              + '<div style="position: relative">' + b.img(pid, 'position: relative; width: 100%; height: 296px', pos=pos, kind='insitu', hint=f'{t} 설치 사진', radius=14)
              + b.tb(k, f'position: absolute; left: 10px; top: 10px; width: 28px; height: 28px; border-radius: 8px; background: {BLUE}; color: #fff; font-size: 14px; font-weight: 800; display: flex; align-items: center; justify-content: center; {NUM}') + '</div>'
              + b.tb(t, 'font-size: 18px; font-weight: 800; margin-top: 4px') + b.tb(d, f'font-size: 13.5px; line-height: 1.55; color: {BODY}')
              + f'<div style="margin-top: auto; border-top: 1px solid {LINE}; padding-top: 8px; display: flex; flex-direction: column; gap: 4px">'
              + f'<span style="display: flex; gap: 6px; align-items: baseline">' + b.tb('장점', f'font-size: 11px; font-weight: 800; color: {BLUE}; width: 30px; flex-shrink: 0') + b.tb(good, 'font-size: 12.5px; font-weight: 600') + '</span>'
              + f'<span style="display: flex; gap: 6px; align-items: baseline">' + b.tb('검토', f'font-size: 11px; font-weight: 800; color: {WARN}; width: 30px; flex-shrink: 0') + b.tb(care, f'font-size: 12.5px; color: {BODY}') + '</span></div></div>')
    s += '</div>'
    s += footer(b, 'A 커피 프랜차이즈 · 설치 방식 검토 · 사진: samsung.com 도입사례 · 공식 연출', 15)
    return root(s)

# ---------------------------------------------------------------- 26 products · video wall in situ
@layout(f='L_PH_P_L', code='PH-P-L', p='products', p2='spec', name='비디오월 · 실사 + 구성', when='패널을 이어 붙여 벽을 채울 때 — 실제 비디오월 사진과 구성 정보를 함께',
        pv=['L_P_L'], sample='M 시네마', grp='공간 · 제품', pc=1, prods=['vm55b'])
def _(b):
    s = b.img('ph.vn-ticket-wall', ab(0, 0, 700, 720), pos='50% 40%', kind='insitu', hint='비디오월 설치 사진 (세로로 길게)')
    s += glass_label(b, 24, 612, '설치 사례 · CGV상암 매표소', '비디오월 9면 + 대기 공간 6면', w=320)
    s += header(b, '04 · 공간별 제품 — 매표소', '매표소 벽 전체를 하나의 화면으로', 'M 시네마 매표소 비디오월 구성 — 실측 후 확정', x=748, w=468, sub_y=148)
    rows = [('구성', '[3 × 3] 면 · VM55B'), ('전체 크기', '가로 [0.0]m × 세로 [0.0]m'), ('패널', '55" · 초슬림 베젤 · 다면 구성'),
            ('콘텐츠', '상영 시간표 · 예고편 · 매점 메뉴 분할 송출'), ('설치', '벽부형 프레임 · 전면 유지보수 [확인]')]
    for i, (k, v) in enumerate(rows):
        y = 196 + i * 50
        s += (f'<div style="{ab(748, y, 468, 50, f"box-sizing: border-box; border-top: 1px solid {LINE}; display: flex; align-items: center; gap: 12px")}">'
              + b.tb(k, f'font-size: 12.5px; font-weight: 700; color: {MUTED}; width: 72px; flex-shrink: 0') + b.tb(v, 'font-size: 14.5px; font-weight: 700') + '</div>')
    s += b.img('ph.tp-skywall', ab(748, 466, 468, 150), pos='50% 50%', kind='insitu', hint='참고 사례 · 대형 비디오월', radius=12)
    s += b.tb('참고 · 롯데월드타워 서울스카이 — 사이니지 36대 비디오월 · 베젤 1.7mm', ab(748, 624, 468, extra=f'font-size: 12px; color: {MUTED}'), 'div')
    s += footer(b, 'M 시네마 · 사진: samsung.com 도입사례', 21, x0=748)
    return root(s)

# ---------------------------------------------------------------- 27 spec · comparison with product photos
@layout(f='L_PH_SC_A', code='PH-SC-A', p='spec', name='사양 비교 · 제품 사진 3', when='사양 비교표 맨 위에 공식 제품 컷을 크게 — 표만 있는 비교를 피할 때',
        pv=['L_SPEC3', 'L_SPEC2', 'L_SPEC4'], sample='A 커피', grp='공간 · 제품', pc=3, prods=['qm43c', 'qm55c', 'qm65c'])
def _(b):
    s = header(b, '08 · 제품 스펙', '화면 크기로 고르는 스마트 사이니지 3종', '삼성 공식 사양 기준 — [ ]는 모델 확정 후 기재')
    cols = [('cut.qm43c', 'QM43C', False, ['43"', '500nit', '4K UHD', '[확인]', '픽업대 · 벽면 보조', '[N]대']),
            ('cut.qm55c', 'QM55C', True, ['55"', '500nit', '4K UHD', '24/7 운영', '카운터 메인 메뉴보드', '[N]대']),
            ('cut.qm65c', 'QM65C', False, ['65"', '500nit', '4K UHD', '24/7 운영', '매장 입구 · 대형 벽면', '[N]대'])]
    labels = ['화면 크기', '밝기', '해상도', '운영 시간', '추천 위치', '수량']
    for j, (cut, m, rec, vals) in enumerate(cols):
        x = 300 + j * 312
        if rec: s += f'<div style="{ab(x - 8, 152, 312, 504, f"box-sizing: border-box; border: 2px solid {BLUE}; border-radius: 18px")}"></div>'
        s += b.img(cut, ab(x, 160, 296, 196), fit='contain', kind='cut', hint=f'{m} 공식 제품 컷', pad=14, bg=SOFT, radius=14)
        s += f'<div style="{ab(x, 366, 296, 30, "display: flex; align-items: center; gap: 8px")}">' + b.tb(m, 'font-size: 21px; font-weight: 800') + (chip(b, '추천', '#ffffff', BLUE) if rec else '') + '</div>'
        for i, v in enumerate(vals):
            s += b.tb(v, ab(x, 408 + i * 40, 296, 40, f"box-sizing: border-box; border-top: 1px solid {LINE}; display: flex; align-items: center; font-size: 14.5px; font-weight: {700 if rec else 500}; color: {INK if rec else BODY}"), 'div')
    for i, l in enumerate(labels):
        s += b.tb(l, ab(64, 408 + i * 40, 220, 40, f'box-sizing: border-box; border-top: 1px solid {LINE}; display: flex; align-items: center; font-size: 13px; font-weight: 700; color: {MUTED}'), 'div')
    s += b.tb('같은 시리즈라 콘텐츠 · 브래킷 · 관리 화면을 공유합니다', ab(64, 160, 210, extra=f'font-size: 14px; line-height: 1.55; color: {BODY}; font-weight: 600'), 'div')
    s += footer(b, 'A 커피 프랜차이즈 · 사이니지 사양 비교 · 사양 · 제품 컷: samsung.com', 26)
    return root(s)

# ---------------------------------------------------------------- 28 bom · composition table with photos
@layout(f='L_PH_BM_A', code='PH-BM-A', p='bom', name='구성표 · 제품 · 공간 사진', when='견적 전 전체 물량을 확정할 때 — 행마다 제품 컷과 설치 공간 사진을 붙여 한눈에',
        pv=['L_BM_A', 'L_SM_B'], sample='A 커피', grp='공간 · 제품', prods=['qm55c', 'kiosk', 'oh55a', 'ac360', 'tabs11'])
def _(b):
    s = header(b, '04 · 구성 · 수량', '한 매장 기준 전체 구성 — 다섯 품목', '표준 매장 1곳 기준 · 수량은 현장 실측 후 확정 · 단가는 별도 견적')
    rows = [('cut.qm55c', 'QM55C', '스마트 사이니지 55"', 'ph.fb-counter-menu', '50% 25%', '카운터 상단', '[3]', '메인 메뉴보드 · 3연'),
            ('cut.km24c', 'KM24C', '키오스크 24"', 'life.km24c.bakery', '50% 45%', '입구 · 주문 구역', '[2]', '주문 · 결제 분산'),
            ('cut.oh55a', 'OH55A-S', '옥외 사이니지 55"', 'ph.fb-dt-order', '40% 45%', '드라이브스루', '[1]', 'DT 메뉴보드 · 고휘도'),
            ('ac360', '360 카세트', '시스템에어컨', 'ph.fb-lounge-ac', '55% 20%', '좌석 · 라운지', '[4]', '천장 매립 · 원형 기류'),
            ('cut.tabs11', 'Galaxy Tab', '태블릿', 'ph.fb-table-order', '50% 45%', '테이블', '[12]', '테이블 주문 · 결제')]
    s += f'<div style="{ab(64, 160, 1152, 420, "display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 18px")}">'
    for i, (cut, m, nm, sp, spos, spn, q, note) in enumerate(rows):
        s += ('<div style="display: flex; flex-direction: column; gap: 7px; min-width: 0">'
              + '<div style="position: relative; height: 304px">' + b.img(sp, 'position: relative; width: 100%; height: 304px', pos=spos, kind='space', hint=f'{spn} 설치 공간 사진', radius=14)
              + b.tb(spn, f'position: absolute; left: 8px; top: 8px; border-radius: 999px; background: {GLASS}; color: #fff; font-size: 11.5px; font-weight: 800; padding: 3px 10px; white-space: nowrap')
              + b.img(cut, 'position: absolute; right: 8px; bottom: 8px; width: 92px; height: 62px', fit='contain', kind='cut', hint=f'{m} 제품 컷', pad=5, bg='#ffffff', radius=9) + '</div>'
              + f'<span style="display: flex; align-items: baseline; justify-content: space-between; gap: 6px; margin-top: 2px">' + b.tb(m, 'font-size: 16px; font-weight: 800; white-space: nowrap')
              + '<span style="display: flex; align-items: baseline; gap: 2px">' + b.tb(q, f'{NUM}; font-size: 24px; font-weight: 800; color: {BLUE}') + b.tb('대', f'font-size: 12px; color: {BLUE}; font-weight: 700') + '</span></span>'
              + b.tb(nm, f'font-size: 12px; color: {MUTED}') + b.tb(note, f'font-size: 13px; line-height: 1.5; color: {BODY}; border-top: 1px solid {LINE}; padding-top: 7px') + '</div>')
    s += '</div>'
    s += (f'<div style="{ab(64, 596, 1152, 56, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 0 20px; display: flex; align-items: center; gap: 16px")}">'
          + b.tb('합계', 'font-size: 14px; font-weight: 800') + b.tb('[22]대 · 5품목', f'{NUM}; font-size: 20px; font-weight: 800; color: {BLUE}')
          + b.tb('설치 · 배선 · 콘텐츠 초기 세팅 포함 여부는 견적서에서 확정', f'margin-left: auto; font-size: 12.5px; color: {MUTED}') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 표준 매장 구성 · 제품 컷 · 사진: samsung.com', 19)
    return root(s)
