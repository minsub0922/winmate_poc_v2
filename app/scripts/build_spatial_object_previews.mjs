// Render compact object thumbnails from the same reusable geometry as the editor.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from '../web/node_modules/vite/dist/node/index.js';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {spatialObjectThumbnail} from '../web/src/domain/spatial/catalog.js';
const sharp=createRequire(new URL('../web/package.json',import.meta.url))('sharp');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const library=JSON.parse(fs.readFileSync(path.join(root,'app/data/spatial/library.json')));
const selected=process.argv.includes('--people-only')?library.assets.filter(a=>a.assetGroup==='people'):process.argv.includes('--details-only')?library.assets.filter(a=>a.recipe?.startsWith('detail-')):library.assets;
const assets=[...new Map(selected.map(a=>[spatialObjectThumbnail(a),a])).entries()];
const output=path.join(root,'app/web/public/assets/spatial-objects');fs.mkdirSync(output,{recursive:true});
const port=Number(process.env.SPATIAL_PREVIEW_PORT||5195);
const server=await createServer({root:path.join(root,'app/web'),configFile:path.join(root,'app/web/vite.config.js'),logLevel:'error',server:{host:'127.0.0.1',port,strictPort:true,hmr:false}});
let browser;
try{
  await server.listen();browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:640,height:440}});
  await page.goto('http://127.0.0.1:'+port+'/favicon.ico');
  await page.evaluate(async library=>{window.objectLibrary=library;const {createSpatialRenderer}=await import('/src/domain/spatial/render-three.js');const host=document.createElement('div');host.style.cssText='width:640px;height:440px';document.body.appendChild(host);window.objectRenderer=createSpatialRenderer(host,{objectOnly:true});},library);
  let rendered=0;
  for(const [url,asset] of assets){
    if(fs.existsSync(path.join(output,path.basename(url))))continue;
    const data=await page.evaluate(async asset=>{
      const span=Math.max(...asset.size)*1.5,width=Math.max(1,span),depth=Math.max(1,asset.size[2]*1.6);
      const scene={version:1,title:asset.name,style:'modern',width,depth,rooms:[],objects:[{id:'preview',assetId:asset.id,x:width/2,z:depth/2,elevation:0,rotation:0}],camera:asset.previewCamera||{azimuth:35,elevation:25,zoom:1.5}};
      const renderer=window.objectRenderer;renderer.setScene(scene,window.objectLibrary);await renderer.ready();return renderer.snapshot({w:640,h:440}).image;
    },asset);
    const target=path.join(output,path.basename(url)),temporary=target+'.'+process.pid+'.tmp';
    await sharp(Buffer.from(data.split(',')[1],'base64')).resize(480,330).webp({quality:85}).toFile(temporary);
    fs.renameSync(temporary,target);
    if(++rendered%100===0)console.log('Rendered '+rendered+' / '+assets.length);
  }
  await page.evaluate(()=>window.objectRenderer.dispose());
  console.log(`Rendered ${assets.length} object thumbnails`);
}finally{await browser?.close();await server.close();}
