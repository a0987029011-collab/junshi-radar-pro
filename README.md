# 軍師雷達 Pro

軍師雷達 Pro 是台股多週期掃描與人工審核 Web App。Version 2 保留原本介面，將固定 7 檔資料改為可每天自動更新的上市、上櫃全市場掃描流程。

> 本系統僅供研究與人工審核，不構成投資建議，也不會自動下單。

## Version 2 已完成

- 掃描 TWSE 上市與 TPEx 上櫃公司。
- 先套用股本 20 億元及 20 日均量 1,000 張門檻。
- 以還原日 K 聚合週 K、月 K，計算 MACD、DPO、下降趨勢線、縮柱支撐、關鍵價位與回測。
- 依 `S / A+ / A / Seed / Watch` 自動分類。
- 最新開高低收量以證交所、櫃買中心官方盤後行情校正。
- 可選擇富果授權還原歷史行情；沒有金鑰時使用延遲歷史來源。
- GitHub Actions 於台北時間每個交易日 21:45 更新快照；資料提交後 Vercel 會自動部署。
- 保留既有手機版與桌面版 UI。

## 資料流程

```text
TWSE / TPEx 官方公司與收盤資料
                    │
Fugle（有金鑰）或延遲歷史行情
                    │
股本、20 日均量門檻
                    │
日／週／月指標與型態計算
                    │
100 分策略分 + 20 分結構品質
                    │
S / A+ / A / Seed / Watch
                    │
data/radar-snapshot.json
                    │
Next.js UI → GitHub → Vercel
```

所有策略門檻與權重集中在 [`config/strategy.json`](config/strategy.json)，不寫死在畫面中。

## 本機執行

需求：

- Node.js 22 以上
- pnpm 10

```bash
pnpm install
pnpm dev
```

開啟 `http://localhost:3000`。

### 產生全市場資料

```bash
pnpm data:refresh
```

如果本機無法連外，可用既有已核對資料產生開發快照：

```bash
pnpm data:seed
```

### 測試

```bash
pnpm lint
pnpm test
```

## 富果行情 API

在 GitHub repository 的 `Settings → Secrets and variables → Actions` 新增：

```text
FUGLE_API_KEY=你的金鑰
```

排程會自動優先使用富果授權還原歷史行情；沒有設定金鑰時，仍可用官方盤後資料加延遲歷史行情更新。

Vercel 不需要保存這個金鑰，因為每日掃描由 GitHub Actions 執行，Vercel 只部署產生完成的雷達快照。

## 每日自動更新

工作流程位於 [`.github/workflows/update-radar.yml`](.github/workflows/update-radar.yml)：

- 可在 GitHub `Actions → Update Junshi Radar → Run workflow` 手動執行。
- 每週一至週五台北時間 21:45 自動執行。
- 更新完成後提交 `data/radar-snapshot.json` 至 `main`。
- Vercel 偵測到新提交後自動發布。

## 環境變數

參考 [`.env.example`](.env.example)：

```text
MARKET_DATA_PROVIDER=auto
FUGLE_API_KEY=
DATA_TIMEZONE=Asia/Taipei
HISTORY_YEARS=5
SCAN_CONCURRENCY=6
```

`MARKET_DATA_PROVIDER=fugle` 會要求富果成功，`auto` 則會在沒有金鑰或富果暫時失敗時改用延遲歷史來源。

## 目前限制

- 未設定富果金鑰時不是盤中即時行情。
- GitHub Actions 目前負責盤後全市場掃描；盤中 WebSocket 需要常駐 Worker，不能由 Vercel 靜態部署長時間維持連線。
- 籌碼連續資料尚未接入，因此 S 級不會只憑價格訊號成立。
- 00632R 白線仍是 Research 因子，不會直接升級正式分類。
