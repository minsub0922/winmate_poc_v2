// Context items (제품 · 솔루션 · 유관사례) as cards with a thumbnail and metadata.
// Shared by the Storyboard 제품 · 솔루션 매칭 bubble and its popup (ctxconfirm.jsx MatchPopup); ContextCards is the former tabbed matching modal's content, currently unused.
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { DeleteButton, Icon, AddRefInput, toast } from './common.jsx';
import { P, S, C, IND, refInfo } from '../services/catalog.js';
import { Thumb } from './Thumbs.jsx';
import { recommendContext, inferIndustry, reqText } from '../services/search.js';
import { addRef, removeRef, refsOf } from './requirements.jsx';
import { segRefs } from '../repositories/proposals.js';
import { useDetailPeek } from './reference-detail.jsx';
import { tagMeta } from './tagcard.jsx';

// [ctx key, ref type, label, recommended minimum] — same order as the requirements screen
export const KIND = [['products', 'product', '제품', 2], ['solutions', 'solution', '솔루션', 1], ['cases', 'case', '유관사례', 1]];
function mentionedRefs(p) {
  const s = new Set(segRefs(p.req.free));
  for (const k of p.req.form.keymen || []) for (const r of k.reqs || []) for (const x of segRefs(r)) s.add(x);
  return s;
}

const indShort = (code) => (IND[code] ? IND[code].name.split(' · ')[0] : '');
const more = (arr, n) => { const a = (arr || []).filter(Boolean); return a.length > n ? a.slice(0, n).join(' · ') + ' +' + (a.length - n) : a.join(' · '); };
const ym = (d) => (d ? d.slice(0, 7).replace('-', '.') : '');

/** a list where items already linked to the proposal are marked */
function Linked({ items, hit, n = 3 }) {
  const sorted = [...items].sort((a, b) => (hit(b.id) ? 1 : 0) - (hit(a.id) ? 1 : 0));
  const shown = sorted.slice(0, n);
  return (
    <>
      {shown.map((x, i) => (
        <React.Fragment key={x.id}>{i > 0 && ' · '}{hit(x.id) ? <b className="hit" title="이 제안서에 연결됨"><Icon name="check" size={11} stroke={3} />{x.label}</b> : x.label}</React.Fragment>
      ))}
      {sorted.length > n && <span className="faint"> +{sorted.length - n}</span>}
    </>
  );
}

export function metaOf(r, p) {
  const [type, id] = String(r).split(':');
  const ctx = (p && p.ctx) || { products: [], solutions: [], cases: [] };
  if (type === 'product') {
    const x = P[id]; if (!x) return null;
    const sols = Object.values(S).filter((s) => s.with.includes(x.id)).map((s) => ({ id: s.id, label: s.name }));
    return {
      type, tag: x.cat, sub: x.model,
      rows: [
        ['사양', x.spec],
        ['공간', more(x.spaces, 3)],
        ['업종', more(x.ind.map(indShort), 3)],
        sols.length ? ['연동', <Linked items={sols} hit={(sid) => ctx.solutions.includes(sid)} n={2} />] : null,
      ].filter((row) => row && row[1]),
    };
  }
  if (type === 'solution') {
    const x = S[id]; if (!x) return null;
    const prods = x.with.map((pid) => P[pid] && { id: pid, label: P[pid].model }).filter(Boolean);
    return {
      type, tag: x.cat, sub: null, desc: x.desc,
      rows: [
        prods.length ? ['함께 쓰는 제품', <Linked items={prods} hit={(pid) => ctx.products.includes(pid)} n={3} />] : null,
        ['업종', more(x.ind.map(indShort), 3)],
      ].filter((row) => row && row[1]),
    };
  }
  if (type === 'case') {
    const x = C[id]; if (!x) return null;
    const res = (x.proof || []).length ? ['성과', x.proof[0]] : (x.needs || []).length ? ['고객 니즈', x.needs[0]] : null;
    return {
      type, tag: indShort(x.ind) || x.indRaw || '사례', sub: x.sub || x.title,
      rows: [
        x.type ? ['고객 유형', x.type] : null,
        ['공간', more(x.space, 2)],
        ['제공', more((x.offer || []).length ? x.offer : x.prod, 2)],
        res,
      ].filter((row) => row && row[1]),
      date: ym(x.date), url: x.url,
    };
  }
  return null;
}

export function RefCard({ r, p, onRemove, mentioned }) {
  const info = refInfo(r);
  const m = metaOf(r, p);
  if (!info || !m) return null;
  return (
    <article className={'rcard ' + m.type} aria-label={info.label}>
      <div className="rc-media">
        <Thumb r={r} />
        <span className="rc-tag">{m.tag}</span>
        {mentioned && <span className="rc-at" title="고객 요구사항 본문에서 @로 부른 항목">@ 본문</span>}
        {onRemove && <DeleteButton className="rc-x" onClick={() => onRemove(r)} aria-label={info.label + ' 연결 해제'} title="연결 해제"><Icon name="x" size={14} stroke={2.4} /></DeleteButton>}
      </div>
      <div className="rc-body">
        <h4 className="rc-name" title={info.label}>{info.label}</h4>
        {m.sub && <div className={'rc-sub' + (m.type === 'product' ? ' num' : '')}>{m.sub}</div>}
        {m.desc && <p className="rc-desc">{m.desc}</p>}
        <dl className="rc-meta">
          {m.rows.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}
        </dl>
        {m.type === 'case' && (m.date || m.url) && (
          <div className="rc-foot">
            {m.date && <span className="num">{m.date}</span>}
            {m.url && <a href={m.url} target="_blank" rel="noopener noreferrer">사례 원문<Icon name="ext" size={12} /></a>}
          </div>
        )}
      </div>
    </article>
  );
}

/** Hover / focus detail — big card with image gallery, metadata and related cases (peek.jsx). */
const usePeek = (p) => useDetailPeek(p);

/** metadata lines under a tile's name — always visible (사양 · 공간 / 설명 · 연동 / 성과 · 공간) */
function TileFacts({ r, n }) {
  const m = tagMeta(r); if (!m) return null;
  const facts = m.facts.filter(([k]) => !(m.type === 'case' && k === '내용')).slice(0, n);
  if (!facts.length) return null;
  return <span className="ct-facts">{facts.map(([k, v]) => <span key={k} className="ct-f" title={v}><i>{k}</i>{v}</span>)}</span>;
}

/** Compact image tile. Linked: hover → detail, × → unlink. Recommended: the whole tile links it. */
function CTile({ r, p, rec, mentioned, onRemove, onAdd, peek }) {
  const info = refInfo(r);
  const m = metaOf(r, p);
  if (!info || !m) return null;
  const type = r.split(':')[0];
  const hov = { onMouseEnter: (e) => peek.show(r, e.currentTarget), onMouseLeave: peek.hide, onFocus: (e) => peek.show(r, e.currentTarget, true), onBlur: peek.hide };
  if (rec) {
    return (
      <button className={'ctile rec ' + type} {...hov} onClick={() => { peek.hide(); onAdd(rec); }} aria-label={info.label + ' 연결하기'}>
        <span className="ct-media"><Thumb r={r} /><span className="ct-add"><Icon name="plus" size={12} stroke={2.8} />연결</span></span>
        <span className="ct-body">
          <b className="ct-name" title={info.label}>{info.label}</b>
          <span className={'ct-sub' + (type === 'product' ? ' num' : '')}>{rec.sub || m.sub || m.tag}</span>
          <TileFacts r={r} n={1} />
          {rec.why && <span className="ct-why"><Icon name="sparkle" size={10} />{rec.why}</span>}
        </span>
      </button>
    );
  }
  return (
    <div className={'ctile ' + type} tabIndex={0} {...hov} {...peek.detailProps(r)} aria-label={info.label}>
      <span className="ct-media">
        <Thumb r={r} />
        {mentioned && <span className="rc-at" title="고객 요구사항 본문에서 @로 부른 항목">@ 본문</span>}
      </span>
      <DeleteButton className="rc-x" onClick={(e) => { e.stopPropagation(); peek.hide(); onRemove(r); }} onFocus={(e) => e.stopPropagation()} aria-label={info.label + ' 연결 해제'} title="연결 해제"><Icon name="x" size={14} stroke={2.4} /></DeleteButton>
      <span className="ct-body">
        <b className="ct-name" title={info.label}>{info.label}</b>
        <span className={'ct-sub' + (type === 'product' ? ' num' : '')}>{type === 'solution' ? m.tag : [m.sub, type === 'product' ? m.tag : ''].filter(Boolean).join(' · ') || m.tag}</span>
        <TileFacts r={r} n={2} />
      </span>
    </div>
  );
}

/** One kind of context: search to add, linked tiles, recommended tiles (click to link). */
export function ContextCards({ p, kind }) {
  const [, t, label] = KIND.find((x) => x[0] === kind);
  const list = p.ctx[kind];
  const ind = p.ind || inferIndustry(reqText(p));
  const recs = recommendContext(p, ind, kind, 8);
  const mentioned = mentionedRefs(p);
  const peek = usePeek(p);
  return (
    <div className="ctxc">
      <div className="ctxc-head">
        <h3 className="ctxc-h">연결된 {label} <span className="c num">{list.length}</span></h3>
        <AddRefInput id={'cc-' + kind} onAdd={(r) => { addRef(p.id, r); toast(refInfo(r).label + ' 연결했어요'); }} exclude={refsOf(p)} types={[t]} placeholder={'@ ' + label + ' 찾아 추가'} />
      </div>
      {list.length ? (
        <div className="ct-grid">
          {list.map((id) => { const r = t + ':' + id; return <CTile key={r} r={r} p={p} peek={peek} mentioned={mentioned.has(r)} onRemove={(x) => { removeRef(p.id, x); toast(refInfo(x).label + ' 연결을 해제했어요'); }} />; })}
        </div>
      ) : (
        <div className="rc-empty"><Icon name={t} size={20} /><span>아직 연결된 {label}{kind === 'cases' ? '가' : '이'} 없어요. 위에서 찾거나 아래 추천을 눌러 연결해 주세요.</span></div>
      )}
      {recs.length > 0 && (
        <section className="ctxc-recs" aria-label={'추천 ' + label}>
          <h4 className="ctxc-sh"><Icon name="sparkle" size={13} />추천 {label}<span className="faint">누르면 바로 연결돼요 · 마우스를 올리면 상세</span></h4>
          <div className="ct-grid">{recs.map((rec) => <CTile key={rec.ref} r={rec.ref} p={p} rec={rec} peek={peek} onAdd={(x) => { addRef(p.id, x.ref); toast(x.label + ' 연결했어요'); }} />)}</div>
        </section>
      )}
      {peek.node}
    </div>
  );
}

// ---------- short labels for linked items (Storyboard 매칭 버블) ----------
/** short title: product → model */
export function shortOf(r) {
  const [type, id] = String(r).split(':');
  if (type === 'product' && P[id]) return P[id].model;
  const info = refInfo(r); return info ? info.label : '';
}
/** one line of metadata under the title */
export function briefOf(r) {
  const [type, id] = String(r).split(':');
  if (type === 'product') { const x = P[id]; return x ? [x.cat, (x.spec || '').split(' · ')[0]].filter(Boolean).join(' · ') : ''; }
  if (type === 'solution') { const x = S[id]; return x ? x.cat : ''; }
  if (type === 'case') { const x = C[id]; return x ? [indShort(x.ind) || x.indRaw, ym(x.date)].filter(Boolean).join(' · ') : ''; }
  return '';
}
