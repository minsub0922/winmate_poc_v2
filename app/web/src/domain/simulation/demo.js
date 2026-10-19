// 예시 시뮬레이션 1건 — F&B 프랜차이즈(Best Scenario bs01) · 첫 고객.
// 점수는 실제 규칙 평가(ruleScores)로 매기고, 고객 대사 · 만족도 흐름만 손으로 썼다.
import { setupFromScenario } from './profile.js';
import { newSim } from '../../repositories/simulations.js';
import { ruleScores, textToSegs } from './score.js';
import { ruleDebrief } from './engine.js';

export function demoSims() {
  const st = setupFromScenario('bs01');
  if (!st) return [];
  const sim = newSim(st, 2);
  sim.id = 'sim_demo_bs01'; sim.demo = true;
  const pf = sim.profile;
  const t0 = Date.now() - 3 * 3600 * 1000;
  sim.createdAt = t0;
  const cProof = pf.concerns.find((x) => x.key === 'proof') || pf.concerns[1];
  const cCost = pf.concerns.find((x) => x.key !== 'proof') || pf.concerns[0];
  const script = [
    { cust: `안녕하세요, ${pf.company} ${pf.role} ${pf.name}입니다. 삼성과는 처음이라 기대 반 걱정 반이네요. 전국 매장 메뉴판 반영이 늘 1~2주씩 늦는데, 본사에서 한 번에 바꾸는 방법이 있는지, 비슷한 곳은 실제로 어떻게 하는지부터 듣고 싶습니다.`, sat: 45, stage: 'open' },
    { me: '본부장님, 지금 신메뉴나 가격을 바꾸실 때 매장 반영까지 보통 며칠 걸리는지, 어느 단계에서 가장 막히는지 여쭤봐도 될까요? 그 기준으로 효과를 계산해 드리겠습니다.',
      cust: `인쇄 · 배송 · 부착까지 평균 9일 정도요. 특히 가맹점은 부착이 제각각이라 가격 표기 오류도 생깁니다. 솔직히 말씀드리면, ${cProof.say}.`, sat: 49, why: '현황부터 물어봐서', stage: 'needs', reveal: [cProof.id] },
    { me: '그 9일을 당일로 줄이는 게 핵심입니다. 매장 카운터 메뉴보드에는 @product:qm55c 를 두고, @solution:magicinfo 로 본사에서 가격 · 메뉴를 한 번에 배포합니다. 시간대별 메뉴도 자동으로 바뀝니다.',
      cust: '본사에서 바로 바뀐다는 건 좋네요. 그런데 화면만 바꾼다고 매장이 따라올지는 아직 모르겠습니다. 다른 프랜차이즈에서도 이렇게 쓰고 있나요?', sat: 55, why: '운영 방식으로 설명해서', stage: 'value' },
    { me: '네, @case:3727 에서 본사가 가맹점 콘텐츠를 일괄로 제어하고, 매장 방문 없이 원격으로 업데이트하고 있습니다. 저희도 10개 매장 8주 파일럿으로 반영 리드타임과 가격 오류 건수를 직접 실측해 보고드리겠습니다.',
      cust: `비슷한 업종 사례가 있다니 한결 낫네요. 파일럿으로 직접 확인하는 건 좋습니다. 다만 한 가지, ${cCost.say}.`, sat: 64, why: '같은 업종 사례 + 실측 약속', stage: 'objection', resolve: [cProof.id], reveal: [cCost.id] },
    { me: '초기 부담은 매장 유형별 표준 패키지와 구독 · 렌탈 옵션으로 나누고, 파일럿 결과를 보고 확산 물량을 정하시면 됩니다. 장비 · @solution:magicinfo 운영 · 유지보수를 삼성이 한 번에 책임지고, 전국 서비스망으로 장애 대응까지 합니다.',
      cust: '구독으로 나눌 수 있으면 가맹점 설득이 훨씬 쉽겠네요. 한 회사에서 다 책임진다는 것도 마음에 듭니다. 그럼 다음 단계로 뭘 제안하시나요?', sat: 76, why: '초기 비용 우려를 풀어 줘서', stage: 'close', resolve: [cCost.id] },
    { me: '오늘 말씀드린 내용으로 시범 매장 10곳 · 8주 파일럿 착수를 제안드립니다. 다음 주에 파일럿 매장 10곳 선정과 매장 실사부터 바로 시작해도 될까요?',
      cust: '좋습니다. 그 방향으로 가시죠. 시범 매장 10곳 · 8주 파일럿으로 진행하는 걸로 정리하고, 매장 유형별 수량안은 담당자에게 보내 주세요.', sat: 82, why: '결정을 분명하게 요청해서', stage: 'close', end: 'win' },
  ];
  let ts = t0; let prev = 45;
  for (const [i, x] of script.entries()) {
    if (x.me) { ts += 50 * 1000; sim.msgs.push({ id: 'dm' + i, who: 'me', segs: textToSegs(x.me), ts }); }
    for (const id of x.reveal || []) { const k = pf.concerns.find((q) => q.id === id); if (k) { k.revealed = true; k.at = i; } }
    for (const id of x.resolve || []) { const k = pf.concerns.find((q) => q.id === id); if (k) k.resolved = true; }
    const { scores, notes } = ruleScores(sim);
    ts += 30 * 1000;
    const mood = x.sat >= 80 ? '만족' : x.sat >= 60 ? '호의' : x.sat >= 40 ? '중립' : '의심';
    sim.msgs.push({ id: 'dc' + i, who: 'cust', text: x.cust, ts, ev: { satisfaction: x.sat, delta: i ? x.sat - prev : 0, why: x.why || '', mood, stage: x.stage, revealed: x.reveal || [], resolved: x.resolve || [], ai: false } });
    sim.trend.push({ v: x.sat });
    sim.cur = { ...sim.cur, satisfaction: x.sat, trust: Math.min(90, 36 + i * 9), interest: Math.min(92, 50 + i * 8), mood, why: x.why || '', stage: x.stage, scores, notes, suggest: [], src: 'rule', evalAt: i };
    prev = x.sat;
  }
  sim.trend = sim.trend.slice(1);
  sim.status = 'won';
  sim.updatedAt = ts;
  sim.debrief = ruleDebrief(sim);
  return [sim];
}
