import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSpatialTemplateCatalog,spatialTemplateCatalog,spatialTemplateIdentity} from '../web/src/domain/spatial/template-catalog.js';

const library=JSON.parse(fs.readFileSync(new URL('../data/spatial/library.json',import.meta.url)));
const scenes=JSON.parse(fs.readFileSync(new URL('../data/spatial/scenes.json',import.meta.url)));
assert.deepEqual(library.templateCatalog,buildSpatialTemplateCatalog(library,scenes),'generated browse index must match actual scene contents');
assert(library.templateCatalog.length<library.templates.length);
const industryCodes=library.industries.map(industry=>industry.code);
const all=spatialTemplateCatalog(library);
assert.deepEqual(all.slice(0,industryCodes.length).map(template=>template.industry),industryCodes,'every industry appears before second entries');
for(const variant of ['all','compact','standard','spacious']){
  for(const industry of industryCodes){
    const templates=spatialTemplateCatalog(library,{industry,variant});
    assert(templates.length>0,industry+' needs '+variant+' coverage');
    const identities=templates.map(template=>spatialTemplateIdentity(scenes[template.id]));
    assert.equal(new Set(identities.map(identity=>identity.products)).size,templates.length,industry+' '+variant+' repeated product configuration');
    assert.equal(new Set(identities.map(identity=>identity.layout)).size,templates.length,industry+' '+variant+' repeated placement');
  }
}
for(const entry of library.templateCatalog){
  const canonical=scenes[entry.id];
  const identity=spatialTemplateIdentity(canonical);
  assert.equal(entry.products,identity.products);assert.equal(entry.layout,identity.layout);
  for(const id of Object.values(entry.variants))assert.equal(spatialTemplateIdentity(scenes[id]).products,identity.products,'size choices keep the product configuration');
  for(const id of entry.aliases)assert.equal(spatialTemplateIdentity(scenes[id]).products,identity.products,'source aliases may not substitute another product configuration');
}
for(const scope of ['single','full'])assert(spatialTemplateCatalog(library,{scope}).every(template=>template.scope===scope));
assert.equal(spatialTemplateCatalog(library,{query:'no-such-template-xyz'}).length,0);
const alias=library.templateCatalog.find(entry=>entry.aliases.length>1);
assert(spatialTemplateCatalog(library,{scope:'all',query:alias.aliases[1]}).some(template=>template.id===alias.id));
const original=scenes['fb-full-standard'],renamed=structuredClone(original);
renamed.title='다른 제목';renamed.templateId='another-id';
assert.deepEqual(spatialTemplateIdentity(renamed),spatialTemplateIdentity(original));
const changed=structuredClone(original),product=changed.objects.find(object=>object.assetId.startsWith('product:'));
product.assetId='product:another-model';
assert.notEqual(spatialTemplateIdentity(changed).products,spatialTemplateIdentity(original).products);
assert.equal(spatialTemplateIdentity(changed).layout,spatialTemplateIdentity(original).layout,'changing only the model is not a different placement');
console.log(`PASS ${library.templates.length} raw templates reduced to ${all.length} distinct choices; all ${industryCodes.length} industries and size filters have unique products and placements; source search and signatures validated`);
