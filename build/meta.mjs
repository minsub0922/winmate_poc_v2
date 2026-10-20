import fs from 'fs'; import zlib from 'zlib';
import { PRODUCTS, SOLUTIONS, INDUSTRY_KW } from './catalog_src.mjs';
const AF='/tmp/claude-0/-home-claude/cb421b24-e1af-5222-b2f2-9b1a2c79f814/scratchpad/artifact-files';
const DIRS={MI:'f94fb916-69b7-456f-93d5-ef4e18faecbe',VP:'e387cb20-6dc4-4f22-9682-8329ad1822b9',SS:'32669bef-1cb1-44b8-b492-ba42ed92d63b',SP:'46f54b6b-4fab-47ff-b6ac-68975db2699a',CM:'7b7493e6-c393-4929-9173-b091a2b03f6f',EX:'a6cedb3f-54ea-45b3-84c4-fae8d785e429'};
const R=JSON.parse(fs.readFileSync('data/render.json','utf8'));
const IMX=JSON.parse(fs.readFileSync(`${AF}/7b7493e6-c393-4929-9173-b091a2b03f6f/project/data/industry_matrix.json`,'utf8'));
const CASES=JSON.parse(fs.readFileSync(`${AF}/7b7493e6-c393-4929-9173-b091a2b03f6f/35ad4e5a20726bc6a3e1927eb51f1a2b.json`,'utf8'));
const EXCLUDE=/^L_(SYS|MAP|IMG_SYS|IMG_MAP|VC_MAP|PI_MAP|REQ\d|IA\d)$/;
const IND=Object.fromEntries(IMX.industries.map(i=>[i.code,i.name]));
const SOLMAP={MGI:'magicinfo',VXT:'vxt',STP:'stpro',BIT:'biot',LYN:'lynk',KNX:'knoxsuite',KCP:'knoxcapture',DEX:'dex',CCH:'coldchain',HVC:'hvac',SAC:'sac'};
const SUFIND={RT:'RT',HT:'HT',GF:'SV',OF:'OF',AC:'ED',FD:'MF',LG:'MF',WH:'MF'};
const notesBy={};
for (const [k,d] of Object.entries(DIRS)) { const cj=JSON.parse(fs.readFileSync(`${AF}/${d}/project/canvas.json`,'utf8')); notesBy[k]={cj, notes:Object.values(cj.notes||{}).filter(n=>n.kind==='title1')}; }
function partOf(code, file, group){
  const c=code.toUpperCase();
  const pre=c.split(/[-·\s]/)[0];
  const m=c.match(/^(MI|SS)-([A-Z]{2})-([A-E])$/);
  if (m && m[1]==='MI') return {p:m[3]==='A'?'market':m[3]==='B'?'customer':'user', ind:m[2]};
  if (m && m[1]==='SS') return {p:'scenario', ind:m[2]};
  if (SOLMAP[pre]) { const s=c.match(/-S-([A-Z]{2})$/); return {p:'solution', p2:/-S/.test(c)?'scenario':null, sol:SOLMAP[pre], ind:s?SUFIND[s[1]]:null}; }
  const T={MS:'market',TR:'market',CB:'customer',US:'user',CP:'competition',IM:'insight',CH:'challenge',VP:'value',EF:'effect',SS:'scenario',VM:'scenario',VC:'scenario',UX:'scenario',SM:'dss',BM:'bom',BV:'birdseye',ZP:'birdseye',IS:'birdseye',GN:'birdseye',MB:'birdseye',SA:'solution',OP:'solution',SF:'solution',CD:'case',CL:'case',ST:'why',SC:'spec',SD:'spec',ES:'overview',OV:'overview',RM:'requirements',OG:'execution',IP:'execution',IG:'execution',PL:'execution',CU:'execution',TO:'execution',MT:'execution',CO:'cost',RV:'value',QA:'appendix',AX:'appendix'};
  if (/^P\d/.test(pre) || pre==='P') return {p:'products'};
  if (/^C\d\d$/.test(pre)) return {p:['C07','C12','C13'].includes(pre)?'closing':'cover'};
  if (pre==='CM') return {p:c==='CM-D'?'competition':'why', p2:c==='CM-D'?'why':'competition'};
  if (pre==='SV') return {p:'why', p2:c==='SV-A'?'execution':null};
  if (pre==='SE') return {p:c==='SE-B'?'spec':'execution'};
  if (c==='SC-B') return {p:'spec', p2:'requirements'};
  if (pre==='RV') return {p:'value', p2:'products', ind:'RS'};
  if (pre==='VP' && /HT|MD|RT/.test(file)) { const i=file.match(/_(HT|MD|RT)$/); return {p:'value', ind:i?i[1]:null}; }
  if (T[pre]) return {p:T[pre]};
  return {p:'other'};
}
const PN={market:'시장 · 전략',customer:'고객사 이해',user:'사용자 · 이해관계자',competition:'경쟁사 분석',insight:'시사점 · 제안 방향',challenge:'고객 과제',value:'Value Propositions',effect:'기대 효과',dss:'DSS · 공간 맵',products:'공간별 제품',bom:'구성 · 수량',scenario:'공간 시나리오',birdseye:'조감도 · 공간 시안',solution:'솔루션 제안',case:'유관 사례',why:'Why Samsung',spec:'제품 스펙',overview:'제안 개요',requirements:'고객 요구 이해',execution:'실행 계획',cost:'비용 · 구매',cover:'표지 · 목차 · 간지',closing:'마무리 · 다음 단계',appendix:'부록',other:'기타'};
const BASEREQ={market:['industry','kpis'],customer:['customer','challenges'],user:['users'],competition:['competitors'],insight:['challenges','values'],challenge:['challenges','kpis'],value:['values','products','solutions'],effect:['kpis'],dss:['spaces','products'],products:['spaces','products'],bom:['products','quantities'],scenario:['spaces','solutions','products'],birdseye:['spaces'],solution:['solutions','products'],case:['cases'],why:['competitors','values'],spec:['products'],overview:['customer','project','values'],requirements:['keymen','challenges'],execution:['timeline'],cost:['costs'],cover:['customer','project'],closing:['contacts','timeline'],appendix:['sources']};
const MODELS=[...PRODUCTS.flatMap(p=>[p.model,p.name]),...SOLUTIONS.map(s=>s.name)];
const out=[]; const htmls={};
for (const x of R) {
  if (EXCLUDE.test(x.file)) continue;
  const bt=(x.boardTitle||x.title||'').trim();
  const sp=bt.indexOf(' ');
  let code=sp>0?bt.slice(0,sp):x.file.replace(/^L_/,'');
  let rest=sp>0?bt.slice(sp+1):bt;
  if (code==='VP-U' && rest.startsWith('·')) { code='VP-U'; }
  const [name0, when0]=rest.split(' — ');
  const {cj,notes}=notesBy[x.canvas]; const b=cj.boards[x.file+'.dc.html']||{};
  const ns=notes.filter(n=>n.page===b.page && n.y<b.y); const g=ns.length?ns.reduce((a,n)=>n.y>a.y?n:a).text:'';
  const pc=partOf(code, x.file, g);
  let ind=pc.ind||null;
  const all=x.all||'';
  // sample client
  let sample='';
  const fm=(x.footer||'').match(/^([A-Z]) ([가-힣A-Za-z]{1,8})/); if (fm) sample=fm[1]+' '+fm[2];
  if (!sample) { const hm=(x.headline||'').match(/\b([A-Z]) ([가-힣]{1,6})/); if (hm) sample=hm[1]+' '+hm[2]; }
  const ph=(all.match(/\[[^\[\]]{1,24}\]/g)||[]);
  const pcount = (()=>{ const m=code.match(/^P(\d)/); if (m) return +m[1]; const m2=(name0||'').match(/제품 (\d)개/); if (m2) return +m2[1]; if (code==='VP-F') return /2개/.test(name0)?2:/4개/.test(name0)?4:3; return 0; })();
  const req=new Set(BASEREQ[pc.p]||[]);
  if (/공간|존|층|매장|객실|로비/.test(all)) { if (['scenario','dss','products','birdseye','value'].includes(pc.p)) req.add('spaces'); }
  if (SOLUTIONS.some(s=>all.includes(s.name))) req.add('solutions');
  if (/\[0|\[00|\[N\]/.test(all)) req.add('kpis');
  if (/경쟁|공급사/.test(all) && ['why','competition','market'].includes(pc.p)) req.add('competitors');
  if (/일정|주차|단계|로드맵|D-\d/.test(all) && ['execution','closing','bom'].includes(pc.p)) req.add('timeline');
  if (x.imgs.length) req.add('images');
  const prods=PRODUCTS.filter(p=>all.includes(p.model)||all.includes(p.name)).map(p=>p.id);
  const sols=SOLUTIONS.filter(s=>all.includes(s.name)).map(s=>s.id);
  if (!ind) { const counts={}; for (const [k,ws] of Object.entries(INDUSTRY_KW)) counts[k]=0; }
  const m={
    f:x.file, c:x.canvas, code, name:(name0||'').trim(), when:(when0||'').trim(), g:g.replace(/\s+/g,' ').slice(0,90),
    p:pc.p, p2:pc.p2||null, ind, sol:pc.sol||null, sample,
    eb:x.eyebrow, hl:x.headline, sub:x.sub, foot:x.footer,
    nT:x.texts.length, nI:x.imgs.length, ik:[...new Set(x.imgs.map(i=>i.kind))].slice(0,4), ih:x.imgs.slice(0,6).map(i=>i.hint).filter(Boolean),
    ph:ph.length, phs:[...new Set(ph)].slice(0,6), pc:pcount, req:[...req], prods, sols,
    txt: all.slice(0,700)
  };
  out.push(m); htmls[x.file]=x.html;
}
// industries + cases
const caseInd={}; for (const i of IMX.industries) for (const id of i.caseIds) caseInd[id]=i.code;
const cases=CASES.cases.filter(c=>c.title).map(c=>{
  const parts=c.title.split(/\s+[–\-]\s+|\s*\|\s*|\s*_\s*(?=삼성)/); const cust=parts[0]; const rest=parts.slice(1);
  return {id:c.id, cust:cust.trim(), title:c.title, sub:rest.join(' · ').trim(), date:c.date, url:c.url, ind:caseInd[c.id]||null, indRaw:(c.industry||[]).join(', '), prod:c.product||[], sol:c.solution||[], space:(c.space||[]).slice(0,5), needs:(c.needs||[]).slice(0,5), offer:(c.offer||[]).slice(0,6), proof:(c.proof||[]).slice(0,3), quote:c.quote||'', type:c.customer_type||'', scale:c.scale||''};
});
const industries=IMX.industries.map(i=>({code:i.code,name:i.name,cases:i.cases,top:(i.topRequirements||[]).map(r=>r[0]),samples:i.sampleCustomers||[]}));
const catalog={generated:'2026-10-12', counts:{}, layouts:out, industries, products:PRODUCTS, solutions:SOLUTIONS, cases, indKw:INDUSTRY_KW};
const cnt={}; for (const l of out) cnt[l.p]=(cnt[l.p]||0)+1; catalog.counts=cnt;
fs.writeFileSync('data/catalog.json', JSON.stringify(catalog));
const gz=zlib.gzipSync(Buffer.from(JSON.stringify(htmls)),{level:9});
fs.writeFileSync('data/layouts.b64', gz.toString('base64'));
console.log('layouts',out.length,'cases',cases.length,'catalog bytes',fs.statSync('data/catalog.json').size,'html b64',gz.length*4/3|0);
console.log(cnt);
console.log(out.filter(l=>l.p==='other').map(l=>l.code+' '+l.f));
console.log(out.slice(0,3));
