import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useApp, useLoad } from './context';
import { api, post, number } from './api';
import { Icon } from './icons';
import { Button, IconButton, Modal, Loading, ErrorBox, Details, Toggle } from './components';
import './providers.css';

const roleNames = { llm: 'LLM', decision: 'Decision 모델' };
const scopeNames = { internal: '사내 · 자체 서빙', external: '외부 API' };
const statusTone = { ok: 'green', degraded: 'amber', down: 'red' };
const taskNames = { 'search.rerank': '검색 재순위', 'catalog.rank': '제품 순위', 'review.route': '검토 분류', 'layout.pick': '레이아웃 선택', 'layout.best_pick': '시나리오 선택', 'spatial.command': '조감도 명령' };
const errorNames = { no_api_key: '인증 키 없음', auth_failed: '인증 거절', model_not_found: '모델을 찾지 못함', rate_limited: '요청 한도 초과', upstream_unavailable: '서버 오류', network: '연결 실패', timeout: '시간 초과', upstream_timeout: '시간 초과', max_tokens: '출력 한도 초과', empty: '빈 응답', blocked: '차단됨', bad_request: '요청 형식 오류', invalid_output: '응답 형식 오류', upstream_error: '서버 오류', http_error: 'HTTP 오류', cancelled: '취소됨' };

const clock = value => new Date(value).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
const dayOf = value => new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
/** 오늘이면 14:30, 아니면 11. 17. 22:00 */
const when = value => dayOf(value) === dayOf(Date.now()) ? clock(value) : new Date(value).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }) + ' ' + clock(value);
function ago(value) {
  if (!value) return '기록 없음';
  const seconds = Math.max(0, (Date.now() - (typeof value === 'number' ? value * 1000 : new Date(value).getTime())) / 1000);
  if (seconds < 60) return '방금 전';
  if (seconds < 3600) return Math.floor(seconds / 60) + '분 전';
  if (seconds < 86400) return Math.floor(seconds / 3600) + '시간 전';
  return Math.floor(seconds / 86400) + '일 전';
}
const duration = ms => ms == null ? '—' : ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(ms < 10000 ? 2 : 1) + '초';
const pretty = value => JSON.stringify(value, null, 2);

function Tag({ tone = 'neutral', children }) { return <span className={'badge ' + tone}><i/>{children}</span>; }

function StateBadge({ p, names }) {
  if (!p.registered) return <Tag>연결 정보 없음</Tag>;
  if (!p.status) return <Tag>{p.monitored ? '첫 점검 대기' : '점검 전'}</Tag>;
  return <Tag tone={statusTone[p.status.status]}>{names[p.status.status] || p.status.status}</Tag>;
}

// 한 줄 상태 — 설명 문장 없이 사실만(긴 내용은 hover)
function StateLine({ p, names }) {
  if (!p.registered) return <p className="pc-state" title={(p.missing_hint || '.env') + ': ' + p.missing.join(' · ')}><code>{p.missing.join(' · ')}</code></p>;
  const s = p.status, c = p.last_call;
  const calls = c ? `최근 실제 호출 ${when(c.at)} ${c.status === 'ok' ? '성공' : '실패'} · 24시간 ${number(c.calls_24h)}건 중 실패 ${number(c.errors_24h)}건` : '';
  if (!s) {
    if (p.scope === 'external' && c) return <p className="pc-state" title={calls}>점검 기록 없음 · 호출 {ago(c.at)}</p>;
    return <p className="pc-state">점검 기록 없음</p>;
  }
  return <p className="pc-state" data-checked={s.checked_at} title={[`${s.detail}`, `최근 점검 ${when(s.checked_at)} (${ago(s.checked_at)})`, s.status !== 'ok' && s.last_ok ? `마지막 정상 ${when(s.last_ok)}` : '', calls].filter(Boolean).join('\n')}>
    <b className={s.status === 'ok' ? 'ok' : 'bad'}>{names[s.status] || s.status}</b> 최근 점검 {when(s.checked_at)} · {duration(s.ms)}</p>;
}

function History({ status }) {
  if (!status?.history?.length) return null;
  return <div className="provider-history" aria-label="최근 점검 기록">{status.history.map((h, i) => <i key={i} className={h.status} title={`${clock(h.at)} · ${h.status === 'ok' ? '정상' : h.status === 'down' ? '응답 없음' : '확인 필요'} · ${duration(h.ms)}`}/>)}</div>;
}

function ProviderCard({ p, view, last, busy, checking, onToggle, onPrimary, onCheck, onEdit, onExperiment }) {
  const tasks = p.tasks ? Object.entries(p.tasks).filter(([, on]) => on).map(([task]) => taskNames[task] || task) : [];
  const locked = !p.registered ? `연결 정보 없음 — ${p.missing_hint || '.env'}: ${p.missing.join(' · ')}` : last ? 'LLM은 하나는 켜져 있어야 합니다' : '';
  const targetChoices = p.targets?.filter(t => t.enabled) || [];
  const multipleTargets = targetChoices.length > 1;
  const where = p.targets?.length ? p.targets.map(t => `${t.label} · ${t.model}${t.enabled ? '' : ' (꺼짐)'}`).join('\n') : (p.base_url || '주소 미설정');
  return <article className={'provider-card compact' + (p.active ? ' active' : '') + (p.primary ? ' primary' : '') + (p.registered ? '' : ' missing')} data-provider={p.id}>
    <header>
      <h3 title={p.name}>{p.name}</h3>
      {p.primary ? <span className="pc-primary" title={tasks.length ? '판단 작업: ' + tasks.join(' · ') : undefined}>{p.role === 'decision' ? '서비스 사용 중' : '대표'}</span>
        : p.active ? <button type="button" className="pc-make" disabled={busy} onClick={() => onPrimary(p)}>대표로</button> : null}
      {!multipleTargets && <span className="pc-toggle" title={locked || undefined}><Toggle checked={p.active} label={`${p.name} 사용`} disabled={busy || !!locked} onChange={on => onToggle(p, on, targetChoices[0])}/></span>}
    </header>
    <div className="pc-meta">
      <Tag tone={p.scope === 'internal' ? 'blue' : 'neutral'}>{scopeNames[p.scope]}</Tag>
      {p.impl && <span className="pc-impl" title={p.impl_file}>{p.impl}</span>}
      <StateBadge p={p} names={view.status_names}/>
      {p.active && !p.primary && <span className="pc-rank" title="대표가 응답하지 못하면 이 순서로 대신 답합니다">대체 {p.rank}</span>}
      {p.edit && <span className="edited-mark">주소 수정됨</span>}
    </div>
    <code className="pc-model" title={where}>{p.connection ? p.base_url : p.model || '모델 미설정'}</code>
    {multipleTargets && <div className="provider-targets">{targetChoices.map(t => <div key={t.id}>
      <span>{t.label} · {t.model}</span><Toggle checked={p.active && p.selected_target === t.id} label={`${t.label} 서비스 사용`}
        disabled={busy || !!locked} onChange={on => onToggle(p, on, t)}/>
    </div>)}</div>}
    <StateLine p={p} names={view.status_names}/>
    <History status={p.status}/>
    {(p.checkable || p.editable || p.registered) && <footer>
      {p.checkable && <IconButton icon="refresh" label="지금 점검" disabled={checking} onClick={() => onCheck(p)}/>}
      {p.editable && <IconButton icon="link" label="주소 수정 · 재연결" onClick={() => onEdit(p)}/>}
      {p.registered && <IconButton icon="play" label="실험에 추가" onClick={() => onExperiment(p)}/>}
    </footer>}
  </article>;
}

export function ProvidersPage() {
  const { version, modal, open, close, notify } = useApp();
  const [tick, setTick] = useState(0);
  const { data, error, retry } = useLoad('/providers', version + tick);
  const [checking, setChecking] = useState('');
  const [busy, setBusy] = useState('');
  const lab = useRef(null);
  const reload = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) reload(); }, 60000); return () => clearInterval(timer); }, [reload]);
  const check = useCallback(async p => {
    setChecking(p.id);
    try { const r = await post(`/providers/${p.id}/check`, {}); notify(`${p.name}: ${r.detail}`, r.status === 'ok' ? 'success' : 'error'); reload(); }
    catch (e) { notify(e.message, 'error'); }
    finally { setChecking(''); }
  }, [notify, reload]);
  // 켜기 · 끄기 · 대표 — 재시작 없이 바로 적용(서버가 순서를 정한다: 대표 다음은 켠 순서대로 대체)
  const change = useCallback(async (p, action, done, body = {}) => {
    setBusy(p.id);
    try {
      const r = await post(`/providers/${p.id}/${action}`, body);
      reload();
      notify(r.check && r.check.status !== 'ok' ? `${done} — ${r.check.detail}` : done, r.check && r.check.status !== 'ok' ? 'error' : 'success');
    } catch (e) { notify(e.message, 'error'); }
    finally { setBusy(''); }
  }, [notify, reload]);
  const experiment = useCallback(p => { close(); lab.current?.add(p); }, [close]);
  if (error) return <ErrorBox error={error} retry={retry}/>;
  if (!data) return <Loading/>;
  const order = p => p.active ? p.rank : p.registered ? 100 : 200;
  const groups = Object.keys(roleNames).map(role => {
    const list = data.providers.filter(p => p.role === role).sort((a, b) => order(a) - order(b));
    return { role, list, on: list.filter(p => p.active).length };
  });
  return <>
    <section className="section-block">
      <div className="section-heading"><div><h2>모델 연결</h2><p>LLM은 대표 모델부터 순서대로 호출합니다. Decision 모델은 선택한 하나를 사용합니다.</p></div></div>
      {groups.map(g => <div className="provider-group" key={g.role}>
        <h3>{roleNames[g.role]}<span className="count-label">{g.on} / {g.list.length}</span>{g.role === 'decision' && !g.on && <small>모두 꺼짐 · LLM이 판단</small>}
          {g.role === 'decision' && <Button icon="plus" onClick={() => open({ type: 'clef-add' })}>CLEF 추가</Button>}</h3>
        <div className="provider-grid compact">{g.list.map(p => <ProviderCard key={p.id} p={p} view={data} busy={!!busy} checking={checking === p.id}
          last={g.role === 'llm' && p.active && g.on === 1}
          onToggle={(p, on, target) => p.role === 'decision'
            ? open({ type: 'decision-switch', provider: p, on, target, previous: g.list.find(item => item.active) })
            : change(p, on ? 'activate' : 'deactivate', `${p.name}: ${on ? '켰습니다' : '껐습니다'}`)}
          onPrimary={p => change(p, 'primary', `${p.name}: 대표로 정했습니다`)}
          onCheck={check} onEdit={p => open({ type: 'provider-edit', id: p.id })} onExperiment={experiment}/>)}</div>
      </div>)}
      <div className="info-strip provider-schedule"><Icon name="info" size={17}/><p>{data.monitoring
        ? <>자동 점검 · 켠 Provider · {data.schedule.from}–{data.schedule.to} · {data.schedule.every_min}분마다{data.schedule.next && <> · 다음 {when(data.schedule.next)}</>}</>
        : '자동 점검 꺼짐'}</p></div>
    </section>
    <Lab ref={lab} data={data}/>
    {modal?.type === 'clef-add' && <ClefDialog done={reload}/>}
    {modal?.type === 'decision-switch' && <Modal title="서비스 Decision 모델 전환" close={close}
      footer={<><Button onClick={close}>취소</Button><Button variant="primary" onClick={() => {
        const { provider, on, target } = modal;
        close();
        change(provider, on ? 'activate' : 'deactivate', on ? '서비스 Decision 모델을 전환했습니다.' : 'LLM 판단으로 전환했습니다.', on && target ? { target: target.id } : {});
      }}>전환</Button></>}>
      <p>{modal.previous ? describeDecision(modal.previous) : 'LLM 판단'}에서 {modal.on ? describeDecision(modal.provider, modal.target) : 'LLM 판단'}으로 전환할까요?</p>
    </Modal>}
    {modal?.type === 'provider-edit' && <EditDialog p={data.providers.find(p => p.id === modal.id)} names={data.status_names} done={reload}/>}
  </>;
}

function describeDecision(p, target = p.targets?.find(t => t.id === p.selected_target)) {
  return [p.name, p.base_url, target?.label, target?.model].filter(Boolean).join(' · ');
}

const trainingKey = 'winmate.admin.clef-training';

function ClefDialog({ done }) {
  const { close, notify } = useApp();
  const [job, setJob] = useState(() => sessionStorage.getItem(trainingKey) || '');
  const [mode, setMode] = useState(job ? 'training' : 'direct');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('clef-flash');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = saving || !!job;
  useEffect(() => {
    if (!job) return;
    let alive = true, timer;
    async function poll() {
      try {
        const result = await api('/providers/clef/training/' + job);
        if (!alive) return;
        setModel(result.model);
        if (result.status === 'running') {
          timer = setTimeout(poll, 2000);
          return;
        }
        sessionStorage.removeItem(trainingKey);
        setJob('');
        if (result.status === 'succeeded') {
          done(); notify('CLEF를 연결했습니다.'); close();
        } else setMessage(result.detail);
      } catch (e) {
        if (!alive) return;
        setMessage(e.message);
        if (e.status === 404) {
          sessionStorage.removeItem(trainingKey);
          setJob('');
        } else timer = setTimeout(poll, 5000);
      }
    }
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [job, close, done, notify]);
  const submit = async () => {
    setSaving(true); setMessage('');
    try {
      if (mode === 'training') {
        const task = await post('/providers/clef/training', { model });
        sessionStorage.setItem(trainingKey, task.id);
        setJob(task.id);
      } else {
        await post('/providers/clef', { base_url: endpoint, model });
        done(); notify('CLEF를 연결했습니다.'); close();
      }
    } catch (e) { setMessage(e.message); }
    finally { setSaving(false); }
  };
  return <Modal title="CLEF 추가" close={saving ? () => {} : close}
    footer={<Button variant="primary" disabled={busy || !model.trim() || (mode === 'direct' && !endpoint.trim())}
      busy={saving} onClick={submit}>{mode === 'direct' ? '샘플 확인 후 연결' : 'Training job 시작'}</Button>}>
    <div className="form-stack provider-form">
      <label>연결 방식<select value={mode} disabled={busy} onChange={e => { setMode(e.target.value); setMessage(''); }}>
        <option value="direct">Endpoint 직접 입력</option><option value="training">Training job으로 endpoint 받기</option>
      </select></label>
      {mode === 'direct' && <label>Endpoint<input value={endpoint} disabled={busy} onChange={e => setEndpoint(e.target.value)}
        placeholder="http://127.0.0.1:8790/v1" spellCheck={false}/></label>}
      <label>모델 ID<input value={model} disabled={busy} onChange={e => setModel(e.target.value)} spellCheck={false}/></label>
      {job && <p role="status">Training job의 endpoint를 기다리는 중입니다. 최대 30분이 걸릴 수 있습니다.</p>}
      {message && <div className="error-box" role="alert">{message}</div>}
    </div>
  </Modal>;
}

function ProbeResult({ result, names, pick }) {
  if (!result) return null;
  return <div className={'probe-result ' + result.status} role="status"><div><Tag tone={statusTone[result.status]}>{names[result.status]}</Tag><b>{result.detail}</b><span>{duration(result.ms)}</span></div>
    {result.models?.length > 0 && <div className="probe-models"><span>서버의 모델</span>{result.models.map(m => <button type="button" key={m} onClick={() => pick(m)}>{m}</button>)}</div>}</div>;
}

function EditDialog({ p, names, done }) {
  const { close, notify } = useApp();
  const [base, setBase] = useState(p?.base_url || '');
  const [model, setModel] = useState(p?.model || '');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');
  if (!p) return null;
  const run = async (kind, call) => {
    setBusy(kind); setMessage('');
    try { return await call(); }
    catch (e) { setResult(null); setMessage(e.message); }
    finally { setBusy(''); }
  };
  const test = () => run('test', async () => setResult(await post(`/providers/${p.id}/check`, { base_url: base, model })));
  const save = () => run('save', async () => {
    const r = await api(`/providers/${p.id}/endpoint`, { method: 'PUT', body: JSON.stringify({ base_url: base, model }) });
    setResult(r.check); setBase(r.provider.base_url); setModel(r.provider.model); done();
    notify(r.check ? `${p.name}: 저장하고 다시 연결했습니다 — ${r.check.detail}` : `${p.name}: 저장했습니다.`, !r.check || r.check.status === 'ok' ? 'success' : 'error');
  });
  const reset = () => run('reset', async () => {
    const r = await api(`/providers/${p.id}/endpoint`, { method: 'DELETE' });
    setResult(r.check); setBase(r.provider.base_url || ''); setModel(r.provider.model || ''); done();
    notify(`${p.name}: 원래 설정으로 되돌렸습니다.`);
  });
  const changed = base.trim() !== (p.base_url || '') || model.trim() !== (p.model || '');
  return <Modal title={`${p.name} 주소 수정`} subtitle="연결 방식은 그대로 두고 주소와 모델 ID만 바꿉니다. 인증 키는 서버의 .env에만 있고 여기서 보거나 바꾸지 않습니다." close={close}
    footer={<><span className="quiet">{p.active ? '저장하면 재시작 없이 Winmate 전체에 바로 적용됩니다.' : '활성 상태가 아니므로 실험과 점검에만 쓰입니다.'}</span><div><Button icon="refresh" busy={busy === 'test'} disabled={!!busy || !base.trim()} onClick={test}>연결 테스트</Button><Button variant="primary" icon="link" busy={busy === 'save'} disabled={!!busy || !base.trim() || !model.trim()} onClick={save}>저장하고 재연결</Button></div></>}>
    <div className="form-stack provider-form">
      <label>서버 주소<input value={base} onChange={e => setBase(e.target.value)} placeholder={p.role === 'decision' ? 'http://127.0.0.1:8790/v1' : 'http://10.0.0.12:8000/v1'} spellCheck={false} autoComplete="off"/>
        <small>https 주소, 또는 이 서버 · 사내망 주소의 http만 쓸 수 있습니다. {p.impl ? '' : p.role === 'decision' ? '뒤에 /systemone이 붙습니다.' : '뒤에 /chat/completions가 붙습니다.'}</small></label>
      <label>모델 ID<input value={model} onChange={e => setModel(e.target.value)} placeholder={p.role === 'decision' ? 'clef-flash' : '서버에 올린 모델 이름'} spellCheck={false} autoComplete="off"/></label>
      {message && <div className="error-box" role="alert"><Icon name="alert"/><span>{message}</span></div>}
      <ProbeResult result={result} names={names} pick={setModel}/>
      {!p.registered && p.missing.some(k => k.endsWith('API_KEY')) && <p className="provider-note"><Icon name="info" size={13}/>인증 키({p.missing.filter(k => k.endsWith('API_KEY')).join(', ')})는 .env에 넣어야 연결됩니다. 인증이 없는 서버라도 local 같은 아무 값을 넣어 주세요.</p>}
      {p.edit && <div className="provider-env"><div><span>원래 설정{p.env ? '' : ' 없음'}</span>{p.env && <code>{p.env.base_url || '주소 없음'} · {p.env.model || '모델 없음'}</code>}<small>{ago(p.edit.saved_at)} {p.edit.by}님이 수정</small></div><Button busy={busy === 'reset'} disabled={!!busy} onClick={reset}>원래 설정으로 되돌리기</Button></div>}
      {!changed && !result && <p className="quiet">주소나 모델 ID를 바꾼 뒤 먼저 연결 테스트로 확인할 수 있습니다. 테스트는 저장하지 않습니다.</p>}
    </div>
  </Modal>;
}

// ---------------------------------------------------------------- experiments
const blank = { llm: { system: '', user: '', json_mode: false, max_tokens: 1024, temperature: 0.2 }, decision: { state: '{}', questions: '{}' } };
let rowSeq = 0;
const row = (p, model = '') => ({ key: ++rowSeq, id: p.id, model });

const Lab = forwardRef(function Lab({ data }, ref) {
  const { notify } = useApp();
  const registered = useMemo(() => data.providers.filter(p => p.registered), [data]);
  const byId = useMemo(() => Object.fromEntries(data.providers.map(p => [p.id, p])), [data]);
  const [role, setRole] = useState('llm');
  const [sample, setSample] = useState({ llm: '', decision: '' });
  const [input, setInput] = useState(blank);
  const [targets, setTargets] = useState(null);
  const [runs, setRuns] = useState([]);
  const [now, setNow] = useState(Date.now());
  const section = useRef(null);
  const batch = useRef(0);
  // Default targets: every connected provider of the role, so one click compares them on the same input.
  useEffect(() => { if (!targets) setTargets({ llm: registered.filter(p => p.role === 'llm').map(p => row(p)), decision: registered.filter(p => p.role === 'decision').map(p => row(p)) }); }, [registered, targets]);
  const choose = useCallback((kind, s) => {
    setSample(v => ({ ...v, [kind]: s.id }));
    setInput(v => ({ ...v, [kind]: kind === 'llm' ? { system: s.system, user: s.user, json_mode: !!s.json, max_tokens: s.max_tokens, temperature: s.temperature } : { state: pretty(s.state), questions: pretty(s.questions) } }));
  }, []);
  useEffect(() => { if (!sample.llm && data.samples.llm[0]) choose('llm', data.samples.llm[0]); if (!sample.decision && data.samples.decision[0]) choose('decision', data.samples.decision[0]); }, [data]);
  useImperativeHandle(ref, () => ({ add(p) {
    setRole(p.role);
    setTargets(v => v && !v[p.role].some(t => t.id === p.id && !t.model) ? { ...v, [p.role]: [...v[p.role], row(p)] } : v);
    section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } }), []);
  const running = runs.some(r => r.state === 'running');
  useEffect(() => { if (!running) return; const timer = setInterval(() => setNow(Date.now()), 100); return () => clearInterval(timer); }, [running]);
  if (!targets) return null;
  const list = targets[role];
  const options = registered.filter(p => p.role === role);
  const edit = (key, change) => setTargets(v => ({ ...v, [role]: v[role].map(t => t.key === key ? { ...t, ...change } : t) }));
  const set = change => setInput(v => ({ ...v, [role]: { ...v[role], ...change } }));
  const start = async () => {
    let payload;
    if (role === 'llm') {
      if (!input.llm.user.trim()) return notify('입력 프롬프트를 적어 주세요.', 'error');
      payload = { system: input.llm.system, user: input.llm.user, json_mode: input.llm.json_mode, max_tokens: Number(input.llm.max_tokens) || 1024, temperature: Number(input.llm.temperature) || 0 };
    } else {
      try { payload = { state: JSON.parse(input.decision.state), questions: JSON.parse(input.decision.questions) }; }
      catch (e) { return notify('state · questions는 올바른 JSON이어야 합니다: ' + e.message, 'error'); }
    }
    const id = ++batch.current;
    const started = Date.now();
    setNow(started);
    setRuns(list.map(t => ({ key: t.key, id: t.id, name: byId[t.id]?.name, model: t.model.trim() || byId[t.id]?.model, state: 'running', started })));
    // One request per target, all at once: each card fills in as soon as its own model answers.
    await Promise.all(list.map(async t => {
      let result;
      try { result = await post('/providers/run', { target: t.id, model: t.model.trim() || null, ...payload }); }
      catch (e) { result = { ok: false, error: { code: 'request', message: e.message }, ms: Date.now() - started }; }
      if (batch.current === id) setRuns(v => v.map(r => r.key === t.key ? { ...r, ...result, state: result.ok ? 'done' : 'failed' } : r));
    }));
  };
  const finished = runs.filter(r => r.state === 'done');
  const fastest = finished.length > 1 ? Math.min(...finished.map(r => r.ms)) : null;
  return <section className="section-block provider-lab" ref={section}>
    <div className="section-heading"><div><h2>실험</h2><p>같은 입력을 여러 Provider · 모델에 동시에 보내 출력과 응답 시간을 비교합니다. 실제 호출이라 외부 API는 사용량이 발생합니다.</p></div>
      <div className="tabs">{Object.entries(roleNames).map(([id, name]) => <button key={id} className={role === id ? 'selected' : ''} onClick={() => setRole(id)}>{name}</button>)}</div></div>
    <div className="panel lab-panel">
      <div className="lab-samples"><span>샘플 입력</span>{data.samples[role].map(s => <button type="button" key={s.id} className={sample[role] === s.id ? 'selected' : ''} title={s.feature} onClick={() => choose(role, s)}>{s.title}</button>)}</div>
      {(() => { const s = data.samples[role].find(x => x.id === sample[role]); return s ? <p className="lab-feature"><Icon name="spark" size={13}/>{s.feature}{s.task ? <code>{s.task}</code> : null} — 고쳐서 실행해도 됩니다.</p> : null; })()}
      <div className="lab-body">
        <div className="form-stack lab-input">
          {role === 'llm' ? <>
            <label>시스템 지시<textarea rows={4} value={input.llm.system} onChange={e => set({ system: e.target.value })} spellCheck={false}/></label>
            <label>입력<textarea rows={9} value={input.llm.user} onChange={e => set({ user: e.target.value })} spellCheck={false}/></label>
            <div className="lab-options"><label className="lab-check"><input type="checkbox" checked={input.llm.json_mode} onChange={e => set({ json_mode: e.target.checked })}/>JSON 출력</label>
              <label>최대 출력 토큰<input type="number" min={1} max={8192} value={input.llm.max_tokens} onChange={e => set({ max_tokens: e.target.value })}/></label>
              <label>temperature<input type="number" min={0} max={2} step={0.1} value={input.llm.temperature} onChange={e => set({ temperature: e.target.value })}/></label></div>
          </> : <>
            <label>state (판단할 상황)<textarea rows={7} className="mono" value={input.decision.state} onChange={e => set({ state: e.target.value })} spellCheck={false}/></label>
            <label>questions (choice · score · noul)<textarea rows={11} className="mono" value={input.decision.questions} onChange={e => set({ questions: e.target.value })} spellCheck={false}/></label>
          </>}
        </div>
        <div className="lab-targets">
          <h3>실행 대상 <span className="count-label">{list.length}</span></h3>
          {list.length === 0 && <p className="quiet">대상을 추가해 주세요.</p>}
          {list.map(t => <div className="lab-target" key={t.key}>
            <select value={t.id} aria-label="Provider" onChange={e => edit(t.key, { id: e.target.value, model: '' })}>{options.map(p => <option key={p.id} value={p.id}>{p.name}{p.active ? ' (활성)' : ''}</option>)}</select>
            <input value={t.model} aria-label="모델 ID" placeholder={byId[t.id]?.model || '모델 ID'} onChange={e => edit(t.key, { model: e.target.value })} spellCheck={false} autoComplete="off"/>
            <IconButton icon="close" label="대상 빼기" onClick={() => setTargets(v => ({ ...v, [role]: v[role].filter(x => x.key !== t.key) }))}/>
          </div>)}
          <button type="button" className="text-button" disabled={!options.length || list.length >= 8} onClick={() => setTargets(v => ({ ...v, [role]: [...v[role], row(options[0])] }))}><Icon name="plus" size={14}/>대상 추가</button>
          <p className="quiet">모델 ID를 비우면 그 Provider의 기본 모델을 씁니다. 같은 Provider를 다른 모델 ID로 여러 번 넣을 수 있습니다.</p>
          <Button variant="primary" icon="play" busy={running} disabled={!list.length || running} onClick={start}>{running ? '실행 중' : list.length > 1 ? `${list.length}개 대상 동시에 실행` : '실행'}</Button>
        </div>
      </div>
    </div>
    {runs.length > 0 && <div className="lab-results" style={{ '--columns': Math.min(runs.length, 3) }}>{runs.map(r => <RunCard key={r.key} r={r} now={now} fastest={fastest}/>)}</div>}
  </section>;
});

function Answers({ answers }) {
  return <table className="lab-answers"><tbody>{Object.entries(answers).map(([id, a]) => {
    const top = a.probabilities ? Object.entries(a.probabilities).sort((x, y) => y[1] - x[1]).slice(0, 3) : [];
    return <tr key={id}><th>{id}</th><td><b>{a.type === 'choice' ? a.choice : a.type === 'score' ? Number(a.score).toFixed(2) : `${Math.round(a.noul * 100)}% 참`}</b>
      {top.length > 0 && <small>{top.map(([k, v]) => `${k} ${Math.round(v * 100)}%`).join(' · ')}</small>}</td>
      <td>{a.confidence != null ? `확신 ${Math.round(a.confidence * 100)}%` : ''}</td></tr>;
  })}</tbody></table>;
}

function RunCard({ r, now, fastest }) {
  const elapsed = r.state === 'running' ? now - r.started : r.ms;
  return <article className={'panel run-card ' + r.state}>
    <header><div><strong>{r.name}</strong><code>{r.model}</code></div>
      {r.state === 'running' ? <span className="loader" role="status" aria-label="실행 중"/> : r.state === 'done' ? <Tag tone="green">{fastest != null && r.ms === fastest ? '가장 빠름' : '완료'}</Tag> : <Tag tone="red">{errorNames[r.error?.code] || '실패'}</Tag>}</header>
    <div className="run-metrics"><div><b>{duration(elapsed)}</b><span>응답 시간</span></div>
      {r.state === 'done' && <><div><b>{number(r.input_tokens)}</b><span>입력 토큰</span></div><div><b>{number(r.output_tokens)}</b><span>출력 토큰</span></div>{r.tokens_per_s ? <div><b>{r.tokens_per_s}</b><span>토큰/초</span></div> : null}</>}</div>
    {r.state === 'failed' && <p className="run-error">{r.error?.message || '실행하지 못했습니다.'}{r.error?.status ? ` (HTTP ${r.error.status})` : ''}</p>}
    {r.state === 'done' && r.role === 'llm' && <>{r.json_valid === false && <p className="run-error">JSON으로 읽을 수 없는 출력입니다.</p>}<pre className={'run-output ' + (r.json_valid ? 'json' : '')}>{r.json_valid ? pretty(r.json) : r.text}</pre></>}
    {r.state === 'done' && r.role === 'decision' && <><Answers answers={r.answers}/><Details title="응답 원문" value={r.answers}/></>}
  </article>;
}
