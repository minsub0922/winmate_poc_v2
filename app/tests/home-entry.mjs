// Measure the served home during cold fonts, delayed images/metrics, and reduced motion.
import assert from 'node:assert/strict';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const base=process.env.WINMATE_TEST_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch();
const selectors=['.home-metrics','.home-hero h1','.home-hero p','.home-actions > .start','.home-actions > .rv-entry','.home-in > section','.hcard-thumb','.hcard-body','.login-dock'];
try {
  for(const [width,height] of [[1500,950],[900,600],[390,844]]) {
    const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*.woff2',async route=>{await new Promise(r=>setTimeout(r,650));await route.continue();});
    await page.route(url=>url.pathname.startsWith('/img/'),async route=>{await new Promise(r=>setTimeout(r,250));await route.continue();});
    await page.route('**/api/catalog/metrics',async route=>{await new Promise(r=>setTimeout(r,1800));await route.continue();});
    await page.addInitScript(({selectors})=>{
      window.entryProbe={frames:[],preparing:0};
      let revealed;
      const sample=time=>{
        const home=document.querySelector('.home');
        if(home?.dataset.homeReady==='false'){
          const dock=document.querySelector('.login-dock');
          if(getComputedStyle(home.querySelector('.home-in')).visibility==='hidden'&&(!dock||getComputedStyle(dock).visibility==='hidden'))window.entryProbe.preparing++;
        }
        if(home?.dataset.homeReady==='true'){
          revealed??=time;
          window.entryProbe.frames.push(selectors.map(selector=>{
            const el=document.querySelector(selector);if(!el)return null;
            const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};
          }));
        }
        if(!revealed||time-revealed<3000)requestAnimationFrame(sample);
      };requestAnimationFrame(sample);
    },{selectors});
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.locator('.home[data-home-ready="true"]').waitFor({timeout:60000});
    const stages=await page.evaluate(()=>[...document.querySelectorAll('.home-metrics,.home-hero,.home-actions>.start,.home-actions>.rv-entry,.home-in>section,.login-dock')].map(el=>({name:el.className,delay:parseFloat(getComputedStyle(el).animationDelay),animation:getComputedStyle(el).animationName})));
    assert.deepEqual(stages.map(s=>s.delay),[0,.07,.14,.21,.28,.35]);
    assert.ok(stages.every(s=>s.animation==='home-entry-fade'));
    await page.waitForTimeout(3300);
    const probe=await page.evaluate(()=>window.entryProbe);
    assert.ok(probe.preparing>0,'pending fonts should stay hidden with their space reserved');
    const first=probe.frames[0];let drift=0;
    for(const frame of probe.frames)for(let i=0;i<selectors.length;i++)if(first[i]&&frame[i])for(const key of ['x','y','w','h'])drift=Math.max(drift,Math.abs(first[i][key]-frame[i][key]));
    assert.ok(drift<=.5,`${width}px home moved by ${drift}px`);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${width}×${height}: ordered opacity fades; ${probe.frames.length} frames, max movement ${drift}px with delayed fonts/images/metrics`);
    if(width===390)await page.screenshot({path:'/tmp/winmate-home-entry-mobile.png'});
    await context.close();
  }
  const context=await browser.newContext({viewport:{width:1500,height:950},reducedMotion:'reduce'}),page=await context.newPage();
  await page.goto(base);await page.locator('.home[data-home-ready="true"]').waitFor();
  assert.ok(await page.evaluate(()=>[...document.querySelectorAll('.home-metrics,.home-hero,.home-actions>.start,.home-actions>.rv-entry,.home-in>section,.login-dock')].every(el=>getComputedStyle(el).animationName==='none'&&getComputedStyle(el).opacity==='1')));
  console.log('PASS reduced motion: all sections appear without animation');await context.close();
} finally {await browser.close();}
