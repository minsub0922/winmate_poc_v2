import React, { useEffect, useRef, useState } from 'react';
import { api, bytes, number } from './api';
import { Button, Empty, ErrorBox, Loading, Pager, IconButton } from './components';
import { Icon } from './icons';
import './resources.css';

const kinds = { image: '이미지', layout: '장표', document: '문서', video: '영상', model: '3D 파일', data: '데이터', file: '파일', link: '링크' };
const resourceIcon = r => r.kind === 'image' ? 'image' : r.kind === 'layout' ? 'layers' : r.kind === 'model' ? 'box' : r.kind === 'link' ? 'external' : 'file';

function ResourceImage({ resource, thumbnail = false, className = '', ...props }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [resource.id, resource.url]);
  if (failed || !resource.available) return <span className={'resource-unavailable '+className}><Icon name="image" size={25}/><span>{resource.available ? '이미지를 불러오지 못했습니다' : '원본 확인 필요'}</span></span>;
  return <img {...props} className={className} src={thumbnail ? resource.thumbnail_url : resource.url} alt={resource.label} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>;
}

function useResources(path) {
  const [state,set] = useState({path,data:null,error:'',loading:true});
  const [retry,again] = useState(0);
  useEffect(() => {
    let alive=true;
    set({path,data:null,error:'',loading:true});
    api(path).then(data => alive && set({path,data,error:'',loading:false})).catch(e => alive && set({path,data:null,error:e.message,loading:false}));
    return () => {alive=false;};
  }, [path,retry]);
  return {...state,...(state.path===path?{}:{data:null,error:'',loading:true}),retry:()=>again(n=>n+1)};
}

export function AssetResourceSummary({ id, showAll }) {
  const result = useResources('/assets/'+encodeURIComponent(id)+'/resources?kind=image&limit=5');
  if (result.error) return <ErrorBox error={result.error} retry={result.retry}/>;
  if (!result.data) return <Loading/>;
  const d=result.data, cover=d.primary, images=d.items.filter(i=>i.kind==='image'&&i.id!==cover?.id).slice(0,4);
  return <section className="resource-summary" aria-label="에셋 리소스 요약"><div className="resource-section-title"><div><Icon name="image" size={18}/><h3>이미지 · 리소스</h3><span className="count-label">{number(d.all_total)}</span></div><button className="text-button" onClick={showAll}>전체 리소스 보기<Icon name="arrow" size={15}/></button></div>
    {cover?.kind==='image' ? <button className="resource-hero" onClick={showAll} aria-label="대표 이미지와 전체 리소스 열기"><ResourceImage resource={cover}/><span className="resource-hero-tag">대표 이미지 <Icon name="external" size={13}/></span><span className="resource-hero-caption">{cover.label}</span></button> : cover?.kind==='layout' ? <LayoutPreview resource={cover}/> : <div className="resource-no-cover"><Icon name="folder" size={25}/><div><strong>연결된 리소스 {number(d.all_total)}개</strong><p>등록된 대표 이미지가 없습니다. 원본과 데이터를 전체 리소스에서 확인하세요.</p></div></div>}
    {images.length>0 && <div className="resource-mini-grid">{images.map(i=><button key={i.id} onClick={showAll} aria-label={i.label}><ResourceImage resource={i} thumbnail/></button>)}</div>}
    <div className="resource-summary-meta"><span>{Object.entries(d.kinds).map(([kind,n])=>`${kinds[kind]||kind} ${number(n)}`).join(' · ')}</span>{d.missing>0&&<span className="resource-missing">원본 확인 필요 {number(d.missing)}</span>}</div>
  </section>;
}

function LayoutPreview({resource}) {
  const result=useResources(resource.preview_url.replace('/admin/api',''));
  const host=useRef(),[width,setWidth]=useState(700);
  useEffect(()=>{if(!host.current)return;const resize=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));resize.observe(host.current);return()=>resize.disconnect();},[]);
  return <div className="resource-layout" ref={host} style={{height:Math.max(130,width*720/1280)}}>{result.error?<ErrorBox error={result.error} retry={result.retry}/>:!result.data?<Loading/>:<iframe title={resource.label} sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={result.data.html} style={{width:1280,height:720,transform:`scale(${width/1280})`}}/>}</div>;
}

function DataPreview({resource}) {
  const result=useResources(resource.preview_url.replace('/admin/api',''));
  return result.error?<ErrorBox error={result.error} retry={result.retry}/>:!result.data?<Loading/>:<><pre className="resource-data">{result.data.text}</pre>{result.data.truncated&&<p className="quiet">처음 60,000바이트를 표시합니다. 전체 파일은 다운로드할 수 있습니다.</p>}</>;
}

function ResourcePreview({resource:r, close, previous, next}) {
  const [original,setOriginal]=useState(false);
  useEffect(()=>setOriginal(false),[r.id]);
  return <section className="resource-viewer" aria-label="리소스 미리보기"><div className="resource-viewer-heading"><div><span>{kinds[r.kind]}{r.primary?' · 대표 이미지':''}</span><h3>{r.label}</h3></div><IconButton icon="close" label="미리보기 닫기" onClick={close}/></div>
    {!r.available?<Empty icon="alert" title="원본 확인이 필요합니다">저장된 연결에 원본 파일 또는 이미지 슬롯이 없습니다.</Empty>:r.kind==='image'?<div className={'resource-large-image '+(original?'original':'')}><ResourceImage resource={r}/></div>:r.kind==='layout'?<LayoutPreview resource={r}/>:r.kind==='data'&&r.preview_url?<DataPreview resource={r}/>:r.kind==='video'?<video className="resource-video" src={r.url} controls preload="metadata"/>:<div className="resource-file-preview"><Icon name={resourceIcon(r)} size={36}/><strong>{r.label}</strong><p>{r.availability==='external'?'외부 원본을 새 창에서 확인할 수 있습니다.':'원본 파일을 다운로드해 확인할 수 있습니다.'}</p></div>}
    <div className="resource-viewer-actions"><div className="button-row"><Button disabled={!previous} onClick={previous}>이전</Button><Button disabled={!next} onClick={next}>다음</Button>{r.kind==='image'&&r.available&&<Button onClick={()=>setOriginal(v=>!v)}>{original?'화면에 맞춤':'원본 크기'}</Button>}</div><div className="button-row">{r.available&&<a className="button" href={r.download_url} target={r.availability==='external'?'_blank':undefined} rel="noreferrer"><Icon name={r.availability==='external'?'external':'download'} size={15}/>{r.availability==='external'?'외부 원본 열기':'다운로드'}</a>}</div></div>
    <details className="resource-provenance"><summary>파일 정보 · 출처</summary><dl><div><dt>주소</dt><dd>{r.address}</dd></div>{r.width&&r.height?<div><dt>이미지 크기</dt><dd>{r.width} × {r.height}px</dd></div>:null}{r.bytes!=null&&<div><dt>파일 크기</dt><dd>{bytes(r.bytes)}</dd></div>}{r.origins.length>0&&<div><dt>연결 근거</dt><dd>{r.origins.join(' · ')}</dd></div>}</dl>{r.source_url&&<a className="source-link" href={r.source_url} target="_blank" rel="noreferrer"><Icon name="external" size={14}/>이미지 원본 출처</a>}{r.page_url&&<a className="source-link" href={r.page_url} target="_blank" rel="noreferrer"><Icon name="book" size={14}/>관련 페이지 열기</a>}</details>
  </section>;
}

export function AssetResources({id}) {
  const [group,setGroup]=useState(''),[kind,setKind]=useState(''),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[selected,setSelected]=useState(null);
  const viewer=useRef();
  useEffect(()=>{if(query===search)return;const timer=setTimeout(()=>{setSearch(query);setOffset(0);setSelected(null);},250);return()=>clearTimeout(timer);},[query,search]);
  const path='/assets/'+encodeURIComponent(id)+'/resources?'+new URLSearchParams({group,kind,q:search,offset,limit:24});
  const result=useResources(path),d=result.data;
  function choose(r){setSelected(r);}
  useEffect(()=>{if(selected){const body=viewer.current?.closest('.modal-body');if(body)body.scrollTop=0;viewer.current?.querySelector('.resource-viewer button')?.focus({preventScroll:true});}},[selected?.id]);
  const index=d?.items.findIndex(r=>r.id===selected?.id)??-1;
  return <div className="asset-resources" ref={viewer}><div className="resource-browser-heading"><div><h3>전체 리소스 <span className="count-label">{d?number(d.all_total):'…'}</span></h3><p>이미지를 선택하면 확대하고, 원본 파일과 출처를 확인할 수 있습니다.</p></div>{!selected&&<Button icon="refresh" onClick={result.retry} busy={result.loading}>새로고침</Button>}</div>
    {selected?<><div className="resource-return"><button className="text-button" onClick={()=>setSelected(null)}><Icon name="arrow" size={15} style={{transform:'rotate(180deg)'}}/>리소스 목록으로</button></div><ResourcePreview resource={selected} close={()=>setSelected(null)} previous={index>0?()=>choose(d.items[index-1]):null} next={d&&index>=0&&index<d.items.length-1?()=>choose(d.items[index+1]):null}/></>:<>
    <div className="resource-filters"><label className="resource-search"><Icon name="search" size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="이미지·파일 이름 검색" aria-label="리소스 검색"/></label><select aria-label="리소스 종류" value={kind} onChange={e=>{setKind(e.target.value);setOffset(0);setSelected(null);}}><option value="">모든 종류</option>{Object.entries(d?.kinds||kinds).map(([k])=><option key={k} value={k}>{kinds[k]||k}</option>)}</select></div>
    {d&&<div className="resource-group-tabs" aria-label="리소스 분류"><button className={!group?'selected':''} onClick={()=>{setGroup('');setOffset(0);setSelected(null);}}>전체 <span>{number(d.all_total)}</span></button>{d.groups.map(g=><button key={g.id} className={group===g.id?'selected':''} onClick={()=>{setGroup(g.id);setOffset(0);setSelected(null);}}>{g.label}<span>{number(g.count)}</span></button>)}</div>}
    {result.error?<ErrorBox error={result.error} retry={result.retry}/>:!d?<Loading/>:<>{d.missing>0&&<p className="resource-missing-note"><Icon name="alert" size={14}/>파일 또는 이미지 슬롯 {number(d.missing)}개의 원본 확인이 필요합니다.</p>}{d.warnings.map((w,n)=><p className="resource-missing-note" key={n}>{w}</p>)}{d.total?<><div className="resource-grid">{d.items.map(r=><button key={r.id} className={'resource-card '+(selected?.id===r.id?'selected':'')} onClick={()=>choose(r)}><div className="resource-card-image">{r.kind==='image'?<ResourceImage resource={r} thumbnail/>:<span className="resource-file-icon"><Icon name={resourceIcon(r)} size={30}/><small>{kinds[r.kind]||r.kind}</small></span>}{r.primary&&<span className="resource-primary-badge">대표</span>}{!r.available&&<span className="resource-card-missing">확인 필요</span>}</div><div className="resource-card-caption"><strong title={r.label}>{r.label}</strong><span>{r.availability==='external'?'외부 원본':r.bytes!=null?bytes(r.bytes):r.width&&r.height?`${r.width} × ${r.height}`:kinds[r.kind]}</span></div></button>)}</div><Pager offset={offset} total={d.total} size={24} onChange={n=>{setOffset(n);setSelected(null);}}/></>:<Empty icon="folder" title="조건에 맞는 리소스가 없습니다"/>}<p className="resource-footnote">등록된 연결과 보관 파일을 기준으로 표시합니다. 외부 원본의 열람 가능 여부는 접속 시 확인됩니다.</p></>}
    </>}
  </div>;
}
