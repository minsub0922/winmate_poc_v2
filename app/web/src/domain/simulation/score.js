// B2B 전략 시뮬레이션 — 제안 품질 · 고객 만족도 · 추천 답변 · 참고할 제안서.
// 품질 기준은 '제안서 검토'의 평가 기준(review/criteria.js)에서 대화로 확인할 수 있는 대표 기준만 골랐다.
// AI가 없을 때도 돌아가도록 모든 점수 · 추천은 규칙으로도 만든다(AI가 있으면 AI 값이 우선).
import { CR, CAT, band } from '../review/criteria.js';
import { P, S, C, IND, PRODUCTS, SOLUTIONS, CASES } from '../../services/catalog.js';
import { SCENARIOS, REQ_TYPES, STRATEGIES, STAGES } from '../templates/scenarios.js';
import { toks, recommendContext } from '../../services/search.js';
import { segRefs } from '../../repositories/proposals.js';
import { LV, STAGE_IX, SIM_STAGES, setupText, setupRefs, refName, josa } from './profile.js';

export const SIM_CATS = [
  { id: 'CU', name: '고객 맞춤', icon: 'building', crit: ['CU2', 'CU3', 'CU4'] },
  { id: 'PR', name: '제품 · 솔루션', icon: 'monitor', crit: ['PR3', 'PR4', 'PR6'] },
  { id: 'VS', name: '가치 · 스토리', icon: 'gem', crit: ['VS1', 'VS2', 'VS4', 'VS6'] },
  { id: 'MK', name: '근거 · 신뢰', icon: 'shield', crit: ['VS5', 'MK3', 'WR5'] },
].map((c) => ({ ...c, w: CAT[c.id] ? CAT[c.id].w : 15, desc: CAT[c.id] ? CAT[c.id].desc : '' }));
export const SIM_CRIT = SIM_CATS.flatMap((c) => c.crit);
// 대화에서 이 기준을 보는 방법(검토 기준 설명은 CR[id].desc)
export const CHAT_DESC = {
  CU2: '고객이 말한 요구사항 · 관심사 하나하나에 답했나',
  CU3: '결정권자가 신경 쓰는 비용 · 성과 · 리스크 언어로 말했나',
  CU4: '이 고객의 현재 문제를 구체적으로 짚거나 확인했나',
  PR3: '언급한 제품이 고객의 공간 · 업종 환경에 맞나',
  PR4: '하드웨어가 운영 솔루션 · 서비스로 이어지나',
  PR6: '공간별 구성 · 수량 · 단계가 그려지나',
  VS1: '고객이 얻는 가치가 2~4개로 선명한가',
  VS2: '효과를 전후 수치 · KPI로 말했나',
  VS4: '삼성이어야 하는 이유를 근거와 함께 말했나',
  VS6: '일정 · 파일럿 · 다음 단계가 구체적인가',
  VS5: '비슷한 업종의 도입 사례로 증명했나',
  MK3: '수치마다 기준 · 출처가 있나',
  WR5: '최고 · 최초 · 100% 같은 근거 없는 단정을 피했나',
};
export const critName = (id) => (CR[id] ? CR[id].name : id);

// ---------------------------------------------------------------- text helpers
const plainOf = (segs) => (Array.isArray(segs) ? segs.map((s) => (s.t != null ? s.t : ' ' + refName(s.ref) + ' ')).join('') : String(segs || ''));
export const msgPlain = (m) => (m.who === 'me' ? plainOf(m.segs) : m.text || '');
const count = (text, words) => words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, Math.round(v)));
const ABS = ['최고', '최초', '유일', '100%', '무조건', '완벽', '보장', '절대', '압도적', '반드시'];
const NUM_RE = /\d[\d,.]*\s*(%|퍼센트|원|만원|억|천만|배|일|주|개월|시간|분|초|대|곳|개소|매장|세트|명|nit|인치|"|kW|㎡|평|년)/g;

function sellerText(sim) { return sim.msgs.filter((m) => m.who === 'me').map(msgPlain).join('\n'); }
function sellerRefs(sim) { return [...new Set(sim.msgs.filter((m) => m.who === 'me').flatMap((m) => segRefs(m.segs)))]; }
export function mentionedRefs(sim) { return sellerRefs(sim); }

// ---------------------------------------------------------------- rule-based quality
export function ruleScores(sim) {
  const t = sellerText(sim);
  const pf = sim.profile;
  const refs = sellerRefs(sim);
  const prods = refs.filter((r) => r.startsWith('product:')).map((r) => P[r.split(':')[1]]).filter(Boolean);
  const sols = refs.filter((r) => r.startsWith('solution:')).map((r) => S[r.split(':')[1]]).filter(Boolean);
  const cases = refs.filter((r) => r.startsWith('case:')).map((r) => C[r.split(':')[1]]).filter(Boolean);
  const nums = (t.match(NUM_RE) || []).length;
  const reqT = setupText(sim.setup) + ' ' + pf.interests.join(' ');
  const out = {}; const notes = {};
  if (!t.trim()) return { scores: null, notes };
  // CU2 — interests covered
  const ints = pf.interests.length ? pf.interests : [reqT];
  const st = new Set(toks(t));
  const cov = ints.filter((x) => { const k = toks(x); if (!k.length) return false; const hit = k.filter((w) => st.has(w)).length; return hit / k.length >= 0.34 || hit >= 3; }).length;
  out.CU2 = clamp(18 + 82 * (cov / Math.max(1, ints.length)));
  notes.CU2 = `관심사 ${ints.length}개 중 ${cov}개에 답함`;
  const kpiW = count(t, ['매출', '비용', '절감', '리스크', '예산', '투자', '회수', 'ROI', 'TCO', 'KPI', '성과', '운영비', '인건비', '효율', '총소유']);
  out.CU3 = clamp(20 + kpiW * 14 + (t.includes(pf.role) ? 8 : 0)); notes.CU3 = kpiW ? `경영 언어 ${kpiW}개` : '비용 · 성과 · 리스크 언어가 없어요';
  const probW = count(t, ['현재', '지금', '문제', '과제', '병목', '불편', '걸리', '늦', '반복', '여쭤', '궁금', '확인']);
  out.CU4 = clamp(18 + probW * 11 + (pf.company && t.includes(pf.company.replace(/\s+/g, '').slice(0, 2)) ? 10 : 0)); notes.CU4 = probW ? '고객 현황을 짚음' : '고객의 현재 문제를 짚지 않았어요';
  // PR3 — products that fit the industry / spaces
  const fit = prods.filter((p) => (pf.ind && p.ind.includes(pf.ind)) || p.spaces.some((sp) => reqT.includes(sp)));
  out.PR3 = prods.length ? clamp(35 + fit.length * 22 - (prods.length - fit.length) * 8) : 12;
  notes.PR3 = prods.length ? `제품 ${prods.length}종 중 ${fit.length}종이 업종 · 공간에 맞음` : '제품을 언급하지 않았어요 (@로 제품 연결)';
  const linked = sols.filter((s) => s.with.some((pid) => prods.some((p) => p.id === pid)));
  out.PR4 = clamp((sols.length ? 30 + sols.length * 20 : 10) + linked.length * 15 + count(t, ['원격', '관리', '운영', 'CMS', '콘텐츠', '유지보수']) * 5);
  notes.PR4 = sols.length ? `솔루션 ${sols.length}개${linked.length ? ' · 제품과 연동 설명' : ''}` : '운영 솔루션 연결이 없어요';
  const qty = (t.match(/\d[\d,]*\s*(대|곳|개소|매장|세트|식|개)/g) || []).length + (t.match(/\[(수량|00|0+)\]/g) || []).length;
  out.PR6 = clamp(15 + qty * 18 + count(t, ['구성', '단계', '유형별', '패키지']) * 10); notes.PR6 = qty ? `구성 · 수량 표현 ${qty}개` : '구성 · 수량이 없어요';
  // VS
  const benW = count(t, ['줄이', '절감', '늘리', '향상', '개선', '빨라', '당일', '자동', '한 번에', '동시에', '편해', '안정']);
  out.VS1 = clamp(18 + benW * 12 + (/(세 가지|두 가지|첫째|①|1\))/.test(t) ? 14 : 0)); notes.VS1 = benW ? `고객 가치 표현 ${benW}개` : '고객이 얻는 결과가 안 보여요';
  out.VS2 = clamp(12 + nums * 15 + (t.includes('전후') || t.includes('→') ? 8 : 0)); notes.VS2 = nums ? `수치 ${nums}개` : '정량 효과가 없어요';
  const why = count(t, ['서비스망', '전국', '보증', 'Knox', '통합', '라인업', '레퍼런스', '원스톱', '한 회사', '직접 책임', 'A/S']);
  out.VS4 = clamp(15 + why * 16 + (t.includes('삼성') ? 10 : 0)); notes.VS4 = why ? `차별 근거 ${why}개` : 'Why Samsung 근거가 없어요';
  const plan = count(t, ['파일럿', '단계', '일정', '주차', '개월', '착수', '설치', '교육', '확산', '실사', '다음 주', '다음 단계']);
  out.VS6 = clamp(14 + plan * 13); notes.VS6 = plan ? `실행 표현 ${plan}개` : '일정 · 다음 단계가 없어요';
  const sameInd = cases.filter((c) => pf.ind && c.ind === pf.ind).length;
  out.VS5 = clamp((cases.length ? 35 + cases.length * 18 + sameInd * 14 : 10) + (t.includes('사례') ? 6 : 0));
  notes.VS5 = cases.length ? `사례 ${cases.length}건${sameInd ? ' · 같은 업종 ' + sameInd + '건' : ''}` : '사례 근거가 없어요 (@로 유관사례 연결)';
  const src = count(t, ['출처', '기준', '조사', '실측', '자료', '사례에서', '년 기준', '공식']);
  out.MK3 = nums ? clamp(30 + src * 20 + (cases.length ? 15 : 0)) : clamp(30 + cases.length * 10);
  notes.MK3 = nums ? (src || cases.length ? '수치에 근거를 붙임' : '수치에 출처가 없어요') : '아직 수치가 없어요';
  const abs = ABS.filter((w) => t.includes(w));
  out.WR5 = clamp(92 - abs.length * 22); notes.WR5 = abs.length ? '단정 표현: ' + abs.slice(0, 3).join(' · ') : '과장 표현 없음';
  return { scores: out, notes };
}

/** category & total quality from criterion scores */
export function aggregate(scores) {
  if (!scores) return { total: null, cats: SIM_CATS.map((c) => ({ ...c, v: null })) };
  const cats = SIM_CATS.map((c) => {
    let s = 0, w = 0;
    for (const id of c.crit) { const v = scores[id]; if (v == null) continue; const wt = CR[id] ? CR[id].w : 1; s += v * wt; w += wt; }
    return { ...c, v: w ? Math.round(s / w) : null };
  });
  let s = 0, w = 0; for (const c of cats) if (c.v != null) { s += c.v * c.w; w += c.w; }
  return { total: w ? Math.round(s / w) : null, cats };
}
export { band };

// ---------------------------------------------------------------- rule-based turn (satisfaction · concerns · stage)
const CLOSE_W = ['진행', '승인', '다음 단계', '일정을 잡', '일정 잡', '시작해도', '착수', '계약', '결정', '해도 될까요', '하시겠', '진행할까요'];
export function ruleTurn(sim, prevScores) {
  const L = LV[sim.level];
  const me = sim.msgs.filter((m) => m.who === 'me');
  const last = me[me.length - 1];
  const t = last ? msgPlain(last) : '';
  const { scores, notes } = ruleScores(sim);
  const prevQ = aggregate(prevScores).total;
  const q = aggregate(scores).total;
  const turn = me.length;
  const concerns = sim.profile.concerns.map((c) => ({ ...c }));
  const resolvedNow = []; const revealedNow = [];
  // resolve: an already revealed concern answered with its keywords
  for (const c of concerns) {
    if (!c.revealed || c.resolved) continue;
    const hit = c.kw.filter((k) => t.includes(k)).length;
    const aHit = c.answer ? toks(c.answer).filter((w) => toks(t).includes(w)).length : 0;
    if (hit >= 2 || aHit >= 5 || (hit >= 1 && t.length > 70)) { c.resolved = true; resolvedNow.push(c.id); }
  }
  // reveal: touched by keywords, or by schedule (까다로울수록 일찍)
  const sched = { 1: [3], 2: [2, 4], 3: [1, 2, 4] }[sim.level];
  const hidden = concerns.filter((c) => !c.revealed);
  if (hidden.length) {
    const touched = hidden.find((c) => (c.kwq ? c.kwq.filter((k) => t.includes(k)).length >= 2 : c.kw.some((k) => t.includes(k))));
    const due = sched.includes(turn) ? hidden[0] : null;
    const c = touched || due;
    if (c) { c.revealed = true; c.at = turn; revealedNow.push(c.id); }
  }
  const abs = ABS.filter((w) => t.includes(w)).length;
  const refsN = last ? segRefs(last.segs).length : 0;
  const ignored = concerns.filter((c) => c.revealed && !c.resolved && c.at != null && turn - c.at >= 2).length;
  const lvF = [0, 0.7, 1, 1.35][sim.level];
  let delta = 0; const why = [];
  if (q != null && prevQ != null) delta += (q - prevQ) * 0.35; else if (q != null) delta += (q - 40) * 0.12;
  if (resolvedNow.length) { delta += 9 * resolvedNow.length; why.push('우려를 풀어 줘서'); }
  if (refsN) { delta += Math.min(4, refsN * 1.5); }
  if (abs) { delta -= 4 * abs * lvF; why.push('근거 없는 단정 표현'); }
  if (t.replace(/\s/g, '').length < 18) { delta -= 3 * lvF; why.push('답이 너무 짧아서'); }
  if (ignored) { delta -= 3 * ignored * lvF; why.push('우려를 넘겨서'); }
  const closingTry = CLOSE_W.some((w) => t.includes(w));
  if (closingTry && sim.cur.satisfaction + delta < L.win - 4) { delta -= 2 * lvF; why.push('결정 요청이 일러서'); }
  delta -= L.drift;
  if (!why.length) why.push(delta >= 0 ? (scores && scores.VS5 > 55 ? '사례로 근거를 대서' : scores && scores.VS2 > 55 ? '효과를 숫자로 말해서' : '요구에 맞게 답해서') : '아직 설득이 약해서');
  delta = Math.max(-15, Math.min(15, delta));
  const prevSat = sim.cur.satisfaction;
  const satisfaction = clamp(prevSat + delta);
  const nResolved = concerns.filter((c) => c.resolved).length;
  const trust = clamp((sim.cur.trust ?? L.meters.trust * 18) + (scores ? ((scores.VS5 + scores.MK3 + scores.WR5) / 3 - 50) * 0.18 : 0) + resolvedNow.length * 5);
  const interest = clamp((sim.cur.interest ?? 50) + (scores ? ((scores.CU2 + scores.VS1 + scores.PR3) / 3 - 50) * 0.18 : 0));
  // stage
  let stage = 'needs';
  const open = concerns.filter((c) => c.revealed && !c.resolved).length;
  const closing = CLOSE_W.some((w) => t.includes(w));
  if (closing) stage = 'close';
  else if (open) stage = 'objection';
  else if (scores && (scores.VS5 >= 50 || scores.MK3 >= 55)) stage = 'proof';
  else if (scores && (scores.VS1 >= 45 || scores.PR3 >= 45)) stage = 'value';
  let end = null;
  if (closing && satisfaction >= L.win && !open) end = 'win';
  else if (satisfaction <= L.lose) end = 'lose';
  const mood = moodOf(satisfaction, L);
  return { scores, notes, satisfaction, trust, interest, mood, why: why[0], stage, concerns, revealedNow, resolvedNow, end, delta: satisfaction - prevSat };
}
export function moodOf(v, L) {
  if (v >= L.win) return '만족';
  if (v >= 60) return '호의';
  if (v >= 40) return '중립';
  if (v >= 25) return '의심';
  return '불만';
}

// ---------------------------------------------------------------- rule-based customer reply (AI가 없을 때)
const pick = (arr, k) => arr[Math.abs(k) % arr.length];
export function ruleReply(sim, ev) {
  const lv = sim.level; const pf = sim.profile;
  const me = sim.msgs.filter((m) => m.who === 'me');
  const last = me[me.length - 1];
  const t = last ? msgPlain(last) : '';
  const k = me.length;
  const out = [];
  const refs = last ? segRefs(last.segs) : [];
  const prod = refs.map((r) => r.startsWith('product:') && P[r.split(':')[1]]).find(Boolean);
  const cas = refs.map((r) => r.startsWith('case:') && C[r.split(':')[1]]).find(Boolean);
  const abs = ABS.some((w) => t.includes(w));
  const nums = (t.match(NUM_RE) || []).length;
  if (ev.end === 'win') {
    out.push(pick(['좋습니다. 그 방향으로 가시죠.', '네, 설득됐습니다.', '알겠습니다. 이 조건이면 내부에 올려 보겠습니다.'], lv - 1));
    out.push(`${josa(pf.ask, '으로/로')} 진행하는 걸로 정리하죠. 필요한 자료는 담당자에게 보내 주세요.`);
    return out.join(' ');
  }
  if (ev.end === 'lose') return pick(['오늘은 여기까지 하죠. 내부 검토 후에 연락드리겠습니다.', '음, 저희가 원하는 방향과는 좀 다르네요. 다른 업체 제안도 마저 들어 보겠습니다.'], k);
  const closingTry = CLOSE_W.some((w) => t.includes(w));
  if (closingTry && !ev.resolvedNow.length) out.push([null, '좋긴 한데, 몇 가지만 더 정리하고 진행하면 좋겠어요.', '아직 결정하기엔 조금 이른 것 같습니다.', '결정은 아직입니다.'][lv]);
  else if (ev.resolvedNow.length) out.push([null, '아, 그 부분은 안심이 되네요.', '그렇게 풀린다면 걱정 하나는 덜었네요.', '그건 일단 알겠습니다.'][lv]);
  else if (abs) out.push([null, '좋은 말씀인데, 근거도 같이 주시면 좋겠어요.', '"최고"라는 표현은 어떤 근거가 있나요?', '최고, 최초는 다들 하는 말입니다. 숫자로 말씀해 주세요.'][lv]);
  else if (cas) out.push(lv === 3 ? `${cas.cust} 사례는 규모나 조건이 저희와 다르지 않나요?` : `${cas.cust} 사례는 저희 상황과 비슷하네요.${cas.proof && cas.proof[0] && lv === 1 ? ' 결과도 좋았다니 반갑습니다.' : ''}`);
  else if (prod) {
    const fit = (pf.ind && prod.ind.includes(pf.ind)) || prod.spaces.some((sp) => setupText(sim.setup).includes(sp));
    const sp = prod.spaces.find((x) => setupText(sim.setup).includes(x)) || prod.spaces[0] || '매장';
    out.push(fit ? pick([`${josa(prod.model, '이면/면')} ${sp} 쪽에 두는 거죠?`, `${josa(prod.model, '은/는')} ${sp} 환경에서 오래 써도 괜찮은 사양인가요?`, `${prod.model} 설치한 곳을 직접 볼 수 있을까요?`], k) + (lv === 3 ? ' 경쟁사 제품과 사양 차이는요?' : '') : `${josa(prod.model, '이/가')} 저희 환경에 맞는 제품인가요?`);
  } else if (nums && lv >= 2 && (ev.scores ? ev.scores.MK3 < 55 : true)) out.push(lv === 3 ? '그 숫자는 어디서 나온 건가요? 저희 기준으로 다시 계산해 주셔야 합니다.' : '말씀하신 수치는 어떤 기준인가요?');
  else if (t.replace(/\s/g, '').length < 25) out.push([null, '조금만 더 자세히 들어볼 수 있을까요?', '조금 더 구체적으로 말씀해 주시겠어요?', '그래서 결론이 뭔가요?'][lv]);
  else out.push(pick([[null, '네, 좋네요.', '네, 이해했습니다.', '음.'][lv], [null, '그렇군요.', '네, 말씀 잘 들었습니다.', '그건 다른 곳도 다 하는 얘기고요.'][lv]], k));
  const rev = ev.revealedNow.map((id) => ev.concerns.find((c) => c.id === id)).find(Boolean);
  if (rev) out.push([null, `다만 한 가지, ${rev.say}.`, `솔직히 말씀드리면, ${rev.say}.`, `그리고 ${rev.say}. 이건 어떻게 하실 건가요?`][lv]);
  else {
    const open = ev.concerns.find((c) => c.revealed && !c.resolved);
    if (open && k - (open.at || 0) >= 1) out.push([null, `아, 그리고 아까 말씀드린 ${open.ref}도 알려 주세요.`, `아까 말씀드린 ${josa(open.ref, '은/는')} 어떻게 보세요?`, `아까 말씀드린 ${open.ref} 얘기는 아직 답을 못 들었습니다.`][lv]);
    else out.push(nextQuestion(sim, ev));
  }
  const recent = sim.msgs.filter((m) => m.who === 'cust').slice(-2).map((m) => m.text || '');
  const fresh = out.filter(Boolean).filter((x, i, a) => a.indexOf(x) === i && !recent.some((r) => r.includes(x)));
  if (fresh.length < 2) {
    const open = ev.concerns.find((c) => c.revealed && !c.resolved);
    const alt = open ? [null, `${open.ref}만 정리되면 바로 진행할 수 있을 것 같아요.`, `그 전에 ${open.ref}부터 답을 듣고 싶습니다.`, `${open.ref}에 대한 답부터 주시죠.`][lv] : nextQuestion(sim, ev, recent);
    if (alt && !fresh.includes(alt) && !recent.some((r) => r.includes(alt))) fresh.push(alt);
  }
  return fresh.join(' ');
}
function nextQuestion(sim, ev, recent = []) {
  const lv = sim.level; const pf = sim.profile; const s = ev.scores || {};
  const asks = [
    ['CU2', `처음에 말씀드린 "${(pf.interests[0] || '요구사항').slice(0, 24)}" 부분은 어떻게 해결되나요?`],
    ['VS2', lv === 3 ? '그래서 저희가 실제로 얼마를 아끼는지 숫자로 보여 주세요.' : '그래서 저희가 실제로 얼마나 줄일 수 있을까요?'],
    ['VS5', '비슷하게 도입한 곳이 있나요?'],
    ['PR4', '도입하고 나면 관리는 누가 어떻게 하나요?'],
    ['VS6', '일정은 어떻게 되나요? 운영에 지장은 없고요?'],
    ['VS4', lv === 3 ? '경쟁사보다 비싼데 삼성이어야 하는 이유가 뭡니까?' : '다른 업체와 비교해서 삼성이어야 하는 이유는요?'],
    ['PR6', '구성이랑 수량은 대략 어느 정도로 보시나요?'],
    ['CU3', '결국 투자 대비 효과가 어느 정도인지가 제일 중요합니다.'],
  ];
  if (ev.satisfaction >= LV[lv].win - 6) return lv === 1 ? '그럼 다음 단계는 어떻게 하면 될까요?' : '대략 그림은 그려집니다. 그럼 다음 단계로 뭘 제안하시나요?';
  if (!recent.length) recent = sim.msgs.filter((m) => m.who === 'cust').slice(-2).map((m) => m.text || '');
  const unused = asks.filter(([, q]) => !recent.some((r) => r.includes(q)));
  const weak = unused.filter(([id]) => (s[id] ?? 0) < 55).sort((a, b) => (s[a[0]] ?? 0) - (s[b[0]] ?? 0));
  return (weak[0] || unused[(sim.msgs.length / 2) % Math.max(1, unused.length) | 0] || asks[0])[1];
}

/** 첫 인사 (AI가 없을 때) */
export function ruleOpening(sim) {
  const pf = sim.profile; const lv = sim.level;
  const need = (pf.interests[0] || setupText(sim.setup).split(/[.\n]/)[0] || '이번 건').slice(0, 40);
  return [
    null,
    `반갑습니다, ${pf.company} ${pf.role} ${pf.name}입니다. 늘 도움 주셔서 감사해요. 이번에는 "${need}" 쪽을 고민하고 있어서요, 어떤 방향이 좋을지 편하게 말씀해 주세요.`,
    `안녕하세요, ${pf.company} ${pf.role} ${pf.name}입니다. 삼성과는 처음이라 기대 반 걱정 반이네요. 저희는 "${need}" 문제를 풀고 싶은데, 비슷한 곳에서 실제로 어떻게 하는지부터 듣고 싶습니다.`,
    `${pf.company} ${pf.role} ${pf.name}입니다. 시간이 많지 않으니 바로 들어가죠. "${need}" 건으로 이미 두 곳에서 견적을 받았고, 삼성 쪽이 더 비싸다고 들었습니다. 왜 삼성이어야 하는지 숫자로 말씀해 주세요.`,
  ][lv];
}

// ---------------------------------------------------------------- suggestions (규칙)
function pseudoProposal(sim) { return { title: sim.setup.title || '', customer: sim.profile.company, req: { free: sim.setup.req }, ctx: sim.setup.refs, ind: sim.profile.ind }; }
/** 추천에 쓸 후보 제품 · 솔루션 · 사례 (설정 연결 항목 우선 + 업종 · 요구사항 추천) */
export function candidates(sim) {
  const pr = pseudoProposal(sim); const ind = sim.profile.ind || null;
  const base = setupRefs(sim.setup);
  const add = (kind, type) => recommendContext(pr, ind, kind, 6).map((x) => type + ':' + x.id);
  const all = [...base, ...add('products', 'product'), ...add('solutions', 'solution'), ...add('cases', 'case')];
  const uniq = [...new Set(all)];
  return { products: uniq.filter((r) => r.startsWith('product:')).slice(0, 8), solutions: uniq.filter((r) => r.startsWith('solution:')).slice(0, 6), cases: uniq.filter((r) => r.startsWith('case:')).slice(0, 6) };
}
const tokRe = /@(product|solution|case):([A-Za-z0-9_-]+)/g;
/** "@product:qm55c" 토큰이 섞인 문장 → segs */
export function textToSegs(text) {
  const out = []; let i = 0; let m;
  const s = String(text || '');
  tokRe.lastIndex = 0;
  while ((m = tokRe.exec(s))) {
    const [type, id] = [m[1], m[2]];
    const ok = type === 'product' ? P[id] : type === 'solution' ? S[id] : C[id];
    if (m.index > i) out.push({ t: s.slice(i, m.index) });
    if (ok) out.push({ ref: type + ':' + id }); else out.push({ t: m[0].replace(/^@\w+:/, '') });
    i = m.index + m[0].length;
  }
  if (i < s.length) out.push({ t: s.slice(i) });
  for (let j = 1; j < out.length; j++) if (out[j].t != null && out[j - 1].ref) out[j].t = out[j].t.replace(/^ (은|는|이|가|을|를|와|과|으로|로|에서|에|의|도|처럼|까지|부터|만|이면|면|이나|나)(?=[\s,.·)]|$)/, '$1');
  return out.reduce((a, x) => { const l = a[a.length - 1]; if (x.t != null && l && l.t != null) l.t += x.t; else a.push(x); return a; }, []);
}

export function ruleSuggest(sim, ev) {
  const pf = sim.profile; const cand = candidates(sim);
  const s = (ev && ev.scores) || {};
  const used = new Set(sellerRefs(sim));
  const pickRef = (list) => list.find((r) => !used.has(r)) || list[0];
  const reqT = setupText(sim.setup);
  const fits = (r) => { const x = P[r.split(':')[1]]; return x && ((pf.ind && x.ind.includes(pf.ind)) || x.spaces.some((sp) => reqT.includes(sp))); };
  const pr = cand.products.find((r) => !used.has(r) && fits(r)) || pickRef(cand.products);
  const so = pickRef(cand.solutions); const ca = pickRef(cand.cases);
  const P0 = pr && P[pr.split(':')[1]]; const S0 = so && S[so.split(':')[1]]; const C0 = ca && C[ca.split(':')[1]];
  // 솔루션과 함께 쓰는 제품: 이미 말한 제품 → 후보 순
  const usedP = [...used].filter((r) => r.startsWith('product:'));
  const prS = S0 ? [...usedP, ...cand.products].find((r) => S0.with.includes(r.split(':')[1])) || null : null;
  const space = P0 ? (P0.spaces.find((sp) => setupText(sim.setup).includes(sp)) || P0.spaces[0] || '매장') : '매장';
  const role = pf.role || '담당자';
  const sc = sim.setup.sid ? SCENARIOS.find((x) => x.id === sim.setup.sid) : null;
  const T = {
    CU2: () => `말씀하신 "${(pf.interests[0] || '요구사항').slice(0, 26)}"부터 짚겠습니다. 지금 방식에서 어디가 막히는지 정리하고, 그 지점을 바로 해결하는 구성을 보여 드리겠습니다.`,
    CU3: () => `${role}님 입장에서는 결국 운영비와 리스크가 핵심이실 것 같습니다. 초기 투자 대비 절감액과 회수 기간을 [00]개월 기준으로 정리해 드리겠습니다.`,
    CU4: () => `현재 ${pf.company}에서 ${(pf.interests[0] || '이 업무').slice(0, 18)}에 매달 시간과 비용이 얼마나 드는지 여쭤봐도 될까요? 그 수치를 기준으로 효과를 계산해 드리겠습니다.`,
    PR3: () => P0 ? `${space} 공간에는 @${pr}${josa(P0.model, '을/를').slice(P0.model.length)} 제안드립니다. ${P0.spec.split(' · ').slice(0, 3).join(' · ')} 사양이라 ${pf.ind && IND[pf.ind] ? IND[pf.ind].name.split(' · ')[0] : '현장'} 환경에 맞습니다.` : '',
    PR4: () => prS && S0 ? `@${prS}${josa(P[prS.split(':')[1]].model, '은/는').slice(P[prS.split(':')[1]].model.length)} @${so}${josa(S0.name, '으로/로').slice(S0.name.length)} 원격 관리합니다. ${S0.desc.split('.')[0]}.` : S0 ? `운영은 @${so}${josa(S0.name, '으로/로').slice(S0.name.length)} 묶겠습니다. ${S0.desc.split('.')[0]}.` : '',
    PR6: () => `공간 유형별로 표준 구성을 잡고, 1차 [00]곳 파일럿 → 확산 순으로 수량을 나누는 안을 드리겠습니다. 매장당 [수량]대 기준입니다.`,
    VS1: () => sc ? `이번 제안의 가치는 세 가지입니다. ① ${sc.diff[0] || sc.messages[0]} ② ${sc.messages[1] || sc.diff[1] || ''} ③ ${sc.messages[2] || sc.diff[2] || ''}`.replace(/\s+③\s*$/, '') : `이번 제안의 가치는 세 가지로 정리됩니다. ① 운영을 한 곳에서 ② 반영 속도를 당일로 ③ 에너지 · 인력 비용 절감입니다.`,
    VS2: () => `효과는 숫자로 확인하시도록 도입 전후 KPI를 정하겠습니다. ${(pf.kpis.length ? pf.kpis.slice(0, 2) : ['처리 시간', '운영 비용']).join(', ')}을 파일럿 기간에 실측해 보고드리겠습니다.`,
    VS4: () => `삼성은 하드웨어${S0 ? '와 @' + so + ' 운영까지' : ''} 한 회사에서 책임지고, 전국 서비스망으로 장애 대응까지 직접 합니다. 공급사가 나뉘었을 때 생기는 책임 공백이 없습니다.`,
    VS6: () => `일정은 현장 실사 2주 → 파일럿 [00]주 → 확산 순으로 제안드립니다. 파일럿은 운영 시간 외 설치라 영업에는 지장이 없습니다.`,
    VS5: () => C0 ? `@${ca}도 비슷한 과제를 풀었습니다.${C0.proof && C0.proof[0] ? ' ' + C0.proof[0] + '.' : ''} 같은 방식으로 ${pf.company}에 맞춰 드리겠습니다.` : '',
    MK3: () => C0 ? `말씀드린 수치는 @${ca} 실측 기준입니다. ${pf.company} 기준으로는 파일럿에서 다시 확인해 보고드리겠습니다.` : `말씀드린 수치는 [기관 · 연도] 기준입니다. ${pf.company} 기준으로는 파일럿에서 실측하겠습니다.`,
    WR5: () => `"최고" 같은 말 대신 확인하실 수 있는 근거로 말씀드리겠습니다. ${P0 ? '@' + pr + ' 공식 사양과 ' : ''}${C0 ? '@' + ca + ' 도입 결과를' : '도입 사례를'} 같이 보시죠.`,
  };
  const WHY = { CU2: '요구사항에 하나씩 답하기', CU3: '결정권자 언어로 말하기', CU4: '현재 과제 확인하기', PR3: '공간에 맞는 제품 제안', PR4: '운영 솔루션까지 연결', PR6: '구성 · 수량 그리기', VS1: '가치 세 가지로 정리', VS2: '효과를 숫자로', VS4: '삼성이어야 하는 이유', VS6: '일정 · 파일럿 제안', VS5: '비슷한 사례로 증명', MK3: '수치 근거 밝히기', WR5: '과장 대신 근거로' };
  const out = [];
  // 1) open concern first
  const concerns = (ev && ev.concerns) || pf.concerns;
  const open = concerns.find((c) => c.revealed && !c.resolved);
  if (open) {
    const ans = open.answer || {
      compete: `단가만 보면 차이가 있지만, ${S0 ? '@' + so + ' 운영 · ' : ''}유지보수까지 넣은 5년 총소유비용(TCO)으로 비교해 드리겠습니다. 비교표를 같은 기준으로 만들어 오겠습니다.`,
      budget: '초기 부담은 구독 · 렌탈과 단계 도입으로 나누고, 파일럿 결과를 보고 확산 물량을 정하시면 됩니다.',
      proof: C0 ? `@${ca}에서 이미 검증된 방식입니다.${C0.proof && C0.proof[0] ? ' ' + C0.proof[0] + '.' : ''} 먼저 작은 범위 파일럿으로 직접 확인하시죠.` : '먼저 작은 범위 파일럿으로 직접 확인하시고, 결과를 보고 결정하시면 됩니다.',
      switch: '전환은 운영 시간 외에 구역별로 나눠 진행하고, 기존 장비는 새 장비가 안정화될 때까지 병행 운영합니다.',
      ops: S0 ? `@${so}${josa(S0.name, '으로/로').slice(S0.name.length)} 본사에서 원격 관리하니 현장 인력이 따로 필요 없습니다. 초기 교육과 운영 이관까지 저희가 맡겠습니다.` : '원격 관리로 현장 인력 부담을 없애고, 초기 교육과 운영 이관까지 저희가 맡겠습니다.',
      security: '기기에 콘텐츠가 저장돼 네트워크가 끊겨도 재생되고, 보안은 Knox 기반으로 관리합니다.',
    }[open.key] || '그 부분은 단계 도입과 사전 점검으로 위험을 나눠서 해결하겠습니다.';
    const topic = String(open.key).startsWith('obj') && open.kwq && open.kwq.length ? open.kwq.slice(0, 3).join(' ') : open.short;
    out.push({ segs: textToSegs(ans), title: topic + ' 우려 해소', crit: [], kind: 'concern', about: open.id });
  }
  // 2) close when ready
  const L = LV[sim.level];
  if ((ev ? ev.satisfaction : sim.cur.satisfaction) >= L.win - 5 && !open) {
    out.push({ segs: textToSegs(`오늘 말씀드린 내용으로 ${josa(pf.ask, '을/를')} 제안드립니다. ${pf.next[0] ? pf.next[0] + '부터 ' : '다음 주에 실사부터 '}바로 시작해도 될까요?`), title: '다음 단계 결정 요청', crit: ['VS6'], kind: 'close' });
  }
  // 3) weakest criteria
  const order = SIM_CRIT.filter((id) => T[id]).sort((a, b) => (s[a] ?? 0) - (s[b] ?? 0));
  for (const id of order) {
    if (out.length >= 3) break;
    const text = T[id](); if (!text) continue;
    out.push({ segs: textToSegs(text), title: WHY[id], crit: [id], kind: 'crit' });
  }
  return out.slice(0, 3);
}

// ---------------------------------------------------------------- 참고할 기존 제안서 (Best Scenario)
const REQ_HINT = [
  ['renew', ['교체', '리뉴얼', '노후', '바꾸', '업그레이드']], ['compete', ['입찰', '경쟁', '조달', 'RFP', '평가', '공급사', '전환']],
  ['ops', ['운영', '효율', '에너지', '원격', '절감', '자동화']], ['scale', ['파일럿', '확산', '전 지점', '공동 개발']],
  ['new', ['신규', '구축', '신축', '오픈', '처음']], ['brief', ['경영진', '첫 미팅', '투자 심의', '대표']],
];
export function similarScenarios(sim, limit = 3) {
  const pf = sim.profile;
  const convo = [setupText(sim.setup), pf.interests.join(' '), ...sim.msgs.map(msgPlain)].join('\n');
  const ct = new Set(toks(convo));
  const refs = new Set([...setupRefs(sim.setup), ...sellerRefs(sim)]);
  const reqTypes = REQ_HINT.filter(([, ws]) => ws.some((w) => convo.includes(w))).map(([k]) => k);
  if (sim.level === 3 && !reqTypes.includes('compete')) reqTypes.push('compete');
  const open = (sim.profile.concerns || []).filter((c) => c.revealed && !c.resolved);
  const stage = sim.cur.stage || 'open';
  return SCENARIOS.map((s) => {
    let sc = 0; const why = [];
    if (sim.setup.sid === s.id) { sc += 4; why.push('이 요구사항의 원본'); }
    if (pf.ind && s.ind === pf.ind) { sc += 3; why.push('같은 업종'); } else if (!s.ind) sc += 0.6;
    if (reqTypes.includes(s.req)) { sc += 1.6; why.push(REQ_TYPES[s.req].label.split(' · ')[0]); }
    const hitP = s.products.filter((id) => refs.has('product:' + id)); const hitS = s.solutions.filter((id) => refs.has('solution:' + id)); const hitC = s.cases.filter((id) => refs.has('case:' + id));
    sc += hitP.length * 0.9 + hitS.length * 1.1 + hitC.length * 1.4;
    for (const id of hitS.slice(0, 1)) why.push(S[id].name);
    for (const id of hitP.slice(0, 1)) why.push(P[id].model);
    const st = toks([s.title, s.situation, s.signals.join(' '), s.criteria.join(' '), s.kpis.join(' '), s.objections.map((o) => o[0]).join(' ')].join(' '));
    let hit = 0; for (const w of new Set(st)) if (ct.has(w)) hit++;
    sc += Math.min(3, hit * 0.06);
    // 지금 흐름에서 참고할 포인트
    let tip = null;
    for (const c of open) {
      const ck = new Set(toks(c.text + ' ' + c.kw.join(' ')));
      const ob = s.objections.map(([q, a]) => ({ q, a, n: toks(q).filter((w) => ck.has(w)).length })).sort((a, b) => b.n - a.n)[0];
      if (ob && ob.n >= 2) { tip = { kind: 'objection', label: '고객 우려 대응', q: ob.q, a: ob.a }; sc += 1.2; why.push('같은 우려 대응'); break; }
    }
    if (!tip) {
      const keys = SIM_STAGES[STAGE_IX[stage] ?? 0].keys;
      const g = s.flow.find((x) => keys.includes(x.key)) || s.flow[0];
      tip = stage === 'close' ? { kind: 'ask', label: '결말 · 결정 요청', q: s.ask, a: (s.next || []).slice(0, 2).join(' · ') }
        : { kind: 'stage', label: g.name, q: g.goal, a: stage === 'value' || stage === 'open' ? s.thesis : (g.slides[0] && g.slides[0].role) || '' };
    }
    return { s, score: sc, why: [...new Set(why)].slice(0, 3), tip, strat: STRATEGIES[s.strategy] };
  }).sort((a, b) => b.score - a.score).slice(0, limit);
}
export { STAGES };
