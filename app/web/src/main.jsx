import React from 'react';
import { createRoot } from 'react-dom/client';
import { loadBootstrap } from './api/bootstrap.js';
import { setUnauthorizedHandler } from './api/client.js';
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
import './styles/published.css';

let loginTimer;
class AppBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div className="boot" role="alert"><b>화면을 표시하지 못했어요</b><span>저장된 기록은 유지됩니다. 새로고침 후 다시 시도해 주세요.</span><button onClick={() => window.location.reload()}>다시 시도</button></div>;
    return this.props.children;
  }
}
setUnauthorizedHandler(() => {
  // Give the repositories' 250–300ms persistence timers time to finish before returning to login.
  if (!loginTimer) loginTimer = setTimeout(() => window.location.replace('/login.html'), 500);
});
try {
  await loadBootstrap();
  const { default: App } = await import('./App.jsx');
  createRoot(document.getElementById('root')).render(<AppBoundary><App /></AppBoundary>);
} catch (error) {
  if (error.status === 401 || error.code === 'auth_not_configured') window.location.replace('/login.html');
  createRoot(document.getElementById('root')).render(<div className="boot"><b>앱을 준비하지 못했어요</b><span>{error.message}</span><button onClick={() => window.location.reload()}>다시 시도</button></div>);
}
