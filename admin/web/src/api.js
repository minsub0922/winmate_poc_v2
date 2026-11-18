export async function api(path, options = {}) {
  const response = await fetch('/admin/api' + path, { credentials: 'same-origin', ...options,
    headers: { ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) location.assign('/login.html?next=' + encodeURIComponent(location.pathname));
    throw new Error(typeof data.detail === 'string' ? data.detail : '요청을 처리하지 못했습니다. 입력값을 확인해 주세요.');
  }
  return data;
}
export const post = (path, value) => api(path, { method: 'POST', body: JSON.stringify(value) });
export const patch = (path, value) => api(path, { method: 'PATCH', body: JSON.stringify(value) });
export const number = value => Number(value || 0).toLocaleString('ko-KR');
/** 1.2만 · 832만 · 1.5억 — exact value goes in a title. */
export function compact(value) {
  const n = Number(value) || 0;
  const trim = (v, digits) => v.toFixed(digits).replace(/\.0$/, '');
  if (n >= 1e8) return trim(n / 1e8, n >= 1e9 ? 0 : 1) + '억';
  if (n >= 1e4) return trim(n / 1e4, n >= 1e6 ? 0 : 1) + '만';
  return number(n);
}
export function date(value, time = false) {
  if (!value) return '기록 없음';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) }).replace(/\. /g, '.').replace(/\.$/, '');
}
export const bytes = value => value < 1024 ? value + ' B' : value < 1024 ** 2 ? (value / 1024).toFixed(1) + ' KB' : (value / 1024 ** 2).toFixed(1) + ' MB';
export const kindNames = { product: '제품', catalog: '카탈로그', category: '제품 분류', solution: '솔루션', case: '도입사례', image: '이미지', layout: '레이아웃', scenario: '시나리오', spatial: '공간 에셋', birdseye: '공간 조감도', building: '건물 조감도', configuration: '운영 기준', industry: '업종', file: '원본 파일', pack: '이미지 묶음', document: '문서', reference: '참고자료' };
export const jobNames = { check: '원본 최신성 점검', refresh: 'DB 최신화', reindex: '에셋 다시 스캔', diagnose: '시스템 진단', analyze: '추가 자료 AI 분석', backup: 'DB 백업', rollback: '이전 버전 복구', 'dss-check': '원천 소스 변경 점검', 'dss-update': '소스 업데이트 · 코드 에이전트', 'dss-delete': '판매 종료 항목 삭제' };
