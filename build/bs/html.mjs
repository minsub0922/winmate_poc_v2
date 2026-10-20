// 레이아웃 HTML 꺼내기 — node build/bs/html.mjs f  (보기 좋게 태그마다 줄바꿈)
import fs from 'node:fs'; import zlib from 'node:zlib';
const H = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync('data/layouts.b64', 'utf8').trim(), 'base64')).toString('utf8'));
const P = await import('../../src/photo_layouts.js'); const S = await import('../../src/std_layouts.js');
Object.assign(H, P.PHOTO_HTML, S.STD_HTML);
const f = process.argv[2]; const h = H[f] || '';
console.log(process.argv[3] === 'raw' ? h : h.replace(/></g, '>\n<'));
