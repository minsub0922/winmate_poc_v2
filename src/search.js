import { ALL_LAYOUTS, PRODUCTS, SOLUTIONS, CASES, IND, IND_KW, P, S, C } from './data.js';
import { PARTS, RELATED, classifyPart, partText, effectiveType } from './parts.js';

// ---------- tokenizer: latin words + Hangul bigrams ----------
export function toks(s) {
  s = String(s || '').toLowerCase();
  const out = [];
  const re = /[a-z0-9][a-z0-9.+#'"]*|[가-힣]+/g;
  let m;
  while ((m = re.exec(s))) {
    const w = m[0].replace(/['".]+$/, '');
    if (/[가-힣]/.test(w)) {
      if (w.length === 1) out.push(w);
      else for (let i = 0; i < w.length - 1; i++) out.push(w.slice(i, i + 2));
    } else if (w.length > 1 || /\d/.test(w)) out.push(w);
  }
  return out;
}

const SYN = [
  [['경쟁', '경쟁사'], ['공급사', '비교', 'why', '포지셔닝', '점유율']],
  [['시장'], ['mi', '트렌드', '성장', '규모']],
  [['수량', '물량'], ['구성', '대수', '구성표']],
  [['비용', '가격', '견적'], ['tco', '구매', '투자', '총소유비용']],
  [['일정', '로드맵', '스케줄'], ['단계', '파일럿', '실행', '설치', '주차']],
  [['roi', '회수'], ['효과', '투자', '절감']],
  [['kpi', '지표'], ['효과', '전후', '수치']],
  [['조감도', '시안', '렌더'], ['전경', '배치', '도면', '존']],
  [['사례', '레퍼런스'], ['도입', '성과', '고객']],
  [['스펙', '사양'], ['비교표', '치수', '인증']],
  [['요약', '개요'], ['한 장', '경영진', '핵심']],
  [['공간'], ['존', '층', '동선', '맵']],
  [['동선', '하루'], ['시나리오', '시간대', '장면']],
  [['이미지', '사진'], ['실사', '컷', '갤러리']],
  [['페르소나', '사용자'], ['손님', '여정', '이해관계자']],
  [['문제', '과제', '페인'], ['원인', '영향', '불편']],
  [['가치', '밸류'], ['value', '기둥', '키 메시지']],
  [['표', '테이블'], ['비교표', '구성표', '대응표']],
];
function expand(q) {
  const base = String(q || '');
  let extra = '';
  for (const [keys, add] of SYN) if (keys.some((k) => base.toLowerCase().includes(k))) extra += ' ' + add.join(' ');
  return { base, extra };
}

// ---------- BM25 over layouts ----------
function docText(l) {
  const pn = PARTS[l.p] ? PARTS[l.p].label : '';
  const ind = l.ind && IND[l.ind] ? IND[l.ind].name : '';
  const sol = l.sol && S[l.sol] ? S[l.sol].name : '';
  const prods = (l.prods || []).map((id) => P[id] && P[id].model).join(' ');
  return [l.name, l.name, l.name, l.when, l.when, l.g, pn, pn, l.hl, l.hl, l.sub, l.code, ind, ind, sol, sol, prods, l.txt].join(' ');
}
// 라이브러리에서 뺀 레이아웃(l.retired)도 점수는 매겨, 대체한 사진 버전이 물려받게 하고 결과에서만 뺍니다
const DOCS = ALL_LAYOUTS.map((l) => { const t = toks(docText(l)); const tf = new Map(); for (const x of t) tf.set(x, (tf.get(x) || 0) + 1); return { l, tf, len: t.length }; });
const AVG = DOCS.reduce((a, d) => a + d.len, 0) / DOCS.length;
const DF = new Map();
for (const d of DOCS) for (const k of d.tf.keys()) DF.set(k, (DF.get(k) || 0) + 1);
const N = DOCS.length;
function bm25(qt, d) {
  let s = 0;
  for (const [t, w] of qt) {
    const f = d.tf.get(t); if (!f) continue;
    const idf = Math.log(1 + (N - (DF.get(t) || 0) + 0.5) / ((DF.get(t) || 0) + 0.5));
    s += w * idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * d.len / AVG));
  }
  return s;
}
function qmap(text, weight = 1, into = new Map()) { for (const t of toks(text)) into.set(t, (into.get(t) || 0) + weight); return into; }

const STOP = new Set(['있는', '있다', '하는', '하고', '한다', '된다', '되는', '위한', '대한', '통해', '그리고', '하지만', '먼저', '보여', '싶다', '지금', '올해', '뒤에', '같은', '모든', '우리', '이번', '없이', '많이', '가장', '다시', '이다', '에서', '으로', '것을', '수가', '때문']);
function matchedTerms(l, query) {
  const words = [...new Set(String(query || '').split(/[\s,·.!?'"“”‘’()]+/).map((w) => w.replace(/(은|는|이|가|을|를|의|에|도|로|와|과)$/, '')).filter((w) => w.length >= 2 && !STOP.has(w)))].sort((a, b) => b.length - a.length);
  const hay = (l.name + ' ' + l.when + ' ' + l.g + ' ' + l.hl + ' ' + l.txt).toLowerCase();
  return words.filter((w) => hay.includes(w.toLowerCase())).slice(0, 3);
}

function snippet(l, query) {
  const ws = String(query || '').split(/[\s,·]+/).filter((w) => w.length >= 2);
  const src = l.txt || '';
  for (const w of ws) { const i = src.toLowerCase().indexOf(w.toLowerCase()); if (i >= 0) return (i > 20 ? '…' : '') + src.slice(Math.max(0, i - 20), i + 46).trim() + '…'; }
  return '';
}

/** Free-text RAG-style retrieval with reasons. */
export function searchLayouts(query, ctx = {}, opts = {}) {
  const { base, extra } = expand(query);
  const qt = qmap(base, 1); qmap(extra, 0.45, qt);
  const want = classifyPart(base);
  const res = DOCS.map((d) => {
    let s = bm25(qt, d);
    const why = [];
    if (want && d.l.p === want) { s += 2.2; why.push('파트 유형 · ' + PARTS[want].label); }
    if (ctx.ind && d.l.ind === ctx.ind) { s += 1.2; why.push('업종 일치'); }
    if (ctx.ind && d.l.ind && d.l.ind !== ctx.ind) s -= 1.2;
    if (d.l.sol && ctx.solutions && ctx.solutions.includes(d.l.sol)) { s += 1; why.push(S[d.l.sol].name); }
    if (s > 0.4 && (d.l.pf || 0) >= 0.3) { s += Math.min(0.6, (d.l.pf || 0) * 0.8); why.push('사진 중심'); } // 사진으로 채워지는 레이아웃을 조금 앞으로
    const mt = matchedTerms(d.l, base);
    if (mt.length) why.unshift('"' + mt.join('", "') + '" 일치');
    return { l: d.l, score: s, why, snip: snippet(d.l, base) };
  });
  const byF = Object.fromEntries(res.map((r) => [r.l.f, r]));
  for (const r of res) {
    const rep = r.l.retired && byF[r.l.retired];
    if (rep && r.score > rep.score) { rep.score = r.score; rep.why = [...new Set([...r.why.filter((w) => w !== '사진 중심'), ...rep.why])]; if (!rep.snip) rep.snip = r.snip; }
  }
  return res.filter((r) => !r.l.retired && r.score > 0.4).sort((a, b) => b.score - a.score).slice(0, opts.limit || 30);
}

/** Recommend up to 20 layouts for a storyboard part. */
export function recommendLayouts(part, ctx = {}, limit = 20) {
  const rawType = part.type || classifyPart(part.name) || null;
  const isFree = rawType === 'free';
  const type = isFree ? null : rawType;
  const hint = isFree ? effectiveType(part) : null; // soft hint for a free topic
  const qtext = [part.name, partText(part)].join(' ');
  const qt = qmap(qtext, 1);
  if (type && PARTS[type]) qmap(PARTS[type].label + ' ' + PARTS[type].desc, 0.5, qt);
  const raw = DOCS.map((d) => ({ d, b: bm25(qt, d) }));
  const maxB = Math.max(1, ...raw.map((r) => r.b));
  const nProd = Math.max(0, Math.min(5, (ctx.products || []).length));
  const out = raw.map(({ d, b }) => {
    const l = d.l; let s = (b / maxB) * (type ? 4 : 7); const why = [];
    if (type && l.p === type) { s += 6; why.push('파트 유형 일치'); }
    else if (type && l.p2 === type) { s += 4; why.push('파트 유형 연관'); }
    else if (type && (RELATED[type] || []).includes(l.p)) { s += 1.2; why.push('연관 파트 · ' + PARTS[l.p].label); }
    else if (hint && (l.p === hint || l.p2 === hint)) { s += 2.5; why.push('내용으로 추론 · ' + PARTS[hint].label); }
    if (ctx.ind) {
      if (l.ind === ctx.ind) { s += 3; why.push('업종 맞춤 · ' + IND[ctx.ind].name); }
      else if (l.ind) s -= 3;
    } else if (l.ind) s -= 0.8;
    if (l.sol) {
      if ((ctx.solutions || []).includes(l.sol)) { s += 3; why.push('연결 솔루션 · ' + S[l.sol].name); }
      else s -= 2.4;
    }
    if (l.pc && nProd && ['products', 'spec', 'value'].includes(l.p)) {
      if (l.pc === nProd) { s += 2; why.push('제품 ' + nProd + '개 구성'); } else if (Math.abs(l.pc - nProd) === 1) s += 0.6;
    }
    const sharedProd = (l.prods || []).filter((id) => (ctx.products || []).includes(id));
    if (sharedProd.length) { s += Math.min(1.5, sharedProd.length * 0.5); why.push(sharedProd.map((id) => P[id].model).slice(0, 2).join(' · ') + ' 포함'); }
    const mt = matchedTerms(l, partText(part) + ' ' + part.name);
    if (mt.length) why.push('"' + mt[0] + '" 내용 일치');
    // 사진으로 요소가 채워지는 레이아웃을 우선 — 사진 비율만큼 가산
    const pf = l.pf || 0;
    if (pf >= 0.3) { s += Math.min(1.2, pf * 1.6); why.push('사진 중심'); }
    return { l, score: s, why };
  });
  // 같은 맥락의 텍스트 레이아웃이 잘 맞으면, 그 사진 중심 버전을 바로 위에 둡니다
  const byF = Object.fromEntries(out.map((r) => [r.l.f, r]));
  for (const r of out) {
    if (!(r.l.pv || []).length) continue;
    // 범용 사진 버전은 업종 맞춤 텍스트 레이아웃의 업종 가산점을 물려받지 않음 · 업종 사진 버전(ind 있음)은 그대로 물려받음
    const base = (x) => x.score - (!r.l.ind && x.l.ind && ctx.ind && x.l.ind === ctx.ind ? 3 : 0);
    const best = r.l.pv.map((f) => byF[f]).filter(Boolean).sort((a, b) => base(b) - base(a))[0];
    if (best && base(best) + 0.3 > r.score) { r.score = base(best) + 0.3; if (!r.why.includes('사진 중심')) r.why.push('사진 중심'); if (!best.l.retired) r.why.unshift('‘' + best.l.name + '’의 사진 버전'); }
  }
  return out.filter((r) => !r.l.retired).sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------- mention / context search ----------
const MENTION_DOCS = [
  ...PRODUCTS.map((p) => ({ ref: 'product:' + p.id, type: 'product', label: p.name, sub: p.model + ' · ' + p.cat, hay: (p.name + ' ' + p.model + ' ' + p.cat + ' ' + p.kw.join(' ') + ' ' + p.spaces.join(' ')).toLowerCase(), key: (p.model + ' ' + p.name).toLowerCase() })),
  ...SOLUTIONS.map((s) => ({ ref: 'solution:' + s.id, type: 'solution', label: s.name, sub: s.cat, hay: (s.name + ' ' + s.cat + ' ' + s.kw.join(' ') + ' ' + s.desc).toLowerCase(), key: s.name.toLowerCase() })),
  ...CASES.map((c) => ({ ref: 'case:' + c.id, type: 'case', label: c.cust, sub: (c.sub || c.title).slice(0, 60), date: c.date, hay: (c.title + ' ' + c.indRaw + ' ' + (c.ind && IND[c.ind] ? IND[c.ind].name : '') + ' ' + c.prod.join(' ') + ' ' + c.sol.join(' ') + ' ' + c.offer.join(' ') + ' ' + c.space.join(' ')).toLowerCase(), key: c.cust.toLowerCase() })),
];
export function mentionSearch(q, { types = null, limit = 6, exclude = [] } = {}) {
  q = String(q || '').trim().toLowerCase();
  const groups = { product: [], solution: [], case: [] };
  const ex = new Set(exclude);
  for (const d of MENTION_DOCS) {
    if (types && !types.includes(d.type)) continue;
    if (ex.has(d.ref)) continue;
    let s = 0;
    if (!q) s = d.type === 'case' ? 0.1 : 1;
    else {
      if (d.key.startsWith(q)) s += 10;
      else if (d.key.includes(q)) s += 6;
      if (d.hay.includes(q)) s += 3;
      const qt = toks(q); if (qt.length) { const ht = new Set(toks(d.hay)); const hit = qt.filter((t) => ht.has(t)).length; s += (hit / qt.length) * 3; }
    }
    if (s > 0.5 || !q) groups[d.type].push({ ...d, s: d.type === 'case' && !q ? (d.date || '') : s });
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => (typeof a.s === 'string' ? (b.s > a.s ? 1 : -1) : b.s - a.s));
    groups[k] = groups[k].slice(0, limit);
  }
  return groups;
}

// ---------- requirement context helpers ----------
export function reqText(pr) {
  const r = pr.req || {};
  const parts = [pr.title, pr.customer];
  if (r.free) parts.push((r.free || []).map((s) => (s.t != null ? s.t : (refLabel(s.ref)))).join(''));
  const f = r.form || {};
  parts.push(f.project, f.customer, f.target, f.note);
  for (const k of f.keymen || []) parts.push(k.name, ...(k.reqs || []).map((x) => (Array.isArray(x) ? x.map((s) => (s.t != null ? s.t : refLabel(s.ref))).join('') : x)));
  for (const fl of r.files || []) parts.push(fl.name, fl.memo || '', (fl.text || '').slice(0, 4000));
  return parts.filter(Boolean).join('\n');
}
function refLabel(ref) {
  const [t, id] = String(ref).split(':');
  if (t === 'product') return P[id] ? P[id].model : '';
  if (t === 'solution') return S[id] ? S[id].name : '';
  if (t === 'case') return C[id] ? C[id].cust : '';
  return '';
}

export function inferIndustry(text) {
  const s = String(text || '');
  let best = null, bs = 0;
  for (const [k, ws] of Object.entries(IND_KW)) {
    let n = 0; for (const w of ws) if (s.includes(w)) n += w.length > 2 ? 1.5 : 1;
    if (n > bs) { bs = n; best = k; }
  }
  return bs >= 1.5 ? best : null;
}

export function recommendContext(pr, ind, kind, limit = 6) {
  const text = reqText(pr);
  const linked = new Set((pr.ctx && pr.ctx[kind]) || []);
  const tl = text.toLowerCase();
  const tk = new Set(toks(text));
  if (kind === 'products') {
    // 큐레이션 40개는 업종 · 키워드를 사람이 붙였고, 제품 DB(사이트 · 카탈로그 600여 개)의 업종 · 공간은 원문에서 뽑은 색인이라
    // 업종만 맞는 것으로는 추천하지 않고(가중 1.0), 같은 분류에서는 4개까지만 — 노트북 수십 개가 추천을 채우지 않게.
    const all = PRODUCTS.filter((p) => !linked.has(p.id)).map((p) => {
      let s = p.cur ? 0.4 : 0; const why = [];
      if (ind && p.ind.includes(ind)) { s += p.cur ? 2.5 : 1.0; why.push(IND[ind].name + (p.cur ? '에서 많이 씀' : ' 업종 페이지 · 사례')); }
      for (const w of [p.model, ...(p.models || []), ...p.kw]) if (w && w.length >= 2 && tl.includes(w.toLowerCase())) { s += 3; why.push('"' + w + '" 언급'); break; }
      const sp = p.spaces.filter((x) => tl.includes(x)); if (sp.length) { s += (p.cur ? 1.5 : 1) * sp.length; why.push(sp.slice(0, 2).join(' · ') + ' 공간'); }
      const linkedSol = ((pr.ctx && pr.ctx.solutions) || []).filter((sid) => S[sid] && S[sid].with.includes(p.id));
      if (linkedSol.length) { s += 2; why.push(S[linkedSol[0]].name + '와 함께 씀'); }
      return { ref: 'product:' + p.id, id: p.id, label: p.name, sub: p.model + ' · ' + p.cat, s, why: why[0] || p.cat, sc: p.sc || p.cat };
    }).filter((x) => x.s > 1.2).sort((a, b) => b.s - a.s);
    const per = {}, out = [];
    for (const x of all) { if ((per[x.sc] = (per[x.sc] || 0) + 1) > 4) continue; out.push(x); if (out.length >= limit) break; }
    return out;
  }
  if (kind === 'solutions') {
    return SOLUTIONS.filter((x) => !linked.has(x.id)).map((x) => {
      let s = 0; const why = [];
      if (ind && x.ind.includes(ind)) { s += 2.5; why.push(IND[ind].name + ' 사례 다수'); }
      for (const w of [x.name, ...x.kw]) if (tl.includes(w.toLowerCase())) { s += 3; why.push('"' + w + '" 관련'); break; }
      const withLinked = x.with.filter((pid) => ((pr.ctx && pr.ctx.products) || []).includes(pid));
      if (withLinked.length) { s += 1.5 + withLinked.length * 0.5; why.push(P[withLinked[0]].model + '와 연동'); }
      return { ref: 'solution:' + x.id, id: x.id, label: x.name, sub: x.cat, s, why: why[0] || x.cat };
    }).filter((x) => x.s > 1).sort((a, b) => b.s - a.s).slice(0, limit);
  }
  // cases
  const lp = ((pr.ctx && pr.ctx.products) || []).map((id) => P[id]).filter(Boolean);
  const ls = ((pr.ctx && pr.ctx.solutions) || []).map((id) => S[id]).filter(Boolean);
  return CASES.filter((c) => !linked.has(String(c.id))).map((c) => {
    let s = 0; const why = [];
    if (ind && c.ind === ind) { s += 3; why.push('같은 업종'); }
    const ctoks = toks(c.title + ' ' + c.needs.join(' ') + ' ' + c.offer.join(' '));
    let hit = 0; for (const t of ctoks) if (tk.has(t)) hit++;
    s += Math.min(3, hit * 0.15);
    const off = c.offer.join(' ') + ' ' + c.title;
    const pm = lp.filter((p) => off.includes(p.model) || p.kw.some((k) => off.includes(k))); if (pm.length) { s += 1.5; why.push(pm[0].model + ' 도입'); }
    const sm = ls.filter((x) => off.toLowerCase().includes(x.name.toLowerCase()) || x.kw.some((k) => off.includes(k))); if (sm.length) { s += 1.5; why.push(sm[0].name + ' 도입'); }
    if (hit > 6) why.push('요구사항과 비슷한 니즈');
    return { ref: 'case:' + c.id, id: String(c.id), label: c.cust, sub: (c.sub || c.title).slice(0, 56), s, why: why[0] || (c.indRaw || '도입사례'), date: c.date };
  }).filter((x) => x.s > 1.2).sort((a, b) => b.s - a.s).slice(0, limit);
}

/** Image DB search for image slots. */
export function searchImages(db, q, group) {
  q = String(q || '').trim().toLowerCase();
  return db.filter((im) => (!group || im.group === group) && (!q || (im.model + ' ' + im.desc + ' ' + im.groupName + ' ' + im.pid).toLowerCase().includes(q)));
}
