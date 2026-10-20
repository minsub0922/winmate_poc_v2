import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {chromium} from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(new URL('../..',import.meta.url).pathname),base=path.join(root,'proddb/reviews/specs-20261020'),alternate=process.argv.includes('--current-paths'),out=path.join(base,alternate?'manufacturer-current-pages':'manufacturer-pages');fs.mkdirSync(out,{recursive:true});
const sources=JSON.parse(fs.readFileSync(path.join(base,'manufacturer-sources.json'),'utf8')).map(s=>alternate?{...s,url:s.url.replace('/en-US/','/en/')}:s);
const browser=await chromium.launch({headless:true});
try{let next=0;await Promise.all(Array.from({length:3},async()=>{const page=await browser.newPage();while(next<sources.length){const source=sources[next++],file=path.join(out,source.id+'.json');if(fs.existsSync(file))continue;let result;
 try{const response=await page.goto(source.url,{waitUntil:'domcontentloaded',timeout:30000});const html=await page.content(),data=await page.evaluate(()=>{
  const clean=el=>el?.textContent.replace(/\s+/g,' ').trim()||'';
  const tables=[...document.querySelectorAll('table')].map(table=>({context:clean(table.closest('section,article,.tab-pane,.specifications')?.querySelector('h1,h2,h3,h4')),classes:table.className,rows:[...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(clean))}));
  const dls=[...document.querySelectorAll('dl')].map(dl=>({context:clean(dl.parentElement.querySelector('h2,h3,h4')),rows:[...dl.querySelectorAll('dt')].map(dt=>[clean(dt),clean(dt.nextElementSibling)])}));
  return{title:document.title,heading:clean(document.querySelector('h1')),tables,dls,text:document.body.innerText,links:[...document.querySelectorAll('a[href]')].filter(a=>/spec|data.?sheet|pdf|manual/i.test(a.href+' '+a.textContent)).map(a=>({label:clean(a),url:a.href})).slice(0,40)};
 });fs.writeFileSync(path.join(out,source.id+'.html'),html);result={...source,...data,status:response?.status(),finalUrl:page.url(),sha256:crypto.createHash('sha256').update(html).digest('hex'),checkedAt:new Date().toISOString()};}
 catch(error){result={...source,status:0,error:error.message,checkedAt:new Date().toISOString()};}
 fs.writeFileSync(file,JSON.stringify(result,null,2));console.log(source.id,result.status,result.heading||result.title||'',result.tables?.map(t=>t.rows.length),result.dls?.map(d=>d.rows.length));await new Promise(r=>setTimeout(r,150));
 }await page.close();}));}finally{await browser.close();}
