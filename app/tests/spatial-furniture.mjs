import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FURNITURE_VARIANTS,FURNITURE_CATEGORIES} from '../web/src/domain/spatial/furniture-catalog.js';
import {groupSpatialAssets,spatialAssetMatches,spatialObjectThumbnail} from '../web/src/domain/spatial/catalog.js';
import {createScene,addAsset,validateScene} from '../web/src/domain/spatial/scene.js';
import {planSvg} from '../web/src/domain/spatial/plan-svg.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url)));
const visible=library.assets.filter(a=>!a.productId&&a.assetGroup!=='people'&&a.catalogVisible!==false),groups=groupSpatialAssets(library.assets);
assert(FURNITURE_VARIANTS.length>=100);assert.equal(visible.length,library.counts.furniture);
assert.equal(new Set(FURNITURE_VARIANTS.map(a=>a.id)).size,FURNITURE_VARIANTS.length);
assert(new Set(FURNITURE_VARIANTS.map(a=>JSON.stringify(a.parts))).size>=70,'distinct structural recipes');
for(const category of FURNITURE_CATEGORIES)assert(visible.some(a=>a.category===category),category);
for(const industry of library.industries)assert(FURNITURE_VARIANTS.some(a=>a.industries.includes(industry.code)),industry.name);
const normal=s=>s.toLowerCase().replace(/\s/g,''),productNames=new Set(library.assets.filter(a=>a.productId).map(a=>normal(a.name)));
const blank=createScene({templateId:'cowork-cowork-work-standard',width:20,depth:20},library);blank.objects=[];
for(const asset of FURNITURE_VARIANTS){
  assert(!productNames.has(normal(asset.name)),asset.name+' duplicates Samsung product');
  assert(!asset.productId&&asset.powered===false&&asset.size.every(n=>Number.isFinite(n)&&n>0));
  assert(!['display','monitor','laptop','tablet','phone','kiosk','fridge','washer','induction','oven','water','purifier','wallac','light','sensor','printer'].includes(asset.kind));
  assert(asset.description&&asset.spaces.length&&asset.industries.length);
  for(const part of asset.parts)assert([...part.position,...part.size,...(part.rotate||[])].every(Number.isFinite)&&part.size.every(n=>n>0));
  const placed=addAsset(blank,asset.id,blank.rooms[0].id,library);assert(placed.objects.some(o=>o.assetId===asset.id));assert.deepEqual(validateScene(placed,library).errors,[],asset.name);
  assert(!planSvg(placed,library).includes('NaN'));
  assert(fs.existsSync(new URL('../web/public'+spatialObjectThumbnail(library.assets.find(a=>a.id===asset.id)),import.meta.url)),asset.name+' thumbnail');
}
for(const id of ['floorlamp','pendant','displaystand']){
  assert(library.assets.some(a=>a.id==='furniture:'+id),'legacy reference retained');
  assert(!groups.some(g=>g.members.some(a=>a.id==='furniture:'+id)),'overlapping product omitted from catalogue');
}
for(const [query,id] of [['카페 의자','cafe-bentwood'],['교실 의자','school-chair'],['병원 의자','medical-visitor'],['도서관 열람대','desk-carrel'],['호텔 트롤리','cart-service']])assert(spatialAssetMatches(visible.find(a=>a.id==='furniture:'+id),query),query);
for(const [industry,kind,expected] of [['OF','meeting','meeting-sled'],['FB','dining','cafe-bentwood'],['MD','medical','medical-visitor'],['ED','classroom','school-chair']]){
  const template=library.templates.find(t=>t.industry===industry&&t.scope==='single'&&t.variant==='standard'&&t.rooms[0].kind===kind);
  assert(template,industry+' template');const scene=createScene({templateId:template.id},library);assert(scene.objects.some(o=>o.assetId==='furniture:'+expected),industry+' contextual seating');
}
console.log(`PASS ${FURNITURE_VARIANTS.length} new furnishings / ${visible.length} visible furnishings; 7 categories, 16 industries, distinct structures, all placements and SVGs, Samsung exclusion, contextual selection and thumbnails`);
