import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {launch,freeze,settle,nav,origin,output,root,assert} from './helpers.mjs';
const require=createRequire(new URL('../web/package.json',import.meta.url));const JSZip=require('jszip');
const folder=path.join(output,'documents');fs.mkdirSync(folder,{recursive:true});
const zip=new JSZip();
zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>테스트 커피 디지털 메뉴보드 제안서</w:t></w:r></w:p><w:p><w:r><w:t>QM55C 55인치 디스플레이 3대와 MagicINFO로 본사에서 콘텐츠를 운영합니다.</w:t></w:r></w:p></w:body></w:document>');
const docx=path.join(folder,'review.docx');fs.writeFileSync(docx,await zip.generateAsync({type:'nodebuffer'}));
execFileSync('soffice',['--headless','--convert-to','pdf','--outdir',folder,path.join(root,'build/fixtures/review_sample.pptx')],{stdio:'ignore',timeout:120000});
const pdf=path.join(folder,'review_sample.pdf');
const browser=await launch();const results=[];
try{
  for(const [file,kind]of [[pdf,'pdf'],[docx,'docx'],[path.join(root,'build/fixtures/review_sample.pptx'),'pptx']]){
    const context=await browser.newContext({viewport:{width:1500,height:900}});await freeze(context);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    try{
      await page.goto(origin+'/');await settle(page);await nav(page,'.sb-rv');await page.locator('input[type=file]').setInputFiles(file);await page.waitForFunction(()=>document.querySelector('.rv-report')||document.querySelector('.rv-msg.bad'),{timeout:90000});
      assert(!await page.locator('.rv-msg.bad').count(),await page.locator('.rv-body').innerText());
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('winmate.v2.reviews')||'[]').some(r=>!r.demo&&r.status==='done'));
      const review=await page.evaluate(()=>JSON.parse(localStorage.getItem('winmate.v2.reviews')).find(r=>!r.demo));
      assert(review.kind===kind,`actual ${kind} parser used`);assert(review.units.length>0,'actual document units');assert(errors.length===0,errors.join(' | '));
      results.push({file:path.basename(file),kind,units:review.units.length,status:review.status,consoleErrors:errors});console.log('PASS',kind,review.units.length,'units');
    }finally{await context.close();}
  }
}finally{await browser.close();fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(results,null,2));}
