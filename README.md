# 我們的旅行手帳 🌿

## 📂 檔案結構

```
travel-site/
├─ index.html              ← 主頁（行事曆+列表，不要動）
├─ trips.json              ← 旅行索引（每次新增旅行手動加一筆）
├─ template.html           ← 旅行 HTML 範本（複製來改）
├─ 260522南投.html          ← 南投旅行（已完成的範例）
└─ README.md
```

---

## 🎯 新增旅行的 3 步驟

### Step 1: 用 Cursor 複製 template.html

```
複製 template.html → 改名為 旅行ID.html（例：kyoto-2027.html）
```

### Step 2: 對 Cursor 說話

例如：
> 幫我把這份 HTML 改成 2027年4月3-7日的京都賞櫻旅行，2 人，預算 8 萬，行程包括清水寺、嵐山、伏見稻荷大社⋯⋯

Cursor 會自動替換 `{{XXX}}` placeholder。

或者你也可以參考 `260522南投.html` 當作完整範例。

### Step 3: 更新 trips.json

打開 `trips.json`，在 `trips` 陣列加一筆：

```json
{
  "trips": [
    {
      "id": "nantou-2026",
      "title": "南投仁愛深山秘境",
      "startDate": "2026-05-22",
      "endDate": "2026-05-24",
      "destination": "南投・仁愛鄉",
      "people": 2,
      "status": "planning",
      "tags": ["深山", "秘境"],
      "file": "260522南投.html"
    },
    {
      "id": "kyoto-2027",
      "title": "京都春櫻五日",
      "startDate": "2027-04-03",
      "endDate": "2027-04-07",
      "destination": "日本・京都",
      "people": 2,
      "status": "planning",
      "tags": ["賞櫻", "古蹟"],
      "file": "kyoto-2027.html"
    }
  ]
}
```

完成！打開 index.html，行事曆 2027/4/3-7 會自動變成綠色按鈕。

---

## 📋 trips.json 欄位說明

| 欄位 | 必填 | 說明 |
|---|---|---|
| `id` | ✅ | 唯一識別碼（英數+連字號），例：`kyoto-2027` |
| `title` | ✅ | 旅行名稱 |
| `startDate` / `endDate` | ✅ | 日期 `YYYY-MM-DD` 格式 |
| `destination` | ✅ | 目的地 |
| `people` | ✅ | 人數 |
| `status` | ✅ | `planning` 計畫中 / `done` 已完成 |
| `tags` | ⬜ | 標籤陣列，會顯示在卡片上 |
| `file` | ✅ | 對應的 HTML 檔名 |

---

## 🌐 部署到 GitHub Pages（建議）

1. [github.com](https://github.com) 註冊 → New repo（Public）
2. 上傳整個 `travel-site` 內容
3. Settings → Pages → main / root → Save
4. 得到網址 `https://你的帳號.github.io/repo名稱`
5. 加入手機書籤完成！

之後新增旅行：在電腦用 Cursor 做好 HTML → 上傳到 repo → 編輯 trips.json → 等 30 秒 → 重整網站

---

## 🛠️ 本機測試

雙擊 `index.html` 開啟**會失敗**（瀏覽器安全限制無法讀 JSON）。

請用 Python 啟動本地伺服器：

```bash
cd travel-site
python3 -m http.server 8000
```

然後打開 [http://localhost:8000](http://localhost:8000)

---

## 🎨 想換主題色

每一份旅行 HTML 開頭都有：

```css
:root {
  --pea-dark: #6B8348;       /* 主色 */
  --rose: #C97A6E;           /* 強調色 */
  /* ... */
}
```

例如做京都賞櫻旅行可以把 `--pea` 系列換成櫻花粉，整頁就會變成粉色主題。

---

享受記錄每段旅行的過程 💛
