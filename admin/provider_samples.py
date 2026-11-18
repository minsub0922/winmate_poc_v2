"""Ready-made experiment inputs for the Provider tab.

Each sample is a small, realistic version of a request Winmate really sends: the LLM samples follow the text / JSON
generation features, the decision samples use the same ``state`` + typed ``questions`` shape as ``DECISION_TASKS``.
They are only starting points — the admin edits them before running.
"""
from __future__ import annotations

RELEVANCE = ['관계없음 — 요청과 다른 용도', '약함 — 일부 조건만 맞음', '적합 — 주요 조건이 맞음', '매우 적합 — 요청에 그대로 쓸 수 있음']

LLM_SAMPLES = [
    {'id': 'ping', 'title': '짧은 응답 (속도 확인)', 'feature': '연결 · 기본 지연 확인', 'json': False, 'max_tokens': 1024, 'temperature': 0.2,
     'system': '당신은 삼성전자 B2B 영업을 돕는 Winmate의 AI입니다. 한국어로 간결하게 답합니다.',
     'user': 'Winmate가 무엇을 도와주는지 한 문장으로 말해 주세요.'},
    {'id': 'rfp-requirements', 'title': 'RFP 요구사항 추출', 'feature': '고객 문서 분석 → 요구사항 (JSON)', 'json': True, 'max_tokens': 4096, 'temperature': 0.2,
     'system': ('고객 제안요청서에서 제안서에 반영할 요구사항을 뽑습니다. 문서에 없는 내용은 만들지 않습니다.\n'
                '출력은 JSON 하나: {"customer": 문자열, "industry": 문자열, "requirements": [{"id": "R1", "text": 문자열, '
                '"category": "제품"|"설치"|"운영"|"예산"|"일정", "priority": "필수"|"권장", "quote": 원문 인용}]}'),
     'user': ('[제안요청서 발췌]\n발주처: 한빛호텔 (객실 240실, 연회장 3개, 2027년 3월 리뉴얼 오픈)\n'
              '1. 전 객실 TV를 55형 이상 호텔 전용 TV로 교체하고, 객실 관리 시스템(PMS)과 연동하여 환영 메시지와 체크아웃 안내를 표시할 것.\n'
              '2. 로비와 연회장 입구에 행사 안내용 사이니지를 설치하되, 콘텐츠는 본사에서 원격으로 일괄 변경할 수 있어야 함.\n'
              '3. 객실 냉난방은 개별 제어가 가능하고 공실 시 자동 절전되어야 하며, 기존 대비 에너지 사용량 15% 이상 절감 근거를 제시할 것.\n'
              '4. 설치는 영업을 중단하지 않고 층별로 진행하며 2027년 2월 20일까지 완료할 것.\n'
              '5. 예산은 부가세 포함 18억 원 이내. 5년 유지보수 조건이 포함되면 가점.')},
    {'id': 'search-expand', 'title': '검색 요청 해석', 'feature': '레이아웃 · 제품 검색 질의 확장 (JSON)', 'json': True, 'max_tokens': 2048, 'temperature': 0.2,
     'system': ('영업 담당자의 한 줄 요청을 제안서 자료 검색 조건으로 바꿉니다.\n'
                '출력은 JSON 하나: {"query": 핵심 검색어, "industry": 업종 또는 null, "part": "표지"|"고객 이해"|"솔루션 제안"|"도입 효과"|"사례"|null, '
                '"products": [제품군], "must": [꼭 들어가야 할 조건], "expanded": [동의어 · 관련어 최대 6개]}'),
     'user': '프랜차이즈 카페 매장에 메뉴보드랑 키오스크 같이 제안하는 장표, 매출 효과 숫자가 보이는 걸로'},
    {'id': 'slide-copy', 'title': '장표 문안 작성', 'feature': '제안서 장 내용 채우기 (JSON)', 'json': True, 'max_tokens': 4096, 'temperature': 0.5,
     'system': ('삼성전자 B2B 제안서의 한 장을 채웁니다. 과장하지 않고, 주어진 제품 정보 밖의 사양 · 수치는 쓰지 않습니다.\n'
                '출력은 JSON 하나: {"headline": 28자 이내, "subhead": 45자 이내, "points": [{"title": 14자 이내, "body": 60자 이내} × 3], "closing": 40자 이내}'),
     'user': ('고객: 서울 강남의 치과 체인 (지점 12곳, 대기실 혼잡 민원)\n장: 솔루션 제안 — 대기실 경험 개선\n'
              '선택한 제품: 스마트 사이니지 QMC 43형(대기 순번 · 진료 안내 표시, 24시간 연속 사용), 삼성 VXT(여러 지점 콘텐츠 원격 관리), '
              '무풍 시스템에어컨 1Way(직바람 없는 냉방)\n고객이 강조한 점: 지점마다 안내 화면이 제각각이라 본사에서 통일하고 싶다.')},
    {'id': 'review', 'title': '제안서 검토 의견', 'feature': '제안서 검토 (JSON)', 'json': True, 'max_tokens': 4096, 'temperature': 0.2,
     'system': ('고객사 구매 담당자의 눈으로 제안서 초안을 검토합니다. 근거가 초안에 있는 지적만 합니다.\n'
                '출력은 JSON 하나: {"score": 0~100 정수, "strengths": [문자열 최대 3개], "issues": [{"where": 장 이름, "problem": 문자열, '
                '"fix": 고칠 방법, "severity": "높음"|"중간"|"낮음"}]}'),
     'user': ('[제안서 초안 요약]\n1장 표지: "스마트 오피스 제안" (고객사 이름 없음)\n'
              '2장 고객 이해: 하이브리드 근무 확대로 회의실 부족 — 근거 자료 없음\n'
              '3장 솔루션: 삼성 플립 Pro 75형 8대, 인터랙티브 디스플레이로 화상회의 품질 개선. 설치 위치 미정.\n'
              '4장 도입 효과: "회의 효율 대폭 향상" — 수치 없음\n5장 견적: 총액만 표기, 유지보수 조건 없음\n'
              '[고객 요구] 회의실 12개 중 8개 우선 적용, 기존 화상회의 장비(Webex)와 호환, 3년 무상 유지보수.')},
    {'id': 'storyboard', 'title': '스토리보드 구성', 'feature': '제안서 목차 · 흐름 잡기 (JSON)', 'json': True, 'max_tokens': 4096, 'temperature': 0.4,
     'system': ('고객 상황에 맞는 제안서 흐름을 6장으로 구성합니다.\n'
                '출력은 JSON 하나: {"title": 제안서 제목, "slides": [{"no": 1, "part": "표지"|"고객 이해"|"솔루션 제안"|"도입 효과"|"사례"|"Why Samsung", '
                '"message": 그 장의 핵심 한 문장, "evidence": 넣을 근거 자료}]}'),
     'user': '고객: 물류센터 3곳을 운영하는 중견 유통사. 요구: 작업장 안내 · 안전 공지를 실시간으로 바꾸고 싶고, 여름철 작업장 온도 민원이 많다. 예산은 단계 도입 선호.'},
    {'id': 'spatial-command', 'title': '조감도 명령 해석', 'feature': '조감도 스튜디오 명령 (JSON)', 'json': True, 'max_tokens': 2048, 'temperature': 0.1,
     'system': ('공간 조감도 편집 명령을 조작 목록으로 바꿉니다. 조작은 add · move · rotate · duplicate · delete 중 하나입니다.\n'
                '출력은 JSON 하나: {"operations": [{"action": 문자열, "target": 대상 이름, "room": 공간 이름 또는 null, "count": 정수, '
                '"direction": "left"|"right"|"forward"|"back"|null, "distance_m": 숫자 또는 null, "angle_deg": 숫자 또는 null}], "unclear": [확인이 필요한 점]}'),
     'user': ('공간: 로비, 대회의실, 소회의실 A, 휴게 라운지\n배치된 것: @플립 Pro 85형(대회의실), @사이니지 QBC 55형(로비), @회의 테이블(대회의실)\n'
              '명령: 대회의실 플립을 창가 쪽으로 2미터 옮기고 소회의실 A에도 같은 걸 한 대 놓아줘. 로비 사이니지는 90도 돌려줘.')},
    {'id': 'simulation', 'title': '고객 응대 시뮬레이션', 'feature': '영업 시뮬레이션 대화 (텍스트)', 'json': False, 'max_tokens': 2048, 'temperature': 0.7,
     'system': ('당신은 중소 병원의 총무팀장 역할입니다. 예산에 민감하고, 설치 중 진료 차질을 가장 걱정합니다. 영업 담당자의 말에 '
                '실제 고객처럼 2~4문장으로 답하고, 마지막에 구체적인 질문 하나를 합니다.'),
     'user': '안녕하세요, 삼성전자 B2B 담당입니다. 지난번 말씀하신 대기실 디스플레이와 냉난방 교체 건으로 제안서를 준비해 왔습니다. 먼저 전체 일정부터 설명드려도 될까요?'},
    {'id': 'long-summary', 'title': '긴 문서 요약', 'feature': '첨부 원문 요약 (긴 입력 지연 확인)', 'json': False, 'max_tokens': 2048, 'temperature': 0.2,
     'system': '고객 회의록을 읽고, 제안서에 반영할 결정 사항과 남은 쟁점을 각각 3줄 이내의 한국어 목록으로 정리합니다.',
     'user': ('[회의록] 참석: 고객사 시설팀 · 구매팀 · IT팀, 삼성전자 영업 · 기술지원.\n' + '\n'.join(
         f'{i}. {line}' for i, line in enumerate([
             '시설팀은 본관 1~4층 사무 공간의 노후 천장형 에어컨 62대를 내년 상반기까지 교체하기를 원한다. 층별로 주말에만 공사할 수 있다.',
             '구매팀은 초기 비용보다 5년 총소유비용 비교표를 요구했다. 렌탈 · 구독 방식 견적도 함께 받기를 원한다.',
             'IT팀은 회의실 예약 시스템과 디스플레이 연동을 질문했다. 현재 Microsoft 365를 쓰고 있으며 별도 서버 설치는 불가하다.',
             '회의실 14곳 중 대형 4곳은 화상회의용 카메라 · 마이크 일체형 구성을 원하고, 소형 10곳은 무선 화면 공유만 되면 된다.',
             '로비 안내 사이니지는 방문객 동선에 맞춰 3대를 두되, 화재 등 비상 상황에 전체 화면으로 안내가 바뀌어야 한다.',
             '시설팀은 냉난방 중앙 제어와 층별 전력 사용량 화면을 요청했다. 기존 BEMS와의 연동 방식은 다음 회의에서 확인한다.',
             '구매팀은 납기 지연 시 위약 조건을 계약서에 넣겠다고 했다. 삼성 측은 설치 인력 일정 확인 후 답하기로 했다.',
             '보안 정책상 외부 클라우드에 영상이 저장되면 안 된다. 원격 관리 솔루션의 데이터 저장 위치 자료를 제출하기로 했다.',
             '경쟁사 제안은 이미 한 곳에서 받았으며 가격이 낮지만 유지보수 거점이 지방에 없다는 점을 고객이 우려했다.',
             '다음 회의는 2주 뒤이며, 그 전에 층별 설치 도면 초안과 총소유비용 비교표를 보내기로 했다.'], 1)) * 3)},
]

DECISION_SAMPLES = [
    {'id': 'search-rerank', 'title': '검색 결과 관련도', 'task': 'search.rerank', 'feature': '레이아웃 검색 재순위 (score × 4)',
     'state': {'search_request': {'query': '카페 메뉴보드 키오스크 매출 효과', 'part': '도입 효과', 'industry': '식음료 · 프랜차이즈',
                                  'products': ['스마트 사이니지', '키오스크']},
               'note': 'rule 은 검색 엔진 점수(참고용)입니다.'},
     'questions': {f'c{i}': {'type': 'score', 'instructions': {'task': '이 PPT 레이아웃 후보가 검색 요청(검색어 · 파트 · 업종 · 제품)에 맞는 정도', 'candidate': card},
                             'criteria': RELEVANCE}
                   for i, card in enumerate([
                       {'title': '매장 디지털 전환 효과 — 객단가 · 대기 시간 지표 3칸', 'part': '도입 효과', 'industry': '식음료', 'rule': 0.82},
                       {'title': '키오스크 제품 라인업 비교표', 'part': '솔루션 제안', 'industry': '공통', 'rule': 0.74},
                       {'title': '호텔 객실 TV 도입 사례', 'part': '사례', 'industry': '호텔', 'rule': 0.31},
                       {'title': '메뉴보드 콘텐츠 운영 흐름 + 매출 변화 그래프', 'part': '도입 효과', 'industry': '식음료 · 프랜차이즈', 'rule': 0.69}])}},
    {'id': 'layout-pick', 'title': '레이아웃 고르기', 'task': 'layout.pick', 'feature': '장마다 PPT 레이아웃 선택 (choice)',
     'state': {'customer': '한빛호텔', 'industry': '호텔 · 숙박', 'context_level': '상세',
               'slide': {'part': '솔루션 제안', 'role': '객실 TV + PMS 연동 구성 설명', 'items': 3,
                         'reqs': ['환영 메시지 표시', '체크아웃 안내', '본사 원격 관리']}},
     'questions': {'pick': {'type': 'choice', 'instructions': {'task': '이 슬라이드에 가장 맞는 PPT 레이아웃 후보',
                                                               'rules': '항목 수와 칸 수가 맞고, 장의 역할(구성 설명)에 맞는 것을 고른다.'},
                            'criteria': {'L-a': '좌측 큰 사진 + 우측 3항목 설명 — 구성 · 특장점 소개용',
                                         'L-b': '숫자 지표 4칸 — 도입 효과 강조용',
                                         'L-c': '시스템 연동 구성도 + 하단 3단계 흐름 — 연동 구조 설명용',
                                         'L-d': '고객 사례 인용 + 사진 2장 — 사례 소개용'}}}},
    {'id': 'review-route', 'title': '검토 항목 분류', 'task': 'review.route', 'feature': '제안서 검토 라우팅 (noul × 4)',
     'state': {'proposal': {'customer': '중견 유통사', 'summary': '물류센터 3곳에 안전 공지 사이니지와 대형 냉방 도입. 5장 구성, 견적은 총액만 표기.'},
               'rules': '초안에 실제로 문제가 될 근거가 있을 때만 참으로 본다.'},
     'questions': {'price': {'type': 'noul', 'instructions': '견적 · 가격 근거를 깊이 검토해야 한다.'},
                   'evidence': {'type': 'noul', 'instructions': '도입 효과의 수치 근거를 깊이 검토해야 한다.'},
                   'schedule': {'type': 'noul', 'instructions': '설치 일정 · 공사 계획을 깊이 검토해야 한다.'},
                   'design': {'type': 'noul', 'instructions': '장표 디자인 · 가독성을 깊이 검토해야 한다.'}}},
    {'id': 'catalog-rank', 'title': '제품 추천 순위', 'task': 'catalog.rank', 'feature': '카탈로그 제품 적합도 (score × 3)',
     'state': {'request': '24시간 운영하는 병원 대기실에 순번 안내용 화면. 밝은 실내, 벽걸이 설치.', 'note': '사양은 카탈로그 값입니다.'},
     'questions': {f'p{i}': {'type': 'score', 'instructions': {'task': '이 제품이 요청 조건에 맞는 정도', 'candidate': card}, 'criteria': RELEVANCE}
                   for i, card in enumerate([
                       {'name': '스마트 사이니지 QMC 43형', 'use': '24시간 연속 사용, 500nit, 벽걸이'},
                       {'name': '아웃도어 사이니지 OHA 55형', 'use': '옥외 방수 · 방진, 2500nit'},
                       {'name': '비즈니스 TV BEC-H 50형', 'use': '하루 16시간 사용, 250nit, 스탠드 · 벽걸이'}])}},
    {'id': 'spatial-command', 'title': '조감도 명령 판단', 'task': 'spatial.command', 'feature': '조감도 스튜디오 명령 (noul + choice)',
     'state': {'request': '@플립 Pro 85형 을 소회의실 A로 옮겨줘', 'references': [{'label': '플립 Pro 85형', 'kind': 'object', 'room': '대회의실'}],
               'rooms': ['로비', '대회의실', '소회의실 A', '휴게 라운지'], 'focusedRoom': '대회의실'},
     'questions': {'multi': {'type': 'noul', 'instructions': '이 문장은 조작을 둘 이상 요청한다.'},
                   'action': {'type': 'choice', 'instructions': '문장이 요청하는 조작 하나.',
                              'criteria': {'add': '새로 놓기', 'move': '옮기기', 'rotate': '돌리기', 'duplicate': '복제', 'delete': '지우기'}},
                   'room': {'type': 'choice', 'instructions': '문장이 말한 목적지 또는 대상 공간.',
                            'criteria': {'r0': '로비', 'r1': '대회의실', 'r2': '소회의실 A', 'r3': '휴게 라운지', 'none': '문장이 공간을 말하지 않는다.'}}}},
]


def samples() -> dict:
    return {'llm': LLM_SAMPLES, 'decision': DECISION_SAMPLES}
