import { GROUPS, KIND_GROUP, KIND_NAME, rankImages, fileToStoredImage, suggestImages } from '../services/images.js';
export { GROUPS, KIND_GROUP, KIND_NAME, rankImages, fileToStoredImage, suggestImages };
import React, { useState, useRef } from 'react';
import { Icon, Modal, toast } from './common.jsx';
import { IMAGE_DB } from '../services/catalog.js';
import { searchImages } from '../services/search.js';
/* =========================================================
   Image picker — search catalog images or drop a file
   ========================================================= */
export function ImagePicker({ slot, current, models = [], onPick, onClose }) {
  const [group, setGroup] = useState('');
  const [q, setQ] = useState('');
  const [fit, setFit] = useState((current && current.fit) || (slot && KIND_GROUP[slot.kind] === 'cut' ? 'contain' : 'cover'));
  const [over, setOver] = useState(false);
  const fileRef = useRef(null);
  const list = rankImages(searchImages(IMAGE_DB, q, group), { models, kind: slot && slot.kind, hint: slot && slot.hint });
  const take = async (file) => { const r = await fileToStoredImage(file); if (!r) { toast('이미지 파일만 넣을 수 있어요', 'warn'); return; } onPick({ ...r, fit }); };
  return (
    <Modal size="wide" onClose={onClose} title="이미지 넣기" sub={(slot && slot.hint ? '“' + slot.hint + '” 자리 · ' : '') + (slot && KIND_NAME[slot.kind] ? KIND_NAME[slot.kind] + ' 칸' : '이미지 칸') + ' — 라이브러리에서 고르거나 파일을 끌어다 놓으세요.'}
      footer={<>
        <div className="seg" role="group" aria-label="맞춤">
          <button aria-pressed={fit === 'cover'} onClick={() => setFit('cover')}>칸 채우기</button>
          <button aria-pressed={fit === 'contain'} onClick={() => setFit('contain')}>전체 보이기</button>
        </div>
        <span className="sp" />
        {current && <button className="btn btn-ghost btn-danger" onClick={() => onPick(null)}><Icon name="trash" size={14} />이미지 비우기</button>}
        <button className="btn" onClick={onClose}>닫기</button>
      </>}>
      <div className={'dropzone' + (over ? ' over' : '')} style={{ padding: '16px 18px', flexDirection: 'row', justifyContent: 'center', gap: "var(--space-14px)" }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files && e.dataTransfer.files[0]); }}>
        <Icon name="upload" size={22} />
        <span style={{ textAlign: 'left' }}><b style={{ fontSize: "var(--text-14px)" }}>내 이미지 끌어다 놓기</b><br /><span className="faint" style={{ fontSize: "var(--text-12px)" }}>PNG · JPG · WEBP — 큰 사진은 1600px로 줄여서 이 브라우저에 보관해요</span></span>
        <button className="btn btn-sm" onClick={() => fileRef.current && fileRef.current.click()}>파일 고르기</button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => take(e.target.files && e.target.files[0])} />
      </div>
      <div className="pk-bar">
        <div className="seg" role="group" aria-label="분류">{GROUPS.map(([k, l]) => <button key={k} aria-pressed={group === k} onClick={() => setGroup(k)}>{l}</button>)}</div>
        <div className="pk-search"><label className="sr" htmlFor="im-q">이미지 검색</label><input id="im-q" data-autofocus className="input" value={q} placeholder="모델명 · 장면 (예: QM55C, 드라이브스루, 매장)" onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="imgrid">
        {list.map((im) => (
          <button key={im.pid} className="imgopt" onClick={() => onPick({ src: im.src, name: im.desc, fit, pid: im.pid })}>
            <span className="th"><img src={im.src} alt={im.desc} loading="lazy" style={{ objectFit: im.group === 'cut' ? 'contain' : 'cover' }} /></span>
            <span className="c">{im.desc}</span>
            <span className="g">{im.groupName}{im.model ? ' · ' + im.model : ''}{models.includes(String(im.model).toUpperCase()) ? ' · 연결 제품' : ''}</span>
          </button>
        ))}
        {!list.length && <div className="pk-empty" style={{ gridColumn: '1 / -1' }}>맞는 이미지가 없어요. 파일을 직접 넣어 보세요.</div>}
      </div>
    </Modal>
  );
}

