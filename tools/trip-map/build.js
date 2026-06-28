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
window.initGmap = function () {
  const SPOTS = ${gSpots}, ROUTES = ${gRoutes}, DCOL = ${gCols};
  const ICON = { spot:'#1B91C9', food:'#D4883C', stay:'#8B6BB1', air:'#E05252' };
  const el = document.getElementById('gmap'); if (!el) return;
  const map = new google.maps.Map(el, { mapTypeControl:true, streetViewControl:false, fullscreenControl:true, zoom:12 });
  const info = new google.maps.InfoWindow();
  const bounds = new google.maps.LatLngBounds();
  const markers = SPOTS.map(s => {
    const m = new google.maps.Marker({ position:{lat:s.lat,lng:s.lng}, map, title:s.n,
      icon:{ path:google.maps.SymbolPath.CIRCLE, fillColor:ICON[s.t]||'#1B91C9', fillOpacity:1, strokeColor:'#fff', strokeWeight:2, scale:7 } });
    m._d = s.d; m.addListener('click', () => { info.setContent('<b>'+s.n+'</b>'); info.open(map, m); });
    bounds.extend(m.getPosition()); return m;
  });
  const lines = {};
  Object.keys(ROUTES).forEach(day => {
    const path = ROUTES[day].map(n => { const s = SPOTS.find(o => o.n === n); return s ? {lat:s.lat,lng:s.lng} : null; }).filter(Boolean);
    if (path.length >= 2) lines[day] = new google.maps.Polyline({ path, map, strokeColor:DCOL[day]||'#1B91C9', strokeWeight:4, strokeOpacity:0.85 });
  });
  map.fitBounds(bounds);
  function setDay(day) {
    document.querySelectorAll('#gmapTabs .gmap-tab').forEach(b => b.classList.toggle('active', b.dataset.day === String(day)));
    markers.forEach(m => m.setVisible(day === 'all' || m._d.indexOf(Number(day)) >= 0));
    Object.keys(lines).forEach(d => lines[d].setMap((day === 'all' || String(day) === d) ? map : null));
  }
  document.querySelectorAll('#gmapTabs .gmap-tab').forEach(b => b.addEventListener('click', () => setDay(b.dataset.day)));
  const tt = document.querySelector('.tab-btn[data-page="page-traffic"]');
  if (tt) tt.addEventListener('click', () => setTimeout(() => { google.maps.event.trigger(map, 'resize'); map.fitBounds(bounds); }, 90));
  setDay('all');
};
</` + `script>
<script async src="https://maps.googleapis.com/maps/api/js?key=${GKEY}&callback=initGmap&loading=async"></` + `script>`;

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
