import { spatialAssetMatches } from './catalog.js';

export function productMentionQuery(value){
  const text=String(value||'').trimStart().replace(/^＠/,'@');
  return text.startsWith('@')&&!text.slice(1).includes('@')?text.slice(1).trim():null;
}
export function mentionedProductChoices(assets,query,limit=20){
  if(query==null)return [];
  const text=query.trim().toLocaleLowerCase();
  const rank=a=>a.model?.toLocaleLowerCase()===text?0:a.name?.toLocaleLowerCase()===text?1:2;
  return assets.filter(a=>a.productId&&a.physical&&a.catalogVisible!==false&&spatialAssetMatches(a,query))
    .sort((a,b)=>rank(a)-rank(b)).slice(0,limit);
}
export function addMentionedProduct(products,asset){
  if(!asset?.productId||!asset.physical)throw new Error('공간에 배치할 제품을 선택해 주세요.');
  return products.some(p=>p.productId===asset.productId)?products:[...products,{productId:asset.productId,quantity:1}];
}
