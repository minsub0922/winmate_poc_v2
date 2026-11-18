// 데이터 소스 — 소스 카드(통째로 누름) → 소스 팝업(자원 썸네일 격자 · 거르기 · 앱 사용 on/off) → 자원 상세 팝업(출처 · 사용 이력) → PDF 보기 팝업(쪽 이동)
// 서버: admin/source_browser.py · 앱 사용 on/off 는 app/api/resource_switches.py 를 앱 · 에이전트가 같이 읽는다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, date, number, kindNames } from './api';
import { Icon, iconFor } from './icons';
import { Badge, Button, Empty, ErrorBox, IconButton, Loading, Modal, Toggle, Details } from './components';
import { useApp } from './context';
import { LayoutFrame } from './layouts';
import { AssetResources } from './resources';
import { ImageSearch } from './image-search';
import { DssKinds } from './dss-kinds';
import './source-browser.css';

const PAGE = 60;
const sourceIcon = id => ({ samsung: 'globe', catalogs: 'book', media: 'link', images: 'image', templates: 'layers', spatial: 'box', uploads: 'upload' }[id] || 'globe');
const hostOf = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const stop = e => e.stopPropagation();
const kindName = k => kindNames[k] || k;
const store = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* 저장 못 해도 화면은 그대로 */ } },
};

/* ---------------------------------------------------------------- 썸네일 · 출처 */
function BuildingThumb({thumb, title}) {
  const frame = useRef(null), [result, setResult] = useState(null);
  useEffect(() => {
    let alive = true;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      observer.disconnect();
      import('./building-thumbnail').then(m => m.renderBuildingThumbnail(thumb, () => alive)).then(src => {
        if (alive) setResult({key: thumb.key, src});
      }).catch(() => { if (alive) setResult({key: thumb.key, src: null}); });
    }, {rootMargin: '180px'});
    observer.observe(frame.current);
    return () => { alive = false; observer.disconnect(); };
  }, [thumb.key]);
  return <span className="sb-building-thumb" ref={frame}>{result?.key === thumb.key
    ? result.src ? <img src={result.src} alt={title + ' 3D 조감도'}/> : '미리보기 없음'
    : <span className="spin" role="status" aria-label="3D 미리보기 준비 중"/>}</span>;
}

export function Thumb({ thumb, title, kind, large = false }) {
  const [failed, setFailed] = useState(false);
  const [rendered, setRendered] = useState(null);
  useEffect(() => {
    if (!failed || !thumb?.template) return;
    let alive = true;
    import('./spatial-thumbnail').then(m => m.renderThumbnail(thumb, () => alive))
      .then(src => { if (alive && src) setRendered({key: thumb.key, src}); }).catch(() => {});
    return () => { alive = false; };
  }, [failed, thumb?.key]);
  useEffect(() => setFailed(false), [thumb?.src, thumb?.f]);
  if (thumb?.type === 'building') return <BuildingThumb thumb={thumb} title={title}/>;
  if (thumb?.template && rendered?.key === thumb.key) return <img src={rendered.src} alt={title + ' 3D 조감도'}/>;
  if (thumb?.type === 'layout') return <LayoutFrame f={thumb.f} title={title} thumb={!large}/>;
  if (thumb?.type === 'image' && !failed) return <img src={large && !thumb.external && !thumb.direct ? thumb.src + '&large=1' : thumb.src} alt={thumb.template ? title + ' 3D 조감도' : ''} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>;
  return <span className="sb-thumb-icon"><Icon name={iconFor(kind)} size={large ? 40 : 26}/>{failed && <small>미리보기 없음</small>}</span>;
}

const originIcon = o => o.type === 'link' ? 'external' : o.type === 'catalog' || o.type === 'pdf' ? 'book' : o.type === 'layout' ? 'layers' : o.type === 'file' ? 'file' : 'info';
const originText = o => o.type === 'catalog' ? `${o.label} · ${o.page}쪽` : o.type === 'pdf' ? `${o.label}${o.page > 1 ? ` · ${o.page}쪽` : ''}` : o.type === 'file' ? o.label.split('/').pop() : o.label;

/** 카드 위 출처 한 줄 — 링크는 바로 새 창, 카탈로그 · PDF 는 PDF 보기 팝업 */
export function OriginChip({ origin: o, openPdf }) {
  if (!o) return <span className="sb-origin none">출처 없음</span>;
  const text = originText(o);
  if (o.type === 'link') return <a className="sb-origin link" href={o.href} target="_blank" rel="noreferrer" onClick={stop} title={o.href}><Icon name="external" size={12}/><span>{o.host || text}</span></a>;
  if (o.type === 'catalog' || o.type === 'pdf') return <button type="button" className="sb-origin pdf" onClick={e => { stop(e); openPdf(o); }} title={`${text} — PDF 로 보기`}><Icon name="book" size={12}/><span>{text}</span></button>;
  return <span className="sb-origin" title={o.label}><Icon name={originIcon(o)} size={12}/><span>{text}</span></span>;
}

/* ---------------------------------------------------------------- 소스 카드 (데이터 소스 · 관리 개요) */
function useSample(id, version) { // version = 자원 수 · 끈 수 — 바뀔 때만 다시 받는다
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    api(`/sources/${encodeURIComponent(id)}/browse?limit=120`).then(d => {
      if (!alive) return;
      // 같은 그림을 쓰는 자원이 많다(사이트 대표 이미지 등) — 그림이 다른 것만 모은다
      const seen = new Set(), picked = [];
      for (const i of [...d.items.filter(i => i.thumb?.type === 'image'), ...d.items.filter(i => i.thumb && i.thumb.type !== 'image')]) {
        const key = i.thumb.key || i.thumb.src || i.thumb.f;
        if (!seen.has(key)) { seen.add(key); picked.push(i); }
      }
      // 앞쪽 몇 개는 같은 계열이 몰려 있다 — 목록 전체에서 고르게 뽑는다
      setItems(picked.length <= 4 ? picked : [0, 1, 2, 3].map(n => picked[Math.floor(n * picked.length / 4)]));
    }).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [id, version]);
  return items;
}

export function SourceCard({ source: s }) {
  const { open } = useApp();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (s.id !== 'spatial') return;
    const changed = () => setRevision(n => n + 1);
    window.addEventListener('admin:spatial-template', changed);
    return () => window.removeEventListener('admin:spatial-template', changed);
  }, [s.id]);
  const sample = useSample(s.id, `${s.asset_count}/${s.off_count || 0}/${revision}`);
  const go = () => open({ type: 'source', id: s.id });
  const host = s.url ? hostOf(s.url) : '';
  return <article className={'sb-source-card' + (!s.enabled ? ' disabled-source' : '')} role="button" tabIndex={0} aria-label={`${s.name} 자원 보기`}
    onClick={go} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); go(); } }}>
    <div className={'sb-mosaic n' + (sample?.length || 0)} aria-hidden="true">
      {sample === null ? <span className="sb-mosaic-wait"/> : sample.length ? sample.map(i => <span key={i.id} className="sb-mosaic-cell"><Thumb thumb={i.thumb} title={i.title} kind={i.kind}/></span>)
        : <span className="sb-mosaic-empty"><Icon name={sourceIcon(s.id)} size={30}/></span>}
    </div>
    <div className="sb-source-body">
      <div className="sb-source-head"><span className={'source-symbol ' + s.id}>{s.id === 'samsung' ? <strong>S</strong> : <Icon name={sourceIcon(s.id)} size={18}/>}</span><h3 title={s.name}>{s.name}</h3>{!s.enabled && <Badge status="archived">사용 중지</Badge>}</div>
      <p className="sb-source-desc" title={s.description}>{s.description}</p>
      <div className="sb-source-stats"><span><b>{number(s.asset_count)}</b>자원</span>{s.off_count > 0 && <span className="off"><b>{number(s.off_count)}</b>앱에서 끔</span>}</div>
      {s.id === 'samsung' && <DssKinds/>}
      {s.review && <button type="button" className="sb-review-button" aria-label={s.name + ' 변경 내역'}
        onClick={e => { e.stopPropagation(); open({type:'source-changes',id:s.id}); }}>
        <strong>{s.review.pending ? '변경 ' + number(s.review.pending) + '건' : !s.checked_at ? '점검 전' : s.review.incomplete ? '확인 필요' : s.review.handled ? '변경 검토 완료' : '최신 확인'}</strong>
        {s.checked_at && <small>{date(s.checked_at,true)} 점검</small>}<span className="sb-review-open">변경 내역</span><Icon name="chevron" size={14}/></button>}
      <footer>{host ? <a className="sb-origin link" href={s.url} target="_blank" rel="noreferrer" onClick={stop} title={s.url}><Icon name="globe" size={12}/><span>{host}</span></a> : <span className="sb-origin">내부 라이브러리</span>}
        <span className="sb-source-date">{date(s.refreshed_at || s.imported_at)}</span></footer>
    </div>
  </article>;
}

/* ---------------------------------------------------------------- 소스 팝업 */
function useBrowse(id, filters, version) {
  const generation = useRef(0);
  const [state, setState] = useState({ key: '', data: null, items: [], error: '', loading: true });
  const key = JSON.stringify([id, filters]);
  const load = useCallback(async (offset, replace) => {
    const seq = ++generation.current;
    setState(s => ({ ...s, loading: true, error: '' }));
    const q = new URLSearchParams({ ...filters, offset: String(offset), limit: String(PAGE) });
    try {
      const data = await api(`/sources/${encodeURIComponent(id)}/browse?${q}`);
      if (seq !== generation.current) return;
      setState(s => ({ key, data, items: replace ? data.items : [...s.items, ...data.items.filter(i => !s.items.some(x => x.id === i.id))], error: '', loading: false }));
    } catch (e) { if (seq === generation.current) setState(s => ({ ...s, key, items: s.key === key ? s.items : [], error: e.message, loading: false })); }
  }, [key]);
  useEffect(() => {
    const timer = filters.q ? setTimeout(() => load(0, true), 250) : null;
    if (!timer) load(0, true);
    return () => { clearTimeout(timer); generation.current++; };
  }, [load, version]);
  const current = state.key === key;
  const more = () => current && !state.loading && state.data && state.items.length < state.data.total && load(state.items.length, false);
  return { ...state, current, items: current ? state.items : [], loading: !current || state.loading, more, reload: () => load(0, true), patch: (ids, value) => setState(s => ({ ...s, items: s.items.map(i => ids.includes(i.id) ? { ...i, ...value } : i) })) };
}

const SIZES = [['s', '작게'], ['m', '보통'], ['l', '크게']];

export function SourceBrowser({ id }) {
  const { close, info, notify, refresh, version } = useApp();
  const source = info.sources.find(s => s.id === id);
  const [query, setQuery] = useState('');
  const q = query.trim();
  const [kind, setKind] = useState(''), [state, setStateFilter] = useState(''), [sort, setSort] = useState('');
  const [size, setSize] = useState(() => store.get('wm.admin.sb.size', 'm'));
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false), [confirmAll, setConfirmAll] = useState(null);
  const [detail, setDetail] = useState(null), [pdf, setPdf] = useState(null);
  const [logic, setLogic] = useState(false);
  const [local, setLocal] = useState(0);
  const lastPick = useRef(null), sentinel = useRef(null);
  const filters = useMemo(() => ({ q, kind, state, sort }), [q, kind, state, sort]);
  const b = useBrowse(id, filters, local);
  useEffect(() => { setSelected(new Set()); setConfirmAll(null); }, [q, kind, state, sort]);
  useEffect(() => { store.set('wm.admin.sb.size', size); }, [size]);
  useEffect(() => {
    const el = sentinel.current; if (!el) return undefined;
    const io = new IntersectionObserver(entries => entries.some(e => e.isIntersecting) && b.more(), { root: el.closest('.modal-body'), rootMargin: '600px' });
    io.observe(el); return () => io.disconnect();
  });
  const d = b.data, items = b.items;
  const switchableIds = items.filter(i => i.switchable).map(i => i.id);

  async function setSwitch(ids, on) {
    setBusy(true);
    try {
      const r = await api('/resource-switches', { method: 'PUT', body: JSON.stringify({ ids, on }) });
      b.patch(ids, { off: !on, off_at: on ? null : new Date().toISOString(), off_by: on ? null : info.user?.username });
      notify(r.changed.length ? `${number(r.changed.length)}개 자원을 앱에서 ${on ? '다시 씁니다' : '뺐습니다'}.` : '바뀐 자원이 없습니다.');
      refresh(); setLocal(n => n + (state ? 1 : 0));
      return true;
    } catch (e) { notify(e.message, 'error'); return false; } finally { setBusy(false); }
  }
  async function setAll(on) {
    setBusy(true);
    try {
      const r = await api(`/sources/${encodeURIComponent(id)}/switches`, { method: 'PUT', body: JSON.stringify({ on, ...filters }) });
      notify(`${number(r.changed.length)}개 자원을 앱에서 ${on ? '다시 씁니다' : '뺐습니다'}.`); setConfirmAll(null); setSelected(new Set()); refresh(); setLocal(n => n + 1);
    } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  }
  function pick(e, item) {
    stop(e);
    const next = new Set(selected);
    if (e.shiftKey && lastPick.current) {
      const a = items.findIndex(i => i.id === lastPick.current), z = items.findIndex(i => i.id === item.id);
      const on = !selected.has(item.id);
      for (const i of items.slice(Math.min(a, z), Math.max(a, z) + 1)) if (i.switchable) on ? next.add(i.id) : next.delete(i.id);
    } else next.has(item.id) ? next.delete(item.id) : next.add(item.id);
    lastPick.current = item.id; setSelected(next);
  }
  const index = detail ? items.findIndex(i => i.id === detail) : -1;
  const kindTabs = d ? [{ kind: '', count: d.counts.all, off: d.counts.off }, ...d.kinds] : [];
  const offTotal = d?.counts.off || 0;
  const matchOn = d ? d.total : 0;
  return <>
    <Modal title={source?.name || d?.source.name || '데이터 소스'} subtitle={source?.description} close={close} wide
      actions={<>{id === 'images' && <Button icon="search" onClick={() => setLogic(true)}>검색 로직</Button>}
        {source?.url && <a className="sb-head-link" href={source.url} target="_blank" rel="noreferrer" title={source.url}><Icon name="globe" size={14}/><span>{hostOf(source.url)}</span><Icon name="external" size={12}/></a>}
        <a className="icon-button" href={'/admin/api/export?' + new URLSearchParams({ source: id, kind })} title="내보내기" aria-label="내보내기"><Icon name="download" size={18}/></a></>}>
      <div className="sb-browser" data-size={size}>
        <div className="sb-toolbar">
          <div className="sb-kinds" role="tablist" aria-label="자원 종류">{kindTabs.map(k => <button key={k.kind || 'all'} role="tab" aria-selected={kind === k.kind} className={kind === k.kind ? 'selected' : ''} onClick={() => setKind(k.kind)}>
            <span>{k.kind ? kindName(k.kind) : '전체'}</span><b>{number(k.count)}</b>{k.off > 0 && <i title="앱에서 끈 자원">{number(k.off)}</i>}</button>)}</div>
          <div className="sb-controls">
            <label className="sb-search"><Icon name="search" size={15}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름 · 모델 · 주소 검색" aria-label="자원 검색"/>{query && <IconButton icon="close" label="검색 지우기" onClick={() => setQuery('')}/>}</label>
            <div className="sb-seg" role="radiogroup" aria-label="앱 사용">{[['', '전체'], ['on', '앱 사용'], ['off', `꺼짐${offTotal ? ' ' + number(offTotal) : ''}`]].map(([v, l]) => <button key={v || 'all'} role="radio" aria-checked={state === v} className={state === v ? 'selected' : ''} onClick={() => setStateFilter(v)}>{l}</button>)}</div>
            <select value={sort} onChange={e => setSort(e.target.value)} aria-label="정렬"><option value="">기본 순서</option><option value="title">이름순</option><option value="recent">최근 변경순</option></select>
            <div className="sb-seg sb-size" role="radiogroup" aria-label="썸네일 크기">{SIZES.map(([v, l]) => <button key={v} role="radio" aria-checked={size === v} className={size === v ? 'selected' : ''} onClick={() => setSize(v)} title={'썸네일 ' + l}><Icon name="grid" size={v === 's' ? 11 : v === 'm' ? 13 : 15}/></button>)}</div>
          </div>
        <div className={'sb-actionbar' + (selected.size ? ' active' : '')}>
          {selected.size ? <><strong>{number(selected.size)}개 선택</strong>
            <Button busy={busy} icon="archive" onClick={async () => { if (await setSwitch([...selected], false)) setSelected(new Set()); }}>앱에서 끄기</Button>
            <Button busy={busy} icon="check" onClick={async () => { if (await setSwitch([...selected], true)) setSelected(new Set()); }}>다시 켜기</Button>
            <button className="text-button" onClick={() => setSelected(new Set(switchableIds))}>보이는 {number(switchableIds.length)}개 모두</button>
            <button className="text-button" onClick={() => setSelected(new Set())}>선택 해제</button></>
            : <><span className="sb-total">{b.current && d ? <><b>{number(d.total)}</b>개{(q || kind || state) && d.counts.all !== d.total ? <> / {number(d.counts.all)}</> : null}</> : '…'}</span>
              {b.current && d && d.counts.switchable > 0 && (confirmAll ? <span className="sb-confirm">조건에 맞는 {number(matchOn)}개를 {confirmAll === 'off' ? '앱에서 끌까요' : '다시 켤까요'}?
                <Button busy={busy} variant="primary" onClick={() => setAll(confirmAll === 'on')}>{confirmAll === 'off' ? '모두 끄기' : '모두 켜기'}</Button><button className="text-button" onClick={() => setConfirmAll(null)}>취소</button></span>
                : <span className="sb-bulk"><button className="text-button" disabled={!matchOn} onClick={() => setConfirmAll('off')}>조건 전체 끄기</button><button className="text-button" disabled={!offTotal} onClick={() => setConfirmAll('on')}>조건 전체 켜기</button></span>)}</>}
        </div>
        </div>
        {b.current && b.error && !items.length ? <ErrorBox error={b.error} retry={b.reload}/> : !d || (!items.length && b.loading) ? <Loading/> : !items.length ? <Empty icon="search" title="조건에 맞는 자원이 없습니다"/> :
          <div className="sb-grid">{items.map(i => <article key={i.id} className={'sb-card' + (i.off ? ' off' : '') + (selected.has(i.id) ? ' selected' : '')} role="button" tabIndex={0}
            onClick={() => setDetail(i.id)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setDetail(i.id); } }} aria-label={i.title}>
            <div className="sb-thumb"><Thumb thumb={i.thumb} title={i.title} kind={i.kind}/>
              {i.switchable && <label className="sb-check" onClick={e => pick(e, i)} title="선택"><input type="checkbox" checked={selected.has(i.id)} readOnly tabIndex={-1} aria-label={i.title + ' 선택'}/></label>}
              {i.switchable ? <span className="sb-switch" onClick={stop} title={i.off ? '앱에서 다시 쓰기' : '앱에서 빼기'}><Toggle checked={!i.off} disabled={busy} label={`${i.title} 앱 사용`} onChange={on => setSwitch([i.id], on)}/></span> : null}
              {i.off && <span className="sb-off-tag">꺼짐</span>}
            </div>
            <div className="sb-meta"><strong title={i.title}>{i.title}</strong>
              <span className="sb-sub" title={i.ref}>{kindName(i.kind)}{i.variant && ' · ' + i.variant}{i.model && i.model !== i.title ? ' · ' + i.model : ''}</span>
              <OriginChip origin={i.origin} openPdf={setPdf}/></div>
          </article>)}<span ref={sentinel} className="sb-sentinel" aria-hidden="true"/></div>}
        {b.loading && items.length > 0 && <div className="sb-more"><span className="loader"/></div>}
        {b.error && items.length > 0 && <ErrorBox error={b.error} retry={b.more}/>}
      </div>
    </Modal>
    {logic && createPortal(<ImageSearch close={() => setLogic(false)}/>, document.body)}
    {detail && createPortal(<ItemDetail key={detail} id={detail} query={q} close={() => setDetail(null)} openPdf={setPdf} busy={busy}
      onStudioSave={() => { setLocal(n => n + 1); window.dispatchEvent(new Event('admin:spatial-template')); }}
      setSwitch={async (on) => { await setSwitch([detail], on); }}
      previous={index > 0 ? () => setDetail(items[index - 1].id) : null}
      next={index >= 0 && index < items.length - 1 ? () => setDetail(items[index + 1].id) : (index === items.length - 1 && d && items.length < d.total ? () => b.more() : null)}/>, document.body)}
    {pdf && createPortal(<PdfViewer origin={pdf} close={() => setPdf(null)}/>, document.body)}
  </>;
}

/* ---------------------------------------------------------------- 자원 상세 팝업 */
function ItemDetail({ id, query, close, openPdf, setSwitch, busy, previous, next, onStudioSave }) {
  const [state, setState] = useState({ id: null, data: null, error: '' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    api('/source-items/' + encodeURIComponent(id) + '?' + new URLSearchParams({q: query})).then(data => alive && setState({ id, data, error: '' })).catch(e => alive && setState({ id, data: null, error: e.message }));
    return () => { alive = false; };
  }, [id, tick, query]);
  const ref = useRef();
  const frame = useRef(null), dirty = useRef(false);
  const leave = fn => { if (fn && (!dirty.current || window.confirm('저장하지 않은 조감도 변경 사항을 버릴까요?'))) fn(); };
  useEffect(() => {
    const receive = e => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow || e.data?.type !== 'winmate-template-studio' || e.data.id !== state.data?.studio) return;
      if (e.data.event === 'dirty') dirty.current = !!e.data.value;
      if (e.data.event === 'saved') { dirty.current = false; setTick(n => n + 1); onStudioSave(); }
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [state.data?.studio, onStudioSave]);
  useEffect(() => {
    const key = e => {
      const top = [...document.querySelectorAll('.modal[role="dialog"]')].at(-1);
      if (!ref.current || !top?.contains(ref.current) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'ArrowLeft' && previous) { e.preventDefault(); leave(previous); }
      if (e.key === 'ArrowRight' && next) { e.preventDefault(); leave(next); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [previous, next]);
  const a = state.id === id ? state.data : null;
  const origins = a?.origins || [];
  return <Modal title={a?.title || '자원'} subtitle={a ? `${kindName(a.kind)} · ${a.source?.name || ''}` : ''} close={() => leave(close)} wide
    actions={<><IconButton icon="arrow" label="이전 자원" disabled={!previous} onClick={() => leave(previous)} style={{ transform: 'rotate(180deg)' }}/><IconButton icon="arrow" label="다음 자원" disabled={!next} onClick={() => leave(next)}/></>}>
    <div className="sb-detail" ref={ref}>{state.error && state.id === id ? <ErrorBox error={state.error} retry={() => setTick(n => n + 1)}/> : !a ? <Loading/> : <>
      {a.studio && <iframe ref={frame} className="sb-studio" title="조감도 스튜디오" src={'/?' + new URLSearchParams({'admin-spatial-template': a.studio})}/>}
      <div className="sb-detail-top">
        <div className={'sb-detail-media' + (a.thumb?.type === 'layout' ? ' layout' : '')}><Thumb thumb={a.thumb} title={a.title} kind={a.kind} large/>{a.off && <span className="sb-off-tag">앱에서 끔</span>}</div>
        <aside className="sb-detail-side">
          <section className={'sb-use' + (a.off ? ' off' : '') + (!a.switchable ? ' fixed' : '')}>
            <div><h3>앱 사용</h3><p>{a.studio ? '공유 조감도 템플릿' : !a.switchable ? '앱이 직접 고르는 자원이 아님' : a.off ? `꺼짐 · ${date(a.off_meta?.at || a.off_at, true)}${a.off_meta?.by ? ' · ' + a.off_meta.by : ''}` : '새 제안서 · 추천 · 에이전트가 사용'}</p></div>
            {a.switchable && <Toggle checked={!a.off} disabled={busy} label="앱 사용" onChange={async on => { await setSwitch(on); setTick(n => n + 1); }}/>}
          </section>
          <section className="sb-origins"><h3>출처 <span className="count-label">{origins.length}</span></h3>
            {origins.length ? origins.map((o, n) => <OriginRow key={n} origin={o} openPdf={openPdf}/>) : <p className="quiet">기록된 출처가 없습니다.</p>}</section>
          {a.metadata && <section className="sb-image-metadata"><h3>검색 메타데이터</h3>
            {a.metadata.query && <div className="sb-matched"><strong>“{a.metadata.query}”와 일치한 필드</strong>
              {a.metadata.matches.map(m => <p key={m.label}><b>{m.label}</b> · {m.values.join(' · ')}</p>)}</div>}
            <dl className="sb-fields">{a.metadata.fields.map(m => <div key={m.label}><dt>{m.label}</dt><dd>{m.values.join(' · ')}</dd></div>)}</dl>
          </section>}
          <dl className="sb-fields">{a.fields.map(f => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
            <div><dt>ID</dt><dd className="mono">{a.ref}</dd></div>
            <div><dt>자료 기준일</dt><dd>{date(a.imported_at, true)}</dd></div>
            <div><dt>최근 변경</dt><dd>{date(a.updated_at, true)}</dd></div>
            <div><dt>관리 등록</dt><dd>{date(a.first_seen, true)}</dd></div></dl>
        </aside>
      </div>
      <section className="sb-detail-resources"><AssetResources key={a.id} id={a.id}/></section>
      <Details title="전체 데이터 필드" value={{ id: a.id, url: a.url, path: a.path, hash: a.hash }}/>
    </>}</div>
  </Modal>;
}

function OriginRow({ origin: o, openPdf }) {
  const sub = o.type === 'link' ? o.href : o.type === 'catalog' ? `e-카탈로그 ${o.dir} · ${o.page}쪽${o.note ? ' · ' + o.note : ''}` : o.type === 'pdf' ? (o.href || 'PDF 원본') : o.type === 'file' ? o.label : o.type === 'layout' ? o.note : '';
  const body = <><span className={'sb-origin-icon ' + o.type}><Icon name={originIcon(o)} size={15}/></span><span className="sb-origin-text"><strong title={o.label}>{o.type === 'file' ? '저장 파일' : o.label}</strong>{sub && <small title={sub}>{sub}</small>}</span></>;
  if (o.type === 'link') return <a className="sb-origin-row" href={o.href} target="_blank" rel="noreferrer">{body}<Icon name="external" size={14}/></a>;
  if (o.type === 'catalog' || o.type === 'pdf') return <div className="sb-origin-row">
    <button type="button" className="sb-origin-main" onClick={() => openPdf(o)}>{body}<span className="sb-origin-go">PDF 보기<Icon name="arrow" size={13}/></span></button>
    {o.href && <a className="sb-origin-side" href={o.href} target="_blank" rel="noreferrer" title={o.type === 'catalog' ? 'e-카탈로그 뷰어에서 열기' : 'PDF 원본 열기'} aria-label="원본 사이트에서 열기"><Icon name="external" size={14}/></a>}
  </div>;
  return <div className="sb-origin-row static">{body}</div>;
}

/* ---------------------------------------------------------------- PDF 보기 팝업 */
let pdfjsPromise = null;
function loadScript(src) { return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error('PDF 읽기 도구를 불러오지 못했습니다.')); document.head.appendChild(s); }); }
function loadPdfjs() {
  pdfjsPromise ||= (async () => {
    if (!window.pdfjsLib) await loadScript('/lib/pdf.min.js');
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/lib/pdf.worker.min.js';
    try { if (!window.__WM_CMAPS) await loadScript('/lib/pdf-cmaps-ko.js'); } catch { /* 한글 CMap 없이도 대부분 그려진다 */ }
    return window.pdfjsLib;
  })();
  pdfjsPromise.catch(() => { pdfjsPromise = null; });
  return pdfjsPromise;
}
class CMapFactory {
  async fetch({ name }) {
    const m = window.__WM_CMAPS && window.__WM_CMAPS[name];
    if (!m) throw new Error('cmap ' + name);
    return { cMapData: Uint8Array.from(atob(m), c => c.charCodeAt(0)), compressionType: 1 };
  }
}
// 카탈로그 쪽 → PDF 쪽. 알려진 위치(사진 추출 기록)가 있으면 그대로. e-카탈로그 PDF 는 두 쪽 펼침으로 묶인 것이 많다 —
// 둘째 쪽이 가로로 넓으면(펼침) 카탈로그 p쪽 = PDF ⌊p/2⌋+1쪽(1쪽 = 표지 한 장).
async function pdfPageFor(origin, doc) {
  const numPages = doc.numPages, page = Math.max(1, origin.page || 1);
  if (origin.pdf && Number.isInteger(origin.pdf.index)) return Math.min(numPages, origin.pdf.index + 1);
  if (origin.type !== 'catalog' || page === 1) return Math.min(numPages, page);
  let spread = origin.pages ? numPages < origin.pages * 0.75 : page > numPages;
  if (!spread && numPages >= 2) {
    try { const v = (await doc.getPage(2)).getViewport({ scale: 1 }); spread = v.width > v.height * 1.15; } catch { /* 모양을 모르면 쪽 번호 그대로 */ }
  }
  return Math.min(numPages, spread ? Math.floor(page / 2) + 1 : page);
}

function PdfViewer({ origin: o, close }) {
  const isCatalog = o.type === 'catalog';
  const [src, setSrc] = useState(() => o.type === 'pdf' ? { url: o.href || '', asset: o.asset || '' } : o.pdf?.url ? { url: o.pdf.url } : null);
  const [mode, setMode] = useState(isCatalog && !o.pdf?.url ? 'wait' : 'pdf');
  const [doc, setDoc] = useState(null), [error, setError] = useState('');
  const [page, setPage] = useState(o.page || 1), [input, setInput] = useState(String(o.page || 1));
  const [zoom, setZoom] = useState(1), [rendering, setRendering] = useState(false);
  const canvas = useRef(), stage = useRef(), task = useRef(null);
  // 카탈로그 → PDF 주소 찾기 (없으면 쪽 이미지로 본다)
  useEffect(() => {
    if (!isCatalog || src) return undefined;
    let alive = true;
    api(`/catalog-pdf?${new URLSearchParams({ dir: o.dir, ns: o.ns || 'b2b' })}`).then(r => { if (!alive) return; if (r.url) { setSrc({ url: r.url }); setMode('pdf'); } else setMode('images'); }).catch(() => alive && setMode('images'));
    return () => { alive = false; };
  }, []);
  // PDF 열기 — 서버가 Range 요청을 그대로 중계해 필요한 쪽만 받는다
  useEffect(() => {
    if (mode !== 'pdf' || !src) return undefined;
    let alive = true, loading = null;
    setError(''); setDoc(null);
    loadPdfjs().then(pdfjs => {
      if (!alive) return;
      const url = '/admin/api/pdf?' + new URLSearchParams(src.asset ? { asset: src.asset } : { url: src.url });
      loading = pdfjs.getDocument({ url, withCredentials: true, disableAutoFetch: true, disableStream: true, rangeChunkSize: 262144, useWorkerFetch: false, CMapReaderFactory: CMapFactory, cMapPacked: true, isEvalSupported: false });
      return loading.promise.then(async d => {
        if (!alive) { d.destroy(); return; }
        const first = await pdfPageFor(o, d);
        if (!alive) return;
        setDoc(d); setPage(first); setInput(String(first));
      });
    }).catch(e => { if (alive) { setError(e?.message?.includes('PDF') ? e.message : 'PDF 를 열지 못했습니다.'); if (isCatalog) setMode('images'); } });
    return () => { alive = false; loading?.destroy?.(); };
  }, [mode, src]);
  useEffect(() => () => doc?.destroy?.(), [doc]);
  // 지금 쪽 그리기 — 칸 너비에 맞춘 뒤 확대 배율
  useEffect(() => {
    if (mode !== 'pdf' || !doc || !canvas.current || !stage.current) return undefined;
    let alive = true;
    setRendering(true);
    doc.getPage(page).then(p => {
      if (!alive) return;
      const base = p.getViewport({ scale: 1 });
      const box = stage.current.getBoundingClientRect();
      const fit = Math.min((box.width - 24) / base.width, (box.height - 24) / base.height);
      const scale = Math.max(0.2, fit * zoom), ratio = Math.min(window.devicePixelRatio || 1, 2);
      const view = p.getViewport({ scale: scale * ratio });
      const c = canvas.current; c.width = view.width; c.height = view.height;
      c.style.width = view.width / ratio + 'px'; c.style.height = view.height / ratio + 'px';
      task.current?.cancel?.();
      task.current = p.render({ canvasContext: c.getContext('2d'), viewport: view });
      return task.current.promise;
    }).catch(e => { if (alive && e?.name !== 'RenderingCancelledException') setError('이 쪽을 그리지 못했습니다.'); }).finally(() => alive && setRendering(false));
    return () => { alive = false; task.current?.cancel?.(); };
  }, [doc, page, zoom, mode]);
  const total = mode === 'pdf' ? doc?.numPages : o.pages || null;
  const go = n => { const v = Math.max(1, total ? Math.min(total, n) : n); setPage(v); setInput(String(v)); };
  useEffect(() => {
    const key = e => {
      const top = [...document.querySelectorAll('.modal[role="dialog"]')].at(-1);
      if (!stage.current || !top?.contains(stage.current) || document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(page - 1); }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(page + 1); }
    };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  });
  const pdfUrl = src?.url || '';
  const title = o.label || 'PDF';
  const catalogImage = n => `https://samsung.aiibook.net/${o.ns || 'b2b'}/catImage/${o.dir}/${String(n).padStart(3, '0')}.jpg`;
  return <Modal title={title} subtitle={isCatalog ? `e-카탈로그 ${o.dir} · ${o.page}쪽${o.note ? ' · ' + o.note : ''}` : (o.href || o.label)} close={close} wide
    actions={<>{o.href && <a className="sb-head-link" href={o.type === 'catalog' ? `https://samsung.aiibook.net/${o.ns || 'b2b'}/ecatalog5.php?Dir=${o.dir}&start=${page}` : o.href} target="_blank" rel="noreferrer"><Icon name="external" size={13}/><span>{isCatalog ? 'e-카탈로그' : '원본'}</span></a>}
      {pdfUrl && <a className="icon-button" href={pdfUrl} target="_blank" rel="noreferrer" title="PDF 원본" aria-label="PDF 원본 열기"><Icon name="download" size={17}/></a>}</>}>
    <div className="sb-pdf">
      <div className="sb-pdf-bar">
        <div className="sb-pdf-nav"><IconButton icon="arrow" label="이전 쪽" disabled={page <= 1} onClick={() => go(page - 1)} style={{ transform: 'rotate(180deg)' }}/>
          <form onSubmit={e => { e.preventDefault(); const n = parseInt(input, 10); if (n > 0) go(n); }}><input aria-label="쪽" value={input} onChange={e => setInput(e.target.value.replace(/\D/g, ''))} inputMode="numeric"/></form>
          <span>/ {total ? number(total) : '…'}</span>
          <IconButton icon="arrow" label="다음 쪽" disabled={!!total && page >= total} onClick={() => go(page + 1)}/></div>
        {isCatalog && <div className="sb-seg" role="radiogroup" aria-label="보기">{[['pdf', 'PDF'], ['images', '쪽 이미지']].map(([v, l]) => <button key={v} role="radio" aria-checked={mode === v || (v === 'pdf' && mode === 'wait')} className={mode === v ? 'selected' : ''} disabled={v === 'pdf' && !src && mode !== 'wait'} onClick={() => { setMode(v); if (v === 'images') go(o.page || page); }}>{l}</button>)}</div>}
        {mode === 'pdf' && <div className="sb-pdf-zoom"><button type="button" aria-label="축소" title="축소" onClick={() => setZoom(z => Math.max(0.4, +(z - 0.2).toFixed(2)))}>−</button><button type="button" className="sb-zoom-value" title="쪽 맞춤" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button type="button" aria-label="확대" title="확대" onClick={() => setZoom(z => Math.min(4, +(z + 0.2).toFixed(2)))}>+</button></div>}
      </div>
      <div className={'sb-pdf-stage' + (zoom > 1 ? ' zoomed' : '')} ref={stage}>
        {mode === 'wait' || (mode === 'pdf' && !doc && !error) ? <Loading/> : null}
        {mode === 'pdf' && error && <ErrorBox error={error}/>}
        {mode === 'pdf' && <canvas ref={canvas} className={rendering ? 'busy' : ''} style={doc ? undefined : { display: 'none' }}/>}
        {mode === 'images' && <img key={page} src={catalogImage(page)} alt={`${o.dir} · ${page}쪽`} referrerPolicy="no-referrer"/>}
      </div>
      {mode === 'images' && <div className="sb-pdf-strip">{Array.from({ length: Math.min(total || page + 8, 400) }, (_, n) => n + 1).map(n => <button key={n} className={n === page ? 'selected' : ''} onClick={() => go(n)} aria-label={n + '쪽'}><img src={catalogImage(n)} alt="" loading="lazy" referrerPolicy="no-referrer"/><span>{n}</span></button>)}</div>}
    </div>
  </Modal>;
}
