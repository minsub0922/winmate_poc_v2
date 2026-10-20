import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const sharp=createRequire(new URL('../web/package.json',import.meta.url))('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),out=path.join(root,'output/spatial-fidelity'),publicRoot=path.join(root,'app/web/public');fs.mkdirSync(out,{recursive:true});
const library=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json'))),baseline=path.join(out,'objects-before.json'),before=fs.existsSync(baseline)?JSON.parse(fs.readFileSync(baseline)).assets:[],previous=Object.fromEntries(before.map(a=>[a.id,a]));
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const file=url=>'../../app/web/public'+url;
const summary={sourceHash:library.sourceHash,assets:library.assets.length,products:library.counts.products,furniture:library.counts.furniture,kindCorrections:library.assets.filter(a=>previous[a.id]&&a.kind!==previous[a.id].kind).length,measured:library.counts.measured,images:library.assets.filter(a=>a.referenceImage).length,facades:library.assets.filter(a=>a.appearance?.facade).length,recipes:new Set(library.assets.map(a=>a.recipe||a.kind)).size,missingImages:library.assets.filter(a=>a.productId&&!a.referenceImage).map(a=>({id:a.id,name:a.name})),estimatedDimensions:library.assets.filter(a=>a.dimensionSource==='estimated').map(a=>({id:a.id,name:a.name,recipe:a.recipe})),unverified:library.assets.filter(a=>a.productId&&(!a.referenceImage||a.dimensionSource==='estimated')).map(a=>a.id)};
summary.createdAt=new Date().toISOString();summary.baselineAvailable=fs.existsSync(baseline);
summary.physicalEstimated=library.assets.filter(a=>a.productId&&a.physical&&a.dimensionSource==='estimated').length;
summary.reviewIssues=library.assets.filter(a=>a.productId&&a.physical).map(a=>({id:a.id,model:a.model,dimensionScope:a.dimensionScope,issues:[
  a.dimensionSource==='estimated'?'dimensions-estimated':null,
  /family|representative|package|regional|unknown/.test(a.dimensionScope||'')?'dimension-scope-'+a.dimensionScope:null,
  !a.referenceImage?'reference-image-missing':null,
  a.componentDimensions?'stand-designed-panel-measured':null,
  a.pose==='closed'?'closed-model-open-reference-possible':null,
].filter(Boolean)})).filter(a=>a.issues.length);
fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(summary,null,2));
const cards=library.assets.map(a=>`<article data-search="${escape([a.id,a.name,a.model,a.recipe||a.kind].join(' ').toLowerCase())}"><h2>${escape(a.name)}</h2><p>${escape(a.model||a.id)} · ${escape(a.recipe||a.kind)}</p><div class="pair">${a.referenceImage?`<figure><img loading="lazy" src="${file(a.referenceImage)}"><figcaption>원본 제품 이미지</figcaption></figure>`:'<figure>제조사 이미지 없음 / 공용 설계</figure>'}<figure><img loading="lazy" src="${file(a.thumbnail)}"><figcaption>실제 편집용 오브젝트</figcaption></figure></div><p>${a.size.map(n=>Math.round(n*1000)).join(' × ')} mm (W × H × D)</p><p class="${a.dimensionSource==='estimated'?'estimated':''}">${a.dimensionSource==='catalog-spec'?'DB 치수':a.dimensionSource==='designed'?'공용 설계 치수':'추정 치수 · 추가 검증 필요'} · ${escape(a.dimensionScope||'')}</p>${a.componentDimensions?`<p>패널 ${a.componentDimensions.display.map(n=>Math.round(n*1000)).join(' × ')} mm / 스탠드는 설계 추정</p>`:''}${a.pose==='closed'?'<p>닫힌 본체 형상 / 참고 사진은 열린 상태일 수 있음</p>':''}<small>${escape(a.dimensionEvidence?.join(' / ')||'')}</small></article>`).join('');
fs.writeFileSync(path.join(out,'review.html'),`<!doctype html><meta charset="utf-8"><title>공간 오브젝트 이미지·스펙 검토</title><style>body{font:14px system-ui;color:#233d35;background:#f3f6f4;margin:24px}header{position:sticky;top:0;background:#f3f6f4;padding:12px 0;z-index:1}h1{font-size:24px}input{padding:12px;width:min(500px,80%)}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:16px}article{background:white;padding:14px;border:1px solid #d5dfd8;border-radius:12px;min-width:0}h2{font-size:15px;margin:0}p,small{font-size:11px;overflow-wrap:anywhere}.pair{display:flex;gap:6px}figure{margin:0;flex:1;min-width:0;height:160px;display:flex;align-items:center;justify-content:center;flex-direction:column}img{width:100%;height:140px;object-fit:contain}figcaption{font-size:10px;color:#687c71}.estimated{color:#a26317}</style><header><h1>공간 오브젝트 이미지·스펙 검토</h1><p>제품 ${summary.products}개 · 가구 ${summary.furniture}종 · 이미지 ${summary.images}개 · DB 치수 ${summary.measured}개 · ${summary.recipes}개 형상</p><input placeholder="제품명 · 모델 · ID · 형상 검색" oninput="for(const a of document.querySelectorAll('article'))a.hidden=!a.dataset.search.includes(this.value.toLowerCase())"></header><main>${cards}</main>`);
async function sheet(assets,name,cols=8){
  const cellW=200,cellH=174,rows=Math.ceil(assets.length/cols),layers=[];
  for(const [i,a] of assets.entries()){
    const x=i%cols*cellW,y=Math.floor(i/cols)*cellH;
    for(const [j,url] of [a.referenceImage,a.thumbnail].entries())if(url){const image=await sharp(path.join(publicRoot,url)).resize(96,115,{fit:'contain',background:'#ffffff'}).png().toBuffer();layers.push({input:image,left:x+j*100,top:y});}
    const label=`<svg width="200" height="58"><text x="3" y="13" font-family="Arial" font-size="9">${escape(a.model||a.id).slice(0,34)}</text><text x="3" y="27" font-family="Arial" font-size="9">${escape(a.recipe||a.kind)}</text><text x="3" y="41" font-family="Arial" font-size="9">${a.size.map(n=>Math.round(n*1000)).join(' x ')} mm</text></svg>`;
    layers.push({input:Buffer.from(label),left:x,top:y+115});
  }
  await sharp({create:{width:cols*cellW,height:rows*cellH,channels:3,background:'#ffffff'}}).composite(layers).png().toFile(path.join(out,name+'.png'));
}
const representatives=[...new Map(library.assets.map(a=>[a.recipe||a.kind,a])).values()];
await sheet(representatives,'recipe-review');
await sheet(library.assets.filter(a=>!a.productId),'furniture-review');
for(let i=0;i<library.assets.length;i+=88)await sheet(library.assets.slice(i,i+88),'all-'+String(i/88+1).padStart(2,'0'));
console.log(JSON.stringify({...summary,estimatedDimensions:summary.estimatedDimensions.length,unverified:summary.unverified.length,reviewIssues:summary.reviewIssues.length}));
