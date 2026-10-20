// 제안 시뮬레이션 실성능 검증 — 실제 LLM 으로 멀티턴 미팅을 돌리고 턴마다 평가 점수 변화를 기록한다.
//
//   node run.mjs                                   # sets/diverse10.json × Best Scenario 담당자 + 대조군(미숙 3 · 추천답변 3)
//   node run.mjs --only ps01,ps12 --controls none  # 일부만
//   node run.mjs --resume <run-id>                 # 끊긴 실행을 이어서 (턴 단위로 저장돼 있음)
//   node run.mjs --offline                         # LLM 없이 규칙 엔진 + 앱 추천 답변으로 (배선 점검용)
//
// 옵션: --set 파일 · --tag 이름 · --turns 14 · --concurrency 4 · --modes scenario,expert · --controls weak:3,suggest:3|none · --no-judge
//       --engine baseline (고치기 전 엔진으로 같은 실험)
//       --persona-level (페르소나 고유 난이도 값을 엔진에 전달) · --deadline 초(이 시간이 지나면 멈추고 저장 → --resume)
// 결과: runs/<tag>-<시각>/  run.json(진행 상황) · sessions/<id>.jsonl(턴별 이벤트, 실시간) · summary.json · report.md · report.html
// 테스트 벤치의 '제안 시뮬레이션' 탭이 같은 폴더를 1초마다 읽어 실시간으로 보여 준다.
import fs from 'node:fs';
import path from 'node:path';
import { CFG, ROOT, RUNS, hasKey } from './lib/env.mjs';
import { LLM } from './lib/llm.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); if (i < 0) return d; const v = argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const RESUME = arg('resume', '');
// 엔진 선택은 라이브러리를 불러오기 전에 정한다 (--resume 이면 그 실행이 쓴 엔진으로)
if (RESUME) { try { const r0 = JSON.parse(fs.readFileSync(path.join(path.isAbsolute(String(RESUME)) ? String(RESUME) : path.join(RUNS, String(RESUME)), 'run.json'), 'utf8')); if (r0.engine && r0.engine.which) process.env.SIM_ENGINE = r0.engine.which; } catch (e) { /* 아래에서 다시 읽음 */ } }
else if (arg('engine', '')) process.env.SIM_ENGINE = String(arg('engine'));
const { runSession, installEngineLLM } = await import('./lib/session.mjs');
const { buildReport } = await import('./lib/report.mjs');
const { ENGINE } = await import('./engine/index.mjs');
const STOP = { at: arg('deadline', 0) ? Date.now() + Number(arg('deadline')) * 1000 : Infinity };
// Ctrl+C · 테스트 벤치의 '멈춤' — 진행 중인 턴을 마치고 저장한 뒤 끝낸다 (--resume 으로 이어서)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (STOP.at === 0) process.exit(130); STOP.at = 0; console.log('‖ 멈춤 신호 — 지금 턴을 마치고 저장합니다'); });
const CONC = Number(arg('concurrency', 4));

let run; let dir;
if (RESUME) {
  dir = path.isAbsolute(String(RESUME)) ? String(RESUME) : path.join(RUNS, String(RESUME));
  run = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
} else {
  const SET = path.resolve(ROOT, arg('set', 'sets/diverse10.json'));
  const TAG = String(arg('tag', 'run'));
  const OFFLINE = !!arg('offline', false);
  const ONLY = arg('only', '') ? String(arg('only')).split(',') : null;
  const CONTROLS = String(arg('controls', 'weak:3,suggest:3'));
  const set = JSON.parse(fs.readFileSync(SET, 'utf8'));
  const items = set.items.filter((x) => !ONLY || ONLY.includes(x.pid));
  const MODES_MAIN = OFFLINE ? ['suggest'] : String(arg('modes', 'scenario')).split(','); // 오프라인이면 영업도 앱 추천 답변으로
  const jobs = MODES_MAIN.flatMap((mode) => items.map((it) => ({ item: it, mode })));
  // 대조군: 난이도별로 고루 (1 · 2 · 3 순서로 한 명씩)
  if (CONTROLS !== 'none' && !OFFLINE) {
    for (const part of CONTROLS.split(',')) {
      const [mode, k] = part.split(':'); const want = Number(k || 3);
      const byLv = [1, 2, 3].map((lv) => items.filter((x) => x.level === lv));
      const pick = [];
      for (let i = 0; pick.length < want && i < 10; i++) for (const g of byLv) if (g[i] && pick.length < want) pick.push(g[i]);
      for (const it of pick) jobs.push({ item: it, mode });
    }
  }
  const stamp = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2');
  const runId = `${TAG}-${stamp}`;
  dir = path.join(RUNS, runId);
  fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
  let engineBuild = {}; try { const b = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine', 'BUILD.json'), 'utf8')); engineBuild = b[ENGINE === 'baseline' ? 'winmate_sim.baseline.mjs' : 'winmate_sim.mjs'] || {}; } catch (e) { /* noop */ }
  engineBuild = { which: ENGINE, ...engineBuild };
  const judge = !arg('no-judge', false) && !OFFLINE;
  run = {
    id: runId, tag: TAG, created: new Date().toISOString(), status: 'running', set: path.relative(ROOT, SET), turns: Number(arg('turns', 14)), offline: OFFLINE, judge,
    models: { customer: OFFLINE ? 'rules' : CFG.customerModel, seller: OFFLINE ? 'offline' : CFG.sellerModel, judge: judge ? CFG.judgeModel : null },
    personaLevel: !!arg('persona-level', false), engine: engineBuild,
    sessions: jobs.map((j, i) => ({ id: `${String(i + 1).padStart(2, '0')}-${j.item.pid}-L${j.item.level}-${j.mode}`, pid: j.item.pid, level: j.item.level, sid: j.item.sid, mode: j.mode, label: j.item.label, status: 'queued', turn: 0 })),
  };
}
if (!run.offline && !hasKey()) { console.error('GEMINI_API_KEY 가 없습니다 — poc/.env 에 넣거나 --offline 으로 실행하세요'); process.exit(1); }

const calls = [];
const onCall = (c) => { calls.push({ ...c, at: Date.now() }); };
const mk = (role, model, extra = {}) => new LLM({ apiKey: CFG.apiKey, model, role, onCall, ...extra });
const llms = run.offline ? { customer: null, seller: { model: 'offline', json: async () => { throw new Error('offline'); } }, judge: null } : {
  customer: mk('customer', run.models.customer, { timeoutMs: 60000 }),
  seller: mk('seller', run.models.seller, { thinking: 'low', timeoutMs: 60000 }),
  judge: run.judge ? mk('judge', run.models.judge, { timeoutMs: 150000 }) : null,
};
installEngineLLM(llms.customer);

const saveRun = () => { const tmp = path.join(dir, 'run.json.tmp'); fs.writeFileSync(tmp, JSON.stringify(run, null, 1)); fs.renameSync(tmp, path.join(dir, 'run.json')); };
run.status = 'running'; saveRun();
const todo = run.sessions.map((m, i) => ({ m, i })).filter(({ m }) => !['won', 'lost', 'ended', 'error'].includes(m.status) || m.phase === 'judge');
console.log(`▶ ${run.id} · 엔진 ${run.engine && run.engine.which} · 세션 ${run.sessions.length}개(남은 ${todo.length}) · 고객 ${run.models.customer} · 영업 ${run.models.seller} · 심사 ${run.models.judge || '-'}`);
console.log(`  실시간: ${path.relative(process.cwd(), dir)}/sessions/*.jsonl (테스트 벤치 '제안 시뮬레이션' 탭)`);

let next = 0; let anyPaused = false;
async function worker() {
  while (next < todo.length) {
    const { m: meta } = todo[next++];
    if (Date.now() > STOP.at) { anyPaused = true; continue; }
    const file = path.join(dir, 'sessions', meta.id + '.jsonl');
    const stateFile = path.join(dir, 'sessions', meta.id + '.state.json');
    try {
      const rec = await runSession({
        item: { pid: meta.pid, level: meta.level, sid: meta.sid }, mode: meta.mode, maxTurns: run.turns, llms, file, stateFile, sessionId: meta.id,
        personaLevel: run.personaLevel, judge: run.judge, deadline: STOP,
        onProgress: (p) => { Object.assign(meta, p); saveRun(); },
      });
      if (rec.paused) { meta.status = 'paused'; anyPaused = true; console.log(`  ‖ ${meta.id} 멈춤 (${rec.turns.length}턴 저장) — --resume ${run.id}`); }
      else {
        Object.assign(meta, { status: rec.status, turn: rec.end ? rec.end.turns : meta.turn, phase: 'done' });
        console.log(`  ✓ ${meta.id} → ${rec.status} · ${rec.end ? rec.end.turns : '-'}턴 · 만족 ${rec.end && rec.end.satisfaction} · 품질 ${rec.end && rec.end.quality}${rec.judge ? ' · 심사 ' + Object.values(rec.judge.scores).join('/') : ''}`);
      }
    } catch (e) {
      meta.status = 'error'; meta.error = String(e && e.message);
      fs.appendFileSync(file, JSON.stringify({ type: 'error', sid: meta.id, where: 'session', msg: meta.error }) + '\n');
      console.log(`  ✗ ${meta.id} — ${meta.error}`);
    }
    saveRun();
  }
}
await Promise.all(Array.from({ length: Math.max(1, Math.min(CONC, todo.length || 1)) }, worker));

const prevLlm = run.llm || {};
const cur = Object.fromEntries(Object.entries(llms).filter(([, v]) => v && v.stats).map(([k, v]) => [k, v.stats()]));
run.llm = Object.fromEntries([...new Set([...Object.keys(prevLlm), ...Object.keys(cur)])].map((k) => {
  const a = prevLlm[k] || {}; const b = cur[k] || {}; const n = (a.calls || 0) + (b.calls || 0);
  return [k, { model: b.model || a.model, calls: n, fails: (a.fails || 0) + (b.fails || 0), avg_ms: n ? Math.round(((a.avg_ms || 0) * (a.calls || 0) + (b.avg_ms || 0) * (b.calls || 0)) / n) : 0, tok_in: (a.tok_in || 0) + (b.tok_in || 0), tok_out: (a.tok_out || 0) + (b.tok_out || 0), tok_think: (a.tok_think || 0) + (b.tok_think || 0) }];
}));
fs.appendFileSync(path.join(dir, 'calls.jsonl'), calls.map((c) => JSON.stringify(c)).join('\n') + (calls.length ? '\n' : ''));
if (anyPaused || run.sessions.some((m) => m.status === 'paused' || m.status === 'queued')) {
  run.status = 'paused'; saveRun();
  console.log(`‖ 멈춤 — 이어서: node run.mjs --resume ${run.id}`);
} else {
  run.status = 'done'; run.finished = new Date().toISOString(); saveRun();
  const rep = buildReport(dir);
  console.log(`■ 끝 — ${path.relative(process.cwd(), path.join(dir, 'report.md'))} · report.html`);
  console.log(rep.headline);
}
