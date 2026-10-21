import {peopleObjectError,peopleRenderGroups,partsBounds,furnitureBounds,peopleInScene,PEOPLE_LAYOUT_VERSION} from './people-placement-geometry.js';
import {faceRotation} from './natural-layout.js';

const hash=s=>[...s].reduce((n,c)=>Math.imul(n^c.charCodeAt(0),16777619)>>>0,2166136261);
const round=n=>Math.round(n*10000)/10000;
const seats=new Set(['chair','taskchair','sofa','bench','stool']);
const tables=new Set(['desk','table','roundtable','coffeetable','conference','reception','counter','island']);
const sourcesCache=new WeakMap();
function sources(library){
 if(!sourcesCache.has(library.assets))sourcesCache.set(library.assets,library.assets.filter(a=>a.assetGroup==='people').flatMap(source=>source.actors.filter(a=>!['people:doctor-bed-round','people:nurse-bed-check'].includes(source.id)||a.roleId!=='patient').map(actor=>({source,actor}))));
 return sourcesCache.get(library.assets);
}
function candidates(library,role,pose,actions,seed){
 const all=sources(library).filter(s=>s.actor.roleId===role&&s.actor.pose===pose);
 return all.filter(s=>actions.includes(s.actor.action)).sort((a,b)=>actions.indexOf(a.actor.action)-actions.indexOf(b.actor.action)||hash(seed+a.source.id+a.actor.id)-hash(seed+b.source.id+b.actor.id));
}
function context(room,industry,allRooms=false){
 const name=room.name+' '+(room.purpose||'');
 if(allRooms){
  if(room.spaceProfile==='laundry'||/세탁/.test(room.name))return 'laundry';
  if(room.spaceProfile==='garment'||/겉옷|드레스룸/.test(room.name))return 'garment';
  if(room.kind==='utility')return 'facility';
  if(/냉장|냉동 보관/.test(room.name))return 'coldstore';
  if(room.spaceProfile==='billboard'||/랜드마크 외벽|건물 외벽|거리 미디어폴/.test(room.name))return 'media';
  if(room.spaceProfile==='selfservice')return 'selfservice';
  if(room.spaceProfile==='entry')return 'entry';
  if(room.spaceProfile==='field')return 'field';
  if(room.kind==='outdoor'&&industry==='PB')return 'park';
  if(room.kind==='outdoor'&&industry==='OE')return /등하교/.test(room.name)?'school-route':'sport-outdoor';
 }else if(room.kind==='utility'||/냉장|냉동|보관|실외기|열원|기계실|천장|겉옷|랜드마크 외벽|건물 외벽|거리 미디어폴/.test(name))return null;
 if(room.kind==='medical')return /간호|스테이션/.test(name)?'nurse':/진료|상담/.test(name)?'clinic':'ward';
 if(room.kind==='classroom')return 'classroom';
 if(room.kind==='study')return /도서관/.test(name)?'library':/라운지|휴게/.test(name)?'study-lounge':'study';
 if(room.kind==='dining')return 'dining';
 if(room.kind==='kitchen')return ['RS','ID'].includes(industry)?'home-kitchen':'kitchen';
 if(room.kind==='office')return /행정|민원/.test(name)?'clerk-office':industry==='FN'?'bank-office':industry==='MD'?'nurse-office':'office';
 if(room.kind==='meeting')return 'meeting';
 if(room.kind==='bedroom')return industry==='ED'?'dorm':'bedroom';
 if(room.kind==='warehouse')return /연구|검사|클린룸/.test(name)?'lab':'warehouse';
 if(room.kind==='reception')return 'reception';
 if(room.kind==='fitness')return 'fitness';
 if(room.kind==='retail')return 'retail';
 if(room.kind==='theatre')return /観客|관중|체험/.test(name)?'audience':'theatre';
 if(room.kind==='outdoor')return 'outdoor';
 return 'lounge';
}
function staffRole(industry){return {FB:'barista',MD:'clerk',FN:'banker',HT:'receptionist',ED:'clerk',PB:'clerk',TP:'guide',VN:'security',RT:'retailer',SV:'retailer',OE:'retailer',RS:'designer',ID:'designer',MF:'inspector',AD:'guide'}[industry]||'guide';}
function seatRole(type,industry){
 if(['classroom','study','study-lounge','library','dorm'].includes(type))return 'student';
 if(type==='nurse-office')return 'nurse';if(type==='clerk-office')return 'clerk';if(type==='bank-office')return 'banker';
 if(['office','meeting'].includes(type))return 'office';if(type==='clinic')return 'patient';
 if(type==='dining'&&industry==='ED')return 'student';if(type==='dining'&&industry==='MD')return 'patient';
 return 'customer';
}
function seatActions(type,index,host,target,assets){
 if(['classroom','study','library','dorm','office','bank-office','clerk-office','nurse-office'].includes(type))return index%4===2?['read','write','listen']:index%5===3?['raise','listen','read']:['write','read','listen'];
 if(type==='meeting')return index%3?['read','listen','consult']:['consult','raise','read'];
 if(type==='clinic')return ['listen','read','rest'];
 if(type==='audience'||type==='theatre')return ['listen','read','rest'];
 if(type==='dining'&&target&&assets[target.assetId].size[1]>.64)return index%3===2?['drink','snack','read']:index%2?['chopsticks','eat','drink']:['eat','chopsticks','drink'];
 return index%3===0?['drink','read','snack']:index%3===1?['read','listen','rest']:['snack','drink','read'];
}
function addPerson(owner,room,scene,assets,descriptor){
 const previous=owner.people;
 owner.people=[...(previous||[]),descriptor];
 if(peopleObjectError(owner,room,scene.objects,assets)){if(previous)owner.people=previous;else delete owner.people;return false;}
 return true;
}
function mealFor(source,target,owner,assets){
 if(!source.parts.some(p=>p.component==='tool'&&['meal','ricebowl','lunchtray','pasta','salad','breakfast'].includes(p.objectType)))return null;
 const a=assets[target.assetId],angle=target.rotation*Math.PI/180,dx=owner.x-target.x,dz=owner.z-target.z;
 const local=[dx*Math.cos(angle)-dz*Math.sin(angle),dx*Math.sin(angle)+dz*Math.cos(angle)],len=Math.hypot(...local)||1;
 const edge=Math.min(a.size[0],a.size[2])/2-.18,offset=[local[0]/len*Math.max(0,edge),round((a.supportSurfaceHeight||a.size[1])+.006),local[1]/len*Math.max(0,edge)];
 return {sourceAssetId:source.id,offset:offset.map(round),scale:.72};
}
function populateSeats(scene,room,type,library,assets){
 const hosts=scene.objects.filter(o=>o.roomId===room.id&&seats.has(assets[o.assetId].kind)&&o.elevation<.06&&!o.people?.length);
 const usable=hosts.filter(o=>{
  const t=scene.objects.find(t=>t.id===o.facing?.targetId),ta=t&&assets[t.assetId];
  if(ta&&['counter','reception'].includes(ta.kind)&&ta.size[1]>1)return false; // High counters get standing staff.
  if(['ward','nurse','warehouse','lab','kitchen','home-kitchen','fitness','facility','laundry','garment','coldstore','media','selfservice','field','park','school-route','sport-outdoor','entry'].includes(type))return false;
  if(type==='reception'&&assets[o.assetId].kind==='taskchair')return false;
  return true;
 });
 const seed=scene.industry+room.id,max=Math.min(type==='dining'?8:7,Math.max(1,Math.ceil(usable.length*.65))),usedTargets=new Map();
 let added=0;
 // Spread occupants across distinct desks/tables, then fill a few adjacent seats.
 const pending=[...usable];
 while(pending.length&&added<max){
  pending.sort((a,b)=>(usedTargets.get(a.facing?.targetId)||0)-(usedTargets.get(b.facing?.targetId)||0)||hash(seed+a.id)-hash(seed+b.id));
  const owner=pending.shift(),a=assets[owner.assetId],target=scene.objects.find(t=>t.id===owner.facing?.targetId),role=type==='clinic'&&room.spaceProfile==='clinic'&&a.kind==='taskchair'?'doctor':seatRole(type,scene.industry);
  let actions=seatActions(type,added,owner,target,assets);
  if(target&&.79*Math.min(1.06,(a.supportSurfaceHeight||.47)/.495)+.035<assets[target.assetId].size[1]&&actions.includes('write'))actions=added%4===2?['raise','read','listen']:['read','listen','raise'];
  const pool=candidates(library,role,'sit',actions,seed+owner.id);
  const sourcePool=pool.length?pool:candidates(library,'customer','sit',['read','listen','rest'],seed+owner.id);
  const top=a.supportSurfaceHeight||(a.kind==='bench'?.45:.47),scale=Math.min(1.06,Math.max(.72,top/.495));
  for(const {source,actor}of sourcePool){
   const descriptor={version:1,sourceAssetId:source.id,actorId:actor.id,mode:'seat',offset:[0,round(top-.495*scale),0],rotation:0,scale:round(scale),...(target?{targetId:target.id}:{})};
   if(['eat','chopsticks'].includes(actor.action)){
    if(!target||!tables.has(assets[target.assetId].kind))continue;
    descriptor.meal=mealFor(source,target,owner,assets);if(!descriptor.meal)continue;
   }
   let fits=false;for(const z of [0,-.04,.025,-.07,-.085]){descriptor.offset[2]=z;if(addPerson(owner,room,scene,assets,descriptor)){fits=true;break;}}if(fits){added++;usedTargets.set(target?.id,(usedTargets.get(target?.id)||0)+1);break;}
  }
  if(a.kind==='sofa'&&owner.people?.length&&a.size[0]>1.7&&added<max){
   // Seat two users on a sofa rather than stacking people at its centre.
   const first=owner.people[0];first.offset[0]=-.43;
   if(peopleObjectError(owner,room,scene.objects,assets)){first.offset[0]=0;continue;}
   const pool=candidates(library,'customer','sit',['read','drink','listen'],seed+owner.id+'second');
   for(const {source,actor}of pool)if(addPerson(owner,room,scene,assets,{version:1,sourceAssetId:source.id,actorId:actor.id,mode:'seat',offset:[.43,first.offset[1],0],rotation:0,scale:first.scale,...(target?{targetId:target.id}:{})})){added++;break;}
  }
 }
 return added;
}
function standAt(scene,room,host,role,actions,library,assets,{side='front',stage=false}={}){
 const a=assets[host.assetId],seed=scene.industry+room.id+host.id;
 const pool=candidates(library,role,'stand',actions,seed);
 const offsets=stage?[0,-.65,.65,-1,1].flatMap(x=>[0,-.25,.25].map(z=>[x,a.size[1]+.006,z,0])):side==='visible-side'?[
  [a.size[0]/2+.42,0,.2,90],[0,0,a.size[2]/2+.42,180],[a.size[0]/2+.56,0,.2,90],[-a.size[0]/2-.42,0,.3,270],
 ]:side==='side'?[
  [-a.size[0]/2-.42,0,-.12,270],[a.size[0]/2+.42,0,-.12,90],[-a.size[0]/2-.44,0,.3,270],[-a.size[0]/2-.56,0,-.12,270],[a.size[0]/2+.56,0,-.12,90],
 ]:[
  [0,0,-a.size[2]/2-.36,0],[-a.size[0]*.3,0,-a.size[2]/2-.38,0],[a.size[0]*.3,0,-a.size[2]/2-.38,0],
  [0,0,a.size[2]/2+.36,180],[-a.size[0]*.3,0,a.size[2]/2+.4,180],
 ];
 for(const [x,y,z,rotation]of offsets)for(const {source,actor}of pool){
  if(addPerson(host,room,scene,assets,{version:1,sourceAssetId:source.id,actorId:actor.id,mode:'stand',offset:[round(x),round(y),round(z)],rotation,scale:1}))return true;
 }
 return false;
}
export function populateScenePeople(scene,library){
 if(![1,PEOPLE_LAYOUT_VERSION].includes(library.peopleLayoutVersion))return scene;
 const allRooms=library.peopleLayoutVersion>=2;
 const assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
 // Population is idempotent; explicit compound vignettes retain their own actors.
 for(const room of scene.rooms){
  if(scene.objects.some(o=>o.roomId===room.id&&(o.people?.length||assets[o.assetId].assetGroup==='people')))continue;
  const type=context(room,scene.industry,allRooms);if(!type)continue;
  populateSeats(scene,room,type,library,assets);
  const hosts=scene.objects.filter(o=>o.roomId===room.id&&!o.autoDressing&&!assets[o.assetId].productId),find=kinds=>hosts.find(o=>kinds.includes(assets[o.assetId].kind)&&!o.people?.length);
  const addStaff=(role,actions,kinds,options)=>{const host=find(kinds);return host&&standAt(scene,room,host,role,actions,library,assets,options);};
  if(type==='facility')addStaff('technician',['service','inspect','present'],['bench','cabinet','rack'],{side:'visible-side'});
  else if(type==='laundry')addStaff('laundry',['fold','inspect','push'],['bench','cabinet'],{side:'visible-side'});
  else if(type==='garment')addStaff('coatkeeper',['hanger','inspect'],['bench','cabinet'],{side:'visible-side'});
  else if(type==='coldstore')addStaff('coldstore',['inspect','carry'],['counter','cabinet','island'],{side:'visible-side'});
  else if(type==='media')addStaff('electrician',['service','inspect','present'],['bench','cabinet'],{side:'visible-side'});
  else if(type==='selfservice')addStaff('customer',['inspect','read'],['reception','counter'],{side:'side'});
  else if(type==='entry')addStaff('customer',['inspect','read'],['bench','reception','cabinet'],{side:'side'});
  else if(type==='park'){if(!addStaff('gardener',['water'],['plant'],{side:'visible-side'}))addStaff('gardener',['inspect'],['bench'],{side:'side'});}
  else if(type==='school-route')addStaff('student',['read','inspect'],['bench'],{side:'side'});
  else if(type==='sport-outdoor')addStaff('trainer',['inspect','present'],['bench'],{side:'side'});
  else if(type==='field')addStaff(scene.industry==='MF'&&/物|물류|배송|차량/.test(room.name)?'courier':'inspector',['carry','inspect','present'],['bench','cabinet'],{side:'side'});
  else if(type==='classroom')addStaff('teacher',['present','read','point'],['stage'],{stage:true});
  else if(type==='theatre')addStaff(['ED','OF','OE','FN'].includes(scene.industry)?'lecturer':'performer',['present','point'],['stage'],{stage:true});
  else if(type==='reception')addStaff(staffRole(scene.industry),['inspect','present','consult'],['reception','counter','desk']);
  else if(type==='kitchen')addStaff('chef',['inspect','serve','present'],['counter','island']);
  else if(type==='home-kitchen')addStaff('customer',['menu','read','drink'],['island','counter']);
  else if(type==='retail')addStaff(['RS','ID'].includes(scene.industry)?'designer':'retailer',['inspect','point-left','present'],['counter','shelf','island'],{side:'visible-side'});
  else if(type==='warehouse'||type==='lab'){
   addStaff(type==='lab'?'researcher':'worker',['inspect','carry','present'],['rack','desk'],{side:'visible-side'});
   if(room.width*room.depth>70)addStaff('inspector',['inspect','carry'],['rack'],{side:'visible-side'});
  }else if(type==='nurse')addStaff('nurse',['inspect','read'],['cabinet','hospitalbed'],{side:'side'});
  else if(type==='clinic'){
   if(hosts.some(o=>o.people?.some(p=>assets[p.sourceAssetId].actors.find(a=>a.id===p.actorId)?.roleId==='doctor')))continue;
   const host=hosts.find(o=>o.people?.some(p=>assets[p.sourceAssetId].actors.find(a=>a.id===p.actorId)?.roleId==='patient'));
   if(host)standAt(scene,room,host,'doctor',['inspect','consult'],library,assets,{side:'side'});
  }else if(type==='ward'){
   const patientSource=assets['people:doctor-bed-round'],patient=patientSource?.actors.find(a=>a.roleId==='patient');
   for(const bed of hosts.filter(o=>assets[o.assetId].kind==='hospitalbed').slice(0,2)){
    if(patient)addPerson(bed,room,scene,assets,{version:1,sourceAssetId:patientSource.id,actorId:patient.id,mode:'bed',offset:[0,round((assets[bed.assetId].supportSurfaceHeight||.61)+.13),.83],rotation:0,scale:1});
   }
   const bed=hosts.find(o=>assets[o.assetId].kind==='hospitalbed');if(bed)standAt(scene,room,bed,'doctor',['inspect'],library,assets,{side:'side'});
  }else if(type==='fitness')addStaff('trainer',['present','inspect'],['bench','cabinet'],{side:'side'});
  else if(type==='library')addStaff('librarian',['inspect'],['shelf'],{side:'visible-side'});
  else if(type==='outdoor'&&!scene.objects.some(o=>o.roomId===room.id&&o.people?.length))addStaff('guide',['present','inspect'],['bench'],{side:'side'});
 }
 if(allRooms)for(const room of scene.rooms){
  ensureRoomPeople(scene,room,library,assets);
  const included=room.includedSpaces||[];
  if(room.spaceProfile!=='laundry'&&included.some(s=>s.spaceProfile==='laundry'))ensureRoomPeople(scene,room,library,assets,'laundry');
  if(room.spaceProfile==='ward'&&included.some(s=>s.spaceProfile==='nursing'))ensureRoomPeople(scene,room,library,assets,'nurse');
  if(room.spaceProfile==='kitchen'&&included.some(s=>/냉장|냉동 보관/.test(s.name)))ensureRoomPeople(scene,room,library,assets,'coldstore');
 }
 const people=peopleInScene(scene,assets);
 scene.peopleLayout={version:library.peopleLayoutVersion,people:people.length,occupiedRooms:new Set(people.map(p=>p.roomId)).size,...(allRooms?{coverage:'all-rooms'}:{})};
 return scene;
}

const fallbackRoles={facility:'technician',laundry:'laundry',garment:'coatkeeper',coldstore:'coldstore',media:'electrician',selfservice:'customer',entry:'customer',park:'gardener','school-route':'student','sport-outdoor':'trainer',field:'inspector',classroom:'teacher',clinic:'doctor',ward:'doctor',nurse:'nurse',warehouse:'worker',lab:'researcher',kitchen:'chef','home-kitchen':'customer',fitness:'trainer',library:'librarian',study:'student','study-lounge':'student',dorm:'student',office:'office','bank-office':'banker','clerk-office':'clerk','nurse-office':'nurse',meeting:'office',theatre:'performer',audience:'customer',retail:'retailer',outdoor:'guide',bedroom:'customer',lounge:'customer',dining:'customer'};
function hasRoomPeople(scene,room,assets){return scene.objects.some(o=>o.roomId===room.id&&(o.people?.length||assets[o.assetId]?.assetGroup==='people'));}
function ensureRoomPeople(scene,room,library,assets,requiredRole){
 if(!requiredRole&&hasRoomPeople(scene,room,assets))return;
 if(requiredRole&&peopleInScene(scene,assets).some(p=>p.roomId===room.id&&p.roleId===requiredRole))return;
 const type=context(room,scene.industry,true),role=requiredRole||(type==='reception'?staffRole(scene.industry):fallbackRoles[type]);
 if(!role)throw new Error(room.name+': 사람 연출의 직종을 찾을 수 없습니다.');
 const pool=candidates(library,role,'stand',['inspect','read','service','present','fold','hanger','water','carry','rest'],scene.industry+room.id+'coverage');
 const hosts=scene.objects.filter(o=>o.roomId===room.id&&!o.autoDressing&&!assets[o.assetId].productId&&assets[o.assetId].kind!=='rug').toSorted((a,b)=>(a.people?.length||0)-(b.people?.length||0));
 for(const host of hosts)if(standAt(scene,room,host,role,['inspect','read','service','fold','hanger','present','water','carry'],library,assets,{side:'visible-side'}))return;
 // Last resort searches real metre offsets around existing furniture. It never
 // shrinks a person to fit or introduces a duplicate desk/bench as a workaround.
 const positions=[];
 for(let z=.65;z<room.depth-1.15;z+=.45)for(let x=.65;x<room.width-.45;x+=.45)positions.push({x:room.x+x,z:room.z+z});
 for(const host of hosts){
  const angle=host.rotation*Math.PI/180;
  for(const point of positions.toSorted((a,b)=>Math.hypot(a.x-host.x,a.z-host.z)-Math.hypot(b.x-host.x,b.z-host.z))){
   const dx=point.x-host.x,dz=point.z-host.z;if(Math.hypot(dx,dz)>2.3)continue;
   const offset=[round(dx*Math.cos(angle)-dz*Math.sin(angle)),round(-host.elevation),round(dx*Math.sin(angle)+dz*Math.cos(angle))];
   const rotation=(faceRotation(point,host)-host.rotation+360)%360;
   for(const {source,actor}of pool){
    const person={version:1,sourceAssetId:source.id,actorId:actor.id,mode:'stand',offset,rotation,scale:1};
    const body=partsBounds(peopleRenderGroups({...host,people:[person]},scene,assets)[0].body,host),own=furnitureBounds(host,assets[host.assetId]);
    if(body.min.every((v,i)=>v<own.max[i]+(i===1?-.012:.025)&&body.max[i]>own.min[i]-(i===1?-.012:.025)))continue;
    if(addPerson(host,room,scene,assets,person))return;
   }
  }
 }
 throw new Error(room.name+': 직종에 맞는 사람이 설 수 있는 공간을 확보하지 못했습니다.');
}
