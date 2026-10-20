import META from './description_standard_meta.json' with { type: 'json' };
import {fetchResource} from '../../api/client.js';
// Only genuinely repeated forms are general library templates. Unique source
// sheets remain editable and reusable through their standard scenario, without
// flooding the general-purpose picker with hundreds of document-specific pages.
export const DESCRIPTION_META = META.filter(meta=>!meta.deckOnly);
export const DESCRIPTION_DECK_META = META.filter(meta=>meta.deckOnly);
let htmlPromise;
export function loadDescriptionHtml(){
  if(!htmlPromise)htmlPromise=(async()=>{
    const response=await fetchResource('/assets/description-standards/layouts.json.gz');
    if(!response.ok)throw new Error('설명 기반 표준 레이아웃을 불러오지 못했습니다.');
    const bytes=new Uint8Array(await response.arrayBuffer());
    // HTTP Content-Encoding may already have decompressed the static asset.
    if(bytes[0]!==0x1f||bytes[1]!==0x8b)return JSON.parse(new TextDecoder().decode(bytes));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  })().catch(error=>{htmlPromise=null;throw error;});
  return htmlPromise;
}
