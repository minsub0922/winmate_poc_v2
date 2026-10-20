// Fallback typography for description-based standards whose Samsung fonts are
// not supplied. Keep the described boxes fixed; fit their editable text inside.
const pending=new WeakSet();
export function fitDescriptionText(root){
  if(!root?.hasAttribute('data-description-standard')||!root.isConnected)return;
  for(const el of root.querySelectorAll('[data-desc-fit]')){
    if(el.hasAttribute('data-desc-occluded')||!el.textContent.trim()||el.clientWidth<1||el.clientHeight<1)continue;
    let size=Number(el.dataset.descFit)||18;el.style.fontSize=size+'px';
    for(let i=0;i<8;i++){
      const rw=el.clientWidth/Math.max(1,el.scrollWidth),rh=el.clientHeight/Math.max(1,el.scrollHeight);
      if(rw>=.998&&rh>=.998)break;
      size=Math.max(1.5,size*Math.min(.96,rw,rh));el.style.fontSize=size.toFixed(3)+'px';
    }
    el.dataset.descRenderedSize=size.toFixed(3);
  }
  if(document.fonts?.status!=='loaded'&&!pending.has(root)){
    pending.add(root);document.fonts.ready.then(()=>{pending.delete(root);if(root.isConnected)fitDescriptionText(root);});
  }
}
