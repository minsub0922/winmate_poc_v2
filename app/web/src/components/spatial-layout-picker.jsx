import React,{useEffect,useMemo,useState} from 'react';
import {Modal} from './common.jsx';
import {FeedbackPopup} from './feedback-popup.jsx';
import {SpatialSavedLayoutCard} from './spatial-saved-layouts.jsx';
import {SpatialMapCard} from './spatial-library.jsx';
import {useMy} from '../repositories/templates.js';
import {IND} from '../services/catalog.js';
import {loadSpatialLibrary,loadSpatialHistory} from '../services/spatial.js';
import {SpatialLayoutCreate} from './spatial-layout-create.jsx';
import {planSvg,svgData} from '../domain/spatial/plan-svg.js';
import {readSpatialMyLayout,spatialMyLayoutFromTemplate} from '../services/spatial-my-layout.js';
import {isSpatialStoryboardLayout,relatedSpatialLayouts} from '../domain/spatial/storyboard-layout.js';
import {spatialTemplateCatalog} from '../domain/spatial/template-catalog.js';
import '../styles/spatial.css';
import '../styles/birdseye.css';

export function SpatialLayoutPicker(props){
  return isSpatialStoryboardLayout(props.target,props.html)?<SpatialLayoutPickerBody {...props}/>:null;
}

function SpatialLayoutPickerBody({industry,products=[],view,onPick,onClose}){
  const my=useMy(),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[tab,setTab]=useState('history');
  // 조감도 히스토리(내 공간 조감도) — 고르면 그 자리에서 레이아웃을 만든다(components/spatial-layout-create.jsx)
  const [history,setHistory]=useState(null),[historyError,setHistoryError]=useState(''),[creating,setCreating]=useState(null);
  const [library,setLibrary]=useState(null),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const productsKey=JSON.stringify(products),saved=useMemo(()=>relatedSpatialLayouts(my,{industry,products,view}),[my,industry,productsKey,view]),showTemplates=tab==='templates';
  const labels=useMemo(()=>({industries:Object.entries(IND).map(([code,value])=>({code,name:value.name}))}),[]);
  useEffect(()=>{
    let active=true;
    loadSpatialHistory({page:1,pageSize:48}).then(data=>{if(!active)return;const items=data.items.filter(item=>item.preview);setHistory(items);if(!items.length)setTab(current=>current==='history'?'saved':current);})
      .catch(error=>{if(active){setHistoryError(error.message);setHistory([]);}});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(library)return;
    let active=true;setLoading(true);setLoadError('');
    loadSpatialLibrary().then(value=>{if(active){setLibrary(value);setLoading(false);}}).catch(error=>{if(active){setLoadError(error.message);setLoading(false);}});
    return()=>{active=false;};
  },[library,attempt]);
  const displayLibrary=library||labels,search=query.trim().toLowerCase();
  const matches=item=>(filter==='all'||item.ind===filter)&&(!search||[item.name,item.txt,displayLibrary.industries.find(value=>value.code===item.ind)?.name].filter(Boolean).join(' ').toLowerCase().includes(search));
  const visible=saved.filter(matches);
  const records=(history||[]).filter(item=>(filter==='all'||item.industry===filter)&&(!search||[item.title,displayLibrary.industries.find(value=>value.code===item.industry)?.name].filter(Boolean).join(' ').toLowerCase().includes(search)));
  const plan=item=>{if(item.thumbnail)return item.thumbnail;if(!library)return null;try{return svgData(planSvg(item.preview,library,{width:520,height:334,productPins:false,labels:false,dimensions:false}));}catch{return null;}};
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
    <div className="seg" role="group" aria-label="조감도 레이아웃 종류"><button type="button" aria-pressed={tab==='history'} disabled={busy} onClick={()=>setTab('history')}>조감도 히스토리 {history?history.length:''}</button><button type="button" aria-pressed={tab==='saved'} disabled={busy} onClick={()=>setTab('saved')}>저장한 조감도 {saved.length}</button><button type="button" aria-pressed={tab==='templates'} disabled={busy} onClick={()=>setTab('templates')}>업종별 템플릿</button></div>
    <div className="sp-filterbar"><select className="input" aria-label="조감도 업종" value={filter} disabled={busy} onChange={event=>setFilter(event.target.value)}><option value="all">전체 업종</option>{displayLibrary.industries.map(industry=><option key={industry.code} value={industry.code}>{industry.name}</option>)}</select><input className="input" aria-label="조감도 레이아웃 검색" placeholder="레이아웃 이름 · 업종 · 설명 검색" value={query} disabled={busy} onChange={event=>setQuery(event.target.value)}/></div>
    <FeedbackPopup message={error}/>
    {tab==='history'&&<>{historyError&&<div className="sp-storyboard-empty" role="alert"><p>{historyError}</p></div>}
      {!history?<p role="status">조감도 히스토리를 불러오는 중…</p>:records.length?<><p className="sp-storyboard-count">{records.length}개 · 조감도를 고르면 설명과 연결선을 다듬어 이 장에 적용해요.</p>
        <div className="sp-map-grid">{records.map(item=><article key={item.id} className="sp-map-card be-layout-source" data-history-id={item.id} aria-label={item.title}>
          <div className="be-layout-source-thumb" aria-hidden="true">{plan(item)?<img loading="lazy" alt="" src={plan(item)}/>:<span className="spin"/>}</div>
          <div className="be-layout-source-caption"><div><small>{displayLibrary.industries.find(value=>value.code===item.industry)?.name||'공간 조감도'}</small><h3>{item.title}</h3><p>{item.rooms}개 공간 · 제품 {item.products}개</p></div>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} aria-label={item.title+' 레이아웃 만들기'} onClick={()=>setCreating(item.id)}>레이아웃 만들기</button></div>
        </article>)}</div></>
        :<div className="sp-storyboard-empty" role="status"><strong>{history.length?'검색 조건에 맞는 조감도가 없어요.':'저장한 공간 조감도가 없어요.'}</strong><p>조감도 스튜디오에서 공간 조감도를 만들거나, 업종별 템플릿을 선택해 바로 사용하세요.</p></div>}</>}
    {tab==='saved'&&saved.length===0&&<div className="sp-storyboard-empty" role="status"><strong>저장한 조감도 레이아웃이 없어요.</strong><p>조감도 히스토리에서 조감도를 골라 레이아웃을 만들거나, 업종별 템플릿을 선택해 바로 사용하세요.</p></div>}
    {tab==='saved'&&saved.length>0&&<><p className="sp-storyboard-count">{visible.length}개{industry?' · 현재 업종과 연결 제품에 가까운 레이아웃부터 표시합니다.':''}</p>{visible.length?<div className="sp-map-grid">{visible.map(item=><SpatialSavedLayoutCard key={item.f} item={item} library={displayLibrary} onEdit={choose} disabled={busy} actionLabel="사용하기"/>)}</div>:<div className="sp-empty" role="status"><p>검색 조건에 맞는 저장 레이아웃이 없어요.</p></div>}</>}
    {showTemplates&&<><h3 className="sp-storyboard-template-title">업종별 템플릿</h3>{loading?<p role="status">업종별 템플릿을 불러오는 중…</p>:loadError?<div className="sp-storyboard-empty" role="alert"><p>{loadError}</p><button type="button" className="btn btn-sm" onClick={()=>setAttempt(value=>value+1)}>다시 불러오기</button></div>:templates.length?<div className="sp-map-grid">{templates.map(template=><SpatialMapCard key={template.id} template={template} library={library} onOpen={chooseTemplate} openLabel="사용하기" disabled={busy}/>)}</div>:library&&<div className="sp-empty" role="status"><p>검색 조건에 맞는 업종 템플릿이 없어요.</p></div>}</>}
    {creating&&<SpatialLayoutCreate historyId={creating} view={view==='2d'?'2d':'3d'} onClose={()=>setCreating(null)} onSaved={async meta=>{setCreating(null);await choose(meta);}}/>}
  </Modal>;
}
