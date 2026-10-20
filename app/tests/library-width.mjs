import fs from 'node:fs';import assert from 'node:assert/strict';
import {chromium} from '../web/node_modules/playwright/index.mjs';
const base=process.env.WINMATE_LIBRARY_WEB||'http://127.0.0.1:5192',password=process.env.WINMATE_TEST_PASSWORD;
if(!password)throw Error('WINMATE_TEST_PASSWORD is required');
const smoke=process.env.WINMATE_LIBRARY_SUITE==='smoke',widths=smoke?[1920,390]:[2560,1920,900,390];
const folder='app/tests/output/library-width';fs.mkdirSync(folder,{recursive:true});
const browser=await chromium.launch({headless:true});const rows=[];let context,page,errors;
const pages=[['catalog','.sb-tpl','PPT 레이아웃 템플릿'],['scenarios','.sb-bs','Best Scenario'],['my','.sb-my','My 템플릿'],['favorites','.sb-fav','찜 목록']];
async function navigate(selector,width){
 if(width<=760)await page.getByRole('button',{name:'메뉴 열기',exact:true}).click();else await page.locator('.sidebar').hover({position:{x:20,y:20}});
 await page.locator('.sidebar '+selector).click();await page.mouse.move(width-3,8);
 await page.locator('.tl-in').waitFor();
}
try{
 for(const width of widths){
  context=await browser.newContext({viewport:{width,height:1000},colorScheme:width===2560||width===900?'dark':'light'});errors=[];
  const r=await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{username:'admin',password}});assert.equal(r.status(),200);
  await context.route(u=>u.origin===new URL(base).origin&&['/api/llm','/api/jobs','/api/layouts/search'].includes(u.pathname),route=>route.request().method()==='GET'?route.continue():route.fulfill({status:503,contentType:'application/json',body:'{"code":"test_model_blocked"}'}));
  await context.route(u=>u.origin===new URL(base).origin&&u.pathname.startsWith('/api/storyboards'),route=>route.fulfill({status:404,contentType:'application/json',body:'{"detail":"isolated browser: sharing is outside this layout test"}'}));
  page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(String(e)));await page.goto(base+'/');await page.locator('.app').waitFor({timeout:60000});await page.locator('.boot').waitFor({state:'detached',timeout:60000});
  for(const [scope,selector,title] of pages){const start=Date.now();try{
   await navigate(selector,width);await page.getByRole('heading',{name:title,exact:true}).waitFor();
   const metric=await page.locator('.tl-in').evaluate(el=>{const r=el.getBoundingClientRect();const main=document.querySelector('.main').getBoundingClientRect();return{width:r.width,left:r.left,right:r.right,maxWidth:getComputedStyle(el).maxWidth,mainWidth:main.width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth};});
   assert.equal(metric.maxWidth,'1800px');if(width>=1920){assert(metric.width>1320);assert(Math.abs(metric.width-1800)<=2);}
   assert(metric.left>=-1&&metric.right<=width+1);assert(metric.scrollWidth<=metric.clientWidth+1);
   assert.equal(await page.getByRole('button',{name:'이 목록 PPTX로 받기',exact:true}).count(),0);assert.equal(await page.locator('.tl-cap').count(),0);
   if(scope==='catalog'){
    const card=page.locator('.tl-card').first();await card.waitFor();const fav=card.locator('.fav-btn');
    if(await fav.getAttribute('aria-pressed')!=='true')await fav.click();
    await page.waitForFunction(()=>document.querySelector('.tl-card .fav-btn')?.getAttribute('aria-pressed')==='true');
    if(width===1920){await card.click();await page.locator('.modal.sheet').waitFor();assert(await page.getByRole('button',{name:'PPTX로 받기',exact:true}).count()>0);await page.locator('.modal.sheet').getByRole('button',{name:'닫기',exact:true}).last().click();}
   }
   if(scope==='scenarios'&&width===1920){await page.locator('.bsl-more').first().click();await page.locator('.modal.sbv').waitFor();assert(await page.locator('.modal.sbv').getByRole('button',{name:'PPTX로 받기',exact:true}).count()>0);await page.locator('.modal.sbv').getByRole('button',{name:'닫기',exact:true}).last().click();}
   if(scope==='favorites')assert(await page.locator('.fav-card').count()>0);
   assert.deepEqual(errors,[]);if(width===1920||width===390)await page.screenshot({path:folder+`/${scope}-${width}.png`});
   rows.push({scope,width,passed:true,metric,ms:Date.now()-start});console.log('PASS',scope,width,Math.round(metric.width)+'px');
  }catch(e){rows.push({scope,width,passed:false,error:String(e.stack||e)});console.log('FAIL',scope,width,String(e));await page.screenshot({path:folder+`/failure-${scope}-${width}.png`,timeout:3000}).catch(()=>{});}}
  await context.close();context=null;
 }
}finally{await context?.close();await browser.close();const report={base,smoke,cases:rows,passed:rows.filter(x=>x.passed).length,total:rows.length};fs.writeFileSync(folder+(smoke?'/production-report.json':'/source-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total}));}
if(rows.some(x=>!x.passed))process.exitCode=1;
