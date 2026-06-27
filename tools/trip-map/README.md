# 行程地圖建置工具（config 驅動）

用**真實鄉鎮市區界**（[`taiwan-atlas`](https://www.npmjs.com/package/taiwan-atlas)）產生每個行程頁面「交通」分頁裡的兩張地圖：

- **3D 立體路線地圖**（three.js）：真實地形、每日路線切換、可旋轉/縮放/平移、放大檢視
- **手繪 SVG 地圖**：真實輪廓 + 地名 + 分類圓點 + 圖例 + 指北針

支援**沿海**（藍色海洋，如澎湖）與**內陸**（綠色平原 + 起伏地形，如南投／新竹）。

> 共用的 three.js（r128）放在 repo 根目錄 `lib/`，各頁面以 `../lib/` 參照。

## 已設定的行程

| config | 頁面 | 類型 |
|---|---|---|
| `nantou` | `20260522_24/260522南投.html` | 內陸（埔里/魚池/仁愛） |
| `hsinchu` | `20260612_13/260612新竹.html` | 內陸（新竹市） |

（澎湖另由 `tools/penghu-map/` 產生，為最初版本。）

## 重新產生地圖

```bash
cd tools/trip-map
npm install
node build.js nantou      # 或 hsinchu
```

`build.js` 會讀 `configs/<name>.js`，把資料注入 `map.template.js`，並寫回該頁面
`<!--TRIPMAP3D-->…<!--/TRIPMAP3D-->` 與 `<!--TRIPMAPSVG-->…<!--/TRIPMAPSVG-->` 之間。

## 新增一個行程

1. 頁面要先有 scaffold（CSS、`#map3dHolder`、`#svgMapBox`、`../lib/` 兩支 script、
   兩組標記、zoom overlay）。可參考既有頁面，或用 `scaffold` 流程（見 git 紀錄）。
2. 新增 `configs/<name>.js`：
   - `county` / `townships`：taiwan-atlas 的縣市與鄉鎮市區名稱
   - `unions`：要合併成同一陸塊的鄉鎮（例：新竹市三區 → 一塊）
   - `inland`：內陸 `true`（綠平原）／沿海 `false`（藍海）
   - `bridgeBetween`：沿海可指定兩陸塊畫橋（取最近點）
   - `spots`：`{ n 名稱, lon 經度, lat 緯度, t 類別(spot|food|stay|air), d:[所屬天] }`
   - `routes`：每天依景點名稱串接（單點則不畫路線）
   - `dayNames` / `dayCols`、`title`、`islandNames`、`seaColor`、`islandFill`、`epsilon`、`targetW`
3. `node build.js <name>`。

## 處理流程（build.js）

1. 解 TopoJSON → 取指定鄉鎮，各取主要陸塊（過濾離島小礁）。
2. `unions` 指定的鄉鎮以 `polygon-clipping` 聯集成單一陸塊。
3. Douglas–Peucker 簡化海岸／界線（`epsilon`，單位為度）。
4. 等距投影置中、縮放到 `targetW`；景點以經緯度同投影定位。
5. 產生 3D IIFE（`map.template.js` + 資料 + `CFG`）與 SVG，寫回頁面標記區段。
