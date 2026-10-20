import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// Rotate a normalized part BEFORE scaling x/y/z to physical dimensions.
// Cylinder radii on x and z are independent; rotating a metre-scaled cylinder
// would turn a shallow grille into a protruding drum on a tall appliance.
export function spatialPartGeometry(part,dimensions,transform){
  let geometry;
  if(part.shape==='box'&&part.physicalCornerRadius!==undefined&&!(part.rotate||[]).some(Boolean)){
    const size=part.size.map((n,i)=>n*dimensions[i]*(transform?.scale[i]??1)),radius=Math.min(part.physicalCornerRadius,...size.map(n=>n/2));
    return radius>0?new RoundedBoxGeometry(...size,3,radius):new THREE.BoxGeometry(...size);
  }
  if(part.shape==='lathe')geometry=new THREE.LatheGeometry(part.profile.map(([r,y])=>new THREE.Vector2(r,y)),48).scale(...part.size);
  else if(part.shape==='torus')geometry=new THREE.TorusGeometry(.8,.2,12,48).scale(...part.size);
  else if(part.shape==='sphere')geometry=new THREE.SphereGeometry(1,16,12).scale(...part.size);
  else if(part.shape==='cylinder')geometry=new THREE.CylinderGeometry(1,1,1,32).scale(...part.size);
  else if(part.shape==='curvedPanel'){
    const [w,h,d]=part.size,curve=part.curve||.12,points=[];
    const bend=x=>part.arc?(part.arc.radius-Math.sqrt(Math.max(0,part.arc.radius**2-(x*part.arc.width)**2)))/part.arc.depth:curve*(1-4*x*x);
    for(let i=0;i<=40;i++){const x=i/40-.5;points.push(new THREE.Vector2(x*w,bend(x)));}
    for(let i=40;i>=0;i--){const x=i/40-.5;points.push(new THREE.Vector2(x*w,bend(x)-d));}
    geometry=new THREE.ExtrudeGeometry(new THREE.Shape(points),{depth:h,bevelEnabled:false,steps:1});
    geometry.rotateX(Math.PI/2).translate(0,h/2,0);
  }else if(part.shape==='box'){
    const radius=Math.min(Math.min(...part.size)/2,part.cornerRadius??Math.min(.018,Math.min(...part.size)*.08));
    geometry=new RoundedBoxGeometry(...part.size,part.cornerRadius?5:2,radius);
  }else throw new Error('지원하지 않는 공간 부품 형상: '+part.shape);
  if(part.rotate){const matrix=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...part.rotate));geometry.applyMatrix4(matrix);}
  geometry.scale(...dimensions.map((n,i)=>n*(transform?.scale[i]??1)));
  return geometry;
}

export function spatialDisplayFaceGeometry(face){
  if(!face.curvatureRadius)return new THREE.PlaneGeometry(...face.size);
  const [w,h]=face.size,r=face.curvatureRadius,positions=[],uv=[],indices=[],segments=48;
  for(let row=0;row<2;row++)for(let i=0;i<=segments;i++){
    const x=(i/segments-.5)*w,z=(r-Math.sqrt(Math.max(0,r*r-x*x)))*(face.bendSign||1);
    positions.push(x,(.5-row)*h,z);uv.push(i/segments,1-row);
  }
  for(let i=0;i<segments;i++){const a=i,b=i+segments+1;indices.push(a,b,a+1,b,b+1,a+1);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export function spatialPartPosition(part,asset){
  return part.position.map((n,i)=>(n+(asset.geometryTransform?.offset[i]??0))*(asset.geometryTransform?.scale[i]??1)*asset.size[i]);
}

export function spatialRecipeTransform(parts){
  const bounds=new THREE.Box3();
  for(const part of parts){const g=spatialPartGeometry(part,[1,1,1]);g.computeBoundingBox();bounds.union(g.boundingBox.translate(new THREE.Vector3(...part.position)));g.dispose();}
  const size=bounds.getSize(new THREE.Vector3()).toArray(),center=bounds.getCenter(new THREE.Vector3()).toArray();
  return {scale:size.map(n=>1/n),offset:[-center[0],-bounds.min.y,-center[2]]};
}
