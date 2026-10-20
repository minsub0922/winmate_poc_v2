// Top projection uses the same normalized coordinates and rotation-before-scale
// convention as Three.js, without loading WebGL into the SVG renderer.
export function spatialPartFootprint(part,asset){
  const points=[],[w,h,d]=part.size;
  if(part.shape==='lathe'){
    for(const [r,y]of part.profile)for(let i=0;i<48;i++){const angle=i*Math.PI/24;points.push([Math.cos(angle)*r*w,y*h,Math.sin(angle)*r*d]);}
  }else if(part.shape==='torus'){
    for(let i=0;i<48;i++)for(let j=0;j<12;j++){const angle=i*Math.PI/24,t=j*Math.PI/6,r=.8+.2*Math.cos(t);points.push([Math.cos(angle)*r*w,Math.sin(angle)*r*h,.2*Math.sin(t)*d]);}
  }else if(part.cornerRadius){
    const radius=Math.min(part.cornerRadius,w/2,h/2,d/2);
    for(const sx of [-1,1])for(const sz of [-1,1])for(const y of [-h/2,h/2])for(let i=0;i<=12;i++){const a=i*Math.PI/24;points.push([sx*(w/2-radius+Math.cos(a)*radius),y,sz*(d/2-radius+Math.sin(a)*radius)]);}
  }else if(part.shape==='cylinder'){
    for(const y of [-h/2,h/2])for(let i=0;i<32;i++){const t=i*Math.PI/16;points.push([Math.cos(t)*w,y,Math.sin(t)*d]);}
  }else if(part.shape==='sphere'){
    for(let i=0;i<32;i++){const t=i*Math.PI/16;points.push([Math.cos(t)*w,0,Math.sin(t)*d]);}
  }else if(part.shape==='curvedPanel'){
    for(let i=0;i<=40;i++){const x=i/40-.5,z=part.arc?(part.arc.radius-Math.sqrt(Math.max(0,part.arc.radius**2-(x*part.arc.width)**2)))/part.arc.depth:(part.curve||.12)*(1-4*x*x);points.push([x*w,0,z],[x*w,0,z-d]);}
  }else for(const x of [-w/2,w/2])for(const y of [-h/2,h/2])for(const z of [-d/2,d/2])points.push([x,y,z]);
  const rotate=([x,y,z])=>{
    const [rx,ry,rz]=part.rotate||[0,0,0];
    [x,y]=[x*Math.cos(rz)-y*Math.sin(rz),x*Math.sin(rz)+y*Math.cos(rz)];
    [x,z]=[x*Math.cos(ry)+z*Math.sin(ry),-x*Math.sin(ry)+z*Math.cos(ry)];
    [y,z]=[y*Math.cos(rx)-z*Math.sin(rx),y*Math.sin(rx)+z*Math.cos(rx)];
    const t=asset.geometryTransform;
    return [(x+part.position[0]+(t?.offset[0]||0))*(t?.scale[0]||1)*asset.size[0],(z+part.position[2]+(t?.offset[2]||0))*(t?.scale[2]||1)*asset.size[2]];
  };
  const projected=points.map(rotate).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const hull=[];
  for(const p of projected){while(hull.length>1&&cross(hull.at(-2),hull.at(-1),p)<=0)hull.pop();hull.push(p);}
  const lower=hull.length;
  for(const p of projected.slice(0,-1).reverse()){while(hull.length>lower&&cross(hull.at(-2),hull.at(-1),p)<=0)hull.pop();hull.push(p);}
  hull.pop();return hull;
}
