// New / edit part popup.
// - the part name IS its type: picking an existing part sets the name to it;
//   typing a name of your own makes that name the part's type (a hidden name-inferred type only steers recommendations)
// - bubble preview shows the icon of the picked (or name-inferred) part
// - part name: clicking the box opens a list right under it — empty name → every existing part
//   (the ones that fit the flow at this spot first, then by group); while typing → keyword-matched suggestions
// - every place a part is offered shows what the part is for (PARTS[t].about)
// - content: one text box (one line = one item) with "AI 제안" in its top-right corner →
//   loading → a popup with the suggestion → 승인 appends it after what is already written
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { update } from '../repositories/proposals.js';
import { Icon, Modal, toast, partHue } from './common.jsx';
import { PARTS, classifyPart, splitFree, partText } from '../domain/proposals/parts.js';
import { aiPartItems, aiErrorText } from '../services/ai.js';
import { candidates } from './storyboard.jsx';

export const PART_GROUPS = [
  ['이해 · 분석', ['overview', 'requirements', 'market', 'customer', 'user', 'competition', 'insight']],
  ['과제 · 가치', ['challenge', 'value', 'effect']],
  ['공간 · 제품', ['dss', 'products', 'scenario', 'birdseye', 'spec', 'bom']],
  ['솔루션 · 근거', ['solution', 'case', 'why']],
  ['실행 · 비용', ['execution', 'cost']],
  ['구성', ['closing', 'appendix']], // no 'cover' — 표지 lives only in the PPT 레이아웃 panel
];

/** Type whose icon a part shows: its own type, or for a free / untyped part the type its name (or content) suggests. */
export function iconType(type, name, text) {
  if (type && type !== 'free' && PARTS[type]) return type;
  return classifyPart(name) || (text ? classifyPart(text) : null) || null;
}
export function partIcon(part) {
  const t = iconType(part.type, part.name, partText(part));
  return t ? PARTS[t].icon : PARTS.free.icon;
}

// ---------- name suggestions (keyword matching) ----------
const EXTRA = {
  overview: ['제안 요약', 'Executive Summary', '제안 개요와 범위'],
  requirements: ['RFP 요구사항 정리', '평가 항목 대응', '키맨별 요구사항'],
  market: ['시장 동향', '산업 트렌드', '시장 규모와 성장', 'Market Intelligence'],
  customer: ['고객사 현황', '고객 비즈니스 이해', '고객사 운영 구조'],
  user: ['고객 여정', '사용자 페르소나', '직원 · 관리자 니즈'],
  competition: ['경쟁사 비교', '경쟁 공급사 분석', '시장 포지셔닝'],
  insight: ['핵심 인사이트', '제안 방향', '분석 시사점'],
  challenge: ['고객 페인포인트', '현재 문제와 비용', '해결해야 할 과제'],
  value: ['핵심 가치 제안', 'Key Message', '삼성이 주는 가치'],
  effect: ['기대 효과 · ROI', 'KPI 개선 효과', '투자 회수'],
  dss: ['DSS 공간 맵', '공간별 제품 · 솔루션 매칭'],
  products: ['제품 라인업', '공간별 제품 소개', '추천 제품'],
  scenario: ['고객 동선 시나리오', '하루 운영 시나리오', '공간 체험 시나리오'],
  birdseye: ['조감도', '공간 시안', '도입 전후 비교'],
  spec: ['제품 사양 비교', '설치 · 치수 정보'],
  bom: ['구성표 · 수량', '단계별 도입 물량'],
  solution: ['솔루션 구성도', '통합 관제 플랫폼', '솔루션 운영 시나리오'],
  case: ['국내 도입 사례', '유사 고객 레퍼런스', '사례 모음'],
  why: ['왜 삼성인가', '삼성 강점', '도입 후 지원 체계'],
  execution: ['추진 일정', '설치 · 구축 계획', '파일럿과 확산', '유지보수 · 교육'],
  cost: ['비용 · TCO', '구매 방식 비교', '견적 요약'],
  cover: ['표지', '목차'],
  closing: ['다음 단계', '결정 요청', '마무리'],
  appendix: ['예상 질문 Q&A', '부록 · 출처'],
};
const norm = (s) => String(s || '').toLowerCase().replace(/[\s·・,/()&\-—]+/g, '');
/** existing part whose name is exactly this text (spacing / dots ignored) */
const labelType = (s) => { const n = norm(s); if (!n) return null; return Object.keys(PARTS).find((t) => !PARTS[t].free && t !== 'cover' && norm(PARTS[t].label) === n) || null; };
const CORPUS = (() => {
  const out = []; const seen = new Set();
  const add = (text, type, kind) => { const k = String(text || '').trim(); if (!k || seen.has(k)) return; seen.add(k); out.push({ text: k, type, kind, n: norm(k) }); };
  const types = Object.keys(PARTS).filter((t) => !PARTS[t].free && t !== 'cover'); // 표지 · 목차 is not offered as a part
  types.forEach((t) => add(PARTS[t].label, t, 'label'));
  types.forEach((t) => (EXTRA[t] || []).forEach((x) => add(x, t, 'name')));
  types.forEach((t) => { PARTS[t].desc.split(' · ').forEach((x) => add(x, t, 'desc')); PARTS[t].items.forEach((x) => add(x, t, 'item')); });
  return out;
})();
export function suggestNames(q, limit = 6) {
  const nq = norm(q);
  if (!nq) return [];
  const rule = classifyPart(q);
  const toks = String(q).toLowerCase().split(/[\s·,/]+/).map(norm).filter(Boolean);
  return CORPUS.map((c) => {
    let s = 0;
    if (c.n.startsWith(nq)) s = 6; else if (c.n.includes(nq)) s = 4;
    else { const hit = toks.filter((t) => c.n.includes(t)).length; if (hit) s = 1.6 * hit; }
    if (!s && rule === c.type && c.kind === 'label') s = 3; // keyword says this type even if the words differ
    if (s && rule === c.type) s += 1;
    if (s && c.kind === 'label') s += 0.6; else if (s && c.kind === 'name') s += 0.3;
    return { ...c, s };
  }).filter((c) => c.s > 0 && c.n !== nq).sort((a, b) => b.s - a.s || a.text.length - b.text.length).slice(0, limit);
}
function Hl({ text, q }) {
  const i = q ? text.toLowerCase().indexOf(q.trim().toLowerCase()) : -1;
  if (i < 0 || !q.trim()) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.trim().length)}</mark>{text.slice(i + q.trim().length)}</>;
}

const stripLine = (x) => x.replace(/^\s*(?:[-•·*▪◦]|\d+[.)])\s*/, '').trim();
const toLines = (text) => String(text || '').split(/\n/).map(stripLine).filter(Boolean);
const stop = (e) => { e.stopPropagation(); if (e.nativeEvent && e.nativeEvent.stopImmediatePropagation) e.nativeEvent.stopImmediatePropagation(); };

export function PartEditor({ p, part, onClose, isNew }) {
  const [name, setName] = useState(part.name);
  const [type, setType] = useState(part.type || null);
  const [text, setText] = useState(part.form === 'free' && (part.text || '').trim() ? part.text : (part.items || []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [prop, setProp] = useState(null); // AI 제안 popup: { items, ai }
  const [sug, setSug] = useState({ open: false, i: -1 });

  const autoType = classifyPart(name);
  const curType = type || autoType;
  // the existing part this one *is* (name = that part's name); a name of your own picks none
  const picked = type && type !== 'free' && PARTS[type] && norm(name) === norm(PARTS[type].label) ? type : null;
  const bubble = iconType(type, name, text);
  const lines = toLines(text);
  const isFree = lines.some((x) => x.length > 100);
  const items = isFree ? splitFree(text) : lines.slice(0, 20);

  // types that fit the flow at this spot (the part itself doesn't count as "used") — they lead the full list
  const idx = p.parts.findIndex((x) => x.id === part.id);
  const prev = idx > 0 && !p.parts[idx - 1].deck ? p.parts[idx - 1] : null; // the hidden 표지 part is not a ‘previous part’
  const recs = useMemo(() => candidates({ ...p, parts: p.parts.filter((x) => x.id !== part.id) }, idx - 1, 3), [p.parts.length, idx, p.ind]);
  const allGroups = useMemo(() => {
    const rt = recs.map((r) => r.type).filter((t) => PARTS[t]);
    const gs = [[prev ? '‘' + (prev.name || '앞 파트') + '’ 다음에 이어지기 좋은 파트' : '요구사항 흐름에 맞는 첫 파트', rt]]
      .concat(PART_GROUPS.map(([g, ts]) => [g, ts.filter((t) => PARTS[t] && !rt.includes(t))]));
    return gs.filter(([, ts]) => ts.length).map(([g, ts]) => ({ g, opts: ts.map((t) => ({ text: PARTS[t].label, type: t, kind: 'label' })) }));
  }, [recs, prev && prev.name]);
  const typing = !!name.trim();
  const groups = !sug.open ? [] : typing ? [{ g: '', opts: suggestNames(name, 8) }] : allGroups;
  const opts = groups.flatMap((g) => g.opts);
  const listOpen = opts.length > 0;

  // the list floats over the popup (fixed, under the name box — above it when there is no room below) so the popup body never clips it
  const boxRef = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!listOpen) return undefined;
    const place = () => {
      const el = boxRef.current; if (!el) return;
      const r = el.getBoundingClientRect(), vh = window.innerHeight, want = typing ? 340 : 380;
      const below = vh - r.bottom - 16, above = r.top - 16;
      if (below >= Math.min(want, 240) || below >= above) setPos({ left: r.left, width: r.width, top: r.bottom + 4, bottom: 'auto', maxHeight: Math.min(want, below) });
      else setPos({ left: r.left, width: r.width, top: 'auto', bottom: vh - r.top + 4, maxHeight: Math.min(want, above) });
    };
    place();
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [listOpen, typing]);

  // keep the highlighted option in view while moving with the arrow keys
  useEffect(() => {
    if (sug.i < 0) return;
    const el = document.querySelector('#pe-sugs [data-i="' + sug.i + '"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [sug.i]);

  const openList = () => setSug((x) => (x.open ? x : { open: true, i: -1 }));
  const pickSug = (s) => { setName(s.text); setType(s.kind === 'label' ? s.type : labelType(s.text)); setSug({ open: false, i: -1 }); };
  const onNameKey = (e) => {
    if (e.key === 'ArrowDown' && !sug.open) { e.preventDefault(); setSug({ open: true, i: 0 }); return; }
    if (e.key === 'Escape' && sug.open) { stop(e); setSug({ open: false, i: -1 }); return; }
    if (!opts.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSug((x) => ({ ...x, i: Math.min(opts.length - 1, x.i + 1) })); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSug((x) => ({ ...x, i: Math.max(-1, x.i - 1) })); }
    else if (e.key === 'Enter' && !e.nativeEvent.isComposing && sug.i >= 0) { e.preventDefault(); pickSug(opts[sug.i]); }
  };

  // AI 제안: spinner on the button → popup with the suggestion → 승인 appends it
  const suggest = async () => {
    if (busy) return;
    setBusy(true);
    let r;
    try { r = await aiPartItems(p, { name, type: curType, form: 'list', text, items }); } catch (e) { r = { items: [], ai: false, err: 'upstream_error' }; }
    setBusy(false);
    // the model failed — nothing is added; the same AI 제안 button asks again
    if (!r.ai) { toast(aiErrorText(r.err) + ' AI 제안을 다시 눌러 주세요.', 'warn'); return; }
    const have = new Set(lines);
    const add = [...new Set((r.items || []).map((x) => stripLine(String(x))).filter((x) => x && !have.has(x)))];
    if (!add.length) { toast('더 제안할 내용이 없어요'); return; }
    setProp({ items: add, ai: !!r.ai });
  };
  const accept = () => {
    const add = prop.items;
    setText((t) => (t.trim() ? t.replace(/\s+$/, '') + '\n' : '') + add.join('\n'));
    setProp(null);
    toast('내용 ' + add.length + '개를 뒤에 추가했어요');
  };
  const save = () => {
    update(p.id, (d) => {
      const s = d.parts.find((x) => x.id === part.id); if (!s) return;
      const t = type || autoType || null;
      s.name = name.trim() || (t && t !== 'free' ? PARTS[t].label : '새 파트');
      s.type = t; s.form = isFree ? 'free' : 'list'; s.text = isFree ? text.trim() : ''; s.items = items;
      s.done = items.length > 0;
    });
    toast('파트를 완료했어요 · 이제 레이아웃을 추가할 수 있어요');
    onClose();
  };
  const ok = name.trim() && items.length > 0;
  const nameNote = name.trim() && !picked ? '직접 입력 · 이 이름이 곧 파트 유형이에요' : '';
  const ex = PARTS[curType] && PARTS[curType].items.length ? PARTS[curType].items : ['이 파트에서 말할 핵심 한 가지', '근거나 수치', '고객에게 주는 의미'];
  let oi = -1;

  return (
    <Modal onClose={onClose} title={isNew ? '새 파트' : '파트 편집'} sub="이름과 이 파트에서 말할 내용을 적어 주세요. 완료하면 맞는 PPT 레이아웃을 추천해 드려요."
      footer={<>
        {!isNew && <button className="btn btn-ghost btn-danger" onClick={() => { update(p.id, (d) => { d.parts = d.parts.filter((x) => x.id !== part.id); }); toast('파트를 지웠어요'); onClose(); }}><Icon name="trash" size={15} />파트 지우기</button>}
        <span className="sp" />
        <button className="btn btn-primary" disabled={!ok} onClick={save}><Icon name="check" size={15} />작성 완료</button>
      </>}>
      <div className="field">
        <label htmlFor="pe-name">파트 이름</label>
        <div className="pe-name">
          <span className={'pe-bubble ' + (bubble ? partHue(bubble) : 'empty')} aria-hidden="true"><Icon name={bubble ? PARTS[bubble].icon : PARTS.free.icon} size={22} /></span>
          <div className="pe-name-box" ref={boxRef}>
            <input id="pe-name" data-autofocus={isNew ? '' : undefined} className="input" autoComplete="off" role="combobox" aria-expanded={opts.length > 0} aria-controls="pe-sugs" aria-autocomplete="list"
              aria-activedescendant={sug.i >= 0 && opts[sug.i] ? 'pe-o-' + sug.i : undefined}
              style={{ fontWeight: "var(--weight-700)", fontSize: "var(--text-15px)" }} value={name} placeholder="눌러서 기존 파트를 고르거나 직접 입력 · 예) 왜 지금 바꿔야 하나"
              onChange={(e) => { setName(e.target.value); setType(labelType(e.target.value)); setSug({ open: true, i: -1 }); }}
              onClick={openList} onBlur={() => setTimeout(() => setSug({ open: false, i: -1 }), 120)} onKeyDown={onNameKey} />
            {listOpen && pos && createPortal(
              <div className={'pe-sugs pe-sugs-float' + (typing ? '' : ' all')} id="pe-sugs" role="listbox" aria-label={typing ? '파트 이름 추천' : '기존 파트 전체'} style={{ ...pos, right: 'auto' }} onMouseDown={(e) => e.preventDefault()}>
                {groups.map((g) => (
                  <React.Fragment key={g.g || 'q'}>
                    {g.g && <div className="pe-sg" role="presentation">{g.g}</div>}
                    {g.opts.map((s) => {
                      oi += 1; const i = oi;
                      const showD = !typing || g.opts.findIndex((x) => x.type === s.type) === g.opts.indexOf(s);
                      return (
                        <button key={s.text + i} id={'pe-o-' + i} data-i={i} type="button" role="option" aria-selected={i === sug.i} className={'pe-sug ' + partHue(s.type)} onClick={() => pickSug(s)} onMouseEnter={() => setSug((x) => ({ ...x, i }))}>
                          <span className="si"><Icon name={PARTS[s.type].icon} size={13} /></span>
                          <span className="sx"><b>{typing ? <Hl text={s.text} q={name} /> : s.text}</b>{showD && <span className="sd">{PARTS[s.type].about}</span>}</span>
                          {typing && <span className="st">{s.kind === 'label' ? '기존 파트' : PARTS[s.type].label}</span>}
                        </button>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>, document.body)}
          </div>
        </div>
        {nameNote && <span className="pe-note">{nameNote}</span>}
      </div>

      <div className="field">
        <label htmlFor="pe-text">내용</label>
        <div className="pe-text-box">
          <textarea id="pe-text" className="textarea pe-text" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={'한 줄에 하나씩 적어 주세요. 메모나 문장을 그대로 붙여 넣어도 돼요.\n\n예)\n' + ex.join('\n')} />
          <button type="button" className="btn btn-soft btn-sm pe-ai" onClick={suggest} disabled={busy} aria-busy={busy} title="이 파트에 넣을 내용을 AI가 제안해요">
            {busy ? <span className="spin" /> : <Icon name="sparkle" size={14} />}{busy ? '제안 중…' : 'AI 제안'}
          </button>
        </div>
        <span className="pe-hint"><Icon name="info" size={13} /><span>{isFree ? '긴 문장은 문장 단위로 나눠서 써요' : '한 줄이 한 항목이 돼요 · 나눠 적을수록 레이아웃 추천과 AI 채우기가 정확해져요'}{items.length ? <b className="num"> · 지금 {items.length}개 항목</b> : null}</span></span>
      </div>

      {prop && (
        <Modal size="narrow" onClose={() => setProp(null)} title="AI 제안"
          sub={(name.trim() ? '‘' + name.trim() + '’에' : '이 파트에') + ' 넣을 내용이에요. 승인하면 지금 내용 뒤에 이어 붙여요.'}
          footer={<>
            <span className="sp" />
            <button className="btn" onClick={() => setProp(null)}>닫기</button>
            <button className="btn btn-primary" data-autofocus onClick={accept}><Icon name="check" size={15} />승인 · 내용에 추가</button>
          </>}>
          <ol className="pe-prop">{prop.items.map((x) => <li key={x}>{x}</li>)}</ol>
        </Modal>
      )}
    </Modal>
  );
}
