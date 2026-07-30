# 真實台股資料接入方案

## 建議採兩段式

先接「盤後官方資料」完成可靠的全市場每日掃描，再接「授權即時行情」做盤中突破雷達。這能讓資料品質、策略驗證與成本分開管理。

## 第一階段：盤後掃描

### 上市

臺灣證券交易所 OpenAPI 提供上市個股日成交資訊、月／年成交資訊、融資融券、借券、公司基本資料與開休市日期。

- OpenAPI：<https://openapi.twse.com.tw/>
- Swagger：<https://openapi.twse.com.tw/v1/swagger.json>

### 上櫃

證券櫃檯買賣中心 OpenAPI 提供上櫃收盤行情、融資融券、個股資料等。

- OpenAPI：<https://www.tpex.org.tw/openapi/>
- Swagger：<https://www.tpex.org.tw/openapi/swagger.json>

### 建議 adapter

建立：

- `TwseDailyAdapter`
- `TpexDailyAdapter`
- `OfficialChipAdapter`
- `CsvHistoricalAdapter`

每天收盤後將原始回應先保存，再轉成統一的 `Candle` 與 `ChipSnapshot`。保留來源、抓取時間、交易日與 schema 版本。

## 第二階段：即時雷達

官方盤後 OpenAPI 不等於適合大量即時訂閱。盤中偵測應選有授權、速率限制與 WebSocket 文件的供應商。富果行情目前提供台股 HTTP 與 WebSocket API，可作為一個可替換選項：

- 文件：<https://developer.fugle.tw/docs/data/intro/>
- WebSocket 入門：<https://developer.fugle.tw/docs/data/websocket-api/getting-started/>

建議新增 `RealtimeMarketAdapter`：

```ts
interface RealtimeMarketAdapter {
  connect(symbols: string[]): Promise<void>;
  onQuote(handler: (quote: RealtimeQuote) => void): void;
  disconnect(): Promise<void>;
}
```

盤中只訂閱「盤前候選池 + 接近趨勢線的股票」，不要一開始就對全市場逐檔訂閱。每次報價更新：

1. 讀取昨日已固定的趨勢線參數。
2. 判斷開盤、最高價與最新價穿越。
3. 產生候選事件。
4. 收盤後以日 K 再做收盤確認。

## 歷史回測資料要求

00632R 因子建議至少十年日資料，且同時包含：

- 所有上市櫃與已下市股票
- 還原權息或明確使用未還原價格
- 00632R 同期資料
- 股本、日均量與交易狀態
- 法人、融資融券、借券等當時可得資料
- 除權息、分割、暫停交易與缺值旗標

不能把不同價格的「個股」與「00632R」直接比較。MVP 回測核心先將兩條序列在共同研究起點正規化，再偵測向上穿越。

## 事件研究規格

每個穿越事件輸出：

- 事件代號、日期、當時股價與正規化值
- 20／30／60 交易日後報酬
- 期間最大有利變動與最大不利變動
- +10%、+15%、+20% 是否達成及首次達成日
- MACD、DPO、縮柱、趨勢線突破的當時狀態
- 市場狀態與流動性分組

統計需提供信賴區間與樣本數。若加入組合條件後樣本太少，即使命中率高也不能升級成正式策略。

## 環境變數

```dotenv
MARKET_DATA_PROVIDER=mock
FUGLE_API_KEY=
HISTORICAL_DATA_PATH=
DATA_TIMEZONE=Asia/Taipei
```

正式託管時，在 Sites／Cloudflare 的環境變數中設定；不要把金鑰放進 `.env.example` 或版本控制。

## 驗收順序

1. 單檔 OHLCV 對帳。
2. 日轉週、日轉月與除權息對帳。
3. MACD、DPO 對 TradingView／券商圖抽樣。
4. 股本與日均量母體數量對帳。
5. 趨勢線、縮柱支撐與關鍵價位人工抽驗至少 100 例。
6. 事件回測做未來函數、存活者偏誤與交易成本檢查。
7. 平行跑 mock 與真實 adapter，確認 UI 不需修改。
