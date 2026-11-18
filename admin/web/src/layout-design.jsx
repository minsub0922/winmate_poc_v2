// 레이아웃 상세 — 시트 디자인 코드: Export(내려받기) → code agent 가 고침 → Upload(올리기) → 지금 디자인과 나란히 비교 → 고르기.
//   올린 파일은 서버가 검사한다(app/api/layout_library.design_check: 칸 번호 · 개수 그대로, 인라인 style 만, 스크립트 · 이벤트 속성 없음).
//   비교 팝업은 상세 팝업 위에 열리되 상세 팝업 상자 안쪽에만 놓인다(components.jsx Modal — 깊어질수록 작게, 덮지 않게).
//   두 시트는 같은 크기로 나란히(또는 겹쳐 밀어 보기) 보이고, 한쪽 영역에 마우스를 올리면 다른 쪽의 같은 칸도 함께 표시된다.
//   적용하면 그 장의 틀이 올린 디자인으로 바뀌고(웹앱 · Storyboard 자동 구성 · PPTX), 기본 디자인으로 되돌릴 수 있다.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, date } from './api';
import { Button, Modal, Loading, Toggle } from './components';
import { Icon } from './icons';
import { useApp } from './context';
import './layout-design.css';

const enc = encodeURIComponent;
const SLOT_CSS = `body[data-ld-slots=true] [data-tb],body[data-ld-slots=true] [data-img]{outline:1.5px dashed rgba(37,99,235,.65);outline-offset:-1px}
[data-ld-hot=true]{outline:3px solid #2563eb!important;outline-offset:1px!important;box-shadow:inset 0 0 0 2000px rgba(37,99,235,.12)!important}`;
const keyOf = el => el.hasAttribute('data-img') ? 'img:' + el.getAttribute('data-img') : 't:' + el.getAttribute('data-tb');

// 읽기 전용 시트(스크립트 없는 sandbox). 마우스는 부모 쪽 덮개가 받아 칸을 찾는다(Safari 도 같게).
function Preview({ html, title, slots, hot, onHot, clip }) {
  const host = useRef(null), frame = useRef(null), boxes = useRef([]);
  const [width, setWidth] = useState(0), [loaded, setLoaded] = useState(0);
  const scale = width / 1280;
  useEffect(() => { const ro = new ResizeObserver(es => setWidth(es[0].contentRect.width)); ro.observe(host.current); return () => ro.disconnect(); }, []);
  useEffect(() => {
    const doc = frame.current?.contentDocument; if (!doc?.body) return;
    const style = doc.createElement('style'); style.textContent = SLOT_CSS; doc.head.appendChild(style);
    boxes.current = [...doc.querySelectorAll('[data-tb],[data-img]')].map(el => { const b = el.getBoundingClientRect(); return { key: keyOf(el), x: b.left, y: b.top, w: b.width, h: b.height }; }).filter(b => b.w && b.h);
    return () => style.remove();
  }, [loaded]);
  useEffect(() => {
    const doc = frame.current?.contentDocument; if (!doc?.body) return;
    doc.body.dataset.ldSlots = String(!!slots);
    for (const el of doc.querySelectorAll('[data-tb],[data-img]')) el.dataset.ldHot = String(keyOf(el) === hot);
  });
  const move = e => {
    const r = host.current.getBoundingClientRect(), x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale;
    let best = null, area = Infinity;
    for (const b of boxes.current) if (x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h && b.w * b.h <= area) { best = b.key; area = b.w * b.h; }
    onHot?.(best);
  };
  return <div className="ld-sheet" ref={host} style={clip ? { clipPath: clip } : undefined}>
    {html && width > 0 ? <iframe ref={frame} title={title} sandbox="allow-same-origin" referrerPolicy="no-referrer" tabIndex={-1} srcDoc={html} onLoad={() => setLoaded(v => v + 1)} style={{ transform: `scale(${scale})` }}/> : <span className="ll-sheet-wait"/>}
    {onHot && <div className="ld-hit" onPointerMove={move} onPointerLeave={() => onHot(null)}/>}
  </div>;
}

// 겹쳐 보기: 지금 디자인 위에 올린 디자인을 겹치고, 손잡이를 끌어 경계를 옮긴다(왼쪽 = 올린 디자인)
function Wipe({ value, slots, hot, onHot }) {
  const box = useRef(null), [pos, setPos] = useState(50), drag = useRef(false);
  const at = e => { const r = box.current.getBoundingClientRect(); setPos(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100))); };
  return <div className="ld-wipe-wrap"><div className="ld-wipe-caption"><span>◀ 올린 디자인</span><span>지금 ▶</span></div><div className="ld-wipe" ref={box}>
    <Preview html={value.current} title="지금 디자인" slots={slots} hot={hot}/>
    <div className="ld-wipe-top"><Preview html={value.upload} title="올린 디자인" slots={slots} hot={hot} clip={`inset(0 ${100 - pos}% 0 0)`} onHot={onHot}/></div>
    <div className="ld-handle" role="slider" tabIndex={0} aria-label="겹쳐 보기 경계" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)} style={{ left: pos + '%' }}
      onPointerDown={e => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => drag.current && at(e)} onPointerUp={() => { drag.current = false; }}
      onKeyDown={e => { if (e.key === 'ArrowLeft') setPos(p => Math.max(0, p - 5)); if (e.key === 'ArrowRight') setPos(p => Math.min(100, p + 5)); }}><i/></div>
  </div></div>;
}

function DesignCompare({ f, rev, value, close, reupload, onAdopted }) {
  const { notify } = useApp();
  const [mode, setMode] = useState('side'), [slots, setSlots] = useState(false), [hot, setHot] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function adopt() {
    setBusy(true); setError('');
    try {
      const next = await api(`/layout-library/${enc(f)}/design`, { method: 'PUT', body: JSON.stringify({ html: value.text, name: value.name, rev, confirmed: true }) });
      onAdopted(next); notify('올린 디자인을 적용했습니다.'); close();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const report = value.report, problems = value.error ? value.error.split(' · ') : [];
  return <Modal wide title="디자인 비교" subtitle={value.name} close={busy ? () => {} : close}
    footer={<><Button icon="upload" disabled={busy} onClick={reupload}>다른 파일</Button><span className="ld-spacer"/>
      {report ? <><Button disabled={busy} onClick={close}>지금 디자인 유지</Button><Button variant="primary" busy={busy} disabled={report.same} onClick={adopt}>올린 디자인 적용</Button></> : <Button onClick={close}>닫기</Button>}</>}>
    <div className="ld-compare">
      {value.loading ? <Loading/> : value.error ? <div className="ld-problems" role="alert"><strong>올릴 수 없는 파일입니다</strong><ul>{problems.map(p => <li key={p}>{p}</li>)}</ul></div> : <>
        <div className="ld-bar">
          <div className="ld-seg" role="group" aria-label="비교 방식">{[['side', '나란히'], ['wipe', '겹쳐 보기']].map(([k, l]) => <button key={k} type="button" aria-pressed={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>
          <label className="ld-toggle">칸 보기<Toggle checked={slots} onChange={setSlots} label="칸 보기"/></label>
          <span className="ld-fact ok"><Icon name="check" size={13}/>칸 그대로 · 글 {report.slots.t} · 그림 {report.slots.img}</span>
          {report.same && <span className="ld-fact">지금 디자인과 같음</span>}
          {report.warnings.map(w => <span key={w} className="ld-fact warn" title={w}><Icon name="alert" size={13}/>{w}</span>)}
        </div>
        {error && <p className="ld-error" role="alert">{error}</p>}
        <div className="ld-stage">{mode === 'side' ? <div className="ld-pair">
          <figure><figcaption>지금</figcaption><Preview html={value.current} title="지금 디자인" slots={slots} hot={hot} onHot={setHot}/></figure>
          <figure><figcaption>올린 디자인</figcaption><Preview html={value.upload} title="올린 디자인" slots={slots} hot={hot} onHot={setHot}/></figure>
        </div> : <Wipe value={value} slots={slots} hot={hot} onHot={setHot}/>}</div>
        <span className="ld-hot" aria-live="polite">{hot ? (hot.startsWith('t:') ? '글 ' : '그림 ') + hot.slice(hot.indexOf(':') + 1) : ''}</span>
      </>}
    </div>
  </Modal>;
}

/** 시트 도구줄 왼쪽: Export · Upload (+ 올린 디자인 표시 · 되돌리기). onChange(next detail) */
export function DesignTools({ f, rev, design, disabled, onChange }) {
  const { notify } = useApp();
  const input = useRef(null);
  const [busy, setBusy] = useState(false), [compare, setCompare] = useState(null), [resetting, setResetting] = useState(false), [error, setError] = useState('');
  async function download() {
    setBusy(true);
    try {
      const r = await fetch(`/admin/api/layout-library/${enc(f)}/design`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || '디자인 코드를 내려받지 못했습니다.');
      const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
      a.href = url; a.download = f + '.design.html'; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  }
  async function upload(file) {
    if (!file) return;
    const text = await file.text(), base = { name: file.name, text };
    setCompare({ ...base, loading: true });
    try { setCompare({ ...base, ...await api(`/layout-library/${enc(f)}/design/check`, { method: 'POST', body: JSON.stringify({ html: text }) }) }); }
    catch (e) { setCompare({ ...base, error: e.message }); }
  }
  async function reset() {
    setBusy(true); setError('');
    try { onChange(await api(`/layout-library/${enc(f)}/design`, { method: 'DELETE', body: JSON.stringify({ rev, confirmed: true }) })); setResetting(false); notify('기본 디자인으로 되돌렸습니다.'); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <>
    <div className="ld-tools">
      <button type="button" className="ld-btn" disabled={busy || disabled} onClick={download} title="디자인 코드 내려받기 (.html)"><Icon name="download" size={14}/>Export</button>
      <button type="button" className="ld-btn" disabled={busy || disabled} onClick={() => input.current.click()} title="고친 디자인 코드 올리기"><Icon name="upload" size={14}/>Upload</button>
      <input ref={input} type="file" accept=".html,.htm,text/html" hidden aria-label="디자인 코드 파일" onChange={e => { upload(e.target.files[0]); e.target.value = ''; }}/>
      {design && <span className="ld-mark" title={[design.name, date(design.updated_at, true), design.updated_by].filter(Boolean).join(' · ')}>올린 디자인
        <button type="button" aria-label="기본 디자인으로 되돌리기" disabled={busy || disabled} onClick={() => setResetting(true)}><Icon name="close" size={11}/></button></span>}
    </div>
    {/* 팝업은 body 로 — 상세 팝업 DOM 밖(겹친 팝업 규칙 · :has 스타일이 상세 팝업에 번지지 않게) */}
    {compare && createPortal(<DesignCompare f={f} rev={rev} value={compare} close={() => setCompare(null)} reupload={() => input.current.click()} onAdopted={onChange}/>, document.body)}
    {resetting && createPortal(<Modal title="기본 디자인으로 되돌릴까요?" close={busy ? () => {} : () => setResetting(false)}
      footer={<><Button disabled={busy} onClick={() => setResetting(false)}>취소</Button><Button variant="primary" busy={busy} onClick={reset}>되돌리기</Button></>}>
      {error && <p className="ld-error" role="alert">{error}</p>}
      <p>올린 디자인을 빼고 기본 디자인으로 그립니다. 글 · 칸 설정은 그대로입니다.</p>
    </Modal>, document.body)}
  </>;
}
