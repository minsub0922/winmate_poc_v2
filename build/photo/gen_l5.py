# Part B — 업종별 '대표 공간 · 네 장면' (L_SS_xx_B) 의 사진 중심 버전 16장 (ind 지정)
from gen_base import *
L = []

IND = {
 'FB': dict(design='cols', sample='D 다이닝', grp='공간 · 제품', sols=['knoxsuite', 'stpro'],
   hl='D 다이닝의 홀 테이블, 앉는 순간부터 일어난 뒤까지 매끄럽습니다',
   sub='매출이 만들어지는 대표 공간 — 외국인 손님 한 테이블의 저녁을 네 장면으로: 순간 → 하는 일 → 제품 → 가치',
   scenes=[('18:10', '앉자마자 내 언어로 주문', '첫 화면에서 언어를 고르면 메뉴 · 사진 · 굽는 법까지 그 언어로', '갤럭시 탭 · 테이블 오더', '착석 → 첫 주문', '[0]분 → [0]분', 'ph.fb-table-order', '50% 50%'),
           ('18:40', '손 들지 않고 추가 주문', '추가 메뉴 · 직원 호출이 주방 · 홀 화면에 테이블 번호로', '테이블 탭 · 주방 갤럭시 탭', '추가 주문 · 객단가', '[00]% ↑', 'ph.fb-tablet-menu', '50% 45%'),
           ('19:30', '연기 · 냄새 없이 오래', '공기질에 맞춰 청정 · 냉방을 자동으로, 무풍이라 직바람 없이', '무풍 에어컨 · 공기청정기', '연기 · 냄새 불편', '[00]% ↓', 'ph.fb-lounge-ac', '55% 35%'),
           ('21:10', '계산 뒤 탭은 원격으로', '테이블에서 결제까지, 마감 후 전 테이블 탭을 원격 업데이트', '갤럭시 탭 · Knox Suite', '탭 장애 · 현장 출동', '[0]회 ↓', 'ph.fb-pos-pay', '50% 40%')],
   foot='D 다이닝 · 매장 디지털 운영 제안 · 사진: samsung.com 외식 도입사례 · 공식 연출'),
 'RT': dict(design='hero', sample='H 백화점', grp='공간 · 제품', sols=['magicinfo', 'hvac'],
   hl='H 백화점 VMD존, 상품 옆 화면과 공기가 하루 종일 알아서 바뀝니다',
   sub='대표 공간 · 층별 VMD존과 미디어 칼럼의 하루를 네 장면으로: 순간 → 하는 일 → 제품 → 가치',
   space=('층별 VMD존 · 미디어 칼럼', '진열 상품 옆에서 영상이 함께 말하는 곳', 'ph.rt-showroom-led', '50% 50%'),
   scenes=[('09:30', '시즌 캠페인 한 번에 교체', 'MagicINFO로 미디어 칼럼 · 비디오월 · 층 안내에 예약 송출', 'LED 사이니지 · 비디오월', '캠페인 교체', '[0]시간 → [0]분', 'ph.rt-fashion-store', '50% 40%'),
           ('14:00', '브랜드 이벤트 연출', '칼럼 [0]면을 한 영상으로 이어 진열 상품 옆에서 재생', '미디어 칼럼 LED · 곡면 LED', '이벤트 존 체류', '[00]% ↑', 'ph.rt-car-wall', '50% 50%'),
           ('16:00', '오래 머무는 동선은 시원하게', '이벤트 구역만 스케줄로 냉방을 높이고, 온도 범위는 중앙에서', '360 카세트 · DMS', '냉방 관련 민원', '[00]% ↓', 'ph.rt-mall-ac', '50% 40%'),
           ('20:40', '폐점 후 원격 점검', '꺼진 화면 · 재생 오류는 알림으로, 다음 개점 전에 조치', '관리실 모니터 · 갤럭시 탭', '장애 발견 → 조치', '[0]시간 → [0]분', 'ph.rt-staff-tablet', '50% 40%')],
   foot='H 백화점 · 플래그십 점포 공간 제안 · 사진: samsung.com 리테일 도입사례 · 공식 연출'),
 'SV': dict(design='cols', sample='P 스터디카페', grp='공간 · 제품', sols=['stpro'],
   hl='P 스터디카페 오픈 스터디룸은 몇 시간을 머물러도 쾌적합니다',
   sub='대표 공간 · 오픈 스터디룸 — 입실부터 마지막 퇴실까지 네 장면: 순간 → 하는 일 → 제품 → 가치',
   scenes=[('09:10', '자리에 앉는 순간', '재실 센서가 사람을 감지하면 그 구역 조명 · 냉난방을 켭니다', '360 카세트 · 재실 센서', '입실 후 쾌적해지기까지', '[0]분 → [0]분', 'ph.sv-study-tab', '50% 45%'),
           ('14:30', '몇 시간째 앉은 오후', '에어모니터가 공기질 변화를 보면 공기청정 · 냉난방을 조정', '에어모니터 · 공기청정기', '공기 · 온도 불편 문의', '[00]% ↓', 'ph.sv-study-open', '45% 50%'),
           ('21:00', '시험 기간, 만석', '재실이 늘면 냉방 · 공기청정 단계를 높이고, 상태는 점주 폰으로', '360 카세트 · 갤럭시 폰', '만석 시간 냉방 민원', '[0]건 → [0]건', 'ph.sv-studycafe', '50% 40%'),
           ('02:10', '마지막 이용객 퇴실', '재실 없음이 [00]분 이어지면 조명 · 냉난방 · 공기청정 OFF', '재실 · 열림 센서 · 스마트 플러그', '심야 빈 시간 전력', '[00]% ↓', 'ph.sv-study-night', '45% 50%')],
   foot='P 스터디카페 · 무인 매장 운영 제안 · 사진: samsung.com 도입사례 (4번은 야간으로 보정)'),
 'HT': dict(design='hero', sample='N 호텔', grp='공간 · 제품', sols=['lynk', 'stpro', 'knoxsuite'],
   hl='N 호텔의 객실은 체크인부터 퇴실 후 정리까지 손님에 맞춰 움직입니다',
   sub='투숙객이 가장 오래 머무는 대표 공간 · 객실 — 한 번의 숙박을 네 장면으로: 순간 → 하는 일 → 제품 → 가치',
   space=('객실', '투숙 만족이 결정되는 곳', 'ph.ht-room-bed', '40% 50%'),
   scenes=[('15:10', '문을 열면 내 이름', 'PMS 정보로 이름 · 언어 맞춤 웰컴 화면, 재실 루틴으로 냉방 · 조명 ON', '호텔 TV · 무풍 시스템에어컨', '부대시설 · 프로모션 이용', '[00]% ↑', 'ph.ht-welcome-tv', '20% 50%'),
           ('22:30', '버튼 하나로 휴식 모드', '조명은 낮추고 바람은 무풍, 내 폰 영상은 객실 TV로 캐스팅', '무풍 에어컨 · 조명 · 호텔 TV', '객실 불편 · 요청 콜', '[00]% ↓', 'ph.ht-room-night', '50% 50%'),
           ('10:40', '퇴실과 함께 기록 삭제', '체크아웃되면 캐스팅 · 연결 기록을 초기화, 화면은 기본 안내로', '호텔 TV · 프런트 관리 화면', '객실 TV 수동 초기화', '[0]분 → 자동', 'ph.ht-room-desk', '60% 50%'),
           ('12:30', '빈 객실은 스스로 절전', '공실을 감지하면 냉난방 · 조명 절전, 청소 상태는 하우스키핑 탭에', '재실 · 열림 센서 · 갤럭시 탭', '공실 객실 냉난방 · 조명', '[00]% 절감', 'ph.ht-twin', '50% 50%')],
   foot='N 호텔 · 투숙 경험 · 운영 제안 · 사진: samsung.com 호텔 도입사례'),
 'TP': dict(design='cols', sample='Z 파크', grp='공간 · 제품', sols=['magicinfo'],
   hl='Z 파크의 입장 대기 동선, 줄 서는 시간까지 파크의 체험이 됩니다',
   sub='방문객이 가장 오래 머무는 대표 공간 — 줄 서기부터 입장까지 네 장면: 순간 → 하는 일 → 제품 → 가치',
   scenes=[('10:05', '줄 끝에 서는 순간', '줄 길이에 맞춘 예상 대기 시간을 세로형 사이니지에 자동으로', '스마트 사이니지 QM55C (세로형)', '대기 관련 문의', '[00]% ↓', 'ph.tp-panda-gate', '50% 40%'),
           ('10:20', '기다림이 프리쇼로', '캐릭터 영상 · 프리쇼를 LED 월과 벽면 화면에 시간표대로', 'LED 사이니지 · QM43C · JBL', '대기 체감 만족도', '[00]% ↑', 'ph.tp-preshow', '50% 50%'),
           ('10:40', '입장 직전 안전 안내', '안전 수칙을 [0]개 언어로 번갈아, 음성은 게이트 구역에만', 'QM55C · 하만 프로 오디오', '게이트 탑승 지연', '[00]% ↓', 'ph.tp-panda-touch', '50% 50%'),
           ('13:00', '붐비면 나눠서 안내', '대기가 길어지면 운영실에서 접근로 화면을 다른 어트랙션 안내로', '실외용 스마트 사이니지 OH55C', '최대 대기 시간', '[00]분 → [00]분', 'ph.tp-panda-corridor', '50% 50%')],
   foot='Z 파크 · 파크 경험 · 운영 제안 · 사진: samsung.com 테마파크 도입사례(에버랜드 판다월드)'),
 'VN': dict(design='hero', sample='B 볼파크', grp='공간 · 제품', sols=['magicinfo'],
   hl='B 볼파크의 빅보드는 컨트롤룸 한 자리에서 경기 흐름을 따라갑니다',
   sub='대표 공간 · 빅보드와 컨트롤룸 — 경기일 하루를 네 장면으로: 순간 → 하는 일 → 제품 → 가치',
   space=('빅보드 · 컨트롤룸', '외야석까지 같은 순간을 보는 곳', 'ph.vn-stadium-board', '50% 50%'),
   scenes=[('16:30', '개장 전 리허설 · 화면 점검', '빅보드 · 리본 · 컨코스 화면 상태를 컨트롤룸 한 화면에서', 'LED 빅보드 · 컨트롤룸 모니터', '개장 전 화면 점검', '[00]분 → [00]분', 'ph.vn-control', '50% 50%'),
           ('19:10', '이닝 교대 · 응원 · 광고', '응원 · 이벤트 · 스폰서 광고를 이닝별 편성표대로 동시 송출', '리본보드 · 하만 프로 오디오', '스폰서 광고 노출', '[00]% ↑', 'ph.vn-stands', '50% 50%'),
           ('20:05', '득점 순간 · 리플레이', '기록실 스코어 · 선수 기록이 화면에 바로, 리플레이는 이어서', '기록실 올인원 PC · LED 빅보드', '득점 → 화면 반영', '[0]초', 'ph.vn-control-staff', '50% 50%'),
           ('21:40', '경기 후 · 퇴장 안내', '게이트별 혼잡 · 셔틀 · 대중교통 안내를 광장 화면까지 한 번에', 'LED 빅보드 · 실외용 사이니지', '구장 밖까지 퇴장', '[00]분 → [00]분', 'ph.vn-stadium-wide', '50% 50%')],
   foot='B 볼파크 · 경기장 경험 · 운영 제안 · 사진: samsung.com 도입사례(인천SK행복드림구장)'),
 'AD': dict(design='cols', sample='J 미디어', grp='공간 · 제품', sols=['magicinfo'],
   hl='J 미디어의 랜드마크 외벽은 아침부터 심야까지 스스로 표정을 바꿉니다',
   sub='대표 공간 · 랜드마크 외벽 — 하루를 네 장면으로: 순간 → 하는 일 → 제품 → 가치 (시간은 예시)',
   scenes=[('07:30', '출근길 광고 편성', '출근 시간대 광고주 편성이 예약대로, 재생 상태는 관제실에서', '실외 곡면 LED 사이니지', '출근 시간대 송출률', '[00]%', 'ph.ad-building-led', '50% 40%'),
           ('13:00', '한낮 햇빛 속 선명하게', '고휘도 실외 LED, 시간대에 맞춰 밝기를 올려 둡니다', '실외 LED (고휘도)', '한낮 시인성 불만', '[00]% ↓', 'ph.ad-dept-led', '50% 40%'),
           ('19:30', '곡면을 잇는 미디어아트', '두 면을 잇는 미디어아트를 정시마다 편성해 랜드마크로', '곡면 LED · 외벽 두 면 연결', '저녁 판매 슬롯', '[00]% ↑', 'ph.ad-building-led2', '50% 40%'),
           ('23:30', '심야 밝기 저감', '심야엔 밝기를 단계적으로 낮추고, 장애는 관제실로 알림', 'LED 사이니지 · 관제실 모니터', '야간 눈부심 민원', '[00]% ↓', 'ph.ad-street-night', '50% 50%')],
   foot='J 미디어 · 옥외 미디어 운영 제안 · 사진: samsung.com 옥외 광고 도입사례'),
 'OF': dict(design='hero', sample='C 빌딩', grp='공간 · 제품', sols=['stpro', 'knoxsuite'],
   hl='C 빌딩의 회의실은 예약부터 뒷정리까지 저절로 움직입니다',
   sub='입주사 만족이 갈리는 대표 공간 · 회의실 — 회의 한 번을 네 장면으로: 순간 → 하는 일 → 제품 → 가치',
   space=('회의실', '입주사가 매일 평가하는 곳', 'ph.of-meeting-display', '50% 50%'),
   scenes=[('09:50', '문 앞에서 예약 확인', '예약 · 현황을 문 앞 탭에 실시간으로, 화면은 원격으로 설정', '갤럭시 탭 · 출입문 거치대', '회의실 가동률', '[00]%', 'ph.of-door-tab', '45% 40%'),
           ('10:00', '버튼 하나로 회의 모드', '‘회의 · PT 모드’ 한 번에 조명 · 블라인드 · 냉난방이 함께', '시스템에어컨 · 조명 · 블라인드', '회의 준비 시간', '[0]분 → [0]분', 'ph.of-meeting', '50% 50%'),
           ('10:10', '쓰고, 띄우고, 바로 공유', '손 필기를 디지털로 공유하고, 노트북 화면은 바로 미러링', '삼성 Flip · 이동식 스탠드', '화면 연결 · 공유 대기', '[0]분 → [0]분', 'ph.of-desk-touch', '50% 40%'),
           ('11:00', '비면 스스로 정리', '사람이 없으면 냉난방 · 조명 OFF, 사용 패턴은 데이터로', '열림 · 재실 센서 · 갤럭시 탭', '빈 회의실 냉난방 · 조명', '[00]% 절감', 'ph.of-room-tab', '50% 50%')],
   foot='C 오피스 빌딩 · 스마트 오피스 제안 · 사진: samsung.com 오피스 도입사례'),
 'RS': dict(design='cols', sample='R 건설', grp='공간 · 제품', sols=['stpro'],
   hl='R 건설의 주방은 모델하우스에서 팔리고, 매일 저녁 평가받습니다',
   sub='대표 공간 · 주방과 아일랜드 — 분양 현장부터 입주 후 저녁까지 네 장면: 순간 → 하는 일 → 제품 → 가치',
   scenes=[('모델하우스', '‘여기 살고 싶다’는 순간', '가구 라인에 맞춘 빌트인 주방 연출, TV로 SmartThings 시연', '키친핏 냉장고 · 빌트인 인덕션', '청약 경쟁률', '[00.0] 대 1', 'ph.rs-kitchen-island', '50% 50%'),
           ('옵션 계약', '주방을 직접 고르는 순간', '1~4도어 모듈 조합 · 도어 컬러 패널을 옵션 패키지로 제시', '키친핏 모듈 · 컬러 패널', '옵션 선택률', '[00]%', 'ph.rs-kitchen-fridge', '30% 50%'),
           ('입주', '가구와 빈틈없는 첫날', '가구장 깊이 맞춤 설치 · 인덕션 일체 시공 · 기기 연결까지', '키친핏 · 빌트인 인덕션', '입주 전 설치 완료', '[00]%', 'ph.rs-kitchen-white', '50% 50%'),
           ('입주 후 저녁', '조리 열기에도 거실까지 쾌적', '거실~주방을 무풍으로 고르게, AI 절약 모드로 요금 관리', '빌트인 인덕션 · 무풍', '입주민 만족도', '[0.0]점', 'ph.rs-living-ac', '50% 50%')],
   foot='R 건설 · 아파트 분양 제안 · 사진: samsung.com 주거 도입사례 · 비즈니스 페이지'),
 'ID': dict(design='hero', sample='I 키친', grp='공간 · 제품', sols=['stpro'],
   hl='I 키친의 계약은 키친 존의 네 장면에서 만들어집니다',
   sub='방문객이 키친 존에 머무는 동안 — 장면마다 삼성이 하는 일, 쓰이는 제품, I 키친이 얻는 가치',
   space=('쇼룸 키친 존', '가구와 가전이 한 면으로 보이는 곳', 'ph.id-gallery-kitchen', '40% 50%'),
   scenes=[('입장 직후', '첫인상 — 돌출 없는 일체형', '맞춤 패널로 냉장 · 냉동 · 김치 칼럼이 가구장과 한 면', '1도어 냉장 · 냉동 · 김치', '키친 존 체류 시간', '[00]분', 'ph.id-gallery-fridge', '50% 40%'),
           ('시연', '살아 있는 주방을 체험', '인덕션 · 후드 · 큐커를 함께 제어, 후드는 인덕션과 연동', 'AI 인덕션 · 후드 Air', '시연 후 상담 신청', '[00]%', 'ph.id-showroom-island', '50% 55%'),
           ('비교', '소재 · 조합을 실물로 확정', '도어 패널을 가구장과 같게, 식기세척기 · 정수기는 하부장 안으로', '식기세척기 · 정수기 하부 매립', '가전 결합률', '[00]%', 'ph.id-gallery-builtin', '60% 50%'),
           ('상담', '망설임 없이 결정하는 자리', '360 기류로 긴 상담도 쾌적, 설치 조건은 그 자리에서 확인', '시스템에어컨 360', '상담 → 계약 전환율', '[00]%', 'ph.id-kitchen-island', '50% 50%')],
   foot='I 키친 · 인테리어 브랜드 쇼룸 제안 · 사진: samsung.com 인테리어 · 가구 도입사례'),
 'ED': dict(design='cols', sample='E 대학교', grp='공간 · 제품', sols=['stpro', 'knoxsuite'],
   hl='E 대학교 강의실은 수업 전 · 중 · 후를 스스로 맞춥니다',
   sub='대표 공간 · AI 강의실 — 75분 한 차시를 네 장면으로: 순간 → 하는 일 → 제품 → 가치 (시간은 예시)',
   scenes=[('08:50', '수업 준비', '탭에서 ‘강의 모드’ 한 번이면 조명 · 블라인드 · 에어컨 · 화면이 함께', 'SmartThings Pro · 갤럭시 탭', '수업 준비', '[0]분 → [0]분', 'ph.ed-pc-lab', '50% 50%'),
           ('09:00', '강의 · 판서', '교수 · 학생 화면을 전자칠판에 바로, 정밀 자료는 대형 LED로', 'Flip Pro · LED 사이니지', '화면 연결 대기', '[0]분 → [0]분', 'ph.ed-lecture-led', '50% 40%'),
           ('09:40', '모둠 · 피드백', '탭 · 좌석 PC로 질문과 모둠 결과를 공유, 탭은 수업 앱만', '갤럭시 탭 · Knox', '수업 참여율', '[00]% ↑', 'ph.ed-tab-exam', '60% 50%'),
           ('10:15', '퇴실 후', '재실 센서가 빈 강의실을 감지해 전원 OFF, 상태는 대시보드로', 'SmartThings Pro · 재실 센서', '빈 강의실 전력', '[00]% 절감', 'ph.ed-lab-night', '50% 50%')],
   foot='E 대학교 캠퍼스 · 스마트 교육 환경 제안 · 사진: samsung.com 교육 도입사례 (4번은 야간으로 보정)'),
 'PB': dict(design='hero', sample='S 지자체', grp='공간 · 제품', sols=['magicinfo'],
   hl='S 지자체 상황실은 한 장의 상황판으로 하루를 지킵니다',
   sub='교통정보센터 상황실의 네 장면 — 순간마다 바뀌는 상황판, 움직이는 제품 · 솔루션, 지키는 가치',
   space=('교통정보센터 상황실', '도시의 하루를 한 화면으로 보는 곳', 'ph.pb-control', '50% 50%'),
   scenes=[('07:30', '출근 피크', '도심 교통 맵과 교차로 CCTV를 이음매 없는 한 화면에', 'The Wall · 모듈러 LED', '정체 인지', '[00]분 단축', 'ph.pb-traffic-wall', '50% 50%'),
           ('14:00', '근무 교대', '근무자마다 필요한 구역으로 화면을 나눠 바로 이어 관제', 'The Wall · 자유 화면 분할', '인수인계 시간', '[00]분', 'ph.pb-traffic-room', '50% 50%'),
           ('18:10', '집중호우', '현장 직원 단말의 위치 · 사진 보고를 기관 시스템과 한 구역에', '갤럭시 엑스커버 · 워치', '현장 공유 → 시민 공지', '[00]분', 'ph.pb-ranger-watch', '50% 45%'),
           ('22:40', '야간 사고', '사고 지점 CCTV를 크게 키워도 선명하게, 8K 업스케일링 · HDR', '퀀텀 프로세서 Flex · Q HDR', '사고 인지 → 전파', '[00]분', 'ph.of-control-room', '50% 50%')],
   foot='S 지자체 · 공공 인프라 제안 · 사진: samsung.com 공공 도입사례'),
 'MD': dict(design='cols', sample='W 요양병원', grp='공간 · 제품', sols=['stpro', 'hvac'],
   hl='W 요양병원의 병실은 치료 공간이자 환자가 사는 집입니다',
   sub='1인실 · 다인실 병실의 입원 첫날부터 다음 날 회진까지 — 네 장면으로 보는 삼성의 역할',
   scenes=[('14:00 · 입원 첫날', '보이는 쾌적이 입원을 정합니다', '직바람 없는 냉난방, 에어모니터가 병실 공기질을 바로 보여 줍니다', '무풍 · 공기청정기 · 에어모니터', '입원 상담 → 입원 전환', '[00]%', 'ph.md-single-room', '50% 50%'),
           ('19:00 · 저녁', '누운 채 보고, 바로 요청', 'TV 시청 · 간호사 호출 · 서류 신청을 병상 탭에서, 요청은 간호스테이션으로', '갤럭시 탭 · 스마트태그', '호출 응답 시간', '[00]초', 'ph.md-ward', '50% 50%'),
           ('02:00 · 새벽', '돌지 않아도 아는 밤사이', '재실 · 창문 열림을 감지하면 즉시 알림, 에어컨은 무풍으로 조용히', '재실 · 열림 센서 · 무풍', '야간 순회 점검', '[00]회 → [00]회', 'ph.md-ward-night', '50% 50%'),
           ('10:00 · 회진', '병상에서 받는 동의서', 'S펜으로 서명하면 병원 전자서식 시스템에 바로 저장', '갤럭시 북 · 갤럭시 탭', '종이 동의서 · 월', '[0,000]장 → [0]장', 'ph.md-consent', '50% 40%')],
   foot='W 요양병원 · 케어 환경 제안 · 사진: samsung.com 의료 도입사례 (3번은 새벽으로 보정)'),
 'MF': dict(design='hero', sample='L 제조', grp='공간 · 제품', sols=['stpro', 'hvac', 'knoxsuite'],
   hl='생산 라인은 L 제조의 수율 · 안전 · 기록이 함께 걸린 곳입니다',
   sub='대표 공간 · 생산 라인 — 가동 전부터 설비 경보까지 네 장면: 순간 → 하는 일 → 제품 → 가치',
   space=('생산 라인 · 클린룸', '수율 · 재해율 · 에너지비가 갈리는 곳', 'ph.mf-greenhouse', '50% 50%'),
   scenes=[('05:30', '가동 전 · 예냉 · 예열', '작업자가 오기 전, 존별 스케줄로 라인 온 · 습도를 규격으로', 'DVM 칠러 · DVM S2', '온 · 습도 편차', '±[0.0]℃', 'ph.mf-odu-row', '50% 50%'),
           ('09:30', '작업 지시 · 점검 기록', '장갑 낀 손으로 지시를 확인하고, 점검표 · 설비 사진을 그 자리에서', '갤럭시 탭 액티브 · S펜', '기록 재입력', '[00]분 → 0', 'ph.mf-rugged-tab', '40% 50%'),
           ('수시', '작업자 이상 감지', '넘어짐 · 심박 이상을 감지해 구조 신호 · 위치를 관제실로', '갤럭시 워치', '감지 → 현장 도착', '[0]분', 'ph.mf-worker-watch', '50% 50%'),
           ('수시', '설비 경보', '에너지 비효율 · 공조 에러를 미리 보고 예방점검 · 긴급출동', '시스템에어컨 · DMS 2.5', '설비 가동률', '[00]%', 'ph.mf-dms', '50% 50%')],
   foot='L 제조 공장 · 현장 디지털 제안 · 사진: samsung.com 제조 · 현장 도입사례 (공간 사진은 고객 라인 사진으로 교체)'),
 'FN': dict(design='cols', sample='T 은행', grp='공간 · 제품', sols=['knoxsuite'],
   hl='T 은행 창구의 상담 한 건, 태블릿 한 대로 끝납니다',
   sub='대표 공간 · 영업점 창구 — 고객 한 명의 상담을 네 장면으로: 순간 → 하는 일 → 제품 → 가치',
   scenes=[('상담 1', '상품 안내', '직원이 탭을 고객 쪽으로 돌려, 상품을 영상 · 비교 화면으로 설명', '갤럭시 탭 · T 은행 앱', '상품 설명 시간', '[00]분 ↓', 'ph.fn-tab-customer', '50% 40%'),
           ('상담 2', '미리작성 불러오기', '대기 중 거치대 탭에서 써 둔 서식이 창구 탭에 그대로 열립니다', '갤럭시 탭 · 대기석 거치대', '창구 처리 시간', '[00]분 ↓', 'ph.fn-branch', '50% 50%'),
           ('상담 3', 'S펜 작성 · 서명', '큰 글씨 화면에 S펜으로 확인 · 서명 — 종이에 쓰듯 편하게', '갤럭시 탭 · S펜', '출력 · 종이 서식', '[000]장 ↓', 'ph.fn-counter', '50% 45%'),
           ('상담 4', '완료 · 보관', '서식은 전자문서로, 고객 정보는 Knox 업무 영역 안에만', '갤럭시 탭 · Knox', '마감 · 보관 작업', '[00]분 ↓', 'ph.fn-tab-banker', '50% 40%')],
   foot='T 은행 · 영업점 디지털 제안 · 사진: samsung.com 금융 도입사례(KEB하나은행)'),
 'OE': dict(design='hero', sample='U 통신사', grp='공간 · 제품', sols=['knoxsuite'],
   hl='U 통신사의 대표 공간은 손 안의 ‘첫 화면’입니다',
   sub='개통 첫 부팅부터 학년이 바뀌는 날까지 — 같은 화면 위에서 삼성 단말 · Knox가 하는 네 가지 일',
   space=('손 안의 첫 화면', '매일 켜는 화면이 브랜드가 되는 곳', 'ph.oe-phone-user', '50% 50%'),
   scenes=[('개통일', '켜는 순간부터 U 통신사 폰', '부팅 화면 · 테마 · 전용 앱 · 보호 설정이 첫 부팅에 이미', 'Knox Configure 자동 설정', '개통 세팅', '[00]분 → [0]분', 'ph.rt-shoppers', '50% 40%'),
           ('매일', '허용된 앱만, 내 화면', '정해진 앱 · 사용 시간 안에서, 도착 · 위치 알림은 보호자에게', '갤럭시 A · XCover · 스마트태그', '안심 서비스 가입률', '[00]%', 'ph.rt-fashion-phone', '50% 50%'),
           ('언제든', '풀리지 않는 설정', '설정 해제 · 앱 삭제 · 초기화 시도를 단말 수준에서 막습니다', '칩부터 Knox 내장', '우회 · 초기화 문의', '[00]% ↓', 'cut.xcover7', '50% 50%'),
           ('D+[00]개월', '학년이 오르면 폰도 자랍니다', '기기 변경 없이 주니어 모드로, 규칙 · 테마를 원격으로 바꿉니다', 'Knox Configure 원격 변경', '재약정 · 기기 변경률', '[00]%', 'ph.fb-mobile-order', '50% 50%')],
   foot='U 통신사 · 전용 단말 제안 · 사진: samsung.com 도입사례 · 비즈니스 페이지 · 제품 컷'),
}
NAMES = {'FB': '외식 · 카페', 'RT': '리테일', 'SV': '생활 편의 · 무인 매장', 'HT': '호텔 · 리조트', 'TP': '테마파크 · 관광 · 전시', 'VN': '공연장 · 경기장 · 영화관',
         'AD': '옥외 · 미디어 광고', 'OF': '오피스 · 업무 빌딩', 'RS': '주거 분양 · 주택', 'ID': '인테리어 · 가구 · 빌트인', 'ED': '교육 · 캠퍼스', 'PB': '공공 · 교통 인프라',
         'MD': '의료 · 요양 · 케어', 'MF': '제조 · 물류 · 현장', 'FN': '금융', 'OE': '파트너 전용 단말'}


def tagchip(b, t, dark=True):
    return b.tb(t, f'{NUM}; height: 26px; padding: 0 11px; border-radius: 999px; background: {GLASS if dark else CHIP}; color: {"#ffffff" if dark else BLUE}; font-size: 13px; font-weight: 800; display: inline-flex; align-items: center; white-space: nowrap')


def kpi_box(b, label, val, w='100%'):
    return (f'<div style="box-sizing: border-box; width: {w}; border-radius: 10px; background: {CHIP}; padding: 8px 12px; display: flex; flex-direction: column; gap: 1px; flex-shrink: 0">'
            + b.tb(label, f'font-size: 11.5px; font-weight: 700; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
            + b.tb(val, f'{NUM}; font-size: {19 if len(val) <= 10 else 16}px; font-weight: 800; color: {BLUE}; white-space: nowrap') + '</div>')


def cols(b, d):
    s = header(b, '03 · 공간별 가치 제공 시나리오', d['hl'], d['sub'], w=1152)
    s += f'<div style="{ab(64, 160, 1152, 490, "display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 20px")}">'
    for i, (t, ti, what, prod, kl, kv, pid, pos) in enumerate(d['scenes']):
        s += '<div style="position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; height: 490px">'
        s += b.img(pid, 'position: relative; width: 100%; height: 272px; flex-shrink: 0', pos=pos, kind='cut' if pid.startswith('cut.') else 'space',
                   hint=f'장면 {i + 1} · {ti} 사진 (고객 공간으로 교체)', radius=14, fit='contain' if pid.startswith('cut.') else 'cover', bg=SOFT if pid.startswith('cut.') else 'transparent', pad=20 if pid.startswith('cut.') else 0)
        s += (f'<span style="position: absolute; left: 10px; top: 10px; display: flex; gap: 6px; align-items: center">'
              + b.tb(str(i + 1), f'{NUM}; width: 26px; height: 26px; border-radius: 50%; background: {BLUE}; color: #fff; font-size: 12.5px; font-weight: 800; display: flex; align-items: center; justify-content: center')
              + tagchip(b, t) + '</span>')
        s += b.tb(ti, 'font-size: 17px; font-weight: 800; line-height: 1.35; margin-top: 4px')
        s += b.tb(what, f'font-size: 13px; line-height: 1.55; color: {BODY}')
        s += chip(b, prod, size=11, h=21, extra='max-width: 100%; overflow: hidden; text-overflow: ellipsis')
        s += f'<div style="margin-top: auto">' + kpi_box(b, kl, kv) + '</div>'
        s += '</div>'
    s += '</div>'
    return s


def hero(b, d):
    s = header(b, '03 · 공간별 가치 제공 시나리오', d['hl'], d['sub'], w=1152)
    sp, spd, spid, spos = d['space']
    s += b.img(spid, ab(64, 160, 412, 490), pos=spos, kind='space', hint='대표 공간 사진 (고객 공간으로 교체)', radius=16)
    s += (f'<div style="{ab(80, 552, 380, 82, f"box-sizing: border-box; border-radius: 12px; background: {GLASS}; padding: 12px 16px; display: flex; flex-direction: column; gap: 3px")}">'
          + b.tb('대표 공간', f'font-size: 11px; font-weight: 800; letter-spacing: 0.06em; color: {LB}')
          + b.tb(sp, 'font-size: 19px; font-weight: 800; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis')
          + b.tb(spd, f'font-size: 12.5px; color: {LT}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</div>')
    for i, (t, ti, what, prod, kl, kv, pid, pos) in enumerate(d['scenes']):
        y = 160 + i * 126
        cut = pid.startswith('cut.')
        s += b.img(pid, ab(500, y, 184, 114), pos=pos, kind='cut' if cut else 'space', hint=f'장면 {i + 1} · {ti} 사진', radius=12,
                   fit='contain' if cut else 'cover', bg=SOFT if cut else 'transparent', pad=10 if cut else 0)
        s += b.tb(str(i + 1), ab(508, y + 8, 24, 24, f'{NUM}; border-radius: 50%; background: {BLUE}; color: #fff; font-size: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center'), 'div')
        s += (f'<div style="{ab(700, y, 344, 114, "display: flex; flex-direction: column; gap: 4px; min-width: 0")}">'
              + '<span style="display: flex; align-items: center; gap: 8px; min-width: 0">' + tagchip(b, t, dark=False)
              + b.tb(ti, 'font-size: 16px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis') + '</span>'
              + b.tb(what, f'font-size: 12.5px; line-height: 1.5; color: {BODY}')
              + b.tb(prod, f'font-size: 11.5px; font-weight: 700; color: {BLUE}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: auto') + '</div>')
        s += f'<div style="{ab(1060, y + 18, 156, 78, "display: flex; align-items: center")}">' + kpi_box(b, kl, kv) + '</div>'
        if i < 3: s += f'<div style="{ab(700, y + 120, 516, 1, f"background: {LINE}")}"></div>'
    return s


for code, d in IND.items():
    b = B()
    s = cols(b, d) if d['design'] == 'cols' else hero(b, d)
    s += footer(b, d['foot'], 12)
    L.append(dict(f=f'L_PH_SS_{code}_B', code=f'PH-SS-{code}-B', p='scenario', ind=code,
                  name=f'{NAMES[code]} · 대표 공간 네 장면 · 사진',
                  when=f'{NAMES[code]} 제안에서 대표 공간 한 곳의 네 장면을, 장면마다 현장 사진과 KPI로 보여줄 때',
                  pv=[f'L_SS_{code}_B'], sample=d['sample'], grp='공간 · 제품', sols=d['sols'], html=root(s), _b=b))
