// Storyboard 위 팝업으로 열린 스튜디오 — 매칭 카드의 3D 조감도를 누르면 팝업으로 뜨고, 명령 · 직접 조작이 같은 방식으로 동작한다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {openApp,fakeCommands} from './fixtures/birdseye/harness.mjs';

// 팝업은 Storyboard 쪽 기능(components/spatial-studio-popup.jsx)이다 — 그 기능이 없는 구성에서는 건너뛴다.
if(!fs.existsSync(new URL('../web/src/components/spatial-studio-popup.jsx',import.meta.url))){console.log('SKIP spatial-popup-ui: Storyboard 팝업(spatial-studio-popup.jsx)이 없는 구성');process.exit(0);}

const app=await openApp('spatial-popup'),{page,pass,output,base}=app;
try{
  let next=()=>[];const calls=await fakeCommands(app.context,(body,n)=>next(body,n));
  await page.goto(base+'/spatial');await page.locator('.be-home').waitFor({timeout:120000});
  const {pid,route}=await page.evaluate(async()=>{
    const store=await import('/src/repositories/proposals.js'),{historyPath}=await import('/src/services/shared-path.js'),plan=await import('/src/services/space-plan.js');
    const pid=store.createProposal();
    store.update(pid,d=>{d.title='팝업 스튜디오 제안';d.customer='팝업 테스트 고객';d.ind='OF';d.stage='story';d.req.free=[{t:'로비와 회의실에 디스플레이를 설치하고 싶어요'}];d.ctx.products=['qm65c'];
      d.spacePlan={v:1,vertical:{id:'test-vertical',name:'대기업 사옥',group:'OF'},title:'핵심 공간',summary:'로비와 회의실',at:Date.now(),spaces:[{id:'s1',name:'로비',kind:'reception',note:'',products:['qm65c']},{id:'s2',name:'회의실',kind:'meeting',note:'',products:['qm65c']}]};});
    await plan.startBirdseye(pid);
    return {pid,route:historyPath(pid),birdseye:store.getProposal(pid).spacePlan.birdseye};});
  await app.saved();
  await page.goto(base+route);
  const card=page.locator('[data-birdseye-card],.spl-birdseye,.be-card').first();
  const open=page.getByRole('button',{name:/조감도.*(열기|스튜디오|편집)/}).first();
  await open.waitFor({timeout:120000});await page.screenshot({path:output+'/storyboard.png'});
  await open.click();
  const popup=page.getByRole('dialog',{name:'조감도 스튜디오'});await popup.waitFor({timeout:60000});await popup.locator('.sp-view[data-ready=true]').waitFor({timeout:120000});
  assert.equal(await popup.locator('.sp-input-form,.sp-config,.sp-layout-extract').count(),0);
  assert.equal(await popup.getByRole('button',{name:'닫기'}).count()>=1,true);assert.equal(await popup.getByRole('button',{name:'뒤로 가기'}).count(),0);
  const editor=popup.getByRole('combobox',{name:'조감도 편집 프롬프트'});await editor.waitFor();
  await page.screenshot({path:output+'/popup.png'});
  pass('the Storyboard’s 3D birdseye opens the studio as a popup: simulator + command input, “닫기” instead of “뒤로 가기”');

  // 팝업 안에서 명령
  await popup.getByRole('button',{name:/2D 평면도/}).click();await popup.locator('.sp-view[data-view="2d"]').waitFor();
  const ids=()=>popup.locator('.sp-plan-image [data-object-id]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.getAttribute('data-object-id')))]),existing=await ids(),before=existing.length;
  next=body=>[{type:'add',assetId:'furniture:plant',roomId:body.scene.rooms[0].id,quantity:2}];
  await editor.click();await editor.pressSequentially('수목 2개 추가해');
  await Promise.all([page.waitForResponse(r=>r.url().includes('/api/spatial/command')),editor.press('Enter')]);
  await page.waitForFunction(n=>new Set([...document.querySelectorAll('.sp-studio-modal .sp-plan-image [data-object-id]')].map(x=>x.getAttribute('data-object-id'))).size===n,before+2);
  pass('a command sent inside the popup changes the simulator');

  // 팝업 안에서 단축키 — 뒤의 Storyboard로 새지 않는다
  await page.evaluate(()=>{window.__leaked=[];document.addEventListener('keydown',e=>window.__leaked.push(e.code));});
  const added=(await ids()).filter(id=>!existing.includes(id));assert.equal(added.length,2);   // 방금 추가한 수목 — 어느 방향으로도 돌릴 수 있다
  await popup.locator(`.sp-plan-image [data-object-id="${added[0]}"]`).first().click();await popup.locator('.sp-object-popover').waitFor();
  const rotation=async()=>Number((await popup.locator('.sp-object-popover .sp-object-coordinates').textContent()).match(/회전 (-?\d+)°/)[1]);
  const r0=await rotation();await page.keyboard.press('r');await page.waitForTimeout(300);assert.equal(await rotation(),(r0+90)%360);
  await page.keyboard.press('ControlOrMeta+d');await page.waitForFunction(n=>new Set([...document.querySelectorAll('.sp-studio-modal .sp-plan-image [data-object-id]')].map(x=>x.getAttribute('data-object-id'))).size===n,before+3);
  assert.deepEqual((await page.evaluate(()=>window.__leaked)).filter(code=>!/^(Shift|Meta|Control|Alt)/.test(code)),[]);
  pass('shortcuts work on the selection inside the popup and never reach the Storyboard behind it');

  // 닫기 — 저장하고 Storyboard로 돌아온다
  await popup.getByRole('button',{name:'닫기'}).first().click();await popup.waitFor({state:'hidden',timeout:60000});
  const historyId=await page.evaluate(async pid=>(await import('/src/repositories/proposals.js')).getProposal(pid).spacePlan.birdseye.historyId,pid);
  const saved=await app.api.get('/api/spatial/history/'+historyId);assert.equal(saved.scene.objects.filter(o=>o.assetId==='furniture:plant').length>=3,true);
  assert.equal(new URL(page.url()).pathname,route);
  pass('“닫기” saves the edited scene and returns to the Storyboard');
  assert.deepEqual(app.errors,[]);
  console.log(JSON.stringify({ok:true,checks:app.checks.length,output}));
}finally{await app.close();}
