"""Replace scenario opening sheets with existing, single-photo cover layouts."""
import copy,json
from pathlib import Path
from vertical_briefs import BRIEFS
ROOT=Path(__file__).resolve().parents[2]
T=ROOT/'app/web/src/domain/templates'
REVISION='single-photo-cover-v1'

def fingerprint(value):
 text=json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-16-le')
 h=2166136261
 for i in range(0,len(text),2):h=((h^(text[i]+256*text[i+1]))*16777619)&0xffffffff
 return f'{h:08x}'

def cover(f,title,subtitle,customer,scope,photo,notes=None):
 image={**copy.deepcopy(photo),'fit':'cover','keep':True}
 if f=='L_C01':text={1:'SAMSUNG',2:'BUSINESS PROPOSAL',3:title,4:subtitle,5:customer,6:scope,7:'CONFIDENTIAL'}
 else:text={1:'SAMSUNG',2:'BUSINESS PROPOSAL',3:title,4:subtitle,5:'CONFIDENTIAL',6:customer}
 result={'f':f,'t':{str(k):v for k,v in text.items()},'img':{'0':image}}
 if notes is not None:result['notes']=notes
 return result

def prior(old):
 f=old['f'];title='2'if f in['L_C08','L_C09']else'1'if f in['L_AIS_01','L_SOL_01']else'3'
 subtitle='3'if f in['L_C08','L_C09']else'4'
 image=next(iter(old.get('img',{})),'0')
 return {'f':f,'title':title,'subtitle':subtitle,'image':image,'t':{k:fingerprint(v)for k,v in old.get('t',{}).items()},'img':fingerprint(old.get('img',{}).get(image))}

def main():
 migration_file=T/'cover_migrations.json';migrations=json.loads(migration_file.read_text())if migration_file.exists()else{}
 changed=0
 briefs={b['key']:b for b in BRIEFS}
 photos=json.loads((ROOT/'app/data/proposal_cover_photos.json').read_text())
 for file in ['description_standard_scenarios.json','vertical_scenarios.json']:
  p=T/file;data=json.loads(p.read_text())
  for s in data['scenarios']:
   sid=s['id'];old=data['fills'][sid][0];migrations.setdefault(sid,prior(old));std=bool(s.get('std'));ops=sid.endswith('_2')
   industry=next(x['name']for x in data['sources']if x['key']==s['sourceSpec'])
   old_title=industry+'의 제품과 운영을 연결합니다'if std else s['title'].split(' — ',1)[-1]
   old_subtitle=industry+' · '+('공간별 제품·솔루션 표준 구성'if std else briefs[s['sourceSpec']]['variants'][1 if ops else 0]['scope'])
   migrations[sid]['alternatives']={'L_C08':{'title':'2','subtitle':'3','image':'0','t':{'2':fingerprint(old_title),'3':fingerprint(old_subtitle),'7':fingerprint('삼성 B2B 제안 구성'),'8':fingerprint('표준 구성안'if std else'고객 상황 기반 예시')},'img':None}}
   title=industry+'\n'+('표준 제안서'if std else'운영 개선 제안서'if ops else'도입 제안서')
   subtitle='대표 공간의 제품·솔루션과 운영 구상'if std else s['title'].split(' — ',1)[-1]
   customer='삼성 B2B'if std else data['customers'][sid]
   scope='업종별 공간·운영 제안'if std else briefs[s['sourceSpec']]['variants'][1 if ops else 0]['scope']
   photo=photos.get(sid,next(iter(old['img'].values())));new=cover('L_C01'if std or ops else'L_C02',title,subtitle,customer,scope,photo,old.get('notes'))
   before_bodies=copy.deepcopy(data['fills'][sid][1:]);data['fills'][sid][0]=new
   role='표지 · '+industry;first=s['flow'][0];first['slides'][0]={'f':new['f'],'role':role};first['goal']='제안서와 프로젝트 소개'
   story=data['story'][sid]['parts'].get(first['name'])
   if story and story.get('items'):story['items'][0]=role
   s['authoringRevision']='existing-layouts-v3';s['coverRevision']=REVISION
   assert data['fills'][sid][1:]==before_bodies
   changed+=1
  p.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
 legacy={}
 for b in json.loads((ROOT/'app/data/proposal_cover_briefs.json').read_text()):
  migrations.setdefault(b['id'],prior(b['prior']));legacy[b['id']]=cover(b['f'],b['title'],b['subtitle'],b['customer'],b['scope'],b['photo'],b['prior'].get('notes'))
 (T/'scenario_covers.json').write_text(json.dumps(legacy,ensure_ascii=False,separators=(',',':'))+'\n')
 migration_file.write_text(json.dumps(migrations,ensure_ascii=False,separators=(',',':'))+'\n')
 print(json.dumps({'covers':changed+len(legacy),'authored':changed,'original':len(legacy),'bodySlidesUnchanged':True}))

if __name__=='__main__':main()
