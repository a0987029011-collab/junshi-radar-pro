export type ChartViewport = {
  visibleCount: number;
  startIndex: number;
  endIndex: number;
  endOffset: number;
  maximumEndOffset: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function resolveChartViewport(
  totalBars: number,
  requestedVisibleBars: number,
  minimumVisibleBars: number,
  requestedEndOffset: number
): ChartViewport {
  const safeTotal = Math.max(0, Math.floor(totalBars));
  if (safeTotal === 0) {
    return {
      visibleCount: 0,
      startIndex: 0,
      endIndex: -1,
      endOffset: 0,
      maximumEndOffset: 0
    };
  }

  const safeMinimum = clamp(Math.floor(minimumVisibleBars), 1, safeTotal);
  const visibleCount = clamp(
    Math.round(requestedVisibleBars),
    safeMinimum,
    safeTotal
  );
  const maximumEndOffset = safeTotal - visibleCount;
  const endOffset = clamp(
    Math.round(requestedEndOffset),
    0,
    maximumEndOffset
  );
  const endIndex = safeTotal - 1 - endOffset;

  return {
    visibleCount,
    startIndex: endIndex - visibleCount + 1,
    endIndex,
    endOffset,
    maximumEndOffset
  };
}

export function getPinchVisibleBars(
  startVisibleBars: number,
  startDistance: number,
  currentDistance: number,
  minimumVisibleBars: number,
  maximumVisibleBars: number
) {
  if (maximumVisibleBars <= 0) return 0;
  const safeMinimum = clamp(minimumVisibleBars, 1, maximumVisibleBars);
  if (startDistance <= 0 || currentDistance <= 0) {
    return clamp(Math.round(startVisibleBars), safeMinimum, maximumVisibleBars);
  }
  return clamp(
    Math.round((startVisibleBars * startDistance) / currentDistance),
    safeMinimum,
    maximumVisibleBars
  );
}

export function getPannedEndOffset(
  startEndOffset: number,
  horizontalDelta: number,
  pixelsPerBar: number,
  maximumEndOffset: number
) {
  const barDelta = pixelsPerBar > 0
    ? Math.round(horizontalDelta / pixelsPerBar)
    : 0;
  return clamp(startEndOffset + barDelta, 0, Math.max(0, maximumEndOffset));
}

export function getAnchoredEndOffset(
  totalBars: number,
  visibleBars: number,
  anchorIndex: number,
  anchorRatio: number
) {
  if (totalBars <= 0 || visibleBars <= 0) return 0;
  const safeVisibleBars = clamp(Math.round(visibleBars), 1, totalBars);
  const safeAnchorIndex = clamp(Math.round(anchorIndex), 0, totalBars - 1);
  const safeAnchorRatio = clamp(anchorRatio, 0, 1);
  const desiredStartIndex = Math.round(
    safeAnchorIndex - safeAnchorRatio * Math.max(0, safeVisibleBars - 1)
  );
  const startIndex = clamp(desiredStartIndex, 0, totalBars - safeVisibleBars);
  return totalBars - safeVisibleBars - startIndex;
}
