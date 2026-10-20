import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),dir=path.join(root,'app/tests/output/spatial-details');
const sharp=createRequire(new URL('../web/package.json',import.meta.url))('sharp');fs.mkdirSync(dir,{recursive:true});
let lib=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json')));

const assets=lib.assets.filter(a=>a.recipe?.startsWith('detail-'));
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sample=['rug-wool','rug-round','rug-oval','mat-kids','cup-mug','cup-espresso','glass-wine','dish-bowl','tray-rect','pen-cup','book-open','desk-calendar','cushion-square','pillow-bed','plant-mini','basket-floor'];
const layers=[];
for(const[i,id]of sample.entries()){
 const a=assets.find(a=>a.id==='furniture:'+id),x=i%4*240,y=Math.floor(i/4)*185;
 layers.push({input:await sharp(path.join(root,'app/web/public'+a.thumbnail)).resize(240,160).toBuffer(),left:x,top:y});
 layers.push({input:Buffer.from(`<svg width="240" height="25"><rect width="240" height="25" fill="white"/><text x="8" y="17" font-family="sans-serif" font-size="12">${id}</text></svg>`),left:x,top:y+160});
}
await sharp({create:{width:960,height:740,channels:3,background:'white'}}).composite(layers).png().toFile(path.join(dir,'contact-sheet.png'));
const categories=[...new Set(assets.map(a=>a.category))];
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><title>공간 소품 형상 검토표</title><style>body{font:14px/1.6 system-ui;background:#f3f5f3;margin:24px;color:#253e34}h1{font-size:24px}h2{margin-top:32px}section{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}article{background:white;border:1px solid #d8e2dc;border-radius:10px;overflow:hidden}img{display:block;width:100%;aspect-ratio:480/330;object-fit:contain}article div{padding:10px}strong{font-size:13px}p{font-size:12px;margin:4px 0;color:#64786d}.meta{padding:16px;background:white;border:1px solid #d8e2dc;border-radius:10px}.hero{max-width:960px;aspect-ratio:auto}</style><h1>자체 설계 공간 소품 ${assets.length}종</h1><div class="meta">검토 버전 <code>${lib.sourceHash}</code><br>제조사 제품과 구분되는 자체 설계 비전동 개념 자산입니다. 규격은 설계 치수입니다.<br>형상·열린 컵과 식기·러그 패턴·썸네일·상판 높이·2D/3D/PNG/GLB 정합성을 확인합니다.</div><h2>대표 형상</h2><img class="hero" src="contact-sheet.png"><h2>배치·내보내기 예시</h2><img class="hero" src="scene.png">${categories.map(category=>`<h2>${escape(category)} (${assets.filter(a=>a.category===category).length})</h2><section>${assets.filter(a=>a.category===category).map(a=>`<article><img loading="lazy" src="${escape(path.relative(dir,path.join(root,'app/web/public'+a.thumbnail)))}" alt="${escape(a.name)}"><div><strong>${escape(a.name)}</strong><p>${a.size.map(n=>Math.round(n*1000)).join(' × ')} mm</p><p>${a.placement.mode==='surface'?'상판·받침 위':a.placement.mode==='floor-overlay'?'가구 아래 겹침 가능':'바닥 배치'}</p><p>${escape(a.description)}</p></div></article>`).join('')}</section>`).join('')}</html>`;
fs.writeFileSync(path.join(dir,'index.html'),html);
fs.writeFileSync(path.join(dir,'audit.json'),JSON.stringify({sourceHash:lib.sourceHash,assets:assets.map(a=>({id:a.id,name:a.name,category:a.category,size:a.size,placement:a.placement,thumbnail:a.thumbnail,origin:'original-designed-generic-prop'}))},null,2));
console.log(`Review table: ${assets.length} objects / ${lib.sourceHash}`);
