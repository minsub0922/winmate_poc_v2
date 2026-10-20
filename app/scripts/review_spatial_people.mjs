import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'app/tests/output',process.env.SPATIAL_PEOPLE_OUTPUT||'spatial-people');fs.mkdirSync(out,{recursive:true});
const sharp=createRequire(new URL('../web/package.json',import.meta.url))('sharp');
const library=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json'))),people=library.assets.filter(a=>a.assetGroup==='people');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const poses={stand:'서 있는 자세',sit:'앉은 자세',rest:'기본 자세',write:'필기',read:'읽기',raise:'손들기',listen:'설명 듣기',consult:'상담',point:'가리키기','point-left':'진열대 가리키기',present:'발표','board':'높은 위치 판서','board-low':'낮은 위치 판서',inspect:'기록 확인',carry:'상자 운반',serve:'서빙',push:'카트 밀기',examine:'진찰',eat:'숟가락 식사',chopsticks:'젓가락 식사',drink:'음료 마시기',snack:'간식 먹기',menu:'메뉴 선택',stir:'조리 재료 섞기',knead:'반죽·준비',draw:'그림 그리기',water:'화분 물주기',stretch:'스트레칭','meal-tray':'식판 운반'};
const sample=['diner-rice','diner-chopsticks','school-lunch','patient-meal','cafe-drinking','cafe-snack','baker-knead','chef-stir','pharmacist-counter','researcher-bench','dentist-visit','artist-easel','gardener-watering','mechanic-bench','librarian-books','hotel-loungepair','student-write','student-raise','teacher-desk-explain','teacher-board-high','teacher-board-low','lecturer-lectern','doctor-consult','doctor-examine','doctor-bed-round','nurse-trolley','barista-counter','chef-prep','worker-bench','banker-consult','care-wheelchair','guide-map'];
const layers=[];
for(const [i,id]of sample.entries()){
 const a=people.find(a=>a.id==='people:'+id),x=i%4*280,y=Math.floor(i/4)*218;
 layers.push({input:await sharp(path.join(root,'app/web/public'+a.thumbnail)).resize(280,192).toBuffer(),left:x,top:y});
 layers.push({input:Buffer.from(`<svg width="280" height="26"><rect width="280" height="26" fill="white"/><text x="8" y="18" font-family="sans-serif" font-size="13">${id}</text></svg>`),left:x,top:y+192});
}
await sharp({create:{width:1120,height:Math.ceil(sample.length/4)*218,channels:3,background:'white'}}).composite(layers).png().toFile(path.join(out,'contact-sheet.png'));
const categories=[...new Set(people.map(a=>a.category))];
// Whole-library sheets support visual review of every people bundle, not just samples.
for(const [ci,category]of categories.entries()){
 const assets=people.filter(a=>a.category===category),tiles=[];
 for(const [i,a]of assets.entries()){
  const x=i%4*280,y=Math.floor(i/4)*218;
  tiles.push({input:await sharp(path.join(root,'app/web/public'+a.thumbnail)).resize(280,192).toBuffer(),left:x,top:y});
  tiles.push({input:Buffer.from(`<svg width="280" height="26"><rect width="280" height="26" fill="white"/><text x="8" y="18" font-family="sans-serif" font-size="11">${escape(a.id.replace('people:',''))}</text></svg>`),left:x,top:y+192});
 }
 await sharp({create:{width:1120,height:Math.ceil(assets.length/4)*218,channels:3,background:'white'}}).composite(tiles).png().toFile(path.join(out,'category-'+ci+'.png'));
}
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>사람과 오브젝트 연출 검토표</title><style>body{margin:24px;font:14px/1.6 system-ui;color:#253e34;background:#f3f5f3}h1{font-size:25px}h2{margin-top:30px}p{margin:5px 0}.meta{padding:15px;background:white;border:1px solid #d8e2dc;border-radius:10px}section{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:12px}article{background:white;border:1px solid #d8e2dc;border-radius:10px;overflow:hidden}article img{display:block;width:100%;aspect-ratio:480/330;object-fit:contain}article div{padding:12px}article p{font-size:12px;color:#5d7568}strong{font-size:13px}.hero{display:block;width:100%;max-width:1120px}</style><h1>사람 + 가구·도구 연출 ${people.length}종</h1><div class="meta">검토 버전 <code>${library.sourceHash}</code><br>모든 인물은 자체 설계한 정적인 역할 표현입니다. 단순화한 복장·자세·가구·도구로 공간의 쓰임을 나타냅니다.<br>한 연출을 선택하면 사람과 가구·도구가 함께 이동·회전합니다. 삼성 가전·디스플레이를 묶음 안에 포함하지 않습니다.</div><h2>대표 연출</h2><img class="hero" src="contact-sheet.png"><h2>실제 렌더·내보내기</h2><img class="hero" src="people-scene.png">${categories.map(category=>`<h2>${escape(category)} (${people.filter(a=>a.category===category).length})</h2><section>${people.filter(a=>a.category===category).map(a=>`<article><img loading="lazy" src="${escape(path.relative(out,path.join(root,'app/web/public'+a.thumbnail)))}" alt="${escape(a.name)}"><div><strong>${escape(a.name)}</strong><p>${[...new Set(a.roles)].map(escape).join(' · ')} / ${a.composition.peopleCount}명</p><p>${a.actors.map(actor=>escape(poses[actor.action]||actor.action)).join(' · ')}</p><p>${escape(a.composition.variant)}</p>${a.actors.map(actor=>`<p><b>${escape(actor.role)}</b> · ${[...(actor.wardrobe||[]),...(actor.accessories||[])].map(escape).join(' · ')}</p>`).join('')}<p>${escape(a.description)}</p><p>${a.size.map(n=>Math.round(n*1000)).join(' × ')} mm · 설계 치수</p></div></article>`).join('')}</section>`).join('')}</html>`;
fs.writeFileSync(path.join(out,'index.html'),html);
const files=['app/web/src/domain/spatial/people-scenes.js','app/web/src/domain/spatial/people-costumes.js','app/web/src/domain/spatial/geometry.js','app/web/src/domain/spatial/part-geometry.js','app/web/src/domain/spatial/part-plan.js','app/web/src/domain/spatial/scene.js','app/web/src/domain/spatial/render-three.js','app/web/src/domain/spatial/catalog.js','app/web/src/components/spatial-object-drawer.jsx','app/api/spatial.py','app/scripts/build_spatial_library.mjs'];
const endSourceHash=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json'))).sourceHash;if(endSourceHash!==library.sourceHash)throw new Error('Library changed during review generation');
const startFile=path.join(out,'start-audit.json'),start=fs.existsSync(startFile)?JSON.parse(fs.readFileSync(startFile)):{};
const uiFile=path.join(out,'ui-report.json'),ui=fs.existsSync(uiFile)?JSON.parse(fs.readFileSync(uiFile)):null;
const payloadHash=assets=>crypto.createHash('sha256').update(JSON.stringify(assets.filter(a=>a.assetGroup==='people'))).digest('hex');
let uiEvidence=null;
if(ui?.ok){const tested=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/versions',ui.sourceHash+'.json')));const testedPeople=payloadHash(tested.assets),currentPeople=payloadHash(library.assets);if(testedPeople!==currentPeople)throw new Error('People assets changed after UI verification');uiEvidence={testedSourceHash:ui.sourceHash,currentSourceHash:library.sourceHash,identicalPeoplePayload:true,peoplePayloadSha256:currentPeople};}

fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify({...start,finishedAt:new Date().toISOString(),sourceHash:library.sourceHash,endSourceHash,peopleCount:people.length,roleCount:new Set(people.flatMap(a=>a.roles)).size,endAssetCount:library.assets.length,uiEvidence,codeSha256:Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')])),evidenceScope:{geometry:'recipe-envelope-and-real-render',roles:'stylized-clothing-tools-and-context',reference:'original-generic-design',movement:'compound-object',animation:'static-poses'},assets:people.map(a=>({id:a.id,name:a.name,roles:a.roles,actors:a.actors,composition:a.composition,size:a.size,thumbnail:a.thumbnail,previewCamera:a.previewCamera}))},null,2));
console.log(`Reviewed ${people.length} people scenes / ${library.sourceHash}`);
