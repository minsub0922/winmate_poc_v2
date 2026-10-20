import {FeedbackPopup} from './feedback-popup.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { Icon, Modal } from './common.jsx';
import { currentRequirementSummary, savedRequirementSummary, requirementSourceKey, requirementSources, SUMMARY_SECTIONS } from '../domain/proposals/requirement-summary.js';
import { getProposal } from '../repositories/proposals.js';
import { ensureRequirementSummary, visibleRequirementSources } from '../services/requirement-summary.js';
import { hydrateAttachmentSources } from '../services/attachment-sources.js';
import '../styles/requirement-summary.css';

function SourceDialog({ p, reference, onClose, onOpenReq }) {
  const [source, setSource] = useState(null);
  const highlight = useRef(null);
  useEffect(() => { if (source) highlight.current?.scrollIntoView({ block: 'center' }); }, [source]);
  useEffect(() => {
    let active = true;
    hydrateAttachmentSources(p).then(() => {
      if (active) setSource(visibleRequirementSources(p).find(s => s.id === reference.source_id) || { text: '', label: reference.source_id });
    });
    return () => { active = false; };
  }, [p.id, reference]);
  const text = source?.text || '', at = text.indexOf(reference.quote);
  return <Modal title={'요구사항 원문 · ' + (source?.label || '불러오는 중')} onClose={onClose} size="wide"
    footer={<><span className="bp-note">요약보다 원문을 우선해서 판단해 주세요.</span><span className="sp" /><button className="btn" onClick={() => { onClose(); onOpenReq(); }}>요구사항에서 보기</button><button className="btn btn-primary" onClick={onClose}>닫기</button></>}>
    <div className="rq-source-view">
      <span className="rq-summary-kind">인용한 원문</span><blockquote>{reference.quote}</blockquote>
      {!source ? <p role="status">원문을 불러오는 중이에요.</p> : <>
        {source.partial && <p className="rq-summary-warning">저장된 발췌만 확인할 수 있어요. 첨부파일 전체 원문을 다시 연결하면 나머지도 확인할 수 있습니다.</p>}
        {at < 0 && <p className="rq-summary-warning">현재 원문에서 인용 위치를 찾지 못했어요. 입력 변경 여부 또는 첨부 원문을 확인해 주세요.</p>}
        <details open><summary>원문 전체 보기</summary><pre>{at >= 0 ? <>{text.slice(0, at)}<mark ref={highlight}>{reference.quote}</mark>{text.slice(at + reference.quote.length)}</> : text || '이 기기에는 해당 원문이 저장되어 있지 않습니다.'}</pre></details>
      </>}
    </div>
  </Modal>;
}

export function RequirementSummaryCard({ p, onOpenReq, readOnly = false }) {
  const [reference, setReference] = useState(null);
  const [confirmationKey, setConfirmationKey] = useState(null);
  const result = savedRequirementSummary(p), state = p.requirementSummary;
  const key = requirementSourceKey(p), pending = state?.status === 'pending' && state.sourceKey === key;
  const hasInput = requirementSources(p).length > 0;
  const changed = !!result && result.source_key !== key;
  const canSummarize = !readOnly && hasInput && !pending && (!result || changed);
  useEffect(() => { setReference(null); setConfirmationKey(null); }, [p.id, key, readOnly]);
  const requestSummary = () => { if (canSummarize) setConfirmationKey(key); };
  const confirmSummary = () => {
    const current = getProposal(p.id);
    setConfirmationKey(null);
    if (!canSummarize || !current || requirementSourceKey(current) !== confirmationKey || currentRequirementSummary(current)) return;
    void ensureRequirementSummary(p.id, { force: true });
  };
  const label = id => result?.sources.find(s => s.id === id)?.label || id;
  const refs = item => <span className="rq-summary-refs">{item.refs.map((ref, i) => <button type="button" key={ref.source_id + i} title={label(ref.source_id)} aria-label={'원문 보기 · ' + label(ref.source_id)} onClick={() => setReference(ref)}><Icon name="link" size={11} />{i + 1}</button>)}</span>;
  const item = (value, i) => <li key={i}><span>{value.kind !== 'fact' && <span className="rq-summary-kind">{value.kind === 'question' ? '확인 필요' : 'AI 제안'}</span>}{value.text}</span>{refs(value)}</li>;
  const total = result ? SUMMARY_SECTIONS.reduce((n, [k]) => n + result.summary[k].length, 0) : 0;
  return <>
    <FeedbackPopup message={state?.status==='error'&&state.sourceKey===key?state.error:""} actionLabel={canSummarize ? '요약 다시 시도' : undefined} onAction={requestSummary}/>
    <section className="rq-summary-card" aria-label="고객 요구사항 요약" onMouseDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}>
      <header><span><Icon name="sparkle" size={15} />제안 전략 요약</span><span className="rq-summary-state">{pending ? '요약 중' : changed ? '요구사항 변경' : result ? 'AI · 원문 연결' : hasInput ? '요약 준비' : '입력 대기'}</span></header>
      {pending && <FeedbackPopup message="목표·제약·판단 기준을 나누고 원문 근거를 연결하고 있어요." kind="progress"/>}
      {changed && <p className="rq-summary-warning">요구사항이 변경됐어요. 현재 요약은 이전 요구사항을 기준으로 작성됐어요.</p>}
      {result ? <>
        <p className="rq-summary-overview">{result.summary.overview.text}{refs(result.summary.overview)}</p>
        <dl className="rq-summary-quick">{[['goals', '목표'], ['requirements', '핵심 요구'], ['strategy', '제안 방향']].map(([key, title]) => result.summary[key][0] && <div key={key}><dt>{title}</dt><dd>{result.summary[key][0].kind !== 'fact' && <span className="rq-summary-kind">{result.summary[key][0].kind === 'question' ? '확인 필요' : 'AI 제안'}</span>}{result.summary[key][0].text}{refs(result.summary[key][0])}</dd></div>)}</dl>
        {result.coverage?.complete === false && <p className="rq-summary-warning">일부 첨부 원문은 발췌만 반영됐어요. 전체 원문 확인이 필요합니다.</p>}
        <details className="rq-summary-sections"><summary>항목별 요약 <span>{total}개</span><Icon name="chevD" size={13} /></summary>
          <div>{SUMMARY_SECTIONS.map(([key, title]) => <section key={key}><h4>{title}</h4>{result.summary[key].length ? <ul>{result.summary[key].map(item)}</ul> : <p className="rq-summary-empty">원문에 명시된 내용 없음</p>}</section>)}</div>
        </details>
        <footer><button type="button" onClick={onOpenReq}><Icon name="doc" size={12} />요구사항 원문</button>{!readOnly && <button type="button" disabled={!canSummarize} title={!changed ? '요구사항이 변경되면 다시 요약할 수 있어요' : undefined} onClick={requestSummary} aria-label="고객 요구사항 다시 요약">다시 요약</button>}</footer>
      </> : !pending && <div className="rq-summary-placeholder">
        <p>{hasInput?'요구사항을 바탕으로 제안에 필요한 맥락을 정리해요.':'요구사항을 입력하면 AI가 핵심과 제안 방향을 정리해요.'}</p>
        {hasInput && !readOnly && <button type="button" className="btn btn-soft btn-sm" onClick={requestSummary}><Icon name="sparkle" size={13} />{state?.status === 'error' ? '요약 다시 시도' : '요약 만들기'}</button>}
      </div>}
    </section>
    {reference && <SourceDialog p={p} reference={reference} onClose={() => setReference(null)} onOpenReq={onOpenReq} />}
    {confirmationKey === key && canSummarize && <Modal title={result ? '고객 요구사항을 다시 요약할까요?' : '고객 요구사항을 요약할까요?'} size="narrow" onClose={() => setConfirmationKey(null)}
      footer={<><button type="button" className="btn" data-autofocus onClick={() => setConfirmationKey(null)}>취소</button><button type="button" className="btn btn-primary" onClick={confirmSummary}>요약 시작</button></>}>
      <p>{result ? '변경된 요구사항으로 AI 요약을 새로 만듭니다. 완료되면 기존 요약이 새 요약으로 바뀝니다.' : '입력한 요구사항을 바탕으로 AI가 핵심과 제안 방향을 정리합니다.'}</p>
    </Modal>}
  </>;
}
