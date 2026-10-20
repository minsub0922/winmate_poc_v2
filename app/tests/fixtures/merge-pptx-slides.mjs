// Replace a few verified slides without re-exporting unchanged source pages.
// Slide/master/theme compatibility and all untouched slide XML are asserted.
import assert from 'node:assert/strict';
import path from 'node:path';
import JSZip from '../../web/node_modules/jszip/lib/index.js';

export async function mergePptxSlides(originalBytes,replacementBytes,indices){
 const original=await JSZip.loadAsync(originalBytes),replacement=await JSZip.loadAsync(replacementBytes);
 for(const file of ['ppt/theme/theme1.xml','ppt/slideLayouts/slideLayout1.xml']){
  if(original.file(file)&&replacement.file(file))assert.equal(await original.file(file).async('string'),await replacement.file(file).async('string'),file+' must be compatible');
 }
 const untouched=new Map();
 for(const file of Object.keys(original.files).filter(f=>/^ppt\/slides\/slide\d+\.xml$/.test(f))){
  const num=Number(file.match(/slide(\d+)\.xml$/)[1])-1;if(!indices.includes(num))untouched.set(file,await original.file(file).async('string'));
 }
 for(let i=0;i<indices.length;i++){
  const target=indices[i]+1,source=i+1;
  original.file(`ppt/slides/slide${target}.xml`,await replacement.file(`ppt/slides/slide${source}.xml`).async('string'));
  let rels=await replacement.file(`ppt/slides/_rels/slide${source}.xml.rels`).async('string');
  for(const tag of [...rels.matchAll(/<Relationship\b[^>]*\/>/g)].map(m=>m[0])){
   const type=tag.match(/Type="([^"]+)"/)?.[1],value=tag.match(/Target="([^"]+)"/)?.[1];if(!type||!value)continue;
   if(type.endsWith('/image')){
    const from=path.posix.normalize('ppt/slides/'+value),name=`description-studio-${target}-${path.posix.basename(from)}`;
    const item=replacement.file(from);assert.ok(item,'Replacement media missing: '+from);
    original.file('ppt/media/'+name,await item.async('uint8array'));
    rels=rels.replace(tag,tag.replace('Target="'+value+'"','Target="../media/'+name+'"'));
   }else if(type.endsWith('/notesSlide')){
    const from=path.posix.normalize('ppt/slides/'+value),dest=`ppt/notesSlides/notesSlide${target}.xml`;
    original.file(dest,await replacement.file(from).async('string'));
    const oldRel=from.replace(/([^/]+)$/,'_rels/$1.rels'),newRel=dest.replace(/([^/]+)$/,'_rels/$1.rels');
    if(replacement.file(oldRel)){
     let noteRels=await replacement.file(oldRel).async('string');
     noteRels=noteRels.replace(new RegExp(`Target="[^\"]*slides/slide${source}\\.xml"`),'Target="../slides/slide'+target+'.xml"');
     original.file(newRel,noteRels);
    }
    rels=rels.replace(tag,tag.replace('Target="'+value+'"',`Target="../notesSlides/notesSlide${target}.xml"`));
   }
  }
  original.file(`ppt/slides/_rels/slide${target}.xml.rels`,rels);
 }
 for(const [file,bytes] of untouched)assert.equal(await original.file(file).async('string'),bytes,file+' was modified outside the intended scope');
 return original.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}});
}
