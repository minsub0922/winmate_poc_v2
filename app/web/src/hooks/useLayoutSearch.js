import { useEffect, useState } from 'react';
import { postJson } from '../api/client.js';
import { L } from '../services/catalog.js';

/** One server RAG search (POST /api/layouts/search). Throws with a readable message when the server can't answer. */
export async function searchLayoutsRemote(payload, signal) {
  const result = await postJson('/api/layouts/search', { ...payload, k: payload.k || 50 }, signal);
  if (!result || result.mode !== 'real' || result.error || !Array.isArray(result.items)) {
    const e = new Error((result && result.message) || '서버 검색 결과를 읽지 못했어요.');
    e.code = (result && result.error) || 'bad_response';
    throw e;
  }
  return result.items.filter((x) => x && L[x.f]).map((x) => ({ l: L[x.f], score: x.score, why: x.why || [], snip: x.when || '' }));
}

/**
 * Server RAG ranking for a query — the only ranking shown as a search result (no local ranking stands in for it).
 * Returns { items, busy, error, message, retry }: items is null while busy and on error (the caller shows no stale
 * list then), error is a readable message, retry() runs the same search again.
 */
export function useLayoutSearch(query, context = {}, enabled = true) {
  const q = query.trim();
  const key = JSON.stringify({ q, part: context.part || '', industry: context.ind || '', products: context.products || [], solutions: context.solutions || [] });
  const [state, setState] = useState(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled || !q) { setState(null); return; }
    const controller = new AbortController();
    setState({ key, busy: true, items: null, error: '', message: '서버 RAG 검색 중…' });
    const timer = setTimeout(async () => {
      try {
        const items = await searchLayoutsRemote(JSON.parse(key), controller.signal);
        if (!controller.signal.aborted) setState({ key, busy: false, items, error: '', message: '서버 RAG 검색 · 최대 50개 후보' });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, busy: false, items: null, error: `서버 검색을 하지 못했어요. ${error.message || ''}`.trim(), message: '' });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, enabled, nonce]);
  const retry = () => setNonce((n) => n + 1);
  if (!enabled || !q) return { items: null, busy: false, error: '', message: '', retry };
  if (!state || state.key !== key) return { items: null, busy: true, error: '', message: '서버 RAG 검색 중…', retry };
  return { ...state, retry };
}
