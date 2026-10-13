import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.jsx';

// 열린 모달 순서 — Esc는 맨 위 모달만 닫는다.
const MODAL_STACK = [];

/**
 * 대화상자. body 에 포털로 붙고, 바깥(어두운 영역) 클릭 · Esc 로 닫힌다. 닫히면 열기 전 포커스로 돌아간다.
 * size: '' (720) | 'narrow' (520) | 'wide' (1180)
 */
export function Modal({ title, sub, onClose, children, footer, size = '', bodyClass = 'mbody', bodyStyle }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    const me = {};
    MODAL_STACK.push(me);
    const onKey = (e) => {
      if (e.key !== 'Escape' || MODAL_STACK[MODAL_STACK.length - 1] !== me) return;
      if (e.target && e.target.isContentEditable) return;
      e.stopPropagation(); closeRef.current && closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    setTimeout(() => { if (!ref.current) return; const el = ref.current.querySelector('[data-autofocus]') || ref.current; el.focus({ preventScroll: true }); }, 30);
    return () => { MODAL_STACK.splice(MODAL_STACK.indexOf(me), 1); document.removeEventListener('keydown', onKey); prev && prev.focus && prev.focus({ preventScroll: true }); };
  }, []);
  return createPortal(
    <div className="mback" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current && closeRef.current(); }}>
      <div ref={ref} tabIndex={-1} className={'modal ' + size} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        {title != null && (
          <div className="mhead">
            <div style={{ minWidth: 0 }}><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
            <button className="btn btn-ghost btn-icon x" onClick={onClose} aria-label="닫기"><Icon name="x" /></button>
          </div>
        )}
        <div className={bodyClass} style={bodyStyle}>{children}</div>
        {footer && <div className="mfoot">{footer}</div>}
      </div>
    </div>, document.body);
}
