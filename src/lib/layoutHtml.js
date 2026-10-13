// 레이아웃 HTML 본문 — 1280×720 슬라이드 한 장 = src/data/layouts/<f>.html 하나.
// 인라인 스타일만 쓰고, 편집 가능한 텍스트 칸은 data-tb="<번호>", 이미지 칸은 data-img="<번호>"로 표시돼 있다.
// 446장 전체(약 9MB)를 앱 시작 때 한 번 읽어 둔다(빌드에서는 별도 청크 하나). 이후 layoutHtml(f)는 동기 호출.
let HTML = null;

export async function loadLayoutHtml() {
  if (HTML) return HTML;
  const mod = await import('../data/layouts.js');
  HTML = mod.default;
  return HTML;
}

export function layoutHtml(f) {
  return HTML ? HTML[f] || '' : '';
}
