import {FeedbackPopup} from './feedback-popup.jsx';
import React from 'react';
import { Icon } from './common.jsx';
import { snippetText } from '../services/keyword-search.js';
import '../styles/catalog-search.css';

export function CatalogSearchBar({ id, label, value, onChange, search, placeholder, autoFocus }) {
  const clear = () => { search.clear(); onChange(''); };
  const description = search.aiEnabled
    ? '고객 상황을 입력한 뒤 보내기 또는 Enter를 누르면 관련 자료를 찾아 추천해요. 버튼을 다시 누르면 기본 키워드 검색으로 바뀌어요.'
    : 'AI 검색을 켜면 고객 상황과 의도에 맞는 자료를 찾아 추천해요. 입력 후 보내기 또는 Enter로 검색할 수 있어요.';
  return (
    <form className={'catalog-search' + (search.aiEnabled ? ' ai-on' : '')} role="search" aria-label={label}
      onSubmit={e => { e.preventDefault(); search.submit(); }}>
      <span className="catalog-ai-control">
        <button type="button" className="catalog-ai-toggle" aria-pressed={search.aiEnabled} aria-label="AI 검색" aria-describedby={id + '-ai-description'} onClick={() => search.setAIEnabled(!search.aiEnabled)}>
          <Icon name="sparkle" size={18} /><span>AI 검색</span>
        </button>
        <span className="catalog-ai-tooltip" id={id + '-ai-description'} role="tooltip">{description}</span>
      </span>
      <div className="catalog-search-input">
        <label className="sr" htmlFor={id}>{label}</label>
        <input id={id} className="input" value={value} maxLength={2000} autoComplete="off" data-autofocus={autoFocus || undefined}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault();
            if (e.key === 'Escape' && value) { e.preventDefault(); e.stopPropagation(); clear(); }
          }} />
        {value && <button type="button" className="catalog-search-clear" aria-label="검색어 지우기" onClick={clear}><Icon name="x" size={14} /></button>}
      </div>
      {search.aiEnabled && <button type="submit" className="catalog-search-send" disabled={!value.trim()} aria-label="검색 보내기" title="검색 보내기 · Enter"><Icon name="arrowR" size={19} /></button>}
    </form>
  );
}
export function CatalogSearchStatus({ search }) {
  return <FeedbackPopup message={search.error || (search.busy ? search.message || '고객 상황에 맞는 자료를 찾고 있어요…' : '')} kind={search.error?'error':'progress'} actionLabel={search.error?'다시 시도':undefined} onAction={search.retry}/>;
}
export function SearchSnippet({ snippet }) {
  if (!snippet) return null;
  if (typeof snippet === 'string') return snippet;
  return <>{snippet.pre}{snippet.mid && <mark>{snippet.mid}</mark>}{snippet.post}</>;
}
export { snippetText };
