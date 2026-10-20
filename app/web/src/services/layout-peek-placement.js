const EDGE = 12, GAP = 12, FRAME_X = 36, FRAME_Y = 32;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/** Compare the slide size that actually fits on every side, keeping the anchor clear. */
export function layoutPeekPlacement(rect, viewport, { headerHeight = 90, metadataHeight = 200 } = {}) {
  const { width: vw, height: vh } = viewport;
  const usableWidth = Math.max(0, vw - EDGE * 2), usableHeight = Math.max(0, vh - EDGE * 2);
  const wanted = Math.min(1080, usableWidth, Math.max(720, Math.round(rect.width * 2.5 + 14)));
  const regions = [
    { side: 'right', width: clamp(vw - rect.right - GAP - EDGE, 0, usableWidth), height: usableHeight },
    { side: 'left', width: clamp(rect.left - GAP - EDGE, 0, usableWidth), height: usableHeight },
    { side: 'bottom', width: usableWidth, height: clamp(vh - rect.bottom - GAP - EDGE, 0, usableHeight) },
    { side: 'top', width: usableWidth, height: clamp(rect.top - GAP - EDGE, 0, usableHeight) },
  ];
  const candidates = [];
  for (const region of regions) {
    const availableWidth = Math.floor(Math.min(wanted, region.width));
    const stackedSlide = Math.floor(Math.min(availableWidth - FRAME_X, (region.height - headerHeight - 56 - 60) * 16 / 9));
    if (stackedSlide >= 200) {
      const height = Math.min(region.height, Math.ceil(headerHeight + stackedSlide * 9 / 16 + 56 + metadataHeight));
      candidates.push({ ...region, layout: 'stacked', width: stackedSlide + FRAME_X, height, slideWidth: stackedSlide,
        metadataVisible: height - headerHeight - stackedSlide * 9 / 16 - 56 });
    }
    const metadataWidth = clamp(Math.round(availableWidth * .28), 220, 280);
    const wideSlide = Math.floor(Math.min(availableWidth - metadataWidth - FRAME_X - GAP, (region.height - FRAME_Y - 2) * 16 / 9));
    if (wideSlide >= 200 && wideSlide + metadataWidth + FRAME_X + GAP >= 480) {
      const height = Math.min(region.height, Math.ceil(Math.max(wideSlide * 9 / 16 + 2, headerHeight + GAP + metadataHeight) + FRAME_Y));
      candidates.push({ ...region, layout: 'wide', width: wideSlide + metadataWidth + FRAME_X + GAP, height, slideWidth: wideSlide, metadataWidth,
        metadataVisible: height - FRAME_Y - headerHeight - GAP });
    }
  }
  candidates.sort((a, b) => b.slideWidth - a.slideWidth
    || Math.min(metadataHeight, b.metadataVisible) - Math.min(metadataHeight, a.metadataVisible)
    || b.width * b.height - a.width * a.height);
  const best = candidates[0];
  if (!best) return null;
  const beside = best.side === 'left' || best.side === 'right';
  const left = best.side === 'right' ? rect.right + GAP : best.side === 'left' ? rect.left - GAP - best.width
    : clamp(rect.left + rect.width / 2 - best.width / 2, EDGE, vw - EDGE - best.width);
  const top = beside ? clamp(rect.top + rect.height / 2 - best.height / 2, EDGE, vh - EDGE - best.height)
    : best.side === 'bottom' ? rect.bottom + GAP : rect.top - GAP - best.height;
  return { ...best, left, top, cut: best.metadataVisible < metadataHeight };
}
