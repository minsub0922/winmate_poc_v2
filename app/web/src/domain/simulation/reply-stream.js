// Pace cumulative provider snapshots without tying rendering to network chunk sizes.
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
const characters = (text) => segmenter ? Array.from(segmenter.segment(text), (x) => x.segment) : Array.from(text);
const cancelled = () => new DOMException('취소했어요.', 'AbortError');

/** Stop waiting promptly even if an adapter ignores AbortSignal; late results stay observed. */
export async function withAbort(task, signal) {
  if (signal?.aborted) throw cancelled();
  if (!signal) return task();
  let abort;
  const stopped = new Promise((_, reject) => {
    abort = () => reject(cancelled());
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(() => {
      if (signal.aborted) throw cancelled();
      return task();
    }), stopped]);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

/** onText stays a cumulative string. finish() drains before the caller commits the turn. */
export function createReplyStream({ onText, signal } = {}) {
  let target = '', shown = '', glyphs = [], cursor = 0;
  let timer = null, closed = false, sealed = false, failure;
  const waiters = [];
  const settle = () => { while (waiters.length) waiters.shift()(); };
  const stop = () => {
    closed = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    signal?.removeEventListener('abort', stop);
    settle();
  };
  const tick = () => {
    timer = null;
    if (closed || signal?.aborted) { stop(); return; }
    // Roughly 40 updates for a buffered reply; never an update per code unit.
    cursor = Math.min(glyphs.length, cursor + Math.max(2, Math.ceil(glyphs.length / 40)));
    const next = glyphs.slice(0, cursor).join('');
    if (next !== shown) {
      shown = next;
      try { onText(shown); } catch (error) { failure = error; stop(); return; }
    }
    if (!closed && shown !== target) timer = setTimeout(tick, 32);
    else settle();
  };
  const update = (text) => {
    if (closed || signal?.aborted || text === target) return;
    target = text;
    if (!onText) { shown = text; return; }
    glyphs = characters(text);
    // Provider corrections replace the visible prefix on the next tick.
    cursor = text.startsWith(shown) ? characters(shown).length : 0;
    if (timer === null && shown !== target) timer = setTimeout(tick, 32);
  };
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  return {
    get text() { return shown; },
    push(text) { if (!sealed) update(text); },
    async finish(text) {
      if (!sealed) update(text);
      sealed = true;
      if (!closed && shown !== target) await new Promise((resolve) => waiters.push(resolve));
      stop();
      if (failure) throw failure;
      if (signal?.aborted) throw cancelled();
    },
    stop,
  };
}
