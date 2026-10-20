import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {chromium} from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(new URL('../..',import.meta.url).pathname),out=path.join(root,'proddb/reviews/specs-20261020');
const raw=JSON.parse(fs.readFileSync(path.join(root,'proddb/raw/wkb_products.json'),'utf8'));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const browser=await chromium.launch({headless:true}),page=await browser.newPage();
for(const name of ['package-specs','search-specs'])fs.mkdirSync(path.join(out,name),{recursive:true});
try{
 await page.goto('https://www.samsung.com/sec/business/smart-signage/qmc-series/LH55QMCEBGCXKR/',{waitUntil:'domcontentloaded',timeout:60000});
 await page.evaluate(()=>{
  window.parseSpecs=html=>{const doc=new DOMParser().parseFromString(html,'text/html'),rows=[];for(const dl of doc.querySelectorAll('dl')){let group='';for(const ch of dl.children){if(ch.tagName==='DT')group=ch.textContent.replace(/\s+/g,' ').trim();else if(ch.tagName==='DD')for(const li of ch.querySelectorAll('li')){const a=li.querySelector('.spec-title'),v=li.querySelector('.spec-desc');if(a&&v)rows.push([group,a.textContent.replace(/\s+/g,' ').trim(),v.textContent.replace(/\s+/g,' ').trim()]);}}}return rows;};
  window.getSpec=async(goodsId,goodsTpCd='10',prefix='/sec/business/',goodsNm='')=>{const url=prefix+'xhr/goods/getGoodsSpecList',r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams({goodsId,goodsTpCd,goodsNm}),signal:AbortSignal.timeout(25000)}),html=await r.text();return{goodsId,goodsTpCd,status:r.status,url:new URL(url,location.origin).href,rows:window.parseSpecs(html),html};};
 });
 const packages=raw.cardOrder.filter(id=>raw.products[id].goodsTpCd==='20');
 for(const [index,id]of packages.entries()){
  const file=path.join(out,'package-specs',id+'.json');if(fs.existsSync(file))continue;
  let result;try{result=await page.evaluate(async id=>{
   const r=await fetch('/sec/business/xhr/goods/goodsSpec',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams({goodsId:id,goodsTpCd:'20'}),signal:AbortSignal.timeout(25000)}),html=await r.text(),doc=new DOMParser().parseFromString(html,'text/html');
   const parts=[...doc.querySelectorAll('a[name^="spec-tab"]')].map(a=>({id:a.dataset.cstrtGoodsId||a.getAttribute('data-cstrt-goods-id'),name:a.dataset.dispNm||a.getAttribute('data-disp-nm')||a.textContent.trim(),model:a.textContent.trim()}));
   const components=[];for(const part of parts)components.push({...part,...await window.getSpec(part.id,'20','/sec/business/',part.name)});
   return{parent:id,status:r.status,html,components};
  },id);}catch(error){result={parent:id,status:0,error:error.message,components:[]};}
  for(const [n,c]of result.components.entries()){if(c.html){c.sha256=hash(c.html);fs.writeFileSync(path.join(out,'package-specs',id+'-part'+n+'.html'),c.html);delete c.html;}}
  if(result.html){result.sha256=hash(result.html);fs.writeFileSync(path.join(out,'package-specs',id+'.html'),result.html);delete result.html;}
  fs.writeFileSync(file,JSON.stringify({...result,checkedAt:new Date().toISOString()},null,2));
  if(index%10===0)console.log('packages',index+1,packages.length);await new Promise(r=>setTimeout(r,180));
 }
 const inventory=JSON.parse(fs.readFileSync(path.join(out,'source-inventory.json'),'utf8')).products;
 const tasks=inventory.filter(p=>p.before_rows<4&&p.source!=='site').map(p=>({...p,query:p.model||p.name}));
 const template=JSON.parse(fs.readFileSync(path.join(out,'search-template.json'),'utf8'));
 let next=0,done=0;
 await Promise.all(Array.from({length:3},async()=>{while(next<tasks.length){const task=tasks[next++],file=path.join(out,'search-specs',task.id+'.json');if(fs.existsSync(file)){done++;continue;}
  let result;try{result=await page.evaluate(async({task,template})=>{
   const params=new URLSearchParams(template.request);params.set('keyword',task.query);params.set('requestCount','15');
   const response=await fetch(template.url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(25000)}),data=await response.json();
   const results=(data.searchResults||[]).filter(p=>p.type==='Product').map(p=>({id:p.id,name:p.name,model:p.modelCode,goodsId:p.goodsId,url:p.consumerUrl,usp:p.uspDesc,description:p.productDescription}));
   const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,''),key=norm(task.model);
   const matches=results.filter(p=>p.goodsId&&key.length>=5&&(norm(p.model)===key||norm(p.id)===key||norm(p.model).startsWith(key))).slice(0,3);
   const specs=[];for(const p of matches)specs.push({...p,...await window.getSpec(p.goodsId,'10','/sec/')});
   return{status:response.status,query:task.query,results,specs};
  },{task,template:{url:template.url,request:template.request}});}catch(error){result={status:0,query:task.query,error:error.message,results:[],specs:[]};}
  for(const [n,s]of result.specs.entries())if(s.html){s.sha256=hash(s.html);fs.writeFileSync(path.join(out,'search-specs',task.id+'-'+n+'.html'),s.html);delete s.html;}
  fs.writeFileSync(file,JSON.stringify({id:task.id,...result,checkedAt:new Date().toISOString()},null,2));if(++done%20===0)console.log('search',done,tasks.length);await new Promise(r=>setTimeout(r,180));
 }}));
 console.log('DONE');
}finally{await browser.close();}
