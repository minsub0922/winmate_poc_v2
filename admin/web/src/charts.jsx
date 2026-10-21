import { useState } from 'react';
import { number } from './api';

const palette=['#168574','#779bd2','#c2a26a'];
export const bucketLabel=value=>value.includes('T') ? value.slice(5,10).replace('-','.')+' '+value.slice(11,13)+'시' : value.slice(5).replace('-','.');
export function TrendChart({ rows=[],metric='total_tokens' }) {
  const [hover,setHover]=useState(null);
  const W=820,H=235,left=53,right=18,top=18,bottom=37,width=W-left-right,height=H-top-bottom;
  const token=metric==='total_tokens';
  const keys=token ? ['input_tokens','output_tokens','thought_tokens'] : [metric];
  const names=token ? ['입력','출력','추론'] : [({requests:'API 요청',visits:'화면 방문',errors:'실패 로그',actions:'화면 행동'})[metric] || metric];
  const max=Math.max(1,...rows.flatMap(row=>keys.map(key=>Number(row[key])||0)));
  const x=index=>left+(rows.length<2 ? width/2 : index/(rows.length-1)*width);
  const y=value=>top+height-(Number(value)||0)/max*height;
  const active=hover===null ? null : rows[hover];
  const occupied=rows.some(row=>keys.some(key=>Number(row[key])>0));
  return <div className="trend-chart"><div className="chart-legend">{names.map((name,i)=><span key={name}><i style={{background:palette[i]}}/>{name}</span>)}</div><div className="chart-canvas">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={token ? '기간별 입력·출력·추론 토큰 사용 추이' : names[0]+' 사용 추이'} onMouseLeave={()=>setHover(null)} onMouseMove={event=>{const rect=event.currentTarget.getBoundingClientRect();const px=(event.clientX-rect.left)/rect.width*W;setHover(Math.max(0,Math.min(rows.length-1,Math.round((px-left)/width*(rows.length-1)))));}}>
      {[0,.25,.5,.75,1].map(r=><g key={r}><line x1={left} x2={W-right} y1={y(r*max)} y2={y(r*max)} stroke="#edf2f4" strokeDasharray={r ? '3 5' : ''}/><text x={left-11} y={y(r*max)+4} textAnchor="end" className="chart-axis">{number(Math.round(r*max))}</text></g>)}
      {occupied && keys.map((key,index)=>{const points=rows.map((row,i)=>`${x(i)},${y(row[key])}`).join(' ');const area=`M ${x(0)} ${y(0)} L ${points.replaceAll(' ',' L ')} L ${x(rows.length-1)} ${y(0)} Z`;return <g key={key}><path d={area} fill={palette[index]} opacity=".055"/><polyline points={points} fill="none" stroke={palette[index]} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/></g>;})}
      {rows.filter((_,i)=>i===0 || i===rows.length-1 || rows.length>3 && i%Math.ceil(rows.length/6)===0).map(row=>{const i=rows.indexOf(row);return <text key={row.bucket} x={x(i)} y={H-12} textAnchor="middle" className="chart-axis">{bucketLabel(row.bucket)}</text>;})}
      {active && <g><line x1={x(hover)} x2={x(hover)} y1={top} y2={top+height} stroke="#c8d8d2" strokeDasharray="4 4"/>{keys.map((key,i)=><circle key={key} cx={x(hover)} cy={y(active[key])} r="3.5" fill={palette[i]} stroke="white" strokeWidth="2"/>)}</g>}
    </svg>{!occupied && <div className="chart-zero">선택한 기간에 기록된 사용량이 없습니다.</div>}
    {active && <div className="chart-tooltip" style={{left:Math.min(77,Math.max(8,(x(hover)/W)*100))+'%'}}><strong>{bucketLabel(active.bucket)}</strong>{keys.map((key,i)=><span key={key}><i style={{background:palette[i]}}/>{names[i]}<b>{number(active[key])}</b></span>)}</div>}
  </div></div>;
}
export function Breakdown({ rows=[],metric='total_tokens',label='feature' }) {
  const items=[...rows].sort((a,b)=>(Number(b[metric])||0)-(Number(a[metric])||0)).slice(0,7),max=Math.max(1,...items.map(row=>Number(row[metric])||0));
  return <div className="breakdown">{items.length ? items.map(row=><div key={row[label]}><div><span>{row[label]}</span><strong>{number(row[metric])}</strong></div><div className="breakdown-track"><i style={{width:Math.max(1,(Number(row[metric])||0)/max*100)+'%'}}/></div></div>) : <p className="quiet">표시할 데이터가 없습니다.</p>}</div>;
}
