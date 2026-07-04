// ── gantt.js ──────────────────────────────────────────────────
// Vista Gantt — Wallchart mensual: empleados × días del mes

let _gMonth = new Date().getMonth(); // 0-based, inicializa al mes actual
let _gYear  = new Date().getFullYear();

// Abreviaturas de día (índice DOM: 0=domingo)
const DAY_LETTER = ['D','L','M','X','J','V','S'];

function changeGanttMonth(delta) {
  _gMonth += delta;
  if (_gMonth < 0)  { _gMonth = 11; _gYear--; }
  if (_gMonth > 11) { _gMonth = 0;  _gYear++; }
  renderGantt();
}

function renderGantt() {
  const y    = _gYear;
  const m    = _gMonth;
  const days = daysInMonth(y, m);
  const today = new Date();
  const isThisMo = today.getFullYear() === y && today.getMonth() === m;

  // Título mes + año
  const titleEl = document.getElementById('gantt-month-title');
  if (titleEl) titleEl.textContent = `${MONTHS[m]} ${y}`;

  // ── Cabecera de días ─────────────────────────────────────
  let hdrHtml = '';
  for (let d = 1; d <= days; d++) {
    const dow    = new Date(y, m, d).getDay();
    const letter = DAY_LETTER[dow];
    const isWknd  = dow === 0 || dow === 6;
    const isToday = isThisMo && d === today.getDate();
    let cls = 'g-dhdr';
    if (isWknd)  cls += ' g-dhdr-wknd';
    if (isToday) cls += ' g-dhdr-today';
    hdrHtml += `<div class="${cls}">
      <span class="g-dletter">${letter}</span>
      <span class="g-dnum">${d}</span>
    </div>`;
  }
  const hdrEl = document.getElementById('gantt-days-hdr');
  if (hdrEl) hdrEl.innerHTML = hdrHtml;

  // ── Filas de empleados ───────────────────────────────────
  const emps = state.employees;
  let rowsHtml = '';

  if (!emps.length) {
    rowsHtml = `<div class="gantt-empty">No hay empleados. Añade uno desde el menú.</div>`;
  } else {
    emps.forEach(emp => {
      const tc   = getTextColorForBg(emp.color);
      const used = countVacDays(emp.id, y);
      const left = emp.totalDays - used;

      let cellsHtml = '';
      for (let d = 1; d <= days; d++) {
        const key     = dateKey(y, m, d);
        const dow     = new Date(y, m, d).getDay();
        const isWknd  = dow === 0 || dow === 6;
        const isFest  = isFestivo(key);
        const marks   = getDayMarks(key);
        const vtype   = marks[emp.id];          // 'V', 'O' o undefined
        const isToday = isThisMo && d === today.getDate();

        let cls = 'g-cell';
        if (isWknd)  cls += ' g-cell-wknd';
        if (isFest)  cls += ' g-cell-fest';
        if (isToday) cls += ' g-cell-today';

        if (vtype === 'V') {
          cls += ' g-cell-vac';
          cellsHtml += `<div class="${cls}" style="background:${emp.color};" onclick="openDayModal('${key}')" title="Vacaciones · ${key}">
            <span class="g-vac-icon" style="color:${tc}">✈</span>
          </div>`;
        } else if (vtype === 'O') {
          cls += ' g-cell-other';
          cellsHtml += `<div class="${cls}" style="background:${emp.color}22;border-top:3px solid ${emp.color};" onclick="openDayModal('${key}')" title="Otro · ${key}"></div>`;
        } else {
          cellsHtml += `<div class="${cls}" onclick="openDayModal('${key}')">
            <span class="g-cell-num">${d}</span>
          </div>`;
        }
      }

      rowsHtml += `
      <div class="gantt-row">
        <div class="g-emp-col">
          <div class="g-emp-avatar" style="${avatarTintStyle(emp.color)}">${initials(emp.name)}</div>
          <div class="g-emp-info">
            <div class="g-emp-name">${emp.name}</div>
            <div class="g-emp-role">${emp.role || '—'}</div>
          </div>
          <div class="g-emp-badge" style="background:${emp.color};color:${tc}" title="${left} días restantes">${left}</div>
        </div>
        <div class="g-days-col">${cellsHtml}</div>
      </div>`;
    });
  }

  document.getElementById('gantt-rows').innerHTML = rowsHtml;
}
