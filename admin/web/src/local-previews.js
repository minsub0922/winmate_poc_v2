// 서버에 없는 장의 미리보기 — 화면 번들에 실린 시트(전체 파트 목록의 업종별 고정 시트 …)가 '레이아웃 f → 미리보기 HTML' 함수를 등록해 둔다.
//   장표 미리보기(layouts.jsx previewOf)가 서버에 묻기 전에 여기부터 본다. 등록한 쪽이 모르는 f 는 null 을 돌려준다.
const sources = [];
export const addLocalPreviews = fn => { if (!sources.includes(fn)) sources.push(fn); };
export function localPreview(f, thumb) {
  for (const fn of sources) { const html = fn(f, thumb); if (html) return html; }
  return null;
}
