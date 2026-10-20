import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,moveObject,validateScene} from '../web/src/domain/spatial/scene.js';
import {studioFormFromScene} from '../web/src/domain/spatial/studio-form.js';
import {applySpatialEdit,spatialMoveGroup,mergeSpatialEditForm} from '../web/src/domain/spatial/edit.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url)));
const scene=createScene({templateId:'cowork-full-standard'},library),original=structuredClone(scene);
const plant=scene.objects.find(o=>o.assetId==='furniture:plant');
let patch;
for(const dx of [.1,-.1,.2,-.2]){try{moveObject(scene,plant.id,{x:plant.x+dx},library);patch={x:plant.x+dx};break;}catch{}}
assert(patch);
const moved=applySpatialEdit(scene,{operations:[{type:'move',objectId:plant.id,patch},{type:'style',style:'warm'}]},library);
assert.equal(moved.objects.find(o=>o.id===plant.id).x,patch.x);assert.equal(moved.style,'warm');assert.equal(moved.revision,scene.revision+1);assert.deepEqual(scene,original);
assert.throws(()=>applySpatialEdit(scene,{operations:[{type:'move',objectId:plant.id,patch},{type:'move',objectId:plant.id,patch:{x:-100}}]},library));assert.deepEqual(scene,original);
assert.throws(()=>applySpatialEdit(scene,{operations:[{type:'move',objectId:plant.id,patch:{assetId:'other'}}]},library));
const added=applySpatialEdit(scene,{operations:[{type:'add',assetId:'product:qm65c',roomId:scene.rooms[0].id,quantity:1}]},library);
assert.equal(added.objects.filter(o=>o.assetId==='product:qm65c').length,scene.objects.filter(o=>o.assetId==='product:qm65c').length+1);assert.deepEqual(validateScene(added,library).errors,[]);
const desk=scene.objects.find(o=>scene.objects.some(child=>child.supportId===o.id));assert(desk);const group=spatialMoveGroup(scene,desk.id);assert(group.size>1);
const removed=applySpatialEdit(scene,{operations:[{type:'remove',objectId:desk.id}]},library);assert(!removed.objects.some(o=>o.id===desk.id||o.supportId===desk.id));assert.deepEqual(validateScene(removed,library).errors,[]);
console.log('PASS atomic object edits, precise instance moves, new catalogue products, dependent removal, invalid geometry rollback and immutable original');

const form=studioFormFromScene(scene),roomId=scene.rooms[0].id;form.rooms[0].name+=' 입력 수정';
const synchronized=mergeSpatialEditForm(form,scene,added,library);assert.equal(synchronized.rooms[0].name,form.rooms[0].name);
assert.equal(synchronized.rooms[0].products.find(p=>p.productId==='qm65c').quantity,(form.rooms[0].products.find(p=>p.productId==='qm65c')?.quantity||0)+1);
const undone=mergeSpatialEditForm(synchronized,added,scene,library);assert.deepEqual(undone,form);assert.equal(mergeSpatialEditForm(form,scene,scene,library),form);
console.log('PASS product input quantities follow add/undo without losing ungenerated form changes');

const shrunk=applySpatialEdit(added,{operations:[{type:'remove',objectId:plant.id}]},library);
const repeated=applySpatialEdit(shrunk,{operations:[{type:'add',assetId:'product:qm65c',roomId,quantity:1}]},library);
assert.equal(new Set(repeated.objects.map(o=>o.id)).size,repeated.objects.length);assert.deepEqual(validateScene(repeated,library).errors,[]);
console.log('PASS adding after deletion keeps instance IDs unique');
