import {FeedbackPopup} from './feedback-popup.jsx';
// One server PoC job: status, the mode that actually ran (server llm.effective), 진행 보기 (log), 멈추기 (cancel) and,
// when the Layout Agent stops for its strategy interview, the questions with their options — answered here.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, toast } from './common.jsx';
import { useJobsState, isTerminal, cancelJob, answerJob, adoptJob } from '../repositories/jobs.js';
import { modeLabel, requestErrorText } from '../services/poc-client.js';
import '../styles/agent-jobs.css';

const STATUS = { queued: '대기 중', running: '진행 중', waiting: '답을 기다려요', done: '완료', error: '실패', cancelled: '취소됨', lost: '서버에서 작업을 잃었어요' };
const txt = (v) => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : String(v.label || v.note || v.text || v.question || v.msg || v.name || ''));

// Strategy/ending/length option labels carry a stable key before ':'; defaults contain that key.
const optionValue = (q, label) => ['strategy', 'ending', 'length'].includes(q.id) ? label.split(':')[0].trim() : label;

/** The tracked record for a job id (null when this browser does not follow it). */
export function useJob(id) {
  const st = useJobsState();
  return useMemo(() => (id ? st.jobs.find((r) => r.id === id) || null : null), [st, id]);
}
/** Records of one owner (proposal / review), newest first. */
export function useOwnerJobs(type, ownerId, purpose = null) {
  const st = useJobsState();
  return useMemo(() => st.jobs.filter((r) => r.owner && r.owner.type === type && r.owner.id === ownerId && (!purpose || r.purpose === purpose)), [st, type, ownerId, purpose]);
}
/** Follow a job recorded in a proposal / review that this browser lost track of (cleared storage, another tab). */
export function useAdopt(id, opts) {
  const job = useJob(id);
  const key = opts ? opts.purpose + ':' + (opts.owner && opts.owner.id) : '';
  useEffect(() => { if (id && !job && opts) adoptJob(id, opts); }, [id, !!job, key]);
  return job;
}

function JobLog({ events }) {
  const ref = useRef(null);
  const list = (events || []).filter((e) => e.message).slice(-120);
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight; }, [list.length]);
  return (
    <ol className="ajc-log" ref={ref} aria-label="작업 기록" aria-live="polite">
      {list.length ? list.map((e) => (
        <li key={e.seq} className={'lv-' + (e.level || 'info')}><span className="t num">{e.t != null ? Number(e.t).toFixed(1) + 's' : ''}</span><span>{e.message}</span></li>
      )) : <li className="empty">아직 기록이 없어요</li>}
    </ol>
  );
}

function QuestionForm({ job }) {
  const w = job.waiting || {};
  const qs = (Array.isArray(w.questions) ? w.questions : []).filter((q) => q && q.id);
  const [ans, setAns] = useState(() => Object.fromEntries(qs.map((q) => [q.id, q.default != null ? String(q.default) : ''])));
  const [busy, setBusy] = useState(false);
  const set = (id, v) => setAns((a) => ({ ...a, [id]: v }));
  const send = async (useDefaults) => {
    setBusy(true);
    try {
      const answers = useDefaults ? {} : Object.fromEntries(Object.entries(ans).map(([k, v]) => [k, String(v || '').slice(0, 2000)]));
      await answerJob(job.id, answers, useDefaults);
      toast('답을 보냈어요 · 이어서 구성해요');
    } catch (e) {
      toast(requestErrorText(e), 'warn');
    }
    setBusy(false);
  };
  const groups = Array.isArray(w.groups) ? w.groups : [];
  const conflicts = Array.isArray(w.conflicts) ? w.conflicts : [];
  const gaps = Array.isArray(w.gaps) ? w.gaps : [];
  return (
    <div className="ajc-q" role="group" aria-label="Layout Agent 질문">
      {w.message && <p className="ajc-qm">{txt(w.message)}</p>}
      {job.partial && job.partial.level_label && <p className="ajc-note">{job.partial.level_label}{job.partial.level_reason ? ' — ' + job.partial.level_reason : ''}</p>}
      {groups.length > 0 && <ul className="ajc-qs" aria-label="기준별 요구">{groups.slice(0, 8).map((g, i) => <li key={i}><b>{txt(g.dimension)}</b> · 요구 {Number(g.n) || 0}개{g.must ? ` (필수 ${Number(g.must) || 0})` : ''}{g.summary ? ' — ' + txt(g.summary) : ''}</li>)}</ul>}
      {conflicts.length > 0 && <ul className="ajc-qs" aria-label="충돌 · 위험">{conflicts.slice(0, 6).map((c, i) => <li key={i}>{c && c.kind ? '[' + txt(c.kind) + '] ' : ''}{txt(c && (c.note || c)) }</li>)}</ul>}
      {gaps.length > 0 && <ul className="ajc-qs" aria-label="빠진 정보">{gaps.slice(0, 6).map((g, i) => <li key={i}>{txt(g)}</li>)}</ul>}
      {qs.map((q) => {
        const opts = (Array.isArray(q.options) ? q.options : []).map(txt).filter(Boolean);
        const v = ans[q.id] == null ? '' : ans[q.id];
        const custom = opts.some(o => optionValue(q, o) === v) ? '' : v;
        return (
          <fieldset key={q.id} className="ajc-qf">
            <legend>{txt(q.question) || q.id}</legend>
            {opts.length > 0 && (
              <div className="ajc-opts">
                {opts.map((o) => (
                  <label key={o} className={'ajc-opt' + (v === optionValue(q, o) ? ' on' : '')}>
                    <input type="radio" name={job.id + '-' + q.id} checked={v === optionValue(q, o)} onChange={() => set(q.id, optionValue(q, o))} />{o}
                  </label>
                ))}
              </div>
            )}
            <label className="sr" htmlFor={job.id + '-in-' + q.id}>{txt(q.question)} 직접 입력</label>
            <input id={job.id + '-in-' + q.id} className="input" value={custom} maxLength={2000}
              placeholder={opts.length ? '직접 입력 (선택)' : q.default ? '비워 두면 기본값: ' + txt(q.default) : '답을 적어 주세요 (비워 두면 기본값)'}
              onChange={(e) => set(q.id, e.target.value || (q.default != null && opts.length ? String(q.default) : ''))} />
          </fieldset>
        );
      })}
      <div className="ajc-qa">
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => send(true)}>기본값으로 진행</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => send(false)}>{busy ? <span className="spin" /> : <Icon name="check" size={13} stroke={2.6} />}답 보내기</button>
      </div>
    </div>
  );
}

/**
 * id: server job id (must be followed by repositories/jobs.js). children render under the header (e.g. pending-result actions).
 * onClose: shown for finished jobs (hide the card).
 * onRetry: shown when the job failed (error · lost · a result without any model call) — starts a new job; the caller keeps
 * the user's data as it is.
 */
export function AgentJobControl({ id, title, defaultOpen = false, compact = false, onClose, onRetry, children }) {
  const job = useJob(id);
  const [open, setOpen] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (job && job.status === 'waiting') setOpen(true); }, [job && job.status]);
  if (!job) return null;
  const term = isTerminal(job.status);
  const failed = job.status === 'error' || job.status === 'lost' || (job.status === 'done' && job.outcome === 'failed');
  const mode = modeLabel(job.llm);
  const retry = async () => {
    if (!onRetry) return;
    setBusy(true);
    try { await onRetry(job); } catch (e) { toast(requestErrorText(e), 'warn'); }
    setBusy(false);
  };
  const last = [...(job.events || [])].reverse().find((e) => e.type === 'text' && e.message);
  const cancel = async () => {
    setBusy(true);
    try { await cancelJob(job.id); toast('멈춤을 요청했어요 · 지금 단계가 끝나면 멈춰요'); } catch (e) { toast(requestErrorText(e), 'warn'); }
    setBusy(false);
  };
  const icon = job.status === 'done' ? <Icon name="check" size={12} stroke={3} /> : job.status === 'waiting' ? <Icon name="notice" size={13} stroke={2.8} />
    : term ? <Icon name="alert" size={12} /> : <span className="spin" />;
  return <FeedbackPopup message={title || job.title || '서버 작업'} kind={failed?'error':term?'info':'progress'} content={
    <section className={'ajc st-' + job.status + (compact ? ' compact' : '')} aria-label={(title || job.title || '서버 작업') + ' · ' + (STATUS[job.status] || job.status)}>
      <div className="ajc-h">
        <span className="ajc-ic" aria-hidden="true">{icon}</span>
        <span className="ajc-t">
          <b title={title || job.title}>{title || job.title || '서버 작업'}</b>
          <span className="ajc-s" role="status">{STATUS[job.status] || job.status}{!term && last ? ' · ' + last.message : ''}</span>
        </span>
        {mode && <span className={'ajc-mode m-' + mode.k} title="서버가 알려 준, 실제로 쓰인 처리 방식">{mode.label}</span>}
        <span className="ajc-acts">
          <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}><Icon name={open ? 'chevU' : 'list'} size={13} />{open ? '접기' : '진행 보기'}</button>
          {job.status === 'waiting' && !open && <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>질문에 답하기</button>}
          {!term && <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={cancel}><Icon name="x" size={13} />멈추기</button>}
          {term && (failed || job.status === 'cancelled') && onRetry && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={retry}>{busy ? <span className="spin" /> : <Icon name="refresh" size={13} />}다시 시도</button>}
          {term && onClose && <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="작업 카드 닫기" onClick={onClose}><Icon name="x" size={13} /></button>}
        </span>
      </div>
      {job.net && job.net.fail ? <p className="ajc-net">서버 응답을 다시 기다리는 중이에요 · 재시도 {job.net.fail}회</p> : null}
      {job.error && job.error.message && term && <p className="ajc-err">{job.error.message}</p>}
      {job.status === 'done' && job.outcome === 'failed' && job.outcomeNote && <p className="ajc-err">{job.outcomeNote}</p>}
      {children}
      {open && (
        <div className="ajc-b">
          {job.status === 'waiting' && job.waiting && <QuestionForm key={job.id + ':' + (Array.isArray(job.waiting.questions) ? job.waiting.questions.map((q) => q && q.id).join('|') : '')} job={job} />}
          <JobLog events={job.events} />
        </div>
      )}
    </section>
  }/>;
}
