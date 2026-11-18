// 데이터 소스 · samsung.com/business 카드 — DSS 종류(제품 · 솔루션 · 서비스 · 구독). 수집한 뒤 LLM 이 판정한 종류
// (proddb/build/dss/classify.py · proddb/dss/kinds.json)를 원장(proddb/dss/ledger.json) 기준으로 센다 — 누르면 그 종류의 항목 목록.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { number, date } from './api';
import { Icon } from './icons';
import { Button, Modal, Empty, Loading, ErrorBox } from './components';
import { useLoad } from './context';
import './dss-kinds.css';

const KINDS = [['device', '제품', 'box'], ['solution', '솔루션', 'spark'], ['service', '서비스', 'shield'], ['subscription', '구독', 'refresh']];
const LABEL = Object.fromEntries(KINDS.map(([k, label]) => [k, label]));
const BY = { llm: 'LLM', manual: '사람', rule: '규칙', registry: '레지스트리' };
const REGISTRY = { 'products_db.products': '제품 DB', 'catalog.products': '큐레이션', 'catalog.solutions': '앱 솔루션', 'vertical_space_solution.solution_catalog': '버티컬 솔루션' };
const stop = e => e.stopPropagation();

export function DssKinds() {
  const sum = useLoad('/dss/kinds', 0);
  const [kind, setKind] = useState(null);
  const by = sum.data?.by_kind || {}, meta = sum.data?.meta;
  if (sum.error || !sum.data) return null;
  return <div className="dk-strip" onClick={stop} onKeyDown={stop} aria-label="DSS 종류">
    {KINDS.map(([k, label, icon]) => <button key={k} type="button" className={'dk-chip ' + k} onClick={() => setKind(k)}
      title={meta ? [meta.model && 'LLM ' + meta.model, meta.at && date(meta.at, true)].filter(Boolean).join(' · ') : undefined}>
      <Icon name={icon} size={12}/><span>{label}</span><b>{number(by[k] || 0)}</b></button>)}
    {meta?.review > 0 && <button type="button" className="dk-chip review" onClick={() => setKind('device')} title="다시 볼 것">{number(meta.review)}</button>}
    {kind && createPortal(<KindDialog kind={kind} meta={meta} setKind={setKind} close={() => setKind(null)}/>, document.body)}
  </div>;
}

function KindDialog({ kind, meta, setKind, close }) {
  const list = useLoad('/dss/kinds/' + kind, 0);
  const [q, setQ] = useState('');
  const items = (list.data?.items || []).filter(x => !q || `${x.name} ${x.id} ${x.family || ''} ${x.why || ''}`.toLowerCase().includes(q.toLowerCase()));
  return <Modal title={'DSS 종류 · ' + LABEL[kind]} subtitle={[list.data && number(list.data.items.length) + '개', meta?.model && 'LLM ' + meta.model, meta?.at && date(meta.at, true)].filter(Boolean).join(' · ')}
    close={close} wide footer={<Button variant="primary" onClick={close}>닫기</Button>}>
    <div className="dk-tabs" role="tablist" aria-label="DSS 종류">{KINDS.map(([k, label]) => <button key={k} role="tab" aria-selected={k === kind} className={k === kind ? 'on' : ''}
      onClick={() => setKind(k)}>{label}</button>)}</div>
    {list.error ? <ErrorBox error={list.error} retry={list.retry}/> : !list.data ? <Loading/> : <>
      <input className="dk-search" value={q} onChange={e => setQ(e.target.value)} placeholder="이름 · id · 분류 · 근거" aria-label="검색"/>
      {!items.length ? <Empty title="항목이 없습니다"/> : <div className="dk-list" role="list">{items.map(x => <div key={x.key} role="listitem" className={'dk-row' + (x.review ? ' review' : '')}>
        <span className="dk-name" title={x.id}>{x.name}<small>{[REGISTRY[x.registry] || x.registry, x.family].filter(Boolean).join(' · ')}</small></span>
        <span className="dk-tags">
          {x.review && <b className="dk-tag review">다시 볼 것</b>}
          {x.rule && x.rule !== kind && <b className="dk-tag moved" title="이전 규칙의 종류">{LABEL[x.rule]} →</b>}
          {x.same && <b className="dk-tag same" title="같은 앱 솔루션">= {x.same}</b>}
          <b className="dk-tag">{BY[x.by] || x.by}{x.conf === 'low' ? ' · 낮음' : ''}</b>
        </span>
        <span className="dk-why" title={x.why || ''}>{x.why || ''}</span>
      </div>)}</div>}
    </>}
  </Modal>;
}
