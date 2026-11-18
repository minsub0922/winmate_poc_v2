// Table · source segments of the free-form requirement text: every reader gets the content as text, the editor gets rows back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tableMarkdown, tableRows, tableSeg, sourceSeg, isTextSeg, segsText } from '../web/src/domain/proposals/table-seg.js';

test('rows survive the Markdown round trip — pipes, line breaks, empty and ragged cells', () => {
  const rows = [['구분', '조건', '수량'], ['객실', '43인치 이상 | 호텔 모드', '300'], ['연회장', 'LED 올인원\n130인치급', ''], ['로비']];
  const markdown = tableMarkdown(rows);
  assert.equal(markdown.split('\n').length, 5);
  assert.equal(markdown.split('\n')[1], '| --- | --- | --- |');
  assert(markdown.includes('43인치 이상 \\| 호텔 모드') && markdown.includes('LED 올인원<br>130인치급'));
  assert.deepEqual(tableRows(markdown), [rows[0], rows[1], rows[2], ['로비', '', '']]);
  assert.equal(tableMarkdown(tableRows(markdown)), markdown, 'the editor reads back exactly what it was given');
});
test('a table segment is plain text to every other reader', () => {
  const seg = tableSeg([['a', 'b'], ['1', '2']]);
  assert.equal(seg.table, true); assert.equal(seg.t, '\n| a | b |\n| --- | --- |\n| 1 | 2 |\n');
  const segs = [{ t: '앞 글' }, seg, { t: '뒤 글' }, sourceSeg('f1', '요구사항.xlsx'), { ref: 'product:qm55c' }];
  assert.equal(segsText(segs), '앞 글\n| a | b |\n| --- | --- |\n| 1 | 2 |\n뒤 글[첨부] 요구사항.xlsx');
  assert.deepEqual(segs.map(isTextSeg), [true, false, true, false, false]);
});
test('a divider-looking data row and literal backslashes are kept', () => {
  const rows = [['항목', '값'], ['---', '---'], ['경로', 'C:\\temp\\a|b']];
  assert.deepEqual(tableRows(tableMarkdown(rows)), rows);
});
