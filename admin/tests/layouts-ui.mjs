// 「레이아웃 구성 관리」 화면 — 격리 서버(별도 WINMATE_ADMIN_DATA · WINMATE_AUTH_DIR · WINMATE_LAYOUT_PRESETS)에서 실행한다.
//   WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8799 WINMATE_ADMIN_TEST_PASSWORD=… [CHROME=…] node admin/tests/layouts-ui.mjs
// 운영 값(끄기 · 순서 · 기본 구성 · 글 · 연결 샘플)을 실제로 저장한다 — 실제 앱이 읽는 파일이므로 운영 서버에 대고 돌리지 않는다.
// 끝나면 기본값으로 되돌린다. 모델은 부르지 않는다.
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8799';
const password = process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!';
const out = path.resolve(process.env.WINMATE_ADMIN_TEST_OUT || 'admin/runtime/evidence/layouts'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const results = [], errors = [];
let current;
const step = async (name, run) => { try { await run(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name + ' — ' + String(e.message).split('\n')[0]]); await current?.keyboard.press('Escape').catch(() => {}); await current?.keyboard.press('Escape').catch(() => {}); } };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password } });
  assert.equal(login.status(), 200, await login.text());
  const page = current = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const presets = async () => (await (await context.request.get(base + '/admin/api/layout-presets')).json()).presets;
  const appPresets = async () => (await (await context.request.get(base + '/api/bootstrap')).json()).layout_presets;
  const reset = await context.request.delete(base + '/admin/api/layout-presets', { headers: { Origin: base } });
  assert.equal(reset.status(), 200, await reset.text());
  const rev0 = (await reset.json()).presets.rev;
  await page.goto(base + '/admin/layouts');
  await page.getByRole('heading', { name: '레이아웃 구성 관리', exact: true }).waitFor();
  await page.locator('.lp-row').first().waitFor({ timeout: 30000 });
  const row = id => page.locator(`.lp-row[data-template="${id}"]`);
  const ids = () => page.locator('.lp-rows').first().locator('.lp-row').evaluateAll(rows => rows.map(r => r.dataset.template));
  const clickAt = async loc => { await loc.evaluate(el => el.scrollIntoView({ block: 'center' })); const b = await loc.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); }; // 카드 글 위를 눌러도(덮은 버튼이 받는다) 열린다
  const save = async () => { await page.getByRole('button', { name: '저장', exact: true }).click(); await page.getByText('레이아웃 구성을 저장했습니다.', { exact: false }).waitFor(); };

  // 추천 구성은 전체 파트 목록의 파트만으로 다시 짰다(2026-11-16) — 8종 + 자동 변형 1종. 투자 효과형 · 경쟁 비교형 · 요구사항 대응형 · 구독 전환은 은퇴(목록에 없다)
  // 기본 제안 · 상세 제안(2026-11-16)이 맨 위 — 코드 기본값에서는 모두 켜져 있고 기본 구성은 표준 제안서(실서버는 운영 값으로 기본 제안 · 상세 제안만 켰다)
  await step('구성 목록 — 추천 구성 10 · 자동 변형 1 · 코드 기본값의 기본 구성은 표준 제안서', async () => {
    assert.deepEqual(await ids(), ['basic', 'detail', 'std', 'stdx', 'space', 'spacex', 'pain', 'build', 'prod', 'subs']);
    assert.equal(await page.locator('.lp-row').count(), 11);
    assert.deepEqual(await row('detail').locator('.lp-pf-name').allInnerTexts(), ['제안 개요', '시장 분석 (MI)', '가치 제안 (VP)', '고객/공간 시나리오', '유관 사례', 'Why Samsung', '제품 스펙']); // 2026-11-17: 제품 · 솔루션 · 서비스 제안 대신 고객/공간 시나리오
    assert.match(await row('detail').locator('.lp-meta').innerText(), /목차 7/);
    assert.deepEqual(await row('basic').locator('.lp-pf-name').allInnerTexts(), ['제안 개요', '가치 제안 (VP)', '제품 제안', '솔루션 제안', '서비스 제안', '유관 사례', '제품 스펙']); // 구독 상품 제안은 서비스 제안의 갈래
    for (const gone of ['roi', 'compete', 'rfp', 'subsl', 'roisub']) assert.equal(await row(gone).count(), 0, gone);
    await row('std').getByText('기본 구성', { exact: true }).waitFor();
    assert.equal(await row('std').getByRole('switch').isDisabled(), true); // 기본 구성은 끌 수 없다
    assert.equal(await row('std').locator('.lp-flow .lp-pf').count(), 7); // Storyboard 버블(아이콘 원 + 아래 이름) — 표준 제안서 6 + Spec(모든 구성의 끝)
    assert.equal(await row('std').locator('.lp-pf .lp-pf-node svg').count(), 7);
    for (const id of ['basic', 'detail', 'std', 'stdx', 'space', 'spacex', 'pain', 'build', 'prod', 'subs']) assert.equal(await row(id).locator('.lp-pf-name').last().innerText(), '제품 스펙', id + ' 끝은 제품 스펙(Spec 의 목록 이름)');
    assert.deepEqual(await row('prod').locator('.lp-pf-name').allInnerTexts(), ['가치 제안 (VP)', '제품 제안', 'Why Samsung', '제품 스펙']); // 버블은 목록 이름(사용자 지시 2026-11-16) — 표준 제안서에서 Overview · 업종 솔루션 · 도입사례만 뺀 것
    const nb = await row('std').locator('.lp-pf').first().evaluate(li => { const n = li.querySelector('.lp-pf-node').getBoundingClientRect(); const t = li.querySelector('.lp-pf-name').getBoundingClientRect(); return t.top >= n.bottom; });
    assert.equal(nb, true); // 이름은 버블 아래
    assert.equal(await row('std').evaluate(r => getComputedStyle(r).borderLeftWidth), '1px'); // 왼쪽 굵은 색 테두리 없음
    assert.equal(await page.locator('.lp-row').getByRole('button', { name: '상세 보기', exact: true }).count(), 0); // '상세 보기' 버튼 없음 — 카드 전체를 누른다
    assert.match(await row('build').locator('.lp-meta').innerText(), /목차 5/);
    assert.deepEqual(await row('build').locator('.lp-pf-name').allInnerTexts(), ['제품 제안', '솔루션 제안', '유관 사례', 'Why Samsung', '제품 스펙']); // 제품 스펙(Spec)은 맨 마지막
    assert.equal(await page.getByRole('button', { name: '저장', exact: true }).isDisabled(), true);
    await page.screenshot({ path: path.join(out, 'page.png'), fullPage: true });
  });

  // 사용자 지시(2026-11-17): 버블 사이 간격은 모든 구성에서 같다 — 파트가 많고 적음이 끝나는 자리로 한눈에 보인다
  await step('버블 간격은 모든 줄에서 같다(창 폭을 바꿔도) · 짧은 구성은 왼쪽부터 놓여 일찍 끝난다', async () => {
    const pitch = () => page.locator('.lp-rows .lp-row').evaluateAll(rs => rs.map(r => {
      const c = [...r.querySelectorAll('.lp-flow:not(.sm) > .lp-pf .lp-pf-node')].map(n => { const b = n.getBoundingClientRect(); return [b.left + b.width / 2, b.right]; });
      const flow = r.querySelector('.lp-flow').getBoundingClientRect();
      return { id: r.dataset.template, n: c.length, gaps: c.slice(1).map((x, i) => Math.round(x[0] - c[i][0])), start: Math.round(c[0][0] - flow.left), end: Math.round(c[c.length - 1][1] - flow.left), width: Math.round(flow.width) };
    }));
    for (const width of [1440, 1180]) {
      await page.setViewportSize({ width, height: 1000 }); await page.waitForTimeout(400);
      const rows = await pitch();
      const gaps = new Set(rows.flatMap(r => r.gaps));
      assert.equal(gaps.size, 1, width + ' — 간격 ' + [...gaps].join('/'));
      const [g] = gaps; assert.ok(g <= 112 && g >= 48, width + ' ' + g);
      assert.equal(new Set(rows.map(r => r.start)).size, 1, width + ' 첫 버블 자리');
      for (const r of rows) assert.ok(r.end <= r.width, `${width} ${r.id} 줄 안에 다 들어간다`);
      const by = Object.fromEntries(rows.map(r => [r.id, r]));
      assert.ok(by.detail.end === by.basic.end && by.basic.end === by.std.end && by.std.end > by.build.end && by.build.end > by.prod.end, width + ' 파트가 많을수록 더 길다(기본 · 상세 · 표준 7 > 구축형 5 > 제품 4)');
    }
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.waitForTimeout(300); // 처음 창 크기로
  });

  await step('버블에 마우스를 대면 그 파트의 레이아웃이 세로 목록으로 뜬다 · 목록 안으로 옮겨 굴릴 수 있다', async () => {
    const bubble = row('build').locator('.lp-pf[data-toc="space"] .lp-pf-node');
    await bubble.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await bubble.hover();
    const peek = page.locator('.lp-peek');
    await peek.waitFor({ timeout: 10000 });
    assert.match(await peek.locator('header').innerText(), /제품 제안/);
    const n = await peek.locator('.lp-peek-list > li').count();
    assert.equal(n >= 2, true);
    // 대표 흐름 하나 — 대표 업종 덱 한 벌, 공간 수만큼 늘어나는 장은 한 칸(공간마다 × n) · 다른 업종의 조감도 · Map 변형은 늘어놓지 않는다
    const fs_ = await peek.locator('.lp-peek-list > li').evaluateAll(xs => xs.map(x => x.dataset.layout));
    assert.equal(fs_.filter(f => /^L_VS_BIRD_/.test(f)).length, 1, fs_.join(' '));
    assert.equal(fs_.filter(f => /^L_VS_MAP_/.test(f)).length, 1, fs_.join(' '));
    assert.equal(fs_.filter(f => f === 'L_VS_SPACE').length, 1, fs_.join(' '));
    assert.match(await peek.locator('.lp-peek-list > li[data-layout="L_VS_SPACE"] .lp-peek-rep').innerText(), /^공간마다 × \d+$/);
    const pb = await peek.boundingBox();
    assert.equal(pb.width >= 420, true); // 너비 충분히
    const li = await peek.locator('.lp-peek-list > li').evaluateAll(xs => xs.slice(0, 2).map(x => x.getBoundingClientRect().top));
    assert.equal(li[1] > li[0], true); // 세로 목록
    await peek.locator('.lp-frame iframe').first().waitFor({ timeout: 20000 });
    // 버블 → 목록으로 마우스를 옮겨도 닫히지 않고, 목록 안을 굴린다
    await page.mouse.move(pb.x + pb.width / 2, pb.y + Math.min(180, pb.height / 2), { steps: 6 }); // 헤드리스 Chrome 은 창 아래 끝 근처의 휠을 문서로 보낸다 — 목록 위쪽에서 굴린다
    await page.waitForTimeout(400);
    assert.equal(await peek.count(), 1);
    const list = peek.locator('.lp-peek-list');
    const [sh, ch] = await list.evaluate(el => [el.scrollHeight, el.clientHeight]);
    if (sh > ch + 4) { await page.mouse.wheel(0, 400); await page.waitForTimeout(300); assert.equal(await list.evaluate(el => el.scrollTop) > 0, true); }
    await page.screenshot({ path: path.join(out, 'peek.png') });
    // 다른 버블로 옮기면 그 파트로 바뀐다 · 카드 밖으로 나가면 닫힌다
    await row('build').locator('.lp-pf[data-toc="why"] .lp-pf-node').hover();
    await page.locator('.lp-peek header', { hasText: 'Why Samsung' }).waitFor();
    await page.mouse.move(5, 5, { steps: 4 });
    await peek.waitFor({ state: 'detached' });
    // 고객/공간 시나리오(2026-11-17 · 2차) — 조감도 하나 + 활용 맵 하나 + 공간별 시나리오 한 칸(공간 3곳씩 × n — 3곳 · 2곳 장이 섞여도 접는다)
    const vb = row('detail').locator('.lp-pf[data-toc="value"] .lp-pf-node');
    await vb.evaluate(el => el.scrollIntoView({ block: 'center' })); await vb.hover();
    await page.locator('.lp-peek header', { hasText: '고객/공간 시나리오' }).waitFor();
    const vf = await peek.locator('.lp-peek-list > li').evaluateAll(xs => xs.map(x => x.dataset.layout));
    assert.equal(vf.filter(f => /^L_VS_BIRD_/.test(f)).length, 1, vf.join(' '));
    assert.equal(vf.filter(f => /^L_TOC_SCN_MAP/.test(f)).length, 1, vf.join(' '));
    assert.equal(vf.filter(f => /^L_TOC_SCN_S/.test(f)).length, 1, vf.join(' '));
    assert.equal(vf.filter(f => /^L_TOC_JOURNEY/.test(f)).length, 0, vf.join(' '));
    assert.match(await peek.locator('.lp-peek-list > li', { has: page.locator('.lp-peek-rep') }).first().innerText(), /공간 3곳씩 × \d+/);
    await page.screenshot({ path: path.join(out, 'peek-value.png') });
    await page.mouse.move(5, 5, { steps: 4 });
    await peek.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('dialog').count(), 0); // 마우스만 댔을 때는 상세가 열리지 않는다
  });

  await step('끄기 · 순서 · 기본 구성 → 저장하면 앱(/api/bootstrap)에 실린다', async () => {
    await row('pain').getByRole('switch').click();
    await row('pain').getByText('꺼짐', { exact: true }).waitFor();
    await page.getByText('저장하지 않은 변경').waitFor();
    await row('build').getByRole('button', { name: /위로$/ }).click();
    await row('build').getByRole('button', { name: /위로$/ }).click();
    assert.deepEqual((await ids()).slice(5, 9), ['build', 'spacex', 'pain', 'prod']);
    await row('stdx').getByRole('button', { name: '기본으로', exact: true }).click();
    await row('stdx').getByText('기본 구성', { exact: true }).waitFor();
    assert.equal(await row('std').getByText('기본 구성', { exact: true }).count(), 0);
    assert.equal(await row('prod').getByRole('button', { name: '기본으로', exact: true }).isDisabled(), true);
    await save();
    const saved = await presets();
    assert.equal(saved.fixed, 'stdx'); assert.equal(saved.rev, rev0 + 1); assert.equal(saved.updated_by, 'admin');
    assert.deepEqual(saved.items, { pain: { enabled: false } });
    assert.deepEqual(saved.order.slice(5, 9), ['build', 'spacex', 'pain', 'prod']);
    const app = await appPresets();
    assert.equal(app.fixed, 'stdx'); assert.deepEqual(app.items, { pain: { enabled: false } }); assert.equal(app.updated_by, undefined);
    assert.equal(await page.getByRole('button', { name: '저장', exact: true }).isDisabled(), true);
    await page.screenshot({ path: path.join(out, 'saved.png'), fullPage: true });
  });

  await step('상세 — 카드 아무 곳이나 누르면 열리고, 시트(대표 샘플 덱)가 바로 보인다 · ← → 로 넘긴다', async () => {
    await clickAt(row('build').locator('.lp-desc'));
    const dialog = page.getByRole('dialog').first();
    assert.equal(await dialog.getByRole('tab', { name: '시트' }).getAttribute('aria-selected'), 'true');
    const frame = dialog.frameLocator('.lp-sheets iframe');
    await frame.locator('.tsx-th').first().waitFor({ timeout: 60000 });
    assert.equal(await frame.locator('.sidebar').isVisible(), false);
    await dialog.locator('.lp-sheets-bar b').waitFor({ timeout: 30000 });
    // 구축형은 연결 샘플이 없다 → 이 구성으로 조립한 대표 업종 덱
    assert.match(await dialog.locator('.lp-sheets-bar').innerText(), /이 구성으로 조립한 대표 업종 시나리오/);
    assert.match(await dialog.getByRole('link', { name: '앱에서 열기' }).getAttribute('href'), /^\/\?toc=build&v=fb_qsr$/);
    const n = await frame.locator('.tsx-th').count();
    assert.equal(await frame.locator('.tsx-th .tsx-pi svg').count(), n); // 썸네일마다 파트 아이콘
    assert.equal(await frame.locator('.tsx-pg').innerText(), '1 / ' + n);
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await frame.locator('.tsx-pg', { hasText: '3 / ' + n }).waitFor();
    await page.keyboard.press('ArrowLeft');
    await frame.locator('.tsx-pg', { hasText: '2 / ' + n }).waitFor();
    assert.equal(await frame.locator('.tsx-th[aria-current="true"] .no').innerText(), '2');
    // 파트가 바뀌면 아이콘 색도 바뀐다 — 파트 아이콘 색 종류가 둘 이상
    const hues = await frame.locator('.tsx-pi').evaluateAll(xs => new Set(xs.map(x => getComputedStyle(x).backgroundColor)).size);
    assert.equal(hues >= 3, true);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'sheets.png') });
    await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
    // 공간 가치형 확장형 — 구성을 다시 짠 뒤로는(핵심 기술 → 업종 솔루션) 폴 바셋 덱과 파트 구성이 달라 연결 샘플이 없다 → 조립한 대표 업종 덱. 시트는 구성의 파트 순서 그대로
    await clickAt(row('spacex').locator('.lp-desc'));
    const d2 = page.getByRole('dialog').first();
    await d2.locator('.lp-sheets-bar b').waitFor({ timeout: 60000 });
    assert.match(await d2.locator('.lp-sheets-bar').innerText(), /이 구성으로 조립한 대표 업종 시나리오/);
    assert.match(await d2.getByRole('link', { name: '앱에서 열기' }).getAttribute('href'), /^\/\?toc=spacex&v=fb_qsr$/);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(out, 'sheets-spacex.png') });
    await d2.getByRole('button', { name: '닫기', exact: true }).last().click();
  });

  await step('상세 — 목차마다 레이아웃 목록 · 업종 덱 · 장표 크게 보기', async () => {
    await clickAt(row('build').locator('.lp-flow'));
    const dialog = page.getByRole('dialog').first();
    await dialog.getByRole('tab', { name: '목차 · 레이아웃' }).click();
    assert.equal(await dialog.locator('.lp-part').count(), 6); // 앞장 + 목차 5
    assert.equal(await dialog.locator('.lp-part').last().getAttribute('data-part'), 'pspec'); // Spec 은 맨 마지막
    assert.equal(await dialog.locator('.lp-part[data-part="pspec"] .lp-layout').count() >= 2, true); // 간지 + Spec
    await dialog.locator('.lp-part[data-part="pspec"] .lp-layout', { hasText: 'Spec' }).first().waitFor();
    await dialog.locator('.lp-frame iframe').first().waitFor({ timeout: 20000 });
    await dialog.getByText(/업종 \d+\/44/).first().waitFor();
    await dialog.locator('.lp-parts-bar select').selectOption('fb_qsr');
    await dialog.getByText(/덱의 순서 그대로/).waitFor();
    await dialog.locator('.lp-frame iframe').first().waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(out, 'parts.png') });
    await dialog.locator('.lp-part[data-part="pspec"] .lp-layout', { hasText: 'Spec' }).first().click();
    const zoom = page.getByRole('dialog', { name: /장표 미리보기$/ });
    await zoom.locator('.lp-frame iframe').waitFor({ timeout: 20000 });
    await page.screenshot({ path: path.join(out, 'zoom.png') });
    await page.keyboard.press('Escape'); // 크게 보기만 닫힌다
    await zoom.waitFor({ state: 'detached' });
    await dialog.getByRole('tab', { name: '목차 · 레이아웃' }).waitFor();
  });

  await step('상세 — 샘플 시나리오: 연결 샘플 · 업종별 덱을 앱 화면 그대로 본다', async () => {
    const dialog = page.getByRole('dialog').first();
    await dialog.getByRole('tab', { name: '샘플 시나리오' }).click();
    assert.equal(await dialog.locator('[data-sample]').count(), 0); // 다시 짠 구성은 옛 샘플과 파트 구성이 달라 연결을 풀어 두었다
    assert.equal(await dialog.locator('.lp-vert').count(), 44);
    await page.screenshot({ path: path.join(out, 'samples.png') });
    await dialog.locator('.lp-vert[data-vertical="ht_large"]').click();
    const viewer = page.getByRole('dialog', { name: /샘플 시나리오$/ });
    const frame = viewer.frameLocator('iframe');
    await frame.locator('.modal.tocd').waitFor({ timeout: 60000 });
    await frame.locator('.tocv-th').first().waitFor({ timeout: 60000 });
    assert.equal(await frame.locator('.sidebar').isVisible(), false); // 덱만 본다
    assert.match(await viewer.getByRole('link', { name: '앱에서 열기' }).getAttribute('href'), /^\/\?toc=build&v=ht_large$/);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, 'viewer.png') });
    await viewer.getByRole('button', { name: '샘플 시나리오 닫기' }).click();
    await dialog.getByRole('button', { name: '샘플 연결' }).click();
    await dialog.getByLabel('연결할 샘플 찾기').fill('bs02');
    await dialog.locator('.lp-add li', { hasText: 'bs02' }).first().getByRole('button', { name: '연결', exact: true }).click();
    assert.equal(await dialog.locator('[data-sample="bs02"]').count(), 1);
  });

  await step('상세 — 설정: 이름 · 맞는 상황을 고치고 저장 · 기본값으로', async () => {
    const dialog = page.getByRole('dialog').first();
    await dialog.getByRole('tab', { name: '설정' }).click();
    assert.equal(await dialog.locator('#lp-f-badge, .lp-badge').count(), 0); // 배지 항목은 없앴다(2026-11-16)
    await dialog.getByLabel('이름').fill('구축형 제안서 (사양)');
    await dialog.getByLabel('맞는 상황').fill('공간별 구성과 제품 사양을 확인해야 할 때');
    await page.screenshot({ path: path.join(out, 'settings.png') });
    await dialog.getByRole('button', { name: '닫기', exact: true }).last().click();
    await row('build').getByRole('heading', { name: '구축형 제안서 (사양)' }).waitFor();
    await row('build').getByText('공간별 구성과 제품 사양을 확인해야 할 때').waitFor();
    await save();
    const saved = await presets();
    assert.deepEqual(saved.items.build, { name: '구축형 제안서 (사양)', hint: '공간별 구성과 제품 사양을 확인해야 할 때', related: ['bs02'] });
    await clickAt(row('build').locator('.lp-desc'));
    const again = page.getByRole('dialog').first();
    await again.getByRole('tab', { name: '설정' }).click();
    await again.locator('.lp-field', { hasText: '이름' }).getByRole('button', { name: '기본값으로' }).click();
    assert.equal(await again.getByLabel('이름').inputValue(), '구축형 제안서');
    await again.getByRole('button', { name: '닫기', exact: true }).last().click();
    await page.getByRole('button', { name: '변경 취소' }).click(); // 저장한 값으로
    await row('build').getByRole('heading', { name: '구축형 제안서 (사양)' }).waitFor();
  });

  await step('앱 — 끈 구성은 목차 템플릿 목록에서 빠지고, 고친 이름이 보인다', async () => {
    const app = await context.newPage();
    app.on('pageerror', e => errors.push('app: ' + e.message));
    await app.goto(base + '/?toc=none');
    await app.locator('.tocc').first().waitFor({ timeout: 60000 });
    const names = await app.locator('.tocc .tocc-nm').allInnerTexts();
    assert.equal(names.length, 10); // 11(추천 구성 10 + 자동 변형 1) - 꺼진 과제 해결형
    assert.equal(names.includes('과제 해결형 제안서'), false);
    assert.deepEqual(names.slice(5, 7), ['구축형 제안서 (사양)', '공간 가치형 제안서 확장형']);
    for (const gone of ['투자 효과형 제안서', '경쟁 비교형 제안서', '요구사항 대응형 제안서', '구독 전환 제안서']) assert.equal(names.includes(gone), false, gone);
    await app.goto(base + '/?toc=build&sample=bs02');
    await app.locator('.modal.tocd .tocv-th').first().waitFor({ timeout: 60000 });
    await app.locator('.tocm-btn', { hasText: '기존 샘플' }).waitFor();
    await app.close();
  });

  await step('기본값으로 되돌리기', async () => {
    await page.getByRole('button', { name: '기본값으로 되돌리기' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: '기본값으로 되돌리기' }).click();
    await page.getByText('모든 구성을 코드 기본값으로 되돌렸습니다.').waitFor();
    assert.deepEqual(await ids(), ['basic', 'detail', 'std', 'stdx', 'space', 'spacex', 'pain', 'build', 'prod', 'subs']);
    await row('std').getByText('기본 구성', { exact: true }).waitFor();
    const saved = await presets();
    assert.deepEqual([saved.fixed, saved.order, saved.items], [null, [], {}]);
  });

  await step('좁은 화면에서도 목록이 넘치지 않는다', async () => {
    await page.setViewportSize({ width: 760, height: 1000 });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
    await page.screenshot({ path: path.join(out, 'narrow.png') });
  });
} finally {
  await browser.close();
}
for (const [state, name] of results) console.log(state.padEnd(4), name);
if (errors.length) console.log('page errors:', errors);
const failed = results.filter(r => r[0] !== 'ok').length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed || errors.length ? 1 : 0);
