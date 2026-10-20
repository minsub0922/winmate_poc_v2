import React from 'react';
import { DeleteButton,Icon} from './common.jsx';
import {DetailCard} from './reference-detail.jsx';
import {SpatialObjectThumb} from './spatial-library.jsx';
import {spatialAssetLabel,spatialDimensionsLabel} from '../domain/spatial/catalog.js';
import {P} from '../services/catalog.js';
import {peopleSource} from '../domain/spatial/people-placement-geometry.js';

export function SpatialObjectDetails({object,scene,library,onRemove,onMention,onClose,disabled=false}){
  const a=library.assets.find(a=>a.id===object.assetId),r=scene.rooms.find(r=>r.id===object.roomId);
  const placement=<div className="sp-inspector"><small>{r.name} · {object.mount==='ceiling'?'천장':object.mount==='wall'?'벽면':object.mount==='surface'?'가구 위':'바닥'} 설치</small>
    <div className="sp-dimension-tag">{spatialDimensionsLabel(a.size)} mm <span>{a.dimensionSource==='catalog-spec'?'확인 치수':'추정 · 설계 치수'}</span></div>
    {a.componentDimensions&&<p className="sp-evidence">패널 {spatialDimensionsLabel(a.componentDimensions.display)} mm · 스탠드 포함 전체 크기는 설계 추정치</p>}
    {a.pose==='closed'&&<p className="sp-evidence">닫힌 노트북 본체 치수 · 참고 사진의 열린 상태와 구분</p>}
    {a.assetGroup==='people'&&<p className="sp-evidence">{[...new Set(a.roles)].join(' · ')} · {a.composition.peopleCount}명<br/>{a.composition.variant} · 사람과 가구가 함께 이동하는 연출입니다.</p>}
    {object.people?.length>0&&<p className="sp-evidence">{object.people.map(p=>peopleSource(p,Object.fromEntries(library.assets.map(a=>[a.id,a])))?.actor.role).filter(Boolean).join(' · ')} · 가구와 함께 이동하는 사람 연출</p>}
    <p className="sp-object-coordinates">X {(object.x-r.x).toFixed(2)}m · Z {(object.z-r.z).toFixed(2)}m · 높이 {object.elevation.toFixed(2)}m · 회전 {object.rotation.toFixed(0)}°</p>
    {object.facing?.targetId&&<p className="sp-facing-target">바라보는 대상 · {library.assets.find(a=>a.id===scene.objects.find(o=>o.id===object.facing.targetId)?.assetId)?.name||'공간 내부'}</p>}
    {a.dimensionEvidence&&<p className="sp-evidence">{a.dimensionEvidence.slice(1).join(': ')}</p>}
    {a.referenceImage&&<div className="sp-object-comparison"><figure><img src={a.referenceImage} alt={a.name+' 원본 제품 이미지'}/><figcaption>제품 이미지</figcaption></figure><figure><SpatialObjectThumb asset={a}/><figcaption>배치 오브젝트</figcaption></figure></div>}
  </div>;
  return <><div className="sp-object-popover-heading"><strong>{spatialAssetLabel(a)}</strong><button className="btn btn-ghost btn-icon" aria-label="오브젝트 상세 닫기" onClick={onClose}><Icon name="x" size={15}/></button></div>
    {a.productId&&P[a.productId]?<DetailCard r={'product:'+a.productId}>{placement}</DetailCard>:<div className="sp-furniture-detail"><SpatialObjectThumb asset={a}/>{placement}</div>}
    <div className="sp-object-popover-actions"><button className="btn btn-sm" disabled={disabled} onClick={()=>onMention(object.id)}>@ 프롬프트에 넣기</button><DeleteButton className="btn btn-ghost btn-sm" disabled={disabled} onClick={()=>onRemove(object.id)}><Icon name="trash" size={13}/>제거</DeleteButton></div></>;
}
