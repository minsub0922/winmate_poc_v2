import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './common.jsx';

/** Detailed editing instructions appear only on hover, keyboard focus or an explicit tap. */
export function EditorHelp({ own, asCopy }) {
  const [anchor, setAnchor] = useState(null);
  const button = useRef(null), panel = useRef(null), timer = useRef(null);
  const show = () => { clearTimeout(timer.current); setAnchor(button.current.getBoundingClientRect()); };
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setAnchor(null), 140); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!anchor) return;
    const scroll = e => { if (!(e.target instanceof Node) || !panel.current?.contains(e.target)) setAnchor(null); };
    const outside = e => { if (!button.current?.contains(e.target) && !panel.current?.contains(e.target)) setAnchor(null); };
    const resize = () => setAnchor(null);
    window.addEventListener('scroll', scroll, true); window.addEventListener('resize', resize); document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', resize); document.removeEventListener('pointerdown', outside); };
  }, [!!anchor]);
  const width = Math.min(420, window.innerWidth - 24);
  const top = anchor ? Math.max(12, Math.min(anchor.bottom + 10, window.innerHeight - 80)) : 0;
  return <>
    <button ref={button} type="button" className="btn btn-sm ed-help-button" aria-label="고치는 법" aria-describedby={anchor ? 'layout-editor-help' : undefined}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onClick={show}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setAnchor(null); } }}>
      <Icon name="info" size={15} />고치는 법
    </button>
    {anchor && createPortal(<div ref={panel} id="layout-editor-help" className="ed-help-popup" role="tooltip" aria-label="레이아웃 수정 방법"
      style={{ width, left: Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12)), top, maxHeight: Math.max(60, Math.min(650, window.innerHeight - top - 12)) }}
      onMouseEnter={() => clearTimeout(timer.current)} onMouseLeave={hide}>
      <h3>레이아웃 수정 방법</h3>
      <dl>
        <dt>선택 · 이동</dt><dd>마우스를 올리면 선택할 요소가 점선으로 미리 표시돼요. 누르면 선택되고, 끌면 위치가 바뀌어요. 방향키는 1px, Shift와 방향키는 10px씩 이동해요.</dd>
        <dt>크기 · 위치</dt><dd>선택 테두리의 조절점을 끌어 크기를 바꿔요. 오른쪽 속성에서 위치와 너비·높이를 숫자로 조정할 수도 있어요.</dd>
        <dt>글 수정</dt><dd>선택한 글을 한 번 더 누르거나 두 번 누르면 입력할 수 있어요. 오른쪽 ‘글 고치기’도 사용할 수 있어요. Enter는 줄바꿈, Esc는 글 편집 끝내기예요.</dd>
        <dt>이미지 교체</dt><dd>이미지 칸을 선택하고 오른쪽 ‘이미지 바꾸기’를 누르세요. 라이브러리 또는 내 파일에서 사진을 고르고 맞춤 방식을 정할 수 있어요.</dd>
        <dt>색상 · 배경</dt><dd>오른쪽 속성에서 글·도형·배경색을 바꿔요. 선택을 해제하면 전체 색상 바꾸기와 배경 사진·효과를 조절할 수 있어요.</dd>
        <dt>추가 · 삭제 · 복원</dt><dd>슬라이드 아래에 이동·추가·수정·교체를 요청하면 입력창 위 팝업에 변경 작업과 값이 표시돼요. ‘승인’하면 AI가 작업을 다시 분석해 실행하며 ‘취소’하면 원본을 유지해요. 상단 ‘글 상자’와 ‘이미지 칸’으로 요소를 추가해요. 선택 후 Delete 또는 Backspace를 누르면 삭제 확인 팝업이 열려요. 삭제를 확인한 뒤 지우고, 상단 되돌리기·다시 하기로 작업을 취소하거나 복원해요.</dd>
        <dt>저장</dt><dd>하단 ‘저장’을 누르면 수정본이 My 템플릿에 저장돼요. {asCopy ? '원본은 유지하고 수정본을 현재 제안서 장에도 적용해요.' : own ? '현재 My 템플릿을 갱신해요. 별도로 보관하려면 ‘새 템플릿으로 저장’을 사용하세요.' : '기본 레이아웃 원본은 유지하고 수정본을 새 템플릿으로 보관해요.'} 저장 후에는 현재 화면에서 알림으로 확인할 수 있어요.</dd>
      </dl>
    </div>, document.body)}
  </>;
}
