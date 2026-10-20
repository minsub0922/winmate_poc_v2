export function isSpatialStoryboardLayout(meta,html=''){
  return !!meta&&(meta.my?.kind==='spatial'&&!!meta.my.spatialLayout||(meta.ik||[]).includes('aerial')||/^L_SPATIAL_(2D|3D)$/.test(meta.f)||/\bdata-spatial-(?:template|layout)=/.test(html));
}

export const isSpatialLayoutSelection=sheet=>sheet?.spatialLayout?.version===1&&sheet.spatialLayout.templateId===sheet.f&&/^L_MY_/.test(sheet.f);

export function selectSpatialStoryboardLayout(sheet,target,selected,html=''){
  if(!isSpatialStoryboardLayout(target,html))throw new Error('조감도 관련 레이아웃에서만 사용할 수 있어요.');
  if(selected?.my?.kind!=='spatial'||!selected.my.spatialLayout||!/^L_MY_/.test(selected.f))throw new Error('추출한 조감도 레이아웃을 선택해 주세요.');
  return {...sheet,f:selected.f,status:'done',ov:{t:{},img:{},...(sheet.ov?.bg?{bg:structuredClone(sheet.ov.bg)}:{})},ev:{},
    spatialHistoryId:selected.my.spatialHistoryId||null,
    source:{type:'spatial-layout',layoutId:selected.f,contentHash:selected.my.spatialLayout.sourceScene?.contentHash,sceneVersion:selected.my.spatialLayout.sourceScene?.version},
    spatialLayout:{version:1,templateId:selected.f,historyId:selected.my.spatialHistoryId||null,view:selected.my.spatialLayout.view},
  };
}

export function relatedSpatialLayouts(items,{industry,products=[],view}={}){
  const selected=new Set(products);
  const score=item=>(industry&&item.ind===industry?100:0)+(view&&item.my.spatialLayout.view===view?5:0)+(item.prods||[]).filter(id=>selected.has(id)).length*3;
  return items.filter(item=>item.my?.kind==='spatial'&&item.my.spatialLayout).slice().sort((a,b)=>score(b)-score(a)||(b.my.up||0)-(a.my.up||0));
}
