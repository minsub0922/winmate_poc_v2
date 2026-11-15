// @ 태깅 목록 — 공간 · 제품 · 오브젝트 세 묶음 (domain/spatial/mention-options.js)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {mentionOptions,filterMentionOptions,MENTION_GROUPS} from '../web/src/domain/spatial/mention-options.js';

const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url)));
const scene=createScene({templateId:'cowork-full-standard'},library);
const options=mentionOptions(scene,library);
const by=(kind,id)=>options.find(o=>o.kind===kind&&o.id===id);

assert.deepEqual(MENTION_GROUPS,['공간','제품','오브젝트']);
for(const room of scene.rooms){const option=by('room',room.id);assert(option,room.name);assert.equal(option.group,'공간');assert.equal(option.label,room.name);}
assert.equal(options.filter(o=>o.kind==='space').length,16);assert.equal(by('space','meeting').label,'회의실');assert.equal(by('space','meeting').group,'공간');
const placed=scene.objects[0],placedOption=by('object',placed.id);
assert.equal(placedOption.group,'오브젝트');assert.equal(placedOption.roomId,placed.roomId);assert.match(placedOption.label,/ · .+ #1$/);
assert.equal(options.filter(o=>o.kind==='object').length,scene.objects.length);
// 배치된 것도 종류를 따른다 — 삼성 제품은 「제품」, 가구 · 사람 연출은 「오브젝트」. 묶음 안에서는 배치된 것이 새로 추가할 것보다 먼저다.
const productAssets=new Set(library.assets.filter(a=>a.productId).map(a=>a.id));
assert(options.filter(o=>o.kind==='object').every(o=>o.group===(productAssets.has(o.asset.id)?'제품':'오브젝트')));
const placedProduct=scene.objects.find(o=>productAssets.has(o.assetId)),model=library.assets.find(a=>a.id===placedProduct.assetId).model||library.assets.find(a=>a.id===placedProduct.assetId).name;
const found=filterMentionOptions(options,model,{limit:40});
assert.equal(found[0].kind,'object','typing a placed product’s model offers the placed one first: '+model);assert(found.some(o=>o.kind==='asset'&&o.asset.id===placedProduct.assetId),'and the catalogue entry to add another');
assert.equal(by('asset','product:qm65c').group,'제품');assert.equal(by('asset','furniture:plant').group,'오브젝트');assert.equal(by('asset','people:student-write').group,'오브젝트');
assert(options.every(o=>typeof o.label==='string'&&o.label&&typeof o.hint==='string'&&MENTION_GROUPS.includes(o.group)));
assert.equal(new Set(options.map(o=>o.kind+':'+o.id)).size,options.length);
console.log('PASS options cover scene rooms, the 16 space types, placed objects and the catalogue in three groups');

const all=filterMentionOptions(options,'',{limit:40});
assert(all.length<=40);
const order=all.map(o=>MENTION_GROUPS.indexOf(o.group));assert.deepEqual(order,[...order].sort((a,b)=>a-b),'groups come in order');
assert.deepEqual([...new Set(all.map(o=>o.group))],MENTION_GROUPS,'every group is visible before typing');
const focus=scene.rooms[2].id,focused=filterMentionOptions(options,'',{roomId:focus,limit:40});
assert.equal(focused.find(o=>o.kind==='room').id,focus);assert.equal(focused.find(o=>o.kind==='object').roomId,focus);
// 가구가 많은 장면에서도 @만 쳤을 때 묶음마다 "이미 놓인 것"과 "새로 추가할 것"이 함께 보인다(놓인 것이 자리를 독차지하지 않는다)
for(const group of ['제품','오브젝트']){
  const shown=all.filter(o=>o.group===group),kinds=shown.map(o=>o.kind);
  assert(kinds.includes('object')&&kinds.includes('asset'),group+': placed ones and new ones are both offered before typing');
  assert(kinds.indexOf('asset')>kinds.lastIndexOf('object'),group+': placed ones still come first');
  assert(shown.filter(o=>o.kind==='object').length>=shown.filter(o=>o.kind==='asset').length,group+': placed ones keep most of the slots');
}
assert(all.filter(o=>o.group==='공간').some(o=>o.kind==='room')&&all.filter(o=>o.group==='공간').some(o=>o.kind==='space'),'rooms and new space types are both offered');
console.log('PASS the untyped list shows all three groups in order, the room being viewed first');

const people=filterMentionOptions(options,'사람',{limit:40});
assert(people.some(o=>o.kind==='asset'&&o.asset.assetGroup==='people'),'catalogue people bundles');
assert(people.some(o=>o.kind==='object'&&scene.objects.find(x=>x.id===o.id).people?.length),'furniture with people on it');
assert(filterMentionOptions(options,'회의',{limit:40}).some(o=>o.kind==='space'&&o.id==='meeting'));
assert(filterMentionOptions(options,scene.rooms[1].name,{limit:40}).some(o=>o.kind==='room'&&o.id===scene.rooms[1].id));
assert(filterMentionOptions(options,'세탁기',{limit:40}).some(o=>o.kind==='asset'&&o.group==='제품'&&o.asset.name.includes('세탁기')));
assert.deepEqual(filterMentionOptions(options,'없는말없는말',{limit:40}),[]);
assert(filterMentionOptions(options,'소파',{limit:5}).length<=5);
console.log('PASS typing narrows across groups: 사람 finds people bundles and seated furniture, names find rooms, types and products');

const blank=mentionOptions(null,library);
assert(!blank.some(o=>o.kind==='room'||o.kind==='object'));assert.equal(blank.filter(o=>o.kind==='space').length,16);assert(blank.some(o=>o.kind==='asset'));
assert.deepEqual([...new Set(filterMentionOptions(blank,'',{limit:40}).map(o=>o.group))],MENTION_GROUPS);
const older={...library,assets:library.assets.filter(a=>a.id!=='furniture:plant')};
const partial=mentionOptions(scene,older);
assert(!partial.some(o=>o.asset?.id==='furniture:plant'));assert(partial.some(o=>o.kind==='object'));
console.log('PASS a blank studio offers space types and the catalogue; objects of an asset the library lacks are skipped, not fatal');
