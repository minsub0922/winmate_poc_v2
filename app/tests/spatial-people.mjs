import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,addAsset,moveObject,validateScene,sceneHash} from '../web/src/domain/spatial/scene.js';
import {applySpatialEdit} from '../web/src/domain/spatial/edit.js';
import {planSvg} from '../web/src/domain/spatial/plan-svg.js';
import {spatialAssetMatches,spatialAssetInFamily,groupSpatialAssets,spatialObjectThumbnail} from '../web/src/domain/spatial/catalog.js';
import {addStudioSelection} from '../web/src/domain/spatial/studio-selection.js';
import {studioFormFromScene,validateStudioForm,createSceneFromForm} from '../web/src/domain/spatial/studio-form.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url))),people=library.assets.filter(a=>a.assetGroup==='people');
assert.equal(people.length,library.counts.people);assert(people.length>=60);assert.equal(new Set(people.map(a=>a.id)).size,people.length);assert.equal(new Set(people.map(a=>JSON.stringify(a.parts))).size,people.length);
const blank=createScene({templateId:'cowork-cowork-work-standard',width:18,depth:18},library);blank.objects=[];const room=blank.rooms[0].id;
for(const a of people){
 assert.equal(a.kind,'people-scene');assert(!a.productId&&!a.powered&&a.id.startsWith('people:'));assert(a.size.every(Number.isFinite)&&a.size[0]>.5&&a.size[1]>1&&a.size[1]<2.3&&a.size[2]>.4,a.name+' physical envelope');
 assert.equal(a.composition.type,'people-with-objects');assert.equal(a.composition.peopleCount,a.actors.length);assert(a.actors.length>0&&a.composition.objects.length>0);assert(a.parts.some(p=>p.component==='furniture'));
 for(const actor of a.actors){
  const pieces=a.parts.filter(p=>p.actorId===actor.id);assert(pieces.length>=20,actor.role+' recognizable anatomy');assert(pieces.some(p=>p.shape==='sphere'&&p.size[1]>.1));assert(actor.cues.length>0&&actor.role&&actor.action);
 }
 assert(a.parts.every(p=>p.material!=='screen'&&[...p.position,...p.size,...(p.rotate||[])].every(Number.isFinite)),'no embedded electronics / invalid coordinates');
 const placed=addAsset(blank,a.id,room,library);assert.equal(placed.objects.length,1,'single compound object');assert.deepEqual(validateScene(placed,library).errors,[],a.id);
 const moved=moveObject(placed,placed.objects[0].id,{x:9,z:9,rotation:90},library);assert.deepEqual(validateScene(moved,library).errors,[],a.id+' rotated');assert.equal(moved.objects[0].assetId,a.id);assert(!planSvg(moved,library).includes('NaN'));
 const removed=applySpatialEdit(moved,{operations:[{type:'remove',objectId:moved.objects[0].id}]},library);assert.equal(removed.objects.length,0,'whole vignette removed together');
 assert(fs.existsSync(new URL('../web/public'+spatialObjectThumbnail(a),import.meta.url)),a.id+' thumbnail');
}
for(const ind of library.industries)assert(people.some(a=>a.industries.includes(ind.code)),ind.name+' profession coverage');
for(const id of ['doctor-consult','doctor-explain','doctor-examine','doctor-bed-round'])assert(people.find(a=>a.id==='people:'+id).actors.some(a=>a.roleId==='doctor')&&people.find(a=>a.id==='people:'+id).actors.some(a=>a.roleId==='patient'));
assert(new Set(people.filter(a=>a.actors.some(p=>p.roleId==='teacher')).map(a=>a.composition.variant)).size>=5);
assert(new Set(people.filter(a=>a.actors.some(p=>p.roleId==='student')).flatMap(a=>a.actors.filter(p=>p.roleId==='student').map(p=>p.action))).size>=4);
const board=people.filter(a=>spatialAssetMatches(a,'교사 칠판'));assert(board.length>=3&&board.every(a=>a.composition.objects.includes('board')),'board search includes only teachers with an actual board');
for(const [id,q]of [['doctor-consult','병원 의사 환자'],['student-raise','앉은 학생 손들기'],['teacher-desk-explain','교탁 선생님'],['worker-bench','현장 안전모'],['housekeeping-cart','호텔 리넨']])assert(spatialAssetMatches(people.find(a=>a.id==='people:'+id),q),q);
assert.equal(library.assets.filter(a=>spatialAssetInFamily(a,'people')).length,people.length);assert.equal(library.assets.filter(a=>spatialAssetInFamily(a,'furniture')&&a.catalogVisible!==false).length,library.counts.furniture);assert.equal(groupSpatialAssets(people).length,people.length);
// Clothing must be visible geometry, searchable, and varied independently of role.
const actors=people.flatMap(a=>a.actors);assert(people.length>=140);assert(new Set(actors.map(a=>a.appearance.skin)).size>=5);assert(new Set(actors.map(a=>a.hairstyle)).size>=6);
for(const role of ['librarian','researcher','pharmacist','dentist','baker','artist','gardener','mechanic'])assert(actors.some(a=>a.roleId===role),role+' coverage');
for(const a of people)for(const actor of a.actors){assert(actor.wardrobe.length&&Array.isArray(actor.accessories),'actual wardrobe metadata');if(!['customer','shopper','student'].includes(actor.roleId))assert(actor.accessories.length>0,actor.role+' occupation accessories');const pieces=a.parts.filter(p=>p.actorId===actor.id);assert(pieces.some(p=>p.clothingType),'clothing geometry');for(const cue of actor.accessoryTypes.filter(c=>c!=='gloves'))assert(pieces.some(p=>p.accessoryType===cue),actor.role+' actual '+cue);}
for(const [id,q]of [['doctor-consult','의사 안경 청진기'],['mechanic-bench','정비사 보호 안경'],['artist-easel','베레모 미술'],['school-lunch','학생 급식'],['diner-chopsticks','젓가락 식사'],['hotel-roomtea','소파 휴식'],['gardener-watering','정원 물주기']])assert(spatialAssetMatches(people.find(a=>a.id==='people:'+id),q),q);
const meals=people.filter(a=>a.actors.some(p=>['eat','chopsticks','snack','drink','meal-tray'].includes(p.action)));assert(meals.length>=30);assert(new Set(meals.flatMap(a=>a.category)).size===9,'every industry category has dining or break use');
assert(people.filter(a=>a.actors.some(p=>p.action==='eat'||p.action==='chopsticks')).every(a=>a.composition.objects.some(t=>['meal','ricebowl','lunchtray','pasta','salad','breakfast'].includes(t))),'actual meal props accompany eating');
const form=studioFormFromScene(blank);form.rooms[0].width=18;form.rooms[0].depth=18;const selected=addStudioSelection(form,blank,library,['people:teacher-board-high'],room);assert.deepEqual(validateStudioForm(selected.form,library),[]);assert.equal(selected.form.rooms[0].furniture[0].assetId,'people:teacher-board-high');
const regenerated=createSceneFromForm(selected.form,library);assert(regenerated.objects.some(o=>o.assetId==='people:teacher-board-high'),'regeneration retains selected vignette');
const seed=addAsset(blank,'people:doctor-consult',room,library);seed.objects[0].studioFurniture=true;seed.contentHash=sceneHash(seed);const out=new URL('./output/'+(process.env.SPATIAL_PEOPLE_OUTPUT||'spatial-people')+'/',import.meta.url);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(new URL('scene.json',out),JSON.stringify(seed));
fs.writeFileSync(new URL('unit-report.json',out),JSON.stringify({ok:true,sourceHash:library.sourceHash,people:people.length,roles:new Set(people.flatMap(a=>a.roles)).size,industryCoverage:library.industries.length,checkedAt:new Date().toISOString()},null,2));
console.log(`PASS ${people.length} compound people scenes, ${new Set(people.flatMap(a=>a.roles)).size} roles, all 16 industries; clear objects/cues, pose variation, placement/rotation/removal/SVG, search, separate filters and input regeneration`);
