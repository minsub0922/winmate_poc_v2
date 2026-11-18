// 고객/공간 시나리오 파트 — 공간 구성(공간마다 놓이는 제품 · 그 공간에서 쓰는 솔루션 · 서비스와 그 기능)으로 장을 고른다.
//   사용자 지시 2026-11-17: "공간시나리오별로 제품이 배치되고, 솔루션 및 서비스는 여러 공간에서 활용 … 여러 케이스 고려 또는 동적으로 결정된 조합을 ui 에 적용"
//   2차(같은 날): "공간별 시나리오를 개선해야해. 이전처럼 공간 3개에 대해서 선택된 솔루션, 서비스를 좌우 하단에 고정하고 on/off 되는 방식으로 다시 돌아가.
//   그리고 공간별 이미지와 그 공간에 매칭될 제품들을 overlay 로 같이 보여주며 통합적인 시나리오 설명을 해야해. 현재의 한 공간만 사용하는 경우는 없어.
//   공간별 시나리오는 대규모 제안에만 활용돼."
//   3차(같은 날): "시트에 솔루션 / 서비스 구분을 하지마. 공간 이미지는 더 커야해. 제품도. 제품 이름은 제품 이미지에 overlay … 유저 시나리오 관련 내용은 공간별로 —
//   어느 공간에서 뭘 하는지, 이 흐름을 자연스러운 → 로 연결 … 각 솔루션이나 서비스가 어느 공간에 매핑되는지 정보 필요없어 … 기능 표시: 아이콘 배경 없이 밑줄 + 그 밑에 텍스트"
//   파트 흐름: 간지 → 조감도 → 활용 맵(솔루션 · 서비스 × 공간) → 공간별 시나리오(공간 3곳씩 한 장).
//   장은 경우마다 미리 그려 둔 시트(build/toc/layouts.py scn_set · scn_map)에서 고른다 —
//     공간별 시나리오: 공간 3곳 시트(L_TOC_SCN_S3) · 2곳 시트(S2). 3곳씩 나누고 한 곳만 남지 않게(4 → 2 + 2 · 7 → 3 + 2 + 2). 공간이 한 곳이면 두지 않는다.
//                    공간 사진마다 그 공간 제품 컷 3개까지 겹쳐 보이고 컷마다 제품 이름을 겹쳐 쓴다. 공간마다 그 공간의 시나리오 한 단락(공간 사이는 → 화살표).
//                    아래는 고른 솔루션 · 서비스를 구분 없이 고정으로(모든 장이 같은 줄 — 6줄, 넘치면 여섯째 줄이 '그 밖에 N개'),
//                    줄마다 기능 5칸(선 아이콘 + 밑줄 + 기능 이름 — 이 장의 공간에서 쓰는 기능만 켬). 어느 공간에서 쓰는지는 적지 않는다.
//     활용 맵:       공간 2–10곳 시트(L_TOC_SCN_MAP2–10). 줄 = 솔루션 · 서비스 8줄까지(여러 공간이 함께 쓰는 것부터), 넘치면 여덟째 줄이 '그 밖에 N개'.
//                    공간이 1곳이면 맵이 없고, 10곳을 넘으면 고르게 나눠 맵을 여러 장(11 → 6 + 5).
//   이 모듈은 순수 함수다 — 템플릿 덱(toc_templates.js B.value · 업종 예시 자료)과 관리자 「전체 파트」 표가 같은 규칙을 쓰고, 레이아웃 자동 구성(composer auto.py scn_*)이 같은 규칙을 따른다.
export const SCN = { per: 3, cuts: 3, rows: 8, mapMin: 2, mapMax: 10, useRows: 6, useIcons: 5 };
const pad = (n) => String(n).padStart(2, '0');
/** 공간 수(2 · 3) → 공간별 시나리오 시트 */
export const scnSetId = (m) => `L_TOC_SCN_S${Math.max(2, Math.min(SCN.per, m | 0))}`;
/** 공간 수 → 활용 맵 시트 */
export const scnMapId = (n) => `L_TOC_SCN_MAP${n}`;
export const isScenarioSheet = (f) => /^L_TOC_SCN_(S\d|MAP\d+)$/.test(String(f || ''));
/** 공간 수 → 공간별 시나리오 묶음(공간 번호 0부터) — 3곳씩, 한 곳만 남지 않게. 1곳 이하면 [] */
export function scenarioSetGroups(n) {
  if (n < 2) return [];
  const sizes = []; let left = n;
  while (left > 0) {
    if (left === 4) { sizes.push(2, 2); break; }
    if (left <= SCN.per) { sizes.push(left); break; }
    sizes.push(SCN.per); left -= SCN.per;
  }
  let at = 0;
  return sizes.map((k) => { const g = Array.from({ length: k }, (_, i) => at + i); at += k; return g; });
}
/** 공간 수 → 활용 맵 묶음(공간 번호 0부터) — 1곳 이하 [] · 10곳까지 한 장 · 넘으면 고르게 나눔 */
export function scenarioMapGroups(n) {
  if (n < SCN.mapMin) return [];
  const k = Math.ceil(n / SCN.mapMax); const out = []; let at = 0;
  for (let g = 0; g < k; g++) { const size = Math.floor(n / k) + (g < n % k ? 1 : 0); out.push(Array.from({ length: size }, (_, i) => at + i)); at += size; }
  return out;
}
/**
 * 공간마다 쓰는 솔루션 · 서비스를 줄로 — 여러 공간이 함께 쓰는 것부터(같으면 솔루션 → 서비스, 그다음 먼저 나온 순서).
 * spaces: [{ uses: [{ id, features? }] }] · names: id → [이름, 'sol' | 'svc'] → [{ id, name, kind('솔루션' | '서비스'), spaces: [공간 번호(0부터) …], on: { 공간 번호: [기능 id] } }]
 */
export function scenarioUses(spaces, names = {}) {
  const rows = new Map();
  spaces.forEach((sp, i) => (sp.uses || []).forEach((u) => {
    const id = u.id; if (!id) return;
    const nm = names[id] || [u.name || id, u.kind === 'svc' || u.kind === '서비스' ? 'svc' : 'sol'];
    const r = rows.get(id) || { id, name: nm[0], kind: nm[1] === 'svc' ? '서비스' : '솔루션', spaces: [], on: {}, first: rows.size };
    if (!r.spaces.includes(i)) r.spaces.push(i);
    r.on[i] = [...new Set([...(r.on[i] || []), ...(u.features || [])])];
    rows.set(id, r);
  }));
  return [...rows.values()].sort((a, b) => b.spaces.length - a.spaces.length || (a.kind === b.kind ? 0 : a.kind === '솔루션' ? -1 : 1) || a.first - b.first)
    .map(({ first, ...r }) => r);
}
/** 줄을 n줄로 — 넘치면 마지막 줄이 '그 밖에 N개'(쓰는 공간은 남은 줄을 모두 합친 것, 기능 아이콘 없음) */
function capRows(rows, n) {
  if (rows.length <= n) return rows;
  const rest = rows.slice(n - 1);
  const spaces = [...new Set(rest.flatMap((r) => r.spaces))].sort((a, b) => a - b);
  return [...rows.slice(0, n - 1), { id: null, name: `그 밖에 ${rest.length}개`, kind: rest[0].kind, spaces, on: {}, more: rest.map((r) => r.name) }];
}
/**
 * 한 장의 고정 줄 — 기능 아이콘(켬/끔: 그 장의 공간(group)에서 쓰는 기능만 켬).
 * all(id): 그 솔루션 · 서비스의 기능 전부(카탈로그 순서 — 꺼진 아이콘으로 채운다). 켠 기능이 앞에서 칸을 차지하고, 남는 칸은 다른 기능(꺼짐)으로, 칸 안에서는 카탈로그 순서
 */
function rowOnSheet(r, group, slots, all) {
  const here = group.filter((i) => r.spaces.includes(i));
  const on = [...new Set(here.flatMap((i) => r.on[i] || []))];
  const order = [...new Set([...(r.id ? all(r.id) : []), ...on])];
  const pick = [...on.slice(0, slots), ...order.filter((f) => !on.includes(f))].slice(0, slots);
  pick.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return { id: r.id, name: r.name, kind: r.kind, used: here.length > 0, icons: pick.map((f) => ({ f, on: on.includes(f) })) };
}
/**
 * 파트의 장 계획 — 조감도는 부르는 쪽이 앞에 놓는다.
 * spaces: [{ name, photo, products: [{ name, cut }], uses: [{ id, scene, features }] }] · names: 솔루션 · 서비스 이름 표 · all(id): 기능 전부
 * → { rows, maps: [{ f, spaces, rows: [{ …, cells, count }] }],
 *     sets: [{ f, no, spaces: [i …], cuts: [[{ name, cut }] …](공간마다 3개까지 — 컷 위에 이름), use: [줄 …](솔루션 · 서비스 구분 없이 6줄) }] }
 */
export function scenarioPlan(spaces, names = {}, all = () => []) {
  const rows = scenarioUses(spaces, names);
  const maps = scenarioMapGroups(spaces.length).map((g) => {
    const mine = rows.filter((r) => r.spaces.some((i) => g.includes(i)));
    return { f: scnMapId(g.length), spaces: g, rows: capRows(mine, SCN.rows).map((r) => ({ ...r, cells: g.map((i) => r.spaces.includes(i)), count: r.spaces.filter((i) => g.includes(i)).length })) };
  });
  // 고정 줄 — 고른 솔루션 · 서비스(구분 없이, 모든 장이 같은 줄 · 같은 차례)
  const use = capRows(rows, SCN.useRows);
  const sets = scenarioSetGroups(spaces.length).map((g, k) => ({
    f: scnSetId(g.length), no: pad(k + 1), spaces: g,
    cuts: g.map((i) => (spaces[i].products || []).filter((x) => x.cut).slice(0, SCN.cuts)),
    use: use.map((r) => rowOnSheet(r, g, SCN.useIcons, all)),
  }));
  return { rows, maps, sets };
}
/** 관리자 표 — 공간 수 → 공간별 시나리오 장 나눔 · 활용 맵 장 수 */
export function scenarioRouteTables() {
  const sets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => { const g = scenarioSetGroups(n); return { n, label: g.length ? g.map((x) => x.length).join(' + ') : '없음', sheets: g.length, birds: 1, pers: [...new Set(g.map((x) => x.length))] }; });
  const maps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => { const g = scenarioMapGroups(n); return { n, label: g.length ? g.map((x) => x.length).join(' + ') + '곳' : '없음', sheets: g.length, birds: Math.max(1, g.length), pers: g.map((x) => x.length) }; });
  return { sets, maps };
}
