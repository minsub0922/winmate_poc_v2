import fs from 'fs'; import sharp from 'sharp';
const [prefix, start='0', count='16', out='build/sheet.jpg']=process.argv.slice(2);
const files=fs.readdirSync('build/shots').filter(f=>f.startsWith(prefix)).sort().slice(+start, +start + +count);
const W=480,H=270,cols=4; const rows=Math.ceil(files.length/cols);
const comps=[];
for (let i=0;i<files.length;i++){ const buf=await sharp('build/shots/'+files[i]).resize(W,H).toBuffer(); comps.push({input:buf, left:(i%cols)*(W+8), top:Math.floor(i/cols)*(H+28)});
 const svg=`<svg width="${W}" height="24"><text x="2" y="16" font-size="14" font-family="sans-serif" fill="#000">${files[i].replace('.jpg','')}</text></svg>`; comps.push({input:Buffer.from(svg), left:(i%cols)*(W+8), top:Math.floor(i/cols)*(H+28)+H+2}); }
await sharp({create:{width:cols*(W+8),height:rows*(H+28),channels:3,background:'#888'}}).composite(comps).jpeg({quality:70}).toFile(out);
console.log(files.length);
