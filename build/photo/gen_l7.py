# 사진 중심 레이아웃 · 2차 (제품 구성 · 시나리오 · 솔루션 · 실행 · 부록)
from gen_base import *
from gen_l6 import pin, glass, dot_line
L = []
def layout(**meta):
    def deco(fn):
        b = B(); html = fn(b)
        L.append({**meta, 'html': html, '_b': b})
        return fn
    return deco


def kpi(b, label, val, w=None):
    return (f'<div style="box-sizing: border-box; {"width: " + str(w) + "px; " if w else ""}border-radius: 10px; background: {CHIP}; padding: 7px 12px; display: flex; flex-direction: column; gap: 1px">'
            + b.tb(label, f'font-size: 11px; font-weight: 700; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
            + b.tb(val, f'{NUM}; font-size: 18px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</div>')


# ---------------------------------------------------------------- three users, three touchpoints
@layout(f='L_PH_P_P', code='PH-P-P', p='products', name='사용자별 접점 · 인물 사진 3', when='같은 공간을 쓰는 사람마다 닿는 제품과 얻는 것이 다를 때, 사람 사진을 앞세워',
        pv=['L_P_P', 'L_P_Q', 'L_RM_A'], sample='T 은행', grp='공간 · 제품', prods=['qm55c', 'kiosk'], sols=['magicinfo', 'knoxsuite'])
def _(b):
    s = header(b, '04 · 공간별 제품 — 영업점', '같은 영업점, 세 사람이 다르게 씁니다', '사람마다 지금의 불편 → 닿는 제품 → 얻는 것 — 사진은 금융 도입사례', w=1152)
    ps = [('ph.fn-tab-customer', '50% 40%', '방문 고객', '객장 → 창구 · 상담실 · 하루 [000]명', '“번호표를 뽑고 [0]분 기다린다”',
           [('대기 안내 사이니지', 'QM55C', '×2'), ('번호표 키오스크', 'KM24C', '×1'), ('상담 태블릿', 'Galaxy Tab S', '×[0]')], '기다리는 동안 내 순서 · 상품을 본다'),
          ('ph.fn-tab-banker', '50% 40%', '창구 직원', '창구 [0]석 · 상담실 [0]실', '“고객 한 명에 종이 서식 [0]장”',
           [('듀얼 모니터', 'ViewFinity', '×[00]'), ('전자서식 태블릿', 'Galaxy Tab S', '×[00]')], '종이 없이 화면 두 개로 바로 처리'),
          ('ph.of-desk-control', '60% 78%', '지점장 · 본점 운영', '지점 사무실 · 본점 운영팀', '“공지 하나 바꾸려 지점마다 연락한다”',
           [('지점 화면 원격 배포', 'MagicINFO', ''), ('태블릿 원격 잠금 · 업데이트', 'Knox Suite', '')], '지점에 가지 않고 전 지점을 한 번에')]
    for i, (pid, pos, who, where, now, items, gain) in enumerate(ps):
        x = 64 + i * 392
        s += b.img(pid, ab(x, 156, 368, 252), pos=pos, kind='people', hint=f'{who} 사진', radius=14)
        s += glass(b.tb(who, 'font-size: 17px; font-weight: 800; color: #ffffff') + b.tb(where, f'font-size: 11.5px; color: {LT}'), x + 10, 340, 348, 58, pad='8px 14px', gap=1)
        s += b.tb(now, ab(x, 420, 368, extra=f'font-size: 14px; font-weight: 700; color: {MUTED}; line-height: 1.45'), 'div')
        s += f'<div style="{ab(x, 454, 368, 110, "display: flex; flex-direction: column")}">'
        s += b.tb('닿는 제품', f'font-size: 11px; font-weight: 800; color: {BLUE}; margin-bottom: 2px')
        for nm, m, q in items:
            s += (f'<span style="display: flex; align-items: center; gap: 8px; height: 28px; border-bottom: 1px solid {LINE}">'
                  + b.tb(nm, 'font-size: 13px; font-weight: 700; white-space: nowrap') + b.tb(m, f'font-size: 12px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
                  + b.tb(q, f'{NUM}; font-size: 13px; font-weight: 800; color: {BLUE}; margin-left: auto') + '</span>')
        s += '</div>'
        s += (f'<div style="{ab(x, 576, 368, 56, f"box-sizing: border-box; border-radius: 10px; background: {CHIP}; padding: 8px 14px; display: flex; flex-direction: column; justify-content: center; gap: 1px")}">'
              + b.tb('얻는 것', f'font-size: 11px; font-weight: 800; color: {BLUE}') + b.tb(gain, 'font-size: 14px; font-weight: 800') + '</div>')
    s += footer(b, 'T 은행 · 영업점 디지털 전환 제안 · 사진: samsung.com 금융 · 오피스 도입사례', 14)
    return root(s)


# ---------------------------------------------------------------- three configurations with room photos
@layout(f='L_PH_P_O', code='PH-P-O', p='products', name='구성 3안 · 공간 사진', when='기본 · 권장 · 확장 세 가지 구성을, 구성마다 그 결과가 보이는 공간 사진과 함께 고르게 할 때',
        pv=['L_P_O', 'L_BM_B', 'L_MT_B', 'L_CO_A'], sample='B 호텔', grp='공간 · 제품', prods=['hoteltv43', 'wf1way'], sols=['lynk'])
def _(b):
    s = header(b, '04 · 공간별 제품 — 객실 (스탠다드)', '객실 한 실, 세 가지 구성 — 예산에 맞춰 고르세요', '구성마다 투숙객이 얻는 것과 호텔이 얻는 것 · 금액은 견적서에서 제시', w=1152)
    tiers = [('기본', '●○○', 'ph.ht-room-desk', '60% 50%', 'TV만 바꾸는 최소 구성', [('호텔 TV 43"', '[모델명]')], '밝고 선명한 새 TV', '가장 적은 비용으로 노후 TV 교체', False),
             ('권장', '●●○', 'ph.ht-room-bed', '40% 50%', 'TV · 콘텐츠 · 냉방을 함께', [('호텔 TV 55"', '[모델명]'), ('LYNK Cloud', '객실 TV 콘텐츠'), ('WindFree 1Way', '객실 천장')], '웰컴 화면 · 직바람 없는 냉방', 'TV 화면 · 안내를 원격으로 한 번에', True),
             ('확장', '●●●', 'ph.ht-suite', '40% 50%', '객실 전체를 한 번에', [('호텔 TV 65"', '[모델명]'), ('LYNK Cloud · WindFree', 'TV 콘텐츠 · 냉방'), ('컨트롤 태블릿 · 냉장고', '침대 옆 · 객실')], '침대에서 태블릿으로 냉방 · TV', '상위 객실 상품으로 객실 단가 ↑', False)]
    for i, (t, cost, pid, pos, sm, items, g1, g2, hi) in enumerate(tiers):
        x = 64 + i * 392
        if hi: s += f'<div style="{ab(x - 6, 150, 380, 486, f"box-sizing: border-box; border-radius: 18px; border: 2px solid {BLUE}")}"></div>'
        s += b.img(pid, ab(x, 156, 368, 252), pos=pos, kind='space', hint=f'{t} 구성 객실 사진', radius=14)
        s += (f'<span style="{ab(x + 10, 166, extra="display: flex; gap: 6px")}">' + b.tb(t, f'border-radius: 999px; background: {BLUE if hi else GLASS}; color: #fff; font-size: 13px; font-weight: 800; padding: 5px 12px')
              + (b.tb('추천', 'border-radius: 999px; background: #ffffff; color: #1428a0; font-size: 12px; font-weight: 800; padding: 5px 10px') if hi else '') + '</span>')
        s += b.tb(f'상대 비용 {cost}', ab(x + 10, 372, extra=f'border-radius: 8px; background: {GLASS}; color: #fff; font-size: 12px; font-weight: 700; padding: 4px 10px'), 'div')
        s += b.tb(sm, ab(x, 418, 368, extra='font-size: 16px; font-weight: 800'), 'div')
        s += f'<div style="{ab(x, 446, 368, 92, "display: flex; flex-direction: column")}">'
        for k, (nm, d) in enumerate(items):
            s += (f'<span style="display: flex; align-items: center; gap: 8px; height: 30px; border-bottom: 1px solid {LINE}">'
                  + b.tb('+' if k else '·', f'{NUM}; width: 12px; font-size: 14px; font-weight: 800; color: {BLUE}') + b.tb(nm, 'font-size: 13.5px; font-weight: 700; white-space: nowrap')
                  + b.tb(d, f'font-size: 12px; color: {MUTED}; margin-left: auto; white-space: nowrap') + '</span>')
        s += '</div>'
        s += (f'<div style="{ab(x, 548, 368, 80, "display: flex; flex-direction: column; gap: 4px")}">'
              + '<span style="display: flex; gap: 8px">' + b.tb('투숙객', f'width: 44px; flex-shrink: 0; font-size: 11.5px; font-weight: 800; color: {BLUE}') + b.tb(g1, f'font-size: 13px; color: {BODY}') + '</span>'
              + '<span style="display: flex; gap: 8px">' + b.tb('호텔', f'width: 44px; flex-shrink: 0; font-size: 11.5px; font-weight: 800; color: {BLUE}') + b.tb(g2, f'font-size: 13px; color: {BODY}') + '</span></div>')
    s += b.tb('스탠다드 객실 × 300실 · 금액은 견적서에서 제시 · 사진은 호텔 도입사례', ab(64, 644, 1152, extra=f'font-size: 11.5px; color: {FAINT}'), 'div')
    s += footer(b, 'B 비즈니스 호텔 · 객실 · 공용부 리뉴얼 제안 · 사진: samsung.com 호텔 도입사례', 14)
    return root(s)


# ---------------------------------------------------------------- unit package on a kitchen photo
@layout(f='L_PH_P_R', code='PH-P-R', p='products', name='한 세대 패키지 · 주방 사진 위 번호', when='한 세대(유닛)에 들어가는 가전 · 공조 · 세탁을, 대표 공간 사진 위 번호와 목록으로 보여줄 때',
        pv=['L_P_R', 'L_SD_F', 'L_RV_B'], sample='R 건설', grp='공간 · 제품')
def _(b):
    s = header(b, '04 · 공간별 제품 — 84㎡ 세대', '84㎡ 한 세대에 들어가는 삼성 — 주방 · 공조 · 세탁을 한 번에', '사진 위 번호 = 오른쪽 목록 · 위치는 예시 (주택형 도면으로 확정)', w=1152)
    s += b.img('ph.rs-kitchen-island', ab(64, 156, 560, 492), pos='50% 50%', kind='space', hint='세대 주방 · 식당 사진', radius=16)
    for n, x, y in [('1', 60, 220), ('2', 135, 236), ('3', 300, 270), ('4', 454, 330)]:
        s += pin(b, n, 64 + x, 156 + y)
    s += glass(b.tb('84㎡ 세대', f'font-size: 11px; font-weight: 800; color: {LB}') + b.tb('주방 · 식당 — 아일랜드형', 'font-size: 15px; font-weight: 800; color: #ffffff'), 80, 574, 300, 60)

    def row(n, nm, where, q, opt, y):
        return (f'<div style="{ab(648, y, 568, 32, f"display: flex; align-items: center; gap: 10px; border-bottom: 1px solid {LINE}")}">'
                + b.tb(n, f'{NUM}; width: 22px; height: 22px; border-radius: 50%; background: {BLUE}; color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0')
                + b.tb(nm, 'font-size: 13.5px; font-weight: 800; white-space: nowrap') + b.tb(where, f'font-size: 12px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
                + b.tb(q, f'{NUM}; font-size: 13px; font-weight: 800; margin-left: auto; flex-shrink: 0')
                + b.tb(opt, f'height: 20px; padding: 0 8px; border-radius: 999px; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; flex-shrink: 0; background: {CHIP if opt == "기본" else WARNBG}; color: {BLUE if opt == "기본" else WARN}') + '</div>')
    s += b.tb('주방 가전 · 4종 · 빌트인', ab(648, 156, extra=f'font-size: 12.5px; font-weight: 800; color: {BLUE}'), 'div')
    for i, r in enumerate([('1', 'BESPOKE 냉장고', '주방 북측 키 큰 장', '×1', '기본'), ('2', 'BESPOKE 김치플러스', '냉장고 옆 빌트인', '×1', '옵션'),
                           ('3', 'BESPOKE 인덕션', '아일랜드 상판', '×1', '기본'), ('4', 'BESPOKE 식기세척기', '아일랜드 하부장', '×1', '기본')]):
        s += row(*r, 178 + i * 34)
    s += b.tb('공조 · 1식', ab(648, 328, extra=f'font-size: 12.5px; font-weight: 800; color: {BLUE}'), 'div')
    s += b.img('ph.rs-living-ac', ab(648, 352, 168, 104), pos='50% 30%', kind='space', hint='거실 천장 시스템에어컨 사진', radius=10)
    s += (f'<div style="{ab(832, 352, 384, 104, "display: flex; flex-direction: column; gap: 4px")}">'
          + b.tb('시스템에어컨 실내기 ×4', 'font-size: 14px; font-weight: 800') + b.tb('거실 · 안방 · 침실 2 · 침실 3 천장', f'font-size: 12.5px; color: {BODY}')
          + b.tb('DVM 실외기 ×1 · 실외기실', 'font-size: 14px; font-weight: 800; margin-top: 6px') + b.tb('실내기 4대 연결 · 기본', f'font-size: 12.5px; color: {BODY}') + '</div>')
    s += b.tb('세탁 · 1종', ab(648, 472, extra=f'font-size: 12.5px; font-weight: 800; color: {BLUE}'), 'div')
    s += row('6', 'BESPOKE AI 콤보', '다용도실 · 세탁건조 일체형', '×1', '옵션', 494)
    s += (f'<div style="{ab(648, 580, 568, 68, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; padding: 0 18px; display: flex; align-items: center; gap: 18px")}">'
          + '<span style="display: flex; flex-direction: column">' + b.tb('기본 4종 · 옵션 2종', f'font-size: 12px; font-weight: 700; color: {MUTED}') + b.tb('세대당 10대', f'{NUM}; font-size: 22px; font-weight: 800; color: {BLUE}') + '</span>'
          + b.tb('× [000] 세대', f'{NUM}; font-size: 22px; font-weight: 800; color: {INK}; margin-left: auto') + '</div>')
    s += footer(b, 'R 건설 · 분양 세대 가전 · 공조 제안 · 사진: samsung.com 주거 도입사례', 14)
    return root(s)


# ---------------------------------------------------------------- repeat unit + common areas
@layout(f='L_PH_BM_C', code='PH-BM-C', p='bom', name='반복 유닛 + 공용부 · 공간 사진', when='객실 · 세대처럼 반복되는 한 유닛의 키트와, 따로 세는 공용부를 사진으로 나눠 물량을 보여줄 때',
        pv=['L_BM_C', 'L_P_M'], sample='B 호텔', grp='공간 · 제품', prods=['qm55c', 'qm43c', 'kiosk', 'thewall', 'hoteltv43', 'wf1way', 'ac360'])
def _(b):
    s = header(b, '04 · 공간별 제품', '객실 300실은 한 실의 키트로, 공용부는 따로 셉니다', '왼쪽: 반복되는 객실 1실 키트 × 300 · 오른쪽: 공간마다 따로 세는 공용부 — 수량은 현장 실사 후 확정', w=1152)
    s += b.img('ph.ht-room-sofa', ab(64, 156, 400, 262), pos='50% 45%', kind='space', hint='객실 1실 사진', radius=14)
    s += glass(b.tb('객실 1실 키트', 'font-size: 16px; font-weight: 800; color: #ffffff') + b.tb('스탠다드 · 트윈 공통 구성', f'font-size: 11.5px; color: {LT}'), 76, 352, 260, 56, pad='7px 12px', gap=1)
    for i, (nm, d) in enumerate([('호텔 TV 55"', '[모델명] · 객실 콘텐츠'), ('WindFree 1Way 카세트', '무풍 냉방 · 객실별 제어'), ('객실 냉장고', '[모델명] · 소형'), ('객실 컨트롤 태블릿', '조명 · 냉방 한 화면')]):
        y = 428 + i * 32
        s += (f'<div style="{ab(64, y, 400, 32, f"display: flex; align-items: center; gap: 10px; border-bottom: 1px solid {LINE}")}">'
              + b.tb(nm, 'font-size: 13.5px; font-weight: 800; white-space: nowrap') + b.tb(d, f'font-size: 12px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb('×1', f'{NUM}; font-size: 13px; font-weight: 800; color: {BLUE}; margin-left: auto') + '</div>')
    s += (f'<div style="{ab(64, 568, 400, 80, f"box-sizing: border-box; border-radius: 12px; background: {BLUE}; padding: 0 18px; display: flex; align-items: center; gap: 12px")}">'
          + b.tb('× 300실', f'{NUM}; font-size: 26px; font-weight: 800; color: #ffffff') + b.tb('= 객실분 1,200대', f'{NUM}; font-size: 17px; font-weight: 800; color: {LB}; margin-left: auto') + '</div>')
    tiles = [('ph.ht-lobby-art', '50% 50%', '로비 · 프런트', 'The Wall ×1 · QM55C ×2 · KM24C ×2', '5'), ('ph.ht-restaurant', '50% 50%', '레스토랑', 'QM43C 메뉴 ×[0] · QM55C ×1', '[0]'),
             ('ph.ht-ballroom', '50% 50%', '연회장', 'QM55C 입구 ×3 · 대형 디스플레이 ×3', '6'), ('ph.ht-corridor-info', '60% 50%', '객실층 · 복도', 'QM43C 층 안내 ×[0] · 360 카세트 ×[0]', '[00]'),
             ('ph.rt-staff-tablet', '50% 40%', 'BOH · 직원', 'Galaxy Tab Active5 Pro ×[00]', '[00]')]
    for i, (pid, pos, nm, pr, q) in enumerate(tiles):
        x = 488 + (i % 3) * 248; y = 156 + (i // 3) * 216
        s += b.img(pid, ab(x, y, 232, 204), pos=pos, kind='space', hint=f'공용부 · {nm} 사진', radius=12)
        s += glass('<span style="display: flex; align-items: center; gap: 6px">' + b.tb(nm, 'font-size: 14px; font-weight: 800; color: #ffffff; white-space: nowrap') + b.tb(q + '대', f'{NUM}; font-size: 13px; font-weight: 800; color: {LB}; margin-left: auto') + '</span>'
                   + b.tb(pr, f'font-size: 11px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), x + 8, y + 144, 216, 52, pad='6px 10px', gap=1)
    s += (f'<div style="{ab(984, 372, 232, 204, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 16px; display: flex; flex-direction: column; gap: 6px")}">'
          + b.tb('공용부', f'font-size: 12px; font-weight: 800; color: {BLUE}') + b.tb('다섯 공간 · 8종', 'font-size: 17px; font-weight: 800')
          + b.tb('공간마다 따로 세고, 실사 후 확정합니다', f'font-size: 12.5px; line-height: 1.5; color: {BODY}') + b.tb('[00]대', f'{NUM}; font-size: 26px; font-weight: 800; color: {BLUE}; margin-top: auto') + '</div>')
    s += (f'<div style="{ab(488, 592, 728, 56, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; padding: 0 18px; display: flex; align-items: center; gap: 12px")}">'
          + b.tb('합계', f'font-size: 12px; font-weight: 800; color: {BLUE}') + b.tb('객실분 1,200 + 공용부 [00] = [0,000]대', f'{NUM}; font-size: 17px; font-weight: 800')
          + b.tb('단가 · 금액은 견적서에서', f'font-size: 12px; color: {MUTED}; margin-left: auto') + '</div>')
    s += footer(b, 'B 비즈니스 호텔 · 객실 · 공용부 리뉴얼 제안 · 사진: samsung.com 호텔 · 리테일 도입사례', 16)
    return root(s)


# ---------------------------------------------------------------- floors as photo strips
@layout(f='L_PH_SM_D', code='PH-SM-D', p='dss', name='층별 · 층마다 공간 사진', when='건물 층마다 쓰임과 제품이 다를 때, 단면 대신 층마다 공간 사진 띠로 보여줄 때',
        pv=['L_SM_D', 'L_BV_F', 'L_BV_E', 'L_BV_G'], sample='C 빌딩', grp='공간 · 제품', prods=['qm55c', 'kiosk', 'thewall', 'ac360', 'dvms2'])
def _(b):
    s = header(b, '04 · 공간별 제품 — C 빌딩 전 층', '층마다 쓰임이 다르니, 제품도 층마다 다릅니다', '건물 전체 B1–10F · 옥상 · [0,000]대 — 업무층 · 공조 수량은 현장 실사 후 확정', w=1152)
    fl = [('RF', '옥상 · 설비', 'ph.of-rooftop-odu', '50% 55%', ['DVM S2 실외기 ×[00]'], '[00]'),
          ('10F', '회의 · 교육', 'ph.of-meeting-display', '50% 55%', ['Flip Pro WM75 ×6', '회의실 예약 사이니지 ×12'], '18'),
          ('3–9F', '업무층 × 7개 층', 'ph.of-office-ac', '50% 40%', ['ViewFinity 모니터 ×[000]/층', '360 카세트 ×[00]/층'], '[0,000]'),
          ('2F', '라운지 · 카페', 'ph.of-lounge-tv', '50% 60%', ['QM55C 메뉴 ×2', '360 카세트 ×[0]'], '[00]'),
          ('1F', '로비', 'ph.of-lobby-info', '50% 50%', ['The Wall IAB 146" ×1', 'KM24C 방문객 키오스크 ×2', 'QM55C 안내 ×3'], '6')]
    for i, (f, use, pid, pos, prods, tot) in enumerate(fl):
        y = 156 + i * 100
        s += (f'<div style="{ab(64, y, 112, 92, f"box-sizing: border-box; border-radius: 12px; background: {BLUE if i == 2 else SOFT}; padding: 10px 12px; display: flex; flex-direction: column; justify-content: center; gap: 2px")}">'
              + b.tb(f, f'{NUM}; font-size: 24px; font-weight: 800; color: {"#ffffff" if i == 2 else BLUE}') + b.tb(use, f'font-size: 11.5px; font-weight: 700; color: {"#dfe5ff" if i == 2 else MUTED}') + '</div>')
        s += b.img(pid, ab(188, y, 600, 92), pos=pos, kind='space', hint=f'{f} {use} 사진', radius=12)
        s += f'<div style="{ab(804, y, 300, 92, "display: flex; flex-direction: column; justify-content: center; gap: 4px")}">' + ''.join(dot_line(b, p, size=13) for p in prods) + '</div>'
        s += (f'<div style="{ab(1112, y, 104, 92, "display: flex; flex-direction: column; align-items: flex-end; justify-content: center")}">'
              + b.tb(tot, f'{NUM}; font-size: 22px; font-weight: 800; color: {BLUE}') + b.tb('층 합계', f'font-size: 11px; color: {MUTED}') + '</div>')
    s += footer(b, 'C 빌딩 · 스마트 오피스 제안 · 수치는 예시 · 사진: samsung.com 오피스 도입사례', 13)
    return root(s)


# ---------------------------------------------------------------- route through five points (SS-xx-D)
@layout(f='L_PH_SS_D', code='PH-SS-D', p='scenario', name='동선 다섯 지점 · 사진 띠', when='한 공간 안의 동선을 따라 다섯 지점마다 무엇이 움직이고 무엇이 좋아지는지, 지점 사진으로',
        pv=['L_SS_OF_D', 'L_SS_FB_D', 'L_SS_RT_D', 'L_SS_SV_D', 'L_SS_HT_D', 'L_SS_TP_D', 'L_SS_VN_D', 'L_SS_AD_D', 'L_SS_RS_D', 'L_SS_ID_D', 'L_SS_ED_D', 'L_SS_PB_D', 'L_SS_MD_D', 'L_SS_MF_D', 'L_SS_FN_D', 'L_SS_OE_D'],
        sample='C 빌딩', grp='공간 · 제품', sols=['magicinfo', 'content'])
def _(b):
    s = header(b, '03 · 공간별 가치 제공 시나리오', 'C 빌딩은 거리에서 업무층 입구까지 안내가 끊기지 않습니다', '로비 · 외벽 · 공용 동선 — 처음 온 방문객이 지나는 다섯 지점, 지점마다 움직이는 화면과 얻는 가치', w=1152)
    s += f'<div style="{ab(100, 176, 1080, 0, f"border-top: 2px dashed {BLUE}")}"></div>'
    pts = [('ph.ad-building-led', '50% 40%', '외벽 · 거리', '건물 밖', '지나는 사람이 오늘의 행사를 먼저 봅니다', '실외 · 곡면 LED', '외부 현수막 · 홍보물', '[00]% ↓'),
           ('ph.of-lounge-wall', '50% 50%', '로비 · 기둥', '1F – B1 보이드', '들어서면 기둥 LED가 오늘의 손님을 맞습니다', '관통 기둥형 LED', '웰컴 화면 준비', '[00]분 → [0]분'),
           ('ph.of-lobby-info', '50% 50%', '로비 길 안내', '1F 기둥 · 벽면', '전원 없는 벽에서도 행사장 가는 길이 보입니다', '컬러 이페이퍼', '종이 안내문', '[000]장 → [0]장'),
           ('ph.ht-corridor-info', '60% 50%', '엘리베이터홀', '1F', '기다리는 동안 층별 입주사 · 공지를 봅니다', '스마트 사이니지 QM', '층별 공지 게시', '[0]일 → 당일'),
           ('ph.of-desk-touch', '40% 40%', '업무층 입구', '[0]F', '층 입구에서 미팅 장소까지 이어서 안내합니다', '스마트 사이니지 QM43C', '로비 데스크 호출', '[00]% ↓')]
    for i, (pid, pos, nm, where, what, prod, kl, kv) in enumerate(pts):
        x = 64 + i * 234
        s += b.img(pid, ab(x, 194, 218, 250), pos=pos, kind='space', hint=f'지점 {i + 1} · {nm} 사진', radius=14)
        s += numbadge(b, str(i + 1), x + 95, 162, size=28)
        s += (f'<div style="{ab(x, 456, 218, 120, "display: flex; flex-direction: column; gap: 4px")}">'
              + '<span style="display: flex; align-items: baseline; gap: 6px">' + b.tb(nm, 'font-size: 16px; font-weight: 800; white-space: nowrap') + b.tb(where, f'font-size: 11px; color: {MUTED}; white-space: nowrap') + '</span>'
              + b.tb(what, f'font-size: 13px; line-height: 1.5; color: {BODY}') + chip(b, prod, size=11, h=20, extra='margin-top: 2px') + '</div>')
        s += f'<div style="{ab(x, 584, 218, 56)}">' + kpi(b, kl, kv) + '</div>'
    s += footer(b, 'C 오피스 빌딩 · 스마트 오피스 제안 · 수치는 예시 · 사진: samsung.com 오피스 · 호텔 · 옥외 도입사례', 14)
    return root(s)


# ---------------------------------------------------------------- one space, three people (SS-xx-E)
@layout(f='L_PH_SS_E', code='PH-SS-E', p='scenario', name='한 공간 · 세 사람 · 공간 + 인물 사진', when='같은 공간을 쓰는 세 사람이 얻는 것이 다를 때, 공간 사진 한 장과 사람마다 장면 사진으로',
        pv=['L_SS_OF_E', 'L_SS_FB_E', 'L_SS_RT_E', 'L_SS_SV_E', 'L_SS_HT_E', 'L_SS_TP_E', 'L_SS_VN_E', 'L_SS_AD_E', 'L_SS_RS_E', 'L_SS_ID_E', 'L_SS_ED_E', 'L_SS_PB_E', 'L_SS_MD_E', 'L_SS_MF_E', 'L_SS_FN_E', 'L_SS_OE_E'],
        sample='C 빌딩', grp='공간 · 제품', sols=['smartthings', 'biot', 'hvac'])
def _(b):
    s = header(b, '03 · 공간별 가치 제공 시나리오', 'C 빌딩 업무층, 자리는 고르게 쾌적하고 빈 층은 비용이 줄어듭니다', '입주사 업무층 — 입주사 직원 · 시설 관리자 · 임대 운영사, 같은 설비를 세 사람이 다르게 씁니다', w=1152)
    s += b.img('ph.of-office-ac', ab(64, 156, 400, 492), pos='40% 50%', kind='space', hint='공간 사진 (고객 공간으로 교체)', radius=16)
    s += glass(b.tb('공간', f'font-size: 11px; font-weight: 800; color: {LB}') + b.tb('입주사 업무층 · [0]F–[00]F', 'font-size: 17px; font-weight: 800; color: #ffffff')
               + b.tb('시스템에어컨 360 · 무풍 · 환기 · 재실 센서 · b.IoT', f'font-size: 12px; color: {LT}'), 80, 556, 368, 80, pad='10px 14px')
    ppl = [('ph.of-lounge-tv', '25% 60%', '입주사 직원', '창가 자리 · 한여름 오후', '창가는 덥고 안쪽은 춥던 자리 차이', '360° 바람으로 고르게, 환기는 PM1.0 센서에 맞춰', '온도 · 공기 VOC', '[00]% ↓'),
           ('ph.of-desk-control', '60% 40%', '시설 관리자', '입주사 이전 · 레이아웃 변경 날', '파티션이 바뀔 때마다 현장에서 다시 설정', '도면 관제 화면에서 존 · 스케줄 · 온도 범위 재설정', '존 재설정', '[0]일 → [0]시간'),
           ('ph.of-video-wall', '50% 50%', '임대 운영사', '공실 층 · 임대 투어', '비어 있는 층에도 공조 · 조명이 돈다', '공실 층은 최소 운전, 투어 시간에만 쾌적 모드', '공실 층 에너지', '[00]% ↓')]
    for i, (pid, pos, who, when, pain, act, kl, kv) in enumerate(ppl):
        y = 156 + i * 168
        s += b.img(pid, ab(488, y, 184, 156), pos=pos, kind='people', hint=f'{who} 장면 사진', radius=12)
        s += (f'<div style="{ab(688, y + 4, 352, 148, "display: flex; flex-direction: column; gap: 4px")}">'
              + '<span style="display: flex; align-items: baseline; gap: 8px">' + b.tb(who, 'font-size: 17px; font-weight: 800; white-space: nowrap') + b.tb(when, f'font-size: 11.5px; font-weight: 700; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
              + b.tb(pain, f'font-size: 13px; color: {MUTED}')
              + '<span style="display: flex; gap: 8px; margin-top: 4px">' + b.tb('삼성', f'width: 30px; flex-shrink: 0; font-size: 11.5px; font-weight: 800; color: {BLUE}') + b.tb(act, 'font-size: 13.5px; font-weight: 700; line-height: 1.45') + '</span></div>')
        s += f'<div style="{ab(1056, y + 40, 160, 72)}">' + kpi(b, kl, kv) + '</div>'
        if i < 2: s += f'<div style="{ab(488, y + 162, 728, 1, f"background: {LINE}")}"></div>'
    s += footer(b, 'C 오피스 빌딩 · 스마트 오피스 제안 · 수치는 예시 · 사진: samsung.com 오피스 도입사례', 15)
    return root(s)


# ---------------------------------------------------------------- one space, N solutions pinned on a photo
@layout(f='L_PH_VC_1', code='PH-VC-1', p='scenario', name='한 공간 · 솔루션 N개 · 사진 위 번호', when='한 공간에서 여러 솔루션이 나눠 일하는 것을, 공간 사진 위 번호와 솔루션별 하는 일 · KPI로',
        pv=['L_VC_14', 'L_VC_13', 'L_VC_12', 'L_VC_11A', 'L_VC_11B', 'L_VC_1Z'], sample='F 베이커리 카페', grp='공간 · 제품', sols=['vxt', 'stpro', 'knoxsuite', 'coldchain'])
def _(b):
    s = header(b, '03 · 공간별 가치 제공 시나리오', 'F 베이커리 카페 한 매장, 손님 화면부터 진열장 온도까지 넷이 나눠 맡습니다', '한 공간 · 솔루션 4개 — 사진 위 번호가 그 솔루션이 일하는 자리', w=1152)
    s += b.img('ph.fb-cafe-counter', ab(64, 156, 620, 492), pos='30% 50%', kind='space', hint='대상 공간 사진 (고객 매장으로 교체)', radius=16)
    for n, x, y in [('1', 130, 80), ('2', 520, 330), ('3', 90, 236), ('4', 160, 330)]:
        s += pin(b, n, 64 + x, 156 + y, size=34)
    sols = [('Samsung VXT', '카운터 벽면', '메뉴보드 · 신메뉴 · 품절 표시를 웹에서 바로 바꿉니다', 'QM55C ×3', '메뉴 교체', '[0]시간 → [0]분'),
            ('SmartThings Pro', '좌석 · 입구', '영업시간에 맞춰 조명 · 에어컨 · 간판 자동 운영', '시스템에어컨 · 조명 · 스마트 플러그', '영업 외 전력', '[00]% ↓'),
            ('Knox Suite', '카운터 · 입구', '주문 · POS 태블릿은 매장 앱만, 원격 업데이트 · 분실 잠금', '갤럭시 탭 ×[0]', '기기 장애 출동', '[0]회 ↓'),
            ('삼성 콜드체인', '진열장 · 주방', '쇼케이스 · 워크인 냉장 온도를 실시간 감시, 이탈 시 알림', '냉장 쇼케이스 · 온도 센서', '폐기', '[00]% ↓')]
    for i, (nm, where, what, prod, kl, kv) in enumerate(sols):
        y = 156 + i * 112
        s += pin(b, str(i + 1), 722, y + 16, size=30)
        s += (f'<div style="{ab(746, y, 300, 104, "display: flex; flex-direction: column; gap: 3px")}">'
              + '<span style="display: flex; align-items: center; gap: 8px">' + b.tb(nm, 'font-size: 15.5px; font-weight: 800; white-space: nowrap') + b.tb(where, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap') + '</span>'
              + b.tb(what, f'font-size: 12.5px; line-height: 1.5; color: {BODY}') + b.tb(prod, f'font-size: 11.5px; font-weight: 700; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        s += f'<div style="{ab(1060, y + 14, 156, 64)}">' + kpi(b, kl, kv) + '</div>'
        if i < 3: s += f'<div style="{ab(708, y + 106, 508, 1, f"background: {LINE}")}"></div>'
    s += (f'<div style="{ab(708, 606, 508, 42, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 14px; display: flex; align-items: center; gap: 10px")}">'
          + b.tb('매장의 하루', f'font-size: 11.5px; font-weight: 800; color: {BLUE}; flex-shrink: 0') + b.tb('06:30 오픈 ②④ · 12:00 피크 ①③ · 15:00 신메뉴 ① · 22:00 마감 ②④', f'{NUM}; font-size: 12.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += footer(b, 'F 베이커리 카페 · 매장 운영 제안 · 수치는 예시 · 사진: samsung.com 외식 도입사례(말리커피)', 14)
    return root(s)


# ---------------------------------------------------------------- layer stack with real photos
@layout(f='L_PH_SA_C', code='PH-SA-C', p='solution', name='구성 레이어 · 층마다 실사', when='기기 · 플랫폼 · 솔루션 · 운영 서비스를 층으로 쌓되, 층마다 실제 장면 사진과 제품 컷으로 보여줄 때',
        pv=['L_SA_C', 'L_MGI_D', 'L_DEX_D', 'L_HVC_D', 'L_IG_A', 'L_IG_B'], sample='A 커피', grp='솔루션', prods=['qm55c', 'qm65c', 'qm43c', 'kiosk'], sols=['magicinfo', 'stpro'])
def _(b):
    s = header(b, '05 · 솔루션 제안', '기기부터 운영 서비스까지, 네 개 층으로 구성합니다', '층마다 무엇을, 누가 제공하는가 — 사진은 실제 서비스 · 운영 현장, 제품은 공식 컷', w=1152)
    def lab(y, h, k, nm, d, dark=False):
        return (f'<div style="{ab(64, y, 200, h, f"box-sizing: border-box; border-radius: 12px; background: {BLUE if dark else SOFT}; padding: 12px 14px; display: flex; flex-direction: column; justify-content: center; gap: 2px")}">'
                + b.tb(k, f'{NUM}; font-size: 13px; font-weight: 800; color: {LB if dark else BLUE}') + b.tb(nm, f'font-size: 17px; font-weight: 800; color: {"#ffffff" if dark else INK}')
                + b.tb(d, f'font-size: 11.5px; color: {"#dfe5ff" if dark else MUTED}') + '</div>')
    s += lab(156, 132, 'L4', '운영 서비스', '설치부터 운영까지 지원')
    for i, (pid, pos, t, d) in enumerate([('ph.svc-technician', '50% 40%', '설치', '매장당 [0]일'), ('ph.of-control-room', '50% 50%', '원격 모니터링', '24/7'),
                                         ('ph.ed-ac-clean', '50% 40%', '유지보수', '[0]년'), ('ph.rt-staff-tablet', '50% 40%', '콘텐츠 제작 지원', '시즌 템플릿')]):
        x = 280 + i * 237
        s += b.img(pid, ab(x, 156, 225, 132), pos=pos, kind='people', hint=f'{t} 현장 사진', radius=12)
        s += glass('<span style="display: flex; align-items: baseline; gap: 6px">' + b.tb(t, 'font-size: 13.5px; font-weight: 800; color: #ffffff; white-space: nowrap') + b.tb(d, f'{NUM}; font-size: 11.5px; color: {LB}; white-space: nowrap') + '</span>', x + 8, 252, 209, 28, pad='4px 10px')
    s += lab(300, 132, 'L3', '솔루션', '화면 · 전력을 제어', dark=True)
    for i, (pid, pos, t, d) in enumerate([('ph.fb-cafe-bright', '50% 40%', 'MagicINFO', '콘텐츠 · 원격 관리'), ('ph.of-dms-screen', '50% 40%', 'SmartThings Pro', '에너지 · 기기 제어'), ('ph.fb-pos-pay', '50% 40%', 'POS 연동', '주문 · 품절 정보')]):
        x = 280 + i * 316
        s += b.img(pid, ab(x, 300, 304, 132), pos=pos, kind='insitu', hint=f'{t} 화면 · 장면 사진', radius=12)
        s += glass('<span style="display: flex; align-items: baseline; gap: 6px">' + b.tb(t, 'font-size: 13.5px; font-weight: 800; color: #ffffff; white-space: nowrap') + b.tb(d, f'font-size: 11.5px; color: {LB}; white-space: nowrap') + '</span>', x + 8, 396, 288, 28, pad='4px 10px')
    s += lab(444, 58, 'L2', '플랫폼', '')
    for i, (t, d) in enumerate([('Tizen', '기기 내장 OS'), ('클라우드', '서버 구축 불필요')]):
        x = 280 + i * 474
        s += (f'<div style="{ab(x, 444, 462, 58, f"box-sizing: border-box; border-radius: 12px; border: 1px solid {LINE}; padding: 0 16px; display: flex; align-items: center; gap: 10px")}">'
              + b.tb(t, 'font-size: 15px; font-weight: 800') + b.tb(d, f'font-size: 12.5px; color: {MUTED}') + '</div>')
    s += lab(514, 134, 'L1', '디바이스', '매장에 설치되는 화면')
    for i, (cut, m, d) in enumerate([('cut.qm55c', 'QM55C', '카운터'), ('cut.qm65c', 'QM65C', '대기 공간'), ('cut.qm43c', 'QM43C', '픽업대'), ('cut.oh55a', 'OH55A-S', '매장 외부'), ('cut.km24c', 'KM24C', '키오스크')]):
        x = 280 + i * 189
        s += b.img(cut, ab(x, 514, 177, 100), fit='contain', kind='cut', hint=f'{m} 제품 컷', pad=10, bg=SOFT, radius=12)
        s += ('<span style="' + ab(x, 620, 177, 24, 'display: flex; align-items: baseline; gap: 6px; justify-content: center') + '">' + b.tb(m, f'{NUM}; font-size: 13.5px; font-weight: 800')
              + b.tb(d, f'font-size: 11.5px; color: {MUTED}') + '</span>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 도입사례 · 제품 컷: samsung.com', 19)
    return root(s)


# ---------------------------------------------------------------- solution scenario, four scenes 2x2
@layout(f='L_PH_SOL_S', code='PH-SOL-S', p='solution', p2='scenario', name='솔루션 시나리오 · 장면 4 사진', when='솔루션 하나가 하루 동안 공간에서 저절로 움직이는 장면 넷을, 장면 사진과 자동화 규칙으로',
        pv=['L_STP_S', 'L_MGI_S', 'L_BIT_S', 'L_KNX_S', 'L_HVC_S'], sample='A 커피', grp='솔루션', sols=['stpro', 'smartthings'])
def _(b):
    s = header(b, '05 · 솔루션 제안 · SmartThings Pro', '매장의 하루, 에너지는 알아서 관리됩니다', '날씨 · 영업시간 · 한산한 시간에 맞춰 루틴과 AI 절약 모드가 사람 손 없이 움직입니다', w=1152)
    sc = [('06:30', '날씨 기반 프리쿨링', ['에어컨'], '더운 날은 오픈 전에 미리 냉방 — 첫 손님부터 시원하게', 'ph.fb-cafe-air', '50% 50%'),
          ('07:00', '오픈 루틴', ['조명', '메뉴보드'], '영업 시작과 함께 조명 · 메뉴보드 · 간판을 한 번에 ON', 'ph.fb-counter-menu', '50% 30%'),
          ('14:00', '한산 → AI 절약 모드', ['에어컨'], '손님이 줄면 컴프레서 · 설정 온도를 AI가 조정', 'ph.fb-lounge-ac', '55% 35%'),
          ('22:00', '마감 루틴', ['매장 전체'], '남은 기기까지 일괄 OFF, 꺼짐 확인은 점주 폰으로', 'ph.fb-cafe-dark', '50% 50%')]
    for i, (t, ti, devs, d, pid, pos) in enumerate(sc):
        x = 64 + (i % 2) * 584; y = 156 + (i // 2) * 232
        s += f'<div style="{ab(x, y, 568, 220, f"box-sizing: border-box; border-radius: 16px; background: {SOFT}")}"></div>'
        s += b.img(pid, ab(x, y, 300, 220), pos=pos, kind='space', hint=f'{t} {ti} 장면 사진', radius=16)
        s += numbadge(b, str(i + 1), x + 12, y + 12, size=28)
        s += (f'<div style="{ab(x + 318, y + 18, 232, 186, "display: flex; flex-direction: column; gap: 6px")}">'
              + b.tb(t, f'{NUM}; font-size: 26px; font-weight: 800; color: {BLUE}') + b.tb(ti, 'font-size: 17px; font-weight: 800')
              + '<span style="display: flex; gap: 5px; flex-wrap: wrap">' + ''.join(chip(b, dv, size=11, h=20) for dv in devs) + '</span>'
              + b.tb(d, f'font-size: 13px; line-height: 1.55; color: {BODY}') + '</div>')
    s += (f'<div style="{ab(64, 620, 1152, 36, f"box-sizing: border-box; border-radius: 10px; background: {CHIP}; padding: 0 16px; display: flex; align-items: center; gap: 12px")}">'
          + b.tb('월말', f'font-size: 12px; font-weight: 800; color: {BLUE}') + b.tb('매장별 에너지 리포트 — 본사에서 에너지원별 사용 · 비용을 비교', 'font-size: 13.5px; font-weight: 700')
          + b.tb('하루 절감 [00]%', f'{NUM}; font-size: 14px; font-weight: 800; color: {BLUE}; margin-left: auto') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 외식 도입사례 · 공식 연출', 21)
    return root(s)


# ---------------------------------------------------------------- service coverage with engineer photo
@layout(f='L_PH_SV_B', code='PH-SV-B', p='why', name='서비스 · 엔지니어 사진 + SLA', when='전국 서비스망과 장애 대응 기준(SLA)을, 실제 엔지니어 · 점검 현장 사진과 함께 보여줄 때',
        pv=['L_SV_B', 'L_RV_C', 'L_TO_B'], sample='A 커피', grp='경쟁 · 강점', sols=['magicinfo'])
def _(b):
    s = header(b, '07 · WHY SAMSUNG', '전국 어디서나 같은 기준으로 지원합니다', '서비스 거점 커버리지 · 장애 대응 기준 (SLA) — 사진은 실제 서비스 현장', w=1152)
    s += b.img('ph.svc-technician', ab(64, 156, 508, 492), pos='50% 40%', kind='people', hint='서비스 엔지니어 사진', radius=16)
    inner = ('<span style="display: flex; gap: 28px">'
             + '<span style="display: flex; flex-direction: column">' + b.tb('[000]곳', f'{NUM}; font-size: 30px; font-weight: 800; color: #ffffff') + b.tb('서비스 거점', f'font-size: 12px; color: {LT}') + '</span>'
             + '<span style="display: flex; flex-direction: column">' + b.tb('[000]명', f'{NUM}; font-size: 30px; font-weight: 800; color: #ffffff') + b.tb('전담 엔지니어', f'font-size: 12px; color: {LT}') + '</span></span>')
    s += glass(inner, 80, 548, 360, 86, pad='12px 18px')
    sla = [('1', '장애 접수', '24시간 · 365일', '콜센터 · 원격 모니터링 자동 감지'), ('2', '원격 조치', '[0]시간 이내', 'MagicINFO 원격 진단 · 재부팅 · 콘텐츠 복구'),
           ('3', '현장 방문', '수도권 [0]시간', '지방 [00]시간 · 전 매장 엔지니어 직접 방문'), ('4', '부품 교체', '[0]영업일 이내', '보증 기간 내 무상 · 거점별 주요 부품 재고'),
           ('5', '정기 점검', '연 [0]회', '전 매장 방문 점검 · 점검 리포트 제공')]
    for i, (n, k, v, d) in enumerate(sla):
        y = 156 + i * 60
        s += (f'<div style="{ab(596, y, 620, 54, f"display: flex; align-items: center; gap: 12px; border-bottom: 1px solid {LINE}")}">'
              + b.tb(n, f'{NUM}; width: 24px; height: 24px; border-radius: 50%; background: {BLUE}; color: #fff; font-size: 11.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0')
              + b.tb(k, 'width: 76px; flex-shrink: 0; font-size: 14px; font-weight: 800') + b.tb(v, f'{NUM}; width: 132px; flex-shrink: 0; font-size: 14.5px; font-weight: 800; color: {BLUE}; white-space: nowrap')
              + b.tb(d, f'font-size: 12.5px; color: {BODY}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    for i, (pid, pos, t) in enumerate([('ph.ed-ac-clean', '50% 40%', '정기 점검 · 세척'), ('ph.of-control-room', '50% 50%', '원격 모니터링'), ('ph.mf-dms', '50% 50%', '원격 진단 화면')]):
        x = 596 + i * 212
        s += b.img(pid, ab(x, 470, 196, 132), pos=pos, kind='people', hint=f'{t} 사진', radius=12)
        s += b.tb(t, ab(x + 8, 568, extra=f'border-radius: 8px; background: {GLASS}; color: #fff; font-size: 12px; font-weight: 800; padding: 4px 10px'), 'div')
    s += b.tb('SLA는 계약 조건에 따라 확정 · 도서 지역은 별도 협의', ab(596, 616, 620, extra=f'font-size: 12px; color: {FAINT}'), 'div')
    s += footer(b, 'A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 서비스 · 교육 · 제조 도입사례', 25)
    return root(s)


# ---------------------------------------------------------------- scope marked on a space photo
@layout(f='L_PH_OV_B', code='PH-OV-B', p='overview', name='제안 범위 · 사진 위 포함 / 제외', when='이번 제안이 맡는 것과 맡지 않는 것을, 공간 사진 위 표시와 포함 · 선택 · 제외 목록으로',
        pv=['L_OV_B', 'L_OV_C', 'L_IP_B'], sample='C 빌딩', grp='분석 · 이해', prods=['kiosk', 'ac360', 'dvms2'], sols=['stpro', 'biot'])
def _(b):
    s = header(b, '00 · 제안 개요', '이번 제안이 맡는 것과 맡지 않는 것', '사진 위 파란 번호 = 포함 · 회색 = 다른 주체 — 범위 밖 항목은 담당과 진행 방법을 함께 적었습니다', w=1152)
    s += b.img('ph.of-office-ac', ab(64, 156, 556, 492), pos='50% 50%', kind='space', hint='제안 대상 공간 사진', radius=16)
    for n, x, y, c in [('1', 140, 60, BLUE), ('2', 130, 300, BLUE), ('3', 420, 250, BLUE), ('4', 250, 360, BLUE), ('A', 330, 120, '#7c8597'), ('B', 500, 430, '#7c8597')]:
        s += pin(b, n, 64 + x, 156 + y, bg=c, size=32)
    def blk(y, h, title, col, items, two=False):
        o = (f'<div style="{ab(644, y, 572, h, "display: flex; flex-direction: column; gap: 4px")}">' + b.tb(title, f'font-size: 13px; font-weight: 800; color: {col}')
             + f'<div style="display: grid; grid-template-columns: {"repeat(2, minmax(0, 1fr))" if two else "minmax(0, 1fr)"}; column-gap: 16px">')
        for k, v in items:
            o += (f'<span style="display: flex; align-items: center; gap: 8px; height: 28px; border-bottom: 1px solid {LINE}; min-width: 0">'
                  + b.tb(k, f'{NUM}; width: 18px; height: 18px; border-radius: 50%; background: {col}; color: #fff; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0')
                  + b.tb(v, 'font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>')
        return o + '</div></div>'
    s += blk(156, 120, '포함 · 6 — 본 제안 금액에 포함', BLUE, [('1', '시스템에어컨 교체'), ('2', 'b.IoT 중앙 관리'), ('3', '회의실 사이니지'), ('4', '로비 안내 키오스크'), ('5', '설치 · 시운전 · 교육'), ('6', '무상 유지보수')], two=True)
    s += blk(290, 116, '선택 · 3 — 원하시면 추가 · 금액 별도', '#3d6ae0', [('+', '로비 LED 외벽 · 본 금액 대비 +[00]%'), ('+', '에너지 리포트 · +[00]%'), ('+', '유지보수 연장 +[0]년 · +[00]%')])
    s += blk(420, 120, '제외 · 4 — 다른 주체가 진행', '#7c8597', [('A', '건축 · 인테리어 공사 · 고객사'), ('B', '전기 간선 증설 · 별도 발주'), ('C', '기존 장비 폐기 비용 · 고객사'), ('D', '입주사 개별 장비 · 입주사')], two=True)
    s += (f'<div style="{ab(644, 560, 572, 88, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; padding: 10px 16px; display: flex; flex-direction: column; gap: 4px")}">'
          + b.tb('결정이 필요한 두 가지', f'font-size: 12px; font-weight: 800; color: {BLUE}')
          + b.tb('Q1  천장 마감 복구는 누가?', 'font-size: 14px; font-weight: 800') + b.tb('Q2  옵션은 계약 때 확정?', 'font-size: 14px; font-weight: 800') + '</div>')
    s += footer(b, 'C 빌딩 · 스마트 오피스 제안 · 금액은 견적서에서 제시 · 사진: samsung.com 오피스 도입사례', 5)
    return root(s)


# ---------------------------------------------------------------- year calendar with season photos
@layout(f='L_PH_CAL_A', code='PH-CAL-A', p='scenario', name='열두 달 운영 · 시기별 사진', when='학기 · 성수기처럼 시기마다 운영 방식이 바뀔 때, 열두 달 띠와 시기별 현장 사진으로',
        pv=['L_SS_E', 'L_TR_D', 'L_CU_B'], sample='E 대학교', grp='공간 · 제품', sols=['magicinfo', 'stpro', 'hvac'])
def _(b):
    s = header(b, '03 · 공간별 가치 제공 시나리오', '학기와 방학, 캠퍼스는 열두 달 다르게 움직입니다', '시기마다 운영 모드가 바뀌고, 모드마다 공조 · 화면 · 점검이 함께 바뀝니다 · 학사 일정은 예시', w=1152)
    months = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]
    ev = {3: '개강', 4: '중간고사', 5: '축제', 6: '기말', 7: '여름방학', 9: '개강', 10: '중간', 12: '기말', 1: '겨울방학'}
    per = {3: 0, 4: 0, 5: 0, 6: 0, 7: 1, 8: 1, 9: 2, 10: 2, 11: 2, 12: 2, 1: 3, 2: 3}
    for i, m in enumerate(months):
        x = 64 + i * 96
        p = per[m]
        s += (f'<div style="{ab(x, 152, 92, 52, f"box-sizing: border-box; border-radius: 8px; background: {BLUE if p in (0, 2) else LINE}; padding: 6px 8px; display: flex; flex-direction: column; gap: 1px")}">'
              + b.tb(f'{m}월', f'{NUM}; font-size: 14px; font-weight: 800; color: {"#ffffff" if p in (0, 2) else INK}') + b.tb(ev.get(m, '·'), f'font-size: 11px; color: {"#dfe5ff" if p in (0, 2) else MUTED}; white-space: nowrap') + '</div>')
    cols = [('1학기', '3–6월', '정상 · 집중 운영', 'ph.ed-lecture-led', '50% 40%', '강의동 정상 · 시험 기간 도서관 24시간', '시험 안내 · 좌석 현황 자동 전환', '학기 중엔 원격 진단만'),
            ('여름방학', '7–8월', '점검 · 공사 창', 'ph.ed-ac-clean', '50% 40%', '공용부만 · 나머지 정지', '방학 공지 · 운영 시간 자동 전환', '방학 공사 창에 일괄 점검 · 교체'),
            ('2학기', '9–12월', '정상 · 집중 운영', 'ph.ed-library', '50% 50%', '강의동 정상 · 축제 · 시험 집중', '행사 · 시험 안내 편성', '학기 중엔 원격 진단만'),
            ('겨울방학', '1–2월', '최소 운영', 'ph.ed-lab-night', '50% 50%', '공용부만 · 빈 강의실 정지', '졸업 · 개강 안내 예약 송출', '난방기 점검 · 필터 교체')]
    for i, (nm, mm, mode, pid, pos, a, c, d) in enumerate(cols):
        x = 64 + i * 292
        s += b.img(pid, ab(x, 220, 276, 262), pos=pos, kind='space', hint=f'{nm} 캠퍼스 사진', radius=14)
        s += b.tb(mode, ab(x + 10, 230, extra=f'border-radius: 999px; background: {BLUE if i in (0, 2) else GLASS}; color: #fff; font-size: 12px; font-weight: 800; padding: 5px 11px'), 'div')
        s += (f'<div style="{ab(x, 496, 276, 150, "display: flex; flex-direction: column; gap: 5px")}">'
              + '<span style="display: flex; align-items: baseline; gap: 8px">' + b.tb(nm, 'font-size: 17px; font-weight: 800') + b.tb(mm, f'{NUM}; font-size: 12.5px; font-weight: 700; color: {MUTED}') + '</span>'
              + ''.join('<span style="display: flex; gap: 8px">' + b.tb(k, f'width: 30px; flex-shrink: 0; font-size: 11.5px; font-weight: 800; color: {BLUE}') + b.tb(v, f'font-size: 12.5px; line-height: 1.45; color: {BODY}') + '</span>'
                        for k, v in [('공조', a), ('화면', c), ('점검', d)]) + '</div>')
    s += footer(b, 'E 대학교 · 스마트 캠퍼스 구축 제안 · 학사 일정은 [0000] 학사력 기준 예시 · 사진: samsung.com 교육 도입사례 (겨울방학은 야간으로 보정)', 19)
    return root(s)


# ---------------------------------------------------------------- residential selling points (RS)
@layout(f='L_PH_RV_A', code='PH-RV-A', p='value', p2='products', ind='RS', name='분양 포인트 4 · 공간 사진', when='모델하우스에서 기억될 분양 포인트 넷을, 포인트마다 공간 사진과 분양 문구 예시로',
        pv=['L_RV_A'], sample='R 건설', grp='과제 · 가치', sols=['smartthings'])
def _(b):
    s = header(b, '02 · VALUE PROPS — 분양 · 입주민 가치', '모델하우스에서 ‘이 단지’로 기억될 네 가지', '분양 포인트 · 분양 문구 예시 · 인근 경쟁 단지와 비교 (경쟁 단지는 익명)', w=1152)
    pts = [('01', '집 안 가전 · 공조를 앱 하나로', '“퇴근길에 집을 미리 시원하게”', 'SmartThings · 월패드 연동', 'ph.rs-living-room', '50% 50%', '조명 · 난방만', '없음'),
           ('02', '전 실 시스템에어컨', '“방마다 따로, 바람 없이 시원하게”', '무풍 시스템에어컨 · [0]실', 'ph.rs-living-ac', '50% 30%', '거실 · 안방', '유상 옵션'),
           ('03', '빌트인 가전 패키지', '“가구처럼 맞춰진 주방”', 'Bespoke 빌트인', 'ph.rs-dark-kitchen', '50% 50%', '냉장고만', '없음'),
           ('04', '입주 후 2년 케어', '“입주 첫 여름까지 점검해 드립니다”', '입주민 케어 서비스', 'ph.svc-technician', '50% 40%', '없음', '입주 점검 1회')]
    for i, (n, t, q, prod, pid, pos, ca, cb) in enumerate(pts):
        x = 64 + i * 292
        s += b.img(pid, ab(x, 156, 276, 296), pos=pos, kind='space', hint=f'분양 포인트 {n} 공간 사진', radius=14)
        s += glass(b.tb(n, f'{NUM}; font-size: 13px; font-weight: 800; color: {LB}') + b.tb(t, 'font-size: 16px; font-weight: 800; color: #ffffff; line-height: 1.35'), x + 10, 368, 256, 74, pad='8px 12px', gap=1)
        s += (f'<div style="{ab(x, 466, 276, 92, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; padding: 10px 14px; display: flex; flex-direction: column; gap: 4px")}">'
              + b.tb('분양 문구 예시', f'font-size: 11px; font-weight: 800; color: {BLUE}') + b.tb(q, 'font-size: 14.5px; font-weight: 800; line-height: 1.4') + '</div>')
        s += b.tb(prod, ab(x, 568, 276, extra=f'font-size: 12.5px; font-weight: 700; color: {BLUE}'), 'div')
        s += b.tb(f'경쟁 A · {ca}   경쟁 B · {cb}', ab(x, 596, 276, 40, f'box-sizing: border-box; border-top: 1px solid {LINE}; padding-top: 8px; font-size: 12px; color: {MUTED}'), 'div')
    s += footer(b, 'R 건설 · 공동주택 제안 · 경쟁 단지: 분양 공고 · 모델하우스 기준 · 익명 · 사진: samsung.com 주거 · 호텔 도입사례', 9)
    return root(s)


# ---------------------------------------------------------------- image sources as thumbnails
@layout(f='L_PH_AX_A', code='PH-AX-A', p='appendix', name='이미지 출처 · 썸네일 카드', when='제안서에 쓴 이미지의 출처와 사용 조건을, 이미지 썸네일을 직접 보면서 확인하게 할 때',
        pv=['L_AX_A'], sample='A 커피', grp='부록')
def _(b):
    s = header(b, '부록 · 이미지 출처', '이 제안서에 쓴 이미지 [18]장, 출처와 사용 조건', '외부 제출 전 이 표로 확인 — 썸네일 · 쓰인 곳 · 출처 유형 · 사용 조건', w=1152)
    s += (f'<div style="{ab(64, 142, 1152, 26, "display: flex; gap: 8px")}">'
          + ''.join(chip(b, t, size=11.5, h=24) for t in ['공식 [N]', '도입사례 [N]', '보정 · 생성 [N]', '고객 현장 [N]', '고객 제공 [N]']) + '</div>')
    items = [('cut.qm55c', 'p.01 · 표지', '공식', 'samsung.com 제품 페이지 · 제품 컷', '공식 누끼 · 수집 [0000.00.00]', True),
             ('ph.fb-dt-order', 'p.23 · 유관 사례', '도입사례', '삼성전자 고객 사례 · 커피빈 DT점', '다른 브랜드 로고 · 메뉴 노출 → 고객사 확인', False),
             ('ph.fb-counter-menu', 'p.04 · 공간 맵', '도입사례', '삼성전자 고객 사례 · 말리커피 강남점', '외부 제출 전 고객사 확인', False),
             ('ph.of-dms-screen', 'p.19 · 솔루션 화면', '도입사례', '삼성전자 고객 사례 · 대구상공회의소', '관리 화면 · 샘플 데이터 여부 확인', False),
             ('ph.rt-fashion-phone', 'p.07 · 사용 장면', '공식', 'samsung.com 비즈니스 페이지 · 연출 컷', '모델 얼굴 포함 · 출처 표기', False),
             ('ph.fb-counter-gray', 'p.09 · 전후 비교', '보정 · 생성', '도입사례 사진을 흑백으로 처리', '슬라이드에 ‘흑백 처리’ 표기', False),
             ('ph.ht-lobby', 'p.15 · 디자인 컨셉', '도입사례', '삼성전자 고객 사례 · 신라스테이 서초', '외부 제출 전 고객사 확인', False),
             ('ph.sv-study-night', 'p.12 · 시나리오', '보정 · 생성', '도입사례 사진을 야간으로 보정', '슬라이드에 ‘보정’ 표기', False)]
    for i, (pid, where, typ, src, cond, cut) in enumerate(items):
        x = 64 + (i % 4) * 292; y = 176 + (i // 4) * 238
        s += b.img(pid, ab(x, y, 276, 140), pos='50% 45%', fit='contain' if cut else 'cover', kind='cut' if cut else 'space', hint=f'이미지 {i + 1} 썸네일', pad=12 if cut else 0, bg=SOFT if cut else 'transparent', radius=10)
        s += numbadge(b, str(i + 1), x + 8, y + 8, size=24)
        col = BLUE if typ == '공식' else ('#3d6ae0' if typ == '도입사례' else WARN)
        s += (f'<div style="{ab(x, y + 148, 276, 82, "display: flex; flex-direction: column; gap: 3px")}">'
              + '<span style="display: flex; align-items: center; gap: 6px">' + b.tb(where, f'font-size: 12px; font-weight: 800; white-space: nowrap')
              + b.tb(typ, f'margin-left: auto; height: 20px; padding: 0 8px; border-radius: 999px; background: {CHIP if typ != "보정 · 생성" else WARNBG}; color: {col}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap') + '</span>'
              + b.tb(src, f'font-size: 12.5px; font-weight: 700; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(cond, f'font-size: 11.5px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    s += footer(b, 'A 커피 프랜차이즈 · 매장 디지털 전환 제안 · 도입사례 사진은 외부 제출 전 고객사 확인 · 1 / 2', 41)
    return root(s)
