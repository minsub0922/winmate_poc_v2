import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useSpatialProductPeek} from './spatial-product-preview.jsx';
import {SpatialObjectThumb} from './spatial-library.jsx';
import {spatialAssetLabel} from '../domain/spatial/catalog.js';

export function useSpatialObjectPeek(){
  const product=useSpatialProductPeek(),[furniture,setFurniture]=useState(null),timer=useRef(null),over=useRef(false);
  const clear=()=>clearTimeout(timer.current);
  const hide=event=>{clear();product.hide(event);if(event?.type)timer.current=setTimeout(()=>{if(!over.current)setFurniture(null);},180);else{over.current=false;setFurniture(null);}};
  const show=(asset,anchor,immediate=false)=>{
    clear();if(!asset)return;over.current=false;
    if(asset.productId){setFurniture(null);product.show(asset,anchor,immediate);return;}
    product.hide();const open=()=>{if(anchor?.isConnected)setFurniture({asset,rect:anchor.getBoundingClientRect()});};
    if(immediate)open();else timer.current=setTimeout(open,260);
  };
  useEffect(()=>()=>clear(),[]);
  useEffect(()=>{if(!furniture)return;const outside=event=>{if(event.type==='scroll'&&event.target.closest?.('.sp-furniture-peek'))return;hide();};const key=event=>{if(event.key==='Escape')hide();};window.addEventListener('scroll',outside,true);window.addEventListener('resize',outside);document.addEventListener('keydown',key);return()=>{window.removeEventListener('scroll',outside,true);window.removeEventListener('resize',outside);document.removeEventListener('keydown',key);};},[!!furniture]);
  return {show,hide,props:product.props,open:(asset,anchor)=>asset?.productId?product.open(asset,anchor):show(asset,anchor,true),node:<>{product.node}{furniture&&createPortal(<FurniturePeek {...furniture} onEnter={()=>{over.current=true;clear();}} onLeave={hide}/>,document.body)}</>};
}

function FurniturePeek({asset,rect,onEnter,onLeave}){
  const node=useRef(null),[position,setPosition]=useState({left:-9999,top:-9999,width:Math.min(360,innerWidth-24),maxHeight:innerHeight-24});
  useLayoutEffect(()=>{
    const width=Math.min(360,innerWidth-24),naturalHeight=Math.max(node.current.offsetHeight,node.current.scrollHeight),height=Math.min(naturalHeight,innerHeight-24),gap=10,margin=12;
    let left,top,maxHeight=innerHeight-24;
    if(rect.right+gap+width<=innerWidth-margin){left=rect.right+gap;top=Math.max(margin,Math.min(rect.top,innerHeight-height-margin));}
    else if(rect.left-gap-width>=margin){left=rect.left-gap-width;top=Math.max(margin,Math.min(rect.top,innerHeight-height-margin));}
    else{
      left=Math.max(margin,Math.min(rect.left,innerWidth-width-margin));
      const above=rect.top-gap-margin,below=innerHeight-rect.bottom-gap-margin,useAbove=above>=height||above>=below;
      maxHeight=Math.max(1,useAbove?above:below);top=useAbove?rect.top-gap-Math.min(naturalHeight,maxHeight):rect.bottom+gap;
    }
    setPosition({left,top,width,height:Math.min(naturalHeight,maxHeight),maxHeight});
  },[asset,rect]);
  return <aside ref={node} className="sp-furniture-peek dpk" aria-label={spatialAssetLabel(asset)+' 오브젝트 상세'} style={position} onMouseEnter={onEnter} onMouseLeave={onLeave}>
    <article className="dpk-card"><header className="dpk-head"><span className="dpk-crumb">{asset.assetGroup==='people'?'사람 · 직종 연출':'공용 가구 · 설계 오브젝트'}</span></header><div className="dpk-scroll"><div className="sp-furniture-peek-body"><strong>{spatialAssetLabel(asset)}</strong><SpatialObjectThumb asset={asset}/><p>{asset.description}</p>{asset.assetGroup==='people'&&asset.actors.map(actor=><p key={actor.id}><b>{actor.role}</b> · {[...(actor.wardrobe||[]),...(actor.accessories||[])].join(' · ')}</p>)}<small>가로 × 높이 × 깊이 · {asset.size.map(n=>Math.round(n*1000)).join(' × ')} mm</small></div></div></article>
  </aside>;
}
