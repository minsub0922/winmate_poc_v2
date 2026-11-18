// 레이아웃 관리 상세 머리 — 메타데이터: AI가 채우는 칸 · 사진과 그 묶음(항목마다 key 칸 · 같은 항목의 칸 · 사진) — app/api/layout_meta.py
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { ErrorBox, Loading } from './components';
import { Icon } from './icons';
import './layout-meta.css';

const enc = encodeURIComponent;
const ABOUT = { product: '제품', solution: '솔루션', space: '공간', case: '사례', point: '요구', topic: '주제', list: '목록', matrix: '표', picture: '사진' };
const KEY_BY = { code: '코드', fixed: '고정' };
const NAMES = { product: '제품 이름', space: '공간 이름', case: '사례 이름', item: '이름' };
const FORM = { sentence: '문장', phrase: '구', label: '라벨', list: '목록', number: '숫자', code: '코드', symbol: '기호', empty: '빈칸' };

function Cell({ c }) {
  return <li className={'lm-cell' + (c.key ? ' key' : '')}>
    <code>{c.i}</code>
    <span className="lm-role" title={c.role}>{c.role || '—'}</span>
    <span className="lm-tags">
      {c.key && <b className="lm-tag key">key</b>}
      {c.names && <b className="lm-tag name">{NAMES[c.names] || '이름'}</b>}
      {c.of?.length > 0 && <b className="lm-tag of" title={'칸 ' + c.of.join(' · ')}>→ {c.of.join(' · ')}</b>}
      {c.same?.length > 0 && <b className="lm-tag same" title={'칸 ' + c.same.join(' · ') + '과 같은 말'}>= {c.same.join(' · ')}</b>}
      <i className="lm-tag form">{FORM[c.form] || c.form} · {c.len}</i>
    </span>
  </li>;
}

function Pic({ p }) {
  return <li className={'lm-pic ' + p.shows}><code>사진 {p.slot}</code><b className="lm-tag">{p.shows === 'item' ? '항목' : '장면'}</b>{p.hint && <span title={p.hint}>{p.hint}</span>}</li>;
}

export function MetaMenu({ f }) {
  const button = useRef(null), pop = useRef(null);
  const [open, setOpen] = useState(false), [at, setAt] = useState(null), [meta, setMeta] = useState(null), [error, setError] = useState('');
  useEffect(() => { setMeta(null); setError(''); }, [f]);
  useEffect(() => {
    if (!open) return;
    const r = button.current.getBoundingClientRect(), w = Math.min(620, innerWidth - 24);
    setAt({ top: r.bottom + 8, left: Math.max(12, Math.min(r.right - w, innerWidth - w - 12)), width: w });
    if (!meta) api(`/layout-library/${enc(f)}/meta`).then(setMeta, e => setError(e.message));
    const down = e => { if (!pop.current?.contains(e.target) && !button.current?.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false); } };
    document.addEventListener('mousedown', down, true); window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key, true); };
  }, [open]);
  const n = meta?.counts;
  return <>
    <button ref={button} type="button" className="lf-in-button lm-button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(v => !v)}>
      메타데이터{n ? ` ${n.groups}` : ''}<Icon name="down" size={14}/></button>
    {open && at && createPortal(<div ref={pop} className="ll-ex-pop lm-pop" role="dialog" aria-label="메타데이터" style={at}>
      <header><h3>메타데이터</h3>{n && <span className="lm-counts"><b>칸 {n.cells}</b><b>사진 {n.pictures}</b><b>묶음 {n.groups}</b></span>}</header>
      <div className="lm-body">
        {error ? <ErrorBox error={error}/> : !meta ? <Loading/> : meta.none ? <p className="lm-none">—</p> : <>
          {meta.say && <p className="lm-say" title={meta.say}>{meta.say}</p>}
          {meta.groups.map(g => <section key={g.id} className={'lm-group ' + g.about} aria-label={'묶음 ' + g.label}>
            <h4><span>{g.label}</span><b className="lm-tag about">{ABOUT[g.about] || g.about}</b>
              {g.key != null && <b className="lm-tag key" title={g.key_in ? g.key_in : undefined}>key {g.key}{g.key_by ? ' · ' + KEY_BY[g.key_by] : ''}{g.key_in ? ' · ' + g.key_in : ''}</b>}</h4>
            {g.cells.length > 0 && <ul className="lm-cells">{g.cells.map(c => <Cell key={c.i} c={c}/>)}</ul>}
            {g.pictures.length > 0 && <ul className="lm-pics">{g.pictures.map(p => <Pic key={p.slot} p={p}/>)}</ul>}
          </section>)}
          {(meta.frame.length > 0 || meta.pictures.length > 0) && <section className="lm-group frame" aria-label="장 전체">
            <h4><span>장 전체</span></h4>
            {meta.frame.length > 0 && <ul className="lm-cells">{meta.frame.map(c => <Cell key={c.i} c={c}/>)}</ul>}
            {meta.pictures.length > 0 && <ul className="lm-pics">{meta.pictures.map(p => <Pic key={p.slot} p={p}/>)}</ul>}
          </section>}
          {meta.flags?.length > 0 && <ul className="lm-flags" aria-label="묶음 보정">{meta.flags.map((x, k) => <li key={k}>{x}</li>)}</ul>}
        </>}
      </div>
    </div>, document.body)}
  </>;
}
