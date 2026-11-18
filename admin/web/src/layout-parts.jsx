// 「레이아웃 구성 관리」 '전체 파트 확인하기' 팝업 — 파트(목차 = Storyboard 버블)마다 카드 하나, 카드 안에 그 파트를 이루는 장 전체를 3열로.
//   장에 마우스를 대면(또는 Tab 으로 가면) 옆에 상세(큰 미리보기 · 자리 · 장 수 · 모양 · 쓰는 구성)가 뜨고, 누르면 크게 본다.
//   흐름 표시(완전 고정 · 순서 고정 · 장 수만 달라짐 · 구성마다 다름 · 정해진 흐름 없음)는 모든 구성 × 업종 덱을 조립해 잰 값이다(part-flows.js partFlows).
//   카드에는 흐름을 풀어 쓴 설명 줄을 두지 않는다(사용자 지시 2026-11-16) — 종류 표식 · 순서 줄 · 장 표시 · 상세로만 보인다.
//   목록은 잰 값에 파트 목록 정의(PART_CATALOG — 뺀 목차 · 목록 이름 · 장 수 제한 없는 장 · 한 파트로 합친 구독 · 숫자 00)를 얹은 것이다(curateParts).
//   지금은 목록만 정리한 것 — 추천 구성과 실제 덱은 그대로다.
//   내용 고정 표식(자물쇠)은 장마다 붙는다 — 파트가 완전 고정이 아니어도 그 장의 내용이 모든 업종에서 같으면(잰 값 slot.fixed), 또는 목록 정의가 고정으로 정했으면.
//   미리보기는 레이아웃 기본 내용(예시)이지만, 한 카드 안에서 같은 사진을 두 번 쓰지 않는다 — 겹치는 사진은 같은 계열 다른 장의 사진으로 바꾸고, 없으면 빈 사진 칸으로 둔다(picturePlan).
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, number } from './api';
import { Icon } from './icons';
import { Modal, Button, IconButton, Loading, ErrorBox } from './components';
import { LayoutFrame, PartIcon, Overlay, previewOf } from './layouts.jsx';
import { partFlows, curateParts, catalogSize, KIND, KIND_ORDER, ORDERED, familyOf } from './part-flows.js';
import { useIndustrySheet, withIndustrySheet, IndustrySelect, IndustryNote, IndustryRows, sheetCaption, sheetMeta } from './overview-industry.jsx';
import { RoutedSheets } from './space-route.jsx';
import { partArc, arcStyle, ArcMark } from './part-arc.jsx';
import { tint } from './part-arc.js';
import { loadSpecSheets } from './spec-route.js';
import { loadScenarioSheets } from './scenario-route.js';
import { useSector, withSector, SectorSelect, SectorNote } from './ua-industry.jsx';
import { PartRail } from './part-rail.jsx';
import './layout-parts.css';

const pad = n => String(n).padStart(2, '0');
// 같은 자리에서 칸 수만 다른 장 — 묶음 이름(장 이름에 칸 수가 들어 있어 묶음 이름으로 보인다)
const FAMILY_NAME = { L_VS_DIV: '간지 · 풀블리드 사진 + 이 장에서 다루는 것', L_VS_BIRD: '조감도 · 공간 범례', L_VS_MAP: '업종 Map · 공간 × 제품', L_VS_SOL: '솔루션별 장 · 기능 · 적용 공간 · 대표 장면',
  L_TOC_TECH: '핵심 기술 · 솔루션 × 키워드 3', L_TOC_BOM: '구성 · 수량표 · 공간 × 제품 5', L_TOC_JOURNEY: '고객/공간 시나리오 · 이용자 여정 + 솔루션 기능 on/off', L_SUB_PKG: '업종 구독 패키지 상세 · 사진 + 품목',
  L_TOC_SCN_S: '고객/공간 시나리오 · 공간별 시나리오 — 공간 3곳 · 제품 겹쳐 보기 · 솔루션 · 서비스 기능 on/off', L_TOC_SCN_MAP: '고객/공간 시나리오 · 활용 맵 — 솔루션 · 서비스 × 공간' };
/** 장의 온전한 이름 — 레이아웃 카탈로그 이름(칸 수만 다른 장은 묶음 이름) */
const fullName = (slot, meta) => FAMILY_NAME[slot.fam] || (meta[slot.f] && meta[slot.f].name) || slot.f;
// 짧은 이름 — 카탈로그 이름의 첫 마디로는 뜻이 안 서는 장
const SHORT = { L_VS_DSS: 'Device · Solution · Service 도식', L_VS_NEEDS: '니즈 · 기술 · 제안', L_TOC_TCO: '구매 방식 · 5년 TCO', L_TOC_BOM: '구성 · 수량표',
  L_VS_BIRD: '조감도', L_VS_MAP: '업종 Map', L_VS_SOL: '솔루션별 장', L_TOC_JOURNEY: '이용자 여정', L_SUB_PKG: '업종 구독 패키지', L_TOC_SCN_S: '공간별 시나리오', L_TOC_SCN_MAP: '활용 맵',
  // 파트 이름을 바꾼 뒤(사용자 지시 2026-11-16) 카탈로그 이름의 첫 마디가 옛 파트 이름인 장 — 카드 안에서도 새 이름으로(상세의 온전한 이름은 카탈로그 그대로)
  L_TOC_PSPEC: '제품 스펙', L_VS_CASE: '유관 사례' };
/** 파트 안 장마다 짧은 이름 — 카탈로그 이름의 첫 마디, 파트 안에서 겹치면 둘째 마디까지(첫 마디가 파트 이름이면 둘째 마디만) */
function withNames(p, meta, partName) {
  const segs = p.slots.map(x => (SHORT[x.fam] ? [SHORT[x.fam]] : fullName(x, meta).replace(/\s*\([^)]*\)/g, '').split(' · ').map(s => s.trim()).filter(Boolean)));
  const first = segs.map(s => s[0]);
  const dup = name => first.filter(x => x === name).length > 1;
  return { ...p, slots: p.slots.map((x, i) => {
    const s = segs[i]; let label = first[i];
    if (!SHORT[x.fam] && dup(label) && s.length > 1) label = label === partName ? s[1] : s.slice(0, 2).join(' · ');
    // 목록 정의가 구실 이름(고민 · 효과 …)을 준 장은 그 이름을 앞에, 장 이름은 곁에
    return { ...x, label: x.role || label, hint: x.role ? label : '', full: fullName(x, meta) };
  }) };
}
/** 장 수 범위 — max 가 null 이면 제한 없음('2+') */
const range = ({ min, max }) => (max === null ? `${min}+` : min === max ? String(min) : `${min}–${max}`);

/* ---------- 숫자 00 — 작성자가 직접 입력하는 장의 미리보기 ----------
   미리보기 HTML 의 글에서 숫자(3~6 · 6·12·36 · 20 …)를 00 으로 바꾼다. 장 번호 눈썹(03 · …) · 차례 번호(01–09) · 꼬리말 쪽 번호 · 낱말 속 숫자(B2B)는 그대로. */
const NUMBER = /(?<![A-Za-z\d])\d(?:[\d~·.,:–-]*\d)?(?![A-Za-z\d])/g;
export function zeroNumbers(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (doc.body.getAttribute('data-lpx-numbers') === '00') return html; // 숫자가 처음부터 00 인 장(당사의 이해 새 장 — ua-sectors.js)은 그대로 둔다: 달 · 시각 · 차례 번호까지 00 이 되지 않게
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.trim() && !(node.parentElement && /^(STYLE|SCRIPT)$/.test(node.parentElement.tagName))) nodes.push(node);
  }
  // 맨 끝의 숫자만 있는 글은 꼬리말 쪽 번호(미리보기에는 'CONFIDENTIAL · ' 없이 쪽만 보인다)
  const last = nodes[nodes.length - 1];
  const page = last && /^\d{1,3}$/.test(last.nodeValue.trim()) ? last : null;
  for (const node of nodes) {
    const text = node.nodeValue; const t = text.trim();
    if (node === page || /^\d{2} · /.test(t) || /^CONFIDENTIAL/.test(t) || /^0\d$/.test(t)) continue;
    const next = text.replace(NUMBER, '00');
    if (next !== text) node.nodeValue = next;
  }
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
/* ---------- 한 카드 안에서 같은 사진을 두 번 쓰지 않는다 (사용자 규칙 2026-11-16: "비록 예시지만 동일 이미지를 재사용하지 마") ----------
   사진 = 칸을 채우는 그림(object-fit: cover). 제품 컷 · 아이콘(contain)은 같은 제품이면 되풀이될 수 있으므로 세지 않는다.
   카드의 장을 차례로 보며 이미 나온 사진이 다시 나오면, 같은 계열(L_SUB_ · L_TOC_ …)에서 이 카드에 안 쓰인 장의 사진으로 바꾼다.
   목록 정의가 자리마다 정해 둔 사진(slot.photos)이 있으면 그 사진을 먼저 쓴다 — 자동으로 고르면 내용과 어긋나는 자리(구독 솔루션).
   바꿀 사진이 없으면 그 자리는 빈 사진 칸으로 둔다. 같은 그림은 미리보기 리소스 id(주소)로 가린다. */
const RESOURCE = /\/admin\/api\/layout-presets\/layouts\/([^/]+)\/resource\/([0-9a-f]{24})/;
const isPhoto = img => !!img.getAttribute('src') && /object-fit:\s*cover/.test(img.getAttribute('style') || ''); // 주소 없는 그림(빈 사진 칸)은 사진이 아니다
// 바꿔 넣을 수 있는 사진 — 칸 이름(alt)이 제품 컷 · 솔루션 화면인 그림은 사진 자리에 넣지 않는다
const isScene = img => !/컷|화면|로고|아이콘/.test(img.getAttribute('alt') || '');
const photoImgs = doc => [...doc.querySelectorAll('img')].filter(isPhoto);
const photosOf = html => photoImgs(new DOMParser().parseFromString(html, 'text/html')).map(img => {
  const src = img.getAttribute('src') || ''; const m = RESOURCE.exec(src);
  return m ? { layout: decodeURIComponent(m[1]), id: m[2], scene: isScene(img) } : { layout: '', id: src, scene: false };
});
const prefixOf = f => (/^L_[A-Z]+_/.exec(f) || [''])[0];
const plans = new Map(); // 카드(파트 + 장 목록) → Promise<장마다 null | [사진마다 null(그대로) · { layout, id }(바꿈) · 'blank'(빈 칸)]>
export function picturePlan(p, meta) {
  const key = p.key + '|' + p.slots.map(x => x.f).join();
  if (!plans.has(key)) {
    const run = (async () => {
      const load = f => previewOf(f, true).then(h => photosOf(h), () => []);
      const per = await Promise.all(p.slots.map(x => load(x.f)));
      // 목록 정의가 정해 둔 사진(slot.photos) — 장의 n번째 사진을 다른 장의 index번째 사진으로
      const fixed = per.map(() => []);
      await Promise.all(p.slots.map(async (slot, i) => {
        for (const [n, src] of Object.entries(slot.photos || {})) { const x = (await load(src.from))[src.index]; if (x && x.layout && per[i][+n]) fixed[i][+n] = x; }
      }));
      const reserved = new Set([...per.flat(), ...fixed.flat().filter(Boolean)].map(x => x.id));
      // 바꿔 넣을 사진 — 같은 계열에서 이 카드에 안 쓰인 장(합치며 뺀 장 먼저)의 사진 가운데 이 카드에 없는 것. 필요할 때만 한 장씩 불러온다.
      const shown = new Set(p.slots.flatMap(x => x.fs)); const first = new Set(p.dropped || []);
      const donors = new Map(); const pool = []; const pooled = new Set();
      const nextAlt = async family => {
        if (!donors.has(family)) donors.set(family, Object.keys(meta).filter(f => prefixOf(f) === family && !shown.has(f))
          .sort((a, b) => (first.has(b) ? 1 : 0) - (first.has(a) ? 1 : 0) || a.localeCompare(b, 'en', { numeric: true })).slice(0, 48));
        for (;;) {
          const k = pool.findIndex(x => x.family === family);
          if (k >= 0) return pool.splice(k, 1)[0];
          const f = donors.get(family).shift();
          if (!f) return null;
          for (const x of await load(f)) if (x.layout && x.scene && !reserved.has(x.id) && !pooled.has(x.id)) { pooled.add(x.id); pool.push({ ...x, family }); }
        }
      };
      const used = new Set(); const out = [];
      for (let i = 0; i < per.length; i++) {
        let changed = false; const row = [];
        for (let n = 0; n < per[i].length; n++) {
          const x = per[i][n]; const pick = fixed[i][n];
          if (pick && !used.has(pick.id)) { used.add(pick.id); row.push(pick); changed = true; continue; }
          if (!used.has(x.id)) { used.add(x.id); row.push(null); continue; }
          changed = true;
          const alt = await nextAlt(prefixOf(p.slots[i].f));
          if (alt) { used.add(alt.id); row.push(alt); } else row.push('blank');
        }
        out.push(changed ? row : null);
      }
      return out;
    })();
    run.catch(() => plans.delete(key));
    plans.set(key, run);
  }
  return plans.get(key);
}
/** 미리보기 HTML 의 사진을 계획대로 바꾼다 — list: 사진(문서 순서)마다 null · { layout, id } · 'blank' */
function swapPictures(html, list) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  photoImgs(doc).forEach((img, i) => {
    const r = list[i]; if (!r) return;
    if (r === 'blank') {
      const box = doc.createElement('div');
      box.setAttribute('data-lpx-blank', '');
      box.setAttribute('style', 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#eef1f4;color:#9aa6b2;font-size:22px;letter-spacing:-.2px;');
      box.textContent = '사진';
      img.replaceWith(box);
      return;
    }
    const query = (img.getAttribute('src') || '').split('?')[1];
    img.setAttribute('src', '/admin/api/layout-presets/layouts/' + encodeURIComponent(r.layout) + '/resource/' + r.id + (query ? '?' + query : ''));
  });
  return '<!doctype html>' + doc.documentElement.outerHTML;
}
/** 장 하나의 미리보기를 고치는 함수 — 사진 바꾸기 → 숫자 00 (둘 다 없으면 null) */
const patchFor = (zero, pics) => (!zero && !pics ? null : html => { let h = html; if (pics) h = swapPictures(h, pics); if (zero) h = zeroNumbers(h); return h; });
/** 화면 가까이 온 뒤에 true — 카드의 사진 계획은 그때 세운다 */
function useSeen(ref) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const view = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setSeen(true); view.disconnect(); } }, { rootMargin: '300px' });
    view.observe(el);
    return () => view.disconnect();
  }, []);
  return seen;
}
const shortCode = (f, meta) => (meta[f] && meta[f].code) || f.replace(/^L_/, '').replace(/_/g, '-');

/** 장 하나의 수 — '늘 1장' · '제품 수만큼 3–10장' */
function countText(slot, kind) {
  if (slot.count) return slot.count; // 목록 정의가 장 수 설명을 준 장(공간별 제안의 조감도 — 제품이 8개를 넘으면 묶음마다)
  if (slot.n.max === null) return `${slot.by}만큼 · 장 수 제한 없음`;
  if (slot.by && slot.n.min !== slot.n.max) return `${slot.by}만큼 ${range(slot.n)}장`;
  if (kind === 'template' || kind === 'free') return slot.n.min === slot.n.max ? `쓸 때 ${slot.n.min}장` : `쓸 때 ${range(slot.n)}장`;
  return `늘 ${slot.n.min}장`;
}

/* ---------- 흐름 표시 ---------- */
const KIND_ICON = { fixed: 'lock', industry: 'lockrows', sector: 'tiles', branch: 'branch', flow: 'flow', repeat: 'stack', template: 'split', free: 'shuffle' };
const MARK_PATHS = {
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  lockrows: 'M3 11h9v8H3z M5 11V8.5a2.5 2.5 0 0 1 5 0V11 M16 8h5 M16 12.5h5 M16 17h5', // 자물쇠 + 줄(업종마다 한 장)
  tiles: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z', // 칸마다 다른 묶음(업종 묶음마다 항목 · 장이 다름 — 당사의 이해)
  branch: 'M6 3v18 M6 8h6a4 4 0 0 1 4 4v1 M6 15h10 M14 10l2 3 2-3 M14 12l2 3', // 갈래(고른 서비스에 따라 — 서비스 제안)
  flow: 'M3 12h4 M10 12h4 M17 12h4 M12 9l2 3-2 3 M5 9l2 3-2 3 M19 9l2 3-2 3',
  stack: 'M7 7h12v12H7z M4 4h12 M4 4v12',
  split: 'M4 6h6l4 6h6 M4 18h6l4-6 M17 9l3 3-3 3',
  shuffle: 'M3 7h4l10 10h4 M3 17h4l3-3 M14 10l3-3h4 M18 4l3 3-3 3 M18 14l3 3-3 3',
};
function Mark({ kind, size = 13 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={MARK_PATHS[KIND_ICON[kind]]}/></svg>;
}
export function KindBadge({ kind }) {
  return <span className={'lpx-kind k-' + kind} title={KIND[kind].note || undefined}><Mark kind={kind}/>{KIND[kind].label}</span>;
}

/* ---------- 장 상세(마우스를 대면) ---------- */
function Pop({ at, children }) {
  const box = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const W = el.offsetWidth; const H = el.offsetHeight; const gap = 12; const vw = window.innerWidth; const vh = window.innerHeight;
    let left = at.right + gap;
    if (left + W > vw - 8) left = at.left - gap - W;
    if (left < 8) left = Math.max(8, Math.min(vw - W - 8, at.left + at.width / 2 - W / 2));
    let top = at.top + at.height / 2 - H / 2;
    top = Math.max(8, Math.min(vh - H - 8, top));
    setPos({ left, top });
  }, [at]);
  return createPortal(<div ref={box} className="lpx-pop" role="tooltip" id="lpx-pop" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: 'hidden' }}>{children}</div>, document.body);
}
function SheetDetail({ K, p, slot, meta, total, pics }) {
  const m = meta[slot.f] || slot.meta || (slot.sheet ? sheetMeta(slot.sheet) : {}); // 업종별 고정 시트 · 당사의 이해 새 장(slot.meta)은 서버 레이아웃 목록에 없다
  const patch = useMemo(() => patchFor(slot.zero, pics), [slot.zero, pics]);
  const tpl = id => (K.toc.TPL[id] ? K.toc.TPL[id].name : id);
  const fixedKind = ORDERED.has(p.kind);
  const shapes = slot.fs.length > 1 ? slot.fs.map(f => shortCode(f, meta).replace(/^[A-Z]+-(?:[A-Z]+-)?/, '')) : [];
  const sols = slot.fam === 'L_VS_SOL' ? slot.fs.map(f => String((meta[f] && meta[f].name) || f).split(' · ')[0]) : [];
  return <div className="lpx-detail">
    <LayoutFrame f={slot.f} title={slot.full} thumb={false} patch={patch}/>
    <div className="lpx-detail-h"><b>{slot.role ? `${slot.role} — ${slot.full}` : slot.full}</b><small>{slot.fs.length > 1 ? `${shortCode(slot.f, meta)} 외 ${slot.fs.length - 1}종` : shortCode(slot.f, meta)}</small></div>
    <dl>
      <div><dt>자리</dt><dd>{fixedKind ? <>{slot.step}번째 / {total}칸 — {slot.sheet ? '늘 이 자리 · 업종마다 정해 둔 시트' : p.kind === 'fixed' || slot.fixed ? '늘 이 자리 · 내용도 같음' : '늘 이 자리'}</> : '구성 · 업종에 따라 쓰는 자리가 달라요'}</dd></div>
      <div><dt>장 수</dt><dd>{countText(slot, p.kind)}{slot.by && slot.n.min !== slot.n.max && slot.repN > 0 && <> · 대표 덱 {slot.repN}장</>}</dd></div>
      {slot.zero && <div><dt>숫자</dt><dd>00으로 고정 — 제안서 작성자가 직접 입력</dd></div>}
      {shapes.length > 0 && slot.fam !== 'L_VS_SOL' && <div><dt>모양</dt><dd>{shapes.length}종 — {slot.shape}에 맞춰 골라요 <span className="lpx-codes">{shapes.join(' · ')}</span></dd></div>}
      {sols.length > 0 && <div><dt>솔루션 장</dt><dd>{sols.length}종 — 솔루션마다 정해진 장 <span className="lpx-codes">{sols.join(' · ')}</span></dd></div>}
      {slot.sheet && <IndustryRows sheet={slot.sheet}/>}
      {slot.sector && p.cluster && <div><dt>업종</dt><dd>{p.cluster.name} 묶음 — 세부 업종 {p.cluster.verticals.length}곳 공통 · 이 묶음에만 쓰는 새 장</dd></div>}
      <div><dt>내용</dt><dd>{slot.sheet ? <><b className="lpx-lock"><Mark kind="fixed" size={10}/>고정</b> — 업종마다 정해 둔 내용 그대로 · 채우거나 고치지 않음</> : slot.fixed ? <><b className="lpx-lock"><Mark kind="fixed" size={10}/>고정</b> — 모든 업종 같음{slot.zero ? ' · 숫자만 00으로 두고 직접 입력' : ''}{slot.swapped > 0 ? ` (같은 그림이 겹치지 않게 사진을 바꾼 업종 ${slot.swapped}곳만 사진이 달라요)` : ''}</>
        : familyOf(slot.f) === 'L_VS_DIV' ? '장 번호 · 제목 · 다루는 것 · 쪽' : slot.content || '업종마다 바뀜'}</dd></div>
      <div><dt>쓰는 구성</dt><dd>{slot.tpls.map(tpl).join(' · ')}</dd></div>
    </dl>
    {m.when && <p className="lpx-when">{m.when}</p>}
  </div>;
}

/* ---------- 파트 카드 ---------- */
// pics: 이 장의 사진 계획(undefined = 아직 세우는 중 — 미리보기를 잠깐 미룬다)
function Sheet({ K, p, slot, meta, total, pics, hover, zoom }) {
  const ref = useRef(null);
  const t = useRef(0);
  const patch = useMemo(() => patchFor(slot.zero, pics), [slot.zero, pics]);
  const show = delay => { clearTimeout(t.current); t.current = setTimeout(() => ref.current && hover({ p, slot, total, pics: pics || null, at: ref.current.getBoundingClientRect() }), delay); };
  const hide = () => { clearTimeout(t.current); hover(null); };
  useEffect(() => () => clearTimeout(t.current), []);
  const repeat = slot.by && slot.n.min !== slot.n.max;
  const numbered = ORDERED.has(p.kind);
  const locked = p.kind === 'fixed' || !!slot.fixed; // 내용 고정 표식(자물쇠) — 완전 고정 파트의 장 전부, 또는 파트는 아니어도 그 장의 내용이 고정
  return <li className={'lpx-sheet' + (repeat ? ' repeat' : '')} data-layout={slot.f} data-step={slot.step || undefined} data-fixed={slot.fixed ? '' : undefined}>
    <button type="button" ref={ref} onMouseEnter={() => show(140)} onMouseLeave={hide} onFocus={() => show(0)} onBlur={hide} onClick={() => { hide(); zoom({ f: slot.f, name: slot.role ? `${slot.role} — ${slot.full}` : slot.full, part: p, zero: !!slot.zero, pics: pics || null }); }}
      aria-label={`${numbered ? slot.step + '번째 장 · ' : ''}${slot.label} · ${countText(slot, p.kind)}${slot.fixed ? ' · 내용 고정' : ''} — 크게 보기`} aria-describedby="lpx-pop">
      <span className="lpx-frame-wrap">
        {pics === undefined ? <span className="lp-frame"><span className="lp-frame-wait" aria-hidden="true"/></span> : <LayoutFrame f={slot.f} title={slot.full} patch={patch}/>}
        {(numbered || locked) && <span className={'lpx-step' + (locked ? ' fixed' : '')} title={locked ? '내용 고정' : undefined}>{locked && <Mark kind="fixed" size={10}/>}{numbered ? pad(slot.step) : '고정'}</span>}
        {repeat && <span className="lpx-times">× {slot.by}</span>}
        {!repeat && slot.n.min > 1 && slot.n.min === slot.n.max && <span className="lpx-times">× {slot.n.min}</span>}
        {slot.zero && <span className="lpx-zero">숫자 00 · 직접 입력</span>}
      </span>
      <span className="lpx-cap"><b title={slot.full}>{slot.label}</b><small>{slot.hint ? slot.hint + ' · ' : ''}{slot.sheet ? sheetCaption(slot.sheet) + ' · ' : ''}{countText(slot, p.kind)}{slot.fs.length > 1 ? (slot.fam === 'L_VS_SOL' ? ` · 솔루션별 ${slot.fs.length}종` : ` · 모양 ${slot.fs.length}종`) : ''}{(p.kind === 'template' || p.kind === 'free') ? ` · 구성 ${slot.tpls.length}곳` : ''}{slot.fixed ? ' · 내용 고정' : ''}</small></span>
    </button>
  </li>;
}
/** 갈래 머리 — 서비스 제안의 갈래(삼성케어플러스 SAC · 비즈니스 · 구독 상품): 이름 · 고르면 나오는 조건 · 장 수 */
function BranchHead({ b }) {
  if (!b) return null;
  return <li className="lpx-branch-h" data-branch={b.id}><span className="lpx-branch-if">{b.when} 고르면</span><b>{b.label}</b><em>{b.steps.length}장</em></li>;
}
function PartCard({ K, p: p0, meta, ready, hover, zoom }) {
  const title = p0.title || K.toc.tocName(p0.key, null);
  // 업종별 고정 시트를 쓰는 파트(Overview) — 파트 이름 오른쪽 드롭다운에서 고른 업종의 시트를 그 장에 얹는다(overview-industry.jsx)
  const ind = useIndustrySheet(p0);
  // 업종 묶음마다 항목 · 장이 다른 파트(당사의 이해) — 드롭다운에서 고른 묶음의 간지 + 항목 장으로 카드를 바꾼다(ua-industry.jsx)
  const sec = useSector(K, p0);
  const p1 = useMemo(() => (ind ? withIndustrySheet(p0, ind.sheet) : sec ? withSector(p0, sec.book, sec.id, sec.names) : p0), [p0, ind, sec]);
  const names = useMemo(() => (ind ? { ...meta, ...ind.meta } : sec ? { ...meta, ...Object.fromEntries(p1.slots.filter(x => x.meta).map(x => [x.f, x.meta])) } : meta), [meta, ind, sec, p1]);
  const p = useMemo(() => withNames(p1, names, title), [p1, names, title]);
  // 사진 계획 — 카드가 화면 가까이 오고 레이아웃 목록(meta)이 온 뒤에 세운다. 못 세우면 그대로 보여 준다.
  const card = useRef(null); const seen = useSeen(card);
  const [plan, setPlan] = useState(undefined);
  useEffect(() => {
    if (!seen || !ready) return undefined;
    let alive = true;
    picturePlan(p1, meta).then(x => alive && setPlan(x), () => alive && setPlan([]));
    return () => { alive = false; };
  }, [seen, ready, p1]);
  const part = K.PARTS[p.type] || K.PARTS.free;
  const tpl = id => (K.toc.TPL[id] ? K.toc.TPL[id].name : id);
  const numbered = ORDERED.has(p.kind);
  const arc0 = partArc(p.key); // 기승전결 자리와 그 파트의 색 — 카드 띠 · 버블 · 유형 표식에 입힌다(part-arc.js)
  const arc = p.look ? { ...arc0, color: p.look.color, soft: tint(p.look.color, 0.9), line: tint(p.look.color, 0.68) } : arc0; // 직접 만든 파트는 고른 색
  return <section ref={card} className={'lpx-card h-' + (part.hue || 'slate')} data-part={p.key} data-kind={p.kind} data-arc={arc.stage.id} style={arcStyle(arc)} aria-label={title + ' 파트'}>
    <header>
      <span className="lpx-node"><PartIcon name={p.look ? p.look.icon : part.icon}/><ArcMark arc={arc}/></span>
      <div className="lpx-title">
        <h4>{title}{ind && <IndustrySelect state={ind} partName={title}/>}{sec && <SectorSelect state={sec} partName={title}/>}<em>{part.label}</em>{p.sector && <em className="lpx-defined" title="업종 묶음마다 정한 이해 항목과 새 장은 목록에서 정해 둔 것입니다. 실제 덱은 아직 구성마다 고른 기존 장을 씁니다.">실제 덱 반영 전</em>}{p.industry && <em className="lpx-defined" title="업종별 고정 시트는 목록에서 정해 둔 것입니다. 실제 덱은 아직 세부 업종마다 같은 장(VS-DSS)에 내용을 채웁니다.">실제 덱 반영 전</em>}{p.defined && <em className="lpx-defined" title="목록에서 정해 둔 구성입니다. 실제 덱은 아직 목차가 나뉘어 있어요.">실제 덱 반영 전</em>}{p.routed && !p.defined && <em className="lpx-defined" title="제품 수에 따라 시트를 골라 쓰는 구성은 목록에서 정해 둔 것입니다. 실제 덱은 아직 제품마다 한 장(기존 시트)을 씁니다.">실제 덱 반영 전</em>}{p.spec && <em className="lpx-defined" title="제품마다 한 장 · 사양 줄 수에 맞춘 시트 3종(대표 스펙 칸 없음)은 목록에서 정해 둔 것입니다. 실제 덱은 아직 숫자 3 + 사양 8줄 고정 장(TOC-PSPEC)을 씁니다.">실제 덱 반영 전</em>}</h4>
        <p>{p.goal}</p>
      </div>
      <div className="lpx-side"><KindBadge kind={p.kind}/><span className="lpx-meta">장 <b>{range(p.sheets)}</b> · 구성 <b>{p.tpls.length}</b></span></div>
    </header>
    {numbered && <ol className="lpx-seq" aria-label="장 순서">{p.slots.map(x => <li key={x.step} title={x.full}><span>{pad(x.step)}</span>{x.fixed && p.kind !== 'fixed' && <i className="lock" title="내용 고정"><Mark kind="fixed" size={10}/></i>}{x.label}{x.times && <em>× {x.times}</em>}{x.routed ? <em>{x.by}에 따라 · 시트 {x.variants.length}종</em> : x.by && x.n.min !== x.n.max ? <em>× {x.by}</em> : x.n.min > 1 ? <em>× {x.n.min}</em> : null}{x.zero && <em className="zero">숫자 00</em>}</li>)}</ol>}
    {/* 카드에 흐름을 풀어 쓴 설명 줄은 두지 않는다 — 사용자 지시 2026-11-16 "불필요한 부연설명 다 지워 · 다른 파트도 마찬가지". 종류 표식 · 순서 줄 · 장 표시 · 상세(마우스를 대면)로만 보인다 */}
    {ind && <IndustryNote K={K} state={ind}/>}
    {sec && <SectorNote part={p}/>}
    <ol className="lpx-sheets">{p.slots.map((x, i) => [
      // 고른 서비스에 따라 갈래가 나뉘는 파트(서비스 제안) — 갈래의 첫 장 앞에 갈래 머리(이름 · 무엇을 고르면)
      p.branches && x.branch && (i === 0 || p.slots[i - 1].branch !== x.branch) ? <BranchHead key={'b-' + x.branch} b={p.branches.find(b => b.id === x.branch)}/> : null,
      x.routed ? <RoutedSheets key={x.fam + i} K={K} p={p} slot={x} total={p.slots.length} load={x.sheetsOf === 'spec' ? loadSpecSheets : x.sheetsOf === 'scenario' ? loadScenarioSheets : undefined}/> : <Sheet key={x.fam + i} K={K} p={p} slot={x} meta={meta} total={p.slots.length} pics={plan === undefined ? undefined : plan[i] || null} hover={hover} zoom={zoom}/>,
    ])}</ol>
    <p className="lpx-tpls"><span>쓰는 구성</span>{p.tpls.map(id => <i key={id}>{tpl(id)}</i>)}</p>
  </section>;
}

/* ---------- 팝업 ---------- */
let extraPromise = null;
const loadExtra = () => {
  if (!extraPromise) {
    extraPromise = Promise.all([import('../../../app/web/src/domain/templates/scenario_fills.js'), import('../../../app/web/src/domain/templates/scenario_image_swaps.json', { with: { type: 'json' } })])
      .then(([fills, swaps]) => ({ FILLS: fills.FILLS, FILL_CUSTOMER: fills.FILL_CUSTOMER, SWAPS: swaps.default || swaps }));
    extraPromise.catch(() => { extraPromise = null; });
  }
  return extraPromise;
};

export function AllParts({ K, close }) {
  const [extra, setExtra] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [meta, setMeta] = useState({});
  const [metaReady, setMetaReady] = useState(false);
  const [filter, setFilter] = useState('');
  const [tip, setTip] = useState(null);
  const [zoomed, setZoomed] = useState(null);
  useEffect(() => { let alive = true; setError(''); loadExtra().then(x => alive && setExtra(x), e => alive && setError((e && e.message) || '장 내용을 불러오지 못했습니다.')); return () => { alive = false; }; }, [attempt]);
  useEffect(() => { let alive = true; api('/layout-presets/layouts').then(r => alive && setMeta(r.items || {}), () => {}).then(() => alive && setMetaReady(true)); return () => { alive = false; }; }, []);
  const zoomPatch = useMemo(() => (zoomed ? patchFor(zoomed.zero, zoomed.pics) : null), [zoomed]);
  const curated = useMemo(() => (extra ? curateParts(partFlows(K.toc, extra)) : null), [K, extra]);
  const flows = curated && curated.parts;
  const counts = useMemo(() => (flows ? KIND_ORDER.map(k => [k, flows.filter(p => p.kind === k).length]).filter(([, n]) => n) : []), [flows]);
  // 카드는 기승전결 순서로 놓는다 — 여는 이야기(기)부터 결론(결)까지 색이 차례로 흐른다(part-arc.js). 자리가 같은 파트끼리는 이야기 순서
  const shown = flows ? flows.filter(p => !filter || p.kind === filter).sort((a, b) => partArc(a.key).order - partArc(b.key).order) : [];
  const body = useRef(null);
  useEffect(() => { // 팝업 본문을 굴리면 떠 있는 상세는 닫는다(자리가 어긋나므로)
    const el = body.current && body.current.closest('.modal-body'); if (!el) return undefined;
    const off = () => setTip(null);
    el.addEventListener('scroll', off, { passive: true });
    return () => el.removeEventListener('scroll', off);
  }, [flows]);
  return <Modal wide close={close} title="전체 파트" subtitle="파트마다 덱에 들어가는 장 전체와 그 흐름 — 구성 × 업종 덱을 모두 조립해 세고, 파트 목록 정의로 정리했습니다. 장에 마우스를 대면 상세가 보여요."
    footer={<><span className="quiet"><Icon name="info" size={14}/>{curated && curated.hidden.length ? `목록에서 뺀 목차 ${curated.hidden.length}개는 추천 구성에서 아직 쓰입니다. ` : ''}미리보기는 레이아웃 기본 내용입니다.</span><Button onClick={close}>닫기</Button></>}>
    <div className="lpx" ref={body}>
      {error ? <ErrorBox error={error} retry={() => setAttempt(n => n + 1)}/> : !flows ? <Loading/> : <>
        <div className="lpx-bar" role="toolbar" aria-label="흐름으로 거르기">
          <button type="button" className={'lpx-chip' + (!filter ? ' on' : '')} aria-pressed={!filter} onClick={() => setFilter('')}>전체 <b>{flows.length}</b></button>
          {counts.map(([k, n]) => <button key={k} type="button" className={'lpx-chip k-' + k + (filter === k ? ' on' : '')} aria-pressed={filter === k} title={KIND[k].note || undefined} onClick={() => setFilter(f => (f === k ? '' : k))}><Mark kind={k}/>{KIND[k].label} <b>{n}</b></button>)}
          <span className="lpx-legend"><b className="lpx-lock"><Mark kind="fixed" size={10}/></b>장의 자물쇠 = 내용 고정(업종과 상관없이 같은 내용 · 제안 개요는 업종마다 정해 둔 시트)</span>
        </div>
        {/* 왼쪽 파트 목록(버블 + 이름) — 누르면 그 파트 카드로 굴러 간다(part-rail.jsx, 사용자 지시 2026-11-17) */}
        <div className="lpx-main"><PartRail K={K} parts={shown} root={body}/>
          <div className="lpx-list">{shown.map(p => <PartCard key={p.key} K={K} p={p} meta={meta} ready={metaReady} hover={setTip} zoom={setZoomed}/>)}</div>
        </div>
      </>}
    </div>
    {tip && <Pop at={tip.at}><SheetDetail K={K} p={tip.p} slot={tip.slot} meta={meta} total={tip.total} pics={tip.pics}/></Pop>}
    {zoomed && <Overlay label={zoomed.name + ' 장표 미리보기'} close={() => setZoomed(null)} className="lp-zoom">
      <header><div><h3>{zoomed.name}</h3><p>{[shortCode(zoomed.f, meta), zoomed.part.title || K.toc.tocName(zoomed.part.key, null), zoomed.zero ? '숫자 00 · 직접 입력' : ''].filter(Boolean).join(' · ')}</p></div><IconButton icon="close" label="미리보기 닫기" onClick={() => setZoomed(null)}/></header>
      <div className="lp-zoom-stage"><LayoutFrame f={zoomed.f} title={zoomed.name} thumb={false} patch={zoomPatch}/></div>
      {meta[zoomed.f] && meta[zoomed.f].when && <p className="lp-zoom-when"><Icon name="info" size={14}/>{meta[zoomed.f].when}</p>}
    </Overlay>}
  </Modal>;
}

/** '추천 구성' 위 버튼 줄 */
export function AllPartsButton({ K, onOpen }) {
  const n = useMemo(() => catalogSize(K.toc), [K]);
  return <div className="lpx-open">
    <Button icon="layers" onClick={onOpen}>전체 파트 확인하기</Button>
    <p>파트 <b>{number(n)}</b>종 — 파트마다 들어가는 장 전체 · 순서가 정해진 흐름 · 완전 고정 파트를 한 번에 봅니다.</p>
  </div>;
}
