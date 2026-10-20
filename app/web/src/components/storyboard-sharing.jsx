import React, { useEffect, useId, useState } from 'react';
import { ensureShared, connectShared } from '../services/sharing.js';
import { sharedIdentity, storyboardUrl } from '../services/shared-path.js';
import { copyText } from '../platform/runtime.js';
import { Icon, Modal, toast } from './common.jsx';

export function useStoryboardSharing(p) {
  const [state, setState] = useState({ status: 'loading', snapshot: null });
  const [retry, setRetry] = useState(0);
  const identity = sharedIdentity(p);
  useEffect(() => {
    let alive = true, unsubscribe, subscribed;
    const subscribe = session => {
      if (!alive || subscribed === session) return;
      unsubscribe?.(); subscribed = session; unsubscribe = session.subscribe(setState);
    };
    if (identity) subscribe(connectShared(identity.id, { id: p.id }));
    else setState({ status: 'loading', snapshot: null });
    ensureShared(p).then(session => {
      subscribe(session);
    }).catch(error => { if (alive) setState({ status: 'offline', error: error.message, snapshot: null }); });
    return () => { alive = false; unsubscribe?.(); };
  }, [p.id, identity?.id, retry]);
  useEffect(() => {
    if (state.status !== 'offline') return;
    const reconnect = () => setRetry(x => x + 1);
    const timer = setTimeout(reconnect, 5000);
    window.addEventListener('online', reconnect);
    return () => { clearTimeout(timer); window.removeEventListener('online', reconnect); };
  }, [state.status, p._share?.token, retry]);
  return { ...state, retry: () => setRetry(x => x + 1) };
}

const STATUS = { loading: '공유 링크 준비 중…', saving: '변경 저장 중…', synced: '동기화됨', conflict: '변경 충돌', blocked: '저장되지 않은 변경', offline: '연결 확인 필요' };

export function StoryboardSharing({ p, sharing, dialogOnly = false, onClose }) {
  const [dialog, setDialog] = useState(dialogOnly);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const statusId = useId();
  const snapshot = sharing.snapshot;
  const identity = sharedIdentity(p) || sharedIdentity(snapshot);
  const token = identity?.id;
  const url = storyboardUrl(identity);
  const owner = snapshot?.isOwner;
  const unavailable = !url || sharing.httpStatus === 404;
  const canManage = !!snapshot && !['offline', 'loading'].includes(sharing.status);
  const notice = unavailable || sharing.status === 'offline' || !!sharing.error;
  const statusText = [STATUS[sharing.status], sharing.error].filter(Boolean).join('\n');
  const close = () => { setDialog(false); onClose?.(); };
  const share = async () => {
    setDialog(true); setError('');
    if (unavailable) { sharing.retry?.(); return; }
    try { await copyText(url); toast('Storyboard 공유 링크를 복사했어요'); }
    catch { setError('링크를 선택해 직접 복사해 주세요.'); }
  };
  const permission = async value => {
    setBusy(true); setError('');
    try { await connectShared(token).permission(value); toast('공유 권한을 변경했어요'); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  const resolve = async keep => {
    try { await connectShared(token).resolve(keep); }
    catch (error) { setError(error.message); }
  };
  return <>
    {!dialogOnly && <><span className="storyboard-share-control" title={statusText || '공유 링크 복사'} tabIndex={unavailable ? 0 : undefined} aria-describedby={notice ? statusId : undefined}>
      <button className="btn btn-sm" onClick={share} aria-describedby={notice ? statusId : undefined}><Icon name="link" size={15} />공유{notice && <Icon name="alert" size={14} className="share-alert" />}</button>
      {notice && <span id={statusId} className="sr">{statusText}</span>}
    </span>
    </>}
    {dialog && <Modal size="narrow" title="Storyboard 공유" onClose={close}
      sub="링크를 가진 사람이 설정된 권한으로 참여해요. 함께 수정한 내용은 같은 원본에 반영됩니다."
      footer={<><span className="sp" /><button className="btn" onClick={close}>닫기</button><button className="btn btn-primary" disabled={unavailable} onClick={share}>링크 복사</button></>}>
      {sharing.status === 'loading' && <p role="status">공유 링크를 준비하고 있어요.</p>}
      {sharing.status === 'offline' && <div role="alert"><p>{sharing.error}</p><button className="btn btn-sm" onClick={sharing.retry}>다시 시도</button></div>}
      {sharing.status === 'offline' && url && <p className="muted">저장된 공유 링크는 복사할 수 있어요. 최신 변경은 연결이 복구되면 동기화됩니다.</p>}
      <label className="field"><span>공유 링크</span><input className="input" readOnly value={url} aria-label="공유 링크" onFocus={e => e.target.select()} /></label>
      {owner ? <label className="field"><span>링크 접근 권한</span><select aria-label="링크 접근 권한" className="select" disabled={busy || !canManage} value={snapshot.permission} onChange={e => permission(e.target.value)}><option value="view">읽기전용</option><option value="edit">편집가능</option></select></label>
        : <p>{snapshot?.canEdit ? '편집가능' : '읽기전용'} · 접근 권한은 소유자가 변경할 수 있어요.</p>}
      <p className="muted">읽기만 하면 히스토리에 추가되지 않아요. 편집 내용이 저장되면 내 히스토리에도 연결됩니다.</p>
      {sharing.conflict && <><p>{sharing.error}</p><div className="share-conflict-actions"><button className="btn btn-sm" onClick={() => resolve(false)}>서버 변경 사용</button><button className="btn btn-sm" disabled={!snapshot?.canEdit || unavailable} onClick={() => resolve(true)}>내 변경 반영</button></div></>}
      {error && <p role="alert">{error}</p>}
    </Modal>}
  </>;
}
