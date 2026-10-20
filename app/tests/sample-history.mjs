import assert from 'node:assert/strict';
import { mergeSampleHistory } from '../web/src/repositories/sample-history.js';
const user = { username:'admin', auth_enabled:true, sample_history:{version:1,scenarios:['bs01','bs21','bs03']} };
const source = id => ({id, title:id, parts:[{layouts:[{f:'L_C01',ov:{t:{1:'original'}}}]}], exportedAt:123});
const storage = () => { const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}; };
const tests = [
 ['admin receives three samples',()=>assert.equal(mergeSampleHistory([],user,storage(),source).length,3)],
 ['other account receives none',()=>assert.equal(mergeSampleHistory([],{...user,username:'other'},storage(),source).length,0)],
 ['disabled authentication receives none',()=>assert.equal(mergeSampleHistory([],{...user,auth_enabled:false},storage(),source).length,0)],
 ['no policy receives none',()=>assert.equal(mergeSampleHistory([],{username:'admin'},storage(),source).length,0)],
 ['existing records remain first and unchanged',()=>{const old={id:'user-work',title:'mine'};const out=mergeSampleHistory([old],user,storage(),source);assert.equal(out[0],old);assert.equal(out.length,4);}],
 ['same sample IDs retain edits',()=>{const old={id:'admin-sample-bs01',title:'my-edit'};const out=mergeSampleHistory([old],user,storage(),source);assert.equal(out[0],old);assert.equal(out.length,3);}],
 ['reload does not duplicate samples',()=>{const s=storage();const a=mergeSampleHistory([],user,s,source);assert.equal(mergeSampleHistory(a,user,s,source),a);}],
 ['deleted sample is not resurrected',()=>{const s=storage();const a=mergeSampleHistory([],user,s,source).slice(1);assert.equal(mergeSampleHistory(a,user,s,source).length,2);}],
 ['old version marker accepts requested samples',()=>{const s=storage();s.map.set('winmate.v2.seedv','legacy');assert.equal(mergeSampleHistory([],user,s,source).length,3);}],
 ['duplicate policy entries are deduplicated',()=>assert.equal(mergeSampleHistory([],{...user,sample_history:{version:1,scenarios:['bs01','bs01']}},storage(),source).length,1)],
 ['source scenario is never changed',()=>{const original=source('x');const out=mergeSampleHistory([],user,storage(),()=>original);out[0].parts[0].layouts[0].ov.t[1]='edit';assert.equal(original.parts[0].layouts[0].ov.t[1],'original');}],
 ['samples are labeled and not falsely exported',()=>{for(const p of mergeSampleHistory([],user,storage(),source,1234)){assert(p.title.startsWith('[샘플]'));assert.equal(p.exportedAt,null);assert.equal(p.createdAt,1234);assert.equal(p.sample.source,'best-scenario');}}],
 ['failed persistence does not set completion marker',()=>{let marker=false;const s={getItem:()=>null,setItem:k=>{if(k==='winmate.v2.proposals')throw Error('quota');marker=true;}};assert.equal(mergeSampleHistory([],user,s,source).length,3);assert.equal(marker,false);}],
 ['marker read failure preserves existing records',()=>{const old=[{id:'keep'}];assert.equal(mergeSampleHistory(old,user,{getItem:()=>{throw Error('blocked');}},source),old);}],
];
for(const [name,fn] of tests){fn();console.log('PASS',name);}console.log(`${tests.length}/${tests.length} sample-history cases passed`);
