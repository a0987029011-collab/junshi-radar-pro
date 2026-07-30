export function numberFromMarket(value) {
  const normalized = String(value ?? "")
    .replaceAll(",", "")
    .replaceAll("＋", "+")
    .replaceAll("－", "-")
    .trim();
  if (!normalized || ["--", "---", "-", "N/A"].includes(normalized)) {
    return Number.NaN;
  }
  return Number(normalized.replace(/^[+]/, ""));
}

export function roundToTick(value) {
  const tick =
    value < 10
      ? 0.01
      : value < 50
        ? 0.05
        : value < 100
          ? 0.1
          : value < 500
            ? 0.5
            : 1;
  const decimals = tick >= 1 ? 0 : tick >= 0.1 ? 1 : 2;
  return Number((Math.round(value / tick) * tick).toFixed(decimals));
}

export function ema(values, period) {
  const multiplier = 2 / (period + 1);
  return values.reduce((result, value, index) => {
    result.push(
      index === 0
        ? value
        : value * multiplier + result[index - 1] * (1 - multiplier)
    );
    return result;
  }, []);
}

export function rollingSma(values, period, requireFullWindow = true) {
  return values.map((_, index) => {
    if (requireFullWindow && index < period - 1) return Number.NaN;
    const start = Math.max(0, index - period + 1);
    const window = values.slice(start, index + 1);
    return window.reduce((total, value) => total + value, 0) / window.length;
  });
}

export function calculateMacd(
  closes,
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
) {
  const fast = ema(closes, fastPeriod);
  const slow = ema(closes, slowPeriod);
  const macd = closes.map((_, index) => fast[index] - slow[index]);
  const signal = rollingSma(macd, signalPeriod, false);
  return {
    macd,
    signal,
    histogram: macd.map((value, index) => value - signal[index])
  };
}

export function calculateDpo(closes, period = 21) {
  const barsBack = Math.floor(period / 2) + 1;
  const movingAverage = rollingSma(closes, period);
  return closes.map((close, index) => {
    const averageIndex = index - barsBack;
    return averageIndex >= 0 && Number.isFinite(movingAverage[averageIndex])
      ? close - movingAverage[averageIndex]
      : Number.NaN;
  });
}

function groupKey(time, timeframe) {
  if (timeframe === "month") return time.slice(0, 7);
  const date = new Date(`${time}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

export function aggregateRows(rows, timeframe) {
  const groups = new Map();
  for (const row of rows) {
    const key = groupKey(String(row[0]), timeframe);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries()).map(([key, group]) => [
    key,
    Number(group[0][1]),
    Math.max(...group.map((row) => Number(row[2]))),
    Math.min(...group.map((row) => Number(row[3]))),
    Number(group.at(-1)[4]),
    group.reduce((total, row) => total + Number(row[5]), 0)
  ]);
}

export function withIndicators(rows, config) {
  const closes = rows.map((row) => Number(row[4]));
  const macdConfig = config.indicators.macd;
  const { macd, signal, histogram } = calculateMacd(
    closes,
    macdConfig.fast,
    macdConfig.slow,
    macdConfig.signal
  );
  const dpo = calculateDpo(closes, config.indicators.dpo.period);
  return rows.map((row, index) => ({
    time: String(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    macd: macd[index],
    signal: signal[index],
    histogram: histogram[index],
    dpo: dpo[index]
  }));
}

function adjustedRows(rows) {
  const latestFactor = rows.at(-1)?.[6] ?? 1;
  return rows.map((row) => {
    const factor = Number(row[6] ?? 1) / latestFactor;
    return [
      row[0],
      Number(row[1]) * factor,
      Number(row[2]) * factor,
      Number(row[3]) * factor,
      Number(row[4]) * factor,
      Number(row[5])
    ];
  });
}

export function findSwingHighIndexes(candles, radius = 2) {
  const indexes = [];
  for (let index = radius; index < candles.length - radius; index += 1) {
    const window = candles.slice(index - radius, index + radius + 1);
    if (candles[index].high === Math.max(...window.map((item) => item.high))) {
      indexes.push(index);
    }
  }
  return indexes;
}

export function fitDescendingTrendline(candles, minimumTouches = 2) {
  const swingIndexes = findSwingHighIndexes(candles);
  if (swingIndexes.length < minimumTouches) return null;
  const priceRange =
    Math.max(...candles.map((candle) => candle.high)) -
    Math.min(...candles.map((candle) => candle.low));
  const tolerance = Math.max(priceRange * 0.018, Number.EPSILON);
  let best = null;

  for (let left = 0; left < swingIndexes.length - 1; left += 1) {
    for (let right = left + 1; right < swingIndexes.length; right += 1) {
      const first = swingIndexes[left];
      const last = swingIndexes[right];
      if (candles[last].high >= candles[first].high) continue;
      const slope =
        (candles[last].high - candles[first].high) / (last - first);
      const intercept = candles[first].high - slope * first;
      let violations = 0;
      for (let index = first + 1; index < last; index += 1) {
        if (candles[index].high > intercept + slope * index + tolerance) {
          violations += 1;
        }
      }
      const touchIndexes = swingIndexes.filter((index) => {
        if (index < first || index > last) return false;
        return (
          Math.abs(candles[index].high - (intercept + slope * index)) <=
          tolerance
        );
      });
      if (touchIndexes.length < minimumTouches) continue;
      const span = (last - first) / Math.max(1, candles.length - 1);
      const score = touchIndexes.length * 10 + span * 5 - violations * 8;
      if (!best || score > best.score) {
        best = { slope, intercept, touchIndexes, score };
      }
    }
  }
  if (!best) return null;
  return {
    slope: best.slope,
    intercept: best.intercept,
    touchIndexes: best.touchIndexes
  };
}

export function findShrinkingHistogramSupport(
  candles,
  minimumBarsUnbroken
) {
  for (
    let index = candles.length - minimumBarsUnbroken - 1;
    index >= 2;
    index -= 1
  ) {
    const shrinking =
      Math.abs(candles[index].histogram) <
        Math.abs(candles[index - 1].histogram) &&
      Math.abs(candles[index - 1].histogram) <
        Math.abs(candles[index - 2].histogram);
    if (!shrinking) continue;
    const support = candles[index].low;
    const forward = candles.slice(index + 1);
    if (forward.every((candle) => candle.low >= support)) {
      return {
        startIndex: index - 2,
        supportIndex: index,
        support,
        unbrokenBars: forward.length
      };
    }
  }
  return null;
}

function finite(value) {
  return Number.isFinite(value) ? value : 0;
}

function trendScore(candles) {
  const latest = candles.at(-1);
  const previous = candles.at(-2);
  const average = rollingSma(
    candles.map((candle) => candle.close),
    Math.min(10, candles.length),
    false
  ).at(-1);
  return (
    (latest.close >= average ? 0.3 : 0) +
    (latest.macd >= latest.signal ? 0.3 : 0) +
    (latest.histogram >= previous.histogram ? 0.2 : 0) +
    (finite(latest.dpo) >= finite(previous.dpo) ? 0.2 : 0)
  );
}

function macdScore(candles, config) {
  const latest = candles.at(-1);
  const previous = candles.at(-2);
  const nearZero =
    Math.abs(latest.macd / Math.max(0.01, latest.close)) <=
    config.indicators.macd.nearZeroThresholdPercent / 100;
  return (
    (latest.macd >= latest.signal ? 0.35 : 0) +
    (latest.histogram >= previous.histogram ? 0.25 : 0) +
    (latest.macd >= 0 ? 0.2 : 0) +
    (nearZero ? 0.2 : 0)
  );
}

function dpoScore(candles) {
  const latest = candles.at(-1);
  const previous = candles.at(-2);
  if (!Number.isFinite(latest.dpo)) return 0;
  const recentlyCrossed = candles
    .slice(-4)
    .some(
      (candle, index, values) =>
        index > 0 && values[index - 1].dpo <= 0 && candle.dpo > 0
    );
  return (
    (latest.dpo > 0 ? 0.5 : 0) +
    (latest.dpo >= previous.dpo ? 0.3 : 0) +
    (recentlyCrossed ? 0.2 : 0)
  );
}

function swingLowIndexes(candles, radius = 2) {
  const result = [];
  for (let index = radius; index < candles.length - radius; index += 1) {
    const window = candles.slice(index - radius, index + radius + 1);
    if (candles[index].low === Math.min(...window.map((item) => item.low))) {
      result.push(index);
    }
  }
  return result;
}

function keyStructure(daily, weekly, monthly, config) {
  const currentPrice = daily.at(-1).close;
  const minimumBars =
    config.patterns.shrinkingHistogramSupport.minimumBarsUnbroken;
  const supportSignals = [
    findShrinkingHistogramSupport(monthly, minimumBars.month),
    findShrinkingHistogramSupport(weekly, minimumBars.week),
    findShrinkingHistogramSupport(daily, minimumBars.day)
  ].filter(Boolean);
  const recentDaily = daily.slice(-120);
  const swingSupports = swingLowIndexes(recentDaily)
    .map((index) => ({
      support: recentDaily[index].low,
      index,
      unbrokenBars: recentDaily.length - index - 1
    }))
    .filter(
      (candidate) =>
        candidate.support < currentPrice &&
        recentDaily
          .slice(candidate.index + 1)
          .every((candle) => candle.low >= candidate.support * 0.995)
    );
  const candidates = [
    ...supportSignals.map((signal) => signal.support),
    ...swingSupports.map((signal) => signal.support)
  ].filter((support) => support > 0 && support < currentPrice);
  const fallback = Math.min(...daily.slice(-20).map((candle) => candle.low));
  const keyLevel = roundToTick(
    candidates.length ? Math.max(...candidates) : fallback
  );
  const recentSwing = swingSupports.at(-1)?.support ?? fallback;
  let stopLoss = roundToTick(Math.min(keyLevel, recentSwing));
  if (stopLoss >= currentPrice) stopLoss = roundToTick(currentPrice * 0.95);
  const tests = recentDaily.filter(
    (candle) => Math.abs(candle.low - keyLevel) / keyLevel <= 0.018
  ).length;
  return {
    keyLevel,
    stopLoss,
    tests,
    shrinkingSupport: supportSignals.length > 0
  };
}

function trendlineDescriptor(candles, firstIndex, secondIndex) {
  if (
    firstIndex == null ||
    secondIndex == null ||
    secondIndex <= firstIndex
  ) {
    return null;
  }
  const slope =
    (candles[secondIndex].high - candles[firstIndex].high) /
    (secondIndex - firstIndex);
  const valueAt = (index) => candles[firstIndex].high + slope * (index - firstIndex);
  return {
    startTime: candles[firstIndex].time,
    startPrice: roundToTick(candles[firstIndex].high),
    endTime: candles[secondIndex].time,
    endPrice: roundToTick(candles[secondIndex].high),
    currentPrice: roundToTick(valueAt(candles.length - 1)),
    slope,
    firstIndex,
    secondIndex,
    valueAt
  };
}

function findBullishTrackedCrosses(candles) {
  const crosses = [];
  const anchors = findSwingHighIndexes(candles, 2);
  for (const anchorIndex of anchors) {
    let lowerHighIndex = null;
    for (let index = anchorIndex + 1; index < candles.length; index += 1) {
      const candle = candles[index];
      if (lowerHighIndex != null) {
        const line = trendlineDescriptor(
          candles,
          anchorIndex,
          lowerHighIndex
        );
        const linePrice = line.valueAt(index);
        const bullishBodyCross =
          candle.close > candle.open &&
          candle.open <= linePrice &&
          candle.close > linePrice;
        if (bullishBodyCross) {
          crosses.push({
            anchorIndex,
            lowerHighIndex,
            crossIndex: index,
            keySupport: candle.low,
            linePrice
          });
          break;
        }
      }
      if (
        candle.high < candles[anchorIndex].high &&
        (lowerHighIndex == null ||
          candle.high < candles[lowerHighIndex].high)
      ) {
        lowerHighIndex = index;
      }
    }
  }
  return crosses;
}

function findMonthlyHistogramBase(candles, settings) {
  const start = Math.max(
    0,
    candles.length - settings.histogramLookbackBars
  );
  let troughIndex = -1;
  for (let index = start; index < candles.length - 1; index += 1) {
    if (
      candles[index].histogram < 0 &&
      (troughIndex < 0 ||
        candles[index].histogram < candles[troughIndex].histogram)
    ) {
      troughIndex = index;
    }
  }
  if (troughIndex < 0) return null;

  let supportIndex = -1;
  for (let index = troughIndex + 1; index < candles.length; index += 1) {
    if (
      candles[index].histogram < 0 &&
      Math.abs(candles[index].histogram) <
        Math.abs(candles[index - 1].histogram)
    ) {
      supportIndex = index;
      break;
    }
  }
  if (supportIndex < 0) return null;

  const latest = candles.at(-1);
  const support = candles[supportIndex].low;
  const closeFloor =
    support * (1 - settings.supportCloseBufferPercent / 100);
  const supportHeld = candles
    .slice(supportIndex + 1)
    .every((candle) => candle.close >= closeFloor);
  let contractionBars = 0;
  for (let index = candles.length - 1; index > troughIndex; index -= 1) {
    if (
      Math.abs(candles[index].histogram) <=
      Math.abs(candles[index - 1].histogram)
    ) {
      contractionBars += 1;
    }
  }
  const histogramContracting =
    latest.histogram < 0 &&
    Math.abs(latest.histogram) <
      Math.abs(candles[troughIndex].histogram) &&
    contractionBars >= settings.minimumContractionBars;

  return {
    troughTime: candles[troughIndex].time,
    supportTime: candles[supportIndex].time,
    support: roundToTick(support),
    supportHeld,
    histogramContracting,
    contractionBars
  };
}

export function detectMonthlyStructure(monthly, config) {
  const settings = config.patterns.monthlyStructureWatch;
  const candles = monthly.slice(-settings.lookbackBars);
  const latest = candles.at(-1);
  const trackedCrosses = findBullishTrackedCrosses(candles);
  let structure = null;

  for (const cross of trackedCrosses) {
    const breakIndex = candles.findIndex(
      (candle, index) =>
        index > cross.crossIndex &&
        candle.close < cross.keySupport &&
        candle.close < candle.open
    );
    if (breakIndex < 0) continue;

    const swingHighs = findSwingHighIndexes(candles, 2).filter(
      (index) => index >= cross.anchorIndex && index < breakIndex
    );
    const highestIndex = swingHighs.reduce(
      (best, index) =>
        best == null || candles[index].high > candles[best].high
          ? index
          : best,
      null
    );
    if (highestIndex == null) continue;
    const secondIndex = swingHighs
      .filter(
        (index) =>
          index > highestIndex &&
          candles[index].high < candles[highestIndex].high &&
          ((candles[highestIndex].high - candles[index].high) /
            candles[highestIndex].high) *
            100 >=
            settings.minimumMajorHighDropPercent &&
          ((candles[highestIndex].high - candles[index].high) /
            candles[highestIndex].high) *
            100 <=
            settings.maximumSecondHighGapPercent
      )
      .sort((left, right) => candles[right].high - candles[left].high)[0];
    if (secondIndex == null) continue;

    structure = {
      cross,
      breakIndex,
      majorLine: trendlineDescriptor(candles, highestIndex, secondIndex)
    };
  }

  const histogramBase = findMonthlyHistogramBase(candles, settings);
  if (!structure) {
    return {
      state: "tracking",
      longCycleWatch: false,
      drilldownReady: false,
      majorTrendBroken: false,
      ignoredFollowerBreakout: false,
      keySupport: histogramBase?.support ?? null,
      supportHeld: histogramBase?.supportHeld ?? false,
      histogramContracting:
        histogramBase?.histogramContracting ?? false,
      contractionBars: histogramBase?.contractionBars ?? 0,
      priorKeySupport: null,
      structureBreakTime: null,
      targetZoneLow: null,
      targetZoneHigh: null,
      majorTrendline: null,
      followerTrendline: null,
      score: histogramBase?.histogramContracting ? 20 : 0
    };
  }

  const major = structure.majorLine;
  const majorCrossIndex = candles.findIndex((candle, index) => {
    if (index <= major.secondIndex) return false;
    const linePrice = major.valueAt(index);
    return (
      candle.close > candle.open &&
      candle.open <= linePrice &&
      candle.close > linePrice
    );
  });
  const majorTrendBroken = majorCrossIndex >= 0;
  const followerCandidates = findSwingHighIndexes(candles, 2).filter(
    (index) =>
      index > structure.breakIndex &&
      candles[index].high < candles[major.secondIndex].high
  );
  const followerIndex = followerCandidates.at(-1);
  const follower =
    followerIndex == null
      ? null
      : trendlineDescriptor(candles, major.secondIndex, followerIndex);
  const followerCrossIndex =
    follower == null
      ? -1
      : candles.findIndex((candle, index) => {
          if (index <= follower.secondIndex) return false;
          const linePrice = follower.valueAt(index);
          return candle.high > linePrice || candle.close > linePrice;
        });
  const ignoredFollowerBreakout =
    followerCrossIndex >= 0 && !majorTrendBroken;
  const breakCandle = candles[structure.breakIndex];
  const targetZoneLow =
    breakCandle.low > latest.close
      ? roundToTick(breakCandle.low)
      : null;
  const targetZoneHigh =
    targetZoneLow == null
      ? null
      : roundToTick(
          Math.max(breakCandle.low, Math.min(breakCandle.open, breakCandle.close))
        );
  const longCycleWatch =
    !majorTrendBroken &&
    Boolean(histogramBase?.histogramContracting) &&
    Boolean(histogramBase?.supportHeld);
  let score = 0;
  if (major) score += 25;
  if (!majorTrendBroken) score += 10;
  if (histogramBase?.histogramContracting) score += 25;
  if (histogramBase?.supportHeld) score += 20;
  if (targetZoneLow != null) score += 10;
  if (ignoredFollowerBreakout) score += 10;

  return {
    state: majorTrendBroken
      ? "major-breakout"
      : histogramBase && !histogramBase.supportHeld
        ? "support-broken"
        : longCycleWatch
          ? "long-cycle-watch"
          : "tracking",
    longCycleWatch,
    drilldownReady: false,
    majorTrendBroken,
    ignoredFollowerBreakout,
    keySupport: histogramBase?.support ?? null,
    supportHeld: histogramBase?.supportHeld ?? false,
    histogramContracting:
      histogramBase?.histogramContracting ?? false,
    contractionBars: histogramBase?.contractionBars ?? 0,
    priorKeySupport: roundToTick(structure.cross.keySupport),
    structureBreakTime: breakCandle.time,
    targetZoneLow,
    targetZoneHigh,
    majorTrendline: {
      startTime: major.startTime,
      startPrice: major.startPrice,
      endTime: major.endTime,
      endPrice: major.endPrice,
      currentPrice: major.currentPrice
    },
    followerTrendline:
      follower == null
        ? null
        : {
            startTime: follower.startTime,
            startPrice: follower.startPrice,
            endTime: follower.endTime,
            endPrice: follower.endPrice,
            currentPrice: follower.currentPrice
          },
    score: Math.min(100, score)
  };
}

function clusteredSwingResistance(candles) {
  const points = findSwingHighIndexes(candles)
    .map((index) => ({
      index,
      price: candles[index].high,
      bodyTop: Math.max(candles[index].open, candles[index].close)
    }))
    .sort((left, right) => left.price - right.price);
  const clusters = [];
  for (const point of points) {
    const cluster = clusters.find(
      (candidate) =>
        Math.abs(point.price - candidate.average) / candidate.average <= 0.025
    );
    if (cluster) {
      cluster.points.push(point);
      cluster.average =
        cluster.points.reduce((total, item) => total + item.price, 0) /
        cluster.points.length;
      cluster.low = Math.min(cluster.low, point.bodyTop);
      cluster.high = Math.max(cluster.high, point.price);
    } else {
      clusters.push({
        points: [point],
        average: point.price,
        low: point.bodyTop,
        high: point.price
      });
    }
  }
  return clusters;
}

function bearishEngulfingSupplyZones(candles) {
  const zones = [];
  for (let index = 1; index < candles.length - 2; index += 1) {
    const previous = candles[index - 1];
    const candle = candles[index];
    const previousBullish = previous.close > previous.open;
    const candleBearish = candle.close < candle.open;
    const bodyEngulfed =
      candle.open >= previous.close * 0.995 &&
      candle.close <= previous.open * 1.005;
    const fullRangeCovered =
      candle.high >= previous.high * 0.995 &&
      candle.low <= previous.low * 1.005;
    if (
      !previousBullish ||
      !candleBearish ||
      (!bodyEngulfed && !fullRangeCovered)
    ) {
      continue;
    }
    const low = Math.min(previous.low, candle.low);
    const high = Math.max(previous.high, candle.high);
    const widthPercent = ((high - low) / Math.max(0.01, low)) * 100;
    if (widthPercent < 2.5 || widthPercent > 25) continue;
    zones.push({
      low,
      high,
      index,
      touches: candles.filter(
        (item) => item.high >= low * 0.99 && item.low <= high * 1.01
      ).length,
      source: "bearish-engulfing"
    });
  }
  return zones;
}

export function detectProfitPlan(daily, support, trendline, config) {
  const settings = config.patterns.deepProfitZone;
  const chart = daily.slice(-settings.resistanceLookbackBars);
  const currentPrice = chart.at(-1).close;
  const entryZoneLow = roundToTick(support.keyLevel);
  const entryZoneHigh = roundToTick(
    support.keyLevel * (1 + settings.entryZoneBufferPercent / 100)
  );
  const stopLoss = roundToTick(
    Math.min(support.stopLoss, support.keyLevel)
  );
  const minimumOverhead =
    currentPrice * (1 + settings.minimumProfitToZonePercent / 100);
  const maximumOverhead =
    currentPrice * (1 + settings.maximumProfitZoneDistancePercent / 100);

  const engulfingZone = bearishEngulfingSupplyZones(chart)
    .filter(
      (zone) =>
        zone.low >= minimumOverhead &&
        zone.low <= maximumOverhead &&
        ((zone.high - zone.low) / zone.low) * 100 >=
          settings.minimumZoneWidthPercent
    )
    .sort((left, right) => left.low - right.low)[0];

  let selectedZone = engulfingZone ?? null;
  if (!selectedZone) {
    const overhead = clusteredSwingResistance(chart)
      .filter(
        (cluster) =>
          cluster.average >= minimumOverhead &&
          cluster.average <= maximumOverhead
      )
      .sort((left, right) => left.average - right.average);
    const first = overhead[0];
    const second = overhead.find(
      (cluster) =>
        first &&
        ((cluster.average - first.average) / first.average) * 100 >=
          settings.minimumZoneWidthPercent
    );
    if (first && second) {
      selectedZone = {
        low: first.average,
        high: second.high,
        touches: first.points.length + second.points.length,
        source: "swing-high-clusters"
      };
    }
  }

  const profitZoneLow = selectedZone
    ? roundToTick(selectedZone.low)
    : null;
  const profitZoneHigh = selectedZone
    ? roundToTick(Math.max(selectedZone.low, selectedZone.high))
    : null;
  const entryRisk = Math.max(0.01, entryZoneHigh - stopLoss);
  const lowRiskReward =
    profitZoneLow == null
      ? 0
      : Math.max(0, profitZoneLow - entryZoneHigh) / entryRisk;
  const highRiskReward =
    profitZoneHigh == null
      ? 0
      : Math.max(0, profitZoneHigh - entryZoneHigh) / entryRisk;
  const potentialLowPercent =
    profitZoneLow == null
      ? 0
      : ((profitZoneLow - entryZoneHigh) / entryZoneHigh) * 100;
  const potentialHighPercent =
    profitZoneHigh == null
      ? 0
      : ((profitZoneHigh - entryZoneHigh) / entryZoneHigh) * 100;
  const entryExtensionPercent =
    ((currentPrice - entryZoneHigh) / entryZoneHigh) * 100;
  const phase =
    currentPrice < entryZoneLow * 0.98
      ? "forming"
      : entryExtensionPercent <= settings.maximumEntryExtensionPercent
        ? "entry-ready"
        : profitZoneLow != null && currentPrice < profitZoneLow
          ? "in-progress"
          : "extended";

  let clarityScore = 0;
  if (selectedZone) clarityScore += 25;
  if (selectedZone?.source === "bearish-engulfing") clarityScore += 10;
  clarityScore += Math.min(15, Number(selectedZone?.touches ?? 0) * 3);
  if (trendline.confirmedBreakout) clarityScore += 15;
  if (trendline.successfulRetest) clarityScore += 10;
  if (support.tests >= 3) clarityScore += 10;
  if (lowRiskReward >= settings.minimumLowRiskReward) clarityScore += 8;
  if (highRiskReward >= settings.minimumHighRiskReward) clarityScore += 7;
  if (phase === "entry-ready") clarityScore += 10;
  clarityScore = Math.min(100, clarityScore);

  const isClear =
    Boolean(selectedZone) &&
    phase === "entry-ready" &&
    (trendline.confirmedBreakout || trendline.above) &&
    lowRiskReward >= settings.minimumLowRiskReward &&
    highRiskReward >= settings.minimumHighRiskReward;

  return {
    entryZoneLow,
    entryZoneHigh,
    stopLoss,
    profitZoneLow,
    profitZoneHigh,
    potentialLowPercent,
    potentialHighPercent,
    lowRiskReward,
    highRiskReward,
    clarityScore,
    isClear,
    phase,
    source: selectedZone?.source ?? "none",
    resistanceTouches: Number(selectedZone?.touches ?? 0)
  };
}

function trendlineState(daily, config) {
  const chart = daily.slice(-120);
  const minimumTouches =
    config.patterns.descendingTrendlineBreakout.minimumTouchPoints;
  const line = fitDescendingTrendline(chart, minimumTouches);
  if (!line) {
    return {
      line: null,
      above: false,
      confirmedBreakout: false,
      breakoutIndex: -1,
      successfulRetest: false
    };
  }
  const linePrice = (index) => line.intercept + line.slope * index;
  let breakoutIndex = -1;
  for (
    let index = Math.max(1, chart.length - 20);
    index < chart.length;
    index += 1
  ) {
    if (
      chart[index - 1].close <= linePrice(index - 1) &&
      chart[index].close > linePrice(index)
    ) {
      breakoutIndex = index;
    }
  }
  const above = chart.at(-1).close > linePrice(chart.length - 1);
  const confirmedBreakout = breakoutIndex >= 0 && above;
  const successfulRetest =
    confirmedBreakout &&
    chart.slice(breakoutIndex + 1).some((candle, offset) => {
      const index = breakoutIndex + 1 + offset;
      const resistance = linePrice(index);
      return candle.low <= resistance * 1.025 && candle.close >= resistance;
    });
  return {
    line,
    above,
    confirmedBreakout,
    breakoutIndex,
    successfulRetest
  };
}

function weightedScore(candidate, config) {
  return Object.keys(config.weights).reduce(
    (total, key) =>
      total + candidate.signals[key] * Number(config.weights[key]),
    0
  );
}

function structureScore(candidate, config) {
  return Object.keys(config.structureQualityWeights).reduce(
    (total, key) =>
      total +
      candidate.structureSignals[key] *
        Number(config.structureQualityWeights[key]),
    0
  );
}

export function classifyCandidate(candidate, riskReward, config) {
  const s = candidate.signals;
  if (
    s.multiTimeframeResonance &&
    s.confirmedTrendlineBreakout &&
    s.macd >= config.indicators.signalScoreBullishMinimum &&
    s.dpo >= config.indicators.signalScoreBullishMinimum &&
    s.successfulRetest &&
    s.shrinkingHistogramSupport &&
    s.chipStructureStable &&
    riskReward >= config.classificationRules.S.minimumRiskReward
  ) {
    return "S";
  }
  if (
    s.confirmedTrendlineBreakout &&
    s.multiTimeframeResonance &&
    s.healthyConsolidation &&
    s.indicatorsRising
  ) {
    return "A+";
  }
  if (s.confirmedTrendlineBreakout) return "A";
  if (
    s.dailyBreakout < 0.5 &&
    s.monthlyHistogramContracting &&
    s.monthlyMacdNearZeroOrImproving &&
    s.monthlyDpoRising &&
    s.monthlyKeyLevel
  ) {
    return "Seed";
  }
  return "Watch";
}

function maturity(candidate, config) {
  if (candidate.signals.successfulRetest) {
    return config.maturity.successfulRetest;
  }
  if (candidate.signals.confirmedTrendlineBreakout) {
    return config.maturity.trendlineBreakout;
  }
  if (
    candidate.signals.weeklyTrend >=
    config.maturity.weeklyTrendSignalMinimum
  ) {
    return config.maturity.weeklyTrendTurningUp;
  }
  if (candidate.signals.monthlyHistogramContracting) {
    return config.maturity.monthlyHistogramComplete;
  }
  return config.maturity.bottomForming;
}

function safeCandles(candles) {
  return candles.map((candle) =>
    Object.fromEntries(
      Object.entries(candle).map(([key, value]) => [
        key,
        typeof value === "number" && !Number.isFinite(value) ? 0 : value
      ])
    )
  );
}

export function analyzeStock(stock, config, meta) {
  if (!Array.isArray(stock.daily) || stock.daily.length < 260) {
    throw new Error(`${stock.symbol} historical rows are insufficient`);
  }
  const rows = adjustedRows(stock.daily);
  const rawRows = stock.daily.map((row) => row.slice(0, 6));
  const dailyAll = withIndicators(rows, config);
  const weeklyAll = withIndicators(aggregateRows(rows, "week"), config);
  const monthlyAll = withIndicators(aggregateRows(rows, "month"), config);
  const rawDailyAll = withIndicators(rawRows, config);
  const rawWeeklyAll = withIndicators(aggregateRows(rawRows, "week"), config);
  const rawMonthlyAll = withIndicators(aggregateRows(rawRows, "month"), config);
  if (monthlyAll.length < 30 || weeklyAll.length < 52) {
    throw new Error(`${stock.symbol} multi-timeframe history is insufficient`);
  }

  const daily = dailyAll.slice(-180);
  const weekly = weeklyAll.slice(-104);
  const monthly = monthlyAll.slice(-60);
  const latest = daily.at(-1);
  const previousRaw = stock.daily.at(-2);
  const currentRaw = stock.daily.at(-1);
  const monthlyLatest = monthly.at(-1);
  const monthlyPrevious = monthly.at(-2);
  const dailyLatest = daily.at(-1);
  const dailyPrevious = daily.at(-2);
  const support = keyStructure(daily, weekly, monthly, config);
  const trendline = trendlineState(daily, config);
  const monthlyStructure = detectMonthlyStructure(monthly, config);
  const profitPlan = detectProfitPlan(
    daily,
    support,
    trendline,
    config
  );
  const monthlyTrend = trendScore(monthly);
  const weeklyTrend = trendScore(weekly);
  const dailyTrend = trendScore(daily);
  monthlyStructure.drilldownReady =
    monthlyStructure.longCycleWatch &&
    (weeklyTrend >= 0.65 || dailyTrend >= 0.65);
  const averageVolumeLots =
    stock.daily
      .slice(-20)
      .reduce((total, row) => total + Number(row[5]), 0) /
    Math.min(20, stock.daily.length) /
    1000;
  const previousTwentyVolume =
    daily.slice(-30, -10).reduce((total, candle) => total + candle.volume, 0) /
    20;
  const recentVolume =
    daily.slice(-5).reduce((total, candle) => total + candle.volume, 0) / 5;
  const recentRange =
    (Math.max(...daily.slice(-10).map((candle) => candle.high)) -
      Math.min(...daily.slice(-10).map((candle) => candle.low))) /
    latest.close;
  const healthyConsolidation =
    recentRange <= 0.1 && recentVolume <= previousTwentyVolume * 1.05;
  const multiTimeframeResonance =
    monthlyTrend >= 0.65 && weeklyTrend >= 0.65 && dailyTrend >= 0.65;
  const monthlyHistogramContracting =
    Math.abs(monthlyLatest.histogram) < Math.abs(monthlyPrevious.histogram);
  const monthlyMacdNearZeroOrImproving =
    Math.abs(monthlyLatest.macd / monthlyLatest.close) <=
      config.indicators.macd.nearZeroThresholdPercent / 100 ||
    monthlyLatest.histogram > monthlyPrevious.histogram;
  const monthlyDpoRising =
    Number.isFinite(monthlyLatest.dpo) &&
    monthlyLatest.dpo > monthlyPrevious.dpo;
  const dailyMacdScore = macdScore(daily, config);
  const dailyDpoScore = dpoScore(daily);
  const indicatorsRising =
    dailyLatest.histogram >= dailyPrevious.histogram &&
    finite(dailyLatest.dpo) >= finite(dailyPrevious.dpo);
  const firstTarget = roundToTick(
    latest.close + Math.max(0.01, latest.close - support.stopLoss) * 2
  );
  let consolidationBars = 10;
  for (let length = 10; length <= Math.min(120, daily.length); length += 5) {
    const window = daily.slice(-length);
    const range =
      (Math.max(...window.map((candle) => candle.high)) -
        Math.min(...window.map((candle) => candle.low))) /
      latest.close;
    if (range <= 0.18) consolidationBars = length;
    else break;
  }
  let monthlyContractionBars = 0;
  for (let index = monthly.length - 1; index > 0; index -= 1) {
    if (
      Math.abs(monthly[index].histogram) <=
      Math.abs(monthly[index - 1].histogram)
    ) {
      monthlyContractionBars += 1;
    } else {
      break;
    }
  }
  const trendlineTouches = trendline.line?.touchIndexes.length ?? 0;
  const structureSignals = {
    consolidationDuration: Math.min(1, consolidationBars / 90),
    trendlineTouches: Math.min(1, trendlineTouches / 3),
    keyLevelTests: Math.min(1, support.tests / 3),
    monthlyHistogramDuration: Math.min(1, monthlyContractionBars / 5),
    cleanRetest: trendline.successfulRetest ? 1 : 0
  };
  const providerLabel = stock.historyProvider ?? meta.provider ?? "延遲行情";
  const reasons = [
    `${stock.exchange} ${meta.dataAsOf} 收盤 ${currentRaw[4]}；20 日均量約 ${Math.round(averageVolumeLots).toLocaleString("zh-TW")} 張。`,
    `月／週／日趨勢分別為 ${Math.round(monthlyTrend * 100)}／${Math.round(weeklyTrend * 100)}／${Math.round(dailyTrend * 100)}。`,
    `MACD ${dailyLatest.macd.toFixed(2)}、訊號 ${dailyLatest.signal.toFixed(2)}；DPO ${dailyLatest.dpo.toFixed(2)}。`,
    `自動辨識關鍵價位 ${support.keyLevel}，近 120 根 K 棒測試約 ${support.tests} 次。`,
    profitPlan.profitZoneLow != null && profitPlan.profitZoneHigh != null
      ? `深層掃描辨識進場區 ${profitPlan.entryZoneLow}–${profitPlan.entryZoneHigh}，上方獲利區 ${profitPlan.profitZoneLow}–${profitPlan.profitZoneHigh}。`
      : null,
    monthlyStructure.longCycleWatch
      ? `月線主下降壓力仍有效，縮柱支撐 ${monthlyStructure.keySupport} 守住；列入長週期觀察，等待週線／日線機會。`
      : null,
    monthlyStructure.targetZoneLow != null
      ? `前次結構破壞 K 形成月線目標區 ${monthlyStructure.targetZoneLow}–${monthlyStructure.targetZoneHigh}。`
      : null
  ].filter(Boolean);
  const missingConditions = [
    !trendline.confirmedBreakout
      ? "近 20 個交易日尚未出現收盤確認的下降趨勢線突破。"
      : null,
    !multiTimeframeResonance
      ? "日、週、月尚未同時達到多週期共振門檻。"
      : null,
    !support.shrinkingSupport
      ? "尚未辨識到符合設定週期的縮柱支撐。"
      : null,
    !profitPlan.isClear
      ? "尚未同時滿足靠近進場區、上方壓力區清楚且風險報酬充足的深層區間條件。"
      : null,
    monthlyStructure.ignoredFollowerBreakout
      ? "目前即使越過短跟隨線，仍受月線大級別下降壓力壓制，不列為有效突破。"
      : null,
    "法人、借券與集中度資料仍未形成連續序列，籌碼分暫不自動加分。"
  ].filter(Boolean);

  const candidate = {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    exchange: stock.exchange,
    paidInCapitalBillion: stock.paidInCapital / 100000000,
    averageVolumeLots,
    currentPrice: Number(currentRaw[4]),
    changePercent:
      ((Number(currentRaw[4]) - Number(previousRaw[4])) /
        Number(previousRaw[4])) *
      100,
    keyLevel: support.keyLevel,
    stopLoss: support.stopLoss,
    firstTarget,
    profitPlan,
    deepScanScore: profitPlan.clarityScore,
    monthlyStructure,
    signals: {
      monthlyTrend,
      weeklyTrend,
      dailyBreakout: trendline.confirmedBreakout
        ? 1
        : trendline.above
          ? 0.65
          : 0,
      macd: dailyMacdScore,
      dpo: dailyDpoScore,
      keyLevel: Math.min(1, 0.4 + support.tests * 0.2),
      chipStructure: 0,
      confirmedTrendlineBreakout: trendline.confirmedBreakout,
      multiTimeframeResonance,
      healthyConsolidation,
      indicatorsRising,
      monthlyHistogramContracting,
      monthlyMacdNearZeroOrImproving,
      monthlyDpoRising,
      monthlyKeyLevel: support.keyLevel > 0,
      shrinkingHistogramSupport: support.shrinkingSupport,
      successfulRetest: trendline.successfulRetest,
      chipStructureStable: false
    },
    structureSignals,
    reasons,
    missingConditions,
    catalyst: `${providerLabel}已完成日、週、月一致計算；趨勢線與分類仍保留人工審核。`,
    dataAsOf: meta.dataAsOf,
    dataStatus: meta.mode,
    dataNotes: [
      `最新開高低收量由 ${stock.exchange} 官方盤後資料校正。`,
      `歷史 K 線來源：${providerLabel}；日 K 使用還原價格計算指標。`,
      `本次掃描涵蓋上市與上櫃，通過股本及 20 日均量門檻後才進入雷達。`,
      "籌碼條件尚未接入連續資料，因此不會只憑價格訊號自動升為 S 級。"
    ]
  };
  const downside = Math.max(0.01, candidate.currentPrice - candidate.stopLoss);
  const upside = Math.max(0, candidate.firstTarget - candidate.currentPrice);
  const riskReward = upside / downside;
  const scanned = {
    ...candidate,
    score: Math.round(weightedScore(candidate, config)),
    structureScore: Math.round(structureScore(candidate, config)),
    classification: classifyCandidate(candidate, riskReward, config),
    maturity: maturity(candidate, config),
    riskReward
  };

  return {
    candidate: scanned,
    charts: {
      adjusted: {
        day: safeCandles(dailyAll.slice(-120)),
        week: safeCandles(weeklyAll.slice(-104)),
        month: safeCandles(monthlyAll.slice(-60))
      },
      raw: {
        day: safeCandles(rawDailyAll.slice(-120)),
        week: safeCandles(rawWeeklyAll.slice(-104)),
        month: safeCandles(rawMonthlyAll.slice(-60))
      }
    },
    note: {
      dataAsOf: meta.dataAsOf,
      startDate: stock.daily[0][0],
      endDate: stock.daily.at(-1)[0],
      historyDays: stock.daily.length,
      corporateActions: stock.corporateActions?.length ?? 0,
      latestVerification: stock.latestVerification
    }
  };
}

export function sortCandidates(candidates) {
  const rankingValue = (candidate) =>
    candidate.score +
    candidate.structureScore * 0.25 +
    (candidate.deepScanScore ?? 0) * 0.08 +
    (candidate.monthlyStructure?.longCycleWatch ? 6 : 0) +
    (candidate.profitPlan?.isClear ? 12 : 0);
  return [...candidates].sort(
    (left, right) => rankingValue(right) - rankingValue(left)
  );
}
