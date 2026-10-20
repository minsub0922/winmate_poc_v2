// 설정 — poc/.env (가까운 .env 우선) 와 환경 변수. API 키 값은 밖으로 내보내지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); // poc/test/sim_eval
export const APP_ROOT = path.resolve(ROOT, '../../..');                              // winmatev2
export const RUNS = process.env.SIM_RUNS ? path.resolve(process.env.SIM_RUNS) : path.join(ROOT, 'runs'); // SIM_RUNS 로 다른 기록 폴더를 볼 수 있다

function loadEnv() {
  for (const p of [path.join(ROOT, '.env'), path.join(ROOT, '..', '.env'), path.join(ROOT, '..', '..', '.env')]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      const v = m[2].replace(/^['"]|['"]$/g, '');
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}
loadEnv();

export const CFG = {
  apiKey: process.env.GEMINI_API_KEY || '',
  // 고객 · 심사(평가) — 앱 엔진이 한 번의 호출로 둘 다 한다. 앱의 'quick' 등급에 해당하는 빠른 모델.
  customerModel: process.env.SIM_CUSTOMER_MODEL || process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  // 영업 담당자 역할 에이전트 (Best Scenario 스토리라인을 따라 말한다)
  sellerModel: process.env.SIM_SELLER_MODEL || 'gemini-3.5-flash',
  // 세션이 끝난 뒤 대화 전체를 읽고 엔진의 평가를 검증하는 독립 심사
  judgeModel: process.env.SIM_JUDGE_MODEL || 'gemini-3.1-pro-preview',
};
export const hasKey = () => !!CFG.apiKey;
