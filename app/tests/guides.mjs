// Real read-only walkthroughs: no login, generated proposal, model call or personal-data mutation.
import assert from 'node:assert/strict';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { GUIDES } from '../web/src/domain/guides/catalog.js';
import { createGuideTestServer } from './fixtures/guide-server.mjs';
const fixture=process.env.WINMATE_TEST_URL?null:await createGuideTestServer();
const base=process.env.WINMATE_TEST_URL||fixture.base;
const browser=await chromium.launch();
const total=GUIDES.reduce((n,g)=>n+g.steps.length,0);
try {
 const context=await browser.newContext({viewport:{width:1500,height:1000}}),page=await context.newPage(),errors=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!['GET','HEAD','OPTIONS'].includes(r.method()))writes.push(r.method()+' '+r.url());});
 await page.goto(base);await page.locator('.home[data-home-ready="true"]').waitFor({timeout:60000});await page.waitForTimeout(700);
 const initial=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k!=='winmate.v2.ui')));
 const button=page.getByRole('button',{name:'사용 가이드',exact:true});
 const openMenu=async()=>{await page.locator('.sidebar').hover({position:{x:20,y:20}});await button.click({position:{x:18,y:19}});await page.locator('.guide-menu').waitFor();assert.equal(await page.locator('.guide-dialog').count(),0);};
 await openMenu();
 assert.equal(await page.locator('.guide-menu [data-topic]').count(),GUIDES.length);
 assert.ok(await page.evaluate(()=>{const g=document.querySelector('.sb-guide'),p=document.querySelector('.sb-foot');return g.parentElement===p.parentElement&&!!(g.compareDocumentPosition(p)&Node.DOCUMENT_POSITION_FOLLOWING);}));
 await page.waitForTimeout(300);const side=await page.locator('.sidebar').boundingBox(),menu=await page.locator('.guide-menu').boundingBox();assert.ok(Math.abs(menu.x-side.x-side.width-12)<=1);
 await page.screenshot({path:'/tmp/winmate-guides-menu-final.png'});
 console.log('PASS sidebar guide above profile; ten topics anchored beside sidebar');
 for(const guide of GUIDES){
   if(!await page.locator('.guide-menu').count())await openMenu();
   await page.locator(`[data-topic="${guide.id}"]`).click();await page.locator('#winmate-guide-dialog').waitFor();
   assert.equal(await page.locator('.guide-menu').count(),0);assert.equal(await page.locator('.guide-dialog').count(),1);
   assert.equal(await page.locator('#guide-dialog-title').innerText(),guide.title);
   for(let i=0;i<guide.steps.length;i++){
     await page.waitForFunction(title=>document.querySelector('.guide-reading h2')?.textContent===title,guide.steps[i].title);
     assert.equal(await page.locator('.guide-actions>li').count(),3);
     await page.locator('.guide-gif[data-status="ready"]').waitFor();
     assert.equal(await page.locator('.guide-screen').count(),0);
     assert.equal(await page.locator('.guide-gif canvas').count(),1);
     assert.equal(await page.locator('.guide-dialog').getAttribute('data-guide-step'),String(i+1));
     if(guide.steps[i].ai)assert.equal(await page.locator('.guide-ai-explanation').count(),1);
     if(guide.id==='storyboard'&&i===0){
       assert.equal(await page.locator('.guide-reading h2').innerText(),'새 제안서 작성 시작하기');
       assert(!(await page.locator('.guide-reading').innerText()).includes('Best Scenario'));
       const target=await page.locator('.guide-gif canvas').boundingBox();await page.mouse.click(target.x+target.width/2,target.y+target.height/2);
       assert.equal(await page.locator('.guide-dialog').count(),1);assert.equal(await page.locator('.mback').count(),0);
       for(let j=0;j<5;j++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.guide-screen,canvas')),false);}
       await page.screenshot({path:'/tmp/winmate-guides-story-final.png'});
     }
     if(guide.id==='storyboard'&&i===5)assert((await page.locator('.guide-reading').innerText()).includes('저장'));
     if(guide.id==='storyboard'&&i===6)assert.equal(await page.locator('.guide-reading h2').innerText(),'요구에 맞는 제품 연결하기');
     if(guide.id==='spatial'&&i===0)assert(await page.locator('.guide-gif canvas').isVisible());
     if(guide.id==='review'&&i===5)await page.screenshot({path:'/tmp/winmate-guides-review-final.png'});
     if(i<guide.steps.length-1)await page.getByRole('button',{name:'다음 가이드 단계',exact:true}).click();
   }
   await page.getByRole('button',{name:'가이드 완료',exact:true}).click();await page.locator('.guide-dialog').waitFor({state:'detached'});
   assert.equal(await page.locator('.app').evaluate(el=>el.inert),false);
   console.log('PASS',guide.title,guide.steps.length,'steps');
 }
 assert.deepEqual(writes,[]);assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k!=='winmate.v2.ui'))),initial);
 await openMenu();await page.locator('[data-topic="storyboard"]').click();await page.locator('.guide-dialog').waitFor();
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.guide-dialog').getAttribute('data-guide-step'),'2');await page.keyboard.press('End');assert.equal(await page.locator('.guide-dialog').getAttribute('data-guide-step'),'23');await page.keyboard.press('Home');assert.equal(await page.locator('.guide-dialog').getAttribute('data-guide-step'),'1');assert.equal(await page.getByRole('button',{name:'전체 가이드',exact:true}).count(),0);assert.equal(await page.locator('.guide-progress,.guide-visual-label,.guide-example-notice,.guide-preview-caption,.guide-chapter,.guide-key-hint').count(),0);const foot=await page.locator('.guide-dialog-foot').boundingBox(),controls=await page.locator('.guide-page-controls').boundingBox();assert.ok(Math.abs(controls.x+controls.width/2-foot.x-foot.width/2)<1);await page.getByRole('button',{name:'가이드 닫기',exact:true}).click();await openMenu();await page.keyboard.press('Escape');assert.equal(await page.locator('.guide-menu').count(),0);
 assert.deepEqual(errors,[]);await context.close();
 for(const [width,height] of [[900,600],[390,844]]){
   const ctx=await browser.newContext({viewport:{width,height}}),p=await ctx.newPage();await p.goto(base);await p.locator('.home[data-home-ready="true"]').waitFor({timeout:60000});
   if(width<761)await p.getByRole('button',{name:'메뉴 열기',exact:true}).click();else await p.locator('.sidebar').hover({position:{x:20,y:20}});
   await p.getByRole('button',{name:'사용 가이드',exact:true}).click({position:{x:18,y:19}});await p.locator('.guide-menu').waitFor();
   const box=await p.locator('.guide-menu').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=height);
   await p.locator('[data-topic="storyboard"]').click();await p.locator('.guide-dialog').waitFor();
   const dialog=await p.locator('.guide-dialog').boundingBox();assert.ok(dialog.x>=0&&dialog.x+dialog.width<=width&&dialog.y>=0&&dialog.y+dialog.height<=height);
   await p.getByRole('button',{name:'다음 가이드 단계',exact:true}).click();await p.getByRole('button',{name:'다음 가이드 단계',exact:true}).click();
   assert.equal(await p.locator('.guide-dialog').getAttribute('data-guide-step'),'3');
   if(width<761)await p.screenshot({path:'/tmp/winmate-guides-mobile-final.png'});
   await p.getByRole('button',{name:'가이드 닫기',exact:true}).click();await ctx.close();
   console.log(`PASS ${width}×${height}: contained menu/modal and working navigation`);
 }
 console.log(`PASS ${total} read-only steps; zero unsafe requests, zero personal-data writes, zero runtime errors`);
} finally {await browser.close();await fixture?.server.close();}
