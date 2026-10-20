// Real provider experiment: current catalog HTML → model design → actual DOM, PNG and PPTX.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(process.env.WINMATE_REFLOW_OUTPUT || path.join(root, 'app/tests/output/layout-refine')); await fs.mkdir(output, { recursive: true });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'winmate-layout-refine-'));
const port = Number(process.env.WINMATE_REFLOW_PORT || 8794);
const api = spawn(path.join(root, 'app/.venv/bin/python'), ['-B', 'app/tests/fixtures/layout-reflow-server.py'], { cwd: root,
  env: { ...process.env, WINMATE_API_PORT: String(port), WINMATE_AUTH_DIR: path.join(temp, 'auth'), WINMATE_STORYBOARD_DIR: path.join(temp, 'shares'), WINMATE_LLM_CACHE: 'off' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; api.stdout.on('data', b => { logs += b; }); api.stderr.on('data', b => { logs += b; });
process.env.WINMATE_API_PORT = String(port);
process.env.WINMATE_WEB_PORT = process.env.WINMATE_REFLOW_WEB_PORT || '5194';
const cacheDir = path.join(output, 'live-vite-cache-' + (process.env.WINMATE_REFLOW_WEB_PORT || '5194'));
const vite = await createServer({ root: path.join(root, 'app/web'), cacheDir, configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error',
  server: { host: '127.0.0.1', port: Number(process.env.WINMATE_REFLOW_WEB_PORT || 5194), strictPort: true, hmr: false, fs: { allow: [path.join(root, 'app/web'), cacheDir] } } });
const modes = new Set(process.argv.slice(2).filter(x => x.startsWith('--')));
const selections = process.argv.slice(2).filter(x => !x.startsWith('--'));
const selected = process.argv.slice(2).length ? selections : ['L_PH_P3_A:2', 'L_PH_P3_A:4', 'L_PH_P3_A:6', 'L_PH_P5_A:2', 'L_PH_P5_A:4', 'L_PH_P5_A:6', 'L_PH_P2_C:3', 'L_P3B:2'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser, activeCase = ''; const results = [], calls = [], errors = [], checks = [];
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/auth/status`)).ok) break; } catch {} if (api.exitCode != null) throw Error(logs); await sleep(500); }
  await vite.listen(); const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch(); const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  const login = await context.request.post(base + '/api/auth/login', { data: { username: 'layout-reflow-test', password: 'layout-reflow-test-synthetic-password' } }); assert.equal(login.status(), 200);
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  page.on('response', async response => {
    if (!response.url().endsWith('/api/llm')) return;
    try { const json = await response.json(); calls.push({ case: activeCase, status: response.status(), model: json.model, usage: json.usage, error: json.message || json.detail, code: json.code, reason: json.reason, data: json.data }); } catch {}
  });
  await page.exposeFunction('reflowProgress', text => console.log('  ' + text));
  await page.goto(base); await page.locator('.home').waitFor();
  await page.evaluate(async () => { await (await import('/src/services/catalog.js')).loadLayoutHtml(); });
  for (const selection of selected) {
    const [f, n] = selection.split(':'), count = Number(n), start = Date.now(); activeCase = selection; console.log('RUN', f, count);
    const result = await page.evaluate(async ({ f, count, designTier }) => {
      const { L, layoutHtml } = await import('/src/services/catalog.js');
      const service = await import('/src/services/layout-reflow.js');
      document.querySelector('.app').style.display = 'none'; document.getElementById('reflow-lab')?.remove();
      const host = document.createElement('div'); host.id = 'reflow-lab'; host.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;background:white'; host.innerHTML = layoutHtml(f); document.body.appendChild(host);
      const original = host.firstElementChild; await document.fonts.ready; await (await import('/src/services/fill.js')).fillReady(original);
      const sourceHtml = original.outerHTML;
      try {
        const improved = await service.improveLayoutCount(original, { meta: L[f], count, ...(designTier ? { designTier } : {}), onProgress: window.reflowProgress });
        if (original.outerHTML !== sourceHtml) throw Error('Original was modified');
        host.innerHTML = improved.html;
        await (await import('/src/services/fill.js')).fillReady(host.firstElementChild);
        await Promise.all([...host.querySelectorAll('img')].map(img => img.decode()));
        return { ok: true, f, count, ...improved };
      } catch (e) {
        const details = e.details;
        const design = details?.attempts?.findLast(x => x.plan);
        if (details?.analysis && design) {
          const source = await service.inspectReflowSource(original, L[f]);
          try { host.innerHTML = service.compileReflow(source, details.analysis, design.plan, count).outerHTML; } finally { source.host.remove(); }
        }
        return { ok: false, f, count, error: e.message, details };
      }
    }, { f, count, designTier: process.env.WINMATE_REFLOW_DESIGN_TIER });
    result.ms = Date.now() - start;
    const stem = f + '-' + count; await page.locator('#reflow-lab > div').screenshot({ path: path.join(output, stem + '.png') });
    await fs.writeFile(path.join(output, stem + '.json'), JSON.stringify(result, null, 2));
    if (result.html) await fs.writeFile(path.join(output, stem + '.html'), result.html);
    results.push(result); console.log(result.ok ? 'PASS' : 'FAIL', stem, result.ok ? `area=${result.quality.occupancy} score=${result.review.score} attempts=${result.stats.designs}` : result.error);
  }
  if (modes.has('--long')) {
    activeCase = 'LONG:L_PH_P3_A:4';
    const text = '카운터 상단 3면 메뉴보드 · 운영팀이 본사에서 아침·점심·저녁 메뉴와 프로모션을 한 번에 전환하고, 매장별 노출 일정과 승인 이력을 확인할 수 있도록 구성';
    await page.evaluate(async text => {
      const { layoutHtml } = await import('/src/services/catalog.js');
      const { fillReady } = await import('/src/services/fill.js');
      document.querySelector('.app').style.display = 'none'; const host = document.createElement('div'); host.id = 'reflow-lab'; host.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;background:white'; host.innerHTML = layoutHtml('L_PH_P3_A'); document.body.appendChild(host);
      const field = [...host.querySelectorAll('[data-tb]')].find(el => el.textContent.replace(/\s+/g, '').includes('카운터상단')); if (!field) throw Error('long-text source field missing');
      field.textContent = text; await fillReady(host.firstElementChild); await Promise.all([...host.querySelectorAll('img')].map(img => img.decode()));
    }, text);
    await page.locator('#reflow-lab > div').screenshot({ path: path.join(output, 'long-text-before.png') });
    const improved = await page.evaluate(async text => {
      const { L } = await import('/src/services/catalog.js');
      const { improveLayoutCount } = await import('/src/services/layout-reflow.js');
      const { fillReady } = await import('/src/services/fill.js');
      const host = document.getElementById('reflow-lab'), original = host.firstElementChild, before = original.outerHTML;
      const result = await improveLayoutCount(original, { meta: L.L_PH_P3_A, count: 4, onProgress: window.reflowProgress });
      if (original.outerHTML !== before) throw Error('Long-text original mutated');
      host.innerHTML = result.html; await fillReady(host.firstElementChild); await Promise.all([...host.querySelectorAll('img')].map(img => img.decode()));
      if (!host.textContent.includes(text)) throw Error('Long Korean content was shortened or lost');
      return { ...result, preservedLongText: true, originalUnchanged: true };
    }, text);
    assert(improved.quality.pass && improved.preservedLongText);
    await page.locator('#reflow-lab > div').screenshot({ path: path.join(output, 'long-text.png') });
    await fs.writeFile(path.join(output, 'long-text.json'), JSON.stringify(improved, null, 2));
    checks.push('Real API: long Korean product description preserved in full, 3→4 passes measured overflow/crop checks'); console.log('PASS', checks.at(-1));
  }
  if (modes.has('--refresh')) {
    const previous = path.join(output, 'iterations', 'before-native-cut-frame'); await fs.mkdir(previous, { recursive: true });
    for (const name of await fs.readdir(output)) {
      if (!/^L_.+-[1-8]\.json$/.test(name)) continue;
      const candidate = JSON.parse(await fs.readFile(path.join(output, name), 'utf8')); if (!candidate.ok) continue;
      const stem = name.slice(0, -5);
      for (const ext of ['json', 'png', 'html', '-vision.json']) {
        const file = ext.startsWith('-') ? stem + ext : stem + '.' + ext;
        try { await fs.copyFile(path.join(output, file), path.join(previous, file)); } catch {}
      }
      const refreshed = await page.evaluate(async candidate => {
        const { L, layoutHtml } = await import('/src/services/catalog.js');
        const { inspectReflowSource, compileReflow, measureReflow, resolveReflowPlan } = await import('/src/services/layout-reflow.js');
        const { fillReady } = await import('/src/services/fill.js');
        document.querySelector('.app').style.display = 'none'; document.getElementById('reflow-lab')?.remove();
        const host = document.createElement('div'); host.id = 'reflow-lab'; host.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;background:white'; host.innerHTML = layoutHtml(candidate.f); document.body.appendChild(host);
        const source = await inspectReflowSource(host.firstElementChild, L[candidate.f]);
        try {
          const plan = resolveReflowPlan(candidate.plan, candidate.analysis, source);
          const root = compileReflow(source, candidate.analysis, plan, candidate.count);
          const old = document.createElement('div'); old.innerHTML = candidate.html;
          root.setAttribute('data-reflow-report', old.firstElementChild.getAttribute('data-reflow-report'));
          host.replaceChildren(root); await fillReady(root); await Promise.all([...root.querySelectorAll('img')].map(img => img.decode()));
          const quality = measureReflow(root, candidate.analysis.region, candidate.count);
          if (!quality.pass) throw Error(candidate.f + '-' + candidate.count + ': ' + quality.issues.join(', '));
          return { ...candidate, plan, html: root.outerHTML, quality: { ...candidate.quality, ...quality, renderedCards: [...root.querySelectorAll('[data-reflow-card]')].map(el => ({ fields: [...el.querySelectorAll('[data-tb]')].map(tb => ({ text: tb.textContent, role: tb.getAttribute('data-reflow-role') })) })) }, rendererRefreshed: new Date().toISOString() };
        } finally { source.host.remove(); }
      }, candidate);
      await page.locator('#reflow-lab > div').screenshot({ path: path.join(output, stem + '.png') });
      await fs.writeFile(path.join(output, stem + '.json'), JSON.stringify(refreshed, null, 2));
      await fs.writeFile(path.join(output, stem + '.html'), refreshed.html);
      checks.push(stem + ': real-model plan re-rendered with current native-aspect image frames'); console.log('PASS', checks.at(-1));
    }
  }
  if (modes.has('--photo-ui') || modes.has('--ui')) {
    // The former count sidebar is now the prompt/approval agent. Run its real-provider UI suite.
    const code = await new Promise((resolve, reject) => {
      const test = spawn(process.execPath, ['app/tests/layout-prompt.mjs'], { cwd: root, env: process.env, stdio: 'inherit' });
      test.once('error', reject); test.once('exit', resolve);
    });
    assert.equal(code, 0, 'Prompt agent UI suite');
    checks.push('Prompt agent UI: recommendations, plan/approval/cancel, real count and position edits, undo, stale guard, My save');
  }
  if (modes.has('--export')) {
    activeCase = 'export';
    const cases = [];
    for (const name of await fs.readdir(output)) {
      if (!/^L_.+-[1-8]\.json$/.test(name)) continue;
      const result = JSON.parse(await fs.readFile(path.join(output, name), 'utf8'));
      if (result.ok) cases.push({ ...result, name });
    }
    const exported = await page.evaluate(async candidates => {
      const { registerLayout, L, layoutHtml } = await import('/src/services/catalog.js');
      const { exportPptx } = await import('/src/domain/slides/export-pptx.js');
      const { applyOverrides } = await import('/src/domain/slides/Slide.jsx');
      const { convertPptx } = await import('/src/domain/slides/import/pptx2html.js');
      const { measureReflow } = await import('/src/services/layout-reflow.js');
      const { fillReady } = await import('/src/services/fill.js');
      const lab = document.createElement('div'); lab.id = 'reflow-export-lab'; lab.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;z-index:1000;background:white'; document.body.appendChild(lab);
      for (const candidate of candidates) {
        lab.innerHTML = candidate.html; await fillReady(lab.firstElementChild); await document.fonts.ready; await Promise.all([...lab.querySelectorAll('img')].map(img => img.decode()));
        const measured = measureReflow(lab.firstElementChild, candidate.analysis.region, candidate.count);
        if (!measured.pass) throw Error(candidate.name + ': ' + measured.issues.join(', '));
      }
      lab.remove();
      const slides = candidates.map((c, i) => { const f = 'L_MY_REFLOW_QA_' + i; registerLayout({ ...L[c.f], f, pc: c.count, c: 'MY', name: c.name }, c.html); return { f, name: c.name, ov: { t: {}, img: {} } }; });
      // Verify a new numbered slot remains editable in the exported drawing.
      slides[0].ov.t = { 0: '개수 변경 PPTX 편집 검증' };
      slides[0].ov.img = { 0: { src: 'img/ph/fb-cafe-counter.jpg', name: '공간별 설치 장면 교체 검증', pid: 'ph.fb-cafe-counter', products: ['qm55c'], fit: 'cover', keep: true } };
      const probe = document.createElement('div'); probe.innerHTML = layoutHtml(slides[0].f);
      const slot = probe.querySelector('[data-img="0"]'), originalStyle = slot.getAttribute('style');
      applyOverrides(probe.firstElementChild, slides[0].ov);
      if (slot.getAttribute('style') !== originalStyle || slot.getAttribute('data-pid') !== 'ph.fb-cafe-counter' || slot.querySelector('img').alt !== '공간별 설치 장면 교체 검증') throw Error('Reflow slot keep/identity override failed');
      const blob = await exportPptx(slides, { title: '제품 개수 재배치 실험' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const parsed = await convertPptx(bytes.buffer, { prefix: 'reflow-qa' });
      const urls = new Map([...parsed.images].map(([id, blob]) => [id, URL.createObjectURL(blob)]));
      const roundtrip = document.createElement('div'); roundtrip.id = 'reflow-roundtrip'; roundtrip.style.cssText = 'position:fixed;left:0;top:0;width:1280px;height:720px;z-index:2000;background:white';
      roundtrip.innerHTML = parsed.slides[0].html.replace(/wmimg:([\w-]+)/g, (match, id) => urls.get(id) || match); document.body.appendChild(roundtrip);
      await document.fonts.ready; await Promise.all([...roundtrip.querySelectorAll('img')].map(img => img.decode()));
      const base64 = await new Promise(r => { const reader = new FileReader(); reader.onload = () => r(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
      return { base64, pages: parsed.slides.map(p => ({ ...p, imgs: undefined })), count: slides.length };
    }, cases);
    await page.locator('#reflow-roundtrip > div').screenshot({ path: path.join(output, 'pptx-roundtrip.png') });
    const deck = Buffer.from(exported.base64, 'base64');
    await fs.writeFile(path.join(output, 'count-reflow-editable.pptx'), deck);
    const JSZip = (await import('../web/node_modules/jszip/lib/index.js')).default;
    const zip = await JSZip.loadAsync(deck); const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide[0-9]+\.xml$/.test(n));
    assert.equal(slides.length, exported.count); assert.equal(exported.pages.length, exported.count);
    let textCount = 0, pictureCount = 0;
    for (const name of slides) { const xml = await zip.file(name).async('string'); textCount += (xml.match(/<a:t>/g) || []).length; pictureCount += (xml.match(/<p:pic>/g) || []).length; }
    const replacement = await fs.readFile(path.join(root, 'app/data/static/img/ph/fb-cafe-counter.jpg'));
    const media = await Promise.all(Object.keys(zip.files).filter(n => n.startsWith('ppt/media/') && !zip.files[n].dir).map(n => zip.file(n).async('nodebuffer')));
    assert(media.some(bytes => bytes.equals(replacement)), 'replacement photo must be a native picture in PPTX');
    assert(textCount >= exported.count * 8); assert(pictureCount >= exported.count);
    assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /개수 변경 PPTX 편집 검증/);
    await fs.writeFile(path.join(output, 'pptx-roundtrip.json'), JSON.stringify({ count: exported.count, textCount, pictureCount, pages: exported.pages }, null, 2));
    checks.push(`${exported.count} real candidates exported/reimported as editable PPTX (${textCount} texts, ${pictureCount} pictures), text/image keep overrides and identity retained`);
    console.log('PASS', checks.at(-1));
  }
  const report = { generatedAt: new Date().toISOString(), real: true, checks, cases: results.map(({ html, ...rest }) => rest), calls, pageErrors: errors };
  await fs.writeFile(path.join(output, 'live-report-' + Date.now() + '.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: results.filter(x => x.ok).length, total: results.length, calls: calls.length, models: [...new Set(calls.map(c => c.model).filter(Boolean))], errors }, null, 2));
} catch (e) { console.error(logs.slice(-2000)); throw e; }
finally { await browser?.close(); await vite.close(); api.kill('SIGTERM'); await new Promise(resolve => api.once('exit', resolve)); await fs.rm(temp, { recursive: true, force: true }); }
if (results.some(x => !x.ok) || errors.length) process.exitCode = 1;
