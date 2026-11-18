// Storyboard '제품 · 솔루션 · 서비스' 버블(DSS) + 그 아래 매칭 카드(선택한 제품 → 솔루션 → 서비스) + '공간 구성' 버튼.
//   서비스 = 솔루션 카탈로그의 서비스 분류(케어 · 콘텐츠 제작 지원) + 구독(B2B 삼성 AI 구독) — services/dss.js (사용자 지시 2026-11-16).
//   유관사례는 버블 이름에서 빠졌다 — 연결한 사례가 있을 때만 맨 아래에 보인다(연결 해제할 수 있게).
//   버블에는 숫자를 두지 않는다. 이 버블의 일이 도는 동안(조감도 생성 · 공간 구성 추론 · 조감도를 레이아웃에 넣는 중) 테두리에 도는 고리(.node.is-busy).
//   솔루션 · 유관사례: 입력창에서 @로 태그했을 때와 같은 @태그 칩(썸네일 + 이름) · 제품: 3열 이미지 + 이름. 개수 제한 없이 전부 보인다.
//   항목에 마우스를 올리면 상세가 카드 오른쪽(추가 팝업이 뜨는 자리)에 뜨고, 세로 위치만 그 항목에 맞춘다. 누르면 상세 창, ×는 연결 해제(되돌리기).
//   공간 구성을 저장하면 제품은 공간별 묶음(공간마다 다른 색 테두리)으로, 어느 공간에도 없는 제품은 '미배치'로 보인다. ×로 선택한 배치를 빼도 다른 공간에 남은 제품의 연결은 유지한다.
//   묶음의 제품은 끌어다 놓아 다른 공간 · 미배치로 옮기거나 공간 안 순서를 바꾼다(사용자 지시 2026-11-17) — 놓는 즉시 저장(services/space-plan.js
//   movePlanProduct). 제품 위에 놓으면 그 앞, 묶음 빈 곳에 놓으면 끝. 공간 구성 팝업이 열려 있거나 조감도를 만드는 동안은 끌 수 없다.
//   '공간 구성'(선택 기능)은 제품이 1개 이상일 때 켜지고, 조감도를 만드는 동안 '조감도 생성 중'을 보여 준다.
//   원문 매칭(services/match-extract.js — 요구사항을 저장하면 원문에 글로 적힌 제품 · 솔루션 · 공간을 찾아 넣는다)이 도는 동안 카드는
//   shimmer와 '매칭 추론 중'만 보인다. 끝나면 찾은 항목이 들어오고(공간과 짝지어진 제품은 공간 묶음으로), 실패하면 카드 아래에 다시 시도.
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from './common.jsx';
import { Thumb } from './Thumbs.jsx';
import { tagMeta } from './tagcard.jsx';
import { useDetailPeek } from './reference-detail.jsx';
import { addRef, removeRef } from './requirements.jsx';
import { notify } from '../services/notifications.js';
import { planGroups } from '../domain/proposals/space-plan.js';
import { birdseyeOf, birdseyeBusy, matchBusy, subscribeBirdseye, startBirdseye, mapBirdseyeLayouts, movePlanProduct, removePlanProduct } from '../services/space-plan.js';
import { useExtractBusy, extractNotice, ensureMatchExtract } from '../services/match-extract.js';
import { dssOf } from '../services/dss.js';
import '../styles/match-space.css';
import '../styles/match-extract.css';

// 제품 → 솔루션 → 서비스 (매칭 팝업 탐색기의 최상위 폴더와 같은 순서) · 유관사례는 연결한 것이 있을 때만
export const MATCH_SECTIONS = [['products', 'product', '제품'], ['solutions', 'solution', '솔루션'], ['services', 'service', '서비스'], ['cases', 'case', '유관사례']];
/** 카드 칸마다 연결된 ref — 서비스 칸 = 서비스 분류 솔루션 + 구독 */
export function matchRefs(p) {
  const d = dssOf(p);
  return {
    products: d.products.map((id) => 'product:' + id),
    solutions: d.solutions.map((id) => 'solution:' + id),
    services: [...d.services.map((id) => 'solution:' + id), ...d.subscriptions.map((id) => 'subscription:' + id)],
    cases: (p.ctx.cases || []).map((id) => 'case:' + id),
  };
}

/** refs that were not there on the previous render (just linked) — they flash once */
function useFresh(refs) {
  const prev = useRef(null);
  const [fresh, setFresh] = useState(() => new Set());
  const key = refs.join('|');
  useEffect(() => {
    const before = prev.current; prev.current = new Set(refs);
    if (!before) return undefined;
    const added = refs.filter((r) => !before.has(r));
    if (!added.length) return undefined;
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 1600);
    return () => clearTimeout(t);
  }, [key]);
  return fresh;
}

function hoverOf(peek, r, side) {
  return {
    onMouseEnter: (e) => peek.show(r, e.currentTarget, undefined, { beside: side() }),
    onMouseLeave: peek.hide,
    onFocus: (e) => { if (e.target === e.currentTarget && e.currentTarget.matches(':focus-visible')) peek.show(r, e.currentTarget, true, { beside: side() }); },
    onBlur: (e) => { if (e.target === e.currentTarget) peek.hide(e); },
  };
}

/** 솔루션 · 서비스 · 유관사례 — @태그 칩 (common.jsx MentionEditor · tagcard.jsx MentionInline 과 같은 모양). 구독은 상세 창이 없어 이름 · 분류만 말풍선으로 */
function TagItem({ r, peek, side, readOnly, onRemove, fresh }) {
  const m = tagMeta(r); if (!m) return null;
  if (m.type === 'subscription') {
    return (
      <span className={'dss-chip' + (fresh ? ' fresh' : '')}>
        <span className="mention has-th" data-type="subscription" data-ref={r} tabIndex={0} title={m.name + ' · ' + m.kind}>
          <Thumb r={r} mini className="mn-th" />@{m.short}
        </span>
        {!readOnly && <button type="button" className="dss-x" onClick={(e) => { e.stopPropagation(); onRemove(r, m.name); }} aria-label={m.name + ' 연결 해제'} title="연결 해제"><Icon name="x" size={10} stroke={3} /></button>}
      </span>
    );
  }
  return (
    <span className={'dss-chip' + (fresh ? ' fresh' : '')}>
      <span className="mention has-th" data-type={m.type} data-ref={r} tabIndex={0} role="button" aria-label={m.name + ' · 상세 보기'} {...hoverOf(peek, r, side)} {...peek.detailProps(r)}>
        <Thumb r={r} mini className="mn-th" />@{m.short}
      </span>
      {!readOnly && <button type="button" className="dss-x" onClick={(e) => { e.stopPropagation(); peek.hide(); onRemove(r, m.name); }} aria-label={m.name + ' 연결 해제'} title="연결 해제"><Icon name="x" size={10} stroke={3} /></button>}
    </span>
  );
}

/** 제품 — 이미지 + 이름 */
function ProductItem({ r, peek, side, readOnly, onRemove, fresh, dnd, spaceName }) {
  const m = tagMeta(r); if (!m) return null;
  const removeLabel = spaceName ? spaceName + '에서 배치 삭제' : '연결 해제';
  return (
    <div className={'dss-prod' + (fresh ? ' fresh' : '') + (dnd ? ' movable' + (dnd.cls || '') : '')} data-ref={r} tabIndex={0} role="button" aria-label={m.name + ' · 상세 보기'} {...hoverOf(peek, r, side)} {...peek.detailProps(r)} {...(dnd ? dnd.props : {})}>
      <Thumb r={r} />
      <span className="dss-pname" title={m.name}>{m.name}</span>
      {!readOnly && <button type="button" className="dss-x" onClick={(e) => { e.stopPropagation(); peek.hide(); onRemove(r, m.name); }} onKeyDown={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} aria-label={m.name + ' ' + removeLabel} title={removeLabel}><Icon name="x" size={10} stroke={3} /></button>}
    </div>
  );
}

/** 원문 매칭 중 — 카드 자리에 shimmer와 '매칭 추론 중'만 둔다(제품 3칸 · 솔루션 · 사례 칩 모양) */
function ExtractLoading({ cardRef }) {
  return (
    <div className="match-card dss mx-loading" ref={cardRef} role="status" aria-label="매칭 추론 중">
      <span className="mx-load-t"><span className="spin" aria-hidden="true" />매칭 추론 중</span>
      <div className="mx-sk" aria-hidden="true">
        <i className="mx-sk-h shimmer" />
        <div className="mx-sk-grid"><i className="shimmer" /><i className="shimmer" /><i className="shimmer" /></div>
        <i className="mx-sk-h shimmer" />
        <div className="mx-sk-chips"><i className="shimmer" /><i className="shimmer" /></div>
        <i className="mx-sk-h shimmer" />
        <div className="mx-sk-chips"><i className="shimmer" /></div>
      </div>
    </div>
  );
}

function BirdseyeCard({ be, onOpen, onRedo }) {
  return (
    <div className={'dss-be' + (be.stale ? ' stale' : '')}>
      <button type="button" className="dss-be-open" onClick={be.foreign ? undefined : onOpen} disabled={be.foreign} aria-label={(be.foreign ? '공간 조감도 · 다른 계정이 만들어 열 수 없음 · ' : '공간 조감도 열기 · ') + (be.title || '')}
        title={be.foreign ? '다른 계정이 만든 조감도라 열 수 없어요 · 다시 만들면 내 조감도로 만들어져요' : '조감도 스튜디오에서 열기'}>
        {be.image ? <img src={be.image} alt="" /> : <span className="dss-be-ph"><Icon name="cube" size={22} /></span>}
        <span className="dss-be-t"><b>공간 조감도</b><span className="num">공간 {be.rooms} · 제품 {be.products}</span></span>
        {!be.foreign && <Icon name="edit" size={13} className="dss-be-go" />}
      </button>
      {(be.stale || be.foreign) && <div className="dss-be-note"><span>{be.stale ? '공간 구성이 바뀌었어요' : '다른 계정이 만든 조감도예요'}</span><button type="button" className="dss-link" onClick={onRedo}>다시 만들기</button></div>}
    </div>
  );
}

export function MatchArea({ p, isOpen, onOpen, readOnly = false, spaceOpen = false, onSpace, onOpenSpatial }) {
  const card = useRef(null);
  const side = () => card.current;
  const peek = useDetailPeek(p);
  const byKind = matchRefs(p);
  const total = MATCH_SECTIONS.reduce((a, [k]) => a + byKind[k].length, 0);
  const refs = MATCH_SECTIONS.flatMap(([k]) => byKind[k]);
  const fresh = useFresh(refs);
  useEffect(() => { if (fresh.size) card.current?.querySelector('.fresh')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }, [fresh]);
  const running = useSyncExternalStore(subscribeBirdseye, () => birdseyeBusy(p.id));
  const extracting = useExtractBusy(p.id) && !readOnly; // 원문에서 제품 · 솔루션 · 공간을 찾는 중
  const busy = (useSyncExternalStore(subscribeBirdseye, () => matchBusy(p.id)) || extracting) && !readOnly;
  const notice = readOnly ? null : extractNotice(p);
  const plan = planGroups(p.spacePlan, dssOf(p).products);   // (제품 DB 행 중 제품이 아닌 것 — 솔루션 · 서비스 — 은 공간에 놓지 않는다)
  const be = readOnly ? null : birdseyeOf(p);
  // 만들어 둔 조감도가 있으면 Storyboard의 빈 조감도 레이아웃에 넣는다(다른 탭 · 지난 방문에서 못 넣은 칸) — 이후 변경은 services/space-plan.js가 따라간다
  const beId = be && be.status === 'done' ? be.historyId : null;
  useEffect(() => { if (beId) void mapBirdseyeLayouts(p.id); }, [p.id, beId]);
  const go = (k) => onOpen(k || null);
  const unlink = (r, name, space) => {
    if (space) {
      const undo = removePlanProduct(p.id, r.slice(8), space.id);
      if (undo) notify(space.name + '에서 ' + name + ' 배치를 삭제했어요', '', { actionLabel: '되돌리기', onAction: undo });
      return;
    }
    removeRef(p.id, r);
    notify(name + ' 연결을 해제했어요', '', { actionLabel: '되돌리기', onAction: () => addRef(p.id, r) });
  };
  // 공간 묶음 끌어 놓기 — drag: { id, from }(from = 공간 id · null 미배치) · over: { to, before }
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const movable = !readOnly && !!plan && !spaceOpen && !running;
  const endDrag = () => { setDrag(null); setOver(null); };
  const drop = (e, to, before) => {
    e.preventDefault(); e.stopPropagation();
    if (drag) movePlanProduct(p.id, drag.id, drag.from, to, before);
    endDrag();
  };
  const overAt = (to, before) => { if (!over || over.to !== to || over.before !== before) setOver({ to, before }); };
  const zone = (to) => (movable ? {
    onDragOver: (e) => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; overAt(to, null); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o && o.to === to ? null : o)); },
    onDrop: (e) => drop(e, to, null),
  } : {});
  const dndOf = (id, from) => (!movable ? null : {
    cls: (drag && drag.id === id && drag.from === from ? ' dragging' : '') + (drag && over && over.to === from && over.before === id && !(drag.id === id && drag.from === from) ? ' drop-before' : ''),
    props: {
      draggable: true,
      onDragStart: (e) => { e.stopPropagation(); peek.hide(); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'product:' + id); setDrag({ id, from }); },
      onDragEnd: endDrag,
      onDragOver: (e) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; overAt(from, id); },
      onDrop: (e) => drop(e, from, id),
    },
  });
  const item = (r, space) => {
    const props = { r, peek, side, readOnly, onRemove: (ref, name) => unlink(ref, name, space), fresh: fresh.has(r) };
    return r.startsWith('product:') ? <ProductItem key={r} {...props} spaceName={space?.name} dnd={space === undefined ? null : dndOf(r.slice(8), space?.id ?? null)} /> : <TagItem key={r} {...props} />;
  };
  const isOver = (to) => !!(drag && over && over.to === to);
  const nProd = dssOf(p).products.length;
  return (
    <div className={'match-node' + (isOpen ? ' on' : '')}>
      <div className="node-top">
        <button className={'node' + (busy ? ' is-busy' : '')} onClick={() => go()} aria-busy={busy || undefined} aria-expanded={isOpen} aria-controls="mt-pop"
          aria-label={'제품 · 솔루션 · 서비스 ' + (isOpen ? '닫기' : '열기') + ' · 연결 ' + total + '개' + (extracting ? ' · 매칭 추론 중' : busy ? ' · 작업 중' : '')}>
          <Icon name="link" size={28} />
        </button>
      </div>
      <button className="node-name" onClick={() => go()} aria-expanded={isOpen} aria-controls="mt-pop">제품 · 솔루션 · 서비스</button>
      {extracting ? <ExtractLoading cardRef={card} /> : <div className="match-card dss" ref={card}>
        {MATCH_SECTIONS.map(([k, t, label]) => {
          const list = byKind[k];
          if (k === 'cases' && !list.length) return null; // 유관사례는 연결한 것이 있을 때만
          return (
            <section key={k} className={'dss-sec ' + t} data-ctx={k} aria-label={label + ' ' + list.length + '개'}>
              <button type="button" className="dss-h" onClick={() => go(k)} aria-label={label + ' ' + list.length + '개 · ' + (readOnly ? '보기' : '추가 · 삭제')}>
                <Icon name={t === 'service' ? 'shield' : t} size={13} /><span>{label}</span><b className="num">{list.length}</b>
                {!readOnly && <span className="dss-plus" aria-hidden="true"><Icon name="plus" size={12} stroke={2.6} />추가</span>}
              </button>
              {!list.length ? (
                readOnly ? <span className="dss-none">없음</span>
                  : <button type="button" className="dss-empty" onClick={() => go(k)}><Icon name="plus" size={12} stroke={2.4} />{label} 추가</button>
              ) : k !== 'products' ? (
                <div className="dss-chips">{list.map((r) => item(r))}</div>
              ) : plan ? (
                <div className={'dss-groups' + (drag ? ' dragging' : '')}>
                  {plan.groups.map((g) => (
                    <div key={g.id} className={'dss-grp spl-c' + g.color + (isOver(g.id) ? ' over' : '')} data-space={g.id} {...zone(g.id)}>
                      <div className="dss-grp-h"><i className="spl-dot" aria-hidden="true" /><span className="dss-grp-n">{g.name}</span><span className="num">{g.products.length}</span></div>
                      {g.products.length ? <div className="dss-grid">{g.products.map((id) => item('product:' + id, g))}</div>
                        : <span className="dss-grp-none">{drag ? '여기에 놓기' : '배치한 제품이 없어요'}</span>}
                    </div>
                  ))}
                  {(plan.rest.length > 0 || (drag && drag.from !== null)) && (
                    <div className={'dss-grp rest' + (isOver(null) ? ' over' : '')} data-space="" {...zone(null)}>
                      <div className="dss-grp-h"><i className="spl-dot" aria-hidden="true" /><span className="dss-grp-n">미배치</span><span className="num">{plan.rest.length}</span></div>
                      {plan.rest.length ? <div className="dss-grid">{plan.rest.map((id) => item('product:' + id, null))}</div>
                        : <span className="dss-grp-none">여기에 놓기</span>}
                    </div>
                  )}
                </div>
              ) : (
                <div className="dss-grid">{list.map((r) => item(r))}</div>
              )}
            </section>
          );
        })}
      </div>}
      {!readOnly && !extracting && (
        <div className="dss-act">
          {notice && (
            <div className="dss-be-err mx-err" role="alert"><Icon name="alert" size={13} /><span>{notice.text}</span><button type="button" className="dss-link" onClick={() => void ensureMatchExtract(p.id, { force: true })}>다시 시도</button></div>
          )}
          <button type="button" id="dss-space" className={'btn btn-primary btn-sm dss-space' + (spaceOpen ? ' on' : '') + (running ? ' busy' : '')} disabled={!nProd || running}
            onClick={onSpace} aria-expanded={spaceOpen} aria-controls="spl-pop" title={!nProd ? '제품을 1개 이상 연결하면 공간을 구성할 수 있어요' : running ? '3D 공간 조감도를 만드는 중이에요' : '선택 기능 · 업종 공간에 제품을 배치하고 3D 조감도를 만들어요'}>
            {running ? <><span className="spin" aria-hidden="true" />조감도 생성 중…</> : <><Icon name="map" size={15} />공간 구성{plan ? <span className="dss-space-n num">공간 {plan.groups.length}</span> : <span className="dss-space-n">선택</span>}</>}
          </button>
          {!nProd && <span className="dss-lock">제품을 1개 이상 연결하면 공간을 구성할 수 있어요</span>}
          {be && be.status === 'done' && !running && <BirdseyeCard be={be} onOpen={() => onOpenSpatial && onOpenSpatial(be.historyId)} onRedo={() => startBirdseye(p.id)} />}
          {be && be.status === 'error' && !running && (
            <div className="dss-be-err" role="alert"><Icon name="alert" size={13} /><span>{be.error}</span><button type="button" className="dss-link" onClick={() => startBirdseye(p.id)}>다시 만들기</button></div>
          )}
        </div>
      )}
      {peek.node}
    </div>
  );
}
