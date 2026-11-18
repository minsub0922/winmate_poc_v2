// Storyboard 목차 추가 팝업 — '추가' 버블(끝의 +) · 버블 사이 +를 누르면 뜬다(사용자 지시 2026-11-16 · 11-17).
//   고를 수 있는 것은 관리자 「전체 파트」 목록의 파트 11개뿐(part_catalog.js CATALOG_PARTS — 관리자 목록 순서 · 이름).
//   한 줄에 파트 버블 + 이름 + 한 줄 설명 + 큰 '추가' 버튼(이미 있으면 같은 크기의 '추가됨'). 줄을 누르면 펼쳐져 그 파트의 장(간지 포함)이
//   이 제안서 업종의 덱에서 보이고(업종은 고른 구성의 업종 → 자동으로 정해진 업종 — services/layout-compose.js partVertical),
//   장에 마우스를 대면 그 장 아래로 크게 본 상세가 뜬다.
//   DSS 가 필요한 파트(공간별 제안 ← 제품 · 솔루션 제안 ← 솔루션 · 구독 상품 제안 ← 구독 · 서비스 ← 서비스)는 그 DSS 가 없으면 '추가' 대신
//   '{DSS} 필요' — 누르면 '먼저 추가해 주세요' + 그 DSS 를 여는 버튼. '추가'를 누르면 바로 닫히고 그 자리에 목차가 놓여 그 목차만 레이아웃을 자동 구성한다(addCatalogPart).
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Modal, toast, partHue } from './common.jsx';
import { Slide } from '../domain/slides/Slide.jsx';
import { L } from '../services/catalog.js';
import { TOCS, loadTocContent, tocContent, tocVerticals } from '../domain/templates/toc_templates.js';
import { CATALOG_PARTS, partLabel, partKey } from '../domain/templates/part_catalog.js';
import { PARTS } from '../domain/proposals/parts.js';
import { addCatalogPart, partSheets, partVertical } from '../services/layout-compose.js';
import { dssLack, dssFolder } from '../services/dss.js';
import '../styles/part-add.css';

const SHEET_W = 248; // 펼친 줄의 장 너비
const HOVER_W = 640; // 마우스를 댄 장의 상세 너비
const hasBatchim = (w) => { const c = String(w || '').trim().slice(-1).charCodeAt(0) - 0xac00; return c >= 0 && c <= 11171 && c % 28 !== 0; };
const ga = (w) => w + (hasBatchim(w) ? '이' : '가');
const eul = (w) => w + (hasBatchim(w) ? '을' : '를');
const roleText = (role) => String(role || '').replace(/^간지 · \d{2} /, '간지 · ');

/** 장 상세 — 마우스를 댄 장 바로 아래(아래 자리가 모자라면 위)에 크게. 마우스는 통과 */
function SheetHover({ x, r }) {
  const ref = useRef(null);
  const [h, setH] = useState(0);
  const W = Math.min(HOVER_W, window.innerWidth - 24);
  useLayoutEffect(() => { setH(ref.current ? ref.current.offsetHeight : 0); }, [x.f]);
  const left = Math.max(12, Math.min(r.left + r.width / 2 - W / 2, window.innerWidth - W - 12));
  const below = r.bottom + 8;
  const top = below + h <= window.innerHeight - 12 || r.top - 8 - h < 12 ? below : r.top - 8 - h;
  return createPortal(
    <div ref={ref} className="hovercard pa-hover" style={{ left, top, width: W }} role="tooltip">
      <b className="pa-hover-t">{roleText(x.role) || (L[x.f] && L[x.f].name) || ''}</b>
      <Slide f={x.f} ov={x.ov} width={W - 26} />
    </div>, document.body);
}

/** 펼친 줄 — 이 업종 덱에서 그 파트의 장 */
function PartSheets({ p, k }) {
  const list = useMemo(() => partSheets(p, k), [p.id, k]);
  const [hover, setHover] = useState(null); // { x, r }
  const t = useRef(null);
  useEffect(() => {
    if (!hover) return undefined;
    const off = () => setHover(null);
    window.addEventListener('scroll', off, true); window.addEventListener('resize', off);
    return () => { window.removeEventListener('scroll', off, true); window.removeEventListener('resize', off); };
  }, [!!hover]);
  useEffect(() => () => clearTimeout(t.current), []);
  const enter = (x, el) => { clearTimeout(t.current); t.current = setTimeout(() => setHover({ x, r: el.getBoundingClientRect() }), 180); };
  const leave = () => { clearTimeout(t.current); setHover(null); };
  if (!list.length) return <p className="pa-none">이 업종에서 보여 줄 장이 없어요</p>;
  return (
    <div className="pa-sheets" role="list" aria-label={partLabel(k) + ' 레이아웃 ' + list.length + '장'}>
      {list.map((x, i) => (
        <figure key={i} className="pa-sheet" role="listitem" onMouseEnter={(e) => enter(x, e.currentTarget.firstElementChild)} onMouseLeave={leave}>
          <div className="pa-sheet-s"><Slide f={x.f} ov={x.ov} width={SHEET_W} lazy /></div>
          <figcaption title={x.role}>{roleText(x.role)}</figcaption>
        </figure>
      ))}
      {hover && <SheetHover x={hover.x} r={hover.r} />}
    </div>
  );
}

/**
 * at: 넣을 자리(p.parts 의 자리 · null 이면 끝) · onClose(addedId?) · onMatch(folder): 매칭 팝업을 그 폴더로 열기(DSS 가 없을 때 '추가')
 */
export function PartAddPopup({ p, at = null, onClose, onMatch }) {
  const [ready, setReady] = useState(() => !!tocContent());
  const [err, setErr] = useState('');
  useEffect(() => {
    if (ready) return undefined;
    let on = true;
    loadTocContent().then(() => on && setReady(true), (e) => { console.error(e); if (on) setErr('목차 자료를 불러오지 못했어요.'); });
    return () => { on = false; };
  }, []);
  const [open, setOpen] = useState(null); // 펼친 파트
  // 펼친 줄은 팝업 위쪽으로 올린다 — 장 아래로 상세가 뜰 자리가 생기게
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector('.modal.part-add .pa-row[data-part="' + open + '"]');
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, [open]);
  const [lackAt, setLackAt] = useState(null); // DSS 가 없어 고를 수 없는 파트의 '추가'를 눌렀을 때
  const [adding, setAdding] = useState(null);
  const vid = ready ? partVertical(p) : null;
  const v = vid ? tocVerticals().find((x) => x.id === vid) : null;
  const short = v ? v.short : null;
  const have = new Set(p.parts.map(partKey).filter(Boolean));
  const add = async (k) => {
    if (adding || have.has(k)) return;
    if (dssLack(p, k)) { setLackAt(k); return; }
    setAdding(k);
    const r = await addCatalogPart(p.id, k, at);
    setAdding(null);
    if (!r.ok) { toast(r.message, 'warn'); return; }
    if (r.started) toast(`‘${partLabel(k, short)}’ 목차를 넣었어요 · 레이아웃을 구성하고 있어요`);
    else toast(`목차를 넣었지만 자동 구성을 시작하지 못했어요 · ${r.message}`, 'warn');
    onClose(r.id);
  };
  return (
    <Modal size="wide part-add" bodyClass="mbody pa-body" title="목차 추가" sub={v ? v.nm : undefined} onClose={() => onClose()}
      footer={<><span className="pa-count num">{CATALOG_PARTS.length}개 파트</span><span className="sp" /><button className="btn" onClick={() => onClose()}>닫기</button></>}>
      {err ? <p className="lyt-err" role="alert"><Icon name="alert" size={14} />{err}</p> : (
        <ul className={'pa-list' + (open ? ' has-open' : '')} aria-label="추가할 수 있는 목차">
          {CATALOG_PARTS.map((k) => {
            const T = TOCS[k]; if (!T) return null;
            const name = partLabel(k, short);
            const added = have.has(k);
            const lack = added ? null : dssLack(p, k);
            const isOpen = open === k;
            const busy = adding === k;
            return (
              <li key={k} className={'pa-row ' + partHue(T.type) + (added ? ' added' : '') + (lack ? ' lack' : '') + (isOpen ? ' open' : '')} data-part={k}>
                <div className="pa-main">
                  <button type="button" className="pa-head" onClick={() => setOpen(isOpen ? null : k)} disabled={!ready} aria-expanded={isOpen} aria-controls={'pa-sheets-' + k}
                    aria-label={name + ' — ' + (isOpen ? '레이아웃 접기' : '레이아웃 보기')}>
                    <span className="pa-bubble" aria-hidden="true"><Icon name={(PARTS[T.type] || PARTS.free).icon} size={20} /></span>
                    <span className="pa-tx"><b>{name}</b><span className="pa-d">{T.goal}</span></span>
                    <Icon name={isOpen ? 'chevU' : 'chevD'} size={16} stroke={2.4} className="pa-chev" />
                  </button>
                  {added ? <span className="pa-add done" role="status" aria-label={name + ' · 이미 있는 목차'}><Icon name="check" size={16} stroke={2.8} />추가됨</span>
                    : lack ? <button type="button" className="pa-add lack" onClick={() => add(k)} disabled={!!adding} aria-label={name + ' 추가 · ' + ga(lack.label) + ' 없어요'}><Icon name="alert" size={15} />{lack.label} 필요</button>
                      : <button type="button" className="btn btn-primary pa-add" onClick={() => add(k)} disabled={!!adding} aria-label={name + ' 추가'}>
                        {busy ? <span className="spin" aria-hidden="true" /> : <Icon name="plus" size={16} stroke={2.8} />}추가
                      </button>}
                </div>
                {lackAt === k && lack && (
                  <div className="pa-lack" role="alert">
                    <Icon name="alert" size={13} /><span>{ga(lack.label)} 없어요 · 먼저 {eul(lack.label)} 추가해 주세요</span>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => { onClose(); onMatch(dssFolder(lack.kind)); }}><Icon name="plus" size={12} stroke={2.6} />{lack.label} 추가</button>
                  </div>
                )}
                {isOpen && <div id={'pa-sheets-' + k}>{ready ? <PartSheets p={p} k={k} /> : null}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
