import { sessionSnapshot } from '../api/session.js';
import { requestJson,postJson,fetchResource } from '../api/client.js';
import { embedSpatial } from '../domain/spatial/slide-binding.js';
import { createProposal,update,uid,getProposals } from '../repositories/proposals.js';
import { captureSpatialLocal } from './spatial-capture.js';
import { withInspect } from '../api/inspect.js';

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
// 명령 문장 + @ 참조 → 조작 목록 (app/api/spatial_command.py). 적용은 domain/spatial/command-apply.js
export const commandSpatial=(body,signal)=>postJson('/api/spatial/command',body,signal);
export const describeSpatialTarget=(scene,targetId,signal)=>postJson('/api/spatial/layout-description',{scene,targetId},signal);
export const saveSpatialHistory=(scene,view,record,extra={})=>record?requestJson('/api/spatial/history/'+encodeURIComponent(record.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({scene,view,revision:record.revision,...extra})}):postJson('/api/spatial/history',{scene,view,...extra});
export const createSpatialDraft=(form,view='3d')=>postJson('/api/spatial/drafts',{form,view});
export const saveSpatialForm=(form,view,record,extra={})=>requestJson('/api/spatial/drafts/'+encodeURIComponent(record.id),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({form,view,revision:record.revision,...extra})});
export async function deleteSpatialHistory(id){const response=await fetchResource('/api/spatial/history/'+encodeURIComponent(id),{method:'DELETE'});if(!response.ok)throw new Error('조감도를 삭제하지 못했습니다.');}
const computeFallback = error => error?.status === 404 || error?.status === 503;
const templateScenes = new WeakMap();
/** The published scene is the same createScene result used for server previews.
 * Browse cards never solve furniture placement on the main thread. Frozen libraries
 * and older servers use the existing revision-aware compute compatibility path. */
export function loadSpatialTemplate(template,library){
  let entries=templateScenes.get(library);if(!entries){entries=new Map();templateScenes.set(library,entries);}
  if(!entries.has(template.id)){
    const pending=requestJson('/api/spatial/templates/'+encodeURIComponent(template.id)+'?managed=1&rev='+encodeURIComponent(library.sourceHash))
      .catch(async error=>{if(!computeFallback(error))throw error;return computeSpatial({kind:'template',templateId:template.id},library);})
      .then(({scene,revision})=>{
        if(scene?.templateId!==template.id||!scene.assetRevision||(scene.assetRevision!==library.sourceHash&&!(revision>0)))throw new Error('템플릿과 오브젝트 버전이 일치하지 않습니다.');
        return scene;
      }).finally(()=>{if(entries.get(template.id)===pending)entries.delete(template.id);});
    entries.set(template.id,pending);if(entries.size>48)entries.delete(entries.keys().next().value);
  }
  return entries.get(template.id);
}
export async function loadSpatialTemplateWithAssets(template, library) {
  const scene = await loadSpatialTemplate(template, library);
  const assets = scene.assetRevision === library.sourceHash ? library : await loadSpatialLibrary(scene.assetRevision);
  return { scene, assets };
}
export async function computeSpatial(input,library,{signal}={}){
  const revision=library.sourceHash;
  try{
    const result=await postJson('/api/spatial/compute',{...input,revision},signal);
    if(result.assetRevision!==revision || result.scene?.assetRevision && result.scene.assetRevision!==revision)throw new Error('공간 작업의 오브젝트 버전이 일치하지 않습니다.');
    return result;
  }catch(error){
    if(signal?.aborted||!computeFallback(error))throw error;
    const {computeSpatial:local}=await import('../domain/spatial/compute.js');
    return local(input,library);
  }
}
const captures=new WeakMap();
export async function captureSpatial(scene,library,options={}){
  let variants=captures.get(scene);if(!variants){variants=new Map();captures.set(scene,variants);}
  const key=JSON.stringify([library.sourceHash,options]);
  if(!variants.has(key)){
    const pending=postJson('/api/spatial/snapshot',{scene,revision:library.sourceHash,options}).then(result=>{
      if(result.revision!==library.sourceHash||!result.snapshot?.image||!result.snapshot?.anchors||!result.snapshot?.camera)throw new Error('조감도 이미지와 좌표를 함께 불러오지 못했습니다.');
      return result.snapshot;
    }).catch(error=>{variants.delete(key);if(!computeFallback(error))throw error;return captureSpatialLocal(scene,library,options);});
    variants.set(key,pending);if(variants.size>4)variants.delete(variants.keys().next().value);
  }
  return variants.get(key);
}
// 3D card previews are rendered by the server (app/api/spatial_previews.py) and cached there (Redis · files) and by
// the browser (content-addressed, immutable URLs). Only when the server renderer is unavailable does this browser
// render the scene itself — one scene at a time, so WebGL contexts are never exhausted.
let serverPreviewsDownUntil=0;
export function spatialPreviewUrl(scene,library,{templateId,historyId}={}){
  if(historyId)return withInspect('/api/spatial/history/'+encodeURIComponent(historyId)+'/preview.webp?v='+encodeURIComponent(scene.contentHash||''));
  if(templateId&&(!scene.assetRevision||scene.assetRevision===library.sourceHash))return '/api/spatial/templates/'+encodeURIComponent(templateId)+'/preview.webp?rev='+encodeURIComponent(library.sourceHash)+'&managed=1&v='+encodeURIComponent(scene.contentHash||'');
  return null;
}
async function serverPreview(url){
  if(!url||Date.now()<serverPreviewsDownUntil)return null;
  try{
    const response=await fetchResource(url);
    if(response.ok){await response.blob();return url;} // the <img> below reads the same response from the HTTP cache
    if(response.status===503)serverPreviewsDownUntil=Date.now()+30000;
  }catch(error){if(error?.code==='cancelled')throw error;}
  return null;
}
const previewImages=new Map();
let previewQueue=Promise.resolve();
export function spatialPreviewImage(scene,library,source={}){
  const url=spatialPreviewUrl(scene,library,source),key=url||library.sourceHash+':'+scene.contentHash;
  if(!previewImages.has(key)){
    const local=()=>{const next=previewQueue.then(()=>captureSpatial(scene,library)).then(snapshot=>snapshot.image);previewQueue=next.catch(()=>{});return next;};
    const pending=serverPreview(url).then(src=>src||local()).catch(error=>{previewImages.delete(key);throw error;});
    previewImages.set(key,pending);
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
