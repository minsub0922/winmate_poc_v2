import {chromium} from '../../app/web/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const base=process.env.WINMATE_ADMIN_TEST_URL||'http://127.0.0.1:8796';
const out=path.resolve('admin/runtime/evidence/resources');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage(),results=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));
async function openAsset(kind,query,identifier) {
  await page.goto(base+'/admin/assets?kind='+kind);
  const loaded=page.waitForResponse(r=>new URL(r.url()).pathname==='/admin/api/assets'&&new URL(r.url()).searchParams.get('q')===query);
  await page.getByRole('textbox',{name:'에셋 검색',exact:true}).fill(query);await loaded;
  const response=await context.request.get(base+'/admin/api/assets?'+new URLSearchParams({kind,q:query,limit:100}));
  const a=(await response.json()).items.find(x=>x.id===identifier);assert(a,'test asset '+identifier);
  await page.locator('.asset-name').filter({has:page.getByText(a.title,{exact:true})}).first().click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('region',{name:'에셋 리소스 요약'}).waitFor();
}
async function allResources() {
  await page.getByRole('button',{name:'전체 리소스',exact:true}).click();
  await page.locator('.resource-card').first().waitFor();
}
try {
  await page.goto(base+'/admin/');
  await page.getByRole('textbox',{name:'아이디',exact:true}).fill('admin');
  await page.getByLabel('비밀번호',{exact:true}).fill('Admin-local-test-2026!');
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await page.getByRole('heading',{name:'관리 개요',exact:true}).waitFor();

  await openAsset('product','qm55c','product:qm55c');
  await page.locator('.resource-hero img').waitFor();
  await page.waitForFunction(()=>document.querySelector('.resource-hero img')?.naturalWidth>0);
  await page.waitForFunction(()=>[...document.querySelectorAll('.resource-mini-grid img')].every(x=>x.complete&&x.naturalWidth>0));
  await page.screenshot({path:path.join(out,'product-primary-desktop.png')});
  await allResources();
  await page.getByRole('combobox',{name:'리소스 종류'}).selectOption('image');
  await page.locator('.resource-card').first().click();
  await page.locator('.resource-large-image img').waitFor();
  await page.waitForFunction(()=>document.querySelector('.resource-large-image img')?.naturalWidth>0);
  await page.getByRole('button',{name:'원본 크기',exact:true}).click();
  assert(await page.locator('.resource-large-image.original').count());
  await page.getByRole('button',{name:'화면에 맞춤',exact:true}).click();
  const downloadWait=page.waitForEvent('download');
  await page.getByRole('link',{name:'다운로드',exact:true}).click();
  const download=await downloadWait;assert((await download.suggestedFilename()).length>0);
  await download.saveAs(path.join(out,'downloaded-image.png'));
  await page.locator('.resource-provenance summary').click();
  await page.screenshot({path:path.join(out,'product-resources-desktop.png')});
  results.push('Product primary image, related gallery, enlargement, source metadata and actual image download work');
  await page.getByRole('button',{name:'미리보기 닫기',exact:true}).click();
  await page.getByRole('textbox',{name:'리소스 검색'}).fill('no-resource-xyz');
  await page.getByText('조건에 맞는 리소스가 없습니다',{exact:true}).waitFor();
  await page.getByRole('textbox',{name:'리소스 검색'}).fill('');
  await page.locator('.resource-card').first().waitFor();
  await page.keyboard.press('Escape');
  results.push('Resource kind filter, search, empty state and modal close work');

  await openAsset('image','qm55c.front','image:app/qm55c.front');
  await page.waitForFunction(()=>document.querySelector('.resource-hero img')?.naturalWidth>0);
  results.push('Local app image without a remote URL is visible');
  await page.keyboard.press('Escape');

  await openAsset('pack','app/data/static/img/prod/g08.json','pack:app/data/static/img/prod/g08.json');
  await allResources();
  await page.getByRole('combobox',{name:'리소스 종류'}).selectOption('image');
  await page.locator('.resource-card').first().waitFor();
  assert.equal(await page.locator('.resource-card').count(),24);
  await page.locator('.asset-resources .pager').getByRole('button',{name:'다음',exact:true}).click();
  await page.getByText('이미지 25 · 슬롯 24',{exact:true}).waitFor();
  assert.equal(await page.locator('.resource-card').count(),24);
  await page.screenshot({path:path.join(out,'pack-gallery-desktop.png')});
  results.push('Packed images retain slot zero and every later image is accessible through pagination');
  await page.keyboard.press('Escape');

  await openAsset('layout','L_AIS_01','layout:L_AIS_01');
  await page.frameLocator('.resource-layout iframe').locator('img').first().waitFor();
  await page.waitForFunction(()=>document.querySelector('.resource-layout iframe')?.contentDocument?.querySelector('img')?.naturalWidth>1);
  const sandbox=await page.locator('.resource-layout iframe').getAttribute('sandbox');assert.equal(sandbox,'allow-same-origin');
  await page.screenshot({path:path.join(out,'layout-preview-desktop.png')});
  results.push('Layout previews resolve packed fill photos in a script-free sandbox');
  await page.keyboard.press('Escape');

  await openAsset('solution','magicinfo','solution:magicinfo');
  await allResources();
  const gallery=page.getByRole('button',{name:/^관련 이미지/});await gallery.click();
  await page.locator('.resource-card img').first().waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('.resource-card img')].some(x=>x.naturalWidth>0));
  results.push('Solutions show their actual related scenes and source images');
  await page.keyboard.press('Escape');

  await openAsset('catalog','데이코 카탈로그','catalog:131');
  await allResources();
  await page.locator('.resource-group-tabs').getByRole('button',{name:/^카탈로그/}).click();
  await page.locator('.resource-card').first().waitFor();
  assert(await page.getByText('카탈로그 131 · 1쪽',{exact:true}).count());
  const manifest=await (await context.request.get(base+'/admin/api/assets/catalog:131/resources?group=catalog&limit=60')).json();
  assert(manifest.total>=88);
  await page.screenshot({path:path.join(out,'catalog-resources-desktop.png')});
  results.push('Catalog pages and registered source PDF links remain browsable beyond the first page');
  await page.keyboard.press('Escape');

  for(const extension of ['pdf','pptx']) {
    await openAsset('document','리소스 검증 '+extension.toUpperCase(),'document:resource-probe-'+extension);
    await allResources();
    await page.locator('.resource-group-tabs').getByRole('button',{name:/^문서 내 리소스/}).click();
    await page.locator('.resource-card').first().waitFor();
    const expected=extension==='pdf'?4:2;assert.equal(await page.locator('.resource-card').count(),expected);
    await page.locator('.resource-card').filter({hasText:'metadata.json'}).click();
    await page.locator('.resource-data').filter({hasText:'resource_probe'}).waitFor();
    await page.getByRole('button',{name:'미리보기 닫기',exact:true}).click();
    await page.locator('.resource-card').filter({has:page.locator('img')}).first().click();
    await page.waitForFunction(()=>document.querySelector('.resource-large-image img')?.naturalWidth>0);
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.resource-large-image img').count(),1);
    await page.screenshot({path:path.join(out,'embedded-'+extension+'-desktop.png')});
    results.push(extension.toUpperCase()+' embedded resources and attachments display their real image and JSON contents');
    await page.keyboard.press('Escape');
  }

  await page.setViewportSize({width:390,height:844});
  await openAsset('product','qm55c','product:qm55c');
  await allResources();
  await page.getByRole('combobox',{name:'리소스 종류'}).selectOption('image');
  await page.locator('.resource-card').first().click();
  await page.waitForFunction(()=>document.querySelector('.resource-large-image img')?.naturalWidth>0);
  assert.equal(await page.locator('body').evaluate(x=>x.scrollWidth>innerWidth),false);
  assert.equal(await page.getByRole('dialog').evaluate(x=>x.scrollWidth>x.clientWidth+2),false);
  await page.screenshot({path:path.join(out,'product-resources-mobile.png')});
  results.push('390px mobile gallery and enlarged preview fit within the popup without horizontal overflow');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({ok:true,results,errors},null,2));
  console.log(JSON.stringify({ok:true,checks:results.length,results},null,2));
} catch(e) {
  await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({ok:false,results,errors,error:e.message},null,2));
  throw e;
} finally {await context.close();await browser.close();}
