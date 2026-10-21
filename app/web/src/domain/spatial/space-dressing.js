import {placeDetailAsset} from './detail-placement.js';

// Each plan retains real furniture sizes, even in the compact room variant.
export function spaceFurniturePlan(room,capacity){
 const w=room.width,d=room.depth,at=(kind,x,z,rotation=0)=>[kind,x/w,z/d,rotation];
 if(room.spaceProfile==='garment'||room.spaceProfile==='laundry')return [at('wardrobe-clothes',1.1,.72),at('coat-rack-loaded',w-1.05,.85),['bench',.24,.69]];
 if(room.spaceProfile==='coldstore')return [at('food-stock-shelf',1,.85),at('food-stock-shelf',w-1,.85),['counter',.3,.6]];
 if(room.spaceProfile==='entry')return [['cabinet-shoes',.18,.15],['coat-rack-loaded',.76,.17],['bench',.25,.63]];
 if(room.kind==='reception'){
  const x=w*.52,z=Math.max(1.84,d*.29),sx=w*.19,sz=d*.68;
  return [at('reception',x,z),at('taskchair',x,z-.81),at('sofa',sx,sz,270),at('coffeetable',sx+1.46,sz),['plant',.12,.14],['plant',.85,.79]];
 }
 if(room.kind==='fitness'){
  if(/재활|치료/.test(room.name))return [at('rehab-parallel-bars',1.25,1.65),at('rehab-light-weights',w-1.15,.9),['bench',.28,.73],['cabinet-medical',.84,.76]];
  return [at('gym-power-rack',1.4,1.2),at('gym-dumbbell-rack',w-1.2,.95),at('gym-bench-press',1.35,d*.64),at('treadmill',w-1.25,3.1),at('locker-changing',w-.8,d-.7)];
 }
 if(room.kind==='classroom'&&!capacity){
  const digital=room.spaceProfile==='digitalclass',last=Math.min(d*(digital?.67:.72),d-2.2),first=digital?Math.min(d*.49,last-.75):last-1.95;
  return [at('stage-teaching',w/2,.5),...[first,last].flatMap((z,row)=>[.24,.5,.76].flatMap(x=>[at('desk-student',x*w,z,digital&&!row?180:0),at('school-chair',x*w,z+(digital&&!row?-1:1)*.755,digital&&!row?0:180)])),['shelf',.88,.15]];
 }
 return null;
}
export function characterFurniture(kind,room){
 if(room.kind==='classroom'&&['chair','taskchair'].includes(kind))return 'school-chair';
 if(kind==='shelf-library'||kind==='shelf'&&['study','classroom'].includes(room.kind))return 'bookshelf-filled';
 if(kind==='shelf'&&room.kind==='retail')return 'retail-shelf-filled';
 return kind;
}
const essential=new Set(['wardrobe-clothes','coat-rack-loaded','gym-power-rack','gym-dumbbell-rack','gym-bench-press','rehab-parallel-bars','rehab-light-weights','food-stock-shelf']);
export const essentialCharacterFurniture=kind=>essential.has(kind);

export function dressSpace(scene,room,assets,canPlace){
 const add=(name,{required=false,supportId}={})=>{
  const asset=assets['furniture:'+name];if(!asset)throw new Error('공간 소품을 찾을 수 없습니다: '+name);
  const count=scene.objects.length;
  try{placeDetailAsset(scene,room,asset,assets,count,canPlace,{supportId});}
  catch(error){if(required)throw error;return null;}
  const object=scene.objects.at(-1);object.autoDressing=true;return object;
 };
 const inRoom=()=>scene.objects.filter(o=>o.roomId===room.id);
 const support=kind=>inRoom().find(o=>assets[o.assetId].kind===kind);
 if(room.spaceProfile==='kitchen'){
  add('food-prep-board',{required:true,supportId:support('counter')?.id});
  add('food-stew-pot',{required:true,supportId:support('induction')?.id});
  add('food-produce-basket');
 }else if(room.spaceProfile==='coldstore')add('food-produce-basket',{required:true,supportId:support('counter')?.id});
 else if(room.kind==='dining'){
  for(const table of inRoom().filter(o=>['table','roundtable'].includes(assets[o.assetId].kind)).slice(0,4))add('food-plated-meal',{supportId:table.id});
 }else if(room.spaceProfile==='laundry'||room.includedSpaces?.some(s=>s.spaceProfile==='laundry')){
  add('laundry-basket-filled');add('towels-folded',{supportId:support('bench')?.id});
 }else if(room.spaceProfile==='garment')add('laundry-basket-filled');
 else if(room.kind==='fitness'){
  if(!/재활|치료/.test(room.name))add('mat-yoga');
  if(support('bench'))add('towels-folded',{supportId:support('bench').id});
 }else if(['office','study','classroom','meeting'].includes(room.kind)){
  const desks=inRoom().filter(o=>['desk','table','conference'].includes(assets[o.assetId].kind));
  for(const table of desks.slice(0,room.kind==='classroom'?3:2))add(room.kind==='office'?'notebook':room.kind==='classroom'?'book-closed':'book-open',{supportId:table.id});
  if(room.kind==='office')add('pen-cup',{supportId:desks[0]?.id});
 }else if(room.kind==='warehouse'&&room.spaceProfile!=='laboratory'){
  // Pallets are low, non-powered storage props and must preserve the door aisle.
  const asset=assets['furniture:carton-pallet'];
  for(const [x,z]of [[.84,.36],[.75,.8],[.12,.8]]){
   const object={id:room.id+'-stock',assetId:asset.id,roomId:room.id,x:room.x+room.width*x,z:room.z+room.depth*z,elevation:0,rotation:0,autoDressing:true};
   if(canPlace(object,room,scene.objects,assets)){scene.objects.push(object);break;}
  }
 }else if(['lounge','reception'].includes(room.kind)){
  if(support('coffeetable')||support('reception'))add('cup-mug');
 }
}
