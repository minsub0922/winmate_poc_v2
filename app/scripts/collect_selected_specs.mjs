// Explicit, reviewed matches only. Semantic search recommendations are not spec matches.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {chromium} from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(new URL('../..',import.meta.url).pathname),base=path.join(root,'proddb/reviews/specs-20261020');
const plan=JSON.parse(fs.readFileSync(path.join(base,'mapping-plan.json'),'utf8')),template=JSON.parse(fs.readFileSync(path.join(base,'search-template.json'),'utf8'));
fs.mkdirSync(path.join(base,'selected-specs'),{recursive:true});
const b=await chromium.launch({headless:true}),p=await b.newPage();
try{
 await p.goto('https://www.samsung.com/sec/business/smart-signage/qmc-series/LH55QMCEBGCXKR/',{waitUntil:'domcontentloaded',timeout:60000});
 for(const q of plan.extra_queries){
  const result=await p.evaluate(async({q,template})=>{const params=new URLSearchParams(template.request);params.set('keyword',q.query);const r=await fetch(template.url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(25000)}),j=await r.json();return{status:r.status,query:q.query,results:(j.searchResults||[]).filter(r=>r.type==='Product').map(r=>({id:r.id,model:r.modelCode,name:r.name,goodsId:r.goodsId,url:r.consumerUrl}))};},{q,template});
  fs.writeFileSync(path.join(base,'search-specs',q.id+'-extra.json'),JSON.stringify(result,null,2));
  const norm=s=>String(s||'').replace(/[^a-z0-9]/gi,'').toUpperCase();const models=result.results.filter(r=>norm(r.model).startsWith(norm(q.prefix))).map(r=>r.model).slice(0,3);
  if(models.length)plan.search_selections[q.id]={source:q.id+'-extra',models};
 }
 for(const[id,selection]of Object.entries(plan.search_selections)){
  const search=JSON.parse(fs.readFileSync(path.join(base,'search-specs',selection.source+'.json'),'utf8'));
  const candidates=search.results.filter(r=>selection.models.includes(r.model));
  const result={id,checkedAt:new Date().toISOString(),variants:[]};
  for(const candidate of candidates){const data=await p.evaluate(async c=>{
   const url='/sec/xhr/goods/getGoodsSpecList',r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams({goodsId:c.goodsId,goodsTpCd:'10'}),signal:AbortSignal.timeout(25000)}),html=await r.text(),doc=new DOMParser().parseFromString(html,'text/html'),rows=[];
   for(const dl of doc.querySelectorAll('dl')){let group='';for(const ch of dl.children){if(ch.tagName==='DT')group=ch.textContent.replace(/\s+/g,' ').trim();else if(ch.tagName==='DD')for(const li of ch.querySelectorAll('li')){const a=li.querySelector('.spec-title'),v=li.querySelector('.spec-desc');if(a&&v)rows.push([group,a.textContent.replace(/\s+/g,' ').trim(),v.textContent.replace(/\s+/g,' ').trim()]);}}}return{status:r.status,endpoint:new URL(url,location.origin).href,html,rows};
  },candidate);const {html,...rest}=data;const file=id+'-'+result.variants.length+'.html';fs.writeFileSync(path.join(base,'selected-specs',file),html);result.variants.push({...candidate,...rest,sha256:crypto.createHash('sha256').update(html).digest('hex'),evidence:file});}
  fs.writeFileSync(path.join(base,'selected-specs',id+'.json'),JSON.stringify(result,null,2));console.log(id,result.variants.map(v=>v.model+':'+v.rows.length).join(','));
 }
 fs.writeFileSync(path.join(base,'mapping-plan.json'),JSON.stringify(plan,null,2));
}finally{await b.close();}
