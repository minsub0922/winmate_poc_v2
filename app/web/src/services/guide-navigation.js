import { useSyncExternalStore } from 'react';
import { GUIDE_BY_ID } from '../domain/guides/catalog.js';
let surface=null;
const listeners=new Set();
const publish=value=>{surface=value;listeners.forEach(fn=>fn());};
export const getGuideSurface=()=>surface;
export const useGuideSurface=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getGuideSurface);
export function setGuideSurface(value){
  if(value?.kind==='guide')return openGuidePage(value.id,(value.index||0)+1);
  publish(value?.kind==='menu'?{kind:'menu'}:null);
}
export function openGuidePage(id,page=1){
  const guide=GUIDE_BY_ID[id];
  if(!guide||!Number.isInteger(page)||page<1||page>guide.steps.length)return false;
  publish({kind:'guide',id,index:page-1});return true;
}
export function moveGuidePage(delta){if(surface?.kind==='guide'){const guide=GUIDE_BY_ID[surface.id];openGuidePage(surface.id,Math.min(guide.steps.length,Math.max(1,surface.index+1+delta)));}}
