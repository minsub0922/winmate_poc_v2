// Check native circles and circular photo crops in every exported scenario.
import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {SCENARIOS,slidesOfScenario} from '../web/src/domain/templates/scenarios.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(root+'/app/web/package.json'),JSZip=require('jszip'),out=root+'/output/layout-review';
const report={decks:0,slides:0,circles:0,circularPictures:0,nextStepCircles:0,questionAnswerCircles:0,distorted:[],missing:[]};
for(const scenario of SCENARIOS){const zip=await JSZip.loadAsync(await fs.readFile(root+'/output/rebuild-existing/decks/'+scenario.id+'.pptx'));report.decks++;
 for(const [k,slide]of slidesOfScenario(scenario).entries()){const xml=await zip.file('ppt/slides/slide'+(k+1)+'.xml').async('string');report.slides++;const circles=[];
 for(const m of xml.matchAll(/<p:(sp|pic)>([\s\S]*?)<\/p:\1>/g)){if(!/<a:prstGeom\b[^>]*prst="ellipse"/.test(m[2]))continue;const size=/<a:ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(m[2]);assert.ok(size);const w=Number(size[1])/9525,h=Number(size[2])/9525;if(Math.abs(w-h)>1.5)report.distorted.push({id:scenario.id,page:k+1,kind:m[1],w,h});if(m[1]==='sp'){report.circles++;circles.push({w,h});}else report.circularPictures++;}
 if(slide.f==='L_PH_C13'){const proper=circles.filter(c=>Math.abs(c.w-34)<.5&&Math.abs(c.h-34)<.5);if(proper.length!==3)report.missing.push({id:scenario.id,page:k+1,expected:3,actual:proper.length});report.nextStepCircles+=proper.length;}
 if(slide.f==='L_PH_CP_G')assert.ok(circles.some(c=>Math.abs(c.w-148)<.5&&Math.abs(c.h-148)<.5),'Percentage-radius frame must remain a native circle');
 if(slide.f==='L_PH_QA_A'){const proper=circles.filter(c=>Math.abs(c.w-28)<.5&&Math.abs(c.h-28)<.5);assert.equal(proper.length,12);report.questionAnswerCircles+=proper.length;}
 }}
assert.equal(report.decks,82);assert.equal(report.slides,1305);assert.equal(report.nextStepCircles,180);assert.equal(report.questionAnswerCircles,12);assert.ok(report.circularPictures>=6);assert.deepEqual(report.distorted,[]);assert.deepEqual(report.missing,[]);
await fs.writeFile(out+'/pptx-shapes.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
