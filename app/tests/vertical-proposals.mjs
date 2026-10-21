// Content completeness, native rendering, saved-copy migration and editable PPTX.
// PROPOSAL_ONLY=smart_hotel PROPOSAL_EXPORT=1 node app/tests/vertical-proposals.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'output/rebuild-existing');
const require=createRequire(path.join(root,'app/web/package.json')),sharp=require('sharp'),JSZip=require('jszip');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const std=await read('app/web/src/domain/templates/description_standard_scenarios.json'),best=await read('app/web/src/domain/templates/vertical_scenarios.json');
const datasets={...std.fills,...best.fills},scenarios=[...std.scenarios,...best.scenarios];
const sha=createHash('sha256').update(JSON.stringify({std,best})).digest('hex');
const bootstrap={catalog:await read('app/data/catalog.json'),images:await read('app/data/images.json'),products:await read('app/data/products_db.json'),user:{username:'proposal-content-test',auth_enabled:false},capabilities:null};
await fs.mkdir(path.join(out,'slides'),{recursive:true});await fs.mkdir(path.join(out,'decks'),{recursive:true});
const server=await createServer({root:path.join(root,'app/web'),cacheDir:path.join(out,process.env.PROPOSAL_UI_ONLY?'ui-vite-cache':'vite-cache'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
let browser;const errors=[],rows=[],exports=[];
try{
 await server.listen();browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route(u=>u.pathname.startsWith('/api/'),r=>r.fulfill(new URL(r.request().url()).pathname==='/api/bootstrap'?{json:bootstrap}:{status:503,json:{detail:'No model calls in deterministic authoring verification'}}));
 await context.route(u=>u.pathname.startsWith('/img/')||u.pathname.startsWith('/lib/'),async r=>{
  const name=decodeURIComponent(new URL(r.request().url()).pathname),file=path.join(root,name.startsWith('/img/lib/')?'':'app/data/static',name);
  try{const range=r.request().headers().range;if(range){const bytes=await fs.readFile(file),m=/bytes=(\d+)-(\d+)/.exec(range);if(m){const a=+m[1],b=Math.min(+m[2],bytes.length-1);return r.fulfill({status:206,headers:{'Content-Type':'text/plain','Content-Range':`bytes ${a}-${b}/${bytes.length}`},body:bytes.subarray(a,b+1)});}}await r.fulfill({path:file});}catch{errors.push('Missing image '+name);await r.abort();}
 });
 const page=await context.newPage();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.locator('.home').waitFor();await page.evaluate(()=>document.fonts.ready);
 const contracts=await page.evaluate(async()=>{
  const cat=await import('/src/services/catalog.js'),{SCENARIOS,SC,STAGES}=await import('/src/domain/templates/scenarios.js'),{FILLS}=await import('/src/domain/templates/scenario_fills.js'),{STORY}=await import('/src/domain/templates/scenario_story.js'),{storyboardOf}=await import('/src/domain/templates/scenario_storyboard.js'),{setupFromScenario,buildProfile}=await import('/src/domain/simulation/profile.js');
  const owned=f=>/^L_DSTD_|^L_PH_VX_/.test(f),bad=[];if(Object.keys(cat.L).some(owned))bad.push('removed layouts in registry');
  const authored=SCENARIOS.filter(s=>/^bs_std_|^bs_v_/.test(s.id));
  for(const s of authored){const flat=s.flow.flatMap(g=>g.slides),fills=FILLS[s.id];if(flat.length!==fills.length)bad.push(s.id+':length');
   for(const g of s.flow)if(!STAGES[g.key])bad.push(s.id+':stage '+g.key);
   for(let k=0;k<flat.length;k++){const f=fills[k];if(f.f!==flat[k].f||owned(f.f)||!cat.L[f.f]||cat.L[f.f].retired)bad.push(s.id+':layout '+k);const dom=document.createElement('div');dom.innerHTML=cat.layoutHtml(f.f);const ts=[...dom.querySelectorAll('[data-tb]:not([data-img])')].map(x=>x.dataset.tb),is=[...dom.querySelectorAll('[data-img]')].map(x=>x.dataset.img);if(ts.length!==new Set(ts).size||is.length!==new Set(is).size)bad.push(s.id+':duplicate slots '+k);if(ts.some(i=>!String(f.t[i]??'').trim())||ts.length!==Object.keys(f.t).length)bad.push(s.id+':empty/missing text '+k);if(is.some(i=>!f.img[i]?.src)||is.length!==Object.keys(f.img).length)bad.push(s.id+':empty/missing image '+k);}
   for(const p of s.products)if(!cat.P[p])bad.push(s.id+':product '+p);for(const p of s.solutions)if(!cat.S[p])bad.push(s.id+':solution '+p);for(const p of s.cases)if(!cat.C[p])bad.push(s.id+':case '+p);
   const p=storyboardOf(s);cat.normalizeCovers(p,true);if(cat.deckOrder(p).length!==flat.length||p.parts.filter(x=>x.deck).flatMap(x=>x.layouts).length!==1)bad.push(s.id+':cover/reload order');
   if(STORY[s.id].keymen.reduce((n,x)=>n+x[1],0)!==100)bad.push(s.id+':weights');for(const level of [1,2,3])if(buildProfile(setupFromScenario(s.id),level).ask!==s.ask)bad.push(s.id+':simulation');
  }
  document.querySelector('.app').style.display='none';const host=document.createElement('div');host.id='proposal-render';host.style.cssText='position:absolute;left:0;top:0;width:1280px;height:720px;background:white';document.body.appendChild(host);
  return {authored:authored.length,allScenarios:SCENARIOS.length,allLayouts:cat.ALL_LAYOUTS.length,activeLayouts:cat.LAYOUTS.length,removedLayouts:0,bad};
 });console.log('CONTRACTS',JSON.stringify(contracts));assert.deepEqual(contracts.bad,[]);assert.equal(contracts.authored,60);assert.equal(contracts.allScenarios,82);
 const selected=process.env.PROPOSAL_UI_ONLY?[]:process.env.PROPOSAL_ONLY?scenarios.filter(s=>s.id.includes(process.env.PROPOSAL_ONLY)):scenarios;
 let rendered,refresh;
 if(process.env.PROPOSAL_REFRESH){const baseline=await read('output/rebuild-existing/render-baseline-data.json');refresh={fills:{...baseline.std.fills,...baseline.best.fills},report:await read('output/rebuild-existing/render-baseline-verification.json'),reused:0,updated:0};assert.equal(createHash('sha256').update(JSON.stringify(baseline)).digest('hex'),refresh.report.dataSha256,'cached inputs must match the baseline render');}
 if(process.env.PROPOSAL_EXPORT_ONLY){rendered=await read('output/rebuild-existing/verification.json');assert.equal(rendered.dataSha256,sha,'cached rendering must match the current filled content');rows.push(...rendered.rows);}
 for(const s of selected){const thumbs=[];if(!rendered)for(let k=0;k<datasets[s.id].length;k++){
  if(refresh&&JSON.stringify(refresh.fills[s.id][k])===JSON.stringify(datasets[s.id][k])){rows.push(refresh.report.rows.find(x=>x.id===s.id&&x.page===k+1));thumbs.push(await sharp(path.join(out,'slides',s.id+'-'+String(k+1).padStart(3,'0')+'.png')).resize(320,180).toBuffer());refresh.reused++;continue;}if(refresh)refresh.updated++;
  const result=await page.evaluate(async({id,k})=>{
   const {SC,slidesOfScenario}=await import('/src/domain/templates/scenarios.js'),{ovOf}=await import('/src/domain/templates/scenario_storyboard.js'),{layoutHtml,L}=await import('/src/services/catalog.js'),{applyOverrides}=await import('/src/domain/slides/Slide.jsx'),{fillReady}=await import('/src/services/fill.js');
   const f=slidesOfScenario(SC[id])[k].f,h=document.querySelector('#proposal-render');h.innerHTML=layoutHtml(f);const r=h.firstElementChild,ov=ovOf(id,k,f);applyOverrides(r,ov,k+1);await fillReady(r);await Promise.all([...r.querySelectorAll('img')].map(im=>im.decode().catch(()=>{})));await document.fonts.ready;
   const clipped=[],overflow=[],boxes=[];for(const el of r.querySelectorAll('[data-tb]')){if(!el.textContent.trim()||getComputedStyle(el).visibility==='hidden')continue;const cs=getComputedStyle(el);if(el.scrollWidth>el.clientWidth+4||el.scrollHeight>el.clientHeight+4){const item={i:el.dataset.tb,text:el.textContent,w:el.clientWidth,sw:el.scrollWidth,h:el.clientHeight,sh:el.scrollHeight};overflow.push(item);if((el.scrollWidth>el.clientWidth+4&&cs.overflowX!=='visible')||(el.scrollHeight>el.clientHeight+4&&cs.overflowY!=='visible'))clipped.push(item);}const range=document.createRange();range.selectNodeContents(el);const b=range.getBoundingClientRect();boxes.push({el,i:el.dataset.tb,x:b.x,y:b.y,w:b.width,h:b.height,text:el.textContent});}
   const overlaps=[];for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){const x=boxes[a],y=boxes[b];if(x.el.contains(y.el)||y.el.contains(x.el))continue;const w=Math.min(x.x+x.w,y.x+y.w)-Math.max(x.x,y.x),h=Math.min(x.y+x.h,y.y+y.h)-Math.max(x.y,y.y);if(w>10&&h>5&&w*h>Math.min(x.w*x.h,y.w*y.h)*.15)overlaps.push({a:x.i,b:y.i,textA:x.text,textB:y.text});}
   const text=Object.values(ov.t).map(v=>typeof v==='object'?v.html:v).join(' '),body=!['cover','closing'].includes(L[f].p),letters=(text.match(/[가-힣a-zA-Z]/g)||[]).length;
   return {f,clipped,overflow,overlaps,letters,thin:body&&letters<130,broken:[...r.querySelectorAll('img')].filter(im=>!im.complete||!im.naturalWidth).map(im=>im.alt),placeholders:!!text.match(/\[(?:00|N|모델명|고객사|제안 부서|담당자|이름)/)};
  },{id:s.id,k});rows.push({id:s.id,page:k+1,...result});const png=await page.screenshot({path:path.join(out,'slides',s.id+'-'+String(k+1).padStart(3,'0')+'.png'),clip:{x:0,y:0,width:1280,height:720}});thumbs.push(await sharp(png).resize(320,180).toBuffer());
 }
 if(!rendered){await sharp({create:{width:1920,height:Math.ceil(thumbs.length/6)*180,channels:3,background:'#e2e5ea'}}).composite(thumbs.map((input,i)=>({input,left:i%6*320,top:Math.floor(i/6)*180}))).png().toFile(path.join(out,s.id+'-contact.png'));console.log('RENDERED',s.id,datasets[s.id].length);}
 if(process.env.PROPOSAL_EXPORT==='1'){
  const result=await page.evaluate(async id=>{const {SC,slidesOfScenario}=await import('/src/domain/templates/scenarios.js'),{ovOf}=await import('/src/domain/templates/scenario_storyboard.js'),{exportPptx}=await import('/src/domain/slides/export-pptx.js'),{convertPptx}=await import('/src/domain/slides/import/pptx2html.js');const s=SC[id],slides=slidesOfScenario(s),blob=await exportPptx(slides.map((x,k)=>({f:x.f,ov:ovOf(id,k,x.f),part:x.stage.name})),{title:s.title});const bytes=new Uint8Array(await blob.arrayBuffer()),back=await convertPptx(bytes.buffer);let st='';for(let i=0;i<bytes.length;i+=32768)st+=String.fromCharCode(...bytes.subarray(i,i+32768));return {b64:btoa(st),restored:back.slides.length,warnings:back.warnings};},s.id);
  const bytes=Buffer.from(result.b64,'base64');await fs.writeFile(path.join(out,'decks',s.id+'.pptx'),bytes);const zip=await JSZip.loadAsync(bytes),slides=Object.keys(zip.files).filter(x=>/^ppt\/slides\/slide\d+\.xml$/.test(x));let texts=0,pictures=0;for(const file of slides){const xml=await zip.file(file).async('string');texts+=(xml.match(/<a:t>/g)||[]).length;pictures+=(xml.match(/<p:pic>/g)||[]).length;}exports.push({id:s.id,slides:slides.length,texts,pictures,restored:result.restored,warnings:result.warnings});assert.equal(result.restored,datasets[s.id].length);assert.deepEqual(result.warnings,[]);console.log('EXPORTED',s.id,slides.length);
 }
 }
 const report={dataSha256:sha,contracts,errors,rows,exports,...(refresh?{renderHistory:{baseline:refresh.report.dataSha256,reusedUnchangedInputs:refresh.reused,refreshed:refresh.updated}}:{}),counts:{decks:selected.length,pages:rows.length,clipped:rows.filter(x=>x.clipped.length).length,overlaps:rows.filter(x=>x.overlaps.length).length,broken:rows.filter(x=>x.broken.length).length,thin:rows.filter(x=>x.thin).length,placeholders:rows.filter(x=>x.placeholders).length}};
 if(process.env.PROPOSAL_UI_ONLY){
  const legacy=await read('app/tests/fixtures/legacy_vertical_proposal.json');
  const prior=await read('app/tests/fixtures/prior_visual_proposal.json');
  report.revisionRefresh=await page.evaluate(async old=>{
   const {migrateRemovedLayouts,isPriorDefaultProposal}=await import('/src/domain/templates/migrate_removed_layouts.js'),{normalizeCovers}=await import('/src/services/catalog.js'),{SC}=await import('/src/domain/templates/scenarios.js');let n=0;const mk={pid:()=> 'vp'+n++,kid:()=> 'vk'+n++,lid:()=> 'vl'+n++};normalizeCovers(old,true);const unchanged=structuredClone(old),edited=structuredClone(old),bubble=structuredClone(old),appearance=structuredClone(old);
   if(!isPriorDefaultProposal(unchanged)||!migrateRemovedLayouts(unchanged,mk))throw new Error('Previous unchanged scenario was not refreshed');
   if(unchanged.title!==old.title||unchanged.req.form.project!==old.req.form.project||unchanged.parts.flatMap(p=>p.layouts).length!==SC[old.scenario].flow.flatMap(g=>g.slides).length)throw new Error('Refresh changed customer details');
   edited.parts.find(p=>!p.deck).layouts[0].ov.t[1]='사용자가 고친 본문';bubble.parts.find(p=>!p.deck).items.push('사용자 추가 검토');appearance.parts[0].layouts[0].ov.bg={src:'img/ph/of-meeting.jpg'};
   for(const item of [edited,bubble,appearance]){const saved=JSON.stringify(item);if(migrateRemovedLayouts(item,mk)||JSON.stringify(item)!==saved)throw new Error('A customised proposal was overwritten');}
   return{unchangedCopiesUpdated:true,projectTitlePreserved:true,editedTextPreserved:true,bubbleEditsPreserved:true,customAppearancePreserved:true};
  },prior);
  report.migration=await page.evaluate(async ({old,ops})=>{
   const {SC}=await import('/src/domain/templates/scenarios.js'),{storyboardOf}=await import('/src/domain/templates/scenario_storyboard.js'),{migrateRemovedLayouts,migrateRemovedLayoutItem}=await import('/src/domain/templates/migrate_removed_layouts.js'),{default:data}=await import('/src/domain/templates/removed_layout_migrations.json'),{portableDocument}=await import('/src/services/sharing.js');
   const make=()=>{const p=storyboardOf(SC.bs_std_ai_apartment);p.id='legacy-edited';p.title='사용자가 정한 제안서 이름';p.parts=[{id:'old',type:'free',name:'이전 구성',layouts:old.map((x,k)=>{const{f,...ov}=structuredClone(x);return{uid:'old-'+k,f,ov,status:'done'};})}];return p;};
   let n=0;const mk={pid:()=> 'mp'+n++,kid:()=> 'mk'+n++,lid:()=> 'ml'+n++};const p=make();const before=JSON.stringify(p.parts);migrateRemovedLayouts(p,mk);if(p.parts.flatMap(p=>p.layouts).length!==SC.bs_std_ai_apartment.flow.flatMap(g=>g.slides).length)throw new Error('default saved deck not consolidated');if(p.title!=='사용자가 정한 제안서 이름')throw new Error('custom project title lost');
   const edited=make(),desc=data.removedPages[old[0].f];edited.parts[0].layouts[0].ov.t[desc.title]='사용자 표지 제목';const body=desc.body[0];if(body)edited.parts[0].layouts[0].ov.t[body]='사용자 추가 요구사항';edited.parts[0].layouts[0].ov.img['0']={src:'img/ph/of-meeting.jpg',name:'사용자 선택 사진',fit:'cover',keep:true};
   const untouched=structuredClone(edited);migrateRemovedLayouts(edited,mk);const active=JSON.stringify(edited.parts),portable=JSON.stringify(portableDocument(edited));if(!active.includes('사용자 표지 제목')||body&&!active.includes('사용자 추가 요구사항'))throw new Error('edited words lost');if(/L_DSTD_|L_PH_VX_/.test(active))throw new Error('removed layout survived');if(portable.includes('removedLayoutArchive'))throw new Error('private migration archive exposed to sharing');
   const partial={parts:[{layouts:[structuredClone(untouched.parts[0].layouts[0])]}]};migrateRemovedLayouts(partial,mk);if(/L_DSTD_|L_PH_VX_/.test(JSON.stringify(partial.parts)))throw new Error('partial proposal not migrated');
   const fav=migrateRemovedLayoutItem({f:old[0].f,ov:untouched.parts[0].layouts[0].ov,name:'찜한 장표'});if(/^L_DSTD_|^L_PH_VX_/.test(fav.f))throw new Error('favourite not migrated');
   const operations=storyboardOf(SC[ops.id]);operations.parts=[{id:'ops',layouts:ops.fills.map((x,k)=>{const {f,...ov}=structuredClone(x);return{uid:'ops-'+k,f,ov};})}];const opsCover=data.removedPages[ops.fills[0].f];operations.parts[0].layouts[0].ov.t[opsCover.title]='사용자 운영 제안 제목';migrateRemovedLayouts(operations,mk);const cover=operations.parts.flatMap(p=>p.layouts).find(x=>x.f==='L_C01');if(cover?.ov.t[3]!=='사용자 운영 제안 제목')throw new Error('operations cover title lost');
   localStorage.setItem('winmate.v2.proposals',JSON.stringify([untouched]));return{defaultConsolidated:true,customTitlePreserved:true,editedTextPreserved:true,customPhotoPreserved:active.includes('사용자 선택 사진'),archivePreserved:!!edited.removedLayoutArchive,privateArchiveExcluded:true,partialProposal:true,favourite:true,operationsCover:true};
  },{old:legacy.fills,ops:legacy.ops});
  await page.reload();await page.locator('.app').waitFor();report.reopened=await page.evaluate(async()=>{const {getProposal,sharedProposal}=await import('/src/repositories/proposals.js');const p=getProposal('legacy-edited');if(!p||p.title!=='사용자가 정한 제안서 이름'||p.parts.some(s=>s.layouts.some(x=>/^L_DSTD_|^L_PH_VX_/.test(x.f))))throw new Error('persistent migration failed');const old={...structuredClone(p),parts:structuredClone(p.removedLayoutArchive.parts)};delete old.removedLayoutArchive;const shared=sharedProposal({token:'legacy-read-only-test',sourceId:'legacy',document:old,isOwner:false,canEdit:false,permission:'read',revision:1});if(shared.parts.some(s=>s.layouts.some(x=>/^L_DSTD_|^L_PH_VX_/.test(x.f))))throw new Error('legacy shared snapshot not viewable');return {title:p.title,archive:!!p.removedLayoutArchive,pages:p.parts.flatMap(x=>x.layouts).length,readOnlySharedView:true};});
  await page.locator('.sb-bs').click();await page.locator('.bsl').first().waitFor();assert.equal(await page.locator('.bsl').count(),82);report.searches=[];
  for(const s of scenarios){await page.getByRole('textbox',{name:'시나리오 검색',exact:true}).fill(s.title);await page.getByRole('article',{name:s.title,exact:true}).waitFor();report.searches.push(s.id);}
  await page.screenshot({path:path.join(out,'scenario-list.png')});
 }
 await fs.writeFile(path.join(out,process.env.PROPOSAL_UI_ONLY?'ui-verification.json':process.env.PROPOSAL_ONLY?'verification-'+process.env.PROPOSAL_ONLY+'.json':'verification.json'),JSON.stringify(report,null,2));console.log('REPORT',JSON.stringify(report.counts));
 assert.deepEqual(errors,[]);for(const key of ['clipped','overlaps','broken','thin','placeholders'])assert.equal(report.counts[key],0,key);
}finally{if(browser)await browser.close();await server.close();}
