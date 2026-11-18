import { uid } from '../repositories/proposals.js';
import { parseFiles, fileKind } from '../domain/review/parse.js';
import { saveAttachmentSource } from './attachment-sources.js';
import { sourceDigest } from '../domain/proposals/requirement-summary.js';
import { extractBlocks, blocksToSegs, splitBlocks, readsHere, extensionOf } from './attachment-extract.js';
import { sourceSeg, segsText } from '../domain/proposals/table-seg.js';
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
    let all = '';let readError='';
    if(file.size>RICH_MAX){records.push({id:uid('f'),name:file.name,size:file.size,type:fileKind(file.name),text:'',memo:'',extractedChars:0,readError:'60MB를 넘는 파일은 나누어 첨부하세요.'});continue;}
    if (TEXTY.test(file.name) || (file.type || '').startsWith('text/')) {
      try { all = await file.text(); } catch {}
    } else if (rich && RICH.has(fileKind(file.name)) && file.size <= RICH_MAX) {
      try { all = unitsText(await parseFiles([file],undefined,{textOnly:true})); } catch (e) { all = ''; readError=e.message||'파일 본문을 읽지 못했습니다.'; }
    }
    if(rich&&!all&&!readError&&!TEXTY.test(file.name)&&!(file.type||'').startsWith('text/'))readError='이 형식의 본문 추출은 지원하지 않습니다. PDF · PPTX · DOCX · TXT로 변환하거나 핵심 메모를 입력하세요.';
    text = all.slice(0, KEEP);
    const rec = { id: uid('f'), name: file.name, size: file.size, type: (file.name.split('.').pop() || '').toLowerCase(), text, memo: '', extractedChars: all.length, ...(readError?{readError}:{}) };
    if (all) { rec.sourceKey = sourceDigest(all.replace(/\r\n/g, '\n').trim()); await saveAttachmentSource(rec.id, all); }
    if (full) rec.fullText = all;
    records.push(rec);
  }
  return records;
}

export const INLINE_MAX = 60000; // characters of one attachment written into the free-form requirement text
const UNREADABLE = '이 형식은 본문을 읽을 수 없어요. PPTX · DOCX · XLSX · PDF · TXT로 저장해 첨부하거나 내용을 직접 적어 주세요.';
/**
 * Attachments for the free-form requirement text (attachment-extract.js reads them — no model). Each file → { record, segs }:
 *   segs    what the file says, ready to append to req.free: a source heading ({ t, src }), then text and table segments
 *   record  the chip: { id, name, size, type, text, memo, inlined: true, inlineChars, inlineKey, note? }
 *           inlineKey fingerprints the appended text, so removing the chip can tell untouched text from edited text.
 * Nothing is dropped. What does not fit in `room` characters stays with the record as its stored source — text (excerpt),
 * extractedChars, sourceKey and the full text in attachment-sources, exactly like an attachment read before — so the
 * summary still reads all of it; tailChars says how much that is. A file that cannot be read is a record with readError.
 */
export async function extractAttachments(files, { room = INLINE_MAX } = {}) {
  const out = [];
  for (const file of Array.from(files || [])) {
    const base = { id: uid('f'), name: file.name, size: file.size, type: extensionOf(file.name), text: '', memo: '' };
    let blocks = [], notes = [];
    try {
      if (file.size > RICH_MAX) throw new Error('60MB를 넘는 파일은 나누어 첨부하세요.');
      if (readsHere(file)) ({ blocks, notes } = await extractBlocks(file));
      else if (fileKind(file.name) === 'pdf') {
        const doc = await parseFiles([file], undefined, { textOnly: true });
        blocks = doc.units.filter(u => !u.hidden && String(u.text || '').trim()).flatMap(u => [{ k: 'h', n: 2, t: u.n + '쪽' }, { k: 'p', t: String(u.text).trim() }]);
      } else throw new Error(UNREADABLE);
      if (!blocks.length) throw new Error('파일에서 읽을 글자를 찾지 못했어요.');
    } catch (error) { out.push({ record: { ...base, readError: error.message || '파일 본문을 읽지 못했습니다.' }, segs: [] }); continue; }
    const [head, rest] = splitBlocks(blocks, Math.max(0, Math.min(room, INLINE_MAX)));
    const record = { ...base, ...(notes.length ? { note: notes.join(' · ') } : {}) };
    let segs = [];
    if (head.length) {
      const body = blocksToSegs(head), last = body[body.length - 1];
      if (!body[0].table) body[0] = { t: '\n' + body[0].t };
      if (last.table) body.push({ t: '\n' }); else body[body.length - 1] = { t: body[body.length - 1].t + '\n' };
      segs = [sourceSeg(record.id, file.name), ...body];
      Object.assign(record, { inlined: true, inlineChars: segsText(body).length, inlineKey: sourceDigest(segsText(segs).trimEnd()) });
    }
    if (rest.length) {
      const tail = segsText(blocksToSegs(rest)).trim();
      Object.assign(record, { text: tail.slice(0, KEEP), extractedChars: tail.length, tailChars: tail.length, sourceKey: sourceDigest(tail) });
      await saveAttachmentSource(record.id, tail);
    }
    out.push({ record, segs });
  }
  return out;
}
