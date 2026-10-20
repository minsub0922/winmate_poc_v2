// Group the browser catalogue without changing asset IDs or saved scene dimensions.
export function spatialAssetName(asset) {
  let name=asset.name.trim();
  if(asset.model){
    const escaped=asset.model.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    name=name.replace(new RegExp('(?:\\s+|^)'+escaped+'$','i'),'').trim();
  }
  // A trailing catalogue code is an option, while names such as 1Way and Book5 remain distinct.
  return name.replace(/\s+(?=[A-Z0-9-]*[A-Z])(?=[A-Z0-9-]*\d)[A-Z][A-Z0-9-]{3,}$/i,'').trim()||asset.name;
}

export const spatialAssetLabel=asset=>asset.model&&!asset.name.toLowerCase().includes(asset.model.toLowerCase())?asset.name+' · '+asset.model:asset.name;
export const spatialDimensionsLabel=size=>size.map(n=>Number((n*1000).toFixed(2))).join(' × ');
export const isSpatialCatalogAsset=asset=>asset.catalogVisible!==false;
export function spatialAssetInFamily(asset,family){
  if(family==='all')return true;
  if(family==='people')return asset.assetGroup==='people';
  if(family==='furniture')return !asset.productId&&asset.assetGroup!=='people';
  return asset.family===family;
}
export function spatialAssetMatches(asset,query){
  const text=[asset.name,asset.model,asset.category,asset.description,...(asset.variants||[]),...(asset.spaces||[]),...(asset.keywords||[])].join(' ').toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).every(term=>text.includes(term));
}

export function groupSpatialAssets(assets) {
  const groups=new Map();
  for(const asset of assets){
    if(!isSpatialCatalogAsset(asset))continue;
    const name=spatialAssetName(asset),key=[asset.productId?'product':'furniture',asset.recipeFamily||asset.recipe||asset.kind,asset.physical,name.toLocaleLowerCase()].join('|');
    if(!groups.has(key))groups.set(key,{id:asset.id,name,members:[]});
    groups.get(key).members.push(asset);
  }
  return [...groups.values()];
}

export const spatialObjectThumbnail=asset=>asset.thumbnail||'/assets/spatial-objects/'+(asset.productId?'recipe-'+(asset.recipe||asset.kind):asset.id.replace(':','-'))+'.webp';
