// 목차 템플릿 — 표준 제안서는 업종 표준 제안서(bs_std_<업종>) 그대로, 나머지 템플릿 × 업종은 조립한다:
// 표준 제안서와 이름이 같은 목차는 그 업종 표준 제안서의 장을 그대로 옮겨 쓰고(장 번호 · 쪽만 바뀜),
// 표준에 없는 목차는 L_TOC_* 장 + 같은 간지(L_VS_DIV_R*). 덱은 표지 + 목차(숨은 목차)로 연다.
// 같은 목차 이름이면 어느 템플릿에서든 같은 장, 공간별 가치 제안은 그 장면에서 쓰는 기능만 켠다, 쪽 번호 · 간지 쪽 · 눈썹 번호가 맞다.
// 제품 제안서: 제품 하나 + 관련 솔루션으로 Value Prop 3 → 가치마다 상세 장(하나 이상) → 유관사례 → Spec.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { build } = require('esbuild');
const entry = `export * from './domain/templates/toc_templates.js';
export { SC, slidesOfScenario } from './domain/templates/scenarios.js';
export { FILLS } from './domain/templates/scenario_fills.js';
export { STORY } from './domain/templates/scenario_story.js';
export { TOC_META, TOC_SLOTS } from './domain/templates/toc_layouts.js';
export { default as FEATURE_LABEL } from './domain/templates/feature_labels.json';`;
const built = await build({ stdin: { contents: entry, resolveDir: fileURLToPath(new URL('../web/src/', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' }, logLevel: 'error' });
const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
await M.loadTocContent();

const pad = (n) => String(n).padStart(2, '0');
const isDiv = (f) => /^L_VS_DIV_R\d$/.test(f);
const SERVICE = /^L_VS_SOL_SVC/; // 표준 제안서 솔루션 파트 안의 서비스 장(삼성케어플러스 SAC · 비즈니스)
// 표준에 없는 목차 — 간지 다음 장들의 레이아웃
const FAMILY = {
  // value: 고객/공간 시나리오(2026-11-17) — 표준 조감도 + 활용 맵(공간 2–10곳) + 공간별 시나리오(공간 3곳 · 2곳 장)
  당사의이해: /^L_TOC_(UAPROF|UAPAIN|TRLINE|TRSHARE|TRSTAT|TRKEY|CPSCORE|CPWIN|CPPOS)$/, tech: /^L_TOC_TECH[1-4]$/, value: /^L_(VS_BIRD_[SB]\d+|TOC_SCN_S[23]|TOC_SCN_MAP([2-9]|10))$/,
  summary: /^L_TOC_SUMMARY$/, effect: /^L_TOC_KPI$/, cost: /^L_TOC_TCO$/, pilot: /^L_TOC_PILOT$/, plan: /^L_TOC_ROADMAP$/, rfp: /^L_TOC_RFP$/, spec: /^L_TOC_SPEC$/, bom: /^L_TOC_BOM[3-8]$/,
  vp: /^L_TOC_VP3$/, vpd: /^L_(VS_SPACE|VS_SOL_[A-Z]+|TOC_PFEAT|TOC_JOURNEY[123]S)$/, pcase: /^L_VS_CASE$/, pspec: /^L_TOC_PSPEC$/,
  svc: /^L_(TOC_SVC_(SAC|MOBILE)|SUB_(PAIN|VALUE3|COMPARE|PKG[34]|CARE4|BLUEPASS|TERMS|PAY3))$/, // 서비스 제안 — 삼성케어플러스 + 구독 갈래(2026-11-17)
  // 구독(B2B 삼성 AI 구독) 목차 — L_SUB_*(subs_layouts.js)
  subs: /^L_SUB_(PAIN|VALUE3|COMPARE)$/, subpkg: /^L_SUB_(PKG[34]|ITEMS)$/, subcare: /^L_SUB_(CARE4|BLUEPASS|CAREOPT)$/, subterm: /^L_SUB_(TERMS|PAY3|PROMO|FLOW)$/, subone: /^L_SUB_ONE$/,
  subsol: /^L_SUB_(VALUE3|PKG[34]|PAY3|PROMO)$/, // (은퇴) 요구사항에 따라 더하던 '구독 솔루션 제안'
  subx: /^L_SUB_(PAIN|VALUE3|COMPARE|PKG[34]|CARE4|BLUEPASS|TERMS|PAY3)$/, // 구독 솔루션 — 구독을 한 파트로
};
FAMILY.ua = FAMILY['당사의이해'];
// 조립하는 구성 — 지금 구성(표준 제안서 빼고) + 은퇴한 구성(이미 만든 제안서가 다시 열릴 때 조립한다)
const composed = () => [...M.TOC_TEMPLATES, ...M.RETIRED_TEMPLATES].filter((t) => t.id !== 'std');
// 전체 파트 목록(관리자 「전체 파트 확인하기」)에 있는 파트 — 추천 구성은 이 파트만 쓴다(사용자 지시 2026-11-16)
const LIST_PARTS = ['overview', 'ua', 'needs', 'space', 'value', 'sol', 'case', 'why', 'pcase', 'pspec', 'subx', 'svc']; // svc: 서비스(2026-11-16)

test('구성 11종(기본 제안 · 상세 제안 + 이전 구성 8 + 자동 변형 1) · 은퇴 5종 — 전체 파트 목록의 파트만 · 모든 구성의 끝은 Spec(고정) · 표준 제안서도 표준 장을 옮겨 조립', () => {
  assert.deepEqual(M.TOC_TEMPLATES.map((t) => t.id), ['basic', 'detail', 'std', 'stdx', 'space', 'spacex', 'pain', 'build', 'prod', 'subs', 'stdsub']);
  // 기본 제안 · 상세 제안 (사용자 지시 2026-11-16)
  // 2026-11-17: 구독 상품 제안은 서비스 제안의 갈래 · 상세 제안은 제품 · 솔루션 · 서비스 제안 대신 고객/공간 시나리오
  assert.deepEqual(M.TPL.basic.tocs, ['overview', 'needs', 'space', 'sol', 'svc', 'case', 'pspec']);
  assert.deepEqual(M.TPL.detail.tocs, ['overview', 'ua', 'needs', 'value', 'case', 'why', 'pspec']);
  assert.deepEqual([M.TPL.basic.name, M.TPL.detail.name], ['기본 제안', '상세 제안']);
  assert.notEqual(M.templateHint(M.TPL.basic), M.templateHint(M.TPL.detail), '추천 모델이 둘을 가릴 수 있게 맞는 상황 문구가 다르다');
  assert.ok(M.canBeFixedTemplate(M.TPL.basic) && M.canBeFixedTemplate(M.TPL.detail));
  assert.deepEqual(M.TOC_TEMPLATES.filter((t) => t.base).map((t) => t.id), ['stdsub']);
  // 은퇴 — 목록에서 뺀 목차가 뼈대인 구성. 목록에는 없고(TOC_TEMPLATES) 이미 만든 제안서를 위해 찾을 수만 있다(TPL)
  assert.deepEqual(M.RETIRED_TEMPLATES.map((t) => t.id), ['roi', 'compete', 'rfp', 'roisub', 'subsl']);
  for (const t of M.RETIRED_TEMPLATES) { assert.equal(M.TPL[t.id], t); assert.ok(t.retired && t.off, t.id); assert.ok(!M.TOC_TEMPLATES.includes(t), t.id); }
  assert.equal(Object.keys(M.TPL).length, 16);
  // 지금 구성은 전체 파트 목록의 파트만 쓴다 · 파트 4개 이상(목차 장이 4칸부터) · 같은 파트를 두 번 쓰지 않는다 · Spec 은 맨 마지막에만
  for (const t of M.TOC_TEMPLATES) {
    for (const k of t.tocs) assert.ok(LIST_PARTS.includes(k), `${t.id} uses ${k}`);
    assert.ok(t.tocs.length >= 4 && t.tocs.length <= 10, t.id); assert.equal(new Set(t.tocs).size, t.tocs.length, t.id); // 목차 장이 4–10칸
    assert.equal(t.tocs[t.tocs.length - 1], 'pspec', t.id + ' 모든 구성의 끝은 Spec'); assert.equal(t.tocs.indexOf('pspec'), t.tocs.length - 1, t.id);
    assert.equal(M.specLast(t.tocs), t.tocs, t.id);
    // 구독 요구가 있어 구독 솔루션 파트를 더해도 Spec 은 맨 마지막 · 구독 파트는 하나 — 서비스 제안이 있는 구성은 그 파트의 구독 갈래로(따로 더하지 않음)
    const plus = M.withAddons(t.tocs, ['sub']);
    const holds = t.tocs.includes('svc') || t.tocs.includes('value'); // 서비스 제안의 구독 갈래 · 고객/공간 시나리오의 서비스 줄이 구독을 담는다
    assert.equal(plus.filter((k) => k === 'subx').length, holds ? 0 : 1, t.id); assert.equal(plus[plus.length - 1], 'pspec', t.id + ' + 구독');
    if (holds) assert.deepEqual(plus, t.tocs, t.id + ' 구독 파트를 따로 더하지 않는다');
    assert.ok(plus.every((k) => LIST_PARTS.includes(k)), t.id);
  }
  assert.deepEqual(M.specLast(['needs', 'pspec', 'why']), ['needs', 'why', 'pspec']);
  assert.deepEqual(M.TPL.std.tocs, ['overview', 'needs', 'space', 'sol', 'case', 'why', 'pspec']); // 표준 제안서 순서 그대로 + Spec
  assert.deepEqual(M.TPL.stdx.tocs, ['ua', 'needs', 'space', 'sol', 'case', 'why', 'pspec']);
  assert.deepEqual(M.TPL.space.tocs, ['overview', 'value', 'sol', 'case', 'why', 'pspec']);
  for (const id of ['stdx', 'spacex']) {
    assert.equal(M.TPL[id].tocs[0], 'ua', id + ' replaces Overview with 당사의 이해');
    assert.deepEqual(M.TPL[id].tocs.slice(1), M.TPL[id === 'stdx' ? 'std' : 'space'].tocs.slice(1), id + ' keeps the rest');
  }
  assert.deepEqual(M.TPL.pain.tocs, ['ua', 'needs', 'value', 'case', 'why', 'pspec']);
  assert.deepEqual(M.TPL.build.tocs, ['space', 'sol', 'case', 'why', 'pspec']);
  assert.deepEqual(M.TPL.prod.tocs, ['needs', 'space', 'why', 'pspec']); // 표준 제안서에서 Overview · 업종 솔루션 · 도입사례만 뺀 것
  assert.deepEqual(M.TPL.prod.tocs, M.TPL.std.tocs.filter((k) => !['overview', 'sol', 'case'].includes(k)));
  assert.deepEqual(M.TPL.subs.tocs, ['overview', 'subx', 'space', 'case', 'why', 'pspec']);
  assert.deepEqual(M.TPL.stdsub.tocs, ['overview', 'needs', 'space', 'sol', 'subx', 'case', 'why', 'pspec'], '표준 + 구독 솔루션: 도입사례 앞 · Spec 은 끝');
  assert.deepEqual(M.withAddons(M.TPL.prod.tocs, ['sub']), ['needs', 'space', 'subx', 'why', 'pspec']);
  assert.deepEqual(M.TPL.roisub.tocs, ['summary', 'ua', 'tech', 'effect', 'cost', 'subsol', 'pilot', 'why'], '(은퇴) 투자 효과형 + 구독 솔루션');
  assert.equal(M.tocInTemplate('space', 'value'), true); assert.equal(M.tocInTemplate('space', 'tech'), false); // 다시 짠 구성의 옛 목차
  assert.equal(M.tocVerticals().length, 44);
  for (const v of M.tocVerticals()) {
    // 표준 제안서도 조립한다(Spec 이 붙어 업종 표준 제안서와 같은 덱이 아니다) — 표지는 업종 표준 제안서 그대로, 업종 표준 제안서는 샘플로 남는다
    const s = M.ensureTocScenario('std', v.id); assert.equal(s.id, 'toc_std__' + v.id); assert.ok(M.SC['bs_std_' + v.id], v.id + ' 샘플');
    assert.deepEqual(M.FILLS[s.id][0].t, M.FILLS['bs_std_' + v.id][0].t, v.id + ' 표지 그대로');
    assert.ok(v.ai.startsWith('AI ') && v.short, v.id + ' AI 업종 이름');
  }
  for (const t of M.TOC_TEMPLATES) for (const id of t.related) assert.ok(M.SC[id], `${t.id} related ${id}`);
});

test('every template × industry composes: 표지 · 목차 → 목차마다 간지 + 장, 쪽 · 번호가 맞다', () => {
  const layouts = new Set(M.TOC_META.map((l) => l.f));
  let n = 0;
  for (const t of composed()) {
    for (const v of M.tocVerticals()) {
      const s = M.ensureTocScenario(t.id, v.id); n++;
      assert.ok(s && M.SC[s.id] === s && !s.std, s && s.id);
      assert.equal(s.flow[0].deck, true);
      assert.deepEqual(s.flow[0].slides.map((x) => x.f), ['L_C01', 'L_TOC_INDEX' + Math.min(10, Math.max(4, t.tocs.length))]);
      assert.deepEqual(s.flow.slice(1).map((g) => g.name), t.tocs.map((k, i) => pad(i + 1) + ' ' + M.tocName(k, v.short)));
      const slides = M.slidesOfScenario(s); const fills = M.FILLS[s.id];
      assert.equal(fills.length, slides.length);
      fills.forEach((x, k) => {
        assert.equal(x.f, slides[k].f);
        if (x.f.startsWith('L_TOC_')) assert.ok(layouts.has(x.f), x.f);
        for (const im of Object.values(x.img || {})) assert.ok(im && im.src, `${s.id} #${k + 1} image`);
        for (const val of Object.values(x.t || {})) {
          if (typeof val !== 'string') continue;
          if (t.deck !== '표준 제안') assert.ok(!val.includes('표준 제안서'), `${s.id} #${k + 1} keeps the standard deck name: ${val}`);
          const m = /^CONFIDENTIAL · (\d+)$/.exec(val); if (m) assert.equal(+m[1], k + 1, `${s.id} #${k + 1} page number`);
        }
      });
      let k = 2;
      s.flow.slice(1).forEach((g, i) => {
        const first = k + 1; const last = k + g.slides.length;
        const div = fills[k];
        assert.ok(isDiv(div.f), `${s.id} ${g.name} opens with a divider`);
        assert.equal(div.t[1], `${pad(i + 1)} / ${pad(t.tocs.length)}`, `${s.id} ${g.name} chapter`);
        assert.equal(div.t[2], g.name.slice(3), `${s.id} divider title`);
        const rows = +div.f.slice(-1);
        for (let r = 0; r < rows; r++) {
          const [a, b = a] = String(div.t[7 + 3 * r]).split('–').map(Number);
          assert.ok(a > first && b <= last && a <= b, `${s.id} ${g.name} row ${r + 1} → ${div.t[7 + 3 * r]} within ${first}–${last}`);
        }
        for (let j = 1; j < g.slides.length; j++) {
          const eb = fills[k + j].t[0];
          if (typeof eb === 'string' && /^\d{2} · /.test(eb) && fills[k + j].f !== 'L_VS_END') assert.ok(eb.startsWith(pad(i + 1) + ' · '), `${s.id} #${k + j + 1} eyebrow ${eb}`);
        }
        k = last;
      });
    }
  }
  assert.equal(n, 15 * 44); // 표준 제안서를 뺀 지금 구성 10(자동 변형 포함) + 은퇴 5
});

test('같은 이름의 목차는 그 업종 표준 제안서의 장 그대로 · 나머지는 정해진 장', () => {
  for (const v of M.tocVerticals()) {
    const D = M.stdDeck(v.id);
    for (const t of composed()) {
      const s = M.ensureTocScenario(t.id, v.id);
      s.flow.slice(1).forEach((g, i) => {
        const key = t.tocs[i]; const std = M.TOCS[key].std;
        if (std) {
          const moved = key === 'sol' && t.tocs.includes('svc'); // 서비스 장은 서비스 파트로 옮겨 간다 — 간지는 남은 솔루션으로 다시 만든다
          const all = D.st[std].items.map((x) => x.f).filter((f) => f !== 'L_VS_TOC');
          const want = all.filter((f) => !(moved && SERVICE.test(f)));
          const got = g.slides.map((x) => x.f);
          if (want.length !== all.length) { assert.ok(isDiv(got[0]), s.id); assert.deepEqual(got.slice(1), want.slice(1), `${s.id} ${g.name} = 표준 장 − 서비스`); }
          else assert.deepEqual(got, want, `${s.id} ${g.name} = 표준 ${D.st[std].g.name}`);
        } else {
          for (const x of g.slides.slice(1)) assert.match(x.f, FAMILY[key], `${s.id} · ${g.name}`);
          assert.ok(g.slides.length >= 2);
        }
      });
      assert.ok(M.STORY[s.id] && Object.keys(M.STORY[s.id].parts).length === t.tocs.length, s.id + ' story parts');
    }
  }
});

test('고객/공간 시나리오: 표준 조감도 → 활용 맵(공간 수 시트) → 공간별 시나리오(공간 3곳씩 · 제품 컷 + 이름 겹쳐 보기 · 공간마다 시나리오 · 솔루션 · 서비스 구분 없는 고정 줄 · 기능 on/off + 이름) · 같은 사진 없음', () => {
  const C = M.tocContent();
  const body = (s, g0) => { const F = M.FILLS[s.id]; let k = 0; for (const g of s.flow) { if (g === g0) return g.slides.map((x, j) => ({ f: x.f, o: F[k + j] })); k += g.slides.length; } return null; };
  const T = (f, o, name) => o.t[M.TOC_SLOTS[f].t[name]];
  for (const v of M.tocVerticals()) {
    const V = C.v[v.id];
    const s = M.ensureTocScenario('detail', v.id);
    const no = String(M.TPL.detail.tocs.indexOf('value') + 1).padStart(2, '0');
    const part = body(s, s.flow.find((g) => / 공간별 가치 제안$/.test(g.name)));
    const fs = part.map((x) => x.f);
    assert.ok(isDiv(fs[0]) && /^L_VS_BIRD_/.test(fs[1]), v.id + ' 간지 · 조감도');
    const n = V.sp.length;
    // 활용 맵 — 공간 수에 맞는 시트(2–10곳), 줄은 여러 공간이 함께 쓰는 것부터 · 칸의 ●는 그 공간이 쓰는 것
    assert.equal(fs[2], 'L_TOC_SCN_MAP' + n, v.id + ' 공간 수 시트');
    const map = part[2].o;
    for (let j = 0; j < n; j++) { assert.equal(T(fs[2], map, 'cs' + j), V.sp[j].n); assert.equal(T(fs[2], map, 'cp' + j), `제품 ${V.sp[j].pr.length}`); }
    const counts = [];
    for (let r = 0; r < 8; r++) {
      const name = T(fs[2], map, 'rn' + r); if (!name) { assert.equal(T(fs[2], map, 'rt' + r), ''); continue; }
      const dots = Array.from({ length: n }, (_, j) => T(fs[2], map, `rc${r}_${j}`) === '●');
      assert.equal(T(fs[2], map, 'rt' + r), `${dots.filter(Boolean).length}곳`, v.id + ' ' + name);
      if (!/^그 밖에 \d+개$/.test(name)) counts.push(dots.filter(Boolean).length); // 넘치는 줄은 '그 밖에 N개' 한 줄(쓰는 공간 = 남은 줄을 합친 것)
      const id = Object.keys(C.sx).find((k) => C.sx[k][0] === name);
      if (id) V.sp.forEach((sp, j) => assert.equal(dots[j], sp.us.some((u) => u[0] === id), `${v.id} ${name} 공간 ${j + 1}`));
    }
    assert.deepEqual(counts, [...counts].sort((a, b) => b - a), v.id + ' 여러 공간이 함께 쓰는 것부터');
    // 공간별 시나리오(2차 · 3차 지시) — 공간 3곳씩(한 곳만 남지 않게) · 공간 사진 + 그 공간 제품 컷(컷마다 이름 겹쳐 씀) · 공간마다 시나리오 ·
    // 솔루션 · 서비스는 구분 없이 모든 장이 같은 줄, 쓰는 공간 표시 없음 · 기능은 이 장 공간의 것만 켬(선 아이콘 + 밑줄) + 기능 이름
    const sets = part.slice(3);
    const want = n === 4 ? [2, 2] : n === 7 ? [3, 2, 2] : n === 10 ? [3, 3, 2, 2] : Array.from({ length: Math.ceil(n / 3) }, (_, k) => Math.min(3, n - 3 * k));
    assert.deepEqual(sets.map((x) => x.f), want.map((m) => 'L_TOC_SCN_S' + m), v.id + ' 공간 ' + n);
    const LABEL = M.FEATURE_LABEL;
    let at = 0; let fixedRows = null;
    sets.forEach((x, k) => {
      const g = Array.from({ length: want[k] }, (_, i) => at + i); at += want[k];
      const S = M.TOC_SLOTS[x.f];
      assert.equal(x.o.t[0], `${no} · 공간별 가치 제안 · 공간별 시나리오 ${String(k + 1).padStart(2, '0')}`);
      for (const gone of ['sc', 'pl0', 'sn0', 'sw0', 'vn0', 'fi0_0']) assert.ok(!(gone in S.t) && !(gone in S.img), x.f + ' 옛 칸 ' + gone);
      g.forEach((i, j) => {
        const sp = V.sp[i];
        assert.equal(T(x.f, x.o, 'sp' + j), sp.n); assert.equal(T(x.f, x.o, `sp${j}n`), String(i + 1));
        assert.ok(T(x.f, x.o, 'sc' + j) && T(x.f, x.o, 'sc' + j) === sp.ss, `${v.id} 공간 ${i + 1} 시나리오`);
        const cuts = sp.pr.filter((p) => p[1]).slice(0, 3);
        assert.deepEqual([0, 1, 2].map((q) => x.o.img[S.img[`pc${j}_${q}`]].src).filter((u) => !/blank\.png$/.test(u)), cuts.map((p) => p[1]), `${v.id} 공간 ${i + 1} 제품 컷`);
        assert.deepEqual([0, 1, 2].map((q) => T(x.f, x.o, `pn${j}_${q}`)), [0, 1, 2].map((q) => (cuts[q] ? cuts[q][0] : '')), `${v.id} 공간 ${i + 1} 컷 위 제품 이름`);
      });
      const rows = Array.from({ length: 6 }, (_, r) => ({ name: T(x.f, x.o, 'un' + r),
        icons: Array.from({ length: 5 }, (_, q) => ({ src: x.o.img[S.img[`ui${r}_${q}`]].src, label: T(x.f, x.o, `ul${r}_${q}`) })) }));
      const names = rows.map((r) => r.name);
      if (fixedRows) assert.deepEqual(names, fixedRows, v.id + ' 솔루션 · 서비스 줄은 모든 장이 같다'); else fixedRows = names;
      const used = Object.keys(C.sx).filter((q) => V.sp.some((sp) => sp.us.some((u) => u[0] === q)));
      assert.equal(names.filter(Boolean).length, Math.min(6, used.length), v.id + ' 고른 솔루션 · 서비스 6줄까지');
      for (const r of rows) {
        for (const ic of r.icons) {
          const m = /\/icons\/(.+)\.line-(on|off)\.png$/.exec(ic.src);
          if (!m) { assert.ok(/blank\.png$/.test(ic.src) && ic.label === '', `${v.id} ${r.name} 빈 칸`); continue; }
          assert.equal(ic.label, LABEL[m[1]], `${v.id} ${r.name} ${m[1]} 기능 이름`);
        }
        const id = Object.keys(C.sx).find((q) => C.sx[q][0] === r.name); if (!id) continue;
        const here = g.filter((i) => V.sp[i].us.some((u) => u[0] === id));
        const lit = new Set(here.flatMap((i) => V.sp[i].us.find((u) => u[0] === id)[2]));
        for (const ic of r.icons) { const m = /\/icons\/(.+)\.line-(on|off)\.png$/.exec(ic.src); if (!m) continue; assert.equal(m[2] === 'on', lit.has(m[1]), `${v.id} ${r.name} ${m[1]}`); }
      }
    });
    assert.equal(at, n, v.id + ' 공간이 모두 한 번씩');
    // 이용자 여정 장은 쓰지 않는다 · 한 파트에 같은 사진 두 번 없음(제품 컷 · 아이콘 제외) — 간지 사진도
    assert.ok(!fs.some((f) => /^L_TOC_JOURNEY/.test(f)), v.id);
    const pics = part.flatMap((x) => Object.entries(x.o.img || {}).filter(([, im]) => im && im.src && im.fit !== 'contain').map(([, im]) => im.src));
    assert.equal(new Set(pics).size, pics.length, v.id + ' 사진 겹침: ' + pics.join(' '));
  }
});

test('같은 목차 이름은 어느 템플릿에서든 같은 장', () => {
  for (const v of ['ht_large', 'fb_qsr', 'sv_laundry']) {
    const seen = {};
    for (const t of M.TOC_TEMPLATES) {
      const s = M.ensureTocScenario(t.id, v);
      s.flow.filter((g) => g.key !== 'open').forEach((g) => {
        const name = g.name.replace(/^(목차 · )?\d{2}\s+/, '');
        if (name === '당사의 이해') return; // 고객사 · 트렌드 · 경쟁 장은 템플릿마다 고른다
        const fams = g.slides.map((x) => x.f).filter((f) => f !== 'L_VS_TOC' && !isDiv(f) && !SERVICE.test(f)).map((f) => f.replace(/\d+S?$/, '')); // 서비스 장은 서비스 파트가 있으면 그리로 옮긴다
        if (seen[name]) assert.deepEqual(fams, seen[name], `${v} ${t.id} ${name}`);
        else seen[name] = fams;
      });
    }
  }
});

test('제품 제안서: 표준 제안서에서 Overview · 업종 솔루션 · 도입사례만 뺀 것 — 3 Value Props → 공간별 제안 → Why Samsung → Spec', () => {
  for (const v of M.tocVerticals()) {
    const D = M.stdDeck(v.id);
    const s = M.ensureTocScenario('prod', v.id);
    const [gVp, gSpace, gWhy, gSpec] = s.flow.slice(1);
    assert.equal(s.flow.length, 5, v.id);
    assert.deepEqual(gVp.slides.map((x) => x.f), D.st.needs.items.map((x) => x.f), v.id + ' 3 Value Props = 표준 AI 업종 장');
    assert.deepEqual(gSpace.slides.map((x) => x.f), D.st.space.items.map((x) => x.f), v.id + ' 공간별 제안 = 표준 장');
    assert.deepEqual(gWhy.slides.map((x) => x.f), D.st.why.items.map((x) => x.f), v.id);
    assert.deepEqual(gSpec.slides.slice(1).map((x) => x.f), ['L_TOC_PSPEC'], v.id);
    assert.ok(!s.flow.some((g) => /유관사례|도입사례|솔루션$|Overview$/.test(g.name)), v.id);
    assert.equal(s.title, `${D.cust} · ${D.ai} 제품 제안서`, v.id + ' 덱 이름은 제품 하나에 묶지 않는다(여러 제품도 쓴다)');
  }
});

test('경쟁사 비교 장: 새 장 3종(점수표 · 차별점 · 포지셔닝) · 예시가 다 차고 점수 합이 맞다 · 표준 장 역할 번호도 새 번호', () => {
  const G = M.tocContent().g;
  for (const v of M.tocVerticals()) {
    const s = M.ensureTocScenario('compete', v.id); const fills = M.FILLS[s.id];
    const ua = s.flow.find((g) => g.name.endsWith('당사의 이해'));
    assert.deepEqual(ua.slides.slice(1).map((x) => x.f), ['L_TOC_CPSCORE', 'L_TOC_CPWIN', 'L_TOC_CPPOS'], v.id);
    const k0 = M.slidesOfScenario(s).findIndex((x) => x.f === 'L_TOC_CPSCORE');
    const [score, win, pos] = [fills[k0], fills[k0 + 1], fills[k0 + 2]];
    const S = M.TOC_SLOTS.L_TOC_CPSCORE.t; const cs = G[M.tocContent().v[v.id].g].cs;
    assert.equal(cs.rows.length, 5, v.id);
    const total = (i) => String(Math.round(cs.rows.reduce((a, r) => a + r[3][i], 0) / 25 * 100));
    assert.equal(score.t[S.st], total(0)); assert.equal(score.t[S.at], total(1)); assert.equal(score.t[S.bt], total(2));
    assert.ok(+score.t[S.st] > +score.t[S.at] && +score.t[S.st] > +score.t[S.bt], v.id + ' 삼성 점수가 가장 높다');
    for (const [name, i] of Object.entries(S)) if (!['logo', 'foot', 'conf', 'hc', 'tl', 'stu', 'atu', 'btu', 'hs', 'ha', 'hb'].includes(name)) assert.ok(score.t[i], `${v.id} score ${name}`);
    const W = M.TOC_SLOTS.L_TOC_CPWIN.t;
    for (let i = 0; i < 3; i++) assert.ok(win.t[W['v' + i]] && win.t[W['tt' + i]], `${v.id} win ${i}`);
    assert.equal(Object.keys(win.img).length, 3); assert.equal(Object.keys(pos.img).length, 4);
    for (const im of [...Object.values(score.img), ...Object.values(win.img), ...Object.values(pos.img)]) assert.ok(im.src && im.src !== '/assets/toc/icons/blank.png', v.id);
  }
  for (const t of M.TOC_TEMPLATES) for (const v of M.tocVerticals().slice(0, 6)) {
    const s = M.ensureTocScenario(t.id, v.id);
    for (const g of s.flow) { const m = /^(\d{2}) /.exec(g.name); if (!m) continue;
      for (const x of g.slides) { const r = /(?:^|· |— )(\d{2}) /.exec(x.role); if (r) assert.equal(r[1], m[1], `${s.id} ${g.name} · ${x.role}`); } }
  }
});

test('구독 솔루션 — 한 파트: 고민 → 효과 → 비교 → 제품 묶음 → 케어 1 → 케어 2 → 구독 조건 → 결제 · 숫자 00 · 같은 사진 없음', () => {
  const C = M.tocContent();
  assert.deepEqual(M.TPL.subs.tocs, ['overview', 'subx', 'space', 'case', 'why', 'pspec']);
  assert.deepEqual(M.TPL.subsl.tocs, ['subone', 'subpkg', 'subterm', 'why']); // 은퇴 — 한 장 요약이 빠지면 두 파트뿐이다
  assert.equal(M.ADDONS.sub.toc, 'subx');
  assert.equal(M.zeroText('3~6년 계약을 1년 단위로 · B2B · 6·12·36개월 · +1'), '00년 계약을 00년 단위로 · B2B · 00개월 · +00');
  const number = /(?<![A-Za-z\d])\d(?:[\d~·.,:–-]*\d)?(?![A-Za-z\d])/g;
  for (const v of M.tocVerticals()) {
    const V = C.v[v.id]; assert.ok(V.sub && V.sub.items.length >= 3 && V.sub.items.length <= 4, v.id + ' 구독 패키지 품목 3–4');
    for (const tid of ['subs', 'stdsub']) {
      const s = M.ensureTocScenario(tid, v.id); const fills = M.FILLS[s.id];
      const gi = s.flow.findIndex((g) => /구독 솔루션$/.test(g.name)); assert.ok(gi > 0, s.id);
      const k0 = s.flow.slice(0, gi).reduce((a, g) => a + g.slides.length, 0); const g = s.flow[gi]; const part = fills.slice(k0, k0 + g.slides.length);
      const pk = 'L_SUB_PKG' + (V.sub.items.length >= 4 ? 4 : 3);
      assert.deepEqual(part.map((x) => x.f), ['L_VS_DIV_R6', 'L_SUB_PAIN', 'L_SUB_VALUE3', 'L_SUB_COMPARE', pk, 'L_SUB_CARE4', 'L_SUB_BLUEPASS', 'L_SUB_TERMS', 'L_SUB_PAY3'], s.id);
      assert.deepEqual(g.slides.slice(1).map((x) => x.role.split(' · ')[0]), ['고민', '효과', '비교', '제품 묶음', '케어 1', '케어 2', '구독 조건', '결제'], s.id);
      // 간지 — 다루는 것 6줄: 현장의 고민 · 구독 효과 · 일시불 vs 구독 · 제품 묶음 · 전문 케어(2장) · 구독 조건 · 결제(2장)
      assert.deepEqual([6, 9, 12, 15, 18, 21].map((i) => part[0].t[i]), ['현장의 고민', '구독 효과', '일시불 vs 구독', '제품 묶음', '전문 케어', '구독 조건 · 결제'], s.id);
      // 그 밖의 구독 장(구독 품목 · 관리 옵션 · 도입 혜택 · 도입 절차 · 한 장 요약)은 쓰지 않는다
      assert.ok(!fills.some((x) => /^L_SUB_(ITEMS|CAREOPT|PROMO|FLOW|ONE)$/.test(x.f)), s.id);
      // 결제 — 이 업종의 납부안 순서 첫째 · 구분 칩
      const pay = part[8];
      assert.equal(pay.t[4], M.zeroText(C.subs.pay[V.sub.pay[0]].name), s.id + ' 첫 납부안 = 업종 순서 첫째');
      for (const i of [3, 12, 21]) assert.match(String(pay.t[i]), /^(기본 방식|협의안)$/, s.id + ' 납부안 구분 칩');
      // 숫자 00 — 케어 2 · 구독 조건 · 결제: 채운 글에 00 아닌 숫자가 없다(장 번호 눈썹 · 쪽 번호 제외) · 큰 숫자 칸은 00
      for (const x of part.slice(6)) {
        for (const [i, val] of Object.entries(x.t)) {
          if (typeof val !== 'string' || +i === 0 || /^CONFIDENTIAL · \d+$/.test(val)) continue;
          for (const m of val.match(number) || []) assert.equal(m, '00', `${s.id} ${x.f} 칸 ${i}: ${val}`);
        }
      }
      assert.deepEqual([part[6].t[4], part[6].t[7], part[6].t[10]], ['00', '00', '+00'], s.id + ' 케어 2 숫자');
      assert.deepEqual([part[7].t[2], part[7].t[5], part[7].t[8]], ['00', '00', '00'], s.id + ' 구독 조건 숫자');
      assert.equal(part[7].t[4], '구독 기간 · 00년 단위', s.id);
      // 한 파트에 같은 사진을 두 번 쓰지 않는다(제품 컷 제외) — 간지 사진도
      const pics = part.flatMap((x) => Object.values(x.img || {}).filter((im) => im && im.fit === 'cover').map((im) => im.src));
      assert.equal(new Set(pics).size, pics.length, s.id + ' 사진 겹침: ' + pics.join(' '));
      const fixed = ['/assets/subs/kv-grid.webp', '/assets/subs/care-1.webp', '/assets/subs/care-2.webp', '/assets/subs/care-3.webp', '/assets/subs/care-4.webp', '/assets/subs/val-dorm.webp'];
      assert.ok(pics.every((src) => !fixed.includes(src)), s.id + ' 장의 기본 사진과도 겹치지 않는다');
      assert.equal(part[4].img[0].src, V.sub.ph, s.id + ' 제품 묶음 = 패키지 사진');
    }
  }
});

test('서비스 제안 — 갈래: 삼성케어플러스 SAC · 비즈니스(내용 고정) → 구독 상품(고민 → … → 결제) · 기본 제안에만 · 솔루션 파트에서는 서비스 장이 빠진다', () => {
  assert.ok(M.TOC_SLOTS.L_TOC_SVC_SAC && M.TOC_SLOTS.L_TOC_SVC_MOBILE && M.TOC_SLOTS.L_TOC_INDEX10);
  assert.equal(M.TOCS.svc.name, '서비스'); assert.equal(M.TOCS.svc.type, 'solution');
  assert.deepEqual(M.SVC_BRANCHES, ['sac', 'mobile', 'sub']);
  assert.equal(M.TPL.basic.tocs.indexOf('svc'), M.TPL.basic.tocs.indexOf('sol') + 1, '솔루션 제안 다음');
  for (const t of M.TOC_TEMPLATES.filter((x) => x.id !== 'basic')) assert.ok(!t.tocs.includes('svc'), t.id + ' — 서비스 제안은 기본 제안에만');
  const body = (s, g0) => { const F = M.FILLS[s.id]; let k = 0; for (const g of s.flow) { if (g === g0) return g.slides.map((x, j) => ({ f: x.f, o: F[k + j] })); k += g.slides.length; } return null; };
  let first = null;
  const SUBF = ['L_SUB_PAIN', 'L_SUB_VALUE3', 'L_SUB_COMPARE', /^L_SUB_PKG[34]$/, 'L_SUB_CARE4', 'L_SUB_BLUEPASS', 'L_SUB_TERMS', 'L_SUB_PAY3'];
  for (const tid of ['basic']) for (const v of M.tocVerticals()) {
    const s = M.ensureTocScenario(tid, v.id);
    const svc = body(s, s.flow.find((g) => / 서비스$/.test(g.name)));
    const fs = svc.map((x) => x.f).slice(1);
    assert.deepEqual(fs.slice(0, 2), ['L_TOC_SVC_SAC', 'L_TOC_SVC_MOBILE'], s.id);
    assert.equal(fs.length, 10, s.id + ' 갈래 셋 — 케어 2 + 구독 8');
    fs.slice(2).forEach((f, k) => (typeof SUBF[k] === 'string' ? assert.equal(f, SUBF[k], s.id) : assert.match(f, SUBF[k], s.id)));
    const no = String(M.TPL[tid].tocs.indexOf('svc') + 1).padStart(2, '0');
    assert.deepEqual(svc.slice(1, 3).map((x) => x.o.t[0]), [`${no} · 서비스 · 삼성케어플러스 SAC`, `${no} · 서비스 · 삼성케어플러스 비즈니스`], s.id + ' 눈썹만 이 덱의 번호');
    // 간지 — 갈래마다 한 줄(구독 장 여덟은 '구독 상품' 한 줄)
    const div = svc[0].o.t; assert.deepEqual([div[6], div[9], div[12]], ['삼성케어플러스 SAC', '삼성케어플러스 비즈니스', '구독 상품'], s.id + ' 간지 줄');
    // 내용 고정 — 눈썹 · 바닥글(로고 · 덱 이름 · 쪽)을 뺀 모든 칸 · 사진이 업종마다 같다
    const fixed = svc.slice(1, 3).map((x) => JSON.stringify([Object.entries(x.o.t).filter(([i, val]) => i !== '0' && !/CONFIDENTIAL|고객사 로고|제안서/.test(String(val))), x.o.img || {}]));
    if (first) assert.deepEqual(fixed, first, s.id + ' 업종마다 같은 내용'); else first = fixed;
    // 한 파트에 같은 사진 두 번 없음(제품 컷 제외) — 간지 사진도
    const pics = svc.flatMap((x) => Object.values(x.o.img || {}).filter((im) => im && im.src && im.fit !== 'contain').map((im) => im.src));
    assert.equal(new Set(pics).size, pics.length, s.id + ' 사진 겹침');
    // 솔루션 파트 — 서비스 장이 없고, 간지 솔루션 수 · 장 눈썹 번호가 남은 솔루션에 맞다
    const solG = s.flow.find((g) => / 솔루션$/.test(g.name) && !/구독/.test(g.name));
    assert.ok(!solG.slides.some((x) => SERVICE.test(x.f)), s.id + ' 솔루션 파트에 서비스 장 없음');
    const sb = body(s, solG); const n = sb.length - 1; const dv = sb[0].o.t;
    if (/\d+개 솔루션/.test(dv[3] || '')) assert.match(dv[3], new RegExp(`^${n}개 솔루션`), s.id + ' 간지 솔루션 수');
    sb.slice(1).forEach((x, j) => assert.match(String(x.o.t[0]), new RegExp(` · ${String(j + 1).padStart(2, '0')}$`), s.id + ' 솔루션 장 번호'));
  }
  // 서비스 파트가 없는 구성(표준 제안서 등)은 솔루션 파트에 서비스 장이 그대로 남는다
  assert.ok(M.ensureTocScenario('std', 'fb_qsr').flow.some((g) => g.slides.some((x) => x.f === 'L_VS_SOL_SVCSAC')));
});
