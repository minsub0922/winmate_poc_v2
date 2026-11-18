import { loadSpatialRenderer } from './spatial-renderer.js';

export async function captureSpatialLocal(scene,library,options={}){
  const {createSpatialRenderer}=await loadSpatialRenderer();
  const host=document.createElement('div');host.style.cssText='position:fixed;left:-20000px;top:0;width:1600px;height:1025px;';document.body.appendChild(host);
  let renderer;
  try{renderer=createSpatialRenderer(host,{pixelRatio:1});renderer.setScene(scene,library);if(options.camera)renderer.setCameraState(options.camera);await renderer.ready();const snapshot=renderer.snapshot({...options,pixelRatio:options.pixelRatio||1});if(options.preview)snapshot.preview=renderer.snapshot({w:480,h:308,type:'image/jpeg',quality:.82,pixelRatio:1}).image;return snapshot;}
  finally{renderer?.dispose();host.remove();}
}
