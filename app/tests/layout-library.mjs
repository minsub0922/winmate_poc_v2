// Real sheet HTML must have the same live edits in Python (agents/admin) and JS (app/PPTX).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { applyLibraryHtml, configureLayoutLibrary, layoutDeleted, registerLibraryGroups } from '../web/src/domain/templates/layout_library.js';
import { slotModes } from '../web/src/domain/templates/layout_slot_modes.js';
import { isFixedContentLayout } from '../web/src/domain/slides/context-policy.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const html = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, 'app/data/runtime/kb/layout_html.json.gz'))));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'winmate-library-parity-'));
const input = path.join(dir, 'input.json');
function python(f, item) {
  fs.writeFileSync(input, JSON.stringify({ html: html[f], item }));
  return execFileSync(path.join(root, 'app/.venv/bin/python'), ['-B', '-c', 'import json,sys;from app.api.layout_library import apply_html;v=json.load(open(sys.argv[1]));sys.stdout.write(apply_html(v["html"],v["item"]))', input], { cwd: root, encoding: 'utf8' });
}
try {
  test('real text/image slots, including a legacy dual-id picture, agree in browser and agent renderers', () => {
    const item = { t: { '3': '관리 표지 & <선택>' }, img: { '0': 'img/ph/of-meeting.jpg' }, modes: { t: { '3': 'fixed', '1': 'ai' }, img: { '0': 'fixed' } }, fill: 'slots' };
    configureLayoutLibrary({ v: 1, rev: 1, items: { L_C01: item } });
    const result = applyLibraryHtml('L_C01', html.L_C01);
    assert.equal(result, python('L_C01', item));
    assert.match(result, /관리 표지 &amp; &lt;선택&gt;/);
    assert.match(result, /src="img\/ph\/of-meeting.jpg"/);
    assert.equal(slotModes('L_C01').t['3'], 'fixed');
    assert.equal(slotModes('L_C01').t['1'], undefined);
    assert.equal(slotModes('L_C01').img['0'], 'fixed');
  });
  test('whole-sheet lock and freeing a sheet override the existing part lock', () => {
    configureLayoutLibrary({ v: 1, rev: 2, items: { L_C01: { fill: 'fixed' }, L_VS_DSS: { fill: 'slots' } } });
    assert.equal(applyLibraryHtml('L_C01', html.L_C01), python('L_C01', { fill: 'fixed' }));
    assert.equal(isFixedContentLayout({ f: 'L_C01' }), true);
    assert.equal(isFixedContentLayout({ f: 'L_VS_DSS' }, { agent: { toc: 'overview' } }), false);
  });
  test('an adopted design replaces the sheet in browser and agent renderers alike, slot edits on top', () => {
    const design = html.L_C01.replace('width: 1280px', 'width: 1280px; outline: 0').replace(/#[0-9a-f]{6}/i, '#123456');
    const item = { design: { html: design, version: 'test' }, t: { '3': '디자인 위 문구' }, modes: { t: { '3': 'fixed' } }, fill: 'slots' };
    configureLayoutLibrary({ v: 1, rev: 5, items: { L_C01: item } });
    const result = applyLibraryHtml('L_C01', html.L_C01);
    assert.equal(result, python('L_C01', item));
    assert.match(result, /#123456/);
    assert.match(result, /디자인 위 문구/);
    configureLayoutLibrary({ v: 1, rev: 6, items: {} });
  });
  test('a new revision clears cached modes and a representative deletion includes its candidates', () => {
    registerLibraryGroups({ L_VARIANT: 'L_C01' });
    configureLayoutLibrary({ v: 1, rev: 3, items: { L_C01: { deleted: true } } });
    assert.equal(layoutDeleted('L_VARIANT'), true);
    configureLayoutLibrary({ v: 1, rev: 4, items: {} });
    assert.equal(layoutDeleted('L_VARIANT'), false);
    assert.equal(slotModes('L_C01').t['3'], undefined);
    assert.equal(applyLibraryHtml('L_C01', html.L_C01), html.L_C01);
  });
} finally {
  // Tests run synchronously above; all generated inputs are isolated from the live registry.
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
}
