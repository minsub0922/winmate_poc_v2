// B2B 전략 시뮬레이션 — 최종 제안 대상자(고객) 프로필.
// 난이도 3단계(호의적 · 첫 고객 · 까다로운 고객)마다 관계 · 인식 · 의사결정 · 경쟁 · 예산 · 말투와
// 숨은 우려 개수가 다르고, 요구사항(Best Scenario 예시 · 내 제안서 · 직접 입력)에서 관심사와 우려를 가져온다.
import { IND, P, S, C } from '../data.js';
import { SCENARIOS, SC, REQ_TYPES } from '../scenarios.js';
import { FILL_CUSTOMER } from '../scenario_fills.js';
import { reqText, inferIndustry, toks } from '../search.js';
import { seg, segRefs } from '../store.js';

export const LEVELS = [
  {
    id: 1, key: 'friendly', name: '호의적인 고객', tag: '이미 잘 아는 고객', hue: 'green', start: 60, win: 75, lose: 15, nConcern: 1, drift: 0,
    relation: '3년째 거래 중인 기존 고객 · 지난 사업 결과에 만족', perception: '삼성 제품 · 서비스를 신뢰한다',
    style: '실무 중심 · 결정이 빠르다', competition: '단독 협의 — 비교 견적은 형식적', budget: '예산은 확보됨 · 범위와 일정이 관건',
    tone: '친근하고 협조적 · 궁금한 건 편하게 묻는다', meters: { trust: 4, patience: 5, price: 2, pressure: 1 },
    ai: '호의적이고 협조적이다. 근거가 조금 부족해도 너그럽게 넘어가지만, 엉뚱한 제품이나 과장은 부드럽게 지적한다. 만족도는 잘 오르고 잘 안 떨어진다.',
  },
  {
    id: 2, key: 'first', name: '첫 고객', tag: '처음 만나는 고객', hue: 'blue', start: 45, win: 80, lose: 15, nConcern: 2, drift: 1,
    relation: '첫 미팅 · 삼성 B2B 제품을 써 본 적 없음', perception: '브랜드는 알지만 B2B 역량은 반신반의',
    style: '근거 · 사례를 확인한 뒤 신중하게 결정', competition: '다른 업체 1~2곳도 알아보는 중', budget: '예산 규모를 아직 밝히지 않음',
    tone: '정중하지만 신중 · 구체적인 근거를 되묻는다', meters: { trust: 2, patience: 3, price: 3, pressure: 3 },
    ai: '정중하지만 신중하다. 근거 없는 수치와 일반론에는 "어디 기준인가요?"라고 되묻고, 비슷한 업종의 사례 · 운영 방식 설명에 마음이 움직인다.',
  },
  {
    id: 3, key: 'tough', name: '까다로운 고객', tag: '경쟁사가 많은 고객', hue: 'red', start: 30, win: 85, lose: 15, nConcern: 3, drift: 2,
    relation: '현재 경쟁사 장비 사용 중 · 구매팀이 함께 들어옴', perception: '"삼성은 비싸다"는 인식 · 전환 비용을 걱정',
    style: '숫자와 비교표로만 판단 · 말을 자르고 결론을 요구', competition: '경쟁사 A(국내) · 경쟁사 B(저가 수입)가 15~25% 낮은 단가 제시', budget: '예산이 빠듯함 · 단가 인하 압박',
    tone: '짧고 날카롭다 · 일반론과 과장에 바로 반박', meters: { trust: 1, patience: 2, price: 5, pressure: 5 },
    ai: '짧고 날카롭다. 경쟁사 견적을 근거로 단가와 전환 비용을 계속 압박하고, 일반론 · 과장 · 질문 회피에는 바로 반박한다. 숫자 · 비교 · 총소유비용(TCO) · 리스크 대응에만 점수를 준다. 만족도는 천천히 오르고 쉽게 떨어진다.',
  },
];
export const LV = Object.fromEntries(LEVELS.map((l) => [l.id, l]));
export const METERS = [['trust', '신뢰도'], ['patience', '인내심'], ['price', '가격 민감도'], ['pressure', '경쟁 압박']];

// 대화 흐름 단계 — Best Scenario의 STAGES와 이어진다(stageKeys).
export const SIM_STAGES = [
  { k: 'open', label: '열기', keys: ['open'] },
  { k: 'needs', label: '니즈 확인', keys: ['context', 'problem'] },
  { k: 'value', label: '가치 제안', keys: ['value', 'space', 'build'] },
  { k: 'proof', label: '근거 · 증명', keys: ['proof'] },
  { k: 'objection', label: '우려 대응', keys: ['proof', 'plan'] },
  { k: 'close', label: '결정 요청', keys: ['plan', 'close'] },
];
export const STAGE_IX = Object.fromEntries(SIM_STAGES.map((s, i) => [s.k, i]));

// 숨은 우려 — 공통 풀(난이도별로 앞에서부터) + 예시 시나리오의 이의(objections)
const GENERIC = {
  compete: { text: '경쟁사가 더 낮은 단가를 제시했다', short: '경쟁사 단가', ref: '경쟁사 단가 문제', say: '경쟁사가 더 낮은 단가를 제시했어요', kw: ['경쟁', '비교', '차별', '단가', 'TCO', '총소유', '왜 삼성', '가격'] },
  budget: { text: '초기 투자비가 예산을 넘을까 걱정된다', short: '초기 투자비', ref: '초기 투자비 문제', say: '초기 투자비가 예산을 넘을까 걱정입니다', kw: ['비용', '예산', '가격', '구독', '렌탈', 'TCO', '투자', '회수', '리스', '분할'] },
  proof: { text: '정말 효과가 있는지 검증된 사례가 있는지 모르겠다', short: '검증 사례', ref: '검증 사례', say: '정말 효과가 있는지, 검증된 사례가 있는지 모르겠어요', kw: ['사례', '레퍼런스', '성과', '실적', '검증', '파일럿', '실측'] },
  switch: { text: '기존 장비에서 바꾸는 동안 운영이 멈출까 걱정된다', short: '전환 중 운영 중단', ref: '전환 중 운영 중단 문제', say: '기존 장비에서 바꾸는 동안 운영이 멈출까 걱정입니다', kw: ['전환', '교체', '호환', '이관', '중단', '야간', '단계', '파일럿', '일정'] },
  ops: { text: '도입 후 운영 · 관리할 인력이 부족하다', short: '운영 인력', ref: '운영 인력 문제', say: '도입하고 나서 운영 · 관리할 인력이 부족해요', kw: ['운영', '관리', '원격', 'CMS', '교육', '유지보수', '서비스', '자동'] },
  security: { text: '네트워크 장애 · 보안 문제가 생길까 걱정된다', short: '네트워크 · 보안', ref: '네트워크 · 보안 문제', say: '네트워크 장애나 보안 문제가 생길까 걱정입니다', kw: ['보안', 'Knox', '네트워크', '오프라인', '장애', '백업'] },
};
/** "…어렵다" → "…어렵다는 점" (말 속에서 다시 가리킬 때) */
function speakRef(q) {
  const t = String(q || '').trim().replace(/[.?!]+$/, '');
  if (/다$/.test(t)) return t + '는 점';
  if (/[나까지]$/.test(t)) return t + ' 하는 부분';
  return t + ' 부분';
}
/** 시나리오 이의 문장을 말투로: "…어렵다" → "…어렵다는 점이 걱정입니다" */
function speak(q) {
  const t = String(q || '').trim().replace(/[.?!]+$/, '');
  if (/다$/.test(t)) return t + '는 점이 걱정입니다';
  if (/[나까지]$/.test(t)) return t + ' 하는 부분이 걱정입니다';
  return t + ' 부분이 걱정입니다';
}
const LEVEL_POOL = { 1: ['ops'], 2: ['proof', 'ops'], 3: ['compete', 'budget', 'switch'] };

const KW_STOP = new Set(['있다', '없다', '하다', '되다', '그리고', '그래서', '어떻게', '너무', '정말']);
function kwOf(text) {
  const words = String(text || '').match(/[A-Za-z][A-Za-z0-9+.-]*|[가-힣]{2,}/g) || [];
  const out = [];
  for (let w of words) {
    w = w.replace(/(은|는|이|가|을|를|에|의|도|로|으로|에서|부터|까지|하고|하는|하면|한다|해서|했다|된다|되는|인가|인지|지만|으면)$/, '');
    if (w.length >= 2 && !KW_STOP.has(w) && !out.includes(w)) out.push(w);
  }
  return out.slice(0, 10);
}

/** 예시 요구사항 = Best Scenario (상황 · 신호 · 평가 기준 · 이의 · 연결 제품). */
export const PRESETS = SCENARIOS.map((s) => ({
  id: s.id, title: s.title, ind: s.ind, req: s.req, customer: FILL_CUSTOMER[s.id] || '고객사', role: s.audience.lead,
  hue: REQ_TYPES[s.req] ? REQ_TYPES[s.req].hue : 'slate',
}));
export const PRESET_QUICK = ['bs01', 'bs07', 'bs10', 'bs13', 'bs17', 'bs03'];

/** 설정 초안(setup) 만들기 */
export function setupFromScenario(sid) {
  const s = SC[sid]; if (!s) return null;
  const sig = (s.signals || []).map((x) => x.replace(/[“”"]/g, '')).slice(0, 3);
  const text = s.situation + (sig.length ? '\n고객의 말: ' + sig.map((x) => '“' + x + '”').join(' ') : '');
  return {
    source: 'scenario', sid, pid: null, customer: FILL_CUSTOMER[sid] || '고객사', ind: s.ind || '', role: s.audience.lead,
    req: seg(text), interests: (s.criteria || []).slice(0, 4),
    refs: { products: [...(s.products || [])], solutions: [...(s.solutions || [])], cases: [...(s.cases || [])].map(String) },
    title: s.title,
  };
}
export function setupFromProposal(p) {
  const text = reqText({ ...p, title: '', customer: '' }).trim();
  const keyReqs = ((p.req.form && p.req.form.keymen) || []).flatMap((k) => (k.reqs || []).map((r) => (Array.isArray(r) ? r.map((x) => x.t || '').join('') : String(r))))
    .map((x) => x.trim()).filter(Boolean);
  const ind = p.ind && IND[p.ind] ? p.ind : inferIndustry(reqText(p)) || '';
  const lead = ((p.req.form && p.req.form.keymen) || [])[0];
  const free = Array.isArray(p.req.free) && p.req.free.some((x) => (x.t || '').trim() || x.ref) ? p.req.free : seg(text.slice(0, 900));
  return {
    source: 'proposal', sid: null, pid: p.id, customer: p.customer || '', ind, role: (lead && lead.name) || '의사결정자',
    req: free, interests: keyReqs.length ? keyReqs.slice(0, 4) : interestsFromText(text),
    refs: { products: [...(p.ctx.products || [])], solutions: [...(p.ctx.solutions || [])], cases: [...(p.ctx.cases || [])].map(String) },
    title: p.title,
  };
}
export function emptySetup() {
  return { source: 'free', sid: null, pid: null, customer: '', ind: '', role: '', req: [], interests: [], refs: { products: [], solutions: [], cases: [] }, title: '' };
}
export function interestsFromText(text) {
  const parts = String(text || '').split(/[\n.!?。]|(?:고 싶|원한다|원해요|필요)/).map((x) => x.replace(/^[\s\-•·*\d.)]+/, '').trim()).filter((x) => x.length >= 6 && x.length <= 60);
  return [...new Set(parts)].slice(0, 4);
}
export const setupText = (st) => (st.req || []).map((x) => (x.t != null ? x.t : refName(x.ref))).join('').trim();
export function refName(r) {
  const [t, id] = String(r || '').split(':');
  if (t === 'product') return P[id] ? P[id].model : '';
  if (t === 'solution') return S[id] ? S[id].name : '';
  if (t === 'case') return C[id] ? C[id].cust : '';
  return '';
}
/** 설정의 모든 연결 항목(ref 문자열) — 요구사항 본문 @태그 포함 */
export function setupRefs(st) {
  const out = [...st.refs.products.map((x) => 'product:' + x), ...st.refs.solutions.map((x) => 'solution:' + x), ...st.refs.cases.map((x) => 'case:' + x), ...segRefs(st.req)];
  return [...new Set(out)];
}

// 최종 제안 대상자 6명 — 난이도 3단계 × 남/여. 직함은 설정의 '최종 제안 대상자'를 따르고, 이름 · 나이 · 경력 · 성향 · 한마디 · 얼굴은 여기서.
export const PERSONAS = Object.fromEntries([
  { key: '1M', level: 1, gender: 'M', name: '박정훈', age: 52, career: '업계 24년 · 삼성과 3년째 거래', traits: ['실무형', '결정이 빠름', '관계 중시'], quote: '지난번처럼만 해 주시면 됩니다. 편하게 얘기해 보죠.', style: '현장 얘기를 좋아하고, 믿는 파트너에게는 빨리 결정을 내린다',
    look: { skin: '#f0cfb2', shade: '#dcae8c', hair: '#5d5955', hairStyle: 'gray', suit: '#8b6b4e', lapel: '#7a5c41', shirt: '#cfe0f2', shirt2: '#e3eef9', top: 'open', smileEyes: true, base: 'happy' } },
  { key: '1F', level: 1, gender: 'F', name: '김수연', age: 46, career: '업계 19년 · 삼성 제품 2차례 도입', traits: ['적극적', '현장 중심', '빠른 피드백'], quote: '좋은 건 바로 도입하는 편이에요. 현장 얘기부터 들려주세요.', style: '좋은 아이디어엔 바로 반응하고, 팀 설득도 직접 맡는다',
    look: { skin: '#f3d5bc', shade: '#e0b293', hair: '#3b2a22', hairStyle: 'bob', suit: '#c4664f', lapel: '#ad5642', shirt: '#fbf6ef', top: 'blouse', earring: '#d9b45a', smileEyes: true, base: 'happy' } },
  { key: '2M', level: 2, gender: 'M', name: '이준호', age: 44, career: '업계 17년 · 삼성 B2B는 처음', traits: ['신중함', '근거 중시', '비교 검토'], quote: '삼성은 처음이라, 근거부터 차근차근 보고 싶습니다.', style: '자료를 끝까지 읽고 질문 목록을 만들어 온다',
    look: { skin: '#eecbab', shade: '#d6a885', hair: '#1f1b19', hairStyle: 'side', suit: '#24344f', lapel: '#1b2840', shirt: '#ffffff', tie: '#3c66b5', top: 'tie', glasses: 'rect', base: 'flat' } },
  { key: '2F', level: 2, gender: 'F', name: '정하은', age: 39, career: '업계 14년 · 운영 혁신 TF 리더', traits: ['꼼꼼함', '사례 중시', '실무 검증'], quote: '비슷한 곳에서 실제로 어떻게 쓰는지가 제일 궁금해요.', style: '사례와 실측 숫자를 직접 확인한 뒤에 마음을 연다',
    look: { skin: '#f4d7c0', shade: '#e2b597', hair: '#1c1817', hairStyle: 'tied', suit: '#5b6271', lapel: '#4c5361', shirt: '#f6dfe0', top: 'blouse', earring: '#f3efe6', glasses: 'round', base: 'flat' } },
  { key: '3M', level: 3, gender: 'M', name: '한상철', age: 56, career: '업계 28년 · 현재 경쟁사 장비 운영', traits: ['숫자로만 판단', '가격 압박', '말을 자름'], quote: '견적 두 곳 받아 놨습니다. 왜 삼성이어야 하는지 숫자로 주세요.', style: '비교표와 총비용으로만 판단하고, 일반론에는 바로 말을 자른다',
    look: { skin: '#e8c1a0', shade: '#cf9f7c', hair: '#6f6c69', hairStyle: 'crop', suit: '#2a2c33', lapel: '#202228', shirt: '#f4f4f2', tie: '#7a2531', top: 'tie', thickBrow: true, brow: '#4a4542', base: 'stern' } },
  { key: '3F', level: 3, gender: 'F', name: '윤미경', age: 51, career: '업계 25년 · 구매 · 계약 총괄', traits: ['TCO 중시', '날카로운 질문', '구매팀 동석'], quote: '좋은 말은 됐고요, 비교표와 총비용부터 보죠.', style: '계약 조건과 숨은 비용을 끝까지 파고들고, 과장에는 바로 반박한다',
    look: { skin: '#f1d0b5', shade: '#dba98a', hair: '#1a1616', hairStyle: 'pixie', suit: '#1f2229', lapel: '#16181d', shirt: '#eceae6', top: 'blouse', earring: '#f3efe6', necklace: true, glasses: 'half', base: 'stern' } },
].map((p) => [p.key, p]));
function hash(s) { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
/** 성별을 고르지 않으면 고객사 · 직함으로 정해 둔다(같은 설정이면 늘 같은 사람) */
export const defaultGender = (st) => (hash((st.customer || '') + (st.role || '')) % 2 ? 'F' : 'M');
/** 프로필(세션 · 설정)의 인물 — 직접 만든 프로필은 얼굴(look)을 프로필 안에 들고 다녀, 원본을 지워도 기록의 얼굴은 그대로 */
export function personaOf(pf) {
  if (pf.look) return { key: pf.pkey || pf.key || 'cp', custom: true, level: pf.level || 2, gender: pf.gender === 'F' ? 'F' : 'M', name: pf.name, age: pf.age, role: pf.prole || '', career: pf.career || '', traits: pf.traits || [], quote: pf.quote || '', style: pf.style || '', face: pf.face || '', look: pf.look };
  return PERSONAS[pf.key] && PERSONAS[pf.key].level === pf.level ? PERSONAS[pf.key] : PERSONAS[(pf.level || 2) + (pf.gender === 'F' ? 'F' : 'M')];
}
/** 난이도를 바꿀 때의 인물: 기본 인물은 그 난이도의 같은 성별 인물로, 직접 만든 인물은 그대로 */
export const personaForLevel = (per, level) => (per && per.custom ? per : PERSONAS[level + (per && per.gender === 'F' ? 'F' : 'M')]);

/** 세션의 고객 프로필(설정 + 난이도) */
export function buildProfile(st, level, gender, persona) {
  const L = LV[level] || LV[2];
  const g0 = persona ? persona.gender : gender === 'F' || gender === 'M' ? gender : st.gender === 'F' || st.gender === 'M' ? st.gender : defaultGender(st);
  const g = g0 === 'F' ? 'F' : 'M';
  const base = PERSONAS[level + g];
  const per = persona && persona.custom ? persona : persona && PERSONAS[persona.key] ? PERSONAS[persona.key] : base;
  const name = per.name;
  const s = st.sid ? SC[st.sid] : null;
  const text = setupText(st);
  const interests = (st.interests && st.interests.length ? st.interests : interestsFromText(text)).slice(0, 4);
  // 숨은 우려: 시나리오 이의를 먼저 섞고, 난이도별 공통 우려로 채움
  const pool = [];
  const generic = LEVEL_POOL[level].map((k) => ({ key: k, ...GENERIC[k], answer: '' }));
  const fromScenario = (s && s.objections ? s.objections : []).map(([q, a], i) => ({ key: 'obj' + i, text: q, short: q.length > 16 ? q.slice(0, 15) + '…' : q, ref: speakRef(q), say: speak(q), kwq: kwOf(q), kw: kwOf(q + ' ' + a), answer: a }));
  if (level === 3) pool.push(generic[0], ...fromScenario.slice(0, 1), ...generic.slice(1));
  else if (level === 2) pool.push(...fromScenario.slice(0, 1), ...generic);
  else pool.push(...(fromScenario.length ? fromScenario.slice(0, 1) : generic));
  // 비슷한 우려는 하나만 (예: "경쟁사 단가" ≈ "기존 업체가 가격을 낮춘다")
  const TOPIC = { compete: /가격|단가|싸다|저가/, budget: /비용|예산|투자비|원가/, proof: /사례|실적|검증|정말|효과가/, switch: /교체 중|중단|병행|전환/, ops: /인력|운영팀|안 쓰|교육/ };
  const isObj = (x) => String(x.key).startsWith('obj');
  const sameTopic = (a, b) => (isObj(a) && TOPIC[b.key] && TOPIC[b.key].test(a.text)) || (isObj(b) && TOPIC[a.key] && TOPIC[a.key].test(b.text));
  const picked = [];
  for (const c of pool) {
    if (!c || picked.length >= L.nConcern) continue;
    const ct = new Set(toks(c.text));
    const dup = picked.some((p) => { const pt = toks(p.text); const hit = pt.filter((w) => ct.has(w)).length; return hit / Math.max(1, Math.min(pt.length, ct.size)) >= 0.3 || sameTopic(p, c); });
    if (!dup) picked.push(c);
  }
  for (const k of ['ops', 'proof', 'switch', 'security', 'budget']) { if (picked.length >= L.nConcern) break; if (!picked.some((p) => p.key === k)) picked.push({ key: k, ...GENERIC[k], answer: '' }); }
  const concerns = picked.slice(0, L.nConcern)
    .map((c, i) => ({ id: 'c' + (i + 1), key: c.key, text: c.text, short: c.short, ref: c.ref || c.short, say: c.say, kw: c.kw, kwq: c.kwq || null, answer: c.answer || '', revealed: false, resolved: false, at: null }));
  const ask = s ? s.ask : '파일럿 · 다음 미팅 일정 합의';
  return {
    name, gender: g, age: per.age, career: per.career || '', traits: per.traits && per.traits.length ? per.traits : [], quote: per.quote || base.quote, style: per.style || base.style, key: per.key,
    ...(per.custom ? { look: per.look, pkey: per.key, prole: per.role || '', face: per.face || '' } : {}),
    role: (per.custom && per.role) || st.role || '의사결정자', company: st.customer || '고객사', ind: st.ind || '', level,
    interests, concerns, ask, next: s ? s.next || [] : [], kpis: s ? s.kpis || [] : [],
  };
}

/** 받침에 맞는 조사: josa('승인', '으로/로') → '승인으로' */
export function josa(word, pair) {
  const w = String(word || '').trim(); const [a, b] = pair.split('/');
  const ch = w.charCodeAt(w.length - 1);
  if (!(ch >= 0xac00 && ch <= 0xd7a3)) return w + (/[0-9LMNRlmnr]$/.test(w) ? a : b);
  const jong = (ch - 0xac00) % 28;
  if (pair === '으로/로') return w + (jong === 0 || jong === 8 ? b : a);
  return w + (jong ? a : b);
}

/** 대화에 쓰는 고객 소개 한 줄 */
export const personaLine = (pf) => pf.company + ' · ' + pf.role + (pf.ind && IND[pf.ind] ? ' · ' + IND[pf.ind].name : '');
export { toks };
