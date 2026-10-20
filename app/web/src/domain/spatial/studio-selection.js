import {addAsset,sceneHash} from './scene.js';
import {validateStudioForm} from './studio-form.js';

// Validate the whole selection before committing either the input or the scene.
export function addStudioSelection(form,scene,library,assetIds,roomId,{supportId}={}){
  const room=form.rooms.find(room=>room.id===roomId),assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),ids=[...new Set(assetIds)];
  if(!room||!ids.length)throw new Error('추가할 공간과 오브젝트를 선택해 주세요.');
  const selected=ids.map(id=>assets[id]);if(selected.some(a=>!a?.physical))throw new Error('배치할 수 있는 제품·가구를 선택해 주세요.');
  const nextForm=structuredClone(form),target=nextForm.rooms.find(room=>room.id===roomId);
  for(const asset of selected){
    const key=asset.productId?'products':'furniture',idKey=asset.productId?'productId':'assetId',value=asset.productId||asset.id,entries=target[key]||[],existing=entries.find(entry=>entry[idKey]===value);
    if(existing){if(Number(existing.quantity)>=30)throw new Error(asset.name+': 수량은 30개까지 추가할 수 있어요.');existing.quantity=Number(existing.quantity||0)+1;}
    else target[key]=[...entries,{[idKey]:value,quantity:1}];
  }
  const errors=validateStudioForm(nextForm,library);if(errors.length)throw new Error(errors[0]);
  let nextScene=scene;
  if(scene?.rooms.some(room=>room.id===roomId)){
    for(const asset of [...selected].sort((a,b)=>Number(a.placement?.mode==='surface')-Number(b.placement?.mode==='surface'))){
      const before=new Set(nextScene.objects.map(o=>o.id));nextScene=addAsset(nextScene,asset.id,roomId,library,{supportId});
      if(!asset.productId){const object=nextScene.objects.find(o=>!before.has(o.id)&&o.assetId===asset.id);if(object)object.studioFurniture=true;}
    }
    nextScene.contentHash=sceneHash(nextScene);
  }
  return {form:nextForm,scene:nextScene};
}
