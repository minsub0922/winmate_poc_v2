import React, { useState } from 'react';
import { useStore, stageOf } from '../repositories/proposals.js';
import { Icon, fmtWhen, partHue } from './common.jsx';
import { IND, LAYOUTS, CASES, PRODUCTS, SOLUTIONS, storyParts } from '../services/catalog.js';
import { Slide, FitSlide } from '../domain/slides/Slide.jsx';
import { classifyPart } from '../domain/proposals/parts.js';
import { KIND } from './refcard.jsx';
import { partIcon } from './parteditor.jsx';
import { TemplateIcon } from '../pages/LibraryPage.jsx';
import { SCENARIOS, SC, FEATURED } from '../domain/templates/scenarios.js';
import { scenarioStoryboard } from '../domain/templates/scenario_storyboard.js';
import { ScenarioStoryboard } from '../pages/ScenariosPage.jsx';
import { ReviewEntry } from '../pages/ReviewPage.jsx';
import { useReviews } from '../repositories/reviews.js';
import { useMy } from '../repositories/templates.js';
import { useFavs, liveFavs } from '../repositories/favorites.js';
import { reqText, inferIndustry } from '../services/search.js';
import { SimIcon } from '../pages/SimulationPage.jsx';
import { useHomeEntry } from '../hooks/useHomeEntry.js';
import { useCatalogMetrics } from '../hooks/useCatalogMetrics.js';
import { ProfileButton } from './ProfileButton.jsx';
import { GuideButton } from './guides/GuideButton.jsx';
import { SidebarHistory } from './sidebar-history.jsx';
import { CustomerVoiceButton } from './customer-voice.jsx';

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
  const mine = useMy();
  const favourites = liveFavs(useFavs());
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
      <button className="sb-home sb-bld" aria-label="건물 조감도" aria-current={route.name === 'building' ? 'page' : undefined} onClick={() => go({ name: 'building' })}><Icon name="building" />{tx('건물 조감도')}<span className="sb-bld-format sb-tx">3D</span><span className="sb-beta sb-tx">BETA</span></button>
      <button className="sb-home sb-spatial" aria-label="공간 조감도" aria-current={route.name === 'spatial' ? 'page' : undefined} onClick={() => go({ name: 'spatial' })}><Icon name="building" />{tx('공간 조감도')}<span className="sb-spatial-format sb-tx">2D · 3D</span><span className="sb-beta sb-tx">BETA</span></button>
      <button className="sb-home sb-rv" aria-current={route.name === 'reviews' || route.name === 'review' ? 'page' : undefined} onClick={() => go({ name: 'reviews' })}><Icon name="clipCheck" />{tx('제안서 검토')}<span className="sb-count num sb-tx">{nRev}</span></button>
      <button className="sb-home sb-sim" aria-current={route.name === 'sim' ? 'page' : undefined} onClick={() => go({ name: 'sim' })}><SimIcon name="chat" />{tx('B2B 전략 시뮬레이션')}<span className="sb-beta sb-tx">BETA</span></button>
      <div className="sb-div" aria-hidden="true" />
      <div className={'sb-hist' + (route.name === 'proposal' ? ' is-on' : '')}><Icon name="history" />{tx('제안서 히스토리')}<span className="sb-count num sb-tx">{list.length}</span></div>
      <SidebarHistory list={list} route={route} go={go} Flow={StepDots} />
      <nav className="sb-personal" aria-label="개인 자료">
        <button type="button" className="sb-personal-button sb-my" aria-label="My 템플릿" aria-current={route.name === 'my' ? 'page' : undefined} onClick={() => go({ name: 'my' })}>
          <Icon name="user" size={16} /><span className="sb-personal-label">My 템플릿</span><span className="sb-count num sb-personal-count">{mine.length}</span>
        </button>
        <button type="button" className="sb-personal-button sb-fav" aria-label="찜" aria-current={route.name === 'favorites' ? 'page' : undefined} onClick={() => go({ name: 'favorites' })}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.4A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.7c0 5.8-7.5 10.4-7.5 10.4z" fill={route.name === 'favorites' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          <span className="sb-personal-label">찜</span><span className="sb-count num sb-personal-count">{favourites.length}</span>
        </button>
      </nav>
      <GuideButton route={route} onOpen={() => setOpen(false)} />
      <CustomerVoiceButton route={route} />
      <ProfileButton />
    </aside>
  );
}

function firstLayout(p) { for (const s of p.parts) if (s.layouts.length) return s.layouts[0]; return null; }

// Cover all requirement types and strategies across a range of industries.
const HOME_SCENARIOS = [...new Set([...FEATURED,'bs21','bs22','bs01','bs03','bs06','bs08','bs11','bs12','bs13','bs14','bs17','bs19'])].slice(0,12).map(id=>SC[id]).filter(Boolean);

const HOME_METRICS = [
  { icon: 'panel', label: '준비된 PPT layout', key: 'layouts' },
  { icon: 'building', label: '업종 커스터마이즈', key: 'industry_layouts' },
  { icon: 'product', label: '삼성 비즈니스 제품', key: 'products' },
  { icon: 'solution', label: '비즈니스 솔루션 서비스', key: 'solutions' },
  { icon: 'book', label: '업종별 도입사례', key: 'cases' },
];
const INITIAL_METRICS = { layouts: LAYOUTS.length, industry_layouts: LAYOUTS.filter(l => l.ind).length, products: PRODUCTS.length, solutions: SOLUTIONS.length, cases: CASES.length };

const HOME_METRIC_ICONS = {
  panel: <><rect x="2.5" y="3.5" width="19" height="14" rx="2" /><path d="M6 7h4v7H6zM13 7h5M13 10.5h5M13 14h3M12 17.5v3M8.5 20.5h7" /></>,
  building: <><path d="M3 21h18M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M8 8h4M8 12h4M9 21v-5h3v5M18 14v1M18 18v1" /><path d="m19 2 .7 1.8 1.8.7-1.8.7L19 7l-.7-1.8-1.8-.7 1.8-.7Z" fill="currentColor" stroke="none" /></>,
  product: <><path d="M14 17.5H4a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 4 3.5h14A1.5 1.5 0 0 1 19.5 5v3M9 17.5v3M6 20.5h6M6 7h7M6 10h4" /><rect x="15" y="9" width="6.5" height="12" rx="1.5" /><path d="M17.5 18.5h1.5" /></>,
  solution: <><path d="M12 8v3.5M5.5 15v-2a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5v2" /><rect x="8.5" y="2" width="7" height="6" rx="1.5" /><rect x="2" y="15" width="7" height="6" rx="1.5" /><rect x="15" y="15" width="7" height="6" rx="1.5" /><path d="m10.5 5 1 1 2-2M4 18h3M17 18h3" /></>,
  book: <><path d="M8 6V4a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 16 4v2" /><rect x="2.5" y="6" width="19" height="15" rx="2" /><path d="M6.5 17v-3M10.5 17v-5M14.5 17v-2M6.5 10.5l4-2 4 2L18 9M17 7.5 18 9l-1 1.5" /></>,
};

function MetricIcon({ name }) {
  return (
    <svg className="home-metric-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {HOME_METRIC_ICONS[name]}
    </svg>
  );
}

function MetricLaurel({ side }) {
  return (
    <svg className={'home-metric-laurel ' + side} width="22" height="58" viewBox="0 0 24 64" fill="currentColor" aria-hidden="true">
      <path d="M21 61C5 52 2 29 18 5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M17 10C13 9 13 5 17 1c2 4 2 6 0 9ZM13 17C8 16 8 11 11 7c3 4 4 7 2 10ZM9 25C4 23 3 19 5 14c4 3 6 7 4 11ZM7 34C2 32 0 28 1 23c5 3 7 6 6 11ZM8 43C2 42 0 38 0 33c5 2 8 5 8 10ZM12 52C6 53 3 49 2 44c5 1 9 3 10 8ZM18 59C13 62 9 59 6 55c5-1 9 0 12 4Z" />
      <path d="M14 16c0-5 4-7 8-7-1 5-4 8-8 7ZM10 24c0-5 4-7 8-8-1 5-4 8-8 8ZM8 33c1-5 4-7 9-7-2 5-5 7-9 7ZM9 42c1-5 4-7 8-7-2 5-4 7-8 7ZM12 50c0-5 3-8 7-9 0 5-3 8-7 9ZM18 58c-2-4 0-8 4-11 1 5 0 9-4 11Z" />
    </svg>
  );
}

export function Home({ go, onNew }) {
  const [homeRef, entryReady] = useHomeEntry();
  const counts = useCatalogMetrics(INITIAL_METRICS);
  const list = useStore((s) => s.proposals);
  const [scenario, setScenario] = useState(null);
  return (
    <div className="home" ref={homeRef} data-home-ready={entryReady} aria-busy={!entryReady}>
      <div className="home-in">
        <div className="home-intro">
          <ul className="home-metrics" aria-label="제안서에 활용할 수 있는 자료">
            {HOME_METRICS.map(({ icon, label, key }) => (
              <li className="home-metric" key={icon}>
                <MetricLaurel side="left" />
                <div className="home-metric-body">
                  <MetricIcon name={icon} />
                  <span className="home-metric-label">{label}</span>
                  <span className="home-metric-count">{counts[key].toLocaleString('ko-KR')}</span>
                </div>
                <MetricLaurel side="right" />
              </li>
            ))}
          </ul>
          <header className="home-hero">
            <h1>고객 요구사항에서 <em>PPT 장표까지</em>, 한 흐름으로</h1>
            <p>AI가 <strong>제안 전략을 함께 세우고</strong>, 그 전략에 맞는 <strong>장표 레이아웃을 자동으로 구성</strong>해요. 기획은 더 깊게, 장표 작업은 더 빠르게.</p>
          </header>
        </div>
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
          const card = (p, scenario) => {
              let ind = p.ind || inferIndustry(reqText(p));
              if (ind && !IND[ind]) ind = null;
              const cover = cardCover(p, ind);
              return (
                <button key={p.id} className="hcard" onClick={() => scenario ? setScenario(scenario) : go({ name: 'proposal', id: p.id })}>
                  <div className="hcard-thumb"><FitSlide f={cover.f} ov={cover.ov} lazy /></div>
                  <div className="hcard-body">
                    <div className="stepbar"><StepDots p={p} /></div>
                    <span className="t">{p.title}</span>
                    <div className="hcard-meta"><span className="c">{(p.customer || '고객사 미정') + (ind ? ' · ' + IND[ind].name : '')}</span>{scenario ? <span className="hbest">BEST</span> : <span className="hwhen num">{fmtWhen(p.updatedAt)}</span>}</div>
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
            <section aria-label="Best Scenario">
              <div className="sec-head"><h2 style={{ flexShrink: 0 }}>Best Scenario</h2><span className="faint" style={{ fontSize: "var(--text-12-5px)" }}>대표 시나리오 {HOME_SCENARIOS.length}개 · 클릭해 구성을 살펴보세요</span></div>
              <div className="hgrid">{HOME_SCENARIOS.map((s) => card(scenarioStoryboard(s.id), s))}</div>
            </section>
          );
        })()}
      </div>
      {scenario && <ScenarioStoryboard key={scenario.id} s={scenario} go={go} onClose={() => setScenario(null)} />}
    </div>
  );
}
