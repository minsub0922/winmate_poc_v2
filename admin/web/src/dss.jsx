import React, { useEffect, useRef, useState } from 'react';
import { api, post, patch, date, number } from './api';
import { Icon } from './icons';
import { Badge, Button, Modal, Empty, Loading, ErrorBox, Details, Toggle } from './components';
import { useApp, useLoad } from './context';
import './dss.css';

const changeNames = { new: '새 항목', changed: '바뀜', removed: '빠짐', moved: '이동', gone: '빠진 권', broken: '열리지 않음', 'new-category': '새 분류', 'new-page': '새 페이지' };
const runNames = { update: '업데이트', cascade: '연관 글 정리', delete: '삭제' };
const actionNames = { replace: '대체 제품으로 바꿈', drop: '지움', regenerate: '다시 만듦', manual: '글 정리 필요' };
const running = s => ['running', 'queued'].includes(s);
const safeHref = url => (/^https:\/\//i.test(url || '') ? url : undefined);

export function DssPage() {
  const { version, refresh, notify, open } = useApp();
  const data = useLoad('/dss', version);
  const agent = useLoad('/dss/agent', version);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [candidatesVersion, setCandidatesVersion] = useState(0);
  const d = data.data;
  const activeCount = d?.active.length || 0;
  // 삭제 후보 목록은 도구를 실행해 만들므로, 소스 작업이 끝났을 때만 다시 읽는다
  const wasActive = useRef(0);
  useEffect(() => { if (wasActive.current && !activeCount) setCandidatesVersion(v => v + 1); wasActive.current = activeCount; }, [activeCount]);

  async function start(call, message) {
    setBusy(true);
    try { const job = await call(); if (job?.id) open({ type: 'job', id: job.id }); if (message) notify(message); refresh(); }
    catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  }
  if (data.error) return <ErrorBox error={data.error} retry={data.retry}/>;
  if (!d) return <Loading/>;
  const connected = agent.data?.providers.filter(p => p.connected) || [];
  const changed = d.channels.filter(c => c.latest?.status === 'changed').length;
  const lastCheck = d.checks[0];
  return <>
    <section className="panel dss-status">
      <div className="dss-status-main"><span className={'dss-status-icon ' + (changed ? 'attention' : '')}><Icon name={changed ? 'alert' : 'shield'} size={22}/></span>
        <div><h2>{!lastCheck ? '아직 점검하지 않았습니다' : changed ? `원천 소스 ${changed}개 채널에 변경이 있습니다` : '원천 소스와 DB가 같습니다'}</h2>
          <p>{lastCheck ? `마지막 점검 ${date(lastCheck.at, true)}` : '점검을 실행해 주세요.'}{d.ledger?.last_full_run_at && ` · DB 기준 ${date(d.ledger.last_full_run_at, true)}`}</p></div></div>
      <div className="dss-status-actions"><Schedule schedule={d.schedule} refresh={refresh} notify={notify}/><Button variant="primary" icon="refresh" busy={busy || activeCount > 0} onClick={() => start(() => post('/dss/check', {}))}>지금 점검</Button></div>
    </section>

    <div className="dss-channels">{d.channels.map(c => <ChannelCard key={c.id} channel={c} canUpdate={connected.length > 0} busy={busy || activeCount > 0} show={() => setDialog({ type: 'check', channel: c })} update={() => setDialog({ type: 'update', channel: c })}/>)}</div>

    <div className="dss-columns">
      <section className="panel"><div className="panel-heading"><div><h2>코드 에이전트</h2><p>업데이트를 실행할 계정</p></div></div>
        {agent.error ? <ErrorBox error={agent.error} retry={agent.retry}/> : !agent.data ? <Loading/> : <div className="dss-agents">{agent.data.providers.map(p => <AgentRow key={p.id} provider={p} selected={(agent.data.selected || connected[0]?.id) === p.id} multiple={connected.length > 1} connect={() => setDialog({ type: 'login', provider: p })} refresh={refresh} notify={notify}/>)}</div>}
      </section>
      <section className="panel"><div className="panel-heading"><div><h2>실행 기록</h2><p>업데이트 · 삭제 · 점검</p></div></div>
        {d.runs.length || d.checks.length ? <div className="dss-history">
          {d.runs.slice(0, 6).map(r => <button key={r.id} onClick={() => setDialog({ type: 'run', id: r.id })}><Icon name={r.kind === 'delete' ? 'archive' : 'spark'} size={16}/><span><strong>{runNames[r.kind] || r.kind}{r.channel ? ' · ' + (d.channels.find(c => c.id === r.channel)?.name || r.channel) : ''}</strong><small>{date(r.at, true)} · {r.actor}</small></span><Badge status={r.status}/></button>)}
          {d.checks.slice(0, 6).map(c => <button key={c.id} onClick={() => setDialog({ type: 'check', id: c.id })}><Icon name="refresh" size={16}/><span><strong>{c.trigger === 'schedule' ? '자동 점검' : '수동 점검'}</strong><small>{date(c.at, true)}</small></span><Badge status={c.status}/></button>)}
        </div> : <p className="inset quiet">아직 기록이 없습니다.</p>}
      </section>
    </div>

    <Deletions version={candidatesVersion} reload={() => setCandidatesVersion(v => v + 1)} canAgent={connected.length > 0} busy={busy || activeCount > 0} confirm={items => setDialog({ type: 'delete', items })} prepare={items => start(() => post('/dss/deletions/prepare', { ids: items.map(i => i.key) }))}/>

    {dialog?.type === 'check' && <CheckDialog channel={dialog.channel} id={dialog.id} channels={d.channels} close={() => setDialog(null)}/>}
    {dialog?.type === 'update' && <UpdateDialog channel={dialog.channel} close={() => setDialog(null)} run={() => { setDialog(null); start(() => post('/dss/update', { channel: dialog.channel.id })); }}/>}
    {dialog?.type === 'login' && <LoginDialog provider={dialog.provider} close={() => { setDialog(null); refresh(); }} notify={notify}/>}
    {dialog?.type === 'run' && <RunDialog id={dialog.id} close={() => setDialog(null)}/>}
    {dialog?.type === 'delete' && <DeleteDialog items={dialog.items} close={() => setDialog(null)} run={() => { const ids = dialog.items.map(i => i.key); setDialog(null); start(() => post('/dss/deletions', { ids, confirm: true, expected: ids.length })); }}/>}
  </>;
}

function Schedule({ schedule, refresh, notify }) {
  const [time, setTime] = useState(schedule.time);
  useEffect(() => setTime(schedule.time), [schedule.time]);
  async function save(value) { try { await patch('/dss/schedule', value); refresh(); notify('자동 점검 설정을 저장했습니다.'); } catch (e) { notify(e.message, 'error'); } }
  return <div className="dss-schedule"><Toggle checked={schedule.enabled} label="매일 자동 점검" onChange={enabled => save({ enabled })}/><label>매일<input type="time" aria-label="자동 점검 시각" value={time} disabled={!schedule.enabled} onChange={e => setTime(e.target.value)} onBlur={() => time && time !== schedule.time && save({ time })}/></label>{schedule.enabled && schedule.next && <small>다음 {date(schedule.next, true)}</small>}</div>;
}

function ChannelCard({ channel: c, canUpdate, busy, show, update }) {
  const l = c.latest;
  return <article className="panel dss-channel"><header><h3>{c.name}</h3><Badge status={l?.status || 'unchecked'}>{!l ? '점검 전' : undefined}</Badge></header>
    <p className="dss-summary">{l ? l.summary : '점검 결과가 없습니다.'}</p>
    <small className="quiet">{l ? date(l.check_at, true) : ''}</small>
    <footer><Button variant="ghost" disabled={!l} onClick={show}>변경 내용</Button><Button icon="spark" disabled={!canUpdate || busy} title={canUpdate ? undefined : '코드 에이전트를 먼저 연결해 주세요'} onClick={update}>업데이트</Button></footer></article>;
}

function ChangeList({ result: r }) {
  if (!r) return <Empty icon="search" title="이 채널의 점검 결과가 없습니다"/>;
  return <><div className="dialog-status-line"><Badge status={r.status}/><span>{r.summary}</span></div>
    {r.changes?.length > 0 && <div className="dss-changes">{r.changes.slice(0, 200).map((c, i) => <div key={i}><b>{changeNames[c.status] || c.status}</b><span><strong>{c.name || c.title || c.url || c.cat || c.id}</strong>{(c.gid || c.dir || c.models?.length > 0) && <small>{[c.gid, c.dir && 'Dir ' + c.dir, c.models?.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}</small>}<em>{(c.why || []).join(' · ')}</em></span>{safeHref(c.url) && <a href={safeHref(c.url)} target="_blank" rel="noreferrer" aria-label="원본 열기"><Icon name="external" size={14}/></a>}</div>)}</div>}
    {r.changes?.length > 200 && <p className="quiet">처음 200건만 표시합니다.</p>}
    {r.errors?.length > 0 && <>{r.errors.slice(0, 8).map((e, i) => <ErrorBox key={i} error={[e.title || e.url || e.id, e.error || (e.http && 'HTTP ' + e.http)].filter(Boolean).join(' — ')}/>)}</>}
    {!r.changes?.length && !r.errors?.length && <p className="dss-same"><Icon name="check" size={16}/>DB와 같습니다.</p>}
    <Details title="확인 범위 · 세부" value={{ coverage: r.coverage, counts: r.counts, issue: r.issue, excluded: r.excluded, notes: r.notes, staged: r.staged, books: r.books }}/></>;
}

function CheckDialog({ channel, id, channels, close }) {
  const detail = useLoad(id ? '/dss/checks/' + id : '/dss/checks/' + channel.latest.check_id);
  const result = detail.data?.result;
  const list = channel ? [channel.id] : Object.keys(result?.channels || {});
  return <Modal title={channel ? channel.name : '점검 결과'} subtitle={detail.data ? date(detail.data.at, true) + ' 점검' : ''} close={close} wide footer={<><span/><Button variant="primary" onClick={close}>확인</Button></>}>
    {detail.error ? <ErrorBox error={detail.error} retry={detail.retry}/> : !result ? <Loading/> : list.map(cid => <div className="dss-check-block" key={cid}>{!channel && <h3>{channels.find(c => c.id === cid)?.name || cid}</h3>}<ChangeList result={result.channels[cid]}/></div>)}
  </Modal>;
}

function UpdateDialog({ channel, close, run }) {
  const prompts = useLoad('/dss/prompts');
  const prompt = prompts.data?.channels.find(c => c.id === channel.id)?.prompt;
  return <Modal title={channel.name + ' 업데이트'} subtitle="연결한 코드 에이전트가 아래 고정 프롬프트를 실행합니다." close={close} footer={<><Button onClick={close}>닫기</Button><Button variant="primary" icon="spark" disabled={!prompt} onClick={run}>업데이트 실행</Button></>}>
    {prompts.error ? <ErrorBox error={prompts.error} retry={prompts.retry}/> : !prompt ? <Loading/> : <pre className="source-text dss-prompt">{prompt}</pre>}
    <div className="notice"><Icon name="info" size={17}/><p>실제 앱 데이터에 반영됩니다. 판매 종료 항목은 표시만 하고, 삭제는 아래 삭제 후보에서 확인한 뒤 실행합니다.</p></div>
  </Modal>;
}

function AgentRow({ provider: p, selected, multiple, connect, refresh, notify }) {
  const [busy, setBusy] = useState(false);
  async function act(call, message) { setBusy(true); try { await call(); refresh(); notify(message); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); } }
  return <div className="dss-agent"><span className={'dss-agent-dot ' + (p.connected ? 'on' : '')}/>
    <div><strong>{p.name}</strong><small>{!p.installed ? '이 서버에 CLI가 설치되어 있지 않습니다' : p.connected ? (p.account || '연결됨') : p.account_kind + ' · 연결 전'}{p.version ? ' · ' + p.version : ''}</small></div>
    {p.connected && multiple && <label className="dss-agent-use"><input type="radio" name="dss-agent" checked={selected} onChange={() => act(() => patch('/dss/agent', { provider: p.id }), p.name + '로 실행합니다.')}/>사용</label>}
    {p.connected ? <Button busy={busy} onClick={() => act(() => post('/dss/agent/logout', { provider: p.id }), '연결을 해제했습니다.')}>연결 해제</Button> : <Button variant="primary" icon="link" disabled={!p.installed} onClick={connect}>OAuth 연결</Button>}
  </div>;
}

function LoginDialog({ provider, close, notify }) {
  const [login, setLogin] = useState(null), [error, setError] = useState(''), [code, setCode] = useState(''), [busy, setBusy] = useState(false);
  const session = useRef(null), done = useRef(false);
  useEffect(() => {
    let alive = true;
    post('/dss/agent/login', { provider: provider.id }).then(v => { if (alive) { session.current = v.session; setLogin(v); } }).catch(e => alive && setError(e.message));
    const timer = setInterval(async () => {
      if (!session.current || done.current) return;
      try { const v = await api('/dss/agent/login/' + session.current); if (!alive) return; setLogin(v); if (['connected', 'failed', 'expired', 'cancelled'].includes(v.state)) done.current = true; }
      catch (e) { if (alive) setError(e.message); }
    }, 2000);
    return () => { alive = false; clearInterval(timer); if (session.current && !done.current) void api('/dss/agent/login/' + session.current, { method: 'DELETE' }).catch(() => {}); };
  }, [provider.id]);
  useEffect(() => { if (login?.state === 'connected') { notify(provider.name + ' 계정을 연결했습니다.'); close(); } }, [login?.state]);
  async function submit() { setBusy(true); setError(''); try { setLogin(await post('/dss/agent/login/' + session.current, { code })); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  const failed = login && ['failed', 'expired'].includes(login.state);
  return <Modal title={provider.name + ' 연결'} subtitle={provider.account_kind + '으로 로그인합니다.'} close={close} footer={<><Button onClick={close}>닫기</Button>{login?.needs_code && !failed && <Button variant="primary" busy={busy || login.state === 'verifying'} disabled={!code.trim()} onClick={submit}>연결</Button>}</>}>
    {error && <ErrorBox error={error}/>}
    {!login && !error ? <Loading/> : login && <div className="dss-login">
      {failed ? <ErrorBox error={login.state === 'expired' ? '인증 시간이 지났습니다. 다시 시작해 주세요.' : login.error || '연결하지 못했습니다.'}/> : <>
        <div className="dss-step"><b>1</b><div><strong>인증 페이지에서 로그인</strong><a className="button primary" href={safeHref(login.url)} target="_blank" rel="noreferrer"><Icon name="external" size={15}/> 인증 페이지 열기</a></div></div>
        {login.needs_code ? <div className="dss-step"><b>2</b><div><strong>페이지가 보여 준 코드 붙여넣기</strong><input aria-label="인증 코드" autoComplete="off" spellCheck="false" value={code} onChange={e => setCode(e.target.value)} placeholder="인증 코드" disabled={login.state === 'verifying'}/></div></div>
          : <div className="dss-step"><b>2</b><div><strong>페이지에 이 코드 입력</strong><code className="dss-device-code">{login.code}</code><small className="quiet">입력하면 자동으로 연결됩니다.</small></div></div>}
        {login.state === 'verifying' && <p className="quiet">코드를 확인하는 중입니다.</p>}
      </>}
    </div>}
  </Modal>;
}

function Deletions({ version, reload, canAgent, busy, confirm, prepare }) {
  const result = useLoad('/dss/deletions', version);
  const [selected, setSelected] = useState([]);
  const items = result.data?.candidates || [];
  useEffect(() => setSelected(s => s.filter(k => items.some(i => i.key === k))), [result.data]);
  const withDeps = keys => { const all = new Set(keys); let grew = true; while (grew) { grew = false; for (const i of items) if (all.has(i.key)) for (const k of i.depends_on || []) if (!all.has(k)) { all.add(k); grew = true; } } return [...all]; };
  const chosen = items.filter(i => selected.includes(i.key));
  const blocked = chosen.filter(i => i.blocked?.length);
  const refs = i => { const by = {}; for (const r of i.refs || []) by[r.area] = (by[r.area] || 0) + (r.count || 1); return Object.entries(by).map(([k, n]) => `${k} ${n}`).join(' · '); };
  return <section className="panel dss-deletions"><div className="panel-heading"><div><h2>삭제 후보 <span className="count-label">{items.length}</span></h2><p>판매 종료로 확정된 항목 — 확인한 것만 삭제합니다.</p></div>
    <div className="button-row"><Button icon="refresh" onClick={reload}>새로고침</Button>{blocked.length > 0 && <Button icon="spark" disabled={!canAgent || busy} title={canAgent ? undefined : '코드 에이전트를 먼저 연결해 주세요'} onClick={() => prepare(blocked)}>연관 글 정리 {blocked.length}</Button>}<Button variant="primary" icon="archive" disabled={!chosen.length || blocked.length > 0 || busy} onClick={() => confirm(chosen)}>선택 {chosen.length}개 삭제</Button></div></div>
    {result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !result.data ? <Loading/> : !items.length ? <p className="inset quiet">삭제 후보가 없습니다.</p> :
      <div className="table-scroll"><table className="asset-table dss-table"><thead><tr><th className="checkbox-cell"><input type="checkbox" aria-label="전체 선택" checked={items.length > 0 && items.every(i => selected.includes(i.key))} onChange={e => setSelected(e.target.checked ? items.map(i => i.key) : [])}/></th><th>항목</th><th>판매 종료 근거</th><th>대체</th><th>연관 자료</th><th>상태</th></tr></thead>
        <tbody>{items.map(i => <tr key={i.key}><td className="checkbox-cell"><input type="checkbox" aria-label={i.name + ' 선택'} checked={selected.includes(i.key)} onChange={e => setSelected(s => e.target.checked ? withDeps([...s, i.key]) : s.filter(k => k !== i.key && !(items.find(x => x.key === k)?.depends_on || []).includes(i.key)))}/></td>
          <td><strong>{i.name}</strong><small>{[i.model, i.id].filter(Boolean).join(' · ')}</small></td><td className="dss-reason" title={i.reason}>{i.reason}</td><td>{i.replacement ? i.replacement.name : '없음'}</td><td>{refs(i) || '없음'}</td>
          <td>{i.blocked?.length ? <Badge status="needs_review">글 정리 필요</Badge> : <Badge status="indexed">삭제 가능</Badge>}</td></tr>)}</tbody></table></div>}
  </section>;
}

function DeleteDialog({ items, close, run }) {
  const [checked, setChecked] = useState(false);
  return <Modal title={`${items.length}개 항목 삭제`} subtitle="제품 DB에서 지우고 연관 자료에 바로 반영합니다." close={close} wide footer={<><Button onClick={close}>취소</Button><Button variant="primary" icon="archive" disabled={!checked} onClick={run}>삭제 실행</Button></>}>
    <div className="dss-delete-list">{items.map(i => <div key={i.key}><span><strong>{i.name}</strong><small>{[i.model, i.id].filter(Boolean).join(' · ')}</small></span><span className="dss-arrow"><Icon name="arrow" size={14}/></span><span>{i.replacement ? <><strong>{i.replacement.name}</strong><small>대체 제품</small></> : <small>대체 없음 — 연결에서 뺌</small>}</span>
      {(i.refs || []).length > 0 && <ul>{i.refs.map((r, n) => <li key={n}>{r.area} · {r.file}{r.count > 1 ? ` (${r.count})` : ''} — {r.detail || actionNames[r.action] || r.action}</li>)}</ul>}</div>)}</div>
    <div className="notice"><Icon name="info" size={17}/><p>샘플 시나리오 · 조감도 오브젝트 · 레이아웃 · 에이전트 KB까지 다시 만듭니다. 검증에 실패하면 모든 파일을 실행 전으로 되돌립니다.</p></div>
    <label className="dss-confirm"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}/>위 {number(items.length)}개 항목의 삭제를 확인했습니다.</label>
  </Modal>;
}

function RunDialog({ id, close }) {
  const [tick, setTick] = useState(0);
  const detail = useLoad('/dss/runs/' + id, tick);
  const log = useLoad('/dss/runs/' + id + '/log', tick);
  const r = detail.data;
  useEffect(() => { if (!r || !running(r.status)) return; const t = setTimeout(() => setTick(v => v + 1), 3000); return () => clearTimeout(t); }, [r, tick]);
  const box = useRef();
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [log.data?.size]);
  const s = r?.result?.summary;
  return <Modal title={r ? runNames[r.kind] || r.kind : '실행 기록'} subtitle={r ? `${date(r.at, true)} · ${r.actor}${r.provider ? ' · ' + r.provider : ''}` : ''} close={close} wide footer={<><span className="quiet">{id}</span><Button variant="primary" onClick={close}>확인</Button></>}>
    {detail.error ? <ErrorBox error={detail.error} retry={detail.retry}/> : !r ? <Loading/> : <>
      <div className="dialog-status-line"><Badge status={r.status}/>{s?.run_id && <span>{s.run_id}</span>}</div>
      {r.result?.error && <ErrorBox error={r.result.error}/>}
      {s && <div className="count-chips">{[['changed', '바뀜'], ['new', '새 항목'], ['unresolved', '미확정']].filter(([k]) => s[k] != null).map(([k, label]) => <span key={k}>{label}<b>{number(s[k])}</b></span>)}{Array.isArray(s.deprecated) && <span>삭제 후보<b>{s.deprecated.length}</b></span>}</div>}
      {r.kind === 'delete' && Array.isArray(r.result?.deleted) && <div className="count-chips"><span>삭제<b>{r.result.deleted.length}</b></span><span>고친 파일<b>{number(r.result.changed_files?.length)}</b></span>{r.result.verification && <span>참조 검사<b>{r.result.verification.ok ? '통과' : '실패'}</b></span>}</div>}
      <h3 className="small-heading">로그</h3><pre className="source-text dss-log" ref={box}>{log.data?.text || '아직 로그가 없습니다.'}</pre>
      {r.prompt && <Details title="실행한 프롬프트" value={r.prompt}/>}{r.result && Object.keys(r.result).length > 0 && <Details title="전체 결과" value={r.result}/>}
    </>}
  </Modal>;
}
