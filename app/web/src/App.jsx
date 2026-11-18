import { LoginPrompt } from './components/LoginPrompt.jsx';
import {FeedbackPopup} from './components/feedback-popup.jsx';
import { requireLogin, sessionSnapshot, useSession, showLogin } from './api/session.js';
import React, { useEffect, useState, lazy, Suspense } from 'react';
import { useStore, createProposal, update, getProposal, getProposals, loadUi, saveUi, loadImages } from './repositories/proposals.js';
import { accountSyncReady, accountSyncSettled } from './repositories/account-sync.js';
import { loadLayoutHtml } from './services/catalog.js';
import { Sidebar } from './components/shell.jsx';
import Home from './pages/HomePage.jsx';
import { Toasts, Icon } from './components/common.jsx';
import { getReview } from './repositories/reviews.js';
import { getSim } from './repositories/simulations.js';
import { loadMy } from './repositories/templates.js';
import { historyId, historyPath, routePath, sharedIdentity, sharedToken, spatialId } from './services/shared-path.js';
import { connectShared, prepareHistorySharing } from './services/sharing.js';
import { startLayoutContextSync } from './services/layout-context.js';
import { startLayoutBriefSync } from './services/layout-brief.js';
import { registerSharedAssets } from './services/shared-assets.js';
import { recordScreen } from './services/telemetry.js';
import { inspecting, inspectRoute } from './api/inspect.js';
import { InspectBar } from './components/inspect-bar.jsx';

const ProposalScreen = lazy(() => import('./pages/ProposalPage.jsx').then(m => ({ default: m.ProposalScreen })));
const LibraryHub = lazy(() => import('./pages/LibraryHub.jsx').then(m => ({ default: m.LibraryHub })));
const MyTemplatesPage = lazy(() => import('./pages/MyTemplatesPage.jsx').then(m => ({ default: m.MyTemplatesPage })));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage.jsx').then(m => ({ default: m.FavoritesPage })));
const TocTemplatesPage = lazy(() => import('./pages/TocTemplatesPage.jsx').then(m => ({ default: m.TocTemplatesPage })));
const ReviewScreen = lazy(() => import('./pages/ReviewPage.jsx').then(m => ({ default: m.ReviewScreen })));
const ReviewHistory = lazy(() => import('./pages/ReviewPage.jsx').then(m => ({ default: m.ReviewHistory })));
const SimPage = lazy(() => import('./pages/SimulationPage.jsx').then(m => ({ default: m.SimPage })));
const SpatialPage = lazy(() => import('./pages/SpatialPage.jsx').then(m => ({ default: m.SpatialPage })));
const BuildingPage = lazy(() => import('./pages/BuildingPage.jsx').then(m => ({ default: m.BuildingPage })));
const SharedPage = lazy(() => import('./pages/SharedPage.jsx').then(m => ({ default: m.SharedPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage.jsx').then(m => ({ default: m.HistoryPage })));

export default function App() {
  const { guest } = useSession();
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [sb, setSb] = useState(false);
  const [route, setRoute] = useState(() => {
    const inspected = inspectRoute(); if (inspected) return inspected; // 관리자 열람: 관리자가 고른 기록 (api/inspect.js)
    const spatial = spatialId(); if (spatial) return spatial;
    const token = sharedToken(); if (token) return { name: 'shared', token };
    const id = historyId(); if (id) return { name: 'proposal', id };
    if (new URLSearchParams(window.location.search).has('toc')) return { name: 'toc', link: true }; // /?toc=<구성> — 목차 템플릿의 그 구성을 바로 연다(TocTemplatesPage)
    const u = loadUi();
    if (u.route?.name === 'library' && u.lib?.my && !u.myLibrary) return { name: u.lib.myTab === 'fav' ? 'favorites' : 'my' };
    if (u.route?.name === 'my' && u.myLibrary?.myTab === 'fav' && !u.favoritesLibrary) return { name: 'favorites' };
    if (u.route && u.route.name === 'building') return u.route;
    if (u.route && u.route.name === 'review') return getReview(u.route.id) ? u.route : { name: 'reviews' };
    if (u.route && u.route.name === 'reviews') return u.route;
    if (u.route && u.route.name === 'spatial') return u.route;
    if (u.route && u.route.name === 'sim') return u.route.id && !getSim(u.route.id) ? { name: 'sim' } : u.route;
    return u.route && ((u.route.name === 'proposal' && getProposal(u.route.id)) || u.route.name === 'library' || u.route.name === 'my' || u.route.name === 'favorites' || u.route.name === 'scenarios' || u.route.name === 'toc') ? u.route : { name: 'home' };
  });
  useEffect(() => {
    Promise.all([loadLayoutHtml(), loadImages(), loadMy()]).then(() => {
      for (const proposal of sessionSnapshot().guest ? [] : getProposals()) {
        registerSharedAssets(proposal);
        const identity = sharedIdentity(proposal);
        if (identity) connectShared(identity.id, { id: proposal.id });
      }
      setReady(true);
      if (!sessionSnapshot().guest && !inspecting()) void prepareHistorySharing(getProposals());
    }).catch((e) => setErr(String(e && e.message ? e.message : e)));
  }, []);
  // 관리자 열람 탭은 읽기 전용 — 기록을 고치는 배경 작업(맥락 · 방향 추론)은 돌리지 않는다
  useEffect(() => { if (ready && !guest && !inspecting()) return startLayoutContextSync(); }, [ready, guest]);
  useEffect(() => { if (ready && !guest && !inspecting()) return startLayoutBriefSync(); }, [ready, guest]); // 직접 넣은 장의 방향 추론 (layout-brief.js)
  const go = (r, { replace = false } = {}) => {
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method]({ winmateRoute: r }, '', routePath(r));
    setRoute(r); setSb(false); saveUi({ ...loadUi(), route: r });
    const main = document.querySelector('.main');
    if (main) main.scrollTop = 0;
  };
  useEffect(() => {
    // Keep browser Back/Forward aligned with the separate sidebar pages.
    window.history.replaceState({ ...window.history.state, winmateRoute: route }, '', window.location.href);
    if (!route.link) saveUi({ ...loadUi(), route }); // 주소로 바로 연 화면은 '마지막에 보던 화면'으로 남기지 않는다
    const pop = e => {
      const token = sharedToken();
      const id = historyId();
      const next = spatialId() || (token ? { name: 'shared', token } : id ? { name: 'proposal', id } : e.state?.winmateRoute || { name: 'home' });
      setRoute(next); setSb(false); saveUi({ ...loadUi(), route: next });
    };
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(()=>recordScreen(route),[route.name,route.id,route.token]);
  const onNew = async (mode = 'free') => {
    if (!requireLogin()) return;
    if (!accountSyncSettled()) await accountSyncReady();
    const id = createProposal();
    if (!id) return;
    update(id, (d) => { d.reqTab = mode; }, { touch: false });
    const previous = historyId();
    go({ name: 'proposal', id }, { replace: !!previous && !getProposal(previous) });
  };
  const p = useStore((s) => (route.name === 'proposal' ? getProposal(route.id) || null : null));
  const endpoint = route.name === 'proposal' && route.id ? historyPath(route.id) : route.name === 'spatial' ? routePath(route) : null;
  useEffect(() => {
    if (endpoint) window.history.replaceState({ winmateRoute: route }, '', endpoint);
  }, [route.name, endpoint]);
  return (
    <div className="app" data-app-ready={ready} onClickCapture={e => {
      if (e.target.closest('[data-login-required]') && !requireLogin()) { e.preventDefault(); e.stopPropagation(); }
    }}>
      <Sidebar route={route} go={go} onNew={() => onNew('free')} open={sb} setOpen={setSb} />
      {sb && <div className="sb-scrim" onClick={() => setSb(false)} />}
      <main className="main">
        <div className="mob-top">
          <button className="btn btn-ghost btn-icon" onClick={() => setSb(true)} aria-label="메뉴 열기"><Icon name="menu" size={18} /></button>
          <span className="sb-word" style={{ fontSize: 17 }}>winmate</span><span className="sb-ver">v2</span>{guest && <button className="btn btn-sm mobile-profile" onClick={showLogin} aria-label="유저 프로필">로그인</button>}
        </div>
        <Suspense fallback={null}>{err ? <FeedbackPopup title="레이아웃을 불러오지 못했어요" message={err} actionLabel="다시 불러오기" onAction={()=>window.location.reload()}/>
          : !ready ? null
            : route.name === 'shared' ? <SharedPage key={route.token} token={route.token} go={go} />
              : route.name === 'proposal' && p ? <ProposalScreen key={p.id} p={p} go={go} />
              : route.name === 'proposal' ? <HistoryPage key={route.id} id={route.id} go={go} />
              : route.name === 'library' || route.name === 'scenarios' ? <LibraryHub key="library" route={route} go={go} />
              : route.name === 'my' ? <MyTemplatesPage key="my" go={go} saved={route.saved} />
              : route.name === 'favorites' ? <FavoritesPage key="favorites" go={go} />
              : route.name === 'toc' ? <TocTemplatesPage go={go} />
              : route.name === 'spatial' ? <SpatialPage id={route.id} go={go} />
              : route.name === 'review' ? <ReviewScreen key={route.id} id={route.id} go={go} />
              : route.name === 'reviews' ? <ReviewHistory go={go} />
              : route.name === 'building' ? <BuildingPage go={go} id={route.id} />
              : route.name === 'sim' ? <SimPage go={go} id={route.id} />
              : <Home go={go} onNew={onNew} />}</Suspense>
      </main>
      <LoginPrompt home={route.name === 'home'} />
      <InspectBar />
      <Toasts />
    </div>
  );
}

