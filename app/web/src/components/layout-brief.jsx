// 직접 넣은 장의 방향 확인 팝업 — Storyboard 카드 가운데 '!' 버튼(storyboard.jsx)으로 연다.
// 추론한 내용(핵심 메시지 · 다룰 제품 · 솔루션 · 담을 내용)을 @태그가 든 편집칸에 그대로 보여 준다: 따로 '수정' 버튼 없이 바로 고쳐 쓴다.
// '확인하고 진행'을 누르면 그 내용을 방향으로 장 채우기가 시작된다(services/layout-brief.js confirmBrief → layout-context.js).
import React, { useEffect, useRef, useState } from 'react';
import { Icon, Modal, MentionEditor, partHue, toast } from './common.jsx';
import { L } from '../services/catalog.js';
import { PARTS, classifyPart } from '../domain/proposals/parts.js';
import { FitSlide } from '../domain/slides/Slide.jsx';
import { useDetailPeek } from './reference-detail.jsx';
import { briefWaiting, sheetShowsSample } from '../domain/slides/context-policy.js';
import { SampleRibbon } from './sample-ribbon.jsx';
import { saveBriefDraft, confirmBrief, retryBrief } from '../services/layout-brief.js';
import '../styles/layout-brief.css';

const locate = (p, uid) => { for (const part of p?.parts || []) { const x = (part.layouts || []).find((y) => y.uid === uid); if (x) return { part, x }; } return null; };

export function LayoutBriefPopup({ p, uid, onClose }) {
  const at = locate(p, uid);
  const brief = at?.x.brief;
  const [segs, setSegs] = useState(() => brief?.segs || []);
  const peek = useDetailPeek(p);
  // 다시 추론해 새 결과가 들어오면 편집칸도 새 결과로
  const seen = useRef(brief?.at);
  useEffect(() => { if (brief && brief.at !== seen.current) { seen.current = brief.at; setSegs(brief.segs || []); } }, [brief?.at]); // eslint-disable-line react-hooks/exhaustive-deps
  // 장이 빠졌거나(×) 이미 채우기로 넘어갔으면 닫는다
  const gone = !at || !briefWaiting(at.x);
  useEffect(() => { if (gone) onClose(); }, [gone]); // eslint-disable-line react-hooks/exhaustive-deps
  if (gone) return null;
  const { part, x } = at;
  const l = L[x.f] || { name: x.f };
  const type = part.type || classifyPart(part.name);
  const close = () => { peek.hide(); saveBriefDraft(p.id, uid, segs); onClose(); };
  const go = () => {
    peek.hide();
    confirmBrief(p.id, uid, segs);
    toast('‘' + l.name + '’을 확인한 내용대로 채우고 있어요');
    onClose();
  };
  const retry = () => { peek.hide(); retryBrief(p.id, uid); };
  return (
    <Modal size="lb-modal" onClose={close} bodyClass="mbody lb-body"
      title={<span className="lb-title">이 장에 넣을 내용 확인 <span className={'tag pt ' + partHue(type)}>{part.name || (PARTS[type] ? PARTS[type].label : '목차')}</span></span>}
      sub={l.name}
      footer={<>
        <span className="sp" />
        <button type="button" className="btn" onClick={close}>나중에</button>
        <button type="button" className="btn btn-primary lb-go" onClick={go}><Icon name="sparkle" size={14} />확인하고 진행</button>
      </>}>
      <div className="lb-grid">
        <figure className="lb-slide">
          <div className="lb-thumb sample-host"><FitSlide f={x.f} ov={x.ov} />{sheetShowsSample(x) && <SampleRibbon />}</div>
          <figcaption><b>{l.name}</b>{l.when ? <span>{l.when}</span> : null}</figcaption>
        </figure>
        <div className="lb-edit">
          {brief?.error && (
            <div className="lb-err" role="alert">
              <Icon name="alert" size={14} /><span>내용을 추론하지 못했어요 · {brief.error}</span>
              <button type="button" className="btn btn-sm" onClick={retry}><Icon name="refresh" size={13} />다시 추론</button>
            </div>
          )}
          <MentionEditor id="lb-ed" label="이 장에 넣을 내용" value={segs} onChange={setSegs} peek={peek}
            placeholder="@제품 · @솔루션 · 담을 내용" />
        </div>
      </div>
      {peek.node}
    </Modal>
  );
}
