import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, post, patch, number, date, bytes, kindNames, jobNames } from './api';
import { Icon, iconFor } from './icons';
import { Badge, Button, IconButton, Modal, Empty, Loading, ErrorBox, Details, Field, Progress, Toggle, Pager } from './components';
import './style.css';

import { Context, useApp, useLoad } from './context';
import { UsersPage, TracingPage, OperationDialogs } from './operations';
import { AssetResourceSummary, AssetResources } from './resources';
import { CustomerVoicePage, useVoiceInbox } from './customer-voice';
import { startTelemetry, recordScreen } from '../../../app/web/src/services/telemetry.js';
const pageFromUrl = () => location.pathname.replace(/^\/admin\/?/, '').split('/')[0] || 'overview';
const navigation = [{ id: 'overview', name: '관리 개요', icon: 'grid' }, { id: 'sources', name: '데이터 소스', icon: 'globe' }, { id: 'assets', name: '에셋 라이브러리', icon: 'layers' }, { id: 'jobs', name: '작업 내역', icon: 'clock' }, { id: 'voice', name: '사용자님의 목소리', icon: 'chat' }, { id: 'users', name: '사용자 관리', icon: 'users' }, { id: 'tracing', name: '사용 추적', icon: 'chart' }, { id: 'system', name: '시스템', icon: 'settings' }];
const running = s => ['running', 'queued'].includes(s);
const sourceIcon = s => ({ samsung: 'globe', catalogs: 'book', media: 'link', images: 'image', templates: 'layers', spatial: 'box', uploads: 'upload' }[s.id] || 'globe');

function App() {
  const [page, setPage] = useState(pageFromUrl);
  const [version, setVersion] = useState(0);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const info = useLoad('/overview', version);
  const voice = useVoiceInbox('?limit=1');
  const go = useCallback((name, params = '') => { history.pushState({}, '', '/admin/' + (name === 'overview' ? '' : name) + params); setPage(name); setMobileMenu(false); }, []);
  useEffect(() => { const pop = () => setPage(pageFromUrl()); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, info.data?.active_jobs ? 2200 : 20000);
    return () => clearInterval(timer);
  }, [info.data?.active_jobs, refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 5500); return () => clearTimeout(timer); }, [toast]);
  const notify = useCallback((text, type = 'success') => setToast({ text, type }), []);
  const act = useCallback(async (kind, source_id = null, extra = {}) => {
    setBusy(true);
    try { const job = await post('/jobs', { kind, source_id, ...extra }); setModal({ type: 'job', id: job.id }); refresh(); }
    catch (e) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  }, [refresh, notify]);
  const context = { info: info.data, version, refresh, go, modal, open: setModal, close: () => setModal(null), notify, act, busy };
  useEffect(() => { if(info.data?.user) void startTelemetry(info.data.user).then(() => recordScreen('admin.'+page)); }, [info.data?.user?.username]);
  useEffect(() => recordScreen('admin.'+page),[page]);
  const current = navigation.find(n => n.id === page);
  return <Context.Provider value={context}><div className="app-shell">
    <aside className={'sidebar ' + (mobileMenu ? 'mobile-open' : '')}>
      <a className="brand" href="/admin/" onClick={e => { e.preventDefault(); go('overview'); }}><span className="brand-mark">w<span/></span><div>winmate<span>ADMIN CONSOLE</span></div></a>
      <div className="workspace-switch"><span className="workspace-dot"/><div>Winmate Workspace<small>콘텐츠 · 데이터 관리</small></div><Icon name="down" size={14}/></div>
      <p className="nav-label">WORKSPACE</p><nav>{navigation.slice(0, 3).map(n => <NavLink key={n.id} n={n} page={page} go={go}/>)}</nav>
      <p className="nav-label operations-label">OPERATIONS</p><nav>{navigation.slice(3).map(n => <NavLink key={n.id} n={n} page={page} go={go} count={n.id === 'jobs' ? info.data?.active_jobs : n.id === 'voice' ? voice.data?.unread : 0}/>)}</nav>
      <div className="sidebar-bottom"><div className="environment"><span className="live-dot"/><div>로컬 관리 환경<small>격리 DB에 변경 사항 반영</small></div><Icon name="shield" size={17}/></div><a href="/" className="back-to-app"><Icon name="external" size={16}/>Winmate 앱 열기<Icon name="arrow" size={15}/></a><div className="profile"><span className="avatar">{info.data?.user?.username?.slice(0,2).toUpperCase() || 'A'}</span><div>{info.data?.user?.username || 'Administrator'}<small>관리자 계정</small></div><a href="/account.html" aria-label="계정 설정"><Icon name="settings" size={17}/></a></div></div>
    </aside>
    {mobileMenu && <button className="sidebar-scrim" aria-label="메뉴 닫기" onClick={() => setMobileMenu(false)}/>}
    <div className="main-shell"><header className="topbar"><div className="topbar-left"><IconButton icon="grid" label="메뉴" onClick={() => setMobileMenu(v => !v)}/><span>Workspace</span><span className="slash">/</span><strong>{current?.name || '페이지'}</strong></div><div className="topbar-right"><span className="local-label"><i/>LOCAL</span><span className="topbar-divider"/><span className={'ai-indicator ' + (info.data?.ai.configured ? 'connected' : '')}><Icon name="spark" size={14}/>{info.data?.ai.configured ? 'AI 연결됨' : 'AI 설정 확인'}</span><IconButton icon="info" label="관리 환경 안내" onClick={() => setModal({ type: 'about' })}/></div></header>
      <main><div className="page-heading"><div><div className="eyebrow">WINMATE ADMIN</div><h1>{current?.name || '페이지를 찾지 못했습니다'}</h1><p>{({ overview: '흩어진 데이터와 에셋을 연결하고, 최신 상태를 유지하세요.', sources: '원본의 변경을 확인하고, 필요한 데이터를 업데이트하세요.', assets: 'Winmate의 모든 자료를 찾고, 추가하고, 정리하세요.', jobs: '백그라운드 작업의 진행 상황과 변경 결과를 확인하세요.', users: '계정을 추가하고, 사용자별 히스토리와 활동을 확인하세요.', tracing: '화면 활동부터 오류와 AI 사용량까지 흐름을 추적하세요.', voice: '고객 의견과 전송 당시의 작업 상태를 함께 확인하세요.', system: '데이터 무결성, 버전, 백업을 한곳에서 확인하세요.' })[page]}</p></div>{page === 'users' ? <Button variant="primary" icon="plus" onClick={() => setModal({ type: 'create-users' })}>사용자 추가</Button> : page === 'voice' ? <Button icon="refresh" onClick={() => { refresh(); voice.refresh(); }}>의견 새로고침</Button> : page === 'tracing' ? <Button icon="refresh" onClick={refresh}>기록 새로고침</Button> : <Button variant="primary" icon="plus" onClick={() => setModal({ type: 'add' })}>에셋 추가</Button>}</div>
      {info.error ? <ErrorBox error={info.error} retry={info.retry}/> : !info.data ? <Loading/> : <>{page === 'overview' && <Overview/>}{page === 'sources' && <Sources/>}{page === 'assets' && <Assets/>}{page === 'jobs' && <Jobs/>}{page === 'system' && <System/>}{page === 'users' && <UsersPage/>}{page === 'tracing' && <TracingPage/>}{page === 'voice' && <CustomerVoicePage/>}{!current && <Empty title="이 페이지는 없습니다" action={<Button onClick={() => go('overview')}>관리 개요로</Button>}/>}</>}
      <footer className="page-footer"><span>Winmate Admin <i>·</i> 모든 시각은 한국 표준시 기준</span><span>관리 DB와 원본의 변경 기록을 보존합니다.</span></footer></main>
    </div>
    {toast && <div role={toast.type === 'error' ? 'alert' : 'status'} className={'toast ' + toast.type}><Icon name={toast.type === 'error' ? 'alert' : 'check'} size={18}/><span>{toast.text}</span><IconButton icon="close" label="알림 닫기" onClick={() => setToast(null)}/></div>}
    <OperationDialogs modal={modal}/>{modal?.type === 'source' && <SourceDialog id={modal.id}/>}{modal?.type === 'asset' && <AssetDialog id={modal.id}/>}{modal?.type === 'add' && <AddDialog/>}{modal?.type === 'job' && <JobDialog id={modal.id}/>}{modal?.type === 'refresh' && <RefreshDialog sid={modal.id}/>}{modal?.type === 'database' && <DatabaseDialog id={modal.id}/>}{modal?.type === 'release' && <ReleaseDialog release={modal.release}/>}{modal?.type === 'new-source' && <NewSourceDialog/>}{modal?.type === 'events' && <EventsDialog/>}{modal?.type === 'about' && <AboutDialog/>}
  </div></Context.Provider>;
}

function NavLink({ n, page, go, count }) { return <a href={'/admin/' + (n.id === 'overview' ? '' : n.id)} className={'nav-item ' + (page === n.id ? 'active' : '')} aria-current={page === n.id ? 'page' : undefined} onClick={e => { e.preventDefault(); go(n.id); }}><Icon name={n.icon} size={19}/><span>{n.name}</span>{count > 0 && <b>{count}</b>}</a>; }

function Overview() {
  const { info, open, act, go, busy } = useApp();
  const counts = Object.fromEntries(info.stats.map(s => [s.kind, s.count]));
  const external = info.sources.filter(s => ['samsung', 'catalogs', 'media'].includes(s.id));
  const stats = [{ label: '전체 에셋', value: info.total_assets, unit: '개', icon: 'layers', note: '제품 · 이미지 · 문서 · 템플릿' },
    { label: '제품 데이터', value: counts.product, unit: '개', icon: 'box', note: '사이트 · 카탈로그 · 큐레이션' },
    { label: '연결된 소스', value: info.sources.filter(s => s.enabled).length, unit: '개', icon: 'globe', note: '외부 원본과 내부 라이브러리' },
    { label: '확인이 필요한 소스', value: info.attention, unit: '개', icon: 'spark', note: 'AI 점검으로 최신성 확인', accent: true }];
  return <><div className="stats-grid">{stats.map((s, i) => <button key={s.label} className={'stat-card ' + (s.accent ? 'attention-stat' : '')} onClick={() => go(i < 2 ? 'assets' : 'sources')}><div className="stat-top"><span>{s.label}</span><span className="stat-icon"><Icon name={s.icon} size={18}/></span></div><div className="stat-value">{number(s.value)}<small>{s.unit}</small></div><p>{s.note}</p></button>)}</div>
    <section className="refresh-banner"><div className="banner-content"><span className="banner-kicker"><Icon name="spark" size={15}/>AI DATA OPERATIONS</span><h2>좋은 제안의 시작,<br/>최신 데이터에서.</h2><p>새로 올라온 자료와 달라진 내용을 AI가 확인합니다.<br/>필요한 업데이트를 한 번에 시작하세요.</p><div className="banner-actions"><Button variant="dark" icon="spark" busy={busy} onClick={() => act('check')}>AI 최신성 점검</Button><Button icon="refresh" onClick={() => open({ type: 'refresh' })}>DB 최신화</Button></div></div><div className="banner-visual" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><span className="orbit-node node-one"><Icon name="book" size={21}/></span><span className="orbit-node node-two"><Icon name="image" size={20}/></span><span className="orbit-node node-three"><Icon name="globe" size={20}/></span><div className="database-illustration"><Icon name="database" size={60}/><span><Icon name="spark" size={17}/></span></div><div className="visual-caption"><i/>SOURCE → AI → DATABASE</div></div><div className="banner-status"><span className="live-dot"/>{info.active_jobs ? `${info.active_jobs}개 작업 진행 중` : '점검 준비 완료'}</div></section>
    <section className="section-block"><div className="section-heading"><div><h2>주요 데이터 소스 <span className="count-label">{external.length}</span></h2><p>원본의 수집 시점과 업데이트 상태를 확인하세요.</p></div><button className="text-button" onClick={() => go('sources')}>전체 소스 보기<Icon name="arrow" size={15}/></button></div><div className="source-grid overview-sources">{external.map(s => <SourceCard key={s.id} source={s}/>)}</div></section>
    <div className="overview-bottom"><section className="panel activity-panel"><div className="panel-heading"><h2>최근 작업</h2><button className="text-button" onClick={() => go('jobs')}>전체 보기<Icon name="arrow" size={15}/></button></div>{info.jobs.length ? <div className="activity-list">{info.jobs.slice(0, 4).map(j => <JobRow key={j.id} job={j}/>)}</div> : <div className="activity-empty"><span className="subtle-icon"><Icon name="clock" size={23}/></span><div><strong>아직 실행한 작업이 없습니다.</strong><p>최신성 점검을 시작하면 이곳에서 확인할 수 있어요.</p></div></div>}</section><section className="panel add-panel"><div className="add-panel-icon"><Icon name="upload" size={24}/></div><h3>새로운 자료가 있나요?</h3><p>파일이나 링크를 추가하면<br/>AI가 분석해 관리 DB에 등록합니다.</p><button className="text-button" onClick={() => open({ type: 'add' })}>자료 추가하기<Icon name="arrow" size={15}/></button><span className="format-note">PDF · PPTX · DOCX · 이미지 · URL</span></section></div>
    <div className="index-note"><Icon name="shield" size={14}/>최근 로컬 색인 {date(info.indexed_at, true)}<span>기존 앱 수집일은 소스별로 별도 표시됩니다.</span></div>
  </>;
}

function SourceCard({ source: s }) {
  const { open, act, busy } = useApp();
  return <article className={'source-card ' + (!s.enabled ? 'disabled-source' : '')}><div className="source-card-top"><span className={'source-symbol ' + s.id}>{s.id === 'samsung' ? <strong>S</strong> : <Icon name={sourceIcon(s)} size={22}/>}</span><Badge status={s.enabled ? s.status : 'archived'}>{!s.enabled ? '사용 중지' : undefined}</Badge></div><h3>{s.name}</h3><p className="source-description">{s.description}</p><div className="source-count">{number(s.asset_count)}<span>개 에셋</span></div><dl className="source-dates"><div><dt>자료 기준일</dt><dd>{date(s.refreshed_at || s.imported_at)}</dd></div><div><dt>마지막 점검</dt><dd>{s.checked_at ? date(s.checked_at) : '점검 전'}</dd></div></dl><footer><Button variant="ghost" onClick={() => open({ type: 'source', id: s.id })}>상세 보기</Button>{s.url ? <Button icon="spark" disabled={!s.enabled || busy} onClick={() => act('check', s.id)}>점검하기</Button> : <Button icon="layers" onClick={() => open({ type: 'source', id: s.id })}>에셋 보기</Button>}</footer></article>;
}

function Sources() {
  const { info, open } = useApp();
  const [tab, setTab] = useState('all');
  const rows = info.sources.filter(s => tab === 'all' || (tab === 'external' ? !!s.url : !s.url));
  return <><div className="toolbar"><div className="tabs">{[['all', '모든 소스'], ['external', '외부 원본'], ['internal', '내부 라이브러리']].map(([id, name]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{name}</button>)}</div><Button icon="plus" onClick={() => open({ type: 'new-source' })}>소스 연결</Button></div><div className="source-grid">{rows.map(s => <SourceCard key={s.id} source={s}/>)}</div><div className="info-strip"><Icon name="info" size={17}/><p>점검은 현재 원본과 수집 기록을 비교합니다. 신규·변경 자료는 별도 작업 공간에서 검증한 뒤 관리 DB에 반영합니다.</p></div></>;
}

function Assets() {
  const { info, version, open, notify, refresh } = useApp();
  const initial = useMemo(() => new URLSearchParams(location.search), []);
  const [query, setQuery] = useState(''), [debounced, setDebounced] = useState('');
  const [kind, setKind] = useState(initial.get('kind') || ''), [source, setSource] = useState(initial.get('source') || ''), [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0), [selected, setSelected] = useState([]), [saving, setSaving] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(query), 250); return () => clearTimeout(t); }, [query]);
  useEffect(() => { setOffset(0); setSelected([]); }, [debounced, kind, source, status]);
  const path = '/assets?' + new URLSearchParams({ q: debounced, kind, source, status, offset: String(offset), limit: '12' });
  const result = useLoad(path, version);
  async function bulk(state) {
    setSaving(true);
    try { for (const id of selected) await patch('/assets/' + encodeURIComponent(id), { status: state }); notify(`${selected.length}개 에셋의 상태를 변경했습니다.`); setSelected([]); refresh(); }
    catch (e) { notify(e.message, 'error'); }
    finally { setSaving(false); }
  }
  return <section className="panel asset-panel"><div className="asset-toolbar"><label className="search-field"><Icon name="search" size={18}/><input placeholder="이름, 모델코드, 내용으로 검색" value={query} onChange={e => setQuery(e.target.value)} aria-label="에셋 검색"/>{query && <IconButton icon="close" label="검색 지우기" onClick={() => setQuery('')}/>}</label><div className="filter-controls"><select aria-label="에셋 유형" value={kind} onChange={e => setKind(e.target.value)}><option value="">모든 유형</option>{Object.entries(kindNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select><select aria-label="데이터 소스" value={source} onChange={e => setSource(e.target.value)}><option value="">모든 소스</option>{info.sources.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}</select><select aria-label="등록 상태" value={status} onChange={e => setStatus(e.target.value)}><option value="">모든 상태</option><option value="indexed">등록됨</option><option value="needs_review">검토 필요</option><option value="pending">분석 대기</option><option value="analysis_failed">분석 실패</option><option value="archived">보관됨</option></select></div></div>
    <div className="asset-subbar"><span><strong>{number(result.data?.total)}</strong>개 에셋 {selected.length > 0 && <b className="selection-count">{selected.length}개 선택</b>}</span>{selected.length ? <div className="button-row"><Button busy={saving} icon="archive" onClick={() => bulk('archived')}>보관</Button><Button busy={saving} onClick={() => bulk('indexed')}>복원</Button></div> : <a className="text-button" href={'/admin/api/export?' + new URLSearchParams({ source, kind })}><Icon name="download" size={16}/>내보내기</a>}</div>
    {result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !result.data ? <Loading/> : result.data.items.length ? <><div className="table-scroll"><table className="asset-table"><thead><tr><th className="checkbox-cell"><input type="checkbox" aria-label="현재 페이지 전체 선택" checked={result.data.items.length > 0 && result.data.items.every(a => selected.includes(a.id))} onChange={e => setSelected(e.target.checked ? result.data.items.map(a => a.id) : [])}/></th><th>에셋 이름</th><th>유형</th><th>데이터 소스</th><th>자료 기준일</th><th>상태</th><th/></tr></thead><tbody>{result.data.items.map(a => <tr key={a.id}><td className="checkbox-cell"><input type="checkbox" aria-label={a.title + ' 선택'} checked={selected.includes(a.id)} onChange={e => setSelected(s => e.target.checked ? [...s, a.id] : s.filter(id => id !== a.id))}/></td><td><button className="asset-name" onClick={() => open({ type: 'asset', id: a.id })}><span className={'asset-type-icon ' + a.kind}><Icon name={iconFor(a.kind)} size={19}/></span><span><strong>{a.title}</strong><small>{a.external_id || a.id}</small></span></button></td><td><span className="type-label">{kindNames[a.kind] || a.kind}</span></td><td className="source-cell">{info.sources.find(s => s.id === a.source_id)?.name || a.source_id}</td><td className="date-cell">{date(a.imported_at)}</td><td><Badge status={a.status}/></td><td><IconButton icon="chevron" label={a.title + ' 상세'} onClick={() => open({ type: 'asset', id: a.id })}/></td></tr>)}</tbody></table></div><Pager offset={offset} total={result.data.total} onChange={setOffset}/></> : <Empty icon="search" title="조건에 맞는 에셋이 없습니다">검색어와 필터를 바꾸거나 새 자료를 추가해 보세요.</Empty>}
  </section>;
}

function JobRow({ job: j, expanded = false }) {
  const { open, info } = useApp();
  return <button className="job-row" onClick={() => open({ type: 'job', id: j.id })}><span className={'job-icon ' + (running(j.status) ? 'working' : '')}><Icon name={j.status === 'succeeded' ? 'check' : j.status === 'failed' ? 'alert' : 'refresh'} size={18} className={j.status === 'running' ? 'spin' : ''}/></span><span className="job-row-content"><strong>{jobNames[j.kind] || j.kind}<small>{info.sources.find(s => s.id === j.source_id)?.name || (['check', 'refresh'].includes(j.kind) ? '전체 외부 소스' : 'Winmate')}</small></strong><span>{running(j.status) ? j.stage : date(j.created_at, true)}</span>{running(j.status) && <Progress value={j.progress}/>}</span><Badge status={j.status}/><Icon name="chevron" size={16}/></button>;
}

function Jobs() {
  const { version } = useApp();
  const [offset, setOffset] = useState(0), [filter, setFilter] = useState('all');
  const result = useLoad('/jobs?' + new URLSearchParams({ offset, limit: 30 }), version);
  const rows = result.data?.items.filter(j => filter === 'all' || (filter === 'active' ? running(j.status) : ['failed', 'partial', 'interrupted'].includes(j.status)));
  return <section className="panel jobs-panel"><div className="toolbar inset"><div className="tabs">{[['all', '모든 작업'], ['active', '진행 중'], ['errors', '확인 필요']].map(([id, label]) => <button key={id} className={filter === id ? 'selected' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div><span className="quiet">화면을 닫아도 작업은 계속됩니다.</span></div>{result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !result.data ? <Loading/> : rows.length ? <><div className="jobs-list">{rows.map(j => <JobRow job={j} key={j.id}/>)}</div><Pager offset={offset} total={result.data.total} size={30} onChange={setOffset}/></> : <Empty icon="clock" title={filter === 'all' ? '아직 작업 내역이 없습니다' : '해당하는 작업이 없습니다'}>소스를 점검하거나 자료를 추가하면 실행 결과가 기록됩니다.</Empty>}</section>;
}

function System() {
  const { info, open, act, busy, notify, refresh, version } = useApp();
  const releases = useLoad('/releases', version), backups = useLoad('/backups', version);
  const [backupTarget,setBackupTarget] = useState('admin');
  const checks = info.diagnostics?.checks || [];
  async function automatic(value) { try { await patch('/settings', { automatic_checks: value }); refresh(); notify(value ? '소스별 주기에 맞춰 AI가 원본을 점검합니다.' : '자동 점검을 껐습니다.'); } catch (e) { notify(e.message, 'error'); } }
  return <><div className="system-db-grid">{[['source', '원본 제품 DB', '삼성 사이트 · e-카탈로그 원본'], ['runtime', '앱 제품 DB', '현재 Winmate가 사용하는 데이터'], ['admin', '관리자 DB', '에셋 · 출처 · AI 판단 · 작업 기록']].map(([id, title, desc]) => <button key={id} className="panel db-card" onClick={() => open({ type: 'database', id })}><span className={'source-symbol ' + id}><Icon name="database" size={23}/></span><h3>{title}</h3><p>{desc}</p><span className="text-button">테이블 살펴보기<Icon name="arrow" size={16}/></span></button>)}</div>
    <section className="panel system-panel"><div className="panel-heading"><div><h2>데이터 상태 진단</h2><p>{info.diagnostics ? `최근 진단 ${date(info.diagnostics.checked_at, true)}` : 'DB와 참조 연결을 검사해 데이터 상태를 확인하세요.'}</p></div><Button icon="heart" busy={busy} onClick={() => act('diagnose')}>진단 실행</Button></div>{checks.length ? <div className="check-list">{checks.map(c => <details key={c.id} className="check-row"><summary><span className={'check-status ' + (c.ok ? 'okay' : 'issue')}><Icon name={c.ok ? 'check' : 'alert'} size={17}/></span><strong>{c.name}</strong><span>{c.ok ? '정상' : '확인 필요'}</span><Icon name="down" size={15}/></summary><pre>{JSON.stringify(c, null, 2)}</pre></details>)}</div> : <div className="system-placeholder"><Icon name="shield" size={20}/><span>SQLite 무결성 · 제품 상세 연결 · Agent KB 입력 해시를 확인합니다.</span></div>}</section>
    <section className="panel system-panel"><div className="panel-heading"><div><h2>데이터 버전</h2><p>관리 DB에 반영한 변경과 이전 버전의 복구본입니다.</p></div><Button icon="layers" onClick={() => act('reindex')} busy={busy}>에셋 다시 스캔</Button></div>{releases.error ? <ErrorBox error={releases.error} retry={releases.retry}/> : releases.data?.items.length ? <div className="release-list">{releases.data.items.slice(0, 8).map(r => <button key={r.id} className="release-row" onClick={() => open({ type: 'release', release: r })}><Icon name="database" size={19}/><div><strong>{info.sources.find(s => s.id === r.source_id)?.name || r.source_id}</strong><span>{date(r.at, true)} · 변경 {r.manifest.changes.length}건</span></div><Badge status={r.status}/><Icon name="chevron" size={16}/></button>)}</div> : <div className="system-placeholder"><Icon name="clock" size={20}/>최신화 작업을 완료하면 버전과 복구본이 생성됩니다.</div>}</section>
    <div className="system-bottom"><section className="panel system-panel backup-panel"><div className="panel-heading"><div><h2>DB 백업</h2><p>관리자 데이터와 변경 이력을 보관합니다.</p></div><div className="button-row"><select aria-label="백업 대상" value={backupTarget} onChange={e=>setBackupTarget(e.target.value)}><option value="admin">에셋 관리 DB</option><option value="operations">사용자 · 추적 DB</option></select><Button icon="download" busy={busy} onClick={() => act('backup',null,{database:backupTarget})}>백업 생성</Button></div></div>{backups.error ? <ErrorBox error={backups.error} retry={backups.retry}/> : backups.data?.items.length ? <div className="backup-list">{backups.data.items.slice(0, 3).map(b => <a key={b.filename} href={'/admin/api/backups/' + b.filename}><Icon name="file" size={17}/><span>{b.filename.replace('.sqlite', '')}<small>{bytes(b.bytes)}</small></span><Icon name="download" size={16}/></a>)}</div> : <p className="inset quiet">아직 저장된 백업이 없습니다.</p>}</section><section className="panel system-panel automation-panel"><div className="panel-heading"><div><h2>자동 최신성 점검</h2><p>소스별 점검 주기에 따라 원본을 확인합니다.</p></div><Toggle checked={info.automatic_checks} onChange={automatic} label="자동 최신성 점검"/></div><div className="automation-description"><Icon name="spark" size={19}/><p>AI가 갱신 필요 여부를 판단하고 기록합니다.<br/>실제 DB 최신화는 버튼으로 실행합니다.</p></div><button className="text-button inset" onClick={() => open({ type: 'events' })}>관리 활동 기록<Icon name="arrow" size={16}/></button></section></div>
  </>;
}

function SourceDialog({ id }) {
  const { close, info, go, act, open, busy, notify, refresh, version } = useApp();
  const result = useLoad('/sources/' + encodeURIComponent(id), version);
  const [tab, setTab] = useState('overview'), [interval, setIntervalDays] = useState(null), [saving, setSaving] = useState(false);
  const source = result.data?.source;
  async function save(value) { setSaving(true); try { await patch('/sources/' + id, value); refresh(); notify('소스 설정을 저장했습니다.'); } catch (e) { notify(e.message, 'error'); } finally { setSaving(false); } }
  return <Modal title={source?.name || '데이터 소스'} subtitle={source?.description} close={close} footer={<><Button onClick={() => { close(); go('assets', '?source=' + id); }}>에셋 전체 보기</Button><div className="button-row">{source?.url && <Button icon="spark" disabled={!source.enabled} busy={busy} onClick={() => act('check', id)}>AI 점검</Button>}<Button variant="primary" icon={source?.url ? 'refresh' : 'layers'} disabled={!source?.enabled} onClick={() => source?.url ? open({ type: 'refresh', id }) : act('reindex')}>{source?.url ? 'DB 최신화' : '색인 다시 구성'}</Button></div></>}>
    {result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !source ? <Loading/> : <><div className="tabs dialog-tabs">{[['overview', '소스 현황'], ['evidence', 'AI 판단 근거'], ['settings', '설정']].map(([key, label]) => <button key={key} className={tab === key ? 'selected' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'overview' && <><div className="dialog-status-line"><Badge status={source.status}/><span>등록 에셋 {number(result.data.counts.reduce((n, c) => n + c.n, 0))}개</span></div><dl className="field-grid"><Field label="자료 생성·수집 기준" value={date(source.refreshed_at || source.imported_at, true)}/><Field label="마지막 원본 점검" value={date(source.checked_at, true)}/><Field label="관리자 DB 반영" value={source.refreshed_at ? date(source.refreshed_at, true) : '아직 반영하지 않음'}/><Field label="점검 주기" value={`${source.interval_days}일`}/></dl>{source.url && <a className="source-link" href={source.url} target="_blank" rel="noreferrer"><Icon name="globe" size={17}/><span>{source.url}</span><Icon name="external" size={15}/></a>}{source.error && <ErrorBox error={source.error}/>}
      {result.data.latest_snapshot && <DiscoverySummary snapshot={result.data.latest_snapshot}/>}
      <div className="dialog-section"><h3>등록된 자료</h3><div className="count-chips">{result.data.counts.map(c => <span key={c.kind}>{kindNames[c.kind] || c.kind}<b>{number(c.n)}</b></span>)}</div></div>
      {source.decision.summary && <div className="ai-assessment"><span><Icon name="spark" size={16}/>최근 AI 판단</span><h3>{source.decision.summary}</h3><p>{source.decision.reason}</p></div>}
      {id === 'catalogs' && <div className="notice"><Icon name="info" size={18}/><p>B2B와 B2C에 같은 Dir 번호가 있을 수 있습니다. 새로 수집하는 자료는 경로와 번호를 함께 관리하며, 이전 자료의 ID는 보존합니다.</p></div>}
      {!!result.data.releases.length && <div className="dialog-section"><h3>최근 데이터 버전</h3>{result.data.releases.map(r => <button className="compact-release" key={r.id} onClick={() => open({ type: 'release', release: { ...r, manifest: JSON.parse(r.manifest) } })}><Icon name="database" size={17}/>{date(r.at, true)}<Badge status={r.status}/><Icon name="chevron" size={15}/></button>)}</div>}
      <div className="scope-caption"><Icon name="shield" size={15}/>최신화 결과는 관리자 격리 DB에 반영됩니다. 앱 데이터·Agent KB 통합 상태는 버전 상세에서 확인할 수 있습니다.</div>
    </>}
    {tab === 'evidence' && (source.decision.summary ? <><div className="ai-assessment"><span><Icon name="spark" size={16}/>{source.decision.engine?.model || 'AI 분석'}</span><h3>{source.decision.summary}</h3><p>{source.decision.reason}</p><small>판단 신뢰도 {Math.round((source.decision.confidence || 0) * 100)}% · {date(source.decision.engine?.at, true)}</small></div><h3 className="small-heading">원문 인용</h3><div className="evidence-list">{source.decision.evidence?.map((e, i) => <blockquote key={i}><span>근거 {i + 1} · {e.source_id}</span><p>{e.quote}</p></blockquote>)}</div><Details title="수집 스냅샷 기록" value={result.data.snapshots}/></> : <Empty icon="spark" title="아직 AI 점검 결과가 없습니다">점검을 실행하면 원문과 비교한 판단 근거가 표시됩니다.</Empty>)}
    {tab === 'settings' && <div className="source-settings"><div className="setting-row"><div><h3>이 소스 사용</h3><p>사용 중지해도 기존 에셋과 기록은 보존됩니다.</p></div><Toggle checked={!!source.enabled} disabled={saving} label="이 소스 사용" onChange={enabled => save({ enabled })}/></div><div className="setting-row"><div><h3>원본 점검 주기</h3><p>시스템에서 자동 점검을 켰을 때 적용됩니다.</p></div><div className="interval-input"><input aria-label="점검 주기" type="number" min="1" max="365" value={interval ?? source.interval_days} onChange={e => setIntervalDays(e.target.value)}/><span>일</span><Button busy={saving} onClick={() => save({ interval_days: Number(interval ?? source.interval_days) })}>저장</Button></div></div></div>}
    </>}
  </Modal>;
}

function DiscoverySummary({ snapshot: s }) {
  const ids = s.new_ids || s.new_paths || [];
  const changes = s.revision_candidates || [];
  if (!ids.length && !changes.length && !s.headers?.length && !s.errors?.length) return null;
  return <div className="dialog-section discovery-summary"><h3>원본 변경 확인</h3><div className="count-chips"><span>새로 발견<b>{number(ids.length)}</b></span>{s.headers && <span>개정 확인<b>{number(s.headers.length)}권</b></span>}<span>내용 변경 후보<b>{number(changes.length)}</b></span>{s.errors?.length > 0 && <span>조회 미완료<b>{s.errors.length}</b></span>}</div>{ids.length > 0 && <div className="discovery-items">{ids.slice(0, 8).map(id => { const item = s.items?.find(i => i.id === id); return <a key={id} href={safeHref(item?.url || ('https://www.samsung.com/sec/business/' + id + '/'))} target="_blank" rel="noreferrer"><Icon name={item ? 'book' : 'globe'} size={15}/><span>{item?.title || id}</span><small>{id}</small><Icon name="external" size={13}/></a>; })}</div>}<p className="quiet">새로 발견한 자료의 실제 업로드일은 원문에 날짜가 확인될 때만 확정할 수 있습니다.</p><Details title="범위 · 개정 · 이동 후보 확인" value={{ coverage: s.coverage, revision_candidates: changes, missing_candidates: s.missing_candidates, errors: s.errors }}/></div>;
}

function AssetDialog({ id }) {
  const { close, info, refresh, notify, act, busy, open, version } = useApp();
  const result = useLoad('/assets/' + encodeURIComponent(id), version);
  const [tab, setTab] = useState('overview'), [notes, setNotes] = useState(null), [tags, setTags] = useState(null), [saving, setSaving] = useState(false);
  useEffect(() => { setTab('overview'); setNotes(null); setTags(null); }, [id]);
  const a = result.data?.id === id ? result.data : null, p = a?.payload || {}, analysis = p.analysis;
  async function save(value) { setSaving(true); try { await patch('/assets/' + encodeURIComponent(id), value); refresh(); notify('에셋을 저장했습니다.'); } catch (e) { notify(e.message, 'error'); } finally { setSaving(false); } }
  return <Modal title={a?.title || '에셋 상세'} subtitle={a ? `${kindNames[a.kind] || a.kind} · ${info.sources.find(s => s.id === a.source_id)?.name || a.source_id}` : ''} close={close} wide footer={<><Button icon="archive" busy={saving} onClick={() => save({ status: a?.status === 'archived' ? 'indexed' : 'archived' })}>{a?.status === 'archived' ? '에셋 복원' : '에셋 보관'}</Button><div className="button-row">{p.file_ref && <a className="button" href={'/admin/api/assets/' + encodeURIComponent(id) + '/file'}><Icon name="download" size={16}/>원본 다운로드</a>}{a?.source_id === 'uploads' && <Button variant="primary" busy={busy} icon="spark" onClick={() => act('analyze', 'uploads', { asset_id: id })}>AI {analysis ? '다시 분석' : '분석'}</Button>}</div></>}>
    {result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !a ? <Loading/> : <><div className="tabs dialog-tabs">{[['overview', '상세 정보'], ['resources', '전체 리소스'], ['source', '출처 · 원문'], ['references', '참조 관계'], ['manage', '관리']].map(([key, label]) => <button key={key} className={tab === key ? 'selected' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>
      {tab === 'overview' && <><div className="dialog-status-line"><Badge status={a.status}/><span>{a.external_id || a.id}</span></div>{analysis && <div className="ai-assessment"><span><Icon name="spark" size={16}/>AI 분석 · {analysis.engine?.model}</span><h3>{analysis.title}</h3><p>{analysis.summary}</p></div>}<dl className="field-grid"><Field label="모델" value={p.model || p.official?.mdlCode || p.models?.join?.(', ')}/><Field label="분류" value={p.cat || p.category || p.kind || p.family}/><Field label="자료 생성·수집 기준" value={date(a.imported_at, true)}/><Field label="관리자 최초 등록" value={date(a.first_seen, true)}/></dl>
        {p.parent_asset_id && <Button icon="file" onClick={() => open({ type: 'asset', id: p.parent_asset_id })}>추출 근거 원본 열기</Button>}
        <AssetResourceSummary key={id} id={id} showAll={()=>setTab('resources')}/>
        {(p.spec || p.desc || p.summary || p.when) && <div className="dialog-section"><h3>자료 설명</h3><p className="readable-content">{[p.spec, p.desc, p.summary, p.when].filter(x => typeof x === 'string').join('\n')}</p></div>}
        {analysis?.entities?.length > 0 && <div className="dialog-section"><h3>추출한 데이터 <span className="count-label">{analysis.entities.length}</span></h3><div className="entity-list">{analysis.entities.map((e, i) => <details key={i}><summary><Icon name={iconFor(e.kind)} size={17}/><strong>{e.name}</strong><span>{e.model || kindNames[e.kind]}</span><Icon name="down" size={14}/></summary><div><p>{e.summary}</p><div className="tag-list">{e.tags.map(t => <span key={t}>{t}</span>)}</div>{e.evidence.map((ref, n) => <blockquote key={n}><span>{ref.source_id}</span>{ref.quote}</blockquote>)}</div></details>)}</div></div>}
        <Details title="전체 데이터 필드" value={p}/>
      </>}
      {tab === 'source' && <><dl className="field-grid"><Field label="저장 위치" value={a.path}/><Field label="최근 내용 변경" value={date(a.updated_at, true)}/><Field label="자료 생성·수집 기준" value={date(a.imported_at, true)}/><Field label="최근 점검" value={date(a.checked_at, true)}/></dl>{a.url && <a className="source-link" target="_blank" rel="noreferrer" href={safeHref(a.url)}><Icon name="external" size={16}/><span>{a.url}</span></a>}<div className="hash-line"><span>SHA-256</span><code>{a.hash}</code></div>{p.timestamp_note && <div className="notice"><Icon name="info" size={16}/><p>{p.timestamp_note}</p></div>}<h3 className="small-heading">저장한 원문</h3>{a.content ? <pre className="source-text">{a.content}</pre> : <p className="quiet">원문 텍스트가 없거나 아직 분석하지 않았습니다.</p>}{a.content_length > a.content.length && <p className="quiet">처음 60,000자만 표시합니다. 전체 내용은 에셋 내보내기에 포함됩니다.</p>}</>}
      {tab === 'references' && <AssetReferences id={id}/>}
      {tab === 'resources' && <AssetResources key={id} id={id}/>}
      {tab === 'manage' && <div className="form-stack"><label>관리 메모<textarea rows="5" value={notes ?? p.admin_notes ?? ''} onChange={e => setNotes(e.target.value)} placeholder="확인할 내용이나 수정 사유를 남기세요."/></label><label>검색 태그<input value={tags ?? p.admin_tags?.join(', ') ?? ''} onChange={e => setTags(e.target.value)} placeholder="쉼표로 구분해 입력"/></label><div className="notice"><Icon name="info" size={17}/><p>보관한 에셋은 관리 DB에 유지됩니다. 기존 제안서와 연결된 원본을 물리적으로 삭제하지 않습니다.</p></div><Button variant="primary" busy={saving} onClick={() => save({ notes: notes ?? p.admin_notes ?? '', tags: (tags ?? p.admin_tags?.join(', ') ?? '').split(',').map(t => t.trim()).filter(Boolean) })}>메모 · 태그 저장</Button></div>}
    </>}
  </Modal>;
}

function AssetReferences({ id }) {
  const { open } = useApp();
  const result = useLoad('/assets/' + encodeURIComponent(id) + '/references');
  return result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !result.data ? <Loading/> : <><p className="quiet">{result.data.scope}</p>{result.data.items.length ? <div className="release-list">{result.data.items.map(a => <button className="release-row" key={a.id} onClick={() => open({ type: 'asset', id: a.id })}><Icon name={iconFor(a.kind)} size={18}/><div><strong>{a.title}</strong><span>{kindNames[a.kind]} · {a.id}</span></div><Icon name="chevron" size={16}/></button>)}</div> : <Empty icon="link" title="등록된 ID 참조가 없습니다">이 결과는 개인 브라우저에 저장한 제안서까지 확인한 것은 아닙니다.</Empty>}</>;
}

function safeHref(url) { return /^https:\/\//i.test(url) || url.startsWith('/') && !url.startsWith('//') ? url : undefined; }

function AddDialog() {
  const { close, refresh, notify, open } = useApp();
  const [tab, setTab] = useState('file'), [files, setFiles] = useState([]), [url, setUrl] = useState(''), [title, setTitle] = useState('');
  const [drag, setDrag] = useState(false), [busy, setBusy] = useState(false), [results, setResults] = useState([]), [error, setError] = useState('');
  const input = useRef();
  function select(list) { const next = [...list]; if (next.length > 10) { setError('한 번에 10개까지 추가해 주세요.'); return; } if (next.some(f => f.size > 25 * 1024 ** 2)) { setError('파일은 각각 25MB 이하로 추가해 주세요.'); return; } setFiles(next); setError(''); }
  async function submit() {
    setBusy(true); setError('');
    const finished = [];
    try {
      if (tab === 'url') finished.push({ name: title || url, ...await post('/url-assets', { url, title: title || null }) });
      else for (const file of files) finished.push({ name: file.name, ...await api('/uploads', { method: 'POST', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) } }) });
      setResults(finished); refresh();
      if (finished.length) notify(`${finished.length}개 자료를 등록했습니다. AI 분석은 백그라운드에서 진행됩니다.`);
    } catch (e) { setError(e.message); setResults(finished); refresh(); }
    finally { setBusy(false); }
  }
  return <Modal title="새로운 에셋 추가" subtitle="원본을 추가하면 AI가 내용을 구조화하고 근거와 함께 저장합니다." close={close} footer={<><span className="quiet"><Icon name="shield" size={14}/>관리자 격리 DB에 등록</span><div className="button-row"><Button onClick={close}>닫기</Button>{!results.length && <Button variant="primary" icon="spark" busy={busy} disabled={tab === 'file' ? !files.length : !url.trim()} onClick={submit}>{busy ? '자료 업로드 중' : '분석하고 DB에 추가'}</Button>}</div></>}>
    {results.length ? <div className="upload-results"><div className="success-heading"><Icon name="check" size={25}/><h3>자료가 등록되었습니다.</h3><p>분석 결과와 원문은 에셋 상세에서 확인할 수 있습니다.</p></div>{results.map(r => <div key={r.asset_id}><Icon name="file" size={19}/><span><strong>{r.name}</strong><small>{r.analysis_error ? '분석을 시작하지 못했습니다. 에셋 상세에서 재시도해 주세요.' : r.job ? 'AI 분석 작업을 시작했습니다.' : '이미 등록된 자료입니다.'}</small></span><button className="text-button" onClick={() => open({ type: r.job ? 'job' : 'asset', id: r.job?.id || r.asset_id })}>{r.job ? '작업 보기' : '에셋 보기'}<Icon name="chevron" size={14}/></button></div>)}</div> : <><div className="tabs dialog-tabs"><button className={tab === 'file' ? 'selected' : ''} onClick={() => setTab('file')}><Icon name="upload" size={16}/>파일 업로드</button><button className={tab === 'url' ? 'selected' : ''} onClick={() => setTab('url')}><Icon name="link" size={16}/>URL로 추가</button></div>{tab === 'file' ? <><button className={'dropzone ' + (drag ? 'dragging' : '')} onClick={() => input.current.click()} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); select(e.dataTransfer.files); }}><span><Icon name="upload" size={28}/></span><strong>파일을 놓거나 클릭해서 선택하세요</strong><p>PDF, PPTX, DOCX, 텍스트, 이미지</p><small>파일당 최대 25MB · 한 번에 10개</small></button><input ref={input} type="file" multiple hidden accept=".pdf,.pptx,.docx,.txt,.md,.csv,.json,.html,.png,.jpg,.jpeg,.webp" onChange={e => select(e.target.files)}/>{files.length > 0 && <div className="selected-files">{files.map((f, i) => <div key={f.name + i}><Icon name="file" size={17}/><span>{f.name}</span><small>{bytes(f.size)}</small><IconButton icon="close" label={f.name + ' 제외'} onClick={() => setFiles(fs => fs.filter((_, n) => n !== i))}/></div>)}</div>}</> : <div className="form-stack"><label>원본 URL<input type="url" placeholder="https://example.com/document.pdf" value={url} onChange={e => setUrl(e.target.value)}/></label><label>자료 이름 <span className="quiet">선택</span><input placeholder="비워 두면 AI가 제목을 정리합니다." value={title} onChange={e => setTitle(e.target.value)}/></label><div className="notice"><Icon name="info" size={17}/><p>공개 HTTPS 페이지와 파일을 읽습니다. 계속 점검할 주소는 데이터 소스에서 연결할 수 있습니다.</p></div></div>}<div className="ingest-steps"><span><b>1</b>원문 보존</span><Icon name="chevron" size={13}/><span><b>2</b>AI 구조화</span><Icon name="chevron" size={13}/><span><b>3</b>인용 검증 · DB 등록</span></div></>}{error && <ErrorBox error={error}/>}<p className="scope-caption">추출한 데이터는 관리자 라이브러리에서 검색할 수 있습니다. 이미지 전용 PDF는 텍스트 PDF나 개별 이미지로 추가해 주세요.</p>
  </Modal>;
}

function RefreshDialog({ sid }) {
  const { info, close, act, busy } = useApp();
  const sources = info.sources.filter(s => s.url && s.enabled);
  const [selected, setSelected] = useState(sid || 'all');
  return <Modal title="DB 최신화" subtitle="원본 수집부터 AI 검토, 관리 DB 반영까지 한 번에 진행합니다." close={close} footer={<><Button onClick={close}>닫기</Button><Button variant="primary" icon="refresh" busy={busy} disabled={!sources.length} onClick={() => act('refresh', selected === 'all' ? null : selected)}>최신화 시작</Button></>}>
    <div className="form-stack"><label>업데이트할 데이터 소스<select value={selected} onChange={e => setSelected(e.target.value)}><option value="all">전체 외부 원본</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name} · {number(s.asset_count)}개 에셋</option>)}</select></label></div><div className="refresh-flow">{[['folder', '원본 수집', '새 스냅샷으로 보존'], ['spark', 'AI 검토', '변경과 인용 근거 확인'], ['shield', '검증 · 복구본', 'ID 보존, 실패 시 미반영'], ['database', '관리 DB 반영', '버전과 변경 내역 기록']].map(([icon, title, desc], i) => <div key={title}><span className="flow-icon"><Icon name={icon} size={21}/></span><div><small>STEP 0{i + 1}</small><strong>{title}</strong><p>{desc}</p></div></div>)}</div><div className="notice"><Icon name="info" size={18}/><p>제품 전체 수집과 카탈로그 모든 쪽 분석에는 시간이 걸릴 수 있습니다. 화면을 닫아도 작업은 계속됩니다. 수집이 불완전하면 기존 자료를 유지합니다.</p></div><div className="scope-box"><strong><Icon name="shield" size={17}/>현재 반영 범위: 관리자 격리 DB</strong><p>Winmate 앱의 제품 DB·Agent KB·이미지 묶음은 통합 전 상태로 유지합니다. 생성한 데이터와 변경표는 내보내기로 확인할 수 있습니다.</p></div>
  </Modal>;
}

function JobDialog({ id }) {
  const { close, version, refresh, notify, open, act } = useApp();
  const result = useLoad('/jobs/' + id, version);
  const j = result.data;
  async function cancel() { try { await post('/jobs/' + id + '/cancel', {}); refresh(); notify('작업 취소를 요청했습니다.'); } catch (e) { notify(e.message, 'error'); } }
  return <Modal title={j ? jobNames[j.kind] || j.kind : '작업 상세'} subtitle={j ? date(j.created_at, true) + '에 시작한 작업' : ''} close={close} wide footer={<><span className="quiet">{j?.id.slice(0, 12)}</span><div className="button-row">{j && running(j.status) && <Button icon="stop" onClick={cancel} disabled={j.cancelled}>취소 요청</Button>}{j && ['failed', 'partial', 'interrupted'].includes(j.status) && j.kind !== 'rollback' && <Button icon="refresh" onClick={() => act(j.kind, j.source_id, j.result.input || {})}>다시 실행</Button>}<Button variant="primary" onClick={close}>확인</Button></div></>}>
    {result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !j ? <Loading/> : <><div className="job-dialog-status"><span className={'large-job-icon ' + j.status}><Icon name={j.status === 'succeeded' ? 'check' : ['failed', 'partial'].includes(j.status) ? 'alert' : 'refresh'} size={28} className={j.status === 'running' ? 'spin' : ''}/></span><div><Badge status={j.status}/><h3>{running(j.status) ? j.stage : j.status === 'succeeded' ? '작업을 완료했습니다.' : j.status === 'partial' ? '일부 소스를 확인하지 못했습니다.' : j.status === 'cancelled' ? '작업을 취소했습니다.' : '작업 내역을 확인해 주세요.'}</h3></div><strong>{running(j.status) ? j.progress + '%' : ''}</strong></div>{running(j.status) && <><Progress value={j.progress}/><p className="quiet">이 창을 닫거나 새로고침해도 작업 내역에서 이어서 확인할 수 있습니다.</p></>}{j.error && <ErrorBox error={j.error}/>}
      {j.result.sources?.map((s, i) => <div className="job-result-block" key={s.source_id || i}><h3>{s.source_id}</h3>{s.decision && <><Badge status={s.decision.status}/><p>{s.decision.summary}</p><p className="quiet">{s.decision.reason}</p></>}{s.release && <><div className="result-counts"><span><b>{number(s.release.changes.filter(c => c.action === 'added').length)}</b>추가</span><span><b>{number(s.release.changes.filter(c => c.action === 'changed').length)}</b>변경</span><span><b>{number(s.release.review_candidates.length)}</b>검토 후보</span></div><p className="quiet">{s.release.note}</p><button className="text-button" onClick={() => open({ type: 'release', release: { id: s.release.id, status: 'active', manifest: s.release, at: s.release.at, source_id: s.source_id } })}>변경 사항 보기<Icon name="arrow" size={15}/></button></>}</div>)}
      {j.result.errors?.map(e => <ErrorBox key={e.source_id} error={`${e.source_id}: ${e.error}`}/>)}
      {j.kind === 'diagnose' && j.result.checks && <div className="diagnosis-summary"><Icon name={j.result.ok ? 'shield' : 'alert'} size={22}/><p>{j.result.ok ? '검사한 DB와 참조 연결이 정상입니다.' : '일부 데이터의 확인이 필요합니다. 시스템 화면에서 항목별 결과를 확인하세요.'}</p></div>}
      {j.result.asset_id && <button className="button" onClick={() => open({ type: 'asset', id: j.result.asset_id })}><Icon name="file" size={16}/>분석한 에셋 보기</button>}
      {j.result.download && <a className="button primary" href={j.result.download}><Icon name="download" size={16}/>백업 다운로드 · {bytes(j.result.bytes)}</a>}
      {j.inventories?.map((inv, i) => <Details key={i} title="원본 수집 범위와 누락" value={inv}/>)}
      {j.logs?.map((log, i) => <Details key={i} title="수집 로그" value={log}/>)}
      {!running(j.status) && <Details title="전체 작업 결과" value={j.result}/>}</>}
  </Modal>;
}

function DatabaseDialog({ id }) {
  const { close, act } = useApp();
  const db = useLoad('/database/' + id);
  const [table, setTable] = useState(''), [offset, setOffset] = useState(0);
  const rows = useLoad('/database/' + id + (table ? '/' + encodeURIComponent(table) + '?offset=' + offset : ''));
  const title = { source: '원본 제품 DB', runtime: '앱 제품 DB', admin: '관리자 DB' }[id];
  return <Modal title={title} subtitle="테이블을 선택해 실제 저장된 데이터를 확인하세요." close={close} wide footer={<><span className="quiet">조회 전용 · 최대 25행씩 표시</span><div className="button-row"><Button icon="download" onClick={() => act('backup', null, { database: id })}>이 DB 백업</Button><Button onClick={close}>닫기</Button></div></>}>
    {db.error ? <ErrorBox error={db.error} retry={db.retry}/> : !db.data ? <Loading/> : <><div className="database-summary"><span><Icon name="database" size={19}/><strong>{db.data.tables?.length || 0}</strong>개 테이블</span><span>{bytes(db.data.bytes || 0)}</span><Badge status={db.data.integrity?.[0] === 'ok' ? 'fresh' : 'error'}>{db.data.integrity?.[0] === 'ok' ? 'DB 무결성 정상' : 'DB 확인 필요'}</Badge></div><label className="form-label">테이블<select value={table} onChange={e => { setTable(e.target.value); setOffset(0); }}><option value="">테이블을 선택하세요</option>{db.data.tables?.map(t => <option key={t.name} value={t.name}>{t.name} · {number(t.rows)}행</option>)}</select></label>{table ? rows.error ? <ErrorBox error={rows.error} retry={rows.retry}/> : !rows.data?.columns ? <Loading/> : <><div className="table-scroll database-table"><table><thead><tr>{rows.data.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.data.items.map((row, i) => <tr key={i}>{row.map((cell, n) => <td key={n}><div title={cell || ''}>{cell ?? 'NULL'}</div></td>)}</tr>)}</tbody></table></div><Pager offset={offset} total={rows.data.total} size={25} onChange={setOffset}/></> : <div className="db-table-grid">{db.data.tables?.map(t => <button key={t.name} onClick={() => setTable(t.name)}><Icon name="database" size={16}/><span>{t.name}</span><b>{number(t.rows)}</b><Icon name="chevron" size={14}/></button>)}</div>}</>}
  </Modal>;
}

function ReleaseDialog({ release: r }) {
  const { info, close, act } = useApp();
  const [confirm, setConfirm] = useState(false), [tab, setTab] = useState('changes');
  const m = r.manifest;
  return <Modal title="데이터 버전 상세" subtitle={`${info.sources.find(s => s.id === r.source_id)?.name || r.source_id} · ${date(r.at, true)}`} close={close} wide footer={<><a className="button" href={'/admin/api/releases/' + r.id + '/export'}><Icon name="download" size={16}/>데이터 내보내기</a>{r.status === 'active' && <Button icon="refresh" variant={confirm ? 'danger' : ''} onClick={() => confirm ? act('rollback', null, { release_id: r.id }) : setConfirm(true)}>{confirm ? '이전 데이터로 복구 실행' : '이전 버전 복구'}</Button>}</>}>
    <div className="dialog-status-line"><Badge status={r.status}/><span>{r.id.slice(0, 16)}</span></div><div className="result-counts"><span><b>{number(m.changes.filter(c => c.action === 'added').length)}</b>추가</span><span><b>{number(m.changes.filter(c => c.action === 'changed').length)}</b>변경</span><span><b>{number(m.review_candidates.length)}</b>검토 후보</span></div>{confirm && <div className="notice warning"><Icon name="refresh" size={19}/><p>이 소스의 에셋 {number(m.changes.length)}건을 반영 전 상태로 되돌립니다. 릴리스 이후 편집한 자료가 있으면 복구를 중단합니다. 작업 기록과 원본은 보존됩니다.</p></div>}<div className="tabs dialog-tabs"><button className={tab === 'changes' ? 'selected' : ''} onClick={() => setTab('changes')}>변경 내역</button><button className={tab === 'scope' ? 'selected' : ''} onClick={() => setTab('scope')}>반영 범위 · 근거</button></div>{tab === 'changes' ? <><div className="change-list">{m.changes.slice(0, 150).map(c => <div key={c.id}><span className={'change-label ' + c.action}>{c.action === 'added' ? '추가' : '변경'}</span><span><strong>{c.title}</strong><small>{c.id}</small></span></div>)}</div>{m.changes.length > 150 && <p className="quiet">처음 150건을 표시합니다. 전체 변경표는 상세 데이터에 포함됩니다.</p>}{!m.changes.length && <Empty title="데이터 내용이 동일합니다"/>}</> : <><div className="scope-box"><strong><Icon name="shield" size={17}/>관리자 DB 반영</strong><p>{m.note}</p><ul><li>관리자 에셋 DB: 반영</li><li>기존 Winmate 앱 데이터: 통합 전</li><li>기존 Agent KB 및 이미지 묶음: 통합 전</li></ul></div>{m.decision && <div className="ai-assessment"><span><Icon name="spark" size={16}/>AI 판단 근거</span><h3>{m.decision.summary}</h3><p>{m.decision.reason}</p></div>}<Details title="수집 범위와 변경 계획" value={m}/></>}
  </Modal>;
}

function NewSourceDialog() {
  const { close, notify, refresh, open } = useApp();
  const [name, setName] = useState(''), [url, setUrl] = useState(''), [description, setDescription] = useState(''), [interval, setIntervalDays] = useState(7), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { const s = await post('/sources', { name, url, description, interval_days: Number(interval) }); refresh(); notify('데이터 소스를 연결했습니다.'); open({ type: 'source', id: s.id }); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  return <Modal title="데이터 소스 연결" subtitle="반복해서 확인할 공식 문서나 웹페이지를 연결하세요." close={close} footer={<><Button onClick={close}>취소</Button><Button variant="primary" busy={busy} type="submit" form="source-form" icon="link">소스 연결</Button></>}><form id="source-form" className="form-stack" onSubmit={submit}><label>소스 이름<input required maxLength={120} placeholder="예: 신규 제품 가이드" value={name} onChange={e => setName(e.target.value)}/></label><label>원본 URL<input required type="url" placeholder="https://" value={url} onChange={e => setUrl(e.target.value)}/></label><label>설명 <span className="quiet">선택</span><input maxLength={500} placeholder="이 소스에 포함된 자료를 간단히 설명해 주세요." value={description} onChange={e => setDescription(e.target.value)}/></label><label>점검 주기<div className="interval-input"><input type="number" required min="1" max="365" value={interval} onChange={e => setIntervalDays(e.target.value)}/><span>일</span></div></label></form>{error && <ErrorBox error={error}/>}<div className="notice"><Icon name="info" size={17}/><p>등록 URL의 공개 본문을 수집합니다. 연결된 모든 하위 페이지나 첨부파일을 자동으로 수집하는 소스는 아닙니다.</p></div></Modal>;
}

function EventsDialog() {
  const { close } = useApp();
  const result = useLoad('/events');
  return <Modal title="관리 활동 기록" subtitle="최근 100개의 변경과 작업 요청을 확인할 수 있습니다." close={close} wide>{result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !result.data ? <Loading/> : <div className="event-list">{result.data.items.map(e => <details key={e.id}><summary><Icon name="clock" size={16}/><strong>{e.action}</strong><span>{date(e.at, true)}</span><Icon name="down" size={14}/></summary><p>{e.actor} · {e.target}</p><pre>{JSON.stringify(JSON.parse(e.detail), null, 2)}</pre></details>)}</div>}</Modal>;
}

function AboutDialog() {
  const { close, info } = useApp();
  return <Modal title="Winmate 관리 환경" subtitle="Winmate와 같은 서버에서 제공하는 관리자 앱입니다." close={close}><div className="scope-box"><strong><Icon name="shield" size={18}/>격리된 작업 공간</strong><p>관리자 코드는 admin/ 폴더에서 버전 관리합니다. 관리 DB·업로드·로그·백업은 Git에서 제외된 admin/runtime/에 보관하며, 기존 앱의 원본 데이터와 분리합니다.</p></div><dl className="field-grid"><Field label="관리자 경로" value="/admin/"/><Field label="일반 앱 경로" value="/"/><Field label="AI 엔진" value={info.ai.model}/><Field label="AI 연결" value={info.ai.configured ? '서버 설정 확인됨' : '서버 설정 필요'}/></dl><p className="readable-content">AI 최신성 판단에는 현재 조회한 원본과 정확한 인용이 필요합니다. 원문 수집에 실패하면 최신 상태로 표시하거나 기존 자료를 삭제하지 않습니다.</p><Details title="실행 · 데이터 경로" value={'실행: ./start.sh 또는 ./admin/start.sh\n같은 포트: / → Winmate, /admin/ → 관리자\n관리 DB: admin/runtime/admin.sqlite\n원본·변경표·복구본: admin/runtime/releases/\n추가 원본: admin/runtime/uploads/'}/></Modal>;
}

createRoot(document.getElementById('root')).render(<App/>);
