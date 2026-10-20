// 검사 하네스 — 앱 코드 그대로(applyOverrides · fillReady · 배경 · 의미 단위) 한 장을 그린다. dist/_h.html 로 묶인다 (mkharness.mjs).
import { loadLayoutHtml, layoutHtml, L, LAYOUTS, ALL_LAYOUTS } from '../../src/data.js';
import { applyOverrides } from '../../src/slide.jsx';
import { fillReady } from '../../src/fillpack.js';
import { loadBg } from '../../src/bgpack.js';
import { bgOfSlide } from '../../src/scenario_bg.js';
import { markUnits } from '../../src/evidence.js';
window.H = { loadLayoutHtml, layoutHtml, applyOverrides, fillReady, loadBg, bgOfSlide, L, LAYOUTS, ALL_LAYOUTS, markUnits };
