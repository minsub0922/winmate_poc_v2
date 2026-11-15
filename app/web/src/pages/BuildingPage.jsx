// 건물 조감도 — 라이브 아티팩트(Winmate v2 Version 138)의 「건물 조감도」 탭과 같은 모듈 · 데이터 · CSS를 같은 방식으로 붙인다.
// 아티팩트는 페이지에 <style id="wm-bld-css"> · <script id="wm-bld-data"> · <script id="wm-bld-js">를 넣고
// WmBldPage가 window.__wmBldBoot()로 모듈을 한 번 실행해 mount(root, {go, toast}) → route(id)를 부른다.
// 여기서는 탭을 처음 열 때 같은 세 요소를 만든다(모듈은 vite.config.js의 winmate-building 플러그인이
// src/building을 아티팩트와 같은 esbuild 설정으로 묶은 IIFE 원문). 「HTML 추출」은 #wm-bld-js 원문을 그대로 담는다.
import React, { useEffect, useRef } from 'react';
import { toast } from '../components/common.jsx';
import { ensureBuildingCss as ensureCss, loadBuildingModule as loadModule } from '../services/building-bridge.js';

// 모듈 싣기 · 계정 동기화 훅은 services/building-bridge.js에 있다(통합 조감도 목록 · 시작 팝업과 함께 쓴다).
function bootState(root) {
  const box = document.createElement('div');
  box.className = 'bd-boot';
  box.setAttribute('role', 'status');
  const spin = document.createElement('span');
  spin.className = 'spin';
  box.append(spin, '건물 조감도를 여는 중…');
  root.replaceChildren(box);
}

export function BuildingPage({ go, id }) {
  const root = useRef(null), inst = useRef(null), latest = useRef({ go, id });
  latest.current = { go, id };
  // 건물 목록은 통합 조감도 목록(경로 spatial)에 합쳐졌다 — id 없이 들어오면 그쪽으로 보낸다.
  useEffect(() => { if (!id) go({ name: 'spatial' }); }, [id]);
  useEffect(() => {
    if (!id) return undefined;
    let alive = true, view = null;
    ensureCss();
    if (!window.__wmBldMod_) bootState(root.current);
    loadModule().then((m) => {
      if (!alive) return;
      view = m.mount(root.current, { go: latest.current.go, toast });
      view.route(latest.current.id);
      inst.current = view;
    }).catch((error) => {
      console.error(error);
      if (alive && root.current) root.current.textContent = '건물 조감도를 열지 못했어요 · ' + (error && error.message || error);
    });
    return () => { alive = false; if (view) view.destroy(); inst.current = null; };
  }, []);
  useEffect(() => { if (inst.current) { inst.current.setGo(go, toast); inst.current.route(id); } });
  return <div ref={root} className="bd-page" />;
}
