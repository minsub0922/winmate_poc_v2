import { uid } from '../repositories/proposals.js';
import { parseFiles, fileKind } from '../domain/review/parse.js';
import { saveAttachmentSource } from './attachment-sources.js';
import { sourceDigest } from '../domain/proposals/requirement-summary.js';
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
