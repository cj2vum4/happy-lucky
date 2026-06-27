const DIR = __dirname;
const topojson = require(DIR + '/node_modules/topojson-client');
const pc = require(DIR + '/node_modules/polygon-clipping');
const fs = require('fs');
const topo = require(DIR + '/node_modules/taiwan-atlas/towns-10t.json');

const fc = topojson.feature(topo, topo.objects.towns);
const get = name => fc.features.find(f => f.properties.TOWNNAME === name && f.properties.COUNTYNAME === '澎湖縣');

function outerRings(feat) {
  const g = feat.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.map(p => p[0]); // outer ring of each part
}
function ringArea(r) { // shoelace (abs), lon/lat units ok for comparison
  let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]);
  return Math.abs(a / 2);
}
function biggest(rings, n = 1) { return rings.slice().sort((a, b) => ringArea(b) - ringArea(a)).slice(0, n); }

// Douglas–Peucker on [lon,lat]
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const dx = bx - ax, dy = by - ay;
    const t = (dx || dy) ? ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy) : 0;
    const cx = ax + Math.max(0, Math.min(1, t)) * dx, cy = ay + Math.max(0, Math.min(1, t)) * dy;
    const d = Math.hypot(px - cx, py - cy);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) {
    const l = dp(pts.slice(0, idx + 1), eps), r = dp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}
function simplifyRing(r, eps) { const s = dp(r, eps); if (s.length && (s[0][0] !== s[s.length-1][0] || s[0][1] !== s[s.length-1][1])) s.push(s[0]); return s; }

// --- gather islands ---
const xiyu = biggest(outerRings(get('西嶼鄉')), 1)[0];
const baishaParts = biggest(outerRings(get('白沙鄉')), 2); // 白沙本島 + 中屯
const magongMain = biggest(outerRings(get('馬公市')), 1)[0];
const huxi = biggest(outerRings(get('湖西鄉')), 1)[0];

// union 馬公 + 湖西 -> 本島
const uni = pc.union([magongMain], [huxi]);
let mainRing = uni.map(poly => poly[0]).sort((a, b) => ringArea(b) - ringArea(a))[0];

const EPS = 0.0016;
const islandsLL = [
  { name: 'xiyu',   ring: simplifyRing(xiyu, EPS) },
  { name: 'baisha', ring: simplifyRing(baishaParts[0], EPS) },
  { name: 'zhongtun', ring: simplifyRing(baishaParts[1], EPS) },
  { name: 'main',   ring: simplifyRing(mainRing, EPS) },
];
islandsLL.forEach(o => console.error(o.name, 'pts', o.ring.length));

// --- spots (approx lon/lat) ---
const SPOTS = [
  ['✈ 馬公機場', 119.6283, 23.5687, 'air',  [1]],
  ['馬公住宿',   119.5663, 23.5655, 'stay', [1,2,3,4]],
  ['佶肯GK漢堡', 119.5740, 23.5665, 'food', [1]],
  ['鐘記燒餅',   119.5660, 23.5710, 'food', [2]],
  ['藍冉刨冰',   119.5672, 23.5688, 'food', [2]],
  ['篤行十村',   119.5640, 23.5610, 'spot', [2]],
  ['小島一隅',   119.5745, 23.5585, 'food', [2]],
  ['三哥雞排',   119.5690, 23.5640, 'food', [2]],
  ['後寮天堂路', 119.5985, 23.6585, 'spot', [3]],
  ['通樑古榕',   119.5185, 23.6285, 'spot', [3]],
  ['跨海大橋',   119.5095, 23.6225, 'spot', [3]],
  ['大菓葉玄武岩',119.4905, 23.6000,'spot', [3]],
  ['二崁聚落',   119.4985, 23.6035, 'spot', [3]],
  ['大池炸粿',   119.5005, 23.6205, 'food', [3]],
  ['鯨魚洞',     119.4835, 23.6320, 'spot', [3]],
  ['摩西分海',   119.6470, 23.5995, 'spot', [4]],
  ['很大的馬桶', 119.6680, 23.5755, 'spot', [4]],
];

// --- projection: equirectangular around centroid, fit to target width ---
const allLL = islandsLL.flatMap(o => o.ring).concat(SPOTS.map(s => [s[1], s[2]]));
const lon0 = allLL.reduce((a, p) => a + p[0], 0) / allLL.length;
const lat0 = allLL.reduce((a, p) => a + p[1], 0) / allLL.length;
const cosLat = Math.cos(lat0 * Math.PI / 180);
const raw = ([lon, lat]) => [(lon - lon0) * cosLat, -(lat - lat0)];

let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
islandsLL.forEach(o => o.ring.forEach(p => { const [x, z] = raw(p); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }));
const TARGET_W = 60;
const S = TARGET_W / (maxX - minX);
const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
const proj3d = ll => { const [x, z] = raw(ll); return [ +( (x - cx) * S ).toFixed(2), +( (z - cz) * S ).toFixed(2) ]; };

const islands3d = islandsLL.map(o => ({ name: o.name, pts: o.ring.map(proj3d) }));
const spots3d = SPOTS.map(s => ({ n: s[0], xz: proj3d([s[1], s[2]]), t: s[3], d: s[4] }));

// --- SVG projection into viewBox 300 x 230 with padding ---
const VW = 300, VH = 230, PAD = 16;
// recompute bbox in 3d space
let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
islands3d.forEach(o => o.pts.forEach(([x, z]) => { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z); }));
const sw = (VW - PAD * 2) / (bx1 - bx0), sh = (VH - PAD * 2 - 16) / (bz1 - bz0); // leave room for title
const sSvg = Math.min(sw, sh);
const offx = (VW - (bx1 - bx0) * sSvg) / 2 - bx0 * sSvg;
const offy = PAD + 14 - bz0 * sSvg;
const toSvg = ([x, z]) => [ +(x * sSvg + offx).toFixed(1), +(z * sSvg + offy).toFixed(1) ];
const svgPath = pts => 'M ' + pts.map(toSvg).map(p => p.join(',')).join(' L ') + ' Z';
const islandsSvg = islands3d.map(o => ({ name: o.name, d: svgPath(o.pts) }));
const spotsSvg = spots3d.map(s => ({ n: s.n, xy: toSvg(s.xz), t: s.t, d: s.d }));

// --- bridge: closest pair 白沙 <-> 西嶼 (real 跨海大橋 location) ---
const get3 = n => islands3d.find(o => o.name === n).pts;
function closest(A, B) { let bd = 1e9, ba, bb; for (const p of A) for (const q of B) { const d = Math.hypot(p[0]-q[0], p[1]-q[1]); if (d < bd) { bd = d; ba = p; bb = q; } } return { a: ba, b: bb }; }
const br3 = closest(get3('baisha'), get3('xiyu'));
const brSvgA = toSvg(br3.a), brSvgB = toSvg(br3.b);

// --- emit 3D inject (POLYS + SPOTS + BRIDGE) ---
const fmtPolys = '  const POLYS = [\n' + islands3d.map(o => '    [' + o.pts.map(p => '[' + p[0] + ',' + p[1] + ']').join(',') + '], // ' + o.name).join('\n') + '\n  ];';
const fmtSpots = '  const SPOTS = [\n' + spots3d.map(s => "    {n:'" + s.n + "', x:" + s.xz[0] + ", z:" + s.xz[1] + ", t:'" + s.t + "', d:[" + s.d.join(',') + "]}," ).join('\n') + '\n  ];';
const fmtBridge = '  const BRIDGE = { ax:' + br3.a[0] + ', az:' + br3.a[1] + ', bx:' + br3.b[0] + ', bz:' + br3.b[1] + ' };';
fs.writeFileSync(DIR + '/inject_3d.txt', fmtPolys + '\n' + fmtSpots + '\n' + fmtBridge + '\n');

// --- emit SVG block (real coastline, hand-drawn wobble) ---
const COLT = { air:'#E05252', stay:'#4A7BBE', food:'#D4883C', spot:'#1B91C9' };
const ISL_FILL = { xiyu:'#CFE6B6', baisha:'#D4E9BC', zhongtun:'#D8ECC2', main:'#CDE6B2' };
const LABELS = ['✈ 馬公機場','馬公住宿','跨海大橋','通樑古榕','後寮天堂路','大菓葉玄武岩','二崁聚落','大池炸粿','鯨魚洞','摩西分海','很大的馬桶'];
let svg = '';
svg += '<svg width="100%" viewBox="0 0 ' + VW + ' ' + VH + '" xmlns="http://www.w3.org/2000/svg" style="display:block; font-family:\'Caveat\',cursive; overflow:visible;">\n';
svg += '  <defs><filter id="wob" x="-4%" y="-4%" width="112%" height="112%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter></defs>\n';
svg += '  <rect width="' + VW + '" height="' + VH + '" fill="#C8E9F8" rx="10"/>\n';
svg += '  <text x="' + (VW/2) + '" y="17" text-anchor="middle" font-size="13" font-weight="700" fill="#0A6B99">澎湖本島 · 真實海岸線</text>\n';
islandsSvg.forEach(o => { svg += '  <path filter="url(#wob)" d="' + o.d + '" fill="' + (ISL_FILL[o.name]||'#CFE6B6') + '" stroke="#4A7C59" stroke-width="1.4"/>\n'; });
svg += '  <line filter="url(#wob)" x1="' + brSvgA[0] + '" y1="' + brSvgA[1] + '" x2="' + brSvgB[0] + '" y2="' + brSvgB[1] + '" stroke="#7B5EA7" stroke-width="2.2"/>\n';
svg += '  <text x="' + ((brSvgA[0]+brSvgB[0])/2) + '" y="' + ((brSvgA[1]+brSvgB[1])/2 - 3) + '" text-anchor="middle" font-size="7" fill="#5E4790">跨海大橋</text>\n';
// 島嶼名稱（島中心）
const ISL_NAME = { xiyu:'西嶼', baisha:'白沙', zhongtun:'中屯', main:'馬公本島・湖西' };
islands3d.forEach(o => {
  const c = o.pts.map(toSvg).reduce((a,p)=>[a[0]+p[0],a[1]+p[1]],[0,0]).map(v=>v/o.pts.length);
  svg += '  <text x="' + c[0].toFixed(1) + '" y="' + c[1].toFixed(1) + '" text-anchor="middle" font-size="' + (o.name==='main'?9:7.5) + '" fill="#3A6B3A" opacity="0.85" font-weight="700">' + ISL_NAME[o.name] + '</text>\n';
});
// 景點圓點（依類別著色）
spotsSvg.forEach(s => { svg += '  <circle cx="' + s.xy[0] + '" cy="' + s.xy[1] + '" r="2.6" fill="' + (COLT[s.t]||'#1B91C9') + '" stroke="#fff" stroke-width="0.8"/>\n'; });
// 圖例
const LG = [['#1B91C9','景點'],['#D4883C','美食'],['#8B6BB1','住宿'],['#E05252','機場']];
svg += '  <g font-size="7.5" fill="#2E2018" font-family="\'Noto Serif TC\',serif">\n';
svg += '  <rect x="10" y="28" width="58" height="58" rx="7" fill="rgba(255,255,255,0.8)" stroke="#C4AE9E" stroke-width="0.8"/>\n';
LG.forEach((l,i)=>{ const y=42+i*13; svg += '  <circle cx="20" cy="'+(y-2.5)+'" r="3" fill="'+l[0]+'"/><text x="28" y="'+y+'">'+l[1]+'</text>\n'; });
svg += '  </g>\n';
// 指北針
svg += '  <text x="' + (VW-16) + '" y="' + (VH-22) + '" font-size="18" text-anchor="middle" fill="#0A6B99">↑</text><text x="' + (VW-16) + '" y="' + (VH-10) + '" font-size="8" text-anchor="middle" fill="#5A4232">北</text>\n';
svg += '</svg>';
fs.writeFileSync(DIR + '/svg_block.txt', svg);

const out = { islands3d, spots3d, islandsSvg, spotsSvg, bridge: br3 };
fs.writeFileSync(DIR + '/geo_out.json', JSON.stringify(out, null, 1));
console.error('wrote geo_out.json, inject_3d.txt, svg_block.txt');
console.error('island3d pt counts:', islands3d.map(o => o.name + ':' + o.pts.length).join(' '));
console.error('main bbox x:', bx0.toFixed(1), bx1.toFixed(1), 'z:', bz0.toFixed(1), bz1.toFixed(1));
