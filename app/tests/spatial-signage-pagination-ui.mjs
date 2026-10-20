import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {createScene} from '../web/src/domain/spatial/scene.js';
import {groupSpatialAssets,spatialAssetLabel} from '../web/src/domain/spatial/catalog.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'output/spatial-signage-review');fs.mkdirSync(out,{recursive:true});
const library=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json')));
const port=Number(process.env.SPATIAL_TEST_WEB_PORT||5204),base='http://127.0.0.1:'+port;
process.env.WINMATE_API_PORT=process.env.SPATIAL_TEST_API_PORT||'8804';process.env.WINMATE_WEB_PORT=String(port);
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true,hmr:false}});
let browser;const report={sourceHash:library.sourceHash,productFingerprint:crypto.createHash('sha256').update(JSON.stringify(library.assets.filter(a=>a.productId))).digest('hex'),startedAt:new Date().toISOString(),pagination:[],photos:[],errors:[]};
try{
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport:{width:1500,height:960}});assert.equal((await context.request.post(base+'/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'}})).status(),200);
  const form={version:1,title:'스크롤 목록 검증',industry:'OF',style:'modern',templateId:null,rooms:[{id:'pagination-room',name:'업무실',kind:'office',width:10,depth:9,capacity:1,products:[],furniture:[]}]};
  const response=await context.request.post(base+'/api/spatial/drafts',{data:{form,view:'2d'}});assert.equal(response.status(),201);const draft=await response.json();
  for(const width of [1500,390]){
    const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));await page.setViewportSize({width,height:960});
    await page.route('**/api/spatial/library',route=>route.fulfill({json:library}));
    await page.goto(base+'/spatial/'+draft.id);await page.locator('[data-spatial-id]').waitFor({timeout:120000});
    await page.getByRole('button',{name:'제품 · 가구 오브젝트',exact:true}).click();const scroll=page.locator('#sp-library-popup'),cards=scroll.locator('.sp-object-card');await cards.first().waitFor();
    assert.equal(await page.getByRole('button',{name:'오브젝트 더 보기'}).count(),0);
    const initial=await cards.count();await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForFunction(initial=>document.querySelectorAll('#sp-library-popup .sp-object-card').length>initial,initial);
    const afterScroll=await cards.count();assert(afterScroll>initial);
    if(width===1500){
      await page.getByLabel('오브젝트 제품군',{exact:true}).selectOption('디스플레이');await page.getByLabel('오브젝트 검색',{exact:true}).fill('QM55C');await cards.first().hover();
      const comparison=page.locator('.sp-product-comparison');await comparison.waitFor();assert((await comparison.innerText()).includes('1237.9 × 708.8 × 28.5 mm'));await page.getByLabel('오브젝트 검색',{exact:true}).fill('');
    }
    await page.getByLabel('오브젝트 제품군',{exact:true}).selectOption('furniture');
    const firstFurniture=groupSpatialAssets(library.assets).find(g=>!g.members[0].productId&&g.members[0].assetGroup!=='people').members[0],selectedLabel=spatialAssetLabel(firstFurniture),chosenCard=scroll.getByRole('button',{name:selectedLabel,exact:true});
    await chosenCard.waitFor();await page.waitForFunction(()=>document.querySelector('#sp-library-popup').scrollTop===0);
    await chosenCard.hover();const peek=page.locator('.sp-furniture-peek');await peek.waitFor();const a=await chosenCard.boundingBox(),b=await peek.boundingBox();
    assert(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),'hover preview must not intercept the card click');
    await chosenCard.click();await page.waitForFunction(label=>[...document.querySelectorAll('#sp-library-popup .sp-object-card')].find(el=>el.getAttribute('aria-label')===label)?.getAttribute('aria-pressed')==='true',selectedLabel);
    let batches=0;
    while(await scroll.locator('[data-visible-count]').evaluate(el=>el.dataset.visibleCount!==el.dataset.totalCount)){
      const count=await cards.count();await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);await page.waitForFunction(count=>document.querySelectorAll('#sp-library-popup .sp-object-card').length>count,count);if(++batches>15)throw new Error('pagination did not reach its last page');
    }
    assert.equal(await page.getByRole('button',{name:selectedLabel,exact:true}).getAttribute('aria-pressed'),'true');
    const allFurniture=await cards.count();await page.getByLabel('오브젝트 검색',{exact:true}).fill('없는-오브젝트-검증');await scroll.locator('.sp-empty-results').waitFor();assert.equal(await cards.count(),0);
    await page.getByLabel('오브젝트 검색',{exact:true}).fill('');await cards.first().waitFor();assert.equal(await scroll.evaluate(el=>el.scrollTop),0);assert((await cards.count())<allFurniture);
    await page.screenshot({path:path.join(out,'pagination-'+width+'.png')});report.pagination.push({width,initial,afterScroll,allFurniture,batches,selectionPreserved:true,filterReset:true});await page.close();
  }
  const beforeFile=path.join(out,'library-before.json');
  if(fs.existsSync(beforeFile)){
    const legacy=JSON.parse(fs.readFileSync(beforeFile)),legacyScene=createScene({templateId:'cowork-full-standard'},legacy);
    const saved=await context.request.post(base+'/api/spatial/history',{data:{scene:legacyScene,view:'2d'}});assert.equal(saved.status(),201);const record=await saved.json();
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.route('**/api/spatial/library',route=>route.fulfill({json:library}));await page.goto(base+'/spatial/'+record.id);
    const update=page.getByRole('button',{name:'제품 형상 업데이트',exact:true});await update.waitFor({timeout:120000});await update.click();await update.waitFor({state:'detached'});
    await page.getByRole('button',{name:'실행 취소',exact:true}).click();await update.waitFor();await page.getByRole('button',{name:'다시 실행',exact:true}).click();await update.waitFor({state:'detached'});
    await page.getByRole('button',{name:'뒤로 가기',exact:true}).click();await page.waitForURL('**/spatial');
    const updated=await(await context.request.get(base+'/api/spatial/history/'+record.id)).json();
    assert.equal(updated.scene.assetRevision,library.sourceHash);assert.equal(updated.scene.objects.length,legacyScene.objects.length);
    assert.deepEqual(updated.scene.objects.map(o=>o.id),legacyScene.objects.map(o=>o.id));report.assetUpgrade={preservedObjectIds:true,undo:true,redo:true,persistedRevision:updated.scene.assetRevision};await page.close();
  }
  const page=await context.newPage();await page.goto(base+'/favicon.ico');
  await page.evaluate(async library=>{window.testLibrary=library;const {createSpatialRenderer}=await import('/src/domain/spatial/render-three.js');const host=document.createElement('div');host.style.cssText='width:768px;height:512px';document.body.appendChild(host);window.photoRenderer=createSpatialRenderer(host,{objectOnly:true});},library);
  const assets=library.assets.filter(a=>a.appearance?.displayFaces?.some(f=>f.face==='front')||a.appearance?.facade&&a.appearance.surface==='front');
  const selected=new Set(['qm55c','qm65c','oh55a','window','thewall','epaper','smartmonitor','flip','led_indoor','led_outdoor','onyx','ec_360_113','sg_g000183669','laundry','airdresser','purifier']);
  const tasks=assets.map(asset=>({asset,view:'front'}));
  for(const id of ['qm55c','smartmonitor','flip']){const asset=assets.find(a=>a.productId===id);if(asset?.appearance.displayFaces?.some(f=>f.face==='back'))tasks.push({asset,view:'back'});}
  for(const {asset,view} of tasks){
    const result=await page.evaluate(async({asset,view,save})=>{
      const renderer=window.photoRenderer,scene={version:1,title:asset.name,style:'modern',width:6,depth:4,rooms:[],objects:[{id:'product',assetId:asset.id,x:3,z:2,elevation:0,rotation:view==='back'?180:0}],camera:{azimuth:0,elevation:0}};
      renderer.setScene(scene,window.testLibrary);await renderer.ready();const snapshot=renderer.snapshot({w:768,h:512}),face=asset.appearance.displayFaces?.find(f=>f.face===view)||{image:asset.appearance.facade,size:asset.size.slice(0,2),position:[0,asset.size[1]/2,asset.size[2]/2]},scale=512/renderer.cameraState().fit;
      const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});
      const actualCanvas=document.createElement('canvas');actualCanvas.width=768;actualCanvas.height=512;const actualContext=actualCanvas.getContext('2d');actualContext.drawImage(await load(snapshot.image),0,0);
      const expected=await load(face.image),expectedCanvas=document.createElement('canvas');expectedCanvas.width=768;expectedCanvas.height=512;const ec=expectedCanvas.getContext('2d');
      const x0=384+face.position[0]*scale-face.size[0]*scale/2,y0=256-(face.position[1]-asset.size[1]/2)*scale-face.size[1]*scale/2;
      ec.drawImage(expected,x0,y0,face.size[0]*scale,face.size[1]*scale);
      const actual=actualContext.getImageData(0,0,768,512).data,reference=ec.getImageData(0,0,768,512).data;
      let error=0,samples=0;
      for(let iy=0;iy<18;iy++)for(let ix=0;ix<32;ix++){
        const u=.15+.7*ix/31,v=.15+.7*iy/17,x=Math.round(x0+u*face.size[0]*scale),y=Math.round(y0+v*face.size[1]*scale);
        // Match local means so a physical LED grid's mipmap aliasing is not
        // mistaken for a different image. Geometry and crop coordinates remain exact.
        if(reference[(y*768+x)*4+3]<245)continue;
        for(let c=0;c<3;c++){let av=0,ev=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const p=((y+dy)*768+x+dx)*4+c;av+=actual[p];ev+=reference[p];}error+=Math.abs(av-ev)/25;samples++;}
      }
      return {mae:error/samples,ratio:face.size[0]/face.size[1],panelSize:asset.displaySpec?.panelSize||asset.size,...(save?{image:snapshot.image}:{})};
    },{asset,view,save:selected.has(asset.productId)});
    report.photos.push({id:asset.productId,kind:asset.kind,display:!!asset.displaySpec,view,mae:result.mae,panelSize:result.panelSize});
    if(result.image)fs.writeFileSync(path.join(out,asset.productId+'-'+view+'.png'),Buffer.from(result.image.split(',')[1],'base64'));
    assert(result.mae<14,asset.productId+' rendered panel does not match the actual product photograph; MAE='+result.mae);
  }
  await page.evaluate(()=>window.photoRenderer.dispose());assert.deepEqual(report.errors,[]);report.ok=true;
  console.log(`PASS desktop/mobile scroll pagination, filter reset, persistent selection, and ${report.photos.length} actual product photo comparisons`);
}finally{report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,process.env.SPATIAL_REVIEW_REPORT||'ui-report.json'),JSON.stringify(report,null,2));await browser?.close();await server.close();}
