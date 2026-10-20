import assert from 'node:assert/strict';
import {createSpatialLayout,createLayoutNode,createDescriptionNodes,createRoomLabel,roomLabelMetrics,reprojectSpatialLayout,layoutCameraAngles,moveLayoutNode,layoutConnector,validSpatialLayout,layoutTextLines} from '../web/src/domain/spatial/layout.js';

const scene={version:1,title:'공간 제안',rooms:[{id:'r1',name:'라운지'}],objects:[{id:'o1',assetId:'a1',roomId:'r1'}]},library={assets:[{id:'a1',name:'사이니지',productId:'QM55C'}]};
const layout=createSpatialLayout(scene,library,{image:'data:image/png;base64,AA==',anchors:{width:1600,height:1000,rooms:{r1:{x:800,y:500}},objects:{o1:{x:600,y:400}}}},'3d');
assert(validSpatialLayout(layout));assert.equal(layout.renderVersion,2);
assert.equal(layout.targets[0].x,640);assert.equal(layout.targets[0].y,405);
assert.equal(layout.targets[1].kind,'product');
let node=createLayoutNode(layout,'callout');node={...node,targets:['room:r1','o1'],text:'여러 공간과 제품을 함께 연결'};
layout.nodes=[node];assert(validSpatialLayout(layout));
for(const target of layout.targets){const points=layoutConnector(node,target);assert.deepEqual(points.at(-1),{x:target.x,y:target.y});for(let i=1;i<points.length;i++)assert(points[i].x===points[i-1].x||points[i].y===points[i-1].y);}
assert.equal(moveLayoutNode(node,{x:9999,y:-50}).x,1280-node.w);assert.equal(moveLayoutNode(node,{x:9999,y:-50}).y,0);
assert.equal(moveLayoutNode(node,{w:9999,h:9999,x:9999,y:9999}).x,480);assert.equal(moveLayoutNode(node,{w:9999,h:9999,x:9999,y:9999}).y,220);
assert(layoutTextLines({...node,w:120,text:'긴 설명을 여러 줄에 나누어 표시합니다'}).length>1);
assert(!validSpatialLayout({...layout,nodes:[{...node,targets:['unknown']}]}));
assert(!validSpatialLayout({...layout,nodes:[{...node,x:Infinity}]}));
assert(!validSpatialLayout({...layout,image:'https://example.com/image.png'}));
assert(!validSpatialLayout({...layout,nodes:[node,node]}));
console.log('PASS spatial layout projection, mixed targets, orthogonal connectors, bounds, text wrap and validation');

const roomLabel=createRoomLabel(layout,layout.targets[0]);assert.equal(roomLabel.type,'room-label');assert.equal(roomLabel.text,'라운지');assert.deepEqual(roomLabel.targets,['room:r1']);
const labeled={...layout,nodes:[node,roomLabel]},rotated=reprojectSpatialLayout(labeled,scene,library,{image:'data:image/png;base64,BB==',anchors:{width:1600,height:1000,rooms:{r1:{x:900,y:550}},objects:{o1:{x:700,y:450}}}},'3d');
assert(validSpatialLayout(rotated));assert.equal(rotated.nodes[0].x,node.x);assert.equal(rotated.nodes[1].x-roomLabel.x,55);assert.equal(rotated.nodes[1].y-roomLabel.y,27.5);assert.equal(rotated.sourceScene.presentation,undefined);assert.deepEqual(rotated.nodes[0].targets,node.targets);
assert.equal(Math.round(layoutCameraAngles({position:[1,1,0],target:[0,0,0],zoom:1.5}).azimuth),90);assert.equal(Math.round(layoutCameraAngles({position:[1,1,0],target:[0,0,0],zoom:1.5}).elevation),45);console.log('PASS room-name objects, camera reprojection, stable callouts and source snapshot preservation');

const initialCamera={position:[7,8,9],target:[1,2,3],zoom:1.25,fit:19};
const captured=createSpatialLayout(scene,library,{image:layout.image,anchors:{width:1600,height:1000,rooms:{r1:{x:800,y:500}},objects:{o1:{x:600,y:400}}},camera:initialCamera},'3d');
assert.deepEqual(captured.initialCamera,initialCamera);assert.notEqual(captured.initialCamera,initialCamera);assert.notEqual(captured.initialCamera.position,initialCamera.position);
const afterRotation=reprojectSpatialLayout({...captured,nodes:[node,roomLabel]},scene,library,{image:rotated.image,anchors:{width:1600,height:1000,rooms:{r1:{x:900,y:550}},objects:{o1:{x:700,y:450}}},camera:{...initialCamera,zoom:1.8}},'3d');
assert.deepEqual(afterRotation.initialCamera,initialCamera);assert.equal(afterRotation.camera.zoom,1.8);assert.deepEqual(JSON.parse(JSON.stringify(afterRotation)).initialCamera,initialCamera);
const resetProjection=reprojectSpatialLayout(afterRotation,scene,library,{image:captured.image,anchors:{width:1600,height:1000,rooms:{r1:{x:800,y:500}},objects:{o1:{x:600,y:400}}},camera:initialCamera},'3d');
assert.deepEqual(resetProjection.camera,initialCamera);assert.deepEqual(resetProjection.nodes,[node,roomLabel]);assert.deepEqual(resetProjection.targets,captured.targets);
console.log('PASS original extraction camera survives reprojection/serialization; reset restores exact targets and room-name positions');

const metrics=roomLabelMetrics('라운지');assert.equal(roomLabel.w,metrics.w);assert.equal(roomLabel.h,metrics.h);assert.equal(roomLabel.fontSize,metrics.fontSize);assert.deepEqual(moveLayoutNode(roomLabel,{}),roomLabel);const legacy={...roomLabel,w:160,h:48,fontSize:18};assert.deepEqual(moveLayoutNode(legacy,{}),legacy);assert(validSpatialLayout({...layout,nodes:[roomLabel]}));assert(!validSpatialLayout({...layout,nodes:[{...roomLabel,h:29}]}));console.log('PASS original room-label metrics stay unchanged on selection, movement and legacy restore');

const generated=createDescriptionNodes({...layout,nodes:[]},layout.targets[0],'공간 제품 목록\n'+Array.from({length:40},(_,i)=>'• 삼성 제품 '+i+' · 2대').join('\n'));
assert(generated.length>=2);assert(validSpatialLayout({...layout,nodes:generated}));
assert.equal(generated.map(n=>n.text).join('\n').includes('삼성 제품 39'),true);
for(const node of generated){assert(layoutTextLines(node).length*node.fontSize*1.5+24<=node.h);assert.deepEqual(node.targets,[layout.targets[0].id]);assert(node.x>=0&&node.y>=130&&node.x+node.w<=1280&&node.y+node.h<=720);}
assert.throws(()=>createDescriptionNodes({...layout,nodes:Array(100).fill(node)},layout.targets[0],'공간 설명'));
console.log('PASS AI placement preserves every product across fitted, bounded, automatically connected boxes');
