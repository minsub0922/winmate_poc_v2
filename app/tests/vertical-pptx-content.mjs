// Confirm that every authored field and presenter note survives editable PPTX export.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const require=createRequire(path.join(root,'app/web/package.json')),JSZip=require('jszip');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const std=await read('app/web/src/domain/templates/description_standard_scenarios.json'),best=await read('app/web/src/domain/templates/vertical_scenarios.json');
const account=await read('app/web/src/domain/templates/account_scenarios.json');
const report={dataSha256:createHash('sha256').update(JSON.stringify({std,best})).digest('hex'),decks:0,slides:0,texts:0,missing:[],notesMissing:[]};
const unescape=s=>s.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,v=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[v]??String.fromCodePoint(v.startsWith('&#x')?parseInt(v.slice(3,-1),16):parseInt(v.slice(2,-1),10))));
const norm=s=>String(s).normalize('NFC').replace(/\s/g,'');
const runs=xml=>[...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(m=>unescape(m[1]));
for(const [id,pages] of Object.entries({...std.fills,...best.fills,...account.fills})){
 const zip=await JSZip.loadAsync(await fs.readFile(path.join(root,'output/rebuild-existing/decks',id+'.pptx')));
 report.decks++;
 for(let i=0;i<pages.length;i++){
  const slide=await zip.file('ppt/slides/slide'+(i+1)+'.xml').async('string'),texts=runs(slide),joined=norm(texts.join(''));
  report.slides++;report.texts+=texts.length;
  for(const [field,value] of Object.entries(pages[i].t)){
   const plain=typeof value==='object'?unescape(value.html.replace(/<[^>]*>/g,'')):String(value);
   if(norm(plain).length>2&&!joined.includes(norm(plain)))report.missing.push({id,page:i+1,field,text:plain});
  }
  const note=pages[i].notes;
  if(note){const file=zip.file('ppt/notesSlides/notesSlide'+(i+1)+'.xml');if(!file||!norm(runs(await file.async('string')).join('')).includes(norm(note)))report.notesMissing.push({id,page:i+1});}
 }
}
await fs.writeFile(path.join(root,'output/rebuild-existing/pptx-content.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));assert.deepEqual(report.missing,[]);assert.deepEqual(report.notesMissing,[]);
