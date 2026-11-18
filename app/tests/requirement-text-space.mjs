// The requirement editor and the no-break space.
// A contentEditable keeps a space next to a tag chip or at the end of a line as U+00A0. That is an editing artifact, not something the
// author typed, but it was saved into the requirement text — and a summary quote copied with an ordinary space then no longer matched the
// original (app/api/poc/adapters/requirements.py), so a faithful quote was rejected. What the editor reads back holds ordinary spaces.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const json=name=>JSON.parse(fs.readFileSync(path.join(root,'app/data',name+'.json'),'utf8'));
const boot={catalog:json('catalog'),products:json('products_db'),images:json('images'),capabilities:null,user:{username:'requirement-space-test',auth_enabled:false}};
const details=JSON.parse(fs.readFileSync(path.join(root,'reference/live/img/prod/d00.json'),'utf8'));
const out=path.join(root,'app/tests/output/requirement-text-space');fs.mkdirSync(out,{recursive:true});
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
const results=[],errors=[];let browser,page;
const pass=name=>{results.push(name);console.log('PASS '+name);};
try{
 await server.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1200,height:800}});
 await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/bootstrap')return route.fulfill({json:boot});
  return route.fulfill({status:503,json:{code:'test_no_api'}});
 });
 await context.route(url=>!['127.0.0.1','localhost'].includes(url.hostname),route=>route.abort());
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.waitForFunction(()=>document.querySelector('.app')&&!document.querySelector('.boot'));
 const read=await page.evaluate(async()=>{
  const {readSegs}=await import('/src/components/common.jsx');
  if(typeof readSegs!=='function')return {missing:true};
  const text=s=>document.createTextNode(s);
  const chip=document.createElement('span');chip.dataset.ref='solution:magicinfo';chip.contentEditable='false';chip.textContent='@MagicINFO';
  // what the editor holds after "… 운영은 @MagicINFO FO를 통해 …" was written: the space after the chip and the one at the line end are U+00A0
  const el=document.createElement('div');el.append(text('MagicIN 운영은 '),chip,text(' FO를 통해 관리한다. '),document.createElement('br'),text('둘째 줄  끝'));
  // a table cell is its own editable box and keeps its spaces the same way
  const box=document.createElement('div');box.dataset.table='1';box.innerHTML='<table><tbody><tr><th>구분</th><th>수량</th></tr><tr><td></td><td>2대</td></tr></tbody></table>';
  box.querySelector('td').append(text('메뉴 보드 '));el.append(box);
  return {segs:readSegs(el)};
 });
 assert.notEqual(read.missing,true,'the editor reader can be called (readSegs)');
 const all=JSON.stringify(read.segs);
 assert.equal(all.includes(' '),false,'no U+00A0 is read back from the editor: '+all);
 assert.deepEqual(read.segs.slice(0,3),[{t:'MagicIN 운영은 '},{ref:'solution:magicinfo'},{t:' FO를 통해 관리한다. \n둘째 줄  끝'}]);
 assert.ok(read.segs[3].table&&read.segs[3].t.includes('| 메뉴 보드  | 2대 |')||read.segs[3].t.includes('| 메뉴 보드 | 2대 |'),'table cells are read with ordinary spaces too: '+JSON.stringify(read.segs[3]));
 pass('The requirement editor reads tag-side and line-end spaces as ordinary spaces — text and table cells alike');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:results,pageErrors:errors},null,2));
 console.log('ALL PASS ('+results.length+')');
}catch(error){console.error('Page errors:',errors);throw error;}
finally{await browser?.close();await server.close();}
