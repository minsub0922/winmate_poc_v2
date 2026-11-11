# -*- coding: utf-8 -*-
"""Solution data for the 04 chapter: display names, headlines, one-line summaries, images (media codes), catalog mapping."""

def media(code):
    """media.json image code → packed address"""
    pack = ['img/media/g0.json', 'img/media/g1.json', 'img/media/t.json'][code // 10000]
    return f'{pack}#{code % 10000}'


# sid -> (short name, headline template ({place}), one-line summary, catalog S id or None)
SOL = {
    's_stp': ('SmartThings Pro', 'SmartThings Pro — {place} 기기를 한 화면에서 관리합니다', '시스템에어컨 · 가전 · 디스플레이 · 센서를 클라우드로 묶어 원격 관리 · 자동화 · AI 에너지 절약까지', 'stpro'),
    's_safety': ('안전관리 솔루션', '안전관리 솔루션 — 현장 근무자의 위험을 먼저 알립니다', 'SmartThings Pro와 갤럭시 워치 LTE로 근무자의 위험을 감지하고 관리자에게 바로 알리는 산업 안전 솔루션', 'safety'),
    's_biot': ('b.IoT', 'b.IoT — {place} 설비와 에너지를 통합 관제합니다', '시스템에어컨 · 중앙공조 · 기계설비 · 조명 · 에너지 미터를 하나로 묶는 빌딩 통합 관제', 'biot'),
    's_dms': ('DMS 2.5', 'DMS 2.5 — 시스템에어컨을 한 곳에서 중앙 제어합니다', '실내기 · ERV 최대 256대를 중앙에서 제어하는 시스템에어컨 전용 제어기 — 피크 제어 · 요금 분배 · 스케줄', 'sac'),
    's_touch': ('터치 중앙 제어기', '터치 중앙 제어기 2.0 — 실내기를 터치 한 번으로 관리합니다', '10인치급 터치 화면으로 실내기 최대 128대를 제어하는 중소 건물용 중앙 제어기', 'sac'),
    's_wifi': ('Wi-Fi KIT', 'Wi-Fi KIT — 스마트폰 앱으로 냉난방을 원격 제어합니다', '실내기 최대 16대를 스마트싱스 앱으로 원격 제어하는 소규모 매장 · 사무실 · 주택용 키트', 'sac'),
    's_sthome': ('스마트싱스 홈', '스마트싱스 홈 — 세대 가전과 공용 시설을 앱 하나로', '세대 가전과 단지 공용 시설을 앱 · 월패드 · TV로 통합 제어하는 주거 IoT 솔루션', 'smartthings'),
    's_vxt': ('VXT CMS', 'VXT CMS — {place} 화면 콘텐츠를 클라우드로 운영합니다', '콘텐츠 제작(Canvas) · 운영(CMS) · 원격 관리(RM)를 한 번에 하는 클라우드 사이니지 CMS', 'vxt'),
    's_magic': ('MagicINFO', 'MagicINFO — 데이터와 연동한 화면을 안전하게 운영합니다', '콘텐츠 제작 · 스케줄 · 데이터 연동 · 원격 관리 · 성과 분석을 제공하는 사이니지 CMS (ISO27001 · 27701)', 'magicinfo'),
    's_lynk': ('LYNK Cloud', 'LYNK Cloud — {place} TV를 클라우드로 관리합니다', 'TV를 클라우드로 원격 관리하고 맞춤 콘텐츠 · 게스트 서비스 · 데이터 마케팅을 제공하는 솔루션', 'lynk'),
    's_knox': ('Knox', 'Knox — 업무용 갤럭시 기기를 안전하게 배포 · 관리합니다', '갤럭시 업무 기기의 보안 · 대량 설정 · 원격 관리 · 현장 업무 도구를 제공하는 모바일 엔터프라이즈 솔루션', 'knoxsuite'),
    's_health': ('삼성헬스', '삼성헬스 — 워치 건강 데이터로 케어 서비스를 연결합니다', '갤럭시 워치 · 삼성헬스 데이터를 사용자 동의 기반으로 파트너 서비스에 연동하는 SDK 솔루션', None),
    's_class': ('갤럭시 클래스룸', '갤럭시 클래스룸 — 교실 기기를 수업 흐름에 맞춰 관리합니다', '수업용 기기 관리(Knox Classroom)와 Knox Configure · 무상 서비스 연장을 묶은 교육 패키지', 'knoxsuite'),
    's_bookee': ('갤럭시 북 EE', '갤럭시 북 EE — 출고 전 사전 구성으로 바로 쓰는 업무 PC', '기업 OS 이미지 · BIOS · 자산 태그를 출고 전에 적용하고 Knox 보안 · vPro 원격 관리를 갖춘 업무용 PC', None),
    's_dex': ('삼성 DeX', '삼성 DeX — 휴대폰 하나로 PC 업무와 화상 회의까지', '갤럭시 스마트폰 · 태블릿을 모니터 · TV에 연결해 PC처럼 쓰고 회의실에서 화상 회의를 여는 기능', 'dex'),
    's_counthru': ('CounThru', 'CounThru — 흩어진 출력 장비와 비용을 중앙에서 관리합니다', '출력 장비의 상태 · 장애 · 소모품 · 비용을 중앙에서 관리하는 통합 출력 관리 솔루션', None),
    's_secuthru': ('SecuThru', 'SecuThru — 인증 · 실명제 · 로그로 출력물 유출을 막습니다', '사용자 인증 · 출력물 실명제 · 출력 로그 · 개인정보 검출로 종이 문서 유출을 막는 출력 보안 솔루션', None),
    's_pos': ('갤럭시 탭 POS', '갤럭시 탭 POS — 주문부터 결제까지 태블릿 하나로', '갤럭시 탭과 파트너 POS · 테이블 오더 앱을 결합한 매장 주문 · 결제', 'partnerapp'),
    's_hospital': ('병원 안내 · 업무 솔루션', '병원 안내 · 업무 솔루션 — 대기부터 병동까지 연결합니다', '대기 · 위치 안내 사이니지와 원무 · 병동 태블릿 업무 솔루션', 'partnerapp'),
    's_field': ('현장 업무 솔루션', '현장 업무 솔루션 — 스캔 · 무전 · 점검을 갤럭시로', '태블릿 · 스마트폰 바코드 · RFID 스캔과 갤럭시 워치 기반 현장 커뮤니케이션', 'knoxcapture'),
    's_meeting': ('회의실 예약 솔루션', '회의실 예약 솔루션 — 예약 · 체크인 · 사용 분석을 한 번에', '회의실 안팎 갤럭시 탭으로 예약 현황 · 즉석 예약 · 체크인을 처리하는 구독형 공간 관리', None),
    'svc_sac': ('에어컨 케어 서비스', '삼성케어플러스 SAC — 점검 · 세척 · 원격케어로 공조를 지킵니다', '정기점검 · 수리 · 출동 · 단계별 세척 · 원격케어 · 에너지 진단을 묶은 공조 유지관리 서비스', 'care'),
    'svc_mobile': ('삼성케어플러스 비즈니스', '삼성케어플러스 비즈니스 — 업무 기기 수리 걱정을 덜어 줍니다', '업무용 스마트폰 · 태블릿의 무상수리 보증을 늘리고 수리 이력을 대시보드로 관리하는 서비스', 'care'),
}

# images per solution layout slot (media codes or plain addresses); group-specific overrides by vertical group
IMGS = {
    's_stp': {'img0': [85]},
    's_safety': {'img0': [129]},
    's_biot': {'img0': [179]},
    's_dms': {'img0': [333]},
    's_touch': {'img0': [327]},
    's_wifi': {'img0': [338]},
    's_sthome': {'img0': [113]},
    's_vxt': {'img0': [35], 'img1': [59], 'img2': [61]},
    's_magic': {'img0': [11]},
    's_lynk': {'img0': [224]},
    's_knox': {'img0': [240]},
    's_health': {'img0': ['img/prod/g03.json#14']},
    's_class': {'img0': ['img/ph/ed-tab-exam.jpg']},
    's_bookee': {'img0': ['img/prod/g03.json#38']},
    's_dex': {'img0': [266], 'img1': [272]},
    's_counthru': {'img0': [346]},
    's_secuthru': {'img0': [344]},
    's_pos': {'img0': [352], 'img1': [353]},
    's_hospital': {'img0': [354]},
    's_field': {'img0': [262]},
    's_meeting': {'img0': [242]},
    'svc_sac': {'img0': [220]},
    'svc_mobile': {'img0': [213]},
}
GROUP_IMGS = {
    ('s_stp', 'HT'): {'img0': [109]}, ('s_stp', 'FB'): {'img0': [98]}, ('s_stp', 'RT'): {'img0': [97]}, ('s_stp', 'SV'): {'img0': [104]},
    ('s_stp', 'OF'): {'img0': [101]}, ('s_stp', 'RS'): {'img0': [112]}, ('s_stp', 'MD'): {'img0': [102]}, ('s_stp', 'MF'): {'img0': [102]},
    ('s_biot', 'ED'): {'img0': [199]}, ('s_biot', 'MF'): {'img0': [192]}, ('s_biot', 'RT'): {'img0': [192]},
    ('s_vxt', 'FB'): {'img0': [56], 'img1': [39], 'img2': [61]}, ('s_vxt', 'MD'): {'img0': [26], 'img1': [59], 'img2': [65]},
    ('s_magic', 'FB'): {'img0': [4]}, ('s_magic', 'RT'): {'img0': [7]}, ('s_magic', 'ED'): {'img0': [13]}, ('s_magic', 'PB'): {'img0': [14]},
    ('s_magic', 'MD'): {'img0': [15]}, ('s_magic', 'TP'): {'img0': [10]},
    ('s_knox', 'MF'): {'img0': [243]}, ('s_knox', 'FN'): {'img0': [244]}, ('s_knox', 'PB'): {'img0': [244]},
    ('s_field', 'PB'): {'img0': [255]},
}
# small thumbnail (for the needs/tech image) per solution — card thumbnails in img/media/t.json
THUMB = {'s_stp': 20003, 's_safety': 20004, 's_biot': 20006, 's_dms': 20014, 's_touch': 20014, 's_wifi': 20014, 's_sthome': 20005,
         's_vxt': 20001, 's_magic': 20000, 's_lynk': 20008, 's_knox': 20009, 's_dex': 20011, 's_counthru': 20015, 's_secuthru': 20015,
         's_pos': 20016, 's_hospital': 20016, 's_field': 20010, 's_meeting': 20009, 'svc_sac': 20007, 'svc_mobile': 20007}

# feature descriptions for features the catalog lists without one (used by feature-mode layouts)
DESC = {
    's_wifi.remote.unit': '실내기마다 따로 켜고 끄며 온도를 맞춥니다',
    's_wifi.remote.group': '구역별로 묶은 실내기를 한 번에 제어합니다',
    's_wifi.remote.sched': '요일 · 시간표에 맞춰 냉난방을 예약합니다',
    's_wifi.smart.voice': '빅스비 음성으로 냉난방을 켜고 끕니다',
    's_dex.desktop.monitor': '휴대폰을 모니터 · TV에 연결해 PC처럼 씁니다',
    's_hospital.guide.wayfinding': '병원 곳곳의 화면으로 진료과 · 검사실 위치를 안내',
    's_meeting.ops.realtime': '예약 상태를 실시간으로 갱신하고 다중 예약을 처리',
    's_class.lesson.view': '교사가 학생 화면을 실시간으로 확인합니다',
    's_class.lesson.lock': '수업 중 학생 기기를 잠그고 음소거합니다',
    's_class.lesson.share': '교사 화면을 학생 기기로 바로 공유합니다',
    's_class.lesson.app': '수업 앱 · 웹을 원격으로 실행하거나 잠급니다',
    's_class.lesson.engage': '학생 화면 공유와 손 들기로 수업에 참여합니다',
    's_class.lesson.assign': '공지와 과제를 학생 기기로 바로 보냅니다',
    's_class.device.central': '학생 기기를 한 곳에서 관리합니다',
    's_class.device.integrate': '기존 MDM · 학습관리도구와 연동합니다',
    's_class.device.configure': 'Knox Configure로 학교 맞춤 설정을 적용합니다',
    's_class.account.edu': '교육용 삼성 계정 포털로 계정을 관리합니다',
    's_class.account.google': '구글 교육 계정과 연동합니다',
    's_pos.order.counter': '카운터 갤럭시 탭과 POS로 주문 · 결제를 한 단말에서 처리합니다',
    's_pos.order.table': '테이블마다 놓인 갤럭시 탭으로 손님이 자리에서 바로 주문합니다',
    's_meeting.ops.brand': 'Knox Configure로 회의실 태블릿을 브랜드 화면으로 맞춥니다',
}
