# happy-lucky 專案慣例

## 行程頁架構（所有出遊一律使用此格式）
所有旅程 HTML 頁面一律使用 **mobile app-shell 風格**（同 `20260522_24/260522南投.html`）：

### 必備結構
- `.app`：max-width 430px，flex column，height 100%，`overflow: hidden`
- `app-header`：固定頂部（60px），含 `‹` 返回首頁連結 + 標題 + 日期
- `.pages`：flex:1，`overflow: hidden`，內含多個 `.page`（絕對定位，切換顯示）
- `.tab-bar`：固定底部（72px），5 個 tab：總覽 / 交通 / 行程 / 景點 / 照片
- `#photoOverlay` + `#photoRefreshBtn`：放在 `.app` **外部**

### 5個頁面
| 頁面 | id | 內容 |
|------|----|------|
| 總覽 | `page-home` | cover-card、warn-card（注意事項）、budget 預算 |
| 交通 | `page-traffic` | transport-card 交通方式 |
| 行程 | `page-itinerary` | day-tab-btn + day-panel + itinerary-list |
| 景點 | `page-spots` | 旅途開支評分（記帳連動）＋ spot-card 景點介紹 |
| 照片 | `page-photos` | polaroid 軟木板（無照片時顯示「照片規劃中」提示） |

### 行程項目類型 badge
- `itype-食`（餐廳/美食）、`itype-動`（活動/景點/交通）、`itype-宿`（住宿）

### 主題色系規範
每個旅程有獨立主題色，核心變數為 `--pea` / `--pea-dark` / `--pea-light` / `--pea-bg`：
- 範例：南投(綠)、紐西蘭(藍)、台南(琥珀金)、台中(森林綠)、漢來(暖金)

### 共用模組（assets/，六個旅程頁都吃這一份）
旅程頁的「景點卡片、評分系統、polaroid 照片牆、lightbox」全部由共用模組提供，**不要在各頁複製這些程式碼**：
- `assets/trip-page.css`：景點卡片/評分按鈕/評分彈窗/照片牆樣式（用 CSS 變數，自動套各頁主題色）
- `assets/trip-page.js`：讀 `trips.json` → 渲染 `#spotList` 景點卡片（不可評分）、旅途開支評分清單與底部彈窗、產生照片牆
- 頁面只需要：head 放 `<link rel="stylesheet" href="../assets/trip-page.css">`；`#page-spots` 內放標題＋`<div id="spotList"></div>`；`#page-photos` 內放 `<div class="photo-wall" id="photoWall"></div>`；`</body>` 前放 `<script>window.TRIP_ID = '{trips.json 的 id}';</script>` ＋ `<script src="../assets/trip-page.js" defer></script>`
- 行程（itinerary）時間軸是每頁獨有內容，仍寫在各頁 HTML（不可評分）
- 總覽頁若放 `<div id="ledgerBudget"></div>`，共用 JS 會用旅行日期內的記帳自動算「實際花費」（總額＋依分類列出，只讀不改記帳）；已結束的旅程建議用這個取代手寫預算

### 評分系統（記帳支出連動）
- **可評分的是「旅行期間的記帳支出」，景點（spots）與行程時間軸都不能評分**（不要再替 `.itinerary-card` / `.spot-card` 加評分按鈕）
- 旅程頁「景點」分頁上方的「💸 旅途開支評分」由 `assets/trip-page.js` 讀 `ledger_entries`（日期落在 trip 的 startDate–endDate）產生
- 首頁「查詢」**只收記帳時主動勾「加入查詢評分」（note 以 `#spot` 結尾）的支出**，旅行期間的記帳不會自動加入
- `#spot` 記帳的地區存成 `店名|縣市 區#spot`（例：`西羅殿|台南市 北區#spot`）；舊資料只有區名時，查詢頁用「唯一縣市」或「記帳日期所在旅程」推斷縣市，推斷不出來只出現在「全部」
- 查詢彈窗：記帳日期落在某趟旅行內 → 同時有「行程頁」「記帳頁 ?date=」可選；否則只有記帳頁。評論存在 `trip_reviews`，**不會改動記帳資料**
- 評論 key：旅程頁的一般支出 `exp__{ledger id}`；勾選加入查詢的支出 `food__{name}`（同名合併）
- **行程的任何內容（景點、住宿、美食、trips.json spots）都不會出現在查詢頁**，舊的景點評分 `{itemPrefix}{spot name}` 也不再顯示
- 角色 H / L：存在 comment 開頭 `[H] ` / `[L] `，送出前必選（預設帶入該裝置上次選的角色）
- 長按評論刪除：先嘗試 DELETE，權限不足時寫入刪除標記 `comment = '#del:{被刪那筆 id}'`；讀取一律經 `HLReviews.fold()` 過濾
- 共用邏輯在 `assets/reviews.js`（`window.HLReviews`），index 與旅程頁都用它，不要各自重寫

### 首頁分頁
- 一般模式：首頁／行事曆／查詢／想去；首頁不再顯示回憶相簿
- 點「N 趟旅行」統計卡 → 切換成「返回／行程／相簿」：行程＝已去行程（status done）條列＋進入按鈕；相簿＝原回憶相簿

### PWA
- `manifest.json`＋`assets/icon-*.png`（情侶插畫）；index/account/各旅程頁 head 都掛了 manifest 與 theme-color
- `icon-512-maskable.png` 必須留安全邊距（內容縮到約 78%），否則 Android 圓形遮罩會裁掉頭髮/帽緣；不可直接複製 `icon-512.png`
- `sw.js`＋`offline.html`：有 service worker（離線可看＋新版本提示更新），改版時記得同步 sw.js 內的 cache 版本號

### 參考實作
`20260522_24/260522南投.html`（最完整範本，含 bgm 與 Google 地圖）

---

## 照片區樣式
所有照片展示頁一律使用 **polaroid 散落風格**（同 `20260520/260520天使仙境.html`）：
- 軟木板背景（`#c9a87c` + radial-gradient 紋理）
- 照片以 `.polaroid` 絕對定位，帶隨機旋轉與入場動畫
- 點擊照片 → 飛走消失（removePhoto animation）
- 長按照片 → lightbox 放大
- 右下角 ↺ 按鈕 → 重新散落
- 參考實作：`20260520/260520天使仙境.html`

## Git Push 流程
proxy 為 read-only，寫入需使用 PAT：
```bash
git remote set-url origin "https://cj2vum4:<PAT>@github.com/cj2vum4/happy-lucky.git"
git push origin main
git remote set-url origin "http://local_proxy@127.0.0.1:43657/git/cj2vum4/happy-lucky"
```
推完後必須還原 remote URL。

**每次變更 commit 後一律自動推到 `main`**（開發分支推完後直接 fast-forward `main` 並推上去，不需另外詢問）；GitHub Pages 部署偶爾會間歇性失敗（deploy 步驟回報 "Deployment failed, try again later."），失敗時推一個空白 commit 重試即可。

## 資料來源
- `trips.json`：**景點（spots）與照片（photos）的唯一資料來源**，旅程頁的景點卡片與照片牆都由它產生，不要再把景點寫死在 HTML 裡
- `itemPrefix` + spot name = 舊版景點評分 key（已停用，查詢頁不再顯示；資料仍留在 trip_reviews）
- 新增旅程：trips.json 加一筆（含 id/itemPrefix/spots/photos）＋建立行程頁 HTML（referencing 南投頁的結構），頁尾 `window.TRIP_ID` 填 trips.json 的 id
- 例外：`20260520/260520天使仙境.html` 是舊格式紀念頁，不吃共用模組，維持原樣

## 想去清單（index.html「想去」分頁）
- 資料存在 Supabase `trip_reviews` 表：`trip_id = 'wish__{itemId}'`、`comment` = JSON 事件，**沒有另開資料表**
- insert-only 事件流：`{t:'add', name, city, cat, ig, note}` / `{t:'done', v:true|false}` / `{t:'del'}`，讀取時依 `created_at` 升冪折疊出最新狀態，不需要 UPDATE/DELETE 權限
- `wish__` 開頭的資料不會進任何評分統計（評分查詢都用明確前綴或精準名稱比對）
- `cat` 只有兩種：`食物`（預設）／`景點`；`city` 自由填寫，清單有 2 個以上城市時自動長出城市篩選 chips
