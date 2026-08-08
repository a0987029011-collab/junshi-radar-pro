# Vercel 部署說明

## 專案類型

此 repository 為 Next.js 16 應用程式，使用 `pnpm` 管理套件。Vercel 可直接匯入並部署此專案。

## 主要設定

已建立 `vercel.json`，包含：

- `framework: "nextjs"`
- `installCommand: "pnpm install --frozen-lockfile"`
- `buildCommand: "pnpm build"`

這表示 Vercel 會使用 pnpm 安裝套件，並執行 Next.js build。

## Vercel 專案設定

在 Vercel UI 中設定以下項目：

- Git provider: GitHub
- Repository: 此專案
- Framework preset: Next.js
- Install Command: `pnpm install --frozen-lockfile`
- Build Command: `pnpm build`
- Output Directory: 留空
- Node Version: `22.x`

## Vercel 匯入流程

1. 登入 Vercel 並點選 **New Project**。
2. 選擇 GitHub provider，並授權 Vercel 存取你的 repository（若尚未授權）。
3. 在 repository 列表中選擇 `junshi-radar-pro`，點選 **Import**。
4. 在設定畫面確認：
   - Install Command: `pnpm install --frozen-lockfile`
   - Build Command: `pnpm build`
   - Output Directory: 留空
   - Node Version: `22.x`
   - Framework Preset: Next.js
5. 啟用自動部署：確保 `main` 分支已啟用自動部署。
6. 點選 **Deploy**，讓 Vercel 啟動第一次建置。

部署完成後，可在 Vercel Dashboard 檢查最新 deployment 的 build log，以及訪問以下路由驗證：

- `/`
- `/stocks/[symbol]`
- `/api/radar`

## 環境變數

Vercel 部署本身不需要 `FUGLE_API_KEY`，因為每日資料由 GitHub Actions 產生並將 `data/radar-snapshot.json` 提交到 `main`。

如果你仍想在 Vercel 端設定，可選：

- `MARKET_DATA_PROVIDER=auto`
- `DATA_TIMEZONE=Asia/Taipei`

但這不是必需的。

## 資料來源與自動部署流程

- `data/radar-snapshot.json` 是靜態快照資料，前端直接從這個文件讀取。
- GitHub Actions 工作流程位於 `.github/workflows/update-radar.yml`。
- 這個 workflow 會每日更新快照並提交到 `main`，Vercel 會偵測到 commit 後自動部署。

## 部署驗證

成功部署後，可檢查以下幾個路由：

- `/`
- `/stocks/[symbol]`
- `/api/radar`

如果所有路由正常顯示，表示部署成功。

## 注意

- 專案依賴靜態快照，不會在 Vercel runtime 中動態請求富果 API。
- `FUGLE_API_KEY` 只需要在 GitHub Actions 中配置，不需放在 Vercel 環境變數。
