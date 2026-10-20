// Actual Gemini + isolated real login. Only synthetic guide questions; no model-response fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { GUIDE_QUESTIONS } from '../web/src/domain/guides/questions.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const authDir=fs.mkdtempSync(path.join(os.tmpdir(),'winmate-guide-live-'));
const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
const base='http://127.0.0.1:'+port;
let logs='',browser;
const server=spawn(path.join(root,'app/.venv/bin/python'),['-B','-m','uvicorn','app.tests.fixtures.guide_agent_server:app','--host','127.0.0.1','--port',String(port),'--no-access-log'],{cwd:root,env:{...process.env,WINMATE_GUIDE_TEST_AUTH_DIR:authDir,WINMATE_LLM_CACHE:'off'}});
server.stdout.on('data',chunk=>logs=(logs+chunk).slice(-4000));server.stderr.on('data',chunk=>logs=(logs+chunk).slice(-4000));
function parseGuideWire(raw,contentType) {
 if(!contentType.includes('text/event-stream'))return JSON.parse(raw);
 const frames=raw.replaceAll('\r\n','\n').split('\n\n').flatMap(frame=>{const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');return data?[JSON.parse(data)]:[];});
 const failure=frames.find(frame=>frame.type==='error');assert.equal(failure,undefined,JSON.stringify(failure));
 const text=frames.filter(frame=>frame.type==='text');assert.ok(text.length>0,'real provider text must arrive as SSE');assert.equal(frames.at(-1)?.type,'result');
 const result=frames.at(-1);assert.ok(result.answer.length<=360);assert.equal(text.at(-1).text.trim(),result.answer);result.streamChunks=text.length;return result;
}
async function readGuideReply(response){return parseGuideWire(await response.text(),response.headers()['content-type']||'');}
async function browserReply(page,index){await page.waitForFunction(i=>window.__guideWire?.[i]?.done,index,{timeout:90000});const record=await page.evaluate(i=>window.__guideWire[i],index);assert.equal(record.error,undefined,record.error);return parseGuideWire(record.raw,record.contentType);}
try {
 let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/auth/status')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert.ok(ready,logs);
 browser=await chromium.launch();const ctx=await browser.newContext({viewport:{width:1500,height:1000}});
 const login=await ctx.request.post(base+'/api/auth/login',{data:{username:'guide-test',password:'guide-agent-live-password'}});assert.equal(login.status(),200);
 const page=await ctx.newPage(),errors=[],payloads=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
   window.__guideWire=[];const nativeGuideFetch=window.fetch.bind(window);
   window.fetch=async(...args)=>{
     const response=await nativeGuideFetch(...args);
     const target=typeof args[0]==='string'?args[0]:args[0]?.url||args[0]?.href||'';
     if(new URL(target,location.href).pathname==='/api/guide/chat'&&response.headers.get('content-type')?.includes('text/event-stream')){
       const record={done:false,raw:'',contentType:response.headers.get('content-type')};window.__guideWire.push(record);
       void(async()=>{const reader=response.clone().body.getReader(),decoder=new TextDecoder();try{while(true){const {done,value}=await reader.read();record.raw+=decoder.decode(value||new Uint8Array(),{stream:!done});if(done)break;}}catch(error){record.error=error.name;}finally{record.done=true;reader.releaseLock();}})();
     }
     return response;
   };
 });

 let releaseFirst;const firstGate=new Promise(resolve=>releaseFirst=resolve);let firstSeen;const firstSeenPromise=new Promise(resolve=>firstSeen=resolve);
 let intercept=0,releaseLate,lateSeen,lateCompleted;const lateGate=new Promise(resolve=>releaseLate=resolve),lateSeenPromise=new Promise(resolve=>lateSeen=resolve),lateDone=new Promise(resolve=>lateCompleted=resolve);
 await page.route('**/api/guide/chat',async route=>{
   const n=++intercept;payloads.push(route.request().postDataJSON());
   if(n===1){firstSeen();await firstGate;await route.continue();return;}
   if(n===3){lateSeen();try{const response=await route.fetch({timeout:90000});const body=await readGuideReply(response);lateCompleted({status:response.status(),body});await lateGate;try{await route.fulfill({response});}catch{}}catch(error){lateCompleted({error:error.message});}return;}
   await route.continue();
 });
 await page.goto(base);await page.locator('.home[data-home-ready="true"]').waitFor();assert.equal(await page.locator('#guide-chat-toggle').count(),0);
 const before=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.endsWith('winmate.v2.ui')&&!k.endsWith('winmate.v2.activity-outbox'))));
 await page.locator('.sidebar').hover({position:{x:20,y:20}});await page.getByRole('button',{name:'사용 가이드',exact:true}).click({position:{x:18,y:19}});await page.locator('[data-topic="storyboard"]').click();await page.locator('.guide-dialog').waitFor();
 await page.getByRole('button',{name:'가이드 챗봇 열기',exact:true}).click();await page.locator('#guide-chat-popup').waitFor();assert.equal(await page.locator('.guide-chat-message').count(),1);assert.match(await page.locator('.guide-chat-message').innerText(),/가이드 에이전트.*무엇을/);assert.equal(await page.locator('.guide-chat-questions button').count(),5);assert.equal(await page.locator('.guide-dialog #guide-chat-toggle').count(),1);assert.equal(await page.locator('.guide-dialog #guide-chat-popup').count(),1);
 assert.equal(await page.locator('.guide-chat-intro .guide-chat-questions').count(),1);assert.equal(await page.locator('.guide-chat-feed .guide-chat-questions').count(),0);
 const initialGreeting=await page.locator('[data-chat-message="welcome"]').boundingBox(),initialQuestion=await page.locator('.guide-chat-questions button').first().boundingBox();
 await page.evaluate(()=>{window.__guideStreamLengths=[];new MutationObserver(()=>{const el=document.querySelector('.guide-chat-message[data-chat-status="streaming"] p');if(el?.textContent.length&&window.__guideStreamLengths.at(-1)!==el.textContent.length)window.__guideStreamLengths.push(el.textContent.length);}).observe(document.querySelector('#guide-chat-popup'),{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-chat-status']});});
 const input=page.getByRole('textbox',{name:'가이드 질문',exact:true});await input.fill('커서 이동 확인');await input.press('ArrowLeft');assert.equal(await page.locator('.guide-dialog').getAttribute('data-guide-step'),'1');await input.fill('');
 const response1=page.waitForResponse(r=>r.url().endsWith('/api/guide/chat')&&r.request().method()==='POST',{timeout:90000});await page.getByRole('button',{name:GUIDE_QUESTIONS.storyboard[4],exact:true}).click();await firstSeenPromise;
 await page.getByRole('button',{name:'다음 가이드 단계',exact:true}).click();assert.equal(await page.locator('.guide-dialog').getAttribute('data-guide-step'),'2');assert.equal(await page.locator('#guide-chat-popup').count(),1);releaseFirst();
 const firstResponse=await response1,first=await browserReply(page,0);assert.equal(firstResponse.status(),200,JSON.stringify(first));assert.equal(first.mode,'real');assert.equal(first.cached,false);assert.ok(first.model&&!first.model.includes('test'));assert.equal(first.target.guide_id,'storyboard');assert.ok([21,22].includes(first.target.page));
 await page.waitForFunction(pageNumber=>document.querySelector('.guide-dialog')?.dataset.guideStep===String(pageNumber),first.target.page);assert.ok((await page.locator('.guide-chat-message.assistant').last().innerText()).includes(first.answer.slice(0,30)));assert.equal(payloads[0].history.length,0);const afterGreeting=await page.locator('[data-chat-message="welcome"]').boundingBox(),afterQuestion=await page.locator('.guide-chat-questions button').first().boundingBox();assert.ok(Math.abs(initialGreeting.y-afterGreeting.y)<1);assert.ok(Math.abs(initialQuestion.y-afterQuestion.y)<1);assert.equal(await page.locator('.guide-chat-intro .guide-chat-questions button').count(),5);console.log('Observed streaming text lengths:',await page.evaluate(()=>window.__guideStreamLengths));
 await page.screenshot({path:'/tmp/winmate-guide-stream-reply.png'});
 console.log('PASS actual',first.model,`: PPTX question → Storyboard ${first.target.page}/23; guide navigation stays usable while waiting; ${first.streamChunks} real SSE text frames, ${first.answer.length} answer characters`);
 const response2=page.waitForResponse(r=>r.url().endsWith('/api/guide/chat')&&r.request().method()==='POST',{timeout:90000});await input.fill('제안서 검토에서 PDF 실제 화면은 최대 몇 장까지 확인하고 어디서 선택하나요?');await input.press('Enter');
 const secondResponse=await response2,second=await browserReply(page,1);assert.equal(secondResponse.status(),200,JSON.stringify(second));assert.equal(second.mode,'real');assert.equal(second.target.guide_id,'review');assert.equal(second.target.page,4);assert.match(second.answer,/4|네 장/);
 await page.waitForFunction(()=>document.querySelector('#guide-dialog-title')?.textContent==='제안서 검토');assert.equal(payloads[1].history.length,2);assert.equal(await page.locator('.guide-chat-questions button').count(),5);assert.equal(await page.locator('.guide-chat-questions button').first().innerText(),GUIDE_QUESTIONS.review[0]);
 console.log('PASS actual cross-guide answer → Review 4/8; conversation retained and five suggestions switch to review');
 await input.fill('저장되면 안 되는 입력');await page.getByRole('button',{name:'챗봇 닫기',exact:true}).click();assert.equal(await page.locator('#guide-chat-popup').count(),0);await page.getByRole('button',{name:'가이드 챗봇 열기',exact:true}).click();assert.equal(await page.locator('.guide-chat-message').count(),1);assert.equal(await input.inputValue(),'');
 const locationBefore=await page.locator('.guide-dialog').getAttribute('data-guide-step');await input.fill('공간 조감도에서 @로 제품을 지정하고 자연어로 배치를 바꾸려면 어떻게 하나요?');await input.press('Enter');await lateSeenPromise;await page.getByRole('button',{name:'챗봇 닫기',exact:true}).click();await page.getByRole('button',{name:'가이드 챗봇 열기',exact:true}).click();assert.equal(await page.locator('.guide-chat-message').count(),1);assert.equal(payloads[2].history.length,0);
 const late=await lateDone;releaseLate();await page.waitForTimeout(400);assert.equal(await page.locator('.guide-chat-message').count(),1);assert.equal(await page.locator('#guide-dialog-title').innerText(),'제안서 검토');assert.equal(await page.locator('.guide-dialog').getAttribute('data-guide-step'),locationBefore);
 await page.waitForTimeout(2700);const activity=await (await ctx.request.get(base+'/api/guide-test/events')).json();assert.ok(activity.events.length>0);const activityOutbox=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.endsWith('winmate.v2.activity-outbox'))));const activityText=JSON.stringify(activity)+JSON.stringify(activityOutbox);for(const request of payloads)assert.ok(!activityText.includes(request.message));assert.ok(!activityText.includes('가이드 질문 보내기'));assert.ok(!activityText.includes('가이드 챗봇'));
 assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>!k.endsWith('winmate.v2.ui')&&!k.endsWith('winmate.v2.activity-outbox')))),before);assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/winmate-guide-agent-desktop.png'});
 console.log('PASS close/reopen clears messages and draft immediately; late real response cannot restore history or navigate; no browser-data writes or chat-content activity records');await ctx.close();
 const guest=await browser.newContext({viewport:{width:390,height:844}}),m=await guest.newPage();await m.goto(base);await m.locator('.home[data-home-ready="true"]').waitFor();await m.getByRole('button',{name:'메뉴 열기',exact:true}).click();await m.getByRole('button',{name:'사용 가이드',exact:true}).click({position:{x:18,y:19}});await m.locator('[data-topic="storyboard"]').click();await m.locator('.guide-dialog').waitFor();await m.getByRole('button',{name:'가이드 챗봇 열기',exact:true}).click();await m.getByRole('button',{name:'다음 가이드 단계',exact:true}).click();assert.equal(await m.locator('.guide-dialog').getAttribute('data-guide-step'),'2');
 await m.locator('.guide-chat-questions button').first().click();await m.getByRole('dialog',{name:'로그인하고 이어서 시작하세요',exact:true}).waitFor();await m.keyboard.press('Escape');assert.equal(await m.locator('.guide-dialog').count(),1);assert.equal(await m.locator('.app').evaluate(el=>el.inert),true);assert.equal(await m.locator('#guide-chat-popup').count(),1);assert.equal(await m.locator('.guide-chat-message').count(),1);
 await m.getByRole('textbox',{name:'가이드 질문',exact:true}).focus();await m.keyboard.press('Escape');assert.equal(await m.locator('#guide-chat-popup').count(),0);assert.equal(await m.locator('.guide-dialog').count(),1);
 await m.getByRole('button',{name:'가이드 챗봇 열기',exact:true}).click();const box=await m.locator('#guide-chat-popup').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);await m.screenshot({path:'/tmp/winmate-guide-agent-mobile.png'});assert.equal((await guest.request.post(base+'/api/guide/chat',{data:{message:'권한 확인'}})).status(),401);await guest.close();
 console.log('PASS mobile: guide controls remain available; login gate and Escape work with both popups; anonymous POST rejected');
} finally {
 await browser?.close();server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,2000))]);if(server.exitCode===null)server.kill('SIGKILL');fs.rmSync(authDir,{recursive:true,force:true});
}
