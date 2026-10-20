// Preserve the same full PPTX renderer used by My imports, including embedded pictures.
import { convertPptx } from '../slides/import/pptx2html.js';
export async function addPptxPreviews(doc, buffer, onStep) {
  const rendered = await convertPptx(buffer, {
    maxSlides: doc.units.length,
    onProgress: (i, n, phase) => onStep?.(`${i}/${n}${phase === 'image' ? '개 이미지' : '장'} 원본 화면을 준비하는 중`),
  });
  if (rendered.slides.length !== doc.units.length) throw new Error('원본 장수와 화면 수가 다릅니다.');
  doc.units.forEach((u, i) => { u.previewHtml = rendered.slides[i].html; });
  doc.previewImages = [...rendered.images].map(([id, blob]) => ({ id, blob }));
  doc.previewWarnings = rendered.warnings;
  doc.previewVersion = 1;
  return doc;
}

export function sameReviewDocument(review, candidate, previous) {
  const expected = previous?.units || review.units || [];
  if (!expected.length || candidate.units.length !== expected.length) return false;
  const norm = s => String(s || '').replace(/\s/g, '').toLowerCase();
  const matches = expected.filter((u, i) => {
    const text = norm(candidate.units[i].text);
    const title = norm(u.title);
    const before = norm(u.text);
    return (before && before === text) || (title.length >= 4 && text.includes(title));
  });
  return matches.length >= Math.ceil(expected.length * .7);
}
