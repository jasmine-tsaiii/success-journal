# 成功日記 Success Journal

夢想板拼貼 × 成功日記：把想要的生活放在眼前，再每天記錄 3 件往前的成功小事，搭配溫柔的肯定語。
為 Jasmine（天使靈氣與脈輪解讀療癒師）的客人與學員設計的手機網頁 App（PWA），可以加到手機主畫面、離線使用。

網址（啟用 GitHub Pages 後）：`https://<你的 GitHub 帳號>.github.io/success-journal/`

## 功能

- **夢想板**：建立多個夢想板，放上手機相簿的照片、文字卡（紙卡／柔光／純文字，附靈感詞句）與 16 款內建素材貼紙，並可選 6 種背景。
  - **自己拼貼**：單指拖曳移動，雙指縮放與旋轉；也可用按鈕放大、縮小、旋轉、移到最上層、加上或取消相框、刪除。
  - **幫我排版**：三種風格（拼貼散落、整齊網格、主角置中），每按一次換一種排法；有「復原」可回到上一步，排好後仍可手動微調。
  - **存成手機桌布**：輸出 1080 × 1920 PNG。手機上會開啟分享選單（可直接存到相簿），電腦上則直接下載。
  - 照片會先壓縮（長邊最多 1600px）再存在裝置的 IndexedDB，不會上傳。
- **每日三件成功小事**：自動儲存，可切換日期補寫或修改過去的紀錄（不能寫未來的日期）。
- **每日色彩與肯定語**：靈感來自七大脈輪，依星期輪替（週一海底輪・紅 … 週日頂輪・紫）。今日頁以肯定語為主角，脈輪名稱以小字呈現，可在「設定」中關閉，只保留色彩與肯定語。每個脈輪有 6 句肯定語、3 個引導問題，隨週次輪替。
- **月曆回顧**：有紀錄的日子以當天脈輪色標記，點選可看當天內容並進入編輯；顯示連續記錄天數、累積成功件數、已記錄天數與最長連續紀錄。
- **備份與還原**：下載 JSON 備份檔（含日記、夢想板與照片）、從備份檔還原（同日期、同一個夢想板以備份檔為準，其他保留；舊版備份檔也能匯入），以及匯出易讀的文字檔。有照片時備份檔會比較大（每張照片約數百 KB）。
- **隱私**：不需帳號，日記與夢想板版面存在瀏覽器的 localStorage，照片存在 IndexedDB，都不傳送到任何伺服器，也不載入任何外部資源。首頁附有說明，提醒換手機前先備份。
- **PWA**：manifest、Service Worker、App 圖示；加到主畫面後可離線開啟。

文案僅作為自我覺察與書寫練習的陪伴，不涉及任何醫療或療效宣稱（「設定 → 關於」附有一句簡短聲明）。

## 專案結構

```
app/                    ← 實際部署的靜態網站
  index.html
  css/style.css
  js/app.js             介面與互動（今日、回顧、設定）
  js/core.js            日期、脈輪輪替、統計、備份格式（純邏輯）
  js/chakras.js         七大脈輪文案（名稱、代表色、引導問題、肯定語）
  js/storage.js         本機儲存（日記、夢想板版面、設定）
  js/board-core.js      夢想板：資料結構、自動排版、文字換行、備份驗證（純邏輯）
  js/board-render.js    夢想板繪製（畫面與匯出桌布共用）
  js/board-ui.js        夢想板編輯器（手勢、工具、素材、排版、存圖）
  js/images.js          照片壓縮與 IndexedDB 儲存
  js/stickers.js        內建素材貼紙（SVG）與文字靈感
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
   （Android 上 App 的「設定」頁也可能出現「安裝到主畫面」按鈕。）

加到主畫面後，即使沒有網路也能打開日記書寫。

### 給客人與學員的提醒

- 資料只存在自己的手機瀏覽器中，Jasmine 看不到，也無法幫忙找回。
- 換手機、清除瀏覽器資料或刪除 App 前，請先到「設定」頁下載備份檔（建議存到雲端硬碟或寄給自己），到新手機後再「從備份檔還原」。
- 在 iPhone 上，從主畫面開啟的 App 和在 Safari 中開啟的網頁，資料是分開存放的，建議固定用主畫面的 App 書寫。

## 本機開發與測試

需要 Node.js 22 以上。

```bash
npm start            # 在 http://localhost:8080 預覽（使用 serve）
npm test             # 單元測試（不需安裝任何套件）
npm install          # 安裝 Playwright（端對端測試、產生圖示用）
npx playwright install chromium
npm run test:e2e     # 以 Chromium 測試主要流程（含 /success-journal/ 子路徑、夢想板、匯出匯入、離線）
npm run icons        # 修改 app/icons/icon.svg 後重新產生 PNG 圖示
```

### 社群分享預覽圖

分享連結到 LINE、Facebook 時顯示的預覽圖是 `app/og-image.png`（1200 × 630），由 `npm run og` 產生（需要網路來載入思源宋體，字型只用於產生圖片）。
**換成自訂網域後**，請把 `app/index.html` 中 `og:url` 與 `og:image` 的網址改成新網域。LINE、Facebook 會快取舊的預覽，可用 [Facebook 分享偵錯工具](https://developers.facebook.com/tools/debug/) 重新抓取。

### 修改內建素材與文字靈感

夢想板的貼紙與靈感詞句在 `app/js/stickers.js`。貼紙是 `viewBox="0 0 100 100"` 的 SVG，新增一筆即可出現在「素材」中。

### 修改文案

脈輪的引導問題與肯定語都在 `app/js/chakras.js`，直接編輯即可（每個脈輪至少保留 5 句肯定語）。
`npm test` 會檢查每個脈輪的肯定語數量，以及文案中沒有「治療、療效」等醫療用語。

### 發布更新

更新網站檔案後，建議把 `app/sw.js` 中的 `VERSION`（例如 `v1` → `v2`）加一，讓已安裝的使用者更快取得新版。使用者的日記資料不受影響。
