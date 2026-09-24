/* ============================================================
   旅程頁共用模組
   功能：1) 從 trips.json 產生景點卡片（單一資料來源）
        2) 旅途開支評分：旅行期間的記帳支出（ledger_entries）＋評論（trip_reviews）
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

/* ── 2) 旅途開支評分 ─────────────────────────────────────
   可評分的是「旅行期間的記帳支出」，不是景點/行程。
   這裡只讀取記帳資料來顯示，評論另存 trip_reviews，兩邊互不影響。 */
function loadScript(src) {
  return new Promise((ok, fail) => {
    if (window.HLReviews) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = fail;
    document.head.appendChild(s);
  });
}

async function setupExpenseReviews(trip) {
  const page = document.getElementById('page-spots');
  if (!page || !trip.startDate) return;
  try { await loadScript('../assets/reviews.js'); } catch (e) { console.warn('reviews.js 載入失敗', e); return; }
  const R = window.HLReviews;

  const wrap = document.createElement('div');
  wrap.className = 'exp-section';
  wrap.innerHTML = `
    <div class="page-section-title">💸 旅途開支評分</div>
    <div class="exp-hint">旅行期間的記帳會自動出現在這裡，點一下就能評分・長按評論可刪除</div>
    <div id="expList"><div class="exp-empty">載入中…</div></div>`;
  page.insertBefore(wrap, page.firstChild);
  const listEl = wrap.querySelector('#expList');

  // 底部彈窗（依 CLAUDE.md 慣例放在 .pages 內）
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
      <div class="role-row" id="rateSheetRoles">
        <span class="role-label">我是</span>
        <button class="role-btn role-H" data-role="H" type="button">H</button>
        <button class="role-btn role-L" data-role="L" type="button">L</button>
      </div>
      <div class="star-row" id="rateSheetStars">
        <span class="star sheet-star" data-v="1">⭐</span>
        <span class="star sheet-star" data-v="2">⭐</span>
        <span class="star sheet-star" data-v="3">⭐</span>
        <span class="star sheet-star" data-v="4">⭐</span>
        <span class="star sheet-star" data-v="5">⭐</span>
      </div>
      <textarea class="review-textarea" id="rateSheetText" placeholder="寫下感想（選填）…"></textarea>
      <button class="submit-btn" id="rateSheetBtn" type="button" disabled>請先選擇角色與星數</button>
    </div>`;
  host.appendChild(sheetBg);

  const $ = id => document.getElementById(id);
  const nameEl = $('rateSheetName'), countEl = $('rateSheetCount'), revsEl = $('rateSheetRevs');
  const starsEl = $('rateSheetStars'), textEl = $('rateSheetText'), btn = $('rateSheetBtn');
  let items = [], reviews = {}, cur = null, rating = 0, role = '';

  function group(rows) {
    reviews = {};
    rows.forEach(r => { (reviews[r.trip_id] ??= []).push(r); });
  }

  function syncBtn() {
    btn.disabled = !(rating && role);
    btn.textContent = !role ? '請先選擇角色' : !rating ? '請先選擇星數' : `以 ${role} 送出評分`;
  }

  function renderList() {
    if (!items.length) {
      listEl.innerHTML = '<div class="exp-empty">旅行期間還沒有記帳紀錄</div>';
      return;
    }
    let lastDate = '';
    listEl.innerHTML = items.map((it, i) => {
      const st = R.stats(reviews[it.key] || []);
      const d = new Date(it.date + 'T00:00:00');
      const head = it.date !== lastDate
        ? `<div class="exp-date">${d.getMonth() + 1}/${d.getDate()}（${'日一二三四五六'[d.getDay()]}）</div>` : '';
      lastDate = it.date;
      return `${head}
        <div class="exp-card" data-i="${i}">
          <div class="exp-emoji">${it.emoji}</div>
          <div class="exp-info">
            <div class="exp-name${it.hasName ? '' : ' unnamed'}">${escHtml(it.name)}</div>
            <div class="exp-meta">${it.hasName ? `${escHtml(it.ledgerCat)}・$${it.amount.toLocaleString('zh-TW')}` : '沒寫備註・可到記帳頁補上'}</div>
          </div>
          <button class="rate-btn${st ? ' has-rating' : ''}" type="button">${st ? '⭐ ' + st.avg : '⭐ 評分'}</button>
        </div>`;
    }).join('');
    listEl.querySelectorAll('.exp-card').forEach(card =>
      card.addEventListener('click', () => openSheet(items[+card.dataset.i])));
  }

  function renderRevs() {
    const revs = reviews[cur.key] || [];
    const st = R.stats(revs);
    countEl.textContent = revs.length
      ? `平均 ${st ? st.avg : '–'} 分・共 ${revs.length} 則・長按可刪除`
      : '還沒有評分，成為第一個吧！';
    revsEl.innerHTML = revs.map((r, i) => {
      const { role: rr, text } = R.parse(r);
      return `<div class="sheet-review-item" data-i="${i}">
          ${rr ? `<span class="role-tag role-${rr}">${rr}</span>` : ''}
          ${r.rating ? `<span>${'⭐'.repeat(r.rating)}</span>` : ''}
          ${text ? `<span class="sheet-review-text">${escHtml(text)}</span>` : ''}
        </div>`;
    }).join('');
    revsEl.querySelectorAll('.sheet-review-item').forEach(el => {
      const r = revs[+el.dataset.i];
      R.onLongPress(el, async () => {
        if (!confirm('刪除這則評論？')) return;
        try {
          await R.remove(r);
          reviews[cur.key] = (reviews[cur.key] || []).filter(x => x !== r);
          renderRevs(); renderList();
        } catch (e) { alert('刪除失敗，請再試一次'); }
      });
    });
  }

  function paintRoles() {
    $('rateSheetRoles').querySelectorAll('.role-btn').forEach(b => b.classList.toggle('active', b.dataset.role === role));
  }

  function openSheet(it) {
    cur = it; rating = 0; role = R.lastRole();
    nameEl.textContent = it.name;
    textEl.value = '';
    starsEl.querySelectorAll('.sheet-star').forEach(s => s.classList.remove('lit'));
    paintRoles(); syncBtn(); renderRevs();
    sheetBg.classList.add('open');
  }

  sheetBg.addEventListener('click', e => { if (e.target === sheetBg) sheetBg.classList.remove('open'); });
  $('rateSheetClose').addEventListener('click', () => sheetBg.classList.remove('open'));
  $('rateSheetRoles').querySelectorAll('.role-btn').forEach(b => b.addEventListener('click', () => {
    role = b.dataset.role; paintRoles(); syncBtn();
  }));
  starsEl.querySelectorAll('.sheet-star').forEach(star => star.addEventListener('click', () => {
    rating = parseInt(star.dataset.v);
    starsEl.querySelectorAll('.sheet-star').forEach(s => s.classList.toggle('lit', parseInt(s.dataset.v) <= rating));
    syncBtn();
  }));
  btn.addEventListener('click', async () => {
    if (!rating || !role) return;
    btn.disabled = true; btn.textContent = '送出中…';
    try {
      await R.post(cur.key, rating, role, textEl.value.trim());
      group(await R.fetchByKeys(items.map(x => x.key)));
      renderRevs(); renderList();
      rating = 0; textEl.value = '';
      starsEl.querySelectorAll('.sheet-star').forEach(s => s.classList.remove('lit'));
      btn.textContent = '謝謝你的評分 ✓';
      setTimeout(syncBtn, 1200);
    } catch (e) {
      btn.textContent = '送出失敗，請重試'; btn.disabled = false;
    }
  });

  try {
    items = (await R.fetchExpenses(trip.startDate, trip.endDate || trip.startDate)).map(R.entryItem);
    group(await R.fetchByKeys([...new Set(items.map(x => x.key))]));
    renderList();
  } catch (e) {
    console.warn('旅途開支載入失敗', e);
    listEl.innerHTML = '<div class="exp-empty">⚠️ 記帳資料載入失敗</div>';
  }
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

  function scatterPos(i, n, W, H, PW, PH) {
    // 以畫面中心為核心向外散開（向日葵螺旋）；先放外圈、最後一張落在正中間最上層
    const k = n - 1 - i;
    const t = n <= 1 ? 0 : Math.sqrt((k + 0.5) / n);
    const a = k * 2.39996 + randBetween(-0.3, 0.3);
    const rx = Math.min((W - PW) / 2 + PW * 0.15, 260);
    const ry = Math.min((H - PH) / 2, 330);
    return {
      x: W / 2 + Math.cos(a) * rx * t - PW / 2 + randBetween(-12, 12),
      y: H / 2 + Math.sin(a) * ry * t - PH / 2 + randBetween(-12, 12),
    };
  }

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

        const { x, y } = scatterPos(i, photoData.length, W, H, PW, PH);
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
  if (trip) setupExpenseReviews(trip);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
})();
