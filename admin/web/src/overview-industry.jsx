// 「전체 파트」 팝업 — 업종별 고정 시트 (Overview)
//   Overview 는 업종마다 쓰는 제품 · 솔루션이 크게 달라서, 업종 묶음(외식 · 의료 · 교육 · 오피스 … 20곳)마다 레이아웃(같은 계열, 칸 수가 다름)과
//   내용이 정해진 고정 시트 한 장을 쓴다(사용자 규칙 2026-11-16). 세부 업종(상급종합 · 중소 병원 · 의원 …)은 같은 묶음의 시트를 같이 쓴다.
//   파트 이름 오른쪽 드롭다운으로 업종을 고르면 그 업종의 시트로 바로 바뀐다 — 시트는 화면 번들에 함께 실려 있어 서버에 다시 묻지 않는다.
//   시트: overview-sheets.json (app/scripts/vertical_standard/overview_industry.py 가 만든다 — 손으로 고치지 않는다).
//   어느 파트 · 어느 장이 업종별 고정인지는 파트 목록 정의(part-flows.js PART_CATALOG.industry)가 정한다. 지금은 목록에만 쓴다(실제 덱 반영 전).
import React, { useEffect, useMemo, useState } from 'react';
import { addLocalPreviews } from './local-previews.js';
import './overview-industry.css';

// 미리보기 문서 — 서버가 주는 레이아웃 미리보기와 같은 틀(스크립트 · 바깥 주소 없음, 그림은 파일에 담긴 data: 만)
const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; script-src 'none'; connect-src 'none'";
const page = body => '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + CSP
  + '"><style>html,body{margin:0;width:1280px;height:720px;overflow:hidden}*{box-sizing:border-box}</style></head><body>' + body + '</body></html>';

/** 파일 → { sheets, byId, byLayout, preview(layout) } — sheets: [{ id, name, place, verticals, layout, code, shape, devices, solutions, services }] */
export function overviewBook(data) {
  const images = data.images || {};
  const sheets = (data.sheets || []).map(({ html, ...s }) => s);
  const htmlOf = Object.fromEntries((data.sheets || []).map(s => [s.layout, s.html]));
  const pages = new Map();
  return {
    sheets, byId: Object.fromEntries(sheets.map(s => [s.id, s])), byLayout: Object.fromEntries(sheets.map(s => [s.layout, s])),
    preview(layout) {
      if (!htmlOf[layout]) return null;
      if (!pages.has(layout)) pages.set(layout, page(htmlOf[layout].replace(/@img\d+@/g, t => images[t] || '')));
      return pages.get(layout);
    },
  };
}
/** 시트의 레이아웃 정보 — 서버 레이아웃 목록(code · name · when)과 같은 모양 */
export const sheetMeta = s => ({
  code: s.code,
  name: `Device · Solution · Service 도식 · ${s.name} 고정 시트 (디바이스 ${s.shape.devices} · 솔루션 ${s.shape.solutions} · 서비스 ${s.shape.services})`,
  when: `01 제안 개요 — ${s.name} 업종에 정해 둔 고정 시트. 디바이스 · 솔루션 · 서비스를 채우거나 고치지 않고 그대로 씁니다(꼬리말 · 쪽 번호만 덱마다 바뀜).`,
});
/** 시트 한 줄 설명 — '의료 시트 · 디바이스 6 · 솔루션 5' (내용 고정 표식은 장 표시가 따로 붙인다) */
export const sheetCaption = s => `${s.name} 시트 · 디바이스 ${s.shape.devices} · 솔루션 ${s.shape.solutions}`;

let book = null; let pending = null;
export function loadOverviewSheets() {
  if (!pending) {
    pending = import('./overview-sheets.json', { with: { type: 'json' } }).then(m => { book = overviewBook(m.default || m); return book; });
    pending.catch(() => { pending = null; });
  }
  return pending;
}
// 시트 레이아웃(L_VS_DSS_<업종>)의 미리보기는 서버가 아니라 여기서 준다 — 장표 틀(LayoutFrame) · 크게 보기 · 사진 겹침 점검이 그대로 쓴다
addLocalPreviews(f => (book ? book.preview(f) : null));

/**
 * 업종별 고정 시트를 쓰는 파트(part.industry)의 상태 — { sheets, sheet, pick(id), meta } · 그런 파트가 아니거나 시트를 아직 못 받았으면 null
 *   meta: 고른 시트의 레이아웃 정보({ [layout]: { code, name, when } }) — 레이아웃 목록에 얹어 쓴다
 */
export function useIndustrySheet(part) {
  const on = !!(part && part.industry);
  const [data, setData] = useState(book);
  const [id, setId] = useState('');
  useEffect(() => {
    if (!on || data) return undefined;
    let alive = true;
    loadOverviewSheets().then(b => alive && setData(b), () => {});
    return () => { alive = false; };
  }, [on, data]);
  return useMemo(() => {
    if (!on || !data || !data.sheets.length) return null;
    const sheet = data.byId[id] || data.sheets[0];
    return { sheets: data.sheets, sheet, pick: setId, meta: { [sheet.layout]: sheetMeta(sheet) } };
  }, [on, data, id]);
}
/** 파트의 그 장(part.industry.fam)을 고른 업종의 고정 시트로 바꾼다 — 장의 f 가 시트 레이아웃이 되고 sheet 에 시트 정보가 실린다.
 *  그 장은 내용 고정(fixed — 자물쇠 표식)이다: 업종에 정해 둔 내용을 그대로 쓴다 */
export function withIndustrySheet(part, sheet) {
  if (!part.industry || !sheet) return part;
  return { ...part, slots: part.slots.map(x => (x.fam === part.industry.fam ? { ...x, f: sheet.layout, fs: [sheet.layout], sheet, fixed: true, fixedBy: 'industry', swapped: 0 } : x)) };
}

/** 파트 이름 오른쪽 — 업종 드롭다운 */
export function IndustrySelect({ state, partName }) {
  return <label className="lpx-ind" title="업종을 바꾸면 그 업종의 고정 시트로 바로 바뀝니다">
    <span>업종</span>
    <select value={state.sheet.id} aria-label={partName + ' 업종 선택'} onChange={e => state.pick(e.target.value)}>
      {state.sheets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  </label>;
}
/** 고른 업종 한 줄 — 그 업종에 드는 세부 업종 이름과 칸 수만(설명 글은 두지 않는다) */
export function IndustryNote({ K, state }) {
  const names = useMemo(() => Object.fromEntries(K.toc.tocVerticals().map(v => [v.id, v.nm])), [K]);
  const s = state.sheet;
  return <p className="lpx-ind-note" data-industry={s.id}>
    <b>{s.name}</b>
    <span>{s.verticals.map(id => names[id] || id).join(' · ')}</span>
    <i>디바이스 {s.shape.devices} · 솔루션 {s.shape.solutions} · 서비스 {s.shape.services}</i>
  </p>;
}
/** 장 상세(마우스를 대면)의 줄 — 업종 · 레이아웃 · 디바이스 · 솔루션 · 서비스 */
export function IndustryRows({ sheet: s }) {
  const cols = n => (n > 1 ? `${n}열 격자` : '한 줄씩');
  return <>
    <div><dt>업종</dt><dd>{s.name} 고정 시트 — 세부 업종 {s.verticals.length}곳 공통</dd></div>
    <div><dt>레이아웃</dt><dd>디바이스 {s.shape.devices}칸({cols(s.shape.deviceColumns)}) · 솔루션 {s.shape.solutions}칸({cols(s.shape.solutionColumns)}) — 같은 계열이고 업종마다 칸 수가 달라요</dd></div>
    <div><dt>디바이스</dt><dd>{s.devices.map(d => d.name).join(' · ')}</dd></div>
    <div><dt>솔루션</dt><dd>{s.solutions.map(d => d.name).join(' · ')}</dd></div>
    <div><dt>서비스</dt><dd>{s.services.join(' · ')}</dd></div>
  </>;
}
