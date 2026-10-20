import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {launch,freeze,settle,nav,sampleProposal,origin,output,root} from './helpers.mjs';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const sharp=require('sharp');
const folder=path.join(output,'visual');fs.mkdirSync(folder,{recursive:true});
const reportFile=process.env.VISUAL_REPORT||'report.json';

const req=async page=>{await sampleProposal(page);await page.getByRole('button',{name:'고객 요구사항 열기',exact:true}).click();};
const match=async page=>{await sampleProposal(page);await page.locator('.match-node .node').click();};
const detail=async page=>{await sampleProposal(page);await page.getByRole('button',{name:'제품 3 · 컷 + 설치 장면 열기',exact:true}).click();};
const report=async page=>{await nav(page,'.sb-rv');await page.getByRole('button',{name:'F 오토파츠 아산공장 · 관제실 · 공조 교체 (경쟁 입찰) 평가 열기',exact:true}).click();};
const best=async page=>{await nav(page,'.sb-bs');await page.getByRole('button',{name:'호텔 · 리조트 AI 스테이 — 표준 제안서 37장 상세 보기',exact:true}).click();};

const cases=[
  ['home',async()=>{}],
  ['sidebar',async page=>{await page.locator('.sidebar').hover({position:{x:20,y:20}});},{hover:true,desktop:true}],
  ['requirements-new',async page=>{await nav(page,'.sb-new');await page.getByRole('dialog',{name:'고객 요구사항',exact:true}).waitFor();}],
  ['requirements-form',req],
  ['matching',match,{media:true}],
  ['products',async page=>{await match(page);await page.getByRole('button',{name:'제품 추가 — 전체 목록 열기',exact:true}).click();}],
  ['solutions',async page=>{await match(page);await page.getByRole('button',{name:'솔루션 추가 — 전체 목록 열기',exact:true}).click();},{media:true}],
  ['cases',async page=>{await match(page);await page.getByRole('button',{name:'유관사례 추가 — 전체 목록 열기',exact:true}).click();}],
  ['storyboard',sampleProposal],
  ['part-editor',async page=>{await sampleProposal(page);await page.getByRole('button',{name:'시장 · 전략 파트 편집',exact:true}).click();}],
  ['layout-picker',async page=>{await sampleProposal(page);await page.getByRole('button',{name:'PPT 레이아웃 추가',exact:true}).first().click();await page.locator('.pk-grid').first().waitFor();}],
  ['layout-detail',detail],
  ['product-swap',async page=>{await detail(page);await page.getByRole('dialog').getByText('QM55C',{exact:true}).click();await page.getByRole('button',{name:'스마트 사이니지 QM55C — 다른 제품으로 바꾸기',exact:true}).click();}],
  ['library',async page=>nav(page,'.sb-tpl')],
  ['library-filter',async page=>{await nav(page,'.sb-tpl');await page.getByRole('button',{name:/^필터/}).click();}],
  ['my-empty',async page=>{await nav(page,'.sb-my');}],
  ['best',async page=>nav(page,'.sb-bs'),{media:true}],
  ['best-detail',best,{media:true}],
  ['best-sheet',async page=>{await best(page);await page.getByRole('button',{name:'목차 · 사진 카드 6 열기',exact:true}).click();}],
  ['reviews',async page=>nav(page,'.sb-rv')],
  ['review-report',report],
  ['review-criteria',async page=>{await report(page);await page.getByRole('button',{name:'검토 점수 기준 보기',exact:true}).click();}],
  ['review-unit',async page=>{await report(page);await page.getByRole('button',{name:'4장',exact:true}).first().click();}],
  ['simulation',async page=>nav(page,'.sb-sim'),{media:true}],
  ['simulation-demo',async page=>{await nav(page,'.sb-sim');await page.getByRole('button',{name:'이준호 · A 커피 시뮬레이션 열기',exact:true}).last().click();},{media:true}],
  ['my-import',async page=>{await nav(page,'.sb-my');await page.locator('input[data-my-file]').setInputFiles(path.join(root,'build/fixtures/my_sample.pptx'));await page.locator('.my-imp-card').first().waitFor({timeout:60000});}],
  ['my-editor',async page=>{await nav(page,'.sb-my');await page.locator('input[data-my-file]').setInputFiles(path.join(root,'build/fixtures/my_sample.pptx'));await page.locator('.my-imp-card').first().waitFor({timeout:60000});await page.getByRole('button',{name:'4장 My에 저장',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.locator('.my-grp .tl-card').first().click();await page.getByRole('button',{name:'수정하기',exact:true}).click();await page.locator('.ed-box').waitFor();}],
  ['template-editor',async page=>{await nav(page,'.sb-tpl');await page.locator('.tl-card').first().click();await page.getByRole('button',{name:'수정하기',exact:true}).click();await page.locator('.ed-box').waitFor();}],
  ['export-settings',async page=>{await sampleProposal(page);await page.getByRole('button',{name:/^PPT 레이아웃 \d+장/}).click();await page.getByRole('button',{name:'PPTX 내보내기',exact:true}).click();}],
  ['simulation-profile',async page=>{await nav(page,'.sb-sim');await page.getByRole('button',{name:'이준호 프로필 자세히 보기',exact:true}).click();}],
  ['simulation-personas',async page=>{await nav(page,'.sb-sim');await page.getByRole('region',{name:'만날 고객',exact:true}).getByRole('button',{name:'바꾸기',exact:true}).click();}],
  ['fill-review',async page=>{await detail(page);await page.getByRole('button',{name:/빈 요소 \d+개 AI로 채우기/}).click();await page.locator('.fillflow .diff').waitFor({timeout:30000});},{runtimeCopy:true}],
];
const widths=process.env.VISUAL_WIDTHS?process.env.VISUAL_WIDTHS.split(',').map(Number):[1500,900,390];
const themes=process.env.VISUAL_THEMES?process.env.VISUAL_THEMES.split(','):['light','dark'];
const selected=process.env.VISUAL_CASES?new Set(process.env.VISUAL_CASES.split(',')):null;
const browser=await launch();const results=[];
try{
  for(const width of widths)for(const theme of themes)for(const [name,action,options={}]of cases){
    if(selected&&!selected.has(name)||options.desktop&&width<=760)continue;
    const height=width===390?844:900;
    const tag=`${name}-${width}-${theme}`;const images=[];const issues=[];
    for(const branch of ['reference','app']){
      const context=await browser.newContext({viewport:{width,height},colorScheme:theme,deviceScaleFactor:1});await freeze(context);
      const page=await context.newPage();page.setDefaultTimeout(12000);
      const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
      try{
        await page.goto(origin+(branch==='reference'?'/reference/':'/'));
        await settle(page);await action(page);await settle(page);
        if(!options.hover)await page.mouse.move(width-2,2);
        await page.waitForTimeout(400);
        const file=path.join(folder,tag+'-'+branch+'.png');
        const bytes=await page.screenshot({path:file});images.push(bytes);
        if(errors.length)issues.push({branch,errors});
      }catch(error){issues.push({branch,error:error.message,errors});await page.screenshot({path:path.join(folder,tag+'-'+branch+'-failed.png')}).catch(()=>{});}
      finally{await context.close();}
    }
    let metrics=null;
    if(images.length===2){
      const a=await sharp(images[0]).ensureAlpha().raw().toBuffer();const b=await sharp(images[1]).ensureAlpha().raw().toBuffer();const diff=Buffer.alloc(a.length);let changed=0,exact=0,total=0;
      for(let i=0;i<a.length;i+=4){let max=0;for(let j=0;j<3;j++){const d=Math.abs(a[i+j]-b[i+j]);max=Math.max(max,d);total+=d;}if(max)exact++;if(max>12)changed++;diff[i]=max?255:a[i]/3;diff[i+1]=max?0:a[i+1]/3;diff[i+2]=max?100:a[i+2]/3;diff[i+3]=255;}
      metrics={changedPixels:changed,changedFraction:changed/(width*height),exactDifferentPixels:exact,meanAbsoluteError:total/(width*height*3)};
      if(changed)await sharp(diff,{raw:{width,height,channels:4}}).png().toFile(path.join(folder,tag+'-diff.png'));
    }
    results.push({name,width,height,theme,knownMediaCorrection:!!options.media,expectedRuntimeCopy:!!options.runtimeCopy,metrics,issues});
    fs.writeFileSync(path.join(folder,reportFile),JSON.stringify(results,null,2));
    console.log(tag,metrics?`diff=${(metrics.changedFraction*100).toFixed(4)}%`:'capture failed',issues.length?JSON.stringify(issues).slice(0,350):'');
  }
}finally{await browser.close();}
const failures=results.filter(r=>r.issues.some(i=>i.error||i.branch==='app')||!r.metrics||r.metrics.changedFraction>0.001&&!r.knownMediaCorrection&&!r.expectedRuntimeCopy);
console.log(JSON.stringify({comparisons:results.length,zero:results.filter(r=>r.metrics?.exactDifferentPixels===0).length,knownCorrections:results.filter(r=>r.knownMediaCorrection&&r.metrics?.changedPixels).length,failures:failures.map(r=>({name:r.name,width:r.width,theme:r.theme,metrics:r.metrics,issues:r.issues}))},null,2));
if(failures.length)process.exitCode=1;
