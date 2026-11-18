// Storyboard '레이아웃 구성' 버블(매칭 버블 다음) + 구성 고르기.
//   구성은 관리자 「레이아웃 구성 관리」의 추천 구성(켜 둔 것 — 지금은 기본 제안 · 상세 제안)을 그대로 쓴다(사용자 지시 2026-11-16).
//   버블 바로 아래에는 '구성 생성하기' 버튼 하나만 놓인다(만들기 전에는 다른 내용 · 로딩 없음) — 고객 요구사항 요약이 끝날 때까지 꺼져 있고
//   마우스를 대면 말풍선(LockTip)이 뜬다. 원문 매칭(services/match-extract.js)이 도는 동안에도 꺼져 있다.
//   버튼을 누르면 '제품 · 솔루션 · 서비스 매칭을 마쳤나요?'를 묻고(GenerateConfirm), 확인하면 관리자 구성마다 지금 연결한 DSS 로
//   공간별 제안 · 솔루션 제안 · 구독 상품 제안 · 서비스만 넣고 뺀 구성을 보여 준다(나머지 파트 · 순서는 관리자 구성 그대로 — services/layout-compose.js).
//   모델은 덱을 조립할 업종만 고른다(공간 구성에서 정한 업종이 있으면 모델 없이). 만든 뒤 매칭을 바꾸면 카드도 바로 바뀐다.
//   목록은 구성마다 이름 + 목차 흐름(구성 상세 위쪽과 같은 버블 + 버블 아래 이름)만 — 설명 줄 · '추천 구성' 머리글은 두지 않는다.
//   결과 상자만 오른쪽으로 넓어진다(가장 긴 구성이 한 줄에 다 들어가게 — 버블 자리는 그대로) · 버블 칸은 모든 구성에서 같은 폭(간격이 같다) ·
//   제품 스펙은 늘 맨 끝 고정이라 버블을 그리지 않는다(구성에는 들어 있다) · 버블 색은 파트마다 다르게 흐름 앞에서 뒤로(part_colors.js) ·
//   버블에 마우스를 대면 그 목차의 레이아웃 구성(대표 흐름 — 반복 장은 접는다)이 아래에 뜬다(관리자 추천 구성 목록과 같다 — 사용자 지시 2026-11-16).
//   버블을 누르면 관리자 구성 전부를 모달(2열)로 본다. 구성은 고르는 버튼(라디오 카드 — 카드 · 버블 어디를 눌러도 고른다)이고, 상세(대표 시나리오:
//   왼쪽 썸네일 · 오른쪽 큰 장)는 카드의 '샘플 보기'로만 연다 — 상세 팝업에서는 시작하지 않는다(사용자 지시 2026-11-16).
//   결과 상자 아래 '제안서 작성하기'는 구성을 하나 골라야 켜지고(꺼져 있으면 말풍선), 누르면 이 구성으로 진행할지 확인(StartConfirm)한 뒤
//   Storyboard에 목차가 놓이고 목차별 레이아웃 자동 구성이 시작된다 — 그때 레이아웃 구성 버블은 Storyboard에서 빠진다(storyboard.jsx).
//   진행 · 멈추기는 Storyboard 작업 카드(AgentDock), 실패한 목차는 그 목차 열의 '다시 구성'. 진행 중 작업을 이어서 따라가는 것은 LayoutFollow.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Modal, toast, partHue } from './common.jsx';
import { L, storyParts } from '../services/catalog.js';
import { useJobsState } from '../repositories/jobs.js';
import { useAdopt } from './AgentJobControl.jsx';
import { loadTocContent, tocContent, tocVerticals, ensureTocScenario } from '../domain/templates/toc_templates.js';
import { tplOf, SPEC_KEY } from '../domain/templates/part_catalog.js';
import { slidesOfScenario } from '../domain/templates/scenarios.js';
import { ovOf } from '../domain/templates/scenario_storyboard.js';
import { representFlow } from '../domain/templates/represent_flow.js';
import { lookStyle } from '../domain/templates/part_looks.js';
import { FitSlide } from '../domain/slides/Slide.jsx';
import { PartBubble } from './part-bubble.jsx';
import { partIcon } from './parteditor.jsx';
import { TocDetail } from '../pages/TocTemplatesPage.jsx';
import {
  summaryDone, generatedTemplates, flowOf, allTemplates, chosenVertical, savedGeneration, ensureGeneration, generating, pendingGeneration,
  generationErrorText, applyTemplate, layoutBusy, PURPOSE,
} from '../services/layout-compose.js';
import { dssOf } from '../services/dss.js';
import { useExtractBusy } from '../services/match-extract.js';
import { LockTip } from './lock-tip.jsx';
import '../styles/layout-compose.css';

const vName = (id) => { const v = id && tocVerticals().find((x) => x.id === id); return v ? v.nm : ''; };
const vShort = (id) => { const v = id && tocVerticals().find((x) => x.id === id); return v ? v.short : null; };

/** 목차 템플릿 콘텐츠(업종 이름 · 대표 장) — [ready, error] */
function useTocReady() {
  const [ready, setReady] = useState(() => !!tocContent());
  const [err, setErr] = useState('');
  useEffect(() => {
    if (ready) return undefined;
    let on = true;
    loadTocContent().then(() => on && setReady(true), (e) => { console.error(e); if (on) setErr('구성 자료를 불러오지 못했어요.'); });
    return () => { on = false; };
  }, []);
  return [ready, err];
}

/**
 * 버블 카드의 구성 생성 — 스스로 만들지 않는다. request()를 불러야(구성 생성하기 → 매칭 확인 뒤) 업종을 정하고, 만든 결과(업종)는 제안서에 남는다.
 * stale: 만든 뒤 요구사항 · 업종이 바뀜(이전 업종으로 그대로 보여 준다)
 */
function useGeneration(p) {
  const saved = savedGeneration(p);
  const [busy, setBusy] = useState(() => generating(p.id));
  const [err, setErr] = useState('');
  const run = useRef(0); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const follow = async (promise) => {
    const n = ++run.current;
    setBusy(true); setErr('');
    const r = await promise;
    if (!alive.current || n !== run.current) return;
    setBusy(false);
    if (!r.ok && r.err !== 'cancelled' && r.err !== 'aborted') setErr(generationErrorText(r));
  };
  // 다른 화면에 다녀온 사이에도 만들고 있던 생성은 (새로 부르지 않고) 이어서 기다린다
  useEffect(() => { const pending = pendingGeneration(p.id); if (pending) follow(pending); }, []);
  return { gen: saved, stale: !!saved && saved.stale, busy, err, request: () => follow(ensureGeneration(p.id)) };
}

// 버블 아래 좁은 칸에 놓이는 목차 이름의 줄바꿈 자리: 띄어쓰기 없이 긴 낱말(5자 이상)은 가운데에서 나눌 수 있게 하고('워크스페이스' → '워크스' + '페이스'),
// 가운뎃점은 앞말에 붙여 줄 끝에 둔다('파일럿 ·' / '확산')
const breakable = (name) => name.replace(/ · /g, '\u00A0· ').replace(/[가-힣]{5,}/g, (w) => { const at = Math.ceil(w.length / 2); return w.slice(0, at) + '\u200B' + w.slice(at); });

/** 카드에 그리는 목차 — 제품 스펙은 늘 맨 끝 고정이라 그리지 않는다(구성에는 들어 있고 시작하면 Storyboard 에 놓인다 — 사용자 지시 2026-11-16) */
const shownFlow = (t, p, short) => flowOf(t, p, short).filter((x) => x.key !== SPEC_KEY);
/** 목록에서 가장 긴 구성의 버블 수 — 결과 상자 폭 · 칸 폭을 정한다(구성 · 파트가 늘어도 한 줄) */
const widest = (p, short, lists) => Math.max(1, ...lists.flat().map((t) => shownFlow(t, p, short).length));

/* ---------- 버블 hover — 그 목차의 레이아웃 구성(대표 흐름) ----------
   이 제안의 업종 덱(없으면 대표 업종)에서 그 목차의 장을 덱 순서대로. 공간 · 여정 · 솔루션 · 사례마다 늘어나는 장은 한 칸으로 접고 「공간마다 × n」. */
const DEMO_V = 'fb_qsr';
const decks = new Map(); // 구성 id|업종 → { s, parts: { 목차 key: [{ f, k }] } }
function deckParts(tid, vid) {
  const ck = tid + '|' + vid;
  if (decks.has(ck)) return decks.get(ck);
  let s = null; try { s = ensureTocScenario(tid, vid); } catch (e) { console.error(e); }
  let out = null;
  const T = tplOf(tid);
  if (s && T) {
    const groups = [];
    slidesOfScenario(s).forEach((x, k) => { const last = groups[groups.length - 1]; if (last && last.stage === x.stage) last.items.push({ f: x.f, k }); else groups.push({ stage: x.stage, items: [{ f: x.f, k }] }); });
    const parts = {};
    groups.filter((g) => !(g.stage.deck || g.stage.key === 'open')).forEach((g, i) => { if (T.tocs[i]) parts[T.tocs[i]] = g.items; });
    out = { s, parts };
  }
  decks.set(ck, out);
  return out;
}
/** 그 목차의 장 — 이 구성의 덱에 없으면(요구사항으로 붙은 add-on 목차) 그 목차가 든 다른 구성의 덱에서 */
function partSheets(t, key, vid) {
  for (const id of [t.id, ...allTemplates().map((x) => x.id)]) {
    const d = deckParts(id, vid);
    if (d && d.parts[key]) return { s: d.s, items: d.parts[key] };
  }
  return null;
}
const PEEK_W = 440;
function PartPeek({ t, part, vertical, anchor, onEnter, onLeave, close }) {
  const box = useRef(null);
  const vid = vertical || DEMO_V;
  const data = useMemo(() => partSheets(t, part.key, vid), [t.id, part.key, vid]);
  // 바깥이 굴러가거나(캔버스 휠 · 페이지 스크롤) 창 크기가 바뀌면 닫는다 — 목록 안을 굴리는 것은 그대로
  useEffect(() => {
    const away = (e) => { if (!(box.current && box.current.contains(e.target))) close(); };
    window.addEventListener('scroll', away, true); window.addEventListener('wheel', away, true); window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', away, true); window.removeEventListener('wheel', away, true); window.removeEventListener('resize', close); };
  }, []);
  const r = anchor.getBoundingClientRect();
  const vw = window.innerWidth; const vh = window.innerHeight;
  const below = vh - r.bottom - 16; const above = r.top - 16;
  const down = below >= 320 || below >= above;
  const width = Math.min(PEEK_W, vw - 24);
  const left = Math.max(12, Math.min(vw - width - 12, r.left + r.width / 2 - width / 2));
  const pos = { left, width, maxHeight: Math.min(560, down ? below : above), ...(down ? { top: r.bottom + 8 } : { bottom: vh - r.top + 8 }) };
  const flow = data ? representFlow(data.items) : [];
  const vn = vName(vid);
  return createPortal(
    <div ref={box} className={'lyt-peek ' + partHue(part.type)} style={{ ...pos, ...lookStyle(part.look) }} role="dialog" aria-label={part.label + ' 레이아웃 구성'}
      data-toc={part.key} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <header>
        <span className="lyt-peek-node"><Icon name={(part.look && part.look.icon) || partIcon({ type: part.type, name: part.label })} size={15} /></span>
        <b>{part.label}</b>
        {vn && <small>{vn}</small>}
        {data && <span className="lyt-peek-n num">{data.items.length}장</span>}
      </header>
      <ol className="lyt-peek-list">
        {flow.map((x, i) => (
          <li key={x.f + i} data-layout={x.f}>
            <div className="lyt-peek-th"><FitSlide f={x.f} ov={ovOf(data.s.id, x.first.k, x.f)} /></div>
            <div><b>{(L[x.f] && L[x.f].name) || x.f}</b>{x.unit ? <em className="lyt-peek-rep">{x.unit} × {x.n}</em> : x.n > 1 ? <em className="lyt-peek-rep">× {x.n}</em> : null}</div>
          </li>
        ))}
        {!flow.length && <li className="lyt-peek-none">—</li>}
      </ol>
    </div>, document.body);
}

/** 구성 카드의 목차 흐름 — 버블(+ 이름)에 마우스를 대면 그 목차의 레이아웃 구성이 뜨고(PartPeek) 버블이 커진다 · onPick: 버블을 눌러도 그 구성을 고른다 */
function CardFlow({ t, parts, vertical, label, onPick }) {
  const [on, setOn] = useState(null); // { i, el }
  const timer = useRef(0);
  const later = (fn, ms) => { clearTimeout(timer.current); timer.current = setTimeout(fn, ms); };
  useEffect(() => () => clearTimeout(timer.current), []);
  const hold = () => clearTimeout(timer.current);
  const leave = () => later(() => setOn(null), 160);
  return (
    <ol className={'tocmf lyt-flow' + (onPick ? ' pick' : '')} aria-label={label}>
      {parts.map((x, i) => (
        <li key={x.key + i} className={'tocmf-i pb-mini ' + partHue(x.type) + (on && on.i === i ? ' peeking' : '')} style={lookStyle(x.look)} data-toc={x.key}
          onMouseEnter={(e) => { const el = e.currentTarget; later(() => setOn({ i, el }), on ? 0 : 110); }} onMouseLeave={leave} onClick={onPick}>
          <PartBubble part={{ type: x.type, name: x.label, done: true, look: x.look }} name={x.name} />
        </li>
      ))}
      {on && parts[on.i] && <PartPeek t={t} part={parts[on.i]} vertical={vertical} anchor={on.el} onEnter={hold} onLeave={leave} close={() => setOn(null)} />}
    </ol>
  );
}

/**
 * 구성 카드 — 이름 · 목차 흐름(버블 아래 이름) · '샘플 보기'(상세 팝업). 설명 줄은 두지 않는다(사용자 지시 2026-11-16).
 * onSelect 가 있으면 고르는 버튼(라디오 카드 — 카드 · 버블 어디를 눌러도 고른다, selected: 고른 구성). compact: 버블 아래 목록
 */
function TemplateCard({ p, t, short, vertical, onSample, onSelect, selected = false, compact = false }) {
  const parts = shownFlow(t, p, short).map((x) => ({ ...x, label: x.name, name: breakable(x.name) }));
  const pick = onSelect ? () => onSelect(t) : undefined;
  return (
    <article className={'lyt-card h-' + t.hue + (compact ? ' compact' : '') + (onSelect ? ' pickable' : '') + (selected ? ' on' : '')} data-tpl={t.id}>
      {onSelect && <button type="button" className="lyt-hit" role="radio" aria-checked={selected} onClick={pick} aria-label={t.name + ' 선택'} />}
      <div className="lyt-card-h">
        {onSelect && <span className="lyt-radio" aria-hidden="true">{selected && <Icon name="check" size={12} stroke={3} />}</span>}
        <b title={compact ? t.name : undefined}>{t.name}</b>
        <button type="button" className="btn btn-sm lyt-sample" onClick={() => onSample(t.id)} aria-haspopup="dialog" aria-label={t.name + ' 샘플 보기'}><Icon name="eye" size={14} />샘플 보기</button>
      </div>
      <CardFlow t={t} parts={parts} vertical={vertical} label={t.name + ' 목차 흐름 · 목차 ' + parts.length + '개'} onPick={pick} />
    </article>
  );
}
function CardSkeleton({ label, n = 6 }) {
  return (
    <div className="lyt-card sk" role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span className="lyt-card-h"><i className="lyt-sk w45 shimmer" /></span>
      <span className="lyt-sk-flow">{Array.from({ length: n }, (_, i) => <span key={i} className="lyt-sk-slot"><i className="lyt-sk dot shimmer" /></span>)}</span>
    </div>
  );
}

/** 지금 연결된 제품 · 솔루션 · 서비스(서비스 분류 솔루션 + 구독) · 공간 구성 수 */
function MatchCounts({ p }) {
  const d = dssOf(p);
  const sp = p.spacePlan && Array.isArray(p.spacePlan.spaces) ? p.spacePlan.spaces.length : 0;
  return (
    <ul className="lyt-ask-n">
      <li><Icon name="product" size={14} />제품 <b className="num">{d.products.length}</b></li>
      <li><Icon name="solution" size={14} />솔루션 <b className="num">{d.solutions.length}</b></li>
      <li><Icon name="shield" size={14} />서비스 <b className="num">{d.services.length + d.subscriptions.length}</b></li>
      <li><Icon name="map" size={14} />공간 구성 <b className="num">{sp ? sp + '곳' : '없음'}</b></li>
    </ul>
  );
}
const dssTotal = (p) => { const d = dssOf(p); return d.products.length + d.solutions.length + d.services.length + d.subscriptions.length; };

/** 구성을 만들기 전 확인 — 구성의 파트는 지금 연결한 제품 · 솔루션 · 서비스로 넣고 빼므로 매칭을 마쳤는지 먼저 묻는다. again: 요구사항이 바뀐 뒤 다시 생성 */
function GenerateConfirm({ p, again, onCancel, onMatch, onStart }) {
  return (
    <Modal size="narrow" title="제품 · 솔루션 · 서비스 매칭을 마쳤나요?" onClose={onCancel}
      footer={<><button className="btn" onClick={onMatch}><Icon name="link" size={14} />매칭 더 하기</button><span className="sp" /><button className="btn btn-primary" data-autofocus onClick={onStart}><Icon name="sparkle" size={15} />{again ? '다시 생성하기' : '구성 생성하기'}</button></>}>
      <div className="lyt-ask">
        <MatchCounts p={p} />
        {!dssTotal(p) && <p className="lyt-ask-w"><Icon name="alert" size={13} />연결된 제품 · 솔루션 · 서비스가 없어요</p>}
      </div>
    </Modal>
  );
}

/**
 * 버블 아래 구성 — '구성 생성하기' 버튼 하나(요약이 끝나야 켜진다 · 꺼져 있으면 말풍선) → 매칭 확인(GenerateConfirm) → 관리자 구성 수만큼(받는 동안 shimmer).
 * 만든 뒤에는 목록이 남고 DSS 를 바꾸면 바로 따라 바뀐다. 요구사항 · 업종이 바뀌면 안내만 한다(다시 생성은 사용자가 누른다).
 * 구성은 고르는 버튼 — 상자 아래 '제안서 작성하기'(고른 구성이 없으면 꺼짐 · 말풍선) → 이 구성으로 진행할지 확인(StartConfirm) → 목차를 놓고 자동 구성 시작.
 * onSample(tplId): 그 구성의 상세(샘플) 팝업 · onMatch: 매칭 팝업 열기
 */
function RecArea({ p, ready, tocReady, tocErr, gen, onSample, onMatch }) {
  const matching = useExtractBusy(p.id); // 원문에서 제품 · 솔루션 · 공간을 찾는 중 — 매칭이 정해진 뒤에 만든다
  const [ask, setAsk] = useState(false);
  const [sel, setSel] = useState(null); // 고른 구성(관리자 구성 id — DSS 로 파트가 빠진 변형이 바뀌어도 그대로 고른 채)
  const [askStart, setAskStart] = useState(false);
  const [applying, setApplying] = useState(false);
  const started = !!gen.gen || gen.busy || !!gen.err; // 만들었거나 만드는 중 — 그 전에는 버튼만 보인다
  const vertical = tocReady ? chosenVertical(p, gen.gen) : null;
  const short = tocReady ? vShort(vertical) : null;
  const list = tocReady ? generatedTemplates(p) : [];
  const slots = Math.max(1, tocReady ? list.length : allTemplates().length);
  const n = widest(p, short, [list.length ? list : allTemplates()]); // 보이는 구성 중 가장 긴 구성의 버블 수 — 결과 상자 폭(매칭으로 파트가 들고 나면 따라 바뀐다)
  const loading = started && (gen.busy || !tocReady);
  const stale = started && gen.stale && !gen.busy && !gen.err;
  const start = () => { setAsk(false); gen.request(); };
  // 버튼이 꺼진 이유(마우스를 대면 말풍선) — 없으면 켜져 있다
  const lock = !ready ? '고객 요구사항 요약이 끝나면 구성을 생성할 수 있어요'
    : matching ? '원문에서 제품 · 솔루션 · 공간을 찾는 중이에요 · 매칭 추론이 끝나면 구성을 생성할 수 있어요'
    : tocErr || (!tocReady ? '구성 자료를 불러오는 중이에요' : '');
  // 결과 상자 폭(버블 수)을 레이아웃 구성 칸에도 알린다 — 칸 밖으로 넓어진 만큼 오른쪽 자리를 잡는다(layout-compose.css)
  const areaRef = useRef(null);
  useEffect(() => { const node = areaRef.current && areaRef.current.closest('.layout-node'); if (node) node.style.setProperty('--lyt-n-node', String(n)); });
  const confirm = ask && <GenerateConfirm p={p} again={!!gen.gen} onCancel={() => setAsk(false)} onMatch={() => { setAsk(false); if (onMatch) onMatch(); }} onStart={start} />;
  if (!ready || !started) {
    // 만들기 전에는 버블 바로 아래 버튼 하나뿐 — 요약 · 매칭 추론이 도는 동안에도 이 칸은 로딩을 보이지 않는다(버튼만 꺼져 있다)
    return (
      <>
        <LockTip lock={lock} id="lyt-rec-hint" block>
          <button type="button" className="btn btn-primary lyt-rec-btn" disabled={!!lock} aria-haspopup="dialog" onClick={() => setAsk(true)}><Icon name="sparkle" size={15} />구성 생성하기</button>
        </LockTip>
        {confirm}
      </>
    );
  }
  const chosen = sel ? list.find((t) => (t.id.split('~')[0]) === sel) || null : null;
  const startLock = loading ? '구성을 생성하는 중이에요' : gen.err || tocErr ? '구성을 다시 생성해 주세요'
    : !chosen ? (list.map((t) => t.name).join(' · ') || '구성') + ' 중 하나를 선택하세요' : applying ? '목차를 놓는 중이에요' : '';
  const write = async () => {
    setAskStart(false);
    if (!chosen || applying) return;
    setApplying(true);
    const r = await applyTemplate(p.id, chosen.id, vertical);
    setApplying(false);
    if (!r.ok) { toast(r.message, 'warn'); return; }
    // 목차가 놓이면 이 버블(레이아웃 구성)은 Storyboard에서 빠진다 — 진행은 목차 열 · 작업 카드가 보여 준다
    if (r.started) toast(`‘${chosen.name}’ 목차를 놓았어요 · 목차마다 레이아웃을 구성하고 있어요`);
    else toast(`목차를 놓았지만 자동 구성을 시작하지 못했어요 · ${r.message}`, 'warn');
  };
  return (
    <>
      <section id="lyt-recs" ref={areaRef} className="lyt-area wide" aria-label="추천 구성" aria-busy={loading || undefined} style={{ '--lyt-n': n }}>
        {((!loading && vertical && vName(vertical)) || stale) && (
          <div className="lyt-area-h">
            {!loading && vertical && vName(vertical) && <span className="lyt-area-v" title="이 제안의 업종 — 구성 상세에서 바꿀 수 있어요">{vName(vertical)}</span>}
            {stale && <button type="button" className="lyt-re" disabled={gen.busy || !tocReady || matching} onClick={() => setAsk(true)}><Icon name="refresh" size={12} />다시 생성</button>}
          </div>
        )}
        {tocErr ? (
          <div className="lyt-err" role="alert"><span><Icon name="alert" size={14} />{tocErr}</span></div>
        ) : (
          <>
            {stale && <p className="lyt-note" role="status"><Icon name="alert" size={12} />요구사항이 바뀌었어요</p>}
            <div className="lyt-list" role={!gen.err && !loading ? 'radiogroup' : undefined} aria-label={!gen.err && !loading ? '구성 선택' : undefined}>
              {gen.err ? (
                <div className="lyt-err" role="alert">
                  <span><Icon name="alert" size={14} />{gen.err}</span>
                  <button type="button" className="btn btn-sm" onClick={gen.request}><Icon name="refresh" size={13} />다시 시도</button>
                </div>
              ) : loading ? Array.from({ length: slots }, (_, i) => <CardSkeleton key={i} n={n} label={i ? undefined : '구성을 생성하는 중'} />)
                : list.map((t) => <TemplateCard key={t.id} p={p} t={t} short={short} vertical={vertical} onSample={onSample} compact
                  selected={!!chosen && chosen.id === t.id} onSelect={(x) => setSel(x.id.split('~')[0])} />)}
            </div>
          </>
        )}
        {confirm}
      </section>
      <LockTip lock={startLock} id="lyt-start-hint" block>
        <button type="button" className="btn btn-primary lyt-start-btn" disabled={!!startLock} aria-haspopup="dialog" onClick={() => setAskStart(true)}>
          {applying ? <span className="spin" aria-hidden="true" /> : <Icon name="edit" size={15} />}제안서 작성하기
        </button>
      </LockTip>
      {askStart && chosen && <StartConfirm p={p} t={chosen} short={short} vertical={vertical} onCancel={() => setAskStart(false)} onStart={write} />}
    </>
  );
}

/** 진행 중인 레이아웃 자동 구성을 이 브라우저가 따라가고 있지 않으면(다른 탭 · 저장소 비움) 이어서 따라간다 — 레이아웃 구성 버블이 빠진 뒤에도(storyboard.jsx) */
export function LayoutFollow({ p }) {
  useJobsState();
  const lp = p.layoutPlan;
  useAdopt(lp && lp.status === 'running' && lp.jobId ? lp.jobId : null, { purpose: PURPOSE, owner: { type: 'proposal', id: p.id }, title: '레이아웃 자동 구성', meta: { partIds: Object.keys((lp && lp.parts) || {}) } });
  return null;
}
/** 구성을 골라 목차가 놓였다 — 레이아웃 구성 버블을 Storyboard에서 뺀다(목차를 다 지우면 다시 나온다) */
export const layoutPlaced = (p) => !!(p.layoutPlan && p.layoutPlan.tpl) && storyParts(p).length > 0;

/**
 * 레이아웃 구성 버블 — 매칭 버블 다음, 목차 버블들 앞. 구성을 골라 목차가 놓이면 Storyboard에서 빠진다(layoutPlaced — storyboard.jsx).
 * onOpen(tplId?): 구성 모달(LayoutChooser) — tplId 가 있으면 그 구성의 상세(샘플), 없으면 전체 구성 · onMatch: 매칭 팝업 열기(생성 · 작성 전 확인의 '매칭 더 하기')
 */
export function LayoutNode({ p, isOpen, onOpen, onMatch, readOnly = false }) {
  useJobsState();
  const [tocReady, tocErr] = useTocReady();
  const ready = summaryDone(p);
  const busy = layoutBusy(p);
  const gen = useGeneration(p);
  const openAll = () => onOpen && onOpen();
  const sample = (id) => onOpen && onOpen(id);
  return (
    <div className={'layout-node' + (isOpen ? ' on' : '')}>
      <div className="node-top">
        <button className={'node' + (busy ? ' is-busy' : '')} onClick={openAll} aria-busy={busy || undefined} aria-haspopup="dialog" aria-expanded={isOpen}
          aria-label={'레이아웃 구성 · 전체 구성 보기' + (busy ? ' · 레이아웃을 구성하는 중' : '')} title={busy ? '레이아웃을 구성하는 중이에요' : '전체 구성 보기'}>
          <Icon name="layers" size={28} />
        </button>
      </div>
      <button className="node-name" onClick={openAll} aria-haspopup="dialog">레이아웃 구성</button>
      <div className="lyt-under">
        {!readOnly && <RecArea p={p} ready={ready} tocReady={tocReady} tocErr={tocErr} gen={gen} onSample={sample} onMatch={onMatch} />}
      </div>
    </div>
  );
}

/** 전체 구성 — 관리자가 켜 둔 구성 전부(2열) */
function AllTemplates({ p, short, vertical, onPick, onClose }) {
  const list = allTemplates();
  return (
    <Modal size="wide" bodyClass="mbody lyt-all-body" title="전체 구성 보기" sub={`제안서 구성 ${list.length}종`} onClose={onClose}
      footer={<><span className="sp" /><button className="btn" onClick={onClose}>닫기</button></>}>
      <div className="lyt-all" style={{ '--lyt-n': widest(p, short, [list]) }}>
        {list.map((t) => <TemplateCard key={t.id} p={p} t={t} short={short} vertical={vertical} onSample={onPick} />)}
      </div>
    </Modal>
  );
}

/** 제안서 작성하기 — 이 구성으로 진행할지 묻는다(사용자 지시 2026-11-16 — 매칭이 아니라 구성 확인). 고른 구성의 목차 흐름을 그대로 보여 주고,
 *  지금 Storyboard 목차가 있으면(자동 구성 중이면 멈춤) 바뀐다는 것만 알린다 */
function StartConfirm({ p, t, short, vertical, onCancel, onStart }) {
  const parts = storyParts(p); const nLay = parts.reduce((a, s) => a + (s.layouts || []).length, 0);
  const swap = parts.length > 0;
  const flow = shownFlow(t, p, short).map((x) => ({ ...x, label: x.name, name: breakable(x.name) }));
  return (
    <Modal size="narrow lyt-go-modal" title={`‘${t.name}’ 구성으로 진행할까요?`} onClose={onCancel}
      footer={<><span className="sp" /><button className="btn" onClick={onCancel}>취소</button><button className="btn btn-primary" data-autofocus onClick={onStart}><Icon name="edit" size={15} />제안서 작성하기</button></>}>
      <div className="lyt-ask">
        <div className={'lyt-card lyt-go-flow h-' + t.hue} style={{ '--lyt-n': flow.length }}>
          <CardFlow t={t} parts={flow} vertical={vertical} label={t.name + ' 목차 흐름 · 목차 ' + flow.length + '개'} />
        </div>
        {swap && <p className="lyt-ask-w"><Icon name="alert" size={13} />지금 Storyboard의 목차 {parts.length}개 · 레이아웃 {nLay}장은 새 구성으로 바뀌어요{layoutBusy(p) ? ' · 진행 중인 자동 구성은 멈춰요' : ''}.</p>}
      </div>
    </Modal>
  );
}

/**
 * 구성 모달 — 전체(all, 2열) · 상세(detail = 대표 시나리오 샘플). tpl: 카드의 '샘플 보기'로 연 구성(바로 상세 — DSS 로 파트를 뺀 구성일 수 있다), 없으면 전체 구성 보기부터.
 * 보기만 한다 — 시작은 버블 아래 목록에서 구성을 고르고 '제안서 작성하기'(사용자 지시 2026-11-16).
 */
export function LayoutChooser({ p, tpl = null, onClose }) {
  const [ready, loadErr] = useTocReady();
  const [all] = useState(!tpl);
  const [detail, setDetail] = useState(tpl && tplOf(tpl) ? tpl : null);
  useEffect(() => { if (loadErr) toast(loadErr, 'warn'); }, [loadErr]);
  useEffect(() => { if (!all && !detail) onClose(); }, [all, detail]);
  const vertical = ready ? chosenVertical(p) : null;
  const short = ready ? vShort(vertical) : null;
  const T = detail ? tplOf(detail) : null;
  return (
    <>
      {all && <AllTemplates p={p} short={short} vertical={vertical} onPick={setDetail} onClose={onClose} />}
      {T && <TocDetail key={T.id + ':' + (vertical || '')} t={T} ready={ready} onClose={() => setDetail(null)}
        pick={{ vertical, closeLabel: all ? '다른 구성 보기' : '닫기' }} />}
    </>
  );
}
