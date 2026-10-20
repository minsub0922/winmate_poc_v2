export const mentionToken=mention=>'@['+mention.label+']';
export function mentionObjectIds(mention,scene,roomId){
  if(!mention||!scene)return [];
  return scene.objects.filter(o=>mention.kind==='object'?o.id===mention.id:o.assetId===mention.id&&(!roomId||o.roomId===roomId)).map(o=>o.id);
}

/** Read actual chips, never infer object IDs from user-entered or pasted text. */
export function readSpatialPrompt(root){
  let text='';const mentions=[],seen=new Set();
  const visit=node=>{
    if(node.nodeType===3){text+=node.textContent.replaceAll('\u00a0',' ');return;}
    if(node.nodeType!==1&&node.nodeType!==11)return;
    if(node.dataset?.mentionKind){
      const mention={kind:node.dataset.mentionKind,id:node.dataset.mentionId,label:node.dataset.mentionLabel};
      text+=mentionToken(mention);const key=mention.kind+':'+mention.id;
      if(!seen.has(key)){mentions.push(mention);seen.add(key);}return;
    }
    if(node.nodeName==='BR'){text+='\n';return;}
    if(['DIV','P'].includes(node.nodeName)&&text&&!text.endsWith('\n'))text+='\n';
    for(const child of node.childNodes)visit(child);
  };
  for(const child of root.childNodes)visit(child);
  return {text,mentions};
}
