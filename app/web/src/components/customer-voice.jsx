import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, toast } from './common.jsx';
import { postJson } from '../api/client.js';
import { requireLogin } from '../api/session.js';
import { captureWorkContext, watchWorkFocus } from '../services/customer-voice-context.js';
import '../styles/customer-voice.css';

const snapshot = route => { try { return captureWorkContext(route); } catch (error) { return { captured_at: new Date().toISOString(), route: { name: route.name, id: route.id }, work: { type: route.name, id: route.id }, path: location.pathname, capture_error: error.message }; } };
function VoicePopup({ slot, anchor, text, onText, busy, error, onClose, onSend }) {
  const root = useRef(null), input = useRef(null), [position, setPosition] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    const place = () => {
      if (!slot.current || !root.current) return;
      const side = slot.current.closest('.sidebar').getBoundingClientRect(), button = slot.current.getBoundingClientRect(), popup = root.current.getBoundingClientRect();
      setPosition({ left: Math.max(12, Math.min(side.right + 12, innerWidth - popup.width - 12)), top: Math.max(12, Math.min(button.bottom - popup.height, innerHeight - popup.height - 12)) });
    };
    place(); const observer = new ResizeObserver(place); observer.observe(slot.current.closest('.sidebar')); observer.observe(root.current);
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    input.current?.focus({ preventScroll: true });
    return () => { observer.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, []);
  useEffect(() => {
    const outside = event => { if (!root.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose(false); };
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(true); }
    };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', key, true); };
  }, [onClose]);
  return createPortal(<section ref={root} id="customer-voice-popup" className="voice-popup" data-customer-voice role="dialog" aria-modal="false" aria-label="사용자님의 목소리" style={position}>
    <header><div><span>WINMATE FEEDBACK</span><h2>사용자님의 목소리</h2></div><button type="button" className="btn btn-ghost btn-icon" aria-label="의견 창 닫기" onClick={() => onClose(true)}><Icon name="x" size={17}/></button></header>
    <p>사용 중 불편한 점이나 바라는 점을 알려주세요.</p>
    <form onSubmit={onSend}>
      <textarea ref={input} aria-label="고객 의견" placeholder="어떤 점을 개선하면 좋을까요?" value={text} onChange={event => onText(event.target.value)} maxLength={5000} rows={6} disabled={busy}
        onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) onSend(event); }}/>
      {error && <p className="voice-error" role="alert">{error}</p>}
      <footer><small>현재 작업 정보도 함께 전달됩니다.</small><button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>{busy ? <span className="spin"/> : <Icon name="arrowR" size={15}/>}<span>{busy ? '보내는 중…' : 'Send'}</span></button></footer>
    </form>
  </section>, document.body);
}

export function CustomerVoiceButton({ route }) {
  const slot = useRef(null), anchor = useRef(null), opened = useRef(null), pending = useRef(null), working = useRef(false);
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [lift, setLift] = useState(false), [rect, setRect] = useState(null);
  useEffect(watchWorkFocus, []);
  // Keep the same sidebar button reachable while a full-screen work/editor dialog is open.
  useLayoutEffect(() => {
    const place = () => {
      const box = slot.current?.getBoundingClientRect(); if (!box) return;
      const side = slot.current.closest('.sidebar').getBoundingClientRect(), width = Math.max(0, Math.min(box.width, side.right - box.left - 12));
      setRect(previous => previous && previous.left === box.left && previous.top === box.top && previous.width === width ? previous : { left: box.left, top: box.top, width, height: box.height });
      setLift(!!document.querySelector('.mback,.guide-overlay'));
    };
    place(); const observer = new ResizeObserver(place); observer.observe(slot.current.closest('.sidebar')); observer.observe(slot.current);
    const mutations = new MutationObserver(place); mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { observer.disconnect(); mutations.disconnect(); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, []);
  const close = restore => { setOpen(false); if (restore) requestAnimationFrame(() => anchor.current?.focus({ preventScroll: true })); };
  const send = async event => {
    event?.preventDefault(); if (working.current || !text.trim()) return;
    if (!requireLogin()) { setOpen(false); return; }
    working.current = true; setBusy(true); setError('');
    if (!pending.current) pending.current = { submission_id: crypto.randomUUID?.() || 'voice_' + Date.now().toString(36) + Math.random().toString(36).slice(2), message: text.trim(),
      context: { version: 1, opened: opened.current, current: snapshot(route) } };
    try {
      await postJson('/api/customer-voice', pending.current);
      pending.current = null; setText(''); setOpen(false); toast('의견을 전달했어요. 감사합니다.');
    } catch (failure) { setError(failure.message || '의견을 보내지 못했어요. 다시 시도해 주세요.'); if (failure.status === 401) setOpen(false); }
    finally { working.current = false; setBusy(false); }
  };
  const button = <button ref={anchor} type="button" data-customer-voice className={'sb-voice' + (lift ? ' lifted' : '') + (lift && rect?.width < 150 ? ' compact' : '')} style={lift ? rect : undefined}
    aria-label="사용자님의 목소리" title="사용자님의 목소리" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? 'customer-voice-popup' : undefined}
    onClick={() => { if (open) close(false); else { opened.current = snapshot(route); setOpen(true); } }}>
    <Icon name="chat" size={18}/><span className="sb-tx">사용자님의 목소리</span>
  </button>;
  return <><div ref={slot} className="sb-voice-slot" data-customer-voice data-open={open}>{lift ? createPortal(button, document.body) : button}</div>
    {open && <VoicePopup slot={slot} anchor={anchor} text={text} onText={value => { pending.current = null; setText(value); setError(''); }} busy={busy} error={error} onClose={close} onSend={send}/>}</>;
}
