// 시장조사 근거 — 업종 트렌드 장(당사의 이해 · 업종 트렌드)을 실제 웹 검색으로 검증한 근거로 채운다.
// 서버(app/api/poc/market_research.py)가 검색 → 원문 대조 검증 → 장 종류 선택 · 칸 값 구성까지 하고, 여기서는
//   · 레이아웃 자동 구성에 보낼 '종류별 견본 장'(trendSheetsFor) — 근거의 형태에 따라 서버가 장 종류를 바꿀 수 있게
//   · 서버가 준 칸별 근거(칸 번호 → [{ title, url, sub(인용) }])를 앱의 요소별 근거(x.ev)로 옮기기(evidenceFromSlots)
//   · 장 하나를 다시 조사해 채우기(researchTrendSheet — 직접 넣은 트렌드 장 · 요구사항이 바뀐 뒤 다시 맞출 때)
//   · 자유 서술형 시장 장에 넣을 검증된 근거 목록(researchSources)
// 만 한다. 값은 어디서도 지어내지 않는다 — 서버가 근거를 찾지 못하면 자리표시([00])가 남는다.
import { postJson } from '../api/client.js';
import { L, P, S, IND } from './catalog.js';
import { reqText, inferIndustry } from './search.js';
import { readUnits } from '../domain/slides/evidence.js';
import { tocUaSheets, tocVerticals, loadTocContent } from '../domain/templates/toc_templates.js';
import { TOC_SLOTS } from '../domain/templates/toc_layouts.js';
import { taskRequirementContextText } from './requirement-summary.js';

export const TREND_KIND = { L_TOC_TRLINE: 'line', L_TOC_TRSHARE: 'share', L_TOC_TRSTAT: 'stat', L_TOC_TRKEY: 'key' };
export const TREND_F = Object.fromEntries(Object.entries(TREND_KIND).map(([f, k]) => [k, f]));
export const TREND_LABEL = { line: '연도별 추이', share: '구성비', stat: '핵심 지표', key: '키워드' };
export const isTrendLayout = (f) => !!TREND_KIND[f];
/** 시장 · 트렌드 장인가(자유 서술형 포함) — 바깥 사실이 필요한 장 */
export const isMarketLayout = (f) => isTrendLayout(f) || (!!L[f] && L[f].p === 'market');

const slim = (v) => (typeof v === 'string' && v.length > 600 ? undefined : v);
const slimMap = (m) => Object.fromEntries(Object.entries(m || {}).map(([k, v]) => [k, slim(v)]).filter(([, v]) => v !== undefined));

/** 이 업종의 트렌드 장 견본(종류별 하나) — [{ kind, f, t, img }] */
export function trendSheetsFor(vid) {
  try {
    return tocUaSheets(vid).filter((x) => TREND_F[x.kind] === x.f).map((x) => ({ kind: x.kind, f: x.f, t: slimMap(x.ov.t), img: slimMap(x.ov.img) }));
  } catch (e) { return []; }
}

/** 제안서의 업종(버티컬) — 레이아웃 구성에서 고른 업종 → 공간 구성의 업종 → 업종 그룹의 첫 버티컬 */
export function verticalOf(p) {
  const verts = tocVerticals();
  const has = (id) => !!id && verts.some((v) => v.id === id);
  const lp = p.layoutPlan && p.layoutPlan.vertical; const sp = p.spacePlan && p.spacePlan.vertical && p.spacePlan.vertical.id;
  if (has(lp)) return verts.find((v) => v.id === lp);
  if (has(sp)) return verts.find((v) => v.id === sp);
  const g = p.ind || inferIndustry(reqText(p));
  return verts.find((v) => v.g === g) || null;
}

/** 서버에 보낼 조사 요청 — 업종 · 요구사항 · 연결 품목. 고객사 이름은 서버가 검색어에서 지운다(바깥에는 공개 키워드만 나간다). */
export function researchSpec(p, hints = []) {
  const v = verticalOf(p);
  const g = p.ind || inferIndustry(reqText(p));
  const industry = (v && v.full) || (g && IND[g] ? IND[g].name : '');
  let sumText = '';
  try { sumText = taskRequirementContextText(p, 'layout') || ''; } catch (e) { sumText = ''; }
  return {
    industry, industry_short: (v && v.short) || industry.split(/[(（[]/)[0].split(' · ')[0].trim() || '', ind: g || '', customer: p.customer || '', title: p.title || '',
    requirement: [sumText, reqText(p)].filter(Boolean).join(' ').replace(/\s+/g, ' ').slice(0, 2500),
    products: (p.ctx.products || []).map((id) => P[id]).filter(Boolean).slice(0, 8).map((x) => `${x.name} (${x.cat})`),
    solutions: (p.ctx.solutions || []).map((id) => S[id]).filter(Boolean).slice(0, 6).map((x) => x.name),
    hints, today: new Date().toLocaleDateString('sv-SE'),
  };
}

const namesOf = (f) => (TOC_SLOTS[f] && TOC_SLOTS[f].t) || {};
/** 트렌드 장 견본의 지표 이름들 — 서버 조사 계획의 힌트 */
export function hintOf(f, t) {
  const n = namesOf(f); const val = (k) => (n[k] != null && typeof t[n[k]] === 'string' ? t[n[k]] : '');
  return { kind: TREND_KIND[f], title: val('title'), labels: ['ct', 'cl', 'lb0', 'lb1', 'lb2', 'lb3', 'kw0', 'kw1', 'kw2'].map(val).filter(Boolean) };
}

const evItem = (e) => ({ k: 'web', title: String(e.title || e.host || '웹 자료').slice(0, 160), sub: String(e.sub || '').slice(0, 320), url: e.url, by: 'ai', ...(e.kind ? { kind: e.kind } : {}), ...(e.published ? { published: e.published } : {}),
  // checked: 이 근거를 원문과 대조해 확인한 날(근거 DB에 쌓인 것을 다시 쓰면 그때의 날짜)
  ...(e.checked ? { checked: String(e.checked).slice(0, 10) } : {}) });
/**
 * 칸 번호별 근거 → 요소(unit)별 근거. slotEv: { [칸 번호]: [{ title, url, sub, kind }] }
 * 한 요소에 칸이 여럿이면 근거를 합친다(같은 주소 · 같은 인용은 한 번).
 */
export function evidenceFromSlots(f, slotEv, reason = '') {
  const ev = {};
  if (!slotEv || typeof slotEv !== 'object') return ev;
  for (const u of readUnits(f)) {
    if (u.isImg) continue;
    const src = []; const seen = new Set();
    for (const i of u.tbs) for (const e of slotEv[i] || slotEv[String(i)] || []) {
      if (!e || !/^https?:\/\//.test(e.url || '')) continue;
      const key = e.url + '|' + (e.sub || '');
      if (seen.has(key)) continue;
      seen.add(key); src.push(evItem(e));
    }
    if (src.length) ev[u.key] = { by: 'ai', at: Date.now(), src: src.slice(0, 4), ...(reason ? { reason } : {}) };
  }
  return ev;
}
/** 서버가 준 조사 정보(검색어 · 시각 · 고른 이유)를 장에 남길 모양으로 */
export function researchRecord(r) {
  if (!r || typeof r !== 'object') return null;
  const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  return { ok: !!r.ok, kind: str(r.kind, 12), was: str(r.was, 12), why: str(r.why, 240), notes: (Array.isArray(r.notes) ? r.notes : []).filter((x) => typeof x === 'string').slice(0, 6).map((x) => x.slice(0, 240)),
    queries: (Array.isArray(r.queries) ? r.queries : []).filter((x) => typeof x === 'string').slice(0, 14).map((x) => x.slice(0, 120)),
    at: str(r.at, 40), engine: str(r.engine, 20), ...(Number.isFinite(r.sources) ? { sources: r.sources } : {}), ...(Number.isFinite(r.searched) ? { searched: r.searched } : {}), ...(Number.isFinite(r.rejected) ? { rejected: r.rejected } : {}),
    ...(Number.isFinite(r.reused) && r.reused > 0 ? { reused: r.reused } : {}) };  // reused: 근거 DB에 쌓여 있던 근거를 다시 쓴 건수
}

function fail(message, code) { const e = new Error(message); e.code = code; return e; }
/**
 * 트렌드 장 한 장을 다시 조사해 채운다. → { f, t: { [칸 번호]: 값 }, ev: { [칸 번호]: [근거] }, research, notes }
 * 근거를 찾지 못하면 { f: 지금 장, t: {}, ev: {}, research: { ok:false, why }, notes: [why] } — 값은 건드리지 않는다.
 */
export async function researchTrendSheet(p, x, { signal, others = [] } = {}) {
  await loadTocContent();
  const kind = TREND_KIND[x.f];
  if (!kind) throw fail('업종 트렌드 장이 아니에요.', 'bad_request');
  const v = verticalOf(p);
  const sheets = v ? trendSheetsFor(v.id) : [];
  const own = sheets.find((s) => s.kind === kind);
  const res = await postJson('/api/research/trend-sheets', {
    spec: researchSpec(p, [hintOf(x.f, (own && own.t) || {})]), want: [kind],
    // 덱에 이미 있는 트렌드 장 종류로는 바꾸지 않는다(한 덱에 한 번)
    avoid: others.map((f) => TREND_KIND[f]).filter(Boolean),
  }, signal);
  const sh = res && Array.isArray(res.sheets) ? res.sheets[0] : null;
  const meta = (res && res.research) || {};
  const info = { queries: meta.queries, at: meta.at, engine: meta.engine, sources: meta.sources, searched: meta.searched, rejected: meta.rejected, reused: meta.reused };
  if (!sh || !sh.filled) {
    const why = (sh && sh.why) || (res && res.message) || '검증을 통과한 시장 근거를 찾지 못했어요.';
    return { f: x.f, kind, t: {}, ev: {}, base: null, research: researchRecord({ ok: false, kind, was: kind, why, ...info }), notes: [why] };
  }
  const f = TREND_F[sh.kind] || x.f;
  const base = f !== x.f ? sheets.find((s) => s.kind === sh.kind) : null;
  if (f !== x.f && !base) {
    const why = '근거에 맞는 장 종류의 견본을 찾지 못했어요.';
    return { f: x.f, kind, t: {}, ev: {}, base: null, research: researchRecord({ ok: false, kind, was: kind, why, ...info }), notes: [why] };
  }
  const names = namesOf(f); const t = {}; const ev = {};
  for (const [name, value] of Object.entries(sh.v || {})) if (names[name] != null && typeof value === 'string') t[names[name]] = value;
  for (const [name, items] of Object.entries(sh.ev || {})) if (names[name] != null && Array.isArray(items)) ev[names[name]] = items;
  return { f, kind: sh.kind, t, ev, base, research: researchRecord({ ok: true, kind: sh.kind, was: kind, why: sh.why, notes: sh.notes, ...info }), notes: Array.isArray(sh.notes) ? sh.notes : [] };
}

/** 자유 서술형 시장 장에 넣을 검증된 근거 — [{ title, url, body(인용 포함), sub, kind }] (없으면 빈 배열 + reason) */
export async function researchSources(p, { signal } = {}) {
  try {
    const res = await postJson('/api/research/market', { spec: researchSpec(p) }, signal);
    return { ok: !!(res && res.ok), sources: (res && Array.isArray(res.sources) ? res.sources : []).filter((s) => s && /^https?:\/\//.test(s.url || '') && s.body), research: (res && res.research) || null, message: (res && res.message) || '' };
  } catch (e) {
    if (signal && signal.aborted) throw e;
    return { ok: false, sources: [], research: null, message: (e && e.message) || '시장 자료를 조사하지 못했어요.' };
  }
}

// ---- 자유 서술형 시장 장의 이름 검사 (서버 market_research.py ungrounded 와 같은 생각) ----
const normText = (t) => String(t == null ? '' : t).normalize('NFKC').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[\s,]+/g, '');
const PARTICLE = /(으로|에서|에게|까지|부터|처럼|보다|이라는|라는|의|은|는|이|가|을|를|과|와|에|로|도|만)$/;
const FILLER = new Set(['및', '등', '대비', '기준', '중', '내', '별', '당', '간', '약', '출처']);
/** 글을 이루는 낱말(조사 · 기호 · 숫자를 뗀 것) */
export function nameWords(text) {
  const out = [];
  for (let w of String(text || '').split(/[\s·/,()[\]~\-–—:;"'‘’“”]+/)) {
    w = w.trim();
    if (w.length >= 3) w = w.replace(PARTICLE, '') || w;
    if (w && !FILLER.has(w) && !/^[\d.%+p]+$/.test(w)) out.push(w);
  }
  return out;
}
/**
 * 한 요소(카드)의 이름 · 설명 낱말 가운데 근거 문장에 실제로 나오는 비율(0~1). 낱말 끝 한 글자의 차이는 봐준다.
 * 웹 근거의 값이 근거에 있더라도, 그 값을 감싼 이름이 근거와 다른 말이면(예: 도입률 13.0%를 '연평균 성장률' 칸에) 값은 맞고 장은 틀린다.
 */
export function labelCoverage(labelText, evidenceText) {
  const words = nameWords(labelText); if (!words.length) return 1;
  const hay = normText(evidenceText);
  const hit = words.filter((w) => { const n = normText(w); return !n || hay.includes(n) || (n.length >= 3 && hay.includes(n.slice(0, -1))); }).length;
  return hit / words.length;
}
