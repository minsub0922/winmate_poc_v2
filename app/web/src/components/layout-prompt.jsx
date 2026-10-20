import {FeedbackPopup} from './feedback-popup.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './common.jsx';
import { fillReady } from '../services/fill.js';
import { detectLayoutRepeats } from '../services/layout-repeat.js';
import { layoutFingerprint, suggestLayoutPrompts, planLayoutEdit, executeLayoutEdit } from '../services/layout-prompt.js';
import { actionView } from '../services/layout-actions.js';
import { useWorkContext } from '../services/customer-voice-context.js';

const ISSUE = { target_missing: '변경할 대상을 구체적으로 지정해 주세요.', asset_missing: '현재 이미지 후보에서 대상을 찾지 못했어요.', unsupported: '현재 지원하는 레이아웃 조작 범위를 벗어난 요청이에요.', split_reflow: '반복 영역 재배치와 그 안의 개별 수정은 나누어 요청해 주세요.' };
function ActionPopover({ plan, busy, progress, error, onApprove, onCancel }) {
  const cancelRef = useRef(null);
  useEffect(() => { cancelRef.current?.focus({ preventScroll: true }); }, [plan]);
  return <div className="ed-action-popover" role="dialog" aria-modal="false" aria-label="레이아웃 변경 작업 확인" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); } }}>
    <div className="ed-action-head"><strong>변경 작업 확인 <span>{plan.actions.length}개</span></strong><button type="button" className="btn btn-sm btn-icon" aria-label="변경 작업 취소" onClick={onCancel}><Icon name="x" size={14} /></button></div>
    <ol className="ed-action-list">{plan.actions.map(a => {
      const view = actionView(a, plan.evidence), oldCount = a.type === 'reflow' ? plan.evidence.targets[a.values.target].count : 0;
      return <li key={a.id} data-action-type={a.type}><div className="ed-action-label"><b>{view.title}</b><span>{view.target}</span></div>
        <dl>{view.rows.map((row, i) => <React.Fragment key={i}><dt>{row.label}</dt><dd>{row.value}</dd></React.Fragment>)}</dl>
        {view.asset && <img className="ed-action-image" src={view.asset.src} alt={view.asset.label} />}
        {a.type === 'reflow' && a.values.count !== oldCount && <small>{a.values.count < oldCount ? `뒤의 ${oldCount - a.values.count}개 항목을 제거합니다.` : `${a.values.count - oldCount}개의 빈 입력 칸을 추가합니다.`}</small>}
      </li>;
    })}</ol>
    {error && <p className="ed-reflow-error ed-action-error" role="alert">{error}</p>}
    <div className="ed-action-footer">{busy ? <span role="status"><span className="spin" />{progress}</span> : <small>승인하면 이 작업만 실행합니다.</small>}
      <div><button ref={cancelRef} type="button" className="btn btn-sm" onClick={onCancel}>{busy ? '작업 취소' : '취소'}</button><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onApprove}>승인</button></div></div>
  </div>;
}
export function LayoutPromptAgent({ getRoot, meta, context = {}, onApply, onBusy, onPrepare }) {
  const [input, setInput] = useState(''), [prompts, setPrompts] = useState([]), [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState(''), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [plan, setPlan] = useState(null), [busy, setBusy] = useState(''), [progress, setProgress] = useState(''), [units, setUnits] = useState([]);
  useWorkContext('layout_agent', () => ({ f: meta?.f, input, busy, progress, status, error, suggesting, suggestError, prompts,
    plan: plan ? { status: plan.status, actions: plan.actions, issues: plan.issues, fingerprint: plan.fingerprint } : null }));
  const current = useRef({}); current.current = { getRoot, meta, context, onApply, onBusy, onPrepare };
  const alive = useRef(false), running = useRef(false), controller = useRef(null), suggestions = useRef(null), inputRef = useRef(null);
  const contextKey = JSON.stringify(context), recommendedFor = useRef(''), needsSuggestions = useRef(false);
  const refresh = async () => {
    const { getRoot, meta, context } = current.current, root = getRoot(); if (!root) return;
    suggestions.current?.abort(); const task = new AbortController(); suggestions.current = task;
    recommendedFor.current = layoutFingerprint(root); needsSuggestions.current = false;
    const key = JSON.stringify(context); setSuggesting(true); setSuggestError(''); setPrompts([]);
    try {
      await fillReady(root); if (!alive.current || task.signal.aborted) return;
      const before = layoutFingerprint(root); recommendedFor.current = before;
      const result = await suggestLayoutPrompts(root, { meta, context, signal: task.signal });
      if (alive.current && !task.signal.aborted && before === layoutFingerprint(current.current.getRoot()) && key === JSON.stringify(current.current.context)) setPrompts(result);
    } catch (e) { if (alive.current && !task.signal.aborted) setSuggestError('추천을 불러오지 못했어요. 직접 요청하거나 다시 불러와 주세요.'); }
    finally { if (alive.current && suggestions.current === task) setSuggesting(false); }
  };
  useEffect(() => {
    alive.current = true; let frame, observer, timer, suggestionTimer;
    const start = () => {
      const root = current.current.getRoot(); if (!root) { frame = requestAnimationFrame(start); return; }
      const read = () => {
        const r = current.current.getRoot(); if (!r) return;
        setUnits(detectLayoutRepeats(r, current.current.meta).targets.map(t => `${t.label} ${t.count}개`));
        if (recommendedFor.current && recommendedFor.current !== layoutFingerprint(r)) {
          suggestions.current?.abort(); setPrompts([]); setSuggesting(false); needsSuggestions.current = true; clearTimeout(suggestionTimer);
          suggestionTimer = setTimeout(() => { if (!running.current && needsSuggestions.current) refresh(); }, 1000);
        }
      };
      read(); refresh(); observer = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(read, 160); });
      observer.observe(root.parentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    };
    start();
    return () => { alive.current = false; observer?.disconnect(); clearTimeout(timer); clearTimeout(suggestionTimer); cancelAnimationFrame(frame); controller.current?.abort(); suggestions.current?.abort(); };
  }, [meta?.f, contextKey]);
  const begin = stage => {
    if (running.current) return false;
    running.current = true; current.current.onPrepare?.(); suggestions.current?.abort(); setSuggesting(false);
    controller.current = new AbortController(); setBusy(stage); current.current.onBusy?.(true); setError(''); setStatus(''); return true;
  };
  const finish = () => { running.current = false; if (alive.current) { setBusy(''); setProgress(''); current.current.onBusy?.(false); if (needsSuggestions.current) refresh(); } };
  const fail = e => {
    if (!alive.current) return;
    if (controller.current?.signal.aborted || e.code === 'cancelled') { setStatus('작업 취소됨'); setPlan(null); }
    else { if (e.code === 'stale_layout') setPlan(null); setError(['invalid_json', 'invalid_output'].includes(e.code) ? '변경 작업을 정확히 구조화하지 못했어요. 대상을 구체적으로 지정해 다시 요청해 주세요.' : e.message || '요청을 처리하지 못했어요.'); }
  };
  const submit = async event => {
    event?.preventDefault(); const prompt = input.trim(); if (!prompt || !current.current.getRoot() || !begin('extracting')) return;
    setPlan(null); setProgress('요청을 변경 작업으로 변환하는 중…');
    try {
      const { getRoot, meta, context } = current.current;
      const result = await planLayoutEdit(getRoot(), { meta, context, prompt, signal: controller.current.signal });
      if (!alive.current || controller.current.signal.aborted) return;
      if (result.fingerprint !== layoutFingerprint(current.current.getRoot()) || result.contextKey !== JSON.stringify(current.current.context)) throw Object.assign(new Error('작업 추출 중 레이아웃이나 요구사항이 바뀌었어요. 다시 요청해 주세요.'), { code: 'stale_layout' });
      if (result.status === 'ready') { setPlan(result); setInput(''); }
      else setError(result.issues.map(i => [ISSUE[i.code], i.reference].filter(Boolean).join(' ')).join(' · '));
    } catch (e) { fail(e); } finally { finish(); }
  };
  const approve = async () => {
    if (!plan || !begin('executing')) return;
    try {
      const { getRoot, meta, context } = current.current, source = getRoot();
      const result = await executeLayoutEdit(source, plan, { meta, context, signal: controller.current.signal, onProgress: p => { if (alive.current) setProgress(p); } });
      if (!alive.current || controller.current.signal.aborted) return;
      if (source !== current.current.getRoot() || plan.fingerprint !== layoutFingerprint(current.current.getRoot()) || plan.contextKey !== JSON.stringify(current.current.context)) throw Object.assign(new Error('적용 전에 레이아웃이나 요구사항이 바뀌었어요. 다시 요청해 주세요.'), { code: 'stale_layout' });
      current.current.onApply(result); setPlan(null); setStatus(`변경 작업 ${result.actionCount}개 적용 완료 · 되돌리기 가능`); refresh();
    } catch (e) { fail(e); } finally { finish(); }
  };
  const cancel = () => {
    if (running.current) { controller.current?.abort(); return; }
    setPlan(null); setStatus('변경 작업 취소됨'); setError(''); inputRef.current?.focus();
  };
  return <section className="ed-agent" aria-label="프롬프트로 레이아웃 수정" aria-busy={!!busy}>
    <div className="ed-agent-top"><strong><Icon name="sparkle" size={14} />레이아웃 에이전트</strong><span className="ed-agent-units">{units.join(' · ')}</span><button type="button" className="btn btn-sm" disabled={!!busy || suggesting} onClick={refresh} aria-label="추천 프롬프트 새로고침">추천 새로고침</button></div>
    <FeedbackPopup message={status} kind="info"/><FeedbackPopup message={!plan?error:""}/><FeedbackPopup message={busy&&!plan?progress:""} kind="progress" actionLabel="작업 취소" onAction={cancel}/>
    <div className="ed-agent-prompts" aria-label="추천 프롬프트">{suggesting ? <FeedbackPopup message="현재 장과 요구사항에 맞는 요청 3개를 추천하는 중…" kind="progress"/> : prompts.map((s, i) => <button type="button" key={i} disabled={!!busy} onClick={() => { setInput(s); inputRef.current?.focus(); }}>{s}</button>)}<FeedbackPopup message={suggestError}/></div>
    <div className="ed-agent-composer">
      {plan && <ActionPopover plan={plan} busy={busy === 'executing'} progress={progress} error={error} onApprove={approve} onCancel={cancel} />}
      <form className="ed-agent-form" onSubmit={submit}><textarea ref={inputRef} className="input" aria-label="레이아웃 수정 요청" value={input} rows={2} maxLength={2000} disabled={!!busy} placeholder="옮기기, 글·이미지 추가, 문구 수정, 이미지 교체 등을 요청해 보세요." onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} /><button type="submit" className="btn btn-primary" disabled={!!busy || !input.trim()}>요청하기</button></form>
    </div>
  </section>;
}
