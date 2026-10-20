import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutPeekPlacement } from '../web/src/services/layout-peek-placement.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const viewport = { width: 1500, height: 1000 };
const verify = (anchor, view = viewport) => {
  const result = layoutPeekPlacement(anchor, view); assert(result);
  assert(result.left >= 12 && result.top >= 12);
  assert(result.left + result.width <= view.width - 12);
  assert(result.top + result.height <= view.height - 12);
  assert(result.left + result.width <= anchor.left - 12 || result.left >= anchor.right + 12
    || result.top + result.height <= anchor.top - 12 || result.top >= anchor.bottom + 12, 'preview overlaps the hovered card');
  assert(result.slideWidth + 36 <= result.width);
  return result;
};

test('middle card uses the broad space above and a larger, complete slide', () => {
  const anchor = rect(550, 430, 400, 200), result = verify(anchor);
  assert.equal(result.side, 'top'); assert.equal(result.layout, 'wide');
  assert(result.width > 900 && result.slideWidth > 600);
  assert(result.slideWidth > Math.max(anchor.left - 24, viewport.width - anchor.right - 24));
});

test('all four directions are available, including bottom for upper middle cards', () => {
  for (const [side, anchor] of [['bottom', rect(550, 80, 400, 220)], ['top', rect(550, 700, 400, 200)],
    ['right', rect(40, 330, 360, 240)], ['left', rect(1100, 330, 360, 240)]]) assert.equal(verify(anchor).side, side);
});

test('a small desktop uses a broad shallow region rather than a narrow side', () => {
  const result = verify(rect(260, 200, 300, 220), { width: 820, height: 620 });
  assert.equal(result.side, 'bottom'); assert.equal(result.layout, 'wide'); assert(result.width >= 500);
});

test('edges, long metadata and multiple viewport sizes never leave the viewport or cover the card', () => {
  for (const view of [viewport, { width: 1100, height: 740 }, { width: 820, height: 620 }]) {
    for (const x of [24, (view.width - 220) / 2, view.width - 244]) for (const y of [24, (view.height - 180) / 2, view.height - 204]) {
      const anchor = rect(x, y, 220, 180); verify(anchor, view);
      const long = layoutPeekPlacement(anchor, view, { headerHeight: 140, metadataHeight: 800 }); assert(long);
      assert(long.top >= 12 && long.top + long.height <= view.height - 12);
    }
  }
});
