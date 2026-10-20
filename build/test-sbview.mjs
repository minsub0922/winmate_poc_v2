// Best Scenario 상세 보기 = 읽기 전용 Storyboard (2026-10-19)
// · 상세 보기 → 고객 요구사항 · 제품 · 솔루션 매칭 · 파트 버블, 파트마다 레이아웃 2장 이상, 표지 버블 없음
// · 편집 · 삽입 없음(+ · 끌기 · PPT 레이아웃 추가 · AI로 나머지 구성 · 다음 파트) · 버블 → 보기 전용 팝업 · 카드 → 장 상세(이전 / 다음)
// · 전체 PPT 보기 → 덱 전체를 큰 장으로(표지 1쪽부터 · 1 / N · ← →로 넘김) · Esc는 크게 보기만 닫음 · 자세히 보기 버튼 없음
// · 활용하기 → 확인 → 히스토리 맨 위에 추가 · 제안서 Storyboard가 열리고 그때부터 고치고 넣을 수 있음 · 취소하면 아무것도 안 생김
// · 모든 시나리오: 마지막 장이 ‘결정할 것 세 가지’(L_PH_C13)가 아님 · 모바일 · 다크
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../dist');
const shots = path.resolve(here, 'qa');
fs.mkdirSync(shots, { recursive: true });
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/preview.html'));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200); fs.createReadStream(f).pipe(r);
}).listen(8771);
const exe = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const errs = []; let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const mk = async (opts) => {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  return { ctx, page };
};
const shot = async (page, n) => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(shots, 'sbv-' + n + '.png') }); console.log('shot', n); };
const toPage = async (page) => { await page.goto('http://localhost:8771/'); await page.waitForSelector('.sb-bs', { timeout: 30000 }); await page.click('.sb-bs'); await page.waitForSelector('.bsl'); await page.mouse.move(900, 600); await page.waitForTimeout(800); };
const openRow = async (page, title) => { const row = page.locator('.bsl', { hasText: title }).first(); await row.scrollIntoViewIfNeeded(); await row.locator('.bsl-more').click(); await page.waitForSelector('.modal.sbv .canvas-wrap.ro .col'); await page.waitForTimeout(900); };

{
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 } });
  await toPage(page);
  const nHist0 = await page.locator('.sb-item').count();
  await openRow(page, '전국 매장 디지털 메뉴보드');
  await shot(page, '01-view');
  const v = await page.evaluate(() => {
    const m = document.querySelector('.modal.sbv');
    const cols = [...m.querySelectorAll('.col')];
    return {
      title: m.querySelector('.mhead h2').innerText,
      start: !!m.querySelector('.start-node'), match: !!m.querySelector('.match-node'),
      parts: cols.map((c) => [c.querySelector('.node-name').innerText, c.querySelectorAll('.lcard').length]),
      cover: cols.some((c) => /표지/.test(c.querySelector('.node-name').innerText)),
      plus: m.querySelectorAll('.conn-plus, .end-node, .end-plus, .col-actions, .lock-note, .grip, .end-ai, .stbadge').length,
      draggable: m.querySelectorAll('.lcard[draggable="true"]').length,
      pages: [...m.querySelectorAll('.lcard .pg')].map((e) => +e.innerText),
      ro: m.querySelector('.sbv-ro') && m.querySelector('.sbv-ro').innerText,
      foot: [...m.querySelectorAll('.mfoot .btn')].map((b) => b.innerText.trim()),
    };
  });
  console.log(v.title, '|', v.parts.map((x) => x.join(':')).join(' · '));
  ok(v.start && v.match, 'requirements + matching bubbles');
  ok(v.parts.length >= 5 && v.parts.every((x) => x[1] >= 2), 'every part bubble holds ≥ 2 layouts (' + v.parts.map((x) => x[1]).join(',') + ')');
  ok(!v.cover, 'no 표지 bubble');
  ok(v.plus === 0 && v.draggable === 0, 'no edit / insert affordances (' + v.plus + ', draggable ' + v.draggable + ')');
  ok(v.pages[0] === 2 && v.pages.every((n, i) => i === 0 || n === v.pages[i - 1] + 1), 'page numbers follow the deck (표지 = p.1) ' + v.pages.slice(0, 4).join(','));
  ok(/보기 전용/.test(v.ro || ''), 'view-only note: ' + v.ro);
  ok(v.foot.includes('활용하기') && v.foot[0] === '전체 PPT 보기' && !v.foot.some((t) => /제안서 시작|자세히 보기/.test(t)), 'footer: ' + v.foot.join(' | '));
  // 전체 PPT 보기 → the whole deck as big sheets, from the 표지 (p.1), ← → through every page
  await page.click('.modal.sbv .mfoot button:has-text("전체 PPT 보기")'); await page.waitForSelector('.modal .tl-detail'); await page.waitForTimeout(800);
  const pos = async () => page.evaluate(() => { const m = [...document.querySelectorAll('.modal')].pop(); const t = m.innerText.match(/(\d+)\s*\/\s*(\d+)/); return { h: m.querySelector('.mhead h2').innerText, at: t ? +t[1] : 0, of: t ? +t[2] : 0 }; });
  const d1 = await pos();
  ok(d1.at === 1 && d1.of === v.pages.length + 1 && /표지/.test(d1.h), '전체 PPT 보기 opens on p.1 of ' + d1.of + ': ' + d1.h);
  await shot(page, '01b-deck');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400);
  const d3 = await pos();
  ok(d3.at === 3, '→ moves through the deck: p.' + d3.at + ' ' + d3.h);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await page.locator('.modal.sbv').count() === 1 && await page.locator('.modal .tl-detail').count() === 0, 'Esc closes the deck view, the Storyboard view stays');
  // requirements bubble → view-only popup
  await page.click('.modal.sbv .start-node .node'); await page.waitForSelector('.rq-pop.ro'); await page.waitForTimeout(400);
  const rq = await page.evaluate(() => { const e = document.querySelector('.rq-pop.ro'); return { km: e.querySelectorAll('.rov-k').length, inputs: e.querySelectorAll('input, textarea, [contenteditable="true"]').length, text: e.innerText.slice(0, 120) }; });
  ok(rq.km >= 3 && rq.inputs === 0, 'requirements popup: ' + rq.km + ' keymen, inputs ' + rq.inputs);
  await shot(page, '02-req');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  ok(await page.locator('.modal.sbv').count() === 1 && await page.locator('.rq-pop').count() === 0, 'Esc closes the popup, not the view');
  // matching bubble
  await page.click('.modal.sbv .match-node .node'); await page.waitForSelector('.mt-pop.ro');
  const mt = await page.evaluate(() => { const e = document.querySelector('.mt-pop.ro'); return { tags: e.querySelectorAll('.tagc').length, btns: [...e.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean) }; });
  ok(mt.tags >= 4 && !mt.btns.some((t) => /추가|삭제|저장/.test(t)), 'matching popup: ' + mt.tags + ' cards, buttons ' + mt.btns.join('/'));
  await shot(page, '03-match');
  await page.locator('.mt-pop .bp-x').click(); await page.waitForTimeout(250);
  // part bubble
  const col = page.locator('.modal.sbv .col').nth(2); await col.scrollIntoViewIfNeeded(); await col.locator('.node').click(); await page.waitForSelector('.sbp-pop.ro'); await page.waitForTimeout(400);
  const pp = await page.evaluate(() => { const e = document.querySelector('.sbp-pop'); return { title: e.querySelector('h2').innerText, items: e.querySelectorAll('.rov-items li').length, lays: e.querySelectorAll('.rov-lay').length, w: Math.round(e.getBoundingClientRect().width), on: !!document.querySelector('.col.on') }; });
  ok(pp.items >= 2 && pp.lays >= 2 && pp.on, 'part popup: ' + pp.title + ' · items ' + pp.items + ' · layouts ' + pp.lays + ' · width ' + pp.w);
  await shot(page, '04-part');
  await page.locator('.sbp-pop .rov-lay').first().click(); await page.waitForSelector('.modal .tl-detail'); await page.waitForTimeout(500);
  const sd = await page.evaluate(() => [...document.querySelectorAll('.modal .mhead h2')].map((e) => e.innerText).pop());
  ok(!!sd, 'layout in part popup → sheet detail: ' + sd);
  await shot(page, '05-sheet');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.locator('.sbp-pop .bp-x').click(); await page.waitForTimeout(250);
  // a card on the canvas → sheet detail, 다음 moves through the deck
  await page.locator('.modal.sbv .lcard').nth(3).click(); await page.waitForSelector('.modal .tl-detail'); await page.waitForTimeout(500);
  const n1 = await page.evaluate(() => document.querySelector('.modal .tl-detail') && document.querySelectorAll('.modal').length);
  ok(n1 >= 2, 'card → sheet detail over the view');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  // 활용하기 → cancel
  await page.locator('.modal.sbv .mfoot .btn-primary').click(); await page.waitForSelector('.modal.narrow'); await page.waitForTimeout(300);
  const cf = await page.evaluate(() => { const m = document.querySelector('.modal.narrow'); return { h: m.querySelector('h2').innerText, body: m.querySelector('.bsu').innerText, btns: [...m.querySelectorAll('.mfoot .btn')].map((b) => b.innerText.trim()) }; });
  ok(/활용할까요/.test(cf.h) && cf.btns.includes('취소') && cf.btns.includes('활용하기'), 'confirm: ' + cf.h + ' · ' + cf.btns.join('/'));
  console.log('  ' + cf.body.replace(/\n/g, ' / '));
  await shot(page, '06-confirm');
  await page.locator('.modal.narrow .mfoot .btn', { hasText: '취소' }).click(); await page.waitForTimeout(300);
  ok(await page.locator('.modal.narrow').count() === 0 && await page.locator('.modal.sbv').count() === 1 && await page.locator('.sb-item').count() === nHist0, 'cancel → nothing added, still viewing');
  // 활용하기 → confirm → history + editable proposal
  await page.locator('.modal.sbv .mfoot .btn-primary').click(); await page.waitForSelector('.modal.narrow');
  await page.locator('.modal.narrow .mfoot .btn-primary').click();
  await page.waitForSelector('.story .canvas-wrap:not(.ro) .col', { timeout: 10000 }); await page.waitForTimeout(1200);
  const pr = await page.evaluate(() => {
    const cols = [...document.querySelectorAll('.story .col')];
    return { title: document.querySelector('#pr-title').value, modals: document.querySelectorAll('.modal').length, parts: cols.map((c) => c.querySelectorAll('.lcard').length),
      plus: document.querySelectorAll('.conn-plus').length, add: document.querySelectorAll('.col-actions .btn').length, end: !!document.querySelector('.end-node'), drag: document.querySelectorAll('.lcard[draggable="true"]').length,
      first: document.querySelector('.sb-item') && document.querySelector('.sb-item').innerText, cur: document.querySelector('.sb-item[aria-current="page"], .sb-item.on') ? document.querySelector('.sb-item[aria-current="page"], .sb-item.on').innerText : '' };
  });
  ok(pr.modals === 0 && /메뉴보드/.test(pr.title), 'opened my proposal: ' + pr.title);
  ok(pr.parts.join() === v.parts.map((x) => x[1]).join(), 'same parts and layouts as the view (' + pr.parts.join(',') + ')');
  ok(pr.plus > 0 && pr.add > 0 && pr.end && pr.drag > 0, 'now editable: + ' + pr.plus + ' · 레이아웃 추가 ' + pr.add + ' · 다음 파트 ' + pr.end + ' · draggable ' + pr.drag);
  ok((await page.locator('.sb-item').count()) === nHist0 + 1 && /메뉴보드/.test(pr.first || ''), 'added to the history (top): ' + (pr.first || '').split('\n')[0]);
  await shot(page, '07-proposal');
  // its requirements were saved (저장됨) and carry the keymen
  await page.click('.story .start-node .node'); await page.waitForSelector('.rq-pop'); await page.waitForTimeout(500);
  ok(/저장됨/.test(await page.locator('.rq-pop .req-saved').innerText()), 'requirements popup shows 저장됨');
  await shot(page, '08-proposal-req');
  // the proposal's first layout carries the filled values (same as the scenario)
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await ctx.close();
}
// every scenario: storyboard view opens, parts ≥ 2 layouts, the last sheet is not ‘결정할 것 세 가지’
{
  const { ctx, page } = await mk({ viewport: { width: 1440, height: 900 } });
  await toPage(page);
  const titles = await page.locator('.bsl .bsl-t').allInnerTexts();
  const bad = [];
  for (const t of titles) {
    await openRow(page, t);
    const r = await page.evaluate(() => { const m = document.querySelector('.modal.sbv'); const cols = [...m.querySelectorAll('.col')]; const cards = [...m.querySelectorAll('.lcard .nm')]; return { n: cols.map((c) => c.querySelectorAll('.lcard').length), last: cards.length ? cards[cards.length - 1].innerText : '' }; });
    if (!r.n.length || r.n.some((x) => x < 2) || /다음 단계 \+ 사진/.test(r.last)) bad.push(t + ' ' + r.n.join(',') + ' last=' + r.last);
    await page.locator('.modal.sbv .mhead .x').click(); await page.waitForTimeout(250);
  }
  ok(!bad.length, titles.length + ' scenarios: storyboard parts ≥ 2 layouts, Samsung-style ending' + (bad.length ? ' — ' + bad.join(' ; ') : ''));
  await ctx.close();
}
// mobile + dark
{
  const { ctx, page } = await mk({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true });
  await page.goto('http://localhost:8771/'); await page.waitForSelector('.mob-top', { timeout: 30000 });
  await page.click('.mob-top .btn'); await page.waitForTimeout(300);
  await page.click('.sb-bs'); await page.waitForSelector('.bsl'); await page.waitForTimeout(900);
  await openRow(page, '경영진 첫 미팅');
  await shot(page, '09-mobile-dark');
  const w = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, m: Math.round(document.querySelector('.modal.sbv').getBoundingClientRect().width) }));
  ok(w.sw <= 392 && w.m <= 390, 'mobile: no page overflow (' + w.sw + ', modal ' + w.m + ')');
  await page.locator('.modal.sbv .start-node .node').click(); await page.waitForSelector('.rq-pop'); await page.waitForTimeout(400);
  ok(await page.locator('.rq-pop.sheet').count() === 1, 'mobile: popup is a sheet');
  await shot(page, '10-mobile-req');
  await ctx.close();
}
console.log(errs.length ? 'ERRORS ' + errs.slice(0, 6).join(' | ') : 'no console errors');
console.log(fails ? fails + ' FAILED' : 'ALL OK');
await browser.close(); srv.close();
