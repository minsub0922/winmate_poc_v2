// 레이아웃 정리 (2026-11-12 · PPT 템플릿 레이아웃 전면 개선)
// 모든 기본 레이아웃 HTML이 그려지기 전에 거치는 정리 단계(layout_repairs.js repairLayoutHtml 끝에서 호출).
// 원본 묶음(layouts.b64 · photo_layouts.js · 생성기 결과)을 고치지 않고 화면 · 제안서 · PPTX · Agent KB가 같은 HTML을 쓴다.
//
//  1. 바닥글 — 하단 구분선과 그 아래(고객사 로고 · 덱 이름 · CONFIDENTIAL)는 지우고 쪽 번호만 남긴다.
//     쪽 번호는 편집 칸이 아닌 [data-pgno] 요소 하나(AI 채우기 · 편집 대상 아님) — Slide.jsx applyOverrides가 쪽 번호를 넣는다.
//  2. 각주 — '*' · '※'로 시작하는 하단 부연 설명, 출처 · 예시 안내 같은 하단 메모 줄을 지운다.
//  3. 작성자용 안내 — 부제 · 작은 캡션에 섞인 '사진은 예시 · ○○으로 교체', '수치는 예시', 'samsung.com 공식' 같은 안내를 뺀다.
//  4. 제품 컷 · 화면 캡처 — 칸에 맞춰 잘리지 않게 contain (제품은 흰 바탕).
//  5. 너무 작은 캡션 — 9pt(12px) 미만의 보조 설명 한 줄(더 큰 제목 뒤에 붙은 것)은 지운다. 부제 · 라벨 · 태그 · 숫자 · 제품 이름은 남긴다.
// 칸 번호(data-tb · data-img)는 바꾸지 않는다. 지운 칸에 저장된 값(ov.t)은 그릴 곳이 없어 무시된다.

const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'track', 'col']);
// attribute values in the layouts never hold '>' (checked over every built-in layout), so a plain tag scan is enough
const TAG = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>/g;

export function parseLayout(html) {
  const root = { name: '#root', children: [], start: 0, end: html.length, openEnd: 0, closeStart: html.length, depth: -1, attrs: '', style: new Map() };
  const nodes = [], stack = [root];
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(html))) {
    const name = m[2].toLowerCase();
    if (m[1]) {
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].name === name) {
        for (let j = stack.length - 1; j >= k; j--) { const n = stack[j]; n.closeStart = m.index; n.end = j === k ? TAG.lastIndex : m.index; }
        stack.length = k; break;
      }
      continue;
    }
    const parent = stack[stack.length - 1];
    let attrs = m[3] || '';
    const selfClose = attrs.endsWith('/');
    if (selfClose) attrs = attrs.slice(0, -1);
    const node = new Node(name, m[0], attrs, m.index, TAG.lastIndex, parent, stack.length - 1);
    nodes.push(node); parent.children.push(node);
    if (!VOID.has(name) && !selfClose) stack.push(node);
  }
  for (let j = stack.length - 1; j > 0; j--) { stack[j].closeStart = html.length; stack[j].end = html.length; }
  return { root, nodes, top: root.children.find((n) => n.name === 'div') || root.children[0] || null };
}
class Node {
  constructor(name, tag, attrs, start, openEnd, parent, depth) {
    this.name = name; this.tag = tag; this.attrs = attrs; this.start = start; this.openEnd = openEnd; this.closeStart = openEnd; this.end = openEnd;
    this.parent = parent; this.children = []; this.depth = depth; this._s = null; this._t = null;
    this.tb = attrs.includes('data-tb') ? attr(attrs, 'data-tb') : null;
    this.img = attrs.includes('data-img') ? attr(attrs, 'data-img') : null;
  }
  get style() { return this._s || (this._s = styleMap(this.css)); }
  get css() { return this._c != null ? this._c : (this._c = this.attrs.includes('style=') ? attr(this.attrs, 'style') || '' : ''); }
  /** one style property without parsing the whole style (hot path) */
  prop(name) {
    const c = this.css; if (!c || !c.includes(name)) return undefined;
    let re = PROP_RE.get(name); if (!re) PROP_RE.set(name, (re = new RegExp('(?:^|;)\\s*' + name + '\\s*:\\s*([^;]+)')));
    const m = re.exec(c); return m ? m[1].trim() : undefined;
  }
}
const PROP_RE = new Map();

const ATTR_RE = new Map();
export function attr(attrs, name) {
  let re = ATTR_RE.get(name);
  if (!re) ATTR_RE.set(name, (re = new RegExp('(?:^|\\s)' + name.replace(/[-]/g, '\\-') + '(?:\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+)))?(?=\\s|$)')));
  const m = re.exec(attrs);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? '';
}
export function styleMap(s) {
  const out = new Map();
  for (const part of s.split(';')) { const i = part.indexOf(':'); if (i > 0) out.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim()); }
  return out;
}
const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
export const textOf = (html, n) => (n._t != null ? n._t : (n._t = decode(html.slice(n.openEnd, n.closeStart).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()));
const fontOf = (n) => { for (let p = n; p && p.prop; p = p.parent) { const f = px(p.prop('font-size')); if (f != null) return f; } return 16; };
/** top of a node in slide coordinates — the sum of `top` over the absolutely / relatively placed chain (flex children add 0) */
function absTop(n, top) {
  let y = 0;
  for (let p = n; p && p !== top && p.prop; p = p.parent) { const pos = p.prop('position'); if (pos === 'absolute' || pos === 'relative') y += px(p.prop('top')) || 0; }
  return y;
}
function absLeft(n, top) {
  let x = 0;
  for (let p = n; p && p !== top && p.prop; p = p.parent) { const pos = p.prop('position'); if (pos === 'absolute' || pos === 'relative') x += px(p.prop('left')) || 0; }
  return x;
}
const isLeafText = (n) => !n.children.some((c) => !['br', 'b', 'strong', 'em', 'i', 'span', 'sup', 'sub', 'small'].includes(c.name) || c.tb != null || c.img != null || c.children.length > 0);
const hasBox = (n) => { if (!n.prop) return false; return /\S/.test((n.prop('background') || n.prop('background-color') || '').replace(/transparent|none/g, '')) || /\d/.test(n.prop('border') || '') || /\d/.test(n.prop('border-left') || ''); };

// 작성자에게 남긴 안내 — 고객에게 보일 글이 아니다
const SUBJ = '(사진|이미지|위치|비율|수치|시간|값|날짜|금액|대수|수량|배치|기간|단가|인원|인원 비율|구성|구성비|비중|설정|평면|도면|치수|시기|상태|일정|학사 일정|막대 높이|막대 길이|매장 수|지표 수치|지표 값|사례 이름|인증명|연도|교대 시간|거리|배수|점 위치|원 크기|길이|높이)';
const META_SEG = [
  new RegExp('^[^·]{0,14}' + SUBJ + '\\s*(은|는)\\s*(예시|자리표시|samsung\\.com|카탈로그|모니터)'),
  /^[^·]{1,14}(은|는)\s+(예시|예시입니다|자리표시|예시 · 실측 후 반영)$/,
  /^(제품\s*)?(사진|이미지)(은|는)\s/,
  /^(예시|예시 사진|예시 이미지|사진 예시|화면 예시|구성 예시|모델 예시|설정 예시|상태 예시|원문 예시|분양 문구 예시|참고 이미지|참고 사진|카탈로그 이미지|samsung\.com 공식|공식 연출|삼성 도입사례|고객 인터뷰 예시|스캔 화면 예시)$/,
  /^—?\s*(고객 인터뷰|스캔 화면|매장 평면)\s*예시$/,
  /^[A-Z]\s?[가-힣A-Za-z ]{1,16}\s예시$/, // 'C 오피스 빌딩 예시' — 예시 고객 표기
  /^예시\s*(사진|이미지)/,
  /(사진|공간|매장|현장|병실|객실|건물|인물 사진|이미지|카탈로그|제조사 도면|데이터|실제 사진)\s*(으로|로)\s*교체/,
  /^출처\s*[:：·]\s*\S/, /^출처\s*\[/, /^자료\s*[:：]/, /^Source\b/i, /^사진\s*[:：]/, /^이미지\s*출처\s*[:：]/,
  /samsung\.com\s*(공식|도입사례|리테일|오피스|비즈니스|이미지|사례)/,
  /데이터\s*연결\s*시\s*자동\s*반영/, /(데이터|실제 인원|실제 값|인터뷰)\s*(로|으로)\s*(반영|채움|채웁니다)$/,
  /(으로|로)\s*채웁니다$/,
  /^(조사\s*\/\s*)?(실측|실사|조사|설계|도면 확인)\s*후\s*(반영|확정|기입|기재)$/,
  /^유사\s*사례\s*기준$/, /^공개\s*자료\s*기반$/,
  /^(인터뷰\s*·?\s*)?데이터 기반 예시$/,
  /(인용\s*)?동의\s*확인\s*후\s*기재/,
];
const isMetaSeg = (s) => META_SEG.some((re) => re.test(s.trim()));
const isSubjectMeta = (s) => /^[^·]{1,14}(은|는)\s/.test(s.trim()) || /(데이터|인터뷰)\s*(로|으로)\s*(반영|채움|교체)$/.test(s.trim());
const SPLIT = /(\s+[·—–|]\s+|\s+-\s+|,\s+(?=[^,·]{1,10}(?:은|는)\s+(?:예시|자리표시)))/;
const PRE = [
  [/\s*\((예시|자리표시|예시 화면|예시 사진)\)/g, ''],
  [/\s*\[(예시|자리표시)\]/g, ''],
  [/\s*[·—–]?\s*출처\s*[:：]?\s*\[[^\]]*\]/g, ''],
  [/\s*[·—–]\s*출처\s*[:：].*$/g, ''],
  [/\s*\((?:[^()]*\s)?(시간|수치|위치|날짜|일정)(은|는)\s*예시\)/g, ''],
];
/** remove writer notes from a ' · ' / ' — ' joined line → { text, changed, empty } */
export function stripMeta(text) {
  let t = text, hit = false;
  for (const [re, rep] of PRE) { const n = t.replace(re, rep); if (n !== t) { hit = true; t = n; } }
  // keep [ … ] and ( … ) whole while splitting
  const prot = [];
  t = t.replace(/\[[^\]]*\]|\([^)]*\)/g, (m) => { prot.push(m); return '\u0001' + (prot.length - 1) + '\u0002'; });
  const back = (x) => x.replace(/\u0001(\d+)\u0002/g, (_, i) => prot[+i]);
  const parts = t.split(SPLIT);
  const segs = [];
  for (let i = 0; i < parts.length; i += 2) segs.push({ s: back(parts[i] || ''), sep: i > 0 ? back(parts[i - 1] || '') : '', drop: false });
  // a source line: '출처 · …' / '출처: …' — the whole line is the citation
  if (segs.length > 1 && /^(출처|자료|Source)\s*[:：]?$/i.test(segs[0].s.trim())) return { text: '', changed: true, empty: true };
  for (let k = 0; k < segs.length; k++) {
    const x = segs[k];
    if (!x.s.trim()) { x.drop = true; continue; }
    if (isMetaSeg(x.s)) {
      x.drop = true; hit = true;
      // '시간 · 온도 · 수치는 예시' · '결제 · 회원 데이터로 반영' — the bare nouns before the note are its subject
      if (isSubjectMeta(x.s)) for (let j = k - 1, c = 0; j >= 0 && c < 3 && !segs[j].drop && /^[가-힣]{1,3}$/.test(segs[j].s.trim()) && /·/.test(segs[j + 1].sep); j--, c++) segs[j].drop = true;
      // '위치는 인터뷰 · 데이터 기반 예시' — a cut-off 'X는 Y' right before the note belongs to it
      if (k > 0 && !segs[k - 1].drop && /^[^·\s]{1,6}(은|는)\s\S{1,8}$/.test(segs[k - 1].s.trim())) segs[k - 1].drop = true;
    }
  }
  if (!hit) return { text: text.trim(), changed: false, empty: !text.trim() };
  const keep = segs.filter((x) => !x.drop);
  let out = keep.map((x, k) => (k === 0 ? '' : (x.sep || ' · ')) + x.s.trim()).join('');
  out = out.replace(/\s+(화면|사진|이미지|구성|설정)\s*예시$/, ' $1').replace(/^[\s·—–|,-]+|[\s·—–|,-]+$/g, '').replace(/과 같고$/, '과 같습니다').trim();
  return { text: out, changed: out !== text.trim(), empty: !out };
}

// ---- too-small captions (9pt 미만 = 12px 미만, 1280px 슬라이드 기준)
// 캡션 = 같은 카드 안에서 더 큰 제목 · 굵은 글 뒤에 붙은 작은 보조 설명 한 줄. 아래는 캡션이 아니라 남긴다:
//  짧은 표시(4자 미만) · 숫자 · 모델명 · 태그 칩 · 숫자나 [00]이 든 데이터 줄 · 제품 · 솔루션 이름 줄 · 굵은 라벨 ·
//  다음 큰 글의 라벨 · 숫자 옆 라벨 · 같은 크기 항목이 셋 이상인 목록 · 카드의 첫 글(그 카드의 본문)
export const TINY_PX = 12;
const INLINE = new Set(['br', 'b', 'strong', 'em', 'i', 'span', 'sup', 'sub', 'small', 'u', 'mark']);
const isInlineLeaf = (n) => n.name !== 'svg' && n.children.every((c) => INLINE.has(c.name) && c.tb == null && c.img == null && c.children.every((d) => INLINE.has(d.name)));
const weightOf = (n) => { for (let p = n; p && p.prop; p = p.parent) { const w = p.prop('font-weight'); if (w) return /bold/.test(w) ? 700 : parseInt(w, 10) || 400; } return 400; };
const inSvg = (n) => { for (let p = n.parent; p && p.prop; p = p.parent) if (p.name === 'svg') return true; return false; };
const boxed = (p) => /\S/.test((p.prop('background') || p.prop('background-color') || '').replace(/transparent|none|rgba\(0,\s*0,\s*0,\s*0\)/g, '')) || /\d/.test(p.prop('border') || '');
const isTag = (p) => { const h = px(p.prop('height')); return boxed(p) && (h == null ? /inline-flex|inline-block/.test(p.prop('display') || '') : h <= 30); };
const inTag = (n) => { for (let p = n, k = 0; p && p.prop && k < 3; p = p.parent, k++) if (isTag(p)) return true; return false; };
const NUMERIC = /^[\s\d.,:%+\-–~·/()[\]①-⑳→←↑↓×#xX%p$₩원억만천조배대개곳명년월일시분초회건위점단계층호]*$/;
const MODEL = /^[A-Z0-9][A-Z0-9 .\-+/·×]{2,22}$/;
const ITEM = /(MagicINFO|VXT|SmartThings|b\.IoT|LYNK|Knox|DeX|DMS|BACnet|Tizen|Galaxy|갤럭시|사이니지|키오스크|에어컨|카세트|무풍|공기청정|청정환기|에어모니터|에어드레서|비디오월|LED|전자칠판|Flip|The Wall|모니터|태블릿|워치|냉장고|쇼케이스|세탁기|건조기|식기세척기|오븐|인덕션|칠러|실외기|실내기|FCU|ERV|프로젝터|복합기|프린터|PC|TV|센서|플러그|리모컨|DVM|EHS|360|하만|JBL|큐커|비스포크|Bespoke|Infinite)/;
const isItemList = (s) => { const segs = s.replace(/^(기기|제품|솔루션|구성)\s*·\s*/, '').split(/\s*[·,+]\s*/).filter(Boolean); return segs.length > 0 && segs.filter((g) => ITEM.test(g)).length / segs.length >= 0.5; };
// a caption reads as a clause — a sentence ending · a particle · a quote — while labels are bare nouns ('객실 관리' · '도심 · 대형')
const CLAUSE_END = /(니다|어요|아요|해요|돼요|세요|[다요음함됨])[.!?…]?$/;
const PARTICLE = /[가-힣](을|를|은|는|에서|에게|으로|부터|까지|처럼|에|만)\s|[가-힣]{2,}(?<![경도회통진항선])로\s/;
const isClause = (s) => !/^덕분에\s*·/.test(s) && (/^[“"‘']/.test(s) || CLAUSE_END.test(s) || PARTICLE.test(s)); // '덕분에 · 제품' = which product made it
const colorOf = (n) => { for (let p = n; p && p.prop; p = p.parent) { const c = p.prop('color'); if (c) return c.replace(/\s+/g, '').toLowerCase(); } return ''; };
function tinyCaptions(html, nodes, top, skip) {
  const cand = nodes.filter((n) => n !== top && !skip(n) && !inSvg(n) && !n.attrs.includes('data-pgno')
    && (n.tb != null ? !n.children.some((c) => c.tb != null || c.img != null) : isInlineLeaf(n)) && textOf(html, n));
  const set = new Set(cand);
  const leafs = cand.filter((n) => { for (let p = n.parent; p; p = p.parent) if (set.has(p)) return false; return true; });
  const info = new Map(leafs.map((n) => [n, { fs: fontOf(n), fw: weightOf(n), s: textOf(html, n), tag: inTag(n) }]));
  const within = (A) => leafs.filter((x) => x.start >= A.start && x.end <= A.end);
  const bigger = (o, me) => !o.tag && (o.fs >= me.fs + 1.5 || (o.fw >= 700 && me.fw < 700 && o.fs >= me.fs));
  const fullWidth = (p) => (px(p.prop('width')) || 0) >= 1270;
  // 1. secondary lines: a small regular-weight line placed after a bigger title in its card
  const lines = [];
  for (const n of leafs) {
    const me = info.get(n);
    if (me.fs >= TINY_PX) continue;
    const s = me.s;
    if (s.length < 4 || NUMERIC.test(s) || (MODEL.test(s) && /\d/.test(s)) || me.tag || me.fw >= 700) continue;
    let pool = null;
    for (let A = n.parent; A && A !== top; A = A.parent) if (boxed(A) && !isTag(A) && !fullWidth(A)) { pool = within(A); break; }
    if (!pool) for (let A = n.parent; A && A !== top; A = A.parent) { const w = within(A); if (w.length > 10) break; if (w.some((x) => x.start < n.start && bigger(info.get(x), me))) { pool = w; break; } }
    if (!pool) continue;
    const i = pool.indexOf(n);
    const before = pool.slice(0, i).filter((x) => bigger(info.get(x), me));
    if (!before.length) continue; // the card's own text
    const next = pool[i + 1];
    if (next && bigger(info.get(next), me)) continue; // a label for what follows
    const near = info.get(before[before.length - 1]).s;
    if ((NUMERIC.test(near) || (/\d|\[0+\]/.test(near) && near.length <= 14)) && !(s.length >= 8 && isClause(s))) continue; // the label of a number (a sentence under it is a caption)
    if (pool.filter((x) => x !== n && !info.get(x).tag && Math.abs(info.get(x).fs - me.fs) < 0.3 && (info.get(x).fw >= 700) === (me.fw >= 700)).length >= 2) continue; // one item of a list · table
    lines.push({ n, me, key: me.fs + '|' + me.fw + '|' + colorOf(n), clause: s.length >= 8 && isClause(s) && !isItemList(s) });
  }
  // 2. one look = one kind of line on the slide: it goes as a whole when it mostly reads as captions (sentences under titles)
  const groups = new Map();
  for (const x of lines) (groups.get(x.key) || groups.set(x.key, []).get(x.key)).push(x);
  const out = [];
  for (const g of groups.values()) {
    if (g.filter((x) => x.clause).length / g.length < 0.5) continue;
    for (const { n, me } of g) {
      // the line's own small box goes with it when it holds nothing else — or only a little label for it ('지금' + the line)
      let t = n;
      for (let k = 0; k < 2 && t.parent && t.parent !== top; k++) {
        const p = t.parent, w = within(p);
        const pair = w.length === 2 && w[1] === n && info.get(w[0]).s.length <= 5 && info.get(w[0]).fs < TINY_PX + 1 && !bigger(info.get(w[0]), me);
        if ((w.length !== 1 && !pair) || nodes.some((x) => (x.name === 'img' || x.img != null) && x.start >= p.start && x.end <= p.end) || (px(p.prop('height')) || 0) > 60) break;
        t = p;
      }
      out.push(t);
    }
  }
  return out;
}

const FOOTER_TEXT = /^(고객사 로고|제안사 로고|LOGO|CONFIDENTIAL(\s*·\s*\d+)?|대외비)$/i;
const CONF = /^\s*(?:CONFIDENTIAL|대외비)\s*[·|-]?\s*(\d+)?\s*$/i;

/**
 * Clean one built-in layout. Returns the new HTML (unchanged string when nothing applies).
 * opts.report → collects { removed: [...], changed: [...], page } for tests.
 */
export function cleanupLayoutHtml(f, html, opts = {}) {
  if (!html || typeof html !== 'string' || html.includes('data-layout-clean="1"')) return html;
  const { nodes, top } = parseLayout(html);
  if (!top) return html;
  const rep = opts.report || null;
  const cover = /^L_(C0[1-9]|C1[0-2]|IND_|AIS_01|SOL_01|VS_COVER)/.test(f);
  const edits = []; // { a, b, s }
  const dropped = new Set();
  const drop = (n, why) => {
    for (let p = n; p; p = p.parent) if (dropped.has(p)) return;
    dropped.add(n); edits.push({ a: n.start, b: n.end, s: '' });
    if (rep) rep.removed.push({ why, tb: n.tb, img: n.img, text: textOf(html, n).slice(0, 80) });
  };
  const inDropped = (n) => { for (let p = n; p; p = p.parent) if (dropped.has(p)) return true; return false; };

  // ---- the footer line (y 660–676, wide, 1–2px) and everything placed below it
  const lines = nodes.filter((n) => n.name === 'div' && !n.children.length && n.closeStart - n.openEnd < 8 && n.prop('position') === 'absolute'
    && (px(n.prop('height')) ?? 99) <= 2 && (px(n.prop('width')) ?? 0) >= 600 && !textOf(html, n) && (() => { const y = absTop(n, top); return y >= 640 && y <= 680; })());
  const lineY = lines.length ? Math.min(...lines.map((n) => absTop(n, top))) : null;
  for (const n of lines) drop(n, 'footer-line');

  // page number: CONFIDENTIAL · N (or a bare [data-pgno] number) → one plain page-number element
  let page = null;
  for (const n of nodes) {
    if (inDropped(n) || !isLeafText(n)) continue;
    const pg = n.attrs.includes('data-pgno');
    if (!pg && !/CONFIDENTIAL|대외비/i.test(html.slice(n.openEnd, n.closeStart))) continue;
    const t = textOf(html, n);
    if (!t) continue;
    const c = CONF.exec(t);
    if ((c && absTop(n, top) >= 560) || (pg && /^\d{1,3}$/.test(t))) {
      if (!page) page = { n: c ? (c[1] || '1') : t, y: absTop(n, top), x: absLeft(n, top), w: px(n.prop('width')), color: n.prop('color'), fs: px(n.prop('font-size')), abs: n.prop('position') === 'absolute', node: n };
      drop(n, 'page');
    }
  }

  // footer blocks below the line: logo boxes · deck name · confidential rows
  const bottomCut = lineY != null ? lineY : 664;
  // a footer block sits on the slide itself or inside a full-slide wrapper (never inside a card)
  const fullSlide = (p) => (px(p.prop('width')) || 0) >= 1270 && ((px(p.prop('height')) || 0) >= 700 || p.prop('inset') === '0' || p.prop('inset') === '0px');
  const onSlide = (n) => { for (let p = n.parent; p && p !== top; p = p.parent) { if (absTop(p, top) !== 0 || p.img != null || (hasBox(p) && !fullSlide(p))) return false; } return true; };
  for (const n of nodes) {
    if (n === top || inDropped(n) || n.prop('position') !== 'absolute' || !onSlide(n)) continue;
    const y = absTop(n, top);
    const t = textOf(html, n);
    if (y >= bottomCut && y < 720 && (lineY != null || FOOTER_TEXT.test(t) || /CONFIDENTIAL|고객사 로고|제안사 로고/.test(t))) {
      if (cover && !/CONFIDENTIAL|고객사 로고/.test(t)) continue; // 표지 하단의 부서명 · 날짜 · 로고는 표지 디자인
      if (n.img != null || n.name === 'img') continue;
      if ((px(n.prop('height')) || 0) > 40 && fontOf(n) > 13) continue;
      drop(n, 'footer');
    }
  }
  // stray footer pieces outside the band (e.g. '고객사 로고' chip at the bottom left without a line)
  for (const n of nodes) {
    if (inDropped(n) || n === top || cover || !isLeafText(n)) continue;
    const raw = html.slice(n.openEnd, n.closeStart);
    if (raw.length > 80 || !/고객사 로고|CONFIDENTIAL/i.test(raw)) continue;
    const t = textOf(html, n);
    if (/^(고객사 로고|CONFIDENTIAL(\s*·\s*\d+)?)$/i.test(t) && isLeafText(n) && absTop(n, top) >= 600) drop(n.parent && n.parent !== top && n.parent.children.length === 1 ? n.parent : n, 'footer');
  }

  // ---- footnotes · bottom notes
  const appendix = /^L_(PH_)?AX_/.test(f); // 부록 · 출처 목록은 출처가 내용
  for (const n of nodes) {
    if (inDropped(n) || n === top) continue;
    const leaf = isLeafText(n) || (n.tb != null && !n.children.some((c) => c.tb != null || c.img != null));
    if (!leaf) continue;
    const t = textOf(html, n);
    if (!t) continue;
    const y = absTop(n, top), fs = fontOf(n);
    if ((/^\*/.test(t) && (y >= 520 || fs <= 13)) || (/^※/.test(t) && fs <= 13) || (/^※\s*설명$/.test(t))) { drop(n, 'footnote'); continue; }
    if (fs <= 13 && y >= 540 && (lineY == null || y < lineY + 1)) {
      // a note line placed straight on the slide (not a card's content)
      let inCard = false;
      for (let p = n.parent; p && p !== top; p = p.parent) if (hasBox(p) && !fullSlide(p)) { inCard = true; break; }
      if (!inCard && !appendix && /[가-힣A-Za-z]/.test(t)) {
        const r = stripMeta(t);
        if (r.empty || /^(출처|자료|Source|사진\s*[:：]|이미지\s*[:：]|참고\s*[:：]|주\)|주:)/i.test(t)) { drop(n, 'note'); continue; }
      }
    }
  }

  // ---- writer notes inside the slide: whole-note captions go, mixed lines keep their content part
  for (const n of nodes) {
    if (appendix) break;
    if (inDropped(n) || n === top || !n.children.every((c) => c.name === 'br')) continue;
    const raw = html.slice(n.openEnd, n.closeStart);
    if (!/(예시|교체|출처|samsung\.com|자리표시|채웁니다|채움|자동 반영|공식 연출|유사 사례 기준|공개 자료 기반|동의 확인)/.test(raw)) continue;
    const t = textOf(html, n);
    if (!t || !/(예시|교체|출처|samsung\.com|자리표시|채웁니다|채움|자동 반영|공식 연출|유사 사례 기준|공개 자료 기반|동의 확인)/.test(t)) continue;
    const fs = fontOf(n), y = absTop(n, top);
    const r = stripMeta(t);
    if (!r.changed) continue;
    if (r.empty) {
      if (fs <= 14 || n.tb == null) { drop(n.tb == null && n.parent && n.parent !== top && n.parent.children.length === 1 && !n.parent.children[0].children.length && !textOf(html, n.parent).replace(t, '').trim() ? n.parent : n, 'meta'); }
      continue;
    }
    // keep the content part (subtitle · caption). Inline markup is rare in these lines — only plain-text lines are rewritten.
    if (/<(?!br)/i.test(raw)) continue;
    edits.push({ a: n.openEnd, b: n.closeStart, s: r.text.replace(/&/g, '&amp;').replace(/</g, '&lt;') });
    if (rep) rep.changed.push({ tb: n.tb, from: t.slice(0, 90), to: r.text.slice(0, 90), y, fs });
  }

  // ---- too-small captions: a secondary line under a bigger title (9pt 미만) goes; labels · tags · numbers · product names stay
  if (!cover && !appendix) for (const c of tinyCaptions(html, nodes, top, inDropped)) drop(c, 'caption');

  // ---- product cuts · screen captures are shown whole
  for (const n of nodes) {
    if (n.name !== 'img' || inDropped(n)) continue;
    const slot = (() => { for (let p = n; p && p !== top; p = p.parent) if (p.img != null) return p; return null; })();
    const kind = slot ? attr(slot.attrs, 'data-kind') || '' : '';
    const pid = attr(n.attrs, 'data-pid') || (slot && attr(slot.attrs, 'data-pid')) || '';
    const src = (attr(n.attrs, 'data-fill') || '') + ' ' + (attr(n.attrs, 'src') || '');
    const fit = n.prop('object-fit');
    const cut = kind === 'cut' || /^cut\.|^(qm55c|km24c|oh55a|ac360)\b/.test(pid) || /img\/fill\/cut\.json|img\/prod\/|(^|\/)p-[\w-]+\.png|-front\.png|-persp\.png/.test(src);
    const ui = kind === 'ui' || /^ui\./.test(pid) || /img\/fill\/ui\.json/.test(src);
    if ((cut || ui) && fit === 'cover') {
      const style = attr(n.attrs, 'style') || '';
      const next = style.replace(/object-fit:\s*cover/, 'object-fit: contain');
      const tag = n.tag.replace('style="' + style + '"', 'style="' + next + '"');
      edits.push({ a: n.start, b: n.openEnd, s: tag });
      if (cut && slot && slot !== n && !/background(-color)?:\s*#(fff|ffffff)\b/i.test(attr(slot.attrs, 'style') || '')) {
        const ss = attr(slot.attrs, 'style') || '';
        if (/background:\s*transparent/.test(ss) || !/background/.test(ss)) {
          // white behind a product cut (a transparent slot over a photo is left as it is)
        }
      }
      if (rep) rep.changed.push({ img: slot ? slot.img : null, fit: 'contain', kind: cut ? 'cut' : 'ui' });
    }
  }

  // ---- page number back, alone
  let tail = '';
  if (page) {
    const right = page.abs && page.w != null && page.x != null ? page.x + page.w : 1216;
    const y = Math.min(Math.max(page.y || 683, 640), 698);
    const color = page.color || '#8a91a0';
    const size = page.fs || 11;
    tail = `<div data-pgno="" style="position: absolute; left: ${right - 80}px; top: ${y}px; width: 80px; text-align: right; font-family: Manrope, 'Noto Sans KR', sans-serif; font-size: ${Math.max(11, Math.min(size, 13))}px; line-height: 1.35; color: ${color}; pointer-events: none">${page.n}</div>`;
    if (rep) rep.page = { n: page.n, y, right };
  }
  if (!edits.length && !tail) return html;
  // a removed block swallows every edit inside it; the rest never overlap
  const cuts = edits.filter((e) => e.s === '').sort((a, b) => a.a - b.a || b.b - a.b);
  const outer = [];
  for (const c of cuts) if (!outer.some((o) => o.a <= c.a && c.b <= o.b)) outer.push(c);
  const keep = [...outer, ...edits.filter((e) => e.s !== '' && !outer.some((o) => o.a <= e.a && e.b <= o.b))];
  keep.sort((a, b) => b.a - a.a);
  let out = html;
  let lastA = Infinity;
  for (const e of keep) { if (e.b > lastA) continue; out = out.slice(0, e.a) + e.s + out.slice(e.b); lastA = e.a; }
  // mark + append the page number inside the slide root
  const close = out.lastIndexOf('</div>');
  if (tail && close > 0) out = out.slice(0, close) + tail + out.slice(close);
  out = out.replace(/^(\s*<div\b)/, '$1 data-layout-clean="1"');
  return out;
}
