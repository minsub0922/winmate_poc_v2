import React from 'react';
import { useDetailPeek } from './reference-detail.jsx';
import { PImg } from '../services/products.js';
import { P } from '../services/catalog.js';
import { photoOf } from './Thumbs.jsx';
import { spatialAssetLabel,spatialObjectThumbnail,spatialDimensionsLabel } from '../domain/spatial/catalog.js';

/** A model-bound comparison; keep the shared detail gallery, source and spec body. */
export function SpatialProductComparison({asset,onExpand}){
  const product=P[asset.productId],evidence=asset.imageEvidence;
  const original=asset.referenceImage||evidence?.gallery?.[0]||evidence?.thumbnail||photoOf('product',asset.productId)?.src||product?.gal?.[0]||product?.th;
  const index=evidence?.gallery?.indexOf(asset.appearance?.source),description=index>=0?evidence.labels?.[index]:evidence?.labels?.[0];
  return <section className="sp-product-comparison" aria-label="오브젝트와 원본 제품 이미지 비교" data-spatial-product-id={asset.productId}>
    <div className="sp-comparison-heading"><strong>{spatialAssetLabel(asset)}</strong>{onExpand&&<button type="button" onClick={onExpand}>크게 보기</button>}</div>
    <div className="sp-comparison-images">
      <figure><div className="sp-comparison-picture"><PImg src={spatialObjectThumbnail(asset)} alt={spatialAssetLabel(asset)+' 조감도 오브젝트'} loading="eager" style={{width:'100%',height:'100%',objectFit:'contain'}}/></div><figcaption>조감도 오브젝트</figcaption></figure>
      <figure><div className="sp-comparison-picture">{original?<PImg src={original} alt={description||spatialAssetLabel(asset)+' 원본 제품 이미지'} loading="eager" style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<span className="sp-comparison-missing">등록된 원본 이미지가 없어요.</span>}</div><figcaption>원본 제품 이미지</figcaption></figure>
    </div>
    <div className="sp-comparison-meta"><span>{spatialDimensionsLabel(asset.size)} mm</span><span>{asset.dimensionSource==='catalog-spec'?'확인 치수':'추정 · 설계 치수'}</span></div>
    {original&&<p className="sp-comparison-source">{description||'카탈로그에 연결된 참고 이미지'}{asset.dimensionScope==='family'?' · 제품군 대표 구성':''}</p>}
  </section>;
}

export function useSpatialProductPeek(){
  const peek=useDetailPeek(null,{maxWidth:420});
  const valid=asset=>!!asset?.productId&&!!P[asset.productId];
  const open=(asset,anchor)=>{if(valid(asset))peek.open('product:'+asset.productId,{anchor,preview:<SpatialProductComparison asset={asset}/>});};
  const show=(asset,anchor,immediate=false)=>{if(valid(asset))peek.show('product:'+asset.productId,anchor,immediate,{preview:<SpatialProductComparison asset={asset} onExpand={()=>open(asset,anchor)}/>});};
  const props=asset=>({
    'data-spatial-product-preview':asset?.productId,
    onMouseEnter:e=>show(asset,e.currentTarget),onMouseLeave:peek.hide,
    onFocus:e=>{if(e.target===e.currentTarget)show(asset,e.currentTarget,true);},onBlur:peek.hide,
    onClick:e=>open(asset,e.currentTarget),
  });
  return {show,open,hide:peek.hide,props,node:peek.node};
}
