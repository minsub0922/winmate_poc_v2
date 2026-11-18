import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, number, date } from './api';
import { Button, IconButton, Modal, Loading, ErrorBox, Empty, Pager, Toggle } from './components';
import { RegionSheet, FIXED_MODES, Glyph, LOCK } from './layout-regions.jsx';
import { FlowPanel, InputsMenu, CellsMenu, SourcesDialog, ToolsDialog } from './layout-flow.jsx';
import { MetaMenu } from './layout-meta.jsx';
import { DesignTools } from './layout-design.jsx';
import { LayoutExperiments } from './layout-experiments.jsx';
import { ImagePicker } from './layout-images.jsx';
import { Icon } from './icons';
import { useApp } from './context';
import { groupCountLayouts } from '../../../app/web/src/domain/templates/layout_count_groups.js';
import { CountGroupBadge, CountGroupOptions, CountGroupPeek } from '../../../app/web/src/components/layout-count-group.jsx';
import './layout-library.css';

const MODES = { ai: 'AI 작성', fixed: '고정', product: '제품 교체', solution: '솔루션 교체', case: '사례 교체', pick: '후보 선택', section: '목차 번호' };
const LOCKS = { ai: 'AI 작성 위주', fixed: '전부 고정', data: '고정 · 데이터 교체', mostly: '대부분 고정' };
const modeColor = mode => mode === 'ai' ? 'ai' : ['fixed', 'section', 'pick'].includes(mode) ? 'fixed' : 'data';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const endpoint = f => '/layout-library/' + encodeURIComponent(f);
function changedLibrary(rev) {
  if (typeof BroadcastChannel !== 'undefined') { const channel = new BroadcastChannel('winmate-layout-library'); channel.postMessage({ rev }); channel.close(); }
  window.dispatchEvent(new CustomEvent('admin:layout-library', { detail: rev }));
}

// All sheet previews remain sandboxed, without scripts. The parent attaches editor
// events only in the detail dialog; thumbnails and hover contain just the sheet.
function Sheet({ html, title, onPick, onText, draft, slots, selected, wholeFixed, mark = false }) {
  const host = useRef(null), frame = useRef(null), latest = useRef(null);
  const [width, setWidth] = useState(0), [loaded, setLoaded] = useState(0);
  latest.current = { onPick, onText, draft, slots, selected, wholeFixed, mark };
  useEffect(() => {
    const resize = new ResizeObserver(es => setWidth(es[0].contentRect.width)); resize.observe(host.current);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body || !onPick) return;
    const style = doc.createElement('style');
    style.textContent = `[data-admin-mode]{cursor:pointer;outline:2px solid transparent;outline-offset:2px}[data-admin-mark="true"][data-admin-mode="ai"]{outline-color:#60a5fa}[data-admin-mark="true"][data-admin-mode="fixed"]{outline-color:#94a3b8}[data-admin-mark="true"][data-admin-mode="data"]{outline-color:#fbbf24}[data-admin-selected="true"]{outline:3px solid #7c3aed!important;outline-offset:3px}[contenteditable="true"]{cursor:text;white-space:pre-wrap}[contenteditable="true"]:focus{outline:3px solid #7c3aed!important}`;
    doc.head.appendChild(style);
    const pick = e => {
      const node = e.target.closest('[data-tb],[data-img]');
      if (!node) return;
      const kind = node.hasAttribute('data-img') ? 'img' : 't', id = node.getAttribute(kind === 't' ? 'data-tb' : 'data-img');
      latest.current.onPick?.({ kind, id });
    };
    const input = e => {
      const node = e.target.closest('[data-tb]');
      if (node && !node.hasAttribute('data-img')) latest.current.onText?.(node.getAttribute('data-tb'), node.innerText);
    };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); frame.current?.focus(); } };
    doc.addEventListener('click', pick); doc.addEventListener('focusin', pick); doc.addEventListener('input', input); doc.addEventListener('keydown', key);
    return () => { style.remove(); doc.removeEventListener('click', pick); doc.removeEventListener('focusin', pick); doc.removeEventListener('input', input); doc.removeEventListener('keydown', key); };
  }, [loaded, !!onPick]);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body || !onPick) return;
    for (const slot of slots || []) {
      const el = doc.querySelector(`[data-${slot.kind === 't' ? 'tb' : 'img'}="${slot.id}"]`); if (!el) continue;
      const mode = wholeFixed ? (slot.mode === 'section' ? 'section' : 'fixed') : draft?.modes?.[slot.kind]?.[slot.id] || slot.mode;
      el.dataset.adminMode = modeColor(mode); el.dataset.adminMark = String(mark);
      el.dataset.adminSelected = String(selected?.kind === slot.kind && selected.id === slot.id);
      el.title = `${MODES[mode]} · ${slot.kind === 't' ? '클릭해서 문구 수정' : '클릭해서 이미지 설정'}`;
      if (slot.kind === 't') {
        el.contentEditable = 'true'; el.spellcheck = false;
        const value = draft?.t?.[slot.id] ?? slot.value;
        const flat = v => String(v).replace(/\s+/g, ' ').trim();
        if (el !== doc.activeElement && flat(el.innerText) !== flat(value)) el.textContent = value;
      }
    }
  }, [draft, loaded, selected, mark, wholeFixed, slots, !!onPick]);
  return <div className="ll-sheet" ref={host}>{html && width > 0 ? <iframe ref={frame} title={title} sandbox="allow-same-origin" referrerPolicy="no-referrer" tabIndex={onPick ? 0 : -1} srcDoc={html} onLoad={() => setLoaded(v => v + 1)} style={{ transform: `scale(${width / 1280})`, pointerEvents: onPick ? 'auto' : 'none' }}/> : <span className="ll-sheet-wait"/>}</div>;
}

const previews = new Map();
function Thumbnail({ item, rev }) {
  const host = useRef(null), [seen, setSeen] = useState(false), [html, setHtml] = useState(''), [error, setError] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(host.current); return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!seen) return;
    let active = true; const key = `${item.f}:${rev}`;
    if (!previews.has(key)) {
      const p = api('/layout-presets/layouts/' + encodeURIComponent(item.f) + '/preview?thumb=1').then(r => r.html);
      p.catch(() => previews.delete(key)); previews.set(key, p);
    }
    setError(false);
    previews.get(key).then(v => active && setHtml(v), () => active && setError(true));
    return () => { active = false; };
  }, [seen, item.f, rev]);
  return <div ref={host}>{error ? <div className="ll-preview-error">미리보기를 불러오지 못했습니다</div> : <Sheet html={html} title={item.name}/>}</div>;
}

function HoverSheet({ item, rect, rev }) {
  const [html, setHtml] = useState('');
  useEffect(() => {
    let alive = true;
    api('/layout-presets/layouts/' + encodeURIComponent(item.f) + '/preview').then(r => alive && setHtml(r.html)).catch(() => {});
    return () => { alive = false; };
  }, [item.f, rev]);
  const width = Math.min(650, innerWidth - 40), height = width * 9 / 16;
  const left = rect.right + 16 + width < innerWidth ? rect.right + 16 : Math.max(20, rect.left - width - 16);
  const top = Math.max(16, Math.min(rect.top - 20, innerHeight - height - 20));
  return createPortal(<div className="ll-hover" role="tooltip" aria-label="시트 확대" style={{ left, top, width }}><Sheet html={html} title={item.name + ' 확대'}/></div>, document.body);
}

function freshDraft(data) {
  const e = data.edits || {};
  return { meta: { ...(e.meta || {}) }, t: { ...(e.t || {}) }, img: { ...(e.img || {}) },
    modes: { t: { ...(e.modes?.t || {}) }, img: { ...(e.modes?.img || {}) } }, fill: e.fill || 'inherit' };
}

// 활용 예시 — 상세 머리(닫기 옆)의 드롭다운 팝업: 샘플 시나리오에서 이 레이아웃을 실제로 쓴 장
function ExamplesMenu({ f, examples, rev }) {
  const button = useRef(null), pop = useRef(null);
  const [open, setOpen] = useState(false), [id, setId] = useState(examples[0]?.id || ''), [html, setHtml] = useState(''), [error, setError] = useState(''), [at, setAt] = useState(null);
  useEffect(() => {
    const ex = examples.find(e => e.id === id);
    setHtml(''); setError(''); if (!ex || !open) return;
    let alive = true;
    api(endpoint(f) + `/examples/${encodeURIComponent(ex.scenario)}/${ex.page}/preview`).then(r => alive && setHtml(r.html), e => alive && setError(e.message));
    return () => { alive = false; };
  }, [id, open, f, rev]);
  useEffect(() => {
    if (!open) return;
    const r = button.current.getBoundingClientRect(), w = Math.min(620, innerWidth - 24);
    setAt({ top: r.bottom + 8, left: Math.max(12, Math.min(r.right - w, innerWidth - w - 12)) });
    const down = e => { if (!pop.current?.contains(e.target) && !button.current?.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', down, true); window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key, true); };
  }, [open]);
  return <>
    <button ref={button} type="button" className="ll-ex-button" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(v => !v)}>활용 예시{examples.length > 0 && ` ${examples.length}`}<Icon name="down" size={14}/></button>
    {open && at && createPortal(<div ref={pop} className="ll-ex-pop" role="dialog" aria-label="활용 예시" style={at}>
      {!examples.length ? <Empty title="이 레이아웃을 사용한 샘플 시나리오가 없습니다"/> : <>
        <label>샘플 시나리오의 실제 사용 장<select aria-label="활용 예시 선택" value={id} onChange={e => setId(e.target.value)}>{examples.map(ex => <option key={ex.id} value={ex.id}>{ex.title} · {ex.page + 1}쪽 · {ex.part}{ex.f !== f ? ' (내용 후보)' : ''}</option>)}</select></label>
        {error ? <ErrorBox error={error}/> : html ? <Sheet html={html} title="실제 활용 예시"/> : <Loading/>}
      </>}
    </div>, document.body)}
  </>;
}

function LayoutDetail({ f, close, onSaved, parts, industries }) {
  const { notify } = useApp();
  const [data, setData] = useState(null), [draft, setDraft] = useState(null), [error, setError] = useState('');
  const [showRegions, setShowRegions] = useState(false), [confirm, setConfirm] = useState(null), [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(''), [flow, setFlow] = useState(null);
  const [experiment, setExperiment] = useState(null), [imagePick, setImagePick] = useState(null), previewSeq = useRef(0);
  const reload = useCallback(() => {
    setError(''); api(endpoint(f)).then(v => { setData(v); setDraft(freshDraft(v)); setPreview(v.preview); setFlow(v.flow); }).catch(e => setError(e.message));
  }, [f]);
  useEffect(reload, [reload]);
  const dirty = data && draft && !same(draft, freshDraft(data));
  const removed = !!data?.layout.removed;
  const readOnly = removed || !!data?.layout.compositionOnly;
  const requestClose = () => dirty ? setConfirm('discard') : close();
  const wholeFixed = draft?.fill === 'fixed' || (draft?.fill === 'inherit' && data?.default_fixed);
  // 고정 = AI가 채우지 않는 영역(고정 · 목차 번호 · 후보 선택). 데이터 교체 칸은 고정이 아니다(DSS 값으로 채움).
  const modeOf = s => wholeFixed ? (s.mode === 'section' ? 'section' : 'fixed') : draft?.modes?.[s.kind]?.[s.id] || s.mode;
  const fixedOf = s => FIXED_MODES.includes(modeOf(s));
  const textOf = s => draft?.t?.[s.id] ?? s.value;
  const setValue = (kind, id, text) => setDraft(prev => {
    const original = data.base_slots.find(s => s.kind === kind && s.id === id)?.value;
    const values = { ...prev[kind] }; if (text === original) delete values[id]; else values[id] = text;
    return { ...prev, [kind]: values };
  });
  function setMeta(key, text) {
    setDraft(prev => { const meta = { ...prev.meta }; if (text === (data.base_layout[key] || '')) delete meta[key]; else meta[key] = text; return { ...prev, meta }; });
  }
  // 영역 하나를 AI 작성 / AI 잠금으로 둔다. 장 전체 잠금(기본 규칙)이던 장은 칸별 설정으로 펼친 뒤 그 칸만 바꾼다.
  function setFixed(slot, fixed) {
    setDraft(prev => {
      const whole = prev.fill === 'fixed' || (prev.fill === 'inherit' && data.default_fixed);
      const modes = structuredClone(prev.modes);
      const now = s => whole ? (s.mode === 'section' ? 'section' : 'fixed') : modes[s.kind][s.id] || s.mode;
      const put = (s, m) => { if (m === s.mode) delete modes[s.kind][s.id]; else modes[s.kind][s.id] = m; };
      if (FIXED_MODES.includes(now(slot)) === fixed) return prev;
      if (whole) for (const s of data.base_slots) put(s, now(s));
      put(slot, fixed ? 'fixed' : (FIXED_MODES.includes(slot.mode) ? 'ai' : slot.mode));
      return { ...prev, modes, fill: 'slots' };
    });
  }
  // 이미지 칸 바꾸기 — draft.img 에 넣고(원래 이미지면 뺌) 시트를 그 draft 로 다시 그린다. 저장은 '수정 반영'.
  function pickImage(slot, src) {
    const img = { ...draft.img }; if (src === slot.value) delete img[slot.id]; else img[slot.id] = src;
    const next = { ...draft, img }, seq = ++previewSeq.current;
    setDraft(next);
    api(endpoint(f) + '/draft-preview', { method: 'POST', body: JSON.stringify({ ...next, confirmed: true }) })
      .then(r => seq === previewSeq.current && setPreview(r.html), e => seq === previewSeq.current && setError(e.message));
  }
  async function save() {
    setBusy(true); setError('');
    try {
      const next = await api(endpoint(f), { method: 'PUT', body: JSON.stringify({ ...draft, rev: data.rev, confirmed: true }) });
      setData(next); setDraft(freshDraft(next)); setPreview(next.preview); setFlow(next.flow); setConfirm(null);
      changedLibrary(next.rev); onSaved(); notify('레이아웃 수정을 반영했습니다.');
    } catch (e) { setError(e.message); setConfirm(null); }
    finally { setBusy(false); }
  }
  const fixedCount = data && draft ? data.base_slots.filter(fixedOf).length : 0;
  const industryCodes = data?.layout.inds ?? data?.layout.ind ?? [];
  const initialIndustry = industries.find(i => Array.isArray(industryCodes) ? industryCodes.includes(i.code) : industryCodes === i.code)?.code;
  return <><Modal title={<span className="ll-title">{data?.layout.name || '레이아웃 상세'}<code>{f}</code></span>} wide close={busy ? () => {} : requestClose}
    actions={data && <><ExamplesMenu f={f} examples={data.examples} rev={data.rev}/>{flow && <CellsMenu f={f} view={flow} onView={setFlow} disabled={readOnly}/>}{flow && <InputsMenu f={f} view={flow} onView={setFlow} disabled={readOnly}/>}{flow && <MetaMenu f={f}/>}</>}
    footer={<><span className="ll-save-state">{dirty ? '아직 반영하지 않은 수정이 있습니다' : data?.edits.updated_at ? `반영 ${date(data.edits.updated_at, true)}` : '앱과 연결된 레이아웃입니다'}</span><Button className="ll-experiment-open" data-telemetry-private="" disabled={!data || !draft || busy} onClick={() => setExperiment(structuredClone({ f, name: draft.meta.name || data.layout.name, draft, flow: flow?.flow, industry: initialIndustry, fixed: { n: fixedCount, total: data.base_slots.length } }))}>실험하기</Button>{error && <Button onClick={() => setConfirm('reload')} disabled={busy}>다시 불러오기</Button>}<Button onClick={requestClose} disabled={busy}>닫기</Button><Button variant="primary" disabled={!dirty || readOnly || busy || !(draft?.meta.name ?? data?.layout.name ?? '').trim()} busy={busy} onClick={() => setConfirm('save')}>수정 반영</Button></>}>
    {!data || !draft ? error ? <ErrorBox error={error} retry={reload}/> : <Loading/> : <div className={'ll-detail' + (flow ? ' with-flow' : '')}>
      {error && <ErrorBox error={error}/>}
      {removed && <div className="info-strip">삭제된 레이아웃입니다. 기존 제안서의 시트는 보존됩니다.</div>}
      <fieldset disabled={readOnly || busy} className="ll-meta-fields">
        <label>레이아웃 이름<input value={draft.meta.name ?? data.base_layout.name ?? ''} maxLength={120} onChange={e => setMeta('name', e.target.value)}/></label>
        <label>목차 구분<select value={draft.meta.p ?? data.base_layout.p ?? ''} onChange={e => setMeta('p', e.target.value)}>{Object.entries(parts).map(([id, p]) => <option key={id} value={id}>{p.label || id}</option>)}</select></label>
      </fieldset>
      <div className="ll-canvas">
        <div className="ll-sheet-tools">{'design' in data && <DesignTools f={f} rev={data.rev} design={data.design} disabled={readOnly || busy} onChange={next => { setData(next); setPreview(next.preview); setFlow(next.flow); }}/>}<span className="ll-region-count"><Glyph d={LOCK} size={11}/>AI 잠금 {fixedCount} / {data.base_slots.length}</span><label className="ll-region-toggle">영역 보기<Toggle checked={showRegions} onChange={setShowRegions} label="영역 보기"/></label></div>
        <RegionSheet html={preview} title="레이아웃 편집 시트" slots={data.base_slots} fixedOf={fixedOf} textOf={textOf} onText={(id, text) => setValue('t', id, text)} onSet={setFixed} showAll={showRegions} disabled={readOnly || busy}
          onImage={(slot, rect, ratio) => setImagePick(slot ? { slot, rect, ratio } : null)}/>
        {imagePick && createPortal(<ImagePicker key={imagePick.slot.id} f={f} slot={imagePick.slot} src={draft.img[imagePick.slot.id] ?? imagePick.slot.value} original={imagePick.slot.value}
          ratio={imagePick.ratio} rect={imagePick.rect} readOnly={readOnly || busy} fixed={fixedOf(imagePick.slot)} onFixed={v => setFixed(imagePick.slot, v)}
          onPick={src => pickImage(imagePick.slot, src)} close={() => setImagePick(null)}/>, document.body)}
      </div>
      {flow ? <FlowPanel f={f} view={flow} onView={setFlow} disabled={readOnly} fixed={{ n: fixedCount, total: data.base_slots.length }}/> : !data.layout.compositionOnly && <Loading/>}
    </div>}
  </Modal>
  {confirm && <Modal title={confirm === 'save' ? '레이아웃 수정을 반영할까요?' : confirm === 'reload' ? '최신 레이아웃을 다시 불러올까요?' : '수정 내용을 닫을까요?'} close={busy ? () => {} : () => setConfirm(null)} footer={<><Button disabled={busy} onClick={() => setConfirm(null)}>취소</Button><Button variant="primary" busy={busy} onClick={confirm === 'save' ? save : confirm === 'reload' ? () => { setConfirm(null); reload(); } : close}>{confirm === 'save' ? '수정 반영' : confirm === 'reload' ? '다시 불러오기' : '저장하지 않고 닫기'}</Button></>}>
    <p>{confirm === 'save' ? '수정한 기본 문구와 고정 영역을 웹앱과 Storyboard 자동완성에 반영합니다. 사용자가 이미 편집한 제안서의 내용은 유지됩니다.' : '현재 창에서 반영하지 않은 수정 내용이 사라집니다.'}</p>
  </Modal>}
  {experiment && <LayoutExperiments snapshot={experiment} industries={industries} close={() => setExperiment(null)} Sheet={Sheet}/>}
  </>;
}

export function LayoutLibraryPage() {
  const { notify } = useApp();
  const [data, setData] = useState(null), [error, setError] = useState(''), [query, setQuery] = useState(''), [part, setPart] = useState(''), [industry, setIndustry] = useState(''), [lock, setLock] = useState(''), [tab, setTab] = useState('active');
  const [offset, setOffset] = useState(0), [detail, setDetail] = useState(null), [deleting, setDeleting] = useState(null), [busy, setBusy] = useState(false), [hover, setHover] = useState(null);
  const [countChoice, setCountChoice] = useState(null), [sources, setSources] = useState(false), [tools, setTools] = useState(false);
  const hoverTimer = useRef(null), rev = useRef(-1);
  const load = useCallback(async () => {
    try { const value = await api('/layout-library'); const version = value.rev + ':' + value.protection_rev; if (rev.current !== version) { setData(value); rev.current = version; previews.clear(); } setError(''); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => {
    load(); const timer = setInterval(() => { if (!document.hidden) load(); }, 5000);
    window.addEventListener('focus', load); window.addEventListener('admin:layout-library', load);
    return () => { clearInterval(timer); clearTimeout(hoverTimer.current); window.removeEventListener('focus', load); window.removeEventListener('admin:layout-library', load); };
  }, [load]);
  const group = item => item.removed ? 'deleted' : item.variantOf ? 'variants' : item.retired || item.hidden ? 'retired' : 'active';
  const counts = useMemo(() => { const c = {}; for (const k of ['all', 'active', 'variants', 'retired', 'deleted']) c[k] = groupCountLayouts((data?.items || []).filter(l => k === 'all' || group(l) === k), { bucket: group }).length; return c; }, [data]);
  const rows = useMemo(() => groupCountLayouts((data?.items || []).filter(item => {
    if (tab !== 'all' && group(item) !== tab) return false;
    if (part && item.p !== part) return false;
    if (industry && !(item.inds || [item.ind]).includes(industry)) return false;
    if (lock && item.fx !== lock) return false;
    return true;
  }), { bucket: group }).filter(item => query.toLowerCase().trim().split(/\s+/).every(q => [item.name, ...(item.countVariants || [item]).flatMap(l => [l.f, l.code, l.name, l.when, l.g, l.txt])].join(' ').toLowerCase().includes(q))), [data, tab, part, industry, lock, query]);
  useEffect(() => { setOffset(0); setHover(null); clearTimeout(hoverTimer.current); }, [query, tab, part, industry, lock]);
  useEffect(() => { if (offset >= rows.length && offset) setOffset(Math.max(0, Math.floor((rows.length - 1) / 24) * 24)); }, [rows.length, offset]);
  const leave = () => { clearTimeout(hoverTimer.current); setHover(null); };
  const laterLeave = () => { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setHover(null), 180); };
  const hold = () => clearTimeout(hoverTimer.current);
  useEffect(() => { const hide = e => { if (e?.target?.closest?.('.count-variant-peek')) return; setHover(null); }; window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide); return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); }; }, []);
  async function remove() {
    setBusy(true);
    try {
      const r = await api(endpoint(deleting.f), { method: 'DELETE', body: JSON.stringify({ rev: data.rev, confirmed: true }) });
      setDeleting(null); changedLibrary(r.rev); await load(); notify('레이아웃을 삭제했습니다.');
    } catch (e) { notify(e.message, 'error'); setDeleting(null); await load(); }
    finally { setBusy(false); }
  }
  if (!data) return error ? <ErrorBox error={error} retry={load}/> : <Loading/>;
  return <div className="ll-page">
    <div className="ll-topline"><div><strong>{number(counts.active)}</strong><span>사용 가능한 레이아웃 · 실제 {(data.items.filter(l => group(l) === 'active').length).toLocaleString('ko-KR')}장</span><small><i/>웹앱 · Storyboard 연결</small></div><div className="button-row"><Button icon="database" onClick={() => { leave(); setSources(true); }}>입력 소스</Button><Button icon="settings" onClick={() => { leave(); setTools(true); }}>도구</Button><Button icon="refresh" onClick={() => { leave(); rev.current = -1; load(); }}>새로고침</Button></div></div>
    <div className="ll-filters"><div className="ll-search"><Icon name="search" size={18}/><input aria-label="레이아웃 검색" placeholder="이름, 코드, 내용으로 검색" value={query} onChange={e => setQuery(e.target.value)}/>{query && <IconButton icon="close" label="검색 지우기" onClick={() => setQuery('')}/>}</div><select aria-label="목차 구분" value={part} onChange={e => setPart(e.target.value)}><option value="">모든 목차</option>{Object.entries(data.parts).map(([id, p]) => <option key={id} value={id}>{p.label || id}</option>)}</select><select aria-label="업종 구분" value={industry} onChange={e => setIndustry(e.target.value)}><option value="">모든 업종</option>{data.industries.map(i => <option key={i.code} value={i.code}>{i.name}</option>)}</select><select aria-label="AI 채움 구분" value={lock} onChange={e => setLock(e.target.value)}><option value="">모든 채움 방식</option>{Object.entries(LOCKS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
    <div className="ll-tabs" role="tablist" aria-label="레이아웃 상태">{[['active', '사용 중'], ['all', '전체'], ['variants', '내용 후보'], ['retired', '이전 · 숨김'], ['deleted', '삭제됨']].map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}<span>{number(counts[id])}</span></button>)}</div>
    {error && <ErrorBox error={error} retry={load}/>}
    {!rows.length ? <Empty icon="layers" title="조건에 맞는 레이아웃이 없습니다" action={<Button onClick={() => { setQuery(''); setPart(''); setIndustry(''); setLock(''); }}>필터 초기화</Button>}/> : <div className="ll-grid">{rows.slice(offset, offset + 24).map(item => <article className={'ll-card ' + (item.removed ? 'removed' : '')} key={item.f} data-layout={item.f} data-count-group={item.countGroup?.id} onMouseLeave={item.countVariants ? laterLeave : leave} onMouseEnter={e => {
      clearTimeout(hoverTimer.current); const rect = e.currentTarget.getBoundingClientRect();
      if (matchMedia('(hover:hover)').matches) hoverTimer.current = setTimeout(() => setHover({ item, rect }), 450);
    }}><button className="ll-card-open" aria-label={item.name + ' 상세 편집'} onClick={() => { leave(); if (item.countVariants) setCountChoice(item); else setDetail(item.f); }}><Thumbnail item={item} rev={data.rev}/><CountGroupBadge layout={item}/><div className="ll-card-text"><span className="ll-card-code">{item.code || item.f}</span><h3>{item.name}</h3><div className="ll-card-meta"><span>{data.parts[item.p]?.label || item.p || '기타'}</span><span>{LOCKS[item.fx] || 'AI 작성'}</span>{item.edited && !item.removed && <b>수정됨</b>}</div></div></button>{(item.countVariants || [item]).some(l => !l.removed && !l.protected) && <button className="ll-card-delete" aria-label={item.name + ' 삭제'} onMouseEnter={leave} onFocus={leave} onClick={e => { e.stopPropagation(); leave(); if (item.countVariants) setCountChoice(item); else setDeleting(item); }}><Icon name="close" size={17}/></button>}</article>)}</div>}
    <Pager offset={offset} total={rows.length} size={24} onChange={n => { leave(); setOffset(n); document.querySelector('.ll-topline')?.scrollIntoView({ block: 'start' }); }}/>
    {hover && !detail && !deleting && !countChoice && (hover.item.countVariants
      ? <CountGroupPeek layout={hover.item} rect={hover.rect} render={l => <Thumbnail item={l} rev={data.rev}/>} onEnter={hold} onLeave={laterLeave} onSelect={l => { leave(); setDetail(l.f); }} actionLabel="상세 편집"/>
      : <HoverSheet {...hover} rev={data.rev}/>)}
    {countChoice && <Modal title={countChoice.name + ' · 수량별 버전 ' + countChoice.countVariants.length + '종'} close={() => setCountChoice(null)} wide><div className="count-choice"><p>수정하거나 삭제할 시트를 선택하세요.</p><CountGroupOptions layout={countChoice} render={l => <Thumbnail item={l} rev={data.rev}/>} onSelect={l => { setCountChoice(null); setDetail(l.f); }} actionLabel="상세 편집" actions={l => !l.removed && !l.protected && <div className="count-group-actions"><Button variant="danger" onClick={() => { setCountChoice(null); setDeleting(l); }}>삭제</Button></div>}/></div></Modal>}
    {detail && <LayoutDetail f={detail} parts={data.parts} industries={data.industries} close={() => setDetail(null)} onSaved={load}/>}
    {sources && <SourcesDialog close={() => setSources(false)}/>}
    {tools && <ToolsDialog close={() => setTools(false)}/>}
    {deleting && <Modal title="레이아웃을 삭제할까요?" close={busy ? () => {} : () => setDeleting(null)} footer={<><Button disabled={busy} onClick={() => setDeleting(null)}>취소</Button><Button variant="danger" busy={busy} onClick={remove}>삭제</Button></>}><p><strong>{deleting.name}</strong> 레이아웃을 라이브러리와 새 추천에서 삭제합니다.{deleting.variants?.length > 1 && ` 연결된 내용 후보 ${deleting.variants.length - 1}개도 함께 제외됩니다.`}</p><p>이미 저장한 제안서와 샘플 시나리오의 시트는 계속 볼 수 있습니다.</p></Modal>}
  </div>;
}
