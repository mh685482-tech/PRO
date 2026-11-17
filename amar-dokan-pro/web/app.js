/* =====================================================================
   AMAR DOKAN PRO  -  app.js
   Vanilla JavaScript (single ES module). Firebase Auth + Cloud Firestore.
   Runs in browsers and inside the Android WebView (see MainActivity.kt).
   ===================================================================== */

const FB_VER = '10.14.1';
const FB_URL = (m) => `https://www.gstatic.com/firebasejs/${FB_VER}/firebase-${m}.js`;
const NATIVE = typeof window.AndroidBridge !== 'undefined';

/* ---------------------------------------------------------------------
   Constants
   --------------------------------------------------------------------- */
const PERM_KEYS = ['sell', 'viewAllSales', 'products', 'viewCost', 'customers', 'expenses', 'finance', 'profit', 'backup', 'settings', 'deleteRecords'];
const PERM_PRESETS = {
  owner: Object.fromEntries(PERM_KEYS.map((k) => [k, true])),
  manager: { sell: true, viewAllSales: true, products: true, viewCost: true, customers: true, expenses: true, finance: true, profit: true, backup: true, settings: false, deleteRecords: true },
  employee: { sell: true, viewAllSales: false, products: false, viewCost: false, customers: true, expenses: false, finance: false, profit: false, backup: false, settings: false, deleteRecords: false }
};
const ACCOUNT_TYPES = ['cash', 'bkash_agent', 'bkash_personal', 'nagad_agent', 'nagad_personal', 'rocket', 'upay', 'bank', 'other'];
const DEFAULT_ACCOUNTS = ['cash', 'bkash_agent', 'bkash_personal', 'nagad_agent', 'nagad_personal', 'rocket', 'upay'];
const PAY_METHODS = ['cash', 'bkash', 'nagad', 'rocket', 'upay'];
const EXPENSE_CATS = ['rent', 'electricity', 'salary', 'transport', 'utilities', 'repair', 'food', 'marketing', 'tax', 'other'];
const MANUAL_TX = ['deposit', 'withdraw', 'transfer_in', 'transfer_out', 'charge', 'adjustment'];
const THEME_COLORS = {
  teal: ['#0f766e', '#14b8a6'], blue: ['#1d4ed8', '#38bdf8'], violet: ['#6d28d9', '#a78bfa'],
  orange: ['#c2410c', '#fb923c'], rose: ['#be123c', '#fb7185'], green: ['#15803d', '#4ade80']
};
const BG_PRESETS = {
  g1: 'linear-gradient(135deg,#d1fae5,#a7f3d0 45%,#99f6e4)',
  g2: 'linear-gradient(135deg,#dbeafe,#c7d2fe)',
  g3: 'linear-gradient(135deg,#ffe4e6,#fde68a)',
  g4: 'linear-gradient(135deg,#1e293b,#0f766e)',
  g5: 'radial-gradient(circle at 20% 10%,#f0abfc,#818cf8 55%,#22d3ee)'
};
const RESTORE_COLLECTIONS = ['products', 'productCosts', 'customers', 'accounts', 'accountBalances', 'transactions', 'sales', 'saleCosts', 'payments', 'expenses', 'purchases'];

const methodOfType = (ty) => ty === 'cash' ? 'cash' : ty.startsWith('bkash') ? 'bkash' : ty.startsWith('nagad') ? 'nagad' : ty === 'rocket' ? 'rocket' : ty === 'upay' ? 'upay' : 'other';

/* ---------------------------------------------------------------------
   Global state
   --------------------------------------------------------------------- */
const S = {
  lang: 'bn', mode: 'auto', color: 'teal', bg: 'none',
  user: null, shopId: null, shop: null, member: null, branding: {},
  products: new Map(), costs: new Map(), customers: new Map(), accounts: new Map(), balances: new Map(),
  tx: new Map(), sales: new Map(), saleCosts: new Map(), payments: new Map(), expenses: new Map(),
  purchases: new Map(), members: new Map(), invites: new Map(),
  loaded: {}, pending: {}, unsubs: {}, windowStart: '', online: navigator.onLine,
  route: { name: 'dashboard', param: null }, page: null
};
let FB = null;          // firebase modules + instances
let fbReady = false;

/* ---------------------------------------------------------------------
   Small utilities
   --------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const debounce = (fn, ms) => { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; };
const toLatin = (s) => String(s ?? '').replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d));
const parseAmt = (v) => { const n = parseFloat(toLatin(v).replace(/,/g, '').trim()); return Number.isFinite(n) ? n : NaN; };
const arr = (m) => Array.from(m.values());
const loc = () => (S.lang === 'bn' ? 'bn-BD' : 'en-GB');
const lc = (s) => String(s ?? '').toLowerCase();

function autoId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/* ---- dates (all dates are local-time 'YYYY-MM-DD' strings) ---- */
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowTime = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const dateAdd = (s, n) => ymd(new Date(parseYmd(s).getTime() + n * 86400000));
const monthStart = (s) => s.slice(0, 8) + '01';
const monthEnd = (s) => { const d = parseYmd(monthStart(s)); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12)); };
const weekStart = (s) => {
  const ws = S.shop?.settings?.weekStart ?? 6; // Saturday
  const dow = parseYmd(s).getDay();
  return dateAdd(s, -((dow - ws + 7) % 7));
};
const validYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(parseYmd(s).getTime());
const fmtDate = (s) => (s && validYmd(s) ? parseYmd(s).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtDateShort = (s) => (s && validYmd(s) ? parseYmd(s).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }) : '');
const fmtTime = (hm) => { if (!hm) return ''; const [h, m] = hm.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString(loc(), { hour: 'numeric', minute: '2-digit' }); };
const fmtNum = (n, dec = 2) => new Intl.NumberFormat(loc(), { minimumFractionDigits: 0, maximumFractionDigits: dec }).format(r2(n));
const money = (n) => { const v = r2(n); return (v < 0 ? '−' : '') + '৳' + fmtNum(Math.abs(v)); };
const moneyPlain = (n) => (r2(n) < 0 ? '-' : '') + 'BDT ' + r2(Math.abs(n)).toFixed(2); // for plain text / CSV

/* ---- CSV / files / sharing (with Android bridge fallbacks) ---- */
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCSV = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
function b64utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function downloadText(name, mime, text) {
  if (NATIVE) { window.AndroidBridge.saveFile(name, mime, b64utf8(text)); return; }
  const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function shareText(text, title = 'AMAR DOKAN PRO') {
  if (NATIVE) { window.AndroidBridge.shareText(text, title); return; }
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  await copyText(text);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(t('copied'), 'ok'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(t('copied'), 'ok'); } catch (e2) { toast(t('copyFailed'), 'err'); }
    ta.remove();
  }
}
function printHtml(htmlDoc, jobName = 'AMAR-DOKAN-PRO') {
  if (NATIVE) { window.AndroidBridge.printHtml(htmlDoc, jobName); return; }
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  const d = f.contentWindow.document;
  d.open(); d.write(htmlDoc); d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast(String(e), 'err'); } setTimeout(() => f.remove(), 60000); }, 350);
}
const smsLink = (phone, body) => `sms:${String(phone || '').replace(/[^\d+]/g, '')}?body=${encodeURIComponent(body)}`;

/* ---------------------------------------------------------------------
   Icons (inline SVG, Lucide-style strokes)
   --------------------------------------------------------------------- */
const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 7L12 12l8.7-5"/><path d="M12 22V12"/>',
  cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  wallet: '<path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  chart: '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  trend: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
  sliders: '<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.59 13.51l6.83 3.98"/><path d="M15.41 6.51l-6.82 3.98"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  menu: '<path d="M3 12h18M3 6h18M3 18h18"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  swap: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  card: '<rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  barcode: '<path d="M3 5v14M8 5v14M12 5v14M17 5v14M21 5v14"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  chevron: '<path d="M9 18l6-6-6-6"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  receipt: '<path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/>',
  cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'
};
const ic = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
const GOOGLE_SVG = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>';

/* ---------------------------------------------------------------------
   Preferences (language / theme) - local first, synced to Firestore per user
   --------------------------------------------------------------------- */
function loadLocalPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('adp_prefs') || '{}');
    S.lang = p.lang === 'en' ? 'en' : 'bn';
    S.mode = ['light', 'dark', 'auto'].includes(p.mode) ? p.mode : 'auto';
    S.color = THEME_COLORS[p.color] ? p.color : 'teal';
    S.bg = p.bg === 'image' || BG_PRESETS[p.bg] ? p.bg : 'none';
  } catch (e) { /* ignore */ }
}
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lighten = (h, f) => '#' + hexRgb(h).map((v) => Math.round(v + (255 - v) * f).toString(16).padStart(2, '0')).join('');

function applyPrefs() {
  const root = document.documentElement;
  root.lang = S.lang;
  const dark = S.mode === 'dark' || (S.mode === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'dark' : 'light';
  const [c1, c2] = THEME_COLORS[S.color] || THEME_COLORS.teal;
  const brand = dark ? c2 : c1;
  const brand2 = dark ? lighten(c2, 0.28) : c2;
  const [r, g, b] = hexRgb(brand);
  const st = root.style;
  st.setProperty('--brand', brand);
  st.setProperty('--brand-2', brand2);
  st.setProperty('--brand-soft', `rgba(${r},${g},${b},${dark ? 0.16 : 0.12})`);
  st.setProperty('--brand-glow', `rgba(${r},${g},${b},.35)`);
  st.setProperty('--on-brand', dark ? '#04211d' : '#ffffff');
  let layer = BG_PRESETS[S.bg] || null;
  if (S.bg === 'image' && S.branding && S.branding.bgImage) layer = `url("${S.branding.bgImage}")`;
  document.body.style.setProperty('--bg-layer', layer || 'none');
  document.body.style.setProperty('--bg-dim', dark ? '.74' : '.5');
  document.body.classList.toggle('has-bg', !!layer);
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#0b1220' : c1;
}
async function savePrefs() {
  const p = { lang: S.lang, mode: S.mode, color: S.color, bg: S.bg };
  try { localStorage.setItem('adp_prefs', JSON.stringify(p)); } catch (e) { /* ignore */ }
  applyPrefs();
  if (FB && S.user) {
    try { await FB.setDoc(FB.doc(FB.db, 'userPrefs', S.user.uid), p); } catch (e) { /* offline is fine */ }
  }
}
async function loadRemotePrefs() {
  try {
    const d = await FB.getDoc(FB.doc(FB.db, 'userPrefs', S.user.uid));
    if (d.exists()) {
      const p = d.data();
      if (p.lang) S.lang = p.lang === 'en' ? 'en' : 'bn';
      if (p.mode) S.mode = p.mode;
      if (THEME_COLORS[p.color]) S.color = p.color;
      if (p.bg) S.bg = p.bg;
      try { localStorage.setItem('adp_prefs', JSON.stringify({ lang: S.lang, mode: S.mode, color: S.color, bg: S.bg })); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }
  applyPrefs();
}

/* ---------------------------------------------------------------------
   Permissions (UI side only - the real enforcement is in firestore.rules)
   --------------------------------------------------------------------- */
const can = (p) => !!S.member && (S.member.role === 'owner' || (S.member.perms && S.member.perms[p] === true));
const isOwner = () => !!S.member && S.member.role === 'owner';
const col = (name) => FB.collection(FB.db, 'shops', S.shopId, name);
const dref = (name, id) => FB.doc(FB.db, 'shops', S.shopId, name, id);
const userEmail = () => String((S.user && S.user.email) || '').toLowerCase();
const shopSettings = () => ({ ...defaultSettings(), ...((S.shop && S.shop.settings) || {}) });
function defaultSettings() {
  return {
    address: '', phone: '', currency: 'BDT', weekStart: 6, allowNegativeStock: false, defaultLowStock: 5,
    receipt: { paper: '80', showLogo: true, showAddress: true, showPhone: true, showCashier: true, showDue: true, footer: '' }
  };
}

/* ---------------------------------------------------------------------
   Firebase initialisation + authentication
   --------------------------------------------------------------------- */
async function initFirebase() {
  let cfg;
  try { cfg = (await import('./firebase-config.js')).firebaseConfig; } catch (e) { return 'noconfig'; }
  if (!cfg || !cfg.apiKey || String(cfg.apiKey).startsWith('REPLACE') || String(cfg.projectId).startsWith('REPLACE')) return 'noconfig';
  let appM, authM, fsM;
  try {
    [appM, authM, fsM] = await Promise.all([import(FB_URL('app')), import(FB_URL('auth')), import(FB_URL('firestore'))]);
  } catch (e) { return 'sdkfail'; }
  const app = appM.initializeApp(cfg);
  const auth = authM.getAuth(app);
  let db;
  try {
    db = fsM.initializeFirestore(app, { localCache: fsM.persistentLocalCache({ tabManager: fsM.persistentMultipleTabManager() }) });
  } catch (e) { db = fsM.getFirestore(app); }
  FB = { ...appM, ...authM, ...fsM, app, auth, db };
  fbReady = true;
  return 'ok';
}

function authError(e) {
  const code = (e && e.code) || '';
  if (code.includes('network')) return t('errNetwork');
  if (code.includes('unauthorized-domain')) return t('errDomain');
  if (code.includes('account-exists')) return t('errAccountExists');
  return (e && e.message) || String(e);
}

async function signInGoogle() {
  setLoginBusy(true);
  if (NATIVE) { window.AndroidBridge.googleSignIn(); return; }
  const provider = new FB.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await FB.signInWithPopup(FB.auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      try { await FB.signInWithRedirect(FB.auth, provider); return; } catch (e2) { e = e2; }
    }
    if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) toast(authError(e), 'err');
    setLoginBusy(false);
  }
}
// called by MainActivity.kt after native Google sign-in
window.__onNativeGoogleToken = async (res) => {
  if (!res || res.error || !res.token) {
    if (res && res.error && res.error !== 'cancelled') toast(res.error, 'err');
    setLoginBusy(false);
    return;
  }
  try {
    await FB.signInWithCredential(FB.auth, FB.GoogleAuthProvider.credential(res.token));
  } catch (e) { toast(authError(e), 'err'); setLoginBusy(false); }
};
function setLoginBusy(b) {
  const btn = $('#googleBtn');
  if (btn) { btn.disabled = b; btn.style.opacity = b ? '.6' : ''; }
}

async function doSignOut() {
  stopAll();
  try { await FB.signOut(FB.auth); } catch (e) { /* ignore */ }
  if (NATIVE) window.AndroidBridge.signOutNative();
  location.hash = '';
  S.shopId = null; S.shop = null; S.member = null; S.page = null;
}

let accessRun = 0;
async function resolveAccess() {
  const run = ++accessRun;
  showLoading();
  const uid = S.user.uid;
  try {
    await loadRemotePrefs();
    const us = await FB.getDoc(FB.doc(FB.db, 'userShops', uid));
    if (run !== accessRun) return;
    if (us.exists()) {
      S.shopId = us.data().shopId;
      const m = await FB.getDoc(FB.doc(FB.db, 'shops', S.shopId, 'members', uid));
      if (run !== accessRun) return;
      if (!m.exists()) { showRemoved(); return; }
      S.member = m.data();
      await enterApp();
      return;
    }
    const inv = await FB.getDoc(FB.doc(FB.db, 'invites', userEmail()));
    if (run !== accessRun) return;
    if (inv.exists()) { showInvite(inv.data()); return; }
    showOnboard();
  } catch (e) {
    console.error(e);
    showFatal(t('errLoadAccount'), String(e && e.message || e), () => resolveAccess());
  }
}

async function createShop(name) {
  const uid = S.user.uid, shopId = autoId(), now = Date.now();
  const perms = { ...PERM_PRESETS.owner };
  const member = { role: 'owner', perms, email: userEmail(), name: S.user.displayName || '', photo: S.user.photoURL || '', createdAt: now };
  const b = FB.writeBatch(FB.db);
  b.set(FB.doc(FB.db, 'shops', shopId), { ownerUid: uid, name, createdAt: now, seeded: false, settings: defaultSettings() });
  b.set(FB.doc(FB.db, 'shops', shopId, 'members', uid), member);
  b.set(FB.doc(FB.db, 'userShops', uid), { shopId });
  await b.commit();
  S.shopId = shopId; S.member = member;
  await enterApp();
}

async function acceptInvite(inv) {
  const uid = S.user.uid, now = Date.now();
  const member = { role: inv.role, perms: inv.perms, email: userEmail(), name: S.user.displayName || '', photo: S.user.photoURL || '', createdAt: now };
  const b = FB.writeBatch(FB.db);
  b.set(FB.doc(FB.db, 'shops', inv.shopId, 'members', uid), member);
  b.set(FB.doc(FB.db, 'userShops', uid), { shopId: inv.shopId });
  b.delete(FB.doc(FB.db, 'invites', userEmail()));
  await b.commit();
  S.shopId = inv.shopId; S.member = member;
  await enterApp();
}

async function seedAccounts() {
  const b = FB.writeBatch(FB.db);
  DEFAULT_ACCOUNTS.forEach((type, i) => {
    b.set(dref('accounts', type), { name: ACCOUNT_EN[type], type, number: '', active: true, auto: true, order: i, createdAt: Date.now() });
    b.set(dref('accountBalances', type), { balance: 0, updatedAt: Date.now() });
  });
  b.update(FB.doc(FB.db, 'shops', S.shopId), { seeded: true });
  await b.commit();
}
const ACCOUNT_EN = { cash: 'Cash in hand', bkash_agent: 'bKash Agent', bkash_personal: 'bKash Personal', nagad_agent: 'Nagad Agent', nagad_personal: 'Nagad Personal', rocket: 'Rocket', upay: 'Upay', bank: 'Bank', other: 'Other' };

/* ---------------------------------------------------------------------
   Realtime listeners (Cloud Firestore keeps an offline cache + syncs devices)
   --------------------------------------------------------------------- */
const permWarned = {};
function sub(name, q, onSnap) {
  if (S.unsubs[name]) S.unsubs[name]();
  S.unsubs[name] = FB.onSnapshot(q, { includeMetadataChanges: true }, onSnap, (err) => {
    console.warn('listener', name, err.code);
    if (err.code === 'permission-denied' && !permWarned[name]) { permWarned[name] = true; toast(t('errNoAccess') + ' (' + name + ')', 'err'); }
  });
}
function unsub(name) { if (S.unsubs[name]) { S.unsubs[name](); delete S.unsubs[name]; } }
function subCol(name, mapKey, q) {
  S[mapKey].clear();
  S.loaded[name] = false;
  sub(name, q, (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type === 'removed') S[mapKey].delete(ch.doc.id);
      else S[mapKey].set(ch.doc.id, { id: ch.doc.id, ...ch.doc.data() });
    });
    S.loaded[name] = true;
    S.pending[name] = snap.metadata.hasPendingWrites;
    updateSyncChip();
    scheduleRender();
  });
}

const WINDOWED = ['transactions', 'sales', 'saleCosts', 'payments', 'expenses', 'purchases'];
const defaultWindowStart = () => dateAdd(monthStart(ymd()), -62);

function startListeners() {
  stopListeners();
  const uid = S.user.uid;
  if (!S.windowStart) S.windowStart = defaultWindowStart();

  sub('shop', FB.doc(FB.db, 'shops', S.shopId), (snap) => {
    if (snap.exists()) { S.shop = snap.data(); scheduleRender(); updateChrome(); }
  });
  sub('branding', dref('meta', 'branding'), (snap) => {
    S.branding = snap.exists() ? snap.data() : {};
    applyPrefs(); updateChrome();
  });
  sub('me', FB.doc(FB.db, 'shops', S.shopId, 'members', uid), (snap) => {
    if (!snap.exists()) { if (!snap.metadata.fromCache) { stopAll(); showRemoved(); } return; }
    const next = snap.data();
    const changed = JSON.stringify(next.perms) !== JSON.stringify(S.member.perms) || next.role !== S.member.role;
    S.member = next;
    if (changed && !S.restarting) { S.restarting = true; setTimeout(() => { S.restarting = false; startListeners(); buildChrome(); route(); }, 50); }
  });

  subCol('products', 'products', col('products'));
  if (can('viewCost') || can('profit')) subCol('productCosts', 'costs', col('productCosts')); else S.costs.clear();
  if (can('customers') || can('sell')) subCol('customers', 'customers', col('customers')); else S.customers.clear();
  if (can('sell') || can('finance') || can('expenses') || can('customers')) subCol('accounts', 'accounts', col('accounts')); else S.accounts.clear();
  if (can('finance')) subCol('accountBalances', 'balances', col('accountBalances')); else S.balances.clear();
  if (isOwner()) {
    subCol('members', 'members', col('members'));
    subCol('invites', 'invites', FB.query(FB.collection(FB.db, 'invites'), FB.where('shopId', '==', S.shopId)));
  } else { S.members.clear(); S.invites.clear(); }
  startWindowed();
}

function startWindowed() {
  const d = S.windowStart, uid = S.user.uid;
  const dq = (name) => FB.query(col(name), FB.where('date', '>=', d));
  if (can('finance')) subCol('transactions', 'tx', dq('transactions')); else { unsub('transactions'); S.tx.clear(); }
  if (can('viewAllSales')) subCol('sales', 'sales', dq('sales'));
  else if (can('sell')) subCol('sales', 'sales', FB.query(col('sales'), FB.where('createdBy', '==', uid), FB.where('date', '>=', d)));
  else { unsub('sales'); S.sales.clear(); }
  if (can('viewCost') || can('profit')) subCol('saleCosts', 'saleCosts', dq('saleCosts')); else { unsub('saleCosts'); S.saleCosts.clear(); }
  if (can('customers') || can('finance')) subCol('payments', 'payments', dq('payments')); else { unsub('payments'); S.payments.clear(); }
  if (can('expenses') || can('finance') || can('profit')) subCol('expenses', 'expenses', dq('expenses')); else { unsub('expenses'); S.expenses.clear(); }
  if (can('viewCost')) subCol('purchases', 'purchases', dq('purchases')); else { unsub('purchases'); S.purchases.clear(); }
}

function stopListeners() { Object.keys(S.unsubs).forEach(unsub); }
function stopAll() {
  stopListeners();
  ['products', 'costs', 'customers', 'accounts', 'balances', 'tx', 'sales', 'saleCosts', 'payments', 'expenses', 'purchases', 'members', 'invites'].forEach((k) => S[k].clear());
  S.loaded = {}; S.pending = {}; S.windowStart = '';
}

// Make sure data from `from` (YYYY-MM-DD) onwards is loaded (used by reports for older ranges)
async function ensureWindow(from) {
  if (!from || from >= S.windowStart) return;
  S.windowStart = monthStart(from);
  startWindowed();
  const names = WINDOWED.filter((n) => S.unsubs[n]);
  const t0 = Date.now();
  while (names.some((n) => !S.loaded[n]) && Date.now() - t0 < 12000) await sleep(100);
}

function syncState() {
  if (!S.online) return 'offline';
  return Object.values(S.pending).some(Boolean) ? 'sync' : 'ok';
}
function updateSyncChip() {
  const el = $('#syncChip');
  if (!el) return;
  const s = syncState();
  el.innerHTML = `<span class="dot ${s === 'ok' ? '' : s === 'sync' ? 'sync' : 'off'}"></span>${t(s === 'ok' ? 'synced' : s === 'sync' ? 'syncing' : 'offline')}`;
}
window.addEventListener('online', () => { S.online = true; updateSyncChip(); });
window.addEventListener('offline', () => { S.online = false; updateSyncChip(); });

let renderTimer = 0;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { if (S.page && S.page.update) { try { S.page.update(); } catch (e) { console.error(e); } } maybeReconcile(); }, 90);
}

/* ---------------------------------------------------------------------
   i18n + UI helpers (toast, modal, confirm)
   --------------------------------------------------------------------- */
const t = (k, ...a) => {
  const e = I18N[k];
  let s = e ? e[S.lang === 'bn' ? 0 : 1] : k;
  a.forEach((v, i) => { s = s.split(`{${i}}`).join(v); });
  return s;
};
function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 5200 : 2600);
}

const modalStack = [];
function openModal({ title, body, footer = [], wide = false, onClose }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-h"><h3>${esc(title)}</h3><button class="btn icon ghost" data-close aria-label="Close">${ic('x')}</button></div><div class="modal-b"></div><div class="modal-f"></div></div>`;
  const bodyEl = $('.modal-b', bg), footEl = $('.modal-f', bg);
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  const ctrl = {
    el: bg, body: bodyEl, foot: footEl,
    close(result) { const i = modalStack.indexOf(ctrl); if (i >= 0) modalStack.splice(i, 1); bg.remove(); if (onClose) onClose(result); },
    busy(b) { $$('button', footEl).forEach((x) => { x.disabled = b; }); }
  };
  footer.forEach((f) => {
    const b = document.createElement('button');
    b.className = 'btn ' + (f.cls || '');
    b.innerHTML = (f.icon ? ic(f.icon) : '') + esc(f.label);
    b.onclick = async () => {
      if (!f.onClick) { ctrl.close(); return; }
      ctrl.busy(true);
      try { const r = await f.onClick(ctrl); if (r !== false && !f.keepOpen) ctrl.close(r); }
      catch (e) { console.warn(e); toast(errMsg(e), 'err'); }
      finally { ctrl.busy(false); }
    };
    footEl.appendChild(b);
  });
  if (!footer.length) footEl.remove();
  $('[data-close]', bg).onclick = () => ctrl.close();
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) ctrl.close(); });
  $('#modalRoot').appendChild(bg);
  modalStack.push(ctrl);
  const first = $('input:not([type=hidden]),select,textarea', bodyEl);
  if (first && !('ontouchstart' in window)) first.focus();
  return ctrl;
}
const errMsg = (e) => {
  const c = (e && e.code) || '';
  if (c === 'permission-denied') return t('errPermission');
  if (c === 'unavailable') return t('errNetwork');
  return (e && e.message) || String(e);
};
function confirmBox(message, { danger = false, okLabel } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    openModal({
      title: t('confirm'), body: `<p style="margin:0">${esc(message)}</p>`,
      footer: [{ label: t('cancel'), onClick: () => { fin(false); } },
        { label: okLabel || t('yes'), cls: danger ? 'danger' : 'primary', onClick: () => { fin(true); } }],
      onClose: () => fin(false)
    });
  });
}

/* Write a batch; offline writes are queued by Firestore, so do not block the UI forever */
async function commitBatch(b) {
  const p = b.commit();
  if (!S.online) { p.catch((e) => toast(errMsg(e), 'err')); toast(t('savedOffline'), 'ok'); return 'queued'; }
  const timeout = new Promise((r) => setTimeout(() => r('slow'), 12000));
  const res = await Promise.race([p.then(() => 'done'), timeout]);
  if (res === 'slow') { p.catch((e) => toast(errMsg(e), 'err')); toast(t('savedOffline'), 'ok'); }
  return res;
}
const roleLabel = (r) => t('role_' + r);

/* ---------------------------------------------------------------------
   Full-screen states (login / onboarding / errors)
   --------------------------------------------------------------------- */
const LOGO_SVG = '<svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/></svg>';
function hideBoot() { $('#boot').hidden = true; }
function showLoading() { $('#boot').hidden = false; }
function showScreen(html) {
  hideBoot(); $('#app').hidden = true;
  const s = $('#screen'); s.hidden = false;
  s.innerHTML = `<div class="screen"><div class="screen-card">${html}</div></div>`;
  return s;
}
const langToggle = () => `<div class="row" style="justify-content:center"><div class="seg"><button data-lang="bn" class="${S.lang === 'bn' ? 'active' : ''}">বাংলা</button><button data-lang="en" class="${S.lang === 'en' ? 'active' : ''}">English</button></div></div>`;
function bindLang(root, rerender) {
  $$('[data-lang]', root).forEach((b) => { b.onclick = () => { S.lang = b.dataset.lang; savePrefs(); rerender(); }; });
}
function showApp() { hideBoot(); $('#screen').hidden = true; $('#app').hidden = false; }

function showLogin() {
  const s = showScreen(`<div class="logo">${LOGO_SVG}</div><h1>AMAR DOKAN PRO</h1><p>${t('tagline')}</p>
    <button class="google-btn" id="googleBtn">${GOOGLE_SVG}<span>${t('signInGoogle')}</span></button>
    <p class="small">${ic('lock')} ${t('loginNote')}</p>${langToggle()}`);
  $('#googleBtn', s).onclick = signInGoogle;
  bindLang(s, showLogin);
}
function showNoConfig(kind) {
  const s = showScreen(`<div class="logo">${LOGO_SVG}</div><h1>AMAR DOKAN PRO</h1>
    <div class="alert">${ic('alert')}<div>${kind === 'sdkfail' ? t('sdkFail') : t('noConfig')}</div></div>
    <ol class="steps"><li>${t('noConfig1')}</li><li>${t('noConfig2')} <code>web/firebase-config.js</code></li><li>${t('noConfig3')}</li></ol>
    ${kind === 'sdkfail' ? `<button class="btn primary block" id="retry">${t('retry')}</button>` : ''}${langToggle()}`);
  bindLang(s, () => showNoConfig(kind));
  const r = $('#retry', s); if (r) r.onclick = () => location.reload();
}
function showFatal(title, msg, retry) {
  const s = showScreen(`<div class="logo" style="background:var(--danger)">${ic('alert')}</div><h2>${esc(title)}</h2><p class="small">${esc(msg)}</p>
    <button class="btn primary block" id="retry">${t('retry')}</button><button class="btn block" id="so">${t('signOut')}</button>`);
  $('#retry', s).onclick = () => retry && retry();
  $('#so', s).onclick = doSignOut;
}
function showRemoved() {
  const s = showScreen(`<div class="logo">${ic('lock')}</div><h2>${t('removedTitle')}</h2><p>${t('removedMsg')}</p><button class="btn primary block" id="so">${t('signOut')}</button>`);
  $('#so', s).onclick = doSignOut;
}
function showOnboard() {
  const s = showScreen(`<div class="logo">${ic('store')}</div><h2>${t('welcome')}</h2><p>${t('welcomeMsg', esc(S.user.email || ''))}</p>
    <label class="f" style="text-align:left">${t('shopName')}<input id="shopName" maxlength="80" placeholder="${t('shopNamePh')}"></label>
    <button class="btn primary block" id="create">${t('createShop')}</button>
    <p class="small">${t('inviteHint')}</p><button class="btn ghost block" id="so">${t('signOut')}</button>`);
  $('#so', s).onclick = doSignOut;
  $('#create', s).onclick = async (e) => {
    const name = $('#shopName', s).value.trim();
    if (name.length < 2) { toast(t('errShopName'), 'err'); return; }
    e.target.disabled = true; showLoading();
    try { await createShop(name); } catch (err) { console.error(err); showOnboard(); toast(errMsg(err), 'err'); }
  };
}
function showInvite(inv) {
  const s = showScreen(`<div class="logo">${ic('mail')}</div><h2>${t('invitedTitle')}</h2><p>${t('invitedMsg', `<b>${roleLabel(inv.role)}</b>`)}</p>
    <button class="btn primary block" id="acc">${t('acceptInvite')}</button><button class="btn ghost block" id="so">${t('signOut')}</button>`);
  $('#so', s).onclick = doSignOut;
  $('#acc', s).onclick = async (e) => {
    e.target.disabled = true; showLoading();
    try { await acceptInvite(inv); } catch (err) { console.error(err); showInvite(inv); toast(errMsg(err), 'err'); }
  };
}

async function enterApp() {
  const snap = await FB.getDoc(FB.doc(FB.db, 'shops', S.shopId));
  if (!snap.exists()) { showFatal(t('errLoadAccount'), 'shop missing', () => resolveAccess()); return; }
  S.shop = snap.data();
  if (isOwner() && !S.shop.seeded) {
    try { await seedAccounts(); S.shop.seeded = true; } catch (e) { console.error(e); }
  }
  startListeners();
  applyPrefs();
  buildChrome();
  showApp();
  route();
}

/* ---------------------------------------------------------------------
   App chrome: sidebar, top bar, bottom navigation, router
   --------------------------------------------------------------------- */
const NAV = [
  { id: 'dashboard', icon: 'home', perm: () => true },
  { id: 'pos', icon: 'cart', perm: () => can('sell') },
  { id: 'products', icon: 'box', perm: () => true },
  { id: 'sales', icon: 'list', perm: () => can('sell') || can('viewAllSales') },
  { id: 'customers', icon: 'users', perm: () => can('customers') || can('sell') },
  { id: 'accounts', icon: 'wallet', perm: () => can('finance') },
  { id: 'reports', icon: 'file', perm: () => can('finance') },
  { id: 'expenses', icon: 'receipt', perm: () => can('expenses') },
  { id: 'pnl', icon: 'trend', perm: () => can('profit') },
  { id: 'users', icon: 'shield', perm: () => isOwner() },
  { id: 'settings', icon: 'sliders', perm: () => true }
];
const navItems = () => NAV.filter((n) => n.perm());
const shopInitial = () => esc((S.shop && S.shop.name || 'A').trim().charAt(0).toUpperCase());

function buildChrome() {
  const items = navItems();
  $('#sidebar').innerHTML = `<div class="brand"><div class="avatar" style="width:34px;height:34px">${ic('store')}</div><span class="lbl">AMAR DOKAN PRO</span></div>` +
    items.map((n) => `<a href="#/${n.id}" data-nav="${n.id}" title="${t('nav_' + n.id)}">${ic(n.icon)}<span class="lbl">${t('nav_' + n.id)}</span></a>`).join('');
  const BOTTOM = ['dashboard', 'pos', 'products', 'customers'];
  const main = items.filter((n) => BOTTOM.includes(n.id)), rest = items.filter((n) => !BOTTOM.includes(n.id));
  $('#bottomnav').innerHTML = main.map((n) => `<a href="#/${n.id}" data-nav="${n.id}">${ic(n.icon)}<span>${t('nav_' + n.id)}</span></a>`).join('') +
    `<a href="#" data-more="1">${ic('more')}<span>${t('more')}</span></a>`;
  $('[data-more]', $('#bottomnav')).onclick = (e) => {
    e.preventDefault();
    const m = openModal({ title: t('more'), body: `<div class="grid g3">${rest.map((n) => `<a class="card center" style="text-decoration:none;color:inherit;padding:14px 6px" href="#/${n.id}" data-x>${ic(n.icon, 'x')}<div class="small bold" style="margin-top:6px">${t('nav_' + n.id)}</div></a>`).join('')}</div>` });
    $$('[data-x]', m.el).forEach((a) => { a.onclick = () => m.close(); });
  };
  const tb = $('#topbar');
  tb.innerHTML = `<div class="shop"><div class="avatar" id="tbLogo"></div><div style="min-width:0"><div class="shop-name" id="tbName"></div><div class="shop-sub"><span class="badge">${roleLabel(S.member.role)}</span><span id="syncChip"></span></div></div></div>
    <button class="btn icon ghost" id="tbLang" title="${t('language')}"><b style="font-size:13px">${S.lang === 'bn' ? 'EN' : 'বাং'}</b></button>
    <button class="btn icon ghost" id="tbTheme" title="${t('theme')}">${ic(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
    <button class="btn icon ghost" id="tbUser" title="${t('account')}">${ic('user')}</button>`;
  $('#tbLang').onclick = () => { S.lang = S.lang === 'bn' ? 'en' : 'bn'; savePrefs(); buildChrome(); route(); };
  $('#tbTheme').onclick = () => { S.mode = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; savePrefs(); buildChrome(); };
  $('#tbUser').onclick = profileModal;
  updateChrome(); updateSyncChip(); highlightNav();
}
function updateChrome() {
  const n = $('#tbName'); if (!n) return;
  n.textContent = (S.shop && S.shop.name) || '';
  const lg = $('#tbLogo');
  lg.innerHTML = S.branding && S.branding.logo ? `<img alt="" src="${esc(S.branding.logo)}">` : shopInitial();
  document.title = ((S.shop && S.shop.name) || 'AMAR DOKAN PRO');
}
function highlightNav() {
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === S.route.name));
}
function profileModal() {
  const u = S.user;
  const m = openModal({
    title: t('account'),
    body: `<div class="row" style="margin-bottom:12px"><div class="avatar">${u.photoURL ? `<img alt="" src="${esc(u.photoURL)}" referrerpolicy="no-referrer">` : esc((u.displayName || u.email || 'U').charAt(0).toUpperCase())}</div>
      <div><div class="bold">${esc(u.displayName || '')}</div><div class="small muted">${esc(u.email || '')}</div></div></div>
      <div class="kv"><span>${t('role')}</span><b>${roleLabel(S.member.role)}</b><span>${t('shop')}</span><b>${esc(S.shop.name)}</b><span>${t('sync')}</span><b id="pfSync"></b></div>
      ${NATIVE ? `<p class="small muted">${t('appVersion')}: ${esc(window.AndroidBridge.appVersion())}</p>` : ''}`,
    footer: [{ label: t('close') }, { label: t('signOut'), cls: 'danger', icon: 'logout', onClick: async () => { await doSignOut(); } }]
  });
  const s = syncState(); $('#pfSync', m.el).textContent = t(s === 'ok' ? 'synced' : s === 'sync' ? 'syncing' : 'offline');
}

/* Router */
const ROUTES = {};
const go = (path) => { if (location.hash === '#/' + path) route(); else location.hash = '#/' + path; };
function parseHash() {
  const [n, ...p] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: n || 'dashboard', param: p.length ? decodeURIComponent(p.join('/')) : null };
}
function route() {
  if (!S.shopId || !S.member) return;
  let r = parseHash(), def = ROUTES[r.name];
  if (!def || (def.perm && !def.perm())) {
    r = { name: 'dashboard', param: null }; def = ROUTES.dashboard;
    if (location.hash && location.hash !== '#/dashboard') history.replaceState(null, '', '#/dashboard');
  }
  S.route = r; S.page = null;
  const v = $('#view'); v.innerHTML = '';
  try { S.page = def.render(v, r.param) || {}; } catch (e) { console.error(e); v.innerHTML = `<div class="alert red">${ic('alert')}<div>${esc(e.message)}</div></div>`; }
  highlightNav();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
// Android hardware back button hook (see MainActivity.kt)
window.__androidBack = () => {
  if (modalStack.length) { modalStack[modalStack.length - 1].close(); return true; }
  const pos = $('.pos.cart-open'); if (pos) { pos.classList.remove('cart-open'); return true; }
  if (S.shopId && S.route.name !== 'dashboard') { go('dashboard'); return true; }
  return false;
};

/* shared page bits */
const pageHead = (title, actions = '') => `<div class="page-h"><h2>${title}</h2><div class="row">${actions}</div></div>`;
const emptyBox = (icon, msg) => `<div class="empty">${ic(icon)}<div>${msg}</div></div>`;
const periodRange = (p, ref = ymd()) => p === 'day' ? [ref, ref] : p === 'week' ? [weekStart(ref), dateAdd(weekStart(ref), 6)] : [monthStart(ref), monthEnd(ref)];

/* ---------------------------------------------------------------------
   Business logic: aggregates
   --------------------------------------------------------------------- */
const inR = (d, a, b) => !!d && d >= a && d <= b;
const salesIn = (a, b) => arr(S.sales).filter((s) => s.status === 'active' && inR(s.date, a, b));
const expensesIn = (a, b) => arr(S.expenses).filter((e) => inR(e.date, a, b));
const purchasesIn = (a, b) => arr(S.purchases).filter((p) => inR(p.date, a, b));
const totalDue = () => sum(arr(S.customers), (c) => Math.max(0, c.due || 0));
const activeAccounts = () => arr(S.accounts).filter((a) => a.active !== false).sort((x, y) => (x.order ?? 99) - (y.order ?? 99) || (x.createdAt || 0) - (y.createdAt || 0));
const accName = (id) => { const a = S.accounts.get(id); return a ? a.name : id || ''; };
const acctLabel = (a) => (a.auto ? t('acct_' + a.type) : a.name);
const accLabelById = (id) => { const a = S.accounts.get(id); return a ? acctLabel(a) : id || ''; };
const balanceOf = (id) => (S.balances.get(id) || {}).balance || 0;
const isMobileAcc = (a) => !['cash', 'bank', 'other'].includes(a.type);

// Profit uses the ACTUAL price each line was sold for (stored per line + in saleCosts), never the list price.
function statsFor(a, b) {
  const sales = salesIn(a, b);
  const total = sum(sales, (s) => s.total);
  const out = { sales, count: sales.length, total, paid: sum(sales, (s) => s.paid), due: sum(sales, (s) => s.due), discount: sum(sales, (s) => s.discount), cost: null, profit: null, missingCost: 0 };
  if (can('profit')) {
    let cost = 0, profit = 0, missing = 0;
    sales.forEach((s) => { const c = S.saleCosts.get(s.id); if (c) { cost += c.cost; profit += c.profit; } else missing++; });
    Object.assign(out, { cost, profit, missingCost: missing });
  }
  const ex = expensesIn(a, b), pu = purchasesIn(a, b);
  out.expenses = can('expenses') || can('finance') || can('profit') ? sum(ex, (e) => e.amount) : null;
  out.purchases = can('viewCost') ? sum(pu, (p) => p.total) : null;
  out.net = out.profit !== null && out.expenses !== null ? out.profit - out.expenses : null;
  return out;
}
function lowStockList() {
  const def = shopSettings().defaultLowStock;
  return arr(S.products).filter((p) => (p.stock ?? 0) <= (p.lowStock ?? def)).sort((x, y) => x.stock - y.stock);
}
const lowOf = (p) => (p.stock ?? 0) <= (p.lowStock ?? shopSettings().defaultLowStock);

/* ---------------------------------------------------------------------
   Writers (every multi-document change is a single atomic batch)
   --------------------------------------------------------------------- */
const wb = () => FB.writeBatch(FB.db);
const nowMs = () => Date.now();
function balOp(b, accountId, delta) {
  b.set(dref('accountBalances', accountId), { balance: FB.increment(r2(delta)), updatedAt: nowMs() }, { merge: true });
}
// One transaction row + its balance change. delta is signed.
function txOp(b, id, o) {
  b.set(dref('transactions', id), {
    type: o.type, accountId: o.accountId, amount: r2(o.amount), delta: r2(o.delta), date: o.date, time: o.time || nowTime(),
    desc: String(o.desc || '').slice(0, 200), refId: o.refId || '', refType: o.refType || '', groupId: o.groupId || '',
    createdBy: S.user.uid, createdAt: nowMs()
  });
  balOp(b, o.accountId, o.delta);
}
function reverseTxOp(b, id, tx) {
  b.delete(dref('transactions', id));
  balOp(b, tx.accountId, -tx.delta);
}
const fail = (key, ...a) => { throw new Error(t(key, ...a)); };
function needDate(d) { if (!validYmd(d)) fail('errDate'); }
function needAmount(n, key = 'errAmount') { if (!(n > 0) || n > 999999999) fail(key); }
function needAccount(id) { const a = S.accounts.get(id); if (!a || a.active === false) fail('errAccount'); return a; }

/* ---- products ---- */
async function saveProduct(p) {
  const name = String(p.name || '').trim();
  if (!name || name.length > 120) fail('errName');
  if (!(p.sellPrice >= 0) || p.sellPrice > 99999999) fail('errPrice');
  if (!Number.isFinite(p.stock) || Math.abs(p.stock) > 99999999) fail('errStock');
  if (p.cost != null && !(p.cost >= 0)) fail('errPrice');
  const barcode = String(p.barcode || '').trim();
  if (barcode && arr(S.products).some((x) => x.barcode === barcode && x.id !== p.id)) fail('errBarcodeDup');
  const id = p.id || autoId(), b = wb(), ts = nowMs();
  const data = { name, sellPrice: r2(p.sellPrice), stock: Math.round(p.stock * 1000) / 1000, barcode, category: String(p.category || '').trim().slice(0, 60), lowStock: Number.isFinite(p.lowStock) ? p.lowStock : shopSettings().defaultLowStock, updatedAt: ts };
  if (!p.id) data.createdAt = ts;
  b.set(dref('products', id), data, { merge: true });
  if (can('viewCost') && p.cost != null) b.set(dref('productCosts', id), { cost: r2(p.cost), updatedAt: ts }, { merge: true });
  await commitBatch(b);
  return id;
}
async function deleteProduct(id) {
  const b = wb(); b.delete(dref('products', id));
  if (can('viewCost')) b.delete(dref('productCosts', id));
  await commitBatch(b);
}
async function purchaseStock(o) {
  const p = S.products.get(o.productId); if (!p) fail('errProduct');
  needAmount(o.qty, 'errQty'); if (!(o.unitCost >= 0)) fail('errPrice'); needDate(o.date);
  needAccount(o.accountId);
  const total = r2(o.qty * o.unitCost), id = autoId(), b = wb(), ts = nowMs();
  b.set(dref('purchases', id), { productId: p.id, name: p.name, qty: o.qty, unitCost: r2(o.unitCost), total, accountId: o.accountId, supplier: String(o.supplier || '').slice(0, 80), note: String(o.note || '').slice(0, 200), date: o.date, time: nowTime(), createdBy: S.user.uid, createdAt: ts });
  b.update(dref('products', p.id), { stock: FB.increment(o.qty), updatedAt: ts });
  const oldCost = (S.costs.get(p.id) || {}).cost || 0, oldStock = Math.max(0, p.stock || 0);
  const avg = oldStock + o.qty > 0 ? (oldStock * oldCost + o.qty * o.unitCost) / (oldStock + o.qty) : o.unitCost; // weighted average cost
  b.set(dref('productCosts', p.id), { cost: r2(avg), updatedAt: ts }, { merge: true });
  if (total > 0) txOp(b, 'pur_' + id, { type: 'purchase', accountId: o.accountId, amount: total, delta: -total, date: o.date, desc: t('txPurchaseDesc', p.name, fmtNum(o.qty)), refId: id, refType: 'purchase' });
  await commitBatch(b);
}
async function deletePurchase(p) {
  const b = wb(), ts = nowMs();
  b.delete(dref('purchases', p.id));
  if (S.products.has(p.productId)) b.update(dref('products', p.productId), { stock: FB.increment(-p.qty), updatedAt: ts });
  if (p.total > 0) reverseTxOp(b, 'pur_' + p.id, { accountId: p.accountId, delta: -p.total });
  await commitBatch(b);
}

/* ---- customers ---- */
async function saveCustomer(c) {
  const name = String(c.name || '').trim();
  if (!name || name.length > 100) fail('errName');
  const phone = toLatin(c.phone || '').replace(/[\s-]/g, '');
  if (phone && !/^\+?\d{6,15}$/.test(phone)) fail('errPhone');
  const id = c.id || autoId(), b = wb(), ts = nowMs();
  const data = { name, phone, address: String(c.address || '').trim().slice(0, 200), updatedAt: ts };
  if (!c.id) { data.createdAt = ts; data.due = r2(c.openingDue || 0); if (!(data.due >= 0)) fail('errAmount'); }
  b.set(dref('customers', id), data, { merge: true });
  await commitBatch(b);
  return id;
}
async function deleteCustomer(c) {
  if (Math.abs(c.due || 0) > 0.009) fail('errCustomerDue');
  const b = wb(); b.delete(dref('customers', c.id)); await commitBatch(b);
}
async function collectDue(o) {
  const c = S.customers.get(o.customerId); if (!c) fail('errCustomerRequired');
  needAmount(o.amount); needDate(o.date); needAccount(o.accountId);
  if (o.amount > (c.due || 0) + 0.009) fail('errOverDue', money(c.due || 0));
  const id = autoId(), b = wb(), ts = nowMs();
  b.set(dref('payments', id), { customerId: c.id, customerName: c.name, amount: r2(o.amount), accountId: o.accountId, date: o.date, time: nowTime(), note: String(o.note || '').slice(0, 200), createdBy: S.user.uid, createdAt: ts });
  b.update(dref('customers', c.id), { due: FB.increment(-r2(o.amount)), updatedAt: ts });
  txOp(b, 'pay_' + id, { type: 'due_collection', accountId: o.accountId, amount: o.amount, delta: o.amount, date: o.date, desc: t('txDueDesc', c.name), refId: id, refType: 'payment' });
  await commitBatch(b);
  return id;
}
async function deletePayment(p) {
  const b = wb(); b.delete(dref('payments', p.id));
  if (S.customers.has(p.customerId)) b.update(dref('customers', p.customerId), { due: FB.increment(p.amount), updatedAt: nowMs() });
  reverseTxOp(b, 'pay_' + p.id, { accountId: p.accountId, delta: p.amount });
  await commitBatch(b);
}

/* ---- sales ---- */
const cartTotals = (cart) => {
  const subtotal = r2(sum(cart.lines, (l) => l.qty * l.price));
  const discount = Math.min(subtotal, Math.max(0, r2(cart.discount || 0)));
  const total = r2(subtotal - discount);
  const paid = r2(sum(cart.pays, (p) => p.amount));
  return { subtotal, discount, total, paid, due: r2(total - paid) };
};
async function commitSale(cart) {
  if (!can('sell')) fail('errPermission');
  if (!cart.lines.length) fail('errCart');
  const allowNeg = shopSettings().allowNegativeStock;
  cart.lines.forEach((l) => {
    const p = S.products.get(l.pid); if (!p) fail('errProduct');
    if (!(l.qty > 0)) fail('errQty');
    if (!(l.price >= 0)) fail('errPrice');
    if (!allowNeg && l.qty > (p.stock || 0) + 1e-9) fail('errStockLow', p.name, fmtNum(p.stock || 0));
  });
  const tot = cartTotals(cart);
  if (cart.discount < 0 || cart.discount > tot.subtotal + 1e-9) fail('errDiscount');
  cart.pays.forEach((p) => { needAmount(p.amount); needAccount(p.accountId); });
  if (tot.paid > tot.total + 0.009) fail('errPayExceeds');
  const cust = cart.customerId ? S.customers.get(cart.customerId) : null;
  if (tot.due > 0.009 && !cust) fail('errCustomerRequired');

  const id = autoId(), d = new Date(), date = ymd(d), time = nowTime(d), ts = nowMs();
  const inv = 'INV-' + date.slice(2).replace(/-/g, '') + '-' + autoId().slice(0, 4).toUpperCase();
  const lines = cart.lines.map((l) => { const p = S.products.get(l.pid); return { pid: l.pid, name: p.name, qty: l.qty, price: r2(l.price), listPrice: r2(p.sellPrice) }; });
  const pays = cart.pays.map((p) => ({ accountId: p.accountId, method: methodOfType((S.accounts.get(p.accountId) || {}).type || 'other'), amount: r2(p.amount) }));
  const sale = {
    invoice: inv, date, time, customerId: cust ? cust.id : '', customerName: cust ? cust.name : '', customerPhone: cust ? cust.phone || '' : '',
    lines, subtotal: tot.subtotal, discount: tot.discount, total: tot.total, paid: tot.paid, due: Math.max(0, tot.due), payments: pays,
    note: String(cart.note || '').slice(0, 200), status: 'active', createdBy: S.user.uid, createdByName: S.user.displayName || userEmail(), createdAt: ts
  };
  const b = wb();
  b.set(dref('sales', id), sale);
  lines.forEach((l) => b.update(dref('products', l.pid), { stock: FB.increment(-l.qty), updatedAt: ts }));
  pays.forEach((p, i) => txOp(b, `${id}_p${i}`, { type: 'sale', accountId: p.accountId, amount: p.amount, delta: p.amount, date, time, desc: t('txSaleDesc', inv), refId: id, refType: 'sale' }));
  if (sale.due > 0 && cust) b.update(dref('customers', cust.id), { due: FB.increment(sale.due), updatedAt: ts });
  if (can('viewCost') || can('profit')) {
    const cost = r2(sum(lines, (l) => l.qty * ((S.costs.get(l.pid) || {}).cost || 0)));
    b.set(dref('saleCosts', id), { date, cost, profit: r2(sale.total - cost), total: sale.total, createdAt: ts });
  }
  await commitBatch(b);
  return { id, ...sale };
}
async function voidSale(s) {
  if (!can('deleteRecords') || !can('finance')) fail('errPermission');
  const b = wb(), ts = nowMs();
  b.update(dref('sales', s.id), { status: 'voided', voidedAt: ts, voidedBy: S.user.uid });
  s.lines.forEach((l) => { if (S.products.has(l.pid)) b.update(dref('products', l.pid), { stock: FB.increment(l.qty), updatedAt: ts }); });
  (s.payments || []).forEach((p, i) => reverseTxOp(b, `${s.id}_p${i}`, { accountId: p.accountId, delta: p.amount }));
  if (s.customerId && s.due > 0 && S.customers.has(s.customerId)) b.update(dref('customers', s.customerId), { due: FB.increment(-s.due), updatedAt: ts });
  await commitBatch(b);
}

// Employees cannot read purchase costs, so their sales are written without cost data.
// An owner/manager device (who may read costs) fills in saleCosts for those sales automatically.
const reconciling = new Set();
async function maybeReconcile() {
  if (!FB || !S.shopId || !(can('viewCost') || can('profit'))) return;
  if (!S.loaded.sales || !S.loaded.saleCosts || !S.loaded.productCosts) return;
  const todo = arr(S.sales).filter((s) => s.status === 'active' && !S.saleCosts.has(s.id) && !reconciling.has(s.id)).slice(0, 120);
  if (!todo.length) return;
  const b = wb();
  todo.forEach((s) => {
    reconciling.add(s.id);
    const cost = r2(sum(s.lines, (l) => l.qty * ((S.costs.get(l.pid) || {}).cost || 0)));
    b.set(dref('saleCosts', s.id), { date: s.date, cost, profit: r2(s.total - cost), total: s.total, createdAt: nowMs(), auto: true });
  });
  try { await b.commit(); } catch (e) { console.warn('reconcile', e); todo.forEach((s) => reconciling.delete(s.id)); }
}

/* ---- expenses ---- */
async function saveExpense(o, existing) {
  const amount = r2(o.amount); needAmount(amount); needDate(o.date); needAccount(o.accountId);
  if (!EXPENSE_CATS.includes(o.category) && !String(o.category || '').trim()) fail('errCategory');
  const id = existing ? existing.id : autoId(), b = wb(), ts = nowMs();
  b.set(dref('expenses', id), { category: o.category, amount, date: o.date, time: existing ? existing.time : nowTime(), accountId: o.accountId, note: String(o.note || '').slice(0, 200), createdBy: existing ? existing.createdBy : S.user.uid, createdAt: existing ? existing.createdAt : ts, updatedAt: ts });
  if (existing) balOp(b, existing.accountId, existing.amount); // undo old effect, the tx doc below is overwritten
  txOp(b, 'exp_' + id, { type: 'expense', accountId: o.accountId, amount, delta: -amount, date: o.date, desc: t('txExpenseDesc', expLabel(o.category)), refId: id, refType: 'expense' });
  await commitBatch(b);
}
const expLabel = (c) => (EXPENSE_CATS.includes(c) ? t('cat_' + c) : c);
async function deleteExpense(e) {
  const b = wb(); b.delete(dref('expenses', e.id));
  reverseTxOp(b, 'exp_' + e.id, { accountId: e.accountId, delta: -e.amount });
  await commitBatch(b);
}

/* ---- accounts & manual transactions ---- */
async function saveAccount(o, existing) {
  const name = String(o.name || '').trim();
  if (!name || name.length > 60) fail('errName');
  if (!ACCOUNT_TYPES.includes(o.type)) fail('errAccount');
  const number = toLatin(o.number || '').trim().slice(0, 30);
  if (number && !/^[\d+\-\s]+$/.test(number)) fail('errPhone');
  const id = existing ? existing.id : autoId(), b = wb(), ts = nowMs();
  if (existing) {
    b.update(dref('accounts', id), { name, number, active: o.active !== false, updatedAt: ts });
  } else {
    const opening = r2(o.opening || 0);
    b.set(dref('accounts', id), { name, type: o.type, number, active: true, auto: false, order: 50 + S.accounts.size, opening, createdAt: ts });
    b.set(dref('accountBalances', id), { balance: 0, updatedAt: ts });
    if (opening !== 0) txOp(b, 'open_' + id, { type: 'opening', accountId: id, amount: Math.abs(opening), delta: opening, date: ymd(), desc: t('txOpeningDesc') });
  }
  await commitBatch(b);
}
async function manualTx(o) {
  needAccount(o.accountId); needDate(o.date);
  let amount = r2(o.amount); if (!(amount > 0)) fail('errAmount');
  const delta = o.type === 'deposit' ? amount : o.type === 'adjustment' ? (o.sign < 0 ? -amount : amount) : -amount;
  const b = wb();
  txOp(b, autoId(), { type: o.type, accountId: o.accountId, amount, delta, date: o.date, desc: o.desc || t('tx_' + o.type) });
  await commitBatch(b);
}
async function transferTx(o) {
  needAccount(o.from); needAccount(o.to); needDate(o.date);
  if (o.from === o.to) fail('errSameAccount');
  const amount = r2(o.amount), fee = r2(o.fee || 0);
  needAmount(amount); if (!(fee >= 0)) fail('errAmount');
  const gid = autoId(), b = wb(), time = nowTime();
  const desc = o.desc || t('txTransferDesc', accLabelById(o.from), accLabelById(o.to));
  txOp(b, gid + '_o', { type: 'transfer_out', accountId: o.from, amount, delta: -amount, date: o.date, time, desc, groupId: gid });
  txOp(b, gid + '_i', { type: 'transfer_in', accountId: o.to, amount, delta: amount, date: o.date, time, desc, groupId: gid });
  if (fee > 0) txOp(b, gid + '_f', { type: 'charge', accountId: o.from, amount: fee, delta: -fee, date: o.date, time, desc: t('txFeeDesc'), groupId: gid });
  await commitBatch(b);
}
async function deleteTx(tx) {
  const b = wb();
  const group = tx.groupId ? arr(S.tx).filter((x) => x.groupId === tx.groupId) : [tx];
  group.forEach((x) => reverseTxOp(b, x.id, x));
  await commitBatch(b);
}
const isSystemTx = (x) => ['sale', 'due_collection', 'expense', 'purchase'].includes(x.type);

/* ---------------------------------------------------------------------
   Receipts & statements (printable HTML + plain text for sharing)
   --------------------------------------------------------------------- */
const docCss = (paper) => {
  const w = paper === '58' ? '58mm' : paper === 'A4' ? '190mm' : '80mm';
  const fs = paper === 'A4' ? '13px' : '11.5px';
  return `@page{margin:${paper === 'A4' ? '10mm' : '2mm'}}*{box-sizing:border-box}body{font-family:"Noto Sans Bengali","Hind Siliguri","Segoe UI",Arial,sans-serif;font-size:${fs};color:#000;margin:0 auto;width:${w};padding:${paper === 'A4' ? '0' : '2mm'}}
  h1{font-size:1.45em;margin:0;text-align:center}.c{text-align:center}.r{text-align:right}.m{color:#444}.b{font-weight:700}
  table{width:100%;border-collapse:collapse}td,th{padding:2px 0;vertical-align:top;text-align:left}th.r,td.r{text-align:right}
  .hr{border-top:1px dashed #000;margin:5px 0}.row{display:flex;justify-content:space-between;gap:8px}.tot{font-size:1.2em;font-weight:700}
  img.logo{display:block;margin:0 auto 4px;max-width:44mm;max-height:20mm;object-fit:contain}
  .st th{border-bottom:1px solid #000}.st td{border-bottom:1px solid #ddd;padding:3px 2px}`;
};
const wrapDoc = (title, body, paper) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${docCss(paper)}</style></head><body>${body}</body></html>`;
const shopHeader = (r) => {
  const st = shopSettings(), sh = S.shop || {};
  return (r.showLogo && S.branding.logo ? `<img class="logo" alt="" src="${esc(S.branding.logo)}">` : '') + `<h1>${esc(sh.name || '')}</h1>` +
    (r.showAddress && st.address ? `<div class="c m">${esc(st.address)}</div>` : '') + (r.showPhone && st.phone ? `<div class="c m">${esc(st.phone)}</div>` : '');
};
function receiptHtml(s) {
  const r = shopSettings().receipt;
  const rows = s.lines.map((l) => `<tr><td colspan="3">${esc(l.name)}</td></tr><tr><td class="m">&nbsp;&nbsp;${fmtNum(l.qty)} × ${fmtNum(l.price)}</td><td></td><td class="r">${fmtNum(l.qty * l.price)}</td></tr>`).join('');
  const pays = (s.payments || []).map((p) => `<div class="row"><span>${esc(t('pm_' + p.method))}${S.accounts.has(p.accountId) ? ' (' + esc(accLabelById(p.accountId)) + ')' : ''}</span><span>${money(p.amount)}</span></div>`).join('');
  const body = `${shopHeader(r)}<div class="hr"></div>
    <div class="row"><span>${t('invoice')}</span><b>${esc(s.invoice)}</b></div>
    <div class="row"><span>${t('date')}</span><span>${fmtDate(s.date)} ${fmtTime(s.time)}</span></div>
    ${r.showCashier && s.createdByName ? `<div class="row"><span>${t('cashier')}</span><span>${esc(s.createdByName)}</span></div>` : ''}
    ${s.customerName ? `<div class="row"><span>${t('customer')}</span><span>${esc(s.customerName)}${s.customerPhone ? ' · ' + esc(s.customerPhone) : ''}</span></div>` : ''}
    <div class="hr"></div><table>${rows}</table><div class="hr"></div>
    <div class="row"><span>${t('subtotal')}</span><span>${money(s.subtotal)}</span></div>
    ${s.discount > 0 ? `<div class="row"><span>${t('discount')}</span><span>−${money(s.discount)}</span></div>` : ''}
    <div class="row tot"><span>${t('total')}</span><span>${money(s.total)}</span></div>
    ${pays}<div class="row"><span>${t('paid')}</span><span>${money(s.paid)}</span></div>
    ${r.showDue && s.due > 0 ? `<div class="row b"><span>${t('due')}</span><span>${money(s.due)}</span></div>` : ''}
    ${s.status === 'voided' ? `<div class="c b" style="margin-top:6px">*** ${t('voided')} ***</div>` : ''}
    <div class="hr"></div><div class="c">${esc(r.footer || t('thanks'))}</div>`;
  return wrapDoc(s.invoice, body, r.paper);
}
function receiptText(s) {
  const L = [(S.shop && S.shop.name) || '', `${t('invoice')}: ${s.invoice}`, `${t('date')}: ${fmtDate(s.date)} ${fmtTime(s.time)}`];
  if (s.customerName) L.push(`${t('customer')}: ${s.customerName}`);
  L.push('------------------------');
  s.lines.forEach((l) => L.push(`${l.name}  ${fmtNum(l.qty)} x ${fmtNum(l.price)} = ${moneyPlain(l.qty * l.price)}`));
  L.push('------------------------');
  if (s.discount > 0) L.push(`${t('discount')}: ${moneyPlain(s.discount)}`);
  L.push(`${t('total')}: ${moneyPlain(s.total)}`, `${t('paid')}: ${moneyPlain(s.paid)}`);
  if (s.due > 0) L.push(`${t('due')}: ${moneyPlain(s.due)}`);
  L.push('', shopSettings().receipt.footer || t('thanks'));
  return L.join('\n');
}
function receiptModal(s, { onClose } = {}) {
  const m = openModal({
    title: `${t('receipt')} · ${s.invoice}`, wide: true, onClose,
    body: `<iframe class="rcpt-frame" id="rf" title="receipt"></iframe>${s.status === 'voided' ? `<div class="alert red" style="margin-top:10px">${ic('alert')}<div>${t('voided')}</div></div>` : ''}`,
    footer: [
      ...(s.status === 'active' && can('deleteRecords') && can('finance') ? [{ label: t('voidSale'), cls: 'danger', icon: 'trash', onClick: async () => { if (!(await confirmBox(t('confirmVoid'), { danger: true }))) return false; await voidSale(s); toast(t('voided'), 'ok'); } }] : []),
      ...(s.customerPhone ? [{ label: 'SMS', icon: 'phone', keepOpen: true, onClick: () => { location.href = smsLink(s.customerPhone, receiptText(s)); return false; } }] : []),
      { label: t('share'), icon: 'share', keepOpen: true, onClick: () => { shareText(receiptText(s), s.invoice); return false; } },
      { label: t('print'), icon: 'printer', cls: 'primary', keepOpen: true, onClick: () => { printHtml(receiptHtml(s), s.invoice); return false; } }
    ]
  });
  $('#rf', m.el).srcdoc = receiptHtml(s);
  return m;
}

/* ---------------------------------------------------------------------
   DASHBOARD
   --------------------------------------------------------------------- */
let dashPeriod = 'day';
const statTile = (icon, label, val, sub = '', cls = '') => `<div class="stat ${cls}"><div class="row between"><span class="lbl">${esc(label)}</span><span class="ico">${ic(icon)}</span></div><div class="val">${val}</div><div class="sub">${sub}</div></div>`;
ROUTES.dashboard = {
  render(v) {
    v.innerHTML = `<div class="page-h"><div><h2>${t('nav_dashboard')}</h2><div class="small muted">${fmtDate(ymd())}</div></div><div class="row">${can('sell') ? `<a class="btn primary" href="#/pos">${ic('cart')}${t('newSale')}</a>` : ''}</div></div><div id="dBody" class="stack"></div>`;
    const upd = () => {
      const today = ymd(), td = statsFor(today, today);
      const tiles = [];
      tiles.push(statTile('cart', t('todaySales'), money(td.total), t('nInvoices', td.count), 'hero'));
      if (td.purchases !== null) tiles.push(statTile('box', t('todayPurchases'), money(td.purchases)));
      if (td.profit !== null) tiles.push(statTile('trend', t('todayProfit'), `<span class="${td.profit < 0 ? 'bad' : 'ok'}">${money(td.profit)}</span>`, td.missingCost ? t('costPending', td.missingCost) : t('grossProfit')));
      if (td.expenses !== null) tiles.push(statTile('receipt', t('todayExpenses'), money(td.expenses)));
      if (can('customers')) tiles.push(statTile('users', t('customerDues'), `<span class="${totalDue() > 0 ? 'warn' : ''}">${money(totalDue())}</span>`, t('nWithDue', arr(S.customers).filter((c) => c.due > 0).length)));
      if (can('finance')) {
        const cash = arr(S.accounts).filter((a) => a.type === 'cash').reduce((x, a) => x + balanceOf(a.id), 0);
        tiles.push(statTile('cash', t('cashBalance'), money(cash)));
      }
      let html = `<div class="grid g3">${tiles.join('')}</div>`;

      if (can('finance')) {
        const mob = activeAccounts().filter(isMobileAcc);
        html += `<div class="card"><div class="card-h"><h3>${ic('phone')} ${t('mobileBalances')}</h3><b>${money(sum(mob, (a) => balanceOf(a.id)))}</b></div>` +
          (mob.length ? `<div class="grid g2">${mob.map((a) => `<div class="li click" data-acc="${a.id}" style="border:1px solid var(--border);border-radius:12px;padding:10px"><div class="grow"><div class="t">${esc(acctLabel(a))}</div><div class="s">${esc(a.number || '')}</div></div><b>${money(balanceOf(a.id))}</b></div>`).join('')}</div>` : emptyBox('wallet', t('noAccounts'))) + '</div>';
      }

      // period summary
      const [a, b] = periodRange(dashPeriod), ps = statsFor(a, b);
      const rows = [[t('sales'), money(ps.total)]];
      if (ps.purchases !== null) rows.push([t('purchases'), money(ps.purchases)]);
      if (ps.profit !== null) rows.push([t('grossProfit'), `<span class="${ps.profit < 0 ? 'bad' : 'ok'}">${money(ps.profit)}</span>`]);
      if (ps.expenses !== null) rows.push([t('expenses'), money(ps.expenses)]);
      if (ps.net !== null) rows.push([`<b>${t('netProfit')}</b>`, `<b class="${ps.net < 0 ? 'bad' : 'ok'}">${money(ps.net)}</b>`]);
      rows.push([t('invoices'), fmtNum(ps.count, 0)], [t('dueGiven'), money(ps.due)]);
      html += `<div class="card"><div class="card-h"><h3>${t('summary')}</h3><div class="seg" id="dSeg">${['day', 'week', 'month'].map((p) => `<button data-p="${p}" class="${dashPeriod === p ? 'active' : ''}">${t('per_' + p)}</button>`).join('')}</div></div>
        <div class="small muted" style="margin-bottom:6px">${fmtDate(a)}${a !== b ? ' – ' + fmtDate(b) : ''}</div>
        <table class="tbl"><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="r">${r[1]}</td></tr>`).join('')}</tbody></table></div>`;

      // last 7 days chart
      const days = Array.from({ length: 7 }, (_, i) => dateAdd(today, i - 6));
      const vals = days.map((d) => salesIn(d, d).reduce((x, s) => x + s.total, 0));
      const mx = Math.max(1, ...vals);
      html += `<div class="card"><div class="card-h"><h3>${t('last7')}</h3></div><div class="bars">${days.map((d, i) => `<div class="b" title="${fmtDate(d)}: ${money(vals[i])}"><div class="col"><div class="bar" style="height:${Math.max(2, vals[i] / mx * 100)}%"></div></div><div class="lbl">${parseYmd(d).toLocaleDateString(loc(), { weekday: 'short' })}</div></div>`).join('')}</div></div>`;

      const low = lowStockList().slice(0, 6);
      if (low.length) html += `<div class="card"><div class="card-h"><h3>${ic('alert')} ${t('lowStock')}</h3><a href="#/products/low" class="btn sm soft">${t('viewAll')}</a></div><div class="list">${low.map((p) => `<div class="li"><div class="ico" style="background:rgba(217,119,6,.14);color:var(--warn)">${ic('box')}</div><div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${esc(p.category || '')}</div></div><span class="badge ${p.stock <= 0 ? 'red' : 'amber'}">${fmtNum(p.stock)}</span></div>`).join('')}</div></div>`;

      const recent = arr(S.sales).filter((s) => s.status === 'active').sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)).slice(0, 5);
      if (recent.length) html += `<div class="card"><div class="card-h"><h3>${t('recentSales')}</h3><a href="#/sales" class="btn sm soft">${t('viewAll')}</a></div><div class="list">${recent.map((s) => `<div class="li click" data-sale="${s.id}"><div class="ico">${ic('receipt')}</div><div class="grow"><div class="t">${esc(s.customerName || t('walkIn'))}</div><div class="s">${esc(s.invoice)} · ${fmtDateShort(s.date)} ${fmtTime(s.time)}</div></div><div class="right"><b>${money(s.total)}</b>${s.due > 0 ? `<div class="small warn">${t('due')} ${money(s.due)}</div>` : ''}</div></div>`).join('')}</div></div>`;
      if (S.shop && S.member && S.member.role === 'employee' && !can('viewAllSales')) html += `<div class="alert info">${ic('info')}<div>${t('ownSalesOnly')}</div></div>`;
      $('#dBody', v).innerHTML = html;
      $$('#dSeg button', v).forEach((bt) => { bt.onclick = () => { dashPeriod = bt.dataset.p; upd(); }; });
      $$('[data-sale]', v).forEach((el) => { el.onclick = () => { const s = S.sales.get(el.dataset.sale); if (s) receiptModal(s); }; });
      $$('[data-acc]', v).forEach((el) => { el.onclick = () => go('accounts/' + el.dataset.acc); });
    };
    upd();
    return { update: upd };
  }
};

/* ---------------------------------------------------------------------
   SALES HISTORY
   --------------------------------------------------------------------- */
let salesFilter = { from: '', to: '', q: '' };
ROUTES.sales = {
  perm: () => can('sell') || can('viewAllSales'),
  render(v) {
    if (!salesFilter.from) { salesFilter.from = ymd(); salesFilter.to = ymd(); }
    v.innerHTML = pageHead(t('nav_sales')) + `<div class="card"><div class="form"><div class="two"><label class="f">${t('from')}<input type="date" id="sf" value="${salesFilter.from}"></label><label class="f">${t('to')}<input type="date" id="st" value="${salesFilter.to}"></label></div>
      <div class="searchbox">${ic('search')}<input id="sq" placeholder="${t('searchSales')}" value="${esc(salesFilter.q)}"></div>
      <div class="chips"><button class="chip" data-r="day">${t('per_day')}</button><button class="chip" data-r="week">${t('per_week')}</button><button class="chip" data-r="month">${t('per_month')}</button></div></div></div><div class="card" id="sList" style="margin-top:14px"></div>`;
    const upd = () => {
      const q = lc(salesFilter.q);
      const list = arr(S.sales).filter((s) => inR(s.date, salesFilter.from, salesFilter.to) && (!q || lc(s.invoice).includes(q) || lc(s.customerName).includes(q) || s.lines.some((l) => lc(l.name).includes(q))))
        .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0));
      const act = list.filter((s) => s.status === 'active');
      $('#sList', v).innerHTML = `<div class="row between" style="margin-bottom:8px"><b>${t('nInvoices', act.length)}</b><b>${money(sum(act, (s) => s.total))}</b></div>` +
        (list.length ? `<div class="list">${list.slice(0, 300).map((s) => `<div class="li click" data-id="${s.id}"><div class="ico">${ic('receipt')}</div><div class="grow"><div class="t">${esc(s.customerName || t('walkIn'))} ${s.status === 'voided' ? `<span class="badge red">${t('voided')}</span>` : ''}</div><div class="s">${esc(s.invoice)} · ${fmtDateShort(s.date)} ${fmtTime(s.time)} · ${s.lines.length} ${t('items')}</div></div><div class="right"><b>${money(s.total)}</b>${s.due > 0 ? `<div class="small warn">${t('due')} ${money(s.due)}</div>` : ''}</div></div>`).join('')}</div>` : emptyBox('receipt', t('noSales')));
      $$('[data-id]', v).forEach((el) => { el.onclick = () => { const s = S.sales.get(el.dataset.id); if (s) receiptModal(s); }; });
    };
    const apply = async () => { salesFilter.from = $('#sf', v).value || ymd(); salesFilter.to = $('#st', v).value || salesFilter.from; await ensureWindow(salesFilter.from); upd(); };
    $('#sf', v).onchange = apply; $('#st', v).onchange = apply;
    $('#sq', v).oninput = debounce(() => { salesFilter.q = $('#sq', v).value; upd(); }, 150);
    $$('[data-r]', v).forEach((b) => { b.onclick = () => { [salesFilter.from, salesFilter.to] = periodRange(b.dataset.r); $('#sf', v).value = salesFilter.from; $('#st', v).value = salesFilter.to; apply(); }; });
    upd();
    return { update: upd };
  }
};

/* ---------------------------------------------------------------------
   POS
   --------------------------------------------------------------------- */
const POS = { lines: [], discount: 0, customerId: '', pays: [], note: '', q: '', cat: '' };
const posReset = () => { Object.assign(POS, { lines: [], discount: 0, customerId: '', pays: [], note: '', q: '', cat: '' }); };
const posTotals = () => cartTotals({ lines: POS.lines, discount: POS.discount, pays: POS.pays });
function posSyncAuto() {
  if (POS.pays.length === 1 && POS.pays[0].auto) POS.pays[0].amount = posTotals().total;
}
const methodAccounts = (m) => activeAccounts().filter((a) => methodOfType(a.type) === m);

ROUTES.pos = {
  perm: () => can('sell'),
  render(v) {
    v.innerHTML = `<div class="page-h"><h2>${t('nav_pos')}</h2><div class="row"><a class="btn" href="#/sales">${ic('list')}${t('nav_sales')}</a></div></div>
    <div class="pos" id="pos">
      <div class="stack">
        <div class="searchbox">${ic('search')}<input id="pq" placeholder="${t('scanSearch')}" autocomplete="off" value="${esc(POS.q)}"></div>
        <div class="chips" id="pcats"></div><div class="pgrid" id="pgrid"></div>
      </div>
      <button class="cart-fab" id="cartFab"></button>
      <aside class="cart-panel" id="cartPanel"><div class="cart-head"><b>${ic('cart')} ${t('cart')}</b><div class="row"><button class="btn sm ghost" id="cClear">${t('clear')}</button><button class="btn icon ghost close-cart" id="cClose">${ic('x')}</button></div></div><div class="cart-body" id="cartBody"></div></aside>
    </div>`;
    const pos = $('#pos', v);
    const renderGrid = () => {
      const q = lc(POS.q).trim();
      const cats = [...new Set(arr(S.products).map((p) => p.category).filter(Boolean))].sort();
      $('#pcats', v).innerHTML = cats.length ? `<button class="chip ${POS.cat ? '' : 'active'}" data-c="">${t('all')}</button>` + cats.map((c) => `<button class="chip ${POS.cat === c ? 'active' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('') : '';
      $$('#pcats [data-c]', v).forEach((b) => { b.onclick = () => { POS.cat = b.dataset.c; renderGrid(); }; });
      const list = arr(S.products).filter((p) => (!POS.cat || p.category === POS.cat) && (!q || lc(p.name).includes(q) || lc(p.barcode).includes(q) || lc(p.category).includes(q))).sort((a, b) => a.name.localeCompare(b.name));
      $('#pgrid', v).innerHTML = list.length ? list.slice(0, 200).map((p) => `<button class="pcard ${(p.stock || 0) <= 0 ? 'out' : ''}" data-p="${p.id}"><span class="n">${esc(p.name)}</span><span class="p">${money(p.sellPrice)}</span><span class="st">${t('stock')}: ${fmtNum(p.stock || 0)}${lowOf(p) ? ' ⚠' : ''}</span></button>`).join('') : `<div style="grid-column:1/-1">${emptyBox('box', S.products.size ? t('noResults') : t('noProductsYet'))}</div>`;
      $$('#pgrid [data-p]', v).forEach((b) => { b.onclick = () => addLine(b.dataset.p); });
    };
    const addLine = (pid) => {
      const p = S.products.get(pid); if (!p) return;
      const ex = POS.lines.find((l) => l.pid === pid);
      const next = (ex ? ex.qty : 0) + 1;
      if (!shopSettings().allowNegativeStock && next > (p.stock || 0)) { toast(t('errStockLow', p.name, fmtNum(p.stock || 0)), 'err'); return; }
      if (ex) ex.qty = next; else POS.lines.push({ pid, qty: 1, price: p.sellPrice });
      posSyncAuto(); renderCart(true);
    };
    $('#pq', v).oninput = debounce(() => { POS.q = $('#pq', v).value; renderGrid(); }, 120);
    $('#pq', v).onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      const q = POS.q.trim(); if (!q) return;
      const exact = arr(S.products).find((p) => p.barcode && p.barcode === q);
      const list = arr(S.products).filter((p) => lc(p.name).includes(lc(q)));
      const hit = exact || (list.length === 1 ? list[0] : null);
      if (hit) { addLine(hit.id); POS.q = ''; e.target.value = ''; renderGrid(); } else toast(t('noResults'), 'err');
    };

    const cartBody = $('#cartBody', v);
    const updateTotals = () => {
      const tot = posTotals();
      const set = (id, val) => { const el = $(id, cartBody); if (el) el.innerHTML = val; };
      set('#tSub', money(tot.subtotal)); set('#tTotal', money(tot.total)); set('#tPaid', money(tot.paid));
      set('#tDue', `<span class="${tot.due > 0.009 ? 'warn' : tot.due < -0.009 ? 'bad' : 'ok'}">${money(tot.due)}</span>`);
      $('#cartFab', v).innerHTML = `<span>${ic('cart')} ${t('nItems', fmtNum(sum(POS.lines, (l) => l.qty)))}</span><span>${money(tot.total)}</span>`;
      $('#cartFab', v).hidden = !POS.lines.length;
      $$('[data-amt]', cartBody).forEach((el) => { const l = POS.lines[+el.dataset.amt]; if (l) el.textContent = money(l.qty * l.price); });
    };
    const renderCart = (full) => {
      if (!full) { updateTotals(); return; }
      const costOk = can('viewCost');
      const linesHtml = POS.lines.length ? POS.lines.map((l, i) => {
        const p = S.products.get(l.pid) || { name: '?', sellPrice: 0, stock: 0 };
        const below = costOk && S.costs.has(l.pid) && l.price < S.costs.get(l.pid).cost;
        return `<div class="cline" data-i="${i}"><div class="top"><span>${esc(p.name)}</span><button class="btn icon ghost sm" data-rm="${i}" aria-label="${t('remove')}">${ic('x')}</button></div>
          <div class="ctl"><div class="qty"><button data-dec="${i}">−</button><input data-qty="${i}" inputmode="decimal" value="${l.qty}"><button data-inc="${i}">+</button></div><input data-price="${i}" inputmode="decimal" value="${l.price}" aria-label="${t('sellPrice')}"><b data-amt="${i}">${money(l.qty * l.price)}</b></div>
          <div class="small muted">${t('listPrice')}: ${money(p.sellPrice)} · ${t('stock')}: ${fmtNum(p.stock || 0)} ${l.price !== p.sellPrice ? `<span class="badge amber">${t('priceChanged')}</span>` : ''} ${below ? `<span class="badge red">${t('belowCost')}</span>` : ''}</div></div>`;
      }).join('') : emptyBox('cart', t('cartEmpty'));
      const custs = arr(S.customers).sort((a, b) => a.name.localeCompare(b.name));
      cartBody.innerHTML = `<div>${linesHtml}</div>
        <div class="row"><select id="cCust" class="grow"><option value="">${t('walkIn')}</option>${custs.map((c) => `<option value="${c.id}" ${POS.customerId === c.id ? 'selected' : ''}>${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}${c.due > 0 ? ' (' + t('due') + ' ' + fmtNum(c.due) + ')' : ''}</option>`).join('')}</select><button class="btn icon soft" id="cNewCust" aria-label="${t('addCustomer')}">${ic('plus')}</button></div>
        <div class="card" style="padding:12px">
          <div class="sum-row"><span>${t('subtotal')}</span><b id="tSub"></b></div>
          <div class="sum-row"><span>${t('discount')}</span><input id="cDisc" inputmode="decimal" style="width:120px;text-align:right" value="${POS.discount || ''}" placeholder="0"></div>
          <div class="sum-row total"><span>${t('total')}</span><span id="tTotal"></span></div></div>
        <div><div class="small muted bold" style="margin-bottom:6px">${t('payment')}</div>
          <div class="paychips">${PAY_METHODS.map((m) => `<button class="chip" data-pm="${m}">${t('pm_' + m)}</button>`).join('')}<button class="chip" data-pm="due">${t('pm_due')}</button></div>
          <div id="cPays" style="margin-top:8px"></div></div>
        <div class="card" style="padding:12px"><div class="sum-row"><span>${t('paid')}</span><b id="tPaid"></b></div><div class="sum-row"><span>${t('due')}</span><b id="tDue"></b></div></div>
        <input id="cNote" maxlength="200" placeholder="${t('note')}" value="${esc(POS.note)}">
        <button class="btn primary block" id="cDone" style="min-height:50px;font-size:16px">${ic('check')} ${t('completeSale')}</button>`;
      renderPays(); updateTotals();
      $$('[data-rm]', cartBody).forEach((b) => { b.onclick = () => { POS.lines.splice(+b.dataset.rm, 1); posSyncAuto(); renderCart(true); }; });
      const stockCheck = (l, q) => { const p = S.products.get(l.pid); if (!shopSettings().allowNegativeStock && p && q > (p.stock || 0)) { toast(t('errStockLow', p.name, fmtNum(p.stock || 0)), 'err'); return false; } return true; };
      const setQty = (i, q) => { const l = POS.lines[i]; if (!(q > 0)) { return false; } if (!stockCheck(l, q)) return false; l.qty = q; posSyncAuto(); return true; };
      $$('[data-dec]', cartBody).forEach((b) => { b.onclick = () => { const i = +b.dataset.dec, l = POS.lines[i]; if (l.qty <= 1) { POS.lines.splice(i, 1); posSyncAuto(); renderCart(true); } else { setQty(i, l.qty - 1); renderCart(true); } }; });
      $$('[data-inc]', cartBody).forEach((b) => { b.onclick = () => { const i = +b.dataset.inc; if (setQty(i, POS.lines[i].qty + 1)) renderCart(true); }; });
      $$('[data-qty]', cartBody).forEach((inp) => { inp.onchange = () => { const i = +inp.dataset.qty, q = parseAmt(inp.value); if (setQty(i, q)) { renderCart(false); } else { inp.value = POS.lines[i].qty; } }; });
      $$('[data-price]', cartBody).forEach((inp) => { inp.onchange = () => { const i = +inp.dataset.price, p = parseAmt(inp.value); if (!(p >= 0)) { inp.value = POS.lines[i].price; toast(t('errPrice'), 'err'); return; } POS.lines[i].price = r2(p); posSyncAuto(); renderCart(true); }; });
      $('#cCust', cartBody).onchange = (e) => { POS.customerId = e.target.value; };
      $('#cNewCust', cartBody).onclick = () => customerModal(null, (id) => { POS.customerId = id; renderCart(true); });
      $('#cDisc', cartBody).onchange = (e) => { const d = e.target.value.trim() === '' ? 0 : parseAmt(e.target.value); if (!(d >= 0)) { toast(t('errDiscount'), 'err'); e.target.value = ''; POS.discount = 0; } else POS.discount = r2(d); posSyncAuto(); renderCart(true); };
      $('#cNote', cartBody).oninput = (e) => { POS.note = e.target.value; };
      $$('[data-pm]', cartBody).forEach((b) => {
        b.onclick = () => {
          const m = b.dataset.pm;
          if (m === 'due') { POS.pays = []; if (!POS.customerId) toast(t('pickCustomerForDue')); renderPays(); updateTotals(); return; }
          const accs = methodAccounts(m);
          if (!accs.length) { toast(t('noAccountFor', t('pm_' + m)), 'err'); return; }
          const remaining = Math.max(0, posTotals().due);
          const row = POS.pays.find((p) => p.accountId === accs[0].id);
          if (row) row.amount = r2(row.amount + remaining);
          else { if (POS.pays.length === 1 && POS.pays[0].auto) POS.pays[0].auto = false; POS.pays.push({ accountId: accs[0].id, amount: r2(remaining), auto: POS.pays.length === 0 }); }
          renderPays(); updateTotals();
        };
      });
      $('#cDone', cartBody).onclick = async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        try {
          const sale = await commitSale({ lines: POS.lines, discount: POS.discount, pays: POS.pays, customerId: POS.customerId, note: POS.note });
          posReset(); pos.classList.remove('cart-open'); $('#pq', v).value = '';
          renderCart(true); renderGrid();
          toast(t('saleDone'), 'ok');
          receiptModal(sale);
        } catch (err) { toast(errMsg(err), 'err'); } finally { btn.disabled = false; }
      };
    };
    const renderPays = () => {
      const box = $('#cPays', cartBody); if (!box) return;
      const accs = activeAccounts();
      box.innerHTML = POS.pays.map((p, i) => `<div class="row" style="margin-bottom:6px;flex-wrap:nowrap"><select data-pa="${i}" class="grow">${accs.map((a) => `<option value="${a.id}" ${a.id === p.accountId ? 'selected' : ''}>${esc(acctLabel(a))}</option>`).join('')}</select><input data-pamt="${i}" inputmode="decimal" style="width:110px;text-align:right" value="${p.amount}"><button class="btn icon ghost sm" data-prm="${i}">${ic('x')}</button></div>`).join('');
      $$('[data-pa]', box).forEach((s) => { s.onchange = () => { POS.pays[+s.dataset.pa].accountId = s.value; }; });
      $$('[data-pamt]', box).forEach((inp) => { inp.onchange = () => { const i = +inp.dataset.pamt, n = parseAmt(inp.value); if (!(n > 0)) { toast(t('errAmount'), 'err'); inp.value = POS.pays[i].amount; return; } POS.pays[i].amount = r2(n); POS.pays[i].auto = false; updateTotals(); }; });
      $$('[data-prm]', box).forEach((b) => { b.onclick = () => { POS.pays.splice(+b.dataset.prm, 1); renderPays(); updateTotals(); }; });
    };
    $('#cartFab', v).onclick = () => pos.classList.add('cart-open');
    $('#cClose', v).onclick = () => pos.classList.remove('cart-open');
    $('#cClear', v).onclick = async () => { if (POS.lines.length && !(await confirmBox(t('confirmClear')))) return; posReset(); $('#pq', v).value = ''; renderCart(true); renderGrid(); };
    renderGrid(); renderCart(true);
    return { update: () => { renderGrid(); updateTotals(); } };
  }
};

/* ---------------------------------------------------------------------
   Shared form helpers
   --------------------------------------------------------------------- */
const acctOptions = (sel, filter = () => true) => activeAccounts().filter(filter).map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(acctLabel(a))}${can('finance') ? ' — ' + money(balanceOf(a.id)) : ''}</option>`).join('');
const defaultAccountId = () => { const c = activeAccounts().find((a) => a.type === 'cash'); return (c || activeAccounts()[0] || {}).id || ''; };
const numVal = (root, sel) => parseAmt($(sel, root).value);
const optNum = (root, sel) => { const v = $(sel, root).value.trim(); return v === '' ? 0 : parseAmt(v); };

/* ---------------------------------------------------------------------
   PRODUCTS & INVENTORY
   --------------------------------------------------------------------- */
const PV = { q: '', cat: '', low: false };
function productModal(p) {
  const cats = [...new Set(arr(S.products).map((x) => x.category).filter(Boolean))].sort();
  const cost = p ? (S.costs.get(p.id) || {}).cost : '';
  const m = openModal({
    title: p ? t('editProduct') : t('addProduct'),
    body: `<div class="form">
      <label class="f">${t('productName')} *<input id="pName" maxlength="120" value="${esc(p ? p.name : '')}"></label>
      <div class="two"><label class="f">${t('category')}<input id="pCat" list="catList" maxlength="60" value="${esc(p ? p.category : '')}"><datalist id="catList">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label>
        <label class="f">${t('barcode')}<input id="pBar" maxlength="60" inputmode="text" value="${esc(p ? p.barcode : '')}"></label></div>
      <div class="two"><label class="f">${t('sellPrice')} (৳) *<input id="pSell" inputmode="decimal" value="${p ? p.sellPrice : ''}"></label>
        ${can('viewCost') ? `<label class="f">${t('purchasePrice')} (৳)<input id="pCost" inputmode="decimal" value="${cost === '' || cost === undefined ? '' : cost}"></label>` : '<div></div>'}</div>
      <div class="two"><label class="f">${p ? t('stockQty') : t('openingStock')}<input id="pStock" inputmode="decimal" value="${p ? p.stock : 0}"></label>
        <label class="f">${t('lowStockLevel')}<input id="pLow" inputmode="decimal" value="${p && p.lowStock != null ? p.lowStock : shopSettings().defaultLowStock}"></label></div></div>`,
    footer: [
      ...(p && can('products') ? [{ label: t('delete'), cls: 'danger', icon: 'trash', onClick: async () => { if (!(await confirmBox(t('confirmDeleteProduct', p.name), { danger: true }))) return false; await deleteProduct(p.id); toast(t('deleted'), 'ok'); } }] : []),
      { label: t('cancel') },
      { label: t('save'), cls: 'primary', icon: 'check', onClick: async (c) => {
        const r = c.el;
        await saveProduct({ id: p && p.id, name: $('#pName', r).value, category: $('#pCat', r).value, barcode: $('#pBar', r).value, sellPrice: numVal(r, '#pSell'),
          cost: can('viewCost') && $('#pCost', r).value.trim() !== '' ? numVal(r, '#pCost') : (can('viewCost') && !p ? 0 : null), stock: optNum(r, '#pStock'), lowStock: optNum(r, '#pLow') });
        toast(t('saved'), 'ok');
      } }
    ]
  });
  return m;
}
function purchaseModal(pre) {
  const prods = arr(S.products).sort((a, b) => a.name.localeCompare(b.name));
  if (!prods.length) { toast(t('noProductsYet'), 'err'); return; }
  const first = (pre && S.products.get(pre)) || prods[0];
  const m = openModal({
    title: t('stockPurchase'),
    body: `<div class="form"><label class="f">${t('product')}<select id="uP">${prods.map((p) => `<option value="${p.id}" ${p.id === first.id ? 'selected' : ''}>${esc(p.name)} (${t('stock')}: ${fmtNum(p.stock || 0)})</option>`).join('')}</select></label>
      <div class="two"><label class="f">${t('quantity')}<input id="uQ" inputmode="decimal" value="1"></label><label class="f">${t('unitCost')} (৳)<input id="uC" inputmode="decimal" value="${(S.costs.get(first.id) || {}).cost || ''}"></label></div>
      <div class="sum-row total"><span>${t('total')}</span><span id="uT">৳0</span></div>
      <label class="f">${t('paidFrom')}<select id="uA">${acctOptions(defaultAccountId())}</select></label>
      <div class="two"><label class="f">${t('date')}<input type="date" id="uD" value="${ymd()}"></label><label class="f">${t('supplier')}<input id="uS" maxlength="80"></label></div>
      <label class="f">${t('note')}<input id="uN" maxlength="200"></label><div class="small muted">${t('avgCostNote')}</div></div>`,
    footer: [{ label: t('cancel') }, { label: t('save'), cls: 'primary', icon: 'check', onClick: async (c) => {
      const r = c.el;
      await purchaseStock({ productId: $('#uP', r).value, qty: numVal(r, '#uQ'), unitCost: numVal(r, '#uC'), accountId: $('#uA', r).value, date: $('#uD', r).value, supplier: $('#uS', r).value, note: $('#uN', r).value });
      toast(t('saved'), 'ok');
    } }]
  });
  const tot = () => { const q = numVal(m.el, '#uQ'), c = numVal(m.el, '#uC'); $('#uT', m.el).textContent = money((q || 0) * (c || 0)); };
  $('#uQ', m.el).oninput = tot; $('#uC', m.el).oninput = tot;
  $('#uP', m.el).onchange = (e) => { $('#uC', m.el).value = (S.costs.get(e.target.value) || {}).cost || ''; tot(); };
  tot();
}
function purchaseHistoryModal() {
  const list = arr(S.purchases).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const m = openModal({
    title: t('purchaseHistory'), wide: true,
    body: list.length ? `<div class="list">${list.slice(0, 200).map((p) => `<div class="li"><div class="ico">${ic('box')}</div><div class="grow"><div class="t">${esc(p.name)} × ${fmtNum(p.qty)}</div><div class="s">${fmtDate(p.date)} · ${esc(accLabelById(p.accountId))}${p.supplier ? ' · ' + esc(p.supplier) : ''}</div></div><b>${money(p.total)}</b>${can('deleteRecords') ? `<button class="btn icon ghost sm" data-del="${p.id}">${ic('trash')}</button>` : ''}</div>`).join('')}</div>` : emptyBox('box', t('noPurchases'))
  });
  $$('[data-del]', m.el).forEach((b) => { b.onclick = async () => { if (!(await confirmBox(t('confirmDeletePurchase'), { danger: true }))) return; try { await deletePurchase(S.purchases.get(b.dataset.del)); m.close(); toast(t('deleted'), 'ok'); } catch (e) { toast(errMsg(e), 'err'); } }; });
}

ROUTES.products = {
  render(v, param) {
    if (param === 'low') { PV.low = true; PV.cat = ''; }
    const canEdit = can('products');
    v.innerHTML = pageHead(t('nav_products'), `${can('viewCost') && canEdit ? `<button class="btn" id="bPur">${ic('download')}${t('stockPurchase')}</button>` : ''}${canEdit ? `<button class="btn primary" id="bAdd">${ic('plus')}${t('addProduct')}</button>` : ''}`) +
      `<div class="stack"><div id="pStats"></div><div class="searchbox">${ic('search')}<input id="pSearch" placeholder="${t('searchProducts')}" value="${esc(PV.q)}"></div><div class="chips" id="pChips"></div><div class="card" id="pList"></div></div>`;
    const upd = () => {
      const q = lc(PV.q).trim();
      const cats = [...new Set(arr(S.products).map((p) => p.category).filter(Boolean))].sort();
      $('#pChips', v).innerHTML = `<button class="chip ${!PV.cat && !PV.low ? 'active' : ''}" data-c="">${t('all')}</button><button class="chip ${PV.low ? 'active' : ''}" data-low="1">${ic('alert')} ${t('lowStock')} (${lowStockList().length})</button>` + cats.map((c) => `<button class="chip ${PV.cat === c ? 'active' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
      $$('#pChips [data-c]', v).forEach((b) => { b.onclick = () => { PV.cat = b.dataset.c; PV.low = false; upd(); }; });
      $('#pChips [data-low]', v).onclick = () => { PV.low = !PV.low; PV.cat = ''; upd(); };
      const list = arr(S.products).filter((p) => (!PV.cat || p.category === PV.cat) && (!PV.low || lowOf(p)) && (!q || lc(p.name).includes(q) || lc(p.barcode).includes(q) || lc(p.category).includes(q))).sort((a, b) => a.name.localeCompare(b.name));
      if (can('viewCost')) {
        const all = arr(S.products);
        $('#pStats', v).innerHTML = `<div class="grid g3">${statTile('box', t('totalProducts'), fmtNum(all.length, 0))}${statTile('cash', t('stockValueCost'), money(sum(all, (p) => Math.max(0, p.stock) * ((S.costs.get(p.id) || {}).cost || 0))))}${statTile('tag', t('stockValueRetail'), money(sum(all, (p) => Math.max(0, p.stock) * p.sellPrice)))}</div>`;
      }
      $('#pList', v).innerHTML = list.length ? `<div class="list">${list.slice(0, 400).map((p) => {
        const c = S.costs.get(p.id);
        return `<div class="li ${canEdit ? 'click' : ''}" data-id="${p.id}"><div class="ico">${ic('box')}</div><div class="grow"><div class="t">${esc(p.name)}</div><div class="s">${esc([p.category, p.barcode].filter(Boolean).join(' · '))}${c ? `${p.category || p.barcode ? ' · ' : ''}${t('cost')}: ${money(c.cost)}` : ''}</div></div><div class="right"><b>${money(p.sellPrice)}</b><div><span class="badge ${p.stock <= 0 ? 'red' : lowOf(p) ? 'amber' : 'green'}">${fmtNum(p.stock || 0)}</span></div></div></div>`;
      }).join('')}</div>` : emptyBox('box', S.products.size ? t('noResults') : t('noProductsYet'));
      if (canEdit) $$('#pList [data-id]', v).forEach((el) => { el.onclick = () => productModal(S.products.get(el.dataset.id)); });
    };
    $('#pSearch', v).oninput = debounce(() => { PV.q = $('#pSearch', v).value; upd(); }, 120);
    if (canEdit) $('#bAdd', v).onclick = () => productModal(null);
    const bp = $('#bPur', v); if (bp) { bp.onclick = () => purchaseModal(); bp.oncontextmenu = (e) => { e.preventDefault(); purchaseHistoryModal(); }; }
    upd();
    if (can('viewCost')) { const hb = document.createElement('button'); hb.className = 'btn ghost'; hb.innerHTML = ic('list') + t('purchaseHistory'); hb.onclick = purchaseHistoryModal; $('.page-h .row', v).prepend(hb); }
    return { update: upd };
  }
};

/* ---------------------------------------------------------------------
   CUSTOMERS
   --------------------------------------------------------------------- */
const CV = { q: '', dueOnly: false };
const customerSerial = (id) => arr(S.customers).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id)).findIndex((c) => c.id === id) + 1;
function customerModal(c, onSaved) {
  const m = openModal({
    title: c ? t('editCustomer') : t('addCustomer'),
    body: `<div class="form"><label class="f">${t('customerName')} *<input id="cName" maxlength="100" value="${esc(c ? c.name : '')}"></label>
      <label class="f">${t('mobile')}<input id="cPhone" inputmode="tel" maxlength="16" placeholder="01XXXXXXXXX" value="${esc(c ? c.phone : '')}"></label>
      <label class="f">${t('address')}<input id="cAddr" maxlength="200" value="${esc(c ? c.address : '')}"></label>
      ${c ? '' : `<label class="f">${t('previousDue')} (৳)<input id="cDue" inputmode="decimal" placeholder="0"></label>`}</div>`,
    footer: [{ label: t('cancel') }, { label: t('save'), cls: 'primary', icon: 'check', onClick: async (ctrl) => {
      const r = ctrl.el;
      const id = await saveCustomer({ id: c && c.id, name: $('#cName', r).value, phone: $('#cPhone', r).value, address: $('#cAddr', r).value, openingDue: c ? 0 : optNum(r, '#cDue') });
      toast(t('saved'), 'ok'); if (onSaved) onSaved(id);
    } }]
  });
  return m;
}
function collectModal(c) {
  const m = openModal({
    title: t('collectDue'),
    body: `<div class="form"><div class="alert info">${ic('info')}<div>${esc(c.name)} — ${t('currentDue')}: <b>${money(c.due)}</b></div></div>
      <label class="f">${t('amount')} (৳)<input id="kAmt" inputmode="decimal" value="${c.due > 0 ? c.due : ''}"></label>
      <label class="f">${t('receivedIn')}<select id="kAcc">${acctOptions(defaultAccountId())}</select></label>
      <div class="two"><label class="f">${t('date')}<input type="date" id="kDate" value="${ymd()}"></label><label class="f">${t('note')}<input id="kNote" maxlength="200"></label></div></div>`,
    footer: [{ label: t('cancel') }, { label: t('collect'), cls: 'primary', icon: 'check', onClick: async (ctrl) => {
      const r = ctrl.el;
      await collectDue({ customerId: c.id, amount: numVal(r, '#kAmt'), accountId: $('#kAcc', r).value, date: $('#kDate', r).value, note: $('#kNote', r).value });
      toast(t('collected'), 'ok');
    } }]
  });
  return m;
}

// Ledger rows (oldest first) + running balance. Opening = due before the loaded history.
function statementData(c) {
  const sales = arr(S.sales).filter((s) => s.customerId === c.id && s.status === 'active');
  const pays = arr(S.payments).filter((p) => p.customerId === c.id);
  const ev = [
    ...sales.map((s) => ({ k: 'sale', date: s.date, time: s.time, ts: s.createdAt || 0, ref: s.invoice, desc: s.lines.map((l) => `${l.name} ×${fmtNum(l.qty)}`).join(', '), total: s.total, paid: s.paid, add: s.due, s })),
    ...pays.map((p) => ({ k: 'pay', date: p.date, time: p.time, ts: p.createdAt || 0, ref: t('dueCollection'), desc: [accLabelById(p.accountId), p.note].filter(Boolean).join(' · '), total: 0, paid: p.amount, add: -p.amount, p }))
  ].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) || a.ts - b.ts);
  const opening = r2((c.due || 0) - sum(ev, (e) => e.add));
  let bal = opening;
  ev.forEach((e) => { bal = r2(bal + e.add); e.balance = bal; });
  return { opening, rows: ev, totalSales: sum(sales, (s) => s.total), totalPaid: sum(sales, (s) => s.paid) + sum(pays, (p) => p.amount), due: c.due || 0 };
}
function statementText(c) {
  const d = statementData(c), L = [`${(S.shop && S.shop.name) || ''}`, `${t('customerStatement')}`, `${c.name}${c.phone ? ' (' + c.phone + ')' : ''}`, `${t('date')}: ${fmtDate(ymd())}`, '------------------------'];
  if (Math.abs(d.opening) > 0.009) L.push(`${t('previousDue')}: ${moneyPlain(d.opening)}`);
  d.rows.forEach((e) => L.push(e.k === 'sale' ? `${fmtDateShort(e.date)} ${e.ref}: ${moneyPlain(e.total)} | ${t('paid')} ${moneyPlain(e.paid)} | ${t('due')} ${moneyPlain(e.add)}` : `${fmtDateShort(e.date)} ${t('dueCollection')}: -${moneyPlain(e.paid)}`));
  L.push('------------------------', `${t('totalPurchases')}: ${moneyPlain(d.totalSales)}`, `${t('totalPaid')}: ${moneyPlain(d.totalPaid)}`, `${t('remainingDue')}: ${moneyPlain(d.due)}`);
  return L.join('\n');
}
function statementHtml(c) {
  const d = statementData(c), r = shopSettings().receipt;
  const rows = d.rows.map((e) => `<tr><td>${fmtDate(e.date)}</td><td>${esc(e.ref)}<br><span class="m">${esc(e.desc)}</span></td><td class="r">${e.k === 'sale' ? fmtNum(e.total) : ''}</td><td class="r">${fmtNum(e.paid)}</td><td class="r">${fmtNum(e.balance)}</td></tr>`).join('');
  return wrapDoc(t('customerStatement'), `${shopHeader({ ...r, showLogo: true, showAddress: true, showPhone: true })}<div class="hr"></div><div class="c b">${t('customerStatement')}</div>
    <div class="row"><span>${t('customer')}</span><b>${esc(c.name)}</b></div>${c.phone ? `<div class="row"><span>${t('mobile')}</span><span>${esc(c.phone)}</span></div>` : ''}<div class="row"><span>${t('date')}</span><span>${fmtDate(ymd())}</span></div><div class="hr"></div>
    <table class="st"><thead><tr><th>${t('date')}</th><th>${t('details')}</th><th class="r">${t('amount')}</th><th class="r">${t('paid')}</th><th class="r">${t('balance')}</th></tr></thead><tbody>${Math.abs(d.opening) > 0.009 ? `<tr><td></td><td>${t('previousDue')}</td><td></td><td></td><td class="r">${fmtNum(d.opening)}</td></tr>` : ''}${rows}</tbody></table>
    <div class="hr"></div><div class="row"><span>${t('totalPurchases')}</span><b>${money(d.totalSales)}</b></div><div class="row"><span>${t('totalPaid')}</span><b>${money(d.totalPaid)}</b></div><div class="row tot"><span>${t('remainingDue')}</span><span>${money(d.due)}</span></div>`, 'A4');
}
function statementModal(c) {
  const m = openModal({
    title: `${t('customerStatement')} · ${c.name}`, wide: true,
    body: `<iframe class="rcpt-frame" id="sf" title="statement"></iframe>`,
    footer: [
      ...(c.phone ? [{ label: 'SMS', icon: 'phone', keepOpen: true, onClick: () => { location.href = smsLink(c.phone, statementText(c)); return false; } }] : []),
      { label: t('csv'), icon: 'download', keepOpen: true, onClick: () => { const d = statementData(c); downloadText(`statement-${c.name.replace(/\s+/g, '_')}-${ymd()}.csv`, 'text/csv', toCSV([[t('date'), t('invoice'), t('details'), t('amount'), t('paid'), t('balance')], ...d.rows.map((e) => [e.date, e.ref, e.desc, e.k === 'sale' ? e.total : '', e.paid, e.balance])])); return false; } },
      { label: t('share'), icon: 'share', keepOpen: true, onClick: () => { shareText(statementText(c), t('customerStatement')); return false; } },
      { label: t('print'), icon: 'printer', cls: 'primary', keepOpen: true, onClick: () => { printHtml(statementHtml(c), t('customerStatement')); return false; } }
    ]
  });
  $('#sf', m.el).srcdoc = statementHtml(c);
}

ROUTES.customers = {
  perm: () => can('customers') || can('sell'),
  render(v, param) {
    if (param) return customerDetail(v, param);
    const canEdit = can('customers') || can('sell');
    v.innerHTML = pageHead(t('nav_customers'), canEdit ? `<button class="btn primary" id="cAdd">${ic('plus')}${t('addCustomer')}</button>` : '') +
      `<div class="stack"><div id="cStats"></div><div class="searchbox">${ic('search')}<input id="cSearch" placeholder="${t('searchCustomers')}" value="${esc(CV.q)}"></div><div class="chips"><button class="chip" id="cDueOnly"></button></div><div class="card" id="cList"></div></div>`;
    const upd = () => {
      const q = lc(CV.q).trim(), all = arr(S.customers).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id));
      const serial = new Map(all.map((c, i) => [c.id, i + 1]));
      const list = all.filter((c) => (!CV.dueOnly || c.due > 0.009) && (!q || lc(c.name).includes(q) || lc(c.phone).includes(q)));
      $('#cStats', v).innerHTML = `<div class="grid g3">${statTile('users', t('totalCustomers'), fmtNum(all.length, 0))}${statTile('alert', t('totalDue'), `<span class="warn">${money(totalDue())}</span>`, t('nWithDue', all.filter((c) => c.due > 0.009).length))}</div>`;
      const b = $('#cDueOnly', v); b.className = 'chip ' + (CV.dueOnly ? 'active' : ''); b.textContent = t('dueOnly'); b.onclick = () => { CV.dueOnly = !CV.dueOnly; upd(); };
      $('#cList', v).innerHTML = list.length ? `<div class="list">${list.slice(0, 500).map((c) => `<div class="li click" data-id="${c.id}"><div class="ico bold" style="font-size:13px">${serial.get(c.id)}</div><div class="grow"><div class="t">${esc(c.name)}</div><div class="s">${esc(c.phone || '—')}</div></div><div class="right">${c.due > 0.009 ? `<b class="warn">${money(c.due)}</b><div class="small muted">${t('due')}</div>` : `<span class="badge green">${t('clear')}</span>`}</div></div>`).join('')}</div>` : emptyBox('users', S.customers.size ? t('noResults') : t('noCustomersYet'));
      $$('#cList [data-id]', v).forEach((el) => { el.onclick = () => go('customers/' + el.dataset.id); });
    };
    $('#cSearch', v).oninput = debounce(() => { CV.q = $('#cSearch', v).value; upd(); }, 120);
    const ab = $('#cAdd', v); if (ab) ab.onclick = () => customerModal(null, (id) => go('customers/' + id));
    upd();
    return { update: upd };
  }
};

function customerDetail(v, id) {
  v.innerHTML = `<div id="cdBody"></div>`;
  let started = false;
  const upd = () => {
    const c = S.customers.get(id);
    const body = $('#cdBody', v);
    if (!c) { body.innerHTML = pageHead(t('nav_customers'), `<a class="btn" href="#/customers">${ic('back')}${t('back')}</a>`) + (S.loaded.customers ? emptyBox('users', t('notFound')) : `<div class="center"><div class="spinner dark"></div></div>`); return; }
    if (!started) { started = true; const from = c.createdAt ? ymd(new Date(c.createdAt)) : ymd(); ensureWindow(dateAdd(from, -1)); }
    const d = statementData(c);
    const hist = [...d.rows].reverse();
    body.innerHTML = `<div class="page-h"><div class="row"><a class="btn icon" href="#/customers" aria-label="${t('back')}">${ic('back')}</a><div><h2>${esc(c.name)}</h2><div class="small muted">#${customerSerial(c.id)} · ${esc(c.phone || '—')}${c.address ? ' · ' + esc(c.address) : ''}</div></div></div>
      <div class="row">${can('customers') ? `<button class="btn" id="dEdit">${ic('edit')}${t('edit')}</button>` : ''}</div></div>
      <div class="grid g3">${statTile('cart', t('totalPurchases'), money(d.totalSales))}${statTile('check', t('totalPaid'), money(d.totalPaid))}${statTile('alert', t('remainingDue'), `<span class="${c.due > 0.009 ? 'warn' : 'ok'}">${money(c.due)}</span>`, '', c.due > 0.009 ? '' : '')}</div>
      <div class="row" style="margin:14px 0">${can('customers') ? `<button class="btn primary" id="dCollect" ${c.due > 0.009 ? '' : 'disabled'}>${ic('cash')}${t('collectDue')}</button>` : ''}<button class="btn" id="dStmt">${ic('file')}${t('customerStatement')}</button>${c.phone ? `<a class="btn" href="tel:${esc(c.phone)}">${ic('phone')}${t('call')}</a><button class="btn" id="dSms">${ic('mail')}${t('sendReminder')}</button>` : ''}${can('customers') && can('deleteRecords') ? `<button class="btn ghost" id="dDel" style="color:var(--danger)">${ic('trash')}${t('delete')}</button>` : ''}</div>
      <div class="card"><div class="card-h"><h3>${t('history')}</h3></div>${hist.length ? `<div class="list">${hist.map((e) => e.k === 'sale'
        ? `<div class="li click" data-sale="${e.s.id}"><div class="ico">${ic('receipt')}</div><div class="grow"><div class="t">${esc(e.ref)} · ${money(e.total)}</div><div class="s">${fmtDate(e.date)} ${fmtTime(e.time)} · ${esc(e.desc)}</div></div><div class="right"><div class="small">${t('paid')} ${money(e.paid)}</div>${e.add > 0 ? `<div class="small warn">${t('due')} ${money(e.add)}</div>` : ''}</div></div>`
        : `<div class="li"><div class="ico" style="background:rgba(22,163,74,.13);color:var(--ok)">${ic('cash')}</div><div class="grow"><div class="t ok">+ ${money(e.paid)} · ${t('dueCollection')}</div><div class="s">${fmtDate(e.date)} ${fmtTime(e.time)} · ${esc(e.desc)}</div></div>${can('customers') && can('deleteRecords') ? `<button class="btn icon ghost sm" data-delpay="${e.p.id}">${ic('trash')}</button>` : ''}</div>`).join('')}</div>` : emptyBox('receipt', t('noHistory'))}</div>`;
    const q = (s) => $(s, v);
    if (q('#dEdit')) q('#dEdit').onclick = () => customerModal(c);
    if (q('#dCollect')) q('#dCollect').onclick = () => collectModal(c);
    q('#dStmt').onclick = () => statementModal(c);
    if (q('#dSms')) q('#dSms').onclick = () => { location.href = smsLink(c.phone, t('reminderMsg', c.name, moneyPlain(c.due), (S.shop && S.shop.name) || '')); };
    if (q('#dDel')) q('#dDel').onclick = async () => { if (!(await confirmBox(t('confirmDeleteCustomer', c.name), { danger: true }))) return; try { await deleteCustomer(c); toast(t('deleted'), 'ok'); go('customers'); } catch (e) { toast(errMsg(e), 'err'); } };
    $$('[data-sale]', v).forEach((el) => { el.onclick = () => { const s = S.sales.get(el.dataset.sale); if (s) receiptModal(s); }; });
    $$('[data-delpay]', v).forEach((el) => { el.onclick = async () => { if (!(await confirmBox(t('confirmDeletePayment'), { danger: true }))) return; try { await deletePayment(S.payments.get(el.dataset.delpay)); toast(t('deleted'), 'ok'); } catch (e) { toast(errMsg(e), 'err'); } }; });
  };
  upd();
  return { update: upd };
}

/* ---------------------------------------------------------------------
   Date-range control shared by reports / expenses / P&L
   --------------------------------------------------------------------- */
const newRange = (preset = 'day') => { const [from, to] = periodRange(preset); return { preset, from, to }; };
const rangeHtml = (st) => `<div class="card"><div class="seg" id="rSeg">${['day', 'week', 'month', 'custom'].map((p) => `<button data-p="${p}" class="${st.preset === p ? 'active' : ''}">${t('range_' + p)}</button>`).join('')}</div>
  <div class="two form" style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">${t('from')}<input type="date" id="rFrom" value="${st.from}"></label><label class="f">${t('to')}<input type="date" id="rTo" value="${st.to}"></label></div></div>`;
function bindRange(v, st, apply) {
  const go2 = async () => { if (st.from > st.to) st.to = st.from; await ensureWindow(st.from); apply(); };
  $$('#rSeg button', v).forEach((b) => { b.onclick = () => {
    st.preset = b.dataset.p;
    if (st.preset !== 'custom') [st.from, st.to] = periodRange(st.preset);
    $$('#rSeg button', v).forEach((x) => x.classList.toggle('active', x === b));
    $('#rFrom', v).value = st.from; $('#rTo', v).value = st.to; go2();
  }; });
  const chg = () => { st.preset = 'custom'; st.from = validYmd($('#rFrom', v).value) ? $('#rFrom', v).value : ymd(); st.to = validYmd($('#rTo', v).value) ? $('#rTo', v).value : st.from; $$('#rSeg button', v).forEach((x) => x.classList.toggle('active', x.dataset.p === 'custom')); go2(); };
  $('#rFrom', v).onchange = chg; $('#rTo', v).onchange = chg;
  ensureWindow(st.from).then(apply);
}
const rangeLabelText = (st) => (st.from === st.to ? fmtDate(st.from) : `${fmtDate(st.from)} – ${fmtDate(st.to)}`);
const docTable = (head, rows, foot) => `<table class="st"><thead><tr>${head.map((h, i) => `<th class="${i ? 'r' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? 'r' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>${foot ? `<tfoot><tr>${foot.map((c, i) => `<td class="${i ? 'r' : ''} b">${c}</td>`).join('')}</tr></tfoot>` : ''}</table>`;
const reportDoc = (title, st, inner) => wrapDoc(title, `${shopHeader({ showLogo: true, showAddress: true, showPhone: true })}<div class="hr"></div><div class="c b" style="font-size:1.2em">${esc(title)}</div><div class="c m">${esc(rangeLabelText(st))}</div><div class="hr"></div>${inner}<div class="hr"></div><div class="m c">${t('generatedOn')} ${fmtDate(ymd())} ${fmtTime(nowTime())}</div>`, 'A4');
function reportActions(v, getDoc, getCsv, name) {
  $('#rPrint', v).onclick = () => printHtml(getDoc(), name);
  $('#rCsv', v).onclick = () => downloadText(`${name}-${ymd()}.csv`, 'text/csv', toCSV(getCsv()));
}
const reportBtns = () => `<button class="btn" id="rCsv">${ic('download')}${t('csv')}</button><button class="btn primary" id="rPrint">${ic('printer')}${t('printPdf')}</button>`;

/* ---------------------------------------------------------------------
   ACCOUNTS (cash + mobile financial accounts)
   --------------------------------------------------------------------- */
function accountModal(a) {
  const m = openModal({
    title: a ? t('editAccount') : t('addAccount'),
    body: `<div class="form"><label class="f">${t('accountName')} *<input id="aName" maxlength="60" value="${esc(a ? acctLabel(a) : '')}"></label>
      <label class="f">${t('accountType')}<select id="aType" ${a ? 'disabled' : ''}>${ACCOUNT_TYPES.map((ty) => `<option value="${ty}" ${a && a.type === ty ? 'selected' : ''}>${t('acct_' + ty)}</option>`).join('')}</select></label>
      <label class="f">${t('accountNumber')}<input id="aNum" inputmode="tel" maxlength="30" value="${esc(a ? a.number : '')}"></label>
      ${a ? `<div class="switch"><span>${t('active')}</span><input type="checkbox" id="aAct" ${a.active !== false ? 'checked' : ''}></div>` : `<label class="f">${t('openingBalance')} (৳)<input id="aOpen" inputmode="decimal" placeholder="0"></label>`}</div>`,
    footer: [{ label: t('cancel') }, { label: t('save'), cls: 'primary', icon: 'check', onClick: async (c) => {
      const r = c.el;
      await saveAccount({ name: $('#aName', r).value, type: $('#aType', r).value, number: $('#aNum', r).value, active: a ? $('#aAct', r).checked : true, opening: a ? 0 : optNum(r, '#aOpen') }, a);
      toast(t('saved'), 'ok');
    } }]
  });
  const typeSel = $('#aType', m.el);
  if (!a) typeSel.onchange = () => { const nm = $('#aName', m.el); if (!nm.value.trim() || ACCOUNT_TYPES.some((ty) => t('acct_' + ty) === nm.value)) nm.value = t('acct_' + typeSel.value); };
  if (!a) typeSel.onchange();
  return m;
}
function txModal(type, accountId) {
  const isTransfer = type === 'transfer';
  const accs = activeAccounts();
  if (!accs.length) { toast(t('noAccounts'), 'err'); return; }
  const first = accountId || defaultAccountId();
  const second = (accs.find((a) => a.id !== first) || {}).id;
  const m = openModal({
    title: t('tx_' + type),
    body: `<div class="form">${isTransfer
      ? `<div class="two"><label class="f">${t('fromAccount')}<select id="xFrom">${acctOptions(first)}</select></label><label class="f">${t('toAccount')}<select id="xTo">${acctOptions(second)}</select></label></div>`
      : `<label class="f">${t('account')}<select id="xAcc">${acctOptions(first)}</select></label>`}
      ${type === 'adjustment' ? `<label class="f">${t('direction')}<select id="xSign"><option value="1">+ ${t('increase')}</option><option value="-1">− ${t('decrease')}</option></select></label>` : ''}
      <div class="two"><label class="f">${t('amount')} (৳)<input id="xAmt" inputmode="decimal"></label>${isTransfer ? `<label class="f">${t('fee')} (৳)<input id="xFee" inputmode="decimal" placeholder="0"></label>` : `<label class="f">${t('date')}<input type="date" id="xDate" value="${ymd()}"></label>`}</div>
      ${isTransfer ? `<label class="f">${t('date')}<input type="date" id="xDate" value="${ymd()}"></label>` : ''}
      <label class="f">${t('description')}<input id="xDesc" maxlength="200" placeholder="${t('optional')}"></label>
      ${isTransfer ? `<div class="small muted">${t('transferNote')}</div>` : ''}</div>`,
    footer: [{ label: t('cancel') }, { label: t('save'), cls: 'primary', icon: 'check', onClick: async (c) => {
      const r = c.el, amount = numVal(r, '#xAmt');
      if (isTransfer) await transferTx({ from: $('#xFrom', r).value, to: $('#xTo', r).value, amount, fee: optNum(r, '#xFee'), date: $('#xDate', r).value, desc: $('#xDesc', r).value });
      else await manualTx({ type, accountId: $('#xAcc', r).value, amount, date: $('#xDate', r).value, desc: $('#xDesc', r).value, sign: type === 'adjustment' ? +$('#xSign', r).value : 1 });
      toast(t('saved'), 'ok');
    } }]
  });
  return m;
}
const TX_ICON = { sale: 'cart', due_collection: 'cash', deposit: 'download', withdraw: 'upload', transfer_in: 'swap', transfer_out: 'swap', charge: 'tag', adjustment: 'sliders', expense: 'receipt', purchase: 'box', opening: 'wallet' };
const txRow = (x, { showAcct = true, balance = null, canDel = false } = {}) => `<div class="li"><div class="ico" style="${x.delta < 0 ? 'background:rgba(220,38,38,.1);color:var(--danger)' : ''}">${ic(TX_ICON[x.type] || 'list')}</div><div class="grow"><div class="t">${t('tx_' + x.type)}${showAcct ? ' · ' + esc(accLabelById(x.accountId)) : ''}</div><div class="s">${fmtDateShort(x.date)} ${fmtTime(x.time)} · ${esc(x.desc || '')}</div></div><div class="right"><b class="${x.delta < 0 ? 'bad' : 'ok'}">${x.delta < 0 ? '−' : '+'}${money(Math.abs(x.delta))}</b>${balance !== null ? `<div class="small muted">${money(balance)}</div>` : ''}</div>${canDel && !isSystemTx(x) && x.type !== 'opening' ? `<button class="btn icon ghost sm" data-deltx="${x.id}">${ic('trash')}</button>` : ''}</div>`;
const bindTxDelete = (root) => $$('[data-deltx]', root).forEach((b) => { b.onclick = async () => { const x = S.tx.get(b.dataset.deltx); if (!x) return; if (!(await confirmBox(t(x.groupId ? 'confirmDeleteTransfer' : 'confirmDeleteTx'), { danger: true }))) return; try { await deleteTx(x); toast(t('deleted'), 'ok'); } catch (e) { toast(errMsg(e), 'err'); } }; });
const txActionsHtml = () => ['deposit', 'withdraw', 'transfer', 'charge', 'adjustment'].map((ty) => `<button class="btn sm" data-tx="${ty}">${ic(ty === 'deposit' ? 'download' : ty === 'withdraw' ? 'upload' : ty === 'transfer' ? 'swap' : ty === 'charge' ? 'tag' : 'sliders')}${t('tx_' + ty)}</button>`).join('');

ROUTES.accounts = {
  perm: () => can('finance'),
  render(v, param) {
    if (param) return accountLedger(v, param);
    v.innerHTML = pageHead(t('nav_accounts'), `<button class="btn primary" id="aAdd">${ic('plus')}${t('addAccount')}</button>`) + `<div class="stack"><div id="aTop"></div><div class="row" id="aActs">${txActionsHtml()}</div><div id="aList" class="stack"></div></div>`;
    const upd = () => {
      const accs = activeAccounts(), inactive = arr(S.accounts).filter((a) => a.active === false);
      const total = sum(accs, (a) => balanceOf(a.id));
      $('#aTop', v).innerHTML = `<div class="grid g3">${statTile('wallet', t('totalBalance'), money(total), '', 'hero')}${statTile('cash', t('cashInHand'), money(sum(accs.filter((a) => a.type === 'cash'), (a) => balanceOf(a.id))))}${statTile('phone', t('mobileBanking'), money(sum(accs.filter(isMobileAcc), (a) => balanceOf(a.id))))}</div>`;
      const row = (a) => `<div class="li click" data-id="${a.id}"><div class="ico">${ic(a.type === 'cash' ? 'cash' : isMobileAcc(a) ? 'phone' : 'card')}</div><div class="grow"><div class="t">${esc(acctLabel(a))}</div><div class="s">${t('acct_' + a.type)}${a.number ? ' · ' + esc(a.number) : ''}</div></div><b class="${balanceOf(a.id) < 0 ? 'bad' : ''}">${money(balanceOf(a.id))}</b>${ic('chevron')}</div>`;
      const groups = [[t('cashInHand'), accs.filter((a) => a.type === 'cash')], [t('mobileBanking'), accs.filter(isMobileAcc)], [t('otherAccounts'), accs.filter((a) => ['bank', 'other'].includes(a.type))]];
      $('#aList', v).innerHTML = groups.filter((g) => g[1].length).map((g) => `<div class="card"><div class="card-h"><h3>${g[0]}</h3><b>${money(sum(g[1], (a) => balanceOf(a.id)))}</b></div><div class="list">${g[1].map(row).join('')}</div></div>`).join('') +
        (inactive.length ? `<div class="card"><div class="card-h"><h3>${t('inactive')}</h3></div><div class="list">${inactive.map(row).join('')}</div></div>` : '');
      $$('#aList [data-id]', v).forEach((el) => { el.onclick = () => go('accounts/' + el.dataset.id); });
    };
    $('#aAdd', v).onclick = () => accountModal(null);
    $$('#aActs [data-tx]', v).forEach((b) => { b.onclick = () => txModal(b.dataset.tx); });
    upd();
    return { update: upd };
  }
};
function accountLedger(v, id) {
  v.innerHTML = '<div id="lBody"></div>';
  let loadedFrom = S.windowStart;
  const upd = () => {
    const a = S.accounts.get(id), body = $('#lBody', v);
    if (!a) { body.innerHTML = pageHead(t('nav_accounts'), `<a class="btn" href="#/accounts">${ic('back')}${t('back')}</a>`) + emptyBox('wallet', t('notFound')); return; }
    const txs = arr(S.tx).filter((x) => x.accountId === id).sort((x, y) => (y.date + (y.time || '')).localeCompare(x.date + (x.time || '')) || (y.createdAt || 0) - (x.createdAt || 0));
    let run = balanceOf(id);
    const rows = txs.map((x) => { const b = run; run = r2(run - x.delta); return { x, b }; });
    body.innerHTML = `<div class="page-h"><div class="row"><a class="btn icon" href="#/accounts">${ic('back')}</a><div><h2>${esc(acctLabel(a))}</h2><div class="small muted">${t('acct_' + a.type)}${a.number ? ' · ' + esc(a.number) : ''}</div></div></div><button class="btn" id="lEdit">${ic('edit')}${t('edit')}</button></div>
      ${statTile('wallet', t('currentBalance'), money(balanceOf(id)), '', 'hero')}<div class="row" style="margin:14px 0" id="lActs">${txActionsHtml()}</div>
      <div class="card"><div class="card-h"><h3>${t('ledger')}</h3><span class="small muted">${t('showingFrom', fmtDate(S.windowStart))}</span></div>${rows.length ? `<div class="list">${rows.map((r) => txRow(r.x, { showAcct: false, balance: r.b, canDel: true })).join('')}</div>` : emptyBox('list', t('noTransactions'))}<button class="btn block" id="lMore" style="margin-top:10px">${t('loadOlder')}</button></div>`;
    $('#lEdit', v).onclick = () => accountModal(a);
    $$('#lActs [data-tx]', v).forEach((b) => { b.onclick = () => txModal(b.dataset.tx, id); });
    $('#lMore', v).onclick = async (e) => { e.target.disabled = true; await ensureWindow(dateAdd(S.windowStart, -90)); upd(); };
    bindTxDelete(v);
  };
  upd();
  return { update: upd };
}

/* ---------------------------------------------------------------------
   DAILY / PERIOD TRANSACTION REPORT
   --------------------------------------------------------------------- */
const IN_TYPES = ['sale', 'due_collection', 'deposit', 'opening'];
const OUT_TYPES = ['expense', 'purchase', 'withdraw'];
function reportData(st) {
  const all = arr(S.tx);
  const txs = all.filter((x) => inR(x.date, st.from, st.to)).sort((x, y) => (x.date + (x.time || '')).localeCompare(y.date + (y.time || '')) || (x.createdAt || 0) - (y.createdAt || 0));
  const accs = arr(S.accounts).sort((x, y) => (x.order ?? 99) - (y.order ?? 99));
  const perAcc = accs.map((a) => {
    const mine = txs.filter((x) => x.accountId === a.id);
    const after = sum(all.filter((x) => x.accountId === a.id && x.date > st.to), (x) => x.delta);
    const closing = r2(balanceOf(a.id) - after);
    const sgn = (x) => (['transfer_in', 'transfer_out'].includes(x.type) ? 0 : x.delta);
    const inn = sum(mine.filter((x) => sgn(x) > 0), sgn), out = -sum(mine.filter((x) => sgn(x) < 0), sgn);
    const tr = sum(mine.filter((x) => ['transfer_in', 'transfer_out'].includes(x.type)), (x) => x.delta);
    return { a, inn: r2(inn), out: r2(out), tr: r2(tr), closing, opening: r2(closing - (inn - out + tr)), n: mine.length };
  }).filter((r) => r.a.active !== false || r.n || Math.abs(r.closing) > 0.009);
  const isCash = (x) => (S.accounts.get(x.accountId) || {}).type === 'cash';
  const isMob = (x) => { const a = S.accounts.get(x.accountId); return a && isMobileAcc(a); };
  const real = txs.filter((x) => !['transfer_in', 'transfer_out'].includes(x.type));
  const pos = (f) => sum(real.filter((x) => f(x) && x.delta > 0), (x) => x.delta), neg = (f) => -sum(real.filter((x) => f(x) && x.delta < 0), (x) => x.delta);
  const summary = {
    cashIn: pos(isCash), cashOut: neg(isCash), mobIn: pos(isMob), mobOut: neg(isMob),
    transfers: sum(txs.filter((x) => x.type === 'transfer_out'), (x) => x.amount),
    fees: sum(txs.filter((x) => x.type === 'charge'), (x) => x.amount),
    expenses: sum(txs.filter((x) => x.type === 'expense'), (x) => x.amount)
  };
  const byType = {};
  txs.forEach((x) => { const e = byType[x.type] || (byType[x.type] = { n: 0, amount: 0 }); e.n++; e.amount = r2(e.amount + x.amount); });
  return { txs, perAcc, summary, byType };
}
ROUTES.reports = {
  perm: () => can('finance'),
  render(v) {
    const st = ROUTES.reports.st || (ROUTES.reports.st = newRange('day'));
    v.innerHTML = pageHead(t('nav_reports'), reportBtns()) + `<div class="stack">${rangeHtml(st)}<div id="rBody" class="stack"></div></div>`;
    const upd = () => {
      const d = reportData(st), s = d.summary;
      const tiles = [['cash', t('cashReceived'), s.cashIn], ['upload', t('cashPaid'), s.cashOut], ['phone', t('mobileReceived'), s.mobIn], ['phone', t('mobilePaid'), s.mobOut], ['swap', t('transfersTotal'), s.transfers], ['tag', t('feesCharges'), s.fees], ['receipt', t('expenses'), s.expenses]];
      $('#rBody', v).innerHTML = `<div class="grid g4">${tiles.map((x) => statTile(x[0], x[1], money(x[2]))).join('')}</div>
        <div class="card"><div class="card-h"><h3>${t('closingBalances')}</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('account')}</th><th class="r">${t('opening')}</th><th class="r">${t('received')}</th><th class="r">${t('paidOut')}</th><th class="r">${t('transfersNet')}</th><th class="r">${t('closing')}</th></tr></thead><tbody>${d.perAcc.map((r) => `<tr><td>${esc(acctLabel(r.a))}</td><td class="r">${money(r.opening)}</td><td class="r ok">${money(r.inn)}</td><td class="r bad">${money(r.out)}</td><td class="r">${money(r.tr)}</td><td class="r bold">${money(r.closing)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>${t('total')}</td><td class="r">${money(sum(d.perAcc, (r) => r.opening))}</td><td class="r">${money(sum(d.perAcc, (r) => r.inn))}</td><td class="r">${money(sum(d.perAcc, (r) => r.out))}</td><td class="r">${money(sum(d.perAcc, (r) => r.tr))}</td><td class="r">${money(sum(d.perAcc, (r) => r.closing))}</td></tr></tfoot></table></div><div class="small muted" style="margin-top:6px">${t('transferNoDouble')}</div></div>
        <div class="card"><div class="card-h"><h3>${t('byType')}</h3></div><div class="list">${Object.keys(d.byType).map((k) => `<div class="li"><div class="ico">${ic(TX_ICON[k] || 'list')}</div><div class="grow"><div class="t">${t('tx_' + k)}</div><div class="s">${d.byType[k].n} ${t('entries')}</div></div><b>${money(d.byType[k].amount)}</b></div>`).join('') || emptyBox('list', t('noTransactions'))}</div></div>
        <div class="card"><div class="card-h"><h3>${t('transactions')} (${d.txs.length})</h3></div>${d.txs.length ? `<div class="list">${d.txs.slice().reverse().slice(0, 400).map((x) => txRow(x, { canDel: true })).join('')}</div>` : emptyBox('list', t('noTransactions'))}</div>`;
      bindTxDelete(v);
    };
    const doc = () => { const d = reportData(st), s = d.summary;
      return reportDoc(t('nav_reports'), st, docTable([t('item'), t('amount')], [[t('cashReceived'), money(s.cashIn)], [t('cashPaid'), money(s.cashOut)], [t('mobileReceived'), money(s.mobIn)], [t('mobilePaid'), money(s.mobOut)], [t('transfersTotal'), money(s.transfers)], [t('feesCharges'), money(s.fees)], [t('expenses'), money(s.expenses)]]) + '<br>' +
        docTable([t('account'), t('opening'), t('received'), t('paidOut'), t('transfersNet'), t('closing')], d.perAcc.map((r) => [esc(acctLabel(r.a)), fmtNum(r.opening), fmtNum(r.inn), fmtNum(r.out), fmtNum(r.tr), fmtNum(r.closing)]), [t('total'), fmtNum(sum(d.perAcc, (r) => r.opening)), fmtNum(sum(d.perAcc, (r) => r.inn)), fmtNum(sum(d.perAcc, (r) => r.out)), fmtNum(sum(d.perAcc, (r) => r.tr)), fmtNum(sum(d.perAcc, (r) => r.closing))]) + '<br>' +
        docTable([t('date'), t('account'), t('type'), t('description'), t('amount')], d.txs.map((x) => [fmtDateShort(x.date) + ' ' + fmtTime(x.time), esc(accLabelById(x.accountId)), t('tx_' + x.type), esc(x.desc || ''), (x.delta < 0 ? '-' : '+') + fmtNum(Math.abs(x.delta))]))); };
    const csv = () => { const d = reportData(st), s = d.summary;
      return [[t('nav_reports'), rangeLabelText(st)], [], [t('cashReceived'), s.cashIn], [t('cashPaid'), s.cashOut], [t('mobileReceived'), s.mobIn], [t('mobilePaid'), s.mobOut], [t('transfersTotal'), s.transfers], [t('feesCharges'), s.fees], [t('expenses'), s.expenses], [],
        [t('account'), t('opening'), t('received'), t('paidOut'), t('transfersNet'), t('closing')], ...d.perAcc.map((r) => [acctLabel(r.a), r.opening, r.inn, r.out, r.tr, r.closing]), [],
        [t('date'), t('time'), t('account'), t('type'), t('description'), t('amount')], ...d.txs.map((x) => [x.date, x.time, acctLabel(S.accounts.get(x.accountId) || { name: '' }), t('tx_' + x.type), x.desc, x.delta])]; };
    bindRange(v, st, upd);
    reportActions(v, doc, csv, 'transaction-report');
    return { update: upd };
  }
};

/* ---------------------------------------------------------------------
   EXPENSES
   --------------------------------------------------------------------- */
function expenseModal(e) {
  const m = openModal({
    title: e ? t('editExpense') : t('addExpense'),
    body: `<div class="form"><label class="f">${t('category')}<select id="eCat">${EXPENSE_CATS.map((c) => `<option value="${c}" ${e && e.category === c ? 'selected' : ''}>${t('cat_' + c)}</option>`).join('')}${e && !EXPENSE_CATS.includes(e.category) ? `<option selected value="${esc(e.category)}">${esc(e.category)}</option>` : ''}</select></label>
      <div class="two"><label class="f">${t('amount')} (৳) *<input id="eAmt" inputmode="decimal" value="${e ? e.amount : ''}"></label><label class="f">${t('date')}<input type="date" id="eDate" value="${e ? e.date : ymd()}"></label></div>
      <label class="f">${t('paymentMethod')}<select id="eAcc">${acctOptions(e ? e.accountId : defaultAccountId())}</select></label>
      <label class="f">${t('note')}<input id="eNote" maxlength="200" value="${esc(e ? e.note : '')}"></label></div>`,
    footer: [
      ...(e && can('deleteRecords') ? [{ label: t('delete'), cls: 'danger', icon: 'trash', onClick: async () => { if (!(await confirmBox(t('confirmDeleteExpense'), { danger: true }))) return false; await deleteExpense(e); toast(t('deleted'), 'ok'); } }] : []),
      { label: t('cancel') },
      { label: t('save'), cls: 'primary', icon: 'check', onClick: async (c) => { const r = c.el; await saveExpense({ category: $('#eCat', r).value, amount: numVal(r, '#eAmt'), date: $('#eDate', r).value, accountId: $('#eAcc', r).value, note: $('#eNote', r).value }, e); toast(t('saved'), 'ok'); } }
    ]
  });
  return m;
}
ROUTES.expenses = {
  perm: () => can('expenses'),
  render(v) {
    const st = ROUTES.expenses.st || (ROUTES.expenses.st = newRange('month'));
    v.innerHTML = pageHead(t('nav_expenses'), `<button class="btn" id="rCsv">${ic('download')}${t('csv')}</button><button class="btn" id="rPrint">${ic('printer')}${t('print')}</button><button class="btn primary" id="eAdd">${ic('plus')}${t('addExpense')}</button>`) + `<div class="stack">${rangeHtml(st)}<div id="eBody" class="stack"></div></div>`;
    const data = () => { const list = expensesIn(st.from, st.to).sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))); const total = sum(list, (x) => x.amount); const cats = {}; list.forEach((x) => { cats[x.category] = r2((cats[x.category] || 0) + x.amount); }); return { list, total, cats }; };
    const upd = () => {
      const { list, total, cats } = data(), s = can('profit') ? statsFor(st.from, st.to) : null;
      const catKeys = Object.keys(cats).sort((a, b) => cats[b] - cats[a]);
      $('#eBody', v).innerHTML = `<div class="grid g3">${statTile('receipt', t('totalExpenses'), money(total), t('nEntries', list.length), 'hero')}${s ? statTile('trend', t('grossProfit'), money(s.profit)) + statTile('check', t('netProfit'), `<span class="${s.profit - total < 0 ? 'bad' : 'ok'}">${money(s.profit - total)}</span>`, t('profitMinusExpenses')) : ''}</div>
        ${catKeys.length ? `<div class="card"><div class="card-h"><h3>${t('byCategory')}</h3></div>${catKeys.map((k) => `<div style="margin-bottom:10px"><div class="row between small"><span>${esc(expLabel(k))}</span><b>${money(cats[k])}</b></div><div class="hbar"><i style="width:${cats[k] / total * 100}%"></i></div></div>`).join('')}</div>` : ''}
        <div class="card">${list.length ? `<div class="list">${list.map((x) => `<div class="li click" data-id="${x.id}"><div class="ico">${ic('receipt')}</div><div class="grow"><div class="t">${esc(expLabel(x.category))}</div><div class="s">${fmtDate(x.date)} · ${esc(accLabelById(x.accountId))}${x.note ? ' · ' + esc(x.note) : ''}</div></div><b>${money(x.amount)}</b></div>`).join('')}</div>` : emptyBox('receipt', t('noExpenses'))}</div>`;
      $$('#eBody [data-id]', v).forEach((el) => { el.onclick = () => expenseModal(S.expenses.get(el.dataset.id)); });
    };
    $('#eAdd', v).onclick = () => expenseModal(null);
    bindRange(v, st, upd);
    reportActions(v, () => { const { list, total } = data(); return reportDoc(t('nav_expenses'), st, docTable([t('date'), t('category'), t('paymentMethod'), t('note'), t('amount')], list.map((x) => [fmtDateShort(x.date), esc(expLabel(x.category)), esc(accLabelById(x.accountId)), esc(x.note || ''), fmtNum(x.amount)]), [t('total'), '', '', '', fmtNum(total)])); },
      () => { const { list } = data(); return [[t('date'), t('category'), t('paymentMethod'), t('note'), t('amount')], ...list.map((x) => [x.date, expLabel(x.category), accLabelById(x.accountId), x.note, x.amount])]; }, 'expenses');
    return { update: upd };
  }
};

/* ---------------------------------------------------------------------
   PROFIT & LOSS  (uses the actual price each item was sold for)
   --------------------------------------------------------------------- */
let pnlGroup = 'day';
const groupKey = (d, g) => (g === 'month' ? d.slice(0, 7) : g === 'week' ? weekStart(d) : d);
const groupLabel = (k, g) => (g === 'month' ? parseYmd(k + '-01').toLocaleDateString(loc(), { month: 'long', year: 'numeric' }) : g === 'week' ? `${fmtDateShort(k)} – ${fmtDateShort(dateAdd(k, 6))}` : fmtDate(k));
function pnlData(st) {
  const sales = salesIn(st.from, st.to), exps = expensesIn(st.from, st.to);
  const rows = {};
  const get = (d) => { const k = groupKey(d, pnlGroup); return rows[k] || (rows[k] = { k, sales: 0, cost: 0, profit: 0, expenses: 0, discount: 0, n: 0, missing: 0 }); };
  sales.forEach((s) => { const r = get(s.date), c = S.saleCosts.get(s.id); r.sales += s.total; r.discount += s.discount; r.n++; if (c) { r.cost += c.cost; r.profit += c.profit; } else r.missing++; });
  exps.forEach((e) => { get(e.date).expenses += e.amount; });
  const list = Object.values(rows).sort((a, b) => b.k.localeCompare(a.k));
  const tot = list.reduce((a, r) => ({ sales: a.sales + r.sales, cost: a.cost + r.cost, profit: a.profit + r.profit, expenses: a.expenses + r.expenses, discount: a.discount + r.discount, n: a.n + r.n, missing: a.missing + r.missing }), { sales: 0, cost: 0, profit: 0, expenses: 0, discount: 0, n: 0, missing: 0 });
  return { list, tot };
}
ROUTES.pnl = {
  perm: () => can('profit'),
  render(v) {
    const st = ROUTES.pnl.st || (ROUTES.pnl.st = newRange('month'));
    v.innerHTML = pageHead(t('nav_pnl'), reportBtns()) + `<div class="stack">${rangeHtml(st)}<div class="seg" id="gSeg">${['day', 'week', 'month'].map((g) => `<button data-g="${g}" class="${pnlGroup === g ? 'active' : ''}">${t('group_' + g)}</button>`).join('')}</div><div id="pBody" class="stack"></div></div>`;
    const upd = () => {
      const { list, tot } = pnlData(st), net = tot.profit - tot.expenses;
      $('#pBody', v).innerHTML = `<div class="grid g4">${statTile('cart', t('revenue'), money(tot.sales), t('nInvoices', tot.n))}${statTile('box', t('costOfGoods'), money(tot.cost))}${statTile('trend', t('grossProfit'), `<span class="${tot.profit < 0 ? 'bad' : 'ok'}">${money(tot.profit)}</span>`, tot.sales ? t('margin', fmtNum(tot.profit / tot.sales * 100, 1)) : '')}${statTile('receipt', t('expenses'), money(tot.expenses))}</div>
        <div class="stat hero"><span class="lbl">${t('netProfit')}</span><div class="val">${money(net)}</div><div class="sub">${t('grossProfit')} − ${t('expenses')}${tot.discount ? ' · ' + t('discountsGiven') + ': ' + money(tot.discount) : ''}</div></div>
        ${tot.missing ? `<div class="alert">${ic('alert')}<div>${t('costPending', tot.missing)}</div></div>` : ''}
        <div class="alert info">${ic('info')}<div>${t('pnlNote')}</div></div>
        <div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('period')}</th><th class="r">${t('sales')}</th><th class="r">${t('cost')}</th><th class="r">${t('grossProfit')}</th><th class="r">${t('expenses')}</th><th class="r">${t('netProfit')}</th></tr></thead><tbody>${list.map((r) => `<tr><td>${groupLabel(r.k, pnlGroup)}</td><td class="r">${fmtNum(r.sales)}</td><td class="r">${fmtNum(r.cost)}</td><td class="r ${r.profit < 0 ? 'bad' : 'ok'}">${fmtNum(r.profit)}</td><td class="r">${fmtNum(r.expenses)}</td><td class="r bold ${r.profit - r.expenses < 0 ? 'bad' : ''}">${fmtNum(r.profit - r.expenses)}</td></tr>`).join('') || `<tr><td colspan="6">${emptyBox('trend', t('noData'))}</td></tr>`}</tbody><tfoot><tr><td>${t('total')}</td><td class="r">${fmtNum(tot.sales)}</td><td class="r">${fmtNum(tot.cost)}</td><td class="r">${fmtNum(tot.profit)}</td><td class="r">${fmtNum(tot.expenses)}</td><td class="r">${fmtNum(net)}</td></tr></tfoot></table></div></div>`;
    };
    $$('#gSeg button', v).forEach((b) => { b.onclick = () => { pnlGroup = b.dataset.g; $$('#gSeg button', v).forEach((x) => x.classList.toggle('active', x === b)); upd(); }; });
    bindRange(v, st, upd);
    const head = () => [t('period'), t('sales'), t('cost'), t('grossProfit'), t('expenses'), t('netProfit')];
    reportActions(v, () => { const { list, tot } = pnlData(st); return reportDoc(t('nav_pnl'), st, docTable(head(), list.map((r) => [groupLabel(r.k, pnlGroup), fmtNum(r.sales), fmtNum(r.cost), fmtNum(r.profit), fmtNum(r.expenses), fmtNum(r.profit - r.expenses)]), [t('total'), fmtNum(tot.sales), fmtNum(tot.cost), fmtNum(tot.profit), fmtNum(tot.expenses), fmtNum(tot.profit - tot.expenses)])); },
      () => { const { list, tot } = pnlData(st); return [head(), ...list.map((r) => [groupLabel(r.k, pnlGroup), r.sales, r.cost, r.profit, r.expenses, r.profit - r.expenses]), [t('total'), tot.sales, tot.cost, tot.profit, tot.expenses, tot.profit - tot.expenses]]; }, 'profit-loss');
    return { update: upd };
  }
};

/* ---------------------------------------------------------------------
   Admin write operations: members, invites, shop, branding, backup
   --------------------------------------------------------------------- */
async function sendInvite(f) {
  const email = String(f.email || '').trim().toLowerCase();
  if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email)) fail('errEmail');
  if (!['manager', 'employee'].includes(f.role)) fail('errRole');
  if (arr(S.members).some((m) => lc(m.email) === email)) fail('errAlreadyMember');
  const perms = Object.fromEntries(PERM_KEYS.map((k) => [k, !!f.perms[k]]));
  const b = wb();
  b.set(FB.doc(FB.db, 'invites', email), { email, shopId: S.shopId, shopName: S.shop.name, role: f.role, perms, invitedBy: S.user.uid, createdAt: nowMs() });
  await commitBatch(b);
}
async function revokeInvite(email) { const b = wb(); b.delete(FB.doc(FB.db, 'invites', email)); await commitBatch(b); }
async function saveMember(uid, role, perms) {
  const b = wb();
  b.update(dref('members', uid), { role, perms: Object.fromEntries(PERM_KEYS.map((k) => [k, !!perms[k]])) });
  await commitBatch(b);
}
async function removeMember(uid) { const b = wb(); b.delete(dref('members', uid)); b.delete(FB.doc(FB.db, 'userShops', uid)); await commitBatch(b); }
async function saveShop(patch) {
  const data = { updatedAt: nowMs() };
  if (patch.name !== undefined) data.name = String(patch.name).trim().slice(0, 80) || S.shop.name;
  if (patch.settings) data.settings = { ...shopSettings(), ...patch.settings, receipt: { ...shopSettings().receipt, ...(patch.settings.receipt || {}) } };
  const b = wb(); b.update(FB.doc(FB.db, 'shops', S.shopId), data); await commitBatch(b);
}
async function saveBranding(patch) { const b = wb(); b.set(dref('meta', 'branding'), { ...patch, updatedAt: nowMs() }, { merge: true }); await commitBatch(b); }
function resizeImage(file, maxDim, mime, quality) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error(t('errImage')));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      const ctx = c.getContext('2d');
      if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      const out = c.toDataURL(mime, quality);
      if (out.length > 700000) reject(new Error(t('errImageBig'))); else resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t('errImage'))); };
    img.src = url;
  });
}
async function chunked(items, fn) {
  for (let i = 0; i < items.length; i += 400) {
    const b = FB.writeBatch(FB.db);
    items.slice(i, i + 400).forEach((it) => fn(b, it));
    await b.commit();
  }
}
async function exportBackup() {
  const out = { app: 'AMAR DOKAN PRO', version: 1, exportedAt: new Date().toISOString(), shopId: S.shopId, shopName: S.shop.name, settings: S.shop.settings || {}, collections: {}, skipped: [] };
  for (const name of RESTORE_COLLECTIONS) {
    try { const snap = await FB.getDocs(col(name)); out.collections[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() })); }
    catch (e) { out.skipped.push(name); }
  }
  return out;
}
async function restoreBackup(json, wipe) {
  if (!isOwner()) fail('errOwnerOnly');
  if (!json || json.app !== 'AMAR DOKAN PRO' || typeof json.collections !== 'object') fail('errBackupFile');
  const plan = [];
  for (const name of RESTORE_COLLECTIONS) {
    const list = json.collections[name];
    if (!list) continue;
    if (!Array.isArray(list)) fail('errBackupFile');
    list.forEach((d) => {
      if (!d || typeof d.id !== 'string' || !d.id || d.id.includes('/')) fail('errBackupFile');
      const { id, ...data } = d; plan.push({ name, id, data });
    });
  }
  if (wipe) for (const name of RESTORE_COLLECTIONS) { const snap = await FB.getDocs(col(name)); await chunked(snap.docs, (b, d) => b.delete(d.ref)); }
  await chunked(plan, (b, it) => b.set(dref(it.name, it.id), it.data));
  return plan.length;
}
// Recompute stored running totals from the full ledger (repair tools for the owner)
async function recalcBalances() {
  const snap = await FB.getDocs(col('transactions')), totals = {};
  S.accounts.forEach((a) => { totals[a.id] = 0; });
  snap.docs.forEach((d) => { const x = d.data(); totals[x.accountId] = r2((totals[x.accountId] || 0) + x.delta); });
  const ids = Object.keys(totals);
  await chunked(ids, (b, id) => b.set(dref('accountBalances', id), { balance: r2(totals[id]), updatedAt: nowMs() }));
  return ids.length;
}

/* ---------------------------------------------------------------------
   USERS & PERMISSIONS (owner)
   --------------------------------------------------------------------- */
const SENSITIVE = ['viewCost', 'profit', 'finance'];
const permEditor = (perms) => `<div class="card" style="padding:10px 14px">${PERM_KEYS.map((k) => `<div class="switch"><div><div class="bold">${t('perm_' + k)}${SENSITIVE.includes(k) ? ` <span class="badge amber">${t('sensitive')}</span>` : ''}</div><div class="small muted">${t('permd_' + k)}</div></div><input type="checkbox" data-perm="${k}" ${perms[k] ? 'checked' : ''}></div>`).join('')}</div>`;
const readPerms = (root) => Object.fromEntries($$('[data-perm]', root).map((i) => [i.dataset.perm, i.checked]));
function inviteModal() {
  let role = 'employee';
  const m = openModal({
    title: t('inviteUser'), wide: true,
    body: `<div class="form"><label class="f">${t('googleEmail')} *<input id="iEmail" type="email" inputmode="email" autocapitalize="off" placeholder="name@gmail.com"></label>
      <label class="f">${t('role')}<select id="iRole"><option value="employee">${t('role_employee')}</option><option value="manager">${t('role_manager')}</option></select></label>
      <div class="small muted">${t('inviteHow')}</div><div id="iPerms">${permEditor(PERM_PRESETS.employee)}</div></div>`,
    footer: [{ label: t('cancel') }, { label: t('sendInvite'), cls: 'primary', icon: 'mail', onClick: async (c) => { await sendInvite({ email: $('#iEmail', c.el).value, role: $('#iRole', c.el).value, perms: readPerms(c.el) }); toast(t('inviteSaved'), 'ok'); } }]
  });
  $('#iRole', m.el).onchange = (e) => { role = e.target.value; $('#iPerms', m.el).innerHTML = permEditor(PERM_PRESETS[role]); };
}
function memberModal(mem) {
  const owner = mem.role === 'owner';
  const m = openModal({
    title: mem.name || mem.email, wide: true,
    body: `<div class="form"><div class="small muted">${esc(mem.email)}</div>${owner ? `<div class="alert info">${ic('info')}<div>${t('ownerAllPerms')}</div></div>` : `<label class="f">${t('role')}<select id="mRole"><option value="employee" ${mem.role === 'employee' ? 'selected' : ''}>${t('role_employee')}</option><option value="manager" ${mem.role === 'manager' ? 'selected' : ''}>${t('role_manager')}</option></select></label>
      <div><button class="btn sm soft" id="mPreset">${t('applyRoleDefaults')}</button></div><div id="mPerms">${permEditor(mem.perms || {})}</div>`}</div>`,
    footer: owner ? [{ label: t('close') }] : [
      { label: t('removeUser'), cls: 'danger', icon: 'trash', onClick: async () => { if (!(await confirmBox(t('confirmRemoveUser', mem.email), { danger: true }))) return false; await removeMember(mem.id); toast(t('deleted'), 'ok'); } },
      { label: t('save'), cls: 'primary', icon: 'check', onClick: async (c) => { await saveMember(mem.id, $('#mRole', c.el).value, readPerms(c.el)); toast(t('saved'), 'ok'); } }]
  });
  if (!owner) $('#mPreset', m.el).onclick = () => { $('#mPerms', m.el).innerHTML = permEditor(PERM_PRESETS[$('#mRole', m.el).value]); };
}
ROUTES.users = {
  perm: () => isOwner(),
  render(v) {
    v.innerHTML = pageHead(t('nav_users'), `<button class="btn primary" id="uInv">${ic('plus')}${t('inviteUser')}</button>`) + `<div class="stack"><div class="alert info">${ic('shield')}<div>${t('rulesNote')}</div></div><div class="card" id="uMem"></div><div class="card" id="uInvs"></div></div>`;
    const upd = () => {
      const mem = arr(S.members).sort((a, b) => (a.role === 'owner' ? -1 : 0) - (b.role === 'owner' ? -1 : 0) || (a.createdAt || 0) - (b.createdAt || 0));
      $('#uMem', v).innerHTML = `<div class="card-h"><h3>${t('teamMembers')}</h3></div><div class="list">${mem.map((m) => `<div class="li click" data-id="${m.id}"><div class="avatar" style="width:40px;height:40px">${m.photo ? `<img alt="" referrerpolicy="no-referrer" src="${esc(m.photo)}">` : esc((m.name || m.email || '?').charAt(0).toUpperCase())}</div><div class="grow"><div class="t">${esc(m.name || m.email)}</div><div class="s">${esc(m.email)}</div></div><span class="badge ${m.role === 'owner' ? '' : m.role === 'manager' ? 'amber' : 'gray'}">${t('role_' + m.role)}</span></div>`).join('')}</div>`;
      const inv = arr(S.invites);
      $('#uInvs', v).innerHTML = `<div class="card-h"><h3>${t('pendingInvites')}</h3></div>` + (inv.length ? `<div class="list">${inv.map((i) => `<div class="li"><div class="ico">${ic('mail')}</div><div class="grow"><div class="t">${esc(i.email)}</div><div class="s">${t('role_' + i.role)}</div></div><button class="btn sm" data-rev="${esc(i.email)}">${t('revoke')}</button></div>`).join('')}</div>` : `<div class="muted small">${t('noInvites')}</div>`);
      $$('#uMem [data-id]', v).forEach((el) => { el.onclick = () => memberModal(S.members.get(el.dataset.id)); });
      $$('[data-rev]', v).forEach((b) => { b.onclick = async () => { try { await revokeInvite(b.dataset.rev); toast(t('deleted'), 'ok'); } catch (e) { toast(errMsg(e), 'err'); } }; });
    };
    $('#uInv', v).onclick = inviteModal;
    upd();
    return { update: upd };
  }
};

/* ---------------------------------------------------------------------
   SETTINGS
   --------------------------------------------------------------------- */
const sec = (icon, title, html, id = '') => `<div class="card" ${id ? `id="${id}"` : ''}><div class="card-h"><h3>${ic(icon)} ${title}</h3></div>${html}</div>`;
const readFile = (file, as = 'text') => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); as === 'text' ? fr.readAsText(file) : fr.readAsDataURL(file); });
ROUTES.settings = {
  render(v) {
    const st = shopSettings(), r = st.receipt, canShop = can('settings'), canBackup = can('backup');
    const bgOpts = [['none', ''], ...Object.keys(BG_PRESETS).map((k) => [k, BG_PRESETS[k]])];
    const html = [
      sec('sliders', t('appearance'), `<div class="form">
        <div><div class="small muted bold">${t('language')}</div><div class="seg" id="sLang"><button data-v="bn" class="${S.lang === 'bn' ? 'active' : ''}">বাংলা</button><button data-v="en" class="${S.lang === 'en' ? 'active' : ''}">English</button></div></div>
        <div><div class="small muted bold">${t('themeMode')}</div><div class="seg" id="sMode">${['light', 'dark', 'auto'].map((m) => `<button data-v="${m}" class="${S.mode === m ? 'active' : ''}">${t('mode_' + m)}</button>`).join('')}</div></div>
        <div><div class="small muted bold">${t('themeColor')}</div><div class="swatches" id="sColor">${Object.keys(THEME_COLORS).map((k) => `<div class="swatch ${S.color === k ? 'active' : ''}" data-v="${k}" style="background:linear-gradient(135deg,${THEME_COLORS[k][0]},${THEME_COLORS[k][1]})"></div>`).join('')}</div></div>
        <div><div class="small muted bold">${t('background')}</div><div class="swatches" id="sBg">${bgOpts.map(([k, g]) => `<div class="bgopt ${S.bg === k ? 'active' : ''}" data-v="${k}" style="background:${g || 'var(--surface-2)'}" title="${k}"></div>`).join('')}${S.branding.bgImage ? `<div class="bgopt ${S.bg === 'image' ? 'active' : ''}" data-v="image" style="background-image:url('${esc(S.branding.bgImage)}')"></div>` : ''}</div>
          ${canShop ? `<div class="row" style="margin-top:8px"><label class="btn sm"><input type="file" accept="image/*" id="sBgFile" hidden>${ic('image')}${t('uploadBackground')}</label>${S.branding.bgImage ? `<button class="btn sm ghost" id="sBgDel">${t('remove')}</button>` : ''}</div>` : ''}</div></div>`),
      canShop ? sec('store', t('shopProfile'), `<div class="form">
        <div class="row"><div class="logo-prev">${S.branding.logo ? `<img alt="" src="${esc(S.branding.logo)}">` : ic('store')}</div><div class="stack"><label class="btn sm"><input type="file" accept="image/*" id="sLogoFile" hidden>${ic('upload')}${t('uploadLogo')}</label>${S.branding.logo ? `<button class="btn sm ghost" id="sLogoDel">${t('remove')}</button>` : ''}</div></div>
        <label class="f">${t('shopName')}<input id="sName" maxlength="80" value="${esc(S.shop.name)}"></label>
        <label class="f">${t('address')}<input id="sAddr" maxlength="200" value="${esc(st.address)}"></label>
        <div class="two"><label class="f">${t('phone')}<input id="sPhone" inputmode="tel" maxlength="30" value="${esc(st.phone)}"></label><label class="f">${t('currency')}<input value="BDT (৳)" disabled></label></div>
        <div class="two"><label class="f">${t('weekStart')}<select id="sWeek">${[6, 0, 1].map((d) => `<option value="${d}" ${st.weekStart === d ? 'selected' : ''}>${new Date(2024, 0, 7 + d).toLocaleDateString(loc(), { weekday: 'long' })}</option>`).join('')}</select></label><label class="f">${t('defaultLowStock')}<input id="sLow" inputmode="decimal" value="${st.defaultLowStock}"></label></div>
        <div class="switch"><span>${t('allowNegativeStock')}</span><input type="checkbox" id="sNeg" ${st.allowNegativeStock ? 'checked' : ''}></div>
        <button class="btn primary" id="sSaveShop">${ic('check')}${t('save')}</button></div>`) : '',
      canShop ? sec('receipt', t('receiptSettings'), `<div class="form"><label class="f">${t('paperSize')}<select id="rPaper">${[['58', '58 mm'], ['80', '80 mm'], ['A4', 'A4']].map(([k, l]) => `<option value="${k}" ${r.paper === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        ${[['showLogo', 'showLogo'], ['showAddress', 'showAddress'], ['showPhone', 'showPhone'], ['showCashier', 'showCashier'], ['showDue', 'showDue']].map(([k, l]) => `<div class="switch"><span>${t(l)}</span><input type="checkbox" data-rc="${k}" ${r[k] ? 'checked' : ''}></div>`).join('')}
        <label class="f">${t('receiptFooter')}<input id="rFooter" maxlength="150" value="${esc(r.footer)}" placeholder="${t('thanks')}"></label>
        <div class="row"><button class="btn" id="rPrev">${ic('receipt')}${t('preview')}</button><button class="btn primary" id="rSave">${ic('check')}${t('save')}</button></div></div>`) : '',
      canBackup ? sec('cloud', t('backupRestore'), `<div class="form"><div class="alert info">${ic('cloud')}<div>${t('cloudInfo')}</div></div>
        <div class="row"><button class="btn primary" id="bBackup">${ic('download')}${t('downloadBackup')}</button>${isOwner() ? `<label class="btn"><input type="file" accept="application/json,.json" id="bRestoreFile" hidden>${ic('upload')}${t('restoreBackup')}</label>` : ''}</div>
        <div class="row"><button class="btn sm" id="xProducts">${t('exportProducts')}</button><button class="btn sm" id="xCustomers">${t('exportCustomers')}</button><button class="btn sm" id="xSales">${t('exportSales')}</button></div>
        ${isOwner() ? `<div class="small muted">${t('repairNote')}</div><div class="row"><button class="btn sm" id="mBal">${ic('refresh')}${t('recalcBalances')}</button></div>` : ''}</div>`) : '',
      sec('user', t('account'), `<div class="kv"><span>${t('email')}</span><b>${esc(S.user.email || '')}</b><span>${t('role')}</span><b>${t('role_' + S.member.role)}</b></div><div class="row" style="margin-top:12px"><button class="btn danger" id="sOut">${ic('logout')}${t('signOut')}</button></div>`),
      `<div class="center small muted">AMAR DOKAN PRO · ${NATIVE ? 'Android ' + esc(window.AndroidBridge.appVersion()) : 'Web'}</div>`
    ].join('');
    v.innerHTML = pageHead(t('nav_settings')) + `<div class="stack">${html}</div>`;
    const q = (s) => $(s, v), on = (s, fn) => { const el = q(s); if (el) el.onclick = fn; };
    const safe = (fn) => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); toast(errMsg(e), 'err'); } };
    $$('#sLang button', v).forEach((b) => { b.onclick = () => { S.lang = b.dataset.v; savePrefs(); buildChrome(); route(); }; });
    $$('#sMode button', v).forEach((b) => { b.onclick = () => { S.mode = b.dataset.v; savePrefs(); buildChrome(); route(); }; });
    $$('#sColor [data-v]', v).forEach((b) => { b.onclick = () => { S.color = b.dataset.v; savePrefs(); route(); }; });
    $$('#sBg [data-v]', v).forEach((b) => { b.onclick = () => { S.bg = b.dataset.v; savePrefs(); route(); }; });
    const bgf = q('#sBgFile'); if (bgf) bgf.onchange = safe(async () => { const f = bgf.files[0]; if (!f) return; await saveBranding({ bgImage: await resizeImage(f, 1280, 'image/jpeg', 0.6) }); S.bg = 'image'; await savePrefs(); toast(t('saved'), 'ok'); route(); });
    on('#sBgDel', safe(async () => { await saveBranding({ bgImage: '' }); if (S.bg === 'image') S.bg = 'none'; await savePrefs(); route(); }));
    const lf = q('#sLogoFile'); if (lf) lf.onchange = safe(async () => { const f = lf.files[0]; if (!f) return; await saveBranding({ logo: await resizeImage(f, 256, 'image/png') }); toast(t('saved'), 'ok'); route(); });
    on('#sLogoDel', safe(async () => { await saveBranding({ logo: '' }); route(); }));
    on('#sSaveShop', safe(async () => {
      const low = optNum(v, '#sLow'); if (!(low >= 0)) fail('errAmount');
      await saveShop({ name: q('#sName').value, settings: { address: q('#sAddr').value.trim(), phone: q('#sPhone').value.trim(), weekStart: +q('#sWeek').value, defaultLowStock: low, allowNegativeStock: q('#sNeg').checked } });
      toast(t('saved'), 'ok');
    }));
    const rcfg = () => { const rc = { paper: q('#rPaper').value, footer: q('#rFooter').value.trim() }; $$('[data-rc]', v).forEach((i) => { rc[i.dataset.rc] = i.checked; }); return rc; };
    on('#rSave', safe(async () => { await saveShop({ settings: { receipt: rcfg() } }); toast(t('saved'), 'ok'); }));
    on('#rPrev', () => {
      const keep = S.shop.settings; S.shop.settings = { ...shopSettings(), receipt: { ...shopSettings().receipt, ...rcfg() } };
      const sample = { invoice: 'INV-000000-DEMO', date: ymd(), time: nowTime(), createdByName: S.user.displayName || '', customerName: t('sampleCustomer'), customerPhone: '01700000000', lines: [{ name: t('sampleItem'), qty: 2, price: 120 }, { name: t('sampleItem') + ' 2', qty: 1, price: 350 }], subtotal: 590, discount: 40, total: 550, paid: 400, due: 150, payments: [{ method: 'cash', accountId: 'cash', amount: 400 }], status: 'active' };
      const m = receiptModal(sample); S.shop.settings = keep; void m;
    });
    on('#bBackup', safe(async () => {
      toast(t('preparing'));
      const data = await exportBackup();
      downloadText(`amar-dokan-backup-${ymd()}.json`, 'application/json', JSON.stringify(data));
      toast(data.skipped.length ? t('backupPartial', data.skipped.join(', ')) : t('backupDone'), data.skipped.length ? 'err' : 'ok');
    }));
    const rf = q('#bRestoreFile'); if (rf) rf.onchange = safe(async () => {
      const f = rf.files[0]; if (!f) return; rf.value = '';
      let json; try { json = JSON.parse(await readFile(f)); } catch (e) { fail('errBackupFile'); }
      const mm = openModal({ title: t('restoreBackup'), body: `<div class="alert red">${ic('alert')}<div>${t('restoreWarn', esc(json.shopName || ''), esc(json.exportedAt || ''))}</div></div><div class="switch" style="margin-top:10px"><span>${t('wipeFirst')}</span><input type="checkbox" id="wipe"></div>`,
        footer: [{ label: t('cancel') }, { label: t('restore'), cls: 'danger', onClick: async (c) => { const n = await restoreBackup(json, $('#wipe', c.el).checked); toast(t('restoreDone', n), 'ok'); } }] });
      void mm;
    });
    const csvBtn = (id, name, rows) => on(id, () => downloadText(`${name}-${ymd()}.csv`, 'text/csv', toCSV(rows())));
    csvBtn('#xProducts', 'products', () => [[t('productName'), t('category'), t('barcode'), t('sellPrice'), ...(can('viewCost') ? [t('purchasePrice')] : []), t('stockQty')], ...arr(S.products).map((p) => [p.name, p.category, p.barcode, p.sellPrice, ...(can('viewCost') ? [(S.costs.get(p.id) || {}).cost ?? ''] : []), p.stock])]);
    csvBtn('#xCustomers', 'customers', () => [[t('customerName'), t('mobile'), t('address'), t('due')], ...arr(S.customers).map((c) => [c.name, c.phone, c.address, c.due])]);
    csvBtn('#xSales', 'sales', () => [[t('invoice'), t('date'), t('customer'), t('total'), t('paid'), t('due'), t('status')], ...arr(S.sales).map((s) => [s.invoice, s.date, s.customerName, s.total, s.paid, s.due, s.status])]);
    on('#mBal', safe(async () => { if (!(await confirmBox(t('confirmRecalc')))) return; const n = await recalcBalances(); toast(t('recalcDone', n), 'ok'); }));
    on('#sOut', () => doSignOut());
    return {};
  }
};

/* ---------------------------------------------------------------------
   Translations   key: [বাংলা, English]    ({0}, {1} = placeholders)
   --------------------------------------------------------------------- */
const I18N = {
  // general
  yes: ['হ্যাঁ', 'Yes'], ok: ['ঠিক আছে', 'OK'], cancel: ['বাতিল', 'Cancel'], confirm: ['নিশ্চিত করুন', 'Confirm'], close: ['বন্ধ', 'Close'], save: ['সংরক্ষণ', 'Save'],
  saved: ['সংরক্ষণ হয়েছে', 'Saved'], deleted: ['মুছে ফেলা হয়েছে', 'Deleted'], delete: ['মুছুন', 'Delete'], edit: ['এডিট', 'Edit'], remove: ['সরান', 'Remove'], back: ['ফিরে যান', 'Back'],
  retry: ['আবার চেষ্টা করুন', 'Retry'], clear: ['পরিষ্কার', 'Clear'], all: ['সব', 'All'], more: ['আরও', 'More'], share: ['শেয়ার', 'Share'], print: ['প্রিন্ট', 'Print'], printPdf: ['প্রিন্ট / PDF', 'Print / PDF'],
  csv: ['CSV ডাউনলোড', 'Download CSV'], preview: ['প্রিভিউ', 'Preview'], viewAll: ['সব দেখুন', 'View all'], optional: ['ঐচ্ছিক', 'Optional'], preparing: ['প্রস্তুত হচ্ছে…', 'Preparing…'],
  copied: ['কপি হয়েছে', 'Copied'], copyFailed: ['কপি করা যায়নি', 'Could not copy'], savedOffline: ['অফলাইনে সংরক্ষিত — ইন্টারনেট এলে সিঙ্ক হবে', 'Saved offline — will sync when online'],
  synced: ['সিঙ্ক হয়েছে', 'Synced'], syncing: ['সিঙ্ক হচ্ছে…', 'Syncing…'], offline: ['অফলাইন', 'Offline'], sync: ['সিঙ্ক', 'Sync'],
  notFound: ['পাওয়া যায়নি', 'Not found'], noData: ['কোনো তথ্য নেই', 'No data'], noResults: ['কিছু পাওয়া যায়নি', 'No results'], status: ['অবস্থা', 'Status'], active: ['সক্রিয়', 'Active'], inactive: ['নিষ্ক্রিয়', 'Inactive'],
  // nav
  nav_dashboard: ['ড্যাশবোর্ড', 'Dashboard'], nav_pos: ['বিক্রি (POS)', 'Sell (POS)'], nav_sales: ['বিক্রির তালিকা', 'Sales'], nav_products: ['পণ্য', 'Products'], nav_customers: ['কাস্টমার', 'Customers'],
  nav_accounts: ['ক্যাশ ও অ্যাকাউন্ট', 'Cash & Accounts'], nav_reports: ['লেনদেন রিপোর্ট', 'Transactions'], nav_expenses: ['খরচ', 'Expenses'], nav_pnl: ['লাভ-ক্ষতি', 'Profit & Loss'], nav_users: ['ব্যবহারকারী', 'Users'], nav_settings: ['সেটিংস', 'Settings'],
  // auth / onboarding
  tagline: ['আপনার দোকানের পূর্ণাঙ্গ হিসাব ব্যবস্থাপনা', 'Complete shop management for your business'], signInGoogle: ['Google দিয়ে সাইন ইন', 'Sign in with Google'], signOut: ['সাইন আউট', 'Sign out'],
  loginNote: ['আপনার তথ্য নিরাপদে Google Firebase-এ সংরক্ষিত হয়', 'Your data is stored securely in Google Firebase'],
  noConfig: ['Firebase সেটআপ সম্পন্ন হয়নি।', 'Firebase is not configured yet.'], sdkFail: ['Firebase লোড করা যায়নি। ইন্টারনেট সংযোগ দেখুন।', 'Could not load Firebase. Check your internet connection.'],
  noConfig1: ['Firebase Console-এ প্রজেক্ট ও Web App তৈরি করুন', 'Create a project and a Web App in the Firebase Console'], noConfig2: ['কনফিগ বসান:', 'Paste the config into'], noConfig3: ['README-এর ধাপগুলো অনুসরণ করে আবার বিল্ড করুন', 'Follow the README steps and build again'],
  welcome: ['স্বাগতম!', 'Welcome!'], welcomeMsg: ['{0} হিসাবে সাইন ইন হয়েছে। আপনার দোকান তৈরি করুন।', 'Signed in as {0}. Create your shop to get started.'], shopName: ['দোকানের নাম', 'Shop name'], shopNamePh: ['যেমন: আমার দোকান', 'e.g. My Shop'],
  createShop: ['দোকান তৈরি করুন', 'Create shop'], inviteHint: ['কর্মচারী হলে মালিককে আপনার Gmail জানান — তিনি আপনাকে ইনভাইট করবেন।', 'Employee? Give your Gmail to the owner so they can invite you.'],
  invitedTitle: ['আপনাকে আমন্ত্রণ জানানো হয়েছে', 'You have been invited'], invitedMsg: ['আপনাকে {0} হিসাবে দোকানে যুক্ত হতে আমন্ত্রণ জানানো হয়েছে।', 'You were invited to join the shop as {0}.'], acceptInvite: ['আমন্ত্রণ গ্রহণ করুন', 'Accept invitation'],
  removedTitle: ['প্রবেশাধিকার নেই', 'No access'], removedMsg: ['আপনাকে এই দোকান থেকে সরানো হয়েছে।', 'You have been removed from this shop.'],
  account: ['অ্যাকাউন্ট', 'Account'], role: ['ভূমিকা', 'Role'], shop: ['দোকান', 'Shop'], theme: ['থিম', 'Theme'], language: ['ভাষা', 'Language'], appVersion: ['অ্যাপ সংস্করণ', 'App version'], email: ['ইমেইল', 'Email'],
  role_owner: ['মালিক', 'Owner'], role_manager: ['ম্যানেজার', 'Manager'], role_employee: ['কর্মচারী', 'Employee'],
  // errors
  errLoadAccount: ['অ্যাকাউন্ট লোড করা যায়নি', 'Could not load your account'], errNetwork: ['ইন্টারনেট সংযোগ নেই', 'No internet connection'], errDomain: ['এই ডোমেইন Firebase-এ অনুমোদিত নয় (Authorized domains)', 'This domain is not authorized in Firebase (Authorized domains)'],
  errAccountExists: ['এই ইমেইলে ভিন্ন পদ্ধতিতে অ্যাকাউন্ট আছে', 'An account already exists with a different sign-in method'], errNoAccess: ['এই তথ্য দেখার অনুমতি নেই', 'No permission to read this data'],
  errPermission: ['এই কাজের অনুমতি আপনার নেই', 'You do not have permission for this action'], errShopName: ['দোকানের নাম কমপক্ষে ২ অক্ষর দিন', 'Shop name needs at least 2 characters'],
  errName: ['নাম দিন (সর্বোচ্চ ১২০ অক্ষর)', 'Enter a name (max 120 characters)'], errPrice: ['সঠিক দাম দিন', 'Enter a valid price'], errStock: ['সঠিক স্টক সংখ্যা দিন', 'Enter a valid stock quantity'], errQty: ['সঠিক পরিমাণ দিন', 'Enter a valid quantity'],
  errAmount: ['সঠিক টাকার পরিমাণ দিন', 'Enter a valid amount'], errDate: ['সঠিক তারিখ দিন', 'Enter a valid date'], errAccount: ['সঠিক অ্যাকাউন্ট বেছে নিন', 'Choose a valid account'], errSameAccount: ['একই অ্যাকাউন্টে ট্রান্সফার করা যাবে না', 'Cannot transfer to the same account'],
  errBarcodeDup: ['এই বারকোড অন্য পণ্যে আছে', 'This barcode is already used by another product'], errPhone: ['সঠিক মোবাইল/অ্যাকাউন্ট নম্বর দিন', 'Enter a valid mobile/account number'], errCustomerDue: ['বকেয়া থাকলে কাস্টমার মোছা যাবে না', 'Cannot delete a customer who still has a due'],
  errCustomerRequired: ['বাকি রাখতে কাস্টমার বেছে নিন', 'Select a customer to sell on due'], errOverDue: ['বকেয়ার চেয়ে বেশি নেওয়া যাবে না (বকেয়া {0})', 'Cannot collect more than the due ({0})'], errProduct: ['পণ্য পাওয়া যায়নি', 'Product not found'],
  errCart: ['কার্ট খালি', 'The cart is empty'], errDiscount: ['ডিসকাউন্ট সঠিক নয়', 'Invalid discount'], errPayExceeds: ['পরিশোধ মোট টাকার বেশি হতে পারে না', 'Paid amount cannot exceed the total'], errStockLow: ['"{0}" এর স্টক মাত্র {1}', 'Only {1} of "{0}" in stock'],
  errCategory: ['খরচের ধরন বেছে নিন', 'Choose an expense category'], errEmail: ['সঠিক ইমেইল দিন', 'Enter a valid email'], errRole: ['সঠিক ভূমিকা বেছে নিন', 'Choose a valid role'], errAlreadyMember: ['এই ইমেইল ইতিমধ্যে সদস্য', 'This email is already a member'],
  errOwnerOnly: ['শুধু মালিক এটি করতে পারেন', 'Only the owner can do this'], errBackupFile: ['ব্যাকআপ ফাইলটি সঠিক নয়', 'Invalid backup file'], errImage: ['ছবি পড়া যায়নি', 'Could not read the image'], errImageBig: ['ছবি অনেক বড় — ছোট ছবি দিন', 'Image is too large — use a smaller one'],
  // dashboard
  newSale: ['নতুন বিক্রি', 'New sale'], todaySales: ['আজকের বিক্রি', "Today's sales"], todayPurchases: ['আজকের ক্রয়', "Today's purchases"], todayProfit: ['আজকের লাভ', "Today's profit"], todayExpenses: ['আজকের খরচ', "Today's expenses"],
  customerDues: ['কাস্টমার বকেয়া', 'Customer dues'], cashBalance: ['ক্যাশ ব্যালেন্স', 'Cash balance'], mobileBalances: ['মোবাইল ব্যাংকিং ব্যালেন্স', 'Mobile banking balances'], noAccounts: ['কোনো অ্যাকাউন্ট নেই', 'No accounts'],
  nInvoices: ['{0}টি ইনভয়েস', 'Invoices: {0}'], nWithDue: ['{0} জনের বাকি', 'With due: {0}'], nItems: ['{0}টি আইটেম', 'Items: {0}'], nEntries: ['{0}টি এন্ট্রি', 'Entries: {0}'], costPending: ['{0}টি বিক্রির ক্রয়মূল্য হিসাব বাকি', 'Cost pending for {0} sales'],
  grossProfit: ['মোট লাভ', 'Gross profit'], summary: ['সারসংক্ষেপ', 'Summary'], per_day: ['দৈনিক', 'Daily'], per_week: ['সাপ্তাহিক', 'Weekly'], per_month: ['মাসিক', 'Monthly'], sales: ['বিক্রি', 'Sales'], purchases: ['ক্রয়', 'Purchases'], expenses: ['খরচ', 'Expenses'],
  netProfit: ['নিট লাভ', 'Net profit'], invoices: ['ইনভয়েস', 'Invoices'], dueGiven: ['বাকিতে বিক্রি', 'Sold on due'], last7: ['গত ৭ দিনের বিক্রি', 'Sales — last 7 days'], lowStock: ['স্টক কম', 'Low stock'], recentSales: ['সাম্প্রতিক বিক্রি', 'Recent sales'],
  walkIn: ['সাধারণ ক্রেতা', 'Walk-in customer'], ownSalesOnly: ['আপনি শুধু নিজের করা বিক্রি দেখতে পাচ্ছেন।', 'You can only see sales made by you.'],
  // sales list
  from: ['থেকে', 'From'], to: ['পর্যন্ত', 'To'], searchSales: ['ইনভয়েস / কাস্টমার / পণ্য খুঁজুন', 'Search invoice / customer / item'], noSales: ['কোনো বিক্রি নেই', 'No sales found'], items: ['আইটেম', 'items'], voided: ['বাতিল', 'Voided'],
  voidSale: ['বিক্রি বাতিল', 'Void sale'], confirmVoid: ['এই বিক্রি বাতিল করবেন? স্টক, ক্যাশ ও বাকি আগের অবস্থায় ফিরবে।', 'Void this sale? Stock, cash and due will be restored.'],
  // POS
  scanSearch: ['পণ্য খুঁজুন বা বারকোড স্ক্যান করুন', 'Search product or scan barcode'], cart: ['কার্ট', 'Cart'], cartEmpty: ['কার্ট খালি — পণ্যে ট্যাপ করুন', 'Cart is empty — tap a product'], stock: ['স্টক', 'Stock'], noProductsYet: ['এখনো কোনো পণ্য নেই', 'No products yet'],
  listPrice: ['তালিকা মূল্য', 'List price'], sellPrice: ['বিক্রয়মূল্য', 'Selling price'], priceChanged: ['দাম পরিবর্তিত', 'Price changed'], belowCost: ['ক্রয়মূল্যের নিচে', 'Below cost'], addCustomer: ['কাস্টমার যোগ করুন', 'Add customer'],
  subtotal: ['উপমোট', 'Subtotal'], discount: ['ডিসকাউন্ট', 'Discount'], total: ['মোট', 'Total'], payment: ['পেমেন্ট', 'Payment'], paid: ['পরিশোধ', 'Paid'], due: ['বাকি', 'Due'], note: ['নোট', 'Note'], completeSale: ['বিক্রি সম্পন্ন করুন', 'Complete sale'],
  confirmClear: ['কার্ট খালি করবেন?', 'Clear the cart?'], pickCustomerForDue: ['বাকিতে বিক্রির জন্য কাস্টমার বেছে নিন', 'Select a customer for a due sale'], noAccountFor: ['{0} এর কোনো অ্যাকাউন্ট নেই — অ্যাকাউন্টস থেকে যোগ করুন', 'No account for {0} — add one in Accounts'], saleDone: ['বিক্রি সম্পন্ন!', 'Sale completed!'],
  pm_cash: ['ক্যাশ', 'Cash'], pm_bkash: ['বিকাশ', 'bKash'], pm_nagad: ['নগদ', 'Nagad'], pm_rocket: ['রকেট', 'Rocket'], pm_upay: ['উপায়', 'Upay'], pm_due: ['বাকি', 'Due'], pm_other: ['অন্যান্য', 'Other'],
  // receipt
  receipt: ['রশিদ', 'Receipt'], invoice: ['ইনভয়েস', 'Invoice'], date: ['তারিখ', 'Date'], time: ['সময়', 'Time'], cashier: ['ক্যাশিয়ার', 'Cashier'], customer: ['কাস্টমার', 'Customer'], thanks: ['ধন্যবাদ, আবার আসবেন!', 'Thank you, visit again!'],
  sampleCustomer: ['নমুনা কাস্টমার', 'Sample customer'], sampleItem: ['নমুনা পণ্য', 'Sample item'], generatedOn: ['তৈরি:', 'Generated:'],
  // products
  addProduct: ['পণ্য যোগ করুন', 'Add product'], editProduct: ['পণ্য এডিট', 'Edit product'], productName: ['পণ্যের নাম', 'Product name'], category: ['ক্যাটাগরি', 'Category'], barcode: ['বারকোড', 'Barcode'], purchasePrice: ['ক্রয়মূল্য', 'Purchase price'], cost: ['ক্রয়', 'Cost'],
  stockQty: ['স্টক পরিমাণ', 'Stock quantity'], openingStock: ['শুরুর স্টক', 'Opening stock'], lowStockLevel: ['কম স্টকের সীমা', 'Low-stock level'], searchProducts: ['নাম / বারকোড / ক্যাটাগরি খুঁজুন', 'Search name / barcode / category'],
  confirmDeleteProduct: ['"{0}" মুছে ফেলবেন?', 'Delete "{0}"?'], totalProducts: ['মোট পণ্য', 'Total products'], stockValueCost: ['স্টক মূল্য (ক্রয়)', 'Stock value (cost)'], stockValueRetail: ['স্টক মূল্য (বিক্রয়)', 'Stock value (retail)'],
  stockPurchase: ['স্টক ক্রয়', 'Stock purchase'], product: ['পণ্য', 'Product'], quantity: ['পরিমাণ', 'Quantity'], unitCost: ['একক ক্রয়মূল্য', 'Unit cost'], paidFrom: ['যে অ্যাকাউন্ট থেকে পরিশোধ', 'Paid from'], supplier: ['সরবরাহকারী', 'Supplier'],
  avgCostNote: ['ক্রয়মূল্য গড় (weighted average) পদ্ধতিতে হালনাগাদ হবে।', 'Cost price is updated using weighted average.'], purchaseHistory: ['ক্রয়ের ইতিহাস', 'Purchase history'], noPurchases: ['কোনো ক্রয় নেই', 'No purchases'], confirmDeletePurchase: ['ক্রয় মুছবেন? স্টক ও ক্যাশ ফিরে যাবে।', 'Delete purchase? Stock and cash will be reversed.'],
  // customers
  customerName: ['কাস্টমারের নাম', 'Customer name'], mobile: ['মোবাইল নম্বর', 'Mobile number'], address: ['ঠিকানা', 'Address'], previousDue: ['আগের বকেয়া', 'Previous due'], editCustomer: ['কাস্টমার এডিট', 'Edit customer'],
  searchCustomers: ['নাম বা মোবাইল খুঁজুন', 'Search name or mobile'], dueOnly: ['শুধু বকেয়া', 'Due only'], totalCustomers: ['মোট কাস্টমার', 'Total customers'], totalDue: ['মোট বকেয়া', 'Total due'], noCustomersYet: ['এখনো কোনো কাস্টমার নেই', 'No customers yet'],
  collectDue: ['বকেয়া আদায়', 'Collect due'], currentDue: ['বর্তমান বকেয়া', 'Current due'], amount: ['টাকা', 'Amount'], receivedIn: ['যে অ্যাকাউন্টে পেয়েছেন', 'Received in'], collect: ['আদায় করুন', 'Collect'], collected: ['বকেয়া আদায় হয়েছে', 'Due collected'],
  customerStatement: ['কাস্টমার স্টেটমেন্ট', 'Customer statement'], dueCollection: ['বকেয়া আদায়', 'Due collection'], details: ['বিবরণ', 'Details'], balance: ['ব্যালেন্স', 'Balance'], totalPurchases: ['মোট ক্রয়', 'Total purchases'], totalPaid: ['মোট পরিশোধ', 'Total paid'], remainingDue: ['অবশিষ্ট বকেয়া', 'Remaining due'],
  history: ['লেনদেনের ইতিহাস', 'History'], noHistory: ['কোনো ইতিহাস নেই', 'No history'], call: ['কল', 'Call'], sendReminder: ['রিমাইন্ডার SMS', 'Send reminder'], confirmDeleteCustomer: ['"{0}" মুছে ফেলবেন?', 'Delete "{0}"?'], confirmDeletePayment: ['এই আদায় মুছবেন? বকেয়া আবার বাড়বে।', 'Delete this collection? The due will increase again.'],
  reminderMsg: ['প্রিয় {0}, আপনার বকেয়া {1}। অনুগ্রহ করে পরিশোধ করুন। — {2}', 'Dear {0}, your outstanding due is {1}. Please pay at your convenience. — {2}'],
  // accounts
  addAccount: ['অ্যাকাউন্ট যোগ করুন', 'Add account'], editAccount: ['অ্যাকাউন্ট এডিট', 'Edit account'], accountName: ['অ্যাকাউন্টের নাম', 'Account name'], accountType: ['অ্যাকাউন্টের ধরন', 'Account type'], accountNumber: ['মোবাইল / অ্যাকাউন্ট নম্বর', 'Mobile / account number'], openingBalance: ['শুরুর ব্যালেন্স', 'Opening balance'],
  acct_cash: ['ক্যাশ ইন হ্যান্ড', 'Cash in hand'], acct_bkash_agent: ['বিকাশ এজেন্ট', 'bKash Agent'], acct_bkash_personal: ['বিকাশ পার্সোনাল', 'bKash Personal'], acct_nagad_agent: ['নগদ এজেন্ট', 'Nagad Agent'], acct_nagad_personal: ['নগদ পার্সোনাল', 'Nagad Personal'], acct_rocket: ['রকেট', 'Rocket'], acct_upay: ['উপায়', 'Upay'], acct_bank: ['ব্যাংক', 'Bank'], acct_other: ['অন্যান্য', 'Other'],
  tx_deposit: ['জমা', 'Deposit'], tx_withdraw: ['উত্তোলন', 'Withdraw'], tx_transfer: ['ট্রান্সফার', 'Transfer'], tx_charge: ['চার্জ / ফি', 'Charge / Fee'], tx_adjustment: ['সমন্বয়', 'Adjustment'], tx_sale: ['বিক্রি', 'Sale'], tx_due_collection: ['বকেয়া আদায়', 'Due collection'], tx_expense: ['খরচ', 'Expense'], tx_purchase: ['পণ্য ক্রয়', 'Purchase'], tx_opening: ['শুরুর ব্যালেন্স', 'Opening balance'], tx_transfer_in: ['ট্রান্সফার (প্রাপ্তি)', 'Transfer in'], tx_transfer_out: ['ট্রান্সফার (প্রদান)', 'Transfer out'],
  fromAccount: ['যে অ্যাকাউন্ট থেকে', 'From account'], toAccount: ['যে অ্যাকাউন্টে', 'To account'], fee: ['চার্জ', 'Fee'], direction: ['দিক', 'Direction'], increase: ['বাড়ান', 'Increase'], decrease: ['কমান', 'Decrease'], description: ['বিবরণ', 'Description'],
  transferNote: ['ট্রান্সফারে দুই অ্যাকাউন্টে দুটি এন্ট্রি হয়, কিন্তু মোট ব্যালেন্সে দুইবার গণনা হয় না। চার্জ আলাদাভাবে কাটা হয়।', 'A transfer creates one entry in each account but is never counted twice in totals. The fee is deducted separately.'],
  txSaleDesc: ['বিক্রি {0}', 'Sale {0}'], txDueDesc: ['বকেয়া আদায় — {0}', 'Due collected — {0}'], txExpenseDesc: ['খরচ — {0}', 'Expense — {0}'], txPurchaseDesc: ['ক্রয় — {0} × {1}', 'Purchase — {0} × {1}'], txTransferDesc: ['ট্রান্সফার {0} → {1}', 'Transfer {0} → {1}'], txFeeDesc: ['ট্রান্সফার চার্জ', 'Transfer fee'], txOpeningDesc: ['শুরুর ব্যালেন্স', 'Opening balance'],
  totalBalance: ['মোট ব্যালেন্স', 'Total balance'], cashInHand: ['ক্যাশ ইন হ্যান্ড', 'Cash in hand'], mobileBanking: ['মোবাইল ব্যাংকিং', 'Mobile banking'], otherAccounts: ['অন্যান্য অ্যাকাউন্ট', 'Other accounts'], currentBalance: ['বর্তমান ব্যালেন্স', 'Current balance'], ledger: ['লেজার', 'Ledger'], showingFrom: ['{0} থেকে দেখাচ্ছে', 'Showing from {0}'],
  loadOlder: ['পুরোনো লেনদেন দেখুন', 'Load older'], noTransactions: ['কোনো লেনদেন নেই', 'No transactions'], confirmDeleteTx: ['এই লেনদেন মুছবেন? ব্যালেন্স ঠিক করে দেওয়া হবে।', 'Delete this transaction? The balance will be corrected.'], confirmDeleteTransfer: ['পুরো ট্রান্সফার (দুই অ্যাকাউন্টই) মুছবেন?', 'Delete the whole transfer (both accounts)?'],
  // reports
  range_day: ['আজ', 'Today'], range_week: ['এই সপ্তাহ', 'This week'], range_month: ['এই মাস', 'This month'], range_custom: ['কাস্টম', 'Custom'],
  cashReceived: ['ক্যাশ প্রাপ্তি', 'Cash received'], cashPaid: ['ক্যাশ প্রদান', 'Cash paid'], mobileReceived: ['মোবাইল ব্যাংকিং প্রাপ্তি', 'Mobile banking received'], mobilePaid: ['মোবাইল ব্যাংকিং প্রদান', 'Mobile banking paid'], transfersTotal: ['ট্রান্সফার', 'Transfers'], feesCharges: ['ফি ও চার্জ', 'Fees & charges'],
  closingBalances: ['সমাপনী ব্যালেন্স', 'Closing balances'], opening: ['শুরু', 'Opening'], received: ['প্রাপ্তি', 'Received'], paidOut: ['প্রদান', 'Paid out'], transfersNet: ['ট্রান্সফার (নিট)', 'Transfers (net)'], closing: ['সমাপনী', 'Closing'],
  transferNoDouble: ['ট্রান্সফারের নিট যোগফল শূন্য — অর্থাৎ দুইবার গণনা হয়নি।', 'Net transfers total zero — nothing is double counted.'], byType: ['ধরন অনুযায়ী', 'By type'], entries: ['এন্ট্রি', 'entries'], transactions: ['লেনদেন', 'Transactions'], item: ['বিষয়', 'Item'], type: ['ধরন', 'Type'],
  // expenses
  addExpense: ['খরচ যোগ করুন', 'Add expense'], editExpense: ['খরচ এডিট', 'Edit expense'], paymentMethod: ['পেমেন্ট মাধ্যম', 'Payment method'], confirmDeleteExpense: ['এই খরচ মুছবেন? ব্যালেন্স ফিরে যাবে।', 'Delete this expense? The balance will be restored.'], totalExpenses: ['মোট খরচ', 'Total expenses'],
  profitMinusExpenses: ['মোট লাভ − খরচ', 'Gross profit − expenses'], byCategory: ['ক্যাটাগরি অনুযায়ী', 'By category'], noExpenses: ['কোনো খরচ নেই', 'No expenses'],
  cat_rent: ['দোকান ভাড়া', 'Rent'], cat_electricity: ['বিদ্যুৎ বিল', 'Electricity'], cat_salary: ['বেতন', 'Salary'], cat_transport: ['পরিবহন', 'Transport'], cat_utilities: ['গ্যাস/পানি/ইন্টারনেট', 'Utilities'], cat_repair: ['মেরামত', 'Repair'], cat_food: ['খাবার/নাস্তা', 'Food'], cat_marketing: ['বিজ্ঞাপন', 'Marketing'], cat_tax: ['ট্যাক্স/ফি', 'Tax / Fees'], cat_other: ['অন্যান্য', 'Other'],
  // P&L
  revenue: ['বিক্রয় আয়', 'Revenue'], costOfGoods: ['বিক্রীত পণ্যের ক্রয়মূল্য', 'Cost of goods'], margin: ['মার্জিন {0}%', 'Margin {0}%'], discountsGiven: ['ডিসকাউন্ট', 'Discounts'], period: ['সময়', 'Period'], group_day: ['দিন অনুযায়ী', 'By day'], group_week: ['সপ্তাহ অনুযায়ী', 'By week'], group_month: ['মাস অনুযায়ী', 'By month'],
  pnlNote: ['লাভ হিসাব হয় প্রতিটি পণ্য আসলে যে দামে বিক্রি হয়েছে সেই দাম ও ক্রয়মূল্য দিয়ে — তালিকা মূল্য দিয়ে নয়।', 'Profit uses the actual price each item was sold at and its purchase cost — never the list price.'],
  // users
  inviteUser: ['ব্যবহারকারী ইনভাইট', 'Invite user'], googleEmail: ['Google (Gmail) ইমেইল', 'Google (Gmail) address'], inviteHow: ['ইনভাইট করা ব্যক্তি এই ইমেইল দিয়ে Google সাইন ইন করলে স্বয়ংক্রিয়ভাবে দোকানে যুক্ত হবেন।', 'The invited person joins automatically after signing in with Google using this email.'],
  sendInvite: ['ইনভাইট পাঠান', 'Send invite'], inviteSaved: ['ইনভাইট সংরক্ষিত — এখন ওই ব্যক্তি সাইন ইন করতে পারবেন', 'Invitation saved — the person can now sign in'], ownerAllPerms: ['মালিকের সব অনুমতি আছে এবং তা পরিবর্তন করা যায় না।', 'The owner always has every permission.'],
  applyRoleDefaults: ['ভূমিকার ডিফল্ট অনুমতি দিন', 'Apply role defaults'], removeUser: ['ব্যবহারকারী সরান', 'Remove user'], confirmRemoveUser: ['{0} কে সরিয়ে দেবেন?', 'Remove {0}?'], rulesNote: ['অনুমতিগুলো Firebase সিকিউরিটি রুলস দিয়ে সার্ভারে কার্যকর হয় — শুধু বাটন লুকিয়ে নয়।', 'Permissions are enforced on the server by Firebase security rules — not just by hiding buttons.'],
  teamMembers: ['সদস্য', 'Team members'], pendingInvites: ['অপেক্ষমাণ ইনভাইট', 'Pending invites'], noInvites: ['কোনো ইনভাইট নেই', 'No pending invites'], revoke: ['বাতিল', 'Revoke'], sensitive: ['সংবেদনশীল', 'Sensitive'],
  perm_sell: ['বিক্রি (POS)', 'Sell (POS)'], permd_sell: ['বিক্রি করা ও রশিদ তৈরি', 'Create sales and receipts'], perm_viewAllSales: ['সব বিক্রি দেখা', 'View all sales'], permd_viewAllSales: ['অন্যথায় শুধু নিজের বিক্রি দেখা যাবে', 'Otherwise only their own sales are visible'],
  perm_products: ['পণ্য ম্যানেজ', 'Manage products'], permd_products: ['পণ্য যোগ, এডিট ও মোছা', 'Add, edit and delete products'], perm_viewCost: ['ক্রয়মূল্য দেখা', 'See purchase cost'], permd_viewCost: ['ক্রয়মূল্য ও স্টক ক্রয় দেখা ও এডিট', 'See and edit purchase prices and stock purchases'],
  perm_customers: ['কাস্টমার ও বকেয়া', 'Customers & dues'], permd_customers: ['কাস্টমার তালিকা ও বকেয়া আদায়', 'Customer list and due collection'], perm_expenses: ['খরচ', 'Expenses'], permd_expenses: ['খরচ যোগ ও দেখা', 'Record and view expenses'],
  perm_finance: ['ক্যাশ ও অ্যাকাউন্ট', 'Cash & accounts'], permd_finance: ['ব্যালেন্স, লেনদেন ও রিপোর্ট দেখা', 'See balances, transactions and reports'], perm_profit: ['লাভ-ক্ষতি দেখা', 'See profit & loss'], permd_profit: ['লাভ ও ক্রয়মূল্য ভিত্তিক তথ্য', 'Profit and cost-based figures'],
  perm_backup: ['ব্যাকআপ', 'Backup'], permd_backup: ['ব্যাকআপ ডাউনলোড', 'Download backups'], perm_settings: ['সেটিংস', 'Settings'], permd_settings: ['দোকানের তথ্য ও রশিদ সেটিংস', 'Shop profile and receipt settings'], perm_deleteRecords: ['রেকর্ড মোছা / বাতিল', 'Delete / void records'], permd_deleteRecords: ['বিক্রি বাতিল ও লেনদেন মোছা', 'Void sales and delete entries'],
  // settings
  appearance: ['চেহারা', 'Appearance'], themeMode: ['লাইট / ডার্ক মোড', 'Light / dark mode'], mode_light: ['লাইট', 'Light'], mode_dark: ['ডার্ক', 'Dark'], mode_auto: ['অটো', 'Auto'], themeColor: ['থিম রঙ', 'Theme color'], background: ['ব্যাকগ্রাউন্ড', 'Background'], uploadBackground: ['ব্যাকগ্রাউন্ড ছবি', 'Background image'],
  shopProfile: ['দোকানের তথ্য', 'Shop profile'], uploadLogo: ['লোগো আপলোড', 'Upload logo'], phone: ['ফোন', 'Phone'], currency: ['মুদ্রা', 'Currency'], weekStart: ['সপ্তাহ শুরু', 'Week starts on'], defaultLowStock: ['ডিফল্ট কম-স্টক সীমা', 'Default low-stock level'], allowNegativeStock: ['স্টক শেষ হলেও বিক্রি করতে দিন', 'Allow selling beyond stock'],
  receiptSettings: ['রশিদ সেটিংস', 'Receipt settings'], paperSize: ['কাগজের মাপ', 'Paper size'], showLogo: ['লোগো দেখান', 'Show logo'], showAddress: ['ঠিকানা দেখান', 'Show address'], showPhone: ['ফোন দেখান', 'Show phone'], showCashier: ['ক্যাশিয়ারের নাম দেখান', 'Show cashier'], showDue: ['বাকি দেখান', 'Show due'], receiptFooter: ['রশিদের নিচের লেখা', 'Receipt footer text'],
  backupRestore: ['ব্যাকআপ ও রিস্টোর', 'Backup & restore'], cloudInfo: ['আপনার সব তথ্য স্বয়ংক্রিয়ভাবে Cloud Firestore-এ সংরক্ষিত ও সব ডিভাইসে সিঙ্ক হয়। এখানে অতিরিক্ত ফাইল ব্যাকআপ নিতে পারেন।', 'All your data is saved to Cloud Firestore and synced across devices. You can also keep an extra file backup here.'],
  downloadBackup: ['ব্যাকআপ ডাউনলোড', 'Download backup'], restoreBackup: ['ব্যাকআপ রিস্টোর', 'Restore backup'], restore: ['রিস্টোর', 'Restore'], exportProducts: ['পণ্য CSV', 'Products CSV'], exportCustomers: ['কাস্টমার CSV', 'Customers CSV'], exportSales: ['বিক্রি CSV', 'Sales CSV'],
  backupDone: ['ব্যাকআপ ডাউনলোড হয়েছে', 'Backup downloaded'], backupPartial: ['আংশিক ব্যাকআপ — অনুমতি নেই: {0}', 'Partial backup — no access to: {0}'], restoreWarn: ['"{0}" ({1}) এর ব্যাকআপ রিস্টোর হবে। একই আইডির তথ্য ব্যাকআপের তথ্য দিয়ে বদলে যাবে।', 'Backup of "{0}" ({1}) will be restored. Records with the same id are overwritten.'],
  wipeFirst: ['আগে বর্তমান সব তথ্য মুছুন', 'Delete all current data first'], restoreDone: ['{0}টি রেকর্ড রিস্টোর হয়েছে', '{0} records restored'], repairNote: ['ব্যালেন্স গরমিল মনে হলে লেজার থেকে আবার হিসাব করুন।', 'If a balance looks wrong, recompute it from the full ledger.'], recalcBalances: ['ব্যালেন্স পুনর্গণনা', 'Recalculate balances'],
  confirmRecalc: ['সব লেনদেন থেকে অ্যাকাউন্ট ব্যালেন্স আবার হিসাব হবে। চালিয়ে যাবেন?', 'Account balances will be recomputed from all transactions. Continue?'], recalcDone: ['{0}টি অ্যাকাউন্ট হালনাগাদ', '{0} accounts updated']
};

/* ---------------------------------------------------------------------
   Boot
   --------------------------------------------------------------------- */
async function boot() {
  loadLocalPrefs(); applyPrefs();
  const r = await initFirebase();
  if (r !== 'ok') { hideBoot(); showNoConfig(r); return; }
  if (!NATIVE) { try { await FB.getRedirectResult(FB.auth); } catch (e) { toast(authError(e), 'err'); } }
  FB.onAuthStateChanged(FB.auth, (user) => {
    if (user) {
      if (S.user && S.user.uid === user.uid && S.shopId) { S.user = user; return; }
      S.user = user; resolveAccess();
    } else {
      S.user = null; S.shopId = null; S.shop = null; S.member = null; S.page = null;
      stopAll(); showLogin();
    }
  });
}
boot().catch((e) => { console.error(e); hideBoot(); showFatal(t('errLoadAccount'), String((e && e.message) || e), () => location.reload()); });
