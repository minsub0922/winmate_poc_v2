import React from 'react';
import { createRoot } from 'react-dom/client';
import { loadBootstrap } from './api/bootstrap.js';
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

try {
  await loadBootstrap();
  const { default: App } = await import('./App.jsx');
  createRoot(document.getElementById('root')).render(<App />);
} catch (error) {
  createRoot(document.getElementById('root')).render(<div className="boot"><b>앱을 준비하지 못했어요</b><span>{error.message}</span><button onClick={() => window.location.reload()}>다시 시도</button></div>);
}
