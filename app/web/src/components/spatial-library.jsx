import {FeedbackPopup} from './feedback-popup.jsx';
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import { Icon } from './common.jsx';
import { createScene } from '../domain/spatial/scene.js';
import { planSvg,svgData } from '../domain/spatial/plan-svg.js';
import { spatialAssetLabel,spatialObjectThumbnail } from '../domain/spatial/catalog.js';
import { loadSpatialLibrary,spatialPreviewImage } from '../services/spatial.js';

export function SpatialSceneThumb({scene,library,thumbnail,view='2d'}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[thumbnail]);
  const fallback=useMemo(()=>svgData(planSvg(scene,library,{width:640,height:410,productPins:false,labels:true,dimensions:false})),[scene,library]);
  return <img loading="lazy" alt={scene.title+' · '+view.toUpperCase()+' 공간맵 미리보기'} src={!failed&&thumbnail||fallback} onError={()=>setFailed(true)}/>;
}

export function SpatialObjectThumb({asset}){
  return <div className="sp-object-image"><img loading="lazy" src={spatialObjectThumbnail(asset)} alt={asset.name+' 오브젝트 형상'}/></div>;
}

export function SpatialHistoryPagination({page,total,pageSize,loading,onChange}){
  const pages=Math.ceil(total/pageSize);if(!total)return null;
  const start=Math.max(1,Math.min(page-1,pages-2)),end=Math.min(pages,start+2),numbers=Array.from({length:end-start+1},(_,i)=>start+i);
  const number=value=><button key={value} type="button" aria-label={value+'페이지'} aria-current={page===value?'page':undefined} disabled={loading} onClick={()=>onChange(value)}>{value}</button>;
  return <nav className="sp-history-pagination" aria-label="조감도 히스토리 페이지">
    <span className="sp-history-range">{(page-1)*pageSize+1}–{Math.min(page*pageSize,total)} / {total}개{loading&&<span role="status"> · 불러오는 중…</span>}</span>
    {pages>1&&<div className="sp-history-page-buttons"><button type="button" aria-label="이전 페이지" disabled={loading||page<=1} onClick={()=>onChange(page-1)}><Icon name="chevL" size={14}/><span>이전</span></button>
      {start>1&&number(1)}{start>2&&<span aria-hidden="true">…</span>}{numbers.map(number)}{end<pages-1&&<span aria-hidden="true">…</span>}{end<pages&&number(pages)}
      <button type="button" aria-label="다음 페이지" disabled={loading||page>=pages} onClick={()=>onChange(page+1)}><span>다음</span><Icon name="chev" size={14}/></button></div>}
  </nav>;
}

export function SpatialHistoryCard({item,library,onOpen,onDelete}){
  const scene=item.preview,revision=scene?.assetRevision,frozen=revision&&revision!==library.sourceHash;
  const [view,setView]=useState('2d'),[visible,setVisible]=useState(false),[archived,setArchived]=useState(null),[rendered,setRendered]=useState(null),[thumbnailFailed,setThumbnailFailed]=useState(false),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const card=useRef(null),resolved=frozen?(archived?.sourceHash===revision?archived:null):library;
  // Stored example thumbnails are 3D renders. A missing thumbnail is rendered again in 3D.
  const image3d=!thumbnailFailed&&item.thumbnail||rendered;
  useEffect(()=>{
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'120px'});
    observer.observe(card.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{setRendered(null);setThumbnailFailed(false);setError('');},[scene?.contentHash,revision,item.thumbnail]);
  useEffect(()=>{
    if(!scene||!frozen||!visible)return;
    let active=true;
    loadSpatialLibrary(revision).then(value=>{if(active)setArchived(value);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[revision,frozen,visible,attempt]);
  useEffect(()=>{
    if(!scene||view!=='3d'||!visible||!resolved||image3d||error)return;
    let active=true;
    spatialPreviewImage(scene,resolved).then(value=>{if(active)setRendered(value);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[scene,view,visible,resolved,image3d,error,attempt]);
  const retry=()=>{setError('');setRendered(null);setAttempt(value=>value+1);};
  return <article ref={card} className="sp-map-card sp-history-card" aria-label={item.title} data-history-id={item.id}>
    <FeedbackPopup message={error} title={item.title+' 미리보기를 불러오지 못했어요'} actionLabel="다시 보기" onAction={retry}/>
    <div className="sp-map-preview" data-view={scene?view:'draft'}>
      <button type="button" className="sp-history-open" aria-label={item.title+' 조감도 열기'} onClick={onOpen}>
        {!scene?<div className="sp-draft-thumbnail"><Icon name="edit" size={27}/><strong>작성 중인 조감도</strong><small>공간 {item.rooms}개 입력</small></div>
          :view==='3d'&&image3d?<img loading="lazy" alt={item.title+' · 3D 공간맵 미리보기'} src={image3d} onError={()=>{if(!thumbnailFailed&&item.thumbnail)setThumbnailFailed(true);else setError('3D 미리보기 이미지를 불러오지 못했습니다.');}}/>
          :view==='2d'&&resolved?<SpatialSceneThumb scene={scene} library={resolved} view="2d"/>
          :<div className="sp-map-render-state" role="status">{error?<Icon name="cube" size={24}/>:<span className="spin" aria-label={view==='3d'?'3D 미리보기 준비 중':'미리보기 준비 중'}/>}</div>}
        <span>{!scene?'입력 중':view.toUpperCase()+' 미리보기'}</span>
      </button>
      {scene&&<div className="sp-map-view-switch" role="group" aria-label={item.title+' 미리보기'}>{['2d','3d'].map(mode=><button key={mode} type="button" aria-label={mode.toUpperCase()+' 보기'} aria-pressed={view===mode} onClick={()=>{setView(mode);setError('');}}>{mode.toUpperCase()}</button>)}</div>}
    </div>
    <div className="sp-history-caption"><div className="sp-history-info"><small>{item.example?'관리자 예시 · ':''}{library.industries.find(i=>i.code===item.industry)?.name||'업종 미선택'}</small><h3>{item.title}</h3><p>{item.rooms}개 공간 · 제품 {item.products}개</p></div><button type="button" className="btn btn-ghost btn-icon sp-history-delete" aria-label={item.title+' 삭제'} onClick={onDelete}><Icon name="trash" size={20}/></button></div>
  </article>;
}

export function SpatialMapCard({template,library,onOpen,openLabel='스튜디오에서 열기',defaultView='2d',disabled=false}){
  const scene=useMemo(()=>createScene({templateId:template.id},library),[template,library]);
  const productNames=useMemo(()=>[...new Set(scene.objects.filter(object=>object.assetId.startsWith('product:')).map(object=>object.assetId))].map(id=>spatialAssetLabel(library.assets.find(asset=>asset.id===id))),[scene,library]);
  const [view,setView]=useState(defaultView),[image,setImage]=useState(null),[error,setError]=useState(''),[visible,setVisible]=useState(false);
  const card=useRef(null);
  const loading=view==='3d'&&!image&&!error;
  useEffect(()=>setView(defaultView),[defaultView]);
  useEffect(()=>{
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'120px'});
    observer.observe(card.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(view!=='3d'||image||!visible)return;
    let active=true;setError('');
    spatialPreviewImage(scene,library).then(src=>{if(active)setImage(src);}).catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[view,scene,library,image,visible]);
  return <article ref={card} className="sp-map-card sp-template-card" aria-label={template.name} data-template-id={template.id} data-industry={template.industry}><FeedbackPopup message={error}/>
    <div className="sp-map-preview" data-view={view}>
      {view==='2d'||image||error?<SpatialSceneThumb scene={scene} library={library} thumbnail={view==='3d'?image:null} view={view}/>:<div className="sp-map-render-state" role="status"><span className="spin" aria-label="3D 미리보기 준비 중"/></div>}
      <div className="sp-map-view-switch" aria-label={template.name+' 미리보기'}>{['2d','3d'].map(mode=><button key={mode} aria-label={mode.toUpperCase()+' 보기'} aria-pressed={view===mode} disabled={disabled} onClick={()=>setView(mode)}>{mode.toUpperCase()}</button>)}</div>
      <button className="btn btn-primary btn-sm sp-map-open" disabled={loading||disabled} onClick={()=>onOpen(template,view)}>{openLabel}<Icon name="arrowR" size={15}/></button>
    </div>
    <div className="sp-map-caption"><small>{library.industries.find(i=>i.code===template.industry)?.name} · {template.scope==='full'?'전체 맵':'개별 공간'}</small><h3>{template.name}</h3><p>{scene.rooms.length}개 공간 · 제품 {scene.objects.filter(o=>o.assetId.startsWith('product:')).length}개</p>{productNames.length>0&&<p className="sp-template-products" title={productNames.join(' · ')}>{productNames.slice(0,3).join(' · ')}{productNames.length>3?' 외 '+(productNames.length-3)+'종':''}</p>}</div>
  </article>;
}

export function SpatialTemplateGallery({templates,library,onOpen,defaultView='2d'}){
  const [count,setCount]=useState(18),sentinel=useRef(null),gallery=useRef(null),more=count<templates.length;
  useLayoutEffect(()=>{const body=gallery.current?.closest('.mbody');if(body)body.scrollTop=0;},[]);
  useEffect(()=>{
    const target=sentinel.current;if(!more||!target)return;
    const root=target.closest('.mbody');
    if(typeof IntersectionObserver==='undefined'){
      const load=()=>{if(target.getBoundingClientRect().top<root.getBoundingClientRect().bottom+320)setCount(value=>Math.min(value+18,templates.length));};
      root.addEventListener('scroll',load);load();return()=>root.removeEventListener('scroll',load);
    }
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();setCount(value=>Math.min(value+18,templates.length));}
    },{root,rootMargin:'320px 0px',threshold:0});
    observer.observe(target);return()=>observer.disconnect();
  },[count,more,templates.length]);
  return <div ref={gallery} className="sp-template-gallery">
    {templates.length?<div className="sp-map-grid">{templates.slice(0,count).map(template=><SpatialMapCard key={template.id} template={template} library={library} onOpen={onOpen} defaultView={defaultView} openLabel="활용하기"/>)}</div>:<div className="sp-empty" role="status"><p>조건에 맞는 템플릿이 없어요.</p></div>}
    {templates.length>0&&<div ref={sentinel} className="sp-template-pagination" role="status" aria-live="polite">{more?`${Math.min(count,templates.length)} / ${templates.length}개 · 아래로 스크롤하면 더 볼 수 있어요.`:`전체 ${templates.length}개 템플릿을 확인했어요.`}</div>}
  </div>;
}
