// 고객 요구사항 버블 아래의 요약 카드 — 개요, 그리고 목표 · 핵심 요구 · 제안 방향을 목록으로. 카드 어디를 눌러도 고객 요구사항
// 팝업이 열린다(onOpenReq). 요약은 처음 저장할 때 한 번 자동으로 만들고, 그 뒤에는 요구사항이 바뀌었을 때만 「다시 요약」이 켜진다.
import React from 'react';
import { Icon } from './common.jsx';
import { savedRequirementSummary, requirementSourceKey } from '../domain/proposals/requirement-summary.js';
import { ensureRequirementSummary, requirementSummaryBusy, requirementSummaryStale } from '../services/requirement-summary.js';
import '../styles/requirement-summary.css';

const GROUPS = [['goals', '목표'], ['requirements', '핵심 요구'], ['strategy', '제안 방향']];
const KIND = { question: '확인 필요', inference: '추정' };

export function RequirementSummaryCard({ p, onOpenReq, readOnly = false }) {
  const result = savedRequirementSummary(p), state = p.requirementSummary;
  const pending = requirementSummaryBusy(p);
  if (!pending && !result) return null;

  const error = !pending && state?.status === 'error' && state.sourceKey === requirementSourceKey(p) ? state.error || '요약을 만들지 못했어요.' : '';
  const canSummarize = !readOnly && requirementSummaryStale(p);
  const open = () => { if (onOpenReq) onOpenReq(); };
  const summarize = (e) => { e.stopPropagation(); if (canSummarize) void ensureRequirementSummary(p.id, { force: true }); };
  const again = !readOnly && result && (
    <button type="button" className="rq-summary-again" disabled={!canSummarize} onClick={summarize} aria-label="고객 요구사항 다시 요약"
      title={canSummarize ? (error ? '요약을 다시 시도해요' : '바뀐 요구사항으로 다시 요약해요') : pending ? '요약하고 있어요' : '요구사항이 바뀌면 다시 요약할 수 있어요'}>
      <Icon name="refresh" size={12} />다시 요약
    </button>
  );
  return (
    <section className={'rq-summary-card' + (pending ? ' is-pending' : '')} aria-label="고객 요구사항 요약" aria-busy={pending || undefined} tabIndex={onOpenReq ? 0 : undefined}
      onClick={open} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(); } }}
      onMouseDown={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()}>
      <header>
        <span className="rq-summary-title"><Icon name="sparkle" size={15} />요약</span>
        {pending && <span className="rq-summary-state" role="status"><span className="spin" aria-hidden="true" />요약 중</span>}
        {again}
      </header>
      {error && <p className="rq-summary-error" role="alert">{error}</p>}
      {result ? <>
        <p className="rq-summary-overview">{result.summary.overview.text}</p>
        {GROUPS.map(([key, title]) => (
          <div className="rq-summary-group" key={key}>
            <h4>{title}</h4>
            {result.summary[key].length
              ? <ul>{result.summary[key].map((item, i) => <li key={i}>{key !== 'strategy' && KIND[item.kind] && <span className="rq-summary-kind">{KIND[item.kind]}</span>}{item.text}</li>)}</ul>
              : <p className="rq-summary-empty">원문에 없음</p>}
          </div>
        ))}
        {result.coverage?.complete === false && <p className="rq-summary-note">읽지 못한 첨부가 있어 일부만 반영됐어요.</p>}
      </> : <p className="rq-summary-placeholder">요구사항을 읽고 개요 · 목표 · 핵심 요구 · 제안 방향을 정리하고 있어요.</p>}
    </section>
  );
}
