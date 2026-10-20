// Catalog browsing, independent proposal copies, persisted edits and visual
// re-import of the generated editable PPTX decks, in an isolated browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'output/vertical-scenarios');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const data=await read('app/web/src/domain/templates/vertical_scenarios.json');
const bootstrap={catalog:await read('app/data/catalog.json'),images:await read('app/data/images.json'),products:await read('app/data/products_db.json'),user:{username:'vertical-ui-test',auth_enabled:false},capabilities:null};
const server=await createServer({root:path.join(root,'app/web'),cacheDir:path.join(out,'ui-vite-cache'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
let browser;const report={dataSha256:createHash('sha256').update(JSON.stringify(data)).digest('hex'),searched:[],roundtrips:[],errors:[]};
try{
 await server.listen();const base='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route(u=>u.pathname.startsWith('/api/'),r=>r.fulfill(new URL(r.request().url()).pathname==='/api/bootstrap'?{json:bootstrap}:{status:503,json:{detail:'No API/model calls in isolated UI tests'}}));
 await context.route(u=>u.pathname.startsWith('/img/')||u.pathname.startsWith('/lib/'),async r=>{try{const pathname=decodeURIComponent(new URL(r.request().url()).pathname);await r.fulfill({path:path.join(root,pathname.startsWith('/img/lib/')?'':'app/data/static',pathname)});}catch{await r.abort();}});
 const page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base);await page.locator('.home').waitFor();await page.locator('.sb-bs').click();await page.locator('.bsl').first().waitFor();
 assert.equal(await page.locator('.bsl').count(),82);
 for(const s of data.scenarios){
  const customer=data.customers[s.id];await page.getByRole('textbox',{name:'시나리오 검색',exact:true}).fill(customer);
  await page.locator('.bsl-t').filter({hasText:customer}).waitFor();assert.equal(await page.locator('.bsl').count(),1);
  report.searched.push(s.id);
 }
 await page.locator('.bsl-more').click();await page.locator('.modal.sbv').waitFor();
 assert.match(await page.locator('.modal.sbv').innerText(),/14/);await page.screenshot({path:path.join(out,'scenario-detail.png')});
 await page.locator('.modal.sbv').getByRole('button',{name:'닫기',exact:true}).first().click();
 const clone=await page.evaluate(async()=>{
  const {activateScenario}=await import('/src/pages/ScenariosPage.jsx'),{SC}=await import('/src/domain/templates/scenarios.js');
  const store=await import('/src/repositories/proposals.js'),{FILLS}=await import('/src/domain/templates/scenario_fills.js');
  const sid='bs_v_smart_school_2',original=JSON.stringify(FILLS[sid]);activateScenario(SC[sid]);const a=store.getProposals()[0];
  activateScenario(SC[sid]);const b=store.getProposals()[0];
  const aU=a.parts[0].layouts[0].uid,bU=b.parts[0].layouts[0].uid;
  store.update(a.id,p=>{p.title='독립 편집 · 새솔 학교 제안';p.parts[0].layouts[0].ov.t['1']='편집된 제안 제목';});
  return {a:a.id,b:b.id,aU,bU,originalUnchanged:original===JSON.stringify(FILLS[sid]),otherUnchanged:store.getProposal(b.id).parts[0].layouts[0].ov.t['1']!=='편집된 제안 제목'};
 });
 assert.notEqual(clone.a,clone.b);assert.notEqual(clone.aU,clone.bU);assert.ok(clone.originalUnchanged&&clone.otherUnchanged);report.clone=clone;
 await page.waitForTimeout(400);await page.reload();await page.locator('.app').waitFor();
 const reopened=await page.evaluate(async id=>{const {getProposal}=await import('/src/repositories/proposals.js');const p=getProposal(id);return {title:p.title,text:p.parts[0].layouts[0].ov.t['1'],pages:p.parts.reduce((n,x)=>n+x.layouts.length,0)};},clone.a);
 assert.equal(reopened.title,'독립 편집 · 새솔 학교 제안');assert.equal(reopened.text,'편집된 제안 제목');assert.equal(reopened.pages,14);report.reopened=reopened;
 await page.evaluate(()=>{document.querySelector('.app').style.display='none';const h=document.createElement('div');h.id='restored-slide';h.style.cssText='position:absolute;left:0;top:0;width:1280px;height:720px;background:white';document.body.appendChild(h);});
 await fs.mkdir(path.join(out,'restored'),{recursive:true});
 const chosen=process.env.VERTICAL_RESTORE_ONLY?data.scenarios.filter(s=>s.id.includes(process.env.VERTICAL_RESTORE_ONLY)):data.scenarios;
 for(const s of chosen){
  const b64=(await fs.readFile(path.join(out,'decks',s.id+'.pptx'))).toString('base64');
  const result=await page.evaluate(async({b64,id})=>{
   const {convertPptx}=await import('/src/domain/slides/import/pptx2html.js'),{FILLS}=await import('/src/domain/templates/scenario_fills.js');
   const {slides,images,warnings}=await convertPptx(Uint8Array.from(atob(b64),x=>x.charCodeAt(0)).buffer);
   const map=new Map([...images].map(([key,blob])=>[key,URL.createObjectURL(blob)]));
   const html=slides.map(s=>s.html.replace(/wmimg:([\w-]+)/g,(_,token)=>map.get(token)||''));
   const missing=[];for(let k=0;k<slides.length;k++){
    const actual=slides[k].text.replace(/\s/g,'');
    for(const [i,value] of Object.entries(FILLS[id][k].t)){
     const text=String(value?.html??value??'').replace(/<[^>]*>/g,'').replace(/\s/g,'');
     if(text.length>3&&!actual.includes(text))missing.push({page:k+1,i,text});
    }
   }
   window.__verticalRestored=html;return {slides:slides.length,images:images.size,warnings,missing};
  },{b64,id:s.id});
  assert.equal(result.slides,14);assert.equal(result.missing.length,0,s.id+' editable text lost');assert.equal(result.warnings.length,0,s.id+' import warnings');assert.ok(result.images>14);
  for(const k of [0,9,13]){
   await page.evaluate(async k=>{const h=document.querySelector('#restored-slide');h.innerHTML=window.__verticalRestored[k];await Promise.all([...h.querySelectorAll('img')].map(im=>im.complete?null:new Promise(resolve=>{im.onload=im.onerror=resolve;})));},k);
   await page.screenshot({path:path.join(out,'restored',s.id+'-'+(k+1)+'.png'),clip:{x:0,y:0,width:1280,height:720}});
  }
  report.roundtrips.push({id:s.id,...result});console.log('Visual roundtrip',s.id,result.images,'images');
 }
 assert.deepEqual(report.errors,[]);await fs.writeFile(path.join(out,'ui-verification.json'),JSON.stringify(report,null,2));
 console.log('PASS',report.searched.length,'UI searches, independent saved edits,',report.roundtrips.length,'visual PPTX roundtrips');
}finally{if(browser)await browser.close();await server.close();}
