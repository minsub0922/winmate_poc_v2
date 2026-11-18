// 제품 · 솔루션 · 서비스 popup — to the right of the 매칭 카드 under the Storyboard 매칭 bubble (bubblepop.jsx beside). Opens when
// the bubble or a section of the card is clicked. 이전 불러오기 sits in the header left of ×; no industry picker, no tabs —
// one directory explorer (ctxexplorer.jsx MatchExplorer, live) with 제품 · 솔루션 · 서비스 · 사례 as top folders, search on the right
// across all of them, and recommendations marked off at the top of a top folder. A click links or unlinks at once and the card
// on the left shows it.
// 저장 only confirms and closes it — the Storyboard stage is not changed here (parts start from the 레이아웃 구성 bubble).
import React from 'react';
import { Icon, toast } from './common.jsx';
import { BubblePopup } from './bubblepop.jsx';
import { IND } from '../services/catalog.js';
import { inferIndustry, reqText } from '../services/search.js';
import { MatchExplorer } from './ctxexplorer.jsx';
import { matchRefs } from './match-area.jsx';
import { HistoryReuse } from './history-reuse.jsx';

// ---------- saved state ----------
const hashStr = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36) + ':' + s.length; };
/** Fingerprint of the requirements (자유형식 · 입력 폼 · 첨부) — what 저장 in the requirements popup records. */
export function reqSig(p) {
  const files = (p.req.files || []).map((f) => [f.name, f.size, f.memo || '']);
  return hashStr(JSON.stringify([p.req.free, p.req.form, files]));
}
// saved before the matching popup split off: the fingerprint also covered industry + linked context
const legacySig = (p) => { const files = (p.req.files || []).map((f) => [f.name, f.size, f.memo || '']); return hashStr(JSON.stringify([p.req.free, p.req.form, files, p.ind || null, p.indName || '', p.ctx])); };
export const isReqSaved = (p) => !!p.reqSaved && (p.reqSaved === reqSig(p) || p.reqSaved === legacySig(p));
export function industryLabel(p) {
  if (p.indName) return p.indName;
  return p.ind && IND[p.ind] ? IND[p.ind].name : '';
}

// ---------- popup ----------
// 제품 → 솔루션 → 서비스 → 사례 순서 (탐색기 최상위 폴더와 같은 순서)
const KINDS = [['products', '제품'], ['solutions', '솔루션'], ['services', '서비스'], ['cases', '사례']];

/**
 * 제품 · 솔루션 · 서비스 popup — 고르는 곳. 매칭 카드 오른쪽에 떠서, 누르는 즉시 연결 · 해제되고 결과는 왼쪽 카드에 바로 보인다
 * (그래서 연결된 목록을 팝업에 따로 두지 않는다 — 해제는 카드의 × 또는 여기서 다시 누르기).
 * focus: { k: 'products' | 'solutions' | 'services' | 'cases', n } — the top folder to show.
 */
export function MatchPopup({ p, focus, onClose, onSaved }) {
  // 업종은 고르지 않는다 — 저장된 업종이 있으면 그것, 없으면 요구사항에서 추론해 추천에만 쓴다
  const ind = p.ind || inferIndustry(reqText(p));
  // 연결 · 해제는 누르는 즉시 저장된다 — 저장은 확인하고 닫을 뿐이다(목차는 '레이아웃 구성' 버블에서 만든다 · 단계는 바꾸지 않는다)
  const save = () => {
    toast('제품 · 솔루션 · 서비스 매칭을 저장했어요');
    onSaved(false);
  };
  return (
    <BubblePopup cls="mt" extra="mt-live-pop" anchor=".match-node .node" beside=".match-node .match-card" fill icon={<Icon name="link" size={17} />} title="제품 · 솔루션 · 서비스" onClose={onClose}
      bodyClass="mt-live"
      sub={<span className="bp-sub num">{(() => { const n = matchRefs(p); return KINDS.map(([k, l]) => <span key={k}>{l} <b>{n[k].length}</b></span>); })()}</span>}
      headerActions={<HistoryReuse p={p} kind="ctx" compact />}
      footer={<>
        <span className="bp-note">누르는 즉시 왼쪽 매칭 카드에 반영돼요 · 다시 누르면 해제</span>
        <span className="sp" />
        <button className="btn btn-primary" onClick={save}><Icon name="check" size={15} />저장</button>
      </>}>
      <MatchExplorer p={p} ind={ind} focus={focus} />
    </BubblePopup>
  );
}
