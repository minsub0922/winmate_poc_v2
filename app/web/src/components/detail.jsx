import {FeedbackPopup} from './feedback-popup.jsx';
// Layout detail popup (Storyboard) — the shared sheet popup frame (sheetview.jsx): same big sheet as everywhere else, this page's editing panel on the right.
// Left: the slide — text is edited in place, a click selects its meaning unit (card · KPI tile · row …), an image click opens alternatives right there.
// Right: nothing selected → what to reference for this sheet (product key messages · images, web sources, customer files, cases);
//        a unit selected → the evidence behind that unit (web links · attached pptx/pdf · catalog).
import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { update, segPlain, resolveImg } from '../repositories/proposals.js';
import { DeleteButton, Icon, toast, AddRefInput } from './common.jsx';
import { REQ_LABEL, partText, effectiveType } from '../domain/proposals/parts.js';
import { L, IND, P, S, C, IMAGE_DB, refInfo, deckOrder, isCoverSheet,layoutHtml } from '../services/catalog.js';
import { reqText, inferIndustry } from '../services/search.js';
import { aiFill, aiErrorText, ctxSummary } from '../services/ai.js';
import { Slide, readBlocks, readImageSlots } from '../domain/slides/Slide.jsx';
import { SheetView } from './sheetview.jsx';
import { PImg } from '../services/products.js';
import { mediaPhotos } from '../services/media.js';
import { Thumb } from './Thumbs.jsx';
import { TagChip, tagMeta } from './tagcard.jsx';
import { ImagePicker } from './imagepick.jsx';
import {SpatialLayoutPicker} from './spatial-layout-picker.jsx';
import {isSpatialStoryboardLayout,selectSpatialStoryboardLayout} from '../domain/spatial/storyboard-layout.js';
import { useImagePeek } from './imagepeek.jsx';
import { rankImages, KIND_GROUP, KIND_NAME, fileToStoredImage, suggestImages } from '../services/images.js';
import { readUnits, unitState, STATE_LABEL, buildPool, toEvidence, evKey, attribute, suggestForUnit, sheetRecs, hostOf, FIXED_RE, unitProducts, planProductSwap, productEv } from '../domain/slides/evidence.js';
import { ContextExplorer, folderOf } from './ctxexplorer.jsx';
import { webSourcesFor } from '../services/websources.js';
import { FavButton } from './fav.jsx';
import { ContextSlide } from './context-slide.jsx';
import { useImageLibrary } from '../services/image-library.js';
import { relatedImages, imageProducts } from '../services/images.js';
import { contextPending, layoutContextChanged } from '../domain/slides/context-policy.js';
import { inspectLayoutContext, retryLayoutContext } from '../services/layout-context.js';
import { useLayoutRemoval } from './layout-removal.jsx';
import { LayoutEditor } from './mytpl.jsx';
import { CustomerSources, SheetReferenceGrid, WebSources } from './sheet-sources.jsx';

const isPh = (s) => /\[[^\]]{1,24}\]/.test(s);
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/* =========================================================
   Info the AI fill needs (prefilled from requirements · context)
   ========================================================= */
function lines(text) { return String(text || '').split(/\n|(?<=[.!?。])\s+/).map((s) => s.trim()).filter(Boolean); }
function buildQuestions(p, part, l) {
  const f = p.req.form || {};
  const text = reqText(p);
  const ls = lines(text);
  const pick = (re, n = 3) => ls.filter((s) => re.test(s)).slice(0, n).map((s) => s.slice(0, 90)).join(' / ');
  const prods = p.ctx.products.map((id) => P[id]).filter(Boolean);
  const keyReqs = (f.keymen || []).flatMap((k) => (k.reqs || []).map((r) => segPlain(r, (ref) => (refInfo(ref) || {}).short || ''))).filter((x) => x.trim());
  const t = effectiveType(part);
  const fromPart = partText(part).replace(/\n+/g, ' / ');
  const ind = p.ind || inferIndustry(text);
  const val = {
    customer: [p.customer || f.customer, '요구사항'],
    project: [f.project || p.title, '요구사항'],
    industry: [ind && IND[ind] ? IND[ind].name : '', '요구사항'],
    spaces: ['scenario', 'birdseye', 'dss', 'products'].includes(t) && part.items.length ? [fromPart, '파트 내용'] : [[...new Set(prods.flatMap((x) => x.spaces))].slice(0, 5).join(', '), '연결된 제품'],
    products: [prods.slice(0, l.pc || 6).map((x) => x.id), '연결된 제품'],
    solutions: [p.ctx.solutions.map((id) => S[id] && S[id].name).filter(Boolean).join(', '), '연결된 솔루션'],
    cases: [p.ctx.cases.map((id) => C[id] && C[id].cust + ' — ' + (C[id].sub || C[id].title).slice(0, 40)).filter(Boolean).join(' / '), '유관사례'],
    kpis: [pick(/\d+\s*(%|배|분|일|시간|억|만|원|곳|개|실|대)/), '요구사항에서'],
    challenges: [keyReqs.slice(0, 4).join(' / ') || pick(/문제|불편|어려|부담|불일치|대기/), '키맨 요구사항'],
    values: [t === 'value' || t === 'effect' ? fromPart : keyReqs.slice(0, 3).join(' / '), t === 'value' || t === 'effect' ? '파트 내용' : '키맨 요구사항'],
    users: [t === 'user' ? fromPart : '', '파트 내용'],
    competitors: [pick(/경쟁|타사|LG|비교/), '요구사항에서'],
    timeline: [pick(/단계|파일럿|일정|개월|주차|오픈|착공|준공/), '요구사항에서'],
    keymen: [(f.keymen || []).filter((k) => k.name).map((k) => k.name + ' ' + k.weight + '%').join(', '), '입력 폼'],
    quantities: [pick(/\d+\s*(대|개|매장|실|층|곳|면)/), '요구사항에서'],
    costs: [pick(/비용|예산|가격|TCO|원/), '요구사항에서'],
    contacts: ['', ''], sources: ['', ''],
  };
  const keys = ['customer', 'project', ...(l.req || []).filter((k) => !['customer', 'project', 'images'].includes(k))];
  return [...new Set(keys)].map((k) => {
    const [v, src] = val[k] || ['', ''];
    const empty = Array.isArray(v) ? !v.length : !String(v || '').trim();
    return { k, label: REQ_LABEL[k] || k, v: v || (k === 'products' ? [] : ''), src: empty ? '' : src, need: (l.req || []).includes(k) };
  });
}


function InfoCheck({ p, l, qs, setQs }) {
  const [open, setOpen] = useState(false);
  const setQ = (k, v) => setQs((a) => a.map((q) => (q.k === k ? { ...q, v } : q)));
  const isEmpty = (q) => (Array.isArray(q.v) ? !q.v.length : !String(q.v).trim());
  const need = qs.filter((q) => q.need);
  const miss = need.filter(isEmpty);
  return (
    <div className={'infochk' + (open ? ' open' : '')}>
      <button type="button" className="ic-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="form" size={14} />
        <span>채우기에 쓸 정보</span>
        <span className={'ic-state' + (miss.length ? ' warn' : '')}>{need.length ? (miss.length ? '필수 ' + need.length + '개 중 ' + miss.length + '개 비어 있음' : '필수 정보 확인됨') : qs.length + '개 항목'}</span>
        <Icon name={open ? 'chevU' : 'chevD'} size={14} />
      </button>
      {open && (
        <div className="qa">
          {qs.map((q) => {
            const empty = isEmpty(q);
            return (
              <div key={q.k} className={'qa-item' + (q.need && empty ? ' need' : '')}>
                <div className="q"><label htmlFor={'qa-' + q.k}>{q.label}</label>{q.need && <span className="rq">필수</span>}<span className="src">{empty ? (q.need ? '비어 있음 · 자리표시로 남아요' : '선택') : '· ' + q.src}</span></div>
                {q.k === 'products' ? (
                  <div className="prodpick">
                    <div className="chips">
                      {[...new Set([...p.ctx.products, ...q.v])].map((id) => P[id] && (
                        <TagChip key={id} r={'product:' + id} label={P[id].model} pressed={q.v.includes(id)} onClick={() => setQ('products', q.v.includes(id) ? q.v.filter((z) => z !== id) : [...q.v, id])} />
                      ))}
                    </div>
                    <AddRefInput id={'qa-' + q.k} types={['product']} exclude={q.v.map((id) => 'product:' + id)} placeholder="@ 제품 더 찾기" onAdd={(ref) => setQ('products', [...q.v, ref.split(':')[1]])} />
                    {l.pc ? <span className="faint" style={{ fontSize: "var(--text-11-5px)" }}>이 레이아웃은 제품 {l.pc}개 구성이에요 · {q.v.length}개 선택</span> : null}
                  </div>
                ) : (String(q.v).length > 40 || ['challenges', 'values', 'kpis', 'cases', 'timeline'].includes(q.k)) ? (
                  <textarea id={'qa-' + q.k} className="textarea" value={q.v} placeholder={'예) ' + (REQ_LABEL[q.k] || '') + ' — 모르면 비워 두세요. 자리표시로 남겨요.'} onChange={(e) => setQ(q.k, e.target.value)} />
                ) : (
                  <input id={'qa-' + q.k} className="input" value={q.v} placeholder="모르면 비워 두세요" onChange={(e) => setQ(q.k, e.target.value)} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* =========================================================
   Evidence row (web link · file · catalog · requirement)
   ========================================================= */
const EV_ICON = { web: 'link', file: 'file', case: 'case', product: 'product', solution: 'solution', req: 'clip', part: 'list', image: 'image', upload: 'upload' };
const evKindLabel = (e) => ({ web: '웹', file: String(e.ftype || '파일').toUpperCase(), case: '사례', product: '제품', solution: '솔루션', req: '요구사항', part: '파트', image: '이미지', upload: '업로드' }[e.k] || '자료');

function EvRow({ e, onRemove, onAdd, addLabel = '근거로' }) {
  const cat = ['product', 'solution', 'case'].includes(e.k) && e.ref && tagMeta(e.k + ':' + e.ref);
  const body = (
    <>
      {cat ? <span className="ev-th"><Thumb r={e.k + ':' + e.ref} /></span> : null}
      <span className={'evk k-' + e.k + (e.k === 'file' ? ' f-' + String(e.ftype || '').toLowerCase() : '')}><Icon name={EV_ICON[e.k] || 'doc'} size={11} />{evKindLabel(e)}</span>
      <span className="evt">
        <b>{e.title}</b>
        {cat ? <span className={'evs ev-meta' + (e.k === 'product' ? ' num' : '')}>{cat.line}</span> : null}
        {e.sub ? <span className="evs">{e.sub}</span> : null}
        {e.url ? <span className="evh">{hostOf(e.url)}<Icon name="ext" size={10} /></span> : null}
      </span>
    </>
  );
  return (
    <div className="evrow">
      {e.url ? <a className="evmain" href={e.url} target="_blank" rel="noopener noreferrer" title={e.url}>{body}</a> : <div className="evmain">{body}</div>}
      <span className="evact">
        {e.by === 'ai' ? <span className="evby" title="AI가 채울 때 기댄 자료">AI</span> : e.by === 'rule' ? <span className="evby rule" title="자동으로 연결한 자료">자동</span> : null}
        {onAdd && <button className="btn btn-sm" onClick={onAdd}><Icon name="plus" size={13} />{addLabel}</button>}
        {onRemove && <DeleteButton className="btn btn-ghost btn-icon btn-sm" aria-label={e.title + ' 근거에서 빼기'} title="근거에서 빼기" onClick={onRemove}><Icon name="x" size={14} /></DeleteButton>}
      </span>
    </div>
  );
}

function Sec({ title, icon, count, sub, children, className = '' }) {
  return (
    <section className={'evsec ' + className}>
      <h4>{icon && <Icon name={icon} size={14} />}<span>{title}</span>{count != null && <span className="num cnt">{count}</span>}{sub && <span className="sub">{sub}</span>}</h4>
      {children}
    </section>
  );
}

/* =========================================================
   Nothing selected — references for this sheet
   ========================================================= */
/** matched photos of a linked case / solution — up to 8, more on demand; a click puts one into an empty image slot */
function MediaStrip({ type, id, name, onInsertImage }) {
  const [all, setAll] = useState(false);
  const list = mediaPhotos(type, id, name);
  if (!list.length) return null;
  const shown = all ? list : list.slice(0, 8);
  return (
    <div className="km-imgs cs-imgs" role="list" aria-label={name + ' 이미지'}>
      {shown.map((im) => (
        <button key={im.pid} role="listitem" className="km-img" title={im.desc + ' — 누르면 빈 이미지 칸에 넣어요'} onClick={() => onInsertImage(im)}>
          <PImg src={im.src} alt={im.desc} loading="lazy" style={{ objectFit: im.cut ? 'contain' : 'cover' }} />
        </button>
      ))}
      {list.length > 8 && <button type="button" className="cs-more" onClick={() => setAll(!all)}>{all ? '접기' : '+' + (list.length - 8) + '장 더 보기'}</button>}
    </div>
  );
}

function SheetPanel({ p, part, x, l, onInsertImage }) {
  const recs = useMemo(() => sheetRecs(p, part, l), [p.id, part.id, x.f, p.ctx.products.join(), p.ctx.cases.join(), p.ctx.solutions.join(), (p.req.files || []).length]);
  const phNote = (l.phs || []).some((s) => /출처|조사|기관|연도|\[0|\[N/.test(s));
  const sections = {
    products: (
      <Sec key="products" title="제품" icon="monitor" count={recs.products.length || null}>
        {recs.products.length ? <SheetReferenceGrid p={p} kind="product" onInsertImage={onInsertImage}
          items={recs.products.map(({ p: product, imgs }) => ({ r: 'product:' + product.id, name: product.name, category: product.cat, images: imgs }))} />
          : <div className="ev-empty">연결된 제품이 없어요. 고객 요구사항에서 @로 제품을 연결해 주세요.</div>}
      </Sec>
    ),
    web: (
      <Sec key="web" title="웹 소스" icon="link" count={recs.web.length} sub={recs.indName || ''}>
        {phNote && <div className="hint ev-hint"><Icon name="info" size={13} /><span>이 장의 <b>{(l.phs || []).slice(0, 3).join(' · ')}</b> 자리는 아래 소스에서 확인한 값으로 채우세요. AI는 웹을 읽지 않아 수치를 지어내지 않아요.</span></div>}
        <WebSources sources={recs.web} />
      </Sec>
    ),
    files: (
      <Sec key="files" title="고객 자료" icon="clip" count={recs.files.length || null}>
        <CustomerSources p={p} />
      </Sec>
    ),
    cases: (
      <Sec key="cases" title="유관사례" icon="case" count={recs.cases.length || null}>
        {recs.cases.length ? <SheetReferenceGrid p={p} kind="case" onInsertImage={onInsertImage}
          items={recs.cases.map(({ c }) => ({ r: 'case:' + c.id, name: c.cust, images: mediaPhotos('case', c.id, c.cust) }))} />
          : <div className="ev-empty">이 업종의 사례를 찾지 못했어요.</div>}
      </Sec>
    ),
    solutions: (
      <Sec key="solutions" title="연결 솔루션" icon="solution" count={recs.solutions.length || null}>
        {recs.solutions.map((s) => (
          <div key={s.id} className="csrc has-th">
            <Thumb r={'solution:' + s.id} className="cs-th" />
            <div className="cs-b">
              <div className="cs-top"><b>{s.name}</b><span className="tag">{s.cat}</span></div>
              <span className="cs-sub">{s.desc}</span>
              {(s.with || []).length ? <span className="cs-meta num">연동 · {(s.with || []).map((id) => P[id] && P[id].model).filter(Boolean).slice(0, 4).join(' · ')}</span> : null}
            </div>
            <MediaStrip type="solution" id={s.id} name={s.name} onInsertImage={onInsertImage} />
          </div>
        ))}
      </Sec>
    ),
  };
  return (
    <>
      <div className="evp-head">
        <h3>이 장 참고 자료</h3>
        <p>슬라이드의 요소를 누르면 그 요소에 쓴 근거를 볼 수 있어요.</p>
      </div>
      {['products', ...recs.order.filter(k => k !== 'products')].map((k) => sections[k])}
    </>
  );
}

/* =========================================================
   A unit selected — its evidence
   ========================================================= */
function AddLink({ onAdd }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const ok = /^https?:\/\/[^\s.]+\.[^\s]+/.test(url.trim());
  const add = () => { if (!ok) return; onAdd({ k: 'web', title: title.trim() || hostOf(url.trim()), url: url.trim(), by: 'user' }); setUrl(''); setTitle(''); };
  return (
    <div className="addlink">
      <label className="sr" htmlFor="ev-url">근거 링크 주소</label>
      <input id="ev-url" className="input" value={url} placeholder="https:// 근거 웹 페이지 주소" onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
      <div className="al-row">
        <label className="sr" htmlFor="ev-title">링크 이름</label>
        <input id="ev-title" className="input" value={title} placeholder="이름 (선택) — 예) 2025 외식업 경기 보고서" onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-sm" disabled={!ok} onClick={add}><Icon name="plus" size={13} />추가</button>
      </div>
    </div>
  );
}

function ProdRow({ id, onSwap }) {
  const pr = P[id];
  if (!pr) return null;
  return (
    <button type="button" className="prodrow" onClick={() => onSwap(id)} title="눌러서 제품 탐색에서 다른 제품으로 바꾸기" aria-label={pr.name + ' — 다른 제품으로 바꾸기'}>
      <Thumb r={'product:' + id} mini />
      <span className="evt"><span className="pr-top"><span className="evk k-product"><Icon name="product" size={11} />제품</span><b>{pr.name}</b></span><span className="evs num">{pr.model} · {pr.spec}</span></span>
      <span className="pr-swap"><Icon name="swap" size={13} />교체</span>
    </button>
  );
}

/** current text / images of a unit, in the shape the evidence helpers want */
function unitIO(x, unit, slots) {
  const bl = readBlocks(x.f, x.ov);
  const blocks = unit.ft.map((i) => ({ i, s: (bl.find((b) => b.i === i) || {}).s || '', raw: x.ov.t && x.ov.t[i] }));
  const imgs = unit.imgs.map((i) => { const cur = x.ov.img && x.ov.img[i]; const sl = slots.find((z) => z.i === i) || {}; return { ...sl, ...cur, i, src: cur?.src || sl.src, pid: cur?.pid || sl.pid, name: cur?.name || sl.name, products: cur?.products || sl.products, kind: sl.kind }; });
  return { blocks, imgs };
}

function UnitPanel({ p, part, x, l, unit, pool, qs, setQs, onBack, onFill, onAddEv, onRemoveEv, onSwap }) {
  const state = unitState(x, unit);
  const ev = (x.ev && x.ev[unit.key]) || { src: [] };
  const slotsAll = readImageSlots(x.f, x.ov);
  const io = unitIO(x, unit, slotsAll);
  const currentProducts = unit.isImg ? imageProducts(io.imgs[0]) : [];
  const linked = currentProducts.filter(id => p.ctx.products.includes(id));
  const prods = currentProducts.length ? (linked.length ? linked : currentProducts) : unitProducts(io.blocks, io.imgs).filter(id => p.ctx.products.includes(id));
  const src = (ev.src || []).map((e, k) => ({ e, k })).filter(({ e }) => !(e.k === 'product' && prods.includes(e.ref)));
  const blocks = readBlocks(x.f, x.ov);
  const texts = unit.isImg ? [] : unit.ft.map((i) => (blocks.find((b) => b.i === i) || {}).s).filter(Boolean);
  const text = texts.join(' ');
  const have = new Set([...src.map(({ e }) => evKey(e)), ...prods.map((id) => evKey(productEv(id)))]);
  const sugg = unit.isImg ? [] : suggestForUnit(text + ' ' + (unit.kind.hint || ''), pool, unit.kind.name, 5).map((s) => toEvidence(s, 'user')).filter((e) => !have.has(evKey(e)));
  const wantWeb = !unit.isImg && (/수치|출처/.test(unit.kind.name) || isPh(text) || ['market', 'competition', 'insight', 'effect', 'customer'].includes(l.p));
  const ind = p.ind || inferIndustry(reqText(p));
  const web = wantWeb ? webSourcesFor(ind, l.p, 3).map((w) => ({ k: 'web', title: w.name, sub: w.what, url: w.url, by: 'user' })).filter((e) => !have.has(evKey(e))) : [];
  const img = unit.isImg ? x.ov.img && x.ov.img[unit.imgs[0]] : null;
  const slot = unit.isImg ? slotsAll.find((s) => s.i === unit.imgs[0]) : null;
  return (
    <>
      <div className="evp-head row">
        <button className="btn btn-ghost btn-sm evback" onClick={onBack}><Icon name="arrowL" size={14} />이 장 참고 자료</button>
        <span className="faint" style={{ fontSize: "var(--text-11-5px)" }}>Esc · 빈 곳 누르면 선택 해제</span>
      </div>
      <div className="unitcard">
        <div className="uc-top"><span className="ukind"><Icon name={unit.kind.icon} size={13} />{unit.kind.name}</span><span className={'ustate s-' + state}>{unit.isImg ? ({ empty: '예시 이미지', user: '직접 고름', rule: '자동 선택', ai: '자동 선택' }[state] || STATE_LABEL[state]) : STATE_LABEL[state]}</span></div>
        {unit.isImg ? (
          <div className="uc-img">
            <span className="th">{img ? <PImg src={resolveImg(img.src)} alt={img.name || ''} style={{ objectFit: img.fit || 'cover' }} /> : <Icon name="image" size={22} />}</span>
            <span className="evt"><b>{img ? img.name || '넣은 이미지' : '예시 자리표시'}</b><span className="evs">{(slot && slot.hint ? '“' + slot.hint + '” 자리 · ' : '') + (slot && KIND_NAME[slot.kind] ? KIND_NAME[slot.kind] + ' 칸' : '이미지 칸')}</span></span>
          </div>
        ) : (
          <div className="uc-text">{texts.map((t, k) => <span key={k} className={k === 0 ? 'lead' : ''}>{t}</span>)}</div>
        )}
      </div>
      <Sec title={unit.isImg ? '이미지 출처' : '사용된 근거'} icon="shield" count={(src.length + prods.length) || null}>
        {prods.length ? (
          <div className="prodlist">
            <span className="pl-cap">이 요소에 들어간 제품 · 눌러서 다른 제품으로 교체</span>
            {prods.map((id) => <ProdRow key={id} id={id} onSwap={onSwap} />)}
          </div>
        ) : null}
        {src.length ? src.map(({ e, k }) => <EvRow key={evKey(e) + k} e={e} onRemove={() => onRemoveEv(k)} />) : prods.length ? null : (
          <div className="ev-empty">{unit.isImg ? (img ? '출처 기록이 없는 이미지예요.' : '아직 예시 이미지예요. 이미지를 누르면 바로 다른 이미지로 바꿀 수 있어요.')
            : state === 'empty' ? '아직 예시 문구 그대로라 근거가 없어요. 아래 자료를 근거로 연결하거나 AI로 채워 보세요.'
            : state === 'kept' ? 'AI가 확인하고 예시 문구를 그대로 두었어요.'
            : '직접 고친 문구예요. 근거를 연결해 두면 검토할 때 바로 확인할 수 있어요.'}</div>
        )}
      </Sec>
      {!unit.isImg && (
        <>
          {sugg.length ? (
            <Sec title="이 요소에 맞는 자료" icon="search" count={sugg.length}>
              {sugg.map((e) => <EvRow key={evKey(e)} e={e} onAdd={() => onAddEv(e)} />)}
            </Sec>
          ) : null}
          {web.length ? (
            <Sec title="확인할 웹 소스" icon="link" sub="수치 · 출처는 여기서 확인">
              {web.map((e) => <EvRow key={evKey(e)} e={e} onAdd={() => onAddEv(e)} />)}
            </Sec>
          ) : null}
          <Sec title="근거 링크 직접 추가" icon="plus"><AddLink onAdd={onAddEv} /></Sec>
          <InfoCheck p={p} l={l} qs={qs} setQs={setQs} />
        </>
      )}
      {!unit.isImg && <button className="btn btn-primary" onClick={() => onFill(unit.key)}><Icon name="sparkle" size={15} />이 요소만 AI로 채우기</button>}
    </>
  );
}

/* =========================================================
   AI fill — run → review (both scopes)
   ========================================================= */
function useFill({ p, part, x, l, mut, units }) {
  const [st, setSt] = useState({ step: 'idle' });
  const [qs, setQs] = useState(() => buildQuestions(p, part, l));
  const ctl = useRef(null);
  useEffect(() => () => ctl.current && ctl.current.abort(), []);
  const unitOf = useMemo(() => { const m = {}; for (const u of units) for (const i of u.tbs) m[i] = u.key; return m; }, [units]);

  const start = async (key) => {
    const target = key ? units.filter((u) => u.key === key) : units.filter((u) => unitState(x, u) === 'empty');
    const tbSet = new Set(target.flatMap((u) => (u.isImg ? [] : u.ft)));
    const imgSet = new Set(target.flatMap((u) => (key ? u.imgs : u.isImg ? u.imgs : [])));
    const blocks = readBlocks(x.f, x.ov).filter((b) => tbSet.has(b.i) && !FIXED_RE.test(b.s));
    if (!blocks.length && !imgSet.size) { toast('채울 칸이 없어요'); return; }
    const scope = { key, keys: target.map((u) => u.key), label: key ? target[0].kind.name + (target[0].kind.hint ? ' · ' + clip(target[0].kind.hint, 18) : '') : '빈 요소 ' + target.length + '개' };
    setSt({ step: 'run', scope, got: 0, n: blocks.length });
    const pool = buildPool(p, part);
    const prodQ = qs.find((q) => q.k === 'products');
    const productIds = prodQ ? prodQ.v : p.ctx.products;
    let r = { changes: [], ai: true };
    if (blocks.length) {
      ctl.current = new AbortController();
      const answers = { customer: (qs.find((q) => q.k === 'customer') || {}).v || '', project: (qs.find((q) => q.k === 'project') || {}).v || '', productsList: productIds };
      for (const q of qs) {
        if (q.k === 'customer' || q.k === 'project') continue;
        const v = q.k === 'products' ? q.v.map((id) => P[id] && `${P[id].name} ${P[id].model} (${P[id].spec})`).filter(Boolean).join(', ') : q.v;
        if (v) answers[q.label] = v;
      }
      answers['이 파트에서 말할 내용'] = partText(part).replace(/\n+/g, ' / ');
      answers['파트 이름'] = part.name;
      r = await aiFill(l, blocks, p, answers, {
        signal: ctl.current.signal, onText: (e) => setSt((s) => (s.step === 'run' ? { ...s, got: e.text.length } : s)), sources: pool,
        focus: key ? `${target[0].kind.name} 한 묶음 — 칸 ${blocks.map((b) => b.i).join(', ')}` : '아직 채우지 않은 칸만',
      });
      if (r.err === 'cancelled') { setSt({ step: 'idle' }); return; }
      // the model failed — nothing is filled in; the sheet stays as it is and 다시 시도 runs the same scope again
      if (!r.ai) { setSt({ step: 'error', scope, err: aiErrorText(r.err), retryKey: key }); return; }
    }
    const bySid = Object.fromEntries(pool.map((s) => [s.sid, s]));
    const changes = r.changes.map((c) => {
      let srcs = (c.src || []).map((id) => bySid[id]).filter(Boolean);
      if (!srcs.length) srcs = attribute(c.to, pool);
      return { ...c, srcs, unit: unitOf[c.i] };
    });
    const slots = readImageSlots(x.f).filter((sl) => imgSet.has(sl.i));
    const imgs = suggestImages(slots, key ? { ov: { img: {} } } : x, productIds).filter((c) => !(x.ov.img && x.ov.img[c.i] && x.ov.img[c.i].src === c.im.src));
    setSt({ step: 'review', scope, res: { ai: r.ai, err: r.err, changes, imgs, checked: target.filter((u) => !u.isImg).map((u) => u.key) }, picks: Object.fromEntries([...changes.map((c) => ['t' + c.i, true]), ...imgs.map((c) => ['i' + c.i, true])]) });
  };

  const apply = () => {
    const { res, picks } = st;
    const by = res.ai ? 'ai' : 'rule';
    const ch = res.changes.filter((c) => picks['t' + c.i]);
    const im = res.imgs.filter((c) => picks['i' + c.i]);
    const proposed = new Set(res.changes.map((c) => c.unit));
    mut((y) => {
      y.ev = y.ev || {};
      const byUnit = {};
      for (const c of ch) { y.ov.t[c.i] = c.to; (byUnit[c.unit] = byUnit[c.unit] || []).push(...c.srcs); }
      for (const [k, srcs] of Object.entries(byUnit)) {
        const prev = ((y.ev[k] && y.ev[k].src) || []).filter((e) => e.by === 'user');
        const seen = new Set(prev.map(evKey));
        const add = srcs.map((s) => toEvidence(s, by)).filter((e) => { const kk = evKey(e); if (seen.has(kk)) return false; seen.add(kk); return true; });
        y.ev[k] = { by, at: Date.now(), src: [...add, ...prev] };
      }
      // units the AI looked at and chose to keep as is
      if (res.ai) for (const k of res.checked) if (!proposed.has(k) && !(y.ev[k] && y.ev[k].src && y.ev[k].src.length)) y.ev[k] = { by: 'ai', kept: true, at: Date.now(), src: [] };
      for (const c of im) {
        y.ov.img[c.i] = { src: c.im.src, name: c.im.desc, fit: c.im.group === 'cut' ? 'contain' : 'cover' };
        y.ev['i' + c.i] = { by: 'rule', at: Date.now(), src: [{ k: 'image', title: c.im.desc, sub: c.im.groupName + (c.im.model ? ' · ' + c.im.model : '') + ' · 앱 이미지 라이브러리', ref: c.im.pid, by: 'rule' }] };
      }
      if (y.status === 'empty' && (ch.length || im.length)) y.status = 'partial';
    });
    toast(ch.length + im.length ? '텍스트 ' + ch.length + '칸' + (im.length ? ' · 이미지 ' + im.length + '칸' : '') + '을 채우고 근거를 연결했어요' : 'AI가 확인했어요 — 바꿀 칸이 없었어요');
    setSt({ step: 'idle' });
  };
  return { st, setSt, qs, setQs, start, apply, cancel: () => ctl.current && ctl.current.abort(), close: () => setSt({ step: 'idle' }) };
}

function FillFlow({ fill, x }) {
  const { st, setSt } = fill;
  if (st.step === 'error') return <FeedbackPopup title="AI로 채우지 못했어요" message={st.err} actionLabel="다시 시도" onAction={()=>fill.start(st.retryKey)} onDismiss={fill.close}/>;
  if (st.step === 'run') return <FeedbackPopup message={st.n?`${st.n}칸의 글과 근거를 채우는 중…`:'이미지 칸에 맞는 이미지를 고르는 중…'} kind="progress" actionLabel="작업 취소" onAction={fill.cancel}/>;
  const { res, picks } = st;
  const nSel = Object.values(picks).filter(Boolean).length;
  const all = Object.values(picks).length && Object.values(picks).every(Boolean);
  return (
    <div className="fillflow">
      <div className="evp-head"><h3>AI 채우기 결과</h3><p>{st.scope.label} · 반영할 칸을 고르세요</p></div>
      {res.changes.length + res.imgs.length === 0 ? (
        <div className="pk-empty" style={{ padding: "var(--space-20px)" }}>AI가 보기에 바꿀 칸이 없어요. 필요한 정보를 더 넣고 다시 시도해 보세요.</div>
      ) : (
        <div className="diff">
          <div style={{ display: 'flex', alignItems: 'center', gap: "var(--space-8px)" }}>
            <span className="lbl">바뀌는 칸 {res.changes.length}{res.imgs.length ? ' · 이미지 ' + res.imgs.length : ''}</span><span style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => setSt((s) => ({ ...s, picks: Object.fromEntries(Object.keys(s.picks).map((k) => [k, !all])) }))}>{all ? '모두 해제' : '모두 선택'}</button>
          </div>
          {res.changes.map((c) => (
            <label key={'t' + c.i} className="drow">
              <input type="checkbox" checked={!!picks['t' + c.i]} onChange={(e) => setSt((s) => ({ ...s, picks: { ...s.picks, ['t' + c.i]: e.target.checked } }))} />
              <span style={{ minWidth: 0 }}>
                <div className="from">{c.from}</div><div className="to">{c.to}</div>
                <div className="dsrc">{c.srcs.length ? c.srcs.map((s) => <span key={s.sid} className={'evk sm k-' + s.k}><Icon name={EV_ICON[s.k] || 'doc'} size={10} />{clip(s.title, 18)}</span>) : <span className="faint">근거 없음 · 일반 문구</span>}</div>
              </span>
            </label>
          ))}
          {res.imgs.map((c) => (
            <label key={'i' + c.i} className="drow">
              <input type="checkbox" checked={!!picks['i' + c.i]} onChange={(e) => setSt((s) => ({ ...s, picks: { ...s.picks, ['i' + c.i]: e.target.checked } }))} />
              <span style={{ display: 'flex', gap: "var(--space-10px)", alignItems: 'center', minWidth: 0 }}>
                <PImg src={c.im.src} alt="" compact style={{ width: 64, height: 40, objectFit: 'cover', borderRadius: "var(--radius-4px)", background: 'var(--surface-3)', flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}><div className="from">이미지 칸{c.hint ? ' · ' + c.hint : ''}</div><div className="to">{c.im.desc}</div></span>
              </span>
            </label>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: "var(--space-8px)" }}>
        <button className="btn" onClick={fill.close}>취소</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" disabled={!nSel && !(res.ai && res.changes.length === 0)} onClick={fill.apply}><Icon name="check" size={15} />{nSel ? nSel + '칸 반영' : '확인'}</button>
      </div>
    </div>
  );
}

/* =========================================================
   Image popover — alternatives right next to the clicked image
   ========================================================= */
function ImgPop({ anchor, slot, current, models, context, contextText, onPick, onFile, onMore, onClear, onClose }) {
  const peek = useImagePeek();
  const ref = useRef(null);
  const fileRef = useRef(null);
  const [pos, setPos] = useState({ left: -9999, top: 0, w: 340 });
  const library = useImageLibrary({ ...context, products: [...new Set([...(context?.products || []), ...imageProducts(current)])] });
  const list = useMemo(() => relatedImages(library.images, { models, current, productIds: context?.products || [], kind: slot?.kind, hint: slot?.hint, contextText }).filter(im => im.src !== current?.src), [library.images, models, current, context, slot, contextText]);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor || !ref.current) return;
      const r = anchor.getBoundingClientRect();
      const w = Math.min(340, innerWidth - 16);
      const h = ref.current.offsetHeight;
      let left; let top;
      if (r.right + 10 + w <= innerWidth - 8) { left = r.right + 10; top = r.top; }
      else if (r.left - 10 - w >= 8) { left = r.left - 10 - w; top = r.top; }
      else { left = Math.min(Math.max(8, r.left), innerWidth - w - 8); top = r.bottom + 8; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 8); }
      top = Math.min(Math.max(8, top), Math.max(8, innerHeight - h - 8));
      setPos({ left, top, w });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor, list.length, library.loading]);
  useEffect(() => {
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && !(anchor && anchor.contains(e.target))) onClose(); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose(); } };
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    window.addEventListener('keydown', key, true);
    setTimeout(() => { const b = ref.current && ref.current.querySelector('.ip-opt'); if (b) b.focus({ preventScroll: true }); }, 30);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); };
  }, [anchor]);
  const cur = current && current.src;
  return createPortal(
    <div ref={ref} className="imgpop" role="dialog" aria-label="대체 이미지 고르기" style={{ left: pos.left, top: pos.top, width: pos.w }}>
      <div className="ip-head">
        <span className="ip-t"><b>다른 이미지로 바꾸기</b><span>{((current?.name || slot?.hint) ? '“' + (current?.name || slot?.hint) + '” · ' : '') + (slot && KIND_NAME[slot.kind] ? KIND_NAME[slot.kind] + ' 칸' : '이미지 칸')}</span></span>
        <button className="btn btn-ghost btn-icon btn-sm" aria-label="닫기" onClick={onClose}><Icon name="x" size={15} /></button>
      </div>
      {library.loading && <p role="status">관련 제품 이미지를 찾는 중이에요.</p>}
      {!library.loading && !list.length && <p className="muted">선택한 이미지와 정확히 연결된 대체 사진이 없어요.</p>}
      {!!list.length && <p className="ip-count" role="status">관련 이미지 {list.length.toLocaleString()}개 · 아래로 스크롤해 더 보기</p>}
      <div className="ip-grid" tabIndex={0} role="region" aria-label="관련 이미지 후보">
        {list.map((im) => (
          <button key={im.pid} className={'ip-opt' + (cur === im.src ? ' on' : '')} aria-pressed={cur === im.src} aria-label={im.desc} {...peek.bind(im)} onClick={() => onPick(im)}>
            <span className="th"><PImg src={im.src} alt={im.desc} loading="lazy" style={{ objectFit: im.group === 'cut' ? 'contain' : 'cover' }} /></span>
            <span className="c">{im.desc}</span>
            {models.includes(String(im.model).toUpperCase()) ? <span className="ip-badge">연결 제품</span> : null}
          </button>
        ))}
      </div>
      <div className="ip-foot">
        <button className="btn btn-sm" onClick={onMore}><Icon name="search" size={13} />이미지 더 보기</button>
        <button className="btn btn-sm" onClick={() => fileRef.current && fileRef.current.click()}><Icon name="upload" size={13} />파일 올리기</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) onFile(f); }} />
        <span style={{ flex: 1 }} />
        {current && <DeleteButton className="btn btn-ghost btn-sm btn-danger" onClick={onClear}><Icon name="trash" size={13} />비우기</DeleteButton>}
      </div>
      {peek.node}
    </div>, document.body);
}

/* =========================================================
   Layout detail
   ========================================================= */
export function LayoutDetail({ p, partId, uid: luid, onClose, open, pageNo }) {
  const part = p.parts.find((s) => s.id === partId);
  const x = part && part.layouts.find((y) => y.uid === luid);
  useEffect(() => { if (!x) onClose(); }, [!!x]);
  if (!x || !L[x.f]) return null;
  return <DetailBody key={luid} p={p} part={part} x={x} l={L[x.f]} onClose={onClose} open={open} pageNo={pageNo} />;
}

function DetailBody({ p, part, x, l, onClose, open, pageNo }) {
  const [sel, setSel] = useState(null); // unit key
  const [hi, setHi] = useState(null); // unit keys to highlight
  const [pop, setPop] = useState(null); // { i, el } image alternatives
  const [pick, setPick] = useState(null); // slot index — full image library
  const [spatialPick,setSpatialPick]=useState(false);
  const [swap, setSwap] = useState(null); // { key, from } — product explorer in replace mode
  const [edit, setEdit] = useState(false);
  const rightRef = useRef(null);
  const mut = (fn) => update(p.id, (d) => { const s = d.parts.find((q) => q.id === part.id); const y = s && s.layouts.find((q) => q.uid === x.uid); if (y) { y.ov = y.ov || { t: {}, img: {} }; y.ov.t = y.ov.t || {}; y.ov.img = y.ov.img || {}; y.ev = y.ev || {}; fn(y, s, d); } });
  const units = useMemo(() => readUnits(x.f), [x.f]);
  const unit = sel ? units.find((u) => u.key === sel) || null : null;
  const fill = useFill({ p, part, x, l, mut, units });
  const pool = useMemo(() => buildPool(p, part), [p.updatedAt, part.id]);
  const orig = useMemo(() => Object.fromEntries(readBlocks(x.f, null).map((b) => [b.i, b.s])), [x.f]);
  const slots = useMemo(() => readImageSlots(x.f, x.ov), [x.f, x.ov]);
  const spatialEligible=useMemo(()=>isSpatialStoryboardLayout(l,layoutHtml(x.f)),[l,x.f]);
  const models = p.ctx.products.map((id) => P[id] && P[id].model.toUpperCase()).filter(Boolean);
  const unitOfTb = useMemo(() => { const m = {}; for (const u of units) for (const i of u.tbs) m[i] = u.key; return m; }, [units]);
  useEffect(() => { if (sel && !units.some((u) => u.key === sel)) setSel(null); }, [units]);
  useLayoutEffect(() => { if (rightRef.current) rightRef.current.scrollTop = 0; }, [sel, fill.st.step]);

  const setText = (i, v) => mut((y) => {
    const plain = typeof v === 'string' ? v : null;
    if (plain != null && plain.replace(/\s+/g, ' ').trim() === orig[i]) delete y.ov.t[i]; else y.ov.t[i] = v;
    const k = unitOfTb[i];
    if (k) { const e = y.ev[k] || { src: [] }; if (e.by === 'ai') e.edited = true; else if (e.by !== 'user') e.by = 'user'; delete e.kept; y.ev[k] = e; }
    if (y.status === 'empty') y.status = 'partial';
  });
  const setImg = (i, v, ev) => mut((y) => {
    if (v) y.ov.img[i] = { ...v, selectedBy: (ev?.by || 'user') === 'user' ? 'user' : v.selectedBy }; else delete y.ov.img[i];
    if (v) y.ev['i' + i] = { by: (ev && ev.by) || 'user', at: Date.now(), src: ev ? [ev] : [] }; else delete y.ev['i' + i];
    if (y.status === 'empty') y.status = 'partial';
  });
  const imgEv = (im, by = 'user') => ({ k: 'image', title: im.desc, sub: im.groupName + (im.model ? ' · ' + im.model : '') + ' · ' + (im.note || '앱 이미지 라이브러리'), ref: im.pid, by });
  const fromPicked = (v) => { const im = v && v.pid && IMAGE_DB.find((z) => z.pid === v.pid); return im ? imgEv(im) : v ? { k: 'upload', title: v.name || '직접 올린 이미지', sub: '직접 올린 이미지 · 이 브라우저에 보관', by: 'user' } : null; };
  const uploadTo = async (i, file) => { const r = await fileToStoredImage(file); if (r) { setImg(i, { ...r, fit: 'cover' }, { k: 'upload', title: r.name || file.name, sub: '직접 올린 이미지 · 이 브라우저에 보관', by: 'user' }); toast('이미지를 넣었어요'); return true; } toast('이미지 파일만 넣을 수 있어요', 'warn'); return false; };
  const removal = useLayoutRemoval(p.id, { onRemoved:onClose });
  const addEv = (k, e) => {
    const cur0 = x.ev && x.ev[k];
    if (cur0 && (cur0.src || []).some((z) => evKey(z) === evKey(e))) { toast('이미 연결된 근거예요'); return; }
    mut((y) => { const cur = y.ev[k] || { src: [] }; cur.src = cur.src || []; cur.src.push({ ...e, by: 'user' }); if (!cur.by) cur.by = 'user'; y.ev[k] = cur; });
    toast('근거로 연결했어요');
  };
  const removeEv = (k, idx) => mut((y) => { const cur = y.ev[k]; if (cur && cur.src) cur.src.splice(idx, 1); });
  const doSwap = (key, from, to) => {
    const u = units.find((z) => z.key === key);
    if (!u || from === to || !P[to]) return;
    const plan = planProductSwap(...Object.values(unitIO(x, u, slots)), from, to);
    const nT = Object.keys(plan.t).length; const nI = plan.img.length;
    if (!nT && !nI) { toast('이 요소에서 바꿀 모델명 · 사양 · 이미지를 찾지 못했어요', 'warn'); return; }
    const linkNew = !p.ctx.products.includes(to);
    mut((y, s, d) => {
      for (const [i, v] of Object.entries(plan.t)) y.ov.t[i] = v;
      for (const c of plan.img) { y.ov.img[c.i] = { src: c.im.src, name: c.im.desc, fit: c.im.group === 'cut' ? 'contain' : 'cover' }; y.ev['i' + c.i] = { by: 'user', at: Date.now(), src: [imgEv(c.im)] }; }
      if (!u.isImg) {
        const e = y.ev[key] || { src: [] };
        e.src = (e.src || []).filter((z) => !(z.k === 'product' && z.ref === from));
        if (!e.src.some((z) => z.k === 'product' && z.ref === to)) e.src.unshift(productEv(to));
        if (e.by === 'ai') e.edited = true; else e.by = 'user';
        delete e.kept; e.at = Date.now(); y.ev[key] = e;
      }
      if (y.status === 'empty') y.status = 'partial';
      if (linkNew && !d.ctx.products.includes(to)) d.ctx.products.push(to);
    });
    toast(P[from].model + ' → ' + P[to].model + ' · 글자 ' + nT + '칸' + (nI ? ' · 이미지 ' + nI + '칸' : '') + ' 바꿨어요' + (plan.missingImg ? ' (새 제품 사진이 없어 이미지는 그대로예요)' : '') + (linkNew ? ' · 제품 목록에도 연결했어요' : ''));
  };
  const insertImage = (im) => {
    if (!slots.length) { toast('이 레이아웃에는 이미지 칸이 없어요', 'warn'); return; }
    const target = unit && unit.isImg ? unit.imgs[0] : (slots.find((s) => !(x.ov.img && x.ov.img[s.i])) || {}).i;
    if (target == null) { toast('빈 이미지 칸이 없어요 — 바꿀 이미지를 눌러 고르세요', 'warn'); return; }
    setImg(target, { src: im.src, name: im.desc, pid: im.pid, products: im.products || [], keep: true, fit: im.group === 'cut' ? 'contain' : 'cover' }, imgEv(im));
    setSel('i' + target); toast('이미지를 넣었어요');
  };
  const openSpatialPicker=()=>{
    if(!spatialEligible||fill.st.step!=='idle')return;
    setPop(null);setPick(null);setSpatialPick(true);
  };
  const selectSpatial=meta=>{
    const changed=mut(y=>Object.assign(y,selectSpatialStoryboardLayout(y,L[y.f],meta,layoutHtml(y.f))));
    if(!changed)throw new Error('이 제안서를 수정할 수 없어요.');
    setSpatialPick(false);setSel(null);setHi(null);toast('조감도 레이아웃을 적용했어요');
  };

  // Esc clears the selection before it closes the popup
  useEffect(() => {
    const key = (e) => {
      if (e.key !== 'Escape' || edit || pop || pick != null || spatialPick || swap || !sel || (e.target && (e.target.isContentEditable || e.target.closest('[role="alertdialog"]')))) return;
      e.stopPropagation(); e.preventDefault(); setSel(null);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [sel, pop, pick, spatialPick, swap, edit]);

  const savedLayout = (meta) => {
    mut((y) => {
      // The editor bakes the current values into a new template. Old slot overrides
      // and evidence no longer describe its edited structure.
      y.f = meta.f;
      y.ov = { t: {}, img: {}, ...(y.ov.bg ? { bg: { ...y.ov.bg, embedded: true } } : {}) };
      y.ev = {};
      if (y.status === 'empty') y.status = 'partial';
    });
    setEdit(false); setSel(null); setHi(null);
    toast('My 템플릿에 저장했어요');
    onClose();
  };

  if (edit) return <LayoutEditor f={x.f} ov={x.ov} asCopy context={{ industry: p.ind || inferIndustry(reqText(p)), partName: part.name, requirements: reqText(p), proposal: ctxSummary(p, 'layout'), sheet: partText(part) }} onClose={() => { setEdit(false); onClose(); }} onSaved={savedLayout} />;

  const flat = deckOrder(p).map((z) => ({ partId: z.s.id, uid: z.x.uid })); // page order — 표지 first
  const at = flat.findIndex((z) => z.uid === x.uid);
  const go = (d) => { const z = flat[at + d]; if (z && open) open({ type: 'detail', partId: z.partId, uid: z.uid }); };
  const idxInPart = part.layouts.filter((q) => !isCoverSheet(q.f)).findIndex((q) => q.uid === x.uid); // as the Storyboard column shows it (no 표지)
  const popSlot = pop ? slots.find((s) => s.i === pop.i) : null;
  const curSlot = pick != null ? slots.find((s) => s.i === pick) : null;
  const adapting = contextPending(x);
  const contextIssues = inspectLayoutContext(p, x);
  const contextChanged = !adapting && layoutContextChanged(p, part, x);
  const contextNote = contextChanged && <div className="layout-context-action">
    <button className="btn layout-context-refill" aria-describedby="layout-context-details" onClick={() => retryLayoutContext(p.id, x.uid)}>
      <Icon name="refresh" size={15} />현재 맥락으로 다시 채우기
    </button>
    <div id="layout-context-details" className="layout-context-details" role="tooltip">
      <b>이전 채움 이후 고객 맥락이 바뀌었어요</b>
      <p>현재 요구사항과 선택한 제품·솔루션, 파트 내용을 기준으로 모든 글과 이미지를 다시 검토해요.</p>
      {[...new Set([...(x.adaptation?.missing || []), ...contextIssues, ...(x.adaptation?.error ? [x.adaptation.error] : [])])].map(issue => <p key={issue}>{issue}</p>)}
    </div>
  </div>;
  const hiKeys = fill.st.step !== 'idle' ? (fill.st.step === 'review' ? [...new Set([...fill.st.res.changes.map((c) => c.unit), ...fill.st.res.imgs.map((c) => 'i' + c.i)])] : fill.st.scope.keys) : hi;
  const runFill = (key) => { setPop(null); setHi(null); fill.start(key); };

  return (
    <SheetView onClose={onClose} index={at} total={flat.length} onNav={edit ? undefined : (n) => go(n - at)}
      title={<span style={{ display: 'flex', alignItems: 'baseline', gap: "var(--space-8px)", flexWrap: 'wrap' }}>{l.name}</span>}
      sub={<>{isCoverSheet(x.f) ? '표지' : <>{part.name} · {idxInPart + 1}번째 장</>} · 전체 <span className="num">{pageNo}</span>쪽{l.ind && IND[l.ind] ? ' · ' + IND[l.ind].name : ''}</>}
      bodyClass="detail" stageClass="detail-left" panelClass="detail-right evpanel" panelRef={rightRef}
      onStageMouseDown={(e) => { if (!e.target.closest('.slide') && !e.target.closest('.edit-hint')) setSel(null); }}
      stageActions={<>
        <button className="btn btn-primary sv-edit" disabled={adapting || fill.st.step !== 'idle'} onClick={() => { setPop(null); setSel(null); setEdit(true); }} title="레이아웃 수정하기"><Icon name="edit" size={17} />수정하기</button>
        <FavButton f={x.f} ov={x.ov} from={'제안서 · ' + (p.title || '')} label />
      </>}
      stageTop={<div className="edit-hint">
        <span><i className="sw" style={{ boxShadow: 'inset 0 0 0 2px rgba(20,40,160,.7)' }} />요소 — 누르면 선택 · 글자는 바로 고치기 (Enter 저장 · Esc 취소)</span>
        <span><i className="sw" style={{ boxShadow: 'inset 0 0 0 2px #e8890c' }} />이미지 — 누르면 대체 이미지 · 파일 끌어다 놓기</span>
        {spatialEligible&&<button type="button" className="btn btn-sm detail-spatial-pick" disabled={adapting||fill.st.step!=='idle'} onClick={openSpatialPicker}>조감도 레이아웃 선택</button>}
      </div>}
      stage={(w) => <ContextSlide p={p} x={x} pageNo={pageNo} width={w} editable onText={setText}
        selUnit={sel} hiUnits={hiKeys} onSelect={(k) => setSel(k)}
        onSpatial={spatialEligible?openSpatialPicker:undefined}
        onImage={(i, el) => { if (fill.st.step !== 'idle') return; setPop({ i, el }); }} onImageDrop={(i, file) => { uploadTo(i, file); setSel('i' + i); }} />}
      panel={<>{contextNote}{adapting ? <FeedbackPopup message="현재 요구사항과 선택한 제품·솔루션으로 레이아웃을 채우는 중…" kind="progress"/> : fill.st.step !== 'idle' ? <FillFlow fill={fill} x={x} />
        : unit ? <UnitPanel key={unit.key} p={p} part={part} x={x} l={l} unit={unit} pool={pool} qs={fill.qs} setQs={fill.setQs}
          onBack={() => setSel(null)} onFill={runFill} onAddEv={(e) => addEv(unit.key, e)} onRemoveEv={(k) => removeEv(unit.key, k)}
          onSwap={(id) => { setPop(null); setSwap({ key: unit.key, from: id }); }} />
        : <SheetPanel p={p} part={part} x={x} l={l} onInsertImage={insertImage} />}</>}
      actions={<>
        <button className="btn btn-ghost btn-danger" onClick={() => removal.request(x.uid)}><Icon name="x" size={15} />선택 해제</button>
        <button className="btn btn-primary" onClick={onClose}>닫기</button>
      </>}>
      {removal.confirmation}
      {spatialPick&&spatialEligible&&<SpatialLayoutPicker target={l} html={layoutHtml(x.f)} industry={p.ind||l.ind||inferIndustry(reqText(p))} products={p.ctx.products} view={x.ov?.spatial?.view||l.my?.spatialLayout?.view||(/^L_SPATIAL_(2D|3D)$/.exec(x.f)?.[1]||'').toLowerCase()} onPick={selectSpatial} onClose={()=>setSpatialPick(false)}/>}
      {pop && <ImgPop anchor={pop.el} slot={popSlot} current={{ ...popSlot, ...(x.ov.img && x.ov.img[pop.i]) }} models={models} context={p.ctx} contextText={reqText(p)} onClose={() => setPop(null)}
        onPick={(im) => { setImg(pop.i, { src: im.src, name: im.desc, pid: im.pid, products: im.products || [], keep: true, fit: im.group === 'cut' ? 'contain' : 'cover' }, imgEv(im)); toast('이미지를 바꿨어요'); setPop(null); }}
        onFile={async (f) => { const i = pop.i; setPop(null); await uploadTo(i, f); }}
        onMore={() => { setPick(pop.i); setPop(null); }}
        onClear={() => { setImg(pop.i, null); toast('이미지를 비웠어요'); setPop(null); }} />}
      {swap && <ContextExplorer p={p} kind="products" start={folderOf('products', swap.from)} ind={p.ind || inferIndustry(reqText(p))}
        pick={{ current: 'product:' + swap.from, onPick: (ref) => doSwap(swap.key, swap.from, ref.split(':')[1]) }} onClose={() => setSwap(null)} />}
      {pick != null && <ImagePicker slot={curSlot} current={{ ...curSlot, ...(x.ov.img && x.ov.img[pick]) }} models={models} context={p.ctx} contextText={reqText(p)}
        onClose={() => setPick(null)} onPick={(v) => { setImg(pick, v, fromPicked(v)); setPick(null); toast(v ? '이미지를 넣었어요' : '이미지를 비웠어요'); }} />}
    </SheetView>
  );
}
