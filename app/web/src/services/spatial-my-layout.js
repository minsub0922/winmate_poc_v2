import {fetchResource} from '../api/client.js';
import {myList,myPersistent,myMeta,newF,saveTemplates,storeImage,imgUrl,dropImages} from '../repositories/templates.js';
import {spatialLayoutHtml,spatialLayoutStructure} from '../domain/spatial/my-layout.js';
import {createSpatialLayout,createRoomLabel,validSpatialLayout} from '../domain/spatial/layout.js';
import {createScene,planAnchors} from '../domain/spatial/scene.js';
import {planSvg,svgData} from '../domain/spatial/plan-svg.js';
import {captureSpatial} from './spatial.js';

export async function spatialMyLayoutFromTemplate(template,library,view='2d'){
  const scene=createScene({templateId:template.id},library);
  const snapshot=view==='3d'?await captureSpatial(scene,library):{image:svgData(planSvg(scene,library,{labels:false,productPins:false,dimensions:false,transparentBackground:true})),anchors:{width:1280,height:820,...planAnchors(scene)}};
  const layout=createSpatialLayout(scene,library,snapshot,view);
  layout.nodes=layout.targets.filter(target=>target.kind==='room').map(target=>createRoomLabel(layout,target));
  return saveSpatialMyLayout(layout);
}

export function findSpatialMyLayout(historyId){return myList().find(meta=>meta.my?.kind==='spatial'&&meta.my.spatialHistoryId===historyId&&meta.my.spatialLayout)||null;}
export async function readSpatialMyLayout(meta){
  if(!meta?.my?.spatialLayout)return null;
  const address=imgUrl(meta.my.spatialImageId);if(!address)throw new Error('저장한 조감도 이미지를 찾지 못했어요.');
  const response=await fetchResource(address);if(!response.ok)throw new Error('저장한 조감도 이미지를 불러오지 못했어요.');
  const blob=await response.blob(),image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
  const layout={...structuredClone(meta.my.spatialLayout),image};if(!validSpatialLayout(layout))throw new Error('저장한 레이아웃 데이터를 확인해 주세요.');return layout;
}
export async function saveSpatialMyLayout(layout,{historyId,templateId}={}){
  if(!myPersistent())throw new Error('저장 공간을 사용할 수 없어 레이아웃을 저장하지 못했어요.');
  if(!validSpatialLayout(layout))throw new Error('저장할 레이아웃 데이터가 올바르지 않습니다.');
  const previous=myList().find(meta=>meta.f===templateId&&meta.my?.kind==='spatial'&&meta.my.spatialHistoryId===historyId),structure=spatialLayoutStructure(layout),sameStructure=previous&&JSON.stringify(previous.my.spatialStructure)===JSON.stringify(structure),f=sameStructure?previous.f:newF();
  const imageId=await storeImage(layout.image);
  try{
    const meta=myMeta({f,name:layout.title+' · 조감도',p:'scenario',when:'공간별 제품 배치와 설명을 조감도 위에서 연결할 때',kind:'spatial',from:'L_SPATIAL_'+layout.view.toUpperCase(),title:layout.title,text:[layout.title,...layout.nodes.map(node=>node.text)].join(' '),nT:layout.nodes.length+2,nI:1,pf:Math.round(layout.imageBox.w*layout.imageBox.h/(1280*720)*100)/100,at:sameStructure?previous.my.at:0});
    meta.g='내 조감도 레이아웃';meta.p2='products';meta.ind=layout.sourceScene?.industry||null;meta.req=['spaces','products','images'];meta.ik=['aerial'];meta.ih=[layout.view.toUpperCase()+' 조감도'];meta.prods=[...new Set((layout.sourceScene?.objects||[]).filter(o=>o.assetId.startsWith('product:')).map(o=>o.assetId.slice(8)))];meta.pc=meta.prods.length;
    const {image,...snapshot}=structuredClone(layout);meta.my={...meta.my,spatialHistoryId:historyId,spatialImageId:imageId,spatialLayout:snapshot,spatialStructure:structure};
    const [saved]=await saveTemplates([{meta,html:spatialLayoutHtml(layout,'wmimg:'+imageId)}]);
    if(sameStructure&&previous.my.spatialImageId)await dropImages([previous.my.spatialImageId]).catch(()=>{});
    return saved;
  }catch(error){await dropImages([imageId]).catch(()=>{});throw error;}
}
