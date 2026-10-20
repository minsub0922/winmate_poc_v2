import assert from 'node:assert/strict';
import fs from 'node:fs';
import {emptyStudioForm,studioFormFromTemplate,studioDocumentFromTemplate,studioFormFromScene,createSceneFromForm,studioFormKey,validateStudioForm} from '../web/src/domain/spatial/studio-form.js';
import {createScene,validateScene,inspectNaturalLayout} from '../web/src/domain/spatial/scene.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url)));
const blank=emptyStudioForm();assert.equal(blank.industry,'');assert.deepEqual(blank.rooms,[]);assert.throws(()=>createSceneFromForm(blank,library),/업종/);
const form={...blank,title:'공간 입력 검증',industry:'OF',rooms:[
  {id:'custom-lobby',name:'방문자 로비',kind:'reception',width:8,depth:7,capacity:'',products:[{productId:'qm55c',quantity:2}]},
  {id:'custom-meeting',name:'하이브리드 미팅룸',kind:'meeting',width:9,depth:8,capacity:8,products:[{productId:'flip',quantity:1},{productId:'ac360',quantity:1}]},
]};
const scene=createSceneFromForm(form,library,{documentId:'sp-input-test'});assert.equal(scene.source.documentId,'sp-input-test');assert.equal(scene.formKey,studioFormKey(form));
assert.deepEqual(scene.rooms.map(r=>[r.id,r.name,r.width,r.depth]),[['custom-lobby','방문자 로비',8,7],['custom-meeting','하이브리드 미팅룸',9,8]]);
const products=scene.objects.filter(o=>o.assetId.startsWith('product:'));assert.equal(products.length,4);assert.deepEqual([...new Set(products.map(o=>o.assetId))].sort(),['product:ac360','product:flip','product:qm55c']);
assert.equal(products.filter(o=>o.roomId==='custom-lobby').length,2);assert.equal(products.filter(o=>o.roomId==='custom-meeting').length,2);
assert.deepEqual(validateScene(scene,library).errors,[]);assert.deepEqual(inspectNaturalLayout(scene,library).issues,[]);assert.deepEqual(createSceneFromForm(form,library,{documentId:'sp-input-test'}),scene);
const roundtrip=studioFormFromScene(scene);assert.deepEqual(roundtrip.rooms.map(r=>r.products),form.rooms.map(r=>r.products));
const preset=studioFormFromTemplate(library.templates.find(t=>t.id==='cowork-full-standard'),library);assert.equal(preset.rooms.length,6);assert.equal(preset.templateId,'cowork-full-standard');assert.equal(preset.industry,'OF');
for(const industry of ['OF','FB','HT']){
  const template=library.templates.find(t=>t.industry===industry&&t.scope==='full'&&t.variant==='standard'),expected=createScene({templateId:template.id},library),document=studioDocumentFromTemplate(template,library);
  assert.deepEqual(document.scene.rooms,expected.rooms);assert.deepEqual(document.scene.objects,expected.objects);assert.deepEqual(document.scene.camera,expected.camera);assert.equal(document.scene.assetRevision,expected.assetRevision);
  assert.equal(document.scene.formKey,studioFormKey(document.form));assert.equal(document.scene.formKey,studioFormKey({...studioFormFromScene(document.scene),templateId:template.id}));assert.deepEqual(validateScene(document.scene,library).errors,[]);
}
const noDefaults=createSceneFromForm({...form,rooms:form.rooms.map(r=>({...r,products:[]}))},library);assert.equal(noDefaults.objects.filter(o=>o.assetId.startsWith('product:')).length,0);
const invalid=structuredClone(form);invalid.rooms[0].products[0].productId='missing';assert(validateStudioForm(invalid,library,{complete:true}).length);assert.throws(()=>createSceneFromForm(invalid,library));
const scaled=createSceneFromForm({...form,rooms:[{...form.rooms[0],id:'large-work',name:'30인 업무 공간',kind:'office',width:'',depth:'',capacity:30,products:[{productId:'smartmonitor',quantity:30}]}]},library);
assert.equal(scaled.objects.filter(o=>o.assetId==='furniture:taskchair').length,30);assert.equal(scaled.objects.filter(o=>o.assetId==='product:smartmonitor').length,30);assert.deepEqual(inspectNaturalLayout(scaled,library).issues,[]);
console.log('PASS blank inputs, exact room names/sizes/products/quantities, independent industry choice, template-to-input flow, 30-seat auto sizing, natural layout and reproducibility');

const custom={...form,rooms:[{...form.rooms[0],kind:'lounge',customPurpose:'크리에이터 촬영 준비 공간'}]};
assert.deepEqual(validateStudioForm(custom,library,{complete:true}),[]);
const customScene=createSceneFromForm(custom,library);assert.equal(customScene.rooms[0].purpose,custom.rooms[0].customPurpose);assert.equal(studioFormFromScene(customScene).rooms[0].customPurpose,custom.rooms[0].customPurpose);
assert(validateStudioForm({...custom,rooms:[{...custom.rooms[0],customPurpose:'   '}]},library,{complete:true}).length);
assert.deepEqual(validateStudioForm({...custom,rooms:[{...custom.rooms[0],customPurpose:''}]},library),[]);
assert(validateStudioForm({...custom,rooms:[{...custom.rooms[0],customPurpose:'a'.repeat(101)}]},library).length);
console.log('PASS custom purpose survives generation and scene roundtrip; drafts and purpose length are validated');
