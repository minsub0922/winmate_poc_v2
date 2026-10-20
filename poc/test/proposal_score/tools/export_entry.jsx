// Best Scenario → 평가용 제안서 JSON (브라우저에서 실행).
// 앱의 레이아웃 HTML · 채운 값(fillOf) · applyOverrides 를 그대로 써서 장을 실제로 그린 뒤,
// 장마다 텍스트 칸(글자 크기 · 위치 · 넘침) · 이미지 칸(채움 여부) · 고정 문구를 읽어 온다.
// 앱의 검토 프로필(buildProfile) · 적용 판단(selectCriteria) · 규칙 신호(ruleSignals)도 함께 계산해 증거로 넘긴다.
import { SCENARIOS, slidesOfScenario, REQ_TYPES, STRATEGIES, ENDINGS, STAGES } from '../../../../src/scenarios.js';
import { fillOf, FILL_CUSTOMER } from '../../../../src/scenario_fills.js';
import { bgOfSlide } from '../../../../src/scenario_bg.js';
import { L, IND, loadLayoutHtml, layoutHtml } from '../../../../src/data.js';
import { PARTS } from '../../../../src/parts.js';
import { applyOverrides } from '../../../../src/slide.jsx';
import { buildProfile, selectCriteria, ruleSignals } from '../../../../src/review/analyze.js';

const BLANK_RE = /^data:image\/gif;base64,R0lGODlhAQABAIAAAAAAAP/;
const norm = (s) => String(s || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const r1 = (v) => Math.round(v * 10) / 10;

function boxOf(el, origin) {
  const b = el.getBoundingClientRect();
  return { x: r1(b.left - origin.left), y: r1(b.top - origin.top), w: r1(b.width), h: r1(b.height) };
}
function hasPicture(el) {
  if (el.hasAttribute('data-fill')) return true;
  const st = el.getAttribute('style') || '';
  if (/background(-image)?:[^;]*url\(/.test(st)) return true;
  for (const im of el.querySelectorAll('img')) {
    const src = im.getAttribute('src') || '';
    if (im.hasAttribute('data-fill') || (src && !BLANK_RE.test(src))) return true;
  }
  if (el.tagName === 'IMG') { const src = el.getAttribute('src') || ''; return !!src && !BLANK_RE.test(src); }
  return false;
}

function readSheet(stage, root) {
  const origin = root.getBoundingClientRect();
  const W = origin.width || 1280, H = origin.height || 720;
  const texts = [];
  for (const el of root.querySelectorAll('[data-tb]')) {
    if (el.parentElement && el.parentElement.closest('[data-tb]')) continue;
    const text = norm(el.innerText);
    const cs = getComputedStyle(el);
    // smallest rendered font inside the box (inline spans can be smaller than the box itself)
    let minPx = parseFloat(cs.fontSize) || 0, maxPx = minPx;
    for (const c of el.querySelectorAll('*')) { const p = parseFloat(getComputedStyle(c).fontSize) || 0; if (p && (c.textContent || '').trim()) { minPx = Math.min(minPx, p); maxPx = Math.max(maxPx, p); } }
    const b = boxOf(el, origin);
    const clipsY = el.scrollHeight > el.clientHeight + 2 && /hidden|clip|auto|scroll/.test(cs.overflowY + cs.overflow) || (el.scrollHeight > el.clientHeight + 6 && cs.height !== 'auto' && el.style.height);
    const clipsX = el.scrollWidth > el.clientWidth + 2 && /hidden|clip/.test(cs.overflowX + cs.overflow);
    const out = b.x < -4 || b.y < -4 || b.x + b.w > W + 4 || b.y + b.h > H + 4;
    texts.push({ tb: Number(el.getAttribute('data-tb')), text, px: r1(parseFloat(cs.fontSize) || 0), min_px: r1(minPx), max_px: r1(maxPx), weight: Number(cs.fontWeight) || 400, ...b,
      overflow: !!(text && (clipsY || clipsX)), outside: !!(text && out), picture_slot: !text && hasPicture(el) });
  }
  // text boxes that collide with each other (not footers)
  const overlaps = [];
  const real = texts.filter((t) => t.text && t.text.length > 1 && t.y < H - 40);
  for (let i = 0; i < real.length; i++) for (let j = i + 1; j < real.length; j++) {
    const a = real[i], c = real[j];
    const ix = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), iy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
    if (ix <= 2 || iy <= 2) continue;
    const small = Math.min(a.w * a.h, c.w * c.h);
    if (small > 0 && (ix * iy) / small > 0.22) overlaps.push([a.tb, c.tb]);
  }
  const images = [];
  for (const el of root.querySelectorAll('[data-img]')) {
    const im = el.tagName === 'IMG' ? el : el.querySelector('img');
    images.push({ slot: el.getAttribute('data-img'), filled: hasPicture(el), name: (im && (im.getAttribute('alt') || '')) || '', label: norm(el.innerText).slice(0, 40), ...boxOf(el, origin) });
  }
  // pictures the layout itself carries (sample photos outside slots)
  let freePics = 0;
  for (const im of root.querySelectorAll('img')) { if (im.closest('[data-img]')) continue; const src = im.getAttribute('src') || ''; if (im.hasAttribute('data-fill') || (src && !BLANK_RE.test(src))) freePics++; }
  const fixed = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode; const p = n.parentElement;
    if (!p || p.closest('[data-tb]') || p.closest('[data-img]')) continue;
    const s = norm(n.nodeValue); if (s.length >= 2) fixed.push(s);
  }
  return { texts, images, overlaps, free_pictures: freePics, fixed_texts: fixed, bg: !!root.getAttribute('data-bg') || !!root.getAttribute('data-bg-wait') };
}

window.__export = async function () {
  await loadLayoutHtml();
  const stageEl = document.getElementById('stage');
  const out = [];
  for (const s of SCENARIOS) {
    const slides = slidesOfScenario(s);
    const sheets = [];
    for (let k = 0; k < slides.length; k++) {
      const x = slides[k]; const meta = L[x.f] || {};
      const ov0 = fillOf(s.id, k, x.f); const bg = bgOfSlide(s.id, k);
      const ov = bg ? { ...ov0, bg } : ov0;
      stageEl.innerHTML = layoutHtml(x.f) || '';
      const root = stageEl.firstElementChild;
      if (!root) { sheets.push({ n: k + 1, f: x.f, missing: true, role: x.role, stage_key: x.stage.key, stage_name: x.stage.name }); continue; }
      try { applyOverrides(root, ov, k + 1); } catch (e) { /* packed photos load async — ignore */ }
      const r = readSheet(x.stage, root);
      sheets.push({
        n: k + 1, f: x.f, code: meta.code || x.f.slice(2), layout_name: meta.name || '', layout_when: meta.when || '', part: meta.p || null,
        part_label: meta.p && PARTS[meta.p] ? PARTS[meta.p].label : '', layout_req: meta.req || [], photo_first: !!(meta.c === 'PH' || (meta.pf || 0) >= 0.3),
        stage_key: x.stage.key, stage_name: x.stage.name, stage_goal: x.stage.goal || '', role: x.role || '',
        filled: Object.keys(ov0.t || {}).length + Object.keys(ov0.img || {}).length > 0, ...r,
      });
    }
    // the app's review profile / applicability / rule signals on the same sheets
    const units = sheets.map((sh) => {
      const tx = (sh.texts || []).filter((t) => t.text);
      const title = (tx.slice().sort((a, b) => b.max_px - a.max_px || a.y - b.y)[0] || {}).text || '';
      const text = tx.map((t) => t.text).join('\n') + (sh.fixed_texts && sh.fixed_texts.length ? '\n' + sh.fixed_texts.join('\n') : '');
      const minFont = tx.filter((t) => t.text.length > 8 && t.y < 660).reduce((m, t) => Math.min(m, t.min_px || t.px), 999);
      return { n: sh.n, title: title.split('\n')[0].slice(0, 120), text, words: text.split(/\s+/).filter(Boolean).length, notes: '', hidden: false,
        nPic: (sh.images || []).filter((i) => i.filled).length + (sh.free_pictures || 0) + (sh.bg ? 1 : 0), nChart: 0, nTable: 0, minFont: minFont === 999 ? 0 : minFont, boxes: [] };
    });
    const doc = { kind: 'winmate', slides: true, unitLabel: '장', units, meta: { fonts: { 'Noto Sans KR': 1, Manrope: 1 } }, images: [], slideWpt: 1280 };
    let profile = null, applicable = null, rules = null, err = '';
    try {
      const reqText = [...(s.signals || []), ...(s.criteria || [])].join('\n');
      profile = buildProfile(doc, { customer: FILL_CUSTOMER[s.id] || '', ind: s.ind, reqText, reqList: s.criteria || [] });
      applicable = Object.fromEntries(selectCriteria(profile).map((c) => [c.id, { applied: c.applied, why: c.why }]));
      rules = ruleSignals(doc, profile);
    } catch (e) { err = String(e && e.stack || e).slice(0, 400); }
    const keep = profile ? (({ ind, indName, customer, customerShort, customerUnits, products, models, unknownModels, older, solutions, figures, years, competitors, brandTerms, abbrs, fontCount, pics, marketUnits, compUnits, costUnits, parts, caseCust, rfpLike }) =>
      ({ ind, indName, customer, customerShort, customerUnits, products, models, unknownModels, older, solutions, figures, years: years.length, competitors, brandTerms, abbrs, fontCount, pics, marketUnits, compUnits, costUnits, parts, caseCust, rfpLike }))(profile) : null;
    out.push({
      id: s.id, title: s.title, short: s.short || '', customer: FILL_CUSTOMER[s.id] || '',
      req: s.req, req_label: (REQ_TYPES[s.req] || {}).label || s.req, ind: s.ind, ind_name: IND[s.ind] ? IND[s.ind].name : '',
      strategy: s.strategy, strategy_label: (STRATEGIES[s.strategy] || {}).label || s.strategy, strategy_desc: (STRATEGIES[s.strategy] || {}).desc || '',
      ending: s.ending, ending_label: ENDINGS[s.ending] || s.ending, minutes: s.minutes || null, std: !!s.std,
      situation: s.situation || '', signals: s.signals || [], audience: s.audience || {}, criteria: s.criteria || [], thesis: s.thesis || '',
      logic: s.logic || [], diff: s.diff || [], tone: s.tone || '', messages: s.messages || [],
      stages: s.flow.map((g) => ({ key: g.key, label: (STAGES[g.key] || {}).label || g.key, name: g.name, goal: g.goal || '', n: g.slides.length })),
      sheets, app_profile: keep, app_applicable: applicable, app_rules: rules, app_error: err,
    });
  }
  stageEl.innerHTML = '';
  return out;
};
