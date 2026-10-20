import React, { useState } from 'react';
import { Icon, partHue } from './common.jsx';
import { PARTS, REQ_LABEL } from '../domain/proposals/parts.js';
import { LAYOUTS, IND, INDUSTRIES, S, SOLUTIONS, P, isPhotoFirst } from '../services/catalog.js';
import { DECKS, DECK } from './tplkit.jsx';
import { Thumb } from './Thumbs.jsx';
import { FilterPopup as FilterFrame, FStep, FChip, FAll, FProducts, idList, LAYOUT_UNIT } from './filterpop.jsx';

// Shared filtering and list presentation for the library and Storyboard picker.
// 구분 1 — Storyboard part types, grouped the way a proposal flows.
export const PART_GROUPS = [
  { k: 'analysis', label: '분석 · 이해', hue: 'blue', parts: ['overview', 'requirements', 'market', 'customer', 'user', 'competition', 'insight'] },
  { k: 'value', label: '과제 · 가치', hue: 'violet', parts: ['challenge', 'value', 'effect'] },
  { k: 'space', label: '공간 · 제품', hue: 'teal', parts: ['dss', 'products', 'bom', 'scenario', 'birdseye', 'spec'] },
  { k: 'proof', label: '솔루션 · 근거', hue: 'amber', parts: ['solution', 'case', 'why'] },
  { k: 'exec', label: '실행 · 비용', hue: 'green', parts: ['execution', 'cost'] },
  { k: 'frame', label: '표지 · 마무리', hue: 'slate', parts: ['cover', 'closing', 'appendix'] },
];
export const GROUP_OF = {}; PART_GROUPS.forEach((g) => g.parts.forEach((p) => { GROUP_OF[p] = g.k; }));
export const GROUP_OF_G = Object.fromEntries(PART_GROUPS.map((g) => [g.k, g]));
export const PART_ORDER = PART_GROUPS.flatMap((g) => g.parts);


const IMG_OPTS = [['', '이미지 칸 전체'], ['ph', '사진 중심 (사진 30% 이상)'], ['0', '텍스트만 (이미지 없음)'], ['1', '이미지 1–3칸'], ['4', '이미지 4칸 이상']];
const REQ_KEYS = Object.keys(REQ_LABEL).filter((k) => LAYOUTS.some((l) => (l.req || []).includes(k)));
const FKEYS = ['grp', 'part', 'ind', 'sol', 'prod', 'img', 'req', 'deck'];
/** products filter — comma-joined ids (any of them) */
const prodIds = idList;
/** products that appear in any layout — the only ones worth filtering by */
const USED_PROD = [...new Set(LAYOUTS.flatMap((l) => l.prods || []))].filter((id) => P[id]);
export const NO_FILTER = Object.fromEntries(FKEYS.map((k) => [k, '']));
export function pass(l, f, skip) {
  if (skip !== 'part') { if (f.part && l.p !== f.part) return false; if (!f.part && f.grp && GROUP_OF[l.p] !== f.grp) return false; }
  if (skip !== 'deck' && f.deck && l.c !== f.deck) return false;
  if (skip !== 'prod' && f.prod) { const ids = prodIds(f.prod); if (ids.length && !(l.prods || []).some((id) => ids.includes(id))) return false; }
  if (skip !== 'ind' && f.ind) {
    if (f.ind === '_gen') { if (l.ind) return false; } else if (f.ind === '_ind') { if (!l.ind) return false; } else if (l.ind !== f.ind) return false;
  }
  if (skip !== 'sol' && f.sol) {
    if (f.sol === '_none') { if (l.sol) return false; } else if (l.sol !== f.sol && !(l.sols || []).includes(f.sol)) return false;
  }
  if (skip !== 'img' && f.img) {
    if (f.img === '0' && l.nI !== 0) return false;
    if (f.img === '1' && !(l.nI >= 1 && l.nI <= 3)) return false;
    if (f.img === '4' && l.nI < 4) return false;
    if (f.img === 'ph' && !isPhotoFirst(l)) return false;
  }
  if (skip !== 'req' && f.req && !(l.req || []).includes(f.req)) return false;
  return true;
}
const countBy = (list, key) => { const m = {}; for (const l of list) { const k = key(l); if (k != null) m[k] = (m[k] || 0) + 1; } return m; };


const IMG_LABEL = Object.fromEntries(IMG_OPTS);
/** active filters as chips: { k, head, value, short, label, clear } */
export function activeFilters(f) {
  const out = [];
  const add = (k, head, value, clear) => out.push({ k, head, value, short: value, label: head + ' ' + value, clear });
  if (f.part && PARTS[f.part]) add('part', '파트', PARTS[f.part].label, { part: '', grp: '' });
  else if (f.grp && GROUP_OF_G[f.grp]) add('grp', '파트', GROUP_OF_G[f.grp].label + ' 전체', { grp: '' });
  if (f.ind) add('ind', '업종', f.ind === '_gen' ? '범용' : f.ind === '_ind' ? '업종 맞춤 전체' : (IND[f.ind] ? IND[f.ind].name : f.ind), { ind: '' });
  if (f.sol) add('sol', '솔루션', f.sol === '_none' ? '솔루션 전용 제외' : (S[f.sol] ? S[f.sol].name : f.sol), { sol: '' });
  if (f.prod) { const ids = prodIds(f.prod); if (ids.length) add('prod', '제품', P[ids[0]].model + (ids.length > 1 ? ' 외 ' + (ids.length - 1) : ''), { prod: '' }); }
  if (f.img) add('img', '이미지', IMG_LABEL[f.img] || f.img, { img: '' });
  if (f.req) add('req', '필요한 정보', REQ_LABEL[f.req] || f.req, { req: '' });
  if (f.deck) add('deck', '원본 장표', DECK[f.deck] ? DECK[f.deck].label : f.deck, { deck: '' });
  return out;
}

/** One popup, read top to bottom: 파트 유형 → 업종 → 솔루션 → 제품 → 이미지 칸 → 필요한 정보 → 원본 장표.
 *  Every choice shows how many layouts stay with the other choices kept; nothing applies until "N장 보기". */
export function LayoutFilterPopup({ f, base, onApply, onClose }) {
  const [d, setD] = useState(() => ({ ...NO_FILTER, ...Object.fromEntries(FKEYS.map((k) => [k, f[k]])) }));
  const put = (patch) => setD((x) => ({ ...x, ...patch }));
  const n = base.filter((l) => pass(l, d)).length;
  const pool = (skip) => base.filter((l) => pass(l, d, skip));
  const partPool = pool('part');
  const partN = countBy(partPool, (l) => l.p);
  const grpN = countBy(partPool, (l) => GROUP_OF[l.p]);
  const indPool = pool('ind');
  const indN = countBy(indPool, (l) => l.ind || '_gen');
  const indAll = indPool.filter((l) => l.ind).length;
  const solPool = pool('sol');
  const solN = {}; for (const l of solPool) { new Set([l.sol, ...(l.sols || [])].filter(Boolean)).forEach((id) => { solN[id] = (solN[id] || 0) + 1; }); if (!l.sol) solN._none = (solN._none || 0) + 1; }
  const imgPool = pool('img');
  const imgN = { ph: imgPool.filter(isPhotoFirst).length, 0: imgPool.filter((l) => l.nI === 0).length, 1: imgPool.filter((l) => l.nI >= 1 && l.nI <= 3).length, 4: imgPool.filter((l) => l.nI >= 4).length };
  const reqN = {}; for (const l of pool('req')) for (const r of l.req || []) reqN[r] = (reqN[r] || 0) + 1;
  const deckN = countBy(pool('deck'), (l) => l.c);
  const prodN = {}; for (const l of pool('prod')) for (const id of new Set(l.prods || [])) prodN[id] = (prodN[id] || 0) + 1;
  const on = activeFilters(d).length;

  // one chip: selected = pressed; pressing it again goes back to 전체
  const chip = (key, val, label, cnt, extra = {}) => {
    const sel = d[key] === val;
    return <FChip key={key + ':' + val} on={sel} n={cnt} cls={extra.cls} pre={extra.pre} onClick={() => put(sel ? { [key]: '' } : { [key]: val, ...(extra.also || {}) })}>{label}</FChip>;
  };
  const all = (key, cnt, also = {}) => <FAll on={!d[key] && Object.keys(also).every((k) => !d[k])} n={cnt} onClick={() => put({ [key]: '', ...also })} />;
  const solCats = [...new Set(SOLUTIONS.filter((x) => solN[x.id] || d.sol === x.id).map((x) => x.cat))];

  return (
    <FilterFrame unit={LAYOUT_UNIT} n={n} canReset={on} onReset={() => setD({ ...NO_FILTER })} onApply={() => onApply(d)} onClose={onClose}>
      <FStep no={1} title="파트 유형" hint="구분 이름을 누르면 그 구분 전체">
        <div className="tlf-parts">
          <div className="tlf-prow">{all('part', partPool.length, { grp: '' })}</div>
          {PART_GROUPS.map((g) => (
            <div key={g.k} className={'tlf-prow h-' + g.hue}>
              <button className="tlf-grp" aria-pressed={!d.part && d.grp === g.k} disabled={!grpN[g.k] && d.grp !== g.k}
                onClick={() => put(!d.part && d.grp === g.k ? { grp: '' } : { grp: g.k, part: '' })}>
                <i className="dot" />{g.label}<span className="num">{grpN[g.k] || 0}</span>
              </button>
              <div className="tlf-chips">
                {g.parts.filter((p) => PARTS[p]).map((p) => chip('part', p, PARTS[p].label, partN[p], { also: { grp: '' } }))}
              </div>
            </div>
          ))}
        </div>
      </FStep>
      <FStep no={2} title="업종">
        <div className="tlf-chips">
          {all('ind', indPool.length)}
          {chip('ind', '_gen', '범용', indN._gen)}
          {chip('ind', '_ind', '업종 맞춤 전체', indAll)}
        </div>
        <div className="tlf-chips">{INDUSTRIES.map((i) => chip('ind', i.code, i.name, indN[i.code]))}</div>
      </FStep>
      <FStep no={3} title="솔루션" hint="그 솔루션이 들어간 레이아웃">
        <div className="tlf-chips">
          {all('sol', solPool.length)}
          {chip('sol', '_none', '솔루션 전용 제외', solN._none)}
        </div>
        {solCats.map((c) => (
          <div key={c} className="tlf-sub"><span className="tlf-cat">{c}</span>
            <div className="tlf-chips">{SOLUTIONS.filter((x) => x.cat === c && (solN[x.id] || d.sol === x.id)).map((x) => chip('sol', x.id, x.name, solN[x.id], { pre: <Thumb r={'solution:' + x.id} mini className="tlf-th" /> }))}</div>
          </div>
        ))}
      </FStep>
      <FStep no={4} title="제품" hint="고른 제품 중 하나라도 들어간 레이아웃">
        <FProducts ids={prodIds(d.prod)} counts={prodN} used={USED_PROD} unit={LAYOUT_UNIT} onChange={(ids) => put({ prod: ids.join(',') })} />
      </FStep>
      <FStep no={5} title="이미지 칸">
        <div className="tlf-chips">
          {all('img', imgPool.length)}
          {IMG_OPTS.filter(([k]) => k).map(([k, t]) => chip('img', k, t, imgN[k]))}
        </div>
      </FStep>
      <FStep no={6} title="필요한 정보" hint="이 정보가 있어야 채울 수 있는 레이아웃">
        <div className="tlf-chips">
          {all('req', pool('req').length)}
          {REQ_KEYS.map((k) => chip('req', k, REQ_LABEL[k], reqN[k]))}
        </div>
      </FStep>
      <FStep no={7} title="원본 장표">
        <div className="tlf-chips">
          {all('deck', pool('deck').length)}
          {DECKS.map((x) => chip('deck', x.k, x.label, deckN[x.k]))}
        </div>
      </FStep>
    </FilterFrame>
  );
}

export function LayoutSections({ groups, card, cols, query = false }) {
  return (
    <div className="tl-sections">
      {groups.map((g) => (
        <section key={g.key} className={'tl-grp' + (g.hue ? ' h-' + g.hue : '')} aria-label={g.label || '검색 결과'}>
          {!g.flat && (
            <div className="tl-grp-h">
              <i className="dot" /><h2>{g.label}</h2><span className="num">{g.sections.reduce((n, x) => n + x.items.length, 0)}</span>
              {g.desc ? <p>{g.desc}</p> : null}
            </div>
          )}
          <div className={'tl-grp-in' + (g.flat ? ' flat' : '')}>
            {g.sections.map((s) => {
              const pt = s.part ? PARTS[s.part] : null;
              return (
                <section key={s.key} className="tl-sec" aria-label={pt ? pt.label : s.title || '검색 결과'}>
                  {s.key !== '_hits' && (
                    <div className="tl-sec-h">
                      {pt ? <span className={'tl-ic ' + partHue(s.part)}><Icon name={pt.icon} size={15} /></span> : null}
                      <div className="tl-sec-t">
                        <h3>{pt ? pt.label : s.title} {s.key !== '_ai_top' && <span className="num">{s.items.length}</span>}</h3>
                        {(pt ? pt.desc : s.sub) ? <p>{pt ? pt.desc : s.sub}</p> : null}
                      </div>
                    </div>
                  )}
                  {query && <div className="tl-hint"><Icon name="info" size={13} />레이아웃 이름 · 용도 · 예시 문구 · 업종 · 솔루션에서 찾았어요. 필터로 더 좁힐 수 있어요.</div>}
                  <div className="tl-grid" style={cols ? { gridTemplateColumns: 'repeat(' + cols + ', minmax(0, 1fr))' } : undefined}>{s.items.map(card)}</div>
                </section>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
