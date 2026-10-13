import { useState } from 'react';
import { Icon } from '../../../components/common/Icon.jsx';
import { Modal } from '../../../components/common/Modal.jsx';
import { toast } from '../../../components/common/Toast.jsx';
import { exportPptx, slidesOf, saveBlob, safeName } from '../../../features/pptx/index.js';

/** 지금 보이는 목록 전체를 PPTX 한 파일로 — 파일 이름 · 진행률 · 오류 표시. */
export function ExportListModal({ list, scope, onClose }) {
  const [name, setName] = useState(safeName('Winmate 레이아웃 템플릿' + (scope ? ' · ' + scope.replace(/[“”]/g, '') : '')));
  const [st, setSt] = useState(null); // {n, total} 진행 중 | {err}
  const busy = st && st.total != null;
  const run = async () => {
    setSt({ n: 0, total: list.length });
    try {
      const blob = await exportPptx(slidesOf(list), { title: name, onProgress: (n, total) => setSt({ n, total }) });
      const r = await saveBlob(blob, safeName(name) + '.pptx');
      if (r.ok) { toast(safeName(name) + '.pptx 저장했어요'); onClose(); } else setSt({ err: r.err });
    } catch (e) { console.error(e); setSt({ err: '만드는 중 문제가 생겼어요: ' + (e && e.message ? e.message : e) }); }
  };
  return (
    <Modal size="narrow" onClose={busy ? () => {} : onClose} title="이 목록 PPTX로 받기" sub="지금 보이는 레이아웃을 예시 문구 그대로 한 파일에 담아요. 글자는 텍스트 상자로 들어가 바로 고칠 수 있어요."
      footer={<>
        <span className="note num">{list.length}장 · 16:9</span>
        <span className="sp" />
        <button className="btn" disabled={busy} onClick={onClose}>닫기</button>
        <button className="btn btn-primary" disabled={busy || !list.length} onClick={run}>{busy ? <span className="spin" /> : <Icon name="download" size={15} />}{busy ? '만드는 중…' : 'PPTX 만들기'}</button>
      </>}>
      <div className="field"><label htmlFor="tl-ex-name">파일 이름</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input id="tl-ex-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /><span className="faint num">.pptx</span></div>
      </div>
      {busy && (
        <div className="field" aria-live="polite">
          <div className="progress"><i style={{ width: Math.round((st.n / Math.max(1, st.total)) * 100) + '%' }} /></div>
          <span className="faint num" style={{ fontSize: 12 }}>{st.n} / {st.total}장 변환</span>
        </div>
      )}
      {st && st.err && <div className="hint" style={{ color: 'var(--warn)' }}><Icon name="alert" size={14} />{st.err}</div>}
    </Modal>
  );
}
