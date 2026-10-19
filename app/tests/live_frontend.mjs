/** Real UI services → actual local Gemini endpoint. No mocked responses or offline switches. */
import fs from 'node:fs';import path from 'node:path';
import {launch,settle,root,output,assert} from './helpers.mjs';
const url=process.env.WINMATE_LIVE_WEB||'http://127.0.0.1:5173';
const cases=JSON.parse(fs.readFileSync(path.join(root,'app/tests/fixtures/strict/live-cases.json'),'utf8')).slice(0,Number(process.env.LIVE_LIMIT||10));
const features=(process.env.LIVE_FRONT_FEATURES||'part,fill,rerank,customer,debrief,json,text,vision').split(',');
const folder=path.join(output,'strict/live-frontend',process.env.LIVE_RUN||'final');fs.mkdirSync(folder,{recursive:true});
const browser=await launch();const context=await browser.newContext({viewport:{width:1500,height:900}});const page=await context.newPage();page.setDefaultTimeout(180000);
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const rows=[];
try{
 for(let n=0;;n++){try{const health=await fetch(url+'/api/health');if(health.ok&&(await health.json()).llm_mode==='real')break;}catch{}if(n>=120)throw new Error('real API not ready');await new Promise(r=>setTimeout(r,250));}
 await page.goto(url+'/');await settle(page);
 await page.evaluate(()=>{window.__strictCases={sims:{}};});
 for(const feature of features){
  // Keep resource use bounded while still testing parallel model calls.
  for(let offset=0;offset<cases.length;offset+=2){
   await Promise.all(cases.slice(offset,offset+2).map(async(c,k)=>{
    const index=offset+k;const start=performance.now();let result;
    try{
     result=await page.evaluate(async({feature,c,index})=>{
      const ai=await import('/src/services/ai.js');const cat=await import('/src/services/catalog.js');
      const proof={feature,case:c.id};const check=(ok,message)=>{if(!ok)throw new Error(message);};
      if(feature==='part'){
       const types=['challenge','value','products','execution','effect','solution','case','customer','spec','cost'];
       const part={...c.proposal.parts[0],type:types[index%types.length],name:c.topic+' 핵심 내용',items:[]};
       const r=await ai.aiPartItems(c.proposal,part);check(r.ai&&r.items?.length>=3,'part output: '+JSON.stringify(r));
       check(r.items.every(x=>x.trim()&&x.length<=40),'part length exceeds 40: '+JSON.stringify(r.items));
       return {...proof,items:r.items.length,content:r.items};
      }
      if(feature==='fill'){
       const {readBlocks}=await import('/src/domain/slides/Slide.jsx');
       const types=['overview','products','case','execution','effect','market','challenge','dss','solution','spec'];
       const meta=cat.LAYOUTS.find(l=>l.p===types[index%types.length]&&readBlocks(l.f,{}).length>=4);
       check(meta,'no suitable actual layout');const base=readBlocks(meta.f,{}).slice(0,16);const title=base.filter(b=>b.s.length>8&&b.fs>=18).sort((a,b)=>b.fs-a.fs)[0]||base.find(b=>b.s.length>8);check(title,'no editable heading');const ov={t:{[title.i]:'샘플 고객 A의 예전 제안 내용과 기대효과'}};const blocks=readBlocks(meta.f,ov).slice(0,16);
       const r=await ai.aiFill(meta,blocks,c.proposal,{customer:c.company,project:c.proposal.title,productsList:[c.product]},{sources:[{sid:'S1',k:'rfp',title:c.proposal.title,body:c.text}]});
       check(r.ai&&r.changes?.length>0,'empty/failed fill: '+JSON.stringify(r));
       for(const x of r.changes){const original=blocks.find(b=>b.i===x.i);check(original&&x.from===original.s,'unknown block index');check(x.to?.trim()&&x.to!==x.from,'unchanged/empty generated text');check(x.to.length<=Math.max(4,Math.round(original.s.length*1.35)),'overflow at block '+x.i+': '+x.to);check((x.src||[]).every(s=>s==='S1'),'fabricated citation');}
       return {...proof,layout:meta.f,changes:r.changes.length,content:r.changes};
      }
      if(feature==='rerank'){
       const {searchLayouts}=await import('/src/services/search.js');const candidates=searchLayouts(c.queries,{ind:c.industry,products:[c.product],solutions:[]},{limit:20});
       check(candidates.length>0,'candidate retrieval empty');const r=await ai.aiRerank(c.queries,candidates);
       check(r.ai&&r.order?.length,'rerank failed: '+JSON.stringify(r));const ids=new Set(candidates.map(x=>x.l.f));check(r.order.every(x=>ids.has(x.f)&&x.why),'invalid reranked reference');check(new Set(r.order.map(x=>x.f)).size===r.order.length,'duplicate rank');
       return {...proof,items:r.order.length,content:r.order};
      }
      if(feature==='customer'||feature==='debrief'){
       const profile=await import('/src/domain/simulation/profile.js');const repo=await import('/src/repositories/simulations.js');const engine=await import('/src/domain/simulation/engine.js');
       let sim=window.__strictCases.sims[c.id];
       if(!sim){const setup=profile.setupFromProposal(c.proposal);sim=repo.newSim(setup,(index%3)+1);sim.msgs=index%3===0?[]:[{who:'me',segs:[{t:'현장 운영에서 가장 시간이 걸리는 작업이 무엇인가요? '+c.text.slice(0,100)}]}];}
       if(feature==='customer'){
        let streamed=0;const r=await engine.customerTurn(sim,{onText:()=>streamed++});
        check(r.ai===true&&typeof r.text==='string'&&r.text.trim(),'missing actual model reply');check(!r.text.includes('<<<EVAL>>>'),'evaluation leaked into customer dialogue');check(r.ev&&Number.isFinite(r.ev.satisfaction)&&r.ev.satisfaction>=0&&r.ev.satisfaction<=100,'invalid model evaluation');
        if(sim.msgs.length)check(r.ev.scores&&Object.keys(r.ev.scores).length>0,'follow-up has no real evaluation');
        sim.msgs.push({who:'cust',text:r.text});sim.cur={...sim.cur,...r.ev};window.__strictCases.sims[c.id]=sim;
        return {...proof,characters:r.text.length,streamed,retried:r.retried||false,content:{text:r.text,ev:r.ev}};
       }
       if(!sim.msgs.length)sim.msgs.push({who:'me',segs:[{t:'현장 조사로 설치 조건을 확인한 뒤 파일럿으로 효과를 측정하겠습니다.'}]});
       const r=await engine.debrief(sim);check(r.ai===true&&r.verdict&&r.good?.length&&r.improve?.length&&r.next,'incomplete Gemini coaching: '+JSON.stringify(r));return {...proof,content:r};
      }
      const sample=await ai.getSample('llm');
      if(feature==='json'){
       const r=await sample.json(`다음 합성 사업 데이터를 JSON으로 정확히 추출하세요. {case_id,customer,product,confirmed:boolean} 형태. case_id=${c.id}, customer=${c.company}, product=${c.model}. 이 세 값만 사용하고 confirmed=true.`,{responseSchema:{type:'OBJECT',properties:{case_id:{type:'STRING'},customer:{type:'STRING'},product:{type:'STRING'},confirmed:{type:'BOOLEAN'}},required:['case_id','customer','product','confirmed']}});
       check(r.case_id===c.id&&r.customer===c.company&&r.product===c.model&&r.confirmed===true,'structured extraction mismatch: '+JSON.stringify(r));return {...proof,content:r};
      }
      if(feature==='text'){
       let streamed=0,first=null;const begin=performance.now();const r=await sample([{role:'system',content:'요청된 합성 사업에 대해 사실만 간결하게 설명하세요.'},{role:'user',content:`식별자 ${c.id}를 첫 줄에 그대로 적고 다음 요구의 확인 질문 두 가지를 150자 이내 한국어로 적으세요: ${c.text.slice(0,300)}`}],{onText:()=>{streamed++;first??=performance.now()-begin;}});
       check(typeof r==='string'&&r.includes(c.id)&&r.length>20,'text contract failed');check(streamed>0,'no SSE text');return {...proof,streamed,first_text_ms:Math.round(first),content:r};
      }
      if(feature==='vision'){
       const colors=['red','blue','green','yellow','purple','orange','black','pink','brown','gray'];const color=colors[index%colors.length];const count=(index%5)+1;const canvas=document.createElement('canvas');canvas.width=360;canvas.height=150;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,360,150);ctx.fillStyle=color;
       for(let n=0;n<count;n++){ctx.beginPath();ctx.arc(35+60*n,75,20,0,Math.PI*2);ctx.fill();}
       const palette=document.createElement('canvas');palette.width=500;palette.height=200;const pg=palette.getContext('2d');pg.fillStyle='white';pg.fillRect(0,0,500,200);pg.font='16px Arial';
       colors.forEach((name,i)=>{const x=(i%5)*100,y=Math.floor(i/5)*100;pg.fillStyle=name;pg.fillRect(x+10,y+5,75,58);pg.fillStyle='black';pg.fillText(name,x+10,y+86);});
       const r=await sample.json('첫 이미지의 원 개수를 세세요. 첫 이미지 원의 색을 둘째 이미지의 이름 붙은 참조 팔레트와 직접 비교해, 같은 색상의 영어 이름을 답하세요. 자연어 색상 추측 대신 참조 팔레트 이름을 그대로 사용합니다. JSON {count:정수,color:영어소문자}.',{images:[canvas.toDataURL('image/png'),palette.toDataURL('image/png')],responseSchema:{type:'OBJECT',properties:{count:{type:'INTEGER'},color:{type:'STRING',enum:colors}},required:['count','color']}});
       check(r.count===count&&r.color===color,'vision mismatch '+JSON.stringify({expected:{count,color},received:r}));return {...proof,content:r};
      }
      throw new Error('unknown feature '+feature);
     },{feature,c,index});
     rows.push({feature,case:c.id,pass:true,seconds:(performance.now()-start)/1000,result});
    }catch(error){rows.push({feature,case:c.id,pass:false,seconds:(performance.now()-start)/1000,error:String(error.stack||error)});}
    fs.writeFileSync(path.join(folder,'progress.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.at(-1)));
   }));
  }
 }
}catch(e){errors.push(String(e.stack||e));}
finally{await browser.close();}
const summary={};for(const f of features){const group=rows.filter(x=>x.feature===f);const t=group.map(x=>x.seconds).sort((a,b)=>a-b);summary[f]={cases:group.length,passed:group.filter(x=>x.pass).length,failed:group.filter(x=>!x.pass).length,p50_s:t[Math.floor(t.length*.5)],p95_s:t[Math.min(t.length-1,Math.floor(t.length*.95))]};}
fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify({actual_gemini:true,summary,cases:rows,errors},null,2));console.log(JSON.stringify({summary,errors},null,2));if(errors.length||rows.some(x=>!x.pass)||rows.length!==features.length*cases.length)process.exitCode=1;
