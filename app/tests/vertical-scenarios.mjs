// Whole-deck regression for the authored vertical scenarios. Isolated browser
// storage, real layout/override/export/import code, existing local image packs.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'app/web/package.json')), sharp=require('sharp'),JSZip=require('jszip');
const out=path.join(root,'output/vertical-scenarios'),cacheDir=path.join(out,'vite-cache');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const data=await read('app/web/src/domain/templates/vertical_scenarios.json');
const dataSha256=createHash('sha256').update(JSON.stringify(data)).digest('hex');
const bootstrap={catalog:await read('app/data/catalog.json'),images:await read('app/data/images.json'),products:await read('app/data/products_db.json'),user:{username:'vertical-test',auth_enabled:false},capabilities:null};
await fs.mkdir(path.join(out,'slides'),{recursive:true});await fs.mkdir(path.join(out,'decks'),{recursive:true});
const server=await createServer({root:path.join(root,'app/web'),cacheDir,configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',optimizeDeps:{include:['react','react-dom/client']},server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false,fs:{allow:[path.join(root,'app/web'),cacheDir]}}});
let browser;const errors=[],results=[],exports=[];
try{
 await server.listen();const base='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:940}});
 await context.route(u=>u.pathname.startsWith('/api/'),r=>r.fulfill(new URL(r.request().url()).pathname==='/api/bootstrap'?{json:bootstrap}:{status:503,json:{detail:'No API/model requests in content verification'}}));
 await context.route(u=>u.pathname.startsWith('/img/')||u.pathname.startsWith('/lib/'),async r=>{
   const pathname=decodeURIComponent(new URL(r.request().url()).pathname);
   const file=path.join(root,pathname.startsWith('/img/lib/')?'':'app/data/static',pathname);
   try{
    const range=r.request().headers()['range'];
    if(range){const b=await fs.readFile(file);const m=/bytes=(\d+)-(\d+)/.exec(range);if(m){const start=+m[1],end=Math.min(+m[2],b.length-1);return r.fulfill({status:206,headers:{'Content-Type':'text/plain','Content-Range':`bytes ${start}-${end}/${b.length}`,'Accept-Ranges':'bytes'},body:b.subarray(start,end+1)});}}
    await r.fulfill({path:file});
   }catch{errors.push('Missing asset '+file);await r.abort();}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
 await page.goto(base);await page.locator('.home').waitFor();await page.evaluate(()=>document.fonts.ready);
 const contracts=await page.evaluate(async()=>{
   const cat=await import('/src/services/catalog.js'),sc=await import('/src/domain/templates/scenarios.js');
   const fill=await import('/src/domain/templates/scenario_fills.js'),story=await import('/src/domain/templates/scenario_story.js');
   const sb=await import('/src/domain/templates/scenario_storyboard.js'),sim=await import('/src/domain/simulation/profile.js');
   const all=sc.SCENARIOS.filter(s=>s.id.startsWith('bs_v_')),bad=[];
   for(const s of all){
    if(s.std||s.req==='std')bad.push(s.id+':fictional deck marked standard');
    if(!sc.REQ_TYPES[s.req]||!sc.STRATEGIES[s.strategy]||!sc.ENDINGS[s.ending])bad.push(s.id+':enums');
    for(const p of s.products)if(!cat.P[p])bad.push(s.id+':product:'+p);
    for(const p of s.solutions)if(!cat.S[p])bad.push(s.id+':solution:'+p);
    for(const p of s.cases)if(!cat.C[p])bad.push(s.id+':case:'+p);
    const slides=sc.slidesOfScenario(s);if(slides.length!==fill.FILLS[s.id].length)bad.push(s.id+':length');
    for(let k=0;k<slides.length;k++){
     const x=slides[k],f=fill.FILLS[s.id][k];if(x.f!==f.f||!cat.L[x.f]||!cat.layoutHtml(x.f))bad.push(s.id+':layout:'+k);
     if(cat.L[x.f]?.retired)bad.push(s.id+':retired:'+x.f);
     const host=document.createElement('div');host.innerHTML=cat.layoutHtml(x.f);
     const tb=[...host.querySelectorAll('[data-tb]')].map(x=>x.dataset.tb),im=[...host.querySelectorAll('[data-img]')].map(x=>x.dataset.img);
     if(new Set(tb).size!==tb.length||new Set(im).size!==im.length)bad.push(s.id+':duplicate slots:'+k);
     if(Object.keys(f.t).some(i=>!tb.includes(i))||Object.keys(f.img).some(i=>!im.includes(i)))bad.push(s.id+':unknown slots:'+k);
     if(tb.some(i=>!(i in f.t))||im.some(i=>!(i in f.img)))bad.push(s.id+':unfilled slots:'+k);
    }
    const a=sb.storyboardOf(s),b=sb.storyboardOf(s);if(cat.deckOrder(a).length!==slides.length||!a.parts[0].deck)bad.push(s.id+':storyboard order');
    const originals=JSON.stringify(fill.FILLS[s.id]);a.parts[0].layouts[0].ov.t['1']='독립 복사 확인';
    if(JSON.stringify(fill.FILLS[s.id])!==originals||b.parts[0].layouts[0].ov.t['1']==='독립 복사 확인')bad.push(s.id+':shared overrides');
    // Restore a corrupt shared reference if this check exposed one, so remaining
    // verification reports the actual content rather than the test marker.
    Object.assign(fill.FILLS[s.id],JSON.parse(originals));
    if(story.STORY[s.id].keymen.reduce((n,x)=>n+x[1],0)!==100)bad.push(s.id+':weights');
    for(const level of [1,2,3]){const p=sim.buildProfile(sim.setupFromScenario(s.id),level);if(p.ask!==s.ask||!p.concerns.length)bad.push(s.id+':simulation:'+level);}
   }
   document.querySelector('.app').style.display='none';
   const host=document.createElement('div');host.id='vertical-render';host.style.cssText='position:absolute;left:0;top:0;width:1280px;height:720px;background:white;z-index:999999';document.body.appendChild(host);
   return {scenarios:all.length,slides:all.reduce((n,s)=>n+sc.slidesOfScenario(s).length,0),bad};
 });
 await fs.writeFile(path.join(out,'contracts.json'),JSON.stringify(contracts,null,2));console.log('Contracts',JSON.stringify(contracts));
 // Render every actual fill, even when a contract issue needs subsequent repair.
 const selected=process.env.VERTICAL_ONLY?data.scenarios.filter(s=>s.id.includes(process.env.VERTICAL_ONLY)):data.scenarios;
 for(const s of selected){
  const thumbs=[];
  for(let k=0;k<data.fills[s.id].length;k++){
   const fill=data.fills[s.id][k];
   const check=await page.evaluate(async({fill,k})=>{
    const cat=await import('/src/services/catalog.js'),sl=await import('/src/domain/slides/Slide.jsx');
    const {fillReady}=await import('/src/services/fill.js');const host=document.querySelector('#vertical-render');host.innerHTML=cat.layoutHtml(fill.f);
    const r=host.firstElementChild;sl.applyOverrides(r,fill,k+1);await fillReady(r);
    await Promise.all([...r.querySelectorAll('img')].map(im=>im.complete?null:new Promise(resolve=>{im.onload=im.onerror=resolve;setTimeout(resolve,6000);})));await document.fonts.ready;
    const rect=r.getBoundingClientRect(),overflow=[],clipped=[],bounds=[],boxes=[];
    for(const e of r.querySelectorAll('[data-tb]')){
     if(!e.textContent.trim())continue;const b=e.getBoundingClientRect(),i=e.dataset.tb;
     if(e.scrollWidth>e.clientWidth+4||e.scrollHeight>e.clientHeight+4){
      const item={i,text:e.textContent,w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight,sh:e.scrollHeight};overflow.push(item);
      const css=getComputedStyle(e);
      // Several existing number badges deliberately use an undersized line box
      // with visible overflow. Only clipping, overlap and slide bounds are fatal.
      if((e.scrollWidth>e.clientWidth+4&&css.overflowX!=='visible')||(e.scrollHeight>e.clientHeight+4&&css.overflowY!=='visible'))clipped.push(item);
     }
     if(b.left<rect.left-2||b.top<rect.top-2||b.right>rect.right+2||b.bottom>rect.bottom+2)bounds.push({i,text:e.textContent});
     const range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect();
     boxes.push({i,text:e.textContent,x:t.x,y:t.y,w:t.width,h:t.height});
    }
    const overlaps=[];
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
     const a=boxes[i],b=boxes[j],w=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),h=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
     if(w>10&&h>5&&w*h>Math.min(a.w*a.h,b.w*b.h)*.15)overlaps.push({a:a.i,b:b.i,textA:a.text,textB:b.text});
    }
    return {f:fill.f,overflow,clipped,bounds,overlaps,broken:[...r.querySelectorAll('img')].filter(im=>!im.complete||!im.naturalWidth).map(im=>im.alt),text:r.textContent};
   },{fill,k});
   const image=await page.screenshot({clip:{x:0,y:0,width:1280,height:720}});
   await fs.writeFile(path.join(out,'slides',s.id+'-'+String(k+1).padStart(2,'0')+'.png'),image);
   thumbs.push(await sharp(image).resize(480,270).png().toBuffer());
   results.push({id:s.id,page:k+1,...check});
  }
  const canvas=sharp({create:{width:1920,height:1080,channels:3,background:'#e3e7ee'}}).composite(thumbs.map((input,i)=>({input,left:(i%4)*480,top:Math.floor(i/4)*270})));
  await canvas.png().toFile(path.join(out,s.id+'-contact.png'));
  console.log('Rendered',s.id,'14 slides');
  if(process.env.VERTICAL_EXPORT==='1'){
   const exported=await page.evaluate(async id=>{
    const {SC,slidesOfScenario}=await import('/src/domain/templates/scenarios.js'),{ovOf}=await import('/src/domain/templates/scenario_storyboard.js');
    const {exportPptx}=await import('/src/domain/slides/export-pptx.js'),{convertPptx}=await import('/src/domain/slides/import/pptx2html.js');
    const s=SC[id],slides=slidesOfScenario(s),blob=await exportPptx(slides.map((x,k)=>({f:x.f,ov:ovOf(id,k,x.f),part:x.stage.name})),{title:s.title});
    const buffer=await blob.arrayBuffer(),back=await convertPptx(buffer);let str='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=32768)str+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return {b64:btoa(str),restored:back.slides?.length??back.layouts?.length??0,keys:Object.keys(back)};
   },s.id);
   const bytes=Buffer.from(exported.b64,'base64'),zip=await JSZip.loadAsync(bytes),files=Object.keys(zip.files),xmls=files.filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f));
   let texts=0,pictures=0;for(const f of xmls){const x=await zip.file(f).async('string');texts+=(x.match(/<a:t>/g)||[]).length;pictures+=(x.match(/<p:pic>/g)||[]).length;}
   await fs.writeFile(path.join(out,'decks',s.id+'.pptx'),bytes);exports.push({id:s.id,slides:xmls.length,texts,pictures,restored:exported.restored,restoreKeys:exported.keys});
   console.log('Exported',s.id,JSON.stringify(exports.at(-1)));
  }
 }
 const report={dataSha256,contracts,errors,slides:results,exports,counts:{scenarios:selected.length,slides:results.length,overflow:results.filter(x=>x.overflow.length).length,clipped:results.filter(x=>x.clipped.length).length,bounds:results.filter(x=>x.bounds.length).length,overlaps:results.filter(x=>x.overlaps.length).length,broken:results.filter(x=>x.broken.length).length}};
 const reportName=process.env.VERTICAL_ONLY?'verification-'+process.env.VERTICAL_ONLY+'.json':'verification.json';
 await fs.writeFile(path.join(out,reportName),JSON.stringify(report,null,2));console.log('REPORT',JSON.stringify(report.counts));
 assert.deepEqual(errors,[]);assert.deepEqual(contracts.bad,[]);assert.equal(report.counts.broken,0);assert.equal(report.counts.clipped,0);assert.equal(report.counts.bounds,0);assert.equal(report.counts.overlaps,0);
 for(const e of exports){assert.equal(e.slides,14);assert.equal(e.restored,14);assert.ok(e.texts>70&&e.pictures>14);}
}finally{if(browser)await browser.close();await server.close();}
