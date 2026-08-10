# 台新 Nova 全市場行情

軍師雷達使用台新 Nova 的 `snapshot/quotes/{market}` 取得上市（TSE）與上櫃（OTC）普通股快照。Core 行情 API 預設僅能同時訂閱 50 檔，因此不作為全市場掃描的正式來源。

## 安全邊界

- 台新登入帳密與憑證密碼使用 Windows DPAPI 加密，只能由目前的 Windows 使用者解密。
- `.env.local` 只保存本機加密設定目錄與 SDK 路徑，不保存明文密碼。
- `.env.local`、`.local/` 與常見憑證副檔名均由 Git 忽略，不會進入網站、提交或部署產物。
- 行情橋接只初始化 `marketdata.restClient` 並呼叫上市、上櫃快照；不存取 `stock` 下單介面。
- `data:taishin-register` 只供第一次需要 API 授權時由使用者明確執行，日常更新不會重新申請權限。

## 本機設定

SDK 安裝於 `.local/taishin-nova/node_modules/taishin-sdk`。使用 `scripts/setup-taishin-nova-credentials.ps1` 選擇 `.pfx` 或 `.p12` 備份檔，並在獨立的本機視窗輸入台新登入資料。腳本會把加密內容放在：

```text
.local/taishin-nova/credentials
```

不要把實際值填入 `.env.example`，也不要在對話、前端設定頁或公開部署環境輸入證券帳密。明文環境變數僅保留為無人值守主機的進階相容方式，本機預設不使用。

## 驗證與更新

```text
pnpm data:taishin-check
pnpm data:refresh
```

第一個指令只輸出快照日期與上市、上櫃筆數，不輸出帳號、權杖或憑證內容。第二個指令把 Nova 當日快照合併進既有歷史 K 線，再重新執行軍師雷達掃描。

GitHub Actions 的每日時間為台北時間 13:45（UTC 05:45）。雲端排程沒有個人證券憑證時會安全退回證交所與櫃買中心的官方盤後行情；Nova 即時更新由持有憑證的本機執行。
