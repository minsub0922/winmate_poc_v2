// 건물 히스토리 저장소 — 이 브라우저의 IndexedDB(winmate-building)
// 건물: { id, title, industries, floors:[{key, tpl, fv(외벽 변형 번호)}](아래층부터), view:{mode: 'exterior'|'spread'}, camera, createdAt, updatedAt, example?, template?(건물 템플릿 id) }
// 썸네일은 따로(thumb) — 목록을 빨리 읽기 위해. 같은 저장소에 고르기 창 썸네일 캐시('tpl:…@판' · 'pre:…@판')도 둔다

const DB = 'winmate-building';
let dbp = null;
const mem = { b: new Map(), thumb: new Map(), meta: new Map() };
let persistent = true;
const subs = new Set();

function open() {
  if (dbp) return dbp;
  dbp = new Promise((res) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('b')) d.createObjectStore('b', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('thumb')) d.createObjectStore('thumb');
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { persistent = false; res(null); };
      r.onblocked = () => { persistent = false; res(null); };
    } catch {
      persistent = false;
      res(null);
    }
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const d = await open();
  if (!d) {
    const r = fn(null, mem[store]);
    return r && typeof r === 'object' && !(r instanceof Map) && 'result' in r ? r.result : undefined;
  }
  return new Promise((res, rej) => {
    let out;
    try {
      const t = d.transaction(store, mode);
      const s = t.objectStore(store);
      const req = fn(s, null);
      if (req && 'onsuccess' in req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('저장하지 못했어요.'));
    } catch (e) { rej(e); }
  });
}
const emit = () => subs.forEach((f) => { try { f(); } catch {} });

export const uid = (p) => p + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

// 처음 여는 브라우저에만 넣는 예시 — [템플릿, 외벽 번호]
const SEEDS = [
  {
    id: 'bld-example-mixed', example: true, title: '도심 복합 빌딩', industries: ['RT', 'FB', 'OF'],
    floors: [['rt-full-standard', 0], ['fb-full-standard', 1], ['of-full-standard', 0], ['of-five', 0], ['of-front4', 0]],
    camera: { azimuth: 40, elevation: 22, zoom: 1 }, ago: 26 * 3600e3,
  },
  {
    id: 'bld-example-campus', example: true, title: '캠퍼스 복합관', industries: ['FB', 'SV', 'ED'],
    floors: [['fb-full-standard', 2], ['sv-full-standard', 2], ['ed-full-standard', 0], ['ed-five', 0]],
    camera: { azimuth: 40, elevation: 22, zoom: 1 }, ago: 3 * 86400e3,
  },
];

async function seed() {
  const done = await tx('meta', 'readonly', (s, m) => (s ? s.get('seeded') : { result: m.get('seeded') })).catch(() => null);
  if (done) return;
  const now = Date.now();
  for (const x of SEEDS) {
    const b = {
      id: x.id, example: true, title: x.title, industries: x.industries,
      floors: x.floors.map(([tpl, fv], i) => ({ key: x.id + '-f' + i, tpl, fv })),
      view: { mode: 'exterior' }, camera: x.camera, createdAt: now - x.ago, updatedAt: now - x.ago,
    };
    await tx('b', 'readwrite', (s, m) => (s ? s.put(b) : m.set(b.id, b)));
  }
  await tx('meta', 'readwrite', (s, m) => (s ? s.put(1, 'seeded') : m.set('seeded', 1)));
}
let seeded = null;
const ready = () => (seeded ||= seed().catch(() => {}));

export const store = {
  get persistent() { return persistent; },
  async list() {
    await ready();
    const all = (await tx('b', 'readonly', (s, m) => (s ? s.getAll() : { result: [...m.values()] }))) || [];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async get(id) {
    await ready();
    return (await tx('b', 'readonly', (s, m) => (s ? s.get(id) : { result: m.get(id) }))) || null;
  },
  async put(b, { touch = true } = {}) {
    if (touch) b.updatedAt = Date.now();
    await tx('b', 'readwrite', (s, m) => (s ? s.put(b) : m.set(b.id, b)));
    emit();
    return b;
  },
  async remove(id) {
    await tx('b', 'readwrite', (s, m) => (s ? s.delete(id) : m.delete(id)));
    await tx('thumb', 'readwrite', (s, m) => (s ? s.delete(id) : m.delete(id))).catch(() => {});
    emit();
  },
  async thumb(id) {
    return (await tx('thumb', 'readonly', (s, m) => (s ? s.get(id) : { result: m.get(id) })).catch(() => null)) || null;
  },
  // v = 썸네일 판 (외관으로 바뀐 2판부터는 v가 다르면 다시 만든다)
  async putThumb(id, blob, at, v = 1) {
    await tx('thumb', 'readwrite', (s, m) => (s ? s.put({ blob, at, v }, id) : m.set(id, { blob, at, v }))).catch(() => {});
  },
  // 고르기 창 썸네일 캐시 — 키에 판 번호가 들어 있어 판이 바뀌면 새로 그린다
  async cacheGet(key) {
    const r = await tx('thumb', 'readonly', (s, m) => (s ? s.get(key) : { result: m.get(key) })).catch(() => null);
    return (r && r.blob) || null;
  },
  async cacheSet(key, blob) {
    await tx('thumb', 'readwrite', (s, m) => (s ? s.put({ blob, at: Date.now() }, key) : m.set(key, { blob }))).catch(() => {});
  },
  // 지난 판 캐시 지우기 (suffix로 끝나지 않는 'tpl:' · 'pre:' 키)
  async pruneCache(suffix) {
    const d = await open();
    if (!d) return;
    await new Promise((res) => {
      try {
        const t = d.transaction('thumb', 'readwrite'), s = t.objectStore('thumb'), r = s.openKeyCursor();
        r.onsuccess = () => {
          const c = r.result;
          if (!c) return;
          const k = String(c.key);
          if ((k.startsWith('tpl:') || k.startsWith('pre:')) && !k.endsWith(suffix)) s.delete(c.key);
          c.continue();
        };
        t.oncomplete = t.onerror = t.onabort = () => res();
      } catch { res(); }
    });
  },
  on(f) { subs.add(f); return () => subs.delete(f); },
};
