// Storyboard 제품 · 솔루션 매칭 버블 + 그 아래 매칭 카드(선택한 솔루션 → 유관사례 → 제품) + '공간 구성' 버튼.
//   솔루션 · 유관사례: 입력창에서 @로 태그했을 때와 같은 @태그 칩(썸네일 + 이름) · 제품: 3열 이미지 + 이름. 개수 제한 없이 전부 보인다.
//   항목에 마우스를 올리면 상세가 카드 오른쪽(추가 팝업이 뜨는 자리)에 뜨고, 세로 위치만 그 항목에 맞춘다. 누르면 상세 창, ×는 연결 해제(되돌리기).
//   공간 구성을 완료하면 제품은 공간별 묶음(공간마다 다른 색 테두리)으로, 어느 공간에도 없는 제품은 '미배치'로 보인다.
//   '공간 구성'은 제품이 1개 이상일 때 켜지고, 조감도를 만드는 동안 '조감도 생성 중'을 보여 준다.
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from './common.jsx';
import { Thumb } from './Thumbs.jsx';
import { tagMeta } from './tagcard.jsx';
import { useDetailPeek } from './reference-detail.jsx';
import { addRef, removeRef } from './requirements.jsx';
import { notify } from '../services/notifications.js';
import { planGroups } from '../domain/proposals/space-plan.js';
import { birdseyeOf, birdseyeBusy, subscribeBirdseye, startBirdseye } from '../services/space-plan.js';
import '../styles/match-space.css';

export const MATCH_SECTIONS = [['solutions', 'solution', '솔루션'], ['cases', 'case', '유관사례'], ['products', 'product', '제품']];

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

/** 솔루션 · 유관사례 — @태그 칩 (common.jsx MentionEditor · tagcard.jsx MentionInline 과 같은 모양) */
function TagItem({ r, peek, side, readOnly, onRemove, fresh }) {
  const m = tagMeta(r); if (!m) return null;
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
function ProductItem({ r, peek, side, readOnly, onRemove, fresh }) {
  const m = tagMeta(r); if (!m) return null;
  return (
    <div className={'dss-prod' + (fresh ? ' fresh' : '')} data-ref={r} tabIndex={0} role="button" aria-label={m.name + ' · 상세 보기'} {...hoverOf(peek, r, side)} {...peek.detailProps(r)}>
      <Thumb r={r} />
      <span className="dss-pname" title={m.name}>{m.name}</span>
      {!readOnly && <button type="button" className="dss-x" onClick={(e) => { e.stopPropagation(); peek.hide(); onRemove(r, m.name); }} onKeyDown={(e) => e.stopPropagation()} onFocus={(e) => e.stopPropagation()} aria-label={m.name + ' 연결 해제'} title="연결 해제"><Icon name="x" size={10} stroke={3} /></button>}
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
        {!be.foreign && <Icon name="ext" size={13} className="dss-be-go" />}
      </button>
      {(be.stale || be.foreign) && <div className="dss-be-note"><span>{be.stale ? '공간 구성이 바뀌었어요' : '다른 계정이 만든 조감도예요'}</span><button type="button" className="dss-link" onClick={onRedo}>다시 만들기</button></div>}
    </div>
  );
}

export function MatchArea({ p, isOpen, onOpen, readOnly = false, spaceOpen = false, onSpace, onOpenSpatial }) {
  const card = useRef(null);
  const side = () => card.current;
  const peek = useDetailPeek(p);
  const total = MATCH_SECTIONS.reduce((a, [k]) => a + p.ctx[k].length, 0);
  const refs = MATCH_SECTIONS.flatMap(([k, t]) => p.ctx[k].map((id) => t + ':' + id));
  const fresh = useFresh(refs);
  useEffect(() => { if (fresh.size) card.current?.querySelector('.fresh')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); }, [fresh]);
  const running = useSyncExternalStore(subscribeBirdseye, () => birdseyeBusy(p.id));
  const plan = planGroups(p.spacePlan, p.ctx.products);
  const be = readOnly ? null : birdseyeOf(p);
  const go = (k) => onOpen(k || null);
  const unlink = (r, name) => {
    removeRef(p.id, r);
    notify(name + ' 연결을 해제했어요', '', { actionLabel: '되돌리기', onAction: () => addRef(p.id, r) });
  };
  const item = (r, key = r) => {
    const props = { r, peek, side, readOnly, onRemove: unlink, fresh: fresh.has(r) };
    return r.startsWith('product:') ? <ProductItem key={key} {...props} /> : <TagItem key={key} {...props} />;
  };
  const nProd = p.ctx.products.length;
  return (
    <div className={'match-node' + (isOpen ? ' on' : '')}>
      <div className="node-top">
        <button className="node" onClick={() => go()} aria-expanded={isOpen} aria-controls="mt-pop" aria-label={'제품 · 솔루션 매칭 ' + (isOpen ? '닫기' : '열기') + ' · 연결 ' + total + '개'}>
          <Icon name="link" size={28} />
          <span className="order">{total}</span>
        </button>
      </div>
      <button className="node-name" onClick={() => go()} aria-expanded={isOpen} aria-controls="mt-pop">제품 · 솔루션 매칭</button>
      <div className="match-card dss" ref={card}>
        {MATCH_SECTIONS.map(([k, t, label]) => {
          const list = p.ctx[k];
          return (
            <section key={k} className={'dss-sec ' + t} data-ctx={k} aria-label={label + ' ' + list.length + '개'}>
              <button type="button" className="dss-h" onClick={() => go(k)} aria-label={label + ' ' + list.length + '개 · ' + (readOnly ? '보기' : '추가 · 삭제')}>
                <Icon name={t} size={13} /><span>{label}</span><b className="num">{list.length}</b>
                {!readOnly && <span className="dss-plus" aria-hidden="true"><Icon name="plus" size={12} stroke={2.6} />추가</span>}
              </button>
              {!list.length ? (
                readOnly ? <span className="dss-none">없음</span>
                  : <button type="button" className="dss-empty" onClick={() => go(k)}><Icon name="plus" size={12} stroke={2.4} />{label} 추가</button>
              ) : k !== 'products' ? (
                <div className="dss-chips">{list.map((id) => item(t + ':' + id))}</div>
              ) : plan ? (
                <div className="dss-groups">
                  {plan.groups.map((g) => (
                    <div key={g.id} className={'dss-grp spl-c' + g.color} data-space={g.id}>
                      <div className="dss-grp-h"><i className="spl-dot" aria-hidden="true" /><span className="dss-grp-n">{g.name}</span><span className="num">{g.products.length}</span></div>
                      {g.products.length ? <div className="dss-grid">{g.products.map((id) => item('product:' + id, g.id + ':' + id))}</div>
                        : <span className="dss-grp-none">배치한 제품이 없어요</span>}
                    </div>
                  ))}
                  {plan.rest.length > 0 && (
                    <div className="dss-grp rest" data-space="">
                      <div className="dss-grp-h"><i className="spl-dot" aria-hidden="true" /><span className="dss-grp-n">미배치</span><span className="num">{plan.rest.length}</span></div>
                      <div className="dss-grid">{plan.rest.map((id) => item('product:' + id))}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="dss-grid">{list.map((id) => item('product:' + id))}</div>
              )}
            </section>
          );
        })}
      </div>
      {!readOnly && (
        <div className="dss-act">
          <button type="button" id="dss-space" className={'btn btn-primary btn-sm dss-space' + (spaceOpen ? ' on' : '') + (running ? ' busy' : '')} disabled={!nProd || running}
            onClick={onSpace} aria-expanded={spaceOpen} aria-controls="spl-pop" title={!nProd ? '제품을 1개 이상 연결하면 공간을 구성할 수 있어요' : running ? '공간 조감도를 만드는 중이에요' : '업종 공간에 제품을 배치하고 조감도를 만들어요'}>
            {running ? <><span className="spin" aria-hidden="true" />조감도 생성 중…</> : <><Icon name="map" size={15} />공간 구성{plan ? <span className="dss-space-n num">공간 {plan.groups.length}</span> : null}</>}
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
