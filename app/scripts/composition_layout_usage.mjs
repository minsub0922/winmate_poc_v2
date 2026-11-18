// The real composition builders, including the admin's part-specific sheets.
// No browser, model calls or writes to user data are involved.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export async function compositionLayoutUsage(root) {
  const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  const require = createRequire(path.join(root, 'app/web/package.json'));
  const built = await require('esbuild').build({
    stdin: { resolveDir: path.join(root, 'app/web/src'), contents: `
      export * as toc from './domain/templates/toc_templates.js';
      export { FILLS, FILL_CUSTOMER } from './domain/templates/scenario_fills.js';
      export { partFlows, curateParts } from '../../../admin/web/src/part-flows.js';` },
    bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'error',
  });
  const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
  await M.toc.loadTocContent();
  const refs = new Map();
  const add = (f, source) => { if (f) { if (!refs.has(f)) refs.set(f, new Set()); refs.get(f).add(source); } };
  for (const t of M.toc.TOC_TEMPLATES) for (const v of M.toc.tocVerticals()) for (const addons of [[], ['sub']]) {
    const s = M.toc.ensureTocScenario(t.id, v.id, { addons });
    if (!s) throw new Error(`Cannot inspect composition ${t.id}/${v.id}`);
    for (const group of s.flow) for (const sheet of group.slides) add(sheet.f, t.id);
  }
  for (const p of M.curateParts(M.partFlows(M.toc, M)).parts) for (const slot of p.slots) {
    for (const f of slot.fs || [slot.f]) add(f, 'part:' + p.key);
    for (const variant of slot.variants || []) add(variant.f, 'part:' + p.key);
  }
  for (const s of read('admin/web/src/overview-sheets.json').sheets) add(s.layout, 'part:overview');
  for (const f of Object.keys(read('admin/web/src/ua-catalog.json').layouts)) add(f, 'part:ua');
  for (const [name, part] of [['space-sheets', 'space'], ['spec-sheets', 'pspec']])
    for (const s of read(`admin/web/src/${name}.json`).sheets) add(s.f, 'part:' + part);
  // Capacity variants are required even when today's example decks don't reach that size.
  for (let n = 4; n <= 10; n++) add('L_TOC_INDEX' + n, 'composition:index');
  for (let n = 1; n <= 6; n++) add('L_VS_DIV_R' + n, 'composition:divider');
  for (const g of read('app/web/src/domain/templates/layout_count_groups.json').groups)
    if (g.members.some(([f]) => refs.has(f))) for (const [f] of g.members) add(f, 'count:' + g.id);
  return Object.fromEntries([...refs].sort(([a], [b]) => a.localeCompare(b)).map(([f, reasons]) => [f, [...reasons].sort()]));
}
