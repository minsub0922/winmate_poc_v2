#!/usr/bin/env python3
"""Build every Samsung catalog entry as a persistent, dimensioned object recipe.

Read only the current catalog/projection. No image generation or remote modelling service.
Unknown dimensions stay explicitly estimated; software/services are logical objects.
"""
from pathlib import Path
import hashlib
import json
import re
import sqlite3
from spatial_display_geometry import configure_display

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'app/data'


def kind_of(p):
    # IDs contain catalogue numbers (e.g. ec_360_091), not product semantics.
    text = ' '.join(str(p.get(k, '')) for k in ('name', 'model', 'cat', 'sc'))
    name, family, category = p.get('name', ''), p.get('fam', ''), p.get('sc', '')
    # A category called "환기 솔루션" also contains physical ventilation hardware.
    # Only named software/services are logical; never classify from that category alone.
    if re.search(r'MagicINFO|VXT|LYNK|링크 클라우드|Knox|SmartThings|b\.IoT|케어서비스|케어 서비스|전문세척|실내기.*세척|구독|프린팅 솔루션|모바일 솔루션|클래스룸', name, re.I) or category in ('모바일 솔루션','에어컨 케어서비스'):
        return 'logical'
    if family == '디스플레이':
        if re.search(r'마운트 / 스탠드|무빙스탠드', name): return 'accessory'
        if re.search(r'키오스크', text): return 'kiosk'
        if re.search(r'Premiere|프로젝터', text, re.I): return 'projector'
        if re.search(r'전자칠판|Flip Pro', text, re.I): return 'display'
        if re.search(r'모니터|무빙스타일|Movingstyle', text, re.I): return 'monitor'
        return 'display'
    if family == '프린팅' and re.search(r'토너|드럼|잉크|소모품|폐토너|이미지 유닛', text): return 'consumable'
    if family == '오디오':
        if re.search(r'헤드폰|TOUR ONE|LIVE \d|TUNE \d|N9 HYBRID', text, re.I): return 'headphone'
        if re.search(r'이어폰|버즈', text): return 'earbuds'
        if re.search(r'마이크|AKG [CDPW]|AKG DMS|AKG WMS', text, re.I): return 'microphone'
        if re.search(r'믹서|Soundcraft', text, re.I): return 'mixer'
        if re.search(r'턴테이블|SPINNER|No\.515', text, re.I): return 'turntable'
        if re.search(r'앰프|Crown|BSS|dbx|AMX|ARCAM|Mark Levinson|SDR35', text, re.I): return 'amplifier'
        return 'speaker'
    if family == '조명': return 'light'
    if family == '모바일 · PC' and re.search(r'밴드|키보드|(?<!엑스)커버|케이스|S펜|S Pen', name, re.I) and category not in ('노트북','스마트폰','올인원PC/데스크탑'): return 'accessory'
    if re.search(r'식기세척', text): return 'dishwasher'
    if re.search(r'인덕션|전기레인지', text): return 'induction'
    if re.search(r'로봇.*청소|제트 봇|\bVR\d', text): return 'robotvacuum'
    if re.search(r'청소기|제트.*청소|Bespoke.*제트', text, re.I): return 'vacuum'
    if re.search(r'후드', text) and not re.search(r'후드일체형', text): return 'hood'
    if re.search(r'냉장|냉동고|김치|와인.*셀러', text): return 'fridge'
    if re.search(r'버즈', text): return 'earbuds'
    if re.search(r'갤럭시 XR', text): return 'headset'
    if re.search(r'워치', name): return 'watch'
    if category == 'SSD · 메모리' or re.search(r'충전기|분기관|조인트|교체용 필터|리뉴얼 필터|설치용 자재|수납존', name, re.I): return 'accessory'
    if family == '공조 · 에어컨':
        hardware = name+' '+p.get('model','')
        if category == '시스템에어컨 · 제어기': return 'sensor'
        if re.search(r'리모트|리모컨|제어기|컨트롤|게이트웨이|모니터 플러스|중계기|센서|Kit|키트|모듈|Converter|DMS|Actuator|밸브', hardware, re.I): return 'sensor'
        if re.search(r'연결관|헤더|배관 Kit|드레인 펌프|Drain Pump|데코커버', hardware, re.I): return 'accessory'
        if re.search(r'360', name): return 'cassette360'
        if re.search(r'벽걸이|AR\d', hardware): return 'wallac'
        if re.search(r'스탠드|중대형|상업용 에어컨|갤러리|클래식|Q9000|바닥상치|윈도우핏|항온항습|산업용 PAC|AF\d|AP\d', hardware, re.I): return 'floorac'
        if re.search(r'1\s*Way|2\s*Way|4\s*Way|카세트|실내기|판넬|덕트|ERV|전열|실링|청정환기|가정용 환기|에어 콤보|무풍 시스템에어컨', hardware, re.I): return 'cassette'
        if re.search(r'공기청정|제습', text): return 'purifier'
        return 'outdoor'
    if p['id'] in ('ehs','dvmchiller','dvms2'):
        return 'outdoor'
    if p['id']=='erv':
        return 'cassette'
    patterns = [
        ('cassette360', r'360\s*(?:카세트|냉난방)|시스템에어컨\s*360'),
        ('cassette', r'카세트|1Way|4Way|2Way|실내기.*천장|전열|환기|덕트|ERV'),
        ('outdoor', r'실외기|DVM|칠러|열펌프|히트펌프|대형건물|중앙공조|냉동|콜드체인'),
        ('wallac', r'벽걸이|에어컨|스탠드형|항온항습'), ('purifier', r'공기청정|제습기'),
        ('airdresser', r'에어드레서'), ('washer', r'세탁|건조기|콤보'), ('fridge', r'냉장고|김치|와인셀러'),
        ('dishwasher', r'식기세척'), ('induction', r'인덕션|전기레인지'), ('oven', r'오븐|큐커|전자레인지'),
        ('water', r'정수기'), ('kiosk', r'키오스크'), ('tablet', r'갤럭시 탭|Flip|전자칠판'),
        ('phone', r'스마트폰|엑스커버|갤럭시 A|갤럭시 Z|갤럭시 S'), ('laptop', r'갤럭시 북|노트북|Chromebook'),
        ('desktop', r'데스크탑|올인원PC'), ('monitor', r'모니터'), ('display', r'사이니지|비디오월|호텔 TV|호텔TV|The Wall|Onyx|LED|TV'),
        ('printer', r'프린터|복합기|프린팅'), ('light', r'조명|다운라이트|거실등|방등|가로등'),
        ('speaker', r'스피커|오디오|하만|JBL|마이크|앰프|믹서|AV'), ('sensor', r'태그|센서|워치|제어기|컨트롤러|게이트웨이|리모컨|필드 디바이스'),
    ]
    # Lighting LED must precede the general LED display family.
    if p.get('fam') == '조명':
        return 'light'
    for kind, pattern in patterns:
        if re.search(pattern, text, re.I):
            return kind
    return 'accessory'


SIZES = {'display':[1.24,.71,.04], 'monitor':[.72,.55,.22], 'tablet':[.32,.21,.012], 'phone':[.077,.165,.009],
         'laptop':[.355,.235,.25], 'desktop':[.2,.45,.42], 'kiosk':[.55,1.55,.45], 'cassette':[.95,.18,.95],
         'cassette360':[.95,.28,.95], 'wallac':[1,.31,.23], 'outdoor':[1.1,1.65,.8], 'purifier':[.38,.72,.38],
         'airdresser':[.6,1.96,.63], 'washer':[.686,.984,.875], 'fridge':[.91,1.85,.71], 'dishwasher':[.598,.82,.55],
         'induction':[.6,.055,.52], 'oven':[.595,.595,.57], 'water':[.26,.5,.49], 'speaker':[.35,.65,.32],
         'printer':[.5,.55,.5], 'light':[.6,.045,.6], 'sensor':[.1,.1,.035], 'accessory':[.25,.2,.2], 'logical':[.22,.04,.22]}
SIZES.update(floorac=[.525,1.85,.32], projector=[.55,.14,.38], consumable=[.32,.1,.12],
             headphone=[.2,.23,.085], earbuds=[.06,.05,.025], headset=[.19,.11,.18], watch=[.045,.044,.012],
             microphone=[.05,.24,.05], mixer=[.5,.12,.4], amplifier=[.44,.12,.38], turntable=[.45,.15,.38],
             vacuum=[.25,1.12,.25], robotvacuum=[.35,.1,.35], hood=[.6,.65,.5])


def dimensions(p, detail, kind):
    candidates = []
    for row in detail.get('specs', []):
        if len(row) < 3:
            continue
        label, value = ' '.join(map(str, row[:2])), str(row[2])
        if re.search(r'포장|박스|팔레트|pallet|화면|대각|VESA|베사|타공|무게|중량|간격|드라이버|Gross', label, re.I):
            continue
        if not re.search(r'크기|치수|가로.*높이|W.*H.*D|Dimension|SIZE|외관', label, re.I):
            continue
        # Keep the first explicitly listed configuration, and retain the full row
        # as evidence. A range must never be combined into an invented dimension.
        match = re.search(r'(\d[\d,]*(?:\.\d+)?)\s*[x×X*]\s*(\d[\d,]*(?:\.\d+)?)\s*[x×X*]\s*(\d[\d,]*(?:\.\d+)?)', value)
        if not match:
            continue
        unit = 100 if re.search(r'(?<!m)cm|㎝', value+' '+label) else 1000
        n = [float(v.replace(',', '')) / unit for v in match.groups()]
        if min(n) <= 0 or max(n) > 20:
            continue
        # Normalize all manufacturers' width/depth/height orderings to x/y/z.
        flat = re.sub(r'\s', '', label).lower()
        if re.search(r'가로.*세로.*높이|길이.*폭.*높이|w[x×*]d[x×*]h', flat):
            n = [n[0], n[2], n[1]]
        elif re.search(r'h[x×*]w[x×*]d|높이.*(?:가로|폭).*깊이', flat):
            n = [n[1], n[0], n[2]]
        elif re.search(r'세로.*가로.*두께', flat):
            n = [n[1], n[0], n[2]]
        elif re.search(r'가로.*세로.*두께', flat):
            n = [n[0], n[2], n[1]]
        # A monitor includes its stand; a wall display does not. Main units take
        # precedence over packaging, panels, and optional cleaning stations.
        score = 0 if re.search(r'제품|외관|본체|외부', label) else 2
        if re.search(r'스탠드\s*포함', label): score = -2 if kind == 'monitor' else 5
        if re.search(r'스탠드\s*제외', label): score = 4 if kind == 'monitor' else -2
        if re.search(r'판넬|패널|스테이션', label): score += 5
        if kind=='outdoor' and '실외기' in label: score -= 4
        candidates.append((score, n, row))
    if candidates:
        _, n, source = sorted(candidates, key=lambda c: c[0])[0]
        return [round(v, 4) for v in n], 'catalog-spec', source
    size = list(SIZES[kind])
    text = f"{p.get('name','')} {p.get('model','')} {p.get('spec','')}"
    inch = re.search(r'(\d{2,3})(?:\s*[\"″]|형)', text)
    model_diagonal=re.search(r'^(?:LH|HG|KQ|KU|LS|QM|QB|OH|WM|VM|S)([1-9]\d{1,2})(?=[A-Z])',p.get('model',''),re.I)
    if model_diagonal and kind in ('display','monitor'):inch=model_diagonal
    if not inch:
        cm = re.search(r'(\d{2,3}(?:\.\d+)?)\s*cm', text, re.I)
        if cm and kind in ('display', 'monitor'): text += ' '+str(round(float(cm[1])/2.54))+'형'; inch = re.search(r'(\d{2,3})형', text)
    if not inch and kind in ('display', 'monitor'):
        inch = re.search(r'(?:QM|QB|OH|HG|WM|VM)(\d{2})', text, re.I)
    if inch and kind in ('display', 'tablet', 'monitor'):
        diag = int(inch[1]) * .0254
        ratio=16/9
        resolution=re.search(r'(\d{3,5})\s*[x×]\s*(\d{3,5})',p.get('spec',''),re.I)
        if resolution and int(resolution[2])>0:ratio=int(resolution[1])/int(resolution[2])
        size = [round(diag*ratio/(ratio**2+1)**.5,4),round(diag/(ratio**2+1)**.5,4),.045]
    if kind == 'monitor' and inch:
        # Screen diagonal excludes the stand and says nothing about panel depth.
        size[1] += .13;size[2]=.22
    return size, 'estimated', None


def spec_color(detail):
    values = ' '.join(str(r[2]) for r in detail.get('specs', []) if len(r)>2 and re.search(r'색상|색깔|color|colour', str(r[1]), re.I))
    for pattern,color in [(r'화이트|white|아이보리|ivory','#eeede7'),(r'블랙|black|차콜|graphite','#262a2b'),(r'베이지|beige|cream','#d6c9b1'),(r'실버|silver|metal','#b8bdc0'),(r'그레이|gray|grey','#85898b'),(r'핑크|pink','#ce9eae'),(r'블루|blue','#67859d'),(r'그린|green','#7d9281')]:
        if re.search(pattern,values,re.I): return color
    return None


def recipe_of(p, kind, size):
    text = ' '.join(str(p.get(k, '')) for k in ('name', 'model', 'cat', 'sc'))
    if kind == 'laptop': return 'laptopClosed'
    if kind == 'display':
        if re.search(r'전자칠판|Flip Pro', text, re.I): return 'whiteDisplay'
        if re.search(r'이페이퍼|E Paper|EM\d', text, re.I): return 'epaper'
        if re.search(r'양면', text): return 'doubleDisplay'
    if kind == 'cassette':
        if re.search(r'ERV|전열|환기|덕트', text, re.I): return 'duct'
        if re.search(r'2\s*Way|PC2', text, re.I): return 'cassette2way'
        if re.search(r'4\s*Way|PC4|N4', text, re.I): return 'cassette'
        if re.search(r'1\s*Way|N1|PC1|Infinite Line|무풍 시스템에어컨', text, re.I): return 'cassette1way'
        if re.search(r'실링', text): return 'ceilingConsole'
    if kind == 'outdoor':
        if re.search(r'COLOMBO|KIMPO|VTC|AOFTE',text,re.I): return 'showcaseUpright'
        if re.search(r'TIFFANY|SYDNEY|JINJU|ACFTE|ACFSA|ACFKC',text,re.I): return 'showcaseCounter'
        if re.search(r'냉각탑|SS-OTT',text,re.I): return 'coolingTower'
        if re.search(r'공조기|AHU|FCU',text,re.I): return 'airHandler'
        if re.search(r'상업용 EHS|AM\d.*TNBF|AE\d.*NSBF|GEO/WATER', text, re.I): return 'hydroUnit'
        if re.search(r'DVM S2|GHP', text, re.I): return 'outdoorTopFan'
        if re.search(r'흡수|냉온수기|스팀|폐열',text,re.I): return 'absorptionChiller'
        if re.search(r'원심|터보|스크루',text,re.I): return 'centrifugalChiller'
        if re.search(r'칠러|Chiller|냉동기|냉온수기', text, re.I): return 'chiller'
    if kind == 'floorac' and re.search(r'Q9000|클래식',text,re.I): return 'flooracDual'
    if kind == 'monitor':
        if re.search(r'무빙스타일|Movingstyle', text, re.I): return 'mobileDisplay'
        if re.search(r'커브드|오디세이|G9|G5', text, re.I): return 'curvedMonitor'
    if kind == 'desktop' and re.search(r'올인원|All.in.One',p.get('name','')+' '+p.get('model',''),re.I): return 'allinone'
    if kind == 'fridge':
        if re.search(r'와인', text): return 'wineFridge'
        if re.search(r'뚜껑', text): return 'chestFridge'
        if re.search(r'1도어|컬럼|빌트인 냉장고|빌트인 냉동고', text): return 'singleFridge'
        if re.search(r'양문형', text): return 'sideBySideFridge'
        if re.search(r'3도어|김치', text): return 'threeDoorFridge'
        if re.search(r'2도어|소형|냉장고 (?:89|255|525)', text): return 'twoDoorFridge'
    if kind == 'washer' and re.search(r'원바디|타워', text): return 'laundryTower'
    if kind == 'speaker':
        if re.search(r'Music Frame|뮤직 프레임', text, re.I): return 'framedSpeaker'
        if re.search(r'사운드바|Soundbar|BAR \d', text, re.I): return 'soundbar'
        if re.search(r'천장|Control (?:10|20|8100)', text, re.I): return 'ceilingSpeaker'
        if re.search(r'CHARGE|XTREME|FLIP|CLIP|GO \d|LUNA', text, re.I): return 'portableSpeaker'
    if kind == 'light':
        if re.search(r'원형|다운라이트|현관센서', text): return 'roundLight'
        if re.search(r'Bulb|MR16|PAR30|크립톤', text, re.I): return 'bulb'
        if re.search(r'스탠드|데스크램프', text): return 'deskLight'
        if re.search(r'가로등|보안등', text): return 'streetLightHead'
        if re.search(r'일자|Tube|Stick|간접', text, re.I): return 'linearLight'
    if kind == 'induction':
        if re.search(r'1구', text): return 'induction1'
        if re.search(r'2구|NZ32', text, re.I): return 'induction2'
        return 'induction3'
    if kind == 'earbuds' and max(size)<.05: return 'earbudSingle'
    if kind == 'accessory':
        if re.search(r'키보드', text): return 'keyboard'
        if re.search(r'커버|케이스', text): return 'tabletCover'
        if re.search(r'밴드', text): return 'watchBand'
        if re.search(r'분기관|분배헤더|연결관|조인트',text): return 'pipeJoint'
        if re.search(r'마운트|무빙스탠드',text): return 'screenStand'
    if kind == 'sensor':
        if re.search(r'리모컨|리모트',text): return 'remote'
        if re.search(r'중계기|Converter|MIM-|AIM-M|Edge-S|SJ-|SDDC|SIO-',text,re.I): return 'controlBoard'
        if re.search(r'터치|DMS|제어기|컨트롤',text): return 'controller'
    if kind == 'monitor' and size[2]<.1: return 'display'
    return kind


def assemble_display(asset):
    """Retain measured panel dimensions; never label a designed stand measured."""
    panel=list(asset['size']);w,h,d=panel
    mobile='무빙스타일' in asset['name'] or 'Movingstyle' in asset['name'] or '이동식 스탠드' in asset['name']
    if not mobile and not re.search(r'\+.*스탠드',asset['name']): return
    if mobile and asset['dimensionSource']=='catalog-spec' and h>1.0 and h>w*1.1:
        asset['placementSurface']='floor'
        return
    stand_h=.7 if mobile else .18
    overall_h=h+stand_h;overall_d=max(.55 if mobile else .25,d);base_w=min(w,.65)
    asset['componentDimensions']={'display':panel,'displayEvidence':asset['dimensionEvidence'],'displaySource':asset['dimensionSource'],'stand':'designed; dimensions unavailable'}
    asset['size']=[w,round(overall_h,4),overall_d];asset['dimensionSource']='estimated';asset['dimensionScope']='assembly-with-designed-stand';asset['placementSurface']='floor' if mobile else 'surface'
    def box(x,y,z,bw,bh,bd,material):return dict(shape='box',position=[x,y,z],size=[bw,bh,bd],material=material)
    body='body' if '전자칠판' in asset['name'] or 'Flip' in asset['name'] else 'black'
    asset['parts']=[box(0,.02,0,base_w/w,.04,1,'metal'),box(0,stand_h/2/overall_h,-.15,.045/w,stand_h/overall_h,.08/overall_d,'silver'),
                    box(0,(stand_h+h/2)/overall_h,0,1,h/overall_h,d/overall_d,body),
                    box(0,(stand_h+h/2)/overall_h,d/overall_d*.505,.94,h/overall_h*.9,.003/overall_d,'screen')]
    asset['recipe']='assembledDisplay-'+hashlib.sha256(json.dumps([asset['parts'],asset['size']],sort_keys=True).encode()).hexdigest()[:10]


def main():
    catalog = json.loads((DATA / 'catalog.json').read_text())
    dbjson = json.loads((DATA / 'products_db.json').read_text())
    products = [{**p, **dbjson['curated'].get(p['id'], {})} for p in catalog['products']] + dbjson['products']
    db = sqlite3.connect(f"file:{DATA / 'runtime/winmate_products.sqlite'}?mode=ro", uri=True)
    details = {r[0]:json.loads(r[1]) for r in db.execute('SELECT id,payload FROM wm_ui_detail')}
    overrides = json.loads((DATA / 'spatial/product-evidence.json').read_text())
    assets = []
    for p in products:
        kind = kind_of(p)
        size, accuracy, source = dimensions(p, details.get(p['id'], {}), kind)
        recipe=recipe_of(p,kind,size)
        if accuracy=='estimated':
            size=list({'cassette1way':[1.205,.038,.502] if re.search(r'판넬',p['name']) else [.97,.135,.41],
                       'cassette2way':[.89,.23,.575], 'bulb':[.06,.11,.06], 'linearLight':[.6,.035,.05],
                       'roundLight':[.4,.035,.4], 'deskLight':[.18,.45,.35], 'streetLightHead':[.8,.18,.25],
                       'ceilingSpeaker':[.25,.16,.25], 'robotvacuum':[.359,.1,.364]}.get(recipe,size))
        assets.append(dict(id='product:'+p['id'], productId=p['id'], name=p['name'], model=p['model'], kind=kind,
                           recipe=recipe, size=size, physical=kind != 'logical', dimensionSource=accuracy, dimensionEvidence=source,
                           specColor=spec_color(details.get(p['id'],{})),
                           dimensionScope='representative-configuration' if source and re.search(r' / |~|～', str(source[2])) else details.get(p['id'],{}).get('specScope','unknown'),
                           specModel=details.get(p['id'],{}).get('specModel'), specSources=details.get(p['id'],{}).get('specSources',[]),
                           imageEvidence=dict(thumbnail=p.get('th'),gallery=p.get('gal',[]),labels=p.get('galAlt',[]),pid=p.get('img'),scope='catalog-product'),
                           url=p.get('url') or details.get(p['id'],{}).get('url'), variants=p.get('models',[]),
                           category=p.get('cat',''), family=p.get('fam',''), industries=p.get('ind',[]), spaces=p.get('spaces',[]),
                           license='CC0-1.0', geometry='Winmate parametric representation; not manufacturer CAD'))
    # Reuse a measured row only for an identical model code, never fuzzy family
    # matches. Catalogue duplicates often have no detail of their own.
    model_key = lambda s: re.sub(r'[^A-Z0-9]', '', s.upper())
    measured = {}
    for a in assets:
        if a['dimensionSource'] == 'catalog-spec':
            for model in (a['model'],a['specModel'] or ''):
                key=model_key(model)
                if len(key)>=8: measured.setdefault(key,a)
    for a in assets:
        donor=measured.get(model_key(a['model']))
        if a['dimensionSource']=='estimated' and donor and donor['kind']==a['kind']:
            for key in ('size','dimensionEvidence','specSources','specModel'): a[key]=donor[key]
            a['dimensionSource']='catalog-spec';a['dimensionScope']='identical-model-reference';a['dimensionProductId']=donor['productId']
            p=next(p for p in products if p['id']==a['productId']);a['recipe']=recipe_of(p,a['kind'],a['size'])
        if a['productId'] in overrides:
            evidence=overrides[a['productId']]
            for key in ('size','recipe','dimensionScope','dimensionEvidence'): a[key]=evidence[key]
            a['dimensionSource']='catalog-spec';a['specSources']=[dict(url=evidence['url'],kind='official-spatial-review',checkedAt=evidence['checkedAt'])]
            for key in ('specModel','displayOrientation','canonicalSize','displayBezel','displayBezelSource','displayPanelSize','displayCurvature','displayPhotoQuad','name'):
                if key in evidence:a[key]=evidence[key]
        if a['kind'] in ('display','monitor'): assemble_display(a)
        if a['kind']=='kiosk': a['specColor']='#e4e5e3'
        if a['physical']:
            candidates=[p for p in products if a['specModel'] and p['id']!=a['productId'] and p.get('model')==a['specModel'] and p.get('gal')]
            if candidates:
                p=candidates[0]
                a['imageEvidence']=dict(thumbnail=p.get('th'),gallery=p.get('gal',[]),labels=p.get('galAlt',[]),pid=p.get('img'),scope='identical-model-reference',productId=p['id'])
        if a['kind']=='laptop':
            a['pose']='closed';a['imageEvidence']['pose']='manufacturer reference may show open lid'
        evidence=overrides.get(a['productId'],{})
        if 'imageEvidence' in evidence:a['imageEvidence']=evidence['imageEvidence']
        configure_display(a,details.get(a['productId'],{}),dimensions,products)
    result = dict(version=1, catalogSha256=hashlib.sha256((DATA/'products_db.json').read_bytes()).hexdigest(), assets=assets)
    target = DATA / 'spatial/product-objects.json'
    target.write_text(json.dumps(result, ensure_ascii=False, separators=(',',':'))+'\n')
    print(json.dumps(dict(products=len(assets), measured=sum(a['dimensionSource']=='catalog-spec' for a in assets),logical=sum(not a['physical'] for a in assets))))


if __name__ == '__main__':
    main()
