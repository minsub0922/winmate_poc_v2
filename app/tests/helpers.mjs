import { chromium } from '../web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const origin = process.env.WINMATE_TEST_URL || 'http://127.0.0.1:8788';
export const output = path.join(root,'app/tests/output');
fs.mkdirSync(output,{recursive:true});
export const launch = () => chromium.launch(process.env.CHROME ? { executablePath:process.env.CHROME,headless:true } : { headless:true });

export async function freeze(context) {
  await context.addInitScript(() => {
    const RealDate=Date;const time=1792375200000;
    class FixedDate extends RealDate {constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}}
    window.Date=FixedDate;
    let seed=8459;Math.random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  });
  // The reference remains byte-for-byte immutable. Both pages use the same font bytes.
  await context.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(root,'app/web/public/fonts/fonts.css'),'utf8').replaceAll('url(/fonts/',`url(${origin}/fonts/`)}));
}

export async function settle(page) {
  await page.waitForFunction(()=>document.querySelector('.app')&&!document.querySelector('.boot'),{timeout:20000});
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForTimeout(350);
  await page.evaluate(async()=>{
    const images=[...document.images].filter(im=>{const r=im.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;});
    await Promise.all(images.map(im=>im.complete?Promise.resolve():Promise.race([new Promise(resolve=>{im.addEventListener('load',resolve,{once:true});im.addEventListener('error',resolve,{once:true});}),new Promise(resolve=>setTimeout(resolve,3000))])));
  });
}

export async function showSidebar(page) {
  if(page.viewportSize().width<=760)await page.getByRole('button',{name:'메뉴 열기',exact:true}).click();
  else await page.locator('.sidebar').hover({position:{x:20,y:20}});
  await page.waitForFunction(()=>{
    const sidebar=document.querySelector('.sidebar');const rect=sidebar.getBoundingClientRect();
    if(innerWidth<=760)return rect.x>=-1;
    const width=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sb-w'));
    return rect.width>=width-0.5;
  });
}

export async function nav(page,selector) {
  await showSidebar(page);
  await page.locator('.sidebar '+selector).click();
  await page.mouse.move(page.viewportSize().width-3,2);
  await settle(page);
}

export async function sampleProposal(page) {
  await showSidebar(page);
  await page.locator('.sb-list .sb-item').filter({hasText:'A 커피 · 전국 매장 디지털 메뉴보드 전환'}).click();
  await page.mouse.move(page.viewportSize().width-3,2);
  await settle(page);
}

export async function closeTop(page) {
  const dialog=page.getByRole('dialog').last();
  await dialog.getByRole('button',{name:'닫기',exact:true}).first().click();
  await settle(page);
}

export const assert = (condition,message) => {if(!condition)throw new Error(message);};
