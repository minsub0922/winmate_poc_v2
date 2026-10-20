#!/usr/bin/env node
// Record the real routed application through browser interactions. Never render
// a replica, inject UI markup, replace screen text, or modify application CSS.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { GUIDES } from '../web/src/domain/guides/catalog.js';
import { createRecordingSession } from './guide-recording-session.mjs';
import { recordGuideStep } from './guide-recording-actions.mjs';
const sharp=createRequire(new URL('../web/package.json',import.meta.url))('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.join(root,'app/web/public/assets/guides'),evidence=path.join(root,'app/tests/output/guide-recordings');
const manifestFile=path.join(root,'app/web/src/domain/guides/media.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'winmate-guide-frames-'));
const width=880,height=520,fps=10,duration=4.8;
const selected=process.argv.find(arg=>arg.startsWith('--guide='))?.split('=')[1];
const selectedPage=Number(process.argv.find(arg=>arg.startsWith('--page='))?.split('=')[1]||0);
const selectedPages=new Set((process.argv.find(arg=>arg.startsWith('--pages='))?.split('=')[1]||'').split(',').filter(Boolean).map(Number));
const pendingOnly=process.argv.includes('--pending-only');
fs.mkdirSync(output,{recursive:true});fs.mkdirSync(evidence,{recursive:true});
const run=args=>new Promise((resolve,reject)=>{const child=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:['ignore','ignore','pipe']});let log='';child.stderr.on('data',data=>log+=data);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(log)));});
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
let session;
try{
 session=await createRecordingSession();
 const cursor=path.join(temporary,'cursor.png');
 await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="27" height="34"><path d="M3 2v25l6-6 5 11 5-3-5-10h10z" fill="#182031" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>')).png().toFile(cursor);
 for(const guide of GUIDES.filter(guide=>!selected||guide.id===selected)){
  manifest[guide.id] ||= [];
  for(let index=0;index<guide.steps.length;index++){
   if(selectedPage&&selectedPage!==index+1)continue;
   if(selectedPages.size&&!selectedPages.has(index+1))continue;
   if(pendingOnly&&manifest[guide.id][index]?.source==='actual-application')continue;
   const stem=guide.id+'-'+String(index+1).padStart(2,'0'),work=path.join(temporary,stem);fs.mkdirSync(work);
   const states=[],points=[];
   console.log('Recording actual app:',stem,guide.steps[index].title);
   await recordGuideStep(session,guide,guide.steps[index],index,async(phase,point,label)=>{
    const provenance=await session.page.evaluate(async label=>{
     const app=document.querySelector('.app');
     if(!app||!document.querySelector('main.main')||document.querySelector('.guide-overlay,[id="guide-capture"],[class^="guide-ui-"]'))throw new Error('Only an actual application page may be recorded');
     const ui=JSON.parse(localStorage.getItem('winmate.v2.ui')||'{}'),{getProposal}=await import('/src/repositories/proposals.js'),p=getProposal(ui.route?.id);
     return {screen:label,path:location.pathname,route:ui.route?.name,dialogs:[...document.querySelectorAll('[role=dialog]')].map(el=>el.getAttribute('aria-label')||el.querySelector('h2')?.textContent||''),stage:p?.stage,parts:p?.parts?.filter(part=>!part.deck).length,linked:p?Object.values(p.ctx).flat().length:undefined,requirements:p?.req?.free?.map(s=>s.t||'').join('')};
    },label);
    const screenshot=await session.page.screenshot({animations:'disabled'});
    const frame=await sharp(screenshot).resize(width,height).png().toBuffer();
    fs.writeFileSync(path.join(work,phase+'.png'),frame);
    states.push({...provenance,sha256:hash(frame)});points.push({x:point.x*width/1320,y:point.y*height/780});
   });
   const timing=[.6,1.2,2.3,2.9,4,4.6].map(t=>+(t*duration/6).toFixed(2));
   const expression=(a,b,c)=>`if(lt(t,${timing[0]}),${a-40},if(lt(t,${timing[1]}),${a-40}+40*(t-${timing[0]})/(${timing[1]}-${timing[0]}),if(lt(t,${timing[2]}),${a},if(lt(t,${timing[3]}),${a}+(${b}-${a})*(t-${timing[2]})/(${timing[3]}-${timing[2]}),if(lt(t,${timing[4]}),${b},if(lt(t,${timing[5]}),${b}+(${c}-${b})*(t-${timing[4]})/(${timing[5]}-${timing[4]}),${c}))))))`;
   const segment=duration/3;
   const filter=`[0:v]trim=duration=${segment},setpts=PTS-STARTPTS[a];[1:v]trim=duration=${segment},setpts=PTS-STARTPTS[b];[2:v]trim=duration=${segment},setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0[app];[app][3:v]overlay=x='${expression(...points.map(p=>p.x))}':y='${expression(...points.map(p=>p.y))}':shortest=1,fps=${fps},split[p][v];[p]palettegen=max_colors=192:stats_mode=diff[pal];[v][pal]paletteuse=dither=none:diff_mode=rectangle`;
   const dest=path.join(work,'clip.gif');
   await run(['-threads','1',...['0','1','2'].flatMap(n=>['-loop','1','-framerate',String(fps),'-i',path.join(work,n+'.png')]),'-loop','1','-framerate',String(fps),'-i',cursor,'-filter_complex_threads','1','-filter_complex',filter,'-t',String(duration),'-gifflags','+transdiff','-loop','0',dest]);
   const bytes=fs.readFileSync(dest),name=stem+'-'+hash(bytes).slice(0,10);
   fs.copyFileSync(dest,path.join(output,name+'.gif'));await sharp(path.join(work,'0.png')).webp({quality:82}).toFile(path.join(output,name+'.webp'));
   const thumbs=await Promise.all([0,1,2].map(phase=>sharp(path.join(work,phase+'.png')).resize(440,260).toBuffer()));
   await sharp({create:{width:1320,height:260,channels:3,background:'#fff'}}).composite(thumbs.map((input,i)=>({input,left:i*440,top:0}))).png().toFile(path.join(evidence,stem+'.png'));
   const clip={src:'/assets/guides/'+name+'.gif',poster:'/assets/guides/'+name+'.webp',width,height,fps,duration:duration*1000,bytes:bytes.length,source:'actual-application',recordedViewport:{width:1320,height:780},states};
   manifest[guide.id][index]=clip;
   const current=JSON.parse(fs.readFileSync(manifestFile));current[guide.id][index]=clip;
   const next=manifestFile+'.'+process.pid+'.tmp';fs.writeFileSync(next,JSON.stringify(current,null,2)+'\n');fs.renameSync(next,manifestFile);
  }
 }
 if(session.errors.length)throw new Error('Runtime errors in recorded application: '+session.errors.join('\n'));
 const clips=Object.values(manifest).flat();console.log(`Complete: ${clips.filter(c=>c.source==='actual-application').length}/${clips.length} actual application GIFs, ${(clips.reduce((n,c)=>n+c.bytes,0)/1048576).toFixed(2)} MiB`);
}catch(error){await session?.page.screenshot({path:path.join(evidence,'failure.png'),animations:'disabled'}).catch(()=>{});throw error;}
finally{await session?.close();fs.rmSync(temporary,{recursive:true,force:true});}
