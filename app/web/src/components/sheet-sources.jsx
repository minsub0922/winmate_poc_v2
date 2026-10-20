import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './common.jsx';
import { Thumb } from './Thumbs.jsx';
import { useDetailPeek } from './reference-detail.jsx';
import { HistoryRequirementsPreview } from './history-requirements-preview.jsx';
import { PImg } from '../services/products.js';
import { linkTags } from '../services/links.js';
import { WEB_KIND, hostOf } from '../services/websources.js';
import '../styles/sheet-sources.css';

const keepNavigation = event => { if (event.key !== 'Escape') event.stopPropagation(); };

/** Specs, galleries and evidence remain in the detail; source tiles stay visual. */
export function SheetReferenceGrid({ p, items, kind, onInsertImage }) {
  const peek = useDetailPeek(p);
  const open = (item, anchor) => peek.open(item.r, { anchor,
    children: !!item.images?.length && <section className="sheet-source-images"><h3>이 장에 넣을 이미지</h3>
      <div>{item.images.map((image, index) => <button type="button" key={image.pid || image.src || index}
        aria-label={(image.desc || item.name) + ' 이미지 넣기'} onClick={() => { onInsertImage(image); peek.close(); }}>
        <PImg src={image.src} alt={image.desc || item.name} loading="lazy" style={{ objectFit: image.group === 'cut' || image.cut ? 'contain' : 'cover' }} />
      </button>)}</div>
    </section>,
  });
  return <>
    <div className={'sheet-source-grid ' + kind}>
      {items.map(item => <button type="button" key={item.r} className="sheet-source-card" data-source-ref={item.r}
        aria-label={item.name + ' 상세 보기'} onClick={event => open(item, event.currentTarget)}
        onMouseEnter={event => { if (window.matchMedia('(hover: hover)').matches) peek.show(item.r, event.currentTarget); }}
        onMouseLeave={peek.hide} onBlur={peek.hide}
        onFocus={event => { if (event.currentTarget.matches(':focus-visible')) peek.show(item.r, event.currentTarget, true); }}>
        <Thumb r={item.r} className="sheet-source-photo" />
        <span className="sheet-source-caption"><b>{item.name}</b>{item.category && <span>{item.category}</span>}</span>
      </button>)}
    </div>
    {peek.node}
  </>;
}

export function CustomerSources({ p }) {
  const [anchor, setAnchor] = useState(null);
  const box = useRef(null), showTimer = useRef(), hideTimer = useRef();
  const clear = () => { clearTimeout(showTimer.current); clearTimeout(hideTimer.current); };
  const hide = () => { clear(); setAnchor(null); };
  const keep = () => clear();
  const leave = () => { clear(); hideTimer.current = setTimeout(() => { if (!box.current?.contains(document.activeElement)) setAnchor(null); }, 180); };
  const show = (element, immediate = false) => { clear(); showTimer.current = setTimeout(() => { if (element.isConnected) setAnchor(element.getBoundingClientRect()); }, immediate ? 0 : 240); };
  useEffect(() => () => clear(), []);
  useEffect(() => {
    if (!anchor) return;
    const key = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); } };
    const scroll = event => { if (!(event.target instanceof Node) || !box.current?.contains(event.target)) hide(); };
    document.addEventListener('keydown', key, true); window.addEventListener('resize', hide); window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('keydown', key, true); window.removeEventListener('resize', hide); window.removeEventListener('scroll', scroll, true); };
  }, [!!anchor]);
  const [position, setPosition] = useState({ left: -9999, top: 12 });
  useLayoutEffect(() => {
    if (!anchor) return;
    const width = Math.min(560, window.innerWidth - 24), height = Math.min(520, window.innerHeight - 24);
    const left = anchor.left - width - 12 >= 12 ? anchor.left - width - 12 : Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
    setPosition({ left, top: Math.max(12, Math.min(anchor.top, window.innerHeight - height - 12)), width, maxHeight: height });
  }, [anchor]);
  const files = p.req.files || [];
  return <>
    <button type="button" className="sheet-customer-button" aria-expanded={!!anchor}
      onMouseEnter={event => { if (window.matchMedia('(hover: hover)').matches) show(event.currentTarget); }} onMouseLeave={leave}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) show(event.currentTarget, true); }}
      onBlur={event => { if (box.current?.contains(event.relatedTarget)) keep(); else leave(); }} onClick={event => show(event.currentTarget, true)}>
      <Icon name="clip" size={17} /><span>고객 자료 보기</span><Icon name="chev" size={15} />
    </button>
    {anchor && createPortal(<aside ref={box} className="sheet-customer-hover" role="dialog" aria-modal="false" aria-label="고객 자료" style={position}
      onMouseEnter={keep} onMouseLeave={leave} onFocusCapture={keep} onKeyDown={keepNavigation}
      onBlur={event => { if (!box.current?.contains(event.relatedTarget)) leave(); }}>
      <header><div><h3>고객 자료</h3><span>{p.customer || p.title}</span></div><button type="button" className="btn btn-ghost btn-icon" onClick={hide} aria-label="고객 자료 닫기"><Icon name="x" size={16} /></button></header>
      <div className="sheet-customer-hover-body">
      <HistoryRequirementsPreview source={p} />
      {files.some(file => file.text) && <section className="sheet-customer-extracts"><h3>첨부파일에서 읽은 내용</h3>
        {files.filter(file => file.text).map((file, index) => <article key={file.id || index}><h4>{file.name}</h4><p>{file.text}</p></article>)}
      </section>}
      </div>
    </aside>, document.body)}
  </>;
}

function shortAddress(url) {
  try { const value = new URL(url); return value.hostname.replace(/^www\./, '') + value.pathname.replace(/\/$/, ''); }
  catch { return url; }
}

function WebIcon({ source, metadata, loading }) {
  const icon = metadata?.icon || new URL('/favicon.ico', source.url).href;
  return <span className="sheet-web-icon">{loading
    ? <span className="sheet-web-loading shimmer" role="status" aria-label="링크 미리보기 불러오는 중" />
    : <PImg src={icon} alt="" compact loading="lazy" />}</span>;
}

function WebPreview({ source, metadata, anchor, boxRef, keep, leave }) {
  const [position, setPosition] = useState({ left: -9999, top: 12, width: Math.min(440, window.innerWidth - 24) });
  useLayoutEffect(() => {
    const place = () => {
      const width = Math.min(440, window.innerWidth - 24), height = Math.min(Math.ceil(boxRef.current?.getBoundingClientRect().height || 480), window.innerHeight - 24);
      const left = anchor.left - width - 12 >= 12 ? anchor.left - width - 12
        : anchor.right + width + 12 <= window.innerWidth - 12 ? anchor.right + 12
          : Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
      setPosition({ left, top: Math.max(12, Math.min(anchor.top, window.innerHeight - height - 12)), width });
    };
    place(); const observer = new ResizeObserver(place); if (boxRef.current) observer.observe(boxRef.current);
    return () => observer.disconnect();
  }, [anchor]);
  return createPortal(<aside ref={boxRef} className="sheet-web-preview" role="tooltip" aria-label={source.name + ' 웹 소스 상세'} style={position}
    onMouseEnter={keep} onMouseLeave={leave} onFocusCapture={keep}
    onBlur={event => { if (!boxRef.current?.contains(event.relatedTarget)) leave(); }}>
    <div className="sheet-web-preview-body">
      <span className={'wk k-' + source.kind}>{WEB_KIND[source.kind]}</span>
      <h3>{metadata?.title || source.name}</h3>
      <span className="sheet-web-publisher">{metadata?.site || source.org} · {hostOf(source.url)}</span>
      {metadata?.desc && <p>{metadata.desc}</p>}
      <dl><dt>참고할 내용</dt><dd>{source.what}</dd></dl>
      <a href={source.url} target="_blank" rel="noopener noreferrer">웹 소스 열기<Icon name="ext" size={12} /></a>
    </div>
  </aside>, document.body);
}

function WebSourceLink({ source }) {
  const [metadata, setMetadata] = useState(null), [loading, setLoading] = useState(true), [anchor, setAnchor] = useState(null);
  const showTimer = useRef(), hideTimer = useRef(), box = useRef();
  const clear = () => { clearTimeout(showTimer.current); clearTimeout(hideTimer.current); };
  const keep = () => clearTimeout(hideTimer.current);
  const hide = () => { clear(); setAnchor(null); };
  const leave = () => { clear(); hideTimer.current = setTimeout(() => setAnchor(null), 180); };
  const show = (element, immediate = false) => {
    clear(); showTimer.current = setTimeout(() => { if (element.isConnected) setAnchor(element.getBoundingClientRect()); }, immediate ? 0 : 240);
  };
  useEffect(() => {
    let live = true; setMetadata(null); setLoading(true);
    linkTags.resolve(source.url, { icon: true }).then(value => { if (live) { setMetadata(value); setLoading(false); } });
    return () => { live = false; clear(); };
  }, [source.url]);
  useEffect(() => {
    if (!anchor) return;
    const key = event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); hide(); } };
    const scroll = event => { if (!(event.target instanceof Node) || !box.current?.contains(event.target)) hide(); };
    document.addEventListener('keydown', key, true); window.addEventListener('resize', hide); window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('keydown', key, true); window.removeEventListener('resize', hide); window.removeEventListener('scroll', scroll, true); };
  }, [!!anchor]);
  return <>
    <a className="sheet-web-link" href={source.url} target="_blank" rel="noopener noreferrer" data-web-source={source.id}
      onMouseEnter={event => { if (window.matchMedia('(hover: hover)').matches) show(event.currentTarget); }} onMouseLeave={leave}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) show(event.currentTarget, true); }}
      onBlur={event => { if (box.current?.contains(event.relatedTarget)) keep(); else leave(); }} onClick={hide}>
      <WebIcon source={source} metadata={metadata} loading={loading} />
      <span className="sheet-web-caption">
        <b>{metadata?.src === 'web' ? metadata.title : source.name}</b>
        <span title={source.url}>{shortAddress(source.url)}</span>
      </span>
    </a>
    {anchor && <WebPreview source={source} metadata={metadata} anchor={anchor} boxRef={box} keep={keep} leave={leave} />}
  </>;
}

export function WebSources({ sources }) {
  return <div className="sheet-web-grid">{sources.map(source => <WebSourceLink key={source.id} source={source} />)}</div>;
}
