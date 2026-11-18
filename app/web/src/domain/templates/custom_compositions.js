// 관리자가 직접 만든 파트 · 구성 (관리자 「레이아웃 구성 관리」 → 추천 구성 → 구성 추가하기, 사용자 지시 2026-11-16).
//   저장한 운영 값(app/api/layout_presets.py)의 두 칸을 목차 템플릿(toc_templates.js) 위에 올린다 — applyTocPresets 가 부른다:
//     parts:     { 'cp_…': { name, color, icon, type, sheets: [{ f, label }] } }   직접 만든 파트 — 간지 다음에 고른 레이아웃을 그 순서대로
//     templates: { 'ct_…': { name, desc, hint, tocs: [목차 키 …], related } }  직접 만든 구성 — 목차 키는 코드 목차(전체 파트) 또는 직접 만든 파트
//   구성 규칙: Spec(pspec)은 골라 넣는다 — 넣으면 맨 끝에 한 번(사용자 지시 2026-11-16: 고정으로 들어가지 않게) · 파트 4개 이상 · 같은 파트 두 번 없음.
//     파트는 7개까지(구독 솔루션이 들어 있으면 8개) — 목차 장(L_TOC_INDEX4–8)이 8칸까지이고, 요구사항에 따라 구독 솔루션 파트가 더해질 자리를 남긴다.
//   규칙에 맞지 않거나 모르는 파트를 쓰는 구성은 건너뛴다(서버도 같은 규칙으로 저장 전에 막는다).
//   이 모듈은 toc_templates.js 를 import 하지 않는다 — 레지스트리(TOCS · TPL · SC …)를 인자로 받는다(순환 import 없이).
import { isPartColor, isPartIcon, DEFAULT_PART_COLOR, DEFAULT_PART_ICON } from './part_looks.js';

export const CUSTOM_PART_ID = /^cp_[a-z0-9]{2,24}$/;
export const CUSTOM_TEMPLATE_ID = /^ct_[a-z0-9]{2,24}$/;
export const SPEC_KEY = 'pspec';
export const SUB_KEY = 'subx';
export const MIN_PARTS = 4;
/** 파트 수 상한 — 구독 솔루션이 이미 있으면 8, 없으면 7(구독 솔루션이 더해질 자리) */
export const maxParts = (tocs) => ((tocs || []).includes(SUB_KEY) ? 8 : 7);
export const MAX_PART_SHEETS = 20;
export const PART_NAME_MAX = 24;
const text = (v, max = 300) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** 구성 규칙 — 맞지 않는 점 [{ code, label }] (없으면 빈 배열). has: 목차 키가 있는가(모르는 파트 검사) */
export function compositionProblems(tocs, has = () => true) {
  const list = Array.isArray(tocs) ? tocs : [];
  const out = [];
  if (list.some((k) => typeof k !== 'string' || !has(k))) out.push({ code: 'unknown', label: '없는 파트' });
  if (new Set(list).size !== list.length) out.push({ code: 'dup', label: '같은 파트 두 번' });
  if (list.includes(SPEC_KEY) && list.indexOf(SPEC_KEY) !== list.length - 1) out.push({ code: 'spec', label: 'Spec 은 맨 끝' }); // 넣었으면 맨 끝(넣지 않아도 된다)
  if (list.length < MIN_PARTS) out.push({ code: 'min', label: `파트 ${MIN_PARTS}개 이상` });
  if (list.length > maxParts(list)) out.push({ code: 'max', label: `파트 ${maxParts(list)}개까지` });
  return out;
}

/** 새 id — prefix + 영숫자 8자(taken 에 없는 것) */
export function newCustomId(prefix, taken = () => false) {
  for (;;) {
    const id = prefix + Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    if (!taken(id)) return id;
  }
}
/** 덱 이름에 쓰는 말 — '매장 운영형 제안서' → '매장 운영형 제안', '공간 집중형' → '공간 집중형 제안' (덱 이름은 '<AI 업종> <말>서') */
export const deckWord = (name) => (/제안서$/.test(name) ? name.replace(/서$/, '') : /제안$/.test(name) ? name : `${name} 제안`);

// 파트 유형(PARTS) → Storyboard 단계 — 직접 만든 파트는 고른 레이아웃의 유형으로 단계를 정한다
const TYPE_STAGE = {
  overview: 'context', requirements: 'context', market: 'context', customer: 'context', user: 'context', competition: 'context', insight: 'context',
  challenge: 'value', value: 'value', effect: 'proof', dss: 'space', products: 'space', bom: 'build', scenario: 'space', birdseye: 'space', spec: 'build',
  solution: 'build', case: 'proof', why: 'close', execution: 'plan', cost: 'plan', subscription: 'value', closing: 'close', appendix: 'close', cover: 'context',
};

/** 파트 정의 → 고른 레이아웃 [{ f, label }] (형식이 맞는 것만, 20장까지) */
export function partSheets(def) {
  const raw = def && Array.isArray(def.sheets) ? def.sheets : [];
  return raw.map((x) => (typeof x === 'string' ? { f: x, label: '' } : x)).filter((x) => x && typeof x.f === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(x.f))
    .slice(0, MAX_PART_SHEETS).map((x) => ({ f: x.f, label: text(x.label, 40) }));
}
/** 파트의 겉모습 — { color, icon } (팔레트 · 아이콘 에셋에 없는 값이면 기본값) */
export const partLook = (def) => ({ color: isPartColor(def && def.color) ? def.color : DEFAULT_PART_COLOR, icon: isPartIcon(def && def.icon) ? def.icon : DEFAULT_PART_ICON });

// 장 하나 — 레이아웃의 견본 내용 그대로(채우기는 Storyboard 자동 구성이 한다). composeDeck 이 바닥글 · 쪽 번호를 넣으려 부르는 t() 는 칸 이름을 모르므로 그대로 둔다.
function plainSheet(f, role, row) {
  const s = { o: { f, t: {}, img: {} }, role, row, t: () => s, img: () => s };
  return s;
}

// 지난번에 올린 파트 · 구성 — 다시 덮을 때 걷어 내고, 정의가 바뀐 구성은 조립해 둔 덱(SC …)을 지운다
const STATE = { parts: new Set(), tpls: new Map() }; // tpls: id → 정의 서명
function purge(id, R) {
  for (const reg of [R.SC, R.FILLS, R.STORY, R.FILL_CUSTOMER]) {
    if (!reg) continue;
    for (const k of Object.keys(reg)) if (k.startsWith(`toc_${id}__`) || k.startsWith(`toc_${id}+`)) delete reg[k];
  }
}

/**
 * 운영 값의 직접 만든 파트 · 구성을 레지스트리에 올린다(다시 부르면 지난번 것을 걷어 내고 새로 올린다).
 *   R: { TOCS, TPL, SC, FILLS, STORY, FILL_CUSTOMER } → [{ t, index }] (올린 구성 — applyTocPresets 가 순서를 정해 TOC_TEMPLATES 에 넣는다)
 */
export function applyCustomPresets(P, R) {
  const parts = P && P.parts && typeof P.parts === 'object' && !Array.isArray(P.parts) ? P.parts : {};
  const tpls = P && P.templates && typeof P.templates === 'object' && !Array.isArray(P.templates) ? P.templates : {};
  for (const k of STATE.parts) if (R.TOCS[k] && R.TOCS[k].custom) delete R.TOCS[k];
  STATE.parts.clear();
  for (const [key, def] of Object.entries(parts)) {
    if (!CUSTOM_PART_ID.test(key) || R.TOCS[key] || !def || typeof def !== 'object') continue;
    const sheets = partSheets(def);
    if (!sheets.length) continue;
    const name = text(def.name, PART_NAME_MAX) || '새 파트';
    const type = typeof def.type === 'string' && /^[a-z]{2,20}$/.test(def.type) ? def.type : 'free';
    const labels = [...new Set(sheets.map((x) => x.label).filter(Boolean))];
    const goal = labels.length ? `${name} — ${labels.slice(0, 4).join(' · ')}` : name;
    R.TOCS[key] = {
      name, type, goal, sub: labels.slice(0, 3).join(' · ') || name, custom: true, look: partLook(def), sheets, stage: TYPE_STAGE[type] || 'value',
      build: () => sheets.map((x) => plainSheet(x.f, `${name} · ${x.label || x.f}`, x.label || name)),
    };
    STATE.parts.add(key);
  }
  const out = []; const seen = new Set();
  for (const [id, def] of Object.entries(tpls)) {
    if (!CUSTOM_TEMPLATE_ID.test(id) || !def || typeof def !== 'object' || (R.TPL[id] && !R.TPL[id].custom)) continue;
    const tocs = Array.isArray(def.tocs) ? def.tocs.filter((k) => typeof k === 'string') : [];
    if (compositionProblems(tocs, (k) => !!R.TOCS[k]).length) continue;
    const name = text(def.name, 40) || '새 구성';
    const t = {
      id, custom: true, name, desc: text(def.desc, 300), deck: deckWord(name), hue: 'slate', req: 'custom', strategy: 'value', ending: 'workshop',
      tocs: [...tocs], sub: name, related: Array.isArray(def.related) ? def.related.filter((x) => typeof x === 'string') : [],
      ...(tocs.includes('ua') ? { ua: ['prof', 'line', 'key', 'matrix'] } : {}), // 당사의 이해 — 표준 제안서 확장형과 같은 장(고객사 · 트렌드 · 키워드 · 경쟁 비교)
    };
    const hint = text(def.hint, 160);
    if (hint) t.hint = hint;
    t.sig = JSON.stringify([t.tocs, t.name, tocs.map((k) => (R.TOCS[k].custom ? [R.TOCS[k].name, R.TOCS[k].sheets] : 0))]);
    R.TPL[id] = t; seen.add(id);
    if (STATE.tpls.get(id) !== t.sig) purge(id, R);
    STATE.tpls.set(id, t.sig);
    out.push({ t, index: 1000 + out.length });
  }
  for (const id of [...STATE.tpls.keys()]) {
    if (seen.has(id)) continue;
    if (R.TPL[id] && R.TPL[id].custom) delete R.TPL[id];
    purge(id, R); STATE.tpls.delete(id);
  }
  return out;
}
/** 직접 만든 구성의 '맞는 상황' 기본 문구 — 설명 */
export const customTemplateHint = (t) => t.desc || t.name;
