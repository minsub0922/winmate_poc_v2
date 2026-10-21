// Browser-only geometry probe. Keep self-contained for Playwright serialization.
export function measureSlide(root) {
  const frame=root.getBoundingClientRect(),scale=frame.width/1280,tolerance=3*scale;
  const visible=el=>{for(let n=el;n&&n!==root.parentElement;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return false;}return true;};
  const rect=r=>({x:r.x-frame.x,y:r.y-frame.y,w:r.width,h:r.height});
  const intersect=(a,b)=>({x:Math.max(a.left,b.left),y:Math.max(a.top,b.top),w:Math.min(a.right,b.right)-Math.max(a.left,b.left),h:Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)});
  const clipped=[],overflow=[],fontOverhang=[],outside=[],occluded=[],distortedShapes=[],boxes=[];
  for(const el of root.querySelectorAll('*')){
    const s=el.style,w=parseFloat(s.width),h=parseFloat(s.height)||parseFloat(s.minHeight),radius=s.borderRadius||s.borderTopLeftRadius;
    if(!visible(el)||!radius||!s.width.endsWith('px')||!(w>0&&h>0))continue;
    const equal=Math.abs(w-h)<.5,round=radius.includes('%')?parseFloat(radius)>=50:parseFloat(radius)>=Math.min(w,h)/2-.5;
    const circle=el.dataset.layoutShape==='circle'||equal&&round;
    const icon=el.dataset.layoutShape==='square'||equal&&w<=64&&parseFloat(radius)>0;
    const r=el.getBoundingClientRect();if(r.width<scale||r.height<scale)continue;
    if((circle||icon)&&Math.abs(r.width-r.height)>Math.max(1.5*scale,Math.min(r.width,r.height)*.04))distortedShapes.push({i:el.dataset.tb||null,kind:circle?'circle':'square',text:el.textContent.trim().slice(0,60),expected:w,w:r.width/scale,h:r.height/scale});
    else if(!circle&&round&&w>=16&&el.textContent.trim()&&r.height>r.width*1.12&&r.height>24*scale)distortedShapes.push({i:el.dataset.tb||null,kind:'vertical-pill',text:el.textContent.trim().slice(0,60),w:r.width/scale,h:r.height/scale});
  }
  const pixel=document.createElement('canvas');pixel.width=pixel.height=1;const ctx=pixel.getContext('2d',{willReadFrequently:true});
  const paintsAt=(top,slot,x,y)=>{
    if(top.tagName==='IMG'){
      try{
        const b=top.getBoundingClientRect(),cs=getComputedStyle(top),nw=top.naturalWidth,nh=top.naturalHeight;
        let sx=b.width/nw,sy=b.height/nh;
        if(cs.objectFit!=='fill'){const fit=cs.objectFit==='contain'?Math.min(sx,sy):Math.max(sx,sy);sx=sy=cs.objectFit==='scale-down'?Math.min(1,fit):fit;}
        const pos=cs.objectPosition.split(/\s+/),fraction=v=>v?.endsWith('%')?parseFloat(v)/100:v==='left'||v==='top'?0:v==='right'||v==='bottom'?1:.5;
        const ix=(x-b.left-(b.width-nw*sx)*fraction(pos[0]))/sx,iy=(y-b.top-(b.height-nh*sy)*fraction(pos[1]))/sy;
        if(ix>=0&&iy>=0&&ix<nw&&iy<nh){ctx.clearRect(0,0,1,1);ctx.drawImage(top,ix,iy,1,1,0,0,1,1);if(ctx.getImageData(0,0,1,1).data[3]>64)return true;}
      }catch{return true;}
    }
    for(let node=top;node&&slot.contains(node);node=node.parentElement){const color=getComputedStyle(node).backgroundColor,m=/rgba?\(([^)]+)\)/.exec(color);if(m){const values=m[1].split(',').map(Number);if(values.length===3||values[3]>.25)return true;}if(node===slot)break;}
    return false;
  };
  // Enable hit testing without changing painting or layout in read-only views.
  for(const el of root.querySelectorAll('[data-tb],[data-img],img'))el.style.pointerEvents='auto';
  for(const el of root.querySelectorAll('[data-tb]:not([data-img])')){
    if(!el.textContent.trim()||!visible(el))continue;
    const cs=getComputedStyle(el),range=document.createRange();range.selectNodeContents(el);
    const lines=[...range.getClientRects()].filter(r=>r.width>scale&&r.height>scale);
    if(!lines.length)continue;
    for(let parent=el.parentElement;parent&&parent!==root;parent=parent.parentElement){
      const bounds=parent.getBoundingClientRect(),style=getComputedStyle(parent),cutX=/hidden|clip|auto|scroll/.test(style.overflowX),cutY=/hidden|clip|auto|scroll/.test(style.overflowY);
      if(bounds.width&&bounds.height&&lines.some(line=>cutX&&(line.left<bounds.left-4*scale||line.right>bounds.right+4*scale)||cutY&&(line.top<bounds.top-4*scale||line.bottom>bounds.bottom+4*scale))){clipped.push({i:el.dataset.tb,text:el.textContent,ancestor:parent.dataset.tb||parent.dataset.img||parent.tagName});break;}
    }
    if(el.clientWidth&&el.scrollWidth>el.clientWidth+3||el.clientHeight&&el.scrollHeight>el.clientHeight+4){
      const item={i:el.dataset.tb,text:el.textContent,w:el.clientWidth,sw:el.scrollWidth,h:el.clientHeight,sh:el.scrollHeight};
      // Font ascenders/descenders may extend past a short visible line box.
      // That is safe only when not clipped; collisions and occlusion are checked independently.
      const horizontal=el.scrollWidth>el.clientWidth+3,cut=horizontal&&cs.overflowX!=='visible'||el.scrollHeight>el.clientHeight+4&&cs.overflowY!=='visible';
      if(horizontal||cut)overflow.push(item);else fontOverhang.push(item);
      if(cut)clipped.push(item);
    }
    if(lines.some(r=>r.left<frame.left-tolerance||r.top<frame.top-tolerance||r.right>frame.right+tolerance||r.bottom>frame.bottom+tolerance))outside.push({i:el.dataset.tb,text:el.textContent,lines:lines.map(rect)});
    const hiddenBy=new Set();
    for(const image of root.querySelectorAll('[data-img]')){
      if(image.contains(el)||el.contains(image)||!visible(image))continue;
      const ir=image.getBoundingClientRect();
      for(const line of lines){
        const area=intersect(line,ir);if(area.w<5*scale||area.h<5*scale)continue;
        for(const fraction of [.15,.5,.85]){
          const x=area.x+area.w*fraction,y=area.y+area.h*.5;
          if(x<0||y<0||x>=innerWidth||y>=innerHeight)continue;
          const top=document.elementFromPoint(x,y);
          if(top&&(top===image||image.contains(top))&&!el.contains(top)&&paintsAt(top,image,x,y))hiddenBy.add(image.dataset.img);
        }
      }
    }
    if(hiddenBy.size)occluded.push({i:el.dataset.tb,text:el.textContent,images:[...hiddenBy]});
    boxes.push({el,i:el.dataset.tb,lines,text:el.textContent});
  }
  const overlaps=[];
  for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){
    const x=boxes[a],y=boxes[b];if(x.el.contains(y.el)||y.el.contains(x.el))continue;
    if(x.lines.some(r=>y.lines.some(s=>{const q=intersect(r,s);return q.w>8*scale&&q.h>5*scale&&q.w*q.h>Math.min(r.width*r.height,s.width*s.height)*.15;})))overlaps.push({a:x.i,b:y.i,textA:x.text,textB:y.text});
  }
  return {clipped,overflow,fontOverhang,overlaps,outside,occluded,distortedShapes};
}
