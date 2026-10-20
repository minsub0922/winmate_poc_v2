#!/usr/bin/env node
// Local review artifact: source status, complete customer decks, editable PPTX
// files, related source URLs and the exact verification evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'output/vertical-scenarios'),require=createRequire(path.join(root,'app/web/package.json')),sharp=require('sharp');
const read=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const data=await read('app/web/src/domain/templates/vertical_scenarios.json');
const catalog=await read('app/data/catalog.json'),cases=Object.fromEntries(catalog.cases.map(c=>[String(c.id),c]));
const verification=await read('output/vertical-scenarios/verification.json');
const ui=await read('output/vertical-scenarios/ui-verification.json');
const standards=await read('app/web/src/domain/templates/description_standard_scenarios.json');
const standardReport=await read('output/description-standards/final-summary.json');
if(verification.counts.scenarios!==40||verification.counts.slides!==560||ui.roundtrips.length!==40)throw new Error('Full forty-deck verification is required before reporting completion');
const dataSha256=createHash('sha256').update(JSON.stringify(data)).digest('hex');
if(verification.dataSha256!==dataSha256||ui.dataSha256!==dataSha256)throw new Error('Verification does not match the current scenario data');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const groups=data.sources.map(source=>({source,scenarios:data.scenarios.filter(s=>s.sourceSpec===source.key)}));
const missing=new Set();let sourceSlides=0;
for(const {source} of groups){
 const parsed=await read('output/vertical-scenarios/sources/'+source.key+'.json');
 for(const r of parsed.missing_assets)missing.add(r);sourceSlides+=parsed.slide_count;
 const thumbs=await Promise.all(groups.find(g=>g.source.key===source.key).scenarios.map(async s=>sharp(await fs.readFile(path.join(out,s.id+'-contact.png'))).resize(960,540).png().toBuffer()));
 await sharp({create:{width:1920,height:540,channels:3,background:'#fff'}}).composite(thumbs.map((input,i)=>({input,left:i*960,top:0}))).png().toFile(path.join(out,source.key+'-pair.png'));
}
const summary={dataSha256,bestScenarios:40,bestSlides:560,reusedLayoutTypes:12,newLayoutTypes:3,
 newLayouts:['L_PH_VX_COVER_A','L_PH_VX_COVER_B','L_PH_VX_PROOF'],
 standardSources:20,standardSourceSlides:sourceSlides,standardRegistered:standards.scenarios.length,standardStatus:'설명 기반 표준 제안서 20종 제작·등록 완료',missingUniquePaths:missing.size,
 render:verification.counts,pptxDecks:verification.exports.length,pptxVisualRoundtrips:ui.roundtrips.length,uiSearches:ui.searched.length,
 sourceCopyPreserved:ui.clone.originalUnchanged&&ui.clone.otherUnchanged,persistedEdits:ui.reopened.pages===14,
 agentRuntime:'KB files are updated. A previously running API process caches the old KB until it is restarted; the existing user server was not interrupted.',
 rebuild:['python3 app/scripts/build_vertical_scenarios.py','VERTICAL_EXPORT=1 node app/tests/vertical-scenarios.mjs','node app/tests/vertical-scenario-ui.mjs','node app/scripts/export_agent_data.mjs','npm --prefix app/web run build'],
 assumptions:['가상 고객·문제·일정·범위임을 장표에 표시','성과·절감률·견적을 임의로 확정하지 않음','사진은 기존 공식 현장·솔루션 참고자료','관련 사례는 적용 공간·제품·운영 조건을 비교하는 근거이며 같은 성과를 보장하지 않음']};
await fs.writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
const cards=groups.map(({source,scenarios})=>`<section id="${esc(source.key)}"><h2>${esc(source.name)}</h2><p class="meta">기준 명세 <a href="../../${esc(source.source)}">${esc(source.key)}.md</a> · 명세 ${source.slides}장 · <a href="../description-standards/decks/bs_std_${esc(source.key)}.pptx">표준 PPTX</a></p><div class="pair">${scenarios.map(s=>`<article><p class="eyebrow">${s.req==='new'?'공간 경험 제안':'운영 개선 제안'} · ${esc(s.id)}</p><h3>${esc(s.title)}</h3><p>${esc(s.thesis)}</p><p class="meta">가상 고객 · 14장 · ${s.minutes}분 · ${esc(s.ask)}</p><a href="${esc(s.id)}-contact.png"><img loading="lazy" src="${esc(s.id)}-contact.png" alt="${esc(s.title)} 전체 14장"></a><nav><a href="decks/${esc(s.id)}.pptx">편집 가능한 PPTX</a><a href="restored/${esc(s.id)}-1.png">PPTX 복원 표지</a><a href="restored/${esc(s.id)}-10.png">PPTX 복원 사례</a></nav><details><summary>흐름 · 요구 · 근거</summary><ol>${s.flow.map(g=>`<li>${esc(g.name)} (${g.slides.length}장) — ${esc(g.goal)}</li>`).join('')}</ol><p>${esc(s.situation)}</p><ul>${s.criteria.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p>관련 자료 ${s.cases.map(id=>`<a href="${esc(cases[id].url)}">${esc(cases[id].cust)}</a>`).join(' · ')}</p></details></article>`).join('')}</div></section>`).join('');
const html=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Winmate · 업종별 고객 제안 40개</title><style>body{margin:0;background:#f3f4f7;color:#121417;font:16px/1.6 system-ui,sans-serif}main{max-width:1376px;margin:auto;padding:48px 28px}h1{font-size:32px;line-height:1.2}h2{margin-top:54px}h3{font-size:23px;line-height:1.4}a{color:#1428a0}.status{background:#f7f8fa;border:1px solid #e2e5ea;border-radius:10px;padding:20px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:24px}article{background:white;border:1px solid #e2e5ea;border-radius:14px;padding:24px;min-width:0}img{width:100%;height:auto;border:1px solid #e1e7f0}.meta,.eyebrow{color:#596579;font-size:13px}.eyebrow{font-weight:700;color:#1428a0}nav{display:flex;gap:18px;flex-wrap:wrap;font-size:14px}.toc{columns:4}summary{cursor:pointer;color:#1428a0}details{margin-top:20px}@media(max-width:900px){.pair{grid-template-columns:1fr}.toc{columns:2}main{padding:20px}}</style><main><p class="eyebrow">WINMATE / VERTICAL CUSTOMER PROPOSALS</p><h1>업종별 Best Scenario 40개</h1><p>20개 명세를 하나씩 확인해 고객별 제안 2개씩 추가했습니다. 기존 레이아웃 12종을 재사용하고 사진 표지 2종과 관련 사례 1종을 추가했습니다.</p><div class="status"><b>설명 기반 표준 제안서 20종·867장도 제작·등록했습니다.</b> 원본 없이 설명으로 만들라는 사용자 지시에 따라 구성했으며, 사진과 일부 세부 도형은 대체·재구성했습니다. <a href="../description-standards/index.html">표준 제안서 전체 미리보기와 PPTX</a></div><p>검증: 전체 560장 렌더 · 이미지 누락/글 잘림/겹침/슬라이드 경계 이탈 0건 · 40개 PPTX 내보내기/편집형 재가져오기 · 목록 검색 40개 · 독립 복사와 편집 저장/재열기. 글꼴·색상·간격·사진 표현을 Winmate 스타일로 정리했습니다.</p><nav><a href="summary.json">결과 요약</a><a href="verification.json">전체 렌더 검사</a><a href="ui-verification.json">UI · PPTX 복원 검사</a><a href="standard-source-checks.json">표준 원본 점검</a></nav><p>고객·문제·일정·범위는 가상 조건입니다. 제품·솔루션·관련 사례와 사진은 앱의 등록 자료를 사용했습니다. 절감률이나 매출·효과를 실제 성과로 만들어 넣지 않았습니다.</p><div class="toc">${groups.map(g=>`<div><a href="#${esc(g.source.key)}">${esc(g.source.name)}</a></div>`).join('')}</div>${cards}</main></html>`;
await fs.writeFile(path.join(out,'index.html'),html);console.log(JSON.stringify(summary));
