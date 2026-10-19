import { browserStorage, openDatabase, STORAGE_KEYS, DATABASES } from './browser.js';

const FORMAT = 'winmate-browser-v1';
async function encode(value) {
  if (value instanceof Blob) {
    const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(value); });
    return { __wmType:'Blob', data };
  }
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    let text = ''; for (let i=0;i<bytes.length;i+=32768) text += String.fromCharCode(...bytes.subarray(i,i+32768));
    return { __wmType:value instanceof ArrayBuffer ? 'ArrayBuffer' : value.constructor.name, data:btoa(text) };
  }
  if (value instanceof Date) return { __wmType:'Date', data:value.toISOString() };
  if (Array.isArray(value)) return Promise.all(value.map(encode));
  if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([k,v]) => [k,await encode(v)])));
  return value;
}
function decode(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decode);
  if (value.__wmType === 'Blob') {
    const [header,body] = value.data.split(',');
    return new Blob([Uint8Array.from(atob(body),c=>c.charCodeAt(0))],{type:header.slice(5).split(';')[0]});
  }
  if (value.__wmType === 'Date') return new Date(value.data);
  if (value.__wmType) {
    const bytes = Uint8Array.from(atob(value.data),c=>c.charCodeAt(0));
    if (value.__wmType === 'ArrayBuffer') return bytes.buffer;
    const types = { Uint8Array,Uint16Array,Uint32Array,Int8Array,Int16Array,Int32Array,Float32Array,Float64Array,Uint8ClampedArray };
    if (!types[value.__wmType]) throw new Error('지원하지 않는 저장 형식: '+value.__wmType);
    return new types[value.__wmType](bytes.buffer);
  }
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decode(v)]));
}
function connect(name) {
  return new Promise((resolve,reject) => {
    const request = openDatabase(name,1);
    request.onupgradeneeded = () => {
      for (const [store,options] of Object.entries(DATABASES[name])) if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store,options);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 탭의 데이터베이스 작업이 끝난 후 다시 시도하세요.'));
  });
}
function readStore(db,name) {
  return new Promise((resolve,reject) => {
    const out=[];const tx=db.transaction(name,'readonly');const request=tx.objectStore(name).openCursor();
    request.onsuccess=()=>{const cursor=request.result;if(cursor){out.push({key:cursor.key,value:cursor.value});cursor.continue();}};
    tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(tx.error);
  });
}
export async function exportBackup() {
  const local = Object.fromEntries(STORAGE_KEYS.map(key=>[key,browserStorage.getItem(key)]).filter(([,value])=>value!==null));
  const databases={};
  for(const name of Object.keys(DATABASES)) {
    const db=await connect(name);
    try { databases[name]=Object.fromEntries(await Promise.all(Object.keys(DATABASES[name]).map(async store=>[store,await encode(await readStore(db,store))]))); }
    finally { db.close(); }
  }
  return { format:FORMAT,version:1,createdAt:new Date().toISOString(),local,databases };
}
export async function importBackup(backup) {
  if (backup?.format!==FORMAT || backup.version!==1) throw new Error('Winmate 브라우저 백업 파일이 아닙니다.');
  const local=Object.entries(backup.local||{});
  for(const [key,value]of local)if(!STORAGE_KEYS.includes(key)||typeof value!=='string')throw new Error('알 수 없는 저장소 키: '+key);
  const recordKeys={'winmate.v2.proposals':'id','winmate.v2.reviews':'id','winmate.v2.sims':'id','winmate.v2.favs':'id','winmate.v2.simPersonas':'key'};
  const localPlans=local.map(([key,value])=>{
    let incoming;try{incoming=JSON.parse(value);}catch{throw new Error('손상된 저장소 JSON: '+key);}
    const field=recordKeys[key];
    if(field){
      if(!Array.isArray(incoming)||incoming.some(x=>!x||typeof x!=='object'||!x[field]))throw new Error('손상된 기록 목록: '+key);
      let existing=[];try{const old=JSON.parse(browserStorage.getItem(key)||'[]');if(Array.isArray(old))existing=old;}catch{}
      const ids=new Set(incoming.map(x=>x[field]));
      value=JSON.stringify([...incoming,...existing.filter(x=>x&&!ids.has(x[field]))]);
    }else if(key==='wm-linkmeta-v1'){
      if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))throw new Error('손상된 링크 캐시');
      let existing={};try{const old=JSON.parse(browserStorage.getItem(key)||'{}');if(old&&typeof old==='object'&&!Array.isArray(old))existing=old;}catch{}
      value=JSON.stringify({...existing,...incoming});
    }
    return [key,value];
  });
  const plans=[];
  for(const [name,stores]of Object.entries(backup.databases||{})){
    if(!Object.hasOwn(DATABASES,name))throw new Error('알 수 없는 데이터베이스: '+name);
    for(const [store,records]of Object.entries(stores)){
      if(!Object.hasOwn(DATABASES[name],store)||!Array.isArray(records))throw new Error('알 수 없는 저장소: '+store);
      const decoded=records.map(row=>({key:decode(row.key),value:decode(row.value)}));
      if(decoded.some(row=>row.key==null||row.value===undefined))throw new Error('손상된 데이터: '+store);
      plans.push({name,store,records:decoded});
    }
  }
  let count=0;
  for(const name of Object.keys(DATABASES)){
    const group=plans.filter(plan=>plan.name===name);if(!group.length)continue;
    const db=await connect(name);
    try{await new Promise((resolve,reject)=>{
      const tx=db.transaction(group.map(plan=>plan.store),'readwrite');
      for(const plan of group){const store=tx.objectStore(plan.store);for(const row of plan.records){store.keyPath?store.put(row.value):store.put(row.value,row.key);count++;}}
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('데이터 가져오기가 취소되었습니다.'));
    });}finally{db.close();}
  }
  for(const [key,value]of localPlans)browserStorage.setItem(key,value);
  return {keys:local.length,records:count};
}
