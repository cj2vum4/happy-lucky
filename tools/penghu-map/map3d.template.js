(function () {
  const holder = document.getElementById('map3dHolder');
  const fallback = document.getElementById('map3dFallback');
  const routeNameEl = document.getElementById('map3dRouteName');
  const labelLayer = document.getElementById('map3dLabels');
  const leaderSvg = document.getElementById('map3dLeaders');
  if (!holder || typeof THREE === 'undefined') { if (fallback) fallback.textContent = '立體地圖無法載入'; return; }

  const SEA_Y = 1.0, BASE = 3.4, RAMP = 2.6, HILL = 1.6;
  const COL = { air:0xE0524A, stay:0x8B6BB1, food:0xE08A3C, spot:0x1B91C9 };
  const DAY_COL = { 1:0xE8913C, 2:0x18A0B0, 3:0x1B91C9, 4:0xC0567A };
  const DAY_NAME = { all:'🗺️ 全部路線總覽', 1:'🟠 D1・抵達 → 馬公市區', 2:'🟢 D2・馬公市區慢遊', 3:'🔵 D3・北環 ＋ 西嶼大環線', 4:'🌸 D4・東環 ＋ 摩西分海' };

/*__POLYS__*/
/*__SPOTS__*/
/*__BRIDGE__*/

  // 多邊形 bbox（加速地形判定）
  const POLY_BB = POLYS.map(r => { let a=[1e9,1e9,-1e9,-1e9]; r.forEach(p=>{a[0]=Math.min(a[0],p[0]);a[1]=Math.min(a[1],p[1]);a[2]=Math.max(a[2],p[0]);a[3]=Math.max(a[3],p[1]);}); return a; });
  let MINX=1e9,MAXX=-1e9,MINZ=1e9,MAXZ=-1e9;
  POLYS.forEach(r=>r.forEach(p=>{MINX=Math.min(MINX,p[0]);MAXX=Math.max(MAXX,p[0]);MINZ=Math.min(MINZ,p[1]);MAXZ=Math.max(MAXZ,p[1]);}));
  const MAPW=MAXX-MINX, MAPH=MAXZ-MINZ, MAXD=Math.max(MAPW,MAPH), CX=(MINX+MAXX)/2, CZ=(MINZ+MAXZ)/2;

  function pointInPoly(x,z,poly){ let inside=false; for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i][0],zi=poly[i][1],xj=poly[j][0],zj=poly[j][1]; if(((zi>z)!==(zj>z)) && (x<(xj-xi)*(z-zi)/(zj-zi)+xi)) inside=!inside;} return inside; }
  function distSeg(px,pz,ax,az,bx,bz){ const dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz; let t=l2?((px-ax)*dx+(pz-az)*dz)/l2:0; t=Math.max(0,Math.min(1,t)); return Math.hypot(px-(ax+t*dx),pz-(az+t*dz)); }
  function distPoly(x,z,poly){ let d=Infinity; for(let i=0,j=poly.length-1;i<poly.length;j=i++) d=Math.min(d,distSeg(x,z,poly[i][0],poly[i][1],poly[j][0],poly[j][1])); return d; }
  function smooth(a,b,x){ let t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); }
  function noise(x,z){ return Math.sin(x*0.34)*Math.cos(z*0.29)*0.6 + Math.sin(x*0.15+2.1)*Math.sin(z*0.2+0.7)*0.8 + Math.cos((x+z)*0.11)*0.4; }
  function terrainH(x,z){
    let inside=false,d=Infinity;
    for(let i=0;i<POLYS.length;i++){ const b=POLY_BB[i]; if(x<b[0]-RAMP||x>b[2]+RAMP||z<b[1]-RAMP||z>b[3]+RAMP) continue; if(pointInPoly(x,z,POLYS[i])) inside=true; const dd=distPoly(x,z,POLYS[i]); if(dd<d)d=dd; }
    if(d===Infinity) return 0;
    const signed=inside?d:-d;
    return smooth(0,RAMP,signed)*(BASE+Math.max(0,noise(x,z))*HILL);
  }

  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xd6eefb);
  scene.fog=new THREE.Fog(0xd6eefb, MAXD*1.0, MAXD*2.6);
  const camera=new THREE.PerspectiveCamera(44,1,0.1,1000);
  camera.position.set(CX+MAXD*0.05, MAXD*0.82, CZ+MAXD*0.95);
  const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  holder.appendChild(renderer.domElement);
  const controls=new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping=true; controls.dampingFactor=0.08; controls.enablePan=true; controls.screenSpacePanning=true;
  controls.touches={ONE:THREE.TOUCH.ROTATE, TWO:THREE.TOUCH.DOLLY_PAN};
  controls.minDistance=MAXD*0.5; controls.maxDistance=MAXD*1.8; controls.maxPolarAngle=1.45;
  controls.target.set(CX,1.5,CZ);

  scene.add(new THREE.AmbientLight(0xffffff,0.68));
  const sun=new THREE.DirectionalLight(0xfff3e0,0.9); sun.position.set(MAXD*0.4,MAXD*0.7,MAXD*0.3); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfeeff,0x4a7c59,0.35));

  // 地形高度場
  const TW=MAPW+18, TH=MAPH+18, SX=Math.min(190,Math.round(TW*2.4)), SZ=Math.min(190,Math.round(TH*2.4));
  const tgeo=new THREE.PlaneGeometry(TW,TH,SX,SZ); tgeo.rotateX(-Math.PI/2); tgeo.translate(CX,0,CZ);
  const pos=tgeo.attributes.position, colArr=[];
  const cSand=new THREE.Color(0xE6D6A0),cGrass=new THREE.Color(0x90C063),cGreen=new THREE.Color(0x68A046),cRock=new THREE.Color(0x9A9080),tmp=new THREE.Color();
  for(let i=0;i<pos.count;i++){ const x=pos.getX(i),z=pos.getZ(i),h=terrainH(x,z); pos.setY(i,h);
    if(h<0.5) tmp.copy(cSand);
    else if(h<BASE*0.5) tmp.copy(cSand).lerp(cGrass,smooth(0.5,BASE*0.5,h));
    else if(h<BASE+0.4) tmp.copy(cGrass).lerp(cGreen,smooth(BASE*0.5,BASE+0.4,h));
    else tmp.copy(cGreen).lerp(cRock,smooth(BASE+0.4,BASE+HILL,h));
    colArr.push(tmp.r,tmp.g,tmp.b); }
  tgeo.setAttribute('color',new THREE.Float32BufferAttribute(colArr,3)); tgeo.computeVertexNormals();
  scene.add(new THREE.Mesh(tgeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.96,metalness:0.0})));

  // 海
  const sgeo=new THREE.PlaneGeometry(TW+44,TH+44,52,46); sgeo.rotateX(-Math.PI/2); sgeo.translate(CX,0,CZ);
  const sp=sgeo.attributes.position, sBase=[]; for(let i=0;i<sp.count;i++) sBase.push(sp.getX(i),sp.getZ(i));
  const sea=new THREE.Mesh(sgeo,new THREE.MeshStandardMaterial({color:0x2C8FC4,transparent:true,opacity:0.82,roughness:0.22,metalness:0.1}));
  sea.position.y=SEA_Y; scene.add(sea);

  // 跨海大橋（真實位置）
  const bdx=BRIDGE.bx-BRIDGE.ax, bdz=BRIDGE.bz-BRIDGE.az, blen=Math.hypot(bdx,bdz);
  const bridge=new THREE.Mesh(new THREE.BoxGeometry(blen+1.4,0.5,1.1), new THREE.MeshStandardMaterial({color:0xC9B79A,roughness:0.7}));
  bridge.position.set((BRIDGE.ax+BRIDGE.bx)/2, SEA_Y+1.0, (BRIDGE.az+BRIDGE.bz)/2);
  bridge.rotation.y=-Math.atan2(bdz,bdx); scene.add(bridge);

  const pinObjs=[];
  SPOTS.forEach(s=>{
    const baseY=Math.max(terrainH(s.x,s.z),SEA_Y), g=new THREE.Group();
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,3.2,8),new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.6})); pole.position.y=1.6; g.add(pole);
    const head=new THREE.Mesh(new THREE.SphereGeometry(1.0,18,18),new THREE.MeshStandardMaterial({color:COL[s.t],emissive:COL[s.t],emissiveIntensity:0.25,roughness:0.4})); head.position.y=3.5; g.add(head);
    g.position.set(s.x,baseY,s.z); scene.add(g);
    const el=document.createElement('div'); el.className='m3d-label'; el.textContent=s.n; el.style.display='none'; labelLayer.appendChild(el);
    const ln=document.createElementNS('http://www.w3.org/2000/svg','line'); ln.setAttribute('class','m3d-leader'); ln.style.display='none'; leaderSvg.appendChild(ln);
    pinObjs.push({s,g,head,baseY,hw:new THREE.Vector3(),el,ln});
  });

  const ROUTES={
    1:['✈ 馬公機場','馬公住宿','佶肯GK漢堡'],
    2:['馬公住宿','鐘記燒餅','藍冉刨冰','篤行十村','小島一隅','三哥雞排'],
    3:['馬公住宿','後寮天堂路','通樑古榕','跨海大橋','大菓葉玄武岩','二崁聚落','大池炸粿','鯨魚洞'],
    4:['馬公住宿','摩西分海','很大的馬桶','馬公住宿']
  };
  const nodeOf=n=>SPOTS.find(o=>o.n===n);
  const routeObjs={};
  Object.keys(ROUTES).forEach(day=>{
    const pts=ROUTES[day].map(n=>{const s=nodeOf(n); return new THREE.Vector3(s.x,Math.max(terrainH(s.x,s.z),SEA_Y)+1.8,s.z);});
    const curve=new THREE.CatmullRomCurve3(pts,false,'catmullrom',0.3);
    const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,160,0.5,8,false),new THREE.MeshStandardMaterial({color:DAY_COL[day],emissive:DAY_COL[day],emissiveIntensity:0.4,roughness:0.4}));
    scene.add(tube); routeObjs[day]={tube,curve};
  });
  const traveler=new THREE.Mesh(new THREE.SphereGeometry(1.1,16,16),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xffdd55,emissiveIntensity:0.6})); scene.add(traveler);

  let activeDay='all';
  function setDay(day){
    activeDay=day; routeNameEl.textContent=DAY_NAME[day]||'';
    Object.keys(routeObjs).forEach(d=>{routeObjs[d].tube.visible=(day==='all'||String(day)===d);});
    pinObjs.forEach(o=>{ const on=(day==='all')||o.s.d.indexOf(Number(day))>=0; o.g.visible=on; const sl=on&&day!=='all'; o.el.style.display=sl?'block':'none'; o.ln.style.display=sl?'block':'none'; });
    traveler.visible=(day!=='all');
    document.querySelectorAll('#map3dTabs .map3d-tab').forEach(b=>b.classList.toggle('active',b.dataset.day===String(day)));
  }
  document.querySelectorAll('#map3dTabs .map3d-tab').forEach(btn=>btn.addEventListener('click',()=>setDay(btn.dataset.day==='all'?'all':Number(btn.dataset.day))));

  function resize(){ const w=holder.clientWidth||360,h=holder.clientHeight||300; renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix(); leaderSvg.setAttribute('width',w); leaderSvg.setAttribute('height',h); }
  window.addEventListener('resize',resize);
  const trafficTab=document.querySelector('.tab-btn[data-page="page-traffic"]'); if(trafficTab) trafficTab.addEventListener('click',()=>setTimeout(resize,60));

  const _v=new THREE.Vector3();
  function updateLabels(){
    const w=holder.clientWidth,h=holder.clientHeight,active=[];
    pinObjs.forEach(o=>{ if(o.el.style.display==='none') return; o.head.getWorldPosition(o.hw); _v.copy(o.hw); _v.project(camera); const sx=(_v.x*0.5+0.5)*w,sy=(-_v.y*0.5+0.5)*h; active.push({o,sx,sy,lx:sx,ly:sy-22}); });
    active.sort((a,b)=>a.ly-b.ly);
    const GAP=17;
    for(let i=0;i<active.length;i++) for(let j=0;j<i;j++) if(Math.abs(active[i].lx-active[j].lx)<78 && Math.abs(active[i].ly-active[j].ly)<GAP) active[i].ly=active[j].ly+GAP;
    active.forEach(a=>{ const hw=(a.o.el.offsetWidth||60)/2+4; a.lx=Math.max(hw,Math.min(w-hw,a.lx)); a.ly=Math.max(14,Math.min(h-14,a.ly)); a.o.el.style.left=a.lx+'px'; a.o.el.style.top=a.ly+'px'; a.o.ln.setAttribute('x1',a.sx); a.o.ln.setAttribute('y1',a.sy); a.o.ln.setAttribute('x2',a.lx); a.o.ln.setAttribute('y2',a.ly+8); });
  }

  const t0=performance.now();
  function animate(){
    requestAnimationFrame(animate);
    const t=(performance.now()-t0)/1000;
    for(let i=0;i<sp.count;i++){ const bx=sBase[i*2],bz=sBase[i*2+1]; sp.setY(i,Math.sin(bx*0.5+t)*0.18+Math.cos(bz*0.4+t*1.2)*0.14); } sp.needsUpdate=true;
    pinObjs.forEach((o,i)=>{ if(o.g.visible) o.g.position.y=o.baseY+Math.sin(t*2+i)*0.22; });
    if(activeDay!=='all'&&routeObjs[activeDay]){ const p=routeObjs[activeDay].curve.getPointAt((t*0.12)%1); traveler.position.copy(p); traveler.position.y+=0.4; }
    controls.update(); renderer.render(scene,camera); updateLabels();
  }
  if(fallback) fallback.remove();
  resize(); setDay('all'); animate();
})();
