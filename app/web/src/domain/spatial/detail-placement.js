const round=n=>Math.round(n*10000)/10000;
const surfaceKind=asset=>asset.supportSurface||asset.kind;
export function detailSurfaceHeight(asset,support,supportAsset){
  const fraction=asset.placement.surfaceHeights?.[surfaceKind(supportAsset)]??1;
  const height=supportAsset.supportSurfaceHeight??supportAsset.size[1]*fraction;
  return (support.elevation||0)+height+(asset.placement.surfaceGap??.004);
}
export function detailSupportError(object,scene,assets){
  const asset=assets[object.assetId];if(asset?.placement?.mode!=='surface')return null;
  const support=scene.objects.find(o=>o.id===object.supportId),base=support&&assets[support.assetId];
  if(!support||support.roomId!==object.roomId||!base||!asset.placement.supports.includes(surfaceKind(base)))return `${asset.name}: 알맞은 테이블·가구 위에 배치해 주세요.`;
  const angle=(support.rotation||0)*Math.PI/180,dx=object.x-support.x,dz=object.z-support.z,x=dx*Math.cos(angle)+dz*Math.sin(angle),z=-dx*Math.sin(angle)+dz*Math.cos(angle);
  const turn=(object.rotation-support.rotation)*Math.PI/180,w=Math.abs(asset.size[0]*Math.cos(turn))+Math.abs(asset.size[2]*Math.sin(turn)),d=Math.abs(asset.size[0]*Math.sin(turn))+Math.abs(asset.size[2]*Math.cos(turn));
  if(Math.abs(x)+w/2>base.size[0]/2-.012||Math.abs(z)+d/2>base.size[2]/2-.012)return `${asset.name}: 받침 가구의 상판 영역을 벗어납니다.`;
  if(Math.abs(object.elevation-detailSurfaceHeight(asset,support,base))>.012)return `${asset.name}: 받침 가구의 표면 높이에 맞춰 주세요.`;
  return null;
}
export function placeDetailAsset(scene,room,asset,assets,index,canPlace,{supportId}={}){
  let id=`${room.id}-detail-${index}`;while(scene.objects.some(o=>o.id===id))id=`${room.id}-detail-${++index}`;
  const base={id,assetId:asset.id,roomId:room.id,rotation:0,elevation:0},candidates=[];
  if(asset.placement.mode==='surface'){
    const supports=scene.objects.filter(o=>o.roomId===room.id&&asset.placement.supports.includes(surfaceKind(assets[o.assetId]))).sort((a,b)=>(a.id===supportId?-1:b.id===supportId?1:asset.placement.supports.indexOf(surfaceKind(assets[a.assetId]))-asset.placement.supports.indexOf(surfaceKind(assets[b.assetId]))));
    for(const support of supports){
      const sa=assets[support.assetId],angle=(support.rotation||0)*Math.PI/180;
      for(const [nx,nz]of [[0,0],[-.28,-.25],[.28,-.25],[-.28,.25],[.28,.25],[0,-.3],[0,.3],[-.34,0],[.34,0]]){
        const x=nx*sa.size[0],z=nz*sa.size[2];
        const object={...base,x:round(support.x+x*Math.cos(angle)-z*Math.sin(angle)),z:round(support.z+x*Math.sin(angle)+z*Math.cos(angle)),rotation:support.rotation||0,elevation:round(detailSurfaceHeight(asset,support,sa)),supportId:support.id,mount:'surface'};
        if(!detailSupportError(object,scene,assets))candidates.push(object);
      }
    }
    const chosen=candidates.find(o=>o.elevation+asset.size[1]<=room.height-.02&&canPlace(o,room,scene.objects,assets));
    if(!chosen)throw new Error(`${room.name}: ${asset.name}을 올릴 상판이 없거나 여유 공간이 부족해요. 알맞은 테이블·가구를 먼저 배치해 주세요.`);
    scene.objects.push(chosen);return;
  }
  if(asset.placement.mode==='floor-overlay'){
    const left=asset.size[0]/2+.14,right=room.width-left,front=asset.size[2]/2+.14,back=room.depth-front;
    for(const [x,z]of [[room.width/2,room.depth/2],[left,front],[right,front],[left,back],[right,back],[left,room.depth/2],[right,room.depth/2]]){
      const object={...base,x:round(room.x+x),z:round(room.z+z),elevation:asset.placement.floorOffset||0,mount:'floor'};
      const clear=scene.objects.filter(o=>o.roomId===room.id&&assets[o.assetId]?.kind==='rug').every(o=>{
        const a=assets[o.assetId],angle=o.rotation*Math.PI/180,w=Math.abs(a.size[0]*Math.cos(angle))+Math.abs(a.size[2]*Math.sin(angle)),d=Math.abs(a.size[0]*Math.sin(angle))+Math.abs(a.size[2]*Math.cos(angle));
        return Math.abs(object.x-o.x)>(asset.size[0]+w)/2+.02||Math.abs(object.z-o.z)>(asset.size[2]+d)/2+.02;
      });
      if(clear&&object.x-asset.size[0]/2>=room.x+.12&&object.x+asset.size[0]/2<=room.x+room.width-.12&&object.z-asset.size[2]/2>=room.z+.12&&object.z+asset.size[2]/2<=room.z+room.depth-.12){scene.objects.push(object);return;}
    }
    throw new Error(`${room.name}: 러그·매트의 크기나 기존 매트와의 겹침을 확인해 주세요.`);
  }
  for(const fz of [.18,.4,.65,.82])for(const fx of [.85,.14,.64,.36,.5])candidates.push({...base,x:round(room.x+room.width*fx),z:round(room.z+room.depth*fz),mount:'floor'});
  const chosen=candidates.find(o=>canPlace(o,room,scene.objects,assets));
  if(!chosen)throw new Error(`${room.name}: ${asset.name}을 놓을 바닥 여유 공간이 부족해요.`);
  scene.objects.push(chosen);
}
