import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { deleteProposal, getProposal } from '../repositories/proposals.js';
import { setHistoryPinned, useHistoryPins } from '../repositories/history-preferences.js';
import { Icon, Modal, fmtWhen, toast } from './common.jsx';
import { StoryboardSharing, useStoryboardSharing } from './storyboard-sharing.jsx';
import { historyPath } from '../services/shared-path.js';
import '../styles/sidebar-history.css';

function HistoryMenu({ anchor, title, pinned, onClose, onDelete, onPin, onShare }) {
  const ref = useRef(null);
  const [position, setPosition] = useState({ left: -9999, top: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect(), r = ref.current.getBoundingClientRect();
      setPosition({ left: Math.max(8, Math.min(a.right - r.width, innerWidth - r.width - 8)),
        top: a.bottom + 6 + r.height <= innerHeight - 8 ? a.bottom + 6 : Math.max(8, a.top - r.height - 6) });
    };
    place(); ref.current.querySelector('button')?.focus({ preventScroll: true });
    const outside = event => { if (!ref.current?.contains(event.target) && !anchor.contains(event.target)) onClose(); };
    const scroll = event => { if (!ref.current?.contains(event.target)) onClose(); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', place); window.removeEventListener('scroll', scroll, true); };
  }, [anchor]);
  const keys = event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(true); return; }
    if (event.key === 'Tab') { onClose(); return; }
    const buttons = [...ref.current.querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % buttons.length : event.key === 'ArrowUp' ? (index + buttons.length - 1) % buttons.length : null;
    if (next != null) { event.preventDefault(); buttons[next].focus(); }
  };
  return createPortal(<div ref={ref} className="sb-history-menu" role="menu" aria-label={title + ' 더보기 메뉴'} style={position} onKeyDown={keys}>
    <button type="button" role="menuitem" className="danger" onClick={onDelete}><Icon name="trash" />삭제</button>
    <button type="button" role="menuitem" onClick={onPin}><Icon name="pin" />{pinned ? '고정 해제' : '고정'}</button>
    <button type="button" role="menuitem" onClick={onShare}><Icon name="link" />공유</button>
  </div>, document.body);
}

function HistoryShare({ p, onClose }) {
  const sharing = useStoryboardSharing(p);
  return <StoryboardSharing p={p} sharing={sharing} dialogOnly onClose={onClose} />;
}

export function SidebarHistory({ list, route, go, Flow }) {
  const pins = useHistoryPins();
  const [menu, setMenu] = useState(null), [removing, setRemoving] = useState(null), [sharing, setSharing] = useState(null);
  const descriptionId = useId();
  const confirming = useRef(false);
  const byId = new Map(list.map(p => [p.id, p]));
  const ordered = [...pins.map(id => byId.get(id)).filter(Boolean), ...list.filter(p => !pins.includes(p.id))];
  const target = menu && byId.get(menu.id);
  const closeMenu = focus => { if (focus) menu?.anchor.focus({ preventScroll: true }); setMenu(null); };
  useEffect(() => { if (menu && !target) setMenu(null); }, [!!target]);
  const confirmDelete = () => {
    if (!removing || confirming.current) return;
    confirming.current = true;
    if (route.id === removing.id || route.token && route.token === removing._share?.token) go({ name: 'home' });
    deleteProposal(removing.id); setRemoving(null); toast('제안서 히스토리에서 삭제했어요');
  };
  const confirmKeys = event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); setRemoving(null); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...event.currentTarget.querySelectorAll('button')], first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <>
    <nav className="sb-list" aria-label="제안서 히스토리">
      {ordered.map((p, index) => {
        const title = p.title || '새 제안서', pinned = pins.includes(p.id);
        const current = route.id === p.id || !!route.token && route.token === p._share?.token;
        const expanded = menu?.id === p.id;
        return <React.Fragment key={p.id}><div className={'sb-history-row' + (pinned ? ' pinned' : '') + (current ? ' current' : '') + (expanded ? ' menu-open' : '')} data-proposal-id={p.id} data-end-path={historyPath(p.id)}>
          <button type="button" className="sb-item" aria-current={current ? 'page' : undefined} onClick={() => go({ name: 'proposal', id: p.id })}>
            <span className="t">{title}</span><span className="when">{fmtWhen(p.updatedAt)}</span>
            <span className="s"><Flow p={p} />{p.customer && <span className="sb-cust">{p.customer}</span>}</span>
          </button>
          <span className="sb-history-actions">
            {pinned && <span className="sb-history-pin" role="img" aria-label="고정됨"><Icon name="pin" size={15} /></span>}
            <button type="button" className="sb-history-more" aria-label={title + ' 더보기'} aria-haspopup="menu" aria-expanded={expanded}
              onClick={event => { if (expanded) closeMenu(true); else setMenu({ id: p.id, anchor: event.currentTarget }); }}><Icon name="dots" size={18} /></button>
          </span>
        </div>{pinned && !pins.includes(ordered[index + 1]?.id) && <div className="sb-history-divider" role="separator" aria-label="고정된 제안서 구분" />}</React.Fragment>;
      })}
    </nav>
    {target && <HistoryMenu anchor={menu.anchor} title={target.title || '새 제안서'} pinned={pins.includes(target.id)} onClose={closeMenu}
      onDelete={() => { closeMenu(true); confirming.current = false; setRemoving(target); }}
      onPin={() => { const pinned = !pins.includes(target.id); setHistoryPinned(target.id, pinned); closeMenu(true); toast(pinned ? '히스토리 맨 위에 고정했어요' : '고정을 해제했어요'); }}
      onShare={() => { closeMenu(true); setSharing(target); }} />}
    {removing && <Modal title="제안서 히스토리에서 삭제할까요?" size="narrow" role="alertdialog" describedBy={descriptionId} onClose={() => setRemoving(null)} onKeyDown={confirmKeys}
      footer={<><button type="button" className="btn" data-autofocus onClick={() => setRemoving(null)}>취소</button><button type="button" className="btn btn-danger" onClick={confirmDelete}>삭제</button></>}>
      <div id={descriptionId}><strong>{removing.title || '새 제안서'}</strong><p>이 브라우저의 제안서 히스토리에서 삭제해요.{removing._share && ' 공유된 Storyboard 링크는 유지돼요.'}</p></div>
    </Modal>}
    {sharing && <HistoryShare key={sharing.id} p={getProposal(sharing.id) || sharing} onClose={() => setSharing(null)} />}
  </>;
}
