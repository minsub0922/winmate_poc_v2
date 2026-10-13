// 레이아웃 자유 검색 — BM25 (영문 단어 + 한글 2글자 단위) + 동의어 확장 + 파트 유형 가산점.
// 원본 Winmate 앱 src/search.js 의 searchLayouts 와 같은 순위를 낸다.
import { LAYOUTS, IND, P, S } from './catalog.js';
import { PARTS, classifyPart } from './parts.js';

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

// 검색어에 왼쪽 단어가 있으면 오른쪽 단어를 낮은 가중치로 덧붙인다.
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
// 이름 · 용도 · 파트 · 예시 제목 · 업종 · 솔루션은 여러 번 넣어 가중치를 준다.
function docText(l) {
  const pn = PARTS[l.p] ? PARTS[l.p].label : '';
  const ind = l.ind && IND[l.ind] ? IND[l.ind].name : '';
  const sol = l.sol && S[l.sol] ? S[l.sol].name : '';
  const prods = (l.prods || []).map((id) => P[id] && P[id].model).join(' ');
  return [l.name, l.name, l.name, l.when, l.when, l.g, pn, pn, l.hl, l.hl, l.sub, l.code, ind, ind, sol, sol, prods, l.txt].join(' ');
}
const DOCS = LAYOUTS.map((l) => { const t = toks(docText(l)); const tf = new Map(); for (const x of t) tf.set(x, (tf.get(x) || 0) + 1); return { l, tf, len: t.length }; });
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

/** 검색어가 레이아웃 안 문구에 나온 자리 — 카드에 한 줄로 보여 준다. */
function snippet(l, query) {
  const ws = String(query || '').split(/[\s,·]+/).filter((w) => w.length >= 2);
  const src = l.txt || '';
  for (const w of ws) { const i = src.toLowerCase().indexOf(w.toLowerCase()); if (i >= 0) return (i > 20 ? '…' : '') + src.slice(Math.max(0, i - 20), i + 46).trim() + '…'; }
  return '';
}

/**
 * 자유 문장으로 레이아웃 찾기.
 * @param {string} query  예) "경쟁사와 비교하는 표"
 * @param {{ind?: string, solutions?: string[]}} ctx  업종 · 연결 솔루션이 있으면 순위에 반영
 * @param {{limit?: number}} opts
 * @returns {{l: object, score: number, why: string[], snip: string}[]} 점수 높은 순
 */
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
    const mt = matchedTerms(d.l, base);
    if (mt.length) why.unshift('"' + mt.join('", "') + '" 일치');
    return { l: d.l, score: s, why, snip: snippet(d.l, base) };
  }).filter((r) => r.score > 0.4).sort((a, b) => b.score - a.score);
  return res.slice(0, opts.limit || 30);
}
