import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { GUIDES } from '../web/src/domain/guides/catalog.js';
import { createGuideTestServer } from './fixtures/guide-server.mjs';
const require = createRequire(new URL('../web/package.json', import.meta.url));
const { parseGIF, decompressFrames, decompressFrame } = require('gifuct-js');
const sharp = require('sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app/web/src/domain/guides/media.json')));
const storyboard = GUIDES.find(guide => guide.id === 'storyboard');
assert.deepEqual(storyboard.steps.slice(0, 8).map(step => step.view), ['new-proposal', 'requirements', 'requirements', 'form', 'attachment', 'requirements', 'match', 'match']);
assert.equal(storyboard.steps[5].focus, 'save', 'Save requirements before entering product matching');
assert(!fs.existsSync(path.join(root, 'app/web/src/components/guides/GuideScene.jsx')), 'Lookalike screen components must be removed');
assert.deepEqual(manifest.storyboard[0].states.map(state => state.screen), ['home', 'empty-requirements', 'requirements-input']);
assert.equal(manifest.storyboard[0].states[1].parts, 0, 'Start with no proposal parts');
assert.equal(manifest.storyboard[0].states[1].requirements, '', 'Start with an empty real requirements form');
assert(manifest.storyboard[0].states[2].requirements.includes('320'), 'Typing changes the real proposal store');
assert.equal(manifest.storyboard[5].states[2].stage, 'match', 'The real Save button enters product matching');
assert.equal(manifest.storyboard[5].states[2].linked, 0, 'Saving opens an unfilled matching tray');
assert(manifest.storyboard[6].states[2].linked > 0, 'Product selection updates the real proposal');
assert.equal(manifest.storyboard[7].states[2].stage, 'story');
assert.equal(manifest.storyboard[7].states[2].parts, 0, 'Matching leads to an empty board ready for part composition');
let total = 0, bytes = 0;
for (const guide of GUIDES) {
  assert.equal(manifest[guide.id]?.length, guide.steps.length, guide.id + ' must have a GIF for every page');
  for (const clip of manifest[guide.id]) {
    assert.equal(clip.source, 'actual-application', 'Every page must record the production app, not a separate illustration');
    assert.deepEqual(clip.recordedViewport, { width: 1320, height: 780 });
    assert.equal(clip.states.length, 3);
    for (const state of clip.states) { assert.match(state.sha256, /^[a-f0-9]{64}$/); assert(state.path.startsWith('/')); assert(state.route); }
    const file = fs.readFileSync(path.join(root, 'app/web/public', clip.src));
    assert.match(file.subarray(0, 6).toString(), /^GIF8[79]a$/);
    const gif = parseGIF(new Uint8Array(file).buffer), frames = decompressFrames(gif, false);
    assert.equal(gif.lsd.width, 880); assert.equal(gif.lsd.height, 520);
    assert(frames.length >= 20, 'The walkthrough must contain motion, not just three still pictures');
    assert(frames.every(frame => frame.delay >= 100), 'At most ten frames per second');
    assert.equal(clip.duration, 4800, 'The walkthrough has a quicker 4.8-second pace');
    assert(Math.abs(frames.reduce((n, frame) => n + frame.delay, 0) - clip.duration) <= 100, 'Timing stays within one frame of the loop');
    assert.equal(file.length, clip.bytes); assert(file.length < 650 * 1024, 'Per-page download budget');
    assert(fs.existsSync(path.join(root, 'app/web/public', clip.poster)));
    const first = decompressFrame(gif.frames.find(frame => frame.image), gif.gct, true);
    assert.equal(first.dims.width, 880); assert.equal(first.dims.height, 520);
    const decoded = await sharp(first.patch, { raw: { width: 880, height: 520, channels: 4 } }).removeAlpha().toBuffer();
    const poster = await sharp(path.join(root, 'app/web/public', clip.poster)).removeAlpha().raw().toBuffer();
    let difference = 0; for (let i = 0; i < decoded.length; i++) difference += Math.abs(decoded[i] - poster[i]);
    assert(difference / decoded.length < 10, 'The encoded GIF must preserve its captured application screen');
    bytes += file.length; total++;
  }
}
assert(bytes < 22 * 1024 * 1024, 'Total actual-screen guide GIF budget');
console.log(`PASS ${total} valid animated GIFs, ${(bytes / 1024 / 1024).toFixed(2)} MiB total; fresh-proposal flow, 880×520, 10 fps, 4.8 seconds`);
async function checkControlReadability(page) {
  const styles = await page.locator('.guide-gif-toolbar button').evaluateAll(buttons => buttons.map(button => {
    const style = getComputedStyle(button), label = getComputedStyle(button.querySelector('span'));
    const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luminance = color => rgb(color).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const foreground = luminance(label.color), background = luminance(style.backgroundColor);
    return { text: button.textContent, contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05), fontSize: parseFloat(style.fontSize), height: button.getBoundingClientRect().height, opacity: style.opacity, labelOpacity: label.opacity, background: style.backgroundColor };
  }));
  assert.equal(styles.length, 2);
  for (const style of styles) {
    assert(style.contrast >= 7, style.text + ' must remain clearly readable in every theme and playback state');
    assert(style.fontSize >= 13); assert(style.height >= 40);
    assert.equal(style.opacity, '1'); assert.equal(style.labelOpacity, '1');
    assert(!style.background.startsWith('rgba'), 'The GIF must not show through the button background');
  }
}
const fixture = await createGuideTestServer();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } }), page = await context.newPage();
  let releaseGif;
  const gifGate = new Promise(resolve => { releaseGif = resolve; });
  await context.route('**/*.gif', async route => { await gifGate; await route.continue(); });
  const errors = [], writes = [], requested = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.url()); if (request.url().endsWith('.gif')) requested.push(request.url()); });
  await page.goto(fixture.base); await page.locator('.app[data-app-ready="true"]').waitFor();
  assert.equal(requested.length, 0, 'No GIF is fetched before opening a guide');
  await page.locator('.sidebar').hover({ position: { x: 20, y: 20 } });
  await page.getByRole('button', { name: '사용 가이드', exact: true }).click({ position: { x: 18, y: 19 } });
  await page.locator('[data-topic="storyboard"]').click();
  const player = page.locator('.guide-gif'), canvas = player.locator('canvas');
  await page.locator('.guide-gif[data-status="loading"]').waitFor();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await checkControlReadability(page);
  }
  releaseGif();
  await page.locator('.guide-gif[data-status="ready"]').waitFor();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await checkControlReadability(page);
    await page.getByRole('button', { name: '화면 GIF 일시정지', exact: true }).hover();
    await checkControlReadability(page);
    await player.locator('.guide-gif-toolbar').screenshot({ path: '/tmp/winmate-guide-controls-' + theme + '.png' });
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  console.log('PASS light/dark and loading/ready/hover controls retain readable contrast, opaque backgrounds and larger text');
  assert.equal(requested.length, 1, 'Only the active page downloads its GIF');
  await page.waitForFunction(() => Number(document.querySelector('.guide-gif canvas')?.dataset.frame) > 0);
  await page.getByRole('button', { name: '화면 GIF 일시정지', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.guide-gif')?.dataset.playing === 'false');
  const paused = await canvas.getAttribute('data-frame');
  await page.evaluate(() => { window.__pausedGuideFrame = document.querySelector('.guide-gif canvas').toDataURL(); });
  await page.waitForTimeout(450);
  assert.equal(await canvas.getAttribute('data-frame'), paused);
  assert(await page.evaluate(() => window.__pausedGuideFrame === document.querySelector('.guide-gif canvas').toDataURL()), 'Pausing freezes the actual displayed frame');
  await page.getByRole('button', { name: '화면 GIF 재생', exact: true }).click();
  await page.waitForFunction(frame => document.querySelector('.guide-gif canvas')?.dataset.frame !== frame, paused);
  await page.getByRole('button', { name: '화면 GIF 일시정지', exact: true }).click();
  await page.getByRole('button', { name: '화면 GIF 처음부터 재시작', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.guide-gif')?.dataset.playing === 'true' && document.querySelector('.guide-gif canvas')?.dataset.frame === '0');
  assert.equal(requested.length, 1, 'Restarting uses decoded frames without another download');
  console.log('PASS exact-frame pause, resume from the paused frame, and restart from frame zero without refetching');
  await page.getByRole('button', { name: '다음 가이드 단계', exact: true }).click();
  await page.locator('.guide-gif[data-status="ready"]').waitFor();
  assert.equal(requested.length, 2);
  const overlay = await player.locator('.guide-gif-toolbar').boundingBox(), screen = await player.boundingBox();
  assert(overlay.x >= screen.x && overlay.y >= screen.y && overlay.x + overlay.width <= screen.x + screen.width);
  await page.getByRole('button', { name: '가이드 닫기', exact: true }).click();
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  await context.close();
  const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } }), mobile = await reduced.newPage();
  await mobile.goto(fixture.base); await mobile.locator('.app[data-app-ready="true"]').waitFor();
  await mobile.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  await mobile.getByRole('button', { name: '사용 가이드', exact: true }).click({ position: { x: 18, y: 19 } });
  await mobile.locator('[data-topic="home"]').click(); await mobile.locator('.guide-gif[data-status="ready"]').waitFor();
  assert(await mobile.getByRole('button', { name: '화면 GIF 재생', exact: true }).isVisible());
  assert.equal(await mobile.locator('.guide-gif canvas').getAttribute('data-frame'), '0');
  await mobile.waitForTimeout(400); assert.equal(await mobile.locator('.guide-gif canvas').getAttribute('data-frame'), '0');
  await mobile.getByRole('button', { name: '화면 GIF 재생', exact: true }).click();
  await mobile.waitForFunction(() => Number(document.querySelector('.guide-gif canvas')?.dataset.frame) > 0);
  const bounds = await mobile.locator('.guide-gif').boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= 390);
  for (const theme of ['light', 'dark']) {
    await mobile.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await checkControlReadability(mobile);
  }
  await mobile.screenshot({ path: '/tmp/winmate-guide-gif-mobile.png' });
  await reduced.close();
  console.log('PASS reduced-motion starts paused; mobile controls stay above the GIF; no model requests or user-data writes');
} finally { await browser?.close(); await fixture.server.close(); }
