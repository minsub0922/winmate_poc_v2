import { uid } from '../repositories/proposals.js';
const TEXTY = /\.(txt|md|csv|eml|json|html?)$/i;
/** Preserve the artifact attachment contract; rich document extraction is a separate mode. */
export async function readAttachments(files) {
  const records = [];
  for (const file of Array.from(files || [])) {
    let text = '';
    if (TEXTY.test(file.name) || (file.type || '').startsWith('text/')) {
      try { text = (await file.text()).slice(0, 20000); } catch {}
    }
    records.push({ id: uid('f'), name: file.name, size: file.size, type: (file.name.split('.').pop() || '').toLowerCase(), text, memo: '' });
  }
  return records;
}
