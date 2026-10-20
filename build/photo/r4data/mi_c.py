# 업종별 '고객 여정'(L_MI_xx_C) 사진 버전 데이터 — 원본 장표의 세그먼트 · 단계 · 고민 · 삼성 개입을 그대로 옮기고 줄임
# segs_photo: (손님 · 매장 사진 pid, 위치)
# segs: [(손님 유형, 비중, 그 유형이 바라는 것) × 3]   common: 모든 유형 공통 한 줄
# stages: [(단계, 공간, 사진 pid, 사진 위치, 손님 고민, 직원 · 운영 고민, 삼성 제품, 하는 일, 솔루션, 지금 0–4, 삼성 적용 후 0–4, 결정적 순간?) × 5]
D = {
 'FB': dict(
   segs_title='A 커피의 손님', segs_photo=('ph.fb-cafe-counter', '50% 60%'), segs_note='방문 비중 · 비율은 예시 · POS 데이터로 반영',
   segs=[('테이크아웃 · 출근길', '[00]%', '출근 · 점심 피크, 줄 서지 않고 빨리 주문하고 정확히 픽업'),
         ('매장 체류', '[00]%', '오후 · 주말 공부와 미팅, 오래 앉아도 쾌적한 좌석과 공기'),
         ('드라이브스루 · 차량', '[00]%', '출퇴근 · 늦은 시간, 차 안에서 바로 읽히는 메뉴와 빠른 주문')],
   common='외국인 · 중장년 손님 — 큰 글씨 · 다국어 메뉴가 필요',
   stages=[('매장 앞 · DT 진입', '매장 전면 · 드라이브스루', 'r4.fb-dt-lane', '50% 50%', '지나가며 · 운전석에서 메뉴가 잘 안 읽힘 (햇빛 · 거리)', '배너 · 포스터 교체와 부착은 매장 몫', 'OH55C 옥외 사이니지', '3,000 nit · IP56 · 24시간 운영', 'VXT 원격 콘텐츠', 1, 3, False),
           ('메뉴 탐색', '카운터 메뉴보드', 'ph.fb-counter-menu', '50% 35%', '메뉴가 많고, 시즌 메뉴 · 품절은 주문할 때 알게 됨', '메뉴 문의 · 품절 안내를 말로 반복', 'QM55C 메뉴보드', '시간대별 메뉴 · 품절 자동 반영', 'MagicINFO 데이터 연동', 2, 4, True),
           ('주문 · 결제', '카운터 · 셀프 주문', 'fill.kiosk_touch', '50% 40%', '피크 줄이 길고, 외국인 · 중장년은 주문이 어려움', '정해진 인원으로 주문 · 결제 · 제조를 동시에', 'KM24C 키오스크 · 갤럭시 탭 POS', '다국어 셀프 주문', 'Knox Configure', 1, 3, False),
           ('대기 · 픽업', '픽업대', 'r4.fb-pickup', '50% 50%', '내 차례를 놓칠까 계속 카운터를 확인', '번호 호출 반복, 잘못 집어 간 음료 응대', 'QM43C 픽업 화면', '주문 · 웨이팅 번호를 화면으로', 'VXT · MagicINFO', 1, 3, False),
           ('좌석 · 체류', '홀 좌석 · 테라스', 'ph.fb-lounge-ac', '50% 40%', '덥거나 춥고, 찬바람이 커피 · 자리에 닿음', '온도 민원 · 냉난방 수동 조작 · 전기요금', '시스템에어컨 360', '무풍 · 균일 냉방 · PM1.0 필터', 'SmartThings Pro', 2, 4, True)]),
}

# 업종별 나눠 쓴 데이터 (r4data/p_<업종>.py 의 MI_C) 를 합친다 — 한 파일에 문제가 있으면 알리고 나머지는 계속
import glob as _glob, importlib as _il, os as _os, sys as _sys
for _p in sorted(_glob.glob(_os.path.join(_os.path.dirname(__file__), 'p_*.py'))):
    try:
        _m = _il.import_module('r4data.' + _os.path.basename(_p)[:-3])
        D.update(getattr(_m, 'MI_C', {}))
    except Exception as _e:
        print('PART ERROR', _os.path.basename(_p), type(_e).__name__, _e, file=_sys.stderr)
