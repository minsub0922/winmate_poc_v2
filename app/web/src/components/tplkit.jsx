import { getDownloads as runtimeDownloads } from '../platform/runtime.js';
import React, { useEffect, useMemo, useState } from 'react';
import { Icon, toast, LayoutMeta } from './common.jsx';
import { SheetView } from './sheetview.jsx';
import { PARTS } from '../domain/proposals/parts.js';
import { Slide, readBlocks, readImageSlots } from '../domain/slides/Slide.jsx';
import { SLOT_MODE_LABEL, LAYOUT_LOCK_LABEL, slotModes } from '../domain/templates/layout_slot_modes.js';
import { VARIANTS, IND, L } from '../services/catalog.js';
import { exportPptx } from '../domain/slides/export-pptx.js';
import { FavButton } from './fav.jsx';
import { useDetailPeek } from './reference-detail.jsx';

/* Shared pieces for the layout template library and 샘플 버티컬 시나리오: source decks, file saving, big preview. */

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
  { k: 'TC', label: '목차 템플릿', full: '목차 템플릿 시나리오가 쓰는 장 · 같은 목차는 같은 장' },
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
   (PPT 레이아웃 템플릿 · 샘플 버티컬 시나리오). PPTX of this one sheet.
   ========================================================= */
/* 칸 구분 — 고정 / 교체 / 후보 선택 / AI 작성 (layout_slot_modes.js). 슬라이드 위 표시는 .slide-fix (styles.css) */
const FIX_ORDER = ['fixed', 'section', 'pick', 'product', 'solution', 'case', 'ai'];
const KEEP = new Set(['fixed', 'section']); // 고정 대상 — 나머지는 변경 대상
export function SlotModePanel({ f, show, onToggle, group = null }) {
  const [open, setOpen] = useState(null); // 후보군을 펼친 칸
  useEffect(() => setOpen(null), [f]);
  const modes = slotModes(f);
  // 합친 레이아웃: 칸마다 후보(업종판)별 값 — 후보군
  const cands = useMemo(() => (group ? group.members.map(([mf, key, label]) => [variantName(group, key, label), Object.fromEntries(readBlocks(mf).map((b) => [b.i, b.s]))]) : null), [group]);
  if (!modes) return null;
  const vary = group ? new Set(group.vary.t) : null;
  const blocks = readBlocks(f), imgs = readImageSlots(f);
  const count = Object.fromEntries(FIX_ORDER.map((m) => [m, 0]));
  for (const b of blocks) count[b.fix || 'ai'] = (count[b.fix || 'ai'] || 0) + 1;
  for (const im of imgs) count[im.fix || 'ai'] = (count[im.fix || 'ai'] || 0) + 1;
  const keep = blocks.filter((b) => KEEP.has(b.fix)), change = blocks.filter((b) => !KEEP.has(b.fix));
  const row = (b) => (
    <React.Fragment key={b.i}>
      <li><span className={'fix-chip fix-' + (b.fix || 'ai')}><i />{SLOT_MODE_LABEL[b.fix || 'ai']}</span>
        <span className="fix-s" title={b.s}>{b.s}</span>
        {cands && vary.has(b.i) ? <button type="button" className="fix-v" aria-expanded={open === b.i} onClick={() => setOpen(open === b.i ? null : b.i)}>후보 <span className="num">{cands.length}</span></button> : null}</li>
      {open === b.i && cands ? <li className="fix-cands"><ul>{cands.map(([lab, t], k) => <li key={k}><b>{lab}</b><span>{t[b.i] || '—'}</span></li>)}</ul></li> : null}
    </React.Fragment>
  );
  return (
    <div className="tl-ex tl-fix">
      <span className="lbl">칸 구분 · {LAYOUT_LOCK_LABEL[modes.lock] || ''}</span>
      <div className="fix-legend">
        {FIX_ORDER.filter((m) => count[m]).map((m) => <span key={m} className={'fix-chip fix-' + m}><i />{SLOT_MODE_LABEL[m]} <b className="num">{count[m]}</b></span>)}
      </div>
      <label className="fix-toggle"><input type="checkbox" checked={!!show} onChange={(e) => onToggle(e.target.checked)} />슬라이드에 칸 구분 표시</label>
      <details className="fix-list">
        <summary>칸 목록 · 고정 대상 <b className="num">{keep.length}</b> · 변경 대상 <b className="num">{change.length}</b></summary>
        {keep.length ? <><span className="fix-h">고정 대상</span><ul>{keep.map(row)}</ul></> : null}
        {change.length ? <><span className="fix-h">변경 대상{cands ? ' · 후보를 누르면 업종마다 이 칸에 들어가는 값' : ''}</span><ul>{change.map(row)}</ul></> : null}
      </details>
      <span className="faint" style={{ fontSize: 'var(--text-12px)' }}>AI 채우기는 고정 · 목차 번호 · 후보 선택 칸을 새로 쓰지 않아요. 제품 · 솔루션 · 사례 칸은 고른 항목의 공식 정보로만, 후보 선택 칸은 업종 후보 값으로 바꿔요. 직접 수정은 모든 칸에서 할 수 있어요.</span>
    </div>
  );
}

/** a content candidate's short name — the industry, or the candidate's own label */
const variantName = (group, key, label) => (group.by === 'ind' ? (key === '_' ? '범용' : IND[key] ? IND[key].name.split(' · ')[0] : key) : label || key);

/* 같은 레이아웃 · 다른 내용 — 합친 레이아웃의 내용 후보(주로 업종판). 고르면 미리보기가 그 후보로 바뀐다. */
export function VariantPanel({ l, vf, onPick }) {
  const group = l && VARIANTS[l.f];
  if (!group || !l.variants || l.variants.length < 2) return null;
  const byInd = group.by === 'ind';
  const name = (v) => variantName(group, v.key, v.label);
  return (
    <div className="tl-ex tl-var">
      <span className="lbl">{byInd ? '업종 후보' : '내용 후보'} <b className="num">{l.variants.length}</b> · 같은 레이아웃, 내용만 달라요</span>
      <div className="var-chips">
        {l.variants.map((v) => <button key={v.f} type="button" className={'var-chip' + (v.f === vf ? ' on' : '')} aria-pressed={v.f === vf} title={(v.label || '') + ' · ' + v.f} onClick={() => onPick(v.f)}>{name(v)}</button>)}
      </div>
      <span className="faint" style={{ fontSize: 'var(--text-12px)' }}>후보마다 바뀌는 칸 · 글 <span className="num">{group.vary.t.length}</span> · 사진 <span className="num">{group.vary.img.length}</span>{group.vary.frame ? ' · 도표' : ''}. 제안서에 넣으면 그 제안서 업종의 후보로 들어가요.</span>
    </div>
  );
}

export function TemplateDetail({ list, index, onNav, onClose, notes = null, noteLabel = '이 장의 역할', ovs = null, onEdit = null, favFrom = '템플릿 라이브러리' }) {
  const l = list[index];
  const ov = ovs ? ovs[index] : null; // filled sample values (샘플 버티컬 시나리오)
  const [busy, setBusy] = useState(false);
  const [showFix, setShowFix] = useState(false);
  const [pick, setPick] = useState(null); // 합친 레이아웃에서 보고 있는 내용 후보
  const vf = !ov && pick && (l.variants || []).some((v) => v.f === pick) ? pick : l.f;
  const peek = useDetailPeek();
  useEffect(() => { peek.hide(); setPick(null); }, [l.f, index, peek.hide]);
  const close = () => { peek.hide(); onClose(); };
  const navigate = i => { peek.hide(); onNav(i); };
  const download = async () => {
    setBusy(true);
    try {
      const blob = await exportPptx(ov ? [{ f: l.f, ov, part: PARTS[l.p] ? PARTS[l.p].label : '' }] : slidesOf([{ ...l, f: vf }]), { title: l.name });
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
        {onEdit && <button className="btn btn-primary sv-edit" onClick={() => { peek.hide(); onEdit((vf !== l.f && L[vf]) || l, ov); onClose(); }} title="레이아웃 수정하기"><Icon name="edit" size={17} />수정하기</button>}
        <FavButton f={vf} ov={ov} from={favFrom} label />
      </>}
      stage={(w) => <Slide key={vf} f={vf} ov={ov || undefined} pageNo={ov ? index + 1 : undefined} width={w} className={showFix ? 'slide-fix' : ''} />}
      panel={<>
        {notes && notes[index] ? <div className="tl-ex tl-role"><span className="lbl">{noteLabel}</span><p>{notes[index]}</p></div> : null}
        {l.hl && !ov && <div className="tl-ex"><span className="lbl">예시 제목</span><p>{l.hl}</p>{l.sample ? <span className="faint" style={{ fontSize: "var(--text-12px)" }}>예시 고객 · {l.sample}</span> : null}</div>}
        <LayoutMeta l={l} peek={peek} />
        {!ov && <VariantPanel l={l} vf={vf} onPick={setPick} />}
        <SlotModePanel f={vf} show={showFix} onToggle={setShowFix} group={(!ov && VARIANTS[l.f]) || null} />
        <p className="hint"><Icon name="info" size={14} /><span>제안서에서 쓰려면 Storyboard 목차의 ‘레이아웃 추가’ → 검색에서 “{l.name}”로 찾으면 돼요.</span></p>
      </>}
      actions={<>
        <button className="btn" onClick={close}>닫기</button>
        <button className="btn btn-primary" disabled={busy} onClick={download}>{busy ? <span className="spin" /> : <Icon name="download" size={15} />}{busy ? '만드는 중…' : 'PPTX로 받기'}</button>
      </>} />{peek.node}</>
  );
}
