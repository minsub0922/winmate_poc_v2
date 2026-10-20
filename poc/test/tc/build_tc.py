"""RFP 샘플 4건 + 통합 문서 1건을 TC 파일(rfp_tc.json)로 만든다.

정답 체크포인트는 Winmate 히스토리(src/seeds_rfp.js)에 정리해 두고 원문과 별도 대조까지 마친 요구사항에서 뽑았다.
매칭은 출력 텍스트를 norm()(공백 · 마크다운 제거, 소문자)한 뒤 정규식으로 한다 — 그래서 패턴에는 공백이 없다.
사용: python3 tc/build_tc.py <원문 묶음.md 또는 .txt> [--samples ../../src/rfp_samples.json]
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from rfp_pipeline import clean_markdown  # noqa: E402


def cp(i, cat, desc, *pats):
    return {'id': f'c{i:02d}', 'cat': cat, 'desc': desc, 'any': list(pats)}


DATE_612 = r'(6월12일|6/12|06월12일|06\.12|6\.12|2026-06-12|2026\.06\.12)'
PRINTER = [
    cp(1, '범위', '수량 152대', r'152대'),
    cp(2, '규격', '20 PPM 이상', r'20ppm'),
    cp(3, '규격', '양면 인쇄 필수', r'양면'),
    cp(4, '보안', 'USB 스캔 사용 불가', r'usb.{0,25}스캔|스캔.{0,25}usb'),
    cp(5, '보안', '출력물 보안 시스템 연동', r'출력물보안'),
    cp(6, '보안', '무선 접속 출력 제거', r'무선'),
    cp(7, '보안', 'IP 접속 웹 직접 출력 제거', r'(ip|웹).{0,40}출력'),
    cp(8, '인증', 'KC(전파) 인증', r'kc|전파인증'),
    cp(9, '인증', 'WHQL 드라이버', r'whql'),
    cp(10, '선정', 'BMT 85% 이상 협상적격자', r'85%'),
    cp(11, '검증', 'BMT 기기 1주일 내 배치', r'1주일|7일'),
    cp(12, '자격', '최근 5년 금융권 납품 실적', r'5년'),
    cp(13, '자격', '누적 100대 이상', r'(?<![\d,])100대'),
    cp(14, '선정', '예정가격 이하 최저가', r'예정가격'),
    cp(15, '선정', '동일가격 즉시 추첨', r'추첨'),
    cp(16, '범위', '설치비 포함 총액입찰', r'설치비|총액'),
    cp(17, '일정', '참가의향서 6/12', DATE_612),
    cp(18, '일정', '13:00 마감', r'13:00|13시'),
    cp(19, '제출', '접수 메일 주소', r'shb_ictcont@shinhan\.com'),
    cp(20, '제출', '제조사 공급 · 기술지원 확약서', r'확약서'),
    cp(21, '형식', 'PDF 1개 파일', r'pdf'),
    cp(22, '형식', '실명번호 뒤 7자리 마스킹', r'마스킹|7자리'),
    cp(23, '가격', '입찰보증금 5%', r'(?<![\d.])5%'),
    cp(24, '가격', '보증기간 30일 이상', r'30일'),
    cp(25, '가격', '1년 내 성실 이행 업체 보증금 면제', r'면제'),
    cp(26, '선정', '제안 설명 미참석 시 제안포기', r'제안포기|미참석|불참'),
    cp(27, '범위', '사업기간 12개월 내외', r'12개월'),
    cp(28, '청렴', '청렴계약', r'청렴'),
    cp(29, '유의', '공고 정보 목적 외 사용 · 제3자 공유 금지', r'제3자|목적외|공유'),
    cp(30, '자격', '부정당업자 제재', r'부정당'),
]
DESKTOP = [
    cp(1, '규격', 'Intel Ultra7 265 이상', r'ultra7|ultra-7|울트라7'),
    cp(2, '규격', '메모리 16GB', r'16gb'),
    cp(3, '규격', 'DDR5', r'ddr5'),
    cp(4, '규격', 'NVMe SSD 256GB', r'256gb'),
    cp(5, '인증', 'TPM 2.0 필수', r'tpm'),
    cp(6, '규격', 'Power 400W 이상', r'400w'),
    cp(7, '규격', 'USB 8개 이상', r'usb.{0,15}8개|8개.{0,15}usb'),
    cp(8, '규격', '1Gigabit LAN', r'1gigabit|gigabit|기가비트|1gbe|1gb'),
    cp(9, '규격', 'Windows 11 Pro', r'windows11|윈도우11|win11'),
    cp(10, '규격', 'Slim 모델 제안 불가', r'slim|슬림'),
    cp(11, '계약', '무상 유지보수 검수 후 12개월', r'12개월'),
    cp(12, '범위', '2026년 600대 이상', r'600대'),
    cp(13, '구성', '실크 인쇄', r'실크'),
    cp(14, '구성', 'Master(이미지)', r'master|마스터'),
    cp(15, '선정', '기술평가 45점 미만 제외', r'45점'),
    cp(16, '검증', '5일 이내 테스트 장비', r'5일'),
    cp(17, '검증', '호환성 검증 통과', r'호환성'),
    cp(18, '일정', '서류 제출 8/21', r'(8월21일|8/21|08/21|08\.21|8\.21)'),
    cp(19, '일정', '제안 발표 8/24', r'(8월24일|8/24|08/24|08\.24|8\.24)'),
    cp(20, '납품', '최초 납품 계약 후 12주 내', r'12주'),
    cp(21, '자격', '공동수급 불허', r'공동수급'),
    cp(22, '가격', '부가세 포함', r'부가세'),
    cp(23, '가격', '대당 단가', r'대당'),
    cp(24, '가격', '견적서 밀봉 제출', r'밀봉'),
    cp(25, '형식', 'A4 가로 파워포인트', r'a4'),
    cp(26, '형식', '모호한 표현은 미수용 간주', r'모호'),
    cp(27, '제안서', '메모리 · SSD 최대 운영기간', r'운영기간'),
    cp(28, '제안서', '로드맵 · 단종 대응', r'로드맵|단종'),
    cp(29, '제안서', '3.5인치 저장장치 추가 여부', r'3\.5인치'),
    cp(30, '제안서', '서비스센터 · 전국망', r'서비스센터|전국망'),
    cp(31, '제출', '제출처 메일', r'youngshin\.choi@samsung\.com'),
    cp(32, '선정', '동가 시 기술평가 우선', r'동가|동점|동일가격'),
    cp(33, '자격', '국가계약법 시행령 제27조', r'27조'),
]
MONITOR = [
    cp(1, '범위', '수량 980대', r'980대'),
    cp(2, '규격', '27" UHD 3840×2160', r'3840'),
    cp(3, '규격', 'Pivot', r'pivot|피벗|회전'),
    cp(4, '규격', 'Swivel', r'swivel|스위블|좌우각도'),
    cp(5, '규격', 'Tilt', r'tilt|틸트|상하각도'),
    cp(6, '규격', 'Elevation(높이)', r'elevation|높이'),
    cp(7, '규격', 'IPS 또는 VA', r'ips'),
    cp(8, '규격', '300cd/㎡ 이상', r'300cd'),
    cp(9, '규격', '응답속도 8ms 이하', r'8ms'),
    cp(10, '규격', '시야각 178°', r'178'),
    cp(11, '규격', '60Hz 이상', r'60hz'),
    cp(12, '규격', 'sRGB 90% 이상', r'srgb'),
    cp(13, '규격', 'USB-C PD', r'usb-?c'),
    cp(14, '규격', '3Port 이상', r'3port|3포트'),
    cp(15, '규격', '시력보호(플리커프리 · 블루라이트)', r'플리커|블루라이트'),
    cp(16, '규격', '별도 AC 어댑터 사용 불가', r'어댑터'),
    cp(17, '인증', 'KC · 전파인증', r'kc|전파'),
    cp(18, 'A/S', '자산스티커 부착', r'자산스티커|스티커'),
    cp(19, '구성', 'DP to DP 3M 케이블', r'dpto|3m'),
    cp(20, '규격', '컬러 Black', r'black|블랙'),
    cp(21, '선정', '가격평가 100점', r'100점'),
    cp(22, '선정', '최저가격 입찰', r'최저'),
    cp(23, '범위', '사업기간 6개월 내외', r'6개월'),
    cp(24, '자격', '금융권 모니터 납품 실적', r'금융권'),
    cp(25, '일정', '참가의향서 6/12', DATE_612),
    cp(26, '일정', '13:00 마감', r'13:00|13시'),
    cp(27, '제출', '시력보호기능 인증공문', r'인증공문'),
    cp(28, '가격', '입찰보증금 5%', r'(?<![\d.])5%'),
    cp(29, '제출', '접수 메일 주소', r'shb_ictcont@shinhan\.com'),
    cp(30, 'A/S', '무상기간 내 점검 · 수리', r'수리'),
]
KB = [
    cp(1, '범위', 'PC 연 100대', r'(?<![\d,])100대'),
    cp(2, '범위', '모니터 연 500대', r'(?<![\d,])500(?![\d,])'),
    cp(3, '범위', '노트북 연 360대', r'(?<![\d,])360(?![\d,])'),
    cp(4, '규격', 'PC i5 14세대 이상', r'14세대'),
    cp(5, '규격', 'Ryzen 5 8000 시리즈', r'8000'),
    cp(6, '규격', 'PC DDR5 4800MHz', r'4800'),
    cp(7, '규격', '슬림타워 이하', r'슬림타워'),
    cp(8, '규격', 'PS2 포트', r'ps2|ps/2'),
    cp(9, '규격', '키보드스킨', r'키보드스킨|키스킨'),
    cp(10, '규격', '모니터 22인치 와이드', r'22인치|22"'),
    cp(11, '규격', '명암비 1,000:1', r'1,?000:1'),
    cp(12, '규격', '모니터 응답속도 5ms', r'5ms'),
    cp(13, '규격', '노트북 Ryzen 7 7735U', r'7735u'),
    cp(14, '규격', '노트북 15.6인치', r'15\.6'),
    cp(15, '규격', '노트북 2.0kg 이하', r'2\.0kg|2kg'),
    cp(16, '규격', 'WiFi 6 이상', r'wifi6|wi-fi6|wifi'),
    cp(17, 'A/S', '무상유지보수 2년 이상', r'2년'),
    cp(18, '계약', '단종 시 동일 금액 후속 모델', r'후속'),
    cp(19, '계약', '분리 발주 시 단가 변동 없음', r'분리'),
    cp(20, '계약', '수량 보장 없는 조건부 단가계약', r'보장하지|보장없|조건부|미보장'),
    cp(21, '계약', '매월 설치 완료 후 정산', r'정산'),
    cp(22, '납품', '전국 9개 노드', r'9개'),
    cp(23, '설치', '설치비 단가 포함 금지 · 별도 계약', r'설치비|위탁설치'),
    cp(24, 'A/S', '서비스 완료 목표 2일', r'2일'),
    cp(25, 'A/S', '부품 없으면 3일 + 대체 장비', r'대체장비'),
    cp(26, 'A/S', '부품 보유 5년', r'5년'),
    cp(27, 'A/S', '서비스 센터 핫라인', r'핫라인'),
    cp(28, 'A/S', 'DOA 즉시 교체', r'doa'),
    cp(29, '납품', '발주 후 3주 이내', r'3주'),
    cp(30, '납품', '1회 최대 모니터 2,000대', r'2,?000대'),
    cp(31, '납품', '최초 발주 PC 300대', r'300대'),
    cp(32, '납품', '배송 2인 1조', r'2인1조'),
    cp(33, '납품', 'OS 마스터 이미지 탑재', r'마스터'),
    cp(34, '자격', '최근 3년 금융권 누적 1,000대 실적', r'1,?000대'),
    cp(35, '제출', '구매포탈 등록', r'구매포탈|sp\.kbinsure'),
    cp(36, '유의', '공란 · 판단 불가 0점', r'0점'),
    cp(37, '제출', '발급서류 3개월 이내', r'3개월'),
    cp(38, '구성', 'KB CI 스티커', r'ci'),
    cp(39, '규격', '메인보드 제조번호 확인', r'제조번호'),
    cp(40, '자격', '원제작사 또는 기술지원 확약 · 파트너십', r'원제작사|확약서|파트너'),
]

PROJECTS = [
    {'key': 'printer', 'title': '[신한은행] 흑백프린터 도입 추진 (152대)', 'match': r'프린터|152', 'checkpoints': PRINTER},
    {'key': 'desktop', 'title': '[삼성생명] 데스크탑 표준 모델 선정', 'match': r'데스크탑|데스크톱|삼성생명', 'checkpoints': DESKTOP},
    {'key': 'monitor', 'title': '[신한은행] 업무용 모니터(27인치) 980대', 'match': r'모니터|980', 'checkpoints': MONITOR},
    {'key': 'kb_pc', 'title': '[KB손해보험] 개인전산장비 단가계약', 'match': r'개인전산|kb|케이비', 'checkpoints': KB},
]


def main():
    args = sys.argv[1:]
    bundle = Path(args[0]) if args else None
    samples = HERE.parent.parent.parent / 'src' / 'rfp_samples.json'
    if '--samples' in args:
        samples = Path(args[args.index('--samples') + 1])
    docs = json.loads(samples.read_text(encoding='utf-8'))
    tcs = []
    for i, (d, p) in enumerate(zip(docs, PROJECTS)):
        tcs.append({'id': f'TC{i + 1}', 'title': p['title'], 'source_file': d['name'], 'kind': 'single', 'input': d['text'],
                    'expected': {'projects': [{k: p[k] for k in ('key', 'match', 'checkpoints')}]}})
    if bundle and bundle.exists():
        long_text = clean_markdown(bundle.read_text(encoding='utf-8')).strip()
    else:
        long_text = '# 금융권 제안요청서(RFP) 및 입찰공고 통합 관리 문서\n\n' + '\n\n---\n\n'.join(d['text'] for d in docs)
    tcs.append({'id': 'TC5', 'title': '통합 문서 — RFP 4건이 한 파일에 (긴 입력 · 사업별 귀속 유지)', 'source_file': bundle.name if bundle else 'concat',
                'kind': 'multi', 'input': long_text,
                'expected': {'projects': [{k: p[k] for k in ('key', 'match', 'checkpoints')} for p in PROJECTS]}})
    out = HERE / 'rfp_tc.json'
    out.write_text(json.dumps({'version': 1, 'note': '정답 체크포인트는 norm() 처리된 출력에 대한 정규식. TC5는 4건의 체크포인트를 사업별로 맞는 출력 사업 안에서만 인정(귀속 검사).',
                               'tcs': tcs}, ensure_ascii=False, indent=1), encoding='utf-8')
    for t in tcs:
        n = sum(len(p['checkpoints']) for p in t['expected']['projects'])
        print(t['id'], t['kind'], len(t['input']), 'chars', n, 'checkpoints')


if __name__ == '__main__':
    main()
