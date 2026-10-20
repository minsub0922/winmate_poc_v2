import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,validateScene,moveObject,inspectNaturalLayout,repairNaturalLayout,focusScene} from '../web/src/domain/spatial/scene.js';
import {frontVector,faceRotation,facingTarget} from '../web/src/domain/spatial/natural-layout.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url))),scenes=JSON.parse(fs.readFileSync(new URL('../data/spatial/scenes.json',import.meta.url)));
const assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
let checked=0;
for(const [id,scene] of Object.entries(scenes)){
  const quality=inspectNaturalLayout(scene,library);checked+=quality.checked;
  assert.deepEqual(quality.issues,[],id+' natural layout');
  for(const chair of scene.objects.filter(o=>o.facing?.activity==='work'&&['chair','taskchair'].includes(assets[o.assetId].kind))){
    const desk=scene.objects.find(o=>o.id===chair.facing.targetId);assert(desk,id+' matched workstation');
    assert(Math.hypot(chair.x-desk.x,chair.z-desk.z)<1.15,id+' chair can reach desk');
  }
}
assert.equal(faceRotation({x:0,z:0},{x:1,z:0}),270);
assert.equal(faceRotation({x:0,z:0},{x:-1,z:0}),90);
assert.equal(faceRotation({x:0,z:0},{x:0,z:-1}),180);
assert(Math.abs(frontVector({rotation:90}).x+1)<1e-9);
const scene=scenes['cowork-full-standard'];
const broken=structuredClone(scene),brokenIds=[];
for(const object of broken.objects.filter(o=>['chair','taskchair','sofa'].includes(assets[o.assetId].kind))){object.rotation=(object.rotation+180)%360;delete object.facing;brokenIds.push(object.id);}
delete broken.layoutPolicy;
const before=inspectNaturalLayout(broken,library);assert(before.errors.length>=brokenIds.length,'independent detector catches reversed fronts');
const result=repairNaturalLayout(broken,library);assert(result.report.corrected>=brokenIds.length);assert.deepEqual(result.report.after.errors,[]);assert.deepEqual(validateScene(result.scene,library).errors,[]);
assert.deepEqual(result.scene.rooms,scene.rooms,'room boundaries remain unchanged');
assert.deepEqual(result.scene.objects.filter(o=>o.assetId.startsWith('product:')).map(o=>o.assetId).sort(),scene.objects.filter(o=>o.assetId.startsWith('product:')).map(o=>o.assetId).sort(),'Samsung identities preserved');
const work=createScene({templateId:'cowork-cowork-work-standard',roomSettings:[{roomId:'cowork-work',capacity:1}]},library);
const desk=work.objects.find(o=>o.assetId==='furniture:desk'),chair=work.objects.find(o=>o.facing?.targetId===desk.id&&o.facing.activity==='work');assert(chair);
const moved=moveObject(work,desk.id,{x:5.25,z:4.5},library),turned=moveObject(moved,desk.id,{rotation:90},library);
const child=turned.objects.find(o=>o.id===chair.id),surface=turned.objects.find(o=>o.id===desk.id);assert(Math.abs(child.x-(surface.x-.785))<.001);assert.equal(child.rotation,270);
assert.deepEqual(inspectNaturalLayout(turned,library).errors,[]);assert.deepEqual(validateScene(turned,library).errors,[]);
for(const screen of turned.objects.filter(o=>o.facing?.activity==='screen')){
  const target=facingTarget(screen,turned),v=frontVector(screen,assets[screen.assetId]);assert(v.x*(target.x-screen.x)+v.z*(target.z-screen.z)>0,'monitor faces seated user after desk rotation');
}
const deliberate=moveObject(work,chair.id,{rotation:0},library);assert(inspectNaturalLayout(deliberate,library).errors.some(e=>e.objectId===chair.id));
const crowded=createScene({templateId:'cowork-cowork-work-standard',roomSettings:[{roomId:'cowork-work',capacity:8}]},library);
for(const surface of crowded.objects.filter(o=>o.assetId==='furniture:desk'&&o.z>2)){
  const linked=crowded.objects.filter(o=>o.id===surface.id||o.supportId===surface.id||o.facing?.moveWithTarget&&o.facing.targetId===surface.id);
  for(const o of linked)o.z-=.6;
}
delete crowded.layoutPolicy;
assert(inspectNaturalLayout(crowded,library).warnings.some(i=>i.code==='chair-back-blocked'));
const spaced=repairNaturalLayout(crowded,library);assert.deepEqual(spaced.report.after.issues,[],'legacy row reflow reserves chair approach aisles');assert.equal(spaced.scene.objects.filter(o=>o.assetId==='furniture:taskchair').length,8);
for(const room of scene.rooms)assert.deepEqual(inspectNaturalLayout(focusScene(scene,room.id),library).errors,[]);
console.log(`PASS ${Object.keys(scenes).length} maps / ${checked} facing-and-spacing relationships; reversed chairs/sofas detected and repaired; desks, chairs and screens move together`);
