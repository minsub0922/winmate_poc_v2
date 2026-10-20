import {objectBounds,sceneHash,validateScene} from './scene.js';

// Keep edited coordinates and immutable old asset revisions. A larger measured
// product must pass real placement validation before the revision is adopted.
export function upgradeSpatialAssets(scene,library,previousLibrary){
  const next=structuredClone(scene),assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),rooms=Object.fromEntries(next.rooms.map(r=>[r.id,r]));
  const previous=Object.fromEntries((previousLibrary?.assets||[]).map(a=>[a.id,a]));
  next.assetRevision=library.sourceHash;next.assetVersion=library.version;
  for(const object of next.objects){
    const asset=assets[object.assetId],room=rooms[object.roomId];if(!asset||!room)throw new Error('업데이트할 제품·공간 정보를 찾지 못했습니다.');
    if(previous[asset.id]?.size.every((n,i)=>Math.abs(n-asset.size[i])<.000001))continue;
    if(object.mount==='ceiling')object.elevation=Math.max(0,room.height-asset.size[1]-.12);
    else if(object.mount==='wall')object.elevation=Math.max(0,Math.min(object.elevation,room.height-asset.size[1]-.12));
    const b=objectBounds(object,assets);
    if(b.x<room.x+.12)object.x+=room.x+.12-b.x;
    else if(b.x+b.w>room.x+room.width-.12)object.x-=b.x+b.w-(room.x+room.width-.12);
    if(b.z<room.z+.12)object.z+=room.z+.12-b.z;
    else if(b.z+b.d>room.z+room.depth-.12)object.z-=b.z+b.d-(room.z+room.depth-.12);
  }
  const {errors}=validateScene(next,library);
  if(errors.length)throw new Error('새 실측 크기에 맞게 배치를 조정해야 합니다. 조감도 만들기로 다시 배치해 주세요. '+errors[0]);
  next.revision=(next.revision||0)+1;next.contentHash=sceneHash(next);return next;
}
