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
| 景點 | `page-spots` | spot-card（含 Supabase 評分按鈕） |
| 照片 | `page-photos` | polaroid 軟木板（無照片時顯示「照片規劃中」提示） |

### 行程項目類型 badge
- `itype-食`（餐廳/美食）、`itype-動`（活動/景點/交通）、`itype-宿`（住宿）

### 主題色系規範
每個旅程有獨立主題色，核心變數為 `--pea` / `--pea-dark` / `--pea-light` / `--pea-bg`：
- 範例：南投(綠)、紐西蘭(藍)、台南(琥珀金)、台中(森林綠)、漢來(暖金)

### Supabase 評分系統
- `ITEM_PREFIX`：格式為 `{tripkey}__`（例：`tainan2026__`）
- `injectRateButtons()`：自動為每個 `.itinerary-card` 和 `.spot-card` 注入評分按鈕
- 評分底部彈窗：`.rate-sheet-bg` + `.rate-sheet`（在 `.pages` 內）
- 每個景點/行程項目只有單一整體評分（星星＋留言），沒有拆品項或菜單的機制

### 參考實作
`20260522_24/260522南投.html`（最完整範本，含照片牆）

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
- `trips.json`：所有旅程資料（含 photos、spots、itemPrefix）
- `itemPrefix` + spot name = Supabase `trip_id` rating key
- 新增旅程時 trips.json 與對應 HTML 頁面都要同步更新
