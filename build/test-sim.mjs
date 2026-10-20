// B2B 전략 시뮬레이션 (BETA): sidebar entry, setup (presets · my proposals · free), 3 levels + profile,
// session with streaming customer (mock AI) and rule fallback, @mention input, suggestions, hover details,
// right panel (satisfaction · quality · similar Best Scenario), finish → debrief, mobile drawer, dark.
//   node build/test-sim.mjs            → rule mode (no AI) + mock-AI streaming mode
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const shots = path.resolve(here, 'qa');
fs.mkdirSync(shots, { recursive: true });
const PORT = 8773;
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200); fs.createReadStream(f).pipe(r);
}).listen(PORT);
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const errs = [];
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };

// mock window.claude.use('sample') — streams "reply\n<<<EVAL>>>\n{json}" a few characters at a time
const MOCK = () => {
  let n = 0;
  const reply = (turns) => {
    const last = String(turns[turns.length - 1].content || '');
    n++;
    if (/첫 마디/.test(last)) return '안녕하세요, 반갑습니다. 이번 건은 매장 메뉴판을 본사에서 한 번에 바꾸는 게 핵심이에요. 비슷한 곳에서 실제로 어떻게 운영하는지부터 듣고 싶습니다.';
    if (/사례|case:/.test(last)) return '비슷한 업종 사례가 있다니 반갑네요. 다만 솔직히 가맹점주가 초기 비용을 부담하기 어렵다는 점이 걱정입니다.';
    return '네, 말씀 잘 들었습니다. 그래서 저희가 실제로 얼마나 줄일 수 있는지 숫자로 보고 싶어요.';
  };
  const sample = async (input, opts = {}) => {
    const turns = Array.isArray(input) ? input : [{ role: 'user', content: input }];
    const last = String(turns[turns.length - 1].content || '');
    const r = reply(turns);
    const opening = /첫 마디/.test(last);
    const sat = opening ? 45 : /사례|case:/.test(last) ? 58 : 50;
    const ev = { satisfaction: sat, trust: 48, interest: 60, mood: '중립', why: opening ? '' : /사례|case:/.test(last) ? '같은 업종 사례로 근거' : '방향은 좋지만 수치가 없음', stage: opening ? 'open' : /사례|case:/.test(last) ? 'objection' : 'value',
      revealed: /사례|case:/.test(last) ? ['c1'] : [], resolved: [],
      scores: opening ? {} : { CU2: 55, CU3: 30, CU4: 40, PR3: 62, PR4: 58, PR6: 20, VS1: 50, VS2: 25, VS4: 35, VS6: 30, VS5: /case:/.test(last) ? 72 : 15, MK3: 40, WR5: 90 },
      notes: { CU2: '본사 일괄 반영에 답함', VS2: '정량 효과가 아직 없음', VS5: '같은 업종 사례 1건' },
      suggest: [
        { text: '초기 부담은 구독 · 렌탈과 단계 도입으로 나누겠습니다. @solution:magicinfo 운영까지 포함한 5년 TCO로 비교해 드릴게요.', why: '우려 대응', crit: ['CU3'] },
        { text: '파일럿 10곳에서 메뉴 반영 리드타임과 가격 오류 건수를 실측해 [00]% 개선을 확인하시게 하겠습니다.', why: '정량 효과', crit: ['VS2'] },
        { text: '@case:3727 처럼 본사에서 콘텐츠를 일괄 제어하는 구조를 @product:qm55c 로 구성하겠습니다.', why: '사례 근거', crit: ['VS5'] },
      ], end: null };
    const full = r + '\n<<<EVAL>>>\n' + JSON.stringify(ev);
    await new Promise((res) => setTimeout(res, 250));
    let shown = '';
    for (let i = 4; i < full.length + 4; i += 4) {
      if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', text: shown };
      const t = full.slice(0, Math.min(i, full.length)); const delta = t.slice(shown.length); shown = t;
      opts.onText && opts.onText({ text: t, delta });
      await new Promise((res) => setTimeout(res, 12));
    }
    window.__mockCalls = (window.__mockCalls || 0) + 1;
    return { text: full, truncated: false, modelTierApplied: 'quick' };
  };
  sample.json = async () => ({ verdict: '사례로 신뢰를 얻었지만 비용 우려가 남았어요', good: ['같은 업종 사례를 먼저 꺼냄', '본사 일괄 운영을 고객 언어로 설명'], improve: ['초기 비용 우려에 답하지 않음', '효과를 숫자로 말하지 않음'], next: '구독 · TCO로 비용 우려부터 풀어 보세요' });
  sample.limits = async () => ({ maxPromptBytes: 262144 });
  window.claude = { use: async (name) => (name === 'sample' ? sample : null) };
};

const mk = async (opts = {}, mock = false) => {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts });
  if (mock) await ctx.addInitScript(MOCK);
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  return { ctx, page };
};
const shot = async (page, n) => { await page.waitForTimeout(350); await page.screenshot({ path: path.join(shots, 'sim-' + n + '.png') }); console.log('shot', n); };
const open = async (page) => { await page.goto(`http://localhost:${PORT}/`); await page.waitForSelector('.sb-sim', { timeout: 30000 }); };
const typeMsg = async (page, text) => { await page.click('#sim-ed'); await page.keyboard.type(text, { delay: 2 }); };

// ---------------- rule mode (no AI) ----------------
{
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 } });
  await open(page);
  const sb = await page.locator('.sidebar button').allInnerTexts();
  const iRev = sb.findIndex((t) => t.includes('제안서 검토 내역')); const iSim = sb.findIndex((t) => t.includes('B2B 전략 시뮬레이션'));
  ok('sidebar: sim button right below 제안서 검토 내역', iSim === iRev + 1, `rev ${iRev} sim ${iSim}`);
  ok('sidebar: BETA badge', await page.locator('.sb-sim .sb-beta').innerText() === 'BETA');
  await page.click('.sb-sim'); await page.waitForSelector('.simset');
  ok('setup: current page', await page.locator('.sb-sim[aria-current="page"]').count() === 1);
  ok('setup: 3 level tiles with faces', await page.locator('.ss-lv svg').count() === 3);
  ok('intro: 4 steps + 3 gains under the header', await page.locator('.ss-intro .si-step').count() === 4 && await page.locator('.ss-intro .si-gain').count() === 3);
  ok('intro: no collapse / toggle controls', await page.locator('.ss-intro button, .ss-intro a, .ss-intro-open').count() === 0 && !(await page.locator('.simset').innerText()).includes('접기'));
  const introFlat = await page.evaluate(() => [...document.querySelectorAll('.ss-intro .si-step')].every((el) => { const c = getComputedStyle(el); return c.borderTopWidth === '0px' && c.boxShadow === 'none' && c.cursor !== 'pointer'; }));
  ok('intro: flat read-only steps (no card borders / shadows)', introFlat);
  ok('keyword: 전략 Agent on the setup page', (await page.locator('.ss-top').innerText()).includes('전략 Agent') && (await page.locator('.ss-intro').innerText()).includes('전략 Agent'));
  ok('setup: no start button in the header', await page.locator('.ss-top button').count() === 0);
  const sb0 = await page.locator('.ss-go').boundingBox();
  const bd0 = await page.locator('.ss-board').boundingBox();
  ok('setup: start bar right below the cards, full width', sb0 && sb0.y > bd0.y + bd0.height && sb0.y - (bd0.y + bd0.height) < 40 && Math.abs(sb0.width - bd0.width) < 2 && sb0.height >= 56, JSON.stringify(sb0 && { y: Math.round(sb0.y - bd0.y - bd0.height), w: Math.round(sb0.width), bw: Math.round(bd0.width), h: Math.round(sb0.height) }));
  ok('setup: no form fields on the page itself', await page.locator('.simset .ss-fields, .simset .mention-editor').count() === 0);
  ok('setup: history cards listed below (no button)', await page.locator('.simset button:has-text("기록")').count() === 0 && await page.locator('.ss-hrows .ss-hr').count() >= 1);
  ok('history row: face + thumbnails + spark', await page.locator('.ss-hr .ss-hr-face svg').count() >= 1 && await page.locator('.ss-hr .ss-hr-th').count() >= 1 && await page.locator('.ss-hr .ss-hc-spark').count() >= 1);
  const bb = await page.locator('.ss-board').boundingBox(); const hb = await page.locator('.ss-histw').boundingBox();
  ok('history: list placed well below the setup cards', hb.y - (bb.y + bb.height) >= 40, String(Math.round(hb.y - (bb.y + bb.height))));
  ok('setup: big profile photo', (await page.locator('.ss-hero-photo svg').boundingBox()).width >= 130);
  const nameM = await page.locator('.ss-hero-t b').innerText();
  await page.click('.ss-pickp'); await page.waitForSelector('.modal .pp-grid');
  ok('picker: 6 default profiles + add tile', await page.locator('.modal .pp-card').count() === 6 && await page.locator('.modal .pp-add').count() === 1);
  await shot(page, '01c-picker');
  await page.click('.modal .pp-main:has-text("정하은")'); await page.waitForTimeout(200);
  const nameF = await page.locator('.ss-hero-t b').innerText();
  ok('picker: choosing a profile switches the customer', nameF.includes('정하은') && nameF !== nameM, nameF.split('\n')[0] + ' / ' + nameM.split('\n')[0]);
  await page.click('.ss-pickp'); await page.waitForSelector('.modal .pp-grid');
  await page.click('.modal .pp-main:has-text("' + nameM.replace(/\d+/g, '').trim() + '")'); await page.waitForTimeout(200);
  await shot(page, '01-setup');
  await page.hover('.ss-lv.lv-3'); await page.waitForSelector('.sim-pop .tp-stats', { timeout: 3000 });
  ok('setup: level hover shows stats', await page.locator('.sim-pop .tp-meters > span').count() === 4);
  await shot(page, '01b-level-hover');
  await page.mouse.move(5, 5);
  for (const lv of [1, 3]) {
    await page.click(`.ss-lv.lv-${lv}`); await page.waitForTimeout(150);
    await page.click('.ss-hero'); await page.waitForSelector('.modal .sim-prof');
    const hidden = await page.locator('.modal .sim-prof .sp-cc.hidden').count();
    ok(`profile popup: level ${lv} shows ${lv} hidden concerns`, hidden === lv, String(hidden));
    if (lv === 1) ok('profile popup: no start button, has 새 프로필 + 고쳐서 새로 저장', await page.locator('.modal .mfoot button:has-text("시작")').count() === 0 && await page.locator('.modal .pm-new').count() === 1 && (await page.locator('.modal .pm-edit').innerText()).includes('새로 저장'));
    if (lv === 3) await shot(page, '02-profile-popup');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  }
  await page.click('.ss-card-h button:has-text("바꾸기")'); await page.waitForSelector('.modal .srm');
  ok('req popup: preset selected', await page.locator('.modal .ss-opt[aria-pressed="true"]').count() === 1);
  await shot(page, '02b-req-popup');
  await page.click('.modal .seg button:has-text("내 제안서")'); await page.waitForTimeout(200);
  ok('req popup: my proposals listed', await page.locator('.modal .ss-pick .ss-opt').count() > 0);
  await page.locator('.modal .ss-pick .ss-opt').first().click(); await page.waitForTimeout(150);
  ok('req popup: proposal fills customer', (await page.inputValue('.modal .ss-fields input')).length > 0);
  await page.click('.modal .seg button:has-text("예시")'); await page.waitForTimeout(150);
  await page.click('.modal .ss-opt:has-text("F&B 프랜차이즈")');
  await page.click('.modal .mfoot button:has-text("적용")'); await page.waitForTimeout(200);
  ok('req popup: applied to summary', (await page.locator('.ss-reqsum .t').innerText()).includes('F&B'));
  // ---- customer profiles: new · edit an existing one and save as new · overwrite · delete ----
  await page.click('.ss-newp'); await page.waitForSelector('.modal .pfe');
  ok('editor: 30 photo choices', await page.locator('.modal .pfe-face').count() === 30);
  await page.click('.modal .pfe-sh .seg button:has-text("여성")');
  ok('editor: gender filter', await page.locator('.modal .pfe-face').count() === 15);
  ok('editor: save disabled without a name', await page.locator('.modal .pfe-saveas').isDisabled());
  await page.click('.modal .pfe-face[aria-label="사진 f08"]');
  await page.click('.modal .pfe-tw-row:has-text("머리 색") .pfe-dot[aria-label="머리 색 갈색"]');
  await page.click('.modal .pfe-tw-row:has-text("안경") .pfe-chip:has-text("없음")');
  const prevHtml = await page.locator('.modal .pfe-prev svg').innerHTML();
  ok('editor: tweaks change the preview', prevHtml.includes('#6b4a33') && !/stroke="#8a6a3a"/.test(prevHtml));
  await page.fill('.modal .pfe-row.r1 input >> nth=0', '최서윤');
  await page.fill('.modal .pfe-row.r1 input[type="number"]', '41');
  await page.fill('.modal .pfe-row.r2 input >> nth=0', '구매팀장');
  await page.click('.modal .ss-int-in'); await page.keyboard.type('근거 중시'); await page.keyboard.press('Enter');
  await page.keyboard.type('가격 민감'); await page.keyboard.press('Enter');
  await page.fill('.modal .ss-f:has-text("평소 한마디") input', '다른 데도 다 비슷하던데, 뭐가 다른지부터 보죠.');
  await page.click('.modal .pfe-lvb.lv-3');
  await shot(page, '02c-persona-editor');
  ok('editor: new profile has no overwrite button', await page.locator('.modal .pfe-save').count() === 0);
  await page.click('.modal .pfe-saveas'); await page.waitForTimeout(250);
  ok('new profile: selected on the setup card', (await page.locator('.ss-hero-t b').innerText()).includes('최서윤') && await page.locator('.ss-hero .ss-mine').count() === 1);
  ok('new profile: level follows the profile', await page.locator('.ss-lv.lv-3[aria-checked="true"]').count() === 1);
  ok('new profile: role override', (await page.locator('.ss-hero-t .role').innerText()) === '구매팀장');
  ok('new profile: stored', await page.evaluate(() => JSON.parse(localStorage.getItem('winmate.v2.simPersonas') || '[]').length) === 1);
  await page.click('.ss-lv.lv-2'); await page.waitForTimeout(150);
  ok('custom profile: level change keeps the person', (await page.locator('.ss-hero-t b').innerText()).includes('최서윤'));
  // edit a default profile → save as new
  await page.click('.ss-pickp'); await page.waitForSelector('.modal .pp-grid');
  ok('picker: my profile listed', await page.locator('.modal .pp-card:has-text("최서윤")').count() === 1);
  await page.click('.modal .pp-main:has-text("한상철")'); await page.waitForTimeout(200);
  await page.click('.ss-hero'); await page.waitForSelector('.modal .sim-prof');
  await page.click('.modal .pm-edit'); await page.waitForSelector('.modal .pfe');
  ok('edit default: prefilled from the profile', (await page.inputValue('.modal .pfe-row.r1 input >> nth=0')) === '한상철' && await page.locator('.modal .pfe-face[aria-checked="true"][aria-label="사진 m03"]').count() === 1);
  ok('edit default: only save as new', await page.locator('.modal .pfe-save').count() === 0);
  await page.fill('.modal .pfe-row.r1 input >> nth=0', '한상철 (구매)');
  await page.click('.modal .pfe-tw-row:has-text("옷") .pfe-dot[aria-label="옷 와인"]');
  await page.click('.modal .pfe-saveas'); await page.waitForTimeout(250);
  ok('edit default: saved as a new profile', (await page.locator('.ss-hero-t b').innerText()).includes('한상철 (구매)') && await page.evaluate(() => JSON.parse(localStorage.getItem('winmate.v2.simPersonas') || '[]').length) === 2);
  // overwrite a custom profile from the picker
  await page.click('.ss-pickp'); await page.waitForSelector('.modal .pp-grid');
  await page.click('.modal .pp-card:has-text("최서윤") .pp-edit'); await page.waitForSelector('.modal .pfe');
  ok('edit custom: overwrite available', await page.locator('.modal .pfe-save').count() === 1);
  await page.fill('.modal .ss-f:has-text("평소 한마디") input', '숫자 세 개만 보여 주세요.');
  await page.click('.modal .pfe-save'); await page.waitForTimeout(250);
  ok('edit custom: overwritten, not duplicated', await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('winmate.v2.simPersonas') || '[]'); return l.length === 2 && l.some((p) => p.quote === '숫자 세 개만 보여 주세요.'); }));
  await page.click('.ss-hero'); await page.waitForSelector('.modal .sim-prof');
  ok('profile popup: custom quote shown', (await page.locator('.modal .sp-quote').innerText()).includes('숫자 세 개만'));
  await shot(page, '02d-custom-profile');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // delete the copied default
  await page.click('.ss-pickp'); await page.waitForSelector('.modal .pp-grid');
  await page.click('.modal .pp-main:has-text("한상철 (구매)")'); await page.waitForTimeout(200);
  await page.click('.ss-hero'); await page.waitForSelector('.modal .sim-prof');
  await page.click('.modal .pm-del'); await page.click('.modal .pm-del'); await page.waitForTimeout(250);
  ok('delete: profile removed, falls back to a default', await page.evaluate(() => JSON.parse(localStorage.getItem('winmate.v2.simPersonas') || '[]').length) === 1 && !(await page.locator('.ss-hero-t b').innerText()).includes('(구매)'));
  await page.click('.ss-pickp'); await page.waitForSelector('.modal .pp-grid');
  await page.click('.modal .pp-main:has-text("최서윤")'); await page.waitForTimeout(200);
  await page.click('.ss-lv.lv-2');
  await page.click('.ss-go');
  await page.waitForSelector('.sim-list .sim-msg.cust', { timeout: 15000 }); await page.waitForTimeout(1500);
  ok('session: custom profile is the customer', (await page.locator('.sim-person').innerText()).includes('최서윤') && (await page.locator('.sim-head .sim-who').innerText()).includes('최서윤'));
  ok('session: opening line from customer (rules)', (await page.locator('.sim-msg.cust .sim-b').first().innerText()).length > 20);
  ok('session: AI-off note', await page.locator('.sim-note').count() === 1);
  ok('session: 3 suggestions', await page.locator('.sim-sug').count() === 3);
  ok('session: similar scenarios 3', await page.locator('.ssc').count() === 3);
  ok('session: quality empty before first answer', (await page.locator('.sim-q .sc-v b').first().innerText()) === '—');
  ok('header: only 미팅 마무리 on the right', await page.locator('.sim-head .sim-steps, .sim-head .sim-lv, .sim-head .sim-mini').count() === 0 && await page.locator('.sim-head .sim-end').count() === 1);
  ok('no requirement strip', await page.locator('.sim-req').count() === 0);
  ok('composer: no helper text', await page.locator('.sim-comp-bar, .sim-hint').count() === 0);
  const sugTxt = await page.locator('.sim-sugs').innerText();
  ok('suggestions: no codes / plus / description', !/[A-Z]{2}\d|\+ |약한 기준/.test(sugTxt), sugTxt.slice(0, 60).replace(/\n/g, ' | '));
  ok('panel: person card', await page.locator('.sim-person .spc-photo svg').count() === 1);
  await page.hover('.sim-sug >> nth=0'); await page.waitForSelector('.sim-pop .tp-full', { timeout: 3000 });
  ok('suggestion hover shows full text', (await page.locator('.sim-pop .tp-full').innerText()).length > 20);
  await shot(page, '03b-sug-hover');
  await page.mouse.move(10, 10); await page.waitForTimeout(150);
  await shot(page, '03-session-open');
  // type with @mention
  await typeMsg(page, '본부장님, 매장 카운터에는 @QM55');
  await page.waitForSelector('.mmenu .mopt'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  await page.keyboard.type('를 두고 본사에서 가격을 한 번에 바꾸겠습니다. 비용은 줄이고 반영은 당일로 바뀝니다.', { delay: 1 });
  ok('composer: mention chip inserted', await page.locator('#sim-ed .mention').count() === 1);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.sim-msg.cust').length >= 2, null, { timeout: 15000 }); await page.waitForTimeout(1200);
  ok('session: my message has mention', await page.locator('.sim-msg.me .mention').count() === 1);
  ok('session: feedback line with delta', await page.locator('.sim-fb .sim-delta').count() >= 1);
  const q1 = await page.locator('.sim-q .sc-v b').first().innerText();
  ok('quality: scored after first answer', /^\d+$/.test(q1), q1);
  // hover category → criteria detail
  await page.hover('.sq-cat >> nth=0'); await page.waitForSelector('.sim-pop .tc', { timeout: 3000 });
  ok('hover: category shows criteria', await page.locator('.sim-pop .tc').count() === 3);
  ok('hover: no criterion codes', !/[A-Z]{2}\d/.test(await page.locator('.sim-pop').innerText()));
  await shot(page, '04-hover-cat');
  await page.mouse.move(10, 10); await page.waitForTimeout(150);
  await page.hover('.sim-sat'); await page.waitForSelector('.sim-pop .tp-rows', { timeout: 3000 });
  ok('hover: satisfaction detail', await page.locator('.sim-pop .tp-cc li').count() >= 1);
  await shot(page, '05-hover-sat');
  await page.mouse.move(10, 10);
  // suggestion → editor, then send
  await page.locator('.sim-sug-b').first().click(); await page.waitForTimeout(200);
  ok('suggestion fills composer', (await page.locator('#sim-ed').innerText()).length > 10);
  await page.click('.sim-send');
  await page.waitForFunction(() => document.querySelectorAll('.sim-msg.cust').length >= 3, null, { timeout: 15000 }); await page.waitForTimeout(1200);
  // send directly via arrow
  await page.locator('.sim-sug-go').nth(1).click();
  await page.waitForFunction(() => document.querySelectorAll('.sim-msg.cust').length >= 4, null, { timeout: 15000 }); await page.waitForTimeout(1200);
  await shot(page, '06-session-turns');
  // profile hover in panel
  await page.hover('.sim-person'); await page.waitForSelector('.sim-pop .sim-prof', { timeout: 3000 });
  await shot(page, '07-hover-profile');
  await page.mouse.move(10, 10);
  // open scenario detail
  await page.locator('.ssc').first().click(); await page.waitForSelector('.modal .bsd', { timeout: 5000 });
  ok('similar: opens Best Scenario detail', true);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  // finish
  await page.click('.sim-head button:has-text("미팅 마무리")');
  await page.waitForSelector('.sim-result .sr-b', { timeout: 10000 });
  ok('finish: debrief shown', await page.locator('.sim-result li').count() >= 2);
  await shot(page, '08-result');
  // dark
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(300);
  await shot(page, '09-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  // to proposal
  await page.click('.sim-result button:has-text("이 흐름으로 제안서 시작")');
  await page.waitForTimeout(1500);
  ok('to proposal: navigated', await page.locator('.sb-item[aria-current="page"]').count() === 1);
  // demo history session
  await page.click('.sb-sim'); await page.waitForSelector('.ss-hrows');
  ok('history: new sessions appear as rows', await page.locator('.ss-hr').count() >= 2);
  { const ys = await page.locator('.ss-hr').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x))); ok('history: single-column list', new Set(ys).size === 1, ys.join(',')); }
  await page.locator('.ss-hrows').scrollIntoViewIfNeeded(); await shot(page, '09b-history-list');
  await page.locator('.ss-hr-main:has-text("예시")').click(); await page.waitForSelector('.sim-result');
  await shot(page, '10-demo');
  ok('demo: won', await page.locator('.sim-result.st-won').count() === 1);
  await ctx.close();
}

// ---------------- mock AI streaming ----------------
{
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 } }, true);
  await open(page);
  await page.click('.sb-sim'); await page.waitForSelector('.simset');
  await page.click('.ss-lv.lv-3');
  await page.click('.ss-go');
  await page.waitForSelector('.sim-msg.cust .sim-caret, .sim-typing', { timeout: 10000 });
  await page.waitForSelector('.sim-caret', { timeout: 10000 });
  const mid = await page.locator('.sim-msg.cust .sim-b').last().innerText();
  await shot(page, '11-ai-streaming');
  ok('stream: partial text visible, no delimiter', mid.length > 0 && !mid.includes('<<<'), mid.slice(0, 30));
  await page.waitForFunction(() => !document.querySelector('.sim-caret'), null, { timeout: 15000 }); await page.waitForTimeout(300);
  const fin = await page.locator('.sim-msg.cust .sim-b').last().innerText();
  ok('stream: final text has no JSON', !fin.includes('{') && !fin.includes('EVAL'), fin.slice(0, 40));
  ok('ai: suggestions from model (3)', await page.locator('.sim-sug').count() === 3);
  ok('ai: suggestion mentions rendered', await page.locator('.sim-sug .mention').count() >= 2);
  ok('ai: no AI-off note', await page.locator('.sim-note').count() === 0);
  await typeMsg(page, '@case:3727 사례처럼 본사에서 콘텐츠를 일괄 제어하는 구조로 가겠습니다');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await shot(page, '12-ai-busy');
  await page.waitForFunction(() => document.querySelectorAll('.sim-msg.cust').length >= 2 && !document.querySelector('.sim-caret'), null, { timeout: 20000 }); await page.waitForTimeout(400);
  ok('ai: concern revealed chip', await page.locator('.sim-ce.open').count() === 1);
  ok('ai: quality source = AI', (await page.locator('.sim-q .sc-src').innerText()).includes('AI'));
  await shot(page, '13-ai-turn');
  // stop mid-stream
  await typeMsg(page, '네 알겠습니다 다음으로 넘어가겠습니다');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.sim-caret', { timeout: 10000 }); await page.waitForTimeout(150);
  await page.click('.sim-send.stop'); await page.waitForTimeout(500);
  ok('stop: stopped message marked', await page.locator('.sim-stopped').count() === 1);
  await ctx.close();
}

// ---------------- mobile ----------------
{
  const { ctx, page } = await mk({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await open(page);
  await page.click('.mob-top button'); await page.waitForTimeout(300);
  await page.click('.sb-sim'); await page.waitForSelector('.simset'); await page.waitForTimeout(400);
  const ow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('mobile setup: no horizontal scroll', ow <= 0, String(ow));
  await shot(page, '14-mobile-setup');
  await page.click('.ss-go');
  await page.waitForSelector('.sim-sug', { timeout: 15000 }); await page.waitForTimeout(500);
  await shot(page, '15-mobile-session');
  await page.click('.sim-who'); await page.waitForTimeout(400);
  await shot(page, '16-mobile-panel');
  ok('mobile: drawer open', await page.locator('.sim.drawer-open').count() === 1);
  await ctx.close();
}

console.log('\nerrors', errs.length ? errs : 'none');
console.log(results.filter((r) => r[0] === 'FAIL').length ? 'FAILURES: ' + results.filter((r) => r[0] === 'FAIL').map((r) => r[1]).join(' | ') : 'ALL PASS');
await browser.close(); srv.close();
