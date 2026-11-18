import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { Button, ErrorBox, Loading, Modal } from './components';
import { useApp } from './context';
import { LayoutFrame } from './layouts';
import './image-search.css';

const endpoint = '/layout-library/image-search';
const imageApi = f => '/layout-library/' + encodeURIComponent(f);
const reasons = {
  caption: '문구 일치', space_named: '같은 공간', space_kind: '유사 공간', space_unshown: '공간 근거 부족',
  vertical_std_space: '표준 제안서의 같은 공간', vertical_std_deck: '업종 표준 제안서', subvertical: '세부 업종',
  seen_place: '사진에서 확인한 장소', product_family: '같은 제품군', other_product_kind: '다른 제품군', linked_case: '연결 사례',
  template_original: '시트 원본', shape: '잘리는 영역', low_res: '해상도 부족', portrait: '인물 중심',
  before_scene: '도입 전 사진', similar_to_shown: '이미 사용한 장면과 유사', rank_top: '후보 1순위',
  space_reserved: '공간에 배정한 사진', verify_repick: '검토 후 교체', hidden: '맞는 이미지 없음', locked: '원본 유지',
  product_exact: '연결된 제품과 모델 일치', case_photos: '연결된 도입사례 사진', case_photo_for_point: '도입사례의 해당 설명에 배정한 사진',
  solution_media: '연결된 솔루션 이미지', solution_icon: '연결된 솔루션 아이콘', customer_birdseye: '고객 공간 조감도',
  llm_pick: 'AI가 선택한 후보', rank: '사용 가능한 다음 후보', 'rank(after reject)': 'AI 검토 후 선택한 다음 후보',
  part_unique: '파트에서 아직 쓰지 않은 사진', empty: '사용할 사진 없음', match: '적합', ok: '적합', mismatch: '불일치',
  'neutral_icon(unlinked solution)': '연결된 솔루션이 없어 기본 아이콘 유지',
  'template_original(pick rejected)': 'AI 검토 후 원본 유지', 'template_original(no better picture)': '더 적합한 후보가 없어 원본 유지',
  'template_original(model: no candidate fits)': '후보가 맞지 않아 원본 유지', 'template_original(same context)': '같은 맥락의 원본 유지',
  'template_original(fixed page)': '고정 시트의 원본 유지', 'solution_media(template)': '원본의 솔루션 이미지', 'case_photos(template)': '원본의 도입사례 사진',
};
const describe = code => reasons[code] || code;
function Matches({ rows, f }) {
  return <div className="is-matches">{rows.map(row => {
    const src = row.src && !row.src.startsWith('data:') ? '/admin/api' + imageApi(f) + '/images/file?' + new URLSearchParams({ src: row.src }) : null;
    return <details key={row.slot}><summary>{src && <img src={src} alt="" loading="lazy"/>}
      <span><strong>이미지 칸 {row.slot}</strong><small>{row.hidden ? '빈 칸' : row.desc || describe(row.why)}</small></span>
      <span className="is-match-count">{row.candidates.length ? '후보 ' + row.candidates.length : describe(row.why)}</span>
    </summary>
      {row.near && <p>칸 주변 문구 · {row.near}</p>}
      <p>선택 근거 · {describe(row.why)}{row.verified ? ' · AI 검토 ' + describe(row.verified) : ''}</p>
      {!!row.candidates.length && <ol>{row.candidates.map(c => <li key={c.src}><span>{c.desc}</span><small>{[c.score.toFixed(2) + '점', ...c.why.map(describe)].join(' · ')}</small></li>)}</ol>}
    </details>;
  })}</div>;
}

export function ImageSearch({ f = '', close, onSaved }) {
  const { notify } = useApp();
  const [policy, setPolicy] = useState(null), [weights, setWeights] = useState({});
  const [sampleId, select] = useState(''), [sample, setSample] = useState(null), [input, setInput] = useState('');
  const [result, setResult] = useState(null), [after, setAfter] = useState(false), [verify, setVerify] = useState(true);
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(''), [reload, setReload] = useState(0);
  const request = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    api(endpoint + '?' + new URLSearchParams({ f }), {signal: controller.signal}).then(data => {
      setPolicy(data); setWeights(data.weights); setVerify(data.verify);
      select((data.samples.find(s => s.f === f) || data.samples[0])?.id || '');
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [f, reload]);
  const selected = policy?.samples.find(s => s.id === sampleId);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setSample(null); setResult(null); setAfter(false); setError('');
    api(imageApi(selected.f) + '/experiments/image-sample?' + new URLSearchParams({ sample: selected.id }), {signal: controller.signal}).then(data => {
      if (!controller.signal.aborted) { setSample(data); setInput(JSON.stringify(data.input, null, 2)); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); request.current?.abort(); };
  }, [selected, reload]);
  const valid = policy && Object.values(weights).every(v => v !== '' && Number.isFinite(+v) && +v >= 0 && +v <= 3);
  const dirty = policy && Object.keys(weights).some(k => +weights[k] !== policy.weights[k]);
  const numbers = () => Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, +v]));
  function invalidate() { setResult(null); setAfter(false); setError(''); }
  async function run() {
    let context;
    try { context = JSON.parse(input); } catch { setError('레이아웃 컨텍스트의 JSON 형식을 확인해 주세요.'); return; }
    const controller = new AbortController(); request.current = controller;
    invalidate(); setBusy(true);
    try {
      const data = await api(imageApi(selected.f) + '/experiments/images', { method: 'POST', signal: controller.signal,
        body: JSON.stringify({ sample: selected.id, input: context, weights: numbers(), verify }) });
      if (!controller.signal.aborted) { setResult(data); setAfter(true); }
    } catch (e) { if (!controller.signal.aborted) setError(e.message); }
    finally { if (request.current === controller) setBusy(false); }
  }
  async function save() {
    setConfirm(false); setSaving(true); setError('');
    try {
      const data = await api(endpoint, { method: 'PUT', body: JSON.stringify({ rev: policy.rev, weights: numbers(), confirmed: true }) });
      setPolicy(p => ({...p, ...data})); setWeights(data.weights); notify('이미지 검색 로직을 저장했습니다.'); onSaved?.();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  }
  const retry = () => { setError(''); setReload(n => n + 1); };
  return <>
    <Modal title="이미지 검색 로직" close={saving ? () => {} : close} wide telemetryPrivate
      footer={<><Button onClick={() => setConfirm(true)} disabled={!valid || !dirty || busy || saving}>검색 로직 저장</Button>
        <Button icon="refresh" variant="primary" busy={busy} disabled={!sample || !valid || busy || saving} onClick={run}>이미지만 재추론</Button></>}>
      {error && <ErrorBox error={error} retry={retry}/>}
      {!policy ? !error && <Loading/> : <div className="is-workspace">
        <section className="is-logic"><h3>후보 선택 기준</h3>
          <p>제품 컷과 사례 사진은 연결된 항목에서 찾습니다. 공간 사진은 칸 주변 문구와 사진 설명을 BM25로 비교하고, 업종·공간·제품군과 일치하면 점수를 더합니다.</p>
          <div className="is-weights">{Object.entries(policy.labels).map(([k, label]) => <label key={k}>{label}
            <span><input type="number" min="0" max="3" step="0.1" aria-label={label + ' 가중치'} disabled={busy || saving}
              value={weights[k]} onChange={e => { setWeights({...weights, [k]: e.target.value}); invalidate(); }}/>배</span></label>)}</div>
          <p>1배는 기본 배점입니다. 해상도와 칸 비율, 이미 사용한 사진도 고려합니다. 고정된 이미지 칸은 원본을 유지합니다.</p>
          <label className="is-field">예시 시트<select value={sampleId} disabled={busy || saving} onChange={e => select(e.target.value)}>{policy.samples.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          {sample && <><details className="is-context"><summary>레이아웃 컨텍스트</summary>
            <textarea aria-label="레이아웃 컨텍스트" value={input} spellCheck={false} disabled={busy} onChange={e => { setInput(e.target.value); invalidate(); }}/></details>
            <label className="is-verify" title={policy.can_verify ? undefined : 'AI 연결을 설정하면 검토를 사용할 수 있습니다.'}><input type="checkbox" checked={verify} disabled={busy || !policy.can_verify} onChange={e => { setVerify(e.target.checked); invalidate(); }}/>선택된 장면 사진을 AI로 검토</label></>}
        </section>
        <section className="is-preview" aria-label="예시 시트 미리보기"><div className="is-preview-head"><h3>{selected?.f}</h3>
          {result && <div className="sb-seg"><button aria-pressed={!after} className={!after ? 'selected' : ''} onClick={() => setAfter(false)}>원본</button><button aria-pressed={after} className={after ? 'selected' : ''} onClick={() => setAfter(true)}>재추론 결과</button></div>}</div>
          {sample ? <LayoutFrame f={selected.f} title={after ? '이미지 재추론 결과' : '원본 예시 시트'} documentHtml={after && result ? result.html : sample.html}/> : !error && <Loading/>}
          {result && <Matches rows={result.matches} f={selected.f}/>}
        </section>
      </div>}
    </Modal>
    {confirm && createPortal(<Modal title="검색 로직을 저장할까요?" close={() => setConfirm(false)} footer={<><Button onClick={() => setConfirm(false)}>취소</Button><Button variant="primary" onClick={save}>저장</Button></>}>
      <p>새 가중치를 관리자 레이아웃 흐름과 웹앱의 이미지 선택에 적용합니다.</p>
    </Modal>, document.body)}
  </>;
}
