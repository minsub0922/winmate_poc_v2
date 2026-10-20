import {FeedbackPopup,NotificationHost} from './components/feedback-popup.jsx';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { loadBootstrap, getBootstrap } from './api/bootstrap.js';
import { configureSession, showLogin } from './api/session.js';
import { setUnauthorizedHandler } from './api/client.js';
import { startImageStates } from './services/image-state.js';
import { startTelemetry, recordFailure } from './services/telemetry.js';
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
try {
  await loadBootstrap();
  configureSession(getBootstrap().user);
  await startTelemetry(getBootstrap().user);
  const { default: App } = await import('./App.jsx');
  createRoot(document.getElementById('root')).render(<AppBoundary><App /></AppBoundary>);
} catch (error) {
  recordFailure(error,{source:'bootstrap',feature:'startup'});
  createRoot(document.getElementById('root')).render(<><NotificationHost/><FeedbackPopup title="앱을 준비하지 못했어요" message={error.message} actionLabel="다시 시도" onAction={()=>window.location.reload()}/></>);
}
