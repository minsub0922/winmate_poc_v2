# store.js — 히스토리 예시 개편(SEEDV 4) 반영: A 커피 · E 오피스 parts 를 seeds_parts.json 에서, 손대지 않은 예시만 새 버전으로 교체
import re, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'src/store.js'
s = open(p, encoding='utf8').read()
assert 'seeds_parts.json' not in s, 'already patched'
s = s.replace("import { caseSeeds } from './seeds_cases.js';", "import { caseSeeds } from './seeds_cases.js';\nimport SEED_PARTS from './seeds_parts.json';\nimport PREV_FP from './seeds_prev_fp.json';", 1)
s, n = re.subn(r"const SEEDV = 3;[^\n]*", "const SEEDV = 4; // 2: 금융권 RFP 샘플 4건 · 3: 업종 · 전략별 히스토리 17건(seeds_cases) · 4: 히스토리 예시 기승전결 개편(파트마다 레이아웃 2~3장, 사진 중심) — 손대지 않은 예시만 새 버전으로", s)
assert n == 1
# A 커피 parts
s, n = re.subn(r"\n    parts: \[\n      \{ id: uid\('s'\), type: 'market', name: '시장 · 전략'.*?\n    \],\n  \};\n  const E = \{", "\n    parts: seedParts('p_seed_acoffee', t - 3600e3 * 2),\n  };\n  const E = {", s, flags=re.S)
assert n == 1, 'A parts'
s, n = re.subn(r"\n    parts: \[\n      \{ id: uid\('s'\), type: 'market', name: '스마트 빌딩 시장'.*?\n    \],\n  \};\n  const B = \{", "\n    parts: seedParts('p_seed_eoffice', t - 86400e3 * 1),\n  };\n  const B = {", s, flags=re.S)
assert n == 1, 'E parts'
# helpers before seedProposals
s = s.replace("export function seedProposals() {", """// A 커피 · E 오피스 예시의 Storyboard (seeds_parts.json — 히스토리 예시 개편 때 케이스와 같은 도구로 만듦). 근거 시각은 마지막 수정 시각.
function seedParts(id, at) {
  const parts = structuredClone(SEED_PARTS[id] || []);
  for (const s of parts) for (const x of s.layouts || []) for (const e of Object.values(x.ev || {})) if (e.at == null) e.at = at;
  return parts;
}
/** 예시 지문 — 레이아웃 · 상태 · 채운 값 · 파트 이름이 원래 그대로인지(사용자가 손대지 않았는지) 본다. 새 버전으로 바꿀 때만 쓴다. */
export function seedFingerprint(p) {
  const rows = [];
  for (const s of p.parts || []) {
    for (const x of s.layouts || []) {
      const ov = x.ov || {};
      const t = Object.keys(ov.t || {}).sort().map((k) => k + '=' + JSON.stringify(ov.t[k]));
      const im = Object.keys(ov.img || {}).sort().map((k) => k + '=' + ((ov.img[k] || {}).src || ''));
      rows.push([s.deck ? 'deck' : s.type, x.f, x.status, t.join('|'), im.join('|')].join('¦'));
    }
    if (!s.deck) rows.push('part:' + s.type + ':' + s.name);
  }
  const str = rows.join('\\n');
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + str.length;
}
export function seedProposals() {""", 1)
# withNewSeeds
old = re.search(r"// 예전에 저장된 히스토리에도 새 샘플.*?\nfunction withNewSeeds\(list\) \{.*?\n\}\n", s, re.S)
assert old, 'withNewSeeds'
s = s[:old.start()] + """// 예전에 저장된 히스토리에도 새 샘플(2: RFP 4건 · 3: 히스토리 17건)을 버전마다 한 번만 넣는다. 지운 뒤에는 다시 넣지 않음.
// 4: 개편한 히스토리 예시 — 저장된 예시가 이전 버전 그대로(지문이 같음)일 때만 새 버전으로 바꾸고, 사용자가 고친 예시는 그대로 둔다.
function withNewSeeds(list) {
  let ver = 0;
  try { ver = Number(localStorage.getItem(SEEDV_KEY) || 0); } catch (e) {}
  if (ver >= SEEDV) return list;
  const t = now();
  const fresh = new Map(seedProposals().map((p) => [p.id, p]));
  const cur = list.map((p) => (PREV_FP[p.id] && fresh.has(p.id) && seedFingerprint(p) === PREV_FP[p.id] ? fresh.get(p.id) : p));
  const have = new Set(cur.map((p) => p.id));
  const add = [...(ver < 2 ? rfpSeeds(t, { uid }) : []), ...(ver < 3 ? caseSeeds(t) : [])].filter((p) => !have.has(p.id));
  const out = [...add, ...cur].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  try { localStorage.setItem(KEY, JSON.stringify(out)); localStorage.setItem(SEEDV_KEY, String(SEEDV)); } catch (e) {}
  return out;
}
""" + s[old.end():]
open(p, 'w', encoding='utf8').write(s)
print('patched', p)
