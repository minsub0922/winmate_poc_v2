// Public-account examples must analyze the selling target, preserve its actual
// operating model and carry complete editable values and source provenance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import ACCOUNT from '../web/src/domain/templates/account_scenarios.json' with {type:'json'};
import PHOTOS from '../web/src/domain/templates/account_photo_assets.json' with {type:'json'};
import {SC,FEATURED,slidesOfScenario} from '../web/src/domain/templates/scenarios.js';
import {FILLS,FILL_CUSTOMER} from '../web/src/domain/templates/scenario_fills.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
assert.equal(ACCOUNT.scenarios.length,3);
// 인스파이어 · 에피소드 = 공개자료 기반 검토안 14장 · 폴 바셋 = 목차 템플릿 「공간 가치형 제안서 확장형」으로 조립한 제안서 28장
// (당사의 이해 → 핵심 기술 → 공간별 가치 제안 → 도입사례 → Why Samsung, 추가 장은 해당 목차 아래 — compose_account_proposal.mjs).
// 시범 실행 계획(L_PH_IP_A) · 단계별 합의(L_PH_PL_A) · 다음 협의(L_PH_C13) 레이아웃은 삭제되어 어느 덱에도 없다.
const PAGES={bs_account_inspire:14,bs_account_paulbassett:28,bs_account_episode:14};
assert.equal(Object.values(ACCOUNT.fills).flat().length,56);
assert.deepEqual(FEATURED,ACCOUNT.scenarios.map(s=>s.id));
for(const s of ACCOUNT.scenarios){
 const analysis=s.id!=='bs_account_paulbassett';
 assert.equal(SC[s.id].sourceMode,analysis?'public-account-analysis':'toc-template');
 assert.equal(slidesOfScenario(s).length,PAGES[s.id]);assert.equal(FILLS[s.id].length,PAGES[s.id]);
 assert.ok(!slidesOfScenario(s).some(x=>['L_PH_IP_A','L_PH_PL_A','L_PH_C13'].includes(x.f)));
 assert.equal(FILL_CUSTOMER[s.id],ACCOUNT.customers[s.id]);
 const first=slidesOfScenario(s).slice(1,5).map(x=>x.f);
 assert.deepEqual(first,analysis?['L_PH_CB_P','L_PH_CB_M','L_PH_CB_B','L_AC_GOV_01']:['L_TOC_INDEX5','L_VS_DIV_R3','L_TOC_UAPROF','L_TOC_UAPAIN']);
 assert.ok(s.research.documents.length>=4);assert.ok(s.research.facts.length>=2);
 assert.equal(ACCOUNT.story[s.id].keymen.reduce((n,k)=>n+k[1],0),100);
 assert.equal(s.coverRevision,'single-photo-cover-v1');
 for(const [k,page]of ACCOUNT.fills[s.id].entries()){
  assert.equal(page.f,slidesOfScenario(s)[k].f);
  if(analysis){
   assert.ok(page.notes.includes('2026-10-22'));assert.ok(page.notes.includes('[공개자료 기반 B2B 검토안]'));
   assert.ok(page.notes.includes('[분석·제안]'));assert.ok(page.notes.includes('[근거]'));
   assert.ok(Object.values(page.t).every(t=>typeof t==='string'&&t.trim()));
  }
  // 같은 장의 사진은 서로 달라야 한다 — 제품 컷은 같은 제품이 두 공간에 놓일 수 있어(공간 × 제품 맵) scenario_image_swaps.json이 다른 컷으로 바꾼다
  const photos=Object.values(page.img).filter(i=>i.kind!=='product'&&i.fit!=='contain').map(i=>i.src);
  assert.equal(new Set(photos).size,photos.length);
 }
}
const paulDeck=SC.bs_account_paulbassett,paul=ACCOUNT.fills.bs_account_paulbassett;
const cafe=JSON.stringify(paul)+JSON.stringify(paulDeck);
assert.ok(cafe.includes('엠즈씨드')&&cafe.includes('직영')&&cafe.includes('크라운 오더'));
// 목차는 템플릿 그대로 다섯 — 추가한 장은 새 목차가 아니라 해당 목차 아래에 들어간다
assert.equal(paulDeck.template,'spacex');
assert.deepEqual(paulDeck.flow.map(g=>g.name),['표지','목차 · 01 당사의 이해','02 카페 핵심 기술','03 공간별 가치 제안','04 도입사례','05 Why Samsung']);
const under=name=>paulDeck.flow.find(g=>g.name.endsWith(name)).slides.map(x=>x.f);
assert.ok(under('당사의 이해').includes('L_PH_CH_B')&&under('당사의 이해').includes('L_TOC_UAPROF'));
assert.ok(under('핵심 기술').includes('L_PH_SOL_S'));
assert.ok(under('공간별 가치 제안').includes('L_VS_MAP_5')&&under('공간별 가치 제안').filter(f=>f==='L_VS_SPACE').length===2);
// 간지의 '이 장에서 다루는 것'은 추가한 장까지 실제 쪽과 맞는다
const pages=paulDeck.flow.flatMap(g=>g.slides);
for(const [k,page]of paul.entries()){
 const m=/^L_VS_DIV_R(\d)$/.exec(page.f);if(!m)continue;
 const next=pages.findIndex((x,i)=>i>k&&/^L_VS_DIV_R\d$/.test(x.f)),end=next<0?pages.length:next;let last=k+1;
 for(let r=0;r<+m[1];r++){const [a,b]=String(page.t[7+3*r]).split('–').map(Number);assert.equal(a,last+1,'divider on page '+(k+1)+' row '+(r+1));last=b||a;}
 assert.ok(last<=end,'divider on page '+(k+1)+' stays inside its part');
}
// 자리표시 · 다른 샘플의 수치 · 가맹 구조 문구가 없다 (도입사례 장은 밀키프레소 — 가맹 본사 — 의 사실이라 빼고 본다)
assert.ok(!/\[0+\]|고객사 로고/.test(JSON.stringify(paul)));
assert.ok(!/가맹|로열티|320개|186개|9일|3\.2일|기존의 인쇄 메뉴판/.test(JSON.stringify(paul.filter(page=>page.f!=='L_VS_CASE'))));
// 표지 · 당사의 이해 · 마무리에는 폴 바셋의 공식 사진
for(const k of [0,2,paul.length-1])assert.ok(Object.values(paul[k].img).some(i=>i.src.includes('/account-cases/paul-')),'Paul Bassett official photograph on page '+(k+1));
const residence=JSON.stringify(ACCOUNT.fills.bs_account_episode);
assert.ok(residence.includes('디앤디프라퍼티솔루션')&&residence.includes('개인 계정'));
assert.ok(residence.includes('운영사의 수입과 임대료 귀속을 동일시하지 않고'));
assert.ok(!/486세대|201세대|유상 옵션 매출|청약 결정/.test(residence));
for(const p of PHOTOS){
 const bytes=await fs.readFile(path.join(root,'app/web/public',p.src));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),p.sha256);
 assert.ok(p.owner&&p.page&&p.desc&&p.w>250&&p.h>150);
}
console.log(JSON.stringify({scenarios:3,slides:Object.values(ACCOUNT.fills).flat().length,sourcedPhotos:PHOTOS.length,complete:true}));
