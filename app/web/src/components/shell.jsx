import React from 'react';
import { useStore, proposalStep, stageOf } from '../repositories/proposals.js';
import { Icon, fmtWhen, partHue } from './common.jsx';
import { IND, LAYOUTS, CASES, PRODUCTS, SOLUTIONS, storyParts } from '../services/catalog.js';
import { Slide, FitSlide } from '../domain/slides/Slide.jsx';
import { PARTS, classifyPart } from '../domain/proposals/parts.js';
import { KIND } from './refcard.jsx';
import { partIcon } from './parteditor.jsx';
import { TemplateIcon } from '../pages/LibraryPage.jsx';
import { SCENARIOS } from '../domain/templates/scenarios.js';
import { ReviewEntry } from '../pages/ReviewPage.jsx';
import { useReviews } from '../repositories/reviews.js';
import { reqText, inferIndustry } from '../services/search.js';
import { SimIcon } from '../pages/SimulationPage.jsx';

export function StepDots({ p }) {
  const nodes = [{ c: 'n-req', i: 'clip', n: '고객 요구사항' }];
  if (stageOf(p) !== 'req') {
    const low = KIND.some(([k, , , min]) => p.ctx[k].length < min);
    nodes.push({ c: 'n-match' + (low ? ' is-low' : ''), i: 'link', n: '제품 · 솔루션 매칭' });
    for (const s of storyParts(p)) { const t = s.type || classifyPart(s.name); nodes.push({ c: 'n-part ' + partHue(t) + (s.done ? ' is-done' : ' is-draft'), i: partIcon(s), n: s.name || '이름 없는 파트' }); }
  }
  const label = nodes.map((x) => x.n).join(' → ');
  return (
    <span className="sb-flow" role="img" aria-label={label} title={label}>
      {nodes.flatMap((x, i) => [i > 0 && <i key={'l' + i} className="sb-flow-ln" />, <span key={'n' + i} className={'sb-node ' + x.c}><Icon name={x.i} size={11} stroke={2.2} /></span>])}
    </span>
  );
}

/** Home card thumbnail = the proposal's cover sheet, always with a picture:
 *  · photo cover (C01 split · C02 full-bleed) whose photo is still empty → the industry's default cover photo (img/cover/<업종>.jpg)
 *  · typography cover (C03, no picture area) → the industry default cover (covers.js) carrying that sheet's headline · subtitle
 *  · no cover sheet yet → the industry default cover with the proposal title. C08 · C09 come with their own sample pictures. */
const COVER_PHOTO_SLOT = { L_C01: 't0', L_C02: 't0' };
const coverPhoto = (ind) => 'img/cover/' + (ind || 'GEN') + '.jpg';
function cardCover(p, ind) {
  let own = null;
  for (const s of p.parts) { for (const x of s.layouts) if (/^L_C0[12389]$/.test(x.f)) { own = x; break; } if (own) break; }
  const ov = (own && own.ov) || { t: {}, img: {} };
  const slot = own && COVER_PHOTO_SLOT[own.f];
  if (slot) {
    if ((ov.img || {})[slot]) return own;
    return { f: own.f, ov: { t: ov.t || {}, img: { ...(ov.img || {}), [slot]: { src: coverPhoto(ind), fit: 'cover', name: ind ? IND[ind].name : '' } } } };
  }
  if (own && own.f !== 'L_C03') return own;
  const d = new Date(p.createdAt || Date.now());
  const t = { 2: p.title || '새 제안서', 4: p.customer || '고객사 미정', 5: d.getFullYear() + '. ' + String(d.getMonth() + 1).padStart(2, '0') };
  if (own) { const tt = ov.t || {}; if (tt[1]) t[2] = tt[1]; if (tt[2]) t[3] = tt[2]; }
  return { f: 'L_IND_' + (ind || '_'), ov: { t, img: {} } };
}

export function Sidebar({ route, go, onNew, open, setOpen }) {
  const list = useStore((s) => s.proposals);
  const nRev = useReviews((s) => s.reviews.length);
  const tx = (x) => <span className="sb-tx">{x}</span>; // labels fade in when the collapsed icon rail widens on hover
  return (
    <aside className={'sidebar' + (open ? ' open' : '')} aria-label="사이드바">
      <button className="sb-brand" onClick={() => go({ name: 'home' })}>
        <span className="sb-logo">W</span><span className="sb-word">winmate</span><span className="sb-ver">v2</span>
      </button>
      <button className="sb-new" onClick={onNew}><Icon name="plus" size={16} stroke={2.4} />{tx('새 제안서 시작')}</button>
      <button className="sb-home" aria-current={route.name === 'home' ? 'page' : undefined} onClick={() => go({ name: 'home' })}><Icon name="home" />{tx('홈')}</button>
      <button className="sb-home sb-tpl" aria-current={route.name === 'library' ? 'page' : undefined} onClick={() => go({ name: 'library' })}><TemplateIcon />{tx('PPT 레이아웃 템플릿')}<span className="sb-count num sb-tx">{LAYOUTS.length}</span></button>
      <button className="sb-home sb-bs" aria-current={route.name === 'scenarios' ? 'page' : undefined} onClick={() => go({ name: 'scenarios' })}><Icon name="route" />{tx('Best Scenario')}<span className="sb-count num sb-tx">{SCENARIOS.length}</span></button>
      <button className="sb-home sb-rv" aria-current={route.name === 'reviews' || route.name === 'review' ? 'page' : undefined} onClick={() => go({ name: 'reviews' })}><Icon name="clipCheck" />{tx('제안서 검토')}<span className="sb-count num sb-tx">{nRev}</span></button>
      <button className="sb-home sb-sim" aria-current={route.name === 'sim' ? 'page' : undefined} onClick={() => go({ name: 'sim' })}><SimIcon name="chat" />{tx('B2B 전략 시뮬레이션')}<span className="sb-beta sb-tx">BETA</span></button>
      <div className="sb-div" aria-hidden="true" />
      <div className={'sb-hist' + (route.name === 'proposal' ? ' is-on' : '')}><Icon name="history" />{tx('제안서 히스토리')}<span className="sb-count num sb-tx">{list.length}</span></div>
      <nav className="sb-list" aria-label="제안서 히스토리">
        {list.map((p) => {
          const st = proposalStep(p);
          return (
            <button key={p.id} className="sb-item" aria-current={route.id === p.id ? 'page' : undefined} onClick={() => go({ name: 'proposal', id: p.id })}>
              <span className="t">{p.title || '새 제안서'}</span>
              <span className="when">{fmtWhen(p.updatedAt)}</span>
              <span className="s"><StepDots p={p} />{p.customer && <span className="sb-cust">{p.customer}</span>}</span>
            </button>
          );
        })}
      </nav>
      <div className="sb-foot">
        <span className="avatar">최</span>
        <span className="sb-tx sb-me" style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: "var(--text-13px)", fontWeight: "var(--weight-600)" }}>최민섭</div><div style={{ fontSize: "var(--text-11-5px)", color: 'var(--muted)' }}>Samsung Research · AX그룹</div></span>
      </div>
    </aside>
  );
}

function firstLayout(p) { for (const s of p.parts) if (s.layouts.length) return s.layouts[0]; return null; }

export function Home({ go, onNew }) {
  const list = useStore((s) => s.proposals);
  return (
    <div className="home">
      <div className="home-in">
        <header className="home-hero">
          <h1>고객 요구사항에서 <em>PPT 장표까지</em>, 한 흐름으로</h1>
          <p>AI가 <strong>제안 전략을 함께 세우고</strong>, 그 전략에 맞는 <strong>장표 레이아웃을 자동으로 구성</strong>해요. 기획은 더 깊게, 장표 작업은 더 빠르게.</p>
        </header>
        <div className="home-actions">
          <button className="start" onClick={() => onNew('free')}>
            <span className="start-ic"><Icon name="plus" size={26} stroke={2.4} /></span>
            <span className="start-t">
              <b>새 제안서 시작</b>
              <span className="start-d"><span className="start-agent"><Icon name="sparkle" size={15} stroke={2.2} />Winmate Agent</span>로 <b>요구사항 분석</b><span className="start-arw"><Icon name="arrowR" size={13} stroke={2.6} /></span><b>전략 수립</b><span className="start-arw"><Icon name="arrowR" size={13} stroke={2.6} /></span><b>PPT 설계</b>까지 한 번에 진행할 수 있어요</span>
            </span>
            <span className="start-go" aria-hidden="true"><Icon name="arrowR" size={22} stroke={2.4} /></span>
          </button>
          <ReviewEntry go={go} />
        </div>
        {(() => {
          const card = (p) => {
              let ind = p.ind || inferIndustry(reqText(p));
              if (ind && !IND[ind]) ind = null;
              const cover = cardCover(p, ind);
              return (
                <button key={p.id} className="hcard" onClick={() => go({ name: 'proposal', id: p.id })}>
                  <div className="hcard-thumb"><FitSlide f={cover.f} ov={cover.ov} lazy /></div>
                  <div className="hcard-body">
                    <div className="stepbar"><StepDots p={p} /></div>
                    <span className="t">{p.title}</span>
                    <div className="hcard-meta"><span className="c">{(p.customer || '고객사 미정') + (ind ? ' · ' + IND[ind].name : '')}</span><span className="hwhen num">{fmtWhen(p.updatedAt)}</span></div>
                  </div>
                </button>
              );
          };
          return list.length ? (
            <section aria-label="작성 중인 제안서">
              <div className="sec-head"><h2>작성 중인 제안서</h2><span className="faint num" style={{ fontSize: "var(--text-12-5px)" }}>{list.length}건</span></div>
              <div className="hgrid">{list.map((p) => card(p))}</div>
            </section>
          ) : (
            <section aria-label="작성 중인 제안서">
              <div className="sec-head"><h2>작성 중인 제안서</h2><span className="faint" style={{ fontSize: "var(--text-12-5px)" }}>아직 제안서가 없어요 · 고객 요구사항부터 시작해 보세요</span></div>
              <button type="button" className="btn btn-soft btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onNew('free')}><Icon name="plus" size={14} stroke={2.4} />고객 요구사항으로 새 제안서 시작</button>
            </section>
          );
        })()}
        <section aria-label="연결된 자산">
          <div className="sec-head"><h2>Winmate가 쓰는 자산</h2></div>
          <div className="lib-strip">
            <div className="lib-tile"><b>{LAYOUTS.length}</b><span className="muted" style={{ fontSize: "var(--text-12-5px)" }}>PPT 레이아웃 · 파트 유형 {Object.values(PARTS).filter((v) => !v.free).length}종 + 자유 주제</span></div>
            <div className="lib-tile"><b>{LAYOUTS.filter((l) => l.ind).length}</b><span className="muted" style={{ fontSize: "var(--text-12-5px)" }}>업종 맞춤 레이아웃 · 16개 업종</span></div>
            <div className="lib-tile"><b>{PRODUCTS.length}</b><span className="muted" style={{ fontSize: "var(--text-12-5px)" }}>제품 (@ 호출)</span></div>
            <div className="lib-tile"><b>{SOLUTIONS.length}</b><span className="muted" style={{ fontSize: "var(--text-12-5px)" }}>솔루션 · 서비스</span></div>
            <div className="lib-tile"><b>{CASES.length}</b><span className="muted" style={{ fontSize: "var(--text-12-5px)" }}>도입사례 (samsung.com/business)</span></div>
          </div>
        </section>
      </div>
    </div>
  );
}
