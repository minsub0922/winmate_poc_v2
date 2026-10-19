import { readAttachments } from '../services/attachments.js';
import { linkTags } from '../services/links.js';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { planFor, modeLabel } from '../services/poc-client.js';
import { startRfpJob, attachmentsText, clearRfpPending, usefulForm } from '../services/poc-workflows.js';
import { isTerminal } from '../repositories/jobs.js';
import { AgentJobControl, useOwnerJobs } from './AgentJobControl.jsx';
import { update, uid, segRefs } from '../repositories/proposals.js';
import { Icon, MentionEditor, RefChip, AddRefInput, Modal, toast } from './common.jsx';
import { INDUSTRIES, IND, refInfo } from '../services/catalog.js';
import { inferIndustry, recommendContext, reqText } from '../services/search.js';
import { aiExtract, heuristicExtract } from '../services/ai.js';
import { isReqSaved, reqSig, industryLabel } from './ctxconfirm.jsx';
import { BubblePopup } from './bubblepop.jsx';
import { TagStrip } from './tagcard.jsx';
import { useDetailPeek } from './peek.jsx';

const KIND = [['products', 'product', '제품', 2], ['solutions', 'solution', '솔루션', 1], ['cases', 'case', '유관사례', 1]];
export function refsOf(p) { return [...p.ctx.products.map((x) => 'product:' + x), ...p.ctx.solutions.map((x) => 'solution:' + x), ...p.ctx.cases.map((x) => 'case:' + x)]; }
export function addRef(pid, ref) {
  const [t, id] = ref.split(':');
  const k = t === 'product' ? 'products' : t === 'solution' ? 'solutions' : 'cases';
  update(pid, (d) => { if (!d.ctx[k].includes(id)) d.ctx[k].push(id); });
}
export function removeRef(pid, ref) {
  const [t, id] = ref.split(':');
  const k = t === 'product' ? 'products' : t === 'solution' ? 'solutions' : 'cases';
  update(pid, (d) => { d.ctx[k] = d.ctx[k].filter((x) => x !== id); });
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
      <span className="faint" style={{ fontSize: "var(--text-11-5px)" }}>업종에 맞춘 레이아웃 · 제품 · 사례를 먼저 추천해요</span>
    </div>
  );
}

// ---------- tabs ----------
/** linked-state helpers for tags written in the requirements */
const linkedIn = (p) => (r) => { const [t, id] = r.split(':'); const k = t === 'product' ? 'products' : t === 'solution' ? 'solutions' : 'cases'; return p.ctx[k].includes(id); };
const relink = (p) => (r) => { addRef(p.id, r); toast(refInfo(r).label + ' 다시 연결했어요'); };

function FreeTab({ p, peek }) {
  const tags = segRefs(p.req.free);
  return (
    <div className="panel">
      <div className="hint"><Icon name="info" size={14} /><span>고객이 한 말, 메일, 회의 메모를 그대로 붙여 넣어도 돼요. <b>@</b>를 입력하면 제품 · 솔루션 · 유관사례를 바로 찾아 연결하고, 링크를 붙여 넣으면 제목 · 썸네일로 태그돼요.</span></div>
      <MentionEditor id="free-ed" label="자유형식 요구사항" value={p.req.free} placeholder="예) 전국 320개 매장 메뉴판을 디지털로 바꾸고 싶다. 본사에서 한 번에 바꾸는 구조… @QM55C"
        onChange={(segs) => update(p.id, (d) => { d.req.free = segs; })} onMention={(r) => addRef(p.id, r)} peek={peek} />
      <div className="faint" style={{ fontSize: "var(--text-12px)" }}>{reqText({ req: { free: p.req.free } }).length}자 · 태그 {new Set(tags).size}개</div>
      <TagStrip refs={tags} peek={peek} title="본문에서 태그한 제품 · 솔루션 · 유관사례" linkedOf={linkedIn(p)} onLink={relink(p)} className="req-tags" />
    </div>
  );
}

function FormTab({ p, peek }) {
  const f = p.req.form;
  const set = (fn) => update(p.id, (d) => fn(d.req.form, d));
  const sum = (f.keymen || []).reduce((a, k) => a + Number(k.weight || 0), 0);
  return (
    <div className="panel">
      <div className="form-grid">
        {[['project', '프로젝트명', '예) 전국 매장 디지털 메뉴보드 전환'], ['customer', '고객사', '예) A 커피 프랜차이즈'], ['target', '최종 제안대상', '예) 운영본부장']].map(([k, l, ph]) => (
          <div className="field" key={k}><label htmlFor={'f-' + k}>{l}</label>
            <input id={'f-' + k} className="input" value={f[k] || ''} placeholder={ph} onChange={(e) => { const v = e.target.value; set((ff, d) => { ff[k] = v; if (k === 'customer') d.customer = v; if (k === 'project' && (!d.title || d.title === '새 제안서')) d.title = v; }); }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: "var(--space-10px)" }}>
        <span style={{ fontWeight: "var(--weight-700)", fontSize: "var(--text-14px)" }}>키맨별 요구사항</span>
        <span className={'wsum num' + (sum !== 100 ? ' bad' : '')}>가중치 합 {sum}%</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-soft btn-sm" onClick={() => set((ff) => { ff.keymen.push({ id: uid('k'), name: '', weight: 0, reqs: [[]] }); })}><Icon name="plus" size={14} />키맨 추가</button>
      </div>
      <div className="hint"><Icon name="info" size={14} />요구사항을 한 줄에 하나씩 나눠 적으면 Storyboard 추천과 AI 채우기가 더 정확해져요. 여기서도 @로 제품 · 솔루션 · 유관사례를 연결하고, 링크를 붙여 넣으면 제목 · 썸네일로 태그돼요.</div>
      {(f.keymen || []).map((k, ki) => (
        <div className="km" key={k.id}>
          <div className="km-side">
            <label className="sr" htmlFor={'km-' + k.id}>키맨 직책</label>
            <input id={'km-' + k.id} className="input" style={{ fontWeight: "var(--weight-700)" }} value={k.name} placeholder="키맨 · 예) 대표이사" onChange={(e) => { const v = e.target.value; set((ff) => { ff.keymen[ki].name = v; }); }} />
            <span className="weight"><label htmlFor={'kw-' + k.id}>가중치</label><input id={'kw-' + k.id} className="input" inputMode="numeric" value={k.weight} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, '').slice(0, 3); set((ff) => { ff.keymen[ki].weight = Number(v || 0); }); }} />%</span>
            {f.keymen.length > 1 && <button className="btn btn-ghost btn-sm btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => set((ff) => { ff.keymen.splice(ki, 1); })}><Icon name="trash" size={14} />키맨 빼기</button>}
          </div>
          <div className="km-reqs">
            {(k.reqs || []).map((r, ri) => (
              <div className="km-req" key={ri}>
                <span className="n">{ri + 1}</span>
                <MentionEditor single label={(k.name || '키맨') + ' 요구사항 ' + (ri + 1)} value={r} placeholder="요구사항 · 예) 에너지 사용량 20% 절감" onChange={(segs) => set((ff) => { ff.keymen[ki].reqs[ri] = segs; })} onMention={(ref) => addRef(p.id, ref)} peek={peek} />
                <button className="btn btn-ghost btn-sm btn-icon" aria-label={'요구사항 ' + (ri + 1) + ' 빼기'} onClick={() => set((ff) => { ff.keymen[ki].reqs.splice(ri, 1); if (!ff.keymen[ki].reqs.length) ff.keymen[ki].reqs.push([]); })}><Icon name="x" size={13} /></button>
                <TagStrip refs={segRefs(r)} peek={peek} size="sm" className="km-tags" linkedOf={linkedIn(p)} onLink={relink(p)} />
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', color: 'var(--accent)' }} onClick={() => set((ff) => { ff.keymen[ki].reqs.push([]); })}><Icon name="plus" size={13} />요구사항</button>
          </div>
        </div>
      ))}
      <div className="field"><label htmlFor="f-note">제작자 의견 <span className="faint" style={{ fontWeight: "var(--weight-500)" }}>· 고객 문서에는 들어가지 않아요</span></label>
        {/* 세그먼트는 noteSegs, 글은 note(문자열 — reqText · AI가 읽음)에 같이 저장. 다른 곳에서 note만 바뀌면 글을 그대로 보여 줌 */}
        <div className="note-ed">
          <MentionEditor id="f-note" label="제작자 의견" value={f.noteSegs && linkTags && linkTags.text(f.noteSegs) === (f.note || '') ? f.noteSegs : f.note ? [{ t: f.note }] : []}
            placeholder="제안 방향 · 강조할 점 — @로 제품 · 솔루션 · 유관사례 연결, 링크를 붙여 넣으면 바로 태그돼요"
            onChange={(segs) => set((ff) => { ff.noteSegs = segs; ff.note = linkTags ? linkTags.text(segs) : segs.map((x) => x.t || '').join(''); })} onMention={(ref) => addRef(p.id, ref)} peek={peek} />
          <TagStrip refs={segRefs(f.noteSegs)} peek={peek} size="sm" className="km-tags" linkedOf={linkedIn(p)} onLink={relink(p)} />
        </div>
      </div>
      <span className="faint" style={{ fontSize: "var(--text-11-5px)" }}>모두 선택 항목이에요 · 비어 있어도 다음 단계로 갈 수 있어요</span>
    </div>
  );
}

const FKIND = { pdf: 'pdf', ppt: 'ppt', pptx: 'ppt', doc: 'doc', docx: 'doc', hwp: 'doc', hwpx: 'doc', xls: 'xls', xlsx: 'xls', csv: 'xls', eml: 'mail', msg: 'mail' };
const hasInput = (p) => {
  const f = p.req.form || {};
  return (p.req.free || []).some((s) => (s.t && s.t.trim()) || s.ref)
    || !!(f.project || f.customer || f.target)
    || (f.keymen || []).some((k) => (k.name || '').trim() || (k.reqs || []).some((r) => r.length));
};
const useful = (d) => !!d && (!!(d.project || d.customer || d.target || (d.summary || '').trim()) || (d.keymen || []).some((k) => k && (k.reqs || []).some(Boolean)));
const filesText = (files) => files.filter((f) => (f.text || '').trim() || (f.memo || '').trim()).map((f) => `# ${f.name}\n${f.memo || ''}\n${f.text || ''}`).join('\n\n');

// Attachments: compact name chips; details behind a small "!" button. Requirements are read from the files automatically —
// straight into the form when it is empty, after a "덮어쓰시겠습니까?" check when something is already written.
function FilesTab({ p }) {
  const [over, setOver] = useState(false);
  const [info, setInfo] = useState(null); // file id whose details are open
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(null); // extracted data waiting for an overwrite answer
  const inp = useRef(null);
  const pRef = useRef(p); pRef.current = p;
  const run = useRef(0);
  const memo0 = useRef('');
  const fullRef = useRef({}); // file id → full text read this session (PDF · PPTX · DOCX can be longer than the stored excerpt)
  const [fbNote, setFbNote] = useState(''); // why the original extraction ran although the server is configured (no key …)
  const [pick, setPick] = useState(null); // requirement forms waiting for a choice / overwrite answer (server job or its fallback)
  const seenPending = useRef(null);
  const rfpJobs = useOwnerJobs('proposal', p.id, 'rfp');
  const activeJob = rfpJobs.find((r) => !isTerminal(r.status));

  const applyData = (d0, overwrite) => {
    update(p.id, (d) => {
      const f = d.req.form;
      for (const k of ['project', 'customer', 'target']) if (d0[k] && (overwrite || !f[k])) f[k] = d0[k];
      if (d0.customer && (overwrite || !d.customer)) d.customer = d0.customer;
      if ((d0.note || '').trim() && (overwrite || !(f.note || '').trim())) { f.note = d0.note.trim(); f.noteSegs = [{ t: f.note }]; }
      const km = (d0.keymen || []).filter((k) => k && (k.reqs || []).some(Boolean))
        .map((k) => ({ id: uid('k'), name: k.name || '담당자', weight: Number(k.weight || 0), reqs: (k.reqs || []).filter(Boolean).map((r) => [{ t: String(r) }]) }));
      if (km.length) f.keymen = overwrite ? km : [...(f.keymen || []).filter((x) => x.name || x.reqs.some((r) => r.length)), ...km];
      if ((d0.summary || '').trim()) {
        const seg = { t: '[첨부에서 읽음] ' + d0.summary.trim() };
        d.req.free = overwrite || !(d.req.free || []).length ? [seg] : [...d.req.free, { t: '\n\n' + seg.t }];
      }
    });
  };
  const extract = async (files) => {
    const text = filesText(files);
    if (!text.trim()) return;
    const my = ++run.current;
    // server RFP pipeline when configured; its result comes back as choices (p.agent.rfpPending) — never written silently
    const plan = planFor('rfp');
    if (plan.job) {
      if (activeJob) { toast('첨부를 정리하는 작업이 이미 진행 중이에요'); return; }
      const allText = attachmentsText(files, fullRef.current);
      if (allText.trim().length >= 50) {
        setBusy(true); setAsk(null); setFbNote('');
        const sub = await startRfpJob(pRef.current, allText, { offline: plan.offline });
        if (my !== run.current) return;
        if (sub.ok) { setBusy(false); toast(plan.offline ? '서버 PoC 규칙(오프라인)으로 첨부를 정리해요' : '서버에서 첨부를 정리해요 · 다른 화면으로 가도 계속돼요'); return; }
        setFbNote(sub.message + ' — 기본 규칙으로 읽었어요.');
      }
    } else if (!plan.quiet && plan.note) setFbNote(plan.note);
    setBusy(true); setAsk(null);
    const r = await aiExtract(text);
    if (my !== run.current) return;
    const data = r.ok && r.data ? r.data : heuristicExtract(files.map((f) => [f.memo, f.text].filter((x) => (x || '').trim()).join('\n')).filter(Boolean).join('\n\n'));
    setBusy(false);
    if (!useful(data)) { toast('첨부에서 요구사항을 찾지 못했어요. 파일의 ! 를 눌러 핵심 메모를 남기면 다시 읽어요', 'warn'); return; }
    if (hasInput(pRef.current)) setAsk(data);
    else { applyData(data, false); toast('첨부에서 읽은 요구사항을 입력 폼과 자유형식에 채웠어요'); }
  };
  const addFiles = async (list) => {
    const rich = planFor('rfp').job;
    const read = await readAttachments(list, { full: rich, rich });
    if (!read.length) return;
    const arr = read.map(({ fullText, ...rec }) => { if (fullText && fullText.length > (rec.text || '').length) fullRef.current[rec.id] = fullText; return rec; });
    update(p.id, (d) => { d.req.files.push(...arr); });
    const all = [...pRef.current.req.files, ...arr];
    if (filesText(all).trim()) extract(all);
    else toast(arr.length + '개 파일을 붙였어요 · 본문을 읽을 수 없는 형식이라 ! 에서 핵심 메모를 남기면 요구사항을 읽어요');
  };
  const remove = (i, id) => { update(p.id, (d) => { d.req.files.splice(i, 1); }); if (info === id) setInfo(null); delete fullRef.current[id]; };
  // a server result (or its visible fallback) arrived for this proposal — possibly while another screen was open
  const pending = p.agent && p.agent.rfpPending;
  const pendingKey = pending ? String(pending.jobId || pending.at || '') : null;
  useEffect(() => {
    if (!pending || seenPending.current === pendingKey) return;
    seenPending.current = pendingKey;
    const choices = (pending.choices || []).filter(usefulForm);
    if (!choices.length) { clearRfpPending(p.id); toast('첨부에서 요구사항을 찾지 못했어요', 'warn'); return; }
    if (choices.length === 1 && !hasInput(pRef.current)) {
      applyData(choices[0], false); clearRfpPending(p.id);
      toast(pending.source === 'classic' ? '기본 규칙으로 읽은 요구사항을 입력 폼과 자유형식에 채웠어요' : '첨부에서 정리한 요구사항을 입력 폼과 자유형식에 채웠어요');
      return;
    }
    setPick({ ...pending, choices, sel: 0 }); // several projects, or something is already written: the person decides
  }, [pendingKey]);
  const pickChoices = pending ? (pending.choices || []).filter(usefulForm) : [];
  const cur = p.req.files.find((f) => f.id === info);
  const ci = cur ? p.req.files.indexOf(cur) : -1;
  const nReq = ask ? (ask.keymen || []).reduce((n, k) => n + ((k && k.reqs) || []).filter(Boolean).length, 0) : 0;

  return (
    <div className="req-files">
      <div className={'dropzone req-drop' + (p.req.files.length ? ' has' : '') + (over ? ' over' : '')} role="button" tabIndex={0}
        aria-label={(p.req.files.length ? '파일 더 붙이기' : '첨부파일 붙이기') + ' — 눌러서 고르거나 파일을 끌어다 놓으세요'}
        onClick={() => inp.current.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.current.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
        <Icon name="upload" size={16} />
        <b>{p.req.files.length ? '파일 더 붙이기' : 'RFP · 회의록 · 메일 첨부'}</b>
        <span className="dz-sub">{p.req.files.length ? '눌러서 고르거나 끌어다 놓기' : '눌러서 고르거나 끌어다 놓으면 요구사항을 자동으로 읽어 아래에 채워요'}</span>
      </div>
      <input ref={inp} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      {p.req.files.length > 0 && (
        <ul className="fchips" aria-label="첨부한 파일">
          {p.req.files.map((f, i) => (
            <li key={f.id} className={'fchip' + (info === f.id ? ' open' : '')}>
              <span className={'fic k-' + (FKIND[f.type] || 'etc')} aria-hidden="true"><Icon name="file" size={14} /></span>
              <span className="fchip-name" title={f.name}>{f.name}</span>
              <button type="button" className="fchip-info" aria-label={f.name + ' 정보 보기'} aria-expanded={info === f.id} title="파일 정보" onClick={() => { setInfo(info === f.id ? null : f.id); setFull(false); }}>!</button>
              <button type="button" className="fchip-x" aria-label={f.name + ' 빼기'} title="빼기" onClick={() => remove(i, f.id)}><Icon name="x" size={11} stroke={2.6} /></button>
            </li>
          ))}
        </ul>
      )}
      {cur && (
        <div className="finfo" role="region" aria-label={cur.name + ' 정보'}>
          <div className="finfo-h">
            <span className={'fic k-' + (FKIND[cur.type] || 'etc')} aria-hidden="true"><Icon name="file" size={14} /></span>
            <b className="fname">{cur.name}</b>
            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="정보 닫기" onClick={() => setInfo(null)}><Icon name="x" size={13} /></button>
          </div>
          <span className="fmeta num">{(cur.type || 'file').toUpperCase()} · {(cur.size / 1024).toFixed(0)} KB · {cur.text ? '본문 ' + cur.text.length.toLocaleString() + '자 읽음' : '본문을 읽을 수 없는 형식 · 메모로 핵심을 남겨 주세요'}</span>
          <label className="sr" htmlFor={'fm-' + cur.id}>메모</label>
          <input id={'fm-' + cur.id} className="input" style={{ minHeight: 30, height: 30, fontSize: "var(--text-12-5px)" }} value={cur.memo || ''} placeholder="이 파일의 핵심 메모 (예: 객실 300실 · 연회장 3) — 적으면 요구사항을 다시 읽어요"
            onFocus={(e) => { memo0.current = e.target.value; }}
            onChange={(e) => { const v = e.target.value; update(p.id, (d) => { if (d.req.files[ci]) d.req.files[ci].memo = v; }); }}
            onBlur={(e) => { if (e.target.value.trim() && e.target.value !== memo0.current) extract(pRef.current.req.files); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur(); }} />
          {cur.text && <div className="fpre" style={full ? { maxHeight: 460 } : null}>{full ? cur.text : cur.text.slice(0, 1200)}</div>}
          {cur.text && cur.text.length > 1200 && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', color: 'var(--accent)' }} aria-expanded={full} onClick={() => setFull((v) => !v)}><Icon name={full ? 'x' : 'text'} size={13} />{full ? '원문 접기' : '원문 전체 보기 · ' + cur.text.length.toLocaleString() + '자'}</button>}
        </div>
      )}
      {busy && <div className="thinking fx-busy"><span className="spin" />첨부 내용을 읽고 요구사항을 정리하는 중…</div>}
      {activeJob && <AgentJobControl id={activeJob.id} compact title="첨부 RFP 정리 (서버)" />}
      {fbNote && !busy && <p className="agent-note"><Icon name="info" size={12} />{fbNote}</p>}
      {pending && !pick && pickChoices.length > 0 && (
        <button type="button" className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setPick({ ...pending, choices: pickChoices, sel: 0 })}>
          <Icon name="form" size={13} />첨부에서 읽은 요구사항 확인{pickChoices.length > 1 ? ' · ' + pickChoices.length + '건' : ''}
        </button>
      )}
      {pick && (() => {
        const hi = hasInput(p);
        const c = pick.choices[pick.sel] || pick.choices[0];
        const m = pick.source === 'poc' ? modeLabel(pick.llm) : null;
        const gr = pick.guards && typeof pick.guards.grounded_rate === 'number' ? Math.round(pick.guards.grounded_rate * 100) : null;
        const finish = (overwrite) => { applyData(c, overwrite); clearRfpPending(p.id); setPick(null); toast(overwrite ? '고른 내용으로 덮어썼어요' : '고른 내용으로 채웠어요'); };
        return (
          <Modal size="wide" onClose={() => setPick(null)} title={pick.choices.length > 1 ? `첨부에서 사업 ${pick.choices.length}건을 찾았어요` : '덮어쓰시겠습니까?'}
            sub={hi ? '이미 입력한 요구사항이 있어요. 고른 내용으로 덮어쓰거나, 비어 있는 칸만 채울 수 있어요.' : '하나를 고르면 입력 폼과 자유형식에 채워요.'}
            footer={<>
              <span className="note">{pick.source === 'poc' ? `서버 RFP 정리${m ? ' · ' + m.label : ''}${gr != null ? ' · 근거 인용 확인 ' + gr + '%' : ''}` : (pick.reason || '기본 규칙으로 읽었어요')}</span>
              <span className="sp" />
              <button className="btn" onClick={() => { clearRfpPending(p.id); setPick(null); toast('입력한 내용을 그대로 뒀어요'); }}>그대로 두기</button>
              {hi && <button className="btn" onClick={() => finish(false)}>빈 칸만 채우기</button>}
              <button className="btn btn-primary" data-autofocus onClick={() => finish(hi)}>{hi ? '덮어쓰기' : '고른 내용으로 채우기'}</button>
            </>}>
            <div className="rfp-choices" role="radiogroup" aria-label="첨부에서 읽은 사업">
              {pick.choices.map((x, i) => {
                const nk = (x.keymen || []).filter((k) => k && (k.reqs || []).some(Boolean)).length;
                const nr = (x.keymen || []).reduce((s, k) => s + ((k && k.reqs) || []).filter(Boolean).length, 0);
                return (
                  <label key={i} className={'rfp-choice' + (i === pick.sel ? ' on' : '')}>
                    <input type="radio" name="rfp-pick" checked={i === pick.sel} onChange={() => setPick({ ...pick, sel: i })} />
                    <span className="c-t">
                      <b>{[x.customer, x.project].filter(Boolean).join(' · ') || '사업 ' + (i + 1)}</b>
                      <span className="c-m num">키맨 {nk}명 · 요구사항 {nr}개{x.target ? ' · 제안대상 ' + x.target : ''}</span>
                      {(x.summary || '').trim() && <p className="c-s">{x.summary}</p>}
                    </span>
                  </label>
                );
              })}
            </div>
          </Modal>
        );
      })()}
      {ask && (
        <Modal onClose={() => setAsk(null)} title="덮어쓰시겠습니까?"
          sub="이미 입력한 요구사항이 있어요. 첨부에서 읽은 내용으로 입력 폼과 자유형식을 덮어써요."
          footer={<>
            <span className="sp" />
            <button className="btn" onClick={() => { setAsk(null); toast('입력한 내용을 그대로 뒀어요'); }}>그대로 두기</button>
            <button className="btn btn-primary" data-autofocus onClick={() => { applyData(ask, true); setAsk(null); toast('첨부에서 읽은 내용으로 덮어썼어요'); }}>덮어쓰기</button>
          </>}>
          <div className="fx-sum">
            <span className="lbl">첨부에서 읽은 내용</span>
            {[ask.customer, ask.project, ask.target].filter(Boolean).length > 0 && <b style={{ fontSize: "var(--text-13-5px)" }}>{[ask.customer, ask.project, ask.target].filter(Boolean).join(' · ')}</b>}
            {(ask.keymen || []).length > 0 && <span className="muted" style={{ fontSize: "var(--text-13px)" }}>키맨 <b className="num">{(ask.keymen || []).filter((k) => k && (k.reqs || []).some(Boolean)).length}</b>명 · 요구사항 <b className="num">{nReq}</b>개</span>}
            {(ask.summary || '').trim() && <p>{ask.summary}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- sufficiency popup ----------
export function SufficiencyModal({ p, onClose, onGo }) {
  const low = lacking(p);
  const ind = p.ind || inferIndustry(reqText(p));
  return (
    <Modal size="wide" onClose={onClose} title={low.length ? '제품 · 솔루션 · 유관사례를 조금 더 채워 주세요' : '연결된 제품 · 솔루션 · 유관사례'}
      sub={low.length ? '이 세 가지가 Storyboard 추천 · 레이아웃 추천 · AI 채우기의 근거가 돼요. 지금 상태로 진행해도 됩니다.' : '이대로 Storyboard를 만들어도 충분해요.'}
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
// The whole requirements editor lives in a popover to the right of the 고객 요구사항 bubble (bubblepop.jsx), so the proposal
// is one screen (Storyboard). 저장 closes it at once and opens the 제품 · 솔루션 매칭 popup beside the next bubble.
export function ReqPopup({ p, onClose, onSaved }) {
  const peek = useDetailPeek(p); // hover on a tag (본문 @태그 · 태그 카드) → big detail card
  const tab = p.reqTab === 'form' ? 'form' : 'free';
  const filled = {
    free: (p.req.free || []).some((s) => (s.t && s.t.trim()) || s.ref),
    form: !!(p.req.form.project || p.req.form.customer || (p.req.form.keymen || []).some((k) => k.reqs.some((r) => r.length))),
  };
  const saved = isReqSaved(p);
  const close = () => { peek.hide(); onClose(); };
  const save = () => {
    peek.hide();
    // 요구사항 단계 → 저장하면 제품 · 솔루션 매칭 버블이 생김
    update(p.id, (d) => { d.reqSaved = reqSig(d); if (!d.parts.length && d.stage !== 'story') d.stage = 'match'; });
    toast('고객 요구사항을 저장했어요');
    onSaved();
  };
  const indSet = industryLabel(p);
  const guess = indSet ? null : inferIndustry(reqText(p));
  return (
    <BubblePopup cls="rq" anchor=".start-node .node" icon={<Icon name="clip" size={17} />} title="고객 요구사항" onClose={close}
      sub={<span className="bp-sub">
        <b>{p.customer || '고객사 미정'}</b>
        {indSet ? <span>{indSet}</span> : guess && IND[guess] ? <span>{IND[guess].name}<em>추론</em></span> : <span className="faint">업종 미정</span>}
      </span>}
      status={<span className={'req-saved' + (saved ? ' on' : '')}>{saved ? <><Icon name="check" size={13} stroke={2.6} />저장됨</> : p.reqSaved ? '바뀐 내용이 있어요' : '아직 저장 전'}</span>}
      footer={<>
        <span className="bp-note">고친 내용은 바로 반영돼요 · 저장하면 제품 · 솔루션 매칭으로 이어져요</span>
        <span className="sp" />
        <button className="btn btn-primary" onClick={save}><Icon name="check" size={15} />저장</button>
      </>}>
      <p className="bp-intro">자료가 있으면 먼저 첨부하고, 자유형식이나 입력 폼으로 채우거나 보완하세요. 입력한 내용은 모두 Storyboard의 맥락이 돼요.</p>
      <section className="req-sec" aria-label="첨부파일">
        <FilesTab p={p} />
      </section>
      <section className="req-sec" aria-label="직접 입력">
        <div className="tabs" role="tablist" aria-label="입력 방식">
          {[['free', 'text', '자유형식'], ['form', 'form', '입력 폼']].map(([k, ic, l]) => (
            <button key={k} role="tab" className="tab" aria-selected={tab === k} onClick={() => update(p.id, (d) => { d.reqTab = k; }, { touch: false })}>
              <Icon name={ic} size={15} />{l}<span className={'dot' + (filled[k] ? ' on' : '')} aria-label={filled[k] ? '입력됨' : '비어 있음'} />
            </button>
          ))}
        </div>
        {tab === 'free' && <FreeTab p={p} peek={peek} />}
        {tab === 'form' && <FormTab p={p} peek={peek} />}
      </section>
      {peek.node}
    </BubblePopup>
  );
}
