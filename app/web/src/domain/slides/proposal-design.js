// App-aligned presentation styling. Geometry, editable slot identities and text
// remain independent of the visual treatment. This function also runs in the
// standards compiler, so library previews and the Agent KB get the same HTML.
const AUTHORED_LAYOUTS = new Set(['L_PH_C13','L_PH_CH_A','L_PH_CH_B','L_PH_OV_H','L_PH_P3_A','L_PH_PL_A','L_PH_P_I','L_PH_SA_B','L_PH_SF_B','L_PH_VP_B2','L_PH_VP_B4','L_PH_VP_C','L_PH_VX_COVER_A','L_PH_VX_COVER_B','L_PH_VX_PROOF']);
export function migrateProposalDesign(proposal) {
  if (!/^bs_v_/.test(proposal?.scenario || '')) return false;
  let changed=false;
  for(const part of proposal.parts||[])for(const layout of part.layouts||[]){
    if(!AUTHORED_LAYOUTS.has(layout.f)||layout.ov?.design)continue;
    layout.ov={...(layout.ov||{}),design:'winmate-2'};changed=true;
  }
  return changed;
}
export function applyProposalDesign(root, options = {}) {
  if (root?.hasAttribute('data-reference-standard') || root?.hasAttribute('data-reference-layout')) return;
  if (!root || root.dataset.proposalDesign === 'winmate-2') return;
  const standard = root.hasAttribute('data-description-standard');
  if (!standard && !root.hasAttribute('data-proposal-authored') && options !== 'winmate-2' && options.design !== 'winmate-2') return;
  const ink = '#121417', muted = '#596170', blue = '#1428a0', soft = '#eaeefb', line = '#e2e5ea';
  const originalBackground = root.style.backgroundColor;
  const num = v => parseFloat(v) || 0;
  const rect = el => ({ x:num(el.style.left), y:num(el.style.top), w:num(el.style.width), h:num(el.style.height) });
  const place = (el,x,y,w,h) => Object.assign(el.style,{position:'absolute',left:x+'px',top:y+'px',width:w+'px',height:h+'px',boxSizing:'border-box'});
  const rgb = color => {
    if (/^#[a-f\d]{6}$/i.test(color)) return [1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
    if (/^#[a-f\d]{3}$/i.test(color)) return [...color.slice(1)].map(c=>parseInt(c+c,16));
    return (String(color).match(/[\d.]+/g)||[]).slice(0,3).map(Number);
  };
  const light = color => {const c=rgb(color);return c.length===3&&c[0]*.2126+c[1]*.7152+c[2]*.0722>180;};
  const clear = el => {el.style.backgroundImage='none';el.style.boxShadow='none';el.style.textShadow='none';};
  const texts = [...root.querySelectorAll('[data-tb]')];
  const images = [...root.querySelectorAll('[data-img]')];
  const role = root.dataset.designRole || '';
  const snapshots = new Map([...root.querySelectorAll('*')].map(el=>[el,{...rect(el),color:el.style.color,fs:num(el.style.fontSize)}]));
  const textStyle = (el,size,weight,color=ink) => {
    Object.assign(el.style,{fontFamily:'Noto Sans KR, sans-serif',fontSize:size+'px',fontWeight:String(weight),color,lineHeight:'1.35',letterSpacing:'-.015em',textShadow:'none',wordBreak:'keep-all',overflowWrap:'anywhere'});
    if(/^[A-Za-z][A-Za-z0-9 .&/+_-]{0,27}$/.test(el.textContent.trim()))el.style.whiteSpace='nowrap';
    if(standard)el.dataset.descFit=String(size);
  };
  const extra = (css) => {const el=document.createElement('div');el.setAttribute('data-proposal-decoration','');el.setAttribute('aria-hidden','true');el.style.cssText=css;root.appendChild(el);return el;};
  clear(root);Object.assign(root.style,{backgroundColor:'#ffffff',color:ink,fontFamily:'Noto Sans KR, sans-serif'});
  root.dataset.proposalDesign='winmate-2';
  root.querySelectorAll('[data-desc-photo-note]').forEach(el=>el.remove());

  if (!standard) {
    // These twelve existing photo compositions are reused only by the authored
    // scenarios. Theme their copies; the general library originals are intact.
    const dark = /VX_COVER_A/.test(root.dataset.designTemplate||'') || (originalBackground && !light(originalBackground));
    for(const el of root.querySelectorAll('div,span')) {
      if(el.closest('[data-img]'))continue;
      if(/gradient\(/.test(el.style.backgroundImage||el.style.background))el.style.background=soft;
      clear(el);
      const bg=el.style.backgroundColor;
      if(bg&&!/transparent|rgba\(0, 0, 0, 0\)/.test(bg)){
        const c=rgb(bg);if(c.length===3){const colorful=Math.max(...c)-Math.min(...c)>45;el.style.backgroundColor=colorful?(light(bg)?soft:blue):(light(bg)?'#f7f8fa':bg);}
      }
      if(el.style.borderRadius&&num(el.style.borderRadius)<100)el.style.borderRadius='12px';
    }
    for(const el of texts){
      const fs=num(el.style.fontSize)||18;const col=el.style.color;
      if(!light(col)&&col)el.style.color=rgb(col).length===3&&Math.max(...rgb(col))-Math.min(...rgb(col))>45?blue:(fs<=14?muted:ink);
      el.style.letterSpacing=fs>=28?'-.035em':fs<=14&&/^[A-Z\s/·&]+$/.test(el.textContent)?'.08em':'-.01em';
      el.style.lineHeight=fs>=28?'1.22':'1.35';el.style.textShadow='none';
    }
    for(const el of images)if(el.tagName!=='IMG'){el.style.borderRadius=num(el.style.width)>=1000?'0px':'14px';el.style.overflow='hidden';}
    if(/VX_PROOF/.test(root.dataset.designTemplate||'')){
      const at=i=>root.querySelector(`[data-tb="${i}"]`);
      if(at(6)){place(at(6),766,342,450,112);at(6).style.fontSize='18px';}
      if(at(7))place(at(7),766,474,450,26);
      if(at(8)){place(at(8),766,510,450,116);at(8).style.fontSize='19px';}
    }
    if(dark){root.style.backgroundColor='#101727';root.style.color='#ffffff';}
    return;
  }

  // Source descriptions contain decorative boxes as well as real diagrams.
  // Replace the palette without flattening connectors, tables or native text.
  for(const el of root.querySelectorAll('[data-desc-native-shape]')){
    clear(el);const b=snapshots.get(el);const bg=el.style.backgroundColor;
    if(b.w>1200&&b.h>650){el.style.display='none';continue;}
    if(el.dataset.descNativeShape==='rect'&&((b.w<350&&b.h<16)||(b.w<6&&b.h<200))){el.style.display='none';continue;}
    if(bg&&!/transparent/.test(bg))el.style.backgroundColor=light(bg)?'#f7f8fa':soft;
    if(el.style.borderColor)el.style.borderColor=line;
    if(el.dataset.descNativeShape==='roundRect')el.style.borderRadius='12px';
  }
  for(const svg of root.querySelectorAll('svg')){
    const b=snapshots.get(svg);if(b.w>1200&&b.h>650){svg.style.display='none';continue;}
    svg.querySelectorAll('path,stop').forEach(el=>{
      if(el.hasAttribute('stop-color'))el.setAttribute('stop-color',soft);
      const fill=el.getAttribute('fill');if(fill&&fill!=='none'&&fill!=='transparent')el.setAttribute('fill',light(fill)?'#f7f8fa':soft);
      const stroke=el.getAttribute('stroke');if(stroke&&stroke!=='none')el.setAttribute('stroke',blue);
    });
  }
  const setImage = (el) => {
    const b=snapshots.get(el);if(!b)return;
    const im=el.tagName==='IMG'?el:el.querySelector('img');
    if(el.tagName!=='IMG'){el.style.borderRadius=b.w<40?'50%':b.w>1100&&b.h>650?'0':'12px';el.style.overflow='hidden';}
    if(im?.style.objectFit==='contain')el.style.backgroundColor=/워드마크|wordmark/i.test(el.dataset.hint||'')?'transparent':'#ffffff';
  };
  images.forEach(setImage);
  const actualImages=images.filter(el=>!/(?:white|title|subtitle) ·|워드마크/.test(el.dataset.hint||''));
  const sourceText=el=>el.textContent.trim();

  if(role==='표지'){
    // Preserve the source's photo/text split, but give the message a calm panel
    // and one dominant photograph instead of copying bitmap ornaments.
    const hero=actualImages.sort((a,b)=>snapshots.get(b).w*snapshots.get(b).h-snapshots.get(a).w*snapshots.get(a).h)[0];
    for(const el of root.querySelectorAll('[data-desc-native-shape],svg'))el.style.display='none';
    if(hero){place(hero,560,32,688,656);hero.style.borderRadius='18px';hero.style.zIndex='0';}
    const main=texts.slice().sort((a,b)=>snapshots.get(b).fs-snapshots.get(a).fs)[0];
    const rest=texts.filter(el=>el!==main);
    if(main){place(main,64,252,438,196);textStyle(main,52,700);}
    rest.forEach((el,k)=>{place(el,64,k===0?190:488+(k-1)*39,430,k===0?42:36);textStyle(el,k===0?15:17,k===0?600:400,k===0?blue:muted);});
    const seen=new Set(hero?[hero.querySelector('img')?.getAttribute('data-fill')||hero.querySelector('img')?.getAttribute('src')]:[]);let support=0;
    for(const el of images)if(el!==hero){
      const im=el.querySelector('img'),src=im?.getAttribute('data-fill')||im?.getAttribute('src');
      if(seen.has(src)){el.style.display='none';continue;}seen.add(src);
      place(el,64+support*120,570,104,76);support++;el.style.borderRadius='10px';
    }
    extra('position:absolute;left:64px;top:151px;width:40px;height:4px;background:'+blue+';border-radius:2px');
    return;
  }
  if(role==='브랜드 엔딩'){
    root.style.backgroundColor='#101727';for(const el of root.querySelectorAll('[data-desc-native-shape],svg'))el.style.display='none';
    for(const el of texts)textStyle(el,24,500,'#ffffff');
    return;
  }
  if(role==='챕터 전환'){
    const numbers=texts.filter(el=>/^\d{1,2}$/.test(sourceText(el)));
    for(const el of texts){const b=snapshots.get(el);textStyle(el,numbers.includes(el)?100:40,numbers.includes(el)?600:700,numbers.includes(el)?blue:ink);if(b.h<40)textStyle(el,13,500,muted);}
    extra('position:absolute;left:64px;top:54px;width:36px;height:4px;background:'+blue+';border-radius:2px');
    return;
  }
  if(role==='목차·현재 장 안내'){
    for(const el of texts){const b=snapshots.get(el),isNumber=/^\d{1,2}$/.test(sourceText(el));textStyle(el,isNumber?24:b.fs>60?48:b.fs>30?28:Math.max(16,Math.min(24,b.fs)),isNumber?500:600,isNumber?blue:ink);}
    for(const el of root.querySelectorAll('[data-desc-native-shape],svg')){const b=snapshots.get(el);if(b.w>1100||b.h<8)el.style.display='none';}
    extra('position:absolute;left:64px;top:54px;width:36px;height:4px;background:'+blue+';border-radius:2px');
    return;
  }
  if(role==='체험 스튜디오 초대'){
    // Invitation graphics share the same palette; avoid duplicate reconstructed
    // card layers and retain the actual image/text slots for later editing.
    const seen=new Set();for(const el of images){const im=el.querySelector('img');const src=im?.getAttribute('src');if(src?.includes('/white.png')||seen.has(src)){el.style.display='none';continue;}seen.add(src);}
    for(const el of texts){const b=snapshots.get(el);textStyle(el,Math.min(36,Math.max(16,b.fs)),600);}
    return;
  }

  // Body slides keep their columns, diagrams, image groups and table cells.
  // Bring those regions into one consistent safe area beneath the heading.
  const isCell=el=>el.hasAttribute('data-desc-row');
  const notes=new Set(texts.filter(el=>{const b=snapshots.get(el),s=sourceText(el);return !isCell(el)&&b.fs<=24&&((s.length>18&&/^(?:\*|※|□)/.test(s))||(s.length>160&&/^\[/.test(s)));}));
  for(const el of notes){el.dataset.proposalNote='';el.style.visibility='hidden';}
  const headerCandidates=texts.filter(el=>{const b=snapshots.get(el);return !isCell(el)&&b.y<122&&b.w>340&&b.fs>=22&&sourceText(el).length>4;});
  const title=headerCandidates.slice().sort((a,b)=>snapshots.get(b).fs-snapshots.get(a).fs)[0];
  const header=new Set(texts.filter(el=>{const b=snapshots.get(el);return !isCell(el)&&b.y<122&&b.h<140;}));
  if(title)header.add(title);
  const topObjects=[...root.children].filter(el=>snapshots.has(el)&&el.style.display!=='none'&&!header.has(el));
  const footer=new Set(texts.filter(el=>!isCell(el)&&snapshots.get(el).y>=666&&sourceText(el).length<30));
  const body=topObjects.filter(el=>!footer.has(el)&&!notes.has(el)&&!el.hasAttribute('data-proposal-decoration'));
  const bodyBoxes=body.map(el=>snapshots.get(el)).filter(b=>b.h>0&&b.y>=108&&b.y<666);
  const minY=bodyBoxes.length?Math.min(...bodyBoxes.map(b=>b.y)):130;
  const maxY=bodyBoxes.length?Math.min(720,Math.max(...bodyBoxes.map(b=>b.y+b.h))):650;
  const scaleY=Math.min(1,(646-150)/Math.max(1,maxY-minY));
  const transform=el=>{
    const b=snapshots.get(el);if(!b)return;
    if(b.y<108&&b.h<140){if(!el.hasAttribute('data-tb'))el.style.display='none';return;}
    place(el,64+b.x*.9,b.y<108?150:150+(b.y-minY)*scaleY,b.w*.9,b.y<108?Math.min(496,b.h*scaleY):b.h*scaleY);
    if(el.hasAttribute('data-desc-table'))for(const cell of el.querySelectorAll('[data-tb]')){const c=snapshots.get(cell);place(cell,c.x*.9,c.y*scaleY,c.w*.9,c.h*scaleY);}
  };
  body.forEach(transform);
  const imageBoxes=images.filter(el=>el.style.display!=='none').map(el=>({...rect(el),el}));
  for(const el of texts){
    const b=snapshots.get(el);if(el.dataset.descOccluded||notes.has(el))continue;
    if(header.has(el)||footer.has(el))continue;
    let size=Math.max(12,Math.min(27,b.fs));if(b.h<20||b.w<70)size=Math.max(9,Math.min(16,b.fs));
    if(el.hasAttribute('data-desc-row'))size=Math.max(14,Math.min(18,b.fs));
    const r=rect(el),over=!isCell(el)&&imageBoxes.find(p=>r.x+r.w/2>p.x&&r.x+r.w/2<p.x+p.w&&r.y+r.h/2>p.y&&r.y+r.h/2<p.y+p.h);
    const onPhoto=over&&over.el.querySelector('img')?.style.objectFit!=='contain';
    textStyle(el,size,b.fs>=24||el.style.fontWeight==='700'?600:400,onPhoto&&light(b.color)?'#ffffff':ink);
    if(!isCell(el)&&size<=16){el.style.lineHeight='1.25';el.style.height=Math.max(18,num(el.style.height))+'px';}
    if(onPhoto&&r.w>60&&r.h>15){el.style.background=light(b.color)?'rgba(16,23,39,.78)':'rgba(255,255,255,.94)';el.style.borderRadius='6px';el.style.padding='3px 6px';}
    if(el.hasAttribute('data-desc-row')){el.style.border='1px solid '+line;el.style.backgroundColor=Number(el.dataset.descCol)===0?soft:Number(el.dataset.descRow)%2?'#f7f8fa':'#fff';el.style.padding='7px 10px';}
  }
  const secondary=[...header].filter(el=>el!==title).sort((a,b)=>snapshots.get(a).y-snapshots.get(b).y);
  if(title){place(title,64,55,1152,66);textStyle(title,32,700);}
  secondary.forEach((el,k)=>{
    const b=snapshots.get(el),small=b.y<45&&b.fs<27||b.w<250;
    if(small){place(el,k===0?64:946,25,k===0?820:270,22);textStyle(el,11,500,k===0?blue:muted);el.style.textAlign=k===0?'left':'right';}
    else {place(el,64,112,1152,32);textStyle(el,15,400,muted);}
  });
  for(const el of footer){place(el,1080,682,136,20);textStyle(el,10,400,muted);el.style.textAlign='right';}
  const hub=texts.find(el=>/^삼성\s*AI 비즈니스$/.test(sourceText(el))&&snapshots.get(el).y>200);
  const hubLabels=['Device','Solution','Service'].map(s=>texts.find(el=>sourceText(el)===s));
  if(hub&&hubLabels.every(Boolean)){
    for(const el of root.querySelectorAll('[data-desc-native-shape],svg')){const b=rect(el);if(b.x>410&&b.x<850&&b.y>220&&b.y<570)el.style.display='none';}
    const circle=extra('position:absolute;left:510px;top:300px;width:260px;height:230px;background:'+soft+';border:1px solid #c5cdf2;border-radius:50%');circle.dataset.descNativeShape='ellipse';root.insertBefore(circle,hub);
    place(hub,540,369,200,90);textStyle(hub,28,700,blue);hub.style.textAlign='center';
    hubLabels.forEach((el,k)=>{place(el,...[[414,261,130,38],[746,261,130,38],[570,540,140,38]][k]);textStyle(el,19,600,blue);el.style.textAlign='center';});
  }
  extra('position:absolute;left:64px;top:670px;width:1152px;height:1px;background:'+line);
  const footerLabel=document.createElement('div');footerLabel.dataset.proposalDecoration='';footerLabel.textContent='WINMATE  /  '+(root.dataset.sourceLabel||'Business proposal');footerLabel.style.cssText='position:absolute;left:64px;top:682px;width:970px;height:19px;font-size:10px;line-height:1.4;color:'+muted+';letter-spacing:.02em';root.appendChild(footerLabel);
  if(notes.size){const note=document.createElement('div');note.dataset.proposalDecoration='';note.textContent='상세 사양·지원 조건은 발표자 노트에서 확인할 수 있습니다.';note.style.cssText='position:absolute;left:64px;top:650px;width:1152px;height:18px;font-size:10px;line-height:1.4;color:'+muted;root.appendChild(note);}
}
