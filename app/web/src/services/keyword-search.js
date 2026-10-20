// Shared keyword contract, extracted unchanged from Best Scenario's field-weighted search.
const PARTICLE = /(에서|으로|까지|은|는|이|가|을|를|의|에|도|로|와|과|만)$/;
export function queryWords(q) {
  return [...new Set(String(q || '').toLowerCase().split(/[\s,·.!?'"“”‘’()/]+/)
    .map(w => /^[가-힣]{3,}$/.test(w) ? w.replace(PARTICLE, '') : w)
    .filter(w => w.length >= 2 || /\d/.test(w)))];
}
const bigrams = w => Array.from({ length: Math.max(0, w.length - 1) }, (_, i) => w.slice(i, i + 2));
export function searchFields(fields) {
  return fields.map(([k, values, w]) => {
    const items = [].concat(values || []).filter(Boolean).map(String);
    return { k, items, w, lc: items.join(' \n ').toLowerCase() };
  });
}
function excerpt(item, word) {
  const i = word ? item.toLowerCase().indexOf(word) : -1;
  if (i < 0) return { pre: item.length > 72 ? item.slice(0, 72) + '…' : item, mid: '', post: '' };
  const whole = item.length <= 90;
  const a = whole ? 0 : Math.max(0, i - 26), b = whole ? item.length : Math.min(item.length, i + word.length + 46);
  return { pre: (a > 0 ? '…' : '') + item.slice(a, i), mid: item.slice(i, i + word.length), post: item.slice(i + word.length, b) + (b < item.length ? '…' : '') };
}
export function keywordSearch(query, documents) {
  const words = queryWords(query);
  if (!words.length) return null;
  const results = [];
  for (const doc of documents) {
    let score = 0, hit = 0, snip = null;
    const why = [];
    for (const word of words) {
      let best = null, count = 0;
      for (const field of doc.fields) {
        let match = field.lc.includes(word) ? 1 : 0;
        if (!match && /^[가-힣]{3,}$/.test(word)) {
          const grams = bigrams(word);
          if (grams.filter(g => field.lc.includes(g)).length / grams.length >= .75) match = .6;
        }
        if (!match) continue;
        count++;
        if (!best || field.w * match > best.value) best = { field, value: field.w * match };
      }
      if (!best) continue;
      hit++; score += best.value + Math.min(3, count - 1) * .3;
      if (!why.includes(best.field.k)) why.push(best.field.k);
      if (!snip && best.field.k !== '제목' && best.field.k !== '요약') {
        const item = best.field.k === '업종' ? best.field.items[0] : best.field.items.find(t => t.toLowerCase().includes(word)) || best.field.items[0];
        snip = { k: best.field.k, ...excerpt(item, word) };
      }
    }
    if (hit) results.push({ ...doc, score, hit, why, snip });
  }
  const top = Math.max(0, ...results.map(r => r.hit));
  const min = top === words.length ? top : Math.max(1, top - 1);
  return results.filter(r => r.hit >= min).sort((a, b) => b.hit - a.hit || b.score - a.score);
}
export const snippetText = snip => typeof snip === 'string' ? snip : snip ? snip.pre + snip.mid + snip.post : '';

// Actual document retrieval: BM25 term relevance + TF-IDF cosine, including Korean bigrams.
function tokens(text) {
  return (String(text).toLowerCase().match(/[a-z0-9][a-z0-9.+#_-]*|[가-힣]+/g) || []).flatMap(w => /^[가-힣]+$/.test(w) ? w.length > 1 ? bigrams(w) : [w] : [w]);
}
const frequencies = terms => { const tf = new Map(); for (const term of terms) tf.set(term, (tf.get(term) || 0) + 1); return tf; };
export function retrieveDocuments(query, documents) {
  if (!documents.length) return [];
  const docs = documents.map(doc => {
    const terms = tokens(doc.fields.map(f => f.items.join(' ')).join(' '));
    return { doc, tf: frequencies(terms), len: terms.length };
  });
  const df = new Map();
  for (const d of docs) for (const term of d.tf.keys()) df.set(term, (df.get(term) || 0) + 1);
  const n = docs.length, average = Math.max(1, docs.reduce((sum, d) => sum + d.len, 0) / n);
  const idf = term => Math.log(1 + (n - (df.get(term) || 0) + .5) / ((df.get(term) || 0) + .5));
  const qt = frequencies(tokens(query));
  let qnorm = 0;
  for (const [term, freq] of qt) qnorm += ((1 + Math.log(freq)) * idf(term)) ** 2;
  const ranked = docs.map(({ doc, tf, len }) => {
    let bm25 = 0, dot = 0, norm = 0;
    for (const [term, freq] of tf) norm += ((1 + Math.log(freq)) * idf(term)) ** 2;
    for (const [term, freq] of qt) {
      const f = tf.get(term); if (!f) continue;
      const w = idf(term);
      bm25 += w * f * 2.2 / (f + 1.2 * (.25 + .75 * len / average));
      dot += (1 + Math.log(freq)) * (1 + Math.log(f)) * w * w;
    }
    return { ...doc, bm25, cosine: norm && qnorm ? dot / Math.sqrt(norm * qnorm) : 0 };
  });
  const max = Math.max(1, ...ranked.map(r => r.bm25));
  return ranked.filter(r => r.bm25 > 0).map(r => ({ ...r, score: .65 * r.bm25 / max + .35 * r.cosine })).sort((a, b) => b.score - a.score);
}
