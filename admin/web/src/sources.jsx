// 데이터 소스 최신성 — 실제 원본과 DB 를 대조한 결과(점검 근거)와, 소스별 원본 주소 · 리소스 링크 관리
import { useState } from 'react';
import { api, post, date, number } from './api';
import { Icon } from './icons';
import { Badge, Button, Empty, ErrorBox, IconButton, Loading } from './components';
import { useApp, useLoad } from './context';
import './sources.css';

const safeHref = url => /^https:\/\//i.test(url || '') ? url : undefined;
const changeNames = { new: '새 항목', changed: '바뀜', gone: '빠짐', removed: '빠짐', moved: '이동', broken: '열리지 않음', 'new-category': '새 분류', 'new-page': '새 페이지' };
const linkStates = { same: ['변경 없음', 'green'], baseline: ['기준 잡음', 'green'], new: ['DB 에 없음', 'amber'], changed: ['바뀜', 'amber'], gone: ['열리지 않음', 'amber'], failed: ['확인 못 함', 'red'] };
const countNames = { listed: '원본 목록', db: 'DB', same: '같음', changed: '바뀜', new: '새 항목', gone: '빠짐', removed: '빠짐', moved: '이동', broken: '열리지 않음', urls: '주소', links: '링크',
  categories: '분류', specs: '사양', pageFiles: '쪽 파일', excluded: '범위 밖', unchanged: '같음', sources: '소스', notes: '참고', 'new-page': '새 페이지', 'new-category': '새 분류' };
const duration = s => s == null ? '' : s < 90 ? `${s}초` : `${Math.round(s / 60)}분`;

// 소스 현황 탭 — 판정 한 줄과 원본별 결과 한 줄씩
export function OriginSummary({ decision, more }) {
  return <div className={'origin-summary ' + decision.status}><div className="origin-verdict"><Icon name={decision.status === 'fresh' ? 'check' : decision.status === 'refresh' ? 'refresh' : 'alert'} size={17}/><div><h3>{decision.summary}</h3><p>실제 원본과 DB 를 대조한 결과입니다 · {date(decision.checked_at, true)}</p></div></div>
    <ul>{decision.origins.map(o => <li key={o.id}><Badge status={o.status}/><span><b>{o.label}</b>{o.summary}</span></li>)}</ul>
    <button className="text-button" onClick={more}>대조 내역 보기<Icon name="arrow" size={15}/></button></div>;
}

// 점검 근거 탭 — 원본마다 무엇을 무엇과 대조했고 무엇이 달랐는지
export function OriginReport({ decision, channel, go }) {
  return <div className="origin-report"><div className={'origin-summary ' + decision.status}><div className="origin-verdict"><Icon name={decision.status === 'fresh' ? 'check' : decision.status === 'refresh' ? 'refresh' : 'alert'} size={17}/><div><h3>{decision.summary}</h3><p>{date(decision.checked_at, true)} 점검 · 원본 {decision.counts.origins}곳 · 다른 항목 {number(decision.counts.changes)}개{decision.counts.errors ? ` · 확인 못 함 ${number(decision.counts.errors)}건` : ''}</p></div></div></div>
    {decision.origins.map(o => <OriginBlock key={o.id} origin={o}/>)}
    {decision.status === 'refresh' && channel && <div className="notice"><Icon name="info" size={18}/><p>다른 항목을 실제 DB 에 반영하려면 「소스 점검 · 업데이트」에서 이 원본의 업데이트를 실행하세요. <button className="text-button inline" onClick={go}>업데이트 화면으로 이동<Icon name="arrow" size={14}/></button></p></div>}
    <p className="origin-rule"><Icon name="shield" size={14}/>판정은 대조 결과로만 합니다. 다른 항목이 하나라도 있으면 갱신 권장, 확인하지 못한 원본이 있으면 확인 필요, 모두 같을 때만 최신 확인입니다.</p></div>;
}

function OriginBlock({ origin: o }) {
  const [all, setAll] = useState(false);
  const counts = Object.entries(o.counts || {}).filter(([key, value]) => countNames[key] && (value > 0 || ['listed', 'db', 'same', 'urls', 'links'].includes(key)));
  const changes = all ? o.changes : o.changes.slice(0, 8);
  return <section className="origin-block"><header><div><h3>{o.label}</h3>{safeHref(o.url) && <a href={o.url} target="_blank" rel="noreferrer">{o.url}<Icon name="external" size={12}/></a>}</div><Badge status={o.status}/></header>
    <p className="origin-line">{o.summary}</p>
    <dl className="origin-facts"><div><dt>대조 기준</dt><dd>{o.compare}</dd></div><div><dt>확인 범위</dt><dd>{o.coverage || o.method}</dd></div>{o.checked_at && <div><dt>확인 시각</dt><dd>{date(o.checked_at, true)}{o.seconds != null && ` · ${duration(o.seconds)} 걸림`}</dd></div>}</dl>
    {counts.length > 0 && <div className="count-chips">{counts.map(([key, value]) => <span key={key}>{countNames[key]}<b>{number(value)}</b></span>)}</div>}
    {o.total_changes > 0 && <div className="origin-items"><h4>원본과 다른 항목 <b>{number(o.total_changes)}</b></h4>{changes.map((c, i) => <ChangeRow key={i} change={c}/>)}
      {o.changes.length > 8 && <button className="text-button" onClick={() => setAll(!all)}>{all ? '접기' : `${o.changes.length - 8}개 더 보기`}</button>}
      {o.total_changes > o.changes.length && <p className="quiet">전체 {number(o.total_changes)}개 중 {o.changes.length}개를 표시합니다. 나머지는 「소스 점검 · 업데이트」의 점검 기록에서 확인할 수 있습니다.</p>}</div>}
    {o.total_errors > 0 && <div className="origin-items errors"><h4>확인하지 못한 원본 <b>{number(o.total_errors)}</b></h4>{o.errors.map((e, i) => <div className="origin-item" key={i}><span className="origin-chip red">확인 못 함</span><div>{safeHref(e.url) ? <a href={e.url} target="_blank" rel="noreferrer">{e.title || e.url}<Icon name="external" size={11}/></a> : <strong>{e.title}</strong>}<p>{e.error}</p></div></div>)}</div>}
    {o.notes?.length > 0 && <div className="origin-items"><h4>참고</h4>{o.notes.map((n, i) => <div className="origin-item" key={i}><span className="origin-chip">참고</span><div>{safeHref(n.url) ? <a href={n.url} target="_blank" rel="noreferrer">{n.title}<Icon name="external" size={11}/></a> : <strong>{n.title}</strong>}<p>{n.note}</p></div></div>)}</div>}
  </section>;
}

function ChangeRow({ change: c }) {
  return <div className="origin-item"><span className="origin-chip amber">{changeNames[c.status] || c.status}</span><div>{safeHref(c.url) ? <a href={c.url} target="_blank" rel="noreferrer">{c.title}<Icon name="external" size={11}/></a> : <strong>{c.title}</strong>}{c.id && String(c.id) !== c.title && <small>{c.id}</small>}
    {c.why?.length > 0 && <p>{c.why.join(' · ')}</p>}
    {safeHref(c.url) && c.url !== c.title && <p className="origin-url">{c.url}</p>}
    {c.diff && <Diff diff={c.diff}/>}</div></div>;
}

function Diff({ diff }) {
  if (!diff.removed.length && !diff.added.length) return null;
  return <div className="origin-diff">{diff.removed.map((line, i) => <p key={'r' + i} className="removed">− {line}</p>)}{diff.added.map((line, i) => <p key={'a' + i} className="added">+ {line}</p>)}
    {(diff.removed_total > diff.removed.length || diff.added_total > diff.added.length) && <small>바뀐 줄 전체: 빠진 줄 {diff.removed_total} · 새 줄 {diff.added_total}</small>}</div>;
}

// 원본 · 링크 탭 — 무엇을 원본으로 보는지, 바뀐 주소(리소스 링크)를 넣고 빼기
export function OriginLinks({ id }) {
  const { notify, refresh, version } = useApp();
  const [local, setLocal] = useState(0);
  const view = useLoad('/sources/' + encodeURIComponent(id) + '/origin', version + local);
  const [url, setUrl] = useState(''), [label, setLabel] = useState(''), [address, setAddress] = useState(null), [busy, setBusy] = useState(false);
  const d = view.data;
  async function run(call, message, after) {
    setBusy(true);
    try { await call(); notify(message); after?.(); setLocal(n => n + 1); refresh(); } catch (e) { notify(e.message, 'error'); } finally { setBusy(false); }
  }
  if (view.error) return <ErrorBox error={view.error} retry={view.retry}/>;
  if (!d) return <Loading/>;
  const base = '/sources/' + encodeURIComponent(id);
  return <div className="origin-links">
    <div className="dialog-section first"><h3>최신성을 대조하는 실제 원본</h3>{d.origins.map(o => <div className="origin-definition" key={o.id}><Icon name="globe" size={16}/><div><strong>{o.label}</strong>{safeHref(o.url) && <a href={o.url} target="_blank" rel="noreferrer">{o.url}<Icon name="external" size={11}/></a>}<p>{o.method} ↔ {o.compare}</p></div><small>약 {o.minutes}분</small></div>)}</div>
    {d.url_editable && <div className="dialog-section"><h3>원본 주소</h3><form className="origin-form" onSubmit={e => { e.preventDefault(); run(() => api(base + '/url', { method: 'PUT', body: JSON.stringify({ url: address ?? d.url }) }), '원본 주소를 바꿨습니다. 다음 점검부터 이 주소를 봅니다.', () => setAddress(null)); }}>
      <input aria-label="원본 주소" value={address ?? d.url} onChange={e => setAddress(e.target.value)} placeholder="https://" spellCheck={false}/>
      <Button busy={busy} disabled={busy || address === null || address.trim() === d.url}>주소 바꾸기</Button>
      {d.default_url && d.url !== d.default_url && <Button type="button" busy={busy} onClick={() => run(() => api(base + '/url', { method: 'PUT', body: JSON.stringify({ url: '' }) }), '기본 주소로 되돌렸습니다.', () => setAddress(null))}>기본 주소로</Button>}</form>
      <p className="quiet">{id === 'catalogs' ? '목록 페이지의 주소가 바뀌면 여기에서 바꿉니다. 같은 형식의 목록이어야 권을 읽을 수 있습니다.' : '이 소스가 보는 주소입니다. 주소가 옮겨졌으면 새 주소로 바꿉니다.'}</p></div>}
    <div className="dialog-section"><h3>리소스 링크 <span className="count-label">{d.links.length}</span></h3><p className="quiet lead">{d.link_rule}</p>
      <form className="origin-form" onSubmit={e => { e.preventDefault(); run(() => post(base + '/links', { url, label }), '링크를 넣었습니다. 점검을 실행하면 함께 확인합니다.', () => { setUrl(''); setLabel(''); }); }}>
        <input aria-label="리소스 링크" value={url} onChange={e => setUrl(e.target.value)} placeholder={id === 'catalogs' ? 'https://samsung.aiibook.net/b2b/access/ecatalog5.php?Dir=…' : 'https://'} spellCheck={false} required/>
        <input aria-label="링크 이름" className="short" value={label} onChange={e => setLabel(e.target.value)} placeholder="이름(선택)" maxLength={120}/>
        <Button icon="plus" busy={busy} disabled={busy || !url.trim() || d.links.length >= d.max_links}>링크 넣기</Button></form>
      {d.links.length ? <div className="origin-link-list">{d.links.map(l => <LinkRow key={l.id} link={l} busy={busy}
        remove={() => run(() => api(base + '/links/' + l.id, { method: 'DELETE' }), '링크를 뺐습니다.')}
        accept={() => run(() => post(base + '/links/' + l.id + '/accept', {}), '지금 내용을 새 기준으로 잡았습니다.')}/>)}</div>
        : <Empty icon="link" title="넣은 링크가 없습니다">원본 주소가 바뀌었거나 목록에 없는 자료가 있으면 그 링크를 넣어 주세요.</Empty>}</div>
  </div>;
}

function LinkRow({ link: l, remove, accept, busy }) {
  const r = l.result;
  const [text, color] = r ? linkStates[r.status] || [r.status, 'neutral'] : ['점검 전', 'neutral'];
  return <div className="origin-link"><div><span className={'origin-chip ' + color}>{text}</span><span className="origin-kind">{{ volume: '카탈로그 권', listing: '목록 페이지', page: '페이지' }[l.kind]}</span>{l.label && <strong>{l.label}</strong>}{r?.title && r.title !== l.label && <em>{r.title}</em>}</div>
    <a href={safeHref(l.url)} target="_blank" rel="noreferrer">{l.url}<Icon name="external" size={11}/></a>
    {r && <p>{r.error || (r.why?.length ? r.why.join(' · ') : r.status === 'baseline' ? '처음 점검한 본문을 기준으로 잡았습니다. 다음 점검부터 바뀐 내용을 알립니다.' : r.note || (r.volumes != null ? `권 ${r.volumes}개를 읽었습니다.` : 'DB 와 같습니다.'))}{r.pages ? ` · ${r.pages}쪽` : ''}{l.checked_at ? ` · ${date(l.checked_at, true)} 확인` : ''}</p>}
    {r?.diff && <Diff diff={r.diff}/>}
    <footer>{l.kind === 'page' && r?.status === 'changed' && <Button busy={busy} icon="check" onClick={accept}>바뀐 내용 확인 · 새 기준으로</Button>}<IconButton icon="close" label="링크 빼기" disabled={busy} onClick={remove}/></footer></div>;
}
