import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Icon,Modal} from './common.jsx';
import {SpatialObjectThumb} from './spatial-library.jsx';
import {useSpatialObjectPeek} from './spatial-object-preview.jsx';
import {groupSpatialAssets,spatialAssetLabel,spatialAssetMatches,spatialAssetInFamily,isSpatialCatalogAsset} from '../domain/spatial/catalog.js';

export function SpatialObjectDrawer({library,canSelect,rooms,roomId,onRoomChange,onAdd,onClose,busy=false}){
  const [family,setFamily]=useState('all'),[category,setCategory]=useState('all'),[query,setQuery]=useState(''),[page,setPage]=useState(1),[chosen,setChosen]=useState([]),[preview,setPreview]=useState(null),[error,setError]=useState('');
  const peek=useSpatialObjectPeek(),groups=useMemo(()=>groupSpatialAssets(library.assets),[library]);
  const scrollRoot=useRef(null),loadNext=useRef(null);
  const assetMap=useMemo(()=>Object.fromEntries(library.assets.map(a=>[a.id,a])),[library]),selected=chosen.map(id=>assetMap[id]).filter(Boolean);
  const filtered=useMemo(()=>groups.flatMap(group=>{const members=group.members.filter(a=>spatialAssetInFamily(a,family)&&(!['furniture','people'].includes(family)||category==='all'||a.category===category)&&spatialAssetMatches(a,query));return members.length?[{...group,representative:members[0]}]:[];}),[groups,family,category,query]);
  const previewGroup=preview&&groups.find(group=>group.members.some(a=>a.id===preview.id));
  const shown=Math.min(page*40,filtered.length),hasMore=shown<filtered.length;
  useEffect(()=>{setPage(1);scrollRoot.current?.scrollTo({top:0});peek.hide();},[family,category,query]);
  useEffect(()=>{
    if(!hasMore||!scrollRoot.current||!loadNext.current)return;
    let active=true;
    const observer=new IntersectionObserver(entries=>{
      if(active&&entries.some(entry=>entry.isIntersecting)){
        active=false;observer.disconnect();setPage(value=>Math.min(value+1,Math.ceil(filtered.length/40)));
      }
    },{root:scrollRoot.current,rootMargin:'0px 0px 240px 0px',threshold:0});
    observer.observe(loadNext.current);return()=>{active=false;observer.disconnect();};
  },[page,hasMore,filtered.length,family,category,query]);
  const toggle=asset=>{if(!canSelect||busy||!asset.physical)return;setError('');setChosen(ids=>ids.includes(asset.id)?ids.filter(id=>id!==asset.id):[...ids,asset.id]);};
  const changeModel=next=>{if(canSelect&&preview&&chosen.includes(preview.id))setChosen(ids=>[...new Set([...ids.filter(id=>id!==preview.id),next.id])]);setPreview(next);peek.hide();};
  const add=async()=>{if(!canSelect||busy||!selected.length||!roomId)return;setError('');try{await onAdd(selected.map(a=>a.id),roomId);onClose();}catch(e){setError(e.message);}};
  const footer=<div className="sp-drawer-footer">
    {!canSelect?<p>스튜디오에서 제품·가구를 선택해 추가할 수 있어요.</p>:<>
      <div className="sp-drawer-selection-heading"><strong>{selected.length}개 선택</strong>{selected.length>0&&<button type="button" disabled={busy} onClick={()=>setChosen([])}>선택 해제</button>}</div>
      {selected.length>0&&<div className="sp-drawer-selected">{selected.map(a=><button key={a.id} type="button" disabled={busy} aria-label={spatialAssetLabel(a)+' 선택 해제'} onClick={()=>toggle(a)}>{spatialAssetLabel(a)}<Icon name="x" size={12}/></button>)}</div>}
      {!rooms.length&&<p>스튜디오에 공간을 추가한 뒤 선택한 항목을 넣어 주세요.</p>}
      <div className="sp-drawer-add"><label>추가할 공간<select aria-label="오브젝트 배치 공간" disabled={busy||!rooms.length} value={roomId} onChange={e=>onRoomChange(e.target.value)}><option value="" disabled>공간을 선택하세요</option>{rooms.map((room,i)=><option key={room.id} value={room.id}>{room.name||'공간 '+(i+1)}</option>)}</select></label><button type="button" className="btn btn-primary" disabled={busy||!roomId||!selected.length} onClick={add}>{busy?'추가하는 중…':`선택한 ${selected.length}개 추가`}</button></div>
    </>}
  </div>;
  return <><Modal title="제품 · 가구 오브젝트" sub={canSelect?'여러 항목을 골라 현재 스튜디오에 추가하세요.':'제품·가구·사람 연출을 둘러보고 상세 정보를 확인하세요.'} size="sp-object-drawer sp-objects-popup" bodyStyle={{padding:0,gap:0}} onClose={()=>{if(!busy){peek.hide();onClose();}}} footer={footer}>
    <div id="sp-library-popup" className="sp-popup-scroll" ref={scrollRoot} onScroll={peek.hide}>
      <div className="sp-filterbar"><select aria-label="오브젝트 제품군" value={family} onChange={e=>{setFamily(e.target.value);setCategory('all');}}><option value="all">전체 제품 · 가구</option><option value="furniture">공용 가구 · 소품</option><option value="people">사람 · 직종 연출</option>{[...new Set(library.assets.map(a=>a.family).filter(Boolean))].map(value=><option key={value}>{value}</option>)}</select>{['furniture','people'].includes(family)&&<select aria-label={family==='people'?'사람 연출 종류':'공용 가구 종류'} value={category} onChange={e=>setCategory(e.target.value)}><option value="all">{family==='people'?'모든 사람 연출':'모든 공용 가구'}</option>{[...new Set(library.assets.filter(a=>isSpatialCatalogAsset(a)&&spatialAssetInFamily(a,family)).map(a=>a.category).filter(Boolean))].map(value=><option key={value}>{value}</option>)}</select>}<input aria-label="오브젝트 검색" value={query} onChange={e=>setQuery(e.target.value)} placeholder={family==='people'?'직종 · 행동 · 공간 검색':'제품명 · 가구 · 업종 · 공간 검색'}/><span>{filtered.length}개</span></div>
      <div className="sp-object-grid">{filtered.slice(0,page*40).map(group=>{const a=group.representative,isChosen=chosen.includes(a.id);return <button type="button" key={group.id} className="sp-object-card" title={a.productId?undefined:a.description} aria-label={spatialAssetLabel(a)} aria-pressed={canSelect&&a.physical?isChosen:undefined} disabled={busy} onMouseEnter={e=>peek.show(a,e.currentTarget)} onMouseLeave={peek.hide} onPointerDown={()=>peek.hide()} onFocus={e=>{if(e.target===e.currentTarget&&e.currentTarget.matches(':focus-visible'))peek.show(a,e.currentTarget,true);}} onBlur={peek.hide} onClick={e=>{peek.hide();setPreview(a);if(canSelect&&a.physical)toggle(a);else if(a.productId)peek.open(a,e.currentTarget);}}><SpatialObjectThumb asset={a}/>{canSelect&&a.physical&&<span className={'sp-drawer-check'+(isChosen?' selected':'')} aria-hidden="true">{isChosen&&<Icon name="check" size={13}/>}</span>}<strong>{query?spatialAssetLabel(a):group.name}</strong>{!a.physical&&<small>설치 대상 아님</small>}</button>;})}</div>
      {!filtered.length&&<p className="sp-empty-results">검색어에 맞는 오브젝트가 없어요.</p>}{filtered.length>0&&<div ref={loadNext} className="sp-object-pagination" role="status" aria-live="polite" data-visible-count={shown} data-total-count={filtered.length}>{hasMore?'스크롤하면 다음 오브젝트를 표시합니다.':'모든 오브젝트를 표시했어요.'}<span>{shown} / {filtered.length}</span></div>}
    </div>
    {preview&&<div className="sp-drawer-preview">{preview.productId?<button type="button" className="sp-placement-product" {...peek.props(preview)}>{spatialAssetLabel(preview)}</button>:<strong>{spatialAssetLabel(preview)}</strong>}{previewGroup?.members.length>1&&<select aria-label="제품 모델 선택" disabled={busy} value={preview.id} onChange={e=>changeModel(assetMap[e.target.value])}>{previewGroup.members.map(a=><option key={a.id} value={a.id}>{spatialAssetLabel(a)}</option>)}</select>}{preview.productId&&<button type="button" className="btn btn-ghost btn-sm" onClick={e=>peek.open(preview,e.currentTarget)}>상세 보기</button>}</div>}
    {error&&<div className="sp-drawer-error" role="alert">{error}</div>}
  </Modal>{peek.node}</>;
}
