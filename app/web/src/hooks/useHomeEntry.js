import { useLayoutEffect, useRef, useState } from 'react';

/** Keep the final layout in place while its fonts settle, then reveal it in order. */
export function useHomeEntry() {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    let active = true, frame;
    // Let fitted/lazy slide children mount before asking for the font readiness promise.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(async () => {
        ref.current?.getBoundingClientRect();
        try { await document.fonts?.ready; } catch { /* A failed font keeps the browser fallback. */ }
        if (active) frame = requestAnimationFrame(() => { if (active) setReady(true); });
      });
    });
    return () => { active = false; cancelAnimationFrame(frame); };
  }, []);
  return [ref, ready];
}
