import BASE from './cover_migrations.json' with {type:'json'};
import {SC} from './scenarios.js';
import {fillOf,FILL_CUSTOMER} from './scenario_fills.js';

const stable=v=>v&&typeof v==='object'?(Array.isArray(v)?'['+v.map(stable).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}'):JSON.stringify(v);
const hash=value=>{const text=stable(value);let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return(h>>>0).toString(16).padStart(8,'0');};
const text=v=>String(v?.html??v??'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim();
const opening=p=>p.parts?.find(part=>part.deck)?.layouts?.[0]||(p.parts||[]).flatMap(part=>part.layouts||[])[0];

export function needsCoverRefresh(proposal){
 const s=SC[proposal.scenario],before=BASE[proposal.scenario],first=opening(proposal);
 if(first?.ov?.bg&&first.ov.bg.theme!==proposal.scenario)return false;
 return !!(s?.coverRevision&&before&&first&&proposal.coverRevision!==s.coverRevision&&(first.f===before.f||before.alternatives?.[first.f]));
}

// Only replace the opening sheet; edited body pages and project details stay intact.
export function refreshProposalCover(proposal){
 if(!needsCoverRefresh(proposal))return false;
 const s=SC[proposal.scenario],first=opening(proposal),base=BASE[proposal.scenario],before=first.f===base.f?base:base.alternatives[first.f],old=first.ov||{};
 const f=s.flow[0].slides[0].f,next=fillOf(s.id,0,f);
 const customerKey=first.f==='L_C08'?'7':first.f==='L_C01'?'5':first.f==='L_C02'?'4':null;
 const scopeKey=first.f==='L_C08'?'8':['L_C01','L_C02'].includes(first.f)?'6':null;
 const title=old.t?.[before.title],subtitle=old.t?.[before.subtitle];
 if(title!=null&&hash(title)!==before.t[before.title]&&text(title))next.t['3']=text(title);
 if(before.subtitle!==customerKey&&subtitle!=null&&hash(subtitle)!==before.t[before.subtitle]&&text(subtitle))next.t['4']=text(subtitle);
 const customer=old.t?.[customerKey],scope=old.t?.[scopeKey],destination=f==='L_C01'?'5':'6';
 if(customer!=null&&hash(customer)!==before.t[customerKey]&&text(customer))next.t[destination]=text(customer);
 else{const name=proposal.req?.form?.customer||proposal.customer;if(name&&name!==FILL_CUSTOMER[s.id])next.t[destination]=name;}
 if(scope!=null&&hash(scope)!==before.t[scopeKey]&&text(scope)){if(f==='L_C01')next.t['6']=text(scope);else next.t['6']+=' · '+text(scope);}
 const image=old.img?.[before.image];
 if(image?.src&&hash(image)!==before.img)next.img['0']={...structuredClone(image),keep:true};
 if(old.notes!=null)next.notes=old.notes;
 proposal.coverArchive={version:1,layout:structuredClone(first)};
 first.f=f;first.ov=next;first.status='done';
 delete first.adaptation; // An old queued fill belongs to the discarded cover schema.
 proposal.coverRevision=s.coverRevision;
 return true;
}
