import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from '../web/node_modules/playwright/index.mjs';
import {root,output} from './helpers.mjs';

spawnSync(process.execPath,[path.join(root,'app/tests/legacy-runner.mjs'),'--prepare'],{stdio:'inherit'});
const chrome=process.env.CHROME||chromium.executablePath();
const files=process.argv.slice(2).length?process.argv.slice(2).map(p=>path.resolve(p)):[path.join(root,'build/fixtures/my_sample.pptx'),path.join(root,'build/fixtures/review_sample.pptx')];
const results=[];
for(const mode of ['fidelity','roundtrip'])for(const [i,branch]of ['reference','app'].entries()){
  const work=path.join(root,'app/tests/legacy-work',branch);const dir=path.join(work,'build/my');fs.mkdirSync(dir,{recursive:true});
  let code=fs.readFileSync(path.join(root,'build/my',mode+'.mjs'),'utf8');
  code=code.replace(/(?:const|let) (\w+) = fs\.readdirSync\('\/opt\/pw-browsers'\)[^\n;]*;/g,(_,name)=>`const ${name} = ${JSON.stringify(chrome)};`);
  code=code.replace(/['"]\/opt\/pw-browsers\/[^'"]+chrome['"]/g,JSON.stringify(chrome));
  const script=path.join(dir,mode+'.mjs');fs.writeFileSync(script,code);
  const out=path.join(output,'fidelity',mode,branch);fs.mkdirSync(out,{recursive:true});
  const log=path.join(output,`fidelity-${mode}-${branch}.log`);const fd=fs.openSync(log,'w');
  const result=spawnSync(process.execPath,['--import',path.join(root,'app/tests/legacy-preload.mjs'),script,out,...files],{cwd:work,env:{...process.env,LEGACY_UNIT:'1',LEGACY_TARGET:branch,LEGACY_PORT:String(23000+i)},stdio:['ignore',fd,fd],timeout:300000});
  fs.closeSync(fd);const text=fs.readFileSync(log,'utf8');results.push({mode,branch,status:result.status,signal:result.signal,error:result.error?.message,tail:text.split('\n').slice(-12)});console.log(mode,branch,result.status,result.signal||'');
  fs.writeFileSync(path.join(output,'fidelity-summary.json'),JSON.stringify(results,null,2));
}
if(results.some(r=>r.status!==0))process.exitCode=1;
