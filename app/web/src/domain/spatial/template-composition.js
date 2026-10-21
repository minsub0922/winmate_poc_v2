// Presentation templates keep real object dimensions while reducing empty floor.
export const TEMPLATE_COMPOSITION_VERSION=4;
export const TEMPLATE_ROOM={width:8,depth:6.8,referenceWidth:10.5,referenceDepth:9};
export const DEFAULT_TEMPLATE_ROOMS=6;
export function roomGridColumns(count){
 if(count<=3)return Math.max(1,count);
 if(count===4)return 2;
 if(count%4===0&&count>6)return 4;
 return 3;
}
export function templateDimensions(count,room=TEMPLATE_ROOM){
 const cols=roomGridColumns(count),rows=Math.ceil(count/cols);
 return {width:Number((cols*room.width+(cols-1)*.22).toFixed(4)),depth:Number((rows*room.depth+(rows-1)*1.8).toFixed(4))};
}
// Related functions share one overview tile; their original individual templates
// and source/product references stay available when explicitly selected.
const pairs={FB:['fb-3','fb-4'],RT:['rt-2','rt-1'],SV:['sv-hero','sv-4'],HT:['ht-6','ht-5'],TP:['tp-2','tp-3'],VN:['vn-1','vn-6'],AD:['ad-4','ad-5'],OF:['of-5','of-6'],RS:['rs-3','rs-5'],ID:['id-hero','id-2'],ED:['ed-2','ed-3'],PB:['pb-6','pb-5'],MD:['md-hero','md-1'],MF:['mf-4','mf-5'],FN:['fn-1','fn-4'],OE:['oe-hero','oe-5']};
const sourceSpaces=room=>room.includedSpaces||[structuredClone(room)];
export function sixRoomOverview(rooms,industry){
 const result=structuredClone(rooms);
 const merge=(keep,fold)=>{
  const a=result.find(r=>r.key===keep),b=result.find(r=>r.key===fold);if(!a||!b)return false;
  a.includedSpaces=[...sourceSpaces(a),...sourceSpaces(b)];a.productIds=[...new Set([...(a.productIds||[]),...(b.productIds||[])])];
  if(a.equipment&&b.equipment){
    // A merged room only inherits equipment compatible with the retained use.
    const compatible=a.kind==='utility'&&b.kind==='utility'?b.equipment:
      a.spaceProfile==='ward'&&b.spaceProfile==='nursing'?b.equipment.filter(e=>e.quantity==='workstations'):
      ['study','library'].includes(a.spaceProfile)&&b.spaceProfile==='administration'?b.equipment.filter(e=>e.productId==='sg_g000181555'):[];
    a.equipment=[...a.equipment,...compatible.filter(e=>!a.equipment.some(p=>p.productId===e.productId))];
    a.productIds=a.equipment.map(e=>e.productId);
  }
  result.splice(result.indexOf(b),1);return true;
 };
 if(result.length>DEFAULT_TEMPLATE_ROOMS&&pairs[industry])merge(...pairs[industry]);
 while(result.length>DEFAULT_TEMPLATE_ROOMS){
  const a=result.find(r=>result.some(s=>s!==r&&s.kind===r.kind))||result[0],b=result.find(r=>r!==a&&r.kind===a.kind)||result.at(-1);merge(a.key,b.key);
 }
 return result;
}
export function evenRoomSubset(rooms,count){
 const wanted=Math.min(rooms.length,Math.max(2,Math.ceil(count/2)*2));return structuredClone(rooms.slice(0,wanted));
}
