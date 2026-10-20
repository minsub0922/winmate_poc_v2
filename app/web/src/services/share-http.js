const RETRYABLE = new Set([429, 502, 503, 504, 520, 521, 522, 523, 524]);
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

function detailText(value) {
  if (typeof value?.detail === 'string') return value.detail;
  if (typeof value?.detail?.message === 'string') return value.detail.message;
  if (Array.isArray(value?.detail)) return value.detail.map(item => [item.loc?.filter(x => x !== 'body').join('.'), item.msg].filter(Boolean).join(': ')).join(' · ');
  return typeof value?.message === 'string' ? value.message : '';
}

function responseError(response, value) {
  const status = response.status;
  const fallback = status === 404 ? '현재 접속 서버에서 공유 API 또는 문서를 찾지 못했어요.'
    : status === 413 ? '공유 문서가 서버의 허용 용량을 초과했어요.'
      : status === 401 ? '로그인이 만료되었어요. 다시 로그인해 주세요.'
        : status === 403 ? '공유 요청이 서버 또는 중간 연결에서 거부되었어요.'
          : RETRYABLE.has(status) ? '공유 서버와의 중간 연결이 일시적으로 실패했어요.'
            : '공유 API가 요청을 처리하지 못했어요.';
  const error = new Error(`${detailText(value) || fallback} (HTTP ${status})`);
  error.status = status; error.latest = value?.detail?.latest;
  error.code = value?.code || value?.detail?.code || (RETRYABLE.has(status) ? 'share_gateway_error' : 'share_http_error');
  return error;
}

/** Bounded retries are safe for the sharing API's idempotent source/patch contract. */
export function createShareHttp(fetchResource, { timeout = 15000, retries = 2, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  return async function shareHttp(url, data, method = 'POST') {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetchResource(url, { ...(data === undefined ? {} : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }), signal: controller.signal });
        if (response.status === 204) return null;
        const value = await response.json().catch(() => null);
        if (!response.ok) throw responseError(response, value);
        if (!value || !TOKEN.test(value.token || '') || !value.document || typeof value.document.title !== 'string') {
          const error = new Error(`공유 API에서 문서 JSON 대신 다른 응답을 받았어요. (HTTP ${response.status})`);
          error.code = 'share_invalid_response'; error.status = response.status; throw error;
        }
        return value;
      } catch (cause) {
        const error = controller.signal.aborted ? Object.assign(new Error('공유 API 응답 시간이 초과되었어요. 연결 후 다시 시도해 주세요.'), { code: 'share_timeout' }) : cause;
        const retry = RETRYABLE.has(error.status) || error.code === 'share_timeout' || error instanceof TypeError;
        if (!retry || attempt >= retries) throw error;
      } finally { clearTimeout(timer); }
      await wait(400 * 2 ** attempt);
    }
  };
}
