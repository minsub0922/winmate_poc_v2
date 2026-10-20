// 두 HTML 의 <script> JS 가 이스케이프 표기만 다르고 뜻은 같은지 — acorn AST 를 나란히 걸으며 비교
import fs from 'node:fs'; import * as acorn from 'acorn';
const get = (p) => [...fs.readFileSync(p, 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const A = get(process.argv[2]), B = get(process.argv[3]);
const dec = (s) => s.replace(/\\(u([0-9A-Fa-f]{4})|x([0-9A-Fa-f]{2}))/g, (m, _, u, x) => String.fromCharCode(parseInt(u || x, 16)));
let diffs = 0, tagged = 0, nodes = 0;
function cmp(a, b, path) {
  if (diffs > 5) return;
  if (a === b) return;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') { diffs++; console.log('DIFF', path, String(a).slice(0, 80), '|', String(b).slice(0, 80)); return; }
  if (Array.isArray(a)) { if (a.length !== b.length) { diffs++; console.log('LEN', path); return; } for (let i = 0; i < a.length; i++) cmp(a[i], b[i], path); return; }
  nodes++;
  if (a.type === 'TaggedTemplateExpression') { tagged++; if (JSON.stringify(a.quasi.quasis.map((q) => q.value.raw)) !== JSON.stringify(b.quasi.quasis.map((q) => q.value.raw))) { diffs++; console.log('TAGGED RAW DIFF', path); } }
  for (const k of Object.keys(a)) {
    if (k === 'start' || k === 'end' || k === 'raw' || k === 'loc') continue;
    if (k === 'regex') { if (a.regex.flags !== b.regex.flags || dec(a.regex.pattern) !== dec(b.regex.pattern)) { diffs++; console.log('REGEX', a.regex.pattern.slice(0, 60)); } continue; }
    if (k === 'value' && a.type === 'Literal' && a.regex) continue;
    if (k === 'value' && a.type === 'TemplateElement') { if (a.value.cooked !== b.value.cooked) { diffs++; console.log('TPL', path); } continue; }
    cmp(a[k], b[k], path + '.' + (a.type || k));
  }
}
for (let i = 0; i < A.length; i++) {
  const pa = acorn.parse(A[i], { ecmaVersion: 'latest', sourceType: 'script' });
  const pb = acorn.parse(B[i], { ecmaVersion: 'latest', sourceType: 'script' });
  cmp(pa, pb, 's' + i);
}
console.log('nodes', nodes, 'tagged templates', tagged, diffs ? 'NOT EQUIVALENT' : 'EQUIVALENT');
