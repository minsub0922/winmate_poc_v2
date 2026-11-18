// Account repositories replace edited records. Reuse each unchanged record's JSON
// across the local cache, sync fingerprint and request-size check.
const serialized = new WeakMap();
// Bound the retained strings even when a history contains many embedded 3D images.
const recent = new Map(), MAX_CHARS = 8 * 1024 * 1024;
let chars = 0;
export function recordJson(record) {
  if (!record || typeof record !== 'object') return JSON.stringify(record);
  let entry = serialized.get(record);
  if (entry?.text !== undefined) { recent.delete(entry); recent.set(entry,true); return entry.text; }
  const text = JSON.stringify(record);
  if (text?.length <= MAX_CHARS) {
    entry = {text}; serialized.set(record,entry);recent.set(entry,true);chars += text.length;
    while (chars > MAX_CHARS || recent.size > 256) {
      const oldest = recent.keys().next().value;recent.delete(oldest);chars -= oldest.text.length;oldest.text = undefined;
    }
  }
  return text;
}
export const recordsJson = records => '[' + records.map(recordJson).join(',') + ']';
