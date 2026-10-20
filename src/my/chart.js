// DrawingML chart part → one SVG (bar · column · line · area · pie · doughnut · scatter, clustered / stacked / 100%),
// with title, legend, axes, gridlines and data labels — drawn from the cached values the file carries.
// It is a picture of the chart (the template keeps the look); the numbers are not editable as a chart.

export function renderChart(cp, H) {
  const { w, h, k, css, color, esc, ch, chs, q, at, num } = H;
  const root = cp.root;
  const chart = ch(root, 'chart');
  const plot = ch(chart, 'plotArea');
  const r2 = (n) => Math.round(n * 100) / 100;
  const pt2px = (pt) => pt * 12700 * k;
  const fontFam = "'Noto Sans KR', sans-serif";
  // default text size · colour of the chart (txPr)
  const defR = q(root, 'txPr', 'p', 'pPr', 'defRPr');
  const baseSz = num(defR, 'sz', 1000) / 100;
  const baseC = color(ch(defR, 'solidFill')) || { r: 0.35, g: 0.35, b: 0.35, a: 1 };
  const txSz = (el, d) => { const r = q(el, 'txPr', 'p', 'pPr', 'defRPr'); return pt2px((r && r.hasAttribute('sz') ? num(r, 'sz', 1000) : d * 100) / 100); };
  const txC = (el) => { const r = q(el, 'txPr', 'p', 'pPr', 'defRPr'); const c = r && color(ch(r, 'solidFill')); return css(c || baseC); };
  const accents = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'];
  const hex = (s) => { const n = parseInt(s || '000000', 16) || 0; return { r: (n >> 16) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 }; };
  const autoColor = (i) => {
    const c = hex(H.cx.scheme(accents[i % 6]));
    const round = Math.floor(i / 6);
    if (!round) return c;
    const f = round % 2 ? 0.6 : 1.4; // later rounds: darker / lighter
    return { r: Math.min(1, c.r * f), g: Math.min(1, c.g * f), b: Math.min(1, c.b * f), a: 1 };
  };
  const spFill = (spPr) => { if (!spPr) return null; const f = H.fill(spPr); return f && f.t === 'solid' ? f.c : f && f.t === 'grad' ? f.stops[0].c : f && f.t === 'none' ? 'none' : null; };
  const spLine = (spPr) => { if (!spPr) return null; const l = H.line(ch(spPr, 'ln')); return l; };
  const strs = (el) => {
    if (!el) return [];
    const c = q(el, 'strRef', 'strCache') || q(el, 'numRef', 'numCache') || ch(el, 'strLit') || ch(el, 'numLit') || q(el, 'multiLvlStrRef', 'multiLvlStrCache', 'lvl');
    if (!c) return [];
    const n = num(ch(c, 'ptCount'), 'val', 0); const a = new Array(n).fill('');
    for (const p of chs(c, 'pt')) a[num(p, 'idx', 0)] = (ch(p, 'v') || { textContent: '' }).textContent;
    return a;
  };
  const nums = (el) => strs(el).map((v) => (v === '' ? null : Number(v)));
  const fmtOf = (el) => { const c = q(el, 'numRef', 'numCache'); const f = c && ch(c, 'formatCode'); return f ? f.textContent : 'General'; };
  const fmt = (v, code) => {
    if (v == null || !isFinite(v)) return '';
    code = code || 'General';
    const pct = /%/.test(code);
    const x = pct ? v * 100 : v;
    const m = /0\.(0+)/.exec(code); const dec = m ? m[1].length : (code === 'General' ? (Math.abs(x) < 10 && x % 1 ? 1 : 0) : 0);
    let s = x.toFixed(dec);
    if (/#,##0|,/.test(code) || (code === 'General' && Math.abs(x) >= 10000)) { const [a, b] = s.split('.'); s = a.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (b ? '.' + b : ''); }
    return s + (pct ? '%' : '');
  };
  const textOfRich = (el) => { const rich = q(el, 'tx', 'rich'); if (!rich) return ''; return chs(rich, 'p').map((p) => Array.from(p.getElementsByTagNameNS('*', 't')).map((t) => t.textContent).join('')).join(' '); };

  // ---- series of every chart type in the plot area ----
  const TYPES = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'areaChart', 'area3DChart', 'pieChart', 'pie3DChart', 'doughnutChart', 'ofPieChart', 'scatterChart', 'radarChart', 'bubbleChart'];
  const groups = [];
  let sIdx = 0;
  for (const t of TYPES) for (const g of chs(plot, t)) {
    const kind = /^bar/.test(t) ? 'bar' : /^line/.test(t) || t === 'radarChart' ? 'line' : /^area/.test(t) ? 'area' : /pie|doughnut/i.test(t) ? 'pie' : 'scatter';
    const series = chs(g, 'ser').map((s) => {
      const i = num(ch(s, 'idx'), 'val', sIdx);
      const o = { name: strs(ch(s, 'tx'))[0] || (q(s, 'tx', 'v') ? q(s, 'tx', 'v').textContent : '계열 ' + (sIdx + 1)), cats: strs(ch(s, 'cat')), vals: nums(ch(s, 'val') || ch(s, 'yVal')), xs: nums(ch(s, 'xVal')), fmt: fmtOf(ch(s, 'val') || ch(s, 'yVal')) };
      const f = spFill(ch(s, 'spPr')); o.c = f && f !== 'none' ? f : autoColor(i);
      const l = spLine(ch(s, 'spPr')); o.lc = l && !l.none && l.c ? l.c : o.c; o.lw = l && l.w ? l.w * k : pt2px(2.25);
      o.noLine = l && l.none;
      const mk = q(s, 'marker', 'symbol'); o.marker = mk ? at(mk, 'val') !== 'none' : kind === 'line' && !/Chart$/.test('') ;
      if (kind === 'line') o.marker = mk ? at(mk, 'val') !== 'none' : false;
      o.dpt = {}; for (const d of chs(s, 'dPt')) { const c = spFill(ch(d, 'spPr')); if (c && c !== 'none') o.dpt[num(ch(d, 'idx'), 'val', 0)] = c; }
      const dl = ch(s, 'dLbls') || ch(g, 'dLbls');
      o.labels = dl && at(ch(dl, 'showVal'), 'val') === '1' ? 'val' : dl && at(ch(dl, 'showPercent'), 'val') === '1' ? 'pct' : '';
      o.labelSz = dl ? txSz(dl, baseSz) : pt2px(baseSz); o.labelC = dl ? txC(dl) : css(baseC);
      sIdx++;
      return o;
    });
    groups.push({ t, kind, el: g, series, dir: at(ch(g, 'barDir'), 'val', 'col'), grouping: at(ch(g, 'grouping'), 'val', kind === 'bar' ? 'clustered' : 'standard'), vary: at(ch(g, 'varyColors'), 'val') === '1', gap: num(ch(g, 'gapWidth'), 'val', 150) / 100, overlap: num(ch(g, 'overlap'), 'val', 0) / 100, hole: num(ch(g, 'holeSize'), 'val', t === 'doughnutChart' ? 50 : 0) / 100, first: num(ch(g, 'firstSliceAng'), 'val', 0) });
  }
  if (!groups.length) throw new Error('no chart');
  // ---- chart area ----
  const bgF = spFill(ch(root, 'spPr'));
  const bgL = spLine(ch(root, 'spPr'));
  let svg = '';
  if (bgF && bgF !== 'none') svg += '<rect width="' + r2(w) + '" height="' + r2(h) + '" fill="' + css(bgF) + '"/>';
  if (bgL && !bgL.none && bgL.c) svg += '<rect x="0.5" y="0.5" width="' + r2(w - 1) + '" height="' + r2(h - 1) + '" fill="none" stroke="' + css(bgL.c) + '"/>';
  const pad = Math.max(6, Math.min(w, h) * 0.04);
  let top = pad, bottom = h - pad, left = pad, right = w - pad;
  // title
  const titleEl = ch(chart, 'title');
  const deleted = at(ch(chart, 'autoTitleDeleted'), 'val') === '1';
  let title = titleEl ? textOfRich(titleEl) : '';
  const allSeries = groups.flatMap((g) => g.series);
  if (titleEl && !title && allSeries.length === 1) title = allSeries[0].name;
  if (title && !deleted || (title && titleEl)) {
    const tr = q(titleEl, 'tx', 'rich', 'p', 'pPr', 'defRPr') || q(titleEl, 'txPr', 'p', 'pPr', 'defRPr');
    const tsz = tr && tr.hasAttribute('sz') ? pt2px(num(tr, 'sz', 1400) / 100) : pt2px(baseSz * 1.2);
    const tb = !tr || !tr.hasAttribute('b') || at(tr, 'b') === '1';
    svg += '<text x="' + r2(w / 2) + '" y="' + r2(top + tsz) + '" text-anchor="middle" font-size="' + r2(tsz) + '"' + (tb ? ' font-weight="700"' : '') + ' fill="' + css(color(ch(tr, 'solidFill')) || baseC) + '" font-family="' + fontFam + '">' + esc(title) + '</text>';
    top += tsz * 1.6;
  }
  // legend
  const leg = ch(chart, 'legend');
  const pie = groups[0].kind === 'pie';
  const legItems = pie ? (groups[0].series[0] ? groups[0].series[0].cats.map((c, i) => ({ name: c, c: groups[0].series[0].dpt[i] || autoColor(i) })) : []) : allSeries.map((s) => ({ name: s.name, c: s.c, line: groups.find((g) => g.series.includes(s)).kind === 'line' }));
  if (leg && legItems.length) {
    const pos = at(ch(leg, 'legendPos'), 'val', 'r');
    const lsz = txSz(leg, baseSz);
    const lc = txC(leg);
    const item = (x, y, it) => (it.line ? '<line x1="' + r2(x) + '" y1="' + r2(y - lsz * 0.35) + '" x2="' + r2(x + lsz * 1.2) + '" y2="' + r2(y - lsz * 0.35) + '" stroke="' + css(it.c) + '" stroke-width="' + r2(Math.max(1.5, lsz * 0.18)) + '"/>' : '<rect x="' + r2(x) + '" y="' + r2(y - lsz * 0.75) + '" width="' + r2(lsz * 0.7) + '" height="' + r2(lsz * 0.7) + '" fill="' + css(it.c) + '"/>')
      + '<text x="' + r2(x + lsz * (it.line ? 1.5 : 1)) + '" y="' + r2(y) + '" font-size="' + r2(lsz) + '" fill="' + lc + '" font-family="' + fontFam + '">' + esc(it.name) + '</text>';
    const tw = (s) => String(s).length * lsz * 0.62 + lsz * 2.2;
    if (pos === 'r' || pos === 'l') {
      const lw = Math.min(w * 0.35, Math.max(...legItems.map((it) => tw(it.name))));
      const lx = pos === 'r' ? right - lw : left;
      const y0 = (top + bottom) / 2 - (legItems.length * lsz * 1.5) / 2 + lsz;
      legItems.forEach((it, i) => { svg += item(lx, y0 + i * lsz * 1.5, it); });
      if (pos === 'r') right -= lw + pad; else left += lw + pad;
    } else {
      const total = legItems.reduce((a, it) => a + tw(it.name), 0);
      let x = Math.max(left, (w - total) / 2);
      const y = pos === 't' ? top + lsz : bottom - lsz * 0.3;
      legItems.forEach((it) => { svg += item(x, y, it); x += tw(it.name); });
      if (pos === 't') top += lsz * 1.8; else bottom -= lsz * 1.8;
    }
  }
  // ---- pie · doughnut ----
  if (pie) {
    const g = groups[0]; const s = g.series[0];
    const vals = s ? s.vals.map((v) => Math.max(0, v || 0)) : [];
    const sum = vals.reduce((a, v) => a + v, 0) || 1;
    const R = Math.max(4, Math.min(right - left, bottom - top) / 2), cx0 = (left + right) / 2, cy0 = (top + bottom) / 2;
    let a0 = (g.first - 90) * Math.PI / 180;
    vals.forEach((v, i) => {
      const a1 = a0 + (v / sum) * Math.PI * 2;
      const c = s.dpt[i] || autoColor(i);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a, r) => r2(cx0 + Math.cos(a) * r) + ' ' + r2(cy0 + Math.sin(a) * r);
      const ri = R * g.hole;
      const d = v >= sum ? (g.hole ? 'M' + p(0, R) + 'A' + R + ' ' + R + ' 0 1 1 ' + p(Math.PI, R) + 'A' + R + ' ' + R + ' 0 1 1 ' + p(0, R) + 'M' + p(0, ri) + 'A' + ri + ' ' + ri + ' 0 1 0 ' + p(Math.PI, ri) + 'A' + ri + ' ' + ri + ' 0 1 0 ' + p(0, ri) + 'Z' : 'M' + p(0, R) + 'A' + R + ' ' + R + ' 0 1 1 ' + p(Math.PI, R) + 'A' + R + ' ' + R + ' 0 1 1 ' + p(0, R) + 'Z')
        : g.hole ? 'M' + p(a0, R) + 'A' + r2(R) + ' ' + r2(R) + ' 0 ' + large + ' 1 ' + p(a1, R) + 'L' + p(a1, ri) + 'A' + r2(ri) + ' ' + r2(ri) + ' 0 ' + large + ' 0 ' + p(a0, ri) + 'Z'
          : 'M' + r2(cx0) + ' ' + r2(cy0) + 'L' + p(a0, R) + 'A' + r2(R) + ' ' + r2(R) + ' 0 ' + large + ' 1 ' + p(a1, R) + 'Z';
      svg += '<path d="' + d + '" fill="' + css(c) + '" stroke="#ffffff" stroke-width="' + r2(Math.max(1, R * 0.01)) + '" fill-rule="evenodd"/>';
      if (s.labels && v > 0) {
        const am = (a0 + a1) / 2, rr = g.hole ? (R + ri) / 2 : R * 0.65;
        const tx = s.labels === 'pct' ? Math.round((v / sum) * 100) + '%' : fmt(s.vals[i], s.fmt);
        svg += '<text x="' + r2(cx0 + Math.cos(am) * rr) + '" y="' + r2(cy0 + Math.sin(am) * rr + s.labelSz * 0.35) + '" text-anchor="middle" font-size="' + r2(s.labelSz) + '" fill="#ffffff" font-family="' + fontFam + '">' + esc(tx) + '</text>';
      }
      a0 = a1;
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(w) + '" height="' + r2(h) + '" style="position:absolute;left:0;top:0;overflow:visible">' + svg + '</svg>';
  }
  // ---- axes ----
  const catAx = ch(plot, 'catAx') || ch(plot, 'dateAx');
  const valAxes = chs(plot, 'valAx');
  const valAx = valAxes.find((a) => at(ch(a, 'axPos'), 'val') !== 'b' && at(ch(a, 'axPos'), 'val') !== 't') || valAxes[0];
  const horiz = groups.some((g) => g.kind === 'bar' && g.dir === 'bar');
  const cats = (allSeries.find((s) => s.cats.length) || { cats: [] }).cats;
  const nCat = Math.max(cats.length, ...allSeries.map((s) => s.vals.length), 1);
  // value range (stacked groups sum)
  let lo = 0, hi = 0;
  for (const g of groups) {
    if (g.kind === 'scatter') continue;
    if (/stacked/i.test(g.grouping)) {
      for (let i = 0; i < nCat; i++) {
        let p = 0, n = 0;
        for (const s of g.series) { const v = s.vals[i] || 0; if (v >= 0) p += v; else n += v; }
        if (g.grouping === 'percentStacked') { hi = Math.max(hi, 1); } else { hi = Math.max(hi, p); lo = Math.min(lo, n); }
      }
    } else for (const s of g.series) for (const v of s.vals) if (v != null) { hi = Math.max(hi, v); lo = Math.min(lo, v); }
  }
  const scl = valAx ? ch(valAx, 'scaling') : null;
  if (scl && ch(scl, 'max')) hi = num(ch(scl, 'max'), 'val', hi);
  if (scl && ch(scl, 'min')) lo = num(ch(scl, 'min'), 'val', lo);
  if (hi === lo) hi = lo + 1;
  const autoMax = !(scl && ch(scl, 'max')) && !groups.some((g) => g.grouping === 'percentStacked');
  if (autoMax && hi > 0) hi += (hi - lo) * 0.05;
  if (!(scl && ch(scl, 'min')) && lo < 0) lo -= (hi - lo) * 0.05;
  const span = hi - lo;
  const step0 = span / Math.max(4, Math.min(10, (horiz ? (right - left) : (bottom - top)) * 0.85 / 40)); // about one major unit per 40px, like Office
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || mag * 10;
  const vmin = scl && ch(scl, 'min') ? lo : Math.floor(lo / step) * step, vmax = scl && ch(scl, 'max') ? hi : Math.ceil(hi / step) * step;
  const axSz = valAx ? txSz(valAx, baseSz) : pt2px(baseSz);
  const catSz = catAx ? txSz(catAx, baseSz) : pt2px(baseSz);
  const vFmt = valAx && ch(valAx, 'numFmt') ? at(ch(valAx, 'numFmt'), 'formatCode', 'General') : (groups.some((g) => g.grouping === 'percentStacked') ? '0%' : (allSeries[0] || {}).fmt);
  const valDel = !valAx || at(ch(valAx, 'delete'), 'val') === '1';
  const catDel = !catAx || at(ch(catAx, 'delete'), 'val') === '1';
  const ticks = []; for (let v = vmin; v <= vmax + step * 0.001; v += step) ticks.push(Math.round(v / step) * step);
  const labW = valDel ? 0 : Math.max(...ticks.map((t) => fmt(t, vFmt).length)) * axSz * 0.6 + axSz * 0.6;
  if (!horiz) { left += labW; if (!catDel) bottom -= catSz * (1.8 + (allSeries.some((s) => s.cats.some((c) => String(c).length * catSz * 0.6 > ((right - left - labW) / Math.max(1, s.cats.length)) * 0.96 && /\s/.test(String(c)))) ? 1.2 : 0)); }
  else { if (!catDel) left += Math.min((right - left) * 0.35, Math.max(...cats.map((c) => String(c).length), 1) * catSz * 0.62 + catSz); if (!valDel) bottom -= axSz * 1.8; }
  const pw = Math.max(1, right - left), ph = Math.max(1, bottom - top);
  const V = (v) => (horiz ? left + ((v - vmin) / (vmax - vmin)) * pw : bottom - ((v - vmin) / (vmax - vmin)) * ph);
  const gridEl = valAx && ch(valAx, 'majorGridlines');
  const gridL = gridEl ? spLine(ch(gridEl, 'spPr')) : null;
  const gridC = gridL && gridL.c ? css(gridL.c) : '#d9d9d9';
  const lc = valAx ? txC(valAx) : css(baseC);
  for (const t of ticks) {
    const p = V(t);
    if (gridEl) svg += horiz ? '<line x1="' + r2(p) + '" y1="' + r2(top) + '" x2="' + r2(p) + '" y2="' + r2(bottom) + '" stroke="' + gridC + '" stroke-width="1"/>' : '<line x1="' + r2(left) + '" y1="' + r2(p) + '" x2="' + r2(right) + '" y2="' + r2(p) + '" stroke="' + gridC + '" stroke-width="1"/>';
    if (!valDel) svg += horiz ? '<text x="' + r2(p) + '" y="' + r2(bottom + axSz * 1.3) + '" text-anchor="middle" font-size="' + r2(axSz) + '" fill="' + lc + '" font-family="' + fontFam + '">' + esc(fmt(t, vFmt)) + '</text>'
      : '<text x="' + r2(left - axSz * 0.4) + '" y="' + r2(p + axSz * 0.35) + '" text-anchor="end" font-size="' + r2(axSz) + '" fill="' + lc + '" font-family="' + fontFam + '">' + esc(fmt(t, vFmt)) + '</text>';
  }
  const band = (horiz ? ph : pw) / nCat;
  const C = (i) => (horiz ? bottom - band * (i + 0.5) : left + band * (i + 0.5));
  // category axis line + labels
  const cl = catAx ? spLine(ch(catAx, 'spPr')) : null;
  const zero = V(Math.max(vmin, Math.min(vmax, 0)));
  svg += horiz ? '<line x1="' + r2(zero) + '" y1="' + r2(top) + '" x2="' + r2(zero) + '" y2="' + r2(bottom) + '" stroke="' + (cl && cl.c ? css(cl.c) : '#bfbfbf') + '" stroke-width="1"/>' : '<line x1="' + r2(left) + '" y1="' + r2(zero) + '" x2="' + r2(right) + '" y2="' + r2(zero) + '" stroke="' + (cl && cl.c ? css(cl.c) : '#bfbfbf') + '" stroke-width="1"/>';
  if (!catDel) {
    const cc = catAx ? txC(catAx) : css(baseC);
    const tw = (t) => Array.from(String(t)).reduce((a, chr) => a + (/[\u1100-\uffff]/.test(chr) ? 1 : 0.58), 0) * catSz;
    const lines = (t) => { const s0 = String(t); if (horiz || tw(s0) <= band * 0.96) return [s0]; const ws = s0.split(/\s+/); if (ws.length < 2) return [s0]; let best = [s0]; for (let i = 1; i < ws.length; i++) { const a = ws.slice(0, i).join(' '), b = ws.slice(i).join(' '); if (Math.max(tw(a), tw(b)) < Math.max(...best.map(tw))) best = [a, b]; } return best; };
    const L = cats.map(lines);
    const every = horiz ? 1 : Math.max(1, Math.ceil(Math.max(...L.map((l) => Math.max(...l.map(tw))), 1) / Math.max(1, band * 0.96)));
    cats.forEach((c, i) => {
      if (!horiz && i % every) return;
      svg += horiz ? '<text x="' + r2(left - catSz * 0.4) + '" y="' + r2(C(i) + catSz * 0.35) + '" text-anchor="end" font-size="' + r2(catSz) + '" fill="' + cc + '" font-family="' + fontFam + '">' + esc(c) + '</text>'
        : L[i].map((ln, j) => '<text x="' + r2(C(i)) + '" y="' + r2(bottom + catSz * (1.3 + j * 1.2)) + '" text-anchor="middle" font-size="' + r2(catSz) + '" fill="' + cc + '" font-family="' + fontFam + '">' + esc(ln) + '</text>').join('');
    });
  }
  // ---- series ----
  const label = (x, y, t, s, anchor = 'middle') => '<text x="' + r2(x) + '" y="' + r2(y) + '" text-anchor="' + anchor + '" font-size="' + r2(s.labelSz) + '" fill="' + s.labelC + '" font-family="' + fontFam + '">' + esc(t) + '</text>';
  for (const g of groups) {
    const S = g.series;
    if (g.kind === 'bar') {
      const stacked = /stacked/i.test(g.grouping), pct = g.grouping === 'percentStacked';
      const nS = stacked ? 1 : S.length;
      const ov = stacked ? 1 : Math.max(-1, Math.min(1, g.overlap));
      const bw = band / (nS - (nS - 1) * ov + g.gap); // bar thickness
      const groupW = bw * (nS - (nS - 1) * ov);
      for (let i = 0; i < nCat; i++) {
        let pos = 0, neg = 0;
        const tot = pct ? S.reduce((a, s) => a + Math.abs(s.vals[i] || 0), 0) || 1 : 1;
        S.forEach((s, j) => {
          let v = s.vals[i]; if (v == null) return; if (pct) v = v / tot;
          let a, b;
          if (stacked) { if (v >= 0) { a = pos; b = pos + v; pos = b; } else { a = neg; b = neg + v; neg = b; } } else { a = 0; b = v; }
          const off = horiz ? C(i) + groupW / 2 - bw - (stacked ? 0 : j * bw * (1 - ov)) : C(i) - groupW / 2 + (stacked ? 0 : j * bw * (1 - ov));
          const p1 = V(a), p2 = V(b);
          const c = (g.vary && S.length === 1 ? s.dpt[i] || autoColor(i) : s.dpt[i] || s.c);
          svg += horiz ? '<rect x="' + r2(Math.min(p1, p2)) + '" y="' + r2(off) + '" width="' + r2(Math.abs(p2 - p1)) + '" height="' + r2(bw) + '" fill="' + css(c) + '"/>'
            : '<rect x="' + r2(off) + '" y="' + r2(Math.min(p1, p2)) + '" width="' + r2(bw) + '" height="' + r2(Math.abs(p2 - p1)) + '" fill="' + css(c) + '"/>';
          if (s.labels) {
            const t = fmt(pct ? v : s.vals[i], pct ? '0%' : s.fmt);
            svg += horiz ? label(stacked ? (p1 + p2) / 2 : p2 + s.labelSz * 0.3, off + bw / 2 + s.labelSz * 0.35, t, s, stacked ? 'middle' : 'start') : label(off + bw / 2, stacked ? (p1 + p2) / 2 + s.labelSz * 0.35 : Math.min(p1, p2) - s.labelSz * 0.3, t, s);
          }
        });
      }
    } else if (g.kind === 'line' || g.kind === 'area') {
      const stacked = /stacked/i.test(g.grouping);
      const acc = new Array(nCat).fill(0);
      S.forEach((s) => {
        const pts = [];
        for (let i = 0; i < nCat; i++) { const v = s.vals[i]; if (v == null) continue; const y = stacked ? acc[i] + v : v; if (stacked) acc[i] = y; pts.push([C(i), V(y), v]); }
        if (!pts.length) return;
        const d = pts.map((p, i) => (i ? 'L' : 'M') + r2(p[0]) + ' ' + r2(p[1])).join('');
        if (g.kind === 'area') svg += '<path d="' + d + 'L' + r2(pts[pts.length - 1][0]) + ' ' + r2(zero) + 'L' + r2(pts[0][0]) + ' ' + r2(zero) + 'Z" fill="' + css(s.c) + '" fill-opacity="0.85"/>';
        else if (!s.noLine) svg += '<path d="' + d + '" fill="none" stroke="' + css(s.lc) + '" stroke-width="' + r2(s.lw) + '" stroke-linejoin="round" stroke-linecap="round"/>';
        if (s.marker) for (const p of pts) svg += '<circle cx="' + r2(p[0]) + '" cy="' + r2(p[1]) + '" r="' + r2(Math.max(2, s.lw * 1.4)) + '" fill="' + css(s.c) + '"/>';
        if (s.labels) for (const p of pts) svg += label(p[0], p[1] - s.labelSz * 0.6, fmt(p[2], s.fmt), s);
      });
    } else if (g.kind === 'scatter') {
      const xs = S.flatMap((s) => s.xs.filter((v) => v != null));
      const xmin = Math.min(...xs, 0), xmax = Math.max(...xs, 1);
      S.forEach((s) => {
        s.vals.forEach((v, i) => { if (v == null) return; const x = s.xs[i] != null ? left + ((s.xs[i] - xmin) / ((xmax - xmin) || 1)) * pw : C(i); svg += '<circle cx="' + r2(x) + '" cy="' + r2(V(v)) + '" r="' + r2(Math.max(2.5, pt2px(3))) + '" fill="' + css(s.c) + '"/>'; });
      });
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + r2(w) + '" height="' + r2(h) + '" style="position:absolute;left:0;top:0;overflow:visible">' + svg + '</svg>';
}
