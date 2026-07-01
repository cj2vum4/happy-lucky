// 用法：node build.js <config>   例：node build.js nantou
// 讀 configs/<config>.js → 在該行程頁面的「交通」分頁產生／更新 Google 互動地圖
// （標記、每日路線、InfoWindow）。以 <!--TRIPGMAP--> 為界寫回。
const fs = require('fs');
const path = require('path');
const DIR = __dirname;

const name = process.argv[2];
if (!name) { console.error('用法：node build.js <config>'); process.exit(1); }
const CFG = require(path.join(DIR, 'configs', name + '.js'));
const GKEY = require('./gkey.js'); // 金鑰另存（gkey.js，已 gitignore）

const hex = n => '#' + n.toString(16).padStart(6, '0');
const dayCount = Math.max(...CFG.spots.flatMap(s => s.d), ...Object.keys(CFG.routes).map(Number));
const gSpots = JSON.stringify(CFG.spots.map(s => ({ n: s.n, lat: s.lat, lng: s.lon, t: s.t, d: s.d })));
const gRoutes = JSON.stringify(CFG.routes);
const gCols = JSON.stringify(Object.fromEntries(Object.entries(CFG.dayCols).map(([k, v]) => [k, hex(v)])));

const gInit = `<script>
(function () {
  const SPOTS = ${gSpots}, ROUTES = ${gRoutes}, DCOL = ${gCols}, KEY = '${GKEY}', REGION = '${CFG.region || ''}';
  const ICON = { spot:'#1B91C9', food:'#D4883C', stay:'#8B6BB1', air:'#E05252' };
  let map, info, bounds, markers = [], lines = {}, loaded = false, loading = false;

  function dirURL(s) { const dest = REGION ? encodeURIComponent(s.n + ' ' + REGION) : (s.lat + ',' + s.lng); return 'https://www.google.com/maps/dir/?api=1&destination=' + dest + '&travelmode=driving'; }
  function allURL() {
    if (!SPOTS.length) return 'https://www.google.com/maps';
    const o = SPOTS[0], d = SPOTS[SPOTS.length - 1];
    const wp = SPOTS.slice(1, -1).slice(0, 8).map(s => s.lat + ',' + s.lng).join('|');
    return 'https://www.google.com/maps/dir/?api=1&origin=' + o.lat + ',' + o.lng + '&destination=' + d.lat + ',' + d.lng + (wp ? '&waypoints=' + encodeURIComponent(wp) : '') + '&travelmode=driving';
  }
  function fail() {
    const el = document.getElementById('gmap'); if (!el) return;
    el.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;padding:20px;text-align:center;font-family:serif;color:#5A4232">'
      + '<div style="font-size:13px">地圖暫時無法載入</div>'
      + '<a href="' + allURL() + '" target="_blank" rel="noopener" style="background:#1a73e8;color:#fff;padding:8px 16px;border-radius:18px;text-decoration:none;font-size:13px">在 Google Maps 開啟全部景點</a></div>';
  }
  window.gm_authFailure = fail;

  window.initGmap = function () {
    const el = document.getElementById('gmap'); if (!el || !window.google) { fail(); return; }
    map = new google.maps.Map(el, { mapTypeControl:true, streetViewControl:false, fullscreenControl:true, zoom:12 });
    info = new google.maps.InfoWindow();
    bounds = new google.maps.LatLngBounds();
    markers = SPOTS.map(s => {
      const m = new google.maps.Marker({ position:{lat:s.lat,lng:s.lng}, map, title:s.n,
        icon:{ path:google.maps.SymbolPath.CIRCLE, fillColor:ICON[s.t]||'#1B91C9', fillOpacity:1, strokeColor:'#fff', strokeWeight:2, scale:10 } });
      m._d = s.d; m._n = s.n;
      m.addListener('click', () => { info.setContent('<div style="font-size:13px;line-height:1.5"><b>' + s.n + '</b><br><a href="' + dirURL(s) + '" target="_blank" rel="noopener" style="color:#1a73e8">🧭 在 Google Maps 導航</a></div>'); info.open(map, m); });
      bounds.extend(m.getPosition()); return m;
    });
    Object.keys(ROUTES).forEach(day => {
      const p = ROUTES[day].map(n => { const s = SPOTS.find(o => o.n === n); return s ? {lat:s.lat,lng:s.lng} : null; }).filter(Boolean);
      if (p.length >= 2) lines[day] = new google.maps.Polyline({ path:p, strokeColor:DCOL[day]||'#1B91C9', strokeWeight:4, strokeOpacity:0.85 });
    });
    document.querySelectorAll('#gmapTabs .gmap-tab').forEach(b => b.addEventListener('click', () => setDay(b.dataset.day)));
    loaded = true; setDay('all');
  };

  function setDay(day) {
    if (!loaded) return;
    document.querySelectorAll('#gmapTabs .gmap-tab').forEach(b => b.classList.toggle('active', b.dataset.day === String(day)));
    const order = (day !== 'all' && ROUTES[day]) ? ROUTES[day] : null;
    const b2 = new google.maps.LatLngBounds(); let cnt = 0, last = null;
    markers.forEach(m => {
      const on = day === 'all' || m._d.indexOf(Number(day)) >= 0;
      m.setMap(on ? map : null);
      if (on) { b2.extend(m.getPosition()); cnt++; last = m.getPosition(); }
      if (order) { const i = order.indexOf(m._n); m.setLabel(i >= 0 ? { text:String(i + 1), color:'#fff', fontSize:'11px', fontWeight:'700' } : null); }
      else m.setLabel(null);
    });
    Object.keys(lines).forEach(d => lines[d].setMap((day === 'all' || String(day) === d) ? map : null));
    if (cnt === 1) { map.setCenter(last); map.setZoom(15); }
    else if (cnt > 1) map.fitBounds(b2);
  }

  function load() {
    if (loaded || loading) { onShow(); return; }
    loading = true;
    const s = document.createElement('script'); s.async = true;
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + KEY + '&callback=initGmap&loading=async';
    s.onerror = fail; document.head.appendChild(s);
  }
  function onShow() {
    if (loaded && map) setTimeout(() => { google.maps.event.trigger(map, 'resize'); const a = document.querySelector('#gmapTabs .gmap-tab.active'); setDay(a ? a.dataset.day : 'all'); }, 90);
  }
  function wire() {
    const tt = document.querySelector('.tab-btn[data-page="page-traffic"]');
    if (tt) tt.addEventListener('click', () => { load(); onShow(); });
    const tp = document.getElementById('page-traffic');
    if (tp && tp.classList.contains('active')) load();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
</` + `script>`;

const HTML = path.resolve(DIR, CFG.htmlFile);
let h = fs.readFileSync(HTML, 'utf8');
const has = s => h.indexOf(s) >= 0;
function replaceBetween(a, b, content) { const i = h.indexOf(a), j = h.indexOf(b); if (i < 0 || j < 0) return false; h = h.slice(0, i + a.length) + content + h.slice(j); return true; }

// Google 地圖 scaffold（首次自動插入）
if (!has('id="gmap"')) {
  if (!has('.gmap-canvas')) {
    const gcss = `
/* ===== Google 地圖 ===== */
.gmap-wrap { background: var(--cream); border-radius: 14px; padding: 10px; margin-bottom: 14px; }
.gmap-tabs { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
.gmap-tab { flex: 1; min-width: 52px; border: 1.5px solid var(--pea); background: var(--paper); border-radius: 18px; padding: 6px 4px; font-family: var(--body); font-size: 13px; color: var(--pea-dark); cursor: pointer; touch-action: manipulation; }
.gmap-tab.active { background: var(--pea-dark); color: #fff; border-color: var(--pea-dark); }
.gmap-canvas { width: 100%; height: 340px; border-radius: 12px; overflow: hidden; background: #e8eef0; }`;
    h = h.replace('</style>', gcss + '\n</style>');
  }
  const tabs = ['<button class="gmap-tab active" data-day="all" type="button">全部</button>']
    .concat(Array.from({ length: dayCount }, (_, i) => `<button class="gmap-tab" data-day="${i + 1}" type="button">D${i + 1}</button>`))
    .map(b => '          ' + b).join('\n');
  const section = `      <div class="section-label" style="margin-top:24px">🌐 行程地圖</div>
      <div class="gmap-wrap">
        <div class="gmap-tabs" id="gmapTabs">
${tabs}
        </div>
        <div id="gmap" class="gmap-canvas"></div>
      </div>
      <!--TRIPGMAP--><!--/TRIPGMAP-->
`;
  const anchor = '\n    </div>\n\n    <!-- PAGE: 行程 -->';
  if (h.indexOf(anchor) < 0) { console.error('找不到交通頁關閉錨點'); process.exit(1); }
  h = h.replace(anchor, '\n' + section + '    </div>\n\n    <!-- PAGE: 行程 -->');
}
if (!replaceBetween('<!--TRIPGMAP-->', '<!--/TRIPGMAP-->', '\n' + gInit + '\n')) { console.error('找不到 TRIPGMAP 標記'); process.exit(1); }

fs.writeFileSync(HTML, h);
console.log('[' + name + '] 已更新', path.relative(process.cwd(), HTML), '| 景點:', CFG.spots.length, '| 天數:', dayCount);
