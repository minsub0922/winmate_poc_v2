import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getBootstrap } from '../api/bootstrap.js';
import { requestJson } from '../api/client.js';
import { loadUi, saveUi } from '../repositories/proposals.js';
import { showLogin, useSession } from '../api/session.js';
import './profile-popup.css';

function ProfilePopup({ anchor, username, onClose }) {
  const ref=useRef(null),working=useRef(false);
  const [position,setPosition]=useState({left:12,top:12});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useLayoutEffect(()=>{
    const place=()=>{
      if(!anchor.current||!ref.current)return;
      const side=anchor.current.closest('.sidebar').getBoundingClientRect(),button=anchor.current.getBoundingClientRect(),popup=ref.current.getBoundingClientRect();
      setPosition({left:Math.max(12,Math.min(side.right+12,window.innerWidth-popup.width-12)),top:Math.max(12,Math.min(button.bottom-popup.height,window.innerHeight-popup.height-12))});
    };
    place();const observer=new ResizeObserver(place);observer.observe(anchor.current.closest('.sidebar'));observer.observe(ref.current);
    window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
    ref.current.focus({preventScroll:true});
    return()=>{observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[]);
  useEffect(()=>{
    const outside=e=>{if(!ref.current?.contains(e.target)&&!anchor.current?.contains(e.target))onClose(false);};
    const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose(true);}};
    document.addEventListener('pointerdown',outside,true);document.addEventListener('focusin',outside);document.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',outside);document.removeEventListener('keydown',key,true);};
  },[onClose]);
  const logout=async()=>{
    if(working.current)return;working.current=true;setBusy(true);setError('');
    try {
      const result=await requestJson('/api/auth/logout',{method:'POST'});
      if(!result.ok)throw new Error('로그아웃하지 못했습니다. 다시 시도해 주세요.');
      saveUi({...loadUi(),route:{name:'home'}});
      window.location.replace('/');
    } catch(error) { setError(error.message||'로그아웃하지 못했습니다. 다시 시도해 주세요.');working.current=false;setBusy(false); }
  };
  return createPortal(<section id="winmate-profile-popup" className="profile-popup" ref={ref} tabIndex={-1} role="dialog" aria-label="로그인 정보" style={position}>
    <div className="profile-popup-info"><span className="avatar" aria-hidden="true">{username.slice(0,1).toUpperCase()}</span><div><span>로그인 계정</span><strong>{username}</strong><small>로그인 중</small></div></div>
    {error&&<p className="profile-popup-error" role="alert">{error}</p>}
    <button type="button" className="profile-popup-logout" disabled={busy} onClick={logout}>{busy?'로그아웃 중…':'로그아웃'}</button>
  </section>,document.body);
}

export function ProfileButton() {
  const {guest,modal}=useSession(),anchor=useRef(null),[open,setOpen]=useState(false);
  const username=guest?'게스트':getBootstrap().user?.username||'로컬 계정';
  useEffect(()=>{if(guest||modal)setOpen(false);},[guest,modal]);
  const close=restore=>{setOpen(false);if(restore)requestAnimationFrame(()=>anchor.current?.focus({preventScroll:true}));};
  return <>
    <button ref={anchor} type="button" className="sb-foot" aria-label="유저 프로필" aria-haspopup="dialog" aria-expanded={!guest&&open} aria-controls={!guest&&open?'winmate-profile-popup':undefined} onClick={()=>guest?showLogin():setOpen(value=>!value)}>
      <span className="avatar">{username.slice(0,1).toUpperCase()}</span>
      <span className="sb-tx sb-me" style={{minWidth:0,flex:1}}><div style={{fontSize:'var(--text-13px)',fontWeight:'var(--weight-600)'}}>{username}</div><div style={{fontSize:'var(--text-11-5px)',color:'var(--muted)'}}>{guest?'로그인하고 시작하기':'Winmate v2 · 로컬'}</div></span>
    </button>
    {!guest&&open&&<ProfilePopup anchor={anchor} username={username} onClose={close}/>}
  </>;
}
