import { chromium } from '/home/claude/wm/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const ids = ['136','134','131','129','127','123','121','119','117','113','112','109','93'];
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pg = await b.newPage();
await pg.goto('https://www.samsung.com/sec/business/insights/case-study/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await pg.waitForTimeout(3000);
const res = await pg.evaluate(async (ids) => {
  const out = {};
  for (const id of ids) {
    const r = await fetch('/sec/business/xhr/insights/getFileInfo/', { method: 'POST', body: new URLSearchParams({ lettNo: id }), headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8', 'x-requested-with': 'XMLHttpRequest' } });
    out[id] = await r.json();
  }
  return out;
}, ids);
console.log(JSON.stringify(res, null, 1));
fs.writeFileSync('/home/claude/media/fileinfo.json', JSON.stringify(res, null, 1));
await b.close();
