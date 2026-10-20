import React,{useEffect,useMemo,useState} from 'react';
import {Modal} from './common.jsx';
import {FeedbackPopup} from './feedback-popup.jsx';
import {SpatialSavedLayoutCard} from './spatial-saved-layouts.jsx';
import {SpatialMapCard} from './spatial-library.jsx';
import {useMy} from '../repositories/templates.js';
import {IND} from '../services/catalog.js';
import {loadSpatialLibrary} from '../services/spatial.js';
import {readSpatialMyLayout,spatialMyLayoutFromTemplate} from '../services/spatial-my-layout.js';
import {isSpatialStoryboardLayout,relatedSpatialLayouts} from '../domain/spatial/storyboard-layout.js';
import {spatialTemplateCatalog} from '../domain/spatial/template-catalog.js';
import '../styles/spatial.css';

export function SpatialLayoutPicker(props){
  return isSpatialStoryboardLayout(props.target,props.html)?<SpatialLayoutPickerBody {...props}/>:null;
}

function SpatialLayoutPickerBody({industry,products=[],view,onPick,onClose}){
  const my=useMy(),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[tab,setTab]=useState('saved');
  const [library,setLibrary]=useState(null),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const productsKey=JSON.stringify(products),saved=useMemo(()=>relatedSpatialLayouts(my,{industry,products,view}),[my,industry,productsKey,view]),showTemplates=tab==='templates'||saved.length===0;
  const labels=useMemo(()=>({industries:Object.entries(IND).map(([code,value])=>({code,name:value.name}))}),[]);
  useEffect(()=>{
    if(!showTemplates||library)return;
    let active=true;setLoading(true);setLoadError('');
    loadSpatialLibrary().then(value=>{if(active){setLibrary(value);setLoading(false);}}).catch(error=>{if(active){setLoadError(error.message);setLoading(false);}});
    return()=>{active=false;};
  },[showTemplates,library,attempt]);
  const displayLibrary=library||labels,search=query.trim().toLowerCase();
  const matches=item=>(filter==='all'||item.ind===filter)&&(!search||[item.name,item.txt,displayLibrary.industries.find(value=>value.code===item.ind)?.name].filter(Boolean).join(' ').toLowerCase().includes(search));
  const visible=saved.filter(matches);
  const templates=useMemo(()=>{
    if(!library)return [];
    const all=spatialTemplateCatalog(library,{scope:'full'});
    const representative=library.industries.map(industry=>all.find(template=>template.industry===industry.code)).filter(Boolean);
    return representative.filter(template=>(filter==='all'||template.industry===filter)&&(!search||[template.name,...template.rooms.map(room=>room.name),library.industries.find(industry=>industry.code===template.industry)?.name].join(' ').toLowerCase().includes(search)));
  },[library,filter,search]);
  const choose=async meta=>{
    if(busy)return;setBusy(true);setError('');
    try{await readSpatialMyLayout(meta);await onPick(meta);}catch(error){setError(error.message);}finally{setBusy(false);}
  };
  const chooseTemplate=async(template,mode)=>{
    if(busy)return;setBusy(true);setError('');setTab('templates');
    try{const saved=await spatialMyLayoutFromTemplate(template,library,mode);await onPick(saved);}catch(error){setError(error.message);}finally{setBusy(false);}
  };
  return <Modal title="조감도 레이아웃 선택" sub="선택한 조감도와 설명·연결선을 장표에 함께 적용합니다." size="wide sp-storyboard-picker" onKeyDown={event=>{if(['ArrowLeft','ArrowRight'].includes(event.key))event.stopPropagation();}} onClose={()=>{if(!busy)onClose();}} footer={<><span className="note">{busy?'조감도 레이아웃을 적용하는 중…':'조감도 관련 레이아웃에서 사용할 수 있어요.'}</span><span className="sp"/><button type="button" className="btn" disabled={busy} onClick={onClose}>닫기</button></>}>
    <div className="seg" role="group" aria-label="조감도 레이아웃 종류"><button type="button" aria-pressed={tab==='saved'} disabled={busy} onClick={()=>setTab('saved')}>저장한 조감도 {saved.length}</button><button type="button" aria-pressed={tab==='templates'} disabled={busy} onClick={()=>setTab('templates')}>업종별 템플릿</button></div>
    <div className="sp-filterbar"><select className="input" aria-label="조감도 업종" value={filter} disabled={busy} onChange={event=>setFilter(event.target.value)}><option value="all">전체 업종</option>{displayLibrary.industries.map(industry=><option key={industry.code} value={industry.code}>{industry.name}</option>)}</select><input className="input" aria-label="조감도 레이아웃 검색" placeholder="레이아웃 이름 · 업종 · 설명 검색" value={query} disabled={busy} onChange={event=>setQuery(event.target.value)}/></div>
    <FeedbackPopup message={error}/>
    {saved.length===0&&<div className="sp-storyboard-empty" role="status"><strong>저장한 조감도 레이아웃이 없어요.</strong><p>공간 조감도에서 레이아웃을 추출·저장하거나, 아래 업종별 템플릿을 선택해 바로 사용하세요.</p></div>}
    {!showTemplates&&<><p className="sp-storyboard-count">{visible.length}개{industry?' · 현재 업종과 연결 제품에 가까운 레이아웃부터 표시합니다.':''}</p>{visible.length?<div className="sp-map-grid">{visible.map(item=><SpatialSavedLayoutCard key={item.f} item={item} library={displayLibrary} onEdit={choose} disabled={busy} actionLabel="사용하기"/>)}</div>:<div className="sp-empty" role="status"><p>검색 조건에 맞는 저장 레이아웃이 없어요.</p></div>}</>}
    {showTemplates&&<><h3 className="sp-storyboard-template-title">업종별 템플릿</h3>{loading?<p role="status">업종별 템플릿을 불러오는 중…</p>:loadError?<div className="sp-storyboard-empty" role="alert"><p>{loadError}</p><button type="button" className="btn btn-sm" onClick={()=>setAttempt(value=>value+1)}>다시 불러오기</button></div>:templates.length?<div className="sp-map-grid">{templates.map(template=><SpatialMapCard key={template.id} template={template} library={library} onOpen={chooseTemplate} openLabel="사용하기" disabled={busy}/>)}</div>:library&&<div className="sp-empty" role="status"><p>검색 조건에 맞는 업종 템플릿이 없어요.</p></div>}</>}
  </Modal>;
}
