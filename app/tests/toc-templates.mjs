// 목차 템플릿 — 표준 제안서는 업종 표준 제안서(bs_std_<업종>) 그대로, 나머지 템플릿 × 업종은 조립한다:
// 표준 제안서와 이름이 같은 목차는 그 업종 표준 제안서의 장을 그대로 옮겨 쓰고(장 번호 · 쪽만 바뀜),
// 표준에 없는 목차는 L_TOC_* 장 + 같은 간지(L_VS_DIV_R*). 덱은 표지 + 목차(숨은 목차)로 연다.
// 같은 목차 이름이면 어느 템플릿에서든 같은 장, 공간별 가치 제안은 그 장면에서 쓰는 기능만 켠다, 쪽 번호 · 간지 쪽 · 눈썹 번호가 맞다.
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
  당사의이해: /^L_TOC_(UAPROF|UAPAIN|TRLINE|TRSHARE|TRSTAT|TRKEY|CPMATRIX|CPMAP)$/, tech: /^L_TOC_TECH[1-4]$/, value: /^L_(VS_BIRD_[SB]\d+|TOC_JOURNEY[123]S?)$/,
  summary: /^L_TOC_SUMMARY$/, effect: /^L_TOC_KPI$/, cost: /^L_TOC_TCO$/, pilot: /^L_TOC_PILOT$/, plan: /^L_TOC_ROADMAP$/, rfp: /^L_TOC_RFP$/, spec: /^L_TOC_SPEC$/, bom: /^L_TOC_BOM[3-8]$/,
};
FAMILY.ua = FAMILY['당사의이해'];
const composed = () => M.TOC_TEMPLATES.filter((t) => t.id !== 'std');

test('nine templates · 표준 제안서는 업종 표준 제안서 44종 그대로', () => {
  assert.equal(M.TOC_TEMPLATES.length, 9);
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
  assert.equal(n, 8 * 44);
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
