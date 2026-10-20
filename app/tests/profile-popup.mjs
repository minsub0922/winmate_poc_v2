// Isolated browser fixture covers the profile UI; real auth cookie/revocation tests live in test_auth.py.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const data=name=>JSON.parse(fs.readFileSync(path.join(root,'app/data',name+'.json'),'utf8'));
const bootstrap={catalog:data('catalog'),products:data('products_db'),images:data('images'),capabilities:null};
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port:5191,strictPort:false,hmr:false}});
let browser;
try {
 await server.listen();browser=await chromium.launch();const base='http://127.0.0.1:'+server.httpServer.address().port;
 const context=await browser.newContext({viewport:{width:1500,height:1000}});
 let signedIn=true,failLogout=true,logoutCalls=0,release;
 const gate=new Promise(resolve=>release=resolve);
 await context.route(url=>url.pathname.startsWith('/api/'),async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname==='/api/bootstrap')return route.fulfill({json:{...bootstrap,user:{guest:!signedIn,username:signedIn?'profile-test':null,auth_enabled:true}}});
   if(url.pathname==='/api/auth/logout'){
     assert.equal(request.method(),'POST');logoutCalls++;
     if(failLogout)return route.fulfill({status:503,json:{detail:'연결 오류 · 다시 시도해 주세요.'}});
     await gate;signedIn=false;return route.fulfill({json:{ok:true}});
   }
   return route.fulfill({json:{items:[],jobs:[]}});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('.home[data-home-ready="true"]').waitFor();
 const profile=page.getByRole('button',{name:'유저 프로필',exact:true});
 const open=async()=>{await page.locator('.sidebar').hover({position:{x:20,y:20}});await profile.click({position:{x:18,y:15}});await page.getByRole('dialog',{name:'로그인 정보',exact:true}).waitFor();};
 await open();assert.equal(new URL(page.url()).pathname,'/');assert.equal(await page.locator('.profile-popup strong').innerText(),'profile-test');assert.equal(await page.locator('.profile-popup button').count(),1);assert.equal(await page.locator('.profile-popup button').innerText(),'로그아웃');
 const side=await page.locator('.sidebar').boundingBox(),popup=await page.locator('.profile-popup').boundingBox();assert.equal(popup.x,side.x+side.width+12);assert.equal(logoutCalls,0);await page.screenshot({path:'/tmp/winmate-profile-popup.png'});
 await page.mouse.click(1490,12);assert.equal(await page.locator('.profile-popup').count(),0);
 await open();await page.keyboard.press('Escape');assert.equal(await page.locator('.profile-popup').count(),0);await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='유저 프로필');assert.equal(await profile.evaluate(el=>document.activeElement===el),true);
 await open();await profile.click({position:{x:18,y:15}});assert.equal(await page.locator('.profile-popup').count(),0);
 console.log('PASS profile opens beside sidebar with only login information and logout; outside/Escape/toggle dismissal');
 await open();await page.getByRole('button',{name:'사용 가이드',exact:true}).click({position:{x:18,y:19}});await page.locator('.guide-menu').waitFor();assert.equal(await page.locator('.profile-popup').count(),0);await page.keyboard.press('Escape');
 await open();await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.getByRole('alert').filter({hasText:'연결 오류'}).waitFor();assert.equal(logoutCalls,1);assert.equal(signedIn,true);assert.equal(await page.locator('.profile-popup button').isEnabled(),true);
 console.log('PASS guide/profile do not overlap; failed logout keeps session and allows retry');
 await page.locator('.sidebar').hover({position:{x:20,y:20}});await page.locator('.sb-tpl').click({position:{x:18,y:18}});await page.locator('.tl').waitFor();await open();
 await page.evaluate(()=>localStorage.setItem('profile-preserved-test','keep-me'));
 failLogout=false;await page.getByRole('button',{name:'로그아웃',exact:true}).click();await page.getByRole('button',{name:'로그아웃 중…',exact:true}).waitFor();assert.equal(await page.locator('.profile-popup button').isDisabled(),true);await page.locator('.profile-popup button').evaluate(el=>el.click());assert.equal(logoutCalls,2);release();
 await page.locator('.home[data-home-ready="true"]').waitFor();await page.waitForFunction(()=>!!document.querySelector('[data-login-mode="dock"]'));
 assert.equal(await page.locator('.profile-popup').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('profile-preserved-test')),'keep-me');
 await profile.click({position:{x:18,y:15}});await page.getByRole('dialog',{name:'로그인하고 이어서 시작하세요',exact:true}).waitFor();assert.equal(await page.locator('[data-login-mode]').count(),1);await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);console.log('PASS successful logout returns home, preserves browser data, prevents duplicate submissions; guest profile still opens one login form');await context.close();
 const mobile=await browser.newContext({viewport:{width:390,height:844}});
 await mobile.route(url=>url.pathname.startsWith('/api/'),route=>new URL(route.request().url()).pathname==='/api/bootstrap'?route.fulfill({json:{...bootstrap,user:{guest:false,username:'mobile-profile',auth_enabled:true}}}):route.fulfill({json:{items:[],jobs:[]}}));
 const p=await mobile.newPage();await p.goto(base);await p.locator('.home[data-home-ready="true"]').waitFor();await p.getByRole('button',{name:'메뉴 열기',exact:true}).click();await p.getByRole('button',{name:'유저 프로필',exact:true}).click({position:{x:18,y:15}});await p.locator('.profile-popup').waitFor();const box=await p.locator('.profile-popup').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);assert.equal(await p.locator('.profile-popup button').count(),1);await mobile.close();console.log('PASS mobile popup stays within viewport');
} finally {await browser?.close();await server.close();}
