// Real isolated API + browser: shared algorithms, snapshot projection and main-thread work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {openApp,library} from './fixtures/birdseye/harness.mjs';
const require=createRequire(new URL('../web/package.json',import.meta.url)),sharp=require('sharp');
const app=await openApp('spatial-backend'),{page,api,base,output,pass}=app;
const requests=[];
page.on('response',r=>{if(/\/api\/spatial\/(compute|snapshot)$/.test(r.url()))requests.push({url:r.url(),status:r.status()});});
try{
  await page.goto(base+'/spatial');await page.locator('.sp-home-launches').waitFor({timeout:120000});
  const result=await page.evaluate(async()=>{
    const {computeSpatial,captureSpatial,loadSpatialLibrary}=await import('/src/services/spatial.js');
    const {computeSpatial:local}=await import('/src/domain/spatial/compute.js');
    const {studioFormFromScene}=await import('/src/domain/spatial/studio-form.js');
    const lib=await loadSpatialLibrary(),input={kind:'template',templateId:'cowork-cowork-meet-standard'};
    let contexts=0;const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind,...rest){if(/^webgl/.test(kind))contexts++;return original.call(this,kind,...rest);};
    const remote=await computeSpatial(input,lib),expected=local(input,lib);
    const form=studioFormFromScene(remote.scene);
    const formInput={kind:'form',form,documentId:'parity-test'};
    const rebuilt=await computeSpatial(formInput,lib),localRebuilt=local(formInput,lib);
    const floorInput={kind:'floor',scene:remote.scene,meta:{id:'parity-floor',name:'동일 층'}};
    const floor=await computeSpatial(floorInput,lib),localFloor=local(floorInput,lib);
    const options={w:1280,h:820,pixelRatio:1,transparentBackground:true,preview:true};
    const shot=await captureSpatial(remote.scene,lib,options);
    HTMLCanvasElement.prototype.getContext=original;
    window.__spatialParity={scene:remote.scene,lib,options};
    return {remote,expected,rebuilt,localRebuilt,floor:floor.pack,localFloor:localFloor.pack,shot,contexts};
  });
  assert.deepEqual(result.remote.scene,result.expected.scene);assert.deepEqual(result.remote.form,result.expected.form);
  assert.deepEqual(result.rebuilt.scene,result.localRebuilt.scene);assert.deepEqual(result.floor,result.localFloor);
  assert.equal(result.contexts,0,'server scene generation and extraction must create no browser WebGL context');
  assert(requests.length>=4&&requests.every(r=>r.status===200),JSON.stringify(requests));
  pass('template/form generation, building floor data and snapshot extraction run on the server with identical source algorithms and no client WebGL');

  const localShot=await page.evaluate(async()=>{
    const {createSpatialRenderer}=await import('/src/domain/spatial/render-three.js');
    const {scene,lib,options}=window.__spatialParity,host=document.createElement('div');
    host.style.cssText='position:fixed;left:-20000px;top:0;width:1600px;height:1025px';document.body.append(host);
    const renderer=createSpatialRenderer(host,{pixelRatio:1});
    try{renderer.setScene(scene,lib);await renderer.ready();return renderer.snapshot(options);}
    finally{renderer.dispose();host.remove();}
  });
  const compareNumbers=(a,b)=>{if(typeof a==='number'){assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);return;}if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(a))compareNumbers(a[k],b[k]);}else assert.equal(a,b);};
  compareNumbers(result.shot.anchors,localShot.anchors);compareNumbers(result.shot.camera,localShot.camera);
  const bytes=s=>Buffer.from(s.split(',')[1],'base64');
  const remoteImage=bytes(result.shot.image),localImage=bytes(localShot.image);
  fs.writeFileSync(output+'/server.png',remoteImage);fs.writeFileSync(output+'/browser.png',localImage);
  const a=await sharp(remoteImage).ensureAlpha().raw().toBuffer(),b=await sharp(localImage).ensureAlpha().raw().toBuffer();assert.equal(a.length,b.length);
  let error=0;for(let i=0;i<a.length;i++)error+=Math.abs(a[i]-b[i]);const meanPixelError=error/a.length;
  assert(meanPixelError<2,`server/browser pixel error ${meanPixelError}`);
  pass('server image, room/object anchors and camera match the browser capture, including transparency');

  const building=await page.evaluate(async()=>{
    const {loadBuildingModule}=await import('/src/services/building-bridge.js');
    const mod=await loadBuildingModule();await mod.ready();
    await Promise.all([...document.fonts].filter(f=>f.family.includes('Noto Sans KR')).map(f=>f.load()));
    const options={floors:[mod.data().tpl[0].id,mod.data().tpl[1].id],title:'동일 건물',w:640,h:410};
    const toURL=blob=>new Promise(resolve=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.readAsDataURL(blob);});
    let contexts=0;const original=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(kind,...rest){if(/^webgl/.test(kind))contexts++;return original.call(this,kind,...rest);};
    let remote;
    try{remote=await toURL(await mod.thumbnail(options));}finally{HTMLCanvasElement.prototype.getContext=original;}
    const hook=window.__wmBldThumbnailHook;window.__wmBldThumbnailHook=null;
    try{return {remote,local:await toURL(await mod.thumbnail(options)),contexts};}finally{window.__wmBldThumbnailHook=hook;}
  });
  assert.equal(building.contexts,0,'building cards must not open a client WebGL renderer');
  const buildingRemote=bytes(building.remote),buildingLocal=bytes(building.local);
  fs.writeFileSync(output+'/building-server.png',buildingRemote);fs.writeFileSync(output+'/building-browser.png',buildingLocal);
  const ba=await sharp(buildingRemote).ensureAlpha().raw().toBuffer(),bb=await sharp(buildingLocal).ensureAlpha().raw().toBuffer();assert.equal(ba.length,bb.length);
  let buildingError=0;for(let i=0;i<ba.length;i++)buildingError+=Math.abs(ba[i]-bb[i]);buildingError/=ba.length;
  assert(buildingError<2,`building server/browser pixel error ${buildingError}`);
  pass('building tabs use the same server thumbnail path with identical floor geometry, facade and Korean signage');

  // A caller cannot request a scene using a different frozen asset revision.
  const mismatch=await app.context.request.post(base+'/api/spatial/snapshot',{headers:{Origin:base},data:{scene:result.remote.scene,revision:'deadbeef'}});assert.equal(mismatch.status(),422);
  const saved=await api.post('/api/spatial/history',{scene:result.remote.scene,form:result.remote.form,view:'3d'});
  const read=await api.get('/api/spatial/history/'+saved.id);assert.deepEqual(read.scene,result.remote.scene);
  pass('the scene round-trips through history; mismatched asset revisions are rejected');

  const perf=await page.evaluate(async()=>{
    const {changeProposal}=await import('/src/repositories/proposal-update.js');
    const {markLayoutChanges}=await import('/src/domain/slides/context-policy.js');
    const {embedSpatial}=await import('/src/domain/spatial/slide-binding.js');
    const {scene,lib}=window.__spatialParity;
    const p={title:'성능 비교',customer:'고객',req:{free:[]},ctx:{products:[],solutions:[],cases:[]},layoutPlan:{parts:{}},parts:Array.from({length:8},(_,i)=>({id:'p'+i,name:'파트'+i,type:'scenario',items:[],layouts:Array.from({length:8},(_,j)=>({uid:i+'-'+j,f:'L_SPATIAL_3D',status:'done',ov:{t:{},img:{},spatial:embedSpatial(scene,lib,{view:'3d'})}}))}))};
    const count=30;let a=p,b=p;
    let start=performance.now();for(let i=0;i<count;i++){const next=structuredClone(a);next.layoutPlan.parts.p0=i;markLayoutChanges(next,a);a=next;}const before=performance.now()-start;
    start=performance.now();for(let i=0;i<count;i++)b=changeProposal(b,d=>{d.layoutPlan.parts.p0=i;},{mark:markLayoutChanges,touch:false});
    return {updates:count,slides:64,bytes:JSON.stringify(p).length,beforeMs:before,afterMs:performance.now()-start,unchangedSheets:b.parts===p.parts};
  });
  assert(perf.unchangedSheets);assert(perf.afterMs<perf.beforeMs);
  pass('progress updates preserve all 64 sheets and avoid full copying/validation');

  let release,arrived;
  const held=new Promise(resolve=>release=resolve),started=new Promise(resolve=>arrived=resolve),savedScenes=[];
  let delay=true;
  const delayed=async route=>{
    const body=route.request().postDataJSON();
    if(!delay||body.kind!=='form'||!body.documentId?.startsWith('sb-'))return route.continue();
    delay=false;const response=await route.fetch();arrived();await held;await route.fulfill({response});
  };
  await page.route('**/api/spatial/compute',delayed);
  page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/spatial/history'))savedScenes.push(r.postDataJSON().scene);});
  const pid=await page.evaluate(async()=>{
    const {createProposal,update,getProposal}=await import('/src/repositories/proposals.js');
    const {startBirdseye}=await import('/src/services/space-plan.js');
    const id=createProposal();
    window.__getRaceProposal=getProposal;
    update(id,d=>{d.title='늦은 결과 검사';d.ind='OF';d.parts=[{id:'aerial',name:'공간 제안',type:'scenario',items:[],layouts:[{uid:'only-aerial',f:'L_SPATIAL_3D',status:'empty',ov:{t:{},img:{}}}]}];d.spacePlan={v:1,vertical:{id:'of_sme',group:'OF'},spaces:[{id:'meeting',name:'이전 회의실',kind:'meeting',products:[]},{id:'lounge',name:'라운지',kind:'lounge',products:[]}]};});
    window.__pendingBirdseye=startBirdseye(id,{auto:true});return id;
  });
  await started;
  await page.evaluate(async id=>{const {update}=await import('/src/repositories/proposals.js');update(id,d=>{d.spacePlan.spaces[0].name='변경 회의실';});},pid);
  release();
  await page.waitForFunction(id=>{const p=window.__getRaceProposal(id);return p.spacePlan.birdseye?.status==='done'&&p.parts[0]?.layouts[0]?.ov?.spatial?.scene?.rooms[0]?.name==='변경 회의실';},pid,{timeout:120000});
  const consistent=await page.evaluate(async id=>{const p=(await import('/src/repositories/proposals.js')).getProposal(id);return p.parts.flatMap(p=>p.layouts).map(x=>({uid:x.uid,rooms:x.ov.spatial?.scene.rooms.map(r=>r.name)}));},pid);
  assert.deepEqual(consistent,[{uid:'only-aerial',rooms:['변경 회의실','라운지']}]);
  const created=savedScenes.filter(scene=>scene.source?.documentId==='sb-'+pid);assert.equal(created.length,1);assert.equal(created[0].rooms[0].name,'변경 회의실');
  await page.unroute('**/api/spatial/compute',delayed);
  pass('an older server result cannot overwrite renamed spaces; the current two spaces are saved in one aerial sheet');
  assert.deepEqual(app.errors,[]);
  fs.writeFileSync(output+'/report.json',JSON.stringify({sourceHash:library.sourceHash,at:new Date().toISOString(),meanPixelError,buildingError,perf,requests,checks:app.checks},null,2));
  console.log(JSON.stringify({meanPixelError,buildingError,perf,output}));
}finally{await app.close();}
