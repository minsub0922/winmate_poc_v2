// layouts/ 폴더의 레이아웃 HTML 전체를 { L_XXX: '<div …>' } 로 묶는다. lib/layoutHtml.js 가 동적 import 한다.
const files = import.meta.glob('./layouts/*.html', { query: '?raw', import: 'default', eager: true });

export default Object.fromEntries(
  Object.entries(files).map(([p, html]) => [p.slice('./layouts/'.length, -'.html'.length), html.trim()]),
);
