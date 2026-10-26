// 건물 조감도 화면 — 목록(스튜디오 시작 · 건물 히스토리) / 시작 창(건물 템플릿) / 3D 건물 스튜디오(층마다 공간 채우기 · 층 추가)
import { data, ready, tplOf, tplsOf } from './data.js';
import { store, uid } from './store.js';
import { Stage, thumbnail } from './render.js';
import { variantsOf, kitOf, swatchOf, signOfInd } from './facade.js';
import { PRESETS } from './presets.js';
import { h, icon, SVG } from './dom.js';
import { exportDoc } from './viewer.js';

const MAX_FLOORS = 30; // 한 건물에 쌓을 수 있는 층 수
const CACHE_V = 'r5';  // 고르기 창 썸네일 그림 판 — 외관 · 데이터가 바뀌면 올린다(IndexedDB 썸네일 캐시 키). r4: 템플릿은 빈 층으로 · r5: 빈 층은 간판 없음

// ---------- 작은 도구 ----------
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return Math.floor(s / 60) + '분 전';
  if (s < 86400) return Math.floor(s / 3600) + '시간 전';
  if (s < 86400 * 7) return Math.floor(s / 86400) + '일 전';
  const d = new Date(t);
  return d.getMonth() + 1 + '/' + d.getDate();
}
// 층 = 껍데기(shell: 외벽 업종 · 바닥 크기 — 건물 형태) + 안(tpl: 같은 크기의 공간 조감도, 없으면 빈 층)
// 예전 저장본(껍데기 없음)은 안의 공간에서 껍데기를 만든다
function shellOf(f) {
  if (f.shell) return f.shell;
  const t = tplOf(f.tpl);
  return t ? { ind: t.ind, w: t.w, d: t.d } : null;
}
function normFloor(f) {
  const s = shellOf(f);
  if (!s) return null;
  if (f.tpl && !tplOf(f.tpl)) f.tpl = null;
  if (!f.tpl) f.tpl = null;
  f.shell = { ind: s.ind, w: s.w, d: s.d };
  return f;
}
const fits = (t, s) => !!t && Math.abs(t.w - s.w) < 0.01 && Math.abs(t.d - s.d) < 0.01;
const sizeText = (s) => `${Math.round(s.w)}×${Math.round(s.d)}m`;
const floorInd = (f) => { const t = tplOf(f.tpl); return t ? t.ind : shellOf(f).ind; };
const indsOf = (floors) => [...new Set(floors.map(floorInd))];
function buildingStats(b) {
  let rooms = 0, products = 0, area = 0;
  for (const f of b.floors) {
    const s = shellOf(f);
    if (!s) continue;
    const t = tplOf(f.tpl);
    if (t) { rooms += t.rooms.length; products += t.productCount; }
    area += s.w * s.d;
  }
  return { floors: b.floors.length, rooms, products, area };
}
// 층 → 무대에 넘길 { tpl(없으면 빈 층), fv, ind · w · d(껍데기) }
const items = (floors) => floors.map((f) => { const s = shellOf(f); return { tpl: f.tpl || null, fv: f.fv || 0, ind: s.ind, w: s.w, d: s.d, name: f.name || undefined }; });
// 층 이름 — 붙인 이름 > 넣은 공간 업종 > 빈 층
const floorName = (f) => (f.name && f.name.trim()) || ((t) => (t ? t.short : '빈 층'))(tplOf(f.tpl));
// 이름을 붙이지 않았을 때 그 층 간판 글자(무대 shapeOf와 같은 규칙) — 빈 층은 ''
function defaultSign(f) {
  const t = tplOf(f.tpl), s = shellOf(f);
  if (!t) return '';
  return t.sign || (t.ind !== s.ind ? signOfInd(t.ind) : kitOf(s.ind, f.fv || 0).sign || '');
}
// 건물 템플릿을 빈 층으로 — 모양(층마다 크기) · 외벽만
const presetShells = (p) => p.floors.map((f) => { const t = tplOf(f.tpl); return { tpl: null, fv: f.fv || 0, ind: t.ind, w: t.w, d: t.d }; });
// 보기 — exterior 외관(기본) · spread 펼쳐 보기. 예전 저장본(view.spread)은 외관으로 연다
const THUMB_V = 4; // 썸네일 판 — 3: 외벽 변형 · 크기가 다른 층 셋백 · 4: 층 간판 = 넣은 공간(빈 층은 없음) · 층 이름
const modeOf = (b) => (b && b.view && b.view.mode === 'spread' ? 'spread' : 'exterior');
function buildingThumb(b) {
  return thumbnail({ floors: items(b.floors), spread: modeOf(b) === 'spread' ? 1 : 0, title: b.title });
}
const indNames = (codes) => codes.map((c) => data().indName[c] || c);
const shortInd = (code) => (data().indName[code] || code).split(' · ')[0];
function autoTitle(inds) {
  const n = inds.map(shortInd);
  if (!n.length) return '새 건물';
  return n.length === 1 ? n[0] + ' 건물' : n.slice(0, 3).join(' · ') + (n.length > 3 ? ' 외' : '') + ' 복합 건물';
}

// 건물 스튜디오 아이콘 — 공간 조감도 스튜디오 아이콘(아이소메트릭 방)을 층으로 쌓은 모양
function towerIcon() {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 60 60'); s.setAttribute('class', 'bd-launch-art'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = [0, 1, 2].map((k) => {
    const y = 40 - k * 13;
    return `<g transform="translate(0 ${y - 40})"><path d="M30 33 48 42 30 51 12 42Z" fill="currentColor" opacity="${0.16 + k * 0.1}"/><path d="M30 33 48 42 30 51 12 42Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 42v3l18 9 18-9v-3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></g>`;
  }).join('') + '<path d="M30 16v-6M30 10l3 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  return s;
}

// ---------- 모달 (앱의 .mback · .modal 그대로) ----------
const stack = [];
function modal({ title, sub, size = '', body, footer, onClose, label }) {
  const prev = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    stack.splice(stack.indexOf(api), 1);
    document.removeEventListener('keydown', onKey, true);
    onClose && onClose();
    prev && prev.focus && prev.focus({ preventScroll: true });
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && stack[stack.length - 1] === api) { e.stopPropagation(); e.preventDefault(); close(); }
    if (e.key === 'Tab' && stack[stack.length - 1] === api) {
      const f = [...box.querySelectorAll('button:not(:disabled), input, select, [tabindex="0"]')].filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  const box = h('div', { class: 'modal ' + size, role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title, tabindex: '-1' },
    title && h('div', { class: 'mhead' },
      h('div', { style: { minWidth: '0' } }, h('h2', { text: title }), sub && h('p', { text: sub })),
      h('button', { class: 'btn btn-ghost btn-icon x', 'aria-label': '닫기', onclick: () => close() }, icon('x'))),
    body, footer && h('div', { class: 'mfoot' }, footer));
  const back = h('div', { class: 'mback bd-mback', onmousedown: (e) => { if (e.target === back) close(); } }, box);
  document.body.appendChild(back);
  document.addEventListener('keydown', onKey, true);
  const api = { close, box };
  stack.push(api);
  setTimeout(() => (box.querySelector('[data-autofocus]') || box).focus({ preventScroll: true }), 30);
  return api;
}
function confirmBox({ title, message, ok, danger }) {
  return new Promise((res) => {
    let v = false;
    const m = modal({
      title, size: 'narrow', onClose: () => res(v),
      body: h('div', { class: 'mbody' }, h('p', { class: 'bd-confirm-msg', text: message })),
      footer: [h('span', { class: 'sp' }),
        h('button', { class: 'btn', 'data-autofocus': true, onclick: () => m.close() }, '취소'),
        h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), onclick: () => { v = true; m.close(); } }, ok)],
    });
  });
}

// ---------- 고르기 창 썸네일 — 메모리 + IndexedDB 캐시, 보일 때만 그린다 ----------
let openPickers = 0;
const wantPick = () => openPickers > 0;
const pickThumbs = new Map();
function cachedThumb(key, make) {
  let p = pickThumbs.get(key);
  if (p) return p;
  p = (async () => {
    const k = `${key}@${CACHE_V}.${data().v}`;
    const hit = await store.cacheGet(k);
    if (hit) return URL.createObjectURL(hit);
    const blob = await make();
    store.cacheSet(k, blob);
    return URL.createObjectURL(blob);
  })();
  pickThumbs.set(key, p);
  p.catch(() => pickThumbs.delete(key));
  return p;
}
const tplThumb = (id) => cachedThumb('tpl:' + id, () => thumbnail({ floors: [id], single: true, w: 520, h: 334, type: 'image/webp', quality: 0.9, wanted: wantPick }));
const presetThumb = (p) => cachedThumb('pre:' + p.id, () => thumbnail({ floors: presetShells(p), title: p.title, w: 640, h: 410, type: 'image/webp', quality: 0.9, wanted: wantPick }));
let pruned = false;
// 이미 받은 그림(promise) 또는 보일 때 부를 함수(get + io)
function lazyImg(src, alt, io) {
  const img = h('img', { alt: alt || '', decoding: 'async' });
  const wrap = h('span', { class: 'bd-thumb is-loading' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), img);
  const fail = () => { wrap.classList.remove('is-loading'); wrap.classList.add('is-failed'); };
  img.onload = () => wrap.classList.remove('is-loading');
  img.onerror = fail;
  const load = () => (typeof src === 'function' ? src() : src).then((url) => { if (url) img.src = url; else fail(); }, (e) => { if (!(e && e.skip)) fail(); });
  if (io && typeof src === 'function') { wrap._load = load; io.observe(wrap); } else load();
  return wrap;
}

// ---------- 고르기 창 ----------
// start: 건물 템플릿 하나 → 층마다 공간은 비운 채로 스튜디오 · add: 이 건물에 맞는(맨 위층과 같은 크기) 공간 여러 개 또는 빈 층 ·
// fill: 이 층에 맞는 공간 하나. 위: (공간 수 · 크기 표시) / 업종 칩. 가운데: 업종별 카드. 아래: 고른 것 + 확인 — 설명 글 없이
function openPicker({ mode = 'start', onDone, base = 0, shell = null, ind = null, current = null, floor = 0 }) {
  const D = data();
  const cap = Math.max(1, MAX_FLOORS - base);
  const pre = mode === 'start';
  const selInd = new Set();
  const filt = { rooms: 0 };
  const selTpl = current ? [current] : [];
  let selPre = null, picked = null, flashT = 0, flashing = false;
  openPickers++;

  const list = h('div', { class: 'mbody bd-pick-body' });
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { io.unobserve(e.target); e.target._load && e.target._load(); }
  }, { root: list, rootMargin: '360px 0px' });

  // 고를 수 있는 것 — 공간은 이 건물(층) 크기에 맞는 것만, 템플릿은 건물 템플릿
  const tplsIn = (code) => tplsOf(code).filter((t) => !shell || fits(t, shell));
  const presIn = (code) => PRESETS.filter((p) => p.ind === code && p.floors.every((f) => tplOf(f.tpl)));
  const codes = D.industries.map((x) => x.code).filter((c) => (pre ? presIn(c) : tplsIn(c)).length);
  if (ind && codes.includes(ind)) selInd.add(ind);

  // 업종 칩 — 전체 + 업종(짧은 이름, 전체 이름은 툴팁). 여러 개 고를 수 있음
  const chips = h('div', { class: 'bd-chips', role: 'group', 'aria-label': '업종' });
  const allChip = h('button', { class: 'bd-chip', type: 'button', 'aria-pressed': 'true', onclick: () => { selInd.clear(); changed(); } }, '전체');
  const chipBtns = new Map();
  chips.append(allChip);
  for (const code of codes) {
    const b = h('button', { class: 'bd-chip', type: 'button', 'aria-pressed': 'false', title: D.indName[code] || code, onclick: () => {
      selInd.has(code) ? selInd.delete(code) : selInd.add(code);
      changed();
    } }, shortInd(code));
    chipBtns.set(code, b);
    chips.append(b);
  }
  // 공간 수 드롭다운 · 이 건물에 맞는 크기 · (층 추가) 모두 선택
  const allBtn = h('button', { class: 'btn btn-ghost btn-sm bd-pick-all', type: 'button', hidden: true });
  const tools = !pre && h('div', { class: 'bd-pick-tools' },
    shell && h('span', { class: 'bd-pick-size num', title: '이 건물에 맞는 크기의 공간만 보여요' }, icon('grid', 13), sizeText(shell)),
    h('span', { class: 'bd-sp' }),
    mode === 'add' && allBtn,
    h('select', { class: 'select', 'aria-label': '공간 수', onchange: (e) => { filt.rooms = Number(e.target.value); changed(); } },
      [[0, '공간 수 전체'], [6, '6공간'], [5, '5공간'], [4, '4공간'], [3, '3공간']].map(([v, t]) => h('option', { value: v }, t))));

  const panel = h('div', { class: 'bd-groups' });
  const cards = new Map(), groups = new Map();
  for (const code of codes) {
    const grid = h('div', { class: 'bd-tpl-grid' + (pre ? ' bd-pre-grid' : '') });
    const sec = h('section', { class: 'bd-group', 'aria-label': D.indName[code] || code }, h('h4', { class: 'bd-group-head', text: D.indName[code] || code }), grid);
    groups.set(code, sec);
    if (pre) for (const p of presIn(code)) {
      // 건물 템플릿 = 건물 모양(층마다 크기 · 셋백) + 외벽. 층 수는 고른 뒤 스튜디오에서 마음대로
      const inds = [...new Set(p.floors.map((f) => tplOf(f.tpl).ind))];
      const t0 = tplOf(p.floors[0].tpl);
      const card = h('button', { class: 'bd-tpl bd-pre', type: 'button', 'aria-pressed': 'false', onclick: () => { selPre = selPre === p.id ? null : p.id; refresh(); } },
        lazyImg(() => presetThumb(p), p.title + ' 3D 건물', io),
        h('span', { class: 'bd-tpl-check', 'aria-hidden': 'true' }, icon('check', 13, 3)),
        h('span', { class: 'bd-tpl-copy' }, h('b', { text: p.title }), h('span', { class: 'bd-tpl-meta', text: `${kitOf(p.ind, p.fv).label} · ${sizeText(t0)}` })));
      cards.set(p.id, { card, p, inds, code });
      grid.append(card);
    } else for (const t of tplsIn(code)) {
      const badge = h('span', { class: 'bd-tpl-badge num' });
      const card = h('button', { class: 'bd-tpl', type: 'button', 'aria-pressed': 'false', title: `${t.name} · ${t.roomsText}`, onclick: () => pickTpl(t.id) },
        lazyImg(() => tplThumb(t.id), `${t.short} ${t.name} 3D 조감도`, io),
        badge,
        h('span', { class: 'bd-tpl-check', 'aria-hidden': 'true' }, icon('check', 13, 3)),
        h('span', { class: 'bd-tpl-copy' },
          h('b', { text: t.name }),
          h('span', { class: 'bd-tpl-meta', text: `${t.rooms.length}공간 · ${t.sizeText}` })));
      cards.set(t.id, { card, badge, t, code });
      grid.append(card);
    }
    panel.append(sec);
  }
  const empty = h('div', { class: 'bd-pick-empty' }, icon('grid', 24), '조건에 맞는 항목이 없어요');
  list.append(panel, empty);

  const top = h('div', { class: 'bd-pick-top' }, tools && h('div', { class: 'bd-pick-bar' }, tools), chips);
  const sum = h('span', { class: 'bd-pick-sum', role: 'status' });
  const go = h('button', { class: 'btn btn-primary', type: 'button', disabled: true });
  const emptyBtn = mode === 'add' && h('button', { class: 'btn bd-pick-blank', type: 'button', onclick: () => { picked = { empty: 1 }; m.close(); } }, icon('plus', 15, 2.2), '빈 층 추가');

  function changed() {
    allChip.setAttribute('aria-pressed', String(!selInd.size));
    for (const [c, b] of chipBtns) b.setAttribute('aria-pressed', String(selInd.has(c)));
    refresh();
    list.scrollTop = 0;
  }
  // 한도에 닿으면 아래 줄에 잠깐 알림
  function say(msg) {
    flashing = true;
    sum.textContent = msg;
    sum.classList.add('is-warn');
    clearTimeout(flashT);
    flashT = setTimeout(() => { flashing = false; sum.classList.remove('is-warn'); refresh(); }, 2400);
  }
  function pickTpl(id) {
    const i = selTpl.indexOf(id);
    if (mode === 'fill') selTpl.splice(0, selTpl.length, ...(i >= 0 ? [] : [id]));
    else if (i >= 0) selTpl.splice(i, 1);
    else if (selTpl.length >= cap) { say(`${MAX_FLOORS}층까지 쌓을 수 있어요`); return; }
    else selTpl.push(id);
    refresh();
  }
  function refresh() {
    const per = new Set(), visIds = [];
    for (const [id, c] of cards) {
      const on = (!selInd.size || selInd.has(c.code) || (c.inds && c.inds.some((x) => selInd.has(x)))) && (pre || !filt.rooms || c.t.rooms.length === filt.rooms);
      c.card.hidden = !on;
      if (on) { visIds.push(id); per.add(c.code); }
      if (pre) { c.card.setAttribute('aria-pressed', String(selPre === id)); continue; }
      const k = selTpl.indexOf(id);
      c.card.setAttribute('aria-pressed', String(k >= 0));
      c.badge.textContent = k >= 0 && mode === 'add' ? base + k + 1 + 'F' : '';
    }
    for (const [code, sec] of groups) sec.hidden = !per.has(code);
    list.classList.toggle('is-empty', !visIds.length);
    let text;
    if (pre) {
      if (selPre && cards.get(selPre).card.hidden) selPre = null;
      const p = selPre && cards.get(selPre).p;
      go.disabled = !p;
      go.replaceChildren(icon('arrowR', 16, 2.2), '스튜디오 열기');
      text = p ? p.title : '건물 템플릿을 고르세요';
    } else if (mode === 'add') {
      const allOn = visIds.length > 0 && visIds.every((id) => selTpl.includes(id));
      allBtn.hidden = !visIds.length || !(allOn || (visIds.length <= 16 && selTpl.length + visIds.filter((id) => !selTpl.includes(id)).length <= cap));
      allBtn.textContent = allOn ? '모두 해제' : '모두 선택';
      allBtn.onclick = () => {
        if (allOn) visIds.forEach((id) => { const i = selTpl.indexOf(id); if (i >= 0) selTpl.splice(i, 1); });
        else visIds.forEach((id) => { if (!selTpl.includes(id) && selTpl.length < cap) selTpl.push(id); });
        refresh();
      };
      const n = selTpl.length;
      go.disabled = !n;
      go.replaceChildren(icon('plus', 16, 2.2), n ? `${n}개 층 추가` : '층 추가');
      text = n ? `${n}개 층 선택` : '추가할 층의 공간을 고르세요';
    } else {
      const id = selTpl[0];
      go.disabled = !id || id === current;
      go.replaceChildren(icon('check', 16, 2.4), '이 공간으로');
      text = id ? tplOf(id).name : '공간을 고르세요';
    }
    if (!flashing) sum.textContent = text;
  }
  const body = h('div', { class: 'bd-pick-main' }, top, list);
  const m = modal({
    title: pre ? '건물 스튜디오 시작' : mode === 'add' ? '층 추가' : `${floor}F 공간 고르기`,
    size: 'wide bd-pick-modal', body,
    footer: [sum, h('span', { class: 'sp' }), h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, '취소'), emptyBtn, go],
    onClose: () => {
      openPickers--;
      io.disconnect();
      clearTimeout(flashT);
      if (picked) onDone(picked);
    },
  });
  go.onclick = () => {
    if (pre) {
      const p = selPre && cards.get(selPre).p;
      if (!p) return;
      picked = { preset: p };
    } else if (mode === 'add') {
      if (!selTpl.length) return;
      picked = { tpls: [...selTpl] };
    } else {
      if (!selTpl[0] || selTpl[0] === current) return;
      picked = { tpl: selTpl[0] };
    }
    m.close();
  };
  changed();
  // 미리 고른 업종 칩이 보이게(좁은 화면에선 칩 줄이 가로로 흐른다)
  const pressed = chips.querySelector('.bd-chip[aria-pressed=true]:not(:first-child)');
  if (pressed) chips.scrollLeft = Math.max(0, pressed.offsetLeft - chips.clientWidth / 2 + pressed.offsetWidth / 2);
}

// ---------- 목록 화면 ----------
function listView(ctx) {
  const urls = [];
  const grid = h('div', { class: 'bd-grid' });
  const countEl = h('span', { class: 'bd-count' }, '0');
  const sec = h('section', { class: 'bd-library bd-history', 'aria-label': '건물 히스토리' },
    h('div', { class: 'bd-library-intro' },
      h('div', null, h('h2', null, '건물 히스토리 ', countEl), h('p', { text: '저장한 건물을 열어 층 구성을 이어서 편집하세요.' }))),
    grid);
  const D = data();
  const launch = h('button', { class: 'bd-launch', type: 'button', onclick: () => start(ctx) },
    h('span', { class: 'bd-launch-icon' }, towerIcon()),
    h('span', { class: 'bd-launch-copy' },
      h('strong', { text: '건물 스튜디오' }),
      h('small', { text: `건물 템플릿을 고르고 층마다 공간을 채워요 · 건물 템플릿 ${PRESETS.length}가지 · 공간 조감도 ${D.tpl.length}가지 · 업종마다 외벽 3가지 이상` })),
    h('span', { class: 'bd-launch-go', 'aria-hidden': 'true' }, icon('arrowR', 20, 2.2)));
  const el = h('div', { class: 'bd-page-in' },
    h('div', { class: 'bd-topbar' },
      h('header', { class: 'bd-header' },
        h('div', { class: 'tl-title' },
          h('span', { class: 'eyebrow', text: 'WINMATE · 공간 제안' }),
          h('h1', null, '건물 조감도', h('span', { class: 'bd-beta', text: 'BETA' })),
          h('p', { text: '건물 템플릿을 고르고 층마다 공간 조감도를 채워 3D 건물을 구성하세요.' })))),
    launch, sec,
    !store.persistent && h('p', { class: 'bd-note', text: '이 브라우저에서는 저장소를 쓸 수 없어 새로 고치면 히스토리가 사라져요.' }));
  let alive = true, seq = 0;
  async function load() {
    const my = ++seq;
    const list = await store.list();
    if (!alive || my !== seq) return;
    countEl.textContent = list.length;
    urls.splice(0).forEach((u) => URL.revokeObjectURL(u));
    if (!list.length) {
      grid.replaceChildren(h('div', { class: 'bd-empty' },
        icon('history', 30), h('h3', { text: '저장한 건물이 없어요' }), h('p', { text: '건물 스튜디오에서 첫 건물을 만들어 보세요.' })));
      grid.classList.add('is-empty');
      return;
    }
    grid.classList.remove('is-empty');
    grid.replaceChildren(...list.map((b) => card(b)));
  }
  function card(b) {
    const s = buildingStats(b);
    const thumbP = (async () => {
      const t = await store.thumb(b.id);
      if (t && t.blob && t.v === THUMB_V && t.at >= (b.contentAt || b.createdAt)) return t.blob;
      const blob = await buildingThumb(b);
      store.putThumb(b.id, blob, Date.now(), THUMB_V);
      return blob;
    })().then((blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; }).catch(() => null);
    const open = () => ctx.go({ name: 'building', id: b.id });
    return h('article', { class: 'bd-card' },
      h('button', { class: 'bd-card-open', type: 'button', 'aria-label': b.title + ' 열기', onclick: open },
        lazyImg(thumbP, b.title + ' 3D 건물'),
        h('span', { class: 'bd-card-floors num' }, icon('layers', 12, 2.2), s.floors + '개 층')),
      h('div', { class: 'bd-card-caption' },
        h('div', { class: 'bd-card-info' },
          h('small', { text: indNames(b.industries).map((n) => n.split(' · ')[0]).join(' · ') }),
          h('h3', null, b.title, b.example && h('span', { class: 'bd-ex', text: '예시' })),
          h('p', { text: `공간 ${s.rooms} · 제품 ${s.products}대 · ${fmt(s.area)}㎡ · 수정 ${ago(b.updatedAt)}` })),
        h('button', { class: 'btn btn-ghost btn-icon bd-card-del', type: 'button', 'aria-label': b.title + ' 삭제', title: '삭제', onclick: async () => {
          if (!(await confirmBox({ title: '건물을 삭제할까요?', message: `‘${b.title}’과 저장한 층 구성이 사라져요. 되돌릴 수 없어요.`, ok: '삭제', danger: true }))) return;
          await store.remove(b.id);
          ctx.toast && ctx.toast('건물을 삭제했어요');
        } }, icon('trash', 16))));
  }
  const off = store.on(() => load());
  load();
  return { el, destroy() { alive = false; off(); urls.forEach((u) => URL.revokeObjectURL(u)); } };
}

// 시작 — 건물 템플릿 하나를 고르면 그 모양(층마다 크기 · 외벽) 그대로, 층마다 공간은 비운 채로 스튜디오를 연다
function start(ctx) {
  openPicker({ mode: 'start', onDone: async ({ preset: p }) => {
    const now = Date.now();
    const floors = presetShells(p).map((x) => ({ key: uid('f'), tpl: null, fv: x.fv, shell: { ind: x.ind, w: x.w, d: x.d } }));
    const b = { id: uid('bld'), title: p.title, industries: indsOf(floors), template: p.id, floors };
    Object.assign(b, { view: { mode: 'exterior' }, camera: null, createdAt: now, contentAt: now, updatedAt: now });
    await store.put(b, { touch: false });
    ctx.go({ name: 'building', id: b.id });
  } });
}

// ---------- 스튜디오 ----------
async function saveBlob(blob, filename) {
  try {
    if (window.claude && window.claude.use) {
      const d = await window.claude.use('downloads');
      if (d && d.save) { await d.save({ filename, data: blob }); return { ok: true }; }
    }
  } catch (e) {
    const code = e && e.code;
    if (code === 'declined') return { err: '저장을 취소했어요.' };
    if (code === 'extension_not_enabled' || code === 'rejected_extension') return { err: '이 화면에서는 이 형식으로 저장할 수 없어요.' };
    if (code === 'rate_limited') return { err: '잠시 뒤에 다시 저장해 주세요.' };
    if (code === 'too_large') return { err: '파일이 너무 커서 저장할 수 없어요.' };
  }
  try {
    const u = URL.createObjectURL(blob), a = h('a', { href: u, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
    return { ok: true };
  } catch { return { err: '이 화면에서는 파일을 저장할 수 없어요.' }; }
}
const fileBase = (title) => (title || '건물 조감도').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 80) || '건물 조감도';

// 내려받기 — 아이콘 버튼 하나 + 고르는 메뉴(↑↓ · Home/End · Esc). items: [{ icon, label, tag, run }]
function downloadMenu(items) {
  const btn = h('button', { class: 'btn btn-icon bd-dl-btn', type: 'button', 'aria-label': '내려받기', title: '내려받기', 'aria-haspopup': 'menu', 'aria-expanded': 'false', disabled: true }, icon('download', 18));
  const menu = h('div', { class: 'bd-menu', role: 'menu', 'aria-label': '내려받기', hidden: true });
  const wrap = h('div', { class: 'bd-dl' }, btn, menu);
  let busy = false;
  const entries = items.map((it) => h('button', { type: 'button', role: 'menuitem', tabindex: '-1', onclick: () => pick(it) },
    icon(it.icon, 16), h('span', { text: it.label }), h('small', { text: it.tag })));
  menu.append(...entries);
  const onDoc = (e) => { if (!wrap.contains(e.target)) close(); };
  function open() {
    menu.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onDoc, true);
    entries[0].focus();
  }
  function close(back = false) {
    if (menu.hidden) return;
    menu.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDoc, true);
    if (back) btn.focus();
  }
  btn.onclick = () => (menu.hidden ? open() : close());
  btn.addEventListener('keydown', (e) => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && menu.hidden) { e.preventDefault(); open(); } });
  menu.addEventListener('keydown', (e) => {
    const i = entries.indexOf(document.activeElement), n = entries.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); entries[(i + (e.key === 'ArrowDown' ? 1 : n - 1) + n) % n].focus(); }
    else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); entries[e.key === 'Home' ? 0 : n - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab') close();
  });
  async function pick(it) {
    close();
    if (busy) return;
    busy = true;
    btn.disabled = true;
    btn.replaceChildren(h('span', { class: 'spin', 'aria-hidden': 'true' }));
    try { await it.run(); } catch (e) { console.error(e); } finally {
      busy = false;
      btn.disabled = false;
      btn.replaceChildren(icon('download', 18));
    }
  }
  return { el: wrap, enable() { btn.disabled = false; }, destroy() { document.removeEventListener('pointerdown', onDoc, true); } };
}
const fvOf = (f) => { const n = variantsOf(shellOf(f).ind).length; return (((f.fv || 0) % n) + n) % n; };

function studioView(ctx, id) {
  const el = h('div', { class: 'bd-page-in' });
  let b = null, stage = null, alive = true, saveT = 0, thumbT = 0, camT = 0, dirtyThumb = false;
  const disposers = [];
  const loading = h('div', { class: 'bd-render-state', role: 'status' }, h('span', { class: 'spin' }), '건물을 구성하는 중…');
  const host = h('div', { class: 'bd-render-host' });
  const labels = h('div', { class: 'bd-labels' });
  const info = h('aside', { class: 'bd-floor-card', 'aria-live': 'polite', hidden: true });
  const pop = h('div', { class: 'bd-fv-pop', role: 'dialog', 'aria-label': '외벽 고르기', hidden: true });
  const help = h('div', { class: 'bd-view-help', text: '드래그로 회전 · 휠로 확대 · 외벽을 누르면 외벽 · 간판을 누르면 이름 바꾸기 · 층 이름을 누르면 층 내부' });
  const view = h('div', { class: 'bd-view' }, host, labels, info, pop, help, loading);
  const strip = h('div', { class: 'bd-floor-strip', role: 'toolbar', 'aria-label': '층 구성' });
  const title = h('input', { 'aria-label': '건물 이름', maxlength: '80', placeholder: '건물 이름' });
  const spec = h('span');
  const saved = h('span', { class: 'bd-save-state', role: 'status' });
  const sw = h('div', { class: 'bd-view-switch', role: 'group', 'aria-label': '보기' });
  const extBtn = h('button', { type: 'button', 'aria-pressed': 'true', title: '외벽 · 간판 · 지붕까지 갖춘 건물 모습' }, '외관 보기');
  const spreadBtn = h('button', { type: 'button', 'aria-pressed': 'false', title: '층 사이를 벌려 층마다 내부를 보기' }, '펼쳐 보기');
  sw.append(extBtn, spreadBtn);
  const actions = h('div', { class: 'bd-canvas-actions' },
    h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': '왼쪽으로 돌리기', title: '왼쪽으로 돌리기', onclick: () => stage && stage.rotate(-45) }, icon('rotL', 17)),
    h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': '오른쪽으로 돌리기', title: '오른쪽으로 돌리기', onclick: () => stage && stage.rotate(45) }, icon('rotR', 17)),
    h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': '처음 시점으로', title: '처음 시점으로', onclick: () => stage && stage.resetView() }, icon('refresh', 16)));
  const dl = downloadMenu([
    { icon: 'image', label: '이미지 저장', tag: 'PNG', run: () => savePng() },
    { icon: 'code', label: 'HTML 추출', tag: '3D', run: () => saveHtml() },
  ]);
  el.append(
    h('div', { class: 'bd-topbar' },
      h('header', { class: 'bd-header bd-studio-header' },
        h('div', { class: 'bd-header-heading' },
          h('button', { class: 'bd-back', type: 'button', title: '건물 조감도 목록으로', onclick: () => leave() }, icon('arrowL', 20), h('span', { text: '뒤로 가기' })),
          h('span', { class: 'bd-beta', text: 'BETA' })),
        h('div', { class: 'bd-header-actions' }, dl.el))),
    h('section', { class: 'bd-workspace', 'aria-label': '건물 조감도 편집' },
      h('div', { class: 'bd-canvas-toolbar' }, sw, actions),
      h('div', { class: 'bd-canvas-title' }, h('div', { class: 'bd-canvas-spec' }, title, spec), saved),
      view, strip));

  function setSaved(state) {
    saved.replaceChildren(state === 'saving' ? h('span', { class: 'spin' }) : icon('check', 13, 2.6), state === 'saving' ? '저장하는 중' : '저장됨');
    saved.dataset.state = state;
  }
  function save({ content = false, now = false } = {}) {
    if (!b) return;
    if (b.example) delete b.example; // 고치면 내 건물
    b.industries = indsOf(b.floors);
    if (content) { b.contentAt = Date.now(); dirtyThumb = true; }
    setSaved('saving');
    clearTimeout(saveT);
    const run = async () => {
      await store.put(b);
      if (alive) setSaved('saved');
      if (dirtyThumb) { clearTimeout(thumbT); thumbT = setTimeout(makeThumb, now ? 0 : 1200); }
    };
    if (now) return run();
    saveT = setTimeout(run, 450);
  }
  async function makeThumb() {
    if (!b || !dirtyThumb) return;
    dirtyThumb = false;
    try {
      const blob = await buildingThumb(b);
      await store.putThumb(b.id, blob, Date.now(), THUMB_V);
    } catch {}
  }
  async function leave() {
    clearTimeout(saveT);
    if (b) { await store.put(b); if (dirtyThumb) makeThumb(); }
    ctx.go({ name: 'building' });
  }

  function updateSpec() {
    const s = buildingStats(b);
    const inds = indsOf(b.floors);
    spec.textContent = `지상 ${s.floors}층 · ${s.rooms}개 공간 · 제품 ${s.products}대 · 연면적 ${fmt(s.area)}㎡` + (inds.length ? ' · ' + indNames(inds).map((n) => n.split(' · ')[0]).join(' · ') : '');
  }

  // 층 띠 — 아래층부터 왼쪽에
  function renderStrip() {
    const f0 = stage ? stage.focus : null;
    const all = h('button', { type: 'button', class: 'bd-strip-all', 'aria-pressed': String(f0 === null), onclick: () => focus(null) }, icon('building', 14), '전체 건물');
    const items = b.floors.map((f, i) => {
      const t = tplOf(f.tpl), s = shellOf(f);
      const on = f0 === i;
      const pick = h('button', { type: 'button', class: 'bd-floor-pick' + (t ? '' : ' is-empty'), 'aria-pressed': String(on), title: `${floorName(f)}${t ? ' · ' + t.name : ''} · ${sizeText(s)} · 외벽 ${kitOf(s.ind, f.fv).label}`, onclick: () => focus(on ? null : i) },
        h('b', { class: 'num', text: i + 1 + 'F' }), floorName(f));
      const acts = on && h('span', { class: 'bd-floor-acts' },
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon bd-fv-act', 'aria-label': `${i + 1}층 외벽 바꾸기`, title: '외벽 바꾸기', 'aria-haspopup': 'dialog', onclick: () => (popAt && popAt.i === i ? closeFacade() : openFacade(i, null, true)) }, icon('palette', 15)),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': `${i + 1}층을 아래층으로`, title: '아래층으로', disabled: i === 0, onclick: () => move(i, -1) }, icon('chevL', 14, 2.4)),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': `${i + 1}층을 위층으로`, title: '위층으로', disabled: i === b.floors.length - 1, onclick: () => move(i, 1) }, icon('chev', 14, 2.4)),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': `${i + 1}층 복제`, title: '바로 위에 복제', disabled: b.floors.length >= MAX_FLOORS, onclick: () => dup(i) }, icon('copy', 14)),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon bd-danger', 'aria-label': `${i + 1}층 삭제`, title: '층 삭제', disabled: b.floors.length < 2, onclick: () => remove(i) }, icon('trash', 14)));
      return h('div', { class: 'bd-floor-chip' + (on ? ' is-on' : '') }, pick, acts);
    });
    // 층 추가 — 맨 위층과 같은 크기 · 외벽으로(건물 모양 그대로). 공간은 그 크기에 맞는 것만 고르거나 빈 층으로
    const top = b.floors[b.floors.length - 1];
    const add = h('button', { type: 'button', class: 'bd-floor-add', disabled: b.floors.length >= MAX_FLOORS, title: b.floors.length >= MAX_FLOORS ? `${MAX_FLOORS}층까지 쌓을 수 있어요` : null,
      onclick: () => openPicker({ mode: 'add', base: b.floors.length, shell: shellOf(top), ind: floorInd(top), onDone: addFloors }) }, icon('plus', 14, 2.4), '층 추가');
    strip.replaceChildren(all, ...items, add);
    const cur = strip.querySelector('.bd-floor-chip.is-on');
    cur && cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function addFloors({ tpls, empty }) {
    const top = b.floors[b.floors.length - 1], s = shellOf(top), fv = top.fv || 0;
    const list = (tpls || Array(empty || 1).fill(null)).slice(0, Math.max(0, MAX_FLOORS - b.floors.length));
    if (!list.length) return;
    b.floors.push(...list.map((tpl) => ({ key: uid('f'), tpl, fv, shell: { ind: s.ind, w: s.w, d: s.d } })));
    // 빈 층 하나면 그 층을 바로 열어 공간을 고르게
    rebuild(tpls ? null : b.floors.length - 1);
    ctx.toast && ctx.toast(tpls ? `${list.length}개 층을 맨 위에 쌓았어요` : '빈 층을 맨 위에 쌓았어요');
  }
  function move(i, d) {
    const j = i + d;
    if (j < 0 || j >= b.floors.length) return;
    [b.floors[i], b.floors[j]] = [b.floors[j], b.floors[i]];
    rebuild(j);
  }
  function dup(i) {
    if (b.floors.length >= MAX_FLOORS) return;
    const f = b.floors[i], s = shellOf(f);
    b.floors.splice(i + 1, 0, { key: uid('f'), tpl: f.tpl || null, fv: f.fv || 0, shell: { ind: s.ind, w: s.w, d: s.d }, ...(f.name ? { name: f.name } : {}) });
    rebuild(i + 1);
  }
  async function remove(i) {
    if (b.floors.length < 2) return;
    const t = tplOf(b.floors[i].tpl);
    if (!(await confirmBox({ title: `${i + 1}층을 뺄까요?`, message: `‘${floorName(b.floors[i])}${t ? ' ' + t.name : ''}’ 층을 건물에서 빼요. 위층은 한 층씩 내려와요.`, ok: '층 빼기', danger: true }))) return;
    b.floors.splice(i, 1);
    rebuild(null); // 업종 목록은 저장할 때 남은 층으로 다시
  }
  function rebuild(focusAt) {
    if (!stage) return;
    closeFacade();
    stage.focus = null;
    stage.setFloors(items(b.floors));
    stage.floors.forEach((f) => (f.alpha = 1));
    if (focusAt !== null && focusAt !== undefined) stage.setFocus(focusAt, false);
    else { stage.layout(); stage.aim({ i: null }, true); }
    renderStrip(); updateSpec(); updateInfo();
    save({ content: true });
  }
  function focus(i) {
    if (!stage) return;
    closeFacade();
    stage.reserveRight = 300 + 28;
    stage.setFocus(i, true);
    renderStrip(); updateInfo();
  }
  // 외벽 바꾸기 — 이 층만, 또는 같은 업종 층 모두. 시점 · 초점은 그대로 두고 외벽만 다시 짓는다
  function setFacade(i, fv, all = false) {
    const fam = shellOf(b.floors[i]).ind;
    const changes = [];
    b.floors.forEach((f, k) => {
      if (k !== i && !(all && shellOf(f).ind === fam)) return;
      if (fvOf(f) === fv) return;
      f.fv = fv;
      changes.push([k, fv]);
    });
    if (!changes.length) return;
    if (stage) stage.setFacade(changes);
    renderStrip();
    if (popAt) renderPop();
    save({ content: true });
    if (all) ctx.toast && ctx.toast(`${shortInd(fam)} 층 ${changes.length}개 외벽도 ‘${kitOf(fam, fv).label}’로 바꿨어요`);
  }

  // 외벽 고르기 팝업 — 외관 보기에서 외벽을 누른 자리에(층 띠의 외벽 버튼으로 열면 화면 아래에).
  // 고르는 동안 그 층 외벽을 강조색으로 살짝 물들인다
  // 같은 자리에 층 이름(간판) 바꾸기 팝업도 — 간판 글자를 누르거나 층 카드의 이름을 누르면
  let popAt = null; // { i, pt: 누른 자리(화면 기준) | null, kb: 키보드로 열었는지, kind: 'facade' | 'name', from: 'card' }
  function openName(i, pt, kb = false, from = null) { openFacade(i, pt, kb, 'name', from); }
  function openFacade(i, pt, kb = false, kind = 'facade', from = null) {
    if (!b || !b.floors[i]) return;
    const was = !!popAt;
    popAt = { i, pt, kb, kind, from };
    renderPop();
    placePop();
    if (stage) stage.setHighlight(i);
    if (!was) {
      document.addEventListener('pointerdown', onPopDoc, true);
      document.addEventListener('keydown', onPopKey, true);
      addEventListener('resize', onPopResize);
    }
    if (kind === 'name') { const inp = pop.querySelector('input'); inp && (inp.focus({ preventScroll: true }), inp.select()); }
    else if (kb) { const on = pop.querySelector('.bd-fv-opt[aria-pressed=true]'); on && on.focus({ preventScroll: true }); }
  }
  function closeFacade(restore = false) {
    if (!popAt) return;
    const { kb, kind, from } = popAt;
    popAt = null;
    const had = pop.contains(document.activeElement);
    pop.hidden = true;
    pop.replaceChildren();
    if (stage) stage.setHighlight(null);
    document.removeEventListener('pointerdown', onPopDoc, true);
    document.removeEventListener('keydown', onPopKey, true);
    removeEventListener('resize', onPopResize);
    // 키보드로 열었으면 연 버튼으로 돌아간다
    if ((restore || had) && kb) {
      const btn = from === 'card' ? info.querySelector('.bd-fc-name') : kind === 'facade' ? strip.querySelector('.bd-floor-chip.is-on .bd-fv-act') : null;
      btn && btn.focus({ preventScroll: true });
    }
  }
  function onPopDoc(e) { if (!pop.contains(e.target) && !host.contains(e.target) && !e.target.closest?.('.bd-fv-act, .bd-fc-name')) closeFacade(); }
  function onPopKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeFacade(true); } }
  function onPopResize() { placePop(); }
  // 층 이름 바꾸기 — 비우면(또는 기본 간판과 같으면) 기본 이름으로
  function setName(i, v) {
    const f = b.floors[i];
    const name = String(v || '').trim().slice(0, 24);
    const next = name && name !== defaultSign(f) ? name : '';
    if ((f.name || '') === next) return false;
    if (next) f.name = next; else delete f.name;
    if (stage) stage.setSign(i, f.name);
    renderStrip(); updateInfo();
    lastKey = ''; updateLabels();
    save({ content: true });
    return true;
  }
  function renderName() {
    const { i } = popAt;
    const f = b.floors[i], def = defaultSign(f);
    const input = h('input', { class: 'bd-name-input', type: 'text', maxlength: '24', value: f.name || def, placeholder: def || '층 이름', 'aria-label': `${i + 1}층 이름` });
    const apply = () => { setName(i, input.value); closeFacade(true); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); apply(); } });
    pop.hidden = false;
    pop.setAttribute('aria-label', `${i + 1}층 이름 바꾸기`);
    pop.replaceChildren(
      h('div', { class: 'bd-fv-pop-head' },
        h('b', { class: 'num', text: i + 1 + 'F' }), h('strong', { text: '층 이름' }), h('small', { text: '외벽 간판' }),
        h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': '닫기', onclick: () => closeFacade(true) }, icon('x', 14))),
      input,
      h('div', { class: 'bd-name-acts' },
        f.name ? h('button', { type: 'button', class: 'bd-fc-link', onclick: () => { setName(i, ''); closeFacade(true); } }, def ? `기본(${def})으로` : '이름 지우기') : null,
        h('span', { class: 'bd-sp' }),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: apply }, '바꾸기')));
  }
  function renderPop() {
    if (popAt.kind === 'name') return renderName();
    const { i } = popAt;
    const f = b.floors[i], t = tplOf(f.tpl), s = shellOf(f);
    const vs = variantsOf(s.ind), fv = fvOf(f);
    const same = b.floors.filter((g, k) => k !== i && shellOf(g).ind === s.ind);
    const differ = same.some((g) => fvOf(g) !== fv);
    const sign = t && t.ind === s.ind && t.sign;
    const had = pop.contains(document.activeElement);
    pop.hidden = false;
    pop.setAttribute('aria-label', `${i + 1}층 외벽 고르기`);
    pop.replaceChildren(
      h('div', { class: 'bd-fv-pop-head' },
        h('b', { class: 'num', text: i + 1 + 'F' }), h('strong', { text: '외벽' }), h('small', { text: data().indName[s.ind] || s.ind }),
        h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': '닫기', onclick: () => closeFacade(true) }, icon('x', 14))),
      h('div', { class: 'bd-fv', role: 'group', 'aria-label': `${i + 1}층 외벽`, style: { gridTemplateColumns: `repeat(${vs.length === 4 ? 2 : Math.min(3, vs.length)},minmax(0,1fr))` } }, vs.map((v, k) => {
        const [c1, c2, c3] = swatchOf(v);
        return h('button', { type: 'button', class: 'bd-fv-opt', 'aria-pressed': String(k === fv), title: `${v.label} · 간판 ‘${sign || v.sign}’`, onclick: () => setFacade(i, k) },
          h('span', { class: 'bd-fv-sw', 'aria-hidden': 'true', style: { '--c1': c1, '--c2': c2, '--c3': c3 } }),
          h('span', { class: 'bd-fv-name', text: v.label }));
      })),
      ...(differ ? [h('button', { type: 'button', class: 'bd-fc-link bd-fv-all', onclick: () => setFacade(i, fv, true) }, `같은 업종 ${same.length}개 층에도 적용`)] : []));
    if (had) { const on = pop.querySelector('.bd-fv-opt[aria-pressed=true]'); on && on.focus({ preventScroll: true }); }
  }
  function placePop() {
    if (!popAt) return;
    const vw = view.clientWidth, vh = view.clientHeight, M = 12;
    // 좁은 화면은 아래(누른 곳이 아래쪽이면 위) 시트
    const sheet = vw < 560;
    pop.classList.toggle('is-sheet', sheet);
    pop.classList.toggle('is-top', sheet && !!popAt.pt && popAt.pt.y > vh * 0.5);
    if (sheet) { pop.style.left = pop.style.top = ''; return; }
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let x, y;
    if (popAt.from === 'card' && !info.hidden) {
      // 층 카드에서 열면 카드 왼쪽 위에
      x = info.offsetLeft - pw - 10;
      y = info.offsetTop;
    } else if (popAt.pt) {
      // 고르는 층을 가리지 않게 그 층 오른쪽(없으면 왼쪽)에, 누른 높이로. 자리가 없으면 누른 자리 옆에.
      // 오른쪽 층 카드도 가리지 않는다
      const right = info.hidden ? vw - M : Math.min(vw - M, info.offsetLeft - 10);
      const r = stage && stage.rectOf(popAt.i);
      if (r && r.right + 16 + pw <= right) x = r.right + 16;
      else if (r && r.left - 16 - pw >= M) x = r.left - 16 - pw;
      else { x = popAt.pt.x + 18; if (x + pw > right) x = popAt.pt.x - 18 - pw; }
      y = popAt.pt.y - 26;
    } else {
      const chip = strip.querySelector('.bd-floor-chip.is-on');
      x = chip ? chip.getBoundingClientRect().left - view.getBoundingClientRect().left : M;
      y = vh - ph - M;
    }
    pop.style.left = Math.round(Math.max(M, Math.min(x, vw - pw - M))) + 'px';
    pop.style.top = Math.round(Math.max(M, Math.min(y, vh - ph - M))) + 'px';
  }
  // 공간 채우기 · 바꾸기 · 비우기 — 층 크기에 맞는 공간만(건물 모양 그대로)
  function setTpl(i, tid) {
    const f = b.floors[i];
    if (tid && !fits(tplOf(tid), shellOf(f))) return;
    if ((f.tpl || null) === (tid || null)) return;
    f.tpl = tid || null;
    rebuild(i);
  }
  function pickSpace(i) {
    const f = b.floors[i], t = tplOf(f.tpl), s = shellOf(f);
    openPicker({ mode: 'fill', shell: s, ind: t ? t.ind : s.ind, current: f.tpl, floor: i + 1, onDone: ({ tpl }) => setTpl(i, tpl) });
  }

  // 층 정보 카드 — 공간(고르기 · 바꾸기 · 비우기) · 공간 목록 (외벽은 외벽을 눌러 고른다)
  function updateInfo() {
    const i = stage ? stage.focus : null;
    if (i === null || !b.floors[i]) { info.hidden = true; return; }
    const f = b.floors[i], t = tplOf(f.tpl), s = shellOf(f);
    const open = info.classList.contains('is-open');
    info.hidden = false;
    info.classList.toggle('is-empty', !t);
    info.replaceChildren(...[
      h('div', { class: 'bd-floor-card-head' },
        h('div', null, h('b', { class: 'num', text: i + 1 + 'F' }),
          h('button', { type: 'button', class: 'bd-fc-name', title: '이름 바꾸기', 'aria-label': `${i + 1}층 이름 바꾸기 — ${floorName(f)}`, 'aria-haspopup': 'dialog', onclick: () => (popAt && popAt.kind === 'name' ? closeFacade() : openName(i, null, true, 'card')) },
            h('strong', { text: floorName(f) }), icon('pencil', 13))),
        h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': '전체 건물 보기', onclick: () => focus(null) }, icon('x', 15))),
      h('p', { class: 'bd-floor-card-sub' }, h('span', { text: (t ? `${t.name} · ` : '') + `${sizeText(s)} · ${fmt(s.w * s.d)}㎡` + (t ? ` · 제품 ${t.productCount}대` : '') }),
        // 좁은 화면에선 공간 목록을 접어 둔다
        t && h('button', { type: 'button', class: 'bd-floor-card-more', 'aria-expanded': String(open), onclick: (e) => {
          const on = info.classList.toggle('is-open');
          e.currentTarget.setAttribute('aria-expanded', String(on));
          e.currentTarget.textContent = on ? '접기' : '공간 목록';
        } }, open ? '접기' : '공간 목록')),
      h('div', { class: 'bd-fc-sec bd-fc-space' }, t
        ? h('div', { class: 'bd-fc-acts' },
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => pickSpace(i) }, icon('grid', 14), '공간 바꾸기'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => setTpl(i, null) }, '비우기'))
        : h('button', { class: 'btn btn-primary bd-fc-fill', type: 'button', onclick: () => pickSpace(i) }, icon('plus', 15, 2.2), '공간 고르기')),
      t && h('div', { class: 'bd-fc-rooms' },
        h('span', { class: 'bd-fc-k' }, h('span', { text: `공간 ${t.rooms.length}` })),
        h('ol', null, t.rooms.map((r, k) => h('li', null,
          h('span', { class: 'num', text: String(k + 1).padStart(2, '0') }),
          h('span', null, h('b', { text: r[1] }), h('small', { text: (t.roomProducts[k] || []).slice(0, 2).map(([n, c]) => n.replace(/\s*\(.*?\)\s*/g, ' ').trim() + (c > 1 ? ' ×' + c : '')).join(' · ') || (r[7] ? '실외 공간' : '가구 중심 공간') }))))))].filter(Boolean));
  }

  // 이름표 — 층(왼쪽 바깥) · 초점 층의 공간
  let lastKey = '';
  function updateLabels() {
    if (!stage || !b) return;
    const { floors, rooms } = stage.anchors();
    const key = floors.map((a) => `${a.x | 0},${a.y | 0},${a.alpha > 0.5 ? 1 : 0}`).join('|') + '#' + rooms.map((r) => `${r.x | 0},${r.y | 0}`).join('|') + '#' + stage.focus;
    if (key === lastKey) return;
    lastKey = key;
    const W = stage.w;
    // 층을 고르면 층 이름은 정보 카드가 보여 주므로 공간 이름표만
    const fl = floors.filter(() => stage.focus === null).map((a) => {
      const t = tplOf(b.floors[a.i].tpl), name = floorName(b.floors[a.i]);
      const inside = a.x - 12 < 150; // 왼쪽에 자리가 없으면 모서리 오른쪽에
      const btn = h('button', { type: 'button', class: 'bd-floor-label' + (inside ? ' is-in' : '') + (a.alpha < 0.5 ? ' is-dim' : '') + (t ? '' : ' is-empty'), style: { left: (inside ? a.x + 12 : a.x - 12) + 'px', top: a.y + 'px' }, 'aria-label': `${a.i + 1}층 ${name} 자세히 보기`, onclick: () => focus(stage.focus === a.i ? null : a.i) },
        h('b', { class: 'num', text: a.i + 1 + 'F' }), h('span', { text: name }));
      return btn;
    });
    const rl = rooms.filter((r) => r.visible && r.x > 0 && r.x < W).map((r) => h('span', { class: 'bd-room-label', style: { left: r.x + 'px', top: r.y + 'px' } }, h('b', { class: 'num', text: String(r.k + 1).padStart(2, '0') }), r.name));
    labels.replaceChildren(...fl, ...rl);
  }

  function setMode(mode, animate = true) {
    closeFacade();
    extBtn.setAttribute('aria-pressed', String(mode === 'exterior'));
    spreadBtn.setAttribute('aria-pressed', String(mode === 'spread'));
    if (stage) stage.setSpread(mode === 'spread', animate);
    if (b && modeOf(b) !== mode) { b.view = { ...b.view, mode }; delete b.view.spread; save({ content: true }); }
  }
  extBtn.onclick = () => setMode('exterior');
  spreadBtn.onclick = () => setMode('spread');

  // 이름을 바꾸면 지붕 간판도 — 입력이 멈추면 한 번
  let titleT = 0;
  title.addEventListener('input', () => {
    if (!b) return;
    b.title = title.value.trim() || autoTitle(b.industries);
    save({ content: true });
    clearTimeout(titleT);
    titleT = setTimeout(() => stage && b && stage.setTitle(b.title), 350);
  });
  title.addEventListener('blur', () => { if (b) title.value = b.title; });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') title.blur(); });

  // 이미지 저장 — 지금 보이는 시점 그대로 2400px PNG
  async function savePng() {
    if (!stage || !b) return;
    const bg = getComputedStyle(view).getPropertyValue('--surface-2').trim() || '#f7f8fa';
    const blob = await stage.snapshot({ w: 2400, h: Math.round(2400 * stage.h / stage.w), type: 'image/png', background: bg });
    const name = fileBase(b.title) + '.png';
    const r = await saveBlob(blob, name);
    ctx.toast && ctx.toast(r.ok ? name + ' 저장했어요' : r.err, r.ok ? '' : 'warn');
  }
  // HTML 추출 — 이 건물만 담은 3D 보기 파일(브라우저로 열어 돌려 보기 · 펼쳐 보기 · 층 고르기)
  async function saveHtml() {
    if (!stage || !b) return;
    const src = document.getElementById('wm-bld-js');
    if (!src) { ctx.toast && ctx.toast('이 화면에서는 HTML로 내보낼 수 없어요', 'warn'); return; }
    const html = exportDoc({ js: src.textContent, cfg: { title: b.title, floors: items(b.floors), mode: modeOf(b), camera: stage.cameraState(), at: Date.now() } });
    const name = fileBase(b.title) + '.html';
    const r = await saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), name);
    ctx.toast && ctx.toast(r.ok ? name + ' 저장했어요' : r.err, r.ok ? '' : 'warn');
  }

  (async () => {
    b = await store.get(id);
    if (!alive) return;
    if (!b) {
      ctx.toast && ctx.toast('건물을 찾지 못했어요', 'warn');
      ctx.go({ name: 'building' });
      return;
    }
    b.view = b.view || {};
    const mode = modeOf(b);
    b.floors = (b.floors || []).map(normFloor).filter(Boolean).slice(0, MAX_FLOORS);
    title.value = b.title;
    updateSpec(); setSaved('saved');
    extBtn.setAttribute('aria-pressed', String(mode === 'exterior'));
    spreadBtn.setAttribute('aria-pressed', String(mode === 'spread'));
    renderStrip();
    await new Promise((r) => setTimeout(r, 30)); // 먼저 화면을 그리고
    if (!alive) return;
    try {
      // 외관 보기: 외벽을 누르면 외벽 고르기, 층 안 · 지붕을 누르면 그 층 보기. 빈 곳을 누르면 팝업만 닫는다
      stage = new Stage(host, {
        onFacadeClick: (i, pt) => openFacade(i, pt),
        onSignClick: (i, pt) => {
          if (i !== null) return openName(i, pt);
          closeFacade();
          title.focus({ preventScroll: true }); title.select(); // 지붕 간판 = 건물 이름
        },
        onFloorClick: (i) => { if (popAt) closeFacade(); if (i !== null) focus(stage.focus === i ? null : i); },
        onRender: updateLabels, onError: () => {},
      });
      host.__stage = stage; // 검사용(브라우저 자동 검사에서 간판 위치 찾기)
      stage.spread = mode === 'spread' ? 1 : 0;
      stage.setFloors(items(b.floors), { title: b.title });
      // 예전 판(펼쳐 보기 기본)에서 저장한 시점은 외관에 맞지 않아 쓰지 않는다
      const cam = b.view.mode ? b.camera || {} : {};
      stage.aim({ azimuth: cam.azimuth ?? 40, elevation: cam.elevation ?? (mode === 'spread' ? 30 : 22), i: null, zoom: cam.zoom || 1 }, false);
      if (!b.view.mode) b.view = { mode };
      stage.controls.addEventListener('end', () => {
        clearTimeout(camT);
        camT = setTimeout(() => { if (b && stage) { b.camera = stage.cameraState(); save(); } }, 900);
      });
      loading.remove();
      dl.enable();
      const hideHelp = () => { help.classList.add('is-gone'); host.removeEventListener('pointerdown', hideHelp); };
      host.addEventListener('pointerdown', hideHelp);
      setTimeout(hideHelp, 7000);
      // 테마가 바뀌면 대지 · 선 색을 다시
      const mq = matchMedia('(prefers-color-scheme: dark)');
      const onTheme = () => stage && stage.applyTheme();
      mq.addEventListener('change', onTheme);
      const mo = new MutationObserver(onTheme);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      disposers.push(() => { mq.removeEventListener('change', onTheme); mo.disconnect(); });
    } catch (e) {
      loading.replaceChildren(h('b', { text: '3D 건물을 그리지 못했어요' }), h('span', { text: e.message || String(e) }));
      loading.classList.add('is-error');
    }
  })();

  return {
    el,
    destroy() {
      alive = false;
      closeFacade();
      clearTimeout(saveT); clearTimeout(camT); clearTimeout(titleT);
      if (b) { store.put(b).catch(() => {}); if (dirtyThumb) { clearTimeout(thumbT); makeThumb(); } }
      disposers.forEach((f) => f());
      dl.destroy();
      if (stage) stage.dispose();
      stage = null;
    },
  };
}

// ---------- 붙이기 — 데이터를 푼 뒤에 화면을 연다 ----------
export function mount(root, opts) {
  const ctx = { go: opts.go, toast: opts.toast };
  root.classList.add('bd-page');
  let cur = null, curId, alive = true, booted = false, pending = null; // pending = { id } (목록이면 id 없음)
  root.replaceChildren(h('div', { class: 'bd-boot', role: 'status' }, h('span', { class: 'spin' }), '건물 조감도를 여는 중…'));
  ready().then(() => {
    booted = true;
    if (!pruned) { pruned = true; store.pruneCache(`@${CACHE_V}.${data().v}`); }
    if (alive && pending) show(pending.id);
  }, (e) => {
    if (alive) root.replaceChildren(h('div', { class: 'bd-boot is-error', role: 'alert' }, h('b', { text: '건물 조감도를 열지 못했어요' }), h('span', { text: e.message || String(e) })));
  });
  function show(id) {
    if (cur && curId === id) return;
    if (cur) { cur.destroy(); cur = null; }
    curId = id;
    root.classList.toggle('bd-studio-page', !!id);
    cur = id ? studioView(ctx, id) : listView(ctx);
    root.replaceChildren(cur.el);
    root.scrollTop = 0;
  }
  function route(id) {
    if (!booted) { pending = { id }; return; }
    show(id);
  }
  return {
    route,
    setGo(go, toast) { ctx.go = go; if (toast) ctx.toast = toast; },
    destroy() { alive = false; if (cur) cur.destroy(); cur = null; root.replaceChildren(); },
  };
}
