// 직접 만드는 파트의 겉모습 에셋 — 색 팔레트 · 아이콘 (관리자 「레이아웃 구성 관리」 → 구성 추가하기 → 새 파트 만들기).
//   사용자 지시 2026-11-16: "새로운 파트를 만들 때는 색상 · 아이콘을 고르고 레이아웃 구성까지 만들어야 해. 그래서 다양한 색상 팔레트와 여러 아이콘 에셋을 미리 만들어 둬."
//   화면 없이 값만 둔다 — 관리자(admin/web/src/layout-builder.jsx)와 앱(구성 카드 · 목차 템플릿의 버블)이 같은 값을 쓴다.
//   색: 버블은 색 바탕에 흰 아이콘이라, 모든 색이 흰색과 3:1 이상 대비가 나게 골랐다(app/tests/custom-compositions.mjs 가 확인).
//   아이콘: 24×24 · 선 굵기 2 · 끝 둥글게 — 앱 Icon(components/common.jsx PATHS)과 같은 한 줄 path 형식. 키는 'pi-' 로 시작해 앱 아이콘 이름과 겹치지 않는다.

/** 색 계열 18 × 단계 3(진하게 · 기본 · 밝게) = 54색 */
export const PART_PALETTE = [
  { id: 'slate', name: '슬레이트', shades: ['#3b4856', '#55636f', '#6f7c87'] },
  { id: 'graphite', name: '그래파이트', shades: ['#222b33', '#38434d', '#4c5864'] },
  { id: 'navy', name: '삼성 남색', shades: ['#0f1f7a', '#1428a0', '#2f46c4'] },
  { id: 'blue', name: '파랑', shades: ['#174a8c', '#1f62b5', '#3478c9'] },
  { id: 'cyan', name: '시안', shades: ['#0a5f78', '#0c7896', '#1388a8'] },
  { id: 'teal', name: '청록', shades: ['#0b605a', '#0f7a72', '#138a88'] },
  { id: 'emerald', name: '에메랄드', shades: ['#0d6248', '#147c5c', '#1c9070'] },
  { id: 'green', name: '초록', shades: ['#22612e', '#2f7d3b', '#3f914a'] },
  { id: 'olive', name: '올리브', shades: ['#55600f', '#6b7a14', '#7f8f1b'] },
  { id: 'amber', name: '호박', shades: ['#7f5200', '#996600', '#b07a06'] },
  { id: 'orange', name: '주황', shades: ['#a2480c', '#c25c12', '#d26d1f'] },
  { id: 'coral', name: '코랄', shades: ['#a8432a', '#c8553a', '#d9694c'] },
  { id: 'red', name: '빨강', shades: ['#9c1f1f', '#c02a2a', '#d84141'] },
  { id: 'pink', name: '핑크', shades: ['#991d59', '#bb2f72', '#d0478a'] },
  { id: 'purple', name: '자주', shades: ['#682982', '#8a37a8', '#a24ec0'] },
  { id: 'violet', name: '보라', shades: ['#53398f', '#6d52ad', '#8466c4'] },
  { id: 'indigo', name: '인디고', shades: ['#33298a', '#4b40c0', '#6158d6'] },
  { id: 'brown', name: '갈색', shades: ['#5e3a22', '#7a4d2f', '#93603d'] },
];
export const SHADE_NAMES = ['진하게', '기본', '밝게'];
/** 색 하나하나 — [{ hex, family, shade, name }] */
export const PART_COLORS = PART_PALETTE.flatMap((f) => f.shades.map((hex, i) => ({ hex, family: f.id, shade: i, name: `${f.name} · ${SHADE_NAMES[i]}` })));
export const DEFAULT_PART_COLOR = '#1f62b5';

/** 아이콘 묶음 — [id, 이름(검색 · 툴팁), path] */
export const PART_ICON_GROUPS = [
  { id: 'space', name: '공간 · 업종', icons: [
    ['pi-store', '매장', 'M4 10v10h16V10 M3 4h18l-1.5 6h-15z M9 20v-5h6v5'],
    ['pi-cafe', '카페 · 외식', 'M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z M17 9h1.5a2.5 2.5 0 0 1 0 5H17 M8 3v2.5 M12 3v2.5'],
    ['pi-building', '빌딩 · 오피스', 'M6 21V3h12v18 M3 21h18 M9.5 7h1 M13.5 7h1 M9.5 11h1 M13.5 11h1 M9.5 15h1 M13.5 15h1'],
    ['pi-home', '주거 · 집', 'M3 11l9-7 9 7 M5 9.5V20h14V9.5 M10 20v-5h4v5'],
    ['pi-hospital', '의료', 'M4 4h16v16H4z M12 8v8 M8 12h8'],
    ['pi-school', '교육', 'M2 9l10-5 10 5-10 5z M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5 M22 9v6'],
    ['pi-hotel', '숙박 · 객실', 'M3 6v13 M3 15h18v4 M21 15v-3a3 3 0 0 0-3-3h-7v6 M5.5 11.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0'],
    ['pi-factory', '제조 · 공장', 'M3 21V10l5 3v-3l5 3v-3l5 3V4h3v17z M7 17h2 M12 17h2 M17 17h2'],
    ['pi-warehouse', '물류 · 창고', 'M3 21V9l9-5 9 5v12 M7 21v-8h10v8 M7 17h10'],
    ['pi-cart', '리테일 · 쇼핑', 'M3 4h2.5l2.2 10.5h10.6L20.5 7H6.3 M8 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0 M15.5 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0'],
    ['pi-car', '모빌리티', 'M4 16v-4l2-5h12l2 5v4z M4 12h16 M7 19v-3 M17 19v-3 M7.5 14h.01 M16.5 14h.01'],
    ['pi-pin', '위치 · 거점', 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z M9.5 9.5a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0'],
    ['pi-map', '지도 · 공간 맵', 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15'],
  ] },
  { id: 'people', name: '사람 · 경험', icons: [
    ['pi-user', '사용자', 'M8 8a4 4 0 1 0 8 0 4 4 0 1 0-8 0 M4 21c1-4 4-6 8-6s7 2 8 6'],
    ['pi-users', '고객 · 이해관계자', 'M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0 M2 21c.8-4 3.6-6 7-6s6.2 2 7 6 M16 4a4 4 0 0 1 0 7 M18 15c2 .6 3.4 2.6 4 6'],
    ['pi-smile', '고객 경험', 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0 M8.5 14a4.5 4.5 0 0 0 7 0 M9 9.5h.01 M15 9.5h.01'],
    ['pi-heart', '케어 · 만족', 'M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z'],
    ['pi-chat', '대화 · 상담', 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5'],
    ['pi-quote', '고객의 목소리', 'M4 12h5v6H4v-5c0-3 1.5-5 4-6 M14 12h5v6h-5v-5c0-3 1.5-5 4-6'],
    ['pi-handshake', '협력 · 파트너', 'M2 11l4-4 4 1.5 M22 11l-4-4h-4.5l-4.5 4.5a1.6 1.6 0 0 0 2.3 2.3L14 12l4 4 M6 7l-4 4 6.5 6.5 1.5-.5 M10.5 18.5l1.5 1.5 1.5-1 M13 16.5l2 2'],
    ['pi-eye', '모니터링 · 관찰', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0'],
    ['pi-bell', '알림 · 안내', 'M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 21h4'],
  ] },
  { id: 'business', name: '비즈니스 · 성과', icons: [
    ['pi-briefcase', '비즈니스', 'M3 7h18v13H3z M8 7V4h8v3 M3 12h18'],
    ['pi-target', '목표', 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0 M7 12a5 5 0 1 0 10 0 5 5 0 1 0-10 0 M11 12a1 1 0 1 0 2 0 1 1 0 1 0-2 0'],
    ['pi-chart', '지표 · 수치', 'M3 3v18h18 M7 16v-4 M11 16V8 M15 16v-6 M19 16V6'],
    ['pi-pie', '구성비 · 점유율', 'M21 12a9 9 0 1 1-9-9v9z M15 3.5A9 9 0 0 1 20.5 9H15z'],
    ['pi-trend', '성장 · 효과', 'M3 17l6-6 4 4 8-8 M15 7h6v6'],
    ['pi-coin', '비용 · 투자', 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0 M9 9.5c0-1.4 1.3-2 3-2s3 .7 3 2-1.5 1.8-3 2.2-3 .9-3 2.3 1.3 2 3 2 3-.6 3-2 M12 6v1.5 M12 16.5V18'],
    ['pi-receipt', '견적 · 조건', 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3'],
    ['pi-scale', '비교', 'M12 4v16 M8 20h8 M5 7h14 M5 7l-3 6h6z M19 7l-3 6h6z'],
    ['pi-award', '수상 · 인증', 'M6 9a6 6 0 1 0 12 0 6 6 0 1 0-12 0 M8.5 14L7 21l5-3 5 3-1.5-7'],
    ['pi-trophy', '성과 · 사례', 'M8 4h8v6a4 4 0 0 1-8 0z M8 6H5v1a3 3 0 0 0 3 3 M16 6h3v1a3 3 0 0 1-3 3 M12 14v4 M8 21h8 M9.5 18h5'],
    ['pi-star', '핵심 · 강점', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
    ['pi-flag', '결론 · 다음 단계', 'M5 21V4 M5 4h11l-2 4 2 4H5'],
    ['pi-rocket', '도입 · 시작', 'M12 15l-3-3a12 12 0 0 1 10-9 12 12 0 0 1-7 12z M9 12H5l3-4h4 M12 15v4l4-3v-4 M6 16c-1.5.5-2.5 2-3 5 3-.5 4.5-1.5 5-3'],
    ['pi-compass', '전략 · 방향', 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0 M15.5 8.5l-2 5-5 2 2-5z'],
    ['pi-bulb', '아이디어 · 시사점', 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z'],
    ['pi-puzzle', '과제 · 해결', 'M4 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H4v-4a2 2 0 1 0 0-4z'],
  ] },
  { id: 'tech', name: '기술 · AI', icons: [
    ['pi-spark', 'AI', 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z M19 3v3 M17.5 4.5h3'],
    ['pi-cpu', '칩 · 프로세서', 'M7 7h10v10H7z M10 10h4v4h-4z M9.5 3v4 M14.5 3v4 M9.5 17v4 M14.5 17v4 M3 9.5h4 M3 14.5h4 M17 9.5h4 M17 14.5h4'],
    ['pi-wifi', '연결 · 네트워크', 'M2 9a15 15 0 0 1 20 0 M5 12.5a10 10 0 0 1 14 0 M8.5 16a5 5 0 0 1 7 0 M12 19.5h.01'],
    ['pi-cloud', '클라우드', 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z'],
    ['pi-server', '서버 · 인프라', 'M4 4h16v6H4z M4 14h16v6H4z M8 7h.01 M8 17h.01'],
    ['pi-database', '데이터', 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
    ['pi-link', '연동 · 통합', 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
    ['pi-shield', '보안', 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5'],
    ['pi-lock', '권한 · 개인정보', 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2'],
    ['pi-bolt', '에너지 · 전력', 'M13 2L4 14h7l-1 8 9-12h-7z'],
    ['pi-leaf', '친환경 · ESG', 'M5 19C5 11 10 5 20 5c0 10-6 15-14 15 M5 19c3-4 6-6 10-8'],
    ['pi-air', '공조 · 공기질', 'M3 8h12a3 3 0 1 0-3-3 M3 12h16a3 3 0 1 1-3 3 M3 16h8'],
    ['pi-thermo', '온도 · 환경', 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z M12 9v7'],
  ] },
  { id: 'device', name: '제품 · 기기', icons: [
    ['pi-monitor', '디스플레이', 'M3 4h18v12H3z M8 20h8 M12 16v4'],
    ['pi-signage', '사이니지', 'M5 3h14v14H5z M12 17v4 M8 21h8 M8 8h8 M8 12h5'],
    ['pi-tablet', '태블릿', 'M6 2h12v20H6z M11 18h2'],
    ['pi-phone', '모바일', 'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M11 18h2'],
    ['pi-laptop', '노트북 · PC', 'M5 5h14v10H5z M2 19h20'],
    ['pi-camera', '카메라 · 영상', 'M3 7h4l2-3h6l2 3h4v13H3z M8 13a4 4 0 1 0 8 0 4 4 0 1 0-8 0'],
    ['pi-speaker', '음향', 'M4 9h4l5-4v14l-5-4H4z M16.5 8.5a5 5 0 0 1 0 7 M19 6a8.5 8.5 0 0 1 0 12'],
    ['pi-play', '콘텐츠 · 데모', 'M4 5h16v14H4z M10 9l5 3-5 3z'],
    ['pi-cube', '3D · 제품', 'M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5 M12 12v9 M12 12L4 7.5'],
    ['pi-boxes', '구성 · 수량', 'M3 13h8v8H3z M13 13h8v8h-8z M8 3h8v8H8z'],
    ['pi-truck', '배송 · 설치', 'M2 6h12v10H2z M14 10h4l4 3v3h-8 M4.5 18a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0 M16.5 18a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0'],
  ] },
  { id: 'ops', name: '운영 · 문서', icons: [
    ['pi-calendar', '일정', 'M4 5h16v16H4z M4 10h16 M9 3v4 M15 3v4'],
    ['pi-clock', '시간 · 운영 시간', 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0 M12 7v5l3 3'],
    ['pi-tool', '유지보수', 'M15 4a5 5 0 0 0-5.6 6.6L3 17v4h4l6.4-6.4A5 5 0 0 0 20 9l-3 3-3-1-1-3z'],
    ['pi-gear', '설정 · 운영', 'M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9L7 7 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1'],
    ['pi-check', '체크리스트', 'M10 6h10 M10 12h10 M10 18h10 M3.5 6l1.5 1.5L7.5 5 M3.5 12l1.5 1.5L7.5 11 M3.5 18l1.5 1.5L7.5 17'],
    ['pi-doc', '문서 · 사양', 'M6 3h9l4 4v14H6z M14 3v5h5 M9 12h7 M9 16h5'],
    ['pi-clip', '요약 · 개요', 'M9 4h6v3H9z M7 5.5H5V21h14V5.5h-2 M8.5 12h7 M8.5 16h5'],
    ['pi-ruler', '치수 · 스펙', 'M4 17L17 4l3 3L7 20z M8.5 12.5l1.5 1.5 M11 10l1.5 1.5 M13.5 7.5l1.5 1.5'],
    ['pi-layers', '레이어 · 구조', 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5'],
    ['pi-grid', '모음 · 목록', 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z'],
    ['pi-route', '흐름 · 동선', 'M4 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M16 7a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7'],
    ['pi-globe', '글로벌', 'M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0 M3 12h18 M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z'],
    ['pi-subs', '구독 · 순환', 'M17 2l4 4-4 4 M3 11v-1a4 4 0 0 1 4-4h14 M7 22l-4-4 4-4 M21 13v1a4 4 0 0 1-4 4H3'],
  ] },
];
/** id → { id, label, d, group } */
export const PART_ICONS = Object.fromEntries(PART_ICON_GROUPS.flatMap((g) => g.icons.map(([id, label, d]) => [id, { id, label, d, group: g.id }])));
/** id → path — 앱 Icon(PATHS)과 관리자 PartIcon 이 이름으로 찾는다 */
export const PART_ICON_PATHS = Object.fromEntries(Object.values(PART_ICONS).map((x) => [x.id, x.d]));
export const DEFAULT_PART_ICON = 'pi-star';

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** 흰색을 섞은 옅은 색 — t: 흰색 비율 */
export const tint = (hex, t) => '#' + channels(hex).map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('');
/** 흰색과의 대비(WCAG) */
export function whiteContrast(hex) {
  const l = channels(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 1.05 / (0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] + 0.05);
}
export const isPartColor = (hex) => typeof hex === 'string' && /^#[0-9a-f]{6}$/.test(hex) && PART_COLORS.some((c) => c.hex === hex);
export const isPartIcon = (id) => typeof id === 'string' && !!PART_ICONS[id];
/** 버블 · 칩에 입히는 색 값 — 화면마다 쓰는 이름(--hc 진한 색 · --hb 옅은 바탕)이 같다 */
export const lookStyle = (look) => (look && look.color ? { '--hc': look.color, '--hb': tint(look.color, 0.88) } : undefined);
