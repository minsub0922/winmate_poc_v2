#!/usr/bin/env node
// Render requested admin examples from the same geometry, lights and camera as the editor.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
const sharp=createRequire(new URL('../web/package.json',import.meta.url))('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const library=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json'))),examples=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/examples.json')));
const output=path.join(root,'app/web/public/assets/spatial-examples');fs.mkdirSync(output,{recursive:true});
const port=Number(process.env.SPATIAL_EXAMPLE_PREVIEW_PORT||5194);
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true,hmr:false}});
let browser;
try{
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});const page=await browser.newPage({viewport:{width:1600,height:1025}});
  // This empty document only loads the open source renderer; no app/account/model calls.
  await page.goto('http://127.0.0.1:'+port+'/favicon.ico');
  for(const example of examples){
    const image=await page.evaluate(async({scene,library})=>{
      const {createSpatialRenderer}=await import('/src/domain/spatial/render-three.js');const host=document.createElement('div');host.style.cssText='width:1600px;height:1025px';document.body.appendChild(host);
      const renderer=createSpatialRenderer(host);try{renderer.setScene(scene,library);await renderer.ready();return renderer.snapshot().image;}finally{renderer.dispose();host.remove();}
    },{scene:example.scene,library});
    await sharp(Buffer.from(image.split(',')[1],'base64')).resize(960,615).webp({quality:90}).toFile(path.join(output,example.id+'.webp'));
  }
  fs.writeFileSync(path.join(root,'app/data/spatial/previews.json'),JSON.stringify({sourceHash:library.sourceHash,examples:examples.map(e=>({id:e.id,sceneHash:e.scene.contentHash,src:'/assets/spatial-examples/'+e.id+'.webp'}))})+'\n');
  console.log(`Rendered ${examples.length} admin example previews from scene geometry`);
}finally{await browser?.close();await server.close();}
