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
export { TOC_META, TOC_SLOTS } from './domain/templates/toc_layouts.js';`;
const built = await build({ stdin: { contents: entry, resolveDir: fileURLToPath(new URL('../web/src/', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.json': 'json' }, logLevel: 'error' });
const M = await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'));
await M.loadTocContent();

const pad = (n) => String(n).padStart(2, '0');
const isDiv = (f) => /^L_VS_DIV_R\d$/.test(f);
// 표준에 없는 목차 — 간지 다음 장들의 레이아웃
const FAMILY = {
  당사의이해: /^L_TOC_(UAPROF|UAPAIN|TRLINE|TRSHARE|TRSTAT|TRKEY|CPSCORE|CPWIN|CPPOS)$/, tech: /^L_TOC_TECH[1-4]$/, value: /^L_(VS_BIRD_[SB]\d+|TOC_JOURNEY[123]S?)$/,
  summary: /^L_TOC_SUMMARY$/, effect: /^L_TOC_KPI$/, cost: /^L_TOC_TCO$/, pilot: /^L_TOC_PILOT$/, plan: /^L_TOC_ROADMAP$/, rfp: /^L_TOC_RFP$/, spec: /^L_TOC_SPEC$/, bom: /^L_TOC_BOM[3-8]$/,
  vp: /^L_TOC_VP3$/, vpd: /^L_(VS_SPACE|VS_SOL_[A-Z]+|TOC_PFEAT|TOC_JOURNEY[123]S)$/, pcase: /^L_VS_CASE$/, pspec: /^L_TOC_PSPEC$/,
  // 구독(B2B 삼성 AI 구독) 목차 — L_SUB_*(subs_layouts.js)
  subs: /^L_SUB_(PAIN|VALUE3|COMPARE)$/, subpkg: /^L_SUB_(PKG[34]|ITEMS)$/, subcare: /^L_SUB_(CARE4|BLUEPASS|CAREOPT)$/, subterm: /^L_SUB_(TERMS|PAY3|PROMO|FLOW)$/, subone: /^L_SUB_ONE$/,
  subsol: /^L_SUB_(VALUE3|PKG[34]|PAY3|PROMO)$/, // 요구사항에 따라 더하는 '구독 솔루션 제안'
};
FAMILY.ua = FAMILY['당사의이해'];
const composed = () => M.TOC_TEMPLATES.filter((t) => t.id !== 'std');

test('fourteen templates · 표준 제안서는 업종 표준 제안서 44종 그대로', () => {
  assert.equal(M.TOC_TEMPLATES.length, 14);
  assert.deepEqual(M.TPL.stdsub.tocs, ['overview', 'needs', 'space', 'sol', 'subsol', 'case', 'why'], '표준 + 구독 솔루션: 도입사례 앞');
  assert.deepEqual(M.TPL.roisub.tocs, ['summary', 'ua', 'tech', 'effect', 'cost', 'subsol', 'pilot', 'why'], '투자 효과형 + 구독 솔루션: 비용 · 구매 다음');
  assert.deepEqual(M.TPL.prod.tocs, ['vp', 'vpd', 'pcase', 'pspec']);
  assert.deepEqual(M.TPL.std.tocs, ['overview', 'needs', 'space', 'sol', 'case', 'why']);
  for (const id of ['stdx', 'spacex']) {
    assert.equal(M.TPL[id].tocs[0], 'ua', id + ' replaces Overview with 당사의 이해');
    assert.deepEqual(M.TPL[id].tocs.slice(1), M.TPL[id === 'stdx' ? 'std' : 'space'].tocs.slice(1), id + ' keeps the rest');
  }
  assert.deepEqual(M.TPL.space.tocs, ['overview', 'tech', 'value', 'case', 'why']);
  assert.equal(M.tocVerticals().length, 44);
  for (const v of M.tocVerticals()) {
    assert.equal(M.ensureTocScenario('std', v.id), M.SC['bs_std_' + v.id], v.id);
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
      assert.deepEqual(s.flow[0].slides.map((x) => x.f), ['L_C01', 'L_TOC_INDEX' + Math.min(8, Math.max(4, t.tocs.length))]);
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
  assert.equal(n, 13 * 44);
});

test('같은 이름의 목차는 그 업종 표준 제안서의 장 그대로 · 나머지는 정해진 장', () => {
  for (const v of M.tocVerticals()) {
    const D = M.stdDeck(v.id);
    for (const t of composed()) {
      const s = M.ensureTocScenario(t.id, v.id);
      s.flow.slice(1).forEach((g, i) => {
        const key = t.tocs[i]; const std = M.TOCS[key].std;
        if (std) {
          assert.deepEqual(g.slides.map((x) => x.f), D.st[std].items.map((x) => x.f).filter((f) => f !== 'L_VS_TOC'), `${s.id} ${g.name} = 표준 ${D.st[std].g.name}`);
        } else {
          for (const x of g.slides.slice(1)) assert.match(x.f, FAMILY[key], `${s.id} · ${g.name}`);
          assert.ok(g.slides.length >= 2);
        }
      });
      assert.ok(M.STORY[s.id] && Object.keys(M.STORY[s.id].parts).length === t.tocs.length, s.id + ' story parts');
    }
  }
});

test('공간별 가치 제안: 표준 조감도 + 여정마다 쓰는 기능만 켬', () => {
  for (const v of M.tocVerticals()) {
    const s = M.ensureTocScenario('space', v.id);
    const fills = M.FILLS[s.id];
    const bird = fills.find((x) => /^L_VS_BIRD_/.test(x.f));
    assert.ok(bird && bird.t[0] === '03 · 공간별 가치 제안', v.id + ' bird eyebrow');
    const journeys = fills.filter((x) => /^L_TOC_JOURNEY/.test(x.f));
    assert.ok(journeys.length >= 1, v.id);
    for (const j of journeys) {
      const srcs = Object.values(j.img).map((x) => x.src).filter((x) => x.startsWith('/assets/toc/icons/s'));
      assert.ok(srcs.some((x) => x.endsWith('.on.png')), v.id + ' has lit features');
    }
    assert.ok(fills.some((x) => /^L_TOC_TECH/.test(x.f)), v.id + ' has a 핵심 기술 sheet');
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
        const fams = g.slides.map((x) => x.f).filter((f) => f !== 'L_VS_TOC' && !isDiv(f)).map((f) => f.replace(/\d+S?$/, ''));
        if (seen[name]) assert.deepEqual(fams, seen[name], `${v} ${t.id} ${name}`);
        else seen[name] = fams;
      });
    }
  }
});

test('제품 제안서: 제품 + 솔루션 → Value Prop 3, 가치마다 상세 장, 유관사례 2, Spec 8줄', () => {
  const C = M.tocContent();
  for (const v of M.tocVerticals()) {
    const P = C.v[v.id].pp; const D = M.stdDeck(v.id);
    const s = M.ensureTocScenario('prod', v.id); const fills = M.FILLS[s.id];
    const [gVp, gVpd, gCase, gSpec] = s.flow.slice(1);
    // 가치 셋 — 첫째는 제품, 솔루션이 둘 이상이면 둘로 추리고, 적으면 제품에서 여럿
    assert.equal(P.vps.length, 3, v.id);
    assert.equal(P.vps[0].k, 'p', v.id + ' leads with the product');
    const ns = P.vps.filter((x) => x.k === 's').length;
    assert.equal(ns, Math.min(2, P.sols.length), v.id + ' solution count');
    assert.ok(P.vps.slice(1).every((x, i, a) => x.k === 'p' ? a.slice(0, i).every((y) => y.k === 'p') : true), v.id + ' products before solutions');
    for (const x of P.vps.filter((y) => y.k === 's')) assert.ok(D.s.flow.some((g) => g.slides.some((it) => it.f === x.f)), `${v.id} ${x.sid} is in the standard deck`);
    assert.equal(new Set(P.vps.map((x) => x.t)).size, 3, v.id + ' distinct value props');
    // Value Props 장의 세 카드 = 가치 셋, 상세 간지의 줄 = 가치 셋 (가치마다 장 하나 이상)
    const k0 = 2 + gVp.slides.length; const div = fills[k0];
    assert.equal(div.f, 'L_VS_DIV_R3', v.id + ' one divider row per value prop');
    let next = k0 + 2;
    for (let r = 0; r < 3; r++) {
      const [a, b = a] = String(div.t[7 + 3 * r]).split('–').map(Number);
      assert.equal(a, next, `${v.id} value prop ${r + 1} starts right after the previous one`);
      assert.ok(b >= a, v.id); next = b + 1;
    }
    assert.equal(next - 1, k0 + gVpd.slides.length, v.id + ' value prop pages cover the chapter');
    assert.ok(gVpd.slides.length - 1 >= 3, v.id);
    // 솔루션 가치는 표준 솔루션 장 + 제품과 함께 쓰는 공간이 있으면 그 장면(기능 켬)
    for (const x of P.vps.filter((y) => y.k === 's')) {
      const i = gVpd.slides.findIndex((y) => y.f === x.f);
      assert.ok(i > 0, `${v.id} ${x.sid} standard solution sheet`);
      const scene = !!gVpd.slides[i + 1] && /^L_TOC_JOURNEY[123]S$/.test(gVpd.slides[i + 1].f);
      assert.equal(scene, x.sp.length > 0, `${v.id} ${x.sid} scene only where it works with the product`);
      if (scene) assert.ok(Object.values(fills[k0 + i + 1].img).some((im) => im.src.endsWith('.on.png')), `${v.id} ${x.sid} lit features`);
    }
    // 유관사례 2 · Spec
    assert.deepEqual(gCase.slides.slice(1).map((x) => x.f), ['L_VS_CASE', 'L_VS_CASE'], v.id);
    assert.deepEqual(gSpec.slides.slice(1).map((x) => x.f), ['L_TOC_PSPEC'], v.id);
    assert.equal(P.specs.length, 8, v.id + ' 8 spec rows'); assert.equal(P.keys.length, 3, v.id + ' 3 key numbers');
    assert.equal(new Set(P.specs.map((x) => x[0])).size, 8, v.id + ' spec labels are distinct');
    for (const [lb, val] of P.specs) assert.ok(lb && val && !/^(있음|없음|-)$/.test(val), `${v.id} ${lb}: ${val}`);
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

test('구독 제안서 · 구독 전환 제안서: 업종 구독 패키지 · 납부안 순서 · 기간 한정 혜택', () => {
  const C = M.tocContent();
  assert.deepEqual(M.TPL.subs.tocs, ['overview', 'subs', 'subpkg', 'space', 'subcare', 'subterm', 'case', 'why']);
  assert.deepEqual(M.TPL.subsl.tocs, ['subone', 'subpkg', 'subterm', 'why']);
  for (const v of M.tocVerticals()) {
    const V = C.v[v.id]; assert.ok(V.sub && V.sub.items.length >= 3 && V.sub.items.length <= 4, v.id + ' 구독 패키지 품목 3–4');
    for (const tid of ['subs', 'subsl']) {
      const s = M.ensureTocScenario(tid, v.id); const fills = M.FILLS[s.id];
      const pkg = fills.find((x) => /^L_SUB_PKG[34]$/.test(x.f)); assert.ok(pkg, s.id + ' 패키지 장');
      assert.equal(pkg.f, 'L_SUB_PKG' + (V.sub.items.length >= 4 ? 4 : 3));
      const pay = fills.find((x) => x.f === 'L_SUB_PAY3'); assert.ok(pay, s.id + ' 납부안 장');
      assert.equal(pay.t[4], C.subs.pay[V.sub.pay[0]].name, s.id + ' 첫 납부안 = 업종 순서 첫째');
      assert.equal(fills.some((x) => x.f === 'L_SUB_PROMO'), !!(C.subs.promo && C.subs.promo.active), s.id + ' 혜택 장은 혜택 기간에만');
      for (const x of fills) if (x.f === 'L_SUB_PAY3') for (const i of [0, 1, 2]) assert.match(String(x.t[[3, 12, 21][i]]), /^(기본 방식|협의안)$/, s.id + ' 납부안 구분 칩');
    }
  }
});
