import { getDownloads as runtimeDownloads } from '../platform/runtime.js';
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { update, loadUi, saveUi } from '../repositories/proposals.js';
import { Icon, Modal, toast, partHue } from './common.jsx';
import { PARTS, classifyPart } from '../domain/proposals/parts.js';
import { L, deckOrder, isCoverSheet } from '../services/catalog.js';
import { Slide, FitSlide } from '../domain/slides/Slide.jsx';
import { exportPptx } from '../domain/slides/export-pptx.js';
import { FavButton } from './fav.jsx';
import { LayoutCompleteButton } from './layout-complete.jsx';
import { ContextSlide } from './context-slide.jsx';
import { contextPending } from '../domain/slides/context-policy.js';
import { layoutIsComplete, inspectLayoutContext } from '../services/layout-context.js';

/** Deck pages in order (표지 first — data.js deckOrder), numbered from 1 */
export function flatSlides(p) {
  return deckOrder(p).map((z, i) => ({ ...z, n: i + 1 }));
}

/** Thumbnail groups: 표지 first (the Storyboard does not show it — this panel is where it lives), then one group per part. */
function stripGroups(list) {
  const out = [];
  for (const z of list) {
    const cov = isCoverSheet(z.x.f) || !!z.s.deck; // the hidden 표지 part (its 목차 · 간지 from an old ‘표지’ part included)
    const k = cov ? 'cover' : z.s.id;
    const g = out[out.length - 1];
    if (g && g.k === k) g.items.push(z);
    else out.push({ k, label: cov ? '표지' : z.s.name, type: cov ? 'cover' : z.s.type || classifyPart(z.s.name), items: [z] });
  }
  return out;
}

/** Right-docked viewer: one big slide + thumbnails grouped by part (표지 first).
 *  readOnly: Best Scenario 상세 보기의 ‘전체 PPT 보기’ — 같은 패널을 보기만(완료 수 · 상태 배지 · PPTX 내보내기 없음, 큰 장을 누르면 onEdit = 크게 보기, Esc로 닫힘). */
export function Viewer({ p, cur, setCur, onClose, onEdit, onExport, readOnly = false }) {
  const list = flatSlides(p);
  const i = Math.max(0, list.findIndex((z) => z.x.uid === cur));
  const it = list[i];
  const strip = useRef(null);
  const ref = useRef(null);
  useEffect(() => { if (!it && list.length) setCur(list[0].x.uid); }, [it, list.length]);
  useEffect(() => {
    const el = strip.current && strip.current.querySelector('[aria-current="true"]');
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [cur]);
  const go = (d) => { const z = list[i + d]; if (z) setCur(z.x.uid); };
  const onKey = (e) => {
    if (e.target.closest('input,textarea,[contenteditable="true"]')) return;
    if (readOnly && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return; } // inside a modal: Esc folds the panel, not the modal
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(-1); }
  };
  const nDone = list.filter((z) => layoutIsComplete(p, z.x)).length;
  const isCov = !!it && (isCoverSheet(it.x.f) || !!it.s.deck);
  const type = it ? (isCov ? 'cover' : it.s.type || classifyPart(it.s.name)) : null;
  const [vw, setVw] = useState(() => loadUi().vw2 || null);
  const mainRef = useRef(null);
  const [box, setBox] = useState({ w: 560, h: 500 });
  useLayoutEffect(() => {
    const el = mainRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [!!it]);
  const sw = Math.max(240, Math.floor(Math.min(box.w - 32, (box.h - 32 - 96) * 16 / 9)));
  const drag = (e) => {
    e.preventDefault();
    const host = ref.current && ref.current.parentElement; if (!host) return;
    const hr = host.getBoundingClientRect();
    const mv = (ev) => { const w = Math.round(Math.max(420, Math.min(hr.width - 280, hr.right - ev.clientX))); setVw(w); };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setVw((w) => { saveUi({ ...loadUi(), vw2: w }); return w; }); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const l = it ? L[it.x.f] : null;
  return (
    <aside className={'viewer' + (readOnly ? ' ro' : '')} aria-label={readOnly ? '전체 PPT 보기' : '레이아웃 전체 보기'} tabIndex={-1} ref={ref} onKeyDown={onKey} style={vw ? { '--vw': vw + 'px' } : undefined}>
      <div className="vresize" onPointerDown={drag} title="끌어서 너비 조절" aria-hidden="true" />
      <div className="vhead">
        <Icon name="layers" size={17} />
        <h3>{readOnly ? '전체 PPT' : '레이아웃 전체'}</h3>
        <span className="cnt">{list.length ? (i + 1) + ' / ' + list.length : '0'}{readOnly ? '장' : ' · 완료 ' + nDone}</span>
        <span style={{ flex: 1 }} />
        {!readOnly && <button className="btn btn-primary btn-sm" disabled={!list.length} onClick={onExport}><Icon name="download" size={14} />PPTX 내보내기</button>}
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label={readOnly ? '전체 PPT 닫기' : '보기 접기'} title={readOnly ? '닫기' : '접기'}><Icon name="panelOff" size={16} /></button>
      </div>
      {it ? (
        <div className="vmain" ref={mainRef}>
          <div className="vcenter">
          <div className={'vinfo ' + partHue(type)}>
            <span className="pt">{isCov ? '표지' : it.s.name}</span>
            <span className="nm">{l.name}</span>
            {!readOnly && !layoutIsComplete(p, it.x) && <span className={'stbadge ' + it.x.status}>{contextPending(it.x) ? '고객 맥락 검토 중' : it.x.status === 'partial' ? '작성 중' : '빈 레이아웃'}</span>}
            {readOnly && <FavButton f={it.x.f} ov={it.x.ov} from={'Best Scenario · ' + (p.title || '')} label />}
          </div>
          <div className={'vslide' + (!readOnly && layoutIsComplete(p, it.x) ? ' st-done' : '')} role="button" tabIndex={0} onClick={() => onEdit(it.s.id, it.x.uid)}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onEdit(it.s.id, it.x.uid); } }}
            title={readOnly ? '눌러서 크게 보기' : '눌러서 채우기 · 상세 열기'} aria-label={it.n + '쪽 ' + l.name + (readOnly ? ' — 눌러서 크게 보기' : ' — 눌러서 채우기 · 상세 열기')}>
            {readOnly ? <Slide f={it.x.f} ov={it.x.ov} pageNo={it.n} width={sw} /> : <ContextSlide p={p} x={it.x} pageNo={it.n} width={sw} />}
            {!readOnly && <><FavButton f={it.x.f} ov={it.x.ov} from={'제안서 · ' + (p.title || '')} /><LayoutCompleteButton p={p} x={it.x} /></>}
            <span className="vslide-hint" aria-hidden="true"><Icon name={readOnly ? 'eye' : 'edit'} size={13} />{readOnly ? '눌러서 크게 보기' : '눌러서 채우기 · 상세'}</span>
          </div>
          <div className="vnav">
            <button className="btn btn-sm btn-icon" disabled={i === 0} onClick={() => go(-1)} aria-label="이전 장"><Icon name="chevL" size={15} /></button>
            <span className="num" style={{ fontSize: "var(--text-12-5px)", fontWeight: "var(--weight-700)", minWidth: 54, textAlign: 'center' }}>{it.n}쪽</span>
            <button className="btn btn-sm btn-icon" disabled={i === list.length - 1} onClick={() => go(1)} aria-label="다음 장"><Icon name="chev" size={15} /></button>
            <span className="faint" style={{ fontSize: "var(--text-12px)" }}>← → 로 넘기기</span>
          </div>
          </div>
        </div>
      ) : (
        <div className="vempty"><div><Icon name="layers" size={30} /><p style={{ margin: '8px 0 0' }}>아직 넣은 레이아웃이 없어요.<br />파트를 완료하고 <b>PPT 레이아웃 추가</b>를 눌러 보세요.</p></div></div>
      )}
      {list.length > 0 && (
        <div className="vstrip" ref={strip} aria-label="썸네일">
          {stripGroups(list).map((g) => (
            <div key={g.k} className={'vgroup ' + partHue(g.type) + (g.k === 'cover' ? ' is-cover' : '')}>
              <span className="gl"><i />{g.label}</span>
              <div className="row">
                {g.items.map(({ x, n }) => (
                  <button key={x.uid} className={'vthumb' + (!readOnly && layoutIsComplete(p, x) ? ' st-done' : '')} aria-current={x.uid === cur} onClick={() => setCur(x.uid)} aria-label={n + '쪽 ' + L[x.f].name}>
                    {readOnly ? <Slide f={x.f} ov={x.ov} width={128} lazy pageNo={n} /> : <ContextSlide p={p} x={x} width={128} lazy pageNo={n} />}
                    <span className="no">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

export const getDownloads = runtimeDownloads;
export const DL_ERR = {
  declined: '저장을 취소했어요.', rate_limited: '저장 창이 이미 열려 있어요. 잠시 뒤 다시 눌러 주세요.', too_large: '파일이 너무 커요. 이미지가 많은 장을 줄여 보세요.',
  extension_not_enabled: '이 화면에서는 PPTX 저장을 쓸 수 없어요.',
};
export const safeName = (s) => String(s || 'Winmate 제안서').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

export function ExportModal({ p, onClose }) {
  const list = flatSlides(p);
  const nDone = list.filter((z) => layoutIsComplete(p, z.x)).length;
  const [scope, setScope] = useState('all');
  const [font, setFont] = useState('Noto Sans KR');
  const [name, setName] = useState(safeName(p.title));
  const [st, setSt] = useState(null); // {n, total} | {blob} | {err}
  const chosen = scope === 'done' ? list.filter((z) => layoutIsComplete(p, z.x)) : list;
  const nEmpty = chosen.filter((z) => z.x.status === 'empty').length;
  const blocked = chosen.some(({ x }) => contextPending(x) || x.adaptation?.phase === 'error' || inspectLayoutContext(p, x).some(issue => /선택하지 않은 제품|다른 이미지/.test(issue)));
  const run = async () => {
    if (blocked) return;
    setSt({ n: 0, total: chosen.length });
    try {
      const blob = await exportPptx(chosen.map((z) => ({ f: z.x.f, ov: z.x.ov, part: z.s.name })), { title: p.title, font, onProgress: (n, total) => setSt({ n, total }) });
      setSt({ blob });
      await save(blob);
    } catch (e) { console.error(e); setSt({ err: '만드는 중 문제가 생겼어요: ' + (e && e.message ? e.message : e) }); }
  };
  const save = async (blob) => {
    const filename = safeName(name) + '.pptx';
    const dl = await getDownloads();
    if (dl) {
      try {
        await dl.save({ filename, data: blob });
        update(p.id, (d) => { d.exportedAt = Date.now(); });
        toast(filename + ' 저장했어요');
        onClose();
      } catch (e) {
        const code = (e && e.code) || 'unavailable';
        setSt({ blob, err: DL_ERR[code] || '이 화면에서는 파일을 저장할 수 없어요.' });
      }
      return;
    }
  };
  const busy = st && st.total != null;
  return (
    <Modal size="narrow" onClose={busy ? () => {} : onClose} title="PPTX 내보내기" sub="편집 가능한 PowerPoint 파일로 만들어요. 글자는 텍스트 상자, 도형은 도형, 아이콘은 이미지로 들어가요."
      footer={<>
        <span className="note num">{chosen.length}장 · 16:9</span>
        <span className="sp" />
        <button className="btn" disabled={busy} onClick={onClose}>닫기</button>
        {st && st.blob && st.err ? <button className="btn btn-primary" onClick={() => save(st.blob)}><Icon name="download" size={15} />다시 저장</button>
          : <button className="btn btn-primary" disabled={!chosen.length || busy || blocked} onClick={run}>{busy ? <span className="spin" /> : <Icon name="download" size={15} />}{busy ? '만드는 중…' : 'PPTX 만들기'}</button>}
      </>}>
      {blocked && <p className="hint" role="status">현재 고객 맥락에 맞는지 확인 중이거나 실패한 장이 있어요. 채우기를 마친 뒤 내보낼 수 있어요.</p>}
      <div className="field"><label htmlFor="ex-name">파일 이름</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: "var(--space-6px)" }}><input id="ex-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /><span className="faint num">.pptx</span></div>
      </div>
      <div className="field"><span className="lbl">범위</span>
        <div className="opt-row">
          <label className="radio"><input type="radio" name="ex-scope" checked={scope === 'all'} onChange={() => setScope('all')} />전체 {list.length}장</label>
          <label className="radio"><input type="radio" name="ex-scope" checked={scope === 'done'} onChange={() => setScope('done')} disabled={!nDone} />입력 완료만 {nDone}장</label>
        </div>
        {nEmpty > 0 && <span className="hint"><Icon name="info" size={14} />아직 채우지 않은 {nEmpty}장은 예시 문구 그대로 들어가요.</span>}
      </div>
      <div className="field"><span className="lbl">글꼴</span>
        <div className="opt-row">
          {[['Noto Sans KR', 'Noto Sans KR'], ['Malgun Gothic', '맑은 고딕'], ['SamsungOne', 'SamsungOne (사내 PC)']].map(([k, l]) => <label key={k} className="radio"><input type="radio" name="ex-font" checked={font === k} onChange={() => setFont(k)} />{l}</label>)}
        </div>
      </div>
      {busy && (
        <div className="field" aria-live="polite">
          <div className="progress"><i style={{ width: Math.round((st.n / Math.max(1, st.total)) * 100) + '%' }} /></div>
          <span className="faint num" style={{ fontSize: "var(--text-12px)" }}>{st.n} / {st.total}장 변환</span>
        </div>
      )}
      {st && st.err && <div className="hint" style={{ color: 'var(--warn)' }}><Icon name="alert" size={14} />{st.err}</div>}
    </Modal>
  );
}
