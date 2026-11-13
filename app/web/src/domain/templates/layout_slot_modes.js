// 레이아웃 칸별 '고정 / 교체 / AI' 구분 (2026-11-12) — 분류 데이터는 slot_modes.json (app/scripts/layout_slot_modes.mjs 가 만듦).
// 칸 요소에 data-fix 로 붙인다:
//   fixed    고정 — 고객이 바뀌어도 그대로 (Why Samsung · 솔루션 설명 · 구조 라벨)
//   product  제품 교체 — 제품 이름 · 모델 · 사양 · 제품 컷 (제품을 바꿀 때만 제품 DB 값으로)
//   solution 솔루션 교체 — 범용 장의 솔루션 이름 · 기능 · 화면 (솔루션을 바꿀 때만)
//   case     사례 교체 — 도입사례 고객 · 성과 · 사진 (사례를 바꿀 때만)
//   section  목차 번호 — 눈썹 · 간지 번호 · 장 이름 (목차 순서로 자동)
//   pick     후보 선택 — 같은 레이아웃 묶음(layout_variants.json)에서 업종 후보마다 정해진 글 · 사진 (고른 업종의 후보 값)
//   (없음)   AI 작성 — 고객 · 업종 · 요구에 맞춰 AI가 쓰는 칸
// AI 채우기(services/ai.js · 레이아웃 Agent)는 data-fix 칸을 고쳐 쓰지 않는다. 사람은 편집기에서 모든 칸을 그대로 고칠 수 있다.
import MODES from './slot_modes.json' with { type: 'json' };

export const SLOT_MODE_LABEL = { fixed: '고정', product: '제품 교체', solution: '솔루션 교체', case: '사례 교체', pick: '후보 선택', section: '목차 번호', ai: 'AI 작성' };
export const LAYOUT_LOCK_LABEL = { fixed: '전부 고정', data: '고정 · 교체 · 후보만', mostly: '대부분 고정', ai: 'AI 작성 위주' };

const BY = new Map();
function table(f) {
  if (BY.has(f)) return BY.get(f);
  const e = MODES.layouts[f];
  let v = null;
  if (e) {
    v = { t: {}, img: {}, lock: e.lock || 'ai' };
    for (const [m, ids] of Object.entries(e)) if (Array.isArray(ids)) for (const i of ids) v.t[i] = m;
    for (const [m, ids] of Object.entries(e.img || {})) for (const i of ids) v.img[i] = m;
  }
  BY.set(f, v);
  return v;
}

/** { t: {slot: mode}, img: {slot: mode}, lock } for a built-in layout — null for My 템플릿 and unknown layouts */
export const slotModes = (f) => table(f);
/** a text slot's mode — 'ai' when the layout has no entry for it */
export const textMode = (f, i) => table(f)?.t[i] || 'ai';
export const imageMode = (f, i) => table(f)?.img[i] || 'ai';
/** count per mode for the library / detail chips */
export function modeCounts(f) {
  const v = table(f); if (!v) return null;
  const c = { fixed: 0, swap: 0 };
  for (const m of Object.values(v.t)) if (m === 'fixed') c.fixed++; else c.swap++;
  return c;
}

const TAG = /<([a-zA-Z][\w-]*)\b([^>]*?)\bdata-(tb|img)="(\d+)"([^>]*)>/g;
/** mark the slots of a built-in layout with data-fix="<mode>" */
export function markSlotModes(f, html) {
  const v = table(f);
  if (!v || !html || html.includes('data-fix=')) return html;
  return html.replace(TAG, (tag, name, a, kind, i, b) => {
    const m = kind === 'tb' ? v.t[i] : v.img[i];
    return m ? `<${name}${a}data-${kind}="${i}" data-fix="${m}"${b}>` : tag;
  });
}
