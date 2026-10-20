import {FeedbackPopup} from '../components/feedback-popup.jsx';
import { requireLogin } from '../api/session.js';
import '../styles/review-report.css';
import { CriteriaInfo } from '../components/CriteriaInfo.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DeleteButton,Icon, Modal, toast, fmtWhen } from '../components/common.jsx';
import { useStore } from '../repositories/proposals.js';
import { reqText } from '../services/search.js';
import { INDUSTRIES, IND } from '../services/catalog.js';
import { PARTS } from '../domain/proposals/parts.js';
import { ACCEPT, fileKind, KIND_LABEL } from '../domain/review/parse.js';
import { CATS, CAT, CR, CRITERIA, band, verdictOf, criteriaForReview, normalizeReviewOverrides, REVIEW_CRITERIA_VERSION } from '../domain/review/criteria.js';
import { useReviews, startReview, rerunReview, retryReview, deleteReview, stopReview, isRunning, loadDoc, attachReviewPreview, connectReviewProposal } from '../repositories/reviews.js';
import { getDownloads, DL_ERR, safeName } from '../components/viewer.jsx';
import { partHue } from '../components/common.jsx';
import { TagChip } from '../components/tagcard.jsx';
import { ReviewHover, CriterionDetail, ReviewRadar, ReviewSlides, ReviewPreview, ReviewSlideScores, CheckpointScores, useReviewAssets, useReviewDeck } from '../components/review-report.jsx';
import { PRODUCTS, SOLUTIONS } from '../services/catalog.js';
import { AgentJobControl, useAdopt } from '../components/AgentJobControl.jsx';
import { modeLabel } from '../services/poc-client.js';
// review profile keeps model / solution names — map them back to the catalog for thumbnails
const prodIdOf = (model) => { const k = String(model || '').replace(/[- ]/g, '').toUpperCase(); const x = PRODUCTS.find((q) => q.model.replace(/[- ]/g, '').toUpperCase() === k); return x ? x.id : null; };
const solIdOf = (name) => { const x = SOLUTIONS.find((q) => q.name === name); return x ? x.id : null; };

const NCRIT = CRITERIA.length;
const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
// how the criterion scores of a review were made (older records in this browser keep their own label)
const scoringLabel = (r) => (r.scoring === 'server' ? '서버 AI' : r.demo ? '예시' : r.ai ? 'AI + 자동 점검 (이전 방식)' : '자동 점검 (이전 방식)');

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
  const onFiles = (files) => { if (!requireLogin()) return; const ok = checkFiles(files); if (!ok) return; const id = startReview(ok); go({ name: 'review', id }); };
  const { over, bind } = useFileDrop(onFiles);
  return (
    <div className={'rv-entry' + (over ? ' over' : '')} {...bind}>
      <button className="rv-entry-hit" onClick={() => { if (requireLogin()) inp.current.click(); }} aria-label="제안서 검토 — 파일을 골라 평가 시작">
        <span className="rv-entry-ic"><Icon name="clipCheck" size={22} /></span>
        <span className="rv-entry-t">
          <b>제안서 검토</b>
          <span>{over ? '여기에 놓으면 바로 평가를 시작해요' : `완성한 제안서를 끌어다 놓거나 눌러서 올리면, ${NCRIT}개 검토 기준 중 이 제안서에 맞는 기준으로 점수와 근거를 매겨요`}</span>
          <span className="rv-entry-fmt">PPTX · PDF · DOCX · PPTX와 같은 내용의 PDF를 함께 올리면 실제 화면 최대 4장을 함께 봐요</span>
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
// The same original page images / PPTX layouts used by the review detail screen.
function RvThumbs({ r }) {
  const doc = useDoc(r.id, r.previewAt || r.finishedAt || r.status);
  const deck = useReviewDeck(r, doc);
  const assets = useReviewAssets(deck.proposal ? null : doc);
  const units = (deck.proposal ? deck.units : doc?.units || r.units || []).slice(0, 3);
  return (
    <span className="rvh-thumbs" aria-hidden="true">
      {[0, 1, 2].map((i) => {
        const u = units[i];
        return (
          <span key={i} className={'rvh-th' + (u ? '' : ' empty')}>
            {u && (u.layout || u.previewHtml || u.thumb || assets.pages[u.n] || doc?.slides === false)
              ? <ReviewPreview doc={doc} unit={u} assets={assets} title={`${u.n}${r.unitLabel || '장'} 원본 장표`} />
              : u ? <span className="rvh-th-missing" title="평가 상세의 원본 연결에서 같은 PPTX 또는 PDF를 선택해 주세요"><Icon name="file" size={16} /><span>{doc === null ? '화면 불러오는 중' : '원본 연결 필요'}</span></span> : null}
          </span>
        );
      })}
    </span>
  );
}
export function ReviewHistory({ go }) {
  const list = useReviews((s) => s.reviews);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const inp = useRef(null);
  const onFiles = (files) => { if (!requireLogin()) return; const ok = checkFiles(files); if (!ok) return; const id = startReview(ok); go({ name: 'review', id }); };
  const { over, bind } = useFileDrop(onFiles);
  const done = list.filter((r) => r.status === 'done' && r.agg);
  const avg = done.length ? Math.round(done.reduce((a, r) => a + r.agg.overall, 0) / done.length) : null;
  return (
    <div className={'tl rvh' + (over ? ' over' : '')} {...bind}>
      <div className="tl-in rvh-in">
        <header className="tl-head">
          <div className="tl-title">
            <span className="eyebrow">WINMATE · 제안서 검토</span>
            <div className="rvh-title-row"><h1>제안서 검토</h1><button type="button" className="rvh-criteria-button" aria-label="검토 평가 기준 전체 보기" title="검토 평가 기준 전체 보기" aria-haspopup="dialog" onClick={() => setCriteriaOpen(true)}><Icon name="clipCheck" size={19} stroke={1.8} /></button></div>
            <p>완성한 제안서를 올리면 {NCRIT}개 검토 기준 중 이 제안서에 맞는 기준으로 점수와 근거를 정리해 드려요.</p>
          </div>
        </header>

        <div className={'rvh-cta' + (over ? ' over' : '')}>
          <button className="rvh-go" onClick={() => { if (requireLogin()) inp.current.click(); }}><Icon name="upload" size={20} stroke={2.2} />{over ? '여기에 놓으면 바로 검토를 시작해요' : '제안서 검토하기'}</button>
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
                const { CATS } = criteriaForReview(r);
                const p = r.profile || {};
                const status = r.status === 'done' ? (r.summary && r.summary.verdict) || verdictOf(r.agg.overall)
                  : r.status === 'running' ? '평가 중…' : r.status === 'interrupted' ? '중간에 멈췄어요 · 이어서 평가할 수 있어요' : '평가하지 못했어요';
                return (
                  <li key={r.id} className="rvh-item">
                    <button className="rvh-card" onClick={() => go({ name: 'review', id: r.id })} aria-label={r.title + ' 평가 열기'}>
                      <MiniScore r={r} />
                      <span className="rvh-main">
                        <span className="rvh-t"><b>{r.title}</b>{criteriaForReview(r).version < REVIEW_CRITERIA_VERSION && <span className="rvh-demo">이전 기준</span>}{r.demo && <span className="rvh-demo">예시</span>}</span>
                        <span className="rvh-tags">
                          {p.indName && <span className="tag"><Icon name="building" size={11} />{p.indName}</span>}
                          {r.strategy && <span className="tag rvh-strat"><Icon name="target" size={11} />{r.strategy}</span>}
                          {p.customer && <span className="rvh-cust">{p.customer}</span>}
                        </span>
                        <span className="rvh-verdict">{status}</span>
                      </span>
                      <RvThumbs r={r} />
                      {r.agg && (
                        <span className="rvh-cats" aria-label="영역별 점수" style={{ '--rvh-category-count': CATS.length }}>
                          {CATS.map((c) => { const v = r.agg.cats[c.id]; const b = band(v); return (
                            <span key={c.id} className={'rvh-cat b-' + b.k} title={c.name + ' ' + (v == null ? '제외' : v + '점')}>
                              <span className="rvh-cat-l">{c.short}</span><span className="rvh-cat-bar"><i style={{ height: (v || 0) + '%' }} /></span><span className="rvh-cat-v num">{v == null ? '—' : v}</span>
                            </span>
                          ); })}
                        </span>
                      )}
                      <span className="rvh-meta num">{fmtWhen(r.createdAt)}</span>
                    </button>
                    <DeleteButton className="btn btn-ghost btn-sm btn-icon rvh-del" aria-label={r.title+' 평가 지우기'} confirmation={{title:'평가 기록을 삭제할까요?',message:r.title+' 평가와 결과를 삭제합니다.'}} onClick={()=>deleteReview(r.id)} disabled={r.status==='running'&&isRunning(r.id)}><Icon name="trash" size={14}/></DeleteButton>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
      {criteriaOpen && <CriteriaInfo onClose={() => setCriteriaOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- screen
export function ReviewScreen({ id, go }) {
  const r = useReviews((s) => s.reviews.find((x) => x.id === id) || null);
  const [modal, setModal] = useState(null);
  const inp = useRef(null);
  const onFiles = (files) => { if (!requireLogin()) return; const ok = checkFiles(files); if (!ok) return; const nid = startReview(ok); go({ name: 'review', id: nid }); };
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
          <button className="btn btn-primary btn-sm" onClick={() => { if (requireLogin()) inp.current.click(); }}><Icon name="upload" size={14} />다른 파일 검토</button>
          <input ref={inp} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </header>
      <div className="rv-body">
        {r.status === 'running' ? <Progress r={r} />
          : r.status === 'error' ? (
            <FeedbackPopup title={r.cancelled?'평가를 멈췄어요':'평가하지 못했어요'} message={r.error || '다시 시도해 주세요.'} actionLabel={r.noDoc?'다른 파일 올리기':'다시 시도'} onAction={()=>r.noDoc?(requireLogin()&&inp.current.click()):retryReview(r.id)}/>
          )
            : r.status === 'interrupted' ? <FeedbackPopup kind="warn" message="평가가 중간에 멈췄어요. 읽어 둔 내용으로 이어서 평가할 수 있어요." actionLabel="이어서 평가" onAction={()=>retryReview(r.id)}/>
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
  return <FeedbackPopup message={r.step || "제안서를 검토하고 있어요"} kind="progress" content={
    <div className="rv-progress">
      <div className="rv-prog-head">
        <h2>제안서를 검토하고 있어요</h2>
        <p className="muted">파일을 읽고, 이 제안서에 맞는 기준을 고른 뒤 기준마다 점수와 근거를 매겨요. 보통 1~3분 걸려요.</p>
      </div>
      <ol className="rv-steps">
        <Step k="parse" title="파일 읽기">{st === 'parse' && <span className="muted">{r.step || '파일을 여는 중'}</span>}{idx > 0 && r.units && <span className="muted">{r.units.length}{r.unitLabel} · 글자 · 도형 · 글자 크기 · 노트를 읽었어요</span>}</Step>
        <Step k="profile" title="제안서 파악">{p && <span className="muted">{[p.customer && '고객사 ' + p.customer, p.indName && p.indName, p.products.length ? '제품 ' + p.products.slice(0, 4).map((x) => x.model).join(', ') : ''].filter(Boolean).join(' · ') || '고객사 · 업종을 특정하지 못했어요'}</span>}</Step>
        <Step k="ai" title="서버 AI 채점">
          {r.sel && <span className="muted">{NCRIT}개 기준 중 이 제안서에 맞는 {applied}개를 자동으로 골랐어요 · 서버 AI가 체크포인트의 근거 수준을 0~4단계로 검토해요</span>}
          {idx >= 2 && r.step && <span className="muted">{r.step}</span>}
        </Step>
        <Step k="summary" title="리포트 작성" />
      </ol>
      {idx >= 2 && r.poc && r.poc.jobId ? <div style={{ marginTop: 16 }}><PocJob r={r} /></div>
        : idx >= 2 && <p className="muted" style={{ margin: 0 }}><span className="spin" /> 서버 평가를 시작하는 중</p>}
      {isRunning(r.id) && <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => stopReview(r.id)}><Icon name="x" size={13} />평가 멈추기</button>}
    </div>
  }/>;
}

// ---------------------------------------------------------------- server review details
// The server (proposal_score, AI) routes a subset of the criteria ids and scores them 1 · 2 · 3. The report above
// shows those criteria on the 0~100 scale (1→0 · 2→50 · 3→100); this card keeps the server's own view — its aggregate,
// how it routed, the 1 · 2 · 3 distribution and its per-criterion notes.
const PSCORE = { 1: { k: 's1', label: '보완 필요' }, 2: { k: 's2', label: '보통' }, 3: { k: 's3', label: '양호' } };
const ROUTE = { llm: 'AI가 기준 선택', rules: '규칙으로 기준 선택', 'rules-fallback': '규칙으로 기준 선택(AI 실패)', forced: '지정한 기준' };
const SMODE = { llm: 'AI 채점', rules: '규칙 채점', 'rules-fallback': '규칙 채점(AI 실패)' };
function PocJob({ r }) {
  const poc = r.poc || {};
  useAdopt(poc.status === 'running' ? poc.jobId : null, poc.jobId ? { purpose: 'review', owner: { type: 'review', id: r.id }, title: '제안서 검토 (서버 AI)' } : null);
  return poc.jobId ? <AgentJobControl id={poc.jobId} title="제안서 검토 (서버 AI)" compact onRetry={r.noDoc ? undefined : () => retryReview(r.id)} /> : null;
}
function PocRow({ s, open, onToggle, unitOf, ul, onUnit, auto, rubric }) {
  const { CR, CAT } = rubric;
  const c = CR[s.id];
  const sc = rubric.scoring ? { k: 'b-' + band(s.score).k, label: s.score == null ? '미평가' : '/ 100' } : PSCORE[s.score] || { k: 's0', label: '채점 안 됨' };
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
          {s.checkpoints?.length > 0 && <CheckpointScores points={s.checkpoints} />}
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
  const rubric = criteriaForReview(r);
  const { CR, CAT } = rubric;
  const [open, setOpen] = useState(() => new Set());
  const [all, setAll] = useState(false);
  const poc = r.poc;
  if (!poc) return null;
  // older records in this browser: their server review ran next to the previous scoring and may have failed or been skipped
  if (poc.status === 'skipped') return <FeedbackPopup kind="info" message={poc.note || "서버 AI 평가를 하지 않은 이전 기록이에요. 다시 평가하면 서버 AI로 채점해요."}/>;
  if (poc.status === 'failed' || poc.status === 'cancelled') return <FeedbackPopup kind="warn" message={poc.error || "이전 서버 AI 평가가 완료되지 않았어요. 다시 평가할 수 있어요."}/>;
  if (poc.status !== 'done' || !poc.result) return poc.jobId?<PocJob r={r}/>:<FeedbackPopup message="서버 평가를 시작하는 중…" kind="progress"/>;
  const main = r.scoring === 'server';
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
    <section className="rv-card pocr" aria-label={main ? '서버 AI 채점 상세' : '핵심 점검 점수'}>
      <div className="rv-card-h"><h3>{main ? '서버 AI 채점 상세' : '핵심 점검 점수'}</h3><span className="faint">{rubric.scoring?.level_points ? '제안서 관점의 0·40·65·85·100점 환산표로 계산한 체크포인트 평균과 서버 집계예요.' : rubric.scoring ? '체크포인트 4개의 0~4단계 평가를 합계/16×100으로 계산한 점수와 서버 집계예요.' : main ? '서버 AI가 고른 기준의 1 · 2 · 3점 원래 점수와 서버 집계예요 · 위 점수는 1점→0 · 2점→50 · 3점→100으로 바꾼 값이에요' : '서버가 고른 기준만 1 · 2 · 3점으로 따로 채점했어요 · 위 종합 점수와 다른 방식이에요'}</span></div>
      <div className="pocr-head">
        <div className={'pocr-total ' + bk} aria-label={'서버 집계 ' + (tot == null ? '평가 불가' : tot + '점')}><b className="num">{tot == null ? '—' : tot}</b><span>/ 100</span></div>
        <div className="pocr-sum">
          <h4>{ag.verdict || '평가 불가'}{ag.band ? ' · ' + ag.band : ''}</h4>
          <p>채점 기준 {ag.n_scored || 0}개 · 적용 가능 {ag.n_applicable || 0}개{typeof ag.weight_coverage === 'number' ? ` · 적용 가능 가중치의 ${Math.round(ag.weight_coverage * 100)}%` : ''}. {rubric.scoring?.level_points ? '단계별 환산점수를 평균하고 영역별 동일 비중으로 묶었어요.' : rubric.scoring ? '체크포인트 합계/16×100으로 계산하고 영역별 동일 비중으로 묶었어요.' : '1점(보완 필요) · 2점(보통) · 3점(양호)을 0 · 50 · 100으로 바꿔 영역 가중치로 묶었어요.'}</p>
          <div className="pocr-facts">
            {m && <span>처리 방식 · {m.label}</span>}
            {res.route && res.route.mode && <span>{ROUTE[res.route.mode] || res.route.mode}</span>}
            <span className="num">{rubric.scoring ? [0,1,2,3,4].map(level => `${level}단계 ${dist[level] || 0}개`).join(' · ') : `1점 ${dist['1'] || 0} · 2점 ${dist['2'] || 0} · 3점 ${dist['3'] || 0}`}</span>
            {typeof res.grounded_mean === 'number' && <span>근거 인용 대조 평균 {Math.round(res.grounded_mean * 100)}%</span>}
          </div>
        </div>
      </div>
      {unreliable.length > 0 && <p className="pocr-warn">업로드한 문서에는 화면 측정값이 없어 {unreliable.map((id) => (CR[id] ? CR[id].name : id)).join(' · ')} 기준의 자동 점검은 참고용이에요.</p>}
      {poc.truncated && <p className="pocr-warn">장이 많아 앞쪽 120{ul}만 서버에서 채점했어요.</p>}
      {(res.risk || []).length > 0 && <p className="pocr-warn">자동 점검 위험 신호 · {res.risk.map((id) => (CR[id] ? CR[id].name : id)).join(' · ')}</p>}
      <div className="pocr-list">
        {rows.map((s) => <PocRow rubric={rubric} key={s.id} s={s} open={open.has(s.id)} onToggle={() => toggle(s.id)} unitOf={unitOf} ul={ul} onUnit={onUnit} auto={(res.auto || {})[s.id]} />)}
        {!rows.length && <div className="rv-empty">채점한 기준이 없어요.</div>}
      </div>
      {scores.length > 8 && <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setAll((v) => !v)}>{all ? '접기' : `전체 ${scores.length}개 기준 보기`}</button>}
    </section>
  );
}

// ---------------------------------------------------------------- report
function useDoc(id, version) {
  const [doc, setDoc] = useState(null);
  useEffect(() => { let on = true; loadDoc(id).then((d) => { if (on) setDoc(d || false); }); return () => { on = false; }; }, [id, version]);
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
  const { CR, CAT, CATS, CRITERIA, version } = criteriaForReview(r);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [unit, setUnit] = useState(null);
  const [attaching, setAttaching] = useState(false);
  const doc = useDoc(r.id, r.previewAt);
  const deck = useReviewDeck(r, doc);
  const assets = useReviewAssets(deck.proposal ? null : doc);
  const p = r.profile || {}, agg = r.agg, res = r.results || {}, ul = deck.proposal ? '장' : r.unitLabel || '장';
  const applied = r.sel.filter(s => s.applied && res[s.id]);
  const nFix = applied.filter(s => res[s.id].score != null && res[s.id].score < 70).length;
  const failMsg = r.scoring === 'server' && version >= 5 ? `${agg.nApplied}개 기준을 영업 제안서의 결정 범위에서 검토했어요. 단계별 0·40·65·85·100점의 평균이며, 제안에 충분한 수준은 85점입니다.` : r.scoring === 'server' && version >= 4 ? `${agg.nApplied}개 기준을 각각 4개 체크포인트의 0~4단계로 검토했어요. 단계 합계/16×100이 항목 점수이며 근거의 충실도와 교차 검증을 구분해요.` : r.scoring === 'server' ? `${r.poc?.result?.route?.mode === 'forced' ? '선택한' : '서버 AI가 고른'} 기준 ${agg.nApplied}개를 평가했어요 · 기준 점수는 서버의 1 · 2 · 3점을 0 · 50 · 100점으로 환산했어요.`
    : r.demo ? null : '이전 방식으로 만든 평가예요 · 기준 조정 · 다시 평가를 누르면 서버 AI로 다시 채점해요.';
  const perUnit = useMemo(() => {
    const m = {}, add = (n, id) => { if (n) (m[n] ||= new Set()).add(id); };
    for (const s of applied) { const x = res[s.id]; if (x.score == null || x.score >= 85) continue; for (const e of x.evidence || []) add(e.unit, s.id); if (x.src === 'rule' && x.rule) for (const n of x.rule.units || []) add(n, s.id); }
    for (const g of r.geom || []) add(g.u, version === 1 ? 'DS1' : version === 2 ? 'DQ1' : 'DQ5');
    return m;
  }, [r]);
  const openUnit = n => {
    if (deck.units.some(u => u.n === n)) { document.dispatchEvent(new CustomEvent('winmate-review-hover-open', { detail: 'slide-dialog' })); setUnit(n); }
    else toast('연결된 제안서에 해당 장표가 없어요.', 'warn');
  };
  const link = id => {
    try { connectReviewProposal(r.id, id); setUnit(null); }
    catch (e) { toast(e.message, 'warn'); }
  };
  useEffect(() => {
    if (unit != null && !deck.units.some(u => u.n === unit)) setUnit(null);
  }, [deck.units, unit]);
  const attach = async files => {
    if (files.some(f => f.size > 150 * 1048576)) { toast('150MB 이하의 원본 파일을 선택해 주세요', 'warn'); return; }
    setAttaching(true);
    try { await attachReviewPreview(r.id, files); toast('원본 화면을 연결했어요 · 기존 평가 결과는 유지됩니다'); }
    catch (e) { toast(e.message, 'warn'); }
    finally { setAttaching(false); }
  };
  const profile = <div className="rv-reading-content">
    <div><span className="rv-eyebrow">DOCUMENT CONTEXT</span><h4>이 제안서를 이렇게 읽었어요</h4></div>
    <dl className="rv-prof">
      <dt>고객사</dt><dd>{p.customer || '특정 못 함'}</dd><dt>업종</dt><dd>{p.indName || '미정'}</dd>
      <dt>제품</dt><dd>{p.products?.length ? <span className="tagchips">{p.products.map(x => { const id = prodIdOf(x.model); return id ? <TagChip key={x.model} r={'product:' + id} label={x.model} /> : <span key={x.model} className="tag">{x.model}</span>; })}</span> : '없음'}{p.unknownModels?.length > 0 && <p className="faint">카탈로그 밖 모델 · {p.unknownModels.join(', ')}</p>}</dd>
      <dt>솔루션</dt><dd>{p.solutions?.length ? <span className="tagchips">{p.solutions.map(name => { const id = solIdOf(name); return id ? <TagChip key={name} r={'solution:' + id} /> : <span key={name} className="tag">{name}</span>; })}</span> : '없음'}</dd>
      {p.linkedReq && <><dt>요구사항</dt><dd>{r.settings?.linkedTitle || '연결됨'}</dd></>}
    </dl>
    {p.parts && <PartFlow parts={p.parts} ul={ul} onUnit={openUnit} />}
    <div className="rv-reading-notes">
      {version < REVIEW_CRITERIA_VERSION && <p>이전 {CATS.length}개 영역·{CRITERIA.length}개 기준으로 만든 평가입니다. 기존 점수와 당시 기준을 보존하며, 다시 평가하면 새 기준을 적용합니다.</p>}
      {r.demo && <p>{r.ai && r.scoring === 'server' ? '가상 고객의 예시 제안서를 실제 AI로 검토한 기록입니다.' : '가상 고객의 예시 리포트로, 실제 AI 평가 결과가 아닙니다.'}</p>}
      {failMsg && <p>{failMsg}</p>}
      {r.poc?.result?.conversion?.visual?.provided && <p>실제 화면 확인: {r.poc.result.conversion.visual.pages.map(n => (r.poc.sheetMap || [])[n - 1] || n).join(', ')}{ul}. 나머지는 본문과 구조로 평가했습니다.</p>}
    </div>
  </div>;
  return <div className="rv-report rv-report-redesign">
    <section className="rv-hero rv-overview" aria-label="종합평">
      <div className="rv-overview-heading"><div><span className="rv-eyebrow">REVIEW OVERVIEW</span><h3>종합평</h3></div><ReviewHover label="이렇게 읽었어요" className="btn btn-sm rv-reading-button" content={profile}><Icon name="search" size={15} />이렇게 읽었어요<Icon name="info" size={14} /></ReviewHover></div>
      <div className="rv-overview-body">
        <div className="wm-ci-ring"><ScoreRing v={agg.overall} /><button type="button" className="wm-ci-btn" aria-label="검토 점수 기준 보기" aria-haspopup="dialog" onClick={() => setCriteriaOpen(true)}><Icon name="notice" size={16} stroke={2.8} /></button></div>
        <div className="rv-hero-t"><span className={'rv-verdict b-' + band(agg.overall).k}>{verdictOf(agg.overall)}</span><h2>{r.summary.verdict}</h2><p>{r.summary.summary}</p>
          {r.summary.strengths?.length > 0 && <ul className="rv-strengths">{r.summary.strengths.map((s, i) => <li key={i}><Icon name="check" size={13} />{s}</li>)}</ul>}
          <div className="rv-overview-facts"><span>평가 기준 <b>{agg.nApplied}</b>개</span><span>보완 필요 <b>{nFix}</b>개</span><span>{r.units?.length || 0}{ul}</span><span>{scoringLabel(r)}</span></div>
        </div>
      </div>
      <dl className="rv-score-summary" aria-label="영역별 점수" style={{ '--review-category-count': CATS.length }}>{CATS.map(c => <div key={c.id}><dt>{c.name}</dt><dd className={'num b-' + band(agg.cats[c.id]).k}>{agg.cats[c.id] ?? '—'}<small>{agg.cats[c.id] == null ? '미평가' : '/ 100'}</small></dd></div>)}</dl>
    </section>
    <ReviewSlides review={r} doc={doc} deck={deck} onLink={link} assets={assets} perUnit={perUnit} onUnit={openUnit} onAttach={attach} attaching={attaching} />
    <section className="rv-card rv-priorities" aria-label="먼저 고칠 것">
      <div className="rv-card-h"><div><span className="rv-eyebrow">NEXT ACTIONS</span><h3>먼저 고칠 것 <span className="rv-count num">{agg.priorities.length}</span></h3></div><span className="faint">점수 · 중요도 · 영역 가중치를 반영한 수정 순서</span></div>
      <ol className="rv-priority-grid">{agg.priorities.filter(id => CR[id] && res[id]).map((id, i) => {
        const c = CR[id], x = res[id], units = [...new Set([...(x.evidence || []).map(e => e.unit), ...(x.rule?.units || [])])].filter(Boolean);
        return <li key={id}><header><span className="rv-priority-number num">{String(i + 1).padStart(2, '0')}</span><span className="faint">{CAT[c.cat].name}</span><Badge s={x.score} small /></header>
          <h4><ReviewHover label={c.name + ' 수정 상세'} className="rv-priority-title" content={<CriterionDetail criterion={c} selected={r.sel.find(s => s.id === id)} result={x} ul={ul} onUnit={openUnit} />}>{c.name}<Icon name="info" size={13} /></ReviewHover></h4><p>{x.fix || x.reason}</p>
          <footer>{units.map(n => <UnitChip key={n} n={n} label={ul} onOpen={openUnit} />)}</footer>
        </li>;
      })}</ol>
      {!agg.priorities.length && <p className="muted">우선 수정할 항목이 없어요. 기준별 평가에서 세부 근거를 확인해 주세요.</p>}
    </section>
    <ReviewRadar review={r} onUnit={openUnit} />
    {r.poc && <details className="rv-server-details"><summary>서버 AI 채점 원문 보기</summary><PocSection r={r} ul={ul} onUnit={openUnit} /></details>}
    {criteriaOpen && <CriteriaInfo r={r} onClose={() => setCriteriaOpen(false)} />}
    {unit != null && <UnitModal r={r} doc={doc} deck={deck} assets={assets} n={unit} setN={setUnit} onClose={() => setUnit(null)} />}
  </div>;
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

// ---------------------------------------------------------------- unit detail
function UnitModal({ r, doc, deck, assets, n, setN, onClose }) {
  const ul = deck.proposal ? '장' : r.unitLabel || '장', total = deck.units.length;
  const u = deck.units.find(x => x.n === n), du = deck.proposal ? u : doc?.units?.find(x => x.n === n);
  useEffect(() => {
    const keys = e => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft' && n > 1) { e.preventDefault(); setN(n - 1); }
      if (e.key === 'ArrowRight' && n < total) { e.preventDefault(); setN(n + 1); }
    };
    document.addEventListener('keydown', keys); return () => document.removeEventListener('keydown', keys);
  }, [n, total, setN]);
  if (!u) return null;
  return <Modal size="sheet" onClose={onClose} title={`${n}${ul} · ${u.title || '제목 없음'}`} sub={u.part && PARTS[u.part] ? PARTS[u.part].label : undefined} bodyClass="rv-page-dialog"
    footer={<><div className="sv-nav"><button className="btn btn-sm btn-icon" disabled={n <= 1} onClick={() => setN(n - 1)} aria-label="이전 장"><Icon name="chevL" size={15} /></button><span className="num">{n} / {total}</span><button className="btn btn-sm btn-icon" disabled={n >= total} onClick={() => setN(n + 1)} aria-label="다음 장"><Icon name="chev" size={15} /></button></div><span className="sp" /><button className="btn" onClick={onClose}>닫기</button></>}>
    <div className="rv-page-columns">
      <div className="rv-page-layout-column"><div className="rv-page-stage"><ReviewPreview key={n} doc={doc} unit={du} assets={assets} title={`${n}${ul} ${deck.proposal ? '제안서 레이아웃' : '원본 장표'} 확대`} /></div>
        {du?.text && <details className="rv-page-text"><summary>읽은 본문 보기</summary><p>{du.text}</p></details>}
      </div>
      <aside className="rv-page-score-column" aria-label="장표 오른쪽 세부 평가"><ReviewSlideScores review={r} n={n} sourceMatches={deck.scoreSourceMatches} /></aside>
    </div>
  </Modal>;
}

// ---------------------------------------------------------------- re-run
function RerunModal({ r, go, onClose }) {
  const proposals = useStore((s) => s.proposals);
  const s0 = r.settings || {};
  const [customer, setCustomer] = useState(s0.customer || (r.profile && r.profile.customer) || '');
  const [ind, setInd] = useState(s0.ind || (r.profile && r.profile.ind) || '');
  const [link, setLink] = useState(s0.linkedId || '');
  const [note, setNote] = useState(s0.note || '');
  const [ov, setOv] = useState(() => normalizeReviewOverrides(Object.fromEntries(r.sel.map((s) => [s.id, !!s.applied])), criteriaForReview(r).version));
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
    const settings = { customer: customer.trim(), ind: ind || null, note: note.trim(), linkedId: pr ? pr.id : '', linkedTitle: pr ? pr.title : '', reqText: pr ? reqText(pr) : '', reqList, override, selectedCriteria:Object.keys(ov).filter(id=>ov[id]) };
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
          <div className="rv-rerun-ch"><b>평가 기준</b><span className="faint">이전 선택을 현재 기준에 대응해 켰어요</span><span style={{ flex: 1 }} /><button className="btn btn-ghost btn-sm" onClick={() => setOv(Object.fromEntries(CRITERIA.map((c) => [c.id, true])))}>모두 켜기</button><button className="btn btn-ghost btn-sm" onClick={() => setOv(normalizeReviewOverrides(Object.fromEntries(r.sel.map((s) => [s.id, s.applied])), criteriaForReview(r).version))}>이전 선택으로</button></div>
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
  const { CR, CAT, CATS, CRITERIA } = criteriaForReview(r);
  const NCRIT = CRITERIA.length;
  const ul = r.unitLabel || '장'; const res = r.results || {}; const agg = r.agg;
  const L = [];
  L.push(`# 제안서 검토 리포트 — ${r.title}`, '');
  if (r.demo) L.push(r.ai && r.scoring === 'server' ? '> 가상 고객의 예시 제안서를 실제 AI로 검토한 기록입니다.' : '> 가상 고객의 예시 리포트예요. 점수와 검토 의견은 실제 AI 평가 결과가 아닙니다.', '');
  L.push(`- 평가일: ${new Date(r.createdAt).toLocaleString('ko-KR')}`, `- 파일: ${(r.files || []).map((f) => f.name).join(', ')}`, `- 종합: **${agg.overall}점 · ${verdictOf(agg.overall)}** (기준 ${agg.nApplied}/${NCRIT}개, ${scoringLabel(r)})`, '');
  if (r.scoring === 'server') L.push(r.criteriaVersion >= 5 ? '> 각 체크포인트를 제안서 관점으로 평가해 0·40·65·85·100점으로 환산한 평균입니다. 85점은 현재 제안에 충분한 수준입니다.' : r.criteriaVersion >= 4 ? '> 기준마다 체크포인트 4개를 0~4단계로 평가하고 합계/16×100으로 계산한 점수예요.' : '> 기준 점수는 서버 AI의 1 · 2 · 3점을 0 · 50 · 100점으로 바꾼 값이에요.', '');
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
      L.push(`**${CR[s.id].name} — ${x.score}점 (${band(x.score).label})**${x.src === 'rule' ? ' · 규칙 채점' : x.src === 'server' ? x.checkpoints ? ' · 서버 AI 체크포인트 평가' : ` · 서버 AI ${x.rubric}점` : ''}`, '', x.reason, '');
      if (x.evidence && x.evidence.length) L.push(x.evidence.map((e) => `- ${e.unit}${ul}: “${e.quote}”`).join('\n'), '');
      if (x.checkpoints) for (const point of x.checkpoints) L.push(`- ${point.name}: ${point.level}/4 (${point.points ?? point.level * 25}점) — ${point.reason}${point.verification ? ' / 확인: ' + point.verification : ''}`);
      if (x.fix) L.push(`고칠 방법: ${x.fix}`, '');
    }
  }
  const ex = r.sel.filter((s) => !s.applied);
  if (ex.length) { L.push('## 적용하지 않은 기준', ''); for (const s of ex) L.push(`- ${CR[s.id].name} — ${s.why}`); }
  if (r.poc && r.poc.status === 'done' && r.poc.result) {
    const pr = r.poc.result; const ag = pr.aggregate || {}; const m = modeLabel(r.poc.llm);
    L.push('', r.criteriaVersion >= 4 ? '## 서버 AI 체크포인트 채점 상세' : r.scoring === 'server' ? '## 서버 AI 채점 상세 (1~3점 루브릭 · 서버 집계)' : '## 핵심 점검 점수 (서버 · 1~3점 루브릭, 위 종합 점수와 별도)', '', `- ${ag.total == null ? '평가 불가' : Math.round(ag.total) + '점'} · ${ag.verdict || ''} · 채점 기준 ${ag.n_scored || 0}개${m ? ' · ' + m.label : ''}`, '');
    for (const s of pr.scores || []) L.push(`- **${CR[s.id] ? CR[s.id].name : s.id}** — ${s.score == null ? '채점 안 됨' : s.score + '점 (' + (r.criteriaVersion >= 4 ? '체크포인트 평가' : PSCORE[s.score]?.label || '') + ')'} · ${SMODE[s.mode] || s.mode}${s.anchor ? ': ' + s.anchor : ''}${s.improve ? ' / 고칠 방법: ' + s.improve : ''}`);
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
