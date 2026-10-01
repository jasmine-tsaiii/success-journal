# 成功日記 Success Journal

每天記錄 3 件成功小事，搭配七大脈輪主題與溫柔的肯定語。
為 Jasmine（天使靈氣與脈輪解讀療癒師）的客人與學員設計的手機網頁 App（PWA），可以加到手機主畫面、離線使用。

網址（啟用 GitHub Pages 後）：`https://<你的 GitHub 帳號>.github.io/success-journal/`

## 功能

- **每日三件成功小事**：自動儲存，可切換日期補寫或修改過去的紀錄（不能寫未來的日期）。
- **脈輪主題**：依星期輪替——週一海底輪、週二臍輪、週三太陽神經叢輪、週四心輪、週五喉輪、週六眉心輪、週日頂輪。每天顯示脈輪名稱、代表色、引導書寫問題與肯定語；每個脈輪有 6 句肯定語、3 個引導問題，隨週次輪替。
- **月曆回顧**：有紀錄的日子以當天脈輪色標記，點選可看當天內容並進入編輯；顯示連續記錄天數、累積成功件數、已記錄天數與最長連續紀錄。
- **備份與還原**：下載 JSON 備份檔、從備份檔還原（同日期以備份檔為準，其他日期保留），以及匯出易讀的文字檔。
- **隱私**：不需帳號，資料只存在使用者裝置的瀏覽器（localStorage），不傳送到任何伺服器，也不載入任何外部資源。首頁附有說明，提醒換手機前先備份。
- **PWA**：manifest、Service Worker、App 圖示；加到主畫面後可離線開啟。

文案僅作為自我覺察與書寫練習的陪伴，不涉及任何醫療或療效宣稱（App 內也附有說明）。

## 專案結構

```
app/                    ← 實際部署的靜態網站
  index.html
  css/style.css
  js/app.js             介面與互動
  js/core.js            日期、脈輪輪替、統計、備份格式（純邏輯）
  js/chakras.js         七大脈輪文案（名稱、代表色、引導問題、肯定語）
  js/storage.js         本機儲存
  sw.js                 Service Worker（離線快取）
  manifest.webmanifest
  icons/                App 圖示（icon.svg 為原始檔）
tests/                  單元測試與端對端測試
scripts/make-icons.mjs  由 icon.svg 產生 PNG 圖示
.github/workflows/      自動部署與測試
```

所有路徑都是相對路徑，因此部署在 `/success-journal/` 子路徑或任何其他路徑都能運作。

## 啟用 GitHub Pages（只需設定一次）

1. 到 GitHub 上的 repository，點 **Settings → Pages**。
2. 在 **Build and deployment → Source** 選擇 **GitHub Actions**。
3. 把這個 pull request 合併到 `main`。之後每次推送到 `main`，GitHub Actions 會先跑測試，再自動把 `app/` 資料夾部署到 GitHub Pages。
4. 到 **Actions** 分頁查看「Deploy to GitHub Pages」完成後，網站就在 `https://<你的 GitHub 帳號>.github.io/success-journal/`。
   也可以在 Actions 分頁手動執行（Run workflow）重新部署。

> 若 repository 是私人的，GitHub Pages 需要付費方案；公開的 repository 可免費使用。

## 加到手機主畫面

**iPhone／iPad（Safari）**
1. 用 Safari 開啟網址（其他瀏覽器在 iOS 上可能沒有此選項）。
2. 點畫面下方的「分享」按鈕（方框加向上箭頭）。
3. 選擇「加入主畫面」，再點「新增」。

**Android（Chrome）**
1. 用 Chrome 開啟網址。
2. 點右上角「⋮」選單，選擇「安裝應用程式」或「加到主畫面」。
   （Android 上 App 的「備份」頁也可能出現「安裝到主畫面」按鈕。）

加到主畫面後，即使沒有網路也能打開日記書寫。

### 給客人與學員的提醒

- 資料只存在自己的手機瀏覽器中，Jasmine 看不到，也無法幫忙找回。
- 換手機、清除瀏覽器資料或刪除 App 前，請先到「備份」頁下載備份檔（建議存到雲端硬碟或寄給自己），到新手機後再「從備份檔還原」。
- 在 iPhone 上，從主畫面開啟的 App 和在 Safari 中開啟的網頁，資料是分開存放的，建議固定用主畫面的 App 書寫。

## 本機開發與測試

需要 Node.js 22 以上。

```bash
npm start            # 在 http://localhost:8080 預覽（使用 serve）
npm test             # 單元測試（不需安裝任何套件）
npm install          # 安裝 Playwright（端對端測試、產生圖示用）
npx playwright install chromium
npm run test:e2e     # 以 Chromium 測試主要流程（含 /success-journal/ 子路徑、匯出匯入、離線）
npm run icons        # 修改 app/icons/icon.svg 後重新產生 PNG 圖示
```

### 修改文案

脈輪的引導問題與肯定語都在 `app/js/chakras.js`，直接編輯即可（每個脈輪至少保留 5 句肯定語）。
`npm test` 會檢查每個脈輪的肯定語數量，以及文案中沒有「治療、療效」等醫療用語。

### 發布更新

更新網站檔案後，建議把 `app/sw.js` 中的 `VERSION`（例如 `v1` → `v2`）加一，讓已安裝的使用者更快取得新版。使用者的日記資料不受影響。
