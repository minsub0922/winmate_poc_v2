// 내용 고정 — 관리자 「전체 파트」의 완전 고정 · 업종별 고정 파트와 자물쇠(내용 고정) 장은 실제 제안서에서도 AI가 쓰지 않는다.
// 고정 = AI가 채우지 않는다는 뜻이고, 사람은 편집기에서 얼마든지 고친다(사용자 지시 2026-11-17).
// 목록은 fixed_content.json 하나 — 레이아웃 자동 구성(composer auto.py)도 같은 파일을 읽는다.
import RULES from './fixed_content.json' with { type: 'json' };

const SHEETS = Object.keys(RULES.sheets).map((s) => new RegExp(s));
/** 내용이 고정인 장(레이아웃 id) */
export const isFixedSheet = (f) => !!f && SHEETS.some((re) => re.test(f));
/** 파트 전체가 내용 고정인 목차(toc key) — 그 파트의 장은 모두 AI가 쓰지 않는다 */
export const FIXED_PARTS = Object.keys(RULES.parts);
export const isFixedPart = (toc) => !!toc && FIXED_PARTS.includes(toc);
/** 제안서 목차(part)의 toc key — 구성으로 놓인 목차는 part.agent.toc */
export const partToc = (part) => (part && (part.toc || (part.agent && part.agent.toc))) || null;
