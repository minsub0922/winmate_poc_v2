// 명령 해석 실제 모델 점검 — 사용자 예시 문장을 실제 모델(LLM · Decision)에 보내고, 돌아온 조작을 장면에 적용해 본다.
// 모델에 연결된 격리 API가 필요하다(루트 .env의 키 사용):
//   WINMATE_AUTH_DIR=<임시> WINMATE_API_PORT=8962 WINMATE_CACHE_BACKEND=memory WINMATE_SPATIAL_PREWARM=off WINMATE_DECISION=auto|off \
//     app/.venv/bin/python app/tests/fixtures/spatial/server.py
// 실행: SPATIAL_LIVE_API=http://127.0.0.1:8962 node app/tests/spatial-command-live.mjs   (일반 테스트 묶음에는 넣지 않는다 — 모델 호출 비용)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,addAsset,validateScene} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene,emptyStudioForm} from '../web/src/domain/spatial/studio-form.js';
import {applySpatialCommand} from '../web/src/domain/spatial/command-apply.js';
import {directionBasis} from '../web/src/domain/spatial/object-ops.js';
import {spatialAssetLabel} from '../web/src/domain/spatial/catalog.js';

const api=process.env.SPATIAL_LIVE_API||'http://127.0.0.1:8962';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url))),assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
const login=await fetch(api+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:api},body:JSON.stringify({username:'admin',password:'spatial-isolated-test-password'})});
assert.equal(login.status,200,'login');const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');

// 주거 장면(거실 · 세탁실 …)에 사람 연출 하나를 놓아 둔다
let scene=createScene({templateId:'rs-full-standard'},library);
const living=scene.rooms.find(r=>r.name==='거실'),laundry=scene.rooms.find(r=>r.name.includes('세탁')),bedroom=scene.rooms.find(r=>r.name.includes('침실'));
let person=null;
for(const asset of library.assets.filter(a=>a.assetGroup==='people'&&a.physical&&a.catalogVisible!==false)){for(const room of [bedroom,scene.rooms[0],scene.rooms[4]]){try{const before=new Set(scene.objects.map(o=>o.id));const next=addAsset(scene,asset.id,room.id,library);person=next.objects.find(o=>!before.has(o.id));scene=next;break;}catch{}}if(person)break;}
assert(person,'a people bundle is placed');
const sofa=scene.objects.find(o=>o.roomId===living.id&&/소파$/.test(assets[o.assetId].name)),washer=library.assets.find(a=>a.productId&&/세탁기/.test(a.name)&&a.physical),plant=scene.objects.find(o=>o.assetId==='furniture:plant');
assert(sofa&&washer&&plant);
const form=studioFormFromScene(scene);
const tag={
  room:r=>({kind:'room',id:r.id,label:r.name}),
  object:o=>({kind:'object',id:o.id,label:`${spatialAssetLabel(assets[o.assetId])} · ${scene.rooms.find(r=>r.id===o.roomId).name} #${scene.objects.indexOf(o)+1}`}),
  asset:a=>({kind:'asset',id:a.id,label:spatialAssetLabel(a)+' · 새로 추가'}),
  space:(kind,name)=>({kind:'space',id:kind,label:name}),
};
const t=m=>'@['+m.label+']';
const L=tag.room(living),P=tag.object(person),S=tag.object(sofa),W=tag.asset(washer),PL=tag.object(plant),M=tag.space('meeting','회의실');
const cases=[
  {name:'예시 1 · 복사',prompt:`${t(L)} 에 ${t(P)} 2명 복사해`,mentions:[L,P],expect:ops=>ops.length===1&&ops[0].type==='copy'&&ops[0].objectId===person.id&&ops[0].quantity===2&&ops[0].roomId===living.id},
  {name:'예시 2 · 오른쪽으로',prompt:`${t(S)} 배치 오른쪽으로 옮겨`,mentions:[S],expect:ops=>ops.length===1&&ops[0].type==='move'&&ops[0].objectId===sofa.id&&ops[0].direction==='right'},
  {name:'예시 3 · 추가',prompt:`${t(W)} 3개 추가해`,mentions:[W],roomId:laundry.id,expect:ops=>ops.length===1&&ops[0].type==='add'&&ops[0].assetId===washer.id&&ops[0].quantity===3&&ops[0].roomId===laundry.id},
  {name:'예시 3 · 보는 공간 없이',prompt:`${t(W)} 3개 추가해`,mentions:[W],expect:ops=>ops.length===0||ops.length===1&&ops[0].type==='add'&&ops[0].quantity===3},
  {name:'세 문장 한 번에',prompt:`${t(L)} 에 ${t(P)} 2명 복사해. 그리고 ${t(S)} 배치 오른쪽으로 옮겨. ${t(W)} 3개 추가해.`,mentions:[L,P,S,W],roomId:laundry.id,expect:ops=>ops.length===3&&ops.map(o=>o.type).join()==='copy,move,add'},
  {name:'회전',prompt:`${t(PL)} 왼쪽으로 45도 돌려`,mentions:[PL],expect:ops=>ops.length===1&&ops[0].type==='rotate'&&ops[0].angle===-45},
  {name:'거리 있는 이동',prompt:`${t(PL)} 왼쪽으로 50cm 옮겨`,mentions:[PL],expect:ops=>ops.length===1&&ops[0].type==='move'&&ops[0].direction==='left'&&Math.abs(ops[0].distance-.5)<1e-9},
  {name:'다른 공간으로',prompt:`${t(PL)} 를 ${t(L)} 로 옮겨`,mentions:[PL,L],expect:ops=>ops.length===1&&ops[0].type==='move'&&ops[0].roomId===living.id},
  {name:'삭제',prompt:`${t(PL)} 지워줘`,mentions:[PL],expect:ops=>ops.length===1&&ops[0].type==='remove'&&ops[0].objectId===plant.id},
  {name:'공간 추가',prompt:`${t(M)} 하나 추가해`,mentions:[M],expect:ops=>ops.length===1&&ops[0].type==='room_add'&&ops[0].kind==='meeting'},
  {name:'공간 이름 바꾸기',prompt:`${t(L)} 이름을 패밀리룸으로 바꿔`,mentions:[L],expect:ops=>ops.length===1&&ops[0].type==='room_update'&&ops[0].name==='패밀리룸'},
  {name:'태그한 것 옆의 다른 것',prompt:`${t(S)} 옆에 있는 수목 지워줘`,mentions:[S],expect:ops=>ops.every(o=>o.objectId!==sofa.id)},
  {name:'태그 둘 다',prompt:`${t(S)} 랑 ${t(PL)} 둘 다 지워줘`,mentions:[S,PL],expect:ops=>ops.length===2&&ops.every(o=>o.type==='remove')&&new Set(ops.map(o=>o.objectId)).size===2},
  {name:'태그 없이',prompt:'거실에 있는 소파를 왼쪽으로 1미터 옮겨줘',mentions:[],expect:ops=>ops.length>=1&&ops.every(o=>o.type==='move'&&o.direction==='left')},
  {name:'모호한 요청',prompt:'좀 더 예쁘게 해줘',mentions:[],expect:ops=>ops.length===0||ops.every(o=>o.type==='style')},
  {name:'빈 스튜디오',blank:true,prompt:`${t(M)} 만들고 수목 하나 놓아줘`,mentions:[M],expect:ops=>ops[0]?.type==='room_add'},
];
const only=process.env.SPATIAL_LIVE_ONLY;let failed=0;const rows=[];
for(const c of cases.filter(c=>!only||c.name.includes(only))){
  const started=Date.now(),body={prompt:c.prompt,mentions:c.mentions,scene:c.blank?null:scene,...(c.blank?{industry:'OF'}:{}),...(c.roomId?{roomId:c.roomId}:{}),view:'2d'};
  const response=await fetch(api+'/api/spatial/command',{method:'POST',headers:{'Content-Type':'application/json',Origin:api,Cookie:cookie},body:JSON.stringify(body)}),ms=Date.now()-started;
  const data=await response.json().catch(()=>({}));
  if(!response.ok){failed++;rows.push({case:c.name,status:response.status,detail:data.detail,ms});console.log('FAIL '+c.name+' · HTTP '+response.status+' · '+JSON.stringify(data.detail));continue;}
  const ops=data.plan.operations;let applied='(조작 없음) '+data.plan.explanation,ok=c.expect(ops);
  if(ops.length){try{const result=applySpatialCommand({scene:c.blank?null:scene,form:c.blank?{...emptyStudioForm(),industry:'OF'}:form},data.plan,library,{basis:directionBasis('2d'),documentId:'live'});assert.deepEqual(validateScene(result.scene,library).errors,[]);applied=result.lines.join(' ');}catch(e){applied='적용 실패: '+e.message;ok=false;}}
  if(!ok)failed++;
  rows.push({case:c.name,source:data.source,model:data.model,ms,operations:ops,applied,ok});
  console.log(`${ok?'PASS':'FAIL'} ${c.name} · ${data.source} · ${ms}ms\n     ${c.prompt}\n     → ${JSON.stringify(ops)}\n     → ${applied}`);
}
console.log(JSON.stringify({api,cases:rows.length,failed,sources:rows.reduce((n,r)=>({...n,[r.source||'error']:(n[r.source||'error']||0)+1}),{}),medianMs:rows.map(r=>r.ms).sort((a,b)=>a-b)[Math.floor(rows.length/2)]}));
process.exit(failed?1:0);
