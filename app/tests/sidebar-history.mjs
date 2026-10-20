// Real sidebar/store/clipboard behavior; sharing HTTP is controlled, no model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'app/data',name+'.json'),'utf8'));
const boot={catalog:read('catalog'),products:read('products_db'),images:read('images'),capabilities:null,user:{username:'history-menu-test',auth_enabled:false}};
const titles=['최근 제안서 · 전국 매장 디지털 메뉴보드 운영 개선','고정할 제안서 · 호텔 AI 스테이','이전 제안서 · 스마트 캠퍼스'];
const documents=titles.map((title,i)=>({id:'history-'+i,title,customer:'검증 고객',ind:'HT',stage:'req',createdAt:Date.now()-1000*(i+1),updatedAt:Date.now()-1000*(i+1),
 reqTab:'form',req:{free:[{t:'저장된 고객 요구사항 '+i}],form:{project:'검증',customer:'검증 고객',keymen:[],note:''},files:[]},ctx:{products:[],solutions:[],cases:[]},parts:[]}));
const out=path.join(root,'app/tests/output/sidebar-history');fs.mkdirSync(out,{recursive:true});
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:0,strictPort:false,hmr:false}});
const checks=[],errors=[],snapshots=new Map();let browser,page,modelCalls=0,failNextShare=false;
const pass=message=>{checks.push(message);console.log('PASS '+message);};
try{
 await server.listen();browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1500,height:950},permissions:['clipboard-read','clipboard-write']});
 await context.addInitScript(documents=>{if(!localStorage.getItem('winmate.v2.proposals')){localStorage.setItem('winmate.v2.proposals',JSON.stringify(documents));localStorage.setItem('winmate.v2.ui',JSON.stringify({route:{name:'home'}}));}},documents);
 await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
  const url=new URL(route.request().url()),method=route.request().method();
  if(url.pathname==='/api/bootstrap')return route.fulfill({json:boot});
  if(url.pathname==='/api/llm'){modelCalls++;return route.fulfill({status:503,json:{code:'test_no_model'}});}
  if(url.pathname==='/api/storyboards'&&method==='POST'){
   if(failNextShare){failNextShare=false;return route.fulfill({status:503,json:{detail:'공유 연결 테스트 오류'}});}
   const body=route.request().postDataJSON(),token=('sidebar-test-'+body.source).padEnd(43,'x');
   const snapshot={token,sourceId:body.source,document:body.document,isOwner:true,canEdit:true,hasEdited:false,permission:'view',revision:1};snapshots.set(token,snapshot);return route.fulfill({json:snapshot});
  }
  if(url.pathname.startsWith('/api/storyboards/')){
   const token=url.pathname.split('/')[3],snapshot=snapshots.get(token);if(!snapshot)return route.fulfill({status:404,json:{detail:'찾을 수 없음'}});
   if(url.pathname.endsWith('/permission')){snapshot.permission=route.request().postDataJSON().permission;snapshot.revision++;}
   return route.fulfill({json:snapshot});
  }
  return route.fulfill({status:503,json:{code:'test_no_api'}});
 });
 await context.route('**/img/**',route=>{const rel=decodeURIComponent(new URL(route.request().url()).pathname).slice(1),file=path.join(root,rel.startsWith('img/lib/')?rel:'app/data/static/'+rel);return fs.existsSync(file)?route.fulfill({path:file}):route.abort();});
 page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port);await page.locator('.home').waitFor();
 await page.evaluate(async()=>{window.__historyMenuRepo=await import('/src/repositories/proposals.js');});
 const row=id=>page.locator(`[data-proposal-id="${id}"]`),order=()=>page.locator('.sb-history-row').evaluateAll(rows=>rows.map(row=>row.dataset.proposalId));
 const menu=()=>page.getByRole('menu'),share=()=>page.getByRole('dialog',{name:'Storyboard 공유',exact:true});
 const more=async id=>{await page.locator('.sidebar').hover({position:{x:20,y:20}});await row(id).hover();await row(id).getByRole('button',{name:/더보기$/}).click();await menu().waitFor();};
 await page.locator('.sidebar').hover({position:{x:20,y:20}});
 await page.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().width>200);
 assert.equal(await row('history-0').locator('.sb-history-more').evaluate(el=>getComputedStyle(el).opacity),'0');
 assert.equal(await page.getByRole('separator',{name:'고정된 제안서 구분'}).count(),0);
 const before=await row('history-1').boundingBox();await row('history-1').hover();const after=await row('history-1').boundingBox();assert.deepEqual(after,before);
 assert.equal(await row('history-1').locator('.sb-history-more').evaluate(el=>getComputedStyle(el).opacity),'1');
 await row('history-1').getByRole('button',{name:/더보기$/}).click();assert.deepEqual(await menu().getByRole('menuitem').allTextContents(),['삭제','고정','공유']);
 assert.equal(await page.locator('.home').isVisible(),true);await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'고정');
 await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'공유');await page.keyboard.press('Escape');assert.equal(await menu().count(),0);
 assert.ok(await row('history-1').locator('.sb-history-more').evaluate(el=>el===document.activeElement));
 pass('Hover overlays the more button without moving content; its menu supports keyboard navigation and never opens the proposal');
 await more('history-2');await menu().getByRole('menuitem',{name:'고정',exact:true}).click();
 await more('history-1');await menu().getByRole('menuitem',{name:'고정',exact:true}).click();assert.deepEqual(await order(),['history-1','history-2','history-0']);
 const divider=()=>page.getByRole('separator',{name:'고정된 제안서 구분'});
 assert.equal(await divider().count(),1);assert.deepEqual(await divider().evaluate(el=>[el.previousElementSibling.dataset.proposalId,el.nextElementSibling.dataset.proposalId]),['history-2','history-0']);
 await page.locator('.sb-brand').hover();
 assert.equal(await row('history-1').locator('.sb-history-pin').evaluate(el=>getComputedStyle(el).opacity),'1');
 assert.equal(await row('history-1').locator('.sb-history-more').evaluate(el=>getComputedStyle(el).opacity),'0');
 await row('history-1').hover();await page.waitForFunction(()=>getComputedStyle(document.querySelector('[data-proposal-id="history-1"] .sb-history-pin')).opacity==='0');
 assert.equal(await row('history-1').locator('.sb-history-more').evaluate(el=>getComputedStyle(el).opacity),'1');
 assert.equal(await row('history-2').locator('.sb-history-more').evaluate(el=>getComputedStyle(el).opacity),'0');
 assert.equal(await row('history-0').locator('.sb-history-more').evaluate(el=>getComputedStyle(el).opacity),'0');
 const stored=await page.evaluate(()=>window.__historyMenuRepo.getProposals());assert.deepEqual(stored,documents);assert.equal(modelCalls,0);
 const fresh=await page.evaluate(()=>window.__historyMenuRepo.createProposal());assert.equal((await order())[0],'history-1');
 await page.waitForFunction(id=>JSON.parse(localStorage.getItem('winmate.v2.proposals')||'[]').some(p=>p.id===id),fresh);
 await page.reload();await page.locator('.home').waitFor();await page.evaluate(async()=>{window.__historyMenuRepo=await import('/src/repositories/proposals.js');});assert.deepEqual((await order()).slice(0,2),['history-1','history-2']);
 pass('Pins stay above newer entries after reload, swap to more on hover, and preserve proposal contents and timestamps');
 await more('history-1');await menu().getByRole('menuitem',{name:'고정 해제',exact:true}).click();assert.deepEqual(await order(),['history-2',fresh,'history-0','history-1']);
 assert.equal(await divider().evaluate(el=>el.previousElementSibling.dataset.proposalId),'history-2');
 await more('history-1');await page.mouse.move(300,600);assert.equal(await menu().isVisible(),true);assert.ok((await page.locator('.sidebar').boundingBox()).width>200);
 await page.screenshot({path:path.join(out,'hover-menu-and-pinned.png'),animations:'disabled'});
 await page.locator('.home-hero h1').click();assert.equal(await menu().count(),0);
 pass('Unpin restores recency order, the sidebar stays expanded while using the menu, and outside clicks close it');
 await more('history-1');await menu().getByRole('menuitem',{name:'공유',exact:true}).click();await share().getByLabel('공유 링크').waitFor();
 await page.waitForFunction(()=>document.querySelector('[aria-label="공유 링크"]')?.value.includes('/s/'));
 const url=await share().getByLabel('공유 링크').inputValue();await share().getByRole('button',{name:'링크 복사',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),url);
 await share().getByRole('combobox',{name:'링크 접근 권한'}).selectOption('edit');
 await page.waitForFunction(()=>document.querySelector('[aria-label="링크 접근 권한"]')?.value==='edit');assert.equal(await page.locator('.home').isVisible(),true);
 await share().getByRole('button',{name:'닫기',exact:true}).last().click();
 pass('Share opens the existing share dialog for the exact item, copies its link and retains permission controls without changing pages');
 await more('history-2');await menu().getByRole('menuitem',{name:'삭제',exact:true}).click();const confirm=()=>page.getByRole('alertdialog',{name:'제안서 히스토리에서 삭제할까요?'});
 await confirm().getByRole('button',{name:'취소',exact:true}).click();assert.equal(await row('history-2').count(),1);
 await more('history-2');await menu().getByRole('menuitem',{name:'삭제',exact:true}).click();await confirm().getByRole('button',{name:'삭제',exact:true}).click();assert.equal(await row('history-2').count(),0);
 assert.equal(await divider().count(),0);
 const pref=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.history-preferences')));assert.ok(!pref.pinned.includes('history-2'));
 await more('history-1');await menu().getByRole('menuitem',{name:'삭제',exact:true}).click();assert.ok((await confirm().innerText()).includes('공유된 Storyboard 링크는 유지'));
 await confirm().getByRole('button',{name:'삭제',exact:true}).click();
 const snapshot=[...snapshots.values()].find(s=>s.sourceId==='history-1');await page.evaluate(s=>window.__historyMenuRepo.sharedProposal(s),snapshot);
 await page.waitForTimeout(1700);assert.equal(await row('history-1').count(),0);assert.equal(await row('history-0').count(),1);assert.equal(await row(fresh).count(),1);
 pass('Delete asks first, clears its pin, and removes only that history entry; late shared snapshots never resurrect it');
 await page.reload();await page.locator('.home').waitFor();await page.evaluate(async()=>{window.__historyMenuRepo=await import('/src/repositories/proposals.js');});assert.deepEqual(await order(),[fresh,'history-0']);
 await page.locator('.sidebar').hover({position:{x:20,y:20}});await row('history-0').locator('.sb-item').click();await page.locator('#pr-title').waitFor();
 await more('history-0');await menu().getByRole('menuitem',{name:'삭제',exact:true}).click();await confirm().getByRole('button',{name:'삭제',exact:true}).click();await page.locator('.home').waitFor();assert.equal(await row('history-0').count(),0);
 pass('Deletion survives reload and deleting the currently open proposal returns to Home');
 failNextShare=true;await more(fresh);await menu().getByRole('menuitem',{name:'공유',exact:true}).click();await share().getByRole('alert').waitFor();assert.ok((await share().innerText()).includes('공유 연결 테스트 오류'));
 await share().getByRole('button',{name:'다시 시도',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="공유 링크"]')?.value.includes('/s/'));
 assert.equal(await share().getByRole('button',{name:'링크 복사',exact:true}).isEnabled(),true);await share().getByRole('button',{name:'닫기',exact:true}).last().click();
 pass('Share failures stay in the dialog and retry creates a usable link');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'메뉴 열기',exact:true}).click();await row(fresh).hover();await row(fresh).getByRole('button',{name:/더보기$/}).click();
 const bounds=await menu().boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y>=0&&bounds.y+bounds.height<=844);await page.keyboard.press('Escape');
 pass('The menu remains inside the viewport on a narrow screen');
 assert.equal(modelCalls,0);assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checks,errors,modelCalls},null,2));
}catch(error){if(page)await page.screenshot({path:path.join(out,'failure.png'),animations:'disabled'});throw error;}
finally{await browser?.close();await server.close();}
