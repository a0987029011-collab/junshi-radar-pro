# Version 2 架構

## 更新層

`scripts/fetch-market-snapshot.mjs` 負責：

1. 讀取 TWSE、TPEx 官方公司基本資料與盤後行情。
2. 依股本門檻建立可掃描清單。
3. 從富果或延遲歷史來源取得五年日 K。
4. 以官方最新 OHLCV 覆寫同日歷史資料。
5. 計算 20 日均量並套用流動性門檻。
6. 計算多週期指標、策略分數、成熟度與分類。
7. 輸出 `data/radar-snapshot.json`。

## 應用層

- `lib/market-data.ts`：只讀取已產生的快照，避免使用者開頁時對外部行情站發出大量請求。
- `lib/scoring-engine.ts`：提供首頁及個股頁讀取已完成的分類結果。
- `components/CandleChart.tsx`：讀取快照中的還原 K 與原始 K。
- `app/api/radar/route.ts`：提供相同雷達資料的 JSON API。

## 排程層

`.github/workflows/update-radar.yml` 每日產生快照、驗證、提交到 `main`，由 Vercel 自動部署。

## 即時層

盤中即時偵測預留富果 WebSocket。長連線應部署於常駐 Worker，再將突破事件寫入持久化資料；不在 Vercel 建置程序內維持 WebSocket。
