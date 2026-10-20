'use strict';
/* Winmate PoC 테스트 벤치 — 사이드바 탭마다 poc/test 모듈을 실행하고 결과를 검증하는 화면 */

// ------------------------------------------------------------------ helpers
const $ = (s, el = document) => el.querySelector(s);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const store = {
  get(k, d = null) { try { const v = sessionStorage.getItem('tb.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { sessionStorage.setItem('tb.' + k, JSON.stringify(v)); } catch (e) { /* 저장 못 해도 화면은 동작 */ } },
  del(k) { try { sessionStorage.removeItem('tb.' + k); } catch (e) { /* noop */ } },
};
async function api(path, opts = {}) {
  const o = { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers: {} };
  if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  const r = await fetch(path, o);
  if (r.status === 401) { location.href = '/login'; throw new Error('로그인이 필요합니다'); }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.detail) || `요청 실패 (${r.status})`);
  return data;
}
const fmt = {
  pct: (v) => (v === null || v === undefined ? '-' : `${(v * 100).toFixed(v >= 0.995 ? 0 : 1)}%`),
  n: (v) => (v === null || v === undefined ? '-' : Number(v).toLocaleString('ko-KR')),
  s: (v) => (v === null || v === undefined ? '-' : `${Number(v).toFixed(1)}초`),
  time: (t) => new Date(t * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  score: (v) => (v === null || v === undefined ? '-' : Number(v).toFixed(3)),
};
const LEVEL = { minimal: '① 요구 거의 없음', ambiguous: '② 요구 모호', complex: '③ 요구 복잡' };
const PRI = { must: '필수', should: '권장', could: '선택' };
const COND = { single: '통째로 1회', chunk_nocarry: '조각 · 맥락 없음', chunk_carry: '조각 · 맥락 이월', chunk_carry_gap: '조각 · 맥락 이월 + 갭 채우기 (권장)' };

function toast(msg, kind = 'fail') {
  const el = h('div', { class: `chip ${kind}`, role: 'status', style: { position: 'fixed', right: '20px', bottom: '20px', zIndex: 80, padding: '8px 14px', fontSize: '13px', whiteSpace: 'normal', maxWidth: '420px' } }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), 4200);
}
function panel(title, body, extra) {
  return h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('h2', null, title), extra || null), h('div', { class: 'pb' }, body));
}
function field(label, input, hint) {
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  input.id = input.id || id;
  return h('div', { class: 'field' }, h('label', { for: input.id }, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
}
function seg(options, value, onChange) {
  const el = h('div', { class: 'seg', role: 'group' });
  for (const [v, label] of options) {
    el.append(h('button', { type: 'button', 'aria-pressed': String(v === value), onclick: () => {
      el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
      el.querySelector(`[data-v="${v}"]`).setAttribute('aria-pressed', 'true');
      onChange(v);
    }, dataset: { v } }, label));
  }
  return el;
}
function select(options, value, onChange) {
  const el = h('select', { onchange: (e) => onChange(e.target.value) });
  for (const o of options) {
    if (o.group) {
      const g = h('optgroup', { label: o.group });
      for (const x of o.items) g.append(h('option', { value: x[0], selected: x[0] === value }, x[1]));
      el.append(g);
    } else el.append(h('option', { value: o[0], selected: o[0] === value }, o[1]));
  }
  return el;
}
function figs(items) {
  return h('div', { class: 'figs' }, items.filter(Boolean).map((x) => h('div', { class: `fig ${x.cls || ''}` }, h('div', { class: 'v' }, x.v), h('div', { class: 'k' }, x.k))));
}
function table(cols, rows, opts = {}) {
  const tb = h('tbody');
  rows.forEach((r, i) => {
    const tr = h('tr', { class: opts.onRow ? 'click' : null, onclick: opts.onRow ? () => { tb.querySelectorAll('tr').forEach((x) => x.classList.remove('sel')); tr.classList.add('sel'); opts.onRow(r, i); } : null });
    for (const c of cols) {
      const v = c.render ? c.render(r, i) : r[c.key];
      tr.append(h('td', { class: c.cls || null }, v === undefined || v === null ? '' : v));
    }
    tb.append(tr);
  });
  const t = h('table', { class: 't' }, h('thead', null, h('tr', null, cols.map((c) => h('th', { class: c.cls || null }, c.label)))), tb);
  const wrap = h('div', { class: 'tbl-wrap' }, t);
  if (opts.maxHeight) wrap.style.maxHeight = opts.maxHeight;
  if (!rows.length) wrap.append(h('div', { class: 'empty' }, opts.empty || '항목이 없습니다'));
  return wrap;
}
function chip(text, kind) { return h('span', { class: `chip ${kind || ''}` }, text); }
function section(title, sub, ...body) { return h('div', { class: 'sec' }, h('h3', null, title, sub ? h('span', { class: 'tiny' }, sub) : null), ...body); }
function scaleFrames(root) {
  const fit = () => root.querySelectorAll('[data-scale]').forEach((fr) => {
    const ifr = fr.querySelector('iframe');
    if (ifr) ifr.style.transform = `scale(${fr.clientWidth / 1280})`;
  });
  fit();
  if (!root._ro) {
    root._ro = new ResizeObserver(fit);
    root._ro.observe(root);
  }
}
const SLIDE_HEAD = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800&family=Manrope:wght@600;800&display=swap"><style>html,body{margin:0;padding:0;width:1280px;height:720px;overflow:hidden;background:#fff}</style></head><body>';
function slideFrame(html, src) {
  const ifr = h('iframe', { title: '슬라이드 미리보기', loading: 'lazy', sandbox: 'allow-same-origin', tabindex: '-1' });
  if (src) ifr.src = src; else ifr.srcdoc = SLIDE_HEAD + html + '</body></html>';
  return h('div', { class: 'frame', 'data-scale': '' }, ifr);
}

// ------------------------------------------------------------------ job watching
function watchJob(id, hd) {
  let since = 0; let stop = false;
  const tick = async () => {
    if (stop) return;
    try {
      const j = await api(`/api/jobs/${id}?since=${since}`);
      since = j.n_logs;
      hd.onTick && hd.onTick(j);
      if (['done', 'error', 'waiting'].includes(j.status)) { hd.onEnd && hd.onEnd(j); return; }
    } catch (e) {
      if (/작업이 없습니다/.test(e.message)) { if (hd.onGone) hd.onGone(); else if (hd.onEnd) hd.onEnd({ status: 'error', error: '지난 작업이 서버에 없습니다(서버를 다시 켜면 지워집니다) — 다시 실행하세요' }); return; }
      hd.onFail && hd.onFail(e); return;
    }
    setTimeout(tick, 900);
  };
  tick();
  return { stop() { stop = true; } };
}
function consoleBox(open) {
  const pre = h('div', { class: 'console', 'aria-live': 'polite' });
  const det = h('details', { class: 'log', open: open || null }, h('summary', null, '실행 로그'), pre);
  det.append = (logs) => {
    for (const l of logs) pre.append(h('div', { class: l.level === 'error' ? 'e' : null }, h('span', { class: 't' }, `${l.t}s`), l.msg));
    pre.scrollTop = pre.scrollHeight;
  };
  det.clear = () => { pre.textContent = ''; };
  return det;
}
function rail(stages) {
  const el = h('div', { class: 'rail', role: 'list' });
  const items = stages.map((s) => {
    const st = h('div', { class: 'st' }, '대기');
    const node = h('div', { class: 'stage', role: 'listitem' }, h('div', { class: 'nm' }, s.label), st);
    el.append(node);
    return { ...s, node, st };
  });
  el.set = (key, state, note) => {
    const it = items.find((x) => x.key === key);
    if (!it) return;
    it.node.className = `stage ${state}`;
    it.st.textContent = note || { done: '완료', running: '진행 중', waiting: '답 필요', error: '오류', skip: '해당 없음', idle: '대기' }[state] || state;
  };
  el.reset = () => items.forEach((it) => el.set(it.key, 'idle'));
  el.advance = (key, note) => {
    const idx = items.findIndex((x) => x.key === key);
    items.forEach((it, i) => {
      if (i < idx && !it.node.classList.contains('skip') && !it.node.classList.contains('done')) el.set(it.key, 'done');
    });
    el.set(key, 'running', note);
  };
  el.finish = () => items.forEach((it) => { if (!it.node.classList.contains('skip')) el.set(it.key, 'done'); });
  el.fail = () => { const cur = items.find((it) => it.node.classList.contains('running')); if (cur) el.set(cur.key, 'error'); };
  return el;
}

// ------------------------------------------------------------------ shell
const main = $('#main');
const ROUTES = {};
let STATUS = null;
async function loadStatus() {
  try {
    STATUS = await api('/api/status');
    const keys = $('#keys');
    keys.textContent = '';
    for (const [k, v] of Object.entries(STATUS.keys)) keys.append(h('span', { class: `key ${v ? 'on' : ''}`, title: v ? '설정됨' : '없음' }, k.replace('_API_KEY', '').replace('_MODEL', ' 모델')));
  } catch (e) { /* 상태를 못 읽어도 탭은 연다 */ }
  try { const me = await api('/api/me'); $('#who').textContent = `${me.user} 로 로그인됨`; } catch (e) { /* noop */ }
}
$('#logout').addEventListener('click', async () => { await api('/api/logout', { body: {} }); location.href = '/login'; });
async function navDots() {
  try {
    const jobs = await api('/api/jobs');
    document.querySelectorAll('[data-dot]').forEach((d) => {
      const kind = d.dataset.dot;
      const j = jobs.find((x) => x.kind === kind && (x.status === 'running' || x.status === 'waiting' || x.status === 'queued'));
      d.className = `dot ${j ? (j.status === 'waiting' ? 'waiting' : 'running') : ''}`;
    });
  } catch (e) { /* noop */ }
  setTimeout(navDots, 3000);
}
function route() {
  const path = (location.hash || '#/home').slice(2).split('?')[0];
  document.querySelectorAll('#nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.route === path ? 'page' : 'false'));
  main.textContent = '';
  (ROUTES[path] || ROUTES.home)(main);
  main.focus && window.scrollTo(0, 0);
}
function head(title, desc, extra) {
  return h('div', { class: 'head' }, h('div', null, h('h1', null, title), desc ? h('p', null, desc) : null), extra || null);
}

// ------------------------------------------------------------------ 상태(홈)
ROUTES.home = async (el) => {
  el.append(head('상태', 'poc/test 아래 모듈과 API 키 상태입니다. 왼쪽 탭에서 모듈을 골라 실행하고 결과를 확인하세요.'));
  const box = h('div', { class: 'stack' }, h('div', { class: 'empty' }, '불러오는 중'));
  el.append(box);
  await loadStatus();
  box.textContent = '';
  if (!STATUS) { box.append(h('div', { class: 'empty' }, h('b', null, '서버 상태를 읽지 못했습니다'), '서버 창의 오류를 확인하세요')); return; }
  const m = STATUS.modules;
  box.append(figs([
    { k: 'Gemini 키', v: STATUS.keys.GEMINI_API_KEY ? '있음' : '없음', cls: STATUS.keys.GEMINI_API_KEY ? 'good' : 'bad' },
    { k: 'Tavily 키', v: STATUS.keys.TAVILY_API_KEY ? '있음' : '없음', cls: STATUS.keys.TAVILY_API_KEY ? 'good' : 'mid' },
    { k: 'RFP 모듈', v: m.rfp.ok ? '준비됨' : '없음', cls: m.rfp.ok ? 'good' : 'bad' },
    { k: '레이아웃 Agent', v: m.layout.ok ? '준비됨' : '오류', cls: m.layout.ok ? 'good' : 'bad' },
    { k: '전략 코파일럿(deepagents)', v: m.layout.deepagents ? '사용 가능' : '없음', cls: m.layout.deepagents ? 'good' : 'mid' },
    m.sim ? { k: '제안 시뮬레이션(Node)', v: m.sim.ok ? '준비됨' : '없음', cls: m.sim.ok ? 'good' : 'mid' } : null,
    { k: 'Python', v: STATUS.python },
  ]));
  if (!m.layout.ok) box.append(h('div', { class: 'chip fail', style: { whiteSpace: 'normal' } }, `레이아웃 Agent 를 불러오지 못했습니다 — ${m.layout.error}`));
  const cards = [
    ['#/rfp/run', 'RFP → 요구사항 정리', '입찰 원문을 조각으로 나눠 읽고(맥락 이월) 사업별 Winmate 입력 폼을 만듭니다. 체크포인트 대조 · 근거 인용 · 원문에 없는 숫자를 확인합니다.'],
    ['#/layout/run', '레이아웃 추천 Agent', '요구 분석 → 맥락 판정(①②③) → 시나리오 · 분해 → 전략 질문 → storyboard → 레이아웃 설계 → 값 입력. 슬라이드를 바로 미리 봅니다.'],
    ['#/layout/search', '레이아웃 검색(RAG)', '메타데이터 + 하이브리드 검색으로 레이아웃 후보와 점수 근거를 봅니다.'],
    ['#/sim/live', '제안 시뮬레이션 실성능 검증', '고객 페르소나 × Best Scenario 스토리라인으로 실제 LLM 멀티턴 미팅을 돌리고, 턴마다 만족도 · 제안 품질 · 숨은 우려 변화를 실시간으로 봅니다.'],
    ['#/tests', '자동 테스트', '두 모듈의 단위 테스트를 돌리고 통과 · 실패를 봅니다.'],
  ];
  box.append(h('div', { class: 'suites' }, cards.map(([href, t, d]) => h('a', { href, class: 'panel', style: { textDecoration: 'none', color: 'inherit' } }, h('div', { class: 'pb' }, h('b', null, t), h('p', { class: 'muted small', style: { margin: '6px 0 0' } }, d))))));
  box.append(section('최근 작업', null, jobsTable(STATUS.jobs)));
  box.append(h('p', { class: 'tiny' }, `테스트 폴더 ${STATUS.test_dir} · 포트 ${STATUS.port}`));
};
function jobsTable(jobs) {
  const ST = { done: ['완료', 'pass'], error: ['오류', 'fail'], running: ['실행 중', 'blue'], queued: ['대기', ''], waiting: ['답 필요', 'turn'] };
  return table([
    { label: '시작', render: (j) => fmt.time(j.created), cls: 'nw' },
    { label: '작업', key: 'title' },
    { label: '상태', render: (j) => chip(...(ST[j.status] || [j.status])) },
    { label: '걸린 시간', render: (j) => fmt.s(j.elapsed), cls: 'num' },
  ], jobs, { onRow: openJob, empty: '아직 실행한 작업이 없습니다' });
}
function openJob(j) {
  if (j.kind === 'layout') { store.set('layout.job', j.id); location.hash = '#/layout/run'; }
  else if (j.kind === 'rfp') { store.set('rfp.job', j.id); location.hash = '#/rfp/run'; }
  else if (j.kind === 'selftest') { location.hash = '#/tests'; }
  else if (j.kind === 'eval') { store.set('eval.job', j.id); location.hash = '#/layout/eval'; }
  else if (j.kind === 'experiment') { store.set('rfpbatch.job', j.id); location.hash = '#/rfp/batch'; }
  else if (j.kind === 'sim') { store.set('sim.job', j.id); location.hash = '#/sim/live'; }
}
ROUTES.jobs = async (el) => {
  el.append(head('작업 기록', '이 서버가 켜진 뒤 실행한 작업입니다. 누르면 그 결과 화면으로 갑니다. 서버를 다시 켜면 지워집니다.'));
  const box = h('div');
  el.append(box);
  const load = async () => { box.textContent = ''; box.append(jobsTable(await api('/api/jobs'))); };
  el.querySelector('.head').append(h('button', { class: 'btn', onclick: load }, '새로 고침'));
  await load();
};

// ------------------------------------------------------------------ RFP → 요구사항 정리
const RFP = { tcs: null, mode: 'tc', tc: 'TC3', text: '', cond: 'chunk_carry_gap', mc: 1500, backend: 'gemini', enrich: false, save: false };
const RFP_STAGES = [{ key: 'profile', label: '문서 지도 · 사업 파악' }, { key: 'extract', label: '조각 읽기 · 원장' }, { key: 'consolidate', label: '사업별 키맨 정리' }, { key: 'guard', label: '근거 · 수치 검증' }];

ROUTES['rfp/run'] = async (el) => {
  el.append(head('RFP → 요구사항 정리', '입찰 원문을 넣으면 사업별 Winmate 고객 요구사항 입력 폼(키맨별 [분류] 요구 · 자유형식 요약 · 제작자 의견)을 만듭니다.'));
  if (!RFP.tcs) RFP.tcs = await api('/api/rfp/tcs').catch((e) => { toast(e.message); return []; });
  if (!STATUS) await loadStatus();
  const right = h('div', { class: 'stack' });
  const rl = rail(RFP_STAGES);
  const con = consoleBox(true);
  const out = h('div');
  right.append(rl, con, out);

  // ---- 입력 폼
  const srcBox = h('div');
  const tcSel = select(RFP.tcs.map((t) => [t.id, `${t.id} · ${t.title} (${(t.chars / 1000).toFixed(1)}천 자)`]), RFP.tc, (v) => { RFP.tc = v; drawSrc(); });
  const ta = h('textarea', { rows: 10, placeholder: 'RFP · 입찰공고 원문을 붙여 넣거나 아래에서 파일을 고르세요 (.txt · .md)' }, RFP.text);
  ta.addEventListener('input', () => { RFP.text = ta.value; });
  const file = h('input', { type: 'file', accept: '.txt,.md,.markdown,.csv', onchange: async (e) => { const f = e.target.files[0]; if (f) { ta.value = RFP.text = await f.text(); } } });
  function drawSrc() {
    srcBox.textContent = '';
    if (RFP.mode === 'tc') {
      const t = RFP.tcs.find((x) => x.id === RFP.tc);
      srcBox.append(field('테스트 케이스', tcSel, t ? `사업 ${t.projects}개 · 정답 체크포인트 ${t.checkpoints}개 · ${t.source_file}` : ''));
      const pv = h('details', null, h('summary', { class: 'small muted', style: { cursor: 'pointer' } }, '원문 보기'));
      pv.addEventListener('toggle', async () => { if (pv.open && !pv._l) { pv._l = 1; const d = await api(`/api/rfp/tcs/${RFP.tc}`); pv.append(h('div', { class: 'source', style: { maxHeight: '260px', marginTop: '6px' } }, d.input)); } });
      srcBox.append(pv);
    } else srcBox.append(field('원문', ta, '정답이 없으므로 체크포인트 대조 없이 정리 · 근거 · 수치 검증만 합니다'), file);
  }
  drawSrc();
  const mcIn = h('input', { type: 'number', min: 600, max: 8000, step: 100, value: RFP.mc, oninput: (e) => { RFP.mc = Number(e.target.value); } });
  const runBtn = h('button', { class: 'btn primary wide', type: 'button', onclick: run }, '정리 실행');
  const form = h('div', null,
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, '입력'), seg([['tc', '테스트 케이스'], ['text', '직접 입력']], RFP.mode, (v) => { RFP.mode = v; drawSrc(); })),
    srcBox, h('hr', { class: 'sep' }),
    field('읽는 방식', select(Object.entries(COND), RFP.cond, (v) => { RFP.cond = v; }), '긴 문서는 조각으로 나눠 읽고, 앞 조각의 맥락(사업 목록 · 원장 · 이월 메모)을 넘겨야 세부가 빠지지 않습니다'),
    field('조각 크기(글자)', mcIn, '권장 1500 — 작을수록 촘촘하지만 호출이 늘어납니다'),
    field('LLM 백엔드', select([['gemini', 'Gemini (실제 호출)'], ['replay', '기록 재생 — 같은 입력이면 저장된 응답(무료)'], ['rules', '규칙만 — LLM 없음(기준선)']], RFP.backend, (v) => { RFP.backend = v; })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: RFP.enrich, onchange: (e) => { RFP.enrich = e.target.checked; } }), h('span', null, '인증 · 법 조항 출처 수집 (Tavily)')),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: RFP.save, onchange: (e) => { RFP.save = e.target.checked; } }), h('span', null, 'results 폴더에 저장')),
    runBtn);
  el.append(h('div', { class: 'split' }, h('div', { class: 'sticky' }, panel('입력 · 조건', form)), right));
  out.append(h('div', { class: 'empty' }, h('b', null, '아직 결과가 없습니다'), '왼쪽에서 원문과 조건을 고르고 정리 실행을 누르세요'));

  let watcher = null;
  function follow(id) {
    watcher && watcher.stop();
    rl.reset(); con.clear();
    out.textContent = '';
    out.append(h('div', { class: 'empty' }, '실행 중 — 단계가 끝날 때마다 위 막대가 바뀝니다'));
    runBtn.disabled = true;
    watcher = watchJob(id, {
      onTick: (j) => {
        con.append(j.logs);
        for (const l of j.logs) {
          if (l.msg.startsWith('profile')) rl.advance('profile');
          else if (l.msg.startsWith('extract') || l.msg.startsWith('gapfill')) rl.advance('extract', l.msg.split(' · ').slice(0, 2).join(' · '));
          else if (l.msg.startsWith('consolidate')) rl.advance('consolidate');
          else if (l.msg.startsWith('완료')) rl.advance('guard');
        }
      },
      onEnd: (j) => {
        runBtn.disabled = false;
        out.textContent = '';
        if (j.status === 'error') { rl.fail(); out.append(errorBox(j.error)); return; }
        rl.finish();
        out.append(renderRfpResult(j.result));
      },
      onFail: (e) => { runBtn.disabled = false; toast(e.message); },
      onGone: () => { runBtn.disabled = false; store.del('rfp.job'); rl.reset(); out.textContent = ''; out.append(h('div', { class: 'empty' }, h('b', null, '지난 작업이 서버에 없습니다'), '서버를 다시 켜면 작업 기록이 지워집니다 — 다시 실행하세요')); },
    });
  }
  async function run() {
    if (RFP.mode === 'text' && RFP.text.trim().length < 50) { toast('원문을 50자 이상 넣으세요'); return; }
    if (RFP.backend === 'gemini' && STATUS && !STATUS.keys.GEMINI_API_KEY) { toast('poc/.env 에 GEMINI_API_KEY 가 없습니다'); return; }
    try {
      const r = await api('/api/rfp/run', { body: { source: RFP.mode, tc_id: RFP.tc, text: RFP.text, condition: RFP.cond, max_chars: RFP.mc, backend: RFP.backend, enrich: RFP.enrich, save: RFP.save } });
      store.set('rfp.job', r.job);
      follow(r.job);
    } catch (e) { toast(e.message); }
  }
  const last = store.get('rfp.job');
  if (last) follow(last);
};
function errorBox(msg) {
  return h('div', { class: 'panel' }, h('div', { class: 'pb' }, h('b', { style: { color: 'var(--fail)' } }, '실행하지 못했습니다'), h('div', { class: 'source', style: { marginTop: '8px' } }, msg || '알 수 없는 오류')));
}

function renderRfpResult(r) {
  const el = h('div');
  const m = r.meta || {};
  const g = r.guards || {};
  const unsup = Object.values(g.unsupported_numbers || {}).reduce((a, b) => a + b.length, 0);
  const sc = r.score;
  el.append(h('p', { class: 'muted small', style: { margin: '0 0 10px' } }, `${m.title || ''} — ${COND[m.condition] || m.condition} · 조각 ${m.max_chars}자 · ${m.backend} ${m.model || ''}` + (m.saved ? ` · 저장 ${m.saved}` : '')));
  el.append(figs([
    sc && { k: '체크포인트 반영률', v: fmt.pct(sc.recall), cls: sc.recall >= 0.95 ? 'good' : sc.recall >= 0.85 ? 'mid' : 'bad' },
    sc && { k: '사업 분리', v: `${sc.projects_matched}/${sc.projects_expected}`, cls: sc.projects_matched === sc.projects_expected ? 'good' : 'bad' },
    sc && sc.projects_expected > 1 && { k: '다른 사업에 잘못 들어감', v: sc.misattributed, cls: sc.misattributed ? 'bad' : 'good' },
    { k: '추출 항목', v: fmt.n(g.items) },
    { k: '근거 인용 확인', v: fmt.pct(g.grounded_rate), cls: g.grounded_rate >= 0.95 ? 'good' : 'mid' },
    { k: '원문에 없는 숫자', v: unsup, cls: unsup ? 'bad' : 'good' },
    { k: 'LLM 호출', v: `${fmt.n(r.cost.calls)}회` + (r.cost.cached ? ` (캐시 ${r.cost.cached})` : '') },
    { k: '토큰', v: fmt.n(r.cost.prompt_tokens + r.cost.output_tokens) },
    { k: '시간', v: fmt.s(r.cost.ms / 1000) },
  ]));
  if (r.cost.errors && r.cost.errors.length) el.append(h('div', { class: 'chip fail', style: { whiteSpace: 'normal', marginTop: '8px' } }, '호출 오류: ' + r.cost.errors.join(' / ')));

  // 사업별 입력 폼
  const forms = section('Winmate 고객 요구사항 입력 폼', `사업 ${r.forms.length}개 — 본문은 원장에서 그대로 조립(LLM 은 배정 · 병합 · 요약만)`);
  for (const f of r.forms) {
    const card = h('div', { class: 'form-card' });
    const toLayout = h('button', { class: 'btn', type: 'button', onclick: async () => {
      try {
        const inp = await api('/api/rfp/to-layout', { body: { form: f, source: r.source || '', title: f.project } });
        store.set('layout.pending', inp);
        location.hash = '#/layout/run';
      } catch (e) { toast(e.message); }
    } }, '이 폼으로 레이아웃 Agent 실행');
    card.append(h('div', { class: 'fh' }, h('div', null, h('b', null, f.project || '(사업명 없음)'), h('div', { class: 'small muted' }, `고객사 ${f.customer || '-'} · 최종 제안 대상 ${f.target || '-'} · ${f.pid}`)), toLayout));
    for (const k of f.keymen) {
      card.append(h('div', { class: 'keyman' },
        h('div', { class: 'kn' }, k.name, chip(`가중치 ${k.weight}`, 'blue'), k.weight_basis ? h('span', { class: 'tiny' }, k.weight_basis) : null),
        h('ul', null, k.reqs.map((q) => { const mm = q.match(/^\[([^\]]+)\]\s*(.*)$/); return h('li', null, mm ? [h('span', { class: 'cat' }, `[${mm[1]}]`), mm[2]] : q); }))));
    }
    if (f.free) card.append(h('div', { class: 'prose' }, h('b', null, '자유형식 요약'), f.free));
    if (f.note) card.append(h('div', { class: 'prose' }, h('b', null, '제작자 의견'), f.note));
    forms.append(card);
  }
  el.append(forms);

  // 체크포인트
  if (sc) {
    const s = section('정답 체크포인트 대조', '공백을 없앤 출력에서 정규식으로 찾음 · 맞는 사업 안에서만 인정');
    for (const p of sc.per_project) {
      s.append(h('div', { class: 'row', style: { margin: '8px 0 6px' } }, h('b', null, p.key), chip(`반영 ${fmt.pct(p.recall)}`, p.recall >= 0.95 ? 'pass' : 'warn'), chip(`요약까지 ${fmt.pct(p.recall_with_summary)}`), p.matched_pid ? chip(`출력 사업 ${p.matched_pid}`) : chip('출력 사업 없음', 'fail')));
      s.append(table([
        { label: 'ID', key: 'id', cls: 'nw' }, { label: '분류', key: 'cat', cls: 'nw' }, { label: '내용', key: 'desc' },
        { label: '폼에 있음', render: (x) => chip(x.hit ? '있음' : '없음', x.hit ? 'pass' : 'fail') },
        { label: '요약에만', render: (x) => (!x.hit && x.hit_with_summary ? chip('요약에만', 'warn') : '') },
        { label: '다른 사업', render: (x) => (x.misattributed ? chip('잘못 들어감', 'fail') : '') },
      ], p.rows, { maxHeight: '320px' }));
    }
    el.append(s);
  }

  // 원장 + 원문 근거
  const srcView = h('div', { class: 'source' }, r.source || '(원문 없음)');
  const showQuote = (it) => {
    srcView.textContent = r.source || '';
    const q = (it.quote || '').trim();
    if (!q || !r.source) return;
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    let mt = null;
    try { mt = new RegExp(esc).exec(r.source) || new RegExp(esc.slice(0, Math.min(esc.length, 40))).exec(r.source); } catch (e) { mt = null; }
    if (!mt) { toast('원문에서 이 인용을 그대로 찾지 못했습니다(근거 확인 안 됨)', 'warn'); return; }
    const a = mt.index; const b = a + mt[0].length;
    srcView.textContent = '';
    const mark = h('mark', null, r.source.slice(a, b));
    srcView.append(r.source.slice(0, a), mark, r.source.slice(b));
    mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  let flt = 'all'; let qtxt = '';
  const ledgerBox = h('div');
  const drawLedger = () => {
    ledgerBox.textContent = '';
    const rows = r.items.filter((it) => (flt === 'all' || !it.grounded) && (!qtxt || (it.text + ' ' + (it.quote || '')).includes(qtxt)));
    ledgerBox.append(table([
      { label: 'ID', key: 'id', cls: 'nw' }, { label: '사업', key: 'pid', cls: 'nw' }, { label: '분류', key: 'cat', cls: 'nw' }, { label: '강도', key: 'modality', cls: 'nw' },
      { label: '요구', key: 'text' }, { label: '근거 인용', render: (x) => h('span', { class: 'small muted' }, x.quote || '') },
      { label: '근거', render: (x) => chip(x.grounded ? '확인' : '못 찾음', x.grounded ? 'pass' : 'fail') }, { label: '조각', key: 'chunk', cls: 'num' },
    ], rows, { onRow: showQuote, maxHeight: '420px' }));
  };
  drawLedger();
  el.append(section('추출 원장', `${r.items.length}개 — 행을 누르면 아래 원문에서 근거 위치를 표시합니다`,
    h('div', { class: 'row', style: { marginBottom: '8px' } }, seg([['all', '전체'], ['ungrounded', '근거 못 찾은 것만']], flt, (v) => { flt = v; drawLedger(); }),
      h('input', { type: 'text', placeholder: '요구 · 인용에서 찾기', style: { maxWidth: '260px' }, oninput: (e) => { qtxt = e.target.value.trim(); drawLedger(); } })),
    ledgerBox));
  el.append(section('원문 · 근거 위치', null, srcView));

  // 조각 · 맥락 이월
  const ex = (r.trace || []).filter((t) => t.stage === 'extract');
  if (ex.length) {
    el.append(section('조각별 진행 · 맥락 이월', '이월 메모와 미해결 참조가 다음 조각으로 넘어갑니다', table([
      { label: '조각', key: 'chunk', cls: 'num' }, { label: '제목 경로', key: 'path' }, { label: '글자', key: 'chars', cls: 'num' },
      { label: '새 항목', key: 'new', cls: 'num' }, { label: '보강', key: 'updates', cls: 'num' },
      { label: '갭 채우기', render: (t) => (t.gap_lines !== undefined ? `${t.gap_lines}줄 → ${t.gap_new || 0}개` : '-'), cls: 'nw' },
      { label: '이월 메모', render: (t) => h('span', { class: 'small' }, t.carry || '') },
      { label: '미해결 참조', render: (t) => (t.open_refs || []).map((x) => chip(x)) },
    ], ex, { maxHeight: '380px' })));
  }
  const pf = r.profile || {};
  if (pf.projects) {
    el.append(section('문서 지도로 파악한 사업', pf.doc_type || null, table([
      { label: 'ID', key: 'pid' }, { label: '사업명', key: 'name' }, { label: '고객사', key: 'customer' }, { label: '시작 줄', key: 'start_line', cls: 'num' },
      { label: '담당', render: (p) => (p.contacts || []).map((c) => chip(`${c.dept || ''} ${c.duty || ''}`.trim())) },
    ], pf.projects)));
  }
  if (r.enrich && r.enrich.length) {
    el.append(section('출처 수집(Tavily)', '요구 본문에는 섞지 않음', table([
      { label: '용어', key: 'term', cls: 'nw' }, { label: '요약', render: (x) => x.error || x.answer || '' },
      { label: '출처', render: (x) => (x.sources || []).map((s) => h('div', null, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title || s.url))) },
    ], r.enrich)));
  }
  return el;
}

// ---- 저장된 실험
ROUTES['rfp/runs'] = async (el) => {
  el.append(head('저장된 실험 결과', 'poc/test/results 아래 실행 기록입니다. 실행 → TC × 조건 → 상세 순서로 열어 봅니다.'));
  const list = h('div'); const rowsBox = h('div'); const detail = h('div');
  el.append(list, rowsBox, detail);
  const runs = await api('/api/rfp/runs').catch((e) => { toast(e.message); return []; });
  const open = async (run) => {
    store.set('rfp.run', run.run_id);
    rowsBox.textContent = ''; detail.textContent = '';
    const d = await api(`/api/rfp/runs/${encodeURIComponent(run.run_id)}`);
    const meta = d.meta || {};
    rowsBox.append(section(`${run.run_id}`, `${meta.backend || ''} · ${meta.model || ''} · 프롬프트 ${meta.prompt_version || '-'}`, table([
      { label: 'TC', key: 'tc', cls: 'nw' }, { label: '조건', render: (x) => `${x.cond}@${x.max_chars}`, cls: 'nw' },
      { label: '반영률', render: (x) => fmt.score(x.recall), cls: 'num' }, { label: '+요약', render: (x) => fmt.score(x.recall_with_summary), cls: 'num' },
      { label: '사업', key: 'projects', cls: 'nw' }, { label: '잘못 귀속', key: 'misattributed', cls: 'num' }, { label: '항목', key: 'items', cls: 'num' },
      { label: '근거', render: (x) => fmt.pct(x.grounded), cls: 'num' }, { label: '없는 숫자', key: 'unsupported_nums', cls: 'num' },
      { label: '호출', key: 'calls', cls: 'num' }, { label: '놓친 체크포인트', render: (x) => h('span', { class: 'small muted' }, (x.missed || []).slice(0, 4).join(' / ')) },
      { label: '', render: (x) => (x.has_detail ? chip('상세', 'blue') : '') },
    ], d.rows || [], { onRow: async (x) => {
      if (!x.has_detail) { toast('이 행은 상세 결과 파일이 없습니다', 'warn'); return; }
      detail.textContent = '';
      detail.append(h('div', { class: 'empty' }, '불러오는 중'));
      const full = await api(`/api/rfp/runs/${encodeURIComponent(run.run_id)}/${x.tc}/${encodeURIComponent(x.cond + '@' + x.max_chars)}`);
      detail.textContent = '';
      detail.append(section('상세', `${x.tc} · ${x.cond}@${x.max_chars}`, renderRfpResult(full)));
      detail.scrollIntoView({ behavior: 'smooth' });
    } })));
  };
  list.append(table([
    { label: '실행', key: 'run_id' }, { label: '백엔드', key: 'backend' }, { label: '모델', key: 'model' }, { label: '프롬프트', key: 'prompt_version' },
    { label: '행', key: 'n', cls: 'num' }, { label: '평균 반영률', render: (x) => fmt.score(x.recall), cls: 'num' },
  ], runs, { onRow: open, maxHeight: '300px', empty: 'results 폴더에 summary.json 이 있는 실행이 없습니다' }));
  const keep = store.get('rfp.run');
  const k = runs.find((x) => x.run_id === keep);
  if (k) open(k);
};

// ---- 배치 실험
ROUTES['rfp/batch'] = async (el) => {
  el.append(head('RFP 배치 실험', 'run_experiment.py 를 그대로 돌립니다 — TC × 조건 × 조각 크기 표와 놓친 체크포인트를 results 에 저장합니다.'));
  if (!RFP.tcs) RFP.tcs = await api('/api/rfp/tcs').catch(() => []);
  const st = { backend: 'replay', conds: ['chunk_carry_gap'], tcs: RFP.tcs.map((t) => t.id), mc: '1500', rpm: 30, enrich: false };
  const conds = h('div', null, Object.entries(COND).map(([k, v]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.conds.includes(k), onchange: (e) => { st.conds = e.target.checked ? [...st.conds, k] : st.conds.filter((x) => x !== k); } }), v)));
  const tcs = h('div', null, RFP.tcs.map((t) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { st.tcs = e.target.checked ? [...st.tcs, t.id] : st.tcs.filter((x) => x !== t.id); } }), `${t.id} · ${t.title}`)));
  const con = consoleBox(true); const res = h('div');
  const btn = h('button', { class: 'btn primary wide', onclick: async () => {
    if (!st.conds.length || !st.tcs.length) { toast('조건과 TC 를 하나 이상 고르세요'); return; }
    if (st.backend === 'gemini' && !confirm(`Gemini 로 ${st.tcs.length}개 TC × ${st.conds.length}개 조건을 호출합니다. 진행할까요?`)) return;
    const r = await api('/api/rfp/experiment', { body: { backend: st.backend, conds: st.conds, tcs: st.tcs, max_chars: st.mc.split(',').map((x) => parseInt(x, 10)).filter(Boolean), rpm: st.rpm, enrich: st.enrich } }).catch((e) => toast(e.message));
    if (r) { store.set('rfpbatch.job', r.job); follow(r.job); }
  } }, '실험 실행');
  el.append(h('div', { class: 'split' }, h('div', { class: 'sticky' }, panel('조건', h('div', null,
    field('LLM 백엔드', select([['replay', '기록 재생(무료)'], ['rules', '규칙만'], ['gemini', 'Gemini']], st.backend, (v) => { st.backend = v; })),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, '읽는 방식'), conds),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, '테스트 케이스'), tcs),
    field('조각 크기', h('input', { type: 'text', value: st.mc, oninput: (e) => { st.mc = e.target.value; } }), '쉼표로 여러 개 (예: 1500,3000)'),
    field('분당 호출 상한', h('input', { type: 'number', value: st.rpm, min: 1, max: 120, oninput: (e) => { st.rpm = Number(e.target.value); } }), '무료 등급이면 10~15'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { st.enrich = e.target.checked; } }), '출처 수집(Tavily)'), btn))), h('div', { class: 'stack' }, con, res)));
  function follow(id) {
    con.clear(); res.textContent = ''; btn.disabled = true;
    watchJob(id, {
      onTick: (j) => con.append(j.logs),
      onEnd: (j) => {
        btn.disabled = false;
        if (j.status === 'error') { res.append(errorBox(j.error)); return; }
        const r = j.result;
        res.append(figs([{ k: '종료 코드', v: r.returncode, cls: r.returncode ? 'bad' : 'good' }, { k: '걸린 시간', v: fmt.s(r.seconds) }]),
          h('p', null, h('a', { href: '#/rfp/runs', onclick: () => store.set('rfp.run', r.run_id) }, `저장된 실험 결과에서 ${r.run_id} 열기`)));
      },
    });
  }
  const last = store.get('rfpbatch.job');
  if (last) follow(last);
};

// ------------------------------------------------------------------ 레이아웃 Agent
const LAY = { cases: null, cat: null, mode: 'tc', set: 'cases', id: 'C04_L3', llm: 'offline', interactive: true, maxSlides: '', input: null, custom: null };
const LAY_STAGES = [
  { key: 'analyze', label: '요구사항 분석' }, { key: 'match', label: '맥락별 매칭' }, { key: 'interview', label: '전략 질문' },
  { key: 'plan', label: 'Storyboard' }, { key: 'design', label: '레이아웃 설계' }, { key: 'fill', label: '값 입력' }, { key: 'review', label: '검토' },
];
const NODE_STAGE = { ingest: 'analyze', analyze: 'analyze', match_standard: 'match', match_best: 'match', decompose: 'match', strategy_interview: 'interview',
  plan: 'plan', design_part: 'design', assemble: 'design', fill_slide: 'fill', review: 'review', revise: 'design', finalize: 'review' };

function emptyCustom() {
  return { title: '', customer: '', project: '', target: '', industry: '', free_text: '', note: '', keymen: [{ name: '', weight: 50, reqs: [] }], files: [], products: [], solutions: [], cases: [] };
}

ROUTES['layout/run'] = async (el) => {
  el.append(head('레이아웃 추천 Agent', '요구 분석 → 맥락 판정(① 거의 없음 · ② 모호 · ③ 복잡) → 표준 · Best Practice 매칭 또는 요구 분해와 전략 질문 → storyboard → 레이아웃 설계 → 값 입력.'));
  if (!STATUS) await loadStatus();
  if (STATUS && !STATUS.modules.layout.ok) { el.append(errorBox('레이아웃 Agent 를 불러오지 못했습니다 — ' + STATUS.modules.layout.error)); return; }
  try {
    if (!LAY.cases) LAY.cases = await api('/api/layout/cases');
    if (!LAY.cat) LAY.cat = await api('/api/layout/catalog');
  } catch (e) { el.append(errorBox(e.message)); return; }
  const pending = store.get('layout.pending');
  if (pending) { LAY.mode = 'json'; LAY.input = pending; store.del('layout.pending'); }
  if (!LAY.custom) LAY.custom = emptyCustom();

  const right = h('div', { class: 'stack' });
  const rl = rail(LAY_STAGES);
  const con = consoleBox(false);
  const out = h('div');
  right.append(rl, con, out);

  // ---- 입력
  const srcBox = h('div');
  const caseOpts = ['cases', 'holdout', 'holdout2'].map((s) => ({ group: { cases: '개발용 30 TC', holdout: 'holdout', holdout2: 'holdout2' }[s],
    items: LAY.cases.filter((c) => c.set === s).map((c) => [`${s}/${c.id}`, `${c.id} · ${LEVEL[c.level] ? LEVEL[c.level].slice(0, 1) : ''} ${c.title || ''} (${c.industry || '-'})`]) }));
  const caseSummary = h('div', { class: 'small muted' });
  const jsonTa = h('textarea', { class: 'code', rows: 16 });
  async function loadCase() {
    const d = await api(`/api/layout/cases/${LAY.set}/${LAY.id}`);
    LAY.input = d.input;
    const i = d.input;
    caseSummary.textContent = `${i.customer || '-'} · ${i.project || ''} · 업종 ${i.industry || '추론'} · 키맨 ${(i.keymen || []).length} · 첨부 ${(i.files || []).length} · 제품 ${(i.products || []).join(', ') || '-'}` + (d.gold ? ` · 정답 맥락 ${LEVEL[d.gold.level] || d.gold.level}` : '');
  }
  function drawSrc() {
    srcBox.textContent = '';
    if (LAY.mode === 'tc') {
      srcBox.append(field('테스트 케이스', select(caseOpts, `${LAY.set}/${LAY.id}`, async (v) => { [LAY.set, LAY.id] = v.split('/'); await loadCase(); }), null), caseSummary);
      loadCase().catch((e) => toast(e.message));
    } else if (LAY.mode === 'custom') srcBox.append(customForm());
    else {
      jsonTa.value = JSON.stringify(LAY.input || LAY.custom, null, 1);
      srcBox.append(field('입력 JSON (ProposalInput)', jsonTa, 'RFP 정리 결과를 가져오면 여기에 들어옵니다. 키: customer · project · target · industry · free_text · keymen[{name, weight, reqs}] · note · files[{name, text}] · products · solutions · cases'));
    }
  }
  function customForm() {
    const c = LAY.custom;
    const box = h('div');
    const inp = (k, ph) => h('input', { type: 'text', value: c[k] || '', placeholder: ph || '', oninput: (e) => { c[k] = e.target.value; } });
    const indSel = select([['', '자동 추론'], ...LAY.cat.industries.map((i) => [i.code, `${i.name} (${i.code})`])], c.industry || '', (v) => { c.industry = v; });
    const kmBox = h('div');
    const drawKm = () => {
      kmBox.textContent = '';
      c.keymen.forEach((k, i) => {
        kmBox.append(h('div', { class: 'panel', style: { padding: '10px', marginBottom: '8px' } },
          h('div', { class: 'grid2' }, h('input', { type: 'text', placeholder: '키맨(직책)', value: k.name, oninput: (e) => { k.name = e.target.value; } }),
            h('input', { type: 'number', placeholder: '가중치', value: k.weight, oninput: (e) => { k.weight = Number(e.target.value); } })),
          h('textarea', { rows: 3, placeholder: '요구사항 — 한 줄에 하나', style: { marginTop: '6px' }, oninput: (e) => { k.reqs = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean); } }, (k.reqs || []).join('\n')),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { c.keymen.splice(i, 1); drawKm(); } }, '키맨 빼기')));
      });
      kmBox.append(h('button', { class: 'btn', type: 'button', onclick: () => { c.keymen.push({ name: '', weight: 30, reqs: [] }); drawKm(); } }, '키맨 추가'));
    };
    drawKm();
    const pick = (list, key, label) => {
      const q = h('input', { type: 'text', placeholder: `${label} 찾기` });
      const lb = h('div', { style: { maxHeight: '150px', overflow: 'auto', border: '1px solid var(--line)', borderRadius: '6px', padding: '4px 8px', marginTop: '4px' } });
      const draw = () => {
        lb.textContent = '';
        list.filter((x) => !q.value || JSON.stringify(x).toLowerCase().includes(q.value.toLowerCase())).slice(0, 80).forEach((x) => {
          lb.append(h('label', { class: 'check', style: { margin: '2px 0' } }, h('input', { type: 'checkbox', checked: c[key].includes(x.id), onchange: (e) => { c[key] = e.target.checked ? [...c[key], x.id] : c[key].filter((y) => y !== x.id); } }), `${x.model || x.name} ${x.model ? '· ' + x.name : ''} ${x.cat ? '(' + x.cat + ')' : ''}`));
        });
      };
      q.addEventListener('input', draw);
      draw();
      return h('div', { class: 'field' }, h('span', { class: 'lbl' }, label), q, lb);
    };
    const fileTa = h('textarea', { rows: 4, placeholder: 'RFP · 회의록 원문(선택)', oninput: (e) => { c.files = e.target.value.trim() ? [{ name: '첨부 원문.md', text: e.target.value }] : []; } }, (c.files[0] || {}).text || '');
    box.append(h('div', { class: 'grid2' }, field('고객사', inp('customer', '예: 신한은행')), field('업종', indSel)),
      field('프로젝트', inp('project', '예: 영업점 디지털 사이니지 교체')), field('최종 제안 대상', inp('target', '예: 총무부 · IT 본부')),
      field('자유형식 요구', h('textarea', { rows: 4, placeholder: '고객이 말한 내용 그대로', oninput: (e) => { c.free_text = e.target.value; } }, c.free_text)),
      h('div', { class: 'field' }, h('span', { class: 'lbl' }, '키맨별 요구'), kmBox),
      field('제작자 의견', h('textarea', { rows: 2, oninput: (e) => { c.note = e.target.value; } }, c.note)),
      field('첨부 원문', fileTa), pick(LAY.cat.products, 'products', '제품'), pick(LAY.cat.solutions, 'solutions', '솔루션'));
    return box;
  }
  drawSrc();
  const gem = STATUS && STATUS.keys.GEMINI_API_KEY;
  const runBtn = h('button', { class: 'btn primary wide', type: 'button', onclick: run }, '제안서 구성 실행');
  const form = h('div', null,
    pending ? h('div', { class: 'chip turn', style: { whiteSpace: 'normal', marginBottom: '10px' } }, 'RFP 정리 결과를 입력으로 가져왔습니다 — 아래 JSON 을 확인하고 실행하세요') : null,
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, '입력'), seg([['tc', '테스트 케이스'], ['custom', '직접 입력'], ['json', 'JSON']], LAY.mode, (v) => {
      if (LAY.mode === 'json' && v !== 'json') { try { LAY.input = JSON.parse(jsonTa.value); } catch (e) { /* keep */ } }
      LAY.mode = v; drawSrc();
    })),
    srcBox, h('hr', { class: 'sep' }),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'LLM'), seg([['offline', '규칙만(무료 · 결정론)'], ['gemini', 'Gemini']], LAY.llm, (v) => { LAY.llm = v; }),
      !gem ? h('div', { class: 'hint' }, 'poc/.env 에 GEMINI_API_KEY 가 없어 Gemini 는 쓸 수 없습니다') : h('div', { class: 'hint' }, 'Gemini 는 TC 하나에 약 25초 · 30회 안팎 호출')),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: LAY.interactive, onchange: (e) => { LAY.interactive = e.target.checked; } }), h('span', null, '③ 복잡이면 전략 질문에서 멈추고 직접 답하기', h('div', { class: 'tiny' }, '끄면 기본값으로 끝까지 진행합니다'))),
    field('최대 장수(선택)', h('input', { type: 'number', min: 4, max: 40, value: LAY.maxSlides, placeholder: '비우면 맥락에 따라', oninput: (e) => { LAY.maxSlides = e.target.value; } })),
    runBtn);
  el.append(h('div', { class: 'split' }, h('div', { class: 'sticky' }, panel('입력 · 실행 조건', form)), right));
  out.append(h('div', { class: 'empty' }, h('b', null, '아직 결과가 없습니다'), '테스트 케이스를 고르거나 직접 입력하고 실행하세요'));

  let watcher = null; let cur = null;
  function follow(id) {
    watcher && watcher.stop();
    cur = id;
    rl.reset(); con.clear(); runBtn.disabled = true;
    out.textContent = '';
    out.append(h('div', { class: 'empty' }, '실행 중'));
    watcher = watchJob(id, {
      onTick: (j) => {
        con.append(j.logs);
        for (const l of j.logs) {
          const node = l.msg.split(' ')[0];
          if (NODE_STAGE[node]) rl.advance(NODE_STAGE[node], node === 'fill_slide' || node === 'design_part' ? undefined : null);
        }
      },
      onEnd: (j) => {
        runBtn.disabled = false;
        out.textContent = '';
        if (j.status === 'error') { rl.fail(); out.append(errorBox(j.error)); return; }
        const r = j.result;
        if (r.route && r.route !== 'decompose') rl.set('interview', 'skip');
        if (j.status === 'waiting') {
          rl.advance('interview'); rl.set('interview', 'waiting');
          out.append(renderLayoutResult(r, j, { onAnswered: () => follow(id) }));
        } else {
          rl.finish();
          if (r.route && r.route !== 'decompose') rl.set('interview', 'skip');
          out.append(renderLayoutResult(r, j, {}));
        }
        scaleFrames(out);
      },
      onFail: (e) => { runBtn.disabled = false; toast(e.message); },
      onGone: () => { runBtn.disabled = false; store.del('layout.job'); rl.reset(); out.textContent = ''; out.append(h('div', { class: 'empty' }, h('b', null, '지난 작업이 서버에 없습니다'), '서버를 다시 켜면 작업 기록이 지워집니다 — 다시 실행하세요')); },
    });
  }
  async function run() {
    let input;
    if (LAY.mode === 'tc') input = LAY.input;
    else if (LAY.mode === 'custom') {
      const c = LAY.custom;
      input = { ...c, id: 'custom', industry: c.industry || null, keymen: c.keymen.filter((k) => k.name && k.reqs.length), title: c.project || c.customer };
      if (!input.customer && !input.free_text && !input.keymen.length) { toast('고객사 · 요구 중 하나는 넣으세요'); return; }
    } else {
      try { input = JSON.parse(jsonTa.value); } catch (e) { toast('JSON 형식이 맞지 않습니다 — ' + e.message); return; }
    }
    if (!input) { toast('입력을 불러오는 중입니다'); return; }
    if (LAY.llm === 'gemini' && !gem) { toast('GEMINI_API_KEY 가 없습니다'); return; }
    try {
      const r = await api('/api/layout/run', { body: { input, llm: LAY.llm, interactive: LAY.interactive, max_slides: LAY.maxSlides || null, case: LAY.mode === 'tc' ? `${LAY.set}/${LAY.id}` : LAY.mode } });
      store.set('layout.job', r.job);
      follow(r.job);
    } catch (e) { toast(e.message); }
  }
  const last = store.get('layout.job');
  if (last) follow(last);
};

function renderLayoutResult(r, job, hooks) {
  const el = h('div');
  const a = r.analysis || {};
  const reqs = a.requirements || [];
  const must = reqs.filter((x) => x.priority === 'must').length;
  const slideByPart = {};
  (r.slides || []).forEach((s) => { (slideByPart[s.part_id] = slideByPart[s.part_id] || []).push(s.no); });
  const partsById = {};
  (r.parts || []).forEach((p, i) => { partsById[i] = p; });
  const reqSlides = (rid) => {
    const idx = (r.links || {})[rid] || [];
    return idx.flatMap((i) => (partsById[i] ? slideByPart[partsById[i].id] || [] : []));
  };

  const ctx = r.ctx || {};
  el.append(h('div', { class: 'row', style: { marginBottom: '10px' } },
    h('span', { class: 'lvl' }, LEVEL[a.context_level] || a.context_level), chip(`업종 ${a.industry_name || '미확정'} (${a.industry_source || '-'})`, 'blue'),
    ctx.customer ? chip(ctx.customer) : null, chip(`LLM 호출 ${r.llm_calls}회` + (r.llm_fail ? ` · 실패 ${r.llm_fail}` : ''), r.llm_fail ? 'warn' : ''),
    job.params && job.params.llm ? chip(job.params.llm === 'gemini' ? 'Gemini' : '규칙만') : null));
  el.append(h('p', { class: 'muted small', style: { margin: '0 0 10px' } }, '판정 근거 — ' + (a.level_reason || '')));

  // 1 요구 분석
  const fl = { must: 0, proc: 0 };
  const reqBox = h('div');
  let filt = 'all';
  const drawReq = () => {
    reqBox.textContent = '';
    const rows = reqs.filter((x) => filt === 'all' || (filt === 'must' ? x.priority === 'must' : filt === 'proc' ? x.procedural : filt === 'nolink' ? !reqSlides(x.id).length && !x.procedural : true));
    reqBox.append(table([
      { label: 'ID', key: 'id', cls: 'nw' }, { label: '요구', render: (x) => h('div', null, x.text, h('div', { class: 'tiny' }, x.source || '')) },
      { label: '분류', key: 'category', cls: 'nw' }, { label: '우선', render: (x) => h('span', { class: `pri-${x.priority}` }, PRI[x.priority] || x.priority), cls: 'nw' },
      { label: '점수', key: 'score', cls: 'num' },
      { label: '반영 슬라이드', render: (x) => (x.procedural ? chip('제출 체크리스트', 'warn') : (reqSlides(x.id).length ? reqSlides(x.id).map((n) => chip(`#${n}`, 'pass')) : (r.partial ? '' : chip('없음', 'fail')))) },
      { label: '', render: (x) => [x.interview ? chip('인터뷰', 'turn') : null, x.llm_added ? chip('LLM 추가', 'blue') : null, x.llm_label ? chip('LLM 분류') : null] },
    ], rows, { maxHeight: '420px' }));
  };
  drawReq();
  el.append(section('1 · 요구사항 분석', `${reqs.length}개 · 필수 ${must}`,
    figs([{ k: '맥락', v: (LEVEL[a.context_level] || '').slice(2) || a.context_level }, { k: '요구', v: reqs.length }, { k: '필수', v: must },
      { k: '키맨', v: (a.keymen || []).length }, { k: '요구 타입', v: a.req_type || '-' }, { k: '전략 단서', v: a.strategy || '-' }]),
    a.summary ? h('p', { class: 'small', style: { margin: '10px 0' } }, a.summary) : null,
    h('div', { class: 'row', style: { margin: '8px 0' } }, seg([['all', '전체'], ['must', '필수만'], ['nolink', '슬라이드에 없는 것'], ['proc', '제출 절차']], filt, (v) => { filt = v; drawReq(); })),
    reqBox));
  void fl;

  // 2 맥락별 매칭
  const sm = r.scenario_match || {};
  const d = r.decomposition;
  const s2 = section('2 · 맥락별 추천', { standard: '① 표준 제안서 시나리오', best: '② Best Practice 시나리오', decompose: '③ 요구 분해 → 사용자와 전략 수립' }[r.route] || r.route);
  if (sm.candidates && r.route !== 'decompose') {
    s2.append(h('div', { class: 'row', style: { marginBottom: '8px' } }, chip(`선택 ${sm.chosen}`, 'pass'), sm.llm ? chip('LLM 재선택', 'blue') : null));
    s2.append(table([{ label: '후보', render: (c) => h('b', null, c.id || c.strategy) }, { label: '제목', render: (c) => c.title || c.label || '' },
      { label: '점수', render: (c) => (c.score !== undefined ? Number(c.score).toFixed(2) : ''), cls: 'num' }, { label: '이유', render: (c) => h('span', { class: 'small' }, [].concat(c.why || c.desc || []).join(' · ')) }], sm.candidates.slice(0, 5)));
  }
  if (d) {
    s2.append(table([{ label: '기준', key: 'dimension' }, { label: '요구', key: 'n', cls: 'num' }, { label: '필수', key: 'must', cls: 'num' },
      { label: '요약', render: (g) => h('span', { class: 'small' }, g.summary) }, { label: '답하는 장표', render: (g) => (g.answer_layouts || []).map((x) => chip(x)) }], d.groups || [], { maxHeight: '320px' }));
    const cols = h('div', { class: 'cols2', style: { marginTop: '12px' } });
    cols.append(panel('평가 구조 · 충돌', h('div', null,
      d.eval ? h('p', { class: 'small', style: { marginTop: 0 } }, h('b', null, d.eval.type), ' — ', (d.eval.signals || []).join(', '), (d.eval.items || []).length ? h('div', null, d.eval.items.map((x) => chip(`${x[0]} ${x[1]}점`))) : null) : h('p', { class: 'small muted', style: { marginTop: 0 } }, '평가 배점 구조 없음'),
      (d.conflicts || []).map((c) => h('div', { class: 'small', style: { margin: '6px 0' } }, chip(c.kind, 'warn'), c.note)))));
    cols.append(panel('빈 정보 · 전략 후보', h('div', null,
      (d.gaps || []).map((g) => h('div', { class: 'small', style: { margin: '4px 0' } }, chip(g.label), g.why)),
      h('hr', { class: 'sep' }),
      (d.strategy_options || []).map((o, i) => h('div', { class: 'small', style: { margin: '4px 0' } }, chip(`${i + 1}. ${o.label}`, i === 0 ? 'blue' : ''), o.desc, o.best_title ? h('span', { class: 'tiny' }, ` · 참고 ${o.best_ref} ${o.best_title}`) : null)))));
    s2.append(cols);
  }
  el.append(s2);

  // 2-1 전략 질문(대기)
  if (job.status === 'waiting' && job.waiting) el.append(renderInterview(job, hooks));
  if (r.choice) {
    const ch = r.choice;
    el.append(h('div', { class: 'row', style: { marginTop: '10px' } }, chip(`전략 ${ch.strategy}`, 'turn'), chip(`결말 ${ch.ending}`), chip(`분량 ${ch.budget}장`), ch.keyman ? chip(`앞에 둘 키맨 ${ch.keyman}`) : null,
      Object.entries(ch.conflicts || {}).map(([k, v]) => chip(`${k} → ${v.answer}`, 'warn'))));
  }
  if (r.partial) return el;

  // 3 storyboard
  el.append(section('3 · Storyboard · 연관 우선순위', `${(r.parts || []).length}개 파트`, table([
    { label: '#', key: 'id', cls: 'nw' },
    { label: '파트', render: (p) => h('div', null, h('b', null, p.name), h('div', { class: 'tiny' }, `${p.type} · ${p.source || ''}`), p.direction ? chip(`대응: ${p.direction}`, 'warn') : null) },
    { label: '내용', render: (p) => h('ul', { style: { margin: 0, paddingLeft: '16px' } }, (p.items || []).map((x) => h('li', { class: 'small' }, x))) },
    { label: '우선', render: (p) => h('div', null, h('b', null, `${p.priority_rank}위`), h('div', { class: 'tiny' }, `${p.priority} · ${p.priority_reason || ''}`)) },
    { label: '요구', render: (p) => (p.req_ids || []).slice(0, 8).map((x) => chip(x)) },
    { label: '슬라이드', render: (p) => (slideByPart[p.id] || []).map((n) => chip(`#${n}`)) },
  ], r.parts || [], { maxHeight: '460px' })));

  // 4 슬라이드
  const grid = h('div', { class: 'slides' });
  for (const s of r.slides || []) {
    const c = s.checks || {};
    const card = h('article', { class: 'slide' });
    const fr = slideFrame(s.html);
    fr.addEventListener('click', () => openSlide(s));
    card.append(fr, h('div', { class: 'meta' },
      h('div', null, h('b', null, `${s.no}. ${s.code} ${s.name}`)),
      h('div', { class: 'why' }, (s.why || []).slice(0, 3).join(' / ')),
      h('div', null, chip(`채운 칸 ${c.changed}/${c.n_slots}`), c.placeholders_left ? chip(`자리표시 ${c.placeholders_left}`, 'warn') : null,
        (c.unsupported_numbers || []).length ? chip(`근거 없는 수치 되돌림 ${c.unsupported_numbers.length}`, 'fail') : null,
        (c.sample_leak || []).length ? chip('샘플 고객명', 'fail') : null, (c.foreign_terms || []).length ? chip('다른 업종 표현', 'warn') : null,
        (c.static_foreign || []).length ? chip('고정 샘플 문구', 'warn') : null, s.llm ? chip('LLM 채움', 'blue') : null)));
    grid.append(card);
  }
  el.append(section('4 · 슬라이드 · 값 입력', '누르면 크게 보고 칸마다 들어간 값과 출처를 확인합니다', grid));

  // 5 검토
  const rv = r.review || {};
  el.append(section('5 · 검토', null,
    figs([{ k: '요구 반영률', v: rv.req_total ? fmt.pct(rv.req_coverage) : '-', cls: rv.req_coverage >= 0.95 ? 'good' : 'mid' }, { k: '필수 누락', v: (rv.must_uncovered || []).length, cls: (rv.must_uncovered || []).length ? 'bad' : 'good' },
      { k: '흐름', v: rv.flow_score }, { k: '슬라이드', v: rv.n_slides }, { k: '다른 업종 장표', v: (rv.industry_violations || []).length, cls: (rv.industry_violations || []).length ? 'bad' : 'good' },
      { k: '중복 장표', v: (rv.duplicates || []).length, cls: (rv.duplicates || []).length ? 'bad' : 'good' }]),
    h('div', { style: { marginTop: '10px' } }, (rv.issues || []).map((i) => h('div', { class: 'small', style: { margin: '4px 0' } }, chip(i.sev, i.sev === 'high' ? 'fail' : i.sev === 'mid' ? 'warn' : ''), i.msg))),
    (rv.checklist || []).length ? h('details', { style: { marginTop: '8px' } }, h('summary', { class: 'small', style: { cursor: 'pointer' } }, `제출 체크리스트 ${rv.checklist.length}개 (반영률 계산에서 제외)`),
      h('ul', { class: 'small' }, rv.checklist.map((c) => h('li', null, `${c.id} ${c.text}`)))) : null,
    h('div', { class: 'row', style: { marginTop: '12px' } },
      h('a', { class: 'btn', href: `/api/layout/jobs/${job.id}/proposal.json` }, 'proposal.app.json 받기'),
      h('a', { class: 'btn', href: `/api/layout/jobs/${job.id}/report.md` }, 'report.md 받기'))));
  return el;
}

function openSlide(s) {
  const big = slideFrame(s.html);
  big.className = 'big';
  const rows = Object.entries(s.texts || {}).map(([i, t]) => ({ i, t, src: (s.sources || {})[i] }));
  const box = h('div', { class: 'box', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${s.no}. ${s.name}` },
    h('div', { class: 'bh' }, h('b', null, `${s.no}. ${s.code} ${s.name} — ${s.f}`), h('button', { class: 'btn', onclick: () => m.remove() }, '닫기')),
    big,
    h('div', { class: 'pb', style: { padding: '14px 16px' } },
      (s.alternates || []).length ? h('p', { class: 'small muted' }, '대안 장표 — ', s.alternates.map((x) => chip(`${x.code} ${x.name}`))) : null,
      table([{ label: '칸', key: 'i', cls: 'num' }, { label: '들어간 값', key: 't' }, { label: '출처', render: (x) => chip(x.src || '-', { req: 'pass', fact: 'pass', keyman: 'pass', product: 'blue', case: 'blue', llm: 'blue', placeholder: 'warn', reverted: 'fail' }[x.src] || '') }], rows, { maxHeight: '340px' })));
  const m = h('div', { class: 'modal', onclick: (e) => { if (e.target === m) m.remove(); } }, box);
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { m.remove(); document.removeEventListener('keydown', esc); } });
  document.body.append(m);
  requestAnimationFrame(() => scaleFrames(m));
}

function renderInterview(job, hooks) {
  const p = job.waiting;
  const answers = {};
  const wrap = h('div', { class: 'stack', style: { marginTop: '16px' } });
  const ask = h('div', { class: 'ask' }, h('div', { class: 'ah' }, h('b', null, '전략 질문 — 답하면 storyboard · 레이아웃 · 값 입력을 이어서 진행합니다'), h('div', { class: 'small muted' }, p.message || '')));
  for (const q of p.questions || []) {
    answers[q.id] = q.default;
    const free = h('input', { type: 'text', placeholder: '직접 입력(선택지 대신)', style: { marginTop: '4px' }, oninput: (e) => { if (e.target.value.trim()) answers[q.id] = e.target.value.trim(); } });
    const isGap = q.id.startsWith('gap_');
    const opts = (q.options || []).map((o) => {
      const val = /^[a-z]+:/.test(o) ? o.split(':')[0] : o;
      const checked = val === q.default || o === q.default;
      return h('label', { class: 'opt' }, h('input', { type: 'radio', name: `q_${q.id}`, checked, onchange: () => { answers[q.id] = val; if (isGap) free.style.display = val === '값을 입력' ? '' : 'none'; } }), h('span', null, o));
    });
    if (isGap) free.style.display = 'none';
    ask.append(h('div', { class: 'q' }, h('div', { class: 'qt' }, q.question), opts, free, q.affects ? h('div', { class: 'aff' }, '영향: ' + [].concat(q.affects).join(', ')) : null));
  }
  const go = h('button', { class: 'btn turn', onclick: async () => {
    for (const q of p.questions || []) if (q.id.startsWith('gap_') && answers[q.id] === '값을 입력') answers[q.id] = '';
    go.disabled = true;
    try { await api(`/api/layout/jobs/${job.id}/answer`, { body: { answers } }); hooks.onAnswered && hooks.onAnswered(); } catch (e) { toast(e.message); go.disabled = false; }
  } }, '이 답으로 계속');
  ask.append(h('div', { class: 'q', style: { borderBottom: 0 } }, go));
  wrap.append(ask);

  // 전략 코파일럿(deepagents)
  const canChat = job.params && job.params.llm === 'gemini' && STATUS && STATUS.modules.layout.deepagents;
  const chat = h('div', { class: 'chat' });
  const answersBox = h('div', { class: 'row' });
  const fin = h('button', { class: 'btn turn', disabled: true, onclick: async () => {
    fin.disabled = true;
    try { await api(`/api/layout/jobs/${job.id}/copilot/finalize`, { body: {} }); hooks.onAnswered && hooks.onAnswered(); } catch (e) { toast(e.message); fin.disabled = false; }
  } }, '확정한 답으로 계속');
  const msgIn = h('textarea', { rows: 2, placeholder: canChat ? '예: 최저가 입찰이라 규격 100% 충족을 먼저 보여 주고, 15장으로 해 주세요' : 'LLM=Gemini 로 실행한 작업에서만 대화할 수 있습니다', disabled: !canChat });
  const send = async (text) => {
    const t = (text || msgIn.value).trim();
    if (!t) return;
    msgIn.value = '';
    chat.append(h('div', { class: 'msg me' }, t));
    const wait = h('div', { class: 'msg ai muted' }, '생각 중');
    chat.append(wait); chat.scrollTop = chat.scrollHeight;
    try {
      const r = await api(`/api/layout/jobs/${job.id}/copilot`, { body: { message: t } });
      wait.remove();
      chat.append(h('div', { class: 'msg ai' }, r.reply, r.tools && r.tools.length ? h('span', { class: 'tools' }, '도구: ' + r.tools.slice(-5).join(' → ')) : null));
      answersBox.textContent = '';
      Object.entries(r.answers || {}).forEach(([k, v]) => answersBox.append(chip(`${k} = ${v}`, 'turn')));
      fin.disabled = !r.finalized && !Object.keys(r.answers || {}).length;
      if (r.finalized) answersBox.append(chip('코파일럿이 확정함', 'pass'));
    } catch (e) { wait.remove(); toast(e.message); }
    chat.scrollTop = chat.scrollHeight;
  };
  wrap.append(panel('전략 코파일럿과 대화 (deepagents)', h('div', null,
    h('p', { class: 'small muted', style: { marginTop: 0 } }, '분해 결과를 근거로 질문하고, 대화에서 정한 답을 기록합니다(set_answers → preview_storyboard → finalize). 정하지 않은 질문은 기본값을 씁니다.'),
    chat, h('div', { class: 'row', style: { marginTop: '8px' } }, msgIn),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn', disabled: !canChat, onclick: () => send() }, '보내기'),
      h('button', { class: 'btn ghost', disabled: !canChat, onclick: () => send('분해 결과를 요약하고 첫 질문을 해 주세요.') }, '요약부터 듣기'), fin),
    answersBox)));
  return wrap;
}

// ---- 레이아웃 검색
ROUTES['layout/search'] = async (el) => {
  el.append(head('레이아웃 검색(RAG)', '446개 레이아웃 메타데이터(칸 역할 · 용량 · 시각 유형 · 적합 전략/맥락 · 필요 정보) + 하이브리드 검색 + 적합도 점수로 후보를 고릅니다.'));
  if (!LAY.cat) LAY.cat = await api('/api/layout/catalog').catch((e) => { toast(e.message); return null; });
  if (!LAY.cat) return;
  const st = store.get('search', { q: '평가 항목 배점 대응', part: 'requirements', ind: 'FN', level: 'complex', strategy: '', products: '' });
  const q = h('input', { type: 'text', value: st.q, placeholder: '예: 공간별 제품 배치, 투자 회수, 평가 항목 대응' });
  const out = h('div', { class: 'hits' });
  const go = async () => {
    st.q = q.value; store.set('search', st);
    out.textContent = '';
    out.append(h('div', { class: 'empty' }, '검색 중'));
    try {
      const qs = new URLSearchParams({ q: st.q, part: st.part, ind: st.ind, level: st.level, strategy: st.strategy, products: st.products, k: 12 });
      const hits = await api(`/api/layout/search?${qs}`);
      out.textContent = '';
      if (!hits.length) out.append(h('div', { class: 'empty' }, '후보가 없습니다 — 파트 유형이나 업종을 바꿔 보세요'));
      for (const x of hits) {
        const fit = Array.isArray(x.strategy_fit) ? x.strategy_fit : Object.entries(x.strategy_fit || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
        out.append(h('div', { class: 'hit' }, slideFrame(null, `/api/layout/layouts/${x.f}.html`),
          h('div', null, h('div', { class: 'row' }, h('span', { class: 'score' }, x.score.toFixed(2)), h('b', null, `${x.code} ${x.name}`), h('span', { class: 'tiny' }, x.f)),
            h('p', { class: 'small', style: { margin: '4px 0 6px' } }, x.when),
            h('div', null, (x.why || []).map((w) => chip(w, 'blue'))),
            h('dl', { class: 'kv', style: { marginTop: '8px' } },
              h('dt', null, '파트 · 시각'), h('dd', null, `${x.part} · ${x.visual || '-'} · 담는 항목 ${x.capacity ?? '-'}`),
              h('dt', null, '전용'), h('dd', null, [x.ind ? `업종 ${x.ind}` : null, x.sol ? `솔루션 ${x.sol}` : null].filter(Boolean).join(' · ') || '공통'),
              h('dt', null, '필요 정보'), h('dd', null, (x.needs || []).map((n) => chip(n))),
              h('dt', null, '맞는 전략 · 맥락'), h('dd', null, fit.map((k) => chip(k)), (x.level_fit || []).map((k) => chip(k, 'blue'))),
              (x.static_text || []).length ? [h('dt', null, '고정 문구'), h('dd', null, (x.static_text || []).map((t) => chip(t, 'warn')))] : null))));
      }
      scaleFrames(out);
    } catch (e) { out.textContent = ''; toast(e.message); }
  };
  const form = h('div', { class: 'panel', style: { marginBottom: '16px' } }, h('div', { class: 'pb' },
    h('div', { class: 'row' }, h('div', { style: { flex: '1 1 320px' } }, q), h('button', { class: 'btn primary', onclick: go }, '검색')),
    h('div', { class: 'row', style: { marginTop: '10px' } },
      select([['', '파트 유형 전체'], ...LAY.cat.parts.map((p) => [p.type, `${p.label} (${p.type})`])], st.part, (v) => { st.part = v; }),
      select([['', '업종 미지정'], ...LAY.cat.industries.map((i) => [i.code, `${i.name}`])], st.ind, (v) => { st.ind = v; }),
      select([['minimal', '① 요구 거의 없음'], ['ambiguous', '② 요구 모호'], ['complex', '③ 요구 복잡']], st.level, (v) => { st.level = v; }),
      select([['', '전략 미지정'], ...LAY.cat.strategies.map((s) => [s.key, s.label])], st.strategy, (v) => { st.strategy = v; }),
      h('input', { type: 'text', placeholder: '제품 id(쉼표) 예: qm55c,kiosk', value: st.products, style: { maxWidth: '240px' }, oninput: (e) => { st.products = e.target.value; } }))));
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  el.append(form, out);
  go();
};

// ---- 평가 리포트
ROUTES['layout/eval'] = async (el) => {
  el.append(head('레이아웃 Agent 평가 리포트', 'eval/reports 아래 결과입니다. 리포트를 누르면 TC 별 점수와 1 미만 지표, 미리보기를 봅니다.'));
  const list = h('div'); const rows = h('div');
  const st = { set: 'cases', llm: 'offline', only: '', render: true };
  const con = consoleBox(true); const res = h('div');
  const btn = h('button', { class: 'btn primary wide', onclick: async () => {
    if (st.llm === 'gemini' && !confirm('Gemini 로 평가합니다(TC 당 약 25초 · 30회 호출). 진행할까요?')) return;
    const r = await api('/api/layout/eval', { body: st }).catch((e) => toast(e.message));
    if (r) { store.set('eval.job', r.job); follow(r.job); }
  } }, '평가 실행');
  el.append(h('div', { class: 'split' }, h('div', { class: 'sticky' }, panel('평가 돌리기', h('div', null,
    field('세트', select([['cases', '개발용 30 TC'], ['holdout', 'holdout 6'], ['holdout2', 'holdout2 6']], st.set, (v) => { st.set = v; })),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'LLM'), seg([['offline', '규칙만'], ['gemini', 'Gemini']], st.llm, (v) => { st.llm = v; })),
    field('일부만(선택)', h('input', { type: 'text', placeholder: '예: C04_,C10_L3', oninput: (e) => { st.only = e.target.value; } })),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { st.render = e.target.checked; } }), '미리보기 HTML 저장'), btn, con, res))),
  h('div', { class: 'stack' }, list, rows)));
  async function loadList() {
    list.textContent = '';
    const reps = await api('/api/layout/reports').catch(() => []);
    list.append(table([
      { label: '리포트', render: (x) => h('b', null, x.name) }, { label: 'LLM', render: (x) => `${x.llm || '-'} ${x.model || ''}` },
      { label: '전체', render: (x) => fmt.score(x.overall), cls: 'num' },
      { label: '①', render: (x) => fmt.score((x.by_level || {}).minimal), cls: 'num' }, { label: '②', render: (x) => fmt.score((x.by_level || {}).ambiguous), cls: 'num' },
      { label: '③', render: (x) => fmt.score((x.by_level || {}).complex), cls: 'num' }, { label: 'TC', key: 'n', cls: 'num' }, { label: '호출', key: 'llm_calls', cls: 'num' },
      { label: '', render: (x) => (x.has_cases ? chip('미리보기', 'blue') : '') },
    ], reps, { onRow: openRep, maxHeight: '360px' }));
  }
  async function openRep(x) {
    rows.textContent = '';
    const d = await api(`/api/layout/reports/${encodeURIComponent(x.name)}`);
    rows.append(section(x.name, `전체 ${fmt.score(d.summary.overall)}`, table([
      { label: 'TC', key: 'id', cls: 'nw' }, { label: '맥락', render: (r) => (LEVEL[r.level] || r.level || '').slice(0, 1), cls: 'nw' }, { label: '점수', render: (r) => fmt.score(r.score), cls: 'num' },
      { label: '1 미만 지표', render: (r) => Object.entries(r.metrics || {}).filter(([, v]) => v !== null && v < 1).map(([k, v]) => chip(`${k} ${Number(v).toFixed(2)}`, v < 0.8 ? 'fail' : 'warn')) },
      { label: '비고', render: (r) => h('span', { class: 'small muted' }, [r.detail && r.detail.strategy ? `전략 ${r.detail.strategy}` : '', r.detail && r.detail.scenario ? `시나리오 ${r.detail.scenario}` : '',
        r.detail && (r.detail.missing_parts || []).length ? `빠진 파트 ${r.detail.missing_parts.join(',')}` : ''].filter(Boolean).join(' · ')) },
      { label: '', render: (r) => (r.preview ? h('a', { href: `/files/layout-reports/${encodeURIComponent(x.name)}/cases/${r.id}/preview.html`, target: '_blank', rel: 'noopener', onclick: (e) => e.stopPropagation() }, '미리보기 열기') : '') },
    ], d.rows || [], { maxHeight: '620px' })));
  }
  function follow(id) {
    con.clear(); res.textContent = ''; btn.disabled = true;
    watchJob(id, {
      onTick: (j) => con.append(j.logs),
      onEnd: (j) => {
        btn.disabled = false;
        if (j.status === 'error') { res.append(errorBox(j.error)); return; }
        const r = j.result;
        res.append(figs([{ k: '전체 점수', v: fmt.score(r.overall), cls: r.overall >= 0.95 ? 'good' : 'mid' }, { k: '걸린 시간', v: fmt.s(r.seconds) }]));
        loadList().then(() => openRep({ name: r.report }));
      },
    });
  }
  await loadList();
  const last = store.get('eval.job');
  if (last) follow(last);
};

// ------------------------------------------------------------------ 자동 테스트
ROUTES.tests = async (el) => {
  el.append(head('자동 테스트', '각 모듈의 테스트 스위트를 그대로 돌립니다. RFP 의 Gemini 라이브 테스트는 켜야만 호출합니다.'));
  const suites = await api('/api/selftest').catch(() => []);
  const grid = h('div', { class: 'suites' });
  el.append(grid);
  for (const s of suites) {
    const body = h('div');
    const con = consoleBox(false);
    let live = false;
    const btn = h('button', { class: 'btn primary', onclick: async () => {
      const r = await api(`/api/selftest/${s.key}`, { body: { live } }).catch((e) => toast(e.message));
      if (r) { store.set(`test.${s.key}`, r.job); follow(r.job); }
    } }, '테스트 실행');
    const controls = h('div', { class: 'row' }, btn,
      s.key === 'rfp_unit' ? h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { live = e.target.checked; } }), 'Gemini 라이브 테스트 포함(호출 발생)') : null);
    grid.append(panel(s.title, h('div', null, h('p', { class: 'tiny', style: { marginTop: 0 } }, s.cwd), controls, body, con)));
    function follow(id) {
      body.textContent = ''; con.clear(); btn.disabled = true;
      body.append(h('p', { class: 'small muted' }, '실행 중'));
      watchJob(id, {
        onTick: (j) => con.append(j.logs),
        onEnd: (j) => {
          btn.disabled = false; body.textContent = '';
          if (j.status === 'error') { body.append(errorBox(j.error)); return; }
          const r = j.result;
          body.append(h('div', { style: { margin: '12px 0' } }, figs([
            { k: '통과', v: r.passed, cls: 'good' }, { k: '실패', v: r.failed, cls: r.failed ? 'bad' : 'good' }, { k: '건너뜀', v: r.skipped, cls: r.skipped ? 'mid' : '' }, { k: '시간', v: fmt.s(r.seconds) },
          ])));
          body.append(h('div', { class: 'tlist' }, r.tests.map((t) => h('div', null, chip(t.status === 'PASSED' ? '통과' : t.status === 'SKIPPED' ? '건너뜀' : '실패', t.status === 'PASSED' ? 'pass' : t.status === 'SKIPPED' ? '' : 'fail'), h('span', { title: t.name }, t.name)))));
          if (r.returncode && !r.failed) body.append(h('div', { class: 'source', style: { marginTop: '8px' } }, r.tail));
        },
      });
    }
    const last = store.get(`test.${s.key}`);
    if (last) follow(last);
  }
};

// ------------------------------------------------------------------ 제안 시뮬레이션 실성능 검증 (sim_eval)
const SIM = { form: { set: 'sets/diverse10.json', modes: ['scenario'], weak: 3, suggest: 3, turns: 14, concurrency: 4, engine: 'current', judge: true, persona_level: false, only: '', tag: 'tb' } };
const SIM_ST = { won: ['설득 성공', 'pass'], lost: ['미팅 종료', 'fail'], ended: ['결론 없음', 'warn'], error: ['오류', 'fail'], running: ['진행 중', 'blue'], judging: ['심사 중', 'turn'], paused: ['멈춤', ''], queued: ['대기', ''], done: ['완료', 'pass'] };
const SIM_MODE = { scenario: 'Best Scenario 담당자', expert: '숙련 담당자', weak: '미숙(대조)', suggest: '추천 답변(대조)' };
const SIM_CRIT = ['CU2', 'CU3', 'CU4', 'PR3', 'PR4', 'PR6', 'VS1', 'VS2', 'VS4', 'VS6', 'VS5', 'MK3', 'WR5'];
const simChip = (s) => chip(...(SIM_ST[s] || [s || '-', '']));

/** 만족도(실선) · 제안 품질(점선) 추이 — 성공 · 종료 기준선, 우려가 드러난 턴(주황) · 풀린 턴(초록) 표시 */
function simSpark(trend, win, lose, maxTurns, big) {
  const W = big ? 640 : 260, H = big ? 150 : 74, P = 4;
  const n = Math.max(maxTurns || 14, trend.length ? trend[trend.length - 1].n : 1, 1);
  const x = (i) => P + (W - 2 * P) * (i / n); const y = (v) => P + (H - 2 * P) * (1 - v / 100);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (t, a) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark' + (big ? ' big' : ''), role: 'img', 'aria-label': `만족도 ${trend.map((t) => t.sat).join('→')}` });
  for (const [v, c] of [[win, 'var(--pass)'], [lose, 'var(--fail)']]) if (v != null) svg.append(el('line', { x1: P, x2: W - P, y1: y(v), y2: y(v), stroke: c, 'stroke-dasharray': '2 3', 'stroke-width': 1, opacity: 0.7 }));
  const path = (key) => trend.filter((t) => t[key] != null).map((t, i) => `${i ? 'L' : 'M'}${x(t.n).toFixed(1)},${y(t[key]).toFixed(1)}`).join('');
  const q = path('q'); if (q) svg.append(el('path', { d: q, fill: 'none', stroke: 'var(--ink-3)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
  const s = path('sat'); if (s) svg.append(el('path', { d: s, fill: 'none', stroke: 'var(--blue)', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  for (const t of trend) {
    if ((t.rv || []).length) svg.append(el('circle', { cx: x(t.n), cy: y(t.sat), r: big ? 4 : 3, fill: 'var(--warn)' }));
    if ((t.rs || []).length) svg.append(el('circle', { cx: x(t.n), cy: y(t.sat), r: big ? 4 : 3, fill: 'var(--pass)', stroke: 'var(--surface)', 'stroke-width': 1 }));
    if (t.ai === false) svg.append(el('rect', { x: x(t.n) - 2, y: H - P - 4, width: 4, height: 4, fill: 'var(--fail)' }));
  }
  return svg;
}
function simConcerns(cc) {
  return h('div', { class: 'sim-cc' }, (cc || []).map((c) => h('span', { class: 'cc ' + (c.resolved ? 'ok' : c.revealed ? 'open' : 'hid'), title: c.revealed ? c.short : '아직 드러나지 않은 우려' }, c.resolved ? '해소 · ' : c.revealed ? '미해소 · ' : '숨음', c.revealed ? c.short : '')));
}
const simAvg = (o) => { const v = Object.values(o || {}).filter((x) => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '-'; };

ROUTES['sim/live'] = async (el) => {
  el.append(head('제안 시뮬레이션 — 실성능 검증', '앱의 시뮬레이션 엔진(src/sim)을 그대로 쓰고, 고객 · 평가와 영업 담당자를 실제 LLM 으로 돌립니다. 턴마다 만족도 · 제안 품질 · 숨은 우려가 쌓이는 것을 실시간으로 봅니다. 터미널에서 돌린 실행도 같은 목록에 보입니다.'));
  const runsBox = h('div'); const board = h('div', { class: 'stack' }); const con = consoleBox(false);
  const f = SIM.form;
  const sets = await api('/api/sim/sets').catch(() => []);
  const modeBox = h('div', { class: 'row' }, ['scenario', 'expert'].map((m) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.modes.includes(m), onchange: (e) => { f.modes = e.target.checked ? [...new Set([...f.modes, m])] : f.modes.filter((x) => x !== m); } }), SIM_MODE[m])));
  const num = (k, min, max) => h('input', { type: 'number', min, max, value: f[k], style: { width: '72px' }, oninput: (e) => { f[k] = Number(e.target.value); } });
  const btn = h('button', { class: 'btn primary wide', onclick: async () => {
    if (f.engine !== 'offline' && !confirm(`Gemini 로 실제 대화를 돌립니다(세션당 약 30~60회 호출). 진행할까요?`)) return;
    const body = { ...f, controls: { weak: f.weak, suggest: f.suggest }, offline: f.engine === 'offline', engine: f.engine === 'offline' ? 'current' : f.engine };
    const r = await api('/api/sim/run', { body }).catch((e) => toast(e.message));
    if (r) { store.set('sim.job', r.job); follow(r.job); }
  } }, '시뮬레이션 실행');
  el.append(h('div', { class: 'split sim-page' }, h('div', { class: 'sticky' }, panel('새로 돌리기', h('div', null,
    field('페르소나 세트', select(sets.map((s) => [s.path, `${s.name} · ${s.n}명`]), f.set, (v) => { f.set = v; }), '고객 페르소나 150(50명 × 난이도 3)에서 고른 묶음. select.mjs 로 다시 고를 수 있어요.'),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, '영업 담당자'), modeBox),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, '대조군(난이도별로 고루)'), h('div', { class: 'row' }, h('span', { class: 'small' }, '미숙'), num('weak', 0, 10), h('span', { class: 'small' }, '추천 답변'), num('suggest', 0, 10))),
    h('div', { class: 'field' }, h('span', { class: 'lbl' }, '엔진'), seg([['current', '현재 앱'], ['baseline', '수정 전'], ['offline', '규칙만(LLM 없음)']], f.engine, (v) => { f.engine = v; })),
    h('div', { class: 'row' }, h('span', { class: 'small' }, '최대 턴'), num('turns', 2, 30), h('span', { class: 'small' }, '동시 세션'), num('concurrency', 1, 16)),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.judge, onchange: (e) => { f.judge = e.target.checked; } }), '세션이 끝나면 독립 심사(더 강한 모델)'),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.persona_level, onchange: (e) => { f.persona_level = e.target.checked; } }), '페르소나 고유 난이도 값(관계 · 경쟁 · 예산 · 말투)을 엔진에 전달'),
    field('일부만(선택)', h('input', { type: 'text', placeholder: '예: ps01,ps12', oninput: (e) => { f.only = e.target.value; } })),
    field('이름(태그)', h('input', { type: 'text', value: f.tag, oninput: (e) => { f.tag = e.target.value; } })),
    btn, con))), h('div', { class: 'stack' }, runsBox, board)));

  let cur = null; let timer = null; let open = null; let jobId = null;
  async function loadRuns() {
    const runs = await api('/api/sim/runs').catch(() => []);
    runsBox.textContent = '';
    runsBox.append(section('실행 기록', 'runs/', table([
      { label: '실행', render: (r) => h('div', null, h('b', null, r.id), r.note ? h('div', { class: 'tiny' }, r.note) : null), cls: '' },
      { label: '엔진', render: (r) => chip(r.engine === 'baseline' ? '수정 전' : r.engine_label || '현재', r.engine === 'baseline' ? 'warn' : 'blue') },
      { label: '상태', render: (r) => (r.live ? chip('실행 중', 'blue') : simChip(r.status)) },
      { label: '세션', render: (r) => `${r.done}/${r.n}`, cls: 'num' }, { label: '성공', key: 'won', cls: 'num' },
      { label: '', render: (r) => (r.status === 'paused' ? h('button', { class: 'btn', onclick: async (e) => { e.stopPropagation(); const x = await api(`/api/sim/runs/${r.id}/resume`, { body: {} }).catch((er) => toast(er.message)); if (x) { store.set('sim.job', x.job); follow(x.job); show(r.id); } } }, '이어서') : '') },
    ], runs, { onRow: (r) => show(r.id), maxHeight: '300px', empty: '아직 실행이 없습니다' })));
    return runs;
  }
  async function show(id) {
    cur = id; open = open && open.run === id ? open : null; store.set('sim.run', id);
    clearTimeout(timer); await paint();
  }
  async function paint() {
    if (!cur) return;
    let d; try { d = await api(`/api/sim/runs/${encodeURIComponent(cur)}`); } catch (e) { board.textContent = ''; board.append(errorBox(e.message)); return; }
    const r = d.run; const ss = d.sessions;
    const fin = ss.filter((s) => ['won', 'lost', 'ended', 'error'].includes(s.status));
    const lastOf = (s) => (s.trend.length ? s.trend[s.trend.length - 1] : null);
    const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : '-');
    const aiTurns = ss.flatMap((s) => s.trend); const aiOk = aiTurns.filter((t) => t.ai !== false).length;
    board.textContent = '';
    const acts = h('div', { class: 'row' },
      d.has_report ? h('a', { class: 'btn', href: `/files/sim-runs/${encodeURIComponent(r.id)}/report.html`, target: '_blank', rel: 'noopener' }, '리포트 열기') : null,
      h('button', { class: 'btn ghost', onclick: async () => { const x = await api(`/api/sim/runs/${r.id}/report`, { body: {} }).catch((e) => toast(e.message)); if (x) { toast('리포트를 다시 만들었어요', 'pass'); paint(); } } }, '리포트 다시 만들기'),
      jobId ? h('button', { class: 'btn ghost', onclick: async () => { await api(`/api/sim/jobs/${jobId}/stop`, { body: {} }).catch((e) => toast(e.message)); toast('지금 턴을 마치고 멈춥니다', 'warn'); } }, '멈춤') : null);
    board.append(panel(r.id, h('div', null,
      h('p', { class: 'small muted', style: { marginTop: 0 } }, `고객 · 평가 ${r.models.customer} · 영업 ${r.models.seller} · 심사 ${r.models.judge || '-'} · 엔진 ${(r.engine && (r.engine.label || r.engine.which)) || '-'} · 최대 ${r.turns}턴${r.personaLevel ? ' · 페르소나 고유 난이도 값 전달' : ''}`),
      r.note ? h('p', { class: 'small', style: { marginTop: 0 } }, r.note) : null,
      figs([
        { k: '끝난 세션', v: `${fin.length}/${ss.length}` },
        { k: '설득 성공 · 실패 · 결론 없음', v: `${fin.filter((s) => s.status === 'won').length} · ${fin.filter((s) => s.status === 'lost').length} · ${fin.filter((s) => s.status === 'ended').length}` },
        { k: 'AI 응답(규칙 대체 없음)', v: aiTurns.length ? `${Math.round((aiOk / aiTurns.length) * 100)}%` : '-', cls: aiTurns.length && aiOk / aiTurns.length < 0.98 ? 'bad' : 'good' },
        { k: '평균 최종 만족도', v: avg(ss.map(lastOf).filter(Boolean).map((t) => t.sat)) },
        { k: '평균 최종 제안 품질', v: avg(ss.map(lastOf).filter((t) => t && t.q != null).map((t) => t.q)) },
      ]), acts), r.status ? simChip(r.status) : null));
    if (d.summary && d.summary.modes) {
      board.append(section('담당자 유형별', '끝난 세션 기준', table([
        { label: '유형', render: (x) => SIM_MODE[x[0]] || x[0] }, { label: '세션', render: (x) => x[1].n, cls: 'num' }, { label: '성공', render: (x) => x[1].won, cls: 'num' }, { label: '실패', render: (x) => x[1].lost, cls: 'num' },
        { label: '평균 턴', render: (x) => x[1].turns, cls: 'num' }, { label: '최종 만족도', render: (x) => x[1].satisfaction, cls: 'num' }, { label: '품질(엔진)', render: (x) => x[1].quality, cls: 'num' }, { label: '품질(심사)', render: (x) => x[1].judgeQuality ?? '-', cls: 'num' },
      ], Object.entries(d.summary.modes))));
    }
    const grid = h('div', { class: 'sim-grid' });
    for (const s of ss) {
      const l = lastOf(s);
      const card = h('button', { type: 'button', class: 'sim-card' + (open && open.sid === s.id ? ' sel' : ''), onclick: () => { open = { run: r.id, sid: s.id }; paint(); } },
        h('div', { class: 'sc-top' }, h('b', null, `${s.customer || s.pid} ${String(s.person || '').split(' · ')[0]}`), simChip(s.status)),
        h('div', { class: 'tiny' }, `${s.levelName || 'L' + s.level} · ${SIM_MODE[s.mode] || s.mode} · ${(s.scenarioTitle || '').slice(0, 26)}`),
        simSpark(s.trend, s.win, s.lose, s.maxTurns, false),
        h('div', { class: 'sc-nums' }, h('span', null, '만족 ', h('b', null, l ? l.sat : '-'), l && l.d ? h('em', { class: l.d > 0 ? 'up' : 'down' }, (l.d > 0 ? '+' : '') + l.d) : null), h('span', null, '품질 ', h('b', null, l && l.q != null ? l.q : '-')), h('span', null, `${l ? l.n : 0}턴`),
          Object.keys(s.checks || {}).length ? h('span', { class: 'warnn', title: Object.entries(s.checks).map(([k, v]) => `${k} ×${v}`).join('\n') }, `점검 ${Object.values(s.checks).reduce((a, b) => a + b, 0)}`) : null,
          s.judge ? h('span', { title: s.judge.summary || '' }, `심사 ${simAvg(s.judge.scores)}`) : null),
        simConcerns(s.concerns),
        s.last ? h('p', { class: 'sc-last' }, '“' + s.last + '”') : null);
      grid.append(card);
    }
    board.append(section('세션', '선: 만족도 · 점선: 제안 품질 · 초록/빨강 점선: 성공/종료 기준 · 주황 점: 우려 드러남 · 초록 점: 우려 해소', grid));
    if (open && open.run === r.id) board.append(await sessionDetail(r.id, open.sid, ss.find((s) => s.id === open.sid)));
    const live = ss.some((s) => ['running', 'judging', 'queued'].includes(s.status)) && (Date.now() / 1000 - d.mtime < 180 || jobId);
    if (live || r.status === 'running') timer = setTimeout(paint, 1500);
  }
  async function sessionDetail(runId, sid, brief) {
    const d = await api(`/api/sim/runs/${encodeURIComponent(runId)}/sessions/${encodeURIComponent(sid)}`).catch(() => ({ events: [] }));
    const ev = d.events; const start = ev.find((e) => e.type === 'start') || {}; const turns = ev.filter((e) => e.type === 'turn');
    const end = ev.find((e) => e.type === 'end'); const judge = ev.find((e) => e.type === 'judge'); const errs = ev.filter((e) => e.type === 'error');
    const heat = (sc) => h('div', { class: 'heat' }, SIM_CRIT.map((id) => { const v = sc ? sc[id] : null; return h('span', { title: `${id} ${v ?? '-'}`, style: { background: v == null ? 'transparent' : `color-mix(in srgb, var(--blue) ${Math.round(v)}%, var(--sunken))` } }, ''); }));
    const box = h('div', { class: 'stack' });
    box.append(panel(`${start.customer || ''} ${start.person || ''} · ${start.levelName || ''} · ${SIM_MODE[start.mode] || ''}`, h('div', null,
      h('p', { class: 'small', style: { marginTop: 0 } }, `요구: ${start.reqTitle || '-'} · 스토리라인 ${start.scenarioTitle || '-'} · 수락 조건 “${start.ask || '-'}” · 성공 ${start.win} / 종료 ${start.lose}`),
      simSpark(brief ? brief.trend : [], start.win, start.lose, start.maxTurns, true),
      h('div', { class: 'small muted' }, '숨은 우려: ', (start.concerns || []).map((c) => c.text).join(' / ')),
      errs.length ? errorBox(errs.map((e) => `${e.where}: ${e.msg}`).join('\n')) : null)));
    box.append(section('턴별 기록', `${turns.length - 1 < 0 ? 0 : turns.length - 1}턴`, table([
      { label: '#', key: 'n', cls: 'num' },
      { label: '영업 담당자', render: (t) => (t.seller ? h('div', { class: 'say' }, t.seller.move ? h('span', { class: 'tiny' }, `[${t.seller.story || '-'}] ${t.seller.move}`) : null, h('div', null, t.seller.text)) : h('span', { class: 'muted small' }, '(미팅 시작)')) },
      { label: '고객', render: (t) => h('div', { class: 'say' }, h('div', null, t.customer.text), t.customer.note ? h('span', { class: 'chip fail' }, t.customer.note) : null) },
      { label: '만족', render: (t) => h('div', { class: 'num' }, h('b', null, t.ev.satisfaction), t.n ? h('div', { class: 'tiny' }, (t.ev.delta > 0 ? '+' : '') + t.ev.delta) : null, t.ev.why ? h('div', { class: 'tiny', title: t.ev.why }, t.ev.why.slice(0, 18)) : null) },
      { label: '품질', render: (t) => h('div', null, h('b', null, t.ev.quality ?? '-'), t.rule && t.rule.quality != null ? h('div', { class: 'tiny', title: '같은 발화의 규칙 점수' }, `규칙 ${t.rule.quality}`) : null, heat(t.ev.scores)) },
      { label: '단계 · 우려', render: (t) => h('div', { class: 'small' }, t.ev.stage, t.ev.revealed.length ? h('div', null, chip('드러남 ' + t.ev.revealed.join(','), 'warn')) : null, t.ev.resolved.length ? h('div', null, chip('해소 ' + t.ev.resolved.join(','), 'pass')) : null, t.ev.end ? h('div', null, chip(t.ev.end === 'win' ? '성공' : '종료', t.ev.end === 'win' ? 'pass' : 'fail')) : null) },
      { label: '점검', render: (t) => h('div', null, (t.checks || []).map((c) => h('div', { class: 'tiny', title: c.msg }, chip(c.id, c.level === 'fail' ? 'fail' : 'warn')))) },
    ], turns, { maxHeight: '640px' })));
    if (end && end.debrief && end.debrief.verdict) box.append(section('앱 총평(debrief)', end.debrief.ai ? 'AI' : '규칙', h('div', { class: 'prose' }, h('b', null, end.debrief.verdict), h('ul', null, [...(end.debrief.good || []).map((x) => h('li', null, '잘한 점 — ' + x)), ...(end.debrief.improve || []).map((x) => h('li', null, '고칠 점 — ' + x))]))));
    if (judge) {
      box.append(section('독립 심사', `${judge.model} · 기대 결과 ${judge.expected_outcome} · 영업 실력 ${judge.seller_quality}/5`, h('div', null,
        h('p', { class: 'small' }, judge.summary),
        figs(Object.entries(judge.scores || {}).map(([k, v]) => ({ k: { persona_fidelity: '페르소나 충실도', level_fit: '난이도 적합', concern_realism: '우려 흐름', satisfaction_plausibility: '만족도 변화', score_calibration: '점수 타당성', outcome_plausibility: '결과 판정', reply_naturalness: '대사 자연스러움' }[k] || k, v: v ?? '-', cls: v >= 4 ? 'good' : v <= 2 ? 'bad' : 'mid' }))),
        table([{ label: '턴', key: 'turn', cls: 'num' }, { label: '심각도', render: (x) => chip(x.severity, x.severity === 'high' ? 'fail' : x.severity === 'mid' ? 'warn' : '') }, { label: '유형', key: 'type' }, { label: '내용', key: 'text' }], judge.issues || [], { empty: '짚은 문제 없음' }))));
    }
    return box;
  }
  function follow(id) {
    jobId = id; con.clear(); btn.disabled = true; con.open = true;
    watchJob(id, {
      onTick: (j) => {
        con.append(j.logs);
        const m = (j.logs || []).map((l) => /^▶ (\S+) ·/.exec(l.msg)).find(Boolean);
        if (m && cur !== m[1]) { show(m[1]); loadRuns(); }
      },
      onEnd: (j) => { btn.disabled = false; jobId = null; if (j.status === 'error') con.append([{ t: '', msg: j.error, level: 'error' }]); loadRuns(); paint(); },
      onGone: () => { btn.disabled = false; jobId = null; },
    });
  }
  const runs = await loadRuns();
  const last = store.get('sim.run'); if (last && runs.some((r) => r.id === last)) show(last); else if (runs[0]) show(runs[0].id);
  const lj = store.get('sim.job'); if (lj) follow(lj);
  // 다른 탭으로 가면 폴링을 멈춘다
  window.addEventListener('hashchange', () => clearTimeout(timer), { once: true });
};

// ------------------------------------------------------------------ boot
window.addEventListener('hashchange', route);
loadStatus().then(route);
navDots();
