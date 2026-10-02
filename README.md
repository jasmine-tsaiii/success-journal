# 成功日記 Success Journal

願景板拼貼 × 成功日記：把想要的生活放在眼前，再每天記錄 3 件往前的成功小事，搭配溫柔的肯定語。
為 Jasmine（天使靈氣與脈輪解讀療癒師）的客人與學員設計的手機網頁 App（PWA），可以加到手機主畫面、離線使用。

網址：<https://success.jas-soul.com/>

## 功能

- **整體風格**：日系雜誌感——米色紙紋、明朝體標題、英文小標、細線與留白。內建思源宋體與 Cormorant Garamond（放在 App 裡，不連外部服務），每支手機看起來都一樣。
- **淺色／深色模式**：淺色是米色紙，深色是星夜藍配金色；可在「設定 → 外觀」選擇，或跟隨系統。
- **願景板**：第一次進入就開好一張預設的「封面」願景板，**點空白的照片格就能從相簿放照片**。
  - **雜誌版型**：封面（1 張大照片）、格狀（6 格）、編輯頁（直書標題＋3 張照片）。換版型時照片會依序搬進新的格子，自己改過的標題與願望清單也會保留。
  - **色調**：淺色（米色底）霧粉、奶茶、灰豆綠、霧藍、灰紫、赤陶；深色（夜空底＋星點）星夜、紫色星雲、極光、黑曜。換色調時整張板子一起換色。
  - **文字**：大標、內文、英文斜體、標籤、直書，附中英文靈感詞句。
  - **素材**：紙膠帶、圓形印章（含英文環形字）、星號、星芒、植物線稿、太陽、月、心、對焦框、箭頭、郵票框，顏色跟著色調變化。
  - **自己調整**：單指拖曳移動，雙指縮放與旋轉；也可用按鈕放大、縮小、旋轉、移到最上層、換照片、加白框、刪除，並可「復原」。
  - **存成手機桌布**：輸出 1080 × 1920 PNG（含紙紋與星點）。手機上會開啟分享選單（可直接存到相簿），電腦上則直接下載。
  - 照片會先壓縮（長邊最多 1600px）再存在裝置的 IndexedDB，不會上傳。
- **每日三件成功小事**：自動儲存，可切換日期補寫或修改過去的紀錄（不能寫未來的日期）。寫滿三件後可以按「＋ 再寫一件」，最多十件。
- **你的稱呼**：在「設定 → 個人化」填寫，會出現在今日頁標題與分享卡片上；第一次用 Google 登入時會先帶入 Google 帳號的名字。登入時稱呼會存在帳號上（Supabase 使用者資料 `sj_display_name`），換裝置登入也一樣。
- **尚未登入提醒**：沒登入時，今日頁頂端會顯示「尚未登入」提示，點了前往設定頁登入，避免在新裝置上以為資料不見了。
- **引導問題可以作答**：今日頁的 Prompt 下方可以寫下回答（選填），只回答問題也算一天的紀錄，回顧與文字檔匯出都看得到。
- **標籤分類**：正在寫的那一件下方會出現一排可左右滑動的標籤，點一下就選（鍵盤不會收起），最後的「＋ 自訂」可直接新增。每件成功可點選標籤（預設：工作、生活、人際、健康、學習、自我照顧），也能自訂，或直接在文字裡打 `#標籤`（會自動加入標籤清單）。標籤可在「設定 → 標籤」新增或移除。
- **成功類型統計**：回顧頁依本週／本月／今年／全部，以橫條圖顯示各標籤的件數與比例、最多的是哪一類，並附近 4 個月的每月表格。
- **每日色彩與肯定語**：靈感來自七大脈輪，依星期輪替（週一海底輪・紅 … 週日頂輪・紫）。今日頁以肯定語為主角，脈輪名稱以小字呈現，可在「設定」中關閉，只保留色彩與肯定語。每個脈輪有 6 句肯定語、3 個引導問題，隨週次輪替。
- **月曆回顧**：有紀錄的日子以當天的色彩圓點標記，點選可看當天內容並進入編輯；顯示連續記錄天數、累積成功件數、已記錄天數與最長連續紀錄。
- **會員與雲端同步（選用）**：在「設定 → 帳號與雲端同步」用 Google 帳號登入後，日記、標籤、願景板與照片會自動同步到雲端（Supabase），換手機登入同一個帳號就能找回。兩台裝置改到同一天時，以最後修改的為準。不登入也能照常使用。可以隨時登出（本機資料保留）或刪除帳號與雲端資料。
- **分享今天的小成功**：寫下成功後，先預覽卡片再分享，可一鍵做成 IG 限時動態尺寸（1080 × 1920）的卡片，含日期、三件成功、肯定語與當日色彩。手機上開啟分享選單（可直接分享到 IG、LINE 或存到相簿），電腦上直接下載。
- **新手引導**：第一次開啟時以 3 個畫面介紹寫法、願景板與加到主畫面的方法（依 iPhone／Android 顯示對應步驟），可略過；已有紀錄的使用者不會看到。
- **備份提醒**：沒有登入時，記錄滿 3 天還沒備份、或距離上次備份超過 14 天時，首頁會出現小提醒，按「立即備份」就能存到雲端（手機上開啟分享選單，可選 iCloud 雲碟、Google 雲端硬碟、LINE 傳給自己）；按 × 會在 3 天後再提醒。設定頁顯示上次備份日期。
- **備份與還原**：下載 JSON 備份檔（含日記、願景板與照片）、從備份檔還原（同日期、同一個願景板以備份檔為準，其他保留；舊版備份檔也能匯入），以及匯出易讀的文字檔。有照片時備份檔會比較大（每張照片約數百 KB）。
- **隱私**：不需帳號也能使用；沒有登入時，日記與願景板版面存在瀏覽器的 localStorage，照片存在 IndexedDB，都不傳送到任何伺服器。只有在設定頁按 Google 登入時才會載入 Google 的登入元件。隱私權政策在 `app/privacy.html`。
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
  js/storage.js         本機儲存（日記、願景板版面、設定）
  js/board-core.js      願景板：色調、雜誌版型、文字排版、物件操作、備份驗證（純邏輯）
  js/board-render.js    願景板繪製（畫面與匯出桌布共用，含印章、星點、紙紋）
  js/board-ui.js        願景板編輯器（點格子加照片、手勢、版型、色調、文字、素材、存圖）
  js/images.js          照片壓縮與 IndexedDB 儲存
  js/share.js           分享卡片繪製、分享／下載檔案（含備份）
  js/config.js          Supabase 網址、publishable key、Google Client ID（都是可公開的值）
  js/cloud.js           Google 登入、與 Supabase 溝通（日記文件、照片、刪除帳號）
  js/sync.js            雲端同步流程（自動在背景同步）
  js/sync-core.js       同步的比對邏輯（純邏輯，有單元測試）
  privacy.html          隱私權政策
  js/stickers.js        內建素材（SVG，依色調換色）與文字靈感
  fonts/                內建字型（思源宋體常用字子集、Cormorant Garamond）
  sw.js                 Service Worker（離線快取）
  manifest.webmanifest
  icons/                App 圖示（由 scripts/make-icons.mjs 產生；換設計時請一併換檔名，手機才會更新）
tests/                  單元測試與端對端測試
scripts/make-icons.mjs  產生 App 圖示（米色底＋印章「成」）
scripts/make-og.mjs     產生社群分享預覽圖
scripts/make-fonts.py   產生內建字型子集
.github/workflows/      自動部署與測試
supabase/schema.sql     Supabase 資料表、權限與照片空間（在 SQL Editor 執行）
```

所有路徑都是相對路徑，因此部署在 `/success-journal/` 子路徑或任何其他路徑都能運作。

## 啟用 GitHub Pages（只需設定一次）

1. 到 GitHub 上的 repository，點 **Settings → Pages**。
2. 在 **Build and deployment → Source** 選擇 **GitHub Actions**。
3. 把這個 pull request 合併到 `main`。之後每次推送到 `main`，GitHub Actions 會先跑測試，再自動把 `app/` 資料夾部署到 GitHub Pages。
4. 到 **Actions** 分頁查看「Deploy to GitHub Pages」完成後，網站就在 `https://<你的 GitHub 帳號>.github.io/success-journal/`。
   也可以在 Actions 分頁手動執行（Run workflow）重新部署。

> 若 repository 是私人的，GitHub Pages 需要付費方案；公開的 repository 可免費使用。

## 會員與雲端同步的設定

1. **Supabase**：建立專案後，到 SQL Editor 執行 `supabase/schema.sql`（建立 `journal_docs` 資料表、每人只能讀寫自己資料的權限、刪除帳號功能，以及不公開的 `photos` 照片空間）。
2. **Google Cloud**：建立 OAuth 用戶端（網頁應用程式），「已授權的 JavaScript 來源」加入網站網址（例如 `https://success.jas-soul.com`）與 `http://localhost:8080`。
3. **Supabase → Authentication → Sign In / Providers → Google**：開啟並填入 Client ID 與 Client Secret。
4. 把 Supabase 網址、publishable key 與 Google Client ID 填進 `app/js/config.js`。**secret／service_role key 絕對不要放進程式碼。**

登入使用 Google 官方的登入按鈕，直接在我們的網頁取得 Google 憑證再交給 Supabase，所以 Google 授權畫面顯示的是我們的網址，不是 Supabase 的網址。
在 Google Cloud 的「品牌」頁填好應用程式名稱、logo（`app/icons/google-logo-120.png`）、首頁與隱私權政策網址（`https://success.jas-soul.com/privacy.html`）並通過品牌驗證後，授權畫面會顯示「成功日記」。

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

- 沒有登入時，資料只存在自己的手機瀏覽器中，無法幫忙找回；建議用 Google 帳號登入，自動同步到雲端。
- 換手機、清除瀏覽器資料或刪除 App 前，請先到「設定」頁按「立即備份」（建議存到雲端硬碟或寄給自己），到新手機後再「從備份檔還原」。
- 在 iPhone 上，從主畫面開啟的 App 和在 Safari 中開啟的網頁，資料是分開存放的，建議固定用主畫面的 App 書寫。

## 本機開發與測試

需要 Node.js 22 以上。

```bash
npm start            # 在 http://localhost:8080 預覽（使用 serve）
npm test             # 單元測試（不需安裝任何套件）
npm install          # 安裝 Playwright（端對端測試、產生圖示用）
npx playwright install chromium
npm run test:e2e     # 以 Chromium 測試主要流程（含 /success-journal/ 子路徑、願景板、匯出匯入、離線）
npm run icons        # 重新產生 App 圖示（設計寫在 scripts/make-icons.mjs）
npm run og           # 重新產生分享預覽圖
npm run fonts        # 修改介面文字後重新產生字型子集（需要 Python 的 fonttools、brotli 與網路）
```

### 社群分享預覽圖

分享連結到 LINE、Facebook 時顯示的預覽圖是 `app/og-image.png`（1200 × 630），由 `npm run og` 產生（使用 App 內建字型）。
**換成自訂網域後**，請把 `app/index.html` 中 `og:url` 與 `og:image` 的網址改成新網域。LINE、Facebook 會快取舊的預覽，可用 [Facebook 分享偵錯工具](https://developers.facebook.com/tools/debug/) 重新抓取。

### 內建字型

`app/fonts/` 裡的字型由 `npm run fonts` 產生（SIL Open Font License）：
- 思源宋體 500：Big5 常用字（約 5,400 字）＋介面用字，約 1.1 MB，第一次開啟後會被快取，離線也能用。不在常用字內的罕用字會以手機內建字型顯示。
- 思源宋體 700：只含介面標題用到的字。**修改介面文字（尤其是標題）後，請重新執行 `npm run fonts`**，否則新的粗體字會用手機內建字型顯示。
- Cormorant Garamond：英文小標，已改成等高的現代數字。

### 修改素材、版型與色調

- 素材與靈感詞句：`app/js/stickers.js`。SVG 中的 `{accent}`、`{ink}`、`{block}`、`{tape}` 會依色調換色。
- 版型與色調：`app/js/board-core.js` 的 `TEMPLATES`／`PALETTES`。版型以 1080 × 1920 座標設計。

### 修改文案

脈輪的引導問題與肯定語都在 `app/js/chakras.js`，直接編輯即可（每個脈輪至少保留 5 句肯定語）。
`npm test` 會檢查每個脈輪的肯定語數量，以及文案中沒有「治療、療效」等醫療用語。

### 發布更新

更新網站檔案後，建議把 `app/sw.js` 中的 `VERSION`（例如 `v1` → `v2`）加一，讓已安裝的使用者更快取得新版。使用者的日記資料不受影響。
