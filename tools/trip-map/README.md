# 行程地圖建置工具（Google 互動地圖）

在各行程頁面的「交通」分頁產生／更新一張 **Google Maps 互動地圖**：
標記（依類別著色）、每日路線切換、InfoWindow、原生全螢幕。Config 驅動、無外部相依。

## 已設定的行程

| config | 頁面 | 天數 |
|---|---|---|
| `penghu`  | `20260709_13/260709澎湖.html` | 4 |
| `nantou`  | `20260522_24/260522南投.html` | 3 |
| `hsinchu` | `20260612_13/260612新竹.html` | 2 |

## 金鑰

金鑰放在 `gkey.js`（已 gitignore，不進版控）：

```js
// tools/trip-map/gkey.js
module.exports = '你的_GOOGLE_MAPS_API_KEY';
```

> 金鑰仍會出現在產生的 HTML（client-side Maps 的必然）。請到 Google Cloud Console
> 將其限制為：**HTTP referrer = 你的網域** ＋ **僅 Maps JavaScript API**。

## 重新產生 / 新增

```bash
cd tools/trip-map
node build.js <config>      # 例：node build.js nantou
```

- 首次會自動在交通頁插入地圖 scaffold（`#gmap` + 每日 tabs）與 Maps API 載入。
- 之後只更新 `<!--TRIPGMAP-->…<!--/TRIPGMAP-->` 之間的資料與初始化腳本。

### 新增一個行程

1. 頁面需有 app-shell 的交通頁（`<!-- PAGE: 行程 -->` 之前會自動插入）。
2. 新增 `configs/<name>.js`：
   - `htmlFile`：頁面相對路徑
   - `spots`：`{ n 名稱, lon 經度, lat 緯度, t 類別(spot|food|stay|air), d:[所屬天] }`
   - `routes`：每天依景點名稱串接（單點則不畫路線）
   - `dayCols`：每天路線顏色（0xRRGGBB）
3. `node build.js <name>`。

> 每日路線為各景點的直線連接（非實際道路）。要實際開車路線可改用 Directions API。
