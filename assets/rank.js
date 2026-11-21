/* ============================================================
   武林風雲榜（index.html 第 5 個分頁 #page-ranking）
   - 資料沿用「想去」的做法：Supabase trip_reviews，
       trip_id = 'rank__{itemId}'、comment = JSON 事件、insert-only，
       讀取時依 created_at 升冪折疊成最新狀態（不需要 UPDATE / DELETE 權限，不開新表）
   - 事件：
       {t:'add',  major, cat, name, city, dist, note, map, rank}  新增上榜（插入該名次，以下順推）
       {t:'edit', major, cat, name, city, dist, note, map}        編輯內容（換品類＝以原名次移到新榜）
       {t:'rank', v:1|2|3}                                         調整名次／從名人堂重返榜單
       {t:'hall'}                                                  移出領獎台，送入名人堂
       {t:'del'}                                                   刪除
     擠出前三的店自動進名人堂，記錄卸榜名次、日期、被誰取代、曾達到的最高名次
   - 種子資料只存在本檔 SEEDS，視為最早的事件，從不寫入資料庫 → 不會重複寫入；
     之後對種子的編輯／換榜事件照常寫進資料庫
   - rank__ 開頭的資料不會進任何評分或查詢統計（那些查詢都用 food__ / exp__ 或精準 key）
   - 所有 class 皆以 rk- 開頭（樣式在 assets/rank.css）
   ============================================================ */
(function () {
'use strict';

const root = document.getElementById('rkRoot');
if (!root) return;

const R = window.HLReviews || {};
const SB_URL = R.SB_URL;
const SB_KEY = R.SB_KEY;
const HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const PREFIX = 'rank__';
const PODIUM = 3;
const TITLES = ['狀元', '榜眼', '探花'];
const STEP_NUM = ['壹', '貳', '參'];
const MAJORS = [
  { v: '食物', icon: '🍜', label: '食物榜' },
  { v: '景點', icon: '⛰️', label: '景點榜' },
];
const CACHE_KEY = 'hl-rank-rows-v1';
const CITY_SEEDS = ['台北市', '新北市', '基隆市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '台中市', '彰化縣', '南投縣',
  '雲林縣', '嘉義市', '嘉義縣', '台南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '澎湖縣', '金門縣'];

// 種子：只存在程式裡、永遠排在所有資料庫事件之前
const SEEDS = [
  { id: 'seed-yansuji', t: 'add', major: '食物', cat: '鹽酥雞', name: '雲順鹹酥雞', city: '南投縣', dist: '竹山鎮', note: '最好吃的鹽酥雞', rank: 1 },
  { id: 'seed-pizza',   t: 'add', major: '食物', cat: '披薩',   name: '老屋，食憶小鎮', city: '南投縣', dist: '竹山鎮', note: '最好吃的披薩', rank: 1 },
  { id: 'seed-bawan',   t: 'add', major: '食物', cat: '肉圓',   name: '古早味阿嬤手工肉圓', city: '台中市', dist: '北區', note: '最好吃的肉圓', rank: 1 },
  { id: 'seed-beefnoodle', t: 'add', major: '食物', cat: '牛肉麵', name: '滿庫深夜牛肉麵', city: '台中市', dist: '西區', note: '最好吃的牛肉麵', rank: 1 },
  { id: 'seed-midnight',   t: 'add', major: '食物', cat: '宵夜',   name: '滿庫深夜牛肉麵', city: '台中市', dist: '西區', note: '最好吃的宵夜', rank: 1 },
];
const SEED_ROWS = SEEDS.map(({ id, ...ev }) => ({ trip_id: PREFIX + id, comment: JSON.stringify(ev), created_at: '' }));

const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

const state = {
  rows: [],          // 資料庫事件（含尚未確認的樂觀寫入）
  data: { items: {}, boards: {}, order: [] },
  major: '食物',
  city: 'all',
  cat: 'all',
  loaded: false,
  offline: false,
  hallOpen: false,
};

// ---------- 工具 ----------
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const bkey = it => it.major + '｜' + it.cat;
const place = it => [it.city, it.dist].filter(Boolean).join('・');
const newId = () => 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const mapUrl = it => it.map || ('https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent([it.name, (it.city || '') + (it.dist || '')].filter(Boolean).join(' ')));
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}
function toast(msg) {
  if (typeof window.happyLuckyToast === 'function') { window.happyLuckyToast(msg); return; }
  let el = document.getElementById('rkToast');
  if (!el) { el = document.createElement('div'); el.id = 'rkToast'; el.className = 'rk-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}

function cleanContent(ev) {
  const map = str(ev.map, 500);
  return {
    major: ev.major === '景點' ? '景點' : '食物',
    cat: str(ev.cat, 12),
    name: str(ev.name, 40),
    city: str(ev.city, 10),
    dist: str(ev.dist, 10),
    note: str(ev.note, 60),
    map: /^https?:\/\//i.test(map) ? map : '',
  };
}

// ---------- 事件折疊 ----------
// items[id] = { id, major, cat, name, city, dist, note, map, status:'board'|'hall', best, since, hall:{rank, at, by, why} }
// boards[major｜cat] = [id 狀元, id 榜眼, id 探花]
function fold(rows) {
  const items = {};
  const boards = {};
  const order = [];
  const boardOf = k => boards[k] || (order.push(k), (boards[k] = []));
  const detach = id => {
    const it = items[id];
    if (!it || it.status !== 'board') return 0;
    const list = boardOf(bkey(it));
    const i = list.indexOf(id);
    if (i >= 0) list.splice(i, 1);
    return i + 1;
  };
  const seat = (id, rank, at) => {
    const it = items[id];
    const list = boardOf(bkey(it));
    const max = Math.min(list.length + 1, PODIUM);
    const r = Math.min(Math.max(parseInt(rank, 10) || max, 1), max); // 名次永遠連續，不留空洞
    list.splice(r - 1, 0, id);
    it.status = 'board';
    it.hall = null;
    while (list.length > PODIUM) {
      const out = items[list.pop()];
      out.status = 'hall';
      out.hall = { rank: PODIUM, at, by: it.name, why: 'push' };
    }
    list.forEach((x, i) => { items[x].best = Math.min(items[x].best || 99, i + 1); });
  };

  rows.forEach(r => {
    if (!r || typeof r.trip_id !== 'string' || !r.trip_id.startsWith(PREFIX)) return;
    const id = r.trip_id.slice(PREFIX.length);
    let ev;
    try { ev = typeof r.comment === 'string' ? JSON.parse(r.comment) : null; } catch (e) { return; }
    if (!ev || typeof ev !== 'object') return;
    const at = r.created_at || '';
    const it = items[id];
    if (ev.t === 'add') {
      if (it) return;
      const c = cleanContent(ev);
      if (!c.cat || !c.name) return;
      items[id] = { id, ...c, best: 99, status: 'board', hall: null, since: at };
      seat(id, ev.rank, at);
    } else if (ev.t === 'edit') {
      if (!it) return;
      const c = cleanContent({ ...it, ...ev });
      if (!c.cat || !c.name) return;
      if (it.status === 'board' && bkey(c) !== bkey(it)) {
        const r0 = detach(id);
        Object.assign(it, c);
        seat(id, r0, at);
      } else {
        Object.assign(it, c);
      }
    } else if (ev.t === 'rank') {
      const v = parseInt(ev.v, 10);
      if (!it || !(v >= 1 && v <= PODIUM)) return;
      detach(id);
      seat(id, v, at);
    } else if (ev.t === 'hall') {
      if (!it || it.status !== 'board') return;
      const r0 = detach(id);
      it.status = 'hall';
      it.hall = { rank: r0, at, by: '', why: 'retire' };
    } else if (ev.t === 'del') {
      if (!it) return;
      detach(id);
      delete items[id];
    }
  });

  // 只留下還有人（台上或名人堂）的品類；名人堂成員換過品類時也要有那座榜
  const alive = [];
  Object.values(items).forEach(it => { const k = bkey(it); if (!alive.includes(k)) alive.push(k); });
  alive.forEach(k => boardOf(k));
  return { items, boards, order: order.filter(k => alive.includes(k)) };
}

// ---------- 資料存取 ----------
function saveCache() {
  try {
    const rows = state.rows.filter(r => !r._pending).map(({ trip_id, comment, created_at }) => ({ trip_id, comment, created_at }));
    localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
  } catch (e) { /* 無痕模式等情況：略過快取 */ }
}
function readCache() {
  try { const v = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

async function load() {
  try {
    if (!SB_URL) throw new Error('no supabase');
    const res = await fetch(`${SB_URL}/rest/v1/trip_reviews?trip_id=like.${PREFIX}*&select=trip_id,comment,created_at&order=created_at.asc`, { headers: HEADERS });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('bad payload');
    const pending = state.rows.filter(r => r._pending);
    state.rows = rows.filter(r => typeof r.trip_id === 'string' && r.trip_id.startsWith(PREFIX)).concat(pending);
    state.offline = false;
    saveCache();
  } catch (e) {
    console.warn('風雲榜載入失敗，改用上次的資料', e);
    state.offline = true;
  }
  state.loaded = true;
  refresh();
}

async function insertEvent(itemId, ev) {
  const post = body => fetch(`${SB_URL}/rest/v1/trip_reviews`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
  const row = { trip_id: PREFIX + itemId, comment: JSON.stringify(ev), rating: null };
  try {
    let res = await post(row);
    // rating 欄位不接受 null 時補 1（rank__ 不會出現在任何評分統計裡）
    if (!res.ok) res = await post({ ...row, rating: 1 });
    return res.ok;
  } catch (e) { return false; }
}

// 樂觀更新：先畫，再寫；失敗就撤回
async function commit(itemId, ev, okMsg) {
  const row = { trip_id: PREFIX + itemId, comment: JSON.stringify(ev), created_at: new Date().toISOString(), _pending: true };
  state.rows.push(row);
  refresh();
  const ok = await insertEvent(itemId, ev);
  if (!ok) {
    const i = state.rows.indexOf(row);
    if (i >= 0) state.rows.splice(i, 1);
    refresh();
    toast('儲存失敗，請確認網路後再試一次');
    return false;
  }
  delete row._pending;
  saveCache();
  if (okMsg) toast(okMsg);
  return true;
}

function refresh() {
  state.data = fold(SEED_ROWS.concat(state.rows));
  render();
}

// ---------- 版面 ----------
root.innerHTML = `
  <header class="rk-head">
    <div class="rk-head-rule" aria-hidden="true"></div>
    <h2 class="rk-title"><span>武林風雲榜</span><i class="rk-title-seal" aria-hidden="true">H<br>L</i></h2>
    <div class="rk-sub" id="rkSub">吃遍天下・唯我獨尊</div>
    <button class="rk-add-top" type="button" data-add aria-label="張貼新榜"><b>＋</b><span>張榜</span></button>
  </header>
  <section class="rk-hero" id="rkHero" aria-roledescription="carousel" aria-label="各品類狀元">
    <div class="rk-hero-track" id="rkTrack"></div>
    <div class="rk-dots" id="rkDots" role="tablist" aria-label="切換狀元"></div>
  </section>
  <div class="rk-filters">
    <div class="rk-seg" id="rkMajor" role="tablist" aria-label="大類"></div>
    <div class="rk-chips" id="rkCity" aria-label="縣市"></div>
    <div class="rk-chips" id="rkCats" aria-label="品類"></div>
  </div>
  <div id="rkBoards"></div>
  <details class="rk-hall" id="rkHall">
    <summary><span class="rk-hall-title">🏛 歷屆名人堂</span><span class="rk-hall-count" id="rkHallCount"></span></summary>
    <div class="rk-hall-body" id="rkHallBody"></div>
  </details>
`;

const $ = id => document.getElementById(id);
const track = $('rkTrack');
const dots = $('rkDots');

function majorItems() {
  return Object.values(state.data.items).filter(it => it.major === state.major);
}
function majorBoards() {
  return state.data.order.filter(k => k.startsWith(state.major + '｜'));
}
const cityOk = it => state.city === 'all' || it.city === state.city;

function render() {
  const { items, boards } = state.data;
  const mItems = majorItems();

  // 副標：離線提示
  $('rkSub').textContent = state.offline && state.loaded ? '離線中・顯示上次存下的榜單' : '吃遍天下・唯我獨尊';

  // 大類
  $('rkMajor').innerHTML = MAJORS.map(m =>
    `<button type="button" role="tab" class="rk-seg-btn${m.v === state.major ? ' active' : ''}" aria-selected="${m.v === state.major}" data-major="${m.v}">${m.icon} ${m.label}</button>`).join('');

  // 縣市 chips（2 個以上縣市才出現）
  const cities = [...new Set(mItems.map(it => it.city).filter(Boolean))];
  if (state.city !== 'all' && !cities.includes(state.city)) state.city = 'all';
  $('rkCity').innerHTML = cities.length > 1
    ? `<button type="button" class="rk-chip${state.city === 'all' ? ' active' : ''}" data-city="all">全部縣市</button>` +
      cities.map(c => `<button type="button" class="rk-chip${state.city === c ? ' active' : ''}" data-city="${esc(c)}">📍 ${esc(c)}</button>`).join('')
    : '';

  // 品類 chips（由資料長出來）
  const keys = majorBoards();
  const cats = keys.map(k => k.split('｜')[1]);
  if (state.cat !== 'all' && !cats.includes(state.cat)) state.cat = 'all';
  $('rkCats').innerHTML = cats.length > 1
    ? `<button type="button" class="rk-chip rk-chip-cat${state.cat === 'all' ? ' active' : ''}" data-cat="all">全部品類</button>` +
      cats.map(c => `<button type="button" class="rk-chip rk-chip-cat${state.cat === c ? ' active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')
    : '';

  renderHero(keys);

  // 領獎台
  const shown = keys.filter(k => {
    if (state.cat !== 'all' && k !== state.major + '｜' + state.cat) return false;
    if (state.city === 'all') return true;
    return boards[k].some(id => cityOk(items[id])) ||
      Object.values(items).some(it => it.status === 'hall' && bkey(it) === k && cityOk(it));
  });
  const boardsEl = $('rkBoards');
  if (!keys.length) {
    const m = MAJORS.find(x => x.v === state.major);
    boardsEl.innerHTML = `
      <div class="rk-empty-state">
        <div class="rk-empty-scroll" aria-hidden="true"><span>虛</span><span>位</span><span>以</span><span>待</span></div>
        <h3>${esc(m.label)}尚無英雄</h3>
        <p>${state.major === '景點' ? '走過最美的那個地方，值得一張金榜。' : '吃到「就是這家最好吃」的那一刻，就來張榜吧。'}</p>
        <button type="button" class="rk-btn rk-btn-primary" data-add>＋ 張貼第一張${esc(m.label)}</button>
      </div>`;
  } else if (!shown.length) {
    boardsEl.innerHTML = `<div class="rk-empty-mini">這個縣市還沒有人上榜 ☁️</div>`;
  } else {
    boardsEl.innerHTML = shown.map(k => boardHtml(k)).join('');
  }

  // 名人堂
  const hall = mItems.filter(it => it.status === 'hall')
    .sort((a, b) => (b.hall.at || '').localeCompare(a.hall.at || ''));
  $('rkHallCount').textContent = hall.length ? `${hall.length} 位` : '尚無';
  $('rkHallBody').innerHTML = hall.length
    ? `<ol class="rk-hall-list">${hall.map(hallItemHtml).join('')}</ol>`
    : `<p class="rk-hall-empty">被擠出前三或主動退位的店，會在這裡留名。</p>`;
}

function cardHtml(id, rank) {
  const it = state.data.items[id];
  const dim = cityOk(it) ? '' : ' rk-dim';
  return `
    <div class="rk-card${dim}" role="button" tabindex="0" data-open="${esc(id)}" aria-label="${TITLES[rank - 1]} ${esc(it.name)}">
      <span class="rk-medal">${TITLES[rank - 1]}</span>
      <b class="rk-name">${esc(it.name)}</b>
      ${place(it) ? `<span class="rk-loc">${esc(place(it))}</span>` : ''}
      ${it.note ? `<span class="rk-note">${esc(it.note)}</span>` : ''}
      <a class="rk-map" href="${esc(mapUrl(it))}" target="_blank" rel="noopener" aria-label="${esc(it.name)} 的 Google 地圖">📍 地圖</a>
    </div>`;
}

function boardHtml(k) {
  const list = state.data.boards[k] || [];
  const cat = k.split('｜')[1];
  const col = rank => {
    const id = list[rank - 1];
    const card = id ? cardHtml(id, rank) : `
      <button type="button" class="rk-card rk-vacant" data-add data-add-cat="${esc(cat)}" data-add-rank="${rank}" aria-label="${TITLES[rank - 1]}虛位以待，新增">
        <span class="rk-medal">${TITLES[rank - 1]}</span>
        <span class="rk-vacant-text">虛位以待</span>
        <span class="rk-vacant-plus">＋ 張榜</span>
      </button>`;
    return `<div class="rk-col rk-r${rank}">${card}<div class="rk-step"><span class="rk-step-num">${STEP_NUM[rank - 1]}</span></div></div>`;
  };
  return `
    <section class="rk-board" data-board="${esc(k)}">
      <header class="rk-board-head">
        <span class="rk-board-tag" aria-hidden="true">榜</span>
        <h3 class="rk-board-title">${esc(cat)}</h3>
        <span class="rk-board-count">${list.length}/${PODIUM}</span>
        <button type="button" class="rk-board-add" data-add data-add-cat="${esc(cat)}" aria-label="新增到${esc(cat)}榜">＋</button>
      </header>
      <div class="rk-podium">${col(2)}${col(1)}${col(3)}</div>
    </section>`;
}

function hallInfo(it) {
  const h = it.hall || {};
  const peak = it.best === 1 ? '<span class="rk-hall-badge top">曾登頂</span>'
    : `<span class="rk-hall-badge">曾上榜・最高${TITLES[(it.best || 3) - 1]}</span>`;
  const when = fmtDate(h.at);
  const why = h.why === 'push' ? `被「${esc(h.by)}」擠下` : '主動移入名人堂';
  return { peak, line: `卸榜時第 ${h.rank} 名（${TITLES[(h.rank || 3) - 1]}）・${why}${when ? '・' + when : ''}` };
}

function hallItemHtml(it) {
  const info = hallInfo(it);
  return `
    <li class="rk-hall-item${cityOk(it) ? '' : ' rk-dim'}" role="button" tabindex="0" data-open="${esc(it.id)}">
      <div class="rk-hall-main">${info.peak}<b>${esc(it.name)}</b><span class="rk-hall-cat">${esc(it.cat)}</span></div>
      <div class="rk-hall-meta">${info.line}</div>
    </li>`;
}

// ---------- 冠軍輪播 ----------
let carIdx = 0;
let carTimer = 0;
let carPaused = false;
let carResume = 0;

function renderHero(keys) {
  const { items, boards } = state.data;
  const champs = keys.map(k => items[boards[k][0]]).filter(it => it && cityOk(it));
  if (!champs.length) {
    track.innerHTML = `
      <article class="rk-slide rk-slide-empty">
        <div class="rk-slide-kicker">天下第一</div>
        <div class="rk-slide-cat">虛位以待</div>
        <div class="rk-slide-name">${state.loaded ? '這一榜還沒有狀元' : '榜單揭曉中…'}</div>
        <button type="button" class="rk-slide-cta" data-add>＋ 張貼第一張榜</button>
      </article>`;
    dots.innerHTML = '';
    carIdx = 0;
    return;
  }
  track.innerHTML = champs.map((it, i) => `
    <article class="rk-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} / ${champs.length}" data-open="${esc(it.id)}">
      <div class="rk-slide-kicker">天下第一</div>
      <div class="rk-slide-cat">${esc(it.cat)}</div>
      <div class="rk-slide-name">${esc(it.name)}</div>
      ${place(it) ? `<div class="rk-slide-meta">📍 ${esc(place(it))}</div>` : ''}
      ${it.note ? `<p class="rk-slide-note">${esc(it.note)}</p>` : ''}
      <span class="rk-seal" aria-hidden="true">狀<br>元</span>
    </article>`).join('');
  dots.innerHTML = champs.length > 1 ? champs.map((it, i) =>
    `<button type="button" class="rk-dot" role="tab" data-dot="${i}" aria-label="第 ${i + 1} 位：${esc(it.cat)}"></button>`).join('') : '';
  if (carIdx >= champs.length) carIdx = 0;
  track.scrollLeft = carIdx * track.clientWidth;
  syncDots();
}

function syncDots() {
  dots.querySelectorAll('.rk-dot').forEach((d, i) => {
    d.classList.toggle('active', i === carIdx);
    d.setAttribute('aria-selected', i === carIdx ? 'true' : 'false');
  });
}
function goTo(i) {
  const n = track.children.length;
  if (!n) return;
  carIdx = (i + n) % n;
  track.scrollTo({ left: carIdx * track.clientWidth, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  syncDots();
}
let scrollRaf = 0;
track.addEventListener('scroll', () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    const w = track.clientWidth || 1;
    const i = Math.round(track.scrollLeft / w);
    if (i !== carIdx) { carIdx = i; syncDots(); }
  });
}, { passive: true });

const isVisible = () => root.offsetParent !== null && !document.hidden;
function startCarousel() {
  clearInterval(carTimer);
  carTimer = 0;
  if (reduceMotion.matches) return; // 減少動態：不自動輪播
  carTimer = setInterval(() => {
    if (carPaused || !isVisible() || sheetOpen()) return;
    if (track.children.length > 1) goTo(carIdx + 1);
  }, 4500);
}
function pauseCarousel() {
  carPaused = true;
  clearTimeout(carResume);
}
function resumeCarouselLater() {
  clearTimeout(carResume);
  carResume = setTimeout(() => { carPaused = false; }, 6000);
}
const hero = $('rkHero');
// 手指碰到就暫停；touchstart 不往上傳，避免觸發首頁的「下拉重新整理」並讓左右滑順暢
hero.addEventListener('touchstart', e => { e.stopPropagation(); pauseCarousel(); }, { passive: true });
hero.addEventListener('touchend', resumeCarouselLater, { passive: true });
hero.addEventListener('touchcancel', resumeCarouselLater, { passive: true });
hero.addEventListener('pointerdown', pauseCarousel);
hero.addEventListener('pointerup', resumeCarouselLater);
hero.addEventListener('mouseenter', pauseCarousel);
hero.addEventListener('mouseleave', resumeCarouselLater);
hero.addEventListener('focusin', pauseCarousel);
hero.addEventListener('focusout', resumeCarouselLater);
if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', startCarousel);
window.addEventListener('resize', () => { track.scrollLeft = carIdx * track.clientWidth; });

// ---------- 底部彈窗 ----------
const sheetBg = document.createElement('div');
sheetBg.className = 'rk-sheet-bg';
sheetBg.id = 'rkSheetBg';
sheetBg.hidden = true;
sheetBg.innerHTML = `<div class="rk-sheet" role="dialog" aria-modal="true" aria-labelledby="rkSheetTitle">
  <div class="rk-sheet-handle" aria-hidden="true"></div>
  <div class="rk-sheet-body" id="rkSheetBody"></div>
</div>`;
document.body.appendChild(sheetBg);
const sheetBody = sheetBg.querySelector('#rkSheetBody');
let lastFocus = null;

function sheetOpen() { return !sheetBg.hidden; }
function openSheet(html) {
  lastFocus = document.activeElement;
  sheetBody.innerHTML = html;
  sheetBg.hidden = false;
  document.documentElement.classList.add('rk-lock');
  requestAnimationFrame(() => sheetBg.classList.add('show'));
  const first = sheetBody.querySelector('.rk-x');
  if (first) first.focus({ preventScroll: true });
}
function closeSheet() {
  if (!sheetOpen()) return;
  sheetBg.classList.remove('show');
  document.documentElement.classList.remove('rk-lock');
  setTimeout(() => { sheetBg.hidden = true; sheetBody.innerHTML = ''; }, reduceMotion.matches ? 0 : 220);
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
sheetBg.addEventListener('click', e => { if (e.target === sheetBg) closeSheet(); });
sheetBg.addEventListener('touchstart', e => e.stopPropagation(), { passive: true }); // 彈窗內捲動不觸發下拉重整
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen()) closeSheet(); });

const sheetHead = title => `
  <div class="rk-sheet-head">
    <h3 class="rk-sheet-title" id="rkSheetTitle">${title}</h3>
    <button type="button" class="rk-x" data-act="close" aria-label="關閉">✕</button>
  </div>`;

// 名次選擇器（顯示每個名次目前是誰）
function rankPickHtml(list, opts) {
  return `<div class="rk-rankpick" role="radiogroup" aria-label="${opts.label || '名次'}">` + [1, 2, 3].map(r => {
    const occ = list[r - 1] ? state.data.items[list[r - 1]] : null;
    const cur = opts.current === r;
    const disabled = cur || (opts.maxRank && r > opts.maxRank);
    return `<button type="button" role="radio" class="rk-rp rk-rp${r}${opts.selected === r ? ' active' : ''}${cur ? ' current' : ''}"
      data-rank="${r}" aria-checked="${opts.selected === r}" ${disabled ? 'disabled' : ''}>
      <b>${TITLES[r - 1]}</b><small>${cur ? '目前名次' : occ ? esc(occ.name) : '虛位以待'}</small></button>`;
  }).join('') + '</div>';
}

// 預告：在 list 裡把 movingId 插到 rank，誰會被推動／擠出
function predict(list, rank, movingId) {
  const base = list.filter(id => id !== movingId);
  const r = Math.min(rank, base.length + 1);
  const next = base.slice();
  next.splice(r - 1, 0, movingId || '__new__');
  const notes = [];
  next.forEach((id, i) => {
    if (id === (movingId || '__new__')) return;
    const before = list.indexOf(id);
    const it = state.data.items[id];
    if (i >= PODIUM) notes.push(`<span class="out">${TITLES[before]}「${esc(it.name)}」將被擠進名人堂</span>`);
    else if (before !== i) notes.push(`${TITLES[before]}「${esc(it.name)}」→ ${TITLES[i]}`);
  });
  return { notes, effective: r };
}

// ---- 新增／編輯表單 ----
let form = null; // { mode, id, major, rank, rankTouched }

function catsOf(major) {
  return state.data.order.filter(k => k.startsWith(major + '｜')).map(k => k.split('｜')[1]);
}

function openForm(mode, opts) {
  const it = mode === 'edit' ? state.data.items[opts.id] : null;
  const major = it ? it.major : (opts.major || state.major);
  form = { mode, id: it ? it.id : null, major, rank: opts.rank || 0, rankTouched: !!opts.rank };
  const v = it || { cat: opts.cat || (state.cat !== 'all' ? state.cat : ''), name: '', city: '', dist: '', note: '', map: '' };
  const allItems = Object.values(state.data.items);
  const names = [...new Set(allItems.map(x => x.name))];
  const cities = [...new Set([...allItems.map(x => x.city).filter(Boolean), ...CITY_SEEDS])];
  openSheet(`
    ${sheetHead(mode === 'edit' ? '✏️ 修改榜文' : '🏮 張貼新榜')}
    <form class="rk-form" id="rkForm" novalidate>
      <div class="rk-field">
        <span class="rk-label">大類</span>
        <div class="rk-seg rk-seg-sm" id="rkfMajor">${MAJORS.map(m =>
          `<button type="button" class="rk-seg-btn${m.v === major ? ' active' : ''}" data-fmajor="${m.v}">${m.icon} ${m.v}</button>`).join('')}</div>
      </div>
      <div class="rk-field">
        <label class="rk-label" for="rkfCat">品類 <em>必填</em></label>
        <div class="rk-chips rk-chips-wrap" id="rkfCats"></div>
        <input class="rk-input" id="rkfCat" maxlength="12" autocomplete="off" enterkeyhint="next" placeholder="點上面的品類，或輸入新的（例：宵夜）" value="${esc(v.cat)}">
      </div>
      <div class="rk-field">
        <label class="rk-label" for="rkfName">店名／景點名 <em>必填</em></label>
        <input class="rk-input" id="rkfName" maxlength="40" autocomplete="off" enterkeyhint="next" list="rkfNames" value="${esc(v.name)}">
        <datalist id="rkfNames">${names.map(n => `<option value="${esc(n)}"></option>`).join('')}</datalist>
      </div>
      <div class="rk-row2">
        <div class="rk-field">
          <label class="rk-label" for="rkfCity">縣市</label>
          <input class="rk-input" id="rkfCity" maxlength="10" autocomplete="off" list="rkfCities" placeholder="台中市" value="${esc(v.city)}">
          <datalist id="rkfCities">${cities.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>
        </div>
        <div class="rk-field">
          <label class="rk-label" for="rkfDist">區</label>
          <input class="rk-input" id="rkfDist" maxlength="10" autocomplete="off" placeholder="西區" value="${esc(v.dist)}">
        </div>
      </div>
      <div class="rk-field">
        <label class="rk-label" for="rkfNote">一句評語</label>
        <input class="rk-input" id="rkfNote" maxlength="60" autocomplete="off" placeholder="為什麼它是天下第一？" value="${esc(v.note)}">
      </div>
      <div class="rk-field">
        <label class="rk-label" for="rkfMap">Google 地圖連結 <small>選填・沒填就用店名搜尋</small></label>
        <input class="rk-input" id="rkfMap" maxlength="500" autocomplete="off" inputmode="url" placeholder="https://maps.app.goo.gl/…" value="${esc(v.map)}">
      </div>
      ${mode === 'add' ? `
      <div class="rk-field">
        <span class="rk-label">名次</span>
        <div id="rkfRank"></div>
      </div>` : ''}
      <div class="rk-hint" id="rkfHint" aria-live="polite"></div>
      <button type="submit" class="rk-btn rk-btn-primary rk-btn-block" id="rkfSave">${mode === 'edit' ? '儲存修改' : '🏮 張榜'}</button>
    </form>`);
  syncForm();
}

function formVals() {
  return cleanContent({
    major: form.major,
    cat: $('rkfCat').value, name: $('rkfName').value, city: $('rkfCity').value,
    dist: $('rkfDist').value, note: $('rkfNote').value, map: $('rkfMap').value,
  });
}

function syncForm() {
  if (!form || !$('rkForm')) return;
  const v = formVals();
  // 品類 chips
  const cats = catsOf(form.major);
  $('rkfCats').innerHTML = cats.map(c =>
    `<button type="button" class="rk-chip${c === v.cat ? ' active' : ''}" data-fcat="${esc(c)}">${esc(c)}</button>`).join('');
  $('rkfMajor').querySelectorAll('.rk-seg-btn').forEach(b => b.classList.toggle('active', b.dataset.fmajor === form.major));
  const k = form.major + '｜' + v.cat;
  const list = v.cat ? (state.data.boards[k] || []) : [];
  const hint = $('rkfHint');
  if (form.mode === 'add') {
    const maxRank = Math.min(list.length + 1, PODIUM);
    if (!form.rankTouched || form.rank > maxRank) form.rank = maxRank; // 預設第一個空位；滿了就是探花
    $('rkfRank').innerHTML = rankPickHtml(list, { selected: form.rank, maxRank, label: '名次' });
    if (!v.cat) { hint.innerHTML = '先選或輸入品類'; return; }
    const { notes } = predict(list, form.rank, null);
    hint.innerHTML = `<b>${esc(v.cat)}榜・${TITLES[form.rank - 1]}</b>` + (notes.length ? '<br>' + notes.join('<br>') : (list.length ? '' : '<br>新的一座榜就此開張！'));
  } else {
    const it = state.data.items[form.id];
    if (it && it.status === 'board' && v.cat && k !== bkey(it)) {
      const rank = state.data.boards[bkey(it)].indexOf(it.id) + 1;
      const { notes, effective } = predict(list, rank, it.id);
      hint.innerHTML = `換品類：移到「${esc(v.cat)}」榜的${TITLES[effective - 1]}` + (notes.length ? '<br>' + notes.join('<br>') : '');
    } else hint.innerHTML = '';
  }
}

sheetBody.addEventListener('input', e => {
  if (!form) return;
  if (e.target.id === 'rkfCat') syncForm();
});
sheetBody.addEventListener('change', e => {
  // 選到已上榜的店名 → 自動帶入縣市／區／地圖
  if (form && e.target.id === 'rkfName') {
    const name = e.target.value.trim();
    const hit = Object.values(state.data.items).find(x => x.name === name);
    if (hit) {
      if (!$('rkfCity').value) $('rkfCity').value = hit.city;
      if (!$('rkfDist').value) $('rkfDist').value = hit.dist;
      if (!$('rkfMap').value) $('rkfMap').value = hit.map;
    }
  }
});
sheetBody.addEventListener('submit', async e => {
  e.preventDefault();
  if (!form) return;
  const v = formVals();
  if (!v.cat) { $('rkfCat').focus(); toast('請選或輸入品類'); return; }
  if (!v.name) { $('rkfName').focus(); toast('請輸入店名／景點名'); return; }
  const rawMap = $('rkfMap').value.trim();
  if (rawMap && !v.map) { $('rkfMap').focus(); toast('地圖連結請貼完整網址（https:// 開頭）'); return; }
  const btn = $('rkfSave');
  btn.disabled = true;
  const f = form;
  if (f.mode === 'add') {
    const dup = (state.data.boards[bkey(v)] || []).map(id => state.data.items[id]).find(x => x.name === v.name);
    if (dup && !confirm(`「${v.name}」已經在${v.cat}榜上了，還要再張貼一次嗎？`)) { btn.disabled = false; return; }
    const id = newId();
    // 新增時切到該大類／品類，讓人馬上看到結果
    state.major = v.major;
    if (state.cat !== 'all') state.cat = v.cat;
    closeSheet();
    await commit(id, { t: 'add', ...v, rank: f.rank }, `🏮 「${v.name}」登上${v.cat}榜・${TITLES[f.rank - 1]}`);
  } else {
    closeSheet();
    await commit(f.id, { t: 'edit', ...v }, '已更新榜文');
  }
  form = null;
});

// ---- 動作彈窗（點卡片）----
function openActions(id) {
  const it = state.data.items[id];
  if (!it) return;
  form = null;
  const onBoard = it.status === 'board';
  const list = state.data.boards[bkey(it)] || [];
  const rank = onBoard ? list.indexOf(id) + 1 : 0;
  const info = onBoard ? null : hallInfo(it);
  openSheet(`
    ${sheetHead(onBoard ? `${esc(it.cat)}榜・${TITLES[rank - 1]}` : '🏛 名人堂')}
    <div class="rk-detail">
      <span class="rk-detail-seal ${onBoard ? 'r' + rank : 'hall'}">${onBoard ? TITLES[rank - 1] : '名人'}</span>
      <div class="rk-detail-main">
        <div class="rk-detail-name">${esc(it.name)}</div>
        <div class="rk-detail-meta">${esc(it.major)}・${esc(it.cat)}${place(it) ? '・' + esc(place(it)) : ''}</div>
        ${info ? `<div class="rk-detail-meta">${info.peak} ${info.line}</div>` : ''}
      </div>
    </div>
    ${it.note ? `<p class="rk-detail-note">${esc(it.note)}</p>` : ''}
    <a class="rk-btn rk-btn-ghost rk-btn-block" href="${esc(mapUrl(it))}" target="_blank" rel="noopener">📍 在 Google 地圖開啟</a>
    <div class="rk-label rk-label-gap">${onBoard ? '調整名次' : '重返榜單'}</div>
    ${rankPickHtml(list, { current: rank, maxRank: onBoard ? list.length : Math.min(list.length + 1, PODIUM), label: onBoard ? '調整名次' : '重返榜單' })}
    <div class="rk-actions">
      <button type="button" class="rk-btn rk-btn-ghost" data-act="edit">✏️ 編輯內容</button>
      ${onBoard ? '<button type="button" class="rk-btn rk-btn-ghost" data-act="hall">🏛 送入名人堂</button>' : ''}
      <button type="button" class="rk-btn rk-btn-danger" data-act="del">🗑 刪除</button>
    </div>`);
  sheetBody.dataset.id = id;
}

sheetBody.addEventListener('click', async e => {
  const t = e.target.closest('button');
  if (!t || t.disabled) return;
  if (t.dataset.act === 'close') { closeSheet(); return; }

  // 表單內
  if (form) {
    if (t.dataset.fmajor) { form.major = t.dataset.fmajor; if (!form.rankTouched) form.rank = 0; syncForm(); return; }
    if (t.dataset.fcat != null && t.dataset.fcat !== undefined && t.classList.contains('rk-chip')) {
      $('rkfCat').value = t.dataset.fcat; syncForm(); return;
    }
    if (t.dataset.rank) { form.rank = +t.dataset.rank; form.rankTouched = true; syncForm(); return; }
    return;
  }

  const id = sheetBody.dataset.id;
  const it = state.data.items[id];
  if (!it) return;
  if (t.dataset.rank) {
    const v = +t.dataset.rank;
    const list = state.data.boards[bkey(it)] || [];
    const { notes } = predict(list, v, id);
    const out = notes.filter(n => n.includes('名人堂'));
    if (out.length && !confirm(`「${it.name}」重返${TITLES[v - 1]}，\n${out.map(n => n.replace(/<[^>]+>/g, '')).join('\n')}。\n確定嗎？`)) return;
    closeSheet();
    await commit(id, { t: 'rank', v }, `「${it.name}」${it.status === 'board' ? '改為' : '重返'}${TITLES[v - 1]}`);
  } else if (t.dataset.act === 'edit') {
    openForm('edit', { id });
  } else if (t.dataset.act === 'hall') {
    if (!confirm(`把「${it.name}」送入名人堂？\n下面的名次會依序往上遞補。`)) return;
    closeSheet();
    await commit(id, { t: 'hall' }, `🏛 「${it.name}」入名人堂`);
  } else if (t.dataset.act === 'del') {
    if (!confirm(`確定刪除「${it.name}」？\n（名人堂紀錄也會一起移除）`)) return;
    closeSheet();
    await commit(id, { t: 'del' }, '已刪除');
  }
});

// ---------- 頁面互動 ----------
root.addEventListener('click', e => {
  if (e.target.closest('.rk-map')) return; // 地圖連結照常開啟
  const add = e.target.closest('[data-add]');
  if (add) {
    openForm('add', { cat: add.dataset.addCat || '', rank: +add.dataset.addRank || 0 });
    return;
  }
  const dot = e.target.closest('[data-dot]');
  if (dot) { pauseCarousel(); resumeCarouselLater(); goTo(+dot.dataset.dot); return; }
  const major = e.target.closest('[data-major]');
  if (major) { state.major = major.dataset.major; state.cat = 'all'; state.city = 'all'; carIdx = 0; render(); return; }
  const city = e.target.closest('[data-city]');
  if (city) { state.city = city.dataset.city; carIdx = 0; render(); return; }
  const cat = e.target.closest('[data-cat]');
  if (cat) { state.cat = cat.dataset.cat; render(); return; }
  const open = e.target.closest('[data-open]');
  if (open) openActions(open.dataset.open);
});
root.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open][role="button"]')) {
    e.preventDefault();
    openActions(e.target.dataset.open);
  }
});
$('rkHall').addEventListener('toggle', () => { state.hallOpen = $('rkHall').open; });

// 切到風雲榜時重新整理（同步另一支手機的變更）
const tabBtn = document.querySelector('.tab-btn[data-tab="ranking"]');
if (tabBtn) tabBtn.addEventListener('click', () => { load(); requestAnimationFrame(() => { track.scrollLeft = carIdx * track.clientWidth; }); });
window.addEventListener('happy-lucky-online', load);

// 啟動：先用快取畫出來（離線也不會白屏），再向伺服器拿最新
state.rows = readCache();
refresh();
startCarousel();
load();

// 給測試／未來擴充用（名次變動動畫、從想去晉榜等可以掛在這裡）
window.HLRank = { fold, reload: load, get state() { return state; }, PREFIX };
})();
