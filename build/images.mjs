import fs from 'fs'; import path from 'path'; import sharp from 'sharp';
const AF='/tmp/claude-0/-home-claude/cb421b24-e1af-5222-b2f2-9b1a2c79f814/scratchpad/artifact-files';
const cats={CM:`${AF}/7b7493e6-c393-4929-9173-b091a2b03f6f/project/Img.dc.html`, EX:`${AF}/a6cedb3f-54ea-45b3-84c4-fae8d785e429/project/Img.dc.html`, VP:`${AF}/e387cb20-6dc4-4f22-9682-8329ad1822b9/project/Photo.dc.html`};
const blob2pid={}; const pidInfo={};
for (const [k,f] of Object.entries(cats)) {
  const s=fs.readFileSync(f,'utf8');
  const re=/'([a-z0-9.]+)':\s*\['\/_blob\/([0-9a-f]{32})',\s*'([a-z]+)',\s*'([^']*)',\s*'([^']*)'(?:,\s*'([a-z]+)')?/g; let m;
  while((m=re.exec(s))){ blob2pid[m[2]]=m[1]; if(k==='EX'){ pidInfo[m[1]]={blob:m[2],src:m[3],model:m[4],desc:m[5],kind:m[6]||''}; } }
}
console.log('mapped', Object.keys(blob2pid).length, 'pids', Object.keys(pidInfo).length);
const dir=`${AF}/a6cedb3f-54ea-45b3-84c4-fae8d785e429`;
const files=fs.readdirSync(dir);
const out={};
for (const [pid,info] of Object.entries(pidInfo)) {
  const f=files.find(x=>x.startsWith(info.blob)); if(!f){console.log('missing',pid); continue;}
  const isPng=f.endsWith('.png');
  const name=pid.replace(/\./g,'-')+(isPng?'.png':'.jpg');
  let img=sharp(path.join(dir,f)).resize({width:1280,height:1280,fit:'inside',withoutEnlargement:true});
  img = isPng? img.png({compressionLevel:9,palette:true,quality:90}) : img.jpeg({quality:80,mozjpeg:true});
  const buf=await img.toBuffer(); fs.writeFileSync('img/'+name,buf);
  const meta=await sharp(buf).metadata();
  out[pid]={file:'img/'+name, ...info, w:meta.width, h:meta.height, bytes:buf.length};
}
fs.writeFileSync('data/images.json', JSON.stringify({pids:out, blob2pid},null,1));
console.log(Object.values(out).reduce((a,b)=>a+b.bytes,0));
