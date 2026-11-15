// 조감도 통합 목록 — 사이드바 「조감도」. 시작 버튼 하나(→ 시작 팝업)와, 공간 조감도 · 건물을 최근 수정순으로 섞은 히스토리 한 구역.
// 공간 조감도는 서버(/api/spatial/history, 페이지), 건물은 건물 모듈의 저장소(services/building-bridge.js)에서 읽어 합친다.
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Icon,Modal,toast} from './common.jsx';
import {FeedbackPopup} from './feedback-popup.jsx';
import {SpatialHistoryCard,SpatialHistoryPagination} from './spatial-library.jsx';
import {BirdseyeStartDialog} from './birdseye-start.jsx';
import {SpatialObjectDrawer} from './spatial-object-drawer.jsx';
import {requireLogin,useSession} from '../api/session.js';
import {loadSpatialLibrary,loadSpatialHistory,deleteSpatialHistory} from '../services/spatial.js';
import {listBuildings,removeBuilding,onBuildingsChange,buildingThumbUrl} from '../services/building-bridge.js';
import {mergeHistoryPage,spatialPagesFor} from '../domain/birdseye/history.js';
import '../styles/spatial.css';
import '../styles/birdseye.css';

export const BIRDSEYE_PAGE_SIZE=8;
let lastPage=1;   // 스튜디오에 다녀와도 보던 쪽으로 돌아온다(계정이 바뀌면 첫 쪽)

function StudioIcon(){
  return <svg className="sp-studio-launch-icon" width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M5 38 31 23 59 39 33 54Z" fill="var(--surface)"/><path d="M5 38V20L31 5V23Z" fill="var(--accent-soft)"/><path d="M31 5 59 21V39L31 23Z" fill="var(--surface)"/>
      <path d="M5 20 31 35 59 21M31 35V45" opacity=".4"/><path d="M13 24V17L23 11V18Z" fill="var(--surface)"/><path d="M39 17 50 23V29L39 23Z" fill="var(--accent-soft)"/>
      <path d="M18 36 29 30 42 37 31 43Z" fill="var(--accent-soft)"/><path d="M18 36V41M31 43V48M42 37V42"/><path d="M46 42 51 39 56 42 51 45Z" fill="var(--accent-soft)"/><path d="M51 39V33M48 35 51 37 54 33"/>
    </g>
  </svg>;
}

function BuildingCard({item,onOpen,onDelete}){
  const [src,setSrc]=useState(null),[failed,setFailed]=useState(false);
  useEffect(()=>{let active=true;setFailed(false);buildingThumbUrl(item.id,item.updatedAt).then(url=>{if(active){if(url)setSrc(url);else setFailed(true);}}).catch(()=>{if(active)setFailed(true);});return()=>{active=false;};},[item.id,item.updatedAt]);
  return <article className="sp-map-card sp-history-card be-building-card" aria-label={item.title} data-building-id={item.id}>
    <div className="sp-map-preview" data-view="3d">
      <button type="button" className="sp-history-open" aria-label={item.title+' 건물 열기'} onClick={onOpen}>
        {src?<img loading="lazy" alt={item.title+' · 3D 건물 미리보기'} src={src}/>:<div className="sp-map-render-state" role="status">{failed?<Icon name="building" size={24}/>:<span className="spin" aria-label="3D 건물 미리보기 준비 중"/>}</div>}
        <span>{item.floors}개 층</span>
      </button>
    </div>
    <div className="sp-history-caption"><div className="sp-history-info"><small>{item.example?'예시 · ':''}{item.industries.join(' · ')||'건물'}</small><h3>{item.title}</h3><p>공간 {item.rooms}개 · 제품 {item.products}개</p></div>
      <button type="button" className="btn btn-ghost btn-icon sp-history-delete" aria-label={item.title+' 삭제'} onClick={onDelete}><Icon name="trash" size={20}/></button></div>
  </article>;
}

export function BirdseyeHome({go}){
  const {guest}=useSession();
  const [library,setLibrary]=useState(null),[error,setError]=useState('');
  const [spatial,setSpatial]=useState({items:[],total:0,offset:0}),[buildings,setBuildings]=useState([]),[page,setPage]=useState(lastPage);
  const [loading,setLoading]=useState(true),[historyError,setHistoryError]=useState(''),[starting,setStarting]=useState(false),[deleting,setDeleting]=useState(null),[catalogue,setCatalogue]=useState(false),[ready,setReady]=useState(false);
  const request=useRef(0),root=useRef(null),mounted=useRef(true),retries=useRef(0),asked=useRef(1);
  useEffect(()=>{mounted.current=true;loadSpatialLibrary().then(value=>{if(mounted.current)setLibrary(value);}).catch(e=>{if(mounted.current)setError(e.message);});return()=>{mounted.current=false;};},[]);

  // 합친 목록의 target쪽을 그리는 데 필요한 서버 쪽만 읽는다 — 건물이 없으면 그 쪽 하나(8개), 있으면 건물 수만큼만 앞쪽을 더 읽는다.
  // 항목마다 장면 전체가 딸려 오므로, 뒤쪽을 넘길 때도 앞에서부터 다시 읽지 않는다.
  const readPage=async target=>{
    const size=BIRDSEYE_PAGE_SIZE,list=await listBuildings().catch(()=>[]),loaded=new Map();let total=Infinity;
    for(let round=0;round<4;round++){
      const wanted=spatialPagesFor(target,size,list.length,total).filter(n=>!loaded.has(n));
      if(!wanted.length)break;
      for(const n of wanted){
        const data=await loadSpatialHistory({page:n,pageSize:size});
        total=data.total;loaded.set(n,[]);
        if(Number.isInteger(data.page))loaded.set(data.page,data.items);   // 끝을 넘은 쪽은 서버가 마지막 쪽을 대신 준다
        if(data.page!==n)break;
      }
    }
    const pages=spatialPagesFor(target,size,list.length,total);
    return {buildings:list,spatial:{items:pages.flatMap(n=>loaded.get(n)||[]),total,offset:pages.length?(pages[0]-1)*size:0}};
  };
  const load=async(target=page,{scroll=false}={})=>{
    const id=++request.current;asked.current=target;setLoading(true);setHistoryError('');
    try{
      const found=await readPage(target);
      if(!mounted.current||id!==request.current)return;
      const merged=mergeHistoryPage(found,target,BIRDSEYE_PAGE_SIZE);
      if(!merged.need)retries.current=0;
      setSpatial(found.spatial);setBuildings(found.buildings);setPage(merged.page);lastPage=merged.page;
      if(scroll)root.current?.querySelector('.sp-history')?.scrollIntoView({block:'start'});
    }catch(e){if(mounted.current&&id===request.current)setHistoryError(e.message);}
    finally{if(mounted.current&&id===request.current){setLoading(false);setReady(true);}}
  };
  const latest=useRef(load);latest.current=load;
  const account=useRef(guest);
  useEffect(()=>{const same=account.current===guest;account.current=guest;void latest.current(same?lastPage:1);},[guest]);
  useEffect(()=>onBuildingsChange(()=>{listBuildings().then(list=>{if(mounted.current)setBuildings(list);}).catch(()=>{});}),[]);
  // 건물 기록은 브라우저 저장소에서 먼저 온다 — 첫 읽기가 끝나기 전에는 목록을 그리지 않는다(건물만 먼저 보였다가 순서가 바뀌지 않게).
  const view=useMemo(()=>mergeHistoryPage({spatial,buildings:ready?buildings:[]},page,BIRDSEYE_PAGE_SIZE),[spatial,buildings,page,ready]);
  // 건물이 늘거나 줄어(저장 · 삭제 · 계정 동기화) 읽어 둔 구간으로 이 쪽을 그릴 수 없으면 그 쪽을 다시 읽는다
  const stale=!!view.need;
  useEffect(()=>{
    if(!stale||!ready||loading||historyError)return;
    if(retries.current<2){retries.current++;void latest.current(page);}
    else setHistoryError('히스토리가 바뀌었어요. 다시 불러와 주세요.');
  },[stale,ready,loading,historyError]);
  const pending=loading||stale&&!historyError;   // 다시 읽는 동안에는 빈 목록 안내를 보이지 않는다

  const remove=async()=>{
    const target=deleting;
    try{
      if(target.type==='building'){await removeBuilding(target.id);toast('건물을 삭제했어요');}
      else await deleteSpatialHistory(target.id);
      setDeleting(null);await latest.current(page);
    }catch(e){setError(e.message);setDeleting(null);}
  };

  return <div className="sp-page be-home" ref={root}><div className="sp-page-in">
    <div className="sp-topbar"><header className="tl-head sp-header">
      <div className="tl-title"><span className="eyebrow">WINMATE · 공간 제안</span><h1>조감도<span className="sp-beta">BETA</span></h1><p>공간과 건물 조감도를 새로 만들거나, 저장한 조감도를 이어서 편집하세요.</p></div>
      {/* 보기 전용 카탈로그 — 고르고 넣는 것은 스튜디오 안에서 한다 */}
      <div className="sp-header-actions"><button type="button" className="btn btn-primary sp-object-trigger" disabled={!library} aria-haspopup="dialog" onClick={()=>setCatalogue(true)}><Icon name="product" size={19}/><span>제품 · 가구 오브젝트</span></button></div>
    </header></div>
    <FeedbackPopup message={error}/>
    {!library&&!error&&<div className="boot" role="status" aria-live="polite"><span className="spin"/>조감도를 준비하는 중…</div>}
    {library&&<>
      <div className="sp-home-launches be-launch"><button type="button" className="sp-studio-launch" aria-haspopup="dialog" onClick={()=>{if(requireLogin())setStarting(true);}}>
        <span className="sp-launch-icon"><StudioIcon/></span><span className="sp-launch-copy"><strong>조감도 스튜디오 시작</strong><small>공간인지 건물인지, 빈 화면 · 내 Storyboard · 템플릿 중 어디에서 시작할지 고르고 스튜디오로 넘어가요.</small></span></button></div>
      <section className="sp-library sp-history" aria-label="조감도 히스토리" aria-busy={pending}>
        <div className="sp-library-intro"><div><h2>조감도 히스토리 {!pending&&!historyError&&<span className="sp-history-count">{view.total}</span>}</h2></div></div>
        <FeedbackPopup message={historyError} title="히스토리를 불러오지 못했어요" actionLabel="다시 불러오기" onAction={()=>latest.current(asked.current)}/>
        {view.items.length>0?<>
          <div className="sp-map-grid" data-history-page={view.page}>{view.items.map(entry=><div key={entry.type+':'+entry.id} className="be-entry" data-type={entry.type}>
            <span className="be-type" aria-label={entry.type==='building'?'건물 조감도':'공간 조감도'}>{entry.type==='building'?'건물':'공간'}</span>
            {entry.type==='building'
              ?<BuildingCard item={entry.source} onOpen={()=>go({name:'building',id:entry.id})} onDelete={()=>setDeleting(entry)}/>
              :<SpatialHistoryCard item={entry.source} library={library} onOpen={()=>go({name:'spatial',id:entry.id})} onDelete={()=>setDeleting(entry)}/>}
          </div>)}</div>
          <SpatialHistoryPagination page={view.page} total={view.total} pageSize={BIRDSEYE_PAGE_SIZE} loading={loading} onChange={next=>{if(next!==view.page&&!loading)void latest.current(next,{scroll:true});}}/>
        </>:pending?<div className="sp-empty" role="status"><span className="spin"/><p>조감도 히스토리를 불러오는 중…</p></div>
          :!historyError&&<div className="sp-empty"><Icon name="history" size={30}/><h3>저장한 조감도가 없어요</h3><p>조감도 스튜디오 시작을 눌러 첫 조감도를 만들어 보세요.</p></div>}
      </section>
    </>}
    {catalogue&&library&&<SpatialObjectDrawer library={library} canSelect={false} rooms={[]} roomId="" onRoomChange={()=>{}} onAdd={()=>{}} onClose={()=>setCatalogue(false)}/>}
    {starting&&library&&<BirdseyeStartDialog library={library} go={go} onClose={()=>setStarting(false)}/>}
    {deleting&&<Modal title={deleting.type==='building'?'건물을 삭제할까요?':'조감도를 삭제할까요?'} size="narrow" onClose={()=>setDeleting(null)} footer={<><button className="btn" onClick={()=>setDeleting(null)}>취소</button><button className="btn btn-danger" onClick={remove}>삭제</button></>}><p>{deleting.title}</p></Modal>}
  </div></div>;
}
