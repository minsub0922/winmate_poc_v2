import {FeedbackPopup} from './feedback-popup.jsx';
import React from 'react';
import { Icon, Modal, fmtWhen } from './common.jsx';
import { TagChip } from './tagcard.jsx';
import { SIMULATION_SKILL } from '../domain/simulation/skills.js';

const STAGES=[['context','대화 맥락','sparkle'],['database','앱 자료 탐색','layers'],['web','웹 검색','search'],['analysis','LLM 분석','chart'],['answers','답변 3개 생성','chat']];
const repliesOf=data=>data?.replies || (data?.reply_draft?[{title:'고객 답변 초안',approach:'이전에 준비한 답변입니다.',text:data.reply_draft,source_ids:[]}]:[]);
function Citations({ids,sources}) {
  return <span className="sim-skill-citations">{[...new Set(ids || [])].map(id=>id==='context'?<span key={id}>현재 대화·요구사항</span>:sources[id]?.url?<a key={id} href={sources[id].url} target="_blank" rel="noopener noreferrer">{sources[id].title}</a>:sources[id]?<span key={id}>{sources[id].title}</span>:null)}</span>;
}
function Failure({run,onRetry,busy}) {
  return <div className="sim-skill-error" role={run.status==='error'?'alert':'status'}><p>{run.error || '스킬 실행을 취소했어요.'}</p><button type="button" className="btn btn-sm" disabled={busy} onClick={onRetry}><Icon name="refresh" size={13}/>현재 맥락으로 다시 실행</button></div>;
}
export function SimulationSkillResult({ run, onOpen, onRetry, onStop, busy }) {
  const skill=SIMULATION_SKILL[run.skillId],data=run.result?.data;
  const card=<article className={'sim-skill-result status-'+run.status} aria-label={(skill?.name || '제안 스킬')+' 실행 결과'}>
    <header><span className="sim-skill-icon"><Icon name={skill?.icon || 'sparkle'} size={18}/></span><div><b>{skill?.name || '제안 스킬'}</b><small>자료 준비 · {fmtWhen(run.startedAt)}</small></div><span className="sp"/>{run.status==='running'&&<button type="button" className="btn btn-sm btn-ghost" onClick={onStop}>멈추기</button>}</header>
    {run.status==='running'&&<p className="sim-skill-progress" role="status"><span className="spin"/>{run.progress}</p>}
    {['error','cancelled','interrupted'].includes(run.status)&&<Failure run={run} onRetry={onRetry} busy={busy}/>}
    {run.status==='done'&&data&&<><h3>{data.title}</h3><p>{data.summary}</p><small className="sim-skill-ready">답변 후보 {repliesOf(data).length}개 · 참고 자료 {run.result.sources.length}개</small></>}
    <button type="button" className="btn btn-sm sim-skill-open" onClick={onOpen}><Icon name="sparkle" size={14}/>{run.status==='done'?'작업 과정·답변 보기':'작업 과정 보기'}<Icon name="chev" size={13}/></button>
  </article>;
  return run.status==='done'?card:<FeedbackPopup message={skill?.name || '제안 스킬'} kind={run.status==='running'?'progress':'error'} content={card}/>;
}
function Process({run}) {
  const stages=run.stages || {},hasStages=Object.keys(stages).length>0;
  return <>
    <ol className="sim-skill-stages" aria-label="실제 작업 단계">{STAGES.map(([id,label,icon])=>{
      const stage=stages[id],state=stage?.status==='done'?'done':stage?(run.status==='running'?'running':'stopped'):'waiting';
      return <li key={id} className={state}><span className="sim-skill-stage-icon">{state==='running'?<span className="spin"/>:<Icon name={state==='done'?'check':icon} size={17}/>}</span><b>{label}</b><small>{state==='done'?'완료':state==='running'?'진행 중':state==='stopped'?'중단':'대기'}</small></li>;
    })}</ol>
    {hasStages&&<details className="sim-skill-process" open={run.status==='running'?true:undefined}><summary>검색어와 수집 자료 확인</summary><div className="sim-skill-process-list">{STAGES.map(([id,label])=>{const stage=stages[id];if(!stage)return null;return <section key={id}><b>{label}</b>{stage.queries?.length>0&&<div className="sim-skill-queries">{stage.queries.map((q,i)=><span key={i}>{q}</span>)}</div>}{stage.sources?.length>0&&<div className="sim-skill-collected">{stage.sources.map(s=>s.url?<a key={s.id} href={s.url} target="_blank" rel="noopener noreferrer">{s.title}<Icon name="external" size={12}/></a>:<span key={s.id}>{s.title}</span>)}</div>}{stage.status==='done'&&!stage.queries?.length&&!stage.sources?.length&&<small>{id==='answers'?`${stage.count || 3}개의 답변을 준비했어요.`:'완료했어요.'}</small>}</section>;})}</div></details>}
    {!hasStages&&run.status!=='running'&&<p className="sim-skill-legacy">이전에 저장한 결과입니다. 단계별 실행 기록은 현재 맥락으로 다시 실행하면 볼 수 있어요.</p>}
  </>;
}
export function SimulationSkillModal({run,onClose,onUse,onRetry,onStop,busy,peek}) {
  const skill=SIMULATION_SKILL[run.skillId],result=run.result,data=result?.data;
  const sources=Object.fromEntries((result?.sources || []).map(s=>[s.id,s]));
  const analysis=run.analysis || result?.analysis;
  return <Modal title={(skill?.name || '제안 스킬')+' · 자료 준비'} sub="현재 대화와 연결한 제안서를 바탕으로 자료를 조사하고 답변을 준비해요." onClose={onClose} size="sim-skill-modal" bodyClass="mbody sim-skill-workspace"
    headerActions={run.status==='running'?<button type="button" className="btn btn-sm" onClick={onStop}>실행 중지</button>:null}>
    {run.prompt&&<p className="sim-skill-request">{run.prompt}</p>}
    <Process run={run}/>
    {run.status==='running'&&<p className="sim-skill-progress" role="status"><span className="spin"/>{run.progress || '현재 맥락을 준비하고 있어요…'}</p>}
    {analysis&&<details className="sim-skill-analysis" open={run.status==='running'?true:undefined}><summary><Icon name="chart" size={15}/>실시간 분석{run.stages?.analysis?.status==='streaming'&&run.status==='running'&&<span className="sim-skill-live">LIVE</span>}</summary><p className="sim-skill-stream">{analysis}</p></details>}
    {['error','cancelled','interrupted'].includes(run.status)&&<Failure run={run} onRetry={onRetry} busy={busy}/>}
    {run.status==='done'&&data&&<>
      <section className="sim-skill-answer-heading"><span className="sim-skill-eyebrow"><Icon name="sparkle" size={15}/>답변 준비 완료</span><h3>{data.title}</h3><p>{data.summary}</p></section>
      <section className="sim-skill-replies" aria-label="고객 답변 후보">{repliesOf(data).map((reply,i)=><article className="sim-skill-draft" key={i}><span className="sim-skill-reply-num">답변 {String(i+1).padStart(2,'0')}</span><h4>{reply.title}</h4><small>{reply.approach}</small><p>{reply.text}</p><Citations ids={reply.source_ids} sources={sources}/><button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={()=>onUse(reply)}><Icon name="edit" size={13}/>이 답변 사용</button></article>)}</section>
      <p className="sim-skill-use-hint">선택한 답변을 입력창에서 수정한 뒤 고객에게 보낼 수 있어요.</p>
      <details className="sim-skill-details"><summary>분석 근거와 추천 자료</summary><div className="sim-skill-detail-body">
        {data.findings.map((f,i)=><section key={i} className="sim-skill-finding"><h4>{f.heading}</h4><p>{f.text}</p><Citations ids={f.source_ids} sources={sources}/></section>)}
        {data.comparison?.length>0&&<div className="sim-skill-table" role="region" aria-label="제안 대안 비교" tabIndex={0}><table><thead><tr><th>비교 항목</th><th>삼성·제안안</th><th>경쟁·기존 대안</th><th>고객에게 의미</th></tr></thead><tbody>{data.comparison.map((c,i)=><tr key={i}><th>{c.criterion}</th><td>{c.option_a}</td><td>{c.option_b}</td><td>{c.implication}<Citations ids={c.source_ids} sources={sources}/></td></tr>)}</tbody></table></div>}
        {data.recommendations?.length>0&&<section className="sim-skill-recommendations"><h4>함께 제안할 자료</h4>{data.recommendations.map((r,i)=><div key={i}><TagChip r={r.ref} peek={peek}/><p>{r.reason}</p><small>{r.conditions}</small><Citations ids={r.source_ids} sources={sources}/></div>)}</section>}
        {data.missing_information?.length>0&&<section className="sim-skill-followup"><h4>추가로 확인할 내용</h4><ul>{data.missing_information.map((x,i)=><li key={i}>{x}</li>)}</ul></section>}
        {data.next_steps?.length>0&&<section className="sim-skill-followup"><h4>다음 단계</h4><ul>{data.next_steps.map((x,i)=><li key={i}>{x}</li>)}</ul></section>}
      </div></details>
      <details className="sim-skill-sources"><summary>참고 자료 {result.sources.length}개 · {result.research.web_used?'웹 검색 포함':'앱 자료 검색'}</summary>{result.sources.map(s=><div key={s.id}>{s.url?<a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a>:s.ref?<TagChip r={s.ref} peek={peek}/>:<span>{s.title}</span>}</div>)}</details>
      {result.research.search_entry_html&&<iframe className="sim-skill-search-entry" title="Google 검색 제안" srcDoc={result.research.search_entry_html} sandbox="allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer"/>}
    </>}
  </Modal>;
}
