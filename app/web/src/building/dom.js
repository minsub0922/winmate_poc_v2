// 작은 DOM 도구 — 스튜디오(ui.js)와 내보낸 HTML 보기(viewer.js)가 같이 쓴다
export const SVG = 'http://www.w3.org/2000/svg';
const PATHS = {
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', check: 'M5 12l5 5L20 7', chev: 'M9 6l6 6-6 6', chevL: 'M15 6l-6 6 6 6',
  arrowR: 'M5 12h14 M13 6l6 6-6 6', arrowL: 'M19 12H5 M11 6l-6 6 6 6', trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  refresh: 'M20 11a8 8 0 0 0-14.9-3.5 M4 5v3h3 M4 13a8 8 0 0 0 14.9 3.5 M20 19v-3h-3', download: 'M12 4v11 M7 10l5 5 5-5 M4 20h16',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1', history: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5 M12 7v5l4 2',
  rotL: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3 M4 4v4.5h4.5', rotR: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3 M20 4v4.5h-4.5',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5', building: 'M5 21V4h10v17 M15 9h4v12 M8 8h4 M8 12h4 M8 16h4 M3 21h18',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  image: 'M4 5h16v14H4z M4 16l4.5-4.5 4 4 3-3 4.5 4.5 M15.5 9.5h.01',
  code: 'M8.5 8l-4 4 4 4 M15.5 8l4 4-4 4 M13.5 5.5l-3 13',
  pencil: 'M4 20h4L18.5 9.5a2.12 2.12 0 0 0-4-4L4 16v4z M13.5 6.5l4 4',
  palette: 'M12 21.5a9.5 9.5 0 1 1 9.5-9.2 4.6 4.6 0 0 1-4.6 4.4h-2.2a1.7 1.7 0 0 0-1.3 2.8l.3.3a1.7 1.7 0 0 1-1.3 2.8z M13.5 6.6h.01 M17.4 10.2h.01 M8.6 7.6h.01 M6.6 12.2h.01',
};
export function icon(name, size = 16, stroke = 2) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', stroke);
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', PATHS[name] || PATHS.plus);
  s.appendChild(p);
  return s;
}
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? e.style.setProperty(sk, sv) : (e.style[sk] = sv); }
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') e.textContent = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}
