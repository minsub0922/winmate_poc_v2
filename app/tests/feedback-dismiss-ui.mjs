import assert from 'node:assert/strict';
import { build } from '../web/node_modules/esbuild/lib/main.js';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../web/', import.meta.url));
const bundled = await build({ stdin: { resolveDir: root, loader: 'jsx', contents: `
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import {FeedbackPopup,NotificationHost} from './src/components/feedback-popup.jsx';
  const root=createRoot(document.getElementById('fixture'));
  window.renderFeedback=({source='one',message='실행 실패',kind='error',tick=0})=>root.render(<><NotificationHost/><FeedbackPopup source={source} message={message} kind={kind} content={<div>{message}<button onClick={()=>window.clicked=tick}>동작</button></div>}/></>);
` }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'no-css', setup(b) { b.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })); } }] });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<div id="fixture"></div>'); await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const render = async props => { await page.evaluate(props => window.renderFeedback(props), props); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); };
  const close = async () => { await page.getByRole('button', { name: '알림 닫기' }).click(); await page.locator('.feedback-popup').waitFor({ state: 'detached' }); };
  await render({}); await page.locator('.feedback-popup').waitFor(); await close();
  for (let tick = 1; tick <= 4; tick++) { await render({ tick }); assert.equal(await page.locator('.feedback-popup').count(), 0); }
  console.log('PASS dismissed errors stay closed through content/callback rerenders');
  await render({ message: '다른 실패', tick: 5 }); await page.locator('.feedback-popup').waitFor();
  await page.getByRole('button', { name: '동작' }).click(); assert.equal(await page.evaluate(() => window.clicked), 5); await close();
  await render({ source: 'two', message: '다른 실패' }); await page.locator('.feedback-popup').waitFor(); await close();
  console.log('PASS changed errors and new operation IDs show again with current actions');
  await render({ source: 'two', kind: 'progress', message: '진행 중' }); await page.locator('.feedback-popup').waitFor(); await close();
  await render({ source: 'two', kind: 'progress', message: '다음 단계' }); assert.equal(await page.locator('.feedback-popup').count(), 0);
  await render({ source: 'two', kind: 'error', message: '실패' }); await page.locator('.feedback-popup').waitFor();
  console.log('PASS hidden progress stays hidden while its subsequent failure is visible');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
