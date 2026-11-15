// 통합 조감도 히스토리 — 공간 조감도와 건물을 최근 수정순 한 목록으로 합쳐 한 쪽씩 자른다.
// 공간 조감도는 서버가 최근순으로 페이지를 준다(앞에서부터 읽은 만큼만 안다). 건물은 로컬에서 전부 읽는다.
// 아직 읽지 않은 공간 항목 사이에 낄 수 있는 건물은, 그 구간을 읽기 전에는 보여 주지 않는다.

/** 수정 시각(ms). 서버 공간 항목은 updated_at(초 또는 ms), 건물은 updatedAt(ms). */
export function historyStamp(item){
  if(item?.updatedAt!=null)return Number(item.updatedAt)||0;
  const value=Number(item?.updated_at??0)||0;
  return value>0&&value<1e11?value*1000:value;
}

const clampPage=(page,totalPages)=>Math.min(Math.max(1,Math.trunc(page)||1),totalPages||1);
// 합친 목록의 page쪽 = 합친 순서의 [start,end). 그 안에 올 수 있는 공간 항목은 공간 순서로 [start-건물 수, end)뿐이다
// (공간 i번째의 합친 위치는 i + 그보다 새 건물 수이므로).
function pageWindow(page,pageSize,buildingCount,spatialTotal){
  const known=Number.isFinite(spatialTotal),total=known?spatialTotal+buildingCount:Infinity,totalPages=known?Math.ceil(total/pageSize):Infinity;
  const current=known?clampPage(page,totalPages):Math.max(1,Math.trunc(page)||1),start=(current-1)*pageSize,end=current*pageSize;
  return {current,start,end,total,totalPages,from:Math.max(0,start-buildingCount),to:known?Math.min(spatialTotal,end):end};
}

/** 합친 목록의 page쪽을 그리려면 읽어야 하는 서버 쪽 번호(1부터, 한 쪽 pageSize개). 전체 개수를 아직 모르면 생략한다. */
export function spatialPagesFor(page,pageSize,buildingCount,spatialTotal=Infinity){
  const {from,to}=pageWindow(page,pageSize,buildingCount,spatialTotal),pages=[];
  for(let n=Math.floor(from/pageSize)+1;(n-1)*pageSize<to;n++)pages.push(n);
  return pages;
}

/**
 * @param spatial   {items: 공간 항목(최근순)의 한 구간, offset: 그 구간이 시작하는 순번(기본 0), total: 서버의 전체 개수}
 * @param buildings 건물 전체
 * @returns {items:[{type:'spatial'|'building',id,title,updatedAt,source}], total, page, totalPages, need}
 *          need가 {from,to}이면 이 쪽을 그리려면 공간 항목의 그 범위를 읽어야 한다(items는 비어 있다).
 */
export function mergeHistoryPage({spatial,buildings},page=1,pageSize=8){
  const offset=spatial.offset||0,{current,start,end,total,totalPages,from,to}=pageWindow(page,pageSize,buildings.length,spatial.total);
  const loadedEnd=offset+spatial.items.length;
  if(from<to&&(offset>from||loadedEnd<to))return {items:[],total,page:current,totalPages,need:{from,to}};
  const entry=(type,source)=>({type,id:source.id,title:source.title,updatedAt:historyStamp(source),source});
  const loaded=spatial.items.map(item=>entry('spatial',item));
  const sorted=buildings.map((item,index)=>({item:entry('building',item),index})).sort((a,b)=>b.item.updatedAt-a.item.updatedAt||a.index-b.index).map(x=>x.item);
  const placed=[];
  // 공간: 순번 + 그보다 새 건물 수 (같은 시각이면 공간이 먼저)
  loaded.forEach((item,i)=>placed.push({item,position:offset+i+sorted.filter(b=>b.updatedAt>item.updatedAt).length}));
  // 건물: 건물 안 순번 + 그 건물과 같거나 새 공간 수. 읽지 않은 구간에 걸리면 이 쪽 밖이다(앞 구간보다 새것은 앞쪽, 뒤 구간까지 이어지면 뒤쪽).
  sorted.forEach((item,j)=>{
    if(loaded.length){
      if(offset>0&&item.updatedAt>loaded[0].updatedAt)return;
      if(loadedEnd<spatial.total&&loaded.at(-1).updatedAt>=item.updatedAt)return;
    }else if(spatial.total>0&&from<to)return;
    const newer=loaded.length?offset+loaded.filter(s=>s.updatedAt>=item.updatedAt).length:spatial.total;
    placed.push({item,position:j+newer});
  });
  return {items:placed.filter(x=>x.position>=start&&x.position<end).sort((a,b)=>a.position-b.position).map(x=>x.item),total,page:current,totalPages,need:null};
}
