// 엔진 선택 — 기본은 현재 앱(winmate_sim.mjs). SIM_ENGINE=baseline 이면 고치기 전 엔진(winmate_sim.baseline.mjs)으로 같은 실험을 다시 돌린다.
const which = process.env.SIM_ENGINE === 'baseline' ? './winmate_sim.baseline.mjs' : './winmate_sim.mjs';
const M = await import(which);
export const ENGINE = process.env.SIM_ENGINE === 'baseline' ? 'baseline' : 'current';
export const {
  customerTurn, debrief, ruleDebrief, visibleReply, DELIM,
  LV, LEVELS, SIM_STAGES, STAGE_IX, setupText, refName, josa, personaLine,
  SIM_CRIT, SIM_CATS, CHAT_DESC, critName, aggregate, ruleScores, ruleTurn, ruleSuggest, candidates, textToSegs, msgPlain, similarScenarios, moodOf,
  P, S, C, IND, SC, SCENARIOS, REQ_TYPES, STRATEGIES, STAGES, ENDINGS, FILL_CUSTOMER, seg, segPlain, segRefs, CR, CAT, setSample,
} = M;
