// B2B 전략 시뮬레이션 (BETA) — 특정 요구사항을 두고 최종 제안 대상자(고객)와 채팅으로 전략을 시험한다.
//   설정: 요구사항(예시 · 내 제안서 · 직접 입력) + 난이도 3단계(호의적 · 첫 고객 · 까다로운 고객) + 고객사 프로필
//   대화: 고객 대사 스트리밍, @로 제품 · 솔루션 · 유관사례 언급, 입력창 위 추천 답변 3개
//   오른쪽: 고객 만족도 · 제안 품질('제안서 검토' 기준 대표 4개 · 마우스를 올리면 상세) · 참고할 Best Scenario
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, MentionEditor, AddRefInput, Modal, toast, fmtWhen } from '../components/common.jsx';
import { TagChip, MentionInline } from '../components/tagcard.jsx';
import { useDetailPeek } from '../components/peek.jsx';
import { ScenarioDetail } from './ScenariosPage.jsx';
import { FitSlide } from '../domain/slides/Slide.jsx';
import { Thumb } from '../components/Thumbs.jsx';
import { tagMeta } from '../components/tagcard.jsx';
import { IND, INDUSTRIES, L as LAYOUT } from '../services/catalog.js';
import { useStore, createProposal, update, seg, segRefs, uid } from '../repositories/proposals.js';
import { REQ_TYPES, STAGES } from '../domain/templates/scenarios.js';
import { fillOf } from '../domain/templates/scenario_fills.js';
import { CR } from '../domain/review/criteria.js';
import { LEVELS, LV, METERS, SIM_STAGES, STAGE_IX, PRESETS, PRESET_QUICK, setupFromScenario, setupFromProposal, emptySetup, buildProfile, setupText, setupRefs, josa, personaOf, defaultGender, PERSONAS } from '../domain/simulation/profile.js';
import { usePersonas, addPersona, updatePersona, deletePersona } from '../repositories/personas.js';
import { LOOKS, LOOK, SKINS, HAIRS, SUITS, GLASSES, skinOf, hairOf, suitOf, tweak } from '../domain/simulation/looks.js';
import { Portrait } from '../components/persona.jsx';
import { SIM_CATS, CHAT_DESC, critName, aggregate, band, similarScenarios, mentionedRefs } from '../domain/simulation/score.js';
import { customerTurn, debrief } from '../domain/simulation/engine.js';
import { useSims, getSim, putSim, patchSim, deleteSim, newSim, seedOnce } from '../repositories/simulations.js';
import { demoSims } from '../domain/simulation/demo.js';

// ---------- icons (sim only) ----------
const SP = {
  chat: 'M4 5h16v11H10l-5 4v-4H4z M8 9.5h8 M8 12.5h5', send: 'M4 12L20 4l-5 16-3-6.5z M12 13.5L20 4', stop: 'M7 7h10v10H7z',
  at: 'M16 12a4 4 0 1 1-1.2-2.8 M16 8v5a2.5 2.5 0 0 0 5 0v-1a9 9 0 1 0-3.6 7.2', flag: 'M5 21V4 M5 4h11l-2 4 2 4H5', up: 'M12 19V5 M6 11l6-6 6 6', down: 'M12 5v14 M6 13l6 6 6-6',
};
export function SimIcon({ name, size = 16, stroke = 2, className = '' }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill={name === 'stop' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={SP[name]} /></svg>;
}
const indName = (code) => (code && IND[code] ? IND[code].name : '');
const plainLen = (segs) => (segs || []).map((s) => (s.t != null ? s.t : 'x')).join('').trim().length;

// ---------- hover / focus popover ----------
function Tip({ content, children, className = '', label, wide = false, as = 'div', place = 'side', focusable = true }) {
  const ref = useRef(null); const t = useRef(null);
  const [r, setR] = useState(null);
  const show = () => { clearTimeout(t.current); t.current = setTimeout(() => ref.current && setR(ref.current.getBoundingClientRect()), 110); };
  const hide = () => { clearTimeout(t.current); setR(null); };
  useEffect(() => () => clearTimeout(t.current), []);
  const Tag = as;
  return (
    <Tag ref={ref} className={'sim-tip ' + className} tabIndex={focusable ? 0 : undefined} aria-label={label} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide} onMouseDown={hide}>
      {children}
      {r && createPortal(<TipBox rect={r} wide={wide} place={place}>{typeof content === 'function' ? content() : content}</TipBox>, document.body)}
    </Tag>
  );
}
function TipBox({ rect, children, wide, place }) {
  const ref = useRef(null);
  const W = Math.min(wide ? 380 : 330, window.innerWidth - 24);
  const [pos, setPos] = useState({ left: -9999, top: -9999, width: W });
  useLayoutEffect(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const h = ref.current ? ref.current.offsetHeight : 240;
    let left, top;
    if (place === 'top') { left = Math.max(12, Math.min(vw - W - 12, rect.left)); top = rect.top - h - 8 >= 12 ? rect.top - h - 8 : rect.bottom + 8; }
    else if (rect.left - W - 12 >= 12) { left = rect.left - W - 12; top = rect.top; }
    else if (rect.right + W + 12 <= vw - 12) { left = rect.right + 12; top = rect.top; }
    else { left = Math.max(12, Math.min(vw - W - 12, rect.left)); top = rect.bottom + 8 + h <= vh - 12 ? rect.bottom + 8 : rect.top - h - 8; }
    top = Math.max(12, Math.min(top, vh - h - 12));
    setPos({ left, top, width: W });
  }, [rect.left, rect.top]);
  return <div ref={ref} className="sim-pop" style={pos} role="tooltip">{children}</div>;
}

// ---------- shared bits ----------
function LevelBadge({ level, small }) {
  const L = LV[level];
  return <span className={'sim-lv lv-' + level + (small ? ' sm' : '')}><b className="num">{level}</b>{L.name}</span>;
}
const BASE_MOOD = { 1: '호의', 2: '중립', 3: '의심' };
function Avatar({ pf, size = 36, mood }) {
  return <span className={'sim-av lv-' + pf.level} style={{ width: size, height: size }} aria-hidden="true"><Portrait who={personaOf(pf)} mood={mood || BASE_MOOD[pf.level]} size={size} /></span>;
}
function Dots({ n, max = 5 }) { return <span className="sim-dots" aria-label={n + ' / ' + max}>{Array.from({ length: max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>; }
function Bar({ v, cls = '' }) { return <span className={'sim-bar ' + cls}><i style={{ width: (v == null ? 0 : v) + '%' }} /></span>; }
const bandCls = (v) => 'b-' + band(v).k;

function ProfileCard({ pf, level, compact = false, mood }) {
  const L = LV[level];
  const per = personaOf(pf);
  const age = pf.age || per.age, career = pf.career || per.career, traits = pf.traits || per.traits, quote = pf.quote || per.quote, style = pf.style || per.style;
  return (
    <div className={'sim-prof lv-' + level + (compact ? ' compact' : '')}>
      <div className="sp-id">
        <div className="sp-photo"><Portrait who={per} mood={mood || BASE_MOOD[level]} size={compact ? 104 : 148} round={false} title={pf.name + ' 프로필 사진'} /></div>
        <div className="sp-main">
          <span className="sp-co"><i className="sp-logo" aria-hidden="true">{(pf.company || '고').replace(/\s+/g, '').slice(0, 1)}</i><span>{pf.company}</span>{pf.ind && <em>{indName(pf.ind).split(' · ')[0]}</em>}</span>
          <b className="sp-name">{pf.name}<span className="sp-age num">{age}</span></b>
          <span className="sp-role">{pf.role}</span>
          <span className="sp-career">{career}</span>
          <div className="sp-tags">{traits.map((t) => <span key={t}>{t}</span>)}</div>
          <LevelBadge level={level} small />
        </div>
      </div>
      <p className="sp-quote">“{quote}”</p>
      <dl className="sp-traits">
        <dt>관계</dt><dd>{L.relation}</dd>
        <dt>삼성 인식</dt><dd>{L.perception}</dd>
        <dt>의사결정</dt><dd>{style}</dd>
        <dt>경쟁</dt><dd>{L.competition}</dd>
        <dt>예산</dt><dd>{L.budget}</dd>
        <dt>말투</dt><dd>{L.tone}</dd>
      </dl>
      {pf.interests.length > 0 && (
        <div className="sp-sec"><span className="sp-k">중요하게 보는 것</span><div className="sp-ints">{pf.interests.map((x, i) => <span key={i} className="sp-int">{x}</span>)}</div></div>
      )}
      <div className="sp-sec">
        <span className="sp-k">숨은 우려 <b className="num">{pf.concerns.length}</b></span>
        <div className="sp-concerns">
          {pf.concerns.map((c) => (c.revealed
            ? <span key={c.id} className={'sp-cc ' + (c.resolved ? 'ok' : 'open')}>{c.resolved ? <Icon name="check" size={11} stroke={3} /> : <Icon name="alert" size={11} stroke={2.4} />}{c.text}</span>
            : <span key={c.id} className="sp-cc hidden"><b>?</b>대화 중에 드러나요</span>))}
        </div>
      </div>
      <div className="sp-win"><Icon name="flag" size={13} /><span>만족도 <b className="num">{L.win}</b> 이상에서 결정을 요청하면 <b>{pf.ask}</b>{josa(pf.ask, '을/를').slice(pf.ask.length)} 수락해요 · <span className="num">{L.lose}</span> 이하로 떨어지면 미팅이 끝나요</span></div>
    </div>
  );
}

/* =========================================================
   Page
   ========================================================= */
export function SimPage({ go, id }) {
  useEffect(() => { seedOnce(demoSims); }, []);
  const exists = useSims((s) => !!(id && s.sims.find((x) => x.id === id)));
  return exists ? <SimSession key={id} id={id} go={go} /> : <SimSetup go={go} />;
}

/* =========================================================
   Setup — 한 화면에는 요구사항 요약 · 만날 고객만, 고치기 · 프로필 · 기록은 팝업
   ========================================================= */
const STATUS = { active: '진행 중', won: '설득 성공', lost: '미팅 종료', ended: '마무리' };
function SimSetup({ go }) {
  const sims = useSims((s) => s.sims);
  const [st, setSt] = useState(() => setupFromScenario(PRESET_QUICK[0]));
  const [level, setLevel] = useState(2);
  const customs = usePersonas();
  const [pkey, setPkey] = useState(() => '2' + defaultGender(setupFromScenario(PRESET_QUICK[0])));
  const [pop, setPop] = useState(null); // 'req' | 'profile' | 'pick' | { edit: 초기값, key?: 덮어쓸 프로필 }
  const peek = useDetailPeek(pseudoP(st));
  const sel = PERSONAS[pkey] || customs.find((p) => p.key === pkey) || PERSONAS[level + 'M'];
  const gender = sel.gender;
  const pf = useMemo(() => buildProfile(st, level, gender, sel), [st, level, sel]);
  const per = personaOf(pf);
  const pickLevel = (lv) => { setLevel(lv); if (!sel.custom) setPkey(lv + sel.gender); };
  const choose = (p) => { setPkey(p.key); setLevel(p.level); };
  const editFrom = (p, asNew) => setPop({ edit: draftOf(p, level, gender), key: !asNew && p && p.custom ? p.key : null });
  const refs = setupRefs(st);
  const text = setupText(st);
  const ok = text.length >= 8;
  const start = () => {
    if (!ok) { setPop('req'); toast('요구사항을 먼저 정해 주세요', 'warn'); return; }
    const s = { ...st, gender, customer: (st.customer || '').trim() || '고객사', role: (st.role || '').trim() || '의사결정자' };
    const sim = putSim(newSim(s, level, sel));
    go({ name: 'sim', id: sim.id });
  };
  return (
    <div className="simset">
      <div className="simset-in">
        <header className="ss-top">
          <span className="ss-eyebrow"><Icon name="sparkle" size={13} />전략 Agent</span>
          <h1>B2B 전략 시뮬레이션 <span className="sim-beta">BETA</span></h1>
          <p>전략 Agent가 최종 제안 대상자가 되어 대화로 제안 전략을 미리 시험해 줘요.</p>
        </header>

        <SimIntro gender={gender} />

        <div className="ss-board">
          <section className="ss-card" aria-labelledby="ss-req-h">
            <div className="ss-card-h"><h2 id="ss-req-h">요구사항</h2><button className="btn btn-sm" onClick={() => setPop('req')}><Icon name="edit" size={13} />바꾸기</button></div>
            {ok ? (
              <button className="ss-reqsum" onClick={() => setPop('req')}>
                <b className="t">{st.title || '직접 입력한 요구사항'}</b>
                <span className="m">{[st.customer || '고객사 미정', st.ind && IND[st.ind] ? IND[st.ind].name.split(' · ')[0] : '', st.role].filter(Boolean).join(' · ')}</span>
                <span className="x">{text}</span>
              </button>
            ) : (
              <button className="ss-reqempty" onClick={() => setPop('req')}><Icon name="plus" size={18} stroke={2.4} /><b>요구사항 정하기</b><span>예시 · 내 제안서 · 직접 입력</span></button>
            )}
            {refs.length > 0 && (
              <div className="ss-refs">
                {refs.slice(0, 4).map((r) => <TagChip key={r} r={r} peek={peek} />)}
                {refs.length > 4 && <button className="ss-refmore" onClick={() => setPop('req')}>+{refs.length - 4}</button>}
              </div>
            )}
          </section>

          <section className={'ss-card ss-cust lv-' + level} aria-labelledby="ss-cust-h">
            <div className="ss-card-h">
              <h2 id="ss-cust-h">만날 고객</h2>
              <div className="ss-card-acts">
                <button className="btn btn-sm btn-ghost ss-newp" onClick={() => editFrom(null, true)}><Icon name="plus" size={13} stroke={2.4} />새 프로필</button>
                <button className="btn btn-sm ss-pickp" onClick={() => setPop('pick')}><Icon name="users" size={13} />바꾸기</button>
              </div>
            </div>
            <button className="ss-hero" onClick={() => setPop('profile')} aria-label={pf.name + ' 프로필 자세히 보기'}>
              <span className="ss-hero-photo"><Portrait who={per} mood={BASE_MOOD[level]} size={136} round={false} /></span>
              <span className="ss-hero-t">
                <span className="co">{pf.company}{sel.custom && <em className="ss-mine">내 프로필</em>}</span>
                <b>{pf.name}<span className="num">{per.age}</span></b>
                <span className="role">{pf.role}</span>
                <span className="q">“{per.quote}”</span>
                <span className="more">프로필 자세히<Icon name="chev" size={13} /></span>
              </span>
            </button>
            <div className="ss-lvpick" role="radiogroup" aria-label="고객 난이도">
              {LEVELS.map((L) => (
                <Tip key={L.id} place="top" focusable={false} className="ss-lvtip" content={() => <LevelTip L={L} />}>
                  <button role="radio" aria-checked={level === L.id} className={'ss-lv lv-' + L.id} onClick={() => pickLevel(L.id)}>
                    <Portrait who={L.id + gender} mood={BASE_MOOD[L.id]} size={36} />
                    <span><b className="num">{L.id}단계</b>{L.name}</span>
                  </button>
                </Tip>
              ))}
            </div>
          </section>
        </div>

        <button className={'ss-go lv-' + level} onClick={start}>
          <span className="ss-go-ic"><SimIcon name="chat" size={20} /></span>
          <span className="ss-go-t"><b>시뮬레이션 시작</b><span>{ok ? <>{pf.company} {pf.name} · {level}단계 {LV[level].name}</> : '요구사항을 먼저 정해 주세요'}</span></span>
          <span className="ss-go-face" aria-hidden="true"><Portrait who={per} mood={BASE_MOOD[level]} size={34} /></span>
          <Icon name="arrowR" size={20} stroke={2.4} />
        </button>

        {sims.length > 0 && (
          <section className="ss-histw" aria-labelledby="ss-hist-h">
            <div className="ss-hist-h"><h2 id="ss-hist-h">최근 시뮬레이션</h2><span className="num">{sims.length}</span></div>
            <div className="ss-hrows" role="list">{sims.map((s) => <HistRow key={s.id} s={s} go={go} />)}</div>
          </section>
        )}
      </div>

      {pop === 'req' && <ReqModal st={st} onClose={() => setPop(null)} onApply={(d) => { setSt(d); setPop(null); }} />}
      {pop === 'profile' && <ProfileModal pf={pf} sel={sel} level={level} onClose={() => setPop(null)}
        onNew={() => editFrom(null, true)} onEdit={() => editFrom(sel, false)}
        onDelete={() => { deletePersona(sel.key); setPkey(level + sel.gender); setPop(null); toast('프로필을 지웠어요'); }} />}
      {pop === 'pick' && <PersonaPicker cur={sel.key} customs={customs} level={level} onClose={() => setPop(null)}
        onPick={(p) => { choose(p); setPop(null); }} onNew={() => editFrom(null, true)} onEdit={(p) => editFrom(p, false)} />}
      {pop && pop.edit && <PersonaEditor init={pop.edit} canSave={!!pop.key} role={st.role} onClose={() => setPop(null)}
        onSave={(d, asNew) => { const p = asNew ? addPersona(d) : updatePersona(pop.key, d); choose(p); setPop(null); toast(asNew ? '새 프로필을 저장했어요' : '프로필을 저장했어요'); }} />}
      {peek.node}
    </div>
  );
}

/** 시뮬레이션 안내 — 읽기 전용 흐름도 (진행 4단계 + 얻는 것 3가지). 누르는 요소 없음 */
function SimIntro({ gender }) {
  const steps = [
    { n: 1, t: '요구사항 정하기', d: '예시 · 내 제안서 · 직접 입력', ic: <Icon name="doc" size={18} /> },
    { n: 2, t: '고객 고르기', d: '난이도 3단계, 숨은 우려를 가진 고객', ic: <span className="si-faces">{[1, 2, 3].map((l) => <Portrait key={l} who={l + gender} mood={BASE_MOOD[l]} size={26} />)}</span> },
    { n: 3, t: '대화로 전략 시험', d: '전략 Agent가 고객이 되어 반응하고 채점', ic: <SimIcon name="chat" size={18} /> },
    { n: 4, t: '총평 받고 이어가기', d: '잘한 점 · 고칠 점, 그 흐름으로 제안서 시작', ic: <SimIcon name="flag" size={17} /> },
  ];
  const gains = [
    ['고객 반응 미리 보기', '만족도 · 숨은 우려'],
    ['제안 품질 점수', '‘제안서 검토’ 기준 실시간 채점'],
    ['다음 수와 참고 자료', '추천 답변 · 비슷한 Best Scenario'],
  ];
  return (
    <section className="ss-intro" aria-label="진행 과정">
      <ol className="si-flow">
        {steps.map((x) => (
          <li key={x.n} className={'si-step s' + x.n}>
            <span className="si-dot num" aria-hidden="true">{x.n}</span>
            <span className="si-t"><b>{x.t}<span className="si-ic" aria-hidden="true">{x.ic}</span></b><span>{x.d}</span></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------- 고객 프로필: 보기 · 고르기 · 만들기(고쳐서 새로 저장) ---------- */
const DEFAULT_FACE = { '1M': 'm01', '2M': 'm02', '3M': 'm03', '1F': 'f01', '2F': 'f02', '3F': 'f03' };
/** 편집 초기값 — p가 없으면 빈 새 프로필(지금 성별의 사진 하나로 시작) */
function draftOf(p, level, gender) {
  if (!p) {
    const f = LOOK[gender === 'F' ? 'f04' : 'm05'];
    return { level, gender: f.gender, name: '', age: 45, role: '', career: '', traits: [], quote: '', style: '', face: f.id, look: structuredClone(f.look) };
  }
  return { level: p.level || level, gender: p.gender, name: p.name, age: p.age, role: p.role || '', career: p.career || '', traits: [...(p.traits || [])], quote: p.quote || '', style: p.style || '', face: p.face || DEFAULT_FACE[p.key] || '', look: structuredClone(p.look) };
}

function ProfileModal({ pf, sel, level, onClose, onNew, onEdit, onDelete }) {
  const [sure, setSure] = useState(false);
  return (
    <Modal title="고객사 프로필" size="narrow" onClose={onClose}
      footer={<>
        {sel.custom && <button className={'btn btn-ghost pm-del' + (sure ? ' sure' : '')} onClick={() => (sure ? onDelete() : setSure(true))}><Icon name="trash" size={14} />{sure ? '한 번 더 누르면 지워요' : '지우기'}</button>}
        <span className="sp" />
        <button className="btn pm-new" onClick={onNew}><Icon name="plus" size={14} stroke={2.4} />새 프로필</button>
        <button className="btn btn-primary pm-edit" onClick={onEdit}><Icon name="edit" size={14} />{sel.custom ? '고치기' : '고쳐서 새로 저장'}</button>
      </>}>
      <ProfileCard pf={pf} level={level} />
    </Modal>
  );
}

function PersonaPicker({ cur, customs, onPick, onNew, onEdit, onClose }) {
  const defs = Object.values(PERSONAS).sort((a, b) => a.level - b.level || (a.gender === 'M' ? -1 : 1));
  const card = (p) => (
    <div key={p.key} className={'pp-card lv-' + p.level + (cur === p.key ? ' on' : '')}>
      <button className="pp-main" aria-pressed={cur === p.key} onClick={() => onPick(p)}>
        <Portrait who={p} mood={BASE_MOOD[p.level]} size={56} />
        <span className="pp-t">
          <b>{p.name}<span className="num">{p.age}</span></b>
          <span className="pp-lv">{p.level}단계 · {LV[p.level].name}</span>
          <span className="pp-q">“{p.quote || PERSONAS[p.level + p.gender].quote}”</span>
        </span>
      </button>
      {p.custom && <button className="pp-edit" aria-label={p.name + ' 프로필 고치기'} title="고치기" onClick={() => onEdit(p)}><Icon name="edit" size={13} /></button>}
    </div>
  );
  return (
    <Modal title="고객 프로필" size="sim-ppm" onClose={onClose}>
      <section className="pp-sec">
        <h3>내 프로필 <span className="num">{customs.length}</span></h3>
        <div className="pp-grid">
          <button className="pp-add" onClick={onNew}><Icon name="plus" size={18} stroke={2.4} /><b>새 프로필</b></button>
          {customs.map(card)}
        </div>
      </section>
      <section className="pp-sec">
        <h3>기본 프로필</h3>
        <div className="pp-grid">{defs.map(card)}</div>
      </section>
    </Modal>
  );
}

function Swatches({ label, items, value, onPick, chip = false }) {
  return (
    <div className="pfe-tw-row">
      <span className="k">{label}</span>
      <div className="pfe-sw" role="radiogroup" aria-label={label}>
        {items.map((x) => (
          <button key={x.k || 'none'} role="radio" aria-checked={value === x.k} title={x.name} aria-label={label + ' ' + x.name}
            className={chip ? 'pfe-chip' : 'pfe-dot'} style={chip ? undefined : { '--c': x.c || x.skin }} onClick={() => onPick(x.k)}>{chip ? x.name : null}</button>
        ))}
      </div>
    </div>
  );
}

/** 프로필 만들기 · 고치기 — 사진 30종 + 피부 · 머리색 · 안경 · 옷 조정, 이름 · 나이 · 직책 · 경력 · 성향 · 한마디 · 의사결정 · 난이도 */
function PersonaEditor({ init, canSave, role, onSave, onClose }) {
  const [d, setD] = useState(init);
  const [g, setG] = useState('all');
  const [tIn, setTIn] = useState('');
  const set = (patch) => setD((x) => ({ ...x, ...patch }));
  const tw = (kind, v) => setD((x) => ({ ...x, look: tweak(x.look, kind, v) }));
  const ok = d.name.trim().length > 0;
  const base = PERSONAS[d.level + d.gender];
  const faces = LOOKS.filter((x) => g === 'all' || x.gender === g);
  const addTrait = () => { const v = tIn.trim(); if (!v || d.traits.length >= 4) return; set({ traits: [...d.traits, v.slice(0, 14)] }); setTIn(''); };
  return (
    <Modal title={canSave ? '프로필 고치기' : '새 고객 프로필'} size="sim-pfem" onClose={onClose}
      footer={<>
        <span className="sp" />
        <button className="btn" onClick={onClose}>취소</button>
        {canSave && <button className="btn pfe-save" disabled={!ok} onClick={() => onSave(d, false)}><Icon name="check" size={14} stroke={2.4} />저장</button>}
        <button className="btn btn-primary pfe-saveas" disabled={!ok} onClick={() => onSave(d, true)}><Icon name="plus" size={14} stroke={2.4} />새 프로필로 저장</button>
      </>}>
      <div className="pfe">
        <div className="pfe-photo">
          <div className={'pfe-prev lv-' + d.level}>
            <Portrait who={{ key: 'edit', level: d.level, gender: d.gender, age: Number(d.age) || 45, look: d.look }} mood={BASE_MOOD[d.level]} size={156} round={false} title="미리보기" />
            <span className="pfe-prev-n">{d.name.trim() || '이름'}<em className="num">{d.age}</em></span>
          </div>
          <div className="pfe-tw">
            <Swatches label="피부" items={SKINS} value={skinOf(d.look)} onPick={(v) => tw('skin', v)} />
            <Swatches label="머리 색" items={HAIRS} value={hairOf(d.look)} onPick={(v) => tw('hair', v)} />
            <Swatches label="옷" items={SUITS} value={suitOf(d.look)} onPick={(v) => tw('suit', v)} />
            <Swatches label="안경" items={GLASSES} value={d.look.glasses || ''} onPick={(v) => tw('glasses', v)} chip />
          </div>
        </div>
        <div className="pfe-body">
          <div className="pfe-sec">
            <div className="pfe-sh">
              <span>사진 <em className="num">{LOOKS.length}</em></span>
              <div className="seg seg-sm" role="group" aria-label="사진 성별">
                {[['all', '전체'], ['M', '남성'], ['F', '여성']].map(([k, l]) => <button key={k} aria-pressed={g === k} onClick={() => setG(k)}>{l}</button>)}
              </div>
            </div>
            <div className="pfe-faces" role="radiogroup" aria-label="프로필 사진">
              {faces.map((x) => (
                <button key={x.id} role="radio" aria-checked={d.face === x.id} aria-label={'사진 ' + x.id} className="pfe-face"
                  onClick={() => set({ face: x.id, gender: x.gender, look: structuredClone(x.look) })}>
                  <Portrait who={{ key: x.id, level: d.level, gender: x.gender, age: x.age, look: x.look }} mood="중립" size={52} />
                </button>
              ))}
            </div>
          </div>
          <div className="pfe-row r1">
            <label className="ss-f"><span>이름</span><input className="input" data-autofocus value={d.name} maxLength={20} placeholder="예) 최서윤" onChange={(e) => set({ name: e.target.value })} /></label>
            <label className="ss-f"><span>나이</span><input className="input num" type="number" min={25} max={75} value={d.age} onChange={(e) => set({ age: e.target.value })} /></label>
          </div>
          <div className="pfe-row r2">
            <label className="ss-f"><span>직책<em>선택</em></span><input className="input" value={d.role} maxLength={30} placeholder={role ? '비우면 요구사항의 ' + role : '예) 운영본부장'} onChange={(e) => set({ role: e.target.value })} /></label>
            <label className="ss-f"><span>경력</span><input className="input" value={d.career} maxLength={60} placeholder="예) 업계 15년 · 삼성 제품 첫 검토" onChange={(e) => set({ career: e.target.value })} /></label>
          </div>
          <div className="ss-f">
            <span>성향<em>최대 4개</em></span>
            <div className="ss-ints">
              {d.traits.map((x, i) => <span key={i} className="sp-int">{x}<button aria-label={x + ' 빼기'} onClick={() => set({ traits: d.traits.filter((_, j) => j !== i) })}><Icon name="x" size={11} stroke={2.6} /></button></span>)}
              {d.traits.length < 4 && <input className="ss-int-in" value={tIn} placeholder={d.traits.length ? '+ 추가' : '예) 근거 중시 · Enter'} aria-label="성향 추가"
                onChange={(e) => setTIn(e.target.value)} onBlur={addTrait} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addTrait(); } }} />}
            </div>
          </div>
          <label className="ss-f"><span>평소 한마디</span><input className="input" value={d.quote} maxLength={120} placeholder={base.quote} onChange={(e) => set({ quote: e.target.value })} /></label>
          <label className="ss-f"><span>의사결정 스타일</span><input className="input" value={d.style} maxLength={120} placeholder={base.style} onChange={(e) => set({ style: e.target.value })} /></label>
          <div className="ss-f">
            <span>난이도</span>
            <div className="pfe-lv" role="radiogroup" aria-label="난이도">
              {LEVELS.map((L) => <button key={L.id} role="radio" aria-checked={d.level === L.id} className={'pfe-lvb lv-' + L.id} onClick={() => set({ level: L.id })}><b className="num">{L.id}</b>{L.name}</button>)}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function LevelTip({ L }) {
  return (
    <div className="tp">
      <b className="tp-h"><span>{L.id}단계 · {L.name}</span></b>
      <div className="tp-stats">
        <span><em>시작 만족도</em><b className="num">{L.start}</b></span>
        <span><em>성공 기준</em><b className="num">{L.win}+</b></span>
        <span><em>숨은 우려</em><b className="num">{L.nConcern}개</b></span>
      </div>
      <div className={'tp-meters lv-' + L.id}>{METERS.map(([k, l]) => <span key={k}><em>{l}</em><Dots n={L.meters[k]} /></span>)}</div>
      <p className="tp-p">{L.relation}<br />{L.competition}</p>
    </div>
  );
}

/** 요구사항 고르기 · 고치기 팝업 */
function ReqModal({ st, onApply, onClose }) {
  const proposals = useStore((s) => s.proposals);
  const [d, setD] = useState(() => structuredClone(st));
  const [tab, setTab] = useState(st.source === 'proposal' ? 'proposal' : st.source === 'free' ? 'free' : 'scenario');
  const [intIn, setIntIn] = useState('');
  const peek = useDetailPeek(pseudoP(d));
  const set = (fn) => setD((s) => { const x = structuredClone(s); fn(x); return x; });
  const refs = setupRefs({ ...d, req: [] });
  const kindOf = (r) => r.split(':')[0] + 's';
  const ok = setupText(d).length >= 8;
  return (
    <Modal title="요구사항" size="sim-reqm" onClose={onClose}
      footer={<><span className="sp" /><button className="btn" onClick={onClose}>취소</button><button className="btn btn-primary" disabled={!ok} onClick={() => onApply(d)}><Icon name="check" size={15} stroke={2.4} />적용</button></>}>
      <div className="seg" role="group" aria-label="요구사항 가져오기">
        {[['scenario', '예시'], ['proposal', '내 제안서'], ['free', '직접 입력']].map(([k, l]) => (
          <button key={k} aria-pressed={tab === k} onClick={() => { setTab(k); if (k === 'free' && d.source !== 'free') setD(emptySetup()); }}>{l}</button>
        ))}
      </div>
      <div className={'srm' + (tab === 'free' ? ' free' : '')}>
        {tab !== 'free' && (
          <div className="ss-pick">
            {tab === 'scenario' && PRESETS.map((p) => (
              <button key={p.id} className="ss-opt" aria-pressed={d.sid === p.id} onClick={() => setD(setupFromScenario(p.id))}>
                <i className={'dot h-' + p.hue} /><span className="t">{p.title}</span><span className="s">{p.customer} · {p.role}</span>
              </button>
            ))}
            {tab === 'proposal' && (proposals.length ? proposals.slice(0, 40).map((p) => (
              <button key={p.id} className="ss-opt" aria-pressed={d.pid === p.id} onClick={() => setD(setupFromProposal(p))}>
                <Icon name="doc" size={13} /><span className="t">{p.title || '새 제안서'}</span><span className="s">{p.customer || '고객사 미정'}</span>
              </button>
            )) : <p className="faint" style={{ margin: "var(--space-0px)" }}>아직 제안서가 없어요.</p>)}
          </div>
        )}
        <div className="srm-form">
          <div className="ss-fields">
            <label className="ss-f"><span>고객사</span><input className="input" value={d.customer} placeholder="예) A 커피" onChange={(e) => set((x) => { x.customer = e.target.value; })} /></label>
            <label className="ss-f"><span>업종</span>
              <select className="select" value={d.ind || ''} onChange={(e) => set((x) => { x.ind = e.target.value; })}>
                <option value="">업종 미정</option>
                {INDUSTRIES.map((i) => <option key={i.code} value={i.code}>{i.name}</option>)}
              </select>
            </label>
            <label className="ss-f"><span>최종 제안 대상자</span><input className="input" value={d.role} placeholder="예) 운영본부장" onChange={(e) => set((x) => { x.role = e.target.value; })} /></label>
          </div>
          <div className="ss-f">
            <span>고객 요구사항</span>
            <div className="ss-ed"><MentionEditor id="ss-req-ed" label="고객 요구사항" value={d.req} placeholder="예) 전국 300개 매장 메뉴판을 디지털로 바꾸고 싶다 · @로 제품 연결" onChange={(segs) => set((x) => { x.req = segs; })} peek={peek} /></div>
          </div>
          <div className="ss-f">
            <span>고객이 중요하게 보는 것</span>
            <div className="ss-ints">
              {d.interests.map((x, i) => <span key={i} className="sp-int">{x}<button aria-label={x + ' 빼기'} onClick={() => set((y) => { y.interests.splice(i, 1); })}><Icon name="x" size={11} stroke={2.6} /></button></span>)}
              {d.interests.length < 5 && (
                <input className="ss-int-in" value={intIn} placeholder="+ 추가" aria-label="중요하게 보는 것 추가"
                  onChange={(e) => setIntIn(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && intIn.trim()) { e.preventDefault(); const v = intIn.trim(); set((y) => { y.interests.push(v.slice(0, 40)); }); setIntIn(''); } }} />
              )}
            </div>
          </div>
          <div className="ss-f">
            <span>연결된 제품 · 솔루션 · 유관사례</span>
            {refs.length > 0 && <div className="tagchips">{refs.map((r) => <TagChip key={r} r={r} peek={peek} onRemove={() => set((x) => { const k = kindOf(r); x.refs[k] = x.refs[k].filter((v) => v !== r.split(':')[1]); })} />)}</div>}
            <AddRefInput id="ss-addref" exclude={refs} onAdd={(r) => set((x) => { const k = kindOf(r); const v = r.split(':')[1]; if (!x.refs[k].includes(v)) x.refs[k].push(v); })} />
          </div>
        </div>
      </div>
      {peek.node}
    </Modal>
  );
}

/** 지난 시뮬레이션 목록 — 고객 얼굴(마지막 표정) · 다룬 제품 썸네일 · 만족도 흐름 */
function MiniSpark({ data, win }) {
  const W = 64, H = 22, n = data.length;
  if (n < 2) return null;
  const x = (i) => 1 + (i * (W - 2)) / (n - 1), y = (v) => H - 2 - (v / 100) * (H - 4);
  const d = data.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  return (
    <svg className="ss-hc-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line x1="0" x2={W} y1={y(win)} y2={y(win)} className="win" />
      <path d={d} className="ln" /><circle cx={x(n - 1)} cy={y(data[n - 1].v)} r="2.2" className="pt" />
    </svg>
  );
}
function HistRow({ s, go }) {
  const pf = s.profile; const per = personaOf(pf); const L = LV[s.level];
  const q = aggregate(s.cur.scores).total;
  const turns = s.msgs.filter((m) => m.who === 'me').length;
  const refs = [...new Set([...mentionedRefs(s), ...setupRefs(s.setup)])].filter((r) => tagMeta(r));
  const k = s.cur.satisfaction >= L.win ? 'ok' : s.cur.satisfaction >= 55 ? 'good' : s.cur.satisfaction >= 35 ? 'warn' : 'bad';
  const qk = q == null ? '' : 'b-' + band(q).k;
  return (
    <div className={'ss-hr lv-' + s.level} role="listitem">
      <button className="ss-hr-main" onClick={() => go({ name: 'sim', id: s.id })} aria-label={pf.name + ' · ' + pf.company + ' 시뮬레이션 열기'}>
        <span className="ss-hr-face"><Portrait who={per} mood={s.cur.mood} size={46} /></span>
        <span className="ss-hr-who">
          <b>{pf.name}<span>{pf.role}</span></b>
          <span className="co">{pf.company}{pf.ind && IND[pf.ind] ? ' · ' + IND[pf.ind].name.split(' · ')[0] : ''}</span>
        </span>
        <span className="ss-hr-req">
          <span className="t">{s.setup.title || setupText(s.setup).slice(0, 60)}</span>
          {refs.length > 0 && (
            <span className="ss-hr-refs" aria-label="다룬 제품 · 솔루션 · 사례">
              {refs.slice(0, 5).map((r) => <span key={r} className="ss-hr-th" title={tagMeta(r).name}><Thumb r={r} mini /></span>)}
              {refs.length > 5 && <span className="more num">+{refs.length - 5}</span>}
            </span>
          )}
        </span>
        <span className="ss-hr-lv"><LevelBadge level={s.level} small /></span>
        <span className="ss-hr-st"><span className={'ss-st st-' + s.status}>{STATUS[s.status]}</span></span>
        <span className={'ss-hr-n sat b-' + k}><em>만족도</em><span><b className="num">{s.cur.satisfaction}</b><MiniSpark data={s.trend} win={L.win} /></span></span>
        <span className={'ss-hr-n q ' + qk}><em>품질</em><span><b className="num">{q ?? '—'}</b></span></span>
        <span className="ss-hr-w">{turns}턴 · {fmtWhen(s.updatedAt)}{s.demo ? <i>예시</i> : null}</span>
      </button>
      <button className="ss-hr-x" aria-label="기록 지우기" title="기록 지우기" onClick={() => deleteSim(s.id)}><Icon name="trash" size={14} /></button>
    </div>
  );
}

/* =========================================================
   Session — chat + right panel
   ========================================================= */
function applyTurn(d, r) {
  const ev = r.ev;
  d.msgs.push({ id: uid('c'), who: 'cust', text: r.text, ts: Date.now(), ev: { satisfaction: ev.satisfaction, delta: ev.delta || 0, why: ev.why || '', mood: ev.mood, stage: ev.stage, revealed: ev.revealedNow || [], resolved: ev.resolvedNow || [], ai: !!r.ai } });
  if (ev.concerns) d.profile.concerns = ev.concerns.map((c) => ({ ...c }));
  d.cur = { ...d.cur, satisfaction: ev.satisfaction, trust: ev.trust, interest: ev.interest, mood: ev.mood, why: ev.why || '', stage: ev.stage, scores: ev.scores || d.cur.scores, notes: ev.scores ? ev.notes : d.cur.notes, suggest: ev.suggest || [], src: r.ai ? 'ai' : 'rule', evalAt: d.msgs.length };
  d.trend.push({ v: ev.satisfaction });
  if (ev.end === 'win') d.status = 'won';
  else if (ev.end === 'lose') d.status = 'lost';
  if (r.note === 'off') d.aiOff = true;
}

function SimSession({ id, go }) {
  const sim = useSims((s) => s.sims.find((x) => x.id === id));
  return sim ? <SimRoom sim={sim} id={id} go={go} /> : null;
}
const pseudoP = (st) => ({ id: '_sim', title: st.title || '', customer: st.customer || '', ind: st.ind || null, req: { free: st.req || [] }, ctx: st.refs });

function SimRoom({ sim, id, go }) {
  const [stream, setStream] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState([]);
  const [drawer, setDrawer] = useState(false);
  const [detail, setDetail] = useState(null);
  const ctl = useRef(null);
  const listRef = useRef(null);
  const draftRef = useRef([]); draftRef.current = draft;
  const peek = useDetailPeek(useMemo(() => pseudoP(sim.setup), [sim.setup]));
  const L = LV[sim.level];
  const active = sim.status === 'active';

  const runTurn = async () => {
    const s0 = getSim(id); if (!s0) return;
    setBusy(true); setStream({ text: '' });
    const c = new AbortController(); ctl.current = c;
    try {
      const r = await customerTurn(s0, { signal: c.signal, onText: (text) => setStream({ text }) });
      const d = patchSim(id, (x) => applyTurn(x, r));
      if (r.note && r.note !== 'off') toast(r.note);
      if (d && d.status !== 'active' && !d.debrief) finish(d);
    } catch (e) {
      if (e && e.code === 'cancelled' && e.text && e.text.trim()) patchSim(id, (x) => { x.msgs.push({ id: uid('c'), who: 'cust', text: e.text.trim(), ts: Date.now(), stopped: true }); });
      else if (!(e && e.code === 'cancelled')) { console.error(e); toast('고객 답을 만들지 못했어요', 'warn'); }
    } finally {
      if (ctl.current === c) ctl.current = null;
      setBusy(false); setStream(null);
    }
  };
  const finish = async (d) => {
    const r = await debrief(d);
    patchSim(id, (x) => { x.debrief = r; });
  };
  useEffect(() => {
    if (sim && !sim.msgs.length && active) runTurn();
    return () => { if (ctl.current) ctl.current.abort(); };
  }, []);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [sim.msgs.length, stream && stream.text, sim.debrief]);

  const send = (segs) => {
    segs = segs || draftRef.current;
    if (busy || !active || plainLen(segs) < 2) return;
    patchSim(id, (x) => { x.msgs.push({ id: uid('m'), who: 'me', segs: structuredClone(segs), ts: Date.now() }); });
    setDraft([]);
    runTurn();
  };
  const pickSuggestion = (sg) => {
    setDraft(structuredClone(sg.segs));
    setTimeout(() => { const el = document.getElementById('sim-ed'); if (!el) return; el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }, 30);
  };
  const endMeeting = () => {
    if (ctl.current) ctl.current.abort();
    const d = patchSim(id, (x) => { if (x.status === 'active') x.status = 'ended'; });
    if (d) finish(d);
  };
  const again = (lv) => { const s = putSim(newSim(sim.setup, lv || sim.level, personaOf(sim.profile))); go({ name: 'sim', id: s.id }); };
  const toProposal = () => {
    const pid = createProposal();
    const mine = sim.msgs.filter((m) => m.who === 'me');
    const all = [...new Set([...setupRefs(sim.setup), ...mentionedRefs(sim)])];
    const memo = `\n\n[전략 시뮬레이션 · ${L.name} · ${{ won: '설득 성공', lost: '미팅 종료', ended: '마무리', active: '진행 중' }[sim.status]} · 만족도 ${sim.cur.satisfaction}]\n` + mine.slice(-4).map((m) => '- ' + m.segs.map((x) => (x.t != null ? x.t : '')).join('').replace(/\s+/g, ' ').trim().slice(0, 120)).join('\n');
    update(pid, (d) => {
      d.title = sim.setup.title || (sim.profile.company + ' · ' + (sim.profile.interests[0] || '제안'));
      d.customer = sim.profile.company; d.ind = sim.profile.ind || null; d.reqTab = 'free';
      d.req.free = [...structuredClone(sim.setup.req), ...seg(memo)];
      d.ctx = { products: all.filter((r) => r.startsWith('product:')).map((r) => r.split(':')[1]), solutions: all.filter((r) => r.startsWith('solution:')).map((r) => r.split(':')[1]), cases: all.filter((r) => r.startsWith('case:')).map((r) => r.split(':')[1]) };
    });
    toast('시뮬레이션 내용으로 새 제안서를 만들었어요');
    go({ name: 'proposal', id: pid });
  };

  const agg = aggregate(sim.cur.scores);
  const sugs = active && !busy && sim.cur.suggest && sim.cur.suggest.length ? sim.cur.suggest : active && busy ? sim.cur.suggest || [] : [];

  return (
    <div className={'sim lv-' + sim.level + (drawer ? ' drawer-open' : '')}>
      <div className="sim-chat">
        <div className="sim-head">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => go({ name: 'sim' })} aria-label="시뮬레이션 설정으로" title="새 시뮬레이션 · 기록"><Icon name="chevL" size={16} /></button>
          <button className="sim-who" onClick={() => setDrawer(true)} aria-label={sim.profile.name + ' 프로필 · 실시간 평가 보기'}>
            <Avatar pf={sim.profile} size={38} mood={sim.cur.mood} />
            <span className="sim-who-t"><b>{sim.profile.name} <span>{sim.profile.role}</span></b><span className="faint">{sim.profile.company}</span></span>
          </button>
          <span className="sp" />
          {active ? <button className="btn btn-sm sim-end" onClick={endMeeting}><SimIcon name="flag" size={14} /><span>미팅 마무리</span></button>
            : <button className="btn btn-sm sim-end" onClick={() => again()}><Icon name="refresh" size={14} /><span>다시 하기</span></button>}
        </div>

        <div className="sim-list" ref={listRef} aria-live="polite">
          {sim.aiOff && <div className="sim-note"><Icon name="info" size={13} />AI를 쓸 수 없어 규칙 기반 고객과 자동 점검으로 진행해요. 실제 AI 고객은 claude.ai에서 열면 대화해요.</div>}
          {sim.msgs.map((m, i) => <Msg key={m.id} m={m} sim={sim} first={i === 0} peek={peek} />)}
          {stream && (
            <div className="sim-msg cust">
              <Avatar pf={sim.profile} size={36} mood={sim.cur.mood} />
              <div className="sim-b-w">
                <span className="sim-b-n">{sim.profile.name} {sim.profile.role}</span>
                <div className="sim-b">{stream.text ? <>{stream.text}<i className="sim-caret" /></> : <span className="sim-typing" aria-label="입력 중"><i /><i /><i /></span>}</div>
              </div>
            </div>
          )}
          {!active && <Result sim={sim} onAgain={again} onProposal={toProposal} />}
        </div>

        {active && (
          <div className="sim-foot">
            {sugs.length > 0 && (
              <div className={'sim-sugs' + (busy ? ' wait' : '')} aria-label="추천 답변">
                <div className="sim-sugs-h"><Icon name="sparkle" size={13} /><b>추천 답변</b></div>
                <div className="sim-sugs-l">
                  {sugs.slice(0, 3).map((sg, i) => <Suggestion key={i} sg={sg} sim={sim} busy={busy} onPick={() => pickSuggestion(sg)} onSend={() => send(sg.segs)} />)}
                </div>
              </div>
            )}
            <div className="sim-comp">
              <MentionEditor id="sim-ed" label="고객에게 보낼 말" value={draft} onChange={setDraft} onEnter={() => send()} peek={peek}
                placeholder={busy ? '고객이 답하는 중이에요…' : `${sim.profile.name} ${sim.profile.role}에게 답하기`} />
              {busy ? <button className="sim-send stop" onClick={() => ctl.current && ctl.current.abort()} aria-label="멈추기" title="멈추기"><SimIcon name="stop" size={12} /></button>
                : <button className="sim-send" disabled={plainLen(draft) < 2} onClick={() => send()} aria-label="보내기" title="보내기"><SimIcon name="send" size={16} /></button>}
            </div>
          </div>
        )}
      </div>

      <aside className="sim-panel" aria-label="고객 만족도 · 제안 품질 · 참고할 제안서">
        <div className="sim-panel-h"><b>실시간 평가</b><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDrawer(false)} aria-label="닫기"><Icon name="x" /></button></div>
        <PersonCard sim={sim} busy={busy} />
        <SatCard sim={sim} busy={busy} />
        <QualityCard sim={sim} agg={agg} busy={busy} />
        <SimilarCard sim={sim} onOpen={setDetail} />
      </aside>
      {drawer && <div className="sim-scrim" onClick={() => setDrawer(false)} />}
      {detail && <ScenarioDetail s={detail} go={go} onClose={() => setDetail(null)} onSwitch={() => {}} />}
      {peek.node}
    </div>
  );
}

const sugTitle = (sg) => String(sg.title || sg.why || '추천').replace(/^\+\s*/, '');
function Suggestion({ sg, sim, busy, onPick, onSend }) {
  const segs = sg.segs || [];
  const concern = sg.kind === 'concern' && sg.about ? sim.profile.concerns.find((c) => c.id === sg.about) : null;
  return (
    <Tip as="div" place="top" wide className={'sim-sug k-' + (sg.kind || 'ai')} label={sugTitle(sg) + ' 추천 답변'} content={() => (
      <div className="tp">
        <b className="tp-h"><span>{sugTitle(sg)}</span></b>
        <p className="tp-full">{segs.map((x, j) => (x.t != null ? <React.Fragment key={j}>{x.t}</React.Fragment> : <MentionInline key={j} r={x.ref} />))}</p>
        {concern && <p className="tp-p"><span className="k">고객 우려</span>{concern.text}</p>}
        {(sg.crit || []).length > 0 && <p className="tp-p"><span className="k">채우는 기준</span>{sg.crit.map(critName).join(' · ')}</p>}
        <p className="tp-hint">누르면 입력창에 넣어 고쳐 쓸 수 있어요</p>
      </div>
    )}>
      <button className="sim-sug-b" disabled={busy} onClick={onPick}>
        <span className="sim-sug-why">{sugTitle(sg)}</span>
        <span className="sim-sug-t">{segs.map((x, j) => (x.t != null ? <React.Fragment key={j}>{x.t}</React.Fragment> : <MentionInline key={j} r={x.ref} />))}</span>
      </button>
      <button className="sim-sug-go" disabled={busy} onClick={onSend} aria-label="이 답변 바로 보내기"><SimIcon name="send" size={14} /></button>
    </Tip>
  );
}

function PersonCard({ sim, busy }) {
  const pf = sim.profile; const per = personaOf(pf);
  return (
    <Tip className="sim-card sim-person" label={pf.name + ' 프로필 상세'} wide content={() => <ProfileCard pf={pf} level={sim.level} mood={sim.cur.mood} compact />}>
      <div className="spc">
        <span className="spc-photo"><Portrait who={per} mood={sim.cur.mood} size={84} round={false} title={pf.name + ' · 지금 표정 ' + sim.cur.mood} /></span>
        <span className="spc-t">
          <span className="spc-co">{pf.company}{pf.ind ? ' · ' + indName(pf.ind).split(' · ')[0] : ''}</span>
          <b>{pf.name}<span className="num">{pf.age || per.age}</span></b>
          <span className="spc-role">{pf.role}</span>
          <LevelBadge level={sim.level} small />
        </span>
      </div>
      <p className="spc-q">{busy ? '듣고 있어요…' : '“' + (pf.quote || per.quote) + '”'}</p>
      <span className="sc-hint">마우스를 올리면 프로필 전체</span>
    </Tip>
  );
}

function Msg({ m, sim, first, peek }) {
  if (m.who === 'me') {
    return (
      <div className="sim-msg me">
        <div className="sim-b">{m.segs.map((x, j) => (x.t != null ? <React.Fragment key={j}>{x.t}</React.Fragment> : <MentionInline key={j} r={x.ref} peek={peek} />))}</div>
      </div>
    );
  }
  const ev = m.ev;
  const cn = (ids) => (ids || []).map((id) => sim.profile.concerns.find((c) => c.id === id)).filter(Boolean);
  return (
    <div className="sim-msg cust">
      <Avatar pf={sim.profile} size={36} mood={ev && ev.mood} />
      <div className="sim-b-w">
        <span className="sim-b-n">{sim.profile.name} {sim.profile.role}</span>
        <div className="sim-b">{m.text}{m.stopped && <em className="sim-stopped"> · 중단됨</em>}</div>
        {ev && !first && (
          <div className="sim-fb">
            <span className={'sim-delta ' + (ev.delta > 0 ? 'up' : ev.delta < 0 ? 'down' : 'flat')}>
              {ev.delta > 0 ? <SimIcon name="up" size={11} stroke={2.6} /> : ev.delta < 0 ? <SimIcon name="down" size={11} stroke={2.6} /> : null}
              만족도 <b className="num">{ev.satisfaction}</b><span className="num">{ev.delta > 0 ? '+' + ev.delta : ev.delta < 0 ? ev.delta : '±0'}</span>
            </span>
            {ev.why && <span className="sim-why">{ev.why}</span>}
            {cn(ev.revealed).map((c) => <span key={'r' + c.id} className="sim-ce open"><Icon name="alert" size={11} stroke={2.4} />새 우려 · {c.short}</span>)}
            {cn(ev.resolved).map((c) => <span key={'s' + c.id} className="sim-ce ok"><Icon name="check" size={11} stroke={3} />우려 해소 · {c.short}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function Result({ sim, onAgain, onProposal }) {
  const L = LV[sim.level]; const d = sim.debrief;
  const agg = aggregate(sim.cur.scores);
  const title = { won: '설득 성공', lost: '고객이 미팅을 끝냈어요', ended: '미팅 마무리' }[sim.status];
  return (
    <div className={'sim-result st-' + sim.status}>
      <div className="sr-h">
        <span className="sr-ic">{sim.status === 'won' ? <Icon name="check" size={18} stroke={3} /> : sim.status === 'lost' ? <Icon name="x" size={18} stroke={3} /> : <SimIcon name="flag" size={17} />}</span>
        <div><b>{title}</b><span>{sim.status === 'won' ? sim.profile.ask : `${L.name} · 성공 기준 만족도 ${L.win}`}</span></div>
        <span className="sr-n"><em>만족도</em><b className="num">{sim.cur.satisfaction}</b></span>
        <span className="sr-n"><em>제안 품질</em><b className="num">{agg.total ?? '—'}</b></span>
      </div>
      {!d ? <div className="sr-load"><span className="spin" />전략 Agent가 총평을 정리하는 중…</div> : (
        <div className="sr-b">
          <p className="sr-v"><span className="sr-agent"><Icon name="sparkle" size={12} />전략 Agent 총평</span>{d.verdict}{d.ai ? '' : <span className="faint"> · 자동 총평</span>}</p>
          <div className="sr-cols">
            <div><span className="k ok">잘한 점</span><ul>{d.good.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            <div><span className="k warn">고칠 점</span><ul>{d.improve.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          </div>
          <p className="sr-next"><Icon name="arrowR" size={13} />{d.next}</p>
        </div>
      )}
      <div className="sr-acts">
        <button className="btn btn-primary btn-sm" onClick={onProposal}><Icon name="plus" size={14} stroke={2.4} />이 흐름으로 제안서 시작</button>
        <button className="btn btn-sm" onClick={() => onAgain()}><Icon name="refresh" size={14} />같은 고객과 다시</button>
        {sim.level < 3 && <button className="btn btn-sm" onClick={() => onAgain(sim.level + 1)}>{LV[sim.level + 1].name}으로 다시</button>}
      </div>
    </div>
  );
}

// ---------- right panel ----------
function Spark({ data, win, lose }) {
  const W = 300, H = 54, pad = 4;
  const n = data.length;
  if (n < 2) return <svg className="sim-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2={W} y1={H - (win / 100) * H} y2={H - (win / 100) * H} className="win" /></svg>;
  const x = (i) => pad + (i * (W - pad * 2)) / (n - 1);
  const y = (v) => H - pad - (v / 100) * (H - pad * 2);
  const d = data.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  return (
    <svg className="sim-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={W} y1={y(win)} y2={y(win)} className="win" />
      <line x1="0" x2={W} y1={y(lose)} y2={y(lose)} className="lose" />
      <path d={d + ` L${x(n - 1)} ${H} L${x(0)} ${H}z`} className="area" />
      <path d={d} className="ln" />
      <circle cx={x(n - 1)} cy={y(data[n - 1].v)} r="3.2" className="pt" />
    </svg>
  );
}
function SatCard({ sim, busy }) {
  const L = LV[sim.level]; const c = sim.cur;
  const lastEv = [...sim.msgs].reverse().find((m) => m.ev && m.who === 'cust');
  const delta = lastEv && sim.msgs.indexOf(lastEv) > 0 ? lastEv.ev.delta : 0;
  const k = c.satisfaction >= L.win ? 'ok' : c.satisfaction >= 55 ? 'good' : c.satisfaction >= 35 ? 'warn' : 'bad';
  const nRes = sim.profile.concerns.filter((x) => x.resolved).length;
  return (
    <Tip className={'sim-card sim-sat b-' + k} label="고객 만족도 상세" content={() => (
      <div className="tp">
        <b className="tp-h">고객 만족도 <span className="num">{c.satisfaction}</span></b>
        <div className="tp-rows">
          <span>신뢰</span><Bar v={c.trust} /><b className="num">{c.trust}</b>
          <span>관심</span><Bar v={c.interest} /><b className="num">{c.interest}</b>
          <span>우려 해소</span><Bar v={sim.profile.concerns.length ? (nRes / sim.profile.concerns.length) * 100 : 100} /><b className="num">{nRes}/{sim.profile.concerns.length}</b>
        </div>
        {c.why && <p className="tp-p"><span className="k">최근 변화</span>{c.why}</p>}
        <ul className="tp-cc">{sim.profile.concerns.map((x) => <li key={x.id} className={x.resolved ? 'ok' : x.revealed ? 'open' : 'hidden'}>{x.resolved ? '해소 · ' : x.revealed ? '미해소 · ' : '숨음 · '}{x.revealed ? x.text : '아직 드러나지 않은 우려'}</li>)}</ul>
        <p className="tp-p"><span className="k">성공 조건</span>만족도 {L.win} 이상 + 우려 해소 + 결정 요청 → {sim.profile.ask}</p>
      </div>
    )}>
      <div className="sc-h"><span>고객 만족도</span><span className={'sc-mood m-' + k}>{c.mood}</span></div>
      <div className="sc-v">
        <b className="num">{c.satisfaction}</b>
        {delta !== 0 && <span className={'sc-d ' + (delta > 0 ? 'up' : 'down')}>{delta > 0 ? '+' + delta : delta}</span>}
        {busy && <span className="spin" title="고객이 답하는 중" />}
      </div>
      <div className="sc-meter" aria-hidden="true">
        <i style={{ width: c.satisfaction + '%' }} />
        <b className="lose" style={{ left: L.lose + '%' }} /><b className="win" style={{ left: L.win + '%' }}><span>성공 {L.win}</span></b>
      </div>
      <Spark data={sim.trend} win={L.win} lose={L.lose} />
      <div className="sc-cc">
        {sim.profile.concerns.map((x) => <span key={x.id} className={'sc-c ' + (x.resolved ? 'ok' : x.revealed ? 'open' : 'hidden')} title={x.revealed ? x.text : '아직 드러나지 않은 우려'}>{x.resolved ? <Icon name="check" size={10} stroke={3} /> : x.revealed ? <Icon name="alert" size={10} stroke={2.4} /> : <b>?</b>}{x.revealed ? x.short : '숨은 우려'}</span>)}
      </div>
      <span className="sc-hint">마우스를 올리면 상세</span>
    </Tip>
  );
}
function QualityCard({ sim, agg, busy }) {
  const b = agg.total == null ? null : band(agg.total);
  return (
    <section className="sim-card sim-q" aria-label="제안 품질">
      <div className="sc-h"><span>제안 품질</span><span className="sc-src">{sim.cur.src === 'ai' ? 'AI 평가' : '자동 점검'} · 제안서 검토 기준</span></div>
      <div className="sc-v">
        <b className="num">{agg.total ?? '—'}</b>{agg.total != null && <span className="sc-of num">/ 100</span>}
        {b && <span className={'sc-band b-' + b.k}>{b.label}</span>}
        {busy && <span className="sc-eval"><span className="spin" />평가 중</span>}
      </div>
      {agg.total == null && <p className="sc-empty">첫 답변을 보내면 제안서 검토 기준으로 점수를 매겨요.</p>}
      <div className={'sq-cats' + (busy ? ' pending' : '')}>
        {agg.cats.map((c) => (
          <Tip key={c.id} className={'sq-cat ' + (c.v == null ? '' : bandCls(c.v))} label={c.name + ' 상세'} content={() => <CatTip c={c} sim={sim} />}>
            <span className="sq-n"><Icon name={c.icon} size={14} />{c.name}</span>
            <Bar v={c.v} />
            <b className="num">{c.v ?? '—'}</b>
          </Tip>
        ))}
      </div>
      <span className="sc-hint">기준마다 마우스를 올리면 세부 점수 · 근거</span>
    </section>
  );
}
function CatTip({ c, sim }) {
  const sc = sim.cur.scores || {}; const notes = sim.cur.notes || {};
  return (
    <div className="tp">
      <b className="tp-h"><span>{c.name}</span><span className="num">{c.v ?? '—'}</span></b>
      <p className="tp-sub">제안서 검토 ‘{c.desc}’ 중 대화로 확인할 수 있는 기준</p>
      <div className="tp-crit">
        {c.crit.map((id) => (
          <div key={id} className={'tc ' + (sc[id] == null ? '' : bandCls(sc[id]))}>
            <div className="tc-h"><b>{critName(id)}</b><span className="num">{sc[id] ?? '—'}</span></div>
            <Bar v={sc[id]} />
            <p>{notes[id] || CHAT_DESC[id]}</p>
            <p className="tc-d">{CR[id] ? CR[id].desc : ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
function SimilarCard({ sim, onOpen }) {
  const list = useMemo(() => similarScenarios(sim, 3), [sim.msgs.length, sim.cur.stage, sim.profile.concerns.map((c) => c.revealed + '' + c.resolved).join()]);
  const stage = SIM_STAGES[STAGE_IX[sim.cur.stage] ?? 0];
  return (
    <section className="sim-card sim-sim" aria-label="참고할 기존 제안서">
      <div className="sc-h"><span>참고할 기존 제안서</span><span className="sc-src">Best Scenario · 지금 단계 “{stage.label}”</span></div>
      <div className="ss-list">
        {list.map(({ s, why, tip, strat }) => {
          const all = s.flow.flatMap((g) => g.slides.map((x) => ({ ...x, key: g.key })));
          const keys = stage.keys;
          let k = all.findIndex((x) => keys.includes(x.key)); if (k < 0) k = 0;
          const x = all[k];
          return (
            <button key={s.id} className="ssc" onClick={() => onOpen(s)}>
              <div className="ssc-top">
                <span className="ssc-th">{x && LAYOUT[x.f] ? <FitSlide f={x.f} ov={fillOf(s.id, k, x.f)} lazy /> : null}</span>
                <span className="ssc-t">
                  <b>{s.title}</b>
                  <span className="ssc-m">{strat ? strat.label : ''} · {REQ_TYPES[s.req] ? REQ_TYPES[s.req].label.split(' · ')[0] : ''}</span>
                  <span className="ssc-why">{why.map((w) => <i key={w}>{w}</i>)}</span>
                </span>
              </div>
              <div className={'ssc-tip k-' + tip.kind}>
                <span className="k">{tip.kind === 'objection' ? '고객 우려 대응' : tip.kind === 'ask' ? '결정 요청' : '이 단계에서 · ' + tip.label}</span>
                <p className="q">{tip.q}</p>
                {tip.a && <p className="a">{tip.a}</p>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
