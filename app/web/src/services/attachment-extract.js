// Attachment → structured blocks, read deterministically in the browser (no model): the free-form requirement text gets
// what the file says, in the file's order. Structure that matters for reading is kept — headings, list levels and
// numbers, slide and sheet boundaries, and tables as real tables (domain/proposals/table-seg.js).
//   block: { k: 'h', n: 1-3, t } · { k: 'p', t } · { k: 'li', t, lv, mark } · { k: 'table', rows: string[][] }
// PPTX · DOCX · XLSX · XLS · CSV · TXT · MD · HTML are read here; PDF goes through the review parser (text per page).
import JSZip from 'jszip';
import { tableSeg, tableMarkdown, tableRows } from '../domain/proposals/table-seg.js';

const xml = text => new DOMParser().parseFromString(text || '<x/>', 'application/xml');
const kids = (el, name) => (el ? Array.from(el.children).filter(child => child.localName === name) : []);
const kid = (el, name) => kids(el, name)[0] || null;
const all = (el, name) => (el ? Array.from(el.getElementsByTagNameNS('*', name)) : []);
/** Attribute by local name (w:val · val). `rel` picks the relationship-namespace one (r:id next to id). */
function attr(el, name, rel = false) {
  if (!el) return null;
  for (const a of el.attributes) if (a.localName === name && (!rel || /relationships/.test(a.namespaceURI || ''))) return a.value;
  return null;
}
const NBSP = new RegExp(String.fromCharCode(160), 'g'), BOM = String.fromCharCode(0xFEFF);
const clean = text => String(text || '').replace(/[\x0b\x0c]/g, '\n').replace(NBSP, ' ').replace(/[ \t]+\n/g, '\n').trim();
const relsPath = file => { const i = file.lastIndexOf('/'); return file.slice(0, i) + '/_rels/' + file.slice(i + 1) + '.rels'; };
function resolvePath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const part of target.split('/')) { if (part === '..') parts.pop(); else if (part && part !== '.') parts.push(part); }
  return parts.join('/');
}
async function openZip(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const text = async file => { const entry = zip.file(file); return entry ? entry.async('string') : ''; };
  const rels = async file => {
    const out = {};
    for (const r of all(xml(await text(relsPath(file))), 'Relationship')) {
      if (r.getAttribute('TargetMode') === 'External') continue;
      out[r.getAttribute('Id')] = { type: (r.getAttribute('Type') || '').split('/').pop(), target: resolvePath(file, r.getAttribute('Target') || '') };
    }
    return out;
  };
  return { zip, text, rels };
}
/** Drop empty rows/columns at the edges and make the grid rectangular. */
function tidyRows(rows) {
  let grid = rows.map(row => row.map(clean));
  grid = grid.filter(row => row.some(Boolean));
  const width = Math.max(0, ...grid.map(row => row.length));
  const used = Array.from({ length: width }, (_, i) => grid.some(row => row[i]));
  return grid.map(row => Array.from({ length: width }, (_, i) => row[i] || '').filter((_, i) => used[i]));
}
/** A real table needs two columns; a single column (a boxed note, a layout frame) reads better as lines. */
function tableBlocks(rows) {
  const grid = tidyRows(rows);
  if (!grid.length) return [];
  if (grid[0].length < 2) return grid.map(row => ({ k: 'p', t: row[0] }));
  return [{ k: 'table', rows: grid }];
}

// ---------------------------------------------------------------- list numbers (DOCX)
const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = n => { let out = ''; for (const [v, s] of ROMAN) while (n >= v) { out += s; n -= v; } return out; };
const letter = n => { let out = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + (n - 1) % 26) + out; return out; };
const GANADA = '가나다라마바사아자차카타파하', CHOSUNG = 'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ';
function counter(n, format) {
  if (format === 'upperLetter') return letter(n);
  if (format === 'lowerLetter') return letter(n).toLowerCase();
  if (format === 'upperRoman') return roman(n);
  if (format === 'lowerRoman') return roman(n).toLowerCase();
  if (format === 'ganada') return GANADA[(n - 1) % 14];
  if (format === 'chosung') return CHOSUNG[(n - 1) % 14];
  if (format === 'decimalEnclosedCircle' && n <= 20) return String.fromCharCode(0x2460 + n - 1);
  return String(n);
}

// ---------------------------------------------------------------- DOCX
async function docxBlocks(buffer) {
  const { text } = await openZip(buffer);
  const body = all(xml(await text('word/document.xml')), 'body')[0];
  if (!body) throw new Error('Word 문서 본문을 찾지 못했어요.');
  const headings = {}, styleLists = {};
  for (const style of all(xml(await text('word/styles.xml')), 'style')) {
    const id = attr(style, 'styleId'), name = attr(kid(style, 'name'), 'val') || '', pPr = kid(style, 'pPr');
    const outline = attr(kid(pPr, 'outlineLvl'), 'val'), numbered = /^(?:heading|제목)\s*(\d)$/i.exec(name);
    const level = /^title$/i.test(name) ? 1 : /^subtitle$/i.test(name) ? 2 : numbered ? +numbered[1] : outline != null && +outline < 9 ? +outline + 1 : 0;
    if (id && level) headings[id] = level;
    const numPr = kid(pPr, 'numPr');
    if (id && numPr && attr(kid(numPr, 'numId'), 'val')) styleLists[id] = { id: attr(kid(numPr, 'numId'), 'val'), level: +(attr(kid(numPr, 'ilvl'), 'val') || 0) };
  }
  const numbering = xml(await text('word/numbering.xml')), abstracts = {}, lists = {};
  for (const a of all(numbering, 'abstractNum')) {
    abstracts[attr(a, 'abstractNumId')] = Object.fromEntries(kids(a, 'lvl').map(lvl => [attr(lvl, 'ilvl'), {
      format: attr(kid(lvl, 'numFmt'), 'val') || 'decimal', text: attr(kid(lvl, 'lvlText'), 'val') || '', start: +(attr(kid(lvl, 'start'), 'val') || 1) }]));
  }
  for (const num of all(numbering, 'num')) lists[attr(num, 'numId')] = abstracts[attr(kid(num, 'abstractNumId'), 'val')] || {};
  const counts = {};
  const marker = (id, level) => {
    const levels = lists[id]; const def = levels && levels[level];
    if (!def || def.format === 'bullet' || def.format === 'none') return '-';
    const state = counts[id] || (counts[id] = []);
    state[level] = (state[level] == null ? def.start - 1 : state[level]) + 1; state.length = level + 1;
    const mark = def.text.replace(/%(\d)/g, (_, i) => { const lv = +i - 1, d = levels[lv] || def; return counter(state[lv] == null ? d.start : state[lv], d.format); }).trim();
    return mark || '-';
  };
  // text of a paragraph in reading order; a text box inside it follows on its own lines
  const runText = el => {
    let out = '';
    const walk = node => {
      for (const child of node.children) {
        const name = child.localName;
        if (name === 't') out += child.textContent;
        else if (name === 'tab') out += '\t';
        else if (name === 'br' || name === 'cr') out += '\n';
        else if (name === 'noBreakHyphen') out += '-';
        else if (name === 'Fallback' || name === 'del' || name === 'moveFrom' || name === 'pPr' || name === 'rPr') continue;
        else if (name === 'p') { out += '\n'; walk(child); }
        else walk(child);
      }
    };
    walk(el);
    return clean(out);
  };
  let images = 0;
  const blocks = [];
  const paragraph = (el, into) => {
    images += all(el, 'drawing').filter(d => !all(d, 'txbxContent').length).length + all(el, 'pict').filter(d => !all(d, 'txbxContent').length).length;
    const value = runText(el); if (!value) return;
    const pPr = kid(el, 'pPr'), style = attr(kid(pPr, 'pStyle'), 'val') || '', outline = attr(kid(pPr, 'outlineLvl'), 'val');
    const level = headings[style] || (outline != null && +outline < 9 ? +outline + 1 : 0);
    if (level) { into.push({ k: 'h', n: Math.min(3, level), t: value.replace(/\n+/g, ' ') }); return; }
    const numPr = kid(pPr, 'numPr');
    const list = numPr ? { id: attr(kid(numPr, 'numId'), 'val'), level: +(attr(kid(numPr, 'ilvl'), 'val') || 0) } : styleLists[style];
    if (list && list.id && list.id !== '0') into.push({ k: 'li', t: value, lv: list.level, mark: marker(list.id, list.level) });
    else into.push({ k: 'p', t: value });
  };
  const lineOf = block => (block.k === 'li' ? '  '.repeat(block.lv) + block.mark + ' ' + block.t : block.k === 'table' ? block.rows.map(row => row.join(' | ')).join('\n') : block.t);
  const cellValue = cell => { const inner = []; walk(cell, inner); return inner.map(lineOf).join('\n'); };
  const table = el => {
    const rows = [];
    for (const tr of all(el, 'tr').filter(tr => tr.parentElement === el || tr.parentElement.parentElement?.parentElement === el)) {
      const row = [];
      for (const tc of kids(tr, 'tc')) {
        const pr = kid(tc, 'tcPr'), span = +(attr(kid(pr, 'gridSpan'), 'val') || 1), merge = kid(pr, 'vMerge');
        row.push(merge && (attr(merge, 'val') || 'continue') !== 'restart' ? '' : cellValue(tc));
        for (let i = 1; i < span; i++) row.push('');
      }
      rows.push(row);
    }
    return tableBlocks(rows);
  };
  function walk(parent, into) {
    for (const el of parent.children) {
      const name = el.localName;
      if (name === 'p') paragraph(el, into);
      else if (name === 'tbl') into.push(...table(el));
      else if (name === 'sdt') { const content = kid(el, 'sdtContent'); if (content) walk(content, into); }
      else if (name === 'customXml' || name === 'smartTag' || name === 'ins') walk(el, into);
    }
  }
  walk(body, blocks);
  return { blocks, notes: images ? [`그림 ${images}개는 글로 옮기지 못했어요`] : [] };
}

// ---------------------------------------------------------------- PPTX
async function pptxBlocks(buffer) {
  const { text, rels } = await openZip(buffer);
  const presentation = xml(await text('ppt/presentation.xml')), presRels = await rels('ppt/presentation.xml');
  const paths = all(presentation, 'sldId').map(el => presRels[attr(el, 'id', true)]?.target).filter(Boolean);
  if (!paths.length) throw new Error('슬라이드를 찾지 못했어요.');
  const size = all(presentation, 'sldSz')[0], slideHeight = +(attr(size, 'cy') || 6858000);
  const paraText = p => clean(Array.from(p.children).map(el => (el.localName === 'r' || el.localName === 'fld' ? kids(el, 't').map(t => t.textContent).join('') : el.localName === 'br' ? '\n' : '')).join(''));
  const bodyText = tx => kids(tx, 'p').map(paraText).filter(Boolean).join('\n');
  const offset = el => {
    const off = all(kid(el, 'spPr') || kid(el, 'grpSpPr') || el, 'off')[0];
    return off && off.parentElement.localName === 'xfrm' ? { x: +(attr(off, 'x') || 0), y: +(attr(off, 'y') || 0) } : null;
  };
  const blocks = []; let hidden = 0, pictures = 0, charts = 0;
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index], slide = xml(await text(path)), slideRels = await rels(path);
    if (attr(slide.documentElement, 'show') === '0') { hidden++; continue; }
    let title = ''; const items = [];
    const chart = async id => {
      const target = slideRels[id]?.target; if (!target) return [];
      const doc = xml(await text(target)), series = all(doc, 'ser');
      const points = ref => Object.fromEntries(all(ref, 'pt').map(pt => [attr(pt, 'idx'), kid(pt, 'v')?.textContent || '']));
      const names = series.map((s, i) => clean(all(kid(s, 'tx'), 'v')[0]?.textContent) || '계열 ' + (i + 1));
      const cats = series.map(s => points(kid(s, 'cat'))), vals = series.map(s => points(kid(s, 'val')));
      const keys = [...new Set(cats.concat(vals).flatMap(Object.keys))].sort((a, b) => a - b);
      if (!series.length || !keys.length) return [];
      const heading = clean(all(all(doc, 'title')[0], 't').map(t => t.textContent).join(''));
      const number = value => (value !== '' && Number.isFinite(+value) ? String(parseFloat((+value).toPrecision(12))) : value);
      const rows = [[heading || '항목', ...names], ...keys.map(key => [cats.find(c => c[key])?.[key] || String(+key + 1), ...vals.map(v => number(v[key] ?? ''))])];
      return [{ k: 'p', t: '[차트]' + (heading ? ' ' + heading : '') }, ...tableBlocks(rows)];
    };
    const diagram = async id => {
      const target = slideRels[id]?.target; if (!target) return [];
      return all(xml(await text(target)), 'pt').filter(pt => !attr(pt, 'type') || attr(pt, 'type') === 'node')
        .map(pt => clean(all(pt, 't').map(t => t.textContent).join(''))).filter(Boolean).map(t => ({ k: 'li', t, lv: 0, mark: '-' }));
    };
    const collect = async (tree, into) => {
      for (const el of tree.children) {
        const name = el.localName;
        if (name === 'grpSp') { const inner = []; await collect(el, inner); if (inner.length) into.push({ at: offset(el), blocks: order(inner) }); continue; }
        if (name === 'pic') { pictures++; continue; }
        if (name === 'AlternateContent') { const choice = kid(el, 'Choice') || kid(el, 'Fallback'); if (choice) await collect(choice, into); continue; }
        if (name === 'graphicFrame') {
          const tbl = all(el, 'tbl')[0], chartRef = all(el, 'chart')[0], diagramRef = all(el, 'relIds')[0];
          let found = [];
          if (tbl) found = tableBlocks(kids(tbl, 'tr').map(tr => kids(tr, 'tc').map(tc => (attr(tc, 'hMerge') || attr(tc, 'vMerge') ? '' : bodyText(kid(tc, 'txBody'))))));
          else if (chartRef) { found = await chart(attr(chartRef, 'id', true)); if (!found.length) charts++; }
          else if (diagramRef) found = await diagram(attr(diagramRef, 'dm', true));
          if (found.length) into.push({ at: offset(el), blocks: found });
          continue;
        }
        if (name !== 'sp' && name !== 'cxnSp') continue;
        const ph = all(kid(el, 'nvSpPr'), 'ph')[0], type = ph ? attr(ph, 'type') || 'body' : '';
        const tx = kid(el, 'txBody'); if (!tx || ['sldNum', 'dt', 'ftr', 'hdr'].includes(type)) continue;
        if ((type === 'title' || type === 'ctrTitle') && !title) { title = bodyText(tx).replace(/\n+/g, ' '); if (title) continue; }
        const found = [];
        for (const p of kids(tx, 'p')) {
          const value = paraText(p); if (!value) continue;
          const pPr = kid(p, 'pPr'), level = +(attr(pPr, 'lvl') || 0);
          const bullet = pPr && (kid(pPr, 'buChar') || kid(pPr, 'buAutoNum')) ? true : pPr && kid(pPr, 'buNone') ? false : type === 'body' || type === 'obj' || level > 0;
          found.push(bullet ? { k: 'li', t: value, lv: level, mark: '-' } : { k: 'p', t: value });
        }
        if (found.length) into.push({ at: offset(el), blocks: found });
      }
    };
    // top to bottom, then left to right — only when every shape says where it is (placeholders may inherit their place)
    const order = list => {
      if (list.some(item => !item.at)) return list.flatMap(item => item.blocks);
      const band = slideHeight * 0.04;
      return list.slice().sort((a, b) => (Math.abs(a.at.y - b.at.y) > band ? a.at.y - b.at.y : a.at.x - b.at.x)).flatMap(item => item.blocks);
    };
    const tree = all(slide, 'spTree')[0];
    if (tree) await collect(tree, items);
    const found = order(items);
    const notesPath = Object.values(slideRels).find(rel => rel.type === 'notesSlide')?.target;
    if (notesPath) {
      const notes = all(xml(await text(notesPath)), 'sp').filter(sp => attr(all(kid(sp, 'nvSpPr'), 'ph')[0], 'type') === 'body').map(sp => bodyText(kid(sp, 'txBody'))).filter(Boolean).join('\n');
      if (notes) found.push({ k: 'p', t: '[발표자 노트] ' + notes });
    }
    // no title placeholder (text boxes only): a short first line above the rest is the slide's title
    if (!title && found.length > 1 && found[0].k === 'p' && found[0].t.length <= 80 && !found[0].t.includes('\n')) title = found.shift().t;
    if (!title && !found.length) continue;
    blocks.push({ k: 'h', n: 2, t: `슬라이드 ${index + 1}` + (title ? ' · ' + title : '') }, ...found);
  }
  const notes = [];
  if (hidden) notes.push(`숨긴 슬라이드 ${hidden}장은 뺐어요`);
  if (pictures || charts) notes.push(`그림 · 차트 ${pictures + charts}개는 글로 옮기지 못했어요`);
  return { blocks, notes };
}

// ---------------------------------------------------------------- spreadsheets
const DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
const COMMA_IDS = new Set([3, 4, 37, 38, 39, 40, 41, 42, 43, 44]);
function formatKind(id, code) {
  const bare = String(code || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  if (DATE_IDS.has(id) || (bare && !/general/i.test(bare) && /[ymdhs]/i.test(bare) && !/[#0]/.test(bare))) return 'date';
  if (id === 9 || id === 10 || bare.includes('%')) return 'percent';
  if (COMMA_IDS.has(id) || /#,##/.test(bare)) return 'comma';
  return '';
}
const two = n => String(n).padStart(2, '0');
function numberText(value, kind, date1904) {
  if (!Number.isFinite(value)) return '';
  if (kind === 'date' && value >= 0 && value < 2958466) {
    const days = Math.floor(value), seconds = Math.round((value - days) * 86400);
    const d = new Date(Date.UTC(1899, 11, 30) + (days + (date1904 ? 1462 : 0)) * 86400000);
    const day = `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
    const time = `${two(Math.floor(seconds / 3600))}:${two(Math.floor(seconds % 3600 / 60))}`;
    return !seconds ? day : days ? day + ' ' + time : time;
  }
  const tidy = parseFloat(value.toPrecision(15));
  if (kind === 'percent') return parseFloat((tidy * 100).toPrecision(12)) + '%';
  if (kind === 'comma') return tidy.toLocaleString('en-US', { maximumFractionDigits: 10 });
  return String(tidy);
}
const columnIndex = ref => { let n = 0; for (const ch of ref) { const c = ch.charCodeAt(0); if (c < 65 || c > 90) break; n = n * 26 + c - 64; } return n - 1; };
const MAX_CELLS = 300000;
/** Sparse cells of one sheet → title lines and tables. Blank rows separate tables; a lone cell above or below one is a line of text. */
function gridBlocks(cells) {
  const rowIds = [...cells.keys()].sort((a, b) => a - b), blocks = [];
  let group = [];
  const flush = () => {
    let rows = group; group = [];
    const lone = row => row.filter(Boolean).length === 1;
    const lead = []; while (rows.length > 1 && lone(rows[0])) lead.push(rows.shift());
    const tail = []; while (rows.length > 1 && lone(rows[rows.length - 1])) tail.unshift(rows.pop());
    for (const row of lead) blocks.push({ k: 'p', t: row.find(Boolean) });
    if (rows.length === 1 && lone(rows[0])) blocks.push({ k: 'p', t: rows[0].find(Boolean) });
    else if (rows.length) blocks.push(...tableBlocks(rows));
    for (const row of tail) blocks.push({ k: 'p', t: row.find(Boolean) });
  };
  let previous = null;
  for (const id of rowIds) {
    const row = []; for (const [col, value] of cells.get(id)) row[col] = clean(value);
    const dense = Array.from(row, value => value || '');
    if (!dense.some(Boolean)) continue;
    if (previous != null && id - previous > 1 && group.length) flush();
    group.push(dense); previous = id;
  }
  if (group.length) flush();
  return blocks;
}
function sheetBlocks(sheets, hidden, cut) {
  const blocks = [];
  for (const sheet of sheets) {
    const found = gridBlocks(sheet.cells);
    if (found.length) blocks.push({ k: 'h', n: 2, t: '시트 · ' + sheet.name }, ...found);
  }
  const notes = [];
  if (hidden) notes.push(`숨긴 시트 ${hidden}개는 뺐어요`);
  if (cut) notes.push(`셀이 ${MAX_CELLS.toLocaleString()}개를 넘어 그 뒤는 읽지 않았어요 — 파일을 나눠 첨부해 주세요`);
  return { blocks, notes };
}

async function xlsxBlocks(buffer) {
  const { text, rels } = await openZip(buffer);
  const workbook = xml(await text('xl/workbook.xml')), bookRels = await rels('xl/workbook.xml');
  const date1904 = ['1', 'true'].includes(attr(all(workbook, 'workbookPr')[0], 'date1904'));
  const shared = all(xml(await text('xl/sharedStrings.xml')), 'si').map(si => Array.from(si.children).filter(el => el.localName === 't' || el.localName === 'r').map(el => (el.localName === 't' ? el.textContent : kids(el, 't').map(t => t.textContent).join(''))).join(''));
  const styles = xml(await text('xl/styles.xml'));
  const codes = Object.fromEntries(all(styles, 'numFmt').map(el => [attr(el, 'numFmtId'), attr(el, 'formatCode')]));
  const kinds = kids(all(styles, 'cellXfs')[0], 'xf').map(xf => { const id = +(attr(xf, 'numFmtId') || 0); return formatKind(id, codes[id]); });
  const sheets = []; let hidden = 0, count = 0, cut = false;
  for (const el of all(workbook, 'sheet')) {
    if ((attr(el, 'state') || 'visible') !== 'visible') { hidden++; continue; }
    const target = bookRels[attr(el, 'id', true)]?.target; if (!target || cut) continue;
    const cells = new Map(); let rowIndex = -1;
    for (const row of all(xml(await text(target)), 'row')) {
      rowIndex = attr(row, 'r') ? +attr(row, 'r') - 1 : rowIndex + 1;
      let col = -1; const line = new Map();
      for (const c of kids(row, 'c')) {
        col = attr(c, 'r') ? columnIndex(attr(c, 'r')) : col + 1;
        const type = attr(c, 't') || 'n', raw = kid(c, 'v')?.textContent ?? '';
        let value = '';
        if (type === 's') value = shared[+raw] || '';
        else if (type === 'inlineStr') value = all(kid(c, 'is'), 't').map(t => t.textContent).join('');
        else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'n') value = raw === '' ? '' : numberText(+raw, kinds[+(attr(c, 's') || 0)], date1904);
        else value = raw;
        if (String(value).trim()) { line.set(col, value); count++; }
      }
      if (line.size) cells.set(rowIndex, line);
      if (count > MAX_CELLS) { cut = true; break; }
    }
    sheets.push({ name: attr(el, 'name') || '시트', cells });
  }
  if (!sheets.length && !hidden) throw new Error('시트를 찾지 못했어요.');
  return sheetBlocks(sheets, hidden, cut);
}

// ---- XLS (Excel 97–2003): compound file → Workbook stream → BIFF8 records
function compoundStream(bytes, names) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 512 || view.getUint32(0, true) !== 0xE011CFD0 || view.getUint32(4, true) !== 0xE11AB1A1) return null;
  const sector = 1 << view.getUint16(0x1E, true), mini = 1 << view.getUint16(0x20, true);
  const fatCount = view.getUint32(0x2C, true), dirStart = view.getUint32(0x30, true), cutoff = view.getUint32(0x38, true);
  const miniFatStart = view.getUint32(0x3C, true), difatCount = view.getUint32(0x48, true);
  const at = s => (s + 1) * sector, END = 0xFFFFFFFA;
  const u32 = offset => (offset + 4 <= bytes.length ? view.getUint32(offset, true) : 0xFFFFFFFF);
  const difat = [];
  for (let i = 0; i < 109 && difat.length < fatCount; i++) difat.push(u32(0x4C + i * 4));
  for (let s = view.getUint32(0x44, true), n = 0; n < difatCount && s < END; n++) {
    for (let i = 0; i < sector / 4 - 1 && difat.length < fatCount; i++) difat.push(u32(at(s) + i * 4));
    s = u32(at(s) + sector - 4);
  }
  const fat = []; for (const s of difat) if (s < END) for (let i = 0; i < sector / 4; i++) fat.push(u32(at(s) + i * 4));
  const chain = (start, table) => { const out = []; for (let s = start; s < END && out.length < table.length + 1; s = table[s] ?? 0xFFFFFFFF) out.push(s); return out; };
  const read = (start, length) => {
    const list = chain(start, fat), out = new Uint8Array(list.length * sector);
    list.forEach((s, i) => out.set(bytes.subarray(at(s), at(s) + sector), i * sector));
    return length == null ? out : out.subarray(0, length);
  };
  const dir = read(dirStart), dirView = new DataView(dir.buffer, dir.byteOffset, dir.byteLength), entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const length = dirView.getUint16(o + 0x40, true); if (length < 2 || length > 64) continue;
    entries.push({ name: new TextDecoder('utf-16le').decode(dir.subarray(o, o + length - 2)), type: dir[o + 0x42], start: dirView.getUint32(o + 0x74, true), size: dirView.getUint32(o + 0x78, true) });
  }
  const root = entries.find(e => e.type === 5), entry = names.map(name => entries.find(e => e.type === 2 && e.name === name)).find(Boolean);
  if (!entry) return null;
  if (entry.size >= cutoff || !root) return read(entry.start, entry.size);
  const stream = read(root.start, root.size), table = read(miniFatStart), tableView = new DataView(table.buffer, table.byteOffset, table.byteLength);
  const miniFat = Array.from({ length: table.length >> 2 }, (_, i) => tableView.getUint32(i * 4, true));
  const list = chain(entry.start, miniFat), out = new Uint8Array(list.length * mini);
  list.forEach((s, i) => out.set(stream.subarray(s * mini, s * mini + mini), i * mini));
  return out.subarray(0, entry.size);
}
function xlsBlocks(buffer) {
  const stream = compoundStream(new Uint8Array(buffer), ['Workbook', 'Book']);
  if (!stream) throw new Error('Excel 통합 문서를 찾지 못했어요. XLSX로 저장해 첨부해 주세요.');
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const record = at => (at + 4 <= stream.length ? { type: view.getUint16(at, true), start: at + 4, length: view.getUint16(at + 2, true) } : null);
  // a string inside one record: cch (1 or 2 bytes), flags, [rich runs], [phonetic size], characters
  const stringAt = (at, wideCount) => {
    const count = wideCount ? view.getUint16(at, true) : stream[at]; let p = at + (wideCount ? 2 : 1);
    const flags = stream[p++]; if (flags & 8) p += 2; if (flags & 4) p += 4;
    let out = '';
    if (flags & 1) for (let i = 0; i < count && p + 1 < stream.length; i++, p += 2) out += String.fromCharCode(view.getUint16(p, true));
    else for (let i = 0; i < count && p < stream.length; i++) out += String.fromCharCode(stream[p++]);
    return out;
  };
  const first = record(0);
  if (!first || first.type !== 0x0809) throw new Error('Excel 문서 형식을 읽지 못했어요. XLSX로 저장해 첨부해 주세요.');
  if (view.getUint16(first.start, true) !== 0x0600) throw new Error('Excel 97 이전 형식은 읽을 수 없어요. XLSX로 저장해 첨부해 주세요.');
  const bound = [], formats = {}, xfs = []; let strings = [], date1904 = false, at = 0;
  for (let rec = record(at); rec; rec = record(at)) {
    const { type, start, length } = rec; at = start + length;
    if (type === 0x002F) throw new Error('암호가 걸린 Excel 파일은 읽을 수 없어요.');
    if (type === 0x0022) date1904 = view.getUint16(start, true) === 1;
    else if (type === 0x041E) formats[view.getUint16(start, true)] = stringAt(start + 2, true);
    else if (type === 0x00E0) xfs.push(view.getUint16(start + 2, true));
    else if (type === 0x0085) bound.push({ offset: view.getUint32(start, true), hidden: (stream[start + 4] & 3) !== 0, sheet: stream[start + 5] === 0, name: stringAt(start + 6, false) });
    else if (type === 0x00FC) {
      // the shared strings continue over CONTINUE records; character data that crosses one restarts with a flag byte
      const parts = [stream.subarray(start, start + length)];
      for (let next = record(at); next && next.type === 0x003C; next = record(at)) { parts.push(stream.subarray(next.start, next.start + next.length)); at = next.start + next.length; }
      let part = 0, p = 8; const total = view.getUint32(start + 4, true);
      const more = () => { while (part < parts.length && p >= parts[part].length) { part++; p = 0; } return part < parts.length; };
      const byte = () => (more() ? parts[part][p++] : 0);
      const word = () => byte() | (byte() << 8);
      strings = [];
      for (let n = 0; n < total && more(); n++) {
        const count = word(), flags = byte(), runs = flags & 8 ? word() : 0, extra = flags & 4 ? (word() | (word() << 16)) >>> 0 : 0;
        let wide = flags & 1, left = count, out = '';
        while (left > 0 && part < parts.length) {
          if (p >= parts[part].length) { part++; p = 0; if (part >= parts.length) break; wide = parts[part][p++] & 1; }
          const room = parts[part].length - p, take = Math.min(left, wide ? room >> 1 : room);
          if (!take) { p = parts[part].length; continue; }
          if (wide) for (let i = 0; i < take; i++, p += 2) out += String.fromCharCode(parts[part][p] | (parts[part][p + 1] << 8));
          else for (let i = 0; i < take; i++) out += String.fromCharCode(parts[part][p++]);
          left -= take;
        }
        for (let skip = runs * 4 + extra; skip > 0 && part < parts.length;) { const step = Math.min(skip, parts[part].length - p); p += step; skip -= step; if (skip > 0) { part++; p = 0; } }
        strings.push(out);
      }
    } else if (type === 0x000A) break;
  }
  const kinds = xfs.map(id => formatKind(id, formats[id]));
  const rk = value => { const n = value & 2 ? value >> 2 : (() => { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, value & 0xFFFFFFFC, true); return b.getFloat64(0, true); })(); return value & 1 ? n / 100 : n; };
  const sheets = []; let hidden = 0, count = 0, cut = false;
  for (const sheet of bound) {
    if (!sheet.sheet) continue;
    if (sheet.hidden) { hidden++; continue; }
    if (cut) continue;
    const cells = new Map(); let depth = 0, pending = null;
    const put = (row, col, value) => { if (!String(value).trim()) return; if (!cells.has(row)) cells.set(row, new Map()); cells.get(row).set(col, value); count++; };
    const number = (row, col, xf, value) => put(row, col, numberText(value, kinds[xf], date1904));
    at = sheet.offset;
    for (let rec = record(at); rec; rec = record(at)) {
      const { type, start, length } = rec; at = start + length;
      if (type === 0x0809) { depth++; continue; }
      if (type === 0x000A) { if (--depth <= 0) break; continue; }
      if (depth !== 1) continue;
      if (type === 0x0207) { if (pending) put(pending[0], pending[1], stringAt(start, true)); pending = null; continue; }
      if (length < 6) continue;
      const row = view.getUint16(start, true), col = view.getUint16(start + 2, true), xf = view.getUint16(start + 4, true);
      if (type === 0x00FD) put(row, col, strings[view.getUint32(start + 6, true)] || '');
      else if (type === 0x0204 || type === 0x00D6) put(row, col, stringAt(start + 6, true));
      else if (type === 0x027E) number(row, col, xf, rk(view.getUint32(start + 6, true)));
      else if (type === 0x0203) number(row, col, xf, view.getFloat64(start + 6, true));
      else if (type === 0x00BD) for (let p = start + 4, c = col; p + 6 <= start + length - 2; p += 6, c++) number(row, c, view.getUint16(p, true), rk(view.getUint32(p + 2, true)));
      else if (type === 0x0205) put(row, col, stream[start + 7] ? '' : stream[start + 6] ? 'TRUE' : 'FALSE');
      else if (type === 0x0006) {
        if (view.getUint16(start + 12, true) === 0xFFFF) { const kind = stream[start + 6]; if (kind === 0) pending = [row, col]; else if (kind === 1) put(row, col, stream[start + 8] ? 'TRUE' : 'FALSE'); }
        else number(row, col, xf, view.getFloat64(start + 6, true));
      }
      if (count > MAX_CELLS) { cut = true; break; }
    }
    sheets.push({ name: sheet.name || '시트', cells });
  }
  if (!sheets.length && !hidden) throw new Error('시트를 찾지 못했어요.');
  return sheetBlocks(sheets, hidden, cut);
}

// ---------------------------------------------------------------- text
/** Bytes → text. UTF-8 first; Korean files saved by older tools are CP949; UTF-16 announces itself with a BOM. */
export function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { try { return new TextDecoder('euc-kr').decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); } }
}
function csvRows(source, delimiter) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) { if (ch === '"') { if (source[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch; }
    else if (ch === '"' && !cell) quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && source[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function csvBlocks(source, name) {
  const head = source.split(/\r?\n/, 5).join('\n');
  const delimiter = /\.tsv$/i.test(name) ? '\t' : [',', '\t', ';'].map(d => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const blocks = tableBlocks(csvRows(source, delimiter));
  return { blocks: blocks.some(b => b.k === 'table') ? blocks : [{ k: 'p', t: clean(source) }], notes: [] };
}
const PIPE = /^\s*\|.*\|\s*$/, RULE = /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/;
/** Plain text stays as written; Markdown pipe tables inside it become tables. */
function textBlocks(source) {
  const lines = String(source).replace(/\r\n?/g, '\n').split('\n'), blocks = []; let plain = [];
  if (lines[0].startsWith(BOM)) lines[0] = lines[0].slice(1);
  const flush = () => { const value = plain.join('\n').replace(/^\n+|\s+$/g, ''); if (value) blocks.push({ k: 'p', t: value }); plain = []; };
  for (let i = 0; i < lines.length; i++) {
    if (PIPE.test(lines[i]) && RULE.test(lines[i + 1] || '')) {
      let end = i + 2; while (end < lines.length && PIPE.test(lines[end])) end++;
      flush();
      blocks.push(...tableBlocks(tableRows(lines.slice(i, end).join('\n'))));
      i = end - 1;
    } else plain.push(lines[i]);
  }
  flush();
  return { blocks, notes: [] };
}
const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'DL', 'DT', 'DD', 'FIGURE', 'FIGCAPTION', 'TR', 'BODY', 'FORM', 'ADDRESS', 'NAV']);
function htmlBlocks(source) {
  const doc = new DOMParser().parseFromString(source, 'text/html'), blocks = []; let inline = '';
  const flush = () => { const value = clean(inline.replace(/[ \t\r\n]+/g, ' ').replace(/ ?\x01 ?/g, '\n')); if (value) blocks.push({ k: 'p', t: value }); inline = ''; };
  const walk = (node, depth) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { inline += child.data; continue; }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'SVG'].includes(tag.toUpperCase())) continue;
      if (tag === 'BR') { inline += '\x01'; continue; }
      if (tag === 'TABLE') { flush(); blocks.push(...tableBlocks(Array.from(child.rows).map(row => Array.from(row.cells).map(cell => cell.innerText ?? cell.textContent)))); continue; }
      if (/^H[1-6]$/.test(tag)) { flush(); const value = clean(child.textContent.replace(/\s+/g, ' ')); if (value) blocks.push({ k: 'h', n: Math.min(3, +tag[1]), t: value }); continue; }
      if (tag === 'LI') {
        flush();
        const own = clean(Array.from(child.childNodes).filter(n => !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))).map(n => n.textContent).join('').replace(/\s+/g, ' '));
        if (own) blocks.push({ k: 'li', t: own, lv: depth, mark: child.parentElement?.tagName === 'OL' ? Array.from(child.parentElement.children).indexOf(child) + 1 + '.' : '-' });
        for (const inner of child.children) if (/^(UL|OL)$/.test(inner.tagName)) walk(inner, depth + 1);
        continue;
      }
      if (BLOCK_TAGS.has(tag)) { flush(); walk(child, depth); flush(); } else walk(child, depth);
    }
  };
  walk(doc.body || doc.documentElement, 0); flush();
  return { blocks, notes: [] };
}

// ---------------------------------------------------------------- blocks → segments
const blockText = block => (block.k === 'h' ? '#'.repeat(block.n) + ' ' + block.t : block.k === 'li' ? '  '.repeat(block.lv || 0) + (block.mark || '-') + ' ' + block.t : block.t);
/** Text length a block adds to the requirement text (what counts against the inline budget). */
export const blockSize = block => (block.k === 'table' ? tableMarkdown(block.rows).length + 2 : blockText(block).length + 1);
/** Blocks → segments of the free-form editor: runs of text, with every table as its own segment. */
export function blocksToSegs(blocks) {
  const segs = []; let text = '', previous = null;
  for (const block of blocks) {
    if (block.k === 'table') { if (text) segs.push({ t: text.replace(/\n+$/, '') }); text = ''; segs.push(tableSeg(block.rows)); }
    else text += (block.k === 'h' && previous ? (previous.k === 'table' ? '\n' : '\n\n') : previous && previous.k !== 'table' ? '\n' : '') + blockText(block);
    previous = block;
  }
  if (text) segs.push({ t: text });
  return segs;
}
/**
 * Split blocks at `budget` characters without cutting a sentence: whole blocks only, except a table longer than the
 * room left, which is split between rows (its header repeats on the second part). → [head, rest]
 */
export function splitBlocks(blocks, budget) {
  let used = 0;
  for (let i = 0; i < blocks.length; i++) {
    const size = blockSize(blocks[i]);
    if (used + size <= budget) { used += size; continue; }
    const block = blocks[i];
    if (block.k === 'p' && block.t.length > 400) {
      const room = budget - used - 1; let cut = block.t.lastIndexOf('\n', room); if (cut < room * 0.5) cut = room;
      if (cut > 0) return [[...blocks.slice(0, i), { k: 'p', t: block.t.slice(0, cut) }], [{ k: 'p', t: block.t.slice(cut).replace(/^\n/, '') }, ...blocks.slice(i + 1)]];
    }
    if (block.k === 'table' && block.rows.length > 2) {
      let rows = 1, taken = tableMarkdown(block.rows.slice(0, 1)).length + 2;
      while (rows < block.rows.length - 1) { const next = tableMarkdown([block.rows[rows]]).split('\n')[0].length + 1; if (used + taken + next > budget) break; taken += next; rows++; }
      if (rows > 1) return [[...blocks.slice(0, i), { k: 'table', rows: block.rows.slice(0, rows) }], [{ k: 'table', rows: [block.rows[0], ...block.rows.slice(rows)] }, ...blocks.slice(i + 1)]];
    }
    return i ? [blocks.slice(0, i), blocks.slice(i)] : [[], blocks];
  }
  return [blocks, []];
}

const OOXML = { pptx: pptxBlocks, pptm: pptxBlocks, ppsx: pptxBlocks, docx: docxBlocks, docm: docxBlocks, xlsx: xlsxBlocks, xlsm: xlsxBlocks };
const TEXT = new Set(['txt', 'md', 'markdown', 'eml', 'json', 'log', 'text']);
export const extensionOf = name => (String(name || '').split('.').pop() || '').toLowerCase();
/** Which files this reader takes (the rest — PDF — goes through the review parser, or is not readable). */
export const readsHere = file => { const ext = extensionOf(file.name); return ext in OOXML || ext === 'xls' || ext === 'csv' || ext === 'tsv' || ext === 'html' || ext === 'htm' || TEXT.has(ext) || (file.type || '').startsWith('text/'); };
/** file → { blocks, notes }. Throws with a message for the person when the file cannot be read. */
export async function extractBlocks(file) {
  const ext = extensionOf(file.name);
  const buffer = await file.arrayBuffer();
  if (ext in OOXML) {
    try { return await OOXML[ext](buffer); }
    catch (error) { throw new Error(/^(슬라이드|시트|Word)/.test(error.message || '') ? error.message : '파일이 손상됐거나 암호가 걸려 있어 읽지 못했어요.'); }
  }
  if (ext === 'xls') return xlsBlocks(buffer);
  const source = decodeText(buffer);
  if (ext === 'csv' || ext === 'tsv') return csvBlocks(source, file.name);
  if (ext === 'html' || ext === 'htm') return htmlBlocks(source);
  return textBlocks(source);
}
