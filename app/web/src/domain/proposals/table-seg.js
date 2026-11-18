// Segments of the free-form requirement text beyond plain text and @tags.
//   table  { t: '\n| 구분 | 수량 |\n| --- | --- |\n| 객실 | 300 |\n', table: true }
//   source { t: '[첨부] 제안요청서.docx', src: '<file id>' }   — small heading above what was read from that attachment
// `t` always holds the complete text (a table as Markdown rows), so every reader of segments — segPlain · reqText ·
// 요약 원문 · 검색 — receives the content as ordinary text without knowing these kinds. Only the editor draws them.
const cellText = value => String(value ?? '').replace(/\r\n?/g, '\n').trim().replace(/\|/g, '\\|').replace(/\n/g, '<br>');

/** rows: string[][] (first row = header) → Markdown table text. Ragged rows are padded to the widest row. */
export function tableMarkdown(rows) {
  const list = (rows || []).filter(Array.isArray);
  const width = Math.max(1, ...list.map(row => row.length));
  const line = row => '| ' + Array.from({ length: width }, (_, i) => cellText(row[i])).join(' | ') + ' |';
  return [line(list[0] || []), '| ' + Array(width).fill('---').join(' | ') + ' |', ...list.slice(1).map(line)].join('\n');
}
export const tableSeg = rows => ({ t: '\n' + tableMarkdown(rows) + '\n', table: true });
export const sourceSeg = (id, name) => ({ t: '[첨부] ' + name, src: id });

function splitRow(line) {
  const cells = []; let cell = '';
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\' && line[i + 1] === '|') { cell += '|'; i++; }
    else if (line[i] === '|') { cells.push(cell); cell = ''; }
    else cell += line[i];
  }
  cells.push(cell);
  return cells.slice(1, -1).map(value => value.trim().replace(/<br\s*\/?>/gi, '\n'));
}
const DIVIDER = /^\|(\s*:?-{3,}:?\s*\|)+$/;
/** Markdown table text → rows (the divider under the header is dropped). */
export function tableRows(markdown) {
  const lines = String(markdown || '').split('\n').map(line => line.trim()).filter(line => line.startsWith('|') && line.endsWith('|') && line.length > 1);
  return lines.filter((line, i) => !(i === 1 && DIVIDER.test(line))).map(splitRow);
}
/** A plain text segment — the only kind neighbouring text may be merged into. */
export const isTextSeg = seg => !!seg && seg.t != null && !seg.link && !seg.table && !seg.src;
export const segsText = segs => (segs || []).map(seg => (seg.t != null ? seg.t : '')).join('');
