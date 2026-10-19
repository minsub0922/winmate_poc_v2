import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {launch,freeze,settle,nav,origin,output,assert} from './helpers.mjs';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const JSZip=require('jszip');
const folder=path.join(output,'e2e');fs.mkdirSync(folder,{recursive:true});
const browser=await launch();const context=await browser.newContext({viewport:{width:1500,height:900},acceptDownloads:true});await freeze(context);
const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[];const steps=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const mod=process.platform==='darwin'?'Meta':'Control';
async function step(name,run){const start=Date.now();await run();steps.push({name,ms:Date.now()-start});fs.writeFileSync(path.join(folder,'progress.json'),JSON.stringify({steps,errors},null,2));console.log('PASS',name);}
async function paste(selector,text){await page.locator(selector).evaluate((element,text)=>{element.focus();const data=new DataTransfer();data.setData('text/plain',text);element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},text);}
async function state(){await page.waitForTimeout(350);return page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.proposals')));}
let proposalId,pptxPath,backupPath;
try{
  await step('SQLite API matches the frozen 1068-product display contract',async()=>{
    const api=await(await fetch(origin+'/api/products')).json();
    assert(api.items.length===1068,'product count');assert(api.items[0].id==='qm55c','curated order');
    assert((await(await fetch(origin+'/api/health')).json()).llm_mode==='dummy','dummy mode is explicit');
  });
  await page.goto(origin+'/');await settle(page);
  await step('new proposal, keyboard @ mention, pasted link and creator-note tags',async()=>{
    await nav(page,'.sb-new');
    const editor=page.locator('#free-ed');await editor.fill('전국 320개 카페 매장 디지털 메뉴보드 전환. 본사에서 신메뉴와 가격을 당일 반영하고 싶습니다. ');
    await editor.press('End');await page.keyboard.type('@QM');await page.locator('.mmenu').waitFor();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#free-ed .mention[data-ref]'));
    const product=await(await fetch(origin+'/api/products/qm55c')).json();
    await paste('#free-ed',' '+product.url+' ');
    await page.waitForFunction(()=>document.querySelector('#free-ed .mlink[data-link]'));
    await page.getByRole('tab',{name:/^입력 폼/}).click();
    await page.getByRole('textbox',{name:'프로젝트명',exact:true}).fill('전국 메뉴보드 전환 검증');
    await page.getByRole('textbox',{name:'고객사',exact:true}).fill('테스트 커피');
    await page.getByRole('textbox',{name:'최종 제안대상',exact:true}).fill('운영본부장');
    const note=page.getByRole('textbox',{name:'제작자 의견',exact:true});await note.fill('10개 매장 파일럿부터 단계적으로 도입. ');await note.press('End');await page.keyboard.type('@Magic');await page.locator('.mmenu').waitFor();await page.locator('.mmenu .mopt.solution').first().click();
    await page.getByRole('dialog',{name:'고객 요구사항',exact:true}).getByRole('button',{name:'저장',exact:true}).click();await page.getByRole('dialog',{name:'제품 · 솔루션 매칭',exact:true}).waitFor();
    const proposal=(await state()).find(p=>p.customer==='테스트 커피');assert(proposal,'new proposal persisted');proposalId=proposal.id;
    assert(proposal.req.free.some(s=>s.ref==='product:qm55c'),'@ reference segment');assert(proposal.req.free.some(s=>s.link&&s.t.startsWith('http')),'link segment');assert(proposal.req.form.noteSegs.some(s=>s.ref==='solution:magicinfo'),'creator note tag');
    await page.screenshot({path:path.join(folder,'01-requirements-matching.png')});
  });
  await step('matching → dummy AI Storyboard with visible rule fallback',async()=>{
    await page.getByRole('dialog',{name:'제품 · 솔루션 매칭',exact:true}).getByRole('button',{name:'저장',exact:true}).click();
    await page.getByRole('button',{name:'AI로 나머지 구성',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.col:not(.ghost)').length>=6&&!document.querySelector('.col.ghost'),{timeout:30000});
    assert((await state()).find(p=>p.id===proposalId).parts.filter(p=>!p.deck).length>=6,'fallback Storyboard persisted');
    await page.screenshot({path:path.join(folder,'02-storyboard.png')});
  });
  await step('add a real layout, dummy fill review and apply',async()=>{
    await page.getByRole('button',{name:'PPT 레이아웃 추가',exact:true}).first().click();
    await page.locator('#pk-q').fill('L_PH_P3_A');await page.locator('#pk-q').press('Enter');await page.waitForTimeout(450);
    await page.locator('.pcard').first().click();await page.getByRole('dialog').last().getByRole('button',{name:'완료',exact:true}).click();
    await page.getByRole('button',{name:'제품 3 · 컷 + 설치 장면 열기',exact:true}).click();
    await page.getByRole('button',{name:/빈 요소 \d+개 AI로 채우기/}).click();
    await page.locator('.fillflow .diff').waitFor({timeout:30000});
    assert(/규칙/.test(await page.locator('.fillflow').innerText()),'dummy fallback displayed');
    await page.screenshot({path:path.join(folder,'03-dummy-fill.png')});
    await page.locator('.fillflow').getByRole('button',{name:/칸 반영/}).click();
    const p=(await state()).find(p=>p.id===proposalId);const layout=p.parts.flatMap(p=>p.layouts).find(l=>l.f==='L_PH_P3_A');assert(Object.keys(layout.ov.t).length>0,'fill applied to overrides');
  });
  await step('replace a database product with its model/spec/image updates',async()=>{
    await page.getByRole('dialog').getByText('QM55C',{exact:true}).first().click();
    await page.getByRole('button',{name:'스마트 사이니지 QM55C — 다른 제품으로 바꾸기',exact:true}).click();
    await page.getByRole('dialog',{name:'제품 바꾸기',exact:true}).getByRole('button',{name:'스마트 사이니지 QM65C · 고르기',exact:true}).press('Enter');
    await page.getByRole('dialog',{name:'제품 바꾸기',exact:true}).getByRole('button',{name:/로 바꾸기$/}).click();
    assert((await page.locator('.detail-left').innerText()).includes('QM65C'),'slide model changed');
    const p=(await state()).find(p=>p.id===proposalId);const layout=p.parts.flatMap(p=>p.layouts).find(l=>l.f==='L_PH_P3_A');assert(JSON.stringify(layout.ov).includes('QM65C'),'override model persisted');
    await page.screenshot({path:path.join(folder,'04-product-swap.png')});
    await page.getByRole('dialog').last().getByRole('button',{name:'닫기',exact:true}).first().click();
  });
  await step('export editable PPTX through browser download',async()=>{
    await page.getByRole('button',{name:/^PPT 레이아웃 \d+장/}).click();
    await page.getByRole('button',{name:'PPTX 내보내기',exact:true}).click();
    await page.locator('#ex-name').fill('Winmate E2E');
    const downloadPromise=page.waitForEvent('download',{timeout:90000});await page.getByRole('button',{name:'PPTX 만들기',exact:true}).click();const download=await downloadPromise;
    pptxPath=path.join(folder,'Winmate E2E.pptx');await download.saveAs(pptxPath);
    const zip=await JSZip.loadAsync(fs.readFileSync(pptxPath));const slides=Object.keys(zip.files).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f));assert(slides.length===1,'one slide exported');
    const xml=await zip.file(slides[0]).async('string');assert(xml.includes('QM65C'),'exported replacement text');assert((xml.match(/<a:t>/g)||[]).length>10,'editable text boxes retained');assert(Object.keys(zip.files).filter(f=>/^ppt\/media\//.test(f)&&!zip.files[f].dir).length>=3,'actual images embedded');
  });
  await step('upload the exported PPTX to review and finish rule-based scoring',async()=>{
    await nav(page,'.sb-rv');await page.locator('input[type=file]').setInputFiles(pptxPath);await page.locator('.rv-report').waitFor({timeout:90000});
    assert((await page.locator('.rv-hero').innerText()).includes('규칙'),'rule evaluation source visible');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.reviews')||'[]').some(r=>!r.demo&&r.status==='done'));
    const reviews=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.reviews')));const r=reviews.find(r=>!r.demo);assert(r?.status==='done','actual uploaded document reviewed');assert(r.units.length===1,'actual PPTX slide count parsed');
    await page.getByRole('button',{name:'검토 점수 기준 보기',exact:true}).click();await page.getByRole('dialog',{name:'검토 점수 기준',exact:true}).waitFor();await page.screenshot({path:path.join(folder,'05-review-criteria.png')});await page.getByRole('dialog',{name:'검토 점수 기준',exact:true}).getByRole('button',{name:'닫기',exact:true}).click();
  });
  await step('import the PPTX into My, edit slide text and save',async()=>{
    await nav(page,'.sb-tpl');await page.getByRole('button',{name:'My',exact:true}).click();await page.locator('input[data-my-file]').setInputFiles(pptxPath);await page.locator('.my-imp-card').waitFor({timeout:90000});assert(await page.locator('.my-imp-card').count()===1,'PPTX restore found one real slide');
    await page.getByRole('button',{name:'1장 My에 저장',exact:true}).click();await page.locator('.my-grp .tl-card').waitFor();await page.locator('.my-grp .tl-card').first().click();await page.locator('.my-detail').waitFor();await page.getByRole('button',{name:'고치기',exact:true}).click();await page.locator('.ed-box').waitFor();
    await page.locator('#ed-name').fill('E2E 복원 후 편집');
    const text=page.locator('.ed-host [data-tb]').first();await text.dblclick();await page.keyboard.press(mod+'+A');await page.keyboard.insertText('실제로 고친 장표 제목');await page.keyboard.press('Escape');
    await page.screenshot({path:path.join(folder,'06-my-editor.png')});await page.getByRole('dialog').last().getByRole('button',{name:'저장',exact:true}).click();await page.locator('.ed-box').waitFor({state:'detached'});await page.locator('.my-grp .tl-card .tl-name').filter({hasText:'E2E 복원 후 편집'}).first().waitFor();
    await page.reload();await settle(page);assert((await page.locator('.my-grp .tl-card .tl-name').first().innerText())==='E2E 복원 후 편집','My metadata survives reload');assert((await page.locator('.my-grp .tl-card').first().innerText()).includes('실제로 고친 장표 제목'),'edited slide text survives reload');
    const image=page.locator('.my-grp .tl-card img').first();await image.waitFor();await page.waitForFunction(()=>{const im=document.querySelector('.my-grp .tl-card img');return im&&im.complete&&im.naturalWidth>10;});assert((await image.getAttribute('src')).startsWith('blob:'),'IndexedDB image restored');
  });
  await step('backup includes IndexedDB documents and Blob images',async()=>{
    await page.goto(origin+'/migration.html');const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'백업 JSON 내보내기',exact:true}).click();const download=await downloadPromise;backupPath=path.join(folder,'winmate-backup.json');await download.saveAs(backupPath);const backup=JSON.parse(fs.readFileSync(backupPath,'utf8'));
    assert(backup.format==='winmate-browser-v1','versioned format');assert(backup.databases['winmate-my'].tpl.length===1,'My template exported');assert(backup.databases['winmate-my'].img.some(r=>r.value.__wmType==='Blob'),'Blob images encoded');assert(backup.databases['winmate-v2-review'].docs.length===1,'parsed review document exported');assert(Object.keys(backup.local).every(k=>k.startsWith('winmate.v2.')||k==='wm-linkmeta-v1'),'whitelisted keys only');
  });
  await step('restore backup into a separate browser context and render the same My template',async()=>{
    const otherOrigin=origin.replace('127.0.0.1','localhost');
    const other=await browser.newContext({viewport:{width:1500,height:900}});await freeze(other);const target=await other.newPage();await target.goto(otherOrigin+'/migration.html');await target.locator('#file').setInputFiles(backupPath);await target.getByRole('button',{name:'가져오기',exact:true}).click();await target.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('완료:'));await target.goto(otherOrigin+'/');await settle(target);assert((await target.locator('.my-grp .tl-card .tl-name').first().innerText())==='E2E 복원 후 편집','separate-origin storage transfer restored template');assert((await target.locator('.my-grp .tl-card').first().innerText()).includes('실제로 고친 장표 제목'),'restored actual edited HTML');await other.close();
  });
  assert(errors.length===0,'browser console errors: '+errors.join(' | '));
  fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify({ok:true,steps,errors,pptx:path.basename(pptxPath),backup:path.basename(backupPath)},null,2));
  console.log('PASS full end-to-end workflow, console errors 0');
}catch(error){await page.screenshot({path:path.join(folder,'failed.png')}).catch(()=>{});fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify({ok:false,steps,errors,error:error.message,stack:error.stack},null,2));console.error(error.stack);process.exitCode=1;}
finally{await context.close();await browser.close();}
