import fs from 'fs'; import path from 'path'; import { chromium } from 'playwright';
const AF='/tmp/claude-0/-home-claude/cb421b24-e1af-5222-b2f2-9b1a2c79f814/scratchpad/artifact-files';
const CANVAS=[
 ['MI','f94fb916-69b7-456f-93d5-ef4e18faecbe','01 MI (업종별)','https://claude.ai/artifact/XnbECsMCvmCsHTsJtfeQUV'],
 ['VP','e387cb20-6dc4-4f22-9682-8329ad1822b9','02 Value Props (업종별)','https://claude.ai/artifact/V6bPV1WJhKFyJeHEYjmnhv'],
 ['SS','32669bef-1cb1-44b8-b492-ba42ed92d63b','03 공간별 가치 제공 시나리오','https://claude.ai/artifact/7DyZ4i11yq9sjnBP2ztEtr'],
 ['SP','46f54b6b-4fab-47ff-b6ac-68975db2699a','04 공간별 제품 소개','https://claude.ai/artifact/9mD73MY9hcPFPAavohfA7B'],
 ['CM','7b7493e6-c393-4929-9173-b091a2b03f6f','공통 레이아웃 · 솔루션 전용 · 이미지 중심','https://claude.ai/artifact/GFCVoigDttt2414bvFWDvv'],
 ['EX','a6cedb3f-54ea-45b3-84c4-fae8d785e429','05 보강 레이아웃','https://claude.ai/artifact/MbhEa2JB7ELDFLbRceHHQ4'],
];
const only=process.argv[2];
const IM=JSON.parse(fs.readFileSync('data/images.json','utf8'));
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'}).catch(()=>chromium.launch());
const page=await browser.newPage({viewport:{width:1400,height:900}});
await page.goto('file://'+path.resolve('build/blank.html'));
await page.addScriptTag({path:'build/renderer.js'});
const all=[]; fs.mkdirSync('build/shots',{recursive:true});
for (const [key,dir,cname,curl] of CANVAS) {
  if (only && only!==key) continue;
  const pdir=`${AF}/${dir}/project`;
  const reg={}; for (const f of fs.readdirSync(pdir)) if (f.endsWith('.dc.html')) reg[f.replace('.dc.html','')]=fs.readFileSync(`${pdir}/${f}`,'utf8');
  // fallback components from other canvases
  for (const [k2,d2] of CANVAS) { const p2=`${AF}/${d2}/project`; for (const f of fs.readdirSync(p2)) { const n=f.replace('.dc.html',''); if (f.endsWith('.dc.html') && !reg[n] && /^(Img|Photo|Prod)$/.test(n)) reg[n]=fs.readFileSync(`${p2}/${f}`,'utf8'); } }
  const canvas=JSON.parse(fs.readFileSync(`${pdir}/canvas.json`,'utf8'));
  await page.evaluate((r)=>window.__DC.setRegistry(r), reg);
  const files=canvas.order.filter(f=>/^L_/.test(f));
  for (const f of files) {
    const name=f.replace('.dc.html','');
    const res=await page.evaluate(({name,IM})=>{
      const r=window.__DC.renderTop(name);
      const stage=document.getElementById('stage'); stage.innerHTML='';
      if(!r.root) return {err:r.errors};
      stage.appendChild(r.root);
      const root=r.root;
      // images
      let imgN=0; const imgs=[];
      const mkPh=(style, alt, kind)=>{ const d=document.createElement('div'); d.setAttribute('style',(style||'')+'; background:#dfe3ea; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; color:#7a8292; font-size:11.5px; line-height:1.4; text-align:center; box-sizing:border-box; padding:6px; overflow:hidden;'); d.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8a91a0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18v14H3z M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 19"/></svg>'; const s=document.createElement('span'); s.textContent=alt||'이미지'; d.appendChild(s); d.setAttribute('data-ph','1'); return d; };
      root.querySelectorAll('img').forEach(img=>{
        const src=img.getAttribute('src')||''; const m=src.match(/\/_blob\/([0-9a-f]{32})/);
        if(m){ const pid=IM.blob2pid[m[1]]; if(pid&&IM.pids[pid]){ img.setAttribute('src',IM.pids[pid].file); img.setAttribute('data-pid',pid);} else { const ph=mkPh(img.getAttribute('style'), img.getAttribute('alt')); img.replaceWith(ph); } }
      });
      root.querySelectorAll('[style*="_blob"]').forEach(e=>{ e.setAttribute('style', e.getAttribute('style').replace(/url\([^)]*_blob[^)]*\)/g,'none')); });
      // image slots: Img/Photo/Prod roots, standalone imgs, placeholders
      const slotEls=new Set();
      root.querySelectorAll('[data-slot]').forEach(e=>slotEls.add(e));
      root.querySelectorAll('img, [data-ph]').forEach(e=>{ if(!e.closest('[data-slot]')) slotEls.add(e); });
      for (const e of slotEls) { e.setAttribute('data-img', String(imgN)); const r2=e.getBoundingClientRect(); imgs.push({i:imgN, kind:e.getAttribute('data-kind')||(e.tagName==='IMG'?'photo':'photo'), hint:e.getAttribute('data-hint')||e.getAttribute('alt')||(e.querySelector('span')||{}).textContent||'', pid:e.getAttribute('data-pid')||'', w:Math.round(r2.width), h:Math.round(r2.height)}); imgN++; }
      // text blocks (editable units)
      let tN=0; const texts=[];
      const rr=root.getBoundingClientRect();
      const SIMPLE=new Set(['SPAN','B','STRONG','EM','I','BR','SUP','SUB','SMALL','tspan']);
      const isSimple=(el)=>{ if(!SIMPLE.has(el.tagName)) return false; const st=el.getAttribute('style')||''; if(/position\s*:\s*absolute|display\s*:\s*(flex|grid|block|inline-flex|inline-block)/.test(st)) return false; return Array.from(el.children).every(isSimple); };
      const walk=(el)=>{
        if (el.hasAttribute && el.hasAttribute('data-img')) return;
        let has=false; for (const c of el.childNodes) if (c.nodeType===3 && c.data.trim()) { has=true; break; }
        if (has && Array.from(el.children).every(isSimple)) {
          el.setAttribute('data-tb', String(tN));
          const b=el.getBoundingClientRect(); const cs=getComputedStyle(el);
          texts.push({i:tN, s:el.textContent.replace(/\s+/g,' ').trim().slice(0,240), y:Math.round(b.top-rr.top), x:Math.round(b.left-rr.left), w:Math.round(b.width), h:Math.round(b.height), fs:parseFloat(cs.fontSize), fw:parseInt(cs.fontWeight)||400});
          tN++; return;
        }
        for (const c of Array.from(el.children)) walk(c);
      };
      for (const c of Array.from(root.children)) walk(c);
      const byStyle=(re)=>{ const e=Array.from(root.children).find(c=>re.test(c.getAttribute('style')||'')); return e? e.textContent.replace(/\s+/g,' ').trim():''; };
      const eyebrow=byStyle(/top:\s*(44|40|56|64)px[^"]*font-size:\s*13px/);
      const headline=byStyle(/top:\s*(66|62|88)px[^"]*font-size:\s*(30|28|40)px/);
      const sub=byStyle(/top:\s*(112|104|148)px[^"]*font-size:\s*(15|14|16)px/);
      const footEl=Array.from(root.children).find(c=>/top:\s*680px/.test(c.getAttribute('style')||''));
      const footer=footEl? Array.from(footEl.querySelectorAll('span')).map(s=>s.textContent).filter(t=>t!=='고객사 로고').join(' · '):'';
      const w=Math.round(rr.width), h=Math.round(rr.height);
      return {html: root.outerHTML, texts, imgs, eyebrow, headline, sub, footer, w, h, err:r.errors, title:r.title, all: root.textContent.replace(/\s+/g,' ').trim()};
    },{name,IM});
    if (res.err && res.err.length) console.log('WARN',key,name,res.err.slice(0,3));
    if (!res.html) { console.log('FAIL',key,name); continue; }
    const b=canvas.boards[f];
    await page.locator('#stage > *').first().screenshot({path:`build/shots/${key}_${name}.jpg`, type:'jpeg', quality:60, scale:'css'}).catch(e=>console.log('shot',name,e.message));
    all.push({canvas:key, canvasName:cname, canvasUrl:curl, file:name, boardTitle:b.title||res.title, page:b.page, bx:b.x, by:b.y, ...res});
  }
  console.log(key, files.length);
}
fs.writeFileSync(`data/render${only?'_'+only:''}.json`, JSON.stringify(all));
console.log('total', all.length, 'bytes', all.reduce((a,b)=>a+b.html.length,0));
await browser.close();
