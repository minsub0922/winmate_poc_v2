import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { STYLES } from './geometry.js';
import { spatialMoveGroup } from './edit.js';
import { spatialPartGeometry,spatialPartPosition,spatialDisplayFaceGeometry } from './part-geometry.js';
import {peopleRenderGroups} from './people-placement-geometry.js';

function texture(kind,style) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
  if(kind==='screen'){
    const g=c.createLinearGradient(0,0,256,256);g.addColorStop(0,'#143d6a');g.addColorStop(.6,'#317b98');g.addColorStop(1,'#80bca9');c.fillStyle=g;c.fillRect(0,0,256,256);
    c.fillStyle='#ffffffdd';c.font='bold 18px sans-serif';c.fillText('SAMSUNG',18,38);c.fillStyle='#ffffff33';c.fillRect(18,62,220,112);
    c.fillStyle='#ffffffbb';for(let i=0;i<3;i++)c.fillRect(18,192+i*15,140-i*23,5);
  }else if(kind==='wood'||kind==='floor'){
    c.fillStyle=kind==='wood'?style.wood:style.floor;c.fillRect(0,0,256,256);
    for(let i=0;i<120;i++){const alpha=.015+(Math.sin(i*17.21)*.5+.5)*.055;c.strokeStyle=`rgba(80,50,20,${alpha})`;c.beginPath();c.moveTo(i*2.5,0);c.bezierCurveTo(i*2.5+4,80,i*2.5-3,180,i*2.5+1,256);c.stroke();}
    if(kind==='floor'){c.strokeStyle='#ffffff66';c.lineWidth=2;for(let i=0;i<4;i++){c.beginPath();c.moveTo(i*64,0);c.lineTo(i*64,256);c.stroke();}c.strokeStyle='#8d806733';c.beginPath();c.moveTo(0,127);c.lineTo(256,127);c.stroke();}
  }else if(kind==='grille'||kind==='fabric'){
    c.fillStyle=kind==='fabric'?style.fabric:'#a2ada9';c.fillRect(0,0,256,256);c.fillStyle='#152b3128';for(let x=0;x<256;x+=6)for(let y=0;y<256;y+=6)c.fillRect(x,y,2,2);
  }
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;
  if(kind!=='screen'){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='floor'?4:1,kind==='floor'?4:1);}
  t.anisotropy=4;return t;
}

export function createSpatialRenderer(host,{onSelect,onMove,onDrag,onChange,onError,objectOnly=false,transparentBackground=false,pixelRatio=Math.min(window.devicePixelRatio||1,2)}={}) {
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});}
  catch(error){onError?.(error);throw new Error('이 브라우저에서 WebGL을 사용할 수 없습니다. 2D 평면도로 전환해 주세요.');}
  renderer.setPixelRatio(pixelRatio);renderer.shadowMap.enabled=!objectOnly;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  host.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','3D 공간 조감도 · 오브젝트 드래그로 이동, 빈 공간 드래그로 회전, 휠로 확대');renderer.domElement.setAttribute('role','img');
  const world=new THREE.Scene();world.background=transparentBackground?null:new THREE.Color('#f3f5f3');
  const camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,500);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minPolarAngle=.15;controls.maxPolarAngle=objectOnly?Math.PI/2:Math.PI*.47;controls.minZoom=.4;controls.maxZoom=4;
  let current=null,library=null,model=null,materials={},resources=[],materialResources=[],selected=null,disposed=false,fit=18,width=1,height=1,pendingTextures=[],textureErrors=[],sceneGeneration=0;
  let highlightedIds=[];
  const highlightLayer=new THREE.Group();highlightLayer.userData.selectionHelper=true;world.add(highlightLayer);
  const clearHighlights=()=>{highlightLayer.traverse(node=>{node.geometry?.dispose();node.material?.dispose();});highlightLayer.clear();};
  function setHighlighted(ids=[]){
    highlightedIds=[...new Set(ids)];clearHighlights();
    for(const object of current?.objects||[]){
      if(!highlightedIds.includes(object.id))continue;
      const asset=library.assets.find(a=>a.id===object.assetId);if(!asset)continue;
      const group=new THREE.Group(),box=new THREE.BoxGeometry(...asset.size.map(n=>n+.08)),edges=new THREE.EdgesGeometry(box);
      const fill=new THREE.Mesh(box,new THREE.MeshBasicMaterial({color:'#2563eb',transparent:true,opacity:.16,depthTest:false,depthWrite:false}));
      const line=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:'#2563eb',transparent:true,opacity:1,depthTest:false,depthWrite:false}));
      fill.renderOrder=1000;line.renderOrder=1001;group.add(fill,line);group.position.set(object.x,object.elevation+asset.size[1]/2,object.z);group.rotation.y=-(object.rotation||0)*Math.PI/180;highlightLayer.add(group);
    }
    render();
  }
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const render=()=>{if(!disposed)renderer.render(world,camera);};
  const changed=()=>{render();onChange?.();};controls.addEventListener('change',changed);
  world.add(new THREE.HemisphereLight('#ffffff','#b8baa9',1.2));
  const sun=new THREE.DirectionalLight('#fff5df',3.4);sun.position.set(-14,26,18);sun.castShadow=!objectOnly;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.0003;sun.shadow.normalBias=.025;sun.shadow.radius=3;world.add(sun);
  const fillLight=new THREE.DirectionalLight('#dcecff',.8);fillLight.position.set(20,15,-12);world.add(fillLight);
  const mat=(key,style)=>{
    if(materials[key])return materials[key];
    const colors={wood:style.wood,fabric:style.fabric,cushion:style.cushion,body:'#f5f5f1',black:'#172b34',metal:'#606c72',silver:'#b3bfc5',screen:'#ffffff',screenOff:'#090c10',paper:'#e8e5db',leaf:'#4e7958',grille:'#b2b7b2',linen:'#f9f5eb',stone:'#dfdacd',rug:'#bdbeb1',pot:'#c9bda7',cardboard:'#b19474',glass:'#748c91',light:'#fff8d4',floor:style.floor,wall:style.wall,window:'#91bec7'};
    const opts={color:colors[key]||key,roughness:.65,metalness:['silver','metal'].includes(key)?.5:.04};
    if(['wood','floor','grille','fabric','screen'].includes(key)){opts.map=texture(key,style);materialResources.push(opts.map);if(key!=='screen')opts.color='#ffffff';}
    if(key==='glass'||key==='window'){opts.transparent=true;opts.opacity=key==='window'?.35:.55;opts.roughness=.2;opts.depthWrite=false;}
    if(key==='screen'||key==='light'){opts.emissive=new THREE.Color(key==='screen'?'#3d7590':'#fff1bf');opts.emissiveIntensity=.18;}
    return materials[key]=new THREE.MeshStandardMaterial(opts);
  };
  const geometry=(shape,size,rotate)=>{
    let g;if(shape==='sphere')g=new THREE.SphereGeometry(size[0],10,8);
    else if(shape==='cylinder')g=new THREE.CylinderGeometry(size[0],size[2],size[1],24);
    else {const radius=Math.min(...size)*.12;g=radius>.003?new RoundedBoxGeometry(...size,1,Math.min(.025,radius)):new THREE.BoxGeometry(...size);}
    resources.push(g);return g;
  };
  const meshBox=(parent,x,y,z,w,h,d,material,style)=>{const m=new THREE.Mesh(geometry('box',[w,h,d]),mat(material,style));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  const clearModel=(all=false)=>{clearHighlights();if(model){world.remove(model);model=null;}for(const r of resources)r.dispose();resources=[];if(all||!objectOnly){for(const m of Object.values(materials))m.dispose();materials={};for(const t of materialResources)t.dispose();materialResources=[];}};
  const resize=()=>{width=Math.max(1,host.clientWidth);height=Math.max(1,host.clientHeight);renderer.setSize(width,height,false);const aspect=width/height;camera.left=-fit*aspect/2;camera.right=fit*aspect/2;camera.top=fit/2;camera.bottom=-fit/2;camera.updateProjectionMatrix();render();onChange?.();};
  const observer=new ResizeObserver(resize);observer.observe(host);
  function setScene(scene,lib,{reset=true,selectedId=null}={}) {
    current=scene;library=lib;selected=selectedId;clearModel();pendingTextures=[];textureErrors=[];const generation=++sceneGeneration;model=new THREE.Group();world.add(model);
    const style=STYLES[scene.style],assets=Object.fromEntries(lib.assets.map(a=>[a.id,a]));
    if(!objectOnly)meshBox(model,scene.width/2,-.24,scene.depth/2,scene.width+.7,.42,scene.depth+.7,'body',style);
    // Ground receives soft shadows from the floor slab and objects.
    if(!objectOnly&&!transparentBackground)meshBox(model,scene.width/2,-.5,scene.depth/2,scene.width*3,.06,scene.depth*3,'#edf0ec',style).userData.outsideGround=true;
    for(const r of scene.rooms){
      meshBox(model,r.x+r.width/2,-.015,r.z+r.depth/2,r.width,.07,r.depth,r.outdoor?'#aebf9d':'floor',style);
      if(!r.outdoor){
        const wallHeight=1.15,door=1.2,cx=r.x+r.width/2;
        meshBox(model,cx,wallHeight/2,r.z,r.width,wallHeight,.15,'wall',style);
        meshBox(model,r.x,wallHeight/2,r.z+r.depth/2,.15,wallHeight,r.depth,'wall',style);
        meshBox(model,r.x+r.width,.16,r.z+r.depth/2,.14,.32,r.depth,'wall',style);
        for(const side of [-1,1])meshBox(model,cx+side*(r.width+door)/4,.14,r.z+r.depth,(r.width-door)/2,.28,.15,'wall',style);
        for(const f of [.3,.74]){
          const wx=r.x+r.width*f;meshBox(model,wx,1.05,r.z-.015,r.width*.25,.65,.055,'window',style);
          meshBox(model,wx,.73,r.z-.035,r.width*.25,.035,.1,'metal',style);
        }
        // Door thresholds make the opening and circulation legible in cutaway views.
        meshBox(model,cx,.025,r.z+r.depth,door,.025,.16,'wood',style);
      }
    }
    for(const object of scene.objects){
      const asset=assets[object.assetId];if(!asset)continue;
      const group=new THREE.Group();group.position.set(object.x,object.elevation,object.z);group.rotation.y=-(object.rotation||0)*Math.PI/180;group.userData={objectId:object.id,roomId:object.roomId,...(asset.assetGroup==='people'?{assetId:asset.id,title:asset.name,roles:asset.roles,actors:asset.actors,composition:asset.composition,assetRevision:scene.assetRevision||lib.sourceHash}: {})};
      const recipe=lib.recipes[asset.recipe||asset.kind]||asset.parts||[];
      const screens=[];
      // Unit recipes are scaled only once by the stored catalogue dimensions.
      for(const part of recipe){
        const pos=(lib.geometryVersion||1)>=2?spatialPartPosition(part,asset):part.position.map((n,i)=>n*asset.size[i]);
        // Versioned scenes retain their original geometry semantics.
        const modern=(lib.geometryVersion||1)>=2;
        const shape=modern?spatialPartGeometry(part,asset.size,asset.geometryTransform):geometry(part.shape,part.size.map((n,i)=>Math.max(.001,n*asset.size[i])));
        if(modern)resources.push(shape);
        const material=asset.productId&&part.material==='screen'&&lib.geometryVersion>=6?'screenOff':asset.productId&&part.material==='body'&&asset.appearance?.bodyColor?asset.appearance.bodyColor:part.material;
        const mesh=new THREE.Mesh(shape,mat(material,style));mesh.position.set(...pos);if(!modern&&part.rotate)mesh.rotation.set(...part.rotate);
        mesh.castShadow=object.mount!=='ceiling';mesh.receiveShadow=true;mesh.userData={objectId:object.id};group.add(mesh);
        if(part.material==='screen')screens.push(mesh);
      }
      for(const face of asset.appearance?.displayFaces||[]){
        const task=new THREE.TextureLoader().loadAsync(face.image).then(map=>{
          if(disposed||generation!==sceneGeneration){map.dispose();return;}
          map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
          const geometry=spatialDisplayFaceGeometry(face),material=new THREE.MeshBasicMaterial({map,toneMapped:false,transparent:true,alphaTest:.02,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
          const mesh=new THREE.Mesh(geometry,material);mesh.name='product-photo-'+face.face;mesh.position.fromArray(face.position);if(face.face==='back')mesh.rotation.y=Math.PI;
          mesh.userData={objectId:object.id,displayPhoto:face.face};group.add(mesh);resources.push(map,geometry,material);render();
        }).catch(error=>{if(generation===sceneGeneration)textureErrors.push(error);});pendingTextures.push(task);
      }
      if(asset.appearance?.screenImage&&screens.length){
        const task=new THREE.TextureLoader().loadAsync(asset.appearance.screenImage).then(map=>{
          if(disposed||generation!==sceneGeneration){map.dispose();return;}
          map.colorSpace=THREE.SRGBColorSpace;
          const material=new THREE.MeshBasicMaterial({map,toneMapped:false});
          for(const screen of screens)screen.material=material;
          resources.push(map,material);render();
        }).catch(error=>{if(generation===sceneGeneration)textureErrors.push(error);});pendingTextures.push(task);
      }
      if(asset.appearance?.facade){
        const task=new THREE.TextureLoader().loadAsync(asset.appearance.facade).then(map=>{
          if(disposed||generation!==sceneGeneration){map.dispose();return;}
          map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
          const top=asset.appearance.surface==='top',offset=asset.appearance.facadeOffset,geometry=new THREE.PlaneGeometry(asset.size[0],asset.size[top?2:1]),material=new THREE.MeshBasicMaterial({map,transparent:true,alphaTest:.08,side:THREE.FrontSide,toneMapped:false,...(offset!==undefined?{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}:{})});
          const face=new THREE.Mesh(geometry,material);
          if(top){face.rotation.x=-Math.PI/2;face.position.set(0,offset!==undefined?asset.size[1]+offset:asset.size[1]*1.005,0);}else face.position.set(0,asset.size[1]/2,offset!==undefined?asset.size[2]/2+offset:asset.size[2]*.505);
          face.userData={objectId:object.id};group.add(face);resources.push(map,geometry,material);render();
        }).catch(error=>{if(generation===sceneGeneration)textureErrors.push(error);});pendingTextures.push(task);
      }
      for(const occupant of peopleRenderGroups(object,scene,assets)){
        const person=new THREE.Group();person.userData={objectId:object.id,occupantRole:occupant.actor.role,roleId:occupant.actor.roleId,sourceAssetId:occupant.person.sourceAssetId,actorId:occupant.person.actorId,peopleLayoutVersion:occupant.person.version};
        for(const part of occupant.parts){
          const shape=spatialPartGeometry(part,[1,1,1]),mesh=new THREE.Mesh(shape,mat(part.material,style));
          mesh.position.set(...part.position);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={objectId:object.id};person.add(mesh);resources.push(shape);
        }
        group.add(person);
      }
      if(object.mount==='ceiling'){
        // Lifted ceiling fixtures remain locatable without hiding furniture below.
        for(const m of group.children){m.material=m.material.clone();resources.push(m.material);m.material.transparent=true;m.material.opacity=.65;}
      }
      if(selectedId===object.id){
        const edge=new THREE.EdgesGeometry(new THREE.BoxGeometry(...asset.size)),material=new THREE.LineBasicMaterial({color:'#267fc4'}),line=new THREE.LineSegments(edge,material);
        line.position.y=asset.size[1]/2;line.userData.selectionHelper=true;group.add(line);resources.push(edge,material);
      }
      model.add(group);
    }
    const extent=Math.max(scene.width,scene.depth);sun.position.set(-extent*.4,extent,extent*.65);sun.target.position.set(scene.width/2,0,scene.depth/2);world.add(sun.target);
    Object.assign(sun.shadow.camera,{left:-extent,right:extent,top:extent,bottom:-extent,far:extent*4});sun.shadow.camera.updateProjectionMatrix();
    if(reset){
      const az=(scene.camera?.azimuth??40)*Math.PI/180,el=(scene.camera?.elevation??48)*Math.PI/180;
      controls.target.set(scene.width/2,.2,scene.depth/2);camera.position.set(scene.width/2+extent*Math.sin(az)*Math.cos(el),extent*Math.sin(el),scene.depth/2+extent*Math.cos(az)*Math.cos(el));
      fit=Math.max(scene.depth*.8+scene.width*.6,scene.depth*.95)*1.15;camera.zoom=scene.camera?.zoom||1;controls.update();
      camera.updateMatrixWorld();
      const projected=[];for(const x of [0,scene.width])for(const z of [0,scene.depth])for(const y of [0,3.1])projected.push(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
      const xs=projected.map(v=>v.x),ys=projected.map(v=>v.y),aspect=Math.max(1,host.clientWidth)/Math.max(1,host.clientHeight);
      fit=Math.max(Math.max(...ys)-Math.min(...ys),(Math.max(...xs)-Math.min(...xs))/aspect)*1.12;
      if (scene.camera?.position?.length===3 && scene.camera?.target?.length===3) {
        camera.position.fromArray(scene.camera.position);controls.target.fromArray(scene.camera.target);fit=scene.camera.fit||fit;controls.update();
      }
      if(objectOnly){
        const bounds=new THREE.Box3().setFromObject(model),center=bounds.getCenter(new THREE.Vector3());
        const extent=bounds.getSize(new THREE.Vector3()).length();controls.target.copy(center);
        camera.position.copy(center).add(new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(extent*3));controls.update();camera.updateMatrixWorld();
        const corners=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
        const xs=corners.map(v=>v.x),ys=corners.map(v=>v.y),aspect=host.clientWidth/host.clientHeight;
        fit=Math.max(Math.max(...ys)-Math.min(...ys),(Math.max(...xs)-Math.min(...xs))/aspect)*1.2;camera.zoom=1;
      }
    }
    setHighlighted(highlightedIds);resize();
  }
  const project=v=>{const p=v.clone().project(camera);return {x:(p.x+1)/2*width,y:(1-p.y)/2*height,visible:p.z>=-1&&p.z<=1};};
  function anchors(){
    if(!current)return null;camera.updateMatrixWorld();const assets=Object.fromEntries(library.assets.map(a=>[a.id,a]));
    return {width,height,rooms:Object.fromEntries(current.rooms.map(r=>[r.id,project(new THREE.Vector3(r.x+r.width/2,.08,r.z+r.depth/2))])),
      objects:Object.fromEntries(current.objects.map(o=>[o.id,project(new THREE.Vector3(o.x,o.elevation+assets[o.assetId].size[1]/2,o.z))]))};
  }
  let start,drag=null,editable=true;
  const ray=e=>{const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);};
  const down=e=>{
    if(e.button!==0)return;
    // Capture before OrbitControls sees an object gesture, so the camera stays still.
    start={x:e.clientX,y:e.clientY};ray(e);
    const hit=raycaster.intersectObjects(model?.children||[],true).find(h=>h.object.userData.objectId);
    if(!editable||!hit||!onMove)return;
    e.stopImmediatePropagation();controls.enabled=false;renderer.domElement.setPointerCapture(e.pointerId);
    const object=current.objects.find(o=>o.id===hit.object.userData.objectId),plane=new THREE.Plane(new THREE.Vector3(0,1,0),-hit.point.y),point=raycaster.ray.intersectPlane(plane,new THREE.Vector3());
    const ids=spatialMoveGroup(current,object.id);
    drag={object,plane,point,dx:0,dz:0,pointerId:e.pointerId,groups:model.children.filter(g=>ids.has(g.userData.objectId)).map(g=>({group:g,position:g.position.clone()}))};
  };
  const move=e=>{
    if(!drag||e.pointerId!==drag.pointerId)return;e.stopImmediatePropagation();
    if(Math.hypot(e.clientX-start.x,e.clientY-start.y)<=5)return;
    drag.moved=true;
    ray(e);const p=raycaster.ray.intersectPlane(drag.plane,new THREE.Vector3());if(!p||!drag.point)return;
    drag.dx=Math.round((p.x-drag.point.x)*20)/20;drag.dz=Math.round((p.z-drag.point.z)*20)/20;
    for(const {group,position} of drag.groups)group.position.set(position.x+drag.dx,position.y,position.z+drag.dz);
    onDrag?.(true);renderer.domElement.style.cursor='grabbing';render();
  };
  const finish=(e,cancel=false)=>{
    if(drag){
      if(e.pointerId!==drag.pointerId)return;
      e.stopImmediatePropagation();const d=drag;drag=null;
      for(const {group,position} of d.groups)group.position.copy(position);
      if(renderer.domElement.hasPointerCapture(e.pointerId))renderer.domElement.releasePointerCapture(e.pointerId);
      controls.enabled=true;renderer.domElement.style.cursor='';onDrag?.(false);render();
      if(!cancel){if(d.dx||d.dz)onMove?.(d.object.id,{x:Math.round((d.object.x+d.dx)*20)/20,z:Math.round((d.object.z+d.dz)*20)/20});onSelect?.(d.moved?null:d.object.id);}else if(d.moved)onSelect?.(null);
    }else if(!cancel&&editable&&start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<=5){
      ray(e);const hit=raycaster.intersectObjects(model?.children||[],true).find(h=>h.object.userData.objectId);onSelect?.(hit?.object.userData.objectId||null);
    }
    start=null;
  };
  const up=e=>finish(e),cancel=e=>finish(e,true);
  renderer.domElement.addEventListener('pointerdown',down,true);renderer.domElement.addEventListener('pointermove',move,true);renderer.domElement.addEventListener('pointerup',up,true);renderer.domElement.addEventListener('pointercancel',cancel,true);renderer.domElement.addEventListener('lostpointercapture',cancel,true);
  renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();onError?.(new Error('3D 그래픽 연결이 끊어졌습니다. 2D로 전환하거나 다시 열어 주세요.'));});
  const ready=async()=>{let generation;do{generation=sceneGeneration;await Promise.all(pendingTextures);}while(generation!==sceneGeneration);if(textureErrors.length)throw new AggregateError(textureErrors,'제품 이미지를 불러오지 못했습니다.');};
  const setCameraAngles=({azimuth,elevation,zoom=camera.zoom})=>{
    if(!current||![azimuth,elevation,zoom].every(Number.isFinite))return;
    const az=azimuth*Math.PI/180,el=Math.max(10,Math.min(80,elevation))*Math.PI/180,radius=Math.max(1,camera.position.distanceTo(controls.target));
    camera.position.copy(controls.target).add(new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(radius));
    camera.zoom=Math.max(.4,Math.min(3,zoom));controls.update();camera.updateMatrixWorld();
    const points=[];for(const x of [0,current.width])for(const z of [0,current.depth])for(const y of [0,current.height||3.1])points.push(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse));
    const xs=points.map(p=>p.x),ys=points.map(p=>p.y);fit=Math.max(Math.max(...ys)-Math.min(...ys),(Math.max(...xs)-Math.min(...xs))/(width/height))*1.12;resize();
  };
  const setCameraState=state=>{if(!state?.position||!state?.target)return;camera.position.fromArray(state.position);controls.target.fromArray(state.target);camera.zoom=state.zoom||1;fit=state.fit||fit;controls.update();resize();};
  return {setScene,setHighlighted,setCameraAngles,setCameraState,render,anchors,ready,setEditable:value=>{editable=value;},
    cameraState:()=>({position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom,fit}),
    async exportGlb(){await ready();const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');return new GLTFExporter().parseAsync(model,{binary:true});},
    snapshot({w=1600,h=1025,type='image/png',quality,transparentBackground:clearBackground=false,encode=true,onRender,pixelRatio=renderer.getPixelRatio()}={}){
      const helpers=[highlightLayer];highlightLayer.visible=false;model.traverse(o=>{if(o.userData.selectionHelper){helpers.push(o);o.visible=false;}});
      const background=world.background;if(clearBackground){world.background=null;model.traverse(o=>{if(o.userData.outsideGround){helpers.push(o);o.visible=false;}});}
      const old={width,height,pixelRatio:renderer.getPixelRatio()};width=w;height=h;renderer.setPixelRatio(pixelRatio);renderer.setSize(w,h,false);const aspect=w/h;camera.left=-fit*aspect/2;camera.right=fit*aspect/2;camera.updateProjectionMatrix();render();
      try{
        onRender?.(renderer.domElement);
        return {image:encode?renderer.domElement.toDataURL(type,quality):null,anchors:anchors(),camera:{position:camera.position.toArray(),target:controls.target.toArray(),zoom:camera.zoom,fit}};
      }finally{world.background=background;for(const helper of helpers)helper.visible=true;width=old.width;height=old.height;renderer.setPixelRatio(old.pixelRatio);resize();}
    },
    dispose(){disposed=true;observer.disconnect();controls.removeEventListener('change',changed);controls.dispose();clearModel(true);renderer.dispose();renderer.domElement.remove();},
  };
}
