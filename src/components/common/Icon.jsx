// 선 아이콘 — 24×24 viewBox, stroke = currentColor. name 이 없으면 'dots'.
const PATHS = {
  // part-type icons (lib/parts.js PARTS[*].icon)
  'p-check': 'M10 6h10 M10 12h10 M10 18h10 M3.5 6l1.5 1.5L7.5 5 M3.5 12l1.5 1.5L7.5 11 M3.5 18l1.5 1.5L7.5 17',
  'p-market': 'M4 20v-5 M9 20v-8 M14 20v-6 M19 20v-9 M3 20h18 M4 10l5-4 4 3 7-6 M16 3h4v4',
  'p-scale': 'M12 4v16 M8 20h8 M5 7h14 M5 7l-3 6h6z M19 7l-3 6h6z',
  'p-bulb': 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  'p-boxes': 'M3 13h8v8H3z M13 13h8v8h-8z M8 3h8v8H8z',
  'p-trophy': 'M8 4h8v6a4 4 0 0 1-8 0z M8 6H5v1a3 3 0 0 0 3 3 M16 6h3v1a3 3 0 0 1-3 3 M12 14v4 M8 21h8 M9.5 18h5',
  'p-ruler': 'M4 17L17 4l3 3L7 20z M8.5 12.5l1.5 1.5 M11 10l1.5 1.5 M13.5 7.5l1.5 1.5',
  'p-cover': 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3 M9 7h6 M9 10h4',
  'p-clip': 'M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7',
  clip: 'M9 4h6v3H9z M7 5.5H5V21h14V5.5h-2 M8.5 12h7 M8.5 16h5',
  building: 'M5 21V4h10v17 M15 9h4v12 M8 8h4 M8 12h4 M8 16h4 M3 21h18',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21c.8-4 3.6-6 7-6s6.2 2 7 6 M16 4a4 4 0 0 1 0 7 M18 15c2 .6 3.4 2.6 4 6',
  alert: 'M12 3l10 18H2z M12 10v5 M12 18v.5',
  gem: 'M6 4h12l3 5-9 11L3 9z M3 9h18 M9.5 9L12 20l2.5-11',
  trend: 'M3 17l6-6 4 4 8-8 M15 7h6v6',
  map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
  monitor: 'M3 4h18v12H3z M8 20h8 M12 16v4',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
  layers: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5',
  calendar: 'M4 5h16v16H4z M4 10h16 M9 3v4 M15 3v4',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 9.5c0-1.4 1.3-2 3-2s3 .7 3 2-1.5 1.8-3 2.2-3 .9-3 2.3 1.3 2 3 2 3-.6 3-2 M12 6v1.5 M12 16.5V18',
  flag: 'M5 21V4 M5 4h11l-2 4 2 4H5',
  // ui
  x: 'M6 6l12 12M18 6L6 18', check: 'M5 12l5 5L20 7', chev: 'M9 6l6 6-6 6', chevL: 'M15 6l-6 6 6 6', chevD: 'M6 9l6 6 6-6', chevU: 'M6 15l6-6 6 6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M21 21l-4.5-4.5',
  download: 'M12 4v11 M7 10l5 5 5-5 M4 20h16',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8v.5',
  refresh: 'M20 11a8 8 0 0 0-14.9-3.5 M4 5v3h3 M4 13a8 8 0 0 0 14.9 3.5 M20 19v-3h-3',
  ext: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  dots: 'M5 12h.01 M12 12h.01 M19 12h.01',
};

export function Icon({ name, size = 16, stroke = 2, className = '', title }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : 'true'} role={title ? 'img' : undefined} aria-label={title}>
      <path d={PATHS[name] || PATHS.dots} />
    </svg>
  );
}

/** 2×2 슬라이드 격자 — 템플릿 라이브러리 아이콘 */
export function TemplateIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="8" height="6.5" rx="1.2" /><rect x="13" y="4" width="8" height="6.5" rx="1.2" /><rect x="3" y="13.5" width="8" height="6.5" rx="1.2" /><rect x="13" y="13.5" width="8" height="6.5" rx="1.2" />
    </svg>
  );
}
