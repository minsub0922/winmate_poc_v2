import React, { useEffect, useState } from 'react';
import { useStore, createProposal, update, getProposal, loadUi, saveUi, loadImages } from './repositories/proposals.js';
import { loadLayoutHtml, LAYOUTS } from './services/catalog.js';
import { Sidebar } from './components/shell.jsx';
import Home from './pages/HomePage.jsx';
import { ProposalScreen } from './pages/ProposalPage.jsx';
import { LayoutLibrary } from './pages/LibraryPage.jsx';
import { ScenarioPage } from './pages/ScenariosPage.jsx';
import { Toasts, Icon } from './components/common.jsx';
import { ReviewScreen, ReviewHistory } from './pages/ReviewPage.jsx';
import { getReview } from './repositories/reviews.js';
import { SimPage } from './pages/SimulationPage.jsx';
import { getSim } from './repositories/simulations.js';
import { loadMy } from './repositories/templates.js';

export default function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [sb, setSb] = useState(false);
  const [route, setRoute] = useState(() => {
    const u = loadUi();
    if (u.route && u.route.name === 'review') return getReview(u.route.id) ? u.route : { name: 'reviews' };
    if (u.route && u.route.name === 'reviews') return u.route;
    if (u.route && u.route.name === 'sim') return u.route.id && !getSim(u.route.id) ? { name: 'sim' } : u.route;
    return u.route && ((u.route.name === 'proposal' && getProposal(u.route.id)) || u.route.name === 'library' || u.route.name === 'scenarios') ? u.route : { name: 'home' };
  });
  useEffect(() => {
    Promise.all([loadLayoutHtml(), loadImages(), loadMy()]).then(() => setReady(true)).catch((e) => setErr(String(e && e.message ? e.message : e)));
  }, []);
  const go = (r) => { setRoute(r); setSb(false); saveUi({ ...loadUi(), route: r }); const m = document.querySelector('.main'); if (m) m.scrollTop = 0; };
  const onNew = (mode = 'free') => {
    const id = createProposal();
    update(id, (d) => { d.reqTab = mode; }, { touch: false });
    go({ name: 'proposal', id });
  };
  const p = useStore((s) => (route.name === 'proposal' ? s.proposals.find((x) => x.id === route.id) || null : null));
  useEffect(() => { if (route.name === 'proposal' && !p) go({ name: 'home' }); }, [!!p]);
  return (
    <div className="app">
      <Sidebar route={route} go={go} onNew={() => onNew('free')} open={sb} setOpen={setSb} />
      {sb && <div className="sb-scrim" onClick={() => setSb(false)} />}
      <main className="main">
        <div className="mob-top">
          <button className="btn btn-ghost btn-icon" onClick={() => setSb(true)} aria-label="메뉴 열기"><Icon name="menu" size={18} /></button>
          <span className="sb-word" style={{ fontSize: 17 }}>winmate</span><span className="sb-ver">v2</span>
        </div>
        {err ? <div className="boot"><b>레이아웃을 불러오지 못했어요</b><span>{err}</span></div>
          : !ready ? <div className="boot"><span className="spin" /><span>PPT 레이아웃 {LAYOUTS.length}장을 준비하는 중…</span></div>
            : route.name === 'proposal' && p ? <ProposalScreen key={p.id} p={p} />
              : route.name === 'library' ? <LayoutLibrary go={go} />
              : route.name === 'scenarios' ? <ScenarioPage go={go} />
              : route.name === 'review' ? <ReviewScreen key={route.id} id={route.id} go={go} />
              : route.name === 'reviews' ? <ReviewHistory go={go} />
              : route.name === 'sim' ? <SimPage go={go} id={route.id} />
              : <Home go={go} onNew={onNew} />}
      </main>
      <Toasts />
    </div>
  );
}

