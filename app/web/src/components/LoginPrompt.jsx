import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { closeLogin, useSession } from '../api/session.js';
import { requestJson } from '../api/client.js';
import '../styles/login-prompt.css';

export function LoginPrompt({ home }) {
  const { guest, modal } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const card = useRef(null);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    const app = document.querySelector('.app');
    const oldInert = app?.inert;
    if (app) app.inert = true;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    card.current?.querySelector('input')?.focus();
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeLogin(); }
      if (e.key === 'Tab') {
        const fields = [...card.current.querySelectorAll('button:not(:disabled), input')];
        const first = fields[0], last = fields.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key, true);
    return () => { if (app) app.inert = oldInert; document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', key, true); previous?.focus?.(); };
  }, [modal]);
  if (!guest || (!home && !modal)) return null;
  const submit = async e => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      await requestJson('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      setPassword(''); window.location.reload();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return createPortal(<div className={modal ? 'login-layer' : 'login-dock'} data-login-mode={modal ? 'modal' : 'dock'} onMouseDown={e => { if (modal && e.target === e.currentTarget) closeLogin(); }}>
    <section className="login-card" ref={card} role={modal ? 'dialog' : 'region'} aria-modal={modal || undefined} aria-labelledby="login-prompt-title">
      {modal && <button className="login-close" aria-label="로그인 닫기" onClick={closeLogin}>×</button>}
      <span className="login-eyebrow">WELCOME TO WINMATE</span>
      <h2 id="login-prompt-title">{modal ? '로그인하고 이어서 시작하세요' : '로그인하고 제안을 시작하세요'}</h2>
      <p>모든 기능을 자유롭게 둘러보세요.<br />제안서 작성과 AI 작업은 로그인 후 이용할 수 있어요.</p>
      <form onSubmit={submit}>
        <label htmlFor="login-username">아이디</label>
        <input id="login-username" name="username" autoComplete="username" required maxLength={128} value={username} onChange={e => setUsername(e.target.value)} />
        <label htmlFor="login-password">비밀번호</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} />
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
      </form>
      {modal && <button className="login-browse" onClick={closeLogin}>계속 둘러보기</button>}
    </section>
  </div>, document.body);
}
