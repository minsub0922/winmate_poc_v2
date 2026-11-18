import {FeedbackPopup} from './feedback-popup.jsx';
import { extractAttachments, INLINE_MAX } from '../services/attachments.js';
import { linkTags } from '../services/links.js';
import React, { useState, useRef, useEffect } from 'react';
import { update, uid, segRefs, getProposal } from '../repositories/proposals.js';
import { readRequirementDraft, keepRequirementDraft, discardRequirementDraft } from '../repositories/requirement-drafts.js';
import { DeleteButton, Icon, MentionEditor, RefChip, AddRefInput, Modal, toast } from './common.jsx';
import { INDUSTRIES, IND, P, refInfo, dssKindOf } from '../services/catalog.js';
import { inferIndustry, recommendContext, reqText } from '../services/search.js';
import { reqSig, industryLabel } from './ctxconfirm.jsx';
import { BubblePopup } from './bubblepop.jsx';
import { TagStrip } from './tagcard.jsx';
import { useDetailPeek } from './reference-detail.jsx';
import { HistoryReuse } from './history-reuse.jsx';
import { ensureRequirementSummary } from '../services/requirement-summary.js';
import { ensureMatchExtract } from '../services/match-extract.js';
import { sourceDigest, savedRequirementSummary } from '../domain/proposals/requirement-summary.js';
import { isTextSeg, segsText } from '../domain/proposals/table-seg.js';

const KIND = [['products', 'product', '제품', 2], ['solutions', 'solution', '솔루션', 1], ['cases', 'case', '유관사례', 1]];
export function refsOf(p) { return [...p.ctx.products.map((x) => 'product:' + x), ...p.ctx.solutions.map((x) => 'solution:' + x), ...p.ctx.cases.map((x) => 'case:' + x)]; }
// 구독(subscription:<id>)은 p.ctx.subscriptions — 이전 제안서에는 없는 칸이라 처음 연결할 때 만든다
const ctxKey = (t) => (t === 'product' ? 'products' : t === 'solution' ? 'solutions' : t === 'subscription' ? 'subscriptions' : 'cases');
export function addRef(pid, ref) {
  const [t, id] = ref.split(':');
  const k = ctxKey(t);
  update(pid, (d) => { d.ctx[k] = d.ctx[k] || []; if (!d.ctx[k].includes(id)) d.ctx[k].push(id); });
}
export function removeRef(pid, ref) {
  const [t, id] = ref.split(':');
  const k = ctxKey(t);
  update(pid, (d) => {
    d.ctx[k] = (d.ctx[k] || []).filter((x) => x !== id);
    // 솔루션 · 서비스로 보이는 제품 DB 행(지난 제안서가 제품으로 고른 것 — services/dss.js dssOf)은 제품 칸에서도 뺀다
    if (t === 'solution' && d.ctx.products) d.ctx.products = d.ctx.products.filter((x) => !(P[x] && dssKindOf(P[x]) !== 'device' && (x === id || P[x].dssSame === id)));
  });
}
export function lacking(p) { return KIND.filter(([k, , , min]) => p.ctx[k].length < min).map(([k]) => k); }

function mentionedRefs(p) {
  const s = new Set(segRefs(p.req.free));
  for (const k of p.req.form.keymen || []) for (const r of k.reqs || []) for (const x of segRefs(r)) s.add(x);
  for (const x of segRefs(p.req.form.noteSegs)) s.add(x);
  return s;
}

/** Linked context lists with add + recommend. */
export function ContextEditor({ p, only = null, showRecs = true, compact = false, idp = 'ce' }) {
  const ind = p.ind || inferIndustry(reqText(p));
  const mentioned = mentionedRefs(p);
  const kinds = KIND.filter(([k]) => !only || only.includes(k));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: "var(--space-16px)" }}>
      <AddRefInput id={idp + '-add'} onAdd={(r) => { addRef(p.id, r); toast(refInfo(r).label + ' 연결했어요'); }} exclude={refsOf(p)} types={only ? only.map((k) => KIND.find((x) => x[0] === k)[1]) : null}
        placeholder={only && only.length === 1 ? '@ ' + KIND.find((x) => x[0] === only[0])[2] + ' 찾아 추가' : '@ 제품 · 솔루션 · 유관사례 찾아 추가'} />
      {kinds.map(([k, t, label, min]) => {
        const list = p.ctx[k];
        const recs = showRecs ? recommendContext(p, ind, k, compact ? 3 : 5) : [];
        return (
          <div key={k} className="ctx-group">
            <h4><Icon name={t} size={14} />{label} <span className="c">{list.length}</span>{null}</h4>
            <div className="chips">
              {list.length ? list.map((id) => <RefChip key={id} r={t + ':' + id} onRemove={(r) => removeRef(p.id, r)} />) : <span className="chip-empty">아직 없어요 · 본문에서 @로 부르거나 아래 추천에서 추가</span>}
            </div>
            {recs.length > 0 && (
              <div className="recs" aria-label={label + ' 추천'}>
                <span className="lbl" style={{ display: 'flex', alignItems: 'center', gap: "var(--space-5px)" }}><Icon name="sparkle" size={12} />추천 {label}</span>
                {recs.map((r) => (
                  <div key={r.ref} className="rec">
                    <span style={{ minWidth: 0 }}><div className="l">{r.label}</div><div className="w">{r.why}</div></span>
                    <button onClick={() => { addRef(p.id, r.ref); toast(r.label + ' 연결했어요'); }} aria-label={r.label + ' 추가'}><Icon name="plus" size={14} stroke={2.4} /></button>
                  </div>
                ))}
              </div>
            )}
            {mentioned.size > 0 && list.some((id) => mentioned.has(t + ':' + id)) && <span className="faint" style={{ fontSize: "var(--text-11-5px)" }}>본문에서 @로 부른 항목 포함</span>}
          </div>
        );
      })}
    </div>
  );
}

function IndustryPicker({ p }) {
  const guess = inferIndustry(reqText(p));
  const v = p.ind || '';
  return (
    <div className="ind-box">
      <span className="lbl"><span>업종</span>{!p.ind && guess ? <span style={{ color: 'var(--accent)' }}>추론: {IND[guess].name}</span> : null}</span>
      <label className="sr" htmlFor="ind-sel">업종</label>
      <select id="ind-sel" className="select" value={v} onChange={(e) => update(p.id, (d) => { d.ind = e.target.value || null; })}>
        <option value="">{guess ? '자동 · ' + IND[guess].name : '업종 선택'}</option>
        {INDUSTRIES.map((i) => <option key={i.code} value={i.code}>{i.name}</option>)}
      </select>
    </div>
  );
}

// ---------- draft ----------
// What the popup edits. Nothing here reaches the proposal store until 저장 — typing, attaching and 이전 불러오기 change the
// draft only, so no save and no summary happens while writing. One draft per proposal is kept for this tab: closing the
// popup by accident and opening it again shows what was typed. It is dropped when saved, or when the saved
// requirements changed underneath it (another tab · 시뮬레이션 등).
const draftSubs = new Set();
const notifyDraft = (id) => { for (const f of draftSubs) f(id); };
const blankForm = () => ({ project: '', customer: '', target: '', keymen: [{ id: uid('k'), name: '', weight: 100, reqs: [[]] }], note: '' });
const filled = (v) => (Array.isArray(v) ? v.some((s) => (s.t && s.t.trim()) || s.ref) : !!String(v || '').trim());
/** Merge neighbouring text and drop empty text — the shape MentionEditor reads back. */
const tidySegs = (segs) => {
  const out = [];
  for (const s of segs || []) { if (!isTextSeg(s)) out.push(s); else if (s.t) { const l = out[out.length - 1]; if (isTextSeg(l)) out[out.length - 1] = { t: l.t + s.t }; else out.push({ t: s.t }); } }
  return out;
};
/** b under a, one empty line between them. */
const joinSegs = (a, b) => {
  const text = segsText(a);
  return tidySegs([...a, ...(!text.trim() || !b.length ? [] : [{ t: text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n' }]), ...b]);
};
/**
 * 입력 폼(자유형식만 남기기 전의 방식 · 샘플 버티컬 시나리오)에 적힌 내용 → 읽을 수 있는 글. 태그는 태그로 남는다.
 * head = 프로젝트 · 고객사 · 제안대상 줄, tail = 키맨별 요구사항(가중치 포함) · 제작자 의견.
 */
export function formSegs(form) {
  const f = form || {}, head = [], tail = [];
  const put = (into, value) => { for (const s of Array.isArray(value) ? value : [{ t: String(value) }]) into.push(isTextSeg(s) ? { t: s.t } : { ...s }); };
  for (const [label, key] of [['프로젝트', 'project'], ['고객사', 'customer'], ['최종 제안대상', 'target']]) if (filled(f[key])) put(head, label + ': ' + String(f[key]).trim() + '\n');
  const keymen = (f.keymen || []).filter((k) => filled(k.name) || (k.reqs || []).some(filled));
  if (keymen.length) {
    put(tail, '키맨별 요구사항\n');
    for (const k of keymen) {
      put(tail, '■ ' + (String(k.name || '').trim() || '키맨') + (k.weight != null && k.weight !== '' ? ' (가중치 ' + Number(k.weight) + '%)' : '') + '\n');
      for (const r of (k.reqs || []).filter(filled)) { put(tail, '- '); put(tail, r); put(tail, '\n'); }
    }
  }
  const note = f.noteSegs && linkTags.text(f.noteSegs) === (f.note || '') ? f.noteSegs : f.note;
  if (filled(note)) { put(tail, (tail.length ? '\n' : '') + '제작자 의견\n'); put(tail, note); put(tail, '\n'); }
  return { head: tidySegs(head), tail: tidySegs(tail) };
}
/** Requirements of a proposal as one free-form text: its free text, with whatever the old form holds folded around it. */
function foldReq(req) {
  const { head, tail } = formSegs(req.form);
  const free = structuredClone(req.free || []);
  return { folded: head.length + tail.length > 0, free: joinSegs(joinSegs(head, free), tail) };
}
function getDraft(p) {
  const kept = readRequirementDraft(p.id), base = reqSig(p);
  if (kept && kept.base === base) return kept;
  const draft = { base, ...foldReq(p.req), files: structuredClone(p.req.files || []), customer: p.customer || (p.req.form && p.req.form.customer) || '', meta: null, reading: kept?.reading || 0 };
  keepRequirementDraft(p.id, draft);
  return draft;
}
function patchDraft(id, fn) {
  const draft = readRequirementDraft(id);
  if (!draft) return;
  keepRequirementDraft(id, { ...draft, ...fn(draft) });
  notifyDraft(id);
}
function useDraft(p) {
  const [, bump] = useState(0);
  useEffect(() => { const f = (id) => { if (id === p.id) bump((n) => n + 1); }; draftSubs.add(f); return () => { draftSubs.delete(f); }; }, [p.id]);
  const draft = getDraft(p);
  return [draft, (fn) => patchDraft(p.id, fn), draft.reading > 0];
}
/** Tags written in the requirements: @제품 · @솔루션 · @유관사례, and pasted links that matched a catalog item. */
const taggedRefs = (segs) => [...new Set([...segRefs(segs), ...(segs || []).map((s) => s.link && s.link.ref).filter(Boolean)])].filter((r) => /^(product|solution|case):/.test(r));

// ---------- attachments ----------
const FKIND = { pdf: 'pdf', ppt: 'ppt', pptx: 'ppt', doc: 'doc', docx: 'doc', hwp: 'doc', hwpx: 'doc', xls: 'xls', xlsx: 'xls', xlsm: 'xls', csv: 'xls', tsv: 'xls', eml: 'mail', msg: 'mail' };
const TOTAL_MAX = 150000; // characters the free-form text may hold after attaching — what does not fit stays with the attachment
const num = (n) => Number(n || 0).toLocaleString();
/** What happened to an attachment, in one line (chip tooltip · info panel · the note under the chips). */
function fileState(f) {
  if (f.readError) return { bad: true, text: f.readError };
  if (f.inlined && f.tailChars) return { part: true, text: `앞 ${num(f.inlineChars)}자만 자유형식에 넣었어요. 나머지 ${num(f.tailChars)}자는 첨부 원문으로 보관하고 요약에 그대로 반영해요.` };
  if (f.inlined) return { text: `본문 ${num(f.inlineChars)}자를 자유형식에 넣었어요` };
  if (f.tailChars) return { part: true, text: `자유형식이 길어 본문에 넣지 못했어요. ${num(f.tailChars)}자를 첨부 원문으로 보관하고 요약에 그대로 반영해요.` };
  return f.text ? { text: `본문 ${num(f.extractedChars || f.text.length)}자 · 첨부 원문으로 요약에 반영해요` } : { bad: true, text: '본문을 읽을 수 없는 형식이에요. 내용을 직접 적어 주세요.' };
}
/** [start, end) of what was written under this attachment's heading: up to the next attachment heading or the end. */
function sourceSpan(segs, id) {
  const start = segs.findIndex((s) => s.src === id); if (start < 0) return null;
  const next = segs.findIndex((s, i) => i > start && s.src);
  return [start, next < 0 ? segs.length : next];
}
const untouched = (segs, f) => { const span = sourceSpan(segs, f.id); return !!(span && f.inlineKey && sourceDigest(segsText(segs.slice(span[0], span[1])).trimEnd()) === f.inlineKey); };
/** Read files into the draft: their content goes into the free-form text under a heading per file. Keeps going if the popup closes. */
async function attachFiles(pid, list) {
  const files = Array.from(list || []); if (!files.length || !readRequirementDraft(pid)) return;
  patchDraft(pid, draft => ({ reading: draft.reading + 1 }));
  const done = [];
  try {
    for (const file of files) {
      const draft = readRequirementDraft(pid); if (!draft) break;
      const room = Math.max(0, Math.min(INLINE_MAX, TOTAL_MAX - segsText(draft.free).length));
      let item;
      try { [item] = await extractAttachments([file], { room }); }
      catch (error) { item = { record: { id: uid('f'), name: file.name, size: file.size, type: (file.name.split('.').pop() || '').toLowerCase(), text: '', memo: '', readError: error.message || '파일 본문을 읽지 못했습니다.' }, segs: [] }; }
      patchDraft(pid, (d) => ({ files: [...d.files, item.record], free: item.segs.length ? joinSegs(d.free, item.segs) : d.free }));
      done.push(item.record);
    }
  } finally { patchDraft(pid, draft => ({ reading: Math.max(0, draft.reading - 1) })); }
  // what was cut or could not be read stays written under the chips (fileState); the toast only says it happened
  const bad = done.filter((f) => f.readError), ok = done.filter((f) => f.inlined);
  if (ok.length) toast(ok.length > 1 ? `첨부 ${ok.length}개의 내용을 자유형식에 넣었어요` : '첨부 내용을 자유형식에 넣었어요');
  if (bad.length) toast((bad.length > 1 ? `첨부 ${bad.length}개` : bad[0].name) + '의 본문을 읽지 못했어요', 'warn');
}

// Attachments: a drop area and compact name chips. What a file says is read at once (no model) into the free-form text
// below — headings, lists and tables as they are — under a small heading per file. The chips stay as the list of files.
function Files({ pid, draft, setDraft, reading }) {
  const [over, setOver] = useState(false);
  const [info, setInfo] = useState(null); // file id whose details are open
  const [full, setFull] = useState(false);
  const inp = useRef(null);
  const files = draft.files;
  const cur = files.find((f) => f.id === info);
  const patchFile = (id, fn) => setDraft((d) => ({ files: d.files.map((f) => (f.id === id ? { ...f, ...fn(f) } : f)) }));
  // the text stays unless it is exactly what was read from the file — whatever the person wrote or changed is never removed
  const remove = (f) => {
    setDraft((d) => {
      const span = sourceSpan(d.free, f.id);
      const free = !span ? d.free : untouched(d.free, f) ? tidySegs([...d.free.slice(0, span[0]), ...d.free.slice(span[1])]) : tidySegs(d.free.map((s) => (s.src === f.id ? { t: s.t } : s)));
      return { files: d.files.filter((x) => x.id !== f.id), free };
    });
    if (info === f.id) setInfo(null);
  };
  const notes = files.map((f) => [f, fileState(f)]).filter(([, s]) => s.bad || s.part);
  return (
    <div className="req-files">
      <div className={'dropzone req-drop' + (files.length ? ' has' : '') + (over ? ' over' : '')} role="button" tabIndex={0}
        aria-label={(files.length ? '파일 더 붙이기' : '첨부파일 붙이기') + ' — 눌러서 고르거나 파일을 끌어다 놓으세요'}
        onClick={() => inp.current.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.current.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); attachFiles(pid, e.dataTransfer.files); }}>
        <Icon name="upload" size={18} />
        <span className="dz-copy">
          <b>{files.length ? '파일 더 붙이기' : 'RFP · 회의록 · 메일 첨부'}</b>
          <span className="dz-sub">PPTX · DOCX · Excel · TXT — 내용과 표를 아래 자유형식에 그대로 넣어요</span>
        </span>
      </div>
      <input ref={inp} type="file" multiple hidden onChange={(e) => { attachFiles(pid, e.target.files); e.target.value = ''; }} />
      {files.length > 0 && (
        <ul className="fchips" aria-label="첨부한 파일">
          {files.map((f) => {
            const state = fileState(f);
            return (
              <li key={f.id} className={'fchip' + (info === f.id ? ' open' : '') + (state.bad ? ' bad' : state.part ? ' part' : '')}>
                <span className={'fic k-' + (FKIND[f.type] || 'etc')} aria-hidden="true"><Icon name="file" size={14} /></span>
                <span className="fchip-name" title={f.name}>{f.name}</span>
                <button type="button" className="fchip-info" aria-label={f.name + ' 정보 보기'} aria-expanded={info === f.id} title={state.text} onClick={() => { setInfo(info === f.id ? null : f.id); setFull(false); }}>!</button>
                <DeleteButton type="button" className="fchip-x" aria-label={f.name + ' 빼기'} title="빼기" onClick={() => remove(f)}
                  confirmation={{ title: '첨부를 뺄까요?', confirmLabel: '빼기', message: !f.inlined ? '첨부 목록에서 이 파일을 뺍니다.' : untouched(draft.free, f) ? '이 파일과, 자유형식에 넣은 이 파일의 내용을 함께 뺍니다.' : '첨부 목록에서만 뺍니다. 자유형식에 넣은 내용은 고친 부분이 있어 그대로 둡니다.' }}>
                  <Icon name="x" size={11} stroke={2.6} />
                </DeleteButton>
              </li>
            );
          })}
        </ul>
      )}
      {notes.map(([f, s]) => <p key={f.id} className={'req-file-note' + (s.bad ? ' bad' : '')} role="note"><b>{f.name}</b> {s.text}</p>)}
      {cur && (
        <div className="finfo" role="region" aria-label={cur.name + ' 정보'}>
          <div className="finfo-h">
            <span className={'fic k-' + (FKIND[cur.type] || 'etc')} aria-hidden="true"><Icon name="file" size={14} /></span>
            <b className="fname">{cur.name}</b>
            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="정보 닫기" onClick={() => setInfo(null)}><Icon name="x" size={13} /></button>
          </div>
          <span className="fmeta num">{(cur.type || 'file').toUpperCase()} · {(cur.size / 1024).toFixed(0)} KB · {fileState(cur).text}{cur.note ? ' · ' + cur.note : ''}</span>
          {(cur.memo || cur.readError) && <>
            <label className="sr" htmlFor={'fm-' + cur.id}>메모</label>
            <input id={'fm-' + cur.id} className="input" style={{ minHeight: 30, height: 30, fontSize: "var(--text-12-5px)" }} value={cur.memo || ''} placeholder="이 파일의 핵심 메모 (예: 객실 300실 · 연회장 3)"
              onChange={(e) => { const v = e.target.value; patchFile(cur.id, () => ({ memo: v })); }} />
          </>}
          {!cur.inlined && cur.text && <div className="fpre" style={full ? { maxHeight: 460 } : null}>{full ? cur.text : cur.text.slice(0, 1200)}</div>}
          {!cur.inlined && cur.text && cur.text.length > 1200 && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', color: 'var(--accent)' }} aria-expanded={full} onClick={() => setFull((v) => !v)}><Icon name={full ? 'x' : 'text'} size={13} />{full ? '원문 접기' : '원문 전체 보기 · ' + cur.text.length.toLocaleString() + '자'}</button>}
        </div>
      )}
      <FeedbackPopup message={reading ? '첨부 내용을 읽어 자유형식에 넣는 중…' : ''} kind="progress" />
    </div>
  );
}

// ---------- sufficiency popup ----------
export function SufficiencyModal({ p, onClose, onGo }) {
  const low = lacking(p);
  const ind = p.ind || inferIndustry(reqText(p));
  return (
    <Modal size="wide" onClose={onClose} title={low.length ? '제품 · 솔루션 · 유관사례를 조금 더 채워 주세요' : '연결된 제품 · 솔루션 · 유관사례'}
      sub={low.length ? '지금 상태로 진행해도 됩니다.' : undefined}
      footer={<>
        <span className="note">{ind && IND[ind] ? '업종 · ' + IND[ind].name : '업종 미정'}</span><span className="sp" />
        <button className="btn" onClick={onGo}>이대로 진행</button>
        <button className="btn btn-primary" onClick={onGo} disabled={false}>Storyboard 만들기 <Icon name="arrowR" size={15} /></button>
      </>}>
      <AddRefInput id="suff-add" onAdd={(r) => { addRef(p.id, r); toast(refInfo(r).label + ' 연결했어요'); }} exclude={refsOf(p)} />
      <div className="suff">
        {KIND.map(([k, t, label, min]) => {
          const list = p.ctx[k]; const isLow = list.length < min;
          const recs = recommendContext(p, ind, k, 5);
          return (
            <div key={k} className={'suff-col' + (isLow ? ' low' : '')}>
              <h3><Icon name={t} size={15} />{label}<span className="c num">{list.length}</span><span className="faint" style={{ fontSize: "var(--text-11-5px)", fontWeight: "var(--weight-600)" }}>{isLow ? min + '개 이상 권장' : '충분'}</span></h3>
              <div className="chips">{list.length ? list.map((id) => <RefChip key={id} r={t + ':' + id} onRemove={(r) => removeRef(p.id, r)} />) : <span className="chip-empty">아직 없어요</span>}</div>
              {recs.length > 0 && <div className="recs"><span className="lbl" style={{ display: 'flex', alignItems: 'center', gap: "var(--space-5px)" }}><Icon name="sparkle" size={12} />추천</span>
                {recs.map((r) => (
                  <div key={r.ref} className="rec"><span style={{ minWidth: 0 }}><div className="l">{r.label}</div><div className="w">{r.why}</div></span>
                    <button onClick={() => addRef(p.id, r.ref)} aria-label={r.label + ' 추가'}><Icon name="plus" size={14} stroke={2.4} /></button></div>
                ))}</div>}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ---------- popup (Storyboard 고객 요구사항 버블 오른쪽) ----------
// The requirements editor lives in a popover to the right of the 고객 요구사항 bubble (bubblepop.jsx), so the proposal is one
// screen (Storyboard). It is free-form only: attachments are read into the text, tags are @mentions. Editing changes a
// draft (above); 저장 commits it, links every tagged 제품 · 솔루션 · 유관사례, starts the first summary in the background,
// closes the popup at once and opens the 제품 · 솔루션 매칭 popup beside the next bubble. Later saves never summarise by
// themselves — the summary card's 다시 요약 turns on instead.
// Alongside the summary, 저장 also reads the saved text for 제품 · 솔루션 · 공간 written in plain words (not tagged) and links
// them (services/match-extract.js) — while that runs the 매칭 card shows only a shimmer and 「매칭 추론 중」.
export function ReqPopup({ p, onClose, onSaved }) {
  const peek = useDetailPeek(p); // hover on a tag (본문 @태그 · 태그 카드) → big detail card
  const [draft, setDraft, reading] = useDraft(p);
  const close = () => { peek.hide(); onClose(); };
  const save = () => {
    peek.hide();
    const d0 = getDraft(getProposal(p.id) || p);
    const saved = update(p.id, (d) => {
      const form = d.req.form || {};
      d.req.free = tidySegs(d0.free); d.req.files = d0.files;
      if (d0.folded) { // the old form is now part of the text — empty it so nothing is read twice
        if ((!d.title || d.title === '새 제안서') && filled(form.project)) d.title = String(form.project).trim();
        d.req.form = blankForm();
      }
      d.customer = d0.customer.trim(); // seeded from the saved value, so untouched = unchanged
      if (d0.meta) { d.ind = d0.meta.ind; d.indName = d0.meta.indName; }
      if (d.agent && d.agent.rfpPending) d.agent = { ...d.agent, rfpPending: null }; // 첨부 → 입력 폼 선택(이전 방식)의 남은 대기 건은 더 묻지 않음
      // 본문에 태그한 제품 · 솔루션 · 유관사례는 매칭에 자동으로 연결 (직접 연결한 것은 그대로)
      for (const ref of taggedRefs(d0.free)) { const [t, id] = ref.split(':'); const k = t === 'product' ? 'products' : t === 'solution' ? 'solutions' : 'cases'; if (!d.ctx[k].includes(id)) d.ctx[k].push(id); }
      // 요구사항 단계 → 저장하면 제품 · 솔루션 매칭 버블이 생김
      d.reqSaved = reqSig(d); if (!d.parts.length && d.stage !== 'story') d.stage = 'match';
    });
    if (!saved) return; // not signed in (the login prompt is up) — keep the popup and the draft
    discardRequirementDraft(p.id);
    // the first summary only — a finished one waits for 다시 요약. If the first summary failed, saving retries it.
    const now = getProposal(p.id);
    void ensureRequirementSummary(p.id, { force: !!now && now.requirementSummary?.status === 'error' && !savedRequirementSummary(now) });
    // 요약과 나란히: 원문에 글로 적힌 제품 · 솔루션 · 공간을 찾아 매칭에 넣는다(그동안 매칭 카드는 '매칭 추론 중')
    void ensureMatchExtract(p.id);
    toast('고객 요구사항을 저장했어요');
    onSaved();
  };
  // 이전 불러오기: the chosen proposal's requirements replace the draft (its old form folded into the text); 저장 commits it
  const load = (source) => setDraft(() => {
    const ids = new Map();
    const files = structuredClone(source.req.files || []).map((f) => { const id = uid('f'); ids.set(f.id, id); return { ...f, id }; });
    return { free: foldReq(source.req).free.map((s) => (s.src ? { ...s, src: ids.get(s.src) || s.src } : s)), files, folded: true,
      customer: source.customer || (source.req.form && source.req.form.customer) || '', meta: { ind: source.ind || null, indName: source.indName || null } };
  });
  const tags = segRefs(draft.free);
  const guess = industryLabel(p) ? null : inferIndustry(reqText(p));
  const industry = industryLabel(p) || (guess && IND[guess] ? IND[guess].name : '');
  return (
    <BubblePopup cls="rq" anchor=".start-node .node" icon={<Icon name="clip" size={17} />} title="고객 요구사항" onClose={close}
      sub={<span className="bp-sub rq-sub">
        <input className="rq-customer" aria-label="고객사" placeholder="고객사 입력" value={draft.customer} size={Math.max(8, draft.customer.length * 2)} autoComplete="off" onChange={(e) => { const v = e.target.value; setDraft(() => ({ customer: v })); }} />
        {industry && <span>{industry}</span>}
      </span>}
      headerActions={<HistoryReuse p={p} kind="req" compact onApply={load} />}
      footer={<>
        <span className="sp" />
        <button className="btn btn-primary" onClick={save} disabled={reading}><Icon name="check" size={15} />저장</button>
      </>}>
      <section className="req-sec" aria-label="첨부파일">
        <Files pid={p.id} draft={draft} setDraft={setDraft} reading={reading} />
      </section>
      <section className="req-sec req-free" aria-label="요구사항">
        <MentionEditor id="free-ed" label="자유형식 요구사항" value={draft.free} placeholder="예) 전국 320개 매장 메뉴판을 디지털로 바꾸고 싶다. 본사에서 한 번에 바꾸는 구조… @QM55C"
          onChange={(segs) => setDraft(() => ({ free: segs }))} peek={peek} />
        <TagStrip refs={tags} peek={peek} title="본문에서 태그한 제품 · 솔루션 · 유관사례" className="req-tags" />
      </section>
      {peek.node}
    </BubblePopup>
  );
}
