import fs from 'node:fs';import path from 'node:path';
import {launch,startVite,isolatedContext,openApp,suite,ok,eq,root,apiOrigin,outDir,JSZip} from './fixtures/strict/harness.mjs';
const report=suite('input-readers','app/tests/input_readers.mjs');const browser=await launch();const vite=await startVite();let context,page;
try{
 context=await isolatedContext(browser,vite.url);page=await openApp(context,vite.url);
 const textCase=(id,title,name,text,mime)=>report.case(id,title,async d=>{
  const r=await page.evaluate(async({name,text,mime})=>{const {readAttachments}=await import('/src/services/attachments.js');return(await readAttachments([new File([text],name,{type:mime})],{full:true,rich:true}))[0];},{name,text,mime});
  eq(r.fullText,text,'complete source text');eq(r.text,text.slice(0,20000),'bounded browser excerpt');eq(r.extractedChars,text.length,'original character count');ok(!r.readError,'read failed '+r.readError);d.characters=text.length;
 });
 textCase('I01','Korean UTF8 source','한국어.txt','고객사: 테스트 카페\n메뉴보드 6대 도입과 본사 원격 메뉴 관리.','text/plain');
 textCase('I02','emoji and supplementary Unicode survive','unicode.txt','한국어 😀 日本語 English\n예산 미정·설치 조건 확인.','text/plain');
 textCase('I03','markdown headings and CRLF preserve full input','requirements.md','# 사업 A\r\n## 설치\r\n매장 3곳 설치.\r\n# 사업 B\r\n회의실 장비 교체.','text/markdown');
 textCase('I04','quoted CSV keeps embedded punctuation','requirements.csv','고객,요구,예산\n카페,"6대, 3곳",미정\n회의실,교체,"2,000만원"','text/csv');
 textCase('I05','large RFP retains the source beyond 20000 chars','long.md','# 고객 요구\n'+('운영 조건과 설치 위치를 현장 조사로 확인한다.\n'.repeat(1200)),'text/markdown');
 textCase('I06','JSON source is not interpreted or fabricated','input.json',JSON.stringify({project:'실행 검증',details:['네트워크 검토','운영 교육'],budget:null}),'application/json');
 const actualFile=async(relative,mime,fn)=>{
  const bytes=fs.readFileSync(path.join(root,relative)).toString('base64');return page.evaluate(async({bytes,name,mime,mode})=>{
   const buffer=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0));const file=new File([buffer],name,{type:mime});const {readAttachments}=await import('/src/services/attachments.js');const {parseFiles}=await import('/src/domain/review/parse.js');
   if(mode==='reader'){const start=performance.now();const r=(await readAttachments([file],{full:true,rich:true}))[0];return{...r,ms:performance.now()-start};}
   const start=performance.now();const normal=await parseFiles([file]);const fullMs=performance.now()-start;
   const then=performance.now();const fast=await parseFiles([file],undefined,{textOnly:true});return{normalText:normal.units.map(u=>u.text),fastText:fast.units.map(u=>u.text),normalImages:normal.images?.length||0,fastImages:fast.images?.length||0,fullMs,fastMs:performance.now()-then};
  },{bytes,name:path.basename(relative),mime,mode:fn});
 };
 report.case('I07','actual PPTX extracts every visible slide',async d=>{const r=await actualFile('app/tests/fixtures/strict/review-source.pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation','reader');ok(!r.readError&&r.fullText.length>300&&r.fullText.includes('## '),'PPTX source extraction failed');d.characters=r.extractedChars;d.ms=r.ms;});
 report.case('I08','actual DOCX extracts source paragraphs',async d=>{const r=await actualFile('app/tests/fixtures/strict/review-source.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','reader');ok(!r.readError&&r.fullText.trim(),'DOCX source extraction failed');d.characters=r.extractedChars;d.ms=r.ms;});
 report.case('I09','PDF text-only mode matches rendered text without raster work',async d=>{
  const r=await actualFile('app/tests/fixtures/strict/review-source.pdf','application/pdf','compare');eq(r.fastText,r.normalText,'text extraction fidelity');ok(r.normalImages>0&&r.fastImages===0,'RFP fast path avoids rasterizing pages');ok(r.fastMs<=r.fullMs*1.1+250,'text-only performance regression');Object.assign(d,{pages:r.fastText.length,rendered_ms:r.fullMs,text_only_ms:r.fastMs,speedup:r.fullMs/r.fastMs});
 });
 report.case('I10','corrupt PDF preserves metadata and a readable error',async d=>{
  const r=await page.evaluate(async()=>{const {readAttachments}=await import('/src/services/attachments.js');return(await readAttachments([new File(['not a pdf'],'broken.pdf',{type:'application/pdf'})],{full:true,rich:true}))[0];});eq(r.text,'','no fake text');ok(r.readError&&r.readError.length>5,'diagnostic missing');d.error=r.readError;
 });
 report.case('I11','unsupported HWP does not fabricate extracted requirements',async d=>{
  const r=await page.evaluate(async()=>{const {readAttachments}=await import('/src/services/attachments.js');return(await readAttachments([new File(['binary'],'document.hwp')],{full:true,rich:true}))[0];});eq(r.text,'','no fabricated fallback');ok(r.readError.includes('지원하지'),'unsupported format explained');d.error=r.readError;
 });
 report.case('I12','oversized file is rejected before allocating/parsing its body',async d=>{
  const r=await page.evaluate(async()=>{const {readAttachments}=await import('/src/services/attachments.js');let touched=false;const input={name:'large.pdf',size:61*1024*1024,type:'application/pdf',arrayBuffer:async()=>{touched=true;throw Error('body must not be read');}};return{file:(await readAttachments([input],{full:true,rich:true}))[0],touched};});ok(!r.touched,'oversize body read');eq(r.file.text,'','no partial text');ok(r.file.readError.includes('60MB'),'size limit diagnostic');d.error=r.file.readError;
 });
 const result=await report.run();console.log(JSON.stringify(result.counts));if(!result.meetsMinimum)process.exitCode=1;
}finally{if(context)await context.close();await browser.close();await vite.close();}
