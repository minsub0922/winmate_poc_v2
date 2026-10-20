import { requireLogin } from './session.js';
import { recordFailure } from '../services/telemetry.js';
let transport = (...args) => fetch(...args);
let unauthorized;
export function setTransport(next) { transport = next; }
export function setUnauthorizedHandler(handler) { unauthorized = handler; }
export async function fetchResource(...args) {
  const input = args[0], options = args[1] || {};
  const targetUrl = typeof input === 'string' ? input : input?.url || input?.href || '';
  const method = (options.method || input?.method || 'GET').toUpperCase();
  const origin = globalThis.location?.origin || 'http://winmate.local';
  let parsed; try { parsed = new URL(targetUrl, origin); } catch { /* Non-HTTP inputs are handled by fetch. */ }
  const local = parsed?.origin === origin;
  const authRoute = parsed?.pathname.startsWith('/api/auth/');
  if (local && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !authRoute && !requireLogin()) {
    return new Response(JSON.stringify({ code: 'auth_required', detail: '로그인 후 이용할 수 있어요.' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  let response;
  try { response = await transport(...args); } catch (cause) {
    if (cause?.name !== 'AbortError') throw cause;
    const error = new Error('요청을 취소했습니다.'); error.code = 'cancelled'; throw error;
  }
  if (response.status === 401 && local && !authRoute) unauthorized?.();
  return response;
}
export async function requestJson(url, options = {}) {
  const res = await fetchResource(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const error = new Error(body.detail || `요청 실패 (${res.status})`);
    error.code = body.code || 'upstream_error';
    error.status = res.status;
    if(res.status!==401 && res.status!==403)recordFailure(error,{source:'http',trace_id:res.headers.get('x-winmate-trace')});
    throw error;
  }
  return res.json();
}
export const postJson = (url, body, signal) => requestJson(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
});

function completionHttpError(response, body) {
  const detail = typeof body?.message === 'string' ? body.message
    : typeof body?.detail === 'string' ? body.detail
      : typeof body?.detail?.message === 'string' ? body.detail.message : '';
  const gateway = response.status === 403 && !detail && (response.headers.get('server')?.toLowerCase().includes('cloudflare') || response.headers.has('cf-ray'));
  const fallback = response.status === 403
    ? `${gateway ? '중간 연결에서' : '접속 서버에서'} AI 요청을 거부했어요 (HTTP 403). 화면을 새로고침한 뒤 다시 요청해 주세요.`
    : `AI 요청 실패 (${response.status})`;
  const error = new Error(detail || fallback);
  error.code = body?.code || (typeof body?.error === 'string' ? body.error : gateway ? 'gateway_forbidden' : response.status === 403 ? 'request_forbidden' : 'upstream_error');
  error.status = response.status;
  return error;
}

/** JSON or SSE completion transport; the platform interface is independent of providers. */
export async function requestCompletion(body, {signal,onText,onProgress,onEvent,endpoint='/api/llm'} = {}) {
  const response=await fetchResource(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  if(!response.ok)throw completionHttpError(response,await response.json().catch(()=>null));
  if(!(response.headers.get('content-type')||'').includes('text/event-stream'))return response.json();
  const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='',result;
  const abort=()=>reader.cancel().catch(()=>{});signal?.addEventListener('abort',abort,{once:true});
  try{
    while(true){
      const {done,value}=await reader.read();buffer=(buffer+decoder.decode(value||new Uint8Array(),{stream:!done})).replaceAll('\r\n','\n');
      let index;
      while((index=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,index);buffer=buffer.slice(index+2);const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!data)continue;let event;try{event=JSON.parse(data);}catch{const error=new Error('서버 AI 응답 형식이 잘못되었습니다.');error.code='invalid_json';throw error;}if(event.type==='text')onText?.({text:event.text});else if(event.type==='skill_event')onEvent?.(event);else if(event.type==='progress')onProgress?.(event.message);else if(event.type==='result')result=event;else if(event.type==='error'){const error=new Error(event.message||'AI 요청 실패');error.code=event.code||'upstream_error';throw error;}}
      if(done)break;
    }
    if(signal?.aborted){const error=new Error('취소했어요.');error.code='cancelled';throw error;}
    if(!result){const error=new Error('AI 응답이 끝나기 전에 연결이 닫혔습니다.');error.code='response_incomplete';throw error;}
    return result;
  }catch(error){recordFailure(error,{source:'llm.stream',feature:body.feature || body.kind || 'llm',trace_id:response.headers.get('x-winmate-trace')});throw error;
  }finally{signal?.removeEventListener('abort',abort);if(!result)await reader.cancel().catch(()=>{});reader.releaseLock();}
}
