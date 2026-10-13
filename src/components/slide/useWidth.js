import { useLayoutEffect, useState } from 'react';

/** 요소의 현재 너비(px)를 따라간다(ResizeObserver). */
export function useWidth(ref, fallback = 640) {
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return w;
}
