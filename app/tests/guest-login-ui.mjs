// Isolated browser session fixtures exercise login UI; no model calls or user records are created.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,'app/data',name+'.json'),'utf8'));
const bootstrap={catalog:read('catalog'),products:read('products_db'),images:read('images'),capabilities:null};
const library=read('spatial/library');
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:5189,strictPort:false,hmr:false}});
let browser;
const checks=[];
const pass=msg=>{checks.push(msg);console.log('PASS',msg);};
try {
  await server.listen();browser=await chromium.launch();
  const context=await browser.newContext({viewport:{width:1500,height:950}});
  let signedIn=false, blockedWrites=0;
  await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname==='/api/bootstrap')return route.fulfill({json:{...bootstrap,user:{guest:!signedIn,username:signedIn?'ui-test':null,auth_enabled:true}}});
    if(url.pathname==='/api/auth/login'){
      const credentials=req.postDataJSON();
      if(credentials.password!=='fixture-password')return route.fulfill({status:401,json:{code:'invalid_credentials',detail:'아이디 또는 비밀번호를 확인해 주세요.'}});
      signedIn=true;return route.fulfill({json:{ok:true}});
    }
    if(url.pathname==='/api/spatial/library')return route.fulfill({json:library});
    if(req.method()!=='GET')blockedWrites++;
    return route.fulfill({json:{items:[],jobs:[]}});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('BROWSER',e.message);});
  const base='http://127.0.0.1:'+server.httpServer.address().port;
  await page.goto(base);await page.locator('.home').waitFor({timeout:15000}).catch(async e=>{console.error((await page.locator('body').innerText()).slice(0,1500));throw e;});
  const surface=page.locator('[data-login-mode]');
  await page.waitForTimeout(500);
  assert.equal(await surface.count(),1);assert.equal(await surface.getAttribute('data-login-mode'),'dock');
  const profile=await page.getByRole('button',{name:'유저 프로필',exact:true}).locator('.avatar').boundingBox(),dock=await surface.boundingBox();assert.ok(dock.x>profile.x+profile.width);
  await page.locator('#login-username').fill('ui-test');
  pass('guest opens home with one dock beside the profile');
  for(let i=0;i<3;i++){
    await page.locator('.home-actions .start').click();
    await page.getByRole('dialog').waitFor();assert.equal(await surface.count(),1);assert.equal(await surface.getAttribute('data-login-mode'),'modal');
    assert.equal(await page.locator('#login-username').inputValue(),'ui-test');
    const box=await surface.locator('.login-card').boundingBox();assert.ok(Math.abs(box.x+box.width/2-750)<3);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')||'[]').length),0);
    await page.keyboard.press('Escape');await page.locator('[data-login-mode="dock"]').waitFor();
  }
  pass('repeated creation attempts change one form to a centered modal and preserve inputs without creating records');
  const browse=async selector=>{await page.locator('.sidebar').hover();await page.locator(selector).click();await page.mouse.move(1450,2);await page.waitForTimeout(250);assert.equal(await page.getByRole('dialog').count(),0);};
  await browse('.sb-tpl');await page.locator('.tl-card').first().waitFor();assert.equal(await surface.count(),0);
  await page.locator('.tl-card').first().click();await page.locator('.mback').waitFor();
  // The favorite is a write even though it uses local browser storage.
  await page.locator('.mback .fav-btn').last().click();await page.getByRole('dialog',{name:'로그인하고 이어서 시작하세요'}).waitFor();
  assert.equal(await surface.count(),1);await page.keyboard.press('Escape');
  await page.evaluate(()=>localStorage.removeItem('winmate.v2.ui'));await page.goto(base);await page.locator('.home').waitFor({timeout:15000}).catch(async e=>{console.error((await page.locator('body').innerText()).slice(0,1500));throw e;});
  await browse('.sb-spatial');await page.locator('.sp-studio-launch').waitFor();await page.locator('.sp-studio-launch').click();await page.getByRole('dialog',{name:'로그인하고 이어서 시작하세요'}).waitFor();await page.keyboard.press('Escape');
  await browse('.sb-rv');await page.locator('.rvh-go').click();await page.getByRole('dialog',{name:'로그인하고 이어서 시작하세요'}).waitFor();await page.keyboard.press('Escape');
  await browse('.sb-sim');await page.locator('.ss-go').click();await page.getByRole('dialog',{name:'로그인하고 이어서 시작하세요'}).waitFor();await page.keyboard.press('Escape');
  assert.equal(blockedWrites,0);pass('catalog previews, spatial, review and simulation browse freely; write controls prompt before sending requests');
  await page.evaluate(()=>localStorage.removeItem('winmate.v2.ui'));await page.goto(base);await page.locator('.home').waitFor({timeout:15000}).catch(async e=>{console.error((await page.locator('body').innerText()).slice(0,1500));throw e;});
  await page.locator('.home-actions .start').click();await page.locator('#login-username').fill('ui-test');await page.locator('#login-password').fill('wrong-fixture-password');
  await page.locator('.login-card button[type="submit"]').click();await page.getByRole('alert').filter({hasText:'아이디 또는 비밀번호'}).waitFor();assert.equal(await surface.count(),1);
  await page.locator('#login-password').fill('fixture-password');await page.locator('.login-card button[type="submit"]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-login-mode]'));
  await page.locator('.home-actions .start').click();await page.locator('#free-ed').waitFor();
  pass('failed login stays in one modal; successful login removes it and enables proposal creation');
  const mobile=await browser.newContext({viewport:{width:390,height:844}});signedIn=false;
  await mobile.route(url=>url.pathname.startsWith('/api/'),route=>new URL(route.request().url()).pathname==='/api/bootstrap'?route.fulfill({json:{...bootstrap,user:{guest:true,auth_enabled:true}}}):route.fulfill({json:{items:[]}}));
  const m=await mobile.newPage();await m.goto(base);await m.locator('.home').waitFor();
  const mobileBox=await m.locator('.login-card').boundingBox();assert.ok(mobileBox.x>=0&&mobileBox.x+mobileBox.width<=390);
  await m.locator('.mobile-profile').click();assert.equal(await m.locator('[data-login-mode]').count(),1);assert.equal(await m.locator('[data-login-mode]').getAttribute('data-login-mode'),'modal');await m.keyboard.press('Escape');assert.equal(await m.locator('[data-login-mode]').getAttribute('data-login-mode'),'dock');
  pass('390px mobile has one contained form and returns to the dock after dismissal');
  assert.deepEqual(errors,[]);pass('no browser runtime errors');
} finally {await browser?.close();await server.close();}
