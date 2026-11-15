// 조감도 스튜디오 시작 팝업 — 종류(공간 · 건물)와 출발점(빈 화면 · 내 Storyboard · 템플릿)을 고르고 스튜디오로 넘어간다.
// 실행은 services/birdseye-start.js. 업종 템플릿 갤러리는 예전 조감도 목록의 「업종별 템플릿」 창 내용을 그대로 옮긴 것이다.
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Modal,Icon} from './common.jsx';
import {SpatialTemplateGallery} from './spatial-library.jsx';
import {spatialTemplateCatalog,verticalTitle} from '../domain/spatial/template-catalog.js';
import {startBirdseyeStudio,storyboardChoices} from '../services/birdseye-start.js';
import {useStore} from '../repositories/proposals.js';
import {browserStorage} from '../repositories/browser.js';
import {getBootstrap} from '../api/bootstrap.js';
import '../styles/birdseye.css';

const TYPES=[
  {id:'spatial',name:'공간 조감도',text:'한 층의 공간에 제품 · 가구 · 사람을 배치하고 명령으로 조작해요.',tag:'2D · 3D'},
  {id:'building',name:'건물 조감도',text:'내 조감도와 템플릿 공간을 층으로 쌓아 3D 건물을 만들어요.',tag:'3D'},
];
const SOURCES={
  spatial:[
    {id:'blank',name:'빈 스튜디오',text:'업종만 고르고 명령으로 공간을 만들어요.'},
    {id:'storyboard',name:'내 Storyboard에서',text:'제안서의 요구사항과 연결한 제품 · 솔루션으로 공간을 구성해요.'},
    {id:'template',name:'업종 템플릿',text:'업종에 맞게 구성된 공간에서 시작해요.'},
  ],
  building:[
    {id:'blank',name:'직접 구성',text:'빈 건물에 내 조감도와 템플릿 공간을 쌓아요.'},
    {id:'storyboard',name:'내 Storyboard에서',text:'제안서의 공간 구성을 공간 하나에 한 층씩 쌓아요.'},
    {id:'template',name:'건물 템플릿',text:'외관과 층 구성이 잡힌 건물에서 시작해요.'},
  ],
};
const VARIANTS={compact:'소형',standard:'표준',spacious:'확장'};

export function BirdseyeStartDialog({library,go,onClose}){
  const [type,setType]=useState(''),[source,setSource]=useState(''),[industry,setIndustry]=useState(''),[proposalId,setProposalId]=useState('');
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  const [mapIndustry,setMapIndustry]=useState('all'),[mapVertical,setMapVertical]=useState('all'),[mapScope,setMapScope]=useState('full'),[mapVariant,setMapVariant]=useState('all'),[mapFilter,setMapFilter]=useState('');
  // 템플릿 기본 썸네일(2D · 3D)은 계정마다 기억한다 — 예전 「업종 템플릿」 창과 같은 키
  const mapViewKey='winmate.v2.spatial-map-view.'+(getBootstrap().user?.username||'local-dev');
  const [mapView,setMapView]=useState(()=>{try{return browserStorage.getItem(mapViewKey)==='3d'?'3d':'2d';}catch{return '2d';}});
  useEffect(()=>{try{browserStorage.setItem(mapViewKey,mapView);}catch{/* 기억하지 못해도 고르는 데는 지장이 없다 */}},[mapViewKey,mapView]);
  const controller=useRef(null),alive=useRef(true);
  useEffect(()=>()=>{alive.current=false;controller.current?.abort();},[]);
  const stored=useStore(state=>state.proposals);
  const proposals=useMemo(()=>source==='storyboard'?storyboardChoices():null,[stored,source]);
  const templates=useMemo(()=>type==='spatial'&&source==='template'?spatialTemplateCatalog(library,{industry:mapIndustry,scope:mapScope,variant:mapVariant,query:mapFilter,vertical:mapVertical}):[],[library,type,source,mapIndustry,mapScope,mapVariant,mapFilter,mapVertical]);
  const verticals=useMemo(()=>(library.verticals||[]).filter(v=>mapIndustry==='all'||v.group===mapIndustry),[library,mapIndustry]);
  const chosen=proposals?.find(p=>p.id===proposalId);

  const run=async choice=>{
    if(busy)return;setError('');setBusy('스튜디오를 여는 중');
    const abort=new AbortController();controller.current=abort;
    try{
      const route=await startBirdseyeStudio(choice,{library,signal:abort.signal,onProgress:text=>{if(alive.current)setBusy(text);}});
      if(!alive.current)return;
      if(route){onClose();go(route);}
    }catch(e){if(alive.current&&!abort.signal.aborted)setError(e.message||'스튜디오를 열지 못했어요.');}
    finally{if(alive.current)setBusy('');}
  };
  const pickType=id=>{if(busy)return;setType(id);setSource('');setError('');};
  const pickSource=id=>{
    if(busy)return;setSource(id);setError('');setProposalId('');
    // 고를 것이 더 없는 갈래는 바로 시작한다. 건물 템플릿은 건물 모듈의 고르기 창에서 고른다.
    if(type==='building'&&id==='blank')void run({type,source:id});
    if(type==='building'&&id==='template')void run({type,source:id});
  };
  const ready=type==='spatial'&&source==='blank'?!!industry:source==='storyboard'?!!chosen:false;
  const start=()=>run(source==='storyboard'?{type,source,proposalId}:{type,source,industry});
  const close=()=>{if(busy){controller.current?.abort();}onClose();};

  return <Modal title="조감도 스튜디오 시작" size={'be-start-modal'+(type==='spatial'&&source==='template'?' wide sp-maps-modal':'')} onClose={close}
    footer={source==='storyboard'||type==='spatial'&&source==='blank'?<><span className="be-start-status" role="status">{busy}</span><span className="sp"/><button type="button" className="btn btn-sm" onClick={close}>취소</button><button type="button" className="btn btn-primary btn-sm" disabled={!ready||!!busy} onClick={start}>{busy?'여는 중…':'시작'}</button></>:busy?<span className="be-start-status" role="status">{busy}</span>:undefined}>
    <div className="be-start">
      <section aria-label="종류"><h3><b>1</b>무엇을 만들까요?</h3>
        <div className="be-choices be-choices-2" role="group" aria-label="조감도 종류">{TYPES.map(t=><button key={t.id} type="button" className="be-choice" aria-pressed={type===t.id} disabled={!!busy} onClick={()=>pickType(t.id)}>
          <span className="be-choice-icon" aria-hidden="true"><Icon name={t.id==='building'?'building':'cube'} size={22}/></span><span className="be-choice-copy"><strong>{t.name}<em>{t.tag}</em></strong><small>{t.text}</small></span></button>)}</div></section>
      {type&&<section aria-label="출발점"><h3><b>2</b>어디에서 시작할까요?</h3>
        <div className="be-choices be-choices-3" role="group" aria-label="시작 방법">{SOURCES[type].map(s=><button key={s.id} type="button" className="be-choice" aria-pressed={source===s.id} disabled={!!busy} onClick={()=>pickSource(s.id)}>
          <span className="be-choice-copy"><strong>{s.name}</strong><small>{s.text}</small></span></button>)}</div></section>}
      {error&&<div className="be-start-error" role="alert">{error}</div>}
      {type==='spatial'&&source==='blank'&&<section aria-label="업종"><h3><b>3</b>업종을 골라 주세요</h3>
        <p className="be-start-note">가구 · 사람 역할 · 스타일이 업종을 따릅니다. 공간은 스튜디오에서 <strong>@회의실 추가해</strong>처럼 명령으로 만들어요.</p>
        <div className="be-industries" role="group" aria-label="업종 선택">{library.industries.map(i=><button key={i.code} type="button" aria-pressed={industry===i.code} disabled={!!busy} onClick={()=>setIndustry(i.code)}>{i.name}</button>)}</div></section>}
      {source==='storyboard'&&<section aria-label="제안서"><h3><b>3</b>제안서를 골라 주세요</h3>
        <p className="be-start-note">{type==='spatial'?'만든 조감도는 이 제안서의 조감도로 등록되고, 제안서의 비어 있는 조감도 장에 자동으로 들어가요.':'제안서의 공간 구성에서 공간 하나를 한 층으로 쌓아요(최대 6층).'} 공간 구성이 없는 제안서는 요구사항과 연결한 제품 · 솔루션으로 지금 만들어요.</p>
        {proposals?.length?<div className="be-proposals" role="radiogroup" aria-label="제안서 선택">{proposals.map(p=><button key={p.id} type="button" role="radio" aria-checked={proposalId===p.id} disabled={!!busy} data-proposal-id={p.id} onClick={()=>setProposalId(p.id)}>
          <span className="be-proposal-main"><strong>{p.title}</strong>{p.subtitle&&<em>{p.subtitle}</em>}<small>{p.requirement||'요구사항이 아직 없어요'}</small></span>
          <span className="be-proposal-meta"><span>제품 {p.products} · 솔루션 {p.solutions}</span><span className={p.planned?'is-on':''}>{p.planned?`공간 구성 ${p.spaces}곳`:'공간 구성 없음'}</span>{type==='spatial'&&p.birdseye&&<span className="is-on">조감도 있음</span>}</span></button>)}</div>
          :<div className="be-start-empty">아직 제안서가 없어요. Storyboard에서 제안서를 먼저 만들어 주세요.</div>}</section>}
      {type==='spatial'&&source==='template'&&<section aria-label="업종 템플릿"><h3><b>3</b>템플릿을 골라 주세요</h3>
        <div className="sp-map-default-view"><span>기본 썸네일</span><div role="group" aria-label="기본 썸네일">{['2d','3d'].map(mode=><button key={mode} aria-pressed={mapView===mode} onClick={()=>setMapView(mode)}>{mode.toUpperCase()}</button>)}</div></div>
        <div className="sp-filterbar"><select aria-label="템플릿 업종" value={mapIndustry} onChange={e=>{const code=e.target.value;setMapIndustry(code);setMapVertical(v=>v==='all'||v==='best'||code==='all'||library.verticals?.find(x=>x.id===v)?.group===code?v:'all');}}><option value="all">전체 업종</option>{library.industries.map(i=><option key={i.code} value={i.code}>{i.name}</option>)}</select>
          {library.verticals?.length>0&&<select aria-label="템플릿 버티컬" value={mapVertical} onChange={e=>setMapVertical(e.target.value)}><option value="all">전체 버티컬</option><option value="best">샘플 버티컬 시나리오 기반</option>{(mapIndustry==='all'?library.industries:library.industries.filter(i=>i.code===mapIndustry)).map(i=>{const items=verticals.filter(v=>v.group===i.code);return items.length?<optgroup key={i.code} label={i.name}>{items.map(v=><option key={v.id} value={v.id}>{verticalTitle(v)}</option>)}</optgroup>:null;})}</select>}
          <select aria-label="템플릿 범위" value={mapScope} onChange={e=>setMapScope(e.target.value)}><option value="all">전체·개별 모두</option><option value="full">전체 맵</option><option value="single">개별 공간</option></select>
          <select aria-label="공간 크기" value={mapVariant} onChange={e=>setMapVariant(e.target.value)}><option value="all">모든 크기</option>{Object.entries(VARIANTS).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select>
          <input aria-label="업종 템플릿 검색" value={mapFilter} onChange={e=>setMapFilter(e.target.value)} placeholder="공간 이름 · 장표 ID 검색"/><span>{templates.length}개</span></div>
        <SpatialTemplateGallery key={JSON.stringify([mapIndustry,mapVertical,mapScope,mapVariant,mapFilter])} templates={templates} library={library} onOpen={(template,view)=>run({type:'spatial',source:'template',template,view})} defaultView={mapView}/></section>}
    </div>
  </Modal>;
}
