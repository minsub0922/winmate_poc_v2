import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const sharp=createRequire(new URL('../web/package.json',import.meta.url))('sharp');

// Rectify the actual product's panel, not the white image canvas, stand or room.
// All coordinates and the original source are retained for visual review.
export async function rectifyDisplayPhoto(input,{aspect,folder,label='',source='',reviewedQuad}){
  if(!reviewedQuad&&/상영관|설치 연출|라이프스타일|lifestyle|interior|생활공간/i.test(label))return {reason:'installation-photo'};
  const {data,info}=await sharp(input).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h}=info,n=w*h,mask=new Uint8Array(n),seen=new Uint8Array(n),queue=new Int32Array(n);
  let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]<150)transparent++;
  const alphaMask=transparent>n*.015;
  let foreground=0;
  for(let i=0;i<n;i++){const j=i*4;mask[i]=data[j+3]>150&&(alphaMask||Math.min(data[j],data[j+1],data[j+2])<243)?1:0;foreground+=mask[i];}
  const components=[];
  for(let start=0;start<n;start++){
    if(!mask[start]||seen[start])continue;
    let head=0,tail=1;queue[0]=start;seen[start]=1;const indices=[];
    while(head<tail){const p=queue[head++];indices.push(p);const x=p%w;
      for(const next of [x?p-1:-1,x<w-1?p+1:-1,p>=w?p-w:-1,p<n-w?p+w:-1])if(next>=0&&mask[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}
    }
    if(indices.length>30)components.push(indices);
  }
  components.sort((a,b)=>b.length-a.length);
  if(!components[0])return {reason:'no-product-silhouette'};
  if(components[1]?.length>components[0].length*.45)return {reason:'multiple-products'};
  const selected=new Uint8Array(n);for(const i of components[0])selected[i]=1;
  const rows=[];
  for(let y=0;y<h;y++){let min=w,max=-1;for(let x=0;x<w;x++)if(selected[y*w+x]){min=Math.min(min,x);max=x;}rows.push({y,min,max,width:max-min+1});}
  const maxWidth=Math.max(...rows.map(r=>r.width));
  let best=[],run=[];
  for(const row of rows){if(row.width>=maxWidth*.66)run.push(row);else{if(run.length>best.length)best=run;run=[];}}if(run.length>best.length)best=run;
  if(best.length<8)return {reason:'no-panel-region'};
  const top=best[0].y,bottom=best.at(-1).y,left=Math.min(...best.map(r=>r.min)),right=Math.max(...best.map(r=>r.max));
  const observed=(right-left+1)/(bottom-top+1);
  if(observed/aspect<.52||observed/aspect>1.65)return {reason:'panel-orientation-mismatch',observedAspect:observed,expectedAspect:aspect};
  // Find the four product corners using silhouette extremes within the screen
  // band. This removes a monitor's stem/foot and corrects a product's oblique view.
  const targets=[Infinity,-Infinity,-Infinity,Infinity],quad=[null,null,null,null];
  for(const row of best)for(const x of [row.min,row.max]){
    const u=(x-left)/(right-left||1),v=(row.y-top)/(bottom-top||1),sum=u+v,diff=u-v;
    if(sum<targets[0]){targets[0]=sum;quad[0]=[x,row.y];}
    if(diff>targets[1]){targets[1]=diff;quad[1]=[x,row.y];}
    if(sum>targets[2]){targets[2]=sum;quad[2]=[x,row.y];}
    if(diff<targets[3]){targets[3]=diff;quad[3]=[x,row.y];}
  }
  if(reviewedQuad)quad.splice(0,4,...reviewedQuad.points.map(([x,y])=>[x/reviewedQuad.sourceSize[0]*w,y/reviewedQuad.sourceSize[1]*h]));
  const area=Math.abs(quad.reduce((s,p,i)=>{const q=quad[(i+1)%4];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
  if(!reviewedQuad&&area<(right-left)*(bottom-top)*.62)return {reason:'non-rectangular-product'};
  const [p0,p1,p2,p3]=quad,dx1=p1[0]-p2[0],dx2=p3[0]-p2[0],dx3=p0[0]-p1[0]+p2[0]-p3[0],dy1=p1[1]-p2[1],dy2=p3[1]-p2[1],dy3=p0[1]-p1[1]+p2[1]-p3[1],den=dx1*dy2-dx2*dy1;
  if(Math.abs(den)<1e-8)return {reason:'degenerate-panel'};
  const g=(dx3*dy2-dx2*dy3)/den,k=(dx1*dy3-dx3*dy1)/den;
  const A=p1[0]-p0[0]+g*p1[0],B=p3[0]-p0[0]+k*p3[0],D=p1[1]-p0[1]+g*p1[1],E=p3[1]-p0[1]+k*p3[1];
  const ow=Math.round(aspect>=1?768:768*aspect),oh=Math.round(aspect>=1?768/aspect:768),out=Buffer.alloc(ow*oh*4);
  for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
    const u=x/(ow-1),v=y/(oh-1),div=g*u+k*v+1,sx=Math.max(0,Math.min(w-1,(A*u+B*v+p0[0])/div)),sy=Math.max(0,Math.min(h-1,(D*u+E*v+p0[1])/div)),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),fx=sx-x0,fy=sy-y0,idx=(y*ow+x)*4;
    for(let c=0;c<4;c++)out[idx+c]=Math.round((data[(y0*w+x0)*4+c]*(1-fx)+data[(y0*w+x1)*4+c]*fx)*(1-fy)+(data[(y1*w+x0)*4+c]*(1-fx)+data[(y1*w+x1)*4+c]*fx)*fy);
  }
  const digest=crypto.createHash('sha256').update(input).update(JSON.stringify([aspect,quad,'rectify-v1'])).digest('hex').slice(0,20),file=digest+'-panel.webp';
  if(!fs.existsSync(path.join(folder,file)))await sharp(out,{raw:{width:ow,height:oh,channels:4}}).webp({quality:94}).toFile(path.join(folder,file));
  return {image:'/assets/spatial-references/'+file,source,method:'product-silhouette-homography',quad,sourceSize:[w,h],outputSize:[ow,oh],labelledFront:/정면|전면|front/i.test(label)};
}
