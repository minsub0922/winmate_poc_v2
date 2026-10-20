import { GROUPS, KIND_GROUP, KIND_NAME, rankImages, relatedImages, imageProducts, fileToStoredImage, suggestImages } from '../services/images.js';
export { GROUPS, KIND_GROUP, KIND_NAME, rankImages, fileToStoredImage, suggestImages };
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { DeleteButton, Icon, Modal, toast } from './common.jsx';
import { searchImages } from '../services/search.js';
import { useImagePeek } from './imagepeek.jsx';
import { useImageLibrary } from '../services/image-library.js';
import { PImg } from '../services/products.js';
import '../styles/image-picker.css';

export const IMAGE_PAGE_SIZE = 21;
/* =========================================================
   Image picker — search catalog images or drop a file
   ========================================================= */
export function ImagePicker({ slot, current, models = [], context = {}, contextText = '', onPick, onClose }) {
  const peek = useImagePeek();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [page, setPage] = useState({ key: '["",""]', count: IMAGE_PAGE_SIZE });
  const contextKey = JSON.stringify(context), modelKey = JSON.stringify(models);
  const libraryContext = useMemo(() => ({ ...context, products: [...new Set([...(context.products || []), ...imageProducts(current)])] }), [contextKey, current]);
  const library = useImageLibrary(libraryContext);
  const [fit, setFit] = useState((current && current.fit) || (slot && KIND_GROUP[slot.kind] === 'cut' ? 'contain' : 'cover'));
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const gridRef = useRef(null), sentinelRef = useRef(null);
  const related = useMemo(() => relatedImages(library.images, { current, models, productIds: context.products || [], kind: slot?.kind, hint: slot?.hint, contextText }),
    [library.images, current, modelKey, contextKey, slot?.kind, slot?.hint, contextText]);
  const ordered = useMemo(() => {
    const first = new Set(related.map(image => image.src));
    return [...related, ...library.images.filter(image => !first.has(image.src))];
  }, [related, library.images]);
  const query = q.trim().toLowerCase();
  const queryKey = JSON.stringify([query, group]);
  const list = useMemo(() => query || group ? searchImages(ordered, query, group) : ordered, [ordered, query, group]);
  const relatedCount = group ? related.filter(image => image.group === group).length : related.length;
  const count = page.key === queryKey ? page.count : IMAGE_PAGE_SIZE;
  const visible = list.slice(0, count), hasMore = visible.length < list.length;
  useEffect(() => {
    if (!hasMore || library.loading) return;
    const root = gridRef.current?.closest('.mbody'), sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const start = root.scrollTop;
    let requested = false;
    const next = (gesture = false) => {
      if (requested || (!gesture && root.scrollTop <= start) || root.scrollHeight - root.scrollTop - root.clientHeight > 48) return;
      requested = true;
      setPage(previous => previous.key !== queryKey ? previous : { key: queryKey, count: Math.min(previous.count + IMAGE_PAGE_SIZE, list.length) });
    };
    const onScroll = () => next();
    const onWheel = event => { if (event.deltaY > 0) next(true); };
    const onKey = event => {
      if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if (['End', 'PageDown', 'ArrowDown', ' '].includes(event.key)) next(true);
    };
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) next(); }, { root, threshold: .01 });
    observer.observe(sentinel); root.addEventListener('scroll', onScroll, { passive: true }); root.addEventListener('wheel', onWheel, { passive: true }); root.addEventListener('keydown', onKey);
    return () => { observer.disconnect(); root.removeEventListener('scroll', onScroll); root.removeEventListener('wheel', onWheel); root.removeEventListener('keydown', onKey); };
  }, [count, queryKey, list, hasMore, library.loading]);
  const changeSearch = (value, category = group) => {
    setQ(value); setGroup(category); setPage({ key: JSON.stringify([value.trim().toLowerCase(), category]), count: IMAGE_PAGE_SIZE });
    const root = gridRef.current?.closest('.mbody'); if (root) root.scrollTop = 0;
  };
  const take = async (file) => { const r = await fileToStoredImage(file); if (!r) { toast('이미지 파일만 넣을 수 있어요', 'warn'); return; } onPick({ ...r, fit }); };
  return (
    <Modal size="wide image-picker" onClose={onClose} title="이미지 넣기" sub={((current?.name || slot?.hint) ? '“' + (current?.name || slot?.hint) + '” 자리 · ' : '') + (slot && KIND_NAME[slot.kind] ? KIND_NAME[slot.kind] + ' 칸' : '이미지 칸') + ' — 라이브러리에서 고르거나 파일을 끌어다 놓으세요.'}
      footer={<>
        <div className="seg" role="group" aria-label="맞춤">
          <button aria-pressed={fit === 'cover'} onClick={() => setFit('cover')}>칸 채우기</button>
          <button aria-pressed={fit === 'contain'} onClick={() => setFit('contain')}>전체 보이기</button>
        </div>
        <span className="sp" />
        {current && <DeleteButton className="btn btn-ghost btn-danger" onClick={() => onPick(null)}><Icon name="trash" size={14} />이미지 비우기</DeleteButton>}
        <button className="btn" onClick={onClose}>닫기</button>
      </>}>
      <div className={'dropzone' + (over ? ' over' : '')} style={{ padding: '16px 18px', flexDirection: 'row', justifyContent: 'center', gap: "var(--space-14px)" }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
        <Icon name="upload" size={22} />
        <span style={{ textAlign: 'left' }}><b style={{ fontSize: "var(--text-14px)" }}>내 이미지 끌어다 놓기</b><br /><span className="faint" style={{ fontSize: "var(--text-12px)" }}>PNG · JPG · WEBP — 큰 사진은 1600px로 줄여서 이 브라우저에 보관해요</span></span>
        <button className="btn btn-sm" onClick={() => fileRef.current && fileRef.current.click()}>파일 고르기</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files && e.target.files[0])} />
      </div>
      <div className="pk-bar">
        <div className="pk-search"><label className="sr" htmlFor="im-q">이미지 검색</label><input id="im-q" data-autofocus className="input" value={q} placeholder="모델명 · 장면 (예: QM55C, 드라이브스루, 매장)" onChange={(e) => changeSearch(e.target.value)} /></div>
      </div>
      <div className="seg image-picker-filters" role="group" aria-label="분류">{GROUPS.map(([key, label]) =>
        <button key={key} type="button" aria-pressed={group === key} onClick={() => changeSearch(q, key)}>{label}</button>)}</div>
      {library.loading && <p role="status">제품별 이미지 연결 정보를 불러오는 중이에요.</p>}
      {library.error && <p role="alert">{library.error} 현재 제공되는 제품 사진에서 찾고 있어요.</p>}
      <div ref={gridRef} className="imgrid">
        {visible.map((im, index) => <React.Fragment key={im.src}>
          {!query && relatedCount > 0 && index === relatedCount && <div className="image-picker-divider" role="separator" />}
          <button className="imgopt" aria-label={im.desc} data-image-id={im.pid} {...peek.bind(im)} onClick={() => onPick({ src: im.src, name: im.desc, fit, pid: im.pid, products: im.products || [], keep: true })}>
            <span className="th"><PImg src={im.src} alt={im.desc} loading="lazy" style={{ objectFit: im.group === 'cut' ? 'contain' : 'cover' }} /></span>
            <span className="c">{im.desc}</span>
            <span className="g">{im.groupName}{im.model ? ' · ' + im.model : ''}{models.includes(String(im.model).toUpperCase()) ? ' · 연결 제품' : ''}</span>
          </button>
        </React.Fragment>)}
        {!library.loading && !list.length && <div className="pk-empty" style={{ gridColumn: '1 / -1' }}>맞는 이미지가 없어요. 파일을 직접 넣어 보세요.</div>}
      </div>
      {hasMore && <div ref={sentinelRef} className="image-picker-next" aria-hidden="true" />}
      {peek.node}
    </Modal>
  );
}

