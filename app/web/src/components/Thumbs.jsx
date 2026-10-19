// Thumbnails for products · solutions · cases.
// A catalog item with an image (catalog `img` → data/images.json pid) shows the photo;
// everything else gets an illustration drawn here, so every card has a picture.
// Illustrations are 160×100 SVG; colors come from CSS classes (styles.css, ".thumb") so they follow the theme.
import React from 'react';
import IMAGES from '../../../data/images.json';
import { P, S, C } from '../services/catalog.js';
import { usePacked } from '../services/products.js';
import { mediaThumb } from '../services/media.js';

const PIDS = IMAGES.pids;
// cases with an installation photo in the image library
const CASE_IMG = { 1490: 'case.mcd.menuboard' };

export function photoOf(type, id) {
  const pid = type === 'product' ? P[id] && P[id].img : type === 'solution' ? S[id] && S[id].img : type === 'case' ? CASE_IMG[id] : null;
  const v = pid && PIDS[pid];
  if (!v) return null;
  return { src: v.file, cut: v.kind === 'cut', white: v.kind === 'cut' && /\.jpe?g$/i.test(v.file), desc: v.desc };
}

export function Thumb({ r, mini = false, className = '' }) {
  const [type, id] = String(r).split(':');
  const ph = photoOf(type, id);
  if (!ph && type === 'product' && P[id] && P[id].th) return <PackedThumb r={r} id={id} mini={mini} className={className} />;
  // 솔루션 · 유관사례: 연관 리소스에서 모은 실제 사진(mediapack.js) — 받기 전에는 일러스트
  const mt = !ph && (type === 'solution' || type === 'case') ? mediaThumb(type, id) : null;
  if (mt) return <MediaThumb type={type} id={id} addr={mt} mini={mini} className={className} />;
  const cls = ['thumb', type, mini ? 'mini' : '', ph ? (ph.cut ? 'cut' : 'photo') : 'ill', ph && ph.white ? 'white' : '', className].filter(Boolean).join(' ');
  if (ph) return <div className={cls}><img src={ph.src} alt="" loading="lazy" draggable={false} /></div>;
  return (
    <div className={cls}>
      <svg viewBox="0 0 160 100" preserveAspectRatio={mini ? 'xMidYMid slice' : 'xMidYMid meet'} aria-hidden="true" focusable="false">{art(type, id)}</svg>
    </div>
  );
}

/** 제품 DB 사진 묶음 — 화면 가까이 오면 그 묶음을 받고, 받기 전에는 일러스트.
 *  thK: 없음 = samsung.com 투명 배경 제품 컷, 'w' = e-카탈로그에서 자른 흰/단색 바탕 컷(흰 칸에), 's' = 장면 · 화면(꽉 채움) */
function PackedThumb({ r, id, mini, className }) {
  const [url, ref] = usePacked(P[id].th);
  const k = P[id].thK;
  const cls = ['thumb', 'product', mini ? 'mini' : '', url ? (k === 's' ? 'photo' : 'cut') : 'ill', url && k === 'w' ? 'white' : '', className].filter(Boolean).join(' ');
  return (
    <div className={cls} ref={ref}>
      {url ? <img src={url} alt="" draggable={false} />
        : <svg viewBox="0 0 160 100" preserveAspectRatio={mini ? 'xMidYMid slice' : 'xMidYMid meet'} aria-hidden="true" focusable="false">{art('product', id)}</svg>}
    </div>
  );
}

/** 솔루션 · 유관사례 대표 사진(mediapack.js) — 화면 가까이 오면 받고, 받기 전에는 일러스트 */
function MediaThumb({ type, id, addr, mini, className }) {
  const [url, ref] = usePacked(addr);
  const cls = ['thumb', type, mini ? 'mini' : '', url ? 'photo' : 'ill', className].filter(Boolean).join(' ');
  return (
    <div className={cls} ref={ref}>
      {url ? <img src={url} alt="" loading="lazy" draggable={false} />
        : <svg viewBox="0 0 160 100" preserveAspectRatio={mini ? 'xMidYMid slice' : 'xMidYMid meet'} aria-hidden="true" focusable="false">{art(type, id)}</svg>}
    </div>
  );
}

/** Up to three overlapping mini thumbnails (top-bar context buttons). */
export function ThumbStack({ refs, max = 3 }) {
  const list = refs.slice(0, max);
  if (!list.length) return null;
  return <span className="tstack" aria-hidden="true">{list.map((r) => <Thumb key={r} r={r} mini />)}</span>;
}

function art(type, id) {
  if (type === 'product') { const p = P[id]; return (PROD[id] || (p && (CATDRAW[p.cat] || CATDRAW[p.sc] || scDraw(p.sc))) || PROD._)(); }
  if (type === 'solution') return (SOL[id] || SOL._)();
  if (type === 'case') return caseArt(C[id]);
  return null;
}

// ---------- primitives ----------
const sh = (cx, cy, rx, ry = 2.8) => <ellipse cx={cx} cy={cy} rx={rx} ry={ry} className="sh" />;
const glare = (x, y, w, h) => <polygon points={`${x + w * 0.52},${y} ${x + w * 0.74},${y} ${x + w * 0.44},${y + h} ${x + w * 0.22},${y + h}`} className="gl" />;
const rng = (n) => Array.from({ length: n }, (_, i) => i);

// screen contents, drawn in their own viewBox and cropped to the screen
const SCREENS = {
  menu: ['0 0 160 90', () => (
    <>
      <rect width="160" height="90" fill="#24170f" />
      <rect x="10" y="7" width="54" height="6" rx="1" fill="#f59f00" />
      <rect x="118" y="7" width="32" height="6" rx="3" fill="#fff" opacity=".45" />
      {rng(6).map((k) => {
        const i = k % 3, j = Math.floor(k / 3), x = 10 + i * 48, y = 20 + j * 34;
        const c = ['#f59f00', '#e8590c', '#74b816', '#fab005', '#d9480f', '#82c91e'][k];
        return <g key={k}><rect x={x} y={y} width="44" height="30" rx="2" fill="#3a281b" /><circle cx={x + 13} cy={y + 15} r="9" fill={c} /><rect x={x + 26} y={y + 8} width="14" height="3" fill="#fff" opacity=".85" /><rect x={x + 26} y={y + 14} width="10" height="3" fill="#fff" opacity=".4" /><rect x={x + 26} y={y + 20} width="12" height="4" rx="1" fill="#ffd8a8" /></g>;
      })}
    </>
  )],
  ad: ['0 0 160 90', () => (
    <>
      <rect width="160" height="90" fill="#1d2f9e" />
      <circle cx="118" cy="50" r="36" fill="#f59f00" />
      <circle cx="138" cy="20" r="14" fill="#ff6b6b" opacity=".9" />
      <circle cx="94" cy="72" r="10" fill="#ffd43b" />
      <rect x="12" y="22" width="58" height="8" rx="1.5" fill="#fff" />
      <rect x="12" y="35" width="44" height="8" rx="1.5" fill="#fff" />
      <rect x="12" y="51" width="34" height="4" rx="1" fill="#fff" opacity=".55" />
      <rect x="12" y="63" width="28" height="10" rx="5" fill="#ffd8a8" />
    </>
  )],
  land: ['0 0 160 90', () => (
    <>
      <rect width="160" height="90" fill="#8fb5ea" />
      <circle cx="126" cy="20" r="9" fill="#fff3bf" />
      <polygon points="0,62 30,32 52,50 78,18 108,52 128,38 160,60 160,90 0,90" fill="#3b5a9a" />
      <polygon points="70,27 78,18 86,28 80,26 75,30" fill="#fff" opacity=".85" />
      <polygon points="0,70 40,56 90,66 130,54 160,62 160,90 0,90" fill="#3f9a6c" />
      <rect y="77" width="160" height="13" fill="#4f86d0" />
    </>
  )],
  dash: ['0 0 160 90', () => (
    <>
      <rect width="160" height="90" fill="#0f172b" />
      <rect x="6" y="6" width="148" height="8" rx="2" fill="#1b2540" />
      <rect x="6" y="19" width="70" height="34" rx="3" fill="#1b2540" />
      {[10, 16, 12, 22, 18, 26].map((h, i) => <rect key={i} x={13 + i * 10} y={48 - h} width="6" height={h} rx="1" fill="#5c7cfa" />)}
      <rect x="82" y="19" width="72" height="34" rx="3" fill="#1b2540" />
      <polyline points="88,46 98,38 108,42 118,30 128,34 138,24 148,28" fill="none" stroke="#38d9a9" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      <rect x="6" y="58" width="46" height="26" rx="3" fill="#1b2540" />
      <circle cx="29" cy="71" r="8" fill="none" stroke="#2c3a5e" strokeWidth="4" />
      <circle cx="29" cy="71" r="8" fill="none" stroke="#fab005" strokeWidth="4" strokeDasharray="34 60" transform="rotate(-90 29 71)" />
      <rect x="57" y="58" width="97" height="26" rx="3" fill="#1b2540" />
      {[0, 1, 2].map((i) => <rect key={i} x="63" y={63 + i * 6.5} width={[70, 52, 80][i]} height="3" rx="1.5" fill={['#748ffc', '#495a8a', '#495a8a'][i]} />)}
    </>
  )],
  ui: ['0 0 160 90', () => (
    <>
      <rect width="160" height="90" fill="#13204f" />
      <rect x="8" y="8" width="144" height="44" rx="3" fill="#2846c7" />
      <circle cx="128" cy="30" r="16" fill="#ffd8a8" opacity=".9" />
      <rect x="16" y="20" width="50" height="7" rx="1.5" fill="#fff" />
      <rect x="16" y="31" width="34" height="4" rx="1" fill="#fff" opacity=".6" />
      {rng(4).map((i) => <g key={i}><rect x={8 + i * 37} y="58" width="33" height="24" rx="2" fill="#fff" opacity=".14" /><circle cx={17 + i * 37} cy="67" r="4" fill={['#ffd43b', '#63e6be', '#ff8787', '#91a7ff'][i]} /><rect x={13 + i * 37} y="75" width="18" height="2.5" rx="1" fill="#fff" opacity=".6" /></g>)}
    </>
  )],
  wave: ['0 0 160 90', () => (
    <>
      <rect width="160" height="90" fill="#140f3d" />
      <path d="M0 30 C30 10 60 40 90 22 S140 6 160 18 V0 H0Z" fill="#f06595" opacity=".55" />
      <circle cx="120" cy="36" r="10" fill="#ffd43b" opacity=".9" />
      <path d="M0 60 C40 30 70 80 110 50 S150 30 160 40 V90 H0Z" fill="#7048e8" opacity=".92" />
      <path d="M0 72 C30 56 60 88 100 66 S140 56 160 62 V90 H0Z" fill="#12b886" opacity=".85" />
    </>
  )],
  white: ['0 0 160 90', () => (
    <>
      <rect width="160" height="90" fill="#f8f9fb" />
      <path d="M14 24 c8 -8 14 6 22 -2 s12 -6 18 2" stroke="#1c7ed6" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <path d="M14 40 h40 M14 50 h28" stroke="#1c7ed6" strokeWidth="2.6" fill="none" strokeLinecap="round" />
      <rect x="96" y="14" width="24" height="22" fill="#ffe066" />
      <rect x="124" y="20" width="24" height="22" fill="#b2f2bb" />
      <path d="M66 74 l12 -16 l10 10 l14 -22" stroke="#e03131" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="128" cy="66" r="12" stroke="#e03131" strokeWidth="2.6" fill="none" />
    </>
  )],
  paper: ['0 0 60 96', () => (
    <>
      <rect width="60" height="96" fill="#ece6d9" />
      <rect width="60" height="50" fill="#c9a66b" />
      <circle cx="40" cy="28" r="14" fill="#e9dcc0" />
      <circle cx="22" cy="40" r="10" fill="#7f93b8" />
      <rect x="6" y="58" width="40" height="6" fill="#3f3d39" />
      <rect x="6" y="68" width="30" height="3" fill="#6d6a63" />
      <rect x="6" y="74" width="34" height="3" fill="#6d6a63" />
      <rect x="6" y="84" width="18" height="6" fill="#b5523b" />
    </>
  )],
  phone: ['0 0 60 120', () => (
    <>
      <rect width="60" height="120" fill="#4c5fd5" />
      <circle cx="10" cy="96" r="34" fill="#9775fa" />
      <circle cx="56" cy="24" r="26" fill="#f783ac" opacity=".8" />
      <rect x="14" y="24" width="32" height="9" rx="2" fill="#fff" />
      <rect x="20" y="37" width="20" height="3" rx="1" fill="#fff" opacity=".7" />
      {rng(4).map((i) => <circle key={i} cx={12 + i * 12} cy="106" r="4" fill="#fff" opacity=".8" />)}
    </>
  )],
  uiP: ['0 0 60 120', () => (
    <>
      <rect width="60" height="120" fill="#f1f3f5" />
      <rect width="60" height="22" fill="#1c7ed6" />
      <rect x="6" y="9" width="26" height="4" rx="1" fill="#fff" />
      {rng(5).map((i) => <g key={i}><rect x="5" y={28 + i * 17} width="50" height="14" rx="2" fill="#fff" /><rect x="8" y={31 + i * 17} width="8" height="8" rx="1.5" fill={['#ff922b', '#51cf66', '#339af0', '#cc5de8', '#fcc419'][i]} /><rect x="20" y={32 + i * 17} width="24" height="2.5" rx="1" fill="#495057" /><rect x="20" y={36.5 + i * 17} width="16" height="2" rx="1" fill="#adb5bd" /></g>)}
    </>
  )],
  order: ['0 0 60 120', () => (
    <>
      <rect width="60" height="120" fill="#fff" />
      <rect width="60" height="20" fill="#2b8a3e" />
      <rect x="6" y="8" width="22" height="4" rx="1" fill="#fff" />
      {rng(4).map((i) => <g key={i}><rect x="6" y={26 + i * 18} width="12" height="12" rx="2" fill={['#ffa94d', '#e8590c', '#74b816', '#fab005'][i]} /><rect x="22" y={28 + i * 18} width="22" height="3" rx="1" fill="#343a40" /><rect x="22" y={33 + i * 18} width="14" height="2.5" rx="1" fill="#adb5bd" /><rect x="46" y={29 + i * 18} width="8" height="5" rx="2.5" fill="#d3f9d8" /></g>)}
      <rect x="6" y="102" width="48" height="11" rx="5.5" fill="#2b8a3e" />
    </>
  )],
  desk: ['0 0 160 90', () => (
    <>
      <rect width="160" height="90" fill="#2a3a6e" />
      <circle cx="140" cy="10" r="30" fill="#4263eb" opacity=".6" />
      <rect x="12" y="10" width="76" height="50" rx="2" fill="#f1f3f5" />
      <rect x="12" y="10" width="76" height="7" rx="2" fill="#ced4da" />
      {rng(4).map((i) => <rect key={i} x="18" y={23 + i * 8} width={[60, 44, 52, 30][i]} height="3" rx="1" fill="#868e96" />)}
      <rect x="64" y="28" width="82" height="46" rx="2" fill="#fff" />
      <rect x="64" y="28" width="82" height="7" rx="2" fill="#dee2e6" />
      {[16, 24, 12, 30, 20].map((h, i) => <rect key={i} x={74 + i * 13} y={68 - h} width="8" height={h} fill="#4c6ef5" />)}
      <rect y="82" width="160" height="8" fill="#141c38" />
      {rng(5).map((i) => <circle key={i} cx={62 + i * 9} cy="86" r="2" fill="#fff" opacity=".7" />)}
    </>
  )],
};
function Scr({ x, y, w, h, k = 'ad' }) {
  const [vb, draw] = SCREENS[k] || SCREENS.ad;
  return <svg x={x} y={y} width={w} height={h} viewBox={vb} preserveAspectRatio="xMidYMid slice">{draw()}</svg>;
}
/** display: body + screen + glare (+ floor shadow when `shadow` is a y) */
function Disp({ x, y, w, h, k, b = 1.6, body = 'k', shadow }) {
  return (
    <>
      {shadow != null && sh(x + w / 2, shadow, w * 0.42)}
      <rect x={x} y={y} width={w} height={h} rx={Math.min(2, b + 0.4)} className={body} />
      <Scr x={x + b} y={y + b} w={w - 2 * b} h={h - 2 * b} k={k} />
      {glare(x + b, y + b, w - 2 * b, h - 2 * b)}
    </>
  );
}
function Person({ x, foot = 88, h = 26, cls = 'g' }) {
  const hr = h * 0.13;
  return (
    <g className={cls}>
      <circle cx={x} cy={foot - h + hr} r={hr} />
      <rect x={x - h * 0.15} y={foot - h + hr * 2 + 1} width={h * 0.3} height={h * 0.44} rx={h * 0.1} />
      <rect x={x - h * 0.11} y={foot - h * 0.36} width={h * 0.22} height={h * 0.36} rx={h * 0.05} />
    </g>
  );
}
// bilinear point inside a quad [p00, p10, p11, p01]
const qp = (q, u, v) => {
  const a = [q[0][0] + (q[1][0] - q[0][0]) * u, q[0][1] + (q[1][1] - q[0][1]) * u];
  const b = [q[3][0] + (q[2][0] - q[3][0]) * u, q[3][1] + (q[2][1] - q[3][1]) * u];
  return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v];
};
const air = (d, i) => <path key={i} d={d} className="air" />;

// ---------- products ----------
const tvStand = (cx, top, neck, baseW) => <><rect x={cx - 4} y={top} width="8" height={neck} className="k2" /><rect x={cx - baseW / 2} y={top + neck} width={baseW} height="4" rx="2" className="k" /></>;
const PROD = {
  _: () => <Disp x={36} y={20} w={88} h={49.5} k="ad" shadow={80} />,
  qm43c: () => <Disp x={38} y={22} w={84} h={47.25} k="menu" shadow={80} />,
  qm85c: () => <Disp x={14} y={8} w={132} h={74.25} k="land" shadow={90} />,
  qb55c: () => <Disp x={28} y={15} w={104} h={58.5} k="ad" shadow={83} />,
  vm55b: () => (
    <>
      <Disp x={22} y={11} w={116} h={65.25} k="wave" b={1.2} shadow={86} />
      <path d="M80 11 V76.25 M22 43.6 H138" stroke="#0b0d12" strokeWidth="1.3" />
    </>
  ),
  epaper: () => (
    <>
      {sh(80, 86, 20)}
      <rect x="57" y="8" width="46" height="72" rx="1.5" className="w" />
      <Scr x={59.5} y={10.5} w={41} h={67} k="paper" />
    </>
  ),
  flip: () => (
    <>
      {sh(80, 89, 40)}
      <path d="M54 58 L47 86 M106 58 L113 86 M50 76 H110" className="lnk" />
      <circle cx="47" cy="87" r="2.6" className="k3" /><circle cx="113" cy="87" r="2.6" className="k3" />
      <Disp x={32} y={6} w={96} h={54} k="white" b={2.2} />
    </>
  ),
  thewall: () => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      <Disp x={10} y={6} w={128} h={72} k="wave" b={0.9} />
      <Person x={148} foot={90} h={30} cls="k3" />
    </>
  ),
  thewall_aio: () => (
    <>
      {sh(80, 89, 34)}
      <Disp x={22} y={6} w={116} h={65.25} k="land" b={1.1} />
      <rect x="74" y="71" width="12" height="12" className="k2" />
      <rect x="50" y="83" width="60" height="4" rx="2" className="k" />
    </>
  ),
  led_outdoor: () => (
    <>
      {sh(80, 89, 40)}
      <rect x="52" y="56" width="7" height="30" className="k2" /><rect x="101" y="56" width="7" height="30" className="k2" />
      <rect x="47" y="84" width="17" height="3" className="k" /><rect x="96" y="84" width="17" height="3" className="k" />
      <Disp x={24} y={8} w={112} h={50} k="ad" b={3} />
    </>
  ),
  led_indoor: () => (
    <>
      {sh(80, 86, 44)}
      <rect x="25" y="11" width="110" height="65" className="k" />
      <Scr x={26} y={12} w={108} h={63} k="wave" />
      {[1, 2, 3].map((i) => <line key={'v' + i} x1={26 + i * 27} y1="12" x2={26 + i * 27} y2="75" stroke="#0b0d12" strokeWidth=".9" opacity=".6" />)}
      {[1, 2].map((i) => <line key={'h' + i} x1="26" y1={12 + i * 21} x2="134" y2={12 + i * 21} stroke="#0b0d12" strokeWidth=".9" opacity=".6" />)}
      <rect x="107" y="12" width="27" height="21" fill="#fff" opacity=".12" />
    </>
  ),
  onyx: () => (
    <>
      <Disp x={16} y={5} w={128} h={54} k="land" b={0.8} />
      {rng(9).map((i) => <rect key={'a' + i} x={21 + i * 13.2} y="64" width="11" height="7" rx="2.5" className="k3" />)}
      {rng(8).map((i) => <rect key={'b' + i} x={15 + i * 17} y="73.5" width="14" height="8.5" rx="3" className="k2" />)}
      {rng(7).map((i) => <rect key={'c' + i} x={6 + i * 22} y="85" width="18" height="11" rx="3.5" className="k" />)}
    </>
  ),
  hoteltv: () => <>{sh(80, 87, 30)}<Disp x={30} y={9} w={100} h={56.25} k="ui" />{tvStand(80, 65.25, 14, 44)}</>,
  hoteltv43: () => <>{sh(80, 84, 24)}<Disp x={40} y={15} w={80} h={45} k="ui" />{tvStand(80, 60, 17, 36)}</>,
  smartmonitor: () => (
    <>
      {sh(80, 86, 26)}
      <rect x="75" y="5" width="10" height="4" rx="1" className="w" />
      <Disp x={34} y={9} w={92} h={51.75} k="dash" b={1.2} />
      <rect x="34" y="60.5" width="92" height="5" rx="1" className="w" />
      <rect x="76" y="65.5" width="8" height="14" className="w" />
      <rect x="60" y="79.5" width="40" height="5" rx="2.5" className="w" />
    </>
  ),
  wf1way: () => (
    <>
      <rect x="0" y="0" width="160" height="24" className="ce" />
      <rect x="18" y="21" width="124" height="14" rx="3.5" className="w" />
      <rect x="24" y="30.5" width="112" height="2.4" rx="1.2" className="g2" />
      {rng(32).map((i) => rng(2).map((j) => <circle key={i + '-' + j} cx={27 + i * 3.4} cy={24.6 + j * 2.6} r=".55" className="g" />))}
      {[40, 80, 120].map((x, i) => air(`M${x} 42 q7 9 0 18 q-7 9 0 18`, i))}
    </>
  ),
  wf4way: () => {
    const q = [[44, 18], [116, 18], [140, 52], [20, 52]];
    const inner = [qp(q, 0.14, 0.18), qp(q, 0.86, 0.18), qp(q, 0.86, 0.82), qp(q, 0.14, 0.82)];
    return (
      <>
        <rect x="0" y="0" width="160" height="30" className="ce" />
        <polygon points={q.map((p) => p.join(',')).join(' ')} className="w" />
        <polygon points={inner.map((p) => p.join(',')).join(' ')} className="w2" />
        {rng(16).map((i) => rng(6).map((j) => { const [x, y] = qp(inner, (i + 0.5) / 16, (j + 0.5) / 6); return <circle key={i + '-' + j} cx={x} cy={y} r=".6" className="g" />; }))}
        {[[30, 58], [80, 60], [130, 58]].map(([x, y], i) => air(`M${x} ${y} q6 8 0 15 q-6 8 0 15`, i))}
      </>
    );
  },
  dvms2: () => (
    <>
      {sh(80, 88, 38)}
      <rect x="46" y="10" width="68" height="75" rx="2.5" className="w" />
      <rect x="44" y="7" width="72" height="5" rx="2" className="w2" />
      <rect x="52" y="17" width="56" height="58" rx="2" className="w2" />
      <circle cx="80" cy="32" r="12" className="fan" /><circle cx="80" cy="60" r="12" className="fan" />
      {rng(15).map((i) => <line key={i} x1="53" x2="107" y1={19.5 + i * 3.7} y2={19.5 + i * 3.7} className="lou" />)}
      <rect x="50" y="85" width="10" height="3" className="k3" /><rect x="100" y="85" width="10" height="3" className="k3" />
    </>
  ),
  dvmchiller: () => (
    <>
      {sh(80, 88, 70)}
      <polygon points="14,36 146,36 138,24 22,24" className="w2" />
      {rng(4).map((i) => <g key={i}><ellipse cx={37 + i * 28.7} cy="30" rx="11" ry="4" className="k3" /><ellipse cx={37 + i * 28.7} cy="30" rx="3.5" ry="1.3" className="g" /></g>)}
      <rect x="14" y="36" width="132" height="44" className="w" />
      {rng(25).map((i) => <line key={i} x1={20 + i * 4} x2={20 + i * 4} y1="42" y2="74" className="lou" />)}
      <rect x="120" y="44" width="20" height="13" rx="1.5" className="k2" /><rect x="123" y="47" width="9" height="3" fill="#63e6be" />
      <rect x="4" y="54" width="10" height="4" fill="#4dabf7" /><rect x="4" y="64" width="10" height="4" fill="#ff8787" />
      <rect x="14" y="80" width="132" height="5" className="k3" />
    </>
  ),
  ehs: () => (
    <>
      {sh(110, 87, 34)}
      <rect x="24" y="10" width="42" height="60" rx="3" className="w" />
      <rect x="34" y="20" width="22" height="9" rx="1.5" className="k" /><rect x="37" y="23.5" width="9" height="2.2" fill="#63e6be" />
      <circle cx="45" cy="37" r="1.4" fill="#37b24d" />
      <path d="M41 70 V80 H78" stroke="#4dabf7" strokeWidth="2.2" fill="none" /><path d="M49 70 V75 H78" stroke="#ff8787" strokeWidth="2.2" fill="none" />
      <rect x="78" y="36" width="64" height="49" rx="2.5" className="w" />
      <rect x="126" y="40" width="12" height="41" rx="1" className="w2" />
      <circle cx="102" cy="60" r="18" className="w2" />
      <circle cx="102" cy="60" r="14" className="fan" /><circle cx="102" cy="60" r="9.5" className="fan" />
      <path d="M102 42 V78 M84 60 H120" className="fanl" />
      <circle cx="102" cy="60" r="3" className="g2" />
    </>
  ),
  erv: () => (
    <>
      <rect x="0" y="0" width="160" height="22" className="ce" />
      {[[20, 27], [20, 38], [112, 27], [112, 38]].map(([x, y], i) => <g key={i}><rect x={x} y={y} width="28" height="7" className="al" /><ellipse cx={x < 80 ? x : x + 28} cy={y + 3.5} rx="1.6" ry="3.5" className="g2" /></g>)}
      <rect x="48" y="23" width="64" height="26" rx="2" className="w" />
      <rect x="54" y="29" width="22" height="3" rx="1.5" className="g2" />
      <path d="M22 50 q16 26 54 20" stroke="#12b886" strokeWidth="2.4" fill="none" strokeDasharray="4 3" strokeLinecap="round" />
      <polygon points="76,66 82,70 75,74" fill="#12b886" />
      <path d="M86 82 q34 0 50 -28" stroke="#f08c00" strokeWidth="2.4" fill="none" strokeDasharray="4 3" strokeLinecap="round" />
      <polygon points="131,57 138,51 139,60" fill="#f08c00" />
    </>
  ),
  purifier: () => (
    <>
      {sh(80, 87, 22)}
      <rect x="62" y="8" width="36" height="78" rx="11" fill="#e7e0d4" stroke="#cdc4b3" />
      <ellipse cx="80" cy="13" rx="14" ry="3.6" fill="#3a3f49" />
      {rng(5).map((i) => <line key={i} x1={70 + i * 5} x2={70 + i * 5} y1="10.5" y2="15.5" stroke="#5c6370" strokeWidth=".8" />)}
      <rect x="66" y="22" width="28" height="58" rx="8" fill="#efe9de" />
      <circle cx="80" cy="29" r="3.2" fill="#1c2029" /><circle cx="80" cy="29" r="1.2" fill="#38d9a9" />
    </>
  ),
  airdresser: () => (
    <>
      {sh(80, 87, 26)}
      <rect x="56" y="6" width="48" height="80" rx="3" fill="#cfd5de" stroke="#b3bbc7" />
      <polygon points="60,6 82,6 60,44" fill="#fff" opacity=".35" />
      <rect x="98" y="30" width="2.4" height="26" rx="1.2" className="g" />
      <rect x="64" y="12" width="12" height="2" rx="1" fill="#1c2029" opacity=".55" />
    </>
  ),
  tabs11: () => (
    <>
      {sh(78, 89, 46)}
      <rect x="22" y="18" width="108" height="67.5" rx="5" className="k" />
      <Scr x={25} y={21} w={102} h={61.5} k="ui" />{glare(25, 21, 102, 61.5)}
      <rect x="136" y="22" width="4" height="58" rx="2" fill="#9aa3b2" /><polygon points="136,80 140,80 138,85" fill="#5c6370" />
    </>
  ),
  tabactive5: () => (
    <>
      {sh(80, 88, 46)}
      <rect x="28" y="16" width="104" height="68" rx="9" className="rg" />
      {[[28, 16], [112, 16], [28, 64], [112, 64]].map(([x, y], i) => <rect key={i} x={x} y={y} width="20" height="20" rx="8" className="k" />)}
      <rect x="34" y="22" width="92" height="56" rx="4" className="k" />
      <Scr x={37} y={25} w={86} h={50} k="dash" />{glare(37, 25, 86, 50)}
      <rect x="132" y="30" width="2.6" height="10" rx="1" fill="#f08c00" />
    </>
  ),
  xcover7: () => (
    <>
      {sh(80, 90, 22)}
      <rect x="60" y="6" width="40" height="82" rx="8" className="rg" />
      <rect x="60" y="6" width="40" height="10" rx="7" className="k" /><rect x="60" y="78" width="40" height="10" rx="7" className="k" />
      <rect x="64" y="14" width="32" height="64" rx="2" className="k" />
      <Scr x={65.2} y={15.2} w={29.6} h={61.6} k="uiP" />
      <rect x="99.6" y="22" width="2.6" height="10" rx="1" fill="#f08c00" />
    </>
  ),
  galaxyA: () => (
    <>
      {sh(84, 89, 36)}
      <rect x="44" y="12" width="36" height="74" rx="7" fill="#cfc7ee" stroke="#b7addf" />
      {[22, 31, 40].map((y) => <circle key={y} cx="54" cy={y} r="3.6" fill="#1c2029" stroke="#b7addf" strokeWidth="1.2" />)}
      <rect x="74" y="8" width="38" height="78" rx="7" className="k" />
      <Scr x={75.8} y={9.8} w={34.4} h={74.4} k="phone" />
      <circle cx="93" cy="14" r="1.4" fill="#000" />
    </>
  ),
  watch: () => (
    <>
      <rect x="67" y="2" width="26" height="30" rx="5" fill="#3a3f49" /><rect x="67" y="68" width="26" height="30" rx="5" fill="#3a3f49" />
      <rect x="103" y="45" width="3" height="9" rx="1.2" fill="#9aa3b2" />
      <circle cx="80" cy="50" r="24" fill="#a3abb9" />
      <circle cx="80" cy="50" r="21" fill="#14171d" />
      <circle cx="80" cy="50" r="15" fill="none" stroke="#2b303b" strokeWidth="3" />
      <circle cx="80" cy="50" r="15" fill="none" stroke="#12b886" strokeWidth="3" strokeDasharray="62 100" strokeLinecap="round" transform="rotate(-90 80 50)" />
      <circle cx="80" cy="50" r="10" fill="none" stroke="#2b303b" strokeWidth="3" />
      <circle cx="80" cy="50" r="10" fill="none" stroke="#f59f00" strokeWidth="3" strokeDasharray="38 100" strokeLinecap="round" transform="rotate(-90 80 50)" />
      <rect x="75" y="47.5" width="10" height="5" rx="1" fill="#fff" />
    </>
  ),
  smarttag: () => (
    <>
      {sh(86, 84, 40)}
      <g transform="rotate(-12 64 54)"><rect x="44" y="32" width="40" height="40" rx="13" className="k" /><circle cx="75" cy="41" r="3.4" className="hole" /></g>
      <g transform="rotate(10 100 50)"><rect x="80" y="30" width="40" height="40" rx="13" className="w" /><circle cx="111" cy="39" r="3.4" className="hole" /></g>
      <circle cx="128" cy="20" r="9" fill="none" stroke="#8d96a6" strokeWidth="1.6" />
    </>
  ),
  book: () => (
    <>
      {sh(80, 82, 64)}
      <rect x="38" y="9" width="84" height="53" rx="3" className="k" />
      <Scr x={41} y={12} w={78} h={47} k="dash" />{glare(41, 12, 78, 47)}
      <polygon points="26,62 134,62 146,76 14,76" fill="#cfd4dc" stroke="#b6bcc7" />
      <polygon points="40,64 120,64 125,70 35,70" fill="#a9b0bc" />
      <polygon points="70,71.5 90,71.5 91,75 69,75" fill="#bcc2cc" />
      <rect x="14" y="76" width="132" height="2.5" rx="1.2" fill="#b6bcc7" />
    </>
  ),
  bi_induction: () => (
    <>
      <polygon points="4,38 156,38 160,70 0,70" className="ct" />
      <polygon points="34,43 126,43 134,66 26,66" className="k" />
      <ellipse cx="58" cy="50" rx="11" ry="3.6" fill="none" stroke="#5c6370" strokeWidth="1.2" />
      <ellipse cx="102" cy="50" rx="11" ry="3.6" fill="#e8590c" opacity=".55" />
      <ellipse cx="102" cy="50" rx="11" ry="3.6" fill="none" stroke="#ff922b" strokeWidth="1.2" />
      <ellipse cx="54" cy="59" rx="13" ry="4.2" fill="none" stroke="#5c6370" strokeWidth="1.2" />
      <ellipse cx="106" cy="59" rx="13" ry="4.2" fill="none" stroke="#5c6370" strokeWidth="1.2" />
      {rng(5).map((i) => <circle key={i} cx={72 + i * 4} cy="63.5" r=".9" fill="#fff" opacity=".6" />)}
      <rect x="0" y="70" width="160" height="30" className="wd" />
      <path d="M53 70 V100 M107 70 V100 M0 84 H160" className="wdl" />
      {[26, 80, 134].map((x) => <rect key={x} x={x - 7} y="76" width="14" height="2" rx="1" className="g" />)}
    </>
  ),
  bi_dish: () => (
    <>
      <rect x="8" y="22" width="144" height="6" className="ct" />
      <rect x="10" y="28" width="44" height="56" className="wd" /><rect x="106" y="28" width="44" height="56" className="wd" />
      <rect x="18" y="34" width="2" height="12" rx="1" className="g" /><rect x="140" y="34" width="2" height="12" rx="1" className="g" />
      <rect x="56" y="28" width="48" height="56" fill="#d9dde3" stroke="#b6bcc7" />
      <rect x="56" y="28" width="48" height="6" fill="#2b303b" /><rect x="60" y="30" width="10" height="2" fill="#63e6be" />
      <rect x="62" y="38" width="36" height="2.4" rx="1.2" fill="#9aa3b2" />
      <polygon points="58,40 72,40 58,70" fill="#fff" opacity=".3" />
      <rect x="10" y="84" width="140" height="4" className="k3" />
    </>
  ),
  bi_fridge: () => (
    <>
      <rect x="26" y="6" width="16" height="82" className="wd" /><rect x="118" y="6" width="16" height="82" className="wd" />
      <rect x="42" y="6" width="76" height="12" className="wd" />
      <rect x="43" y="19" width="37" height="40" fill="#cfe3dc" stroke="#b5cfc6" /><rect x="80" y="19" width="37" height="40" fill="#cfe3dc" stroke="#b5cfc6" />
      <rect x="43" y="60" width="37" height="27" fill="#e6dccd" stroke="#d3c6b2" /><rect x="80" y="60" width="37" height="27" fill="#e6dccd" stroke="#d3c6b2" />
      <rect x="76" y="28" width="1.8" height="16" rx=".9" className="g" /><rect x="82.2" y="28" width="1.8" height="16" rx=".9" className="g" />
      <rect x="54" y="63" width="14" height="1.8" rx=".9" className="g" /><rect x="92" y="63" width="14" height="1.8" rx=".9" className="g" />
      <rect x="26" y="88" width="108" height="3" className="k3" />
    </>
  ),
  laundry: () => (
    <>
      {sh(80, 88, 60)}
      {[24, 82].map((x, i) => (
        <g key={x}>
          <rect x={x} y="14" width="54" height="72" rx="3" className="w" />
          <rect x={x} y="14" width="54" height="11" rx="3" className="w2" />
          <rect x={x + 6} y="17.5" width="16" height="4" rx="1" className="k" /><rect x={x + 8} y="18.5" width="6" height="2" fill="#63e6be" />
          <circle cx={x + 44} cy="19.5" r="2.8" className="g2" />
          <circle cx={x + 27} cy="52" r="19" fill="#9aa3b2" />
          <circle cx={x + 27} cy="52" r="15" fill={i ? '#8b96aa' : '#a9b7cf'} />
          <circle cx={x + 27} cy="52" r="10.5" fill={i ? '#6f7a8f' : '#7f8fb0'} />
          <path d={`M${x + 17} ${46} a12 12 0 0 1 10 -7`} stroke="#fff" strokeWidth="1.6" fill="none" opacity=".7" strokeLinecap="round" />
          <rect x={x + 22} y="76" width="10" height="5" rx="1" className="g2" />
        </g>
      ))}
    </>
  ),
  harman: () => (
    <>
      {sh(88, 87, 52)}
      <polygon points="44,10 96,10 92,85 48,85" className="k" />
      <rect x="58" y="18" width="24" height="16" rx="3" className="k2" /><rect x="62" y="21" width="16" height="10" rx="2" fill="#0f1115" />
      <circle cx="70" cy="60" r="16" className="k2" /><circle cx="70" cy="60" r="16" fill="none" stroke="#5c6370" strokeWidth="1.5" />
      <circle cx="70" cy="60" r="6" className="k3" />
      <rect x="66" y="78" width="8" height="2" fill="#f08c00" />
      <polygon points="100,85 144,85 144,64 112,51" className="k" />
      <circle cx="126" cy="72" r="8" className="k2" /><circle cx="126" cy="72" r="3" className="k3" />
    </>
  ),
};
// fallbacks by catalog category, for products added later without a dedicated drawing
const CATDRAW = {
  'LCD 사이니지': PROD.qb55c, '옥외 사이니지': PROD.led_outdoor, '비디오월': PROD.vm55b, '컬러 이페이퍼': PROD.epaper, '키오스크': PROD._,
  '전자칠판': PROD.flip, 'LED 사이니지': PROD.led_indoor, '시네마 LED': PROD.onyx, '호텔 TV': PROD.hoteltv, '모니터': PROD.smartmonitor,
  '시스템에어컨': PROD.wf4way, '공조': PROD.dvmchiller, '히트펌프': PROD.ehs, '공조 · 환기': PROD.erv, '리빙가전': PROD.purifier,
  '갤럭시 탭': PROD.tabs11, '갤럭시 스마트폰': PROD.galaxyA, '갤럭시 워치 · 태그': PROD.watch, 'PC · 노트북': PROD.book,
  '빌트인 주방가전': PROD.bi_fridge, '상업용 세탁 · 건조': PROD.laundry, '하만 프로 오디오': PROD.harman,
  // 제품 DB(사이트 목록 이름) — 사진이 없을 때 가까운 그림
  '스마트 LCD 사이니지': PROD.qb55c, '스마트 LED 사이니지': PROD.led_indoor, '호텔TV': PROD.hoteltv, 'TV': PROD.hoteltv, '사이니지 솔루션': PROD.qb55c, 'TV/음향 솔루션': PROD.hoteltv,
  '대형건물용': PROD.dvms2, '중소건물용 실내외기': PROD.wf4way, '주거용 실내외기': PROD.wf1way, '바닥난방/급탕 솔루션': PROD.ehs, '환기 솔루션': PROD.erv,
  '중앙공조': PROD.dvmchiller, '콜드체인 시스템': PROD.dvmchiller, '에어컨': PROD.wf1way, '시스템에어컨 솔루션': PROD.wf4way, '에어컨 세척서비스': PROD.wf4way, '에어컨 케어서비스': PROD.wf4way,
  '스마트폰': PROD.galaxyA, '갤럭시 워치': PROD.watch, '갤럭시 버즈': PROD.watch, '갤럭시 링': PROD.watch, '모바일 액세서리': PROD.smarttag, '갤럭시 XR': PROD.tabs11,
  '노트북': PROD.book, '올인원PC/데스크탑': PROD.smartmonitor, 'Chromebook': PROD.book, '모바일 솔루션': PROD.tabs11,
  '냉장고': PROD.bi_fridge, '김치냉장고': PROD.bi_fridge, '식기세척기': PROD.bi_dish, '전기레인지': PROD.bi_induction, '오븐/큐커': PROD.bi_induction, '후드': PROD.bi_induction,
  '세탁기': PROD.laundry, '건조기': PROD.laundry, '에어드레서': PROD.airdresser, '슈드레서': PROD.airdresser, '공기청정기': PROD.purifier,
};

// 카탈로그 전용 분류(사이트 목록에 없는 이름) → 가까운 그림
const scDraw = (sc) => {
  const t = String(sc || '');
  if (/실외기/.test(t)) return PROD.dvms2;
  if (/^시스템에어컨|상업용 히트펌프|설치솔루션/.test(t)) return PROD.wf4way;
  if (/빌딩통합|제어/.test(t)) return PROD.dvmchiller;
  if (/하만|오디오/.test(t)) return PROD.harman;
  if (/제습|청정/.test(t)) return PROD.purifier;
  return null;
};

// ---------- solutions ----------
function Win({ x = 16, y = 9, w = 128, h = 80, children }) {
  return (
    <>
      {sh(x + w / 2, y + h + 5, w * 0.44)}
      <rect x={x} y={y} width={w} height={h} rx="5" className="win" />
      <path d={`M${x} ${y + 9} V${y + 5} a5 5 0 0 1 5 -5 H${x + w - 5} a5 5 0 0 1 5 5 V${y + 9} Z`} className="wbar" />
      {['#ff8787', '#ffd43b', '#69db7c'].map((c, i) => <circle key={c} cx={x + 6 + i * 4.5} cy={y + 4.6} r="1.3" fill={c} />)}
      {children}
    </>
  );
}
const bar = (x, y, w, cls = 'mut', h = 3) => <rect x={x} y={y} width={w} height={h} rx={h / 2} className={cls} />;
const SOL = {
  _: () => <Win><Scr x={22} y={23} w={116} h={60} k="dash" /></Win>,
  smartthings: () => {
    const cx = 94, cy = 54, nodes = rng(6).map((i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return [cx + Math.cos(a) * 30, cy + Math.sin(a) * 22]; });
    const cols = ['#12b886', '#f59f00', '#7048e8', '#e8590c', '#1c7ed6', '#e64980'];
    return (
      <Win>
        <rect x="22" y="23" width="26" height="60" rx="2" className="mut" />
        {rng(5).map((i) => <rect key={i} x="26" y={28 + i * 9} width={[18, 14, 16, 12, 15][i]} height="3" rx="1.5" className="mutd" />)}
        {nodes.map(([x, y], i) => <line key={'l' + i} x1={cx} y1={cy} x2={x} y2={y} className="mutl" />)}
        {nodes.map(([x, y], i) => <g key={i}><circle cx={x} cy={y} r="6.5" fill={cols[i]} /><circle cx={x} cy={y} r="2.2" fill="#fff" /></g>)}
        <circle cx={cx} cy={cy} r="10.5" className="ac" />
        <polygon points={`${cx},${cy - 5.5} ${cx + 6},${cy - 0.5} ${cx + 4},${cy - 0.5} ${cx + 4},${cy + 5} ${cx - 4},${cy + 5} ${cx - 4},${cy - 0.5} ${cx - 6},${cy - 0.5}`} fill="#fff" />
      </Win>
    );
  },
  biot: () => (
    <Win>
      <rect x="25" y="28" width="34" height="55" rx="1.5" fill="#6b7a99" />
      {rng(18).map((k) => { const i = k % 3, j = Math.floor(k / 3); return <rect key={k} x={29 + i * 9.5} y={32 + j * 8.2} width="6" height="5" fill={[4, 9, 13].includes(k) ? '#ffd43b' : '#cfe0ff'} opacity=".9" />; })}
      {rng(3).map((i) => <g key={i}><rect x={66 + i * 24} y="25" width="21" height="15" rx="2" className="mut" />{bar(69 + i * 24, 29, 10, 'mutd', 2.5)}{bar(69 + i * 24, 34, 14, i === 1 ? 'okb' : 'acb', 3)}</g>)}
      <rect x="66" y="44" width="69" height="39" rx="2" className="mut" />
      <polygon points="70,78 80,68 90,72 100,60 110,64 120,54 131,58 131,80 70,80" className="ac2" />
      <polyline points="70,78 80,68 90,72 100,60 110,64 120,54 131,58" fill="none" className="acs" />
    </Win>
  ),
  lynk: () => (
    <>
      {sh(80, 86, 30)}<Disp x={26} y={10} w={108} h={60.75} k="ui" />{tvStand(80, 70.75, 10, 44)}
      <circle cx="134" cy="16" r="11" className="ac" />
      <path d="M128 19.5 h12 a3.5 3.5 0 0 0 0 -7 a5 5 0 0 0 -9.5 -1.2 a3.5 3.5 0 0 0 -2.5 8.2z" fill="#fff" />
    </>
  ),
  knoxsuite: () => (
    <Win>
      {rng(4).map((i) => (
        <g key={i}>
          <rect x="24" y={26 + i * 14} width="7" height="11" rx="1.6" className="k3" />
          {bar(36, 28 + i * 14, 40, 'mutd')}{bar(36, 33 + i * 14, 26)}
          <circle cx="84" cy={31.5 + i * 14} r="2.2" fill={i === 2 ? '#f59f00' : '#37b24d'} />
        </g>
      ))}
      <path d="M116 28 L135 35 V53 C135 66 127 74 116 78 C105 74 97 66 97 53 V35 Z" className="ac" />
      <path d="M107 53 l6 6 l12 -13" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Win>
  ),
  knoxcapture: () => (
    <>
      {sh(110, 88, 34)}
      <polygon points="84,40 140,40 132,32 92,32" fill="#d8b892" />
      <rect x="84" y="40" width="56" height="45" className="wd" />
      <rect x="95" y="50" width="34" height="22" fill="#fff" />
      {[2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 2, 3, 1].reduce((acc, w, i) => { const x = acc.x; acc.el.push(i % 2 === 0 ? <rect key={i} x={x} y="53" width={w * 0.9} height="13" fill="#212529" /> : null); acc.x += w * 0.9 + 0.7; return acc; }, { x: 98, el: [] }).el}
      <rect x="98" y="67.5" width="26" height="2" fill="#868e96" />
      <polygon points="64,30 96,50 96,73" fill="#ff4d4f" opacity=".16" />
      <g transform="rotate(-10 50 52)">
        <rect x="32" y="12" width="38" height="76" rx="7" className="rg" />
        <rect x="36" y="20" width="30" height="58" rx="2" fill="#1f2228" />
        <rect x="40" y="38" width="22" height="18" fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="1" />
        <line x1="40" y1="47" x2="62" y2="47" stroke="#ff4d4f" strokeWidth="1.6" />
        <rect x="69.4" y="26" width="2.6" height="10" rx="1" fill="#f08c00" />
      </g>
    </>
  ),
  dex: () => (
    <>
      {sh(84, 90, 44)}
      <Disp x={40} y={8} w={100} h={56} k="desk" />
      <rect x="86" y="64" width="8" height="10" className="k2" /><rect x="72" y="74" width="36" height="3.2" rx="1.6" className="k" />
      <polygon points="64,82 124,82 129,90 59,90" fill="#cfd4dc" stroke="#b6bcc7" />
      <path d="M29 80 Q32 92 58 88 T86 76" className="ln" />
      <rect x="18" y="42" width="22" height="40" rx="4" className="k" />
      <Scr x={19.6} y={43.6} w={18.8} h={36.8} k="phone" />
    </>
  ),
  coldchain: () => (
    <>
      {sh(57, 88, 36)}
      <rect x="22" y="12" width="70" height="74" rx="2" className="w" />
      <rect x="22" y="12" width="70" height="10" rx="2" className="ac" />
      <rect x="27" y="26" width="60" height="52" fill="#dbe9ff" />
      {[39, 52, 65].map((y) => <line key={y} x1="27" x2="87" y1={y} y2={y} stroke="#a9bfe6" strokeWidth="1.5" />)}
      {rng(12).map((k) => { const i = k % 4, j = Math.floor(k / 4); return <rect key={k} x={31 + i * 14} y={28.5 + j * 13 + (k % 3)} width="8" height={9.5 - (k % 3)} rx="1.5" fill={['#ff922b', '#51cf66', '#339af0', '#f06595', '#fcc419'][k % 5]} />; })}
      <rect x="22" y="78" width="70" height="8" className="k3" />
      <rect x="98" y="32" width="48" height="40" rx="4" className="win" />
      {bar(104, 38, 22, 'mutd')}
      <rect x="104" y="46" width="36" height="20" rx="2" className="mut" />
      <polyline points="106,58 113,56 119,60 125,55 131,57 138,54" fill="none" stroke="#1c7ed6" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="136" cy="24" r="9" fill="#4dabf7" />
      <path d="M136 18 V30 M130.8 21 L141.2 27 M130.8 27 L141.2 21" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  hvac: () => (
    <>
      {sh(60, 88, 40)}
      <rect x="22" y="22" width="74" height="63" className="bld" />
      <path d="M22 43 H96 M22 64 H96" className="bldl" />
      {[30, 52].map((x) => <g key={x}><rect x={x} y="13" width="16" height="9" className="k3" /><circle cx={x + 8} cy="17.5" r="3" className="g" /></g>)}
      {[23.5, 44.5, 65.5].map((y) => [34, 64].map((x) => <g key={x + '-' + y}><rect x={x} y={y} width="14" height="2.6" className="w" />{air(`M${x + 7} ${y + 5} q4 4 0 8`, x + '-' + y)}</g>))}
      <line x1="90" y1="18" x2="90" y2="85" stroke="#4dabf7" strokeWidth="1.4" /><line x1="93" y1="18" x2="93" y2="85" stroke="#ff8787" strokeWidth="1.4" />
      <rect x="102" y="24" width="42" height="52" rx="4" className="win" />
      <circle cx="123" cy="45" r="11" fill="none" className="mutr" />
      <circle cx="123" cy="45" r="11" fill="none" className="acr" strokeDasharray="44 100" transform="rotate(135 123 45)" />
      {bar(110, 63, 26, 'mutd')}{bar(110, 68.5, 18)}
    </>
  ),
  sac: () => (
    <>
      <rect x="24" y="22" width="40" height="56" rx="5" className="w" />
      <rect x="29" y="27" width="30" height="27" rx="2" fill="#1c2029" />
      <path d="M35 33 h7 v6.5 h-7 v6.5 h7 M46 33 v6.5 h7 M53 33 v13" stroke="#63e6be" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {[34, 44, 54].map((x) => <circle key={x} cx={x} cy="66" r="3.2" className="w2" />)}
      <rect x="72" y="20" width="70" height="62" rx="3" className="win" />
      <rect x="76" y="24" width="30" height="26" fill="#74c0fc" opacity=".55" /><rect x="108" y="24" width="30" height="26" fill="#ffa94d" opacity=".55" />
      <rect x="76" y="52" width="20" height="26" fill="#63e6be" opacity=".55" /><rect x="98" y="52" width="40" height="26" fill="#74c0fc" opacity=".38" />
      {[[86, 34], [118, 34], [83, 62], [115, 62]].map(([x, y]) => <rect key={x + '-' + y} x={x} y={y} width="8" height="6" rx="1" className="w" />)}
    </>
  ),
  care: () => (
    <Win>
      {rng(4).map((i) => (
        <g key={i}>
          <circle cx="30" cy={30 + i * 13} r="3.6" className={i < 3 ? 'okf' : 'mut'} />
          {i < 3 && <path d={`M28.2 ${30 + i * 13} l1.4 1.4 l2.6 -2.8`} stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round" />}
          {bar(38, 28.5 + i * 13, [50, 40, 46, 34][i], 'mutd')}
          <rect x="94" y={28 + i * 13} width="14" height="4.5" rx="2.25" className="mut" />
        </g>
      ))}
      <circle cx="126" cy="66" r="14" className="ac" />
      <path d="M119 73 l9 -9" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="129.5" cy="62.5" r="4.6" fill="#fff" /><circle cx="131.6" cy="60.4" r="2" className="ac" />
    </Win>
  ),
  content: () => (
    <Win>
      <Scr x={22} y={23} w={74} h={40} k="ad" />
      <rect x="100" y="23" width="38" height="40" rx="2" className="mut" />
      {rng(3).map((i) => <rect key={i} x="104" y={27 + i * 12} width="30" height="9" rx="1.5" fill={['#7048e8', '#f59f00', '#12b886'][i]} opacity=".75" />)}
      <rect x="22" y="67" width="116" height="16" rx="2" className="mut" />
      <rect x="26" y="70" width="40" height="4" rx="2" className="ac" /><rect x="68" y="70" width="28" height="4" rx="2" fill="#f59f00" />
      <rect x="26" y="76" width="58" height="4" rx="2" fill="#12b886" /><rect x="88" y="76" width="40" height="4" rx="2" fill="#7048e8" />
      <line x1="84" y1="65" x2="84" y2="84" stroke="#e8590c" strokeWidth="1.5" /><polygon points="81,64 87,64 84,68" fill="#e8590c" />
    </Win>
  ),
  partnerapp: () => (
    <>
      {sh(84, 90, 50)}
      <polygon points="78,16 114,16 114,72 110,76 106,72 102,76 98,72 94,76 90,72 86,76 82,72 78,75" className="paper" />
      {rng(4).map((i) => <g key={i}>{bar(83, 23 + i * 9, 18, 'mutd', 2.5)}{bar(104, 23 + i * 9, 6, 'mutd', 2.5)}</g>)}
      <rect x="83" y="62" width="27" height="4" rx="1" className="ac" />
      <rect x="24" y="8" width="40" height="80" rx="7" className="k" />
      <Scr x={26} y={10} w={36} h={76} k="order" />
      <g transform="rotate(-8 121 66)">
        <rect x="100" y="52" width="44" height="28" rx="3.5" className="ac" />
        <rect x="106" y="59" width="8" height="6" rx="1" fill="#ffd43b" />
        <rect x="106" y="70" width="26" height="2.6" rx="1.3" fill="#fff" opacity=".7" />
      </g>
    </>
  ),
  unmanned: () => (
    <>
      <rect x="0" y="86" width="160" height="14" className="fl" />
      <rect x="28" y="8" width="58" height="80" className="k3" />
      <rect x="32" y="12" width="50" height="76" fill="#a5d8ff" opacity=".4" stroke="#74c0fc" />
      <polygon points="36,12 52,12 36,44" fill="#fff" opacity=".35" />
      <rect x="74" y="44" width="2.6" height="18" rx="1.3" className="g" />
      <rect x="94" y="40" width="16" height="24" rx="2.5" className="k" />
      <rect x="97" y="43" width="10" height="8" rx="1" fill="#12b886" /><circle cx="102" cy="58" r="1.6" fill="#51cf66" />
      <path d="M114 50 a6 6 0 0 0 0 -8 M118 53 a11 11 0 0 0 0 -14" className="acs" fill="none" />
      <rect x="118" y="36" width="28" height="50" rx="5" className="k" />
      <rect x="121" y="42" width="22" height="38" rx="1.5" fill="#fff" />
      {[[0, 0], [1, 0], [3, 0], [5, 0], [0, 1], [2, 1], [4, 1], [5, 1], [1, 2], [2, 2], [3, 2], [0, 3], [3, 3], [5, 3], [1, 4], [4, 4], [5, 4], [0, 5], [2, 5], [3, 5], [5, 5]].map(([i, j]) => <rect key={i + '-' + j} x={123 + i * 3} y={50 + j * 3} width="3" height="3" fill="#212529" />)}
    </>
  ),
  safety: () => (
    <>
      <rect x="16" y="10" width="6" height="16" className="k3" />
      <polygon points="56,18 104,40 78,56" className="ac2" />
      <polygon points="22,15 52,11 55,23 24,27" className="w" />
      <circle cx="55" cy="17.5" r="4.2" className="k" /><circle cx="55" cy="17.5" r="1.6" fill="#4dabf7" />
      {sh(104, 89, 40)}
      <rect x="64" y="32" width="80" height="52" rx="4" className="k" />
      {rng(4).map((k) => { const i = k % 2, j = Math.floor(k / 2), x = 68 + i * 38, y = 36 + j * 23; return <g key={k}><rect x={x} y={y} width="36" height="21" fill="#2b3445" stroke={k === 1 ? '#ff6b6b' : 'none'} strokeWidth="1.4" /><Person x={x + 12 + (k * 7) % 14} foot={y + 20} h={14} cls="feedp" /></g>; })}
      <polygon points="132,22 141,38 123,38" fill="#ff6b6b" /><rect x="131.2" y="27" width="1.8" height="6" fill="#fff" /><rect x="131.2" y="34.5" width="1.8" height="1.8" fill="#fff" />
    </>
  ),
};

// ---------- cases: a scene per industry + a badge for the main product category ----------
const hash = (s) => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const SCENE = {
  // drive-thru: chosen by the case's spaces, any industry
  DT: () => (
    <>
      <rect x="0" y="78" width="160" height="22" className="fl" />
      <rect x="0" y="86" width="160" height="14" fill="#7c8696" opacity=".45" />
      {rng(8).map((i) => <rect key={i} x={4 + i * 21} y="92" width="10" height="1.6" fill="#fff" opacity=".75" />)}
      <rect x="0" y="20" width="58" height="60" className="bld" />
      <rect x="0" y="15" width="62" height="6" className="acf" />
      <rect x="8" y="32" width="40" height="26" fill="#ffe8a3" opacity=".8" stroke="#c3c9d3" />
      <rect x="22" y="62" width="14" height="18" className="wd2" />
      <rect x="75" y="22" width="38" height="5" className="k3" />
      <Disp x={79} y={28} w={30} h={38} k="menu" b={1.4} />
      <rect x="84" y="66" width="4" height="16" className="k2" /><rect x="100" y="66" width="4" height="16" className="k2" />
      <path d="M114 86 v-9 q0 -4 4 -5 l8 -9 q2 -2 6 -2 h14 q4 0 6 3 l4 8 q3 1 3 5 v9 z" className="acf" />
      <path d="M128 71 l6 -7 h10 l4 7 z" fill="#d0ebff" />
      <circle cx="124" cy="86" r="4.6" className="k" /><circle cx="150" cy="86" r="4.6" className="k" />
    </>
  ),
  FBseat: (v) => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      <Disp x={56} y={12} w={48} h={27} k={v % 3 ? 'ad' : 'land'} b={1.2} />
      {[26, 134].map((x) => <g key={x}><line x1={x} y1="0" x2={x} y2="30" className="ln" /><circle cx={x} cy="38" r="12" fill="#ffd43b" opacity=".14" /><polygon points={`${x - 7},36 ${x + 7},36 ${x + 4},30 ${x - 4},30`} className="k3" /></g>)}
      {[40, 120].map((x) => (
        <g key={x}>
          <rect x={x - 22} y="58" width="9" height="12" rx="3" className="k3" /><rect x={x + 13} y="58" width="9" height="12" rx="3" className="k3" />
          <rect x={x - 1.5} y="64" width="3" height="16" className="k2" /><rect x={x - 8} y="79" width="16" height="2" rx="1" className="k2" />
          <ellipse cx={x} cy="63" rx="16" ry="3.6" className="wd" />
          <rect x={x - 6} y="57" width="5" height="6" rx="1" className="w" /><rect x={x + 2} y="58" width="5" height="5" rx="1" className="w" />
        </g>
      ))}
      <rect x="72" y="68" width="16" height="12" className="wd2" /><circle cx="80" cy="60" r="8" className="pl" /><circle cx="86" cy="64" r="5" className="pl" />
    </>
  ),
  FB: () => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      {[0, 1, 2].map((i) => <Disp key={i} x={23 + i * 39} y={10} w={36} h={20.25} k="menu" b={1.1} />)}
      <rect x="18" y="52" width="124" height="30" className="wd" />
      {rng(20).map((i) => <line key={i} x1={22 + i * 6} x2={22 + i * 6} y1="54" y2="82" className="wdl" />)}
      <rect x="14" y="48" width="132" height="5" rx="1.5" className="ct" />
      <rect x="98" y="34" width="24" height="14" rx="1.5" className="k2" /><rect x="102" y="38" width="7" height="4" fill="#ff922b" />
      <rect x="38" y="41" width="6" height="7" rx="1" className="w" /><rect x="47" y="41" width="6" height="7" rx="1" className="w" />
      <rect x="4" y="66" width="10" height="14" className="wd2" /><circle cx="9" cy="58" r="7" className="pl" /><circle cx="14" cy="63" r="5" className="pl" />
    </>
  ),
  RT: (v) => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      <rect x="8" y="16" width="40" height="64" className="wd2" />
      {[30, 50, 70].map((y) => <rect key={y} x="10" y={y} width="36" height="3" className="wd" />)}
      {rng(12).map((k) => { const i = k % 4, j = Math.floor(k / 4); return <rect key={k} x={12 + i * 8.5} y={20 + j * 20} width="6" height={9 - (k % 3)} rx="1" fill={['#e64980', '#4dabf7', '#ffd43b', '#69db7c', '#9775fa'][k % 5]} transform={`translate(0 ${(k % 3)})`} />; })}
      <Disp x={64} y={10} w={30} h={53} k={v % 2 ? 'ad' : 'wave'} b={1.2} />
      <rect x="76" y="63" width="6" height="16" className="k2" /><rect x="68" y="79" width="22" height="2.5" rx="1.2" className="k" />
      <path d="M104 24 H152 M106 24 V80 M150 24 V80" className="lnk" />
      {rng(5).map((i) => <polygon key={i} points={`${110 + i * 8.5},28 ${116 + i * 8.5},28 ${118 + i * 8.5},52 ${108 + i * 8.5},52`} fill={['#748ffc', '#f783ac', '#ffd43b', '#63e6be', '#ff922b'][i]} />)}
    </>
  ),
  SV: () => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      <Disp x={22} y={12} w={28} h={48} k="uiP" b={1.4} />
      <rect x="33" y="60" width="6" height="19" className="k2" /><rect x="25" y="79" width="22" height="2.5" rx="1.2" className="k" />
      <rect x="62" y="8" width="44" height="72" rx="2" className="w" />
      <rect x="66" y="14" width="36" height="60" fill="#d0ebff" />
      {[30, 46, 62].map((y) => <line key={y} x1="66" x2="102" y1={y} y2={y} stroke="#a9bfe6" strokeWidth="1.4" />)}
      {rng(12).map((k) => { const i = k % 4, j = Math.floor(k / 4); return <rect key={k} x={69 + i * 8.5} y={19 + j * 16} width="5" height="10" rx="1.5" fill={['#ff922b', '#51cf66', '#339af0', '#f06595', '#fcc419'][k % 5]} />; })}
      <rect x="114" y="30" width="38" height="50" className="wd" />
      {[46, 62].map((y) => <rect key={y} x="114" y={y} width="38" height="2.5" className="wd2" />)}
      {rng(8).map((k) => <rect key={k} x={117 + (k % 4) * 9} y={36 + Math.floor(k / 4) * 16} width="6" height="9" rx="1" fill={['#4dabf7', '#ff8787', '#ffd43b', '#69db7c'][k % 4]} />)}
    </>
  ),
  HT: (v) => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      <Disp x={8} y={16} w={36} h={20.25} k={v % 2 ? 'land' : 'ui'} b={1.1} />
      <rect x="62" y="28" width="90" height="36" rx="3" className="wd2" />
      <rect x="64" y="56" width="86" height="24" rx="3" className="w" />
      <rect x="64" y="64" width="86" height="16" rx="2" className="acf" />
      <rect x="72" y="48" width="28" height="11" rx="4" className="w" /><rect x="112" y="48" width="28" height="11" rx="4" className="w" />
      <rect x="40" y="58" width="16" height="22" className="wd" />
      <circle cx="48" cy="44" r="15" fill="#ffd43b" opacity=".16" />
      <polygon points="42,38 54,38 57,48 39,48" fill="#ffe8cc" stroke="#e9c79a" strokeWidth=".8" /><rect x="47" y="48" width="2" height="10" className="g" />
    </>
  ),
  TP: (v) => (
    <>
      <rect x="0" y="82" width="160" height="18" className="fl" />
      <Disp x={8} y={6} w={144} h={54} k={v % 2 ? 'wave' : 'land'} b={1} />
      <Person x={44} foot={90} h={28} cls="k3" /><Person x={64} foot={92} h={24} cls="g" /><Person x={116} foot={91} h={27} cls="k2" />
    </>
  ),
  VN: (v) => (
    <>
      <polygon points="30,0 44,0 70,60 40,60" fill="#fff" opacity=".14" /><polygon points="118,0 132,0 120,60 90,60" fill="#fff" opacity=".14" />
      <Disp x={6} y={14} w={22} h={36} k="wave" b={1} /><Disp x={132} y={14} w={22} h={36} k="wave" b={1} />
      <Disp x={38} y={8} w={84} h={47.25} k={v % 2 ? 'ad' : 'land'} b={1.2} />
      {rng(10).map((i) => <rect key={'a' + i} x={4 + i * 15.6} y="64" width="13" height="8" rx="3" className="k3" />)}
      {rng(8).map((i) => <rect key={'b' + i} x={-2 + i * 20.5} y="75" width="17" height="10" rx="3.5" className="k2" />)}
      {rng(6).map((i) => <rect key={'c' + i} x={-6 + i * 29} y="88" width="24" height="12" rx="4" className="k" />)}
    </>
  ),
  AD: (v) => (
    <>
      <rect x="0" y="84" width="160" height="16" className="fl" />
      <rect x="2" y="32" width="36" height="54" fill="#9aa8bf" /><rect x="120" y="22" width="38" height="64" fill="#8796b0" />
      {rng(12).map((k) => <rect key={'l' + k} x={7 + (k % 3) * 10.5} y={38 + Math.floor(k / 3) * 11} width="6" height="6" fill="#dbe4ff" opacity=".8" />)}
      {rng(15).map((k) => <rect key={'r' + k} x={125 + (k % 3) * 10.5} y={28 + Math.floor(k / 3) * 11} width="6" height="6" fill="#dbe4ff" opacity=".7" />)}
      <rect x="40" y="12" width="78" height="74" fill="#b3bfd1" />
      {rng(8).map((k) => <rect key={'m' + k} x={47 + (k % 4) * 17} y={64 + Math.floor(k / 4) * 10} width="10" height="6" fill="#dbe4ff" opacity=".8" />)}
      <Disp x={46} y={18} w={66} h={38} k={['ad', 'wave', 'land'][v % 3]} b={1.6} />
    </>
  ),
  OF: () => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      <Disp x={46} y={8} w={68} h={38.25} k="dash" b={1.4} />
      {[40, 74, 108].map((x) => <rect key={x} x={x} y="55" width="12" height="13" rx="3" className="k3" />)}
      <polygon points="30,64 130,64 140,75 20,75" className="wd" />
      <rect x="32" y="75" width="3" height="9" className="k3" /><rect x="125" y="75" width="3" height="9" className="k3" />
      <rect x="143" y="66" width="11" height="14" className="wd2" /><circle cx="148" cy="58" r="8" className="pl" /><circle cx="153" cy="63" r="5" className="pl" />
    </>
  ),
  RS: () => (
    <>
      <rect x="0" y="82" width="160" height="18" className="fl" />
      <rect x="26" y="40" width="70" height="42" className="w" />
      <polygon points="20,42 61,14 102,42" fill="#5c6370" />
      <rect x="54" y="58" width="14" height="24" className="wd2" />
      <rect x="34" y="50" width="14" height="12" fill="#a5d8ff" stroke="#74c0fc" /><rect x="76" y="50" width="14" height="12" fill="#a5d8ff" stroke="#74c0fc" />
      <rect x="104" y="62" width="30" height="20" rx="1.5" className="w" />
      <circle cx="115" cy="72" r="7" className="w2" /><circle cx="115" cy="72" r="5" className="fan" />
      <rect x="141" y="58" width="3" height="24" className="wd2" /><circle cx="142.5" cy="50" r="11" className="pl" />
    </>
  ),
  ID: () => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      <rect x="8" y="8" width="96" height="22" className="wd" />
      <path d="M40 8 V30 M72 8 V30" className="wdl" />
      <rect x="8" y="48" width="96" height="4" className="ct" />
      <polygon points="22,46.6 52,46.6 53,48 21,48" className="k" />
      <rect x="8" y="52" width="96" height="28" className="wd" />
      <rect x="62" y="55" width="30" height="21" className="k2" /><rect x="65" y="58" width="24" height="12" fill="#5c6370" />
      <path d="M36 52 V80" className="wdl" />
      <rect x="108" y="8" width="44" height="72" fill="#cfe3dc" stroke="#b5cfc6" />
      <line x1="108" y1="44" x2="152" y2="44" stroke="#b5cfc6" /><rect x="112" y="30" width="1.8" height="10" rx=".9" className="g" /><rect x="112" y="48" width="1.8" height="10" rx=".9" className="g" />
    </>
  ),
  ED: () => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      <Disp x={40} y={6} w={80} h={45} k="white" b={2} />
      {[16, 64, 112].map((x, i) => (
        <g key={x}>
          <Person x={x + 16} foot={78} h={22} cls={['k3', 'g', 'k2'][i]} />
          <rect x={x} y="66" width="34" height="4" className="wd" />
          <rect x={x + 2} y="70" width="2.4" height="12" className="k3" /><rect x={x + 29.6} y="70" width="2.4" height="12" className="k3" />
        </g>
      ))}
    </>
  ),
  PB: () => (
    <>
      <rect x="0" y="84" width="160" height="16" className="fl" />
      <rect x="15" y="24" width="60" height="52" fill="#a5d8ff" opacity=".35" />
      <rect x="10" y="16" width="70" height="6" className="k3" /><rect x="12" y="22" width="3" height="62" className="k3" /><rect x="75" y="22" width="3" height="62" className="k3" />
      <Disp x={22} y={28} w={22} h={40} k="uiP" b={1.2} />
      <rect x="48" y="66" width="24" height="3" className="k3" /><rect x="50" y="69" width="2" height="15" className="k3" /><rect x="68" y="69" width="2" height="15" className="k3" />
      <rect x="88" y="34" width="72" height="46" rx="6" className="acf" />
      <rect x="94" y="40" width="62" height="16" rx="1.5" fill="#d0ebff" />
      {[110, 126, 142].map((x) => <line key={x} x1={x} x2={x} y1="40" y2="56" className="acl" />)}
      <rect x="94" y="60" width="12" height="18" rx="1" fill="#d0ebff" opacity=".9" />
      <circle cx="104" cy="81" r="5.5" className="k" /><circle cx="146" cy="81" r="5.5" className="k" />
    </>
  ),
  MD: () => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      <rect x="10" y="12" width="34" height="30" fill="#d0ebff" stroke="#b6c7e6" /><path d="M27 12 V42 M10 27 H44" stroke="#b6c7e6" />
      <rect x="46" y="38" width="4" height="40" className="g2" />
      <rect x="50" y="58" width="80" height="10" className="w" />
      <rect x="50" y="51" width="80" height="8" rx="2" className="w2" />
      <rect x="76" y="50" width="54" height="10" rx="2" className="acf" />
      <rect x="54" y="46" width="17" height="7" rx="3" className="w" />
      {[56, 124].map((x) => <circle key={x} cx={x} cy="76" r="3" className="k3" />)}
      <path d="M54 68 V73 M126 68 V73" className="ln" />
      <line x1="146" y1="40" x2="146" y2="86" className="ln" /><rect x="138" y="85" width="16" height="2.5" rx="1.2" className="g" />
      <rect x="130" y="20" width="30" height="21" rx="2" className="k" />
      <polyline points="133,32 139,32 141,26 144,37 147,30 149,32 157,32" fill="none" stroke="#40c057" strokeWidth="1.4" strokeLinejoin="round" />
    </>
  ),
  MF: () => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      {[8, 70].map((x) => (
        <g key={x}>
          <rect x={x} y="8" width="3" height="72" fill="#1c7ed6" /><rect x={x + 55} y="8" width="3" height="72" fill="#1c7ed6" />
          {[28, 52, 76].map((y) => <rect key={y} x={x} y={y} width="58" height="3" fill="#f08c00" />)}
          {[[4, 14, 16], [24, 16, 14], [42, 12, 12], [6, 38, 14], [26, 40, 12], [44, 36, 16], [8, 62, 14], [28, 64, 12]].map(([dx, y, w], i) => <rect key={i} x={x + dx} y={y} width={w} height={(y < 30 ? 28 : y < 54 ? 52 : 76) - y} className={i % 2 ? 'wd' : 'wd2'} />)}
        </g>
      ))}
      <g transform="rotate(-8 128 66)">
        <rect x="104" y="48" width="48" height="34" rx="5" className="rg" />
        <Scr x={108} y={52} w={40} h={26} k="dash" />
      </g>
    </>
  ),
  FN: () => (
    <>
      <rect x="0" y="80" width="160" height="20" className="fl" />
      <Disp x={36} y={6} w={46} h={17} k="dash" b={1} />
      {rng(3).map((i) => <rect key={i} x={12 + i * 32} y="30" width="30" height="24" fill="#d0ebff" opacity=".55" stroke="#b6c7e6" />)}
      <rect x="10" y="54" width="96" height="26" className="w" />
      <rect x="8" y="51" width="100" height="4" className="ct" />
      <rect x="118" y="24" width="32" height="58" rx="3" className="al" />
      <rect x="123" y="30" width="22" height="16" rx="1" className="k" /><Scr x={124} y={31} w={20} h={14} k="ui" />
      {rng(9).map((k) => <rect key={k} x={125 + (k % 3) * 6.5} y={51 + Math.floor(k / 3) * 5} width="5" height="3.6" rx=".8" className="g2" />)}
      <rect x="125" y="68" width="18" height="2.5" className="k3" />
    </>
  ),
  OE: () => (
    <>
      <rect x="20" y="80" width="120" height="9" className="ct" />
      <ellipse cx="80" cy="80" rx="60" ry="8" className="ct" />
      <rect x="40" y="56" width="4" height="22" fill="#3a3f49" /><circle cx="42" cy="58" r="8" className="k3" /><circle cx="42" cy="58" r="6" fill="#14171d" />
      <rect x="54" y="22" width="26" height="54" rx="5" className="acf" />
      {[30, 39].map((y) => <circle key={y} cx="62" cy={y} r="3" fill="#1c2029" />)}
      <rect x="84" y="34" width="52" height="40" rx="4" className="k" />
      <Scr x={86.5} y={36.5} w={47} h={35} k="ui" />
    </>
  ),
  _: () => (
    <>
      <rect x="0" y="84" width="160" height="16" className="fl" />
      <rect x="28" y="16" width="104" height="68" fill="#b3bfd1" />
      {rng(15).map((k) => <rect key={k} x={36 + (k % 5) * 19} y={22 + Math.floor(k / 5) * 9} width="12" height="5" fill="#dbe4ff" opacity=".85" />)}
      <rect x="58" y="50" width="44" height="8" className="acf" />
      <rect x="66" y="60" width="28" height="24" fill="#a5d8ff" opacity=".7" />
    </>
  ),
};
const BADGE = {
  사이니지: <><rect x="137.5" y="11" width="13" height="8.5" rx="1" /><path d="M144 19.5 V22.5 M140.5 22.5 H147.5" /></>,
  시스템에어컨: <path d="M144 9.5 V22.5 M138.4 12.75 L149.6 19.25 M138.4 19.25 L149.6 12.75 M142 10.8 L144 12.6 L146 10.8 M142 21.2 L144 19.4 L146 21.2" />,
  모바일: <><rect x="140.5" y="9.5" width="7" height="13" rx="1.8" /><path d="M143 20 H145" /></>,
  'TV/음향시스템': <><rect x="137" y="10.5" width="14" height="9" rx="1" /><path d="M141 22.5 H147" /></>,
  리빙가전: <><rect x="139" y="9.5" width="10" height="13" rx="1.6" /><circle cx="144" cy="17" r="2.8" /></>,
  주방가전: <><rect x="139.5" y="9" width="9" height="14" rx="1.5" /><path d="M139.5 14 H148.5 M146.4 10.8 V12.4" /></>,
  '프린팅/IT': <><rect x="139" y="11" width="10" height="7" rx="1" /><path d="M137 20.5 H151" /></>,
};
function caseArt(c) {
  if (!c) return SCENE._();
  const v = hash(c.id);
  const spaces = (c.space || []).join(' ');
  const key = /드라이브/.test(spaces) ? 'DT' : c.ind === 'FB' && v % 3 === 1 ? 'FBseat' : c.ind;
  const scene = (SCENE[key] || SCENE._)(v);
  const b = (c.prod || []).map((x) => BADGE[x]).find(Boolean);
  return (
    <>
      {v % 2 ? <g transform="translate(160 0) scale(-1 1)">{scene}</g> : scene}
      {b && <g transform="translate(2 68)"><circle cx="144" cy="16" r="11" className="badge" /><g className="badge-g">{b}</g></g>}
    </>
  );
}
