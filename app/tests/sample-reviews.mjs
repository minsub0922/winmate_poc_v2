import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeSampleReviews, sampleReviewDoc, mergeReviewExampleProposals } from '../web/src/repositories/sample-reviews.js';
import { criteriaForReview } from '../web/src/domain/review/criteria.js';
const legacy=JSON.parse(fs.readFileSync(new URL('../web/src/domain/review/sample-reviews.json',import.meta.url)));
const previous=JSON.parse(fs.readFileSync(new URL('../web/src/domain/review/linked-review-examples-v2.json',import.meta.url)));
const previousV3=JSON.parse(fs.readFileSync(new URL('../web/src/domain/review/linked-review-examples-v3.json',import.meta.url)));
const previousV4=JSON.parse(fs.readFileSync(new URL('../web/src/domain/review/linked-review-examples-v4.json',import.meta.url)));
const admin={username:'admin',auth_enabled:true};
const marker='winmate.v2.reviews.seedv',key='winmate.v2.reviews',pkey='winmate.v2.proposals';
function storage(){const data=new Map();return{data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
function seed(s=storage(),oldReviews=[],oldProposals=[]){const proposals=mergeReviewExampleProposals(oldProposals,admin,s);return{s,proposals,reviews:mergeSampleReviews(oldReviews,admin,s,proposals)};}
const tests=[
 ['shared history without local sample metadata is repaired without changing its link',()=>{
  const old=JSON.parse(fs.readFileSync(new URL('../web/src/domain/review/linked-review-examples-v5.json',import.meta.url))).examples[2].proposal;
  delete old.sample;old._share={token:'existing-share',isOwner:true};
  const s=storage();s.setItem(marker,'admin-linked-review-examples-5-layouts1');
  const repaired=mergeReviewExampleProposals([old],admin,s)[0],ids=repaired.parts.flatMap(s=>s.layouts.map(x=>x.f));
  assert.equal(ids.length,new Set(ids).size);assert.deepEqual(repaired._share,old._share);assert.equal(repaired.id,old.id);
 }],
 ['already migrated histories also repair untouched appendices in older v3/v4/v5 entries once',()=>{
  const old=[3,4,5].flatMap(v=>JSON.parse(fs.readFileSync(new URL(`../web/src/domain/review/linked-review-examples-v${v}.json`,import.meta.url))).examples.map(e=>e.proposal));
  const s=storage();s.setItem(marker,'admin-linked-review-examples-5-layouts1');
  const repaired=mergeReviewExampleProposals(old,admin,s);
  assert.equal(repaired.length,old.length);
  for(let i=0;i<repaired.length;i++){
   const fs=repaired[i].parts.flatMap(s=>s.layouts.map(x=>x.f));assert.equal(fs.length,new Set(fs).size);
   assert.equal(repaired[i].id,old[i].id);assert.deepEqual(repaired[i].parts.slice(0,-4),old[i].parts.slice(0,-4));
   assert.deepEqual(repaired[i].parts.flatMap(s=>s.layouts.map(x=>x.uid)),old[i].parts.flatMap(s=>s.layouts.map(x=>x.uid)));
  }
  assert.equal(mergeReviewExampleProposals(repaired,admin,s),repaired);
 }],
 ['authored appendix text edited by the user is preserved during historical layout repair',()=>{
  const old=JSON.parse(fs.readFileSync(new URL('../web/src/domain/review/linked-review-examples-v5.json',import.meta.url))).examples[2].proposal;
  old.parts.at(-4).layouts[0].ov.t['5']='사용자가 직접 쓴 판단 내용';
  const s=storage();s.setItem(marker,'admin-linked-review-examples-5-layouts1');
  const result=mergeReviewExampleProposals([old],admin,s)[0];
  assert.deepEqual(result.parts.at(-4),old.parts.at(-4));assert.notEqual(result.parts.at(-3).layouts[0].f,'L_AIS_32');
 }],
 ['duplicate v5 defaults are replaced by unique-layout examples without leaving duplicate history',()=>{
  const old=JSON.parse(fs.readFileSync(new URL('../web/src/domain/review/linked-review-examples-v5.json',import.meta.url))),s=storage();
  s.setItem(marker,'admin-linked-review-examples-5');s.setItem(key,JSON.stringify(old.examples.map(e=>e.review)));s.setItem(pkey,JSON.stringify(old.examples.map(e=>e.proposal)));
  const result=seed(s,old.examples.map(e=>e.review),old.examples.map(e=>e.proposal));
  assert.equal(result.proposals.length,3);assert.equal(result.reviews.length,3);
  for(const p of result.proposals){const ids=p.parts.flatMap(s=>s.layouts.map(x=>x.f));assert.equal(ids.length,new Set(ids).size);assert.equal(p.sample.layoutRevision,1);}
  assert(result.reviews.every(r=>r.sample.layoutRevision===1));
 }],
 ['v5 layout repair preserves user-edited reviews and originals with their archived evidence',()=>{
  const old=JSON.parse(fs.readFileSync(new URL('../web/src/domain/review/linked-review-examples-v5.json',import.meta.url))),s=storage();
  old.examples[0].review.title+=' 직접 수정';old.examples[1].proposal.title+=' 직접 수정';
  s.setItem(marker,'admin-linked-review-examples-5');s.setItem(key,JSON.stringify(old.examples.map(e=>e.review)));s.setItem(pkey,JSON.stringify(old.examples.map(e=>e.proposal)));
  const result=seed(s,old.examples.map(e=>e.review),old.examples.map(e=>e.proposal));
  assert.equal(result.proposals.length,5);assert.equal(result.reviews.length,5);
  for(const e of old.examples.slice(0,2)){assert(result.proposals.some(p=>p.id===e.proposal.id));assert.deepEqual(result.reviews.find(r=>r.id===e.review.id),e.review);assert.equal(sampleReviewDoc(e.review,admin).units.length,e.doc.units.length);}
 }],
 ['three paired examples have actual model scores and native layout evidence',()=>{
  const {reviews,proposals}=seed();assert.equal(reviews.length,3);assert.equal(proposals.length,3);
  assert.deepEqual(reviews.map(r=>r.units.length),[22,41,19]);
  for(const r of reviews){const {CR}=criteriaForReview(r),p=proposals.find(p=>p.id===r.settings.previewProposalId),doc=sampleReviewDoc(r,admin);assert(p);assert.equal(p.id,r.settings.linkedId);assert.equal(r.sample.proposalId,p.id);assert.equal(r.units.length,p.parts.flatMap(s=>s.layouts).length);assert.equal(doc.units.length,r.units.length);const before=previousV3.examples.find(e=>e.scenario===r.sample.scenario);assert.deepEqual(doc.units.slice(0,-4).map(u=>u.text),before.doc.units.slice(0,-4).map(u=>u.text));assert.equal(new Set(p.parts.flatMap(s=>s.layouts.map(x=>x.f))).size,doc.units.length);assert(r.demo&&r.ai&&r.scoring==='server'&&r.criteriaVersion===5);assert.equal(Object.keys(r.results).length,24);assert(r.poc.llm.llm_used&&!r.poc.llm.fallbacks.length);assert(Object.values(r.agg.cats).every(v=>typeof v==='number'));
   for(const [id,x]of Object.entries(r.results)){assert(CR[id]);assert.equal(x.src,'server');assert.equal(x.mode,'llm');assert(x.score>=0&&x.score<=100);assert.equal(x.checkpoints.length,4);assert.equal(x.score,x.checkpoints.reduce((n,p)=>n+p.points,0)/4);assert(x.checkpoints.every(p=>p.level>=0&&p.level<=4));for(const e of x.evidence)assert(doc.units.some(u=>u.n===e.unit));}
   const layouts=new Map(p.parts.flatMap(s=>s.layouts.map(x=>[x.uid,x])));for(const u of doc.units)assert.equal(layouts.get(u.uid)?.f,u.f);
  }
 }],
 ['other users and guests never seed either proposals or reviews',()=>{const ex=seed().reviews[0];for(const user of [null,{}, {...admin,username:'reader'},{...admin,auth_enabled:false}]){const old=[{id:'keep'}],s=storage();assert.equal(mergeReviewExampleProposals(old,user,s),old);assert.equal(mergeSampleReviews(old,user,s,[]),old);assert.equal(sampleReviewDoc(ex,user),null);assert.equal(s.data.size,0);}}],
 ['unchanged old disconnected examples are replaced once',()=>{const old=legacy.reviews.map(r=>({...structuredClone(r),sample:{source:'example-review',version:1}}));const s=storage();s.data.set(marker,'admin-review-samples-1');const {reviews}=seed(s,old);assert.equal(reviews.length,3);assert(reviews.every(r=>r.sample.source==='linked-review-example'));assert.equal(s.data.get(marker),'admin-linked-review-examples-5-layouts1');}],
 ['unchanged v2 defaults receive fresh v5 reviews while their source reference data remains',()=>{const s=storage();s.data.set(marker,'admin-linked-review-examples-2');const old=structuredClone(previous.examples);const a=seed(s,old.map(e=>e.review),old.map(e=>e.proposal));assert.equal(a.reviews.length,3);assert(a.reviews.every(r=>r.criteriaVersion===5));assert.equal(a.proposals.length,6);for(const e of old)assert.deepEqual(a.proposals.find(p=>p.id===e.proposal.id),e.proposal);}],
 ['editing a v2 review or its original preserves the pair and its original rubric',()=>{const old=structuredClone(previous.examples);old[0].review.title='내가 수정한 이전 평가';old[1].proposal.title='내가 수정한 이전 원본';const a=seed(storage(),old.map(e=>e.review),old.map(e=>e.proposal));assert.equal(a.reviews.length,5);for(const e of old.slice(0,2)){const r=a.reviews.find(r=>r.id===e.review.id);assert.equal(r,e.review);assert.equal(criteriaForReview(r).CRITERIA.length,26);assert.equal(sampleReviewDoc(r,admin).units.length,e.doc.units.length);}assert(!a.reviews.some(r=>r.id===old[2].review.id));}],
 ['v3 re-evaluation replaces untouched examples and preserves an edited source with its original score',()=>{const old=structuredClone(previousV3.examples);old[0].proposal.title='수정한 v3 원본';const s=storage();s.data.set(marker,'admin-linked-review-examples-3');const a=seed(s,old.map(e=>e.review),old.map(e=>e.proposal));assert.equal(a.reviews.length,4);assert.equal(a.reviews.find(r=>r.id===old[0].review.id),old[0].review);assert.equal(criteriaForReview(old[0].review).scoring,undefined);assert.equal(sampleReviewDoc(old[0].review,admin).units.length,old[0].doc.units.length);assert(a.reviews.filter(r=>r.criteriaVersion===5).length===3);}],
 ['internal layout policy upgrades are not mistaken for user edits',()=>{const old=structuredClone(previous.examples);for(const e of old)for(const p of e.proposal.parts)for(const x of p.layouts)if(x.adaptation)x.adaptation.version=999;const a=seed(storage(),old.map(e=>e.review),old.map(e=>e.proposal));assert.equal(a.reviews.length,3);assert(a.reviews.every(r=>r.criteriaVersion===5));}],
 ['v4 scores survive on edited records while untouched defaults get proposal-stage v5 reviews',()=>{const old=structuredClone(previousV4.examples);old[0].review.title='직접 수정한 정밀 평가';const s=storage();s.data.set(marker,'admin-linked-review-examples-4');const a=seed(s,old.map(e=>e.review),old.map(e=>e.proposal));assert.equal(a.reviews.length,4);assert.equal(a.reviews.find(r=>r.id===old[0].review.id),old[0].review);assert.equal(criteriaForReview(old[0].review).scoring.level_points,undefined);assert(a.reviews.filter(r=>r.criteriaVersion===5).length===3);}],
 ['personal records and edited old examples remain unchanged',()=>{const own={id:'my-review',title:'내 기록'},edited={...structuredClone(legacy.reviews[0]),title:'내가 수정한 예시',sample:{source:'example-review',version:1}};const {reviews}=seed(storage(),[own,edited]);assert.equal(reviews.length,5);assert.equal(reviews.find(r=>r.id===own.id),own);assert.equal(reviews.find(r=>r.id===edited.id),edited);assert(sampleReviewDoc(edited,admin));}],
 ['manually linked or reuploaded old examples are preserved',()=>{const edited={...structuredClone(legacy.reviews[0]),previewAt:123,settings:{...legacy.reviews[0].settings,previewProposalId:'my-proposal'},sample:{source:'example-review',version:1}};const {reviews}=seed(storage(),[edited]);assert.equal(reviews.find(r=>r.id===edited.id),edited);}],
 ['existing proposals are not overwritten or relabeled',()=>{const first=seed(),edited={...first.proposals[0],title:'수정한 원본'},own={id:'mine',title:'나의 제안서'};const {proposals}=seed(storage(),[],[own,edited]);assert.equal(proposals.find(p=>p.id===own.id),own);assert.equal(proposals.find(p=>p.id===edited.id),edited);}],
 ['refresh does not duplicate pairs',()=>{const a=seed();assert.equal(mergeReviewExampleProposals(a.proposals,admin,a.s),a.proposals);assert.equal(mergeSampleReviews(a.reviews,admin,a.s,a.proposals),a.reviews);}],
 ['deleting an example or its source is respected after migration',()=>{const a=seed();const rs=a.reviews.slice(1),ps=a.proposals.slice(1);assert.equal(mergeSampleReviews(rs,admin,a.s,ps),rs);assert.equal(mergeReviewExampleProposals(ps,admin,a.s),ps);}],
 ['no review is created without an available matching source',()=>{const old=[{id:'keep'}];assert.equal(mergeSampleReviews(old,admin,storage(),[]),old);}],
 ['partial source creation retains old examples and leaves migration incomplete',()=>{const a=seed(),s=storage(),old=structuredClone(legacy.reviews);const rs=mergeSampleReviews(old,admin,s,a.proposals.slice(0,1));assert.equal(rs.length,4);assert.equal(s.data.get(marker),undefined);}],
 ['proposal storage failure cannot commit the shared completion marker',()=>{const s=storage(),set=s.setItem;s.setItem=(k,v)=>{if(k===pkey)throw Error('quota');set(k,v);};const a=seed(s);assert.equal(a.reviews.length,3);assert.equal(s.data.get(marker),undefined);}],
 ['review storage failure cannot commit the marker',()=>{const s=storage(),set=s.setItem;s.setItem=(k,v)=>{if(k===key)throw Error('quota');set(k,v);};const a=seed(s);assert.equal(a.reviews.length,3);assert.equal(s.data.get(marker),undefined);}],
 ['blocked marker reads leave existing records alone',()=>{const old=[{id:'keep'}],s={getItem:()=>{throw Error('blocked');}};assert.equal(mergeReviewExampleProposals(old,admin,s),old);assert.equal(mergeSampleReviews(old,admin,s,[]),old);}],
 ['sources and documents are independent across browsers',()=>{const a=seed();a.proposals[0].title='changed';a.reviews[0].title='changed';const doc=sampleReviewDoc(a.reviews[0],admin);doc.units[0].title='changed';const b=seed();assert.notEqual(b.proposals[0].title,'changed');assert.notEqual(b.reviews[0].title,'changed');assert.notEqual(sampleReviewDoc(b.reviews[0],admin).units[0].title,'changed');assert.equal(sampleReviewDoc({id:b.reviews[0].id},admin),null);}],
 ['an unrelated record occupying a source ID is never treated as the example source',()=>{const a=seed();const wrong={id:a.proposals[0].id,title:'별도 사용자 자료'};const s=storage();assert.deepEqual(mergeSampleReviews([],admin,s,[wrong]),[]);}],
];
for(const[name,run]of tests){run();console.log('PASS',name);}console.log(`${tests.length}/${tests.length} linked sample-review cases passed`);
