// Taxonomy coverage of the space bird's-eye library: every vertical, space and product category
// of app/data/vertical_space_product.json has a map, a room and a recorded placement decision.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createScene,validateScene} from '../web/src/domain/spatial/scene.js';
import {spatialTemplateCatalog,verticalTitle} from '../web/src/domain/spatial/template-catalog.js';
import {TEMPLATE_ROOM} from '../web/src/domain/spatial/template-composition.js';
const read=path=>JSON.parse(fs.readFileSync(new URL(path,import.meta.url)));
const library=read('../data/spatial/library.json'),scenes=read('../data/spatial/scenes.json');
const taxonomy=read('../data/vertical_space_product.json'),solutions=read('../data/vertical_space_solution.json'),layouts=read('../data/spatial/vertical-layouts.json');
const assets=Object.fromEntries(library.assets.map(a=>[a.id,a])),byId=new Map(library.templates.map(t=>[t.id,t]));
const scale={compact:.85,standard:1,spacious:1.25},close=(a,b)=>Math.abs(a-b)<.0001;
const statuses={placed:0,linked:0,logical:0,omitted:0};

for(const group of Object.keys(taxonomy.meta.groups))assert(library.industries.some(i=>i.code===group),group+' taxonomy group is a template industry');
assert.deepEqual(library.verticals.map(v=>v.id),taxonomy.verticals.map(v=>v.id),'every taxonomy vertical has spatial maps');
assert.equal(library.counts.verticals,taxonomy.verticals.length);
assert.equal(library.counts.verticalSpaces,taxonomy.verticals.reduce((n,v)=>n+v.spaces.length,0));
const solutionSpaces=new Map(solutions.verticals.flatMap(v=>v.spaces.map(s=>[s.id,s.solutions.map(x=>x.solution)])));

for(const source of taxonomy.verticals){
  const vertical=library.verticals.find(v=>v.id===source.id),layout=layouts.verticals.find(v=>v.id===source.id);
  assert.equal(vertical.group,source.group);assert.equal(vertical.sizeSegment,source.size_segment);
  assert.deepEqual(vertical.spaces.map(s=>s.id),source.spaces.map(s=>s.id),source.id+' spaces in taxonomy order');
  const zoned=vertical.zones.flatMap(z=>z.spaces);
  assert.deepEqual([...zoned].sort(),source.spaces.map(s=>s.id).sort(),source.id+' zones cover each space exactly once');
  for(const zone of vertical.zones)for(const variant of Object.keys(scale)){
    const template=byId.get(`v-${source.id}-${zone.key}-${variant}`),scene=scenes[template?.id];
    assert(template&&scene,source.id+' '+zone.key+' '+variant+' full map');
    assert.equal(template.scope,'full');assert.equal(template.vertical,source.id);assert.equal(template.industry,source.group);
    assert.deepEqual(scene.rooms.map(r=>r.id),zone.spaces,template.id+' rooms follow the zone');
    assert(scene.rooms.every(r=>close(r.width,TEMPLATE_ROOM.width*scale[variant])&&close(r.depth,TEMPLATE_ROOM.depth*scale[variant])),template.id+' standard room size');
  }
  for(const space of source.spaces){
    const record=vertical.spaces.find(s=>s.id===space.id);
    assert.equal(record.profile,layout.spaces[space.id].profile);
    assert.deepEqual(record.categories,space.products,space.id+' keeps every product category');
    assert.deepEqual(record.coverage.map(c=>c.category),space.products,space.id+' decision per category');
    assert.deepEqual(record.solutions.map(s=>s.id),solutionSpaces.get(space.id)||[],space.id+' solution matches');
    for(const variant of Object.keys(scale)){
      const template=byId.get(`v-${space.id}-${variant}`);assert(template,space.id+' '+variant+' single map');
      assert.equal(template.scope,'single');assert.deepEqual(template.rooms.map(r=>r.key),[space.id]);
    }
    const single=scenes[`v-${space.id}-standard`],zone=vertical.zones.find(z=>z.spaces.includes(space.id)),full=scenes[`v-${source.id}-${zone.key}-standard`];
    for(const decision of record.coverage){
      statuses[decision.status]++;
      assert(decision.reason,space.id+' '+decision.category+' reason');
      if(decision.status==='placed'){
        assert(assets['product:'+decision.productId]?.physical,decision.productId+' physical');
        for(const scene of [single,full])assert(scene.objects.some(o=>o.roomId===space.id&&o.assetId==='product:'+decision.productId),`${space.id} ${decision.category} → ${decision.productId} placed`);
      }else assert(['linked','logical','omitted'].includes(decision.status),decision.status);
      if(decision.status==='logical')assert(decision.category.startsWith('s_')||['shoe','ring','g_medical','g_storage','g_network','supply'].includes(decision.category),space.id+' '+decision.category+' only software or catalogue items without 3D form are logical');
    }
  }
  const listed=spatialTemplateCatalog(library,{vertical:source.id,scope:'all'});
  assert.equal(listed.length,vertical.zones.length+source.spaces.length,source.id+' vertical filter lists every zone and space');
  assert(listed.every(t=>t.vertical===source.id&&t.variant==='standard'));
  assert(spatialTemplateCatalog(library,{vertical:source.id,scope:'single',variant:'compact'}).every(t=>t.variant==='compact'&&t.scope==='single'));
}
// Software and catalogue-only items are recorded, never drawn as objects; only one LED was held back by the one-screen classroom rule.
assert(statuses.placed>=800,'most taxonomy categories are drawn as Samsung products');
assert(statuses.omitted<=3,'placement omissions stay exceptional');
const best=spatialTemplateCatalog(library,{vertical:'best',scope:'all'});assert(best.length&&best.every(t=>!t.vertical),'best-scenario filter');
// Titles add the size segment only when the label does not already say it.
const titleOf=id=>verticalTitle(library.verticals.find(v=>v.id===id));
assert.equal(titleOf('md_tertiary'),'상급종합병원 (대형)');assert.equal(titleOf('mi_military'),'군 부대');assert.equal(titleOf('ht_large'),'대형 호텔 · IR');assert.equal(titleOf('rt_hyper'),'대형마트 · SSM');
assert.equal(new Set(library.verticals.map(v=>verticalTitle(v))).size,library.verticals.length,'vertical titles stay distinct');
const scene=createScene({templateId:'v-md_tertiary-ward-standard'},library);assert.deepEqual(validateScene(scene,library).errors,[]);assert.deepEqual(scene,scenes['v-md_tertiary-ward-standard'],'deterministic vertical scene');
console.log(`PASS ${library.verticals.length} verticals · ${library.counts.verticalSpaces} spaces · ${library.counts.verticalTemplates} vertical maps · categories ${JSON.stringify(statuses)}`);
