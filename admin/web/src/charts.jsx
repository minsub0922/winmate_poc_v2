import { useEffect, useRef, useState } from 'react';
import { number, compact } from './api';

const palette=['#168574','#779bd2','#c2a26a'];
export const bucketLabel=value=>value.includes('T') ? value.slice(5,10).replace('-','.')+' '+value.slice(11,13)+'시' : value.slice(5).replace('-','.');
// series: [[key,name,colour?]] lines to draw; without it the metric picks them (tokens = 입력 · 출력, 추론 is part of 출력).
// endLabels: each line's name at its right end (text ink, a short key in the line's colour), nudged apart so they never collide.
export function TrendChart({ rows=[],metric='total_tokens',series=null,legend=true,endLabels=false,height:baseHeight=235 }) {
  const [hover,setHover]=useState(null),[W,setW]=useState(820),canvas=useRef(null);
  useEffect(()=>{  // draw at the canvas's own width so text stays at its CSS size on a phone too
    const el=canvas.current;if(!el || typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(([entry])=>setW(Math.max(320,Math.round(entry.contentRect.width))));observer.observe(el);return ()=>observer.disconnect();
  },[]);
  const H=Math.round(baseHeight*Math.max(.8,Math.min(1.45,W/820)));  // height follows the width the way the old fixed 820 viewBox did, within bounds
  const left=53,right=endLabels ? 104 : 18,top=18,bottom=37,width=W-left-right,height=H-top-bottom;
  const token=!series && metric==='total_tokens';
  const keys=series ? series.map(v=>v[0]) : token ? ['input_tokens','output_tokens'] : [metric];
  const names=series ? series.map(v=>v[1]) : token ? ['입력','출력'] : [({requests:'API 요청',visits:'화면 방문',errors:'실패 로그',actions:'화면 행동',proposals:'제안서'})[metric] || metric];
  const colors=keys.map((_,i)=>series?.[i]?.[2] || palette[i]);
  const max=Math.max(token ? 1 : 4,...rows.flatMap(row=>keys.map(key=>Number(row[key])||0)));  // counts: whole-number ticks
  const tick=value=>max>=1e5 ? compact(Math.round(value)) : number(Math.round(value));  // 832만 fits the axis, the tooltip stays exact
  const x=index=>left+(rows.length<2 ? width/2 : index/(rows.length-1)*width);
  const y=value=>top+height-(Number(value)||0)/max*height;
  const active=hover===null ? null : rows[hover];
  const occupied=rows.some(row=>keys.some(key=>Number(row[key])>0));
  const ends=endLabels && occupied && rows.length ? keys.map((key,i)=>({key,name:names[i],color:colors[i],y:y(rows[rows.length-1][key])})).sort((a,b)=>a.y-b.y) : [];
  ends.forEach((end,i)=>{if(i && end.y-ends[i-1].y<13)end.y=ends[i-1].y+13;});
  const overflow=ends.length ? Math.max(0,ends[ends.length-1].y-(top+height)) : 0;
  ends.forEach(end=>{end.y-=overflow;});
  return <div className="trend-chart">{legend && <div className="chart-legend">{names.map((name,i)=><span key={name}><i style={{background:colors[i]}}/>{name}</span>)}</div>}<div className="chart-canvas" ref={canvas}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={token ? '기간별 입력·출력 토큰 사용 추이' : names.join(' · ')+' 사용 추이'} onMouseLeave={()=>setHover(null)} onMouseMove={event=>{const rect=event.currentTarget.getBoundingClientRect();const px=(event.clientX-rect.left)/rect.width*W;setHover(Math.max(0,Math.min(rows.length-1,Math.round((px-left)/width*(rows.length-1)))));}}>
      {[0,.25,.5,.75,1].map(r=><g key={r}><line x1={left} x2={W-right} y1={y(r*max)} y2={y(r*max)} stroke="#edf2f4" strokeDasharray={r ? '3 5' : ''}/><text x={left-11} y={y(r*max)+4} textAnchor="end" className="chart-axis">{tick(r*max)}</text></g>)}
      {occupied && keys.map((key,index)=>{const points=rows.map((row,i)=>`${x(i)},${y(row[key])}`).join(' ');const area=`M ${x(0)} ${y(0)} L ${points.replaceAll(' ',' L ')} L ${x(rows.length-1)} ${y(0)} Z`;return <g key={key}><path d={area} fill={colors[index]} opacity=".055"/><polyline points={points} fill="none" stroke={colors[index]} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/></g>;})}
      {rows.filter((_,i)=>i===0 || i===rows.length-1 || rows.length>3 && i%Math.ceil(rows.length/6)===0).map(row=>{const i=rows.indexOf(row);return <text key={row.bucket} x={x(i)} y={H-12} textAnchor="middle" className="chart-axis">{bucketLabel(row.bucket)}</text>;})}
      {ends.map(end=><g key={end.key}><line x1={W-right+8} x2={W-right+18} y1={end.y} y2={end.y} stroke={end.color} strokeWidth="2.2" strokeLinecap="round"/><text x={W-right+23} y={end.y+3.5} className="chart-axis chart-end">{end.name}</text></g>)}
      {active && <g><line x1={x(hover)} x2={x(hover)} y1={top} y2={top+height} stroke="#c8d8d2" strokeDasharray="4 4"/>{keys.map((key,i)=><circle key={key} cx={x(hover)} cy={y(active[key])} r="3.5" fill={colors[i]} stroke="white" strokeWidth="2"/>)}</g>}
    </svg>{!occupied && <div className="chart-zero">선택한 기간에 기록된 사용량이 없습니다.</div>}
    {active && <div className="chart-tooltip" style={{left:Math.min(77,Math.max(8,(x(hover)/W)*100))+'%'}}><strong>{bucketLabel(active.bucket)}</strong>{keys.map((key,i)=><span key={key}><i style={{background:colors[i]}}/>{names[i]}<b>{number(active[key])}</b></span>)}</div>}
  </div></div>;
}
export function Breakdown({ rows=[],metric='total_tokens',label='feature' }) {
  const items=[...rows].sort((a,b)=>(Number(b[metric])||0)-(Number(a[metric])||0)).slice(0,7),max=Math.max(1,...items.map(row=>Number(row[metric])||0));
  return <div className="breakdown">{items.length ? items.map(row=><div key={row[label]}><div><span>{row[label]}</span><strong>{number(row[metric])}</strong></div><div className="breakdown-track"><i style={{width:Math.max(1,(Number(row[metric])||0)/max*100)+'%'}}/></div></div>) : <p className="quiet">표시할 데이터가 없습니다.</p>}</div>;
}
