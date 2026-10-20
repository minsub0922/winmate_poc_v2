import React from 'react';
import { segPlain } from '../repositories/proposals.js';
import { IND, refInfo } from '../services/catalog.js';

const text = value => segPlain(value, ref => { const info=refInfo(ref); return info?.short || info?.label || ref; });
const bytes = size => !size ? '' : size < 1024 ? size+' B' : size < 1024*1024 ? (size/1024).toFixed(1)+' KB' : (size/1024/1024).toFixed(1)+' MB';
export function HistoryRequirementsPreview({ source }) {
  const req=source.req || {}, form=req.form || {};
  const info=[['프로젝트',form.project],['고객사',form.customer || source.customer],['제안 대상',form.target],['업종',source.indName || IND[source.ind]?.name],['입력 방식',source.reqTab==='form'?'입력 폼':'자유형식']].filter(([,value])=>value);
  const free=text(req.free), note=text(form.noteSegs?.length ? form.noteSegs : form.note);
  return <div className="reuse-requirements">
    <section className="reuse-req-section"><h4>기본 정보</h4><dl>{info.map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl></section>
    <section className="reuse-req-section"><h4>자유형식 요구사항</h4><p>{free || '입력된 자유형식 요구사항이 없어요.'}</p></section>
    <section className="reuse-req-section"><h4>키맨별 요구사항</h4>{form.keymen?.length ? form.keymen.map((person,index)=><div className="reuse-keyman" key={person.id || index}>
      <h5>{person.name || '이름 미입력'}{person.weight != null && <span className="num">{person.weight}%</span>}</h5>
      {person.reqs?.some(value=>text(value).trim()) ? <ul>{person.reqs.map((value,i)=>text(value).trim() && <li key={i}>{text(value)}</li>)}</ul> : <p className="muted">입력된 요구사항이 없어요.</p>}
    </div>) : <p className="muted">등록된 키맨이 없어요.</p>}</section>
    <section className="reuse-req-section"><h4>제작자 의견</h4><p>{note || '입력된 제작자 의견이 없어요.'}</p></section>
    <section className="reuse-req-section"><h4>첨부파일 <span className="num">{req.files?.length || 0}</span></h4>{req.files?.length ? <ul className="reuse-req-files">{req.files.map((file,index)=><li key={file.id || index}><b>{file.name || '이름 없는 첨부파일'}</b>{bytes(file.size) && <span className="muted num">{bytes(file.size)}</span>}{file.memo && <p>{file.memo}</p>}</li>)}</ul> : <p className="muted">첨부파일이 없어요.</p>}</section>
  </div>;
}
