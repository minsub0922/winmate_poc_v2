let transport = (...args) => fetch(...args);
let unauthorized;
export function setTransport(next) { transport = next; }
export function setUnauthorizedHandler(handler) { unauthorized = handler; }
export async function fetchResource(...args) {
  let response;
  try { response = await transport(...args); } catch (cause) {
    if (cause?.name !== 'AbortError') throw cause;
    const error = new Error('요청을 취소했습니다.'); error.code = 'cancelled'; throw error;
  }
  const target = typeof args[0] === 'string' ? args[0] : '';
  if (response.status === 401 && target.startsWith('/') && !target.startsWith('//')) unauthorized?.();
  return response;
}
export async function requestJson(url, options = {}) {
  const res = await fetchResource(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.detail || `요청 실패 (${res.status})`);
    error.code = body.code || 'upstream_error';
    error.status = res.status;
    throw error;
  }
  return res.json();
}
export const postJson = (url, body, signal) => requestJson(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
});

/** JSON or SSE completion transport; the platform interface is independent of providers. */
export async function requestCompletion(body, {signal,onText} = {}) {
  const response=await fetchResource('/api/llm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  if(!response.ok){const body=await response.json().catch(()=>({}));const error=new Error(body.message||body.detail||`AI 요청 실패 (${response.status})`);error.code=body.code||body.error||'upstream_error';error.status=response.status;throw error;}
  if(!(response.headers.get('content-type')||'').includes('text/event-stream'))return response.json();
  const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='',result;
  const abort=()=>reader.cancel().catch(()=>{});signal?.addEventListener('abort',abort,{once:true});
  try{
    while(true){
      const {done,value}=await reader.read();buffer=(buffer+decoder.decode(value||new Uint8Array(),{stream:!done})).replaceAll('\r\n','\n');
      let index;
      while((index=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,index);buffer=buffer.slice(index+2);const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!data)continue;let event;try{event=JSON.parse(data);}catch{const error=new Error('서버 AI 응답 형식이 잘못되었습니다.');error.code='invalid_json';throw error;}if(event.type==='text')onText?.({text:event.text});else if(event.type==='result')result=event;else if(event.type==='error'){const error=new Error(event.message||'AI 요청 실패');error.code=event.code||'upstream_error';throw error;}}
      if(done)break;
    }
    if(signal?.aborted){const error=new Error('취소했어요.');error.code='cancelled';throw error;}
    if(!result){const error=new Error('AI 응답이 끝나기 전에 연결이 닫혔습니다.');error.code='response_incomplete';throw error;}
    return result;
  }finally{signal?.removeEventListener('abort',abort);if(!result)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
