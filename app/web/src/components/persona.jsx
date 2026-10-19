// 고객 인물 초상 — 기본 6명(난이도 3단계 × 남/여) + 직접 만든 프로필(사진 30종 · 피부 · 머리색 · 안경 · 옷 조정).
// 표정은 지금 만족도(무드)에 따라 바뀐다. 실제 인물 사진 대신 일러스트(SVG)로 그려, 어디서나 같은 얼굴로 보이고 초상권 걱정이 없다.
import React from 'react';
import { PERSONAS } from '../domain/simulation/profile.js';

const LV_BG = { 1: ['#e3f1e4', '#cfe6d2'], 2: ['#e4eaf8', '#d0daf2'], 3: ['#f7e3e0', '#efcfca'] };
const moodFace = (mood, base) => {
  if (mood === '만족' || mood === '호의') return 'happy';
  if (mood === '의심' || mood === '불만') return 'stern';
  if (mood === '중립') return base === 'stern' ? 'flat' : 'flat';
  return base || 'flat';
};

function Hair({ k, c, part }) {
  if (part === 'back') {
    if (k === 'bob') return <path d="M35 62C33 38 45 26 60 26C75 26 87 38 85 62C85 73 83 80 79 83C75 80 74 76 74 72L46 72C46 76 45 80 41 83C37 80 35 73 35 62Z" fill={c} />;
    if (k === 'tied') return <path d="M37 58C35 36 46 26 60 26C74 26 85 36 83 58L84.5 96C79 98.5 73 97 70.5 93L69.5 74L50.5 74L49.5 93C47 97 41 98.5 35.5 96Z" fill={c} />;
    if (k === 'pixie') return <path d="M38 58C37 44 44 33 54 30L52 66C45 66 40 63 38 58Z M82 58C83 44 76 33 66 30L68 66C75 66 80 63 82 58Z" fill={c} />;
    if (k === 'long') return <path d="M36 58C34 36 46 26 60 26C74 26 86 36 84 58L86 101C80 103 74 101 71.5 97L70.5 74L49.5 74L48.5 97C46 101 40 103 34 101Z" fill={c} />;
    if (k === 'wave') return <path d="M35.5 58C34 36 46 26 60 26C74 26 86 36 84.5 58C86.5 64 84.5 70 86.5 76C87 82 82 86 77 84C74.5 82 74 78 74 74L46 74C46 78 45.5 82 43 84C38 86 33 82 33.5 76C35.5 70 33.5 64 35.5 58Z" fill={c} />;
    if (k === 'bangs') return <path d="M35 62C33 38 45 26 60 26C75 26 87 38 85 62C85 73 83 80 79 83C75 80 74 76 74 72L46 72C46 76 45 80 41 83C37 80 35 73 35 62Z" fill={c} />;
    if (k === 'bun') return <><circle cx="60" cy="25.6" r="8.6" fill={c} /><path d="M53.4 23.4Q57 19.6 62.4 19.8" stroke="rgba(255,255,255,.16)" strokeWidth="1.3" fill="none" strokeLinecap="round" /></>;
    if (k === 'pony') return <path d="M72.5 33C82.5 31.5 89 41.5 88.2 55C87.6 66 84 75 78.8 80.4C80.4 71 81 62 79 53C78 46 76 40 71.6 36.4Z" fill={c} />;
    if (k === 'short') return <path d="M37.4 61C35.8 44 43 32 54 29L52 70C44 69.4 39 66.6 37.4 61Z M82.6 61C84.2 44 77 32 66 29L68 70C76 69.4 81 66.6 82.6 61Z" fill={c} />;
    return null;
  }
  if (k === 'side') return <><path d="M40 55C38 38 47 27 60 27C73 27 82 36 80 55C79 47 77 43 74 41C66 43 55 40 48 36C45 41 42 47 40 55Z" fill={c} /><path d="M48 36C53 39 58 40 63 40" stroke="rgba(255,255,255,.18)" strokeWidth="1.2" fill="none" /></>;
  if (k === 'gray') return <><path d="M40 55C38 38 47 27 60 27C73 27 82 36 80 55C79 47 77 43 74 41C66 43 55 40 48 36C45 41 42 47 40 55Z" fill={c} /><path d="M44 46C48 39 55 35 63 35M50 32C56 30 64 30 71 34M41 52C41 49 42 47 43 45M79 52C79 49 78 47 77 45" stroke="#c9c6c1" strokeWidth="1.1" fill="none" opacity=".7" /></>;
  if (k === 'crop') return <path d="M41 52C41 40 48 31 60 31C72 31 79 40 79 52C78 46 75 41 71 39.5C66 37.5 54 37.5 49 39.5C45 41 42 46 41 52Z" fill={c} />;
  if (k === 'bob') return <path d="M40 57C40 38 50 28 61 28C73 28 81 37 80 57C77 48 72 42 64 39.5C57 44 48 47 40 57Z" fill={c} />;
  if (k === 'tied') return <><path d="M40.5 60C39 38 49 28 60 28C71 28 81 38 79.5 60C78 50 74 42 66 38.5C64 37.6 62 37.2 60 37.6C58 37.2 56 37.6 54 38.5C46 42 42 50 40.5 60Z" fill={c} /><path d="M60 29V37.6" stroke="rgba(255,255,255,.16)" strokeWidth="1" /><path d="M47 34C51 31 56 30 60 30" stroke="rgba(255,255,255,.12)" strokeWidth="1.4" fill="none" /></>;
  if (k === 'pixie') return <path d="M40 55C38 37 48 27 61 27C74 27 82 37 80 51C78 45 75 41 70 39.5C62 44 51 42 44 45C42 48 41 51 40 55Z" fill={c} />;
  if (k === 'long') return <><path d="M40 63C38 38 48.5 28 60.5 28C72.5 28 82 38 80 63C79 54 77.5 47 74.5 42.5C67 45.5 56 45 47.5 41.5C43.5 46 41 54 40 63Z" fill={c} /><path d="M47.5 41.5C52 36.5 57 33.6 63 33" stroke="rgba(255,255,255,.14)" strokeWidth="1.3" fill="none" /></>;
  if (k === 'wave') return <><path d="M40 59C38.5 37 49 27 61 27C74 27 82.5 37 80.5 59C79 50.5 75.5 44 68.5 40.5C64 43 58 43.2 53 41.6C48 43.5 42.5 49 40 59Z" fill={c} /><path d="M50 36Q55 31.6 61 33Q66 34.6 71 32.4" stroke="rgba(255,255,255,.15)" strokeWidth="1.3" fill="none" /></>;
  if (k === 'bangs') return <path d="M40 59C39 38 49 28 60 28C71 28 81 38 80 59C79.5 53 78.5 49.6 77 47.6C71 48.8 49 48.8 43 47.6C41.5 49.6 40.5 53 40 59Z" fill={c} />;
  if (k === 'bun' || k === 'pony') return <><path d="M40.5 55C39.5 37 49 29 60 29C71 29 80.5 37 79.5 55C78.5 47 75.5 42 69.5 39.6C65 38.4 55 38.4 50.5 39.6C44.5 42 41.5 47 40.5 55Z" fill={c} /><path d="M50 38.6C53 34.6 56.6 32.4 60 31.8M70 38.6C67 34.6 63.4 32.4 60 31.8" stroke="rgba(255,255,255,.14)" strokeWidth="1.1" fill="none" /></>;
  if (k === 'short') return <path d="M40 57C38 37 48 27 61 27C74 27 82 37 80 56C78.5 48.6 75.6 43.4 70.6 41.2C64 45.2 55 44.4 48 42.6C44.4 45.2 41.4 50.4 40 57Z" fill={c} />;
  if (k === 'buzz') return <path d="M41.6 50.5C41.4 38.5 49 31 60 31C71 31 78.6 38.5 78.4 50.5C77.6 45.6 75.4 42.2 71.6 40.8C65.6 39.2 54.4 39.2 48.4 40.8C44.6 42.2 42.4 45.6 41.6 50.5Z" fill={c} opacity=".82" />;
  if (k === 'bald') return <><path d="M41.2 55C40.6 48 41.4 43.6 43.6 40.8C44.6 43.8 45.2 46.6 45.4 49.4C43.8 50.8 42.6 52.6 41.2 55Z M78.8 55C79.4 48 78.6 43.6 76.4 40.8C75.4 43.8 74.8 46.6 74.6 49.4C76.2 50.8 77.4 52.6 78.8 55Z" fill={c} /><path d="M47.6 38C51.6 34.4 55.8 33.4 60 33.4C64.2 33.4 68.4 34.4 72.4 38" stroke={c} strokeWidth="1.4" fill="none" opacity=".35" strokeLinecap="round" /><ellipse cx="54" cy="35.6" rx="4" ry="1.6" fill="#fff" opacity=".22" transform="rotate(-14 54 35.6)" /></>;
  if (k === 'slick') return <><path d="M41 52C40 37.5 48.5 28.5 60 28.5C71.5 28.5 80 37.5 79 52C78.2 46.6 76.6 42.4 73.8 40C69 38.4 64.6 39.2 60 41.2C55.4 39.2 51 38.4 46.2 40C43.4 42.4 41.8 46.6 41 52Z" fill={c} /><path d="M50 39.4C53 34 57 31.6 62 31.2M56.4 40.2C59.4 35.2 63 32.8 68 32.8M64.4 40.4C67.2 36.6 70.4 35.2 74 35.8" stroke="rgba(255,255,255,.15)" strokeWidth="1.1" fill="none" /></>;
  if (k === 'twoblock') return <><path d="M40.6 52C39.6 37 48.6 27.6 60 27.6C71.4 27.6 80.4 37 79.4 52C78.8 48 77.4 45 75.6 43.4C72.6 45.6 68 46.4 63.4 45.4C58.6 46.8 51.8 46.4 47 44.2C44.4 45.6 42 48.4 40.6 52Z" fill={c} /><path d="M52 45.6C53 41 55.6 37.4 59 35.4M60.6 45.8C62 41.6 64.6 38.6 68 37" stroke="rgba(255,255,255,.14)" strokeWidth="1.1" fill="none" /></>;
  if (k === 'curly') return <><path d="M41 53C38.6 47.6 39.6 41.2 43.6 38C43.8 32.6 49.4 28.4 54.8 29.6C57.6 26.6 63.6 26.4 66.6 29.2C71.6 28 77.2 31.8 76.8 37.2C80.6 40.4 81.6 47.4 79 53C78 47.4 75.8 43.6 72 41.6C66 40.2 54 40.2 48 41.6C44.2 43.6 42 47.4 41 53Z" fill={c} /><path d="M47 36.4q2-2.6 4.6-1M55.4 33q2.2-2.2 4.8-.6M64 33q2.4-1.8 4.6.2M71.4 37q2.2-1.4 4 .6" stroke="rgba(255,255,255,.18)" strokeWidth="1.1" fill="none" strokeLinecap="round" /></>;
  if (k === 'parted') return <path d="M41 52C40 37 49 28 60 28C71 28 80 37 79 52C78.2 45.2 75.2 40.4 69.4 38.4C65.8 37.6 62.2 38.6 60 40.6C57.8 38.6 54.2 37.6 50.6 38.4C44.8 40.4 41.8 45.2 41 52Z" fill={c} />;
  return null;
}

function Facial({ k, c }) {
  if (k === 'stubble') return <path d="M45.5 63C47 71 52.5 78.5 60 80C67.5 78.5 73 71 74.5 63C73.5 69 70 73.5 65.5 75Q60 76.6 54.5 75C50 73.5 46.5 69 45.5 63Z M54.6 66.4Q60 64.6 65.4 66.4Q60 67.8 54.6 66.4Z" fill={c} opacity=".24" />;
  if (k === 'mustache') return <path d="M53.4 67.4Q56.4 64.4 60 65.9Q63.6 64.4 66.6 67.4Q63.2 68.4 60 67.3Q56.8 68.4 53.4 67.4Z" fill={c} />;
  if (k === 'beard') return <><path d="M44.6 60C45 71 52 80.8 60 81.4C68 80.8 75 71 75.4 60C74.4 66 72 70.6 68 73Q64 69 60 68.8Q56 69 52 73C48 70.6 45.6 66 44.6 60Z" fill={c} opacity=".92" /><path d="M53.4 67.6Q56.4 64.6 60 66.1Q63.6 64.6 66.6 67.6Q63.2 68.6 60 67.5Q56.8 68.6 53.4 67.6Z" fill={c} /></>;
  return null;
}

/** #rrggbb를 조금 어둡게 (라펠 · 그림자 기본값) */
export function darken(hex, k = 0.12) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return hex;
  const n = parseInt(m[1], 16); const f = (v) => Math.max(0, Math.round(v * (1 - k)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** 인물 초상. who = PERSONAS 키('1M' …) 또는 페르소나 객체({ key, level, gender, age, look }), mood = 만족 · 호의 · 중립 · 의심 · 불만 */
export function Portrait({ who, mood, size = 48, round = true, className = '', title }) {
  const p = typeof who === 'string' ? PERSONAS[who] : who;
  if (!p) return null;
  const L = p.look;
  const face = moodFace(mood, L.base);
  const [bg1, bg2] = LV_BG[p.level] || LV_BG[2];
  const skin = L.skin, shade = L.shade || darken(L.skin, 0.12), hair = L.hair, lip = p.gender === 'F' ? '#b4544d' : '#9b5a4b';
  const lapel = L.lapel || darken(L.suit, 0.14);
  const gid = 'pg' + String(p.key || 'x').replace(/[^\w-]/g, '') + '-' + (p.level || 2);
  const brow = face === 'happy' ? ['M48.5 50.3Q52.5 48.4 56 50.2', 'M64 50.2Q67.5 48.4 71.5 50.3']
    : face === 'stern' ? ['M48.3 49.6L56.2 52.4', 'M63.8 52.4L71.7 49.6'] : ['M48.5 51.4Q52.5 50 56 51.3', 'M64 51.3Q67.5 50 71.5 51.4'];
  const mouth = face === 'happy' ? <path d="M54.2 68.6Q60 75.6 65.8 68.6Q60 70.6 54.2 68.6Z" fill="#fff" stroke={lip} strokeWidth="1.5" strokeLinejoin="round" />
    : face === 'stern' ? <path d="M55 71.6Q60 68.8 65 71.6" stroke={lip} strokeWidth="1.7" fill="none" strokeLinecap="round" />
      : <path d="M55.4 70.6Q60 71.8 64.6 70.6" stroke={lip} strokeWidth="1.7" fill="none" strokeLinecap="round" />;
  const eyes = face === 'happy' && L.smileEyes
    ? <><path d="M50.2 57.6Q52.6 55 55 57.6" stroke="#2a211d" strokeWidth="1.7" fill="none" strokeLinecap="round" /><path d="M65 57.6Q67.4 55 69.8 57.6" stroke="#2a211d" strokeWidth="1.7" fill="none" strokeLinecap="round" /></>
    : <><ellipse cx="52.6" cy="57" rx="1.9" ry={face === 'stern' ? 1.7 : 2.2} fill="#2a211d" /><ellipse cx="67.4" cy="57" rx="1.9" ry={face === 'stern' ? 1.7 : 2.2} fill="#2a211d" /><circle cx="53.2" cy="56.3" r=".55" fill="#fff" /><circle cx="68" cy="56.3" r=".55" fill="#fff" /></>;
  return (
    <svg className={'portrait ' + className} width={size} height={size} viewBox="18 16 84 84" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : 'true'}
      style={round ? { borderRadius: '50%' } : undefined}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={bg1} /><stop offset="1" stopColor={bg2} /></linearGradient>
      </defs>
      <rect width="120" height="120" fill={`url(#${gid})`} />
      <circle cx="60" cy="50" r="40" fill="#fff" opacity=".25" />
      <Hair k={L.hairStyle} c={hair} part="back" />
      {/* torso */}
      <path d="M8 120C10 101 25 92 43 88L52 86Q60 92 68 86L77 88C95 92 110 101 112 120Z" fill={L.suit} />
      <path d="M52 72L68 72L68.6 86.5Q60 92 51.4 86.5Z" fill={shade} />
      {L.top === 'turtle' && <><path d="M51.2 75L68.8 75L69.8 88Q60 93 50.2 88Z" fill={L.shirt} /><path d="M52 79.4Q60 82 68 79.4M51.6 83.4Q60 86.4 68.4 83.4" stroke="rgba(0,0,0,.12)" strokeWidth="1" fill="none" /></>}
      {L.top === 'tie' && <><path d="M50 86L60 104L70 86Q60 92 50 86Z" fill={L.shirt} /><path d="M57.4 90.4H62.6L61.6 94H58.4Z" fill={L.tie} /><path d="M58.3 93.6H61.7L63.4 106L60 111L56.6 106Z" fill={L.tie} /></>}
      {L.top === 'open' && <><path d="M50 86L60 102L70 86Q60 92 50 86Z" fill={L.shirt} /><path d="M50.2 85.6L55.2 97L60 91.6Z" fill={L.shirt2 || '#fff'} /><path d="M69.8 85.6L64.8 97L60 91.6Z" fill={L.shirt2 || '#fff'} /><path d="M53 86Q60 95 67 86" stroke={shade} strokeWidth="1" fill="none" opacity=".6" /></>}
      {L.top === 'blouse' && <path d="M49 86.4Q60 101 71 86.4Q60 92.4 49 86.4Z" fill={L.shirt} />}
      {L.necklace && <path d="M51 89Q60 98 69 89" stroke="#f3eee2" strokeWidth="2.2" strokeDasharray="0.1 3.2" strokeLinecap="round" fill="none" />}
      <path d="M51 86L60 107L54 100.5L47.5 103L43.6 88.2Z" fill={lapel} />
      <path d="M69 86L60 107L66 100.5L72.5 103L76.4 88.2Z" fill={lapel} />
      {/* head */}
      <ellipse cx="40.6" cy="57.5" rx="3.6" ry="5.4" fill={shade} />
      <ellipse cx="79.4" cy="57.5" rx="3.6" ry="5.4" fill={shade} />
      <path d="M41 52C41 36 50 30 60 30C70 30 79 36 79 52C79 64 76 72 70 77C66 80 63 81 60 81C57 81 54 80 50 77C44 72 41 64 41 52Z" fill={skin} />
      <path d="M79 52C79 64 76 72 70 77C66 80 63 81 60 81C64 79 71 73 73.5 64C75 58 75 53 74 47Z" fill={shade} opacity=".35" />
      {p.gender === 'F' && L.earring !== 'none' && <><circle cx="40.6" cy="63.4" r="1.5" fill={L.earring || '#d9b45a'} /><circle cx="79.4" cy="63.4" r="1.5" fill={L.earring || '#d9b45a'} /></>}
      <Hair k={L.hairStyle} c={hair} />
      {/* face */}
      <path d={brow[0]} stroke={L.brow || hair} strokeWidth={L.thickBrow ? 2.4 : 1.8} fill="none" strokeLinecap="round" />
      <path d={brow[1]} stroke={L.brow || hair} strokeWidth={L.thickBrow ? 2.4 : 1.8} fill="none" strokeLinecap="round" />
      {eyes}
      {L.glasses === 'rect' && <g stroke="#2b2b2e" strokeWidth="1.3" fill="rgba(255,255,255,.12)"><rect x="47.2" y="53.2" width="10.6" height="7.6" rx="2.2" /><rect x="62.2" y="53.2" width="10.6" height="7.6" rx="2.2" /><path d="M57.8 56.4Q60 55.4 62.2 56.4M47.2 55.6L42.6 54.6M72.8 55.6L77.4 54.6" fill="none" /></g>}
      {L.glasses === 'round' && <g stroke="#8a6a3a" strokeWidth="1.1" fill="rgba(255,255,255,.1)"><circle cx="52.6" cy="57" r="4.7" /><circle cx="67.4" cy="57" r="4.7" /><path d="M57.3 56.4Q60 55.3 62.7 56.4" fill="none" /></g>}
      {L.glasses === 'half' && <g stroke="#3a3a3e" strokeWidth="1.3" fill="none"><path d="M47.4 54.4H57.8M62.2 54.4H72.6M57.8 55.6Q60 54.6 62.2 55.6" /><path d="M47.6 54.6Q48 60.4 52.6 60.4Q57.4 60.4 57.6 54.6M62.4 54.6Q62.6 60.4 67.4 60.4Q72 60.4 72.4 54.6" stroke="rgba(58,58,62,.35)" /></g>}
      <path d="M60 58.4Q58.4 63.6 60.9 64.6" stroke={shade} strokeWidth="1.4" fill="none" strokeLinecap="round" />
      {face === 'happy' && <><circle cx="48.6" cy="64.4" r="3.6" fill="#f0927f" opacity=".28" /><circle cx="71.4" cy="64.4" r="3.6" fill="#f0927f" opacity=".28" /></>}
      {p.age >= 50 && <g stroke={shade} strokeWidth="1" fill="none" opacity=".55" strokeLinecap="round"><path d="M54 66.2Q53 68.6 54 70.6" /><path d="M66 66.2Q67 68.6 66 70.6" />{!['bob', 'bangs', 'twoblock'].includes(L.hairStyle) && <path d="M54 45Q60 44 66 45" opacity=".6" />}</g>}
      {L.facial && <Facial k={L.facial} c={L.beardColor || hair} />}
      {mouth}
    </svg>
  );
}

/** 페르소나 키(난이도 + 성별) */
export const personaKey = (level, gender) => level + (gender === 'F' ? 'F' : 'M');
