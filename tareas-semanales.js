// ── tareas-semanales.js ───────────────────────────────────────
// Vista "Tareas Semanales": rotación de 5 tareas fijas de almacén
// entre un subconjunto de empleados, semana a semana. Datos en
// Firestore (colecciones rotacionSemanal/bajas), fuera del
// documento único vacaciones/estado — ver firebase.js.
//
// El reparto por defecto sigue el ciclo real del almacén: cada
// semana la tarea de cada operario avanza una posición fija, y a
// la sexta semana se repite igual que la primera — ver
// computeDefaultAssignments().

let _wtWeekKey = weekKeyFor(new Date()); // lunes de la semana mostrada, no persistido (como _gMonth/_gYear en gantt.js)
let _wtDraftAssignments = {}; // taskIndex (number) -> employeeId, borrador en memoria
let _wtDraftBajas = [];       // employeeIds de baja esta semana, borrador en memoria
let _wtOrderDraft = [];       // employeeIds en orden de rotación, borrador mientras el modal está abierto

function getOrderedParticipants() {
  return state.employees
    .filter(e => e.participatesInRotation)
    .sort((a, b) => (a.rotationOrder ?? 999) - (b.rotationOrder ?? 999));
}

function changeWeekTasks(delta) {
  _wtWeekKey = weekKeyAddDays(_wtWeekKey, delta * 7);
  renderWeeklyTasks();
}

function renderTheadOnce() {
  const thead = document.getElementById('wt-thead');
  if (!thead || thead.childElementCount) return; // solo se construye una vez, las tareas son fijas
  thead.innerHTML = `<tr>
    <th class="wt-th-emp">Operario</th>
    ${WEEKLY_TASKS.map((t, i) => `<th><span class="wt-th-full">${t}</span><span class="wt-th-short">${i + 1}</span></th>`).join('')}
  </tr>`;
}

// Referencia "1 = Descarga 1 · 2 = ..." — solo visible en móvil angosto, donde
// las columnas de tarea muestran el número en vez del nombre completo.
function renderLegendOnce() {
  const el = document.getElementById('wt-legend');
  if (!el || el.childElementCount) return;
  el.innerHTML = WEEKLY_TASKS.map((t, i) => `<span class="wt-legend-item"><strong>${i + 1}</strong> ${t}</span>`).join('');
}

async function renderWeeklyTasks() {
  renderTheadOnce();
  renderLegendOnce();

  const titleEl = document.getElementById('wt-week-title');
  const dates = weekDatesFor(_wtWeekKey);
  const isoWeek = getISOWeekNumber(keyToDate(_wtWeekKey));
  if (titleEl) titleEl.textContent = `Semana ${isoWeek} · ${formatRangeLabel(dates[0], dates[4])}`;

  const container = document.getElementById('wt-rows');
  if (container) container.innerHTML = '<tr><td class="team-empty" colspan="6">Cargando…</td></tr>';

  const [rotationDoc, bajasDoc] = await Promise.all([
    window.getRotationDoc(_wtWeekKey),
    window.getBajasDoc(_wtWeekKey)
  ]);

  _wtDraftBajas = (bajasDoc.employeeIds || []).slice();

  if (rotationDoc.exists) {
    _wtDraftAssignments = {};
    Object.entries(rotationDoc.assignments || {}).forEach(([idx, empId]) => {
      if (empId !== null && empId !== undefined) _wtDraftAssignments[Number(idx)] = empId;
    });
  } else {
    // nadie guardó nunca una rotación para esta semana — autocompleta con el ciclo real
    _wtDraftAssignments = computeDefaultAssignments(_wtWeekKey, getOrderedParticipants());
  }

  renderTaskTable();
}

// Disponibilidad de un empleado para la semana mostrada: vacaciones (lun-vie) o baja manual.
// Los festivos NO descalifican — son de toda la empresa, no una indisponibilidad individual.
// Vacaciones se puede permitir igual (state.wtAllowVacationAssign, interruptor en
// "Gestionar participantes") — en ese caso sigue siendo "reason" para mostrar el
// aviso, pero available:true para no bloquear la celda. La baja manual siempre bloquea.
function getAvailability(empId) {
  const dates = weekDatesFor(_wtWeekKey);
  let onVacation = false;
  for (let i = 0; i < 5; i++) { // lunes a viernes
    if (getDayMarks(dates[i])[empId] === 'V') { onVacation = true; break; }
  }
  if (onVacation && !state.wtAllowVacationAssign) return { available: false, reason: 'De vacaciones' };
  if (_wtDraftBajas.includes(empId)) return { available: false, reason: 'De baja' };
  if (onVacation) return { available: true, reason: 'De vacaciones' };
  return { available: true, reason: null };
}

function taskIndexOf(empId) {
  const found = Object.entries(_wtDraftAssignments).find(([, id]) => id === empId);
  return found ? Number(found[0]) : '';
}

// Ciclo real: tarea = (orden del operario + semana ISO) mod 5 — reproduce la
// planilla física exactamente. Quien no está disponible esa semana no se
// autoasigna; si sobran participantes respecto a las 5 tareas (más de 5
// activos, u órdenes no contiguos), el de menor orden se queda la celda y el
// resto queda sin asignar esa semana — no se dobla nadie en una tarea.
function computeDefaultAssignments(weekKey, participants) {
  const isoWeek = getISOWeekNumber(keyToDate(weekKey));
  const n = WEEKLY_TASKS.length;
  const assignments = {};
  participants
    .filter(emp => getAvailability(emp.id).available)
    .forEach(emp => {
      const r = emp.rotationOrder ?? 0;
      const taskIndex = ((r + isoWeek) % n + n) % n;
      if (assignments[taskIndex] === undefined) assignments[taskIndex] = emp.id;
    });
  return assignments;
}

function renderTaskTable() {
  const container = document.getElementById('wt-rows');
  if (!container) return;
  const participants = getOrderedParticipants();

  if (!participants.length) {
    container.innerHTML = '<tr><td class="team-empty" colspan="6">Nadie participa todavía en la rotación. Usá "Gestionar participantes" para elegir quién.</td></tr>';
    return;
  }

  container.innerHTML = participants.map(emp => {
    const { available, reason } = getAvailability(emp.id);
    const currentTask = taskIndexOf(emp.id);
    const pill = reason
      ? `<span class="wt-status-pill ${reason === 'De baja' ? 'wt-status-baja' : 'wt-status-vac'}">${reason}</span>`
      : '';
    const bajaActive = _wtDraftBajas.includes(emp.id);
    const bajaTitle = bajaActive ? 'Quitar baja' : 'Marcar de baja';

    const cells = WEEKLY_TASKS.map((_, taskIdx) => {
      const active = currentTask === taskIdx;
      const classes = ['wt-cell', active ? 'wt-cell-active' : '', !available ? 'wt-cell-disabled' : ''].filter(Boolean).join(' ');
      const onclick = available ? ` onclick="onCellClick(${emp.id}, ${taskIdx})"` : '';
      return `<td class="${classes}"${onclick}>${active ? '<span class="wt-check">✓</span>' : ''}</td>`;
    }).join('');

    return `
    <tr class="wt-grid-row ${!available ? 'wt-row-unavailable' : ''}">
      <td class="wt-td-emp">
        <div class="g-emp-avatar" style="${avatarTintStyle(emp.color)}">${initials(emp.name)}</div>
        <div class="g-emp-info">
          <div class="g-emp-name">${emp.name}</div>
          <div class="g-emp-role">${emp.role || '—'}${pill}</div>
        </div>
        <button class="wt-baja-icon-btn ${bajaActive ? 'is-active' : ''}" title="${bajaTitle}" onclick="toggleBaja(${emp.id})">⛔</button>
      </td>
      ${cells}
    </tr>`;
  }).join('');
}

// Clic en celda: "roba" la tarea (se libera cualquier índice que ese empleado
// tuviera antes de asignar la nueva — quien la tenía queda "sin asignar" en el
// próximo render, vía taskIndexOf). Clic sobre la celda ya activa: se desmarca.
function onCellClick(empId, taskIndex) {
  const current = taskIndexOf(empId);
  Object.keys(_wtDraftAssignments).forEach(idx => {
    if (_wtDraftAssignments[idx] === empId) delete _wtDraftAssignments[idx];
  });
  if (current !== taskIndex) {
    _wtDraftAssignments[taskIndex] = empId;
  }
  renderTaskTable();
}

async function toggleBaja(empId) {
  const wasBaja = _wtDraftBajas.includes(empId);
  const prevBajas = _wtDraftBajas.slice();
  const prevAssignments = { ..._wtDraftAssignments };
  if (wasBaja) {
    _wtDraftBajas = _wtDraftBajas.filter(id => id !== empId);
  } else {
    _wtDraftBajas.push(empId);
    // si tenía una tarea asignada, la libera — no puede quedar "asignado" alguien no disponible
    Object.keys(_wtDraftAssignments).forEach(idx => {
      if (_wtDraftAssignments[idx] === empId) delete _wtDraftAssignments[idx];
    });
  }
  try {
    await window.saveBajasDoc(_wtWeekKey, _wtDraftBajas);
  } catch(e) {
    _wtDraftBajas = prevBajas;
    _wtDraftAssignments = prevAssignments;
    showToast('❌ No se pudo guardar: ' + e.message);
  }
  renderTaskTable();
}

function suggestRotation() {
  _wtDraftAssignments = computeDefaultAssignments(_wtWeekKey, getOrderedParticipants());
  renderTaskTable();
  showToast('✅ Rotación recalculada — revisá y guardá');
}

async function saveWeeklyTasks() {
  const btn = document.getElementById('wt-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    await window.saveRotationDoc(_wtWeekKey, _wtDraftAssignments);
    showToast('✅ Rotación guardada');
  } catch(e) {
    showToast('❌ No se pudo guardar: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

function openParticipantsConfig() {
  const list = document.getElementById('wt-participants-list');
  if (list) {
    list.innerHTML = state.employees.map(emp => `
      <label class="wt-participant-row">
        <div class="g-emp-avatar" style="width:28px;height:28px;font-size:.7rem;${avatarTintStyle(emp.color)}">${initials(emp.name)}</div>
        <span class="wt-participant-name">${emp.name}</span>
        <input type="checkbox" id="wt-part-${emp.id}" ${emp.participatesInRotation ? 'checked' : ''} onchange="onParticipantToggle(${emp.id}, this.checked)">
      </label>`).join('');
  }
  _wtOrderDraft = getOrderedParticipants().map(e => e.id);
  renderOrderList();
  const allowVac = document.getElementById('wt-allow-vacation-assign');
  if (allowVac) allowVac.checked = !!state.wtAllowVacationAssign;
  openModal('wt-participants-modal');
}

function onParticipantToggle(empId, checked) {
  if (checked && !_wtOrderDraft.includes(empId)) _wtOrderDraft.push(empId);
  if (!checked) _wtOrderDraft = _wtOrderDraft.filter(id => id !== empId);
  renderOrderList();
}

function renderOrderList() {
  const list = document.getElementById('wt-order-list');
  if (!list) return;
  if (!_wtOrderDraft.length) {
    list.innerHTML = '<div class="team-empty">Marcá participantes arriba para ordenarlos.</div>';
    return;
  }
  list.innerHTML = _wtOrderDraft.map((empId, idx) => {
    const emp = state.employees.find(e => e.id === empId);
    if (!emp) return '';
    return `
    <div class="wt-order-row">
      <span class="wt-order-badge">${idx + 1}.</span>
      <div class="g-emp-avatar" style="width:26px;height:26px;font-size:.66rem;${avatarTintStyle(emp.color)}">${initials(emp.name)}</div>
      <span class="wt-order-name">${emp.name}</span>
      <button class="wt-order-btn" ${idx === 0 ? 'disabled' : ''} onclick="moveParticipant(${empId}, -1)">↑</button>
      <button class="wt-order-btn" ${idx === _wtOrderDraft.length - 1 ? 'disabled' : ''} onclick="moveParticipant(${empId}, 1)">↓</button>
    </div>`;
  }).join('');
}

function moveParticipant(empId, dir) {
  const i = _wtOrderDraft.indexOf(empId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= _wtOrderDraft.length) return;
  [_wtOrderDraft[i], _wtOrderDraft[j]] = [_wtOrderDraft[j], _wtOrderDraft[i]];
  renderOrderList();
}

function saveParticipantsConfig() {
  state.employees.forEach(emp => {
    const chk = document.getElementById('wt-part-' + emp.id);
    if (chk) emp.participatesInRotation = chk.checked;
  });
  _wtOrderDraft.forEach((empId, idx) => {
    const emp = state.employees.find(e => e.id === empId);
    if (emp) emp.rotationOrder = idx;
  });
  const allowVac = document.getElementById('wt-allow-vacation-assign');
  if (allowVac) state.wtAllowVacationAssign = allowVac.checked;
  saveState();
  closeModal('wt-participants-modal');
  showToast('✅ Participantes actualizados');
  // Re-renderiza con el roster nuevo sin re-consultar Firestore — así no se
  // pierde ninguna sugerencia de rotación aún no guardada con "Guardar".
  renderTaskTable();
}
