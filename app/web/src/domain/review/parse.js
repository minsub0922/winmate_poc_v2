export { ACCEPT, fileKind, KIND_LABEL, isFooter } from './file-kind.js';

// Keep format checks cheap; load the full geometry/preview parser only for a file.
export async function parseFiles(...args) {
  const { parseFiles } = await import('./parse-document.js');
  return parseFiles(...args);
}
