// 사용자 관리 — 목록(행 전체 클릭 · 구분 · 정렬)과 사용자 상세(활동 내역 → LLM · 활동 로그 · 실패 로그 → 사용자 정보).
// 활동 내역: 기간별 총 횟수(제안서 · LLM 토큰 · 시뮬레이션 · 조감도 · 검토 · 로그인) + 기간별 그래프 + 기록 목록.
// 기록의 '열기'는 웹앱을 새 탭에서 그 사용자로, 읽기 전용으로 연다 (admin/activity.py open → app/api/inspect.py).
import { useEffect, useState } from 'react';
import { useApp, useLoad } from './context';
import { patch, number, compact } from './api';
import { Icon } from './icons';
import { Button, Badge, Modal, Empty, Loading, ErrorBox, Field, Pager, Toggle } from './components';
import { bucketLabel, TrendChart } from './charts';
import { UserActivity } from './operations';
import './users.css';

// Categorical order is fixed (validated: dataviz validate_palette, light surface) — color follows the kind, never its rank.
const KINDS = {
  proposal: { label: '제안서', color: '#0a8c70' },
  review: { label: '제안서 검토', color: '#2a78d6' },
  simulation: { label: '제안 시뮬레이션', color: '#eb6834' },
  birdseye: { label: '조감도', color: '#6250d6' },
};
const STACK = ['proposal', 'review', 'simulation', 'birdseye'];
const TOKENS = { input_tokens: { label: '입력', color: '#e34948' }, output_tokens: { label: '출력', color: '#eda100' } };
// 전체 사용자 일자별 활동 (머리 그래프). Colour follows the entity across this page (KINDS · TOKENS above); the eight hues in this
// order pass dataviz validate_palette (light, adjacent); 로그인 · 출력 토큰 sit below 3:1, so every drawn line is labelled at its end.
// Counts and tokens never share an axis: tokens get their own chart under the counts.
const TREND = [['proposal', '작성 제안서', KINDS.proposal.color], ['login', '로그인', '#e87ba4'], ['active', '활동 사용자', '#008300'],
  ['review', '제안서 검토', KINDS.review.color], ['simulation', '제안 시뮬레이션', KINDS.simulation.color], ['birdseye', '조감도', KINDS.birdseye.color],
  ['input_tokens', 'LLM 입력 토큰', TOKENS.input_tokens.color, true], ['output_tokens', 'LLM 출력 토큰', TOKENS.output_tokens.color, true]];
const TREND_DAYS = [[7, '7일'], [30, '30일'], [90, '90일']];

function UsersTrend() {
  const { version } = useApp();
  const [days, setDays] = useState(30), [withAdmin, setWithAdmin] = useState(false), [shown, setShown] = useState(['proposal', 'login']);
  const result = useLoad('/user-trend?' + qs({ start: dateKey(-(days - 1)), end: dateKey(), include_admin: withAdmin }), version);
  const data = result.data, rows = data?.rows || [];
  const toggle = key => setShown(list => list.includes(key) ? list.filter(k => k !== key) : [...list, key]);
  const pick = tokens => TREND.filter(([key, , , token]) => shown.includes(key) && !!token === tokens).map(([key, label, color]) => [key, label, color]);
  const counts = pick(false), tokens = pick(true);
  return <section className="panel ut-panel">
    <div className="ut-head"><h2>일자별 사용자 활동</h2>
      <div className="period-presets">{TREND_DAYS.map(([n, label]) => <button key={n} className={days === n ? 'selected' : ''} onClick={() => setDays(n)}>{label}</button>)}</div>
      <label className="admin-scope"><input type="checkbox" checked={withAdmin} onChange={e => setWithAdmin(e.target.checked)}/>admin 포함</label></div>
    <div className="ut-series" role="group" aria-label="그래프 지표">{TREND.map(([key, label, color]) => {
      const on = shown.includes(key), total = data?.totals?.[key];
      return <button key={key} aria-pressed={on} className={on ? 'on' : ''} onClick={() => toggle(key)} title={total === undefined ? undefined : number(total)}>
        <i style={{ background: color }}/>{label}{total !== undefined && data && <b>{key.endsWith('_tokens') ? compact(total) : number(total)}</b>}</button>;
    })}</div>
    {result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !data ? <Loading/> : <div className={'ut-charts' + (result.loading ? ' stale' : '')}>
      {counts.length > 0 && <TrendChart rows={rows} series={counts} legend={false} endLabels height={tokens.length ? 205 : 235}/>}
      {tokens.length > 0 && <TrendChart rows={rows} series={tokens} legend={false} endLabels height={counts.length ? 150 : 235}/>}
      {!counts.length && !tokens.length && <p className="quiet ut-none">선택한 지표가 없습니다.</p>}
    </div>}
  </section>;
}
/** 입력 / 출력 tokens, compact (exact numbers go in the cell's title). */
const InOut = ({ input, output }) => <span className="um-inout">{compact(input)}<i>/</i>{compact(output)}</span>;
const kindOf = kind => (kind === 'spatial' || kind === 'building' ? 'birdseye' : kind);
const recordLabel = row => (row.kind === 'spatial' ? '공간 조감도' : row.kind === 'building' ? '건물 조감도' : KINDS[row.kind].label);
const qs = value => new URLSearchParams(Object.fromEntries(Object.entries(value).filter(([, v]) => v !== '' && v !== undefined && v !== null && v !== false))).toString();
const dateKey = (offset = 0) => new Date(Date.now() + 9 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const time = value => value ? new Date(value * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '기록 없음';
const day = value => value ? new Date(value * 1000).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: '2-digit', day: '2-digit' }) : '—';
const now = () => Date.now() / 1000;
export function ago(value) {
  if (!value) return '기록 없음';
  const s = now() - value;
  if (s < 60) return '방금';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  if (s < 30 * 86400) return Math.floor(s / 86400) + '일 전';
  return day(value);
}
/** New tab → the webapp as this user, read-only. */
export const openUrl = (username, kind = 'home', id = '') => '/admin/api/users/' + encodeURIComponent(username) + '/open?' + qs({ kind, id });
const dormant = user => user.active && (!user.last_seen || user.last_seen < now() - 30 * 86400);

const SEGMENTS = [['', '전체', 'total'], ['recent', '최근 7일 활동', 'recent'], ['dormant', '30일 미접속', 'dormant'], ['never', '로그인 기록 없음', 'never'], ['inactive', '사용 중지', 'inactive'], ['admin', '관리자', 'admin']];
const SORTS = [['recent', '최근 활동순'], ['login', '최근 로그인순'], ['input', 'LLM 입력순 · 30일'], ['output', 'LLM 출력순 · 30일'], ['work', '작업 많은순'], ['name', '이름순'], ['created', '등록순']];

export function UsersPage() {
  const { version, open } = useApp();
  const [q, setQ] = useState(''), [segment, setSegment] = useState(''), [sort, setSort] = useState('recent'), [offset, setOffset] = useState(0), [selected, setSelected] = useState([]);
  const result = useLoad('/users?' + qs({ q, segment, sort, offset, limit: 20 }), version);
  useEffect(() => { setOffset(0); setSelected([]); }, [q, segment, sort]);
  const stats = result.data?.stats, items = result.data?.items || [];
  const show = username => open({ type: 'user', username });
  const toggle = (name, on) => setSelected(s => on ? [...s, name] : s.filter(v => v !== name));
  return <>
    <UsersTrend/>
    <div className="um-segments" role="tablist" aria-label="사용자 구분">{SEGMENTS.map(([id, label, key]) => <button key={id || 'all'} role="tab" aria-selected={segment === id} className={segment === id ? 'selected' : ''} onClick={() => setSegment(id)}><span>{label}</span><b>{stats ? number(stats[key]) : '–'}</b></button>)}</div>
    <section className="panel">
      <div className="asset-toolbar"><label className="search-field"><Icon name="search" size={17}/><input aria-label="사용자 검색" placeholder="아이디 또는 이름 검색" value={q} onChange={e => setQ(e.target.value)}/></label><select value={sort} aria-label="사용자 정렬" onChange={e => setSort(e.target.value)}>{SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
      <div className="asset-subbar"><span>총 <strong>{number(result.data?.total)}</strong>명{selected.length > 0 && <b className="selection-count">{selected.length}명 선택</b>}</span>{selected.length > 0 && <Button icon="refresh" onClick={() => open({ type: 'reset-users', usernames: selected.join(',') })}>선택 계정 비밀번호 재설정</Button>}</div>
      {result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !result.data ? <Loading/> : !items.length ? <Empty icon="users" title="조건에 맞는 사용자가 없습니다"/> : <>
        <div className="table-scroll"><table className="operations-table users-table um-table">
          <thead><tr><th><input type="checkbox" aria-label="사용자 전체 선택" checked={items.every(u => selected.includes(u.username))} onChange={e => setSelected(e.target.checked ? items.map(u => u.username) : [])}/></th><th>사용자</th><th>권한 · 상태</th><th>최근 활동</th><th className="num">제안서</th><th className="num">조감도</th><th className="num">시뮬레이션</th><th className="num">LLM 입력 · 출력 · 30일</th><th>최근 로그인</th><th/></tr></thead>
          <tbody>{items.map(user => <tr key={user.username} className="um-row" tabIndex={0} aria-label={user.username + ' 활동 보기'} onClick={() => show(user.username)} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); show(user.username); } }}>
            <td onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={user.username + ' 선택'} checked={selected.includes(user.username)} onChange={e => toggle(user.username, e.target.checked)}/></td>
            <td><div className="user-name"><span className="user-avatar">{user.username.slice(0, 2).toUpperCase()}</span><span><strong>{user.display_name}</strong><small>{user.username}</small></span></div></td>
            <td><span className="um-state"><span className="role-tag">{user.role === 'admin' ? '관리자' : '사용자'}</span><Badge status={user.active ? 'indexed' : 'archived'}>{user.active ? '사용 중' : '사용 중지'}</Badge></span></td>
            <td><span className="um-seen" title={time(user.last_seen)}>{ago(user.last_seen)}{dormant(user) && <i className="um-flag">미접속</i>}{user.errors_7d > 0 && <i className="um-flag error" title="최근 7일 오류">오류 {number(user.errors_7d)}</i>}</span></td>
            <td className="num">{number(user.proposals)}</td><td className="num">{number(user.birdseye)}</td><td className="num">{number(user.simulations)}</td>
            <td className="num" title={'입력 ' + number(user.input_30d) + ' · 출력 ' + number(user.output_30d) + ' tokens · 호출 ' + number(user.llm_calls_30d) + '회'}>{user.llm_calls_30d ? <InOut input={user.input_30d} output={user.output_30d}/> : '—'}</td>
            <td className="date-cell">{time(user.last_login)}</td>
            <td><button className="icon-button" aria-label={user.username + ' 상세'} onClick={e => { e.stopPropagation(); show(user.username); }}><Icon name="chevron" size={17}/></button></td>
          </tr>)}</tbody>
        </table></div>
        <Pager offset={offset} total={result.data.total} size={20} onChange={setOffset}/>
      </>}
    </section>
    <p className="operations-caption">비밀번호는 해시로 저장되며, 생성·재설정 직후에만 배정한 값을 확인할 수 있습니다. 비활성 계정의 기록은 보존됩니다.</p>
  </>;
}

const TABS = [['overview', '활동 내역'], ['llm', 'LLM 사용'], ['activity', '활동 로그'], ['errors', '실패 로그'], ['profile', '사용자 정보']];

export function UserDialog({ username }) {
  const { close, open, version } = useApp();
  const result = useLoad('/users/' + encodeURIComponent(username), version);
  const [tab, setTab] = useState('overview');
  const user = result.data;
  const subtitle = user ? [username, user.role === 'admin' ? '관리자' : '사용자', user.active ? '사용 중' : '사용 중지', '최근 로그인 ' + ago(user.last_login)].join(' · ') : username;
  return <Modal title={user?.display_name || username} subtitle={subtitle} close={close} wide
    actions={<a className="button um-webapp" href={openUrl(username)} target="_blank" rel="noopener" title="새 탭 · 읽기 전용">웹앱에서 보기<Icon name="external" size={14}/></a>}
    footer={<><Button icon="refresh" onClick={() => open({ type: 'reset-users', usernames: username })}>비밀번호 재설정</Button><Button onClick={close}>닫기</Button></>}>
    <div className="um-dialog">
      <div className="tabs dialog-tabs um-tabs" role="tablist">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}</div>
      {tab === 'overview' ? <ActivityOverview username={username} onTab={setTab}/>
        : tab === 'profile' ? result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !user ? <Loading/> : <Profile user={user}/>
          : <UserActivity username={username} mode={tab}/>}
    </div>
  </Modal>;
}

function Profile({ user }) {
  const { notify, refresh } = useApp();
  const [name, setName] = useState(null), [note, setNote] = useState(null), [busy, setBusy] = useState(false);
  async function save(value) { setBusy(true); try { await patch('/users/' + encodeURIComponent(user.username), value); refresh(); notify('사용자 설정을 저장했습니다.'); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); } }
  return <>
    <dl className="field-grid"><Field label={user.credential_source === 'legacy' ? '관리 등록' : '계정 생성'} value={day(user.created_at)}/><Field label="최근 로그인" value={time(user.last_login)}/><Field label="저장한 히스토리" value={`${number(user.history.reduce((n, v) => n + v.count, 0))}건`}/><Field label="인증" value={user.credential_source === 'legacy' ? '기존 계정 유지' : '관리 계정'}/></dl>
    <div className="setting-row"><div><h3>계정 사용</h3><p>중지하면 현재 로그인 세션도 사용할 수 없습니다.</p></div><Toggle checked={!!user.active} disabled={busy} label="계정 사용" onChange={active => save({ active })}/></div>
    <div className="form-stack user-settings"><label>표시 이름<input aria-label="사용자 표시 이름" value={name ?? user.display_name} onChange={e => setName(e.target.value)} maxLength={120}/></label><label>권한<select value={user.role} aria-label="사용자 권한" onChange={e => save({ role: e.target.value })}><option value="member">사용자</option><option value="admin">관리자</option></select></label><label>관리 메모<textarea rows="3" value={note ?? user.note ?? ''} onChange={e => setNote(e.target.value)}/></label><Button variant="primary" busy={busy} onClick={() => save({ display_name: name ?? user.display_name, note: note ?? user.note ?? '' })}>저장</Button></div>
  </>;
}

const PRESETS = [[1, '오늘'], [7, '7일'], [30, '30일'], [90, '90일'], [0, '전체']];
const LIST_KINDS = [['', '전체'], ['proposal', '제안서'], ['review', '검토'], ['simulation', '시뮬레이션'], ['birdseye', '조감도']];

function ActivityOverview({ username, onTab }) {
  const { version } = useApp();
  const [start, setStart] = useState(dateKey(-29)), [end, setEnd] = useState(dateKey()), [all, setAll] = useState(false), [samples, setSamples] = useState(false);
  const [kind, setKind] = useState(''), [q, setQ] = useState(''), [offset, setOffset] = useState(0), [metric, setMetric] = useState('work');
  const period = all ? { all: true, samples } : { start, end, samples };
  const base = '/users/' + encodeURIComponent(username) + '/activity';
  const summary = useLoad(base + '?' + qs(period), version);
  const list = useLoad(base + '/items?' + qs({ ...period, kind, q, offset, limit: 15 }), version);
  useEffect(() => setOffset(0), [start, end, all, samples, kind, q]);
  const s = summary.data;
  const preset = days => { if (!days) { setAll(true); return; } setAll(false); setStart(dateKey(-(days - 1))); setEnd(dateKey()); };
  const presetOn = days => days ? !all && start === dateKey(-(days - 1)) && end === dateKey() : all;
  const pick = id => setKind(k => (k === id ? '' : id));
  const c = s?.counts, birdseye = c ? { created: c.spatial.created + c.building.created, active: c.spatial.active + c.building.active, total: c.spatial.total + c.building.total } : null;
  const cards = s ? [
    { id: 'proposal', label: '제안서', value: number(c.proposal.created), unit: '건', note: `작업 ${number(c.proposal.active)} · 전체 ${number(c.proposal.total)}`, color: KINDS.proposal.color, onClick: () => pick('proposal') },
    { id: 'llm', label: 'LLM 입력 · 출력', value: <InOut input={s.llm.input_tokens} output={s.llm.output_tokens}/>, split: true, title: '입력 ' + number(s.llm.input_tokens) + ' · 출력 ' + number(s.llm.output_tokens) + ' tokens', note: `호출 ${number(s.llm.calls)}회${s.llm.errors ? ' · 실패 ' + number(s.llm.errors) : ''}`, onClick: () => onTab('llm') },
    { id: 'simulation', label: '제안 시뮬레이션', value: number(c.simulation.created), unit: '건', note: `작업 ${number(c.simulation.active)} · 전체 ${number(c.simulation.total)}`, color: KINDS.simulation.color, onClick: () => pick('simulation') },
    { id: 'birdseye', label: '조감도', value: number(birdseye.created), unit: '건', note: `공간 ${number(c.spatial.created)} · 건물 ${number(c.building.created)} · 전체 ${number(birdseye.total)}`, color: KINDS.birdseye.color, onClick: () => pick('birdseye') },
    { id: 'review', label: '제안서 검토', value: number(c.review.created), unit: '건', note: `작업 ${number(c.review.active)} · 전체 ${number(c.review.total)}`, color: KINDS.review.color, onClick: () => pick('review') },
    { id: 'access', label: '로그인', value: number(s.access.logins), unit: '회', note: `오류 ${number(s.access.errors)} · 로그인 실패 ${number(s.access.failed_logins)}`, alert: s.access.errors > 0, onClick: () => onTab(s.access.errors > 0 ? 'errors' : 'activity') },
  ] : [];
  return <div className="um-overview">
    <div className="um-period">
      <div className="period-presets">{PRESETS.map(([days, label]) => <button key={label} className={presetOn(days) ? 'selected' : ''} onClick={() => preset(days)}>{label}</button>)}</div>
      <div className="date-range"><input type="date" aria-label="활동 조회 시작일" value={start} disabled={all} onChange={e => { setAll(false); setStart(e.target.value); }}/><span>–</span><input type="date" aria-label="활동 조회 종료일" value={end} disabled={all} onChange={e => { setAll(false); setEnd(e.target.value); }}/></div>
      {s?.samples > 0 && <label className="um-check"><input type="checkbox" checked={samples} onChange={e => setSamples(e.target.checked)}/>예시 포함</label>}
      {s && <span className="um-seen-line" title={time(s.access.last_seen_ever)}>최근 활동 {ago(s.access.last_seen_ever)}</span>}
    </div>
    {summary.error ? <ErrorBox error={summary.error} retry={summary.retry}/> : !s ? <Loading/> : <>
      <div className="um-cards">{cards.map(card => <button key={card.id} className={'um-card' + ((card.id === kind || (card.id === 'birdseye' && kind === 'birdseye')) ? ' selected' : '') + (card.alert ? ' alert' : '')} onClick={card.onClick} title={card.title}>
        <span className="um-card-label">{card.color && <i style={{ background: card.color }}/>}{card.label}</span>
        <span className={'um-card-value' + (card.split ? ' split' : '')}>{card.value}{card.unit && <small>{card.unit}</small>}</span>
        <span className="um-card-note">{card.note}</span>
      </button>)}</div>
      <section className="um-chart-panel">
        <div className="um-chart-head"><h3>{metric === 'work' ? '기간별 새 기록' : metric === 'tokens' ? '기간별 LLM 토큰' : '기간별 로그인'}<small>{s.series.bucket === 'week' ? '주별' : '일별'} · 한국시간</small></h3>
          <div className="period-presets">{[['work', '기록'], ['tokens', 'LLM 토큰'], ['logins', '로그인']].map(([id, label]) => <button key={id} className={metric === id ? 'selected' : ''} onClick={() => setMetric(id)}>{label}</button>)}</div></div>
        <ActivityChart rows={s.series.rows} metric={metric} weekly={s.series.bucket === 'week'}/>
      </section>
    </>}
    <section className="um-records">
      <div className="um-records-head">
        <div className="um-kinds" role="tablist" aria-label="기록 종류">{LIST_KINDS.map(([id, label]) => <button key={id || 'all'} role="tab" aria-selected={kind === id} className={kind === id ? 'selected' : ''} onClick={() => setKind(id)}>{id && <i style={{ background: KINDS[id].color }}/>}{label}{c && <b>{number(id === '' ? STACK.reduce((n, k) => n + (k === 'birdseye' ? birdseye.active : c[k].active), 0) : id === 'birdseye' ? birdseye.active : c[id].active)}</b>}</button>)}</div>
        <label className="search-field"><Icon name="search" size={15}/><input aria-label="기록 검색" placeholder="제목 · 고객 · ID" value={q} onChange={e => setQ(e.target.value)}/></label>
      </div>
      {list.error ? <ErrorBox error={list.error} retry={list.retry}/> : !list.data ? <Loading/> : !list.data.items.length ? <Empty icon="clock" title="이 기간에 작업한 기록이 없습니다"/> : <>
        <div className="table-scroll"><table className="operations-table um-record-table">
          <thead><tr><th>구분</th><th>기록</th><th>상태</th><th>만든 날</th><th>최근 작업</th><th className="num">LLM 입력 · 출력</th><th><span className="sr-only">웹앱에서 보기</span></th></tr></thead>
          <tbody>{list.data.items.map(row => <RecordRow key={row.kind + row.id} row={row} username={username}/>)}</tbody>
        </table></div>
        <Pager offset={offset} total={list.data.total} size={15} onChange={setOffset}/>
      </>}
    </section>
  </div>;
}

function RecordRow({ row, username }) {
  const href = openUrl(username, row.kind, row.id);
  const detail = [row.customer, row.industry].filter(Boolean).join(' · ') || row.id;
  const tags = [row.sample && '예시', row.kind === 'proposal' && row.sheets ? row.sheets + '장' : null, row.shared && '공유', row.exported && 'PPTX',
    row.kind === 'simulation' && row.turns ? row.turns + '턴' : null, row.kind === 'building' && row.floors ? row.floors + '층' : null, row.kind === 'review' && row.files ? '파일 ' + row.files : null].filter(Boolean);
  return <tr>
    <td><span className="um-kind"><i style={{ background: KINDS[kindOf(row.kind)].color }}/>{recordLabel(row)}</span></td>
    <td><a className="um-record" href={href} target="_blank" rel="noopener" title={row.title}><strong>{row.title}</strong><small>{detail}</small></a></td>
    <td><span className="um-status">{row.status && <span>{row.status}</span>}{tags.map(tag => <em key={tag}>{tag}</em>)}</span></td>
    <td className="date-cell" title={time(row.created_at)}>{day(row.created_at)}</td>
    <td className="date-cell" title={time(row.updated_at)}>{ago(row.updated_at)}</td>
    <td className="num" title={row.llm_calls ? '입력 ' + number(row.input_tokens) + ' · 출력 ' + number(row.output_tokens) + ' tokens · 호출 ' + number(row.llm_calls) + '회' : undefined}>{row.llm_calls ? <InOut input={row.input_tokens} output={row.output_tokens}/> : '—'}</td>
    <td><a className="um-open" href={href} target="_blank" rel="noopener" aria-label={row.title + ' 웹앱에서 보기'}>열기<Icon name="external" size={13}/></a></td>
  </tr>;
}

// Stacked columns (기록 · LLM 입력/출력) or one series (로그인): ≤24px columns, 2px surface gap between stacked segments,
// 4px rounded data-end, hairline grid, per-column hover tooltip; legend only for the stacked form.
function ActivityChart({ rows, metric, weekly }) {
  const [hover, setHover] = useState(null);
  const W = 820, H = 160, left = 46, right = 12, top = 12, bottom = 26, width = W - left - right, height = H - top - bottom;
  const keys = metric === 'work' ? STACK : metric === 'tokens' ? Object.keys(TOKENS) : ['logins'];
  const stacked = metric !== 'logins', color = k => (KINDS[k] || TOKENS[k] || KINDS.proposal).color;
  const total = row => keys.reduce((n, k) => n + (Number(row[k]) || 0), 0);
  const peak = Math.max(0, ...rows.map(total));
  const nice = (() => { if (peak <= 4) return 4; const p = 10 ** Math.floor(Math.log10(peak)); return [1, 2, 2.5, 5, 10].map(m => m * p).find(v => v >= peak); })();
  const band = width / Math.max(1, rows.length), bar = Math.max(3, Math.min(24, band * .62));
  const y = v => top + height - v / nice * height;
  const label = row => bucketLabel(row.bucket) + (weekly ? ' 주' : '');
  const tick = v => metric === 'tokens' ? compact(v) : number(v);
  const step = Math.ceil(rows.length / 8);
  const active = hover === null ? null : rows[hover];
  const names = { proposal: '제안서', review: '검토', simulation: '시뮬레이션', birdseye: '조감도', input_tokens: '입력', output_tokens: '출력', logins: '로그인' };
  return <div className="um-chart">
    {stacked && <div className="chart-legend">{keys.map(k => <span key={k}><i style={{ background: color(k) }}/>{names[k]}</span>)}</div>}
    <div className="chart-canvas"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={(metric === 'work' ? '기간별 새 기록 수' : metric === 'tokens' ? '기간별 LLM 입력 · 출력 토큰' : names[keys[0]]) + ' 막대 그래프'} onMouseLeave={() => setHover(null)}>
      {[0, .5, 1].map(r => <g key={r}><line x1={left} x2={W - right} y1={y(r * nice)} y2={y(r * nice)} stroke="#edf2f4"/><text x={left - 9} y={y(r * nice) + 3.5} textAnchor="end" className="chart-axis">{tick(r * nice)}</text></g>)}
      {rows.map((row, i) => {
        const x = left + band * i + (band - bar) / 2;
        let base = y(0);
        const parts = keys.map(k => ({ k, v: Number(row[k]) || 0 })).filter(p => p.v > 0);
        return <g key={row.bucket}>
          {parts.map((p, j) => {
            const h = p.v / nice * height, last = j === parts.length - 1;
            const y2 = base, y1 = base - h + (last ? 0 : Math.min(2, h / 2)); // 2px surface gap above every inner segment
            base -= h;
            const r = last ? Math.min(4, bar / 2, y2 - y1) : 0, x2 = x + bar;
            const d = `M${x} ${y2}V${y1 + r}${r ? `Q${x} ${y1} ${x + r} ${y1}H${x2 - r}Q${x2} ${y1} ${x2} ${y1 + r}` : `H${x2}`}V${y2}Z`;
            return <path key={p.k} d={d} fill={color(p.k)} opacity={hover === null || hover === i ? 1 : .45}/>;
          })}
          <rect x={left + band * i} y={top} width={band} height={height} fill="transparent" onMouseEnter={() => setHover(i)}/>
        </g>;
      })}
      {rows.map((row, i) => (i % step === 0 || i === rows.length - 1) && (rows.length - 1 - i >= step / 2 || i === rows.length - 1) ? <text key={row.bucket} x={left + band * i + band / 2} y={H - 9} textAnchor="middle" className="chart-axis">{bucketLabel(row.bucket)}</text> : null)}
    </svg>
    {!peak && <div className="chart-zero">이 기간에 기록이 없습니다.</div>}
    {active && <div className="chart-tooltip" style={{ left: Math.min(84, Math.max(10, (left + band * hover + band / 2) / W * 100)) + '%' }}><strong>{label(active)}</strong>{keys.map(k => <span key={k}><i style={{ background: color(k) }}/>{names[k]}<b>{number(active[k])}</b></span>)}{stacked && <span className="um-tip-total">합계<b>{number(total(active))}</b></span>}</div>}
    </div>
  </div>;
}
