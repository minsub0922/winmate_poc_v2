import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../components/common/Icon.jsx';
import { Modal } from '../../../components/common/Modal.jsx';
import { toast } from '../../../components/common/Toast.jsx';
import { FitSlide } from '../../../components/slide/Slide.jsx';
import { LayoutMeta } from '../../../components/layout/LayoutMeta.jsx';
import { DECK } from '../../../lib/catalog.js';
import { PARTS } from '../../../lib/parts.js';
import { exportPptx, slidesOf, saveBlob, safeName } from '../../../features/pptx/index.js';

/**
 * 레이아웃 크게 보기 — 큰 미리보기 · 메타데이터 · 이전/다음(← → 키) · 이 장만 PPTX로 받기.
 *   list   지금 화면에 보이는 순서의 레이아웃 목록      index  열린 레이아웃 위치
 *   notes  (선택) 장마다 붙일 설명 — noteLabel 제목으로 보여 준다
 *   ovs    (선택) 장마다 채운 값 — 있으면 예시 문구 대신 그 값으로 그리고 받는다
 */
export function TemplateDetailModal({ list, index, onNav, onClose, notes = null, noteLabel = '이 장의 역할', ovs = null }) {
  const l = list[index];
  const ov = ovs ? ovs[index] : null;
  const [busy, setBusy] = useState(false);
  const go = (d) => { const n = index + d; if (n >= 0 && n < list.length) onNav(n); };
  const goRef = useRef(go); goRef.current = go;
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goRef.current(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goRef.current(1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const download = async () => {
    setBusy(true);
    try {
      const blob = await exportPptx(ov ? [{ f: l.f, ov, part: PARTS[l.p] ? PARTS[l.p].label : '' }] : slidesOf([l]), { title: l.name });
      const r = await saveBlob(blob, safeName('Winmate ' + l.name) + '.pptx');
      if (r.ok) toast(l.name + ' PPTX를 저장했어요'); else toast(r.err, 'warn');
    } catch (e) { console.error(e); toast('PPTX를 만들지 못했어요: ' + (e && e.message ? e.message : e), 'warn'); }
    setBusy(false);
  };
  const pt = PARTS[l.p];
  return (
    <Modal size="wide" onClose={onClose}
      title={<span className="tl-dt">{l.name}</span>}
      sub={l.when || l.g}
      footer={<>
        <span className="note num">{index + 1} / {list.length}<span className="tl-keys"> · ← → 키로 넘겨 보기</span></span>
        <span className="sp" />
        <button className="btn" onClick={onClose}>닫기</button>
        <button className="btn btn-primary" disabled={busy} onClick={download}>{busy ? <span className="spin" /> : <Icon name="download" size={15} />}{busy ? '만드는 중…' : 'PPTX로 받기'}</button>
      </>}>
      <div className="tl-detail">
        <div className="tl-dl">
          <FitSlide key={l.f} f={l.f} ov={ov} pageNo={ov ? index + 1 : undefined} max={980} />
          <div className="tl-nav">
            <button className="btn btn-sm" disabled={index === 0} onClick={() => go(-1)} aria-label="이전 레이아웃"><Icon name="chevL" size={14} />이전</button>
            <span className="faint num" style={{ fontSize: 12 }}>{pt ? pt.label : ''}{DECK[l.c] ? ' · ' + DECK[l.c].label : ''}</span>
            <button className="btn btn-sm" disabled={index >= list.length - 1} onClick={() => go(1)} aria-label="다음 레이아웃">다음<Icon name="chev" size={14} /></button>
          </div>
        </div>
        <div className="tl-dr">
          {notes && notes[index] ? <div className="tl-ex tl-role"><span className="lbl">{noteLabel}</span><p>{notes[index]}</p></div> : null}
          {l.hl && !ov && <div className="tl-ex"><span className="lbl">예시 제목</span><p>{l.hl}</p>{l.sample ? <span className="faint" style={{ fontSize: 12 }}>예시 고객 · {l.sample}</span> : null}</div>}
          <LayoutMeta l={l} />
          <p className="hint"><Icon name="info" size={14} /><span>제안서에서 쓰려면 Storyboard 파트의 ‘레이아웃 추가’ → 검색에서 “{l.name}”로 찾으면 돼요.</span></p>
        </div>
      </div>
    </Modal>
  );
}
