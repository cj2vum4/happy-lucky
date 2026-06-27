// 把 build_geo.js 產生的資料注入 3D 模板，並將 3D 腳本與 SVG 地圖
// 寫回澎湖頁面。流程：node build_geo.js → node splice.js
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const HTML = path.resolve(DIR, '../../20260709_13/260709澎湖.html');

// 1) 模板 + 注入資料 → 最終 IIFE
const tpl = fs.readFileSync(path.join(DIR, 'map3d.template.js'), 'utf8');
const inj = fs.readFileSync(path.join(DIR, 'inject_3d.txt'), 'utf8');
const pIdx = inj.indexOf('  const POLYS');
const sIdx = inj.indexOf('  const SPOTS');
const bIdx = inj.indexOf('  const BRIDGE');
if (pIdx < 0 || sIdx < 0 || bIdx < 0) { console.error('inject_3d.txt 缺少區段，請先執行 build_geo.js'); process.exit(1); }
const iife = tpl
  .replace('/*__POLYS__*/', inj.slice(pIdx, sIdx).trimEnd())
  .replace('/*__SPOTS__*/', inj.slice(sIdx, bIdx).trimEnd())
  .replace('/*__BRIDGE__*/', inj.slice(bIdx).trimEnd())
  .trimEnd();

const svg = fs.readFileSync(path.join(DIR, 'svg_block.txt'), 'utf8').trimEnd();

// 2) 寫回 HTML
let h = fs.readFileSync(HTML, 'utf8');

const s1 = h.indexOf('(function () {');
const e1 = h.indexOf('})();', s1) + 5;
if (s1 < 0 || e1 < 5) { console.error('找不到 3D IIFE 邊界'); process.exit(1); }
h = h.slice(0, s1) + iife + h.slice(e1);

const s2 = h.indexOf('<svg width="100%" viewBox="0 0 300 230"');
const e2 = h.indexOf('</svg>', s2) + 6;
if (s2 < 0 || e2 < 6) { console.error('找不到 SVG 地圖邊界'); process.exit(1); }
h = h.slice(0, s2) + svg + h.slice(e2);

fs.writeFileSync(HTML, h);
console.log('已更新', path.relative(process.cwd(), HTML));
