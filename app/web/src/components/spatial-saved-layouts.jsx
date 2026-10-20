import React,{useMemo,useState} from 'react';
import {Icon,Modal} from './common.jsx';
import {FitSlide} from '../domain/slides/Slide.jsx';

export function SpatialSavedLayoutCard({item,library,onEdit,disabled=false,actionLabel='수정하기'}){
  const layout=item.my.spatialLayout,industry=library.industries.find(industry=>industry.code===(item.ind||layout.sourceScene?.industry));
  return <article className="sp-map-card sp-saved-layout-card" data-layout-id={item.f} aria-label={item.name}>
    <button type="button" className="sp-saved-layout-open" aria-label={item.name+' '+actionLabel} disabled={disabled} onClick={()=>onEdit(item)}>
      <div className="sp-saved-layout-preview" aria-hidden="true"><FitSlide key={item.my.up} f={item.f} lazy/></div>
      <div className="sp-saved-layout-caption"><div><small>{[industry?.name,layout.view.toUpperCase()+' 레이아웃'].filter(Boolean).join(' · ')}</small><h3>{item.name}</h3><p>{layout.sourceScene?.rooms?.length||layout.targets.filter(target=>target.kind==='room').length}개 공간 · 설명 {layout.nodes.filter(node=>node.type==='callout').length}개</p></div><span className="sp-saved-layout-edit"><Icon name={actionLabel==='수정하기'?'edit':'check'} size={16}/>{actionLabel}</span></div>
    </button>
  </article>;
}

export function SpatialSavedLayoutsDialog({items,library,onEdit,onClose,disabled=false}){
  const [query,setQuery]=useState('');
  const filtered=useMemo(()=>{
    const search=query.trim().toLowerCase();
    return search?items.filter(item=>[item.name,item.my.spatialLayout.title,item.txt,library.industries.find(industry=>industry.code===item.ind)?.name].filter(Boolean).join(' ').toLowerCase().includes(search)):items;
  },[items,library,query]);
  return <Modal title="Layout 히스토리 전체 보기" sub="저장한 레이아웃을 선택하면 각도와 설명을 다시 수정할 수 있어요." size="wide sp-saved-layouts-modal" onClose={onClose}>
    <div className="sp-filterbar"><input className="input" aria-label="조감도 레이아웃 검색" placeholder="레이아웃 이름 · 업종 · 설명 검색" value={query} onChange={event=>setQuery(event.target.value)}/><span>{filtered.length}개</span></div>
    {filtered.length?<div className="sp-map-grid">{filtered.map(item=><SpatialSavedLayoutCard key={item.f} item={item} library={library} onEdit={onEdit} disabled={disabled}/>)}</div>:<div className="sp-empty" role="status"><p>{query?'검색 조건에 맞는 레이아웃이 없어요.':'아직 저장한 조감도 레이아웃이 없어요.'}</p></div>}
  </Modal>;
}
