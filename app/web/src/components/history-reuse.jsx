import React, { useState } from 'react';
import { useStore, update, uid } from '../repositories/proposals.js';
import { Icon, Modal, fmtWhen, toast } from './common.jsx';
import { reqText } from '../services/search.js';
import { refInfo } from '../services/catalog.js';
import { HistoryContextPreview } from './history-context-preview.jsx';
import { HistoryRequirementsPreview } from './history-requirements-preview.jsx';
import '../styles/history-reuse.css';

export function HistoryReuse({ p, kind }) {
  const proposals = useStore(s => s.proposals);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const req = kind === 'req';
  const label = req ? '고객 요구사항' : '제품 · 솔루션 매칭';
  const candidates = proposals.filter(x => x.id !== p.id && (req ? reqText({ ...x, title: '', customer: '' }).trim() : Object.values(x.ctx).some(xs => xs.length))
    && (!query.trim() || [x.title, x.customer, req ? reqText(x) : Object.entries(x.ctx).flatMap(([k, ids]) => ids.map(id => refInfo(`${k === 'products' ? 'product' : k === 'solutions' ? 'solution' : 'case'}:${id}`)?.label || '')).join(' ')].join(' ').toLowerCase().includes(query.trim().toLowerCase())));
  const source = proposals.find(x => x.id === selected);
  const close = () => { setOpen(false); setSelected(null); setQuery(''); };
  const apply = () => {
    if (!source) return;
    update(p.id, d => {
      if (req) {
        d.req = structuredClone(source.req);
        d.req.form.keymen.forEach(k => { k.id = uid('k'); });
        d.req.files.forEach(f => { f.id = uid('f'); });
        d.reqTab = source.reqTab;
        d.customer = source.customer;
        delete d.reqSaved;
      } else d.ctx = structuredClone(source.ctx);
      d.ind = source.ind || null;
      d.indName = source.indName || null;
    });
    close(); toast(`${label}을 이전 히스토리에서 불러왔어요`);
  };
  return <>
    <button className="btn btn-soft reuse-trigger" aria-label="이전 히스토리에서 불러오기" onClick={() => setOpen(true)}><Icon name="history" size={20} /><span className="reuse-trigger-copy"><b>이전 히스토리에서 불러오기</b><small>{req ? '이전 제안서의 고객 요구사항을 확인하고 가져와요' : '제품 · 솔루션 · 유관사례의 이미지와 정보를 확인하고 가져와요'}</small></span></button>
    {open && <Modal size="wide history-reuse" bodyClass="mbody reuse-body" title={`이전 ${label} 재사용`} onClose={close}
      sub="이전 제안서를 선택해 내용을 확인한 뒤 불러오세요. 현재 버블의 내용이 선택한 내역으로 바뀝니다."
      footer={<><span className="sp" /><button className="btn" onClick={close}>취소</button><button className="btn btn-primary" disabled={!source} onClick={apply}>이 내역 불러오기</button></>}>
      <input className="input reuse-search" aria-label="히스토리 검색" placeholder="제안서 · 고객사 · 내용 검색" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="reuse-workspace"><div className="reuse-list" aria-label="이전 제안서 목록">{candidates.map(x => <button key={x.id} className={'reuse-item' + (selected === x.id ? ' selected' : '')} aria-pressed={selected === x.id} onClick={() => setSelected(x.id)}>
        <b>{x.title}</b><span>{x.customer || '고객사 미정'} · {fmtWhen(x.updatedAt)}</span>
        <p>{req ? reqText(x).slice(0, 180) : `제품 ${x.ctx.products.length} · 솔루션 ${x.ctx.solutions.length} · 유관사례 ${x.ctx.cases.length}`}</p>
      </button>)}{!candidates.length && <p className="muted">재사용할 이전 내역이 없어요.</p>}</div>
      {source ? <section key={source.id} className="reuse-preview" aria-label="불러올 내용"><h3>불러올 내용</h3><p className="reuse-preview-source">{source.title} · {source.customer || '고객사 미정'}</p>{req ? <HistoryRequirementsPreview source={source} /> : <HistoryContextPreview source={source} compact />}</section> : <section className="reuse-preview reuse-preview-empty"><b>히스토리를 선택해 주세요</b><span className="muted">히스토리를 클릭하면 불러올 내용을 확인할 수 있어요.</span></section>}</div>
    </Modal>}
  </>;
}
