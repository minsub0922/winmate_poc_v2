// 고객 프로필 사진(일러스트) 선택지 — 남 15 · 여 15 = 30종 + 피부 · 머리색 · 안경 · 옷 색 조정.
// 기본 6명(PERSONAS)의 얼굴도 여기 들어 있어, 기존 프로필을 고쳐 새로 저장할 때 같은 얼굴에서 시작한다.

export const SKINS = [
  { k: 'fair', name: '밝은', skin: '#f6dcc6', shade: '#e4b99a' },
  { k: 'light', name: '연한', skin: '#f0cfb2', shade: '#dcae8c' },
  { k: 'medium', name: '중간', skin: '#e8c1a0', shade: '#cf9f7c' },
  { k: 'tan', name: '구릿빛', skin: '#d4a27c', shade: '#b9845e' },
  { k: 'deep', name: '짙은', skin: '#a9734f', shade: '#8c5a3b' },
];
export const HAIRS = [
  { k: 'black', name: '검정', c: '#1a1616' },
  { k: 'dark', name: '흑갈색', c: '#3b2a22' },
  { k: 'brown', name: '갈색', c: '#6b4a33' },
  { k: 'gray', name: '회색', c: '#6f6c69' },
  { k: 'silver', name: '은발', c: '#a8a5a0' },
];
export const SUITS = [
  { k: 'navy', name: '네이비', c: '#24344f' },
  { k: 'charcoal', name: '차콜', c: '#2a2c33' },
  { k: 'gray', name: '그레이', c: '#5b6271' },
  { k: 'brown', name: '브라운', c: '#8b6b4e' },
  { k: 'beige', name: '베이지', c: '#b59a78' },
  { k: 'green', name: '그린', c: '#3f5f52' },
  { k: 'wine', name: '와인', c: '#6d2e3a' },
  { k: 'terra', name: '테라코타', c: '#c4664f' },
];
export const GLASSES = [
  { k: '', name: '없음' },
  { k: 'rect', name: '사각' },
  { k: 'round', name: '원형' },
  { k: 'half', name: '반무테' },
];

const S = Object.fromEntries(SKINS.map((x) => [x.k, x]));
const H = Object.fromEntries(HAIRS.map((x) => [x.k, x.c]));
const U = Object.fromEntries(SUITS.map((x) => [x.k, x.c]));
const mk = (id, gender, age, o) => {
  const sk = S[o.skin || 'light'];
  const look = { skin: sk.skin, shade: sk.shade, hair: H[o.hair || 'black'] || o.hair, hairStyle: o.style, suit: U[o.suit || 'navy'] || o.suit, shirt: o.shirt || (o.top === 'blouse' ? '#fbf6ef' : '#ffffff'), top: o.top || (gender === 'F' ? 'blouse' : 'tie'), base: o.base || 'flat' };
  for (const k of ['tie', 'glasses', 'earring', 'necklace', 'facial', 'beardColor', 'thickBrow', 'brow', 'smileEyes', 'shirt2', 'lapel']) if (o[k] != null) look[k] = o[k];
  return { id, gender, age, look };
};

/** 사진 선택지 30종 (m01~m03 · f01~f03은 기본 프로필 얼굴) */
export const LOOKS = [
  mk('m01', 'M', 52, { skin: 'light', hair: '#5d5955', style: 'gray', suit: 'brown', lapel: '#7a5c41', top: 'open', shirt: '#cfe0f2', shirt2: '#e3eef9', smileEyes: true, base: 'happy' }),
  mk('m02', 'M', 44, { skin: 'medium', hair: '#1f1b19', style: 'side', suit: 'navy', tie: '#3c66b5', glasses: 'rect' }),
  mk('m03', 'M', 56, { skin: 'medium', hair: 'gray', style: 'crop', suit: 'charcoal', shirt: '#f4f4f2', tie: '#7a2531', thickBrow: true, brow: '#4a4542', base: 'stern' }),
  mk('m04', 'M', 41, { skin: 'tan', hair: 'black', style: 'buzz', suit: 'charcoal', top: 'open', shirt: '#e8edf3', facial: 'stubble' }),
  mk('m05', 'M', 47, { skin: 'light', hair: 'black', style: 'slick', suit: 'navy', tie: '#c49a3c' }),
  mk('m06', 'M', 34, { skin: 'fair', hair: 'dark', style: 'twoblock', suit: 'gray', top: 'open', shirt: '#ffffff', smileEyes: true }),
  mk('m07', 'M', 61, { skin: 'medium', hair: 'silver', style: 'bald', suit: 'navy', tie: '#a3333d', glasses: 'half', facial: 'mustache', beardColor: '#8f8b86' }),
  mk('m08', 'M', 39, { skin: 'medium', hair: 'brown', style: 'curly', suit: 'beige', top: 'turtle', shirt: '#2a2c33' }),
  mk('m09', 'M', 45, { skin: 'light', hair: 'black', style: 'parted', suit: 'charcoal', tie: '#2f7f7a', glasses: 'round' }),
  mk('m10', 'M', 49, { skin: 'deep', hair: 'black', style: 'buzz', suit: 'navy', top: 'open', shirt: '#dfe9f5', facial: 'beard' }),
  mk('m11', 'M', 43, { skin: 'tan', hair: 'black', style: 'crop', suit: 'green', tie: '#6f747d', glasses: 'rect' }),
  mk('m12', 'M', 55, { skin: 'light', hair: 'gray', style: 'slick', suit: 'charcoal', tie: '#24344f', facial: 'beard', beardColor: '#8a8783' }),
  mk('m13', 'M', 36, { skin: 'light', hair: 'black', style: 'twoblock', suit: 'navy', top: 'turtle', shirt: '#f2f1ee' }),
  mk('m14', 'M', 58, { skin: 'medium', hair: 'gray', style: 'side', suit: 'brown', tie: '#3b4f7a', facial: 'mustache', thickBrow: true }),
  mk('m15', 'M', 51, { skin: 'fair', hair: 'dark', style: 'parted', suit: 'gray', tie: '#c49a3c', glasses: 'half' }),
  mk('f01', 'F', 46, { skin: 'light', hair: 'dark', style: 'bob', suit: 'terra', lapel: '#ad5642', shirt: '#fbf6ef', earring: '#d9b45a', smileEyes: true, base: 'happy' }),
  mk('f02', 'F', 39, { skin: 'fair', hair: '#1c1817', style: 'tied', suit: 'gray', shirt: '#f6dfe0', earring: '#f3efe6', glasses: 'round' }),
  mk('f03', 'F', 51, { skin: 'light', hair: 'black', style: 'pixie', suit: 'charcoal', shirt: '#eceae6', earring: '#f3efe6', necklace: true, glasses: 'half', base: 'stern' }),
  mk('f04', 'F', 37, { skin: 'fair', hair: 'black', style: 'long', suit: 'navy', shirt: '#ffffff', earring: '#d9b45a' }),
  mk('f05', 'F', 44, { skin: 'light', hair: 'brown', style: 'wave', suit: 'beige', shirt: '#fbf3e6', earring: '#f3efe6', smileEyes: true }),
  mk('f06', 'F', 48, { skin: 'medium', hair: 'black', style: 'bun', suit: 'charcoal', shirt: '#f1ede6', earring: '#f3efe6', necklace: true }),
  mk('f07', 'F', 33, { skin: 'fair', hair: 'dark', style: 'pony', suit: 'gray', top: 'turtle', shirt: '#25262b', earring: '#d9b45a' }),
  mk('f08', 'F', 41, { skin: 'light', hair: 'black', style: 'bangs', suit: 'wine', shirt: '#f7ece9', glasses: 'round', earring: '#d9b45a' }),
  mk('f09', 'F', 57, { skin: 'light', hair: 'gray', style: 'short', suit: 'navy', shirt: '#eef1f6', necklace: true, earring: '#f3efe6' }),
  mk('f10', 'F', 42, { skin: 'tan', hair: 'brown', style: 'long', suit: 'green', shirt: '#f4efe4', earring: '#d9b45a' }),
  mk('f11', 'F', 45, { skin: 'deep', hair: 'black', style: 'wave', suit: 'terra', shirt: '#fbf3e6', earring: '#d9b45a' }),
  mk('f12', 'F', 60, { skin: 'light', hair: 'silver', style: 'bob', suit: 'charcoal', shirt: '#f2f1ee', glasses: 'half', earring: '#f3efe6' }),
  mk('f13', 'F', 38, { skin: 'light', hair: 'dark', style: 'bun', suit: 'navy', top: 'turtle', shirt: '#f4f4f2', glasses: 'rect', earring: 'none' }),
  mk('f14', 'F', 35, { skin: 'medium', hair: 'brown', style: 'pixie', suit: 'beige', top: 'open', shirt: '#ffffff', shirt2: '#f3f0ea', earring: '#d9b45a' }),
  mk('f15', 'F', 50, { skin: 'fair', hair: 'dark', style: 'bangs', suit: 'gray', shirt: '#f6dfe0', earring: '#f3efe6', necklace: true }),
];
export const LOOK = Object.fromEntries(LOOKS.map((x) => [x.id, x]));

/** 조정 값 고르기: 지금 look에서 가장 가까운 선택지 키 */
export const skinOf = (look) => (SKINS.find((x) => x.skin === look.skin) || {}).k || '';
export const hairOf = (look) => (HAIRS.find((x) => x.c === look.hair) || {}).k || '';
export const suitOf = (look) => (SUITS.find((x) => x.c === look.suit) || {}).k || '';
/** 조정 적용 — 라펠 · 그림자는 새 색에서 다시 계산(Portrait의 darken 기본값) */
export function tweak(look, kind, v) {
  const L = { ...look };
  if (kind === 'skin') { const s = SKINS.find((x) => x.k === v); if (s) { L.skin = s.skin; L.shade = s.shade; } }
  if (kind === 'hair') { const h = HAIRS.find((x) => x.k === v); if (h) { L.hair = h.c; delete L.brow; if (L.beardColor) L.beardColor = h.c; } }
  if (kind === 'suit') { const u = SUITS.find((x) => x.k === v); if (u) { L.suit = u.c; delete L.lapel; } }
  if (kind === 'glasses') { if (v) L.glasses = v; else delete L.glasses; }
  return L;
}
