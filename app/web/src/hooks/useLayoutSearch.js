import { useEffect, useState } from 'react';
import { getBootstrap } from '../api/bootstrap.js';
import { postJson } from '../api/client.js';
import { L } from '../services/catalog.js';

/** Server PoC ranking, with the original browser ranking retained on error. */
export function useLayoutSearch(query, context = {}, enabled = true) {
  const real = getBootstrap().capabilities?.functions?.search?.mode === 'real';
  const q = query.trim();
  const key = JSON.stringify({ q, part: context.part || '', industry: context.ind || '', products: context.products || [], solutions: context.solutions || [] });
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!real || !enabled || !q) { setState(null); return; }
    const controller = new AbortController();
    setState({ key, busy: true, items: null, message: '서버 RAG 검색 중…' });
    const timer = setTimeout(async () => {
      try {
        const payload = { ...JSON.parse(key), k: 50 };
        const result = await postJson('/api/layouts/search', payload, controller.signal);
        if (result.mode !== 'real') throw new Error(result.message || '검색 서버가 더미 모드입니다.');
        if (!controller.signal.aborted) setState({ key, busy: false, items: result.items.filter(x => L[x.f]).map(x => ({ l: L[x.f], score: x.score, why: x.why || [], snip: x.when || '' })), message: '서버 RAG · BM25 + TF-IDF · 최대 50개 후보' });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key, busy: false, items: null, message: `서버 검색을 사용하지 못해 기본 검색으로 표시합니다. ${error.message}` });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key, enabled, real]);
  return real && enabled && q && state?.key === key ? state : { items: null, message: '', busy: false };
}
