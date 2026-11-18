// 「전체 파트」 팝업의 당사의 이해 — 파트 이름 오른쪽 업종 드롭다운 · 업종 묶음마다 다른 이해 항목 · 새 장.
//   격리 서버(별도 WINMATE_ADMIN_DATA · WINMATE_AUTH_DIR · WINMATE_LAYOUT_PRESETS)에서 실행한다. 읽기만 한다(운영 값을 저장하지 않는다). 모델은 부르지 않는다.
//   WINMATE_ADMIN_TEST_URL=http://127.0.0.1:8799 [WINMATE_ADMIN_TEST_PASSWORD=…] [CHROME=…] node admin/tests/ua-sectors-ui.mjs
// 규칙(2026-11-16 사용자): 당사의 이해만 이름 오른쪽에 업종 드롭다운 · 업종은 크게 묶는다(병의원은 한 묶음, 학교와 오피스는 다름) ·
//   묶음마다 이해 항목을 따로 · 기존 레이아웃을 쓰지 않고 새 장. 카드에 풀어 쓴 설명 글은 두지 않는다.
import { chromium } from '../../app/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.env.WINMATE_ADMIN_TEST_URL || 'http://127.0.0.1:8799';
const password = process.env.WINMATE_ADMIN_TEST_PASSWORD || 'Admin-local-test-2026!';
const out = path.resolve(process.env.WINMATE_ADMIN_TEST_OUT || 'admin/runtime/evidence/ua-sectors'); fs.mkdirSync(out, { recursive: true });
const DATA = JSON.parse(fs.readFileSync(new URL('../web/src/ua-catalog.json', import.meta.url), 'utf8'));
const C = Object.fromEntries(DATA.clusters.map(c => [c.id, c]));
// 세부 업종 이름 — 앱의 업종 목록(tocVerticals)과 같은 규칙: 괄호 설명 앞까지
const CONTENT = JSON.parse(fs.readFileSync(new URL('../../app/web/src/domain/templates/toc_content.json', import.meta.url), 'utf8'));
const members = id => C[id].verticals.map(v => CONTENT.v[v].nm.split(' (')[0]).join(' · ');
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }) });
const results = [], errors = [];
const step = async (name, run) => { try { await run(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name + ' — ' + String(e.message).split('\n')[0]]); } };
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'admin', password } });
  assert.equal(login.status(), 200, await login.text());
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const asked = []; page.on('request', r => { if (/\/layout-presets\/layouts\/L_TOC_UA_/.test(r.url())) asked.push(r.url()); });
  await page.goto(base + '/admin/layouts');
  await page.locator('.lp-row').first().waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: '전체 파트 확인하기' }).click();
  const dialog = page.getByRole('dialog', { name: '전체 파트' });
  const card = dialog.locator('.lpx-card[data-part="ua"]');
  await card.waitFor({ timeout: 60000 });
  const select = card.locator('.lpx-sector select');
  await select.waitFor({ timeout: 30000 });
  const layouts = () => card.locator('.lpx-sheet').evaluateAll(els => els.map(e => e.dataset.layout));
  const pick = async id => { await select.selectOption(id); await card.locator(`.lpx-sheet[data-layout="${C[id].sheets[0].f}"]`).waitFor({ timeout: 15000 }); };
  const bodyText = async f => { const tile = card.locator(`.lpx-sheet[data-layout="${f}"]`); await tile.scrollIntoViewIfNeeded(); const fr = tile.frameLocator('iframe'); await fr.locator('body').waitFor({ timeout: 30000 }); return (await fr.locator('body').innerText()).replace(/\s+/g, ' '); };
  const away = async () => { await page.mouse.move(5, 995); await page.waitForTimeout(250); };

  await step('고객사의 이해(앱의 목차 이름은 당사의 이해) — 파트 이름 오른쪽에 업종 드롭다운(같은 줄) · 업종 묶음 12곳', async () => {
    await card.scrollIntoViewIfNeeded();
    const pos = await card.locator('.lpx-title h4').evaluate(h => {
      const r = document.createRange(); r.selectNodeContents(h.firstChild); const t = r.getBoundingClientRect(); const s = h.querySelector('.lpx-sector').getBoundingClientRect();
      return { title: h.firstChild.textContent, right: t.right, mid: (t.top + t.bottom) / 2, left: s.left, smid: (s.top + s.bottom) / 2 };
    });
    assert.equal(pos.title, '시장 분석 (MI)'); // 목록 이름(사용자 지시 2026-11-16: 당사의 이해 → 고객사의 이해 → 시장 분석 (MI))
    assert.ok(pos.left >= pos.right, '드롭다운이 파트 이름 오른쪽에 있다');
    assert.ok(pos.left - pos.right < 40 && Math.abs(pos.mid - pos.smid) < 12, '이름 바로 옆 · 같은 줄');
    assert.equal(await card.locator('.lpx-sector span').innerText(), '업종');
    assert.deepEqual(await select.locator('option').allInnerTexts(), DATA.clusters.map(c => c.name));
    assert.equal(DATA.clusters.length, 12);
    assert.equal(await select.inputValue(), DATA.clusters[0].id);
    assert.equal(await select.getAttribute('aria-label'), '시장 분석 (MI) 업종 선택');
  });

  await step('업종 묶음 드롭다운은 고객사의 이해만 — 다른 파트에는 없다(Overview 의 업종별 고정 시트 드롭다운은 따로)', async () => {
    assert.equal(await dialog.locator('.lpx-sector').count(), 1);
    assert.deepEqual(await dialog.locator('.lpx-card:has(.lpx-sector)').evaluateAll(els => els.map(e => e.dataset.part)), ['ua']);
    assert.deepEqual(await dialog.locator('.lpx-card[data-kind="sector"]').evaluateAll(els => els.map(e => e.dataset.part)), ['ua']);
    assert.equal(await card.locator('.lpx-ind, .lpx-ind-note').count(), 0, 'Overview 드롭다운의 클래스는 쓰지 않는다');
  });

  await step('첫 묶음(외식 · 카페) — 간지 + 이해 항목 4 + 경쟁 우위 3, 차례 번호 · 업종마다 다름 · 실제 덱 반영 전', async () => {
    const c = DATA.clusters[0];
    assert.equal(await card.getAttribute('data-kind'), 'sector');
    assert.match(await card.locator('.lpx-kind').innerText(), /^업종마다 다름$/);
    assert.deepEqual(await layouts(), ['L_VS_DIV_R6', ...c.sheets.map(s => s.f)]);
    assert.equal(c.sheets.length, 7);
    assert.deepEqual(await card.locator('.lpx-cap b').allInnerTexts(), ['간지', ...c.sheets.map(s => s.label)]);
    assert.deepEqual(await card.locator('.lpx-step').allInnerTexts(), ['01', '02', '03', '04', '05', '06', '07', '08']);
    assert.equal(await card.locator('.lpx-seq li').count(), 8);
    assert.match(await card.locator('.lpx-title h4').innerText(), /실제 덱 반영 전/);
    assert.equal(await card.locator('.lpx-title p').innerText(), c.goal);
    assert.match(await card.locator('.lpx-meta').innerText(), /장 8/);
    assert.equal(await card.locator('.lpx-step.fixed, .lpx-seq i.lock').count(), 0, '내용은 고객사마다 채운다 — 자물쇠 없음');
  });

  await step('묶음 한 줄 — 묶음 이름 · 세부 업종 · 항목 수만(풀어 쓴 설명 글 없음)', async () => {
    const note = card.locator('.lpx-sector-note');
    assert.equal(await note.getAttribute('data-sector'), 'FB');
    assert.equal(await note.locator('b').innerText(), '외식 · 카페');
    assert.equal(await note.locator('span').innerText(), members('FB'));
    assert.match(members('FB'), /^외식 프랜차이즈 · 카페·베이커리 프랜차이즈 · 단독 레스토랑·중소 식당$/);
    assert.equal(await note.locator('i').innerText(), '이해 항목 4 · 경쟁 우위 3');
    assert.doesNotMatch(await note.innerText(), /니다|어요|아요/);
    assert.equal(await card.locator('.lpx-note').count(), 0);
  });

  await step('병의원 — 대형 · 중소 병원 · 의원 · 요양이 한 묶음, 항목과 장이 통째로 바뀐다', async () => {
    await pick('MD');
    assert.deepEqual(await layouts(), ['L_VS_DIV_R6', 'L_TOC_UA_MD_SCALE', 'L_TOC_UA_MD_PATIENT', 'L_TOC_UA_MD_ZONE', 'L_TOC_UA_MD_RULE', 'L_TOC_UA_MD_RIVAL', 'L_TOC_UA_MD_EDGE', 'L_TOC_UA_MD_PROOF']);
    assert.deepEqual(await card.locator('.lpx-cap b').allInnerTexts(), ['간지', '병상 · 진료 규모', '환자 여정 · 대기', '구역 구성', '인증 · 감염 · 시스템', '경쟁 구도 · 통합 솔루션', '핵심 스펙', '같은 업종 사례']);
    assert.equal(await card.locator('.lpx-sector-note span').innerText(), members('MD'));
    assert.match(members('MD'), /^상급종합·종합병원 · 중소 병원.* · 의원·클리닉 · 요양병원·요양시설$/);
    assert.equal(await card.locator('.lpx-title p').innerText(), C.MD.goal);
    const text = await bodyText('L_TOC_UA_MD_SCALE');
    for (const w of ['01 · 시장 분석 (MI) · 병상 · 진료 규모', '종합 병원', '병상', '진료과', '하루 외래 환자', '00']) assert.ok(text.includes(w), w + ' — ' + text);
    assert.match(await bodyText('L_TOC_UA_MD_PATIENT'), /접수 .*대기 .*진료 .*검사 .*수납 .*약 · 귀가/);
    await card.locator('header').evaluate(h => h.scrollIntoView({ block: 'start' }));
    await away();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, 'md.png') });
  });

  await step('학교와 오피스는 다른 묶음 — 학사 일정 · 예산 조달 ↔ 층별 구성 · 회의', async () => {
    await pick('ED');
    assert.deepEqual(await card.locator('.lpx-cap b').allInnerTexts(), ['간지', '학생 · 학급 규모', '학사 일정', '교실 · 기자재', '예산 · 조달', '경쟁 구도 · 통합 솔루션', '핵심 스펙', '같은 업종 사례']);
    // 숫자 00 은 처음부터 든 값 — 미리보기 고치기가 달 · 차례 번호까지 00 으로 바꾸지 않는다
    const term = await bodyText('L_TOC_UA_ED_TERM');
    for (const w of ['3월', '12월', '2월', '1학기', '2학기', '여름방학', '00월 00일 – 00월 00일']) assert.ok(term.includes(w), w + ' — ' + term);
    assert.doesNotMatch(term, /00학기/);
    const budget = await bodyText('L_TOC_UA_ED_BUDGET');
    assert.match(budget, /1 .*예산 편성 .*2 .*기종 선정 .*3 .*계약 · 조달 .*4 .*납품 · 검수/);
    assert.equal(await card.locator('.lpx-zero').count(), C.ED.sheets.filter(s => s.zero).length);
    await card.locator('header').evaluate(h => h.scrollIntoView({ block: 'start' }));
    await away();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, 'ed.png') });
    await pick('OF');
    assert.deepEqual(await card.locator('.lpx-cap b').allInnerTexts(), ['간지', '인원 · 근무 방식', '층별 구성', '회의 · 협업', 'IT · 보안 · ESG', '경쟁 구도 · 통합 솔루션', '핵심 스펙', '같은 업종 사례']);
    assert.equal(await card.locator('.lpx-sheet[data-layout^="L_TOC_UA_ED_"]').count(), 0);
    assert.match(await bodyText('L_TOC_UA_OF_MEET'), /1–2인 .*4–6인 .*8–12인 .*20인\+ .*100인\+/); // 인원 수 표기는 그대로
  });

  await step('묶음 12곳 모두 — 간지 + 그 묶음의 새 장만, 기존 당사의 이해 장은 쓰지 않는다 · 서버에 묻지 않는다', async () => {
    for (const c of DATA.clusters) {
      await pick(c.id);
      assert.deepEqual(await layouts(), ['L_VS_DIV_R' + Math.min(6, c.sheets.length), ...c.sheets.map(s => s.f)], c.id); // 간지는 여섯 줄까지
      assert.equal(await card.locator('.lpx-sheet[data-layout^="L_TOC_UAP"], .lpx-sheet[data-layout^="L_TOC_TR"], .lpx-sheet[data-layout^="L_TOC_CP"]').count(), 0, c.id);
      assert.equal(await card.locator('.lpx-zero').count(), c.sheets.filter(s => s.zero).length, c.id + ' 숫자 00 표식');
      for (const s of c.sheets) {
        const text = await bodyText(s.f);
        assert.ok(text.startsWith('01 · 시장 분석 (MI) · '), s.f + ' — ' + text.slice(0, 60));
        assert.doesNotMatch(text, /\[00\]|\[확인 필요\]/, s.f);
        const tile = card.locator(`.lpx-sheet[data-layout="${s.f}"]`);
        const fit = await tile.frameLocator('iframe').locator('body').evaluate(b => [...b.querySelectorAll('[data-tb]')].every(e => { const r = e.getBoundingClientRect(); return r.right <= 1281 && r.bottom <= 721 && r.left >= -1; }));
        assert.ok(fit, s.f + ' 글이 장 밖으로 나간다');
        assert.equal(await tile.frameLocator('iframe').locator('img').evaluateAll(els => els.every(e => e.complete && e.naturalWidth > 1)), true, s.f + ' 그림이 비었다');
      }
    }
    assert.deepEqual(asked, [], '새 장의 미리보기를 서버에 묻지 않는다');
  });

  await step('경쟁 우위 3장 — 병의원: 통합 솔루션(영역마다 제품 컷 · 묶는 솔루션 · 경쟁 유형은 일부) → 핵심 스펙(실제 값 · 경쟁 제품 00) → 같은 업종 사례', async () => {
    await pick('MD');
    const rival = await bodyText('L_TOC_UA_MD_RIVAL');
    for (const w of ['01 · 시장 분석 (MI) · 경쟁 구도', '병원 전체를 한 공급사에서', '삼성', '5 / 5', '스마트 사이니지', '갤럭시 탭', '무풍 4Way', '하나로 묶는 솔루션', 'SmartThings Pro', 'VXT CMS', '글로벌 의료 IT', '국내 병원 정보', '3 / 5', '2 / 5']) assert.ok(rival.includes(w), w + ' — ' + rival);
    const cuts = card.locator('.lpx-sheet[data-layout="L_TOC_UA_MD_RIVAL"]').frameLocator('iframe').locator('[data-kind="cut"] img');
    assert.equal(await cuts.count(), 5);
    assert.ok(await cuts.evaluateAll(els => els.every(e => e.complete && e.naturalWidth > 1 && e.src.startsWith('data:image/'))), '제품 컷이 보인다');
    const edge = await bodyText('L_TOC_UA_MD_EDGE');
    for (const w of ['갤럭시 탭 S11 울트라', 'SM-X936NZAAKOO', '369.9mm', '695 g', '11600 mAh', '경쟁 제품 00']) assert.ok(edge.includes(w), w + ' — ' + edge);
    const proof = await bodyText('L_TOC_UA_MD_PROOF');
    for (const w of ['병원에서 먼저 검증했습니다', '메드렉스 병원 병상 TV탭', '인천 더드림병원', '성심요양병원', 'samsung.com 도입사례', '같은 업종의 다른 사례', '경쟁사가 낸 같은 업종 사례 00 건']) assert.ok(proof.includes(w), w + ' — ' + proof);
    // 숫자 00 표식 — 경쟁사 값을 직접 넣는 두 장(핵심 스펙 · 사례). 통합 솔루션 장에는 붙지 않는다
    assert.equal(await card.locator('.lpx-sheet[data-layout="L_TOC_UA_MD_RIVAL"] .lpx-zero').count(), 0);
    assert.equal(await card.locator('.lpx-sheet[data-layout="L_TOC_UA_MD_EDGE"] .lpx-zero').count(), 1);
    assert.equal(await card.locator('.lpx-sheet[data-layout="L_TOC_UA_MD_PROOF"] .lpx-zero').count(), 1);
    // 업종에 맞게 — 학교는 다른 영역 · 제품 · 사례
    await pick('ED');
    const school = await bodyText('L_TOC_UA_ED_RIVAL');
    for (const w of ['학교 전체를 한 공급사에서', '교실 칠판', '전자칠판 Flip Pro', '갤럭시 클래스룸', '글로벌 전자칠판']) assert.ok(school.includes(w), w + ' — ' + school);
    assert.doesNotMatch(school, /병동|의료/);
    assert.match(await bodyText('L_TOC_UA_ED_EDGE'), /Flip Pro 전자칠판.*138\.7 cm.*30W.*12\/7/);
    assert.match(await bodyText('L_TOC_UA_ED_PROOF'), /국민대학교.*서울 문정초등학교 디지털 교과서.*서울교육대학교 AI 미래교실/);
    await pick('MD');
    const tile = card.locator('.lpx-sheet[data-layout="L_TOC_UA_MD_RIVAL"]');
    await tile.evaluate(el => el.scrollIntoView({ block: 'center' }));
    await away();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(out, 'compete.png') });
    const pop = page.locator('#lpx-pop');
    await card.locator('.lpx-sheet[data-layout="L_TOC_UA_MD_EDGE"] button').hover();
    await pop.waitFor({ state: 'visible' });
    const detail = (await pop.innerText()).replace(/\s+/g, ' ');
    for (const w of ['핵심 스펙 — 대표 제품 컷 + 스펙 값 3 × 메시지·경쟁 제품 값', 'TOC-UA-MD-EDGE', '7번째 / 8칸', '삼성 칸은 실제 제품 · 스펙 · 도입사례 — 경쟁사 칸은 조사한 내용으로 작성자가 채움']) assert.ok(detail.includes(w), w + ' — ' + detail);
    await away();
    await pop.waitFor({ state: 'detached' });
  });

  await step('장에 마우스를 대면 상세 — 항목 이름 · 장 코드 · 업종 묶음 · 숫자 00 · 내용 · 쓰는 구성', async () => {
    await pick('MD');
    const tile = card.locator('.lpx-sheet[data-layout="L_TOC_UA_MD_PATIENT"] button');
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
    const pop = page.locator('#lpx-pop');
    await pop.waitFor({ state: 'visible' });
    const text = (await pop.innerText()).replace(/\s+/g, ' ');
    for (const w of ['환자 여정 · 대기 — 여정 6 단계 + 단계별 대기 막대 6', 'TOC-UA-MD-PATIENT', '3번째 / 8칸', '늘 1장', '00으로 고정 — 제안서 작성자가 직접 입력', '병의원 묶음 — 세부 업종 4곳 공통', '고객사마다 바뀜', '쓰는 구성', C.MD.sheets[1].f && DATA.layouts.L_TOC_UA_MD_PATIENT.when]) assert.ok(text.includes(w), w + ' — ' + text);
    await pop.locator('.lp-frame iframe').waitFor({ timeout: 30000 });
    assert.match((await pop.frameLocator('iframe').locator('body').innerText()).replace(/\s+/g, ' '), /단계마다 기다리는 시간/);
    await page.screenshot({ path: path.join(out, 'hover.png') });
    await away();
    await pop.waitFor({ state: 'detached' });
  });

  await step('누르면 크게 보기 — Esc 는 크게 보기만 닫는다 · 거르기 「업종마다 다름」', async () => {
    await card.locator('.lpx-sheet[data-layout="L_TOC_UA_MD_ZONE"] button').click();
    const zoom = page.getByRole('dialog', { name: /장표 미리보기$/ });
    await zoom.waitFor();
    assert.match(await zoom.locator('h3').innerText(), /^구역 구성 — /);
    await zoom.locator('.lp-frame iframe').waitFor({ timeout: 30000 });
    assert.match((await zoom.frameLocator('iframe').locator('body').innerText()).replace(/\s+/g, ' '), /수술 · 중환자 .*보호 구역/);
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, 'zoom.png') });
    await page.keyboard.press('Escape');
    await zoom.waitFor({ state: 'detached' });
    assert.equal(await dialog.isVisible(), true);
    await away();
    await dialog.getByRole('button', { name: /^업종마다 다름/ }).click();
    assert.deepEqual(await dialog.locator('.lpx-card').evaluateAll(els => els.map(e => e.dataset.part)), ['ua']);
    assert.equal(await select.inputValue(), 'MD', '거른 뒤에도 고른 업종은 그대로');
    await dialog.getByRole('button', { name: /^전체/ }).click();
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
