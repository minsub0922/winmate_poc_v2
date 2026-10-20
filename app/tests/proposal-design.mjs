// Content/slot compatibility and preservation of source conditions in editable
// exports after the visual redesign. Run after the two whole-deck export tests.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {migrateProposalDesign} from '../web/src/domain/slides/proposal-design.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'app/web/package.json')),JSZip=req('jszip');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const html=async p=>JSON.parse(zlib.gunzipSync(await fs.readFile(path.join(root,p))));
const old=await read('output/proposal-design/before/standards.json'),now=await read('app/web/src/domain/templates/description_standard_scenarios.json');
const oldBest=await read('output/proposal-design/before/best.json'),best=await read('app/web/src/domain/templates/vertical_scenarios.json');
const a=await html('output/proposal-design/before/layouts.json.gz'),b=await html('app/data/description-standard-html.json.gz');
assert.deepEqual(now.fills,old.fills,'all standard content, image bindings and slot identities');
assert.deepEqual(now.scenarios.map(s=>s.flow),old.scenarios.map(s=>s.flow),'standard order and stage composition');
assert.deepEqual(Object.keys(b).sort(),Object.keys(a).sort(),'existing layout IDs');
const slots=(html,kind)=>[...html.matchAll(new RegExp(`data-${kind}="(\\d+)"`,'g'))].map(m=>m[1]).sort();
for(const f of Object.keys(b)){
 assert.match(b[f],/data-proposal-design="winmate-2"/);
 for(const kind of ['tb','img'])assert.deepEqual(slots(b[f],kind),slots(a[f],kind),f+' '+kind);
 assert.ok(!b[f].includes('data-desc-photo-note'),f+' repeated photo badges removed');
}
for(const s of best.scenarios){
 assert.deepEqual(s.flow,oldBest.scenarios.find(x=>x.id===s.id).flow);
 for(let k=0;k<best.fills[s.id].length;k++){
  const {design,...content}=best.fills[s.id][k];assert.equal(design,'winmate-2');assert.deepEqual(content,oldBest.fills[s.id][k]);
 }
}
const edited={scenario:'bs_v_ai_apartment_1',parts:[{layouts:[{f:'L_PH_P_I',ov:{t:{1:'고객이 편집한 제목'},img:{0:{src:'custom.jpg'}}}},{f:'L_MY_customer',ov:{t:{1:'사용자 템플릿'}}}]}]};
const expected=structuredClone(edited);assert.equal(migrateProposalDesign(edited),true);assert.equal(migrateProposalDesign(edited),false);
assert.equal(edited.parts[0].layouts[0].ov.design,'winmate-2');delete edited.parts[0].layouts[0].ov.design;assert.deepEqual(edited,expected);
assert.equal(migrateProposalDesign({...edited,scenario:'bs01'}),false);
const decode=s=>s.replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/\s/g,'');
let notes=0,tables=0;
for(const s of now.scenarios){
 const zip=await JSZip.loadAsync(await fs.readFile(path.join(root,'output/description-standards/decks',s.id+'.pptx')));
 for(let k=0;k<now.fills[s.id].length;k++){
  const fill=now.fills[s.id][k],source=b[fill.f];
  const noteSlots=[...source.matchAll(/<div\b[^>]*data-tb="(\d+)"[^>]*>/g)].filter(m=>m[0].includes('data-proposal-note')).map(m=>m[1]);
  const noteFile=zip.file(`ppt/notesSlides/notesSlide${k+1}.xml`);
  for(const i of noteSlots){const text=fill.t[i],value=typeof text==='string'?text:text.html;assert.ok(decode(await noteFile.async('string')).includes(decode(value)),s.id+' '+(k+1)+' notes preserve source slot '+i);notes++;}
  const table=[...source.matchAll(/<div\b[^>]*data-desc-table="[^>]*style="([^"]+)"/g)];
  if(table.length){const xml=await zip.file(`ppt/slides/slide${k+1}.xml`).async('string');const grids=[...xml.matchAll(/<a:tblGrid>([\s\S]*?)<\/a:tblGrid>/g)];assert.equal(grids.length,table.length);
   for(let j=0;j<table.length;j++){const width=Number(/(?:^|;)\s*width:\s*([\d.]+)px/.exec(table[j][1])[1]);const emu=[...grids[j][1].matchAll(/<a:gridCol w="(\d+)"/g)].reduce((n,m)=>n+Number(m[1]),0);assert.ok(Math.abs(emu/9525-width)<.2,'native table follows the redesigned column width');tables++;}
  }
 }
}
const result={scenarios:60,standardSlides:867,bestSlides:560,layoutIdsPreserved:Object.keys(b).length,standardContentPreserved:true,bestContentPreserved:true,slotIdentitiesPreserved:true,oldCopiesKeepEdits:true,sourceNoteBlocks:notes,nativeTables:tables,
 designSha256:createHash('sha256').update(await fs.readFile(path.join(root,'app/web/src/domain/slides/proposal-design.js'))).digest('hex'),htmlSha256:createHash('sha256').update(await fs.readFile(path.join(root,'app/data/description-standard-html.json.gz'))).digest('hex')};
await fs.writeFile(path.join(root,'output/proposal-design/compatibility.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
