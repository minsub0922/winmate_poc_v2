# 테스트 — 히스토리 예시 개편(SEEDV 4) 반영. 최신 테스트 파일에 여러 번 돌려도 같은 결과.  python3 build/hist/tests_patch.py <root>
import sys, os
root = sys.argv[1] if len(sys.argv) > 1 else '.'
def patch(fn, pairs):
    p = os.path.join(root, fn); s = open(p, encoding='utf8').read(); n = 0
    for old, new in pairs:
        if new in s: continue
        if old not in s: print('  !', fn, 'not found:', old[:70].replace('\n', ' ')); continue
        s = s.replace(old, new, 1); n += 1
    open(p, 'w', encoding='utf8').write(s); print(fn, 'patched', n)
FIX = """// fixture: the A 커피 example as it was before the history rework (its 핵심 수치 4 · 제품 3 sheets are what this test drives) — planted once per tab
const A_FIX = JSON.parse(fs.readFileSync(path.resolve(here, 'fixtures/seed_v3_sample.json'), 'utf8')).find((p) => p.id === 'p_seed_acoffee');
const PLANT = `if (!sessionStorage.getItem('fx')) { localStorage.setItem('winmate.v2.proposals', ${JSON.stringify(JSON.stringify([A_FIX]))}); localStorage.setItem('winmate.v2.seedv', '4'); sessionStorage.setItem('fx', '1'); }`;
"""
patch('build/test-detail.mjs', [("async function run(name, opts, fn) { const ctx = await browser.newContext(opts); const page = await ctx.newPage();",
    FIX + "async function run(name, opts, fn) { const ctx = await browser.newContext(opts); const page = await ctx.newPage(); await page.addInitScript(PLANT);")])
patch('build/test-part-focus.mjs', [("const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();",
    FIX + "const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); await page.addInitScript(PLANT);")])
patch('build/test-cover.mjs', [
    ("""  ok((await page.locator('.vinfo .pt').innerText()) === '표지' && /^표지 C/.test(await page.locator('.vinfo .nm').innerText()), 'PPT 레이아웃 shows it: ' + (await page.locator('.vinfo .nm').innerText()));""",
     """  ok((await page.locator('.vinfo .pt').innerText()) === '표지' && COVER.test(await page.locator('.vinfo .nm').innerText()), 'PPT 레이아웃 shows it: ' + (await page.locator('.vinfo .nm').innerText()));"""),
    ("""L('L_IND_FB', 4), L('L_MI01', 5)]), ...t.parts];""",
     """L('L_IND_FB', 4), L('L_MI01', 5)]), ...t.parts.filter((s) => !s.deck)]; // the seed's own 표지 left out — only the old parts carry 표지"""),
    ("""  // a proposal with no 표지 keeps its order and opens where it was
  await page.locator('.sb-item:has-text("커피")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(600);
  ok((await page.locator('.col >> nth=0').locator('.node-name').innerText()) === '시장 · 전략', 'seed without 표지: bubbles unchanged');""",
     """  // a proposal with no 표지 (용산 AI Ready 오피스 — 작성 초기, 표지는 아직) keeps its order and opens where it was
  const E1 = JSON.parse(fs.readFileSync(path.resolve(here, '../src/seeds_parts.json'), 'utf8')).p_seed_eoffice.filter((s) => !s.deck)[0].name;
  await page.locator('.sb-item:has-text("용산")').first().evaluate((e) => e.click()); await page.waitForSelector('.canvas'); await page.waitForTimeout(600);
  ok((await page.locator('.col >> nth=0').locator('.node-name').innerText()) === E1, 'seed without 표지: bubbles unchanged (' + E1 + ')');"""),
])
# test-aisb — 'already there' part follows the reworked A 커피 (its first part is no longer '시장 · 전략')
patch('build/test-aisb.mjs', [("""  { type: 'market', name: '시장 · 전략', items: ['이미 있는 파트 이름 — 다시 넣지 않음'] },""",
     """  { type: 'market', name: 'F&B 매장은 메뉴판부터 화면으로', items: ['이미 있는 파트 이름 — 다시 넣지 않음'] }, // A 커피의 첫 파트(2026-10-19 개편)""")])
# test-aisb — the reworked A 커피 has 7 parts, so the AI may add at most max(3, 10 − 7) = 3 (ai.js moreRange)
patch('build/test-aisb.mjs', [
    ("""  ok(added.join(' | ') === 'M 버거 DT 도입 효과 | 왜 삼성인가 | 단계별 전환 일정 | TCO · 예산', 'added in answer order, no 표지, no repeat of an existing part: ' + added.join(' | '));""",
     """  const want = ['M 버거 DT 도입 효과', '왜 삼성인가', '단계별 전환 일정', 'TCO · 예산'].slice(0, Math.max(3, 10 - before.length)); // ai.js moreRange: the board grows to about 10 parts
  ok(added.join(' | ') === want.join(' | '), 'added in answer order, no 표지, no repeat of an existing part: ' + added.join(' | '));"""),
    ("""  ok(await page.locator('.toast:has-text("AI가 파트 4개를 이어 넣었어요")').count() === 1, 'toast says how many were added');""",
     """  ok(await page.locator(`.toast:has-text("AI가 파트 ${want.length}개를 이어 넣었어요")`).count() === 1, 'toast says how many were added');"""),
])
# test-fav — the reworked A 커피 opens on a done part, so any filled card (작성 중 or 입력 완료) will do
patch('build/test-fav.mjs', [("const filledCard = page.locator('.lcard.st-partial').first();",
     "const filledCard = page.locator('.lcard.st-partial, .lcard.st-done').first(); // 2026-10-19: A 커피 opens on a done part")])
# test-imglib — the reworked A 커피 has no '가치 기둥 × 제품' card; its first card (photo trend cards) has image slots too
patch('build/test-imglib.mjs', [("""  await page.click('.lcard:has(.nm:has-text("가치 기둥 × 제품"))');""",
     """  await page.click('.lcard >> nth=0'); // 2026-10-19: A 커피 첫 장(사진 트렌드 카드)""")])
