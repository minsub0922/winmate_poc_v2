import { useEffect, useState } from 'react';
import { useApp, useLoad } from './context';
import { api,post,patch,number,compact } from './api';
import { Icon } from './icons';
import { Button, Badge, Modal, Empty, Loading, ErrorBox, Details, Field, Pager, Toggle } from './components';
import { TrendChart, Breakdown } from './charts';
import './operations.css';
import { UsersPage, UserDialog } from './users'; // 사용자 관리 목록 · 상세 (활동 내역)
export { UsersPage };

const historyNames={proposal:'제안서',review:'제안서 검토',simulation:'시뮬레이션',job:'작업 기록',server_job:'서버 작업',persona:'고객 프로필',favorite:'찜',template:'My 템플릿',ui:'화면 설정'};
const spanNames={'application.error':'앱 처리 오류',http:'HTTP 요청',action:'화면 행동','screen.enter':'화면 진입','screen.leave':'화면 이탈','client.error':'화면 오류','llm.usage':'LLM 호출','llm.logical':'LLM 처리',job:'백그라운드 작업','auth.login':'로그인','auth.logout':'로그아웃','admin.user':'계정 관리'};
const time=value=>value ? new Date(value*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}) : '기록 없음';
const day=value=>value ? new Date(value*1000).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}) : '—';
const dateKey=(offset=0)=>{const now=new Date(Date.now()+9*3600000+offset*86400000);return now.toISOString().slice(0,10);};
const jobNames={'compose:auto':'레이아웃 자동 구성','compose:parts':'목차 추천','compose:layouts':'장표 완성',requirements:'요구사항 요약',review:'제안서 검토',rfp:'RFP 정리',storyboard:'Storyboard',layout:'레이아웃 추천'};
const rate=(ok,failed)=>{const n=(Number(ok)||0)+(Number(failed)||0);return n ? Math.round((Number(ok)||0)/n*100) : null;};
const seconds=ms=>ms ? (ms/1000).toFixed(ms<10000 ? 1 : 0)+'초' : '—';
const chartMetrics=[['proposals','제안서 생성',[['proposals','제안서']]],['compose','레이아웃 자동 구성',[['compose_ok','성공'],['compose_failed','실패','#c87a6a']]],['input_tokens','LLM 입력 토큰',[['input_tokens','입력']]],['output_tokens','LLM 출력 토큰',[['output_tokens','출력','#779bd2']]],['errors','실패 로그',[['errors','실패','#c87a6a']]]];
const qs=value=>new URLSearchParams(Object.fromEntries(Object.entries(value).filter(([,v])=>v!=='' && v!==undefined && v!==null))).toString();
function Status({value}) {return <Badge status={value==='ok' ? 'succeeded' : value==='error' ? 'failed' : value==='cached' ? 'indexed' : value}>{({ok:'정상',error:'실패',running:'진행 중',cached:'캐시 사용',cancelled:'취소'})[value] || value}</Badge>;}


function UserForm({usernames=''}) {
  const {close,open,notify,refresh}=useApp();
  const reset=!!usernames;
  const [names,setNames]=useState(usernames),[mode,setMode]=useState('auto'),[password,setPassword]=useState(''),[role,setRole]=useState('member'),[display,setDisplay]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const count=names.split(/[,\n]/).filter(v=>v.trim()).length;
  async function submit(event) {
    event.preventDefault();setBusy(true);setError('');
    try {
      const data=await post(reset ? '/users/reset-password' : '/users',{usernames:names,password:mode==='auto' ? null : password,...(!reset ? {role,display_name:display} : {})});
      refresh();open({type:'credentials',result:data});notify(reset ? '초기 비밀번호를 재설정했습니다.' : `${data.users.length}명의 사용자를 추가했습니다.`);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <Modal title={reset ? '비밀번호 재설정' : '사용자 추가'} subtitle="아이디가 여러 개여도 배정할 초기 비밀번호는 하나입니다." close={close} footer={<><Button onClick={close}>취소</Button><Button variant="primary" form="user-form" type="submit" busy={busy} icon={reset ? 'refresh' : 'plus'}>{reset ? '비밀번호 재설정' : '사용자 생성'}</Button></>}><form id="user-form" className="form-stack" onSubmit={submit}><label>아이디{count>0 && <span className="quiet">{count}개 계정</span>}<textarea aria-label="추가할 아이디" rows="3" value={names} onChange={e=>setNames(e.target.value)} required maxLength={6500} placeholder="user01, user02, user03" readOnly={reset}/><small>쉼표 또는 줄바꿈으로 구분 · 한 번에 최대 50개</small></label>{!reset && <div className="user-form-columns"><label>권한<select aria-label="새 사용자 권한" value={role} onChange={e=>setRole(e.target.value)}><option value="member">사용자</option><option value="admin">관리자</option></select></label>{count===1 && <label>표시 이름<input value={display} onChange={e=>setDisplay(e.target.value)} maxLength={120} placeholder="선택 입력"/></label>}</div>}<div><label className="form-label">초기 비밀번호</label><div className="password-options"><label><input type="radio" name="password-mode" checked={mode==='auto'} onChange={()=>setMode('auto')}/>자동 생성</label><label><input type="radio" name="password-mode" checked={mode==='manual'} onChange={()=>setMode('manual')}/>직접 입력</label></div>{mode==='manual' && <label className="form-label">공통 비밀번호<input aria-label="공통 초기 비밀번호" type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={12} maxLength={1024} autoComplete="new-password" placeholder="12자 이상"/></label>}<div className="notice"><Icon name="info" size={17}/><p>{mode==='auto' ? '선택한 모든 계정에 동일한 무작위 초기 비밀번호를 배정합니다.' : '입력한 비밀번호 하나를 선택한 모든 계정에 동일하게 배정합니다.'} 생성 결과는 다음 화면에서 한 번 표시합니다.</p></div></div>{error && <ErrorBox error={error}/>}</form></Modal>;
}

function CredentialsDialog({result}) {
  const {close,notify}=useApp();
  const [visible,setVisible]=useState(false);
  async function copy(){try{await navigator.clipboard.writeText(result.initial_password);notify('공통 초기 비밀번호를 복사했습니다.');}catch{notify('비밀번호를 선택해 복사해 주세요.','error');setVisible(true);}}
  return <Modal title="계정 배정 완료" subtitle="공통 초기 비밀번호를 확인해 사용자에게 전달하세요." close={close} footer={<><span className="quiet">이 창을 닫으면 비밀번호를 다시 조회할 수 없습니다.</span><Button variant="primary" onClick={close}>확인</Button></>}><div className="credential-result"><span className="success-mark"><Icon name="check" size={27}/></span><h3>{result.users.length}개 계정에 비밀번호 하나를 배정했습니다.</h3><div className="account-chips">{result.users.map(name=><span key={name}>{name}</span>)}</div><label className="form-label">공통 초기 비밀번호<div className="credential-value"><input aria-label="배정한 초기 비밀번호" type={visible ? 'text' : 'password'} readOnly value={result.initial_password}/><Button onClick={()=>setVisible(v=>!v)}>{visible ? '숨기기' : '보기'}</Button><Button icon="copy" onClick={copy}>복사</Button></div></label></div></Modal>;
}


export function TracingPage() {
  const {version}=useApp();
  const [start,setStart]=useState(dateKey(-6)),[end,setEnd]=useState(dateKey()),[username,setUsername]=useState(''),[feature,setFeature]=useState(''),[model,setModel]=useState(''),[metric,setMetric]=useState('proposals'),[tab,setTab]=useState('activity'),[withAdmin,setWithAdmin]=useState(false);
  const filters={start,end,username,feature,model,include_admin:withAdmin ? 'true' : ''};
  const result=useLoad('/tracing/dashboard?'+qs(filters),version);
  const data=result.data,s=data?.summary || {};
  useEffect(()=>{if(!withAdmin && data?.options.admins?.includes(username))setUsername('');},[withAdmin,data,username]);
  function preset(days){setStart(dateKey(-(days-1)));setEnd(dateKey());}
  const composeRate=rate(s.compose_ok,s.compose_failed),chart=chartMetrics.find(([key])=>key===metric);
  return <><section className="panel tracing-filters"><div className="tracing-period"><div className="period-presets">{[1,7,30,90].map(days=><button key={days} className={start===dateKey(-(days-1)) && end===dateKey() ? 'selected' : ''} onClick={()=>preset(days)}>{days===1 ? '오늘' : days+'일'}</button>)}</div><div className="date-range"><input type="date" aria-label="조회 시작일" value={start} onChange={e=>setStart(e.target.value)}/><span>–</span><input type="date" aria-label="조회 종료일" value={end} onChange={e=>setEnd(e.target.value)}/></div><label className="admin-scope"><input type="checkbox" checked={withAdmin} onChange={e=>setWithAdmin(e.target.checked)}/>admin 포함</label><a className="text-button" href={'/admin/api/tracing/export?'+qs(filters)}><Icon name="download" size={15}/>로그 내보내기</a></div><div className="tracing-dimensions"><label>사용자<select aria-label="추적 사용자" value={username} onChange={e=>setUsername(e.target.value)}><option value="">모든 사용자</option>{data?.options.users.map(v=><option key={v} value={v}>{v==='system' ? 'system · 서버 작업' : v==='anonymous' ? '비로그인' : v}</option>)}</select></label><label>기능<select aria-label="추적 기능" value={feature} onChange={e=>setFeature(e.target.value)}><option value="">모든 기능</option>{data?.options.features.map(v=><option key={v} value={v}>{v}</option>)}</select></label><label>모델<select aria-label="추적 모델" value={model} onChange={e=>setModel(e.target.value)}><option value="">모든 모델</option>{data?.options.models.map(v=><option key={v} value={v}>{v}</option>)}</select></label><button className="text-button" onClick={()=>{setUsername('');setFeature('');setModel('');preset(7);}}>필터 초기화</button></div></section>
  {result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !data ? <Loading/> : <><div className="stats-grid operations-stats">{[{label:'제안서 생성',value:s.proposals,unit:'건',icon:'file',note:`구성 ${number(s.proposals_built)} · 내보내기 ${number(s.proposals_exported)} · 작성자 ${number(s.proposal_authors)}명`},{label:'레이아웃 자동 구성',value:composeRate,unit:'%',icon:'route',note:`성공 ${number(s.compose_ok)} / ${number((s.compose_ok||0)+(s.compose_failed||0))}회 · 평균 ${seconds(s.compose_avg_ms)}`+(s.compose_partial ? ` · 일부 파트 실패 ${number(s.compose_partial)}회` : '')},{label:'실패 로그',value:s.errors,unit:'건',icon:'alert',note:'요청 · 작업 · 화면 · 모델 오류'},{label:'LLM 토큰',split:[['입력',s.input_tokens],['출력',s.output_tokens]],icon:'spark',note:`호출 ${number(s.llm_calls)}회`+(s.unknown_usage ? ` · 미보고 ${number(s.unknown_usage)}회` : '')}].map(stat=><div className="stat-card" key={stat.label}><div className="stat-top"><span>{stat.label}</span><span className="stat-icon"><Icon name={stat.icon} size={18}/></span></div>{stat.split ? <div className="stat-value stat-split">{stat.split.map(([name,value])=><span key={name} title={number(value)+' tokens'}><small>{name}</small>{compact(value)}</span>)}</div> : <div className="stat-value">{stat.value===null ? '—' : number(stat.value)}{stat.value!==null && <small>{stat.unit}</small>}</div>}<p>{stat.note}</p></div>)}</div>
  <div className="tracing-charts"><section className="panel trend-panel"><div className="panel-heading"><div><h2>기간별 추이</h2><p>한국시간 · {data.bucket==='hour' ? '시간별' : '일별'} 집계</p></div><select aria-label="그래프 지표" value={metric} onChange={e=>setMetric(e.target.value)}>{chartMetrics.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></div><TrendChart rows={data.series} metric={metric} series={chart?.[2]}/></section><section className="panel breakdown-panel"><div className="panel-heading"><div><h2>작업별 성공률</h2><p>끝난 작업 기준 · 취소 제외</p></div></div><JobRates rows={data.jobs}/></section></div>
  <TokenUsage tokens={data.tokens} summary={s}/>
  {data.logging.dropped>0 && <ErrorBox error={`저장하지 못한 추적 이벤트가 ${number(data.logging.dropped)}건 있습니다. 서버의 DB 상태를 확인해 주세요.`}/>}
  <section className="panel tracing-log-panel"><div className="toolbar inset"><div className="tabs">{[['activity','활동 로그'],['errors','실패 로그'],['llm','LLM 요청']].map(([key,label])=><button key={key} className={tab===key ? 'selected' : ''} onClick={()=>setTab(key)}>{label}</button>)}</div><span className="quiet">기록 시작 {time(data.collection_started_at)}</span></div><SpansList filters={{...filters,...(tab==='errors' ? {status:'error'} : tab==='llm' ? {kind:'llm.usage'} : {scope:'activity'})}}/></section>
  <p className="operations-caption">토큰은 실제 API가 보고한 값입니다. 출력에는 추론 토큰이 포함됩니다. 재시도는 각 실제 요청에 포함하며, 응답 캐시 재사용은 새 모델 토큰으로 합산하지 않습니다. 기록 도입 전의 활동과 사용량은 추정하지 않습니다.</p>
  </>}
  </>;
}

function JobRates({rows=[]}) {
  return rows.length ? <div className="breakdown job-rates">{rows.map(row=>{const r=rate(row.ok,row.failed);return <div key={row.job}><div><span>{jobNames[row.job] || String(row.title || row.job).split(' · ')[0]}</span><strong>{r===null ? '—' : r+'%'}</strong></div><div className="breakdown-track"><i style={{width:(r ?? 0)+'%'}}/></div><small>성공 {number(row.ok)} · 실패 {number(row.failed)}{row.cancelled>0 ? ' · 취소 '+number(row.cancelled) : ''}{row.running>0 ? ' · 진행 중 '+number(row.running) : ''}</small></div>;})}</div> : <p className="quiet breakdown">표시할 작업이 없습니다.</p>;
}

const tokenGroups={feature:'기능별',model:'모델별',username:'사용자별'};
const tokenName=(by,name)=>by==='username' ? name==='system' ? 'system · 서버 작업' : name==='anonymous' ? '비로그인' : name : name || (by==='model' ? '모델 미확인' : '기타');
// 입력 · 출력 토큰: totals, then per feature · model · user (bar = 입력 + 출력, scaled to the largest row).
function TokenUsage({tokens,summary:s,groups=['feature','model','username'],totals=true}) {
  const [by,setBy]=useState(groups[0]);
  const rows=tokens?.[by] || [],max=Math.max(1,...rows.map(r=>(r.input_tokens||0)+(r.output_tokens||0)));
  return <section className="panel token-panel"><div className="panel-heading"><div><h2>LLM 토큰</h2></div><div className="period-presets">{groups.map(g=><button key={g} className={by===g ? 'selected' : ''} onClick={()=>setBy(g)}>{tokenGroups[g]}</button>)}</div></div>
    {totals && <div className="token-totals"><span><i className="in"/>입력<b>{number(s.input_tokens)}</b>{s.cached_tokens>0 && <small title="입력 중 캐시에서 읽은 토큰">캐시 {number(s.cached_tokens)}</small>}</span><span><i className="out"/>출력<b>{number(s.output_tokens)}</b>{s.thought_tokens>0 && <small title="출력 중 추론 토큰">추론 {number(s.thought_tokens)}</small>}</span><span>호출<b>{number(s.llm_calls)}회</b>{s.unknown_usage>0 && <small title="API가 사용량을 보고하지 않은 호출">미보고 {number(s.unknown_usage)}회</small>}</span></div>}
    {rows.length ? <div className="table-scroll"><table className="operations-table token-table"><thead><tr><th>{({feature:'기능',model:'모델',username:'사용자'})[by]}</th><th className="num">호출</th><th className="num">입력</th><th className="num">출력</th><th aria-label="입력 · 출력 비율"/></tr></thead><tbody>{rows.map(r=><tr key={r.name}><td title={r.name}>{tokenName(by,r.name)}</td><td className="num">{number(r.calls)}{r.unknown>0 && <small title="사용량 미보고">{' · '+number(r.unknown)}</small>}</td><td className="num">{number(r.input_tokens)}</td><td className="num">{number(r.output_tokens)}</td><td><div className="token-bar" title={`입력 ${number(r.input_tokens)} · 출력 ${number(r.output_tokens)}`}><i className="in" style={{width:(r.input_tokens||0)/max*100+'%'}}/><i className="out" style={{width:(r.output_tokens||0)/max*100+'%'}}/></div></td></tr>)}</tbody></table></div> : <p className="quiet breakdown">표시할 LLM 호출이 없습니다.</p>}
  </section>;
}

export function UserActivity({username,mode}) {
  const {version}=useApp();
  const [start,setStart]=useState(dateKey(-29)),[end,setEnd]=useState(dateKey());
  const filters={username,start,end};
  const summary=useLoad('/tracing/dashboard?'+qs(filters),version);
  const [tokenMetric,setTokenMetric]=useState('input_tokens');
  const s=summary.data?.summary,composeRate=s ? rate(s.compose_ok,s.compose_failed) : null;
  return <><div className="user-period"><span>조회 기간</span><input type="date" aria-label="사용자 기록 시작일" value={start} onChange={e=>setStart(e.target.value)}/><span>–</span><input type="date" aria-label="사용자 기록 종료일" value={end} onChange={e=>setEnd(e.target.value)}/></div>{summary.error && <ErrorBox error={summary.error}/>} {mode==='llm' && s && <><div className="compact-metrics"><span>입력 토큰<b>{number(s.input_tokens)}</b></span><span>출력 토큰<b>{number(s.output_tokens)}</b></span><span>실제 호출<b>{number(s.llm_calls)}회</b></span><span>사용량 미보고<b>{number(s.unknown_usage)}회</b></span></div><div className="period-presets token-switch">{[['input_tokens','입력'],['output_tokens','출력']].map(([key,label])=><button key={key} className={tokenMetric===key ? 'selected' : ''} onClick={()=>setTokenMetric(key)}>{label}</button>)}</div><TrendChart rows={summary.data.series} metric={tokenMetric} series={[[tokenMetric,tokenMetric==='input_tokens' ? '입력' : '출력',tokenMetric==='input_tokens' ? undefined : '#779bd2']]}/><TokenUsage tokens={summary.data.tokens} summary={s} groups={['feature','model']} totals={false}/></>}{mode==='activity' && s && <div className="compact-metrics"><span>제안서 생성<b>{number(s.proposals)}건</b></span><span>레이아웃 자동 구성<b>{composeRate===null ? '—' : composeRate+'%'}</b></span><span>자동 구성 시도<b>{number((s.compose_ok||0)+(s.compose_failed||0))}회</b></span><span>실패 로그<b>{number(s.errors)}건</b></span></div>}<SpansList compact filters={{...filters,...(mode==='errors' ? {status:'error'} : mode==='llm' ? {kind:'llm.usage'} : {scope:'activity'})}}/></>;
}

function SpansList({filters,compact=false}) {
  const {version,open}=useApp();
  const [offset,setOffset]=useState(0),[q,setQ]=useState('');
  const query=qs(filters);
  useEffect(()=>setOffset(0),[query,q]);
  const result=useLoad('/tracing/spans?'+query+'&'+qs({offset,limit:20,q}),version);
  const llm=filters.kind==='llm.usage',tokens=v=>v===null || v===undefined ? '미보고' : number(v);
  return <><div className="span-search"><label className="search-field"><Icon name="search" size={16}/><input aria-label="추적 로그 검색" value={q} onChange={e=>setQ(e.target.value)} placeholder="오류 코드, 내용, trace ID 검색"/></label><span>{number(result.data?.total)}건</span></div>{result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !result.data ? <Loading/> : !result.data.items.length ? <Empty icon="clock" title="조건에 맞는 추적 기록이 없습니다"/> : <><div className="table-scroll"><table className="operations-table spans-table"><thead><tr><th>시각</th>{!compact && <th>사용자</th>}<th>기능 · 요청</th><th>구분</th><th>상태</th><th>응답 시간</th>{llm && <><th className="num">입력</th><th className="num">출력</th></>}<th/></tr></thead><tbody>{result.data.items.map(row=><tr key={row.id}><td className="date-cell">{time(row.started)}</td>{!compact && <td>{row.username}</td>}<td><button className="span-title" onClick={()=>open({type:'trace',traceId:row.trace_id})}><strong>{row.job_title || row.stage || row.action || row.path || row.feature}</strong><small>{row.feature}{row.http_status ? ' · HTTP '+row.http_status : ''}{row.code ? ' · '+row.code : ''}</small></button></td><td>{spanNames[row.kind] || row.kind}</td><td><Status value={row.status}/></td><td>{row.duration_ms===null ? '—' : number(row.duration_ms)+' ms'}</td>{llm && <><td className="num">{tokens(row.input_tokens)}</td><td className="num">{tokens(row.output_tokens)}</td></>}<td><button className="icon-button" aria-label="trace 상세 보기" onClick={()=>open({type:'trace',traceId:row.trace_id})}><Icon name="chevron" size={16}/></button></td></tr>)}</tbody></table></div><Pager offset={offset} total={result.data.total} size={20} onChange={setOffset}/></>}</>;
}

function TraceDialog({traceId}) {
  const {close,version}=useApp();
  const result=useLoad('/tracing/trace/'+encodeURIComponent(traceId),version);
  const [selected,setSelected]=useState(null);
  const rows=result.data?.items || [],first=Math.min(...rows.map(row=>row.started)),last=Math.max(...rows.map(row=>row.ended || row.started+.001));
  const row=rows.find(r=>r.id===selected) || rows.find(r=>r.status==='error') || rows[0];
  return <Modal title="요청 추적" subtitle={traceId} close={close} wide footer={<><span className="quiet">화면 행동 · 서버 요청 · 작업 · 실제 LLM 호출</span><Button onClick={close}>닫기</Button></>}>{result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !result.data ? <Loading/> : !rows.length ? <Empty title="추적 기록이 없습니다"/> : <><div className="trace-timeline">{rows.map(span=><button key={span.id} className={row.id===span.id ? 'selected' : ''} onClick={()=>setSelected(span.id)}><span className={'trace-dot '+span.status}/><div><strong>{span.stage || span.action || span.path || spanNames[span.kind]}</strong><small>{span.username} · {spanNames[span.kind]} · {span.duration_ms===null ? '시간 미확인' : span.duration_ms+' ms'}</small></div><div className="trace-duration"><i style={{left:Math.max(0,(span.started-first)/Math.max(.001,last-first)*100)+'%',width:Math.max(2,Math.min(100,((span.ended || span.started+.001)-span.started)/Math.max(.001,last-first)*100))+'%'}}/></div><Status value={span.status}/></button>)}</div><section className="trace-detail"><div className="dialog-status-line"><Status value={row.status}/><span>{spanNames[row.kind]} · {row.id}</span></div><dl className="field-grid"><Field label="사용자" value={row.username}/><Field label="화면 · 기능" value={[row.page,row.feature].filter(Boolean).join(' / ')}/><Field label="시작 시각" value={time(row.started)}/><Field label="모델" value={row.model}/></dl>{row.kind==='llm.usage' && <div className="compact-metrics"><span>입력<b>{row.input_tokens===null ? '미보고' : number(row.input_tokens)}</b></span><span>출력<b>{row.output_tokens===null ? '미보고' : number(row.output_tokens)}</b></span><span>전체<b>{row.total_tokens===null ? '미보고' : number(row.total_tokens)}</b></span>{row.cached_tokens>0 && <span title="입력 중 캐시에서 읽은 토큰">캐시<b>{number(row.cached_tokens)}</b></span>}{row.thought_tokens>0 && <span title="출력 중 추론 토큰">추론<b>{number(row.thought_tokens)}</b></span>}</div>}{row.message && <ErrorBox error={(row.code ? row.code+' · ' : '')+row.message}/>}<Details title="요청 메타데이터" value={{method:row.method,path:row.path,http_status:row.http_status,session_id:row.session_id,job_id:row.job_id,parent_id:row.parent_id,metadata:row.metadata}}/>{row.stack && <Details title="오류 stack trace" value={row.stack}/>}</section></>}</Modal>;
}

function HistoryList({username=''}) {
  const {open,version}=useApp();
  const [kind,setKind]=useState(''),[offset,setOffset]=useState(0),[q,setQ]=useState('');
  const result=useLoad('/tracing/history?'+qs({username,kind,offset,limit:15,q}),version);
  useEffect(()=>setOffset(0),[username,kind,q]);
  return <><div className="history-filters"><input aria-label="히스토리 검색" placeholder="제목 또는 ID 검색" value={q} onChange={e=>setQ(e.target.value)}/><select aria-label="히스토리 종류" value={kind} onChange={e=>setKind(e.target.value)}><option value="">모든 히스토리</option>{Object.entries(historyNames).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></div>{result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !result.data ? <Loading/> : !result.data.items.length ? <Empty icon="file" title="보관한 히스토리가 없습니다">로그인한 브라우저의 기존 기록은 앱을 열면 자동으로 보관합니다.</Empty> : <><div className="table-scroll"><table className="operations-table history-table"><thead><tr>{!username && <th>사용자</th>}<th>히스토리</th><th>구분</th><th>최근 변경</th><th>보관 상태</th><th/></tr></thead><tbody>{result.data.items.map(row=><tr key={row.username+row.kind+row.record_id}>{!username && <td>{row.username}</td>}<td><button className="span-title" onClick={()=>open({type:'history-record',record:row})}><strong>{row.title}</strong><small>{row.record_id} · v{row.revision}</small></button></td><td>{historyNames[row.kind] || row.kind}</td><td>{time(row.updated_at)}</td><td><Badge status={row.archived ? 'archived' : 'indexed'}>{row.archived ? '이전 기록' : '현재 기록'}</Badge></td><td><button className="icon-button" aria-label="히스토리 상세" onClick={()=>open({type:'history-record',record:row})}><Icon name="chevron" size={16}/></button></td></tr>)}</tbody></table></div><Pager offset={offset} total={result.data.total} size={15} onChange={setOffset}/></>}</>;
}

function HistoryDialog({record}) {
  const {close}=useApp();
  const [revision,setRevision]=useState('');
  const result=useLoad('/tracing/history/'+[record.username,record.kind,record.record_id].map(encodeURIComponent).join('/')+(revision ? '?revision='+revision : ''));
  const data=result.data;
  return <Modal title={data?.title || record.title} subtitle={`${record.username} · ${historyNames[record.kind] || record.kind}`} close={close} wide footer={<><span className="quiet">기록과 이전 버전은 사용자별로 보존됩니다.</span><Button onClick={close}>닫기</Button></>}>{result.error ? <ErrorBox error={result.error} retry={result.retry}/> : !data ? <Loading/> : <><dl className="field-grid"><Field label="생성" value={time(data.created_at)}/><Field label="최근 보관" value={time(data.last_seen)}/><Field label="기록 ID" value={data.record_id}/><Field label="버전 수" value={data.versions.length+'개'}/></dl><label className="form-label">보관 버전<select aria-label="히스토리 버전" value={revision} onChange={e=>setRevision(e.target.value)}><option value="">최신 · v{data.revision}</option>{data.versions.map(v=><option key={v.revision} value={v.revision}>v{v.revision} · {time(v.at)}</option>)}</select></label><div className="history-payload"><h3>원본 히스토리 데이터</h3><pre>{JSON.stringify(data.payload,null,2)}</pre></div></>}</Modal>;
}

export function OperationDialogs({modal}) {
  if(!modal)return null;
  if(modal.type==='create-users')return <UserForm/>;
  if(modal.type==='reset-users')return <UserForm usernames={modal.usernames}/>;
  if(modal.type==='credentials')return <CredentialsDialog result={modal.result}/>;
  if(modal.type==='user')return <UserDialog username={modal.username}/>;
  if(modal.type==='trace')return <TraceDialog traceId={modal.traceId}/>;
  if(modal.type==='history-record')return <HistoryDialog record={modal.record}/>;
  return null;
}
