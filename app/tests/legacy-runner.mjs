import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {root,origin,output} from './helpers.mjs';

const selected=process.env.LEGACY_CASES?new Set(process.env.LEGACY_CASES.split(',')):null;
const files=fs.readdirSync(path.join(root,'build')).filter(name=>/^test.*\.mjs$/.test(name)&&(!selected||selected.has(name))).sort();
const chrome=process.env.CHROME||chromium.executablePath();
if(!fs.existsSync(chrome))throw new Error('Set CHROME to an installed Chromium executable.');
const base=path.join(root,'app/tests/legacy-work');fs.mkdirSync(base,{recursive:true});
const report=[];const map=JSON.parse(fs.readFileSync(path.join(root,'docs/migration/evidence/stage1/source-map.json')));
const reportName=process.env.LEGACY_REPORT||'legacy-report.json';

function workspace(branch){
  const dir=path.join(base,branch);fs.mkdirSync(path.join(dir,'build'),{recursive:true});fs.mkdirSync(path.join(dir,'dist'),{recursive:true});fs.mkdirSync(path.join(dir,'src'),{recursive:true});
  const link=(target,name)=>{const dest=path.join(dir,name);if(!fs.existsSync(dest))fs.symlinkSync(target,dest,'dir');};
  link(path.join(root,'app/web/node_modules'),'node_modules');link(path.join(root,'app/data'),'data');link(path.join(root,'build/fixtures'),'build/fixtures');
  fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');
  if(branch==='reference')fs.cpSync(path.join(root,'reference/source-build/src'),path.join(dir,'src'),{recursive:true});
  else{
    const primer=path.join(dir,'src/_bootstrap-fixture.js');
    fs.writeFileSync(primer,`import {configureBootstrap} from ${JSON.stringify(path.join(root,'app/web/src/api/bootstrap.js'))};\nimport catalog from ${JSON.stringify(path.join(root,'app/data/catalog.json'))};\nimport images from ${JSON.stringify(path.join(root,'app/data/images.json'))};\nimport products from ${JSON.stringify(path.join(root,'app/data/products_db.json'))};\nconfigureBootstrap({catalog,images,products});\n`);
    for(const [original,destination]of Object.entries(map)){
      if(!/\.(jsx?|json)$/.test(original))continue;
      const target=path.join(dir,'src',original);fs.mkdirSync(path.dirname(target),{recursive:true});
      if(original.endsWith('.json'))fs.copyFileSync(path.join(root,'app/web/src',destination),target);
      else fs.writeFileSync(target,`import ${JSON.stringify(primer)};\nexport * from ${JSON.stringify(path.join(root,'app/web/src',destination))};\n`);
    }
  }
  // Existing tests inspect this directory as well as opening its HTTP server.
  fs.copyFileSync(path.join(root,branch==='reference'?'reference/live/index.html':'app/web/dist/index.html'),path.join(dir,'dist/preview.html'));
  link(path.join(root,'reference/live/img'),'dist/img');link(path.join(root,'reference/live/lib'),'dist/lib');
  return dir;
}
function run(file,branch,index){return new Promise(resolve=>{
  const dir=workspace(branch);let text=fs.readFileSync(path.join(root,'build',file),'utf8');
  text=text.replace(/(?:const|let) (\w+) = fs\.readdirSync\('\/opt\/pw-browsers'\)[^\n;]*;/g,(_,name)=>`const ${name} = ${JSON.stringify(chrome)};`);
  text=text.replace(/['"]\/opt\/pw-browsers\/[^'"]+chrome['"]/g,JSON.stringify(chrome));
  const port=20000+index*2+(branch==='app'?1:0);
  text=text.replace(/\b(?:87|88)\d{2}\b/g,String(port));
  // Platform keyboard equivalent; no test assertions are replaced.
  if(process.platform==='darwin')text=text.replace(/Control\+([a-zA-Z])/g,'Meta+$1');
  const script=path.join(dir,'build',file);fs.writeFileSync(script,text);
  const log=path.join(output,`legacy-${branch}-${file}.log`);const fd=fs.openSync(log,'w');
  const child=spawn(process.execPath,['--import',path.join(root,'app/tests/legacy-preload.mjs'),script],{cwd:dir,env:{...process.env,CHROME:chrome,LEGACY_TARGET:branch,LEGACY_PORT:String(port),WINMATE_TEST_URL:origin},stdio:['ignore',fd,fd],detached:true});
  const started=Date.now();const timeout=setTimeout(()=>{try{process.kill(-child.pid,'SIGTERM');}catch{}},Number(process.env.LEGACY_TIMEOUT||90000));
  child.on('exit',(code,signal)=>{clearTimeout(timeout);fs.closeSync(fd);const logText=fs.readFileSync(log,'utf8');const failures=logText.split('\n').filter(line=>/FAIL|Error:|Timeout|pageerror:/.test(line)).map(line=>line.slice(0,450));resolve({file,branch,code,signal,ms:Date.now()-started,failures,passedAssertions:logText.split('\n').filter(line=>/^ok[ :]/.test(line)).length,log:path.relative(root,log)});});
});}
const concurrency=Number(process.env.LEGACY_WORKERS||2);let cursor=0;
await Promise.all(Array.from({length:concurrency},async()=>{
  while(cursor<files.length){const index=cursor++;const file=files[index];
    const a=await run(file,'reference',index);const b=await run(file,'app',index);
    const passed=r=>r.code===0&&!r.failures.length;
    const item={file,reference:a,app:b,classification:passed(a)&&passed(b)?'pass':passed(a)?'needs-review':passed(b)?'baseline-failure-fixed':a.signal&&b.signal?'timeout-on-both':'fails-on-both'};report.push(item);
    fs.writeFileSync(path.join(output,reportName),JSON.stringify(report,null,2));console.log(file,item.classification,'assertions',a.passedAssertions,b.passedAssertions,'seconds',Math.round((a.ms+b.ms)/1000));
  }
}));
console.log(JSON.stringify({scripts:report.length,pass:report.filter(r=>r.classification==='pass').length,needsReview:report.filter(r=>r.classification==='needs-review').map(r=>r.file),failsOnBoth:report.filter(r=>r.classification==='fails-on-both').map(r=>r.file)},null,2));
if(report.some(r=>r.classification==='needs-review'))process.exitCode=1;
