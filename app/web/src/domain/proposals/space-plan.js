// 공간 구성 — Storyboard 제품 · 솔루션 매칭에서 고른 제품을 업종(버티컬)의 공간별로 묶는다. 순수 함수만 두고,
// 자료(app/data/vertical_space_product.json: 버티컬 → 공간 → 배치 가능 제품군)는 부르는 쪽이 넘긴다.
//   p.spacePlan = { v:1, vertical:{id,name,group}, title, summary, spaces:[{id,name,kind,note,color?,products:[제품 id]}], at,
//                   birdseye?:{status:'running'|'done'|'error', token, at, by?, historyId?, image?, rooms?, products?, skipped?, sig?, error?} }
// 제품은 여러 공간에 둘 수 있고(같은 사이니지를 로비와 대기실에), 어느 공간에도 없으면 '미배치'다. 표시는 언제나 지금 연결된
// 제품(p.ctx.products) 기준 — 매칭에서 뺀 제품은 사라지고, 새로 넣은 제품은 미배치로 보인다.
// 공간 후보는 '연결된 제품 · 솔루션(DSS)을 하나 이상 담을 수 있는 공간'으로만 만든다(spaceFit) — 후보마다 공간 1~6개.
// 공간 색(color)은 공간마다 따로 기억해, 공간을 넣고 빼도 남은 공간의 테두리 색이 바뀌지 않는다(withColors).

/** 조감도(공간 스튜디오)의 공간 용도 — domain/spatial/studio-form.js SPACE_TYPES 와 같은 키 */
export const SPACE_KINDS = ['reception', 'office', 'meeting', 'lounge', 'dining', 'kitchen', 'classroom', 'study', 'bedroom', 'medical', 'retail', 'warehouse', 'utility', 'theatre', 'fitness', 'outdoor'];
/** 공간 테두리 색 개수(styles/match-space.css .spl-c0 … .spl-c7) */
export const SPACE_COLORS = 8;
/** 구성 하나의 공간 수 — 예전에 저장한 구성(최대 8개)은 그대로 열리고, 6개를 넘으면 더 넣을 수만 없다 */
export const MIN_SPACES = 1, MAX_SPACES = 6;

/** 자료 색인: 버티컬 · 공간 · 제품군 이름 · 그룹 이름 */
export function indexTaxonomy(data) {
  const groups = (data && data.meta && data.meta.groups) || {};
  const cats = new Map();
  for (const fam of (data && data.product_taxonomy) || []) for (const c of fam.categories || []) cats.set(c.id, { id: c.id, name: c.name, family: fam.id, familyName: fam.name });
  const verticals = ((data && data.verticals) || []).map((v) => ({ ...v, groupName: groups[v.group] || v.group }));
  const byId = new Map(verticals.map((v) => [v.id, v]));
  const spaces = new Map();
  for (const v of verticals) for (const s of v.spaces || []) spaces.set(s.id, { ...s, vertical: v.id });
  return { groups, cats, verticals, byId, spaces };
}

/** 그룹 이름에서 '(신규)' 같은 꼬리표를 뺀 표시용 이름 */
export const groupLabel = (index, code) => String((index && index.groups[code]) || code || '').replace(/\s*\((?:신규|[^)]*공식 업종[^)]*)\)\s*$/, '');

/**
 * 앱 제품(카탈로그 항목) → 버티컬 자료의 제품군 id 목록(모르면 []). 이름 · 모델 · 분류 · 사이트 분류 · 주소로 판단한다.
 * 공간 후보의 '선택 제품이 들어갈 수 있는가'를 세고 AI에게 제품군을 알려 주는 데 쓴다 — 배치를 강제하지는 않는다.
 */
export function productCats(x) {
  if (!x) return [];
  const t = [x.name, x.model, x.cat, x.sc, x.fam, x.url, (x.models || []).join(' ')].filter(Boolean).join(' ');
  const has = (re) => re.test(t);
  const out = new Set();
  const sc = x.sc || '';
  // 솔루션(소프트웨어 · 플랫폼)
  if (has(/MagicINFO|매직인포/i)) out.add('s_magic');
  if (has(/\bVXT\b/i)) out.add('s_vxt');
  if (has(/LYNK|링크 클라우드/i)) out.add('s_lynk');
  if (has(/Knox|녹스/i)) out.add('s_knox');
  if (has(/스마트싱스|SmartThings/i)) out.add('s_stp');
  if (has(/안전관리/)) out.add('s_safety');
  if (has(/클래스룸/)) out.add('s_class');
  if (has(/b\.IoT|빌딩통합솔루션|빌딩 통합/i)) out.add('s_biot');
  if (has(/\bDMS\b/)) out.add('s_dms');
  if (has(/터치 ?중앙|중앙 ?제어/)) out.add('s_touch');
  if (has(/Wi-?Fi ?KIT/i)) out.add('s_wifi');
  if (has(/CounThru|통합출력관리/i)) out.add('s_counthru');
  if (has(/SecuThru|출력보안/i)) out.add('s_secuthru');
  // 디스플레이 — 모델 코드 패턴(VM55 · OM55 · KM24 …)은 디스플레이 제품에만 적용한다(에어컨 리모컨 AWR-VH12N 같은 오인 방지)
  const display = x.fam === '디스플레이' || /사이니지|디스플레이|비디오월|키오스크|전자칠판|이페이퍼|호텔 ?TV|The Wall|LED|Flip ?Pro|Onyx/i.test([x.name, x.cat, sc].join(' '));
  const sig = new Set();
  if (display) {
    const led = has(/LED/i) && has(/사이니지|signage|The Wall|더 ?월|\bIAB\b|\bIAA\b|\bIFR\b|\bXHB\b/i);
    if (has(/시네마 LED|Onyx/i)) sig.add('g_cinema');
    else if (led || has(/The Wall|더 ?월/i)) sig.add(has(/실외|옥외|outdoor|\bXHB\b/i) ? 'led_out' : 'led_in');
    if (has(/전자칠판|Flip ?Pro|\bWAF\b|\bWM\d{2}[A-Z]/i)) sig.add('iwb');
    if (has(/이페이퍼|e-?paper|\bEM\d{2}/i)) sig.add('epaper');
    if (has(/스페이셜/)) sig.add('spatial');
    if (has(/비디오월|video-?wall|\bVM\d{2}|\bVH\d{2}/i)) sig.add('vwall');
    if (has(/창문형|윈도 ?사이니지|윈도우 ?사이니지|\bOM\d{2}|\/om-/i)) sig.add('lcd_win');
    else if (has(/옥외|실외/) && has(/사이니지|\bOH\d{2}/) && !led) sig.add('lcd_out');
    if (has(/비즈니스 ?TV|behx|LH\d{2}BE/i)) sig.add('btv');
    if (has(/키오스크|kiosk|\bKM\d{2}/i)) sig.add('g_kiosk');
    if (has(/호텔 ?TV|\bHG\d{2}|hotel-tvs/i)) sig.add('htv');
    if (!sig.size && has(/사이니지|smart-signage/i) && !out.size) sig.add('lcd_std');
  }
  for (const c of sig) out.add(c);
  if (!sig.has('htv') && !sig.has('btv') && (sc === 'TV' || x.cat === 'TV' || has(/더 ?프레임|The Frame|무빙스타일/i))) out.add('tv');
  if (sc === '모니터' || has(/모니터|monitor/i)) out.add('mon');
  if (has(/하만|HARMAN|JBL/i) || ['사운드바 · AV', '홈 오디오'].includes(sc)) out.add('harman');
  // 공조
  if (sc === '중앙공조' || has(/칠러|chiller/i)) out.add('sac_ctr');
  else if (sc === '대형건물용') out.add(has(/실외기|dvms-outdoor/i) ? 'sac_l_out' : 'sac_l_in');
  else if (has(/\bDVM\b/i)) out.add('sac_l_out');
  if (has(/카세트|cassette|1Way|4Way/i)) { out.add('sac_sm'); out.add('sac_l_in'); }
  if (sc === '중소건물용 실내외기' || /상업용 에어컨|중대형/.test(sc) || sc === '시스템에어컨') out.add('sac_sm');
  if (sc === '주거용 실내외기' || /멀티실내기/.test(sc)) out.add('sac_res');
  if (sc === '바닥난방/급탕 솔루션' || has(/\bEHS\b|히트펌프 보일러/i)) out.add('sac_ehs');
  if (sc === '환기 솔루션' || has(/환기|전열교환|\bERV\b/i)) out.add('sac_vent');
  if (sc === '콜드체인 시스템' || has(/콜드체인/)) out.add('sac_cold');
  if (sc === '상업용 히트펌프') out.add('sac_ctr');
  if (/제어기/.test(sc)) out.add('s_touch');
  if (sc === '에어컨' || (x.cat === '에어컨' && !out.size)) out.add('ac');
  // 주방 · 리빙
  if (has(/김치/)) out.add('kimchi');
  else if (sc === '냉장고' || has(/냉장고|냉동고|fridge/i)) out.add(has(/업소용|상업용|쇼케이스/) ? 'ref_comm' : has(/빌트인|built-?in/i) ? 'ref_bi' : 'ref_home');
  if (has(/식기세척/)) out.add('dish');
  if (has(/인덕션|전기레인지/)) out.add('range');
  if (has(/전자레인지/)) out.add('mw');
  if (has(/오븐|큐커/)) out.add('oven');
  if (has(/정수기/)) out.add('water');
  if (has(/후드/)) out.add('hood');
  if (sc === '주방가전 액세서리') out.add('kit_acc');
  if (has(/상업용 세탁|코인|commercial laundry/i)) out.add('laundry_b2b');
  else { if (has(/세탁기/)) out.add('wash'); if (has(/건조기/)) out.add('dry'); }
  if (has(/에어드레서|airdresser/i)) out.add('airdresser');
  if (has(/슈드레서/)) out.add('shoe');
  if (has(/공기청정|제습기/) || (has(/purifier/i) && !has(/정수기|water/i))) out.add('air');
  if (has(/청소기/)) out.add('vac');
  if (sc === 'LED 조명' || has(/LED ?조명/)) out.add('light');
  // 모바일 · PC · 프린팅
  if (has(/갤럭시 탭|galaxy tab|태블릿/i)) out.add('tab');
  if (has(/스마트폰|엑스커버|XCover|갤럭시 [SZA]\d|galaxy [sza]\d|갤럭시 A 시리즈/i)) out.add('phone');
  if (has(/엑스커버|XCover|액티브|Active\d?/i) && (out.has('tab') || out.has('phone'))) out.add('g_rugged');
  if (has(/워치|galaxy watch/i) && !has(/스마트태그|smarttag/i)) out.add('watch');
  if (has(/버즈|galaxy buds/i)) out.add('buds');
  if (has(/갤럭시 링|galaxy ring/i)) out.add('ring');
  if (has(/갤럭시 XR|\bXR\b/)) out.add('xr');
  if (sc === '모바일 액세서리' || has(/스마트태그|smarttag/i)) out.add('mob_acc');
  if (has(/디지털 ?복합기/)) out.add('dmfp');
  else if (has(/프린터|복합기/)) out.add('mfp');
  if (sc === '소모품') out.add('supply');
  if (has(/노트북|갤럭시 ?북|galaxy book/i)) out.add('nb');
  if (has(/크롬북|chromebook/i)) out.add('cb');
  if (sc === '올인원PC/데스크탑' || has(/올인원 ?PC|데스크탑/)) out.add('desk');
  if (sc === 'SSD · 메모리' || (has(/\bSSD\b|메모리카드/i) && !has(/노트북|데스크탑|올인원|갤럭시 ?북|크롬북/))) out.add('g_storage');
  return [...out];
}

/**
 * 확정한 버티컬에서 고를 수 있는 공간: 그 버티컬의 공간(aux:false) + 같은 그룹 다른 버티컬의 공간(aux:true, 요구사항에 근거가 있을 때만 쓰게 한다).
 * 이름이 같은 공간은 한 번만(주 버티컬 쪽).
 */
export function spacePool(index, verticalId) {
  const v = index.byId.get(verticalId);
  if (!v) return [];
  const out = v.spaces.map((s) => ({ ...s, vertical: v.id, aux: false }));
  const names = new Set(out.map((s) => s.name));
  for (const o of index.verticals) {
    if (o.id === v.id || o.group !== v.group) continue;
    for (const s of o.spaces) { if (names.has(s.name)) continue; names.add(s.name); out.push({ ...s, vertical: o.id, aux: true }); }
  }
  return out;
}

/** 공간들 중 하나에라도 제품군이 들어가는 선택 제품 수 */
export function fitCount(spaces, productIds, catsOf) {
  const allowed = new Set(spaces.flatMap((s) => (s && s.products) || []));
  return productIds.filter((id) => catsOf(id).some((c) => allowed.has(c))).length;
}

// ---------- DSS가 들어가는 공간 ----------
/**
 * 앱 솔루션(catalog.json solutions) → 버티컬 자료의 제품군 id. 솔루션 분류(s_magic · s_vxt · s_stp …)와, 설비에 붙는 솔루션의
 * 설비 제품군(콜드체인 · 중앙공조)까지. 자료에 짝이 없는 서비스 · 파트너 솔루션(케어 · 콘텐츠 제작 …)은 [] — 공간을 고르는 근거가 되지 않는다.
 */
export function solutionCats(s) {
  if (!s) return [];
  const t = [s.name, s.cat, ...(s.kw || [])].filter(Boolean).join(' ');
  const out = new Set(productCats({ name: [s.name, ...(s.kw || [])].filter(Boolean).join(' ') }).filter((c) => c.startsWith('s_') || c.startsWith('sac_')));
  if (/안전/.test(t) && /관제|알림/.test(t)) out.add('s_safety');
  if (/SAC 제어|공조 제어/.test(t)) { out.add('s_dms'); out.add('s_touch'); out.add('s_wifi'); }
  return [...out];
}
/** 지금 연결된 DSS의 제품군: { products:[[제품 id, 제품군[]]], solutions:[[솔루션 id, 제품군[]]] } — 제품군을 모르는 항목은 뺀다 */
export function dssCats(productIds, solutionIds, catsOf, solCatsOf) {
  const rows = (ids, f) => [...new Set(ids || [])].map((id) => [id, f(id) || []]).filter(([, c]) => c.length);
  return { products: rows(productIds, catsOf), solutions: rows(solutionIds, solCatsOf) };
}
/** 이 공간이 담을 수 있는 연결 항목: { products:[제품 id], solutions:[솔루션 id] } (공간의 '배치 가능 제품군'에 그 항목의 제품군이 있다) */
export function spaceFit(space, dss) {
  const allowed = new Set((space && space.products) || []);
  const hit = (rows) => rows.filter(([, cats]) => cats.some((c) => allowed.has(c))).map(([id]) => id);
  return { products: hit(dss.products), solutions: hit(dss.solutions) };
}
/**
 * 후보에 쓸 수 있는 공간 — 연결된 제품 · 솔루션을 하나 이상 담는 공간만, 좋은 순서로(주 업종 먼저 · 담는 제품이 많은 순 · 자료 순서).
 * 각 공간에 fit(spaceFit)과 order(자료 순서 = 동선 순서)를 붙인다.
 */
export function fitSpaces(pool, dss) {
  return pool.map((s, i) => ({ ...s, order: i, fit: spaceFit(s, dss) }))
    .filter((s) => s.fit.products.length + s.fit.solutions.length > 0)
    .sort((a, b) => (a.aux ? 1 : 0) - (b.aux ? 1 : 0) || b.fit.products.length - a.fit.products.length || b.fit.solutions.length - a.fit.solutions.length || a.order - b.order);
}
/** 맞는 공간 n개로 만들 수 있는 서로 다른 후보 수(최대 3) — 1개면 1, 2개 이상이면 3 */
export const candidateCount = (n) => (n <= 0 ? 0 : n === 1 ? 1 : 3);

// ---------- AI 답 검증 (askJson validate: true | 고칠 점 문자열) ----------
export function checkVertical(d, ids) {
  if (!d || typeof d.vertical !== 'string' || !ids.includes(d.vertical)) return 'vertical은 업종 목록의 id 중 하나여야 합니다.';
  if (typeof d.reason !== 'string' || !d.reason.trim()) return 'reason에 판단 근거 한 문장이 필요합니다.';
  if (d.alternatives != null && !Array.isArray(d.alternatives)) return 'alternatives는 업종 id 배열이어야 합니다.';
  return true;
}
export function cleanVertical(d, ids) {
  const alt = [...new Set((d.alternatives || []).filter((x) => typeof x === 'string' && ids.includes(x) && x !== d.vertical))].slice(0, 2);
  return { vertical: d.vertical, reason: clip(d.reason, 90), alternatives: alt };
}
/**
 * 후보 답 검증 — fitIds: 쓸 수 있는 공간 id(= DSS가 들어가는 공간). 모델이 고칠 수 있는 것만 돌려보낸다
 * (후보 수 · 이름 · 쓸 수 있는 공간이 하나도 없는 후보). 목록에 없는 공간 · 6개 초과 · 겹치는 조합은 repairCandidates가 고친다.
 */
export function checkCandidates(d, fitIds) {
  const list = d && d.candidates;
  const want = candidateCount(fitIds.length);
  if (!Array.isArray(list) || list.length < want) return `candidates에 후보 ${want}개가 필요합니다.`;
  for (const [i, c] of list.slice(0, want).entries()) {
    if (!c || !realTitle(c.title)) return `후보 ${i + 1}의 title에 후보 이름이 필요합니다('title' 같은 자리표시 말고).`;
    if (!Array.isArray(c.spaces)) return `후보 ${i + 1}의 spaces는 공간 id 배열이어야 합니다.`;
    if (!c.spaces.some((x) => fitIds.includes(x))) return `후보 ${i + 1}에 '공간 후보' 목록의 id가 하나도 없습니다. 목록의 id만 쓰세요.`;
  }
  return true;
}
/** 후보 이름으로 쓸 수 있는 글자인가 — 빈 값 · 'title' · '...' 같은 자리표시는 아니다 */
const realTitle = (t) => typeof t === 'string' && /[가-힣A-Za-z0-9]/.test(t) && !/^\s*(title|summary|후보 이름|\.+)\s*$/i.test(t);
const PRESETS = [['핵심 공간', '선택한 제품이 가장 많이 들어가는 공간만 추린 구성'], ['표준 구성', '주요 동선의 공간을 고르게 담은 구성'], ['확장 구성', '제품이 들어가는 공간을 넓게 담은 구성']];
/**
 * AI 후보 → 규칙을 지킨 후보. fit: fitSpaces()의 결과(좋은 순서).
 *   - DSS가 들어가지 않는 공간 · 목록에 없는 공간은 뺀다 · 후보마다 1~MAX_SPACES개 · 세 후보의 조합은 서로 다르다.
 *   - 고친 후보는 fixed, 모델 답으로 만들 수 없어 규칙으로 채운 후보는 rule 표시를 단다.
 * 맞는 공간이 1개뿐이면 후보도 1개다(candidateCount).
 */
export function repairCandidates(d, fit, { max = MAX_SPACES } = {}) {
  const rank = new Map(fit.map((s, i) => [s.id, i]));
  const flow = (ids) => [...ids].sort((a, b) => fit[rank.get(a)].order - fit[rank.get(b)].order);
  const want = candidateCount(fit.length);
  const seen = new Set(), out = [];
  const key = (ids) => [...ids].sort().join('|');
  /** 이미 나온 조합이면 공간 하나를 더하거나(좋은 순) 빼서(덜 좋은 순) 다른 조합으로 */
  const vary = (ids) => {
    if (!seen.has(key(ids))) return ids;
    if (ids.length < max) for (const s of fit) { if (ids.includes(s.id)) continue; const next = [...ids, s.id]; if (!seen.has(key(next))) return next; }
    if (ids.length > MIN_SPACES) for (const x of [...ids].sort((a, b) => rank.get(b) - rank.get(a))) { const next = ids.filter((y) => y !== x); if (!seen.has(key(next))) return next; }
    for (const s of fit) if (!seen.has(s.id)) return [s.id];
    return null;
  };
  // 코드로 고친 후보는 모델의 설명이 더는 맞지 않는다 — 지금 공간으로 사실만 적는다
  const factual = (ids) => { const names = ids.map((id) => fit[rank.get(id)].name); return (names.length > 2 ? names.slice(0, 2).join(' · ') + ' 등 ' + names.length + '곳' : names.join(' · ')) + '에 연결한 제품을 담는 구성'; };
  const push = (c, ids, flags) => { seen.add(key(ids)); out.push({ id: 'c' + (out.length + 1), title: clip(c.title, 24), summary: flags.fixed ? factual(ids) : clip(c.summary, 110), spaces: ids, ...flags }); };
  for (const c of ((d && d.candidates) || []).slice(0, 3)) {
    if (out.length >= want) break;
    const raw = [...new Set((c && Array.isArray(c.spaces) ? c.spaces : []).filter((x) => typeof x === 'string'))];
    let ids = raw.filter((x) => rank.has(x));
    let fixed = ids.length !== raw.length;
    if (ids.length > max) { const top = new Set([...ids].sort((a, b) => rank.get(a) - rank.get(b)).slice(0, max)); ids = ids.filter((x) => top.has(x)); fixed = true; } // 모델이 준 순서(동선)는 지킨다
    if (!ids.length || !realTitle(c.title)) continue;
    const next = vary(ids);
    if (!next) continue;
    push(c, next, fixed || next !== ids ? { fixed: true } : {});
  }
  const sizes = [Math.min(2, fit.length), Math.min(4, fit.length), Math.min(max, fit.length)];
  for (let k = 0; out.length < want && k < 9; k++) {
    const i = out.length;
    const ids = vary(fit.slice(0, sizes[Math.min(i, 2)]).map((s) => s.id));
    if (!ids) break;
    push({ title: PRESETS[Math.min(i, 2)][0], summary: PRESETS[Math.min(i, 2)][1] }, flow(ids), { rule: true });
  }
  return out;
}
/** @deprecated repairCandidates를 쓴다 — 검증 없이 모양만 맞춘다 */
export function cleanCandidates(d) {
  return d.candidates.slice(0, 3).map((c, i) => ({ id: 'c' + (i + 1), title: clip(c.title, 24), summary: clip(c.summary, 110), spaces: [...new Set(c.spaces)] }));
}
export function checkMapping(d, spaceIds, productIds) {
  if (!d || !Array.isArray(d.spaces)) return 'spaces 배열이 필요합니다.';
  for (const s of d.spaces) {
    if (!s || !spaceIds.includes(s.id)) return '공간 id는 확정 공간 목록의 id만 쓸 수 있습니다.';
    if (!Array.isArray(s.products)) return `공간 ${s.id}의 products는 제품 id 배열이어야 합니다.`;
    const bad = s.products.filter((x) => !productIds.includes(x));
    if (bad.length) return `선택 제품 목록에 없는 제품 id가 있습니다: ${bad.slice(0, 3).join(', ')}`;
  }
  if (productIds.length && !d.spaces.some((s) => s.products.length)) return '선택 제품을 한 곳 이상에 배치해야 합니다.';
  return true;
}
/** AI 배치 답 → 공간 목록(확정 순서 유지). kind가 이상하면 fallbackKind(name). */
export function cleanMapping(d, spaces, fallbackKind) {
  const byId = new Map(d.spaces.map((s) => [s.id, s]));
  return spaces.map((s) => {
    const a = byId.get(s.id) || {};
    return { id: s.id, name: s.name, kind: SPACE_KINDS.includes(a.kind) ? a.kind : fallbackKind(s.name), note: cleanNote(a.note), products: [...new Set(a.products || [])] };
  });
}
/** 공간 설명 한 문장 — 한글 문장이 아니거나(코드 주석 · JSON 이야기 같은 모델의 혼잣말) 형식 이야기면 버린다 */
export function cleanNote(note) {
  const t = clip(note, 80);
  return !/[가-힣]/.test(t) || /^\s*(\/\/|\/\*|#|\{|\[)/.test(t) || /JSON|\bid\b|배열|products|unplaced/i.test(t) ? '' : t;
}
/**
 * 배치 보정 — 제품이 하나도 없는 공간에, 그 공간의 제품군과 맞는 선택 제품을 넣는다(아직 어디에도 없는 제품 먼저, 없으면 맞는 제품 하나).
 * pool: 공간 id → 자료의 공간(배치 가능 제품군). 모델이 놓은 자리는 바꾸지 않는다.
 */
export function completeMapping(spaces, pool, productIds, catsOf) {
  const placed = new Set(spaces.flatMap((s) => s.products));
  return spaces.map((s) => {
    if (s.products.length) return s;
    const allowed = new Set((pool.get(s.id) || {}).products || []);
    const fits = productIds.filter((id) => catsOf(id).some((c) => allowed.has(c)));
    const free = fits.filter((id) => !placed.has(id));
    const add = free.length ? free : fits.slice(0, 1);
    for (const id of add) placed.add(id);
    return add.length ? { ...s, products: add, note: '' } : s; // 모델이 '둘 제품 없음'이라고 쓴 설명은 맞지 않게 된다
  });
}

// ---------- 저장된 구성 ----------
/** 공간별 묶음(지금 연결된 제품만) + 어느 공간에도 없는 제품 */
export function planGroups(plan, productIds) {
  if (!plan || !Array.isArray(plan.spaces) || !plan.spaces.length) return null;
  const linked = new Set(productIds);
  const groups = withColors(plan.spaces).map((s) => ({ id: s.id, name: s.name, kind: s.kind, note: s.note, color: s.color, products: (s.products || []).filter((id) => linked.has(id)) }));
  const placed = new Set(groups.flatMap((g) => g.products));
  return { groups, rest: productIds.filter((id) => !placed.has(id)) };
}
/** 공간 사이 이동 — from/to: 공간 id 또는 null(미배치). 같은 공간에 이미 있으면 그대로. */
/** 다른 공간에 같은 제품을 배치하고 원래 배치는 유지한다. 공간별로 같은 제품은 한 번만 둔다. */
export function copyProduct(spaces, pid, to) {
  return spaces.map((s) => s.id === to && !s.products.includes(pid)
    ? { ...s, products: [...s.products, pid] } : s);
}
export function moveProduct(spaces, pid, from, to) {
  if (from === to) return spaces;
  return spaces.map((s) => {
    let list = s.products;
    if (s.id === from) list = list.filter((x) => x !== pid);
    if (s.id === to && !list.includes(pid)) list = [...list, pid];
    return list === s.products ? s : { ...s, products: list };
  });
}
/**
 * 끌어 놓기(매칭 카드의 공간 묶음) — 제품 pid를 from 공간(null = 미배치)에서 빼 to 공간(null = 미배치로 빼기)의 before 제품 앞에 둔다.
 * before가 없거나 그 공간에 없으면 맨 끝. 같은 공간 안에서는 순서만 바꾼다. 다른 공간의 같은 제품(여러 공간 배치)은 건드리지 않는다.
 */
export function placeProduct(spaces, pid, from, to, before = null) {
  if (from === to && before === pid) return spaces;
  return spaces.map((s) => {
    let list = s.products;
    if (s.id === from || s.id === to) list = list.filter((x) => x !== pid);
    if (s.id === to) {
      const at = before ? list.indexOf(before) : -1;
      list = at < 0 ? [...list, pid] : [...list.slice(0, at), pid, ...list.slice(at)];
    }
    return list.length === s.products.length && list.every((x, i) => x === s.products[i]) ? s : { ...s, products: list };
  });
}
/**
 * 공간 색 — 기억해 둔 color를 지키고, 없거나 겹치는 공간에는 비어 있는 가장 작은 번호를 준다.
 * color가 없는 예전 구성은 순서대로 0, 1, 2 …(예전과 같은 색).
 */
export function withColors(spaces) {
  const used = new Set();
  const own = spaces.map((s) => { const c = s.color; if (!Number.isInteger(c) || c < 0 || c >= SPACE_COLORS || used.has(c)) return null; used.add(c); return c; });
  return spaces.map((s, i) => {
    let c = own[i];
    if (c == null) { c = 0; while (used.has(c) && c < SPACE_COLORS - 1) c++; used.add(c); }
    return s.color === c ? s : { ...s, color: c };
  });
}
/** 공간 빼기 — 그 공간의 제품은 미배치가 된다. 마지막 한 공간은 뺄 수 없다. */
export function removeSpace(spaces, id) {
  return spaces.length <= MIN_SPACES || !spaces.some((s) => s.id === id) ? spaces : spaces.filter((s) => s.id !== id);
}
/** 공간 넣기 — 이미 있거나 MAX_SPACES개면 그대로. 새 공간은 남은 색 중 가장 작은 번호를 받는다. */
export function addSpace(spaces, space) {
  if (spaces.length >= MAX_SPACES || spaces.some((s) => s.id === space.id)) return spaces;
  return withColors([...withColors(spaces), { id: space.id, name: space.name, kind: space.kind, note: space.note || '', products: [...new Set(space.products || [])] }]);
}

// ---------- 조감도를 받을 Storyboard 칸 ----------
const SLOT_CACHE = new Map();
/** 레이아웃 HTML의 조감도 칸: { spatial: 'L_SPATIAL_*'식 장면 연결 칸이 있는가, images: [조감도 그림 칸 번호] } — htmlOf(f)는 처음 한 번만 부른다 */
export function birdseyeSlotsOf(f, htmlOf) {
  if (SLOT_CACHE.has(f)) return SLOT_CACHE.get(f);
  const text = String(htmlOf(f) || '');
  const images = [];
  for (const m of text.matchAll(/<[^>]*\bdata-img=\\?"(\d+)\\?"[^>]*>/g)) {
    if (/\bdata-spatial-slot=/.test(m[0])) continue;
    if (/\bdata-kind=\\?"aerial\\?"/.test(m[0]) || /\bdata-hint=\\?"[^"\\]*조감도/.test(m[0])) images.push(Number(m[1]));
  }
  // 그림 칸이 여럿인 장(시점 투어 · 시안 비교)은 조감도 한 장으로 채울 자리가 아니다
  const info = { spatial: /\bdata-spatial-template=/.test(text), images: images.length === 1 ? images : [] };
  if (text) SLOT_CACHE.set(f, info);
  return info;
}
/**
 * 조감도(historyId)를 넣을 칸 목록 — [{ part, uid, f, type:'spatial', view } | { part, uid, f, type:'image', i }].
 * 사람이 고른 그림(selectedBy · ev.by가 'user') · 직접 고른 조감도 레이아웃 · 손으로 연결한 장면은 건드리지 않는다.
 * 이 기능이 예전 조감도로 채운 칸(birdseye 표시가 다른 historyId)은 다시 채울 칸이다.
 * 표준 범례 조감도 장(L_VS_BIRD_*)은 그림과 함께 그 장면(ov.spatial — 번호 핀 · 3D로 돌려 보기)도 이 조감도의 것이어야 한다:
 * 업종 표준 조감도 장면(시트 팝업에서 돌려 보고 저장한 견본 · documentId 'vstd')이나 장면 없이 그림만 받은 장도 다시 채운다(사용자 지시 2026-11-17).
 * historyId 가 없으면(null — 아직 조감도가 없음) 사람이 고르지 않은 조감도 칸이 모두 나온다.
 */
export function birdseyeSlots(p, historyId, htmlOf) {
  const out = [];
  for (const part of (p && p.parts) || []) for (const x of part.layouts || []) {
    if (!x || !x.f || /^L_MY_/.test(x.f)) continue;
    const info = birdseyeSlotsOf(x.f, htmlOf);
    const ov = x.ov || {}, img = ov.img || {}, ev = x.ev || {};
    const manual = (i) => (img[i] && img[i].selectedBy === 'user') || (ev['i' + i] && ev['i' + i].by === 'user');
    if (info.spatial) {
      const view = /2D$/.test(x.f) ? '2d' : '3d';
      if (ov.spatial ? !!x.birdseye && x.birdseye !== historyId : !manual(0) && !img[0]) out.push({ part: part.id, uid: x.uid, f: x.f, type: 'spatial', view });
      continue;
    }
    // 이 제안서의 조감도 장면이 붙은 표준 범례 장 — 이 기능이 채웠거나(x.birdseye) 사람이 이 조감도를 돌려 보고 저장한 장(공간 구성 조감도의 documentId 'sb-…')
    const ownScene = !BIRD_SHEET.test(x.f) || (!!ov.spatial && (x.birdseye === historyId || /^sb-/.test((ov.spatial.scene && ov.spatial.scene.source && ov.spatial.scene.source.documentId) || '')));
    for (const i of info.images) if (!manual(i) && !(img[i] && img[i].birdseye === historyId && ownScene)) out.push({ part: part.id, uid: x.uid, f: x.f, type: 'image', i });
  }
  return out;
}
/** 표준 범례 조감도 장(공간 조감도 L_VS_BIRD_S* · 건물 조감도 L_VS_BIRD_B*) */
export const BIRD_SHEET = /^L_VS_BIRD_[SB]\d+$/;

/**
 * 조감도를 지금 (다시) 만들어야 하는가 — 사용자 지시 2026-11-17: "DSS 단계에서 조감도를 뽑았으면 그걸 활용하고 그렇지 않으면 즉각 생성".
 *   · 공간 구성(공간 1곳 이상)이 있고 · 고칠 수 있는 제안서이고 · 이 탭에서 만드는 중이 아니고 · 조감도를 받을 칸이 있을 때(sheets)만.
 *   · 조감도가 없다 · 실패했다 · 중단됐다(저장은 running 인데 이 탭에서 돌지 않음) · 만든 뒤 구성이 바뀌었다(sig) → 만든다.
 *   · 다른 계정이 만든 조감도(공유 Storyboard)는 이 계정이 열 수 없어 칸을 채우지 못한다 → 채울 칸이 남아 있으면 만든다.
 * sheets: 조감도를 받을 칸이 있는가(birdseyeSlots) — 레이아웃 자동 구성 직전에는 장이 아직 없으므로 true. me: 지금 계정 이름.
 */
export function birdseyeNeeded(p, { me = null, running = false, sheets = true } = {}) {
  const plan = p && p.spacePlan;
  if (running || !sheets || !plan || !Array.isArray(plan.spaces) || !plan.spaces.length) return false;
  if (p._share && !p._share.canEdit) return false;
  const b = plan.birdseye;
  if (!b || b.status !== 'done' || !b.historyId) return true;
  if (b.sig && b.sig !== planSig(plan, (p.ctx && p.ctx.products) || [])) return true;
  return !!b.by && !!me && b.by !== me;
}
/**
 * 업종 기준으로 자동으로 공간 구성을 만들 때 고를 후보 — 연결한 제품이 가장 많이 들어가는 후보(fit),
 * 같으면 '표준'(둘째 · 주요 동선을 고르게) → '핵심'(첫째) → 나머지 순. 후보가 없으면 null.
 */
export function pickCandidate(candidates) {
  const list = (candidates || []).map((c, i) => ({ c, i })).filter((x) => x.c && Array.isArray(x.c.spaces) && x.c.spaces.length);
  if (!list.length) return null;
  const pref = (i) => (i === 1 ? 0 : i === 0 ? 1 : i + 1);
  return list.sort((a, b) => (Number(b.c.fit) || 0) - (Number(a.c.fit) || 0) || pref(a.i) - pref(b.i))[0].c;
}

/** 구성 지문 — 조감도를 만든 뒤 구성이 바뀌었는지 */
export function planSig(plan, productIds) {
  const g = planGroups(plan, productIds);
  return g ? JSON.stringify([plan.vertical && plan.vertical.id, g.groups.map((x) => [x.id, x.kind, x.products])]) : '';
}

function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
