// ── state.js ──────────────────────────────────────────────────
// Estado global de la aplicación, utilidades y constantes

const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6','#e91e8c','#00bcd4','#ff6b35','#607d8b','#795548','#ffffff','#000000'];
const DEFAULT_ROLES = ['Encargado','Piker'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_SHORT = ['L','M','X','J','V','S','D'];
const WEEKDAYS_FULL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const WEEKLY_TASKS = ['Descarga 1', 'Pedir jaulas y recoger cartones almacén', 'Carga/Embalaje', 'Carga y Desc. 2', 'Correo Gefco'];

const DEFAULT_EMPLOYEES = [
  { id: 1, name: 'Ana',    role: 'Flotante', color: '#e74c3c', totalDays: 28 },
  { id: 2, name: 'Sara',   role: 'Flotante', color: '#3498db', totalDays: 28 },
  { id: 3, name: 'Samuel', role: 'Flotante', color: '#2ecc71', totalDays: 28 },
  { id: 4, name: 'José',   role: 'Flotante', color: '#f39c12', totalDays: 28 },
  { id: 5, name: 'Dani',   role: 'Flotante', color: '#9b59b6', totalDays: 28 },
];

let state = loadState();

function loadState() {
  try {
    const s = localStorage.getItem('vac-app-v3');
    if (s) {
      const p = JSON.parse(s);
      migrateFestivoEmployee(p);
      if (!p.festivos) p.festivos = {};
      if (!p.conflictThreshold) p.conflictThreshold = 2;
      if (!p.conflictThresholdTotal) p.conflictThresholdTotal = 99;
      if (!p.customRoles) p.customRoles = [];
      if (!p.compatibleRoles) p.compatibleRoles = [['Encargado','Piker']];
      if (typeof p.wtAllowVacationAssign !== 'boolean') p.wtAllowVacationAssign = false;
      p.employees.forEach(e => { if (!e.birthday) e.birthday = ''; });
      p.employees.forEach(e => { if (e.participatesInRotation === undefined) e.participatesInRotation = false; });
      let _nextRotOrder = 1 + p.employees.reduce((max, e) =>
        (e.participatesInRotation && typeof e.rotationOrder === 'number') ? Math.max(max, e.rotationOrder) : max, -1);
      p.employees.forEach(e => {
        if (e.participatesInRotation && typeof e.rotationOrder !== 'number') e.rotationOrder = _nextRotOrder++;
      });
      migrateFestivoEmployee(p);
      if (p.theme === 'mecafilter') p.theme = 'forest';
      delete p.activeFilters;
      if (!p.filterEmpId) p.filterEmpId = '';
      return p;
    }
  } catch(e) {}
  return {
    employees: DEFAULT_EMPLOYEES,
    nextId: 6,
    marks: {},
    festivos: {},
    currentYear: 2026,
    selectedColor: COLORS[0],
    filterEmpId: '',
    conflictThreshold: 2,
    conflictThresholdTotal: 99,
    customRoles: [],
    compatibleRoles: [['Encargado','Piker']],
    wtAllowVacationAssign: false,
  };
}

function migrateFestivoEmployee(parsed) {
  if (!parsed.festivos) parsed.festivos = {};
  if (!parsed.employees) return;
  const festEmp = parsed.employees.find(e => e.name.toLowerCase() === 'festivo');
  if (!festEmp) return;
  if (parsed.marks) {
    for (const [key, dayMarks] of Object.entries(parsed.marks)) {
      if (dayMarks[festEmp.id] !== undefined) {
        parsed.festivos[key] = true;
        delete dayMarks[festEmp.id];
        if (!Object.keys(dayMarks).length) delete parsed.marks[key];
      }
    }
  }
  parsed.employees = parsed.employees.filter(e => e.id !== festEmp.id);
}

function saveState() {
  window.state = state;
  localStorage.setItem('vac-app-v3', JSON.stringify(state));
  const d = document.getElementById('firebase-diag');
  if (d) d.style.display = 'block';
  if (window.saveToFirebase) window.saveToFirebase();
}

window.state = state;
window.showView = showView;
window.applyTheme = applyTheme;
window.setTheme = setTheme;

// ── UTILS ─────────────────────────────────────────────────────
function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
function firstDayOfMonth(y,m){ const d=new Date(y,m,1).getDay(); return d===0?6:d-1; }
function isWeekend(y,m,d){ const w=new Date(y,m,d).getDay(); return w===0||w===6; }
function todayKey(){ const t=new Date(); return `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`; }
function dateKey(y,m,d){ return `${y}-${pad(m+1)}-${pad(d)}`; }
function pad(n){ return String(n).padStart(2,'0'); }

// Lunes de la semana que contiene `date` (convención lunes-primero, igual que firstDayOfMonth)
function mondayOfWeek(date) {
  const dow = date.getDay(); // 0=domingo..6=sábado
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + diffToMonday);
  return d;
}
function weekKeyFor(date) {
  const m = mondayOfWeek(date);
  return dateKey(m.getFullYear(), m.getMonth(), m.getDate());
}
function weekKeyAddDays(weekKey, days) {
  const [y,m,d] = weekKey.split('-').map(Number);
  const dt = new Date(y, m-1, d + days);
  return weekKeyFor(dt);
}
function weekDatesFor(weekKey) {
  const [y,m,d] = weekKey.split('-').map(Number);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(y, m-1, d + i);
    out.push(dateKey(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  }
  return out;
}
// Número de semana ISO-8601 (lunes=inicio, semana 1 = la que contiene el primer jueves del año)
function getISOWeekNumber(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayNum = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() + 4 - dayNum); // jueves de esa misma semana
  const yearStart = new Date(d.getFullYear(), 0, 1); // año de `d` ya desplazado (clave en cruce de año)
  const diffDays = Math.round((d - yearStart) / 86400000);
  return Math.ceil((diffDays + 1) / 7);
}
function initials(name){ return name.slice(0,2).toUpperCase(); }
function getDayMarks(key){ return state.marks[key]||{}; }
function isFestivo(key){ return !!state.festivos[key]; }

function getBirthdaysOnKey(key) {
  const parts = key.split('-');
  const md = parts[1] + '-' + parts[2];
  return state.employees.filter(e => {
    if (!e.birthday) return false;
    const bparts = e.birthday.split('-');
    return bparts[1] + '-' + bparts[2] === md;
  });
}

function countVacDays(empId, year) {
  let count = 0;
  for (const [k,v] of Object.entries(state.marks)) {
    if (k.startsWith(String(year)) && v[empId]==='V') count++;
  }
  return count;
}

function countPastVacDays(empId, year) {
  const today = new Date(); today.setHours(0,0,0,0);
  let count = 0;
  for (const [k,v] of Object.entries(state.marks)) {
    if (!k.startsWith(String(year)) || v[empId]!=='V') continue;
    if (new Date(k) < today) count++;
  }
  return count;
}

function countFutureVacDays(empId, year) {
  const today = new Date(); today.setHours(0,0,0,0);
  let count = 0;
  for (const [k,v] of Object.entries(state.marks)) {
    if (!k.startsWith(String(year)) || v[empId]!=='V') continue;
    if (new Date(k) >= today) count++;
  }
  return count;
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2200);
}

function diagMsg(msg, color) {
  const el = document.getElementById('diag-text');
  if (el) { el.textContent = msg; el.style.color = color || '#7070a0'; }
}

function showSync(text) {
  const el = document.getElementById('sync-indicator');
  const txt = document.getElementById('sync-text');
  if (el && txt) { txt.textContent = text; el.style.display = 'flex'; }
}

function hideSync() {
  const el = document.getElementById('sync-indicator');
  if (el) el.style.display = 'none';
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function getTextColorForBg(hex) {
  if (!hex || hex.length < 7) return '#fff';
  const [r,g,b] = hexToRgb(hex);
  const lum = 0.2126*(r/255) + 0.7152*(g/255) + 0.0722*(b/255);
  return lum > 0.45 ? '#000' : '#fff';
}

// Avatar de iniciales: fondo del color del empleado muy tenue (16% alfa)
// y texto en el color sólido — más integrado que un cuadrado sólido.
function avatarTintStyle(color) {
  const isWhite = color === '#ffffff';
  const isBlack = color === '#000000';
  let border = '';
  if (isWhite) border = 'border:1px solid rgba(255,255,255,.35);';
  if (isBlack) border = 'border:1px solid rgba(255,255,255,.18);';
  return `background:${color}28;color:${color};${border}`;
}

// ── THEME ─────────────────────────────────────────────────────
const THEME_ORDER = ['dark', 'light', 'lightForest', 'forest', 'indigo'];
const THEME_INFO = {
  dark:        { name: 'Oscuro Naranja',   accent: '#f5a623', light: false, cls: 'theme-dark' },
  light:       { name: 'Claro',            accent: '#e0821f', light: true,  cls: 'theme-light' },
  lightForest: { name: 'Claro Esmeralda',  accent: '#1f9d63', light: true,  cls: 'theme-light-forest' },
  forest:      { name: 'Esmeralda',        accent: '#34d399', light: false, cls: 'theme-forest' },
  indigo:      { name: 'Índigo',           accent: '#818cf8', light: false, cls: 'theme-indigo' },
};

function setTheme(name) {
  state.theme = name;
  applyTheme();
  saveState();
}

function toggleTheme() {
  const cur = state.theme || 'dark';
  const idx = THEME_ORDER.indexOf(cur);
  setTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
}

function applyTheme() {
  const t = THEME_INFO[state.theme] ? state.theme : 'dark';
  const info = THEME_INFO[t];

  document.body.classList.remove(...Object.values(THEME_INFO).map(i => i.cls), 'base-light', 'base-dark');
  document.body.classList.add(info.cls, info.light ? 'base-light' : 'base-dark');

  const btn = document.getElementById('theme-btn');
  if (btn) {
    const span = btn.querySelector('span');
    const label = 'Tema · ' + info.name;
    if (span) span.textContent = label; else btn.textContent = label;
  }

  THEME_ORDER.forEach(n => {
    const c = document.getElementById('tc-' + THEME_INFO[n].cls.replace('theme-', ''));
    if (c) c.classList.toggle('active', n === t);
  });
}

// ── VIEWS ─────────────────────────────────────────────────────
function showView(v) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-item[id^="nav-"]').forEach(el => el.classList.remove('active'));

  document.getElementById('view-' + v).classList.add('active');

  const idx = ['dashboard', 'annual', 'monthly'].indexOf(v);
  const tabs = document.querySelectorAll('.tab-btn');
  if (tabs[idx]) tabs[idx].classList.add('active');

  const navEl = document.getElementById('nav-' + v);
  if (navEl) navEl.classList.add('active');

  const meta = {
    dashboard:   { title: 'Resumen',              sub: 'Panel general de vacaciones' },
    annual:      { title: 'Calendario Anual',     sub: 'Vista completa del año' },
    monthly:     { title: 'Calendario Mensual',   sub: 'Vista mensual detallada' },
    gantt:       { title: 'Línea de tiempo',      sub: 'Vista Gantt de vacaciones por empleado' },
    weeklytasks: { title: 'Tareas Semanales',     sub: 'Rotación semanal de tareas de almacén' }
  };
  const m = meta[v] || {};
  const pt = document.getElementById('page-title');
  const ps = document.getElementById('page-sub');
  if (pt) pt.textContent = m.title || '';
  if (ps) ps.textContent = m.sub || '';

  const hDash = document.getElementById('header-actions-dashboard');
  const hOther = document.getElementById('header-actions-other');
  if (hDash)  hDash.style.display  = v === 'dashboard' ? 'flex' : 'none';
  if (hOther) hOther.style.display = v === 'dashboard' ? 'none' : 'flex';

  closeSidebar();

  window._lastActiveView = v;

  if (v === 'dashboard')   renderDashboard();
  if (v === 'annual')      renderAnnual();
  if (v === 'monthly')     renderMonthly();
  if (v === 'gantt')       renderGantt();
  if (v === 'weeklytasks') renderWeeklyTasks();
}

// ── SIDEBAR MOBILE ────────────────────────────────────────────
function toggleSidebar() {
  const s = document.getElementById('app-sidebar');
  const o = document.getElementById('sidebar-overlay');
  const isOpen = s && s.classList.contains('open');
  if (isOpen) { closeSidebar(); } else {
    s && s.classList.add('open');
    o && o.classList.add('show');
  }
}

function closeSidebar() {
  const s = document.getElementById('app-sidebar');
  const o = document.getElementById('sidebar-overlay');
  s && s.classList.remove('open');
  o && o.classList.remove('show');
}

// ── MODAL HELPERS ─────────────────────────────────────────────
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.overlay').forEach(o=>o.addEventListener('click',function(e){
    if(e.target===this) this.classList.remove('open');
  }));
});
