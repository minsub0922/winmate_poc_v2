// '샘플 자료' 띠 — 아직 이 제안서 값이 아닌 장을 크게 보여 줄 때 장의 오른쪽 위 모서리에 얹는 빨간 대각선 띠.
//   추천 구성 상세(업종 샘플 덱) · Storyboard 시트 상세 · 레이아웃 전체 보기 · 카드 미리보기 · 레이아웃 추가 미리보기 · 넣을 내용 확인 팝업.
//   어느 장이 견본인지는 domain/slides/context-policy.js sheetShowsSample.
// 띠는 장(Slide) 밖에 얹는다 — PPTX · 썸네일에는 들어가지 않고, 마우스를 받지 않아 장 클릭 · 편집은 그대로다.
// 크기는 장 너비를 따라 줄고 는다(작은 미리보기에서 장을 너무 가리지 않게).
//   <div className="vslide">{장}<SampleRibbon /></div> — 띠의 부모가 장 크기에 맞고 position: relative 여야 한다
//   <SampleMark on={…}>{장}</SampleMark> — 그런 부모가 없을 때 장을 감싸는 칸까지
import React, { useLayoutEffect, useRef, useState } from 'react';
import '../styles/sample-ribbon.css';

const scaleOf = (w) => Math.max(0.64, Math.min(1.12, 0.45 + (w || 1000) / 1900)); // 너비 1000px ≈ 1 · 600px ≈ 0.77 · 작은 미리보기는 0.64(글자는 10px 아래로 줄지 않는다)

export function SampleRibbon() {
  const ref = useRef(null);
  const [s, setS] = useState(1);
  useLayoutEffect(() => {
    const host = ref.current && ref.current.parentElement;
    if (!host) return undefined;
    const measure = () => setS(scaleOf(host.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure); ro.observe(host);
    return () => ro.disconnect();
  }, []);
  return <span ref={ref} className="sample-ribbon" role="note" style={{ '--sr': s }}><span>샘플 자료</span></span>;
}

export function SampleMark({ on = true, children }) {
  return <div className="sample-mark">{children}{on && <SampleRibbon />}</div>;
}
