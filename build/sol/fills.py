# bs22 (N 공유오피스) — 15장 문구 · 이미지 채움 → src/scenario_fills.js
import json, sys, re
sys.path.insert(0, '/home/claude/gen/lay')
import pages
from lib import BUND, MAN
W = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/w'
H = lambda s: {'html': s}
T = {
 'L_SOL_01': {1: H('N 공유오피스<br>솔루션 제안서'), 2: '10호점 오픈과 함께 완성하는 유연한 업무 환경', 3: '삼성전자 한국총괄 B2B 영업팀 · 2026. 10'},
 'L_SOL_02': {0: 'N 공유오피스 10호점이 완성하는 새로운 업무 환경', 1: 'N 공유오피스',
              5: H('Flip Pro · 갤럭시 북 · 복합기로<br>입주사의 업무 생산성을 높입니다.'),
              6: H('공기질 케어와 비스포크 가전으로<br>머물고 싶은 라운지를 만듭니다.'),
              7: H('b.IoT Cloud로 전 지점의 기기를<br>본사에서 한 번에 관리합니다.')},
 'L_SOL_03': {0: H('N 공유오피스<br>공간별 맞춤 제안'),
              1: H('10호점의 다섯 공간마다 특화된 제품과 솔루션을 배치했습니다.<br>입주사가 매일 체감하는 업무 · 휴식 · 관리 환경을 한 번에 구축합니다.')},
 'L_SOL_04': {2: H('입주사와 방문객이 처음 만나는 입구 / 로비에 비디오월 · 사이니지 · Flip Pro를 배치해<br>지점의 첫인상을 높이고, 층별 공지와 입주사 이벤트를 실시간으로 전달합니다.'),
              8: H('층별 공지 · 입주사 이벤트를<br>화면 하나로 바로 공유')},
 'L_SOL_05': {2: H('1인실부터 오픈 데스크까지, 입주사가 바로 쓰는 IT · 프린팅 제품을 기본으로 갖춥니다.<br>노트북 하나로 시작하는 유연한 업무 공간을 완성해 보세요!')},
 'L_SOL_06': {2: H('무인 과금 솔루션으로 입주사 누구나 카드 한 장으로 출력하고 바로 결제합니다.<br>지점별 출력 정산 · 미수 관리 부담이 사라져 운영팀은 입주사 서비스에 집중합니다.')},
 'L_SOL_07': {2: H('삼성 Flip Pro는 별도 솔루션 없이도 간단하고 원활한 화상 회의를 지원합니다.<br>Google Meet 같은 앱으로 터치 한 번에 원격 참석자와 바로 연결됩니다.'),
              7: H('Google Meet 등으로<br>간편한 화상회의 가능'), 12: '* 화상 회의 앱 라이선스 및 화상 장비는 별도 구매가 필요합니다.'},
 'L_SOL_08': {2: H('쾌적한 냉난방은 물론, 실시간 공기질 모니터링과 청정 시스템으로 깨끗한 업무 공간을 유지합니다.<br>SmartThings 자동 연동으로 입주사가 매일 체감하는 쾌적함을 높여 드립니다.')},
 'L_SOL_09': {2: H('업무 사이 리프레시 타임과 유연 근무를 위한 프리미엄 라운지를 완성해 보세요!<br>입주사 임직원이 머물고 싶은 공간이 곧 N 공유오피스의 재계약 이유가 됩니다.')},
 'L_SOL_10': {2: H('지점마다 다른 컨셉 컬러의 비스포크 가전으로 카페 인테리어를 완성해 보세요!<br>코랄 · 민트 · 옐로 등 공간 컨셉에 맞춰 패널 컬러를 고를 수 있습니다.')},
 'L_SOL_11': {2: H('클라우드 기반 원격 관리로 N 공유오피스 전 지점의 기기를 본사에서 한 번에 관리합니다.<br>장애 알림과 원격 점검으로 유지보수는 빨라지고, 지점 운영팀의 업무 부담은 줄어듭니다.')},
 'L_SOL_12': {2: H('공유오피스 업계가 먼저 경험한 삼성의 업무 환경, N 공유오피스 10호점에 그대로 옮깁니다.<br>QR 코드로 도입 사례 상세 내용을 확인해 보세요!')},
 'L_SOL_13': {2: H('공유오피스 업계가 먼저 경험한 삼성의 업무 환경, N 공유오피스 10호점에 그대로 옮깁니다.<br>QR 코드로 도입 사례 상세 내용을 확인해 보세요!')},
 'L_SOL_14': {},
 'L_SOL_15': {0: 'N 공유오피스 솔루션 제안 · 삼성전자 한국총괄 B2B 영업팀'},
}
out = []
for fn in pages.PAGES:
    s, d = fn()
    texts = T[s.fid]
    for i in texts: assert int(i) < s.tb, (s.fid, i)
    img = {}
    html = s.html()
    for k in range(s.ni):
        m = re.search(r'data-img="%d"[^>]*><img [^>]*data-fill="([^"]+)"[^>]*object-fit: (\w+);' % k, html)
        key = [kk for kk, v in BUND.items() if v == m.group(1)][0]
        img[str(k)] = {'src': m.group(1), 'fit': m.group(2), 'name': MAN[key]['alt'], 'keep': True}
    out.append({'t': {str(i): v for i, v in texts.items()}, 'img': img, 'f': s.fid})
p = f'{W}/src/scenario_fills.js'; src = open(p).read()
lines = src.split('\n')
for n, l in enumerate(lines):
    if l.startswith('export const FILL_CUSTOMER = '):
        o = json.loads(l[len('export const FILL_CUSTOMER = '):-1]); o['bs22'] = 'N 공유오피스'
        lines[n] = 'export const FILL_CUSTOMER = ' + json.dumps(o, ensure_ascii=False) + ';'
    if l.startswith('export const FILLS = '):
        body = l[len('export const FILLS = '):]
        assert body.endswith('};')
        body = re.sub(r', "bs22": \[.*\]\}$', '}', body[:-1])  # 다시 돌릴 때
        assert body.endswith('}')
        lines[n] = 'export const FILLS = ' + body[:-1] + ', "bs22": ' + json.dumps(out, ensure_ascii=False) + '};'
open(p, 'w').write('\n'.join(lines))
print('slides', len(out), 'texts', sum(len(x['t']) for x in out), 'imgs', sum(len(x['img']) for x in out))
