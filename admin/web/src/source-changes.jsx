import { useEffect, useRef, useState } from 'react';
import { date, post } from './api';
import { Button, Empty, ErrorBox, Loading, Modal, Pager } from './components';
import { useApp, useLoad } from './context';
import './source-changes.css';

const names = { new: '신규', changed: '변경', 'new-category': '신규 분류', 'new-page': '신규 페이지',
  moved: '이동', gone: '원본에서 빠짐', removed: '목록에서 빠짐', broken: '연결 변경' };
const active = j => ['queued','running'].includes(j?.status);
export function SourceChangesDialog({id}) {
  const {info, close, version, refresh, notify} = useApp();
  const source = info.sources.find(s => s.id === id);
  const [history, setHistory] = useState(false), [offset, setOffset] = useState(0);
  const [choices, setChoices] = useState({}), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [jobId, setJobId] = useState(null);
  const finished = useRef(null);
  const {data, error: readError, retry} = useLoad('/sources/' + id + '/changes?' + new URLSearchParams({history, offset}), version);
  const current = useLoad('/sources/' + id + '/changes/job', version);
  const tracked = useLoad(jobId ? '/jobs/' + jobId : null, version);
  const job = current.data?.id ? current.data : tracked.data?.id ? tracked.data : null;
  const working = busy || active(job);
  useEffect(() => {
    if (active(job)) {
      const timer = setTimeout(refresh, 1800);
      return () => clearTimeout(timer);
    }
    if (job?.id && job.id !== finished.current) {
      finished.current = job.id;
      if (job.kind === 'dss-review' && job.status === 'succeeded') notify('선택한 변경을 처리했습니다.');
      refresh();
    }
  }, [job, refresh, notify]);
  const applied = Object.values(choices).filter(v => v === 'apply').length;
  const ignored = Object.values(choices).filter(v => v === 'ignore').length;
  function tab(value) {setHistory(value); setOffset(0);}
  function choose(key, val) {
    setChoices(old => {const next = {...old}; if (val) next[key] = val; else delete next[key]; return next;});
  }
  async function submit(check) {
    setBusy(true); setError('');
    try {
      const result = check ? await post('/jobs', {kind:'check',source_id:id}) : await post('/sources/' + id + '/changes', {choices});
      setJobId(result.job?.id || (check ? result.id : null));
      if (!check) {setChoices({}); setOffset(0); if (!result.job) notify('선택한 변경을 처리했습니다.');}
      refresh(); retry();
    } catch(e) {setError(e.message); if (e.status === 409) {setChoices({}); setOffset(0);} retry();} finally {setBusy(false);}
  }
  const schedule = data?.schedule;
  const onSchedule = schedule?.enabled && schedule.channels.includes(({samsung:'site',catalogs:'ecat',media:'solutions'})[id]);
  return <Modal title={source.name + ' 변경 내역'} close={close} wide
    footer={<><span className="sc-selection">{applied || ignored ? '적용 ' + applied + '건 · 무시 ' + ignored + '건' : ''}</span>
      <Button variant="primary" disabled={working || !(applied + ignored)} onClick={() => submit(false)}>선택한 변경 처리</Button></>}>
    <div className="sc-review"><div className="sc-check"><div><strong>{schedule && (onSchedule ? '매일 ' + schedule.time + ' 점검' : '예약 점검 꺼짐')} {onSchedule && <small>한국시간</small>}</strong>
      <p>마지막 점검 {source.checked_at ? date(source.checked_at, true) : '기록 없음'}</p></div>
      <Button icon="refresh" busy={working} disabled={working || !source.enabled} onClick={() => submit(true)}>지금 점검</Button></div>
      {active(job) && <p className="sc-progress" role="status">{job.stage || '작업 대기 중'} · {job.progress || 0}%</p>}
      {job && ['failed','partial','interrupted','cancelled'].includes(job.status) && <ErrorBox error={job.error || '작업을 완료하지 못했습니다.'}/>}
      {error && <ErrorBox error={error}/>}
      <div className="tabs" role="tablist">{[[false,'검토할 변경'],[true,'처리 이력']].map(([h,t]) =>
        <button key={t} role="tab" aria-selected={history === h} className={history === h ? 'selected' : ''} onClick={() => tab(h)}>{t}</button>)}</div>
      {readError ? <ErrorBox error={readError} retry={retry}/> : !data || data.history !== history || data.offset !== offset ? <Loading/> : <>
        {!history && data.checks?.length > 0 && <div className="sc-check-results">{data.checks.map(c =>
          <p className={['failed','partial','unchecked'].includes(c.status) ? 'sc-issue' : ''} key={c.id}><b>{c.label}</b> {c.summary}</p>)}</div>}
        {data.items.length ? <div className="sc-rows">{data.items.map(r => {
          const c = r.item, title = c.name || c.title || c.cat || r.ref;
          const url = /^https:\/\//i.test(c.url || '') ? c.url : id === 'samsung' && c.url ? 'https://www.samsung.com/sec/business/' + c.url.replace(/^\/+/, '') : '';
          return <div key={r.id} className="sc-row"><div><small>{r.origin_label} · {names[c.status] || c.status} · {date(r.seen_at,true)}</small>
            <strong>{title}</strong>{(c.detail?.length ? c.detail : c.why || []).map((line,i) => <p key={i}>{line}</p>)}
            {c.comparison?.length > 0 && <details className="sc-comparison"><summary>변경 전후 보기 ({c.comparison.length.toLocaleString('ko-KR')})</summary>
              <dl>{c.comparison.map((d,i) => <div key={i}><dt>{d.field}</dt><dd><del>{d.before || '없음'}</del> → <ins>{d.after || '없음'}</ins></dd></div>)}</dl></details>}
            {url && <a href={url} target="_blank" rel="noreferrer" title={url}>{r.origin === 'solutions' ? url : '원본 보기'}</a>}</div>
            {history ? <div className="sc-outcome"><b>{({applied:'적용됨',ignored:'무시됨',pending:'점검 결과 변경'})[r.state]}</b><small>{r.actor} {r.decided_at && date(r.decided_at,true)}</small></div>
              : <select aria-label={title + ' 처리 방식'} value={choices[r.id] || ''} disabled={working} onChange={e => choose(r.id,e.target.value)}>
                <option value="">미선택</option><option value="apply">적용</option><option value="ignore">무시</option></select>}</div>;
        })}</div> : <Empty icon="check" title={history ? '처리 이력이 없습니다' : '검토할 변경이 없습니다'}/>}
        {data.total > data.limit && <Pager offset={offset} total={data.total} size={data.limit} onChange={setOffset}/>}
      </>}
    </div></Modal>;
}
