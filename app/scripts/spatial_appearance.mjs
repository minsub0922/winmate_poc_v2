import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {rectifyDisplayPhoto} from './spatial_display_photo.mjs';
const sharp=createRequire(new URL('../web/package.json',import.meta.url))('sharp');

// Source pictures are kept separately from generated object thumbnails. Never
// replace a missing model image with an unrelated product's picture.
export async function prepareSpatialAppearance(assets,root){
  const pids=JSON.parse(fs.readFileSync(path.join(root,'app/data/images.json'))).pids;
  const folder=path.join(root,'app/web/public/assets/spatial-references');fs.mkdirSync(folder,{recursive:true});
  const packs=new Map(),processed=new Map();
  const read=address=>{
    if(!address)return null;
    if(address.includes('#')){
      const [file,index]=address.split('#');
      if(!fs.existsSync(path.join(root,file)))return null;
      if(!packs.has(file))packs.set(file,JSON.parse(fs.readFileSync(path.join(root,file))).images);
      const data=packs.get(file)?.[Number(index)];return data?Buffer.from(data.split(',')[1],'base64'):null;
    }
    const file=path.join(root,address);return fs.existsSync(file)?fs.readFileSync(file):null;
  };
  for(const a of assets){
    const e=a.imageEvidence||{},gallery=e.gallery||[],labels=e.labels||[];
    const frontal=labels.map((label,index)=>({label,index})).filter(x=>/정면|전면|front/i.test(x.label)&&!/후면|back|페어|정면과|도킹|스테이션|확대/i.test(x.label));
    const front=frontal[0]?.index??-1;
    const staticImage=pids[e.pid],exactStatic=staticImage&&/정면|전면|front/i.test(staticImage.desc||'')&&!/life|insitu/.test(staticImage.kind||'');
    const preferred=front>=0?gallery[front]:exactStatic?staticImage.file:null;
    const source=[preferred,e.thumbnail,...gallery,staticImage?.src==='cut'?staticImage.file:null].find(value=>value&&read(value));
    const orientation=source===preferred?(a.kind==='induction'?'top':'front'):'unspecified';
    if(!source){a.appearance={status:'reference-missing'};continue;}
    let image=processed.get(source);
    if(!image){
      const buffer=read(source);if(!buffer){a.appearance={status:'reference-missing'};continue;}
      // Manufacturer pack images have transparent or plain white margins.
      const trimmed=await sharp(buffer).trim({background:'#ffffff',threshold:18}).toBuffer();
      const {data,info}=await sharp(trimmed).resize({width:96,height:96,fit:'inside'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const bins=new Map();
      for(let i=0;i<data.length;i+=4){const [r,g,b,alpha]=data.subarray(i,i+4);if(alpha<180||Math.min(r,g,b)>235)continue;const key=[r,g,b].map(v=>Math.round(v/32)*32).join(',');const bin=bins.get(key)||{n:0,sum:[0,0,0]};bin.n++;[r,g,b].forEach((v,j)=>bin.sum[j]+=v);bins.set(key,bin);}
      const dominant=[...bins.values()].sort((a,b)=>b.n-a.n)[0];
      const color=dominant?'#'+dominant.sum.map(v=>Math.round(v/dominant.n).toString(16).padStart(2,'0')).join(''):'#e7e8e5';
      const hash=crypto.createHash('sha256').update(buffer).digest('hex').slice(0,16),file=hash+'.webp';
      const meta=await sharp(trimmed).metadata();
      await sharp(trimmed).resize({width:512,height:512,fit:'inside',withoutEnlargement:true}).webp({quality:88}).toFile(path.join(folder,file));
      image={url:'/assets/spatial-references/'+file,aspect:meta.width/meta.height,color,sha256:crypto.createHash('sha256').update(buffer).digest('hex')};processed.set(source,image);
    }
    a.referenceImage=image.url;
    const surface=orientation==='top'?'top':'front',ratio=a.size[0]/a.size[surface==='top'?2:1],flat=['display','tablet','phone','washer','dishwasher','fridge','airdresser','purifier','desktop','oven','floorac','outdoor','water','printer','speaker','amplifier','induction'].includes(a.kind);
    // Only a verified front view matching the actual dimensions may be mapped
    // onto a facade. Angled, lifestyle and multi-product images stay references.
    const facade=!a.componentDimensions&&flat&&orientation!=='unspecified'&&Math.abs(Math.log(image.aspect/ratio))<.16;
    const screenBody=['display','monitor','tablet','phone'].includes(a.kind)?['whiteDisplay','epaper'].includes(a.recipe)?'#eeede7':'#24292c':null;
    a.appearance={status:a.dimensionSource==='catalog-spec'?'image-and-spec':'image-with-estimated-dimensions',source,orientation,surface,imageSha256:image.sha256,bodyColor:a.specColor||screenBody||image.color,facade:facade?image.url:null};
    if(!a.displaySpec&&!facade&&orientation==='unspecified'&&['fridge','washer','dishwasher','airdresser','oven','floorac','outdoor','desktop','printer'].includes(a.kind)&&!a.componentDimensions){
      const label=labels[gallery.indexOf(source)]||labels[0]||staticImage?.desc||'';
      if(!/후면|뒷면|측면|옆면|45도|열린|오픈|설치|연출|패키지|인테리어/i.test(label)&&Math.abs(Math.log(image.aspect/ratio))<.045){
        a.appearance.facade=image.url;a.appearance.orientation='inferred-front';
        a.appearance.frontEvidence={method:'same-product-photo-and-measured-aspect',photographAspect:image.aspect,physicalAspect:ratio};
      }
    }
    if(a.appearance.facade)a.appearance.facadeOffset=.000001;
    if(a.displaySpec){
      a.appearance.facade=null;
      const panel=a.displaySpec,context=source===staticImage?.file?staticImage.desc:labels[gallery.indexOf(source)]||labels[0]||'';
      let photo=await rectifyDisplayPhoto(read(source),{aspect:panel.panelSize[0]/panel.panelSize[1],folder,label:context,source,reviewedQuad:a.displayPhotoQuad});
      if(!photo.image&&panel.imageEvidence){
        const other=panel.imageEvidence,indices=other.gallery.map((_,i)=>i).sort((i,j)=>Number(/정면|front/i.test(other.labels?.[j]||''))-Number(/정면|front/i.test(other.labels?.[i]||'')));
        for(const i of indices){if(!read(other.gallery[i])||/후면|뒷면|rear|back/i.test(other.labels?.[i]||''))continue;
          const candidate=await rectifyDisplayPhoto(read(other.gallery[i]),{aspect:panel.panelSize[0]/panel.panelSize[1],folder,label:other.labels?.[i]||'',source:other.gallery[i]});
          if(candidate.image){photo={...candidate,componentEvidence:other.productId};break;}
        }
      }
      a.appearance.displayPhoto=photo;a.appearance.displayFaces=[];
      if(photo.image){
        const [pw,ph]=panel.panelSize,[left,top,right,bottom]=panel.bezel;
        const input=path.join(root,'app/web/public'+photo.image),meta=await sharp(input).metadata();
        const crop={left:Math.round(left/pw*meta.width),top:Math.round(top/ph*meta.height),width:meta.width-Math.round(left/pw*meta.width)-Math.round(right/pw*meta.width),height:meta.height-Math.round(top/ph*meta.height)-Math.round(bottom/ph*meta.height)};
        if(left+top+right+bottom>0){
          const key=crypto.createHash('sha256').update(photo.image+JSON.stringify(crop)).digest('hex').slice(0,20),file=key+'-active.webp';
          if(!fs.existsSync(path.join(folder,file)))await sharp(input).extract(crop).webp({quality:94}).toFile(path.join(folder,file));
          photo.fullPanelImage=photo.image;photo.image='/assets/spatial-references/'+file;photo.activeCrop=crop;
        }
        a.appearance.displayFaces.push({image:photo.image,face:'front',role:'active-display',size:[pw-left-right,ph-top-bottom],position:[(left-right)/2,panel.panelCenter[1]+(bottom-top)/2,panel.frontZ+.000001],curvatureRadius:panel.curvatureRadius});
      }
      const backIndex=labels.findIndex(label=>/후면|뒷면|rear|back/i.test(label)&&!/포트|확대|부분|페어|정면과/i.test(label));
      if(backIndex>=0&&read(gallery[backIndex])){
        const back=await rectifyDisplayPhoto(read(gallery[backIndex]),{aspect:panel.panelSize[0]/panel.panelSize[1],folder,label:labels[backIndex],source:gallery[backIndex]});
        if(back.image)a.appearance.displayFaces.push({image:back.image,face:'back',role:panel.sides===2?'display':'rear-casing',size:panel.panelSize.slice(0,2),position:[0,panel.panelCenter[1],panel.panelCenter[2]-panel.panelSize[2]/2-.000001],curvatureRadius:panel.curvatureRadius,bendSign:-1});
      }
      continue;
    }
    if((a.kind==='monitor'||a.componentDimensions)&&orientation==='front'&&!['mobileDisplay','curvedMonitor'].includes(a.recipe)){
      // Locate the wide display region above the thin stand. Keep the chassis
      // and stand as real geometry, and map only this verified screen crop.
      const input=path.join(root,'app/web/public'+image.url),{data,info}=await sharp(input).resize({width:256}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const spans=[];
      for(let y=0;y<info.height;y++){let lo=info.width,hi=-1;for(let x=0;x<info.width;x++){const i=(y*info.width+x)*4;if(data[i+3]>180&&Math.min(data[i],data[i+1],data[i+2])<228){lo=Math.min(lo,x);hi=x;}}spans.push({y,lo,hi,w:hi-lo+1});}
      const max=Math.max(...spans.map(r=>r.w)),wide=spans.filter(r=>r.w>=max*.82),first=wide[0],last=wide.at(-1);
      if(first&&last&&last.y>first.y){
        const left=Math.min(...wide.map(r=>r.lo)),right=Math.max(...wide.map(r=>r.hi)),height=last.y-first.y+1,width=right-left+1;
        if(width/height>1.35&&width/height<3.9){
          const file=image.sha256.slice(0,16)+'-screen.webp';
          await sharp(input).resize({width:256}).extract({left,top:first.y,width,height}).webp({quality:88}).toFile(path.join(folder,file));
          a.appearance.screenImage='/assets/spatial-references/'+file;
        }
      }
    }
  }
  return {images:assets.filter(a=>a.referenceImage).length,facades:assets.filter(a=>a.appearance?.facade).length,uniqueImages:processed.size};
}
