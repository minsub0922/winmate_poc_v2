/** Ten distinct real-data UI selections per explorer, plus ten Best Scenario detail views. */
import {launch,startVite,isolatedContext,openApp,suite,ok,eq,outDir} from './fixtures/strict/harness.mjs';
const browser=await launch();const vite=await startVite();const context=await isolatedContext(browser,vite.url);const page=await openApp(context,vite.url);let bad=false;
try{
 for(const kind of ['solutions','cases']){
  const cases=await page.evaluate(async kind=>{const c=await import('/src/services/catalog.js');const all=kind==='solutions'?c.SOLUTIONS:c.CASES;const seen=new Set();return all.filter(x=>{const k=kind==='solutions'?x.name:x.cust+' '+x.title;if(seen.has(k))return false;seen.add(k);return true;}).slice(0,10).map(x=>({id:String(x.id),name:x.name||x.cust,title:x.title||x.name,query:kind==='solutions'?x.name:x.cust+' '+x.title}));},kind);
  const tests=suite(kind+'-explorer','app/tests/explorers.mjs');
  for(const [index,input]of cases.entries())tests.case(String(index+1).padStart(2,'0'),input.name+' · '+input.id,async d=>{
   await page.evaluate(async({kind,input})=>{
    const React=(await import('/node_modules/.vite/deps/react.js')).default,ReactDom=(await import('/node_modules/.vite/deps/react-dom_client.js')).default;const repo=await import('/src/repositories/proposals.js');const {ContextExplorer}=await import('/src/components/ctxexplorer.jsx');
    window.__explorerRoot?.unmount();document.getElementById('strict-explorer-root')?.remove();const host=document.createElement('div');host.id='strict-explorer-root';document.body.appendChild(host);window.__explorerClosed=false;
    const id=repo.createProposal();window.__explorerProposal=id;const root=ReactDom.createRoot(host);window.__explorerRoot=root;
    function Subject(){const p=repo.useStore(s=>s.proposals.find(x=>x.id===id));return React.createElement(ContextExplorer,{p,kind,start:'all',onClose:()=>{window.__explorerClosed=true;root.unmount();host.remove();}});}
    root.render(React.createElement(Subject));
   },{kind,input});
   await page.locator('#ex-q-in').fill(input.query);
   if(kind==='solutions')await page.getByRole('button',{name:input.name+' · 고르기',exact:true}).press('Enter');
   else await page.getByRole('button',{name:input.name+' · 고르기',exact:true}).first().press('Enter');
   await page.getByRole('button',{name:'1개 연결',exact:true}).click();
   const selected=await page.evaluate(async kind=>{const repo=await import('/src/repositories/proposals.js');return repo.getProposal(window.__explorerProposal).ctx[kind];},kind);
   eq(selected,[input.id],'UI selection updates actual repository reference');ok(await page.evaluate(()=>window.__explorerClosed),'dialog closes');d.id=input.id;
  });
  const report=await tests.run();if(!report.meetsMinimum)bad=true;
 }
 const scenarios=await page.evaluate(async()=>{const {SCENARIOS}=await import('/src/domain/templates/scenarios.js');return SCENARIOS.slice(0,10).map(s=>({id:s.id,title:s.title}));});
 const tests=suite('best-scenario','app/tests/explorers.mjs');
 // Use the actual page navigation rather than mounting the detail in isolation.
 await page.evaluate(async()=>{const p=await import('/src/repositories/proposals.js');p.saveUi({...p.loadUi(),route:{name:'scenarios'}});});await page.reload();await page.waitForSelector('.app');
 for(const [index,input]of scenarios.entries())tests.case(String(index+1).padStart(2,'0'),input.title,async d=>{
  await page.getByRole('button',{name:input.title+' 상세 보기',exact:true}).click();
  const dialog=page.getByRole('dialog').last();await dialog.waitFor();ok((await dialog.innerText()).includes(input.title),'scenario title shown');ok(await dialog.locator('.node').count()>0,'real storyboard shown');
  await dialog.getByRole('button',{name:'닫기',exact:true}).first().click();d.id=input.id;
 });
 const report=await tests.run();if(!report.meetsMinimum)bad=true;
}finally{await context.close();await browser.close();await vite.close();}
if(bad)process.exitCode=1;
