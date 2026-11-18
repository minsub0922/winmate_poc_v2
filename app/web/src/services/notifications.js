const subscribers=new Set(),timers=new Map();
let items=[],sequence=0;
// 알림 자리(slot): 화면이 상단 바 가운데 자리를 열면(Storyboard) 그 화면의 알림은 오른쪽 아래 팝업 대신 그 자리에 뜬다.
// 나중에 연 자리가 앞선다 — 상단 바를 덮는 모달은 제 머리줄에 자리를 열고, 닫히면 상단 바로 돌아간다.
const slots=[];let slotTop=null,slotRoot=null;
const settleSlots=()=>{slotTop=slots[slots.length-1]||null;slotRoot=slots.find(slot=>slot.root)||null;};
export const activeSlot=()=>slotTop;
export const rootSlot=()=>slotRoot;
export function registerSlot(slot){slots.push(slot);settleSlots();emit();return()=>{const i=slots.indexOf(slot);if(i>=0)slots.splice(i,1);settleSlots();emit();};}
export const notificationSnapshot=()=>items;
export const subscribeNotifications=listener=>{subscribers.add(listener);return()=>subscribers.delete(listener);};
const emit=()=>subscribers.forEach(listener=>listener());
export function dismissNotification(id){clearTimeout(timers.get(id));timers.delete(id);const next=items.filter(item=>item.id!==id);if(next.length!==items.length){items=next;emit();}}
export function notify(message,kind='',options={}){
  const id=options.id||'notice-'+ ++sequence;
  // group: 같은 일을 여러 곳(장마다)이 알린다 — 하나로 줄이지 않고 자리에서 묶어 센다
  const duplicate=typeof message==='string'&&!options.group&&items.find(item=>item.id!==id&&item.message===message&&item.kind===kind&&!options.content);
  if(duplicate)dismissNotification(duplicate.id);
  clearTimeout(timers.get(id));const prev=items.find(item=>item.id===id);items=[...items.filter(item=>item.id!==id),{...options,id,message,kind,at:prev?prev.at:Date.now()}];emit();
  const duration=options.duration??(kind==='error'?0:kind==='warn'?6500:3500);
  if(duration>0)timers.set(id,setTimeout(()=>dismissNotification(id),duration));
  return id;
}
