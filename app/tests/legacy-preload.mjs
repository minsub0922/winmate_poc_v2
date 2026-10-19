// Test transport/OS adaptation only. Assertions in the original scripts stay intact.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const {chromium}=require('playwright');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'../..');
const upstream=process.env.WINMATE_TEST_URL||'http://127.0.0.1:8788';
const reference=process.env.LEGACY_TARGET==='reference';
const createServer=http.createServer.bind(http);
http.createServer=(handler,...rest)=>{
  const server=createServer((req,res)=>{
    let destination=req.url.split('?')[0];
    if(destination==='/'||destination==='/preview.html'||destination==='/index.html')destination=reference?'/reference/':'/';
    else if(reference&&(destination.startsWith('/img/')||destination.startsWith('/lib/')))destination='/reference'+destination;
    const target=new URL(destination,upstream);
    const proxy=http.request(target,{method:req.method,headers:req.headers},incoming=>{res.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(res);});
    proxy.on('error',error=>{res.writeHead(502);res.end(error.message);});req.pipe(proxy);
  },...rest);
  const listen=server.listen.bind(server);
  let plannedPort;
  server.listen=(port,...args)=>{plannedPort=port||Number(process.env.LEGACY_PORT);return listen(plannedPort,'127.0.0.1',...args.filter(arg=>typeof arg==='function'));};
  const address=server.address.bind(server);
  server.address=()=>address()||(plannedPort?{address:'127.0.0.1',family:'IPv4',port:plannedPort}:null);
  return server;
};
const launch=chromium.launch.bind(chromium);
chromium.launch=async options=>{
  const browser=await launch(options);const createContext=browser.newContext.bind(browser);
  browser.newContext=async options=>{
    const context=await createContext(options);
    await context.route('https://fonts.googleapis.com/**',route=>{
      let base=upstream;try{base=new URL(route.request().frame().url()).origin;}catch{}
      route.fulfill({contentType:'text/css',body:fs.readFileSync(path.join(root,'app/web/public/fonts/fonts.css'),'utf8').replaceAll('url(/fonts/',`url(${base}/fonts/`)});
    });
    if(!reference)await context.addInitScript(()=>{
      // Preserve original test host mocks while the app itself exclusively uses its HTTP adapter.
      const nativeFetch=window.fetch.bind(window);
      window.fetch=async(input,options={})=>{
        if(!String(input).endsWith('/api/llm')||!window.claude?.use)return nativeFetch(input,options);
        let sample;try{sample=await window.claude.use('sample');}catch(error){return new Response(JSON.stringify({error:error.code||'sampling_disabled'}),{headers:{'Content-Type':'application/json'}});}
        if(!sample)return new Response(JSON.stringify({mode:'dummy',error:'sampling_disabled'}),{headers:{'Content-Type':'application/json'}});
        const body=JSON.parse(options.body);const encoder=new TextEncoder();
        const stream=new ReadableStream({async start(controller){
          const send=value=>{try{controller.enqueue(encoder.encode('data: '+JSON.stringify(value)+'\n\n'));}catch{}};
          try{
            const opts={modelTier:body.model_tier,cache:false,signal:options.signal,images:body.images,onText:event=>send({type:'text',text:event.text})};
            if(body.kind==='json'){const data=await sample.json(body.prompt,opts);send({type:'result',data});}
            else{const result=await sample(body.turns,opts);send({type:'result',text:typeof result==='string'?result:result.text});}
          }catch(error){send({type:'error',code:error.code||'upstream_error',message:error.message});}
          try{controller.close();}catch{}
        }});
        return new Response(stream,{headers:{'Content-Type':'text/event-stream'}});
      };
    });
    return context;
  };
  return browser;
};
