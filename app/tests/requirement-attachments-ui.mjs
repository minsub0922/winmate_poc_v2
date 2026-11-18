// 고객 요구사항 popup: attachments are read (no model) into the free-form text — headings, lists, slide and sheet
// boundaries, and tables as real tables — and the old input form is folded into that text. Isolated transport fixtures.
// Real files: fixtures/requirements/*.docx|xlsx|xls (written by LibreOffice) and a PPTX made here with pptxgenjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PptxGenJS = createRequire(path.join(root, 'app/web/package.json'))('pptxgenjs');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'app/data', name + '.json')));
const fixture = name => path.join(root, 'app/tests/fixtures/requirements', name);
const out = path.join(root, 'app/tests/output/requirement-attachments'); fs.mkdirSync(out, { recursive: true });
const caps = { provider: { available: true }, functions: { requirements: { mode: 'real', ready: true, effective: 'llm' } } };
const boot = { catalog: read('catalog'), products: read('products_db'), images: read('images'), capabilities: caps, user: { username: 'attachments-ui-test', auth_enabled: false } };

async function makePptx(file) {
  const pptx = new PptxGenJS();
  let s = pptx.addSlide();
  s.addText('호텔 객실 디스플레이 교체 제안요청', { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 28, bold: true });
  s.addText([{ text: '객실 300실 TV를 2027년 3월까지 교체', options: { bullet: true } }, { text: '운영비 15% 절감 목표', options: { bullet: true, indentLevel: 1 } }], { x: 0.5, y: 1.4, w: 9, h: 2 });
  s.addNotes('예산 승인 일정(12월 이사회)을 먼저 확인한다.');
  s = pptx.addSlide();
  s.addText('구역별 수량과 예산', { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 24, bold: true });
  s.addTable([['구역', '수량', '모델 조건', '예산(만원)'], ['객실', '300', '43인치 이상 | 호텔 모드', '45,000'], ['연회장', '3', 'LED 올인원\n130인치급', '18,000']], { x: 0.5, y: 1.4, w: 9, fontSize: 12 });
  s = pptx.addSlide();
  s.addText('분기별 투숙률', { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 24, bold: true });
  s.addChart(pptx.ChartType.bar, [{ name: '2025', labels: ['1분기', '2분기'], values: [61, 72] }, { name: '2026', labels: ['1분기', '2분기'], values: [66, 75] }], { x: 0.5, y: 1.4, w: 8, h: 3.5 });
  await pptx.writeFile({ fileName: file });
}
const legacy = { id: 'legacy', title: '새 제안서', customer: '', ind: 'FB', createdAt: 1, updatedAt: 5, stage: 'story', reqTab: 'form',
  req: { free: [{ t: '매장 메뉴를 원격으로 관리하고 싶다. ' }, { ref: 'product:qm55c' }], form: { project: 'A 커피 메뉴보드 전환', customer: 'A 커피', target: '운영본부장',
    keymen: [{ id: 'k1', name: '운영본부장', weight: 60, reqs: [[{ t: '콘텐츠 변경 5분 이내 ' }, { ref: 'solution:magicinfo' }], [{ t: '매장별 품절 표시' }]] }, { id: 'k2', name: '구매팀장', weight: 40, reqs: [[{ t: '총 소유비용 15% 절감' }]] }],
    note: '단계 확산을 제안하고 싶다.' }, files: [] },
  ctx: { products: [], solutions: [], cases: ['1490'] }, parts: [],
  agent: { jobs: {}, rfpPending: { jobId: 'old', source: 'poc', choices: [{ project: 'X', customer: 'Y', target: '', keymen: [{ name: 'a', weight: 0, reqs: ['r'] }], summary: 's', note: '' }], at: 1 } } };
const other = { id: 'other', title: '이전 제안', customer: '이전 고객', ind: 'HT', createdAt: 1, updatedAt: 2, stage: 'story',
  req: { free: [{ t: '호텔 객실 TV 300대 교체.' }], form: { project: '', customer: '', target: '', keymen: [{ id: 'k', name: '총지배인', weight: 100, reqs: [[{ t: '투숙객 만족도 향상' }]] }], note: '' }, files: [] },
  ctx: { products: [], solutions: [], cases: [] }, parts: [] };

const vite = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const requests = [], errors = []; let browser;
try {
  const pptxFile = path.join(out, '호텔_제안요청.pptx'); await makePptx(pptxFile);
  await vite.listen(); browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, headless: true } : { headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/api/bootstrap') return route.fulfill({ json: boot });
    if (url.pathname === '/api/poc/capabilities') return route.fulfill({ json: caps });
    if (url.pathname === '/api/jobs' && request.method() === 'POST') { requests.push(request.postDataJSON()); return route.fulfill({ json: { id: 'job-' + requests.length, kind: 'requirements', status: 'queued', events: [], next_seq: 0 } }); }
    if (url.pathname.startsWith('/api/jobs/')) return route.fulfill({ json: { id: url.pathname.split('/').at(-1), kind: 'requirements', status: 'running', events: [], next_seq: 0 } });
    return route.fulfill({ status: 503, json: { code: 'isolated_no_other_api' } });
  });
  await context.route(url => url.pathname.startsWith('/img/'), route => route.abort());
  await context.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), route => route.abort());
  await context.addInitScript(list => { if (!localStorage.getItem('attachments-test-initialized')) { localStorage.setItem('winmate.v2.proposals', JSON.stringify(list)); localStorage.setItem('attachments-test-initialized', '1'); } }, [legacy, other]);
  const page = await context.newPage(); page.setDefaultTimeout(60000); page.on('pageerror', e => errors.push(e.message));
  const base = 'http://127.0.0.1:' + vite.httpServer.address().port;
  const popup = page.getByRole('dialog', { name: '고객 요구사항', exact: true }), editor = page.locator('#free-ed');
  const stored = id => page.evaluate(async id => (await import('/src/repositories/proposals.js')).getProposal(id), id);
  const attach = async (files, chips) => { await popup.locator('input[type=file]').setInputFiles(files); await page.waitForFunction(n => document.querySelectorAll('.fchips .fchip').length === n && !document.querySelector('.rq-f .btn-primary:disabled'), chips); };
  const removeChip = async name => {
    await popup.getByRole('button', { name: name + ' 빼기', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '첨부를 뺄까요?', exact: true }); await dialog.waitFor();
    const message = await dialog.locator('p').innerText(); await dialog.getByRole('button', { name: '빼기', exact: true }).click(); await dialog.waitFor({ state: 'detached' }); return message;
  };
  const save = async () => { await popup.getByRole('button', { name: '저장', exact: true }).click(); await editor.waitFor({ state: 'detached' }); };

  // ---- the old input form is folded into the free-form text; nothing is lost and nothing is asked
  await page.goto(base + '/storyboard/legacy'); await page.locator('.start-node .node').click(); await editor.waitFor();
  const folded = await editor.innerText();
  for (const value of ['프로젝트: A 커피 메뉴보드 전환', '고객사: A 커피', '최종 제안대상: 운영본부장', '매장 메뉴를 원격으로 관리하고 싶다.', '■ 운영본부장 (가중치 60%)', '- 콘텐츠 변경 5분 이내', '- 매장별 품절 표시', '■ 구매팀장 (가중치 40%)', '- 총 소유비용 15% 절감', '제작자 의견', '단계 확산을 제안하고 싶다.']) assert(folded.includes(value), 'form content in the draft: ' + value);
  assert.equal(await editor.locator('.mention[data-ref]').count(), 2, 'tags of the form stay tags');
  assert.equal(await popup.locator('.rq-customer').inputValue(), 'A 커피');
  assert.equal(await page.getByText(/덮어쓰시겠습니까|첨부에서 읽은 요구사항 확인/).count(), 0, 'the old RFP choice prompts are gone from the popup');
  assert.equal((await stored('legacy')).req.form.project, 'A 커피 메뉴보드 전환', 'opening the popup changes nothing');
  await save();
  let p = await stored('legacy');
  assert.deepEqual([p.title, p.customer, p.req.form.project, p.req.form.keymen.length, p.req.form.keymen[0].name, p.req.form.note], ['A 커피 메뉴보드 전환', 'A 커피', '', 1, '', '']);
  assert.deepEqual(p.ctx, { products: ['qm55c'], solutions: ['magicinfo'], cases: ['1490'] }, 'tagged 제품 · 솔루션 are linked on 저장; hand-linked items stay');
  assert.equal(p.agent.rfpPending, null);
  const once = await page.evaluate(async () => (await import('/src/services/search.js')).reqText((await import('/src/repositories/proposals.js')).getProposal('legacy')));
  for (const value of ['운영본부장 (가중치 60%)', '총 소유비용 15% 절감', '단계 확산을 제안하고 싶다.']) assert.equal(once.split(value).length - 1, 1, 'read once, not twice: ' + value);
  assert.equal(requests.length, 1, 'the first save starts the summary');
  console.log('PASS legacy form data becomes readable free-form text on open, is committed on 저장 and emptied from the form.');

  // ---- 이전 불러오기 fills the draft, not the store
  await page.locator('.start-node .node').click(); await editor.waitFor();
  await popup.getByRole('button', { name: '이전 히스토리에서 불러오기' }).click();
  const reuse = page.getByRole('dialog', { name: '이전 고객 요구사항 재사용', exact: true });
  await reuse.locator('.reuse-item').filter({ hasText: '이전 제안' }).click(); await reuse.getByRole('button', { name: '이 내역 불러오기', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#free-ed')?.innerText.includes('호텔 객실 TV 300대 교체.'));
  assert((await editor.innerText()).includes('■ 총지배인 (가중치 100%)')); assert.equal(await popup.locator('.rq-customer').inputValue(), '이전 고객');
  assert((await stored('legacy')).req.free.some(s => (s.t || '').includes('매장 메뉴를 원격으로')), 'the store keeps the saved requirements until 저장');
  await popup.getByRole('button', { name: '고객 요구사항 닫기', exact: true }).click(); await editor.waitFor({ state: 'detached' });
  console.log('PASS 이전 불러오기 loads into the draft only.');

  // ---- every main format: structure and tables survive
  await page.goto(base + '/'); await page.getByRole('button', { name: '새 제안서 시작', exact: true }).click(); await editor.waitFor();
  assert((await popup.locator('.req-drop').boundingBox()).height >= 64, 'a taller drop area');
  await editor.click(); await page.keyboard.type('직접 적은 요구사항.');
  const text = { name: '회의록.txt', mimeType: 'text/plain', buffer: Buffer.from('회의록 (2026-11-02)\n\n- 참석: 운영본부장, 구매팀장\n\n| 항목 | 담당 | 기한 |\n| --- | --- | --- |\n| 현장 조사 | 김팀장 | 11/10 |\n| 견적 제출 | 박과장 | 11/17 |\n\n후속: 본사 승인 후 발주.\n') };
  const csv = { name: '매장목록.csv', mimeType: 'text/csv', buffer: Buffer.from([0xB8, 0xC5, 0xC0, 0xE5, 0x2C, 0xBC, 0xF6, 0xB7, 0xAE, 0x0A, 0xB0, 0xAD, 0xB3, 0xB2, 0xC1, 0xA1, 0x2C, 0x36, 0x0A]) }; // CP949: 매장,수량 / 강남점,6
  const office = file => ({ name: path.basename(file), mimeType: 'application/octet-stream', buffer: fs.readFileSync(file) });
  await attach([office(pptxFile), office(fixture('rfp.docx')), office(fixture('requirements.xlsx')), office(fixture('requirements-97.xls')), text, csv], 6);
  assert.equal(await editor.locator('.me-src').count(), 6, 'a small heading per file');
  assert.equal(await editor.locator('.me-table table').count(), 9, 'tables are real tables in the editor');
  const draft = await editor.innerText();
  for (const value of ['## 슬라이드 1 · 호텔 객실 디스플레이 교체 제안요청', '- 객실 300실 TV를 2027년 3월까지 교체', '  - 운영비 15% 절감 목표', '[발표자 노트] 예산 승인 일정', '## 슬라이드 2 · 구역별 수량과 예산', '[차트]',
    '# 프랜차이즈 디지털 메뉴보드 제안요청서', '## 2. 요구사항 목록', '- 대상: 전국 직영 120개', '  - 시범 매장 10곳 우선', '1. 기술 적합성 40점', '3. 운영 지원 30점',
    '## 시트 · 요구사항', '매장 디스플레이 요구사항 목록', '※ 예산은 부가세 별도', '## 시트 · 일정', '후속: 본사 승인 후 발주.']) assert(draft.includes(value), 'kept structure: ' + value);
  const tables = await editor.locator('.me-table').evaluateAll(boxes => boxes.map(box => [...box.querySelectorAll('tr')].map(tr => [...tr.cells].map(c => c.textContent))));
  assert.deepEqual(tables[0], [['구역', '수량', '모델 조건', '예산(만원)'], ['객실', '300', '43인치 이상 | 호텔 모드', '45,000'], ['연회장', '3', 'LED 올인원\n130인치급', '18,000']], 'PPTX table');
  assert.deepEqual(tables[1], [['항목', '2025', '2026'], ['1분기', '61', '66'], ['2분기', '72', '75']], 'PPTX chart data');
  assert.deepEqual(tables[2][2], ['R-02', '매장별 품절 표시', '필수', 'POS 연동 | API 제공'], 'DOCX table');
  const sheet = [['구분', '요구사항', '수량', '예산(원)', '납기', '절감 목표'], ['메뉴보드', '55인치 3연동 | 가로형', '960', '1,250,000,000', '2026-11-30', '15%'], ['키오스크', '24인치 터치\n결제 모듈 포함', '320', '640,000,000', '2027-03-15', '8%']];
  assert.deepEqual(tables[3], sheet, 'XLSX: numbers, dates and percentages as shown in the sheet');
  assert.deepEqual(tables[5], sheet, 'XLS (Excel 97–2003) reads the same');
  assert.deepEqual(tables[7], [['항목', '담당', '기한'], ['현장 조사', '김팀장', '11/10'], ['견적 제출', '박과장', '11/17']], 'a Markdown table inside a TXT');
  assert.deepEqual(tables[8], [['매장', '수량'], ['강남점', '6']], 'CP949 CSV');
  assert.equal(requests.length, 1); assert.equal((await page.evaluate(async () => (await import('/src/repositories/proposals.js')).getProposals()[0])).req.files.length, 0, 'attaching changes the draft only');
  await editor.locator('.me-table').first().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'tables.png'), animations: 'disabled' });
  console.log('PASS PPTX · DOCX · XLSX · XLS · TXT · CSV are read into the free-form text with headings, lists and intact tables.');

  // ---- editing a cell, removing a file chip, removing a table
  assert((await removeChip('매장목록.csv')).includes('함께'));
  assert.equal(await popup.locator('.fchip').count(), 5); assert.equal(await editor.locator('.me-table').count(), 8); assert(!(await editor.innerText()).includes('강남점'), 'untouched text leaves with its file');
  const cell = editor.locator('.me-table').nth(7).locator('td').first(); await cell.click(); await page.keyboard.press('End'); await page.keyboard.type(' (수정)');
  assert((await removeChip('회의록.txt')).includes('그대로'));
  const kept = await editor.innerText();
  assert(kept.includes('현장 조사 (수정)') && kept.includes('[첨부] 회의록.txt') && kept.startsWith('직접 적은 요구사항.'), 'edited text stays when its file chip is removed');
  assert.equal(await popup.locator('.fchip').count(), 4); assert.equal(await editor.locator('.me-src').count(), 4, 'chips and headings stay consistent');
  await editor.locator('.me-table').nth(1).hover(); await editor.locator('.me-table').nth(1).locator('.me-table-x').click();
  const drop = page.getByRole('dialog', { name: '표를 뺄까요?', exact: true }); await drop.getByRole('button', { name: '빼기', exact: true }).click(); await drop.waitFor({ state: 'detached' });
  assert.equal(await editor.locator('.me-table').count(), 7);
  console.log('PASS cells are editable; a chip takes untouched text with it and leaves edited text; a table can be removed.');

  // ---- a long table stays light, an unreadable file says so, and everything is saved
  const big = { name: '큰표.csv', mimeType: 'text/csv', buffer: Buffer.from('번호,매장,수량\n' + Array.from({ length: 500 }, (_, i) => `${i + 1},매장 ${i + 1},${i % 7 + 1}`).join('\n')) };
  await attach([big, { name: '도면.hwp', mimeType: 'application/octet-stream', buffer: Buffer.from('binary') }], 6);
  const last = editor.locator('.me-table').last();
  assert.equal(await last.locator('tr').count(), 31, 'only the first rows are drawn'); assert.equal(await last.locator('.me-table-more').innerText(), '나머지 470행 펼치기');
  assert((await popup.locator('.req-file-note.bad').innerText()).includes('도면.hwp'), 'an unreadable file is named with its reason');
  await last.locator('td').nth(1).click(); await page.keyboard.type('★');
  await save();
  p = await page.evaluate(async () => (await import('/src/repositories/proposals.js')).getProposals()[0]);
  const bigSeg = p.req.free.findLast(s => s.table);
  assert.equal(bigSeg.t.trim().split('\n').length, 502, 'rows that were not drawn are saved too'); assert(/\| 1 \| [매장 1★]{5} \| 1 \|/.test(bigSeg.t) && bigSeg.t.includes('★') && bigSeg.t.includes('| 500 | 매장 500 | 3 |'), 'an edited cell and the rows that were never drawn are both saved');
  assert.equal(p.req.free.filter(s => s.table).length, 8); assert.deepEqual(p.req.files.map(f => !!f.inlined), [true, true, true, true, true, false]);
  const plain = await page.evaluate(async () => { const repo = await import('/src/repositories/proposals.js'); return { req: (await import('/src/services/search.js')).reqText(repo.getProposals()[0]), plain: repo.segPlain(repo.getProposals()[0].req.free) }; });
  for (const value of ['| 객실 | 300 | 43인치 이상 \\| 호텔 모드 | 45,000 |', '| 연회장 | 3 | LED 올인원<br>130인치급 | 18,000 |', '| R-02 | 매장별 품절 표시 | 필수 | POS 연동 \\| API 제공 |', '| 현장 조사 (수정) | 김팀장 | 11/10 |']) assert(plain.req.includes(value) && plain.plain.includes(value), 'text readers get the table rows: ' + value);
  const sent = requests.at(-1);
  assert.equal(requests.length, 2); assert.deepEqual(sent.sources.map(s => s.id), ['free'], 'inlined attachments are part of the free-form source, not sent twice');
  assert(sent.sources[0].text.includes('| 메뉴보드 | 55인치 3연동 \\| 가로형 | 960 | 1,250,000,000 | 2026-11-30 | 15% |')); assert.deepEqual(sent.missing_sources, ['도면.hwp']);
  await page.locator('.start-node .node').click(); await editor.waitFor();
  assert.equal(await editor.locator('.me-table').count(), 8); assert.equal(await popup.locator('.fchip').count(), 6);
  await editor.locator('.me-table').last().locator('.me-table-more').click(); assert.equal(await editor.locator('.me-table').last().locator('tr').count(), 501);
  console.log('PASS long tables are drawn in part but saved whole; saved requirements, reqText and the summary job carry every table as text.');
  assert.deepEqual(errors, []);
} finally { await browser?.close(); await vite.close(); }
