// 태그된 제품 · 솔루션 · 유관사례를 어디서든 같은 모양으로 — 썸네일 + 메타데이터가 항상 보인다.
//   TagCard   카드(썸네일 + 종류 · 분류 · 이름 · 모델/요약 · 메타 2줄). size 'md' | 'sm'(썸네일 + 이름 + 한 줄)
//   TagStrip  태그 묶음(중복 제거, 등장 순서) + 머리말
//   TagChip   작은 칩(썸네일 + 이름 + 요약) — 칩 자리(트레이 · 예시 제품 · 시나리오 연결 · 검토 프로필)용
//   MentionInline  읽기 화면 본문 속 @태그(썸네일 + 이름)
//   mentionHtml    입력창(contentEditable) 본문 속 @태그 HTML — common.jsx MentionEditor가 쓴다
// 마우스를 올리면 peek(useDetailPeek)로 큰 상세 카드가 뜬다(넘긴 경우).
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Icon } from './common.jsx';
import { P, S, C, IND, TYPE_LABEL } from '../services/catalog.js';
import { Thumb } from './Thumbs.jsx';

const indShort = (code) => (IND[code] ? IND[code].name.split(' · ')[0] : '');
const ym = (d) => (d ? d.slice(0, 7).replace('-', '.') : '');
const more = (arr, n) => { const a = (arr || []).filter(Boolean); return a.length > n ? a.slice(0, n).join(' · ') + ' +' + (a.length - n) : a.join(' · '); };
const bits = (s, n) => String(s || '').split(' · ').filter(Boolean).slice(0, n).join(' · ');
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/**
 * Everything a tag shows, from the catalog. null when the id is unknown.
 *   kind  분류(카드 맨 위 · 종류 배지 옆)   sub  카드 이름 아래 한 줄   facts  카드 메타 줄들
 *   line  칩 · 작은 카드 · 버블 · 툴팁에 쓰는 한 줄 요약
 */
export function tagMeta(r) {
  const [type, id] = String(r || '').split(':');
  if (type === 'product') {
    const x = P[id]; if (!x) return null;
    return {
      type, id, ref: r, name: x.name, short: x.model, kind: x.cat,
      sub: x.model,
      line: [x.model, bits(x.spec, 2)].filter(Boolean).join(' · '),
      facts: [['사양', x.spec], ['공간', more(x.spaces, 3)], ['업종', more((x.ind || []).map(indShort), 3)]].filter((f) => f[1]),
    };
  }
  if (type === 'solution') {
    const x = S[id]; if (!x) return null;
    const prods = (x.with || []).map((pid) => P[pid] && P[pid].model).filter(Boolean);
    return {
      type, id, ref: r, name: x.name, short: x.name, kind: x.cat,
      sub: x.desc,
      line: x.cat,
      facts: [prods.length ? ['연동', more(prods, 3)] : null, ['업종', more((x.ind || []).map(indShort), 3)], ['분류', x.cat]].filter((f) => f && f[1]),
    };
  }
  if (type === 'case') {
    const x = C[id]; if (!x) return null;
    const res = (x.proof || []).length ? ['성과', x.proof[0]] : (x.needs || []).length ? ['니즈', x.needs[0]] : null;
    const ind = indShort(x.ind) || x.indRaw || '';
    return {
      type, id, ref: r, name: x.cust, short: x.cust, kind: ind || '사례',
      sub: [ym(x.date), x.type].filter(Boolean).join(' · ') || x.sub || x.title,
      line: [ind, ym(x.date)].filter(Boolean).join(' · '),
      facts: [['내용', x.sub || x.title], res, ['공간', more(x.space, 2)], ['제공', more((x.offer || []).length ? x.offer : x.prod, 2)]].filter((f) => f && f[1]),
      url: x.url,
    };
  }
  return null;
}

const hoverProps = (peek, r) => (peek ? {
  onMouseEnter: (e) => peek.show(r, e.currentTarget), onMouseLeave: peek.hide,
  onFocus: (e) => { if (e.target === e.currentTarget) peek.show(r, e.currentTarget, true); }, onBlur: peek.hide,
} : {});

/**
 * One tagged item. state: 'linked' | 'unlinked' | null — shown as a small badge (requirements screen).
 * onLink: shown on unlinked tags. onRemove: × in the corner.
 */
export function TagCard({ r, peek, size = 'md', state = null, onLink, onRemove, mentioned = false, facts = 2 }) {
  const m = tagMeta(r);
  if (!m) return null;
  const sm = size === 'sm';
  return (
    <div className={'tagc ' + m.type + ' ' + size + (state === 'unlinked' ? ' off' : '')} tabIndex={peek ? 0 : undefined} {...hoverProps(peek, r)}
      aria-label={TYPE_LABEL[m.type] + ' ' + m.name + ' · ' + m.line}>
      <span className="tg-th"><Thumb r={r} /></span>
      <span className="tg-b">
        {!sm && (
          <span className="tg-top">
            <span className={'tg-type ' + m.type}><Icon name={m.type} size={10} stroke={2.4} />{TYPE_LABEL[m.type]}</span>
            <span className="tg-kind" title={m.kind}>{m.kind}</span>
            {mentioned && <span className="tg-at" title="고객 요구사항 본문에서 @로 태그한 항목">@ 본문</span>}
            {state === 'linked' && <span className="tg-st on" title="이 제안서에 연결됨"><Icon name="check" size={10} stroke={3} />연결</span>}
          </span>
        )}
        <b className="tg-name" title={m.name}>{sm && <Icon name={m.type} size={11} stroke={2.4} className={'tg-ic ' + m.type} />}{m.name}</b>
        {sm ? <span className={'tg-line' + (m.type === 'product' ? ' num' : '')} title={m.line}>{m.line}</span>
          : <span className={'tg-line' + (m.type === 'product' ? ' num' : '')} title={m.sub}>{m.sub}</span>}
        {!sm && facts > 0 && (
          <dl className="tg-facts">
            {m.facts.slice(0, facts).map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd title={v}>{v}</dd></React.Fragment>)}
          </dl>
        )}
        {state === 'unlinked' && (
          <span className="tg-off">
            <span>연결 안 됨</span>
            {onLink && <button type="button" className="tg-link" onClick={(e) => { e.stopPropagation(); peek && peek.hide(); onLink(r); }}><Icon name="link" size={11} />연결</button>}
          </span>
        )}
      </span>
      {onRemove && <button type="button" className="tg-x" onClick={(e) => { e.stopPropagation(); peek && peek.hide(); onRemove(r); }} onFocus={(e) => e.stopPropagation()} aria-label={m.name + ' 빼기'} title="빼기"><Icon name="x" size={12} stroke={2.6} /></button>}
    </div>
  );
}

/** Tags in order of appearance, without duplicates. linkedOf(ref) → true/false marks the link state (omit = no badge). */
export function TagStrip({ refs, peek, title, size = 'md', linkedOf, onLink, mentioned, className = '', facts = 2, hint = true }) {
  const list = [...new Set((refs || []).filter((r) => tagMeta(r)))];
  if (!list.length) return null;
  return (
    <div className={'tagstrip ' + size + ' ' + className}>
      {title && <span className="ts-h">{title}<b className="num">{list.length}</b>{peek && hint && size === 'md' && <span className="ts-hint">마우스를 올리면 상세</span>}</span>}
      <div className="ts-list">
        {list.map((r) => <TagCard key={r} r={r} peek={peek} size={size} facts={facts} mentioned={mentioned ? mentioned.has(r) : false}
          state={linkedOf ? (linkedOf(r) ? 'linked' : 'unlinked') : null} onLink={onLink} />)}
      </div>
    </div>
  );
}

/** Small chip: thumbnail + name + one line. */
export function TagChip({ r, peek, onRemove, onClick, pressed, label }) {
  const m = tagMeta(r);
  if (!m) return null;
  const line = label && m.line.startsWith(label + ' · ') ? m.line.slice(label.length + 3) : m.line; // label = model → don't repeat it
  const inner = (
    <>
      <Thumb r={r} mini className="tgc-th" />
      <span className="tgc-t"><b>{label || m.name}</b><span className={m.type === 'product' ? 'num' : ''}>{line}</span></span>
    </>
  );
  const cls = 'tagchip ' + m.type + (pressed ? ' on' : '');
  if (onClick) {
    return (
      <button type="button" className={cls} aria-pressed={pressed == null ? undefined : !!pressed} onClick={onClick} {...hoverProps(peek, r)} title={m.name + ' · ' + m.line}>
        {pressed && <Icon name="check" size={11} stroke={3} className="tgc-ck" />}{inner}
      </button>
    );
  }
  return (
    <span className={cls} tabIndex={peek ? 0 : undefined} {...hoverProps(peek, r)} title={m.name + ' · ' + m.line}>
      {inner}
      {onRemove && <button type="button" className="tgc-x" onClick={(e) => { e.stopPropagation(); peek && peek.hide(); onRemove(r); }} aria-label={m.name + ' 빼기'}><Icon name="x" size={11} stroke={2.6} /></button>}
    </span>
  );
}

/** @tag inside read-only text (고객 요구서 보기): thumbnail + short name. */
export function MentionInline({ r, peek }) {
  const m = tagMeta(r);
  if (!m) return <span className="mention" data-type="x">@{String(r).split(':')[1] || r}</span>;
  return (
    <span className="mention has-th" data-type={m.type} data-ref={r} tabIndex={peek ? 0 : undefined} {...hoverProps(peek, r)} title={m.name + ' · ' + m.line}>
      <Thumb r={r} mini className="mn-th" />@{m.short}
    </span>
  );
}

// ---------- @tag HTML for the contentEditable editor ----------
const thumbHtml = new Map();
/** Static thumbnail markup (cached per ref) — the editor's chips are plain DOM, not React. */
export function mentionThumbHtml(r) {
  if (!thumbHtml.has(r)) {
    let h = '';
    try { h = renderToStaticMarkup(<Thumb r={r} mini className="mn-th" />); } catch (e) { h = ''; }
    thumbHtml.set(r, h);
  }
  return thumbHtml.get(r);
}
export const mentionShort = (r) => { const m = tagMeta(r); return m ? m.short : String(r).split(':')[1] || String(r); };
export const mentionTitle = (r) => { const m = tagMeta(r); return m ? m.name + ' · ' + m.line : ''; };
export { clip as tagClip };
