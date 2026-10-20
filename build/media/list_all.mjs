import { chromium } from '/home/claude/wm/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pg = await b.newPage();
await pg.goto('https://www.samsung.com/sec/business/insights/case-study/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await pg.waitForTimeout(4000);
const all = await pg.evaluate(async () => {
  const out = [];
  for (let page = 1; page < 40; page++) {
    const body = new URLSearchParams({ bbsId: 'insights', bbsGbNo: '1', bbsGbEnNm: 'case-study', filterStr: '', openYn: 'Y', page: String(page) });
    const r = await fetch('/sec/business/xhr/insights/getInsightsListView/', { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' } });
    const t = await r.text();
    const d = new DOMParser().parseFromString(t, 'text/html');
    const lis = [...d.querySelectorAll('li[data-lett-no]')];
    if (!lis.length) break;
    let fresh = 0;
    for (const li of lis) {
      const id = li.getAttribute('data-lett-no');
      if (out.some((x) => x.id === id)) continue;
      fresh++;
      const a = li.querySelector('a');
      const im = li.querySelector('img');
      out.push({ id, href: a && a.getAttribute('href'), onclick: a && a.getAttribute('onclick'), thumb: im && im.getAttribute('src'), alt: im && im.getAttribute('alt'), title: (li.querySelector('h3') || {}).textContent?.trim() });
    }
    if (!fresh) break;
  }
  return out;
});
fs.writeFileSync('/home/claude/media/case_list.json', JSON.stringify(all, null, 1));
console.log(all.length, all.slice(-3));
await b.close();
