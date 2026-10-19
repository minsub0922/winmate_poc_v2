import { uid } from '../repositories/proposals.js';
import { parseFiles, fileKind } from '../domain/review/parse.js';
const TEXTY = /\.(txt|md|csv|eml|json|html?)$/i;
const RICH = new Set(['pdf', 'pptx', 'docx']); // read with the review parser (domain/review/parse.js) — the same full-text reader the app already ships
const KEEP = 20000;                           // characters stored with the proposal (localStorage)
const RICH_MAX = 60 * 1048576;

/** Units of a parsed document → text with the unit titles as markdown headings (the RFP chunker splits on them). */
function unitsText(doc) {
  return (doc && doc.units ? doc.units : []).filter((u) => !u.hidden).map((u) => {
    const title = String(u.title || '').trim();
    let body = String(u.text || '').trim();
    if (title && body.split('\n')[0].trim() === title) body = body.split('\n').slice(1).join('\n').trim();
    return [title ? '## ' + title : '', body].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n\n');
}

/**
 * Preserve the artifact attachment contract ({id, name, size, type, text, memo}); text is capped at 20,000 characters.
 * PDF · PPTX · DOCX are read with the review parser. With { full: true } each record also carries `fullText`
 * (the whole extracted text, for the server RFP pipeline) — the caller must drop it before storing the record.
 */
export async function readAttachments(files, { full = false, rich = false } = {}) {
  const records = [];
  for (const file of Array.from(files || [])) {
    let text = '';
    let all = '';
    if (TEXTY.test(file.name) || (file.type || '').startsWith('text/')) {
      try { all = await file.text(); } catch {}
    } else if (rich && RICH.has(fileKind(file.name)) && file.size <= RICH_MAX) {
      try { all = unitsText(await parseFiles([file])); } catch (e) { all = ''; }
    }
    text = all.slice(0, KEEP);
    const rec = { id: uid('f'), name: file.name, size: file.size, type: (file.name.split('.').pop() || '').toLowerCase(), text, memo: '' };
    if (full) rec.fullText = all;
    records.push(rec);
  }
  return records;
}
