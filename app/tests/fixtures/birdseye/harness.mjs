// 조감도 UI 테스트 공통 준비 — 격리 API(app/tests/fixtures/spatial/server.py)에 붙는 Vite 개발 서버 + 시스템 Chrome.
//   먼저 격리 API를 띄운다:  WINMATE_AUTH_DIR=<임시 폴더> WINMATE_API_PORT=8961 WINMATE_CACHE_BACKEND=memory WINMATE_SPATIAL_PREWARM=off \
//                            WINMATE_ENV_FILES=none app/.venv/bin/python app/tests/fixtures/spatial/server.py
//   포트: BIRDSEYE_TEST_API_PORT(기본 8961) · BIRDSEYE_TEST_WEB_PORT(기본 5261). 실제 8788 서버 · 실제 계정 데이터는 쓰지 않는다.
//   빌드된 앱 점검: BIRDSEYE_TEST_BASE=http://127.0.0.1:<포트> — Vite 없이 그 서버(WINMATE_AUTH=off · 격리 DB · WINMATE_WEB_DIST=<빌드>)의 묶음을 그대로 연다.
//   (페이지 안에서 /src 모듈을 부르는 테스트는 빌드 점검에 쓸 수 없다 — spatial-command-ui · spatial-manipulate-ui · spatial-command-live-ui는 된다.)
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from '../../../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../../../web/node_modules/playwright/index.mjs';

export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
export const library=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json')));

export async function openApp(name,{viewport={width:1540,height:1080}}={}){
  const built=(process.env.BIRDSEYE_TEST_BASE||'').replace(/\/$/,'');
  const apiPort=Number(process.env.BIRDSEYE_TEST_API_PORT||8961),webPort=Number(process.env.BIRDSEYE_TEST_WEB_PORT||5261),base=built||'http://127.0.0.1:'+webPort;
  process.env.WINMATE_API_PORT=String(apiPort);process.env.WINMATE_WEB_PORT=String(webPort);
  const output=path.join(root,'app/tests/output',name);fs.mkdirSync(output,{recursive:true});
  const server=built?null:await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),cacheDir:path.join(root,'.wm_tmp/vite-'+name+'-'+webPort),logLevel:'error',server:{host:'127.0.0.1',port:webPort,strictPort:true,hmr:false}});
  await server?.listen();
  const chrome=process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{}),args:['--enable-unsafe-swiftshader']});
  const context=await browser.newContext({viewport});
  const headers={Origin:base};
  const login=built?{ok:()=>true}:await context.request.post(base+'/api/auth/login',{data:{username:'admin',password:'spatial-isolated-test-password'},headers});
  if(!login.ok())throw new Error('격리 API 로그인 실패('+login.status()+') — 격리 API가 '+apiPort+' 포트에 떠 있는지 확인하세요.');
  await context.route(u=>['/api/llm','/api/jobs'].includes(u.pathname),route=>route.request().method()==='POST'?route.fulfill({status:503,json:{detail:'isolated birdseye test'}}):route.continue());
  const page=await context.newPage();page.setDefaultTimeout(30000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const api={
    get:async url=>(await context.request.get(base+url)).json(),
    post:async(url,data)=>{const r=await context.request.post(base+url,{data,headers});if(!r.ok())throw new Error(url+' '+r.status()+' '+await r.text());return r.json();},
    put:async(url,data)=>{const r=await context.request.put(base+url,{data,headers});if(!r.ok())throw new Error(url+' '+r.status()+' '+await r.text());return r.json();},
  };
  const checks=[],pass=text=>{checks.push(text);console.log('PASS '+text);};
  // 브라우저에서 만든 제안서 · 템플릿이 저장(브라우저 250ms · 계정 1.2초 뒤 전송)될 때까지 — 다시 열거나 다른 화면으로 가기 전에 부른다.
  // 고정 시간만 기다리면 계정 자료가 많을 때 전송이 끝나기 전에 페이지를 떠나 기록이 사라진다.
  // 계정 동기화 모듈이 없는 구성(브라우저 저장만)에서는 저장 지연(250ms)보다 넉넉히 기다린다.
  const saved=async()=>{await page.waitForTimeout(400);const flushed=await page.evaluate(async()=>{try{const {flushAccountSync}=await import('/src/repositories/account-sync.js');await flushAccountSync();return true;}catch{return false;}});if(!flushed)await page.waitForTimeout(1100);};
  return {base,output,server,browser,context,page,errors,api,checks,pass,saved,close:async()=>{await browser.close();await server?.close();}};
}

/** 명령 해석 API를 가로채 plan(request body)이 돌려준 조작 목록으로 답한다. 받은 요청은 calls에 쌓인다. */
export async function fakeCommands(context,plan){
  const calls=[];
  await context.route('**/api/spatial/command',async route=>{
    const body=route.request().postDataJSON();calls.push(body);
    const operations=await plan(body,calls.length);
    if(operations&&operations.status)return route.fulfill({status:operations.status,json:{detail:operations.detail}});
    return route.fulfill({status:200,json:{plan:{explanation:operations?.explanation||'요청한 조작을 해석했어요.',operations:operations?.operations||operations||[]},model:'test',mode:'real',source:'llm'}});
  });
  return calls;
}
