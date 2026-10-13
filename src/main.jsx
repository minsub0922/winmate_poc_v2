// 전역 스타일을 먼저 — 페이지 CSS(pages/**.css)가 뒤에 와서 같은 우선순위 규칙을 덮어쓴다.
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/slide.css';
import './styles/thumb.css';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.jsx';

createRoot(document.getElementById('root')).render(<App />);
