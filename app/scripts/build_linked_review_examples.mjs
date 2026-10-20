// Author three paired proposal/review examples from real layouts and real model results.
// Explicit authoring command (uses configured model quota): node app/scripts/build_linked_review_examples.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const version=5;
const layoutRevision=1, tag=`v${version}-layouts${layoutRevision}`;
const work=path.join(root,'app/tests/output/linked-review-examples/'+tag);fs.mkdirSync(work,{recursive:true});
const sourceIds=['bs01','bs21','bs03'];
const read=n=>JSON.parse(fs.readFileSync(path.join(root,'app/data',n+'.json'),'utf8'));
const boot={catalog:read('catalog'),products:read('products_db'),images:read('images'),capabilities:null,user:{username:'example-author',auth_enabled:false}};
const vite=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
let browser;
try {
 await vite.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:900},colorScheme:'light'});
 await context.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/bootstrap'?boot:{items:[]}}));
 await context.route(url=>['/img/','/lib/','/fonts/'].some(p=>url.pathname.startsWith(p)),route=>{const u=new URL(route.request().url()),rel=decodeURIComponent(u.pathname).slice(1),p=path.join(root,u.pathname.startsWith('/fonts/')?'app/web/public':'app/data/static',rel);return fs.existsSync(p)?route.fulfill({path:p}):route.abort();});
 await context.route(url=>!['127.0.0.1','localhost'].includes(url.hostname),route=>route.abort());
 const page=await context.newPage();await page.goto('http://127.0.0.1:'+vite.httpServer.address().port);await page.locator('.app').waitFor();
 const examples=await page.evaluate(async ({ids,version,layoutRevision})=>{
  const {scenarioStoryboard}=await import('/src/domain/templates/scenario_storyboard.js');
  const {SC,STRATEGIES}=await import('/src/domain/templates/scenarios.js');
  const {deckOrder,layoutHtml}=await import('/src/services/catalog.js');
  const {applyOverrides}=await import('/src/domain/slides/Slide.jsx');
  const {retainHistoryLayouts}=await import('/src/domain/slides/context-policy.js');
  const {buildProfile,selectCriteria}=await import('/src/domain/review/analyze.js');
  const {reqText}=await import('/src/services/search.js');
  const {pocDoc}=await import('/src/repositories/reviews.js');
  const {default:improvements}=await import('/src/domain/review/example-improvements.json');
  const {reviewAppendixLayouts}=await import('/src/domain/review/example-layouts.js');
  const host=document.createElement('div');host.id='example-render';host.style.cssText='position:fixed;left:0;top:0;width:1280px;height:720px;background:white;z-index:10000;overflow:hidden';document.body.appendChild(host);
  const make=async (p,k)=>{const item=deckOrder(p)[k];host.innerHTML=layoutHtml(item.x.f);applyOverrides(host.firstElementChild,item.x.ov,k+1);await document.fonts.ready;return host.firstElementChild;};
  const out=[];
  for(const sid of ids){
   const p=structuredClone(scenarioStoryboard(sid)),sourceTitle=p.title,at=Date.now();
   p.id='review-example-'+sid+'-v'+version+'-layouts'+layoutRevision;p.title='[검토 예시] '+sourceTitle;p.createdAt=p.updatedAt=at;p.exportedAt=null;p.sample={source:'linked-review-proposal',version,layoutRevision,scenario:sid};
   const extra=improvements[sid];
   const sections=[['고객·판단',extra.goals],['당사 실행·운영',extra.delivery],['투자 판단용 가정',extra.finance],['근거·고지·검증 범위',[
    ['가상 고객·시장 자료','본문의 고객 인터뷰·시장 추정·고객 수치는 학습용 시나리오 가정입니다. 실제 조사·공식 통계·실증 실적으로 사용할 수 없습니다.'],
    ['제품·사례 참고 자료','출처: 앱 제품 DB·Best Scenario 로컬본(2026.10.20). 본문 공식 자료·사례의 링크와 시점·사양은 실제 제출 전 재확인이 필요합니다.'],
    ['목표와 검증 방법','목표는 보장 실적이 아닙니다. '+extra.scope+'의 도입 전 기준선을 기록하고 4주 후 같은 범위·기간의 운영 로그와 비교합니다.'],
    ['공개·계약 조건','가상 고객 자료를 사용하며 개인정보·내부 원가를 포함하지 않습니다. 가격·일정·지원 범위는 설명용 가정이며 계약·현장 실사 후 확정합니다.']
   ]]];
   const appendices=reviewAppendixLayouts(p,sections);
   sections.forEach(([label,cards],i)=>p.parts.push({type:'appendix',name:label,goal:label,items:cards.map(c=>c[0]),form:'list',text:'',done:true,layouts:[appendices[i]]}));
   const fs=p.parts.flatMap(s=>s.layouts.map(x=>x.f));if(new Set(fs).size!==fs.length)throw Error('Repeated automatic example layout: '+sid);
   const toc=p.parts.flatMap(s=>s.layouts).find(x=>x.f==='L_C10');if(toc?.ov?.t)toc.ov.t['2']=String(toc.ov.t['2']||'목차')+' · 검토 부록 4장 별첨';
   let uid=0;p.parts.forEach((part,i)=>{part.id=p.id+'-part-'+i;part.layouts.forEach(x=>x.uid=p.id+'-slide-'+uid++);});
   p.req.form.keymen.forEach((k,i)=>k.id=p.id+'-keyman-'+i);retainHistoryLayouts(p);
   const units=[],fonts={},colors={};
   for(const [i,{x,s}]of deckOrder(p).entries()){
    const element=await make(p,i),bounds=element.getBoundingClientRect();
    const boxes=[...element.querySelectorAll('[data-tb],[data-img]')].map((el,j)=>{const r=el.getBoundingClientRect(),style=getComputedStyle(el),text=el.hasAttribute('data-tb')?el.innerText:'';const font=style.fontFamily;fonts[font]=(fonts[font]||0)+1;colors[style.color]=(colors[style.color]||0)+1;const size=parseFloat(style.fontSize)*.75;return {kind:el.hasAttribute('data-tb')?'text':'pic',text,font,name:el.getAttribute('data-label')||'element '+j,x:(r.left-bounds.left)/1280,y:(r.top-bounds.top)/720,w:r.width/1280,h:r.height/720,min:size,max:size,chars:text.length};});
    const text=element.innerText,title=[...boxes].filter(b=>b.kind==='text'&&b.text&&b.y<.4).sort((a,b)=>b.max-a.max)[0]?.text||s.name;
    units.push({n:i+1,title:title.slice(0,160),text,words:text.trim().split(/\s+/).length,chars:text.replace(/\s/g,'').length,boxes,notes:'',hidden:false,pageNum:true,footer:'',minFont:Math.min(...boxes.filter(b=>b.kind==='text'&&b.text).map(b=>b.min)),fonts:[...new Set(boxes.filter(b=>b.kind==='text').map(b=>b.font))],colors:[],nPic:element.querySelectorAll('img,[data-img]').length,nTable:element.querySelectorAll('table').length,nChart:element.querySelectorAll('svg').length,part:s.type,f:x.f,uid:x.uid});
   }
   const chosen=[1,units.slice().sort((a,b)=>b.words-a.words)[0].n,units.length-1,units.length].filter(Boolean);
   const pages=[...new Set(chosen)];for(const u of units)if(pages.length<4&&!pages.includes(u.n))pages.push(u.n);
   const doc={kind:'pptx',unitLabel:'장',slides:true,aspect:16/9,slideWpt:960,units,meta:{title:p.title,fonts,colors},files:[],images:pages.map(n=>({n})),source:{type:'proposal',id:p.id}};
   const reqList=p.req.form.keymen.flatMap(k=>k.reqs.map(r=>r.map(s=>s.t||'').join(''))).filter(Boolean);
   const settings={customer:p.customer,ind:p.ind,linkedId:p.id,previewProposalId:p.id,linkedTitle:p.title,reqText:reqText(p),reqList};
   const profile=buildProfile(doc,settings),sel=selectCriteria(profile);
   const slim={kind:profile.kind,slides:true,units:units.length,unitLabel:'장',visual:true,customer:profile.customer,ind:profile.ind,indName:profile.indName,products:profile.prodHits.map(h=>({model:h.model,name:h.name,count:h.count})),unknownModels:profile.unknownModels,older:profile.older,solutions:profile.solutions,competitors:profile.competitors,figures:profile.figures,fontCount:profile.fontCount,fonts:profile.fonts,parts:profile.parts,linkedReq:true,geomCount:profile.geom.length};
   out.push({sid,sourceTitle,proposal:p,doc,settings,profile:slim,sel,geom:profile.geom.map(g=>({u:g.u,kind:g.kind,note:g.note})),strategy:STRATEGIES[SC[sid].strategy].label,pages,body:{kind:'review',budget:24,min_k:24,criteria:sel.filter(s=>s.applied).map(s=>s.id),doc:pocDoc(doc,doc.units),context:{title:p.title,customer:p.customer,ind:p.ind,ind_name:profile.indName,signals:reqList}}});
  }
  window.__reviewExamples=out;
  window.__renderReviewExample=async(index,n)=>{const e=out[index],element=await make(e.proposal,n-1);const {fillReady}=await import('/src/services/fill.js');const {loadBg}=await import('/src/services/packs.js');const ov=deckOrder(e.proposal)[n-1].x.ov;if(ov?.bg?.src){await loadBg(ov.bg.src);applyOverrides(element,ov,n);}await fillReady(element);await Promise.all([...element.querySelectorAll('img')].map(im=>im.complete?null:new Promise(resolve=>{im.onload=im.onerror=resolve;setTimeout(resolve,2500);})));await document.fonts.ready;};
  return out;
 },{ids:sourceIds,version,layoutRevision});
 for(const [index,e]of examples.entries()){
  for(let n=e.doc.units.length-3;n<=e.doc.units.length;n++){
   await page.evaluate(([i,n])=>window.__renderReviewExample(i,n),[index,n]);
   await page.locator('#example-render').screenshot({path:path.join(work,`${e.sid}-appendix-${n}.png`)});
  }
  e.body.images=[];for(const n of e.pages){await page.evaluate(([i,n])=>window.__renderReviewExample(i,n),[index,n]);const bytes=await page.locator('#example-render').screenshot({type:'jpeg',quality:82});const file=`${tag}-${e.sid}-${n}.jpg`;fs.writeFileSync(path.join(work,file),bytes);e.body.images.push({sheet:n,data_url:'data:image/jpeg;base64,'+bytes.toString('base64')});}
  console.log('Prepared',e.sid,e.proposal.customer,e.doc.units.length,'real layouts; visual pages',e.pages.join(','));
 }
 fs.writeFileSync(path.join(work,'inputs.json'),JSON.stringify(examples));
 if(!process.argv.includes('--prepare-only')){
 await new Promise((resolve,reject)=>{const p=spawn(path.join(root,'app/.venv/bin/python'),['-B',path.join(root,'app/scripts/evaluate_linked_review_examples.py'),path.join(work,'inputs.json'),path.join(work,'results.json')],{cwd:root,stdio:'inherit'});p.on('exit',code=>code===0?resolve():reject(new Error('Actual model evaluation failed: '+code)));p.on('error',reject);});
 const actual=JSON.parse(fs.readFileSync(path.join(work,'results.json'),'utf8'));
 // Model evaluation can outlive a web source update; package with freshly loaded versioned converters.
 await page.reload();await page.locator('.app').waitFor();
 const bundle=await page.evaluate(async({examples,actual,version,layoutRevision,tag})=>{
  const {trimPoc,reportFromServer,serverSummary}=await import('/src/repositories/reviews.js');
  return {version,layoutRevision,generatedAt:new Date().toISOString(),examples:examples.map((e,i)=>{
   const raw=actual[i];if(raw.evaluation.criteria_version!==version)throw Error('Mixed rubric versions');
   const trimmed=trimPoc(raw),map=e.doc.units.map(u=>u.n),report=reportFromServer(trimmed,e.sel,map,map.length);if(!report)throw Error('No real criterion scores');
   const at=Date.now(),review={id:'r_linked_example_'+e.sid+'_v'+version+'_layouts'+layoutRevision,criteriaVersion:version,createdAt:at,finishedAt:at,status:'done',stage:'done',step:'',groups:{},files:[],title:e.sourceTitle,settings:e.settings,units:e.doc.units.map(u=>({n:u.n,title:u.title,part:u.part,words:u.words,hidden:false,pics:u.nPic,minFont:u.minFont})),unitLabel:'장',kind:'pptx',profile:e.profile,geom:e.geom,...report,summary:serverSummary(trimmed,report.sel,report.results,report.agg),demo:true,ai:true,scoring:'server',strategy:e.strategy,poc:{status:'done',sheetMap:map,llm:raw.llm,result:trimmed},sample:{source:'linked-review-example',version,layoutRevision,proposalId:e.proposal.id,scenario:e.sid}};
   const doc={...e.doc,images:e.pages.map(n=>({n,src:`/assets/review-examples/${tag}-${e.sid}-${n}.jpg`}))};
   return {scenario:e.sid,proposal:e.proposal,review,doc};
  })};
 },{examples:examples.map(({body,...e})=>e),actual,version,layoutRevision,tag});
 const assets=path.join(root,'app/web/public/assets/review-examples');fs.mkdirSync(assets,{recursive:true});
 for(const e of examples)for(const n of e.pages){const file=`${tag}-${e.sid}-${n}.jpg`;fs.copyFileSync(path.join(work,file),path.join(assets,file));}
 const target=path.join(root,'app/web/src/domain/review/linked-review-examples.json'),tmp=target+'.tmp';fs.writeFileSync(tmp,JSON.stringify(bundle));fs.renameSync(tmp,target);
 console.log('Created',bundle.examples.length,'connected example pairs with actual model scores');
 }
}finally{await browser?.close();await vite.close();}
