import { useEffect, useId, useRef } from 'react';
import { Icon } from './icons';

const statuses = {
  unchecked: ['미점검', 'neutral'], uncertain: ['확인 필요', 'amber'], refresh: ['갱신 권장', 'amber'], fresh: ['최신 확인', 'green'],
  error: ['점검 실패', 'red'], review: ['반영 후 검토', 'blue'], indexed: ['등록됨', 'green'], archived: ['보관됨', 'neutral'],
  pending: ['분석 대기', 'amber'], needs_review: ['검토 필요', 'amber'], analysis_failed: ['분석 실패', 'red'],
  queued: ['대기 중', 'neutral'], running: ['진행 중', 'blue'], succeeded: ['완료', 'green'], failed: ['실패', 'red'],
  partial: ['일부 미완료', 'amber'], interrupted: ['실행 중단', 'amber'], cancelled: ['취소됨', 'neutral'],
  active: ['적용됨', 'green'], superseded: ['이전 버전', 'neutral'], rolled_back: ['복구됨', 'neutral'],
};
export function Badge({ status, children }) {
  const [label, color] = statuses[status] || [status, 'neutral'];
  return <span className={'badge ' + color}><i/>{children || label}</span>;
}
export function Button({ icon, children, className = '', variant = '', busy, ...props }) {
  return <button className={`button ${variant} ${className}`} disabled={busy || props.disabled} {...props}>{icon && <Icon name={busy ? 'refresh' : icon} size={16} className={busy ? 'spin' : ''}/>} {children}</button>;
}
export function IconButton({ icon, label, ...props }) { return <button type="button" className="icon-button" title={label} aria-label={label} {...props}><Icon name={icon} size={18}/></button>; }
export function Empty({ icon = 'folder', title, children, action }) { return <div className="empty"><span className="empty-icon"><Icon name={icon} size={26}/></span><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>; }
export function Loading() { return <div className="loading" role="status"><span className="loader"/> 불러오는 중</div>; }
export function ErrorBox({ error, retry }) { return <div className="error-box" role="alert"><Icon name="alert"/><span>{error}</span>{retry && <Button onClick={retry}>다시 시도</Button>}</div>; }
export function Modal({ title, subtitle, children, close, footer, wide = false }) {
  const ref = useRef(), titleId = useId();
  useEffect(() => {
    const before = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current.focus();
    const handler = event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const nodes = [...ref.current.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select,textarea,[tabindex="0"]')].filter(n => n.offsetParent !== null);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handler); before?.isConnected && before.focus(); };
  }, []);
  return <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && close()}><section className={'modal ' + (wide ? 'wide' : '')} ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId}><header className="modal-header"><div><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><IconButton icon="close" label="닫기" onClick={close}/></header><div className="modal-body">{children}</div>{footer && <footer className="modal-footer">{footer}</footer>}</section></div>;
}
export function Details({ title = '기술 상세', value }) { return <details className="technical"><summary>{title}<Icon name="down" size={14}/></summary><pre>{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre></details>; }
export function Field({ label, value }) { return <div className="field"><dt>{label}</dt><dd>{value || '기록 없음'}</dd></div>; }
export function Progress({ value = 0 }) { return <div className="progress-track"><div style={{ width: Math.max(3, value) + '%' }}/></div>; }
export function Toggle({ checked, onChange, label, disabled }) { return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={'toggle ' + (checked ? 'on' : '')} onClick={() => onChange(!checked)}><span/></button>; }
export function Pager({ offset, total, size = 12, onChange }) { return <div className="pager"><span>{total ? Math.min(offset + 1, total) : 0}–{Math.min(offset + size, total)} / {Number(total).toLocaleString('ko-KR')}개</span><div><Button disabled={!offset} onClick={() => onChange(Math.max(0, offset - size))}>이전</Button><Button disabled={offset + size >= total} onClick={() => onChange(offset + size)}>다음</Button></div></div>; }
