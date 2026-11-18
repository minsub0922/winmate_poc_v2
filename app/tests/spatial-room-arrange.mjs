// 공간 자리 바꾸기 · 공간별 스타일 — 스튜디오 이름표 끌어 놓기 · 이름표 메뉴(domain/spatial/room-ops.js)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,validateScene} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene,validateStudioForm,createSceneFromForm} from '../web/src/domain/spatial/studio-form.js';
import {swapRooms,setRoomStyle,roomStyle,addRoom,removeRoom} from '../web/src/domain/spatial/room-ops.js';
import {planSvg} from '../web/src/domain/spatial/plan-svg.js';

const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url)));
const scene=createScene({templateId:'cowork-full-standard'},library),form=studioFormFromScene(scene),options={documentId:'room-arrange-test'};
const ok=s=>assert.deepEqual(validateScene(s,library).errors,[]);
const relative=(s,roomId)=>{const room=s.rooms.find(r=>r.id===roomId);return s.objects.filter(o=>o.roomId===roomId).map(o=>[o.id,o.assetId,Math.round((o.x-room.x)*1000),Math.round((o.z-room.z)*1000),o.rotation].join('|')).sort();};
assert(scene.rooms.length>=3);
const [a,,c]=scene.rooms;

// 자리 바꾸기 — 순서가 맞바뀌고, 각 공간의 크기 · 안의 배치는 그대로 따라간다
const swapped=swapRooms({scene,form},a.id,c.id,library,options);
const order=swapped.scene.rooms.map(r=>r.id);
assert.equal(order.indexOf(a.id),scene.rooms.findIndex(r=>r.id===c.id));
assert.equal(order.indexOf(c.id),0);
for(const room of scene.rooms){
  const next=swapped.scene.rooms.find(r=>r.id===room.id);
  assert.equal(next.width,room.width);assert.equal(next.depth,room.depth);
  if(!swapped.relaid.includes(room.id))assert.deepEqual(relative(swapped.scene,room.id),relative(scene,room.id),room.name+' keeps its layout');
}
assert.notDeepEqual([swapped.scene.rooms.find(r=>r.id===a.id).x,swapped.scene.rooms.find(r=>r.id===a.id).z],[a.x,a.z],'the dragged room moved');
ok(swapped.scene);assert.deepEqual(validateStudioForm(swapped.form,library,{complete:true}),[]);
assert.equal(swapRooms({scene,form},a.id,a.id,library,options).scene,scene,'dropping on itself changes nothing');
assert.throws(()=>swapRooms({scene,form},a.id,'missing',library,options));

// 공간별 스타일 — 그 공간만, 배치는 그대로, 다시 짜도(공간 추가 · 삭제 · 자리 바꾸기) 남는다
const style=Object.keys({warm:1,modern:1,premium:1,clinical:1,industrial:1}).find(key=>key!==scene.style);
const styled=setRoomStyle({scene,form},a.id,style);
assert.equal(styled.scene.rooms.find(r=>r.id===a.id).style,style);
assert.equal(roomStyle(styled.scene,styled.scene.rooms.find(r=>r.id===a.id)),style);
assert.equal(roomStyle(styled.scene,styled.scene.rooms.find(r=>r.id===c.id)),scene.style);
assert.deepEqual(styled.scene.objects,scene.objects);assert.equal(styled.form.rooms.find(r=>r.id===a.id).style,style);
ok(styled.scene);assert.deepEqual(validateStudioForm(styled.form,library,{complete:true}),[]);
for(const next of [swapRooms(styled,a.id,c.id,library,options),addRoom(styled,{kind:'meeting'},library,options),removeRoom(styled,c.id,library,options)])
  assert.equal(next.scene.rooms.find(r=>r.id===a.id).style,style,'room style survives a rebuild');
assert.equal(createSceneFromForm(styled.form,library,options).rooms.find(r=>r.id===a.id).style,style);
const reset=setRoomStyle(styled,a.id,scene.style);
assert.equal('style' in reset.scene.rooms.find(r=>r.id===a.id),false,'choosing the map style clears the override');
assert.throws(()=>setRoomStyle({scene,form},a.id,'neon'),/스타일/);
assert(validateScene({...scene,rooms:scene.rooms.map((r,i)=>i?r:{...r,style:'neon'})},library).errors.some(e=>e.includes('스타일')));

// 2D 평면도 — 공간마다 자기 스타일 바닥
const svg=planSvg(styled.scene,library);
assert(svg.includes(`id="sp-floor-${style}"`)&&svg.includes(`url(#sp-floor-${style})`)&&svg.includes('url(#sp-floor)'));
console.log('spatial-room-arrange: ok');
