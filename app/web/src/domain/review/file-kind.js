export const ACCEPT = '.pptx,.pdf,.docx,.txt,.md';
export function fileKind(name) {
  const ext = String(name || '').toLowerCase().split('.').pop();
  if (ext === 'pptx') return 'pptx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt' || ext === 'md') return 'txt';
  if (ext === 'ppt' || ext === 'doc' || ext === 'key' || ext === 'hwp') return 'legacy';
  return 'other';
}
export const KIND_LABEL = { pptx: 'PowerPoint', pdf: 'PDF', docx: 'Word', txt: '텍스트' };

export function isFooter(b) {
  if (!b || !b.text) return false;
  if (b.ph && /sldNum|ftr|dt/.test(b.ph)) return true;
  return b.y > 0.88 && b.h < 0.1 && b.chars < 90;
}
