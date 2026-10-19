import React, { useState, useEffect, useMemo } from 'react';
import { loadUi, saveUi, createProposal, update, uid } from '../repositories/proposals.js';
import { Icon, Modal, toast } from '../components/common.jsx';
import { PARTS, REQ_LABEL } from '../domain/proposals/parts.js';
import { L, IND, P, S, C, IND_KW, INDUSTRIES, SOLUTIONS, PRODUCTS } from '../services/catalog.js';
import { FitSlide } from '../domain/slides/Slide.jsx';
import { exportPptx } from '../domain/slides/export-pptx.js';
import { SCENARIOS, SC, REQ_TYPES, REQ_ORDER, STRATEGIES, ENDINGS, STAGES, slidesOfScenario, previewOf } from '../domain/templates/scenarios.js';
import { TemplateDetail, saveBlob, safeName } from '../components/tplkit.jsx';
import { FavButton } from '../components/fav.jsx';
import { ovOf, storyboardOf, scenarioStoryboard, slideOfUid } from '../domain/templates/scenario_storyboard.js';
import { StoryCanvas } from '../components/storyboard.jsx';
import { BubblePopup } from '../components/bubblepop.jsx';
import { partIcon } from '../components/parteditor.jsx';
import { reqSig } from '../components/ctxconfirm.jsx';
import { flatSlides } from '../components/viewer.jsx';
import { TagChip, TagCard, tagMeta } from '../components/tagcard.jsx';
import { Thumb } from '../components/Thumbs.jsx';
import { usePickPeek } from '../components/pickpeek.jsx';
import { FilterBar, FilterPopup, FStep, FChip, FAll, FProducts, idList, SCENARIO_UNIT } from '../components/filterpop.jsx';

/* =========================================================
   Best Scenario — its own page (sidebar): a list, one scenario per row,
   grouped by 요구사항 타입 (indented under each group). A row = big title +
   summary, a '상세 보기' button (the scenario's Storyboard, read-only — ScenarioStoryboard; 활용하기 copies it into the history) and the
   deck's first sheets (s.preview, 3 — each opens that sheet's detail popup).
   Search + filters work like the PPT 레이아웃 템플릿 page — the same big search box, a '필터' button under it with the
   active filters as chips to its right, and one filter popup (filterpop.jsx): 요구사항 → 전략 → 업종 → 솔루션 → 제품 → 결말.
   ========================================================= */
const STRAT_ORDER = ['value', 'pain', 'space', 'roi', 'compete', 'rfp', 'land'];
const indName = (code) => (code && IND[code] ? IND[code].name : '범용 · 업종 무관');
const indShort = (code) => (code && IND[code] ? IND[code].name : '범용');


/** hover detail for one sheet of a scenario — big filled preview + the layout's metadata + its role here */
const peekProps = (hc, s, x, k) => {
  const show = (e) => hc.show(L[x.f], e.currentTarget, { ov: ovOf(s.id, k, x.f), scene: { page: k + 1, stage: x.stageName || (x.stage && x.stage.name), role: x.role } });
  return { onMouseEnter: show, onMouseLeave: hc.hide, onFocus: show, onBlur: hc.hide };
};

/* ---------- shared actions ---------- */
async function downloadScenario(s) {
  const slides = slidesOfScenario(s);
  const blob = await exportPptx(slides.map((x, k) => ({ f: x.f, ov: ovOf(s.id, k, x.f), part: x.stage.name })), { title: s.title });
  const r = await saveBlob(blob, safeName('Winmate ' + s.title) + '.pptx');
  if (r.ok) toast(s.title + ' PPTX를 저장했어요'); else toast(r.err, 'warn');
}
/** 활용하기 — 이 시나리오의 Storyboard(고객 요구사항 · 제품 · 솔루션 매칭 · 파트 · 채운 레이아웃)를 그대로 내 제안서로 만들어
 *  히스토리(사이드바 제안서 목록) 맨 위에 넣고 연다. 원본 Best Scenario는 그대로 — 고치고 넣는 것은 이 복사본에서만. */
export function activateScenario(s, go) {
  const sb = storyboardOf(s, { pid: () => uid('s'), kid: () => uid('k'), lid: () => uid('l') });
  const id = createProposal();
  update(id, (d) => { Object.assign(d, sb); d.reqSaved = reqSig(d); });
  toast('“' + s.title + '”을 히스토리에 추가했어요 · 이제 고치고 넣을 수 있어요');
  go && go({ name: 'proposal', id });
}
/** 활용하기 확인 — 확인하면 바로 히스토리에 추가되고 내 제안서로 열린다 */
function UseConfirm({ s, onCancel, onConfirm }) {
  const p = scenarioStoryboard(s.id);
  const parts = p.parts.filter((x) => !x.deck); const nL = p.parts.reduce((a, x) => a + x.layouts.length, 0);
  return (
    <Modal size="narrow" title="이 Best Scenario를 활용할까요?" onClose={onCancel}
      footer={<><span className="sp" /><button className="btn" onClick={onCancel}>취소</button><button className="btn btn-primary" data-autofocus onClick={onConfirm}><Icon name="check" size={15} stroke={2.6} />활용하기</button></>}>
      <div className="bsu">
        <p className="bsu-t"><b>{s.title}</b></p>
        <p className="bsu-d">이 구성 그대로 <b>내 제안서 히스토리</b>에 추가하고 바로 열어요. 추가한 제안서에서는 요구사항 · 매칭 · 파트를 고치고 레이아웃을 넣거나 바꿀 수 있어요. 원본 Best Scenario는 바뀌지 않아요.</p>
        <ul className="bsu-list">
          <li><Icon name="clip" size={14} />고객 요구사항 · 키맨 {p.req.form.keymen.length}명</li>
          <li><Icon name="link" size={14} />제품 {p.ctx.products.length} · 솔루션 {p.ctx.solutions.length} · 유관사례 {p.ctx.cases.length}</li>
          <li><Icon name="route" size={14} />Storyboard 파트 {parts.length}개 · 레이아웃 {nL}장 (값 채움)</li>
        </ul>
      </div>
    </Modal>
  );
}
function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { console.error(e); toast('PPTX를 만들지 못했어요: ' + (e && e.message ? e.message : e), 'warn'); } setBusy(false); };
  return [busy, run];
}

/* ---------- search: 20 scenarios → weighted field match (+ Hangul bigram fallback) ---------- */
const PARTICLE = /(에서|으로|까지|은|는|이|가|을|를|의|에|도|로|와|과|만)$/;
function qWords(q) {
  return [...new Set(String(q || '').toLowerCase().split(/[\s,·.!?'"“”‘’()/]+/)
    .map((w) => (/^[가-힣]{3,}$/.test(w) ? w.replace(PARTICLE, '') : w))
    .filter((w) => w.length >= 2 || /\d/.test(w)))];
}
const bigr = (w) => { const o = []; for (let i = 0; i < w.length - 1; i++) o.push(w.slice(i, i + 2)); return o; };
const names = (ids, M, f) => (ids || []).map((id) => M[id] && f(M[id])).filter(Boolean);
function docOf(s) {
  const fl = slidesOfScenario(s); const st = STRATEGIES[s.strategy];
  const F = [
    ['제목', [s.title], 6], ['요약', [s.short], 4],
    ['업종', [indName(s.ind), ...((s.ind && IND_KW[s.ind]) || [])], 4],
    ['요구사항', [REQ_TYPES[s.req].label], 3], ['전략', [st.label, st.desc], 3], ['결말', [ENDINGS[s.ending], s.ask], 3],
    ['솔루션', names(s.solutions, S, (x) => x.name + ' · ' + x.cat), 4],
    ['제품', names(s.products, P, (x) => x.name + ' · ' + x.cat), 4],
    ['유관 사례', names(s.cases, C, (x) => x.cust + ' · ' + x.title), 2],
    ['상황', [s.situation], 2], ['고객의 말', s.signals, 2], ['핵심 주장', [s.thesis], 2],
    ['논리 전개', s.logic, 1.5], ['차별화', s.diff, 1.5], ['핵심 메시지', s.messages, 1.5], ['언제 쓰나', [s.fit], 2],
    ['결정권자', [s.audience.lead, ...s.audience.others], 1.5], ['평가 기준', s.criteria, 1.5], ['성공 지표', s.kpis, 1.5],
    ['준비 자료', s.prep, 1], ['예상 반론', s.objections.flat(), 1], ['다음 할 일', s.next, 1],
    ['흐름', [...s.flow.map((g) => g.name + ' — ' + g.goal), ...fl.map((x) => (L[x.f] ? L[x.f].name + ' — ' : '') + x.role)], 1],
  ];
  return F.map(([k, items, w]) => { const it = (items || []).filter(Boolean).map(String); return { k, items: it, w, lc: it.join(' \n ').toLowerCase() }; });
}
let DOCS = null; // built on the first search so the page opens fast
const docs = () => DOCS || (DOCS = Object.fromEntries(SCENARIOS.map((s) => [s.id, docOf(s)])));
function cut(item, w) {
  const i = w ? item.toLowerCase().indexOf(w) : -1;
  if (i < 0) return { pre: item.length > 72 ? item.slice(0, 72) + '…' : item, mid: '', post: '' };
  const whole = item.length <= 90; // short items (a solution name, one criterion) stay whole
  const a = whole ? 0 : Math.max(0, i - 26); const b = whole ? item.length : Math.min(item.length, i + w.length + 46);
  return { pre: (a > 0 ? '…' : '') + item.slice(a, i), mid: item.slice(i, i + w.length), post: item.slice(i + w.length, b) + (b < item.length ? '…' : '') };
}
/** → null (no query) | [{ s, score, hit, why, snip }] best first */
export function searchScenarios(q) {
  const ws = qWords(q); if (!ws.length) return null;
  const D = docs(); const out = [];
  for (const s of SCENARIOS) {
    let score = 0; let hit = 0; let snip = null; const why = [];
    for (const w of ws) {
      let best = null; let nf = 0;
      for (const f of D[s.id]) {
        let m = f.lc.includes(w) ? 1 : 0;
        if (!m && /^[가-힣]{3,}$/.test(w)) { const b = bigr(w); if (b.filter((x) => f.lc.includes(x)).length / b.length >= 0.75) m = 0.6; }
        if (!m) continue;
        nf++;
        if (!best || f.w * m > best.v) best = { f, v: f.w * m };
      }
      if (!best) continue;
      hit++; score += best.v + Math.min(3, nf - 1) * 0.3;
      if (!why.includes(best.f.k)) why.push(best.f.k);
      if (!snip && best.f.k !== '제목' && best.f.k !== '요약') { // title · summary are already on the card
        const item = best.f.k === '업종' ? best.f.items[0] : (best.f.items.find((t) => t.toLowerCase().includes(w)) || best.f.items[0]);
        snip = { k: best.f.k, ...cut(item, w) };
      }
    }
    if (hit) out.push({ s, score, hit, why, snip });
  }
  // every word somewhere → keep only those (AND); otherwise the closest ones
  const top = Math.max(0, ...out.map((r) => r.hit));
  const min = top === ws.length ? top : Math.max(1, top - 1);
  return out.filter((r) => r.hit >= min).sort((a, b) => b.hit - a.hit || b.score - a.score);
}

/* ---------- filters: one popup (요구사항 · 전략 · 업종 · 솔루션 · 제품 · 결말), shared UI with the template page ---------- */
const BS_FKEYS = ['req', 'strat', 'ind', 'sol', 'prod', 'end'];
const BS_DEFAULT = { q: '', req: '', strat: '', ind: '', sol: '', prod: '', end: '' };
const BS_NO_FILTER = Object.fromEntries(BS_FKEYS.map((k) => [k, '']));
function loadBs() {
  const u = loadUi().bs || {}; const f = { ...BS_DEFAULT };
  for (const k of Object.keys(BS_DEFAULT)) if (typeof u[k] === 'string') f[k] = u[k];
  // older saves kept a tab + grouping instead of these two filters
  if (u.tab && u.tab !== 'all' && !u.req && !u.strat) { if (u.by === 'strategy') f.strat = u.tab; else f.req = u.tab; }
  if (f.req && !REQ_TYPES[f.req]) f.req = '';
  if (f.strat && !STRATEGIES[f.strat]) f.strat = '';
  if (f.sol && !S[f.sol]) f.sol = '';
  if (f.end && !ENDINGS[f.end]) f.end = '';
  f.prod = idList(f.prod).join(','); // one product (older select) or several, comma-joined
  return f;
}
const BS_QUICK = ['메뉴보드', '에너지 절감', '경쟁 입찰', '파일럿', '호텔 객실', '조달 평가'];
const USED_SOL = SOLUTIONS.filter((x) => SCENARIOS.some((s) => s.solutions.includes(x.id)));
const USED_PROD = PRODUCTS.filter((x) => SCENARIOS.some((s) => s.products.includes(x.id))).map((x) => x.id);
const USED_END = Object.keys(ENDINGS).filter((k) => SCENARIOS.some((s) => s.ending === k));
function passS(s, f, skip) {
  if (skip !== 'req' && f.req && s.req !== f.req) return false;
  if (skip !== 'strat' && f.strat && s.strategy !== f.strat) return false;
  if (skip !== 'ind' && f.ind) {
    if (f.ind === '_gen') { if (s.ind) return false; } else if (f.ind === '_ind') { if (!s.ind) return false; } else if (s.ind !== f.ind) return false;
  }
  if (skip !== 'sol' && f.sol && !s.solutions.includes(f.sol)) return false;
  if (skip !== 'prod' && f.prod) { const ids = idList(f.prod); if (ids.length && !s.products.some((id) => ids.includes(id))) return false; }
  if (skip !== 'end' && f.end && s.ending !== f.end) return false;
  return true;
}
const tally = (list, keys) => { const m = {}; for (const s of list) for (const k of [].concat(keys(s))) if (k != null) m[k] = (m[k] || 0) + 1; return m; };
/** active filters as chips: { k, head, value, label, clear } — same shape as the template page */
function activeBs(f) {
  const out = [];
  const add = (k, head, value, clear) => out.push({ k, head, value, label: head + ' ' + value, clear });
  if (f.req && REQ_TYPES[f.req]) add('req', '요구사항', REQ_TYPES[f.req].label, { req: '' });
  if (f.strat && STRATEGIES[f.strat]) add('strat', '전략', STRATEGIES[f.strat].label, { strat: '' });
  if (f.ind) add('ind', '업종', f.ind === '_gen' ? '범용' : f.ind === '_ind' ? '업종 맞춤 전체' : (IND[f.ind] ? IND[f.ind].name : f.ind), { ind: '' });
  if (f.sol && S[f.sol]) add('sol', '솔루션', S[f.sol].name, { sol: '' });
  if (f.prod) { const ids = idList(f.prod); if (ids.length) add('prod', '제품', P[ids[0]].model + (ids.length > 1 ? ' 외 ' + (ids.length - 1) : ''), { prod: '' }); }
  if (f.end && ENDINGS[f.end]) add('end', '결말', ENDINGS[f.end], { end: '' });
  return out;
}

/** One popup, read top to bottom: 요구사항 → 전략 → 업종 → 솔루션 → 제품 → 결말 (the template page's popup, same pieces).
 *  Every choice shows how many scenarios stay with the other choices kept; nothing applies until "N개 보기". */
function ScenarioFilter({ f, base, onApply, onClose }) {
  const [d, setD] = useState(() => ({ ...BS_NO_FILTER, ...Object.fromEntries(BS_FKEYS.map((k) => [k, f[k]])) }));
  const put = (patch) => setD((x) => ({ ...x, ...patch }));
  const n = base.filter((s) => passS(s, d)).length;
  const pool = (skip) => base.filter((s) => passS(s, d, skip));
  const reqPool = pool('req'); const reqN = tally(reqPool, (s) => s.req);
  const stratPool = pool('strat'); const stratN = tally(stratPool, (s) => s.strategy);
  const indPool = pool('ind'); const indN = tally(indPool, (s) => s.ind || '_gen'); const indAll = indPool.filter((s) => s.ind).length;
  const solPool = pool('sol'); const solN = tally(solPool, (s) => s.solutions);
  const prodN = tally(pool('prod'), (s) => [...new Set(s.products)]);
  const endPool = pool('end'); const endN = tally(endPool, (s) => s.ending);
  const on = activeBs(d).length;

  const chip = (key, val, label, cnt, extra = {}) => {
    const sel = d[key] === val;
    return <FChip key={key + ':' + val} on={sel} n={cnt} cls={extra.cls} pre={extra.pre} title={extra.title} onClick={() => put({ [key]: sel ? '' : val })}>{label}</FChip>;
  };
  const all = (key, cnt) => <FAll on={!d[key]} n={cnt} onClick={() => put({ [key]: '' })} />;
  const solCats = [...new Set(USED_SOL.filter((x) => solN[x.id] || d.sol === x.id).map((x) => x.cat))];

  return (
    <FilterPopup unit={SCENARIO_UNIT} n={n} canReset={on} onReset={() => setD({ ...BS_NO_FILTER })} onApply={() => onApply(d)} onClose={onClose}>
      <FStep no={1} title="요구사항 타입" hint="고객이 어떤 요구로 시작하는지">
        <div className="tlf-chips">
          {all('req', reqPool.length)}
          {REQ_ORDER.map((k) => chip('req', k, REQ_TYPES[k].label, reqN[k], { cls: 'h-' + REQ_TYPES[k].hue, pre: <i className="tlf-dot" />, title: REQ_TYPES[k].desc }))}
        </div>
      </FStep>
      <FStep no={2} title="전략" hint="어떻게 설득하는지">
        <div className="tlf-chips">
          {all('strat', stratPool.length)}
          {STRAT_ORDER.map((k) => chip('strat', k, STRATEGIES[k].label, stratN[k], { title: STRATEGIES[k].desc }))}
        </div>
      </FStep>
      <FStep no={3} title="업종">
        <div className="tlf-chips">
          {all('ind', indPool.length)}
          {chip('ind', '_gen', '범용', indN._gen)}
          {chip('ind', '_ind', '업종 맞춤 전체', indAll)}
        </div>
        <div className="tlf-chips">{INDUSTRIES.map((i) => chip('ind', i.code, i.name, indN[i.code]))}</div>
      </FStep>
      <FStep no={4} title="솔루션" hint="그 솔루션을 쓰는 시나리오">
        <div className="tlf-chips">{all('sol', solPool.length)}</div>
        {solCats.map((c) => (
          <div key={c} className="tlf-sub"><span className="tlf-cat">{c}</span>
            <div className="tlf-chips">{USED_SOL.filter((x) => x.cat === c && (solN[x.id] || d.sol === x.id)).map((x) => chip('sol', x.id, x.name, solN[x.id], { pre: <Thumb r={'solution:' + x.id} mini className="tlf-th" /> }))}</div>
          </div>
        ))}
      </FStep>
      <FStep no={5} title="제품" hint="고른 제품 중 하나라도 들어간 시나리오">
        <FProducts ids={idList(d.prod)} counts={prodN} used={USED_PROD} unit={SCENARIO_UNIT} onChange={(ids) => put({ prod: ids.join(',') })} />
      </FStep>
      <FStep no={6} title="결말" hint="제안이 무엇으로 끝나는지">
        <div className="tlf-chips">
          {all('end', endPool.length)}
          {USED_END.map((k) => chip('end', k, ENDINGS[k], endN[k]))}
        </div>
      </FStep>
    </FilterPopup>
  );
}

/* ---------- scenario row (page list, one per line) ---------- */
const TAGS_M = 3;
function ScenarioRow({ s, onOpen, onSheet, hit, mark = {}, showReq, hc }) {
  const req = REQ_TYPES[s.req];
  const sols = s.solutions.filter((id) => S[id]);
  const shownSol = mark.sol && sols.includes(mark.sol) ? [mark.sol, ...sols.filter((id) => id !== mark.sol)] : sols;
  const prods = s.products.filter((id) => P[id]);
  const markProd = idList(mark.prod); // filtered products lead their kind
  const shownProd = [...prods.filter((id) => markProd.includes(id)), ...prods.filter((id) => !markProd.includes(id))];
  // solutions first, then up to 5 products — a filtered one leads its kind (phones show the first TAGS_M + "+N")
  const tags = [...shownSol.map((id) => ({ r: 'solution:' + id, name: S[id].name, cat: S[id].cat, sol: true, on: mark.sol === id })),
    ...shownProd.slice(0, 5).map((id) => ({ r: 'product:' + id, name: P[id].name, cat: P[id].cat, on: markProd.includes(id) }))];
  const moreProd = Math.max(0, shownProd.length - 5);
  const sheets = s.preview || previewOf(s);
  return (
    <article className="bsl" aria-label={s.title}>
      <div className="bsl-top">
        <div className="bsl-head">
          <span className="bsl-eb">
            <span className={'bsl-ind' + (mark.ind && (mark.ind === s.ind || (mark.ind === '_gen' && !s.ind) || (mark.ind === '_ind' && s.ind)) ? ' on' : '')}>{indName(s.ind)}</span>
            {showReq && <span className={'bsl-req h-' + req.hue + (mark.req === s.req ? ' on' : '')}><i />{req.label}</span>}
          </span>
          <h3 className="bsl-t">{s.title}</h3>
          <p className="bsl-d">{s.short}</p>
          {hit && hit.snip ? <span className="tl-snip bsl-snip"><span className="k">{hit.snip.k}</span>{hit.snip.pre}{hit.snip.mid ? <mark>{hit.snip.mid}</mark> : null}{hit.snip.post}</span> : null}
        </div>
        <button className="bsl-more" onClick={() => { hc.hide(); onOpen(s.id); }} aria-label={s.title + ' 상세 보기'}>상세 보기<Icon name="chev" size={16} stroke={2.4} /></button>
      </div>
      {tags.length > 0 && (
        <div className="bsl-tags">
          {tags.map((t, i) => <span key={t.r} className={'bsl-tag' + (t.sol ? ' sol' : '') + (t.on ? ' on' : '') + (i >= TAGS_M ? ' xm' : '')} title={t.name + ' · ' + t.cat}><Thumb r={t.r} mini />{t.name}</span>)}
          {moreProd > 0 ? <span className="bsl-tag more d-only">+{moreProd}</span> : null}
          {tags.length + moreProd > TAGS_M ? <span className="bsl-tag more m-only">+{tags.length + moreProd - TAGS_M}</span> : null}
        </div>
      )}
      <div className="bsl-sheets">
        {sheets.map((x) => (
          <button key={x.k} type="button" className="bsl-sheet" onClick={() => { hc.hide(); onSheet(s.id, x.k); }}
            aria-label={x.page + '번째 장 ' + (L[x.f] ? L[x.f].name : '') + ' 크게 보기'} {...peekProps(hc, s, x, x.k)}>
            <FitSlide f={x.f} ov={ovOf(s.id, x.k, x.f)} lazy />
            <FavButton f={x.f} ov={ovOf(s.id, x.k, x.f)} from={'Best Scenario · ' + s.title} />
          </button>
        ))}
      </div>
    </article>
  );
}

/** one sheet of a scenario, big — the same detail popup as in the scenario's layout list (prev / next through the whole deck) */
function SheetDetail({ s, index, onNav, onClose }) {
  const slides = useMemo(() => slidesOfScenario(s), [s.id]);
  return <TemplateDetail list={slides.map((x) => L[x.f])} ovs={slides.map((x, k) => ovOf(s.id, k, x.f))} index={index} onNav={onNav} onClose={onClose} favFrom={'Best Scenario · ' + s.title}
    notes={slides.map((x) => x.stage.name + ' · ' + x.role)} noteLabel="이 시나리오에서의 역할" />;
}

/* ---------- Best Scenario page: search · filters · grouped scenarios ---------- */
export function ScenarioPage({ go }) {
  const [f, setF] = useState(loadBs);
  const [open, setOpen] = useState(null);
  const [sheet, setSheet] = useState(null); // { id, k } — a sheet clicked on a row
  const [fpop, setFpop] = useState(false);
  const hc = usePickPeek();
  useEffect(() => { const u = loadUi(); saveUi({ ...u, bs: f }); }, [f]);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));

  const q = f.q.trim();
  const hits = useMemo(() => searchScenarios(q), [q]);
  const hitOf = useMemo(() => (hits ? Object.fromEntries(hits.map((r) => [r.s.id, r])) : {}), [hits]);
  const base = hits ? hits.map((r) => r.s) : SCENARIOS;
  const list = base.filter((s) => passS(s, f));
  const active = activeBs(f);

  // browsing stays grouped by 요구사항 타입; a search shows one list by relevance
  const sections = q ? [{ k: '_hits', items: list }]
    : REQ_ORDER.map((k) => ({ k, label: REQ_TYPES[k].label, desc: REQ_TYPES[k].desc, hue: REQ_TYPES[k].hue, items: list.filter((s) => s.req === k) })).filter((g) => g.items.length);


  return (
    <div className="tl bsp">
      <div className="tl-in">
        <header className="tl-head">
          <div className="tl-title">
            <span className="eyebrow">WINMATE · 제안 시나리오</span>
            <h1>Best Scenario</h1>
            <p>요구사항 유형별로 전략부터 결말까지 미리 짜 둔 제안서 구성이에요. 골라서 바로 시작하세요.</p>
          </div>
        </header>

        <div className="tl-tools tl-tools-f">
          <div className="tl-row">
            <form className="tl-search" role="search" onSubmit={(e) => e.preventDefault()}>
              <Icon name="search" size={19} />
              <label className="sr" htmlFor="bs-q">시나리오 검색</label>
              <input id="bs-q" className="input" value={f.q} placeholder="고객 상황 · 제품 · 솔루션으로 찾아 보세요 · 예) 메뉴보드 파일럿, 호텔 객실 TV"
                onChange={(e) => set({ q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Escape' && f.q) { e.stopPropagation(); set({ q: '' }); } }} />
              {f.q && <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="검색어 지우기" onClick={() => set({ q: '' })}><Icon name="x" size={14} /></button>}
            </form>
          </div>
          <FilterBar active={active} onOpen={() => { hc.hide(); setFpop(true); }} onRemove={(a) => set(a.clear)} onClearAll={() => set(BS_NO_FILTER)} />
        </div>

        {q && list.length > 0 && <div className="tl-sum"><span className="muted">“{q}”<span className="faint"> · 관련도순</span></span></div>}
        {q && !list.length && (
          <div className="tl-empty">
            <b>“{q}”와 맞는 시나리오가 없어요</b>
            <span>{active.length ? '필터를 풀거나 ' : ''}다른 표현으로 적어 보세요.</span>
            <div className="chips" style={{ justifyContent: 'center' }}>{BS_QUICK.map((t) => <button key={t} className="qchip" onClick={() => set({ q: t })}>{t}</button>)}</div>
          </div>
        )}
        {!q && !list.length && (
          <div className="tl-empty"><b>조건에 맞는 시나리오가 없어요</b><span>필터를 하나씩 풀어 보세요.</span><button className="btn btn-sm" onClick={() => set(BS_NO_FILTER)}>필터 모두 지우기</button></div>
        )}

        <div className="bsp-groups">
          {sections.map((g) => (
            <section key={g.k} className={'bsp-group' + (g.hue ? ' h-' + g.hue : '')} aria-label={g.label || '검색 결과'}>
              {g.k !== '_hits' && (
                <div className="bsp-gh">
                  <i className="dot" /><h2>{g.label}</h2>
                  <p>{g.desc}</p>
                </div>
              )}
              <div className={'bsp-list' + (g.k === '_hits' ? ' flat' : '')}>{g.items.map((s) => <ScenarioRow key={s.id} s={s} onOpen={setOpen} onSheet={(id, k) => setSheet({ id, k })} hit={hitOf[s.id]} mark={f} showReq={g.k === '_hits'} hc={hc} />)}</div>
            </section>
          ))}
        </div>
      </div>
      {hc.node}
      {open && SC[open] && <ScenarioStoryboard key={'sb-' + open} s={SC[open]} go={go} onClose={() => setOpen(null)} />}
      {sheet && SC[sheet.id] && <SheetDetail key={'sheet-' + sheet.id} s={SC[sheet.id]} index={sheet.k} onNav={(k) => setSheet({ id: sheet.id, k })} onClose={() => setSheet(null)} />}
      {fpop && <ScenarioFilter f={f} base={base} onApply={(x) => { set(x); setFpop(false); }} onClose={() => setFpop(false)} />}
    </div>
  );
}

/* ---------- 상세 보기: the scenario's Storyboard, read-only ----------
   The same bubbles as a proposal's Storyboard screen (storyboard.jsx StoryCanvas readOnly): 고객 요구사항 → 제품 · 솔루션 매칭 → 파트,
   every part with its layouts already filled. Bubbles open view-only popups beside them, a layout card opens that sheet big
   (prev / next through the deck). Nothing can be edited or inserted here — 활용하기 copies it into the history as my proposal. */
function ScenarioStoryboard({ s, go, onClose }) {
  const p = useMemo(() => scenarioStoryboard(s.id), [s.id]);
  const slides = useMemo(() => slidesOfScenario(s), [s.id]);
  const pages = useMemo(() => Object.fromEntries(flatSlides(p).map((z) => [z.x.uid, z.n])), [p]);
  const [pop, setPop] = useState(null); // { t: 'req' } | { t: 'match' } | { t: 'part', id }
  const [sheet, setSheet] = useState(null);
  const [ask, setAsk] = useState(false);
  const [busy, run] = useBusy();
  const req = REQ_TYPES[s.req]; const strat = STRATEGIES[s.strategy];
  const parts = p.parts.filter((x) => !x.deck);
  const nL = slides.length;
  // a part's popup opens to the right of its bubble — bring the bubble to the left first when there is no room beside it
  const reveal = (id) => {
    const c = document.querySelector('.modal.sbv .canvas'); const col = c && c.querySelector('.col[data-pid="' + id + '"]');
    if (!c || !col) return;
    const cr = c.getBoundingClientRect(); const r = col.getBoundingClientRect();
    if (cr.right - r.right < 520) c.scrollBy({ left: r.left - cr.left - 24, behavior: 'smooth' });
  };
  const open = (d) => {
    if (d.type === 'part') { if (!(pop && pop.t === 'part' && pop.id === d.partId)) reveal(d.partId); setPop((v) => (v && v.t === 'part' && v.id === d.partId ? null : { t: 'part', id: d.partId })); }
    else if (d.type === 'detail') { const k = slideOfUid(s.id, d.uid); if (k >= 0) setSheet(k); }
  };
  const part = pop && pop.t === 'part' ? p.parts.find((x) => x.id === pop.id) : null;
  const close = () => setPop(null);
  return (
    <Modal size="sbv" bodyClass="mbody sbv-body" onClose={() => { if (pop) close(); else onClose(); }}
      title={<span className="bsd-t">{s.title}</span>}
      sub={indShort(s.ind) + ' · ' + s.short}
      footer={<>
        <button className="btn" onClick={() => setSheet(0)}><Icon name="layers" size={15} />전체 PPT 보기</button>
        <span className="note sbv-note">파트 {parts.length}개 · 레이아웃 {nL}장</span>
        <span className="sp" />
        <button className="btn" onClick={onClose}>닫기</button>
        <button className="btn" disabled={busy} onClick={() => run(() => downloadScenario(s))}>{busy ? <span className="spin" /> : <Icon name="download" size={15} />}{busy ? '만드는 중…' : 'PPTX로 받기'}</button>
        <button className="btn btn-primary" onClick={() => setAsk(true)}><Icon name="plus" size={15} stroke={2.4} />활용하기</button>
      </>}>
      <div className="sbv-bar">
        <span className={'tag pt h-' + req.hue}>{req.label}</span>
        <span className="tag">{strat.label}</span>
        <span className="tag">결말 · {ENDINGS[s.ending]}</span>
        <span className="sbv-thesis" title={s.thesis}>{s.thesis}</span>
        <span className="sbv-ro"><Icon name="eye" size={14} />보기 전용<span className="l"> · <b>활용하기</b>를 누르면 내 제안서로 고치고 넣을 수 있어요</span></span>
      </div>
      <div className="story sbv-story">
        <StoryCanvas p={p} open={open} stage="story" readOnly activePart={part ? part.id : null} pop={pop && pop.t !== 'part' ? pop : null}
          onReq={() => setPop((v) => (v && v.t === 'req' ? null : { t: 'req' }))} onMatch={() => setPop((v) => (v && v.t === 'match' ? null : { t: 'match' }))}
          pageOf={(u) => pages[u] || ''}>
          {pop && pop.t === 'req' && <ReqView s={s} p={p} onClose={close} />}
          {pop && pop.t === 'match' && <MatchView s={s} p={p} onClose={close} />}
          {part && <PartView p={p} part={part} pages={pages} onClose={close} onSheet={(u) => { const k = slideOfUid(s.id, u); if (k >= 0) setSheet(k); }} />}
        </StoryCanvas>
      </div>
      {sheet != null && <SheetDetail s={s} index={sheet} onNav={setSheet} onClose={() => setSheet(null)} />}
      {ask && <UseConfirm s={s} onCancel={() => setAsk(false)} onConfirm={() => { setAsk(false); onClose(); activateScenario(s, go); }} />}
    </Modal>
  );
}

const RO_NOTE = <span className="bp-note"><Icon name="eye" size={13} />보기 전용 · 활용하기를 누르면 내 제안서로 고칠 수 있어요</span>;
/** 고객 요구사항 — view only (the same content a proposal's requirements popup holds: 자유형식 · 입력 폼 키맨별 요구 · 메모) */
function ReqView({ s, p, onClose }) {
  const f = p.req.form; const plain = (segs) => segs.map((x) => x.t || '').join('');
  return (
    <BubblePopup cls="rq" extra="ro" anchor=".start-node .node" icon={<Icon name="clip" size={17} />} title="고객 요구사항" onClose={onClose}
      sub={<span className="bp-sub"><b>{p.customer || '고객사 미정'}</b><span>{indName(s.ind)}</span></span>}
      footer={<>{RO_NOTE}<span className="sp" /><button className="btn btn-sm" onClick={onClose}>닫기</button></>}>
      <section className="rov">
        <div className="rov-grid">
          <div><span className="lbl">프로젝트</span><b>{f.project}</b></div>
          <div><span className="lbl">고객사</span><b>{f.customer || p.customer}</b></div>
          <div><span className="lbl">결정권자</span><b>{f.target}</b></div>
        </div>
      </section>
      <section className="rov">
        <h4>고객 상황</h4>
        <p className="rov-free">{s.situation}</p>
        <div className="rov-sig">{s.signals.map((t, i) => <span key={i}>{t}</span>)}</div>
      </section>
      <section className="rov">
        <h4>키맨별 요구사항</h4>
        <div className="rov-km">
          {f.keymen.map((k) => (
            <div key={k.id} className="rov-k">
              <div className="rov-kh"><b>{k.name}</b><span className="num">{k.weight}%</span><i style={{ width: Math.max(6, k.weight) + '%' }} /></div>
              <ul>{k.reqs.map((r, i) => <li key={i}>{plain(r)}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>
      {f.note && <section className="rov"><h4>제작자 메모</h4><p className="rov-free">{f.note}</p></section>}
    </BubblePopup>
  );
}
/** 제품 · 솔루션 매칭 — view only */
function MatchView({ s, p, onClose }) {
  const groups = [['products', 'product', '제품'], ['solutions', 'solution', '솔루션'], ['cases', 'case', '유관 사례']];
  return (
    <BubblePopup cls="mt" extra="ro" anchor=".match-node .node" icon={<Icon name="link" size={17} />} title="제품 · 솔루션 매칭" onClose={onClose}
      sub={<span className="bp-sub"><span>{indName(s.ind)}</span></span>}
      footer={<>{RO_NOTE}<span className="sp" /><button className="btn btn-sm" onClick={onClose}>닫기</button></>}>
      {groups.map(([k, t, label]) => (
        <section key={k} className="rov">
          <h4><Icon name={t} size={14} />{label}<span className="num">{p.ctx[k].length}</span></h4>
          {p.ctx[k].length ? <div className="rov-tags">{p.ctx[k].map((id) => <TagCard key={id} r={t + ':' + id} />)}</div>
            : <p className="muted rov-none">{t === 'case' ? '고객이 정해지면 업종 · 관심사에 맞춰 채워요' : '연결된 항목이 없어요'}</p>}
        </section>
      ))}
    </BubblePopup>
  );
}
/** 파트 — view only: what the part says (내용) and its layouts */
function PartView({ p, part, pages, onClose, onSheet }) {
  const t = PARTS[part.type] || PARTS.free;
  return (
    <BubblePopup cls="sbp" extra="ro" anchor={'.col[data-pid="' + part.id + '"] .node'} icon={<Icon name={partIcon(part)} size={17} />} title={part.name} onClose={onClose}
      sub={<span className="bp-sub"><span>{t.label}</span></span>}
      footer={<>{RO_NOTE}<span className="sp" /><button className="btn btn-sm" onClick={onClose}>닫기</button></>}>
      <section className="rov">
        {part.goal && <p className="rov-goal">{part.goal}</p>}
        <h4>내용</h4>
        <ul className="rov-items">{part.items.map((x, i) => <li key={i}>{x}</li>)}</ul>
      </section>
      <section className="rov">
        <h4>PPT 레이아웃<span className="num">{part.layouts.length}</span></h4>
        <div className="rov-lays">
          {part.layouts.map((x) => (
            <button key={x.uid} type="button" className="rov-lay" onClick={() => onSheet(x.uid)} aria-label={(pages[x.uid] || '') + '쪽 ' + (L[x.f] ? L[x.f].name : '') + ' 크게 보기'}>
              <span className="pg num">{pages[x.uid]}</span>
              <FitSlide f={x.f} ov={x.ov} pageNo={pages[x.uid]} lazy />
              <FavButton f={x.f} ov={x.ov} from={'Best Scenario · ' + (p.title || '')} />
              <span className="nm">{L[x.f] ? L[x.f].name : x.f}</span>
            </button>
          ))}
        </div>
      </section>
    </BubblePopup>
  );
}

/* =========================================================
   Scenario detail popup
   ========================================================= */
/** linked 제품 · 솔루션 · 사례 — thumbnail + name + one line of metadata */
function Chips({ ids, type, label }) {
  const list = (ids || []).filter((id) => tagMeta(type + ':' + id));
  if (!list.length) return null;
  return <div className="bsd-chips"><span className="lbl">{label}</span><div className="tagchips">{list.map((id) => <TagChip key={id} r={type + ':' + id} />)}</div></div>;
}

export function ScenarioDetail({ s, go, onClose, onSwitch }) {
  const slides = useMemo(() => slidesOfScenario(s), [s.id]);
  const layouts = slides.map((x) => L[x.f]);
  const [peek, setPeek] = useState(null);
  const [busy, run] = useBusy();
  const req = REQ_TYPES[s.req]; const strat = STRATEGIES[s.strategy];
  const needs = [...new Set(layouts.flatMap((l) => l.req || []))];
  const hc = usePickPeek();
  let k = 0;

  const [ask, setAsk] = useState(false);
  const download = () => run(() => downloadScenario(s));

  return (
    <Modal size="xwide" onClose={onClose}
      title={<span className="bsd-t">{s.title}</span>}
      sub={s.short}
      footer={<>
        <span className="note">{REQ_TYPES[s.req].label} · {STRATEGIES[s.strategy].label}</span>
        <span className="sp" />
        <button className="btn" onClick={onClose}>닫기</button>
        <button className="btn" disabled={busy} onClick={download}>{busy ? <span className="spin" /> : <Icon name="download" size={15} />}{busy ? '만드는 중…' : 'PPTX로 받기'}</button>
        <button className="btn btn-primary" onClick={() => setAsk(true)}><Icon name="plus" size={15} stroke={2.4} />활용하기</button>
      </>}>
      <div className="bsd">
        <div className="bsd-tags">
          <span className={'tag pt h-' + req.hue}>{req.label}</span>
          <span className="tag">{strat.label}</span>
          <span className="tag">{indName(s.ind)}</span>
        </div>

        <div className="bsd-trio">
          <section className="bsd-card" aria-labelledby="bsd-req">
            <h3 id="bsd-req"><span className="k">요구사항</span>{req.label}</h3>
            <p className="bsd-desc">{req.desc}</p>
            <p className="bsd-body">{s.situation}</p>
            <div className="bsd-sub"><span className="lbl">고객이 이렇게 말할 때</span><ul className="bsd-quotes">{s.signals.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
          </section>
          <section className="bsd-card" aria-labelledby="bsd-st">
            <h3 id="bsd-st"><span className="k">전략</span>{strat.label}</h3>
            <p className="bsd-desc">{strat.desc}</p>
            <p className="bsd-thesis">{s.thesis}</p>
            <div className="bsd-sub"><span className="lbl">논리 전개</span><ol className="bsd-steps">{s.logic.map((t, i) => <li key={i}>{t}</li>)}</ol></div>
            <div className="bsd-sub"><span className="lbl">차별화 · 톤</span><ul className="bsd-dots">{s.diff.map((t, i) => <li key={i}>{t}</li>)}<li className="muted">톤 · {s.tone}</li></ul></div>
          </section>
          <section className="bsd-card" aria-labelledby="bsd-end">
            <h3 id="bsd-end"><span className="k">결말</span>{ENDINGS[s.ending]}</h3>
            <p className="bsd-ask">{s.ask}</p>
            <div className="bsd-sub"><span className="lbl">합의 뒤 바로 할 일</span><ul className="bsd-dots">{s.next.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
            <div className="bsd-sub"><span className="lbl">결정권자</span><p className="bsd-who"><b>{s.audience.lead}</b>{s.audience.others.length ? ' · ' + s.audience.others.join(' · ') : ''}</p></div>
            <div className="bsd-sub"><span className="lbl">평가 · 결정 기준</span><div className="tagrow">{s.criteria.map((t, i) => <span key={i} className="tag">{t}</span>)}</div></div>
          </section>
        </div>

        <section className="bsd-flow" aria-labelledby="bsd-flow-h">
          <div className="bsd-flow-h">
            <h3 id="bsd-flow-h">흐름</h3>
            <span className="faint" style={{ fontSize: "var(--text-12px)" }}>장표를 누르면 크게 보고 이 시나리오에서의 역할을 확인할 수 있어요</span>
          </div>
          <ol className="bsd-steps-bar">
            {s.flow.map((g, i) => (
              <li key={i} className={'h-' + STAGES[g.key].hue}>
                <span className="n num">{i + 1}</span>
                <span className="t"><b>{g.name}</b><span>{g.goal}</span></span>
              </li>
            ))}
          </ol>
          <div className="bsd-story">
            {s.flow.map((g, gi) => (
              <React.Fragment key={gi}>
                <div className={'bsd-chap h-' + STAGES[g.key].hue}>
                  <span className="n num">{gi + 1}</span>
                  <b>{g.name}</b>
                  <span className="g">{g.goal}</span>
                </div>
                {g.slides.map((x) => {
                  const i = k++; const l = L[x.f];
                  return (
                    <button key={x.f} className="bsd-slide" onClick={() => { hc.hide(); setPeek(i); }} aria-label={(i + 1) + '번째 장 ' + l.name + ' 크게 보기'} {...peekProps(hc, s, { ...x, stageName: g.name }, i)}>
                      <span className="pg num">{i + 1}</span>
                      <div className="tl-thumb"><FitSlide f={x.f} ov={ovOf(s.id, i, x.f)} pageNo={i + 1} lazy /><FavButton f={x.f} ov={ovOf(s.id, i, x.f)} from={'Best Scenario · ' + s.title} /></div>
                      <span className="nm">{l.name}</span>
                      <span className="role">{x.role}</span>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </section>

        <div className="bsd-grid">
          <section className="bsd-card"><h3><span className="k">메시지</span>핵심 메시지</h3><ol className="bsd-steps">{s.messages.map((t, i) => <li key={i}>{t}</li>)}</ol></section>
          <section className="bsd-card"><h3><span className="k">대응</span>예상 반론 → 대응</h3>
            <dl className="bsd-qa">{s.objections.map(([q, a], i) => <React.Fragment key={i}><dt>“{q}”</dt><dd>{a}</dd></React.Fragment>)}</dl>
          </section>
          <section className="bsd-card"><h3><span className="k">준비</span>준비할 자료</h3>
            <ul className="bsd-dots">{s.prep.map((t, i) => <li key={i}>{t}</li>)}</ul>
            <div className="bsd-sub"><span className="lbl">레이아웃이 요구하는 정보</span><div className="tagrow">{needs.map((r) => <span key={r} className="tag rq">{REQ_LABEL[r] || r}</span>)}</div></div>
          </section>
          <section className="bsd-card"><h3><span className="k">연결</span>제품 · 솔루션 · 사례</h3>
            <Chips ids={s.products} type="product" label="제품" />
            <Chips ids={s.solutions} type="solution" label="솔루션" />
            <Chips ids={s.cases} type="case" label="유관 사례" />
            {!s.products.length && !s.solutions.length && <p className="muted" style={{ fontSize: "var(--text-12-5px)", margin: "var(--space-0px)" }}>고객이 정해지면 업종 · 관심사에 맞춰 채워요.</p>}
          </section>
          <section className="bsd-card"><h3><span className="k">지표</span>성공 지표</h3><ul className="bsd-dots">{s.kpis.map((t, i) => <li key={i}>{t}</li>)}</ul></section>
          <section className="bsd-card"><h3><span className="k">적합</span>언제 쓰나</h3>
            <p className="bsd-fit"><Icon name="check" size={14} stroke={2.6} /><span>{s.fit}</span></p>
            <p className="bsd-fit no"><Icon name="swap" size={14} /><span>{String(s.avoid).split(/(BS-\d\d(?:\([^)]*\))?)/).map((t, i) => { const m = /^BS-(\d\d)/.exec(t); const to = m && SC['bs' + m[1]];
              return to && onSwitch ? <button key={i} className="bsd-ref" onClick={() => onSwitch(to.id)}>{to.title}</button> : <React.Fragment key={i}>{to ? to.title : t}</React.Fragment>; })}</span></p>
          </section>
        </div>
      </div>
      {hc.node}
      {peek != null && <TemplateDetail list={layouts} ovs={slides.map((x, k) => ovOf(s.id, k, x.f))} index={peek} onNav={setPeek} onClose={() => setPeek(null)} favFrom={'Best Scenario · ' + s.title} notes={slides.map((x) => x.stage.name + ' · ' + x.role)} noteLabel="이 시나리오에서의 역할" />}
      {ask && <UseConfirm s={s} onCancel={() => setAsk(false)} onConfirm={() => { setAsk(false); onClose(); activateScenario(s, go); }} />}
    </Modal>
  );
}
