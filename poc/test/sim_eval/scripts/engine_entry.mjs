// 앱의 제안 시뮬레이션 엔진(src/sim)을 그대로 Node 에서 돌리기 위한 진입점.
// scripts/build_engine.mjs 가 이 파일을 esbuild 로 묶어 engine/winmate_sim.mjs 를 만든다.
// 바꾸는 것은 두 가지뿐: ① src/ai.js 의 getSample() → 이 PoC 의 LLM(Gemini) 어댑터, ② 시뮬레이션과 무관한 레이아웃 HTML(수 MB)을 빈 값으로.
export { customerTurn, debrief, ruleDebrief, visibleReply, DELIM } from '../../../../src/sim/engine.js';
export { LV, LEVELS, SIM_STAGES, STAGE_IX, setupText, refName, josa, personaLine } from '../../../../src/sim/profile.js';
export { SIM_CRIT, SIM_CATS, CHAT_DESC, critName, aggregate, ruleScores, ruleTurn, ruleSuggest, candidates, textToSegs, msgPlain, similarScenarios, moodOf } from '../../../../src/sim/score.js';
export { P, S, C, IND } from '../../../../src/data.js';
export { SC, SCENARIOS, REQ_TYPES, STRATEGIES, STAGES, ENDINGS } from '../../../../src/scenarios.js';
export { FILL_CUSTOMER } from '../../../../src/scenario_fills.js';
export { seg, segPlain, segRefs } from '../../../../src/store.js';
export { CR, CAT } from '../../../../src/review/criteria.js';
export { setSample } from './sample_shim.mjs';
