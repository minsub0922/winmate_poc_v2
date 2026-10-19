// Strict deterministic UI workflows in a real browser — group 'ui' (12 cases, minimum 10).
//
// Each case gets a fresh browser context (own localStorage/IndexedDB), creates its fixture data through the app's own
// repositories imported into the running Vite page, then drives the real UI with mouse/keyboard/file inputs and checks
// what the app persisted. Fixture creation is setup only — every assertion follows a UI action.
// Model endpoints are blocked (503) and external hosts aborted; AI buttons are never exercised as positive paths here.
//
// Needs the API/app server (WINMATE_TEST_URL, default http://127.0.0.1:8788; WINMATE_TEST_PASSWORD when login is on).
// A Vite dev server is started in-process (WINMATE_STRICT_VITE_PORT, default 5199) unless WINMATE_VITE_URL is set.
//
//   node app/tests/real-functional-e2e.mjs            # all cases
//   node app/tests/real-functional-e2e.mjs U07 U12    # selected case ids
//
// Report: app/tests/output/strict/ui.json (+ screenshots of failures in app/tests/output/strict/ui/).
import fs from 'node:fs';
import path from 'node:path';
import { showSidebar, nav, settle } from './helpers.mjs';
import {
  launch, startVite, isolatedContext, openApp, waitApp, suite, ok, eq, CheckFailed, fixtures, inspectPptx, runsOf,
  readIdb, localJson, outDir, sleep,
} from './fixtures/strict/harness.mjs';

const FILE = 'app/tests/real-functional-e2e.mjs';
const only = new Set(process.argv.slice(2));
const uiDir = path.join(outDir, 'ui'); fs.mkdirSync(uiDir, { recursive: true });
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

let vite = null, browser = null, setupError = '';
try { vite = await startVite(); browser = await launch(); } catch (e) { setupError = e.message; }

const ui = suite('ui', FILE);
const blockedAll = [];
const pageErrorsAll = [];

/** One isolated context per case; closed afterwards. A failing case leaves a screenshot. */
function uiCase(id, title, fn) {
  if (only.size && !only.has(id)) return;
  ui.case(id, title, async (d) => {
    const context = await isolatedContext(browser, vite.url);
    let page = null;
    try {
      page = await openApp(context, vite.url);
      await fn(page, d, context);
    } catch (e) {
      if (page) await page.screenshot({ path: path.join(uiDir, id + '-failed.png') }).catch(() => {});
      throw e;
    } finally {
      d.blocked = context.strictBlocked.length ? context.strictBlocked.slice(0, 10) : undefined;
      if (page && page.strictErrors.length) d.pageErrors = page.strictErrors.slice(0, 10);
      blockedAll.push(...context.strictBlocked.map((b) => ({ case: id, ...b })));
      if (page) pageErrorsAll.push(...page.strictErrors.map((m) => ({ case: id, message: m })));
      await context.close().catch(() => {});
    }
  });
}

const persisted = async (page, id) => ((await localJson(page, 'winmate.v2.proposals')) || []).find((p) => p.id === id) || null;
/** poll the persisted proposal until check(p) holds (repositories persist after a 250 ms debounce) */
async function until(page, id, check, what, timeout = 8000) {
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    last = await persisted(page, id);
    if (last && check(last)) return last;
    await sleep(150);
  }
  throw new CheckFailed(`timed out waiting for ${what}; last persisted: ${JSON.stringify(last).slice(0, 400)}`);
}

async function fixtureProposal(page, fixture) {
  return page.evaluate(async (fx) => {
    const m = await import('/src/repositories/proposals.js');
    const id = m.createProposal();
    m.update(id, (d) => { Object.assign(d, structuredClone(fx)); });
    await new Promise((r) => setTimeout(r, 450));
    return id;
  }, fixture);
}

async function openProposal(page, title) {
  await showSidebar(page);
  await page.locator('.sb-list .sb-item').filter({ hasText: title }).first().click();
  await page.mouse.move(page.viewportSize().width - 3, 2);
  await settle(page);
  eq(await page.locator('#pr-title').inputValue(), title, 'opened proposal title');
}

async function newProposal(page) {
  await nav(page, '.sb-new');
  await page.locator('#pr-title').waitFor();
  return page.evaluate(() => JSON.parse(localStorage.getItem('winmate.v2.ui') || '{}').route?.id);
}

const names = (page) => page.evaluate(async () => {
  const c = await import('/src/services/catalog.js');
  return { layout: c.L.L_PH_P3_A && c.L.L_PH_P3_A.name, from: c.P.qm55c && c.P.qm55c.name, to: c.P.qm65c && c.P.qm65c.name, fromUrl: c.P.qm55c && c.P.qm55c.url };
});

async function openLayoutDetail(page, layoutName) {
  await page.getByRole('button', { name: layoutName + ' 열기', exact: true }).click();
  await page.locator('.detail-left').waitFor();
  await page.waitForTimeout(300);
}

async function paste(page, selector, text) {
  await page.locator(selector).evaluate((el, text) => {
    el.focus();
    const data = new DataTransfer(); data.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}

async function deckFile(page, name, marker) {
  const blocks = await page.evaluate(() => window.__strict.visibleBlocks('L_PH_P3_A'));
  ok(blocks.length >= 1, 'L_PH_P3_A has visible text blocks');
  const top = [...blocks].sort((a, b) => b.fs - a.fs || a.i - b.i)[0];
  const exp = await page.evaluate(([i, marker]) => window.__strict.exportDeck([{ f: 'L_PH_P3_A', ov: { t: { [i]: marker }, img: {} } }]), [top.i, marker]);
  const file = path.join(uiDir, name);
  fs.writeFileSync(file, Buffer.from(exp.b64, 'base64'));
  return file;
}

// ---------------------------------------------------------------------- cases
uiCase('U01', 'sidebar “새 제안서 시작” creates one proposal and opens the requirements popup', async (page, d) => {
  const before = await page.locator('.sb-list .sb-item').count();
  const id = await newProposal(page);
  ok(id, 'route points at the new proposal');
  await page.getByRole('dialog', { name: '고객 요구사항', exact: true }).waitFor();
  eq(await page.locator('#pr-title').inputValue(), '새 제안서', 'default title');
  eq(await page.locator('.sb-list .sb-item').count(), before + 1, 'sidebar history grew by one');
  const p = await until(page, id, () => true, 'new proposal persisted');
  eq([p.title, p.stage, p.reqTab, p.parts.length, p.req.free.length], ['새 제안서', 'req', 'free', 0, 0], 'new proposal record');
  d.id = id;
});

uiCase('U02', 'title edit persists; clearing it falls back to “새 제안서”', async (page, d) => {
  const id = await fixtureProposal(page, { title: 'WMSTRICT U02 원래 제목', customer: 'U02 고객' });
  await openProposal(page, 'WMSTRICT U02 원래 제목');
  await page.locator('#pr-title').fill('WMSTRICT U02 바뀐 제목');
  await until(page, id, (p) => p.title === 'WMSTRICT U02 바뀐 제목', 'edited title');
  await showSidebar(page);
  ok((await page.locator('.sb-list .sb-item').allInnerTexts()).some((t) => t.includes('WMSTRICT U02 바뀐 제목')), 'sidebar shows the edited title');
  await page.mouse.move(page.viewportSize().width - 3, 2);
  await page.locator('#pr-title').fill('');
  await page.locator('#pr-title').press('Tab');
  const p = await until(page, id, (p) => p.title === '새 제안서', 'blank title fallback');
  eq(await page.locator('#pr-title').inputValue(), '새 제안서', 'input shows the fallback');
  d.final = p.title;
});

uiCase('U03', 'free requirement text with a keyboard @ mention stores text + product segment and links the product', async (page, d) => {
  const id = await newProposal(page);
  const editor = page.locator('#free-ed');
  await editor.fill('WMSTRICT-U03 전국 매장 메뉴보드 교체. 카운터에는 ');
  await editor.press('End');
  await page.keyboard.type('@QM');
  await page.locator('.mmenu').waitFor();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#free-ed .mention[data-ref]'));
  const p = await until(page, id, (p) => p.req.free.some((s) => s.ref) && p.ctx.products.length > 0, 'mention persisted');
  const ref = p.req.free.find((s) => s.ref).ref;
  eq(ref, 'product:qm55c', 'mentioned product');
  ok(p.req.free.some((s) => s.t && s.t.includes('WMSTRICT-U03')), 'typed text kept as a text segment');
  ok(p.ctx.products.includes('qm55c'), 'mention linked the product to the proposal context');
  ok((await page.getByRole('dialog', { name: '고객 요구사항', exact: true }).innerText()).includes('태그 1개'), 'tag counter shows one tag');
  d.segments = p.req.free;
});

uiCase('U04', 'pasted product link becomes a link chip, resolves locally to the product and links it', async (page, d) => {
  const n = await names(page);
  ok(n.fromUrl, 'qm55c has a product URL');
  const id = await newProposal(page);
  await page.locator('#free-ed').fill('WMSTRICT-U04 참고 링크 ');
  await paste(page, '#free-ed', ' ' + n.fromUrl + ' ');
  await page.waitForFunction(() => document.querySelector('#free-ed .mlink[data-link]'));
  const p = await until(page, id, (p) => p.req.free.some((s) => s.link && s.link.ref), 'resolved link persisted');
  const seg = p.req.free.find((s) => s.link);
  eq([seg.t, seg.link.ref, seg.link.title], [n.fromUrl, 'product:qm55c', n.from], 'link segment');
  ok(p.ctx.products.includes('qm55c'), 'resolved link linked the product');
  ok((await page.locator('#free-ed .mlink[data-link]').first().getAttribute('aria-label')).includes(n.from), 'chip names the product');
  d.segment = seg;
});

uiCase('U05', 'form tab fields mirror into the proposal and the creator note keeps an @solution tag', async (page, d) => {
  const id = await newProposal(page);
  await page.getByRole('tab', { name: /^입력 폼/ }).click();
  await page.getByRole('textbox', { name: '프로젝트명', exact: true }).fill('WMSTRICT U05 프로젝트');
  await page.getByRole('textbox', { name: '고객사', exact: true }).fill('WMSTRICT U05 고객');
  await page.getByRole('textbox', { name: '최종 제안대상', exact: true }).fill('운영본부장');
  const note = page.getByRole('textbox', { name: '제작자 의견', exact: true });
  await note.fill('WMSTRICT-U05 파일럿부터 단계 도입. ');
  await note.press('End');
  await page.keyboard.type('@Magic');
  await page.locator('.mmenu').waitFor();
  await page.locator('.mmenu .mopt.solution').first().click();
  const p = await until(page, id, (p) => (p.req.form.noteSegs || []).some((s) => s.ref), 'creator note tag persisted');
  eq([p.req.form.project, p.req.form.customer, p.req.form.target], ['WMSTRICT U05 프로젝트', 'WMSTRICT U05 고객', '운영본부장'], 'form fields');
  eq([p.customer, p.title, p.reqTab], ['WMSTRICT U05 고객', 'WMSTRICT U05 프로젝트', 'form'], 'customer/title mirrored, tab remembered');
  eq(p.req.form.noteSegs.find((s) => s.ref).ref, 'solution:magicinfo', 'creator note solution tag');
  ok(p.req.form.note.includes('WMSTRICT-U05') && p.req.form.note.includes('@'), 'note text keeps the words and the @label');
  ok(p.ctx.solutions.includes('magicinfo'), 'tag linked the solution');
  d.note = p.req.form.note;
});

uiCase('U06', 'key-person weights: sum indicator flags ≠100%, added key person and requirement persist', async (page, d) => {
  const id = await newProposal(page);
  await page.getByRole('tab', { name: /^입력 폼/ }).click();
  await page.locator('.km input[id^="km-"]').nth(0).fill('운영본부장');
  await page.locator('.km input[id^="kw-"]').nth(0).fill('60');
  await page.getByRole('textbox', { name: '운영본부장 요구사항 1', exact: true }).fill('WMSTRICT-U06 신메뉴 당일 반영');
  await page.waitForTimeout(200);
  eq((await page.locator('.wsum').innerText()).trim(), '가중치 합 60%', 'sum after first weight');
  ok(await page.locator('.wsum.bad').count() === 1, 'sum ≠ 100% is flagged');
  await page.getByRole('button', { name: '키맨 추가' }).click();
  await page.locator('.km input[id^="km-"]').nth(1).fill('시설팀장');
  await page.locator('.km input[id^="kw-"]').nth(1).fill('40');
  await page.waitForTimeout(200);
  eq((await page.locator('.wsum').innerText()).trim(), '가중치 합 100%', 'sum after second weight');
  eq(await page.locator('.wsum.bad').count(), 0, 'balanced sum is not flagged');
  const p = await until(page, id, (p) => p.req.form.keymen.length === 2 && p.req.form.keymen[1].weight === 40, 'key people persisted');
  eq(p.req.form.keymen.map((k) => [k.name, k.weight]), [['운영본부장', 60], ['시설팀장', 40]], 'key people');
  ok(JSON.stringify(p.req.form.keymen[0].reqs[0]).includes('WMSTRICT-U06'), 'requirement line persisted');
});

uiCase('U07', 'layout detail: replace the database product QM55C with QM65C — slide text and overrides change', async (page, d) => {
  const n = await names(page);
  ok(n.layout && n.from && n.to, 'fixture layout and products exist in the catalog');
  const id = await fixtureProposal(page, fixtures.storyProposal);
  await openProposal(page, fixtures.storyProposal.title);
  await openLayoutDetail(page, n.layout);
  ok((await page.locator('.detail-left').innerText()).includes('QM55C'), 'layout shows QM55C before the swap');
  await page.getByRole('dialog').getByText('QM55C', { exact: true }).first().click();
  await page.getByRole('button', { name: n.from + ' — 다른 제품으로 바꾸기', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '제품 바꾸기', exact: true });
  await picker.getByRole('button', { name: n.to + ' · 고르기', exact: true }).press('Enter');
  await picker.getByRole('button', { name: /로 바꾸기$/ }).click();
  await page.waitForFunction(() => (document.querySelector('.detail-left') || {}).innerText?.includes('QM65C'));
  const p = await until(page, id, (p) => JSON.stringify(p.parts[0].layouts[0].ov).includes('QM65C'), 'swap persisted in overrides');
  d.ov = p.parts[0].layouts[0].ov;
});

uiCase('U08', 'layout detail: in-place text edit is saved as an override and shown again after reopening', async (page, d) => {
  const n = await names(page);
  const id = await fixtureProposal(page, fixtures.storyProposal);
  await openProposal(page, fixtures.storyProposal.title);
  const blocks = await page.evaluate(() => window.__strict.visibleBlocks('L_PH_P3_A'));
  const top = [...blocks].sort((a, b) => b.fs - a.fs || a.i - b.i)[0];
  ok(top, 'layout has a visible title block');
  await openLayoutDetail(page, n.layout);
  const block = page.locator(`.detail-left [data-tb="${top.i}"]`).first();
  await block.click();
  await page.waitForFunction((i) => document.querySelector(`.detail-left [data-tb="${i}"]`)?.isContentEditable, top.i);
  await page.keyboard.press(mod + '+A');
  await page.keyboard.insertText('WMSTRICT-U08 제목 직접 수정');
  await page.keyboard.press('Enter');
  const p = await until(page, id, (p) => (p.parts[0].layouts[0].ov.t || {})[top.i] === 'WMSTRICT-U08 제목 직접 수정', 'text override persisted');
  await page.getByRole('dialog').last().getByRole('button', { name: '닫기', exact: true }).first().click();
  await settle(page);
  await openLayoutDetail(page, n.layout);
  ok((await page.locator('.detail-left').innerText()).includes('WMSTRICT-U08 제목 직접 수정'), 'reopened detail shows the edited text');
  d.block = top.i; d.status = p.parts[0].layouts[0].status;
});

uiCase('U09', 'review: uploading a real PPTX parses its slide and stores the document locally', async (page, d) => {
  const file = await deckFile(page, 'strict-u09.pptx', 'WMSTRICT-U09 검토 제목');
  await nav(page, '.sb-rv');
  await page.locator('input[type=file]').first().setInputFiles(file);
  const end = Date.now() + 90000;
  let review = null;
  while (Date.now() < end) {
    review = ((await localJson(page, 'winmate.v2.reviews')) || []).find((r) => r.files && r.files[0] && r.files[0].name === 'strict-u09.pptx');
    if (review && Array.isArray(review.units)) break;
    await sleep(250);
  }
  ok(review && Array.isArray(review.units), 'review record with parsed units: ' + JSON.stringify(review).slice(0, 300));
  eq([review.title, review.kind, review.units.length, review.files[0].kind], ['strict-u09', 'pptx', 1, 'pptx'], 'review record');
  const doc = (await readIdb(page, 'winmate-v2-review', 'docs')).find((r) => r.key === review.id);
  ok(doc, 'parsed document stored in IndexedDB');
  eq(doc.value.units.length, 1, 'stored document units');
  ok(String(doc.value.units[0].text).includes('WMSTRICT-U09'), 'stored document holds the slide text');
  d.review = { id: review.id, status: review.status, stage: review.stage, poc: review.poc && review.poc.status };
});

uiCase('U10', 'My templates: uploading a PPTX imports one page, saves it with its pictures, survives reload', async (page, d) => {
  const file = await deckFile(page, 'strict-u10.pptx', 'WMSTRICT-U10 My 제목');
  await nav(page, '.sb-tpl');
  await page.getByRole('button', { name: 'My', exact: true }).click();
  await page.locator('input[data-my-file]').setInputFiles(file);
  await page.locator('.my-imp-card').first().waitFor({ timeout: 90000 });
  eq(await page.locator('.my-imp-card').count(), 1, 'one imported page offered');
  await page.getByRole('button', { name: '1장 My에 저장', exact: true }).click();
  await page.locator('.my-grp .tl-card').first().waitFor();
  const tpl = await readIdb(page, 'winmate-my', 'tpl');
  eq(tpl.length, 1, 'one template stored');
  ok(tpl[0].value.html.includes('WMSTRICT-U10'), 'stored template HTML keeps the slide text');
  const img = await readIdb(page, 'winmate-my', 'img');
  ok(tpl[0].value.imgs.every((t) => img.some((r) => r.key === t && r.blob && r.blob.size > 0)), 'every picture token has a stored Blob');
  await page.reload(); await waitApp(page);
  if (!(await page.locator('.my-grp .tl-card').count())) await page.getByRole('button', { name: 'My', exact: true }).click();
  await page.locator('.my-grp .tl-card').first().waitFor();
  ok((await page.locator('.my-grp .tl-card').first().innerText()).includes('WMSTRICT-U10'), 'template card after reload');
  d.pictures = tpl[0].value.imgs.length;
});

uiCase('U11', 'layout picker: search failure is explicit; clearing it allows choosing a real catalog layout', async (page, d) => {
  const id = await fixtureProposal(page, fixtures.pickerProposal);
  await openProposal(page, fixtures.pickerProposal.title);
  await page.getByRole('button', { name: 'PPT 레이아웃 추가', exact: true }).first().click();
  await page.locator('#pk-q').fill('L_PH_P3_A');
  await page.locator('#pk-q').press('Enter');
  await page.getByRole('button',{name:'다시 시도',exact:true}).waitFor();
  ok((await page.getByRole('dialog').last().innerText()).includes('검색'),'failed query is shown explicitly');
  await page.locator('#pk-q').fill('');
  await page.locator('.pcard[data-f="L_PH_P3_A"]').first().click();
  await page.getByRole('dialog').last().getByRole('button', { name: '완료', exact: true }).click();
  const p = await until(page, id, (p) => (p.parts.find((s) => s.id === 's_strict_pick') || { layouts: [] }).layouts.length > 0, 'picked layout persisted');
  const layouts = p.parts.find((s) => s.id === 's_strict_pick').layouts;
  eq(layouts.map((l) => l.f), ['L_PH_P3_A'], 'part layouts');
  ok(layouts[0].uid && layouts[0].ov, 'added layout has uid and overrides');
});

uiCase('U12', 'PPTX export button downloads an editable deck with the edited text and pictures', async (page, d) => {
  const blocks = await page.evaluate(() => window.__strict.visibleBlocks('L_PH_P3_A'));
  const top = [...blocks].sort((a, b) => b.fs - a.fs || a.i - b.i)[0];
  const fixture = structuredClone(fixtures.storyProposal);
  fixture.title = 'WMSTRICT U12 내보내기';
  fixture.parts[0].layouts[0].ov.t = { [top.i]: 'WMSTRICT-U12 내보낸 제목' };
  const id = await fixtureProposal(page, fixture);
  await openProposal(page, fixture.title);
  await page.getByRole('button', { name: /^PPT 레이아웃 \d+장/ }).click();
  await page.getByRole('button', { name: 'PPTX 내보내기', exact: true }).click();
  await page.locator('#ex-name').fill('WMSTRICT U12');
  const downloading = page.waitForEvent('download', { timeout: 90000 });
  await page.getByRole('button', { name: 'PPTX 만들기', exact: true }).click();
  const download = await downloading;
  const file = path.join(uiDir, 'WMSTRICT U12.pptx');
  await download.saveAs(file);
  ok(/\.pptx$/i.test(download.suggestedFilename()) && download.suggestedFilename().includes('WMSTRICT U12'), 'download named after the export name: ' + download.suggestedFilename());
  const z = await inspectPptx(fs.readFileSync(file));
  eq(z.slides.length, 1, 'exported slides');
  ok(runsOf(z.slides[0]).some((r) => r.text.includes('WMSTRICT-U12')), 'edited text exported as an editable run');
  ok(runsOf(z.slides[0]).length > 5, 'text stays editable (many runs)');
  ok(z.media.length >= 1, 'pictures embedded');
  const p = await persisted(page, id);
  Object.assign(d, { media: z.media.length, runs: runsOf(z.slides[0]).length, exportedAt: p && p.exportedAt });
});

const report = await ui.run(setupError, () => ({ blocked: blockedAll.slice(0, 80), modelCallsBlocked: blockedAll.filter((b) => b.kind === 'model').length, pageErrors: pageErrorsAll.slice(0, 40) }));
await browser?.close().catch(() => {});
await vite?.close().catch(() => {});
if (!report.meetsMinimum && !(only.size && report.counts.failed === 0)) process.exitCode = 1;
