// 제품 · 솔루션 매칭 popup — to the right of the 매칭 카드 under the Storyboard 매칭 bubble (bubblepop.jsx beside). Opens when the
// requirements are saved and when the bubble or a section of the card is clicked: industry (pick or type your own), then
// tabs 솔루션 · 유관사례 · 제품 over the directory explorer (ctxexplorer.jsx, live) — recommendations first, search and
// folders; a click links or unlinks at once and the card on the left shows it. Linked items are not listed here again.
// 저장 closes it; at the matching stage it also starts the parts (첫 번째 파트 appears).
import React, { useState, useEffect, useMemo } from 'react';
import { update } from '../repositories/proposals.js';
import { DeleteButton, Icon, toast } from './common.jsx';
import { BubblePopup } from './bubblepop.jsx';
import { INDUSTRIES, IND } from '../services/catalog.js';
import { inferIndustry, recommendContext, reqText } from '../services/search.js';
import { ContextExplorer, startFor } from './ctxexplorer.jsx';
import { HistoryReuse } from './history-reuse.jsx';

// ---------- saved state ----------
const hashStr = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36) + ':' + s.length; };
/** Fingerprint of the requirements (자유형식 · 입력 폼 · 첨부) — what 저장 in the requirements popup records. */
export function reqSig(p) {
  const files = (p.req.files || []).map((f) => [f.name, f.size, f.memo || '']);
  return hashStr(JSON.stringify([p.req.free, p.req.form, files]));
}
// saved before the matching popup split off: the fingerprint also covered industry + linked context
const legacySig = (p) => { const files = (p.req.files || []).map((f) => [f.name, f.size, f.memo || '']); return hashStr(JSON.stringify([p.req.free, p.req.form, files, p.ind || null, p.indName || '', p.ctx])); };
export const isReqSaved = (p) => !!p.reqSaved && (p.reqSaved === reqSig(p) || p.reqSaved === legacySig(p));
export function industryLabel(p) {
  if (p.indName) return p.indName;
  return p.ind && IND[p.ind] ? IND[p.ind].name : '';
}

// ---------- industry: pick from the list or type your own ----------
function IndustryCombo({ p }) {
  const guess = inferIndustry(reqText(p));
  const cur = industryLabel(p);
  const [q, setQ] = useState(cur);
  const [open, setOpen] = useState(false);
  const [act, setAct] = useState(-1);
  useEffect(() => { setQ(industryLabel(p)); }, [p.ind, p.indName]);
  const n = q.trim().toLowerCase();
  const list = INDUSTRIES.filter((i) => !n || n === cur.toLowerCase() || i.name.toLowerCase().replace(/\s/g, '').includes(n.replace(/\s/g, '')) || (i.samples || []).some((s) => s.toLowerCase().includes(n)));
  const pick = (code) => { update(p.id, (d) => { d.ind = code; d.indName = null; }); setOpen(false); setAct(-1); };
  const commit = () => {
    const t = q.trim();
    if (!t) { update(p.id, (d) => { d.ind = null; d.indName = null; }); return; }
    if (t === cur) return;
    const exact = INDUSTRIES.find((i) => i.name === t || i.name.replace(/\s/g, '') === t.replace(/\s/g, ''));
    if (exact) { pick(exact.code); return; }
    update(p.id, (d) => { d.indName = t; d.ind = inferIndustry(t) || null; });
  };
  const note = p.indName
    ? (p.ind && IND[p.ind] ? '직접 입력 · 추천은 ‘' + IND[p.ind].name + '’ 기준으로 해요' : '직접 입력 · 맞는 업종 분류가 없어 요구사항 내용으로 추천해요')
    : p.ind ? '이 업종에 맞춘 레이아웃 · 제품 · 사례를 먼저 추천해요' : guess ? '비워 두면 요구사항에서 추론한 ‘' + IND[guess].name + '’로 추천해요' : '업종을 정하면 추천이 더 정확해져요';
  return (
    <div className="cc-ind">
      <label className="lbl" htmlFor="cc-ind-in">업종</label>
      <div className="cc-combo">
        <Icon name="building" size={15} />
        <input id="cc-ind-in" className="input" value={q} autoComplete="off" role="combobox" aria-expanded={open && list.length > 0} aria-controls="cc-ind-list"
          placeholder={guess ? '자동 · ' + IND[guess].name + ' (선택하거나 직접 입력)' : '업종 선택 또는 직접 입력'}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setAct(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => { setOpen(false); commit(); }, 140)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAct((a) => Math.min(list.length - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(-1, a - 1)); }
            else if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); if (open && act >= 0 && list[act]) pick(list[act].code); else { commit(); setOpen(false); } }
            else if (e.key === 'Escape' && open) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setOpen(false); }
          }} />
        {(p.ind || p.indName) && <DeleteButton type="button" className="cc-x" aria-label="업종 지우기" onClick={() => { update(p.id, (d) => { d.ind = null; d.indName = null; }); setQ(''); }}><Icon name="x" size={13} /></DeleteButton>}
        {open && list.length > 0 && (
          <div className="cc-list" id="cc-ind-list" role="listbox" onMouseDown={(e) => e.preventDefault()}>
            {list.map((i, k) => (
              <button key={i.code} type="button" role="option" aria-selected={k === act || p.ind === i.code} className={k === act ? 'act' : ''} onClick={() => pick(i.code)} onMouseEnter={() => setAct(k)}>
                <span>{i.name}</span><span className="faint num">사례 {i.cases}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="cc-note">{note}</span>
      {!p.ind && !p.indName && guess && <button type="button" className="cc-guess" onClick={() => pick(guess)}><Icon name="sparkle" size={12} />추론 · {IND[guess].name} 적용</button>}
    </div>
  );
}

// ---------- popup ----------
// 매칭 카드(storyboard 버블 아래 · match-area.jsx)와 같은 순서: 솔루션 → 유관사례 → 제품
const TABS = [['solutions', 'solution', '솔루션'], ['cases', 'case', '유관사례'], ['products', 'product', '제품']];

/**
 * 제품 · 솔루션 매칭 popup — 고르는 곳. 매칭 카드 오른쪽에 떠서, 누르는 즉시 연결 · 해제되고 결과는 왼쪽 카드에 바로 보인다
 * (그래서 연결된 목록을 팝업에 따로 두지 않는다 — 해제는 카드의 × 또는 여기서 다시 누르기).
 * focus: { k: 'products' | 'solutions' | 'cases', n } — the kind (tab) to show.
 */
export function MatchPopup({ p, focus, onClose, onSaved }) {
  const ind = p.ind || inferIndustry(reqText(p));
  const atMatch = !p.parts.length && p.stage !== 'story';
  const [kind, setKind] = useState((focus && focus.k) || 'solutions');
  useEffect(() => { if (focus && focus.k) setKind(focus.k); }, [focus && focus.k, focus && focus.n]);
  // 추천이 있으면 추천부터, 없으면 전체 목록(사례는 업종 폴더)
  const start = useMemo(() => (recommendContext(p, ind, kind, 1).length ? 'rec' : startFor(kind, ind)), [kind, ind]);
  const save = () => {
    // 매칭 단계 → 저장하면 파트가 시작됨(첫 번째 파트 버블 · 후보)
    update(p.id, (d) => { d.stage = 'story'; });
    toast(atMatch ? '저장했어요 · 이제 첫 번째 파트를 골라 주세요' : '제품 · 솔루션 매칭을 저장했어요');
    onSaved(atMatch);
  };
  return (
    <BubblePopup cls="mt" extra="mt-live-pop" anchor=".match-node .node" beside=".match-node .match-card" fill icon={<Icon name="link" size={17} />} title="제품 · 솔루션 매칭" onClose={onClose}
      bodyClass="mt-live"
      sub={<span className="bp-sub num">{TABS.map(([k, , l]) => <span key={k}>{l} <b>{p.ctx[k].length}</b></span>)}</span>}
      footer={<>
        <span className="bp-note">{atMatch ? '저장하면 파트 구성을 시작해요' : '누르는 즉시 왼쪽 매칭 카드에 반영돼요 · 다시 누르면 해제'}</span>
        <span className="sp" />
        <button className="btn btn-primary" onClick={save}><Icon name="check" size={15} />저장</button>
      </>}>
      <div className="mt-top">
        <HistoryReuse p={p} kind="ctx" />
        <div className="cc-top"><IndustryCombo p={p} /></div>
      </div>
      <div className="mt-tabs" role="tablist" aria-label="추가할 종류">
        {TABS.map(([k, t, label]) => (
          <button key={k} type="button" role="tab" id={'mt-tab-' + k} aria-selected={kind === k} aria-controls="mt-tabpanel" className={'mt-tab ' + t + (kind === k ? ' on' : '')} onClick={() => setKind(k)}>
            <Icon name={t} size={14} />{label}<b className="num">{p.ctx[k].length}</b>
          </button>
        ))}
      </div>
      <ContextExplorer key={kind + ':' + start} p={p} kind={kind} start={start} ind={ind} live onClose={onClose}
        frame={(v) => <div className="mt-panel ex-pbody" id="mt-tabpanel" role="tabpanel" aria-labelledby={'mt-tab-' + kind}>{v.body}</div>} />
    </BubblePopup>
  );
}
