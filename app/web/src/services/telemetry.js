import { browserStorage, configureUserStorage, onStorageWrite } from '../repositories/browser.js';

let profile=null, active=false, installed=false, page='', entered=0, trace='', events=[];
let sendingEvents=false,sendingHistory=false;
let eventFlight=null,inflightEvents=[];
const histories=new Map(), signatures=new Map(), sentErrors=new Set(), knownIds=new Map();
const historyIndex='winmate.v2.history-sync-index';
const eventOutbox='winmate.v2.activity-outbox';
function persistEvents(){try{browserStorage.setItem(eventOutbox,JSON.stringify([...inflightEvents,...events]));}catch{}}
let originalFetch=(...args)=>globalThis.fetch(...args);
const uid=()=>globalThis.crypto?.randomUUID?.().replaceAll('-','') || Math.random().toString(36).slice(2)+Date.now().toString(36);
const keyKinds={
  'winmate.v2.proposals':'proposal','winmate.v2.reviews':'review','winmate.v2.sims':'simulation',
  'winmate.v2.jobs':'job','winmate.v2.simPersonas':'persona','winmate.v2.favs':'favorite',
};
function sanitized(value) {
  return String(value || '').replace(/AIza[\w-]{20,}/g,'[redacted]').replace(/(api[_-]?key|authorization|password)(\s*[=:]\s*)[^\s,;]+/gi,'$1$2[redacted]').slice(0,18000);
}
export function trackingHeaders(feature='') {
  if(!active)return {};
  return {'X-Winmate-User':profile.username,'X-Winmate-Trace':trace || (trace=uid()),'X-Winmate-Page':page,
    ...(feature && /^[a-zA-Z0-9._:-]{1,100}$/.test(feature) ? {'X-Winmate-Feature':feature} : {})};
}
function enqueue(kind,action='',extra={}) {
  if(!active)return;
  events.push({id:uid(),kind,action,at:Date.now()/1000,trace_id:trace || (trace=uid()),page,feature:page.split(':')[0],...extra});
  persistEvents();
  if(events.length>=30)void flushEvents();
}
async function send(path,value,keepalive=false) {
  if(!active)return false;
  try {
    const response=await originalFetch('/api/activity/'+path,{method:'POST',headers:{'Content-Type':'application/json',...trackingHeaders('activity')},credentials:'same-origin',body:JSON.stringify(value),keepalive});
    if(response.status===409){location.reload();return false;}
    return response.ok;
  } catch{return false;}
}
async function flushEvents(keepalive=false) {
  if(eventFlight)return eventFlight;
  if(!active || !events.length)return;
  sendingEvents=true;
  eventFlight=(async()=>{
    const batch=[];let bytes=0;
    while(events.length && batch.length<80){const size=new TextEncoder().encode(JSON.stringify(events[0])).length;if(batch.length && bytes+size>180000)break;bytes+=size;batch.push(events.shift());}
    inflightEvents=batch;persistEvents();
    if(!await send('events',{events:batch},keepalive))events=[...batch,...events];
    inflightEvents=[];
    persistEvents();
  })();
  try{await eventFlight;}finally{eventFlight=null;sendingEvents=false;}
}
function rowsOf(value,kind) {
  if(kind==='favorite')return [{id:'favorites',value}];
  if(Array.isArray(value))return value.map((v,i)=>typeof v==='object'&&v ? v : {id:kind+'-'+String(v ?? i),value:v});
  if(value && typeof value==='object')return Object.entries(value).map(([id,v])=>typeof v==='object'&&v ? {id,...v} : {id,value:v});
  return [];
}
function changed(key,value) {
  const kind=keyKinds[key];if(!active || !kind)return;
  // Removing a browser cache key is not a command to erase server history.
  if(value===null){histories.delete(kind);signatures.delete(key);knownIds.delete(kind);return;}
  try {
    const raw=value;if(signatures.get(key)===raw)return;
    const records=rowsOf(JSON.parse(raw),kind);
    const identifier=row=>String(row.id || row.f || row.key || '');
    const next=new Set(records.map(identifier).filter(Boolean));
    const previous=knownIds.get(kind) || new Set();
    const pending=histories.get(kind);
    const removed=new Set(pending?.removed || []);
    for(const id of previous)if(!next.has(id))removed.add(id);
    for(const id of next)removed.delete(id);
    // Retain a record created and removed between two flushes as an archived history.
    const recordsById=new Map((pending?.records || []).map(row=>[identifier(row),row]));
    for(const row of records)recordsById.set(identifier(row),row);
    knownIds.set(kind,next);
    histories.set(kind,{key,raw,records:[...recordsById.values()],removed:[...removed],ids:[...next]});
  } catch {recordFailure(new Error('히스토리 동기화 데이터를 읽지 못했습니다.'),{feature:'history',code:'history_parse'});}
}
async function flushHistory() {
  if(!active || sendingHistory)return;
  sendingHistory=true;
  try {
    for(const [kind,value] of [...histories]) {
      if(await send('history',{kind,records:value.records,removed_ids:value.removed})) {
        signatures.set(value.key,value.raw);
        let saved={};try{saved=JSON.parse(browserStorage.getItem(historyIndex) || '{}');}catch{}
        saved[kind]=value.ids;browserStorage.setItem(historyIndex,JSON.stringify(saved));
        if(histories.get(kind)===value)histories.delete(kind);
      }
    }
  } finally {sendingHistory=false;}
}
export function recordScreen(route) {
  if(!active)return;
  const name=typeof route==='string' ? route : route?.name || 'home';
  const identity=name+':'+(route?.id || (route?.token ? '[shared]' : ''));
  if(identity===page)return;
  if(page)enqueue('screen.leave','leave',{duration_ms:Math.max(0,Date.now()-entered)});
  page=identity;entered=Date.now();trace=uid();
  enqueue('screen.enter','enter',{metadata:{route:name}});
}
export function recordFailure(error,context={}) {
  if(!active)return;
  const code=context.code || error?.code || error?.name || 'error';
  const message=sanitized(error?.message || error || '알 수 없는 오류');
  const key=code+message+trace;
  if(sentErrors.has(key))return;sentErrors.add(key);
  if(sentErrors.size>200)sentErrors.clear();
  enqueue('client.error',context.action || 'failure',{code,message,stack:sanitized(error?.stack),feature:context.feature || page.split(':')[0],metadata:{source:context.source || 'browser',request_trace:context.trace_id || ''}});
}
export async function startTelemetry(user) {
  profile=user;configureUserStorage(user);
  active=!!(user?.tracking_enabled && user?.username);
  if(!active)return;
  if(!installed) {
    try{const saved=JSON.parse(browserStorage.getItem(eventOutbox)||'[]');if(Array.isArray(saved))events=saved;}catch{}
    installed=true;originalFetch=globalThis.fetch.bind(globalThis);
    globalThis.fetch=async(input,options={})=>{
      let target;try{target=new URL(typeof input==='string' ? input : input.url,location.origin);}catch{return originalFetch(input,options);}
      if(target.origin!==location.origin || !target.pathname.startsWith('/api/') && !target.pathname.startsWith('/admin/api/'))return originalFetch(input,options);
      const internal=target.pathname.startsWith('/api/activity/');
      if(target.pathname==='/api/auth/logout' || target.pathname==='/api/auth/login') {
        await Promise.race([Promise.all([flushEvents(),flushHistory()]),new Promise(resolve=>setTimeout(resolve,750))]);
      }
      let feature=options.feature || '';
      if(!feature && typeof options.body==='string' && options.body.length<1000000) {
        try{const body=JSON.parse(options.body);feature=body.feature || body.kind || '';}catch{}
      }
      const headers=new Headers(options.headers || (typeof input==='object' ? input.headers : undefined));
      for(const [key,value] of Object.entries(trackingHeaders(feature)))headers.set(key,value);
      try {
        const response=await originalFetch(input,{...options,headers});
        if(response.status===409 && !internal) {
          const body=await response.clone().json().catch(()=>({}));
          if(body.code==='account_changed')location.reload();
        }
        return response;
      }catch(error){if(!internal && error?.name!=='AbortError')recordFailure(error,{source:'network',feature});throw error;}
    };
    document.addEventListener('click',event=>{
      if(!event.isTrusted)return;
      const target=event.target?.closest?.('button,a,[role="button"],[role="tab"],summary');
      if(!target||target.closest('[data-telemetry-private]'))return;
      trace=uid();
      const label=(target.getAttribute('aria-label') || target.getAttribute('data-action') || target.textContent || '').replace(/\s+/g,' ').trim().slice(0,160);
      const href=target.getAttribute('href') || '';
      enqueue('action',sanitized(label || target.tagName.toLowerCase()),{metadata:{element:target.tagName.toLowerCase(),id:target.id || '',href:href.startsWith('/') ? href.replace(/(\/s\/)[^/]+/,'$1[shared]') : ''}});
    },true);
    document.addEventListener('keydown',event=>{if(event.key==='Escape' && document.querySelector('[role="dialog"]'))enqueue('action','dialog.close.keyboard');},true);
    document.addEventListener('change',event=>{
      const target=event.target;
      if(!target?.matches?.('input,select,textarea') || target.type==='password'||target.closest('[data-telemetry-private]'))return;
      enqueue('action','change',{metadata:{field:target.getAttribute('aria-label') || target.name || target.id || target.tagName.toLowerCase(),type:target.type || target.tagName.toLowerCase()}});
    },true);
    window.addEventListener('error',event=>recordFailure(event.error || new Error(event.message || '화면 리소스 오류'),{source:'window.error'}));
    window.addEventListener('unhandledrejection',event=>recordFailure(event.reason || new Error('처리하지 못한 비동기 오류'),{source:'unhandledrejection'}));
    const leave=()=>{if(page){enqueue('screen.leave','leave',{duration_ms:Math.max(0,Date.now()-entered)});page='';}void flushEvents(true);};
    window.addEventListener('pagehide',leave);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){void flushEvents(true);void flushHistory();}});
    setInterval(()=>{void flushEvents();void flushHistory();},2500);
  }
  try{const index=JSON.parse(browserStorage.getItem(historyIndex)||'{}');for(const [kind,ids] of Object.entries(index))if(Array.isArray(ids))knownIds.set(kind,new Set(ids));}catch{}
  onStorageWrite(changed);
  try {
    let items=[],offset=0,total=1;
    while(offset<total){
      const response=await originalFetch('/api/activity/history?browser_only=true&limit=500&offset='+offset,{headers:trackingHeaders('history'),credentials:'same-origin'});
      if(!response.ok)break;const batch=await response.json();items.push(...batch.items);total=batch.total;offset+=batch.items.length;if(!batch.items.length)break;
    }
    if(items.length) {
      for(const [key,kind] of Object.entries(keyKinds)) {
        if(browserStorage.getItem(key)!==null)continue;
        const records=(items || []).filter(row=>row.kind===kind).map(row=>row.payload);
        if(records.length)browserStorage.setItem(key,JSON.stringify(kind==='favorite' ? records[0].value : records));
      }
    }
  }catch{}
  for(const key of Object.keys(keyKinds)) {
    const value=browserStorage.getItem(key);if(value!==null)changed(key,value);
  }
  void flushHistory();
}

export function synchronizeTemplate(id,value) {
  if(!active)return;
  void send('history',{kind:'template',records:[{...value,id}],complete:false});
}
