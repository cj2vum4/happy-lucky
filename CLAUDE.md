# happy-lucky 專案慣例

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

## 資料來源
- `trips.json`：所有旅程資料（含 photos、spots、itemPrefix）
- `itemPrefix` + spot name = Supabase `trip_id` rating key
- 新增旅程時 trips.json 與對應 HTML 頁面都要同步更新
