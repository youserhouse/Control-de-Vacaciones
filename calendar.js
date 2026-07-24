// ── calendar.js ───────────────────────────────────────────────
// Renderizado de vistas: dashboard, calendario anual y mensual

// ── CONFLICT DETECTION ────────────────────────────────────────
function rolesAreCompatible(roleA, roleB) {
  if (!roleA || !roleB) return false;
  const a = roleA.trim().toLowerCase(), b = roleB.trim().toLowerCase();
  return (state.compatibleRoles || []).some(pair => {
    const p0 = pair[0].toLowerCase(), p1 = pair[1].toLowerCase();
    return (a === p0 && b === p1) || (a === p1 && b === p0);
  });
}

function getConflictDays(year) {
  const conflicts = [];
  const sameRoleThresh = state.conflictThreshold || 2;
  const totalThresh = state.conflictThresholdTotal || 99;

  for (const [key, marks] of Object.entries(state.marks)) {
    if (!key.startsWith(String(year))) continue;
    const vacEmpIds = Object.entries(marks)
      .filter(([,t]) => t === 'V')
      .map(([id]) => Number(id));
    if (!vacEmpIds.length) continue;

    const empObjs = vacEmpIds.map(id => state.employees.find(e => e.id === id)).filter(Boolean);
    const totalConflict = empObjs.length >= totalThresh;

    const roleCount = {};
    empObjs.forEach(e => {
      const r = (e.role||'sin-puesto').trim();
      roleCount[r] = (roleCount[r] || 0) + 1;
    });
    const sameRoleConflict = Object.values(roleCount).some(c => c >= sameRoleThresh) &&
      empObjs.some((ea, i) => empObjs.some((eb, j) => i !== j &&
        !rolesAreCompatible(ea.role||'', eb.role||'') &&
        (ea.role||'') === (eb.role||'')
      ));

    if (totalConflict || sameRoleConflict) {
      conflicts.push({ key, empIds: vacEmpIds });
    }
  }
  return conflicts;
}

function renderConflictBanner(containerId, year) {
  const conflicts = getConflictDays(year);
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!conflicts.length) { el.innerHTML = ''; return; }
  const names = [...new Set(conflicts.flatMap(c => c.empIds))]
    .map(id => state.employees.find(e => e.id === id)?.name).filter(Boolean);
  el.innerHTML = `<div class="conflict-banner">⚠️ <strong>${conflicts.length} día${conflicts.length>1?'s':''} con conflicto</strong> — Coinciden: ${names.join(', ')}</div>`;
}

// ── DASHBOARD ─────────────────────────────────────────────────
let _dashSearchQuery = '';

function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getNextVacationBlock(empId) {
  const todayStr = todayKey();
  const keys = Object.keys(state.marks)
    .filter(k => state.marks[k][empId] === 'V' && k >= todayStr)
    .sort();
  if (!keys.length) return null;
  let start = keys[0], end = keys[0];
  let cursor = keyToDate(start);
  for (let i = 1; i < keys.length; i++) {
    cursor.setDate(cursor.getDate() + 1);
    if (keys[i] === dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())) {
      end = keys[i];
    } else break;
  }
  return { start, end };
}

function formatRangeLabel(startKey, endKey) {
  const s = keyToDate(startKey);
  const sLabel = `${pad(s.getDate())} ${MONTHS[s.getMonth()].slice(0,3)}`;
  if (startKey === endKey) return sLabel;
  const e = keyToDate(endKey);
  return `${sLabel} – ${pad(e.getDate())} ${MONTHS[e.getMonth()].slice(0,3)}`;
}

function renderDashboard() {
  renderStatsBar();
  renderTeamList();
  renderUpcomingPanel();
  renderFestivosPanel();
}

function renderStatsBar() {
  const y = state.currentYear;
  const emps = state.employees;
  const festivosYear = Object.keys(state.festivos).filter(k=>k.startsWith(String(y))&&state.festivos[k]);
  const vacHoy = emps.filter(e => getDayMarks(todayKey())[e.id] === 'V').length;
  const avgUsed = emps.length ? Math.round(emps.reduce((a,e)=>a+countVacDays(e.id,y),0) / emps.length) : 0;

  document.getElementById('stats-bar').innerHTML = `
    <div class="stat-card">
      <div class="stat-card-head">
        <div class="stat-icon" style="background:rgba(74,222,128,.15);">
          <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        </div>
        <span class="stat-badge" style="background:rgba(74,222,128,.15);color:#4ade80;">Activos</span>
      </div>
      <div class="value">${emps.length}</div>
      <div class="label">Empleados</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-head">
        <div class="stat-icon" style="background:var(--accent-dim);">
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
        </div>
        <span class="stat-badge" style="background:var(--accent-dim);color:var(--accent);">Hoy</span>
      </div>
      <div class="value">${vacHoy}</div>
      <div class="label">De vacaciones hoy</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-head">
        <div class="stat-icon" style="background:rgba(129,140,248,.15);">
          <svg viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        </div>
        <span class="stat-badge" style="background:rgba(129,140,248,.15);color:#818cf8;">${y}</span>
      </div>
      <div class="value">${festivosYear.length}</div>
      <div class="label">Festivos nacionales</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-head">
        <div class="stat-icon" style="background:rgba(192,132,252,.15);">
          <svg viewBox="0 0 24 24" fill="none" stroke="#c084fc" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/></svg>
        </div>
        <span class="stat-badge" style="background:rgba(192,132,252,.15);color:#c084fc;">Media</span>
      </div>
      <div class="value">${avgUsed}<span class="value-suffix">d</span></div>
      <div class="label">Días vacaciones usados</div>
    </div>
  `;
}

function renderTeamList() {
  const y = state.currentYear;
  const q = _dashSearchQuery.trim().toLowerCase();
  const emps = state.employees.filter(e => !q || e.name.toLowerCase().includes(q));
  const container = document.getElementById('team-list');
  if (!container) return;
  const sub = document.getElementById('team-list-sub');
  if (sub) sub.textContent = `${state.employees.length} empleados · año ${y}`;

  if (!emps.length) {
    container.innerHTML = '<div class="team-empty">Sin empleados que coincidan con la búsqueda.</div>';
    return;
  }

  container.innerHTML = emps.map(emp => {
    const pastUsed = countPastVacDays(emp.id, y);
    // "Restantes" = vacaciones aún no disfrutadas (no "sin agendar") — un día
    // ya marcado a futuro sigue sin disfrutarse. Misma definición que el popup
    // de bienvenida (permissions.js showWelcome()).
    const restantes = emp.totalDays - pastUsed;
    const pct = Math.min(100, Math.round((pastUsed/emp.totalDays)*100));
    const onVacation = getDayMarks(todayKey())[emp.id] === 'V';
    const rowClick = (window.isAdmin === false) ? '' : ` onclick="openEditEmployee(${emp.id})"`;
    return `
    <div class="team-row"${rowClick}>
      <div class="team-head">
        <div class="team-avatar" style="${avatarTintStyle(emp.color)}">${initials(emp.name)}</div>
        <div class="team-name-wrap">
          <span class="team-name">${emp.name}</span>
          <span class="team-role">${emp.role||'—'}</span>
        </div>
        ${onVacation
          ? `<span class="status-pill status-pill-vac">De vacaciones</span>`
          : `<span class="status-pill status-pill-rest">${restantes} días restantes</span>`
        }
      </div>
      <div class="team-progress-track"><div class="team-progress-fill" style="width:${pct}%;background:${emp.color};"></div></div>
      <div class="team-caption">
        <span>${pastUsed} de ${emp.totalDays} días disfrutados</span>
        <span class="pct">${pct}%</span>
      </div>
    </div>`;
  }).join('');
}

function onDashSearchInput(val) {
  _dashSearchQuery = val;
  renderTeamList();
}

function renderUpcomingPanel() {
  const container = document.getElementById('upcoming-list');
  if (!container) return;
  const rows = state.employees
    .map(emp => {
      const block = getNextVacationBlock(emp.id);
      return block ? { emp, block } : null;
    })
    .filter(Boolean)
    .sort((a,b) => a.block.start.localeCompare(b.block.start));

  if (!rows.length) {
    container.innerHTML = '<div class="team-empty">Sin vacaciones próximas.</div>';
    return;
  }
  container.innerHTML = rows.map(({emp, block}) => {
    return `
    <div class="upcoming-row">
      <div class="team-avatar" style="width:36px;height:36px;${avatarTintStyle(emp.color)}">${initials(emp.name)}</div>
      <div style="flex:1;min-width:0;">
        <div class="upcoming-name">${emp.name}</div>
        <div class="upcoming-range">${formatRangeLabel(block.start, block.end)}</div>
      </div>
      <div class="upcoming-dot" style="background:${emp.color};"></div>
    </div>`;
  }).join('');
}

// ── Festivos oficiales de España / Comunidad de Madrid ─────────
// Fecha de Domingo de Pascua (algoritmo de Meeus/Jones/Butcher),
// usada para derivar Jueves Santo y Viernes Santo de cada año.
function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const month = Math.floor((h + l - 7*m + 114) / 31);
  const day = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Festivos nacionales + de la Comunidad/municipio de Madrid con fecha fija.
// (San Isidro y La Almudena son del Ayuntamiento de Madrid, no de toda
// la comunidad, pero se incluyen porque suelen aplicarse igual en la
// mayoría de calendarios laborales de la capital.)
const MADRID_FIXED_HOLIDAYS = {
  '1-1':   'Año Nuevo',
  '1-6':   'Reyes Magos',
  '5-1':   'Día del Trabajo',
  '5-2':   'Comunidad de Madrid',
  '5-15':  'San Isidro',
  '8-15':  'Asunción de la Virgen',
  '10-12': 'Fiesta Nacional',
  '11-1':  'Todos los Santos',
  '11-9':  'La Almudena',
  '12-6':  'Constitución',
  '12-8':  'Inmaculada Concepción',
  '12-25': 'Navidad',
};

function getMadridHolidayName(year, month, day) {
  const fixed = MADRID_FIXED_HOLIDAYS[`${month}-${day}`];
  if (fixed) return fixed;

  const easter = getEasterSunday(year);
  const holyThu = new Date(easter); holyThu.setDate(easter.getDate() - 3);
  const goodFri = new Date(easter); goodFri.setDate(easter.getDate() - 2);
  if (month === holyThu.getMonth()+1 && day === holyThu.getDate()) return 'Jueves Santo';
  if (month === goodFri.getMonth()+1 && day === goodFri.getDate()) return 'Viernes Santo';

  return null;
}

function renderFestivosPanel() {
  const y = state.currentYear;
  const festivosYear = Object.keys(state.festivos).filter(k=>k.startsWith(String(y))&&state.festivos[k]);
  const yearLabel = document.getElementById('festivos-year-label');
  if (yearLabel) yearLabel.textContent = y;
  const festList = document.getElementById('festivos-list');
  if (!festList) return;
  if (!festivosYear.length) {
    festList.innerHTML = '<span class="no-festivos">Sin festivos marcados. Impórtalos o añádelos desde el calendario.</span>';
    return;
  }
  festList.innerHTML = festivosYear.sort().map(key => {
    const p = key.split('-');
    const yr = parseInt(p[0]), mo = parseInt(p[1]), da = parseInt(p[2]);
    const mon = MONTHS[mo-1].slice(0,3);
    const label = getMadridHolidayName(yr, mo, da) || WEEKDAYS_FULL[keyToDate(key).getDay()];
    return `
    <div class="festivo-row">
      <div class="festivo-date-badge">
        <span class="fd-day">${da}</span>
        <span class="fd-mon">${mon}</span>
      </div>
      <span class="festivo-name">${label}</span>
      <button class="festivo-del" onclick="removeFestivo('${key}')" title="Eliminar">×</button>
    </div>`;
  }).join('');
}

function removeFestivo(key) {
  delete state.festivos[key];
  saveState();
  renderFestivosPanel();
  renderStatsBar();
  showToast('🗑 Festivo eliminado');
}

// ── ANNUAL ────────────────────────────────────────────────────
function renderAnnual() {
  const y = state.currentYear;
  document.getElementById('year-label').textContent = y;
  renderEmpFilterSelect('annual-filter-select');
  renderConflictBanner('annual-conflict-banner', y);
  const conflictKeys = new Set(getConflictDays(y).map(c=>c.key));
  const grid = document.getElementById('annual-grid');
  grid.innerHTML = '';

  for (let m=0; m<12; m++) {
    const block = document.createElement('div');
    block.className = 'month-block';
    const days=daysInMonth(y,m), first=firstDayOfMonth(y,m);
    let html = `<div class="month-name">${MONTHS[m]}</div><div class="month-days">`;
    DAYS_SHORT.forEach(d=>html+=`<div class="day-header">${d}</div>`);
    for(let i=0;i<first;i++) html+=`<div class="day-cell empty"></div>`;

    for(let d=1;d<=days;d++){
      const key=dateKey(y,m,d);
      const marks=getDayMarks(key);
      const festivo=isFestivo(key);
      const isConflict = conflictKeys.has(key);
      const markedEmps=Object.keys(marks).map(Number).filter(id=>{
        if(!state.filterEmpId) return true;
        return String(id)===String(state.filterEmpId);
      });
      const weekend=isWeekend(y,m,d), isToday=key===todayKey();
      let cellStyle='', cls='day-cell';
      if(weekend) cls+=' weekend';
      if(isToday) cls+=' today';
      if(festivo) cls+=' is-festivo';
      if(isConflict) cls+=' conflict';
      let dotsHtml='';
      if(markedEmps.length===1){
        const emp=state.employees.find(e=>e.id===markedEmps[0]);
        if(emp){ cls+=' marked'; cellStyle=avatarTintStyle(emp.color); }
      } else if(markedEmps.length>1){
        cls+=' multi-marked';
        dotsHtml=`<div class="day-dots">${markedEmps.slice(0,4).map(id=>{
          const emp=state.employees.find(e=>e.id===id);
          return emp?`<div class="day-dot" style="background:${emp.color}"></div>`:'';
        }).join('')}</div>`;
      }
      const fCorner=festivo?`<div class="festivo-corner"></div>`:'';
      const conflictIcon=isConflict?`<div class="conflict-icon-annual">⚠️</div>`:'';
      const birthdays=getBirthdaysOnKey(key);
      const bdCorner=birthdays.length?`<div class="birthday-corner">🎂</div>`:'';
      const title=birthdays.length?`title="🎂 ${birthdays.map(e=>e.name).join(', ')}"`:isConflict?`title="⚠️ Conflicto"`:'';
      html+=`<div class="${cls}" style="${cellStyle}" onclick="openDayModal('${key}')" ${title}>${d}${dotsHtml}${fCorner}${conflictIcon}${bdCorner}</div>`;
    }
    html+='</div>';
    block.innerHTML=html;
    grid.appendChild(block);
  }
}

// ── EMPLOYEE FILTER (Anual + Mensual) ──────────────────────────
function renderEmpFilterSelect(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
    <select onchange="onFilterEmpChange(this.value)">
      <option value="">Empleados</option>
      ${state.employees.map(e => `<option value="${e.id}" ${String(state.filterEmpId)===String(e.id)?'selected':''}>${e.name}</option>`).join('')}
    </select>
    <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
  `;
}

function onFilterEmpChange(val) {
  state.filterEmpId = val;
  const activeView = document.querySelector('.view.active');
  const v = activeView ? activeView.id.replace('view-','') : 'annual';
  if (v === 'monthly') renderMonthly(); else renderAnnual();
}

function changeYear(delta) {
  state.currentYear+=delta; saveState(); renderAnnual();
}

// ── MONTHLY ───────────────────────────────────────────────────
// Navegación mes a mes con flechas ‹ › — mismo patrón que Gantt (gantt.js
// _gMonth/_gYear + changeGanttMonth), en vez de los <select> de mes/año.
let _moMonth = new Date().getMonth();
let _moYear  = new Date().getFullYear();

function changeMonthlyMonth(delta) {
  _moMonth += delta;
  if (_moMonth < 0)  { _moMonth = 11; _moYear--; }
  if (_moMonth > 11) { _moMonth = 0;  _moYear++; }
  renderMonthly();
}

function renderMonthly() {
  renderEmpFilterSelect('monthly-filter-select');
  const m=_moMonth, y=_moYear;
  const titleEl=document.getElementById('monthly-title');
  if(titleEl) titleEl.textContent=`${MONTHS[m]} ${y}`;
  const conflictKeys = new Set(getConflictDays(y).map(c=>c.key));
  const days=daysInMonth(y,m), first=firstDayOfMonth(y,m);
  let html=`<div class="monthly-header">`;
  DAYS_SHORT.forEach(d=>html+=`<div>${d}</div>`);
  html+=`</div><div class="monthly-grid">`;
  for(let i=0;i<first;i++) html+=`<div class="monthly-day empty"></div>`;
  for(let d=1;d<=days;d++){
    const key=dateKey(y,m,d), marks=getDayMarks(key), festivo=isFestivo(key);
    const isConflict = conflictKeys.has(key);
    const weekend=isWeekend(y,m,d), isToday=key===todayKey();
    let cls='monthly-day';
    if(weekend) cls+=' weekend';
    if(isToday) cls+=' today';
    if(festivo) cls+=' is-festivo';
    if(isConflict) cls+=' conflict';
    const festivoHtml=festivo?`<div class="festivo-label">🎌 Festivo</div>`:'';
    const conflictHtml=isConflict?`<div class="conflict-label-monthly">⚠️ Conflicto de turno</div>`:'';
    const birthdays=getBirthdaysOnKey(key);
    const bdHtml=birthdays.map(e=>`<span class="monthly-birthday-badge">🎂 Cumple ${e.name}</span>`).join('');
    const badges=Object.entries(marks)
      .filter(([id])=> !state.filterEmpId || String(id)===String(state.filterEmpId))
      .map(([id,type])=>{
        const emp=state.employees.find(e=>e.id===Number(id));
        if(!emp) return '';
        return `<span class="emp-badge" style="${avatarTintStyle(emp.color)}">${emp.name}${type==='O'?' ✱':''}</span>`;
      }).join('');
    html+=`<div class="${cls}" onclick="openDayModal('${key}')">
      <div class="day-num">${d}</div>${festivoHtml}${conflictHtml}${bdHtml}
      <div class="day-emp-badges">${badges}</div>
    </div>`;
  }
  html+='</div>';
  document.getElementById('monthly-calendar').innerHTML=html;
}

// ── DAY MODAL ─────────────────────────────────────────────────
let currentDayKey=null;

function openDayModal(key) {
  currentDayKey=key;
  const marks=getDayMarks(key), festivo=isFestivo(key);
  const p=key.split('-');
  document.getElementById('day-modal-title').textContent=`📅 ${parseInt(p[2])} de ${MONTHS[parseInt(p[1])-1]} ${p[0]}`;
  const chkF=document.getElementById('chk-festivo');
  chkF.checked=festivo;
  document.getElementById('festivo-toggle').classList.toggle('active',festivo);
  // El toggle de festivo es solo para administradores
  document.getElementById('festivo-toggle').style.display = (window.isAdmin === false) ? 'none' : '';
  // Un usuario limitado solo puede editar SU propia fila; ve las demás en solo lectura.
  const canEdit = (empId) => window.isAdmin !== false || (window.currentEmployee && window.currentEmployee.id === empId);
  document.getElementById('day-modal-emps').innerHTML=state.employees.map(emp=>{
    const marked=marks[emp.id], type=marked||'V';
    const editable=canEdit(emp.id);
    const ro=editable?'':'disabled';
    const rowClick=editable?` onclick="toggleDayRow(${emp.id})"`:'';
    const chkClick=editable?`onclick="event.stopPropagation();toggleDayRow(${emp.id})"`:'onclick="event.stopPropagation()"';
    return `<div class="day-emp-row ${marked?'selected':''}" id="row-${emp.id}"${rowClick} style="${editable?'':'opacity:.55'}">
      <input type="checkbox" id="chk-${emp.id}" ${marked?'checked':''} ${ro} ${chkClick}>
      <div class="emp-dot-sm" style="background:${emp.color}"></div>
      <span style="font-size:.83rem;font-weight:600">${emp.name}</span>
      <select class="day-emp-type" id="type-${emp.id}" ${ro} onclick="event.stopPropagation()">
        <option value="V" ${type==='V'?'selected':''}>Vacaciones</option>
        <option value="O" ${type==='O'?'selected':''}>Otros</option>
      </select>
    </div>`;
  }).join('');
  openModal('day-modal');
}

function toggleFestivo() {
  const chk=document.getElementById('chk-festivo');
  chk.checked=!chk.checked;
  document.getElementById('festivo-toggle').classList.toggle('active',chk.checked);
}

function toggleDayRow(empId) {
  const chk=document.getElementById('chk-'+empId), row=document.getElementById('row-'+empId);
  chk.checked=!chk.checked;
  row.classList.toggle('selected',chk.checked);
}

function saveDayMarks() {
  const isUser = window.isAdmin === false;
  // El festivo solo lo cambia un administrador
  if(!isUser){
    if(document.getElementById('chk-festivo').checked) state.festivos[currentDayKey]=true;
    else delete state.festivos[currentDayKey];
  }
  let marks;
  if(isUser){
    // Usuario limitado: parte de las marcas existentes y toca SOLO su fila —
    // así no borra las vacaciones de los demás (el doc se guarda entero).
    marks={...getDayMarks(currentDayKey)};
    const emp=window.currentEmployee;
    if(emp){
      const chk=document.getElementById('chk-'+emp.id);
      const typeEl=document.getElementById('type-'+emp.id);
      if(chk&&chk.checked&&typeEl) marks[emp.id]=typeEl.value;
      else delete marks[emp.id];
    }
  } else {
    marks={};
    state.employees.forEach(emp=>{
      const chk=document.getElementById('chk-'+emp.id);
      const typeEl=document.getElementById('type-'+emp.id);
      if(chk&&chk.checked&&typeEl) marks[emp.id]=typeEl.value;
    });
  }
  if(Object.keys(marks).length) state.marks[currentDayKey]=marks;
  else delete state.marks[currentDayKey];
  saveState();
  closeModal('day-modal');
  showToast('✅ Guardado');
  const idx=[...document.querySelectorAll('.tab-btn')].findIndex(b=>b.classList.contains('active'));
  showView(['dashboard','annual','monthly'][idx] || window._lastActiveView || 'annual');
}
