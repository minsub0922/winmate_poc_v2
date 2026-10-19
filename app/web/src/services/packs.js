import { fetchResource } from '../api/client.js';
// 배경 사진 묶음 — "img/bg/bs01.json#3" 같은 배경 주소를 실제 이미지(blob URL)로 바꾼다.
// 시나리오마다 배경 사진을 한 JSON 파일(JPEG data URL 목록)로 묶어 두고(build/bg/make_bg.py), 그 시나리오의 장을
// 처음 그릴 때 한 번만 받는다. 아직 안 받은 배경은 받는 대로 그 장에 바로 깐다(slide.jsx applyOverrides).
// 큰 묶음(솔루션 · 유관사례 이미지 img/media/*.json, 수 MB~16MB)은 묶음 안 바이트 범위를 미리 등록해 두고(registerRanges)
// 한 장만 Range 요청으로 받는다. 서버가 Range를 무시하면(200) 그 응답을 묶음 전체로 쓰고, 그 묶음은 이후 통째로 쓴다.
const PACKS = new Map(); // pack url → Promise<string[]> (blob urls)
const READY = new Map(); // "pack#k" → blob url
const RANGES = new Map(); // pack url → [[start, end), …] byte ranges of each data URL inside the pack text
const RSTATE = new Map(); // pack url → true (Range works) | false (it doesn't) | Promise (first try in flight)
const ONE = new Map(); // "pack#k" → Promise<blob url | null> (single-image fetch in flight)

const isPacked = (src) => /\.json#\d+$/.test(src || '');

/** register byte ranges for big packs: { "img/media/g0.json": [[s, e], …] } */
export function registerRanges(map) {
  for (const [u, r] of Object.entries(map || {})) if (Array.isArray(r)) RANGES.set(u, r);
}

/** a background address → an image url right now, or null while its pack is still loading */
export function bgUrl(src) {
  if (!src) return null;
  if (!isPacked(src)) return src;
  return READY.get(src) || null;
}

const toBlobUrl = async (d) => URL.createObjectURL(await (await fetchResource(d)).blob());

function adoptPack(url, jsonPromise) {
  const p = (async () => {
    const { images } = await jsonPromise;
    const urls = await Promise.all((images || []).map(async (d, k) => READY.get(url + '#' + k) || toBlobUrl(d)));
    urls.forEach((u, k) => READY.set(url + '#' + k, u));
    return urls;
  })().catch((e) => { PACKS.delete(url); throw e; });
  PACKS.set(url, p);
  return p;
}

function loadPack(url) {
  if (!PACKS.has(url)) {
    adoptPack(url, fetchResource(url).then((r) => { if (!r.ok) throw new Error('묶음을 못 받았어요: ' + url); return r.json(); }));
  }
  return PACKS.get(url);
}

/** one picture of a big pack by byte range → data URL, or undefined to fall back to the whole pack */
async function viaRange(url, k) {
  let st = RSTATE.get(url);
  if (st && typeof st.then === 'function') { await st; st = RSTATE.get(url); }
  if (st === false || PACKS.has(url)) return undefined;
  const r = RANGES.get(url)[k];
  if (!r) return undefined;
  const p = (async () => {
    const res = await fetchResource(url, { headers: { Range: `bytes=${r[0]}-${r[1] - 1}` } });
    if (res.status === 206) {
      const t = await res.text();
      if (!t.startsWith('data:')) throw new Error('범위가 맞지 않아요: ' + url);
      RSTATE.set(url, true);
      return t;
    }
    RSTATE.set(url, false);
    if (res.ok && !PACKS.has(url)) adoptPack(url, res.json());
    return undefined;
  })();
  if (st === undefined) RSTATE.set(url, p.then(() => {}, () => {}));
  try { return await p; } catch (e) { RSTATE.set(url, false); console.warn(e); return undefined; }
}

/** resolve a background address (loading its pack if needed) → image url | null */
export async function loadBg(src) {
  if (!src) return null;
  if (!isPacked(src)) return src;
  if (READY.has(src)) return READY.get(src);
  const [url, k] = src.split('#');
  if (RANGES.has(url) && !PACKS.has(url)) {
    if (!ONE.has(src)) {
      ONE.set(src, (async () => {
        const d = await viaRange(url, Number(k));
        if (!d) return null;
        const u = READY.get(src) || await toBlobUrl(d);
        READY.set(src, u);
        return u;
      })().catch((e) => { console.warn(e); return null; }).finally(() => ONE.delete(src)));
    }
    const u = await ONE.get(src);
    if (u) return u;
    if (READY.has(src)) return READY.get(src);
  }
  try { const urls = await loadPack(url); return urls[Number(k)] || null; } catch (e) { console.warn(e); return null; }
}
