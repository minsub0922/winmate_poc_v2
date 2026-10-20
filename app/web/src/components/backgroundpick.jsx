import React, { useRef, useState } from 'react';
import { Icon, Modal, toast } from './common.jsx';
import { useImagePeek } from './imagepeek.jsx';
import { BACKGROUND_INDUSTRIES, backgroundGroups } from '../services/backgrounds.js';
import { fileToStoredImage } from '../services/images.js';

export function BackgroundPicker({ context, current, onPick, onClose }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef(null);
  const peek = useImagePeek();
  const { recommended, rest, total } = backgroundGroups({ ...context, query, filter });
  const close = () => { if (!busy) onClose(); };
  const choose = async image => {
    setBusy(true);
    try { await onPick(image); onClose(); }
    catch (error) { toast('배경 사진을 넣지 못했어요: ' + error.message, 'warn'); }
    finally { setBusy(false); }
  };
  const upload = async selected => {
    if (!selected) return;
    setBusy(true);
    try {
      const image = await fileToStoredImage(selected);
      if (!image) throw new Error('이미지 파일을 선택해 주세요.');
      await onPick({ ...image, id: 'upload', title: selected.name }); onClose();
    } catch (error) { toast(error.message, 'warn'); }
    finally { setBusy(false); }
  };
  const group = (title, list) => list.length > 0 && <section className="background-section" aria-label={title}>
    <h3>{title}<span className="num">{list.length}</span></h3>
    <div className="background-grid">{list.map(image => {
      const industry = BACKGROUND_INDUSTRIES.find(x => x.code === image.industry)?.name || '업종 공통';
      const description = { ...image, desc: image.title, groupName: industry, model: '배경 사진' };
      return <button key={image.id} className="background-option" data-background-id={image.id} aria-pressed={current?.id === image.id} disabled={busy}
        {...peek.bind(description)} onClick={() => choose(image)}>
        <img src={image.thumb} alt={image.title} loading="lazy" />
        <b>{image.title}</b><span>{industry}</span>
        {title === '현재 시트 추천' && <small>{image.reasons.join(' · ')}</small>}
      </button>;
    })}</div>
  </section>;
  return <Modal size="wide" title="배경 사진 선택" onClose={close}
    sub="현재 시트의 업종 · 문구 · 파트 유형에 맞는 사진을 먼저 추천해요."
    footer={<><span className="note">{busy ? '사진을 적용하는 중…' : `배경 ${total}개 · ${BACKGROUND_INDUSTRIES.length}개 업종`}</span><span className="sp" /><button className="btn" disabled={busy} onClick={close}>닫기</button></>}>
    <div className="background-tools">
      <input className="input" aria-label="배경 사진 검색" placeholder="장면 검색 · 예) 호텔 로비, 강의실, 물류" value={query} disabled={busy} onChange={e => setQuery(e.target.value)} />
      <select className="select" aria-label="배경 사진 업종" value={filter} disabled={busy} onChange={e => setFilter(e.target.value)}><option value="">모든 업종</option>{BACKGROUND_INDUSTRIES.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}</select>
      <button className="btn" disabled={busy} onClick={() => file.current.click()}><Icon name="upload" size={14} />내 사진</button>
      <input ref={file} type="file" accept="image/*" hidden onChange={e => upload(e.target.files?.[0])} />
    </div>
    {group('현재 시트 추천', recommended)}
    {group('나머지 배경 사진', rest)}
    {!total && <p className="muted">맞는 배경 사진이 없어요. 검색어나 업종을 바꿔 보세요.</p>}
    {peek.node}
  </Modal>;
}
