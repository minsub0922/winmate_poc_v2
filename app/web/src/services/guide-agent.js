import { requestCompletion } from '../api/client.js';
import { GUIDE_BY_ID } from '../domain/guides/catalog.js';
export async function askGuide(message, history, current, signal, onText) {
  const reply=await requestCompletion({message,history,current,stream:true},{endpoint:'/api/guide/chat',signal,onText:frame=>onText?.(frame.text)});
  if(reply?.mode!=='real'||typeof reply.answer!=='string'||!reply.answer.trim())throw new Error('가이드 답변을 확인하지 못했어요. 다시 시도해 주세요.');
  if(reply.target){
    const guide=GUIDE_BY_ID[reply.target.guide_id],page=reply.target.page;
    if(!guide||!Number.isInteger(page)||page<1||page>guide.steps.length)throw new Error('가이드가 업데이트됐어요. 새로고침 후 다시 질문해 주세요.');
    reply.target={...reply.target,guide_title:guide.title,title:guide.steps[page-1].title};
  }
  return reply;
}
