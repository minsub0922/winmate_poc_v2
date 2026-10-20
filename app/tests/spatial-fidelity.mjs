import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../web/node_modules/three/build/three.module.js';
import {spatialPartGeometry,spatialPartPosition} from '../web/src/domain/spatial/part-geometry.js';
const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url)));
const byId=Object.fromEntries(library.assets.map(a=>[a.id,a]));
const expected={ec_360_091:'display',ec_360_112:'monitor',bi_dish:'dishwasher',sg_g000183970:'display',sg_g000181648:'floorac',book:'laptop',ec_360_098:'logical',ehs:'outdoor',xcover7:'phone',sg_g000184023:'robotvacuum',sg_g000183896:'desktop'};
for(const [id,kind] of Object.entries(expected))assert.equal(byId['product:'+id].kind,kind,id);
assert.equal(byId['product:wf1way'].recipe,'cassette1way');
assert.equal(byId['product:wf4way'].recipe,'cassette');
assert.equal(byId['product:ac360'].recipe,'cassette360');
assert.equal(byId['product:sg_g000183896'].recipe,'desktop');
assert.equal(byId['product:ec_203_024'].recipe,'cassette');
assert.deepEqual(byId['product:ehs'].size,[1.27,1.018,.53]);
assert.deepEqual(byId['product:sg_g000183217'].size,[.31,.046,.32]);
assert.deepEqual(byId['product:book'].size,[.3123,.0116,.2238]);
assert.deepEqual(byId['product:sg_g000183669'].size,[.912,1.853,.697]);
assert(library.assets.filter(a=>a.kind==='laptop').length>=60,'SSD in laptop names is not an accessory');
let parts=0;
for(const asset of library.assets){
  const bounds=new THREE.Box3();
  for(const part of library.recipes[asset.recipe||asset.kind]||asset.parts){
    const g=spatialPartGeometry(part,asset.size,asset.geometryTransform);g.computeBoundingBox();
    bounds.union(g.boundingBox.translate(new THREE.Vector3(...spatialPartPosition(part,asset))));g.dispose();parts++;
  }
  const size=bounds.getSize(new THREE.Vector3()).toArray();
  size.forEach((v,i)=>assert(Math.abs(v-asset.size[i])<Math.max(1e-6,asset.size[i]*1e-5),`${asset.id} axis ${i}: ${v} vs ${asset.size[i]}`));
  assert(Math.abs(bounds.min.y)<1e-6,asset.id+' must sit on its installation elevation');
  assert(Math.abs(bounds.min.x+bounds.max.x)<1e-6,asset.id+' centered x');
  assert(Math.abs(bounds.min.z+bounds.max.z)<1e-6,asset.id+' centered z');
  if(asset.dimensionSource==='catalog-spec')assert(asset.dimensionEvidence?.length===3,asset.id+' dimension provenance');
  if(asset.dimensionEvidence)assert(!/팔레트|pallet/i.test(asset.dimensionEvidence.join(' ')),asset.id+' pallet is not product size');
  if(asset.componentDimensions){
    assert.equal(asset.dimensionSource,'estimated',asset.id+' assembly must not inherit panel accuracy');
    // The panel can use a model-specific colour. Its verified W/H/D identifies
    // the component independently of material names or the order of parts.
    const componentDimensions=(library.recipes[asset.recipe]||asset.parts).map(part=>{
      const geometry=spatialPartGeometry(part,asset.size,asset.geometryTransform);geometry.computeBoundingBox();
      const dimensions=geometry.boundingBox.getSize(new THREE.Vector3()).toArray();geometry.dispose();return dimensions;
    });
    assert(componentDimensions.some(dimensions=>dimensions.every((v,i)=>Math.abs(v-asset.componentDimensions.display[i])<.001)),asset.id+' panel subcomponent ratio');
  }
  if(asset.referenceImage)assert(fs.existsSync(new URL('../web/public'+asset.referenceImage,import.meta.url)),asset.id+' reference');
  if(asset.appearance?.facade)assert(['front','top','inferred-front'].includes(asset.appearance.orientation),asset.id+' texture orientation');
}
assert.deepEqual(byId['product:oh55a'].size,[1.2606,.7314,.085],'55-inch outdoor signage must not use 75-inch dimensions');
assert.equal(byId['product:window'].displaySpec.sides,1,'OM55B is a single-sided window display');
assert.deepEqual(byId['product:smartmonitor'].displaySpec.panelSize,[.7134,.4238,.0245]);
assert.deepEqual(byId['product:epaper'].size,[.7273,.4262,.0179]);
assert.deepEqual(byId['product:tabactive5'].size,[.2429,.1702,.0102]);
for(const id of ['qm55c','qm65c']){
  const a=byId['product:'+id],part=a.parts.find(p=>p.shape==='box'&&p.material!=='screenOff'),g=spatialPartGeometry(part,a.size,a.geometryTransform);g.computeBoundingBox();
  const positions=g.getAttribute('position');let topX=-Infinity;
  for(let i=0;i<positions.count;i++)if(Math.abs(positions.getY(i)-g.boundingBox.max.y)<1e-7)topX=Math.max(topX,positions.getX(i));
  assert(Math.abs((g.boundingBox.max.x-topX)-.001)<.0001,id+' corner radius is 1 mm, not a percentage of screen width');g.dispose();
}
for(const asset of library.assets.filter(a=>a.displaySpec)){
  const [w,h]=asset.displaySpec.panelSize,[left,top,right,bottom]=asset.displaySpec.bezel;
  assert(left+right<w&&top+bottom<h,asset.id+' physical bezel');
  assert(asset.parts.every(p=>p.material!=='screen'),asset.id+' must not display a fabricated Samsung screen');
  for(const face of asset.appearance?.displayFaces||[]){assert.deepEqual(face.size,face.face==='front'?[w-left-right,h-top-bottom]:[w,h],asset.id+' photograph plane follows measured active panel and bezel');assert(fs.existsSync(new URL('../web/public'+face.image,import.meta.url)));}
}
// A rotated fan stays shallow even when its appliance is very tall.
const g=spatialPartGeometry({shape:'cylinder',size:[.3,.025,.3],rotate:[Math.PI/2,0,0]},[.6,1.8,.5]);g.computeBoundingBox();
const size=g.boundingBox.getSize(new THREE.Vector3());assert(Math.abs(size.z-.0125)<1e-6);assert(Math.abs(size.y-1.08)<1e-6);g.dispose();
console.log(`PASS ${library.assets.length} exact geometry envelopes, ${parts} parts, model identity, axis order, evidence, facade orientation and rotated fan depth`);
