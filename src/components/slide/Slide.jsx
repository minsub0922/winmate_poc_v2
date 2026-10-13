import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { layoutHtml } from '../../lib/layoutHtml.js';
import { applyOverrides } from './overrides.js';
import { useWidth } from './useWidth.js';

/**
 * 1280×720 레이아웃 한 장을 width 에 맞춰 축소해 그린다(읽기 전용).
 * 레이아웃 HTML 을 그대로 넣고 transform: scale 로 줄이므로 원본 장표와 픽셀 단위로 같다.
 *   f       레이아웃 id                ov      덮어쓸 값(overrides.js)
 *   pageNo  'CONFIDENTIAL · N' 쪽 번호  lazy    화면 근처에 올 때까지 그리지 않음(목록용)
 */
export function Slide({ f, ov, width = 320, pageNo, className = '', lazy = false }) {
  const inner = useRef(null);
  const box = useRef(null);
  const [visible, setVisible] = useState(!lazy);
  const scale = width / 1280;
  useEffect(() => {
    if (!lazy || visible) return;
    const el = box.current; if (!el) return;
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); } }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [lazy, visible]);
  const ovKey = JSON.stringify(ov || {});
  useLayoutEffect(() => {
    const el = inner.current; if (!el || !visible) return;
    el.innerHTML = layoutHtml(f);
    applyOverrides(el.firstElementChild, ov, pageNo);
  }, [f, ovKey, pageNo, visible]);
  return (
    <div ref={box} className={'slide ' + className} style={{ width, height: Math.round(width * 9 / 16) }}>
      {visible ? <div ref={inner} className="slide-inner" style={{ transform: `scale(${scale})`, '--k': scale }} /> : <div className="slide-wait" />}
    </div>
  );
}

/** 부모 너비를 꽉 채우는 Slide (max 로 최대 너비 제한). */
export function FitSlide({ max = 4000, ...props }) {
  const ref = useRef(null);
  const w = useWidth(ref, 300);
  return <div ref={ref} style={{ width: '100%' }}>{w > 0 && <Slide {...props} width={Math.min(max, w)} />}</div>;
}
