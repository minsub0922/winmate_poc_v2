import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,validateScene,inspectNaturalLayout,inferProducts} from '../web/src/domain/spatial/scene.js';
import {spatialTemplateCatalog} from '../web/src/domain/spatial/template-catalog.js';
import {studioDocumentFromTemplate,packStudioRooms,createSceneFromForm} from '../web/src/domain/spatial/studio-form.js';
import {TEMPLATE_ROOM,roomGridColumns} from '../web/src/domain/spatial/template-composition.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url))),scenes=JSON.parse(fs.readFileSync(new URL('../data/spatial/scenes.json',import.meta.url))),sources=JSON.parse(fs.readFileSync(new URL('../data/spatial/industry-sources.json',import.meta.url)));
const sizes=JSON.stringify(library.assets.map(a=>[a.id,a.size]));
const visible=spatialTemplateCatalog(library);assert.equal(library.templateDefaults.scope,'full');assert(visible.length>=16);assert(visible.every(t=>t.rooms.length>=2&&t.rooms.length%2===0));
assert.deepEqual(visible.slice(0,16).map(t=>t.industry),library.industries.map(i=>i.code));assert(visible.slice(0,16).every(t=>t.rooms.length===6));
for(const t of library.templates){
 if(t.scope==='full')assert(t.rooms.length%2===0,t.id+' even room count');
 const scene=createScene({templateId:t.id},library);assert.deepEqual(scene,scenes[t.id],t.id+' deterministic');assert.deepEqual(validateScene(scene,library).errors,[],t.id);assert.deepEqual(inspectNaturalLayout(scene,library).issues,[],t.id+' natural layout');
}
assert.equal(JSON.stringify(library.assets.map(a=>[a.id,a.size])),sizes,'room composition never scales product/furniture/people assets');
for(const industry of library.industries){
 const t=library.templates.find(t=>t.industry===industry.code&&t.scope==='full'&&t.variant==='standard'&&!t.id.startsWith('case-'));
 const scene=scenes[t.id];assert.equal(scene.rooms.length,6);assert.equal(new Set(scene.rooms.map(r=>r.x)).size,3);assert.equal(new Set(scene.rooms.map(r=>r.z)).size,2);
 for(const r of scene.rooms){assert(Math.abs(r.width-TEMPLATE_ROOM.width)<.0001);assert(Math.abs(r.depth-TEMPLATE_ROOM.depth)<.0001);}
 const source=sources.find(s=>s.code===industry.code),originalKeys=new Set(source.rooms.map(r=>r.key)),covered=new Set(t.rooms.flatMap(r=>r.includedSpaces?.map(s=>s.key)||[r.key]));assert.deepEqual(covered,originalKeys,industry.code+' original room functions remain traceable');
 const products=new Set(t.rooms.flatMap(r=>r.productIds));for(const r of source.rooms)for(const id of inferProducts(r.productsText,library.assets))assert(products.has(id),industry.code+' source product preserved '+id);
}
const cowork=library.templates.find(t=>t.id==='cowork-full-standard'),document=studioDocumentFromTemplate(cowork,library);assert.equal(document.form.rooms.length,6);assert.equal(new Set(document.scene.rooms.map(r=>r.z)).size,2);assert.deepEqual(validateScene(createSceneFromForm(document.form,library),library).errors,[]);
for(const n of [2,4,6]){const packed=packStudioRooms(Array.from({length:n},()=>({kind:'lounge',width:7.2,depth:6.3})));assert.equal(new Set(packed.rectangles.map(r=>r.x)).size,roomGridColumns(n));assert.equal(packed.rectangles.length,n);}
const subset=createScene({templateId:cowork.id,roomKeys:cowork.rooms.slice(0,2).map(r=>r.key)},library);assert(subset.rooms.every(r=>Math.abs(r.width-9.45)<.0001&&Math.abs(r.depth-8.1)<.0001),'room selection retains the same actual size');
const legacy={...cowork,id:'legacy-five',rooms:cowork.rooms.slice(0,5),width:31.94,depth:19.8};delete legacy.compositionVersion;delete legacy.roomReference;
const old=createScene({templateId:legacy.id},{...library,templates:[legacy]});assert.equal(old.rooms.length,5);assert(old.rooms.every(r=>Math.abs(r.width-10.5)<.0001&&Math.abs(r.depth-9)<.0001),'archived templates keep original dimensions and count');
assert(spatialTemplateCatalog(library,{scope:'single'}).every(t=>t.rooms.length===1),'individual spaces remain an explicit filter');
const counts={};for(const t of library.templates)counts[t.rooms.length]=(counts[t.rooms.length]||0)+1;
const out=new URL('./output/spatial-density/',import.meta.url);fs.mkdirSync(out,{recursive:true});fs.writeFileSync(new URL('unit-report.json',out),JSON.stringify({ok:true,sourceHash:library.sourceHash,templates:library.templates.length,defaultChoices:visible.length,roomCounts:counts,standardRoom:[9.45,8.1],linearReduction:.1,areaReduction:.19,assetDimensionsPreserved:true,checkedAt:new Date().toISOString()},null,2));
console.log(`PASS ${library.templates.length} smaller templates; default six rooms in 3×2, all other overview counts even, complete source/product references, fixed object dimensions, natural placement and archived size preservation`);
