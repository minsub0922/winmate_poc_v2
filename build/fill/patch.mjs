// 원본 레이아웃의 빈 이미지 칸 채우기 — 2단계: build/fill/plan.json 을 레이아웃 HTML 에 넣는다.
//   읽음: build/fill/layouts_orig.b64 (채우기 전 원본 · 다시 돌려도 같은 결과) · build/fill/plan.json (build.py)
//   씀:   data/layouts.b64 (앱이 읽는 레이아웃) · build/fill/orig_slots.json (칸별 원래 마크업 — 되돌릴 때)
// 칸 처리: 자리표시(회색 상자 · 제품 모양 SVG · 힌트 상자)를 <img> 하나로 바꾸고, 칸에 data-pid · data-hint 를 단다.
//   - 사진 자리로 그린 글 상자(data-tb, "홀 테이블 사진" 등)는 사진을 넣고 data-img 번호를 새로 단다(클릭해 바꾸기).
//     data-tb 번호는 그대로 — Best Scenario 의 't<n>' 사진 · 문구가 그대로 들어간다.
//   - 번호 없는 고정 상자("매장 카운터 이미지" 등)는 상자 안 맨 아래에 사진을 깔고 글자는 data-label 로 옮긴다
//     (slide.jsx fixedBox 가 data-label 로도 찾으므로 's:<글자>' 사진이 그대로 들어간다).
//   - 회색 상자 안 작은 글 상자에 이름만 적은 자리('b<n>')는 상자에 사진을 깔고 글 상자는 비운다(이름은 data-label).
//   - 제품을 검은 사각형으로만 그린 자리('d<k>')는 같은 상자에 제품 컷을 넣는다(상자 크기 그대로).
//   - 새 사진은 src 대신 data-fill="img/fill/<묶음>.json#k" — 화면이 묶음을 받아 src 를 채운다(src/fillpack.js).
//   - 큰 그림의 일부만 창으로 보이게 짠 칸(카탈로그 구성도에서 기기 하나만 보이게 한 칸 등)은 칸을 그 창 크기로 맞춘다.
// node build/fill/patch.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import zlib from 'zlib';
const H = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync('build/fill/layouts_orig.b64', 'utf8').trim(), 'base64')).toString('utf8'));
const PLAN = JSON.parse(fs.readFileSync('build/fill/plan.json', 'utf8'));
const SIL = JSON.parse(fs.readFileSync('build/fill/sil_count.json', 'utf8')); // layout → number of dark product rectangles spec.SIL lists
const exe = process.env.CHROME; const b = await chromium.launch(exe ? { executablePath: exe } : {});
const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
await pg.setContent('<div id=h></div>');
const out = { ...H }; const orig = {}; const log = [];
for (const [f, plan] of Object.entries(PLAN)) {
  const r = await pg.evaluate(({ html, plan, silCount }) => {
    const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const h = document.getElementById('h'); h.innerHTML = html;
    if (h.children.length !== 1) return { err: 'root count ' + h.children.length };
    const root = h.firstElementChild; const orig = {}; const log = [];
    // product drawn as a plain dark rectangle — same rule as measure.mjs, found before anything is changed
    const rgb = (c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?/); return m && (m[4] == null || +m[4] > 0.6) ? [+m[1], +m[2], +m[3]] : null; };
    const sils = Array.from(root.querySelectorAll('div,span')).filter((e) => {
      if (e.closest('[data-img]')) return false;
      const c = rgb(getComputedStyle(e).backgroundColor); if (!c) return false;
      const rc = e.getBoundingClientRect(); const t = e.textContent.replace(/\s+/g, ' ').trim();
      return (c[0] + c[1] + c[2]) / 3 < 70 && !t && e.children.length <= 2 && rc.width >= 12 && rc.height >= 18 && rc.width <= 320 && rc.height <= 320;
    });
    if (silCount != null && sils.length !== silCount) return { err: `dark rectangles: found ${sils.length}, spec lists ${silCount}` };
    let next = Math.max(-1, ...Array.from(root.querySelectorAll('[data-img]')).map((e) => Number(e.getAttribute('data-img')))) + 1;
    const mkImg = (it, extra) => {
      const img = document.createElement('img');
      if (it.src) img.setAttribute('src', it.src); else { img.setAttribute('src', BLANK); img.setAttribute('data-fill', it.fill); }
      img.setAttribute('alt', it.alt);
      img.setAttribute('data-pid', it.pid);
      img.setAttribute('style', `display: block; ${extra || ''}width: 100%; height: 100%; object-fit: ${it.fit}; object-position: ${it.pos};`);
      return img;
    };
    const cat = (k) => (/^\d+$/.test(k) ? 0 : k[0] === 't' ? 1 : k[0] === 'b' ? 2 : k[0] === 'd' ? 4 : 3);
    const keys = Object.keys(plan).sort((a, b) => cat(a) - cat(b) || (parseInt(a.replace(/^[tbd]/, '')) - parseInt(b.replace(/^[tbd]/, ''))) || a.localeCompare(b));
    for (const i of keys) {
      const it = plan[i];
      if (i.startsWith('t')) { // a text block drawn as a picture area → the picture, plus its own image-slot number
        const el = root.querySelector(`[data-tb="${i.slice(1)}"]`);
        if (!el || el.hasAttribute('data-img')) return { err: 'no / filled text block ' + i };
        orig[i] = el.outerHTML;
        const label = el.textContent.replace(/\s+/g, ' ').trim();
        el.setAttribute('data-img', String(next)); next++;
        el.setAttribute('data-label', label); el.setAttribute('data-hint', label); el.setAttribute('data-pid', it.pid);
        el.style.padding = it.fit === 'contain' ? '12px' : '0px'; el.style.overflow = 'hidden'; el.style.boxSizing = 'border-box';
        el.innerHTML = ''; el.appendChild(mkImg(it));
        log.push(i + '→img' + el.getAttribute('data-img'));
        continue;
      }
      if (/^b\d+$/.test(i)) { // a gray box holding only a small text block with its name → photo under it, the name moves to data-label
        const tb = root.querySelector(`[data-tb="${i.slice(1)}"]`); const el = tb && tb.parentElement;
        if (!el || el.closest('[data-img]')) return { err: 'no box for ' + i };
        orig[i] = el.outerHTML;
        const label = tb.textContent.replace(/\s+/g, ' ').trim(); tb.textContent = '';
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.style.overflow = 'hidden';
        el.setAttribute('data-label', label); el.setAttribute('data-hint', label); el.setAttribute('data-pid', it.pid);
        el.insertBefore(mkImg(it, 'position: absolute; left: 0px; top: 0px; '), el.firstChild);
        continue;
      }
      if (/^d\d+$/.test(i)) { // product silhouette → the product's photo cut, same box
        const el = sils[Number(i.slice(1))];
        orig[i] = el.outerHTML;
        el.style.background = 'transparent'; el.style.backgroundColor = 'transparent'; el.style.border = '0px'; el.style.boxShadow = 'none';
        el.setAttribute('data-pid', it.pid);
        el.innerHTML = ''; el.appendChild(mkImg(it));
        continue;
      }
      if (i.startsWith('s:')) { // a fixed box with only a label → photo underneath its badges; the label stays findable (data-label)
        const label = i.slice(2);
        const el = Array.from(root.querySelectorAll('div,span')).find((e) => !e.closest('[data-tb],[data-img]') && Array.from(e.childNodes).filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join('').trim() === label);
        if (!el) return { err: 'no fixed box ' + i };
        orig[i] = el.outerHTML;
        for (const c of Array.from(el.childNodes)) if (c.nodeType === 3) c.remove();
        if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
        el.style.overflow = 'hidden';
        el.setAttribute('data-label', label); el.setAttribute('data-hint', label); el.setAttribute('data-pid', it.pid);
        el.insertBefore(mkImg(it, 'position: absolute; left: 0px; top: 0px; '), el.firstChild);
        continue;
      }
      const el = root.querySelector(`[data-img="${i}"]`);
      if (!el) return { err: 'no slot ' + i };
      if (el.getAttribute('data-pid') || el.querySelector('img')) return { err: 'slot already filled ' + i };
      orig[i] = el.outerHTML;
      const span = el.querySelector('span:last-of-type');
      const svg = el.querySelector('svg[aria-label]');
      const hint = el.getAttribute('data-hint') || (svg ? svg.getAttribute('aria-label').replace(/\s*\(예시 이미지\)\s*$/, '') : '') || (span ? span.textContent.trim() : '');
      if (it.sprite) { // fit the slot to the window it is seen through
        let clip = el.parentElement;
        while (clip && clip !== root && getComputedStyle(clip).overflow === 'visible') clip = clip.parentElement;
        if (clip && clip !== root) {
          if (clip === el.parentElement) {
            Object.assign(el.style, { position: 'absolute', left: '0px', top: '0px', right: '', bottom: '', width: '100%', height: '100%' });
          } else {
            const op = el.offsetParent || el.parentElement; const a = op.getBoundingClientRect(); const c = clip.getBoundingClientRect();
            Object.assign(el.style, { position: 'absolute', left: (c.left - a.left) + 'px', top: (c.top - a.top) + 'px', right: '', bottom: '', width: c.width + 'px', height: c.height + 'px' });
          }
          log.push(i + ' sprite→' + (clip === el.parentElement ? 'parent' : 'ancestor'));
        }
      }
      const ph = el.hasAttribute('data-ph');
      el.removeAttribute('data-ph');
      if (ph) { el.style.display = 'block'; el.style.gap = ''; el.style.color = ''; }
      const card = !ph && it.fit === 'contain' && it.kind !== 'wm'; // product cut on its own card (Prod / Img slot)
      el.style.padding = card ? '6px' : '0px';
      el.style.background = card ? '#f5f6f8' : 'transparent';
      el.style.overflow = 'hidden';
      el.setAttribute('data-pid', it.pid);
      if (hint && !el.getAttribute('data-hint')) el.setAttribute('data-hint', hint);
      el.innerHTML = '';
      el.appendChild(mkImg(it));
    }
    return { html: root.outerHTML, orig, log };
  }, { html: H[f], plan, silCount: SIL[f] == null ? null : SIL[f] });
  if (r.err) { console.error(f, r.err); process.exit(1); }
  out[f] = r.html; orig[f] = r.orig; if (r.log.length) log.push(f + ': ' + r.log.join(', '));
}
await b.close();
const b64 = zlib.gzipSync(Buffer.from(JSON.stringify(out), 'utf8'), { level: 9 }).toString('base64');
try { fs.chmodSync('data/layouts.b64', 0o644); } catch (e) { /* new file */ }
fs.writeFileSync('data/layouts.b64', b64 + '\n');
fs.writeFileSync('build/fill/orig_slots.json', JSON.stringify(orig, null, 0));
const n = Object.values(PLAN).reduce((s, p) => s + Object.keys(p).length, 0);
console.log(Object.keys(PLAN).length, 'layouts ·', n, 'slots filled · data/layouts.b64', Math.round(b64.length / 1024), 'KB');
console.log(log.join('\n'));
