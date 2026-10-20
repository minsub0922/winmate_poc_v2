// 브라우저 안에서 — 한 장의 글 넘침 · 겹침 · 빈 사진 칸 · 자리표시 남음 · 다른 고객 이름을 잰다.
window.MEASURE = function (root, opts) {
  opts = opts || {};
  const rb = root.getBoundingClientRect();
  const vis = (e) => { for (let x = e; x && x !== root.parentElement; x = x.parentElement) { const cs = getComputedStyle(x); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false; } return true; };
  const boxy = (e) => { const cs = getComputedStyle(e); return (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || cs.overflow === 'hidden' || /url\(/.test(cs.backgroundImage); };
  const issues = [];
  const lines = {}; // tb → [rects]
  for (const e of root.querySelectorAll('[data-tb]')) {
    if (!e.textContent.trim() || !vis(e)) continue;
    const i = e.getAttribute('data-tb');
    const rng = document.createRange(); rng.selectNodeContents(e);
    const rs = Array.from(rng.getClientRects()).filter((r) => r.width > 1 && r.height > 1);
    lines[i] = rs;
    if (!rs.length) continue;
    const u = { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) };
    // 1) outside the slide
    if (u.r > rb.right + 1 || u.b > rb.bottom + 1 || u.l < rb.left - 1) issues.push({ type: 'slide', tb: i });
    // 2) clipped by an overflow-hidden ancestor / own box  3) escapes its card
    let clipped = false, escaped = false;
    for (let a = e; a && a !== root; a = a.parentElement) {
      const cs = getComputedStyle(a); const q = a.getBoundingClientRect();
      const hid = cs.overflow === 'hidden' || cs.overflowY === 'hidden' || cs.overflowX === 'hidden' || (cs.webkitLineClamp && cs.webkitLineClamp !== 'none');
      if (hid && (u.r > q.right + 1.5 || u.b > q.bottom + 1.5 || u.l < q.left - 1.5 || u.t < q.top - 1.5)) { clipped = true; break; }
      if (a !== e && boxy(a) && q.width < rb.width - 4 && (u.r > q.right + 2 || u.b > q.bottom + 2 || u.l < q.left - 2)) { escaped = true; break; }
    }
    // line-clamped text that got cut (ellipsis)
    if (!clipped && (e.scrollHeight > e.clientHeight + 2) && /hidden|clip/.test(getComputedStyle(e).overflow)) clipped = true;
    if (clipped) issues.push({ type: 'clip', tb: i });
    if (escaped) issues.push({ type: 'escape', tb: i });
  }
  // 4) two text blocks drawn over each other
  const keys = Object.keys(lines);
  for (let a = 0; a < keys.length; a++) for (let b = a + 1; b < keys.length; b++) {
    const ea = root.querySelector(`[data-tb="${keys[a]}"]`), eb = root.querySelector(`[data-tb="${keys[b]}"]`);
    if (ea.contains(eb) || eb.contains(ea)) continue;
    let hit = 0;
    for (const p of lines[keys[a]]) for (const q of lines[keys[b]]) { const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top); if (w > 2 && h > 3) hit += w * h; }
    if (hit > 30) issues.push({ type: 'overlap', tb: keys[a] + '/' + keys[b] });
  }
  // texts
  const allText = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; const t = n.nodeValue.trim(); if (t && vis(n.parentElement)) allText.push({ t, tb: n.parentElement.closest('[data-tb]') ? n.parentElement.closest('[data-tb]').getAttribute('data-tb') : null }); }
  // images
  const realImg = (im) => im && im.naturalWidth > 4 && !/^data:image\/gif/.test(im.getAttribute('src') || '');
  const slots = Array.from(root.querySelectorAll('[data-img]')).filter(vis).map((e) => {
    const im = e.tagName === 'IMG' ? e : e.querySelector('img'); const q = e.getBoundingClientRect();
    const src = im ? (im.getAttribute('data-fill') || im.getAttribute('src') || '') : '';
    let white = '';
    if (im && realImg(im) && getComputedStyle(im).objectFit === 'cover') {
      try {
        const N = 64; const cv = document.createElement('canvas'); cv.width = N; cv.height = N; const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, N, N);
        const d = cx.getImageData(0, 0, N, N).data; const px = (x, y) => { const k = (y * N + x) * 4; return (d[k] + d[k + 1] + d[k + 2]) / 3; };
        const strip = (f) => { const v = []; for (let t = 0; t < N; t++) v.push(f(t)); const m = v.reduce((a, b) => a + b, 0) / N; const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / N); return m > 247 && sd < 4; };
        const sides = [['위', strip((t) => px(t, 0))], ['아래', strip((t) => px(t, N - 1))], ['왼쪽', strip((t) => px(0, t))], ['오른쪽', strip((t) => px(N - 1, t))]].filter((x) => x[1]).map((x) => x[0]);
        white = sides.join('·');
      } catch (err) { white = ''; }
    }
    return { i: e.getAttribute('data-img'), w: Math.round(q.width), h: Math.round(q.height), filled: realImg(im), src: /^blob:|^data:/.test(src) ? '' : src, nw: im ? im.naturalWidth : 0, nh: im ? im.naturalHeight : 0, fit: im ? getComputedStyle(im).objectFit : '', white };
  }).filter((z) => z.w * z.h > 400);
  // other pictures (not slots) — layout's own images
  const pics = Array.from(root.querySelectorAll('img')).filter((im) => !im.closest('[data-img]') && vis(im)).map((im) => ({ src: im.getAttribute('data-fill') || im.getAttribute('src') || '', ok: realImg(im) }));
  return { issues, texts: allText, slots, pics };
};
