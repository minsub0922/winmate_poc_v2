import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Modal, toast, partHue, confirmDelete } from '../components/common.jsx';
import { PartBubble } from '../components/part-bubble.jsx';
import { useFitWidth } from '../components/sheetview.jsx';
import { FavButton } from '../components/fav.jsx';
import { Slide, FitSlide } from '../domain/slides/Slide.jsx';
import { exportPptx } from '../domain/slides/export-pptx.js';
import { deprecatedInDeck, deprecatedLine } from '../domain/products/deprecation.js';
import { TemplateDetail, saveBlob, safeName } from '../components/tplkit.jsx';
import { L } from '../services/catalog.js';
import { SC, slidesOfScenario } from '../domain/templates/scenarios.js';
import { ovOf, partTypeOf } from '../domain/templates/scenario_storyboard.js';
import { TOC_TEMPLATES, TOCS, tocName, loadTocContent, ensureTocScenario, tocVerticals, tocUaSheets, UA_KINDS } from '../domain/templates/toc_templates.js';
import { ScenarioStoryboard, activateScenario } from './ScenariosPage.jsx';
import '../styles/toc.css';

/* =========================================================
   목차 템플릿 — 목차(= Storyboard 버블) 흐름이 정해진 제안서 양식.
   목록: 템플릿 카드가 세로로 · 카드마다 큰 이름 + 목차마다 한 칸(작은 목차 버블 + 그 목차의 대표 장, 흐름 순서 그대로).
   카드를 누르면 상세 팝업 — 헤더의 드롭다운으로 업종(44, 이 양식이 다루는 기존 샘플 포함)을 고르면 그 덱을
   목차 버블 흐름 + 왼쪽 장 썸네일 세로 목록(목차마다 버블로 묶음) + 오른쪽 큰 장으로 본다 · Storyboard · PPTX · 활용하기.
   ========================================================= */
const DEMO_V = 'fb_qsr';
const isDeck = (g) => !!g.deck || g.key === 'open'; // 표지(+ 목차) — 버블 없는 앞장
const isDiv = (f) => /^L_VS_DIV_R\d$/.test(f);
const stageLabel = (name) => name.replace(/^(목차 · )?\d{2}\s+/, '');
const pad = (n) => String(n).padStart(2, '0');
const tplParts = (t, short) => t.tocs.map((k) => ({ type: TOCS[k].type, name: tocName(k, short) }));

/** 목차 흐름 — Storyboard 목차 버블(PartBubble)을 작게: 유형 아이콘 원 + 순서 + 이름, 점선으로 잇는다.
 *  parts: [{ type, name, n? }] · on: 지금 보는 목차(0부터) · onPick(i): 그 목차의 첫 장으로 */
function Flow({ parts, label, on = -1, onPick }) {
  return (
    <ol className="tocmf" aria-label={label}>
      {parts.map((x, i) => (
        <React.Fragment key={i}>
          {i > 0 && <li className="tocmf-conn" aria-hidden="true" />}
          <li className={'tocmf-i pb-mini ' + partHue(x.type) + (i === on ? ' on' : '')} aria-current={i === on ? 'step' : undefined}>
            <PartBubble part={{ type: x.type, name: x.name, done: true }} no={i + 1} onClick={onPick ? () => onPick(i) : undefined} label={onPick ? x.name + ' 장 보기' : undefined} />
            {x.n != null && <span className="tocmf-c num">{x.n}장</span>}
          </li>
        </React.Fragment>
      ))}
    </ol>
  );
}

async function downloadDeck(s) {
  const slides = slidesOfScenario(s);
  const deck = slides.map((x, k) => ({ f: x.f, ov: ovOf(s.id, k, x.f), part: x.stage.name }));
  // 목차 템플릿 덱은 그대로 두고, 판매 종료 제품(DSS DB 업데이트에서 확정)이 들어 있으면 받기 전에 한 번 더 확인
  const deprecated = deprecatedInDeck({ ctx: { products: s.products || [] } }, deck.map((x, k) => ({ x, n: k + 1 })));
  if (deprecated.length && !(await confirmDelete({ title: '판매 종료된 제품이 들어 있어요', confirmLabel: '이대로 받기',
    message: '이 덱에는 더 이상 판매하지 않는 제품이 있어요. 그대로 받거나, 내 제안서로 만든 뒤 제품을 바꿔 주세요.',
    items: deprecated.map(deprecatedLine) }))) return;
  const blob = await exportPptx(deck, { title: s.title });
  const r = await saveBlob(blob, safeName('Winmate ' + s.title) + '.pptx');
  if (r.ok) toast(s.title + ' PPTX를 저장했어요'); else toast(r.err, 'warn');
}

/** 카드 본문 — 목차마다 한 칸: 작은 목차 버블 + 그 목차의 대표 장(대표 업종 시나리오에서 간지 다음 첫 장). 칸 순서 = 목차 흐름 = 덱 순서 */
function TocColumns({ t, ready }) {
  const s = ready ? ensureTocScenario(t.id, DEMO_V) : null;
  const picks = useMemo(() => {
    if (!s) return [];
    const slides = slidesOfScenario(s);
    return s.flow.filter((g) => !isDeck(g)).map((g) => { const k = slides.findIndex((x) => x.stage === g && !isDiv(x.f) && x.f !== 'L_VS_TOC'); return k >= 0 ? { f: slides[k].f, k } : null; });
  }, [s && s.id]);
  return (
    <ol className="tocc-cols" aria-label={t.name + ' 목차와 대표 장'}>
      {tplParts(t).map((x, i) => (
        <li key={i} className={'tocc-col ' + partHue(x.type)}>
          <div className="tocc-colh pb-mini"><PartBubble part={{ type: x.type, name: x.name, done: true }} no={i + 1} /></div>
          <div className={'tocc-sheet' + (picks[i] ? '' : ' sk')}>{picks[i] && <FitSlide f={picks[i].f} ov={ovOf(s.id, picks[i].k, picks[i].f)} lazy />}</div>
        </li>
      ))}
    </ol>
  );
}

function TocCard({ t, i, ready, onOpen }) {
  const nRel = (t.related || []).filter((id) => SC[id]).length;
  return (
    <article className={'tocc h-' + t.hue}>
      <button type="button" className="tocc-hit" onClick={() => onOpen(t.id)} aria-label={t.name + ' 상세 보기'} />
      <div className="tocc-top">
        <span className="tocc-no num">{pad(i + 1)}</span>
        <h3 className="tocc-nm">{t.name}</h3>
        <span className="tocc-badge">{t.badge}</span>
        <span className="tocc-more">업종별 시나리오 보기<Icon name="chev" size={16} stroke={2.4} /></span>
      </div>
      <div className="tocc-sub">
        <p className="tocc-d">{t.desc}</p>
        <div className="tocc-meta">
          <span><b className="num">44</b> {t.id === 'std' ? '업종 표준 제안서' : '업종 시나리오'}</span>
          <span><b className="num">{t.tocs.length}</b> 목차</span>
          {nRel > 0 && <span>기존 샘플 <b className="num">{nRel}</b></span>}
        </div>
      </div>
      <TocColumns t={t} ready={ready} />
    </article>
  );
}

export function TocTemplatesPage({ go }) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(null);
  useEffect(() => { let on = true; loadTocContent().then(() => on && setReady(true)).catch((e) => { console.error(e); toast('목차 템플릿 콘텐츠를 불러오지 못했어요', 'warn'); }); return () => { on = false; }; }, []);
  const t = open ? TOC_TEMPLATES.find((x) => x.id === open) : null;
  return (
    <div className="tl tocp">
      <div className="tl-in">
        <header className="tl-head">
          <div className="tl-title">
            <span className="eyebrow">WINMATE · 목차 템플릿</span>
            <h1>목차 템플릿 <span className="num">{TOC_TEMPLATES.length}</span></h1>
            <p>목차 흐름이 정해진 제안서 양식이에요. 같은 양식이면 장은 같고 업종마다 내용과 장 수만 달라요. 이름이 같은 목차는 표준 제안서의 장을 그대로 써요.</p>
          </div>
        </header>
        <div className="tocp-list">
          {TOC_TEMPLATES.map((x, i) => <TocCard key={x.id} t={x} i={i} ready={ready} onOpen={setOpen} />)}
        </div>
      </div>
      {t && <TocDetail key={t.id} t={t} ready={ready} go={go} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ---------- 업종 드롭다운: 업종 그룹별 44개 + 이 양식이 다루는 기존 샘플 · 찾기 · ↑↓ · Enter · Esc ---------- */
const norm = (x) => String(x || '').toLowerCase().replace(/\s/g, '');
function DeckMenu({ t, verts, rel, sel, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [act, setAct] = useState(0);
  const box = useRef(null); const btn = useRef(null); const list = useRef(null);
  const subOf = (v) => (t.id === 'prod' ? v.prod : `${v.ai} · 공간 ${v.nSp}`);
  const n = norm(q);
  const opts = useMemo(() => {
    const out = [];
    for (const v of verts) if (!n || norm([v.nm, v.full, v.gn, v.ai, v.prod].join(' ')).includes(n)) out.push({ kind: 'ind', id: v.id, nm: v.nm, sub: subOf(v), g: v.gn });
    for (const r of rel) {
      if (n && !norm(r.title).includes(n)) continue;
      const body = r.flow.filter((g) => !isDeck(g));
      out.push({ kind: 'rel', id: r.id, nm: r.title, sub: `목차 ${body.length}개 · 장 ${r.flow.reduce((a, g) => a + g.slides.length, 0)}장`, g: '기존 샘플 · 이 양식을 뽑은 샘플 버티컬 시나리오' });
    }
    return out;
  }, [verts.length, rel.length, n, t.id]);
  const isOn = (o) => o.kind === sel.kind && o.id === sel.id;
  const curV = sel.kind === 'ind' ? verts.find((v) => v.id === sel.id) : null;
  const curR = sel.kind === 'rel' ? rel.find((r) => r.id === sel.id) : null;
  const show = () => { setQ(''); setOpen(true); };
  const hide = (focus) => { setOpen(false); if (focus && btn.current) btn.current.focus(); };
  const pick = (o) => { onPick({ kind: o.kind, id: o.id }); hide(true); };
  useEffect(() => { if (open) { const i = opts.findIndex(isOn); setAct(i < 0 ? 0 : i); } }, [open]);
  useEffect(() => { if (open) setAct((a) => Math.min(a, Math.max(0, opts.length - 1))); }, [opts.length]);
  useEffect(() => { const el = open && list.current && list.current.querySelector('[data-act="true"]'); if (el) el.scrollIntoView({ block: 'nearest' }); }, [act, open]);
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(true); return; } // 팝업은 그대로 — 메뉴만 닫는다
    if (e.key === 'Tab') { setOpen(false); return; }
    if (/^Arrow/.test(e.key)) e.stopPropagation(); // 뒤의 장 넘기기로 새지 않게
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct((a) => Math.min(opts.length - 1, a + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAct((a) => Math.max(0, a - 1)); }
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const o = opts[act]; if (o) pick(o); }
  };
  let lastG = null;
  return (
    <div className="tocm" ref={box}>
      <button ref={btn} type="button" className="tocm-btn" aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? hide(false) : show())}
        aria-label={(curR ? '기존 샘플 ' + curR.title : '업종 ' + (curV ? curV.nm : '')) + ' — 다른 업종 고르기'}>
        <span className="lbl">{curR ? '기존 샘플' : '업종'}</span>
        <span className="tx"><span className="nm">{curR ? curR.title : curV ? curV.nm : '불러오는 중…'}</span>{curV && <span className="cu">{subOf(curV)}</span>}</span>
        <Icon name="chevD" size={16} stroke={2.4} />
      </button>
      {open && (
        <div className="tocm-pop" onKeyDown={onKey}>
          <div className="tocm-q">
            <Icon name="search" size={15} />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.id === 'prod' ? '업종 · 제품으로 찾기' : '업종 · AI 업종으로 찾기'} aria-label="업종 찾기"
              role="combobox" aria-expanded="true" aria-controls="tocm-list" aria-activedescendant={opts[act] ? 'tocm-o-' + opts[act].id : undefined} autoComplete="off" />
          </div>
          <div className="tocm-list" id="tocm-list" role="listbox" aria-label="업종" ref={list}>
            {opts.map((o, i) => {
              const head = o.g !== lastG; lastG = o.g;
              return (
                <React.Fragment key={o.kind + o.id}>
                  {head && <span className="tocm-gh" role="presentation">{o.g}</span>}
                  <button type="button" id={'tocm-o-' + o.id} role="option" aria-selected={isOn(o)} data-act={i === act} className={'tocm-o' + (i === act ? ' act' : '')}
                    onMouseEnter={() => setAct(i)} onClick={() => pick(o)}>
                    <span className="nm">{o.nm}</span><span className="cu">{o.sub}</span>
                    {isOn(o) && <Icon name="check" size={16} stroke={2.6} className="ck" />}
                  </button>
                </React.Fragment>
              );
            })}
            {!opts.length && <p className="tocm-empty">찾는 업종이 없어요. 다른 말로 찾아보세요.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 상세 팝업: 업종(드롭다운) · 목차 흐름 · 장 썸네일 세로 목록 + 큰 장 ---------- */
function TocDetail({ t, ready, go, onClose }) {
  const [sel, setSel] = useState({ kind: 'ind', id: DEMO_V });
  const [pos, setPos] = useState({ g: 0, j: 0 }); // 묶음(표지 · 목차마다) · 그 안의 장 — 업종을 바꿔도 같은 목차 자리에 머문다
  const [sb, setSb] = useState(null); // scenario id for the Storyboard view
  const [big, setBig] = useState(null); // { list, ovs, notes, index, ua }
  const [busy, setBusy] = useState(false);
  const verts = ready ? tocVerticals() : [];
  const rel = useMemo(() => (t.related || []).map((id) => SC[id]).filter(Boolean), [t.id]);
  const isRel = sel.kind === 'rel';
  const s = !ready ? null : isRel ? SC[sel.id] || null : ensureTocScenario(t.id, sel.id);
  const v = !isRel ? verts.find((x) => x.id === sel.id) : null;
  const slides = useMemo(() => (s ? slidesOfScenario(s) : []), [s && s.id]);
  const ua = useMemo(() => (ready && !isRel && t.tocs.includes('ua') ? tocUaSheets(sel.id) : []), [ready, isRel, sel.id, t.id]);
  // 장 묶음: 표지 · 목차(숨은 앞장) → 목차마다(버블) → 당사의 이해 업종별 시트(덱 밖, 바꿔 쓰는 장)
  const groups = useMemo(() => {
    if (!s) return [];
    const out = [];
    slides.forEach((x, k) => {
      const it = { k, f: x.f, ov: ovOf(s.id, k, x.f), role: x.role, page: k + 1 };
      const last = out[out.length - 1];
      if (last && last.stage === x.stage) last.items.push(it); else out.push({ stage: x.stage, deck: isDeck(x.stage), items: [it] });
    });
    let no = 0;
    for (const g of out) {
      if (g.deck) { g.label = g.items.length > 1 ? '표지 · 목차' : '표지'; continue; }
      const key = isRel ? null : t.tocs[no];
      no += 1; g.no = no;
      g.type = key && TOCS[key] ? TOCS[key].type : partTypeOf(g.stage, s.id);
      g.label = key && TOCS[key] ? tocName(key, v ? v.short : null) : stageLabel(g.stage.name);
    }
    if (ua.length) out.push({ ua: true, type: TOCS.ua.type, label: '당사의 이해 · 업종별 시트', items: ua.map((y, i) => ({ k: null, i, f: y.f, ov: y.ov, role: UA_KINDS[y.kind] })) });
    return out;
  }, [s && s.id, ua]);
  const parts = groups.filter((g) => !g.deck && !g.ua);
  const flat = useMemo(() => groups.flatMap((G, gi) => G.items.map((x, j) => ({ ...x, gi, j }))), [groups]);
  const gi = Math.min(pos.g, Math.max(0, groups.length - 1));
  const G = groups[gi] || null;
  const ci = G ? flat.findIndex((x) => x.gi === gi && x.j === Math.min(pos.j, G.items.length - 1)) : -1;
  const cur = ci >= 0 ? flat[ci] : null;
  const goTo = (i) => { const x = flat[i]; if (x) setPos({ g: x.gi, j: x.j }); };
  const step = (d) => { if (ci >= 0) goTo(Math.max(0, Math.min(flat.length - 1, ci + d))); };
  const stepRef = useRef(step); stepRef.current = step;
  useEffect(() => { // ← → (↑ ↓) 로 장 넘기기 — 크게 보기 · Storyboard가 열려 있으면 그쪽이 받는다
    if (big || sb) return undefined;
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const tg = e.target;
      if (tg && (/^(INPUT|SELECT|TEXTAREA)$/.test(tg.tagName) || tg.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); stepRef.current(1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); stepRef.current(-1); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [!!big, !!sb]);
  const rail = useRef(null);
  useEffect(() => { // 고른 장이 목록 안에 보이게 — 목록만 굴린다(팝업 본문은 그대로). 목차 첫 장이면 버블 머리까지
    const r = rail.current; const el = r && r.querySelector('[aria-current="true"]'); if (!el) return;
    const top = (cur && cur.j === 0 && el.closest('.tocv-g')) || el;
    const rr = r.getBoundingClientRect(); const a = top.getBoundingClientRect(); const e = el.getBoundingClientRect();
    if (r.scrollHeight > r.clientHeight + 1) {
      if (a.top < rr.top) r.scrollTop -= rr.top - a.top + 6; else if (e.bottom > rr.bottom) r.scrollTop += Math.min(e.bottom - rr.bottom + 6, a.top - rr.top);
    } else if (r.scrollWidth > r.clientWidth + 1) {
      if (a.left < rr.left) r.scrollLeft -= rr.left - a.left + 6; else if (e.right > rr.right) r.scrollLeft += Math.min(e.right - rr.right + 6, a.left - rr.left);
    }
  }, [ci, s && s.id]);
  const fit = useRef(null);
  const bw = useFitWidth(fit, 16 / 9);
  const on = G && G.ua ? t.tocs.indexOf('ua') : G && !G.deck ? G.no - 1 : -1;
  const pickPart = (i) => { const g = groups.findIndex((x) => x.no === i + 1); if (g >= 0) setPos({ g, j: 0 }); };
  const openBig = () => {
    if (!cur || !G) return;
    if (G.ua) setBig({ ua: true, list: ua.map((y) => L[y.f]), ovs: ua.map((y) => y.ov), notes: ua.map((y) => '당사의 이해 · ' + UA_KINDS[y.kind]), index: cur.i });
    else setBig({ list: slides.map((x) => L[x.f]), ovs: slides.map((x, k) => ovOf(s.id, k, x.f)), notes: slides.map((x) => x.stage.name + ' · ' + x.role), index: cur.k });
  };
  const navBig = (k) => { // 크게 보기에서 넘기면 목록도 같은 장으로
    setBig((b) => ({ ...b, index: k }));
    const i = flat.findIndex((x) => (big && big.ua ? x.i === k && x.k == null : x.k === k));
    if (i >= 0) goTo(i);
  };
  const run = async () => { if (!s) return; setBusy(true); try { await downloadDeck(s); } catch (e) { console.error(e); toast('PPTX를 만들지 못했어요: ' + (e && e.message ? e.message : e), 'warn'); } setBusy(false); };
  const where = G ? (G.deck ? G.label : G.ua ? G.label : `${pad(G.no)} ${G.label}`) : '';
  return (
    <Modal size="tocd" bodyClass="mbody tocd-body" onClose={() => { if (big) setBig(null); else onClose(); }}
      title={<span className="tocd-t">{t.name}<span className={'tocd-badge h-' + t.hue}>{t.badge}</span></span>} sub={t.desc}
      headerActions={<DeckMenu t={t} verts={verts} rel={rel} sel={sel} onPick={setSel} />}
      footer={<>
        <span className="note">{s ? `${s.title} · 목차 ${parts.length}개 · 장 ${slides.length}장` : '불러오는 중…'}</span>
        <span className="sp" />
        <button className="btn" onClick={onClose}>닫기</button>
        <button className="btn" disabled={!s} onClick={() => setSb(s.id)}><Icon name="route" size={15} />Storyboard 보기</button>
        <button className="btn" disabled={!s || busy} onClick={run}>{busy ? <span className="spin" /> : <Icon name="download" size={15} />}{busy ? '만드는 중…' : 'PPTX로 받기'}</button>
        <button className="btn btn-primary" disabled={!s} onClick={() => { onClose(); activateScenario(s, go); }} data-login-required><Icon name="plus" size={15} stroke={2.4} />활용하기</button>
      </>}>
      <div className="tocd-flow">
        <Flow parts={(parts.length ? parts : isRel ? [] : tplParts(t, v ? v.short : null)).map((g) => ({ type: g.type, name: g.label || g.name, n: g.items ? g.items.length : null }))}
          label={(s ? s.title : t.name) + ' 목차 흐름'} on={on} onPick={parts.length ? pickPart : undefined} />
      </div>
      <div className="tocv">
        <nav className="tocv-rail" ref={rail} aria-label="장 목록">
          {!s && <p className="faint tocv-wait">장을 불러오는 중…</p>}
          {groups.map((g, gn) => (
            <section key={(g.ua ? 'ua' : g.stage.name) + gn} className={'tocv-g' + (g.deck ? ' deck' : '') + (g.ua ? ' ua' : '')}>
              <div className={'tocv-gh ' + (g.deck ? 'h-slate' : 'pb-mini ' + partHue(g.type))}>
                {g.deck ? <span className="tocv-gl">{g.label}</span> : <PartBubble part={{ type: g.type, name: g.label, done: true }} no={g.ua ? t.tocs.indexOf('ua') + 1 : g.no} />}
                <span className="tocv-gc num">{g.items.length}장</span>
              </div>
              <div className="tocv-ths">
                {g.items.map((x, j) => {
                  const here = gn === gi && cur && cur.j === j;
                  return (
                    <button key={j} type="button" className="vthumb tocv-th" aria-current={!!here} onClick={() => setPos({ g: gn, j })}
                      aria-label={(x.page ? x.page + '쪽 ' : '당사의 이해 바꿔 쓰는 장 ') + x.role}>
                      <Slide f={x.f} ov={x.ov} width={196} lazy pageNo={x.page || undefined} />
                      <span className="no">{x.page || '+'}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>
        <div className="tocv-stage">
          <div className={'vinfo tocv-info ' + (G && !G.deck ? partHue(G.type) : 'h-slate')}>
            {G && <span className="pt">{where}</span>}
            {cur && <span className="nm">{cur.role}</span>}
            <span className="sp" />
            {cur && <FavButton f={cur.f} ov={cur.ov} from={'목차 템플릿 · ' + t.name} label />}
          </div>
          <div className="tocv-fit" ref={fit}>
            {cur && bw > 0 && (
              <div className="vslide" role="button" tabIndex={0} onClick={openBig} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openBig(); } }}
                title="눌러서 크게 보기" aria-label={(cur.page ? cur.page + '쪽 ' : '') + cur.role + ' — 눌러서 크게 보기'}>
                <Slide key={(s ? s.id : '') + ':' + ci} f={cur.f} ov={cur.ov} pageNo={cur.page || undefined} width={bw} />
                <span className="vslide-hint" aria-hidden="true"><Icon name="eye" size={13} />눌러서 크게 보기</span>
              </div>
            )}
          </div>
          <div className="vnav tocv-nav">
            <button className="btn btn-sm btn-icon" disabled={ci <= 0} onClick={() => step(-1)} aria-label="이전 장"><Icon name="chevL" size={15} /></button>
            <span className="num tocv-pg">{cur ? (cur.page ? `${cur.page} / ${slides.length}` : `덱 밖 · ${cur.i + 1} / ${ua.length}`) : '–'}</span>
            <button className="btn btn-sm btn-icon" disabled={ci < 0 || ci >= flat.length - 1} onClick={() => step(1)} aria-label="다음 장"><Icon name="chev" size={15} /></button>
            <span className="faint tocv-keys">← → 로 넘기기</span>
          </div>
        </div>
      </div>
      {big && <TemplateDetail list={big.list} ovs={big.ovs} index={big.index} onNav={navBig} onClose={() => setBig(null)} notes={big.notes} noteLabel="이 시나리오에서의 역할" favFrom={'목차 템플릿 · ' + t.name} />}
      {sb && SC[sb] && <ScenarioStoryboard key={'sb-' + sb} s={SC[sb]} go={go} onClose={() => setSb(null)} />}
    </Modal>
  );
}
