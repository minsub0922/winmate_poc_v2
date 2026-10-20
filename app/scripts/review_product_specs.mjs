// Read-only official Samsung spec collection. Writes review evidence, never active data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(new URL('../..',import.meta.url).pathname);
const out=path.resolve(process.argv[2]||path.join(root,'proddb/reviews/specs-20261020'));
const raw=JSON.parse(fs.readFileSync(path.join(root,'proddb/raw/wkb_products.json'),'utf8'));
fs.mkdirSync(path.join(out,'live-specs'),{recursive:true});
fs.mkdirSync(path.join(out,'live-pdp'),{recursive:true});
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const log=text=>{console.log(new Date().toISOString()+' '+text);fs.appendFileSync(path.join(out,'collection.log'),new Date().toISOString()+' '+text+'\n');};
const tasks=[...new Set([...raw.cardOrder,...Object.keys(raw.variants)])].map(id=>{
 const card=raw.products[id]||raw.products[raw.variants[id]?.parentGoodsId]||{};
 return {id,model:raw.products[id]?.mdlCode||raw.variants[id]?.mdlCode,parent:raw.variants[id]?.parentGoodsId||id,type:card.goodsTpCd||'10'};
});
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
try{
 const response=await page.goto('https://www.samsung.com/sec/business/smart-signage/qmc-series/LH55QMCEBGCXKR/',{waitUntil:'domcontentloaded',timeout:60000});
 if(!response.ok())throw Error('Public Samsung page unavailable: '+response.status());
 let done=0,next=0;const started=Date.now();
 await Promise.all(Array.from({length:3},async()=>{
  while(next<tasks.length){const task=tasks[next++],file=path.join(out,'live-specs',task.id+'.json');
   if(fs.existsSync(file)){done++;continue;}
   let result;
   try{result=await page.evaluate(async task=>{
    const url='/sec/business/xhr/goods/getGoodsSpecList';const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','X-Requested-With':'XMLHttpRequest'},body:new URLSearchParams({goodsId:task.id,goodsTpCd:task.type}),signal:AbortSignal.timeout(25000)});
    const html=await response.text(),doc=new DOMParser().parseFromString(html,'text/html'),rows=[];
    for(const dl of doc.querySelectorAll('dl')){let group='';for(const child of dl.children){if(child.tagName==='DT')group=child.textContent.trim();else if(child.tagName==='DD')for(const li of child.querySelectorAll('li')){const name=li.querySelector('.spec-title'),value=li.querySelector('.spec-desc');if(name&&value)rows.push([group,name.textContent.replace(/\s+/g,' ').trim(),value.textContent.replace(/\s+/g,' ').trim()]);}}}
    return {status:response.status,source:new URL(url,location.origin).href,rows,html};
   },task);}catch(error){result={status:0,rows:[],error:error.message};}
   const {html,...data}=result;
   fs.writeFileSync(file,JSON.stringify({...task,...data,checkedAt:new Date().toISOString(),sha256:html?hash(html):null},null,2));
   if(html)fs.writeFileSync(path.join(out,'live-specs',task.id+'.html'),html);
   if(++done%50===0)log('specs '+done+'/'+tasks.length+' elapsed='+Math.round((Date.now()-started)/1000)+'s');
   await new Promise(resolve=>setTimeout(resolve,180));
  }
 }));
 log('spec API complete '+done+'/'+tasks.length);
 const missing=tasks.filter(task=>raw.products[task.id]&&JSON.parse(fs.readFileSync(path.join(out,'live-specs',task.id+'.json'),'utf8')).rows.length===0);
 for(let i=0;i<missing.length;i++){
  const task=missing[i],card=raw.products[task.id],file=path.join(out,'live-pdp',task.id+'.json');if(fs.existsSync(file))continue;
  const url=new URL(card.goodsDetailUrl,'https://www.samsung.com/sec/business/').href;
  let result;
  try{result=await page.evaluate(async url=>{
   const response=await fetch(url,{signal:AbortSignal.timeout(25000)}),html=await response.text(),doc=new DOMParser().parseFromString(html,'text/html');
   doc.querySelectorAll('script,style,noscript,header,footer,.mo-ver,.blind').forEach(el=>el.remove());
   const main=doc.querySelector('.itm-component')||doc.querySelector('main')||doc.body;
   const clean=el=>el?.textContent.replace(/\s+/g,' ').trim()||'';
   return {status:response.status,url:response.url,html,title:clean(doc.querySelector('title')),text:clean(main),tables:[...main.querySelectorAll('table')].map(table=>[...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(clean))),blocks:[...main.querySelectorAll('.wrap-component')].map(el=>({type:el.className,title:clean(el.querySelector('h2,h3,.title')),text:clean(el)})),links:[...main.querySelectorAll('a[href]')].map(a=>({text:clean(a),href:a.getAttribute('href')})).filter(a=>a.text||a.href.includes('/business/'))};
  },url);}catch(error){result={status:0,url,error:error.message};}
  const {html,...data}=result;fs.writeFileSync(file,JSON.stringify({...task,...data,checkedAt:new Date().toISOString(),sha256:html?hash(html):null},null,2));if(html)fs.writeFileSync(path.join(out,'live-pdp',task.id+'.html'),html);
  if(i%10===0)log('missing PDP '+(i+1)+'/'+missing.length);await new Promise(resolve=>setTimeout(resolve,200));
 }
 log('DONE');
}finally{await browser.close();}
