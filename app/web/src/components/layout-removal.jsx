import React, { useId, useRef, useState } from 'react';
import { getProposal, removeLayout } from '../repositories/proposals.js';
import { L } from '../services/catalog.js';
import { Modal, toast } from './common.jsx';
import '../styles/layout-removal.css';

/** The detail footer and Storyboard X share one confirmation and exact-instance removal. */
export function useLayoutRemoval(proposalId, { onRemoved } = {}) {
  const [target, setTarget] = useState(null);
  const confirming = useRef(false);
  const descriptionId = useId();
  const cancel = () => setTarget(null);
  const request = layoutUid => {
    const proposal = getProposal(proposalId);
    const layout = proposal?.parts.flatMap(part => part.layouts).find(item => item.uid === layoutUid);
    if (!layout) return;
    confirming.current = false;
    setTarget({ uid:layoutUid, name:L[layout.f]?.name || 'PPT 레이아웃' });
  };
  const confirm = () => {
    if (!target || confirming.current) return;
    confirming.current = true;
    const removed = removeLayout(proposalId, target.uid);
    setTarget(null);
    if (removed) {
      toast(target.name + ' 선택을 해제했어요');
      onRemoved?.(target.uid);
    } else toast('이미 선택 해제된 레이아웃이에요');
  };
  const keys = event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); cancel(); return; }
    if (event.key !== 'Tab') return;
    const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const confirmation = target ? (
    <Modal title="레이아웃 선택을 해제할까요?" size="narrow" role="alertdialog" describedBy={descriptionId}
      onClose={cancel} onKeyDown={keys} bodyClass="mbody layout-removal-confirm"
      footer={<><button type="button" className="btn" data-autofocus onClick={cancel}>취소</button><button type="button" className="btn btn-danger" onClick={confirm}>선택 해제</button></>}>
      <div id={descriptionId}><strong>{target.name}</strong><p>이 제안서에서 해당 장표와 입력한 내용을 삭제해요.</p></div>
    </Modal>
  ) : null;
  return { request, confirmation };
}
