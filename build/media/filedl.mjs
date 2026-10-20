import { chromium } from '/home/claude/wm/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const info = JSON.parse(fs.readFileSync('/home/claude/media/fileinfo.json', 'utf8'));
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const pg = await b.newPage();
await pg.goto('https://www.samsung.com/sec/business/insights/case-study/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await pg.waitForTimeout(3000);
for (const id of ['121', '123', '127', '129']) {
  const f = info[id].file;
  const b64 = await pg.evaluate(async ({ p, n }) => {
    const r = await fetch('/sec/business/common/fileDownloadResult/', { method: 'POST', body: new URLSearchParams({ filePath: p, fileName: n }), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192));
    return r.status + ':' + btoa(s);
  }, { p: f.phyPath, n: f.orgFlNm });
  const [st, data] = [b64.split(':')[0], b64.slice(b64.indexOf(':') + 1)];
  fs.writeFileSync(`/home/claude/media/pdf/${id}.pdf`, Buffer.from(data, 'base64'));
  console.log(id, st, Buffer.from(data, 'base64').length);
}
await b.close();
