// Gemini REST 어댑터 — 재시도 · 시간 제한 · 토큰 집계 · 호출 기록.
// 키는 poc/.env 의 GEMINI_API_KEY (env.mjs 가 읽음). 값은 로그 · 결과 파일에 남기지 않는다.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** gemini-3 계열은 thinkingLevel, 2.5 계열은 thinkingBudget */
function thinkingConfig(model, level) {
  if (!level) return undefined;
  if (/gemini-2\.5/.test(model)) return { thinkingBudget: { none: 0, low: 512, medium: 2048, high: 8192 }[level] ?? 512 };
  return { thinkingLevel: level === 'none' ? 'low' : level };
}

export class LLM {
  /**
   * @param {object} o
   * @param {string} o.apiKey
   * @param {string} o.model
   * @param {string} [o.role]   기록용 이름(customer · seller · judge)
   * @param {number} [o.temperature]
   * @param {string} [o.thinking]  none | low | medium | high
   * @param {(rec:object)=>void} [o.onCall]
   */
  constructor({ apiKey, model, role = 'llm', temperature, thinking, maxOutputTokens, timeoutMs = 120000, onCall } = {}) {
    if (!apiKey) throw new Error('GEMINI_API_KEY 가 없습니다 (poc/.env)');
    Object.assign(this, { apiKey, model, role, temperature, thinking, maxOutputTokens, timeoutMs, onCall });
    this.calls = 0; this.fails = 0; this.ms = 0; this.tokIn = 0; this.tokOut = 0; this.tokThink = 0;
  }

  /**
   * @param {{system?:string, messages:{role:'user'|'assistant', content:string}[], json?:boolean, tag?:string, signal?:AbortSignal}} req
   * @returns {Promise<{text:string, ms:number, usage:object}>}
   */
  async chat({ system, messages, json = false, tag = '', signal } = {}) {
    // 같은 역할이 이어지면 하나로 합친다 (Gemini 는 user ↔ model 교대를 기대)
    const contents = [];
    for (const m of messages) {
      const role = m.role === 'assistant' ? 'model' : 'user';
      const last = contents[contents.length - 1];
      if (last && last.role === role) last.parts[0].text += '\n\n' + m.content;
      else contents.push({ role, parts: [{ text: String(m.content ?? '') }] });
    }
    if (contents.length && contents[0].role !== 'user') contents.unshift({ role: 'user', parts: [{ text: '(대화 시작)' }] });
    const gen = {};
    if (this.temperature != null) gen.temperature = this.temperature;
    if (this.maxOutputTokens) gen.maxOutputTokens = this.maxOutputTokens;
    if (json) gen.responseMimeType = 'application/json';
    const tc = thinkingConfig(this.model, this.thinking);
    if (tc) gen.thinkingConfig = tc;
    const body = { contents, generationConfig: gen };
    if (system) body.systemInstruction = { parts: [{ text: system }] };

    const t0 = Date.now();
    let lastErr = '';
    for (let attempt = 0; attempt < 6; attempt++) {
      if (signal && signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
      const onAbort = () => ctl.abort();
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      try {
        const r = await fetch(`${BASE}/${this.model}:generateContent`, {
          method: 'POST', signal: ctl.signal,
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
          body: JSON.stringify(body),
        });
        const txt = await r.text();
        if (r.status === 429 || r.status >= 500) { lastErr = `HTTP ${r.status}`; await sleep(Math.min(30000, 1500 * 2 ** attempt) + Math.random() * 500); continue; }
        let j; try { j = JSON.parse(txt); } catch (e) { lastErr = 'bad json from API'; await sleep(1000); continue; }
        if (!r.ok) { const msg = (j.error && j.error.message) || `HTTP ${r.status}`; throw Object.assign(new Error(msg), { code: 'upstream_error', status: r.status }); }
        const cand = (j.candidates || [])[0];
        const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.filter((p) => !p.thought).map((p) => p.text || '').join('') : '';
        const u = j.usageMetadata || {};
        const usage = { in: u.promptTokenCount || 0, out: u.candidatesTokenCount || 0, think: u.thoughtsTokenCount || 0, finish: cand ? cand.finishReason : 'NONE' };
        const ms = Date.now() - t0;
        this.calls++; this.ms += ms; this.tokIn += usage.in; this.tokOut += usage.out; this.tokThink += usage.think;
        if (!text) { lastErr = 'empty (' + usage.finish + ')'; if (attempt < 2) { await sleep(800); continue; } }
        this.onCall && this.onCall({ role: this.role, model: this.model, tag, ok: !!text, ms, attempt, ...usage });
        return { text, ms, usage };
      } catch (e) {
        if (e && e.code === 'upstream_error') { this.fails++; this.onCall && this.onCall({ role: this.role, model: this.model, tag, ok: false, ms: Date.now() - t0, err: e.message }); throw e; }
        if (signal && signal.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
        lastErr = (e && (e.cause && e.cause.code)) || (e && e.name === 'AbortError' ? 'timeout' : String(e && e.message));
        await sleep(Math.min(30000, 1500 * 2 ** attempt));
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
    }
    this.fails++;
    this.onCall && this.onCall({ role: this.role, model: this.model, tag, ok: false, ms: Date.now() - t0, err: lastErr });
    throw Object.assign(new Error('LLM 호출 실패: ' + lastErr), { code: lastErr.startsWith('HTTP 429') ? 'rate_limited' : 'upstream_error' });
  }

  async json(req) {
    const r = await this.chat({ ...req, json: true });
    return { ...r, data: extractJson(r.text) };
  }

  stats() { return { model: this.model, calls: this.calls, fails: this.fails, avg_ms: this.calls ? Math.round(this.ms / this.calls) : 0, tok_in: this.tokIn, tok_out: this.tokOut, tok_think: this.tokThink }; }
}

export function extractJson(text) {
  let t = String(text || '').trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) t = m[1];
  const a = t.search(/[{[]/);
  if (a < 0) throw new Error('JSON 없음');
  const open = t[a]; const close = open === '{' ? '}' : ']';
  const b = t.lastIndexOf(close);
  return JSON.parse(t.slice(a, b + 1));
}

/**
 * 앱 엔진이 기대하는 sample 함수 모양으로 감싼다 — sample(messages, {onText, signal}) → {text}, sample.json(prompt) → object
 * (앱: window.claude.use('sample'), modelTier 'quick')
 */
export function engineSample(llm, onRaw) {
  const fn = async (messages, opts = {}) => {
    const r = await llm.chat({ messages, signal: opts.signal, tag: 'customer' });
    onRaw && onRaw({ kind: 'turn', messages, text: r.text, ms: r.ms, usage: r.usage });
    if (opts.onText) opts.onText({ text: r.text });
    return { text: r.text };
  };
  fn.json = async (prompt, opts = {}) => {
    const r = await llm.chat({ messages: [{ role: 'user', content: prompt }], json: true, signal: opts.signal, tag: 'debrief' });
    onRaw && onRaw({ kind: 'json', text: r.text, ms: r.ms, usage: r.usage });
    return extractJson(r.text);
  };
  return fn;
}
