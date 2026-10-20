import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DETAIL_ASSETS,DETAIL_CATEGORIES} from '../web/src/domain/spatial/detail-objects.js';
import {createScene,addAsset,moveObject,validateScene,sceneHash} from '../web/src/domain/spatial/scene.js';
import {applySpatialEdit} from '../web/src/domain/spatial/edit.js';
import {planSvg} from '../web/src/domain/spatial/plan-svg.js';
import {detailSurfaceHeight} from '../web/src/domain/spatial/detail-placement.js';
import {spatialAssetMatches,spatialObjectThumbnail} from '../web/src/domain/spatial/catalog.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url))),assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
const blank=createScene({templateId:'cowork-cowork-work-standard',width:12,depth:12},library);blank.objects=[];
const table={id:'table',assetId:'furniture:table',roomId:blank.rooms[0].id,x:5,z:5,elevation:0,rotation:0};
const seed={...blank,objects:[table]},room=blank.rooms[0].id;
for(const asset of DETAIL_ASSETS){
  assert(!asset.productId&&asset.powered===false&&DETAIL_CATEGORIES.includes(asset.category));
  const base=structuredClone(seed);
  if(asset.placement.surfaceHeights)base.objects=[{...table,assetId:'furniture:sofa'}];
  const result=addAsset(base,asset.id,room,library),o=result.objects.find(o=>o.assetId===asset.id);assert(o,asset.name);assert.deepEqual(validateScene(result,library).errors,[],asset.name);
  if(asset.placement.mode==='surface'){assert.equal(o.supportId,'table');assert.equal(o.mount,'surface');assert(Math.abs(o.elevation-detailSurfaceHeight(assets[asset.id],base.objects[0],assets[base.objects[0].assetId]))<.001);}
  else assert.equal(o.mount,'floor');
  assert(!planSvg(result,library).includes('NaN'));assert(fs.existsSync(new URL('../web/public'+spatialObjectThumbnail(assets[asset.id]),import.meta.url)),asset.name+' thumbnail');
  if(asset.placement.mode==='surface')assert.throws(()=>addAsset(blank,asset.id,room,library),/상판/,'no floor substitution for tableware');
}
let decorated=addAsset(seed,'furniture:tray-rect',room,library);const tray=decorated.objects.find(o=>o.assetId==='furniture:tray-rect');
decorated=addAsset(decorated,'furniture:cup-mug',room,library,{supportId:tray.id});const mug=decorated.objects.find(o=>o.assetId==='furniture:cup-mug');assert.equal(mug.supportId,tray.id);
const moved=moveObject(decorated,'table',{x:7,z:7,rotation:90},library);assert.deepEqual(validateScene(moved,library).errors,[]);const shifted=moved.objects.find(o=>o.id===mug.id);assert(Math.abs(shifted.x-7)<.5&&Math.abs(shifted.z-7)<.5);
const removed=applySpatialEdit(decorated,{operations:[{type:'remove',objectId:'table'}]},library);assert.equal(removed.objects.length,0);
assert.throws(()=>moveObject(decorated,mug.id,{elevation:0},library),/높이|표면|겹칩니다/);
assert.throws(()=>moveObject(decorated,mug.id,{x:11},library),/상판/);
const flat=addAsset(seed,'furniture:pencil-pair',room,library),twice=addAsset(flat,'furniture:pencil-pair',room,library);const pencils=twice.objects.filter(o=>o.assetId==='furniture:pencil-pair');assert.notDeepEqual([pencils[0].x,pencils[0].z],[pencils[1].x,pencils[1].z]);
const overlap=structuredClone(twice);Object.assign(overlap.objects.find(o=>o.id===pencils[1].id),{x:pencils[0].x,z:pencils[0].z});assert(validateScene(overlap,library).errors.length,'millimetre-thick stationery cannot occupy the same location');
const rug=addAsset(seed,'furniture:rug-wool',room,library);assert.deepEqual(validateScene(rug,library).errors,[]);assert.equal(rug.objects.find(o=>o.assetId==='furniture:rug-wool').elevation,.025);
for(const [id,query]of [['cup-mug','카페 머그컵'],['mat-entry','현관 매트'],['rug-round','원형 러그'],['pillow-bed','침대 베개']])assert(spatialAssetMatches(assets['furniture:'+id],query));
decorated=addAsset(decorated,'furniture:rug-round',room,library);decorated.contentHash=sceneHash(decorated);
fs.mkdirSync(new URL('./output/spatial-details/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./output/spatial-details/scene.json',import.meta.url),JSON.stringify(decorated));
console.log(`PASS ${DETAIL_ASSETS.length} detail assets: correct surfaces and floor layers, empty-surface errors, nested tray/cup movement and removal, thin-item collision, SVG, search and thumbnails`);
