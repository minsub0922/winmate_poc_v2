import DATA from './removed_layout_migrations.json' with {type:'json'};
import PRIOR from './prior_proposal_revisions.json' with {type:'json'};
import {SC} from './scenarios.js';
import {storyboardOf} from './scenario_storyboard.js';
import {refreshProposalCover} from './refresh_proposal_cover.js';

export const isRemovedLayout=f=>/^L_DSTD_|^L_PH_VX_/.test(f||'');
const stable=v=>v&&typeof v==='object'?(Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}'):JSON.stringify(v);
const hash=value=>{const text=stable(value);let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16).padStart(8,'0');};
const plain=value=>String(value?.html??value??'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim();
const visibleValue=value=>!(typeof value==='object'&&/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:[;"']|$)/i.test(value?.html||''));
const clone=value=>structuredClone(value);
const picture=im=>im?.src&&!im.src.includes('/description-standards/')?clone(im):{src:'img/ph/of-meeting.jpg',name:'회의 공간 · 공식 참고사진',keep:true,fit:'cover'};
const short=(s,n)=>s.length<=n?s:s.slice(0,Math.max(n*.6,s.lastIndexOf(' ',n))).trim();

// Refresh only unchanged copies of our previous authored scenarios. Any page or
// bubble edit, replacement image, drawing or background keeps the saved copy intact.
export function isPriorDefaultProposal(proposal){
 const baseline=PRIOR.scenarios[proposal.scenario],scenario=SC[proposal.scenario];
 if(!baseline||!scenario||proposal.authoringRevision===scenario.authoringRevision)return false;
 const pages=(proposal.parts||[]).flatMap(p=>p.layouts||[]),parts=(proposal.parts||[]).filter(p=>!p.deck);
 if(pages.length!==baseline.pages.length||parts.length!==baseline.parts.length)return false;
 if(parts.some((p,i)=>hash({name:p.name,goal:p.goal,items:p.items,type:p.type,form:p.form,text:p.text||''})!==baseline.parts[i]))return false;
 return pages.every((p,i)=>{const ov=p.ov||{};return p.f===baseline.pages[i].f&&!(ov.r||[]).length&&!Object.keys(ov).some(k=>!['t','img','r','notes'].includes(k))&&hash({t:ov.t,img:ov.img,notes:ov.notes||''})===baseline.pages[i].hash;});
}
function refreshPriorDefault(proposal,mk){
 if(!isPriorDefaultProposal(proposal))return false;
 proposal.parts=storyboardOf(SC[proposal.scenario],mk).parts;
 proposal.authoringRevision=SC[proposal.scenario].authoringRevision;
 return true;
}

function contentPage(item,changed,photo){
 const desc=DATA.removedPages[item.f]||{},ov=item.ov||{};
 const title=(visibleValue(ov.t?.[desc.title])?plain(ov.t?.[desc.title]??item.name):item.name)||'추가 요구사항';
 const all=[...(changed||[]),...(desc.body||[]).filter(i=>visibleValue(ov.t?.[i])).map(i=>plain(ov.t?.[i]))].filter(Boolean);
 const values=[...new Set(all)];while(values.length<3)values.push(['적용 공간과 담당자를 함께 확인합니다','설치·연동·운영 조건을 현장에서 확인합니다','세부 내용과 변경 이력을 기록합니다'][values.length]);
 const t={};
 Object.assign(t,{0:'현장 참고자료',1:short(title,35),2:'추가 검토',3:'요구사항과 확인할 내용을 함께 정리합니다',4:'현장 조건·사용자 요구·운영 기준',17:'고객 검토',18:'사용자 요구 · 상세 내용은 발표자 노트에 보존',19:'CONFIDENTIAL'});
 for(let k=0;k<3;k++){const i=5+k*4;t[i]=String(k+1).padStart(2,'0');t[i+1]=short(values[k],33);t[i+2]=values[k].length>33?short(values[k],86):'현장 조건과 담당자의 판단 기준을 함께 확인합니다';t[i+3]='고객 요구 · 적용 범위 확인';}
 const first=photo||(desc.imageSlots||[]).map(i=>ov.img?.[i]).find(im=>im?.src);
 const visible=[desc.title,...(desc.body||[])].filter(i=>i!=null&&visibleValue(ov.t?.[i])).map(i=>plain(ov.t?.[i])).filter(Boolean);
 return {...item,f:'L_PH_OV_H',ov:{t,img:{0:picture(first)},notes:'[이전 저장본의 표시 내용]\n'+visible.join('\n')+'\n\n'+(ov.notes||'')},status:'done'};
}

/** Migrate a filled favourite or a page from a hand-selected/partial deck. */
export function migrateRemovedLayoutItem(item){
 if(!isRemovedLayout(item?.f))return item;
 const desc=DATA.removedPages[item.f]||{};
 if(!item.ov)return{...item,f:desc.cover?'L_C01':'L_PH_OV_H',name:item.name||'검토 요약',ov:null};
 if(desc.cover){const ov=item.ov,title=plain(ov.t?.[desc.title])||item.name||'고객 제안',detail=(desc.body||[]).filter(i=>visibleValue(ov.t?.[i])).map(i=>plain(ov.t?.[i])).find(s=>s.length>14)||'제품·솔루션·운영 범위 검토';return{...item,f:'L_C01',ov:{t:{1:'고객 검토',2:'B2B PROPOSAL',3:short(title,45),4:short(detail,80),5:'제품·공간·운영 제안',6:'기준 조건 확인',7:'SAMSUNG'},img:{0:picture((desc.imageSlots||[]).map(i=>ov.img?.[i]).find(Boolean))},notes:ov.notes||''}};}
 return contentPage(item,null);
}

/** Replace obsolete generated decks, retaining edits and the original document. */
export function migrateRemovedLayouts(proposal,mk){
 const old=(proposal.parts||[]).flatMap(p=>p.layouts||[]);
 if(!old.some(x=>isRemovedLayout(x.f))){const refreshed=refreshPriorDefault(proposal,mk);return refreshProposalCover(proposal)||refreshed;}
 const baseline=DATA.scenarios[proposal.scenario],scenario=SC[proposal.scenario];
 const full=baseline&&scenario&&old.length===baseline.length&&old.every((x,i)=>x.f===baseline[i].f);
 proposal.removedLayoutArchive={version:1,parts:clone(proposal.parts)};
 if(!full){for(const part of proposal.parts||[])part.layouts=part.layouts.map(migrateRemovedLayoutItem);proposal.authoringRevision=SC[proposal.scenario]?.authoringRevision||'existing-layouts-v2';return true;}
 const fresh=storyboardOf(scenario,mk),personal=[];
 for(let i=0;i<old.length;i++){
  const item=old[i],ov=item.ov||{},before=baseline[i],desc=DATA.removedPages[item.f]||{};
  const changed=Object.entries(ov.t||{}).filter(([key,v])=>hash(v)!==before.t[key]&&plain(v)&&visibleValue(v)).map(([key,v])=>({key,text:plain(v)}));
  const images=Object.entries(ov.img||{}).filter(([key,v])=>hash(v)!==before.img[key]&&(!isRemovedLayout(item.f)||desc.imageSlots?.includes(key)));
  const noteChanged=hash(ov.notes||'')!==before.notes;
  if(!changed.length&&!images.length&&!noteChanged)continue;
  if(!isRemovedLayout(item.f)){const kept=clone(item);kept.uid=mk.lid('kept-'+i);personal.push(kept);continue;}
  if(desc.cover){
   const cover=fresh.parts.flatMap(p=>p.layouts).find(x=>x.f==='L_C08'||x.f==='L_C01'||x.f==='L_C02');
   if(cover&&changed.some(x=>x.key===desc.title))cover.ov.t[cover.f==='L_C08'?'2':'3']=changed.find(x=>x.key===desc.title).text;
   if(cover&&images.length)cover.ov.img['0']=picture(images[0][1]);
  }
  if(noteChanged){const summary=fresh.parts.flatMap(p=>p.layouts).find(x=>x.f==='L_PH_ES_A');if(summary)summary.ov.notes=(summary.ov.notes||'')+'\n\n[사용자 수정 노트]\n'+(ov.notes||'');}
  const body=changed.filter(x=>desc.body?.includes(x.key)&&(!desc.cover||x.key!==desc.title)).map(x=>x.text);
  if(body.length||(!desc.cover&&images.length)){
   for(let j=0;j<Math.max(1,Math.ceil(body.length/3));j++){
    const page=contentPage(item,body.slice(j*3,j*3+3),images[0]?.[1]);page.uid=mk.lid('personal-'+i+'-'+j);personal.push(page);
   }
  }
 }
 proposal.parts=fresh.parts;
 if(personal.length){const index=Math.max(1,proposal.parts.length-1);proposal.parts.splice(index,0,{id:mk.pid('personal'),type:'free',name:'추가 요구와 검토 내용',goal:'사용자가 추가한 요구를 보존합니다',items:['추가 요구사항','참고자료'],form:'list',text:'',done:true,layouts:personal});}
 proposal.authoringRevision=SC[proposal.scenario].authoringRevision;
 return true;
}
