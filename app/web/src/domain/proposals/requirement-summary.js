export const SUMMARY_SECTIONS = [
  ['background', '배경·현재 문제'], ['goals', '목표·성공 기준'], ['requirements', '필수 요구·제안 범위'],
  ['constraints', '예산·일정·기술 제약'], ['stakeholders', '이해관계자·키맨'], ['decision_criteria', '의사결정 기준'],
  ['risks', '위험·의존 조건'], ['questions', '확인할 질문'], ['strategy', '제안 전략'],
];
export function sourceDigest(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return `${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}-${text.length}`;
}
const plain = (value, refText = ref => '@' + ref) => (Array.isArray(value) ? value.map(x => x?.t ?? (x?.ref ? refText(x.ref) : x?.url || x?.title || '')).join('') : String(value || '')).replace(/\r\n/g, '\n').trim();

/** Keep sources independent: a memo is not the attachment, and an author note is not a customer statement. */
export function requirementSources(p, fileText = file => file.text || '', refText) {
  p = p || {};
  const sources = [], r = p.req || {}, f = r.form || {};
  const add = (id, label, kind, value, extra = {}) => { const text = plain(value, refText); if (text) sources.push({ id, label, kind, text, ...extra }); };
  add('customer', '고객사', 'context', p.customer || f.customer);
  add('industry', '업종', 'context', p.indName || p.ind);
  add('free', '자유형식 요구사항', 'customer', r.free);
  for (const [key, label] of [['project', '프로젝트'], ['customer', '입력 폼 · 고객사'], ['target', '최종 제안 대상']]) add('form-' + key, label, 'context', f[key]);
  (f.keymen || []).forEach((keyman, i) => {
    if (!String(keyman.name || '').trim() && !(keyman.reqs || []).some(value => plain(value))) return;
    const id = keyman.id || String(i), label = keyman.name || `키맨 ${i + 1}`;
    if (String(keyman.name || '').trim()) add('keyman-' + id, label + ' · 역할·가중치', 'stakeholder', `${label}${keyman.weight != null ? ' · 의사결정 가중치 ' + keyman.weight + '%' : ''}`);
    (keyman.reqs || []).forEach((text, j) => add(`keyman-${id}-req-${j}`, `${label} · 요구사항 ${j + 1}`, 'customer', text));
  });
  add('author-note', '제작자 의견', 'author', f.note);
  (r.files || []).forEach((file, i) => {
    const id = file.id || String(i), text = fileText(file);
    add('file-' + id, file.name || `첨부파일 ${i + 1}`, 'attachment', text, { file_id: id, partial: (file.extractedChars || 0) > text.length || !!file.readError });
    add('file-note-' + id, (file.name || '첨부파일') + ' · 작성 메모', 'author', file.memo);
  });
  return sources;
}

/** Stable across reloads when a long original lives in IndexedDB instead of localStorage. */
export function requirementSourceKey(p) {
  const sources = requirementSources(p).map(source => {
    const file = source.file_id && p.req.files.find(f => f.id === source.file_id);
    return file?.sourceKey ? { ...source, text: file.sourceKey, partial: false } : source;
  });
  const files = (p.req?.files || []).map(file => [file.id, file.name, file.size, file.sourceKey, file.extractedChars, file.readError]);
  return 'rq1-' + sourceDigest({ sources, files });
}
/** The last successful result can stay visible while changed inputs await confirmation. */
export function savedRequirementSummary(p) {
  const result = p?.requirementSummary?.result;
  if (result?.llm?.effective !== 'llm' || !Array.isArray(result.sources)) return null;
  const valid = item => typeof item?.text === 'string' && Array.isArray(item.refs) && item.refs.every(ref => typeof ref.source_id === 'string' && typeof ref.quote === 'string');
  return valid(result.summary?.overview) && SUMMARY_SECTIONS.every(([key]) => Array.isArray(result.summary[key]) && result.summary[key].every(valid)) ? result : null;
}
export function currentRequirementSummary(p) {
  const value = p?.requirementSummary;
  if (value?.status !== 'ready' || value.sourceKey !== requirementSourceKey(p)) return null;
  return savedRequirementSummary(p);
}
const PURPOSES = {
  layout: ['requirements', 'constraints', 'goals', 'decision_criteria', 'strategy', 'questions'],
  strategy: ['background', 'goals', 'stakeholders', 'decision_criteria', 'constraints', 'strategy', 'risks', 'questions'],
  matching: ['requirements', 'constraints', 'goals', 'risks'],
  fill: ['requirements', 'goals', 'constraints', 'decision_criteria', 'strategy', 'questions'],
  review: ['goals', 'requirements', 'constraints', 'decision_criteria', 'questions'],
};
export function requirementContext(p, purpose = 'strategy', originals = requirementSources(p)) {
  const result = currentRequirementSummary(p);
  if (!result) return null;
  const context = { source_key: result.source_key, overview: result.summary.overview,
    sections: Object.fromEntries((PURPOSES[purpose] || PURPOSES.strategy).map(key => [key, result.summary[key] || []])),
    sources: result.sources, coverage: result.coverage };
  const refs = [context.overview, ...Object.values(context.sections).flat()].flatMap(item => item.refs);
  let budget = 8000;
  context.originals = [...new Set(refs.map(ref => ref.source_id))].map(id => {
    const source = originals.find(source => source.id === id);
    if (!source || budget <= 0) return null;
    const quotes = refs.filter(ref => ref.source_id === id);
    const located = quotes.map(ref => source.text.indexOf(ref.quote)).filter(at => at >= 0);
    const windows = source.text.length <= 1800 ? [source.text] : [...new Set(located.map(at => source.text.slice(Math.max(0, at - 220), at + 460)))];
    const text = (windows.join('\n[…]\n') || source.text.slice(0, 1000)).slice(0, Math.min(2400, budget));
    budget -= text.length;
    return { source_id: id, label: source.label, kind: source.kind, text, excerpt: text !== source.text, partial: !!source.partial || located.length < quotes.length };
  }).filter(Boolean);
  return context;
}
export function requirementContextText(p, purpose, originals) {
  const context = requirementContext(p, purpose, originals);
  if (!context) return '';
  const kind = { fact: '원문 사실', inference: 'AI 해석·제안', question: '확인 필요' };
  const row = item => `[${kind[item.kind] || item.kind}] ${item.text} ${item.refs.map(ref => `(${ref.source_id}: “${ref.quote}”)`).join(' ')}`;
  return ['--- 원문 근거가 연결된 요구사항 요약 · 원문 우선 ---', row(context.overview),
    ...SUMMARY_SECTIONS.filter(([key]) => context.sections[key]?.length).map(([key, label]) => label + '\n' + context.sections[key].map(row).join('\n')),
    context.originals.length ? '--- 해당 작업과 관련된 원문 · 발췌 여부는 excerpt/partial ---\n' + JSON.stringify(context.originals) : '',
    context.coverage?.complete === false ? '주의: 일부 첨부 원문은 저장된 발췌만 포함합니다. 원문 전체를 확인해야 합니다.' : ''].filter(Boolean).join('\n');
}
