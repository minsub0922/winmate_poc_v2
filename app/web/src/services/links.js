import { fetchResource } from '../api/client.js';
import { browserStorage } from '../repositories/browser.js';
/* Winmate · 링크 태그 (window.__wmLink)
 * 요구사항 입력칸(MentionEditor, contentEditable)에 링크를 붙여 넣으면 @태그와 같은 칩(링크 아이콘 + 작은 썸네일 + 제목 · 사이트)으로 바꾼다.
 * 세그먼트 형식: { t: url, link: { title, site, img, ref, desc } } — t에 URL이 그대로 있어 다른 코드(reqText · AI 프롬프트)는 평범한 글처럼 읽는다.
 * 메타데이터: ① 앱 제품 DB(samsung.com 주소 · 모델 코드) → 그 제품 · 유관사례로 연결 ② api.microlink.io (네트워크가 막히면 건너뜀) ③ 주소에서 사이트 · 제목 추론.
 * 의존: linkDependencies.tag() → { info, thumb, short, title }, linkDependencies.data() → { P, S, C } (번들 패치 · common.jsx가 넣음). 없으면 ①을 건너뜀. */
const linkDependencies = {};
export const configureLinkTags = deps => Object.assign(linkDependencies, deps);
export const linkTags = (function () {
  var URL_RX = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+\.[^\s<>"'`]+)/gi;
  var TRAIL = /[.,;:!?)\]}'"’”]+$/;
  var KEY = 'wm-linkmeta-v1';
  var mem = {};
  try { mem = JSON.parse(browserStorage.getItem(KEY) || '{}') || {}; } catch (e) { mem = {}; }
  var save = function () { try { var ks = Object.keys(mem); if (ks.length > 300) ks.slice(0, ks.length - 300).forEach(function (k) { delete mem[k]; }); browserStorage.setItem(KEY, JSON.stringify(mem)); } catch (e) {} };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var full = function (u) { return /^https?:\/\//i.test(u) ? u : 'https://' + u; };
  var norm = function (u) { try { var x = new URL(full(u)); return (x.hostname.replace(/^www\./, '') + x.pathname).replace(/\/+$/, '').toLowerCase(); } catch (e) { return String(u).toLowerCase(); } };
  var host = function (u) { try { return new URL(full(u)).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  var SITES = [[/(^|\.)news\.samsung\.com$/, 'Samsung Newsroom'], [/(^|\.)samsung\.com$/, 'Samsung'], [/(^|\.)semiconductor\.samsung\.com$/, 'Samsung 반도체'], [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YouTube'], [/(^|\.)naver\.com$/, '네이버'], [/(^|\.)daum\.net$/, '다음'], [/(^|\.)kakao\.com$/, '카카오'], [/(^|\.)google\.com$/, 'Google'], [/(^|\.)linkedin\.com$/, 'LinkedIn'], [/(^|\.)notion\.(so|site)$/, 'Notion'], [/(^|\.)github\.com$/, 'GitHub'], [/(^|\.)go\.kr$/, '정부 · 공공기관'], [/(^|\.)or\.kr$/, '기관']];
  var siteOf = function (u) { var h = host(u); for (var i = 0; i < SITES.length; i++) if (SITES[i][0].test(h)) return SITES[i][1]; return h; };
  var ytId = function (u) { var m = String(u).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/); return m ? m[1] : null; };
  // 메타데이터를 못 받을 때(아티팩트 네트워크 정책 등) 주소만으로 읽을 만한 제목을 만든다
  var GENERIC = /^(article(view|s|_view)?|view|index|main|detail|details|read|news|board|bbs|post|posts|watch|list|page|pages|default|home|content|contents|kr|ko|en|sec|business|ko-kr|en-us|ko_kr|www|m|amp|p|v|s)$/i;
  var guessTitle = function (u) {
    try {
      var x = new URL(full(u)); var q = x.searchParams;
      if (ytId(u)) return 'YouTube 영상';
      var kw = q.get('q') || q.get('query') || q.get('keyword') || q.get('search');
      if (kw) return '검색 · ' + kw.slice(0, 40);
      var segs = x.pathname.split('/').filter(Boolean).map(function (s) { try { return decodeURIComponent(s); } catch (e) { return s; } });
      for (var i = segs.length - 1; i >= 0; i--) {
        var s = segs[i].replace(/\.(html?|php|aspx?|jsp|do)$/i, '');
        if (!s || s.length < 3 || GENERIC.test(s) || /^[\d.-]+$/.test(s) || /^[A-Z0-9]{10,}$/.test(s) || (/^[\w-]{8,}$/.test(s) && /\d/.test(s) && !/[-_]/.test(s))) continue;
        return s.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
      }
      if (/news|article|press|idxno|newsid|aid=/i.test(x.pathname + x.search)) return siteOf(u) === host(u) ? '뉴스 기사' : siteOf(u) + ' 기사';
      if (/\.pdf$/i.test(x.pathname)) return 'PDF 문서';
    } catch (e) {}
    return siteOf(u);
  };

  // ① 앱 데이터(제품 DB · 유관사례)와 맞추기
  var idx = null;
  var buildIdx = function () {
    if (idx) return idx;
    idx = { url: {}, model: {} };
    try {
      var d = linkDependencies.data && linkDependencies.data(); if (!d) return idx;
      Object.keys(d.P || {}).forEach(function (id) {
        var p = d.P[id]; if (!p) return;
        if (p.url) idx.url[norm(p.url)] = idx.url[norm(p.url)] || 'product:' + id;
        [p.model].concat(p.models || []).forEach(function (m) { if (m && typeof m === 'string' && m.length >= 6) idx.model[m.toUpperCase()] = idx.model[m.toUpperCase()] || 'product:' + id; });
      });
      Object.keys(d.C || {}).forEach(function (id) { var c = d.C[id]; if (c && c.url) idx.url[norm(c.url)] = 'case:' + id; });
      Object.keys(d.S || {}).forEach(function (id) { var s = d.S[id]; if (s && s.url) idx.url[norm(s.url)] = 'solution:' + id; });
    } catch (e) {}
    return idx;
  };
  var localRef = function (u) {
    if (!/samsung\.com/i.test(host(u))) return null;
    var ix = buildIdx(); var n = norm(u);
    if (ix.url[n]) return ix.url[n];
    var codes = (decodeURIComponent(u).toUpperCase().match(/[A-Z]{2}[0-9]{2}[A-Z0-9-]{4,}/g) || []);
    for (var i = codes.length - 1; i >= 0; i--) if (ix.model[codes[i]]) return ix.model[codes[i]];
    return null;
  };
  var tag = function () { try { return linkDependencies.tag && linkDependencies.tag(); } catch (e) { return null; } };

  var base = function (u) { var y = ytId(u); return { title: guessTitle(u), site: siteOf(u), img: y ? 'https://i.ytimg.com/vi/' + y + '/mqdefault.jpg' : '', ref: '', desc: '' }; };
  var withTimeout = function (p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); };
  var pending = {};
  /** URL → 메타데이터(캐시 → 앱 DB → microlink → 주소 추론). 언제나 성공(추론값)으로 끝난다. */
  var resolve = function (u) {
    var k = norm(u);
    if (mem[k] && mem[k].done) return Promise.resolve(mem[k]);
    if (pending[k]) return pending[k];
    var b = base(u);
    var ref = localRef(u); var tg = tag();
    if (ref && tg && tg.info(ref)) {
      var inf = tg.info(ref);
      var m = { title: inf.label, site: 'Samsung', img: '', ref: ref, desc: inf.sub || '', done: true };
      mem[k] = m; save(); return Promise.resolve(m);
    }
    pending[k] = withTimeout(fetchResource('https://api.microlink.io/?url=' + encodeURIComponent(full(u))).then(function (r) { return r.ok ? r.json() : null; }), 5000)
      .then(function (j) {
        var d = j && j.status === 'success' && j.data;
        var m = { title: (d && d.title) || b.title, site: (d && d.publisher) || b.site, img: (d && ((d.image && d.image.url) || (d.logo && d.logo.url))) || b.img, ref: '', desc: (d && d.description) || '', done: true, src: d ? 'web' : 'url' };
        m.title = String(m.title).slice(0, 120); m.desc = String(m.desc).slice(0, 200);
        return m;
      })
      .catch(function () { var m = b; m.done = true; m.src = 'url'; return m; })
      .then(function (m) { mem[k] = m; save(); delete pending[k]; return m; });
    return pending[k];
  };

  var LINK_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>';
  var paint = function (el, u, m) {
    var loading = !m || !m.done;
    m = m || base(u);
    el.dataset.title = m.title || ''; el.dataset.site = m.site || ''; el.dataset.img = m.img || ''; el.dataset.desc = m.desc || '';
    if (m.ref) { el.dataset.lref = m.ref; } else delete el.dataset.lref;
    el.classList.toggle('loading', loading);
    var tg = tag(); var th = '';
    if (m.ref && tg) { try { th = tg.thumb(m.ref) || ''; } catch (e) { th = ''; } }
    else if (m.img) th = '<img class="ml-img" src="' + esc(m.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">';
    var t = m.title || host(u);
    el.innerHTML = '<span class="ml-ic">' + LINK_SVG + '</span>' + (th ? '<span class="ml-th">' + th + '</span>' : '') +
      '<span class="ml-t">' + esc(t.length > 34 ? t.slice(0, 33) + '…' : t) + '</span>' + ((m.site || host(u)) !== t ? '<span class="ml-d">' + esc(m.site || host(u)) + '</span>' : '');
    el.title = [m.title, m.desc, u].filter(Boolean).join('\n') + '\n(두 번 누르면 새 탭에서 열기)';
    el.setAttribute('aria-label', '링크 · ' + t + ' · ' + (m.site || host(u)));
  };
  /** 링크 칩 DOM (MentionEditor renderSegs · 붙여넣기에서 씀) */
  var chip = function (u, meta) {
    var el = document.createElement('span');
    el.className = 'mention mlink'; el.contentEditable = 'false'; el.dataset.link = u; el.dataset.type = 'link';
    var k = norm(u);
    var m = meta && meta.title ? Object.assign({ done: true }, meta) : mem[k];
    paint(el, u, m);
    if (!m || !m.done) resolve(u).then(function (mm) { paint(el, u, mm); });
    return el;
  };
  /** 칩 → 세그먼트에 담을 메타데이터 */
  var meta = function (el) {
    var d = el.dataset; var o = { title: d.title || '', site: d.site || '' };
    if (d.img) o.img = d.img; if (d.lref) o.ref = d.lref; if (d.desc) o.desc = d.desc.slice(0, 200);
    return o;
  };
  /** 세그먼트 → 글(제작자 의견 note 문자열 · 미리보기) */
  var text = function (segs) {
    var tg = tag();
    return (segs || []).map(function (s) { if (s.t != null) return s.t; try { var inf = tg && tg.info(s.ref); return '@' + ((tg && tg.short(s.ref)) || (inf && (inf.short || inf.label)) || String(s.ref).split(':')[1]); } catch (e) { return ''; } }).join('');
  };
  /** 붙여넣기: 링크가 있으면 칩으로 넣고 true. root = 입력칸, emit = 세그먼트 다시 읽기, onMention = 앱 항목으로 맞춰졌을 때 연결 */
  var paste = function (raw, root, single, emit, onMention) {
    if (!raw || !root) return false;
    var txt = single ? raw.replace(/\s*\n+\s*/g, ' ') : raw;
    URL_RX.lastIndex = 0; if (!URL_RX.test(txt)) return false;
    var sel = window.getSelection(); if (!sel || !sel.rangeCount) return false;
    var range = sel.getRangeAt(0); if (!root.contains(range.commonAncestorContainer)) return false;
    range.deleteContents();
    var frag = document.createDocumentFragment(); var last = null; var chips = [];
    var addText = function (s) { if (!s) return; last = document.createTextNode(s); frag.appendChild(last); };
    var i = 0; var mm; URL_RX.lastIndex = 0;
    while ((mm = URL_RX.exec(txt))) {
      var u = mm[0]; var tail = (u.match(TRAIL) || [''])[0]; if (tail) u = u.slice(0, -tail.length);
      addText(txt.slice(i, mm.index));
      var c = chip(u); frag.appendChild(c); chips.push([c, u]); last = c;
      addText(tail); i = mm.index + mm[0].length;
    }
    addText(txt.slice(i));
    if (!last || last.nodeType !== 3 || !/\s$/.test(last.data)) { last = document.createTextNode(' '); frag.appendChild(last); }
    range.insertNode(frag);
    var r = document.createRange(); r.setStart(last, last.data.length); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    emit && emit();
    chips.forEach(function (x) {
      resolve(x[1]).then(function (m) {
        if (!x[0].isConnected) return;
        paint(x[0], x[1], m); emit && emit();
        if (m.ref && onMention) { try { onMention(m.ref); } catch (e) {} }
      });
    });
    return true;
  };
  // 칩을 두 번 누르면 새 탭에서 열기 (편집칸 안이라 한 번 누르기는 커서 이동으로 둠)
  document.addEventListener('dblclick', function (e) {
    var c = e.target && e.target.closest && e.target.closest('.mention.mlink[data-link]');
    if (c) { e.preventDefault(); window.open(full(c.dataset.link), '_blank', 'noopener'); }
  });
  return { paste: paste, chip: chip, meta: meta, text: text, resolve: resolve, rx: URL_RX };
})();
