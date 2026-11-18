import { inspecting, inspectNamespace } from './api/inspect.js'; // first: the 관리자 열람 fetch hook must exist before anything requests
import {FeedbackPopup,NotificationHost} from './components/feedback-popup.jsx';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { loadBootstrap, getBootstrap } from './api/bootstrap.js';
import { configureSession, showLogin } from './api/session.js';
import { setUnauthorizedHandler } from './api/client.js';
import { startImageStates } from './services/image-state.js';
import { startTelemetry, recordFailure } from './services/telemetry.js';
import { configureUserStorage, useInspectStorage } from './repositories/browser.js';
import { hydrateAccountData } from './repositories/account-sync.js';
import { loadSampleReviews } from './repositories/sample-reviews.js';
import './styles/tokens.css';
import './styles/styles.css';
import './styles/cards.css';
import './styles/review.css';
import './styles/part.css';
import './styles/detail.css';
import './styles/peek.css';
import './styles/tags.css';
import './styles/sim.css';
import './styles/prod.css';
import './styles/sbview.css';
import './styles/my.css';
import './styles/layout-context.css';
import './styles/published.css';
import './styles/sharing.css';
import './styles/home-entry.css';

startImageStates();

class AppBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { recordFailure(error,{source:'react',feature:'render'}); }
  render() {
    if (this.state.error) return <><NotificationHost/><FeedbackPopup title="화면을 표시하지 못했어요" message="저장된 기록은 유지됩니다. 새로고침 후 다시 시도해 주세요." actionLabel="다시 시도" onAction={()=>window.location.reload()}/></>;
    return this.props.children;
  }
}
setUnauthorizedHandler(()=>{
  let user;try{user=getBootstrap().user;}catch{}
  if(user?.tracking_enabled && user?.username)window.location.assign('/login.html?next='+encodeURIComponent(location.pathname));
  else showLogin();
});
async function renderAccountApp() {
  // 관리자 열람 탭: the inspected account stays out of this browser's own storage, and the tab records no usage of its own.
  if (inspecting()) useInspectStorage(inspectNamespace());
  // Account records are on the server; fill this browser's cache before the repositories read it.
  configureUserStorage(getBootstrap().user);
  await Promise.all([hydrateAccountData(getBootstrap().user, { timeout: inspecting() ? 20000 : 5000 }), loadSampleReviews(getBootstrap().user)]);
  if (!inspecting()) await startTelemetry(getBootstrap().user);
  const { default: App } = await import('./App.jsx');
  const root = createRoot(document.getElementById('root'));
  const render = revision => root.render(<AppBoundary><App libraryRevision={revision}/></AppBoundary>);
  render(getBootstrap().layout_library?.rev || 0);
  const { startLayoutLibrarySync } = await import('./services/layout-library-sync.js');
  startLayoutLibrarySync(render);
  // Documents that so far existed only in this browser move to the account after the first screen is ready.
  if (!inspecting()) setTimeout(() => {
    import('./repositories/reviews.js').then(m => m.migrateReviewDocs()).catch(error => recordFailure(error, { source: 'account-sync', feature: 'review-docs' }));
    import('./services/attachment-sources.js').then(m => m.migrateAttachmentSources()).catch(error => recordFailure(error, { source: 'account-sync', feature: 'attachment-sources' }));
  }, 4000);
}

try {
  await loadBootstrap();
  configureSession(getBootstrap().user);
  const templateId = new URLSearchParams(location.search).get('admin-spatial-template');
  if (templateId) {
    // Shared studio components import the proposal repositories. Keep their startup data inside this frame.
    const namespace = 'winmate.template-studio.' + Math.random().toString(36).slice(2) + ':';
    useInspectStorage(namespace, { includeAccountHistory: false });
    window.__winmateInspect = namespace;
    const { TemplateStudio } = await import('./pages/TemplateStudio.jsx');
    createRoot(document.getElementById('root')).render(<AppBoundary><TemplateStudio id={templateId}/></AppBoundary>);
  } else await renderAccountApp();
} catch (error) {
  recordFailure(error,{source:'bootstrap',feature:'startup'});
  createRoot(document.getElementById('root')).render(<><NotificationHost/><FeedbackPopup title="앱을 준비하지 못했어요" message={error.message} actionLabel="다시 시도" onAction={()=>window.location.reload()}/></>);
}
