import assert from "node:assert/strict";
import test from "node:test";
import {
  getAnchoredEndOffset,
  getPannedEndOffset,
  getPinchVisibleBars,
  resolveChartViewport
} from "../lib/chart-viewport.ts";

test("chart viewport can move away from the latest K bar", () => {
  assert.deepEqual(resolveChartViewport(1000, 180, 30, 100), {
    visibleCount: 180,
    startIndex: 720,
    endIndex: 899,
    endOffset: 100,
    maximumEndOffset: 820
  });
});

test("chart viewport clamps panning to available history", () => {
  assert.deepEqual(resolveChartViewport(100, 30, 30, 999), {
    visibleCount: 30,
    startIndex: 0,
    endIndex: 29,
    endOffset: 70,
    maximumEndOffset: 70
  });
});

test("pinch distance controls visible K bar count", () => {
  assert.equal(getPinchVisibleBars(180, 100, 200, 30, 500), 90);
  assert.equal(getPinchVisibleBars(180, 100, 50, 30, 500), 360);
  assert.equal(getPinchVisibleBars(40, 100, 400, 30, 500), 30);
});

test("horizontal drag converts pixels to a bounded history offset", () => {
  assert.equal(getPannedEndOffset(12, 55, 10, 100), 18);
  assert.equal(getPannedEndOffset(2, -55, 10, 100), 0);
  assert.equal(getPannedEndOffset(98, 55, 10, 100), 100);
});

test("pinch zoom keeps its focal K bar near the finger midpoint", () => {
  const endOffset = getAnchoredEndOffset(1000, 90, 899, 0.5);
  const viewport = resolveChartViewport(1000, 90, 30, endOffset);
  assert.equal(viewport.startIndex, 855);
  assert.equal(viewport.endIndex, 944);
  assert.equal(899 - viewport.startIndex, 44);
});
