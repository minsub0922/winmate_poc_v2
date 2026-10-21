import ROLES from './proposal_typography.json' with {type:'json'};

// Native 1280×720 slide units. Text roles stay the same in previews, editing,
// saved proposals and editable PPTX; content length never changes the font size.
export const PROPOSAL_TYPE = {
  fineprint: {size:10, leading:1.35},
  utility: {size:12, leading:1.35},
  label: {size:14, leading:1.35},
  dense: {size:16, leading:1.4},
  body: {size:18, leading:1.4},
  heading: {size:20, leading:1.3},
  subheading: {size:24, leading:1.25},
  title: {size:32, leading:1.25},
  metric: {size:40, leading:1.2},
  cover: {size:48, leading:1.2},
  display: {size:56, leading:1.15},
};

const VOID=new Set(['img','br','hr','input','meta','link','source','wbr','area','base','embed','param','track','col']);
function layoutTree(html){
  const nodes=[],stack=[];let match;
  const tags=/<\/?([a-z][\w:-]*)\b[^>]*>/gi;
  while((match=tags.exec(html))){
    const tag=match[0],name=match[1].toLowerCase();
    if(tag.startsWith('</')){while(stack.length){if(stack.pop().name===name)break;}continue;}
    const parent=stack.at(-1),style=/\bstyle="([^"]*)"/.exec(tag),node={tag,name,parent,start:match.index,end:tags.lastIndex,children:[],style:new Map((style?.[1]||'').split(';').map(s=>s.trim()).filter(Boolean).map(s=>{const i=s.indexOf(':');return[s.slice(0,i).trim(),s.slice(i+1).trim()];})),id:/\bdata-tb="(\d+)"/.exec(tag)?.[1]};
    nodes.push(node);parent?.children.push(node);if(!VOID.has(name)&&!tag.endsWith('/>'))stack.push(node);
  }
  return nodes;
}
const set=(node,props)=>{if(node)for(const [k,v]of Object.entries(props)){if(v==null)node.style.delete(k);else node.style.set(k,String(v));}};
const ancestor=(node,up=0)=>{while(up--&&node)node=node.parent;return node;};

export function applyProposalTypography(f,html){
  const groups=ROLES[f];if(!groups||!html||html.includes('data-proposal-typography="2"'))return html;
  const alreadyTyped=html.includes('data-proposal-typography="1"');
  const roles=Object.fromEntries(Object.entries(groups).flatMap(([role,ids])=>ids.map(i=>[i,role])));
  const nodes=layoutTree(html),slots=Object.fromEntries(nodes.filter(n=>n.id!=null).map(n=>[n.id,n]));
  for(const n of nodes){
    const s=n.style,w=parseFloat(s.get('width')),h=parseFloat(s.get('height'))||parseFloat(s.get('min-height')),radius=s.get('border-radius')||s.get('border-top-left-radius')||'';
    if(!s.get('width')?.endsWith('px')||!(w>0&&h>0)||Math.abs(w-h)>.5||!radius)continue;
    const round=radius.includes('%')?parseFloat(radius)>=50:parseFloat(radius)>=w/2-.5;
    if(round||w<=64&&parseFloat(radius)>0)n.fixedShape={kind:round?'circle':'square',size:w};
  }
  if(!alreadyTyped){
  for(const node of nodes){
    const role=roles[node.id];if(!role||/\bdata-img=/.test(node.tag))continue;
    const type=PROPOSAL_TYPE[role],values=node.style;node.role=role;
    set(node,{'font-size':type.size+'px','line-height':type.leading,'flex-shrink':node.parent?.style.get('flex-direction')==='column'?0:1,'min-width':0,'max-width':'100%','white-space':'pre-line','overflow-wrap':'anywhere',overflow:'visible','text-overflow':null,'-webkit-line-clamp':null,'-webkit-box-orient':null});
    if(values.get('display')==='-webkit-box')values.set('display','block');
    const h=values.get('height');
    if(role!=='cover'){if(h?.endsWith('px'))values.set('min-height',h);values.set('height','auto');}
    else if(h?.endsWith('px')&&parseFloat(h)<type.size*type.leading)values.set('height',Math.ceil(type.size*type.leading)+'px');
  }
  for(const n of nodes){const h=parseFloat(n.style.get('height'));
    if(n.id==null&&n.style.get('display')==='flex'&&n.style.get('position')!=='absolute'&&h<=34&&h>0&&n.children.some(c=>c.id!=null))set(n,{'min-height':h+'px',height:'auto','flex-shrink':0});
  }
  const patch=(id,props,up=0)=>set(ancestor(slots[id],up),props);
  // Keep the cover title and subtitle in separate, generous regions.
  if(f==='L_C01'){patch(3,{height:'124px'});patch(4,{top:'424px'});}
  if(f==='L_PH_OV_H'){patch(4,{top:'154px',width:'540px'});patch(5,{top:'216px'});patch(6,{top:'218px'},1);}
  if(f==='L_PH_CB_A'){patch(18,{top:'344px',height:'308px',gap:'8px'},3);for(const id of [10,13,16])patch(id,{'padding-top':'8px'} ,1);}
  if(/^L_PH_SS_[A-Z]+_A$/.test(f)){
    for(const id of [11,15,19,23,27,31]){const card=ancestor(slots[id],1);if(card){const top=parseFloat(card.style.get('top'));set(card,{top:top-24+'px',height:'94px',gap:'3px'});}}
    if(slots[37]){patch(37,{top:'520px',height:'138px','padding-top':'10px','padding-bottom':'10px'},2);}
  }
  if(f==='L_PH_P_O'){
    for(const n of nodes){
      const top=parseFloat(n.style.get('top'));
      if(/data-img=/.test(n.tag))set(n,{height:'176px'});
      if(n.style.get('position')!=='absolute')continue;
      if(top===372)set(n,{top:'296px'});
      if(top===418)set(n,{top:'342px',height:'52px'});
      if(top===446){set(n,{top:'400px',height:'144px'});for(const row of n.children)set(row,{height:'48px','flex-shrink':0});}
      if(top===548)set(n,{top:'554px',height:'88px'});
    }
  }
  if(f==='L_AIS_02')for(const id of [7,12,17,22,27,32]){const n=ancestor(slots[id],1);set(n,{top:parseFloat(n.style.get('top'))+10+'px'});}
  if(f==='L_AIS_11'){patch(33,{top:'532px'},2);}
  if(f==='L_AIS_15')patch(12,{'margin-top':'0px'},3);
  if(f==='L_SOL_02')patch(0,{top:'40px'});
  if(f==='L_SOL_03')patch(0,{top:'16px'});
  if(f==='L_SOL_08')patch(13,{top:'344px'});
  if(f==='L_PH_CD_C'){patch(8,{top:'208px'},2);patch(9,{top:'524px'},1);}
  if(f==='L_PH_PL_B')for(const id of [65,70,75,80,85])patch(id,{left:'810px',width:'160px'});
  if(/^L_PH_MI_[A-Z]+_C$/.test(f)){
    for(const n of nodes){const s=n.style,top=parseFloat(s.get('top')),w=parseFloat(s.get('width'));
      if(s.get('position')!=='absolute')continue;
      if(top===252&&w===252)set(n,{top:'228px',height:'420px',padding:'10px 16px',gap:'6px'});
      if(top===148&&w===252&&/data-img=/.test(n.tag))set(n,{height:'88px'});
      if(top===190&&w<=170&&/data-img=/.test(n.tag))set(n,{top:'212px',height:'110px'});
      if(top===400&&w<=170)set(n,{top:'344px',height:'148px',gap:'4px'});
      if(top===518&&w<=170)set(n,{top:'500px',height:'146px',padding:'8px 10px',gap:'3px'});
      if(top===630)set(n,{top:'650px'});
      if(top===198&&n.id!=null)set(n,{top:'216px'});
    }
  }
  if(['L_AIS_17','L_AIS_18'].includes(f)){
    patch(4,{top:'340px',height:'316px',overflow:'visible'},1);
    patch(2,{top:'294px'},2);
    for(const n of nodes)if(/data-img="0"/.test(n.tag))set(n,{height:'202px'});
  }
  if(f==='L_PH_CD_C')patch(11,{top:'644px'});
  if(f==='L_PH_IP_B')for(const id of [24,36,48,60])patch(id,{width:'148px'},1);
  if(f==='L_CD_D'){
    patch(29,{top:'536px'},1);patch(30,{flex:'1','min-width':0},1);
    patch(32,{top:'630px',height:'34px',padding:'1px 8px'},1);
    patch(32,{width:'28px',height:'28px','min-height':'28px','flex-shrink':0});
  }
  if(f==='L_SAC_S_GF')patch(63,{left:'816px',top:'644px',width:'400px'});
  if(f==='L_KCP_S_LG')patch(58,{top:'586px'},2);
  if(f==='L_CCH_S_RT'){patch(48,{top:'610px'});patch(49,{top:'650px'});}
  if(f==='L_CCH_I')for(const id of [9,20,42])patch(id,{top:'34px'});
  if(f==='L_PH_MT_A'){
    for(const n of nodes)if(/data-img="5"/.test(n.tag))set(n,{height:'252px'});
    patch(47,{top:'420px',height:'176px'},3);patch(53,{top:'604px',height:'60px'},2);
  }
  if(f==='L_PH_CO_B')for(const n of nodes){const s=n.style,left=parseFloat(s.get('left')),top=parseFloat(s.get('top'));
    if(s.get('position')==='absolute'&&[636,648,664].includes(left)&&top>=210&&top<=394){const row=Math.round((top-210)/36);set(n,{top:190+row*40+(left===664?0:4)+'px'});if(left===664)set(n,{width:'112px',height:'40px'});}
  }
  if(f==='L_PH_CO_B')patch(13,{top:'164px'});
  if(f==='L_PH_CU_B')for(const n of nodes)if(n.id!=null&&n.style.get('width')==='64px'&&n.style.get('border-radius')==='999px')set(n,{width:'96px','min-height':'22px','white-space':'nowrap'});
  if(['L_AIS_14','L_AIS_16','L_AIS_20'].includes(f)){
    const fitness=f==='L_AIS_20';patch(4,{top:fitness?'586px':'604px',height:'auto',overflow:'visible'},1);
    for(const n of nodes)if(/data-img="0"/.test(n.tag))set(n,{height:fitness?'450px':'466px'});
  }
  if(f==='L_HVC_S_HT'){
    patch(22,{top:'149px',width:'242px'});patch(20,{top:'112px'},1);
    const card=ancestor(slots[20],2);for(const n of card?.children||[])if(/data-img=/.test(n.tag))set(n,{height:'108px'});
  }
  // Short field names and status badges remain whole words at the new minimum.
  if(f==='L_PH_IP_A')for(const id of [10,12,17,19,24,26,31,33])patch(id,{width:'44px','min-width':'44px','flex-shrink':0,'white-space':'nowrap'});
  if(f==='L_PH_IP_C')for(const id of [49,58,63])patch(id,{'min-width':'44px','flex-shrink':0,'white-space':'nowrap'});
  if(f==='L_PH_CU_B')patch(4,{'min-width':'34px','flex-shrink':0,'white-space':'nowrap'});
  if(f==='L_PH_SS_AD_E')for(const id of [16,27,38])patch(id,{'min-width':'30px','flex-shrink':0,'white-space':'nowrap'});
  }
  // Typography can grow paragraphs; compact shapes retain both axes and cannot
  // stretch with a card, shrink beside an answer, or inherit a paragraph height.
  for(const n of nodes){
    if(!n.fixedShape)continue;
    const {kind,size}=n.fixedShape,diameter=kind==='square'&&n.id!=null&&size>=16&&size<20?20:size;
    set(n,{width:diameter+'px',height:diameter+'px','min-width':diameter+'px','max-width':diameter+'px','min-height':diameter+'px','max-height':diameter+'px','aspect-ratio':'1 / 1','flex-grow':0,'flex-shrink':0,'flex-basis':'auto'});
    if(n.id!=null)set(n,{'line-height':1,'white-space':'nowrap',display:'flex','align-items':'center','justify-content':'center'});
    n.shape=kind;
  }
  let result='',cursor=0;
  for(const node of nodes){const style='style="'+[...node.style].map(([k,v])=>k+': '+v).join('; ')+'"';const match=/\bstyle="[^"]*"/.exec(node.tag);let tag=match?node.tag.replace(match[0],style):node.style.size?node.tag.slice(0,-1)+' '+style+'>':node.tag;if(node.role)tag=tag.replace(/>$/,' data-type-role="'+node.role+'">');if(node.shape)tag=tag.replace(/>$/,' data-layout-shape="'+node.shape+'">');if(node===nodes[0])tag=tag.replace(/\sdata-proposal-typography="[^"]*"/,'').replace(/>$/,' data-proposal-typography="2">');result+=html.slice(cursor,node.start)+tag;cursor=node.end;}
  return result+html.slice(cursor);
}
