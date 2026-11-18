// 레이아웃 상세 — 이 시트를 채우는 데 필요한 실제 입력(input param, 고칠 수 있는 JSON)과, 그 입력으로 도는 채우기 흐름(agentic flow).
//   입력은 상세 머리 '활용 예시' 오른쪽 버튼의 드롭다운 팝업(기본은 접힘), 흐름은 오른쪽 칸 전체를 쓰는 캔버스.
//   흐름은 LangGraph 처럼 위에서 아래로(input → 단계 → END) 그리고, LLM 단계가 부르는 도구는 오른쪽 tools 상자로 잇는다(tool calling).
//   확대 · 축소(버튼 · ⌘/Ctrl+휠) · 끌어 옮기기가 되고, 스크롤로는 움직이지 않는다. 단계를 누르면 그 단계 왼쪽에 팝업이 붙어
//   모듈 · 읽는 입력 · 도구 · 프롬프트(LLM)와 로직(어느 DB 의 어느 오브젝트를 가져와 무엇을 하는지)을 보여 주고 바로 고친다.
//   수정은 즉시 저장되고 다음 자동 구성부터 실제로 쓰인다(app/api/layout_flows.py → app/api/poc/layout_flows.py · layout_tools.py).
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { Button, Modal, ErrorBox, Loading, Toggle } from './components';
import { Glyph, LOCK } from './layout-regions.jsx';
import { Icon } from './icons';
import { ImageSearch } from './image-search';
import './layout-flow.css';

const enc = encodeURIComponent;
const PLUS = 'M12 5v14M5 12h14', MINUS = 'M5 12h14', FIT = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', X = 'M6 6l12 12M18 6 6 18';
const GEAR = 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1';
const LOOP = 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4';
const WRENCH = 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z';
const CHEV = 'M6 9l6 6 6-6';
const ICON = { code: 'M8 6l-6 6 6 6M16 6l6 6-6 6', llm: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z' };
const W = 344, NX = 8, NW = 198, NH = 44, PILL = 22, GAP = 22, TOP = 12, TX = 240, TW = 98, HEAD = 46;
const INPUT = 'M3 12h12M11 8l4 4-4 4M15 4h5v16h-5';
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const save = (f, body, method = 'PUT') => api(`/layout-library/${enc(f)}/flow`, { method, body: JSON.stringify({ ...body, confirmed: true }) });
const WRITERS = ['write', 'agent', 'element', 'merge'];
const FAN = ['split', 'element', 'merge'];   // 요소별 작성: 셋이 함께, '문구 작성' 대신
const UH = 26, UGAP = 6, PER_ROW = 6, UTOP = 12, UBOT = 14;
const ENTITY = { point: '요구', product: '제품', solution: '솔루션', case: '사례', space: '공간', topic: '주제' };
/** 요소별 작성 단계에 그릴 요소 — 칸을 쓰는 요소만 */
const unitsOf = view => (view.elements?.units || []).filter(u => u.writable?.length);
/** 한 번에 쓰기 ↔ 요소별로 나눠 쓰기 — 흐름의 단계를 바꾼 새 흐름 */
export function switchWriting(view, split) {
  const nodes = view.flow.nodes, params = view.flow.inputs.map(i => i.param);
  const base = m => view.base.nodes.find(n => n.module === m);
  const at = nodes.findIndex(n => (split ? ['write'] : FAN).includes(n.module));
  const keep = nodes.filter(n => !(split ? ['write'] : FAN).includes(n.module));
  const old = nodes.find(n => n.module === (split ? 'write' : 'merge'));
  const reads = (old?.reads || params).filter(r => params.includes(r));
  const add = split
    ? [{ id: 'split', module: 'split' }, { id: 'element', module: 'element', prompt: base('element')?.prompt || '', reads },
       { id: 'merge', module: 'merge', prompt: old?.prompt ?? base('merge')?.prompt ?? '', reads }]
    : [{ id: 'write', module: 'write', prompt: old?.prompt ?? base('write')?.prompt ?? '', reads, ...(nodes.find(n => n.module === 'element')?.tools?.length ? { tools: nodes.find(n => n.module === 'element').tools } : {}) }];
  const out = [...keep];
  out.splice(at < 0 ? keep.length : at, 0, ...add);
  return { inputs: view.flow.inputs, nodes: out };
}
const PARAM = /^[a-z][a-z0-9_]{1,39}$/;

// ---------------------------------------------------------------- 입력 JSON
/** { param: { source?(param 과 같으면 생략), type, required } } */
export function inputsJson(inputs, catalog) {
  const obj = {};
  for (const i of inputs) obj[i.param] = { ...(i.source !== i.param ? { source: i.source } : {}), type: catalog[i.source]?.type || '?', required: !!i.required };
  return JSON.stringify(obj, null, 2);
}
export function parseInputs(text, catalog) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw new Error('JSON 형식이 아닙니다 — ' + e.message); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('입력은 { "이름": { … } } 객체여야 합니다.');
  return Object.entries(obj).map(([param, v]) => {
    if (!PARAM.test(param)) throw new Error(`“${param}” — 이름은 영문 소문자 · 숫자 · _ 로 2~40자입니다.`);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`“${param}” 의 값은 { "type": …, "required": … } 객체여야 합니다.`);
    const extra = Object.keys(v).filter(k => !['source', 'type', 'required'].includes(k));
    if (extra.length) throw new Error(`“${param}” 에 쓸 수 없는 키: ${extra.join(', ')} (source · type · required)`);
    const source = v.source ?? param, src = catalog[source];
    if (!src) throw new Error(`“${param}” — 소스 “${source}” 가 입력 소스에 없습니다. 다른 이름이면 "source" 로 소스 키를 적습니다.`);
    if (src.off) throw new Error(`“${param}” — 소스 “${source}” 가 꺼져 있습니다.`);
    if (v.type !== undefined && v.type !== src.type) throw new Error(`“${param}”.type 은 소스 형식 “${src.type}” 입니다 — 형식은 입력 소스에서 바꿉니다.`);
    if (v.required !== undefined && typeof v.required !== 'boolean') throw new Error(`“${param}”.required 는 true / false 입니다.`);
    return { param, source, required: !!v.required };
  });
}
const TOKEN = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;
function Highlight({ text }) {
  const out = []; let last = 0, m, k = 0;
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span key={k++} className={m[2] ? 'j-key' : m[1] ? 'j-str' : m[3] ? 'j-bool' : 'j-num'}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

// 입력이 바뀌면 단계가 읽는 입력도 맞춘다: 없어진 이름은 빼고, 새 입력은 글을 쓰는 단계가 읽는다
export function withInputs(flow, inputs) {
  const names = new Set(inputs.map(i => i.param)), fresh = inputs.filter(i => !flow.inputs.some(x => x.param === i.param)).map(i => i.param);
  const nodes = flow.nodes.map(n => Array.isArray(n.reads) ? { ...n, reads: [...n.reads.filter(r => names.has(r)), ...(WRITERS.includes(n.module) ? fresh : [])] } : n);
  return { inputs, nodes };
}

// 입력 JSON 편집 — 머리 '입력' 드롭다운과 흐름 맨 위 입력 카드의 팝업이 같은 편집기를 쓴다(각자 적용 전 글을 가진다)
function useInputsDraft(f, view, onView) {
  const [draft, setDraft] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const catalog = useMemo(() => Object.fromEntries(view.sources.map(s => [s.key, s])), [view.sources]);
  const full = inputsJson(view.flow.inputs, catalog), text = draft ?? full, dirty = draft !== null && draft !== full;
  const used = new Set(view.flow.inputs.map(i => i.source));
  const addable = Object.keys(view.groups).map(g => [g, view.sources.filter(s => s.group === g && !s.off && !used.has(s.key))]).filter(([, xs]) => xs.length);
  function add(key) {
    if (!key) return;
    try {
      const obj = JSON.parse(text); let param = key, k = 2; while (obj[param]) param = `${key}_${k++}`;
      obj[param] = { ...(param !== key ? { source: key } : {}), type: catalog[key].type, required: false };
      setDraft(JSON.stringify(obj, null, 2)); setError('');
    } catch { setError('JSON 을 먼저 고친 뒤 추가해 주세요.'); }
  }
  async function apply() {
    let inputs;
    try { inputs = parseInputs(text, catalog); } catch (e) { setError(e.message); return false; }
    setBusy(true); setError('');
    try { onView(await save(f, { rev: view.rev, flow: withInputs(view.flow, inputs) })); setDraft(null); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }
  async function reload() { try { onView(await api(`/layout-library/${enc(f)}/flow`)); } catch (e) { setError(e.message); } }
  return { text, dirty, error, busy, catalog, addable, add, apply, reload, groups: view.groups, n: view.flow.inputs.length,
    edit: v => { setDraft(v); setError(''); }, revert: () => { setDraft(null); setError(''); } };
}

function InputsEditor({ d, disabled, onApplied }) {
  const pre = useRef(null);
  const lines = d.text.split('\n').length;
  const sync = e => { if (pre.current) { pre.current.scrollTop = e.target.scrollTop; pre.current.scrollLeft = e.target.scrollLeft; } };
  const apply = async () => { if (await d.apply()) onApplied?.(); };
  return <>
    <div className="lf-code" style={{ height: `calc(${Math.min(lines, 40)} * 1.6em + 20px)` }}>
      <pre ref={pre} aria-hidden="true"><Highlight text={d.text + '\n'}/></pre>
      <textarea aria-label="입력 JSON" spellCheck={false} value={d.text} readOnly={disabled || d.busy} onScroll={sync}
        onChange={e => d.edit(e.target.value)} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); apply(); } }}/>
    </div>
    {d.error && <p className="lf-json-error" role="alert">{d.error}</p>}
    <div className="lf-json-actions">
      <select className="lf-add" aria-label="입력 추가" value="" disabled={disabled || d.busy || !d.addable.length} onChange={e => d.add(e.target.value)}>
        <option value="">+ 소스</option>
        {d.addable.map(([g, xs]) => <optgroup key={g} label={d.groups[g]}>{xs.map(s => <option key={s.key} value={s.key}>{s.label} · {s.key}</option>)}</optgroup>)}
      </select>
      <span className="lf-spacer"/>
      {d.dirty && <Button disabled={d.busy} onClick={d.revert}>되돌리기</Button>}
      <Button variant="primary" busy={d.busy} disabled={disabled || !d.dirty} onClick={apply}>적용</Button>
    </div>
  </>;
}

// 입력 — 상세 머리 '활용 예시' 오른쪽 버튼 → 드롭다운 팝업(JSON 바로 편집 · 적용). 닫아도 적용 전 글은 남는다.
export function InputsMenu({ f, view, onView, disabled }) {
  const button = useRef(null), pop = useRef(null);
  const [open, setOpen] = useState(false), [at, setAt] = useState(null), [sources, setSources] = useState(false);
  const d = useInputsDraft(f, view, onView);
  useEffect(() => {
    if (!open) return;
    const r = button.current.getBoundingClientRect(), w = Math.min(540, innerWidth - 24);
    setAt({ top: r.bottom + 8, left: Math.max(12, Math.min(r.right - w, innerWidth - w - 12)), width: w });
    const down = e => { if (!pop.current?.contains(e.target) && !button.current?.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false); } };
    document.addEventListener('mousedown', down, true); window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key, true); };
  }, [open]);
  return <>
    <button ref={button} type="button" className={'lf-in-button' + (d.dirty ? ' dirty' : '')} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(v => !v)}>
      입력 {d.n}{d.dirty && <i className="lf-dot" aria-label="적용 전 수정 있음"/>}<Icon name="down" size={14}/></button>
    {open && at && createPortal(<div ref={pop} className="ll-ex-pop lf-in-pop" role="dialog" aria-label="입력" style={at}>
      <header><h3>입력 <span>{d.n}</span></h3>
        <button type="button" className="lf-icon" aria-label="입력 소스 관리" title="입력 소스 관리" onClick={() => { setOpen(false); setSources(true); }}><Glyph d={GEAR} size={15}/></button></header>
      <InputsEditor d={d} disabled={disabled} onApplied={() => setOpen(false)}/>
    </div>, document.body)}
    {sources && createPortal(<SourcesDialog close={() => setSources(false)} onSaved={d.reload}/>, document.body)}
  </>;
}

// input 단계를 누르면 — 그 왼쪽 팝업에 머리 '입력' 팝업과 같은 JSON 편집기
function InputsPopover({ d, rect, disabled, close, onSources }) {
  const ref = useRef(null), [place, setPlace] = useState(null);
  useOutside(ref, close);
  useLayoutEffect(() => {
    const h = ref.current.offsetHeight, w = ref.current.offsetWidth, gap = 14;
    const top = clamp(rect.top + rect.height / 2 - 40, 8, innerHeight - h - 8);
    setPlace({ left: Math.max(8, rect.left - w - gap), top, arrow: clamp(rect.top + rect.height / 2 - top, 18, h - 18) });
  }, [rect.top, rect.left, d.text.split('\n').length]);
  return <div ref={ref} className="lf-pop lf-in-pop2" role="dialog" aria-label="흐름 입력" style={place ? { left: place.left, top: place.top } : { left: -9999, top: 0 }}>
    {place && <i className="lf-pop-arrow" style={{ top: place.arrow }}/>}
    <header><span className="lf-node-icon code"><Glyph d={INPUT} size={13}/></span><div><strong>input</strong><small>입력 {d.n}</small></div>
      <button type="button" className="lf-icon" aria-label="입력 소스 관리" title="입력 소스 관리" onClick={onSources}><Glyph d={GEAR} size={14}/></button>
      <button type="button" className="lf-icon" aria-label="입력 팝업 닫기" onClick={close}><Glyph d={X} size={13}/></button></header>
    <div className="lf-pop-body"><InputsEditor d={d} disabled={disabled} onApplied={close}/></div>
  </div>;
}

// 칸 설계 — 상세 머리 '칸 n' 드롭다운: AI가 쓰는 칸마다 무엇을 쓰는 칸인지(역할) · 그대로 둠(구조 표지) · 숫자만. 저장하면 다음 자동 구성부터 쓰인다.
export function CellsMenu({ f, view, onView, disabled }) {
  const button = useRef(null), pop = useRef(null);
  const [open, setOpen] = useState(false), [at, setAt] = useState(null), [draft, setDraft] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const info = view.cells || { cells: {}, base: {}, edited: [], list: [] };
  const cur = draft || info.cells, designed = info.list.filter(c => cur[String(c.i)]?.role || cur[String(c.i)]?.keep).length;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(info.cells);
  useEffect(() => {
    if (!open) return;
    const r = button.current.getBoundingClientRect(), w = Math.min(720, innerWidth - 24);
    setAt({ top: r.bottom + 8, left: Math.max(12, Math.min(r.right - w, innerWidth - w - 12)), width: w });
    const down = e => { if (!pop.current?.contains(e.target) && !button.current?.contains(e.target)) setOpen(false); };
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); setOpen(false); } };
    document.addEventListener('mousedown', down, true); window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key, true); };
  }, [open]);
  const set = (i, patch) => setDraft(d => { const all = { ...(d || info.cells) }; const next = { ...(all[i] || {}), ...patch };
    for (const k of Object.keys(next)) if (!next[k]) delete next[k];
    if (Object.keys(next).length) all[i] = next; else delete all[i]; return all; });
  async function apply() {
    setBusy(true); setError('');
    try {
      const cells = Object.fromEntries(info.list.map(c => [String(c.i), cur[String(c.i)] || {}]).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(info.base[k] || {})));
      onView(await api(`/layout-library/${enc(f)}/cells`, { method: 'PUT', body: JSON.stringify({ rev: view.rev, cells, confirmed: true }) }));
      setDraft(null); setOpen(false);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <>
    <button ref={button} type="button" className={'lf-in-button' + (dirty ? ' dirty' : '')} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(v => !v)}>
      칸 설계 {designed}/{info.list.length}{dirty && <i className="lf-dot" aria-label="저장 전 수정 있음"/>}<Icon name="down" size={14}/></button>
    {open && at && createPortal(<div ref={pop} className="ll-ex-pop lf-in-pop lf-cells-pop" role="dialog" aria-label="칸 설계" style={at}>
      <header><h3>칸 설계 <span>{designed} / {info.list.length}</span></h3></header>
      <div className="lf-cells">
        {info.list.map(c => { const k = String(c.i), v = cur[k] || {}, edited = info.edited.includes(k);
          return <div key={k} className={'lf-cell' + (v.keep ? ' keep' : '') + (edited ? ' edited' : '')}>
            <code>{k}</code>
            <div><small title={c.sample}>{c.sample || '—'}</small>
              <input aria-label={`칸 ${k} 역할`} value={v.role || ''} placeholder={v.keep ? '그대로 둠' : '무엇을 쓰는 칸인지'} maxLength={80} disabled={disabled || busy || v.keep} onChange={e => set(k, { role: e.target.value })}/></div>
            <label className={'lf-chip' + (v.keep ? ' on' : '')}><input type="checkbox" aria-label={`칸 ${k} 그대로 둠`} checked={!!v.keep} disabled={disabled || busy} onChange={e => set(k, { keep: e.target.checked })}/>그대로</label>
            <label className={'lf-chip' + (v.num ? ' on' : '')}><input type="checkbox" aria-label={`칸 ${k} 숫자만`} checked={!!v.num} disabled={disabled || busy} onChange={e => set(k, { num: e.target.checked })}/>숫자</label>
          </div>; })}
      </div>
      {error && <p className="lf-json-error" role="alert">{error}</p>}
      <div className="lf-json-actions"><span className="lf-spacer"/>
        {dirty && <Button disabled={busy} onClick={() => { setDraft(null); setError(''); }}>되돌리기</Button>}
        <Button variant="primary" busy={busy} disabled={disabled || !dirty} onClick={apply}>저장</Button></div>
    </div>, document.body)}
  </>;
}

// ---------------------------------------------------------------- 패널
/** view = GET /layout-library/{f}/flow · fixed = {n, total} AI 잠금 영역 수(지금 시트 편집 상태) — 오른쪽 칸 전체가 흐름 캔버스 */
export function FlowPanel({ f, view, onView, disabled, fixed }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [pop, setPop] = useState(null), [sources, setSources] = useState(false);
  const [imageSearch, setImageSearch] = useState(false);
  const flow = view.flow, inputs = useInputsDraft(f, view, onView);
  // 모델 입력: 저장된 흐름을 샘플 입력으로 실제 코드에 돌려(모델 대신 기록하는 대역) 단계마다 보낼 프롬프트 · 스키마 · Decision 질문을 받는다
  const [trace, setTrace] = useState(null), traceKey = `${view.key}:${view.rev}`;
  function loadTrace(industry = trace?.industry || '') {
    setTrace({ key: traceKey, industry, loading: true });
    api(`/layout-library/${enc(f)}/flow/trace${industry ? '?industry=' + enc(industry) : ''}`).then(
      data => setTrace(t => t && t.key === traceKey && t.industry === industry ? { ...t, loading: false, data } : t),
      e => setTrace(t => t && t.key === traceKey && t.industry === industry ? { ...t, loading: false, error: e.message } : t));
  }
  useEffect(() => { if (pop && !pop.inputs && (!trace || trace.key !== traceKey)) loadTrace(); }, [pop, traceKey]);
  async function commit(next) {
    setBusy(true); setError('');
    try { onView(await save(f, { rev: view.rev, flow: next })); return true; }
    catch (e) { setError(e.message); return false; }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true); setError(''); setPop(null);
    try { onView(await save(f, { rev: view.rev }, 'DELETE')); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function reload() { try { onView(await api(`/layout-library/${enc(f)}/flow`)); setError(''); } catch (e) { setError(e.message); } }
  const fanned = flow.nodes.some(n => FAN.includes(n.module));   // 요소별로 쓰는 흐름에는 '문구 작성'을 따로 넣지 않는다(팝업의 전환으로)
  const missing = Object.entries(view.modules).filter(([m, s]) => !s.fixed && !(m === 'write' && fanned) && !FAN.includes(m) && (!s.single || !flow.nodes.some(n => n.module === m)));
  function newNode(module, rect) {
    if (!module) return;
    const base = view.base.nodes.find(n => n.module === module);
    let id = module, k = 2; while (flow.nodes.some(n => n.id === id)) id = `${module}-${k++}`;
    const params = flow.inputs.map(i => i.param);
    const node = { id, module, ...(view.modules[module].prompt ? { prompt: base?.prompt || '', reads: (base?.reads || params).filter(r => params.includes(r)) } : {}) };
    setPop({ node, index: -1, rect });
  }
  return <div className="lf-panel">
    {error && !pop && <ErrorBox error={error} retry={reload}/>}
    <FlowGraph view={view} fixed={fixed} busy={busy} disabled={disabled} active={pop?.inputs ? 'inputs' : pop?.index ?? null} activeUnit={pop?.unit ?? null}
      onOpen={(node, index, rect, unit, tab) => { setError(''); setPop({ node, index, rect, unit, tab }); }}
      onInputs={rect => { setError(''); setPop({ inputs: true, rect }); }} inputsDirty={inputs.dirty}
      onAdd={newNode} missing={missing} onReset={reset}/>
    {pop?.inputs && createPortal(<InputsPopover d={inputs} rect={pop.rect} disabled={disabled} close={() => setPop(null)} onSources={() => { setPop(null); setSources(true); }}/>, document.body)}
    {sources && createPortal(<SourcesDialog close={() => setSources(false)} onSaved={inputs.reload}/>, document.body)}
    {imageSearch && createPortal(<ImageSearch f={f} close={() => setImageSearch(false)} onSaved={reload}/>, document.body)}
    {/* 단계 팝업은 body 로 — 화면을 가르는 배경 없이, 누른 단계 바로 왼쪽에 붙는다 */}
    {pop && !pop.inputs && createPortal(<NodePopover key={pop.node.id + pop.index + (pop.tab || '')} view={view} fixed={fixed} {...pop} busy={busy} error={error}
      trace={trace?.key === traceKey ? trace : null} onIndustry={loadTrace} close={() => { setPop(null); setError(''); }}
      onImageSearch={() => { setPop(null); setImageSearch(true); }}
      onSave={async node => { const nodes = pop.index < 0 ? [...flow.nodes, node] : flow.nodes.map((n, k) => k === pop.index ? node : n); if (await commit({ inputs: flow.inputs, nodes })) setPop(null); }}
      onDelete={async () => { if (await commit({ inputs: flow.inputs, nodes: flow.nodes.filter((_, k) => k !== pop.index) })) setPop(null); }}
      onSwitch={async split => { if (await commit(switchWriting(view, split))) setPop(null); }}/>, document.body)}
  </div>;
}

const toolsOf = (view, n) => [...(view.logic?.[n.module]?.builtin || []).map(k => ({ key: k, builtin: true })), ...(n.tools || []).map(k => ({ key: k, builtin: false }))];
function layoutOf(view) {
  const pos = []; let y = TOP + NH + GAP;   // the input step first
  const boxes = view.flow.nodes.map(n => toolsOf(view, n)), units = unitsOf(view);
  view.flow.nodes.forEach((n, i) => {
    const fan = n.module === 'element' && units.length ? Math.ceil(units.length / PER_ROW) * (UH + UGAP) - UGAP + UTOP + UBOT : 0;
    const h = Math.max(NH + fan, boxes[i].length ? 22 + boxes[i].length * 17 : 0); pos.push({ y, h, fan }); y += h + GAP;
  });
  return { pos, boxes, units, end: y, height: y + PILL + TOP };
}

export function FlowGraph({ view, fixed, busy, disabled, active, activeUnit = null, onOpen = () => {}, onInputs = () => {}, inputsDirty = false, onAdd, missing = [], onReset, readOnly = false }) {
  const nodes = view.flow.nodes, { pos, boxes, units, end, height } = layoutOf(view);
  const tmap = Object.fromEntries((view.tools || []).map(t => [t.key, t]));
  const canvas = useRef(null), drag = useRef(null);
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
  const fit = () => {
    const box = canvas.current?.getBoundingClientRect(); if (!box?.height) return;
    // 머리(제목 · 확대 도구)는 캔버스 위에 떠 있으니 그 아래 공간에 맞춘다
    const room = box.height - HEAD - 10;
    const z = clamp(Math.min(room / height, (box.width - 16) / W, 1.15), 0.45, 1.15);
    setZoom(z); setPan({ x: (box.width - W * z) / 2, y: HEAD + Math.max(0, (room - height * z) / 2) });
  };
  useLayoutEffect(fit, [height]);
  useEffect(() => {
    const el = canvas.current; if (!el) return;
    const resize = new ResizeObserver(fit); resize.observe(el);
    // 스크롤로는 움직이지 않는다 — ⌘/Ctrl + 휠만 확대 · 축소
    const wheel = e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      setZoom(z => { const n = clamp(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.35, 2.5); setPan(p => ({ x: px - (px - p.x) * n / z, y: py - (py - p.y) * n / z })); return n; });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { resize.disconnect(); el.removeEventListener('wheel', wheel); };
  }, [height]);
  const step = k => { const r = canvas.current.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2; setZoom(z => { const n = clamp(z * k, 0.35, 2.5); setPan(p => ({ x: cx - (cx - p.x) * n / z, y: cy - (cy - p.y) * n / z })); return n; }); };
  const mid = NX + NW / 2;
  const agentAt = nodes.reduce((k, n, i) => view.modules[n.module].order <= view.modules.agent.order ? i : k, 0);
  const edges = [[TOP + NH, pos[0].y], ...nodes.slice(1).map((_, i) => [pos[i].y + pos[i].h, pos[i + 1].y]), [pos[nodes.length - 1].y + pos[nodes.length - 1].h, end]];
  return <section className="lf-flow" aria-label="흐름">
    <div className="lf-canvas" ref={canvas} onPointerDown={e => { if (e.target.closest('button')) return; drag.current = { x: e.clientX, y: e.clientY, p: pan }; e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => { const d = drag.current; if (d) setPan({ x: d.p.x + e.clientX - d.x, y: d.p.y + e.clientY - d.y }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <div className="lf-stage" style={{ width: W, height, transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg width={W} height={height} className="lf-edges" aria-hidden="true">
          <defs><marker id="lf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#9aa8bb"/></marker>
            <marker id="lf-arrow-t" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill="#a78bfa"/></marker></defs>
          {edges.map(([a, b], i) => <line key={i} x1={mid} y1={a} x2={mid} y2={b - 2} stroke="#b6c2d2" strokeWidth="1.6" markerEnd="url(#lf-arrow)"/>)}
          {nodes.map((n, i) => pos[i].fan > 0 && <g key={'f' + n.id} className="lf-fan-edges">
            {units.map((u, k) => {
              const per = Math.min(PER_ROW, units.length), uw = (NW - 12 - (per - 1) * 4) / per, r = Math.floor(k / PER_ROW), c = k % PER_ROW;
              const x = NX + 6 + c * (uw + 4) + uw / 2, top = pos[i].y + NH + UTOP + r * (UH + UGAP), bottom = pos[i].y + pos[i].h;
              return <g key={u.id}>
                <path d={`M${mid} ${pos[i].y + NH} C ${mid} ${top - 2}, ${x} ${pos[i].y + NH}, ${x} ${top}`} fill="none" stroke="#a5b4fc" strokeWidth="1.3"/>
                {r === Math.floor((units.length - 1) / PER_ROW) && <path d={`M${x} ${top + UH} C ${x} ${bottom}, ${mid} ${top + UH}, ${mid} ${bottom}`} fill="none" stroke="#a5b4fc" strokeWidth="1.3"/>}
              </g>;
            })}
          </g>)}
          {nodes.map((n, i) => view.modules[n.module].loop && <path key={'l' + n.id} d={`M${NX + 12} ${pos[i].y + pos[i].h} C ${NX - 14} ${pos[i].y + pos[i].h + 10}, ${NX - 14} ${pos[i].y - 10}, ${NX + 12} ${pos[i].y}`} fill="none" stroke="#a8b6c8" strokeDasharray="4 3" strokeWidth="1.3" markerEnd="url(#lf-arrow)"><title>{view.modules[n.module].loop}</title></path>)}
          {nodes.map((n, i) => boxes[i].length > 0 && <g key={'t' + n.id}>
            <line x1={NX + NW + 2} y1={pos[i].y + pos[i].h / 2 - 4} x2={TX - 2} y2={pos[i].y + pos[i].h / 2 - 4} stroke="#a78bfa" strokeWidth="1.4" strokeDasharray="4 3" markerEnd="url(#lf-arrow-t)"/>
            <line x1={TX - 2} y1={pos[i].y + pos[i].h / 2 + 4} x2={NX + NW + 2} y2={pos[i].y + pos[i].h / 2 + 4} stroke="#a78bfa" strokeWidth="1.4" strokeDasharray="4 3" markerEnd="url(#lf-arrow-t)"/>
          </g>)}
        </svg>
        {/* input — 흐름의 첫 단계. JSON 은 누르면 팝업에서(머리 '입력' 팝업과 같은 편집기) */}
        <button type="button" className={'lf-node code lf-input' + (active === 'inputs' ? ' active' : '')} style={{ top: TOP, left: NX, width: NW, height: NH }} disabled={readOnly}
          aria-label="input 열기" onClick={e => onInputs(e.currentTarget.getBoundingClientRect())}>
          <span className="lf-node-icon"><Glyph d={INPUT} size={13}/></span>
          <span className="lf-node-text"><strong>input</strong><small>입력 {view.flow.inputs.length}</small></span>
          {inputsDirty && <i className="lf-dot" aria-label="적용 전 수정 있음"/>}
        </button>
        {nodes.map((n, i) => {
          const s = view.modules[n.module], reads = n.reads?.length, dbs = view.logic?.[n.module]?.steps?.length || 0;
          const fan = pos[i].fan > 0, own = new Set((n.units || []).filter(u => u.prompt).map(u => u.id));
          const uw = fan ? (NW - 12 - (Math.min(PER_ROW, units.length) - 1) * 4) / Math.min(PER_ROW, units.length) : 0;
          return <React.Fragment key={n.id}>
            {fan && <div className="lf-fan" style={{ top: pos[i].y, left: NX - 4, width: NW + 8, height: pos[i].h }} aria-hidden="true"/>}
            {fan && units.map((u, k) => {
              const r = Math.floor(k / PER_ROW), c = k % PER_ROW;
              return <button key={u.id} type="button" className={'lf-unit ' + u.entity + (own.has(u.id) ? ' own' : '') + (active === i && activeUnit === u.id ? ' active' : '')}
                style={{ top: pos[i].y + NH + UTOP + r * (UH + UGAP), left: NX + 6 + c * (uw + 4), width: uw, height: UH }} title={`${u.label} · ${ENTITY[u.entity] || u.entity} · 칸 ${u.writable.length}`}
                disabled={readOnly} aria-label={`요소 ${u.label} 열기`} onClick={e => onOpen(n, i, e.currentTarget.getBoundingClientRect(), u.id)}>
                <b>{u.label}</b><small>{ENTITY[u.entity] || u.entity}</small></button>;
            })}
            <button type="button" className={'lf-node ' + s.kind + (s.fixed ? ' fixed' : '') + (s.react ? ' react' : '') + (fan ? ' fan' : '') + (view.decision?.[n.module] ? ' dec' : '') + (active === i && !activeUnit ? ' active' : '')} style={{ top: fan ? pos[i].y : pos[i].y + (pos[i].h - NH) / 2, left: NX, width: NW, height: NH }}
              disabled={readOnly} onClick={e => onOpen(n, i, e.currentTarget.getBoundingClientRect(), null, e.target.closest?.('.lf-dec-chip') ? 'decision' : undefined)} aria-label={(n.label || s.label) + ' 단계 열기'}>
                <span className="lf-node-icon"><Glyph d={ICON[s.kind]} size={13}/></span>
                <span className="lf-node-text"><strong>{n.label || s.label}</strong><small>{s.kind === 'llm' ? s.stage : '코드'}{fan ? ` · 요소 ${units.length} · 동시` : reads ? ` · 입력 ${reads}` : ''}{n.module === 'split' && units.length ? ` · 요소 ${units.length}` : s.kind === 'code' && dbs ? ` · DB ${dbs}` : ''}{n.module === 'lock' && fixed ? ` · 잠금 ${fixed.n}` : ''}</small></span>
                <span className="lf-chips">
                  {s.react && <span className="lf-react-chip" title={s.loop}>ReAct</span>}
                  {view.decision?.[n.module] && <span className={'lf-dec-chip' + (view.decision[n.module].active ? ' on' : '')} title={view.decision[n.module].active ? 'Decision 분기 사용 — 눌러 Decision 탭' : 'Decision 분기 — 쓰지 않음 · 눌러 Decision 탭'}>D</span>}
                </span>
            </button>
            {boxes[i].length > 0 && <button type="button" className="lf-toolbox" style={{ top: pos[i].y, left: TX, width: TW, height: pos[i].h }} disabled={readOnly} onClick={e => onOpen(n, i, e.currentTarget.getBoundingClientRect())} aria-label={(n.label || s.label) + ' 도구'}>
              <b><Glyph d={WRENCH} size={10}/>tools</b>
              {boxes[i].map(t => <span key={t.key} className={t.builtin ? 'builtin' : ''} title={(tmap[t.key]?.label || t.key) + (t.builtin ? ' · 내장' : '')}>{t.key}</span>)}
            </button>}
          </React.Fragment>;
        })}
        {!disabled && <button type="button" className="lf-plus" style={{ top: pos[agentAt].y + pos[agentAt].h + GAP / 2 - 9, left: mid - 9 }} aria-label="사용자 정의 단계 추가" title="사용자 정의 단계 추가" disabled={busy} onClick={e => onAdd('agent', e.currentTarget.getBoundingClientRect())}><Glyph d={PLUS} size={10}/></button>}
        <span className="lf-pill" style={{ top: end, left: mid - 36 }}>END</span>
      </div>
    </div>
    <header className="lf-flow-head"><h3>흐름{view.edited && !readOnly && <b className="lf-edited">수정됨</b>}</h3>
      <div className="lf-tools">
        <button type="button" className="lf-icon" aria-label="축소" onClick={() => step(1 / 1.2)}><Glyph d={MINUS} size={14}/></button>
        <button type="button" className="lf-zoom" aria-label="화면에 맞추기" onClick={fit}>{Math.round(zoom * 100)}%</button>
        <button type="button" className="lf-icon" aria-label="확대" onClick={() => step(1.2)}><Glyph d={PLUS} size={14}/></button>
        <button type="button" className="lf-icon" aria-label="맞춤" onClick={fit}><Glyph d={FIT} size={14}/></button>
        {!readOnly && <select className="lf-add-step" aria-label="단계 추가" value="" disabled={disabled || busy} onChange={e => onAdd(e.target.value, canvas.current.getBoundingClientRect())}>
          <option value="">+ 단계</option>{missing.map(([m, s]) => <option key={m} value={m}>{s.label}</option>)}
        </select>}
        {view.edited && !readOnly && <button type="button" className="lf-reset" disabled={disabled || busy} onClick={onReset}>기본값</button>}
      </div>
    </header>
  </section>;
}

// ---------------------------------------------------------------- 단계 팝업(누른 단계 왼쪽, 배경 없음)
function useOutside(ref, close) {
  useEffect(() => {
    const down = e => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.('.lf-node, .lf-toolbox, .lf-plus, .lf-add-step, .lf-input, .lf-unit')) close(); };
    // Esc 는 이 팝업만 닫는다(뒤의 상세 팝업은 그대로)
    const key = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
    document.addEventListener('mousedown', down, true); window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down, true); window.removeEventListener('keydown', key, true); };
  }, []);
}

// the step's decision-model branch (app/api/poc/layout_decide.py): what it asks instead of the LLM, and whether it runs
const decState = d => d.active ? '사용' : d.off ? 'LLM 유지' : '꺼짐';
function DecisionBlock({ dec }) {
  return <div className="lf-logic lf-dec"><h4>Decision 분기<span className={'lf-dec-state' + (dec.active ? ' on' : '')} title={dec.off || dec.task}>{decState(dec)}</span>
    {dec.review && <span className={'lf-dec-state' + (dec.review.active ? ' on' : '')} title={dec.review.off || dec.review.task}>검토 {decState(dec.review)}</span>}</h4>
    {dec.questions.map((q, k) => <div key={k} className="lf-logic-row"><code>{q.cell ? `칸 ${q.cell} · ` : ''}{q.type}{q.when ? ` · ${q.when}` : ''}</code><span>{q.q}</span><span><em>보기</em>{q.options || '—'}</span></div>)}
    {dec.llm && <p className="lf-facts-line"><Glyph d={LOOP} size={12}/>{dec.llm}</p>}</div>;
}

// in · out — 이 단계가 장의 상태에서 읽고 쓰는 것(LLM · Decision 분기 모두 같은 interface)
function IoBlock({ io }) {
  if (!io) return null;
  return <div className="lf-io-block" aria-label="in · out">
    {['in', 'out'].map(k => <div key={k} className={'lf-io-side ' + k}><b>{k}</b>
      <pre className="lf-pre lf-json"><Highlight text={JSON.stringify(io[k] || {}, null, 2)}/></pre></div>)}
  </div>;
}

const jsonText = v => typeof v === 'string' ? v : JSON.stringify(v, null, 2);
// 한 번의 모델 호출 — 보내는 그대로: LLM {system · prompt · schema · temperature · max_tokens} · Decision {state · questions}
function ModelCall({ c, first, models, decisionApi }) {
  const [open, setOpen] = useState(first);
  const llm = c.kind === 'llm', qs = Object.entries(c.questions || {});
  const meta = llm ? [c.temperature != null && `temperature ${c.temperature}`, c.max_tokens && `max_tokens ${c.max_tokens.toLocaleString()}`, `${(c.prompt || '').length.toLocaleString()}자`]
    : [c.task, `질문 ${qs.length}`];
  return <div className={'lf-call' + (open ? ' open' : '')}>
    <button type="button" className="lf-call-head" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <span className={'lf-kind ' + c.kind}>{llm ? 'LLM' : 'Decision'}</span><code>{c.stage}</code><small>{meta.filter(Boolean).join(' · ')}</small>
      <span className="lf-call-chev"><Glyph d={CHEV} size={12}/></span></button>
    {open && <div className="lf-call-body">
      {llm ? <>
        <p className="lf-call-line">{models?.llm || 'LLM'} · generate_json(stage=“compose:{c.stage}”)</p>
        {c.system && <section><h5>system</h5><pre className="lf-pre">{c.system}</pre></section>}
        <section><h5>prompt</h5><pre className="lf-pre" aria-label={c.stage + ' 프롬프트'}>{c.prompt}</pre></section>
        <section><h5>schema</h5><pre className="lf-pre lf-json"><Highlight text={JSON.stringify(c.schema, null, 2)}/></pre></section>
      </> : <>
        <p className="lf-call-line">{models?.decision || 'Decision'} · {decisionApi}</p>
        <section><h5>state</h5><pre className="lf-pre lf-json"><Highlight text={jsonText(c.state)}/></pre></section>
        <section><h5>questions <span>{qs.length}</span></h5>
          {qs.map(([id, q]) => <div key={id} className="lf-q"><div><code>{id}</code><span className={'lf-qtype ' + q.type}>{q.type}</span></div>
            <p>{jsonText(q.instructions)}</p>
            {q.criteria && <pre className="lf-pre lf-json"><Highlight text={JSON.stringify(q.criteria, null, 2)}/></pre>}</div>)}</section>
      </>}
    </div>}
  </div>;
}

// 모델 입력 — 저장된 흐름을 샘플 입력으로 돌렸을 때 이 단계가 보내는 호출 전부(모델은 부르지 않음 · 대역이 레이아웃 원래 문구로 답함)
function ModelInputs({ trace, calls, onIndustry, branch }) {
  if (!trace || trace.loading) return <div className="lf-model"><h4>모델 입력</h4><p className="lf-facts-line">불러오는 중…</p></div>;
  if (trace.error) return <div className="lf-model"><h4>모델 입력</h4><ErrorBox error={trace.error} retry={() => onIndustry(trace.industry)}/></div>;
  const d = trace.data, s = d.sample, b = d[branch] || { calls: [], error: '' };
  return <div className="lf-model">
    <h4>모델 입력<span>{calls.length}</span>
      <label className="lf-sample" title={`샘플 입력 “${s.label}” · 모델 대신 레이아웃 원래 문구로 답하는 대역으로 실행`}>샘플
        <select aria-label="샘플 업종" value={s.industry} onChange={e => onIndustry(e.target.value)}>{d.industries.map(i => <option key={i.code} value={i.code}>{i.name}</option>)}</select></label></h4>
    {b.error && <p className="lf-json-error">{b.error}</p>}
    {!calls.length && <p className="lf-facts-line">{d.whole_fixed ? '전체 고정 — 모델 호출 없음' : '이 샘플에서 호출 없음'}</p>}
    {calls.map((c, k) => <ModelCall key={c.seq} c={c} first={k === 0} models={d.models} decisionApi={d.decision_api}/>)}
  </div>;
}

function QuestionTypes({ trace, calls }) {
  const defs = trace?.data?.question_types;
  if (!defs) return null;
  const used = [...new Set(calls.flatMap(c => Object.values(c.questions || {}).map(q => q.type)))];
  return <div className="lf-qtypes"><h4>question_type</h4>
    {(used.length ? used : Object.keys(defs)).map(t => <div key={t}><span className={'lf-qtype ' + t}>{t}</span><span>{defs[t]}</span></div>)}</div>;
}

function NodePopover({ view, fixed, node, index, rect, unit = null, tab: firstTab, trace, onIndustry, busy, error, close, onSave, onDelete, onSwitch, onImageSearch }) {
  const ref = useRef(null), [draft, setDraft] = useState(node), [place, setPlace] = useState(null);
  const dec = view.decision?.[node.module], [tab, setTab] = useState(dec && firstTab === 'decision' ? 'decision' : 'llm');
  useOutside(ref, close);
  const units = unitsOf(view), focus = unit && units.find(u => u.id === unit);
  if (focus) return <UnitPopover view={view} node={node} unit={focus} rect={rect} busy={busy} error={error} close={close} onSave={onSave} popRef={ref}/>;
  const callsOf = branch => (trace?.data?.[branch]?.calls || []).filter(c => c.module === node.module);
  const decNow = index >= 0 ? dec : null;
  const canSplit = units.length >= 2 && view.flow.nodes.some(n => n.module === 'write');
  const isFan = FAN.includes(node.module);
  const spec = view.modules[draft.module], inputs = view.flow.inputs, logic = view.logic?.[draft.module] || { steps: [], builtin: [] };
  const tmap = Object.fromEntries((view.tools || []).map(t => [t.key, t]));
  const taken = new Set(view.flow.nodes.filter((_, k) => k !== index).map(n => n.module));
  const choices = Object.entries(view.modules).filter(([m, s]) => m === node.module || (!s.fixed && !FAN.includes(m) && !(m === 'write' && FAN.some(x => taken.has(x))) && (!s.single || !taken.has(m))));
  useLayoutEffect(() => {
    const h = ref.current.offsetHeight, w = ref.current.offsetWidth, gap = 14;
    const left = rect.left - w - gap >= 8 ? rect.left - w - gap : Math.max(8, rect.left - w - gap);
    const top = clamp(rect.top + rect.height / 2 - h / 2, 8, innerHeight - h - 8);
    setPlace({ left, top, arrow: clamp(rect.top + rect.height / 2 - top, 18, h - 18) });
  }, [draft.module, rect.top, rect.left, tab, !!trace?.data]);
  const setModule = module => setDraft(d => {
    const s = view.modules[module], base = view.base.nodes.find(n => n.module === module);
    const next = { id: d.id, module, ...(d.label ? { label: d.label } : {}) };
    if (s.prompt) Object.assign(next, { prompt: d.prompt ?? base?.prompt ?? '', reads: d.reads ?? inputs.map(i => i.param) });
    if (s.tools && d.tools?.length) next.tools = d.tools;
    return next;
  });
  const changed = JSON.stringify(draft) !== JSON.stringify(node) || index < 0;
  const invalid = draft.module === 'agent' && !(draft.prompt || '').trim();
  const attachable = (view.tools || []).filter(t => !t.off && !(draft.tools || []).includes(t.key));
  return <div ref={ref} className="lf-pop" role="dialog" aria-label={(draft.label || spec.label) + ' 단계'} style={place ? { left: place.left, top: place.top } : { left: -9999, top: 0 }}>
    {place && <i className="lf-pop-arrow" style={{ top: place.arrow }}/>}
    <header><span className={'lf-node-icon ' + spec.kind}><Glyph d={ICON[spec.kind]} size={13}/></span>
      <div><strong>{draft.label || spec.label}</strong><small>{spec.kind === 'llm' ? 'LLM · ' + spec.stage : '코드 단계'}</small></div>
      <button type="button" className="lf-icon" aria-label="단계 팝업 닫기" onClick={close}><Glyph d={X} size={13}/></button></header>
    {decNow && <div className="lf-tabs" role="tablist" aria-label="분기">
      <button type="button" role="tab" aria-selected={tab === 'llm'} onClick={() => setTab('llm')}>LLM</button>
      <button type="button" role="tab" aria-selected={tab === 'decision'} onClick={() => setTab('decision')}>Decision
        <span className={'lf-dec-state' + (decNow.active ? ' on' : '')} title={decNow.off || decNow.task}>{decState(decNow)}</span></button>
    </div>}
    <div className="lf-pop-body">
      {error && <ErrorBox error={error}/>}
      {index >= 0 && <IoBlock io={view.io?.[node.id]}/>}
      {node.module === 'pictures' && <Button icon="search" onClick={onImageSearch}>이미지 검색 로직</Button>}
      {tab === 'decision' && decNow ? <>
        <DecisionBlock dec={decNow}/>
        <QuestionTypes trace={trace} calls={callsOf('decision')}/>
        <ModelInputs trace={trace} calls={callsOf('decision')} onIndustry={onIndustry} branch="decision"/>
      </> : <>
      {(canSplit && node.module === 'write' || isFan) && index >= 0 && <div className="lf-switch">
        <span>{isFan ? `요소 ${units.length}개를 따로 쓰고 모읍니다` : `요소 ${units.length}개 · 지금은 한 번에 씀`}</span>
        <Button disabled={busy} onClick={() => onSwitch(!isFan)}>{isFan ? '한 번에 쓰기' : '요소별로 나눠 쓰기'}</Button></div>}
      {node.module === 'split' && <ul className="lf-units">{units.map(u => <li key={u.id}><b>{u.label}</b><span>{ENTITY[u.entity] || u.entity}</span><small>칸 {u.writable.join(' · ')}</small></li>)}
        {view.elements?.frame?.length > 0 && <li className="frame"><b>장 전체</b><span>제목 · 부제</span><small>칸 {view.elements.frame.join(' · ')}</small></li>}</ul>}
      {!spec.fixed && !isFan && <div className="lf-form-row">
        <label>모듈<select aria-label="모듈" value={draft.module} onChange={e => setModule(e.target.value)}>{choices.map(([m, s]) => <option key={m} value={m}>{s.label} · {s.kind === 'llm' ? 'LLM' : '코드'}</option>)}</select></label>
        <label>이름<input aria-label="단계 이름" value={draft.label || ''} placeholder={spec.label} maxLength={40} onChange={e => setDraft(d => { const v = e.target.value; const { label, ...rest } = d; return v ? { ...rest, label: v } : rest; })}/></label>
      </div>}
      {spec.prompt && <fieldset className="lf-reads"><legend>읽는 입력</legend>
        {inputs.map(i => <label key={i.param} className={'lf-chip' + ((draft.reads || []).includes(i.param) ? ' on' : '')}><input type="checkbox" checked={(draft.reads || []).includes(i.param)}
          onChange={e => setDraft(d => ({ ...d, reads: e.target.checked ? [...(d.reads || []), i.param] : (d.reads || []).filter(p => p !== i.param) }))}/>{i.param}</label>)}
      </fieldset>}
      {(spec.tools || logic.builtin.length > 0) && <fieldset className="lf-reads lf-tools-pick"><legend>도구 · tool calling</legend>
        {logic.builtin.map(k => <span key={k} className="lf-chip tool builtin" title={(tmap[k]?.desc || '') + ' · 파이프라인 안에서 늘 부름'}><Glyph d={LOCK} size={10}/>{tmap[k]?.label || k}</span>)}
        {(draft.tools || []).map(k => <span key={k} className="lf-chip tool on">{tmap[k]?.label || k}<button type="button" aria-label={(tmap[k]?.label || k) + ' 도구 빼기'} onClick={() => setDraft(d => ({ ...d, tools: d.tools.filter(t => t !== k) }))}><Glyph d={X} size={9}/></button></span>)}
        {spec.tools && <select className="lf-add" aria-label="도구 붙이기" value="" disabled={!attachable.length} onChange={e => e.target.value && setDraft(d => ({ ...d, tools: [...(d.tools || []), e.target.value] }))}>
          <option value="">+ 도구</option>{attachable.map(t => <option key={t.key} value={t.key}>{t.label} · {t.key}</option>)}</select>}
      </fieldset>}
      {spec.prompt && <label className="lf-prompt">프롬프트<textarea aria-label="프롬프트" rows={draft.module === 'agent' ? 7 : 6} maxLength={4000} value={draft.prompt || ''} onChange={e => setDraft(d => ({ ...d, prompt: e.target.value }))}/><small>{(draft.prompt || '').length} / 4000</small></label>}
      {logic.steps.length > 0 && <div className="lf-logic"><h4>로직</h4>
        {logic.steps.map((s, k) => <div key={k} className="lf-logic-row"><code title={s.db}>{s.db}</code><span><em>가져옴</em>{s.objects}</span><span><em>처리</em>{s.do}</span></div>)}
        {draft.module === 'lock' && <p className="lf-facts-line"><Glyph d={LOCK} size={12}/>AI 잠금 영역 {fixed?.n ?? 0} / {fixed?.total ?? 0}</p>}
        {spec.loop && <p className="lf-facts-line"><Glyph d={LOOP} size={12}/>{spec.loop}</p>}
      </div>}
      {draft.module === 'collect' && <ul className="lf-facts">{inputs.map(i => <li key={i.param}><code>{i.param}</code><span>{view.sources.find(s => s.key === i.source)?.label || i.source}</span>{i.required && <b>필수</b>}</li>)}</ul>}
      {index >= 0 && (spec.kind === 'llm' || callsOf('llm').length > 0) && <ModelInputs trace={trace} calls={callsOf('llm')} onIndustry={onIndustry} branch="llm"/>}
      </>}
    </div>
    {!spec.fixed && <footer>{index >= 0 && !isFan && <Button variant="danger" disabled={busy} onClick={onDelete}>단계 삭제</Button>}<span className="lf-spacer"/><Button disabled={busy} onClick={close}>취소</Button>
      <Button variant="primary" busy={busy} disabled={!changed || invalid} onClick={() => onSave(draft)}>{index < 0 ? '추가' : '저장'}</Button></footer>}
  </div>;
}

// 요소 하나 — 맡은 칸 · 담당(요구 · 제품 · 솔루션 · 공간 …) · 이 요소만의 지시(비우면 요소별 작성의 공통 지시)
function UnitPopover({ view, node, unit, rect, busy, error, close, onSave, popRef }) {
  const own = (node.units || []).find(u => u.id === unit.id)?.prompt || '';
  const [text, setText] = useState(own), [place, setPlace] = useState(null);
  useLayoutEffect(() => {
    const h = popRef.current.offsetHeight, w = popRef.current.offsetWidth, gap = 14;
    const left = Math.max(8, rect.left - w - gap), top = clamp(rect.top + rect.height / 2 - h / 2, 8, innerHeight - h - 8);
    setPlace({ left, top, arrow: clamp(rect.top + rect.height / 2 - top, 18, h - 18) });
  }, [rect.top, rect.left]);
  const save = () => {
    const rest = (node.units || []).filter(u => u.id !== unit.id);
    onSave({ ...node, units: text.trim() ? [...rest, { id: unit.id, prompt: text.trim() }] : rest });
  };
  return <div ref={popRef} className="lf-pop" role="dialog" aria-label={`요소 ${unit.label}`} style={place ? { left: place.left, top: place.top } : { left: -9999, top: 0 }}>
    {place && <i className="lf-pop-arrow" style={{ top: place.arrow }}/>}
    <header><span className="lf-node-icon llm"><Glyph d={ICON.llm} size={13}/></span>
      <div><strong>요소 {unit.label}</strong><small>{ENTITY[unit.entity] || unit.entity} · 칸 {unit.writable.length} · auto_unit_fill</small></div>
      <button type="button" className="lf-icon" aria-label="요소 팝업 닫기" onClick={close}><Glyph d={X} size={13}/></button></header>
    <div className="lf-pop-body">
      {error && <ErrorBox error={error}/>}
      <ul className="lf-facts"><li><code>칸</code><span>{unit.writable.join(' · ')}</span></li>
        {unit.imgs?.length > 0 && <li><code>사진</code><span>{unit.imgs.join(' · ')}</span></li>}
        <li><code>담당</code><span>{ENTITY[unit.entity] || unit.entity}</span></li></ul>
      <label className="lf-prompt">이 요소 지시<textarea aria-label="이 요소 지시" rows={5} maxLength={4000} value={text} placeholder={node.prompt || ''} onChange={e => setText(e.target.value)}/>
        <small>{text.length} / 4000</small></label>
    </div>
    <footer><span className="lf-spacer"/><Button disabled={busy} onClick={close}>취소</Button>
      <Button variant="primary" busy={busy} disabled={text.trim() === own.trim()} onClick={save}>저장</Button></footer>
  </div>;
}

// ---------------------------------------------------------------- 도구 (레이아웃 관리 홈)
const DEFAULT_CONFIG = { rag: { collection: 'dss', top_k: 5, query: '{layout} {part}' }, search: { collection: 'catalog', limit: 6, query: '{part}' },
  web_search: { engines: ['korea', 'mk'], limit: 6, query: '{industry} {part}' }, db_lookup: { limit: 8, query: '{part}' } };
export function ToolsDialog({ close }) {
  const [data, setData] = useState(null), [rows, setRows] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [trial, setTrial] = useState({ key: '', query: '', result: null, busy: false });
  const load = () => api('/layout-library/tools').then(v => { setData(v); setRows(v.tools.map(t => ({ ...t, configText: JSON.stringify(t.config) }))); setError(''); }, e => setError(e.message));
  useEffect(() => { load(); }, []);
  const set = (k, patch) => setRows(rs => rs.map((r, n) => n === k ? { ...r, ...patch } : r));
  const payload = () => rows.map(r => ({ key: r.key, label: r.label, type: r.type, desc: r.desc || '', off: !!r.off, config: JSON.parse(r.configText) }));
  const dirty = data && rows && JSON.stringify(rows.map(r => ({ ...r, config: undefined }))) !== JSON.stringify(data.tools.map(t => ({ ...t, config: undefined, configText: JSON.stringify(t.config) })));
  async function submit() {
    setBusy(true); setError('');
    try {
      let tools; try { tools = payload(); } catch { throw new Error('설정(config)은 JSON 이어야 합니다.'); }
      const v = await api('/layout-library/tools', { method: 'PUT', body: JSON.stringify({ rev: data.rev, confirmed: true, tools }) });
      setData(v); setRows(v.tools.map(t => ({ ...t, configText: JSON.stringify(t.config) })));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function run(row) {
    setTrial(t => ({ ...t, key: row.key, busy: true, result: null }));
    try {
      let config; try { config = JSON.parse(row.configText); } catch { throw new Error('설정(config)은 JSON 이어야 합니다.'); }
      const q = trial.query.trim() || '외식 프랜차이즈 메뉴보드';
      const r = await api('/layout-library/tools/try', { method: 'POST', body: JSON.stringify({ confirmed: true, query: q, tool: { key: row.key, type: row.type, config } }) });
      setTrial(t => ({ ...t, query: q, busy: false, result: r }));
    } catch (e) { setTrial(t => ({ ...t, busy: false, result: { error: e.message, results: [] } })); }
  }
  return <Modal wide title="도구" subtitle="LLM 단계가 부르는 재사용 도구" close={busy ? () => {} : close}
    footer={<><select className="lf-add" aria-label="도구 추가" value="" disabled={busy || !rows} onChange={e => { const typ = e.target.value; if (!typ) return; setRows(rs => [...rs, { key: '', label: '', type: typ, desc: '', off: false, base: false, configText: JSON.stringify(DEFAULT_CONFIG[typ]) }]); }}>
      <option value="">+ 도구 추가</option>{data && Object.entries(data.types).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</select>
      <span className="lf-spacer"/><Button disabled={busy} onClick={close}>닫기</Button><Button variant="primary" busy={busy} disabled={!dirty} onClick={submit}>저장</Button></>}>
    {error && <ErrorBox error={error}/>}
    {!rows ? <Loading/> : <div className="lf-toolsx">
      <label className="lf-try-q">시험 질의<input aria-label="시험 질의" value={trial.query} placeholder="외식 프랜차이즈 메뉴보드" onChange={e => setTrial(t => ({ ...t, query: e.target.value }))}/></label>
      {rows.map((r, k) => <div key={k} className={'lf-tool-row' + (r.off ? ' off' : '')}>
        <div className="lf-tool-head">
          {r.base ? <code>{r.key}</code> : <input aria-label="도구 키" value={r.key} placeholder="new_tool" onChange={e => set(k, { key: e.target.value.trim() })}/>}
          <input aria-label={(r.key || '새 도구') + ' 이름'} value={r.label} maxLength={40} onChange={e => set(k, { label: e.target.value })}/>
          <span className={'lf-tool-type ' + r.type}>{data.types[r.type]?.label || r.type}</span>
          <span className="lf-tool-used" title={(data.used[r.key] || []).join(', ')}>{(data.used[r.key] || []).length ? `레이아웃 ${(data.used[r.key] || []).length}` : ''}</span>
          <Button disabled={trial.busy && trial.key === r.key} busy={trial.busy && trial.key === r.key} onClick={() => run(r)}>시험</Button>
          <Toggle checked={!r.off} label={(r.key || '새 도구') + ' 사용'} onChange={v => set(k, { off: !v })}/>
          {!r.base && <button type="button" className="lf-x" aria-label={(r.key || '새 도구') + ' 삭제'} onClick={() => setRows(rs => rs.filter((_, n) => n !== k))}><Glyph d={X} size={11}/></button>}
        </div>
        <div className="lf-tool-body">
          <input className="lf-mono" aria-label={(r.key || '새 도구') + ' 설정'} value={r.configText} spellCheck={false} onChange={e => set(k, { configText: e.target.value })}/>
          <input aria-label={(r.key || '새 도구') + ' 설명'} value={r.desc || ''} maxLength={200} onChange={e => set(k, { desc: e.target.value })}/>
          {r.db && <small className="lf-tool-db" title={r.db}>{r.db}</small>}
        </div>
        {trial.key === r.key && trial.result && <div className="lf-try">{trial.result.error ? <p className="lf-json-error">{trial.result.error}</p> : !trial.result.results.length ? <p className="lf-facts-line">결과 없음</p>
          : trial.result.results.map((x, n) => <div key={n}><b>{x.title}</b><span>{x.text}</span>{x.ref && <code>{x.ref}</code>}</div>)}</div>}
      </div>)}
    </div>}
  </Modal>;
}

export function SourcesDialog({ close, onSaved }) {
  const [data, setData] = useState(null), [rows, setRows] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const load = () => api('/layout-library/sources').then(v => { setData(v); setRows(v.sources.map(s => ({ ...s }))); setError(''); }, e => setError(e.message));
  useEffect(() => { load(); }, []);
  const set = (k, patch) => setRows(rs => rs.map((r, n) => n === k ? { ...r, ...patch } : r));
  const dirty = data && rows && JSON.stringify(rows) !== JSON.stringify(data.sources);
  async function submit() {
    setBusy(true); setError('');
    try {
      const v = await api('/layout-library/sources', { method: 'PUT', body: JSON.stringify({ rev: data.rev, confirmed: true, sources: rows.map(({ key, label, type, group, supply, desc, off }) => ({ key, label, type, group, supply, desc, off: !!off })) }) });
      setData(v); setRows(v.sources.map(s => ({ ...s }))); onSaved?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <Modal wide title="입력 소스" subtitle="Storyboard 에서 레이아웃이 받을 수 있는 정보" close={busy ? () => {} : close}
    footer={<><Button icon="plus" disabled={busy || !rows} onClick={() => setRows(rs => [...rs, { key: '', label: '', type: 'text', group: 'extract', supply: 'external', desc: '', base: false, off: false }])}>소스 추가</Button><span className="lf-spacer"/><Button disabled={busy} onClick={close}>닫기</Button><Button variant="primary" busy={busy} disabled={!dirty} onClick={submit}>저장</Button></>}>
    {error && <ErrorBox error={error}/>}
    {!rows ? <Loading/> : <div className="lf-sources">{Object.entries(data.groups).map(([g, name]) => {
      const list = rows.map((r, k) => [r, k]).filter(([r]) => r.group === g);
      return list.length > 0 && <section key={g}><h4>{name}<span>{list.length}</span></h4>
        <div className="lf-src-head" aria-hidden="true"><span>키</span><span>이름</span><span>분류</span><span>형식</span><span>공급</span><span>설명</span><span>사용</span></div>
        {list.map(([r, k]) => <div key={k} className={'lf-src-row' + (r.off ? ' off' : '')}>
          {r.base ? <code title={r.key}>{r.key}</code> : <input aria-label="소스 키" value={r.key} placeholder="new_source" onChange={e => set(k, { key: e.target.value.trim() })}/>}
          <input aria-label={(r.key || '새 소스') + ' 이름'} value={r.label} maxLength={40} onChange={e => set(k, { label: e.target.value })}/>
          {r.base ? <span className="lf-src-group">{name}</span> : <select aria-label={(r.key || '새 소스') + ' 분류'} value={r.group} onChange={e => set(k, { group: e.target.value })}>{Object.entries(data.groups).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
          <select aria-label={(r.key || '새 소스') + ' 형식'} value={r.type} onChange={e => set(k, { type: e.target.value })}>{data.types.map(t => <option key={t} value={t}>{t}</option>)}</select>
          <select aria-label={(r.key || '새 소스') + ' 공급'} value={r.supply} onChange={e => set(k, { supply: e.target.value })}>{Object.entries(data.supply).map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select>
          <input aria-label={(r.key || '새 소스') + ' 설명'} value={r.desc} maxLength={200} onChange={e => set(k, { desc: e.target.value })}/>
          <span className="lf-src-use">{r.always ? <span className="lf-pin" title="필수 입력"><Glyph d={LOCK} size={11}/></span> : <Toggle checked={!r.off} label={(r.key || '새 소스') + ' 사용'} onChange={v => set(k, { off: !v })}/>}
            {!r.base && <button type="button" className="lf-x" aria-label={(r.key || '새 소스') + ' 삭제'} onClick={() => setRows(rs => rs.filter((_, n) => n !== k))}><Glyph d={X} size={11}/></button>}</span>
        </div>)}
      </section>;
    })}</div>}
  </Modal>;
}
