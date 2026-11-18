// 「레이아웃 구성 관리」 '전체 파트 확인하기' 팝업 — 격리 서버(별도 WINMATE_ADMIN_DATA · WINMATE_AUTH_DIR · WINMATE_LAYOUT_PRESETS)에서 실행한다.
//   WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8799 WINMATE_ADMIN_TEST_PASSWORD=… [CHROME=…] node admin/tests/layout-parts-ui.mjs
// 읽기만 한다(운영 값을 저장하지 않는다). 모델은 부르지 않는다.
//   ① '추천 구성' 위 버튼 → 팝업 ② 파트마다 카드 · 장 3열 ③ 흐름 표시: Why Samsung 완전 고정 · 3 Value Props 순서 고정(니즈 → 핵심 제안 1 · 2 · 3) ·
//   공간별 제안 '제품 수에 따라' 시트 4종(제품 1 · 2 · 3 · 4개 장) + 나눔 표 ④ 장에 마우스를 대면 상세 ⑤ 거르기 ⑥ 누르면 크게 보기 · Esc 는 크게 보기만 닫는다
//   파트 목록 정의(2026-11-16): 뺀 목차 13 · 'AI {업종}' → '3 Value Props' · 사례 장 수 제한 없음 · 구독 한 파트(고민 → … → 결제, 케어 2 · 구독 조건 · 결제는 숫자 00)
//   한 카드 안에서 같은 사진을 두 번 쓰지 않는다(예시 미리보기라도)
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8799';
const password = process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!';
const out = path.resolve(process.env.WINMATE_ADMIN_TEST_OUT || 'admin/runtime/evidence/layout-parts'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const results = [], errors = [];
const step = async (name, run) => { try { await run(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name + ' — ' + String(e.message).split('\n')[0]]); } };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password } });
  assert.equal(login.status(), 200, await login.text());
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/admin/layouts');
  await page.locator('.lp-row').first().waitFor({ timeout: 30000 });
  const dialog = page.getByRole('dialog', { name: '전체 파트' });
  const card = key => dialog.locator(`.lpx-card[data-part="${key}"]`);
  const layouts = key => card(key).locator('.lpx-sheet').evaluateAll(els => els.map(e => e.dataset.layout));
  const away = async () => { await page.mouse.move(5, 995); await page.waitForTimeout(250); };
  // 2026-11-17: 구독 상품 제안은 서비스 제안의 갈래로(목록에서 빠짐) · 공간별 제안 → 제품 제안 · 서비스 → 서비스 제안
  const KEYS = ['overview', 'ua', 'needs', 'space', 'value', 'sol', 'pspec', 'svc', 'case', 'why']; // svc: 서비스(2026-11-16) // 기승전결 순서(admin/web/src/part-arc.js) — 기 2 · 승 5 · 전 3 · 결 1 // 유관사례(pcase)는 쓰는 구성이 없어 목록에서 빠졌다 — 제품 제안서 = 표준 제안서에서 Overview · 업종 솔루션 · 도입사례만 뺀 것(2026-11-16)

  await step('추천 구성 위에 「전체 파트 확인하기」 → 팝업 · 파트 10종 카드(뺀 목차 13개는 목록에도 구성에도 없다 · 구독 상품 제안은 서비스 제안 안으로)', async () => {
    const button = page.getByRole('button', { name: '전체 파트 확인하기' });
    const heading = page.getByRole('heading', { name: /^추천 구성/ });
    const [b, h] = [await button.boundingBox(), await heading.boundingBox()];
    assert.ok(b.y + b.height <= h.y, '버튼이 추천 구성 제목 위에 있다');
    assert.match(await page.locator('.lpx-open p').innerText(), /파트 10종/);
    await button.click();
    await dialog.locator('.lpx-card').first().waitFor({ timeout: 60000 });
    const keys = await dialog.locator('.lpx-card').evaluateAll(els => els.map(e => e.dataset.part));
    assert.deepEqual(keys, KEYS);
    const titles = await dialog.locator('.lpx-card .lpx-title h4').evaluateAll(els => els.map(e => e.firstChild.textContent));
    for (const gone of ['제안 요약', '기대 효과', '파일럿 · 확산', '실행 계획', '요구사항 대응', '제품 사양', '구성 · 수량', 'Value Props', 'Value Prop 상세', 'B2B 삼성 AI 구독 요약', '구독 솔루션 제안', '업종 핵심 기술', '비용 · 구매']) assert.ok(!titles.includes(gone), gone);
    assert.equal(await dialog.locator('.lpx-card .lpx-node svg').count(), KEYS.length); // 파트 버블
    // 목록에서 뺀 목차 중 구성이 아직 쓰는 것은 구독 상품 제안 하나(구독 제안서 · 표준 + 구독 — 추천에서 꺼 둔 구성)
    assert.match(await dialog.locator('.modal-footer').innerText(), /목록에서 뺀 목차 1개/);
    assert.deepEqual(await dialog.locator('.lpx-title h4').evaluateAll(els => els.map(e => e.firstChild.textContent)).then(t => [t[3], t[7]]), ['제품 제안', '서비스 제안']);
  });

  await step('장은 3열 — 카드 안에 그 파트의 장 전체', async () => {
    const cols = await card('why').locator('.lpx-sheets').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(cols, 3);
    const tops = await card('why').locator('.lpx-sheet').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    assert.equal(tops.length, 7);
    assert.equal(new Set(tops.slice(0, 3)).size, 1); assert.ok(tops[3] > tops[0]); // 한 줄에 셋
  });

  await step('Why Samsung — 완전 고정 · 7장 순서 그대로', async () => {
    assert.equal(await card('why').getAttribute('data-kind'), 'fixed');
    assert.match(await card('why').locator('.lpx-kind').innerText(), /완전 고정/);
    assert.deepEqual(await layouts('why'), ['L_VS_DIV_R5', 'L_VS_WHY_1', 'L_VS_WHY_2', 'L_VS_WHY_3', 'L_VS_WHY_4', 'L_VS_WHY_5', 'L_VS_END']);
    assert.deepEqual(await card('why').locator('.lpx-step').allInnerTexts(), ['01', '02', '03', '04', '05', '06', '07']);
    assert.equal(await card('why').locator('.lpx-step.fixed').count(), 7);
    assert.equal(await dialog.locator('.lpx-note').count(), 0); // 카드에 흐름을 풀어 쓴 설명 줄은 두지 않는다(사용자 지시 2026-11-16) — 표식 · 순서 줄 · 장 표시로만 보인다
  });

  await step("가치 제안 (VP)('AI {업종}'의 목록 이름) — 순서 고정: 니즈 → 핵심 제안 1 → 2 → 3", async () => {
    assert.equal(await card('needs').locator('.lpx-title h4').evaluate(e => e.firstChild.textContent), '가치 제안 (VP)');
    assert.equal(await dialog.locator('.lpx-title h4', { hasText: 'AI 업종' }).count(), 0);
    assert.equal(await card('needs').getAttribute('data-kind'), 'flow');
    assert.match(await card('needs').locator('.lpx-kind').innerText(), /^순서 고정$/);
    assert.deepEqual(await layouts('needs'), ['L_VS_DIV_R4', 'L_VS_NEEDS', 'L_VS_CORE_1', 'L_VS_CORE_2', 'L_VS_CORE_3']);
    assert.equal(await card('needs').locator('.lpx-seq li').count(), 5);
  });

  // 사용자 지시(2026-11-16): 제품 3개 이하 한 장에 제품 하나 · 4개 2/2 · 5개 3/2 · 6개 3/3 · 7개 4/3 · 8개 4/4 · 그 이상은 조감도부터 다시.
  //   제품 1개 장 = key message · 특징 2 · 연관 스펙('대표 제품'은 제품 이름 오른쪽) / 2개 장 = 공간 사진 위 제품 컷 · 특징 2 · 스펙(key message 없음) /
  //   3 · 4개 장 = 공간 사진 위 제품 컷 · 특징 2까지만. 팝업은 라우팅과 상관없이 시트 4종을 모두 보여 준다.
  await step('공간별 제안 — 제품 수에 따라 「공간별 대표 제품」 시트 4종을 골라 쓰고, 목록에는 모두 보인다', async () => {
    const c = card('space');
    assert.equal(await c.getAttribute('data-kind'), 'repeat');
    assert.match(await c.locator('.lpx-kind').innerText(), /장 수만 달라짐/);
    assert.match(await c.locator('.lpx-title h4').innerText(), /실제 덱 반영 전/);
    assert.deepEqual((await layouts('space')).map(f => f.replace(/^L_VS_DIV_R\d$/, 'L_VS_DIV').replace(/^L_VS_BIRD_[SB]\d+$/, 'L_VS_BIRD').replace(/^L_VS_MAP_\d+$/, 'L_VS_MAP')),
      ['L_VS_DIV', 'L_VS_BIRD', 'L_VS_SPACE_1', 'L_VS_SPACE_2', 'L_VS_SPACE_3', 'L_VS_SPACE_4', ...Array(7).fill('L_VS_MAP')]);
    assert.equal(await c.locator('.lpx-routed').count(), 2); // 공간별 대표 제품 · 업종 Map
    const group = c.locator('.lpx-routed[data-layout="L_VS_SPACE"]');
    assert.equal(await group.count(), 1);
    assert.equal(await group.locator('.lpx-routed-h span:not(.lpx-routed-step)').count(), 0); // 풀어 쓴 설명 문장은 두지 않는다
    assert.equal(await group.getAttribute('data-step'), '3');
    assert.deepEqual(await group.locator('.lpx-variant').evaluateAll(els => els.map(e => e.dataset.per)), ['1', '2', '3', '4']);
    assert.deepEqual(await group.locator('.lpx-variant .lpx-step').allInnerTexts(), ['03', '03', '03', '03']); // 넷 다 같은 자리
    await group.scrollIntoViewIfNeeded();
    const tops = await group.locator('.lpx-variant').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().top)));
    assert.equal(new Set(tops).size, 1, '시트 4종이 한 줄');
    // 나눔 표 — 제품 수 → 장 나눔
    const cells = await group.locator('.lpx-route-c').evaluateAll(els => els.map(e => e.dataset.n + ':' + e.querySelector('i').textContent));
    assert.deepEqual(cells, ['1:1', '2:1/1', '3:1/1/1', '4:2/2', '5:3/2', '6:3/3', '7:4/3', '8:4/4', '9:3/2 + 2/2', '10:3/2 + 3/2']);
    assert.equal(await group.locator('.lpx-route-c.split').count(), 2);
    assert.match(await group.locator('.lpx-route-more').innerText(), /9개부터는 조감도도 나눠 다시 시작/);
    assert.match((await c.locator('.lpx-seq').innerText()).replace(/\s+/g, ' '), /공간별 대표 제품 제품 수에 따라 · 시트 4종/);
    assert.match(await c.locator('.lpx-meta').innerText(), /장 5–9/);
    assert.match(await c.locator('.lpx-sheet[data-layout^="L_VS_BIRD"] .lpx-cap small').innerText(), /8개를 넘으면 묶음마다 1장/);
    const caps = await group.locator('.lpx-variant .lpx-cap').allInnerTexts();
    assert.match(caps[0], /제품 1개 장[\s\S]*제품 3개 이하 — 제품마다 한 장[\s\S]*key message · 특징 2 · 주요 스펙 4/);
    assert.match(caps[1], /제품 2개 장[\s\S]*제품 4개\(2\/2\) · 5개\(3\/2\)[\s\S]*특징 2 · 스펙 3[\s\S]*key message 없음/);
    assert.match(caps[2], /제품 3개 장[\s\S]*5개\(3\/2\) · 6개\(3\/3\) · 7개\(4\/3\)[\s\S]*특징 2까지만/);
    assert.match(caps[3], /제품 4개 장[\s\S]*7개\(4\/3\) · 8개\(4\/4\)[\s\S]*특징 2까지만/);
    // 시트 안 — 칸 수 · 제품 컷이 공간 사진 위에 겹치는가 · '대표 제품'이 제품 이름 오른쪽인가
    const inside = async per => {
      const frame = group.locator(`.lpx-variant[data-per="${per}"]`).frameLocator('iframe');
      await frame.locator('body').waitFor({ timeout: 30000 });
      return frame.locator('body').evaluate(body => {
        const box = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; };
        const img = i => body.querySelector(`[data-img="${i}"]`);
        const n = body.querySelectorAll('[data-img]').length;
        const overlaid = []; // 제품 컷(짝수 칸)이 공간 사진(홀수 칸) 안에 있는가
        for (let k = 0; k < n; k += 2) { const a = box(img(k)), b = box(img(k + 1)); overlaid.push(a.x >= b.x && a.r <= b.r && a.y >= b.y && a.b <= b.b); }
        const tb = i => body.querySelector(`[data-tb="${i}"]`);
        return { texts: body.querySelectorAll('[data-tb]').length, images: n, overlaid, text: body.innerText.replace(/\s+/g, ' '),
          photos: [...body.querySelectorAll('img')].filter(e => /object-fit:\s*cover/.test(e.getAttribute('style') || '')).map(e => e.getAttribute('src').slice(-48)),
          label: tb(3) && tb(4) ? { label: tb(3).textContent, right: box(tb(3)).x > box(tb(4)).x, sameLine: box(tb(3)).y < box(tb(4)).b && box(tb(3)).b > box(tb(4)).y } : null };
      });
    };
    const [s1, s2, s3, s4] = [await inside(1), await inside(2), await inside(3), await inside(4)];
    assert.deepEqual([s1.texts, s1.images], [21, 2]); // 장 표식 · 공간 · key message · '대표 제품' · 제품 이름 · 특징 2(4) · 꼬리말 3 · '주요 스펙' + 스펙 4(8)
    assert.deepEqual(s1.label, { label: '대표 제품', right: true, sameLine: true });
    assert.match(s1.text, /주요 스펙/);
    assert.deepEqual(s1.overlaid, [false]); // 제품 1개 장은 공간 사진 옆에 제품 컷
    assert.deepEqual([s2.texts, s2.images, s2.overlaid], [29, 4, [true, true]]); // 제품마다 공간 · 이름 · 특징 2(4) · 스펙 3(6)
    assert.deepEqual([s3.texts, s3.images, s3.overlaid], [23, 6, [true, true, true]]); // 제품마다 공간 · 이름 · 특징 2(4) — 스펙 없음
    assert.deepEqual([s4.texts, s4.images, s4.overlaid], [29, 8, [true, true, true, true]]);
    for (const x of [s2, s3, s4]) assert.doesNotMatch(x.text, /주요 스펙/);
    // 예시지만 같은 사진을 두 번 쓰지 않는다 — 시트 4종의 공간 사진 10장이 모두 다르다
    const photos = [...s1.photos, ...s2.photos, ...s3.photos, ...s4.photos];
    assert.equal(photos.length, 10); assert.equal(new Set(photos).size, 10);
    await away();
    await c.locator('header').evaluate(h => h.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'space-routed.png') });
    assert.match(await card('sol').locator('.lpx-sheet.repeat .lpx-cap small').innerText(), /솔루션 수만큼/);
  });

  // 사용자 지시(2026-11-16): 업종 Map 도 공간 수에 따라 — 같은 시트를 상황에 따라 골라 쓴다. 공간 2곳부터만 다루고 2곳에서 최대 8곳까지.
  await step('공간별 제안 — 업종 Map: 공간 2~8곳 시트 7종을 공간 수에 맞춰 골라 쓰고, 목록에는 모두 보인다', async () => {
    const c = card('space');
    const group = c.locator('.lpx-routed[data-layout="L_VS_MAP"]');
    assert.equal(await group.count(), 1);
    assert.equal(await group.getAttribute('data-step'), '4');
    assert.match((await group.locator('.lpx-routed-h').innerText()).replace(/\s+/g, ' '), /^04 업종 Map 시트 7종$/);
    assert.deepEqual(await group.locator('.lpx-variant').evaluateAll(els => els.map(e => [e.dataset.layout, e.dataset.per])), [2, 3, 4, 5, 6, 7, 8].map(n => ['L_VS_MAP_' + n, String(n)]));
    assert.deepEqual(await group.locator('.lpx-variant .lpx-per').allInnerTexts(), ['공간 2곳', '공간 3곳', '공간 4곳', '공간 5곳', '공간 6곳', '공간 7곳', '공간 8곳']);
    assert.deepEqual([...new Set(await group.locator('.lpx-variant .lpx-step').allInnerTexts())], ['04']); // 일곱 다 같은 자리
    // 공간 수 → Map 시트 표 — 1곳은 없음, 9곳부터 묶음마다 한 장
    const cells = await group.locator('.lpx-route-c').evaluateAll(els => els.map(e => e.dataset.n + ':' + e.querySelector('i').textContent));
    assert.deepEqual(cells, ['1:없음', '2:2', '3:3', '4:4', '5:3/2', '6:3/3', '7:4/3', '8:4/4', '9:3/2 + 4', '10:3/2 + 3/2']);
    assert.deepEqual(await group.locator('.lpx-route-c.none').evaluateAll(els => els.map(e => e.dataset.n)), ['1']);
    assert.deepEqual(await group.locator('.lpx-route-c.split').evaluateAll(els => els.map(e => e.dataset.n)), ['9', '10']);
    assert.match(await group.locator('.lpx-route-h').innerText(), /공간 수 → Map 시트/);
    assert.match(await group.locator('.lpx-route-more').innerText(), /9곳부터는 조감도 묶음마다 한 장 · 1곳은 Map 없음/);
    assert.match((await c.locator('.lpx-seq').innerText()).replace(/\s+/g, ' '), /업종 Map 공간 수에 따라 · 시트 7종/);
    const caps = await group.locator('.lpx-variant .lpx-cap').allInnerTexts();
    assert.match(caps[0], /공간 2곳[\s\S]*한 줄 2칸 — 칸마다 제품 카드 최대 9개/); assert.match(caps[2], /공간 4곳[\s\S]*한 줄 4칸[\s\S]*하는 일/);
    assert.match(caps[3], /공간 5곳[\s\S]*두 줄 3 \+ 2칸 — 칸마다 제품 카드 최대 6–9개/); assert.match(caps[6], /공간 8곳[\s\S]*두 줄 4 \+ 4칸 — 칸마다 제품 카드 최대 4개/);
    // 시트 안 — 공간 칸 수 = 공간 수(4곳 이하는 한 줄 · 5곳부터 두 줄), 공간마다 제품 카드가 제품 수만큼(사용자 지시 2026-11-16:
    //   "각 공간에 하나 이상의 제품 … 동적으로 여러 개 … 그에 따라 각 제품 카드 사이즈와 배치가 달라질 거야"). 기대값은 같은 예시 자료로 같은 모듈이 조립한 장
    const { spaceMapSheet } = await import('../../app/web/src/domain/templates/space_map_sheet.js');
    const examples = JSON.parse(fs.readFileSync(new URL('../web/src/space-sheets.json', import.meta.url), 'utf8')).maps;
    assert.deepEqual(examples.map(x => x.n), [2, 3, 4, 5, 6, 7, 8]);
    const sizes = new Set(); let chips = 0;
    for (const [n, rows] of [[2, [2]], [3, [3]], [4, [4]], [5, [3, 2]], [6, [3, 3]], [7, [4, 3]], [8, [4, 4]]]) {
      const ex = examples.find(x => x.n === n);
      const want = spaceMapSheet({ title: ex.title, foot: ex.foot, page: ex.page, spaces: ex.spaces.map(sp => ({ name: sp.name, note: sp.note, products: sp.products.map(x => ({ name: x.name, src: 'x' })) })) });
      const tile = group.locator(`.lpx-variant[data-per="${n}"]`); await tile.scrollIntoViewIfNeeded();
      const frame = tile.frameLocator('iframe'); await frame.locator('body').waitFor({ timeout: 30000 });
      const got = await frame.locator('body').evaluate(body => {
        const box = e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: r.right, b: r.bottom }; };
        const circles = [...body.querySelectorAll('[data-layout-shape="circle"]')].map(box);
        const lines = [...new Set(circles.map(c => c.y))].sort((a, b) => a - b).map(y => circles.filter(c => c.y === y).length);
        const imgs = [...body.querySelectorAll('[data-img]')];
        const texts = [...body.querySelectorAll('[data-tb]')];
        return { spaces: circles.length, lines, cards: imgs.map(box), texts: texts.map(e => e.textContent),
          filled: imgs.every(e => (e.querySelector('img').getAttribute('src') || '').startsWith('data:image/')),
          covers: [...body.querySelectorAll('img')].filter(e => !/object-fit:\s*contain/.test(e.getAttribute('style') || '')).length,
          out: texts.concat(imgs).filter(e => { const r = e.getBoundingClientRect(); return r.right > 1217 || r.bottom > 702 || r.left < 63; }).length };
      });
      assert.deepEqual([got.spaces, got.lines], [n, rows], 'Map ' + n);
      // 공간마다 제품 카드 — 칸마다 놓은 수 · 카드 크기가 조립한 장 그대로
      assert.equal(got.cards.length, want.nI, 'Map ' + n + ' 제품 카드 수');
      assert.deepEqual(got.cards.length, want.cells.reduce((a, c) => a + c.shown, 0));
      let at = 0;
      for (const c of want.cells) {
        const mine = got.cards.slice(at, at + c.shown); at += c.shown;
        for (const r of mine) { assert.ok(Math.abs(r.w - c.layout.w) <= 1, `Map ${n} 카드 너비 ${r.w} / ${c.layout.w}`); sizes.add(c.layout.w + 'x' + c.layout.h); }
        if (c.more) { chips += 1; assert.ok(got.texts.includes(`외 ${c.more}종`), `Map ${n} — 외 ${c.more}종`); }
      }
      // 같은 장 안에서도 제품 수가 다른 칸은 카드 크기가 다르다
      const per = want.cells.map(c => [c.shown + c.more, c.layout.w * c.layout.h]);
      const few = per.reduce((a, b) => (b[0] < a[0] ? b : a)); const many = per.reduce((a, b) => (b[0] > a[0] ? b : a));
      if (few[0] < many[0]) assert.ok(few[1] > many[1], `Map ${n} — 제품이 적은 칸의 카드가 더 크다 (${few} / ${many})`);
      assert.equal(got.filled, true, 'Map ' + n + ' — 제품 컷이 모두 채워져 있다');
      assert.equal(got.covers, 0); // 제품 컷뿐(contain) — 같은 사진 두 번 금지 규칙에 걸리는 사진이 없다
      assert.equal(got.out, 0, 'Map ' + n + ' — 글 · 카드가 장 밖으로 나가지 않는다');
      assert.match(got.texts[1], / Map$/); assert.match(got.texts[2], new RegExp('^' + n + '개 공간'));
      for (const sp of ex.spaces) assert.ok(got.texts.includes(sp.name), sp.name);
    }
    assert.ok(sizes.size >= 8, '카드 크기가 여러 가지: ' + [...sizes].join(' '));
    assert.ok(chips >= 3, "넘치는 칸은 '외 N종': " + chips);
    // 상세 — 쓰는 때 · 한 장에 담는 것 · 실제 덱과의 사이(2곳 시트만 새로 생긴다), 표에서 그 공간 수가 켜진다
    const pop = page.locator('#lpx-pop');
    const five = group.locator('.lpx-variant[data-per="5"] button');
    await five.scrollIntoViewIfNeeded(); await five.hover();
    await pop.waitFor({ state: 'visible' });
    let detail = (await pop.innerText()).replace(/\s+/g, ' ');
    for (const w of ['업종 Map · 공간 5곳', '4번째 / 4칸', '쓰는 때 공간 5곳일 때', '한 장에 공간 5곳 — 두 줄 3 + 2칸 — 칸마다 제품 카드 최대 6–9개', "제품 카드 제품 수에 따라 크기 · 배치가 달라짐 — 칸마다 최대 6–9개, 넘치면 '외 N종'", '실제 덱 반영 전 — 지금 덱은 공간마다 대표 제품 컷 하나 + 제품 목록 글']) assert.ok(detail.includes(w), w + ' — ' + detail);
    assert.deepEqual(await group.locator('.lpx-route-c.on').evaluateAll(els => els.map(e => e.dataset.n)), ['5']);
    await away(); await pop.waitFor({ state: 'detached' });
    const two = group.locator('.lpx-variant[data-per="2"] button');
    await two.scrollIntoViewIfNeeded(); await two.hover();
    await pop.waitFor({ state: 'visible' });
    detail = (await pop.innerText()).replace(/\s+/g, ' ');
    assert.match(detail, /한 장에 공간 2곳 — 한 줄 2칸 — 칸마다 제품 카드 최대 9개 · 하는 일/);
    await away(); await pop.waitFor({ state: 'detached' });
    await two.click();
    const big = page.getByRole('dialog', { name: '업종 Map · 공간 2곳 장표 미리보기' });
    await big.waitFor();
    await big.locator('.lp-zoom-stage iframe').waitFor({ timeout: 30000 });
    assert.match(await big.locator('header p').innerText(), /VS-MAP-2 · .*공간 2곳 · 실제 덱 반영 전/);
    await page.keyboard.press('Escape'); await big.waitFor({ state: 'detached' });
    await group.locator('.lpx-variant[data-per="6"] button').click();
    const six = page.getByRole('dialog', { name: '업종 Map · 공간 6곳 장표 미리보기' });
    await six.waitFor();
    assert.match(await six.locator('header p').innerText(), /VS-MAP-6 · .*공간 6곳 · 실제 덱 반영 전/); // 제품 카드가 여럿인 Map 은 모두 새 장
    await page.keyboard.press('Escape'); await six.waitFor({ state: 'detached' });
    assert.equal(await dialog.isVisible(), true);
    await away();
    await group.evaluate(g => g.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'space-map.png') });
  });

  await step('유관 사례(도입사례의 목록 이름) — 사례 장 수를 한정하지 않는다', async () => {
    for (const k of ['case']) {
      assert.equal(await card(k).getAttribute('data-kind'), 'repeat', k);
      const rep = card(k).locator('.lpx-sheet.repeat');
      assert.equal(await rep.getAttribute('data-layout'), 'L_VS_CASE');
      assert.match(await rep.locator('.lpx-times').innerText(), /× 사례 수/);
      assert.match(await rep.locator('.lpx-cap small').innerText(), /사례 수만큼 · 장 수 제한 없음/);
      assert.doesNotMatch(await card(k).innerText(), /늘 2장|× 2/);
      assert.match(await card(k).locator('.lpx-meta').innerText(), /장 2\+/);
    }
  });

  await step('서비스 제안(2026-11-17) — 고른 서비스에 따라 갈래: 삼성케어플러스 SAC · 비즈니스 · 구독 상품(고민 → 효과 → 비교 → 제품 묶음 → 케어 1 → 케어 2 → 구독 조건 → 결제 · 숫자 00)', async () => {
    const c = card('svc');
    assert.equal(await c.locator('.lpx-title h4').evaluate(e => e.firstChild.textContent), '서비스 제안');
    assert.equal(await c.getAttribute('data-kind'), 'branch');
    assert.match(await c.locator('.lpx-kind').innerText(), /고른 서비스에 따라/);
    assert.deepEqual((await layouts('svc')).map(f => f.replace(/^L_VS_DIV_R\d$/, 'L_VS_DIV').replace(/^L_SUB_PKG\d$/, 'L_SUB_PKG')),
      ['L_VS_DIV', 'L_TOC_SVC_SAC', 'L_TOC_SVC_MOBILE', 'L_SUB_PAIN', 'L_SUB_VALUE3', 'L_SUB_COMPARE', 'L_SUB_PKG', 'L_SUB_CARE4', 'L_SUB_BLUEPASS', 'L_SUB_TERMS', 'L_SUB_PAY3']);
    assert.deepEqual(await c.locator('.lpx-cap b').allInnerTexts(), ['간지', '삼성케어플러스 SAC', '삼성케어플러스 비즈니스', '고민', '효과', '비교', '제품 묶음', '케어 1', '케어 2', '구독 조건', '결제']);
    assert.deepEqual(await c.locator('.lpx-sheet .lpx-step').allInnerTexts(), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);
    // 갈래 머리 — 갈래의 첫 장 앞에 이름 · 무엇을 고르면 · 장 수
    assert.deepEqual(await c.locator('.lpx-branch-h').evaluateAll(els => els.map(e => e.dataset.branch)), ['sac', 'mobile', 'sub']);
    assert.deepEqual((await c.locator('.lpx-branch-h').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim()),
      ['케어 서비스 + 공조 제품 고르면 삼성케어플러스 SAC 1장', '케어 서비스 + 갤럭시 모바일 고르면 삼성케어플러스 비즈니스 1장', '구독 고르면 구독 상품 제안 8장']);
    const order = await c.locator('.lpx-sheets > li').evaluateAll(els => els.map(e => e.dataset.branch ? 'h:' + e.dataset.branch : e.dataset.layout));
    assert.deepEqual(order.slice(0, 5).map(x => x.replace(/^L_VS_DIV_R\d$/, 'L_VS_DIV')), ['L_VS_DIV', 'h:sac', 'L_TOC_SVC_SAC', 'h:mobile', 'L_TOC_SVC_MOBILE']);
    assert.equal(order[5], 'h:sub');
    assert.equal(await c.locator('.lpx-zero').count(), 3); // 케어 2 · 구독 조건 · 결제
    assert.doesNotMatch(await c.locator('.lpx-title h4').innerText(), /실제 덱 반영 전/); // 실제 덱도 이 갈래로 조립한다(toc_templates.js B.svc)
    const terms = c.locator('.lpx-sheet[data-layout="L_SUB_TERMS"]');
    await terms.scrollIntoViewIfNeeded();
    const frame = terms.frameLocator('iframe');
    await frame.locator('body').waitFor({ timeout: 30000 });
    const text = (await frame.locator('body').innerText()).replace(/\s+/g, ' ');
    assert.doesNotMatch(text, /3~6|6·12·36/, text);
    assert.ok((text.match(/\b00\b/g) || []).length >= 3, text);
    assert.match(text, /B2B/);
    assert.match(text, /^03 · /); // 장 번호 눈썹
    assert.match(text, / \d{1,3}$/); assert.doesNotMatch(text, / 00$/, '꼬리말 쪽 번호는 그대로'); // 미리보기 꼬리말은 쪽 번호만 보인다
    const pay = (await c.locator('.lpx-sheet[data-layout="L_SUB_PAY3"]').frameLocator('iframe').locator('body').innerText()).replace(/\s+/g, ' ');
    assert.doesNotMatch(pay, /3~6/, pay);
    assert.match(pay, / 01 협의안/); assert.match(pay, / 03 협의안/); // 차례 번호는 그대로
    assert.doesNotMatch(pay, / 00$/, '꼬리말 쪽 번호는 그대로');
    // 케어 2(B2B 블루패스) — 숫자 00 (6년 · 48시간 · +1 → 00), B2B 는 그대로
    const care2 = c.locator('.lpx-sheet[data-layout="L_SUB_BLUEPASS"]');
    await care2.scrollIntoViewIfNeeded();
    const blue = (await care2.frameLocator('iframe').locator('body').innerText()).replace(/\s+/g, ' ');
    assert.doesNotMatch(blue, /(^|[^\d])(48|24|6)\s*(시간|년|일)/, blue);
    assert.ok((blue.match(/\b00\b/g) || []).length >= 3, blue);
    assert.match(blue, /B2B/); assert.doesNotMatch(blue, / 00$/, '꼬리말 쪽 번호는 그대로');
    await away();
    await c.locator('header').evaluate(h => h.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'service.png') });
    await terms.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(out, 'service-terms.png') });
    for (const k of ['subs', 'subpkg', 'subcare', 'subterm', 'subone', 'subsol', 'subscription']) assert.equal(await card(k).count(), 0, k);
  });

  // 사용자 지시(2026-11-17): 상세 제안에는 고객/공간 시나리오 — 공간마다 제품이 놓이고 솔루션 · 서비스는 여러 공간이 함께 쓴다. 경우마다 시트를 미리 그려 두고 공간 구성으로 고른다
  await step('고객/공간 시나리오 — 간지 → 조감도 → 활용 맵(공간 2–10곳 시트) → 공간별 시나리오(공간 3곳 · 2곳 시트) · 표 · 실제 덱도 이 장', async () => {
    const c = card('value');
    assert.equal(await c.locator('.lpx-title h4').evaluate(e => e.firstChild.textContent), '고객/공간 시나리오');
    assert.doesNotMatch(await c.locator('.lpx-title h4').innerText(), /실제 덱 반영 전/);
    const groups = c.locator('.lpx-routed');
    assert.deepEqual(await groups.evaluateAll(els => els.map(e => e.dataset.layout)), ['L_TOC_SCN_MAP', 'L_TOC_SCN_S']);
    assert.deepEqual(await groups.nth(0).locator('.lpx-variant').evaluateAll(els => els.map(e => e.dataset.layout)), [2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => 'L_TOC_SCN_MAP' + n));
    assert.deepEqual(await groups.nth(1).locator('.lpx-variant').evaluateAll(els => els.map(e => e.dataset.layout)), ['L_TOC_SCN_S3', 'L_TOC_SCN_S2']);
    assert.match(await groups.nth(0).locator('.lpx-route-h').innerText(), /공간 수 → 활용 맵/);
    assert.match(await groups.nth(1).locator('.lpx-route-h').innerText(), /공간 수 → 공간별 시나리오 장/);
    // 미리보기 — 서버 레이아웃 미리보기(라이브러리에 있는 장)
    const v3 = groups.nth(1).locator('.lpx-variant[data-layout="L_TOC_SCN_S3"]');
    await v3.scrollIntoViewIfNeeded();
    const body = v3.frameLocator('iframe').locator('body');
    await body.waitFor({ timeout: 30000 });
    // 3차 지시(2026-11-17): 솔루션 / 서비스 구분 없음 · 어느 공간에서 쓰는지 표시 없음 · 기능 아이콘 아래 기능 이름
    const text = (await body.innerText()).replace(/\s+/g, ' ');
    assert.match(text, /VXT CMS.*메뉴보드/); assert.doesNotMatch(text, /공간 \d · \d/);
    await v3.locator('button').hover();
    const pop = page.locator('#lpx-pop'); await pop.waitFor({ state: 'visible' });
    assert.match((await pop.innerText()).replace(/\s+/g, ' '), /공간 사진 3 \+ 제품 컷 · 이름 겹쳐 보기/);
    await away();
    await c.locator('header').evaluate(h => h.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, 'scenario.png') });
  });

  // 사용자 지시(2026-11-16): 제품 스펙은 제품마다 사양 줄 수가 다르다 → 대응 · 장 수는 제품 수만큼 · 위쪽 대표 스펙 3칸은 없앤다
  await step('제품 스펙(Spec 의 목록 이름) — 간지 → 제품 스펙 × 제품 수 · 사양 줄 수에 맞춘 시트 3종(1열 · 2열 · 2열 촘촘) · 대표 스펙 3칸 없음', async () => {
    const c = card('pspec');
    await c.scrollIntoViewIfNeeded();
    assert.equal(await c.getAttribute('data-kind'), 'repeat');
    assert.match(await c.locator('.lpx-kind').innerText(), /장 수만 달라짐/);
    assert.match(await c.locator('.lpx-meta').innerText(), /장 2\+/);
    assert.match(await c.locator('.lpx-title h4').innerText(), /실제 덱 반영 전/);
    const seq = (await c.locator('.lpx-seq').innerText()).replace(/\s+/g, ' ');
    assert.match(seq, /02 제품 스펙/); assert.match(seq, /× 제품 수/); assert.doesNotMatch(seq, /Spec/); assert.match(seq, /사양 줄 수에 따라 · 시트 3종/);
    // 장: 간지 + Spec 자리에 시트 3종(옛 장 — 숫자 3 + 사양 8줄 — 은 보이지 않는다)
    assert.equal(await c.locator('.lpx-sheets > .lpx-sheet').count(), 1);
    const group = c.locator('.lpx-routed[data-layout="L_TOC_PSPEC"]');
    assert.equal(await group.count(), 1);
    assert.match(await group.locator('.lpx-routed-h').innerText(), /02[\s\S]*제품 스펙[\s\S]*시트 3종/);
    assert.deepEqual(await group.locator('.lpx-variant').evaluateAll(els => els.map(e => e.dataset.layout)), ['L_TOC_PSPEC_R12', 'L_TOC_PSPEC_R24', 'L_TOC_PSPEC_R36']);
    assert.deepEqual(await group.locator('.lpx-variant .lpx-per').allInnerTexts(), ['사양 12줄까지', '사양 24줄까지', '사양 36줄까지']);
    const caps = await group.locator('.lpx-variant .lpx-cap').allInnerTexts();
    assert.match(caps[0], /1열[\s\S]*사양 1–12줄[\s\S]*대표 스펙 칸 없음/);
    assert.match(caps[1], /2열[\s\S]*사양 13–24줄/);
    assert.match(caps[2], /2열 · 촘촘하게[\s\S]*사양 25–36줄/);
    // 표 — 사양 줄 수 → 시트
    const table = (await group.locator('.lpx-route').innerText()).replace(/\s+/g, ' ');
    for (const w of ['사양 줄 수 → 시트', '1–12', '13–24', '25–36', '36줄을 넘으면 우선순위가 높은 36줄만']) assert.ok(table.includes(w), w + ' — ' + table);
    // 시트 내용 — 대표 스펙 3칸이 없고(옛 장의 큰 숫자 칸), 사양 줄 수가 제품마다 다르다(10 · 19 · 34줄)
    const rows = [];
    for (const f of ['L_TOC_PSPEC_R12', 'L_TOC_PSPEC_R24', 'L_TOC_PSPEC_R36']) {
      const frame = group.locator(`.lpx-variant[data-layout="${f}"]`).frameLocator('iframe');
      await frame.locator('body').waitFor({ timeout: 30000 });
      const names = await frame.locator('[data-tb]').evaluateAll(els => els.map(e => e.textContent.trim()));
      const text = names.join(' | ');
      assert.match(text, /^04 · 제품 스펙 \| .+, 사양 \|/, text.slice(0, 80));
      // 사양 줄 = 이름 · 값 한 쌍 — 눈썹 · 제목 · 제품 이름 · 모델 · 꼬리말 3을 뺀 글 칸의 절반
      rows.push((names.length - 7) / 2);
      // 제품 컷 하나 — 그림이 실제로 그려진다
      assert.equal(await frame.locator('img').count(), 1);
      assert.ok(await frame.locator('img').evaluate(e => e.complete && e.naturalWidth > 0), f + ' 제품 컷');
    }
    assert.deepEqual(rows, [10, 19, 34]);
    // 마우스를 대면 상세
    const tile = group.locator('.lpx-variant[data-layout="L_TOC_PSPEC_R24"] button');
    await tile.hover();
    const pop = page.locator('#lpx-pop'); await pop.waitFor({ state: 'visible' });
    const detail = (await pop.innerText()).replace(/\s+/g, ' ');
    for (const w of ['2번째 / 2칸', '사양 13–24줄', '사양 24줄까지', '대표 스펙 칸 없음', '반영 전 — 지금은 숫자 3 + 사양 8줄 고정', '제품 제안서']) assert.ok(detail.includes(w), w + ' — ' + detail);
    await page.screenshot({ path: path.join(out, 'spec-hover.png') });
    await away();
    await c.locator('header').evaluate(h => h.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'spec.png') });
  });

  await step('한 카드 안에서 같은 사진을 두 번 쓰지 않는다 — 주소도 픽셀도(제품 컷 제외)', async () => {
    // 사진 = 칸을 채우는 그림(object-fit: cover). 카드의 모든 장을 불러온 뒤 사진 주소를 모으고, 가운데 80% 16×16 회색 값 차이로 같은 그림을 가린다(제안서 규칙과 같은 기준: 10 미만이면 같은 그림)
    const print = url => page.evaluate(async u => {
      const img = new Image(); img.src = u; await img.decode();
      const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d');
      const w = img.naturalWidth, h = img.naturalHeight; x.drawImage(img, w * 0.1, h * 0.1, w * 0.8, h * 0.8, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data; const g = []; for (let i = 0; i < d.length; i += 4) g.push(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
      return g;
    }, url);
    const gap = (a, b) => a.reduce((n, v, i) => n + Math.abs(v - b[i]), 0) / a.length;
    let swapped = 0;
    for (const key of KEYS) {
      const tiles = card(key).locator('.lpx-sheet');
      const photos = [];
      for (let i = 0; i < await tiles.count(); i++) {
        const tile = tiles.nth(i); await tile.scrollIntoViewIfNeeded();
        const frame = tile.frameLocator('iframe'); await frame.locator('body').waitFor({ timeout: 30000 });
        const f = await tile.getAttribute('data-layout');
        for (const src of await frame.locator('img').evaluateAll(els => els.filter(e => e.getAttribute('src') && /object-fit:\s*cover/.test(e.getAttribute('style') || '')).map(e => e.getAttribute('src')))) { // 주소 없는 그림은 빈 사진 칸
          // 목록에서 정해 둔 시트(공간별 대표 제품 4종 — space-sheets.json)는 사진을 장 HTML 에 담는다: 주소 대신 그림 자체로 견준다
          if (src.startsWith('data:image/')) { photos.push({ f, id: src, src }); continue; }
          const m = /\/layouts\/([^/]+)\/resource\/([0-9a-f]{24})/.exec(src); // 레이아웃 리소스가 아닌 그림(다른 주소)은 주소 그대로 견준다
          if (m && m[1] !== f) swapped += 1;
          photos.push({ f, id: m ? m[2] : src, src });
        }
      }
      assert.equal(new Set(photos.map(x => x.id)).size, photos.length, key + ' — 같은 주소의 사진이 두 번: ' + photos.map(x => x.f + ':' + x.id.slice(-6)).join(' '));
      const prints = []; for (const x of photos) prints.push(await print(x.src));
      for (let i = 0; i < photos.length; i++) for (let j = i + 1; j < photos.length; j++) assert.ok(gap(prints[i], prints[j]) >= 10, `${key} — 같은 그림: ${photos[i].f} ↔ ${photos[j].f} (${gap(prints[i], prints[j]).toFixed(1)})`);
    }
    assert.ok(swapped >= 2, '겹치던 사진을 다른 사진으로 바꿨다: ' + swapped);
    // 구독 솔루션 — 정해 둔 사진: 효과의 둘째 사진 · 제품 묶음의 공간 사진은 다른 구독 장(IND4)의 사진, 케어 1 '성능 점검' 사진은 제 사진 그대로
    const srcs = async f => card('svc').locator(`.lpx-sheet[data-layout^="${f}"]`).frameLocator('iframe').locator('img').evaluateAll(els => els.filter(e => e.getAttribute('src') && /object-fit:\s*cover/.test(e.getAttribute('style') || '')).map(e => e.getAttribute('src')));
    const [value3, pkg, care] = [await srcs('L_SUB_VALUE3'), await srcs('L_SUB_PKG'), await srcs('L_SUB_CARE4')];
    assert.match(value3[1], /\/L_SUB_IND4\/resource\//); assert.match(value3[0], /\/L_SUB_VALUE3\/resource\//); assert.match(value3[2], /\/L_SUB_VALUE3\/resource\//);
    assert.match(pkg[0], /\/L_SUB_IND4\/resource\//);
    assert.ok(care.every(u => /\/L_SUB_CARE4\/resource\//.test(u)), care.join(' '));
    // 바꿀 사진이 없는 자리는 빈 사진 칸 — 같은 사진을 되풀이하지 않는다
    // (당사의 이해는 업종 묶음마다 새 장을 쓰면서 예시 사진이 겹치지 않게 됐다 — 빈 사진 칸이 생기지 않는다. admin/tests/ua-sectors-ui.mjs)
    assert.equal(await card('ua').locator('.lpx-sheet').last().frameLocator('iframe').locator('[data-lpx-blank]').count(), 0);
    await away();
    await card('ua').locator('header').evaluate(h => h.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'ua.png') });
  });

  await step('내용 고정 표식(자물쇠)은 장마다 — 서비스 제안은 삼성케어플러스 두 장 + 구독 갈래의 비교 · 케어 1 · 케어 2 · 구독 조건 · 결제, Why Samsung 은 전부', async () => {
    const c = card('svc');
    // 파트는 완전 고정이 아니다(고른 서비스에 따라) — 고정인 장에만 자물쇠
    assert.equal(await c.getAttribute('data-kind'), 'branch');
    assert.deepEqual(await c.locator('.lpx-sheet[data-fixed] .lpx-cap b').allInnerTexts(), ['삼성케어플러스 SAC', '삼성케어플러스 비즈니스', '비교', '케어 1', '케어 2', '구독 조건', '결제']);
    assert.deepEqual(await c.locator('.lpx-sheet .lpx-step.fixed').allInnerTexts(), ['02', '03', '06', '08', '09', '10', '11']);
    assert.equal(await c.locator('.lpx-sheet .lpx-step.fixed svg').count(), 7);
    assert.deepEqual(await c.locator('.lpx-sheet .lpx-step:not(.fixed)').allInnerTexts(), ['01', '04', '05', '07']); // 간지 · 고민 · 효과 · 제품 묶음은 업종마다 바뀐다
    for (const t of await c.locator('.lpx-sheet[data-fixed] .lpx-cap small').allInnerTexts()) assert.match(t, /내용 고정/);
    assert.equal(await c.locator('.lpx-seq i.lock').count(), 7);
    // 숫자 00 인 장(케어 2 · 구독 조건 · 결제)은 전체 내용도 고정 — 두 표식이 함께 붙는다
    assert.equal(await c.locator('.lpx-sheet[data-fixed] .lpx-zero').count(), 3);
    assert.equal(await c.locator('.lpx-sheet:not([data-fixed]) .lpx-zero').count(), 0);
    // 상세에도 — 비교 장: 내용 고정
    const tile = c.locator('.lpx-sheet[data-layout="L_SUB_COMPARE"] button');
    await tile.scrollIntoViewIfNeeded(); await tile.hover();
    const pop = page.locator('#lpx-pop'); await pop.waitFor({ state: 'visible' });
    assert.match((await pop.innerText()).replace(/\s+/g, ' '), /내용 고정 — 모든 업종 같음/);
    assert.match((await pop.innerText()).replace(/\s+/g, ' '), /늘 이 자리 · 내용도 같음/);
    await away();
    await c.locator('.lpx-sheet[data-layout="L_SUB_TERMS"] button').hover(); await pop.waitFor({ state: 'visible' });
    assert.match((await pop.innerText()).replace(/\s+/g, ' '), /내용 고정 — 모든 업종 같음 · 숫자만 00으로 두고 직접 입력/);
    await away();
    // Why Samsung — 완전 고정 파트는 장 전부(간지 포함 7장)에 자물쇠, 순서 줄에는 따로 달지 않는다
    assert.equal(await card('why').locator('.lpx-step.fixed svg').count(), 7);
    assert.equal(await card('why').locator('.lpx-seq i.lock').count(), 0);
    // 다른 파트도 같은 규칙 — 내용이 업종마다 바뀌는 파트에는 자물쇠가 없다
    for (const k of ['needs', 'case', 'sol', 'ua']) assert.equal(await card(k).locator('.lpx-step.fixed, .lpx-seq i.lock').count(), 0, k);
    assert.match(await dialog.locator('.lpx-legend').innerText(), /자물쇠 = 내용 고정/);
    await c.locator('header').evaluate(h => h.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'locks.png') });
  });

  await step('시장 분석 (MI)(목록 이름 — 앱의 목차 이름은 당사의 이해) — 업종마다 다름(업종 묶음을 고르면 간지 + 그 묶음의 항목 장) · 차례 번호 · 구성마다 다른 파트는 목록에 없다', async () => {
    assert.equal(await card('ua').getAttribute('data-kind'), 'sector');
    assert.match(await card('ua').locator('.lpx-kind').innerText(), /^업종마다 다름$/);
    assert.deepEqual(await card('ua').locator('.lpx-step').allInnerTexts(), ['01', '02', '03', '04', '05', '06', '07', '08']); // 간지 + 이해 항목 4 + 경쟁 우위 3
    assert.equal(await card('ua').locator('.lpx-seq li').count(), 8);
    assert.equal(await dialog.locator('.lpx-card[data-kind="template"]').count(), 0);
  });

  await step('장에 마우스를 대면 상세 — 큰 미리보기 · 자리 · 장 수 · 모양 · 쓰는 구성', async () => {
    const tile = card('space').locator('.lpx-sheet[data-layout^="L_VS_BIRD"] button');
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
    const pop = page.locator('#lpx-pop');
    await pop.waitFor({ state: 'visible' });
    const text = await pop.innerText();
    for (const w of ['자리', '2번째 / 4칸', '장 수', '모양', '쓰는 구성', '표준 제안서']) assert.ok(text.includes(w), w + ' — ' + text);
    await pop.locator('.lp-frame iframe').waitFor({ timeout: 30000 });
    const [t, p] = [await tile.boundingBox(), await pop.boundingBox()];
    assert.ok(p.x >= t.x + t.width || p.x + p.width <= t.x, '상세가 장을 가리지 않는다');
    assert.ok(p.y >= 0 && p.y + p.height <= 1000, '화면 안');
    await page.screenshot({ path: path.join(out, 'hover.png') });
    await away();
    await pop.waitFor({ state: 'detached' });
    // 공간별 대표 제품 시트 — 쓰는 때 · 한 장에 담는 것 · 실제 덱 반영 전, 나눔 표에서 그 시트를 쓰는 제품 수가 켜진다
    const two = card('space').locator('.lpx-routed[data-layout="L_VS_SPACE"] .lpx-variant[data-per="2"] button');
    await two.scrollIntoViewIfNeeded();
    await two.hover();
    await pop.waitFor({ state: 'visible' });
    const detail = (await pop.innerText()).replace(/\s+/g, ' ');
    for (const w of ['공간별 대표 제품 · 제품 2개 장', '3번째 / 4칸', '쓰는 때 제품 4개(2/2) · 5개(3/2)', '한 장에 제품 2개', '실제 덱 반영 전']) assert.ok(detail.includes(w), w + ' — ' + detail);
    await pop.locator('.lp-frame iframe').waitFor({ timeout: 30000 });
    assert.deepEqual(await card('space').locator('.lpx-routed[data-layout="L_VS_SPACE"] .lpx-route-c.on').evaluateAll(els => els.map(e => e.dataset.n)), ['4', '5']);
    assert.equal(await card('space').locator('.lpx-routed[data-layout="L_VS_MAP"] .lpx-route-c.on').count(), 0); // Map 표는 그대로
    await away();
    await pop.waitFor({ state: 'detached' });
    await two.click();
    const big = page.getByRole('dialog', { name: '공간별 대표 제품 · 제품 2개 장 장표 미리보기' });
    await big.waitFor();
    await big.locator('.lp-zoom-stage iframe').waitFor({ timeout: 30000 });
    assert.match(await big.locator('header p').innerText(), /VS-SPACE-2 · .*실제 덱 반영 전/);
    await page.keyboard.press('Escape');
    await big.waitFor({ state: 'detached' });
    assert.equal(await dialog.isVisible(), true);
    await away();
    const terms = card('svc').locator('.lpx-sheet[data-layout="L_SUB_TERMS"] button');
    await terms.scrollIntoViewIfNeeded();
    await terms.hover();
    await pop.waitFor({ state: 'visible' });
    assert.match(await pop.innerText(), /숫자\s*00으로 고정 — 제안서 작성자가 직접 입력/);
    await pop.locator('.lp-frame iframe').waitFor({ timeout: 30000 });
    assert.doesNotMatch((await pop.frameLocator('iframe').locator('body').innerText()).replace(/\s+/g, ' '), /3~6|6·12·36/);
    await away();
  });

  await step('흐름으로 거르기 — 완전 고정만', async () => {
    await dialog.getByRole('button', { name: /^완전 고정/ }).click();
    const keys = await dialog.locator('.lpx-card').evaluateAll(els => els.map(e => e.dataset.part));
    assert.deepEqual(keys, ['why']); // 서비스 제안은 2026-11-17 부터 '고른 서비스에 따라'(구독 갈래의 고민 · 효과 · 제품 묶음은 업종마다 바뀐다)
    await dialog.getByRole('button', { name: /^전체/ }).click();
    assert.equal(await dialog.locator('.lpx-card').count(), KEYS.length);
    assert.equal(await dialog.getByRole('button', { name: /^정해진 흐름 없음/ }).count(), 0); // Value Prop 상세를 뺐다
  });

  await step('누르면 크게 보기 — Esc 는 크게 보기만, 다시 Esc 로 팝업', async () => {
    await card('needs').locator('.lpx-sheet[data-layout="L_VS_CORE_2"] button').click();
    const zoom = page.getByRole('dialog', { name: /장표 미리보기$/ });
    await zoom.waitFor();
    await page.keyboard.press('Escape');
    await zoom.waitFor({ state: 'detached' });
    assert.equal(await dialog.isVisible(), true);
    await away();
    await dialog.locator('.modal-body').evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'dialog.png') });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
  });
  assert.deepEqual(errors, []);
} catch (e) {
  results.push(['FAIL', String(e.message).split('\n')[0]]);
} finally {
  await browser.close();
}
for (const [s, n] of results) console.log(s.padEnd(4), n);
if (errors.length) console.log('page errors:', errors);
process.exitCode = results.some(([s]) => s !== 'ok') || errors.length ? 1 : 0;
