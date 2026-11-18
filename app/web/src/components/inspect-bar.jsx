// 관리자 읽기 전용 열람 표시 — 관리자 화면의 '웹앱에서 보기'로 연 탭에서만 보인다 (api/inspect.js).
// 넓은 화면: 왼쪽 레일 안의 작은 배지(본문을 가리지 않음) — 올리면 계정 · 만료 시각 · 끝내기가 펼쳐진다.
import React, { useEffect, useState } from 'react';
import { getBootstrap } from '../api/bootstrap.js';
import { inspectSession, onInspectChange, endInspect } from '../api/inspect.js';
import { Icon } from './common.jsx';
import '../styles/inspect.css';

export function InspectBar() {
  const [session, setSession] = useState(inspectSession);
  useEffect(() => onInspectChange(setSession), []);
  if (!session) return null;
  let user = {};
  try { user = getBootstrap().user || {}; } catch { /* bootstrap failed: the error screen says why */ }
  const until = user.inspect?.expires_at ? new Date(user.inspect.expires_at * 1000).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
  const state = session.expired ? '열람 시간 끝남' : '읽기 전용' + (until ? ' · ' + until + '까지' : '');
  return <div className={'inspect-bar' + (session.expired ? ' expired' : '')} role="status" tabIndex={0} aria-label={`관리자 열람 · ${user.username || ''} · ${state}`}>
    <span className="inspect-tag"><Icon name="eye" size={16} />열람</span>
    <div className="inspect-pop">
      <span className="inspect-mark">관리자 열람</span>
      <b title={user.username}>{user.username}</b>
      <span className="inspect-state">{state}</span>
      <button type="button" onClick={endInspect}>끝내기</button>
    </div>
  </div>;
}
