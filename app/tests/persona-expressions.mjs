// node app/tests/persona-expressions.mjs
// Optional contact sheet: WINMATE_PORTRAIT_PREVIEW=/tmp/portraits.png node app/tests/persona-expressions.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { resolveExpression } from '../web/src/domain/simulation/expression.js';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { build } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const sharp = require('sharp');
const webRoot = fileURLToPath(new URL('../web', import.meta.url));
// Tree-shake unrelated application bootstrap/storage. The actual profile and look data
// and the complete SVG component are bundled, without copying or mocking any avatars.
const bundle = await build({
  stdin: { contents: `
    export { Portrait } from './src/components/persona.jsx';
    export { PERSONAS, LEVELS } from './src/domain/simulation/profile.js';
    export { moodOf } from './src/domain/simulation/score.js';
    export { LOOKS, SKINS, HAIRS, GLASSES, tweak } from './src/domain/simulation/looks.js';
  `, resolveDir: webRoot },
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'visual-modules-only', setup(build) {
    build.onResolve({ filter: /^\.\.?\// }, async args => {
      if (args.pluginData?.resolved) return;
      const resolved = await build.resolve(args.path, {
        resolveDir: args.resolveDir, kind: args.kind, pluginData: { resolved: true },
      });
      return { ...resolved, sideEffects: false };
    });
  } }],
});
const module = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(require, module, module.exports);
const { Portrait, PERSONAS, LEVELS, moodOf, LOOKS, SKINS, HAIRS, GLASSES, tweak } = module.exports;
const avatars = [
  ...Object.values(PERSONAS),
  ...LOOKS.map(x => ({ ...x, key: x.id, custom: true, level: 2 })),
];
const stages = [[60, 'happy', '만족'], [40, 'flat', '중립'], [39, 'stern', '불만']];
const svgOf = props => renderToStaticMarkup(React.createElement(Portrait, props));
const feature = (element, name) => React.Children.toArray(element.props.children)
  .find(child => React.isValidElement(child) && child.props['data-feature'] === name);

test('satisfaction owns the exact 40/60 boundaries, including zero and fractional scores', () => {
  for (const [score, expected] of [
    [-10, 'stern'], [0, 'stern'], [25, 'stern'], [39.999, 'stern'],
    [40, 'flat'], [45, 'flat'], [59.999, 'flat'], [60, 'happy'], [100, 'happy'], [110, 'happy'],
  ]) {
    for (const mood of ['만족', '호의', '중립', '의심', '불만', undefined]) {
      for (const base of ['happy', 'flat', 'stern']) {
        assert.equal(resolveExpression(score, mood, base), expected, `${score}/${mood}/${base}`);
      }
    }
  }
});

test('missing or invalid scores retain setup mood, then the resting look', () => {
  for (const score of [undefined, null, NaN, Infinity, -Infinity, '', '60', false]) {
    for (const [mood, expected] of [['만족', 'happy'], ['호의', 'happy'], ['중립', 'flat'], ['의심', 'stern'], ['불만', 'stern']]) {
      assert.equal(resolveExpression(score, mood, 'happy'), expected);
    }
    for (const base of ['happy', 'flat', 'stern']) {
      assert.equal(resolveExpression(score, undefined, base), base);
      assert.equal(resolveExpression(score, 'unknown', base), base);
    }
  }
  assert.equal(resolveExpression(), 'flat');
  assert.equal(resolveExpression(undefined, undefined, 'unknown'), 'flat');
});

test('the three expression stages agree with existing moodOf at every difficulty', () => {
  for (const level of LEVELS) {
    for (let satisfaction = 0; satisfaction <= 100; satisfaction++) {
      assert.equal(resolveExpression(satisfaction), resolveExpression(undefined, moodOf(satisfaction, level)),
        `level ${level.id}, satisfaction ${satisfaction}`);
    }
  }
});

test('all six defaults and 30 custom looks share three distinct brows, eyes and mouths', () => {
  assert.equal(Object.keys(PERSONAS).length, 6);
  assert.equal(LOOKS.length, 30);
  for (const who of avatars) {
    const expressions = stages.map(([satisfaction, expected]) => {
      const svg = Portrait({ who, satisfaction, mood: expected === 'stern' ? '만족' : '불만' });
      assert.equal(svg.props['data-expression'], expected, who.key);
      assert.equal(svg.props['aria-hidden'], 'true');
      const markup = renderToStaticMarkup(svg);
      assert(!/NaN|undefined/.test(markup), who.key);
      return svg;
    });
    for (const name of ['eyebrows', 'eyes', 'mouth']) {
      const features = expressions.map(svg => renderToStaticMarkup(feature(svg, name)));
      assert.equal(new Set(features).size, 3, `${who.key}: distinct ${name}`);
    }
    assert.equal(Portrait({ who }).props['data-expression'], who.look.base);
    if (!who.custom) assert.equal(svgOf({ who: who.key, satisfaction: 60 }), svgOf({ who, satisfaction: 60 }));
  }
  assert.equal(Portrait({ who: 'missing', satisfaction: 60 }), null);
});

test('skin, hair and glasses edits never disable expression changes on any custom look', () => {
  for (const avatar of avatars.filter(x => x.custom)) {
    for (const [kind, options] of [['skin', SKINS], ['hair', HAIRS], ['glasses', GLASSES]]) {
      for (const option of options) {
        const who = { ...avatar, look: tweak(avatar.look, kind, option.k) };
        for (const [satisfaction, expected] of stages) {
          const svg = Portrait({ who, satisfaction });
          assert.equal(svg.props['data-expression'], expected, `${who.key}/${kind}/${option.k}`);
          // Expression geometry is universal, even when the old smileEyes flag is absent.
          for (const name of ['eyes', 'mouth']) {
            assert.equal(renderToStaticMarkup(feature(svg, name)),
              renderToStaticMarkup(feature(Portrait({ who: { ...who, look: { ...who.look, smileEyes: !who.look.smileEyes } }, satisfaction }), name)));
          }
        }
      }
    }
  }
});

test('titled portraits expose the resolved expression and preserve sizing and decoration options', () => {
  for (const who of avatars) for (const [satisfaction, expected, label] of stages) {
    const svg = Portrait({ who, satisfaction, mood: '의심', title: '고객 프로필', size: 104, round: false, className: 'preview' });
    assert.equal(svg.props.role, 'img');
    assert.equal(svg.props['aria-hidden'], undefined);
    assert.equal(svg.props['aria-label'], `고객 프로필 · ${label} 표정`);
    assert.equal(svg.props['data-expression'], expected);
    assert.equal(svg.props.width, 104);
    assert.equal(svg.props.height, 104);
    assert.equal(svg.props.style, undefined);
    assert.equal(svg.props.className, 'portrait preview');
    assert(svgOf({ who, satisfaction, title: '고객 프로필' }).includes(`<title>고객 프로필 · ${label} 표정</title>`));
  }
});

test('48px rasterized portraits visibly change every facial feature across every look', async () => {
  const regions = { eyebrows: [46, 47, 28, 6], eyes: [47, 54, 26, 7], mouth: [50, 66, 20, 11] };
  const customExtremes = avatars.filter(x => x.custom).map((who, i) => ({
    ...who, key: who.key + '-edited',
    look: tweak(tweak(tweak(who.look, 'skin', i % 2 ? 'deep' : 'fair'), 'hair', 'silver'), 'glasses', GLASSES[i % GLASSES.length].k),
  }));
  const preview = [];
  for (const [index, who] of [...avatars, ...customExtremes].entries()) {
    const frames = await Promise.all(stages.map(async ([satisfaction]) => {
      const xml = svgOf({ who, satisfaction, size: 48 }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
      return sharp(Buffer.from(xml)).ensureAlpha().raw().toBuffer();
    }));
    for (const [name, [x, y, w, h]] of Object.entries(regions)) {
      const left = Math.floor((x - 18) * 48 / 84), top = Math.floor((y - 16) * 48 / 84);
      const right = Math.ceil((x + w - 18) * 48 / 84), bottom = Math.ceil((y + h - 16) * 48 / 84);
      for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) {
        let changed = 0;
        for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
          const offset = (py * 48 + px) * 4;
          if ([0, 1, 2].some(c => Math.abs(frames[a][offset + c] - frames[b][offset + c]) > 12)) changed++;
        }
        assert(changed >= 3, `${who.key}/${name}: ${stages[a][1]} → ${stages[b][1]} only changes ${changed} pixels`);
      }
    }
    if (process.env.WINMATE_PORTRAIT_PREVIEW && index < avatars.length) {
      for (const [stage, [satisfaction]] of stages.entries()) {
        const xml = svgOf({ who, satisfaction, size: 104 }).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
        preview.push({ input: await sharp(Buffer.from(xml)).png().toBuffer(), left: (index % 6) * 324 + stage * 104, top: Math.floor(index / 6) * 112 });
      }
    }
  }
  if (preview.length) await sharp({ create: { width: 1944, height: 672, channels: 4, background: '#fff' } })
    .composite(preview).png().toFile(process.env.WINMATE_PORTRAIT_PREVIEW);
});
