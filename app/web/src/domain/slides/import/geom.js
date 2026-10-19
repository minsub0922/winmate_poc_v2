// DrawingML geometry → SVG path data (px). Preset shapes use the ECMA-376 definitions (presets.js) with their
// guide formulas and adjust values; custom geometry (a:custGeom) goes through the same evaluator.
import { PRESETS } from './presets.js';

const DEG = 60000; // DrawingML angles are 1/60000 degree
const rad = (a) => (a / DEG) * Math.PI / 180;

function builtins(w, h) {
  const ss = Math.min(w, h), ls = Math.max(w, h);
  return {
    w, h, l: 0, t: 0, r: w, b: h, hc: w / 2, vc: h / 2, ss, ls,
    wd2: w / 2, wd3: w / 3, wd4: w / 4, wd5: w / 5, wd6: w / 6, wd8: w / 8, wd10: w / 10, wd12: w / 12, wd32: w / 32,
    hd2: h / 2, hd3: h / 3, hd4: h / 4, hd5: h / 5, hd6: h / 6, hd8: h / 8, hd10: h / 10, hd12: h / 12, hd32: h / 32,
    ssd2: ss / 2, ssd4: ss / 4, ssd6: ss / 6, ssd8: ss / 8, ssd16: ss / 16, ssd32: ss / 32,
    cd2: 10800000, cd4: 5400000, cd8: 2700000, '3cd4': 16200000, '3cd8': 8100000, '5cd8': 13500000, '7cd8': 18900000,
  };
}

function evalFmla(f, V) {
  const p = String(f || '').trim().split(/\s+/);
  const op = p[0];
  const v = (s) => { if (s == null) return 0; if (s in V) return V[s]; const n = Number(s); return isFinite(n) ? n : 0; };
  const x = v(p[1]), y = v(p[2]), z = v(p[3]);
  switch (op) {
    case '*/': return z ? (x * y) / z : 0;
    case '+-': return x + y - z;
    case '+/': return z ? (x + y) / z : 0;
    case '?:': return x > 0 ? y : z;
    case 'abs': return Math.abs(x);
    case 'at2': return (Math.atan2(y, x) * 180 / Math.PI) * DEG;
    case 'cat2': return x * Math.cos(Math.atan2(z, y));
    case 'cos': return x * Math.cos(rad(y));
    case 'max': return Math.max(x, y);
    case 'min': return Math.min(x, y);
    case 'mod': return Math.sqrt(x * x + y * y + z * z);
    case 'pin': return y < x ? x : y > z ? z : y;
    case 'sat2': return x * Math.sin(Math.atan2(z, y));
    case 'sin': return x * Math.sin(rad(y));
    case 'sqrt': return Math.sqrt(Math.max(0, x));
    case 'tan': return x * Math.tan(rad(y));
    case 'val': return x;
    default: return 0;
  }
}

/** visual (DrawingML) angle on an ellipse → its parametric angle */
const param = (a, rx, ry) => Math.atan2(rx * Math.sin(a), ry * Math.cos(a));

/**
 * def: { av: [[name, fmla]], gd: [[name, fmla]], p: [{ w, h, f, s, c: [[op, ...]] }], r: [l, t, r, b] }
 * adj: { name: number } — the shape's own adjust values (a:avLst)
 * → { paths: [{ d, fill, stroke }], tx: { l, t, r, b } | null, ends: { a: [p0, p1], b: [p1, p0] } }
 */
export function buildGeom(def, w, h, adj = {}) {
  const V = builtins(w, h);
  for (const [n, f] of def.av || []) V[n] = n in adj ? adj[n] : evalFmla(f, V);
  for (const n of Object.keys(adj)) if (!(n in V)) V[n] = adj[n];
  for (const [n, f] of def.gd || []) V[n] = evalFmla(f, V);
  const g = (s) => { if (s in V) return V[s]; const n = Number(s); return isFinite(n) ? n : 0; };
  const paths = [];
  for (const p of def.p || []) {
    const sx = p.w ? w / p.w : 1, sy = p.h ? h / p.h : 1;
    let d = '', cx = 0, cy = 0, sx0 = 0, sy0 = 0;
    const pt = (x, y) => [g(x) * sx, g(y) * sy];
    const f = (n) => (Math.round(n * 100) / 100).toString();
    const pts = [];
    for (const c of p.c) {
      if (c[0] === 'M') { [cx, cy] = pt(c[1], c[2]); sx0 = cx; sy0 = cy; d += 'M' + f(cx) + ' ' + f(cy); pts.push([cx, cy]); }
      else if (c[0] === 'L') { [cx, cy] = pt(c[1], c[2]); d += 'L' + f(cx) + ' ' + f(cy); pts.push([cx, cy]); }
      else if (c[0] === 'Q') { const [x1, y1] = pt(c[1], c[2]); [cx, cy] = pt(c[3], c[4]); d += 'Q' + f(x1) + ' ' + f(y1) + ' ' + f(cx) + ' ' + f(cy); pts.push([x1, y1], [cx, cy]); }
      else if (c[0] === 'C') { const [x1, y1] = pt(c[1], c[2]); const [x2, y2] = pt(c[3], c[4]); [cx, cy] = pt(c[5], c[6]); d += 'C' + f(x1) + ' ' + f(y1) + ' ' + f(x2) + ' ' + f(y2) + ' ' + f(cx) + ' ' + f(cy); pts.push([x1, y1], [x2, y2], [cx, cy]); }
      else if (c[0] === 'A') {
        const rx = g(c[1]) * sx, ry = g(c[2]) * sy, st = rad(g(c[3])), sw = rad(g(c[4]));
        if (!rx || !ry) continue;
        const t1 = param(st, rx, ry);
        const ox = cx - rx * Math.cos(t1), oy = cy - ry * Math.sin(t1);
        let t2 = param(st + sw, rx, ry);
        const full = Math.floor(Math.abs(sw) / (2 * Math.PI));
        if (sw > 0) { while (t2 < t1 - 1e-9) t2 += 2 * Math.PI; t2 += full * 2 * Math.PI; if (Math.abs(sw) % (2 * Math.PI) < 1e-9 && full) t2 = t1 + full * 2 * Math.PI; }
        else if (sw < 0) { while (t2 > t1 + 1e-9) t2 -= 2 * Math.PI; t2 -= full * 2 * Math.PI; if (Math.abs(sw) % (2 * Math.PI) < 1e-9 && full) t2 = t1 - full * 2 * Math.PI; }
        const n = Math.max(1, Math.ceil(Math.abs(t2 - t1) / (Math.PI / 2)));
        const dt = (t2 - t1) / n;
        for (let i = 0; i < n; i++) {
          const a = t1 + dt * i, b = a + dt, k = (4 / 3) * Math.tan(dt / 4);
          const x0 = ox + rx * Math.cos(a), y0 = oy + ry * Math.sin(a), x3 = ox + rx * Math.cos(b), y3 = oy + ry * Math.sin(b);
          const x1 = x0 - k * rx * Math.sin(a), y1 = y0 + k * ry * Math.cos(a), x2 = x3 + k * rx * Math.sin(b), y2 = y3 - k * ry * Math.cos(b);
          d += 'C' + f(x1) + ' ' + f(y1) + ' ' + f(x2) + ' ' + f(y2) + ' ' + f(x3) + ' ' + f(y3);
          pts.push([x1, y1], [x2, y2], [x3, y3]);
          cx = x3; cy = y3;
        }
      } else if (c[0] === 'Z') { d += 'Z'; cx = sx0; cy = sy0; }
    }
    if (d) paths.push({ d, fill: p.f || 'norm', stroke: p.s !== 0, pts });
  }
  // line ends (arrowheads): first point + its direction, last point + its direction — from the first stroked path
  const sp = paths.find((p) => p.stroke && p.pts.length >= 2);
  let ends = null;
  if (sp) {
    const P = sp.pts; const a0 = P[0]; let a1 = P[1]; for (let i = 1; i < P.length; i++) if (Math.hypot(P[i][0] - a0[0], P[i][1] - a0[1]) > 0.5) { a1 = P[i]; break; }
    const b0 = P[P.length - 1]; let b1 = P[P.length - 2]; for (let i = P.length - 2; i >= 0; i--) if (Math.hypot(P[i][0] - b0[0], P[i][1] - b0[1]) > 0.5) { b1 = P[i]; break; }
    ends = { head: [a0, a1], tail: [b0, b1] };
  }
  let tx = null;
  if (def.r) tx = { l: g(def.r[0]), t: g(def.r[1]), r: g(def.r[2]), b: g(def.r[3]) };
  return { paths, tx, ends };
}

export function presetGeom(prst, w, h, adj) {
  const def = PRESETS[prst] || PRESETS.rect;
  return buildGeom(def, w, h, adj);
}
export const hasPreset = (prst) => !!PRESETS[prst];
