// Hover / focus detail for 제품 · 솔루션 · 유관사례 — 고객 요구사항 저장 팝업(ctxconfirm.jsx)과
// Storyboard 제품 · 솔루션 매칭 팝업(refcard.jsx)이 같이 쓴다.
// 이미지 갤러리(제품 컷 · 공식 연출 · 솔루션 화면 · 도입사례 사진, 출처 · 해상도 · 용량) + 상세 메타데이터 + 활용 사례.
// 마우스를 카드 위로 옮겨도 닫히지 않아서 썸네일을 바꿔 보거나 사례 원문을 열 수 있다.
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import IMAGES from '../../../data/images.json';
import { Icon } from './common.jsx';
import { P, S, C, IND, PRODUCTS, SOLUTIONS, CASES, refInfo, TYPE_LABEL } from '../services/catalog.js';
import { Thumb } from './Thumbs.jsx';
import { useProductDetail, ecatUrl, PImg } from '../services/products.js';
import { mediaPhotos, mediaCover } from '../services/media.js';
import { loadBg, bgUrl } from '../services/packs.js';
import { inferIndustry, reqText } from '../services/search.js';

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
/** 제품 DB 사진 묶음(samsung.com/business 상품 카드 이미지 · e-카탈로그에서 자른 제품 사진) — 모두 받은 뒤 갤러리에 넣음
 *  galSrc[k] = 출처 표시, galKind[k] = cut | scene | diagram (없으면 samsung.com 제품 컷) */
function usePackPhotos(x) {
  const addrs = x.gal || (x.th ? [x.th] : []);
  const [urls, setUrls] = useState(() => addrs.map((a) => bgUrl(a)));
  useEffect(() => {
    let live = true;
    setUrls(addrs.map((a) => bgUrl(a)));
    Promise.all(addrs.map((a) => loadBg(a))).then((u) => { if (live) setUrls(u); });
    return () => { live = false; };
  }, [x.id]);
  return addrs.map((a, k) => {
    if (!urls[k]) return null;
    const gk = (x.galKind && x.galKind[k]) || '';
    const [group, kind] = gk === 'scene' ? ['life', '설치 장면'] : gk === 'diagram' ? ['ui', '대표 화면'] : ['cut', '제품 컷'];
    const fromCat = !!(x.galSrc && x.galSrc[k] && x.galSrc[k].startsWith('e-카탈로그'));
    return { pid: a, src: urls[k], desc: (x.galAlt && x.galAlt[k]) || x.name + ' · 제품 이미지', group, kind, cut: group === 'cut', white: group === 'cut' && (fromCat || !!x.thK),
      note: (x.galSrc && x.galSrc[k]) || 'samsung.com/business 상품 이미지' };
  }).filter(Boolean);
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

/** own photos, or an illustration slide in front of the related photos */
const withIll = (own, related, desc, note) => (own.length ? [...own, ...related] : related.length ? [{ pid: 'ill', ill: true, kind: '일러스트', desc, note }, ...related] : []);

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
  if (!cur) {
    return (
      <div className="dpk-media">
        <div className="dpk-main ill"><Thumb r={r} /><span className="dpk-badge">일러스트</span></div>
        <p className="dpk-cap wrap">{fallbackNote || '아직 실제 사진이 없어 일러스트로 보여 줘요.'}</p>
      </div>
    );
  }
  return (
    <div className="dpk-media">
      <div className={'dpk-main' + (cur.ill ? ' ill' : cur.cut ? ' cut' + (cur.white ? ' white' : '') : '')}>
        {cur.ill ? <Thumb r={r} /> : <PImg src={cur.src} alt={cur.desc} draggable={false} />}
        <span className="dpk-badge"><b className="num">{i + 1}/{n}</b>{cur.kind}</span>
        {!cur.ill && !(/\.json#\d+$/.test(cur.src) && !cur.orig) && <a className="dpk-zoom" href={cur.orig || cur.src} target="_blank" rel="noopener noreferrer" title="원본 크게 보기" aria-label="원본 크게 보기"><Icon name="ext" size={12} /></a>}
        {n > 1 && <button type="button" className="dpk-nav prev" onClick={() => go(i - 1)} aria-label="이전 이미지"><Icon name="chevL" size={14} stroke={2.6} /></button>}
        {n > 1 && <button type="button" className="dpk-nav next" onClick={() => go(i + 1)} aria-label="다음 이미지"><Icon name="chev" size={14} stroke={2.6} /></button>}
      </div>
      {n > 1 && (
        <div className="dpk-strip" ref={strip} aria-label="관련 이미지">
          {imgs.map((m, k) => (
            <button key={m.pid + k} type="button" className={'dpk-th' + (k === i ? ' on' : '') + (m.ill ? ' ill' : m.cut ? ' cut' : '')}
              onMouseEnter={() => setI(k)} onFocus={() => setI(k)} onClick={() => setI(k)} aria-label={(k + 1) + '번 이미지 · ' + m.desc} aria-pressed={k === i}>
              {m.ill ? <Thumb r={r} mini /> : <PImg src={m.src} alt="" loading="lazy" draggable={false} />}
            </button>
          ))}
        </div>
      )}
      <p className="dpk-cap">
        <b>{cur.desc}</b>
        <span>{cur.ill ? cur.note : [cur.note, cur.w && cur.h ? cur.w + '×' + cur.h + ' ' + cur.fmt : '', kb(cur.bytes), cur.note ? '' : cur.group === 'case' ? '삼성 고객 도입사례' : '삼성전자 공식'].filter(Boolean).join(' · ')}</span>
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
function ProductBody({ x, r, p, ind, linked }) {
  const ctx = (p && p.ctx) || { products: [], solutions: [], cases: [] };
  const packed = usePackPhotos(x);
  const own = [...modelPhotos(x), ...packed];
  const cases = casesFor('product', x, ind);
  const caseImgs = caseCovers(cases.filter((k) => !k.fam).slice(0, 6));
  const sols = SOLUTIONS.filter((s) => s.with.includes(x.id)).sort((a, b) => ctx.solutions.includes(b.id) - ctx.solutions.includes(a.id));
  const { detail: dt, loading } = useProductDetail(x.id);
  const models = dt ? dt.models : (x.models || []).map((m) => [m, '', '']);
  return (
    <>
      <div className="dpk-top">
        <Gallery r={r} imgs={withIll(own, caseImgs, x.model + ' 일러스트', '실제 제품 사진 없음 · 뒤 사진은 이 제품이 나오는 도입사례')} fallbackNote={x.th && !packed.length ? '제품 사진을 받는 중이에요.' : '아직 실제 제품 사진이 없어 일러스트로 보여 줘요.'} />
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
      {loading && x.d != null && <p className="dpk-empty">사양 · 특장점을 받는 중이에요…</p>}
      {dt && dt.note && <p className="dpk-note-line">{dt.note}</p>}
      {dt && <ProductDetail dt={dt} x={x} />}
      <CaseSec cases={cases} ind={ind} what="모델명 · 키워드" />
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
  const [allSpec, setAllSpec] = useState(false);
  const specs = dt.specs || [];
  const shown = allSpec ? specs : specs.slice(0, 10);
  const feats = (dt.feats || []).slice(0, 5);
  const ec = dt.ecat || [];
  return (
    <>
      {specs.length > 0 && (
        <section className="dpk-sec">
          <h5 className="dpk-sh">주요 사양 <b className="num">{specs.length}</b><span className="faint grow">{dt.catalog ? 'e-카탈로그 원문' : 'samsung.com 사양표 · ' + x.model}</span></h5>
          <table className="dpk-spec"><tbody>
            {shown.map(([g, a, v], k) => <tr key={k}><th scope="row">{a}{g && g !== a && !dt.catalog ? <span className="faint"> · {g}</span> : null}</th><td>{v}</td></tr>)}
          </tbody></table>
          {specs.length > 10 && <button type="button" className="dpk-more-btn" onClick={() => setAllSpec(!allSpec)}>{allSpec ? '사양 접기' : '사양 ' + (specs.length - 10) + '행 더 보기'}</button>}
        </section>
      )}
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
        <Gallery r={r} imgs={withIll(own, [...prodImgs, ...caseImgs], x.name + ' 일러스트', '솔루션 화면 없음 · 뒤 사진은 함께 쓰는 제품 · 도입사례')} fallbackNote="아직 솔루션 화면 이미지가 없어 일러스트로 보여 줘요." />
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
        <Gallery r={r} imgs={withIll(own, prodImgs, '업종 장면 일러스트', '현장 사진은 사례 원문에서 · 뒤 사진은 관련 제품')} fallbackNote="현장 사진은 아직 없어요 · 사례 원문에서 볼 수 있어요." />
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

export function DetailCard({ r, p }) {
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
        {type === 'product' && <ProductBody x={P[id]} r={r} p={p} ind={ind} linked={linked} />}
        {type === 'solution' && <SolutionBody x={S[id]} r={r} p={p} ind={ind} />}
        {type === 'case' && <CaseBody c={C[id]} r={r} p={p} ind={ind} />}
      </div>
    </article>
  );
}

// ---------- hover controller + floating card ----------
/**
 * show(r, el, x) — x: true = now (focus), number = delay ms, else default delay.
 * hide(e) — from a mouse/blur event: waits a moment so the pointer can move onto the card; hide() closes now.
 */
export function useDetailPeek(p, { delay = 260 } = {}) {
  const [pk, setPk] = useState(null);
  const tShow = useRef(null), tHide = useRef(null), over = useRef(false), open = useRef(false), box = useRef(null);
  open.current = !!pk;
  const clear = () => { clearTimeout(tShow.current); clearTimeout(tHide.current); };
  const show = useCallback((r, el, x) => {
    clear();
    const go = () => { if (el && el.isConnected) setPk({ r, rect: el.getBoundingClientRect() }); };
    const d = x === true ? 0 : typeof x === 'number' ? x : open.current ? 140 : delay;
    if (d <= 0) go(); else tShow.current = setTimeout(go, d);
  }, [delay]);
  const hide = useCallback((e) => {
    clear();
    if (e && e.type) tHide.current = setTimeout(() => { if (!over.current) setPk(null); }, 180);
    else { over.current = false; setPk(null); }
  }, []);
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
  const node = pk ? createPortal(<DetailFloat r={pk.r} rect={pk.rect} p={p} boxRef={box} onEnter={enter} onLeave={leave} />, document.body) : null;
  return { pk, show, hide, node };
}

function DetailFloat({ r, rect, p, boxRef, onEnter, onLeave }) {
  const [pos, setPos] = useState({ left: -9999, top: -9999, width: 600 });
  useLayoutEffect(() => {
    const vw = window.innerWidth, vh = window.innerHeight, gap = 12;
    const W = Math.min(600, vw - 24);
    const h = Math.min(boxRef.current ? boxRef.current.offsetHeight : 480, vh - 24);
    let left, top, maxHeight;
    if (rect.right + gap + W <= vw - 12) { left = rect.right + gap; top = rect.top - 8; }
    else if (rect.left - gap - W >= 12) { left = rect.left - gap - W; top = rect.top - 8; }
    else {
      // no room beside the anchor (wide rows · narrow screens): above or below it, never over it — the pointer must still reach the anchor
      left = Math.max(12, Math.min(vw - W - 12, rect.left));
      const below = vh - rect.bottom - 8 - 12, above = rect.top - 8 - 12;
      if (below >= Math.min(h, 360) || below >= above) { top = rect.bottom + 8; maxHeight = Math.max(160, below); }
      else { maxHeight = Math.max(160, above); top = rect.top - 8 - Math.min(h, maxHeight); }
      setPos({ left, top, width: W, maxHeight });
      return;
    }
    top = Math.max(12, Math.min(top, vh - h - 12));
    setPos({ left, top, width: W });
  }, [r, rect.left, rect.top]);
  return (
    <div ref={boxRef} className={'dpk' + (pos.width < 560 ? ' narrow' : '') + (pos.maxHeight ? ' lim' : '')} style={pos} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <DetailCard key={r} r={r} p={p} />
    </div>
  );
}
