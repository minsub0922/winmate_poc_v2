// Proposal profile + rule-based checks for every criterion.
// Rule results are (a) evidence handed to Claude and (b) the fallback score when AI is unavailable.
import { PRODUCTS, SOLUTIONS, CASES, IND, IND_KW, LAYOUTS } from '../data.js';
import { classifyPart, PARTS } from '../parts.js';
import { toks } from '../search.js';
import { CRITERIA, CATS, CAT, CR } from './criteria.js';
import { isFooter } from './parse.js';

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const uniq = (a) => Array.from(new Set(a));
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const cut = (s, n = 60) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const NOW_Y = new Date().getFullYear();

// ---------- matchers ----------
function modelRe(model) {
  const m = String(model).trim();
  const code = m.match(/^([A-Z]{1,4})-?(\d{2,3})([A-Z]{1,3})?(-[A-Z0-9]{1,3})?$/);
  if (code) return new RegExp('(?<![A-Za-z0-9])' + code[1] + '[- ]?' + code[2] + (code[3] || '') + (code[4] ? '(?:' + esc(code[4]) + ')?' : '') + '(?![A-Za-z0-9])', 'g');
  if (/^[A-Z]{2,4}$/.test(m)) return new RegExp('(?<![A-Za-z0-9])' + m + '(?![a-z])', 'g');
  return new RegExp(esc(m), 'gi');
}
const KW_COUNT = {};
for (const p of PRODUCTS) if (p.cur) for (const k of p.kw || []) KW_COUNT[k] = (KW_COUNT[k] || 0) + 1;
const PROD_RE = PRODUCTS.map((p) => {
  // 제품 DB(사이트 · 카탈로그) 항목은 모델코드(옵션 모델 전부)로만 찾음 — 이름 · 필터 라벨은 일반어가 많아 오탐
  if (!p.cur) return { p, res: [...new Set([p.model, ...(p.models || [])])].filter((m) => m && m.length >= 5).map((m) => new RegExp('(?<![A-Za-z0-9])' + esc(m) + '(?![A-Za-z0-9])', 'g')) };
  const extra = (p.kw || []).filter((k) => /^[A-Za-z][A-Za-z0-9 .]+$/.test(k) && k.length >= 4 && KW_COUNT[k] === 1 && !/^(LED|Kiosk|LYNK)$/i.test(k));
  return { p, res: [modelRe(p.model.split(' ')[0] === 'IAB' ? 'IAB' : p.model), new RegExp(esc(p.name), 'gi'), ...extra.map((k) => new RegExp('(?<![A-Za-z])' + esc(k) + '(?![A-Za-z])', 'gi'))] };
});
const SOL_RE = SOLUTIONS.map((s) => ({ s, res: [new RegExp(esc(s.name), 'gi'), ...(s.kw || []).filter((k) => k.length >= 4 && !/IoT|CMS|보안|관제|서비스/.test(k)).map((k) => new RegExp(esc(k), 'gi'))] }));
const MODEL_ANY = /(?<![A-Za-z0-9])([A-Z]{2,3})-?(\d{2,3})([A-Z]{1,3})(?:-([A-Z0-9]{1,4}))?(?![A-Za-z0-9])/g;
const MODEL_STOP = /^(CO|PM|NO|SO|ISO|IP|USB|HDMI|DP|UHD|FHD|QHD|LTE|MIL|STD|KS|EN|IEC|UL|RTX|GTX|ESG|KPI|ROI|Q[1-4]|H[12]|FY|CY|AI|TV|PC|ERP|POS|NFC|UWB|PTT|RFP|SKU|SLA|HP)$/;
const BRANDS = [
  ['MagicINFO', /magic\s?info/gi], ['SmartThings', /smart\s?things/gi], ['The Wall', /the\s?wall(?![a-z])/gi], ['Samsung VXT', /samsung\s?vxt/gi],
  ['Knox', /\bknox\b/gi], ['Galaxy', /\bgalaxy\b/gi], ['WindFree', /wind\s?free/gi], ['b.IoT', /\bb\.?\s?iot\b/gi], ['LYNK Cloud', /lynk\s?cloud/gi], ['Tizen', /\btizen\b/gi], ['Samsung DeX', /samsung\s?dex/gi],
];
const COMPETITORS = [['LG전자', /LG\s?전자|\bLG(?!U\+|\s?유플러스|\s?CNS)\b|엘지/g], ['Sony', /\bSony\b|소니/g], ['Panasonic', /Panasonic|파나소닉/g], ['Philips', /Philips|필립스/g], ['NEC', /\bNEC\b/g], ['Sharp', /\bSharp\b|샤프(?!\s?펜)/g], ['BOE', /\bBOE\b/g], ['Hisense', /Hisense|하이센스/g], ['TCL', /\bTCL\b/g], ['Daikin', /Daikin|다이킨/g], ['Carrier', /\bCarrier\b|캐리어(?!\s?가방)/g], ['Apple', /\bApple\b|애플/g], ['Lenovo', /Lenovo|레노버/g]];
const ORG_SUFFIX = '(?:호텔|병원|의료원|대학교|대학|자산운용|건설|은행|커피|프랜차이즈|그룹|공사|리조트|백화점|마트|증권|보험|캐피탈|카드|물류|물류센터|전자|화학|제약|푸드|리테일|몰|공항|구청|시청|군청|학교|센터|파크|컨벤션|카페|베이커리|다이닝|빌딩|오피스|사옥|산업|테크|통신|에너지|홀딩스|주식회사)';
const ORG_RE = new RegExp('(?:\\(주\\)\\s?|㈜\\s?)?([A-Z가-힣][A-Za-z0-9가-힣&]{0,10}(?:[ \\t][A-Za-z0-9가-힣&]{1,8})?[ \\t]?' + ORG_SUFFIX + ')(?![가-힣])', 'g');
const ORG_BAD = /(?:과|와|의|을|를|은|는|에|로|도|이|가|및|등)$|^(?:객실|로비|화면|웰컴|매장|본사|해외|국내|전국|시장|업계|글로벌|스마트|디지털|프리미엄|비즈니스|주요|대형|신규|기존|전체|일반|호텔|병원|공항|센터|그룹|오피스|빌딩|카페)$/;
const ORG_SELF = /^(?:삼성|삼성전자|Samsung)/;
function orgOk(k) { const toks = k.split(/\s+/); if (toks.length > 1 && toks.slice(0, -1).some((t) => ORG_BAD.test(t))) return false; if (ORG_SELF.test(k)) return false; if (/^\d/.test(k)) return false; return true; }
function inferInd(all, cover, customer) {
  let best = null, bs = 0;
  for (const [k, ws] of Object.entries(IND_KW)) {
    let n = 0;
    for (const w of ws) {
      const c = Math.min(6, all.split(w).length - 1); if (!c) continue;
      n += c * (w.length > 2 ? 1.5 : 1) + (cover.includes(w) ? 4 : 0) + (customer && customer.includes(w) ? 12 : 0);
    }
    if (n > bs) { bs = n; best = k; }
  }
  return bs >= 3 ? best : null;
}
const SAMPLE_NAMES = uniq(LAYOUTS.map((l) => l.sample).filter(Boolean));
const PLACEHOLDER = [
  [/\[\s*0+(?:\.0+)?\s*\]|\[\s*N\s*\]|\[\s*기간\s*\]|\[\s*조사\s*기관[^\]]*\]|\[\s*(?:고객사|회사명|제품명|날짜|연도|금액|이름|담당자)[^\]]*\]/g, '자리표시'],
  [/O{3,}|○{2,}|◯{2,}|△{2,}|□{3,}/g, '빈칸 기호'],
  [/(?<![A-Za-z])X{2,}(?![A-Za-z])|xxx+/g, 'XX 자리표시'],
  [/텍스트를 입력|제목을 입력|내용을 입력|여기에 (?:입력|텍스트)|Click to (?:add|edit)|Lorem ipsum|placeholder|TBD(?![a-z])|TBA(?![a-z])|\{\{[^}]*\}\}/gi, '템플릿 문구'],
];
const ABSOLUTE = /국내\s?최초|세계\s?최초|업계\s?최초|최초로|최고의|최고 수준|유일한|유일하게|완벽한|완벽하게|100\s?%\s?(?:보장|해결|만족|절감)|무조건|반드시\s?(?:보장|해결)|보장합니다|업계\s?1위|No\.?\s?1|넘버원|세계\s?최대|국내\s?최대|독보적/g;
const INTERNAL = /원가|마진율?|내부\s?단가|매입가|공급가|할인율|DC\s?율|네고|사내\s?한정|내부\s?검토용|Internal\s?Only|추후\s?확인|확인\s?필요|담당자\s?확인|\?\?\?|TODO/gi;
const PAIN = /문제|과제|불편|어려움|비효율|손실|지연|민원|낭비|병목|이슈|리스크|부담|한계|누락|불일치|대기/g;
const DM = /대표이사|대표|CEO|경영진|본부장|임원|의사결정|결정권자|구매팀|재무|CFO|시설팀|운영본부|총지배인|원장|이사장|사업부장|팀장/g;
const SOURCE = /출처|Source|자료\s*[:：]|기준\s*[:：]|조사\s*[:：]|\(\s*[^)]{2,30},\s*(?:19|20)\d{2}\s*\)/i;
const FIG = /\d[\d,.]*\s*(?:%|퍼센트|조\s?원|억\s?원|만\s?원|원|조|억|천만|백만|만|배|개\s?매장|개소|개점|매장|객실|실|병상|대|면|명|곳|층|㎡|m2|평|nit|nits|니트|인치|″|"|시간|분|일|주|개월|년|kWh|kW|MW|W|\$|달러|USD|KRW|p|pt)/g;
const ABBR_OK = new Set(['TV', 'PC', 'AI', 'LED', 'LCD', 'OK', 'IT', 'CEO', 'UHD', 'FHD', 'USB', 'HDMI', 'IP', 'PDF', 'PPT', 'QR', 'IoT', 'SNS', 'APP', 'UI', 'UX', 'CS', 'AS', 'KT', 'SK', 'LG', 'IBK', 'KB', 'NH', 'DT', 'VS', 'NO', 'MI', 'VP', 'BEST', 'NEW', 'MZ', 'B2B', 'B2C', 'OS', 'ID', 'CCTV', 'WIFI', 'WI', 'FI', 'GB', 'TB', 'MB', 'HD', 'SAMSUNG', 'CONFIDENTIAL', 'THE', 'WALL', 'VXT', 'KNOX', 'DEX', 'LYNK', 'SET', 'EA', 'DID']);

function textOf(doc) { return doc.units.map((u) => (u.title ? u.title + '\n' : '') + u.text).join('\n\n'); }
function unitHits(doc, re, field = 'text') {
  const out = [];
  for (const u of doc.units) {
    const s = field === 'all' ? (u.title + '\n' + u.text) : field === 'notes' ? u.notes : u.text + (u.title && !u.text.includes(u.title) ? '\n' + u.title : '');
    if (!s) continue;
    re.lastIndex = 0; let m;
    while ((m = re.exec(s))) { out.push({ u: u.n, t: m[0], ctx: cut(s.slice(Math.max(0, m.index - 18), m.index + m[0].length + 18), 70) }); if (!re.global) break; }
  }
  return out;
}
const unitsOf = (hits) => uniq(hits.map((h) => h.u)).sort((a, b) => a - b);

// ---------- part classification ----------
const STAGE = { cover: 0, overview: 0, requirements: 0, market: 1, customer: 1, user: 1, competition: 1, insight: 1, challenge: 1, value: 2, effect: 2, dss: 3, products: 3, scenario: 3, birdseye: 3, solution: 3, spec: 3, bom: 3, case: 4, why: 4, execution: 5, cost: 5, closing: 6, appendix: 7 };
const TEXT_RULES = [
  ['cover', /제안서|Proposal|귀중|귀하/i], ['overview', /요약|Executive Summary|한눈에/i], ['market', /시장 규모|성장률|CAGR|시장 전망|점유율|트렌드/i], ['competition', /경쟁사|경쟁 비교|비교표/],
  ['challenge', /문제점|Pain|과제|어려움|불편/i], ['value', /가치|Value Proposition|핵심 메시지/i], ['effect', /기대\s?효과|ROI|절감 효과|투자 회수/i],
  ['products', /라인업|제품 소개|모델|사양/], ['scenario', /시나리오|동선|고객 여정/], ['solution', /솔루션|구성도|아키텍처/], ['case', /도입 사례|구축 사례|레퍼런스|Reference/i],
  ['why', /Why Samsung|왜 삼성|삼성의 강점/i], ['execution', /추진 일정|로드맵|일정|단계별|파일럿|유지보수|추진 체계/], ['cost', /비용|TCO|견적|구매 방식|리스|렌탈/i],
  ['closing', /감사합니다|Thank you|Q\s?&\s?A|문의|연락처|Next Step|다음 단계/i], ['appendix', /부록|Appendix/i],
];
function classifyUnit(u, i, n) {
  if (i === 0 && u.words < 60) return 'cover';
  const byTitle = classifyPart(u.title);
  if (byTitle) return byTitle;
  if (/목차|Contents|Agenda|순서/i.test(u.title) || (i <= 2 && /목차|Contents|Agenda/i.test(u.text.slice(0, 60)))) return 'cover';
  for (const [k, re] of TEXT_RULES) if (re.test(u.title)) return k;
  if (i >= n - 2) for (const k of ['closing']) { const r = TEXT_RULES.find((x) => x[0] === k); if (r[1].test(u.text.slice(0, 200))) return k; }
  const head = u.text.slice(0, 220);
  for (const [k, re] of TEXT_RULES) if (k !== 'cover' && re.test(head)) return k;
  return null;
}

// ---------- geometry checks (PPTX) ----------
function geomIssues(doc) {
  const out = []; // {u, kind, note, box?}
  if (doc.kind !== 'pptx') return out;
  const norm = 960 / (doc.slideWpt || 960);
  const titlePos = [];
  for (const u of doc.units) {
    if (u.hidden) continue;
    const tb = u.boxes.filter((b) => b.text && !b.guessed);
    for (const b of u.boxes) {
      if (b.guessed) continue;
      const out1 = b.x < -0.015 || b.y < -0.015 || b.x + b.w > 1.015 || b.y + b.h > 1.015;
      const area = b.w * b.h;
      if (out1 && (b.kind === 'text' || (b.kind === 'pic' && area < 0.85 && (Math.min(b.x + b.w, 1) - Math.max(b.x, 0)) * (Math.min(b.y + b.h, 1) - Math.max(b.y, 0)) < area * 0.9))) {
        out.push({ u: u.n, kind: 'out', note: (b.kind === 'text' ? '텍스트 상자' : '이미지') + '가 장표 밖으로 나감' + (b.text ? ` (“${cut(b.text, 18)}”)` : ''), box: b });
        b.flag = 'out';
      }
      if (b.kind === 'text' && b.autofit && b.autofit < 0.86) { out.push({ u: u.n, kind: 'shrink', note: `글자가 ${Math.round(b.autofit * 100)}%로 자동 축소됨 (“${cut(b.text, 18)}”)`, box: b }); b.flag = b.flag || 'shrink'; }
      if (b.kind === 'text' && !b.spAuto && !b.autofit && b.sizes && b.sizes.length && b.hPt > 4 && b.wPt > 10) {
        // estimate needed height
        let lines = 0;
        const avg = b.sizes.reduce((a, [s, n]) => a + s * n, 0) / Math.max(1, b.sizes.reduce((a, [, n]) => a + n, 0));
        for (const pl of b.paras) { const perLine = Math.max(1, Math.floor((b.wPt - 14) / (avg * 0.92))); lines += Math.max(1, Math.ceil(pl / perLine)); }
        const need = lines * avg * 1.2 + 7;
        if (need > b.hPt * 1.35 + 8 && b.y + b.h * (need / b.hPt) > 0.6) { out.push({ u: u.n, kind: 'overflow', note: `글자가 상자보다 넘칠 가능성 (“${cut(b.text, 18)}”)`, box: b }); b.flag = b.flag || 'overflow'; }
      }
    }
    // overlaps between text boxes
    for (let i = 0; i < tb.length; i++) for (let j = i + 1; j < tb.length; j++) {
      const a = tb[i], c = tb[j];
      if (isFooter(a) || isFooter(c)) continue;
      const ix = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x); const iy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
      if (ix <= 0 || iy <= 0) continue;
      const inter = ix * iy; const small = Math.min(a.w * a.h, c.w * c.h);
      if (small > 0 && inter / small > 0.22 && a.chars > 1 && c.chars > 1) {
        out.push({ u: u.n, kind: 'overlap', note: `텍스트 겹침: “${cut(a.text, 14)}” ↔ “${cut(c.text, 14)}”`, box: a, box2: c });
        a.flag = a.flag || 'overlap'; c.flag = c.flag || 'overlap';
      }
    }
    // near-miss alignment of left edges
    const lefts = tb.filter((b) => !isFooter(b) && b.w < 0.9).map((b) => b.x);
    let near = 0;
    for (let i = 0; i < lefts.length; i++) for (let j = i + 1; j < lefts.length; j++) { const d = Math.abs(lefts[i] - lefts[j]); if (d > 0.002 && d < 0.009) near++; }
    if (near >= 2) out.push({ u: u.n, kind: 'align', note: `왼쪽 정렬이 미세하게 어긋난 상자 ${near}쌍` });
    const t = u.boxes.find((b) => b.ph === 'title' || b.ph === 'ctrTitle');
    if (t && u.n > 1 && u.words > 15) titlePos.push({ u: u.n, x: t.x, y: t.y });
    // small fonts
    const small = tb.filter((b) => !isFooter(b) && b.min && b.min * norm < 10 && b.chars > 8);
    if (small.length) out.push({ u: u.n, kind: 'small', note: `10pt 미만 글자 상자 ${small.length}개 (최소 ${Math.min(...small.map((b) => b.min * norm)).toFixed(1)}pt)` });
  }
  if (titlePos.length >= 4) {
    const key = (p) => Math.round(p.x * 100) + ':' + Math.round(p.y * 100);
    const cnt = {}; for (const p of titlePos) cnt[key(p)] = (cnt[key(p)] || 0) + 1;
    const mode = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
    const [mx, my] = mode.split(':').map(Number);
    for (const p of titlePos) if (Math.abs(p.x * 100 - mx) > 2 || Math.abs(p.y * 100 - my) > 2) out.push({ u: p.u, kind: 'title', note: '제목 위치가 다른 장과 달라요' });
  }
  return out;
}

// ---------- profile ----------
export function buildProfile(doc, settings = {}) {
  const all = textOf(doc);
  const n = doc.units.length;
  const parts = doc.units.map((u, i) => classifyUnit(u, i, n));
  doc.units.forEach((u, i) => { u.part = parts[i]; });
  // products
  const prodHits = [];
  for (const { p, res } of PROD_RE) {
    const forms = [];
    for (const re of res) { re.lastIndex = 0; let m; while ((m = re.exec(all))) forms.push(m[0]); }
    if (forms.length) prodHits.push({ id: p.id, model: p.model, name: p.name, forms: uniq(forms), count: forms.length });
  }
  // model-like codes
  const codes = []; MODEL_ANY.lastIndex = 0; let mm;
  while ((mm = MODEL_ANY.exec(all))) { if (!MODEL_STOP.test(mm[1]) && !/^(19|20)$/.test(mm[2])) codes.push(mm[0]); }
  const codeSet = uniq(codes);
  const known = new Set(prodHits.flatMap((h) => h.forms.map((f) => f.replace(/[- ]/g, '').toUpperCase())));
  const unknownModels = codeSet.filter((c) => !known.has(c.replace(/[- ]/g, '').toUpperCase()));
  // generation mismatch vs catalog family (e.g. QM55B vs QM55C)
  const older = [];
  for (const c of unknownModels) {
    const m = c.replace(/[- ]/g, '').match(/^([A-Z]{2,3})(\d{2,3})([A-Z]{1,3})/); if (!m) continue;
    const fam = PRODUCTS.find((p) => { if (!p.cur) return false; const pm = p.model.replace(/[- ]/g, '').match(/^([A-Z]{2,3})(\d{2,3})([A-Z]{1,3})/); return pm && pm[1] === m[1] && pm[3] !== m[3]; });
    if (fam) older.push({ code: c, catalog: fam.model, family: m[1] });
  }
  const sols = [];
  for (const { s, res } of SOL_RE) { let c = 0; for (const re of res) { re.lastIndex = 0; c += (all.match(re) || []).length; } if (c) sols.push({ id: s.id, name: s.name, count: c }); }
  // customer
  const cover = doc.units[0] ? doc.units[0].title + '\n' + doc.units[0].text : '';
  let customer = (settings.customer || '').trim();
  const orgCount = {};
  ORG_RE.lastIndex = 0; let om;
  while ((om = ORG_RE.exec(all))) { const k = om[1].replace(/\s+/g, ' ').trim(); if (k.length >= 3 && orgOk(k)) orgCount[k] = (orgCount[k] || 0) + 1; }
  if (!customer) {
    const pats = [/([A-Za-z0-9가-힣&()·㈜]{1,24}(?:[ \t][A-Za-z0-9가-힣&]{1,14}){0,2})[ \t]*(?:귀중|귀하|御中)/, /(?:제안\s*대상|고객사|Client)[ \t]*[:：][ \t]*([^\n|]{2,30})/i, /([A-Za-z0-9가-힣&]{2,16}(?:[ \t][A-Za-z0-9가-힣&]{1,12})?)[ \t]*(?:을|를)[ \t]*위한/];
    for (const re of pats) { const m = cover.match(re) || all.slice(0, 4000).match(re); if (m) { customer = m[1].replace(/^\(주\)\s?|^㈜\s?/, '').trim(); break; } }
    if (!customer) {
      const coverOrg = Object.keys(orgCount).filter((k) => cover.includes(k)).sort((a, b) => orgCount[b] - orgCount[a])[0];
      const top = Object.entries(orgCount).sort((a, b) => b[1] - a[1])[0];
      customer = coverOrg || (top && top[1] >= 3 ? top[0] : '');
    }
  }
  const short = customer.replace(/\s*(프랜차이즈|주식회사|\(주\)|㈜|그룹|코리아)\s*$/, '').trim();
  const customerUnits = short ? doc.units.filter((u) => (u.title + u.text).includes(short)).map((u) => u.n) : [];
  const caseCust = CASES.map((c) => c.cust).filter((c) => c && c.length >= 3 && all.includes(c));
  const ind = settings.ind || inferInd(all, cover, customer) || null;
  // figures, years
  const figures = (all.match(FIG) || []).length;
  const yearHits = [];
  for (const u of doc.units) {
    const s = u.title + '\n' + u.text; const re = /(?<!\d)(20[0-3]\d|199\d)(?:\s?년|\.|\s|$|\)|,|~|-)/g; let y;
    while ((y = re.exec(s))) { const ctx = s.slice(Math.max(0, y.index - 30), y.index + 30); yearHits.push({ u: u.n, y: Number(y[1]), data: SOURCE.test(ctx) || /기준|조사|통계|전망|보고서|리포트|발표|Report/i.test(ctx), ctx: cut(ctx, 60) }); }
  }
  const competitors = COMPETITORS.filter(([, re]) => { re.lastIndex = 0; return re.test(all); }).map(([k]) => k);
  const brandTerms = BRANDS.filter(([, re]) => { re.lastIndex = 0; return re.test(all); }).map(([k]) => k);
  // abbreviations
  const abbrCount = {}; const abRe = /(?<![A-Za-z])([A-Z]{2,6})(?![A-Za-z])/g; let ab;
  while ((ab = abRe.exec(all))) { const k = ab[1]; if (!ABBR_OK.has(k) && !/^[A-Z]{2,3}\d/.test(k)) abbrCount[k] = (abbrCount[k] || 0) + 1; }
  const abbrs = Object.keys(abbrCount).filter((k) => !codeSet.some((c) => c.startsWith(k)));
  const fontsAll = Object.keys(doc.meta.fonts || {}).filter((f) => !/wingdings|symbol|webdings|dingbat|marlett/i.test(f));
  const req = settings.reqText || '';
  const x = {
    kind: doc.kind, slides: !!doc.slides, units: n, unitLabel: doc.unitLabel, visual: !!(doc.images && doc.images.length) || doc.units.some((u) => u.thumb),
    ind, indName: ind && IND[ind] ? IND[ind].name : '', customer, customerShort: short, customerUnits, orgCount, caseCust,
    products: prodHits.map((h) => h.model), prodHits, models: codeSet, unknownModels, older,
    solutions: sols.map((s) => s.name), solHits: sols,
    figures, years: yearHits, competitors, brandTerms, abbrs, fontCount: fontsAll.length, fonts: fontsAll,
    charts: doc.units.reduce((a, u) => a + u.nChart, 0), tables: doc.units.reduce((a, u) => a + u.nTable, 0), pics: doc.units.reduce((a, u) => a + u.nPic, 0),
    marketUnits: parts.filter((p) => p === 'market' || p === 'insight' || p === 'competition').length,
    compUnits: parts.filter((p) => p === 'competition').length, costUnits: parts.filter((p) => p === 'cost').length,
    parts, linkedReq: !!req.trim(), reqText: req, reqList: settings.reqList || [], rfpLike: /RFP|제안요청서|과업지시서|요구사항/.test(all),
    rfpFormat: !!req.trim() && /RFP|제안요청|목차|형식|분량|제출/.test(req),
    metaAvail: doc.kind !== 'txt' && !!(doc.meta.title || doc.meta.creator || doc.meta.template || doc.meta.lastModifiedBy),
    note: settings.note || '',
  };
  x.geom = geomIssues(doc);
  return x;
}

// ---------- selection ----------
export function selectCriteria(x, override) {
  return CRITERIA.map((c) => {
    const [ok, why] = c.when(x);
    if (override && override[c.id] != null) return { id: c.id, applied: !!override[c.id], why: override[c.id] ? (ok ? why : '직접 추가한 기준') : '직접 뺀 기준', manual: true };
    return { id: c.id, applied: ok, why };
  });
}

// ---------- rule signals ----------
const R = (score, notes = [], units = []) => ({ score: clamp(score), notes: notes.filter(Boolean), units: uniq(units).sort((a, b) => a - b) });
const listHits = (hits, max = 4) => hits.slice(0, max).map((h) => `${h.u}장 “${cut(h.t, 24)}”`).join(', ') + (hits.length > max ? ` 외 ${hits.length - max}곳` : '');
function scaleConsistency(doc) {
  const by = {}; const re = /(\d[\d,]*)\s*(개\s?매장|개\s?점포|개\s?지점|개소|객실|병상|개\s?층)/g;
  for (const u of doc.units) { const s = u.title + '\n' + u.text; re.lastIndex = 0; let m; while ((m = re.exec(s))) { const k = m[2].replace(/\s/g, ''); const v = m[1].replace(/,/g, ''); (by[k] = by[k] || {})[v] = (by[k][v] || []).concat(u.n); } }
  return Object.entries(by).filter(([, vs]) => Object.keys(vs).length >= 2 && Object.values(vs).filter((a) => a.length >= 1).length >= 2).map(([k, vs]) => ({ k, vs }));
}
function pctConsistency(doc) {
  const by = {}; const re = /([가-힣A-Za-z]{2,8})\s?(?:사용량|비용|시간)?\s?(\d+(?:\.\d+)?)\s?%\s?(절감|감소|향상|증가|개선|단축|성장)/g;
  for (const u of doc.units) { const s = u.title + '\n' + u.text; re.lastIndex = 0; let m; while ((m = re.exec(s))) { const k = m[1] + ' ' + m[3]; (by[k] = by[k] || {})[m[2]] = (by[k][m[2]] || []).concat(u.n); } }
  return Object.entries(by).filter(([, vs]) => Object.keys(vs).length >= 2).map(([k, vs]) => ({ k, vs }));
}

export function ruleSignals(doc, x) {
  const all = textOf(doc);
  const out = {};
  const n = doc.units.length;
  const lastUnits = doc.units.slice(-2);
  // placeholders + samples (shared)
  const ph = []; for (const [re, label] of PLACEHOLDER) for (const h of unitHits(doc, re, 'all')) ph.push({ ...h, label });
  const samples = SAMPLE_NAMES.filter((s) => s && s !== x.customerShort && !(x.customer || '').includes(s) && all.includes(s));
  const sampleHits = samples.flatMap((s) => unitHits(doc, new RegExp(esc(s) + '(?![가-힣])', 'g'), 'all'));

  { // CU1
    const notes = []; let s = 92; const units = [];
    if (!x.customer) { s -= 12; notes.push('표지 · 본문에서 고객사명을 특정하지 못했어요'); }
    if (sampleHits.length) { s -= 22; notes.push('템플릿 예시 고객명이 남아 있어요: ' + listHits(sampleHits)); units.push(...unitsOf(sampleHits)); }
    const others = Object.entries(x.orgCount).filter(([k, c]) => c >= 2 && x.customerShort && !k.includes(x.customerShort) && !x.customerShort.includes(k.split(' ')[0]) && !x.caseCust.includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (others.length && x.customer) { s -= 6 * others.length; notes.push('고객사 외 기관명이 여러 번 나와요 — 이전 고객명인지 확인: ' + others.map(([k, c]) => `${k}(${c}회)`).join(', ')); }
    for (const sc of scaleConsistency(doc)) { s -= 9; const parts = Object.entries(sc.vs).map(([v, us]) => `${Number(v).toLocaleString()}${sc.k}(${uniq(us).join('·')}장)`); notes.push('같은 규모가 다른 값으로 나와요: ' + parts.join(' / ')); units.push(...Object.values(sc.vs).flat()); }
    if (x.customer) notes.push(`고객사명 “${x.customerShort}” 언급: ${x.customerUnits.length}개 ${doc.unitLabel}`);
    out.CU1 = R(s, notes, units);
  }
  { // CU2
    if (x.reqList.length) {
      const miss = []; const hitUnits = [];
      for (const r of x.reqList) {
        const qt = uniq(toks(r)); if (!qt.length) continue;
        let best = 0, bu = 0;
        for (const u of doc.units) { const ut = new Set(toks(u.title + ' ' + u.text)); const ov = qt.filter((t) => ut.has(t)).length / qt.length; if (ov > best) { best = ov; bu = u.n; } }
        if (best >= 0.45) hitUnits.push(bu); else miss.push(r);
      }
      const cov = 1 - miss.length / Math.max(1, x.reqList.length);
      out.CU2 = R(35 + 60 * cov, [`요구사항 ${x.reqList.length}개 중 ${x.reqList.length - miss.length}개가 본문 표현과 맞닿아요`, miss.length ? '대응이 안 보이는 요구: ' + miss.slice(0, 4).map((m) => '“' + cut(m, 28) + '”').join(', ') : ''], hitUnits);
    } else out.CU2 = R(64, ['비교할 요구사항 목록이 없어 본문의 요구 언급만 봤어요']);
  }
  { // CU3
    const dm = unitHits(doc, DM, 'all'); const sum = doc.units.some((u) => u.part === 'overview' || /요약|Summary|한눈에|핵심 제안/i.test(u.title));
    out.CU3 = R(52 + (sum ? 18 : 0) + Math.min(22, uniq(dm.map((h) => h.t)).length * 6), [sum ? '경영진용 요약 장이 있어요' : '결정권자용 요약(Executive Summary) 장이 없어요', dm.length ? '결정권자 언급: ' + uniq(dm.map((h) => h.t)).slice(0, 5).join(', ') : '결정권자 · 키맨 언급이 거의 없어요'], unitsOf(dm));
  }
  { // CU4
    const pain = unitHits(doc, PAIN, 'all'); const pu = unitsOf(pain);
    const withNum = pu.filter((k) => { const u = doc.units[k - 1]; return u && (u.text.match(FIG) || []).length > 0; });
    const hasCh = x.parts.includes('challenge') || x.parts.includes('customer');
    out.CU4 = R(45 + (hasCh ? 18 : 0) + Math.min(18, pu.length * 3) + Math.min(14, withNum.length * 5), [hasCh ? '고객 과제 · 고객사 이해 장이 있어요' : '고객 과제를 다루는 장을 찾지 못했어요', withNum.length ? `과제를 수치와 함께 쓴 ${doc.unitLabel}: ${withNum.slice(0, 6).join(', ')}` : '과제를 수치로 구체화한 곳이 거의 없어요'], pu);
  }
  { // CU5
    const body = Math.max(1, n - 1);
    const ratio = x.customerUnits.length / body;
    out.CU5 = R(x.customer ? 42 + 55 * Math.min(1, ratio * 1.7) : 52, [x.customer ? `고객사명이 나오는 ${doc.unitLabel} 비율 ${Math.round(ratio * 100)}%` : '고객사명을 특정하지 못해 맞춤화 정도를 가늠하기 어려워요'], x.customerUnits);
  }
  { // CU6
    const kws = x.ind ? (IND_KW[x.ind] || []) : []; const hit = kws.filter((k) => all.includes(k));
    out.CU6 = R(52 + Math.min(36, hit.length * 6), [x.ind ? `${x.indName} 업종 용어 ${hit.length}개 사용: ${hit.slice(0, 6).join(', ')}` : '']);
  }
  { // MK1
    const mk = doc.units.filter((u) => ['market', 'insight', 'competition'].includes(u.part));
    const fig = mk.reduce((a, u) => a + (u.text.match(FIG) || []).length, 0);
    const src = mk.filter((u) => SOURCE.test(u.text)).length;
    out.MK1 = R(58 + (src ? 12 : 0) + Math.min(14, fig * 2) - (mk.length && !fig ? 15 : 0), [mk.length ? `시장 · 분석 ${doc.unitLabel} ${mk.length}개, 수치 ${fig}개` : '시장 분석 장을 따로 찾지 못했어요', src ? `출처가 붙은 시장 장 ${src}개` : '시장 장에 출처 표기가 보이지 않아요'], mk.map((u) => u.n));
  }
  { // MK2
    const data = x.years.filter((y) => y.data);
    const stale = data.filter((y) => y.y <= NOW_Y - 3);
    const noYear = x.figures >= 4 && !x.years.length;
    out.MK2 = R(90 - Math.min(40, stale.length * 12) - (noYear ? 22 : 0) - (data.length ? 0 : 6), [
      data.length ? `데이터 기준 연도: ${uniq(data.map((y) => y.y)).sort().join(', ')}` : '', stale.length ? `${NOW_Y - 3}년 이전 데이터: ` + stale.slice(0, 4).map((y) => `${y.u}장 ${y.y}년`).join(', ') : '', noYear ? '수치는 있는데 기준 연도가 하나도 없어요' : '',
    ], stale.map((y) => y.u));
  }
  { // MK3
    const figUnits = doc.units.filter((u) => (u.text.match(FIG) || []).length >= 2 && !['cover', 'closing', 'products', 'spec', 'bom', 'execution'].includes(u.part));
    const withSrc = figUnits.filter((u) => SOURCE.test(u.text) || SOURCE.test(u.footer || ''));
    const phSrc = ph.filter((h) => /조사\s*기관|연도/.test(h.t));
    const ratio = figUnits.length ? withSrc.length / figUnits.length : 1;
    out.MK3 = R(38 + 58 * ratio - phSrc.length * 8, [`수치가 있는 ${doc.unitLabel} ${figUnits.length}개 중 출처 표기 ${withSrc.length}개`, figUnits.length - withSrc.length ? '출처가 없는 곳: ' + figUnits.filter((u) => !withSrc.includes(u)).slice(0, 8).map((u) => u.n + '장').join(', ') : '', phSrc.length ? '출처 자리표시가 남아 있어요: ' + listHits(phSrc) : ''], figUnits.filter((u) => !withSrc.includes(u)).map((u) => u.n));
  }
  { // MK4
    const inc = [...scaleConsistency(doc), ...pctConsistency(doc)];
    out.MK4 = R(92 - inc.length * 12, inc.slice(0, 4).map((c) => `“${c.k}”가 ${Object.entries(c.vs).map(([v, us]) => `${v}(${uniq(us).join('·')}장)`).join(' / ')}`), inc.flatMap((c) => Object.values(c.vs).flat()));
  }
  { // MK5
    const comp = x.competitors.length ? unitHits(doc, new RegExp(COMPETITORS.filter(([k]) => x.competitors.includes(k)).map(([, re]) => re.source).join('|'), 'g'), 'all') : [];
    const aggr = unitHits(doc, /열등|형편없|뒤처진|따라올 수 없|비교 불가|상대가 안|불량률이 높은/g, 'all');
    const basis = /비교 기준|기준\s*[:：]|공식 사양|공개 자료/.test(all);
    out.MK5 = R(72 + (basis ? 10 : 0) - aggr.length * 14, [comp.length ? '경쟁사 언급: ' + listHits(comp) : '', aggr.length ? '공격적 비교 표현: ' + listHits(aggr) : '', basis ? '비교 기준을 밝힌 곳이 있어요' : '비교 기준 · 출처 표기가 보이지 않아요'], unitsOf([...comp, ...aggr]));
  }
  { // MK6
    const ins = doc.units.filter((u) => u.part === 'insight' || /시사점|Implication|제안 방향|So what|그래서/i.test(u.title + u.text.slice(0, 120)));
    out.MK6 = R(ins.length ? 82 : 52, [ins.length ? `시사점 · 제안 방향 ${doc.unitLabel}: ${ins.map((u) => u.n).join(', ')}` : '분석 뒤에 시사점 · 제안 방향을 정리한 장이 없어요'], ins.map((u) => u.n));
  }
  { // PR1
    const unk = x.unknownModels.filter((c) => !x.older.some((o) => o.code === c));
    out.PR1 = R(90 - x.older.length * 16 - Math.min(24, unk.length * 6), [
      x.prodHits.length ? '카탈로그 현행 모델: ' + x.prodHits.map((h) => h.model).slice(0, 8).join(', ') : '',
      x.older.length ? '세대가 다른 모델 표기: ' + x.older.map((o) => `${o.code} (카탈로그 기준 ${o.catalog})`).join(', ') : '',
      unk.length ? '카탈로그에 없는 모델 — 단종 · 구형 여부 확인: ' + unk.slice(0, 6).join(', ') : '',
    ], unitsOf(unitHits(doc, new RegExp([...x.older.map((o) => esc(o.code)), ...unk.map(esc)].join('|') || '(?!)', 'g'), 'all')));
  }
  { // PR2 spec numbers near models
    const mism = [];
    let specSeen = 0;
    for (const h of x.prodHits) {
      const p = PRODUCTS.find((q) => q.model === h.model); if (!p) continue;
      const nit = (p.spec.match(/([\d,]+)\s?nit/) || [])[1]; const inch = (p.spec.match(/(\d{2,3})"/) || [])[1]; const ip = (p.spec.match(/IP\d{2}/) || [])[0];
      for (const u of doc.units) {
        const s = u.title + '\n' + u.text;
        for (const f of h.forms) {
          let i = s.indexOf(f);
          while (i >= 0) {
            const win = s.slice(Math.max(0, i - 50), i + f.length + 90);
            const wn = win.match(/([\d,]{3,6})\s?(?:nit|nits|니트|cd)/i); const wi = win.match(/(\d{2,3})\s?(?:"|″|인치|inch)/i); const wp = win.match(/IP\d{2}/);
            if (wn || wi || wp) specSeen++;
            if (wn && nit && wn[1].replace(/,/g, '') !== nit.replace(/,/g, '')) mism.push({ u: u.n, t: `${h.model} 밝기 ${wn[1]}nit (카탈로그 ${nit}nit)` });
            if (wi && inch && /\d{2}/.test(h.model) && wi[1] !== inch) mism.push({ u: u.n, t: `${h.model} 크기 ${wi[1]}" (카탈로그 ${inch}")` });
            if (wp && ip && wp[0] !== ip) mism.push({ u: u.n, t: `${h.model} ${wp[0]} (카탈로그 ${ip})` });
            i = s.indexOf(f, i + f.length);
          }
        }
      }
    }
    const um = uniq(mism.map((m) => m.u + m.t)).map((k) => mism.find((m) => m.u + m.t === k));
    out.PR2 = R((specSeen ? 88 : 70) - um.length * 13, [um.length ? '카탈로그와 다른 사양: ' + um.slice(0, 4).map((m) => `${m.u}장 ${m.t}`).join(', ') : '', specSeen ? `모델 주변 사양 수치 ${specSeen}곳 대조` : '모델 옆에 사양 수치가 거의 없어 대조할 게 적어요'], um.map((m) => m.u));
  }
  { // PR3
    const issues = [];
    for (const u of doc.units) {
      const s = u.title + '\n' + u.text;
      for (const h of x.prodHits) {
        const p = PRODUCTS.find((q) => q.model === h.model); if (!p) continue;
        for (const f of h.forms) {
          let i = s.indexOf(f);
          while (i >= 0) {
            const win = s.slice(Math.max(0, i - 36), i + f.length + 24);
            if (/옥외|실외|외벽|야외|직사광|드라이브\s?스루/.test(win) && /LCD 사이니지|호텔 TV|모니터|키오스크|전자칠판/.test(p.cat) && !/윈도|양면|고휘도/.test(p.spec)) issues.push({ u: u.n, t: `${h.model}(실내형)을 옥외 · 실외 용도로 썼어요` });
            if (/24\s?시간|24\s?\/\s?7|상시 운영|연중무휴/.test(win) && /16\/7/.test(p.spec)) issues.push({ u: u.n, t: `${h.model}(16/7 운영)을 24시간 운영 용도로 썼어요` });
            i = s.indexOf(f, i + f.length);
          }
        }
      }
    }
    const iu = uniq(issues.map((i) => i.u + i.t)).map((k) => issues.find((i) => i.u + i.t === k));
    out.PR3 = R(86 - iu.length * 13, iu.length ? iu.slice(0, 4).map((i) => `${i.u}장 ${i.t}`) : ['공간 · 용도와 맞지 않는 제품 배치 신호를 찾지 못했어요'], iu.map((i) => i.u));
  }
  { // PR4
    const ops = (all.match(/원격|스케줄|배포|관제|모니터링|자동화|통합 관리|대시보드|알림/g) || []).length;
    const s = x.products.length && x.solutions.length ? 74 + Math.min(16, ops * 2) : x.products.length ? 48 + Math.min(14, ops * 2) : 66;
    out.PR4 = R(s, [x.solutions.length ? '언급된 솔루션: ' + x.solutions.join(', ') : '운영 솔루션(CMS · IoT · MDM 등) 언급이 없어요', `운영 장면 표현 ${ops}회`]);
  }
  { // PR5
    const vars = x.prodHits.filter((h) => uniq(h.forms.filter((f) => /\d/.test(f)).map((f) => f.toUpperCase())).length >= 2);
    out.PR5 = R(93 - vars.length * 10, vars.slice(0, 4).map((h) => `${h.model} 표기 혼용: ${uniq(h.forms.filter((f) => /\d/.test(f))).join(' / ')}`));
  }
  { // PR6
    const qty = unitHits(doc, /(?:×|x|X)\s?\d{1,4}\b|\d{1,5}\s?(?:대|면|세트|SET|set|EA|ea|식)(?![가-힣])/g, 'all');
    const total = /총\s?\d|합계|Total|구성표|BOM/i.test(all);
    out.PR6 = R(qty.length ? 70 + (total ? 14 : 0) + Math.min(8, qty.length) : 46, [qty.length ? `수량 표기 ${qty.length}곳 (${unitsOf(qty).slice(0, 6).join(', ')}장)` : '제품은 있는데 수량 표기가 없어요', total ? '총계 · 구성표가 있어요' : '총계 · 구성표가 보이지 않아요'], unitsOf(qty));
  }
  { // PR7
    const kw = uniq((all.match(/설치|시공|브래킷|거치|전원|네트워크|LAN|유지보수|보증|A\/S|워런티|SLA|교육|운영 지원/g) || []));
    out.PR7 = R(46 + Math.min(44, kw.length * 6), [kw.length ? '도입 조건 언급: ' + kw.slice(0, 8).join(', ') : '설치 · 유지보수 · 보증 조건 언급이 없어요']);
  }
  { // VS1
    const vu = doc.units.filter((u) => u.part === 'value' || /가치|Value|베네핏|이점/i.test(u.title));
    out.VS1 = R(vu.length ? 72 + Math.min(12, vu.length * 4) : 50, [vu.length ? `가치 제안 ${doc.unitLabel}: ${vu.map((u) => u.n).join(', ')}` : '가치 제안을 정리한 장을 찾지 못했어요'], vu.map((u) => u.n));
  }
  { // VS2
    const eff = unitHits(doc, /\d[\d,.]*\s?(?:%|배|억|만\s?원|원|시간|분|일|개월)\s?(?:절감|단축|감소|증가|향상|개선|회수)|ROI|투자\s?회수|Payback/gi, 'all');
    out.VS2 = R(44 + Math.min(46, eff.length * 9), [eff.length ? '정량 효과: ' + listHits(eff, 5) : '정량 효과(절감 · 단축 · 증가 수치)가 없어요'], unitsOf(eff));
  }
  { // VS3
    const seq = x.parts.map((p, i) => ({ p, i })).filter((z) => z.p && STAGE[z.p] != null && z.p !== 'appendix');
    let inv = 0; let maxS = -1; const where = [];
    for (const z of seq) { const s = STAGE[z.p]; if (s <= maxS - 2 && z.p !== 'cover') { inv++; where.push(z.i + 1); } maxS = Math.max(maxS, s); }
    const cls = seq.length / Math.max(1, n);
    out.VS3 = R(cls < 0.35 ? 64 : 90 - inv * 9, [cls < 0.35 ? '장 제목으로 파트를 구분하기 어려워 흐름 판단이 제한적이에요' : `파트 흐름: ${compressParts(x.parts)}`, inv ? `흐름이 앞 단계로 되돌아가는 곳: ${where.slice(0, 6).join(', ')}장` : ''], where);
  }
  { // VS4
    const why = unitHits(doc, /Why Samsung|왜 삼성|삼성의 강점|삼성만의|차별(?:점|화)|서비스망|전국 \d+|글로벌 (?:1위|No)|점유율 1위|통합 솔루션|Knox/gi, 'all');
    out.VS4 = R(x.parts.includes('why') ? 76 + Math.min(12, why.length * 3) : 46 + Math.min(26, why.length * 5), [x.parts.includes('why') ? 'Why Samsung 장이 있어요' : 'Why Samsung을 따로 다루는 장이 없어요', why.length ? '차별점 표현: ' + uniq(why.map((h) => h.t)).slice(0, 5).join(', ') : ''], unitsOf(why));
  }
  { // VS5
    const cu = doc.units.filter((u) => u.part === 'case' || /사례|레퍼런스|Reference|도입 고객/i.test(u.title));
    const sameInd = x.ind ? CASES.filter((c) => c.ind === x.ind && x.caseCust.includes(c.cust)).length : 0;
    const proof = cu.some((u) => (u.text.match(FIG) || []).length > 0);
    out.VS5 = R(cu.length ? 66 + (proof ? 12 : 0) + Math.min(12, sameInd * 6) : 44 + Math.min(16, x.caseCust.length * 5), [cu.length ? `사례 ${doc.unitLabel}: ${cu.map((u) => u.n).join(', ')}` : '도입 사례 장이 없어요', x.caseCust.length ? '언급된 사례 고객: ' + x.caseCust.slice(0, 4).join(', ') : '', proof ? '사례에 성과 수치가 있어요' : ''], cu.map((u) => u.n));
  }
  { // VS6
    const ex = unitHits(doc, /일정|단계|Phase|파일럿|Pilot|로드맵|추진 체계|교육|유지보수|M\+\d|\d+\s?주차|\d+\s?개월|착수|오픈|준공/gi, 'all');
    out.VS6 = R(x.parts.includes('execution') ? 70 + Math.min(18, uniq(ex.map((h) => h.t)).length * 3) : 42 + Math.min(24, ex.length * 3), [x.parts.includes('execution') ? '실행 계획 장이 있어요' : '실행 계획을 다루는 장이 없어요', ex.length ? '실행 표현: ' + uniq(ex.map((h) => h.t)).slice(0, 6).join(', ') : ''], unitsOf(ex));
  }
  { // VS7
    const c = unitHits(doc, /TCO|총소유비용|구매 방식|리스|렌탈|구독|투자 회수|ROI|견적|단가|비용 구조/gi, 'all');
    out.VS7 = R(x.costUnits ? 76 : 50 + Math.min(24, c.length * 6), [c.length ? '비용 관련 표현: ' + uniq(c.map((h) => h.t)).slice(0, 5).join(', ') : '비용 · 구매 방식 언급이 없어요'], unitsOf(c));
  }
  { // VS8
    const r = unitHits(doc, /리스크|위험|대응\s?방안|우려|Risk|백업|이중화|공사 중|영업 중단|비상|장애 대응/gi, 'all');
    out.VS8 = R(48 + Math.min(40, r.length * 8), [r.length ? '리스크 표현: ' + uniq(r.map((h) => h.t)).slice(0, 5).join(', ') : '도입 리스크와 대응을 다룬 곳이 없어요'], unitsOf(r));
  }
  { // VS9
    const first = (doc.units[0] ? doc.units[0].title + ' ' + doc.units[0].text : '') + ' ' + (doc.units.find((u) => u.part === 'overview') || { title: '', text: '' }).text;
    const last = lastUnits.map((u) => u.title + ' ' + u.text).join(' ');
    const a = new Set(toks(first)); const b = toks(last); const ov = b.length ? b.filter((t) => a.has(t)).length / b.length : 0;
    out.VS9 = R(62 + Math.min(24, ov * 60), [`처음과 끝의 핵심어 겹침 ${Math.round(ov * 100)}%`]);
  }
  { // VS10
    const cl = lastUnits.filter((u) => /다음 단계|Next Step|결정|요청|일정|연락처|문의|담당|감사|Thank|Q\s?&\s?A/i.test(u.title + u.text));
    const ask = lastUnits.some((u) => /다음 단계|Next Step|결정|요청|제안 드립|협의|파일럿 착수/i.test(u.title + u.text));
    out.VS10 = R(cl.length ? (ask ? 84 : 64) : 46, [ask ? '마무리에 결정 요청 · 다음 단계가 있어요' : cl.length ? '마무리 장은 있지만 결정 요청 · 다음 단계가 약해요' : '마무리 장(다음 단계 · 연락처)이 없어요'], cl.map((u) => u.n));
  }
  { // DS1
    const g = x.geom.filter((i) => ['out', 'overlap', 'overflow', 'shrink', 'align', 'title'].includes(i.kind));
    const w = { out: 7, overlap: 6, overflow: 5, shrink: 3, align: 2, title: 2 };
    const pen = g.reduce((a, i) => a + w[i.kind], 0);
    const byKind = (k, l) => { const z = g.filter((i) => i.kind === k); return z.length ? `${l} ${z.length}곳 (${uniq(z.map((i) => i.u)).slice(0, 6).join(', ')}장)` : ''; };
    out.DS1 = doc.kind === 'pptx' ? R(93 - Math.min(60, pen * (n > 20 ? 0.6 : 1)), [byKind('out', '장표 밖으로 나감'), byKind('overlap', '텍스트 겹침'), byKind('overflow', '넘침 의심'), byKind('shrink', '자동 축소'), byKind('align', '정렬 어긋남'), byKind('title', '제목 위치 다름'), g.length ? '' : '도형 위치에서 겹침 · 넘침 신호를 찾지 못했어요'], g.map((i) => i.u))
      : R(72, ['도형 정보가 없어 화면 이미지로만 판단해요']);
  }
  { // DS2 / DS3
    const lim = doc.slides ? 90 : 500;
    const dense = doc.units.filter((u) => u.words > lim && !u.hidden);
    const noTitle = doc.slides ? doc.units.filter((u, i) => i > 0 && !u.title && u.words > 10) : [];
    const avg = Math.round(doc.units.reduce((a, u) => a + u.words, 0) / Math.max(1, n));
    out.DS2 = R(86 - Math.min(36, dense.length * 4) - Math.min(18, noTitle.length * 3), [`장당 평균 ${avg}어절`, dense.length ? `글이 많은 ${doc.unitLabel}: ${dense.slice(0, 8).map((u) => u.n).join(', ')}` : '', noTitle.length ? `제목이 없는 ${doc.unitLabel}: ${noTitle.slice(0, 6).map((u) => u.n).join(', ')}` : ''], [...dense, ...noTitle].map((u) => u.n));
    const lim2 = doc.slides ? 110 : 600;
    const d2 = doc.units.filter((u) => u.words > lim2 && !u.hidden);
    out.DS3 = R(93 - Math.min(55, d2.length * 7) - (avg > lim2 * 0.7 ? 10 : 0), [`장당 평균 ${avg}어절 · 최대 ${Math.max(...doc.units.map((u) => u.words))}어절`, d2.length ? `${lim2}어절을 넘는 ${doc.unitLabel}: ` + d2.slice(0, 8).map((u) => `${u.n}(${u.words})`).join(', ') : ''], d2.map((u) => u.n));
  }
  { // DS4
    const norm = doc.kind === 'pptx' ? 960 / (doc.slideWpt || 960) : 1;
    const small = doc.units.filter((u) => u.minFont && u.minFont * norm < 12 && u.words > 5);
    const tiny = small.filter((u) => u.minFont * norm < 9);
    out.DS4 = R(92 - Math.min(30, small.length * 2) - Math.min(30, tiny.length * 5), [small.length ? `12pt 미만 글자가 있는 ${doc.unitLabel} ${small.length}개` : '본문 글자 크기는 12pt 이상이에요', tiny.length ? '9pt 미만: ' + tiny.slice(0, 8).map((u) => `${u.n}장(${(u.minFont * norm).toFixed(1)}pt)`).join(', ') : ''], small.map((u) => u.n));
  }
  { // DS5
    const f = x.fontCount;
    const titleSizes = doc.kind === 'pptx' ? doc.units.map((u) => { const t = u.boxes.find((b) => b.ph === 'title'); return t && t.max; }).filter(Boolean) : [];
    const tsVar = titleSizes.length >= 4 ? uniq(titleSizes.map((s) => Math.round(s))).length : 0;
    out.DS5 = R(92 - Math.max(0, f - 3) * 8 - Math.max(0, tsVar - 2) * 5, [f ? `폰트 ${f}종: ${x.fonts.slice(0, 6).join(', ')}` : '', tsVar > 2 ? `제목 크기가 ${tsVar}가지로 달라요` : '']);
  }
  { // DS6
    const textOnly = doc.units.filter((u, i) => i > 0 && u.words > 40 && u.nPic + u.nChart + u.nTable === 0 && !u.hidden);
    const ratio = textOnly.length / Math.max(1, n - 1);
    out.DS6 = R(92 - 62 * ratio, [`그림 · 차트 · 표 없이 글만 있는 ${doc.unitLabel} ${textOnly.length}개 (${Math.round(ratio * 100)}%)`, doc.kind === 'pdf' ? 'PDF는 벡터 도형 · 차트를 그림으로 세지 못할 수 있어요' : ''], textOnly.map((u) => u.n));
  }
  { // DS7
    const t = doc.units.filter((u, i) => i > 0 && u.title && !['cover', 'closing', 'appendix'].includes(u.part));
    const label = t.filter((u) => u.title.replace(/\s/g, '').length <= 12 && !/[다요음함됨임]\s*[.!?]?$|\d|\?/.test(u.title.trim()));
    const ratio = t.length ? label.length / t.length : 0;
    out.DS7 = R(90 - 52 * ratio, [`라벨형 제목 ${label.length}/${t.length}`, label.length ? '예: ' + label.slice(0, 4).map((u) => `${u.n}장 “${cut(u.title, 16)}”`).join(', ') : ''], label.map((u) => u.n));
  }
  { // DS8
    const figHeavy = doc.units.filter((u) => (u.text.match(FIG) || []).length >= 6 && u.nChart + u.nTable === 0);
    out.DS8 = R(78 - Math.min(24, figHeavy.length * 6), [`차트 ${x.charts} · 표 ${x.tables}`, figHeavy.length ? `수치가 많은데 차트 · 표가 없는 ${doc.unitLabel}: ${figHeavy.slice(0, 6).map((u) => u.n).join(', ')}` : ''], figHeavy.map((u) => u.n));
  }
  { // DS9
    const s = doc.slides ? (n < 6 ? 56 : n <= 40 ? 86 : n <= 60 ? 70 : 56) : (n < 3 ? 60 : 82);
    out.DS9 = R(s, [`${n}${doc.unitLabel}${doc.truncatedPages ? ` (전체 ${doc.truncatedPages}쪽 중 앞부분만 읽음)` : ''}`, x.parts.includes('appendix') ? '부록이 따로 있어요' : '']);
  }
  { // DS10
    const colors = Object.keys(doc.meta.colors || {}).filter((c) => !/^(000000|FFFFFF|F2F2F2|D9D9D9|BFBFBF|A6A6A6|7F7F7F|595959|404040|262626|0D0D0D)$/.test(c));
    out.DS10 = R(doc.kind === 'pptx' ? 88 - Math.max(0, colors.length - 10) * 2 - Math.max(0, x.fontCount - 3) * 4 : 74, [doc.kind === 'pptx' ? `직접 지정한 색 ${colors.length}가지` : '']);
  }
  { // WR1
    const all1 = [...ph, ...sampleHits.map((h) => ({ ...h, label: '예시 고객명' }))];
    out.WR1 = R(96 - Math.min(70, all1.length * 9), [all1.length ? listHits(all1, 6) : '자리표시 · 템플릿 문구를 찾지 못했어요'], unitsOf(all1));
  }
  out.WR2 = R(76, ['맞춤법은 AI가 문장을 읽고 판단해요']);
  { // WR3
    const bad = [];
    for (const [off, re] of BRANDS) { re.lastIndex = 0; for (const h of unitHits(doc, re, 'all')) if (h.t !== off && !(off === 'Samsung VXT' && /VXT/.test(h.t)) && !(off === 'Knox' && h.t === 'KNOX')) bad.push({ ...h, t: `${h.t} → ${off}` }); }
    out.WR3 = R(94 - Math.min(40, uniq(bad.map((b) => b.t)).length * 9), [bad.length ? '공식 표기와 다른 곳: ' + listHits(bad, 5) : '브랜드 표기는 공식 표기와 맞아요'], unitsOf(bad));
  }
  { // WR4
    const fam = [['인치', /(\d)\s?(인치|"|″|inch)/g], ['밝기', /(\d)\s?(nit|nits|니트|cd\/㎡)/gi], ['면적', /(\d)\s?(㎡|m2|m²|평|제곱미터)/g], ['금액', /(\d)\s?(원|만원|억원|억 원|만 원|KRW|₩)/g]];
    const mixed = [];
    for (const [k, re] of fam) { const forms = uniq((all.match(re) || []).map((m) => m.replace(/^\d\s?/, '').toLowerCase())); if (forms.length >= 2) mixed.push(`${k}: ${forms.join(' / ')}`); }
    out.WR4 = R(92 - mixed.length * 9, mixed.length ? ['단위 표기 혼용 — ' + mixed.join(' · ')] : ['단위 표기 혼용을 찾지 못했어요']);
  }
  { // WR5
    const abs = unitHits(doc, ABSOLUTE, 'all');
    const unsourced = abs.filter((h) => !SOURCE.test(doc.units[h.u - 1].text));
    out.WR5 = R(94 - Math.min(50, unsourced.length * 8) - Math.min(10, (abs.length - unsourced.length) * 2), [abs.length ? '절대 표현: ' + listHits(abs, 5) : '근거 없는 절대 표현을 찾지 못했어요', unsourced.length ? `출처 없는 절대 표현 ${unsourced.length}곳` : ''], unitsOf(abs));
  }
  { // WR6
    const int = unitHits(doc, INTERNAL, 'all');
    const notesInt = unitHits(doc, INTERNAL, 'notes');
    const rrn = unitHits(doc, /\d{6}-[1-4]\d{6}/g, 'all');
    const phones = unitHits(doc, /01[016789]-?\d{3,4}-?\d{4}/g, 'all').filter((h) => !lastUnits.some((u) => u.n === h.u));
    out.WR6 = R(96 - Math.min(56, int.length * 10) - rrn.length * 40 - phones.length * 6 - Math.min(16, notesInt.length * 4), [int.length ? '내부용 표현: ' + listHits(int, 5) : '', notesInt.length ? '발표자 노트의 내부 메모: ' + listHits(notesInt, 3) : '', rrn.length ? '주민등록번호 형식이 있어요' : '', phones.length ? '본문의 개인 휴대폰 번호: ' + phones.length + '곳' : '', !int.length && !rrn.length && !phones.length && !notesInt.length ? '내부 정보 노출 신호를 찾지 못했어요' : ''], unitsOf([...int, ...rrn, ...phones, ...notesInt]));
  }
  { // WR7
    const d = unitHits(doc, /연출된|연출 이미지|이미지는\s?(?:예시|이해를 돕기)|실제와 다를|사양은\s?(?:사전\s?)?(?:예고 없이|변경)|변경될 수|예상치|추정치|가정\s?(?:하에|기준)|전제\s?조건|Simulated/gi, 'all');
    out.WR7 = R(d.length ? 84 : 54, [d.length ? '고지 문구: ' + listHits(d, 3) : '연출 이미지 · 사양 변경 · 효과 전제 고지가 없어요'], unitsOf(d));
  }
  { // WR8
    const undef = [];
    for (const a of x.abbrs) {
      const i = all.indexOf(a); if (i < 0) continue;
      const near = all.slice(Math.max(0, i - 24), i + a.length + 30);
      if (!new RegExp(esc(a) + '\\s?\\(|\\(\\s?' + esc(a) + '|' + esc(a) + '\\s?[:：-]\\s?[가-힣]').test(near)) undef.push(a);
    }
    out.WR8 = R(92 - Math.min(40, undef.length * 5), [undef.length ? '처음 쓸 때 풀이가 없는 약어: ' + undef.slice(0, 8).join(', ') : '약어마다 풀이가 있어요']);
  }
  { // WR9
    const lines = all.split('\n').map((l) => l.trim()).filter((l) => l.length > 10);
    const formal = lines.filter((l) => /(습니다|니다|세요|십시오)[.!]?$/.test(l)).length;
    const brief = lines.filter((l) => /(함|임|음|됨|필요|가능|예정)[.]?$/.test(l)).length;
    const mix = formal && brief && Math.min(formal, brief) / Math.max(1, formal + brief) > 0.2;
    out.WR9 = R(mix ? 66 : 82, [mix ? `경어체 문장 ${formal}개와 개조식 종결 ${brief}개가 섞여 있어요` : '문체가 대체로 한 가지로 맞춰져 있어요']);
  }
  { // SB1
    const hasCover = x.parts[0] === 'cover';
    const toc = doc.units.slice(0, 4).some((u) => /목차|Contents|Agenda|순서/i.test(u.title + u.text.slice(0, 80)));
    const close = x.parts.slice(-2).includes('closing') || lastUnits.some((u) => /감사|Thank|문의|연락처|Q\s?&\s?A/i.test(u.title + u.text));
    out.SB1 = R(28 + (hasCover ? 26 : 0) + (toc ? 22 : 0) + (close ? 24 : 0), [`표지 ${hasCover ? '있음' : '없음'} · 목차 ${toc ? '있음' : '없음'} · 마무리 ${close ? '있음' : '없음'}`]);
  }
  { // SB2
    const body = doc.units.slice(1);
    const pn = body.filter((u) => u.pageNum).length;
    const conf = /CONFIDENTIAL|대외비|Confidential/.test(all + doc.units.map((u) => u.footer).join(' '));
    out.SB2 = R(48 + 44 * (pn / Math.max(1, body.length)) + (conf ? 6 : 0), [`쪽번호가 있는 장 ${pn}/${body.length}`, conf ? '기밀 표기가 있어요' : '기밀(CONFIDENTIAL) 표기가 없어요'], body.filter((u) => !u.pageNum).map((u) => u.n).slice(0, 30));
  }
  { // SB3
    const hidden = doc.units.filter((u) => u.hidden);
    const withNotes = doc.units.filter((u) => u.notes && u.notes.length > 3);
    const notesInt = unitHits(doc, INTERNAL, 'notes');
    const cm = doc.meta.comments || 0;
    out.SB3 = R(94 - (hidden.length ? 14 : 0) - (cm ? 16 : 0) - Math.min(24, notesInt.length * 8) - (withNotes.length ? 4 : 0), [hidden.length ? `숨김 ${doc.unitLabel}: ${hidden.map((u) => u.n).join(', ')}` : '', cm ? `남은 검토 댓글 ${cm}개` : '', withNotes.length ? `발표자 노트가 있는 장 ${withNotes.length}개 — 파일로 보낼 땐 지울지 확인` : '', notesInt.length ? '노트에 내부 메모: ' + listHits(notesInt, 3) : '', !hidden.length && !cm && !withNotes.length ? '노트 · 숨김 장 · 댓글이 없어요' : ''], [...hidden.map((u) => u.n), ...unitsOf(notesInt)]);
  }
  { // SB4
    const m = doc.meta; const notes = []; let s = 90;
    const props = [m.title, m.subject, m.keywords, m.template, m.description].filter(Boolean).join(' ');
    const sampleInMeta = SAMPLE_NAMES.filter((k) => props.includes(k));
    const otherOrg = Object.keys(x.orgCount).filter((k) => props.includes(k) && x.customerShort && !k.includes(x.customerShort));
    if (m.title) notes.push(`문서 제목 속성: “${cut(m.title, 40)}”`);
    if (sampleInMeta.length || otherOrg.length) { s -= 24; notes.push('속성에 다른 고객 · 예시 이름: ' + [...sampleInMeta, ...otherOrg].join(', ')); }
    if (x.customerShort && m.title && !m.title.includes(x.customerShort) && m.title.length > 3) { s -= 8; notes.push('문서 제목 속성에 고객사명이 없어요'); }
    if (m.creator || m.lastModifiedBy) { s -= 3; notes.push(`작성자 속성: ${uniq([m.creator, m.lastModifiedBy].filter(Boolean)).join(', ')}`); }
    if (m.template) notes.push(`템플릿: ${m.template}`);
    out.SB4 = R(s, notes);
  }
  { // SB5
    const ds = []; const re = /(20\d{2})\s?[.\-/년]\s?(\d{1,2})\s?[.\-/월]\s?(\d{1,2})?/g;
    for (const u of doc.units) { const s = u.title + '\n' + u.text + '\n' + (u.footer || ''); re.lastIndex = 0; let m; while ((m = re.exec(s))) { const y = +m[1], mo = +m[2]; if (mo >= 1 && mo <= 12) ds.push({ u: u.n, t: new Date(y, mo - 1, +(m[3] || 1)).getTime(), s: m[0] }); } }
    const coverD = ds.filter((d) => d.u === 1);
    const now = Date.now();
    const stale = coverD.filter((d) => d.t < now - 1000 * 86400 * 90);
    out.SB5 = R(ds.length ? 84 - stale.length * 18 : 66, [coverD.length ? `표지 날짜: ${coverD.map((d) => d.s).join(', ')}` : '표지에 제출 날짜가 없어요', stale.length ? '표지 날짜가 3개월 넘게 지났어요' : ''], stale.map((d) => d.u));
  }
  out.SB6 = R(64, ['RFP 형식 요구는 AI가 대조해요']);
  return out;
}
function compressParts(parts) {
  const out = []; for (const p of parts) { const l = p && PARTS[p] ? PARTS[p].label : '·'; if (out[out.length - 1] !== l) out.push(l); }
  return out.slice(0, 14).join(' → ');
}

// ---------- scoring ----------
export function aggregate(sel, results) {
  const applied = sel.filter((s) => s.applied && results[s.id] && results[s.id].score != null && !results[s.id].na);
  const cats = {};
  for (const c of CATS) {
    const list = applied.filter((s) => CR[s.id].cat === c.id);
    if (!list.length) { cats[c.id] = null; continue; }
    const tw = list.reduce((a, s) => a + CR[s.id].w, 0);
    cats[c.id] = Math.round(list.reduce((a, s) => a + CR[s.id].w * results[s.id].score, 0) / tw);
  }
  const used = CATS.filter((c) => cats[c.id] != null);
  const tw = used.reduce((a, c) => a + c.w, 0);
  const overall = tw ? Math.round(used.reduce((a, c) => a + c.w * cats[c.id], 0) / tw) : 0;
  const priorities = applied.map((s) => ({ id: s.id, impact: CR[s.id].w * CAT[CR[s.id].cat].w * (100 - results[s.id].score) })).filter((p) => results[p.id].score < 80).sort((a, b) => b.impact - a.impact).slice(0, 5).map((p) => p.id);
  return { overall, cats, priorities, nApplied: applied.length };
}
export { cut };
