// 구독 목차 조립 확인 · 구독 샘플 시나리오 만들기 — 앱의 목차 템플릿 조립기(toc_templates.js)를 그대로 돌린다.
//   node build/subs/compose.mjs check [--render out.json]     구독 양식 2종 × 업종 44 조립 · 칸 검사 (+ 렌더 확인용 L_SUB 장 목록)
//   node build/subs/compose.mjs samples                       app/web/src/domain/templates/subscription_scenarios.json (샘플 버티컬 시나리오 '구독 도입')
// 구독 레지스트리(app/data/subscriptions.json) → build/toc/build_content.py(toc_content.json v.sub · subs) → 이 스크립트 순서로 돌린다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const T = path.join(ROOT, 'app/web/src/domain/templates');
const toc = await import(path.join(T, 'toc_templates.js'));
const { SC } = await import(path.join(T, 'scenarios.js'));
const { FILLS, FILL_CUSTOMER } = await import(path.join(T, 'scenario_fills.js'));
const { STORY } = await import(path.join(T, 'scenario_story.js'));
const { SUBS_META, SUBS_SLOTS, SUBS_HTML } = await import(path.join(T, 'subs_layouts.js'));
const { TOC_HTML } = await import(path.join(T, 'toc_layouts.js'));
const { VSTD_HTML } = await import(path.join(T, 'vertical_std_layouts.js'));
const HTMLS = { ...VSTD_HTML, ...TOC_HTML, ...SUBS_HTML };
const content = JSON.parse(fs.readFileSync(path.join(T, 'toc_content.json'), 'utf8'));
toc.useTocContent(content);
const REG = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/data/subscriptions.json'), 'utf8'));
const mode = process.argv[2] || 'check';
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };

const SUBF = new Set(SUBS_META.map((m) => m.f));
const must = { L_SUB_PKG4: ['title', 'pl', 'nm', 'ln', 'pn0', 'pn3'], L_SUB_PKG3: ['title', 'pl', 'nm', 'ln', 'pn0', 'pn2'], L_SUB_PAY3: ['title', 'pn0', 'pn2', 'pp2_2', 'tag0'], L_SUB_VALUE3: ['title'] };
const errors = []; const sheets = [];
for (const tid of ['subs', 'subsl']) {
  for (const vid of content.order) {
    const s = toc.ensureTocScenario(tid, vid);
    if (!s) { errors.push(`${tid}/${vid}: 조립 실패`); continue; }
    const fills = FILLS[s.id]; const slides = s.flow.flatMap((g) => g.slides);
    if (slides.length !== fills.length) errors.push(`${tid}/${vid}: 장 ${slides.length} ≠ 채움 ${fills.length}`);
    fills.forEach((o, k) => {
      if (!SUBF.has(o.f)) return;
      const slots = SUBS_SLOTS[o.f];
      for (const name of must[o.f] || []) if (o.t[slots.t[name]] == null) errors.push(`${tid}/${vid} ${o.f}: 칸 '${name}' 비어 있음`);
      for (const [i, im] of Object.entries(o.img || {})) if (!im || !im.src) errors.push(`${tid}/${vid} ${o.f}: 사진 칸 ${i} 비어 있음`);
      sheets.push({ name: `${tid}__${vid}__${String(k + 1).padStart(2, '0')}_${o.f}`, f: o.f, module: 'app/web/src/domain/templates/subs_layouts.js', o });
    });
    const used = new Set(fills.map((o) => o.f));
    const core = tid === 'subs' ? ['L_SUB_PAIN', 'L_SUB_VALUE3', 'L_SUB_TERMS', 'L_SUB_PAY3', 'L_SUB_FLOW', 'L_SUB_BLUEPASS'] : ['L_SUB_ONE', 'L_SUB_TERMS', 'L_SUB_PAY3', 'L_SUB_FLOW'];
    const miss = core.filter((f) => !used.has(f));
    if (miss.length || ![...used].some((f) => /^L_SUB_PKG[34]$/.test(f))) errors.push(`${tid}/${vid}: 구독 핵심 장 빠짐 ${miss.join(', ')}`);
  }
}

if (mode === 'check') {
  const by = {}; for (const x of sheets) by[x.f] = (by[x.f] || 0) + 1;
  console.log(JSON.stringify({ decks: 2 * content.order.length, subSheets: sheets.length, byLayout: by, errors: errors.length }));
  for (const e of errors.slice(0, 20)) console.log('  ! ' + e);
  const out = arg('--render');
  if (out) {  // 업종마다 대표 하나씩만(패키지 장 · 납부안 장 · 가치 장) — 렌더 확인용
    const pick = sheets.filter((x) => /PKG|PAY3|VALUE3|PAIN|TERMS|FLOW/.test(x.f) && x.name.startsWith('subs__'));
    fs.writeFileSync(out, JSON.stringify(pick));
    console.log('render list', pick.length, '→', out);
  }
  process.exit(errors.length ? 1 : 0);
}

// 샘플 시나리오의 채움은 장의 모든 칸을 갖는다(app/tests/vertical-proposals.mjs — 빈 칸 · 빠진 칸 없음).
// 조립기가 기본 글(레지스트리 원문)을 그대로 둔 칸은 장 HTML 의 기본 글 · 사진으로 채운다.
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const plain = (h) => h.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, k) => ENT[k]);
function defaults(html) {
  const t = {}, img = {};
  for (const m of html.matchAll(/<(\w+)\b([^>]*\bdata-tb="(\d+)"[^>]*)>([\s\S]*?)<\/\1>/g)) if (!/data-img=/.test(m[2])) t[m[3]] = plain(m[4]);
  for (const m of html.matchAll(/<div\b([^>]*\bdata-img="(\d+)"[^>]*)>\s*<img\b([^>]*)>/g)) {
    const a = m[3], fill = /\bdata-fill="([^"]+)"/.exec(a)?.[1], src = /\bsrc="([^"]+)"/.exec(a)?.[1];
    const kind = /\bdata-kind="([^"]+)"/.exec(m[1])?.[1];
    img[m[2]] = { src: fill || (src && !src.startsWith('data:') ? src : ''), fit: kind === 'cut' || kind === 'icon' ? 'contain' : 'cover', keep: true };
  }
  return { t, img };
}
function complete(o, where) {
  const html = HTMLS[o.f]; if (!html) return o;
  const d = defaults(html), t = {}, img = {};
  for (const [i, v] of Object.entries(d.t)) { const x = o.t?.[i]; t[i] = x != null && String(x).trim() ? x : v; if (!String(t[i]).trim()) errors.push(`${where} ${o.f}: 글 칸 ${i} 비어 있음`); }
  for (const [i, v] of Object.entries(d.img)) { const x = o.img?.[i]; img[i] = x && x.src ? x : v; if (!img[i].src) errors.push(`${where} ${o.f}: 사진 칸 ${i} 비어 있음`); }
  return { ...o, t, img };
}

if (mode === 'samples') {
  // 공식 패키지 업종 4(구독 제안서) + 금융 지점 1(구독 전환 제안서) — 샘플 버티컬 시나리오 '구독 도입'
  // + 구독 솔루션이 포함된 구성(표준 제안서 + 구독 솔루션) 4 — 공식 패키지마다 하나(숙박 · 의료 · 오피스 · 공공). 키맨 요구에 구독 요구 한 줄을 더한다.
  // 이 덱들의 '구독 솔루션 제안' 목차가 서버 목차 추천(Scenario Composer)이 다른 구성에 더할 때 쓰는 모듈이다(app/api/poc/subscription_addon.py module_src).
  const PICK = [['subs', 'ed_univ'], ['subs', 'ht_large'], ['subs', 'md_hospital'], ['subs', 'of_hq'], ['subsl', 'fn_bank'],
    ['stdsub', 'ht_mid'], ['stdsub', 'md_clinic'], ['stdsub', 'of_sme'], ['stdsub', 'pb_agency']];
  // 공공 · 교육 · 국방은 연 예산 — 연 단위 분할 납부, 나머지는 월 납부
  const addonReq = (vid) => (/^(pb|mi|ed)_/.test(vid) ? '초기 비용 부담 없이 연 단위 분할 납부로 들이고, 관리 · A/S까지 포함하고 싶다' : '초기 비용 부담 없이 월 납부로 들이고, 관리 · A/S까지 포함하고 싶다');
  const out = { about: '샘플 버티컬 시나리오 — 구독 도입(B2B 삼성 AI 구독). build/subs/compose.mjs samples 가 목차 템플릿 조립기(구독 제안서 · 구독 전환 제안서)로 만든다. 손으로 고치지 말 것.',
    generated: REG.generated, run: REG.run, scenarios: [], fills: {}, story: {}, customers: {}, sources: [] };
  for (const [tid, vid] of PICK) {
    const s0 = toc.ensureTocScenario(tid, vid); const id = tid === 'stdsub' ? `bs_sub_std_${vid}` : `bs_sub_${vid}`;
    const sub = content.v[vid].sub;
    const s = { ...structuredClone(s0), id, req: 'subs', toc: undefined, tocV: undefined, subs: [sub.pkg, 'sub_b2b_ai', 'sub_bluepass_b2b'].filter(Boolean) };
    delete s.toc; delete s.tocV;
    const story = structuredClone(STORY[s0.id]);
    if (tid === 'stdsub') { // 구독 솔루션을 더한 이유 — 가장 비중이 큰 키맨의 요구에 구독 요구 한 줄
      const fin = story.keymen.findIndex((x) => /재무|구매|예산|경영지원|총무|행정/.test(x[0])); // 예산을 쥔 키맨, 없으면 비중이 가장 큰 키맨
      const k = fin >= 0 ? fin : story.keymen.reduce((a, x, i) => (x[1] > story.keymen[a][1] ? i : a), 0);
      story.keymen[k] = [story.keymen[k][0], story.keymen[k][1], [...story.keymen[k][2], addonReq(vid)]];
      if (!toc.addonsForRequirement(addonReq(vid)).length) errors.push(`${id}: 키맨 구독 요구가 구독 판정 규칙에 걸리지 않음`);
    }
    // 표준 제안서 샘플처럼 표지 묶음에는 표지 한 장만 — 목차 장은 첫 목차 묶음 앞('목차 · 01 …')으로(저장 · 다시 열기 때 표지 묶음이 한 장이어야 함)
    const [open, first] = s.flow;
    if (open.deck && open.slides.length > 1 && first) {
      const idx = open.slides.slice(1); open.slides = open.slides.slice(0, 1); delete open.deck;
      const old = first.name; first.name = '목차 · ' + old; first.slides = [...idx.map((x) => ({ ...x, role: `${s.flow.length - 1}개 장(章) 목차 · 사진 카드` })), ...first.slides];
      first.goal = `${s.flow.length - 1}개 장의 흐름 · ` + first.goal;
      if (story.parts[old]) { story.parts = Object.fromEntries(Object.entries(story.parts).map(([k, v]) => k === old ? ['목차 · ' + old, { ...v, items: [`${s.flow.length - 1}개 장(章) 목차 · 사진 카드`, ...v.items].slice(0, 6) }] : [k, v])); }
    }
    out.scenarios.push(s); out.fills[id] = FILLS[s0.id].map((o, k) => complete(structuredClone(o), `${id}#${k}`)); out.story[id] = story; out.customers[id] = FILL_CUSTOMER[s0.id];
  }
  out.sources = REG.sources.map((x) => ({ id: x.id, url: x.url, title: x.title }));
  const file = path.join(T, 'subscription_scenarios.json');
  fs.writeFileSync(file, JSON.stringify(out));
  console.log(JSON.stringify({ scenarios: out.scenarios.map((s) => [s.id, s.title, s.flow.reduce((n, g) => n + g.slides.length, 0)]), bytes: fs.statSync(file).size, errors: errors.length }));
  for (const e of errors.slice(0, 20)) console.log('  ! ' + e);
}
