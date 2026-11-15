// @ 태깅 목록 — 명령 입력창에서 @를 치면 공간 · 제품 · 오브젝트 세 묶음이 한 목록에 나온다.
//   공간     room   장면에 있는 공간            · space  새로 추가할 공간 종류(SPACE_TYPES)
//   제품     object 배치된 삼성 제품          · asset  카탈로그 제품(새로 추가)
//   오브젝트 object 배치된 가구 · 사람 연출   · asset  카탈로그 가구 · 사람 연출(새로 추가)
// 묶음 안에서는 지금 보는 공간 → 배치된 것 → 새로 추가할 것 순서다(이름을 치면 이미 놓인 것이 먼저 잡힌다).
// 사람은 "사람 연출" 묶음 단위다. 가구에 앉혀진 사람은 그 가구를 태그한다(검색어 "사람"으로 찾을 수 있다).
import {spatialAssetLabel,spatialAssetMatches} from './catalog.js';
import {SPACE_TYPES} from './studio-form.js';

export const MENTION_GROUPS=['공간','제품','오브젝트'];

export function mentionOptions(scene,library,{roomId}={}){
  const assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),rooms=scene?.rooms||[],options=[];
  for(const room of rooms)options.push({kind:'room',id:room.id,group:'공간',label:room.name,hint:'장면의 공간',roomId:room.id});
  for(const [kind,name] of SPACE_TYPES)options.push({kind:'space',id:kind,group:'공간',label:name,hint:'새 공간 추가'});
  for(const [index,object] of (scene?.objects||[]).entries()){
    const asset=assets[object.assetId];if(!asset)continue;
    const place=`${rooms.find(r=>r.id===object.roomId)?.name||'공간'} #${index+1}`,people=object.people?.length||0;
    options.push({kind:'object',id:object.id,group:asset.productId?'제품':'오브젝트',asset,roomId:object.roomId,label:`${spatialAssetLabel(asset)} · ${place}`,hint:people?`${place} · 사람 ${people}명`:place,people});
  }
  for(const asset of library.assets)if(asset.physical&&asset.catalogVisible!==false)
    options.push({kind:'asset',id:asset.id,group:asset.productId?'제품':'오브젝트',asset,label:spatialAssetLabel(asset)+' · 새로 추가',hint:'카탈로그 · 새로 추가'});
  return options;
}

function matches(option,query){
  if(option.label.toLocaleLowerCase().includes(query)||option.hint.toLocaleLowerCase().includes(query))return true;
  if(option.asset&&spatialAssetMatches(option.asset,query))return true;
  if(option.asset?.assetGroup==='people'&&'사람'.startsWith(query))return true;
  return false;
}
// 묶음 안의 순서: 지금 보는 공간 → 장면에 있는 것 → 새로 추가할 것
const rank=(option,roomId)=>option.kind==='room'||option.kind==='object'?(roomId&&option.roomId===roomId?0:1):2;

/** 검색어로 좁힌 목록(묶음 순서 공간 → 제품 → 오브젝트). 한 묶음이 목록을 독차지하지 않게 먼저 고르게 나눈다. */
export function filterMentionOptions(options,query='',{roomId,limit=40}={}){
  const text=query.trim().toLocaleLowerCase();
  const groups=MENTION_GROUPS.map(group=>options.filter(o=>o.group===group&&(!text||matches(o,text)))
    .map((option,index)=>({option,index})).sort((a,b)=>rank(a.option,roomId)-rank(b.option,roomId)||a.index-b.index).map(entry=>entry.option));
  const share=Math.ceil(limit/MENTION_GROUPS.length),taken=groups.map(items=>Math.min(items.length,share));
  let spare=limit-taken.reduce((a,b)=>a+b,0);
  for(let i=0;i<groups.length&&spare>0;i++){const extra=Math.min(spare,groups[i].length-taken[i]);taken[i]+=extra;spare-=extra;}
  while(taken.reduce((a,b)=>a+b,0)>limit)taken[taken.indexOf(Math.max(...taken))]--;
  // 묶음이 잘릴 때는 "새로 추가할 것"에 자리의 3분의 1을 남긴다 — 이미 놓인 것이 많아도 @만 쳐서 새로 넣을 것을 고를 수 있게.
  return groups.flatMap((items,i)=>{
    if(items.length<=taken[i])return items;
    const placed=items.filter(o=>rank(o,roomId)<2),fresh=items.filter(o=>rank(o,roomId)===2);
    const kept=Math.min(placed.length,taken[i]-Math.min(fresh.length,Math.floor(taken[i]/3)));
    return [...placed.slice(0,kept),...fresh.slice(0,taken[i]-kept)];
  });
}
