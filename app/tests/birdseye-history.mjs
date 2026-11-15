// 통합 조감도 히스토리 — 공간 조감도(서버 페이지)와 건물(로컬 전체)을 최근 수정순 한 목록으로 (domain/birdseye/history.js)
import assert from 'node:assert/strict';
import {mergeHistoryPage,historyStamp,spatialPagesFor} from '../web/src/domain/birdseye/history.js';

const spatial=(n,from=1000,step=10)=>Array.from({length:n},(_,i)=>({id:'sp-'+i,title:'공간 '+i,updated_at:from-i*step}));
const building=(id,updatedAt)=>({id,title:'건물 '+id,updatedAt});
const ids=page=>page.items.map(item=>item.type[0]+':'+item.id);

assert.equal(historyStamp({updated_at:1700000000}),1700000000000,'seconds become milliseconds');
assert.equal(historyStamp({updated_at:1700000000123}),1700000000123);assert.equal(historyStamp({updatedAt:5}),5);assert.equal(historyStamp({}),0);

// 섞어서 최근 수정순, 한 쪽 8개
const all={spatial:{items:spatial(20,1000e9,10e9),total:20},buildings:[building('a',995e9),building('b',905e9),building('c',1)]};
const first=mergeHistoryPage(all,1,8);
assert.deepEqual(ids(first),['s:sp-0','b:a','s:sp-1','s:sp-2','s:sp-3','s:sp-4','s:sp-5','s:sp-6']);
assert.equal(first.total,23);assert.equal(first.totalPages,3);assert.equal(first.page,1);assert.equal(first.need,null);
assert.equal(first.items[1].type,'building');assert.equal(first.items[1].title,'건물 a');assert.equal(first.items[1].source.id,'a');assert.equal(first.items[0].updatedAt,1000e9);
const second=mergeHistoryPage(all,2,8);assert.deepEqual(ids(second),['s:sp-7','s:sp-8','s:sp-9','b:b','s:sp-10','s:sp-11','s:sp-12','s:sp-13']);
const third=mergeHistoryPage(all,3,8);assert.equal(third.items.length,7);assert.equal(third.items.at(-1).id,'c');
assert.equal(mergeHistoryPage(all,99,8).page,3,'a page past the end is the last page');assert.equal(mergeHistoryPage(all,0,8).page,1);
console.log('PASS spatial and building records interleave by last change and paginate as one list');

// 한쪽이 비어 있어도
const onlyBuildings=mergeHistoryPage({spatial:{items:[],total:0},buildings:[building('a',5),building('b',9)]},1,8);
assert.deepEqual(ids(onlyBuildings),['b:b','b:a']);assert.equal(onlyBuildings.totalPages,1);
const onlySpatial=mergeHistoryPage({spatial:{items:spatial(3),total:3},buildings:[]},1,8);assert.equal(onlySpatial.items.length,3);
const nothing=mergeHistoryPage({spatial:{items:[],total:0},buildings:[]},1,8);assert.deepEqual(nothing.items,[]);assert.equal(nothing.total,0);assert.equal(nothing.totalPages,0);assert.equal(nothing.page,1);
console.log('PASS either source can be empty');

// 서버는 공간 조감도를 8개씩 준다 — 합친 목록의 한 쪽을 그리는 데 필요한 서버 쪽만 읽는다(건물 수만큼만 앞으로 넓힌다)
assert.deepEqual(spatialPagesFor(1,8,0),[1]);assert.deepEqual(spatialPagesFor(5,8,0),[5],'no buildings: exactly that page');
assert.deepEqual(spatialPagesFor(5,8,3),[4,5]);assert.deepEqual(spatialPagesFor(5,8,20),[2,3,4,5]);assert.deepEqual(spatialPagesFor(1,8,20),[1]);
assert.deepEqual(spatialPagesFor(9,8,0,20),[3],'a page past the end reads the last page');assert.deepEqual(spatialPagesFor(1,8,3,0),[],'nothing on the server');
assert.deepEqual(spatialPagesFor(4,8,12,20),[2,3],'the last pages may hold only buildings');
console.log('PASS a merged page needs only the server pages around it, however far it is');

// 한 구간만 읽고도 그 쪽을 정확히 그린다. 합친 순서: new, sp-0…sp-9, mid, sp-10…sp-99, old (103개)
const big=spatial(100,2000e9,10e9),some=[building('old',1),building('new',3000e9),building('mid',1905e9)];
const window=pages=>({items:pages.flatMap(n=>big.slice((n-1)*8,n*8)),total:100,offset:(pages[0]-1)*8});
const at=(page,pages)=>mergeHistoryPage({spatial:window(pages),buildings:some},page,8);
assert.deepEqual(ids(at(1,[1])),['b:new','s:sp-0','s:sp-1','s:sp-2','s:sp-3','s:sp-4','s:sp-5','s:sp-6']);
assert.deepEqual(ids(at(2,[1,2])),['s:sp-7','s:sp-8','s:sp-9','b:mid','s:sp-10','s:sp-11','s:sp-12','s:sp-13']);
assert.deepEqual(ids(at(3,[2,3])),['s:sp-14','s:sp-15','s:sp-16','s:sp-17','s:sp-18','s:sp-19','s:sp-20','s:sp-21'],'buildings outside the window are not shown early or late');
assert.deepEqual(ids(at(13,[12,13])),['s:sp-94','s:sp-95','s:sp-96','s:sp-97','s:sp-98','s:sp-99','b:old']);
for(let page=1;page<=13;page++){const pages=spatialPagesFor(page,8,some.length,100),shown=at(page,pages);assert.equal(shown.need,null,'page '+page);assert.equal(shown.total,103);assert.equal(shown.totalPages,13);
  assert.deepEqual(ids(shown),ids(mergeHistoryPage({spatial:{items:big,total:100},buildings:some},page,8)),'window equals the full merge on page '+page);}
// 같은 시각이면 공간이 먼저, 건물끼리는 받은 순서
const tie=mergeHistoryPage({spatial:{items:spatial(2,50,0),total:2},buildings:[building('x',50000),building('y',50000)]},1,8);assert.deepEqual(ids(tie),['s:sp-0','s:sp-1','b:x','b:y']);
// 무작위(같은 시각 포함) — 어느 쪽이든, 필요한 서버 쪽만 읽은 결과가 전부 읽은 결과와 같다
let seed=7;const random=n=>{seed=(seed*1103515245+12345)%2147483648;return seed%n;};
for(let round=0;round<300;round++){
  const count=random(60),stamps=Array.from({length:count},()=>2e12+random(40)*1e9).sort((a,b)=>b-a),rows=stamps.map((t,i)=>({id:'r'+i,title:'r'+i,updated_at:t}));
  const blds=Array.from({length:random(14)},(_,i)=>building('b'+i,2e12+(random(44)-2)*1e9)),size=1+random(9),pages=Math.ceil((count+blds.length)/size)||1;
  for(let page=1;page<=pages+1;page++){
    const wanted=spatialPagesFor(page,size,blds.length,count),part={items:wanted.flatMap(n=>rows.slice((n-1)*size,n*size)),total:count,offset:wanted.length?(wanted[0]-1)*size:0};
    const windowed=mergeHistoryPage({spatial:part,buildings:blds},page,size),full=mergeHistoryPage({spatial:{items:rows,total:count},buildings:blds},page,size);
    assert.equal(windowed.need,null);assert.deepEqual(ids(windowed),ids(full),'round '+round+' page '+page);assert.equal(full.items.length,Math.min(size,Math.max(0,count+blds.length-(full.page-1)*size)));
  }
}
console.log('PASS a window of server records draws exactly the same page as the whole list');

// 읽어 둔 구간이 모자라면 그리지 않고, 읽어야 할 범위를 알려 준다
const short=at(3,[3]);assert.deepEqual(short.items,[]);assert.deepEqual(short.need,{from:13,to:24});assert.equal(short.page,3);
const none=mergeHistoryPage({spatial:{items:[],total:100},buildings:[]},2,8);assert.deepEqual(none.need,{from:8,to:16});
assert.deepEqual(mergeHistoryPage({spatial:{items:[],total:100,offset:0},buildings:[]},99,8).need,{from:96,to:100},'never asks for more than exist');
console.log('PASS a page whose records are not loaded says which range to read, and shows nothing meanwhile');
