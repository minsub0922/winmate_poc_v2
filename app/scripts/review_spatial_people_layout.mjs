import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {createScene,focusScene,validateScene} from '../web/src/domain/spatial/scene.js';
import {peopleInScene,peopleObjectError} from '../web/src/domain/spatial/people-placement-geometry.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'app/tests/output/spatial-people-layout');fs.mkdirSync(out,{recursive:true});
const sharp=createRequire(new URL('../web/package.json',import.meta.url))('sharp');
const library=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json'))),scenes=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/scenes.json'))),assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
const port=Number(process.env.SPATIAL_PEOPLE_REVIEW_PORT||5225),server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true,hmr:false}});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let browser;
const samples=[],stats=[];
const cacheFile=path.join(out,'render-cache.json'),cache=fs.existsSync(cacheFile)?JSON.parse(fs.readFileSync(cacheFile)):{};
const renderCode=['render-three.js','part-geometry.js','people-placement-geometry.js','people-scenes.js','geometry.js'].map(f=>fs.readFileSync(path.join(root,'app/web/src/domain/spatial',f),'utf8')).join('\n');
try{
 await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1280,height:840}});await page.goto(`http://127.0.0.1:${port}/favicon.ico`);
 await page.evaluate(async library=>{const{createSpatialRenderer}=await import('/src/domain/spatial/render-three.js');const host=document.createElement('div');host.style.cssText='width:1280px;height:840px';document.body.append(host);window.peopleReview={library,renderer:createSpatialRenderer(host)};},library);
 const render=async(scene,name)=>{
  const clean=structuredClone(scene);for(const k of ['assetRevision','contentHash','revision'])delete clean[k];
  const ids=new Set(scene.objects.flatMap(o=>[o.assetId,...(o.people||[]).flatMap(p=>[p.sourceAssetId,p.meal?.sourceAssetId].filter(Boolean))]));
  const key=crypto.createHash('sha256').update(JSON.stringify([renderCode,library.geometryVersion,clean,[...ids].sort().map(id=>[assets[id],library.recipes[assets[id].recipe||assets[id].kind]])])).digest('hex');
  if(cache[name]===key&&fs.existsSync(path.join(out,name+'.png')))return;
  const capture=await page.evaluate(async scene=>{const r=window.peopleReview.renderer;r.setScene(scene,window.peopleReview.library);await r.ready();return r.snapshot().image;},scene);
  fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(capture.split(',')[1],'base64'));cache[name]=key;fs.writeFileSync(cacheFile,JSON.stringify(cache));
 };
 for(const industry of library.industries){
  const t=library.templates.find(t=>t.industry===industry.code&&t.variant==='standard'&&t.scope==='full'&&!t.id.startsWith('case-')&&!t.id.startsWith('cowork'));
  const scene=scenes[t.id],people=peopleInScene(scene,assets);
  await render(scene,'industry-'+industry.code);samples.push({file:'industry-'+industry.code+'.png',name:industry.name+' · 전체 맵',scene});
  stats.push({industry:industry.code,name:industry.name,people:people.length,rooms:scene.rooms.length,occupiedRooms:new Set(people.map(p=>p.roomId)).size,roles:[...new Set(people.map(p=>p.role))]});
 }
 const rooms=[['ed-full-standard',/대형 강의/],['ed-full-standard',/도서관/],['md-full-standard',/병실/],['md-full-standard',/진료실/],['md-full-standard',/간호/],['fb-full-standard',/홀 테이블/],['fb-full-standard',/주방/],['ht-full-standard',/리셉션/],['cowork-full-standard',/업무 공간/],['cowork-full-standard',/미팅룸/],['cowork-full-standard',/카페/],['mf-full-standard',/생산/],['mf-full-standard',/창고/],['fn-full-standard',/창구$/],['rt-full-standard',/VMD/],['rs-full-standard',/거실/]];
 for(const [i,[id,re]]of rooms.entries()){
  const room=scenes[id].rooms.find(r=>re.test(r.name));if(!room)throw Error(id+' missing '+re);
  const scene=focusScene(scenes[id],room.id);await render(scene,'room-'+i);samples.push({file:'room-'+i+'.png',name:room.name,scene});
 }
 for(const [prefix,items]of [['industries',samples.slice(0,16)],['rooms',samples.slice(16)]]){
  const tiles=[];
  for(const [i,sample]of items.entries()){const x=i%4*400,y=Math.floor(i/4)*288;tiles.push({input:await sharp(path.join(out,sample.file)).resize(400,263).toBuffer(),left:x,top:y});tiles.push({input:Buffer.from(`<svg width="400" height="25"><rect width="400" height="25" fill="white"/><text x="8" y="18" font-family="sans-serif" font-size="12">${escape(sample.name)}</text></svg>`),left:x,top:y+263});}
  await sharp({create:{width:1600,height:Math.ceil(items.length/4)*288,channels:3,background:'white'}}).composite(tiles).png().toFile(path.join(out,prefix+'.png'));
 }
 await page.evaluate(()=>window.peopleReview.renderer.dispose());
}finally{await browser?.close();await server.close();}
const files=['app/web/src/domain/spatial/people-layout.js','app/web/src/domain/spatial/people-placement-geometry.js','app/web/src/domain/spatial/scene.js','app/web/src/domain/spatial/plan-svg.js','app/web/src/domain/spatial/render-three.js','app/web/src/domain/spatial/studio-form.js','app/web/src/domain/spatial/slide-binding.js','app/api/spatial_people.py','app/api/spatial.py','app/scripts/build_spatial_library.mjs'];
const current=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json')));if(current.sourceHash!==library.sourceHash)throw Error('Library changed during visual review');
const start=JSON.parse(fs.readFileSync(path.join(out,'start-audit.json')));
const coverage=Object.values(scenes).map(scene=>{const p=peopleInScene(scene,assets);return {id:scene.templateId,industry:scene.industry,people:p.length,occupiedRooms:new Set(p.map(p=>p.roomId)).size,rooms:scene.rooms.length};});
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify({...start,finishedAt:new Date().toISOString(),sourceHash:library.sourceHash,endSourceHash:current.sourceHash,codeSha256:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),industries:stats,coverage,templates:coverage.length,populatedTemplates:coverage.filter(t=>t.people).length,people:coverage.reduce((n,t)=>n+t.people,0),occupiedRooms:coverage.reduce((n,t)=>n+t.occupiedRooms,0),rooms:coverage.reduce((n,t)=>n+t.rooms,0),evidenceScope:'Original static people; existing furniture retained; collision and doorway checks; matching SVG/Three.js/GLB geometry'},null,2));
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><title>업종 템플릿 사람 배치 검토</title><style>body{font:14px/1.6 system-ui;background:#f3f5f5;color:#263d39;margin:24px}img{width:100%;display:block}section{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}article{background:white;border-radius:12px;overflow:hidden}p,h2{margin:12px 20px}table{border-collapse:collapse;background:white}td,th{border:1px solid #ddd;padding:8px 14px}small{display:block;margin:0 20px 15px}</style><h1>업종별 템플릿의 자연스러운 사람 배치</h1><p>버전 ${library.sourceHash} · 가구·제품의 위치·수량을 보존하고 기존 의자·소파·책상·카운터·침상에 사람을 연결합니다. 설비·보관 공간과 충돌하는 배치는 생략합니다. 자체 설계한 정적 개념 연출입니다.</p><table><tr><th>업종</th><th>배치 공간</th><th>인원</th><th>역할</th></tr>${stats.map(s=>`<tr><td>${escape(s.name)}</td><td>${s.occupiedRooms}/${s.rooms}</td><td>${s.people}</td><td>${s.roles.map(escape).join(' · ')}</td></tr>`).join('')}</table><h2>공간별 상세</h2><section>${samples.slice(16).map(s=>`<article><h2>${escape(s.name)}</h2><img src="${s.file}"><small>${peopleInScene(s.scene,assets).map(p=>escape(p.role)).join(' · ')||'자연스럽게 배치할 자리 없음'}</small></article>`).join('')}</section><h2>16개 업종 전체 맵</h2><section>${samples.slice(0,16).map(s=>`<article><h2>${escape(s.name)}</h2><img src="${s.file}"></article>`).join('')}</section></html>`);
console.log('Reviewed 16 industries and '+(samples.length-16)+' detailed rooms / '+library.sourceHash);
