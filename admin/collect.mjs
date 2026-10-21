// Run the repository's real collector in an isolated directory with stricter completeness checks.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2];
if (!out || !path.resolve(out).startsWith(path.join(root, 'admin') + path.sep) && !process.env.WINMATE_ADMIN_DATA) throw Error('An admin staging path is required');
fs.mkdirSync(out, { recursive: true });
let code = fs.readFileSync(path.join(root, 'proddb/build/collect_site.mjs'), 'utf8');
function replace(needle, replacement) {
  if (!code.includes(needle)) throw Error('Collector contract changed: ' + needle.slice(0, 70));
  code = code.replace(needle, replacement);
}
replace("import { chromium } from 'playwright';", `import { chromium } from ${JSON.stringify(pathToFileURL(path.join(root, 'app/web/node_modules/playwright/index.mjs')).href)};`);
replace("const OUT = new URL('../raw', import.meta.url).pathname;", `const OUT = ${JSON.stringify(path.resolve(out))};`);
replace('await pg.evaluate(() => {', `
const discovery = await pg.content();
const discovered = [...new Set([...discovery.matchAll(/\\/sec\\/business\\/([A-Za-z0-9_-]+\\/all-[A-Za-z0-9_-]+)/g)].map(m => m[1]))];
if (!discovered.length) throw Error('Samsung navigation discovery failed');
for (const item of discovered) if (!site.includes(item)) site.push(item);
fs.writeFileSync(OUT + '/discovery.json', JSON.stringify({ at: new Date().toISOString(), paths: discovered }));
await pg.evaluate(() => {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (url, options = {}) => {
    const r = await nativeFetch(url, { ...options, signal: AbortSignal.timeout(45000) });
    if (!r.ok) throw Error('HTTP ' + r.status);
    return r;
  };
  window.pagedList = async (no, f = '') => {
    let products = [], filters = [], expected = null;
    for (let page = 1; page <= 100; page++) {
      const r = await fetch(LIST(no, f).replace('page=1&', 'page=' + page + '&'));
      const j = await r.json();
      if (!Array.isArray(j.products) || !Number.isFinite(Number(j.count))) throw Error('Invalid list response');
      expected = Number(j.count); products.push(...j.products); filters.push(...(j.filters || []));
      if (products.length >= expected) break;
      if (!j.products.length) throw Error('Incomplete pagination');
    }
    const unique = [...new Map(products.map(p => [p.goodsId, p])).values()];
    if (unique.length !== expected) throw Error('Count mismatch: ' + unique.length + '/' + expected);
    return { products: unique, count: expected, filters: [...new Set(filters)] };
  };
`);
replace('const j = await fetch(LIST(c.no)).then((r) => r.json());', 'const j = await pagedList(c.no);');
replace("const k = await fetch(LIST(no, f)).then((r) => r.json());", 'const k = await pagedList(no, f);');
replace('return rows;\n  };', "if (!rows.length) throw Error('Empty spec response requires review'); return rows;\n  };");
replace("log('DONE features', Object.keys(F).length, 'errors', errors.length);", "log('DONE features', Object.keys(F).length, 'errors', errors.length); if (errors.length) process.exitCode = 2;");
const target = path.join(out, 'collector.mjs');
fs.writeFileSync(target, code);
if (process.env.WINMATE_ADMIN_COLLECTOR_COMPILE_ONLY !== '1') await import(pathToFileURL(target).href);
