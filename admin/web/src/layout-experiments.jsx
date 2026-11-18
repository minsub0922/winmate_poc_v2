import React, { useEffect, useId, useRef, useState } from 'react';
import { api } from './api';
import { Button, IconButton, Modal, Loading, ErrorBox, Empty } from './components';
import { FlowGraph } from './layout-flow.jsx';
import './layout-experiments.css';

const status = { idle: '', running: '실행 중', done: '완료', error: '실패', cancelled: '취소됨' };

export function LayoutExperiments({ snapshot, industries, close, Sheet }) {
  const [industry, setIndustry] = useState(snapshot.industry || industries[0]?.code || 'FB');
  const [batches, setBatches] = useState({}), [active, setActive] = useState('1'), [error, setError] = useState('');
  const [inputsOpen, setInputsOpen] = useState(false);
  const picker = useRef(null), pickerButton = useRef(null), pickerId = useId();
  const controllers = useRef(new Map()), pending = useRef(new Set()), alive = useRef(true);
  const batch = batches[industry], current = batch?.samples.find(s => s.id === active);
  const endpoint = `/layout-library/${encodeURIComponent(snapshot.f)}/experiments/`;
  const payload = { draft: snapshot.draft, flow: snapshot.flow };
  const patch = (ind, id, update) => {
    if (alive.current) setBatches(all => ({ ...all, [ind]: { ...all[ind], samples: all[ind].samples.map(s => s.id === id ? { ...s, ...update } : s) } }));
  };
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; for (const c of controllers.current.values()) c.abort(); controllers.current.clear(); };
  }, []);
  const closeInputs = () => { setInputsOpen(false); pickerButton.current?.focus(); };
  useEffect(() => {
    if (!inputsOpen) return;
    const outside = e => { if (!picker.current?.contains(e.target)) setInputsOpen(false); };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeInputs(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key, true); };
  }, [inputsOpen]);

  async function run(ind, sample) {
    const key = `${ind}:${sample.id}`;
    if (controllers.current.has(key)) return;
    let input;
    try { input = JSON.parse(sample.text); }
    catch { patch(ind, sample.id, { status: 'error', error: '입력의 JSON 형식을 확인해 주세요.', html: '' }); return; }
    const controller = new AbortController(); controllers.current.set(key, controller);
    patch(ind, sample.id, { status: 'running', error: '', html: '', issues: [] });
    try {
      const result = await api(endpoint + 'run', { method: 'POST', signal: controller.signal, cache: 'no-store', body: JSON.stringify({ ...payload, input }) });
      patch(ind, sample.id, { status: 'done', html: result.html, issues: result.issues || [] });
    } catch (e) {
      patch(ind, sample.id, { status: e.name === 'AbortError' ? 'cancelled' : 'error', error: e.name === 'AbortError' ? '' : e.message });
    } finally { controllers.current.delete(key); }
  }
  async function load(ind) {
    if (pending.current.has(ind)) return;
    pending.current.add(ind); setError('');
    const controller = new AbortController(), key = 'samples:' + ind;
    controllers.current.set(key, controller);
    try {
      const result = await api(endpoint + 'samples', { method: 'POST', signal: controller.signal, cache: 'no-store', body: JSON.stringify({ ...payload, industry: ind }) });
      if (!alive.current) return;
      const samples = result.samples.map(s => ({ ...s, text: JSON.stringify(s.input, null, 2), selected: true, status: 'idle', html: '' }));
      setBatches(all => ({ ...all, [ind]: { samples, view: result.view } }));
    } catch (e) { if (e.name !== 'AbortError' && alive.current) setError(e.message); }
    finally { pending.current.delete(ind); controllers.current.delete(key); }
  }
  useEffect(() => { if (!batches[industry]) void load(industry); }, [industry]);
  const launch = () => batch.samples.filter(s => s.selected && s.status !== 'running').forEach(s => { void run(industry, s); });
  const edit = text => patch(industry, active, { text, html: '', status: 'idle', error: '', issues: [] });
  const stop = () => controllers.current.get(`${industry}:${active}`)?.abort();
  const selectedLabel = [industries.find(i => i.code === industry)?.name, current?.label].filter(Boolean).join(' · ');

  return <Modal title={`${snapshot.name} · 실험`} wide close={close} telemetryPrivate>
    <div className="le-workspace">
      <aside className="le-left">
        <div className="le-inputs" ref={picker}>
          <div className="le-input-bar">
            <button ref={pickerButton} type="button" className="le-input-trigger" aria-label="실험 입력 선택" aria-haspopup="dialog" aria-expanded={inputsOpen} aria-controls={inputsOpen ? pickerId : undefined} title={selectedLabel} onClick={() => setInputsOpen(open => !open)}>
              <strong>입력</strong><span>{selectedLabel || '샘플 선택'}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
            </button>
            {current?.status === 'running' ? <Button onClick={stop}>실행 취소</Button> : <Button variant="primary" onClick={() => { run(industry, current); setInputsOpen(false); }} disabled={!current}>이 입력 실행</Button>}
          </div>
          {inputsOpen && <div id={pickerId} className="le-input-pop" role="dialog" aria-label="실험 입력 선택 및 편집">
            <div className="le-input-head"><h3>입력</h3><select aria-label="실험 업종" value={industry} onChange={e => { setIndustry(e.target.value); setActive('1'); setError(''); }}>{industries.map(i => <option key={i.code} value={i.code}>{i.name}</option>)}</select><IconButton icon="close" label="입력 선택 닫기" onClick={closeInputs}/></div>
            {error ? <ErrorBox error={error} retry={() => load(industry)}/> : !batch ? <Loading/> : <>
              <div className="le-samples" aria-label="샘플 입력 목록">{batch.samples.map(s => <div key={s.id} className={s.id === active ? 'active' : ''}>
                <input type="checkbox" aria-label={`${s.label} 선택`} checked={s.selected} onChange={e => patch(industry, s.id, { selected: e.target.checked })}/>
                <button type="button" aria-pressed={s.id === active} onClick={() => setActive(s.id)}><span>{s.id}. {s.label}</span><small aria-live="polite">{status[s.status]}</small></button>
              </div>)}</div>
              {current && <textarea className="le-editor" aria-label="샘플 입력 편집" spellCheck={false} value={current.text} disabled={current.status === 'running'} onChange={e => edit(e.target.value)}/>}
              <div className="le-run"><Button disabled={!batch.samples.some(s => s.selected && s.status !== 'running')} onClick={() => { launch(); closeInputs(); }}>선택한 샘플 동시 실행</Button></div>
            </>}
          </div>}
          {error && !inputsOpen && <ErrorBox error={error} retry={() => load(industry)}/>}
        </div>
        {batch && <FlowGraph view={batch.view} fixed={snapshot.fixed} disabled readOnly/>}
      </aside>
      <section className="le-output" aria-label="실험 시트 결과">
        <div className="le-result-head"><h3>시트 결과{current ? ` · ${current.label}` : ''}</h3><span aria-live="polite">{status[current?.status]}</span></div>
        <div className="le-result-sheet">
          {current?.error ? <ErrorBox error={current.error}/> : current?.html ? <Sheet html={current.html} title="실험 시트 결과"/> : current?.status === 'running' ? <div className="le-running" role="status"><span className="loader"/> 시트를 생성하고 있습니다</div> : <Empty title="실행 버튼을 눌러 결과를 확인하세요"/>}
        </div>
      </section>
    </div>
  </Modal>;
}
