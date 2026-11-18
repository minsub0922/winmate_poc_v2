// 조감도 스튜디오 팝업 — Storyboard 매칭 카드의 3D 공간 조감도를 누르면 페이지를 옮기지 않고 그 위에 스튜디오(SpatialPage)를 띄운다.
// 닫기는 스튜디오 머리의 '닫기'(저장 대기 중인 변경을 저장한 뒤 닫음) — Esc · 바깥 클릭으로는 닫지 않는다(편집하다 실수로 닫히지 않게).
// 스튜디오 안의 화면 이동: 다른 조감도(spatial + id)는 팝업 안에서 바꾸고, 그 밖의 이동은 팝업을 닫고 넘긴다.
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SpatialPage } from '../pages/SpatialStudioPage.jsx';

export function SpatialStudioPopup({ id, onClose, go }) {
  const [cur, setCur] = useState(id);
  useEffect(() => { setCur(id); }, [id]);
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus({ preventScroll: true });
    return () => { prev && prev.focus && prev.focus({ preventScroll: true }); };
  }, []);
  const popGo = (route) => {
    if (route && route.name === 'spatial' && route.id) { setCur(route.id); return; }
    onClose();
    if (route && route.name !== 'spatial') go(route);
  };
  return createPortal(
    <div className="mback sp-studio-back">
      <div ref={ref} tabIndex={-1} className="modal sp-studio-modal" role="dialog" aria-modal="true" aria-label="조감도 스튜디오">
        <SpatialPage id={cur} go={popGo} popup={{ onClose }} />
      </div>
    </div>,
    document.body,
  );
}
