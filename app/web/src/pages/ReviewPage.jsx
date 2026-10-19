import { CriteriaInfo } from '../components/CriteriaInfo.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Modal, toast, fmtWhen } from '../components/common.jsx';
import { useStore } from '../repositories/proposals.js';
import { reqText } from '../services/search.js';
import { INDUSTRIES, IND } from '../services/catalog.js';
import { PARTS } from '../domain/proposals/parts.js';
import { ACCEPT, fileKind, KIND_LABEL } from '../domain/review/parse.js';
import { CATS, CAT, CR, CRITERIA, band, verdictOf } from '../domain/review/criteria.js';
import { useReviews, startReview, rerunReview, retryReview, deleteReview, stopReview, isRunning, loadDoc, GROUPS } from '../repositories/reviews.js';
import { getDownloads, DL_ERR, safeName } from '../components/viewer.jsx';
import { partHue } from '../components/common.jsx';
import { TagChip } from '../components/tagcard.jsx';
import { SheetView } from '../components/sheetview.jsx';
import { PRODUCTS, SOLUTIONS } from '../services/catalog.js';
import { AgentJobControl, useAdopt } from '../components/AgentJobControl.jsx';
import { modeLabel } from '../services/poc-client.js';
// review profile keeps model / solution names — map them back to the catalog for thumbnails
const prodIdOf = (model) => { const k = String(model || '').replace(/[- ]/g, '').toUpperCase(); const x = PRODUCTS.find((q) => q.model.replace(/[- ]/g, '').toUpperCase() === k); return x ? x.id : null; };
const solIdOf = (name) => { const x = SOLUTIONS.find((q) => q.name === name); return x ? x.id : null; };

const NCRIT = CRITERIA.length;
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
const AI_FAIL = {
  unavailable: 'AI를 쓸 수 없는 화면이라 자동 점검 규칙으로 채점했어요.', not_granted: 'AI 사용이 허용되지 않아 자동 점검 규칙으로 채점했어요.', sampling_disabled: '이 계정에서는 AI를 쓸 수 없어 자동 점검 규칙으로 채점했어요.',
  rate_limited: 'AI 요청이 많아 일부 기준은 자동 점검 규칙으로 채점했어요. 잠시 뒤 다시 평가해 보세요.', cancelled: 'AI 평가를 멈춰서 남은 기준은 자동 점검 규칙으로 채점했어요.',
  prompt_too_large: '제안서가 너무 길어 일부 기준은 자동 점검 규칙으로 채점했어요.', images_unavailable: '장표 이미지를 보낼 수 없어 디자인 기준은 텍스트로만 평가했어요.',
};

function useFileDrop(onFiles) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  return {
    over,
    bind: {
      onDragEnter: (e) => { if (!Array.from(e.dataTransfer.types || []).includes('Files')) return; e.preventDefault(); depth.current++; setOver(true); },
      onDragOver: (e) => { if (!Array.from(e.dataTransfer.types || []).includes('Files')) return; e.preventDefault(); },
      onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
      onDrop: (e) => { e.preventDefault(); depth.current = 0; setOver(false); if (e.dataTransfer.files && e.dataTransfer.files.length) onFiles(e.dataTransfer.files); },
    },
  };
}
function checkFiles(files) {
  const list = Array.from(files || []);
  const ok = list.filter((f) => ['pptx', 'pdf', 'docx', 'txt'].includes(fileKind(f.name)));
  if (!ok.length) {
    const lg = list.find((f) => fileKind(f.name) === 'legacy');
    toast(lg ? `${lg.name} 형식은 읽을 수 없어요 · PPTX · PDF · DOCX로 저장해서 올려 주세요` : 'PPTX · PDF · DOCX · TXT 파일을 올려 주세요', 'warn');
    return null;
  }
  const big = ok.find((f) => f.size > 150 * 1048576);
  if (big) { toast(big.name + ' 파일이 너무 커요 (150MB 이하)', 'warn'); return null; }
  return ok.slice(0, 2);
}

// ---------------------------------------------------------------- home entry
export function ReviewEntry({ go }) {
  const n = useReviews((s) => s.reviews.length);
  const last = useReviews((s) => s.reviews[0]);
  const inp = useRef(null);
  const onFiles = (files) => { const ok = checkFiles(files); if (!ok) return; const id = startReview(ok); go({ name: 'review', id }); };
  const { over, bind } = useFileDrop(onFiles);
  return (
    <div className={'rv-entry' + (over ? ' over' : '')} {...bind}>
      <button className="rv-entry-hit" onClick={() => inp.current.click()} aria-label="제안서 검토 — 파일을 골라 평가 시작">
        <span className="rv-entry-ic"><Icon name="clipCheck" size={22} /></span>
        <span className="rv-entry-t">
          <b>제안서 검토</b>
          <span>{over ? '여기에 놓으면 바로 평가를 시작해요' : `완성한 제안서를 끌어다 놓거나 눌러서 올리면, ${NCRIT}개 검토 기준 중 이 제안서에 맞는 기준으로 점수와 근거를 매겨요`}</span>
          <span className="rv-entry-fmt">PPTX · PDF · DOCX · PPTX와 같은 내용의 PDF를 함께 올리면 장표 화면까지 봐요</span>
        </span>
        <span className="rv-entry-cta"><Icon name="upload" size={16} />파일 올리기</span>
      </button>
      <button className="rv-hist-btn" onClick={() => go({ name: 'reviews' })} title="검토한 제안서 보기">
        <Icon name="clock" size={15} />평가 내역<span className="num">{n}</span>
      </button>
      {last && last.status === 'done' && last.agg && !over && (
        <span className="sr">최근 평가 {last.title} {last.agg.overall}점</span>
      )}
      <input ref={inp} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

// ---------------------------------------------------------------- history page (sidebar · 제안서 검토)
function MiniScore({ r }) {
  if (r.status === 'running') return <span className="rvh-score b-na"><span className="spin" /></span>;
  if (!r.agg) return <span className="rvh-score b-na"><Icon name="alert" size={18} /></span>;
  const b = band(r.agg.overall);
  return <span className={'rvh-score b-' + b.k}><b className="num">{r.agg.overall}</b><span>{b.label}</span></span>;
}
// first three slides of the evaluated deck — page image when the parse kept one, else the shape wireframe
function RvThumbs({ r }) {
  const [doc, setDoc] = useState(null);
  useEffect(() => { let on = true; if (r.status !== 'running') loadDoc(r.id).then((d) => { if (on) setDoc(d || false); }); return () => { on = false; }; }, [r.id, r.status]);
  const aspect = (doc && doc.aspect) || 16 / 9;
  const units = (doc && doc.units ? doc.units : r.units || []).slice(0, 3);
  return (
    <span className="rvh-thumbs" aria-hidden="true">
      {[0, 1, 2].map((i) => {
        const u = units[i];
        return (
          <span key={i} className={'rvh-th' + (u ? '' : ' empty')} style={{ aspectRatio: String(aspect) }}>
            {u && u.thumb && typeof u.thumb === 'string' ? <img src={u.thumb} alt="" loading="lazy" />
              : u && u.boxes && u.boxes.length ? <Wire u={u} aspect={aspect} />
              : u ? <span className="rvh-th-t">{u.title || ''}</span> : null}
          </span>
        );
      })}
    </span>
  );
}
export function ReviewHistory({ go }) {
  const list = useReviews((s) => s.reviews);
  const [confirm, setConfirm] = useState(null);
  const inp = useRef(null);
  const onFiles = (files) => { const ok = checkFiles(files); if (!ok) return; const id = startReview(ok); go({ name: 'review', id }); };
  const { over, bind } = useFileDrop(onFiles);
  const done = list.filter((r) => r.status === 'done' && r.agg);
  const avg = done.length ? Math.round(done.reduce((a, r) => a + r.agg.overall, 0) / done.length) : null;
  return (
    <div className={'tl rvh' + (over ? ' over' : '')} {...bind}>
      <div className="tl-in rvh-in">
        <header className="tl-head">
          <div className="tl-title">
            <span className="eyebrow">WINMATE · 제안서 검토</span>
            <h1>제안서 검토</h1>
            <p>완성한 제안서를 올리면 {NCRIT}개 검토 기준 중 이 제안서에 맞는 기준으로 점수와 근거, 먼저 고칠 점을 정리해 드려요.</p>
          </div>
        </header>

        <div className={'rvh-cta' + (over ? ' over' : '')}>
          <button className="rvh-go" onClick={() => inp.current.click()}><Icon name="upload" size={20} stroke={2.2} />{over ? '여기에 놓으면 바로 검토를 시작해요' : '제안서 검토하기'}</button>
          <span className="rvh-cta-sub">PPTX · PDF · DOCX 파일을 눌러서 고르거나 이 화면에 끌어다 놓으세요</span>
          <input ref={inp} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        </div>

        {list.length > 0 && (
          <section className="rvh-sec" aria-labelledby="rvh-h">
            <div className="rvh-sec-h">
              <h2 id="rvh-h">검토한 제안서 <span className="num">{list.length}</span></h2>
              {avg != null && <span className="faint">평균 <b className="num">{avg}</b>점</span>}
            </div>
            <ul className="rvh-list" aria-label="검토한 제안서">
              {list.map((r) => {
                const p = r.profile || {};
                const status = r.status === 'done' ? (r.summary && r.summary.verdict) || verdictOf(r.agg.overall)
                  : r.status === 'running' ? '평가 중…' : r.status === 'interrupted' ? '중간에 멈췄어요 · 이어서 평가할 수 있어요' : '평가하지 못했어요';
                const pr = r.agg ? r.agg.priorities.slice(0, 3).map((id) => CR[id] && CR[id].name).filter(Boolean) : [];
                return (
                  <li key={r.id} className="rvh-item">
                    <button className="rvh-card" onClick={() => go({ name: 'review', id: r.id })} aria-label={r.title + ' 평가 열기'}>
                      <MiniScore r={r} />
                      <span className="rvh-main">
                        <span className="rvh-t"><b>{r.title}</b>{r.demo && <span className="rvh-demo">예시</span>}</span>
                        <span className="rvh-tags">
                          {p.indName && <span className="tag"><Icon name="building" size={11} />{p.indName}</span>}
                          {r.strategy && <span className="tag rvh-strat"><Icon name="target" size={11} />{r.strategy}</span>}
                          {p.customer && <span className="rvh-cust">{p.customer}</span>}
                        </span>
                        <span className="rvh-verdict">{status}</span>
                        {pr.length > 0 && <span className="rvh-fix"><span className="faint">먼저 고칠 것</span>{pr.join(' · ')}</span>}
                      </span>
                      <RvThumbs r={r} />
                      {r.agg && (
                        <span className="rvh-cats" aria-label="영역별 점수">
                          {CATS.map((c) => { const v = r.agg.cats[c.id]; const b = band(v); return (
                            <span key={c.id} className={'rvh-cat b-' + b.k} title={c.name + ' ' + (v == null ? '제외' : v + '점')}>
                              <span className="rvh-cat-l">{c.short}</span><span className="rvh-cat-bar"><i style={{ height: (v || 0) + '%' }} /></span><span className="rvh-cat-v num">{v == null ? '—' : v}</span>
                            </span>
                          ); })}
                        </span>
                      )}
                      <span className="rvh-meta num">{fmtWhen(r.createdAt)}</span>
                    </button>
                    {confirm === r.id ? (
                      <span className="rv-hist-del"><button className="btn btn-sm btn-danger" onClick={() => { deleteReview(r.id); setConfirm(null); }}>지우기</button><button className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>취소</button></span>
                    ) : (
                      <button className="btn btn-ghost btn-sm btn-icon rvh-del" aria-label={r.title + ' 평가 지우기'} onClick={() => setConfirm(r.id)} disabled={r.status === 'running' && isRunning(r.id)}><Icon name="trash" size={14} /></button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- screen
export function ReviewScreen({ id, go }) {
  const r = useReviews((s) => s.reviews.find((x) => x.id === id) || null);
  const [modal, setModal] = useState(null);
  const inp = useRef(null);
  const onFiles = (files) => { const ok = checkFiles(files); if (!ok) return; const nid = startReview(ok); go({ name: 'review', id: nid }); };
  if (!r) return <div className="boot"><b>이 평가를 찾지 못했어요</b><button className="btn" onClick={() => go({ name: 'home' })}>홈으로</button></div>;
  const done = r.status === 'done';
  return (
    <div className="rv">
      <header className="topbar rv-top">
        <nav className="rv-crumb" aria-label="위치">
          <button className="btn btn-ghost btn-sm" onClick={() => go({ name: 'home' })}><Icon name="chevL" size={14} />홈</button>
          <span className="faint">/</span><button className="btn btn-ghost btn-sm rv-crumb-k" onClick={() => go({ name: 'reviews' })}>제안서 검토</button>
        </nav>
        <h1 className="rv-title" title={r.title}>{r.title}</h1>
        <span className="rv-files">{(r.files || []).map((f) => <span key={f.name} className="tag">{KIND_LABEL[f.kind] || f.kind}{f.role === 'visual' ? ' 화면' : ''} · {fmtSize(f.size || 0)}</span>)}</span>
        <div className="top-right">
          <button className="btn btn-sm" onClick={() => go({ name: 'reviews' })}><Icon name="clock" size={14} />평가 내역</button>
          {done && <button className="btn btn-sm" onClick={() => setModal('rerun')}><Icon name="sliders" size={14} />기준 조정 · 다시 평가</button>}
          {done && <button className="btn btn-sm" onClick={() => exportMd(r)}><Icon name="download" size={14} />리포트 저장</button>}
          <button className="btn btn-primary btn-sm" onClick={() => inp.current.click()}><Icon name="upload" size={14} />다른 파일 검토</button>
          <input ref={inp} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </header>
      <div className="rv-body">
        {r.status === 'running' ? <Progress r={r} />
          : r.status === 'error' ? <div className="rv-msg bad"><Icon name="alert" size={20} /><div><b>평가하지 못했어요</b><p>{r.error}</p><div className="rv-msg-act"><button className="btn btn-primary btn-sm" onClick={() => inp.current.click()}>다른 파일 올리기</button></div></div></div>
            : r.status === 'interrupted' ? <div className="rv-msg"><Icon name="info" size={20} /><div><b>평가가 중간에 멈췄어요</b><p>페이지를 새로 열면서 진행 중이던 평가가 끊겼어요. 읽어 둔 내용으로 이어서 평가할 수 있어요.</p><div className="rv-msg-act"><button className="btn btn-primary btn-sm" onClick={() => retryReview(r.id)}><Icon name="refresh" size={14} />이어서 평가</button></div></div></div>
              : <Report r={r} />}
      </div>
      {modal === 'rerun' && <RerunModal r={r} go={go} onClose={() => setModal(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- progress
function Progress({ r }) {
  const st = r.stage;
  const order = ['parse', 'profile', 'ai', 'summary'];
  const idx = order.indexOf(st);
  const applied = (r.sel || []).filter((s) => s.applied).length;
  const p = r.profile;
  const Step = ({ k, title, children }) => {
    const i = order.indexOf(k); const state = i < idx ? 'done' : i === idx ? 'on' : 'todo';
    return (
      <li className={'rv-step ' + state}>
        <span className="rv-step-dot">{state === 'done' ? <Icon name="check" size={12} stroke={3} /> : state === 'on' ? <span className="spin" /> : i + 1}</span>
        <div><b>{title}</b>{children}</div>
      </li>
    );
  };
  return (
    <div className="rv-progress">
      <div className="rv-prog-head">
        <h2>제안서를 검토하고 있어요</h2>
        <p className="muted">파일을 읽고, 이 제안서에 맞는 기준을 고른 뒤 기준마다 점수와 근거를 매겨요. 보통 1~3분 걸려요.</p>
      </div>
      <ol className="rv-steps">
        <Step k="parse" title="파일 읽기">{st === 'parse' && <span className="muted">{r.step || '파일을 여는 중'}</span>}{idx > 0 && r.units && <span className="muted">{r.units.length}{r.unitLabel} · 글자 · 도형 · 글자 크기 · 노트를 읽었어요</span>}</Step>
        <Step k="profile" title="제안서 파악">{p && <span className="muted">{[p.customer && '고객사 ' + p.customer, p.indName && p.indName, p.products.length ? '제품 ' + p.products.slice(0, 4).map((x) => x.model).join(', ') : ''].filter(Boolean).join(' · ') || '고객사 · 업종을 특정하지 못했어요'}</span>}</Step>
        <Step k="ai" title={`평가 기준 ${applied ? applied + '개' : ''} 채점`}>
          {r.sel && <span className="muted">{NCRIT}개 기준 중 이 제안서에 맞는 {applied}개를 골랐어요</span>}
          {idx >= 2 && (
            <ul className="rv-groups">
              {GROUPS.map((g) => {
                const s = r.groups && r.groups[g.id];
                return (
                  <li key={g.id} className={s ? s.state : 'wait'}>
                    <span className="g-ic">{!s ? <span className="g-wait" /> : s.state === 'run' ? <span className="spin" /> : s.state === 'done' ? <Icon name="check" size={12} stroke={3} /> : s.state === 'fail' ? <Icon name="minus" size={12} stroke={3} /> : <Icon name="minus" size={12} />}</span>
                    <span className="g-l">{g.label}</span>
                    <span className="g-s num">{!s ? '대기' : s.state === 'run' ? (s.writing ? `${s.n}/${s.total} 작성 중` : `${s.total}개 읽는 중`) : s.state === 'done' ? `${s.n}/${s.total}${s.images ? ` · 화면 ${s.images}장` : ''}` : s.state === 'fail' ? '규칙으로 채점' : '해당 없음'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Step>
        <Step k="summary" title="리포트 작성" />
      </ol>
      {idx >= 2 && isRunning(r.id) && <button className="btn btn-sm" onClick={() => stopReview(r.id)}>AI 평가 멈추고 지금까지 결과로 마무리</button>}
      {r.poc && r.poc.jobId && <div style={{ marginTop: 16 }}><PocJob r={r} /></div>}
    </div>
  );
}

// ---------------------------------------------------------------- server PoC review (핵심 점검 점수)
// A second, separate review from the server (proposal_score): it routes a subset of the same criteria ids and scores
// them 1 · 2 · 3, then folds them into its own 0~100 (1→0 · 2→50 · 3→100, app category weights). It is shown next to
// the original report — never mixed into the 0~100 criterion scores above.
const PSCORE = { 1: { k: 's1', label: '보완 필요' }, 2: { k: 's2', label: '보통' }, 3: { k: 's3', label: '양호' } };
const ROUTE = { llm: 'AI가 기준 선택', rules: '규칙으로 기준 선택', 'rules-fallback': '규칙으로 기준 선택(AI 실패 대체)', forced: '지정한 기준' };
const SMODE = { llm: 'AI 채점', rules: '규칙 채점', 'rules-fallback': '규칙 채점(AI 대체)' };
function PocJob({ r }) {
  const poc = r.poc || {};
  useAdopt(poc.status === 'running' ? poc.jobId : null, poc.jobId ? { purpose: 'review', owner: { type: 'review', id: r.id }, title: '핵심 점검 (서버)' } : null);
  return poc.jobId ? <AgentJobControl id={poc.jobId} title="핵심 점검 (서버)" compact /> : null;
}
function PocRow({ s, open, onToggle, unitOf, ul, onUnit, auto }) {
  const c = CR[s.id];
  const sc = PSCORE[s.score] || { k: 's0', label: '채점 안 됨' };
  return (
    <div className="pocr-row">
      <button type="button" onClick={onToggle} aria-expanded={open}>
        <span className={'pocr-sc ' + sc.k}><b className="num">{s.score == null ? '—' : s.score}</b>{sc.label}</span>
        <span className="pocr-name">
          <b>{c ? c.name : s.id}</b>
          <span>{c && CAT[c.cat] ? CAT[c.cat].name + ' · ' : ''}{SMODE[s.mode] || s.mode || '채점'}{s.anchor ? ' · ' + s.anchor : ''}</span>
        </span>
        <Icon name={open ? 'chevU' : 'chevD'} size={15} />
      </button>
      {open && (
        <div className="pocr-body">
          {s.anchor && <p>{s.anchor}</p>}
          {s.improve && <div className="rv-fix"><Icon name="wand" size={14} /><div><b>고칠 방법</b><p>{s.improve}</p></div></div>}
          {s.evidence && s.evidence.length > 0 && (
            <ul className="pocr-ev">
              {s.evidence.map((e, i) => { const u = unitOf(e.sheet); return <li key={i}>{u ? <UnitChip n={u} label={ul} onOpen={onUnit} /> : <span className="faint num">{e.sheet || '?'}{ul}</span>}<span>“{e.quote}”</span></li>; })}
            </ul>
          )}
          {auto && auto.length > 0 && <div className="rv-auto"><span className="lbl"><Icon name="search" size={12} />서버 자동 점검 메모</span><ul>{auto.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
          {typeof s.grounded === 'number' && <p className="faint" style={{ fontSize: "var(--text-11-5px)" }}>근거 인용 대조 {Math.round(s.grounded * 100)}%{s.confidence ? ' · 확신 ' + s.confidence : ''}</p>}
          {c && <p className="faint" style={{ fontSize: "var(--text-11-5px)" }}>보는 것 · {c.desc}</p>}
        </div>
      )}
    </div>
  );
}
function PocSection({ r, ul, onUnit }) {
  const [open, setOpen] = useState(() => new Set());
  const [all, setAll] = useState(false);
  const poc = r.poc;
  if (!poc) return null;
  if (poc.status === 'skipped') return <div className="rv-note"><Icon name="info" size={15} />핵심 점검(서버)을 하지 않았어요 — {poc.note || '서버 기능을 쓸 수 없어요.'} 아래는 기존 검토 결과예요.</div>;
  if (poc.status === 'failed' || poc.status === 'cancelled') return <div className="rv-note"><Icon name="info" size={15} />핵심 점검(서버)을 {poc.status === 'cancelled' ? '멈췄어요' : '하지 못했어요'}{poc.error ? ' — ' + poc.error : ''}. 아래 기존 검토 결과는 그대로예요.</div>;
  if (poc.status !== 'done' || !poc.result) {
    return (
      <section className="rv-card" aria-label="핵심 점검 점수">
        <div className="rv-card-h"><h3>핵심 점검 점수</h3><span className="faint">서버에서 따로 채점하는 중이에요 · 끝나면 여기에 나와요</span></div>
        {poc.jobId ? <PocJob r={r} /> : <p className="muted" style={{ margin: 0 }}><span className="spin" /> 서버 점검을 시작하는 중</p>}
      </section>
    );
  }
  const res = poc.result; const ag = res.aggregate || {};
  const m = modeLabel(poc.llm);
  const tot = typeof ag.total === 'number' ? Math.round(ag.total) : null;
  const bk = tot == null ? '' : tot >= 70 ? 'b-good' : tot >= 50 ? 'b-mid' : 'b-bad';
  const map = poc.sheetMap || [];
  const nUnits = (r.units || []).length;
  const unitOf = (sheet) => { const u = map[(Number(sheet) || 0) - 1]; return u && u >= 1 && u <= nUnits ? u : null; };
  const scores = (res.scores || []).slice().sort((a, b) => (a.score == null ? 9 : a.score) - (b.score == null ? 9 : b.score) || ((CR[b.id] && CR[b.id].w) || 0) - ((CR[a.id] && CR[a.id].w) || 0));
  const rows = all ? scores : scores.slice(0, 8);
  const dist = ag.dist || {};
  const unreliable = (res.conversion && res.conversion.unreliable_criteria) || [];
  const toggle = (id) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <section className="rv-card pocr" aria-label="핵심 점검 점수">
      <div className="rv-card-h"><h3>핵심 점검 점수</h3><span className="faint">서버가 고른 기준만 1 · 2 · 3점으로 따로 채점했어요 · 위 종합 점수와 다른 방식이에요</span></div>
      <div className="pocr-head">
        <div className={'pocr-total ' + bk} aria-label={'핵심 점검 ' + (tot == null ? '평가 불가' : tot + '점')}><b className="num">{tot == null ? '—' : tot}</b><span>/ 100</span></div>
        <div className="pocr-sum">
          <h4>{ag.verdict || '평가 불가'}{ag.band ? ' · ' + ag.band : ''}</h4>
          <p>채점 기준 {ag.n_scored || 0}개 · 적용 가능 {ag.n_applicable || 0}개{typeof ag.weight_coverage === 'number' ? ` · 적용 가능 가중치의 ${Math.round(ag.weight_coverage * 100)}%` : ''}. 1점(보완 필요) · 2점(보통) · 3점(양호)을 0 · 50 · 100으로 바꿔 영역 가중치로 묶었어요.</p>
          <div className="pocr-facts">
            {m && <span>처리 방식 · {m.label}</span>}
            {res.route && res.route.mode && <span>{ROUTE[res.route.mode] || res.route.mode}</span>}
            <span className="num">1점 {dist['1'] || 0} · 2점 {dist['2'] || 0} · 3점 {dist['3'] || 0}</span>
            {typeof res.grounded_mean === 'number' && <span>근거 인용 대조 평균 {Math.round(res.grounded_mean * 100)}%</span>}
          </div>
        </div>
      </div>
      {unreliable.length > 0 && <p className="pocr-warn">업로드한 문서에는 화면 측정값이 없어 {unreliable.map((id) => (CR[id] ? CR[id].name : id)).join(' · ')} 기준의 자동 점검은 참고용이에요.</p>}
      {poc.truncated && <p className="pocr-warn">장이 많아 앞쪽 120{ul}만 서버에서 채점했어요.</p>}
      {(res.risk || []).length > 0 && <p className="pocr-warn">자동 점검 위험 신호 · {res.risk.map((id) => (CR[id] ? CR[id].name : id)).join(' · ')}</p>}
      <div className="pocr-list">
        {rows.map((s) => <PocRow key={s.id} s={s} open={open.has(s.id)} onToggle={() => toggle(s.id)} unitOf={unitOf} ul={ul} onUnit={onUnit} auto={(res.auto || {})[s.id]} />)}
        {!rows.length && <div className="rv-empty">채점한 기준이 없어요.</div>}
      </div>
      {scores.length > 8 && <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAll((v) => !v)}>{all ? '접기' : `전체 ${scores.length}개 기준 보기`}</button>}
    </section>
  );
}

// ---------------------------------------------------------------- report
function useDoc(id) {
  const [doc, setDoc] = useState(null);
  useEffect(() => { let on = true; loadDoc(id).then((d) => { if (on) setDoc(d || false); }); return () => { on = false; }; }, [id]);
  return doc;
}
function ScoreRing({ v, size = 132 }) {
  const b = band(v); const r = size / 2 - 9; const c = 2 * Math.PI * r;
  return (
    <div className={'rv-ring b-' + b.k} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="trk" strokeWidth="9" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} className="val" strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="rv-ring-n"><b className="num">{v}</b><span>/ 100</span></span>
    </div>
  );
}
function Badge({ s, small }) {
  const b = band(s);
  return <span className={'rv-badge b-' + b.k + (small ? ' sm' : '')}><b className="num">{s == null ? '—' : s}</b><span>{b.label}</span></span>;
}
function UnitChip({ n, label = '장', onOpen }) { return <button className="rv-uchip num" onClick={(e) => { e.stopPropagation(); onOpen(n); }}>{n}{label}</button>; }

function Report({ r }) {
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const doc = useDoc(r.id);
  const [filter, setFilter] = useState('all');
  const [cat, setCat] = useState(null);
  const [open, setOpen] = useState(() => new Set(r.agg ? r.agg.priorities.slice(0, 1) : []));
  const [unit, setUnit] = useState(null);
  const [showEx, setShowEx] = useState(false);
  const p = r.profile || {}; const agg = r.agg; const res = r.results || {};
  const ul = r.unitLabel || '장';
  const applied = r.sel.filter((s) => s.applied && res[s.id]);
  const excluded = r.sel.filter((s) => !s.applied);
  const rows = applied.filter((s) => (!cat || CR[s.id].cat === cat) && (filter === 'all' || (filter === 'fix' ? res[s.id].score < 70 : res[s.id].score >= 70)));
  const nFix = applied.filter((s) => res[s.id].score < 70).length;
  const aiFailed = Object.values(r.aiErrors || {});
  const failMsg = r.poc?.jobId ? '기존 종합 점수는 자동 점검 규칙으로 계산했어요. 서버의 선별 평가는 핵심 점검 점수에서 따로 확인하세요.' : r.demo ? null : !r.ai ? AI_FAIL[aiFailed[0]] || AI_FAIL.unavailable : aiFailed.length ? (r.aborted ? AI_FAIL.cancelled : AI_FAIL[aiFailed[0]] || '일부 기준은 AI 응답을 받지 못해 자동 점검 규칙으로 채점했어요.') : null;
  // issues per unit (for the strip)
  const perUnit = useMemo(() => {
    const m = {};
    const add = (n, id) => { (m[n] = m[n] || new Set()).add(id); };
    for (const s of applied) { const x = res[s.id]; if (x.score >= 85) continue; for (const e of x.evidence || []) add(e.unit, s.id); if (x.src === 'rule' && x.rule) for (const u of x.rule.units || []) add(u, s.id); }
    for (const g of r.geom || []) add(g.u, 'DS1');
    return m;
  }, [r.id, r.finishedAt]);
  const toggle = (id) => setOpen((o) => { const n = new Set(o); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <div className="rv-report">
      {r.demo && <div className="rv-note"><Icon name="info" size={15} />예시 평가예요 — 가상의 제안서로 만든 결과라 실제 고객 · 수치가 아니에요.{r.strategy ? ' 제안 전략: ' + r.strategy + '.' : ''}</div>}
      {failMsg && <div className="rv-note"><Icon name="info" size={15} />{failMsg}</div>}
      {r.pairWarn && <div className="rv-note"><Icon name="info" size={15} />{r.pairWarn}</div>}
      <section className="rv-hero" aria-label="종합 점수">
        <div className="wm-ci-ring"><ScoreRing v={agg.overall} /><button type="button" className="wm-ci-btn" aria-label="검토 점수 기준 보기" title="검토 점수 기준 보기" aria-haspopup="dialog" onClick={() => setCriteriaOpen(true)}><Icon name="notice" size={16} stroke={2.8} /></button></div>
        <div className="rv-hero-t">
          <span className={'rv-verdict b-' + band(agg.overall).k}>{verdictOf(agg.overall)}</span>
          <h2>{r.summary.verdict}</h2>
          <p>{r.summary.summary}</p>
          {r.summary.strengths && r.summary.strengths.length > 0 && <ul className="rv-strengths">{r.summary.strengths.map((s, i) => <li key={i}><Icon name="check" size={13} stroke={2.6} />{s}</li>)}</ul>}
        </div>
        <dl className="rv-facts">
          <div><dt>평가 기준</dt><dd className="num">{agg.nApplied}<span className="faint"> / {NCRIT}</span></dd></div>
          <div><dt>보완 필요</dt><dd className="num">{nFix}<span className="faint">개</span></dd></div>
          <div><dt>분량</dt><dd className="num">{(r.units || []).length}<span className="faint">{ul}</span></dd></div>
          <div><dt>채점</dt><dd>{r.demo ? '예시' : r.ai ? 'AI + 자동 점검' : '자동 점검'}</dd></div>
        </dl>
      </section>

      <div className="rv-grid">
        <div className="rv-main">
          {r.poc && <PocSection r={r} ul={ul} onUnit={setUnit} />}
          <section className="rv-card" aria-label="영역별 점수">
            <div className="rv-card-h"><h3>영역별 점수</h3><span className="faint">막대를 누르면 그 영역 기준만 봐요</span></div>
            <div className="rv-cats">
              {CATS.map((c) => {
                const v = agg.cats[c.id];
                const n = applied.filter((s) => CR[s.id].cat === c.id).length;
                return (
                  <button key={c.id} className={'rv-cat' + (cat === c.id ? ' on' : '') + (v == null ? ' na' : '')} disabled={v == null} onClick={() => setCat(cat === c.id ? null : c.id)} aria-pressed={cat === c.id}>
                    <span className="rv-cat-l"><Icon name={c.icon} size={14} />{c.name}<span className="faint num">{n}개 · 가중 {c.w}%</span></span>
                    <span className="rv-cat-bar"><i style={{ width: (v || 0) + '%' }} /></span>
                    <span className="rv-cat-v num">{v == null ? '—' : v}</span>
                    <span className={'rv-cat-b b-' + band(v).k}>{band(v).label}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {agg.priorities.length > 0 && (
            <section className="rv-card" aria-label="먼저 고칠 것">
              <div className="rv-card-h"><h3>먼저 고칠 것</h3><span className="faint">점수 · 중요도 · 영역 가중치로 고른 {agg.priorities.length}개</span></div>
              <ol className="rv-prio">
                {agg.priorities.map((id, i) => {
                  const x = res[id]; const c = CR[id];
                  const units = (x.evidence || []).map((e) => e.unit).concat(x.src === 'rule' && x.rule ? x.rule.units || [] : []);
                  return (
                    <li key={id}>
                      <span className="rv-prio-n num">{i + 1}</span>
                      <div className="rv-prio-t">
                        <button className="rv-link" onClick={() => { setCat(null); setFilter('all'); setOpen((o) => new Set(o).add(id)); setTimeout(() => { const el = document.getElementById('crit-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50); }}><b>{c.name}</b></button>
                        <span className="faint">{CAT[c.cat].name}</span>
                        <p>{x.fix || x.reason}</p>
                        {units.length > 0 && <span className="rv-uchips">{Array.from(new Set(units)).slice(0, 8).map((u) => <UnitChip key={u} n={u} label={ul} onOpen={setUnit} />)}</span>}
                      </div>
                      <Badge s={x.score} small />
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          <section className="rv-card" aria-label="기준별 평가">
            <div className="rv-card-h">
              <h3>기준별 평가 {cat && <span className="tag">{CAT[cat].name} <button className="chip-x" onClick={() => setCat(null)} aria-label="영역 필터 해제"><Icon name="x" size={11} stroke={2.6} /></button></span>}</h3>
              <div className="seg seg-sm" role="group" aria-label="보기">
                {[['all', `전체 ${applied.length}`], ['fix', `보완 필요 ${nFix}`], ['ok', `양호 ${applied.length - nFix}`]].map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
              </div>
            </div>
            <div className="rv-crit-list">
              {CATS.filter((c) => rows.some((s) => CR[s.id].cat === c.id)).map((c) => (
                <div key={c.id} className="rv-crit-group">
                  <div className="rv-crit-gh"><Icon name={c.icon} size={14} />{c.name}<span className="faint">{c.desc}</span></div>
                  {rows.filter((s) => CR[s.id].cat === c.id).map((s) => <CritRow key={s.id} s={s} x={res[s.id]} open={open.has(s.id)} onToggle={() => toggle(s.id)} onUnit={setUnit} ul={ul} />)}
                </div>
              ))}
              {!rows.length && <div className="rv-empty">조건에 맞는 기준이 없어요.</div>}
            </div>
            {excluded.length > 0 && (
              <div className="rv-ex">
                <button className="rv-ex-h" onClick={() => setShowEx(!showEx)} aria-expanded={showEx}><Icon name={showEx ? 'chevD' : 'chev'} size={14} />이 제안서에 적용하지 않은 기준 {excluded.length}개</button>
                {showEx && <ul>{excluded.map((s) => <li key={s.id}><span className="num faint">{s.id}</span><b>{CR[s.id].name}</b><span className="muted">{s.why}</span></li>)}</ul>}
              </div>
            )}
          </section>
        </div>

        <aside className="rv-side">
          <section className="rv-card" aria-label="이 제안서를 이렇게 읽었어요">
            <div className="rv-card-h"><h3>이렇게 읽었어요</h3></div>
            <dl className="rv-prof">
              <dt>고객사</dt><dd>{p.customer || <span className="faint">특정 못 함</span>}</dd>
              <dt>업종</dt><dd>{p.indName || <span className="faint">미정</span>}</dd>
              <dt>제품</dt><dd>{p.products && p.products.length ? <span className="tagchips">{p.products.slice(0, 10).map((x) => { const id = prodIdOf(x.model); return id ? <TagChip key={x.model} r={'product:' + id} label={x.model} /> : <span key={x.model} className="tag">{x.model}</span>; })}</span> : <span className="faint">없음</span>}{p.unknownModels && p.unknownModels.length ? <div className="faint" style={{ fontSize: "var(--text-11-5px)", marginTop: "var(--space-4px)" }}>카탈로그 밖 모델 {p.unknownModels.slice(0, 5).join(', ')}</div> : null}</dd>
              <dt>솔루션</dt><dd>{p.solutions && p.solutions.length ? <span className="tagchips">{p.solutions.map((n) => { const id = solIdOf(n); return id ? <TagChip key={n} r={'solution:' + id} /> : <span key={n} className="tag">{n}</span>; })}</span> : <span className="faint">없음</span>}</dd>
              {p.linkedReq && <><dt>요구사항</dt><dd>{(r.settings && r.settings.linkedTitle) || '연결됨'}</dd></>}
            </dl>
            {p.parts && <PartFlow parts={p.parts} ul={ul} onUnit={setUnit} />}
          </section>
          <section className="rv-card" aria-label={ul + '별 보기'}>
            <div className="rv-card-h"><h3>{ul}별 보기</h3><span className="faint">숫자는 짚인 기준 수</span></div>
            <div className="rv-units">
              {(r.units || []).map((u) => {
                const k = perUnit[u.n] ? perUnit[u.n].size : 0;
                const du = doc && doc.units ? doc.units[u.n - 1] : null;
                return (
                  <button key={u.n} className={'rv-unit' + (u.hidden ? ' hid' : '')} onClick={() => setUnit(u.n)} title={u.title}>
                    <span className="rv-unit-pv" style={doc && doc.aspect ? { aspectRatio: String(doc.aspect) } : undefined}>
                      {du && du.thumb ? <img src={du.thumb} alt="" loading="lazy" /> : du && du.boxes && du.boxes.length ? <Wire u={du} aspect={doc.aspect} mini /> : <span className="rv-unit-txt">{u.title || '(제목 없음)'}</span>}
                      {k > 0 && <span className={'rv-unit-k' + (k >= 3 ? ' hi' : '')}>{k}</span>}
                    </span>
                    <span className="rv-unit-l"><span className="num">{u.n}</span>{u.title || <span className="faint">제목 없음</span>}</span>
                  </button>
                );
              })}
            </div>
            {doc === false && <p className="faint" style={{ fontSize: "var(--text-12px)" }}>이 브라우저에 원본 미리보기가 없어 제목만 보여요.</p>}
          </section>
        </aside>
      </div>
      {criteriaOpen && <CriteriaInfo r={r} onClose={() => setCriteriaOpen(false)} />}
      {unit != null && <UnitModal r={r} doc={doc} n={unit} setN={setUnit} onClose={() => setUnit(null)} />}
    </div>
  );
}

function PartFlow({ parts, ul, onUnit }) {
  return (
    <div className="rv-flow" aria-label="장 구성">
      <span className="lbl">장 구성 (자동 분류)</span>
      <div className="rv-flow-bar">
        {parts.map((pt, i) => <button key={i} className={'rv-flow-c ' + (pt ? partHue(pt) : 'h-none')} title={`${i + 1}${ul} · ${pt && PARTS[pt] ? PARTS[pt].label : '분류 안 됨'}`} onClick={() => onUnit(i + 1)} />)}
      </div>
      <div className="rv-flow-leg">{Array.from(new Set(parts.filter(Boolean))).slice(0, 10).map((pt) => <span key={pt}><i className={partHue(pt)} />{PARTS[pt] ? PARTS[pt].label : pt}</span>)}</div>
    </div>
  );
}

function CritRow({ s, x, open, onToggle, onUnit, ul }) {
  const c = CR[s.id];
  const ev = x.evidence || [];
  const ruleUnits = x.rule ? x.rule.units || [] : [];
  return (
    <div className={'rv-crit' + (open ? ' open' : '')} id={'crit-' + s.id}>
      <button className="rv-crit-h" onClick={onToggle} aria-expanded={open}>
        <Badge s={x.score} />
        <span className="rv-crit-t">
          <span className="rv-crit-name"><b>{c.name}</b><span className="rv-w" aria-label={'중요도 ' + c.w}>{[1, 2, 3].map((i) => <i key={i} className={i <= c.w ? 'on' : ''} />)}</span>{x.src === 'rule' && <span className="tag">규칙 채점</span>}</span>
          <span className="rv-crit-r">{x.reason}</span>
        </span>
        <Icon name={open ? 'chevU' : 'chevD'} size={16} />
      </button>
      {open && (
        <div className="rv-crit-b">
          <p className="rv-crit-desc"><span className="faint">보는 것</span>{c.desc}</p>
          {x.fix ? <div className="rv-fix"><Icon name="wand" size={14} /><div><b>고칠 방법</b><p>{x.fix}</p></div></div>
            : x.src === 'rule' && x.score < 85 ? <div className="rv-fix soft"><Icon name="search" size={14} /><div><b>확인할 점</b><p>{c.check}</p></div></div> : null}
          {ev.length > 0 && (
            <ul className="rv-ev">
              {ev.map((e, i) => <li key={i}><UnitChip n={e.unit} label={ul} onOpen={onUnit} /><span>“{e.quote}”</span></li>)}
            </ul>
          )}
          {x.rule && (x.src === 'ai' ? x.rule.notes.length > 0 : ruleUnits.length > 0) && (
            <div className="rv-auto">
              <span className="lbl"><Icon name="search" size={12} />{x.src === 'ai' ? '자동 점검 · AI가 참고한 신호' : '자동 점검이 짚은 ' + ul}</span>
              {x.src === 'ai' && <ul>{x.rule.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
              {ruleUnits.length > 0 && <span className="rv-uchips">{ruleUnits.slice(0, 14).map((u) => <UnitChip key={u} n={u} label={ul} onOpen={onUnit} />)}{ruleUnits.length > 14 && <span className="faint">외 {ruleUnits.length - 14}</span>}</span>}
            </div>
          )}
          <p className="faint" style={{ fontSize: "var(--text-11-5px)", margin: "var(--space-0px)" }}>적용 이유 · {s.why}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- unit detail
function Wire({ u, aspect = 16 / 9, mini = false }) {
  const W = 1000, H = Math.round(W / (aspect || 16 / 9));
  const boxes = (u.boxes || []).filter((b) => !b.guessed).slice(0, 80);
  return (
    <svg className={'rv-wire' + (mini ? ' mini' : '')} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${u.n}장 도형 배치도`}>
      <rect x="0" y="0" width={W} height={H} className="w-bg" />
      {boxes.filter((b) => b.kind !== 'text').map((b, i) => <rect key={'s' + i} x={b.x * W} y={b.y * H} width={Math.max(2, b.w * W)} height={Math.max(2, b.h * H)} rx="4" className={'w-' + b.kind + (b.flag ? ' w-flag' : '')} />)}
      {boxes.filter((b) => b.kind === 'text').map((b, i) => {
        const fs = Math.max(9, Math.min(46, (b.max || 14) * (W / 960) * 1.0));
        return (
          <g key={'t' + i}>
            <rect x={b.x * W} y={b.y * H} width={Math.max(2, b.w * W)} height={Math.max(2, b.h * H)} rx="3" className={'w-text' + (b.flag ? ' w-flag w-' + b.flag : '')} />
            {!mini && <text x={b.x * W + 6} y={b.y * H + fs + 2} fontSize={fs} className="w-tx">{String(b.text).split('\n')[0].slice(0, Math.max(4, Math.floor((b.w * W) / (fs * 0.95))))}</text>}
          </g>
        );
      })}
    </svg>
  );
}
function UnitModal({ r, doc, n, setN, onClose }) {
  const ul = r.unitLabel || '장';
  const total = (r.units || []).length;
  const u = (r.units || [])[n - 1];
  const du = doc && doc.units ? doc.units[n - 1] : null;
  const res = r.results || {};
  const items = [];
  for (const s of r.sel) {
    if (!s.applied || !res[s.id]) continue; const x = res[s.id];
    const ev = (x.evidence || []).filter((e) => e.unit === n);
    const ru = x.rule && (x.rule.units || []).includes(n);
    if (ev.length || (ru && x.score < 90)) items.push({ id: s.id, x, ev, ru });
  }
  const geo = (r.geom || []).filter((g) => g.u === n);
  const [big, setBig] = useState(null);
  useEffect(() => {
    const im = doc && doc.images ? doc.images.find((i) => i.n === n) : null;
    if (!im || !im.blob) { setBig(null); return; }
    const url = URL.createObjectURL(im.blob); setBig(url);
    return () => URL.revokeObjectURL(url);
  }, [doc, n]);
  if (!u) return null;
  const aspect = doc && doc.aspect ? doc.aspect : 16 / 9;
  return (
    <SheetView onClose={onClose} index={n - 1} total={total} onNav={(i) => setN(i + 1)} aspect={aspect}
      title={`${n}${ul} · ${u.title || '제목 없음'}`} sub={`${u.part && PARTS[u.part] ? PARTS[u.part].label + ' · ' : ''}${u.words}어절${u.pics ? ' · 그림 ' + u.pics : ''}${u.minFont ? ' · 최소 글자 ' + (r.kind === 'pptx' && doc && doc.slideWpt ? (u.minFont * 960 / doc.slideWpt).toFixed(1) : u.minFont) + 'pt' : ''}${u.hidden ? ' · 숨김 장' : ''}`}
      bodyClass="rv-um" stageClass="rv-um-pv" panelClass="rv-um-list"
      stage={(w) => big || (du && du.thumb) ? <img src={big || du.thumb} alt={`${n}${ul} 화면`} style={{ width: w, height: Math.round(w / aspect) }} />
        : du && du.boxes && du.boxes.length ? <div className="rv-um-wire" style={{ width: w }}><Wire u={du} aspect={doc.aspect} /><span className="faint" style={{ fontSize: "var(--text-11-5px)" }}>도형 배치도 · 빨간 테두리는 겹침 · 넘침 · 장표 밖 신호</span></div>
        : <div className="rv-um-text" style={{ width: w }}>{du ? du.text.slice(0, 1400) : '미리보기가 없어요'}</div>}
      panel={<>
        {geo.length > 0 && <div className="rv-auto"><span className="lbl"><Icon name="search" size={12} />레이아웃 자동 점검</span><ul>{geo.map((g, i) => <li key={i}>{g.note}</li>)}</ul></div>}
        {items.length ? items.sort((a, b) => a.x.score - b.x.score).map(({ id, x, ev }) => (
          <div key={id} className="rv-um-it">
            <div className="rv-um-ith"><Badge s={x.score} small /><b>{CR[id].name}</b></div>
            {ev.map((e, i) => <p key={i} className="rv-um-q">“{e.quote}”</p>)}
            {!ev.length && <p className="muted" style={{ margin: "var(--space-0px)", fontSize: "var(--text-12-5px)" }}>자동 점검에서 이 {ul}을 짚었어요</p>}
            {x.fix && <p className="rv-um-fix"><Icon name="wand" size={12} />{x.fix}</p>}
          </div>
        )) : !geo.length && <div className="rv-empty">이 {ul}에서 짚인 문제가 없어요.</div>}
      </>}
      actions={<button className="btn" onClick={onClose}>닫기</button>} />
  );
}

// ---------------------------------------------------------------- re-run
function RerunModal({ r, go, onClose }) {
  const proposals = useStore((s) => s.proposals);
  const s0 = r.settings || {};
  const [customer, setCustomer] = useState(s0.customer || (r.profile && r.profile.customer) || '');
  const [ind, setInd] = useState(s0.ind || (r.profile && r.profile.ind) || '');
  const [link, setLink] = useState(s0.linkedId || '');
  const [note, setNote] = useState(s0.note || '');
  const [ov, setOv] = useState(() => Object.fromEntries(r.sel.map((s) => [s.id, s.applied || (s.aiNa ? false : false)])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const nOn = Object.values(ov).filter(Boolean).length;
  const run = async () => {
    setBusy(true); setErr(null);
    const pr = proposals.find((x) => x.id === link);
    const reqList = pr ? [...(pr.req.form.keymen || []).flatMap((k) => (k.reqs || []).map((x) => (Array.isArray(x) ? x.map((z) => z.t || '').join('') : String(x)))).filter((t) => t.trim())] : [];
    const auto = Object.fromEntries(r.sel.map((s) => [s.id, s.applied]));
    const override = {}; for (const k of Object.keys(ov)) if (ov[k] !== auto[k]) override[k] = ov[k];
    if (pr && !auto.CU2 && override.CU2 == null) override.CU2 = true;
    const settings = { customer: customer.trim(), ind: ind || null, note: note.trim(), linkedId: pr ? pr.id : '', linkedTitle: pr ? pr.title : '', reqText: pr ? reqText(pr) : '', reqList, override };
    const out = await rerunReview(r.id, settings);
    setBusy(false);
    if (!out || out.err) { setErr(out ? out.err : '다시 평가하지 못했어요'); return; }
    onClose(); go({ name: 'review', id: out.id });
  };
  return (
    <Modal size="wide" onClose={onClose} title="기준 조정 · 다시 평가" sub="고객 정보와 요구사항을 알려 주거나 기준을 직접 넣고 빼면, 같은 파일로 새로 평가해요. 이전 평가는 내역에 남아요."
      footer={<>{err && <span className="note" style={{ color: 'var(--danger)' }}>{err}</span>}<span className="note num">기준 {nOn}개</span><span className="sp" /><button className="btn" onClick={onClose}>취소</button><button className="btn btn-primary" disabled={busy || !nOn} onClick={run}>{busy ? <span className="spin" /> : <Icon name="refresh" size={15} />}다시 평가</button></>}>
      <div className="rv-rerun">
        <div className="rv-rerun-f">
          <div className="field"><label htmlFor="rr-c">고객사</label><input id="rr-c" className="input" value={customer} placeholder="예) A 커피 프랜차이즈" onChange={(e) => setCustomer(e.target.value)} /></div>
          <div className="field"><label htmlFor="rr-i">업종</label><select id="rr-i" className="select" value={ind} onChange={(e) => setInd(e.target.value)}><option value="">자동</option>{INDUSTRIES.map((i) => <option key={i.code} value={i.code}>{i.name}</option>)}</select></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="rr-l">고객 요구사항과 비교 <span className="faint" style={{ fontWeight: "var(--weight-500)" }}>· Winmate에서 작성 중인 제안서의 요구사항</span></label>
            <select id="rr-l" className="select" value={link} onChange={(e) => setLink(e.target.value)}><option value="">비교하지 않음</option>{proposals.map((x) => <option key={x.id} value={x.id}>{x.title}{x.customer ? ' · ' + x.customer : ''}</option>)}</select>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="rr-n">평가할 때 참고할 점 <span className="faint" style={{ fontWeight: "var(--weight-500)" }}>· 선택</span></label><textarea id="rr-n" className="textarea" style={{ minHeight: 64 }} value={note} placeholder="예) 경영진 보고용 요약본이라 분량이 짧아요. 가격 장은 일부러 뺐어요." onChange={(e) => setNote(e.target.value)} /></div>
        </div>
        <div className="rv-rerun-c">
          <div className="rv-rerun-ch"><b>평가 기준</b><span className="faint">처음 평가에서 자동으로 고른 기준이 켜져 있어요</span><span style={{ flex: 1 }} /><button className="btn btn-ghost btn-sm" onClick={() => setOv(Object.fromEntries(CRITERIA.map((c) => [c.id, true])))}>모두 켜기</button><button className="btn btn-ghost btn-sm" onClick={() => setOv(Object.fromEntries(r.sel.map((s) => [s.id, s.applied])))}>자동 선택으로</button></div>
          {CATS.map((c) => (
            <fieldset key={c.id} className="rv-rerun-g">
              <legend><Icon name={c.icon} size={13} />{c.name}</legend>
              {CRITERIA.filter((k) => k.cat === c.id).map((k) => {
                const s = r.sel.find((z) => z.id === k.id);
                return (
                  <label key={k.id} className="rv-ck" title={k.desc}>
                    <input type="checkbox" checked={!!ov[k.id]} onChange={(e) => setOv({ ...ov, [k.id]: e.target.checked })} />
                    <span>{k.name}{s && !s.applied && <span className="faint"> · 자동 제외</span>}</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- export
async function exportMd(r) {
  const ul = r.unitLabel || '장'; const res = r.results || {}; const agg = r.agg;
  const L = [];
  L.push(`# 제안서 검토 리포트 — ${r.title}`, '');
  L.push(`- 평가일: ${new Date(r.createdAt).toLocaleString('ko-KR')}`, `- 파일: ${(r.files || []).map((f) => f.name).join(', ')}`, `- 종합: **${agg.overall}점 · ${verdictOf(agg.overall)}** (기준 ${agg.nApplied}/${NCRIT}개, ${r.ai ? 'AI + 자동 점검' : '자동 점검'})`, '');
  L.push(`> ${r.summary.verdict}`, '', r.summary.summary, '');
  L.push('## 영역별 점수', '', '| 영역 | 점수 | 판정 |', '|---|---:|---|');
  for (const c of CATS) if (agg.cats[c.id] != null) L.push(`| ${c.name} | ${agg.cats[c.id]} | ${band(agg.cats[c.id]).label} |`);
  L.push('', '## 먼저 고칠 것', '');
  agg.priorities.forEach((id, i) => L.push(`${i + 1}. **${CR[id].name}** (${res[id].score}점) — ${res[id].fix || res[id].reason}`));
  L.push('', '## 기준별 평가', '');
  for (const c of CATS) {
    const list = r.sel.filter((s) => s.applied && res[s.id] && CR[s.id].cat === c.id); if (!list.length) continue;
    L.push(`### ${c.name}`, '');
    for (const s of list) {
      const x = res[s.id];
      L.push(`**${CR[s.id].name} — ${x.score}점 (${band(x.score).label})**${x.src === 'rule' ? ' · 규칙 채점' : ''}`, '', x.reason, '');
      if (x.evidence && x.evidence.length) L.push(x.evidence.map((e) => `- ${e.unit}${ul}: “${e.quote}”`).join('\n'), '');
      if (x.fix) L.push(`고칠 방법: ${x.fix}`, '');
    }
  }
  const ex = r.sel.filter((s) => !s.applied);
  if (ex.length) { L.push('## 적용하지 않은 기준', ''); for (const s of ex) L.push(`- ${CR[s.id].name} — ${s.why}`); }
  if (r.poc && r.poc.status === 'done' && r.poc.result) {
    const pr = r.poc.result; const ag = pr.aggregate || {}; const m = modeLabel(r.poc.llm);
    L.push('', '## 핵심 점검 점수 (서버 · 1~3점 루브릭, 위 종합 점수와 별도)', '', `- ${ag.total == null ? '평가 불가' : Math.round(ag.total) + '점'} · ${ag.verdict || ''} · 채점 기준 ${ag.n_scored || 0}개${m ? ' · ' + m.label : ''}`, '');
    for (const s of pr.scores || []) L.push(`- **${CR[s.id] ? CR[s.id].name : s.id}** — ${s.score == null ? '채점 안 됨' : s.score + '점 (' + PSCORE[s.score].label + ')'} · ${SMODE[s.mode] || s.mode}${s.anchor ? ': ' + s.anchor : ''}${s.improve ? ' / 고칠 방법: ' + s.improve : ''}`);
  }
  const blob = new Blob([L.join('\n')], { type: 'text/markdown' });
  const filename = safeName('제안서 검토 - ' + r.title) + '.md';
  const dl = await getDownloads();
  if (dl) {
    try { await dl.save({ filename, data: blob }); toast(filename + ' 저장했어요'); } catch (e) { toast(DL_ERR[(e && e.code) || ''] || '이 화면에서는 파일을 저장할 수 없어요.', 'warn'); }
    return;
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
