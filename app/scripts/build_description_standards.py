#!/usr/bin/env python3
"""Reconstruct twenty standard decks from the supplied descriptions, without original assets.

User authorization: source files are unavailable; use the descriptions and existing
Samsung registry images. Text, sequence, coordinates and available shape definitions
are preserved. Missing binary artwork is explicitly replaced, never claimed original.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unicodedata

from read_vertical_spec import parse
from vertical_briefs import BRIEFS
from build_vertical_scenarios import CAT,MEDIA,IMAGES,P,S,C,gallery,cut,SPACE_WORDS,SPACE_HINTS

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'output/description-standards'
DATA=ROOT/'app/web/src/domain/templates'
NORM=lambda s:re.sub(r'[^0-9a-z가-힣]','',unicodedata.normalize('NFC',str(s)).lower())
ALIASES=[
 ('thewall',r'The\s*Wall|더\s*월'),('onyx',r'Onyx|오닉스|시네마\s*LED'),
 ('flip',r'Flip|플립'),('tabs11',r'갤럭시\s*탭|Galaxy\s*Tab'),
 ('tabactive5',r'산업용\s*태블릿|탭\s*액티브|전술용\s*태블릿'),('xcover7',r'러기드\s*스마트폰|XCover|엑스커버'),
 ('hoteltv',r'호텔\s*TV'),('wf1way',r'1\s*Way|1way|1WAY|Infinite\s*AI\s*무풍'),('wf4way',r'4\s*Way|4way|4WAY'),
 ('ac360',r'에어컨\s*360|360\s*카세트'),('purifier',r'공기\s*청정기|큐브.?\s*Air'),
 ('airdresser',r'에어드레서|Air[Dd]resser'),('book',r'갤럭시\s*북|갤럭시북|Galaxy\s*Book'),
 ('watch',r'갤럭시\s*워치|웨어러블|스마트\s*워치'),('smarttag',r'스마트태그|SmartTag'),
 ('bi_fridge',r'냉장고|냉동고'),('bi_induction',r'인덕션'),('bi_dish',r'식기세척기'),
 ('laundry',r'세탁기|건조기|코인\s*세탁'),('erv',r'환기\s*시스템|ERV|청정\s*환기'),
 ('dvmchiller',r'DVM\s*칠러|Dvm\s*칠러'),('dvms2',r'DVM|시스템\s*에어컨'),
 ('window',r'양면형|윈도.*사이니지'),('kiosk',r'키오스크'),('led_outdoor',r'아웃도어\s*LED|실외.*LED'),
 ('led_indoor',r'LED\s*사이니지|LED\s*디스플레이'),('vm55b',r'비디오월'),
 ('qm55c',r'사이니지|디스플레이'),('harman',r'하만|HARMAN|JBL|AMX'),
]
SOL_ALIAS=[('lynk',r'LYNK|링크\s*클라우드'),('biot',r'b\.\s*IoT|빌딩\s*IoT|BEMS'),
 ('stpro',r'SmartThings\s*Pro|스마트싱스\s*프로'),('smartthings',r'SmartThings|스마트싱스'),
 ('magicinfo',r'Magic\s*Info|MagicINFO|매직인포'),('vxt',r'VXT'),('knoxsuite',r'Knox|녹스'),
 ('dex',r'\bDeX\b|덱스'),('care',r'세척|유지보수|케어\s*서비스'),('sac',r'DMS|중앙제어|MCU'),
 ('coldchain',r'콜드체인'),('unmanned',r'무인\s*과금|출입관리'),('partnerapp',r'테이블\s*오더|주문|결제')]
EXTRA_CUTS={
 'flip':('img/fill/sol-b.json#22','전자칠판 제품군 참고 컷'),
 'book':('img/fill/sol-a.json#13','갤럭시 북 제품군 참고 컷'),
 'airdresser':('img/fill/sol-b.json#29','에어드레서 제품군 참고 컷'),
 'airmonitor':('img/fill/sol-b.json#1','에어모니터 플러스 참고 컷'),
 'erv':('img/fill/sol-b.json#30','시스템 청정환기 참고 컷'),
}


def terms(s,aliases):return list(dict.fromkeys(key for key,rx in aliases if re.search(rx,s,re.I)))


def bbox(o):return [round(v*k,4) for v,k in zip(o['bbox_pct'],[12.8,7.2,12.8,7.2])]


def match_case(text):
    n=NORM(text)
    return next((c for c in C.values() if len(NORM(c['cust']))>=4 and NORM(c['cust']) in n),None)


def parse_style(o,source_pt):
    detail=o.get('source_detail','');brief=o.get('text_style_summary') or ''
    props=[];colors=[];align=None
    for line in detail.splitlines():
        if not re.match(r'^\| P\d+(?:\.R\d+|\.end)? \|',line):continue
        row=[v.strip() for v in re.split(r'(?<!\\)\|',line)[1:-1]]
        if len(row)!=5:continue
        try:
            pp=json.loads(row[3]);cc=json.loads(row[4]) if row[4] not in ['—','null'] else None
        except json.JSONDecodeError:continue
        if pp:
            if pp.get('algn'):align=pp['algn']
            props.append(pp)
        if cc:colors.append(cc)
    sizes=[float(p['sz'])/100 for p in props if p.get('sz')]
    sizes+=list(map(float,re.findall(r'([\d.]+)pt',brief)))
    size=Counter(sizes).most_common(1)[0][0] if sizes else None
    b=bbox(o);scale=1280/source_pt[0]
    if size is None:size=max(4,min(24,b[3]/scale*.65))
    if not align:
        m=re.search(r'가로=(\w+)',brief);align=m[1] if m else 'l'
    bold=any(p.get('b')=='1' for p in props) or bool(re.search(r'700|Bold|굵은',brief+' '+detail[:600]))
    return dict(size=round(size*scale,3),color=colors[0] if colors else None,bold=bold,align=align,
                summary=brief,body=o.get('bodyPr') or {})


def title_key(page,brief):
    return page['title']+' '+brief['name']+' '+ ' '.join(o['text'] or '' for o in page['objects'] if o['text'])


def studio_graphic(title,role,b):
    if role!='체험 스튜디오 초대':return None
    x,y,w,h=b;area=w*h/(1280*720);invitation='초대' in title
    name=None
    if area>.9:name='white'
    elif invitation and x>1280*.5 and area>.08:name='vip-card'
    elif invitation and x<128 and y>180 and h<150 and w>500:name='invitation-title'
    elif not invitation and y<170 and w>700:name='visit-title' if h>42 else 'visit-subtitle'
    elif not invitation and area>.12:name='studio-info' if x>500 else 'studio-poster'
    elif area<.05:
        return dict(src='img/fill/sol-b.json#36',name='SAMSUNG 흰 워드마크 · 등록 자료',fit='contain',keep=True,replacement=True,logo=True)
    if not name:return None
    return dict(src='/assets/description-standards/graphics/'+name+'.png',name=name+' · 설명 기반 재구성 그래픽',fit='cover',keep=True,replacement=True,
                source='poc/vertical_examples/entertainment.md · 공통 초대장/방문 안내 설명·OCR 참고',generated=True)


class Pictures:
    def __init__(self,brief):
        self.brief=brief;self.used=Counter();self.pool=[]
        for cid,c in C.items():
            for im in gallery('case',cid):
                if im['kind'] in ['s','e','p'] and im['w']/im['h']>.8:
                    self.pool.append({**im,'caseId':cid,'priority':cid in brief['cases']})
        for pid,im in IMAGES.items():
            if im.get('src') not in ['case','life'] or not pid.startswith('ph.'):continue
            if not (ROOT/'app/data/static'/im['file']).is_file():continue
            self.pool.append(dict(src=im['file'],desc=im['desc'],owner='삼성 등록 자료',page=im.get('page',''),kind='s',
                                  ind=pid.split('.')[1].split('-')[0].upper(),pid=pid))

    def pick(self,query,typ='scene',product=None,case=None,slot=0):
        if typ=='cut':
            rec=cut(product) if product in P else None
            if rec:return dict(src=rec['src'],name=rec['desc']+' · 제품군 참고 컷',fit='contain',keep=True,pid=rec.get('pid'),
                               source=rec.get('page',''),products=[product],replacement=True)
            if product in EXTRA_CUTS:
                src,name=EXTRA_CUTS[product];return dict(src=src,name=name,fit='contain',keep=True,replacement=True,products=[product] if product in P else [])
            if product=='laundry':
                x=next(x for x in gallery('case','2172') if '세탁기' in x['desc'])
                return dict(src=x['src'],name=x['desc']+' · 세탁·건조 제품군 참고사진',fit='contain',keep=True,source=x['page'],replacement=True,products=['laundry'])
        if typ=='ui':
            sol=terms(query,SOL_ALIAS)
            if sol:
                pool=gallery('solution',sol[0]);ui=[p for p in pool if p['kind'] in ['u','d','k']]
                if ui:
                    x=ui[slot%len(ui)];return dict(src=x['src'],name=x['desc']+' · '+x['owner'],fit='contain',keep=True,source=x['page'],replacement=True)
        q=query
        for label in sorted(SPACE_HINTS,key=len,reverse=True):
            if label in q:q=q.replace(label,SPACE_HINTS[label]);break
        def score(x):
            value=6 if x.get('ind')==self.brief['ind'] else 0
            if x.get('priority'):value+=3
            if case and x.get('caseId')==str(case['id']):value+=55
            for word in set(q.split()):
                if word not in ['AI','삼성','고객','공간','제안','솔루션'] and len(word)>1 and word in re.sub(r'\s','',x['desc']):value+=6
            for pat,rx in SPACE_WORDS:
                if re.search(pat,q) and re.search(rx,x['desc']):value+=12
            if re.search(r'관제|관리실',q) and re.search(r'관제|대시보드|관리 화면',x['desc']):value+=12
            if re.search(r'거실|주방|병실|강의|회의',q) and re.search(r'외관|건물 외벽|실외기|옥상',x['desc']):value-=25
            if re.search(r'물류|출고',q) and not re.search(r'물류|택배|출고|배송|적재|박스|창고',x['desc']):value-=25
            return value-min(3,self.used[x['src']])
        x=max(self.pool,key=score);self.used[x['src']]+=1
        return dict(src=x['src'],name=x['desc']+' · '+x['owner']+' (설명 기반 대체 이미지)',fit='cover',keep=True,
                    source=x.get('page',''),replacement=True)


def make_scene(src,page,brief,pictures):
    text=title_key(page,brief);page_products=terms(text,ALIASES);case=match_case(page['title'])
    objects=page['objects'];nodes=[];source_text=[];binding=[]
    for order,o in enumerate(objects):
        b=bbox(o);g=o.get('geometry') or {};body=(o.get('text') or '')
        if g.get('xfrm',{}).get('chOff') is not None or o['name'].startswith('그룹·') or re.search(r'^그룹 \d+$',o['name']):continue
        base=dict(box=b,order=order,sourceId=o['id'],geometry=g,summary=o.get('source_detail','') if not g else '')
        if o.get('table'):
            tb=o['table'];x,y,w,h=b;totalw=sum(tb['cols']);totalh=sum(tb['rows'])
            for cell in tb['cells']:
                if cell['hidden']:continue
                cx=x+sum(tb['cols'][:cell['col']])/totalw*w;cy=y+sum(tb['rows'][:cell['row']])/totalh*h
                cw=sum(tb['cols'][cell['col']:cell['col']+cell['colspan']])/totalw*w
                ch=sum(tb['rows'][cell['row']:cell['row']+cell['rowspan']])/totalh*h
                val=cell['text'];nodes.append(dict(kind='text',box=[cx,cy,cw,ch],text=val,order=order,sourceId=o['id']+f":{cell['row']}:{cell['col']}",
                    geometry=cell['style'],style=dict(size=min(19,ch*.45),bold=cell['col']==0,align='ctr',color=None,body={}),tableCell=True,
                    tableId=o['id'],tableBox=b,tableRows=[v/totalh*h for v in tb['rows']],tableCols=[v/totalw*w for v in tb['cols']],
                    row=cell['row'],col=cell['col'],rowspan=cell['rowspan'],colspan=cell['colspan']))
                if val:source_text.append(val)
            binding.append(dict(source=o['id'],kind='table',cells=len(tb['cells'])));continue
        if o.get('asset'):
            if b[2]<3 or b[3]<3:continue
            nearby=sorted((a for a in objects if a.get('text') and not a['text'].lstrip().startswith(('*','※')) and bbox(a)[1]<650),key=lambda t:abs(bbox(t)[0]-b[0])+abs(bbox(t)[1]-b[1]))[:4]
            context=page['title']+' '+' '.join(t['text'] for t in nearby)
            if page['role'] in ['표지','챕터 전환','목차·현재 장 안내'] and b[2]*b[3]>1280*720*.4:
                context=brief['name']+' '+brief['spaces'][0]+' '+brief['spaces'][1]
            if page['role']=='기업 역량·신뢰 근거' and '브랜드 가치' in page['title']:
                nodes.append({**base,'kind':'shape','motif':True,'geometry':{'prstGeom':{'prst':'star5'},'solidFill':{'srgbClr':{'val':'2D70F8'}}}})
                binding.append(dict(source=o['id'],kind='reconstructed-brand-motif',original=o['asset']['path']));continue
            prod=terms(context,ALIASES)
            if re.search(r'에어모니터',context):prod=['airmonitor']+prod
            area=b[2]*b[3]/(1280*720)
            kind='scene'
            if '챕터' not in page['role'] and '목차' not in page['role'] and '표지'!=page['role']:
                if prod and (area<.065 or (b[2]<440 and b[3]>120 and re.search(r'제품|성능|에어모니터|공기청정기|냉장고|에어드레서|갤럭시',page['title']))):kind='cut'
                if terms(context,SOL_ALIAS) and re.search(r'구성|화면|관리|솔루션|연동',page['title']) and .02<area<.4:kind='ui'
            # An icon-sized original without recoverable pixels is reconstructed
            # as a simple vector motif; do not fill it with an unrelated photo.
            if area<.0015 and kind=='scene':
                nodes.append({**base,'kind':'shape','motif':True});continue
            chosen=studio_graphic(page['title'],page['role'],b) or pictures.pick(context,kind,prod[0] if prod else None,case,len(binding))
            nodes.append({**base,'kind':'image','image':chosen,'originalAsset':o['asset']['path']})
            binding.append(dict(source=o['id'],kind=kind,original=o['asset']['path'],replacement=chosen['src']));continue
        if body:
            if body.strip() in ['‹#›','<#>']:body=str(page['number'])
            nodes.append({**base,'kind':'text','text':body,'style':parse_style(o,src['source_pt'])})
            source_text.append(body);binding.append(dict(source=o['id'],kind='text',text=body))
        elif g or base['summary']:
            if b[2]<.2 and b[3]<.2:continue
            nodes.append({**base,'kind':'shape'})
    # Master-level headers and the ending logo are described even when a slide
    # has no direct objects. Preserve those visible pieces rather than a blank page.
    if page['role']=='브랜드 엔딩':
        logo=(32.61,41.78,34.78,16.44) if brief['key'].startswith('ai_') else (29.16,40.15,41.68,19.70)
        nodes=[dict(kind='image',box=[v*k for v,k in zip(logo,[12.8,7.2,12.8,7.2])],order=1,sourceId='master-logo',geometry={},
                    image=dict(src='img/fill/sol-b.json#36',name='SAMSUNG 흰 워드마크 · 등록 자료',fit='contain',keep=True,replacement=True,logo=True))]
    elif not any(n['kind']=='text' and n['text'].strip() for n in nodes):
        nodes.append(dict(kind='text',box=[48,48,1184,94],order=10000,sourceId='description-title',geometry={},
                          text=page['title'],style=dict(size=40,bold=True,align='l',color=None,body={})))
    # A few source-master titles are omitted from the slide's direct-object list.
    header_text=' '.join(n['text'] for n in nodes if n['kind']=='text' and n['box'][1]<140)
    if page['role'] not in ['표지','브랜드 엔딩','챕터 전환'] and not header_text.strip():
        nodes.append(dict(kind='text',box=[32,24,1190,65],order=10000,sourceId='master-title',geometry={},text=page['title'],
                          style=dict(size=32,bold=True,align='l',color=None,body={})))
    if page['role']=='체험 스튜디오 초대':nodes=[n for n in nodes if n['sourceId'] not in ['master-title','description-title']]
    elif page['role']=='목차·현재 장 안내':nodes=[n for n in nodes if n['sourceId']!='master-title']
    return dict(key=brief['key'],ind=brief['ind'],number=page['number'],title=page['title'],role=page['role'],
                source=src['source'],sourceLine=page['source_line'],sourcePt=src['source_pt'],nodes=nodes,
                products=page_products,solutions=terms(text,SOL_ALIAS),caseId=str(case['id']) if case else None,
                sourceText=source_text,bindings=binding,notes=page['layout_notes'],hidden=page['hidden'])


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--only');ap.add_argument('--studio-only',action='store_true');args=ap.parse_args()
    OUT.mkdir(parents=True,exist_ok=True);scenes=[];sources=[]
    subprocess.run(['node',str(ROOT/'app/scripts/build_studio_graphics.mjs')],cwd=ROOT,check=True)
    if args.studio_only:
        original=json.loads((OUT/'scene.json').read_text())
        for scene in original['scenes']:
            if scene['role']=='체험 스튜디오 초대':scene['nodes']=[n for n in scene['nodes'] if n['sourceId'] not in ['master-title','description-title']]
            elif scene['role']=='목차·현재 장 안내':scene['nodes']=[n for n in scene['nodes'] if n['sourceId']!='master-title']
            for node in scene['nodes']:
                if node['kind']!='image':continue
                chosen=studio_graphic(scene['title'],scene['role'],node['box'])
                if chosen:
                    node['image']=chosen
                    for bind in scene['bindings']:
                        if bind.get('source')==node['sourceId']:bind['replacement']=chosen['src']
        (OUT/'scene.json').write_text(json.dumps(original,ensure_ascii=False,separators=(',',':')))
        subprocess.run(['node',str(ROOT/'app/scripts/compile_description_standards.mjs')],cwd=ROOT,check=True)
        return
    for brief in BRIEFS:
        if args.only and brief['key']!=args.only:continue
        src=parse(ROOT/'poc/vertical_examples'/(brief['key']+'.md'));pictures=Pictures(brief)
        group=[make_scene(src,p,brief,pictures) for p in src['pages']]
        scenes+=group;sources.append(dict(key=brief['key'],name=brief['name'],ind=brief['ind'],slides=src['slide_count'],sha256=src['sha256'],source=src['source']))
        print(f"{brief['key']}: {src['slide_count']} pages; {sum(n['kind']=='text' for p in group for n in p['nodes'])} text slots; description-based image bindings",flush=True)
        (OUT/(brief['key']+'-scene.json')).write_text(json.dumps(group,ensure_ascii=False,separators=(',',':')))
    (OUT/'scene.json').write_text(json.dumps(dict(sources=sources,scenes=scenes),ensure_ascii=False,separators=(',',':')))
    subprocess.run(['node',str(ROOT/'app/scripts/compile_description_standards.mjs')],cwd=ROOT,check=True)


if __name__=='__main__':main()
