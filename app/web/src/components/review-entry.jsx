import React, { useState, useRef } from 'react';
import { requireLogin } from '../api/session.js';
import { Icon, toast } from './common.jsx';
import { ACCEPT, fileKind } from '../domain/review/parse.js';
import { CRITERIA } from '../domain/review/criteria.js';
import { useReviews, startReview } from '../repositories/reviews.js';
const NCRIT = CRITERIA.length;

export function useFileDrop(onFiles) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  return {
    over,
    bind: {
      onDragEnter: (e) => { if (!Array.from(e.dataTransfer.types || []).includes('Files')) return; e.preventDefault(); depth.current++; setOver(true); },
      onDragOver: (e) => { if (!Array.from(e.dataTransfer.types || []).includes('Files')) return; e.preventDefault(); },
      onDragLeave: () => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); },
      onDrop: (e) => { e.preventDefault(); depth.current = 0; setOver(false); if (e.dataTransfer.files && e.dataTransfer.files.length) onFiles(e.dataTransfer.files); },
    },
  };
}
export function checkFiles(files) {
  const list = Array.from(files || []);
  const ok = list.filter((f) => ['pptx', 'pdf', 'docx', 'txt'].includes(fileKind(f.name)));
  if (!ok.length) {
    const lg = list.find((f) => fileKind(f.name) === 'legacy');
    toast(lg ? `${lg.name} 형식은 읽을 수 없어요 · PPTX · PDF · DOCX로 저장해서 올려 주세요` : 'PPTX · PDF · DOCX · TXT 파일을 올려 주세요', 'warn');
    return null;
  }
  const big = ok.find((f) => f.size > 150 * 1048576);
  if (big) { toast(big.name + ' 파일이 너무 커요 (150MB 이하)', 'warn'); return null; }
  return ok.slice(0, 2);
}

// ---------------------------------------------------------------- home entry
export function ReviewEntry({ go }) {
  const n = useReviews((s) => s.reviews.length);
  const last = useReviews((s) => s.reviews[0]);
  const inp = useRef(null);
  const onFiles = (files) => { if (!requireLogin()) return; const ok = checkFiles(files); if (!ok) return; const id = startReview(ok); go({ name: 'review', id }); };
  const { over, bind } = useFileDrop(onFiles);
  return (
    <div className={'rv-entry' + (over ? ' over' : '')} {...bind}>
      <button className="rv-entry-hit" onClick={() => { if (requireLogin()) inp.current.click(); }} aria-label="제안서 검토 — 파일을 골라 평가 시작">
        <span className="rv-entry-ic"><Icon name="clipCheck" size={22} /></span>
        <span className="rv-entry-t">
          <b>제안서 검토</b>
          <span>{over ? '여기에 놓으면 바로 평가를 시작해요' : `${NCRIT}개 검토 기준으로 점수와 근거를 매겨요`}</span>
          <span className="rv-entry-fmt">PPTX · PDF · DOCX · PPTX와 같은 내용의 PDF를 함께 올리면 실제 화면 최대 4장을 함께 봐요</span>
        </span>
        <span className="rv-entry-cta"><Icon name="upload" size={16} />파일 올리기</span>
      </button>
      <button className="rv-hist-btn" onClick={() => go({ name: 'reviews' })} title="검토한 제안서 보기">
        <Icon name="clock" size={15} />평가 내역<span className="num">{n}</span>
      </button>
      {last && last.status === 'done' && last.agg && !over && (
        <span className="sr">최근 평가 {last.title} {last.agg.overall}점</span>
      )}
      <input ref={inp} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
}

