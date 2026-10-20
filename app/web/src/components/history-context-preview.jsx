import React from 'react';
import { P, S, C, IND } from '../services/catalog.js';
import { Icon } from './common.jsx';
import { Thumb } from './Thumbs.jsx';

export const HISTORY_CONTEXT_KINDS = [['products','product','제품'],['solutions','solution','솔루션'],['cases','case','유관사례']];
const list = value => Array.isArray(value) ? value.filter(Boolean).join(' · ') : value || '';
const industries = values => list((Array.isArray(values) ? values : values ? [values] : []).map(code => IND[code]?.name || code));
const productNames = values => list((values || []).map(id => P[id]?.model || P[id]?.name || id));

function metadata(type, id) {
  const item = ({product:P, solution:S, case:C})[type]?.[id];
  if (!item) return null;
  let rows;
  if (type === 'product') rows = [['모델',item.model],['분류',item.cat || item.sc],['사양',item.spec],['적용 공간',list(item.spaces)],['업종',industries(item.ind)]];
  else if (type === 'solution') rows = [['분류',item.cat],['설명',item.desc],['함께 쓰는 제품',productNames(item.with)],['업종',industries(item.ind)]];
  else rows = [['내용',item.sub || item.title],['업종',industries(item.ind) || item.indRaw],['고객 유형',item.type],['게시일',item.date],['공간',list(item.space)],['도입 제품',productNames(item.prod)],['제공 구성',list(item.offer)],['고객 요구',list(item.needs)],['도입 성과',list(item.proof)]];
  return {name:type === 'case' ? item.cust || item.title : item.name || item.model, rows:rows.filter(([,value]) => value), url:item.url};
}

function ContextPreviewItem({ type, id, label }) {
  const meta = metadata(type,id);
  return <article className={'reuse-context-card '+type} data-context-ref={type+':'+id} aria-label={label+' '+(meta?.name || id)}>
    <div className="reuse-context-photo" role="img" aria-label={(meta?.name || id)+' 대표 이미지'}>
      {meta ? <Thumb r={type+':'+id} /> : <Icon name={type} size={40} />}
    </div>
    <div className="reuse-context-info">
      <span className="reuse-context-kind">{label}</span><h5>{meta?.name || id}</h5>
      {meta ? <dl>{meta.rows.map(([key,value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl>
        : <p className="muted">현재 DB에서 상세 정보를 찾을 수 없어요. 항목 ID: {id}</p>}
      {meta?.url && /^https?:\/\//i.test(meta.url) && <a href={meta.url} target="_blank" rel="noopener noreferrer" className="reuse-context-source">원문 보기<Icon name="ext" size={12} /></a>}
    </div>
  </article>;
}

export function HistoryContextPreview({ source }) {
  return <div className="reuse-context-groups">{HISTORY_CONTEXT_KINDS.map(([key,type,label]) => {
    const ids = source.ctx?.[key] || [];
    return <section key={key} aria-label={'불러올 '+label} className="reuse-context-group">
      <h4><Icon name={type} size={16} />{label}<span className="num">{ids.length}</span></h4>
      {ids.length ? <div className="reuse-context-items">{ids.map((id,index) => <ContextPreviewItem key={String(id)+':'+index} type={type} id={id} label={label} />)}</div>
        : <p className="reuse-context-empty">연결된 {label}{key === 'cases' ? '가' : '이'} 없어요.</p>}
    </section>;
  })}</div>;
}
