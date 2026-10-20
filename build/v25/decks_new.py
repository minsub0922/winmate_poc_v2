# 세 덱의 새 레이아웃 인스턴스 — 기본 문구 = 원본 명세 문구(띄어쓰기 바로잡음), 기본 사진 = 그 덱 사진('@key')
import sys, json, re
sys.path.insert(0, '/home/claude/v3')
from newlays import *

B = lambda t: f'<b style="color: #9db4ff">{t}</b>'
BB = lambda t: f'<b style="color: #1428a0">{t}</b>'
C4WAY, CPUR, CBTV, CWALL, CDRESS = 'img/fill/ais-b.json#5', 'img/fill/ais-a.json#13', 'img/fill/ais-b.json#4', 'img/fill/ais-a.json#12', 'img/fill/ais-a.json#9'
C1WAY = 'img/fill/ais-a.json#8'
OUT = []  # (layout, meta)

def M(s, code, name, when, p, p2, ind, g, eb, hl, sub='', foot='', req=(), prods=(), sols=(), sample=''):
    return dict(code=code, name=name, when=when, p=p, p2=p2, ind=ind, g=g, sample=sample, eb=eb, hl=hl, sub=sub, foot=foot, req=list(req), prods=list(prods), sols=list(sols))
G = {'ST': '표준 제안서 · AI 스토어 · {} — 2025 AI 스토어 제안서 표준 양식', 'OF': '표준 제안서 · AI 오피스 · {} — 2025 AI 오피스 제안서 표준 양식', 'AP': '표준 제안서 · AI 아파트 · {} — 2025 AI 아파트 제안서 표준 양식'}

# ============================== 스토어
s = space_overview('L_AST_11', 'ST', '03 · 공간별 제안', '스토어 공간별 제안', '입구 · 내부(홀) · 주문/결제 · 주방 — 공간마다 맞는 삼성 제품을 제안합니다', [
    ('입구', ['스마트 사이니지 (실외용)', '스마트 사이니지 (창문형)'], '@st_p12', '50% 50%'),
    ('내부(홀)', ['무풍 시스템에어컨', 'Infinite AI 공기청정기', '비즈니스 TV', '스페이셜 사이니지', '업소용 청소기'], '@st_p14', '50% 40%'),
    ('주문/결제', ['갤럭시 탭 (테이블 오더 솔루션)'], '@st_p19a', '50% 50%'),
    ('주방', ['업소용 냉장고'], '@st_p20', '50% 50%')], 11)
OUT.append((s, M(s, 'AST-11', '공간 사진 모자이크 4 + 공간 · 제품 범례', '매장의 네 공간과 놓이는 제품을 한 장에 보여 줄 때', 'dss', 'scenario', 'FB', G['ST'].format('03 공간별 제안'), '03 · 공간별 제안', '스토어 공간별 제안', req=['spaces', 'products', 'images'], prods=['oh55a', 'window', 'wf4way', 'purifier', 'qm55c'])))

s = space_map('L_AST_21', 'ST', '03 · 공간별 제안', 'AI 스토어 Map', '공간마다 놓이는 삼성 제품을 한 장에 정리했습니다', [
    [(1, '입구', [('스마트 사이니지<br>(실외용)', '@st_c_outdoor'), ('스마트 사이니지<br>(창문형)', '@st_c_window')]),
     (3, '주문/결제', [('갤럭시 탭<br>(테이블 오더 솔루션)', '@st_c_tab')]), (4, '주방', [('업소용 냉장고', '@st_c_fridge')])],
    [(2, '내부(홀)', [('무풍<br>시스템에어컨', C4WAY), ('Infinite AI<br>공기청정기', CPUR), ('비즈니스 TV', CBTV), ('스페이셜<br>사이니지', '@st_c_spatial'), ('업소용 청소기', '@st_c_vacuum')])]], 21)
OUT.append((s, M(s, 'AST-21', 'AI 스토어 Map · 공간 × 제품 컷', '공간별 제안을 마치며 공간마다 놓이는 제품을 한 장에 정리할 때', 'bom', 'dss', 'FB', G['ST'].format('03 공간별 제안'), '03 · 공간별 제안', 'AI 스토어 Map', req=['spaces', 'products', 'images'], prods=['oh55a', 'window', 'wf4way', 'purifier', 'qm55c'])))

s = sol_intro2('L_STD_INTRO2', 'ST', '04 · 스토어 솔루션', '효율적인 공간 운영을 위한<br>AI 기반 디지털 전환 솔루션', 'SmartThings Pro', [
    ('bolt', '에너지 효율 향상', B('AI 기반') + ' 맞춤형 에너지 절감 알고리즘'),
    ('remote', '원격 제어', '여러 지역의 건물을 ' + B('편리하게 관리'))], '@st_stp_bg', 'SmartThings Pro 매장 운영 대시보드 화면', 23, tag='')
OUT.append((s, M(s, 'STD-INTRO2', '풀블리드 화면 + 캡션 패널 · 솔루션 소개 (기능 2)', '솔루션 하나를 대표 화면과 두 가지 핵심 기능으로 소개할 때', 'solution', None, 'FB', G['ST'].format('04 스토어 솔루션'), '04 · 스토어 솔루션', 'SmartThings Pro', req=['solutions', 'images'], sols=['stpro'])))

s = ui_two('L_STD_UI2', 'ST', '04 · 스토어 솔루션', 'AI 기반 맞춤형 에너지 절감', '에너지 소비 현황 모니터링 및 AI 에너지 모드를 통한 에너지 절약으로 운영비를 효율화합니다.', [
    ('@st_stp_energy', 1, '에너지 요금을 절약하기 위해<br>에너지 사용량을 모니터링', 'SmartThings Pro 에너지 사용량 대시보드'),
    ('@st_stp_mode', 1, '운영상의 필요에 따라<br>기기의 “AI 에너지 모드”를 활성화', 'AI 에너지 모드 제어 화면')], 24, note='')
OUT.append((s, M(s, 'STD-UI2', '솔루션 화면 2장 + 파란 캡션 띠', '솔루션의 두 화면(대시보드 · 제어)을 나란히 보여 줄 때', 'solution', 'effect', 'FB', G['ST'].format('04 스토어 솔루션'), '04 · 스토어 솔루션', 'AI 기반 맞춤형 에너지 절감', req=['solutions', 'images'], sols=['stpro'])))

s = ui_feat3('L_STD_UIF3', 'ST', '04 · 스토어 솔루션', '콘텐츠 간편 제작', 'VXT 캔버스는 다양한 템플릿과 이미지, 폰트 등을 제공해 고퀄리티의 콘텐츠를 손쉽게 제작할 수 있습니다.', '@st_vxt_canvas', 'VXT Canvas 콘텐츠 편집 화면', 'VXT Canvas', [
    ('template', '템플릿', '콘텐츠를 누구나 쉽게 제작할 수 있도록 ' + BB('비즈니스별 템플릿 제공')),
    ('image', '이미지', '캔버스 내 무료 이미지 사이트 픽사베이를 연동해 ' + BB('다양한 이미지 제공')),
    ('type', '폰트', '고객의 이목을 끄는 디자인을 할 수 있도록 ' + BB('다양한 폰트 스타일 제공'))], 27)
OUT.append((s, M(s, 'STD-UIF3', '큰 솔루션 화면 + 기능 카드 3', '솔루션 화면 하나와 세 가지 기능을 함께 설명할 때', 'solution', None, 'FB', G['ST'].format('04 스토어 솔루션'), '04 · 스토어 솔루션', '콘텐츠 간편 제작', req=['solutions', 'images'], sols=['vxt'])))

s = hub_six('L_STD_HUB6', 'ST', '04 · 스토어 솔루션', '콘텐츠 원격 제어', '전 지점의 콘텐츠 운영 현황을 실시간으로 확인하고, 원격으로 관리할 수 있습니다.', '@st_vxt_cms', 'VXT 콘텐츠 관리(CMS) 화면',
            [('@st_p12', 'A 지점'), ('@st_p13', 'B 지점'), ('@st_p16', 'C 지점'), ('@st_p17', 'D 지점'), ('@st_s08_menu', 'E 지점'), ('@st_s08_multi', 'F 지점')], 28, 'Samsung VXT')
OUT.append((s, M(s, 'STD-HUB6', '가운데 관리 화면 + 지점 화면 6 연결', '본사 한 화면에서 여러 지점을 관리하는 구조를 보여 줄 때', 'solution', 'scenario', 'FB', G['ST'].format('04 스토어 솔루션'), '04 · 스토어 솔루션', '콘텐츠 원격 제어', req=['solutions', 'images'], sols=['vxt'])))

# ============================== 오피스
s = space_overview('L_AOF_11', 'OF', '03 · 공간별 제안', '오피스 공간별 제안', '로비부터 직원휴게실까지 — 여섯 공간, 열한 개 제품', [
    ('로비', ['스마트 LED 사이니지'], '@of_p12', '50% 50%'),
    ('사무실', ['무풍 시스템에어컨', '고해상도 뷰피니티 모니터', '갤럭시 북5 시리즈', '디지털 복합기 MX 시리즈'], '@of_p13', '50% 50%'),
    ('대형회의실', ['The Wall'], '@of_p17', '50% 50%'),
    ('중소형회의실', ['Flip Pro'], '@of_p18', '50% 50%'),
    ('회의실', ['갤럭시 탭 S10 시리즈'], '@of_p19', '50% 50%'),
    ('직원휴게실', ['Bespoke AI 하이브리드', 'Bespoke 에어드레서', 'Infinite AI 공기청정기'], '@of_p20', '50% 50%')], 11)
OUT.append((s, M(s, 'AOF-11', '공간 사진 모자이크 6 + 공간 · 제품 범례', '오피스 여섯 공간과 놓이는 제품을 한 장에 보여 줄 때', 'dss', 'scenario', 'OF', G['OF'].format('03 공간별 제안'), '03 · 공간별 제안', '오피스 공간별 제안', req=['spaces', 'products', 'images'], prods=['led_indoor', 'wf4way', 'book', 'thewall', 'flip', 'airdresser', 'purifier'])))

s = space_map('L_AOF_23', 'OF', '03 · 공간별 제안', 'AI 오피스 Map', '공간마다 놓이는 삼성 제품을 한 장에 정리했습니다', [
    [(1, '로비', [('스마트 LED<br>사이니지', '@of_c_led')]),
     (2, '사무실', [('무풍<br>시스템에어컨', C4WAY), ('고해상도<br>뷰피니티 모니터', '@of_c_monitor'), ('갤럭시 북5<br>시리즈', '@of_c_book'), ('디지털 복합기<br>MX 시리즈', 'img/fill/sol-b.json#20')])],
    [(3, '대형회의실', [('The Wall', CWALL)]), (4, '중소형회의실', [('Flip Pro<br>전자칠판', 'img/fill/sol-b.json#21')]), (5, '회의실', [('갤럭시 탭<br>S10 시리즈', '@of_c_tab')]),
     (6, '직원휴게실', [('Bespoke AI<br>하이브리드', '@of_c_hybrid'), ('Bespoke<br>에어드레서', CDRESS), ('Infinite AI<br>공기청정기', CPUR)])]], 23)
OUT.append((s, M(s, 'AOF-23', 'AI 오피스 Map · 공간 × 제품 컷', '공간별 제안을 마치며 공간마다 놓이는 제품을 한 장에 정리할 때', 'bom', 'dss', 'OF', G['OF'].format('03 공간별 제안'), '03 · 공간별 제안', 'AI 오피스 Map', req=['spaces', 'products', 'images'], prods=['led_indoor', 'wf4way', 'book', 'thewall', 'flip', 'airdresser', 'purifier'])))

s = biot_stack('L_AOF_26', 'OF', '04 · 오피스 솔루션', '효율적인 빌딩 통합 관리', '빌딩 내부의 다양한 설비와 시스템을 연계시켜 하나의 통합된 플랫폼에서 모니터링하고 관제할 수 있습니다.', [
    ('b.IoT DT', '(digital-twin)', '@of_biot_dt'), ('b.IoT Enterprise /<br>Energy', '(BEMS/ZEB)', '@of_biot_ent'), ('모바일 앱 (PEMS)', '(Personal Environment<br>Management System)', '@of_biot_app')],
    ['DDC', 'DMS', 'DDC', 'DDC (Wireless)'], [
    ('공조설비 / 유틸리티', '흡수식 냉동기 · 펌프 · 냉각탑 · 공조기 · 팬코일유닛', '@of_eq_hvac'), ('시스템에어컨 / 히트펌프', '온수 탱크 · 시스템 에어컨 · 빌딩용 실외기', '@of_eq_sac'),
    ('신재생에너지 / 유틸리티', 'PV / ESS 전력설비', '@of_eq_pv'), ('LED / 조명', '조명 시스템 (무선)', '@of_eq_led')], 26, 'Samsung b.IoT 통합 플랫폼')
OUT.append((s, M(s, 'AOF-26', '플랫폼 3 · 통합 버스 · 컨트롤러 · 설비군 4 계층도', '여러 설비를 하나의 플랫폼으로 묶는 구조를 사진과 함께 보여 줄 때', 'solution', 'dss', 'OF', G['OF'].format('04 오피스 솔루션'), '04 · 오피스 솔루션', '효율적인 빌딩 통합 관리', req=['solutions', 'images'], sols=['biot'])))

s = open_protocol('L_AOF_27', 'OF', '04 · 오피스 솔루션', '오픈 프로토콜 기반 다양한 설비 / IT 기기 통합 관리', '개방형 프로토콜을 통해 다양한 건물, 공장, 설비를 손쉽게 연결할 수 있습니다.',
                  '오픈 프로토콜을 통한<br>다양한 기기<br>통합 관제', '@of_biot_mon', 'Samsung b.IoT', 'MES / FEMS', 'BACnet · Modbus<br>OPC-UA · KNX<br>XML / MQTT · Open API', [
    ('계측장비 / 제어기', 'Modbus', '@of_dev_meter'), ('시스템에어컨', 'BACnet', '@of_eq_sac'), ('무선 조명', 'Wireless', '@of_dev_light')], 27)
OUT.append((s, M(s, 'AOF-27', '메시지 패널 + 가운데 관제 화면 · 외부 시스템 · 하단 기기 3', '개방형 연결 구조(프로토콜 · 연결 기기)를 한 장에 보여 줄 때', 'solution', 'dss', 'OF', G['OF'].format('04 오피스 솔루션'), '04 · 오피스 솔루션', '오픈 프로토콜 기반 통합 관리', req=['solutions', 'images'], sols=['biot'])))

s = algo_seven('L_AOF_28', 'OF', '04 · 오피스 솔루션', 'AI 알고리즘을 통한 건물 에너지 효율화', 'AI 기반 알고리즘으로 공조기기에 최적화된 에너지 절감 제어를 실현합니다.', [
    ('temp', '데이터 기반<br>쾌적 제어', '8대 기후대 데이터 분석을 통한 ' + BB('쾌적 온도 산출 및 실내 온도 자동 설정')),
    ('clock', '변동 요금제<br>대응 제어', '시간대별로 변동하는 요금 체계 대응을 위해 ' + BB('실내 설정 온도 제어')),
    ('calendar', '학습 기반 예냉 · 예열<br>절전 제어', '공간 열 특성 학습 기반 ' + BB('예냉 · 예열 운전 시간 최적화')),
    ('wind', '실외기 고효율<br>운전 제어', '실내기 운전 데이터를 통해 ' + BB('실내 부하 예측 및 실외기 운전 효율 향상')),
    ('trend', '목표 대응<br>제어', '전체 전력 소비량이 목표를 초과하지 않도록 ' + BB('실내기 개별 절감 제어')),
    ('alert', '비효율 운전<br>검지 및 알림', '실내기의 운전 데이터 분석 후 ' + BB('에너지 낭비 요소 검지 및 가이드')),
    ('split', '에너지<br>분배', '에어컨 냉온수 설비의 에너지 소비량을 ' + BB('Tenant(존, 부서 등)별 효율적 분배'))],
    '현장 상황에 맞는 알고리즘 적용으로 에너지 절감 실현', '@of_bldg', 28)
OUT.append((s, M(s, 'AOF-28', 'AI 알고리즘 7단계 카드 + 사진 결론 띠', '에너지 절감 알고리즘 일곱 가지를 한 줄로 보여 주고 결론을 강조할 때', 'solution', 'effect', 'OF', G['OF'].format('04 오피스 솔루션'), '04 · 오피스 솔루션', 'AI 알고리즘을 통한 건물 에너지 효율화', req=['solutions', 'kpis', 'images'], sols=['biot'])))

# ============================== 아파트
s = space_overview('L_AAP_11', 'AP', '03 · 공간별 제안', '아파트 공간별 시나리오', '침실 · 주방 · 거실 · 드레스룸 · 세탁실 — 다섯 공간, 열 개 제품', [
    ('침실', ['Infinite AI 무풍 시스템에어컨', '갤럭시 링'], '@ap_p12', '50% 50%'),
    ('주방', ['Bespoke 냉장고 · 냉동고 · 김치플러스 1도어 키친핏', 'Infinite AI 인덕션', 'Bespoke AI 식기세척기'], '@ap_p14', '50% 50%'),
    ('거실', ['Neo QLED 8K', 'Bespoke AI 스팀 울트라', 'Infinite AI 공기청정기'], '@ap_p17', '50% 50%'),
    ('드레스룸', ['Bespoke 에어드레서'], 'img/fill/ais-b.json#3', '50% 50%'),
    ('세탁실', ['Bespoke AI 콤보'], '@ap_p21', '50% 50%')], 11)
OUT.append((s, M(s, 'AAP-11', '공간 사진 모자이크 5 + 공간 · 제품 범례', '세대의 다섯 공간과 놓이는 제품을 한 장에 보여 줄 때', 'dss', 'scenario', 'RS', G['AP'].format('03 공간별 제안'), '03 · 공간별 제안', '아파트 공간별 시나리오', req=['spaces', 'products', 'images'], prods=['wf1way', 'bi_fridge', 'bi_induction', 'bi_dish', 'purifier', 'airdresser', 'laundry'])))

s = space_map('L_AAP_22', 'AP', '03 · 공간별 제안', 'AI 아파트 Map', '공간마다 놓이는 삼성 제품을 한 장에 정리했습니다', [
    [(1, '침실', [('Infinite AI 무풍<br>시스템에어컨', C1WAY), ('갤럭시 링', '@ap_c_ring')]),
     (2, '주방', [('Bespoke 냉장고 · 냉동고 ·<br>김치플러스 1도어 키친핏', '@ap_c_kfit'), ('Infinite AI<br>인덕션', '@ap_c_induction'), ('Bespoke AI<br>식기세척기', '@ap_c_dish')])],
    [(3, '거실', [('Neo QLED 8K', '@ap_c_tv'), ('Bespoke AI<br>스팀 울트라', '@ap_c_steam'), ('Infinite AI<br>공기청정기', CPUR)]),
     (4, '드레스룸', [('Bespoke<br>에어드레서', CDRESS)]), (5, '세탁실', [('Bespoke AI<br>콤보', '@ap_c_combo')])]], 22)
OUT.append((s, M(s, 'AAP-22', 'AI 아파트 Map · 공간 × 제품 컷', '공간별 제안을 마치며 공간마다 놓이는 제품을 한 장에 정리할 때', 'bom', 'dss', 'RS', G['AP'].format('03 공간별 제안'), '03 · 공간별 제안', 'AI 아파트 Map', req=['spaces', 'products', 'images'], prods=['wf1way', 'bi_fridge', 'bi_induction', 'bi_dish', 'purifier', 'airdresser', 'laundry'])))

s = st_home('L_AAP_25', 'AP', '04 · 아파트 솔루션', '스마트싱스 홈 (SmartThings Home)', 'SmartThings를 통해 집 안의 가전 제어는 물론 단지의 다양한 서비스까지 앱 하나로 편리하게 사용할 수 있습니다.',
            '@ap_home_phone', ('@ap_home_l', ['아파트 공용부 서비스', '단지 정보', '세대 맵뷰 서비스']), ('@ap_home_r', ['우리집 생활 정보', '라이프스타일 맞춤 자동화 모드', '가전제품 · 세대 기기 제어']), 25, 'SmartThings 앱 하나로')
OUT.append((s, M(s, 'AAP-25', '가운데 휴대폰 화면 + 양옆 서비스 화면 · 기능 목록', '앱 하나로 쓰는 서비스들을 화면과 함께 보여 줄 때', 'solution', None, 'RS', G['AP'].format('04 아파트 솔루션'), '04 · 아파트 솔루션', '스마트싱스 홈', req=['solutions', 'images'], sols=['smartthings'])))

s = complex_link('L_AAP_26', 'AP', '04 · 아파트 솔루션', '단지 홈네트워크와 연동', 'SmartThings는 아파트에서 사용하는 단지 내 홈네트워크와 연동 가능하여 다양한 편의 기능들을 탑재할 수 있습니다.',
                 ('세대 홈 IoT', 'SmartThings Cloud', '@ap_iot', [('스마트 가전', 'TV, 냉장고, 세탁기, 에어컨, 청정기 등'), ('IoT 센서 & 기기', '커튼, 침대, 센서, 카메라, 반려동물용품 등')]),
                 ('단지 홈네트워크', '홈네트워크 Cloud', '@ap_wallpad', [('아파트 세대부 · 월패드', '조명, 난방, 환기, 엘리베이터'), ('아파트 공용부 · 커뮤니티', '택배, 주차관제, 원격검침')]),
                 '@ap_home_phone', '세대 홈 IoT ↔ 단지', 26)
OUT.append((s, M(s, 'AAP-26', '세대 홈 IoT ↔ 휴대폰 ↔ 단지 홈네트워크 연동도', '두 시스템(세대 · 단지)이 앱 하나로 이어지는 구조를 보여 줄 때', 'solution', 'dss', 'RS', G['AP'].format('04 아파트 솔루션'), '04 · 아파트 솔루션', '단지 홈네트워크와 연동', req=['solutions', 'images'], sols=['smartthings'])))

s = cards_six('L_STD_CARD6', 'AP', '04 · 아파트 솔루션', '세대 내 가전 관리', 'SmartThings로 집 안의 기기들을 쉽게 연결하고, 생활 패턴에 맞춰 조건을 설정해 두면 여러 기기들을 편리하게 제어할 수 있습니다.', [
    ('주방 자동화 모드', '유해물질을 관리하는 안심 솔루션', '요리 시 발생하는 유해물질을 에어모니터가 실시간 센싱하여 스마트 후드를 자동 작동시킵니다.', '@ap_auto_kitchen'),
    ('에어케어 모드', '공간별 24시간 빈틈없는 자동 공기청정 솔루션', '에어모니터를 통한 정확한 공기질 센싱으로 일정 수치 이상 측정 시 공기청정기를 자동 작동시킵니다.', '@ap_auto_air'),
    ('스터디 모드', '학습에 최적화된 공부방 솔루션', 'LED 스탠드를 켜면 공부에 방해되지 않도록 에어케어 제품의 무풍 모드가 자동 적용됩니다.', '@ap_auto_study'),
    ('시네마 모드', '공간의 분위기를 한 번에 영화관으로 전환', '영화 모드 적용 시 TV와 사운드바가 자동 작동되며, 영화 감상에 알맞은 최적의 조명이 세팅됩니다.', '@ap_auto_cinema'),
    ('에너지 세이빙 모드', '전기요금 걱정 없이 에너지 관리 · 완충 후 대기전력 완전 차단', '절전 모드 적용 시 가전제품을 일일이 제어할 필요 없이 일괄 자동 OFF 되어, 새는 전기요금을 절약해 줍니다.', '@ap_auto_energy'),
    ('쾌적 수면 모드', '깊은 숙면을 위한 쾌적 온습도 및 조명 환경 구성', '취침 모드 적용 시 시스템에어컨은 쾌적 / 수면 모드로 자동 전환되며 LED 조명이 꺼집니다.', '@ap_auto_sleep')], 27, note='')
OUT.append((s, M(s, 'STD-CARD6', '사진 카드 6 (3 × 2) · 모드 칩 + 한 줄 요약 + 설명', '여섯 가지 자동화 · 서비스 시나리오를 사진과 함께 나란히 보여 줄 때', 'solution', 'scenario', 'RS', G['AP'].format('04 아파트 솔루션'), '04 · 아파트 솔루션', '세대 내 가전 관리', req=['solutions', 'images'], sols=['smartthings'])))
