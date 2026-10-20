// Explicit real-model probe against the isolated spatial fixture, never a mock success.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,validateScene} from '../web/src/domain/spatial/scene.js';
const base='http://127.0.0.1:8793',out=new URL('./output/spatial/',import.meta.url);fs.mkdirSync(out,{recursive:true});
const auth=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'spatial-isolated-test-password'})});assert(auth.ok);
const cookie=auth.headers.get('set-cookie').split(';')[0],headers={'Content-Type':'application/json',Cookie:cookie};
const library=await (await fetch(base+'/api/spatial/library',{headers})).json();
const prompt='공유오피스 전체맵을 만들어줘. 입구 로비, 업무 공간 30석, 미팅룸 8석, 라운지 카페, 관리자 공간을 포함해. 업무 공간에는 모니터를 놓고 미팅룸에는 삼성 Flip을 놓아줘. 모던 우드 스타일이고 동선을 충분히 확보해줘.';
let result,scene,feedback,previousPlan,calls=0;
for(let i=0;i<2;i++){
  const response=await fetch(base+'/api/spatial/plan',{method:'POST',headers,body:JSON.stringify({industry:'OF',templateId:'cowork-full-standard',prompt,feedback,previousPlan})});
  result=await response.json();assert(response.ok,JSON.stringify(result));calls++;
  try{scene=createScene({...result.plan,provenance:{kind:'llm',model:result.model,prompt}},library);break;}
  catch(error){if(i)throw error;feedback=error.message;previousPlan=result.plan;}
}
assert.deepEqual(validateScene(scene,library).errors,[]);
const work=scene.rooms.find(r=>r.id==='cowork-work'),meeting=scene.rooms.find(r=>r.id==='cowork-meet');assert(work);assert(meeting);
assert.equal(scene.objects.filter(o=>o.roomId===work.id&&o.assetId==='furniture:taskchair').length,30);
assert.equal(scene.objects.filter(o=>o.roomId===meeting.id&&library.assets.find(a=>a.id===o.assetId)?.kind==='chair').length,8);
const savedResponse=await fetch(base+'/api/spatial/history',{method:'POST',headers,body:JSON.stringify({scene,view:'3d'})});const saved=await savedResponse.json();assert(savedResponse.ok,JSON.stringify(saved));
const reopened=await (await fetch(base+'/api/spatial/history/'+saved.id,{headers})).json();assert.deepEqual(reopened.scene,scene);
await fetch(base+'/api/spatial/history/'+saved.id,{method:'DELETE',headers});
fs.writeFileSync(new URL('live-plan.json',out),JSON.stringify({...result,calls},null,2));fs.writeFileSync(new URL('live-scene.json',out),JSON.stringify(scene));
console.log(JSON.stringify({ok:true,model:result.model,calls,rooms:scene.rooms.length,workSeats:30,meetingSeats:8,objects:scene.objects.length,assetRevision:scene.assetRevision}));
