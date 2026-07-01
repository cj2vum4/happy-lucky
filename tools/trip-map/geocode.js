// 用 Google Places「Find Place」把每個景點的「名稱＋地區」解析成精準座標＋place_id，
// 寫入 geocoded.json（build.js 會據此覆蓋座標並用 place_id 做精準導航）。
// 用法：node geocode.js [config...]   預設跑全部 configs
// 需求：專案已啟用 Billing 與 Places API；金鑰在 gkey.js。
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const DIR = __dirname;
const KEY = require('./gkey.js');

const args = process.argv.slice(2);
const names = args.length ? args
  : fs.readdirSync(path.join(DIR, 'configs')).filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''));

const norm = n => n.replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').trim();
function haversine(a, b, c, d) { const R = 6371, r = x => x * Math.PI / 180; const dLa = r(c - a), dLo = r(d - b); const s = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
function curl(url) { return execSync(`curl -sS -m 25 "${url}"`, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }); }

(async () => {
  const geo = {};
  const rows = [];
  for (const name of names) {
    const CFG = require(path.join(DIR, 'configs', name + '.js'));
    geo[name] = {};
    for (const s of CFG.spots) {
      const q = norm(s.n) + (CFG.region ? ' ' + CFG.region : '');
      const url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
        + '?input=' + encodeURIComponent(q)
        + '&inputtype=textquery&language=zh-TW'
        + '&fields=' + encodeURIComponent('geometry,place_id,name,formatted_address')
        + '&key=' + KEY;
      let j;
      try { j = JSON.parse(curl(url)); } catch (e) { j = { status: 'CURL_ERR' }; }
      if (j.status === 'OK' && j.candidates && j.candidates[0]) {
        const c = j.candidates[0], loc = c.geometry.location;
        const moved = haversine(s.lat, s.lon, loc.lat, loc.lng);
        geo[name][s.n] = { lat: +loc.lat.toFixed(6), lng: +loc.lng.toFixed(6), pid: c.place_id, addr: c.formatted_address };
        rows.push([name, s.n, '✅', c.name, moved.toFixed(2) + 'km', c.formatted_address]);
      } else {
        rows.push([name, s.n, '⚠️ ' + (j.status || 'NO_RESULT'), '(保留估算)', '', '']);
      }
      execSync('sleep 0.15');
    }
  }
  fs.writeFileSync(path.join(DIR, 'geocoded.json'), JSON.stringify(geo, null, 1));
  console.log('\n=== 校正結果（moved = 與原估算的距離；>2km 建議複查）===');
  rows.forEach(r => {
    const flag = /km$/.test(r[4]) && parseFloat(r[4]) > 2 ? '  ‼️遠' : '';
    console.log([r[0], r[1], r[2], r[4] || '', r[5] || ''].filter(Boolean).join('  |  ') + flag);
  });
  console.log('\n已寫入 geocoded.json（' + Object.values(geo).reduce((a, o) => a + Object.keys(o).length, 0) + ' 點）。接著 rebuild 即生效。');
})();
