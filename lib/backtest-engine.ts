export interface PricePoint {
  date: string;
  close: number;
}

export interface EventBacktestRow {
  windowDays: number;
  targetReturn: number;
  eventCount: number;
  hitRate: number;
  averageReturn: number;
  maximumDrawdown: number;
}

export function normalizeSeries(points: PricePoint[]) {
  if (!points.length || points[0].close === 0) return [];
  const base = points[0].close;
  return points.map((point) => ({
    ...point,
    normalizedClose: point.close / base
  }));
}

export function findUpwardCrosses(
  stock: PricePoint[],
  inverseEtf: PricePoint[],
  eligible?: boolean[]
) {
  const normalizedStock = normalizeSeries(stock);
  const normalizedInverse = normalizeSeries(inverseEtf);
  const size = Math.min(normalizedStock.length, normalizedInverse.length);
  const events: number[] = [];

  for (let index = 1; index < size; index += 1) {
    const wasBelow =
      normalizedStock[index - 1].normalizedClose <=
      normalizedInverse[index - 1].normalizedClose;
    const isAbove =
      normalizedStock[index].normalizedClose >
      normalizedInverse[index].normalizedClose;
    if (wasBelow && isAbove && (eligible?.[index] ?? true)) events.push(index);
  }
  return events;
}

export function runWhiteLineBacktest(
  stock: PricePoint[],
  inverseEtf: PricePoint[],
  windows: number[],
  targets: number[],
  eligible?: boolean[]
): EventBacktestRow[] {
  const events = findUpwardCrosses(stock, inverseEtf, eligible);
  const rows: EventBacktestRow[] = [];

  for (const windowDays of windows) {
    for (const targetReturn of targets) {
      const observations = events
        .filter((eventIndex) => eventIndex + windowDays < stock.length)
        .map((eventIndex) => {
          const entry = stock[eventIndex].close;
          const forward = stock.slice(
            eventIndex + 1,
            eventIndex + windowDays + 1
          );
          const returns = forward.map((point) => point.close / entry - 1);
          return {
            hit: Math.max(...returns) >= targetReturn,
            endingReturn: returns.at(-1) ?? 0,
            drawdown: Math.min(0, ...returns)
          };
        });

      rows.push({
        windowDays,
        targetReturn,
        eventCount: observations.length,
        hitRate: observations.length
          ? observations.filter((item) => item.hit).length /
            observations.length
          : 0,
        averageReturn: observations.length
          ? observations.reduce(
              (sum, item) => sum + item.endingReturn,
              0
            ) / observations.length
          : 0,
        maximumDrawdown: observations.length
          ? Math.min(...observations.map((item) => item.drawdown))
          : 0
      });
    }
  }
  return rows;
}
