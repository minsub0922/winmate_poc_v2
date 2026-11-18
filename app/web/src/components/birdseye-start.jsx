// 조감도 스튜디오 시작 팝업 — 질문 단계 없이 창 하나로 시작한다.
//   탭: 공간(기본) · 건물.  입력(필수): 업종 → 공간 한 개 이상.
//   공간 입력창에 들어가면 바로 위에 자동완성 목록이 뜨고, 치는 대로 좁혀진다(한글은 조합 중인 글자 · 초성으로도). 고르거나 Enter를 누르면 버블로 들어간다.
//   「추천 공간」 창에서 눌러 고를 수도 있다.
//   「제안서 불러오기」 — 제안서 히스토리에서 골라 그 업종 · 공간 구성을 채운다. 이때만 제안서에서 고른 제품을 알맞은 공간에 넣는다.
//   「업종 템플릿에서 시작」 — 업종을 고르면 켜진다. 그 업종의 조감도 템플릿을 큰 미리보기와 함께 드롭다운으로 보여 주고, 고르면 확인한 뒤 바로 스튜디오로 간다.
// 실행은 services/birdseye-start.js, 규칙은 domain/birdseye/start.js.
import React,{useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Modal,Icon,toast} from './common.jsx';
import {SpatialSceneThumb,useSpatialTemplate} from './spatial-library.jsx';
import {FeedbackPopup} from './feedback-popup.jsx';
import {useNearViewport} from '../hooks/useNearViewport.js';
import {verticalTitle} from '../domain/spatial/template-catalog.js';
import {recommendedSpaces,groupSpaces,searchSpaces,addSpaceName,industryTemplates,spaceKey,MAX_START_SPACES} from '../domain/birdseye/start.js';
import {startBirdseyeStudio,storyboardChoices} from '../services/birdseye-start.js';
import {spatialPreviewImage} from '../services/spatial.js';
import {useStore} from '../repositories/proposals.js';
import '../styles/birdseye.css';

const TYPES=[{id:'spatial',name:'공간',tag:'2D · 3D'},{id:'building',name:'건물',tag:'3D'}];
const LISTBOX='be-space-suggestions';

// 추천 공간 창 — 업종의 공간 템플릿을 묶음별로 보여 주고, 누르면 넣고 다시 누르면 뺀다
function RecommendedSpaces({industryName,spaces,chosen,full,onToggle,onClose}){
  const groups=useMemo(()=>groupSpaces(spaces),[spaces]),taken=new Set(chosen.map(spaceKey));
  return <Modal title={`추천 공간 · ${industryName}`} sub="공간을 누르면 바로 들어가요. 다시 누르면 빠져요." size="be-recommend-modal" onClose={onClose}
    footer={<><span className="be-start-status" role="status">{chosen.length}개 선택 · 최대 {MAX_START_SPACES}개</span><span className="sp"/><button type="button" className="btn btn-primary btn-sm" data-autofocus onClick={onClose}>완료</button></>}>
    <div className="be-recommend">{groups.map(group=><section key={group.name} aria-label={group.name}><h3>{group.name}</h3>
      <div className="be-recommend-list" role="group" aria-label={group.name+' 공간'}>{group.items.map(space=>{const on=taken.has(spaceKey(space.name));return <button key={space.templateId} type="button" aria-pressed={on} disabled={!on&&full} onClick={()=>onToggle(space.name)}>
        {on&&<Icon name="check" size={13} stroke={2.6}/>}{space.name}</button>;})}</div></section>)}</div>
  </Modal>;
}

// 템플릿의 3D 조감도 그림 — 보일 때 서버 미리보기를 읽고(없으면 이 브라우저가 그린다), 준비되지 않았거나 실패하면 2D 평면도를 보여 준다
function TemplatePreview({template,scene,library}){
  const [image,setImage]=useState(null),[settled,setSettled]=useState(false),[visible,setVisible]=useState(false),frame=useRef(null);
  useEffect(()=>{
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:'160px'});
    observer.observe(frame.current);return()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!scene||!visible||settled)return;
    let active=true;
    spatialPreviewImage(scene,library,{templateId:template.id}).then(src=>{if(active){setImage(src);setSettled(true);}}).catch(()=>{if(active)setSettled(true);});
    return()=>{active=false;};
  },[visible,settled,scene,library,template.id]);
  return <span ref={frame} className="be-template-thumb" data-view={image?'3d':settled?'2d':'loading'}>
    {settled?<SpatialSceneThumb scene={scene} library={library} thumbnail={image} view={image?'3d':'2d'}/>:<span className="spin" role="status" aria-label="3D 미리보기 준비 중"/>}</span>;
}
const templateMeta=(template,scene,library)=>[template.vertical&&verticalTitle(library.verticals?.find(v=>v.id===template.vertical)),`공간 ${(scene?.rooms||template.rooms).length}개`,scene&&`제품 ${scene.objects.filter(o=>o.assetId.startsWith('product:')).length}개`].filter(Boolean).join(' · ');

function TemplateItem({template,library:baseLibrary,disabled,onPick}){
  const item=useRef(null),visible=useNearViewport(item),{scene,assets:library=baseLibrary,error}=useSpatialTemplate(template,baseLibrary,visible);
  return <button ref={item} type="button" role="option" aria-selected="false" className="be-template-item" data-template-id={template.id} disabled={disabled} onClick={()=>onPick({template,scene,assets:library})}>
    <FeedbackPopup message={error}/>
    <TemplatePreview key={library.sourceHash} template={template} scene={scene} library={library}/>
    <span className="be-template-copy"><strong>{scene?.title || template.name}</strong><small>{templateMeta(template,scene,library)}</small>
      <span className="be-template-rooms">{(scene?.rooms||template.rooms).map(room=><em key={room.id||room.key}>{room.name}</em>)}</span></span>
  </button>;
}

// 「업종 템플릿에서 시작」 드롭다운 — 버튼 바로 위로 연다. 시작 창이 넘치는 부분을 자르므로 body에 붙이고 버튼 자리에 맞춘다.
function TemplateMenu({anchor,library,industryName,templates,disabled,held,onPick,onClose}){
  const [box,setBox]=useState(null),panel=useRef(null);
  useLayoutEffect(()=>{
    const place=()=>{
      const at=anchor.current?.getBoundingClientRect();if(!at)return;
      const width=Math.min(760,window.innerWidth-24),left=Math.max(12,Math.min(at.left,window.innerWidth-width-12));
      setBox({left,width,bottom:window.innerHeight-at.top+8,maxHeight:Math.max(240,at.top-20)});
    };
    place();window.addEventListener('resize',place);return()=>window.removeEventListener('resize',place);
  },[anchor]);
  // 바깥을 누르거나 Esc를 누르면 닫는다 — 확인 창이 떠 있는 동안(held)은 그 창이 먼저다
  useEffect(()=>{
    const down=event=>{if(!held.current&&!panel.current?.contains(event.target)&&!anchor.current?.contains(event.target))onClose();};
    const key=event=>{if(event.key==='Escape'&&!held.current){event.stopPropagation();onClose();}};
    document.addEventListener('mousedown',down);document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('mousedown',down);document.removeEventListener('keydown',key,true);};
  },[anchor,held,onClose]);
  return createPortal(<div ref={panel} className="be-template-menu" style={box||{visibility:'hidden'}}>
    <header><strong>{industryName}</strong><span>조감도 템플릿 {templates.length}개 · 고르면 그 구성으로 스튜디오가 열려요</span></header>
    {templates.length?<div className="be-template-list" role="listbox" aria-label={industryName+' 조감도 템플릿'}>{templates.map(template=><TemplateItem key={template.id} template={template} library={library} disabled={disabled} onPick={onPick}/>)}</div>
      :<div className="be-start-empty">이 업종에는 아직 조감도 템플릿이 없어요.</div>}
  </div>,document.body);
}

export function BirdseyeStartDialog({library,go,onClose}){
  const [type,setType]=useState('spatial');
  const [industry,setIndustry]=useState(''),[spaces,setSpaces]=useState([]),[proposalId,setProposalId]=useState('');
  const [text,setText]=useState(''),[active,setActive]=useState(-1),[focused,setFocused]=useState(false),[hint,setHint]=useState('');
  const [picking,setPicking]=useState(false),[recommending,setRecommending]=useState(false),[browsing,setBrowsing]=useState(false),[confirming,setConfirming]=useState(null);
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  const controller=useRef(null),alive=useRef(true),input=useRef(null),picker=useRef(null),templateButton=useRef(null),held=useRef(false),enterWhileComposing=useRef(false);
  held.current=!!confirming;
  useEffect(()=>()=>{alive.current=false;controller.current?.abort();},[]);
  const stored=useStore(state=>state.proposals);
  const proposals=useMemo(()=>storyboardChoices(library),[stored,library]);
  const chosen=proposals.find(p=>p.id===proposalId)||null;
  const recommended=useMemo(()=>recommendedSpaces(library,industry),[library,industry]);
  const templates=useMemo(()=>industryTemplates(library,industry),[library,industry]);
  const {scene:confirmedScene,assets:confirmedAssets}=useSpatialTemplate(confirming?.template,library,!!confirming);
  const selectedScene=confirming?.scene||confirmedScene;
  const industryName=library.industries.find(i=>i.code===industry)?.name||'',full=spaces.length>=MAX_START_SPACES,typed=text.replace(/\s+/g,' ').trim();
  // 자동완성 — 입력창에 들어가 있는 동안 바로 위에 뜬다. 아직 치지 않았으면 추천 순서대로, 치면 치는 대로 좁힌다.
  const completing=focused&&!!industry&&!full;
  const suggestions=useMemo(()=>completing?searchSpaces(recommended,text,spaces,text.trim()?8:6):[],[completing,recommended,text,spaces]);
  const fresh=!!typed&&!suggestions.some(space=>spaceKey(space.name)===spaceKey(typed))&&!spaces.some(name=>spaceKey(name)===spaceKey(typed));
  useEffect(()=>setActive(-1),[text,industry]);
  // 제안서 목록은 바깥을 누르면 닫는다
  useEffect(()=>{
    if(!picking)return;
    const close=event=>{if(!picker.current?.contains(event.target))setPicking(false);};
    document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close);
  },[picking]);

  const run=async choice=>{
    if(busy)return;setError('');setBusy('스튜디오를 여는 중');
    const abort=new AbortController();controller.current=abort;
    try{
      const result=await startBirdseyeStudio(choice,{library,signal:abort.signal,onProgress:value=>{if(alive.current)setBusy(value);}});
      if(!alive.current||!result)return;
      onClose();go(result.route);if(result.note)toast(result.note);
    }catch(e){if(alive.current&&!abort.signal.aborted){setConfirming(null);setBrowsing(false);setError(e.message||'스튜디오를 열지 못했어요.');}}
    finally{if(alive.current)setBusy('');}
  };
  const add=value=>{const next=addSpaceName(spaces,value);setHint(next.error);if(next.names!==spaces){setSpaces(next.names);setText('');}return next.names!==spaces;};
  const remove=name=>{setSpaces(list=>list.filter(item=>item!==name));setHint('');};
  const toggle=name=>{const kept=spaces.find(item=>spaceKey(item)===spaceKey(name));if(kept)remove(kept);else add(name);};
  const onKey=event=>{
    // 한글 조합 중의 Enter는 글자를 확정할 뿐이다 — 조합이 끝나면(onCompositionEnd) 그때 넣는다
    if(event.nativeEvent.isComposing||event.keyCode===229){enterWhileComposing.current=event.key==='Enter';return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      if(!suggestions.length)return;event.preventDefault();
      setActive(index=>event.key==='ArrowDown'?(index+1)%suggestions.length:(index<=0?suggestions.length:index)-1);
    }else if(event.key==='Enter'){event.preventDefault();add(active>=0&&suggestions[active]?suggestions[active].name:text);}
    else if(event.key==='Escape'&&(completing||text)){event.stopPropagation();setText('');input.current?.blur();}
    else if(event.key==='Backspace'&&!text&&spaces.length)remove(spaces.at(-1));
  };
  const onCompositionEnd=event=>{
    if(!enterWhileComposing.current)return;enterWhileComposing.current=false;
    const value=event.target.value;setTimeout(()=>{if(alive.current)add(value);},0);
  };
  // 제안서에서 업종 · 공간 구성을 가져온다 — 공간 구성이 없는 제안서는 업종만 채우고 공간은 그대로 둔다
  const load=proposal=>{
    setPicking(false);setProposalId(proposal.id);setError('');
    if(proposal.industry)setIndustry(proposal.industry);
    if(proposal.spaces.length)setSpaces(proposal.spaces);
    setHint(proposal.spaces.length?'':'이 제안서에는 공간 구성이 없어요. 공간을 직접 넣어 주세요.');
  };
  const ready=!!industry&&spaces.length>0;
  const start=()=>run({type,industry,spaces,...(chosen?{proposalId:chosen.id}:{})});
  const close=()=>{if(busy)controller.current?.abort();onClose();};
  const fromTemplate=()=>{setError('');if(type==='building')void run({type:'building',source:'template'});else setBrowsing(open=>!open);};

  return <Modal title="조감도 스튜디오 시작" size="be-start-modal" onClose={close}
    footer={<><button ref={templateButton} type="button" className="btn btn-ghost btn-sm be-start-template" disabled={!!busy||type==='spatial'&&!industry} title={type==='spatial'&&!industry?'업종을 먼저 골라 주세요':undefined}
        {...(type==='spatial'?{'aria-haspopup':'listbox','aria-expanded':browsing}:{})} onClick={fromTemplate}>{type==='building'?'건물 템플릿에서 시작':<>업종 템플릿에서 시작<Icon name={browsing?'chevD':'chevU'} size={13}/></>}</button>
      <span className="be-start-status" role="status">{busy}</span><span className="sp"/><button type="button" className="btn btn-sm" onClick={close}>취소</button><button type="button" className="btn btn-primary btn-sm" disabled={!ready||!!busy} onClick={start}>{busy?'여는 중…':'시작'}</button></>}>
    <div className="be-start">
      <div className="be-tabs" role="tablist" aria-label="조감도 종류">{TYPES.map(t=><button key={t.id} type="button" role="tab" id={'be-tab-'+t.id} aria-selected={type===t.id} aria-controls="be-start-panel" disabled={!!busy}
        onClick={()=>{setType(t.id);setBrowsing(false);setError('');}}><Icon name={t.id==='building'?'building':'cube'} size={16}/>{t.name}<em>{t.tag}</em></button>)}</div>
      <div className="be-start-form" id="be-start-panel" role="tabpanel" aria-labelledby={'be-tab-'+type}>
        <div className="be-start-lead"><p>{type==='building'?'업종과 공간을 정하면 공간 하나를 한 층으로 쌓은 건물 스튜디오가 열려요.':'업종과 공간을 정하면 그 공간이 놓인 스튜디오가 열려요.'}</p>
          <div className="be-proposal-picker" ref={picker} onKeyDown={event=>{if(event.key==='Escape'&&picking){event.stopPropagation();setPicking(false);}}}>
            <button type="button" className="btn btn-sm" aria-haspopup="listbox" aria-expanded={picking} disabled={!!busy} onClick={()=>setPicking(open=>!open)}><Icon name="doc" size={15}/>제안서 불러오기<Icon name="chevD" size={13}/></button>
            {picking&&<div className="be-proposal-menu" role="listbox" aria-label="제안서 히스토리">
              {proposals.length?proposals.map(p=><button key={p.id} type="button" role="option" aria-selected={proposalId===p.id} data-proposal-id={p.id} onClick={()=>load(p)}>
                <span className="be-proposal-main"><strong>{p.title}</strong>{p.subtitle&&<em>{p.subtitle}</em>}<small>{p.requirement||'요구사항이 아직 없어요'}</small></span>
                <span className="be-proposal-meta"><span>{p.industryName||'업종 미정'}</span><span className={p.spaces.length?'is-on':''}>{p.spaces.length?`공간 ${p.spaces.length}곳`:'공간 구성 없음'}</span><span>제품 {p.products}</span></span></button>)
                :<div className="be-start-empty">아직 제안서가 없어요. Storyboard에서 제안서를 먼저 만들어 주세요.</div>}</div>}
          </div>
        </div>
        {chosen&&<div className="be-start-proposal" role="status"><Icon name="doc" size={15}/><span><strong>{chosen.title}</strong> 제안서에서 불러왔어요 · {chosen.placeable?`고른 제품 ${chosen.placeable}종을 알맞은 공간에 넣어요`:'공간에 놓을 수 있는 제품이 없어 제품 없이 시작해요'}</span>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={()=>setProposalId('')}>연결 해제</button></div>}
        {error&&<div className="be-start-error" role="alert">{error}</div>}
        <section aria-label="업종"><h3>업종<i aria-hidden="true">필수</i></h3>
          <div className="be-industries" role="group" aria-label="업종 선택">{library.industries.map(i=><button key={i.code} type="button" data-industry={i.code} aria-pressed={industry===i.code} disabled={!!busy} onClick={()=>{setIndustry(i.code);setHint('');}}>{i.name}</button>)}</div></section>
        <section aria-label="공간"><div className="be-space-head"><h3>공간<i aria-hidden="true">필수 · 1개 이상</i></h3>
          <button type="button" className="btn btn-sm" aria-haspopup="dialog" disabled={!industry||!!busy} title={industry?undefined:'업종을 먼저 골라 주세요'} onClick={()=>setRecommending(true)}><Icon name="sparkle" size={14}/>추천 공간{industry?` ${recommended.length}`:''}</button></div>
          <div className="be-space-field">
            {completing&&(suggestions.length>0||fresh)&&<div className="be-space-suggest" onMouseDown={event=>event.preventDefault()}>
              <p className="be-space-suggest-head"><span>{typed?'자동완성':'추천 공간'}</span><span>↑↓ 이동 · Enter 넣기</span></p>
              {suggestions.length>0&&<ul id={LISTBOX} role="listbox" aria-label="공간 자동완성">{suggestions.map((space,index)=><li key={space.templateId} id={LISTBOX+'-'+index} role="option" aria-selected={index===active}
                onClick={()=>{add(space.name);input.current?.focus();}}><span>{space.name}</span><small>{space.group}</small></li>)}</ul>}
              {fresh&&<p className="be-space-suggest-new" onClick={()=>{add(typed);input.current?.focus();}}><kbd>Enter</kbd><span>‘{typed}’ 그대로 넣기</span></p>}
            </div>}
            <div className="be-space-box" data-disabled={!industry||undefined} onClick={()=>input.current?.focus()}>
              {spaces.map(name=><span key={name} className="be-space-bubble">{name}<button type="button" aria-label={name+' 빼기'} disabled={!!busy} onClick={event=>{event.stopPropagation();remove(name);}}><Icon name="x" size={11} stroke={2.6}/></button></span>)}
              <input ref={input} role="combobox" aria-label="공간 입력" aria-autocomplete="list" aria-expanded={suggestions.length>0} aria-controls={LISTBOX} aria-activedescendant={active>=0&&suggestions[active]?LISTBOX+'-'+active:undefined}
                value={text} maxLength={100} autoComplete="off" disabled={!industry||!!busy||full} placeholder={!industry?'업종을 먼저 골라 주세요':full?`공간은 ${MAX_START_SPACES}개까지 넣을 수 있어요`:spaces.length?'공간 더 넣기':'예: 회의실 — 입력하고 Enter'}
                onChange={event=>{setText(event.target.value);setHint('');}} onKeyDown={onKey} onCompositionEnd={onCompositionEnd} onFocus={()=>setFocused(true)} onBlur={()=>{setFocused(false);enterWhileComposing.current=false;}}/>
            </div>
          </div>
          <p className={'be-start-note'+(hint?' is-warn':'')} role="status">{hint||(chosen?'입력창을 누르면 바로 위에 자동완성이 떠요. 고르거나 입력하고 Enter를 누르면 들어가요.':'입력창을 누르면 바로 위에 자동완성이 떠요. 고르거나 입력하고 Enter를 누르면 들어가요. 공간에는 가구 · 사람만 놓이고, 제품은 스튜디오에서 넣어요.')}</p></section>
      </div>
    </div>
    {recommending&&<RecommendedSpaces industryName={industryName} spaces={recommended} chosen={spaces} full={full} onToggle={toggle} onClose={()=>setRecommending(false)}/>}
    {browsing&&type==='spatial'&&industry&&<TemplateMenu anchor={templateButton} library={library} industryName={industryName} templates={templates} disabled={!!busy} held={held} onPick={setConfirming} onClose={()=>setBrowsing(false)}/>}
    {confirming&&<Modal title="이 템플릿으로 시작하시겠습니까?" sub="템플릿의 공간 · 가구 · 제품 구성 그대로 스튜디오가 열려요." size="be-template-confirm" onClose={()=>{if(!busy)setConfirming(null);}}
      footer={<><span className="be-start-status" role="status">{busy}</span><span className="sp"/><button type="button" className="btn btn-sm" disabled={!!busy} onClick={()=>setConfirming(null)}>취소</button>
        <button type="button" className="btn btn-primary btn-sm" data-autofocus disabled={!!busy} onClick={()=>run({type:'spatial',source:'template',template:confirming.template,view:'3d'})}>{busy?'여는 중…':'시작'}</button></>}>
      <div className="be-template-chosen" data-template-id={confirming.template.id}><TemplatePreview key={confirming.template.id+library.sourceHash} template={confirming.template} scene={selectedScene} library={(confirming.scene ? confirming.assets : confirmedAssets) || library}/>
        <strong>{selectedScene?.title || confirming.template.name}</strong><small>{[industryName,templateMeta(confirming.template,selectedScene,library)].filter(Boolean).join(' · ')}</small></div>
    </Modal>}
  </Modal>;
}
