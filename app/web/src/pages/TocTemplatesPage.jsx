import React, { useEffect, useMemo, useState } from 'react';
import { Icon, Modal, toast } from '../components/common.jsx';
import { FitSlide } from '../domain/slides/Slide.jsx';
import { exportPptx } from '../domain/slides/export-pptx.js';
import { TemplateDetail, saveBlob, safeName } from '../components/tplkit.jsx';
import { PARTS } from '../domain/proposals/parts.js';
import { L } from '../services/catalog.js';
import { SC, slidesOfScenario, previewOf } from '../domain/templates/scenarios.js';
import { ovOf } from '../domain/templates/scenario_storyboard.js';
import { TOC_TEMPLATES, TOCS, tocName, loadTocContent, ensureTocScenario, tocVerticals, tocUaSheets, UA_KINDS } from '../domain/templates/toc_templates.js';
import { ScenarioStoryboard, activateScenario } from './ScenariosPage.jsx';
import '../styles/toc.css';

/* =========================================================
   목차 템플릿 — 목차(= Storyboard 버블) 흐름이 정해진 제안서 양식.
   목록: 템플릿 카드가 세로로 · 카드마다 목차 버블 흐름 + 대표 장 4장.
   카드를 누르면 상세 팝업 — 업종(44)을 고르면 그 업종의 시나리오(표준 제안서는 업종 표준 제안서 그대로, 나머지는 같은 이름의 목차를
   표준 제안서 장으로 채워 조립)의 목차별 장 · Storyboard · PPTX · 활용하기, ‘기존 샘플’ 탭은 이 양식이 다루는 기존 샘플 버티컬 시나리오.
   ========================================================= */
const DEMO_V = 'fb_qsr';
const hueOf = (key) => (PARTS[TOCS[key].type] || PARTS.free).hue;
const isDeck = (g) => !!g.deck || g.key === 'open'; // 표지(+ 목차) — 버블 없는 앞장
const isDiv = (f) => /^L_VS_DIV_R\d$/.test(f);
const stageLabel = (name) => name.replace(/^(목차 · )?\d{2}\s+/, '');

function Flow({ t, short, counts, compact }) {
  return (
    <ol className={'tocf' + (compact ? ' compact' : '')} aria-label={t.name + ' 목차 흐름'}>
      {t.tocs.map((k, i) => (
        <li key={k} className={'tocf-b h-' + hueOf(k)}>
          <span className="n">{String(i + 1).padStart(2, '0')}</span>
          <span className="nm">{tocName(k, short)}</span>
          {counts && counts[i] != null && <span className="c">{counts[i]}장</span>}
          {i < t.tocs.length - 1 && <Icon name="chev" size={14} stroke={2.4} className="arr" />}
        </li>
      ))}
    </ol>
  );
}

async function downloadDeck(s) {
  const slides = slidesOfScenario(s);
  const blob = await exportPptx(slides.map((x, k) => ({ f: x.f, ov: ovOf(s.id, k, x.f), part: x.stage.name })), { title: s.title });
  const r = await saveBlob(blob, safeName('Winmate ' + s.title) + '.pptx');
  if (r.ok) toast(s.title + ' PPTX를 저장했어요'); else toast(r.err, 'warn');
}

/** 카드 미리보기 — 대표 업종 시나리오의 목차마다 간지 다음 첫 장 (최대 4장) */
function CardSheets({ t, ready }) {
  const s = ready ? ensureTocScenario(t.id, DEMO_V) : null;
  if (!s) return <div className="tocc-sheets is-wait">{[0, 1, 2, 3].map((i) => <div key={i} className="tocc-sheet sk" />)}</div>;
  const slides = slidesOfScenario(s);
  const picks = []; const seen = new Set();
  slides.forEach((x, k) => { if (isDeck(x.stage) || isDiv(x.f) || x.f === 'L_VS_TOC' || seen.has(x.stage.name) || picks.length >= 4) return; seen.add(x.stage.name); picks.push({ ...x, k }); });
  return <div className="tocc-sheets">{picks.map((x) => <div key={x.k} className="tocc-sheet"><FitSlide f={x.f} ov={ovOf(s.id, x.k, x.f)} lazy /></div>)}</div>;
}

function TocCard({ t, i, ready, onOpen }) {
  const nRel = (t.related || []).filter((id) => SC[id]).length;
  return (
    <article className={'tocc h-' + t.hue}>
      <button type="button" className="tocc-hit" onClick={() => onOpen(t.id)} aria-label={t.name + ' 상세 보기'} />
      <div className="tocc-top">
        <span className="tocc-no num">{String(i + 1).padStart(2, '0')}</span>
        <div className="tocc-h">
          <h3>{t.name}</h3>
          <span className="tocc-badge">{t.badge}</span>
        </div>
        <span className="tocc-more">업종별 시나리오 보기<Icon name="chev" size={16} stroke={2.4} /></span>
      </div>
      <p className="tocc-d">{t.desc}</p>
      <Flow t={t} />
      <div className="tocc-meta">
        <span><b className="num">44</b> {t.id === 'std' ? '업종 표준 제안서' : '업종 시나리오'}</span>
        <span><b className="num">{t.tocs.length}</b> 목차</span>
        {nRel > 0 && <span>기존 샘플 <b className="num">{nRel}</b></span>}
      </div>
      <CardSheets t={t} ready={ready} />
    </article>
  );
}

export function TocTemplatesPage({ go }) {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(null);
  useEffect(() => { let on = true; loadTocContent().then(() => on && setReady(true)).catch((e) => { console.error(e); toast('목차 템플릿 콘텐츠를 불러오지 못했어요', 'warn'); }); return () => { on = false; }; }, []);
  const t = open ? TOC_TEMPLATES.find((x) => x.id === open) : null;
  return (
    <div className="tl tocp">
      <div className="tl-in">
        <header className="tl-head">
          <div className="tl-title">
            <span className="eyebrow">WINMATE · 목차 템플릿</span>
            <h1>목차 템플릿 <span className="num">{TOC_TEMPLATES.length}</span></h1>
            <p>목차 흐름이 정해진 제안서 양식이에요. 같은 양식이면 장은 같고 업종마다 내용과 장 수만 달라요. 이름이 같은 목차는 표준 제안서의 장을 그대로 써요.</p>
          </div>
        </header>
        <div className="tocp-list">
          {TOC_TEMPLATES.map((x, i) => <TocCard key={x.id} t={x} i={i} ready={ready} onOpen={setOpen} />)}
        </div>
      </div>
      {t && <TocDetail key={t.id} t={t} ready={ready} go={go} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ---------- 상세 팝업: 업종별 시나리오 · 기존 샘플 ---------- */
function TocDetail({ t, ready, go, onClose }) {
  const [tab, setTab] = useState('ind');
  const [vid, setVid] = useState(DEMO_V);
  const [sb, setSb] = useState(null); // scenario id for the Storyboard view
  const [big, setBig] = useState(null); // { list, ovs, notes, index }
  const [busy, setBusy] = useState(false);
  const verts = ready ? tocVerticals() : [];
  const groups = useMemo(() => { const g = []; for (const v of verts) { const last = g[g.length - 1]; if (last && last.g === v.g) last.items.push(v); else g.push({ g: v.g, gn: v.gn, items: [v] }); } return g; }, [verts.length]);
  const s = ready ? ensureTocScenario(t.id, vid) : null;
  const slides = useMemo(() => (s ? slidesOfScenario(s) : []), [s && s.id]);
  const byToc = useMemo(() => { const m = []; slides.forEach((x, k) => { const last = m[m.length - 1]; if (last && last.name === x.stage.name) last.items.push({ ...x, k }); else m.push({ name: x.stage.name, deck: isDeck(x.stage), items: [{ ...x, k }] }); }); return m; }, [slides]);
  const body = byToc.filter((g) => !g.deck);
  const counts = body.map((g) => g.items.length);
  const ua = useMemo(() => (ready && t.tocs.includes('ua') ? tocUaSheets(vid) : []), [ready, vid, t.id]);
  const rel = (t.related || []).map((id) => SC[id]).filter(Boolean);
  const v = verts.find((x) => x.id === vid);
  const openBig = (k) => setBig({ list: slides.map((x) => L[x.f]), ovs: slides.map((x, j) => ovOf(s.id, j, x.f)), notes: slides.map((x) => x.stage.name + ' · ' + x.role), index: k });
  const run = async () => { if (!s) return; setBusy(true); try { await downloadDeck(s); } catch (e) { console.error(e); toast('PPTX를 만들지 못했어요: ' + (e && e.message ? e.message : e), 'warn'); } setBusy(false); };
  return (
    <Modal size="tocd" bodyClass="mbody tocd-body" onClose={() => { if (big) setBig(null); else onClose(); }}
      title={<span className="tocd-t">{t.name}<span className={'tocd-badge h-' + t.hue}>{t.badge}</span></span>} sub={t.desc}
      footer={<>
        <span className="note">{s ? `${s.title} · 목차 ${counts.length}개 · 장 ${slides.length}장` : '불러오는 중…'}</span>
        <span className="sp" />
        <button className="btn" onClick={onClose}>닫기</button>
        <button className="btn" disabled={!s} onClick={() => setSb(s.id)}><Icon name="route" size={15} />Storyboard 보기</button>
        <button className="btn" disabled={!s || busy} onClick={run}>{busy ? <span className="spin" /> : <Icon name="download" size={15} />}{busy ? '만드는 중…' : 'PPTX로 받기'}</button>
        <button className="btn btn-primary" disabled={!s} onClick={() => { onClose(); activateScenario(s, go); }} data-login-required><Icon name="plus" size={15} stroke={2.4} />활용하기</button>
      </>}>
      <div className="tocd-flow"><Flow t={t} short={v ? v.short : null} counts={counts} /></div>
      <div className="tocd-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'ind'} className={tab === 'ind' ? 'on' : ''} onClick={() => setTab('ind')}>{t.id === 'std' ? '업종별 표준 제안서' : '업종별 시나리오'} <b className="num">{verts.length || 44}</b></button>
        {rel.length > 0 && <button role="tab" aria-selected={tab === 'rel'} className={tab === 'rel' ? 'on' : ''} onClick={() => setTab('rel')}>기존 샘플 <b className="num">{rel.length}</b></button>}
      </div>
      {tab === 'ind' && (
        <div className="tocd-main">
          <nav className="tocd-inds" aria-label="업종">
            {!ready && <p className="faint">업종을 불러오는 중…</p>}
            {groups.map((g) => (
              <div key={g.g} className="tocd-ig">
                <span className="tocd-ign">{g.gn}</span>
                {g.items.map((x) => (
                  <button key={x.id} type="button" className={'tocd-iv' + (x.id === vid ? ' on' : '')} aria-pressed={x.id === vid} onClick={() => setVid(x.id)}>
                    <span className="nm">{x.nm}</span><span className="cu">{x.ai} · 공간 {x.nSp}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="tocd-deck" key={vid}>
            {s && <div className="tocd-dh"><h3>{s.title}</h3><p>{s.thesis}</p></div>}
            {byToc.map((g, gi) => (
              <section key={g.name + gi} className={'tocd-sec' + (g.deck ? ' deck' : '')}>
                <div className="tocd-sh">
                  {g.deck ? <span className="tocd-sn deck">{g.items.length > 1 ? '표지 · 목차' : '표지'}</span> : <span className={'tocd-sn h-' + hueOf(t.tocs[body.indexOf(g)] || 'overview')}><b className="num">{String(body.indexOf(g) + 1).padStart(2, '0')}</b>{stageLabel(g.name)}</span>}
                  <span className="faint">{g.items.length}장</span>
                </div>
                <div className="tocd-grid">
                  {g.items.map((x) => (
                    <button key={x.k} type="button" className="tocd-sheet" onClick={() => openBig(x.k)} aria-label={(x.k + 1) + '번째 장 ' + x.role + ' 크게 보기'}>
                      <span className="pg num">{x.k + 1}</span>
                      <FitSlide f={x.f} ov={ovOf(s.id, x.k, x.f)} lazy />
                      <span className="rl">{x.role}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {ua.length > 0 && (
              <section className="tocd-sec ua">
                <div className="tocd-sh"><span className="tocd-sn h-blue">당사의 이해 · 업종별 시트</span><span className="faint">데이터 타입마다 미리 만든 {ua.length}종 · 숫자는 제안 때 채워요</span></div>
                <div className="tocd-grid">
                  {ua.map((x, i) => (
                    <button key={x.kind} type="button" className="tocd-sheet" onClick={() => setBig({ list: ua.map((y) => L[y.f]), ovs: ua.map((y) => y.ov), notes: ua.map((y) => '당사의 이해 · ' + y.label), index: i })} aria-label={x.label + ' 크게 보기'}>
                      <FitSlide f={x.f} ov={x.ov} lazy />
                      <span className="rl">{UA_KINDS[x.kind]}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
      {tab === 'rel' && rel.length > 0 && (
        <div className="tocd-rel">
          {rel.map((r) => (
            <button key={r.id} type="button" className="tocd-ri" onClick={() => setSb(r.id)}>
              <div className="tocd-rh"><h4>{r.title}</h4><span className="faint">{r.flow.filter((g) => g.key !== 'open').map((g) => g.name).join(' → ')}</span></div>
              <div className="tocd-rs">{previewOf(r, 3).map((x) => <div key={x.k} className="tocd-rsl"><FitSlide f={x.f} ov={ovOf(r.id, x.k, x.f)} lazy /></div>)}</div>
            </button>
          ))}
        </div>
      )}
      {big && <TemplateDetail list={big.list} ovs={big.ovs} index={big.index} onNav={(k) => setBig((b) => ({ ...b, index: k }))} onClose={() => setBig(null)} notes={big.notes} noteLabel="이 시나리오에서의 역할" favFrom={'목차 템플릿 · ' + t.name} />}
      {sb && SC[sb] && <ScenarioStoryboard key={'sb-' + sb} s={SC[sb]} go={go} onClose={() => setSb(null)} />}
    </Modal>
  );
}
