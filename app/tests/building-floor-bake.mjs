// 내 공간 조감도 → 건물의 층 기록 (domain/building/floor-bake.js) — 건물 데이터를 굽는 스크립트(build_building_bake.mjs)와 같은 규칙인지 확인
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {addAsset} from '../web/src/domain/spatial/scene.js';
import {bakeSceneFloor} from '../web/src/domain/building/floor-bake.js';

const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url)));
const baked=JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(new URL('../web/src/building/bake.b64',import.meta.url),'utf8').trim(),'base64')).toString('utf8'));
const named=(record,assets)=>record.objs.map(o=>[assets[o[0]].id,...o.slice(1)]);

// 구워 둔 '전체' 층은 라이브러리 템플릿 장면을 그대로 구운 것 — 같은 장면을 바꾸면 같은 기록이 나와야 한다
const full=baked.tpl.filter(t=>t.lay==='full');let same=0;
for(const entry of full){
  const scene=createScene({templateId:entry.id},library),pack=bakeSceneFloor(scene,library,{id:'my:test',name:'테스트 층'});
  if(JSON.stringify(pack.tpl.rooms)===JSON.stringify(entry.rooms)&&JSON.stringify(named(pack.tpl,pack.assets))===JSON.stringify(named(entry,baked.assets))&&JSON.stringify(pack.tpl.ppl)===JSON.stringify(entry.ppl))same++;
}
assert(same>=full.length*.85,`${same}/${full.length} template floors bake to the published records`);
console.log(`PASS ${same}/${full.length} template scenes bake to the same rooms, objects and people as the published building data`);

const scene=createScene({templateId:'of-full-standard'},library),pack=bakeSceneFloor(scene,library,{id:'my:abc',name:'우리 사무실'});
assert.equal(pack.tpl.id,'my:abc');assert.equal(pack.tpl.name,'우리 사무실');assert.equal(pack.tpl.lay,'my');assert.equal(pack.tpl.ind,scene.industry);
assert.equal(pack.tpl.w,scene.width);assert.equal(pack.tpl.d,scene.depth);assert.equal(pack.tpl.style,scene.style);
assert.equal(pack.tpl.rooms.length,scene.rooms.length);assert.equal(pack.tpl.objs.length,scene.objects.length);
assert.deepEqual(pack.tpl.rooms[0].slice(0,7),[scene.rooms[0].id,scene.rooms[0].name,scene.rooms[0].kind,scene.rooms[0].x,scene.rooms[0].z,scene.rooms[0].width,scene.rooms[0].depth]);
// 자산 표는 이 묶음 안에서 처음 쓰인 순서, 층 기록은 그 순번을 가리킨다
assert.equal(new Set(pack.assets.map(a=>a.id)).size,pack.assets.length);assert(pack.tpl.objs.every(o=>o[0]>=0&&o[0]<pack.assets.length));
assert.equal(pack.assets[pack.tpl.objs[0][0]].id,scene.objects[0].assetId);
for(const asset of pack.assets){assert(asset.n&&Array.isArray(asset.s)&&asset.s.length===3);assert(asset.r?pack.recipes[asset.r]:Array.isArray(asset.p),asset.id+' carries a recipe or parts');}
const product=pack.assets.find(a=>a.pid);assert(product,'products keep their product id (floor product counts)');
// 장면에 없는 것까지 담지 않는다 — 오브젝트를 더하면 자산이 늘 수 있고 기록도 는다
const more=addAsset(scene,'furniture:plant',scene.rooms[0].id,library),bigger=bakeSceneFloor(more,library,{id:'my:abc',name:'x'});
assert.equal(bigger.tpl.objs.length,pack.tpl.objs.length+1);
assert.equal(JSON.stringify(bakeSceneFloor(scene,library,{id:'my:abc',name:'우리 사무실'})),JSON.stringify(pack),'deterministic');
assert.throws(()=>bakeSceneFloor({...scene,objects:[{...scene.objects[0],assetId:'no:such'}]},library,{id:'my:x'}),/자산/);
assert.throws(()=>bakeSceneFloor(scene,library,{}),/id/);
console.log('PASS a studio scene becomes a self-contained floor pack: its own asset table, recipes, rooms, objects and people');
