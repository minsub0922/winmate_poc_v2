// 영업 담당자 역할 에이전트 — 앱에서 사람이 입력하는 자리를 대신한다.
//   scenario : Best Scenario 스토리라인(흐름 · 핵심 메시지 · 이의 대응 · 결정 요청)을 따라 말하는 숙련 담당자 (본 실험)
//   weak     : 일반론 · 과장 · 우려 회피 · 이른 계약 요청을 하는 미숙한 담당자 (대조군 — 평가가 나쁜 제안을 가려내는지)
//   suggest  : 앱이 매 턴 내놓는 '추천 답변' 첫 번째를 그대로 보내는 담당자 (대조군 — 추천 답변 기능만으로 설득되는지)
// 담당자가 보는 정보는 앱 화면에 보이는 것과 같다: 요구사항 · 중요하게 보는 것 · 성공 조건 · 드러난 우려 · 만족도 · 제안 품질.
import * as E from '../engine/index.mjs';

export const MODES = {
  scenario: 'Best Scenario 스토리라인을 따르는 담당자',
  expert: 'Best Scenario 스토리라인 + 그 자리에서 구체적으로 답하는 숙련 담당자',
  weak: '미숙한 담당자(대조군)',
  suggest: '앱 추천 답변을 그대로 쓰는 담당자(대조군)',
};

function refFact(r) {
  const [t, id] = String(r).split(':');
  if (t === 'product' && E.P[id]) { const x = E.P[id]; return `@product:${id} — ${x.name} (${x.model}, ${x.cat}) · ${x.spec} · 공간: ${x.spaces.slice(0, 4).join(', ')}`; }
  if (t === 'solution' && E.S[id]) { const x = E.S[id]; return `@solution:${id} — ${x.name} (${x.cat}) · ${x.desc}`; }
  if (t === 'case' && E.C[id]) { const x = E.C[id]; return `@case:${id} — ${x.cust} · ${x.sub || x.title} (${(x.date || '').slice(0, 7)})${x.proof && x.proof.length ? ' · 성과: ' + x.proof.slice(0, 2).join('; ') : ''}`; }
  return null;
}
export function materials(sim) {
  const c = E.candidates(sim);
  return [...c.products, ...c.solutions, ...c.cases].map(refFact).filter(Boolean);
}

function storyline(s) {
  if (!s) return '(연결된 Best Scenario 없음 — 일반적인 제안 흐름: 열기 → 니즈 확인 → 가치 → 근거 → 실행 → 결정 요청)';
  const st = E.STRATEGIES[s.strategy];
  return [
    `Best Scenario ${s.id} — ${s.title}`,
    `전략: ${st ? st.label + ' — ' + st.desc : s.strategy}`,
    `핵심 주장: ${s.thesis}`,
    `논리 흐름: ${(s.logic || []).join(' → ')}`,
    `차별점: ${(s.diff || []).join(' / ')}`,
    `핵심 메시지: ${(s.messages || []).join(' / ')}`,
    '단계(순서대로):',
    ...s.flow.map((g, i) => `  ${i + 1}. [${g.key}] ${g.name} — ${g.goal} · 주요 장표: ${g.slides.slice(0, 4).map((x) => x.role).join(' · ')}`),
    `예상 이의와 대응: ${(s.objections || []).map(([q, a]) => `“${q}” → ${a}`).join(' / ')}`,
    `KPI 후보: ${(s.kpis || []).join(', ')}`,
    `다음 단계 후보: ${(s.next || []).join(', ')}`,
  ].join('\n');
}

function visibleState(sim) {
  const L = E.LV[sim.level]; const pf = sim.profile;
  const agg = E.aggregate(sim.cur.scores);
  const open = pf.concerns.filter((c) => c.revealed && !c.resolved).map((c) => c.text);
  const done = pf.concerns.filter((c) => c.resolved).map((c) => c.text);
  const hidden = pf.concerns.filter((c) => !c.revealed).length;
  return [
    `지금 고객 만족도 ${sim.cur.satisfaction} (성공 기준 ${L.win} 이상, ${L.lose} 이하면 미팅 종료) · 제안 품질 ${agg.total ?? '-'} · 대화 단계 ${(E.SIM_STAGES.find((x) => x.k === sim.cur.stage) || {}).label || sim.cur.stage}`,
    `드러났지만 아직 안 풀린 우려: ${open.length ? open.map((x) => '“' + x + '”').join(' / ') : '없음'}`,
    `풀린 우려: ${done.length ? done.map((x) => '“' + x + '”').join(' / ') : '없음'} · 아직 드러나지 않은 우려 ${hidden}개`,
  ].join('\n');
}

function transcript(sim, max = 30) {
  return sim.msgs.slice(-max).map((m) => (m.who === 'me' ? '나(영업): ' + E.msgPlain(m).replace(/\s+/g, ' ').trim() : '고객: ' + m.text)).join('\n');
}

function systemScenario(sim, s, expert = false) {
  const pf = sim.profile; const L = E.LV[sim.level];
  return `당신은 삼성전자 B2B 영업 담당자입니다. 지금 고객과 1:1 제안 미팅을 채팅으로 하고 있습니다. 아래 스토리라인을 따라 대화를 이끌어 고객이 다음 단계에 동의하게 만드는 것이 목표입니다.

[고객] ${pf.company} · ${pf.role} ${pf.name} · 난이도 ${L.name}(${L.tag})
[고객 요구사항]
${E.setupText(sim.setup)}
[고객이 중요하게 보는 것] ${pf.interests.join(' / ')}
[성공 조건] 만족도 ${L.win} 이상 + 드러난 우려 해소 + 결정 요청 → 고객이 "${pf.ask}"에 동의

[이번 제안의 스토리라인]
${storyline(s)}

[쓸 수 있는 자료 — 제품 · 솔루션 · 사례는 반드시 이 토큰 그대로(@product:id 등) 문장에 넣으세요]
${materials(sim).join('\n')}

말하는 규칙:
- 한 번에 한 가지 목적(스토리라인 한 단계 또는 고객 질문 · 우려 대응)만. 2~5문장, ${expert ? 380 : 300}자 이내, 존댓말 대화체. 장표 설명투 · 목록 · 이모지 금지.
- 고객이 질문하거나 우려를 말하면 그것부터 구체적으로 답하고(근거 · 사례 · 단계 · 숫자), 그다음 스토리라인으로 돌아갑니다.
- 고객 요구사항에 있는 숫자는 그대로 써도 됩니다. 자료에 없는 성능 수치 · 가격은 지어내지 말고, 필요하면 "파일럿에서 실측" 또는 [00] 자리표시로.
- 최고 · 최초 · 100% · 무조건 같은 단정은 쓰지 않습니다.
- 초반에는 고객의 현재 상황을 한두 번 확인하는 질문도 하세요.
- 만족도가 성공 기준 근처이고 풀리지 않은 우려가 없으면 "${pf.ask}"를 구체적으로(범위 · 일정 · 누가) 요청하세요. 남은 턴이 2턴 이하이면 그 전이라도 다음 단계를 요청합니다.
${expert ? `숙련 담당자의 원칙(반드시):
- "준비하겠습니다 · 다음에 가져오겠습니다" 같은 약속으로 넘기지 말고, 지금 이 자리에서 핵심 내용을 말로 제시합니다: 공간별 구성 · 수량, 단계 · 일정(주 단위), 비용 구조(초기 · 운영 · 절감), 운영 방식(누가 · 무엇을).
- 효과 수치는 고객이 준 숫자로 계산해 보여 주고 계산 근거를 함께 말합니다(예: 월 610만 원 인쇄비 × 36개월). 사례는 자료의 성과 문장만 인용합니다.
- 고객 우려에는 ① 원인 인정 ② 구체적 해결(방법 · 일정 · 책임) ③ 확인 방법(파일럿 기준 · KPI) 순서로 답합니다.
- [00] 같은 빈칸을 쓰지 않습니다. 모르는 값은 "실사 때 확인"이라고 말합니다.
` : ''}출력: JSON 하나만 {"stage":"지금 스토리라인 단계 key(${s ? [...new Set(s.flow.map((g) => g.key))].join('|') : 'open|context|value|proof|plan|close'})","move":"이번 말의 목적 20자 이내","say":"고객에게 할 말"}`;
}

function systemWeak(sim) {
  const pf = sim.profile;
  return `당신은 경험이 부족한 삼성전자 B2B 영업 담당자를 연기합니다(평가 기능 시험용 대조군). 고객과 1:1 제안 미팅을 채팅으로 합니다.
[고객] ${pf.company} · ${pf.role} ${pf.name}
[고객 요구사항]
${E.setupText(sim.setup)}
[아는 제품 — 토큰으로 언급] ${materials(sim).filter((x) => x.startsWith('@product')).slice(0, 4).join('\n')}

이 담당자의 습관(자연스럽게, 매 턴 2~3개씩 섞어서):
- 고객 상황을 묻지 않고 제품 자랑 · 브랜드 이야기부터 한다.
- "업계 최고", "100% 만족", "무조건 절감" 같은 단정을 쓴다. 출처 없는 수치를 말한다.
- 고객이 우려 · 질문을 말하면 "걱정 안 하셔도 됩니다" 식으로 넘기고 구체적으로 답하지 않는다.
- 사례 · 일정 · 운영 방식 · 비용 구조를 구체적으로 말하지 않는다.
- 2~3번째 턴부터 계약 · 발주를 서두른다.
2~4문장, 250자 이내 존댓말. 출력: JSON 하나만 {"stage":"open|value|close","move":"20자 이내","say":"고객에게 할 말"}`;
}

/**
 * 다음 영업 발화를 만든다.
 * @returns {Promise<{text:string, stage:string, move:string, ms:number, source:string}>}
 */
export async function sellerTurn(llm, sim, { mode = 'scenario', maxTurns = 14 } = {}) {
  const myTurns = sim.msgs.filter((m) => m.who === 'me').length;
  const left = maxTurns - myTurns;
  if (mode === 'suggest') {
    const sg = (sim.cur.suggest || [])[0];
    if (sg && sg.segs && sg.segs.length) {
      return { segs: sg.segs, text: E.msgPlain({ who: 'me', segs: sg.segs }), stage: sg.kind || 'suggest', move: sg.title || '추천 답변', ms: 0, source: 'app-suggest' };
    }
  }
  const s = sim.setup.sid ? E.SC[sim.setup.sid] : null;
  const system = mode === 'weak' ? systemWeak(sim) : systemScenario(sim, s, mode === 'expert');
  const user = `[지금까지의 대화]\n${transcript(sim)}\n\n[화면에 보이는 고객 상태]\n${visibleState(sim)}\n\n이번이 나의 ${myTurns + 1}번째 발화이고, 남은 발화는 이번 포함 ${left}번입니다. 다음에 할 말을 JSON 으로.`;
  const r = await llm.json({ system, messages: [{ role: 'user', content: user }], tag: 'seller' });
  const d = r.data || {};
  let say = String(d.say || '').trim().replace(/^["“]|["”]$/g, '');
  if (!say) throw new Error('영업 발화가 비었습니다');
  const segs = E.textToSegs(say);
  return { segs, text: E.msgPlain({ who: 'me', segs }), stage: String(d.stage || ''), move: String(d.move || '').slice(0, 40), ms: r.ms, source: 'llm' };
}
