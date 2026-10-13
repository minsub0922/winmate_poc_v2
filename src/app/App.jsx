import { useEffect, useState } from 'react';
import { loadLayoutHtml } from '../lib/layoutHtml.js';
import { LAYOUTS } from '../lib/catalog.js';
import { Toasts } from '../components/common/Toast.jsx';
import { LayoutLibraryPage } from '../pages/LayoutLibrary/LayoutLibraryPage.jsx';

/** 앱 껍데기 — 레이아웃 HTML 을 읽는 동안 준비 화면, 끝나면 템플릿 라이브러리. */
export function App() {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    loadLayoutHtml().then(() => setReady(true)).catch((e) => setErr(String(e && e.message ? e.message : e)));
  }, []);
  return (
    <div className="app">
      <main className="main">
        {err ? <div className="boot"><b>레이아웃을 불러오지 못했어요</b><span>{err}</span></div>
          : !ready ? <div className="boot"><span className="spin" /><span>PPT 레이아웃 {LAYOUTS.length}장을 준비하는 중…</span></div>
            : <LayoutLibraryPage />}
      </main>
      <Toasts />
    </div>
  );
}
