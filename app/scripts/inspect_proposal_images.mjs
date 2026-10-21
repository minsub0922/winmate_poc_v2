// Audit actual decoded pictures, including packed images; filled slot names alone are insufficient.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(path.join(root,'app/web/package.json')),sharp=require('sharp');
const json=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const std=await json('app/web/src/domain/templates/description_standard_scenarios.json'),best=await json('app/web/src/domain/templates/vertical_scenarios.json');
const datasets={...std.fills,...best.fills},packs=new Map(),sources=new Map(),missing=[],blank=[],decks=[];
for(const pages of Object.values(datasets))for(const page of pages)for(const im of Object.values(page.img))sources.set(im.src,im);
const fingerprints={};
for(const [src,im] of sources){
 try{
  let bytes;
  if(/\.json#\d+$/.test(src)){const [file,n]=src.split('#');if(!packs.has(file))packs.set(file,await json('app/data/static/'+file));const data=packs.get(file).images[Number(n)];bytes=Buffer.from(data.split(',')[1],'base64');}
  else bytes=await fs.readFile(path.join(root,src.startsWith('/assets/')?'app/web/public':src.startsWith('img/lib/')?'':'app/data/static',src));
  const metadata=await sharp(bytes).metadata(),small=await sharp(bytes).flatten({background:'#fff'}).resize(48,48,{fit:'fill'}).removeAlpha().raw().toBuffer();
  const pixels=small.length/3,nonwhite=Array.from({length:pixels},(_,i)=>Math.min(...small.subarray(i*3,i*3+3))<242).filter(Boolean).length/pixels;
  const fingerprint=createHash('sha256').update(small).digest('hex');fingerprints[src]={fingerprint,width:metadata.width,height:metadata.height,nonwhite};
  if(metadata.width<40||metadata.height<40||nonwhite<.015)blank.push({src,name:im.name,...fingerprints[src]});
 }catch(error){missing.push({src,error:error.message});}
}
for(const [id,pages] of Object.entries(datasets)){
 const counts=new Map(),samePage=[];let total=0;
 for(let k=0;k<pages.length;k++){
  const seen=new Set();for(const im of Object.values(pages[k].img)){total++;const hash=fingerprints[im.src]?.fingerprint||im.src;if(seen.has(hash))samePage.push({page:k+1,src:im.src});seen.add(hash);const old=counts.get(hash)||{src:im.src,name:im.name,count:0};old.count++;counts.set(hash,old);}
 }
 const ranked=[...counts.values()].sort((a,b)=>b.count-a.count);decks.push({id,pages:pages.length,images:total,unique:counts.size,uniqueRatio:counts.size/total,mostUsed:ranked.slice(0,5),samePage});
}
const addedPhotos=await json('app/web/src/domain/templates/proposal_photo_assets.json');
for(const photo of addedPhotos){const bytes=await fs.readFile(path.join(root,'app/web/public',photo.src));if(createHash('sha256').update(bytes).digest('hex')!==photo.sha256)throw new Error('Source image integrity: '+photo.pid);}
const report={dataSha256:createHash('sha256').update(JSON.stringify({std,best})).digest('hex'),assets:sources.size,addedOfficialPhotos:addedPhotos.length,missing,blank,decks,fingerprints};
const target=process.argv[2]||'output/rebuild-existing/image-verification.json';await fs.writeFile(path.join(root,target),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({assets:sources.size,missing:missing.length,blank:blank.length,samePage:decks.reduce((n,x)=>n+x.samePage.length,0),averageUniqueRatio:decks.reduce((n,x)=>n+x.uniqueRatio,0)/decks.length,maxRepeat:Math.max(...decks.flatMap(x=>x.mostUsed.map(x=>x.count)))}));
if(missing.length||blank.length||decks.some(d=>d.samePage.length))process.exitCode=1;
