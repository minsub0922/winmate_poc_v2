import test from 'node:test';
import assert from 'node:assert/strict';
import {changeProposal} from '../web/src/repositories/proposal-update.js';
import {markLayoutChanges,layoutContextKey} from '../web/src/domain/slides/context-policy.js';
import {recordsJson,recordJson} from '../web/src/repositories/record-json.js';
import {selectSpatialStoryboardLayout} from '../web/src/domain/spatial/storyboard-layout.js';

function proposal(){
  const p={id:'p',title:'고객 제안',customer:'고객',ind:'OF',req:{free:[{t:'회의실 제안'}]},ctx:{products:['flip'],solutions:[],cases:[]},parts:[],layoutPlan:{parts:{a:'queued',b:'queued'}},updatedAt:1};
  p.parts=['a','b'].map(id=>({id,name:id,type:'value',items:[],layouts:[{uid:id,f:'test',ov:{t:{0:'제품 제안'},img:{}},status:'done'}]}));
  for(const part of p.parts)part.layouts[0].adaptation={phase:'ready',key:layoutContextKey(p,part),version:3};
  return p;
}
const change=(p,fn)=>changeProposal(p,fn,{mark:markLayoutChanges,now:()=>42});
test('progress preserves all sheets and no-op results preserve the entire record',()=>{
  const p=proposal();let marked=0;
  const next=changeProposal(p,d=>{d.layoutPlan.parts.a='running';},{mark:()=>marked++,touch:false});
  assert.equal(next.parts,p.parts);assert.equal(next.req,p.req);assert.equal(next.updatedAt,1);assert.equal(marked,0);
  assert.equal(p.layoutPlan.parts.a,'queued');assert.equal(next.layoutPlan.parts.a,'running');
  assert.equal(change(next,d=>{d.layoutPlan.parts.a='running';}),next);
});
test('editing one sheet preserves others and matches the former full-copy validation',()=>{
  const p=proposal(),edit=d=>{d.parts[0].layouts[0].ov.t[0]='새 문구';};
  const full=structuredClone(p);edit(full);markLayoutChanges(full,p);full.updatedAt=42;
  const next=change(p,edit);
  // Request IDs and timestamps are deliberately generated separately.
  for(const x of [full.parts[0].layouts[0],next.parts[0].layouts[0]]){delete x.adaptation.request;delete x.adaptation.queuedAt;}
  assert.deepEqual(next,full);assert.equal(next.parts[1],p.parts[1]);assert.equal(p.parts[0].layouts[0].ov.t[0],'제품 제안');
});
test('requirements still invalidate every dependent sheet',()=>{
  const p=proposal(),next=change(p,d=>{d.req.free.push({t:'추가 공간'});});
  assert(next.parts.every(part=>part.layouts[0].adaptation.phase==='queued'));
  assert.equal(p.req.free.length,1);
});
test('normalization of a previously untouched cover is included in validation',()=>{
  const p=proposal();let checked;
  const next=changeProposal(p,d=>{d.parts[1].layouts.push({uid:'cover',f:'cover'});},{
    normalize:d=>{d.parts[0].layouts.push(d.parts[1].layouts.pop());},
    mark:(d,b,{untouched})=>{checked=untouched;},
  });
  assert(!checked.has('a'));assert.equal(next.parts[0].layouts.length,2);assert.equal(p.parts[0].layouts.length,1);
});
test('record serialization retains the legacy JSON contract through updates and deletion',()=>{
  const a=proposal(),b={...proposal(),id:'b'};assert.equal(recordsJson([a,b]),JSON.stringify([a,b]));
  const next=change(a,d=>{d.title='수정';});
  assert.equal(recordsJson([next,b]),JSON.stringify([next,b]));assert.equal(recordJson(a),JSON.stringify(a));
  assert.equal(recordsJson([b]),JSON.stringify([b]));
});
test('selecting a saved spatial layout inside a transaction keeps the background and original sheet',()=>{
  const p=proposal(),old=p.parts[0].layouts[0];old.f='L_SPATIAL_3D';old.ov.bg={src:'paper',nested:{x:1}};
  const selected={f:'L_MY_TEST',my:{kind:'spatial',spatialLayout:{view:'3d'}}};
  const next=change(p,d=>{const sheet=d.parts[0].layouts[0];Object.assign(sheet,selectSpatialStoryboardLayout(sheet,{f:'L_SPATIAL_3D'},selected));});
  assert.equal(next.parts[0].layouts[0].f,selected.f);assert.deepEqual(next.parts[0].layouts[0].ov.bg,old.ov.bg);
  assert.equal(old.f,'L_SPATIAL_3D');assert.equal(next.parts[1],p.parts[1]);
});
