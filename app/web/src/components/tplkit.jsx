import { getDownloads as runtimeDownloads } from '../platform/runtime.js';
import React, { useEffect, useState } from 'react';
import { Icon, toast, LayoutMeta } from './common.jsx';
import { SheetView } from './sheetview.jsx';
import { PARTS } from '../domain/proposals/parts.js';
import { Slide } from '../domain/slides/Slide.jsx';
import { exportPptx } from '../domain/slides/export-pptx.js';
import { FavButton } from './fav.jsx';
import { useDetailPeek } from './reference-detail.jsx';

/* Shared pieces for the layout template library and Best Scenario: source decks, file saving, big preview. */

// 구분 2 — the source decks the layouts came from.
export const DECKS = [
  { k: 'MI', label: '01 MI', full: '시장 · 고객 · 사용자 분석 (업종별)' },
  { k: 'VP', label: '02 Value Props', full: '가치 제안 (업종별)' },
  { k: 'SS', label: '03 공간 시나리오', full: '공간별 가치 제공 시나리오' },
  { k: 'SP', label: '04 공간별 제품', full: '공간별 제품 소개' },
  { k: 'EX', label: '05 보강', full: '시나리오 커버리지 · 보강 레이아웃' },
  { k: 'CM', label: '공통 · 솔루션', full: '표지 · 실행 · 솔루션 전용 · 이미지 중심' },
  { k: 'PH', label: '06 사진 중심', full: '텍스트 위주 장표를 사진으로 채운 버전 (samsung.com 사진)' },
  { k: 'ST', label: '표준 제안서', full: '업종별 표준 제안서 · 원본 기준 양식과 Markdown 설명 기반 재구성 판본' },
];
export const DECK = Object.fromEntries(DECKS.map((d) => [d.k, d]));

/* ---------- downloads ---------- */
const getDownloads = runtimeDownloads;
export const DL_ERR = { declined: '저장을 취소했어요.', rate_limited: '저장 창이 이미 열려 있어요. 잠시 뒤 다시 눌러 주세요.', too_large: '파일이 너무 커요. 장 수를 줄여 보세요.', extension_not_enabled: '이 화면에서는 PPTX 저장을 쓸 수 없어요.' };
export const safeName = (s) => String(s || 'Winmate 레이아웃').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
export async function saveBlob(blob, filename) {
  try { const downloads = await getDownloads(); await downloads.save({ filename, data: blob }); return { ok: true }; }
  catch (error) { return { err: DL_ERR[(error && error.code) || ''] || '이 화면에서는 파일을 저장할 수 없어요.' }; }
}
export const slidesOf = (list) => list.map((l) => ({ f: l.f, ov: { t: {}, img: {} }, part: PARTS[l.p] ? PARTS[l.p].label : '' }));

/* =========================================================
   Detail — the shared sheet popup (sheetview.jsx) with a read-only panel: role · example title · metadata
   (PPT 레이아웃 템플릿 · Best Scenario). PPTX of this one sheet.
   ========================================================= */
export function TemplateDetail({ list, index, onNav, onClose, notes = null, noteLabel = '이 장의 역할', ovs = null, onEdit = null, favFrom = 'PPT 레이아웃 템플릿' }) {
  const l = list[index];
  const ov = ovs ? ovs[index] : null; // filled sample values (Best Scenario)
  const [busy, setBusy] = useState(false);
  const peek = useDetailPeek();
  useEffect(() => { peek.hide(); }, [l.f, index, peek.hide]);
  const close = () => { peek.hide(); onClose(); };
  const navigate = i => { peek.hide(); onNav(i); };
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
    <><SheetView onClose={close} index={index} total={list.length} onNav={onNav ? navigate : undefined}
      title={<span className="tl-dt">{l.name}</span>}
      sub={[l.when || l.g, pt && pt.label, DECK[l.c] && DECK[l.c].label].filter(Boolean).join(' · ')}
      bodyClass="tl-detail" panelClass="tl-dr"
      stageActions={<>
        {onEdit && <button className="btn btn-primary sv-edit" onClick={() => { peek.hide(); onEdit(l, ov); onClose(); }} title="레이아웃 수정하기"><Icon name="edit" size={17} />수정하기</button>}
        <FavButton f={l.f} ov={ov} from={favFrom} label />
      </>}
      stage={(w) => <Slide key={l.f} f={l.f} ov={ov || undefined} pageNo={ov ? index + 1 : undefined} width={w} />}
      panel={<>
        {notes && notes[index] ? <div className="tl-ex tl-role"><span className="lbl">{noteLabel}</span><p>{notes[index]}</p></div> : null}
        {l.hl && !ov && <div className="tl-ex"><span className="lbl">예시 제목</span><p>{l.hl}</p>{l.sample ? <span className="faint" style={{ fontSize: "var(--text-12px)" }}>예시 고객 · {l.sample}</span> : null}</div>}
        <LayoutMeta l={l} peek={peek} />
        <p className="hint"><Icon name="info" size={14} /><span>제안서에서 쓰려면 Storyboard 파트의 ‘레이아웃 추가’ → 검색에서 “{l.name}”로 찾으면 돼요.</span></p>
      </>}
      actions={<>
        <button className="btn" onClick={close}>닫기</button>
        <button className="btn btn-primary" disabled={busy} onClick={download}>{busy ? <span className="spin" /> : <Icon name="download" size={15} />}{busy ? '만드는 중…' : 'PPTX로 받기'}</button>
      </>} />{peek.node}</>
  );
}
