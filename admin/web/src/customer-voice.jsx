import { useEffect, useState } from 'react';
import { useApp } from './context';
import { Button, Modal, Empty, Loading, ErrorBox, Details, Field, Pager } from './components';
import { number } from './api';
import './customer-voice.css';

const base = '/api/admin/customer-voice';
const names = { new: '접수됨', reviewing: '확인 중', closed: '처리 완료' };
const stamp = value => new Date(value * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
async function request(path, options = {}) {
  const response = await fetch(base + path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail || '고객 의견을 불러오지 못했습니다.');
  return body;
}
export function useVoiceInbox(path = '?limit=1', poll = 3000, version = 0) {
  const [state, setState] = useState({ data: null, error: '' }), [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true, busy = false;
    const controller = new AbortController();
    const load = async () => {
      if (busy) return; busy = true;
      try { const data = await request(path, { signal: controller.signal }); if (alive) setState({ data, error: '' }); }
      catch (error) { if (alive && error.name !== 'AbortError') setState(previous => ({ ...previous, error: error.message })); }
      finally { busy = false; }
    };
    void load(); const timer = poll ? setInterval(() => { if (!document.hidden) void load(); }, poll) : null;
    window.addEventListener('focus', load);
    return () => { alive = false; controller.abort(); clearInterval(timer); window.removeEventListener('focus', load); };
  }, [path, poll, version, revision]);
  return { ...state, refresh: () => setRevision(value => value + 1) };
}
function VoiceDetail({ id, onClose, onChanged }) {
  const result = useVoiceInbox('/' + encodeURIComponent(id), 0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const row = result.data, current = row?.context?.current, opened = row?.context?.opened;
  const change = async status => {
    setBusy(true); setError('');
    try { await request('/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status }) }); result.refresh(); onChanged(); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  return <Modal title="고객 의견 상세" subtitle={row ? row.owner + ' · ' + stamp(row.created_at) : '의견과 작업 상태를 불러옵니다.'} close={onClose} wide footer={<Button onClick={onClose}>닫기</Button>}>
    {result.error ? <ErrorBox error={result.error} retry={result.refresh}/> : !row ? <Loading/> : <>
      <div className="voice-detail-status"><label>처리 상태 <select aria-label="고객 의견 처리 상태" value={row.status} disabled={busy} onChange={event => change(event.target.value)}>{Object.entries(names).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label><span className="quiet">접수 번호 {row.id}</span></div>
      {error && <ErrorBox error={error}/>}
      <p className="voice-message" data-voice-message>{row.message}</p>
      <h3>전송 당시 작업</h3><dl className="field-grid"><Field label="사용자" value={row.owner}/><Field label="화면" value={text(current?.ui?.heading) || text(current?.route?.name)}/><Field label="작업 ID" value={row.work_id}/><Field label="작업 종류 · 상태" value={[row.work_type, row.stage].filter(Boolean).join(' · ')}/><Field label="접속 경로" value={row.path}/><Field label="화면 크기" value={current?.viewport ? `${text(current.viewport.width)} × ${text(current.viewport.height)}` : null}/></dl>
      <h3>스크롤 위치</h3>{current?.scroll ? <div className="table-scroll"><table className="voice-scroll-table"><thead><tr><th>영역</th><th>위 · 왼쪽</th><th>보이는 높이 / 전체 높이</th></tr></thead><tbody><tr><td>브라우저</td><td>{text(current.scroll.window?.y)} · {text(current.scroll.window?.x)}</td><td>—</td></tr>{(Array.isArray(current.scroll.containers) ? current.scroll.containers : []).map((item, index) => <tr key={index}><td><strong>{text(item?.label) || text(item?.path)}</strong></td><td>{text(item?.top)} · {text(item?.left)}</td><td>{text(item?.height)} / {text(item?.contentHeight)}</td></tr>)}</tbody></table></div> : <p className="quiet">스크롤 정보가 없습니다.</p>}
      {current?.capture_limits?.truncated && <p className="voice-capture-note">큰 문서 일부는 크기 제한으로 생략되었습니다. 상세 상태의 capture_limits에서 확인할 수 있습니다.</p>}
      <Details title="선택 요소 · 열린 팝업 · 저장 전 입력값" value={current?.ui}/>
      <Details title="현재 작업 state · Agent 진행 상태" value={{ contexts: current?.contexts, state: current?.state, jobs: current?.jobs, capture_limits: current?.capture_limits }}/>
      <Details title="의견 창을 열었을 때의 작업 상태" value={opened}/>
      <Details title="전달된 전체 상태 JSON" value={row.context}/>
    </>}
  </Modal>;
}
export function CustomerVoicePage() {
  const { version } = useApp();
  const [status, setStatus] = useState(''), [q, setQ] = useState(''), [offset, setOffset] = useState(0), [selected, setSelected] = useState(null);
  const result = useVoiceInbox('?' + new URLSearchParams({ status, q, offset, limit: 20 }), 3000, version);
  useEffect(() => setOffset(0), [status, q]);
  return <><section className="panel customer-voice-panel"><div className="asset-toolbar"><label className="search-field"><input aria-label="고객 의견 검색" placeholder="의견 · 사용자 · 작업 ID 검색" value={q} onChange={event => setQ(event.target.value)} maxLength={200}/></label><select aria-label="고객 의견 상태 필터" value={status} onChange={event => setStatus(event.target.value)}><option value="">모든 상태</option>{Object.entries(names).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select><Button icon="refresh" onClick={result.refresh}>새로고침</Button></div>
    <div className="asset-subbar"><span>총 <strong>{number(result.data?.total)}</strong>건 · 새 의견 <strong>{number(result.data?.unread)}</strong>건</span><span className="quiet">새 의견을 자동으로 확인합니다.</span></div>
    {result.error && <ErrorBox error={result.error} retry={result.refresh}/>}
    {!result.data ? !result.error && <Loading/> : !result.data.items.length ? <Empty icon="chat" title="접수된 고객 의견이 없습니다"/> : <><div className="table-scroll"><table className="voice-inbox-table"><thead><tr><th>접수</th><th>사용자</th><th>의견</th><th>당시 작업</th><th>상태</th></tr></thead><tbody>{result.data.items.map(row => <tr key={row.id} className={row.status === 'new' ? 'is-new' : ''}><td className="date-cell">{stamp(row.created_at)}</td><td>{row.owner}</td><td><button className="voice-inbox-message" onClick={() => setSelected(row.id)} aria-label={row.owner + ' 고객 의견 상세'}><strong>{row.message}</strong><small>작업 상태 보기 →</small></button></td><td><span>{row.work_type} {row.stage && '· ' + row.stage}</span><small>{row.work_id || '작업 ID 없음'}</small></td><td><span className={'voice-status ' + row.status}>{names[row.status]}</span></td></tr>)}</tbody></table></div><Pager offset={offset} total={result.data.total} size={20} onChange={setOffset}/></>}
  </section>{selected && <VoiceDetail key={selected} id={selected} onClose={() => setSelected(null)} onChanged={result.refresh}/>}</>;
}
