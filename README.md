# 軍師雷達 Pro（第一版）

軍師雷達是台股多週期掃描與人工審核 Web App。現有 7 檔候選已使用五年歷史資料重算，最新開高低收量會逐檔與 TWSE `STOCK_DAY` 核對後才能建置。行情是盤後快照，**不會自動下單，也不構成投資建議**。

## 第一版已完成

- 手機優先首頁：S、A、A+、Seed、觀察池數量與排行榜
- 100 分策略評分 + 20 分結構品質
- 個股日／週／月 K 切換、成交量、MACD、DPO、趨勢線與關鍵價位
- 「為何入選」及「還缺哪些條件」
- 人工審核：通過／觀察／排除
- Watchlist
- 萬海持股案例：352 股、均價 85.3、停損 82
- 3 折手續費、最低手續費與證交稅風控試算
- 策略權重調整
- 00632R 白線事件研究報告格式與可執行回測核心
- 模組化資料來源、掃描、評分、回測與風控介面
- `/api/radar` 已核對候選掃描結果 API

人工審核、Watchlist、持股與權重先儲存在目前裝置的瀏覽器中。

## 系統架構

```text
市場資料 Adapter
  ├─ TWSE 上市公司基本資料與盤後最新 OHLCV
  ├─ 五年原始歷史（最新資料需通過 TWSE 交叉核對）
  ├─ TWSE 除權除息參考價建立還原 K 因子
  └─ 授權即時行情 WebSocket（下一階段）
          ↓
掃描引擎 → 指標／趨勢線／縮柱支撐／關鍵價位
          ↓
評分引擎 → 100 分 + 結構 20 分 → S / A / A+ / Seed / 觀察
          ↓
Next.js Web App → 排行榜／個股圖／人工審核／持股風控
          ↓
回測引擎 → 00632R Research 因子與組合條件統計
```

完整說明見 [系統架構](docs/ARCHITECTURE.md) 與 [真實資料接入方案](docs/REAL_DATA_PLAN.md)。

## 本機執行

需求：

- Node.js 22.13 以上
- pnpm 10

```bash
pnpm install
pnpm dev
```

瀏覽器開啟 `http://localhost:3000`。

### 用手機測試

電腦與手機連到同一個 Wi-Fi，執行：

```bash
pnpm dev -- --host 0.0.0.0
```

再於手機開啟 `http://電腦區網IP:3000`。Windows 防火牆若詢問，僅允許私人網路。

## 驗證

```bash
pnpm test
```

測試會先產生 Next.js production build，再啟動本機 production server，檢查首頁、持股頁、萬海風控數字與白線回測核心。

## 策略設定

正式預設規則全部集中在 [`config/strategy.json`](config/strategy.json)：

- 資金、單檔投入、最大停損、手續費與證交稅
- 股本、日均量與市場範圍
- MACD、DPO 與量能門檻
- 趨勢線、縮柱支撐、關鍵價位與前一根低點停損
- S / A / A+ / Seed / 觀察分類
- 100 分權重、20 分結構品質與成熟度
- 00632R Research 因子
- 06:00、盤中、12:00、13:55、21:30 報告節奏

程式只負責解讀設定，策略數值不散落在畫面中。網頁「策略」頁目前可調整權重並儲存在本機；未來接資料庫後可改為多人共用設定。

## 資料來源替換

`lib/data-adapter.ts` 定義統一介面。正式資料快照由 `lib/market-data.ts` 使用，新的供應商只需實作：

- `listCandidates`
- `getCandidate`
- `getCandles`
- `runInverseEtfResearch`

之後把 `marketDataAdapter` 換成新實作即可；排行榜、圖表、評分與回測畫面不用重寫。

環境變數範例見 `.env.example`。金鑰只能放環境變數，不要寫入設定檔或版本控制。

## 部署

### Vercel（建議）

本專案可直接從 GitHub 匯入 Vercel。Framework Preset 選擇 `Next.js`，其餘設定沿用專案預設即可：

- Install Command：由 `pnpm-lock.yaml` 與 `packageManager` 自動偵測
- Build Command：`pnpm build`
- Output Directory：由 Next.js 自動管理，不需覆寫
- Node.js：22.x 以上

目前盤後快照與策略資料已包含在 repository，第一版部署不需要額外環境變數。

### OpenAI Sites

本專案仍保留 Sites 相容結構；使用 `pnpm build:sites` 可輸出 Cloudflare Worker 版本。

### 自行部署 Cloudflare

```bash
pnpm build:sites
```

確認 `dist/server/index.js` 存在後，以 Cloudflare Workers 流程部署。正式即時資料 API 金鑰需放在託管平台的環境變數，不要上傳 `.env`。

## 開發階段

1. **第一版（已完成）**：排行、個股、策略評分、持股風控、人工審核。
2. **盤後核對資料（現況）**：7 檔候選的 TWSE 基本資料與最新 OHLCV 已核對；籌碼未接入、研究勝率不顯示假數字。
3. **歷史資料與回測**：十年調整後 OHLCV、下市股票、交易成本、00632R 事件研究。
4. **盤中雷達**：授權 WebSocket、突破事件佇列、12:00 與 13:55 報告。
5. **正式產品化**：登入、雲端 watchlist／審核紀錄、通知、監控與資料品質警報。
