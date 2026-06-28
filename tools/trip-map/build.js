// 用法：node build.js <config>   例：node build.js nantou
// 讀 configs/<config>.js → 用 taiwan-atlas 真實鄉鎮界產生 3D 與 SVG 地圖，
// 並寫回該行程頁面（以 <!--TRIPMAP3D--> / <!--TRIPMAPSVG--> 標記為界）。
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const topojson = require(path.join(DIR, 'node_modules/topojson-client'));
const pc = require(path.join(DIR, 'node_modules/polygon-clipping'));

const name = process.argv[2];
if (!name) { console.error('用法：node build.js <config>'); process.exit(1); }
const CFG = require(path.join(DIR, 'configs', name + '.js'));

const topo = require(path.join(DIR, 'node_modules/taiwan-atlas/towns-10t.json'));
const fc = topojson.feature(topo, topo.objects.towns);
const town = (county, t) => fc.features.find(f => f.properties.COUNTYNAME === county && f.properties.TOWNNAME === t);

function outerRings(feat) { const g = feat.geometry; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return polys.map(p => p[0]); }
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]); return Math.abs(a / 2); }
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0; const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) { const [px, py] = pts[i]; const dx = bx - ax, dy = by - ay; const t = (dx || dy) ? ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy) : 0; const cx = ax + Math.max(0, Math.min(1, t)) * dx, cy = ay + Math.max(0, Math.min(1, t)) * dy; const d = Math.hypot(px - cx, py - cy); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > eps) { const l = dp(pts.slice(0, idx + 1), eps), r = dp(pts.slice(idx), eps); return l.slice(0, -1).concat(r); }
  return [pts[0], pts[pts.length - 1]];
}
function simplify(r, eps) { const s = dp(r, eps); if (s.length && (s[0][0] !== s.at(-1)[0] || s[0][1] !== s.at(-1)[1])) s.push(s[0]); return s; }

// 1) 收集 landmasses（每鄉鎮取主要陸塊）
let landmasses = [];
CFG.townships.forEach(t => {
  const feat = town(CFG.county, t);
  if (!feat) { console.error('找不到', CFG.county, t); process.exit(1); }
  const rings = outerRings(feat).sort((a, b) => ringArea(b) - ringArea(a));
  const big = ringArea(rings[0]);
  rings.filter(r => ringArea(r) >= big * 0.12).forEach(r => landmasses.push({ name: t, ring: r }));
});

// 2) union 指定群組
(CFG.unions || []).forEach(grp => {
  const inGrp = landmasses.filter(l => grp.members.includes(l.name));
  const rest = landmasses.filter(l => !grp.members.includes(l.name));
  let acc = [[inGrp[0].ring]];
  for (let i = 1; i < inGrp.length; i++) acc = pc.union(acc, [[inGrp[i].ring]]);
  const ring = acc.map(p => p[0]).sort((a, b) => ringArea(b) - ringArea(a))[0];
  landmasses = rest.concat([{ name: grp.name, ring }]);
});

landmasses.forEach(l => l.ring = simplify(l.ring, CFG.epsilon));

// 3) 投影：等距 + 置中 + 縮放至目標寬度
const allLL = landmasses.flatMap(l => l.ring).concat(CFG.spots.map(s => [s.lon, s.lat]));
const lon0 = allLL.reduce((a, p) => a + p[0], 0) / allLL.length;
const lat0 = allLL.reduce((a, p) => a + p[1], 0) / allLL.length;
const cosLat = Math.cos(lat0 * Math.PI / 180);
const raw = ([lon, lat]) => [(lon - lon0) * cosLat, -(lat - lat0)];
let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
landmasses.forEach(l => l.ring.forEach(p => { const [x, z] = raw(p); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }));
const S = (CFG.targetW || 60) / (maxX - minX);
const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
const proj = ll => { const [x, z] = raw(ll); return [+((x - cx) * S).toFixed(2), +((z - cz) * S).toFixed(2)]; };

const islands = landmasses.map(l => ({ name: l.name, pts: l.ring.map(proj) }));
const spots3d = CFG.spots.map(s => ({ n: s.n, xz: proj([s.lon, s.lat]), t: s.t, d: s.d }));

// 4) bridge（沿海）
let bridge = null;
if (CFG.bridgeBetween) {
  const A = islands.find(i => i.name === CFG.bridgeBetween[0]).pts;
  const B = islands.find(i => i.name === CFG.bridgeBetween[1]).pts;
  let bd = 1e9; for (const p of A) for (const q of B) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; bridge = { ax: p[0], az: p[1], bx: q[0], bz: q[1] }; } }
}

// 5) 3D IIFE
const cfg3d = { inland: !!CFG.inland, seaColor: CFG.seaColor || 0xA8C888, dayNames: CFG.dayNames, dayCols: CFG.dayCols };
const tpl = fs.readFileSync(path.join(DIR, 'map.template.js'), 'utf8');
const iife = tpl
  .replace('/*__CFG__*/', '  const CFG = ' + JSON.stringify(cfg3d) + ';')
  .replace('/*__POLYS__*/', '  const POLYS = [\n' + islands.map(o => '    [' + o.pts.map(p => '[' + p[0] + ',' + p[1] + ']').join(',') + '], // ' + o.name).join('\n') + '\n  ];')
  .replace('/*__SPOTS__*/', '  const SPOTS = [\n' + spots3d.map(s => "    {n:'" + s.n + "', x:" + s.xz[0] + ", z:" + s.xz[1] + ", t:'" + s.t + "', d:[" + s.d.join(',') + "]},").join('\n') + '\n  ];')
  .replace('/*__ROUTES__*/', '  const ROUTES = ' + JSON.stringify(CFG.routes) + ';')
  .replace('/*__BRIDGE__*/', '  const BRIDGE = ' + (bridge ? JSON.stringify(bridge) : 'null') + ';')
  .trimEnd();

// 6) SVG block（viewBox 300x230）
const VW = 300, VH = 230, PAD = 16;
let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
islands.forEach(o => o.pts.forEach(([x, z]) => { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }));
const sSvg = Math.min((VW - PAD * 2) / (bx1 - bx0), (VH - PAD * 2 - 16) / (bz1 - bz0));
const offx = (VW - (bx1 - bx0) * sSvg) / 2 - bx0 * sSvg, offy = PAD + 14 - bz0 * sSvg;
const toSvg = ([x, z]) => [+(x * sSvg + offx).toFixed(1), +(z * sSvg + offy).toFixed(1)];
const COLT = { air: '#E05252', stay: '#8B6BB1', food: '#D4883C', spot: '#1B91C9' };
const islFill = CFG.islandFill || (CFG.inland ? '#BcD89A' : '#CFE6B6');
const seaHex = CFG.inland ? '#DDEBC8' : '#C8E9F8';
let svg = '';
svg += '<svg width="100%" viewBox="0 0 ' + VW + ' ' + VH + '" xmlns="http://www.w3.org/2000/svg" style="display:block; font-family:\'Caveat\',cursive; overflow:visible;">\n';
svg += '  <defs><filter id="wob" x="-4%" y="-4%" width="112%" height="112%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter></defs>\n';
svg += '  <rect width="' + VW + '" height="' + VH + '" fill="' + seaHex + '" rx="10"/>\n';
svg += '  <text x="' + (VW / 2) + '" y="17" text-anchor="middle" font-size="13" font-weight="700" fill="' + (CFG.titleColor || '#3A6B3A') + '">' + CFG.title + '</text>\n';
islands.forEach(o => { svg += '  <path filter="url(#wob)" d="M ' + o.pts.map(toSvg).map(p => p.join(',')).join(' L ') + ' Z" fill="' + islFill + '" stroke="#4A7C59" stroke-width="1.4"/>\n'; });
if (bridge) { const a = toSvg([bridge.ax, bridge.az]), b = toSvg([bridge.bx, bridge.bz]); svg += '  <line filter="url(#wob)" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '" stroke="#7B5EA7" stroke-width="2.2"/>\n'; }
islands.forEach(o => { const c = o.pts.map(toSvg).reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]).map(v => v / o.pts.length); const disp = (CFG.islandNames && CFG.islandNames[o.name]) || o.name; svg += '  <text x="' + c[0].toFixed(1) + '" y="' + c[1].toFixed(1) + '" text-anchor="middle" font-size="8" fill="#3A6B3A" opacity="0.85" font-weight="700">' + disp + '</text>\n'; });
spots3d.forEach(s => { const p = toSvg(s.xz); svg += '  <circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.6" fill="' + (COLT[s.t] || '#1B91C9') + '" stroke="#fff" stroke-width="0.8"/>\n'; });
const LG = [['#1B91C9', '景點'], ['#D4883C', '美食'], ['#8B6BB1', '住宿'], ['#E05252', '交通']];
svg += '  <g font-size="7.5" fill="#2E2018" font-family="\'Noto Serif TC\',serif">\n  <rect x="10" y="28" width="58" height="58" rx="7" fill="rgba(255,255,255,0.8)" stroke="#C4AE9E" stroke-width="0.8"/>\n';
LG.forEach((l, i) => { const y = 42 + i * 13; svg += '  <circle cx="20" cy="' + (y - 2.5) + '" r="3" fill="' + l[0] + '"/><text x="28" y="' + y + '">' + l[1] + '</text>\n'; });
svg += '  </g>\n';
svg += '  <text x="' + (VW - 16) + '" y="' + (VH - 22) + '" font-size="18" text-anchor="middle" fill="#0A6B99">↑</text><text x="' + (VW - 16) + '" y="' + (VH - 10) + '" font-size="8" text-anchor="middle" fill="#5A4232">北</text>\n';
svg += '</svg>';

// ===== Google 互動地圖 =====
const GKEY = require('./gkey.js');   // 金鑰另存（見 gkey.js）
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

// 7) 寫回 HTML（標記為界）
const HTML = path.resolve(DIR, CFG.htmlFile);
let h = fs.readFileSync(HTML, 'utf8');
function has(s) { return h.indexOf(s) >= 0; }
function replaceBetween(a, b, content) {
  const i = h.indexOf(a), j = h.indexOf(b);
  if (i < 0 || j < 0) return false;
  h = h.slice(0, i + a.length) + content + h.slice(j); return true;
}

// 3D / SVG（僅在該頁有本工具標記時寫入）
if (has('<!--TRIPMAP3D-->')) replaceBetween('<!--TRIPMAP3D-->', '<!--/TRIPMAP3D-->', '\n<script>\n' + iife + '\n</' + 'script>\n');
if (has('<!--TRIPMAPSVG-->')) replaceBetween('<!--TRIPMAPSVG-->', '<!--/TRIPMAPSVG-->', '\n' + svg + '\n');

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
  const section = `      <div class="section-label" style="margin-top:24px">🌐 Google 互動地圖</div>
      <div class="gmap-wrap">
        <div class="gmap-tabs" id="gmapTabs">
${tabs}
        </div>
        <div id="gmap" class="gmap-canvas"></div>
      </div>
      <!--TRIPGMAP--><!--/TRIPGMAP-->
`;
  const anchor = '\n    </div>\n\n    <!-- PAGE: 行程 -->';
  if (h.indexOf(anchor) < 0) { console.error('找不到交通頁關閉錨點（gmap）'); process.exit(1); }
  h = h.replace(anchor, '\n' + section + '    </div>\n\n    <!-- PAGE: 行程 -->');
}
replaceBetween('<!--TRIPGMAP-->', '<!--/TRIPGMAP-->', '\n' + gInit + '\n');

fs.writeFileSync(HTML, h);
console.log('[' + name + '] 已更新', path.relative(process.cwd(), HTML), '| landmasses:', islands.map(i => i.name + '(' + i.pts.length + ')').join(' '), '| gmap days:', dayCount);
