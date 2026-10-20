// src/ai.js 대신 묶이는 모듈 — 엔진이 부르는 getSample() 이 PoC 가 꽂아 준 LLM 함수를 돌려준다.
// 앱에서는 window.claude.use('sample') (Claude, modelTier 'quick') 이 같은 자리에 들어간다.
let current = null;
/** fn(messages, opts) → Promise<{ text }> · fn.json(prompt, opts) → Promise<object>. null 이면 규칙(오프라인)으로 돈다. */
export function setSample(fn) { current = fn; }
export function getSample() { return Promise.resolve(current); }
export function aiDisabled() { return !current; }
