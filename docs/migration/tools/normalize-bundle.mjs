// Audit only: remove observed esbuild E/T name permutation, preserving public property keys.
import fs from 'node:fs';
import { parse } from '../../../reference/source-build/node_modules/acorn/dist/acorn.mjs';
import { fullAncestor } from '../../../reference/source-build/node_modules/acorn-walk/dist/walk.mjs';
const base = new URL('../evidence/', import.meta.url);
const input = fs.readFileSync(new URL('source.pretty.js', base), 'utf8');
const ast = parse(input, { ecmaVersion: 'latest' });
const spans = new Map();
fullAncestor(ast, (node, state, parents) => {
 if(node.type!=='Identifier'||node.name.length>3||!/[ET]/.test(node.name))return;
 const parent=parents[parents.length-2];
 if(parent?.type==='MemberExpression'&&parent.property===node&&!parent.computed)return;
 if((parent?.type==='Property'||parent?.type==='MethodDefinition')&&parent.key===node&&!parent.computed&&!parent.shorthand)return;
 spans.set(node.start,{end:node.end,text:node.name.replace(/[ET]/g,x=>x==='E'?'T':'E')});
});
let result='',last=0;
for(const [start,span]of [...spans].sort((a,b)=>a[0]-b[0])){result+=input.slice(last,start)+span.text;last=span.end;}
result+=input.slice(last);
fs.writeFileSync(new URL('source.names-normalized.js',base),result);
console.log('AST reference normalization',spans.size,'identifier occurrences; properties preserved');
