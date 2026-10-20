import BACKGROUNDS from '../domain/templates/backgrounds.json' with { type: 'json' };
export const BACKGROUND_IMAGES = BACKGROUNDS.images;
export const BACKGROUND_INDUSTRIES = BACKGROUNDS.industries;
const normalize = value => String(value || '').toLowerCase().replace(/[\s·.,()\[\]\/\-_]/g, '');
const terms = value => [...new Set((String(value || '').toLowerCase().match(/[가-힣]{2,}|[a-z]{3,}/g) || []).filter(t => !['사진', '배경', '이미지', '제안서', '레이아웃'].includes(t)))];

/** Recommendation is based on this sheet's industry, actual wording and part, never random order. */
export function rankBackgrounds(images, { industry, text = '', part = '' } = {}) {
  const sheet = normalize(text), words = terms(text);
  return images.map(image => {
    const reasons = [];
    let score = 0;
    if (industry && image.industry === industry) { score += 100; reasons.push('현재 시트 업종'); }
    const vocabulary = terms([image.title, ...image.tags].join(' '));
    const titleHits = terms(image.title).filter(t => normalize(t).length > 1 && sheet.includes(normalize(t)));
    score += Math.min(50, titleHits.length * 14);
    const hits = vocabulary.filter(t => normalize(t).length > 1 && sheet.includes(normalize(t)));
    const overlap = words.filter(t => vocabulary.some(v => normalize(v).includes(normalize(t))));
    if (hits.length || overlap.length) { score += Math.min(45, hits.length * 6 + overlap.length * 2); reasons.push('시트 내용과 연관'); }
    if (image.parts.includes(part)) { score += 12; reasons.push('파트 유형에 적합'); }
    if (image.w >= 1280) score += 3;
    if (image.w / image.h >= 1.5) score += 2;
    if (!industry && !image.industry) score += 8;
    return { ...image, score, reasons };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function backgroundGroups({ industry, text, part, query = '', filter = '' } = {}) {
  const q = normalize(query);
  const pool = BACKGROUND_IMAGES.filter(im => (!filter || im.industry === filter)
    && (!q || normalize([im.title, ...im.tags, BACKGROUND_INDUSTRIES.find(x => x.code === im.industry)?.name].join(' ')).includes(q)));
  const ranked = rankBackgrounds(pool, { industry, text, part });
  const matchesIndustry = industry && ranked.some(im => im.industry === industry);
  const recommended = ranked.filter(im => matchesIndustry ? im.industry === industry : im.reasons.length).slice(0, 6);
  const ids = new Set(recommended.map(im => im.id));
  return { recommended, rest: ranked.filter(im => !ids.has(im.id)), total: ranked.length };
}
