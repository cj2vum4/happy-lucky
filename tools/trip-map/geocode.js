// 用 Google Places API (New) 的 searchText 把每個景點的「名稱＋地區」解析成
// 精準座標＋place_id，寫入 geocoded.json（build.js 會據此覆蓋座標並用 place_id 導航）。
// 用法：node geocode.js [config...]   預設跑全部 configs
// 需求：專案已啟用 Billing 與 Places API (New)；金鑰在 gkey.js。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const DIR = __dirname;
const KEY = require('./gkey.js');

const names = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(path.join(DIR, 'configs')).filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''));

const norm = n => n.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
function haversine(a, b, c, d) { const R = 6371, r = x => x * Math.PI / 180; const dLa = r(c - a), dLo = r(d - b); const s = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }

function searchText(q) {
  const bodyFile = path.join(os.tmpdir(), 'gq.json');
  fs.writeFileSync(bodyFile, JSON.stringify({ textQuery: q, languageCode: 'zh-TW', maxResultCount: 1 }));
  const cmd = `curl -sS -m 25 -X POST "https://places.googleapis.com/v1/places:searchText"`
    + ` -H "Content-Type: application/json"`
    + ` -H "X-Goog-Api-Key: ${KEY}"`
    + ` -H "X-Goog-FieldMask: places.displayName,places.location,places.formattedAddress,places.id"`
    + ` -d @${bodyFile}`;
  return JSON.parse(execSync(cmd, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
}

(async () => {
  const geo = {}, rows = [];
  for (const name of names) {
    const CFG = require(path.join(DIR, 'configs', name + '.js'));
    geo[name] = {};
    for (const s of CFG.spots) {
      const q = norm(s.n) + (CFG.region ? ' ' + CFG.region : '');
      let j;
      try { j = searchText(q); } catch (e) { j = { error: e.message }; }
      const p = j.places && j.places[0];
      if (p && p.location) {
        const lat = +p.location.latitude.toFixed(6), lng = +p.location.longitude.toFixed(6);
        const moved = haversine(s.lat, s.lon, lat, lng);
        geo[name][s.n] = { lat, lng, pid: p.id, addr: p.formattedAddress };
        rows.push([name, s.n, (p.displayName && p.displayName.text) || '', moved, p.formattedAddress]);
      } else {
        rows.push([name, s.n, '⚠️ ' + (j.error || (j.error_message) || 'NO_RESULT'), null, '（保留估算）']);
      }
      execSync('sleep 0.1');
    }
  }
  fs.writeFileSync(path.join(DIR, 'geocoded.json'), JSON.stringify(geo, null, 1));
  console.log('\n=== 校正結果（moved = 與原估算距離；>2km 標紅建議複查）===\n');
  rows.forEach(r => {
    const moved = r[3] == null ? '' : r[3].toFixed(2) + 'km' + (r[3] > 2 ? ' ‼️' : '');
    console.log(`[${r[0]}] ${r[1]}  →  ${r[2]}  ${moved}\n      ${r[4] || ''}`);
  });
  const n = Object.values(geo).reduce((a, o) => a + Object.keys(o).length, 0);
  console.log(`\n✅ 已寫入 geocoded.json（${n} 點解析成功）。`);
})();
