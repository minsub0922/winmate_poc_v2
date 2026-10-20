export async function loadSpatialRenderer(){
  try{return await import('../domain/spatial/render-three.js');}
  catch(cause){
    // Do not replace WebGL, model or runtime errors with a deployment message.
    if(!/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload/i.test(cause?.message||''))throw cause;
    const error=new Error('3D 표시 파일을 불러오지 못했어요. 화면을 새로고침해 최신 파일로 다시 연결해 주세요.',{cause});
    error.code='spatial_module_unavailable';throw error;
  }
}
