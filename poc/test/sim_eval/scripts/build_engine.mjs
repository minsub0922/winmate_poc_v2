// 앱 src/sim 엔진을 engine/winmate_sim.mjs 하나로 묶는다 (앱 코드를 고친 뒤 다시 실행).
//   node scripts/build_engine.mjs            (앱 루트의 node_modules/esbuild 를 쓴다 — 없으면 앱 루트에서 npm i)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
// --src <앱 루트> : 다른 위치의 앱 소스로 묶기(예: 고치기 전 버전) · --out <파일> : 결과 파일 (기본 engine/winmate_sim.mjs)
const APP = path.resolve(opt('src', path.resolve(HERE, '../../../..')));
const HOME_APP = path.resolve(HERE, '../../../..');
const req = createRequire(path.join(HOME_APP, 'package.json'));
let esbuild;
try { esbuild = req('esbuild'); } catch (e) { console.error('esbuild 가 없습니다 — 앱 루트(' + HOME_APP + ')에서 npm i 후 다시 실행하세요'); process.exit(1); }

const shim = {
  name: 'winmate-sim-shim',
  setup(b) {
    // ① 엔진의 LLM 호출 → PoC 어댑터
    b.onResolve({ filter: /^\.\.\/ai\.js$/ }, (a) => (a.importer.includes(`${path.sep}src${path.sep}sim${path.sep}`) ? { path: path.join(HERE, 'sample_shim.mjs') } : undefined));
    // ② 시뮬레이션과 무관한 대용량 레이아웃 HTML
    b.onResolve({ filter: /^\.\/(photo_layouts|std_layouts)\.js$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: a.path.includes('photo') ? 'export const PHOTO_META = []; export const PHOTO_HTML = {};' : 'export const STD_META = []; export const STD_HTML = {};', loader: 'js' }));
  },
};
const out = path.resolve(opt('out', path.join(HERE, '..', 'engine', 'winmate_sim.mjs')));
const entry = path.join(APP === HOME_APP ? HERE : fs.mkdtempSync(path.join(HERE, '.tmp-')), 'engine_entry.mjs');
if (!fs.existsSync(entry)) {
  // 다른 앱 루트를 묶을 때는 그 루트를 가리키는 진입점을 임시로 만든다
  fs.writeFileSync(entry, fs.readFileSync(path.join(HERE, 'engine_entry.mjs'), 'utf8').replaceAll('../../../../src/', path.join(APP, 'src').split(path.sep).join('/') + '/').replace("'./sample_shim.mjs'", JSON.stringify(path.join(HERE, 'sample_shim.mjs').split(path.sep).join('/'))));
}
const r = await esbuild.build({
  entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node18',
  outfile: out, plugins: [shim], nodePaths: [path.join(HOME_APP, 'node_modules')], loader: { '.json': 'json' }, legalComments: 'none', logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' }, metafile: true,
  banner: { js: `// 자동 생성 — scripts/build_engine.mjs (원본: winmatev2/src/sim · ${new Date().toISOString().slice(0, 16)}). 직접 고치지 마세요.` },
});
const srcs = Object.keys(r.metafile.inputs).filter((f) => f.includes('src/sim/'));
if (path.dirname(entry) !== HERE) fs.rmSync(path.dirname(entry), { recursive: true, force: true });
const info = { file: path.basename(out), label: opt('label', APP === HOME_APP ? '현재 앱 src/sim' : path.basename(APP)), built: new Date().toISOString(), bytes: fs.statSync(out).size, sim_sources: srcs.map((f) => 'src/sim/' + path.basename(f)) };
const bf = path.join(path.dirname(out), 'BUILD.json');
let all = {}; try { all = JSON.parse(fs.readFileSync(bf, 'utf8')); if (all.built) all = { 'winmate_sim.mjs': all }; } catch (e) { /* 처음 */ }
all[path.basename(out)] = info;
fs.writeFileSync(bf, JSON.stringify(all, null, 1));
console.log('engine →', path.relative(process.cwd(), out), (fs.statSync(out).size / 1e6).toFixed(2) + 'MB');
