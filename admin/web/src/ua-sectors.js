// 「전체 파트」 팝업 — 업종 묶음마다 다루는 항목 · 장이 다른 파트(당사의 이해)의 계산 부분. 화면 없이 계산만 하므로 node 테스트도 그대로 부른다.
//   당사의 이해는 파트는 하나지만 업종에 따라 짚어야 할 것이 크게 다르다(사용자 규칙 2026-11-16) — 업종을 크게 묶어(병의원은 대형 · 중소형 · 의원 · 요양이 한 묶음,
//   학교와 오피스는 다른 묶음) 묶음마다 이해 항목을 따로 정하고, 항목마다 새 장(L_TOC_UA_<묶음>_<항목>)을 그렸다. 기존 당사의 이해 장(L_TOC_UAPROF …)은 쓰지 않는다.
//   묶음마다 이해 항목 4장 뒤에 경쟁 우위 3장이 붙는다(사용자 규칙 2026-11-16: 경쟁사보다 나은 점을 보이는 것이 매우 중요 — 근거는 통합 솔루션 · 핵심 스펙 key message · 여러 사례):
//   경쟁 구도 · 통합 솔루션 → 핵심 스펙 → 같은 업종 사례. 삼성 칸은 앱 자료의 실제 값, 경쟁사 칸은 예시 · 00(build/toc/ua/compete.py · data.py).
//   자료: ua-catalog.json (build/toc/gen_ua_catalog.py 가 만든다 — 손으로 고치지 않는다). 화면: ua-industry.jsx.
//   어느 파트가 여기에 해당하는지는 파트 목록 정의(part-flows.js PART_CATALOG.sector)가 정한다. 지금은 목록에만 쓴다(실제 덱 · 앱 레이아웃 목록 반영 전).

// 미리보기 문서 — 서버가 주는 레이아웃 미리보기와 같은 틀(스크립트 · 바깥 주소 없음, 그림은 파일에 담긴 data: 만).
//   data-lpx-numbers="00": 숫자가 처음부터 00 인 장 — '숫자 00' 장의 미리보기 고치기(layout-parts.jsx zeroNumbers)가 손대지 않는다(달 · 시각 · 차례 번호까지 00 이 되지 않게)
const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; script-src 'none'; connect-src 'none'";
const page = body => '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + CSP
  + '"><style>html,body{margin:0;width:1280px;height:720px;overflow:hidden}*{box-sizing:border-box}</style></head><body data-lpx-numbers="00">' + body + '</body></html>';
/** 장 HTML 의 그림 주소(사진 묶음 · 파일)를 파일에 담긴 그림(data:)으로 */
const withPhotos = (html, photos) => html
  .replace(/src="[^"]*" data-fill="([^"]+)"/g, (m, a) => (photos[a] ? `src="${photos[a]}" data-fill="${a}"` : m))
  .replace(/src="((?!data:)[^"]+)"/g, (m, a) => (photos[a] ? `src="${photos[a]}"` : m));

/** 간지 — 다루는 항목 수만큼 줄이 있는 표준 간지(L_VS_DIV_R1–6) */
export const dividerOf = n => 'L_VS_DIV_R' + Math.max(1, Math.min(6, n));

/**
 * 파일 → { clusters, byId, has(f), preview(f), meta(f) }
 *   clusters: [{ id, name, cust, goal, verticals: [업종 id], sheets: [{ f, label, form, zero }] }]
 *   meta(f): 팝업에 보이는 레이아웃 정보 { code, name, when } — name 은 장의 모양(항목 이름은 장 이름으로 따로 보인다)
 */
export function sectorBook(data) {
  const photos = data.photos || {}; const layouts = data.layouts || {};
  const clusters = (data.clusters || []).map(c => ({ ...c, sheets: c.sheets.map(s => ({ ...s })) }));
  const forms = Object.fromEntries(clusters.flatMap(c => c.sheets.map(s => [s.f, s.form])));
  const pages = new Map();
  return {
    clusters, byId: Object.fromEntries(clusters.map(c => [c.id, c])),
    has: f => !!layouts[f],
    preview(f) {
      if (!layouts[f]) return null;
      if (!pages.has(f)) pages.set(f, page(withPhotos(layouts[f].html, photos)));
      return pages.get(f);
    },
    // 가운뎃점 둘레의 빈칸을 뺀다 — 카드가 장 이름을 ' · ' 로 끊어 첫 마디만 쓰기 때문(모양 설명이 중간에서 잘리지 않게)
    meta: f => (layouts[f] ? { code: layouts[f].code, name: String(forms[f] || layouts[f].name).replace(/ · /g, '·'), when: layouts[f].when } : null),
  };
}

/**
 * 업종 묶음마다 항목 · 장이 다른 파트(part.sector)의 장을 고른 묶음의 것으로 바꾼다 — 간지(항목 수만큼 줄) + 항목마다 한 장, 이 순서로 고정.
 *   book 을 아직 못 받았으면 장 없이 돌려준다(pending). names: 업종 id → 이름
 *   파트에 더해지는 값: cluster({ id, name, cust, goal, verticals: [{ id, nm }] }) · goal(묶음의 목표) · sheets
 *   장에 더해지는 값: role(항목 이름) · zero(작성자가 직접 넣는 숫자 00 이 있다) · sector(묶음 id) · group(know 고객 이해 | compete 경쟁 우위) · meta(레이아웃 정보) · content(상세의 '내용' 설명)
 */
export function withSector(part, book, id, names = {}) {
  if (!part || !part.sector) return part;
  if (!book || !book.clusters.length) return { ...part, slots: [], sheets: { min: 0, max: 0 }, pending: true };
  const C = book.byId[id] || book.clusters[0];
  const div = part.slots.find(x => x.fam === 'L_VS_DIV');
  const dv = dividerOf(C.sheets.length);
  const slots = [
    ...(div ? [{ ...div, f: dv, fs: [dv], n: { min: 1, max: 1 }, repN: 1, shape: '', fixed: false, swapped: 0 }] : []),
    ...C.sheets.map(sh => ({ fam: sh.f, f: sh.f, fs: [sh.f], n: { min: 1, max: 1 }, repN: 1, tpls: part.tpls, roles: [sh.label], by: '', shape: '', fixed: false, swapped: 0,
      role: sh.label, zero: !!sh.zero, sector: C.id, group: sh.group || 'know', meta: book.meta(sh.f),
      // 경쟁 우위 장(group compete): 삼성 칸은 앱 자료의 실제 값(제품 · 솔루션 · 스펙 · 공식 도입사례), 경쟁사 칸은 예시 · 00 — 조사한 내용으로 바꾼다
      content: sh.group === 'compete' ? '삼성 칸은 실제 제품 · 스펙 · 도입사례 — 경쟁사 칸은 조사한 내용으로 작성자가 채움'
        : sh.zero ? '고객사마다 바뀜 — 항목 이름은 그대로 두고 숫자(00)와 글을 작성자가 채움' : '고객사마다 바뀜 — 항목 이름은 그대로 두고 표시와 글을 작성자가 채움' })),
  ].map((x, i) => ({ ...x, step: i + 1 }));
  return { ...part, goal: C.goal, slots, sheets: { min: slots.length, max: slots.length },
    cluster: { id: C.id, name: C.name, cust: C.cust, goal: C.goal, verticals: C.verticals.map(v => ({ id: v, nm: names[v] || v })) } };
}
