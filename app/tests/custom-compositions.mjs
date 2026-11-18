// 직접 만든 파트 · 구성 (관리자 「레이아웃 구성 관리」 → 구성 추가하기, 사용자 지시 2026-11-16)
//   운영 값의 parts · templates 를 applyTocPresets 가 목차 템플릿 위에 올린다 — 추천 · 전체 구성 · 덱 조립에 바로 쓰인다.
//   node --test app/tests/custom-compositions.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { build } = require('esbuild');
const entry = `export * from './domain/templates/toc_templates.js';
export * as CC from './domain/templates/custom_compositions.js';
export * as LOOK from './domain/templates/part_looks.js';
export { SC } from './domain/templates/scenarios.js';
export { FILLS } from './domain/templates/scenario_fills.js';`;
const built = await build({ stdin: { contents: entry, resolveDir: fileURLToPath(new URL('../web/src/', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' }, logLevel: 'error' });
const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
await M.loadTocContent();
const V = 'fb_qsr';
const isDiv = (f) => /^L_VS_DIV_R\d$/.test(f);

const PART = { name: '매장 운영', color: '#0f7a72', icon: 'pi-store', type: 'scenario', sheets: [{ f: 'L_SS_FB_B', label: '대표 공간 장면' }, { f: 'L_PH_MS_A', label: '핵심 수치 4 · 현장 히어로' }] };
const presets = (extra = {}) => ({
  rev: 3,
  parts: { cp_store01: PART },
  templates: { ct_mine01: { name: '매장 운영형 제안서', badge: '운영 중심', desc: '매장 운영 파트를 앞에 둔 구성', tocs: ['overview', 'cp_store01', 'space', 'why', 'pspec'] } },
  ...extra,
});

test('팔레트 · 아이콘 에셋 — 54색 모두 흰 아이콘과 3:1 이상 · 아이콘은 한 줄 path · 키가 겹치지 않는다', () => {
  assert.equal(M.LOOK.PART_COLORS.length, 54);
  assert.equal(new Set(M.LOOK.PART_COLORS.map((c) => c.hex)).size, 54);
  for (const c of M.LOOK.PART_COLORS) assert.ok(M.LOOK.whiteContrast(c.hex) >= 3, c.name + ' ' + c.hex);
  const ids = M.LOOK.PART_ICON_GROUPS.flatMap((g) => g.icons.map((x) => x[0]));
  assert.ok(ids.length >= 60, '아이콘 ' + ids.length);
  assert.equal(new Set(ids).size, ids.length);
  for (const [id, label, d] of M.LOOK.PART_ICON_GROUPS.flatMap((g) => g.icons)) { assert.match(id, /^pi-[a-z0-9-]+$/); assert.ok(label); assert.match(d, /^M[\d.\s\-MLHVCSQTAZmlhvcsqtaz,]+$/, id); }
  assert.deepEqual(M.LOOK.lookStyle({ color: '#0f7a72' }), { '--hc': '#0f7a72', '--hb': M.LOOK.tint('#0f7a72', 0.88) });
});

test('구성 규칙 — Spec 맨 끝 · 4개 이상 · 7개까지(구독 솔루션이 있으면 8) · 같은 파트 두 번 없음 · 모르는 파트 없음', () => {
  const P = (t) => M.CC.compositionProblems(t, (k) => !!M.TOCS[k]).map((x) => x.code);
  assert.deepEqual(P(['overview', 'needs', 'why', 'pspec']), []);
  assert.deepEqual(P(['overview', 'needs', 'pspec']), ['min']);
  assert.deepEqual(P(['overview', 'needs', 'why', 'case']), []); // Spec 은 넣지 않아도 된다(2026-11-16)
  assert.deepEqual(P(['overview', 'pspec', 'needs', 'why']), ['spec']);
  assert.deepEqual(P(['overview', 'needs', 'needs', 'pspec']), ['dup']);
  assert.deepEqual(P(['overview', 'nope', 'why', 'pspec']), ['unknown']);
  assert.deepEqual(P(['overview', 'ua', 'needs', 'space', 'value', 'sol', 'case', 'pspec']), ['max']);
  assert.deepEqual(P(['overview', 'ua', 'needs', 'space', 'subx', 'sol', 'case', 'pspec']), []);
  assert.equal(M.CC.deckWord('매장 운영형 제안서'), '매장 운영형 제안');
  assert.equal(M.CC.deckWord('공간 집중형'), '공간 집중형 제안');
});

test('직접 만든 구성 — 추천 목록에 올라가고(코드 구성 뒤) 파트는 목차로 · 순서 · 끄기 · 기본 구성도 같은 규칙', () => {
  try {
    M.applyTocPresets(presets());
    const ids = M.TOC_TEMPLATES.map((t) => t.id);
    assert.equal(ids[ids.length - 1], 'stdsub'); // 자동 변형은 늘 맨 뒤
    assert.equal(ids[ids.length - 2], 'ct_mine01'); // 순서를 정하지 않으면 코드 구성 뒤
    const T = M.TPL.ct_mine01;
    assert.equal(T.custom, true); assert.equal(T.name, '매장 운영형 제안서'); assert.equal(T.deck, '매장 운영형 제안');
    assert.equal(M.templateHint(T), '매장 운영 파트를 앞에 둔 구성'); // 맞는 상황을 쓰지 않으면 설명
    assert.equal(M.TOCS.cp_store01.custom, true);
    assert.equal(M.TOCS.cp_store01.type, 'scenario');
    assert.deepEqual(M.TOCS.cp_store01.look, { color: '#0f7a72', icon: 'pi-store' });
    assert.equal(M.tocName('cp_store01', 'QSR'), '매장 운영');
    // 순서 · 끄기 · 기본 구성
    M.applyTocPresets(presets({ order: ['ct_mine01', 'std'], fixed: 'ct_mine01' }));
    assert.equal(M.TOC_TEMPLATES[0].id, 'ct_mine01');
    assert.equal(M.tocPresetState().fixed, 'ct_mine01');
    M.applyTocPresets(presets({ items: { ct_mine01: { enabled: false } } }));
    assert.equal(M.TPL.ct_mine01.off, true);
  } finally { M.applyTocPresets(null); }
  assert.equal(M.TPL.ct_mine01, undefined); // 운영 값에서 빠지면 레지스트리에서도 빠진다
  assert.equal(M.TOCS.cp_store01, undefined);
  assert.equal(M.TOC_TEMPLATES.some((t) => t.custom), false);
});

test('직접 만든 구성의 덱 — 표지 · 목차 + 파트마다 간지 · 직접 만든 파트는 간지 다음에 고른 레이아웃을 그 순서대로', () => {
  try {
    M.applyTocPresets(presets());
    const s = M.ensureTocScenario('ct_mine01', V);
    assert.ok(s, '덱');
    assert.equal(s.id, 'toc_ct_mine01__' + V);
    const body = s.flow.filter((g) => !g.deck);
    assert.equal(body.length, 5);
    assert.match(body[1].name, /^02 매장 운영$/);
    const fs = body[1].slides.map((x) => x.f);
    assert.ok(isDiv(fs[0]), '간지 ' + fs[0]);
    assert.deepEqual(fs.slice(1), ['L_SS_FB_B', 'L_PH_MS_A']);
    assert.equal(body[1].key, 'space'); // Storyboard 단계 — 고른 레이아웃의 유형(scenario → 공간)
    assert.match(s.title, /매장 운영형 제안서/);
    // 배지는 없앤 값(2026-11-16) — 예전 값이 남아 있어도 구성에 올리지 않는다 · 표지 둘째 줄은 앞 파트 이름 셋(Spec 빼고)
    assert.equal('badge' in M.TPL.ct_mine01, false);
    assert.equal(M.TOC_TEMPLATES.some((t) => 'badge' in t), false);
    assert.equal(M.FILLS[s.id][0].t[4], 'Overview · 매장 운영 · 공간별 제안');
    assert.ok(!/undefined/.test([s.thesis, ...s.messages].join(' ')), s.thesis);
    // 목차 장 — 다섯 칸
    assert.equal(s.flow[0].slides[1].f, 'L_TOC_INDEX5');
    // 정의를 바꾸면 조립해 둔 덱을 버리고 새로 조립한다
    M.applyTocPresets(presets({ parts: { cp_store01: { ...PART, sheets: [{ f: 'L_PH_MS_A', label: '핵심 수치 4 · 현장 히어로' }] } } }));
    const s2 = M.ensureTocScenario('ct_mine01', V);
    assert.notEqual(s2, s);
    assert.deepEqual(s2.flow.filter((g) => !g.deck)[1].slides.map((x) => x.f).slice(1), ['L_PH_MS_A']);
    // 요구사항에 구독이 있으면 구독 솔루션이 더해진다(Spec 앞)
    const sub = M.ensureTocScenario('ct_mine01', V, { addons: ['sub'] });
    assert.deepEqual(sub.flow.filter((g) => !g.deck).map((g) => g.name.replace(/^\d{2} /, '')).slice(-2), ['Why Samsung', 'Spec']);
    assert.ok(sub.flow.some((g) => /구독 솔루션/.test(g.name)));
  } finally { M.applyTocPresets(null); }
});

test('규칙에 맞지 않는 구성 · 모르는 파트를 쓰는 구성 · 형식이 틀린 파트는 건너뛴다', () => {
  try {
    M.applyTocPresets({
      parts: { cp_empty1: { name: '빈 파트', sheets: [] }, BAD: PART, cp_store01: { ...PART, color: '#123456', icon: 'nope' } },
      templates: {
        ct_short1: { name: '짧은', tocs: ['overview', 'why', 'pspec'] },
        ct_specx1: { name: '스펙 중간', tocs: ['overview', 'pspec', 'needs', 'why'] },
        ct_ghost1: { name: '없는 파트', tocs: ['overview', 'cp_empty1', 'why', 'needs', 'pspec'] },
        std: { name: '덮어쓰기', tocs: ['overview', 'needs', 'why', 'pspec'] },
        ct_ok0001: { name: '맞는 구성', tocs: ['cp_store01', 'needs', 'why', 'pspec'] },
      },
    });
    assert.deepEqual(M.TOC_TEMPLATES.filter((t) => t.custom).map((t) => t.id), ['ct_ok0001']);
    assert.equal(M.TPL.std.custom, undefined);
    assert.equal(M.TOCS.BAD, undefined);
    assert.equal(M.TOCS.cp_empty1, undefined);
    assert.deepEqual(M.TOCS.cp_store01.look, { color: M.LOOK.DEFAULT_PART_COLOR, icon: M.LOOK.DEFAULT_PART_ICON }); // 팔레트 · 에셋에 없는 값은 기본값
  } finally { M.applyTocPresets(null); }
});
