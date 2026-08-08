export interface CandlePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockProfile {
  symbol: string;
  name: string;
  market: '上市' | '上櫃';
  sector: string;
  candles: CandlePoint[];
}

function buildSampleSeries(params: {
  base: number;
  drift: number;
  volatility: number;
  bounce: number;
  volumeBase: number;
}) {
  const candles: CandlePoint[] = [];
  let price = params.base;

  for (let index = 0; index < 40; index += 1) {
    const recent = index > 28;
    const wave = Math.sin(index / 3) * params.volatility + Math.cos(index / 5) * (params.volatility * 0.45);
    const directionalBias = params.drift + (recent ? params.bounce : 0);
    const open = price;
    const close = Math.max(20, open + directionalBias + wave);
    const high = Math.max(open, close) + Math.abs(wave) * 0.8 + 0.8;
    const low = Math.min(open, close) - Math.abs(wave) * 0.7 - 0.6;
    const volume = params.volumeBase + Math.floor(Math.abs(wave) * 3000 + (index % 7) * 950 + (recent ? 2000 : 0));

    candles.push({
      date: `2026-08-${String(index + 1).padStart(2, '0')}`,
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return candles;
}

export const importedStocks: StockProfile[] = [
  {
    symbol: '2330',
    name: '台積電',
    market: '上市',
    sector: '半導體',
    candles: buildSampleSeries({ base: 520, drift: -0.35, volatility: 2.6, bounce: 1.6, volumeBase: 1800000 }),
  },
  {
    symbol: '2317',
    name: '鴻海',
    market: '上市',
    sector: '電子',
    candles: buildSampleSeries({ base: 142, drift: -0.25, volatility: 1.8, bounce: 1.2, volumeBase: 1500000 }),
  },
  {
    symbol: '2454',
    name: '聯發科',
    market: '上市',
    sector: '半導體',
    candles: buildSampleSeries({ base: 800, drift: -0.4, volatility: 3.4, bounce: 1.9, volumeBase: 900000 }),
  },
  {
    symbol: '6505',
    name: '台塑化',
    market: '上市',
    sector: '化工',
    candles: buildSampleSeries({ base: 84, drift: -0.1, volatility: 1.2, bounce: 0.8, volumeBase: 2200000 }),
  },
  {
    symbol: '2308',
    name: '台達電',
    market: '上市',
    sector: '電機',
    candles: buildSampleSeries({ base: 95, drift: -0.14, volatility: 1.3, bounce: 1.0, volumeBase: 1100000 }),
  },
  {
    symbol: '2891',
    name: '中信金',
    market: '上市',
    sector: '金融',
    candles: buildSampleSeries({ base: 40, drift: -0.06, volatility: 0.8, bounce: 0.7, volumeBase: 1400000 }),
  },
  {
    symbol: '3711',
    name: '日月光投控',
    market: '上市',
    sector: '半導體',
    candles: buildSampleSeries({ base: 95, drift: -0.2, volatility: 1.75, bounce: 1.4, volumeBase: 1800000 }),
  },
  {
    symbol: '3008',
    name: '大立光',
    market: '上櫃',
    sector: '光電',
    candles: buildSampleSeries({ base: 830, drift: -0.25, volatility: 3.6, bounce: 1.8, volumeBase: 500000 }),
  },
  {
    symbol: '3045',
    name: '台灣大',
    market: '上市',
    sector: '通信',
    candles: buildSampleSeries({ base: 128, drift: -0.08, volatility: 1.1, bounce: 0.9, volumeBase: 1300000 }),
  },
  {
    symbol: '6412',
    name: '群電',
    market: '上櫃',
    sector: '電子',
    candles: buildSampleSeries({ base: 70, drift: -0.17, volatility: 1.1, bounce: 1.3, volumeBase: 1200000 }),
  },
  {
    symbol: '5483',
    name: '中美晶',
    market: '上櫃',
    sector: '半導體',
    candles: buildSampleSeries({ base: 73, drift: -0.15, volatility: 1.4, bounce: 1.2, volumeBase: 1600000 }),
  },
  {
    symbol: '2603',
    name: '長榮',
    market: '上市',
    sector: '航運',
    candles: buildSampleSeries({ base: 112, drift: -0.12, volatility: 1.25, bounce: 1.0, volumeBase: 1400000 }),
  },
];
