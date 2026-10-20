const subscribers=new Set(),timers=new Map();
let items=[],sequence=0;
export const notificationSnapshot=()=>items;
export const subscribeNotifications=listener=>{subscribers.add(listener);return()=>subscribers.delete(listener);};
const emit=()=>subscribers.forEach(listener=>listener());
export function dismissNotification(id){clearTimeout(timers.get(id));timers.delete(id);const next=items.filter(item=>item.id!==id);if(next.length!==items.length){items=next;emit();}}
export function notify(message,kind='',options={}){
  const id=options.id||'notice-'+ ++sequence;
  const duplicate=typeof message==='string'&&items.find(item=>item.id!==id&&item.message===message&&item.kind===kind&&!options.content);
  if(duplicate)dismissNotification(duplicate.id);
  clearTimeout(timers.get(id));items=[...items.filter(item=>item.id!==id),{...options,id,message,kind}];emit();
  const duration=options.duration??(kind==='error'?0:kind==='warn'?6500:3500);
  if(duration>0)timers.set(id,setTimeout(()=>dismissNotification(id),duration));
  return id;
}
