// 공간 구성 — Storyboard 제품 · 솔루션 매칭에서 고른 제품을 업종(버티컬)의 공간별로 묶는다. 순수 함수만 두고,
// 자료(app/data/vertical_space_product.json: 버티컬 → 공간 → 배치 가능 제품군)는 부르는 쪽이 넘긴다.
//   p.spacePlan = { v:1, vertical:{id,name,group}, title, summary, spaces:[{id,name,kind,note,products:[제품 id]}], at,
//                   birdseye?:{status:'running'|'done'|'error', token, at, by?, historyId?, image?, rooms?, products?, skipped?, sig?, error?} }
// 제품은 여러 공간에 둘 수 있고(같은 사이니지를 로비와 대기실에), 어느 공간에도 없으면 '미배치'다. 표시는 언제나 지금 연결된
// 제품(p.ctx.products) 기준 — 매칭에서 뺀 제품은 사라지고, 새로 넣은 제품은 미배치로 보인다.

/** 조감도(공간 스튜디오)의 공간 용도 — domain/spatial/studio-form.js SPACE_TYPES 와 같은 키 */
export const SPACE_KINDS = ['reception', 'office', 'meeting', 'lounge', 'dining', 'kitchen', 'classroom', 'study', 'bedroom', 'medical', 'retail', 'warehouse', 'utility', 'theatre', 'fitness', 'outdoor'];
/** 공간 테두리 색 개수(styles/match-space.css .spl-c0 … .spl-c7) */
export const SPACE_COLORS = 8;
export const MIN_SPACES = 2, MAX_SPACES = 8;

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
  const allowed = new Set(spaces.flatMap((s) => s.products || []));
  return productIds.filter((id) => catsOf(id).some((c) => allowed.has(c))).length;
}

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
export function checkCandidates(d, poolIds) {
  const list = d && d.candidates;
  if (!Array.isArray(list) || list.length < 3) return 'candidates에 후보 3개가 필요합니다.';
  const seen = new Set();
  for (const [i, c] of list.slice(0, 3).entries()) {
    if (!c || typeof c.title !== 'string' || !c.title.trim()) return `후보 ${i + 1}의 title이 필요합니다.`;
    if (!Array.isArray(c.spaces)) return `후보 ${i + 1}의 spaces는 공간 id 배열이어야 합니다.`;
    const ids = [...new Set(c.spaces)];
    const bad = ids.filter((x) => !poolIds.includes(x));
    if (bad.length) return `후보 ${i + 1}에 공간 후보에 없는 id가 있습니다: ${bad.slice(0, 3).join(', ')}`;
    if (ids.length < Math.min(MIN_SPACES, poolIds.length) || ids.length > MAX_SPACES) return `후보 ${i + 1}의 공간은 ${MIN_SPACES}~${MAX_SPACES}개여야 합니다.`;
    const key = [...ids].sort().join('|');
    if (seen.has(key)) return '세 후보의 공간 조합이 서로 달라야 합니다.';
    seen.add(key);
  }
  return true;
}
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
    return { id: s.id, name: s.name, kind: SPACE_KINDS.includes(a.kind) ? a.kind : fallbackKind(s.name), note: clip(a.note, 80), products: [...new Set(a.products || [])] };
  });
}

// ---------- 저장된 구성 ----------
/** 공간별 묶음(지금 연결된 제품만) + 어느 공간에도 없는 제품 */
export function planGroups(plan, productIds) {
  if (!plan || !Array.isArray(plan.spaces) || !plan.spaces.length) return null;
  const linked = new Set(productIds);
  const groups = plan.spaces.map((s, i) => ({ id: s.id, name: s.name, kind: s.kind, note: s.note, color: i % SPACE_COLORS, products: (s.products || []).filter((id) => linked.has(id)) }));
  const placed = new Set(groups.flatMap((g) => g.products));
  return { groups, rest: productIds.filter((id) => !placed.has(id)) };
}
/** 공간 사이 이동 — from/to: 공간 id 또는 null(미배치). 같은 공간에 이미 있으면 그대로. */
export function moveProduct(spaces, pid, from, to) {
  if (from === to) return spaces;
  return spaces.map((s) => {
    let list = s.products;
    if (s.id === from) list = list.filter((x) => x !== pid);
    if (s.id === to && !list.includes(pid)) list = [...list, pid];
    return list === s.products ? s : { ...s, products: list };
  });
}
/** 구성 지문 — 조감도를 만든 뒤 구성이 바뀌었는지 */
export function planSig(plan, productIds) {
  const g = planGroups(plan, productIds);
  return g ? JSON.stringify([plan.vertical && plan.vertical.id, g.groups.map((x) => [x.id, x.kind, x.products])]) : '';
}

function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
