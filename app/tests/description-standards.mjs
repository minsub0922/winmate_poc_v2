// Description-to-standard contract, full native rendering and editable PPTX.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import zlib from 'node:zlib';
import {mergePptxSlides} from './fixtures/merge-pptx-slides.mjs';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'output/description-standards');
const req=createRequire(path.join(root,'app/web/package.json')),sharp=req('sharp'),JSZip=req('jszip');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const data=await read('app/web/src/domain/templates/description_standard_scenarios.json');
const htmlSha256=createHash('sha256').update(await fs.readFile(path.join(root,'app/data/description-standard-html.json.gz'))).digest('hex');
const graphicsSha256=createHash('sha256').update(await fs.readFile(path.join(root,'app/web/public/assets/description-standards/graphics/manifest.json'))).digest('hex');
const sourceMap=await read('output/description-standards/source-map.json');
let studioBaseline;
if(process.env.DESCRIPTION_STUDIO_ONLY){
 const old=await read('output/description-standards/studio-baseline/data.json');
 const oldHtml=JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(out,'studio-baseline/html.json.gz'))));
 const newHtml=JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(root,'app/data/description-standard-html.json.gz'))));
 studioBaseline=await read('output/description-standards/studio-baseline/verification.json');
 const changed=[];
 for(const s of data.scenarios)for(let k=0;k<data.fills[s.id].length;k++){
  const map=sourceMap.find(p=>p.key===s.sourceSpec&&p.page===k+1);
  if(['체험 스튜디오 초대','목차·현재 장 안내'].includes(map.role)){changed.push([s.id,k+1]);continue;}
  assert.deepEqual(data.fills[s.id][k],old.fills[s.id][k],s.id+' '+k+' changed outside the studio scope');
  assert.equal(newHtml[data.fills[s.id][k].f],oldHtml[old.fills[s.id][k].f],s.id+' '+k+' HTML changed outside the studio scope');
 }
 studioBaseline.studioChanges=changed;
 console.log('Unchanged rendering inputs verified:',studioBaseline.rows.length-changed.length,'pages; refreshing',changed.length,'studio pages');
}
const bootstrap={catalog:await read('app/data/catalog.json'),images:await read('app/data/images.json'),products:await read('app/data/products_db.json'),user:{username:'standard-description-test',auth_enabled:false},capabilities:null};
const server=await createServer({root:path.join(root,'app/web'),cacheDir:path.join(out,'vite-cache'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
await fs.mkdir(path.join(out,'slides'),{recursive:true});await fs.mkdir(path.join(out,'decks'),{recursive:true});
const rows=[],exports=[],errors=[];let browser;
try{
 await server.listen();browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:940}});
 await context.route(u=>u.pathname.startsWith('/api/'),r=>r.fulfill(new URL(r.request().url()).pathname==='/api/bootstrap'?{json:bootstrap}:{status:503,json:{detail:'No model calls during standard rendering'}}));
 await context.route(u=>u.pathname.startsWith('/img/')||u.pathname.startsWith('/lib/'),async r=>{
  const pathname=decodeURIComponent(new URL(r.request().url()).pathname);
  const file=path.join(root,pathname.startsWith('/img/lib/')?'':'app/data/static',pathname);
  try{const range=r.request().headers().range;if(range){const b=await fs.readFile(file),m=/bytes=(\d+)-(\d+)/.exec(range);if(m){const a=+m[1],z=Math.min(+m[2],b.length-1);return r.fulfill({status:206,headers:{'Content-Type':'text/plain','Content-Range':`bytes ${a}-${z}/${b.length}`},body:b.subarray(a,z+1)});}}await r.fulfill({path:file});}catch{errors.push('Missing asset '+file);await r.abort();}
 });
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.locator('.home').waitFor();await page.evaluate(()=>document.fonts.ready);
 const contracts=await page.evaluate(async()=>{
  const {SC,SCENARIOS}=await import('/src/domain/templates/scenarios.js'),{FILLS}=await import('/src/domain/templates/scenario_fills.js'),{STORY}=await import('/src/domain/templates/scenario_story.js');
  const {storyboardOf}=await import('/src/domain/templates/scenario_storyboard.js'),cat=await import('/src/services/catalog.js'),{setupFromScenario,buildProfile}=await import('/src/domain/simulation/profile.js');
  const standards=SCENARIOS.filter(s=>s.id.startsWith('bs_std_')),bad=[];
  for(const s of standards){
   if(!s.std||s.req!=='std'||!s.reconstruction)bad.push(s.id+':mode');
   const slides=s.flow.flatMap(g=>g.slides);if(slides.length!==FILLS[s.id].length)bad.push(s.id+':length');
   for(let k=0;k<slides.length;k++){
    const f=FILLS[s.id][k];if(f.f!==slides[k].f||!cat.layoutHtml(f.f)||cat.L[f.f].retired)bad.push(s.id+':layout:'+k);
    const dom=document.createElement('div');dom.innerHTML=cat.layoutHtml(f.f);const ts=[...dom.querySelectorAll('[data-tb]')].map(x=>x.dataset.tb),is=[...dom.querySelectorAll('[data-img]')].map(x=>x.dataset.img);
    if(ts.length!==new Set(ts).size||is.length!==new Set(is).size)bad.push(s.id+':duplicate:'+k);
    if(Object.keys(f.t).length!==ts.length||Object.keys(f.img).length!==is.length)bad.push(s.id+':slots:'+k);
   }
   for(const x of s.products)if(!cat.P[x])bad.push(s.id+':product:'+x);for(const x of s.solutions)if(!cat.S[x])bad.push(s.id+':solution:'+x);for(const x of s.cases)if(!cat.C[x])bad.push(s.id+':case:'+x);
   const sb=storyboardOf(s);if(cat.deckOrder(sb).length!==slides.length||!sb.parts[0].deck)bad.push(s.id+':order');
   cat.normalizeCovers(sb,true);
   if(sb.parts.filter(p=>p.deck).flatMap(p=>p.layouts).length!==1||sb.parts.filter(p=>!p.deck).length!==s.flow.length-1)bad.push(s.id+':body hidden by reload migration');
   if(STORY[s.id].keymen.reduce((a,x)=>a+x[1],0)!==100)bad.push(s.id+':weights');
   for(const level of [1,2,3])if(buildProfile(setupFromScenario(s.id),level).ask!==s.ask)bad.push(s.id+':simulation');
  }
  document.querySelector('.app').style.display='none';const host=document.createElement('div');host.id='description-render';host.style.cssText='position:absolute;left:0;top:0;width:1280px;height:720px;background:white';document.body.appendChild(host);
  return {standards:standards.length,slides:standards.reduce((n,s)=>n+FILLS[s.id].length,0),bad};
 });console.log('CONTRACTS',JSON.stringify(contracts));
 const selected=process.env.DESCRIPTION_UI_ONLY?[]:process.env.DESCRIPTION_ONLY?data.scenarios.filter(s=>s.id.includes(process.env.DESCRIPTION_ONLY)):data.scenarios;
 for(const s of selected){const thumbs=[];const deck=data.fills[s.id];
  for(let k=0;k<deck.length;k++){
   if(studioBaseline&&!['체험 스튜디오 초대','목차·현재 장 안내'].includes(sourceMap.find(p=>p.key===s.sourceSpec&&p.page===k+1).role)){
    rows.push(studioBaseline.rows.find(r=>r.id===s.id&&r.page===k+1));
    thumbs.push(await sharp(await fs.readFile(path.join(out,'slides',s.id+'-'+String(k+1).padStart(3,'0')+'.png'))).resize(320,180).png().toBuffer());
    continue;
   }
   const result=await page.evaluate(async({f,k})=>{
    const cat=await import('/src/services/catalog.js'),{applyOverrides}=await import('/src/domain/slides/Slide.jsx'),{fillReady}=await import('/src/services/fill.js'),{fitDescriptionText}=await import('/src/domain/slides/description-fit.js');
    const h=document.querySelector('#description-render');h.innerHTML=cat.layoutHtml(f.f);const r=h.firstElementChild;applyOverrides(r,f,k+1);await fillReady(r);
    await Promise.all([...r.querySelectorAll('img')].map(im=>im.complete?null:new Promise(resolve=>{im.onload=im.onerror=resolve;setTimeout(resolve,5000);})));await document.fonts.ready;fitDescriptionText(r);
    const clipping=[],small=[],visible=[];
    for(const el of r.querySelectorAll('[data-tb]')){
     if(getComputedStyle(el).visibility==='hidden'||!el.textContent.trim())continue;
     if(el.scrollWidth>el.clientWidth+2||el.scrollHeight>el.clientHeight+2)clipping.push({i:el.dataset.tb,text:el.textContent,w:el.clientWidth,sw:el.scrollWidth,h:el.clientHeight,sh:el.scrollHeight});
     const size=parseFloat(getComputedStyle(el).fontSize);if(size<6)small.push({i:el.dataset.tb,size,text:el.textContent});visible.push(el.textContent);
    }
    return {f:f.f,clipping,small,broken:[...r.querySelectorAll('img')].filter(im=>!im.complete||!im.naturalWidth).map(im=>im.alt),allText:r.textContent,visibleText:visible};
   },{f:deck[k],k});
   rows.push({id:s.id,page:k+1,...result});
   const png=await page.screenshot({clip:{x:0,y:0,width:1280,height:720}});await fs.writeFile(path.join(out,'slides',s.id+'-'+String(k+1).padStart(3,'0')+'.png'),png);thumbs.push(await sharp(png).resize(320,180).png().toBuffer());
  }
  await sharp({create:{width:1920,height:Math.ceil(thumbs.length/6)*180,channels:3,background:'#e6eaf0'}}).composite(thumbs.map((input,i)=>({input,left:i%6*320,top:Math.floor(i/6)*180}))).png().toFile(path.join(out,s.id+'-contact.png'));
  console.log('RENDERED',s.id,deck.length,'pages');
  if(['1','studio'].includes(process.env.DESCRIPTION_EXPORT)){
   const patchStudio=process.env.DESCRIPTION_EXPORT==='studio';
   const indices=patchStudio?sourceMap.filter(p=>p.key===s.sourceSpec&&['체험 스튜디오 초대','목차·현재 장 안내'].includes(p.role)).map(p=>p.page-1):deck.map((_,i)=>i);
   if(patchStudio&&!indices.length){exports.push(studioBaseline.exports.find(x=>x.id===s.id));continue;}
   let restored=await page.evaluate(async ({id,indices})=>{
    const {SC,slidesOfScenario}=await import('/src/domain/templates/scenarios.js'),{ovOf}=await import('/src/domain/templates/scenario_storyboard.js'),{exportPptx}=await import('/src/domain/slides/export-pptx.js'),{convertPptx}=await import('/src/domain/slides/import/pptx2html.js');
    const s=SC[id],slides=slidesOfScenario(s),blob=await exportPptx(indices.map(k=>({f:slides[k].f,ov:ovOf(id,k,slides[k].f),part:slides[k].stage.name})),{title:s.title}),buf=await blob.arrayBuffer(),back=await convertPptx(buf);
    let st='';const bytes=new Uint8Array(buf);for(let i=0;i<bytes.length;i+=32768)st+=String.fromCharCode(...bytes.subarray(i,i+32768));
    const urls=new Map([...back.images].map(([k,b])=>[k,URL.createObjectURL(b)]));window.__descriptionRestored=back.slides.map(s=>s.html.replace(/wmimg:([\w-]+)/g,(_,key)=>urls.get(key)||''));
    return {b64:btoa(st),count:back.slides.length,images:back.images.size,warnings:back.warnings};
   },{id:s.id,indices});
   let bytes=Buffer.from(restored.b64,'base64');
   if(patchStudio){
    bytes=await mergePptxSlides(await fs.readFile(path.join(out,'decks',s.id+'.pptx')),bytes,indices);
    restored=await page.evaluate(async b64=>{
     const {convertPptx}=await import('/src/domain/slides/import/pptx2html.js');const back=await convertPptx(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)).buffer);
     const urls=new Map([...back.images].map(([k,b])=>[k,URL.createObjectURL(b)]));window.__descriptionRestored=back.slides.map(s=>s.html.replace(/wmimg:([\w-]+)/g,(_,key)=>urls.get(key)||''));
     return {count:back.slides.length,images:back.images.size,warnings:back.warnings};
    },bytes.toString('base64'));
   }
   await fs.writeFile(path.join(out,'decks',s.id+'.pptx'),bytes);const zip=await JSZip.loadAsync(bytes),xmls=Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p));let texts=0,pics=0,tables=0;
   for(const f of xmls){const x=await zip.file(f).async('string');texts+=(x.match(/<a:t>/g)||[]).length;pics+=(x.match(/<p:pic>/g)||[]).length;tables+=(x.match(/<a:tbl>/g)||[]).length;}
   for(const k of patchStudio?indices:[...new Set([0,Math.min(5,deck.length-1),deck.length-1])]){
    await page.evaluate(async k=>{const h=document.querySelector('#description-render');h.innerHTML=window.__descriptionRestored[k];await Promise.all([...h.querySelectorAll('img')].map(im=>im.complete?null:new Promise(resolve=>{im.onload=im.onerror=resolve;})));},k);
    await page.screenshot({path:path.join(out,s.id+'-restored-'+(k+1)+'.png'),clip:{x:0,y:0,width:1280,height:720}});
   }
   exports.push({id:s.id,slides:xmls.length,restored:restored.count,texts,pics,tables,warnings:restored.warnings});console.log('EXPORTED',s.id,JSON.stringify(exports.at(-1)));
  }
 }
 const content=[];for(const s of selected){for(let k=0;k<data.fills[s.id].length;k++){
  const map=sourceMap.find(x=>x.key===s.sourceSpec&&x.page===k+1);const actual=rows.find(x=>x.id===s.id&&x.page===k+1).allText.replace(/\s/g,'');
  for(const value of map.sourceText)if(!actual.includes(value.replace(/\s/g,'')))content.push({id:s.id,page:k+1,text:value});
 }}
 const renderSha256=createHash('sha256').update(JSON.stringify({scenarios:data.scenarios.map(({id,title,flow})=>({id,title,flow})),fills:data.fills})).digest('hex');
 if(studioBaseline&&!exports.length)exports.push(...studioBaseline.exports);
 const report={dataSha256:createHash('sha256').update(JSON.stringify(data)).digest('hex'),renderSha256,htmlSha256,graphicsSha256,contracts,errors,rows,exports,missingSourceText:content,
  ...(studioBaseline?{verificationHistory:{baseline:studioBaseline.dataSha256,unchangedPages:studioBaseline.rows.length-studioBaseline.studioChanges.length,refreshedPages:studioBaseline.studioChanges.length,scope:'Invitation and TOC refresh; every other fill and layout HTML compared byte-for-byte'}}:{}),
  counts:{decks:selected.length,pages:rows.length,broken:rows.filter(r=>r.broken.length).length,clipping:rows.filter(r=>r.clipping.length).length,smallText:rows.filter(r=>r.small.length).length}};
 if(process.env.DESCRIPTION_UI_ONLY){
  await page.evaluate(()=>{document.querySelector('#description-render').remove();document.querySelector('.app').style.display='';});
  await page.locator('.sb-bs').click();await page.locator('.bsl').first().waitFor();assert.equal(await page.locator('.bsl').count(),82);
  report.ui=[];
  for(const s of data.scenarios){
   await page.getByRole('textbox',{name:'시나리오 검색',exact:true}).fill(s.title);
   const card=page.getByRole('article',{name:s.title,exact:true});await card.waitFor();await card.locator('.bsl-more').click();await page.locator('.modal.sbv').waitFor();
   assert.match(await page.locator('.modal.sbv').innerText(),new RegExp(data.fills[s.id].length+'\\s*장'));
   report.ui.push({id:s.id,pages:data.fills[s.id].length});
   await page.locator('.modal.sbv').getByRole('button',{name:'닫기',exact:true}).first().click();
  }
  report.clone=await page.evaluate(async()=>{
   const {activateScenario}=await import('/src/pages/ScenariosPage.jsx'),{SC}=await import('/src/domain/templates/scenarios.js'),store=await import('/src/repositories/proposals.js'),{FILLS}=await import('/src/domain/templates/scenario_fills.js');
   const sid='bs_std_ai_apartment',original=JSON.stringify(FILLS[sid]);activateScenario(SC[sid]);const a=store.getProposals()[0];activateScenario(SC[sid]);const b=store.getProposals()[0];
   store.update(a.id,p=>{p.title='표준 제안서 독립 편집 확인';p.parts[0].layouts[0].ov.t['0']='편집한 표지';});
   return {id:a.id,other:b.id,sourceUnchanged:JSON.stringify(FILLS[sid])===original,otherUnchanged:store.getProposal(b.id).parts[0].layouts[0].ov.t['0']!=='편집한 표지'};
  });assert.notEqual(report.clone.id,report.clone.other);assert.ok(report.clone.sourceUnchanged&&report.clone.otherUnchanged);
  await page.waitForTimeout(400);await page.reload();await page.locator('.app').waitFor();
  report.reopened=await page.evaluate(async id=>{const {getProposal}=await import('/src/repositories/proposals.js');const {SC}=await import('/src/domain/templates/scenarios.js');const p=getProposal(id);return {title:p.title,text:p.parts[0].layouts[0].ov.t['0'],pages:p.parts.reduce((n,x)=>n+x.layouts.length,0),bodyParts:p.parts.filter(x=>!x.deck).length,expectedBodyParts:SC[p.scenario].flow.length-1,coverPages:p.parts.filter(x=>x.deck).flatMap(x=>x.layouts).length};},report.clone.id);
  assert.equal(report.reopened.title,'표준 제안서 독립 편집 확인');assert.equal(report.reopened.text,'편집한 표지');assert.equal(report.reopened.pages,37);
  assert.equal(report.reopened.coverPages,1);assert.equal(report.reopened.bodyParts,report.reopened.expectedBodyParts);
 }
 const reportName=process.env.DESCRIPTION_UI_ONLY?'ui-verification.json':process.env.DESCRIPTION_ONLY?'verification-'+process.env.DESCRIPTION_ONLY+'.json':'verification.json';
 await fs.writeFile(path.join(out,reportName),JSON.stringify(report,null,2));console.log('REPORT',JSON.stringify(report.counts),'missing text',content.length);
 assert.deepEqual(contracts.bad,[]);assert.deepEqual(errors,[]);assert.equal(report.counts.broken,0);assert.equal(report.counts.clipping,0);assert.deepEqual(content,[]);
 for(const x of exports){assert.equal(x.slides,data.fills[x.id].length);assert.equal(x.restored,x.slides);assert.deepEqual(x.warnings,[]);assert.ok(x.texts>0&&x.pics>0);}
}finally{if(browser)await browser.close();await server.close();}
