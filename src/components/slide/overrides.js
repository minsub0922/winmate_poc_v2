// 레이아웃 HTML 위에 값(텍스트 · 이미지)을 덮어쓰는 규칙. 화면(Slide)과 PPTX 내보내기가 같은 함수를 쓴다.
//
// ov = {
//   t:   { [data-tb 번호]: '문자열' | { html: '<b>굵게</b> 문장' } },
//   img: { [data-img 번호 | 't<data-tb 번호>' | 's:<고정 라벨>']: { src, name?, fit? } },
//   r:   [[찾을 말, 바꿀 말], …]   // 편집 칸 밖 고정 문구 치환
// }
// 템플릿 라이브러리는 예시 문구 그대로 보여 주므로 ov 가 비어 있다. 제안서 화면을 옮길 때 그대로 쓴다.

const ALLOWED_TAGS = new Set(['SPAN', 'B', 'STRONG', 'EM', 'I', 'BR', 'SUP', 'SUB', 'SMALL']);

/** 인라인 서식만 남긴다(span · b · em · br …, style 속성만). */
export function sanitizeInline(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  const walk = (n) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 1) {
        if (!ALLOWED_TAGS.has(c.tagName)) { c.replaceWith(document.createTextNode(c.textContent)); continue; }
        for (const a of Array.from(c.attributes)) if (a.name !== 'style') c.removeAttribute(a.name);
        walk(c);
      } else if (c.nodeType !== 3) c.remove();
    }
  };
  walk(t.content);
  return t.innerHTML;
}

/** 편집 칸이 아닌 요소 중 자기 글자가 정확히 label 인 것 — 그림 자리 표시 상자. */
function fixedBox(root, label) {
  for (const e of root.querySelectorAll('div, span')) {
    if (e.closest('[data-tb],[data-img]')) continue;
    const own = Array.from(e.childNodes).filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join('').trim();
    if (own === label) return e;
  }
  return null;
}

/** 마운트된 슬라이드 루트에 ov 를 적용한다. pageNo 를 주면 'CONFIDENTIAL · N' 쪽 번호를 바꾼다. */
export function applyOverrides(root, ov, pageNo) {
  if (!root) return;
  const t = (ov && ov.t) || {};
  for (const [i, v] of Object.entries(t)) {
    const el = root.querySelector(`[data-tb="${i}"]`);
    if (!el || v == null) continue;
    if (typeof v === 'object' && v.html != null) el.innerHTML = sanitizeInline(v.html);
    else el.textContent = String(v);
  }
  const im = (ov && ov.img) || {};
  for (const [i, v] of Object.entries(im)) {
    const el = /^t\d+$/.test(i) ? root.querySelector(`[data-tb="${i.slice(1)}"]`)
      : i.startsWith('s:') ? fixedBox(root, i.slice(2))
      : root.querySelector(`[data-img="${i}"]`);
    const src = v && v.src;
    if (!el || !src) continue;
    if (el.tagName === 'IMG') { el.setAttribute('src', src); el.style.objectFit = 'cover'; continue; }
    el.innerHTML = '';
    el.style.padding = '0px';
    el.style.background = 'transparent';
    if (!/^\d+$/.test(i)) el.style.overflow = 'hidden';
    const img = document.createElement('img');
    img.src = src; img.alt = v.name || '';
    img.setAttribute('style', `display:block;width:100%;height:100%;object-fit:${v.fit || 'cover'};`);
    el.appendChild(img);
  }
  const rep = (ov && ov.r) || null;
  if (rep && rep.length) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    for (const n of nodes) {
      if (n.parentElement && n.parentElement.closest('[data-tb]')) continue;
      let s = n.nodeValue; for (const [a, b] of rep) if (a) s = s.split(a).join(b);
      if (s !== n.nodeValue) n.nodeValue = s;
    }
  }
  if (pageNo != null) {
    root.querySelectorAll('[data-tb]').forEach((e) => {
      if (/^CONFIDENTIAL · \d+$/.test(e.textContent.trim())) e.textContent = 'CONFIDENTIAL · ' + pageNo;
    });
  }
}
