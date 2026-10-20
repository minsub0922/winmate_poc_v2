import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { GUIDES,GUIDE_SCENARIO_ID } from '../web/src/domain/guides/catalog.js';
import { GUIDE_QUESTIONS } from '../web/src/domain/guides/questions.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const guides=GUIDES.map(guide=>{
  if(GUIDE_QUESTIONS[guide.id]?.length!==5)throw new Error(guide.id+': five suggested questions are required');
  return {...guide,questions:GUIDE_QUESTIONS[guide.id],steps:guide.steps.map((step,index)=>({page:index+1,...step}))};
});
const content={example_scenario:GUIDE_SCENARIO_ID,app_rules:[
 '가이드는 읽기 전용이다. 기능 실행·개인 자료 변경은 하지 않고 관련 가이드 단계로만 이동한다.',
 '로그인 전에도 가이드를 볼 수 있다. AI 질문 전송을 포함한 POST·생성·수정 작업에는 로그인이 필요하다.',
 '로그인한 사용자가 프로필을 누르면 오른쪽 팝업에 계정 정보와 로그아웃 버튼이 표시된다.',
 '챗봇은 가이드 팝업 안의 우측 하단에 있고 가이드 조작과 함께 사용할 수 있다. 챗봇 또는 가이드 팝업을 닫으면 대화와 입력이 즉시 사라지고 진행 중인 요청은 취소한다.',
 'Storyboard 가이드는 새 제안서 작성 → 빈 고객 요구사항 입력 → 저장 → 제품·솔루션 매칭 → 파트 구성 순서로 시작한다. Best Scenario 복사에서 시작하도록 안내하지 않는다. 설명용 데이터는 bs01 전국 매장 디지털 메뉴보드 전환을 참고하며 가상 고객 조건·수치를 실제 성과로 확정하지 않는다.'
],guides};
const version=createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0,16);
const target=path.join(root,'app/data/guide_context.json'),next=JSON.stringify({version,...content},null,2)+'\n';
if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==next){const temp=target+'.tmp';fs.writeFileSync(temp,next);fs.renameSync(temp,target);}
console.log(`Guide context ready: ${guides.length} guides, ${guides.reduce((n,g)=>n+g.steps.length,0)} steps`);
