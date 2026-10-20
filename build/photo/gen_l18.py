# 5차 — 경쟁사 분석 · 시장 · 브랜드 · 사례 경쟁력 사진 레이아웃 9장 (L_PH_CP_J ~ L_PH_CP_S)
from gen_r5 import *
L = []
GREY_A, GREY_B = '#9aa1ae', '#c9cdd5'   # 경쟁사 A · B 막대 (회색 계열 두 단계)


def src(code):
    return f'사진: samsung.com {SRC[code]} 도입사례 · 비즈니스 페이지'


def hbar(b, x, y, wmax, frac, color, val, vcol=INK, h=12, vw=80, size=12.5):
    """가로 막대 + 오른쪽 끝 값 (막대 끝에서 8px 뒤)"""
    w = max(4, round(wmax * frac))
    return (rect(x, y, w, h, color, 3)
            + b.tb(val, ab(x + w + 8, y + h // 2 - 9, vw, 18, f'{NUM}; font-size: {size}px; font-weight: 800; color: {vcol}; white-space: nowrap; line-height: 18px'), 'div'))


def txt(b, text, x, y, w, size=12, color=MUTED, weight=700, extra=''):
    """한 줄 라벨 (nowrap)"""
    return b.tb(text, ab(x, y, w, None, f'font-size: {size}px; font-weight: {weight}; color: {color}; white-space: nowrap; line-height: {round(size * 1.45)}px; {extra}'), 'div')


# ---------------------------------------------------------------- J · 공간별 경쟁 구도 (리테일 5자리)
@layout(L, f='L_PH_CP_J', code='PH-CP-J', p='competition', p2='market', name='공간별 경쟁 구도 · 자리 사진 5열',
        when='매장 안 자리(외벽 · 사이니지 · 키오스크 · 태블릿 · 공조)마다 붙는 경쟁사와 고객이 고르는 기준이 다를 때, 자리별로 우리 카드를 고를 때',
        pv=[], sample=CUST['RT'], grp='경쟁 · 시장 경쟁력')
def _(b):
    s = header(b, EB_CP, '자리마다 경쟁 상대와 고객의 기준이 다릅니다', 'D 리테일 플래그십 매장 다섯 자리 · 자리별 경쟁 구도와 고객이 고르는 기준 · 출처: [입찰 · 영업 현장 정보, 연도]', w=1152)
    cols = [('01 · 외벽 · 파사드 LED', 'r4.rt-store-facade', '50% 40%', ['경쟁사 A', '경쟁사 C'], ('우위', BLUE),
             '멀리서 보이는 밝기 · 야간 화질', '실외 LED XHB · [0000] nit · IP[65]'),
            ('02 · 매장 사이니지', 'r4.rt-fashion-led', '50% 45%', ['경쟁사 A', '경쟁사 B'], ('우위', BLUE),
             '콘텐츠 교체 속도 · 전 매장 일괄 운영', 'VXT CMS로 [000]개 매장 한 번에 교체'),
            ('03 · 안내 키오스크', 'ph.rt-atrium-kiosk', '48% 70%', ['경쟁사 C'], ('가격 열위', WARN),
             '터치 반응 · 결제 · 회원 연동', 'KM24C + 결제 모듈 일괄 · 총비용으로 대응'),
            ('04 · 직원 태블릿', 'ph.rt-shoppers', '58% 40%', ['경쟁사 B', '경쟁사 D'], ('우위', BLUE),
             '하루 종일 쓰는 내구성 · 분실 시 보안', '갤럭시 탭 + Knox로 [000]대 원격 관리'),
            ('05 · 천장 공조', 'ph.rt-ceiling-ac', '8% 30%', ['경쟁사 A', '경쟁사 D'], ('접전', MUTED),
             '바람 · 소음 · 매달 전기료', '무풍 360 카세트 · 전기료 [00]% 절감')]
    W, G = 216, 18
    for i, (nm, pid, pos, rivals, (st, stc), crit, ours) in enumerate(cols):
        x = 64 + i * (W + G)
        s += photo(b, pid, x, 152, W, 236, pos=pos, hint=f'{nm[5:]} 자리 사진 (고객 매장으로 교체)')
        s += tag_on(b, nm, x + 10, 162)
        s += txt(b, '주요 경쟁', x, 400, 120, size=11, color=MUTED, weight=800)
        s += b.tb(st, ab(x + W - 90, 400, 90, 16, f'font-size: 11.5px; font-weight: 800; color: {stc}; text-align: right; white-space: nowrap; line-height: 16px'), 'div')
        s += (f'<div style="{ab(x, 420, W, 22, "display: flex; gap: 6px")}">'
              + ''.join(chip(b, r, color=BODY, bg='#eceef2') for r in rivals) + '</div>')
        s += txt(b, '고객이 보는 기준', x, 456, 150, size=11, color=MUTED, weight=800)
        s += b.tb(crit, ab(x, 474, W, 40, f'font-size: 14px; font-weight: 700; line-height: 20px; color: {INK}; {clamp(2)}'), 'div')
        s += card(b.tb('우리 카드', f'font-size: 11px; font-weight: 800; color: {BLUE}; white-space: nowrap')
                  + b.tb(ours, f'font-size: 14px; font-weight: 800; line-height: 20px; color: {BLUE}; {clamp(2)}'),
                  x, 522, W, 78, bg=CHIP, pad='9px 12px', gap=2)
    s += (f'<div style="{ab(64, 612, 1152, 36, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; display: flex; align-items: center; justify-content: center; gap: 14px")}">'
          + b.tb('다섯 자리 중', f'font-size: 13px; font-weight: 700; color: {BODY}') + b.tb('우위 3', f'font-size: 14px; font-weight: 800; color: {BLUE}')
          + b.tb('접전 1', f'font-size: 14px; font-weight: 800; color: {MUTED}') + b.tb('가격 열위 1', f'font-size: 14px; font-weight: 800; color: {WARN}')
          + b.tb('→ 다섯 자리를 한 계약으로 묶어 키오스크 가격 열위를 덮습니다', f'font-size: 13px; font-weight: 700; color: {BODY}') + '</div>')
    s += footer(b, DEAL['RT'] + ' · 자리별 경쟁사는 영업 현장 정보 기준 · 경쟁사 익명 · ' + src('RT'), 9)
    return s


# ---------------------------------------------------------------- K · 브랜드 퍼널 + 고객 사진
@layout(L, f='L_PH_CP_K', code='PH-CP-K', p='competition', p2='why', name='브랜드 퍼널 · 인지 → 추천 + 고객 사진',
        when='브랜드 조사 결과를 인지 · 고려 · 선호 · 추천 네 단계로 놓고, 어느 단계에서 경쟁사와 벌어지는지 고객 사진과 함께 읽어 줄 때',
        pv=[], sample=CUST['FN'], grp='경쟁 · 브랜드 경쟁력')
def _(b):
    s = header(b, EB_WHY, '인지는 비슷합니다 — 삼성은 선호와 추천에서 앞섭니다', 'T 은행 영업점 고객 대상 · 금융 디지털 기기 브랜드 퍼널 · 삼성 vs 경쟁사 A · B · 출처: [브랜드 조사, 연도]', w=1152)
    s += photo(b, 'ph.fn-counter', 64, 152, 340, 496, pos='80% 50%', hint='영업점 고객 사진 (고객 영업점으로 교체)')
    s += label_on(b, '영업점 고객', '창구 태블릿으로 상품을 함께 봅니다', 76, 580, 316, lines=1)
    # legend
    s += (f'<div style="{ab(428, 152, 468, 18, "display: flex; align-items: center; justify-content: center; gap: 16px")}">'
          + ''.join(f'<span style="display: inline-flex; align-items: center; gap: 6px"><span style="width: 12px; height: 12px; border-radius: 3px; background: {c}"></span>'
                    + b.tb(n, f'font-size: 12px; font-weight: 800; color: {tc}; white-space: nowrap; line-height: 18px') + '</span>'
                    for n, c, tc in [('삼성', BLUE, BLUE), ('경쟁사 A', GREY_A, BODY), ('경쟁사 B', GREY_B, BODY)]) + '</div>')
    stages = [('1', '인지', (0.94, 0.92, 0.84)), ('2', '고려', (0.74, 0.66, 0.52)),
              ('3', '선호', (0.58, 0.40, 0.31)), ('4', '추천', (0.46, 0.27, 0.20))]
    convs = [('↓ 인지 → 고려 전환', '삼성 [00]% · A [00]% · B [00]%', BODY),
             ('↓ 고려 → 선호 · 차이가 가장 큰 구간', '삼성 [00]% vs A [00]%', BLUE),
             ('↓ 선호 → 추천 전환', '삼성 [00]% · A [00]% · B [00]%', BODY)]
    CX, BW, BH = 662, 266, 90
    for i, (n, nm, fr) in enumerate(stages):
        W = 468 - i * 28; x = CX - W // 2; y = 180 + i * (BH + 36)
        s += box(x, y, W, BH, bg=CHIP if i >= 2 else SOFT, radius=12)
        s += (f'<div style="{ab(x + 16, y + 22, 70, 46, "display: flex; flex-direction: column; gap: 0")}">'
              + b.tb(f'{n}단계', f'font-size: 11px; font-weight: 800; color: {MUTED}; white-space: nowrap; line-height: 16px')
              + b.tb(nm, f'font-size: 18px; font-weight: 800; color: {INK}; white-space: nowrap; line-height: 26px') + '</div>')
        for j, (who, c, vc) in enumerate([('삼성', BLUE, BLUE), ('A', GREY_A, BODY), ('B', GREY_B, BODY)]):
            ry = y + 14 + j * 22
            s += b.tb(who, ab(x + 92, ry - 3, 30, 18, f'font-size: 11px; font-weight: 800; color: {vc}; white-space: nowrap; line-height: 18px'), 'div')
            s += hbar(b, x + 124, ry, BW, fr[j], c, '[00]%', vcol=vc, h=12, vw=48, size=12)
        if i < 3:
            lab, val, col = convs[i]
            s += (f'<div style="{ab(428, y + BH + 8, 468, 20, "display: flex; align-items: center; justify-content: center; gap: 8px")}">'
                  + b.tb(lab, f'font-size: 12px; font-weight: 800; color: {col}; white-space: nowrap; line-height: 20px')
                  + b.tb(val, f'{NUM}; font-size: 12px; font-weight: 700; color: {col if col == BLUE else MUTED}; white-space: nowrap; line-height: 20px') + '</div>')
    # right — photo + reading cards
    s += photo(b, 'ph.fn-branch', 920, 152, 296, 150, pos='50% 55%', hint='영업점 내부 사진 (고객 영업점으로 교체)')
    s += tag_on(b, '선호를 만든 곳 · 영업점 경험', 930, 162)
    reads = [('읽기 1', BLUE, '인지는 비슷 — 차이는 선호부터', '세 회사 모두 인지 [90]% 안팎 · 고려 → 선호에서 [00]%p 벌어집니다'),
             ('읽기 2', BLUE, '추천 의향 [00]%p 앞섭니다', '창구 태블릿 상담 만족이 추천 이유 1위 · 응답 [00]%'),
             ('보완', WARN, '고려 단계 이탈은 A보다 큽니다', '가격 인식이 이유 · 5년 총비용 비교로 대응 → p.[00]')]
    for k, (lab, c, t, d) in enumerate(reads):
        y = 314 + k * 115
        s += card(b.tb(lab, f'font-size: 11px; font-weight: 800; color: {c}; white-space: nowrap; line-height: 16px')
                  + b.tb(t, f'font-size: 15px; font-weight: 800; line-height: 21px; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
                  + b.tb(d, f'font-size: 12px; line-height: 17px; color: {BODY}; {clamp(2)}'),
                  920, y, 296, 104, bg=WARNBG if c == WARN else SOFT, pad='11px 14px', gap=3)
    s += footer(b, DEAL['FN'] + ' · 막대 길이는 예시 · 경쟁사 익명 · ' + src('FN'), 10)
    return s


# ---------------------------------------------------------------- L · 브랜드 자산 · 수상 · 인증 + 제품 사진
@layout(L, f='L_PH_CP_L', code='PH-CP-L', p='competition', p2='why', name='브랜드 자산 · 인증 배지 + 현장 제품 사진',
        when='현장 입찰에서 보는 수상 · 보안 · 내구 · 방수 인증을 배지 카드로 모으고, 경쟁사 보유 개수와 견주어 브랜드 신뢰를 보여줄 때',
        pv=[], sample=CUST['MF'], grp='경쟁 · 브랜드 경쟁력')
def _(b):
    s = header(b, EB_WHY, '현장 단말을 고를 때 보는 인증, 삼성은 이미 갖췄습니다', 'L 제조 현장 단말 · 갤럭시 탭 액티브 · 엑스커버 · Knox · 인증명 · 연도는 자리표시 · 출처: [인증 · 시상 기관, 연도]', w=1152)
    s += photo(b, 'fill.factory_tab', 64, 152, 552, 300, pos='30% 40%', hint='현장 작업자 사진 (고객 공장으로 교체)')
    s += label_on(b, '현장 사진 · 러기드 태블릿', '생산 라인에서 하루 [10]시간 사용', 316, 164, 288, lines=1)
    # product tiles
    for pid, x, w, nm in [('cut.tabactive5', 64, 168, '갤럭시 탭 액티브5'), ('cut.xcover7', 244, 128, '갤럭시 엑스커버7')]:
        s += box(x, 464, w, 184, bg=SOFT)
        s += cut(b, pid, x, 464, w, 148, hint=f'{nm} 제품 컷', pad=14, bg='transparent')
        s += b.tb(nm, ab(x, 616, w, 20, f'font-size: 12px; font-weight: 800; color: {INK}; text-align: center; white-space: nowrap; line-height: 20px'), 'div')
    s += photo(b, 'fill.knox_kv', 384, 464, 232, 184, pos='50% 50%', hint='Samsung Knox 보안 플랫폼 화면')
    s += tag_on(b, 'Knox 보안 플랫폼', 394, 610)
    # badges 3 × 2
    badges = [('디자인', '디자인 어워드', '[ ] 디자인 어워드 [본상]', '탭 액티브5 · [0000]년'),
              ('보안', '보안 인증', '[ ] 정부 보안 인증 · Knox', '갤럭시 B2B 단말 · [0000]년'),
              ('내구', '내구 규격', '[ ] 군사 내구 규격', '[00]개 항목 · 낙하 · 진동'),
              ('IP', '방수 · 방진', 'IP[68] 방수 · 방진 등급', '탭 액티브5 · 엑스커버7'),
              ('에너지', '에너지', '[ ] 에너지 효율 인증', '배터리 교체형 · [0000]년'),
              ('순위', '업계 순위', '러기드 단말 점유율', '[0]위 · 출처 [조사 기관, 연도]')]
    for k, (em, cat, t, sub) in enumerate(badges):
        x = 640 + (k % 3) * 198; y = 152 + (k // 3) * 162
        emb = b.tb(em, f'width: 44px; height: 44px; flex-shrink: 0; box-sizing: border-box; border-radius: 50%; border: 2px solid {BLUE}; background: #ffffff; color: {BLUE}; font-size: {12 if len(em) <= 2 else 10.5}px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap')
        s += card('<span style="display: flex; align-items: center; gap: 10px">' + emb
                  + b.tb(cat, f'font-size: 11.5px; font-weight: 800; color: {BLUE}; white-space: nowrap; line-height: 18px') + '</span>'
                  + b.tb(t, f'margin-top: 6px; font-size: 15px; font-weight: 800; line-height: 21px; color: {INK}; {clamp(2)}')
                  + b.tb(sub, f'margin-top: auto; font-size: 11px; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 16px'),
                  x, y, 180, 150, bg=SOFT, pad='12px 14px', gap=2)
    # comparison bars
    s += txt(b, '현장 입찰에서 보는 인증 · 수상 보유 개수', 640, 486, 400, size=12.5, color=INK, weight=800)
    for j, (who, c, fr, val, vc) in enumerate([('삼성', BLUE, 1.0, '[00]개', BLUE), ('경쟁사 A', GREY_A, 0.42, '[0]개', BODY), ('경쟁사 B', GREY_B, 0.28, '[0]개', BODY)]):
        y = 514 + j * 26
        s += txt(b, who, 640, y - 3, 70, size=12, color=vc, weight=800)
        s += hbar(b, 716, y, 400, fr, c, val, vcol=vc, h=12, vw=60)
    s += (f'<div style="{ab(640, 604, 576, 44, f"box-sizing: border-box; border-radius: 10px; background: {CHIP}; display: flex; align-items: center; justify-content: center; gap: 10px")}">'
          + b.tb('입찰 필수 인증 [5]개 중', f'font-size: 13px; font-weight: 700; color: {BODY}; white-space: nowrap')
          + b.tb('삼성 [5]', f'font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap')
          + b.tb('경쟁사 A [0] · B [0]', f'font-size: 14px; font-weight: 800; color: {MUTED}; white-space: nowrap') + '</div>')
    s += footer(b, DEAL['MF'] + ' · 인증 · 수상 이름과 연도는 자리표시 · 막대 길이는 예시 · 경쟁사 익명 · ' + src('MF') + ' · 제품 컷', 12)
    return s


# ---------------------------------------------------------------- M · 생활 속 브랜드 (주거)
@layout(L, f='L_PH_CP_M', code='PH-CP-M', p='competition', p2='value', name='생활 속 브랜드 · 집 안 사진 콜라주',
        when='입주민이 이미 쓰는 삼성 휴대폰 · 가전을 집 안 사진으로 보여주고, 앱 하나로 집과 단지가 이어지는 점을 경쟁 단지와 견줄 때',
        pv=[], sample=CUST['RS'], grp='경쟁 · 브랜드 경쟁력')
def _(b):
    s = header(b, EB_WHY, '입주민 손에 이미 있는 브랜드 — 따로 배울 것이 없습니다', 'R 건설 아파트 분양 · 입주민이 쓰는 기기와 단지 앱 · 출처: [입주민 조사, 연도]', w=1152)
    tiles = [('ph.rs-kitchen-island', 64, 152, 336, 240, '50% 50%', '주방 · 빌트인 가전'),
             ('ph.rs-living', 412, 152, 336, 240, '40% 50%', '거실 · TV · 시스템에어컨'),
             ('fill.living_st', 64, 404, 428, 244, '30% 50%', '휴대폰 한 화면으로 가전 제어'),
             ('fill.smarthome_tv', 504, 404, 244, 244, '45% 40%', '주방 TV · 스마트홈 화면')]
    for pid, x, y, w, h, pos, lab in tiles:
        s += photo(b, pid, x, y, w, h, pos=pos, hint=f'{lab} (분양 단지 세대 사진으로 교체)')
        s += tag_on(b, lab, x + 10, y + h - 38)
    # number card
    s += card(b.tb('입주민이 이미 쓰는 삼성', f'font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap; line-height: 18px')
              + '<span style="display: flex; align-items: baseline; gap: 12px">' + bignum(b, '[00]', '%', size=52)
              + b.tb('삼성 스마트폰 · 가전을 씁니다', f'font-size: 15px; font-weight: 800; color: {INK}; white-space: nowrap') + '</span>'
              + b.tb('R 건설 기존 단지 입주민 기준 · 둘 중 하나 이상', f'font-size: 12px; color: {BODY}; white-space: nowrap; line-height: 18px')
              + '<span style="margin-top: auto"></span>' + evid(b, '출처 · [입주민 조사, 연도]'),
              772, 152, 444, 160, bg=CHIP, pad='14px 18px', gap=8)
    # ours vs rival complex
    def app(text, bg, x, y, w=96):
        return b.tb(text, ab(x, y, w, 52, f'box-sizing: border-box; border-radius: 14px; background: {bg}; color: #ffffff; font-size: 13px; font-weight: 800; display: flex; align-items: center; justify-content: center; white-space: nowrap'), 'div')
    s += box(772, 326, 216, 270, bg=SOFT, radius=12, extra=f'border: 1.5px solid {BLUE}')
    s += txt(b, '삼성 연결 단지', 788, 340, 180, size=13, color=BLUE, weight=800)
    s += app('앱 1개', BLUE, 788, 368, 184)
    s += (f'<div style="{ab(788, 432, 184, 100, "display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start")}">'
          + ''.join(chip(b, t) for t in ['세대 가전', '조명 · 난방', '월패드', '주차 · 엘리베이터', '공용 시설 예약']) + '</div>')
    s += rect(788, 520, 184, 1, '#c9d2f2')
    s += f'<div style="{ab(788, 528, 184, 34)}">' + bignum(b, '1', '개 앱', size=30) + '</div>'
    s += b.tb('로그인 1번 · 쓰던 앱 그대로', ab(788, 566, 184, 18, f'font-size: 12px; font-weight: 800; color: {BLUE}; white-space: nowrap; line-height: 18px'), 'div')
    s += box(1000, 326, 216, 270, bg=SOFT, radius=12)
    s += txt(b, '경쟁사 단지', 1016, 340, 180, size=13, color=MUTED, weight=800)
    s += app('가전 앱', GREY_A, 1016, 368, 88) + app('단지 앱', GREY_B, 1112, 368, 88)
    s += (f'<div style="{ab(1016, 432, 184, 100, "display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start")}">'
          + ''.join(chip(b, t, color=BODY, bg='#e6e8ec') for t in ['세대 가전', '월패드', '주차 · 공용부']) + '</div>')
    s += rect(1016, 520, 184, 1, LINE)
    s += f'<div style="{ab(1016, 528, 184, 34)}">' + bignum(b, '[2]', '개 앱', size=30, color=MUTED) + '</div>'
    s += b.tb('따로 로그인 · 새로 배워야 함', ab(1016, 566, 184, 18, f'font-size: 12px; font-weight: 800; color: {INK}; white-space: nowrap; line-height: 18px'), 'div')
    s += (f'<div style="{ab(772, 608, 444, 40, f"box-sizing: border-box; border-radius: 10px; background: {BLUE}; display: flex; align-items: center; justify-content: center")}">'
          + b.tb('분양 상담 한 줄 → ‘지금 쓰는 앱으로 집이 열립니다’', 'font-size: 13.5px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</div>')
    s += footer(b, DEAL['RS'] + ' · 앱 수는 예시 · 경쟁사 익명 · ' + src('RS'), 11)
    return s


# ---------------------------------------------------------------- N · 생태계 · 한 계정에 연결되는 제품
@layout(L, f='L_PH_CP_N', code='PH-CP-N', p='competition', p2='solution', name='생태계 · 관제 화면 + 둘레 제품 컷',
        when='화면 · 공조 · 단말 등 여러 삼성 제품이 한 플랫폼 계정에 연결되는 점을 관제 화면과 제품 컷으로 보이고, 경쟁사 연결 제품군 수와 견줄 때',
        pv=[], sample=CUST['OF'], grp='경쟁 · 브랜드 경쟁력')
def _(b):
    s = header(b, EB_WHY, '화면 · 공조 · 단말이 한 계정에서 함께 움직입니다', 'C 빌딩 스마트 오피스 · SmartThings Pro · b.IoT에 연결되는 삼성 제품군 · 출처: [제조사 연동 목록, 연도]', w=1152)
    LINEC = '#9fb0e6'
    prods = [('cut.qm55c', '로비 · 안내', '스마트 사이니지'), ('cut.wf4way', '사무 공간', '무풍 4Way 에어컨'), ('cut.tabs11', '회의실 예약', '갤럭시 탭'),
             ('cut.purifier', '라운지', '공기청정기'), ('cut.wa75d', '회의실', '전자칠판'), ('cut.km24c', '방문자 등록', '키오스크')]
    for k, (pid, cat, nm) in enumerate(prods):
        x = 64 + (k % 3) * 272; y = 152 if k < 3 else 536
        s += box(x, y, 248, 112, bg=SOFT)
        s += (f'<div style="{ab(x + 14, y + 14, 104, 84, "display: flex; flex-direction: column; gap: 1px")}">'
              + b.tb(cat, f'font-size: 11px; font-weight: 700; color: {MUTED}; white-space: nowrap; line-height: 16px')
              + b.tb(nm, f'font-size: 14px; font-weight: 800; line-height: 20px; color: {INK}; {clamp(2)}')
              + '<span style="margin-top: auto"></span>' + chip(b, '● 연결', size=11, h=20) + '</div>')
        s += cut(b, pid, x + 116, y, 132, 112, hint=f'{nm} 제품 컷', pad=10, bg='transparent')
    # bus lines (div)
    for yb, ys, ye in [(282, 264, 282), (518, 518, 536)]:
        s += rect(188, yb - 1, 544, 2, LINEC)
        for cx in (188, 460, 732):
            s += rect(cx - 1, ys, 2, ye - ys, LINEC)
    s += rect(459, 282, 2, 18, LINEC) + rect(459, 500, 2, 18, LINEC)
    # hub screens
    s += photo(b, 'fill.stp_kv', 64, 300, 450, 200, pos='50% 50%', hint='SmartThings Pro 대시보드 화면')
    s += tag_on(b, '한 계정 · SmartThings Pro', 76, 312)
    s += photo(b, 'fill.biot_dash', 530, 300, 326, 200, pos='0% 0%', hint='b.IoT 통합 모니터링 화면')
    s += tag_on(b, 'b.IoT · 공조 관제', 542, 456)
    # right — comparison
    s += txt(b, '한 플랫폼에 연결되는 자사 제품군 수', 880, 152, 336, size=14, color=INK, weight=800)
    for j, (who, c, fr, val, vc) in enumerate([('삼성', BLUE, 1.0, '[00]종', BLUE), ('경쟁사 A', GREY_A, 0.36, '[0]종', BODY), ('경쟁사 B', GREY_B, 0.22, '[0]종', BODY)]):
        y = 190 + j * 30
        s += txt(b, who, 880, y - 3, 66, size=12, color=vc, weight=800)
        s += hbar(b, 950, y, 200, fr, c, val, vcol=vc, h=14, vw=56, size=13)
    # mark table
    TY = 292
    s += box(880, TY, 336, 244, bg=SOFT)
    for n, xx in [('삼성', 1060), ('A', 1112), ('B', 1164)]:
        s += b.tb(n, ab(xx - 4, TY + 12, 52, 18, f'font-size: 12px; font-weight: 800; color: {BLUE if n == "삼성" else MUTED}; text-align: center; white-space: nowrap; line-height: 18px'), 'div')
    rows = [('화면', '사이니지 · 칠판', '●', '●', '○'), ('공조', '에어컨 · 청정기', '●', '○', '●'), ('단말', '태블릿 · 휴대폰', '●', '◐', '○'),
            ('출입 · 키오스크', '방문자 · 예약', '●', '○', '○'), ('에너지 관리', '층별 · 기기별', '●', '◐', '◐')]
    for r, (nm, sub, m0, m1, m2) in enumerate(rows):
        y = TY + 36 + r * 36
        s += rect(896, y - 4, 304, 1, LINE)
        s += (f'<div style="{ab(896, y, 156, 34, "display: flex; flex-direction: column; gap: 0")}">'
              + b.tb(nm, f'font-size: 13px; font-weight: 800; color: {INK}; white-space: nowrap; line-height: 18px')
              + b.tb(sub, f'font-size: 11px; color: {MUTED}; white-space: nowrap; line-height: 16px') + '</div>')
        for m, xx, hi in [(m0, 1056, True), (m1, 1108, False), (m2, 1160, False)]:
            s += mark(b, m, xx, y, 44, 34, hi=hi, size=18)
    s += legend_marks(b, 896, TY + 244 - 24)
    s += card(b.tb('결론', f'font-size: 11.5px; font-weight: 800; color: {LB}; white-space: nowrap')
              + b.tb('계정 하나 · 화면 하나로 관리 — 제품을 늘려도 운영 인력은 그대로', f'font-size: 15px; font-weight: 800; line-height: 21px; color: #ffffff; {clamp(2)}'),
              880, 552, 336, 96, bg=BLUE, pad='14px 18px', gap=4)
    s += footer(b, DEAL['OF'] + ' · 연결 제품군 수 · 표기는 예시 · 경쟁사 익명 · ' + src('OF') + ' · 제품 컷 · UI 화면', 13)
    return s


# ---------------------------------------------------------------- O · 동종 업종 레퍼런스 사진 월 + 건수 비교
@layout(L, f='L_PH_CP_O', code='PH-CP-O', p='competition', p2='case', name='동종 업종 레퍼런스 · 사진 월 + 건수',
        when='같은 업종에서 이미 구축한 사례를 사진 여섯 장으로 보이고, 업종 구축 건수 · 대형 일괄 구축 건수를 경쟁사와 견줄 때',
        pv=['L_CL_C'], sample=CUST['FB'], grp='경쟁 · 사례 경쟁력')
def _(b):
    s = header(b, EB_CP, '외식 · 카페 업종 구축 사례, 삼성이 가장 많습니다', 'A 커피 프랜차이즈 · 외식 업종 메뉴보드 · 매장 디지털 구축 사례 수 비교 · 출처: [제조사 · 업계 자료, 연도]', w=1152)
    wall = [('ph.fb-cafe-counter', '50% 40%', '커피 프랜차이즈 [ ]', '[000]개 매장 · 메뉴보드'),
            ('r4.fb-dt-lane', '55% 50%', '버거 프랜차이즈 [ ]', 'DT [00]개점 · 옥외 메뉴'),
            ('r4.fb-noodle-hall', '50% 50%', '한식 브랜드 [ ]', '[00]개 매장 · 홀 사이니지'),
            ('r4.fb-bakery-hall', '40% 50%', '베이커리 카페 [ ]', '[00]개 매장 · 공조 · 메뉴'),
            ('r4.fb-table-order', '50% 50%', '고깃집 브랜드 [ ]', '테이블 태블릿 [000]대'),
            ('r4.fb-pickup', '50% 40%', '커피 프랜차이즈 [ ]', '[00]개 매장 · 천장 공조')]
    for k, (pid, pos, top, main) in enumerate(wall):
        x = 64 + (k % 3) * 236; y = 152 + (k // 3) * 254
        s += photo(b, pid, x, y, 224, 242, pos=pos, hint=f'외식 업종 도입사례 사진 · {top}')
        s += label_on(b, top, main, x + 10, y + 242 - 10 - 55, 204, lines=1)
    # right — vertical bars
    s += txt(b, '외식 업종 구축 사례 수', 784, 152, 432, size=14, color=INK, weight=800)
    s += txt(b, '[0000]–[0000]년 · 10개 매장 이상 구축 · 건', 784, 174, 432, size=12, color=MUTED, weight=500)
    BASE, MAXH = 418, 180
    s += rect(784, BASE, 432, 1, LINE)
    for j, (who, c, fr, val, vc) in enumerate([('삼성', BLUE, 1.0, '[00]건', BLUE), ('경쟁사 A', GREY_A, 0.42, '[0]건', BODY), ('경쟁사 B', GREY_B, 0.28, '[0]건', BODY)]):
        cx = 856 + j * 144; h = round(MAXH * fr)
        s += rect(cx - 36, BASE - h, 72, h, c, 4, 'border-radius: 6px 6px 0 0')
        s += b.tb(val, ab(cx - 60, BASE - h - 30, 120, 26, f'{NUM}; font-size: {22 if j == 0 else 17}px; font-weight: 800; color: {vc}; text-align: center; white-space: nowrap; line-height: 26px'), 'div')
        s += b.tb(who, ab(cx - 60, BASE + 8, 120, 18, f'font-size: 12.5px; font-weight: 800; color: {vc}; text-align: center; white-space: nowrap; line-height: 18px'), 'div')
    for k, (lab, val, unit, sub) in enumerate([('300개 매장 이상 일괄 구축', '[0]', '건', 'A 커피 규모와 같은 급'), ('평균 운영 기간', '[0]', '년', '구축 후 계속 운영 중')]):
        x = 784 + k * 222
        s += card(b.tb(lab, f'font-size: 12px; font-weight: 800; color: {BODY}; white-space: nowrap; line-height: 18px')
                  + bignum(b, val, unit, size=40)
                  + b.tb(sub, f'margin-top: auto; font-size: 11.5px; color: {MUTED}; white-space: nowrap; line-height: 16px'),
                  x, 460, 210, 120, bg=CHIP, pad='12px 16px', gap=4)
    s += (f'<div style="{ab(784, 594, 432, 54, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 16px; display: flex; align-items: center")}">'
          + b.tb('같은 업종 · 같은 규모를 운영해 본 곳 → A 커피 전환 위험이 가장 낮습니다', f'font-size: 13.5px; font-weight: 800; line-height: 20px; color: {INK}; {clamp(2)}') + '</div>')
    s += footer(b, DEAL['FB'] + ' · 사례 이름 · 매장 수는 자리표시 · 막대 길이는 예시 · 경쟁사 익명 · ' + src('FB'), 12)
    return s


# ---------------------------------------------------------------- Q · 경쟁사 → 삼성 전환 사례 · 전 / 후
@layout(L, f='L_PH_CP_Q', code='PH-CP-Q', p='competition', p2='case', name='전환 사례 · 전환 전 / 후 사진',
        when='경쟁사 제품을 쓰던 동종 고객이 삼성으로 바꾼 이유 세 가지와 바꾼 뒤의 성과를 전 · 후 사진과 함께 보여줄 때',
        pv=[], sample=CUST['FN'], grp='경쟁 · 사례 경쟁력')
def _(b):
    s = header(b, EB_CP, '경쟁사 제품을 쓰던 [ ] 은행이 삼성으로 바꾼 이유', 'T 은행과 같은 영업점 규모 · [ ] 은행 영업점 [000]곳 사이니지 · 단말 교체 사례 · 출처: [고객 운영 데이터, 연도]', w=1152)
    s += photo(b, 'ph.fn-branch-gray', 64, 152, 404, 340, pos='50% 50%', hint='전환 전 영업점 사진 (경쟁사 제품 설치 시점)')
    s += tag_on(b, '전환 전 · 경쟁사 [ ] 사이니지', 76, 164)
    s += label_on(b, '[0000]년까지', '화면 꺼짐이 잦고 공지 교체는 지점마다 [0]일', 76, 424, 380, lines=1)
    s += photo(b, 'ph.fn-branch', 812, 152, 404, 340, pos='50% 50%', hint='전환 후 영업점 사진 (삼성 사이니지 · 태블릿)')
    s += tag_on(b, '전환 후 · 삼성 사이니지 · 태블릿', 824, 164, dark=False)
    s += label_on(b, '[0000]년 전환', '영업점 [000]곳을 본사 한 화면에서 운영', 824, 424, 380, lines=1)
    # centre — reasons
    s += (f'<div style="{ab(484, 152, 312, 22, "display: flex; align-items: center; justify-content: center; gap: 8px")}">'
          + b.tb('전환 전', f'font-size: 13px; font-weight: 800; color: {MUTED}; white-space: nowrap')
          + b.tb('→', f'font-size: 16px; font-weight: 800; color: {BLUE}')
          + b.tb('전환 후', f'font-size: 13px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</div>')
    s += txt(b, '바꾼 이유 3', 484, 186, 200, size=15, color=INK, weight=800)
    reasons = [('장애가 잦았습니다', '영업 중 화면 꺼짐 월 [00]건 · 수리 대기 [0]일'),
               ('공지 교체에 며칠', '금리 · 상품 공지를 지점마다 USB로 교체'),
               ('기기마다 관리 업체가 따로', '사이니지 · 태블릿 · 키오스크 업체 [3]곳'),]
    for k, (t, d) in enumerate(reasons):
        y = 214 + k * 94
        s += (f'<div style="{ab(484, y, 312, 86, f"box-sizing: border-box; border-radius: 12px; background: {SOFT}; padding: 11px 14px; display: flex; gap: 10px")}">'
              + numtag(b, str(k + 1), size=24)
              + '<span style="display: flex; flex-direction: column; gap: 2px; min-width: 0">'
              + b.tb(t, f'font-size: 15px; font-weight: 800; line-height: 22px; color: {INK}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(d, f'font-size: 12.5px; line-height: 18px; color: {BODY}; {clamp(2)}') + '</span></div>')
    # KPI strip
    kpis = [('장애 건수', '−[00]', '%', '월 [00]건 → [0]건 · 전환 후 [12]개월'),
            ('콘텐츠 반영', '[0]일 → [0]', '시간', '본사에서 [000]곳 동시 반영'),
            ('운영 인력', '−[0]', '명', '[0]명 → [0]명 · 본사 IT 기준')]
    for k, (lab, val, unit, sub) in enumerate(kpis):
        x = 64 + k * 392
        s += card(b.tb(lab, f'font-size: 13px; font-weight: 800; color: {BODY}; white-space: nowrap; line-height: 20px')
                  + bignum(b, val, unit, size=40)
                  + b.tb(sub, f'margin-top: auto; font-size: 12px; color: {MUTED}; white-space: nowrap; line-height: 18px'),
                  x, 512, 368, 136, bg=CHIP, pad='14px 20px', gap=4)
    s += footer(b, DEAL['FN'] + ' · 사례 은행 이름 · 수치는 자리표시 · 경쟁사 익명 · 전환 전 사진은 흑백 처리한 자리 표시 · ' + src('FN'), 13)
    return s


# ---------------------------------------------------------------- R · 조건 일치 사례
@layout(L, f='L_PH_CP_R', code='PH-CP-R', p='competition', p2='case', name='조건 일치 사례 · 사례 사진 카드 3',
        when='고객의 규모 · 업종 · 과제 조건과 맞는 삼성 사례를 사진 카드로 골라 보이고, 같은 조건 사례 수를 경쟁사와 견줄 때',
        pv=[], sample=CUST['FB'], grp='경쟁 · 사례 경쟁력')
def _(b):
    s = header(b, EB_CP, 'A 커피와 조건이 같은 사례, 삼성에는 [0]건 있습니다', 'A 커피 프랜차이즈 · 규모 · 업종 · 과제가 같은 구축 사례 · 사례 이름은 자리표시 · 출처: [제조사 구축 이력, 연도]', w=1152)
    # condition band
    conds = [('규모', '320개 매장'), ('업종', '드라이브스루 [00]개점'), ('과제', '본사 일괄 운영')]
    s += (f'<div style="{ab(64, 152, 896, 56, f"box-sizing: border-box; border-radius: 12px; background: {CHIP}; padding: 0 16px; display: flex; align-items: center; gap: 10px")}">'
          + b.tb('A 커피 조건', f'font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap; margin-right: 6px')
          + ''.join(f'<span style="height: 34px; box-sizing: border-box; padding: 0 12px; border-radius: 999px; background: #ffffff; display: inline-flex; align-items: center; gap: 8px">'
                    + b.tb(k, f'font-size: 11.5px; font-weight: 800; color: {MUTED}; white-space: nowrap')
                    + b.tb(v, f'font-size: 14px; font-weight: 800; color: {INK}; white-space: nowrap') + '</span>' for k, v in conds)
          + '<span style="margin-left: auto"></span>'
          + b.tb('● 일치 · ◐ 일부 · ○ 다름', f'font-size: 11.5px; color: {MUTED}; white-space: nowrap') + '</div>')
    cases = [('ph.fb-dt-order', '70% 45%', '커피 프랜차이즈 [ ]', '[350]개 매장 · DT [00]개점 · [0000]년', ('●', '●', '●'), '3/3',
              [('메뉴 교체 시간', '[0]분'), ('DT 대기', '−[00]초')]),
             ('r4.fb-burger-counter', '60% 50%', '버거 프랜차이즈 [ ]', '[400]개 매장 · DT [00]개점 · [0000]년', ('●', '●', '◐'), '2.5/3',
              [('장애 건수', '−[00]%'), ('객단가', '+[0]%')]),
             ('r4.fb-bakery-menu', '50% 40%', '베이커리 카페 [ ]', '[280]개 매장 · 본사 직영 · [0000]년', ('●', '◐', '●'), '2.5/3',
              [('콘텐츠 반영', '[0]시간'), ('운영 인력', '−[0]명')])]
    for k, (pid, pos, nm, sub, ms, sc, kp) in enumerate(cases):
        x = 64 + k * 304
        s += box(x, 224, 288, 424, bg=SOFT)
        s += photo(b, pid, x, 224, 288, 240, pos=pos, hint='삼성 외식 업종 도입사례 사진')
        s += tag_on(b, f'사례 {k + 1} · 조건 일치 {sc}', x + 10, 234)
        s += txt(b, nm, x + 14, 476, 260, size=15, color=INK, weight=800)
        s += txt(b, sub, x + 14, 500, 260, size=12, color=MUTED, weight=500)
        s += (f'<div style="{ab(x + 14, 526, 260, 24, "display: flex; gap: 14px")}">'
              + ''.join(f'<span style="display: inline-flex; align-items: center; gap: 4px">'
                        + b.tb(m, f'font-size: 16px; color: {BLUE if m == "●" else "#7c8597"}; line-height: 24px')
                        + b.tb(lab, f'font-size: 12px; font-weight: 700; color: {BODY}; white-space: nowrap; line-height: 24px') + '</span>'
                        for m, lab in zip(ms, ['규모', '업종', '과제'])) + '</div>')
        s += (f'<div style="{ab(x + 14, 564, 260, None, "display: flex; gap: 10px")}">'
              + ''.join(kpi(b, l, v, w=125) for l, v in kp) + '</div>')
    # narrow column
    s += photo(b, 'ph.fb-pickup', 984, 152, 232, 150, pos='50% 30%', hint='제안 대상 매장 유형 사진 (A 커피 매장으로 교체)')
    s += tag_on(b, 'A 커피 매장 유형', 994, 162)
    s += box(984, 318, 232, 330, bg=SOFT)
    s += txt(b, '같은 조건 사례 수', 1000, 332, 200, size=14, color=INK, weight=800)
    s += txt(b, '세 조건 모두 일치 · 건', 1000, 354, 200, size=11.5, color=MUTED, weight=500)
    BASE, MAXH = 604, 170
    s += rect(1000, BASE, 200, 1, LINE)
    for j, (who, c, fr, val, vc) in enumerate([('삼성', BLUE, 1.0, '[0]건', BLUE), ('경쟁사 A', GREY_A, 0.35, '[0]건', BODY), ('경쟁사 B', GREY_B, 0.2, '[0]건', BODY)]):
        cx = 1034 + j * 66; h = round(MAXH * fr)
        s += rect(cx - 20, BASE - h, 40, h, c, 0, 'border-radius: 5px 5px 0 0')
        s += b.tb(val, ab(cx - 33, BASE - h - 24, 66, 20, f'{NUM}; font-size: {16 if j == 0 else 13}px; font-weight: 800; color: {vc}; text-align: center; white-space: nowrap; line-height: 20px'), 'div')
        s += b.tb(who, ab(cx - 33, BASE + 8, 66, 18, f'font-size: 11.5px; font-weight: 800; color: {vc}; text-align: center; white-space: nowrap; line-height: 18px'), 'div')
    s += footer(b, DEAL['FB'] + ' · 사례 이름 · 수치는 자리표시 · 막대 길이는 예시 · 경쟁사 익명 · ' + src('FB'), 13)
    return s


# ---------------------------------------------------------------- S · 도입 성과 · 업계 평균 대비
@layout(L, f='L_PH_CP_S', code='PH-CP-S', p='competition', p2='effect', name='도입 성과 · 사례 사진 3열 + 업계 평균 막대',
        when='삼성을 도입한 동종 사례 세 곳의 성과를 업계 평균과 막대로 나란히 놓아, 같은 투자에서 얼마나 더 얻는지 보여줄 때',
        pv=[], sample=CUST['HT'], grp='경쟁 · 사례 경쟁력')
def _(b):
    s = header(b, EB_CP, '삼성을 도입한 호텔의 성과는 업계 평균의 [0]배입니다', 'B 비즈니스 호텔 · 객실 · 로비 · 삼성 도입 호텔 3곳 vs 업계 평균 · 출처: [호텔 운영 데이터 · 업계 조사, 연도]', w=1152)
    cases = [('ph.ht-room-sofa', '50% 30%', '사례 1 · 객실 TV · LYNK Cloud', '[ ] 호텔 · 객실 [000]실',
              [('객실 TV 장애', '−[00]%', 0.88, '−[00]%', 0.34), ('객실 만족도', '+[0]점', 0.8, '+[0]점', 0.3)]),
             ('fill.ht_room_ac', '50% 45%', '사례 2 · 시스템에어컨 · b.IoT', '[ ] 호텔 · 객실 [000]실',
              [('에너지 사용', '−[00]%', 0.84, '−[0]%', 0.28), ('공조 민원', '−[00]%', 0.76, '−[00]%', 0.36)]),
             ('fill.ht_lobby_led', '62% 50%', '사례 3 · 로비 LED · 사이니지', '[ ] 호텔 · 객실 [000]실',
              [('체크인 대기', '−[00]%', 0.7, '−[0]%', 0.26), ('부대시설 매출', '+[00]%', 0.82, '+[0]%', 0.3)])]
    W = 368
    for i, (pid, pos, tag, nm, kp) in enumerate(cases):
        x = 64 + i * (W + 24)
        s += photo(b, pid, x, 152, W, 220, pos=pos, hint='삼성 도입 호텔 사례 사진')
        s += tag_on(b, tag, x + 10, 162)
        s += txt(b, nm, x, 384, 240, size=15, color=INK, weight=800)
        s += b.tb('[0000]년 도입', ab(x + W - 110, 386, 110, 18, f'font-size: 11.5px; font-weight: 700; color: {MUTED}; text-align: right; white-space: nowrap; line-height: 18px'), 'div')
        s += rect(x, 414, W, 1, LINE)
        for k, (lab, va, fa, vb, fb) in enumerate(kp):
            y = 426 + k * 90
            s += txt(b, lab, x, y, 200, size=13, color=INK, weight=800)
            for j, (who, c, fr, v, vc) in enumerate([('삼성 도입', BLUE, fa, va, BLUE), ('업계 평균', '#c3c8d1', fb, vb, MUTED)]):
                ry = y + 28 + j * 24
                s += b.tb(who, ab(x, ry - 3, 62, 18, f'font-size: 11px; font-weight: 800; color: {vc}; white-space: nowrap; line-height: 18px'), 'div')
                s += hbar(b, x + 66, ry, 220, fr, c, v, vcol=vc, h=12, vw=70, size=13)
    s += (f'<div style="{ab(64, 612, 1152, 36, f"box-sizing: border-box; border-radius: 10px; background: {CHIP}; display: flex; align-items: center; justify-content: center; gap: 14px")}">'
          + b.tb('세 호텔 평균 · 업계 평균 대비', f'font-size: 13px; font-weight: 700; color: {BODY}; white-space: nowrap')
          + b.tb('장애 감소 [0]배', f'font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap')
          + b.tb('에너지 절감 [0]배', f'font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap')
          + b.tb('만족도 상승 [0]배', f'font-size: 14px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</div>')
    s += footer(b, DEAL['HT'] + ' · 사례 이름 · 수치는 자리표시 · 막대 길이는 예시 · 업계 평균은 [조사 기관] 기준 · ' + src('HT'), 14)
    return s
