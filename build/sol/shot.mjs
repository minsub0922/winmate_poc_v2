// 15장 미리보기 스크린샷 + 넘침/겹침 점검
import { chromium } from 'playwright';
import fs from 'node:fs';
const only = process.argv[2];
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await p.goto('file:///home/claude/gen/out/lay/preview.html');
await p.waitForLoadState('networkidle'); await p.waitForTimeout(500);
fs.mkdirSync('/home/claude/gen/out/lay/shots', { recursive: true });
const ids = await p.evaluate(() => [...document.querySelectorAll('.s')].map((e) => e.id));
for (const id of ids) {
  if (only && !only.split(',').includes(id.slice(-2))) continue;
  const el = await p.$('#' + id);
  await el.screenshot({ path: `/home/claude/gen/out/lay/shots/${id}.png` });
  const issues = await p.evaluate((id) => {
    const root = document.getElementById(id).firstElementChild; const R = root.getBoundingClientRect(); const out = [];
    root.querySelectorAll('[data-tb]').forEach((e) => {
      const r = e.getBoundingClientRect(); const ns = e.style.whiteSpace === 'nowrap';
      if (r.right > R.right + 1 || r.bottom > R.bottom + 1 || r.left < R.left - 1) out.push(['out', e.dataset.tb, e.innerText.slice(0, 20)]);
      if (e.scrollWidth > e.clientWidth + 2 && e.style.width) out.push(['wide', e.dataset.tb, e.innerText.slice(0, 24), e.scrollWidth, e.clientWidth]);
    });
    root.querySelectorAll('img').forEach((i) => { if (!i.naturalWidth) out.push(['noimg', i.getAttribute('data-fill')]); });
    return out;
  }, id);
  console.log(id, issues.length ? JSON.stringify(issues) : 'ok');
}
await b.close();
