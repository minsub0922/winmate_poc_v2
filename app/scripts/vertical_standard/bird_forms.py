"""Spatial forms for the 공간 조감도 (verticals with <= 6 spaces).

Each vertical becomes one studio form: one room per vertical space, room kind
from the space name, Samsung products from the space's own category list.
"""
import json, re, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import prod

from paths import ROOT, OUT
VP = json.load(open(ROOT + '/app/data/vertical_space_product.json'))
LIB = json.load(open(ROOT + '/app/data/spatial/library.json'))
PHYS = {a['productId'] for a in LIB['assets'] if a.get('productId') and a.get('physical')}
IND = {'SF': 'VN', 'RG': 'VN', 'MB': 'VN', 'MI': 'PB'}

# Ordered: first match wins. Kinds are the studio SPACE_TYPES.
RULES = [
    ('outdoor', r'외벽|파사드(?!.*쇼윈도)|광장|캠퍼스.*외부|버스정류장|스트리트|전광판|리본보드'),
    ('kitchen', r'주방|키친|베이킹|제조실'),
    ('dining', r'식당|객석|푸드코트|F&B|조식당|펍|매점|친교실|급식실|식음'),
    ('fitness', r'피트니스|운동 공간|체력단련|GX|락커|재활|물리치료'),
    ('medical', r'병실|병동|입원|진료|수술|처치|케어룸|간호|요양 스테이션|케어 스테이션'),
    ('bedroom', r'객실|침실|기숙사|생활관|원룸|스튜디오·|^세대$'),
    ('utility', r'기계실|공조|옥상|세탁|리넨|난방|급탕|다용도실|장비실|국사|수장고'),
    ('meeting', r'회의|미팅|상담|세미나|스터디룸|이사회|프라이빗 룸|VIP·PB'),
    ('classroom', r'강의실|교실|교육장|교육관|미래교실|컴퓨터실|프로그램실'),
    ('study', r'열람|도서관|자습|PC 좌석|독서실|연구실|실험실'),
    ('theatre', r'강당|공연|상영관|예배당|법당|On-Air|체험존|체험 존|쇼·|어트랙션|전시실|커뮤니티 홀'),
    ('office', r'사무|업무|임원실|대표실|교무실|행정|관제|상황실|통제|딜링룸|콜센터|역무실|지휘|의국|백오피스|관리사무소|방송실|부조정실|운영 스태프|관리 공간|무인 결제·관리'),
    ('reception', r'입구|로비|프런트|리셉션|접수|카운터|매표|게이트|안내|출입|체크인|결제|원무|창구|ATM|발권'),
    ('retail', r'매장|진열|쇼룸|쇼윈도|모델하우스|기념품|쇼케이스|코너|프로모션|상업시설|창문 홍보면|피팅룸'),
    ('warehouse', r'창고|생산|피킹|출고|클린룸|작업장|물류|유지보수|저온'),
    ('lounge', r'라운지|휴게|대기|홀|탕비실|팬트리|거실|대합실|콘코스|커뮤니티|분장실|무인 운영|스낵'),
]
OVERRIDE = {
    # name -> kind, where the first rule would read the name the wrong way
    '본사 교육장·R&D 테스트키친': 'classroom',
    '쇼윈도·파사드': 'retail',
    '세탁·건조 존': 'utility',
    '대기 공간': 'lounge',
    '프라이빗 오피스': 'office',
    '플레이 룸': 'theatre',
    '시술 공간': 'medical',
    '스카이박스·VIP석': 'lounge',
    '선수 라커룸': 'fitness',
    '미디어센터·기자실': 'office',
    '프리미엄관 라운지(스카이박스)': 'lounge',
    '실내 미디어(역사·쇼핑몰)': 'lounge',
    '매체 관제센터': 'office',
    '쇼룸 키친': 'kitchen',
    '쇼룸 리빙·드레스룸': 'lounge',
    '상담 데스크': 'meeting',
    '공용 라운지·세탁실': 'lounge',
    '세대': 'bedroom',
    '공용 식당': 'dining',
    '도슨트·관람 디바이스': 'theatre',
    '현장 운영 스태프': 'outdoor',
    '현장 유지보수': 'warehouse',
    '매장 체험 존': 'retail',
    '매장 사이니지': 'retail',
    '상담 카운터': 'reception',
    '무인점포·ATM 존': 'reception',
    '객장·대기 공간': 'lounge',
    '열람실·좌석 존': 'study',
    '출입·결제 존': 'reception',
    '휴게·스낵 존': 'lounge',
    '무인 운영 존': 'reception',
    '쇼케이스·진열대': 'retail',
    '카운터·메뉴보드': 'reception',
    '좌석 홀': 'dining',
    '홀': 'dining',
    '주문·계산대': 'reception',
    '매장 홀': 'retail',
    '카운터·결제': 'reception',
    '진열·냉장 쇼케이스': 'retail',
    '메인 체험존': 'theatre',
    '제품 진열 존': 'retail',
    '상담·고객 라운지': 'lounge',
    '피팅룸·VIP 룸': 'meeting',
    '객실 거실': 'lounge',
    '객실 주방': 'kitchen',
    '세탁 공간': 'utility',
    '무인 체크인': 'reception',
    '투숙객 세탁실': 'utility',
    '리셉션·라운지': 'reception',
    '수건·세탁실': 'utility',
    '기계실(냉난방·온수)': 'utility',
    '운동 공간(GX·웨이트)': 'fitness',
    '락커룸·파우더룸': 'fitness',
    '라커·파우더룸': 'fitness',
    '카운터·대기 라운지': 'reception',
    '펍·F&B 바': 'dining',
    '종합상황실': 'office',
    '실내 쇼·공연장': 'theatre',
    'F&B·기념품숍': 'retail',
    '매표소·게이트': 'reception',
    '어트랙션 대기열': 'lounge',
    '대합실·승강장': 'lounge',
    '매표·발권': 'reception',
    '종합관제센터': 'office',
    '역사 내 상업시설': 'retail',
    '체력단련장·식당': 'fitness',
    '생활관': 'bedroom',
    '지휘통제실': 'office',
    '병실·생활실': 'medical',
    '간호·요양 스테이션': 'medical',
    '프로그램실·식당 홀': 'dining',
    '급식 주방': 'kitchen',
    '중앙통제실(MES)': 'office',
    '사무동': 'office',
    '구내식당·기숙사': 'dining',
    '클린룸·항온항습': 'warehouse',
    '저온 창고': 'warehouse',
    '피킹·출고': 'warehouse',
    '딜링룸': 'office',
    '콜센터': 'office',
    '본점 로비': 'reception',
    '통신 국사·장비실': 'utility',
    '예배당·법당': 'theatre',
    '교육관': 'classroom',
    '친교실·식당': 'dining',
    '방송실': 'office',
    '스튜디오(On-Air)': 'theatre',
    '부조정실': 'office',
    '분장실·대기실': 'lounge',
    '진료실·상담실': 'medical',
    '처치실·VIP 케어룸': 'medical',
    '재활·물리치료실': 'fitness',
    '강당·체육관': 'theatre',
    '급식실': 'dining',
    '컴퓨터실·미래교실': 'classroom',
    '상담실·로비': 'reception',
    '원룸·스튜디오': 'bedroom',
    '키친': 'kitchen',
    '케어 스테이션': 'medical',
    '커뮤니티 홀': 'theatre',
}
STYLE = {'FB': 'warm', 'RT': 'modern', 'SV': 'modern', 'HT': 'premium', 'TP': 'modern', 'VN': 'modern', 'SF': 'industrial', 'AD': 'modern',
         'OF': 'modern', 'RS': 'warm', 'ID': 'warm', 'ED': 'warm', 'PB': 'modern', 'MI': 'industrial', 'MD': 'clinical', 'MF': 'industrial',
         'FN': 'premium', 'OE': 'modern', 'RG': 'warm', 'MB': 'modern'}
MULTI = {'sac_l_in': 2, 'sac_sm': 2, 'sac_res': 2, 'light': 2, 'nb': 2, 'mon': 2, 'tab': 2, 'desk': 2}
# Products the room geometry cannot carry well in a single small room
SKIP = {'sac_l_out', 'sac_ctr', 'sac_cold', 'sac_ehs'}


def kind_of(name):
    if name in OVERRIDE: return OVERRIDE[name]
    for k, rx in RULES:
        if re.search(rx, name): return k
    return 'lounge'


def room_products(sp, kind):
    out, seen = [], set()
    for cat in sp['products']:
        if cat not in prod.P: continue
        pid = prod.P[cat][0]
        if pid not in PHYS or pid in seen: continue
        if cat in SKIP and kind not in ('utility', 'outdoor') and not (cat == 'sac_cold' and kind == 'warehouse'): continue
        seen.add(pid)
        out.append({'productId': pid, 'quantity': MULTI.get(cat, 1)})
        if len(out) >= 6: break
    return out


def form_for(vp):
    group = vp['group']
    rooms = []
    for i, sp in enumerate(vp['spaces']):
        kind = kind_of(sp['name'])
        rooms.append({'id': f'r{i + 1}', 'name': sp['name'], 'kind': kind, 'width': '', 'depth': '', 'capacity': '',
                      'products': room_products(sp, kind)})
    return {'version': 1, 'title': vp['name'], 'industry': IND.get(group, group), 'style': STYLE.get(group, 'modern'), 'templateId': None, 'rooms': rooms}


if __name__ == '__main__':
    out = {}
    only = sys.argv[1:]
    for vp in VP['verticals']:
        if only and vp['id'] not in only: continue
        if len(vp['spaces']) > 6 and not only: continue
        out[vp['id']] = form_for(vp)
    json.dump(out, open(OUT + '/bird_forms.json', 'w'), ensure_ascii=False, indent=1)
    for vid, f in out.items():
        print(vid, f['industry'], f['style'], ' / '.join(f"{r['name']}={r['kind']}({len(r['products'])})" for r in f['rooms']))
