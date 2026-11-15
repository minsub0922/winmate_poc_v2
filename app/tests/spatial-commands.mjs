// 명령 조작 엔진 — 복제 · 방향 이동 · 회전 · 공간 간 이동과 조작 목록의 원자적 적용 (domain/spatial/object-ops.js · command-apply.js)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,validateScene,objectBounds,addAsset,round} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene,emptyStudioForm} from '../web/src/domain/spatial/studio-form.js';
import {directionBasis,copyObject,rotateObject,nudgeObject,moveObjectToRoom} from '../web/src/domain/spatial/object-ops.js';
import {applySpatialCommand} from '../web/src/domain/spatial/command-apply.js';

const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url)));
const assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
const scene=createScene({templateId:'cowork-full-standard'},library),original=structuredClone(scene),form=studioFormFromScene(scene);
const count=(s,assetId,roomId)=>s.objects.filter(o=>o.assetId===assetId&&(!roomId||o.roomId===roomId)).length;
const ok=s=>assert.deepEqual(validateScene(s,library).errors,[]);
const flat={basis:directionBasis('2d'),focusRoomId:null,documentId:'test'};
const run=(ops,state={scene,form},options=flat)=>applySpatialCommand(state,{operations:ops},library,options);

// 방향 기준 — 2D는 지도 좌표, 3D는 카메라가 보는 방향(가장 가까운 지도 축)
assert.deepEqual(directionBasis('2d'),{right:[1,0],forward:[0,1]});
assert.deepEqual(directionBasis('3d',{azimuth:0}),{right:[1,0],forward:[0,1]});
assert.deepEqual(directionBasis('3d',{azimuth:90}),{right:[0,-1],forward:[1,0]});
assert.deepEqual(directionBasis('3d',{position:[10,8,4],target:[4,0,4]}),directionBasis('3d',{azimuth:90}));
{const a=directionBasis('3d',{azimuth:0}).right,b=directionBasis('3d',{azimuth:90}).right;assert.equal(a[0]*b[0]+a[1]*b[1],0);}
console.log('PASS direction basis follows the view: plan = map axes, 3D = camera side snapped to the nearest axis');

// 복제 — 다른 공간으로 2개, 회전 유지, 원본 공간은 그대로
const plant=scene.objects.find(o=>o.assetId==='furniture:plant');assert(plant);
const other=scene.rooms.find(r=>r.id!==plant.roomId);
const copied=run([{type:'copy',objectId:plant.id,quantity:2,roomId:other.id}]);
assert.equal(count(copied.scene,plant.assetId,other.id),count(scene,plant.assetId,other.id)+2);
assert.equal(count(copied.scene,plant.assetId,plant.roomId),count(scene,plant.assetId,plant.roomId));
const fresh=copied.scene.objects.filter(o=>o.assetId===plant.assetId&&!scene.objects.some(x=>x.id===o.id));
assert.equal(fresh.length,2);assert(fresh.every(o=>o.roomId===other.id&&o.rotation===plant.rotation));
assert.equal(new Set(copied.scene.objects.map(o=>o.id)).size,copied.scene.objects.length);ok(copied.scene);
assert.equal(copied.scene.revision,scene.revision+1);assert.deepEqual(scene,original);
assert.equal(copied.lines.length,1);assert.match(copied.lines[0],/2개/);assert.match(copied.lines[0],/복제/);
console.log('PASS copy places N clones in the target room, keeps rotation, leaves the source room and the input scene untouched');

// 복제 — 얹힌 것 · 딸린 것 · 사람을 함께 가져간다
const parents=scene.objects.filter(o=>scene.objects.some(c=>c.supportId===o.id));assert(parents.length);
let carried=null;
for(const parent of parents){for(const room of scene.rooms){try{const result=copyObject(scene,parent.id,room.id,library);carried={parent,room,result};break;}catch{}}if(carried)break;}
assert(carried,'at least one furniture group can be copied somewhere');
{const {parent,result}=carried,clone=result.scene.objects.find(o=>o.id===result.objectId);
  const children=s=>id=>s.objects.filter(o=>o.supportId===id).map(o=>o.assetId).sort();
  assert.deepEqual(children(result.scene)(clone.id),children(scene)(parent.id));
  assert.deepEqual(clone.people,parent.people);assert.equal(clone.assetId,parent.assetId);
  const followers=s=>id=>s.objects.filter(o=>o.facing?.moveWithTarget&&o.facing.targetId===id).length;
  assert.equal(followers(result.scene)(clone.id),followers(scene)(parent.id));ok(result.scene);}
console.log('PASS copying furniture carries the products on it, its linked seats and its attached people');

// 방향 이동 — 오른쪽 1m (평면도), 벽 · 가구에 막히면 직전까지
let free=null,clipped=null;
for(const o of scene.objects.filter(o=>!o.supportId)){
  try{const r=nudgeObject(scene,o.id,[1,0],library);if(!free&&r.moved===1)free={o,r};}catch{}
  const room=scene.rooms.find(r=>r.id===o.roomId),b=objectBounds(o,assets),gap=room.x+room.width-(b.x+b.w);
  if(!clipped&&gap>.1&&gap<2){try{const r=nudgeObject(scene,o.id,[3,0],library);clipped={o,r,room};}catch{}}
  if(free&&clipped)break;
}
assert(free,'some object has 1m of free space to its right');
{const after=free.r.scene.objects.find(o=>o.id===free.o.id);assert.equal(after.x,round(free.o.x+1));assert.equal(after.z,free.o.z);assert.equal(free.r.requested,1);ok(free.r.scene);}
assert(clipped,'some object is stopped by a wall or neighbour');
{const after=clipped.r.scene.objects.find(o=>o.id===clipped.o.id),b=objectBounds(after,assets);
  assert(clipped.r.moved>0&&clipped.r.moved<clipped.r.requested);assert.equal(clipped.r.requested,3);
  assert(b.x+b.w<=clipped.room.x+clipped.room.width+.011);ok(clipped.r.scene);}
const commanded=run([{type:'move',objectId:free.o.id,direction:'right',distance:1}]);
assert.equal(commanded.scene.objects.find(o=>o.id===free.o.id).x,round(free.o.x+1));
const defaulted=run([{type:'move',objectId:free.o.id,direction:'right'}]);
assert.equal(defaulted.scene.objects.find(o=>o.id===free.o.id).x,round(free.o.x+1),'distance defaults to 1m');
const turned=run([{type:'move',objectId:free.o.id,direction:'forward',distance:1}],{scene,form},{...flat,basis:directionBasis('3d',{azimuth:90})});
assert.equal(turned.scene.objects.find(o=>o.id===free.o.id).x,round(free.o.x+1),'forward at azimuth 90 is +X');
const clippedLine=run([{type:'move',objectId:clipped.o.id,direction:'right',distance:3}]);assert.match(clippedLine.lines[0],/까지만/);
assert.throws(()=>nudgeObject(scene,free.o.id,[0,0],library));
console.log('PASS direction moves use the view basis, default to 1m and stop just before a wall or neighbour');

// 회전 — 상대 각도(오른쪽 = 시계 방향) · 절대 각도, 얹힌 것 함께
const spun=rotateObject(scene,plant.id,{angle:90},library);assert.equal(spun.objects.find(o=>o.id===plant.id).rotation,(plant.rotation+90)%360);ok(spun);
assert.equal(rotateObject(scene,plant.id,{angle:-90},library).objects.find(o=>o.id===plant.id).rotation,(plant.rotation+270)%360);
assert.equal(rotateObject(scene,plant.id,{rotation:450},library).objects.find(o=>o.id===plant.id).rotation,90);
let group=null;for(const parent of parents){try{const next=rotateObject(scene,parent.id,{angle:180},library);group={parent,next};break;}catch{}}
if(group){const child=scene.objects.find(o=>o.supportId===group.parent.id),after=group.next.objects.find(o=>o.id===child.id),host=group.next.objects.find(o=>o.id===group.parent.id);
  assert(Math.abs((after.x-host.x)+(child.x-group.parent.x))<.01&&Math.abs((after.z-host.z)+(child.z-group.parent.z))<.01,'items on top swing around with the furniture');}
assert.equal(run([{type:'rotate',objectId:plant.id,angle:90}]).scene.objects.find(o=>o.id===plant.id).rotation,(plant.rotation+90)%360);
console.log('PASS rotation is relative (clockwise positive) or absolute, normalised to 0–359 and carries what sits on the object');

// 다른 공간으로 옮기기 — ID 유지
const relocated=moveObjectToRoom(scene,plant.id,other.id,library);
assert.equal(relocated.objects.find(o=>o.id===plant.id).roomId,other.id);assert.equal(relocated.objects.length,scene.objects.length);ok(relocated);
assert.equal(run([{type:'move',objectId:plant.id,roomId:other.id}]).scene.objects.find(o=>o.id===plant.id).roomId,other.id);
console.log('PASS moving to another room keeps the instance and finds a free spot there');

// 입력 폼 동기화 — 제품 수량이 조작을 따라간다
const room0=scene.rooms[0].id,quantity=f=>f.rooms.find(r=>r.id===room0).products.find(p=>p.productId==='qm65c')?.quantity||0;
const stocked=run([{type:'add',assetId:'product:qm65c',roomId:room0,quantity:2}]);
assert.equal(count(stocked.scene,'product:qm65c',room0),count(scene,'product:qm65c',room0)+2);assert.equal(quantity(stocked.form),quantity(form)+2);
assert.match(stocked.lines[0],/2개/);assert.match(stocked.lines[0],/추가/);
console.log('PASS the hidden studio form follows command edits');

// 원자성 — 자리가 모자란 추가는 일부만 넣지 않는다
let tight=scene,fits=0;
for(;fits<60;fits++){try{tight=addAsset(tight,'furniture:plant',room0,library);}catch{break;}}
assert(fits>=1&&fits<60,'the room eventually fills up');
let almost=scene;for(let i=0;i<fits-1;i++)almost=addAsset(almost,'furniture:plant',room0,library);
const almostSnapshot=structuredClone(almost),almostForm=studioFormFromScene(almost);
assert.throws(()=>run([{type:'add',assetId:'furniture:plant',roomId:room0,quantity:3}],{scene:almost,form:almostForm}));
assert.deepEqual(almost,almostSnapshot);
ok(run([{type:'add',assetId:'furniture:plant',roomId:room0,quantity:1}],{scene:almost,form:almostForm}).scene);
console.log('PASS adding more than fits fails as a whole and leaves the scene unchanged');

// 원자성 — 앞 조작이 없앤 대상을 뒤 조작이 쓰면 전체 실패
assert.throws(()=>run([{type:'remove',objectId:plant.id},{type:'move',objectId:plant.id,direction:'right'}]),/찾지 못/);
assert.throws(()=>run([{type:'copy',objectId:plant.id,quantity:31}]));
assert.throws(()=>run([{type:'copy',objectId:plant.id,quantity:1,roomId:'nowhere'}]));
assert.throws(()=>run([{type:'teleport',objectId:plant.id}]));
assert.throws(()=>run([{type:'move',objectId:plant.id,direction:'up'}]));
assert.throws(()=>run([]));
assert.deepEqual(scene,original);
const several=run([{type:'copy',objectId:plant.id,quantity:1},{type:'rotate',objectId:plant.id,angle:90},{type:'remove',objectId:free.o.id}]);
assert.equal(several.lines.length,3);assert.deepEqual(several.removed,[free.o.id]);ok(several.scene);assert.equal(several.scene.revision,scene.revision+1);
console.log('PASS a command whose later step loses its target, or that is malformed, changes nothing; a multi-step command applies as one revision');

// 장면이 없으면 오브젝트 조작은 할 수 없다
assert.throws(()=>run([{type:'add',assetId:'furniture:plant',roomId:room0,quantity:1}],{scene:null,form:{...form,rooms:[]}}),/공간/);
console.log('PASS object commands need a scene');

// 공간 조작 — 같은 명령 안에서 새 공간을 만들고(ref) 그 안에 추가한다
const roomOnly=run([{type:'room_add',kind:'meeting',name:'새 회의실',ref:'new-1'}]);
const made=roomOnly.scene.rooms.find(r=>r.name==='새 회의실');assert(made);assert.equal(roomOnly.scene.rooms.length,scene.rooms.length+1);
const built=run([{type:'room_add',kind:'meeting',name:'새 회의실',ref:'new-1'},{type:'add',assetId:'furniture:plant',roomId:'new-1',quantity:2}]);
const builtRoom=built.scene.rooms.find(r=>r.name==='새 회의실');
assert.equal(count(built.scene,'furniture:plant',builtRoom.id),count(roomOnly.scene,'furniture:plant',made.id)+2);
assert.equal(built.lines.length,2);assert.match(built.lines[0],/새 회의실/);assert.equal(built.form.rooms.length,scene.rooms.length+1);ok(built.scene);
assert.throws(()=>run([{type:'add',assetId:'furniture:plant',roomId:'new-1',quantity:1}]),/공간/);
const blankForm={...emptyStudioForm(),industry:library.industries[0].code};
const started=run([{type:'room_add',kind:'lounge',ref:'new-1'},{type:'add',assetId:'furniture:plant',roomId:'new-1',quantity:1}],{scene:null,form:blankForm});
assert.equal(started.scene.rooms.length,1);assert.equal(started.form.rooms.length,1);ok(started.scene);
const dropped=run([{type:'room_remove',roomId:scene.rooms[1].id}]);
assert.equal(dropped.scene.rooms.length,scene.rooms.length-1);assert.deepEqual(dropped.removedRooms,[scene.rooms[1].id]);assert.match(dropped.lines[0],/삭제/);
const retitled=run([{type:'room_update',roomId:scene.rooms[0].id,name:'대회의실'}]);
assert.equal(retitled.scene.rooms[0].name,'대회의실');assert.equal(retitled.form.rooms[0].name,'대회의실');
const emptied=run([{type:'room_remove',roomId:started.scene.rooms[0].id}],{scene:started.scene,form:started.form});
assert.equal(emptied.scene,null);assert.deepEqual(emptied.form.rooms,[]);
assert.throws(()=>run([{type:'room_remove',roomId:scene.rooms[1].id},{type:'add',assetId:'furniture:plant',roomId:scene.rooms[1].id,quantity:1}]),/공간/);
assert.deepEqual(scene,original);
console.log('PASS room commands build, rename and remove rooms; a new room can be filled in the same command; a blank studio starts with its first room');

// ---- 검토에서 나온 문제 (2026-11-15 최종 검토) ----
// 회전한 뒤 옮겨도 회전이 풀리지 않는다 — 자동으로 마주 보게 놓인 의자 · 소파도
{
  const candidates=scene.objects.filter(o=>o.facing?.automatic&&!o.supportId);assert(candidates.length>10);let tried=0,kept=0;
  for(const o of candidates){
    let turned;try{turned=rotateObject(scene,o.id,{angle:90},library);}catch{continue;}
    const rotation=turned.objects.find(x=>x.id===o.id).rotation;
    for(const d of [[.05,0],[-.05,0],[0,.05],[0,-.05]]){let moved;try{moved=nudgeObject(turned,o.id,d,library);}catch{continue;}tried++;if(moved.scene.objects.find(x=>x.id===o.id).rotation===rotation)kept++;break;}
  }
  assert(tried>=10,'rotated objects could be nudged: '+tried);assert.equal(kept,tried,'a nudge keeps the rotation the user chose');
  let combined=null;
  for(const o of candidates){for(const direction of ['right','left','forward','back']){try{combined={o,result:run([{type:'rotate',objectId:o.id,angle:90},{type:'move',objectId:o.id,direction,distance:.05}])};break;}catch{}}if(combined)break;}
  assert(combined);assert.equal(combined.result.scene.objects.find(x=>x.id===combined.o.id).rotation,(combined.o.rotation+90)%360,'rotate then move in one command ends rotated');
  console.log(`PASS a rotation the user chose survives later moves (${kept}/${tried} seats and screens that normally re-face their desk)`);
}
// 복제한 의자는 원본의 책상에 묶이지 않는다
{
  let made=null;
  for(const o of scene.objects.filter(o=>o.facing?.moveWithTarget&&!o.supportId&&scene.objects.some(t=>t.id===o.facing.targetId))){try{made={o,copy:copyObject(scene,o.id,null,library)};break;}catch{}}
  assert(made,'a seat linked to a desk can be copied on its own');
  const clone=made.copy.scene.objects.find(x=>x.id===made.copy.objectId);
  assert(!clone.facing?.moveWithTarget&&!clone.facing?.automatic,'the copy is not tied to the source’s desk');
  const desk=made.o.facing.targetId;let dragged=null;
  for(const d of [[.05,0],[-.05,0],[0,.05],[0,-.05]]){try{dragged=nudgeObject(made.copy.scene,desk,d,library).scene;break;}catch{}}
  if(dragged){const after=dragged.objects.find(x=>x.id===clone.id);assert.equal(after.x,clone.x);assert.equal(after.z,clone.z);}
  for(const d of [[.05,0],[-.05,0],[0,.05],[0,-.05]]){try{const moved=nudgeObject(made.copy.scene,clone.id,d,library).scene;assert.equal(moved.objects.find(x=>x.id===clone.id).rotation,clone.rotation,'nudging the copy does not spin it');break;}catch{}}
  console.log('PASS a copied seat stands on its own: moving the original desk leaves it, and nudging it keeps its direction');
}
// 속도 — 이동은 그 공간만 확인하며 나아가고, 들어갈 자리가 없는 복제는 금방 포기한다
{
  const clock=fn=>{const start=performance.now();try{fn();}catch{}return performance.now()-start;};
  const unit=Math.max(1,Math.min(clock(()=>validateScene(scene,library)),clock(()=>validateScene(scene,library))));
  const moveMs=Math.min(clock(()=>nudgeObject(scene,free.o.id,[1,0],library)),clock(()=>nudgeObject(scene,free.o.id,[1,0],library)));
  assert(moveMs<unit*8+40,`a 1 m move costs a few whole-scene checks, not one per 5 cm (${moveMs.toFixed(0)} ms, one check ${unit.toFixed(0)} ms)`);
  // 들어갈 자리가 없는 복제 — 가구 묶음을 꽉 찬 공간에 넣어 본다
  let stuck=null;
  for(const parent of parents){for(const room of tight.rooms){try{copyObject(tight,parent.id,room.id,library);}catch(error){if(/여유 공간|좁아요/.test(error.message)){stuck={parent,room};break;}}}if(stuck)break;}
  assert(stuck,'some furniture group does not fit somewhere');
  const failMs=Math.min(clock(()=>copyObject(tight,stuck.parent.id,stuck.room.id,library)),clock(()=>copyObject(tight,stuck.parent.id,stuck.room.id,library)));
  const tightUnit=Math.max(1,Math.min(clock(()=>validateScene(tight,library)),clock(()=>validateScene(tight,library))));
  assert(failMs<tightUnit*25+150,`a copy that cannot fit gives up after room-local checks (${failMs.toFixed(0)} ms, one check ${tightUnit.toFixed(0)} ms)`);
  console.log(`PASS moves and failed copies stay fast: move ${moveMs.toFixed(0)} ms, failed copy ${failMs.toFixed(0)} ms (one whole-scene check ${unit.toFixed(0)} ms)`);
}
