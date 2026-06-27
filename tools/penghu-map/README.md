# 澎湖地圖建置工具

產生 `20260709_13/260709澎湖.html`「交通」頁裡的兩張地圖：

- **3D 立體路線地圖**（three.js）：真實海岸線高度場、每日路線切換、可旋轉/縮放/平移
- **手繪 SVG 地圖**：同一份真實海岸線輪廓 + 島名 + 分類圓點 + 圖例 + 指北針

兩張地圖的島形都來自**真實地理資料**，而非手工估的形狀。

## 資料來源

[`taiwan-atlas`](https://www.npmjs.com/package/taiwan-atlas)（內政部鄉鎮市區界 TopoJSON）。
只取澎湖本島群的四個鄉鎮市：**馬公市、湖西鄉、白沙鄉、西嶼鄉**；
望安鄉、七美鄉等離島不納入。

## 處理流程（`build_geo.js`）

1. 用 `topojson-client` 把 TopoJSON 解成 GeoJSON。
2. 各鄉鎮取面積最大的陸塊（過濾吉貝、虎井、桶盤等離島小礁）。
3. 用 `polygon-clipping` 把**馬公市 + 湖西鄉**聯集成「本島」。
4. Douglas–Peucker 簡化海岸線（`EPS`，單位為度）。
5. 等距投影（以群島中心為原點）轉成地圖座標 `x`（東+）/`z`（南+），
   並置中、縮放到目標寬度。
6. 景點以近似經緯度（`SPOTS` 陣列）用同一投影定位。
7. 「跨海大橋」取白沙↔西嶼兩島最近的一對座標。
8. 輸出：
   - `inject_3d.txt`：3D 用的 `POLYS` / `SPOTS` / `BRIDGE`
   - `svg_block.txt`：手繪 SVG 地圖整段
   - `geo_out.json`：除錯用

`splice.js` 再把上述資料注入 `map3d.template.js`（3D 腳本模板，內含
`/*__POLYS__*/`、`/*__SPOTS__*/`、`/*__BRIDGE__*/` 佔位），並把產出的
3D 腳本與 SVG 寫回 HTML 對應區段。

## 重新產生地圖

```bash
cd tools/penghu-map
npm install
npm run build      # = node build_geo.js && node splice.js
```

完成後 `20260709_13/260709澎湖.html` 會被就地更新。

## 要改什麼

- **景點位置 / 新增景點**：編輯 `build_geo.js` 裡的 `SPOTS`（`[名稱, 經度, 緯度, 類別, [所屬天]]`），類別為 `air|stay|food|spot`。
- **路線**：編輯 `map3d.template.js` 裡的 `ROUTES`（依景點名稱串接）。
- **海岸線精細度**：調 `build_geo.js` 的 `EPS`（越小越細、頂點越多）。
- **地形外觀 / 配色 / 相機**：`map3d.template.js`（`BASE`/`RAMP`/`HILL`、著色、相機）。

> three.js（`20260709_13/lib/three.min.js`、`OrbitControls.js`）為 r128，
> 已隨頁面附在 repo 內，不依賴 CDN。
