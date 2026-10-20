import catalog from './skills.json' with { type: 'json' };
import { requestCompletion } from '../../api/client.js';
import { getProposal, segRefs } from '../../repositories/proposals.js';
import { reqText } from '../../services/search.js';
import { setupText, setupRefs, refName } from './profile.js';
import { mentionedRefs, msgPlain, textToSegs } from './score.js';
import { P, S } from '../../services/catalog.js';
import { requirementContext } from '../proposals/requirement-summary.js';
export const SIMULATION_SKILLS = catalog;
export const SIMULATION_SKILL = Object.fromEntries(catalog.map(s => [s.id,s]));
export function skillDraftSegments(result, replyText = result.data.replies?.[0]?.text || result.data.reply_draft) {
  const refs=[...new Set([...(result.data.recommendations || []).map(r=>r.ref),...(result.sources || []).map(s=>s.ref).filter(Boolean)])];
  const aliases=new Map();
  for(const ref of refs){const [kind,id]=ref.split(':');const item=kind==='product'?P[id]:kind==='solution'?S[id]:null;if(!item)continue;for(const label of [item.model,item.name].filter(s=>s?.length>=3))if(!aliases.has(label.toLowerCase()))aliases.set(label.toLowerCase(),ref);}
  if(!aliases.size)return textToSegs(replyText);
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const expression=new RegExp('(?<![A-Za-z0-9_])(?:'+[...aliases.keys()].sort((a,b)=>b.length-a.length).map(escape).join('|')+')(?![A-Za-z0-9_])','gi');
  return textToSegs(replyText).flatMap(segment=>segment.ref?[segment]:textToSegs(segment.t.replace(expression,label=>'@'+aliases.get(label.toLowerCase()))));
}
const textOf = segs => (segs || []).map(s => s.t != null ? s.t : refName(s.ref) || s.ref).join('').trim();
export function skillRequest(sim, skillId, draft = []) {
  if (!SIMULATION_SKILL[skillId]) throw new Error('알 수 없는 제안 스킬입니다.');
  const proposal = sim.setup.pid ? getProposal(sim.setup.pid) : null;
  const profile = sim.profile;
  return { skill_id:skillId, prompt:textOf(draft).slice(0,4000),
    refs:[...new Set([...setupRefs(sim.setup), ...mentionedRefs(sim), ...segRefs(draft), ...(proposal ? ['product','solution','case'].flatMap(t => (proposal.ctx?.[t==='case'?'cases':t+'s'] || []).map(id=>t+':'+id)) : [])])].slice(0,40),
    context:{
      requirement_summary: proposal ? requirementContext(proposal, 'strategy') : null,
      customer:{ company:profile.company, name:profile.name, role:profile.role, ind:profile.ind, interests:profile.interests, revealed_concerns:profile.concerns.filter(c=>c.revealed).map(c=>({text:c.text,resolved:c.resolved})) },
      requirements:setupText(sim.setup).slice(0,8000), stage:sim.cur.stage,
      proposal:proposal ? {id:proposal.id,title:proposal.title,customer:proposal.customer,requirements:reqText(proposal).slice(0,4000),parts:(proposal.parts || []).slice(0,20).map(p=>({name:p.name,goal:String(p.goal || '').slice(0,150),text:[p.text,...(p.items || []),...(p.layouts || []).map(x=>Object.values(x.ov?.t || {}).map(v=>typeof v==='string'?v: v?.text || '').filter(Boolean).join('\n'))].filter(Boolean).join('\n').slice(0,650)}))} : null,
      messages:sim.msgs.filter(m=>m.who==='me'||m.who==='cust').slice(-20).map(m=>({who:m.who,text:msgPlain(m).slice(0,1000)})),
      shared_materials:sim.msgs.filter(m=>m.who==='me').flatMap(m=>m.materials || []).slice(-8).map(s=>({title:s.title,url:s.url,ref:s.ref,summary:String(s.summary || '').slice(0,500)})),
    }
  };
}
export async function runSimulationSkill(request,{signal,onProgress,onEvent}={}) {
  const result=await requestCompletion(request,{endpoint:'/api/simulation/skills/run',signal,onProgress,onEvent});
  if(result.mode!=='real'||result.data?.skill_id!==request.skill_id||!Array.isArray(result.data?.data?.replies)||result.data.data.replies.length!==3||result.data.data.replies.some(r=>!r?.text?.trim()||!r.title?.trim()||!Array.isArray(r.source_ids))||!Array.isArray(result.data?.data?.findings)||!Array.isArray(result.data?.sources)||!result.data?.research||result.data?.llm?.effective!=='llm')throw new Error('스킬 답변을 받지 못했습니다.');
  return result.data;
}
