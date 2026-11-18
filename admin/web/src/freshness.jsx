// 홈의 「최신성 점검」 — 소스를 골라 동시에 점검하고, 소스마다 무엇이 달라졌는지 전부 보고한다
import { useEffect, useState } from 'react';
import { api, post, date, number } from './api';
import { Icon } from './icons';
import { Badge, Button, ErrorBox, Loading, Modal, Progress } from './components';
import { useApp, useLoad } from './context';
import './freshness.css';

const TARGETS = [
  { id: 'samsung', name: 'samsung.com/business 제품', icon: 'globe', minutes: '약 10분', what: '모든 분류의 제품 목록 · 옵션 · 사양 · 특장점을 다시 받아 현재 DB 와 비교합니다. 신규 · 판매 종료 · 바뀐 제품을 모두 보고합니다.' },
  { id: 'catalogs', name: 'e-카탈로그', icon: 'book', minutes: '1분 이내', what: '카탈로그 권마다 파일이 DB 에 받은 것과 같은지 다른지 확인합니다.' },
];
const active = status => ['queued', 'running'].includes(status);
const safeHref = url => /^https:\/\//i.test(url || '') ? url : undefined;
const duration = s => s == null ? '' : s < 90 ? `${s}초` : `${Math.round(s / 60)}분`;

export function FreshnessDialog() {
  const { close, info, notify, refresh, version } = useApp();
  const [picked, setPicked] = useState(() => new Set(TARGETS.map(t => t.id)));
  const [shown, setShown] = useState(null);  // 보고 화면에 올린 소스 { id: 작업 ID | null }
  const [busy, setBusy] = useState(false);
  const jobs = useLoad('/jobs?limit=40', version);
  // 다시 열었을 때 진행 중인 점검이 있으면 그 진행 화면으로 바로 간다
  const sources = Object.fromEntries((info?.sources || []).map(s => [s.id, s]));
  useEffect(() => {
    if (shown || !jobs.data) return;
    const running = Object.fromEntries(jobs.data.items.filter(j => j.kind === 'check' && active(j.status) && TARGETS.some(t => t.id === j.source_id)).map(j => [j.source_id, j.id]));
    if (!Object.keys(running).length) return;
    // 먼저 끝난 원본의 결과도 옆에 함께 둔다
    for (const t of TARGETS) if (!(t.id in running) && sources[t.id]?.decision?.basis === 'origin') running[t.id] = null;
    setShown(running);
  }, [jobs.data, shown]);
  const toggle = id => setPicked(old => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  async function start(ids) {
    setBusy(true);
    // 소스마다 따로 시작한다 — 서버가 동시에 실행한다
    const results = await Promise.allSettled(ids.map(id => post('/jobs', { kind: 'check', source_id: id })));
    const next = { ...(shown || {}) };
    results.forEach((r, i) => { if (r.status === 'fulfilled') next[ids[i]] = r.value.id; else notify(`${TARGETS.find(t => t.id === ids[i]).name}: ${r.reason.message}`, 'error'); });
    setBusy(false);
    if (Object.keys(next).length) setShown(next);
    refresh();
  }
  const working = shown && jobs.data?.items.some(j => Object.values(shown).includes(j.id) && active(j.status));
  if (!shown) return <Modal title="최신성 점검" subtitle="점검할 원본을 고르세요. 고른 원본은 동시에 점검합니다." close={close}
    footer={<><Button onClick={close}>닫기</Button><Button variant="primary" icon="spark" busy={busy} disabled={busy || !picked.size} onClick={() => start(TARGETS.filter(t => picked.has(t.id)).map(t => t.id))}>{picked.size ? `${picked.size}개 원본 점검 시작` : '원본을 골라 주세요'}</Button></>}>
    <div className="fresh-options">{TARGETS.map(t => { const s = sources[t.id]; const on = picked.has(t.id);
      return <label key={t.id} className={'fresh-option ' + (on ? 'on' : '') + (s && !s.enabled ? ' off' : '')}><input type="checkbox" checked={on} disabled={s && !s.enabled} onChange={() => toggle(t.id)}/>
        <span className="fresh-check"><Icon name="check" size={13}/></span><span className="fresh-option-icon"><Icon name={t.icon} size={20}/></span>
        <div><strong>{t.name}<small>{t.minutes}</small></strong><p>{t.what}</p>
          {s && <p className="fresh-last">{s.decision?.basis === 'origin' ? <><Badge status={s.status}/>{date(s.checked_at, true)} · {s.decision.reason}</> : !s.enabled ? '사용 중지한 소스입니다.' : '아직 점검한 적이 없습니다.'}</p>}
          {s?.decision?.basis === 'origin' && <button type="button" className="text-button" onClick={e => { e.preventDefault(); setShown({ [t.id]: null }); }}>지난 점검 결과 보기<Icon name="arrow" size={14}/></button>}</div></label>; })}</div>
    <p className="fresh-note"><Icon name="shield" size={14}/>실제 원본을 다시 받아 현재 DB 와 대조합니다. DB 는 바꾸지 않습니다.</p>
  </Modal>;
  const ids = TARGETS.filter(t => t.id in shown).map(t => t.id);
  return <Modal title="최신성 점검" subtitle={working ? '고른 원본을 동시에 점검하고 있습니다. 창을 닫아도 계속 진행됩니다.' : '원본과 현재 DB 를 대조한 결과입니다.'} close={close} wide
    footer={<><Button disabled={working} onClick={() => setShown(null)}>원본 다시 고르기</Button><Button variant="primary" onClick={close}>{working ? '닫기 · 계속 진행' : '확인'}</Button></>}>
    <div className={'fresh-results ' + (ids.length > 1 ? 'two' : '')}>{ids.map(id => <SourceRun key={id} target={TARGETS.find(t => t.id === id)} job={shown[id]} retry={() => start([id])}/>)}</div>
  </Modal>;
}

function SourceRun({ target, job, retry }) {
  const { version, notify, refresh } = useApp();
  const state = useLoad(job ? '/jobs/' + job : '/jobs?limit=1', version);
  const j = job ? state.data : null;
  const finished = !job || (j && !active(j.status));
  async function cancel() { try { await post('/jobs/' + job + '/cancel', {}); refresh(); notify('점검 취소를 요청했습니다.'); } catch (e) { notify(e.message, 'error'); } }
  return <section className="fresh-source"><header><span className="fresh-option-icon"><Icon name={target.icon} size={19}/></span><h3>{target.name}</h3>{j && active(j.status) && <Badge status={j.status}/>}</header>
    {job && !j ? <Loading/> : j && active(j.status) ? <div className="fresh-progress"><div><strong>{j.stage}</strong><b>{j.progress}%</b></div><Progress value={j.progress}/><p>{target.minutes} 걸립니다.</p><button className="text-button" onClick={cancel} disabled={j.cancelled}>{j.cancelled ? '취소하는 중' : '이 점검 취소'}</button></div>
      : j && j.status !== 'succeeded' ? <div className="fresh-failed"><ErrorBox error={j.error || j.result?.errors?.[0]?.error || '점검을 끝내지 못했습니다.'}/><Button icon="refresh" onClick={retry}>다시 점검</Button></div>
      : finished && <Report id={target.id} stamp={j?.finished_at}/>}
  </section>;
}

function Report({ id, stamp }) {
  const result = useLoad('/sources/' + id + '/report' + (stamp ? '?at=' + encodeURIComponent(stamp) : ''));
  if (result.error) return <ErrorBox error={result.error} retry={result.retry}/>;
  if (!result.data) return <Loading/>;
  const { decision, detail: d, source } = result.data;
  if (!d) return <p className="fresh-empty">{source.error || '아직 점검 결과가 없습니다.'}</p>;
  return <div className="fresh-report"><div className={'fresh-verdict ' + (decision?.status || 'uncertain')}><Badge status={decision?.status || 'uncertain'}/><div><strong>{d.summary}</strong><p>{date(d.checked_at, true)} 점검{d.seconds != null && ` · ${duration(d.seconds)} 걸림`}</p></div></div>
    {d.kind === 'site' ? <SiteReport d={d}/> : <CatalogReport d={d}/>}
    {d.errors.length > 0 && <Group title="확인하지 못한 항목" count={d.errors.length} tone="red" open>{d.errors.map((e, i) => <Row key={i} title={e.title || e.url} url={e.url} lines={[e.error]}/>)}</Group>}
    <p className="fresh-coverage">확인 범위: {d.coverage}{d.known_errors ? ` 지난 수집에도 같았던 수집 오류 ${d.known_errors}건은 새 문제로 세지 않았습니다.` : ''}</p>
  </div>;
}

function Stat({ label, value, tone }) { return <div className={'fresh-stat ' + (value > 0 && tone ? tone : '')}><b>{value == null ? '–' : number(value)}</b><span>{label}</span></div>; }

function SiteReport({ d }) {
  const c = d.counts, fields = Object.entries(d.fields || {}).sort((a, b) => b[1] - a[1]);
  const product = p => <Row key={p.gid} title={p.name} url={p.url} tags={[p.category, ...p.models.slice(0, 4), p.models.length > 4 ? `외 ${p.models.length - 4}개 모델` : null]}
    lines={[...(p.detail.length ? p.detail : p.why), p.app.length ? `앱 제품 ${p.app.length}개가 이 상품을 씁니다: ${p.app.slice(0, 6).join(', ')}${p.app.length > 6 ? ' …' : ''}` : null]}/>;
  return <><div className="fresh-stats"><Stat label="DB 상품 카드" value={c.db}/><Stat label="원본 상품 카드" value={c.origin}/><Stat label="같음" value={c.same}/><Stat label="바뀜" value={d.changed.length} tone="amber"/><Stat label="신규" value={d.new.length} tone="amber"/><Stat label="판매 종료 후보" value={d.removed.length} tone="red"/></div>
    <p className="fresh-scope">분류 {number(c.categories)}개 · 옵션 포함 사양 {number(c.specs)}건을 확인했습니다.{d.moved.length > 0 && ` 상품 번호만 바뀐 카드 ${d.moved.length}개.`}{d.categories.length > 0 && ` 메뉴에 새로 생긴 분류 ${d.categories.length}개.`}</p>
    <Group title="신규 제품" hint="원본에 새로 올라왔고 DB 에는 없습니다" count={d.new.length} tone="amber" open>{d.new.map(product)}</Group>
    <Group title="판매 종료 후보" hint="DB 에는 있는데 원본 목록에서 빠졌습니다" count={d.removed.length} tone="red" open>{d.removed.map(product)}</Group>
    <Group title="바뀐 제품" hint={fields.length ? fields.map(([name, n]) => `${name} ${n}`).join(' · ') : '이름 · 모델 · 옵션 · 사양 · 특장점 · 품절 상태'} count={d.changed.length} tone="amber" open={d.changed.length <= 30}>{d.changed.map(product)}</Group>
    <Group title="상품 번호가 바뀐 카드" hint="같은 모델이 새 상품 카드로 옮겨졌습니다(판매 종료 아님)" count={d.moved.length}>{d.moved.map(product)}</Group>
    <Group title="메뉴의 새 분류" count={d.categories.length} tone="amber">{d.categories.map(x => <Row key={x.name} title={x.name} url={x.url} lines={['수집 대상에 없는 분류입니다.']}/>)}</Group></>;
}

function CatalogReport({ d }) {
  const c = d.counts, why = { changed: '파일 다름', new: '새 권', gone: '빠진 권' };
  return <><div className="fresh-stats"><Stat label="DB 카탈로그" value={c.db}/><Stat label="파일 같음" value={c.same}/><Stat label="파일 다름" value={c.changed} tone="amber"/><Stat label="새 권" value={c.new} tone="amber"/><Stat label="빠진 권" value={c.gone} tone="red"/></div>
    <p className="fresh-scope">쪽 파일 {number(c.files)}개의 수정 시각을 DB 에 받은 시각과 비교했습니다.{d.issue?.live && ` 정기 호: ${d.issue.live} — ${d.issue.applied ? 'DB 에 적용됨' : 'DB 에 아직 없음'}.`}</p>
    <Group title="DB 와 다른 카탈로그" count={d.different.length} tone="amber" open>{d.different.map(b => <Row key={b.dir} title={b.title} url={b.url} tags={[why[b.status] || b.status, `Dir ${b.dir}`, b.pages ? `${b.pages}쪽` : null]}
      lines={[b.why.join(' · '), b.modified_pages.length ? `바뀐 쪽: ${b.modified_pages.join(', ')}` : null, b.file_modified ? `원본 파일 수정 ${date(b.file_modified, true)} · DB 에 받은 시각 ${date(b.fetched_at, true)}` : null]}/>)}</Group>
    <Group title="카탈로그 전체" hint="권마다 원본 파일이 DB 에 받은 것과 같은지" count={d.books.length}><table className="fresh-books"><thead><tr><th>카탈로그</th><th>쪽</th><th>원본 파일 수정</th><th>DB 에 받은 시각</th><th>파일</th></tr></thead>
      <tbody>{d.books.map(b => <tr key={b.dir} className={b.status}><td>{b.title}<small>Dir {b.dir}</small></td><td>{b.pages}</td><td>{b.fileModified ? date(b.fileModified, true) : '–'}</td><td>{b.fetchedAt ? date(b.fetchedAt, true) : '–'}</td><td><span className={'fresh-tag ' + (b.status === 'same' ? 'green' : 'amber')}>{b.status === 'same' ? '같음' : '다름'}</span></td></tr>)}</tbody></table></Group></>;
}

function Group({ title, hint, count, tone = '', open = false, children }) {
  const [shown, setShown] = useState(open), [all, setAll] = useState(false);
  const rows = Array.isArray(children) ? children : [children];
  const list = rows.length > 30 && !all ? rows.slice(0, 30) : rows;
  if (!count) return <div className="fresh-group none"><header><h4>{title}</h4><b>0</b><span>없음</span></header></div>;
  return <div className={'fresh-group ' + (shown ? 'open' : '')}><header role="button" tabIndex={0} onClick={() => setShown(!shown)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setShown(!shown))}><h4>{title}</h4><b className={tone}>{number(count)}</b>{hint && <span>{hint}</span>}<Icon name="down" size={14}/></header>
    {shown && <div className="fresh-rows">{list}{rows.length > 30 && <button className="text-button" onClick={() => setAll(!all)}>{all ? '처음 30개만 보기' : `나머지 ${number(rows.length - 30)}개 모두 보기`}</button>}</div>}</div>;
}

function Row({ title, url, tags = [], lines = [] }) {
  return <div className="fresh-row"><div>{safeHref(url) ? <a href={url} target="_blank" rel="noreferrer">{title}<Icon name="external" size={11}/></a> : <strong>{title}</strong>}{tags.filter(Boolean).map((t, i) => <span className={'fresh-tag' + (/[가-힣]/.test(t) ? ' text' : '')} key={i}>{t}</span>)}</div>{lines.filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}</div>;
}
