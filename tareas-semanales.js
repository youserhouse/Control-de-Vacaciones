// ── tareas-semanales.js ───────────────────────────────────────
// Vista "Tareas Semanales": rotación de 5 tareas fijas de almacén
// entre un subconjunto de empleados, semana a semana. Datos en
// Firestore (colecciones rotacionSemanal/bajas), fuera del
// documento único vacaciones/estado — ver firebase.js.

let _wtWeekKey = weekKeyFor(new Date()); // lunes de la semana mostrada, no persistido (como _gMonth/_gYear en gantt.js)
let _wtDraftAssignments = {}; // taskIndex (number) -> employeeId, borrador en memoria
let _wtDraftBajas = [];       // employeeIds de baja esta semana, borrador en memoria

function changeWeekTasks(delta) {
  _wtWeekKey = weekKeyAddDays(_wtWeekKey, delta * 7);
  renderWeeklyTasks();
}

async function renderWeeklyTasks() {
  const titleEl = document.getElementById('wt-week-title');
  const dates = weekDatesFor(_wtWeekKey);
  if (titleEl) titleEl.textContent = 'Semana del ' + formatRangeLabel(dates[0], dates[4]);

  const container = document.getElementById('wt-rows');
  if (container) container.innerHTML = '<div class="team-empty">Cargando…</div>';

  const [rotationDoc, bajasDoc] = await Promise.all([
    window.getRotationDoc(_wtWeekKey),
    window.getBajasDoc(_wtWeekKey)
  ]);

  _wtDraftAssignments = {};
  Object.entries(rotationDoc.assignments || {}).forEach(([idx, empId]) => {
    if (empId !== null && empId !== undefined) _wtDraftAssignments[Number(idx)] = empId;
  });
  _wtDraftBajas = (bajasDoc.employeeIds || []).slice();

  renderTaskTable();
}

// Disponibilidad de un empleado para la semana mostrada: vacaciones (lun-vie) o baja manual.
// Los festivos NO descalifican — son de toda la empresa, no una indisponibilidad individual.
function getAvailability(empId) {
  const dates = weekDatesFor(_wtWeekKey);
  for (let i = 0; i < 5; i++) { // lunes a viernes
    if (getDayMarks(dates[i])[empId] === 'V') return { available: false, reason: 'De vacaciones' };
  }
  if (_wtDraftBajas.includes(empId)) return { available: false, reason: 'De baja' };
  return { available: true, reason: null };
}

function taskIndexOf(empId) {
  const found = Object.entries(_wtDraftAssignments).find(([, id]) => id === empId);
  return found ? Number(found[0]) : '';
}

function renderTaskTable() {
  const container = document.getElementById('wt-rows');
  if (!container) return;
  const participants = state.employees.filter(e => e.participatesInRotation);

  if (!participants.length) {
    container.innerHTML = '<div class="team-empty">Nadie participa todavía en la rotación. Usá "Gestionar participantes" para elegir quién.</div>';
    return;
  }

  container.innerHTML = participants.map(emp => {
    const { available, reason } = getAvailability(emp.id);
    const currentTask = taskIndexOf(emp.id);
    const options = [`<option value="" ${currentTask === '' ? 'selected' : ''}>Sin asignar</option>`]
      .concat(WEEKLY_TASKS.map((t, i) => `<option value="${i}" ${currentTask === i ? 'selected' : ''}>${t}</option>`))
      .join('');
    const pill = !available
      ? `<span class="wt-status-pill ${reason === 'De baja' ? 'wt-status-baja' : 'wt-status-vac'}">${reason}</span>`
      : '';
    const bajaLabel = _wtDraftBajas.includes(emp.id) ? 'Quitar baja' : 'Marcar de baja';
    return `
    <div class="gantt-row wt-row">
      <div class="g-emp-col">
        <div class="g-emp-avatar" style="${avatarTintStyle(emp.color)}">${initials(emp.name)}</div>
        <div class="g-emp-info">
          <div class="g-emp-name">${emp.name}</div>
          <div class="g-emp-role">${emp.role || '—'}</div>
        </div>
      </div>
      <div class="wt-row-right">
        ${pill}
        <button class="btn btn-ghost wt-baja-btn" onclick="toggleBaja(${emp.id})">${bajaLabel}</button>
        <select class="wt-task-select" ${available ? '' : 'disabled'} onchange="onTaskChange(${emp.id}, this.value)">
          ${options}
        </select>
      </div>
    </div>`;
  }).join('');
}

function onTaskChange(empId, taskIndexOrEmpty) {
  Object.keys(_wtDraftAssignments).forEach(idx => {
    if (_wtDraftAssignments[idx] === empId) delete _wtDraftAssignments[idx];
  });
  if (taskIndexOrEmpty !== '') {
    _wtDraftAssignments[Number(taskIndexOrEmpty)] = empId;
  }
  renderTaskTable();
}

async function toggleBaja(empId) {
  if (_wtDraftBajas.includes(empId)) {
    _wtDraftBajas = _wtDraftBajas.filter(id => id !== empId);
  } else {
    _wtDraftBajas.push(empId);
    // si tenía una tarea asignada, la libera — no puede quedar "asignado" alguien no disponible
    Object.keys(_wtDraftAssignments).forEach(idx => {
      if (_wtDraftAssignments[idx] === empId) delete _wtDraftAssignments[idx];
    });
  }
  await window.saveBajasDoc(_wtWeekKey, _wtDraftBajas);
  renderTaskTable();
}

// Sugiere una rotación para la semana mostrada: nadie repite la tarea que tuvo
// la semana anterior. Quien sobra (más disponibles que tareas) queda sin
// asignar — no se guarda hasta pulsar "Guardar".
async function suggestRotation() {
  const prevKey = weekKeyAddDays(_wtWeekKey, -7);
  const prevDoc = await window.getRotationDoc(prevKey);
  const prevAssignments = prevDoc.assignments || {};
  const prevTaskOf = {};
  Object.entries(prevAssignments).forEach(([idx, empId]) => {
    if (empId !== null && empId !== undefined) prevTaskOf[empId] = Number(idx);
  });

  const participants = state.employees.filter(e => e.participatesInRotation);
  const available = participants.filter(e => getAvailability(e.id).available).map(e => e.id);

  const taskCount = WEEKLY_TASKS.length;
  const candidatesFor = empId => {
    const forbidden = prevTaskOf[empId];
    const all = [...Array(taskCount).keys()];
    return forbidden === undefined ? all : all.filter(i => i !== forbidden);
  };

  // ordenar por menos candidatos primero, reduce el backtracking
  const people = [...available].sort((a, b) => candidatesFor(a).length - candidatesFor(b).length);
  let assignments = {};
  const usedTasks = new Set();

  function backtrack(i) {
    if (i >= people.length) return true;
    const empId = people[i];
    const candidates = candidatesFor(empId).filter(t => !usedTasks.has(t));
    for (const t of candidates) {
      usedTasks.add(t);
      assignments[t] = empId;
      if (backtrack(i + 1)) return true;
      usedTasks.delete(t);
      delete assignments[t];
    }
    return false;
  }

  const solved = backtrack(0);
  if (!solved) {
    // caso raro: relaja "no repetir" solo para quien lo necesite
    assignments = {};
    usedTasks.clear();
    for (const empId of people) {
      let candidates = candidatesFor(empId).filter(t => !usedTasks.has(t));
      if (!candidates.length) candidates = [...Array(taskCount).keys()].filter(t => !usedTasks.has(t));
      if (!candidates.length) continue; // sobra gente respecto a tareas — queda sin asignar
      const t = candidates[0];
      usedTasks.add(t);
      assignments[t] = empId;
    }
  }

  _wtDraftAssignments = assignments;
  renderTaskTable();
  showToast('✅ Rotación sugerida — revisá y guardá');
}

async function saveWeeklyTasks() {
  await window.saveRotationDoc(_wtWeekKey, _wtDraftAssignments);
  showToast('✅ Rotación guardada');
}

function openParticipantsConfig() {
  const list = document.getElementById('wt-participants-list');
  if (list) {
    list.innerHTML = state.employees.map(emp => `
      <label class="wt-participant-row">
        <input type="checkbox" id="wt-part-${emp.id}" ${emp.participatesInRotation ? 'checked' : ''}>
        <div class="g-emp-avatar" style="width:28px;height:28px;font-size:.7rem;${avatarTintStyle(emp.color)}">${initials(emp.name)}</div>
        <span>${emp.name}</span>
      </label>`).join('');
  }
  openModal('wt-participants-modal');
}

function saveParticipantsConfig() {
  state.employees.forEach(emp => {
    const chk = document.getElementById('wt-part-' + emp.id);
    if (chk) emp.participatesInRotation = chk.checked;
  });
  saveState();
  closeModal('wt-participants-modal');
  showToast('✅ Participantes actualizados');
  // Re-renderiza con el roster nuevo sin re-consultar Firestore — así no se
  // pierde ninguna sugerencia de rotación aún no guardada con "Guardar".
  renderTaskTable();
}
