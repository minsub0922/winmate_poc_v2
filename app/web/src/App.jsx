import { LoginPrompt } from './components/LoginPrompt.jsx';
import {FeedbackPopup} from './components/feedback-popup.jsx';
import { requireLogin, sessionSnapshot, useSession, showLogin } from './api/session.js';
import React, { useEffect, useState } from 'react';
import { useStore, createProposal, update, getProposal, getProposals, loadUi, saveUi, loadImages } from './repositories/proposals.js';
import { loadLayoutHtml } from './services/catalog.js';
import { Sidebar } from './components/shell.jsx';
import Home from './pages/HomePage.jsx';
import { ProposalScreen } from './pages/ProposalPage.jsx';
import { LayoutLibrary } from './pages/LibraryPage.jsx';
import { MyTemplatesPage } from './pages/MyTemplatesPage.jsx';
import { FavoritesPage } from './pages/FavoritesPage.jsx';
import { ScenarioPage } from './pages/ScenariosPage.jsx';
import { Toasts, Icon } from './components/common.jsx';
import { ReviewScreen, ReviewHistory } from './pages/ReviewPage.jsx';
import { getReview } from './repositories/reviews.js';
import { SimPage } from './pages/SimulationPage.jsx';
import { getSim } from './repositories/simulations.js';
import { loadMy } from './repositories/templates.js';
import { historyId, historyPath, routePath, sharedIdentity, sharedToken, spatialId } from './services/shared-path.js';
import { SpatialPage } from './pages/SpatialPage.jsx';
import { connectShared, prepareHistorySharing } from './services/sharing.js';
import { SharedPage } from './pages/SharedPage.jsx';
import { HistoryPage } from './pages/HistoryPage.jsx';
import { startLayoutContextSync } from './services/layout-context.js';
import { registerSharedAssets } from './services/shared-assets.js';
import { startRequirementSummarySync } from './services/requirement-summary.js';
import { recordScreen } from './services/telemetry.js';

export default function App() {
  const { guest } = useSession();
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [sb, setSb] = useState(false);
  const [proposalStart, setProposalStart] = useState(0);
  const [route, setRoute] = useState(() => {
    const spatial = spatialId(); if (spatial) return spatial;
    const token = sharedToken(); if (token) return { name: 'shared', token };
    const id = historyId(); if (id) return { name: 'proposal', id };
    const u = loadUi();
    if (u.route?.name === 'library' && u.lib?.my && !u.myLibrary) return { name: u.lib.myTab === 'fav' ? 'favorites' : 'my' };
    if (u.route?.name === 'my' && u.myLibrary?.myTab === 'fav' && !u.favoritesLibrary) return { name: 'favorites' };
    if (u.route && u.route.name === 'review') return getReview(u.route.id) ? u.route : { name: 'reviews' };
    if (u.route && u.route.name === 'reviews') return u.route;
    if (u.route && u.route.name === 'spatial') return u.route;
    if (u.route && u.route.name === 'sim') return u.route.id && !getSim(u.route.id) ? { name: 'sim' } : u.route;
    return u.route && ((u.route.name === 'proposal' && getProposal(u.route.id)) || u.route.name === 'library' || u.route.name === 'my' || u.route.name === 'favorites' || u.route.name === 'scenarios') ? u.route : { name: 'home' };
  });
  useEffect(() => {
    Promise.all([loadLayoutHtml(), loadImages(), loadMy()]).then(() => {
      for (const proposal of sessionSnapshot().guest ? [] : getProposals()) {
        registerSharedAssets(proposal);
        const identity = sharedIdentity(proposal);
        if (identity) connectShared(identity.id, { id: proposal.id });
      }
      setReady(true);
      if (!sessionSnapshot().guest) void prepareHistorySharing(getProposals());
    }).catch((e) => setErr(String(e && e.message ? e.message : e)));
  }, []);
  useEffect(() => { if (ready && !guest) return startLayoutContextSync(); }, [ready, guest]);
  useEffect(() => { if (ready && !guest) return startRequirementSummarySync(); }, [ready, guest]);
  const go = (r) => { window.history.pushState({ winmateRoute: r }, '', routePath(r)); setRoute(r); setSb(false); saveUi({ ...loadUi(), route: r }); const m = document.querySelector('.main'); if (m) m.scrollTop = 0; };
  useEffect(() => {
    // Keep browser Back/Forward aligned with the separate sidebar pages.
    window.history.replaceState({ ...window.history.state, winmateRoute: route }, '', window.location.href);
    saveUi({ ...loadUi(), route });
    const pop = e => {
      const token = sharedToken();
      const id = historyId();
      const next = spatialId() || (token ? { name: 'shared', token } : id ? { name: 'proposal', id } : e.state?.winmateRoute || { name: 'home' });
      setRoute(next); setSb(false); saveUi({ ...loadUi(), route: next });
    };
    window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(()=>recordScreen(route),[route.name,route.id,route.token]);
  const onNew = (mode = 'free') => {
    if (!requireLogin()) return;
    const id = createProposal();
    update(id, (d) => { d.reqTab = mode; }, { touch: false });
    setProposalStart(n => n + 1);
    go({ name: 'proposal', id });
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
        {err ? <FeedbackPopup title="레이아웃을 불러오지 못했어요" message={err} actionLabel="다시 불러오기" onAction={()=>window.location.reload()}/>
          : !ready ? null
            : route.name === 'shared' ? <SharedPage key={route.token} token={route.token} go={go} />
              : route.name === 'proposal' && p ? <ProposalScreen key={p.id + ':' + proposalStart} p={p} go={go} />
              : route.name === 'proposal' ? <HistoryPage key={route.id} id={route.id} go={go} />
              : route.name === 'library' ? <LayoutLibrary key="library" go={go} />
              : route.name === 'my' ? <MyTemplatesPage key="my" go={go} saved={route.saved} />
              : route.name === 'favorites' ? <FavoritesPage key="favorites" go={go} />
              : route.name === 'scenarios' ? <ScenarioPage go={go} />
              : route.name === 'spatial' ? <SpatialPage id={route.id} go={go} />
              : route.name === 'review' ? <ReviewScreen key={route.id} id={route.id} go={go} />
              : route.name === 'reviews' ? <ReviewHistory go={go} />
              : route.name === 'sim' ? <SimPage go={go} id={route.id} />
              : <Home go={go} onNew={onNew} />}
      </main>
      <LoginPrompt home={route.name === 'home'} />
      <Toasts />
    </div>
  );
}

