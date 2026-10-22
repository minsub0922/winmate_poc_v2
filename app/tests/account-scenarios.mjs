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
assert.equal(Object.values(ACCOUNT.fills).flat().length,51);
assert.deepEqual(FEATURED,ACCOUNT.scenarios.map(s=>s.id));
for(const s of ACCOUNT.scenarios){
 assert.equal(SC[s.id].sourceMode,'public-account-analysis');
 assert.equal(slidesOfScenario(s).length,17);assert.equal(FILLS[s.id].length,17);
 assert.equal(FILL_CUSTOMER[s.id],ACCOUNT.customers[s.id]);
 const first=slidesOfScenario(s).slice(1,5).map(x=>x.f);
 assert.deepEqual(first,['L_PH_CB_P','L_PH_CB_M','L_PH_CB_B','L_AC_GOV_01']);
 assert.ok(s.research.documents.length>=4);assert.ok(s.research.facts.length>=2);
 assert.equal(ACCOUNT.story[s.id].keymen.reduce((n,k)=>n+k[1],0),100);
 assert.equal(s.coverRevision,'single-photo-cover-v1');
 for(const [k,page]of FILLS[s.id].entries()){
  assert.equal(page.f,slidesOfScenario(s)[k].f);
  assert.ok(page.notes.includes('2026-10-22'));assert.ok(page.notes.includes('[공개자료 기반 B2B 검토안]'));
  assert.ok(page.notes.includes('[분석·제안]'));assert.ok(page.notes.includes('[근거]'));
  assert.ok(Object.values(page.t).every(t=>typeof t==='string'&&t.trim()));
  assert.equal(new Set(Object.values(page.img).map(i=>i.src)).size,Object.keys(page.img).length);
 }
}
const cafe=JSON.stringify(ACCOUNT.fills.bs_account_paulbassett);
assert.ok(cafe.includes('엠즈씨드')&&cafe.includes('직영')&&cafe.includes('크라운 오더'));
assert.ok(cafe.includes('가맹비·로열티 구조로 가정하지 않음'));
assert.ok(!/320개|9일|1~2주씩|기존의 인쇄 메뉴판/.test(cafe));
const residence=JSON.stringify(ACCOUNT.fills.bs_account_episode);
assert.ok(residence.includes('디앤디프라퍼티솔루션')&&residence.includes('개인 계정'));
assert.ok(residence.includes('운영사의 수입과 임대료 귀속을 동일시하지 않고'));
assert.ok(!/486세대|201세대|유상 옵션 매출|청약 결정/.test(residence));
for(const p of PHOTOS){
 const bytes=await fs.readFile(path.join(root,'app/web/public',p.src));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),p.sha256);
 assert.ok(p.owner&&p.page&&p.desc&&p.w>250&&p.h>150);
}
console.log(JSON.stringify({scenarios:3,slides:51,accountAnalysisSheets:12,sourcedPhotos:PHOTOS.length,complete:true}));
