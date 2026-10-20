import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,validateScene,moveObject,sceneHash,focusScene} from '../web/src/domain/spatial/scene.js';
import {planSvg} from '../web/src/domain/spatial/plan-svg.js';
import {embedSpatial,spatialConnectors} from '../web/src/domain/spatial/slide-binding.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url))),scenes=JSON.parse(fs.readFileSync(new URL('../data/spatial/scenes.json',import.meta.url)));
for(const template of library.templates){
  const scene=createScene({templateId:template.id},library);
  assert.equal(JSON.stringify(scene),JSON.stringify(scenes[template.id]),template.id+' determinism');
  assert.deepEqual(validateScene(scene,library).errors,[],template.id+' geometry');
  const svg=planSvg(scene,library);assert(svg.startsWith('<svg'));assert(!svg.includes('NaN'));
  const binding=embedSpatial(scene,library),lines=spatialConnectors(binding);
  for(const line of lines){assert(line.x1>=64&&line.x1<=884);assert(line.y1>=160&&line.y1<=650);assert(scene.rooms.some(r=>r.id===line.roomId));}
}
const scene=scenes['cowork-full-standard'],o=scene.objects.find(o=>o.assetId==='furniture:plant');
assert.throws(()=>moveObject(scene,o.id,{x:-50},library));assert.equal(sceneHash(scene),scene.contentHash);
for(const room of scene.rooms){const focused=focusScene(scene,room.id);assert.deepEqual(validateScene(focused,library).errors,[]);assert.equal(focused.rooms.length,1);}
const escaped={...scene,title:'<script>alert("x")</script>'};assert(!planSvg(escaped,library).includes('<script>'));
assert.equal(new Set(library.assets.map(a=>a.id)).size,library.assets.length);
assert(library.assets.every(a=>library.recipes[a.recipe||a.kind]||a.parts));
for(const source of library.cases){const scene=scenes[source.id];for(const id of source.sourceProductIds){if(library.assets.find(a=>a.productId===id)?.physical)assert(scene.objects.some(o=>o.assetId==='product:'+id),source.id+' missing source product '+id);}}
const planned=createScene({templateId:'cowork-full-standard',width:40,depth:27,roomSettings:[{roomId:'cowork-work',capacity:30},{roomId:'cowork-meet',capacity:8}],placements:[{productId:'flip',roomId:'cowork-meet'}]},library);
assert.equal(planned.objects.filter(o=>o.roomId==='cowork-work'&&o.assetId==='furniture:taskchair').length,30);
assert.equal(planned.objects.filter(o=>o.roomId==='cowork-meet'&&o.assetId==='product:flip').length,1);
console.log(`PASS ${library.templates.length} deterministic scenes, 16-industry scope/size coverage, geometry, SVG, anchors, focus, escaping, object references`);

const {groupSpatialAssets,spatialAssetMatches,spatialAssetName,spatialAssetLabel,spatialObjectThumbnail}=await import('../web/src/domain/spatial/catalog.js');
const groups=groupSpatialAssets(library.assets),signage=groups.find(g=>g.name==='스마트 사이니지');
assert.equal(signage.members.length,5);
assert.deepEqual(new Set(groups.flatMap(g=>g.members.map(a=>a.id))),new Set(library.assets.filter(a=>a.catalogVisible!==false).map(a=>a.id)));
assert.equal(groups.flatMap(g=>g.members).length,library.assets.filter(a=>a.catalogVisible!==false).length);
assert(signage.members.some(a=>spatialAssetMatches(a,'QM65C')));
assert(signage.members.some(a=>spatialAssetMatches(a,'LH65QMCEBGCXKR')));
assert.equal(spatialAssetLabel(signage.members.find(a=>a.model==='QM65C')),'스마트 사이니지 QM65C');
assert.equal(spatialAssetName({name:'무풍 1Way 카세트',model:'WindFree 1Way'}),'무풍 1Way 카세트');
assert.equal(spatialAssetName({name:'무풍 4Way 카세트',model:'WindFree 4Way'}),'무풍 4Way 카세트');
for(const asset of library.assets)assert(fs.existsSync(new URL('../web/public'+spatialObjectThumbnail(asset),import.meta.url)),asset.id+' missing thumbnail');
console.log(`PASS ${library.assets.length} original asset IDs preserved in ${groups.length} groups, model search, complete labels and object thumbnails`);
