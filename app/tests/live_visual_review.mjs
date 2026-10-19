/** Ten actual multimodal reviews with explicit user-selected criteria; no model substitutes. */
import fs from 'node:fs';import path from 'node:path';import {launch,settle,root,output,assert}from'./helpers.mjs';
const url=process.env.WINMATE_LIVE_WEB||'http://127.0.0.1:5177';const folder=path.join(output,'strict/visual-review',process.env.LIVE_RUN||'final');fs.mkdirSync(folder,{recursive:true});const cases=JSON.parse(fs.readFileSync(path.join(root,'app/tests/fixtures/strict/live-cases.json')));const browser=await launch();const page=await browser.newPage({viewport:{width:1500,height:900}});let rows=[];const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 for(let i=0;;i++){try{const r=await fetch(url+'/api/health');if(r.ok&&(await r.json()).llm_mode==='real')break;}catch{}if(i>200)throw Error('API not ready');await new Promise(r=>setTimeout(r,250));}
 await page.goto(url);await settle(page);
 for(let offset=0;offset<cases.length;offset+=2)await Promise.all(cases.slice(offset,offset+2).map(async(c,index)=>{
  const start=Date.now();let row={case:c.id,pass:false};
  try{
   const r=await page.evaluate(async({c,index})=>{
    const {postJson,requestJson}=await import('/src/api/client.js');const {SIM_CRIT}=await import('/src/domain/simulation/score.js');const images=[];
    for(const unit of c.review_doc.units.slice(0,2)){
     const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const x=canvas.getContext('2d');x.fillStyle='white';x.fillRect(0,0,1280,720);x.fillStyle='#1428a0';x.fillRect(0,0,1280,90);x.fillStyle='white';x.font='bold 36px "Noto Sans KR"';x.fillText(unit.title,50,60);x.fillStyle='#222';x.font='28px "Noto Sans KR"';let y=150;
     for(const para of unit.text.split('\n')){let line='';for(const ch of para){if(x.measureText(line+ch).width>1160){x.fillText(line,50,y);y+=42;line='';}line+=ch;}if(line){x.fillText(line,50,y);y+=42;}}
     images.push({sheet:unit.n,data_url:canvas.toDataURL('image/png')});
    }
    const criteria=[['CU1','DS4','DS7'],['CU4','DS1','DS6'],['PR3','DS4','WR5'],['VS6','DS4','DS7'],['MK3','DS4','WR1']][index%5];
    const snap=await postJson('/api/jobs',{kind:'review',doc:c.review_doc,images,criteria,context:{title:c.proposal.title,customer:c.company},budget:4,min_k:4});
    for(let n=0;n<600;n++){const job=await requestJson('/api/jobs/'+snap.id);if(job.status==='error')throw Error(JSON.stringify(job.error));if(job.status==='done')return{job,criteria};await new Promise(r=>setTimeout(r,250));}throw Error('visual review timeout');
   },{c,index:offset+index});
   const result=r.job.result;assert(result.llm.effective==='llm','actual score mode');assert(result.llm.models_used.includes('gemini-3.8-flash'),'vision model actually used');assert(result.conversion.visual.llm_calls>0,'pixels reviewed');assert(result.llm.steps['review:score_vision']>0,'visual criteria scored using pixels, not just text');assert(result.evaluation.route.mode==='forced','user criteria honored');const ids=result.evaluation.scores.map(s=>s.id);assert(JSON.stringify([...ids].sort())===JSON.stringify([...r.criteria].sort()),'selected criteria exactly match');assert(result.evaluation.scores.every(s=>s.mode==='llm'&&[1,2,3].includes(s.score)),'no rule scores');
   fs.writeFileSync(path.join(folder,c.id+'.json'),JSON.stringify(result,null,2));row={...row,pass:true,seconds:(Date.now()-start)/1000,criteria:r.criteria,models:result.llm.models_used,visual:result.conversion.visual};
  }catch(e){row={...row,error:String(e.stack||e),seconds:(Date.now()-start)/1000};}
  rows.push(row);fs.writeFileSync(path.join(folder,'progress.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(row));
 }));
}catch(e){errors.push(String(e));}finally{await browser.close();}
const report={actual_gemini:true,cases:rows,passed:rows.filter(r=>r.pass).length,total:rows.length,errors};fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,total:report.total,errors}));if(report.passed!==10||errors.length)process.exitCode=1;
