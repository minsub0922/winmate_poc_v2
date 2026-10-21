import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createScene,validateScene,inspectNaturalLayout,addAsset,moveObject,planAnchors} from '../web/src/domain/spatial/scene.js';
import {embedSpatial,addNativePlan} from '../web/src/domain/spatial/slide-binding.js';
import {studioDocumentFromTemplate,createSceneFromForm} from '../web/src/domain/spatial/studio-form.js';
import {detailSupportError} from '../web/src/domain/spatial/detail-placement.js';
import {spatialAssetMatches,spatialObjectThumbnail} from '../web/src/domain/spatial/catalog.js';
import {planSvg} from '../web/src/domain/spatial/plan-svg.js';
import {SPACE_ASSETS} from '../web/src/domain/spatial/space-objects.js';
import {TEMPLATE_ROOM} from '../web/src/domain/spatial/template-composition.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url))),scenes=JSON.parse(fs.readFileSync(new URL('../data/spatial/scenes.json',import.meta.url))),assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
const before=JSON.parse(fs.readFileSync(new URL('../data/spatial/versions/3d1fa809.json',import.meta.url)));
let rooms=0;const coverage=[];
function checkCharacter(scene){
 for(const room of scene.rooms){
  const ids=scene.objects.filter(o=>o.roomId===room.id).map(o=>o.assetId),has=id=>ids.includes('furniture:'+id);
  if(['garment','laundry'].includes(room.spaceProfile))assert(has('wardrobe-clothes')&&has('coat-rack-loaded'),room.name+' clothes, wardrobe and hanging rack');
  if(room.spaceProfile==='kitchen')assert(has('food-prep-board')&&has('food-stew-pot'),room.name+' actual food and preparation');
  if(room.spaceProfile==='coldstore')assert(has('food-stock-shelf')&&has('food-produce-basket')&&!has('food-stew-pot'),'cold storage holds ingredients, no cooking');
  if(room.kind==='fitness'){
   if(/재활|치료/.test(room.name))assert(has('rehab-parallel-bars')&&has('rehab-light-weights')&&!has('gym-power-rack'),'rehabilitation differs from heavy lifting');
   else assert(has('gym-power-rack')&&has('gym-dumbbell-rack')&&has('gym-bench-press'),room.name+' rack, dumbbells and barbell');
  }
  assert(scene.objects.some(o=>o.roomId===room.id&&o.people?.length),room.name+' retains occupants');
 }
}
for(const template of library.templates){
 const scene=createScene({templateId:template.id},library);assert.deepEqual(scene,scenes[template.id],template.id+' deterministic');assert.deepEqual(validateScene(scene,library).errors,[],template.id);assert.deepEqual(inspectNaturalLayout(scene,library).issues,[],template.id+' clearance');checkCharacter(scene);rooms+=scene.rooms.length;
 for(const object of scene.objects.filter(o=>o.autoDressing))assert.equal(detailSupportError(object,scene,assets),null,'dressing is supported at the true surface height');
}
for(const industry of library.industries){
 const template=library.templates.find(t=>t.id===industry.code.toLowerCase()+'-full-standard'),scene=scenes[template.id],document=studioDocumentFromTemplate(template,library),rebuilt=createSceneFromForm(document.form,library);
 assert.deepEqual(validateScene(rebuilt,library).errors,[]);assert.deepEqual(inspectNaturalLayout(rebuilt,library).issues,[]);checkCharacter(rebuilt);
 coverage.push({industry:industry.code,rooms:scene.rooms.map(r=>({id:r.id,name:r.name,size:[r.width,r.depth],objects:scene.objects.filter(o=>o.roomId===r.id&&(o.autoDressing||o.assetId.startsWith('furniture:'))).map(o=>({id:o.assetId,name:assets[o.assetId].name,supportId:o.supportId}))}))});
}
for(const asset of before.assets){assert.deepEqual(assets[asset.id].size,asset.size,asset.id+' prior physical dimensions');if(!asset.productId)assert.deepEqual(assets[asset.id].parts,asset.parts,asset.id+' prior geometry preserved');}
const blank=createScene({templateId:'cowork-cowork-work-standard',width:20,depth:20},library);blank.objects=[];
for(const definition of SPACE_ASSETS){
 const asset=assets[definition.id];assert(asset&&!asset.productId&&!asset.powered&&asset.dimensionSource==='designed');assert(asset.parts.every(p=>p.material!=='screen'));
 let scene=blank;if(asset.placement?.mode==='surface')scene=addAsset(blank,'furniture:counter',blank.rooms[0].id,library);
 const placed=addAsset(scene,asset.id,blank.rooms[0].id,library);assert.deepEqual(validateScene(placed,library).errors,[]);assert(!planSvg(placed,library).includes('NaN'));
 assert(fs.existsSync(new URL('../web/public'+spatialObjectThumbnail(asset),import.meta.url)),asset.name+' real object thumbnail');
}
assert(assets['furniture:wardrobe-clothes'].parts.some(p=>p.objectType==='clothing'),'garments are geometry');
assert(assets['furniture:gym-power-rack'].parts.some(p=>p.objectType==='barbell'),'barbell is geometry');
assert(assets['furniture:gym-dumbbell-rack'].parts.filter(p=>p.objectType==='dumbbell').length>=24,'multiple actual dumbbells');
assert(assets['furniture:food-stew-pot'].parts.some(p=>p.objectType==='food'),'food is geometry');
for(const [id,query]of [['wardrobe-clothes','옷장'],['gym-power-rack','렉'],['food-stew-pot','요리']])assert(spatialAssetMatches(assets['furniture:'+id],query),query+' search');
const kitchen=scenes['fb-3-standard'],island=kitchen.objects.find(o=>o.assetId==='furniture:island'),induction=kitchen.objects.find(o=>o.assetId==='product:bi_induction'),pot=kitchen.objects.find(o=>o.assetId==='furniture:food-stew-pot');assert.equal(pot.supportId,induction.id);assert.equal(induction.supportId,island.id);
const moved=moveObject(kitchen,island.id,{rotation:island.rotation+180},library);assert.deepEqual(validateScene(moved,library).errors,[]);assert.equal(moved.objects.find(o=>o.id===pot.id).supportId,induction.id,'food moves with hob and island');
// Independent physical dimensions catch the former double scaling of metre
// recipes, skipped rotated cylinders and filled rectangles over open racks.
for(const [id,predicate,width,depth]of [
 ['wardrobe-clothes',p=>p.shape==='box'&&p.size[0]===1.6&&p.size[1]===.12,1.6,.65],
 ['gym-power-rack',p=>p.objectType==='barbell'&&p.shape==='cylinder'&&p.size[1]>1.8,1.95,.028],
]){
 const scene=addAsset(blank,'furniture:'+id,blank.rooms[0].id,library),object=scene.objects[0],asset=assets[object.assetId],binding=embedSpatial(scene,library),calls=[];
 assert.equal(binding.nativePlanVersion,2);
 const slide={addShape:(type,options)=>calls.push({type,options}),addText:()=>{}},types={rect:'rect',ellipse:'ellipse',custGeom:'custGeom'};
 addNativePlan(slide,binding,{x:0,y:0,w:1280,h:820},types);
 const index=[...asset.parts].sort((a,b)=>a.position[1]-b.position[1]).findIndex(predicate),glyph=calls.find(c=>c.options.objectName===object.id+':part-'+index),scale=planAnchors(scene).scale/96;
 assert(glyph&&glyph.type==='custGeom','all actual part shapes are exported');assert(Math.abs(glyph.options.w-Math.max(.005,width*scale))<1e-6,'PPT part width is the physical metre width');assert(Math.abs(glyph.options.h-Math.max(.005,depth*scale))<1e-6,'PPT part depth is the physical metre depth');
 assert(!calls.some(c=>c.options.objectName===object.id),'open rack has no opaque AABB fill');
 const legacy={...binding};delete legacy.nativePlanVersion;calls.length=0;addNativePlan(slide,legacy,{x:0,y:0,w:1280,h:820},types);assert(calls.some(c=>c.options.objectName===object.id),'saved legacy bindings retain their projection');
}
const out=new URL('./output/spatial-character/',import.meta.url);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(new URL('coverage.json',out),JSON.stringify({ok:true,sourceHash:library.sourceHash,templates:library.templates.length,rooms,newAssets:SPACE_ASSETS.length,standardRoom:[TEMPLATE_ROOM.width,TEMPLATE_ROOM.depth],coverage},null,2));
console.log(`PASS ${library.templates.length} furnished templates / ${rooms} occupied rooms; ${SPACE_ASSETS.length} real prop recipes, clothes, food, gym and rehab, true surfaces, regeneration and nested moves`);
