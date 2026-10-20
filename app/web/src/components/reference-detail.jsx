// Canonical reference details for every page: shared data, gallery, metadata,
// cases and final product specs. useDetailPeek.show/open owns hover and popup
// sizing, scrolling and focus. Pass page-specific images/actions as children;
// do not create a separate product-detail modal or page-specific height rule.
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import IMAGES from '../../../data/images.json' with { type: 'json' };
import { Icon, Modal } from './common.jsx';
import { P, S, C, IND, PRODUCTS, SOLUTIONS, CASES, refInfo, TYPE_LABEL } from '../services/catalog.js';
import { Thumb } from './Thumbs.jsx';
import { useProductDetail, ecatUrl, PImg } from '../services/products.js';
import { mediaPhotos, mediaCover } from '../services/media.js';
import { inferIndustry, reqText } from '../services/search.js';
import '../styles/peek.css';
import '../styles/prod.css';

// One display policy for every page and every reference-detail entry point.
const HOVER_HEIGHT = { product: 480, solution: 520, case: 520 };

const PIDS = IMAGES.pids;
const SRC_NAME = { cut: '제품 컷', life: '공식 연출', ui: '솔루션 화면', case: '도입사례 사진' };
const indName = (code) => (IND[code] ? IND[code].name : '');
const indShort = (code) => (IND[code] ? IND[code].name.split(' · ')[0] : '');
const ym = (d) => (d ? d.slice(0, 7).replace('-', '.') : '');
const kb = (n) => (n ? (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB') : '');
const ext = (f) => (String(f).split('.').pop() || '').toUpperCase().replace('JPEG', 'JPG');
const caseText = (c) => [c.title, c.sub, ...(c.offer || [])].join(' ');
let KWN = null; // keyword → number of cases that mention it
const kwCount = (k) => {
  if (!KWN) { KWN = new Map(); const tx = CASES.map((c) => caseText(c).toLowerCase()); for (const x of [...PRODUCTS, ...SOLUTIONS]) for (const w of x.kw || []) { const l = w.toLowerCase(); if (!KWN.has(l)) KWN.set(l, tx.filter((t) => t.includes(l)).length); } }
  return KWN.get(String(k).toLowerCase()) || 0;
};
const GENERIC = 30;

// ---------- images ----------
function img(pid, extra = {}) {
  const v = PIDS[pid]; if (!v) return null;
  return { pid, src: v.file, desc: v.desc, group: v.src, kind: SRC_NAME[v.src] || v.src, cut: v.kind === 'cut', w: v.w, h: v.h, bytes: v.bytes, fmt: ext(v.file), model: v.model, ...extra };
}
/** photos that show this exact model (or the family its catalog photo belongs to) */
function modelPhotos(x) {
  const main = x.img && PIDS[x.img];
  const model = main ? main.model : x.model;
  const rank = (k, v) => (k === x.img ? 0 : v.src === 'cut' ? 1 : 2);
  const list = Object.entries(PIDS).filter(([, v]) => (v.src === 'cut' || v.src === 'life') && v.model === model).sort((a, b) => rank(...a) - rank(...b));
  const note = main && main.model !== x.model ? '같은 시리즈 · ' + main.model + ' 사진' : '';
  return list.map(([k]) => img(k, note ? { note } : {})).filter(Boolean);
}
/** Keep packed gallery entries visible while PImg resolves each real image independently. */
function packPhotos(x) {
  const addrs = x.gal || (x.th ? [x.th] : []);
  return addrs.map((src, k) => {
    const gk = x.galKind?.[k] || '';
    const [group, kind] = gk === 'scene' ? ['life', '설치 장면'] : gk === 'diagram' ? ['ui', '대표 화면'] : ['cut', '제품 컷'];
    const fromCat = !!x.galSrc?.[k]?.startsWith('e-카탈로그');
    return { pid: src, src, desc: x.galAlt?.[k] || x.name + ' · 제품 이미지', group, kind, cut: group === 'cut', white: group === 'cut' && (fromCat || !!x.thK), note: x.galSrc?.[k] || 'samsung.com/business 상품 이미지' };
  });
}
function solutionPhotos(x) {
  return [...uiPhotos(x), ...mediaPhotos('solution', x.id, x.name)];
}
function uiPhotos(x) {
  const main = x.img && PIDS[x.img]; if (!main) return [];
  const fam = main.model;
  return Object.entries(PIDS).filter(([k, v]) => v.src === 'ui' && (k === x.img || v.model === fam || v.model.startsWith(fam + ' ')))
    .sort((a, b) => (a[0] === x.img ? -1 : b[0] === x.img ? 1 : 0)).map(([k]) => img(k)).filter(Boolean);
}
function casePhotos(c) {
  if (!c) return [];
  return [...libCasePhotos(c), ...mediaPhotos('case', c.id, c.cust)];
}
function libCasePhotos(c) {
  return Object.entries(PIDS).filter(([, v]) => v.src === 'case' && c.cust.includes(String(v.desc).split(' · ')[0].trim()))
    .map(([k]) => img(k)).filter(Boolean);
}
/** one picture per related case (its representative photo, from the small thumbnail pack) — for product · solution galleries */
function caseCovers(list, n = 3) {
  return list.map(({ c }) => libCasePhotos(c)[0] || mediaCover('case', c.id, c.cust, '관련 도입사례 · ' + c.cust)).filter(Boolean).slice(0, n);
}

/** Missing primary images stay an explicit error, with related real photos still browsable. */
const galleryImages = (own, related, desc) => own.length ? [...own, ...related]
  : [{ pid: 'missing', src: null, desc, kind: '이미지 로드 오류', note: '등록된 이미지를 불러올 수 없어요.' }, ...related];

// ---------- relations ----------
/** cases that mention a product (model / keyword) or a solution (name / keyword) */
function casesFor(type, x, ind) {
  const out = [];
  const nm = type === 'product' ? x.model : x.name.toLowerCase().replace(/^samsung /, '');
  // 제품 DB(사이트 · 카탈로그) 항목: 옵션 모델코드 · 제품명이 사례에 그대로 나올 때만(필터 라벨 · 분류 키워드로는 찾지 않음)
  const dbItem = type === 'product' && !x.cur;
  const codes = dbItem ? [...new Set([x.model, ...(x.models || [])])].filter((m) => m && m.length >= 5) : [];
  const nmLong = dbItem && x.name && x.name.length >= 6 ? x.name : '';
  for (const c of CASES) {
    const t = caseText(c); const tl = t.toLowerCase();
    let how = '', s = 0, fam = false;
    if (dbItem) {
      if ((x.cs || []).includes(c.id)) { how = '사례 관련 제품'; s = 4.5; }
      else if (codes.some((m) => t.includes(m))) { how = '모델 일치'; s = 4; }
      else if (nmLong && t.includes(nmLong)) { how = '제품명 일치'; s = 3; }
      else continue;
    } else if (nm && (type === 'product' ? t.includes(nm) : tl.includes(nm))) { how = type === 'product' ? '모델 일치' : '솔루션 일치'; s = 4; }
    else {
      const ks = (x.kw || []).filter((k) => k.length >= 2 && tl.includes(k.toLowerCase()));
      const sp = ks.filter((k) => kwCount(k) <= GENERIC);
      if (sp.length) { how = '‘' + sp[0] + '’ 언급'; s = 1 + 0.5 * (sp.length - 1); }
      else if (ks.length) { how = '제품군 · ' + ks[0]; s = -5; fam = true; }
    }
    if (!how) continue;
    const same = !!ind && c.ind === ind;
    if (same) s += 1.5;
    if (libCasePhotos(c).length) s += 0.3;
    out.push({ c, how, same, s, fam });
  }
  return out.sort((a, b) => b.s - a.s || String(b.c.date).localeCompare(String(a.c.date)));
}
/** catalog products a case mentions — exact model first, keyword matches only as "관련" */
function productsIn(c) {
  const t = caseText(c);
  const exact = PRODUCTS.filter((x) => x.model && x.model.length >= 4 && t.includes(x.model));
  const kw = PRODUCTS.filter((x) => x.cur && !exact.includes(x) && (x.kw || []).some((k) => k.length >= 2 && kwCount(k) <= GENERIC && t.includes(k)));
  return { exact, kw };
}
function solutionsIn(c) {
  const t = caseText(c).toLowerCase();
  return SOLUTIONS.filter((x) => t.includes(x.name.toLowerCase().replace(/^samsung /, '')) || (x.kw || []).some((k) => k.length >= 2 && kwCount(k) <= GENERIC && t.includes(k.toLowerCase())));
}

// ---------- building blocks ----------
function Gallery({ r, imgs, fallbackNote }) {
  const [i, setI] = useState(0);
  const strip = useRef(null);
  const n = imgs.length;
  const cur = imgs[Math.min(i, n - 1)];
  const go = (k) => { const j = (k + n) % n; setI(j); const el = strip.current && strip.current.children[j]; if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); };
  if (!cur) return <div className="dpk-media"><div className="dpk-main"><PImg alt="이미지" /></div><p className="dpk-cap">{fallbackNote || '이미지를 불러올 수 없어요.'}</p></div>;
  return (
    <div className="dpk-media">
      <div className={'dpk-main' + (cur.cut ? ' cut' + (cur.white ? ' white' : '') : '')}>
        <PImg key={cur.pid} src={cur.src} alt={cur.desc} draggable={false} />
        {cur.src && <span className="dpk-badge"><b className="num">{i + 1}/{n}</b>{cur.kind}</span>}
        {cur.src && !(/\.json#\d+$/.test(cur.src) && !cur.orig) && <a className="dpk-zoom" href={cur.orig || cur.src} target="_blank" rel="noopener noreferrer" title="원본 크게 보기" aria-label="원본 크게 보기"><Icon name="ext" size={12} /></a>}
        {n > 1 && <button type="button" className="dpk-nav prev" onClick={() => go(i - 1)} aria-label="이전 이미지"><Icon name="chevL" size={14} stroke={2.6} /></button>}
        {n > 1 && <button type="button" className="dpk-nav next" onClick={() => go(i + 1)} aria-label="다음 이미지"><Icon name="chev" size={14} stroke={2.6} /></button>}
      </div>
      {n > 1 && (
        <div className="dpk-strip" ref={strip} aria-label="관련 이미지">
          {imgs.map((m, k) => (
            <button key={m.pid + k} type="button" className={'dpk-th' + (k === i ? ' on' : '') + (m.cut ? ' cut' : '')}
              onMouseEnter={() => setI(k)} onFocus={() => setI(k)} onClick={() => setI(k)} aria-label={(k + 1) + '번 이미지 · ' + m.desc} aria-pressed={k === i}>
              <PImg src={m.src} alt="" loading="lazy" draggable={false} compact />
            </button>
          ))}
        </div>
      )}
      <p className="dpk-cap">
        <b>{cur.desc}</b>
        <span>{[cur.note, cur.w && cur.h ? cur.w + '×' + cur.h + ' ' + cur.fmt : '', kb(cur.bytes), cur.note ? '' : cur.group === 'case' ? '삼성 고객 도입사례' : '삼성전자 공식'].filter(Boolean).join(' · ')}</span>
      </p>
    </div>
  );
}

function Chips({ items, hot, cls = '' }) {
  if (!items || !items.length) return null;
  return <span className="dpk-chips">{items.map((t) => <span key={t} className={'dpk-chip ' + cls + (hot && hot(t) ? ' hot' : '')}>{t}</span>)}</span>;
}
function IndChips({ codes, ind }) {
  const list = (codes || []).filter((c) => IND[c]);
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => (b === ind) - (a === ind));
  const shown = sorted.slice(0, 4), rest = sorted.slice(4);
  return (
    <span className="dpk-chips">
      {shown.map((c) => <span key={c} className={'dpk-chip' + (c === ind ? ' hot' : '')} title={c === ind ? '이 제안서 업종' : IND[c].name}>{c === ind && <Icon name="check" size={10} stroke={3} />}{indShort(c)}</span>)}
      {rest.length > 0 && <span className="dpk-chip" title={rest.map(indName).join(', ')}>+{rest.length}</span>}
    </span>
  );
}
function RefMini({ r, linked }) {
  const info = refInfo(r); if (!info) return null;
  return (
    <span className={'dpk-mini' + (linked ? ' on' : '')} title={info.label + (linked ? ' · 이 제안서에 연결됨' : '')}>
      <Thumb r={r} className="sm" />
      <span className="t">{info.short}</span>
      {linked && <Icon name="check" size={11} stroke={3} />}
    </span>
  );
}

function CaseList({ list, total, fam, ind, emptyText }) {
  if (!list.length) return <p className="dpk-empty">{emptyText}</p>;
  return (
    <div className="dpk-cases">
      {list.map(({ c, how, same, fam: f }) => {
        const line = (c.proof || [])[0] || (c.needs || [])[0] || c.sub || '';
        const Tag = c.url ? 'a' : 'div';
        return (
          <Tag key={c.id} className={'dpk-case' + (f ? ' fam' : '')} {...(c.url ? { href: c.url, target: '_blank', rel: 'noopener noreferrer', title: '사례 원문 열기 · samsung.com' } : {})}>
            <Thumb r={'case:' + c.id} />
            <span className="dpk-cbody">
              <span className="dpk-ctop"><b>{c.cust}</b><span className="num faint">{ym(c.date)}</span><span className="dpk-ctags"><span className="dpk-tag">{how}</span>{same ? <span className="dpk-tag hot">같은 업종</span> : c.ind && IND[c.ind] ? <span className="dpk-tag">{indShort(c.ind)}</span> : null}</span></span>
              <span className="dpk-cline">{line}</span>
            </span>
            {c.url && <Icon name="ext" size={13} className="dpk-cgo" />}
          </Tag>
        );
      })}
      {total > list.length && <span className="dpk-more">외 {total - list.length}건{fam ? ' · 제품군 사례 ' + fam + '건 포함' : ''} · {ind && IND[ind] ? '같은 업종을 먼저 보여 줘요' : '최근 사례를 먼저 보여 줘요'}</span>}
    </div>
  );
}

function CaseSec({ cases, ind, what }) {
  const spec = cases.filter((k) => !k.fam), fam = cases.length - spec.length;
  const nSame = spec.filter((k) => k.same).length;
  return (
    <section className="dpk-sec">
      <h5 className="dpk-sh">활용 사례 <b className="num">{spec.length}</b>{nSame > 0 && <span className="faint">같은 업종 {nSame}</span>}{fam > 0 && <span className="faint">제품군 {fam}</span>}<span className="faint grow">{what}로 삼성 고객 도입사례 {CASES.length}건에서 찾았어요</span></h5>
      <CaseList list={cases.slice(0, 3)} total={cases.length} fam={fam} ind={ind} emptyText="이 항목이 나오는 도입사례를 아직 찾지 못했어요." />
    </section>
  );
}

// ---------- the three bodies ----------
function ProductBody({ x, r, p, ind, linked, children }) {
  const ctx = (p && p.ctx) || { products: [], solutions: [], cases: [] };
  const packed = packPhotos(x);
  const own = [...modelPhotos(x), ...packed];
  const cases = casesFor('product', x, ind);
  const caseImgs = caseCovers(cases.filter((k) => !k.fam).slice(0, 6));
  const sols = SOLUTIONS.filter((s) => s.with.includes(x.id)).sort((a, b) => ctx.solutions.includes(b.id) - ctx.solutions.includes(a.id));
  const { detail: dt, loading } = useProductDetail(x.id);
  const models = dt?.models || (x.models || []).map((m) => [m, '', '']);
  return (
    <>
      <div className="dpk-top">
        <Gallery r={r} imgs={galleryImages(own, caseImgs, x.model + ' 제품 이미지')} />
        <div className="dpk-info">
          <div className="dpk-title"><span className="dpk-model num">{x.model}</span><span className="dpk-name">{x.name}</span></div>
          <Chips items={(x.spec || '').split(' · ').filter(Boolean)} cls="key" />
          <dl className="dpk-dl">
            {models.length > 1 && <><dt>모델</dt><dd><ModelList models={models} cur={x.model} /></dd></>}
            {(x.spaces || []).length > 0 && <><dt>공간</dt><dd>{(x.spaces || []).join(' · ')}</dd></>}
            {(x.ind || []).length > 0 && <><dt>업종</dt><dd><IndChips codes={x.ind} ind={ind} /></dd></>}
            {sols.length > 0 && <><dt>연동 솔루션</dt><dd><span className="dpk-minis">{sols.slice(0, 4).map((s) => <RefMini key={s.id} r={'solution:' + s.id} linked={ctx.solutions.includes(s.id)} />)}</span></dd></>}
            <dt>출처</dt><dd className="dpk-srcs">{x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer">samsung.com/business<Icon name="ext" size={11} /></a> : x.src === 'catalog' ? <span>e-카탈로그 전용(사이트 목록에 없음)</span> : <span>Winmate 큐레이션</span>}{x.sc && x.sc !== x.cat ? <span className="faint">{x.fam} › {x.sc}</span> : null}</dd>
          </dl>
        </div>
      </div>
      {dt && dt.note && <p className="dpk-note-line">{dt.note}</p>}
      {dt && <ProductDetail dt={dt} x={x} />}
      <CaseSec cases={cases} ind={ind} what="모델명 · 키워드" />
      {children}
      <ProductSpecs dt={dt} x={x} loading={loading} />
    </>
  );
}
function ModelList({ models, cur }) {
  const [all, setAll] = useState(false);
  const shown = all ? models : models.slice(0, 8);
  return (
    <span className="dpk-models">
      {shown.map(([m, on, ov]) => <span key={m} className={'dpk-mdl' + (m === cur ? ' on' : '')} title={[on, ov].filter(Boolean).join(' ')}><b className="num">{m}</b>{ov && <i>{ov}</i>}</span>)}
      {models.length > 8 && <button type="button" className="dpk-more-btn" onClick={() => setAll(!all)}>{all ? '접기' : '+' + (models.length - 8) + '개 더'}</button>}
    </span>
  );
}
/** 제품 DB 상세 — 사양(사이트 스펙 API · 카탈로그 원문) · PDP 특장점 · e-카탈로그 등장 쪽 */
function ProductDetail({ dt, x }) {
  const feats = (dt.feats || []).slice(0, 5);
  const ec = dt.ecat || [];
  return (
    <>
      {feats.length > 0 && (
        <section className="dpk-sec">
          <h5 className="dpk-sh">특장점 <b className="num">{(dt.feats || []).length}</b><span className="faint grow">{dt.catalog ? 'e-카탈로그 원문' : 'samsung.com 제품 상세 원문'}</span></h5>
          <ul className="dpk-feats">{feats.map((f, k) => <li key={k}><b>{f.h}</b>{f.b && <span>{f.b}</span>}{f.disc && <small>{f.disc}</small>}</li>)}</ul>
        </section>
      )}
      {(ec.length > 0 || (dt.cprod || []).length > 0) && (
        <section className="dpk-sec">
          <h5 className="dpk-sh">e-카탈로그 <b className="num">{dt.ecatN || ec.length}</b><span className="faint grow">이 모델이 나오는 쪽</span></h5>
          <div className="dpk-ecat">
            {ec.map((e, k) => <a key={k} href={ecatUrl(e.dir, e.p)} target="_blank" rel="noopener noreferrer" title={e.s || ''}><b>{e.t}</b><span className="num">p.{e.p}</span>{e.s && <i>{e.s}</i>}<Icon name="ext" size={11} /></a>)}
            {(dt.cprod || []).slice(0, 4).map((c, k) => <a key={'c' + k} href={ecatUrl(c.dir, (c.pages || [])[0])} target="_blank" rel="noopener noreferrer"><b>{c.t}</b><span className="num">p.{(c.pages || []).join(', ')}</span><i title={(c.extra || []).length ? '사이트 목록에 없는 카탈로그 모델: ' + c.extra.join(', ') : ''}>{c.name}{(c.extra || []).length ? ' · 카탈로그 모델 +' + c.extra.length : ''}{(c.specs || []).length ? ' — ' + c.specs.slice(0, 3).map(([a, v]) => a + ' ' + v).join(' · ') : ''}</i><Icon name="ext" size={11} /></a>)}
          </div>
        </section>
      )}
    </>
  );
}

/** Curated size variants share a family PDP; never label another size's table
 * as the selected model. Samsung display aliases QM55C → LH55QMC… identify
 * the representative model; other variants retain their verified summary. */
function selectedSpecRows(x, dt) {
  const normalize = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const model = normalize(x.model);
  let sourceModel = '';
  try { sourceModel = normalize(new URL(dt?.url).pathname.split('/').filter(Boolean).at(-1)); } catch { /* Catalog-only source. */ }
  const alias = /^([A-Z]{2,4})(\d{2,3})([A-Z][A-Z0-9]*)$/.exec(model);
  const selected = model.length >= 5 && sourceModel.startsWith(model)
    || !!alias && sourceModel.startsWith('LH' + alias[2] + alias[1] + alias[3]);
  const family = x.cur && dt?.models?.length > 1;
  const reviewed = dt?.specProductId === x.id && dt?.specSources?.length > 0;
  const rows = (reviewed || !family || selected ? dt?.specs || [] : []).filter(row => Array.isArray(row) && row[1] && row[2] != null && String(row[2]).trim());
  return { rows: rows.length ? rows : x.spec ? [['', '핵심 사양', x.spec]] : [], summary: !rows.length };
}

function ProductSpecs({ dt, x, loading }) {
  const [all, setAll] = useState(false);
  const [option, setOption] = useState('');
  const reviewed = dt?.specProductId === x.id && dt?.specSources?.length > 0;
  const variants = reviewed ? dt.specVariants || [] : [];
  const variant = variants.find(v => v.model === option) || variants[0];
  const selectedDetail = variant ? { ...dt, specs: variant.specs, specModel: variant.model, specSources: variant.sources, specScope: variant.scope } : dt;
  const { rows, summary } = selectedSpecRows(x, selectedDetail);
  const shown = all ? rows : rows.slice(0, 10);
  const model = selectedDetail?.specModel || x.model;
  const sources = [...new Map((selectedDetail?.specSources || []).filter(s => /^https:\/\//.test(s.url || '')).map(s => [s.url, s])).values()];
  useEffect(() => { setAll(false); setOption(''); }, [x.id]);
  return <section className="dpk-sec dpk-spec-section" aria-label="제품 스펙">
    <h5 className="dpk-sh">제품 스펙{rows.length > 0 && !summary && <b className="num">{rows.length}</b>}<span className="faint grow">{summary ? '선택 모델 요약' : selectedDetail?.specScope === 'family' ? '제품군 사양' : selectedDetail?.specScope === 'package' ? '구성품별 사양' : '모델 사양'} · {model}</span></h5>
    {variants.length > 1 && <label className="dpk-spec-choice">사양 모델<select aria-label="사양 모델" value={variant.model} onChange={event => { setOption(event.target.value); setAll(false); }}>{variants.map((v, i) => <option key={v.model + i} value={v.model}>{v.label === v.model ? v.model : v.label + ' · ' + v.model}</option>)}</select></label>}
    {reviewed && dt.specNote && <p className="dpk-note">{dt.specNote}</p>}
    {reviewed && dt.specReviewStatus === 'limited_official_data' && <p className="dpk-note">공식 자료에 공개된 사양이 제한적이에요. 상세 수치는 모델별로 추가 확인이 필요해요.</p>}
    {loading && <p className="dpk-empty" role="status">상세 스펙을 불러오는 중이에요…</p>}
    {rows.length > 0 ? <table className="dpk-spec" aria-label={model + ' 스펙'}><tbody>
      {shown.map(([group, name, value], index) => <tr key={index}><th scope="row">{name}{group && group !== name && !dt?.catalog && <span className="faint"> · {group}</span>}</th><td>{value}</td></tr>)}
    </tbody></table> : !loading && <p className="dpk-empty">등록된 상세 스펙이 없어요.</p>}
    {rows.length > 10 && <button type="button" className="dpk-more-btn" aria-expanded={all} onClick={() => setAll(!all)}>{all ? '스펙 접기' : '스펙 ' + (rows.length - 10) + '행 더 보기'}</button>}
    {reviewed && sources.length > 0 && <div className="dpk-spec-sources"><span className="faint">공식 출처 · {dt.specReviewedAt}</span>{sources.slice(0, 4).map((s, i) => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.kind === 'catalog' || s.dir && !String(s.dir).startsWith('pdp:') && !String(s.dir).startsWith('manufacturer:') ? '카탈로그' : '제품 자료'} {sources.length > 1 ? i + 1 : ''}<Icon name="ext" size={10} /></a>)}</div>}
  </section>;
}

function SolutionBody({ x, r, p, ind }) {
  const ctx = (p && p.ctx) || { products: [], solutions: [], cases: [] };
  const own = solutionPhotos(x);
  const prods = x.with.map((id) => P[id]).filter(Boolean).sort((a, b) => ctx.products.includes(b.id) - ctx.products.includes(a.id));
  const prodImgs = prods.map((q) => q.img && PIDS[q.img] && img(q.img, { note: '함께 쓰는 제품 · ' + q.model })).filter(Boolean);
  const cases = casesFor('solution', x, ind);
  const caseImgs = caseCovers(cases.filter((k) => !k.fam).slice(0, 6));
  const nLinked = prods.filter((q) => ctx.products.includes(q.id)).length;
  return (
    <>
      <div className="dpk-top">
        <Gallery r={r} imgs={galleryImages(own, [...prodImgs, ...caseImgs], x.name + ' 솔루션 이미지')} />
        <div className="dpk-info">
          <div className="dpk-title"><span className="dpk-name big">{x.name}</span><span className="dpk-sub">{x.cat}</span></div>
          {x.desc && <p className="dpk-desc">{x.desc}</p>}
          <dl className="dpk-dl">
            {prods.length > 0 && <><dt>연동 제품</dt><dd><span className="dpk-minis">{prods.slice(0, 5).map((q) => <RefMini key={q.id} r={'product:' + q.id} linked={ctx.products.includes(q.id)} />)}{prods.length > 5 && <span className="dpk-chip" title={prods.slice(5).map((q) => q.model).join(', ')}>+{prods.length - 5}</span>}</span>{nLinked > 0 && <span className="dpk-note">이 제안서에 연결된 제품 {nLinked}개와 연동돼요</span>}</dd></>}
            <dt>업종</dt><dd><IndChips codes={x.ind} ind={ind} /></dd>
            {(x.kw || []).length > 0 && <><dt>키워드</dt><dd>{x.kw.slice(0, 6).join(' · ')}</dd></>}
          </dl>
        </div>
      </div>
      <CaseSec cases={cases} ind={ind} what="솔루션명 · 키워드" />
    </>
  );
}

function CaseBody({ c, r, p, ind }) {
  const ctx = (p && p.ctx) || { products: [], solutions: [], cases: [] };
  const own = casePhotos(c);
  const { exact, kw } = productsIn(c);
  const prodImgs = [...exact, ...kw].filter((q) => q.img && PIDS[q.img]).slice(0, 3)
    .map((q) => img(q.img, { note: (exact.includes(q) ? '도입 제품 · ' : '관련 제품 · ') + q.model }));
  const sols = solutionsIn(c);
  const overlapP = [...exact, ...kw].filter((q) => ctx.products.includes(q.id));
  const overlapS = sols.filter((s) => ctx.solutions.includes(s.id));
  const same = !!ind && c.ind === ind;
  const title = (c.title || '').split(/\s[-–]\s/).slice(1).join(' - ') || c.sub || '';
  return (
    <>
      <div className="dpk-top">
        <Gallery r={r} imgs={galleryImages(own, prodImgs, c.cust + ' 현장 이미지')} />
        <div className="dpk-info">
          <div className="dpk-title"><span className="dpk-name big">{c.cust}</span>{title && <span className="dpk-sub">{title}</span>}</div>
          <dl className="dpk-dl">
            <dt>업종</dt><dd>{indName(c.ind) || c.indRaw || '—'}</dd>
            {c.type && <><dt>고객 유형</dt><dd>{c.type}</dd></>}
            {c.scale && <><dt>규모</dt><dd>{c.scale}</dd></>}
            {(c.space || []).length > 0 && <><dt>공간</dt><dd>{c.space.join(' · ')}</dd></>}
            {(c.offer || []).length > 0 && <><dt>제공</dt><dd><Chips items={c.offer} cls="key" /></dd></>}
          </dl>
        </div>
      </div>
      <section className="dpk-sec dpk-cols">
        <div>
          <h5 className="dpk-sh">고객 니즈 <b className="num">{(c.needs || []).length}</b></h5>
          {(c.needs || []).length ? <ul className="dpk-list">{c.needs.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul> : <p className="dpk-empty">원문에 정리된 니즈가 없어요.</p>}
        </div>
        <div>
          <h5 className="dpk-sh">성과 <b className="num">{(c.proof || []).length}</b></h5>
          {(c.proof || []).length ? <ul className="dpk-list proof">{c.proof.slice(0, 3).map((t) => <li key={t}>{t}</li>)}</ul> : <p className="dpk-empty">원문에 수치로 된 성과가 없어요.</p>}
        </div>
      </section>
      {c.quote && <blockquote className="dpk-quote">“{c.quote}”</blockquote>}
      <div className="dpk-foot">
        <span className="dpk-fit">
          {same && <span className="dpk-tag hot">같은 업종</span>}
          {overlapP.map((q) => <span key={q.id} className="dpk-tag hot"><Icon name="check" size={10} stroke={3} />{q.model}</span>)}
          {overlapS.map((s) => <span key={s.id} className="dpk-tag hot"><Icon name="check" size={10} stroke={3} />{s.name}</span>)}
          {!same && !overlapP.length && !overlapS.length && <span className="faint">이 제안서와 겹치는 업종 · 제품은 아직 없어요</span>}
        </span>
        <span className="num faint">{c.date}</span>
        {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="dpk-link">사례 원문<Icon name="ext" size={12} /></a>}
      </div>
    </>
  );
}

export function DetailCard({ r, p, children, preview }) {
  const [type, id] = String(r).split(':');
  const info = refInfo(r);
  if (!info) return null;
  const ctx = (p && p.ctx) || { products: [], solutions: [], cases: [] };
  const key = type === 'product' ? 'products' : type === 'solution' ? 'solutions' : 'cases';
  const linked = ctx[key].includes(id);
  const ind = p ? p.ind || inferIndustry(reqText(p)) : null;
  const crumb = type === 'product' ? P[id].cat : type === 'solution' ? S[id].cat : [indShort(C[id].ind) || C[id].indRaw, ym(C[id].date)].filter(Boolean).join(' · ');
  return (
    <article className={'dpk-card ' + type} aria-label={info.label + ' 상세'}>
      <header className="dpk-head">
        <span className={'dpk-type ' + type}><Icon name={type} size={12} />{TYPE_LABEL[type]}</span>
        <span className="dpk-crumb">{crumb}</span>
        <span className={'dpk-state' + (linked ? ' on' : '')}>{linked ? <><Icon name="check" size={11} stroke={3} />이 제안서에 연결됨</> : '아직 연결 전'}</span>
      </header>
      <div className="dpk-scroll">
        {preview}
        {type === 'product' && <ProductBody x={P[id]} r={r} p={p} ind={ind} linked={linked}>{children}</ProductBody>}
        {type === 'solution' && <SolutionBody x={S[id]} r={r} p={p} ind={ind} />}
        {type === 'case' && <CaseBody c={C[id]} r={r} p={p} ind={ind} />}
        {type !== 'product' && children}
      </div>
    </article>
  );
}

/** Click details use the same body/spec ordering as hover, with a bounded frame
 * and one internal scroll area. Extra actions/images always precede specs. */
export function ReferenceDetailDialog({ r, p, children, preview, onClose }) {
  const info = refInfo(r);
  if (!info) return null;
  return <Modal title={info.label + ' 상세'} size="wide reference-detail" bodyClass="mbody reference-detail-body" onClose={onClose}
    onKeyDown={event => { if (event.key !== 'Escape') event.stopPropagation(); }}
    footer={<button type="button" className="btn btn-primary" onClick={onClose}>닫기</button>}>
    <DetailCard key={r} r={r} p={p} preview={preview}>{children}</DetailCard>
  </Modal>;
}

// ---------- hover controller + floating card ----------
/**
 * show(r, el, x) — x: true = now (focus), number = delay ms, else default delay.
 * hide(e) — from a mouse/blur event: waits a moment so the pointer can move onto the card; hide() closes now.
 */
export function useDetailPeek(p, { delay = 260, maxHeight, maxWidth = 600 } = {}) {
  const [pk, setPk] = useState(null);
  const [detail, setDetail] = useState(null);
  const detailOpen = useRef(false), trigger = useRef(null), restoredFocus = useRef(null);
  detailOpen.current = !!detail;
  const tShow = useRef(null), tHide = useRef(null), over = useRef(false), open = useRef(false), box = useRef(null);
  open.current = !!pk;
  const clear = () => { clearTimeout(tShow.current); clearTimeout(tHide.current); };
  const show = useCallback((r, el, x, { preview } = {}) => {
    clear();
    // Closing a portal can synthesize both focus and mouseenter on its trigger.
    if (restoredFocus.current?.anchor === el && Date.now() < restoredFocus.current.until) return;
    if (detailOpen.current) return;
    const go = () => { if (el && el.isConnected) setPk({ r, rect: el.getBoundingClientRect(), preview }); };
    const d = x === true ? 0 : typeof x === 'number' ? x : open.current ? 140 : delay;
    if (d <= 0) go(); else tShow.current = setTimeout(go, d);
  }, [delay]);
  const hide = useCallback((e) => {
    clear();
    if (e && e.type) tHide.current = setTimeout(() => { if (!over.current) setPk(null); }, 180);
    else { over.current = false; setPk(null); }
  }, []);
  const openDetail = useCallback((r, { anchor, children, preview } = {}) => {
    if (!refInfo(r)) return;
    hide(); trigger.current = anchor || document.activeElement;
    setDetail({ r, children, preview });
  }, [hide]);
  const closeDetail = useCallback(() => {
    restoredFocus.current = { anchor: trigger.current, until: Date.now() + 400 };
    setDetail(null);
  }, []);
  const detailProps = r => ({
    'data-reference-detail': r,
    onClick: event => { event.stopPropagation(); openDetail(r, { anchor: event.currentTarget }); },
    onKeyDown: event => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault(); event.stopPropagation(); openDetail(r, { anchor: event.currentTarget });
      }
    },
  });
  const enter = useCallback(() => { over.current = true; clear(); }, []);
  const leave = useCallback(() => { over.current = false; clear(); tHide.current = setTimeout(() => setPk(null), 180); }, []);
  useEffect(() => () => clear(), []);
  useEffect(() => {
    if (!pk) return undefined;
    const onScroll = (e) => { if (box.current && e.target instanceof Node && box.current.contains(e.target)) return; setPk(null); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); over.current = false; setPk(null); } };
    const onResize = () => setPk(null);
    window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', onResize); document.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey, true); };
  }, [!!pk]);
  const node = <>
    {pk && createPortal(<DetailFloat r={pk.r} rect={pk.rect} p={p} preview={pk.preview} boxRef={box} onEnter={enter} onLeave={leave} heightLimit={maxHeight} widthLimit={maxWidth} />, document.body)}
    {detail && <ReferenceDetailDialog r={detail.r} p={p} preview={detail.preview} onClose={closeDetail}>{detail.children}</ReferenceDetailDialog>}
  </>;
  return { pk, show, hide, open: openDetail, close: closeDetail, detailProps, node };
}

function DetailFloat({ r, rect, p, preview, boxRef, onEnter, onLeave, heightLimit, widthLimit = 600 }) {
  const heightCap = Math.min(HOVER_HEIGHT[String(r).split(':')[0]] || 520, heightLimit || Infinity);
  const [pos, setPos] = useState({ left: -9999, top: -9999, width: 600, maxHeight: Math.min(heightCap, window.innerHeight - 24) });
  useLayoutEffect(() => {
    const place = () => {
    const vw = window.innerWidth, vh = window.innerHeight, gap = 12;
    const W = Math.min(widthLimit, vw - 24);
    const limit = Math.min(heightCap, vh - 24);
    const h = Math.min(Math.ceil(boxRef.current?.getBoundingClientRect().height || 480), limit);
    let left, top, maxHeight = limit;
    if (rect.right + gap + W <= vw - 12) { left = rect.right + gap; top = rect.top - 8; }
    else if (rect.left - gap - W >= 12) { left = rect.left - gap - W; top = rect.top - 8; }
    else {
      // no room beside the anchor (wide rows · narrow screens): above or below it, never over it — the pointer must still reach the anchor
      left = Math.max(12, Math.min(vw - W - 12, rect.left));
      const below = vh - rect.bottom - 8 - 12, above = rect.top - 8 - 12;
      if (below >= Math.min(h, 360) || below >= above) { top = rect.bottom + 8; maxHeight = Math.min(limit, Math.max(160, below)); }
      else { maxHeight = Math.min(limit, Math.max(160, above)); top = rect.top - 8 - Math.min(h, maxHeight); }
      setPos({ left, top, width: W, maxHeight });
      return;
    }
    top = Math.max(12, Math.min(top, vh - h - 12));
    setPos({ left, top, width: W, maxHeight });
    };
    place();
    const observer = new ResizeObserver(place);
    if (boxRef.current) observer.observe(boxRef.current);
    return () => observer.disconnect();
  }, [r, rect.left, rect.top, heightCap, widthLimit]);
  return (
    <div ref={boxRef} className={'dpk' + (pos.width < 560 ? ' narrow' : '') + (pos.maxHeight ? ' lim' : '')} style={pos} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <DetailCard key={r} r={r} p={p} preview={preview} />
    </div>
  );
}
