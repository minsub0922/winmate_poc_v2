# 3차 — 고객사 이해: 업종별 '고객 비즈니스 · 운영 과제'(L_MI_xx_B)의 사진 중심 버전 16장 (ind 지정)
# 디자인 세 가지: stages(단계 열 · 단계마다 사진) · hero(대표 공간 + 과제 4) · band(사업 사진 띠 + 과제 카드 6)
from gen_base import *
L = []
NAMES = {'FB': '외식 · 카페', 'RT': '리테일', 'SV': '생활 편의 · 무인 매장', 'HT': '호텔 · 리조트', 'TP': '테마파크 · 관광 · 전시', 'VN': '공연장 · 경기장 · 영화관',
         'AD': '옥외 · 미디어 광고', 'OF': '오피스 · 업무 빌딩', 'RS': '주거 분양 · 주택', 'ID': '인테리어 · 가구 · 빌트인', 'ED': '교육 · 캠퍼스', 'PB': '공공 · 교통 인프라',
         'MD': '의료 · 요양 · 케어', 'MF': '제조 · 물류 · 현장', 'FN': '금융', 'OE': '파트너 전용 단말'}
EB = '01 · 고객사 이해'

# stage = (번호, 단계, 공간 · 주체, KPI 이름, KPI 값, 과제, 대응, 삼성 여부, 사진, 위치)
D = {
 'RT': dict(design='stages', sample='D 리테일', sols=['magicinfo', 'hvac'],
   hl='D 리테일의 매출은 고객 접점에서, 비용은 운영에서 갈립니다',
   sub='본사 기획부터 매장 운영까지 여섯 단계 — 단계별 지표, 막히는 과제, 삼성이 풀 수 있는 지점 · 사진은 단계가 일어나는 공간',
   money='매출 = 유동인구 × 입점률 × 체험 · 전환율 × 객단가 × 재방문 · 운영비 = 인쇄 · 전력 · AS',
   stages=[('01', '기획', '본사 상품 · VMD', '프로모션 실행률', '[00]%', '프로모션 실행이 매장마다 제각각', 'MagicINFO 원격 배포', True, 'ph.rt-staff-tablet', '50% 40%'),
           ('02', '구축 · 리뉴얼', '설계 · 시공 · 오픈', '오픈 소요', '[00]주', '설비가 인테리어를 해칩니다', '베젤리스 · 맞춤 디자인', True, 'ph.rt-showroom-led', '50% 50%'),
           ('03', '유입', '파사드 · 쇼윈도', '입점률', '[00]%', '창측 · 외벽 화면이 햇빛에 묻힘', '고휘도 · 옥외 사이니지', True, 'ph.rt-fashion-store', '50% 40%'),
           ('04', '체류 · 체험', '브랜드존 · VMD', '평균 체류', '[00]분', '면적 한계로 전 라인업 전시 불가', '비디오월 · 인터랙티브', True, 'ph.rt-car-wall', '50% 50%'),
           ('05', '구매 · 재방문', '상담 · 카운터 · 라운지', '구매 전환율', '[00]%', '긴 상담 · 대기에 쾌적함이 떨어짐', '시스템에어컨 360', True, 'ph.rt-shoppers', '50% 40%'),
           ('06', '운영 · 확산', '본사 · 체인 [000]개', '화면 가동률', '[00]%', '장애를 매장이 먼저 알아채기 어려움', '케어 · 유지관리', True, 'ph.of-control-room', '50% 50%')],
   foot='D 리테일 체인 · 플래그십 매장 제안 · 지표 값은 예시 · 사진: samsung.com 리테일 · 오피스 도입사례'),
 'HT': dict(design='stages', sample='B 호텔', sols=['magicinfo', 'lynk', 'hvac'],
   hl='B 호텔의 매출과 운영 과제는 모두 객실을 중심으로 돕니다',
   sub='판매부터 재방문까지 다섯 단계 — 단계별 KPI와 막히는 과제, 삼성이 대응할 수 있는 지점 · 사진은 단계가 일어나는 공간',
   money='객실 매출 [00]% · F&B · 연회 · 부대 [00]% · RevPAR [000,000]원 · 채널 수수료 · 인건비 상승으로 GOP 압박',
   stages=[('01', '판매 · 예약', 'OTA · 직판 · 기업 계약', 'OCC', '[00]%', 'OTA · 가격 경쟁 속 고를 이유가 약함', 'B 호텔 과제 · 객실 경험으로 간접 기여', False, 'ph.ht-entrance', '50% 50%'),
           ('02', '도착 · 체크인', '로비 · 프런트', '체크인 대기', '[0]분', '시설 위치 반복 문의 · 외국어 응대', '사이니지 · MagicINFO', True, 'ph.ht-lobby-art', '60% 50%'),
           ('03', '객실 투숙', '객실 · 숙면 · 업무', 'ADR', '[000,000]원', '객실마다 다른 냉난방 취향 · 바람 클레임', '시스템에어컨 · 무풍', True, 'ph.ht-room-sofa', '50% 40%'),
           ('04', '식음 · 연회', '레스토랑 · 연회장', '연회장 가동률', '[00]%', '연회 일정 · 프로모션 안내가 늦음', '사이니지 · 일정 예약 표출', True, 'ph.ht-ballroom', '50% 50%'),
           ('05', '체크아웃 · 재방문', '프런트 · 리뷰 · 재예약', '재방문율', '[00]%', '투숙 경험이 다음 예약으로 안 이어짐', 'LYNK Cloud · 이용 분석', True, 'ph.ht-lobby-signage', '80% 50%')],
   foot='B 비즈니스 호텔 · 객실 · 로비 제안 · KPI 값은 B 호텔 데이터로 채움 · 사진: samsung.com 호텔 도입사례'),
 'AD': dict(design='stages', sample='Q 미디어', sols=['magicinfo'],
   hl='Q 미디어의 매출은 팔린 구좌와 멈추지 않는 송출에서 나옵니다',
   sub='매체 사업의 다섯 단계 — 단계별 KPI와 운영 과제, 삼성이 직접 대응할 수 있는 일 · 사진은 단계가 일어나는 현장',
   money='매체 이익 = 구좌 수 × 판매율 × 단가 − 임대료 · 점용료 − 구축 투자 상각 − 전력 · 유지보수',
   stages=[('01', '입지 · 인허가', '건물주 · 지자체', '인허가 기간', '[00]개월', '심의 · 민원을 넘어야 켜집니다', 'IP66 · 안전 규격 실외 LED', True, 'ph.ad-street-night', '50% 50%'),
           ('02', '매체 구축', '설계 · 시공 · 제조', '구축 기간', '[00]주', '건물이 화면의 모양을 정합니다', '모듈형 LED · 곡선 · L자 구성', True, 'ph.ad-building-led2', '50% 40%'),
           ('03', '구좌 판매', '광고주 · 대행사', '구좌 판매율', '[00]%', '‘여기서만’ 가능한 광고 상품', '고휘도 · 고주사율 · 다면 송출', True, 'ph.ad-dept-led', '50% 40%'),
           ('04', '송출 · 운영', 'Q 미디어 운영팀', '송출 가동률', '[00.0]%', '멈추면 구좌를 보상합니다', '케어 · 유지관리 서비스', True, 'ph.of-control-room', '50% 50%'),
           ('05', '노출 · 성과', '시민 · 관광객 → 광고주', '재계약률', '[00]%', '소재와 성과를 증명해야 재계약', '콘텐츠 제작 지원 · AI 업스케일링', True, 'ph.ad-building-led', '50% 40%')],
   foot='Q 옥외 미디어 · 랜드마크 LED 제안 · 수치는 예시 · 사진: samsung.com 옥외 광고 · 오피스 도입사례'),
 'ID': dict(design='stages', sample='I 키친', sols=['stpro'],
   hl='I 키친의 매출은 쇼룸에서 정해지고 시공 · 입주에서 지켜집니다',
   sub='쇼룸 방문부터 입주 후 관리까지 다섯 단계 — 단계별 KPI, 현장의 운영 과제, 삼성이 함께 풀 수 있는 지점',
   money='매출 = 가구 · 주방가구 [00]% + 시공 · 설치 [00]% + 가전 결합 [00]% — B2C 리모델링 · B2B 특판',
   stages=[('01', '집객 · 방문', '쇼룸 · 실제 집처럼 체험', '월 방문객', '[0,000]명', '가구만으로는 쇼룸이 차별화되지 않음', '빌트인 · TV · 스마트홈 연출', True, 'ph.id-gallery-wall', '50% 50%'),
           ('02', '체험 · 상담', '취향 상담 · B2B 제안', '상담 전환율', '[00]%', '컬러 · 소재 조합을 눈으로 확인하기 어려움', '비스포크 컬러 · 소재 패널', True, 'ph.id-showroom-island', '50% 55%'),
           ('03', '설계 · 견적', '가구장 + 빌트인 조합', '가전 결합률', '[00]%', '가전은 따로 사러 가야 한다', '빌트인 · 리빙가전 결합 제안', True, 'ph.id-gallery-builtin', '60% 50%'),
           ('04', '시공 · 설치', '패널 맞춤 · 전기 · 덕트', '시공 리드타임', '[00]일', '가구장 규격에 딱 맞아야 한다', '키친핏 · 맞춤 패널 규격', True, 'ph.id-gallery-fridge', '50% 40%'),
           ('05', '입주 · 사후관리', '입주 후 관리 · 재추천', '입주 만족도', '[00]점', '필터 · 공기질 관리가 번거롭다', 'SmartThings 필터 알림 · AI 쾌적', True, 'ph.rs-dark-kitchen', '50% 50%')],
   foot='I 키친 · 인테리어 브랜드 쇼룸 제안 · KPI 값은 I 키친 데이터로 반영 · 사진: samsung.com 인테리어 · 주거 도입사례'),
 'MD': dict(design='stages', sample='W 요양병원', sols=['stpro', 'hvac'],
   hl='W 요양병원의 매출은 병상에서, 비용은 24시간 병동에서 나옵니다',
   sub='병상 운영 네 단계 — 단계별 KPI와 운영 과제, 삼성 제품 · 솔루션이 함께할 수 있는 지점 · 사진은 단계가 일어나는 공간',
   money='연 매출 = 병상 수 × 가동률 × 365 × 병상 1일 수익 + 재활 · 부가 서비스 · 비용은 간호 인력 [00]% · 냉난방 [00]%',
   stages=[('01', '입원 상담 · 병실 배정', '상담실 · 원무 · 병실', '병상 가동률', '[00]%', '보호자는 병실의 공기 · 온도 · 청결을 보고 고릅니다', '무풍 · 공기청정기 · 에어모니터', True, 'ph.md-care-room', '50% 50%'),
           ('02', '치료 · 재활 · 생활', '병실 · 재활센터 · 식당', '재활 프로그램 참여율', '[00]%', '환자마다 적정 온도가 다르고 직바람은 피해야', '무풍 개별 제어 · 공간별 스케줄', True, 'ph.md-rehab-room', '50% 50%'),
           ('03', '병동 간호 · 돌봄', '간호스테이션 · 복도', '호출 응답 시간', '[00]초', '순회 점검 · 호출 · 동의서로 동선이 깁니다', '갤럭시 탭 · 재실 센서 알림', True, 'ph.md-station', '50% 50%'),
           ('04', '시설 · 에너지 · 행정', '시설팀 · 기계실 · 원무', '병상당 월 에너지', '[00]만 원', '24시간 냉난방으로 전기요금 · 피크 부담', 'DMS · SmartThings Pro', True, 'ph.md-staff-tab', '50% 40%')],
   foot='W 요양병원 · 케어 환경 제안 · [ ]는 W 요양병원 데이터로 채울 값 · 사진: samsung.com 의료 도입사례'),
 'OE': dict(design='stages', sample='U 통신사', sols=['knoxsuite'],
   hl='U 통신사 전용 단말의 수익은 개통 이후에 쌓입니다',
   sub='기획에서 전환까지 다섯 단계 — 단계별 KPI와 운영 과제, 삼성이 맡을 수 있는 지점 · 사진은 단계가 일어나는 현장',
   money='회선 1개 누적 손익 — 손익분기 개통 후 [00]개월 · 수익: 단말 [00]% · 요금제 · 부가 [00]% · 재약정 · 기변 [00]%',
   stages=[('01', '상품 기획', 'U 통신사 · 제휴사', '출시 리드타임', '[0]개월', '출시마다 런처 · 앱 · 테마를 새로 개발', 'Knox Configure 리브랜딩', True, 'ph.oe-team-tabs', '50% 50%'),
           ('02', '에디션 · 라인업', '삼성 · U 통신사', '에디션', '[0]종', '아이 손에서 버티는 단말이어야', '갤럭시 XCover · A 시리즈', True, 'cut.xcover7', '50% 50%'),
           ('03', '매장 개통', '매장 · 온라인', '개통 세팅 시간', '[00]분', '매장마다 손으로 하는 세팅 · 누락', 'Knox Configure 자동 설정', True, 'ph.rt-shoppers', '50% 40%'),
           ('04', '사용 · 서비스', '아이 · 부모 · CS', '안심 서비스 가입률', '[00]%', '보호 설정 우회 · 초기화', 'Knox 단말 보안 · 앱 통제', True, 'ph.oe-phone-user', '50% 50%'),
           ('05', '재약정 · 전환', 'U 통신사 · 가족 고객', '재약정 · 기변율', '[00]%', '학년이 오르면 맞지 않는 설정', '원격 모드 전환', True, 'ph.rt-fashion-phone', '50% 50%')],
   foot='U 통신사 · 전용 단말 제안 · 수치는 예시 · 사진: samsung.com 도입사례 · 비즈니스 페이지 · 제품 컷'),
 # ---------------- hero
 'SV': dict(design='hero', sample='N 체인', sols=['stpro'],
   hl='N 체인의 수익은 점원 없는 24시간 지점에서 만들어집니다',
   sub='본사 → 가맹점 → 손님으로 이어지는 수익 구조 — 운영 단계마다 걸리는 과제, 그중 삼성이 대응할 지점',
   space=('24시간 무인 지점', '지점 매출 = 이용 건수 × 건당 단가 + 연계 매출', '가장 비싼 순간 — 아무도 없는 시간에 멈춘 기기 · 1건당 손실 [00,000]원', 'ph.sv-cu-store', '50% 50%'),
   pains=[('02 셀프 이용', '처음 온 손님도 안내 없이 바로 이용', '지점당 일평균 이용 [000]건', '직관적 터치 UI', True, 'ph.ed-print-users', '50% 40%'),
          ('02 셀프 이용', '마감 직전 대량 작업 대기', '건당 객단가 [0,000]원', '고속 출력 · 세탁', True, 'ph.ht-laundry', '30% 50%'),
          ('04 원격 운영 · AS', '점주 없이 기기 이상 · 소모품 확인', '기기 가동률 [00]%', '원격 관리 앱 · 실시간 응대', True, 'ph.of-desk-control', '60% 75%'),
          ('05 재방문 · 확장', '오래 머물러도 쾌적한 공간', '30일 재방문율 [00]%', '시스템에어컨 360', True, 'ph.sv-studycafe', '50% 40%')],
   foot='N 무인 매장 체인 · 무인 운영 제안 · KPI 값은 N 체인 데이터로 채움 · 사진: samsung.com 도입사례'),
 'VN': dict(design='hero', sample='V 경기장', sols=['magicinfo'],
   hl='V 경기장의 매출은 경기일 다섯 단계에서 나고, 과제도 거기 있습니다',
   sub='관중이 모이고 · 머물고 · 소비하고 · 다시 오는 다섯 단계 — 그 단계에서 막히는 운영 과제와 삼성이 대응할 지점',
   space=('경기일의 경기장', '입장권 · 시즌권 [00]% · 광고 · 스폰서 [00]% · F&B · MD [00]% · 대관 [00]%', '좌석 점유율 [00]% · 1인당 지출 [00,000]원', 'ph.vn-stadium-wide', '50% 50%'),
   pains=[('02 도착 · 입장', '경기 직전 매표 · 입장 줄이 한꺼번에', '입장 대기 [00]분', '키오스크 · 게이트 안내 사이니지', True, 'ph.vn-ticket-wall', '50% 50%'),
          ('03 관람 · 경기', '외야 · 상단석까지 선명하게, 리플레이는 즉시', '관람 만족도 [0.0]점', 'LED 전광판 · 하만 프로 오디오', True, 'ph.vn-stadium-board', '50% 40%'),
          ('04 소비 · 체류', '휴식 시간에 매점 주문이 몰림', '1인당 지출 [00,000]원', '키오스크 · 메뉴보드', True, 'ph.vn-cinema-kiosk', '50% 40%'),
          ('05 재방문 · 대관', '공연 · 행사마다 달라지는 화면 · 음향', '대관 매출 [00]%', '모듈러 LED · 프로 오디오', True, 'ph.vn-auditorium', '50% 50%')],
   foot='V 스포츠 경기장 · 관람 경험 제안 · 비중은 예시 · 사진: samsung.com 경기장 · 영화관 · 공연장 도입사례'),
 'RS': dict(design='hero', sample='R 건설', sols=['smartthings'],
   hl='R 건설의 수익은 분양에서, 평판은 입주 후에 만들어집니다',
   sub='상품기획 → 분양 → 옵션 계약 → 시공 · 입주 → 거주 · AS — 단계마다 R 건설이 부딪히는 지점과 삼성 대응',
   space=('모델하우스와 입주 세대', '분양 매출 [0,000]억 원 · 옵션 매출 [00]억 원', '입주 후 평판 → 다음 분양 단지의 청약 경쟁력', 'ph.rs-kitchen-island', '50% 50%'),
   pains=[('1 상품기획 · 설계', '가구장 깊이 · 낮은 천장고에 맞춰야', '세대당 사양 원가 [000]만 원', '키친핏 · 슬림 매립형 실내기', True, 'ph.rs-kitchen-fridge', '30% 50%'),
          ('2 분양 · 모델하우스', '비슷해진 단지 사이 차별점', '청약 경쟁률 [00.0] 대 1', '빌트인 · 무풍 · 스마트홈 체험', True, 'ph.rs-living-room', '50% 50%'),
          ('4 시공 · 입주', '입주 전 설치 · 기기 연결까지', '입주 전 설치 완료 [00]%', 'SmartThings 통합 연결', True, 'ph.rs-kitchen-white', '50% 50%'),
          ('5 거주 · AS', '여름 전기요금 · 냉방 민원', '입주민 만족도 [0.0]점', '무풍 · AI 절약 모드', True, 'ph.rs-living-ac', '50% 30%')],
   foot='R 건설 · 아파트 분양 제안 · KPI 값은 예시 · 사진: samsung.com 주거 도입사례 · 비즈니스 페이지'),
 'PB': dict(design='hero', sample='S 지자체', sols=['magicinfo', 'knoxsuite'],
   hl='S 지자체의 운영 과제는 구축 이후 24시간 운영에 몰려 있습니다',
   sub='계획부터 재투자까지 다섯 단계 — 과제가 몰리는 운영 · 관제와 시민 서비스, 삼성이 함께할 수 있는 곳',
   space=('교통정보센터 · 현장', '사업 예산 [000]억 원 · 국비 매칭 [00]%', '상시 가동률 [00.0]% · 사고 인지 → 전파 [00]분', 'ph.pb-traffic-room', '50% 50%'),
   pains=[('03 운영 · 관제', '수십 대 모니터를 오가며 작은 이상을 찾음', '사고 인지 → 전파 [00]분', 'LED 단일 상황판 · 자유 분할', True, 'ph.pb-control', '50% 50%'),
          ('04 시민 서비스', '먼지 · 충격 · 직사광에 지치는 현장 장비', '시민 만족도 [00]점', '고휘도 · 러기드 설계', True, 'ph.pb-airport-hall', '50% 50%'),
          ('04 시민 서비스', '위급 순간의 골든타임 · 출동 직원 안전', '위급 대응 [00]분', '갤럭시 워치 SOS · PTT', True, 'ph.pb-ranger-watch', '50% 45%'),
          ('05 평가 · 재투자', '수천 대 장비 상태를 모르면 장애 대응이 늦음', '상시 가동률 [00.0]%', '통합 모니터링 · 상주 AS', True, 'ph.of-control-room', '50% 50%')],
   foot='S 지자체 · 공공 인프라 제안 · KPI 값은 예시 · 사진: samsung.com 공공 · 오피스 도입사례'),
 'FN': dict(design='hero', sample='T 은행', sols=['magicinfo', 'knoxsuite'],
   hl='T 은행의 수익은 창구 상담에서 나오지만, 시간은 서식이 가져갑니다',
   sub='본점 → 객장 → 창구 → 현장 영업 → 수익 — 단계별 운영 과제와 삼성이 대응할 수 있는 지점',
   space=('영업점 객장 · 창구', '이자이익 [0,000]억 원 · 수수료이익 [000]억 원', '일 평균 내점 [000]명 · 평균 대기 [00]분', 'ph.fn-branch', '50% 50%'),
   pains=[('02 영업점 객장', '번호표를 뽑고 할 일 없이 기다림', '평균 대기 [00]분', '갤럭시 탭 · 미리작성', True, 'ph.fn-tab-customer', '50% 40%'),
          ('03 창구 상담 · 가입', '종이 서식 [000]종 출력 · 서명 · 보관', '건당 처리 [00]분', '갤럭시 탭 + S펜 · 전자서식', True, 'ph.fn-counter', '50% 45%'),
          ('04 현장 · 방문 영업', '서류를 받아 다시 와야 끝나는 가입', '현장 가입 [000]건/월', '갤럭시 탭 · Knox 암호화 업무 영역', True, 'ph.fn-tab-banker', '50% 40%'),
          ('01 본점 · 본사', '지점마다 홍보물 · 현수막을 새로 걸기', '홍보물 교체 주기 [00]일', '사이니지 · MagicINFO', True, 'ph.fn-auditorium', '50% 50%')],
   foot='T 은행 · 영업점 디지털 제안 · 목표치는 T 은행 실측 후 확정 · 사진: samsung.com 금융 도입사례'),
 # ---------------- band
 'FB': dict(design='band', sample='A 커피', sols=['magicinfo', 'stpro', 'knoxsuite'],
   hl='A 커피의 수익은 가맹점 매출에서 나오고, 과제도 매장에 있습니다',
   sub='본사 → 가맹점 → 손님으로 이어지는 수익 구조와 핵심 지표, 그리고 운영 단계별 과제 · [ ] 지표는 A 커피 데이터로 채움',
   band=('ph.fb-cafe-counter', '50% 55%', '본사 → 가맹점 → 손님', [('본사', '가맹점 수', '[000]개'), ('가맹점', '매장 월 매출', '[0,000]만 원'), ('가맹점', '인건비 비중', '[00]%'), ('손님', '객단가', '[0,000]원'), ('손님', '재방문율', '[00]%')]),
   cards=[('① 메뉴 · 가격 반영', '신메뉴 · 가격이 매장마다 늦고 다르게 걸림', 'QM 메뉴보드 + MagicINFO 원격 배포', True, 'ph.fb-counter-menu', '50% 30%'),
          ('② 신규 · 리뉴얼 매장', '상권마다 다른 매장에 같은 브랜드 경험', '가로 · 세로 사이니지 · 단계 도입', True, 'ph.fb-cafe-signage', '50% 40%'),
          ('③ 오픈 준비 · 영업', '오픈 · 마감 · 냉난방을 매장이 일일이', 'SmartThings Pro · 무풍 시스템에어컨', True, 'ph.fb-cafe-air', '50% 50%'),
          ('④ 피크 주문 · 결제', '정해진 인원으로 피크 줄을 받아야 함', '갤럭시 탭 POS · KM24C · Knox', True, 'ph.fb-pos-pay', '50% 40%'),
          ('⑤ 매장 앞 · 드라이브스루', '길과 차 안에서는 메뉴가 안 보임', '옥외 사이니지 · 고휘도 · IP56', True, 'ph.fb-dt-order', '45% 50%'),
          ('⑥ 좌석 · 체류', '오래 앉는 좌석의 온도 · 직바람 · 공기', '시스템에어컨 360 · PM1.0 필터', True, 'ph.fb-lounge-ac', '55% 35%')],
   foot='A 커피 프랜차이즈 · 디지털 메뉴보드 제안 · 사진: samsung.com 외식 도입사례 · 공식 연출'),
 'TP': dict(design='band', sample='P 테마파크', sols=['magicinfo', 'stpro'],
   hl='P 테마파크의 전시는 한 번 짓고 매 시즌 다시 바꾸는 사업입니다',
   sub='방문객 1인 객단가 구조와 전시 운영 사이클 — 단계별 운영 과제와 삼성이 개입할 수 있는 지점',
   band=('ph.tp-panda-wall', '50% 45%', '1인 객단가 [00,000]원 = 입장권 + 체험 + F&B + 굿즈', [('입장권 · 연간회원', '비중', '[00]%'), ('유료 체험', '비중', '[00]%'), ('F&B · 카페', '비중', '[00]%'), ('연간 입장객', '', '[000]만 명'), ('평균 체류', '', '[0.0]시간')]),
   cards=[('콘텐츠', '원작 색감 · 디테일을 대형 화면에 그대로', '콘텐츠 제작 · 전용 에디션', True, 'ph.tp-panda-touch', '50% 50%'),
          ('공간 조성', '원형 · 곡면 · 좁은 벽면에도 밀착 설치', 'LED · 스페이셜 사이니지', True, 'ph.tp-panda-corridor', '50% 50%'),
          ('공간 조성', '어두운 관 · 직사광 · 비바람 속 선명함', '고휘도 LED · 실외 사이니지', True, 'ph.tp-skywall', '50% 50%'),
          ('매일 운영', '소란한 열린 공간에서 고른 음향', '하만 프로 오디오', True, 'ph.vn-auditorium', '50% 50%'),
          ('시즌 교체', '수십 대 화면을 현장 작업 없이 일괄 교체', 'MagicINFO 스케줄 · 원격 송출', True, 'ph.tp-exit-wall', '50% 50%'),
          ('유지 · 에너지', '많은 전력 · 넓은 공간의 공조', 'SmartThings · 시스템에어컨', True, 'ph.tp-preshow', '50% 50%')],
   foot='P 테마파크 · 몰입형 전시 제안 · 구성비 · KPI 값은 예시 · 사진: samsung.com 테마파크 · 공연장 도입사례'),
 'OF': dict(design='band', sample='C 빌딩', sols=['smartthings', 'biot', 'knoxsuite'],
   hl='C 빌딩의 수익은 임대에서, 경쟁력은 운영에서 결정됩니다',
   sub='소유 → 운영 → 입주사 → 이용자로 이어지는 구조와 단계별 KPI, 삼성이 해결할 수 있는 운영 과제',
   band=('ph.of-lounge-wall', '50% 50%', '임대료 + 관리비 + 부대 = C 빌딩 운영 수익', [('임대 마케팅', '임대율', '[00]%'), ('입주', '입주사 만족도', '[0.0]점'), ('입주', '재계약률', '[00]%'), ('회의 · 협업', '회의실 가동률', '[00]%'), ('시설', '연 에너지 비용', '[0,000]만 원')]),
   cards=[('1 리뉴얼 · 설비 투자', '입주사가 쓰는 중에 노후 공조를 바꿔야', 'DVM S · 존별 개별 공조', True, 'ph.of-rooftop-odu', '50% 55%'),
          ('2 임대 마케팅 · 방문', '방문객에게 건물 브랜드를 보여줄 채널이 없음', 'LED 사이니지 · MagicINFO', True, 'ph.of-lobby-info', '50% 50%'),
          ('3 입주 · 공간 서비스', '입주사별 운영 시간이 달라 냉난방 VOC가 몰림', 'SmartThings 입주사 앱 · 360', True, 'ph.of-office-ac', '50% 40%'),
          ('4 회의 · 협업', '빈 회의실과 중복 예약을 한눈에 알 수 없음', '갤럭시 탭 예약 · Knox', True, 'ph.of-door-tab', '45% 40%'),
          ('4 회의 · 협업', '자료 공유 · 화면 연결에 회의 시간이 샘', '삼성 Flip · 미러링', True, 'ph.of-desk-touch', '50% 40%'),
          ('5 시설 · 에너지', '소수 인력이 층마다 흩어진 설비를 관리', 'b.IoT · DMS 통합 관리', True, 'ph.of-dms-screen', '50% 50%')],
   foot='C 오피스 빌딩 · 스마트 오피스 제안 · KPI 값은 C 빌딩 데이터로 채움 · 사진: samsung.com 오피스 도입사례'),
 'ED': dict(design='band', sample='E 대학교', sols=['stpro', 'biot', 'hvac'],
   hl='E 대학교의 교육 환경 투자는 충원 · 평판으로 되돌아옵니다',
   sub='재원 → 교육 환경 → 수업 → 캠퍼스 서비스 → 성과 · 평판 — 단계별 지표와 운영 과제가 걸리는 지점',
   band=('ph.ed-smart-lobby', '50% 45%', '교육 환경이 좋아지면 만족 · 충원이 오르고, 재원으로 되돌아옵니다', [('재원', '교육비 환원율', '[000]%'), ('교육 환경', '예산', '[000]억 원'), ('수업', '강의 만족도', '[0.0]점'), ('캠퍼스 서비스', '출력 대기', '[00]분'), ('성과', '신입생 충원율', '[00.0]%')]),
   cards=[('1 재원 · 시설팀', '빈 강의실 냉난방 · 조명이 켜진 채 샘', 'SmartThings Pro · b.IoT 재실 제어', True, 'ph.ed-lab-night', '50% 50%'),
          ('2 교육 환경 · 시설', '공용 PC · 복합기 · 에어컨 장애를 따로 대응', '통합 모니터링 · 케어 서비스', True, 'ph.ed-ac-clean', '50% 40%'),
          ('3 수업 · 교수', '강의실마다 연결 방식이 달라 수업이 늦음', 'Flip Pro 무선 공유 · 통합 제어', True, 'ph.ed-lecture-led', '50% 40%'),
          ('3 수업 · 학생', '대형 강의실은 자리마다 온도 · 공기가 다름', '시스템에어컨 360 · 공기청정기', True, 'ph.of-hall-ac', '50% 30%'),
          ('4 캠퍼스 서비스', '쉬는 시간 출력이 몰리고 결제가 번거로움', '디지털 복합기 · 무인 과금', True, 'ph.ed-print-users', '50% 40%'),
          ('5 성과 · 평판', '‘달라진 캠퍼스’를 보여 줄 공간이 필요', 'AI 미래교실 · 도서관 사이니지', True, 'ph.ed-library-wall', '50% 50%')],
   foot='E 대학교 캠퍼스 · 스마트 교육 환경 제안 · 지표는 예시 · 사진: samsung.com 교육 · 오피스 도입사례 (1번은 야간으로 보정)'),
 'MF': dict(design='band', sample='L 제조', sols=['stpro', 'hvac', 'knoxsuite'],
   hl='L 제조의 이익은 라인 · 사람 · 출하가 멈추지 않을 때 나옵니다',
   sub='입고에서 납품까지 가치사슬과 단계별 KPI, 운영 과제가 걸리는 지점 — 삼성이 개입할 수 있는 과제',
   band=('ph.mf-greenhouse-work', '50% 50%', '영업이익 = 납품 매출 − 재료비 − 인건비 − 에너지 · 설비 − 물류 · 손실', [('생산', '설비 가동률', '[00]%'), ('생산', '수율', '[00.0]%'), ('사람', '재해율', '[0.00]%'), ('출하', '납기 준수율', '[00]%'), ('설비', '에너지비', '[0.0]억 원/년')]),
   cards=[('02 생산 · 공정', '공정 온 · 습도 편차가 수율을 흔듦', '통합공조 DVM S2 · DVM 칠러', True, 'ph.mf-greenhouse', '50% 50%'),
          ('설비 · 공조', '냉난방 에너지비 · 수동 설정 부담', 'DMS · SmartThings Pro AI 절약', True, 'ph.mf-dms', '50% 50%'),
          ('설비 · 공조', '설비 이상이 곧 생산 차질', '케어 서비스 · 예방점검 · 긴급출동', True, 'ph.mf-odu-row', '50% 50%'),
          ('사람 · 안전', '쓰러진 작업자의 발견이 늦음', '갤럭시 워치 · 넘어짐 · 심박 감지', True, 'ph.mf-worker-watch', '50% 50%'),
          ('단말 · 데이터', '종이 매뉴얼 · 수기 점검표 재입력', '갤럭시 탭 액티브 · 현장 업무 앱', True, 'ph.mf-rugged-tab', '40% 50%'),
          ('01 입고 · 자재', '원자재 · 부품 단가 · 수급 변동', '이번 제안 범위 밖 — 참고', False, None, '')],
   foot='L 제조 공장 · 현장 디지털 제안 · 금액 · KPI는 L 제조 데이터로 채움 · 사진: samsung.com 제조 · 현장 도입사례'),
}


def samsung_line(b, text, ours, size=11.5):
    return b.tb(('삼성 · ' if ours else '') + text, f'font-size: {size}px; font-weight: 800; color: {BLUE if ours else MUTED}; line-height: 1.4')


def money_strip(b, text, y=150):
    return (f'<div style="{ab(64, y, 1152, 38, f"box-sizing: border-box; border-radius: 10px; background: {SOFT}; padding: 0 14px; display: flex; align-items: center; gap: 12px")}">'
            + b.tb('돈의 흐름', f'height: 22px; padding: 0 9px; border-radius: 999px; background: {BLUE}; color: #fff; font-size: 11.5px; font-weight: 800; display: inline-flex; align-items: center; flex-shrink: 0')
            + b.tb(text, f'{NUM}; font-size: 13.5px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')


def stages(b, d):
    s = header(b, EB, d['hl'], d['sub'], w=1152)
    s += money_strip(b, d['money'])
    st = d['stages']; n = len(st); gap = 14; w = (1152 - gap * (n - 1)) // n
    for i, (num, nm, who, kl, kv, pain, fix, ours, pid, pos) in enumerate(st):
        x = 64 + i * (w + gap)
        cut = pid.startswith('cut.')
        s += b.img(pid, ab(x, 202, w, 296), pos=pos, fit='contain' if cut else 'cover', kind='cut' if cut else 'space',
                   hint=f'{num} {nm} 현장 사진', radius=12, pad=24 if cut else 0, bg=SOFT if cut else 'transparent')
        s += glass('<span style="display: flex; align-items: baseline; gap: 6px">' + b.tb(num, f'{NUM}; font-size: 12px; font-weight: 800; color: {LB}') + b.tb(nm, 'font-size: 14px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
                   + b.tb(who, f'font-size: 11px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), x + 8, 434, w - 16, 56, pad='6px 10px', gap=1)
        s += (f'<div style="{ab(x, 508, w, 142, "display: flex; flex-direction: column; gap: 6px")}">'
              + '<span style="display: flex; align-items: baseline; justify-content: space-between; gap: 6px; border-bottom: 1px solid ' + LINE + '; padding-bottom: 6px">'
              + b.tb(kl, f'font-size: 11.5px; font-weight: 700; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + b.tb(kv, f'{NUM}; font-size: 16px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</span>'
              + b.tb(pain, 'font-size: 14px; font-weight: 800; line-height: 1.45')
              + f'<div style="margin-top: auto; box-sizing: border-box; border-radius: 8px; background: {CHIP if ours else SOFT}; padding: 7px 10px">' + samsung_line(b, fix, ours) + '</div></div>')
    return s


def hero(b, d):
    s = header(b, EB, d['hl'], d['sub'], w=1152)
    sp, money, kpi, pid, pos = d['space']
    s += b.img(pid, ab(64, 152, 412, 496), pos=pos, kind='space', hint='고객사의 대표 공간 사진', radius=16)
    s += glass(b.tb('돈이 되는 곳', f'font-size: 11px; font-weight: 800; letter-spacing: 0.04em; color: {LB}') + b.tb(sp, 'font-size: 19px; font-weight: 800; color: #ffffff')
               + b.tb(money, f'{NUM}; font-size: 12.5px; font-weight: 700; line-height: 1.5; color: #ffffff; margin-top: 4px') + b.tb(kpi, f'{NUM}; font-size: 12px; line-height: 1.5; color: {LT}'),
               80, 0, 380, None, pad='12px 16px', gap=2).replace('top: 0px', 'bottom: 84px')
    for i, (tag, pain, kp, fix, ours, ppid, ppos) in enumerate(d['pains']):
        y = 152 + i * 126
        s += b.img(ppid, ab(500, y, 176, 118), pos=ppos, kind='space', hint=f'{tag} 현장 사진', radius=12)
        s += (f'<div style="{ab(692, y + 2, 344, 114, "display: flex; flex-direction: column; gap: 4px; min-width: 0")}">'
              + b.tb(tag, f'align-self: flex-start; height: 20px; padding: 0 8px; border-radius: 999px; background: {CHIP}; color: {BLUE}; font-size: 11px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')
              + b.tb(pain, 'font-size: 15px; font-weight: 800; line-height: 1.4')
              + b.tb('영향 · ' + kp, f'{NUM}; font-size: 12px; color: {MUTED}; margin-top: auto; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
        s += (f'<div style="{ab(1052, y + 14, 164, 90, f"box-sizing: border-box; border-radius: 10px; background: {CHIP if ours else SOFT}; padding: 9px 12px; display: flex; flex-direction: column; gap: 3px")}">'
              + b.tb('삼성 대응' if ours else '고객 영역', f'font-size: 10.5px; font-weight: 800; color: {BLUE if ours else MUTED}') + b.tb(fix, f'font-size: 12.5px; font-weight: 800; line-height: 1.4; color: {INK}') + '</div>')
        if i < 3: s += f'<div style="{ab(500, y + 122, 716, 1, f"background: {LINE}")}"></div>'
    return s


def band(b, d):
    s = header(b, EB, d['hl'], d['sub'], w=1152)
    pid, pos, eq, cells = d['band']
    s += b.img(pid, ab(64, 150, 1152, 216), pos=pos, kind='space', hint='고객사 사업 현장 사진 (가로 띠)', radius=16)
    s += b.tb(eq, ab(80, 164, extra=f'{NUM}; max-width: 1090px; border-radius: 999px; background: {GLASS}; color: #fff; font-size: 13px; font-weight: 800; padding: 6px 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis'), 'div')
    s += f'<div style="{ab(80, 290, 1120, 64, f"box-sizing: border-box; border-radius: 12px; background: {GLASS}; padding: 0 8px; display: grid; grid-template-columns: repeat({len(cells)}, minmax(0, 1fr))")}">'
    for k, (who, kl, kv) in enumerate(cells):
        s += (f'<span style="display: flex; flex-direction: column; justify-content: center; padding: 0 12px; {"border-left: 1px solid rgba(255,255,255,0.22)" if k else ""}; min-width: 0">'
              + b.tb((who + ' · ' + kl) if kl else who, f'font-size: 11px; font-weight: 700; color: {LB}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(kv, f'{NUM}; font-size: 18px; font-weight: 800; color: #ffffff; white-space: nowrap') + '</span>')
    s += '</div>'
    for i, (tag, pain, fix, ours, cpid, cpos) in enumerate(d['cards']):
        x = 64 + (i % 3) * 389; y = 380 + (i // 3) * 138
        s += f'<div style="{ab(x, y, 374, 128, f"box-sizing: border-box; border-radius: 12px; background: {SOFT if ours else "#ffffff"}; {"" if ours else "border: 1px dashed #b8bec8"}")}"></div>'
        tx = x + 14
        if cpid:
            s += b.img(cpid, ab(x, y, 144, 128), pos=cpos, kind='space', hint=f'{tag} 현장 사진', radius=12)
            tx = x + 158
        tw = x + 374 - 12 - tx
        s += (f'<div style="{ab(tx, y + 10, tw, 108, "display: flex; flex-direction: column; gap: 4px; min-width: 0")}">'
              + b.tb(tag, f'font-size: 11px; font-weight: 800; color: {BLUE if ours else MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
              + b.tb(pain, f'font-size: 14px; font-weight: 800; line-height: 1.4; color: {INK if ours else MUTED}')
              + f'<span style="margin-top: auto">' + samsung_line(b, fix, ours, size=11.5) + '</span></div>')
    return s


from gen_l6 import glass
for code, d in D.items():
    b = B()
    s = {'stages': stages, 'hero': hero, 'band': band}[d['design']](b, d)
    s += footer(b, d['foot'], 5)
    L.append(dict(f=f'L_PH_MI_{code}_B', code=f'PH-MI-{code}-B', p='customer', ind=code,
                  name=f'{NAMES[code]} · 고객 비즈니스 · 운영 과제 · 사진',
                  when=f'{NAMES[code]} 고객사의 돈의 흐름과 운영 단계별 과제를, 단계마다 현장 사진으로 보여줄 때',
                  pv=[f'L_MI_{code}_B'], sample=d['sample'], grp='분석 · 이해', sols=d['sols'], html=root(s), _b=b))
