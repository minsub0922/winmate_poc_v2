// PPTX → Winmate layout HTML (1280×720), as close to the original as the browser can draw it.
// Reads the package itself (JSZip + DOMParser): theme colours · fonts, colour maps, backgrounds, master → layout → slide
// inheritance (placeholders' position · geometry · fill · text styles), preset / custom geometry (presets.js · geom.js),
// fills (solid · gradient · picture · pattern), lines (dash · arrowheads), shadows, pictures (crop · shape · effects),
// groups, tables (table styles), charts (redrawn as SVG), SmartArt (its drawing part), OLE fallbacks.
// Text: every paragraph is one editable block (data-tb) with its own runs; pictures on the slide are image slots (data-img).
// Pictures come back as tokens "wmimg:<id>" with their bytes in `images` (cropped / resampled to what the slide shows).
import JSZip from 'jszip';
import { presetGeom, buildGeom, hasPreset } from './geom.js';
import { renderChart } from './chart.js';

const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const W = 1280, H = 720;

/* ---------------- xml helpers ---------------- */
export const ch = (el, n) => { if (!el) return null; for (const c of el.children) if (c.localName === n) return c; return null; };
export const chs = (el, n) => (el ? Array.from(el.children).filter((c) => c.localName === n) : []);
export const q = (el, ...ns) => ns.reduce((e, n) => ch(e, n), el);
export const at = (el, n, d = null) => (el && el.hasAttribute(n) ? el.getAttribute(n) : d);
export const num = (el, n, d = null) => { const v = at(el, n); if (v == null || v === '') return d; const x = Number(v); return isFinite(x) ? x : d; };
const rid = (el, n = 'embed') => (el ? el.getAttributeNS(NS_R, n) || el.getAttribute('r:' + n) || '' : '');
const bool = (el, n, d = false) => { const v = at(el, n); return v == null ? d : v === '1' || v === 'true' || v === 'on'; };
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (n) => Math.round(n * 100) / 100;
const px = (n) => r2(n) + 'px';

function normPath(base, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const s of target.split('/')) { if (s === '..') parts.pop(); else if (s && s !== '.') parts.push(s); }
  return parts.join('/');
}

class Pkg {
  constructor(zip) { this.zip = zip; this.cache = new Map(); }
  has(path) { return !!this.zip.file(path); }
  async part(path) {
    if (!path) return null;
    if (this.cache.has(path)) return this.cache.get(path);
    const p = (async () => {
      const f = this.zip.file(path); if (!f) return null;
      const txt = await f.async('string');
      const doc = new DOMParser().parseFromString(txt, 'application/xml');
      if (doc.getElementsByTagName('parsererror').length) return null;
      const rels = {};
      const rp = path.replace(/([^/]+)$/, '_rels/$1.rels');
      const rf = this.zip.file(rp);
      if (rf) {
        const rd = new DOMParser().parseFromString(await rf.async('string'), 'application/xml');
        for (const r of rd.getElementsByTagName('Relationship')) {
          const mode = r.getAttribute('TargetMode');
          rels[r.getAttribute('Id')] = { type: r.getAttribute('Type') || '', target: mode === 'External' ? r.getAttribute('Target') : normPath(path, r.getAttribute('Target') || ''), ext: mode === 'External' };
        }
      }
      return { path, doc, root: doc.documentElement, rels };
    })();
    this.cache.set(path, p);
    return p;
  }
  relOf(part, type) { for (const [id, r] of Object.entries(part.rels)) if (r.type.endsWith('/' + type)) return r.target; return null; }
}

/* ---------------- colour ---------------- */
const PRST = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', cyan: '00FFFF', magenta: 'FF00FF', gray: '808080', grey: '808080', darkGray: 'A9A9A9', lightGray: 'D3D3D3', orange: 'FFA500', purple: '800080', navy: '000080', maroon: '800000', olive: '808000', teal: '008080', silver: 'C0C0C0', lime: '00FF00', darkBlue: '00008B', darkRed: '8B0000', darkGreen: '006400', ltGray: 'D3D3D3', dkGray: 'A9A9A9', brown: 'A52A2A', pink: 'FFC0CB', gold: 'FFD700', indigo: '4B0082', violet: 'EE82EE', skyBlue: '87CEEB', lightBlue: 'ADD8E6', tan: 'D2B48C', coral: 'FF7F50' };
const SYS = { windowText: '000000', window: 'FFFFFF', btnFace: 'F0F0F0', btnText: '000000', highlight: '0078D7', highlightText: 'FFFFFF', menu: 'F0F0F0', menuText: '000000', grayText: '6D6D6D', captionText: '000000', '3dDkShadow': '696969', '3dLight': 'E3E3E3' };
const COLOR_TAGS = new Set(['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'hslClr', 'scrgbClr']);
const hexRgb = (h) => { const n = parseInt(String(h || '000000').slice(0, 6), 16) || 0; return { r: (n >> 16) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 }; };
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
function rgb2hsl({ r, g, b }) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
  return { h, s, l };
}
function hsl2rgb({ h, s, l }) {
  if (s === 0) return { r: l, g: l, b: l };
  const f = (p, q2, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q2 - p) * 6 * t; if (t < 1 / 2) return q2; if (t < 2 / 3) return p + (q2 - p) * (2 / 3 - t) * 6; return p; };
  const q2 = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q2;
  return { r: f(p, q2, h + 1 / 3), g: f(p, q2, h), b: f(p, q2, h - 1 / 3) };
}
function mods(c, el) {
  let o = { ...c };
  for (const m of el.children) {
    const v = num(m, 'val', 0) / 100000;
    switch (m.localName) {
      case 'alpha': o.a = v; break;
      case 'alphaMod': o.a *= v; break;
      case 'alphaOff': o.a = clamp(o.a + v); break;
      case 'lumMod': { const h = rgb2hsl(o); h.l = clamp(h.l * v); o = { ...hsl2rgb(h), a: o.a }; break; }
      case 'lumOff': { const h = rgb2hsl(o); h.l = clamp(h.l + v); o = { ...hsl2rgb(h), a: o.a }; break; }
      case 'satMod': { const h = rgb2hsl(o); h.s = clamp(h.s * v); o = { ...hsl2rgb(h), a: o.a }; break; }
      case 'satOff': { const h = rgb2hsl(o); h.s = clamp(h.s + v); o = { ...hsl2rgb(h), a: o.a }; break; }
      case 'hueMod': { const h = rgb2hsl(o); h.h = (h.h * v) % 1; o = { ...hsl2rgb(h), a: o.a }; break; }
      case 'hueOff': { const h = rgb2hsl(o); h.h = (h.h + num(m, 'val', 0) / 21600000 + 1) % 1; o = { ...hsl2rgb(h), a: o.a }; break; }
      case 'tint': for (const k of ['r', 'g', 'b']) o[k] = toSrgb(toLin(o[k]) * v + (1 - v)); break;
      case 'shade': for (const k of ['r', 'g', 'b']) o[k] = toSrgb(toLin(o[k]) * v); break;
      case 'comp': { const h = rgb2hsl(o); h.h = (h.h + 0.5) % 1; o = { ...hsl2rgb(h), a: o.a }; break; }
      case 'inv': o = { r: 1 - o.r, g: 1 - o.g, b: 1 - o.b, a: o.a }; break;
      case 'gray': { const y = 0.299 * o.r + 0.587 * o.g + 0.114 * o.b; o = { r: y, g: y, b: y, a: o.a }; break; }
      case 'red': o.r = v; break; case 'green': o.g = v; break; case 'blue': o.b = v; break;
      case 'redMod': o.r = clamp(o.r * v); break; case 'greenMod': o.g = clamp(o.g * v); break; case 'blueMod': o.b = clamp(o.b * v); break;
      default: break;
    }
  }
  return o;
}
/** a colour element (srgbClr …) or an element holding one → { r, g, b, a } (0–1) */
export function color(el, cx, ph = null) {
  if (!el) return null;
  let c = COLOR_TAGS.has(el.localName) ? el : Array.from(el.children).find((x) => COLOR_TAGS.has(x.localName));
  if (!c) return null;
  let base;
  switch (c.localName) {
    case 'srgbClr': base = hexRgb(at(c, 'val')); break;
    case 'sysClr': base = hexRgb(at(c, 'lastClr') || SYS[at(c, 'val')] || '000000'); break;
    case 'prstClr': base = hexRgb(PRST[at(c, 'val')] || '000000'); break;
    case 'scrgbClr': base = { r: toSrgb(num(c, 'r', 0) / 100000), g: toSrgb(num(c, 'g', 0) / 100000), b: toSrgb(num(c, 'b', 0) / 100000), a: 1 }; break;
    case 'hslClr': base = { ...hsl2rgb({ h: num(c, 'hue', 0) / 21600000, s: num(c, 'sat', 0) / 100000, l: num(c, 'lum', 0) / 100000 }), a: 1 }; break;
    case 'schemeClr': {
      const v = at(c, 'val');
      if (v === 'phClr') { base = ph ? { ...ph } : hexRgb('000000'); break; }
      base = hexRgb(cx.scheme(v));
      break;
    }
    default: base = hexRgb('000000');
  }
  return mods(base, c);
}
export const css = (c) => {
  if (!c) return 'transparent';
  const R = Math.round(clamp(c.r) * 255), G = Math.round(clamp(c.g) * 255), B = Math.round(clamp(c.b) * 255);
  if (c.a == null || c.a >= 0.999) return '#' + [R, G, B].map((v) => v.toString(16).padStart(2, '0')).join('');
  return 'rgba(' + R + ',' + G + ',' + B + ',' + r2(c.a) + ')';
};

/* ---------------- fills · lines · effects ---------------- */
const FILL_TAGS = ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill'];
/** first fill element directly under el → fill | undefined (none specified) */
function fillOf(el, env, ph = null, part = null) {
  if (!el) return undefined;
  const f = Array.from(el.children).find((c) => FILL_TAGS.includes(c.localName));
  if (!f) return undefined;
  return readFill(f, env, ph, part);
}
function readFill(f, env, ph, part) {
  const cx = env.cx;
  switch (f.localName) {
    case 'noFill': return { t: 'none' };
    case 'solidFill': { const c = color(f, cx, ph); return c ? { t: 'solid', c } : { t: 'none' }; }
    case 'gradFill': {
      const stops = chs(ch(f, 'gsLst'), 'gs').map((g) => ({ pos: num(g, 'pos', 0) / 100000, c: color(g, cx, ph) })).filter((s) => s.c).sort((a, b) => a.pos - b.pos);
      if (!stops.length) return { t: 'none' };
      const lin = ch(f, 'lin'), path = ch(f, 'path');
      const ftr = path ? ch(path, 'fillToRect') : null;
      return { t: 'grad', stops, ang: lin ? num(lin, 'ang', 0) / 60000 : 90, path: path ? at(path, 'path', 'circle') : null, ftr: ftr ? { l: num(ftr, 'l', 0) / 1e5, t: num(ftr, 't', 0) / 1e5, r: num(ftr, 'r', 0) / 1e5, b: num(ftr, 'b', 0) / 1e5 } : null, rot: bool(f, 'rotWithShape', true) };
    }
    case 'blipFill': {
      const blip = ch(f, 'blip');
      const r = rid(blip); const pp = part || env.part;
      const rel = r && pp && pp.rels[r];
      if (!rel || rel.ext) return { t: 'none' };
      return { t: 'img', path: rel.target, blip, tile: ch(f, 'tile'), src: ch(f, 'srcRect'), fx: blipFx(blip, env, ph) };
    }
    case 'pattFill': {
      const fg = color(ch(f, 'fgClr'), cx, ph) || hexRgb('000000'), bg = color(ch(f, 'bgClr'), cx, ph) || hexRgb('FFFFFF');
      return { t: 'patt', fg, bg, prst: at(f, 'prst', 'pct50') };
    }
    case 'grpFill': return env.grpFill || { t: 'none' };
    default: return undefined;
  }
}
/** picture effects baked into the pixels: duotone (two colours by brightness) · grayscale */
function blipFx(blip, env, ph) {
  const o = {};
  for (const e of blip ? blip.children : []) {
    if (e.localName === 'duotone') { const cs = Array.from(e.children).filter((c) => COLOR_TAGS.has(c.localName)).map((c) => color(c, env.cx, ph)); if (cs.length === 2) o.duo = cs; }
    else if (e.localName === 'grayscl') o.gray = true;
    else if (e.localName === 'alphaModFix') o.alpha = num(e, 'amt', 100000) / 100000;
  }
  return o;
}
const DASH = { solid: null, dot: [1, 1], dash: [4, 3], lgDash: [8, 3], dashDot: [4, 3, 1, 3], lgDashDot: [8, 3, 1, 3], lgDashDotDot: [8, 3, 1, 3, 1, 3], sysDash: [3, 1], sysDot: [1, 1], sysDashDot: [3, 1, 1, 1], sysDashDotDot: [3, 1, 1, 1, 1, 1] };
/** a:ln → { w (EMU), c, dash, cap, head, tail } | { none: true } ; base = the theme line (lnRef) it builds on */
function lineOf(ln, env, ph, base = null) {
  if (!ln && !base) return undefined;
  const o = base ? { ...base } : { w: 9525, c: null, none: false };
  if (!ln) return o;
  if (ln.hasAttribute('w')) o.w = num(ln, 'w', 9525);
  if (ln.hasAttribute('cap')) o.cap = at(ln, 'cap');
  const f = Array.from(ln.children).find((c) => FILL_TAGS.includes(c.localName));
  if (f) {
    if (f.localName === 'noFill') o.none = true;
    else if (f.localName === 'solidFill') { o.c = color(f, env.cx, ph); o.none = !o.c; }
    else if (f.localName === 'gradFill') { const g = readFill(f, env, ph); o.g = g && g.stops ? g : null; o.c = o.g ? [...o.g.stops].sort((a, b) => b.c.a - a.c.a)[0].c : null; o.none = !o.c; }
    else if (f.localName === 'pattFill') { o.c = color(ch(f, 'fgClr'), env.cx, ph); o.none = !o.c; }
  }
  const pd = ch(ln, 'prstDash'); if (pd) o.dash = at(pd, 'val', 'solid');
  const cd = ch(ln, 'custDash'); if (cd) o.cdash = chs(cd, 'ds').map((d) => [num(d, 'd', 100000) / 100000, num(d, 'sp', 100000) / 100000]);
  const he = ch(ln, 'headEnd'), te = ch(ln, 'tailEnd');
  if (he) o.head = at(he, 'type', 'none') === 'none' ? null : { t: at(he, 'type'), w: at(he, 'w', 'med'), l: at(he, 'len', 'med') };
  if (te) o.tail = at(te, 'type', 'none') === 'none' ? null : { t: at(te, 'type'), w: at(te, 'w', 'med'), l: at(te, 'len', 'med') };
  if (ch(ln, 'round')) o.join = 'round'; else if (ch(ln, 'bevel')) o.join = 'bevel'; else if (ch(ln, 'miter')) o.join = 'miter';
  return o;
}
function shadowOf(effectLst, env, k) {
  const s = ch(effectLst, 'outerShdw');
  if (!s) return null;
  const c = color(s, env.cx) || { r: 0, g: 0, b: 0, a: 0.4 };
  const dist = num(s, 'dist', 0) * k, dir = (num(s, 'dir', 0) / 60000) * Math.PI / 180, blur = num(s, 'blurRad', 0) * k;
  return 'drop-shadow(' + px(Math.cos(dir) * dist) + ' ' + px(Math.sin(dir) * dist) + ' ' + px(blur / 2) + ' ' + css(c) + ')';
}

/* ---------------- fonts · line height ---------------- */
const WEIGHT_WORDS = [[/\b(black|heavy)\b/i, 900], [/\b(extra ?bold|ultra ?bold)\b/i, 800], [/\b(semi ?bold|demi ?bold)\b/i, 600], [/\bbold\b/i, 700], [/\bmedium\b/i, 500], [/\b(extra ?light|ultra ?light)\b/i, 200], [/\blight\b/i, 300], [/\bthin\b/i, 100], [/\b(regular|normal)\b/i, 400]];
function fontWeightOf(name) { for (const [re, w] of WEIGHT_WORDS) if (re.test(name || '')) return w; return 0; }
const baseFamily = (name) => String(name || '').replace(/\s+(black|heavy|extra ?bold|ultra ?bold|semi ?bold|demi ?bold|bold|medium|extra ?light|ultra ?light|light|thin|regular|normal)$/i, '').trim();
const FONT_ALIAS = { '맑은 고딕': 'Malgun Gothic', '나눔고딕': 'NanumGothic', '나눔스퀘어': 'NanumSquare', '굴림': 'Gulim', '돋움': 'Dotum', '바탕': 'Batang', '본고딕': 'Noto Sans KR', 'Noto Sans CJK KR': 'Noto Sans KR', '나눔바른고딕': 'NanumBarunGothic', '나눔명조': 'NanumMyeongjo' };
function fontStack(names) {
  const out = [];
  const add = (n) => { if (n && !out.includes(n)) out.push(n); };
  for (const n0 of names) {
    if (!n0) continue;
    add(n0); const b = baseFamily(n0); if (b !== n0) add(b);
    if (FONT_ALIAS[n0]) add(FONT_ALIAS[n0]); if (FONT_ALIAS[b]) add(FONT_ALIAS[b]);
  }
  add('Noto Sans KR');
  return out.map((n) => (/^[\w-]+$/.test(n) && !/^(serif|sans-serif|monospace)$/.test(n) ? n : "'" + n.replace(/'/g, '') + "'")).join(', ') + ', sans-serif';
}
/** single line spacing of a font in PowerPoint (ascent + descent + gap), as a multiple of its size */
function lineFactor(name) {
  const n = String(name || '').toLowerCase();
  if (/noto sans (kr|cjk)|본고딕|source han sans|noto sans$/.test(n)) return 1.448;
  if (/malgun|맑은/.test(n)) return 1.33;
  if (/pretendard/.test(n)) return 1.193;
  if (/spoqa/.test(n)) return 1.25;
  if (/nanum ?square|나눔스퀘어/.test(n)) return 1.15;
  if (/nanum|나눔/.test(n)) return 1.16;
  if (/apple sd|applesd/.test(n)) return 1.19;
  if (/gulim|굴림|dotum|돋움|batang|바탕|gungsuh|궁서/.test(n)) return 1.2;
  if (/calibri|cambria/.test(n)) return 1.22;
  if (/segoe/.test(n)) return 1.33;
  if (/arial|helvetica|liberation sans/.test(n)) return 1.15;
  if (/times|georgia/.test(n)) return 1.15;
  if (/verdana|tahoma/.test(n)) return 1.215;
  if (/manrope/.test(n)) return 1.366;
  if (/roboto/.test(n)) return 1.172;
  if (/montserrat/.test(n)) return 1.219;
  if (/inter\b/.test(n)) return 1.21;
  return 1.2;
}
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯　-〿぀-ヿ一-鿿]/;
const SYMBOL_FONTS = /wingdings|symbol|webdings/i;
const WING = { 'l': '●', 'n': '■', 'q': '❑', 'u': '◆', 'v': '❖', 'Ø': '➢', 'ü': '✔', '§': '▪', 'à': '➔', 'è': '➔', 'Ü': '✔', 'o': '○', 'p': '□', 'w': '◆', 'ò': '►', 'ð': '▸', '¨': '◻', 'ª': '●', '·': '•', 'Ÿ': '•', 'û': '✘', 'ý': '☒', 'þ': '☑', 'ä': '➤', 'Þ': '➔' };
/** a bullet drawn with a symbol font (Wingdings · Symbol, often stored as U+F0xx) → the Unicode character it shows */
const symChar = (c) => { const n = c.charCodeAt(0); const b = n >= 0xf000 && n <= 0xf0ff ? String.fromCharCode(n - 0xf000) : c; return WING[b] || '•'; };

/* ---------------- text ---------------- */
const P_ATTRS = ['marL', 'marR', 'indent', 'algn', 'defTabSz', 'rtl', 'fontAlgn', 'lvl'];
function readPPr(el, env, ph) {
  if (!el) return {};
  const o = {};
  for (const a of P_ATTRS) if (el.hasAttribute(a)) o[a] = /^(algn|fontAlgn)$/.test(a) ? at(el, a) : a === 'rtl' ? bool(el, a) : num(el, a, 0);
  const sp = (n) => { const e = ch(el, n); if (!e) return undefined; const pc = ch(e, 'spcPct'), pt = ch(e, 'spcPts'); return pc ? { pct: num(pc, 'val', 100000) / 100000 } : pt ? { pts: num(pt, 'val', 0) / 100 } : undefined; };
  const ls = sp('lnSpc'); if (ls) o.lnSpc = ls;
  const sb = sp('spcBef'); if (sb) o.spcBef = sb;
  const sa = sp('spcAft'); if (sa) o.spcAft = sa;
  if (ch(el, 'buNone')) o.bu = { t: 'none' };
  else if (ch(el, 'buChar')) o.bu = { t: 'char', ch: at(ch(el, 'buChar'), 'char', '•') };
  else if (ch(el, 'buAutoNum')) { const b = ch(el, 'buAutoNum'); o.bu = { t: 'num', fmt: at(b, 'type', 'arabicPeriod'), start: num(b, 'startAt', 1) }; }
  else if (ch(el, 'buBlip')) o.bu = { t: 'char', ch: '•' };
  if (ch(el, 'buClrTx')) o.buClr = 'tx'; else if (ch(el, 'buClr')) o.buClr = color(ch(el, 'buClr'), env.cx, ph);
  if (ch(el, 'buSzTx')) o.buSz = 'tx'; else if (ch(el, 'buSzPct')) o.buSz = { pct: num(ch(el, 'buSzPct'), 'val', 100000) / 100000 }; else if (ch(el, 'buSzPts')) o.buSz = { pts: num(ch(el, 'buSzPts'), 'val', 1800) / 100 };
  if (ch(el, 'buFontTx')) o.buFont = 'tx'; else if (ch(el, 'buFont')) o.buFont = at(ch(el, 'buFont'), 'typeface');
  const d = ch(el, 'defRPr'); if (d) o.r = readRPr(d, env, ph);
  return o;
}
function readRPr(el, env, ph) {
  if (!el) return {};
  const o = {};
  if (el.hasAttribute('sz')) o.sz = num(el, 'sz', 1800) / 100;
  if (el.hasAttribute('b')) o.b = bool(el, 'b');
  if (el.hasAttribute('i')) o.i = bool(el, 'i');
  if (el.hasAttribute('u')) o.u = at(el, 'u');
  if (el.hasAttribute('strike')) o.strike = at(el, 'strike');
  if (el.hasAttribute('baseline')) o.baseline = num(el, 'baseline', 0) / 1000;
  if (el.hasAttribute('cap')) o.cap = at(el, 'cap');
  if (el.hasAttribute('spc')) o.spc = num(el, 'spc', 0) / 100;
  const f = Array.from(el.children).find((c) => FILL_TAGS.includes(c.localName));
  if (f) {
    if (f.localName === 'noFill') o.c = { r: 0, g: 0, b: 0, a: 0 };
    else if (f.localName === 'solidFill') o.c = color(f, env.cx, ph);
    else if (f.localName === 'gradFill') { const g = readFill(f, env, ph); if (g && g.stops) o.c = g.stops[0].c; }
  }
  const hl = ch(el, 'highlight'); if (hl) o.hl = color(hl, env.cx, ph);
  for (const k of ['latin', 'ea', 'cs', 'sym']) { const e = ch(el, k); if (e && at(e, 'typeface')) o[k] = at(e, 'typeface'); }
  const sh = ch(ch(el, 'effectLst'), 'outerShdw'); if (sh) o.sh = sh;
  if (ch(el, 'hlinkClick') && at(ch(el, 'hlinkClick'), 'r:id', at(ch(el, 'hlinkClick'), 'id', ''))) { o.c = hexRgb(env.cx.scheme('hlink')); o.u = o.u && o.u !== 'none' ? o.u : 'sng'; }
  return o;
}
const mergeP = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) { if (v === undefined) continue; if (k === 'r') o.r = { ...(a.r || {}), ...v }; else o[k] = v; } return o; };

function lvlOf(lst, n, env, ph) { if (!lst) return {}; const e = ch(lst, 'lvl' + n + 'pPr'); return e ? readPPr(e, env, ph) : {}; }

const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const roman = (n) => { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; };
const alpha = (n) => { let s = ''; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; };
function autoNum(fmt, n) {
  const m = /^(arabic|romanUc|romanLc|alphaUc|alphaLc|circleNumDbPlain|circleNumWdBlackPlain|circleNumWdWhitePlain|ea1JpnKorPlain|hebrew2Minus|thaiAlphaPeriod)?(Period|ParenR|ParenBoth|Plain|Minus|DbPeriod|DbPlain|JpnChsDbPeriod)?$/.exec(fmt || '') || [];
  const kind = m[1] || 'arabic', suf = m[2] || 'Period';
  let s;
  if (kind === 'romanUc') s = roman(n); else if (kind === 'romanLc') s = roman(n).toLowerCase();
  else if (kind === 'alphaUc') s = alpha(n); else if (kind === 'alphaLc') s = alpha(n).toLowerCase();
  else if (/^circleNum/.test(kind)) return n <= 20 ? String.fromCharCode(0x2460 + n - 1) : '(' + n + ')';
  else s = String(n);
  return suf === 'ParenR' ? s + ')' : suf === 'ParenBoth' ? '(' + s + ')' : suf === 'Plain' ? s : suf === 'Minus' ? s + '-' : s + '.';
}

/**
 * txBody → HTML of the paragraphs (inside a text frame the caller places).
 * chain: [{ lst, bodyPr }] from the lowest default to the shape itself; base: default run props (fontRef …)
 */
function renderParas(txBody, env, o) {
  const k = env.k, cx = env.cx;
  const scale = o.fontScale || 1, lnRed = o.lnSpcReduction || 0;
  const paras = chs(txBody, 'p');
  const counters = {};
  let html = '';
  let anyText = false;
  for (const p of paras) {
    const pPrEl = ch(p, 'pPr');
    const lvl = Math.min(8, Math.max(0, num(pPrEl, 'lvl', 0)));
    // merged paragraph props: defaults → masters → shape → paragraph
    let P = { r: { ...(o.baseR || {}) } };
    for (const src of o.lsts) P = mergeP(P, lvlOf(src, lvl + 1, env));
    P = mergeP(P, readPPr(pPrEl, env));
    // runs
    const runs = [];
    for (const c of p.children) {
      if (c.localName === 'r' || c.localName === 'fld') {
        const t = ch(c, 't'); const text = t ? t.textContent : '';
        runs.push({ t: text, r: { ...P.r, ...readRPr(ch(c, 'rPr'), env) } });
      } else if (c.localName === 'br') runs.push({ br: true, r: { ...P.r, ...readRPr(ch(c, 'rPr'), env) } });
      else if (c.localName === 'AlternateContent') { // math etc. — take the fallback text
        const fb = ch(c, 'Fallback'); if (fb) for (const r of fb.getElementsByTagNameNS('*', 'r')) { const t = ch(r, 't'); if (t) runs.push({ t: t.textContent, r: { ...P.r, ...readRPr(ch(r, 'rPr'), env) } }); }
      }
    }
    const endR = { ...P.r, ...readRPr(ch(p, 'endParaRPr'), env) };
    const hasText = runs.some((r) => r.t && r.t.length);
    const first = runs.find((r) => r.t && r.t.trim()) || runs[0] || { r: endR };
    const R0 = first.r;
    const sz = (r) => (r.sz || 18) * scale;
    const maxSz = Math.max(sz(endR), ...runs.filter((r) => r.t || r.br).map((r) => sz(r.r)), hasText ? 0 : sz(endR));
    const fpx = (pt) => pt * 12700 * k;
    // line spacing
    const font0 = (HANGUL.test(runs.map((r) => r.t || '').join('')) ? R0.ea || R0.latin : R0.latin || R0.ea) || o.font || '';
    const lf = lineFactor(env.fontName(font0));
    let lh;
    if (P.lnSpc && P.lnSpc.pts != null) lh = px(fpx(P.lnSpc.pts));
    else { const pct = (P.lnSpc ? P.lnSpc.pct : 1) * (1 - lnRed); lh = r2(lf * pct) + ''; }
    const sp = (v) => (!v ? 0 : v.pts != null ? fpx(v.pts) : v.pct * fpx(maxSz) * lf);
    const mt = sp(P.spcBef), mb = sp(P.spcAft);
    const marL = (P.marL || 0) * k, indent = (P.indent || 0) * k;
    const algn = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify', thaiDist: 'justify', justLow: 'justify' }[P.algn || 'l'] || 'left';
    const tab = P.defTabSz ? P.defTabSz * k : 914400 * k;
    if (!hasText) {
      // empty paragraph: just its line
      html += '<div style="height:' + px(fpx(sz(endR)) * (P.lnSpc && P.lnSpc.pts != null ? 1 : lf * (P.lnSpc ? P.lnSpc.pct : 1) * (1 - lnRed))) + ';margin:' + px(mt) + ' 0 ' + px(mb) + '"></div>';
      continue;
    }
    anyText = true;
    // bullet
    let bu = '';
    const B = P.bu;
    if (B && B.t !== 'none' && hasText) {
      let txt = '';
      if (B.t === 'char') {
        txt = B.ch;
        const bf = P.buFont && P.buFont !== 'tx' ? P.buFont : '';
        if ((bf && SYMBOL_FONTS.test(bf)) || txt.charCodeAt(0) >= 0xf000) txt = symChar(txt);
      } else {
        const c0 = counters[lvl];
        counters[lvl] = c0 && c0.fmt === B.fmt ? { fmt: B.fmt, n: c0.n + 1 } : { fmt: B.fmt, n: B.start || 1 };
        txt = autoNum(B.fmt, counters[lvl].n);
      }
      const bsz = P.buSz && P.buSz !== 'tx' ? (P.buSz.pct != null ? sz(R0) * P.buSz.pct : P.buSz.pts * scale) : sz(R0);
      const bcol = P.buClr && P.buClr !== 'tx' ? P.buClr : R0.c;
      const bfont = B.t === 'num' ? null : (P.buFont && P.buFont !== 'tx' && !SYMBOL_FONTS.test(P.buFont) ? P.buFont : null);
      bu = '<span style="position:absolute;left:' + px(Math.max(0, marL + indent)) + ';top:0;white-space:nowrap;font-size:' + px(fpx(bsz)) + ';color:' + css(bcol || { r: 0, g: 0, b: 0, a: 1 }) + (bfont ? ';font-family:' + fontStack([bfont]) : '') + (B.t === 'num' && R0.b ? ';font-weight:700' : '') + '">' + esc(txt) + '</span>';
    }
    if (!B || B.t !== 'num') delete counters[lvl];
    for (const kk of Object.keys(counters)) if (Number(kk) > lvl) delete counters[kk];
    // runs → spans (the block's own style = the first run; spans only where a run differs)
    const runCss = (r, base) => {
      const s = [];
      const f = (r.sz || 18) * scale; if (!base || f !== (base.sz || 18) * scale) s.push('font-size:' + px(fpx(f)));
      const fam = env.fontsOf(r); if (!base || fam !== env.fontsOf(base)) s.push('font-family:' + fam);
      const wt = env.weightOf(r); if (!base || wt !== env.weightOf(base)) s.push('font-weight:' + wt);
      const it = !!r.i; if (!base ? it : it !== !!base.i) s.push('font-style:' + (it ? 'italic' : 'normal'));
      const col = css(r.c || { r: 0, g: 0, b: 0, a: 1 }); if (!base || col !== css(base.c || { r: 0, g: 0, b: 0, a: 1 })) s.push('color:' + col);
      const deco = [r.u && r.u !== 'none' ? 'underline' : '', r.strike && r.strike !== 'noStrike' ? 'line-through' : ''].filter(Boolean).join(' ');
      const bdeco = base ? [base.u && base.u !== 'none' ? 'underline' : '', base.strike && base.strike !== 'noStrike' ? 'line-through' : ''].filter(Boolean).join(' ') : '';
      if (deco !== bdeco || (!base && deco)) s.push('text-decoration:' + (deco || 'none'));
      if (r.u === 'dbl') s.push('text-decoration-style:double');
      const spc = r.spc ? r.spc * 12700 * k : 0, bspc = base && base.spc ? base.spc * 12700 * k : 0;
      if ((!base && spc) || (base && spc !== bspc)) s.push('letter-spacing:' + px(spc));
      if (r.cap === 'all' && (!base || base.cap !== 'all')) s.push('text-transform:uppercase'); else if (base && base.cap === 'all' && r.cap !== 'all') s.push('text-transform:none');
      if (r.cap === 'small' && (!base || base.cap !== 'small')) s.push('font-variant:small-caps');
      if (r.baseline) s.push('vertical-align:' + r2(r.baseline / 100) + 'em', 'font-size:' + px(fpx(f) * 0.67));
      if (r.hl) s.push('background:' + css(r.hl));
      if (r.sh) { const sh = r.sh; const c = color(sh, cx) || { r: 0, g: 0, b: 0, a: 0.4 }; const d = num(sh, 'dist', 0) * k, dir = num(sh, 'dir', 0) / 60000 * Math.PI / 180; s.push('text-shadow:' + px(Math.cos(dir) * d) + ' ' + px(Math.sin(dir) * d) + ' ' + px(num(sh, 'blurRad', 0) * k / 2) + ' ' + css(c)); }
      return s.join(';');
    };
    let inner = '';
    for (const r of runs) {
      if (r.br) { inner += '<br>'; continue; }
      if (!r.t) continue;
      const st = runCss(r.r, R0);
      inner += st ? '<span style="' + st + '">' + esc(r.t) + '</span>' : esc(r.t);
    }
    if (inner.endsWith('<br>')) inner += '<br>'; // a break at the end still makes an empty last line
    const idx = env.tb++;
    const plain = runs.map((r) => (r.br ? '\n' : r.t || '')).join('');
    env.blocks.push({ i: idx, s: plain.replace(/\s+/g, ' ').trim(), fs: fpx(sz(R0)), title: !!o.isTitle, y: o.y || 0 });
    const textIndent = bu ? 0 : indent;
    html += '<div style="position:relative;margin:' + px(mt) + ' 0 ' + px(mb) + ';padding-left:' + px(marL) + (P.marR ? ';padding-right:' + px(P.marR * k) : '') + ';text-align:' + algn + (o.nowrap ? ';display:flex;justify-content:' + (algn === 'center' ? 'center' : algn === 'right' ? 'flex-end' : 'flex-start') : '') + '">' + bu
      + '<div data-tb="' + idx + '" style="' + runCss(R0, null) + ';line-height:' + lh + ';white-space:' + (o.nowrap ? 'pre' : 'pre-wrap') + ';overflow-wrap:break-word;word-break:keep-all;tab-size:' + px(tab) + (textIndent ? ';text-indent:' + px(textIndent) : '') + '">' + inner + '</div></div>';
  }
  return { html, anyText };
}

/* ---------------- the converter ---------------- */
const PIC_EXT_OK = /\.(png|jpe?g|gif|bmp|webp|svg|avif)$/i;
const RASTER = /\.(png|jpe?g|gif|bmp|webp|avif)$/i;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif' };

const TITLE_PH = new Set(['title', 'ctrTitle']);
const BODY_PH = new Set(['body', 'subTitle', 'obj', 'tbl', 'chart', 'dgm', 'media', 'clipArt', 'pic', '']);

export async function convertPptx(input, { prefix = 'm' + Math.random().toString(36).slice(2, 8), onProgress, maxSlides = 200 } = {}) {
  const zip = await JSZip.loadAsync(input);
  const pkg = new Pkg(zip);
  const ct = await pkg.part('[Content_Types].xml');
  let presPath = 'ppt/presentation.xml';
  if (ct) for (const o of ct.root.children) { const t = at(o, 'ContentType') || ''; if (/presentationml\.(presentation|template|slideshow)\.main\+xml|presentationml\.presentation\.macroEnabled\.main\+xml|presentationml\.template\.macroEnabled/.test(t)) presPath = (at(o, 'PartName') || '/ppt/presentation.xml').slice(1); }
  const pres = await pkg.part(presPath);
  if (!pres) throw new Error('PPTX가 아니거나 열 수 없는 파일이에요');
  const sz = q(pres.root, 'sldSz');
  const SW = num(sz, 'cx', 12192000), SH = num(sz, 'cy', 6858000);
  const k = Math.min(W / SW, H / SH);
  const offX = (W - SW * k) / 2, offY = (H - SH * k) / 2;
  const defText = q(pres.root, 'defaultTextStyle');
  // slide order
  const slidePaths = [];
  for (const s of chs(q(pres.root, 'sldIdLst'), 'sldId')) { const r = pres.rels[rid(s, 'id')]; if (r) slidePaths.push(r.target); }
  let mode = 'slides';
  let pages = slidePaths;
  if (!pages.length) { // a template with no slides: its layouts become the pages
    mode = 'layouts';
    pages = [];
    for (const m of chs(q(pres.root, 'sldMasterIdLst'), 'sldMasterId')) {
      const r = pres.rels[rid(m, 'id')]; if (!r) continue;
      const mp = await pkg.part(r.target); if (!mp) continue;
      for (const l of chs(q(mp.root, 'sldLayoutIdLst'), 'sldLayoutId')) { const lr = mp.rels[rid(l, 'id')]; if (lr) pages.push(lr.target); }
    }
  }
  pages = pages.slice(0, maxSlides);
  const themes = new Map();
  async function themeOf(master) {
    const tp = pkg.relOf(master, 'theme');
    if (themes.has(tp)) return themes.get(tp);
    const t = await pkg.part(tp);
    const th = { clr: {}, mj: {}, mn: {}, fill: [], ln: [], eff: [], bg: [], part: t };
    if (t) {
      const te = t.root.getElementsByTagNameNS('*', 'themeElements')[0];
      const cs = q(te, 'clrScheme');
      for (const c of cs ? cs.children : []) { const x = c.firstElementChild; if (!x) continue; th.clr[c.localName] = x.localName === 'sysClr' ? at(x, 'lastClr') || SYS[at(x, 'val')] || '000000' : at(x, 'val') || '000000'; }
      const fs = q(te, 'fontScheme');
      for (const [kk, n] of [['mj', 'majorFont'], ['mn', 'minorFont']]) {
        const f = ch(fs, n); if (!f) continue;
        th[kk] = { latin: at(ch(f, 'latin'), 'typeface', ''), ea: at(ch(f, 'ea'), 'typeface', ''), cs: at(ch(f, 'cs'), 'typeface', '') };
        const hang = chs(f, 'font').find((x) => at(x, 'script') === 'Hang'); if (hang && !th[kk].ea) th[kk].ea = at(hang, 'typeface', '');
      }
      const fm = q(te, 'fmtScheme');
      th.fill = Array.from((q(fm, 'fillStyleLst') || { children: [] }).children);
      th.ln = chs(q(fm, 'lnStyleLst'), 'ln');
      th.eff = chs(q(fm, 'effectStyleLst'), 'effectStyle');
      th.bg = Array.from((q(fm, 'bgFillStyleLst') || { children: [] }).children);
    }
    themes.set(tp, th);
    return th;
  }
  const tblStylesPart = await pkg.part(pkg.relOf(pres, 'tableStyles'));
  const images = new Map(); // token → Blob
  const jobs = new Map(); // key → { token, path, crop, w, h }
  const warnings = new Set();
  const out = [];
  let tokN = 0;

  for (let si = 0; si < pages.length; si++) {
    const slide = await pkg.part(pages[si]);
    if (!slide) continue;
    const isLayoutPage = mode === 'layouts';
    const layout = isLayoutPage ? slide : await pkg.part(pkg.relOf(slide, 'slideLayout'));
    const master = layout ? await pkg.part(pkg.relOf(layout, 'slideMaster')) : null;
    const theme = master ? await themeOf(master) : { clr: {}, mj: {}, mn: {}, fill: [], ln: [], eff: [], bg: [] };
    // colour map: master → layout override → slide override
    const clrMap = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
    const cm = master && q(master.root, 'clrMap'); if (cm) for (const a of cm.attributes) clrMap[a.name] = a.value;
    for (const pp of isLayoutPage ? [layout] : [layout, slide]) { const ov = pp && q(pp.root, 'clrMapOvr', 'overrideClrMapping'); if (ov) for (const a of ov.attributes) clrMap[a.name] = a.value; }
    const cx = { scheme: (v) => theme.clr[clrMap[v] || v] || theme.clr[v] || (v === 'bg1' || v === 'lt1' ? 'FFFFFF' : '000000') };
    const fontName = (n) => { if (!n) return ''; if (n === '+mj-lt') return theme.mj.latin; if (n === '+mn-lt') return theme.mn.latin; if (n === '+mj-ea') return theme.mj.ea; if (n === '+mn-ea') return theme.mn.ea; if (n === '+mj-cs') return theme.mj.cs; if (n === '+mn-cs') return theme.mn.cs; return n; };
    const env = {
      k, cx, theme, part: slide, tb: 0, img: 0, blocks: [], pics: [], gid: 0, fontName,
      fontsOf: (r) => fontStack([fontName(r.latin), fontName(r.ea)].filter(Boolean)),
      weightOf: (r) => { const w = fontWeightOf(fontName(r.ea) || fontName(r.latin)) || fontWeightOf(fontName(r.latin)); return r.b ? Math.max(700, w || 0) : w || 400; },
    };
    // placeholders of the layout (by idx · type) and master (by type)
    const phMap = (pp) => {
      const m = { idx: {}, type: {} };
      if (!pp) return m;
      for (const sp of pp.root.getElementsByTagNameNS('*', 'sp')) {
        const ph = q(sp, 'nvSpPr', 'nvPr', 'ph'); if (!ph) continue;
        const t = at(ph, 'type', 'obj'), i = at(ph, 'idx');
        if (i != null && !(i in m.idx)) m.idx[i] = sp;
        if (!(t in m.type)) m.type[t] = sp;
      }
      return m;
    };
    const LPH = isLayoutPage ? { idx: {}, type: {} } : phMap(layout), MPH = phMap(master);
    const masterType = (t) => (t === 'ctrTitle' ? 'title' : t === 'subTitle' || t === 'obj' || t === '' ? 'body' : t);
    const phChain = (ph) => {
      if (!ph) return [];
      const t = at(ph, 'type', 'obj'), i = at(ph, 'idx');
      const out2 = [];
      const l = (i != null && LPH.idx[i]) || LPH.type[t] || (t === 'obj' && i != null ? null : null) || (TITLE_PH.has(t) ? LPH.type.title || LPH.type.ctrTitle : null);
      if (l && l !== ph) out2.push(l);
      const mt = masterType(at(q(l, 'nvSpPr', 'nvPr', 'ph'), 'type', t));
      const m = MPH.type[mt] || MPH.type[masterType(t)] || (BODY_PH.has(t) ? MPH.type.body : null);
      if (m) out2.push(m);
      return out2;
    };
    const txStyles = master ? q(master.root, 'txStyles') : null;
    const styleFor = (t) => (TITLE_PH.has(t) ? ch(txStyles, 'titleStyle') : BODY_PH.has(t) ? ch(txStyles, 'bodyStyle') : ch(txStyles, 'otherStyle'));

    const imgToken = (path, crop, w, h, fx = null, tile = false) => {
      const fxs = fx && (fx.duo || fx.gray) ? JSON.stringify([fx.duo ? fx.duo.map(css) : 0, !!fx.gray]) : '';
      const key = path + '|' + (crop ? [crop.l, crop.t, crop.r, crop.b].map((v) => Math.round(v * 1000)).join(',') : '') + '|' + (tile ? 'tile' : Math.round(w / 40) + 'x' + Math.round(h / 40)) + fxs;
      if (!jobs.has(key)) jobs.set(key, { token: prefix + '-' + (tokN++), path, crop, w, h, fx: fxs ? fx : null, tile });
      return 'wmimg:' + jobs.get(key).token;
    };

    /* ---- geometry + fill + line → html (the shape's drawing, box at 0,0 w×h) ---- */
    const drawShape = (g, w, h, fill, line, opt = {}) => {
      const prst = g.prst, adj = g.adj || {};
      const lw = line && !line.none && line.c ? Math.max(0.5, (line.w || 9525) * k) : 0;
      const hasArrow = line && !line.none && (line.head || line.tail);
      const simpleFill = !fill || fill.t === 'none' || fill.t === 'solid';
      const circle = prst === 'ellipse' && Math.abs(w - h) < 0.6;
      const filter = opt.shadow ? ';filter:' + opt.shadow : '';
      if (!g.cust && (prst === 'rect' || prst === 'roundRect' || circle || prst === 'flowChartProcess') && simpleFill && !hasArrow && !(line && (line.cdash || line.g)) && !opt.flipText) {
        const bg = fill && fill.t === 'solid' ? css(fill.c) : 'transparent';
        if (bg === 'transparent' && !lw) return '';
        const dash = line && line.dash && line.dash !== 'solid' ? (/dot/i.test(line.dash) && !/dash/i.test(line.dash) ? 'dotted' : 'dashed') : 'solid';
        let rad = 0;
        if (prst === 'roundRect') rad = Math.min(w, h) * Math.min(0.5, (adj.adj != null ? adj.adj : 16667) / 100000);
        if (circle) rad = '50%';
        const e = lw / 2;
        return '<div style="position:absolute;left:' + px(-e) + ';top:' + px(-e) + ';width:' + (lw ? 'calc(100% + ' + px(lw) + ')' : '100%') + ';height:' + (lw ? 'calc(100% + ' + px(lw) + ')' : '100%') + ';box-sizing:border-box;background:' + bg + (lw ? ';border:' + px(lw) + ' ' + dash + ' ' + css(line.c) : '') + (rad ? ';border-radius:' + (typeof rad === 'string' ? rad : px(rad + e)) : '') + filter + '"></div>';
      }
      // SVG
      const G = g.cust ? g.geom(w, h) : presetGeom(prst, w, h, adj);
      const id = 'g' + prefix + '_' + si + '_' + env.gid++;
      let defs = '', paint = 'none';
      if (fill && fill.t === 'solid') paint = css(fill.c);
      else if (fill && fill.t === 'grad') {
        const st = fill.stops.map((s) => '<stop offset="' + r2(s.pos) + '" stop-color="' + css({ ...s.c, a: 1 }) + '"' + (s.c.a < 0.999 ? ' stop-opacity="' + r2(s.c.a) + '"' : '') + '/>').join('');
        if (fill.path) {
          const fr = fill.ftr || { l: 0.5, t: 0.5, r: 0.5, b: 0.5 };
          const fx = (fr.l + (1 - fr.r)) / 2, fy = (fr.t + (1 - fr.b)) / 2;
          defs += '<radialGradient id="' + id + '" cx="' + r2(fx) + '" cy="' + r2(fy) + '" r="0.75">' + st + '</radialGradient>';
        } else {
          const a = (fill.ang * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
          // gradient line through the box centre, long enough to reach both corners (DrawingML scales the angle to the box)
          const L = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
          defs += '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + r2(w / 2 - dx * L) + '" y1="' + r2(h / 2 - dy * L) + '" x2="' + r2(w / 2 + dx * L) + '" y2="' + r2(h / 2 + dy * L) + '">' + st + '</linearGradient>';
        }
        paint = 'url(#' + id + ')';
      } else if (fill && fill.t === 'img' && PIC_EXT_OK.test(fill.path)) {
        if (fill.tile) { // tiled: the picture's own size × the tile scale (sizes filled in once the picture is read)
          const tok = imgToken(fill.path, null, w, h, fill.fx, true); const t = tok.slice(6);
          const sx = r2(num(fill.tile, 'sx', 100000) / 1e5), sy = r2(num(fill.tile, 'sy', 100000) / 1e5);
          defs += '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="wmtw(' + t + ',' + sx + ')" height="wmth(' + t + ',' + sy + ')"><image href="' + tok + '" width="wmtw(' + t + ',' + sx + ')" height="wmth(' + t + ',' + sy + ')" preserveAspectRatio="none"/></pattern>';
        } else {
          const tok = imgToken(fill.path, srcRectOf(fill.src), w, h, fill.fx);
          defs += '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + r2(w) + '" height="' + r2(h) + '"><image href="' + tok + '" width="' + r2(w) + '" height="' + r2(h) + '" preserveAspectRatio="none"' + (fill.fx && fill.fx.alpha < 1 ? ' opacity="' + r2(fill.fx.alpha) + '"' : '') + '/></pattern>';
        }
        paint = 'url(#' + id + ')';
      } else if (fill && fill.t === 'patt') {
        defs += '<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="' + css(fill.bg) + '"/><path d="M0 6L6 0" stroke="' + css(fill.fg) + '" stroke-width="1.2"/></pattern>';
        paint = 'url(#' + id + ')';
      }
      let dashArr = '';
      if (line && !line.none && lw) {
        const d = line.cdash ? line.cdash.flat() : DASH[line.dash || 'solid'];
        if (d) dashArr = ' stroke-dasharray="' + d.map((v) => r2(v * lw)).join(' ') + '"';
      }
      let sPaint = lw ? css(line.c) : 'none';
      if (lw && line.g) {
        const st = line.g.stops.map((s2) => '<stop offset="' + r2(s2.pos) + '" stop-color="' + css({ ...s2.c, a: 1 }) + '"' + (s2.c.a < 0.999 ? ' stop-opacity="' + r2(s2.c.a) + '"' : '') + '/>').join('');
        const a = (line.g.ang * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a), L = (Math.abs(w * dx) + Math.abs(h * dy)) / 2 || 1;
        defs += '<linearGradient id="' + id + 's" gradientUnits="userSpaceOnUse" x1="' + r2(w / 2 - dx * L) + '" y1="' + r2(h / 2 - dy * L) + '" x2="' + r2(w / 2 + dx * L) + '" y2="' + r2(h / 2 + dy * L) + '">' + st + '</linearGradient>';
        sPaint = 'url(#' + id + 's)';
      }
      const stroke = lw ? ' stroke="' + sPaint + '" stroke-width="' + r2(lw) + '"' + dashArr + ' stroke-linecap="' + ({ rnd: 'round', sq: 'square' }[line.cap] || 'butt') + '" stroke-linejoin="' + (line.join === 'bevel' ? 'bevel' : line.join === 'miter' ? 'miter' : 'round') + '"' : '';
      let body = '';
      for (const p of G.paths) {
        let fp = p.fill === 'none' ? 'none' : paint;
        if (fp !== 'none' && /^(darken|darkenLess|lighten|lightenLess)$/.test(p.fill) && fill && fill.t === 'solid') {
          const f2 = { ...fill.c }; const v = { darken: 0.6, darkenLess: 0.8, lighten: 0.6, lightenLess: 0.8 }[p.fill];
          for (const kk of ['r', 'g', 'b']) f2[kk] = /darken/.test(p.fill) ? toSrgb(toLin(f2[kk]) * v) : toSrgb(toLin(f2[kk]) * v + (1 - v));
          fp = css(f2);
        }
        body += '<path d="' + p.d + '" fill="' + fp + '"' + (p.stroke ? stroke : ' stroke="none"') + (fp !== 'none' && fill && fill.t === 'solid' && fill.c.a < 0.999 ? '' : '') + '/>';
      }
      // arrowheads
      if (hasArrow && G.ends && lw) {
        const head = (end, spec) => {
          if (!spec) return '';
          const [p0, p1] = end; const ang = Math.atan2(p0[1] - p1[1], p0[0] - p1[0]);
          const wm = { sm: 2, med: 3, lg: 5 }[spec.w] || 3, lm = { sm: 2, med: 3, lg: 5 }[spec.l] || 3;
          const aw = Math.max(lw * wm, 4), al = Math.max(lw * lm, 4);
          const rot = (x, y) => [p0[0] + x * Math.cos(ang) - y * Math.sin(ang), p0[1] + x * Math.sin(ang) + y * Math.cos(ang)];
          const P = (pts) => pts.map((v) => r2(v[0]) + ',' + r2(v[1])).join(' ');
          const c = css(line.c);
          if (spec.t === 'triangle') return '<polygon points="' + P([rot(0, 0), rot(-al, -aw / 2), rot(-al, aw / 2)]) + '" fill="' + c + '"/>';
          if (spec.t === 'stealth') return '<polygon points="' + P([rot(0, 0), rot(-al, -aw / 2), rot(-al * 0.6, 0), rot(-al, aw / 2)]) + '" fill="' + c + '"/>';
          if (spec.t === 'arrow') return '<polyline points="' + P([rot(-al, -aw / 2), rot(0, 0), rot(-al, aw / 2)]) + '" fill="none" stroke="' + c + '" stroke-width="' + r2(lw) + '" stroke-linejoin="round"/>';
          if (spec.t === 'diamond') return '<polygon points="' + P([rot(al / 2, 0), rot(0, -aw / 2), rot(-al / 2, 0), rot(0, aw / 2)]) + '" fill="' + c + '"/>';
          if (spec.t === 'oval') { const [ox, oy] = rot(0, 0); return '<ellipse cx="' + r2(ox) + '" cy="' + r2(oy) + '" rx="' + r2(al / 2) + '" ry="' + r2(aw / 2) + '" fill="' + c + '"/>'; }
          return '';
        };
        body += head(G.ends.head, line.head) + head(G.ends.tail, line.tail);
      }
      const op = fill && fill.t === 'solid' && fill.c.a < 0.999 ? '' : '';
      const flip = (opt.flipH || opt.flipV) ? ';transform:scale(' + (opt.flipH ? -1 : 1) + ',' + (opt.flipV ? -1 : 1) + ')' : '';
      const fluid = w >= 2 && h >= 2;
      if (fluid) body = body.replace(/<(path|polyline)\b/g, '<$1 vector-effect="non-scaling-stroke"');
      return '<svg xmlns="http://www.w3.org/2000/svg" ' + (fluid ? 'width="100%" height="100%" viewBox="0 0 ' + r2(w) + ' ' + r2(h) + '" preserveAspectRatio="none"' : 'width="' + r2(Math.max(w, 1)) + '" height="' + r2(Math.max(h, 1)) + '"') + ' style="position:absolute;left:0;top:0;overflow:visible' + flip + filter + op + '">' + (defs ? '<defs>' + defs + '</defs>' : '') + body + '</svg>';
    };
    const srcRectOf = (sr) => {
      if (!sr) return null;
      const c = { l: num(sr, 'l', 0) / 1e5, t: num(sr, 't', 0) / 1e5, r: num(sr, 'r', 0) / 1e5, b: num(sr, 'b', 0) / 1e5 };
      return c.l || c.t || c.r || c.b ? c : null;
    };
    const geomOf = (spPr, chain) => {
      const srcs = [spPr, ...chain.map((s) => ch(s, 'spPr'))];
      for (const s of srcs) {
        const pg = ch(s, 'prstGeom');
        if (pg) { const adj = {}; for (const gd of chs(ch(pg, 'avLst'), 'gd')) { const m = /^val\s+(-?[\d.]+)/.exec(at(gd, 'fmla', '')); if (m) adj[at(gd, 'name')] = Number(m[1]); } const prst = at(pg, 'prst', 'rect'); if (!hasPreset(prst)) warnings.add('모양 ' + prst + '는 사각형으로 그렸어요'); return { prst: hasPreset(prst) ? prst : 'rect', adj }; }
        const cg = ch(s, 'custGeom');
        if (cg) return { cust: true, geom: (w, h) => buildGeom(custDef(cg), w, h) };
      }
      return { prst: 'rect', adj: {} };
    };

    /* ---- text frame ---- */
    const textFrame = (txBody, w, h, o) => {
      if (!txBody) return '';
      // bodyPr: placeholder chain (low → high)
      const bps = [...(o.chain || []).map((s) => q(s, 'txBody', 'bodyPr')).reverse(), ch(txBody, 'bodyPr')].filter(Boolean);
      const B = {};
      let fontScale = 1, lnRed = 0, autofit = '';
      for (const b of bps) {
        for (const a of b.attributes) B[a.name] = a.value;
        const na = ch(b, 'normAutofit'); if (na) { autofit = 'norm'; fontScale = num(na, 'fontScale', 100000) / 100000; lnRed = num(na, 'lnSpcReduction', 0) / 100000; }
        if (ch(b, 'spAutoFit')) autofit = 'sp'; if (ch(b, 'noAutofit')) { autofit = ''; fontScale = 1; lnRed = 0; }
      }
      const ins = (n, d) => (B[n] != null ? Number(B[n]) : d) * k;
      const L = ins('lIns', 91440), T = ins('tIns', 45720), R = ins('rIns', 91440), Bt = ins('bIns', 45720);
      const anchor = B.anchor || 't';
      const vert = B.vert || 'horz';
      const nowrap = B.wrap === 'none';
      // list styles low → high
      const lsts = [];
      if (o.ph) {
        lsts.push(defText, styleFor(at(o.ph, 'type', 'obj')));
        for (const s of [...(o.chain || [])].reverse()) lsts.push(q(s, 'txBody', 'lstStyle'));
      } else lsts.push(defText, ...(o.extraLst || []));
      lsts.push(ch(txBody, 'lstStyle'));
      const { html, anyText } = renderParas(txBody, env, { lsts: lsts.filter(Boolean), baseR: o.baseR, fontScale, lnSpcReduction: lnRed, nowrap, isTitle: o.isTitle, y: o.y, font: o.font });
      if (!anyText) return '';
      let tr = o.tx || { l: 0, t: 0, r: w, b: h };
      let fw = tr.r - tr.l, fh = tr.b - tr.t, fl = tr.l, ft = tr.t;
      let rot = '';
      if (vert === 'vert' || vert === 'vert270' || vert === 'wordArtVert') { rot = 'rotate(' + (vert === 'vert270' ? -90 : 90) + 'deg)'; const cxm = fl + fw / 2, cym = ft + fh / 2; [fw, fh] = [fh, fw]; fl = cxm - fw / 2; ft = cym - fh / 2; }
      if (o.flipV) rot = (rot ? rot + ' ' : '') + 'rotate(180deg)';
      const wm = vert === 'eaVert' || vert === 'mongolianVert' ? ';writing-mode:vertical-rl' : '';
      const jc = anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : 'flex-start';
      const cols = Number(B.numCol || 1) > 1 ? ';column-count:' + Number(B.numCol) + ';column-gap:' + px(Number(B.spcCol || 0) * k) : '';
      const pc = (v, of) => (of > 0.5 && !rot ? r2((v / of) * 100) + '%' : px(v));
      return '<div style="position:absolute;left:' + pc(fl, w) + ';top:' + pc(ft, h) + ';width:' + pc(Math.max(0, fw), w) + ';height:' + pc(Math.max(0, fh), h) + ';box-sizing:border-box;padding:' + px(T) + ' ' + px(R) + ' ' + px(Bt) + ' ' + px(L) + ';display:flex;flex-direction:column;justify-content:' + jc + (B.anchorCtr === '1' ? ';align-items:center' : '') + (rot ? ';transform:' + rot : '') + wm + '"><div style="' + (cols ? cols.slice(1) : '') + (nowrap ? (cols ? ';' : '') + 'width:100%' : '') + '">' + html + '</div></div>';
    };

    /* ---- one element of a shape tree ---- */
    const box = (xfrm, T) => {
      const off = ch(xfrm, 'off'), ext = ch(xfrm, 'ext');
      const x = (num(off, 'x', 0) - T.ox) * T.sx, y = (num(off, 'y', 0) - T.oy) * T.sy;
      const w = num(ext, 'cx', 0) * T.sx, h = num(ext, 'cy', 0) * T.sy;
      return { x, y, w, h, rot: num(xfrm, 'rot', 0) / 60000, flipH: bool(xfrm, 'flipH'), flipV: bool(xfrm, 'flipV') };
    };
    const wrap = (b, inner, extra = '') => '<div data-sp="1" style="position:absolute;left:' + px(b.x) + ';top:' + px(b.y) + ';width:' + px(b.w) + ';height:' + px(b.h) + (b.rot ? ';transform:rotate(' + r2(b.rot) + 'deg)' : '') + extra + '">' + inner + '</div>';
    const styleRefs = (sp) => {
      const st = ch(sp, 'style'); if (!st) return {};
      const lr = ch(st, 'lnRef'), fr = ch(st, 'fillRef'), er = ch(st, 'effectRef'), fo = ch(st, 'fontRef');
      const o = {};
      if (lr) { const i = num(lr, 'idx', 0); const c = color(lr, cx); o.ln = i > 0 && theme.ln[i - 1] ? lineOf(theme.ln[i - 1], env, c) : { none: true }; }
      if (fr) { const i = num(fr, 'idx', 0); const c = color(fr, cx); const el = i >= 1001 ? theme.bg[i - 1001] : i > 0 ? theme.fill[i - 1] : null; o.fill = el ? readFill(el, env, c, theme.part) : { t: 'none' }; }
      if (er) { const i = num(er, 'idx', 0); const el = i > 0 ? theme.eff[i - 1] : null; o.eff = el ? ch(el, 'effectLst') : null; }
      if (fo) { const c = color(fo, cx); const i = at(fo, 'idx', 'minor'); o.font = i === 'major' ? '+mj-lt' : i === 'minor' ? '+mn-lt' : ''; o.fontEa = i === 'major' ? '+mj-ea' : i === 'minor' ? '+mn-ea' : ''; o.fontC = c; }
      return o;
    };

    async function node(el, T, layer, part) {
      const ln = el.localName;
      env.part = part;
      if (ln === 'AlternateContent') {
        const fb = ch(el, 'Fallback'), choice = ch(el, 'Choice');
        const use = choice && /^(p14|a14|p15|v|wps)?$/.test(at(choice, 'Requires', '')) && Array.from(choice.children).some((c) => /^(sp|grpSp|pic|graphicFrame|cxnSp)$/.test(c.localName)) && !(fb && Array.from(fb.children).some((c) => c.localName === 'pic') && Array.from(choice.children).some((c) => c.localName === 'graphicFrame')) ? choice : fb || choice;
        let s = ''; for (const c of use ? use.children : []) s += await node(c, T, layer, part); return s;
      }
      if (ln === 'grpSp') return group(el, T, layer, part);
      if (ln === 'sp' || ln === 'cxnSp') return shape(el, T, layer, part);
      if (ln === 'pic') return pic(el, T, layer, part);
      if (ln === 'graphicFrame') return frame(el, T, layer, part);
      if (ln === 'contentPart') { warnings.add('잉크(펜) 그림은 가져오지 못했어요'); return ''; }
      return '';
    }
    async function group(el, T, layer, part) {
      const nv = q(el, 'nvGrpSpPr', 'cNvPr'); if (bool(nv, 'hidden')) return '';
      const gp = ch(el, 'grpSpPr'); const xf = ch(gp, 'xfrm');
      let inner = '';
      if (!xf) { for (const c of el.children) inner += await node(c, T, layer, part); return inner; }
      const b = box(xf, T);
      const chOff = ch(xf, 'chOff'), chExt = ch(xf, 'chExt');
      const cw = num(chExt, 'cx', 0) || 1, chh = num(chExt, 'cy', 0) || 1;
      const T2 = { ox: num(chOff, 'x', 0), oy: num(chOff, 'y', 0), sx: b.w / cw || T.sx, sy: b.h / chh || T.sy };
      const prev = env.grpFill; const gf = fillOf(gp, env); if (gf) env.grpFill = gf;
      for (const c of el.children) if (/^(sp|grpSp|pic|graphicFrame|cxnSp|AlternateContent|contentPart)$/.test(c.localName)) inner += await node(c, T2, layer, part);
      env.grpFill = prev;
      const flip = b.flipH || b.flipV ? ' scale(' + (b.flipH ? -1 : 1) + ',' + (b.flipV ? -1 : 1) + ')' : '';
      return '<div data-grp="1" style="position:absolute;left:' + px(b.x) + ';top:' + px(b.y) + ';width:' + px(b.w) + ';height:' + px(b.h) + (b.rot || flip ? ';transform:' + (b.rot ? 'rotate(' + r2(b.rot) + 'deg)' : '') + flip : '') + '">' + inner + '</div>';
    }
    async function shape(el, T, layer, part) {
      const nvp = el.localName === 'cxnSp' ? ch(el, 'nvCxnSpPr') : ch(el, 'nvSpPr');
      const cNv = ch(nvp, 'cNvPr'); if (bool(cNv, 'hidden')) return '';
      const ph = q(nvp, 'nvPr', 'ph');
      const isPageLayer = layer === 'slide';
      if (ph && !isPageLayer) return ''; // placeholders on masters / layouts only show through slides
      const chain = isPageLayer ? (isLayoutPage ? (() => { const t = at(ph, 'type', 'obj'); const m = ph ? MPH.type[masterType(t)] || (BODY_PH.has(t) ? MPH.type.body : null) : null; return m ? [m] : []; })() : phChain(ph)) : [];
      const spPr = ch(el, 'spPr');
      const xf = ch(spPr, 'xfrm') || chain.map((s) => q(s, 'spPr', 'xfrm')).find(Boolean);
      if (!xf) return '';
      const b = box(xf, T);
      const sr = styleRefs(el);
      let fill = fillOf(spPr, env);
      if (fill === undefined && sr.fill) fill = sr.fill; // the shape's own style comes before what the placeholder inherits
      for (const s of chain) if (fill === undefined) fill = fillOf(ch(s, 'spPr'), env, null, s === chain[0] && !isLayoutPage ? layout : master);
      if (bool(el, 'useBgFill')) fill = env.bgFill || { t: 'none' };
      let line = lineOf(ch(spPr, 'ln'), env, null, sr.ln && !sr.ln.none ? sr.ln : null);
      if (line === undefined) for (const s of chain) { const l2 = lineOf(q(s, 'spPr', 'ln'), env); if (l2) { line = l2; break; } }
      if (line === undefined) line = sr.ln;
      const effEl = ch(spPr, 'effectLst') || (sr.eff || null);
      const shadow = effEl ? shadowOf(effEl, env, k) : null;
      const g = geomOf(spPr, chain);
      let inner = drawShape(g, b.w, b.h, fill, line, { flipH: b.flipH, flipV: b.flipV, shadow });
      // text
      const tx = ch(el, 'txBody') || (isLayoutPage ? null : null);
      if (tx) {
        const G = g.cust ? null : presetGeom(g.prst, b.w, b.h, g.adj);
        const t = at(ph, 'type', ph ? 'obj' : '');
        const baseR = {};
        if (sr.font) { baseR.latin = sr.font; baseR.ea = sr.fontEa; }
        if (sr.fontC) baseR.c = sr.fontC;
        inner += textFrame(tx, b.w, b.h, { chain, ph, baseR, tx: G && G.tx, isTitle: ph && TITLE_PH.has(t), y: b.y, flipV: b.flipV, font: theme.mn.latin });
      }
      if (!inner) return '';
      return wrap(b, inner);
    }
    async function pic(el, T, layer, part) {
      const cNv = q(el, 'nvPicPr', 'cNvPr'); if (bool(cNv, 'hidden')) return '';
      const ph = q(el, 'nvPicPr', 'nvPr', 'ph');
      const chain = layer === 'slide' && !isLayoutPage ? phChain(ph) : [];
      const spPr = ch(el, 'spPr');
      const xf = ch(spPr, 'xfrm') || chain.map((s) => q(s, 'spPr', 'xfrm')).find(Boolean);
      if (!xf) return '';
      const b = box(xf, T);
      const bf = ch(el, 'blipFill'); const blip = ch(bf, 'blip');
      const r = rid(blip) || rid(blip, 'link');
      const rel = r && part.rels[r];
      const g = geomOf(spPr, chain);
      const line = lineOf(ch(spPr, 'ln'), env, null, (styleRefs(el).ln && !styleRefs(el).ln.none) ? styleRefs(el).ln : null);
      const shadow = ch(spPr, 'effectLst') ? shadowOf(ch(spPr, 'effectLst'), env, k) : null;
      const slot = layer === 'slide';
      const ix = slot ? env.img++ : -1;
      let clip = '';
      if (g.cust || (g.prst !== 'rect')) {
        if (g.prst === 'ellipse') clip = ';border-radius:50%';
        else if (g.prst === 'roundRect') clip = ';border-radius:' + px(Math.min(b.w, b.h) * Math.min(0.5, (g.adj.adj != null ? g.adj.adj : 16667) / 100000));
        else { const G = g.cust ? g.geom(b.w, b.h) : presetGeom(g.prst, b.w, b.h, g.adj); if (G.paths[0]) clip = ";clip-path:path('" + G.paths.map((p) => p.d).join(' ') + "')"; }
      }
      // effects on the picture
      const fx = [];
      let op = 1;
      if (blip) for (const e of blip.children) {
        if (e.localName === 'grayscl') fx.push('grayscale(1)');
        else if (e.localName === 'alphaModFix') op = num(e, 'amt', 100000) / 100000;
        else if (e.localName === 'lum') { const br = num(e, 'bright', 0) / 100000, co = num(e, 'contrast', 0) / 100000; if (br) fx.push('brightness(' + r2(1 + br) + ')'); if (co) fx.push('contrast(' + r2(1 + co) + ')'); }
        else if (e.localName === 'biLevel') fx.push('grayscale(1) contrast(4)');
      }
      if (shadow) fx.push(shadow);
      let content;
      const tile = ch(bf, 'tile');
      if (rel && !rel.ext && PIC_EXT_OK.test(rel.target)) {
        const crop = srcRectOf(ch(bf, 'srcRect'));
        const tok = imgToken(rel.target, crop, b.w, b.h, blipFx(blip, env));
        env.pics.push(b.w * b.h);
        content = tile ? '<div style="width:100%;height:100%;background:url(' + tok + ') repeat;background-size:' + px(b.w / 4) + '"></div>'
          : '<img src="' + tok + '" alt="' + esc(at(cNv, 'descr', '') || at(cNv, 'name', '')) + '" style="display:block;width:100%;height:100%;object-fit:fill' + (b.flipH || b.flipV ? ';transform:scale(' + (b.flipH ? -1 : 1) + ',' + (b.flipV ? -1 : 1) + ')' : '') + '">';
      } else {
        if (rel && !PIC_EXT_OK.test(rel.target)) warnings.add((rel.target.split('.').pop() || '').toUpperCase() + ' 그림은 브라우저에서 그릴 수 없어 빈 이미지 칸으로 두었어요');
        content = '<div style="width:100%;height:100%;background:#eef0f4;display:flex;align-items:center;justify-content:center;color:#8a93a3;font-size:13px;font-family:\'Noto Sans KR\',sans-serif">이미지</div>';
      }
      const lw = line && !line.none && line.c ? Math.max(0.5, (line.w || 9525) * k) : 0;
      const border = lw ? drawShape(g, b.w, b.h, { t: 'none' }, line, {}) : '';
      const imgDiv = '<div' + (slot ? ' data-img="' + ix + '" data-kind="photo"' : '') + ' style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden' + clip + (op < 1 ? ';opacity:' + r2(op) : '') + (fx.length ? ';filter:' + fx.join(' ') : '') + '">' + content + '</div>';
      return wrap(b, imgDiv + border);
    }
    async function frame(el, T, layer, part) {
      const cNv = q(el, 'nvGraphicFramePr', 'cNvPr'); if (bool(cNv, 'hidden')) return '';
      const xf = ch(el, 'xfrm'); if (!xf) return '';
      const b = box(xf, T);
      const gd = q(el, 'graphic', 'graphicData');
      const uri = at(gd, 'uri', '');
      if (/\/table$/.test(uri)) return wrap(b, table(ch(gd, 'tbl'), b, T));
      if (/\/chart$/.test(uri)) {
        const c = ch(gd, 'chart'); const rel = part.rels[rid(c, 'id')];
        const cp = rel ? await pkg.part(rel.target) : null;
        if (!cp) return '';
        try { return wrap(b, renderChart(cp, { w: b.w, h: b.h, k, cx, theme, color: (e, ph) => color(e, cx, ph), css, fill: (e) => fillOf(e, env), line: (e) => lineOf(e, env), fonts: (r) => env.fontsOf(r), esc, ch, chs, q, at, num, prefix: prefix + si + '_' + env.gid++ })); }
        catch (e) { console.warn('chart', e); warnings.add('차트 하나를 그리지 못했어요'); return ''; }
      }
      if (/\/diagram$/.test(uri)) {
        // SmartArt: its pre-drawn shapes (dsp:drawing) — linked from the data part's extension
        const relIds = ch(gd, 'relIds'); const dm = relIds && part.rels[rid(relIds, 'dm')];
        let dpath = null;
        if (dm) { const dmp = await pkg.part(dm.target); const ext = dmp && dmp.root.getElementsByTagNameNS('*', 'dataModelExt')[0]; const rr = ext && part.rels[at(ext, 'relId')]; if (rr) dpath = rr.target; }
        if (!dpath) for (const r of Object.values(part.rels)) if (/diagramDrawing$/.test(r.type)) { dpath = r.target; break; }
        const dp = dpath ? await pkg.part(dpath) : null;
        if (!dp) { warnings.add('SmartArt 하나는 그림 정보가 없어 가져오지 못했어요'); return ''; }
        const tree = dp.root.getElementsByTagNameNS('*', 'spTree')[0];
        const T2 = { ox: 0, oy: 0, sx: T.sx, sy: T.sy };
        let inner = '';
        for (const c of tree ? tree.children : []) inner += await dsp(c, T2, dp);
        return wrap({ ...b, rot: 0 }, inner);
      }
      // OLE object etc.: its picture
      const pics = gd ? gd.getElementsByTagNameNS('*', 'pic') : [];
      if (pics.length) {
        const p0 = pics[0];
        const r = rid(q(p0, 'blipFill', 'blip')); const rel = r && part.rels[r];
        if (rel && PIC_EXT_OK.test(rel.target)) { const tok = imgToken(rel.target, null, b.w, b.h); return wrap(b, '<img src="' + tok + '" alt="" style="display:block;width:100%;height:100%;object-fit:fill">'); }
      }
      if (/\/ole$/.test(uri) || ch(gd, 'oleObj')) {
        warnings.add('포함된 개체(OLE)는 그림이 없어 빈 칸으로 두었어요');
        return wrap(b, '<div style="width:100%;height:100%;background:#eef0f4;border:1px dashed #b9c0cc;box-sizing:border-box;display:flex;align-items:center;justify-content:center;color:#8a93a3;font-size:13px;font-family:\'Noto Sans KR\',sans-serif">포함된 개체</div>');
      }
      return '';
    }
    async function dsp(el, T, part) { // SmartArt drawing shapes (dsp:sp · dsp:grpSp)
      env.part = part;
      if (el.localName === 'grpSp') { let s = ''; for (const c of el.children) s += await dsp(c, T, part); return s; }
      if (el.localName !== 'sp') return '';
      const spPr = ch(el, 'spPr'); const xf = ch(spPr, 'xfrm'); if (!xf) return '';
      const b = box(xf, T);
      const sr = styleRefs(el);
      let fill = fillOf(spPr, env); if (fill === undefined) fill = sr.fill;
      let line = lineOf(ch(spPr, 'ln'), env, null, sr.ln && !sr.ln.none ? sr.ln : null); if (line === undefined) line = sr.ln;
      const g = geomOf(spPr, []);
      let inner = drawShape(g, b.w, b.h, fill, line, { flipH: b.flipH, flipV: b.flipV });
      const tx = ch(el, 'txBody');
      if (tx) {
        const tx2 = ch(el, 'txXfrm');
        let rect = null;
        if (tx2) { const tb = box(tx2, T); rect = { l: tb.x - b.x, t: tb.y - b.y, r: tb.x - b.x + tb.w, b: tb.y - b.y + tb.h }; }
        inner += textFrame(tx, b.w, b.h, { chain: [], ph: null, baseR: { ...(sr.font ? { latin: sr.font, ea: sr.fontEa } : {}), ...(sr.fontC ? { c: sr.fontC } : {}) }, tx: rect || (g.cust ? null : presetGeom(g.prst, b.w, b.h, g.adj).tx), y: b.y });
      }
      return inner ? wrap(b, inner) : '';
    }

    /* ---- tables ---- */
    const table = (tbl, b, T) => {
      const tp = ch(tbl, 'tblPr');
      const flags = { firstRow: bool(tp, 'firstRow'), lastRow: bool(tp, 'lastRow'), firstCol: bool(tp, 'firstCol'), lastCol: bool(tp, 'lastCol'), bandRow: bool(tp, 'bandRow'), bandCol: bool(tp, 'bandCol') };
      const sid = ch(tp, 'tableStyleId') ? ch(tp, 'tableStyleId').textContent.trim() : '';
      let style = null;
      if (tblStylesPart) style = chs(tblStylesPart.root, 'tblStyle').find((s) => at(s, 'styleId') === sid) || (!sid ? chs(tblStylesPart.root, 'tblStyle').find((s) => at(s, 'styleId') === at(tblStylesPart.root, 'def')) : null);
      const parts = (name) => (style ? ch(style, name) : null);
      const cols = chs(ch(tbl, 'tblGrid'), 'gridCol').map((g2) => num(g2, 'w', 0) * T.sx);
      const rows = chs(tbl, 'tr');
      const nR = rows.length, nC = cols.length;
      const fillOfStyle = (part0) => { const tcs = ch(part0, 'tcStyle'); if (!tcs) return undefined; const fl = ch(tcs, 'fill'); if (fl) return fillOf(fl, env); const fr = ch(tcs, 'fillRef'); if (fr) { const i = num(fr, 'idx', 0); const el2 = i > 0 ? theme.fill[i - 1] : null; return el2 ? readFill(el2, env, color(fr, cx), theme.part) : { t: 'none' }; } return undefined; };
      const bdrOfStyle = (part0, side) => { const tcs = ch(part0, 'tcStyle'); const bd = ch(tcs, 'tcBdr'); const s = ch(bd, side); if (!s) return undefined; const l = ch(s, 'ln'); if (l) return lineOf(l, env); const lr = ch(s, 'lnRef'); if (lr) { const i = num(lr, 'idx', 0); return i > 0 && theme.ln[i - 1] ? lineOf(theme.ln[i - 1], env, color(lr, cx)) : { none: true }; } return undefined; };
      const txOfStyle = (part0) => { const t = ch(part0, 'tcTxStyle'); if (!t) return {}; const o = {}; if (at(t, 'b') === 'on') o.b = true; if (at(t, 'b') === 'off') o.b = false; if (at(t, 'i') === 'on') o.i = true; const c = color(t, cx); if (c) o.c = c; const fr = ch(t, 'fontRef'); if (fr) { const c2 = color(fr, cx); if (c2 && !o.c) o.c = c2; } return o; };
      const BUILTIN = !style; // PowerPoint's default (Medium Style 2 – Accent 1) when the file has no table style part
      let html = '<table style="border-collapse:collapse;table-layout:fixed;width:' + px(cols.reduce((a, c) => a + c, 0)) + '"><colgroup>' + cols.map((c) => '<col style="width:' + px(c) + '">').join('') + '</colgroup>';
      rows.forEach((tr, ri) => {
        html += '<tr style="height:' + px(num(tr, 'h', 0) * T.sy) + '">';
        chs(tr, 'tc').forEach((tc, ci) => {
          if (bool(tc, 'hMerge') || bool(tc, 'vMerge')) return;
          const span = num(tc, 'gridSpan', 1), rspan = num(tc, 'rowSpan', 1);
          // style parts that apply, low → high
          const ap = ['wholeTbl'];
          if (flags.bandCol) ap.push(ci % 2 === (flags.firstCol ? 1 : 0) ? 'band1V' : 'band2V');
          if (flags.bandRow) { const rr = flags.firstRow ? ri - 1 : ri; if (!(flags.firstRow && ri === 0) && !(flags.lastRow && ri === nR - 1)) ap.push(rr % 2 === 0 ? 'band1H' : 'band2H'); }
          if (flags.lastCol && ci + span - 1 === nC - 1) ap.push('lastCol');
          if (flags.firstCol && ci === 0) ap.push('firstCol');
          if (flags.lastRow && ri === nR - 1) ap.push('lastRow');
          if (flags.firstRow && ri === 0) ap.push('firstRow');
          let fill, txs = {}; const bd = {};
          const isFirst = ri === 0, isLast = ri + rspan - 1 === nR - 1, isL = ci === 0, isR = ci + span - 1 === nC - 1;
          if (BUILTIN) {
            const acc = (t) => { const c = hexRgb(cx.scheme('accent1')); for (const kk of ['r', 'g', 'b']) c[kk] = toSrgb(toLin(c[kk]) * t + (1 - t)); return c; };
            fill = { t: 'solid', c: acc(flags.bandRow && !(flags.firstRow && isFirst) && ((flags.firstRow ? ri - 1 : ri) % 2 === 0) ? 0.4 : 0.2) };
            const white = { w: 12700, c: hexRgb(cx.scheme('lt1')) };
            bd.left = bd.right = bd.top = bd.bottom = white;
            txs.c = hexRgb(cx.scheme('dk1'));
            if ((flags.firstRow && isFirst) || (flags.lastRow && isLast) || (flags.firstCol && isL) || (flags.lastCol && isR)) { fill = { t: 'solid', c: hexRgb(cx.scheme('accent1')) }; txs = { b: true, c: hexRgb(cx.scheme('lt1')) }; }
            if (flags.firstRow && isFirst) bd.bottom = { w: 38100, c: hexRgb(cx.scheme('lt1')) };
          } else {
            for (const a of ap) {
              const p0 = parts(a); if (!p0) continue;
              const f = fillOfStyle(p0); if (f !== undefined) fill = f;
              txs = { ...txs, ...txOfStyle(p0) };
              const sides = { left: isL ? 'left' : 'insideV', right: isR ? 'right' : 'insideV', top: isFirst ? 'top' : 'insideH', bottom: isLast ? 'bottom' : 'insideH' };
              for (const [sd, nm] of Object.entries(sides)) { let v = bdrOfStyle(p0, nm); if (v === undefined && a !== 'wholeTbl') v = bdrOfStyle(p0, sd); if (v !== undefined) bd[sd] = v; }
            }
          }
          const tcPr = ch(tc, 'tcPr');
          const f2 = fillOf(tcPr, env); if (f2 !== undefined) fill = f2;
          for (const [sd, nm] of [['left', 'lnL'], ['right', 'lnR'], ['top', 'lnT'], ['bottom', 'lnB']]) { const l = ch(tcPr, nm); if (l) bd[sd] = lineOf(l, env); }
          const mar = (n, d) => num(tcPr, n, d) * k;
          const anchor = at(tcPr, 'anchor', 't');
          const bcss = Object.entries(bd).map(([sd, l]) => (l && !l.none && l.c ? ';border-' + sd + ':' + px(Math.max(0.5, (l.w || 12700) * k)) + ' ' + (l.dash && l.dash !== 'solid' ? 'dashed' : 'solid') + ' ' + css(l.c) : '')).join('');
          const bg = fill && fill.t === 'solid' ? ';background:' + css(fill.c) : fill && fill.t === 'grad' ? ';background:' + css(fill.stops[0].c) : '';
          const tb = ch(tc, 'txBody');
          let body = '';
          if (tb) {
            const r0 = renderParas(tb, env, { lsts: [defText, ch(tb, 'lstStyle')].filter(Boolean), baseR: { sz: 18, ...txs }, fontScale: 1 });
            body = r0.anyText ? r0.html : '';
          }
          html += '<td' + (span > 1 ? ' colspan="' + span + '"' : '') + (rspan > 1 ? ' rowspan="' + rspan + '"' : '') + ' style="padding:' + px(mar('marT', 45720)) + ' ' + px(mar('marR', 91440)) + ' ' + px(mar('marB', 45720)) + ' ' + px(mar('marL', 91440)) + ';vertical-align:' + (anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top') + bg + bcss + ';overflow:hidden">' + body + '</td>';
        });
        html += '</tr>';
      });
      return html + '</table>';
    };
    let T0 = { ox: 0, oy: 0, sx: k, sy: k };

    /* ---- background ---- */
    const bgOf = async () => {
      for (const pp of isLayoutPage ? [layout, master] : [slide, layout, master]) {
        const bg = pp && q(pp.root, 'cSld', 'bg'); if (!bg) continue;
        env.part = pp;
        const bp = ch(bg, 'bgPr');
        if (bp) { const f = fillOf(bp, env, null, pp); if (f) return { f, part: pp }; }
        const br = ch(bg, 'bgRef');
        if (br) { const i = num(br, 'idx', 0); const c = color(br, cx); const el2 = i >= 1001 ? theme.bg[i - 1001] : i > 0 ? theme.fill[i - 1] : null; if (el2) return { f: readFill(el2, env, c, theme.part), part: theme.part }; if (c) return { f: { t: 'solid', c } }; }
      }
      return { f: { t: 'solid', c: hexRgb(cx.scheme('bg1')) } };
    };
    const bgr = await bgOf();
    env.bgFill = bgr.f;
    let bgHtml = '';
    const sw = SW * k, sh = SH * k;
    let rootBg = '#ffffff';
    if (bgr.f.t === 'solid') rootBg = css(bgr.f.c);
    else if (bgr.f.t === 'grad') { rootBg = css(bgr.f.stops[bgr.f.stops.length - 1].c); bgHtml = drawShape({ prst: 'rect', adj: {} }, W, H, bgr.f, null, {}).replace('<svg ', '<svg data-bg-fill="1" '); }
    else if (bgr.f.t === 'img' && PIC_EXT_OK.test(bgr.f.path)) {
      const tile = bgr.f.tile;
      const tok = imgToken(bgr.f.path, srcRectOf(bgr.f.src), sw, sh, bgr.f.fx, !!tile);
      bgHtml = tile ? '<div data-bg-fill="1" style="position:absolute;left:0;top:0;width:1280px;height:720px;background-image:url(' + tok + ');background-repeat:repeat;background-size:wmtile(' + tok.slice(6) + ',' + r2(num(tile, 'sx', 100000) / 1e5) + ',' + r2(num(tile, 'sy', 100000) / 1e5) + ')"></div>'
        : '<img data-bg-fill="1" src="' + tok + '" alt="" style="position:absolute;left:0;top:0;width:1280px;height:720px;object-fit:cover">';
    }
    else if (bgr.f.t === 'patt') rootBg = css(bgr.f.bg);

    /* ---- shapes: master → layout → slide ---- */
    let shapes = '';
    const showM = isLayoutPage ? bool(layout.root, 'showMasterSp', true) : bool(slide.root, 'showMasterSp', true) && bool(layout && layout.root, 'showMasterSp', true);
    const showL = isLayoutPage ? true : bool(slide.root, 'showMasterSp', true);
    const tree = (pp) => q(pp.root, 'cSld', 'spTree');
    if (master && showM) for (const c of tree(master).children) shapes += await node(c, T0, 'master', master);
    if (layout && showL && !isLayoutPage) for (const c of tree(layout).children) shapes += await node(c, T0, 'layout', layout);
    for (const c of tree(slide).children) shapes += await node(c, T0, 'slide', slide);

    const letter = Math.abs(offX) > 0.5 || Math.abs(offY) > 0.5;
    const html = '<div data-my="pptx" data-keep-font="1" style="width:1280px;height:720px;position:relative;overflow:hidden;background:' + rootBg + ";color:#000000;font-family:'Noto Sans KR', sans-serif;line-height:1.2;letter-spacing:0;text-align:left;white-space:normal;font-size:18px\">"
      + bgHtml + (letter ? '<div style="position:absolute;left:' + px(offX) + ';top:' + px(offY) + ';width:' + px(sw) + ';height:' + px(sh) + '">' + shapes + '</div>' : shapes) + '</div>';
    // title · metadata
    const blocks = env.blocks.filter((x) => x.s);
    const wordy = (x) => x.s.length >= 4 && /[가-힣A-Za-z]{2}/.test(x.s);
    const tblock = blocks.find((x) => x.title && wordy(x)) || [...blocks].filter((x) => x.y < sh * 0.3 && wordy(x) && x.fs >= 14).sort((a, b) => b.fs - a.fs || a.y - b.y)[0]
      || [...blocks].filter(wordy).sort((a, b) => b.fs - a.fs)[0] || blocks[0];
    const pf = env.pics.reduce((a, v) => a + v, 0) / (sw * sh);
    out.push({
      n: si + 1, html, title: tblock ? tblock.s.slice(0, 60) : '', text: blocks.map((x) => x.s).join(' '), nT: blocks.length, nI: env.img, pf: Math.min(1, r2(pf)),
      hidden: !isLayoutPage && at(slide.root, 'show') === '0', layoutName: isLayoutPage ? at(q(slide.root, 'cSld'), 'name', '') : '',
    });
    if (onProgress) onProgress(si + 1, pages.length, 'slide');
    await new Promise((r) => setTimeout(r, 0));
  }

  /* ---- pictures: crop · resample to what the slide shows ---- */
  let done = 0;
  const missing = new Set();
  const dims = {};
  for (const j of jobs.values()) {
    try { const r = await pictureBlob(zip, j); images.set(j.token, r.blob); dims[j.token] = r; } catch (e) { missing.add(j.token); }
    done++; if (onProgress) onProgress(done, jobs.size, 'image');
  }
  // tiled pictures: their own size (96 dpi) on the slide × the tile scale
  const tw = (t, f, key) => { const d = dims[t]; const v = d && d[key] ? d[key] : 128; return v * 9525 * k * Number(f); };
  for (const s of out) s.html = s.html.replace(/wmtile\(([\w-]+),([\d.]+),([\d.]+)\)/g, (m, t, sx, sy) => px(tw(t, sx, 'nw')) + ' ' + px(tw(t, sy, 'nh')))
    .replace(/wmtw\(([\w-]+),([\d.]+)\)/g, (m, t, f) => String(r2(tw(t, f, 'nw')))).replace(/wmth\(([\w-]+),([\d.]+)\)/g, (m, t, f) => String(r2(tw(t, f, 'nh'))));
  if (missing.size) {
    warnings.add('그림 ' + missing.size + '개는 읽지 못해 빈 칸으로 두었어요');
    const ph = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="#eef0f4"/></svg>');
    for (const s of out) s.html = s.html.replace(/wmimg:([\w-]+)/g, (m, t) => (missing.has(t) ? ph : m));
  }
  return { slides: out, images, warnings: [...warnings], mode, size: { w: SW, h: SH }, ratio: SW / SH };
}

/** custGeom element → the same shape definition the preset evaluator reads */
function custDef(cg) {
  const d = { av: [], gd: [], p: [] };
  for (const g of chs(ch(cg, 'avLst'), 'gd')) d.av.push([at(g, 'name'), at(g, 'fmla')]);
  for (const g of chs(ch(cg, 'gdLst'), 'gd')) d.gd.push([at(g, 'name'), at(g, 'fmla')]);
  const r = ch(cg, 'rect'); if (r) d.r = [at(r, 'l', 'l'), at(r, 't', 't'), at(r, 'r', 'r'), at(r, 'b', 'b')];
  for (const p of chs(ch(cg, 'pathLst'), 'path')) {
    const o = { c: [] };
    if (p.hasAttribute('w')) o.w = Number(at(p, 'w')); if (p.hasAttribute('h')) o.h = Number(at(p, 'h'));
    if (at(p, 'fill') && at(p, 'fill') !== 'norm') o.f = at(p, 'fill');
    if (at(p, 'stroke') === '0' || at(p, 'stroke') === 'false') o.s = 0;
    const pt = (e) => [at(e, 'x', '0'), at(e, 'y', '0')];
    for (const c of p.children) {
      const t = c.localName;
      if (t === 'moveTo') o.c.push(['M', ...pt(ch(c, 'pt'))]);
      else if (t === 'lnTo') o.c.push(['L', ...pt(ch(c, 'pt'))]);
      else if (t === 'arcTo') o.c.push(['A', at(c, 'wR', '0'), at(c, 'hR', '0'), at(c, 'stAng', '0'), at(c, 'swAng', '0')]);
      else if (t === 'quadBezTo') { const ps = chs(c, 'pt'); o.c.push(['Q', ...pt(ps[0]), ...pt(ps[1])]); }
      else if (t === 'cubicBezTo') { const ps = chs(c, 'pt'); o.c.push(['C', ...pt(ps[0]), ...pt(ps[1]), ...pt(ps[2])]); }
      else if (t === 'close') o.c.push(['Z']);
    }
    d.p.push(o);
  }
  return d;
}

/** the picture as the slide shows it: cropped (srcRect, may reach outside = padding), no bigger than ~2.5× its size on the slide */
async function pictureBlob(zip, j) {
  const f = zip.file(j.path); if (!f) throw new Error('missing');
  const ext = (j.path.split('.').pop() || '').toLowerCase();
  const raw = await f.async('uint8array');
  const blob = new Blob([raw], { type: MIME[ext] || 'application/octet-stream' });
  if (!RASTER.test(j.path) || typeof createImageBitmap === 'undefined') return { blob }; // svg: as it is
  const bmp = await createImageBitmap(blob);
  const iw = bmp.width, ih = bmp.height;
  if (j.tile) { // a tile keeps its own pixels (only effects)
    if (!j.fx) { bmp.close && bmp.close(); return { blob, nw: iw, nh: ih }; }
    const cv = document.createElement('canvas'); cv.width = iw; cv.height = ih; const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0); bmp.close && bmp.close();
    pixelFx(g, iw, ih, j.fx);
    return { blob: await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), ext === 'png' ? 'image/png' : 'image/jpeg', 0.9)), nw: iw, nh: ih };
  }
  const c = j.crop || { l: 0, t: 0, r: 0, b: 0 };
  const sx = iw * c.l, sy = ih * c.t, sw = iw * (1 - c.l - c.r), sh = ih * (1 - c.t - c.b);
  const maxW = Math.max(64, Math.min(2560, Math.round(j.w * 2.5))), maxH = Math.max(64, Math.min(2560, Math.round(j.h * 2.5)));
  // output size: the crop's own pixels, scaled down to the cap; aspect = the box (the picture is stretched to it)
  const boxAsp = j.w > 0 && j.h > 0 ? j.w / j.h : sw / sh;
  let ow = Math.abs(sw), oh = Math.abs(sw) / boxAsp;
  if (oh > Math.abs(sh) * 1.02) { oh = Math.abs(sh); ow = oh * boxAsp; }
  const sc = Math.min(1, maxW / ow, maxH / oh);
  ow = Math.max(1, Math.round(ow * sc)); oh = Math.max(1, Math.round(oh * sc));
  const needsWork = j.crop || j.fx || sc < 0.999 || Math.abs((iw / ih) - boxAsp) > 0.02;
  if (!needsWork && raw.length < 1.5e6) { bmp.close && bmp.close(); return { blob, nw: iw, nh: ih }; }
  const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  // a negative crop (picture smaller than its frame) leaves transparent margins
  const dx = sx < 0 ? (-sx / sw) * ow : 0, dy = sy < 0 ? (-sy / sh) * oh : 0;
  const csx = Math.max(0, sx), csy = Math.max(0, sy), csw = Math.min(iw, sx + sw) - csx, csh = Math.min(ih, sy + sh) - csy;
  if (csw > 0 && csh > 0) g.drawImage(bmp, csx, csy, csw, csh, dx, dy, (csw / sw) * ow, (csh / sh) * oh);
  bmp.close && bmp.close();
  if (j.fx) pixelFx(g, ow, oh, j.fx);
  const png = ext === 'png' || ext === 'gif' || (sx < 0 || sy < 0);
  const out = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), png ? 'image/png' : 'image/jpeg', 0.9));
  return { blob: out, nw: iw, nh: ih };
}
function pixelFx(g, w, h, fx) {
  const d = g.getImageData(0, 0, w, h); const a = d.data;
  const c1 = fx.duo ? fx.duo[0] : null, c2 = fx.duo ? fx.duo[1] : null;
  for (let i = 0; i < a.length; i += 4) {
    const L = (0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]) / 255;
    if (c1) { a[i] = 255 * (c1.r + (c2.r - c1.r) * L); a[i + 1] = 255 * (c1.g + (c2.g - c1.g) * L); a[i + 2] = 255 * (c1.b + (c2.b - c1.b) * L); }
    else if (fx.gray) { a[i] = a[i + 1] = a[i + 2] = L * 255; }
  }
  g.putImageData(d, 0, 0);
}
