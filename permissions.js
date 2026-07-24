// ── permissions.js ────────────────────────────────────────────
// Perfiles por usuario: resuelve el rol (admin / usuario) y el
// empleado vinculado al correo con el que se inició sesión, oculta
// la UI de administrador para usuarios limitados y muestra el popup
// de bienvenida (días trabajados / restantes / tarea de la semana).
//
// Restricción a NIVEL DE INTERFAZ: el documento único vacaciones/estado
// se sigue guardando entero (ver firebase.js). Esto es adecuado para un
// equipo interno de confianza, pero no impide manipulación vía DevTools.
//
// Depende de globales definidas en otros scripts cargados antes:
//   - db, auth        (firebase.js)
//   - state, dateKey, getDayMarks, weekKeyFor, WEEKLY_TASKS,
//     countVacDays, openModal                     (state.js / calendar.js)
//   - getRotationDoc, computeDefaultAssignments,
//     getOrderedParticipants                       (firebase.js / tareas-semanales.js)

window.isAdmin = undefined;          // se resuelve tras cargar el estado
window.currentEmployee = null;
window._adminEmails = [];
window._welcomeShown = false;

// Lee config/access → admins[] (correos con rol de administrador).
// El resto de correos autorizados son usuarios limitados.
async function readAccessConfig() {
  try {
    const snap = await db.collection('config').doc('access').get();
    const data = snap.exists ? snap.data() : {};
    window._adminEmails = (data.admins || []).map(e => String(e).toLowerCase().trim());
  } catch (e) {
    console.warn('No se pudo leer config/access.admins:', e.message);
    window._adminEmails = [];
  }
}

// Calcula isAdmin y currentEmployee a partir del correo autenticado.
// Requiere que el estado (state.employees) ya esté cargado.
function resolvePermissions() {
  const email = ((window.currentUser && window.currentUser.email) || '').toLowerCase().trim();
  window.isAdmin = !!email && window._adminEmails.includes(email);
  window.currentEmployee = email
    ? (state.employees || []).find(e => (e.email || '').toLowerCase().trim() === email) || null
    : null;
}

// Muestra/oculta la UI de administrador y fija la vista por defecto.
function applyPermissions() {
  const admin = window.isAdmin !== false; // undefined (aún sin resolver) => no restringir
  const setDisp = (id, show) => { const el = document.getElementById(id); if (el) el.style.display = show ? '' : 'none'; };

  // Nav lateral: Resumen, Añadir empleado, Configuración y su etiqueta "Acciones"
  setDisp('nav-dashboard', admin);
  setDisp('nav-add-emp', admin);
  setDisp('nav-settings', admin);
  setDisp('nav-section-acciones', admin);

  // Botones y pestaña marcados como solo-admin en el HTML
  document.querySelectorAll('.js-admin-only').forEach(el => { el.style.display = admin ? '' : 'none'; });

  // Si un usuario limitado está (o va a quedar) en el dashboard, llévalo al Anual
  if (!admin && (window._lastActiveView === 'dashboard' || !window._lastActiveView)) {
    if (window.showView) window.showView('annual');
  }

  // Popup de bienvenida una sola vez por sesión, ya con permisos resueltos
  if (!window._welcomeShown && window.currentUser) {
    window._welcomeShown = true;
    showWelcome();
  }
}
window.resolvePermissions = resolvePermissions;
window.applyPermissions = applyPermissions;
window.readAccessConfig = readAccessConfig;

// ── Cálculos del popup ────────────────────────────────────────
// Días trabajados = días laborables (L–V) ya transcurridos del año,
// menos festivos entre semana, menos las vacaciones tomadas por el
// empleado. No cuenta el día de hoy (aún en curso).
function countWorkedDays(empId, year) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let count = 0;
  const d = new Date(year, 0, 1);
  while (d < today) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
      const off = state.festivos[key] || getDayMarks(key)[empId] === 'V';
      if (!off) count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}
window.countWorkedDays = countWorkedDays;

// Días que faltan para el próximo día marcado como vacaciones ('V') a partir de
// hoy (hoy inclusive = 0), o null si no tiene ninguna vacación programada.
function daysUntilNextVacation(empId) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const keys = Object.keys(state.marks).filter(k => state.marks[k][empId] === 'V').sort();
  for (const k of keys) {
    const [y, m, d] = k.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt >= today) return Math.round((dt - today) / 86400000);
  }
  return null;
}
window.daysUntilNextVacation = daysUntilNextVacation;

// Nombre de la tarea asignada al empleado en la semana actual, o null.
async function getWeekTaskName(empId) {
  const weekKey = weekKeyFor(new Date());
  let assignments = {};
  try {
    const doc = await window.getRotationDoc(weekKey);
    if (doc.exists) {
      Object.entries(doc.assignments || {}).forEach(([idx, id]) => {
        if (id !== null && id !== undefined) assignments[Number(idx)] = id;
      });
    } else if (typeof computeDefaultAssignments === 'function') {
      assignments = computeDefaultAssignments(weekKey, getOrderedParticipants());
    }
  } catch (e) {
    return null;
  }
  const found = Object.entries(assignments).find(([, id]) => id === empId);
  return found ? WEEKLY_TASKS[Number(found[0])] : null;
}

// ── Popup de bienvenida / "Mi resumen" ────────────────────────
function showWelcome() {
  const emp = window.currentEmployee;
  const titleEl = document.getElementById('welcome-title');
  const body = document.getElementById('welcome-body');
  if (!titleEl || !body) return;

  if (!emp) {
    titleEl.textContent = '👋 Bienvenido/a';
    body.innerHTML = `<p style="color:var(--muted);font-size:.9rem;line-height:1.5;">
      Tu cuenta no está vinculada a ningún empleado todavía.
      ${window.isAdmin ? 'Como administrador puedes vincular los correos desde la ficha de cada empleado.' : 'Pídele al administrador que vincule tu correo a tu ficha para ver tu resumen personal.'}
    </p>`;
    openModal('welcome-modal');
    return;
  }

  const y = state.currentYear;
  const worked = countWorkedDays(emp.id, y);
  const nextIn = daysUntilNextVacation(emp.id);
  const remainingDays = emp.totalDays - countVacDays(emp.id, y);

  // Reutiliza las clases .stat-card/.value/.label de las tarjetas KPI de
  // "Resumen" (calendar.js renderStatsBar / styles.css) para que el tamaño y
  // la tipografía coincidan exactamente con el resto de la app, en vez de un
  // estilo propio del popup.
  const statCard = (val, label, suffix, color) => `
    <div class="stat-card" style="padding:12px 10px;">
      <div class="value"${color ? ` style="color:${color};"` : ''}>${val}${suffix ? `<span class="value-suffix">${suffix}</span>` : ''}</div>
      <div class="label">${label}</div>
    </div>`;

  titleEl.textContent = `👋 Hola, ${emp.name}`;
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;">
      ${statCard(worked, 'Días trabajados')}
      ${statCard(nextIn === null ? '—' : nextIn, 'Próxima vacaciones en', nextIn === null ? '' : 'd', 'var(--accent)')}
      ${statCard(remainingDays, 'Vacaciones restantes', 'd', '#4ade80')}
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:12px;padding:14px;">
      <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;">Tarea de esta semana</div>
      <div id="welcome-task-val" style="font-size:1rem;font-weight:600;color:var(--text);">Cargando…</div>
    </div>`;
  openModal('welcome-modal');

  getWeekTaskName(emp.id).then(task => {
    const el = document.getElementById('welcome-task-val');
    if (el) el.textContent = task || 'Sin tarea asignada';
  });
}
window.showWelcome = showWelcome;
