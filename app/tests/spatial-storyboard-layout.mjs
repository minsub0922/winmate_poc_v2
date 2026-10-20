import assert from 'node:assert/strict';
import {isSpatialStoryboardLayout,isSpatialLayoutSelection,selectSpatialStoryboardLayout,relatedSpatialLayouts} from '../web/src/domain/spatial/storyboard-layout.js';
import {layoutContextKey,markLayoutChanges} from '../web/src/domain/slides/context-policy.js';

const spatial={f:'L_SPATIAL_2D',ik:['aerial']},normal={f:'L_NORMAL',name:'일반 공간 사진',ik:['space']};
const saved={f:'L_MY_SAVED',name:'추출 레이아웃',ind:'OF',prods:['flip'],my:{kind:'spatial',up:1,spatialHistoryId:'history',spatialLayout:{view:'3d'}}};
assert(isSpatialStoryboardLayout(spatial));assert(isSpatialStoryboardLayout(saved));assert(isSpatialStoryboardLayout({f:'L_SOL_03',ik:['aerial']}));
assert(isSpatialStoryboardLayout({f:'L_MY_EDITED'},'<div data-spatial-layout="1"></div>'));assert(!isSpatialStoryboardLayout(normal));assert(!isSpatialStoryboardLayout({f:'L_NOT_SPATIAL',name:'조감도를 언급한 제안서'}));
const sheet={uid:'keep-position',f:spatial.f,status:'partial',ov:{t:{0:'옛 제목'},img:{0:{src:'old'}},spatial:{version:1},bg:{src:'paper'}},ev:{i0:{by:'ai'}}},copy=structuredClone(sheet);
const result=selectSpatialStoryboardLayout(sheet,spatial,saved);assert.deepEqual(sheet,copy);assert.equal(result.uid,sheet.uid);assert.equal(result.f,saved.f);assert.deepEqual(result.ov,{t:{},img:{},bg:{src:'paper'}});assert.deepEqual(result.ev,{});assert(isSpatialLayoutSelection(result));
assert.throws(()=>selectSpatialStoryboardLayout(sheet,normal,saved),/조감도 관련/);assert.throws(()=>selectSpatialStoryboardLayout(sheet,spatial,{f:'L_MY_PHOTO',my:{kind:'edit'}}),/추출한 조감도/);assert(!isSpatialLayoutSelection({...result,f:'L_ORDINARY'}));
const p={title:'제안',customer:'고객',ind:'OF',req:{},ctx:{products:[],solutions:[],cases:[]},parts:[{id:'part',name:'공간 제안',type:'scenario',items:[],layouts:[sheet]}]},original=structuredClone(p);
p.parts[0].layouts=[result];markLayoutChanges(p,original);assert.equal(result.status,'done');assert.equal(result.adaptation.phase,'retained');assert.equal(result.adaptation.origin,'spatial');assert.equal(result.adaptation.key,layoutContextKey(p,p.parts[0]));
const before=structuredClone(p);result.ov.t[2]='설명 직접 수정';markLayoutChanges(p,before);assert.equal(result.adaptation.phase,'retained');assert.equal(result.ov.t[2],'설명 직접 수정');
const other={...saved,f:'L_MY_OTHER',ind:'HT',prods:[],my:{...saved.my,up:100}};assert.equal(relatedSpatialLayouts([other,saved,normal],{industry:'OF',products:['flip']})[0].f,saved.f);
console.log('PASS spatial-only eligibility, atomic editable-layout selection, stable Storyboard position, stale override removal, context retention and related sorting');
