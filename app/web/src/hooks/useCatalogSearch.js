import { requireLogin } from '../api/session.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { searchCatalogKeywords, searchCatalogAI } from '../services/catalog-search.js';

/** AI search is always opt-in; only submit freezes a draft as an AI query. */
export function useCatalogSearch(kind, draft, context = {}, items) {
  const [aiEnabled, setEnabled] = useState(false);
  const [request, setRequest] = useState(null);
  const [state, setState] = useState(null);
  const controller = useRef(null), sequence = useRef(0);
  const query = aiEnabled ? request?.query || '' : draft.trim();
  const contextKey = JSON.stringify(context);
  const sourceKey = items ? JSON.stringify(items) : '';
  const requestKey = JSON.stringify([kind, request, contextKey, sourceKey]);
  const keywordHits = useMemo(() => aiEnabled || !query ? null : searchCatalogKeywords(kind, query, items), [kind, query, aiEnabled, items]);
  const clear = () => { sequence.current++; controller.current?.abort(); setRequest(null); setState(null); };
  const setAIEnabled = enabled => { clear(); setEnabled(enabled); };
  const submit = text => {
    const value = (text ?? draft).trim();
    if (!aiEnabled || !value || !requireLogin()) return;
    sequence.current++; controller.current?.abort();
    setRequest({ query: value, nonce: sequence.current });
  };
  useEffect(() => {
    if (!draft.trim()) clear();
  }, [draft.trim() === '']);
  useEffect(() => {
    if (!aiEnabled || !request?.query) return;
    const current = ++sequence.current, ctl = new AbortController(); controller.current = ctl;
    setState({ key: requestKey, busy: true, hits: null, message: '고객 상황에 맞는 자료를 찾고 있어요…', error: '' });
    searchCatalogAI(kind, request.query, { items, context: JSON.parse(contextKey), signal: ctl.signal,
      onProgress: message => { if (!ctl.signal.aborted && current === sequence.current) setState({ key: requestKey, busy: true, hits: null, message, error: '' }); },
    }).then(hits => {
      if (!ctl.signal.aborted && current === sequence.current) setState({ key: requestKey, busy: false, hits, message: '', error: '' });
    }).catch(error => {
      if (!ctl.signal.aborted && current === sequence.current) setState({ key: requestKey, busy: false, hits: null, message: '', error: 'AI 검색을 완료하지 못했어요. 입력 내용은 유지돼요. 다시 시도해 주세요.' });
    });
    return () => ctl.abort();
  }, [aiEnabled, requestKey]);
  const pending = aiEnabled && !!query && (!state || state.key !== requestKey);
  return { aiEnabled, setAIEnabled, query, submit, clear,
    hits: aiEnabled ? query ? pending ? null : state.hits : null : keywordHits,
    busy: pending || !!(aiEnabled && query && state?.busy),
    message: pending ? '고객 상황에 맞는 자료를 찾고 있어요…' : state?.message || '',
    error: aiEnabled && query && !pending ? state?.error || '' : '',
    retry: () => submit(query),
  };
}
