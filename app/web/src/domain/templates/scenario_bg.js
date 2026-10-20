// Best Scenario · 배경 테마 — 레이아웃은 그대로 두고, 장마다 그 장에 맞는 서로 다른 배경 사진을 깐다.
// 데이터: src/scenario_bg.json (build/bg/make_bg.py 가 build/bg/plan.json 으로 만든다 — 장 수와 배경 수가 같은지,
// 같은 사진을 두 번 쓰지 않는지 확인). 배경이 있는 시나리오는 모든 장에 배경이 있다(어떤 장만 빠지는 일 없음).
// 사진은 시나리오마다 img/bg/<시나리오>.json 한 파일로 묶여 있고, 배경 주소는 "img/bg/bs01.json#<번호>" (src/bgpack.js).
// 렌더링: slide.jsx applyOverrides 가 ov.bg 를 레이아웃 루트 배경으로 깐다 · PPTX는 장마다 슬라이드 배경(서식 › 배경)으로.
// 이 구성으로 시작한 제안서는 p.bg(테마 · 사진 목록)를 이어받아, 나중에 넣는 장에도 아직 안 쓴 사진을 깐다(store.js syncBg).
import BG from './scenario_bg.json' with { type: 'json' };
export const SCENARIO_BG = BG; // { bsNN: { name, pack, n (장 수), spare (여분 수), from: [원본 사진], map?: [장 k → 묶음 번호] } }
// map: Storyboard로 다시 짜며(2026-10-19) 장 순서가 바뀐 시나리오 — 원래 장은 원래 배경 사진 그대로, 새로 넣은 장은 빠진 장 · 여분 사진.

/** the ov.bg value slide k of scenario id carries */
export function bgOfSlide(id, k) {
  const b = BG[id];
  if (!b || k >= b.n) return null;
  return { src: b.pack + '#' + (b.map ? b.map[k] : k), theme: id };
}
/** a proposal started from scenario id keeps the whole photo list, so slides added later get an unused one */
export function bgTheme(id) {
  const b = BG[id];
  return b ? { theme: id, name: b.name, pool: Array.from({ length: b.n + b.spare }, (_, k) => b.pack + '#' + k) } : null;
}
