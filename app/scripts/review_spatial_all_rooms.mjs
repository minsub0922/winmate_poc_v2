import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {focusScene} from '../web/src/domain/spatial/scene.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'app/tests/output/spatial-all-rooms');fs.mkdirSync(out,{recursive:true});
const sharp=createRequire(new URL('../web/package.json',import.meta.url))('sharp');
const current=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json'))),scenes=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/scenes.json'))),before=JSON.parse(fs.readFileSync(path.join(root,'.wm_tmp/spatial-all-rooms/before-library.json'))),oldScenes=JSON.parse(fs.readFileSync(path.join(root,'.wm_tmp/spatial-all-rooms/before-scenes.json')));
const port=Number(process.env.SPATIAL_ALL_ROOMS_REVIEW_PORT||5235),server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true,hmr:false}});
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
 for(const id of ['fb-5','ht-6','ad-hero','sv-1','rs-4','pb-6','fb-4','ed-1']){
  const template=id.split('-')[0]+'-full-standard',old=oldScenes[template].rooms.some(r=>r.id===id)?focusScene(oldScenes[template],id):oldScenes[id+'-standard'],now=scenes[template].rooms.some(r=>r.id===id)?focusScene(scenes[template],id):scenes[id+'-standard'];
  const b=await render(old,before,id+'-before'),a=await render(now,current,id+'-after');
  measurements.push({room:now.rooms[0].name,beforeSize:[old.width,old.depth],afterSize:[now.width,now.depth],beforeFit:b.fit,afterFit:a.fit,pixelsPerMetreRatio:b.fit/a.fit});
 }
 const tiles=[];for(const [i,s]of screenshots.entries()){const x=i%4*360,y=Math.floor(i/4)*255;tiles.push({input:await sharp(path.join(out,s.file)).resize(360,231).toBuffer(),left:x,top:y});tiles.push({input:Buffer.from(`<svg width="360" height="24"><rect width="360" height="24" fill="white"/><text x="8" y="17" font-family="sans-serif" font-size="11">${escape(s.name)} · ${s.rooms}개 공간</text></svg>`),left:x,top:y+231});}
 await sharp({create:{width:1440,height:1020,channels:3,background:'white'}}).composite(tiles).png().toFile(path.join(out,'industries.png'));
 await page.evaluate(()=>window.densityRenderer.dispose());
}finally{await browser?.close();await server.close();}
const end=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json')));if(end.sourceHash!==current.sourceHash)throw Error('Library changed during density review');
const start=JSON.parse(fs.readFileSync(path.join(out,'start.json'))),files=['app/scripts/build_spatial_library.mjs','app/web/src/domain/spatial/template-composition.js','app/web/src/domain/spatial/space-equipment.js','app/web/src/domain/spatial/furniture-catalog.js','app/web/src/domain/spatial/people-scenes.js','app/web/src/domain/spatial/people-costumes.js','app/web/src/domain/spatial/people-layout.js','app/web/src/domain/spatial/people-placement-geometry.js','app/web/src/domain/spatial/scene.js','app/web/src/domain/spatial/studio-form.js','app/web/src/domain/spatial/template-catalog.js','app/web/src/services/spatial.js','app/web/src/pages/SpatialStudioPage.jsx','app/web/src/components/spatial-library.jsx'];
const roomCounts={};for(const t of current.templates)roomCounts[t.rooms.length]=(roomCounts[t.rooms.length]||0)+1;
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify({...start,sourceHash:current.sourceHash,endSourceHash:end.sourceHash,finishedAt:new Date().toISOString(),roomCounts,standardRoomBefore:[8.98,7.7],standardRoomAfter:[8.53,7.32],linearReduction:1-8.53/8.98,areaReduction:1-(8.53*7.32)/(8.98*7.7),measurements,codeSha256:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),evidenceScope:'All-room profession coverage; exact interior variant scales, physical assets retained; 16 industry captures, two overview comparisons and eight room comparisons'},null,2));
const pair=(name,id)=>`<article><h2>${escape(name)}</h2><div class="pair"><figure><img src="${id}-before.png"><figcaption>이전</figcaption></figure><figure><img src="${id}-after.png"><figcaption>변경 · 실제 공간 축소</figcaption></figure></div></article>`;
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="ko"><meta charset="utf-8"><title>공간 추가 축소와 모든 공간의 사람 배치 검토</title><style>body{font:14px/1.6 system-ui;color:#263d39;background:#f2f5f4;margin:24px}h1{font-size:25px}article{background:white;border:1px solid #dce3df;border-radius:12px;margin:18px 0;overflow:hidden}h2,p{margin:14px 20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}figure{margin:0}img{width:100%;display:block}figcaption{padding:8px 18px}table{border-collapse:collapse;background:white}td,th{padding:8px 14px;border:1px solid #d5dfd8}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}@media(max-width:700px){.pair,.grid{grid-template-columns:1fr}}</style><h1>공간은 5% 더 작게 · 모든 공간에 직종·활동 배치</h1><p>버전 ${current.sourceHash}. 표준 공간은 8.98 × 7.7m에서 8.53 × 7.32m로 가로·세로 약 5% 더 축소했습니다. 기존 제품·가구·사람의 자산 치수는 유지하고 배치와 카메라를 다시 맞춥니다. Compact·standard·spacious의 각 공간은 전체 맵과 개별 맵에서 같은 실측 크기를 사용하며 복도 폭은 유지합니다. 모든 683개 템플릿의 모든 공간을 직종·활동에 맞는 사람으로 채웁니다. 공조·설비 기사, 전기·미디어 기사, 세탁·의류 관리 직원, 저온 보관 담당자를 포함한 사람·도구 복합 오브젝트 20종을 추가했습니다.</p>${pair('외식 · 카페 전체 맵','fb-full-standard')}${pair('교육 전체 맵','ed-full-standard')}<h2>같은 공간을 같은 화면에서 비교</h2>${pair('겉옷 관리 · 의류 보관 직원','fb-5')}${pair('기계실과 세탁실 · 설비 기사·세탁 직원','ht-6')}${pair('외벽 · 전기·미디어 설비 기사','ad-hero')}${pair('셀프 체크인 · 이용객','sv-1')}${pair('현관 · 입주민','rs-4')}${pair('공원 · 정원 관리사','pb-6')}${pair('냉장·냉동 보관 · 저온 보관 담당자','fb-4')}${pair('모둠 교실 · 축소 후 동선과 좌석','ed-1')}<table><tr><th>공간</th><th>기존</th><th>변경</th><th>화면상 1m의 크기</th></tr>${measurements.map(m=>`<tr><td>${escape(m.room)}</td><td>${m.beforeSize.join(' × ')}m</td><td>${m.afterSize.join(' × ')}m</td><td>${((m.pixelsPerMetreRatio-1)*100).toFixed(1)}% 증가</td></tr>`).join('')}</table><h2>16개 업종 기본 전체 맵</h2><img src="industries.png"><div class="grid">${screenshots.map(s=>`<article><h2>${escape(s.name)} · ${s.rooms}개 공간</h2><img src="${s.file}"></article>`).join('')}</div></html>`);
console.log('Reviewed smaller rooms and six-room defaults / '+current.sourceHash);
