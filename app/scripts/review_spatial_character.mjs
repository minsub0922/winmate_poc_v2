import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {focusScene} from '../web/src/domain/spatial/scene.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'app/tests/output/spatial-character');fs.mkdirSync(out,{recursive:true});
const sharp=createRequire(new URL('../web/package.json',import.meta.url))('sharp');
const current=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json'))),scenes=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/scenes.json'))),before=JSON.parse(fs.readFileSync(path.join(root,'.wm_tmp/spatial-character/before-library.json'))),oldScenes=JSON.parse(fs.readFileSync(path.join(root,'.wm_tmp/spatial-character/before-scenes.json')));
const port=Number(process.env.SPATIAL_CHARACTER_REVIEW_PORT||5240),server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true,hmr:false}});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const renderCacheFile=path.join(out,'render-cache.json'),cache=fs.existsSync(renderCacheFile)?JSON.parse(fs.readFileSync(renderCacheFile)):{};
const code=['render-three.js','part-geometry.js','people-placement-geometry.js','people-scenes.js','geometry.js'].map(f=>fs.readFileSync(path.join(root,'app/web/src/domain/spatial',f),'utf8')).join('\n');
const screenshots=[],measurements=[];let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:960,height:615}});await page.goto(`http://127.0.0.1:${port}/favicon.ico`);
 await page.evaluate(async()=>{const{createSpatialRenderer}=await import('/src/domain/spatial/render-three.js');const h=document.createElement('div');h.style.cssText='width:960px;height:615px';document.body.append(h);window.densityRenderer=createSpatialRenderer(h);});
 const render=async(scene,library,name)=>{
  const ids=new Set(scene.objects.flatMap(o=>[o.assetId,...(o.people||[]).flatMap(p=>[p.sourceAssetId,p.meal?.sourceAssetId].filter(Boolean))]));
  const clean=structuredClone(scene);for(const key of ['assetRevision','contentHash','revision'])delete clean[key];
  const hash=crypto.createHash('sha256').update(JSON.stringify([code,"960x615@1",clean,library.geometryVersion,library.assets.filter(a=>ids.has(a.id))])).digest('hex');
  if(cache[name]?.hash===hash&&fs.existsSync(path.join(out,name+'.png')))return cache[name];
  const result=await page.evaluate(async({scene,library})=>{const r=window.densityRenderer;r.setScene(scene,library);await r.ready();return{png:r.snapshot({w:960,h:615,pixelRatio:1}).image,fit:r.cameraState().fit};},{scene,library});
  fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(result.png.split(',')[1],'base64'));cache[name]={hash,fit:result.fit};fs.writeFileSync(renderCacheFile,JSON.stringify(cache));console.log('Rendered '+name);return cache[name];
 };
 for(const industry of current.industries){
  const t=current.templates.find(t=>t.industry===industry.code&&t.scope==='full'&&t.variant==='standard'&&!t.id.startsWith('case-')&&!t.id.startsWith('cowork'));
  const scene=scenes[t.id];await render(scene,current,'industry-'+industry.code);screenshots.push({name:industry.name,file:'industry-'+industry.code+'.png',rooms:scene.rooms.length});
 }
 for(const id of ['fb-full-standard','ed-full-standard']){
  await render(oldScenes[id],before,id+'-before');await render(scenes[id],current,id+'-after');
 }
 for(const id of ['fb-5','fb-3','ht-4','md-2','ed-4','rt-hero','fb-4','id-5']){
  const template=id.split('-')[0]+'-full-standard',old=oldScenes[template].rooms.some(r=>r.id===id)?focusScene(oldScenes[template],id):oldScenes[id+'-standard'],now=scenes[template].rooms.some(r=>r.id===id)?focusScene(scenes[template],id):scenes[id+'-standard'];
  const b=await render(old,before,id+'-before'),a=await render(now,current,id+'-after');
  measurements.push({room:now.rooms[0].name,beforeSize:[old.width,old.depth],afterSize:[now.width,now.depth],beforeFit:b.fit,afterFit:a.fit,pixelsPerMetreRatio:b.fit/a.fit});
 }
 const tiles=[];for(const [i,s]of screenshots.entries()){const x=i%4*360,y=Math.floor(i/4)*255;tiles.push({input:await sharp(path.join(out,s.file)).resize(360,231).toBuffer(),left:x,top:y});tiles.push({input:Buffer.from(`<svg width="360" height="24"><rect width="360" height="24" fill="white"/><text x="8" y="17" font-family="sans-serif" font-size="11">${escape(s.name)} · ${s.rooms}개 공간</text></svg>`),left:x,top:y+231});}
 await sharp({create:{width:1440,height:1020,channels:3,background:'white'}}).composite(tiles).png().toFile(path.join(out,'industries.png'));
 await page.evaluate(()=>window.densityRenderer.dispose());
}finally{await browser?.close();await server.close();}
const end=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json')));if(end.sourceHash!==current.sourceHash)throw Error('Library changed during density review');
const start=JSON.parse(fs.readFileSync(path.join(out,'start.json'))),files=['app/scripts/build_spatial_library.mjs','app/web/src/domain/spatial/template-composition.js','app/web/src/domain/spatial/space-equipment.js','app/web/src/domain/spatial/furniture-catalog.js','app/web/src/domain/spatial/space-objects.js','app/web/src/domain/spatial/space-dressing.js','app/web/src/domain/spatial/people-scenes.js','app/web/src/domain/spatial/people-costumes.js','app/web/src/domain/spatial/people-layout.js','app/web/src/domain/spatial/people-placement-geometry.js','app/web/src/domain/spatial/scene.js','app/web/src/domain/spatial/studio-form.js','app/web/src/domain/spatial/template-catalog.js','app/web/src/services/spatial.js','app/web/src/pages/SpatialStudioPage.jsx','app/web/src/components/spatial-library.jsx'];
const roomCounts={};for(const t of current.templates)roomCounts[t.rooms.length]=(roomCounts[t.rooms.length]||0)+1;
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify({...start,sourceHash:current.sourceHash,endSourceHash:end.sourceHash,finishedAt:new Date().toISOString(),roomCounts,standardRoomBefore:[8.53,7.32],standardRoomAfter:[8,6.8],linearReduction:1-8/8.53,areaReduction:1-(8*6.8)/(8.53*7.32),measurements,codeSha256:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),evidenceScope:'Purpose-specific clothes, cooking and fitness props; smaller real rooms; prior assets retained; 16 industry renders, two overview and eight room comparisons'},null,2));
const pair=(name,id)=>`<article><h2>${escape(name)}</h2><div class="pair"><figure><img src="${id}-before.png"><figcaption>이전</figcaption></figure><figure><img src="${id}-after.png"><figcaption>변경 · 실제 공간 축소</figcaption></figure></div></article>`;
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><title>공간 축소와 용도별 가구·소품 검토</title><style>body{font:14px/1.6 system-ui;color:#263d39;background:#f2f5f4;margin:24px}h1{font-size:25px}article{background:white;border:1px solid #dce3df;border-radius:12px;margin:18px 0;overflow:hidden}h2,p{margin:14px 20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;display:block}figcaption{padding:8px 18px}table{border-collapse:collapse;background:white}td,th{padding:8px 14px;border:1px solid #d5dfd8}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:700px){.pair,.grid{grid-template-columns:1fr}}</style><h1>공간은 더 작게 · 옷·음식·운동 기구가 있는 공간</h1><p>버전 ${current.sourceHash}. 표준 공간을 8.53 × 7.32m에서 8 × 6.8m로 줄이고 가구·제품·사람 배치를 맞췄습니다. 겉옷 케어존은 실제 옷이 든 장롱과 외투 행거를, 주방은 조리대의 식재료·도마와 조리 중인 냄비를, 헬스장은 아령·바벨·파워 랙을 배치합니다. 재활은 평행봉과 가벼운 운동 도구로 구분합니다. 도서관에는 책이 꽂힌 서가, 매장에는 상품 진열, 세탁실에는 세탁물을 추가합니다. 6개 기본 공간과 모든 공간의 사람 배치는 유지합니다.</p>${pair('외식 · 카페 전체 맵','fb-full-standard')}${pair('교육 전체 맵','ed-full-standard')}<h2>같은 공간을 같은 화면에서 비교</h2>${pair('겉옷 케어 · 옷이 든 장롱과 행거','fb-5')}${pair('주방 · 음식과 조리 재료','fb-3')}${pair('헬스장 · 아령·바벨·파워 랙','ht-4')}${pair('재활치료 · 평행봉과 가벼운 운동 도구','md-2')}${pair('도서관 · 책이 꽂힌 서가','ed-4')}${pair('매장 · 실제 상품 진열','rt-hero')}${pair('식재료 보관 · 채소와 과일','fb-4')}${pair('세탁·드레스룸 · 옷과 세탁물','id-5')}<table><tr><th>공간</th><th>기존</th><th>변경</th><th>화면상 1m의 크기</th></tr>${measurements.map(m=>`<tr><td>${escape(m.room)}</td><td>${m.beforeSize.join(' × ')}m</td><td>${m.afterSize.join(' × ')}m</td><td>${((m.pixelsPerMetreRatio-1)*100).toFixed(1)}% 증가</td></tr>`).join('')}</table><h2>16개 업종 기본 전체 맵</h2><img src="industries.png"><div class="grid">${screenshots.map(s=>`<article><h2>${escape(s.name)} · ${s.rooms}개 공간</h2><img src="${s.file}"></article>`).join('')}</div></html>`);
console.log('Reviewed smaller rooms and six-room defaults / '+current.sourceHash);
