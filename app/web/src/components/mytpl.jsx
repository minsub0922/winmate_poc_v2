import { requireLogin } from '../api/session.js';
import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { DeleteButton,confirmDelete,Icon, Modal, toast, partHue } from './common.jsx';
import { EditorHelp } from './editor-help.jsx';
import { PARTS, classifyPart } from '../domain/proposals/parts.js';
import { L, layoutHtml, unregisterLayout } from '../services/catalog.js';
import { FitSlide, Slide, applyOverrides } from '../domain/slides/Slide.jsx';
import { FavButton } from './fav.jsx';
import { SheetView } from './sheetview.jsx';
import { saveBlob, safeName } from './tplkit.jsx';
import { exportPptx } from '../domain/slides/export-pptx.js';
import { convertPptx } from '../domain/slides/import/pptx2html.js';
import { myMeta, newF, saveTemplates, putImages, deleteTemplates, dropImages, updateMeta, tokenize, isMy, storeImage, imgUrl, measure, myPersistent, myAccountStorage, previewRegister } from '../repositories/templates.js';
import { useWorkContext } from '../services/customer-voice-context.js';
import { ImagePicker } from './imagepick.jsx';
import { resolveImg, useStore } from '../repositories/proposals.js';
import { hydrateFill } from '../services/fill.js';
import { bgUrl, loadBg } from '../services/packs.js';
import { BackgroundPicker } from './backgroundpick.jsx';
import { backgroundState, clearLayoutBackground, setLayoutBackground, setBackgroundEffects } from '../services/layout-background.js';
import { BackgroundEffects } from './background-effects.jsx';
import { LayoutPromptAgent } from './layout-prompt.jsx';
import { reflowProducts } from '../services/layout-reflow.js';
import { visibleRepeatCards } from '../services/layout-repeat.js';
import { createBackgroundPreviewSession, disposeBackgroundPreviews, renderBackgroundPreview } from '../services/background-effects.js';
import { inferIndustry } from '../services/search.js';
import { fetchResource } from '../api/client.js';

/* =========================================================
   My 템플릿 — the person's own templates on a dedicated sidebar page
   MyUpload   PPTX → Winmate templates (ImportDialog: convert · review · save)
   MySections the list, one group per uploaded file (+ one for edited layouts)
   MyDetail   a My template: name · part type · source, 고치기 · 지우기 · PPTX
   LayoutEditor  edit any layout (a library layout → '수정하기', or a My template) and save it as a My template
   ========================================================= */

const PART_OPTS = [['', '미분류'], ...Object.entries(PARTS).map(([k, v]) => [k, v.label])];
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const PPTX_RE = /\.(pptx|potx|ppsx|pptm)$/i;
const fmtDate = (t) => { if (!t) return ''; const d = new Date(t); return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'); };
export const srcLabel = (l) => (!l || !l.my ? '' : l.my.kind === 'spatial' ? '공간 조감도에서 추출한 레이아웃' : l.my.kind === 'pptx' ? (l.my.file || 'PPTX') + (l.my.page ? ' · ' + l.my.page + '쪽' : '') : L[l.my.from] ? '‘' + L[l.my.from].name + '’을 고쳐 만듦' : '레이아웃을 고쳐 만듦');

/** PPTX drop zone (first thing in My) */
export function MyUpload({ onFile, onBrowse, empty }) {
  const [over, setOver] = useState(false);
  const ref = useRef(null);
  const take = (files) => {
    const f = Array.from(files || []).find((x) => PPTX_RE.test(x.name));
    if (!f) { toast('PPTX 파일만 올릴 수 있어요', 'warn'); return; }
    onFile(f);
  };
  return (
    <div className="my-up">
      <div className={'my-drop' + (over ? ' over' : '') + (empty ? ' big' : '')} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}>
        <span className="my-drop-ic" aria-hidden="true"><Icon name="upload" size={22} /></span>
        <div className="my-drop-t">
          <b>PPTX를 올려 내 템플릿 만들기</b>
          <span>장마다 원본과 최대한 같게 복원해요. 글자는 고칠 수 있는 글 칸, 사진은 바꿀 수 있는 이미지 칸이 돼요.</span>
        </div>
        <button type="button" className="btn btn-primary my-pick" onClick={() => { if (requireLogin()) ref.current?.click(); }}><Icon name="file" size={15} />PPTX 고르기</button>
        <input ref={ref} type="file" accept=".pptx,.potx,.ppsx,.pptm,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden data-my-file onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      </div>
      <div className="my-or">
        <Icon name="edit" size={14} />
        <span>기존 레이아웃으로 만들기 — 레이아웃을 열고 <b>‘수정하기’</b>를 누르세요.</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBrowse}>레이아웃 고르러 가기<Icon name="arrowR" size={13} /></button>
      </div>
      {!myPersistent() && <p className="hint" style={{ color: 'var(--warn)' }}><Icon name="alert" size={14} />이 브라우저에서는 저장 공간을 쓸 수 없어, 이번 방문 동안만 남아요.</p>}
    </div>
  );
}

/** the My list: one group per uploaded file (newest first) + edited layouts */
export function myGroups(list) {
  const m = new Map();
  for (const l of list) {
    const k = l.my.kind === 'pptx' ? 'b:' + (l.my.batch || l.my.file) : l.my.kind === 'spatial' ? 'spatial' : 'edit';
    if (!m.has(k)) m.set(k, { key: k, edit: k === 'edit', spatial:k==='spatial', file: l.my.file, at: 0, items: [] });
    const g = m.get(k); g.items.push(l); g.at = Math.max(g.at, l.my.at || 0);
  }
  const gs = [...m.values()].sort((a, b) => b.at - a.at);
  for (const g of gs) g.items.sort((a, b) => (g.edit||g.spatial ? (b.my.up || 0) - (a.my.up || 0) : (a.my.page || 0) - (b.my.page || 0)));
  return gs;
}
export function MySections({ groups, cols, card, onDeleteGroup }) {
  return (
    <div className="tl-sections my-secs">
      {groups.map((g) => (
        <section key={g.key} className="tl-grp h-blue my-grp" aria-label={g.spatial?'조감도 레이아웃':g.edit ? '고쳐 만든 레이아웃' : g.file}>
          <div className="tl-grp-h">
            <i className="dot" /><h2>{g.spatial?'조감도 레이아웃':g.edit ? '고쳐 만든 레이아웃' : g.file}</h2><span className="num">{g.items.length}</span>
            <span className="sp" />
            {!g.edit&&!g.spatial && <DeleteButton className="btn btn-ghost btn-sm" confirmation={{title:'파일의 템플릿을 모두 삭제할까요?',message:g.file+'에서 가져온 '+g.items.length+'장을 삭제합니다.'}} onClick={()=>onDeleteGroup(g)}><Icon name="trash" size={13}/>파일 전체 지우기</DeleteButton>}
            <p>{g.spatial?'공간 조감도에서 저장한 레이아웃':g.edit ? '레이아웃 템플릿을 열어 고친 뒤 저장한 것' : 'PPTX에서 가져옴 · ' + fmtDate(g.at)}</p>
          </div>
          <div className="tl-grp-in">
            <div className="tl-grid" style={{ gridTemplateColumns: 'repeat(' + cols + ', minmax(0, 1fr))' }}>{g.items.map(card)}</div>
          </div>
        </section>
      ))}
    </div>
  );
}

/* =========================================================
   Import — convert → review (pick pages · names · part types) → save
   ========================================================= */
export function ImportDialog({ file, onClose, onSaved }) {
  const [st, setSt] = useState({ phase: 'read', n: 0, total: 0 });
  const [pages, setPages] = useState(null);
  const [warn, setWarn] = useState([]);
  const [busy, setBusy] = useState(false);
  const idsRef = useRef([]); const fsRef = useRef([]); const savedRef = useRef(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        const prefix = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
        const r = await convertPptx(buf, { prefix, onProgress: (n, total, what) => { if (alive) setSt({ phase: what, n, total }); } });
        if (!alive) return;
        await putImages(r.images); idsRef.current = [...r.images.keys()];
        const base = file.name.replace(PPTX_RE, '');
        const list = r.slides.map((s) => {
          const f = newF();
          const name = (s.title || (r.mode === 'layouts' ? s.layoutName : '') || base + ' ' + s.n + '쪽').slice(0, 40);
          const meta = myMeta({ f, name, p: classifyPart(s.title) || '', when: base + ' · ' + s.n + '쪽', kind: 'pptx', file: file.name, page: s.n, batch: prefix, text: s.text, title: s.title, nT: s.nT, nI: s.nI, pf: s.pf });
          previewRegister(meta, s.html);
          return { meta, html: s.html, on: !s.hidden, hidden: s.hidden };
        });
        fsRef.current = list.map((x) => x.meta.f);
        if (!list.length) throw new Error('슬라이드가 없는 파일이에요');
        setPages(list); setWarn(r.warnings); setSt({ phase: 'done', mode: r.mode, ratio: r.ratio });
      } catch (e) { console.error(e); if (alive) setSt({ phase: 'error', err: e && e.message ? e.message : String(e) }); }
    })();
    return () => { alive = false; if (!savedRef.current) { for (const f of fsRef.current) unregisterLayout(f); dropImages(idsRef.current); } };
  }, []);
  const set = (i, patch) => setPages((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch, meta: patch.meta ? { ...p.meta, ...patch.meta } : p.meta } : p)));
  const nOn = pages ? pages.filter((p) => p.on).length : 0;
  const save = async () => {
    setBusy(true);
    try {
      const chosen = pages.filter((p) => p.on);
      const metas = await saveTemplates(chosen.map((p) => ({ meta: p.meta, html: p.html })));
      savedRef.current = true;
      for (const p of pages) if (!p.on) unregisterLayout(p.meta.f);
      await dropImages(idsRef.current);
      onSaved(metas);
    } catch (e) {
      console.error(e);
      toast(/quota/i.test(String(e && (e.name || e.message))) ? '브라우저 저장 공간이 모자라요. 장 수를 줄이거나 다른 My 템플릿을 지워 주세요' : '저장하지 못했어요: ' + (e && e.message ? e.message : e), 'warn');
      setBusy(false);
    }
  };
  const working = !pages && st.phase !== 'error';
  const pct = st.total ? Math.round((st.n / st.total) * 100) : 0;
  return (
    <Modal size="xwide" onClose={busy ? () => {} : onClose} title={<span className="my-imp-t"><Icon name="upload" size={17} />PPTX에서 내 템플릿 만들기</span>}
      sub={pages ? file.name + ' · ' + pages.length + '장' + (st.mode === 'layouts' ? ' (슬라이드가 없어 레이아웃을 장으로 가져왔어요)' : '') + (st.ratio && Math.abs(st.ratio - 16 / 9) > 0.02 ? ' · 16:9가 아닌 장표라 가운데에 맞췄어요' : '') + ' — 저장할 장을 고르고 이름 · 파트 유형을 정해 주세요.' : file.name}
      footer={<>
        {pages && <span className="note"><b className="num">{nOn}</b> / {pages.length}장 선택</span>}
        <span className="sp" />
        <button className="btn" disabled={busy} onClick={onClose}>{pages ? '취소' : '닫기'}</button>
        {pages && <button className="btn btn-primary" data-autofocus disabled={!nOn || busy} onClick={save}>{busy ? <span className="spin" /> : <Icon name="check" size={15} />}{busy ? '저장하는 중…' : nOn + '장 My에 저장'}</button>}
      </>}>
      {working && (
        <div className="my-prog" aria-live="polite">
          <span className="spin" />
          <b>{st.phase === 'image' ? '사진을 정리하는 중…' : st.phase === 'slide' ? '장표를 복원하는 중…' : '파일을 읽는 중…'}</b>
          {st.total ? <><div className="progress"><i style={{ width: pct + '%' }} /></div><span className="faint num">{st.n} / {st.total}{st.phase === 'image' ? '개' : '장'}</span></> : null}
          <span className="faint">테마 색 · 글꼴, 마스터 · 레이아웃, 도형 · 표 · 차트 · 사진 자르기까지 읽어 1280×720 레이아웃으로 그려요.</span>
        </div>
      )}
      {st.phase === 'error' && <div className="tl-empty"><b>이 파일은 가져오지 못했어요</b><span>{st.err}</span></div>}
      {pages && (
        <>
          {warn.length > 0 && (
            <details className="my-warn">
              <summary><Icon name="info" size={14} />원본과 다를 수 있는 곳 {warn.length}가지</summary>
              <ul>{warn.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>
          )}
          <div className="my-imp-bar">
            <button className="btn btn-sm" onClick={() => setPages((ps) => ps.map((p) => ({ ...p, on: true })))}>모두 선택</button>
            <button className="btn btn-sm" onClick={() => setPages((ps) => ps.map((p) => ({ ...p, on: false })))}>모두 해제</button>
            <span className="faint">글자는 템플릿의 예시 문구가 돼요. 저장한 뒤에도 ‘고치기’로 바꿀 수 있어요.</span>
          </div>
          <div className="my-imp-grid">
            {pages.map((p, i) => (
              <div key={p.meta.f} className={'my-imp-card' + (p.on ? ' on' : '')}>
                <button type="button" className="my-imp-th" aria-pressed={p.on} onClick={() => set(i, { on: !p.on })} aria-label={(i + 1) + '쪽 ' + (p.on ? '선택 해제' : '선택')}>
                  <span className="my-chk" aria-hidden="true"><Icon name="check" size={13} stroke={3} /></span>
                  <span className="my-pg num">{p.meta.my.page}{p.hidden ? ' · 숨긴 장' : ''}</span>
                  <FitSlide f={p.meta.f} lazy />
                </button>
                <input className="input" value={p.meta.name} aria-label={(i + 1) + '쪽 이름'} onChange={(e) => set(i, { meta: { name: e.target.value } })} />
                <div className="my-imp-row">
                  <select className="input" value={p.meta.p} aria-label={(i + 1) + '쪽 파트 유형'} onChange={(e) => set(i, { meta: { p: e.target.value } })}>{PART_OPTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <span className="faint num" title="글 칸 · 이미지 칸">글 {p.meta.nT} · 이미지 {p.meta.nI}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

/* =========================================================
   Detail of a My template
   ========================================================= */
export function MyDetail({ list, index, onNav, onClose, onEdit }) {
  const l = list[index];
  const [name, setName] = useState(l ? l.name : '');
  const [busy, setBusy] = useState(false);
  const proposals = useStore((s) => s.proposals);
  useEffect(() => { if (l) setName(l.name); }, [l && l.f, l && l.name]);
  if (!l) return null;
  const used = proposals.filter((p) => p.parts.some((s) => (s.layouts || []).some((x) => x.f === l.f))).length;
  const patchMeta = async patch => { try { await updateMeta(l.f, patch); } catch (error) { setName(l.name); toast('템플릿 정보를 저장하지 못했어요: ' + error.message, 'warn'); } };
  const commitName = () => { const v = name.trim(); if (v && v !== l.name) void patchMeta({ name: v }); else setName(l.name); };
  const download = async () => {
    setBusy(true);
    try {
      const blob = await exportPptx([{ f: l.f, ov: { t: {}, img: {} }, part: PARTS[l.p] ? PARTS[l.p].label : '' }], { title: l.name });
      const r = await saveBlob(blob, safeName('Winmate ' + l.name) + '.pptx');
      if (r.ok) toast(l.name + ' PPTX를 저장했어요'); else toast(r.err, 'warn');
    } catch (e) { console.error(e); toast('PPTX를 만들지 못했어요: ' + (e && e.message ? e.message : e), 'warn'); }
    setBusy(false);
  };
  const remove = async () => {
    await deleteTemplates([l.f]);
    toast('‘' + l.name + '’을 지웠어요');
    if (list.length <= 1) onClose(); else onNav(Math.min(index, list.length - 2));
  };
  return (
    <SheetView onClose={onClose} index={index} total={list.length} onNav={onNav}
      title={<span className="tl-dt">{l.name}</span>} sub={['My 템플릿', srcLabel(l), PARTS[l.p] && PARTS[l.p].label].filter(Boolean).join(' · ')}
      bodyClass="tl-detail my-detail" panelClass="tl-dr"
      stageActions={<>
        <button className="btn btn-primary sv-edit" onClick={() => { onEdit(l); onClose(); }}><Icon name="edit" size={17} />수정하기</button>
        <FavButton f={l.f} from="My 템플릿" label />
      </>}
      stage={(w) => <Slide key={l.f + ':' + l.my.up} f={l.f} width={w} />}
      panel={<>
        <div className="field"><label htmlFor="my-d-name">이름</label>
          <input id="my-d-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></div>
        <div className="field"><label htmlFor="my-d-part">파트 유형</label>
          <select id="my-d-part" className="input" value={l.p || ''} onChange={(e) => void patchMeta({ p: e.target.value })}>{PART_OPTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <dl className="meta-grid">
          <dt>출처</dt><dd>{l.my.kind === 'pptx' ? <>PPTX · {l.my.file}{l.my.page ? ' ' + l.my.page + '쪽' : ''}</> : srcLabel(l)}</dd>
          <dt>칸</dt><dd>글 {l.nT}칸 · 이미지 {l.nI}칸</dd>
          <dt>만든 날</dt><dd className="num">{fmtDate(l.my.at)}{l.my.up && fmtDate(l.my.up) !== fmtDate(l.my.at) ? ' · 고친 날 ' + fmtDate(l.my.up) : ''}</dd>
          <dt>쓰는 곳</dt><dd>{used ? '제안서 ' + used + '곳' : '아직 없음'}</dd>
        </dl>
        <p className="hint"><Icon name="info" size={14} /><span>제안서에서 쓰려면 Storyboard 파트의 ‘레이아웃 추가’ 팝업 맨 위 <b>My 템플릿</b>에서 고르면 돼요. {myAccountStorage() ? '로그인한 계정에 저장되어 다른 브라우저에서도 사용할 수 있어요.' : '이 브라우저에만 저장돼요.'}</span></p>
      </>}
      actions={<>
        <DeleteButton className="btn btn-ghost" confirmation={{title:'템플릿을 삭제할까요?',message:l.name+'을 삭제합니다.'+(used?' 현재 제안서 '+used+'곳에서 사용 중입니다.':'')}} onClick={remove}><Icon name="trash" size={14}/>지우기</DeleteButton>
        <button className="btn btn-primary" disabled={busy} onClick={download}>{busy ? <span className="spin" /> : <Icon name="download" size={15} />}{busy ? '만드는 중…' : 'PPTX로 받기'}</button>
      </>} />
  );
}

/* =========================================================
   Layout editor — move · resize · text · colours · pictures · add / copy / delete, undo
   ========================================================= */
const pxs = (n) => Math.round(n * 10) / 10 + 'px';
let cvs = null;
/** any CSS colour → '#rrggbb' (or rgba(...) with alpha) · null for none / transparent / paint servers */
function normColor(v) {
  if (!v || /^(none|transparent|currentcolor|inherit|initial)$/i.test(v) || /url\(|gradient/i.test(v)) return null;
  if (!cvs) cvs = document.createElement('canvas').getContext('2d');
  cvs.fillStyle = '#010203'; cvs.fillStyle = v; const c = cvs.fillStyle;
  if (c === '#010203' && !/^#?010203$/i.test(v)) return null;
  if (/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\s*\)/.test(c)) return null;
  return c;
}
const PROPS = ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
const SVG_ATTRS = ['fill', 'stroke', 'stop-color'];
function colorsIn(root) {
  const m = new Map(); const add = (v, w) => { const c = normColor(v); if (c) m.set(c, (m.get(c) || 0) + w); };
  for (const e of [root, ...root.querySelectorAll('*')]) {
    if (e.namespaceURI === 'http://www.w3.org/2000/svg') { for (const a of SVG_ATTRS) add(e.getAttribute(a), 2); continue; }
    if (!e.style) continue;
    for (const p of PROPS) add(e.style[p], p === 'color' ? (e.hasAttribute('data-tb') ? 3 : 1) : 2);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, 14);
}
function replaceColor(root, from, to) {
  let n = 0;
  for (const e of [root, ...root.querySelectorAll('*')]) {
    if (e.namespaceURI === 'http://www.w3.org/2000/svg') { for (const a of SVG_ATTRS) if (normColor(e.getAttribute(a)) === from) { e.setAttribute(a, to); n++; } continue; }
    if (!e.style) continue;
    for (const p of PROPS) if (normColor(e.style[p]) === from) { e.style[p] = to; n++; }
  }
  return n;
}
const SWATCH = ['#121417', '#ffffff', '#596170', '#1428a0', '#0b6e64', '#5b35c4', '#b42318', '#e8890c', '#eaeefb', '#f5f6f8'];
const isSvg = (e) => e && e.namespaceURI === 'http://www.w3.org/2000/svg';
const abs = (e) => { const p = getComputedStyle(e).position; return p === 'absolute' || p === 'fixed'; };
/** the element a press picks: a text block, an image slot, a shape (PPTX: its wrapper), or the nearest visible box */
function pickEl(t, root) {
  if (!t || !root || !root.contains(t) || t === root) return null;
  const tb = t.closest('[data-tb]'); if (tb && root.contains(tb)) return tb;
  const im = t.closest('[data-img]'); if (im && root.contains(im)) return frameOf(im, root);
  if (root.hasAttribute('data-my')) { const sp = t.closest('[data-sp]'); if (sp && root.contains(sp)) return sp; }
  let e = isSvg(t) ? t.ownerSVGElement && t.tagName !== 'svg' ? t.closest('svg') : t : t;
  while (e && e !== root) {
    if (e.tagName === 'svg' || e.tagName === 'IMG') return frameOf(e, root);
    const cs = getComputedStyle(e);
    if (cs.position === 'absolute' || normColor(cs.backgroundColor) || cs.backgroundImage !== 'none' || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) return frameOf(e, root);
    e = e.parentElement;
  }
  return null;
}
/** what moves / resizes with an element: in a converted PPTX its shape wrapper, elsewhere a positioned parent of the same size */
function frameOf(el, root) {
  if (!el || el === root) return el;
  if (root.hasAttribute('data-my')) { const sp = el.closest('[data-sp]'); if (sp && root.contains(sp)) return sp; }
  let e = el;
  for (let i = 0; i < 4; i++) {
    const p = e.parentElement; if (!p || p === root) break;
    if (!abs(p)) break;
    const a = e.getBoundingClientRect(), b = p.getBoundingClientRect();
    if (Math.abs(a.left - b.left) + Math.abs(a.top - b.top) + Math.abs(a.width - b.width) + Math.abs(a.height - b.height) > 6) break;
    e = p;
  }
  return e;
}
function posOf(el) {
  const s = el.style;
  if (abs(el)) {
    const cs = getComputedStyle(el);
    const useR = !s.left && !!s.right, useB = !s.top && !!s.bottom;
    return { abs: true, useR, useB, x: useR ? parseFloat(cs.right) : el.offsetLeft, y: useB ? parseFloat(cs.bottom) : el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  }
  const tr = String(s.translate || '').split(/\s+/).map(parseFloat);
  return { abs: false, x: tr[0] || 0, y: tr[1] || 0, w: el.offsetWidth, h: el.offsetHeight };
}
function setPos(el, st, dx, dy) {
  if (st.abs) { if (st.useR) el.style.right = pxs(st.x - dx); else el.style.left = pxs(st.x + dx); if (st.useB) el.style.bottom = pxs(st.y - dy); else el.style.top = pxs(st.y + dy); }
  else el.style.translate = pxs(st.x + dx) + ' ' + pxs(st.y + dy);
}
const maxIdx = (root, attr) => Math.max(-1, ...Array.from(root.querySelectorAll('[' + attr + ']')).map((e) => Number(e.getAttribute(attr)) || 0));
function renumber(node, root) {
  let tb = maxIdx(root, 'data-tb'), im = maxIdx(root, 'data-img');
  for (const e of [node, ...node.querySelectorAll('[data-tb],[data-img]')]) {
    if (e.hasAttribute && e.hasAttribute('data-tb')) e.setAttribute('data-tb', String(++tb));
    if (e.hasAttribute && e.hasAttribute('data-img')) e.setAttribute('data-img', String(++im));
  }
}
/** the drawn layout → the HTML a template keeps (no editor state, packed pictures back to their address) */
function serialize(root) {
  const c = root.cloneNode(true);
  c.querySelectorAll('[contenteditable]').forEach((e) => e.removeAttribute('contenteditable'));
  c.querySelectorAll('[spellcheck]').forEach((e) => e.removeAttribute('spellcheck'));
  c.querySelectorAll('img[data-fill]').forEach((e) => e.setAttribute('src', BLANK));
  return c.outerHTML;
}
const KIND = (el) => (!el ? '' : el.hasAttribute('data-tb') ? '글' : el.querySelector && (el.hasAttribute('data-img') || el.querySelector('[data-img]')) ? '이미지 칸' : el.hasAttribute('data-sp') || el.tagName === 'svg' ? '도형' : '요소');

export function LayoutEditor({ f, ov: vals = null, asCopy = false, context = {}, onClose, onSaved }) {
  const src = L[f];
  const own = isMy(f) && !asCopy;
  const [name, setName] = useState(src ? (own ? src.name : src.name + ' · 내 버전') : '내 템플릿');
  const part = src?.p || '';
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(false);
  const [, setTick] = useState(0); const bump = () => setTick((t) => t + 1);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [ask, setAsk] = useState(false);
  const [pick, setPick] = useState(null); // image slot being filled
  const [backgroundPick, setBackgroundPick] = useState(false);
  const [improving, setImproving] = useState(false);
  const initialStructure = useRef(null), initialRepeats = useRef(0);
  const [scale, setScale] = useState(0.5);
  const [ov, setOv] = useState(null); // selection box on screen
  const [hover, setHover] = useState(null);
  const hovered = useRef(null);
  const [recol, setRecol] = useState(null); // colour being replaced
  const boxRef = useRef(null), hostRef = useRef(null), fitRef = useRef(null);
  const hist = useRef({ u: [], r: [] });
  useWorkContext('layout_editor', () => ({ f, name, part, asCopy, dirty, busy, improving, editing, context,
    selection: sel ? { text: sel.textContent, textId: sel.getAttribute('data-tb'), imageId: sel.getAttribute('data-img'), shapeId: sel.getAttribute('data-sp'), style: sel.getAttribute('style') } : null,
    undo: hist.current.u.length, redo: hist.current.r.length, html: hostRef.current?.firstElementChild ? tokenize(serialize(hostRef.current.firstElementChild)) : '' }));
  const colSnap = useRef(false);
  const bgEdited = useRef(false);
  const bgPreviews = useRef(null), bgAdopting = useRef(null);
  if (!bgPreviews.current) bgPreviews.current = createBackgroundPreviewSession();
  const rootOf = () => (hostRef.current ? hostRef.current.firstElementChild : null);
  const refreshBackground = async (r = rootOf()) => { await renderBackgroundPreview(r, bgPreviews.current); if (r === rootOf()) bump(); };
  const previewBackground = (r = rootOf()) => { refreshBackground(r).catch(error => toast('배경 효과를 적용하지 못했어요: ' + error.message, 'warn')); };
  useEffect(() => () => disposeBackgroundPreviews(bgPreviews.current), []);

  // A filled sheet (찜 or Storyboard) starts with its current values baked in.
  useLayoutEffect(() => { hostRef.current.innerHTML = layoutHtml(f); const r = rootOf(); if (r) { initialStructure.current = r.getAttribute('data-layout-reflow'); initialRepeats.current = visibleRepeatCards(r).length; if (vals) applyOverrides(r, vals); hydrateFill(r); r.querySelectorAll('img').forEach((im) => im.setAttribute('draggable', 'false')); if (r.hasAttribute('data-bg')) previewBackground(r); } bump(); }, []);
  useEffect(() => { // its background photo comes from a shared pack — keep a copy of its own so the template stands alone
    if (!vals || !vals.bg || !vals.bg.src || vals.bg.embedded) return;
    let alive = true;
    (async () => {
      try {
        const u = bgUrl(vals.bg.src) || (await loadBg(vals.bg.src)) || resolveImg(vals.bg.src);
        if (!u || !alive) return;
        const id = await storeImage(u); const r = rootOf(); if (!r || !alive || bgEdited.current) return;
        r.removeAttribute('data-bg-wait'); r.style.backgroundImage = 'url("' + imgUrl(id) + '")'; r.style.backgroundSize = 'cover'; r.style.backgroundPosition = 'center'; r.setAttribute('data-bg', imgUrl(id)); previewBackground(r); bump();
      } catch (e) {}
    })();
    return () => { alive = false; };
  }, []);
  useLayoutEffect(() => {
    const el = fitRef.current; if (!el) return undefined;
    const fit = () => { const r = el.getBoundingClientRect(); setScale(Math.max(0.15, Math.min((r.width - 8) / 1280, (r.height - 8) / 720))); };
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  });
  // selection box (screen px inside the stage box)
  useLayoutEffect(() => {
    const root = rootOf();
    if (!sel || !root || !root.contains(sel)) { if (ov) setOv(null); return; }
    const fr = frameOf(sel, root);
    const o = boxRef.current.getBoundingClientRect(), r = fr.getBoundingClientRect();
    const t = sel !== fr ? sel.getBoundingClientRect() : null;
    const next = { l: r.left - o.left, t: r.top - o.top, w: r.width, h: r.height, inner: t ? { l: t.left - o.left, t: t.top - o.top, w: t.width, h: t.height } : null };
    if (!ov || JSON.stringify(ov) !== JSON.stringify(next)) setOv(next);
  });

  // Preview the same frame that clicking would select; keep all hover decoration outside saved slide HTML.
  const clearHover = () => { hovered.current = null; setHover(null); };
  const showHover = el => {
    const root = rootOf(), box = boxRef.current;
    if (!el || !root?.contains(el) || !box || editing || busy || improving || ask || pick || backgroundPick) { clearHover(); return; }
    const frame = frameOf(el, root);
    if (sel && root.contains(sel) && frame === frameOf(sel, root)) { clearHover(); return; }
    const a = box.getBoundingClientRect(), b = frame.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) { clearHover(); return; }
    hovered.current = el;
    const next = { l: b.left - a.left, t: b.top - a.top, w: b.width, h: b.height, label: KIND(el), edge: b.right > a.right - 135 };
    setHover(previous => previous && Object.keys(next).every(k => previous[k] === next[k]) ? previous : next);
  };
  useLayoutEffect(() => { showHover(hovered.current); });
  const onHover = event => {
    if (event.pointerType === 'touch' || event.buttons) { clearHover(); return; }
    showHover(pickEl(event.target, rootOf()));
  };

  const snap = () => { const r = rootOf(); hist.current.u.push(r.outerHTML); if (hist.current.u.length > 80) hist.current.u.shift(); hist.current.r = []; setDirty(true); };
  const restore = (html) => { clearHover(); hostRef.current.innerHTML = html; const r = rootOf(); hydrateFill(r); if (r.hasAttribute('data-bg')) previewBackground(r); setSel(null); setEditing(false); bump(); };
  const undo = () => { const h = hist.current; if (!h.u.length) return; stopEdit(); h.r.push(rootOf().outerHTML); restore(h.u.pop()); };
  const redo = () => { const h = hist.current; if (!h.r.length) return; stopEdit(); h.u.push(rootOf().outerHTML); restore(h.r.pop()); };

  const startEdit = (el, ev) => {
    if (!el || !el.hasAttribute('data-tb')) return;
    clearHover(); snap();
    el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'false'); el.focus({ preventScroll: true });
    const s = window.getSelection();
    let r = null;
    if (ev && document.caretRangeFromPoint) { r = document.caretRangeFromPoint(ev.clientX, ev.clientY); if (r && !el.contains(r.startContainer)) r = null; }
    if (!r) { r = document.createRange(); r.selectNodeContents(el); }
    s.removeAllRanges(); s.addRange(r);
    setSel(el); setEditing(true);
  };
  function stopEdit() {
    const root = rootOf(); if (!root) return;
    root.querySelectorAll('[contenteditable]').forEach((e) => { e.removeAttribute('contenteditable'); e.removeAttribute('spellcheck'); e.blur(); });
    setEditing(false); bump();
  }
  const onEditKey = (e) => {
    if (!editing) return;
    if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopEdit(); }
  };
  const onPaste = (e) => { if (!editing) return; e.preventDefault(); const t = (e.clipboardData && e.clipboardData.getData('text/plain')) || ''; document.execCommand('insertText', false, t); };

  // press on the slide: select · drag to move · press a selected text again to type
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    clearHover();
    const root = rootOf(); const t = e.target;
    if (editing && sel && sel.contains(t)) return;
    if (editing) stopEdit();
    const el = pickEl(t, root);
    if (!el) { setSel(null); return; }
    e.preventDefault();
    const again = el === sel;
    setSel(el);
    const fr = frameOf(el, root);
    const st = posOf(fr); const x0 = e.clientX, y0 = e.clientY; let moved = false;
    const k = scale;
    const move = (ev) => {
      const dx = (ev.clientX - x0) / k, dy = (ev.clientY - y0) / k;
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      if (!moved) { snap(); moved = true; }
      setPos(fr, st, Math.round(dx), Math.round(dy)); bump();
    };
    const up = (ev) => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (!moved && again && el.hasAttribute('data-tb')) startEdit(el, ev); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const onDouble = (e) => { const root = rootOf(); const el = pickEl(e.target, root); if (el && el.hasAttribute('data-tb') && !editing) startEdit(el, e); };
  const onHandle = (dir) => (e) => {
    e.preventDefault(); e.stopPropagation(); clearHover();
    const root = rootOf(); const fr = frameOf(sel, root); const st = posOf(fr);
    const x0 = e.clientX, y0 = e.clientY, k = scale; let moved = false;
    const move = (ev) => {
      const dx = (ev.clientX - x0) / k, dy = (ev.clientY - y0) / k;
      if (!moved) { snap(); moved = true; }
      let { x, y, w, h } = st;
      if (/e/.test(dir)) w = Math.max(8, st.w + dx);
      if (/s/.test(dir)) h = Math.max(8, st.h + dy);
      if (/w/.test(dir)) { w = Math.max(8, st.w - dx); x = st.x + (st.w - w) * (st.useR ? 0 : 1); }
      if (/n/.test(dir)) { h = Math.max(8, st.h - dy); y = st.y + (st.h - h) * (st.useB ? 0 : 1); }
      fr.style.width = pxs(w); fr.style.height = pxs(h);
      if (st.abs) { if (!st.useR) fr.style.left = pxs(x); if (!st.useB) fr.style.top = pxs(y); }
      else if (/[nw]/.test(dir)) fr.style.translate = pxs(st.x + (st.w - w) * (/w/.test(dir) ? 1 : 0)) + ' ' + pxs(st.y + (st.h - h) * (/n/.test(dir) ? 1 : 0));
      bump();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // actions on the selection
  const frame = () => (sel ? frameOf(sel, rootOf()) : null);
  const confirmingRemoval=useRef(false);
  const remove = async () => {const fr=frame();if(!fr||fr===rootOf()||confirmingRemoval.current)return;confirmingRemoval.current=true;try{if(await confirmDelete({title:'선택 영역을 삭제할까요?',message:'선택한 '+KIND(sel)+' 영역과 내용을 삭제합니다.'})){if(!fr.isConnected)return;snap();fr.remove();setSel(null);}}finally{confirmingRemoval.current=false;}};
  const duplicate = () => {
    const fr = frame(); const root = rootOf(); if (!fr || fr === root) return;
    snap(); const c = fr.cloneNode(true); renumber(c, root);
    fr.after(c);
    const st = posOf(c); setPos(c, st, 16, 16);
    setSel(sel === fr ? c : c.querySelector('[data-tb="' + maxIdx(root, 'data-tb') + '"]') || c);
  };
  const front = () => { const fr = frame(); if (!fr) return; snap(); fr.parentElement.appendChild(fr); bump(); };
  const back = () => { const fr = frame(); if (!fr) return; snap(); const p = fr.parentElement; const after = Array.from(p.children).filter((x) => x.hasAttribute('data-bg-fill')).pop(); if (after) after.after(fr); else p.prepend(fr); bump(); };
  const nudge = (dx, dy) => { const fr = frame(); if (!fr || fr === rootOf()) return; snap(); setPos(fr, posOf(fr), dx, dy); bump(); };
  const tb = sel && sel.hasAttribute('data-tb') ? sel : null;
  const runs = (el) => Array.from(el.querySelectorAll('span,b,strong,em,i,small,font'));
  const textCss = (prop, val) => { if (!tb) return; snap(); if (prop === 'fontSize') { const cur = parseFloat(getComputedStyle(tb).fontSize) || val; const k = val / cur; for (const r of runs(tb)) if (r.style.fontSize) r.style.fontSize = pxs(parseFloat(r.style.fontSize) * k); tb.style.fontSize = pxs(val); } else { tb.style[prop] = val; for (const r of runs(tb)) r.style.removeProperty(prop.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())); } bump(); };
  const fontPx = tb ? Math.round(parseFloat(getComputedStyle(tb).fontSize) || 16) : 0;
  const isBold = tb ? (parseInt(getComputedStyle(tb).fontWeight) || 400) >= 600 : false;
  const isItalic = tb ? getComputedStyle(tb).fontStyle === 'italic' : false;
  const align = tb ? getComputedStyle(tb).textAlign : '';
  const tColor = tb ? normColor(getComputedStyle(tb).color) : null;
  // image slot of the selection
  const slot = sel ? (sel.hasAttribute('data-img') ? sel : sel.querySelector && sel.querySelector('[data-img]')) : null;
  const putImg = async (v) => {
    const el = pick; setPick(null); if (!el) return;
    snap();
    let srcv = v ? v.src : null; let packed = null;
    try {
      if (srcv && /\.json#\d+$/.test(srcv)) { packed = srcv; srcv = bgUrl(srcv) || BLANK; }
      else if (srcv && srcv.startsWith('u:')) { const id = await storeImage(resolveImg(srcv)); srcv = imgUrl(id); }
      else if (srcv && /^data:/.test(srcv)) { const id = await storeImage(srcv); srcv = imgUrl(id); }
    } catch (e) { toast('이미지를 넣지 못했어요', 'warn'); return; }
    let im = el.tagName === 'IMG' ? el : el.querySelector('img');
    if (!srcv) { if (im && im !== el) im.remove(); el.style.background = '#eef0f4'; bump(); return; }
    if (!im) { el.innerHTML = ''; im = document.createElement('img'); el.appendChild(im); el.style.overflow = 'hidden'; }
    im.setAttribute('src', srcv); im.setAttribute('draggable', 'false'); im.alt = (v && v.name) || '';
    if (packed) im.setAttribute('data-fill', packed); else im.removeAttribute('data-fill');
    if (im !== el) { im.style.display = 'block'; im.style.width = '100%'; im.style.height = '100%'; }
    im.style.objectFit = (v && v.fit) || 'cover';
    if (packed) hydrateFill(rootOf());
    bump();
  };
  const imgFit = (fit) => { const im = slot && (slot.tagName === 'IMG' ? slot : slot.querySelector('img')); if (!im) return; snap(); im.style.objectFit = fit; bump(); };
  // fill of a shape
  const fillEl = (() => { const fr = frame(); if (!fr || tb === fr) return null; if (fr.tagName === 'svg') return fr; if (normColor(getComputedStyle(fr).backgroundColor)) return fr; const c = Array.from(fr.children).find((x) => x.tagName === 'svg' || (!x.hasAttribute('data-img') && normColor(getComputedStyle(x).backgroundColor))); return c || null; })();
  const fillColor = fillEl ? (fillEl.tagName === 'svg' ? normColor((fillEl.querySelector('path[fill]:not([fill="none"])') || { getAttribute: () => '' }).getAttribute('fill')) : normColor(getComputedStyle(fillEl).backgroundColor)) : null;
  const setFill = (c) => { if (!fillEl) return; if (!colSnap.current) { snap(); colSnap.current = true; } if (fillEl.tagName === 'svg') fillEl.querySelectorAll('path').forEach((p) => { if (p.getAttribute('fill') !== 'none') p.setAttribute('fill', c); }); else fillEl.style.background = c; bump(); };
  const setText = (c) => { if (!tb) return; if (!colSnap.current) { snap(); colSnap.current = true; } tb.style.color = c; for (const r of runs(tb)) r.style.removeProperty('color'); bump(); };
  // whole slide
  const root = rootOf();
  const palette = root ? colorsIn(root) : [];
  const addText = () => {
    const r = rootOf(); snap();
    const d = document.createElement('div'); d.setAttribute('data-tb', String(maxIdx(r, 'data-tb') + 1));
    d.setAttribute('style', "position:absolute;left:440px;top:320px;width:400px;font-size:28px;font-weight:700;line-height:1.35;color:#121417;font-family:'Noto Sans KR', sans-serif;white-space:pre-wrap");
    d.textContent = '새 글 상자'; r.appendChild(d); setTimeout(() => startEdit(d), 0);
  };
  const addImage = () => {
    const r = rootOf(); snap();
    const d = document.createElement('div'); d.setAttribute('data-img', String(maxIdx(r, 'data-img') + 1)); d.setAttribute('data-kind', 'photo');
    d.setAttribute('style', "position:absolute;left:440px;top:180px;width:400px;height:300px;overflow:hidden;border-radius:12px;background:#eef0f4;display:flex;align-items:center;justify-content:center;color:#8a93a3;font-size:18px;font-family:'Noto Sans KR', sans-serif");
    d.textContent = '이미지'; r.appendChild(d); setSel(d); setPick(d);
  };
  const bgColor = root ? normColor(getComputedStyle(root).backgroundColor) || '#ffffff' : '#ffffff';
  const background = backgroundState(root);
  const hasBgPic = background.hasPhoto;
  const sheetText = root?.textContent || src?.txt || '';
  const backgroundContext = { industry: src?.ind || inferIndustry(sheetText) || context.industry || L[src?.my?.from]?.ind, text: [sheetText, context.partName, src?.name].filter(Boolean).join(' '), part };
  const setBg = (c) => { const r = rootOf(); if (!colSnap.current) { snap(); colSnap.current = true; } bgEdited.current = true; clearLayoutBackground(r); r.style.background = c; bump(); };
  const putBackground = async image => {
    let address = image.src.startsWith('u:') ? resolveImg(image.src) : image.src;
    if (/\.json#\d+$/.test(address)) address = await loadBg(address);
    if (!address) throw new Error('사진 원본을 읽지 못했어요.');
    const response = await fetchResource(address);
    if (!response.ok) throw new Error('배경 사진을 불러오지 못했어요. 다시 선택해 주세요.');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('이미지 원본을 읽지 못했어요.');
    const id = await storeImage(blob);
    stopEdit(); snap(); bgEdited.current = true;
    setLayoutBackground(rootOf(), imgUrl(id), image); setSel(null); await refreshBackground(); bump();
  };
  const removeBackground = async () => {if(await confirmDelete({title:'배경 사진을 삭제할까요?',message:'레이아웃의 배경 사진을 삭제합니다.'})){snap();bgEdited.current=true;clearLayoutBackground(rootOf());bump();}};
  const changeBackgroundEffects = patch => {
    if (busy) return;
    const r = rootOf();
    if (!colSnap.current) { snap(); colSnap.current = true; }
    bgEdited.current = true; setBackgroundEffects(r, patch); bump();
    (async () => {
      // A full-bleed cover/imported picture can become an adjustable background
      // without asking the user to choose the same photograph again.
      if (!r.hasAttribute('data-bg')) {
        const original = backgroundState(r);
        if (!original.src) return;
        if (bgAdopting.current?.root !== r) {
          const promise = (async () => {
            const id = await storeImage(original.src);
            if (r !== rootOf() || r.hasAttribute('data-bg') || !r.hasAttribute('data-bg-effects')) return;
            setLayoutBackground(r, imgUrl(id), { src: original.source || original.src, id: original.id || 'existing', title: original.name });
          })();
          bgAdopting.current = { root: r, promise };
        }
        const adoption = bgAdopting.current;
        try { await adoption.promise; } finally { if (bgAdopting.current === adoption) bgAdopting.current = null; }
      }
      if (r === rootOf()) await refreshBackground(r);
    })().catch(error => toast('배경 효과를 적용하지 못했어요: ' + error.message, 'warn'));
  };
  const doRecolor = (to) => { const r = rootOf(); if (!recol) return; if (!colSnap.current) { snap(); colSnap.current = true; } const n = replaceColor(r, recol, to); setRecol(normColor(to)); bump(); return n; };

  // keys
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    const t = e.target;
    if (pick || backgroundPick || ask || busy || improving || document.querySelector('.delete-confirmation')) return;
    if (t && (/^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) || t.closest?.('.ed-help-button, .ed-action-popover'))) return;
    const mod = e.metaKey || e.ctrlKey;
    if (editing) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stopEdit(); } return; }
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); duplicate(); return; }
    if (e.key === 'Escape') { if (sel) { e.preventDefault(); e.stopPropagation(); setSel(null); } else if (dirty) { e.preventDefault(); e.stopPropagation(); setAsk(true); } return; }
    if (!sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
    if (e.key === 'Enter' && tb) { e.preventDefault(); startEdit(tb); return; }
    const step = e.shiftKey ? 10 : 1;
    const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (arrows[e.key]) { e.preventDefault(); nudge(...arrows[e.key]); }
  };
  useEffect(() => { const h = (e) => keyRef.current && keyRef.current(e); document.addEventListener('keydown', h, true); return () => document.removeEventListener('keydown', h, true); }, []);

  const save = async (asNew) => {
    if (busy || improving) return;
    stopEdit(); setBusy(true);
    try {
      const r = rootOf();
      if (bgAdopting.current?.root === r) await bgAdopting.current.promise;
      const photo = r.getAttribute('data-bg') || r.getAttribute('data-bg-wait');
      if (photo && !tokenize(photo).startsWith('wmimg:')) {
        const address = /\.json#\d+$/.test(photo) ? await loadBg(photo) : resolveImg(photo) || photo;
        if (!address) throw new Error('배경 사진을 읽지 못했어요. 다시 시도해 주세요.');
        const id = await storeImage(address);
        bgEdited.current = true; r.removeAttribute('data-bg-wait');
        r.style.backgroundImage = 'url("' + imgUrl(id) + '")'; r.setAttribute('data-bg', imgUrl(id));
      }
      if (r.hasAttribute('data-bg')) {
        await refreshBackground(r);
        const rendered = r.getAttribute('data-bg-rendered');
        if (rendered && !tokenize(rendered).startsWith('wmimg:')) {
          const id = await storeImage(rendered);
          r.style.backgroundImage = 'url("' + imgUrl(id) + '")'; r.setAttribute('data-bg-rendered', imgUrl(id));
        }
      }
      const repeatCount = visibleRepeatCards(r).length;
      if (r.hasAttribute('data-repeat-count')) {
        r.setAttribute('data-repeat-count', String(repeatCount));
        if (repeatCount !== initialRepeats.current) {
          if (r.getAttribute('data-layout-reflow') === initialStructure.current) r.removeAttribute('data-reflow-report');
          for (const attr of ['data-tb', 'data-img']) [...r.querySelectorAll('[' + attr + ']')].forEach((el, i) => el.setAttribute(attr, String(i)));
        }
      }
      const html = tokenize(serialize(r));
      const m = measure(r);
      const nm = name.trim() || (src ? src.name : '내 템플릿');
      const structureChanged = r.getAttribute('data-layout-reflow') !== initialStructure.current || repeatCount !== initialRepeats.current;
      const keep = own && !asNew && !structureChanged;
      const base = { name: nm, p: part, text: m.text, title: m.title, nT: m.nT, nI: m.nI, pf: m.pf };
      const meta = keep
        ? myMeta({ ...base, f, when: src.when, kind: src.my.kind, file: src.my.file, page: src.my.page, from: src.my.from, batch: src.my.batch, at: src.my.at })
        : myMeta({ ...base, f: newF(), when: src ? '‘' + src.name + '’을 고쳐 만듦' : '', kind: 'edit', from: own ? src.my.from || src.f : f, batch: 'edit' });
      if (r.hasAttribute('data-repeat-count')) {
        meta.pc = r.getAttribute('data-repeat-unit') === 'card' ? 0 : Number(r.getAttribute('data-repeat-count'));
        meta.repeat = { count: Number(r.getAttribute('data-repeat-count')), unit: r.getAttribute('data-repeat-unit'), label: r.getAttribute('data-repeat-label') || '항목' };
        meta.prods = reflowProducts(r);
        meta.ind = src.ind || context.industry || null;
        meta.req = src.req || [];
        meta.sols = src.sols || []; meta.sol = src.sol || null; meta.p2 = src.p2 || null;
        meta.nT = r.querySelectorAll('[data-tb]').length;
        const slots = [...r.querySelectorAll('[data-img]')]; meta.ik = slots.map(el => el.getAttribute('data-kind') || 'photo'); meta.ih = slots.map(el => el.getAttribute('data-hint') || '이미지');
        const placeholders = [...r.querySelectorAll('[data-tb]')].map(el => el.textContent).filter(text => /\[[^\]]+\]/.test(text)); meta.ph = placeholders.length; meta.phs = placeholders.slice(0, 8);
        try { meta.my.reflow = JSON.parse(r.getAttribute('data-reflow-report')); } catch { /* Manual edits may have no AI audit. */ }
      }
      const [saved] = await saveTemplates([{ meta, html }]);
      setDirty(false);
      onSaved(saved, keep);
    } catch (e) { console.error(e); toast(/quota/i.test(String(e && (e.name || e.message))) ? '브라우저 저장 공간이 모자라요. 다른 My 템플릿을 지워 주세요' : '저장하지 못했어요: ' + (e && e.message ? e.message : e), 'warn'); }
    setBusy(false);
  };
  const close = () => { if (busy) return; stopEdit(); if (dirty) setAsk(true); else onClose(); };
  const applyReflow = result => {
    stopEdit(); snap(); restore(result.html);
    const expected = src ? (own ? src.name : src.name + ' · 내 버전') : '내 템플릿';
    if (result.name && name === expected) setName(result.name);
    toast('요청한 레이아웃 변경을 적용했어요 · 저장하면 원본과 별도로 보관돼요');
  };
  const structureChanged = root?.getAttribute('data-layout-reflow') !== initialStructure.current || !!root && visibleRepeatCards(root).length !== initialRepeats.current;
  const saveLabel = structureChanged ? '새 My 템플릿으로 저장' : '저장';
  const fr = sel && root ? frameOf(sel, root) : null;
  const frPos = fr && fr !== root ? posOf(fr) : null;
  const shownX = frPos ? (frPos.abs ? fr.offsetLeft : frPos.x) : 0, shownY = frPos ? (frPos.abs ? fr.offsetTop : frPos.y) : 0;
  const setNum = (key, v) => {
    if (!fr || !frPos || !isFinite(v)) return; snap();
    if (key === 'x') setPos(fr, frPos, v - shownX, 0);
    if (key === 'y') setPos(fr, frPos, 0, v - shownY);
    if (key === 'w') fr.style.width = pxs(Math.max(8, v));
    if (key === 'h') fr.style.height = pxs(Math.max(8, v));
    bump();
  };

  const colorRow = (cur, onPick, label) => (
    <div className="ed-colors" role="group" aria-label={label}>
      {[...new Set([...palette.slice(0, 8), ...SWATCH])].slice(0, 14).map((c) => <button key={c} type="button" className={'ed-sw' + (cur === c ? ' on' : '')} style={{ background: c }} title={c} aria-label={label + ' ' + c} onClick={() => { colSnap.current = false; onPick(c); colSnap.current = false; }} />)}
      <label className="ed-sw ed-sw-custom" title="다른 색"><Icon name="plus" size={12} /><input type="color" value={/^#[0-9a-f]{6}$/i.test(cur || '') ? cur : '#000000'} onFocus={() => { colSnap.current = false; }} onChange={(e) => onPick(e.target.value)} onBlur={() => { colSnap.current = false; }} aria-label={label + ' 직접 고르기'} /></label>
    </div>
  );

  return (
    <Modal size="sheet" onClose={close} bodyClass="myed" title={<span className="tl-dt">레이아웃 수정 · {src?.name || '내 템플릿'}</span>}
      headerActions={<EditorHelp own={own} asCopy={asCopy} />}
      footer={<>
        <span className="sp" />
        <button className="btn" disabled={busy} onClick={close}>닫기</button>
        {own && !structureChanged && <button className="btn" disabled={busy || improving} onClick={() => save(true)}><Icon name="copy" size={14} />새 템플릿으로 저장</button>}
        <button className="btn btn-primary" disabled={busy || improving} onClick={() => save(false)}>{busy ? <span className="spin" /> : <Icon name="check" size={15} />}{saveLabel}</button>
      </>}>
      <div className="ed-main">
        <div className="ed-bar" role="toolbar" aria-label="편집 도구">
          <button className="btn btn-sm btn-icon" disabled={!hist.current.u.length} onClick={undo} aria-label="되돌리기" title="되돌리기"><Icon name="undo" size={15} /></button>
          <button className="btn btn-sm btn-icon" disabled={!hist.current.r.length} onClick={redo} aria-label="다시 하기" title="다시 하기"><Icon name="redo" size={15} /></button>
          <span className="ed-sep" />
          <button className="btn btn-sm" onClick={addText}><Icon name="type" size={14} />글 상자</button>
          <button className="btn btn-sm" onClick={addImage}><Icon name="image" size={14} />이미지 칸</button>
          <span className="sp" />
          {sel ? <span className="ed-selname"><b>{KIND(sel)}</b> 선택됨{editing ? ' · 입력 중' : ''}</span> : <span className="faint ed-selname">요소를 눌러 고르세요</span>}
        </div>
        <div ref={fitRef} className="ed-fit">
          <div ref={boxRef} className={'ed-box' + (editing ? ' typing' : '') + (hover ? ' has-hover' : '')} style={{ width: Math.round(1280 * scale), height: Math.round(720 * scale) }}
            onPointerMove={onHover} onPointerOver={onHover} onPointerLeave={clearHover} onPointerDown={onPointerDown} onDoubleClick={onDouble} onKeyDown={onEditKey} onPaste={onPaste}>
            <div ref={hostRef} className="ed-host" style={{ transform: 'scale(' + scale + ')' }} />
            {hover && <div className="ed-hover" data-hover-kind={hover.label} aria-hidden="true" style={{ left: hover.l, top: hover.t, width: hover.w, height: hover.h }}>
              <span className={'ed-hover-label' + (hover.edge ? ' edge' : '')} style={{ top: hover.t < 24 ? 3 : -23 }}><b>{hover.label}</b><span>클릭하여 선택</span></span>
            </div>}
            {ov && (
              <div className="ed-sel" style={{ left: ov.l, top: ov.t, width: ov.w, height: ov.h }} aria-hidden="true">
                {!editing && ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((d) => <span key={d} className={'ed-h ' + d} onPointerDown={onHandle(d)} />)}
              </div>
            )}
            {ov && ov.inner && <div className="ed-sel inner" style={{ left: ov.inner.l, top: ov.inner.t, width: ov.inner.w, height: ov.inner.h }} aria-hidden="true" />}
          </div>
        </div>
        <LayoutPromptAgent getRoot={rootOf} meta={src} context={context} onApply={applyReflow} onBusy={setImproving} onPrepare={stopEdit} />
      </div>
      <aside className="ed-panel" aria-label="속성">
        {sel ? (
          <>
            {tb && (
              <section className="ed-sec">
                <h4><Icon name="type" size={14} />글</h4>
                <div className="ed-row">
                  <div className="ed-num"><button className="btn btn-sm btn-icon" aria-label="글자 작게" onClick={() => textCss('fontSize', Math.max(6, fontPx - 2))}><Icon name="minus" size={13} /></button>
                    <input className="input num" type="number" min="6" max="300" value={fontPx} aria-label="글자 크기(px)" onChange={(e) => textCss('fontSize', Math.max(6, Number(e.target.value) || fontPx))} />
                    <button className="btn btn-sm btn-icon" aria-label="글자 크게" onClick={() => textCss('fontSize', fontPx + 2)}><Icon name="plus" size={13} /></button></div>
                  <button className={'btn btn-sm btn-icon' + (isBold ? ' on' : '')} aria-pressed={isBold} aria-label="굵게" onClick={() => textCss('fontWeight', isBold ? '400' : '700')}><Icon name="bold" size={14} /></button>
                  <button className={'btn btn-sm btn-icon' + (isItalic ? ' on' : '')} aria-pressed={isItalic} aria-label="기울임" onClick={() => textCss('fontStyle', isItalic ? 'normal' : 'italic')}><Icon name="italic" size={14} /></button>
                </div>
                <div className="seg ed-align" role="group" aria-label="정렬">
                  {[['left', 'alignL', '왼쪽'], ['center', 'alignC', '가운데'], ['right', 'alignR', '오른쪽']].map(([a, ic, lb]) => <button key={a} aria-pressed={align === a || (a === 'left' && /start/.test(align))} onClick={() => textCss('textAlign', a)} aria-label={lb + ' 정렬'}><Icon name={ic} size={14} /></button>)}
                </div>
                <span className="ed-lbl">글자 색</span>
                {colorRow(tColor, setText, '글자 색')}
                {!editing && <button className="btn btn-sm" onClick={() => startEdit(tb)}><Icon name="edit" size={13} />글 고치기</button>}
              </section>
            )}
            {slot && (
              <section className="ed-sec">
                <h4><Icon name="image" size={14} />이미지 칸</h4>
                <div className="ed-row">
                  <button className="btn btn-sm btn-primary" onClick={() => setPick(slot)}><Icon name="swap" size={13} />이미지 바꾸기</button>
                </div>
                <div className="seg" role="group" aria-label="맞춤">
                  <button aria-pressed={!(slot.querySelector('img') || slot).style || (slot.querySelector('img') || slot).style.objectFit !== 'contain'} onClick={() => imgFit('cover')}>칸 채우기</button>
                  <button aria-pressed={((slot.querySelector('img') || slot).style || {}).objectFit === 'contain'} onClick={() => imgFit('contain')}>전체 보이기</button>
                </div>
              </section>
            )}
            {fillEl && (
              <section className="ed-sec">
                <h4><Icon name="palette" size={14} />채우기</h4>
                {colorRow(fillColor, setFill, '채우기 색')}
              </section>
            )}
            {frPos && (
              <section className="ed-sec">
                <h4><Icon name="move" size={14} />위치 · 크기 <span className="faint" style={{ fontWeight: "var(--weight-600)" }}>px</span></h4>
                <div className="ed-xywh">
                  <label>X<input className="input num" type="number" value={Math.round(shownX)} onChange={(e) => setNum('x', Number(e.target.value))} /></label>
                  <label>Y<input className="input num" type="number" value={Math.round(shownY)} onChange={(e) => setNum('y', Number(e.target.value))} /></label>
                  <label>W<input className="input num" type="number" value={Math.round(frPos.w)} onChange={(e) => setNum('w', Number(e.target.value))} /></label>
                  <label>H<input className="input num" type="number" value={Math.round(frPos.h)} onChange={(e) => setNum('h', Number(e.target.value))} /></label>
                </div>
              </section>
            )}
            <section className="ed-sec">
              <h4><Icon name="layers" size={14} />정리</h4>
              <div className="ed-row wrap">
                <button className="btn btn-sm" onClick={front}><Icon name="front" size={13} />맨 앞으로</button>
                <button className="btn btn-sm" onClick={back}><Icon name="back" size={13} />맨 뒤로</button>
                <button className="btn btn-sm" onClick={duplicate}><Icon name="copy" size={13} />복제</button>
                <button className="btn btn-sm btn-ghost btn-danger" onClick={remove}><Icon name="trash" size={13} />지우기</button>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setSel(null)}>선택 풀기</button>
            </section>
          </>
        ) : (
          <>
            <section className="ed-sec">
              <h4><Icon name="palette" size={14} />색 바꾸기</h4>
              <p className="ed-help">이 장에 쓰인 색이에요. 하나를 고르고 새 색을 고르면 그 색이 쓰인 곳이 모두 바뀌어요.</p>
              <div className="ed-colors" role="group" aria-label="이 장의 색">
                {palette.map((c) => <button key={c} type="button" className={'ed-sw' + (recol === c ? ' on' : '')} style={{ background: c }} title={c} aria-label={'바꿀 색 ' + c} onClick={() => { colSnap.current = false; setRecol(recol === c ? null : c); }} />)}
              </div>
              {recol && <div className="ed-recol"><span className="ed-sw" style={{ background: recol }} aria-hidden="true" /><Icon name="arrowR" size={13} />{colorRow(null, (c) => doRecolor(c), '새 색')}</div>}
            </section>
            <section className="ed-sec">
              <h4><Icon name="cover" size={14} />배경</h4>
              {colorRow(bgColor, setBg, '배경색')}
              <button className="btn btn-sm" disabled={busy} onClick={() => { stopEdit(); setBackgroundPick(true); }}><Icon name="image" size={14} />{hasBgPic ? '배경 사진 바꾸기' : '배경 사진 선택'}</button>
              {background.src && <img className="ed-background-thumb" src={background.preview} alt={background.name} />}
              {background.src && <BackgroundEffects value={background.effects} disabled={busy} onChange={changeBackgroundEffects} onStart={() => { colSnap.current = false; }} onEnd={() => { colSnap.current = false; }} />}
              {hasBgPic && <button className="btn btn-ghost btn-sm" onClick={removeBackground}><Icon name="trash" size={13} />배경 사진 지우기</button>}
              {hasBgPic && <p className="ed-help">배경색을 고르면 배경 그림은 빠져요.</p>}
            </section>

          </>
        )}
      </aside>
      {pick && <ImagePicker slot={{ kind: pick.getAttribute('data-kind') || 'photo', hint: '' }} current={pick.querySelector?.('img') ? { src: pick.querySelector('img').getAttribute('data-fill') || pick.querySelector('img').getAttribute('src'), name: pick.querySelector('img').alt, pid: pick.getAttribute('data-pid') } : null} onPick={putImg} onClose={() => setPick(null)} />}
      {backgroundPick && <BackgroundPicker context={backgroundContext} current={background} onPick={putBackground} onClose={() => setBackgroundPick(false)} />}
      {ask && <Modal title="변경 내용을 저장할까요?" onClose={() => { if (!busy) setAsk(false); }}
        footer={<>
          <button className="btn" disabled={busy} data-autofocus onClick={() => setAsk(false)}>취소</button>
          <button className="btn btn-ghost btn-danger" disabled={busy} onClick={onClose}>저장 안 함</button>
          <button className="btn btn-primary" disabled={busy || improving} onClick={() => save(false)}>{busy ? <span className="spin" /> : <Icon name="check" size={15} />}저장</button>
        </>}>
        <p>수정한 레이아웃을 {own && !structureChanged ? 'My 템플릿에' : '새 My 템플릿으로'} 저장{asCopy ? '하고 현재 장에 적용해요.' : '할 수 있어요.'}</p>
      </Modal>}
    </Modal>
  );
}

/* =========================================================
   찜 페이지 — favourites from any layout view; a filled sheet and the empty layout are kept apart
   ========================================================= */
export const favOrder = (favs) => [...favs.filter((x) => x.filled), ...favs.filter((x) => !x.filled)];
export function FavSections({ favs, cols, onOpen, hc }) {
  const groups = [
    { k: 'filled', title: '값이 채워진 장', sub: '글 · 사진 · 배경까지 들어간 장 — 제안서에 넣으면 그 값 그대로 들어가요', items: favs.filter((x) => x.filled) },
    { k: 'empty', title: '빈 레이아웃', sub: '값 없이 레이아웃만 — 제안서에서 새로 채워요', items: favs.filter((x) => !x.filled) },
  ].filter((g) => g.items.length);
  let n = 0;
  return (
    <div className="tl-sections my-secs fav-secs">
      {groups.map((g) => (
        <section key={g.k} className={'tl-grp fav-grp ' + (g.k === 'filled' ? 'h-teal' : 'h-slate')} aria-label={g.title}>
          <div className="tl-grp-h"><i className="dot" /><h2>{g.title}</h2><span className="num">{g.items.length}</span><p>{g.sub}</p></div>
          <div className="tl-grp-in">
            <div className="tl-grid" style={{ gridTemplateColumns: 'repeat(' + cols + ', minmax(0, 1fr))' }}>
              {g.items.map((x) => {
                const i = n++; const l = L[x.f];
                return (
                  <button key={x.id} type="button" className={'tl-card fav-card ' + (x.filled ? 'filled' : 'empty')} data-f={x.f} onClick={() => { hc && hc.hide(); onOpen(i); }} aria-label={x.name + (x.filled ? ' (값 있음)' : ' (빈 레이아웃)') + ' 크게 보기'}
                    onMouseEnter={(e) => hc && hc.show(l, e.currentTarget, x.ov ? { ov: x.ov } : {})} onMouseLeave={() => hc && hc.hide()}>
                    <div className="tl-thumb"><FitSlide f={x.f} ov={x.ov || undefined} lazy /><FavButton f={x.f} ov={x.ov} from={x.from} /></div>
                    <div className="tl-info">
                      <div className="tl-name"><b>{l ? l.name : x.name}</b></div>
                      <p className="tl-when">{x.from || '찜'}</p>
                      <div className="tl-tags">
                        <span className={'tag fav-tag' + (x.filled ? ' filled' : '')}>{x.filled ? '값 있음' : '빈 레이아웃'}</span>
                        {l && PARTS[l.p] ? <span className={'tag pt ' + partHue(l.p)}>{PARTS[l.p].label}</span> : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
