// 원문 매칭(domain/proposals/match-extract.js) — 요구사항 원문에 글로 적힌 제품 · 솔루션 · 공간을 매칭에 넣는 규칙.
// 모델 없이 순수 함수만 검사한다: 모델 코드는 코드로 찾음(그대로 · 접미 · 가까운 모델) · 코드 옆 '공간 + 수량' 목록 · 원문에 없는 표현은 버림 ·
// 중복 없음 · 이미 코드로 연결된 제품의 종류 이름은 따로 연결하지 않음 · 비슷한 후보는 키워드 검색 · 후보에 없는 답은 버림 ·
// 원문의 공간은 모두 남김(업종 공간으로 잇거나 원문 이름 그대로) · 공간-제품 관계는 공간 구성 모양으로 · 사람이 해 둔 것은 바꾸지 않음.
// node app/tests/match-extract.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const X = await import('../web/src/domain/proposals/match-extract.js');
const D = await import('../web/src/domain/proposals/space-plan.js');
const read = (name) => JSON.parse(fs.readFileSync(new URL('../data/' + name, import.meta.url), 'utf8'));
const catalog = read('catalog.json'), pdb = read('products_db.json');
for (const p of catalog.products) Object.assign(p, pdb.curated[p.id] || {}, { cur: true });
const products = [...catalog.products, ...pdb.products].filter((p) => !p.deprecated && !p.supersededBy);
const index = X.catalogIndex({ products, solutions: catalog.solutions });
const tax = D.indexTaxonomy(read('vertical_space_product.json'));
const verticalIds = tax.verticals.map((v) => v.id);
const checks = []; const pass = (s) => { checks.push(s); console.log('PASS ' + s); };
const P = (id) => index.byId.get(id);

// ---------- 원문 ----------
{
  const { head, body } = X.extractText([
    { id: 'customer', label: '고객사', kind: 'context', text: 'A 커피' }, { id: 'industry', label: '업종', kind: 'context', text: 'FB' },
    { id: 'free', label: '자유형식 요구사항', kind: 'customer', text: '로비에 QM55C를 둔다.' }, { id: 'file-1', label: 'RFP.docx · 이어지는 원문', kind: 'attachment', text: '회의실 전자칠판' },
  ]);
  assert.equal(head, '고객사: A 커피'); assert.ok(body.includes('[자유형식 요구사항]\n로비에 QM55C를 둔다.') && body.includes('[RFP.docx · 이어지는 원문]\n회의실 전자칠판'));
  const long = Array.from({ length: 400 }, (_, i) => '문단 ' + i + ' ' + '가'.repeat(90)).join('\n');
  const { chunks, cut } = X.chunkText(long, 12000, 6);
  assert.ok(chunks.length > 1 && chunks.length <= 6 && chunks.every((c) => c.length <= 12000) && !cut);
  assert.equal(chunks.join('\n'), long, 'nothing is lost between pieces');
  assert.ok(chunks.every((c) => c.startsWith('문단 ')), 'pieces break at paragraph ends');
  const tight = X.chunkText(long, 3000, 2);
  assert.equal(tight.chunks.length, 2); assert.equal(tight.cut, true);
  assert.deepEqual(X.chunkText('   \n ').chunks, []);
  assert.equal(X.chunkText('가'.repeat(25000), 12000, 6).chunks.length, 3, 'a single very long line is split too');
  pass('the original text keeps its sources apart and long text is cut at paragraph ends (a cut tail is reported)');
}

// ---------- 0. 모델 코드: 모델에게 맡기지 않고 코드로 찾는다 ----------
// 제안 메모 — 종류 이름 아래에 '모델 코드 + 공간 + 수량'이 나열된 글(들여쓰기 · 빈 줄이 많다)
const MEMO = `[자유형식 요구사항]
파트너사 한빛이엔지에 에어드레서와 공청기를 제안하려고 합니다.- 파트너사 개요


  .사무실 총 면적은 60평 규모로 대표실(5평), 실장실(5평), 회의실(5평), 탕비실(5평), 직원근무공간(40평)으로 구성


- 제안 품목


  .에어드레서 : 점심 식사 이후 외투에 밴 음식 냄새를 처리하고
                      외부 거래선 미팅시 정갈한 인상을 줄 수 있는 솔루션 제시
                      DF90H24R4B 탕비실 1대,  DF18CB8700CRA1 대표실 1대
  .공기청정기 : 겨울철 난방과 외기 온도 하락으로 자연 환기 어려운 환경으로
                      공기청정기를 통한 실내 공기 관리 필요
                      AP90H03193EGD 대표실 1대,실장실용 1대,


                      AP90H10163EDD 직원사무실 1대`;
const memoCodes = X.findModelCodes(MEMO, index);
{
  const how = (k) => { const r = X.matchCode(k, index); return r ? [r.how, r.id] : null; };
  assert.deepEqual(how('QM55C'), ['exact', 'qm55c']); assert.deepEqual(how('LH55QMCEBGCXKR'), ['exact', 'qm55c']); assert.deepEqual(how('AP90H03193EGD'), ['exact', 'sg_g000184122']);
  assert.deepEqual(how('OH55A'), ['short', 'oh55a'], 'only the front of the model is written');
  assert.deepEqual(how('DF18CB8700CRA1'), ['suffix', 'sg_g000182163'], 'a colour · region suffix after the catalog model');
  assert.equal(P('sg_g000182163').model, 'DF18CB8700CR');
  assert.deepEqual(how('DF90H24R4B'), ['near', 'ec_360_059'], 'not in the catalog — the nearest model of the same series');
  assert.ok(P('ec_360_059').models.includes('DF90H24R5C'));
  for (const k of ['B2B', 'ISO9001', 'IP65', 'USB3', 'H264', 'RS232', 'HDMI2', 'WINDOWS11', 'COVID19', 'FY26', '1Q26', 'TV55', 'TAB10', 'AB12CD34EF', 'S24']) assert.equal(how(k), null, k + ' is no model');
  assert.deepEqual(memoCodes.map((c) => [c.code, c.how, c.id]), [['DF90H24R4B', 'near', 'ec_360_059'], ['DF18CB8700CRA1', 'suffix', 'sg_g000182163'], ['AP90H03193EGD', 'exact', 'sg_g000184122'], ['AP90H10163EDD', 'exact', 'sg_g000184124']]);
  assert.ok(memoCodes.every((c) => MEMO.slice(c.at, c.end) === c.code));
  assert.deepEqual(X.findModelCodes('B2B 영업, 5 STAR 파트너, ISO9001 인증, IP65 등급, 4K UHD 60Hz, USB3 포트, 2023년 Wi-Fi6 Windows11 A4 용지 24시간 3D 5G', index), [], 'ordinary words with digits are not models');
  assert.deepEqual(X.findModelCodes('QM55C 2대와 qm55c, https://www.samsung.com/sec/business/smart-signage/qmc-series/LH65QMCEBGCXKR/ , SM-X930', index).map((c) => [c.code, c.id]),
    [['QM55C', 'qm55c'], ['LH65QMCEBGCXKR', 'qm55c'], ['SM-X930', 'tabs11']], 'each code once, also inside a link');
  for (const [name, id] of Object.entries({ 'QM55C 사이니지': 'qm55c', '사이니지 qm55c': 'qm55c', 'WM75B': 'flip', 'DVM S2': 'dvms2', 'KM24C 키오스크': 'kiosk' })) assert.equal(X.exactProduct(name, index), id, name);
  for (const name of ['키오스크', '전자칠판', '4K 사이니지', '55인치 사이니지', '사이니지', '시스템 에어컨', 'A4 프린터']) assert.equal(X.exactProduct(name, index), null, name + ' names a kind, not a model');
  assert.ok([...index.models.keys()].every((k) => !/^[가-힣]+$/.test(k)), 'no model is a plain Korean word');
  pass('model codes in the text are found by code: as written, with a suffix, or the nearest model of the series — never an ordinary word');

  // 코드 옆에 '공간 + 수량'이 나란히 적힌 목록
  const near = (code, known = []) => X.codeSpaces(MEMO, memoCodes.find((c) => c.code === code), memoCodes, known);
  assert.deepEqual(near('DF90H24R4B'), { names: ['탕비실'], listed: true }, 'up to the next code on the line');
  assert.deepEqual(near('DF18CB8700CRA1'), { names: ['대표실'], listed: true });
  assert.deepEqual(near('AP90H03193EGD'), { names: ['대표실', '실장실'], listed: true }, '실장실용 1대 → 실장실');
  assert.deepEqual(near('AP90H10163EDD'), { names: ['직원사무실'], listed: true });
  assert.deepEqual(near('AP90H10163EDD', ['직원근무공간']), { names: ['직원근무공간'], listed: true }, 'a place already known under another name keeps that name');
  const prose = '대표실에는 AP90H03193EGD를, 직원사무실에는 AP90H10163EDD를 둡니다. QM55C 사이니지 2대도 필요합니다.';
  const pc = X.findModelCodes(prose, index);
  assert.deepEqual(pc.map((c) => X.codeSpaces(prose, c, pc, ['대표실', '직원사무실'])), [{ names: ['대표실'], listed: false }, { names: ['직원사무실'], listed: false }, { names: [], listed: false }],
    'in a sentence the place before the code is only a fallback, and 「사이니지 2대」 is not a place');
  pass('a list of 「code place quantity」 is read by code; a place with a particle or a product word is not taken for one');
}

// ---------- 1. 언급: 원문에 있는 것만 · 중복 없이 ----------
const TEXT = '[자유형식 요구사항]\n본사 1층 로비에 더 월을 설치하고, 회의실마다 전자칠판을 두고 싶습니다. 로비 안내에는 QM55C 사이니지도 씁니다.\n콘텐츠는 매직인포로 원격 관리하고, 직원 휴게실에는 공기청정기가 필요합니다. @스마트 사이니지 QM65C 도 검토 중입니다.';
{
  assert.equal(X.checkMentions({ vertical: 'nope', products: [], solutions: [], spaces: [] }, verticalIds), true, 'no space → the vertical is not needed');
  assert.notEqual(X.checkMentions({ vertical: 'nope', products: [], solutions: [], spaces: ['로비'] }, verticalIds), true);
  assert.notEqual(X.checkMentions({ vertical: '', products: [{ name: 'a', spaces: ['로비'] }], solutions: [], spaces: [] }, verticalIds), true);
  assert.equal(X.checkMentions({ vertical: 'of_hq', products: [], solutions: [], spaces: ['로비'] }, verticalIds), true);
  assert.notEqual(X.checkMentions({ vertical: 'of_hq', products: 'x' }, verticalIds), true);
  const m = X.cleanMentions([
    { vertical: 'of_hq', products: [
      { name: '더 월', alias: ['The Wall', 'LED 사이니지', '더 월', 'a', 'b', 'c'], spaces: ['1층 로비'] },
      { name: '전자칠판', alias: [], spaces: ['회의실'] },
      { name: 'QM55C 사이니지', alias: [], spaces: ['로비'] },
      { name: '@스마트 사이니지 QM65C', alias: [], spaces: [] },
      { name: '키오스크', alias: [], spaces: ['로비'] },          // 원문에 없는 제품
      { name: '공기청정기', alias: [], spaces: ['직원 휴게실', '옥상 정원'] }, // 옥상 정원은 원문에 없다
      { name: '더월', alias: ['마이크로 LED'], spaces: [] },        // 같은 표현(띄어쓰기만 다름)
    ], solutions: [{ name: '매직인포', alias: ['MagicINFO'] }, { name: 'VXT', alias: [] }, { name: '전자칠판', alias: [] }], spaces: ['1층 로비', '회의실', '로비', '주차장', '본사'] },
    { vertical: 'fb_qsr', products: [{ name: '전자칠판', alias: ['Flip'], spaces: [] }], solutions: [], spaces: ['회의실'] },
    null,
  ], TEXT, { verticalIds });
  assert.equal(m.vertical, 'of_hq', 'the first piece that names a real vertical wins');
  assert.deepEqual(m.products.map((x) => x.name), ['더 월', '전자칠판', 'QM55C 사이니지', '스마트 사이니지 QM65C', '공기청정기']);
  assert.deepEqual(m.products[0].alias, ['The Wall', 'LED 사이니지', '마이크로 LED'], 'alias: no copy of the name, at most three');
  assert.deepEqual(m.products[1].alias, ['Flip'], 'the same expression from another piece adds to the one mention');
  assert.deepEqual(m.solutions.map((x) => x.name), ['매직인포'], 'not in the text (VXT) · already a product (전자칠판) → dropped');
  assert.deepEqual(m.spaces.map((x) => x.name), ['1층 로비', '회의실', '로비', '직원 휴게실'], 'not in the text (주차장) · the whole site (본사) → no space');
  const sp = Object.fromEntries(m.spaces.map((x) => [x.name, x.key]));
  assert.deepEqual(m.products[0].spaces, [sp['1층 로비']]); assert.deepEqual(m.products[4].spaces, [sp['직원 휴게실']]);
  assert.deepEqual(new Set([...m.products, ...m.solutions, ...m.spaces].map((x) => x.key)).size, 10, 'every mention has its own key');
  assert.equal(X.mentionCount(m), 10);
  const none = X.cleanMentions([{ vertical: 'of_hq', products: [{ name: '사이니지' }], solutions: [], spaces: ['로비'] }], '매장 운영을 효율화하고 싶습니다.', { verticalIds });
  assert.equal(X.mentionCount(none), 0, 'nothing in the text → nothing is made up');
  assert.equal(X.mentionCount(X.cleanMentions([], TEXT)), 0);
  const wish = '본사에서 한 번에 가격과 메뉴를 바꾸는 구조가 필요하고 CMS도 봅니다. 응대 품질을 높이고 싶습니다.';
  const w = X.cleanMentions([{ products: [{ name: '냉장고', alias: [], spaces: [] }], solutions: [{ name: '본사에서 한 번에 가격과 메뉴를 바꾸는 구조', alias: ['콘텐츠 배포'] }, { name: '응대 품질을 높이고', alias: [] }, { name: 'CMS', alias: [] }], spaces: [] }], wish + ' 냉장고', {});
  assert.deepEqual(w.solutions.map((x) => x.name), ['CMS'], 'a sentence about what is wanted is not the name of a solution');
  assert.deepEqual(w.products.map((x) => x.name), ['냉장고']);
  const v = X.cleanMentions([{ products: [{ name: '단말기', alias: ['PDA'], spaces: [] }, { name: '기기', alias: [], spaces: [] }, { name: '안내 화면', alias: [], spaces: [] }], solutions: [{ name: '시스템', alias: [] }], spaces: [] }], '단말기와 기기, 안내 화면, 시스템', {});
  assert.deepEqual([v.products.map((x) => x.name), v.solutions], [['안내 화면'], []], 'a word that names nothing in particular (단말기 · 기기 · 시스템) is not a mention');
  // 같은 곳을 다르게 부른 공간은 하나 · 사업장 전체를 가리키는 말은 공간이 아니다
  for (const [a, b, same] of [['직원근무공간', '직원사무실', true], ['회의실', '미팅룸', true], ['회의 실', '회의실', true], ['대회의실', '소회의실', false], ['휴게실', '탕비실', false], ['대표실', '실장실', false], ['로비', '1층 로비', false]]) assert.equal(X.sameSpace(a, b), same, a + ' ~ ' + b);
  const s = X.cleanMentions([{ vertical: 'of_sme', products: [{ name: '공기청정기', alias: [], spaces: ['직원사무실', '사무실'] }], solutions: [], spaces: ['대표실', '실장실', '직원근무공간', '직원사무실', '매장', '사무실'] }], '사무실은 대표실, 실장실, 직원근무공간. 매장. 직원사무실에 공기청정기', { verticalIds });
  assert.deepEqual(s.spaces.map((x) => x.name), ['대표실', '실장실', '직원근무공간'], 'two names of one place → the first one; 매장 · 사무실 are the whole site');
  assert.deepEqual(s.products[0].spaces, [s.spaces[2].key], 'the product follows the merged name');
  pass('mentions: only expressions that are in the text, each once, with the product → space relation the text states');
}

// ---------- 2. 카탈로그 ----------
{
  for (const [name, id] of Object.entries({ 'MagicINFO': 'magicinfo', 'magicinfo': 'magicinfo', 'VXT': 'vxt', 'Samsung VXT': 'vxt', 'SmartThings Pro': 'stpro', 'Knox Suite': 'knoxsuite' })) assert.equal(X.exactSolution(name, index), id, name);
  for (const name of ['CMS', '원격 관리', '관제']) assert.equal(X.exactSolution(name, index), null, name);
  const cand = (name, alias = []) => X.productCandidates({ name, alias }, index).map((c) => c.id);
  assert.ok(cand('전자칠판').includes('flip') && cand('전자칠판').length <= X.CANDIDATES, 'the representative product of the kind is a candidate');
  assert.equal(cand('키오스크')[0], 'kiosk');
  assert.ok(cand('55인치 사이니지').slice(0, 3).includes('qm55c'), '55인치 → 55');
  assert.ok(cand('더 월', ['The Wall', 'LED 사이니지']).includes('thewall'), 'another spelling finds it');
  assert.ok(cand('공기청정기').includes('purifier')); assert.ok(cand('호텔 TV').includes('hoteltv')); assert.ok(cand('노트북').includes('book'));
  assert.ok(cand('시스템 에어컨').some((id) => ['dvms2', 'wf1way', 'wf4way', 'ac360'].includes(id)));
  assert.ok(cand('전자 칠판').length > 0 || cand('전자칠판 보드').includes('flip'), 'not the exact keyword, still found');
  assert.deepEqual(cand('zzqq 없는물건'), []);
  assert.ok(X.productCandidates({ name: '리빙가전', alias: [] }, index).length > 0, 'the kind (분류) finds products for the expression itself');
  assert.deepEqual(cand('zzqq 없는물건', ['리빙가전']), [], 'another spelling counts only when it is in a product\'s own name or model');
  for (const name of ['전자칠판', '사이니지', '에어컨']) assert.equal(new Set(cand(name)).size, cand(name).length, 'no candidate twice');
  pass('similar products are found by keyword search (kind · size · another spelling), representative products first');

  const hq = D.spacePool(tax, 'of_hq'), qsr = D.spacePool(tax, 'fb_qsr');
  const nameOf = (pool, id) => (pool.find((s) => s.id === id) || {}).name;
  assert.equal(nameOf(hq, X.exactSpace('로비', hq)), '로비'); assert.equal(nameOf(hq, X.exactSpace('1층 로비', hq)), '로비');
  assert.equal(nameOf(hq, X.exactSpace('회의실', hq)), '회의실', 'the same name (a space of the same group) beats a longer name');
  assert.equal(nameOf(qsr, X.exactSpace('주방', qsr)), '주방(BOH)'); assert.equal(nameOf(qsr, X.exactSpace('매장 입구', qsr)), '매장 입구·쇼윈도');
  assert.ok(/카운터/.test(nameOf(qsr, X.exactSpace('카운터', qsr))));
  for (const name of ['휴게실', '공간', '옥상 정원', '실장실', 'x']) assert.equal(X.exactSpace(name, qsr), null, name);
  assert.equal(X.exactSpace('업무 공간', hq) && nameOf(hq, X.exactSpace('업무 공간', hq)), '업무 공간'); assert.equal(X.exactSpace('공간', hq), null, 'a vague word alone matches nothing');
  assert.equal(X.exactSpace('로비', []), null);
  for (const [a, b] of [['직원 휴게실', '직원 라운지·탕비실'], ['휴게실', '라운지'], ['미팅룸', '소회의실·포커스룸'], ['프런트 로비', '로비·프런트'], ['구내 식당', '급식실'], ['출입구', '로비·안내'], ['직원사무실', '업무 공간'], ['직원근무공간', '업무 공간']]) assert.equal(X.spaceAkin(a, b), true, a + ' ~ ' + b);
  for (const [a, b] of [['창고 출입구', '피킹·출고'], ['드라이브스루', '카운터·메뉴보드'], ['매장', '카운터·메뉴보드'], ['옥상 정원', '기계실'], ['주차장', '로비'], ['실장실', '대표실']]) assert.equal(X.spaceAkin(a, b), false, a + ' !~ ' + b);
  pass('a space matches by its name or by a name with a qualifier; a vague word or an unrelated place does not');
}

// ---------- 연결: 바로 되는 것 · 물을 것 · 답 걸러내기 ----------
const mentions = X.cleanMentions([{ vertical: 'of_hq', products: [
  { name: '더 월', alias: ['The Wall'], spaces: ['1층 로비'] }, { name: '전자칠판', alias: ['디지털 사이니지'], spaces: ['회의실'] }, { name: 'QM55C 사이니지', alias: [], spaces: ['로비'] },
  { name: '@스마트 사이니지 QM65C', alias: [], spaces: [] }, { name: '공기청정기', alias: [], spaces: ['직원 휴게실'] }, { name: '매직인포', alias: [], spaces: [] },
], solutions: [{ name: '원격 관리', alias: [] }], spaces: ['1층 로비', '회의실', '로비', '직원 휴게실'] }], TEXT, { verticalIds });
X.withCodes(mentions, X.findModelCodes(TEXT, index), TEXT);
const pool = D.spacePool(tax, 'of_hq');
const key = (kind, name) => mentions[kind].find((x) => x.name === name).key;
{
  assert.equal(mentions.products.length, 6, 'the codes in the text (QM55C · QM65C) belong to expressions the model already wrote');
  const tagged = new Map([['스마트사이니지qm65c', 'product:qm65c']]);
  const { done, ask, covered } = X.planResolve(mentions, index, pool, tagged);
  assert.deepEqual(done.products.get(key('products', 'QM55C 사이니지')), ['qm55c']);
  assert.deepEqual(done.products.get(key('products', '스마트 사이니지 QM65C')), ['qm65c'], 'a tagged item is that item');
  assert.equal(covered.size, 0, '전자칠판 · 더 월 are other things than the 사이니지 written by code — even when the model\'s alias says 「디지털 사이니지」');
  assert.deepEqual(ask.products.map((q) => q.name), ['더 월', '전자칠판', '공기청정기']);
  assert.ok(ask.products.every((q) => q.candidates.length > 0 && q.candidates.length <= X.CANDIDATES));
  assert.deepEqual(ask.solutions.map((q) => q.name), ['매직인포', '원격 관리'], 'written as a product but no product is like it → asked as a solution');
  assert.equal(done.spaces.get(key('spaces', '1층 로비')), done.spaces.get(key('spaces', '로비')), 'two expressions, one space');
  assert.ok(done.spaces.has(key('spaces', '회의실'))); assert.deepEqual(ask.spaces.map((q) => q.name), ['직원 휴게실']);
  assert.equal(X.askCount(ask), 6);
  const lounge = pool.find((s) => /라운지/.test(s.name) && !s.aux);
  const picks = X.cleanPicks({
    products: [
      { key: key('products', '더 월'), ids: ['thewall', 'thewall', 'nope'] },
      { key: key('products', '전자칠판'), ids: ['flip'] },
      { key: key('products', '공기청정기'), ids: ['qm55c'] },                 // 그 표현의 후보가 아니다
      { key: key('products', '매직인포'), ids: ['qm55c'] },                   // 제품으로는 묻지 않았다
      { key: key('products', 'QM55C 사이니지'), ids: ['qm43c'] },              // 묻지 않은 표현
    ],
    solutions: [{ key: key('solutions', '원격 관리'), id: 'magicinfo' }, { key: key('products', '매직인포'), id: 'magicinfo' }, { key: 'S99', id: 'vxt' }, { key: key('solutions', '원격 관리'), id: 'nope' }],
    spaces: [{ key: key('spaces', '직원 휴게실'), id: lounge.id }, { key: key('spaces', '로비'), id: 'zzz' }],
  }, ask, index, pool);
  assert.deepEqual(picks.products.get(key('products', '더 월')), ['thewall']); assert.deepEqual(picks.products.get(key('products', '전자칠판')), ['flip']);
  assert.equal(picks.products.has(key('products', '공기청정기')), false); assert.equal(picks.products.has(key('products', 'QM55C 사이니지')), false);
  assert.deepEqual(new Map(picks.solutions), new Map([[key('solutions', '원격 관리'), 'magicinfo'], [key('products', '매직인포'), 'magicinfo']])); assert.deepEqual([...picks.spaces], [[key('spaces', '직원 휴게실'), lounge.id]]);
  assert.equal(X.checkPicks({ products: [], solutions: [], spaces: [] }), true); assert.notEqual(X.checkPicks({ products: {} }), true);
  const many = X.cleanPicks({ products: [{ key: ask.products[1].key, ids: ask.products[1].candidates.map((c) => c.id) }] }, ask, index, pool);
  assert.equal(many.products.get(ask.products[1].key).length, X.MAX_PICKS); assert.equal(X.MAX_PICKS, 1, 'one product per expression');
  // 밑줄 · 대소문자만 다르게 적은 id는 같은 id로 읽는다
  const loose = X.cleanPicks({ products: [{ key: key('products', '더 월'), name: '더 월', ids: ['The_Wall'] }], solutions: [{ key: key('solutions', '원격 관리'), name: '원격 관리', id: 'Magic-Info' }], spaces: [] }, ask, index, pool);
  assert.deepEqual(loose.products.get(key('products', '더 월')), ['thewall']); assert.equal(loose.solutions.get(key('solutions', '원격 관리')), 'magicinfo');
  // 모델이 고른 공간이라도 이름이 낱말로 닿지 않으면 받지 않는다(억지 연결)
  const off = pool.find((s) => /기계실/.test(s.name));
  assert.equal(X.cleanPicks({ spaces: [{ key: key('spaces', '직원 휴게실'), name: '직원 휴게실', id: off.id }] }, ask, index, pool).spaces.size, 0);
  // 모델이 key를 옆 표현과 바꿔 적어도, 함께 적은 표현(name)으로 제자리를 찾는다
  const swapped = X.cleanPicks({ products: [{ key: key('products', '공기청정기'), name: '전자칠판', ids: ['flip'] }, { key: key('products', '전자칠판'), name: '공기청정기', ids: ['purifier'] }], solutions: [], spaces: [] }, ask, index, pool);
  assert.deepEqual(swapped.products.get(key('products', '전자칠판')), ['flip']); assert.deepEqual(swapped.products.get(key('products', '공기청정기')), ['purifier']);

  const r = X.resolveResult(mentions, done, picks, pool, covered);
  assert.deepEqual(r.products, ['thewall', 'flip', 'qm55c', 'qm65c']); assert.deepEqual(r.solutions, ['magicinfo']);
  assert.deepEqual(r.missed, { products: ['공기청정기'], solutions: [] }); assert.deepEqual(r.near, []);
  assert.deepEqual(r.spaces.map((s) => [s.name, s.base, s.products]), [['1층 로비', '로비', ['thewall', 'qm55c']], ['회의실', '회의실', ['flip']], ['직원 휴게실', lounge.name, []]],
    'spaces carry the name the text uses; two expressions of one space are one; a space is kept even when its product could not be linked');
  // 고르기를 못 했을 때(모델 실패): 바로 연결된 것만 — 공간은 원문 이름 그대로 남는다
  const bare = X.resolveResult(mentions, done, null, pool, covered);
  assert.deepEqual(bare.products, ['qm55c', 'qm65c']); assert.deepEqual(bare.solutions, []);
  assert.deepEqual(bare.spaces.map((s) => [s.id, s.name, s.base]), [[done.spaces.get(key('spaces', '로비')), '1층 로비', '로비'], [done.spaces.get(key('spaces', '회의실')), '회의실', '회의실'], ['custom-space-직원휴게실', '직원 휴게실', '']]);
  assert.equal(X.customSpaceId('직원 휴게실'), 'custom-space-직원휴게실', 'the same prefix as a space typed in the 공간 구성 popup');
  // 제품으로 적혔지만 이름이 솔루션인 표현 · 솔루션으로 적혔지만 모델명인 표현
  const cross = X.cleanMentions([{ products: [{ name: 'MagicINFO', alias: [], spaces: [] }], solutions: [{ name: 'QM55C', alias: [] }], spaces: [] }], 'MagicINFO 와 QM55C', {});
  const cr = X.planResolve(cross, index, [], new Map());
  assert.deepEqual(X.resolveResult(cross, cr.done, null, [], cr.covered), { products: ['qm55c'], solutions: ['magicinfo'], spaces: [], missed: { products: [], solutions: [] }, near: [] });
  pass('linking: model codes and tags at once, the rest only from the answer\'s own candidates; one item is linked once; no space is lost');
}

// ---------- 제안 메모: 모델이 코드를 종류 이름 둘에 뭉쳐 적어도 모델마다 · 공간마다 ----------
{
  const sme = D.spacePool(tax, 'of_sme');
  // 실제로 받았던 답 — 코드 넷을 '에어드레서' · '공기청정기' 두 표현의 alias로 뭉치고, 공간도 둘을 합쳐 적었다
  const merged = { vertical: 'of_sme', products: [
    { name: '에어드레서', alias: ['DF90H24R4B', 'DF18CB8700CRA1'], spaces: ['탕비실', '대표실'] },
    { name: '공기청정기', alias: ['AP90H03193EGD', 'AP90H10163EDD'], spaces: ['대표실', '실장실', '직원사무실'] },
    { name: '공청기', alias: ['공기청정기'], spaces: [] },
  ], solutions: [], spaces: ['탕비실', '대표실', '실장실', '직원사무실'] };
  // 지시를 따른 답 — 코드마다 따로, 종류 이름은 alias에. '실장실용 1대'는 빠뜨렸다
  const perCode = { vertical: 'of_sme', products: [
    { name: 'DF90H24R4B', alias: ['에어드레서'], spaces: ['탕비실'] }, { name: 'DF18CB8700CRA1', alias: ['에어드레서'], spaces: ['대표실'] },
    { name: 'AP90H03193EGD', alias: ['공기청정기'], spaces: ['대표실'] }, { name: 'AP90H10163EDD', alias: ['공기청정기'], spaces: ['직원근무공간'] },
    { name: '공청기', alias: [], spaces: [] },
  ], solutions: [], spaces: ['대표실', '실장실', '회의실', '탕비실', '직원근무공간', '직원사무실'] };
  const run = (answer, pick) => {
    const m = X.withCodes(X.cleanMentions([answer], MEMO, { verticalIds }), memoCodes, MEMO);
    const { done, ask, covered } = X.planResolve(m, index, sme, new Map());
    const picks = pick ? X.cleanPicks(pick(ask), ask, index, sme) : null;
    return { m, ask, covered, r: X.resolveResult(m, done, picks, sme, covered) };
  };
  const want = ['ec_360_059', 'sg_g000182163', 'sg_g000184122', 'sg_g000184124'];
  const placed = (r) => Object.fromEntries(r.spaces.map((s) => [s.name, s.products]));
  for (const [label, answer] of [['merged', merged], ['per code', perCode]]) {
    const { ask, covered, r } = run(answer, (q) => ({ products: [], solutions: [], spaces: q.spaces.map((x) => ({ key: x.key, name: x.name, id: /직원/.test(x.name) ? 'of_sm_s2' : 'of_sm_s5' })) }));
    assert.deepEqual(r.products, want, label + ': the four models, each once — not one representative per kind');
    assert.deepEqual(ask.products, [], label + ': the kind names (에어드레서 · 공기청정기 · 공청기) are the models already linked'); assert.ok(label === 'per code' ? covered.size === 1 : covered.size === 3);
    const by = placed(r);
    assert.deepEqual(by['탕비실'], ['ec_360_059'], label); assert.deepEqual(by['대표실'], ['sg_g000182163', 'sg_g000184122'], label);
    assert.deepEqual(by['실장실'], ['sg_g000184122'], label + ': 실장실용 1대 — read from the list even when the model left it out');
    assert.equal(r.spaces.find((s) => s.name === '실장실').id, 'custom-space-실장실', label + ': no such space in the industry data, and 대표실 is not it → kept under its own name');
    const staff = r.spaces.find((s) => /^직원/.test(s.name));
    assert.deepEqual([staff.id, staff.base, staff.products], ['of_sm_s2', '업무 공간', ['sg_g000184124']], label);
    assert.equal(r.spaces.filter((s) => /^직원/.test(s.name)).length, 1, label + ': 직원근무공간 and 직원사무실 are one space');
    assert.deepEqual(r.near, [{ name: 'DF90H24R4B', id: 'ec_360_059' }], label);
  }
  assert.deepEqual(run(perCode, null).r.spaces.map((s) => s.name), ['대표실', '실장실', '회의실', '탕비실', '직원근무공간'], 'every space the text lists, in its order — also the one without a product (회의실)');
  // 모델이 아무것도 답하지 못해도(빈 답) 코드와 그 옆의 공간은 남는다
  const alone = run({ vertical: null, products: [], solutions: [], spaces: [] }, null).r;
  assert.deepEqual(alone.products, want);
  assert.deepEqual(placed(alone), { '탕비실': ['ec_360_059'], '대표실': ['sg_g000182163', 'sg_g000184122'], '실장실': ['sg_g000184122'], '직원사무실': ['sg_g000184124'] });
  // 종류 이름의 공간은, 공간을 적지 않은 코드 표현으로 넘어간다
  const t2 = '로비에 사이니지(QM55C)를 설치합니다.';
  const m2 = X.withCodes(X.cleanMentions([{ vertical: 'of_hq', products: [{ name: '사이니지', alias: [], spaces: ['로비'] }], solutions: [], spaces: ['로비'] }], t2, { verticalIds }), X.findModelCodes(t2, index), t2);
  const p2 = X.planResolve(m2, index, pool, new Map());
  assert.deepEqual(X.resolveResult(m2, p2.done, null, pool, p2.covered).spaces.map((s) => [s.name, s.products]), [['로비', ['qm55c']]]);
  pass('a memo that lists 「kind : code place quantity …」 gives every model and every space, however the model answered');
}

// ---------- 4. 적용 ----------
const V = { id: 'of_hq', name: '대기업 본사', group: 'OF' };
const result = { products: ['thewall', 'flip', 'qm55c', 'purifier'], solutions: ['magicinfo'], spaces: [
  { id: 'of_hq_s1', name: '1층 로비', base: '로비', products: ['thewall', 'qm55c'] }, { id: 'of_hq_s3', name: '회의실', base: '대회의실·이사회실', products: ['flip'] },
  { id: 'custom-space-실장실', name: '실장실', base: '', products: [] }], missed: {}, near: [] };
const blank = () => ({ ctx: { products: ['qm55c'], solutions: [], cases: ['1490'] }, parts: [] });
const kindOf = (n) => (/로비/.test(n) ? 'reception' : /회의/.test(n) ? 'meeting' : 'lounge');
{
  const d = blank();
  const added = X.applyExtract(d, result, { vertical: V, kindOf, now: 5 });
  assert.deepEqual(d.ctx.products, ['qm55c', 'thewall', 'flip', 'purifier'], 'already linked stays once, new ones follow'); assert.deepEqual(d.ctx.solutions, ['magicinfo']); assert.deepEqual(d.ctx.cases, ['1490']);
  assert.deepEqual(added, { products: ['thewall', 'flip', 'purifier'], solutions: ['magicinfo'], spaces: ['1층 로비', '회의실', '실장실'], placed: 3, removed: 0 });
  assert.equal(d.spacePlan.auto, true); assert.deepEqual(d.spacePlan.vertical, V); assert.equal(d.spacePlan.at, 5);
  assert.deepEqual(d.spacePlan.spaces.map((s) => [s.id, s.name, s.kind, s.products, s.color]), [['of_hq_s1', '1층 로비', 'reception', ['thewall', 'qm55c'], 0], ['of_hq_s3', '회의실', 'meeting', ['flip'], 1], ['custom-space-실장실', '실장실', 'lounge', [], 2]],
    'spaces keep the text\'s names; the kind comes from the industry space; a space without a product is there too');
  const g = D.planGroups(d.spacePlan, d.ctx.products);
  assert.deepEqual(g.groups.map((x) => x.products.length), [2, 1, 0]); assert.deepEqual(g.rest, ['purifier'], 'a product the text ties to no space stays outside the spaces');
  assert.deepEqual(new Set(d.matchExtract.refs), new Set(['product:thewall', 'product:flip', 'product:qm55c', 'product:purifier', 'solution:magicinfo']));
  assert.equal(d.matchExtract.v, X.EXTRACT_VERSION);
  assert.equal(X.addedText(added), '원문에서 제품 3개 · 솔루션 1개 · 공간 3곳을 찾아 연결했어요');
  assert.equal(X.addedText({ products: ['a'], solutions: [], spaces: [], placed: 0 }), '원문에서 제품 1개를 찾아 연결했어요');
  assert.equal(X.addedText({ products: [], solutions: [], spaces: [], placed: 0 }), '');
  assert.equal(X.addedText({ products: ['a', 'b'], solutions: [], spaces: [], placed: 0, removed: 2 }), '원문에서 제품 2개를 찾아 연결했어요 · 예전에 넣은 2개는 뺐어요');

  // 사람이 뺀 항목은 다시 넣지 않는다 · 같은 결과를 다시 적용해도 그대로
  d.ctx.products = d.ctx.products.filter((id) => id !== 'flip'); d.ctx.solutions = [];
  const before = JSON.stringify([d.ctx, d.spacePlan.spaces]);
  const again = X.applyExtract(d, result, { vertical: V, now: 9 });
  assert.deepEqual([again.products, again.solutions, again.spaces, again.placed, again.removed], [[], [], [], 0, 0]);
  assert.equal(JSON.stringify([d.ctx, d.spacePlan.spaces]), before, 'unlinked by the person stays unlinked');
  // 원문이 바뀌어 새 제품 · 새 공간이 나오면 원문으로 만든 구성(auto)에 더한다
  const more = X.applyExtract(d, { products: ['kiosk', 'hoteltv'], solutions: [], spaces: [{ id: 'of_hq_s1', name: '로비', base: '로비', products: ['kiosk'] }, { id: 'of_hq_s7', name: '구내식당', base: '구내식당', products: ['hoteltv'] }, { id: 'custom-space-옥상정원', name: '옥상 정원', base: '', products: [] }] }, { vertical: V, now: 11 });
  assert.deepEqual([more.products, more.spaces, more.placed], [['kiosk', 'hoteltv'], ['구내식당', '옥상 정원'], 2]);
  assert.deepEqual(d.spacePlan.spaces.find((s) => s.id === 'of_hq_s1').products, ['thewall', 'qm55c', 'kiosk']); assert.equal(d.spacePlan.spaces.find((s) => s.id === 'of_hq_s1').name, '1층 로비', 'a space already there keeps its name');
  assert.deepEqual(d.spacePlan.spaces.map((s) => s.id), ['of_hq_s1', 'of_hq_s3', 'custom-space-실장실', 'of_hq_s7', 'custom-space-옥상정원']);
  assert.deepEqual(d.spacePlan.spaces.map((s) => s.color), [0, 1, 2, 3, 4], 'the colours of the spaces already there do not change');
  pass('applied like a saved 공간 구성: products grouped by the space the text names, the rest unplaced; nothing the person removed comes back');
}
{
  // 사람이 저장한 공간 구성(auto 아님): 공간은 그대로, 이번에 새로 연결한 제품만 원문이 말한 공간에
  const d = blank();
  d.spacePlan = { v: 1, vertical: V, title: '직접 만든 구성', summary: '', at: 1, spaces: [{ id: 'of_hq_s1', name: '로비', kind: 'reception', note: '', color: 4, products: [] }, { id: 'of_hq_s5', name: '업무 공간', kind: 'office', note: '', color: 2, products: ['qm55c'] }] };
  const added = X.applyExtract(d, result, { vertical: V, now: 7 });
  assert.deepEqual(d.spacePlan.spaces.map((s) => [s.id, s.name, s.products, s.color]), [['of_hq_s1', '로비', ['thewall'], 4], ['of_hq_s5', '업무 공간', ['qm55c'], 2]], 'the product the person placed elsewhere (qm55c) is not moved; no space is added or renamed');
  assert.equal(d.spacePlan.auto, undefined); assert.equal(d.spacePlan.title, '직접 만든 구성'); assert.deepEqual([added.spaces, added.placed], [[], 1]);
  assert.equal(X.planVertical(d), 'of_hq'); assert.equal(X.planVertical(blank()), null);
}
{
  // 공간 수는 최대 6 — 제품이 있는 공간 먼저, 순서는 원문 순서
  const d = blank();
  const spaces = Array.from({ length: 9 }, (_, i) => ({ id: 's' + i, name: '공간 ' + i, base: '', products: [1, 3, 4].includes(i) ? [] : ['thewall'] }));
  X.applyExtract(d, { products: ['thewall'], solutions: [], spaces }, { vertical: V });
  assert.deepEqual(d.spacePlan.spaces.map((s) => s.id), ['s0', 's2', 's5', 's6', 's7', 's8']); assert.equal(D.MAX_SPACES, 6);
  const few = blank();
  X.applyExtract(few, { products: ['thewall'], solutions: [], spaces: spaces.slice(0, 5) }, { vertical: V });
  assert.deepEqual(few.spacePlan.spaces.map((s) => s.id), ['s0', 's1', 's2', 's3', 's4'], 'within the limit, spaces without a product stay too');
  // 연결된 제품이 하나도 없으면 공간 구성을 만들지 않는다 (언급 없는 요구사항에 나온 '로비' 한 마디로 구성이 생기지 않는다)
  const n = { ctx: { products: [], solutions: [], cases: [] }, parts: [] };
  X.applyExtract(n, { products: [], solutions: ['magicinfo'], spaces: [{ id: 'of_hq_s1', name: '로비', base: '로비', products: [] }] }, { vertical: V });
  assert.equal(n.spacePlan, undefined); assert.deepEqual(n.ctx.solutions, ['magicinfo']);
  // 업종을 알 수 없으면 공간 구성은 만들지 않는다(제품 · 솔루션만)
  const e = blank();
  const a = X.applyExtract(e, result, { vertical: null });
  assert.equal(e.spacePlan, undefined); assert.deepEqual(a.spaces, []); assert.equal(e.ctx.products.length, 4);
  // 찾은 것이 없으면 아무것도 바뀌지 않는다
  const f = blank();
  X.applyExtract(f, { products: [], solutions: [], spaces: [] }, { vertical: V });
  assert.deepEqual(f.ctx, blank().ctx); assert.equal(f.spacePlan, undefined);
  pass('a plan made by a person keeps its spaces; at most six spaces; no linked product, no vertical or nothing found → no space plan');
}
{
  // 예전 판(v1)이 넣은 결과 → 새 판으로 다시 읽으면 바꿔 넣는다: 예전 판만 넣은 제품은 빼고, 원문으로 만든 구성은 새로 만든다
  const old = () => ({ ctx: { products: ['kiosk', 'sg_g000182178', 'sg_g000184126'], solutions: [], cases: [] }, parts: [],
    matchExtract: { v: 1, sourceKey: 'k', status: 'done', refs: ['product:sg_g000182178', 'product:sg_g000184126'] },
    spacePlan: { v: 1, auto: true, vertical: { id: 'of_sme', name: '중소기업 오피스', group: 'OF' }, title: '원문에서 찾은 공간', summary: '', at: 1, birdseye: { status: 'done', historyId: 'h' },
      spaces: [{ id: 'of_sm_s5', name: '대표실', kind: 'lounge', note: '', color: 0, products: ['sg_g000182178', 'sg_g000184126'] }, { id: 'of_sm_s2', name: '업무 공간', kind: 'office', note: '', color: 2, products: ['sg_g000184126'] }] } });
  const next = { products: ['ec_360_059', 'sg_g000182163', 'sg_g000184122', 'sg_g000184124'], solutions: [], near: [], missed: {}, spaces: [
    { id: 'of_sm_s5', name: '대표실', base: '대표실', products: ['sg_g000182163', 'sg_g000184122'] }, { id: 'custom-space-실장실', name: '실장실', base: '', products: ['sg_g000184122'] },
    { id: 'of_sm_s3', name: '회의실', base: '회의실', products: [] }, { id: 'of_sm_s4', name: '탕비실', base: '탕비실', products: ['ec_360_059'] }, { id: 'of_sm_s2', name: '직원근무공간', base: '업무 공간', products: ['sg_g000184124'] }] };
  const SME = { id: 'of_sme', name: '중소기업 오피스', group: 'OF' };
  const d = old();
  assert.equal(X.planVertical(d), null, 'a plan the old version made does not pin the vertical');
  const added = X.applyExtract(d, next, { vertical: SME, kindOf, now: 3 });
  assert.deepEqual(d.ctx.products, ['kiosk', 'ec_360_059', 'sg_g000182163', 'sg_g000184122', 'sg_g000184124'], 'what the person linked (kiosk) stays; the two items only the old version put in are gone');
  assert.equal(added.removed, 2); assert.equal(added.products.length, 4);
  assert.deepEqual(d.spacePlan.spaces.map((s) => [s.name, s.products, s.color]), [['대표실', ['sg_g000182163', 'sg_g000184122'], 0], ['실장실', ['sg_g000184122'], 1], ['회의실', [], 3], ['탕비실', ['ec_360_059'], 4], ['직원근무공간', ['sg_g000184124'], 2]],
    'the space plan is made anew from this reading (spaces that stay keep their colour)');
  assert.deepEqual(d.spacePlan.birdseye, { status: 'done', historyId: 'h' }); assert.equal(d.matchExtract.v, X.EXTRACT_VERSION);
  assert.deepEqual(new Set(d.matchExtract.refs), new Set(next.products.map((id) => 'product:' + id)));
  assert.equal(X.planVertical(d), 'of_sme');
  // 이번 결과가 온전하지 않으면(모델 실패 · 원문 일부만 읽음) 바꿔 넣지 않고 더하기만 한다 — 판도 그대로
  const half = old();
  const b = X.applyExtract(half, { ...next, products: ['sg_g000184122'], spaces: [] }, { vertical: SME, complete: false });
  assert.deepEqual(half.ctx.products, ['kiosk', 'sg_g000182178', 'sg_g000184126', 'sg_g000184122']); assert.equal(b.removed, 0); assert.equal(half.matchExtract.v, 1);
  // 사람이 저장한 구성은 판이 바뀌어도 새로 만들지 않는다
  const mine = old(); delete mine.spacePlan.auto;
  X.applyExtract(mine, next, { vertical: SME });
  assert.deepEqual(mine.spacePlan.spaces.map((s) => s.name), ['대표실', '업무 공간']);
  pass('a result of the older rules is replaced on the next reading: its own items go, the person\'s stay, the text-made space plan is rebuilt');
}
console.log('\n' + checks.length + ' checks passed');
