// Space characters (layout composition 5): spaces that share one purpose profile no longer share one look.
//   node app/tests/spatial-space-characters.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,inspectNaturalLayout,validateScene} from '../web/src/domain/spatial/scene.js';
import {SPACE_CHARACTERS,SPACE_CHARACTER_VERSION,spaceCharacter,characterDefinition} from '../web/src/domain/spatial/space-characters.js';
import {CHARACTER_ASSETS} from '../web/src/domain/spatial/space-character-objects.js';
import {TEMPLATE_COMPOSITION_VERSION} from '../web/src/domain/spatial/template-composition.js';
import {createSceneFromForm,studioDocumentFromTemplate} from '../web/src/domain/spatial/studio-form.js';
import {peopleInScene} from '../web/src/domain/spatial/people-placement-geometry.js';
import {populateScenePeople} from '../web/src/domain/spatial/people-layout.js';
import {recommendedSpaces,startRooms} from '../web/src/domain/birdseye/start.js';
import {addRoom} from '../web/src/domain/spatial/room-ops.js';
import {emptyStudioForm,studioFormFromScene} from '../web/src/domain/spatial/studio-form.js';

const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url))),scenes=JSON.parse(fs.readFileSync(new URL('../data/spatial/scenes.json',import.meta.url)));
const assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
assert.equal(TEMPLATE_COMPOSITION_VERSION,SPACE_CHARACTER_VERSION,'templates are built with the character composition');

// 1. Every new furnishing is a registered, unpowered design asset with a thumbnail.
for(const asset of CHARACTER_ASSETS){
  const published=assets[asset.id];assert(published,asset.id+' is in the library');
  assert(published.physical&&published.powered===false&&published.dimensionSource==='designed'&&!published.productId,asset.id+' is a designed furnishing, not a product');
  assert(fs.existsSync(new URL('../web/public'+published.thumbnail,import.meta.url)),asset.id+' has a catalogue thumbnail');
}

// 2. Rooms, characters, people.
const used=new Set(),roomsOf=new Map();let rooms=0,characterRooms=0;
for(const template of library.templates){
  const scene=scenes[template.id],people=peopleInScene(scene,assets);
  for(const room of scene.rooms){
    rooms++;
    assert.equal(room.character||null,spaceCharacter(room,scene.industry),template.id+' '+room.name+' character follows its name and industry');
    if(!room.character)continue;
    characterRooms++;used.add(room.character);
    assert(characterDefinition(room),room.character+' is defined');
    assert(people.some(person=>person.roomId===room.id),template.id+' '+room.name+' has people');
    // Devices stand on desks, counters and tables — never on a waiting bench or on top of tall storage when a table exists.
    const inRoom=scene.objects.filter(o=>o.roomId===room.id),tops=inRoom.filter(o=>['desk','counter','table','roundtable','conference','island','reception'].includes(assets[o.assetId].kind)&&assets[o.assetId].size[1]<=1.25);
    for(const product of inRoom.filter(o=>assets[o.assetId].productId&&o.supportId)){
      const support=assets[inRoom.find(o=>o.id===product.supportId).assetId];
      if(tops.length)assert(support.kind!=='bench'&&support.size[1]<=1.25,template.id+' '+room.name+': '+assets[product.assetId].name+' sits on a proper top');
    }
    if(template.scope==='single'&&!template.id.startsWith('case-')){const key=room.character+' '+template.variant;if(!roomsOf.has(key))roomsOf.set(key,[]);roomsOf.get(key).push({template,scene,room});}
  }
}
assert.deepEqual(SPACE_CHARACTERS.filter(name=>!used.has(name)),[],'every character is used by a template');

// 3. The furnishing that tells each space apart is there in every size, with the people who belong to it.
const has=(entry,name)=>entry.scene.objects.some(o=>o.roomId===entry.room.id&&o.assetId==='furniture:'+name);
const roles=entry=>new Set(peopleInScene(entry.scene,assets).filter(p=>p.roomId===entry.room.id).map(p=>p.roleId));
const signature={
  'cafe-terrace':[['parasol-table','parasol-canopy','outdoor-bistro'],['customer']],'bus-stop':[['bus-shelter','street-tree'],[]],'gate-plaza':[['ticket-booth','turnstile-gate'],['guide']],
  'cafe-counter':[['counter','cabinet-bakery'],['barista']],'hotel-front':[['reception','luggage-cart'],['receptionist','concierge']],'hospital-front':[['reception','waiting-arm-beam','wheelchair-manual'],['clerk']],
  'civil-service':[['desk-office','public-visitor','bank-form-desk'],['clerk','customer']],'bank-teller':[['desk-office','bank-teller','bank-consult'],['banker','customer']],
  'canteen':[['serving-line','table-dining-four'],['chef']],'pub-bar':[['bar-counter','bottle-shelf','bar-backrest'],['waiter']],'breakfast-buffet':[['buffet-table'],['chef']],
  'banquet':[['banquet-round','banquet-chair'],['presenter']],'worship':[['pew-bench','altar-table'],['lecturer']],'gym-hall':[['basketball-hoop','stage'],['teacher']],'cinema':[['cinema-recliner'],['customer']],
  'studio-onair':[['news-desk','studio-camera'],['office']],'exhibition':[['exhibit-wall','exhibit-pedestal'],['guide']],'kids-zone':[['kids-slide','toy-blocks'],[]],'golf-play':[['golf-tee-mat','golf-bag'],[]],
  'hotel-room':[['bed-king','cart-service'],['housekeeper']],'barracks':[['bed-bunk','locker'],[]],'operating-room':[['operating-table','instrument-stand'],['dentist','nurse']],'hair-salon':[['salon-station','salon-chair'],['customer','retailer']],
  'gx-studio':[['spin-bike','mirror-wall','gym-power-rack','gym-dumbbell-rack','gym-bench-press'],['trainer']],'spa-fitness':[['massage-bed','gym-power-rack','gym-dumbbell-rack','gym-bench-press'],['trainer']],
  'plant-room':[['pipe-manifold','water-tank'],['technician']],'telecom-room':[['cable-tray-cabinet'],['technician']],'linen-room':[['towel-shelf'],['housekeeper']],'fitting-room':[['fitting-booth'],[]],
  'locker-room':[['locker-changing','gym-bench'],[]],'dressing-room':[['vanity-station'],[]],'bakery-display':[['bread-display','cabinet-bakery'],['baker']],'mart-aisle':[['gondola-shelf','shopping-cart'],['shopper']],
  'model-house':[['scale-model-table'],['designer']],'assembly-line':[['roller-conveyor','table-workbench'],['worker']],'shipping-dock':[['roller-conveyor','roll-cage','pallet-jack'],['courier']],'art-storage':[['painting-rack','art-crate-stack'],['researcher']],
  'ceo-office':[['desk-executive','executive-chair','sofa-three','vip-lounge-chair','cabinet-showcase'],['office','clerk']],'exec-office':[['desk-executive','executive-chair','table-huddle','whiteboard-plain'],['office']],
  'director-office':[['desk-office','cabinet-files','table-cafe-round'],['office']],
  'elevator-hall':[['elevator-doors','mailbox-wall'],[]],'ride-queue':[['queue-rail'],['guide']],'self-checkout':[['checkout-counter','shopping-cart'],['retailer']],
};
let signatures=0;
for(const [name,[furniture,people]] of Object.entries(signature))for(const variant of ['compact','standard','spacious']){
  const entries=roomsOf.get(name+' '+variant)||[];assert(entries.length,name+' has a '+variant+' single-space template');
  for(const entry of entries){
    for(const piece of furniture)assert(has(entry,piece),`${entry.template.id} (${name}) has ${piece}`);
    const present=roles(entry);for(const role of people)assert(present.has(role),`${entry.template.id} (${name}) has a ${role}`);
    signatures++;
  }
}
// A parasol canopy hangs above its table; cinema and stadium seats keep facing the screen.
for(const entry of roomsOf.get('cafe-terrace standard'))for(const canopy of entry.scene.objects.filter(o=>o.roomId===entry.room.id&&o.assetId==='furniture:parasol-canopy'))assert(canopy.elevation>=1.98&&entry.scene.objects.some(o=>o.assetId==='furniture:parasol-table'&&o.x===canopy.x&&o.z===canopy.z),'canopy above a parasol table');
for(const name of ['cinema','stadium-stand'])for(const entry of roomsOf.get(name+' standard'))for(const seat of entry.scene.objects.filter(o=>o.roomId===entry.room.id&&['furniture:cinema-recliner','furniture:stadium-seat'].includes(o.assetId)))assert.equal(seat.rotation,180,name+' seats face the screen');

// 4. Different spaces look different: far fewer spaces share one furniture arrangement than under composition 4 (83 arrangements, 39 in the largest group).
const layouts=new Map(),seen=new Set();
for(const template of library.templates.filter(t=>t.scope==='single'&&t.variant==='standard'&&!t.id.startsWith('case-'))){
  const scene=scenes[template.id],key=template.industry+':'+scene.rooms[0].name;if(seen.has(key))continue;seen.add(key);
  const layout=scene.objects.filter(o=>!o.assetId.startsWith('product:')).map(o=>o.assetId+'@'+Math.round(o.x*2)+','+Math.round(o.z*2)).sort().join('|');
  layouts.set(layout,(layouts.get(layout)||0)+1);
}
const largest=Math.max(...layouts.values());
assert(layouts.size>=170&&largest<=16,`distinct arrangements ${layouts.size} / largest identical group ${largest}`);

// 5. Regenerating a template from its studio form keeps each room's character and stays valid; older compositions get none.
let rebuiltRooms=0;
for(const template of library.templates.filter(t=>t.scope==='full'&&t.variant==='standard'&&!t.id.startsWith('case-'))){
  const rebuilt=createSceneFromForm(studioDocumentFromTemplate(template,library).form,library),original=scenes[template.id];
  assert.deepEqual(validateScene(rebuilt,library).errors,[],template.id+' rebuilt scene is valid');
  assert.deepEqual(inspectNaturalLayout(rebuilt,library).issues,[],template.id+' rebuilt scene is natural');
  for(const room of original.rooms){assert.equal(rebuilt.rooms.find(r=>r.id===room.id)?.character,room.character,template.id+' '+room.name+' keeps its character');rebuiltRooms++;}
}
const legacyTemplate={...structuredClone(library.templates.find(t=>t.id==='ht-1-standard')),id:'legacy-probe',compositionVersion:4};
const legacy=createScene({templateId:'legacy-probe'},{...library,templates:[legacyTemplate]});
assert(!legacy.rooms[0].character&&!legacy.objects.some(o=>o.assetId==='furniture:luggage-cart'),'composition 4 rooms keep their earlier layout');
assert(legacy.objects.some(o=>o.assetId.startsWith('furniture:sofa')),'the earlier reception layout is intact');

// 6. Rooms added by name. The start popup keeps a recommended space's seat count (임원실 is one desk, not eight) and gives a
//    typed name with no template the character of that name; a room added in the studio does the same.
const office=recommendedSpaces(library,'OF');
for(const name of ['대표실','임원실','실장실'])assert(office.some(space=>space.name===name),name+' is a recommended office space');
// 사장실 · 팀장실 are typed names with no template; 주간 회의실 is a typed name no character applies to (it keeps the generic meeting room).
const entries=startRooms(['대표실','임원실','실장실','사장실','팀장실','주간 회의실'],office,{industry:'OF'});
assert(entries.slice(0,3).every(entry=>entry.spec)&&entries.slice(3).every(entry=>!entry.spec),'three template spaces, three typed names');
assert(entries[3].room.layoutCompositionVersion>=5&&!entries[5].room.layoutCompositionVersion,'only a typed name with a character gets the current composition');
assert.equal(entries[1].room.capacity,1,'임원실 keeps its single seat');
const started=createSceneFromForm({...emptyStudioForm(),industry:'OF',style:'modern',rooms:entries.map(entry=>entry.room)},library);populateScenePeople(started,library);
assert.deepEqual(started.rooms.map(room=>room.character||null),['ceo-office','exec-office','director-office','ceo-office','director-office',null],'each named room gets its own character');
assert.deepEqual(validateScene(started,library).errors,[]);assert.deepEqual(inspectNaturalLayout(started,library).issues,[]);
const desks=room=>started.objects.filter(o=>o.roomId===room.id&&assets[o.assetId].kind==='desk').length;
assert(started.rooms.slice(0,5).every(room=>desks(room)===1),'an executive room has one desk, not rows of them');
assert(new Set(started.rooms.slice(0,3).map(room=>started.objects.filter(o=>o.roomId===room.id&&!o.assetId.startsWith('product:')&&!o.autoDressing).map(o=>o.assetId).sort().join('|'))).size===3,'대표실 · 임원실 · 실장실 are furnished differently');
assert.deepEqual(createSceneFromForm(studioFormFromScene(started),library).rooms.map(room=>room.character||null),started.rooms.map(room=>room.character||null),'characters of typed rooms survive the studio form');
const added=addRoom({scene:started,form:studioFormFromScene(started)},{kind:'office',name:'본부장실'},library);
assert.equal(added.scene.rooms.at(-1).character,'exec-office','a room added in the studio by name gets its character');

console.log(`PASS ${characterRooms} of ${rooms} rooms have one of ${used.size} characters; ${CHARACTER_ASSETS.length} new furnishings; ${signatures} signature rooms in three sizes; ${layouts.size} distinct arrangements among ${seen.size} spaces (largest identical group ${largest}); ${rebuiltRooms} rooms keep their character through the studio form`);
