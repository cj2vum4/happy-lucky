/* ============================================================
   旅程頁共用模組
   功能：1) 從 trips.json 產生景點卡片（單一資料來源）
        2) 景點/行程項目評分（Supabase trip_reviews）
        3) Polaroid 照片牆＋lightbox（照片同樣來自 trips.json）
   使用方式（旅程頁 </body> 前）：
     <script>window.TRIP_ID = 'penghu-2026';</script>
     <script src="../assets/trip-page.js" defer></script>
   頁面需要的容器：#page-spots 內放 <div id="spotList"></div>、
   #page-photos 內放 <div class="photo-wall" id="photoWall"></div>
   ============================================================ */
(function () {
'use strict';

const SB_URL = 'https://cmwtceczabbszhdgvwcj.supabase.co';
const SB_KEY = 'sb_publishable_hDrADaLoZfAGDJH1i_JeHw_OSv_oqAu';
const SB_HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };

const BADGE = {
  '食物':     ['食物', 'badge-in'],
  '室內景點': ['室內', 'badge-in'],
  '室外景點': ['室外', 'badge-out'],
  '住宿':     ['住宿', 'badge-stay'],
};

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function randBetween(a, b) { return a + Math.random() * (b - a); }

/* ── 1) 景點卡片 ─────────────────────────────────────────── */
function renderSpots(trip) {
  const list = document.getElementById('spotList');
  if (!list || !trip.spots) return;
  list.innerHTML = trip.spots.map(s => {
    const [text, cls] = BADGE[s.category] || ['景點', 'badge-out'];
    return `
      <div class="spot-card">
        <div class="spot-emoji-wrap">${escHtml(s.emoji || '📍')}</div>
        <div class="spot-info">
          <div class="spot-name">${escHtml(s.name)}</div>
          <div class="spot-desc">${escHtml(s.desc || '')}</div>
        </div>
        <span class="spot-badge ${cls}">${text}</span>
      </div>`;
  }).join('');
}

/* ── 2) 評分系統 ─────────────────────────────────────────── */
function setupRating(ITEM_PREFIX) {
  if (!ITEM_PREFIX) return;

  // 注入底部彈窗（依 CLAUDE.md 慣例放在 .pages 內）
  const host = document.querySelector('.pages') || document.body;
  const sheetBg = document.createElement('div');
  sheetBg.className = 'rate-sheet-bg';
  sheetBg.id = 'rateSheetBg';
  sheetBg.innerHTML = `
    <div class="rate-sheet">
      <div class="rate-sheet-handle"></div>
      <div class="rate-sheet-header">
        <div class="rate-sheet-name" id="rateSheetName"></div>
        <button class="rate-sheet-close-btn" id="rateSheetClose" type="button">✕</button>
      </div>
      <div class="rate-sheet-count" id="rateSheetCount"></div>
      <div class="rate-sheet-revs" id="rateSheetRevs"></div>
      <div class="star-row" id="rateSheetStars">
        <span class="star sheet-star" data-v="1">⭐</span>
        <span class="star sheet-star" data-v="2">⭐</span>
        <span class="star sheet-star" data-v="3">⭐</span>
        <span class="star sheet-star" data-v="4">⭐</span>
        <span class="star sheet-star" data-v="5">⭐</span>
      </div>
      <textarea class="review-textarea" id="rateSheetText" placeholder="寫下感想（選填）…"></textarea>
      <button class="submit-btn" id="rateSheetBtn" type="button" disabled>請先選擇星數</button>
    </div>`;
  host.appendChild(sheetBg);

  let itemReviews = {};
  let sheetItemId = '';
  let sheetRating = 0;

  const rateSheetName  = document.getElementById('rateSheetName');
  const rateSheetCount = document.getElementById('rateSheetCount');
  const rateSheetRevs  = document.getElementById('rateSheetRevs');
  const rateSheetStars = document.getElementById('rateSheetStars');
  const rateSheetText  = document.getElementById('rateSheetText');
  const rateSheetBtn   = document.getElementById('rateSheetBtn');

  async function loadItemReviews() {
    try {
      const res = await fetch(
        `${SB_URL}/rest/v1/trip_reviews?trip_id=like.${ITEM_PREFIX}*&order=created_at.desc`,
        { headers: SB_HEADERS }
      );
      const data = await res.json();
      if (!Array.isArray(data)) return;
      itemReviews = {};
      data.forEach(r => {
        if (!itemReviews[r.trip_id]) itemReviews[r.trip_id] = [];
        itemReviews[r.trip_id].push(r);
      });
      refreshRateBtns();
    } catch (e) { console.warn('評分載入失敗', e); }
  }

  function refreshRateBtns() {
    document.querySelectorAll('[data-item-id]').forEach(card => {
      const revs = itemReviews[card.dataset.itemId] || [];
      const btn = card.querySelector('.rate-btn');
      if (!btn) return;
      const ratings = revs.filter(r => r.rating).map(r => r.rating);
      if (ratings.length > 0) {
        const avg = (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1);
        btn.innerHTML = `⭐ ${avg}`;
        btn.classList.add('has-rating');
      } else {
        btn.innerHTML = '⭐ 評分';
        btn.classList.remove('has-rating');
      }
    });
  }

  function makeBtn(itemId, name) {
    const btn = document.createElement('button');
    btn.className = 'rate-btn';
    btn.innerHTML = '⭐ 評分';
    btn.type = 'button';
    btn.addEventListener('click', e => { e.stopPropagation(); openRateSheet(itemId, name); });
    return btn;
  }

  function injectRateButtons() {
    document.querySelectorAll('.itinerary-card').forEach(card => {
      const nameEl = card.querySelector('.itinerary-name');
      if (!nameEl) return;
      const name = nameEl.textContent.trim();
      const itemId = ITEM_PREFIX + name;
      card.dataset.itemId = itemId;
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;justify-content:flex-end;margin-top:8px';
      wrap.appendChild(makeBtn(itemId, name));
      card.appendChild(wrap);
    });

    document.querySelectorAll('.spot-card').forEach(card => {
      const nameEl = card.querySelector('.spot-name');
      if (!nameEl) return;
      const name = nameEl.textContent.trim();
      const itemId = ITEM_PREFIX + name;
      card.dataset.itemId = itemId;
      const btn = makeBtn(itemId, name);
      btn.style.marginLeft = '8px';
      card.appendChild(btn);
    });

    loadItemReviews();
  }

  function openRateSheet(itemId, name) {
    sheetItemId = itemId;
    sheetRating = 0;
    rateSheetName.textContent = name;
    rateSheetText.value = '';
    rateSheetBtn.disabled = true;
    rateSheetBtn.textContent = '請先選擇星數';
    rateSheetStars.querySelectorAll('.sheet-star').forEach(s => s.classList.remove('lit'));

    const revs = itemReviews[itemId] || [];
    if (revs.length > 0) {
      const ratings = revs.filter(r => r.rating).map(r => r.rating);
      const avg = ratings.length
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
        : '–';
      rateSheetCount.textContent = `平均 ${avg} 分・共 ${revs.length} 則`;
      rateSheetRevs.innerHTML = revs.slice(0, 3).map(r => `
        <div class="sheet-review-item">
          ${r.rating ? `<span>${'⭐'.repeat(r.rating)}</span>` : ''}
          ${r.comment ? `<span class="sheet-review-text">${escHtml(r.comment)}</span>` : ''}
        </div>`).join('');
    } else {
      rateSheetCount.textContent = '還沒有評分，成為第一個吧！';
      rateSheetRevs.innerHTML = '';
    }
    sheetBg.classList.add('open');
  }

  sheetBg.addEventListener('click', e => {
    if (e.target === sheetBg) sheetBg.classList.remove('open');
  });
  document.getElementById('rateSheetClose').addEventListener('click', () => {
    sheetBg.classList.remove('open');
  });

  rateSheetStars.querySelectorAll('.sheet-star').forEach(star => {
    star.addEventListener('click', () => {
      sheetRating = parseInt(star.dataset.v);
      rateSheetStars.querySelectorAll('.sheet-star')
        .forEach(s => s.classList.toggle('lit', parseInt(s.dataset.v) <= sheetRating));
      rateSheetBtn.disabled = false;
      rateSheetBtn.textContent = '送出評分';
    });
  });

  rateSheetBtn.addEventListener('click', async () => {
    if (!sheetRating) return;
    rateSheetBtn.disabled = true;
    rateSheetBtn.textContent = '送出中…';
    const comment = rateSheetText.value.trim() || null;
    try {
      const res = await fetch(`${SB_URL}/rest/v1/trip_reviews`, {
        method: 'POST',
        headers: { ...SB_HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ trip_id: sheetItemId, rating: sheetRating, comment })
      });
      if (res.ok || res.status === 201) {
        if (!itemReviews[sheetItemId]) itemReviews[sheetItemId] = [];
        itemReviews[sheetItemId].unshift({
          trip_id: sheetItemId, rating: sheetRating, comment,
          created_at: new Date().toISOString()
        });
        refreshRateBtns();
        rateSheetBtn.textContent = '謝謝你的評分 ✓';
        setTimeout(() => sheetBg.classList.remove('open'), 1200);
      } else {
        rateSheetBtn.textContent = '送出失敗，請重試';
        rateSheetBtn.disabled = false;
      }
    } catch {
      rateSheetBtn.textContent = '送出失敗，請重試';
      rateSheetBtn.disabled = false;
    }
  });

  injectRateButtons();
}

/* ── 3) Polaroid 照片牆＋Lightbox ────────────────────────── */
function setupPhotoWall(photos) {
  const page = document.getElementById('page-photos');
  if (!page) return;

  let wall = document.getElementById('photoWall');
  if (!wall) {
    wall = document.createElement('div');
    wall.className = 'photo-wall';
    wall.id = 'photoWall';
    page.innerHTML = '';
    page.appendChild(wall);
  }

  if (!photos.length) {
    wall.innerHTML = `
      <div class="photo-empty">
        <div class="photo-empty-emoji">📷</div>
        <div>照片規劃中</div>
        <div class="photo-empty-sub">旅行結束後上傳</div>
      </div>`;
    return;
  }

  // 頁面在子資料夾內，trips.json 的相對路徑要往上一層
  const photoData = photos.map(p => ({
    src: /^https?:\/\//.test(p.src) ? p.src : '../' + p.src,
    caption: p.caption || '',
  }));

  // overlay 與 ↺ 按鈕（頁面沒有就自動補）
  let overlay = document.getElementById('photoOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'photoOverlay';
    document.body.appendChild(overlay);
  }
  let refreshBtn = document.getElementById('photoRefreshBtn');
  if (!refreshBtn) {
    refreshBtn = document.createElement('button');
    refreshBtn.id = 'photoRefreshBtn';
    refreshBtn.textContent = '↺';
    document.body.appendChild(refreshBtn);
  }
  refreshBtn.onclick = () => resetPhotoWall();

  // lightbox（自帶）
  let lightbox = document.getElementById('lightbox');
  if (!lightbox) {
    lightbox = document.createElement('div');
    lightbox.className = 'lightbox';
    lightbox.id = 'lightbox';
    lightbox.innerHTML = `
      <button class="lightbox-close" id="lightboxClose" type="button">✕</button>
      <img id="lightboxImg" src="" alt="">`;
    document.body.appendChild(lightbox);
  }
  const lightboxImg = lightbox.querySelector('#lightboxImg');
  lightbox.querySelector('#lightboxClose').addEventListener('click', () => lightbox.classList.remove('open'));
  lightbox.addEventListener('click', e => { if (e.target === lightbox) lightbox.classList.remove('open'); });
  function openLightbox(src) { lightboxImg.src = src; lightbox.classList.add('open'); }

  // 相對 viewport 的散落分區，鋪滿螢幕並遮住上下導覽
  const ZONES = [
    [0.00, -0.03], [0.38, -0.05], [0.60, 0.02],
    [-0.08, 0.20], [0.28, 0.22],  [0.58, 0.17],
    [0.04, 0.45],  [0.38, 0.47],  [0.60, 0.42],
    [-0.03, 0.66], [0.25, 0.69],  [0.48, 0.69],
  ];

  let photoWallReady = false;

  function initPhotoWall() {
    if (photoWallReady) return;
    photoWallReady = true;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const PW = 176; // 160px 照片 + 8px*2 邊框
    const PH = 218; // 160px 照片 + 8px 上緣 + 50px 下緣

    photoData.forEach((p, i) => {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'polaroid';

        const zone = ZONES[i % ZONES.length];
        const x = zone[0] * W + randBetween(-PW * 0.15, PW * 0.15);
        const y = zone[1] * H + randBetween(-PH * 0.12, PH * 0.12);
        const rot = randBetween(-15, 15);

        el.style.cssText = `position:fixed;left:${x}px;top:${y}px;z-index:${50 + i};pointer-events:auto`;
        el.style.setProperty('--r', rot + 'deg');
        el.innerHTML = `<img src="${escHtml(p.src)}" alt="${escHtml(p.caption)}" loading="lazy"><div class="polaroid-caption">${escHtml(p.caption)}</div>`;

        // 長按 → lightbox
        let pressTimer, longPressed = false;
        const startPress = () => {
          longPressed = false;
          pressTimer = setTimeout(() => { longPressed = true; openLightbox(p.src); }, 480);
        };
        const cancelPress = () => clearTimeout(pressTimer);
        el.addEventListener('touchstart', startPress, { passive: true });
        el.addEventListener('touchend',   cancelPress);
        el.addEventListener('touchmove',  cancelPress, { passive: true });
        el.addEventListener('mousedown',  startPress);
        el.addEventListener('mouseup',    cancelPress);
        el.addEventListener('mouseleave', cancelPress);

        // 點擊 → 飛走（長按後不觸發）
        el.addEventListener('click', () => {
          if (longPressed) return;
          el.classList.remove('placing');
          void el.offsetWidth;
          el.classList.add('removing');
          el.addEventListener('animationend', () => el.remove(), { once: true });
        });

        overlay.appendChild(el);
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('placing')));
      }, i * 350 + 150);
    });
  }

  function resetPhotoWall() {
    overlay.innerHTML = '';
    photoWallReady = false;
    setTimeout(initPhotoWall, 80);
  }
  window.resetPhotoWall = resetPhotoWall;

  // 切到照片分頁時啟動；離開時收起 overlay 與 ↺
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.page === 'page-photos') {
        overlay.classList.add('active');
        refreshBtn.classList.add('visible');
        setTimeout(initPhotoWall, 80);
      } else {
        overlay.classList.remove('active');
        refreshBtn.classList.remove('visible');
      }
    });
  });
}

/* ── 啟動 ────────────────────────────────────────────────── */
async function boot() {
  const id = window.TRIP_ID;
  if (!id) { console.warn('trip-page.js：TRIP_ID 未設定'); return; }
  let trip = null;
  try {
    const res = await fetch('../trips.json');
    const data = await res.json();
    trip = (data.trips || []).find(t => t.id === id) || null;
    if (!trip) console.warn(`trip-page.js：trips.json 找不到 ${id}`);
  } catch (e) { console.warn('trip-page.js：trips.json 載入失敗', e); }

  if (trip) renderSpots(trip);
  setupPhotoWall(trip ? (trip.photos || []) : []);
  setupRating(trip ? (trip.itemPrefix || '') : '');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
})();
