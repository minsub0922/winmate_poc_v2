// 원본 레이아웃의 빈 이미지 칸에 넣은 사진 — <img data-fill="img/fill/<묶음>.json#k"> 를 실제 이미지(blob URL)로 바꾼다.
// 사진 150여 장을 주제별 묶음(build/fill/build.py)으로 올려 두고, 그 묶음의 사진이 든 장을 처음 그릴 때 한 번만 받는다.
// 묶음 받기 · 캐시는 배경 사진 묶음과 같은 방식(bgpack.js)을 쓴다.
import { bgUrl, loadBg } from './packs.js';

/** fill the slide's packed pictures — at once if their pack is in, otherwise when it arrives (only for a slide on screen) */
export function hydrateFill(root) {
  if (!root) return;
  for (const im of root.querySelectorAll('img[data-fill]')) {
    const a = im.getAttribute('data-fill');
    const now = bgUrl(a);
    if (now) { if (im.getAttribute('src') !== now) im.setAttribute('src', now); continue; }
    if (!root.isConnected) continue; // a detached copy (reading text blocks …) doesn't need the pictures
    loadBg(a).then((u) => { if (u && im.getAttribute('data-fill') === a && im.getAttribute('src') !== u) im.setAttribute('src', u); });
  }
}

/** every packed picture of the slide loaded (PPT export reads the pixels) */
export async function fillReady(root) {
  if (!root) return;
  await Promise.all(Array.from(root.querySelectorAll('img[data-fill]')).map(async (im) => {
    const u = await loadBg(im.getAttribute('data-fill'));
    if (!u || im.getAttribute('src') === u) return;
    await new Promise((r) => { im.onload = im.onerror = r; im.setAttribute('src', u); });
  }));
}
