import { fingerprint } from './scene.js';

const variantBase=id=>id.replace(/-(compact|standard|spacious)$/,'');
const normalize=(value,extent)=>Math.round(value/extent*1000)/1000;

// Compare rendered content, ignoring titles, source IDs and uniform size changes.
export function spatialTemplateIdentity(scene){
  const products={};
  for(const object of scene.objects)if(object.assetId.startsWith('product:'))products[object.assetId]=(products[object.assetId]||0)+1;
  const rooms=[...scene.rooms].sort((a,b)=>a.z-b.z||a.x-b.x);
  const layout=rooms.map(room=>({
    bounds:[normalize(room.x,scene.width),normalize(room.z,scene.depth),normalize(room.width,scene.width),normalize(room.depth,scene.depth)],
    objects:scene.objects.filter(object=>object.roomId===room.id).map(object=>[
      object.assetId.startsWith('product:')?'product':object.assetId,
      normalize(object.x-room.x,room.width),normalize(object.z-room.z,room.depth),
      normalize(object.elevation||0,room.height),((object.rotation||0)%360+360)%360,
    ]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
  }));
  return {products:fingerprint(products),layout:fingerprint(layout),productIds:Object.keys(products).map(id=>id.slice(8)).sort()};
}

export function buildSpatialTemplateCatalog(library,scenes){
  const rank=template=>(template.variant==='standard'?0:template.variant==='compact'?100:200)+(template.id.startsWith('case-')?20:0)+(template.scope==='full'?0:10);
  const groups=new Map(library.industries.map(industry=>[industry.code,[]]));
  for(const template of [...library.templates].sort((a,b)=>rank(a)-rank(b))){
    const scene=scenes[template.id];
    if(!scene)throw new Error('Missing template scene '+template.id);
    const identity=spatialTemplateIdentity(scene);
    const entries=groups.get(template.industry);
    const duplicate=entries.find(entry=>entry.products===identity.products)||entries.find(entry=>entry.layout===identity.layout);
    if(duplicate){
      if(duplicate.products===identity.products)duplicate.aliases.push(template.id);
      if(duplicate.products===identity.products&&variantBase(duplicate.id)===variantBase(template.id))duplicate.variants[template.variant]=template.id;
      continue;
    }
    entries.push({id:template.id,...identity,variants:{[template.variant]:template.id},aliases:[template.id]});
  }
  // Every industry gets its representative before any industry's second entry.
  const catalog=[];
  for(let row=0;[...groups.values()].some(entries=>entries.length>row);row++)for(const entries of groups.values())if(entries[row])catalog.push(entries[row]);
  return catalog;
}

export function spatialTemplateCatalog(library,{industry='all',scope=library?.templateDefaults?.scope||'all',variant='all',query=''}={}){
  if(!library)return [];
  const byId=new Map(library.templates.map(template=>[template.id,template]));
  const search=query.trim().toLowerCase();
  // Older archived libraries retain their original IDs; only canonical standard
  // templates are listed when no generated browse catalog is available.
  const catalog=library.templateCatalog||library.templates.filter(template=>template.variant==='standard'&&!template.id.startsWith('case-')).map(template=>({id:template.id,variants:{standard:template.id},aliases:[template.id]}));
  return catalog.flatMap(entry=>{
    const template=byId.get(variant==='all'?entry.id:entry.variants[variant]);
    if(!template||industry!=='all'&&template.industry!==industry||scope!=='all'&&template.scope!==scope)return [];
    const aliases=entry.aliases.map(id=>byId.get(id)).filter(Boolean);
    const industryName=library.industries.find(item=>item.code===template.industry)?.name||'';
    if(search&&![industryName,...aliases.flatMap(item=>[item.name,item.id,item.source?.layoutId||'',...item.rooms.flatMap(r=>[r.name,...(r.includedSpaces||[]).map(s=>s.name)])])].join(' ').toLowerCase().includes(search))return [];
    return [{...template,catalog:entry}];
  });
}
