import { sessionSnapshot } from '../api/session.js';
import { requestJson,postJson,fetchResource } from '../api/client.js';
import { embedSpatial } from '../domain/spatial/slide-binding.js';
import { createProposal,update,uid,getProposals } from '../repositories/proposals.js';
import { loadSpatialRenderer } from './spatial-renderer.js';

let libraryPromise;
const revisions=new Map();
export function loadSpatialLibrary(revision){
  if(revision){if(!/^[a-f0-9]{8}$/.test(revision))return Promise.reject(new Error('오브젝트 버전이 올바르지 않습니다.'));
    if(!revisions.has(revision))revisions.set(revision,requestJson('/api/spatial/library/'+revision).catch(error=>{revisions.delete(revision);throw error;}));return revisions.get(revision);}
  return libraryPromise||=((async()=>{
    // The API can outlive a library rebuild. Resolve the published immutable
    // revision so a refreshed page uses the new template dimensions immediately.
    const response=await fetchResource('/assets/spatial-current.json',{cache:'no-store'}).catch(()=>null);
    const current=response?.ok?await response.json().catch(()=>null):null;
    return current?.sourceHash&&/^[a-f0-9]{8}$/.test(current.sourceHash)?loadSpatialLibrary(current.sourceHash):requestJson('/api/spatial/library');
  })().catch(error=>{libraryPromise=null;throw error;}));
}
export const SPATIAL_HISTORY_PAGE_SIZE=8;
export async function loadSpatialHistory({page=1,pageSize=SPATIAL_HISTORY_PAGE_SIZE,signal}={}){
  if(sessionSnapshot().guest)return {items:[],total:0,page:1,page_size:pageSize,total_pages:0};
  const data=await requestJson('/api/spatial/history?'+new URLSearchParams({page:String(page),page_size:String(pageSize)}),{signal});
  if(Number.isInteger(data.total))return data;
  // Keep older response snapshots bounded while the frontend and API are updated.
  const total=data.items.length,total_pages=Math.ceil(total/pageSize),current=Math.min(page,total_pages||1);
  return {...data,items:data.items.slice((current-1)*pageSize,current*pageSize),total,page:current,page_size:pageSize,total_pages};
}
export const getSpatialHistory=id=>requestJson('/api/spatial/history/'+encodeURIComponent(id));
export const planSpatial=(body,signal)=>postJson('/api/spatial/plan',body,signal);
export const editSpatial=(body,signal)=>postJson('/api/spatial/edit',body,signal);
export const describeSpatialTarget=(scene,targetId,signal)=>postJson('/api/spatial/layout-description',{scene,targetId},signal);
export const saveSpatialHistory=(scene,view,record,extra={})=>record?requestJson('/api/spatial/history/'+encodeURIComponent(record.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene,view,revision:record.revision,...extra})}):postJson('/api/spatial/history',{scene,view,...extra});
export const createSpatialDraft=(form,view='3d')=>postJson('/api/spatial/drafts',{form,view});
export const saveSpatialForm=(form,view,record,extra={})=>requestJson('/api/spatial/drafts/'+encodeURIComponent(record.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({form,view,revision:record.revision,...extra})});
export async function deleteSpatialHistory(id){const response=await fetchResource('/api/spatial/history/'+encodeURIComponent(id),{method:'DELETE'});if(!response.ok)throw new Error('조감도를 삭제하지 못했습니다.');}
export async function captureSpatial(scene,library){
  const {createSpatialRenderer}=await loadSpatialRenderer();
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-20000px;top:0;width:1600px;height:1025px;';document.body.appendChild(host);
  let renderer;
  try{renderer=createSpatialRenderer(host);renderer.setScene(scene,library);await renderer.ready();return renderer.snapshot();}
  finally{renderer?.dispose();host.remove();}
}

// Cards share snapshots and render one scene at a time to avoid exhausting WebGL contexts.
const previewImages=new Map();
let previewQueue=Promise.resolve();
export function spatialPreviewImage(scene,library){
  const key=library.sourceHash+':'+scene.contentHash;
  if(!previewImages.has(key)){
    const pending=previewQueue.then(()=>captureSpatial(scene,library)).then(snapshot=>snapshot.image).catch(error=>{previewImages.delete(key);throw error;});
    previewQueue=pending.catch(()=>{});previewImages.set(key,pending);
    if(previewImages.size>48)previewImages.delete(previewImages.keys().next().value);
  }
  return previewImages.get(key);
}
export function spatialSlides(scene,library,{snapshot,views=['2d','3d']}={}){
  return views.flatMap(view=>Array.from({length:Math.ceil(scene.rooms.length/6)},(_,i)=>({uid:uid('spatial'),f:'L_SPATIAL_'+view.toUpperCase(),status:'done',
    ov:{t:{},img:{},spatial:embedSpatial(scene,library,{view,snapshot:view==='3d'?snapshot:undefined,roomIds:scene.rooms.slice(i*6,(i+1)*6).map(r=>r.id)})},
    part:'공간별 제품 배치',source:{type:'spatial',contentHash:scene.contentHash,sceneVersion:scene.version}})));
}
export function attachSpatial(scene,library,slides,{proposalId,historyId}={}){
  const id=proposalId||createProposal(),products=[...new Set(scene.objects.filter(o=>o.assetId.startsWith('product:')).map(o=>o.assetId.slice(8)))];
  const changed=update(id,d=>{
    if(!proposalId){d.title=scene.title;d.ind=scene.industry;d.stage='story';d.req.free=[{t:scene.title+' · 공간별 삼성 제품 배치 제안'}];}
    d.ctx.products=[...new Set([...d.ctx.products,...products])];
    d.parts.push({id:uid('s'),name:'공간 조감도 · '+scene.title,type:'scenario',items:scene.rooms.map(r=>r.name),text:'장면 JSON의 공간·제품 좌표와 투영 좌표를 연결한 개념 배치 제안',form:'list',done:true,
      layouts:slides.map(x=>({...x,spatialHistoryId:historyId||null}))});
  });
  if(!changed)throw new Error('이 제안서에 조감도를 연결할 권한이 없습니다.');return id;
}
export const spatialProposalChoices=()=>getProposals().filter(p=>!p._share||p._share.canEdit);
