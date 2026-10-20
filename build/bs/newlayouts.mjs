// 이번(9차)에 새로 만드는 사진 중심 레이아웃 — 원래 텍스트 레이아웃의 글 칸(data-tb) 번호 · 순서를 그대로 두고 사진 칸만 더한다.
// (그래서 그 레이아웃을 쓰던 장의 채운 글은 그대로 옮겨지고, 사진만 새로 넣으면 된다)
// node build/bs/newlayouts.mjs → build/bs/new_layouts.json { f: html } · build/bs/new_meta.json
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const dist = path.join(root, 'dist');
const srv = http.createServer((q, r) => {
  const f = path.join(dist, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  const ct = f.endsWith('.json') ? 'application/json' : f.endsWith('.html') ? 'text/html' : f.endsWith('.woff2') ? 'font/woff2' : f.endsWith('.png') ? 'image/png' : 'image/jpeg'; r.writeHead(200, { 'content-type': ct }); fs.createReadStream(f).pipe(r);
});
await new Promise((ok) => srv.listen(0, ok));
const exe = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: fs.existsSync(exe) ? exe : undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:${srv.address().port}/_h.html`);
await page.waitForFunction(() => window.H);
await page.evaluate(() => window.H.loadLayoutHtml());

// in-page helpers
await page.evaluate(() => {
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  window.NL = {
    load(f) { const host = document.getElementById('stage'); host.innerHTML = window.H.layoutHtml(f); return host.firstElementChild; },
    // a photo slot like the generator's (gen_base.py img): <div data-slot="Photo" data-img data-kind data-hint data-pid><img …></div>
    slot(i, { x, y, w, h, radius = 0, src, pid = '', hint, kind = 'space', pos = '50% 50%', fit = 'cover', abs = true, extra = '' }) {
      const d = document.createElement('div');
      d.setAttribute('style', `${abs ? `position: absolute; left: ${x}px; top: ${y}px; ` : ''}width: ${w}px; height: ${h}px; box-sizing: border-box; padding: 0px; overflow: hidden; border-radius: ${radius}; background: #dfe3ea;${extra ? ' ' + extra : ''}`);
      d.setAttribute('data-slot', 'Photo'); if (pid) d.setAttribute('data-pid', pid); d.setAttribute('data-img', String(i)); d.setAttribute('data-kind', kind); d.setAttribute('data-hint', hint);
      const im = document.createElement('img');
      if (/\.json#\d+$/.test(src)) { im.setAttribute('src', BLANK); im.setAttribute('data-fill', src); } else im.setAttribute('src', src);
      im.setAttribute('alt', hint); im.setAttribute('style', `display: block; width: 100%; height: 100%; object-fit: ${fit}; object-position: ${pos};`);
      if (pid) im.setAttribute('data-pid', pid);
      d.appendChild(im); return d;
    },
    div(style) { const d = document.createElement('div'); d.setAttribute('style', style); return d; },
    // top-level children of the root at an absolute position
    at(root, test) { return Array.from(root.children).filter((e) => { const s = e.getAttribute('style') || ''; return test(s, e); }); },
    px(s, k) { const m = new RegExp('(?:^|;)\\s*' + k + ':\\s*(-?[\\d.]+)px').exec(s); return m ? parseFloat(m[1]) : null; },
    setPx(e, k, v) { e.setAttribute('style', (e.getAttribute('style') || '').replace(new RegExp('((?:^|;)\\s*' + k + ':\\s*)-?[\\d.]+px'), `$1${v}px`)); },
    recolor(e, map) { for (const x of [e, ...e.querySelectorAll('*')]) { let s = x.getAttribute('style'); if (!s) continue; for (const [a, b] of map) s = s.split(a).join(b); x.setAttribute('style', s); } },
  };
});

const OUT = {}; const META = [];
const make = async (f, base, fn, meta) => {
  const html = await page.evaluate(({ base, fn }) => { const r = window.NL.load(base); (0, eval)('(' + fn + ')')(r, window.NL); return r.outerHTML; }, { base, fn: fn.toString() });
  OUT[f] = html; META.push({ f, base, ...meta });
};

// ---- 1. L_PH_SD_G — LED 피치 · 시청 거리 자를 관람 공간 사진 위에 (원래 L_SD_G)
await make('L_PH_SD_G', 'L_SD_G', (r, NL) => {
  const band = NL.at(r, (s) => NL.px(s, 'top') === 400 && NL.px(s, 'height') === 204)[0];
  const ph = NL.slot(0, { x: 64, y: 400, w: 1152, h: 204, radius: '16px', src: 'img/ph/ad-street-night.jpg', pid: 'ph.ad-street-night', hint: '화면을 보는 자리 사진 — 관중석 · 객석 · 거리 등 실제 관람 구간 (가로 띠)', pos: '50% 55%' });
  const scrim = NL.div('position: absolute; left: 64px; top: 400px; width: 1152px; height: 204px; border-radius: 16px; background: rgba(12,16,26,0.64)');
  band.replaceWith(ph); ph.after(scrim);
  // band contents (everything drawn between y 400 and 604) → light colours on the dark photo
  for (const e of Array.from(r.querySelectorAll('*'))) {
    if (e === ph || ph.contains(e) || e === scrim) continue;
    const q = e.getBoundingClientRect(); const rb = r.getBoundingClientRect();
    const top = q.top - rb.top, bot = q.bottom - rb.top;
    if (top < 404 || bot > 602 || q.width === 0) continue;
    if (e.closest('[style*="background: #d5d9e0"]') && e.closest('[style*="background: #d5d9e0"]') !== e) continue; // text inside light bars stays dark
    let s = e.getAttribute('style') || '';
    s = s.replace(/color: #596170/g, 'color: #e6e9ef').replace(/color: #8a91a0/g, 'color: #cfd4dd').replace(/(^|;\s*)color: #121417/g, '$1color: #ffffff')
      .replace(/background: #121417/g, 'background: rgba(255,255,255,0.9)').replace(/background: #8a91a0/g, 'background: rgba(255,255,255,0.7)')
      .replace(/rgba\(20,40,160,0\.08\)/g, 'rgba(157,180,255,0.20)').replace(/rgba\(20,40,160,0\.10\)/g, 'rgba(157,180,255,0.24)').replace(/dashed #1428a0/g, 'dashed #9db4ff');
    e.setAttribute('style', s);
  }
  // title row of the band and the legend inherit the slide ink — make them white
  for (const e of NL.at(r, (s) => NL.px(s, 'top') === 413 || NL.px(s, 'top') === 415)) e.setAttribute('style', e.getAttribute('style') + '; color: #ffffff');
  // the screen icon (#d5d9e0 block) stays light; the stand-in viewers too
}, { code: 'PH-SD-G', p: 'spec', p2: null, name: 'LED 피치 · 시청 거리 — 관람 공간 사진 위 거리 자', when: 'LED 사이니지 피치 3안을 고를 때, 실제로 화면을 보는 자리(관중석 · 객석 · 거리) 사진 위에 피치별 선명 거리와 관람 구간을 겹쳐 보여 줄 때', pv: ['L_SD_G'], sample: 'Q 미디어', grp: '스펙 · 사진' });

// ---- 2. L_PH_QA_A — 예상 질문 여섯 · 질문마다 근거 장면 사진 (원래 L_QA_A)
await make('L_PH_QA_A', 'L_QA_A', (r, NL) => {
  const cards = NL.at(r, (s) => NL.px(s, 'width') === 564 && NL.px(s, 'height') === 152);
  const pics = [
    ['img/ph/md-clinic-lobby.jpg', 'ph.md-clinic-lobby', '연동 — 대기 안내 화면이 있는 접수 · 대기 공간'],
    ['img/ph/md-ward.jpg', 'ph.md-ward', '위생 — 화면을 쓰는 병실 · 진료 공간'],
    ['img/ph/pb-control.jpg', 'ph.pb-control', '운영 — 원격 관제 화면'],
    ['img/ph/md-staff-tab.jpg', 'ph.md-staff-tab', '보안 — 태블릿으로 확인하는 의료진'],
    ['img/ph/md-station.jpg', 'ph.md-station', '서버 — 간호 스테이션 화면'],
    ['img/fill/r8-people.json#13', '', '복구 — 현장 점검 엔지니어'],
  ];
  cards.forEach((c, i) => {
    let s = c.getAttribute('style').replace('padding: 18px 20px 16px 18px', 'padding: 16px 18px 14px 160px');
    c.setAttribute('style', s);
    const [src, pid, hint] = pics[i];
    c.insertBefore(NL.slot(i, { x: 0, y: 0, w: 144, h: 150, radius: '13px 0 0 13px', src, pid, hint: hint + ' (질문의 근거 장면 사진)', kind: 'space' }), c.firstChild);
  });
}, { code: 'PH-QA-A', p: 'appendix', p2: null, name: '예상 질문 여섯 · 질문마다 근거 장면 사진', when: '평가위원 · 결정권자가 물을 질문과 답을 미리 정리할 때, 질문마다 답의 근거가 되는 현장 · 화면 사진을 붙여 보여 줄 때', pv: ['L_QA_A'], sample: 'W 요양병원', grp: '부록 · 사진' });

// ---- 3. L_PH_AIS_08 — AI 맞춤 환경 2행 · 3단계, 아이콘 칸을 장면 사진으로 (원래 L_AIS_08 · 표준 제안서)
await make('L_PH_AIS_08', 'L_AIS_08', (r, NL) => {
  const tiles = Array.from(r.querySelectorAll('div')).filter((d) => /width: 248px; height: 96px; border-radius: 12px; background: #f5f6f8/.test(d.getAttribute('style') || '') && d.querySelector('svg'));
  const pics = [
    ['img/fill/ais-b.json#10', '활동량이 많은 객실 — 객실에서 움직이는 투숙객 장면'],
    ['img/fill/ais-a.json#14', '활동량이 적은 객실 — 쉬는 침실과 천장 1Way'],
    ['img/ph/ht-room-sofa.jpg', '공기질이 나빠질 때 — 객실 거실 공간'],
    ['img/fill/ais-a.json#5', '공기질이 좋아진 객실 — 공기청정기 · 에어드레서가 있는 객실'],
  ];
  tiles.forEach((t, i) => { const [src, hint] = pics[i]; t.replaceWith(NL.slot(2 + i, { x: 0, y: 0, w: 248, h: 96, radius: '12px', src, hint: hint + ' (객실 장면 사진)', abs: false, kind: 'space' })); });
}, { code: 'PH-AIS-08', p: 'value', p2: 'scenario', ind: 'HT', name: 'AI 맞춤 환경 2행 · 3단계 — 장면 사진 + 제품 컷', when: '감지 → AI 판단 → 자동 조절을 두 줄(냉방 · 공기질)로 보여 줄 때, 양 끝 단계를 실제 객실 장면 사진으로', pv: ['L_AIS_08'], sample: 'H 호텔', grp: '표준 제안서 · 사진' });

// ---- 4. L_PH_AIS_25 — 고객 분석 마케팅: 수집 · 적용 카드를 객실 장면 사진으로 (원래 L_AIS_25)
await make('L_PH_AIS_25', 'L_AIS_25', (r, NL) => {
  const cards = NL.at(r, (s) => NL.px(s, 'top') === 156 && NL.px(s, 'width') === 320 && NL.px(s, 'height') === 168);
  const pics = [['img/fill/ais-a.json#3', '데이터 수집 — 객실 TV · 리모컨으로 서비스를 쓰는 장면'], ['img/fill/ais-b.json#11', '콘텐츠 · 프로모션 적용 — 객실 TV에 뜬 호텔 맞춤 화면']];
  cards.forEach((c, i) => {
    const x = NL.px(c.getAttribute('style'), 'left');
    const ph = NL.slot(i, { x, y: 156, w: 320, h: 168, radius: '14px', src: pics[i][0], hint: pics[i][1] + ' (객실 사진)', kind: 'space' });
    const sc = NL.div(`position: absolute; left: ${x}px; top: 156px; width: 320px; height: 168px; border-radius: 14px; background: rgba(12,16,26,0.70)`);
    c.replaceWith(ph); ph.after(sc);
    // contents of this card → white
    for (const e of NL.at(r, (s) => { const l = NL.px(s, 'left'), t = NL.px(s, 'top'); return l >= x && l < x + 320 && t > 156 && t < 324; })) {
      NL.recolor(e, [['background: #eaeefb', 'background: rgba(255,255,255,0.16)'], ['color: #121417', 'color: #ffffff'], ['color: #3d4452', 'color: #ffffff'], ['color: #596170', 'color: #d5d9e0']]);
      e.setAttribute('style', e.getAttribute('style') + '; color: #ffffff');
      for (const sv of e.querySelectorAll('svg')) if (sv.getAttribute('stroke') === '#1428a0') sv.setAttribute('stroke', '#ffffff');
    }
  });
}, { code: 'PH-AIS-25', p: 'solution', p2: null, ind: 'HT', name: '고객 분석 마케팅 — 수집 · 적용을 객실 사진으로 + 데이터 카드 4', when: '투숙 데이터 수집 → 분석 → 맞춤 콘텐츠 적용 흐름을 실제 객실 장면 사진과 함께, 아래에 분석 항목 네 가지를 보여 줄 때', pv: ['L_AIS_25'], sample: 'H 호텔', grp: '표준 제안서 · 사진' });

// ---- 5. L_PH_AIS_35 — 4단계 프로세스 카드 머리를 현장 사진으로 (원래 L_AIS_35)
await make('L_PH_AIS_35', 'L_AIS_35', (r, NL) => {
  const D = 24; const SH = 14; // 사진 머리만큼 카드 안 글을 내리고, 아래 흐름 띠도 그만큼 내린다
  const cards = NL.at(r, (s) => NL.px(s, 'top') === 156 && NL.px(s, 'width') === 264 && NL.px(s, 'height') === 372);
  const xs = cards.map((c) => NL.px(c.getAttribute('style'), 'left'));
  const pics = [['img/fill/mobile.json#23', '배송 — 물류 창고 · 출고 장면'], ['img/fill/office.json#7', '설치 — 천장 실내기를 설치 · 점검하는 엔지니어'], ['img/ph/ed-ac-clean.jpg', '유지보수 — 에어컨 세척 · 케어 서비스'], ['img/fill/r8-people.json#13', '서비스 — 현장 서비스 엔지니어']];
  const bottom = NL.at(r, (s) => { const t = NL.px(s, 'top'); return t != null && t >= 540 && t < 660; });
  for (const e of bottom) NL.setPx(e, 'top', NL.px(e.getAttribute('style'), 'top') + D);
  cards.forEach((c, i) => {
    NL.setPx(c, 'height', 372 + D);
    const x = xs[i];
    // icon tile out, chip onto the photo
    for (const e of NL.at(r, (s) => NL.px(s, 'left') === x + 20 && NL.px(s, 'top') === 176)) e.remove();
    for (const e of NL.at(r, (s) => NL.px(s, 'left') === x + 84 && NL.px(s, 'top') === 190)) { NL.setPx(e, 'left', x + 16); NL.setPx(e, 'top', 168); }
    for (const e of NL.at(r, (s) => NL.px(s, 'left') === x + 20 && (NL.px(s, 'top') === 246 || NL.px(s, 'top') === 304))) NL.setPx(e, 'top', NL.px(e.getAttribute('style'), 'top') + SH);
    const ph = NL.slot(i, { x: x + 1, y: 157, w: 262, h: 90, radius: '15px 15px 0 0', src: pics[i][0], hint: pics[i][1] + ' (현장 사진)', kind: 'people' });
    c.after(ph);
  });
  for (const e of NL.at(r, (s) => NL.px(s, 'top') === 331 && NL.px(s, 'width') === 22)) NL.setPx(e, 'top', 331 + D / 2);
}, { code: 'PH-AIS-35', p: 'why', p2: null, ind: 'HT', name: '배송 · 설치 · 유지보수 · 서비스 4단계 — 카드마다 현장 사진', when: '공급사가 배송부터 서비스까지 책임지는 과정을 단계마다 실제 현장 사진(물류 · 설치 · 케어 · 상담)과 함께 보여 줄 때', pv: ['L_AIS_35'], sample: 'H 호텔', grp: '표준 제안서 · 사진' });

fs.writeFileSync(path.join(root, 'build/bs/new_layouts.json'), JSON.stringify(OUT));
fs.writeFileSync(path.join(root, 'build/bs/new_meta.json'), JSON.stringify(META, null, 1));
console.log(Object.keys(OUT).map((f) => f + ' ' + OUT[f].length).join('\n'));
await browser.close(); srv.close();
