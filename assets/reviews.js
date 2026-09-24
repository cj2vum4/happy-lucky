/* ============================================================
   評論共用模組（index.html 與旅程頁共用）
   - 評分對象：旅行期間的記帳支出（不再是景點/行程）
       key = 'exp__{ledger id}'；舊版 #spot 記帳沿用 'food__{name}'
   - 角色：H / L，存在 comment 開頭的 [H] / [L] 標記（不用改資料表）
   - 刪除：先嘗試真的 DELETE；權限不足時改寫一筆刪除標記
       { trip_id: 同 key, comment: '#del:{被刪那筆的 id}' }
     讀取時一律經過 fold() 把被刪的與標記本身過濾掉
   ============================================================ */
(function () {
'use strict';

const SB_URL = 'https://cmwtceczabbszhdgvwcj.supabase.co';
const SB_KEY = 'sb_publishable_hDrADaLoZfAGDJH1i_JeHw_OSv_oqAu';
const HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
const DEL_MARK = '#del:';
const ROLE_RE = /^\[(H|L)\]\s?/;
const ROLE_KEY = 'hl-review-role';

const rowRef = r => String(r.id != null ? r.id : r.created_at);

// 把原始資料列折疊成「有效評論」：去掉刪除標記與被標記刪除的評論
function fold(rows) {
  if (!Array.isArray(rows)) return [];
  const deleted = new Set();
  rows.forEach(r => {
    if (typeof r.comment === 'string' && r.comment.startsWith(DEL_MARK)) deleted.add(r.comment.slice(DEL_MARK.length));
  });
  return rows.filter(r =>
    !(typeof r.comment === 'string' && r.comment.startsWith(DEL_MARK)) && !deleted.has(rowRef(r)));
}

function parse(r) {
  const m = (r.comment || '').match(ROLE_RE);
  return { role: m ? m[1] : '', text: m ? r.comment.slice(m[0].length) : (r.comment || '') };
}

function inList(keys) {
  return 'in.(' + keys.map(k => '"' + String(k).replace(/"/g, '') + '"').join(',') + ')';
}

async function fetchByKeys(keys) {
  if (!keys.length) return [];
  const out = [];
  // URL 長度保險：分批查
  for (let i = 0; i < keys.length; i += 60) {
    const q = encodeURIComponent(inList(keys.slice(i, i + 60)));
    const res = await fetch(`${SB_URL}/rest/v1/trip_reviews?trip_id=${q}&order=created_at.desc`, { headers: HEADERS });
    const data = await res.json();
    if (Array.isArray(data)) out.push(...data);
  }
  return fold(out);
}

async function fetchLike(prefix) {
  const res = await fetch(`${SB_URL}/rest/v1/trip_reviews?trip_id=like.${encodeURIComponent(prefix)}*&order=created_at.desc`, { headers: HEADERS });
  return fold(await res.json());
}

async function insertRow(row) {
  const res = await fetch(`${SB_URL}/rest/v1/trip_reviews`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  return res.ok || res.status === 201;
}

async function post(key, rating, role, text) {
  const comment = `[${role}]` + (text ? ' ' + text : '');
  if (!(await insertRow({ trip_id: key, rating, comment }))) throw new Error('送出失敗');
  try { localStorage.setItem(ROLE_KEY, role); } catch (e) {}
}

async function remove(r) {
  if (r.id != null) {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/trip_reviews?id=eq.${encodeURIComponent(r.id)}`, {
        method: 'DELETE', headers: { ...HEADERS, Prefer: 'return=representation' },
      });
      if (res.ok) {
        const gone = await res.json().catch(() => []);
        if (Array.isArray(gone) && gone.length) return;
      }
    } catch (e) { /* 改用刪除標記 */ }
  }
  const mark = { trip_id: r.trip_id, comment: DEL_MARK + rowRef(r) };
  if (await insertRow({ ...mark, rating: null })) return;
  // rating 欄位不接受 null 時補 1（標記列不會進任何統計）
  if (await insertRow({ ...mark, rating: 1 })) return;
  throw new Error('刪除失敗');
}

function lastRole() {
  try { const v = localStorage.getItem(ROLE_KEY); return v === 'H' || v === 'L' ? v : ''; } catch (e) { return ''; }
}

function stats(revs) {
  const rs = revs.filter(r => r.rating).map(r => r.rating);
  return rs.length ? { avg: (rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(1), count: rs.length } : null;
}

// 長按 → callback（避免和捲動衝突：移動就取消）
function onLongPress(el, fn, ms) {
  let t = null, sx = 0, sy = 0;
  const start = e => {
    const p = e.touches ? e.touches[0] : e;
    sx = p.clientX; sy = p.clientY;
    el.classList.add('pressing');
    t = setTimeout(() => { t = null; el.classList.remove('pressing'); fn(); }, ms || 550);
  };
  const cancel = () => { if (t) clearTimeout(t); t = null; el.classList.remove('pressing'); };
  const move = e => {
    const p = e.touches ? e.touches[0] : e;
    if (Math.abs(p.clientX - sx) > 8 || Math.abs(p.clientY - sy) > 8) cancel();
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchmove', move, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('mousedown', start);
  el.addEventListener('mousemove', move);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

// 記帳支出 → 可評分項目
const CAT_MAP = { '食': ['食物', '🍽️'], '住': ['住宿', '🏨'], '行': ['交通', '🚗'], '育': ['室內景點', '🎓'],
                  '樂': ['室外景點', '🎡'], '衣': ['其他', '👗'], '醫': ['其他', '💊'], '其他': ['其他', '📦'] };
function entryItem(e) {
  const raw = (e.note || '').trim();
  const isSpot = raw.endsWith('#spot');
  const body = isSpot ? raw.slice(0, -5) : raw;
  const pipe = isSpot ? body.lastIndexOf('|') : -1;
  const name = (pipe >= 0 ? body.slice(0, pipe) : body).trim();
  const noteRegion = pipe >= 0 ? body.slice(pipe + 1).trim() : '';
  const [category, emoji] = CAT_MAP[e.category] || ['其他', '📦'];
  return {
    id: e.id, date: e.date, amount: +e.amount, ledgerCat: e.category,
    name: name || `${e.category}・$${Number(e.amount).toLocaleString('zh-TW')}`,
    hasName: !!name, noteRegion, category, emoji, isSpot,
    // 舊版 #spot 記帳沿用 food__{name}（保留既有評分），其餘一律用記帳 id
    key: isSpot && name ? 'food__' + name : 'exp__' + e.id,
  };
}

async function fetchExpenses(from, to) {
  let q = `${SB_URL}/rest/v1/ledger_entries?type=eq.expense&select=id,note,date,amount,category&order=date.asc,created_at.asc`;
  if (from) q += `&date=gte.${from}`;
  if (to) q += `&date=lte.${to}`;
  const res = await fetch(q, { headers: HEADERS });
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

window.HLReviews = { SB_URL, SB_KEY, fold, parse, fetchByKeys, fetchLike, post, remove, lastRole, stats, onLongPress, entryItem, fetchExpenses };
})();
