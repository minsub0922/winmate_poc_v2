// Real repository initialization and native slide rendering; never invokes a model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../web/node_modules/playwright/index.mjs';
import { createServer } from '../web/node_modules/vite/dist/node/index.js';
import { LAYOUT_CONTEXT_VERSION } from '../web/src/domain/slides/context-policy.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const bundle = read('app/web/src/domain/review/linked-review-examples.json');
const legacy = read('app/web/src/domain/review/sample-reviews.json');
const previous = read('app/web/src/domain/review/linked-review-examples-v2.json');
const boot = { catalog: read('app/data/catalog.json'), products: read('app/data/products_db.json'), images: read('app/data/images.json'), capabilities: null, user: { username: 'admin', auth_enabled: true } };
const out = path.join(root, 'app/tests/output/linked-review-examples-ui'); fs.mkdirSync(out, { recursive: true });
const vite = await createServer({ root: path.join(root, 'app/web'), configFile: path.join(root, 'app/web/vite.config.js'), logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
const passed = [], errors = []; let browser, page, modelRequests = 0;
const pass = s => { passed.push(s); console.log('PASS ' + s); };
async function contextFor(seed = {}, admin = true) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  await context.route(url => url.pathname.startsWith('/api/'), route => {
    const u = new URL(route.request().url());
    if (route.request().method() === 'POST' && /poc|review|jobs/.test(u.pathname)) modelRequests++;
    if (u.pathname === '/api/bootstrap') return route.fulfill({ json: { ...boot, user: admin ? boot.user : { username: 'member', auth_enabled: true } } });
    if (u.pathname === '/api/auth/status') return route.fulfill({ json: { enabled: false, configured: true, authenticated: true } });
    if (u.pathname.startsWith('/api/product-packs/')) return route.fulfill({ json: read('reference/live/img/prod/d00.json') });
    if (u.pathname === '/api/storyboards') return route.fulfill({ json: { items: [] } });
    return route.fulfill({ status: 503, json: { code: 'example_ui_no_model' } });
  });
  await context.route(url => ['/img/', '/lib/', '/fonts/'].some(p => url.pathname.startsWith(p)), route => {
    const u = new URL(route.request().url()), rel = decodeURIComponent(u.pathname).slice(1);
    const file = path.join(root, u.pathname.startsWith('/fonts/') ? 'app/web/public' : 'app/data/static', rel);
    return fs.existsSync(file) ? route.fulfill({ path: file }) : route.abort();
  });
  await context.route(url => !['127.0.0.1', 'localhost'].includes(url.hostname), route => route.abort());
  await context.addInitScript(seed => {
    if (!localStorage.getItem('examples-test-initialized')) {
      for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      localStorage.setItem('winmate.v2.ui', JSON.stringify({ route: { name: 'reviews' } }));
      localStorage.setItem('examples-test-initialized', '1');
    }
  }, seed);
  return context;
}
async function open(context) {
  page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:' + vite.httpServer.address().port);
  await page.getByRole('heading', { name: '제안서 검토', exact: true }).waitFor();
  return page;
}
const stored = page => page.evaluate(() => ({
  reviews: JSON.parse(localStorage.getItem('winmate.v2.reviews') || '[]'),
  proposals: JSON.parse(localStorage.getItem('winmate.v2.proposals') || '[]'),
  marker: localStorage.getItem('winmate.v2.reviews.seedv'),
}));
try {
  await vite.listen(); browser = await chromium.launch({ headless: true });
  const context = await contextFor(); await open(context);
  await page.waitForFunction(() => document.querySelectorAll('.rvh-thumbs .slide').length === 9);
  let state = await stored(page);
  assert.equal(state.reviews.length, 3); assert.equal(state.proposals.length, 3);
  assert.equal(state.marker, 'admin-linked-review-examples-5-layouts1');
  for (const e of bundle.examples) {
    const r = state.reviews.find(r => r.id === e.review.id), p = state.proposals.find(p => p.id === r.settings.linkedId);
    assert.equal(p.id, e.proposal.id); assert.equal(r.settings.previewProposalId, p.id);
    assert.equal(r.criteriaVersion, 5); assert.equal(r.ai, true); assert.equal(r.demo, true); assert.equal(r.scoring, 'server');
    assert.equal(Object.keys(r.results).length, 24);
    assert.equal(Object.values(r.results).flatMap(x=>x.checkpoints).length,96);
    for(const x of Object.values(r.results))assert.equal(x.score,x.checkpoints.reduce((sum,p)=>sum+p.points,0)/4);
  }
  assert.equal(await page.locator('.rvh-th-missing').count(), 0);
  await page.screenshot({ animations: 'disabled', path: path.join(out, 'linked-home.png') });
  pass('Fresh history automatically creates three real source/review pairs and renders nine native home previews');
  await page.getByRole('button',{name:'검토 평가 기준 전체 보기',exact:true}).click();
  const criteria=page.getByRole('dialog',{name:'검토 점수 기준',exact:true});await criteria.waitFor();
  assert.equal(await criteria.locator('.rv-scoring-levels li').count(),5);
  assert.ok((await criteria.locator('.rv-scoring-levels').innerText()).includes('제안에 충분 · 85점'));
  await criteria.locator('.wm-ci-c>button').first().click();
  assert.equal(await criteria.locator('.rv-checkpoint-definitions li').count(),4);
  await criteria.screenshot({ animations: 'disabled',path:path.join(out,'checkpoint-rubric.png')});
  await criteria.getByRole('button',{name:'닫기',exact:true}).first().click();
  pass('Current rubric exposes five evidence levels and four precise checkpoints per criterion');
  for (const e of bundle.examples) {
    await page.getByRole('button', { name: e.review.title + ' 평가 열기', exact: true }).click();
    await page.locator('.rv-deck').waitFor();
    assert.equal(await page.getByLabel('장표를 보여줄 제안서', { exact: true }).inputValue(), e.proposal.id);
    assert.equal(await page.locator('.rv-slide-card').count(), e.doc.units.length);
    assert.equal(await page.locator('.rv-original-missing').count(), 0);
    assert.equal(await page.locator('.rv-radar').count(), 4);
    assert.equal(await page.getByRole('button', { name: '원본 연결', exact: true }).count(), 0);
    const first = page.locator('.rv-slide-card').first(); await first.scrollIntoViewIfNeeded();
    await first.locator('.slide-inner').waitFor();
    await page.waitForFunction(() => document.querySelector('.rv-slide-card .slide-inner')?.textContent.trim().length > 10);
    await page.getByRole('button', { name: '이렇게 읽었어요', exact: true }).hover();
    await page.getByText('가상 고객의 예시 제안서를 실제 AI로 검토한 기록입니다.', { exact: true }).waitFor();
    assert.ok(!(await page.locator('.rv-hover').innerText()).includes('실제 AI 평가 결과가 아닙니다'));
    await page.keyboard.press('Escape');
    const pageCounts=new Map();
    for(const x of Object.values(e.review.results))for(const point of x.checkpoints)for(const ev of point.evidence)pageCounts.set(ev.unit,(pageCounts.get(ev.unit)||0)+1);
    const scorePage=[...pageCounts].sort((a,b)=>b[1]-a[1])[0][0];
    const scoreCard=page.locator('.rv-slide-card').nth(scorePage-1);await scoreCard.scrollIntoViewIfNeeded();await scoreCard.hover();
    const hover=page.locator('.rv-slide-hover');await hover.waitFor();await hover.locator('.slide-inner').waitFor();
    assert.ok(await hover.locator('.rv-checkpoint-scores>li').count()>0);
    const a=await hover.locator('.rv-slide-hover-stage').boundingBox(),b=await hover.locator('.rv-slide-scores').boundingBox(),small=await scoreCard.boundingBox();
    assert.ok(a.width>small.width+100);assert.ok(b.y>=a.y+a.height);
    await hover.screenshot({ animations: 'disabled',path:path.join(out,e.scenario+'-slide-hover.png')});
    await hover.locator('.rv-slide-hover-stage').click();await page.locator('.rv-page-dialog').waitFor();
    assert.equal(await page.locator('.rv-slide-hover').count(),0);
    const layout=await page.locator('.rv-page-stage').boundingBox(),scores=await page.locator('.rv-page-score-column').boundingBox();
    assert.ok(scores.x>=layout.x+layout.width);
    const names=await page.locator('.rv-page-score-column .rv-checkpoint-scores header b').allInnerTexts();
    const expectedNames=Object.values(e.review.results).flatMap(x=>x.checkpoints).filter(p=>p.evidence.some(ev=>ev.unit===scorePage)).map(p=>p.name);
    assert.deepEqual([...names].sort(),[...expectedNames].sort());
    await page.screenshot({ animations: 'disabled',path:path.join(out,e.scenario+'-slide-scores-right.png')});
    if(e===bundle.examples[0]){
      await page.setViewportSize({width:390,height:850});await page.waitForTimeout(150);
      const m=await page.locator('.rv-page-stage').boundingBox(),n=await page.locator('.rv-page-score-column').boundingBox();
      assert.ok(n.y>=m.y+m.height);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({ animations: 'disabled',path:path.join(out,'slide-scores-phone.png')});await page.setViewportSize({width:1500,height:1050});
    }
    await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).first().click();
    pass(e.scenario+': actual native layout hover shows grounded checkpoint scores below; full dialog scores sit on the right and match this page only');
    const last = page.locator('.rv-slide-card').last(); await last.scrollIntoViewIfNeeded(); await last.click();
    await page.getByRole('dialog', { name: new RegExp('^' + e.doc.units.length + '장') }).waitFor();
    await page.locator('.rv-page-dialog .slide-inner').waitFor();
    await page.getByRole('button', { name: '이전 장', exact: true }).click();
    await page.getByRole('dialog', { name: new RegExp('^' + (e.doc.units.length - 1) + '장') }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).first().click();
    if (e === bundle.examples[0]) {
      for (const width of [1500, 900, 390]) {
        await page.setViewportSize({ width, height: 1050 }); await page.waitForTimeout(200);
        const plots = await page.locator('.rv-radar').evaluateAll(nodes => nodes.map(svg => {
          const box=svg.getBoundingClientRect(),scale=svg.getScreenCTM().a;
          const labels=[...svg.querySelectorAll('.rv-radar-label')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,font:parseFloat(getComputedStyle(el).fontSize)*scale,name:el.textContent};});
          const collisions=[];
          for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)if(Math.min(labels[i].right,labels[j].right)-Math.max(labels[i].left,labels[j].left)>2&&Math.min(labels[i].bottom,labels[j].bottom)-Math.max(labels[i].top,labels[j].top)>2)collisions.push([labels[i].name,labels[j].name]);
          return {minFont:Math.min(...labels.map(l=>l.font)),clipped:labels.filter(l=>l.left<box.left-2||l.right>box.right+2||l.top<box.top-2||l.bottom>box.bottom+2).map(l=>l.name),collisions};
        }));
        for(const plot of plots){assert.ok(plot.minFont>=13.8);assert.deepEqual(plot.clipped,[],`clipped new criterion at ${width}`);assert.deepEqual(plot.collisions,[],`overlapping new criteria at ${width}`);}
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        for(const chart of await page.locator('.rv-radar').all()) {
          const target=chart.locator('.rv-radar-target').last(); await target.scrollIntoViewIfNeeded(); await target.focus();
          const detail=page.locator('.rv-hover-outside');await detail.waitFor();
          const a=await chart.boundingBox(),b=await detail.boundingBox();
          assert.ok(!(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1),'new hover covers chart');
          assert.ok(b.x>=0&&b.x+b.width<=width+1);await page.keyboard.press('Escape');
        }
        await page.locator('.rv-radar-card').first().scrollIntoViewIfNeeded();
        await page.screenshot({ animations: 'disabled',path:path.join(out,`criteria-v3-${width}.png`)});
      }
      await page.setViewportSize({width:1500,height:1050});
      pass('All 24 requested labels remain at least 14px without clipping, overlap or chart-covering details at desktop, tablet and phone widths');
    }
    await page.locator('.rv-body').evaluate(el => el.scrollTop = 0);
    await page.screenshot({ animations: 'disabled', path: path.join(out, `${e.scenario}-detail.png`) });
    await page.reload(); await page.locator('.rv-deck').waitFor();
    assert.equal(await page.getByLabel('장표를 보여줄 제안서', { exact: true }).inputValue(), e.proposal.id);
    assert.equal(await page.locator('.rv-slide-card').count(), e.doc.units.length);
    await page.evaluate(() => { localStorage.setItem('winmate.v2.ui', JSON.stringify({ route: { name: 'reviews' } })); });
    await page.reload(); await page.locator('.rvh-card').first().waitFor();
    pass(`${e.scenario}: ${e.doc.units.length} native slides, correct original, last-page navigation and reload without uploads`);
  }
  state = await stored(page); assert.equal(state.reviews.length, 3); assert.equal(state.proposals.length, 3);
  const response = await page.request.get(new URL(bundle.examples[0].doc.images[0].src, page.url()).href);
  assert.equal(response.status(), 200); assert.ok(response.headers()['content-type'].startsWith('image/'));
  pass('Saved model evidence images are served locally; reload does not duplicate either history');
  await context.close();

  const old = legacy.reviews.map(r => ({ ...structuredClone(r), sample: { source: 'example-review', version: 1 } }));
  const edited = old.find(r => r.id === 'r_demo_c'); edited.title += ' 사용자 수정';
  const own = { ...structuredClone(legacy.reviews[0]), id: 'personal-review', title: '내 기록', demo: false };
  const ownProposal = { id: 'personal-proposal', title: '내 제안서', customer: '내 고객', parts: [], createdAt: 1, updatedAt: 1 };
  const migrated = await contextFor({ 'winmate.v2.reviews': [own, ...old], 'winmate.v2.proposals': [ownProposal], 'winmate.v2.reviews.seedv': 'admin-review-samples-1' });
  await open(migrated); state = await stored(page);
  assert.equal(state.reviews.length, 5); assert.equal(state.proposals.length, 4);
  assert.deepEqual(state.reviews.find(r => r.id === own.id), own);
  assert.deepEqual(state.reviews.find(r => r.id === edited.id), edited);
  assert.deepEqual(state.proposals.find(p => p.id === ownProposal.id), ownProposal);
  assert.equal(state.reviews.some(r => ['r_demo_f', 'r_demo_d'].includes(r.id)), false);
  pass('One-time replacement removes only untouched unlinked defaults and preserves personal work and edited examples');
  await page.reload(); await page.locator('.rvh-card').first().waitFor();
  assert.equal((await stored(page)).reviews.length, 5);
  const deleted = bundle.examples[0].review;
  await page.getByRole('button', { name: deleted.title + ' 평가 지우기', exact: true }).click();
  await page.getByRole('button', { name: '지우기', exact: true }).click();
  await page.waitForFunction(id => !JSON.parse(localStorage.getItem('winmate.v2.reviews')).some(r => r.id === id), deleted.id);
  await page.reload(); await page.locator('.rvh-card').first().waitFor();
  assert.equal((await stored(page)).reviews.some(r => r.id === deleted.id), false);
  pass('Completed migration survives reload; a deleted example is never recreated');
  await migrated.close();
  const prior = structuredClone(previous.examples);
  prior[0].review.title += ' 사용자 수정';
  prior[1].proposal.title += ' 사용자 수정';
  const upgraded = await contextFor({ 'winmate.v2.reviews': prior.map(e => e.review), 'winmate.v2.proposals': prior.map(e => e.proposal), 'winmate.v2.reviews.seedv': 'admin-linked-review-examples-2' });
  await open(upgraded); state = await stored(page);
  assert.equal(state.reviews.length, 5); assert.equal(state.proposals.length, 6);
  assert.equal(state.reviews.filter(r => r.criteriaVersion === 5).length, 3);
  for (const e of prior.slice(0, 2)) {
    assert.deepEqual(state.reviews.find(r => r.id === e.review.id), e.review);
    const expectedSource=structuredClone(e.proposal);
    for(const part of expectedSource.parts)for(const layout of part.layouts)if(layout.adaptation)layout.adaptation.version=LAYOUT_CONTEXT_VERSION;
    assert.deepEqual(state.proposals.find(p => p.id === e.proposal.id), expectedSource);
  }
  assert.equal(state.reviews.some(r => r.id === prior[2].review.id), false);
  await page.getByRole('button', { name: prior[0].review.title + ' 평가 열기', exact: true }).click();
  await page.locator('.rv-radar').first().waitFor();
  assert.equal(await page.locator('.rv-radar').count(), 5);
  assert.equal(await page.locator('.rv-radar-target').count(), 26);
  assert.equal(await page.locator('.rv-slide-card').count(), prior[0].doc.units.length);
  await page.getByRole('button', { name: '이렇게 읽었어요', exact: true }).hover();
  await page.getByText('이전 5개 영역·26개 기준으로 만든 평가입니다. 기존 점수와 당시 기준을 보존하며, 다시 평가하면 새 기준을 적용합니다.', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.reload(); await page.locator('.rv-radar').first().waitFor();
  assert.equal((await stored(page)).reviews.length, 5);
  pass('v2 upgrade replaces only unchanged defaults, retains edited review/source pairs and displays their original 5/26 rubric and scores');
  await upgraded.close();
  const oldV3=read('app/web/src/domain/review/linked-review-examples-v3.json').examples;
  const retained=structuredClone(oldV3);retained[0].review.title+=' 직접 수정';
  const v3Context=await contextFor({'winmate.v2.reviews':retained.map(e=>e.review),'winmate.v2.proposals':retained.map(e=>e.proposal),'winmate.v2.reviews.seedv':'admin-linked-review-examples-3'});
  await open(v3Context);state=await stored(page);
  assert.equal(state.reviews.length,4);assert.equal(state.reviews.filter(r=>r.criteriaVersion===5).length,3);
  assert.deepEqual(state.reviews.find(r=>r.id===retained[0].review.id),retained[0].review);
  assert.equal(state.reviews.some(r=>r.id===retained[1].review.id),false);
  await page.getByRole('button',{name:retained[0].review.title+' 평가 열기',exact:true}).click();await page.locator('.rv-overview').waitFor();
  assert.equal(await page.locator('.rv-radar-target').count(),24);
  await page.getByRole('button',{name:'이렇게 읽었어요',exact:true}).hover();
  await page.getByText('이전 4개 영역·24개 기준으로 만든 평가입니다. 기존 점수와 당시 기준을 보존하며, 다시 평가하면 새 기준을 적용합니다.',{exact:true}).waitFor();
  pass('The immediately preceding v3 defaults are replaced once; edited v3 scores and their original 1/2/3 scoring explanation remain intact');
  await v3Context.close();
  const oldV4=read('app/web/src/domain/review/linked-review-examples-v4.json').examples;
  const preserveV4=structuredClone(oldV4);preserveV4[0].review.title+=' 수정한 v4';preserveV4[1].proposal.title+=' 수정한 원본';
  const v4Context=await contextFor({'winmate.v2.reviews':preserveV4.map(e=>e.review),'winmate.v2.proposals':preserveV4.map(e=>e.proposal),'winmate.v2.reviews.seedv':'admin-linked-review-examples-4'});
  await open(v4Context);state=await stored(page);assert.equal(state.reviews.length,5);assert.equal(state.reviews.filter(r=>r.criteriaVersion===5).length,3);
  for(const old of preserveV4.slice(0,2))assert.deepEqual(state.reviews.find(r=>r.id===old.review.id),old.review);
  assert.equal(state.reviews.some(r=>r.id===preserveV4[2].review.id),false);
  await page.getByRole('button',{name:preserveV4[0].review.title+' 평가 열기',exact:true}).click();await page.locator('.rv-overview').waitFor();
  await page.getByRole('button',{name:'검토 점수 기준 보기',exact:true}).click();
  const oldInfo=page.getByRole('dialog',{name:'검토 점수 기준',exact:true});await oldInfo.waitFor();
  assert.ok((await oldInfo.innerText()).includes('6.25점'));assert.ok(!(await oldInfo.innerText()).includes('제안에 충분'));
  pass('v4 default scores are refreshed to v5 without overwriting edited v4 records, sources or their original linear scale');
  await v4Context.close();
  const member = await contextFor({}, false); await open(member);
  state = await stored(page); assert.equal(state.reviews.length, 0); assert.equal(state.proposals.length, 0);
  pass('Other accounts receive no example data');
  assert.equal(modelRequests, 0); assert.deepEqual(errors, []);
  pass('Viewing and migrating saved examples makes zero model requests and produces no browser errors');
} catch (error) {
  await page?.screenshot({ animations: 'disabled', path: path.join(out, 'failure.png') }).catch(() => {}); throw error;
} finally {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ passed, errors, modelRequests }, null, 2));
  await browser?.close(); await vite.close();
}
