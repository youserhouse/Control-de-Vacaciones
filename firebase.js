// ── firebase.js ───────────────────────────────────────────────
// Inicialización de Firebase y sincronización con Firestore
//
// SEGURIDAD: firebaseConfig se carga desde firebase-config.js
// (compartido con login.html y splash.html). La protección real
// está en:
//   1. Google Cloud Console → API Key restringida a tu dominio
//   2. Firebase Console → Firestore → Reglas de seguridad
// ─────────────────────────────────────────────────────────────

try {
  firebase.initializeApp(window.firebaseConfig);
  diagMsg('✅ Firebase SDK cargado', '#4ade80');
} catch(e) {
  diagMsg('❌ Error SDK: ' + e.message, '#ff6666');
}

const db = firebase.firestore();
const auth = firebase.auth();
const DOC_REF = db.collection('vacaciones').doc('estado');
let isSyncing = false;
window.currentUser = null;

// Carga keys privadas desde Firestore → collection "config" → doc "secrets"
// Ejemplo: const key = await loadSecret('openai_key');
async function loadSecret(fieldName) {
  try {
    const snap = await db.collection('config').doc('secrets').get();
    if (snap.exists) {
      const val = snap.data()[fieldName];
      if (val) return val;
    }
    console.warn(`⚠️ Secret "${fieldName}" no encontrado en Firestore config/secrets`);
    return null;
  } catch(e) {
    console.warn(`⚠️ No se pudo leer secret "${fieldName}":`, e.message);
    return null;
  }
}
window.loadSecret = loadSecret;

// ── TAREAS SEMANALES (rotación + bajas) ─────────────────────────
// Colecciones nuevas e independientes del documento único `vacaciones/estado`:
// se leen/escriben por semana bajo demanda (sin listener en tiempo real —
// baja concurrencia, no necesita la sincronía instantánea que sí necesita
// el calendario de vacaciones).
const _rotationCache = {};
const _bajasCache = {};

async function getRotationDoc(weekKey) {
  if (_rotationCache[weekKey]) return _rotationCache[weekKey];
  try {
    const snap = await db.collection('rotacionSemanal').doc(weekKey).get();
    const data = snap.exists ? snap.data() : { weekKey, assignments: {} };
    if (!data.assignments) data.assignments = {};
    data.exists = snap.exists; // distingue "nunca se guardó" de "se guardó vacío"
    _rotationCache[weekKey] = data;
    return data;
  } catch(e) {
    console.warn('No se pudo leer rotacionSemanal/' + weekKey, e.message);
    return { weekKey, assignments: {}, exists: false };
  }
}

async function saveRotationDoc(weekKey, assignments) {
  const toSave = {
    weekKey,
    assignments,
    updatedAt: new Date().toISOString(),
    updatedBy: (window.currentUser && window.currentUser.email) || null
  };
  await db.collection('rotacionSemanal').doc(weekKey).set(toSave);
  _rotationCache[weekKey] = { ...toSave, exists: true };
  return _rotationCache[weekKey];
}

async function getBajasDoc(weekKey) {
  if (_bajasCache[weekKey]) return _bajasCache[weekKey];
  try {
    const snap = await db.collection('bajas').doc(weekKey).get();
    const data = snap.exists ? snap.data() : { weekKey, employeeIds: [] };
    if (!data.employeeIds) data.employeeIds = [];
    _bajasCache[weekKey] = data;
    return data;
  } catch(e) {
    console.warn('No se pudo leer bajas/' + weekKey, e.message);
    return { weekKey, employeeIds: [] };
  }
}

async function saveBajasDoc(weekKey, employeeIds) {
  const data = { weekKey, employeeIds };
  await db.collection('bajas').doc(weekKey).set(data);
  _bajasCache[weekKey] = data;
  return data;
}

window.getRotationDoc = getRotationDoc;
window.saveRotationDoc = saveRotationDoc;
window.getBajasDoc = getBajasDoc;
window.saveBajasDoc = saveBajasDoc;

// ── AUTH ──────────────────────────────────────────────────────
function logoutUser() { auth.signOut(); }

auth.onAuthStateChanged(user => {
  if (user) {
    window.currentUser = user;
    const email = user.email || '';
    const namePart = email.split('@')[0] || 'Usuario';
    const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    const initials = namePart.slice(0, 2).toUpperCase();

    const card = document.getElementById('user-card');
    const avatar = document.getElementById('user-card-avatar');
    const nameEl = document.getElementById('user-card-name');
    const emailEl = document.getElementById('user-card-email');
    if (card) card.style.display = 'flex';
    if (avatar) avatar.textContent = initials;
    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = email;

    startSync();
  } else {
    location.replace('login.html');
  }
});

// ── FIRESTORE ─────────────────────────────────────────────────
window.saveToFirebase = async function() {
  if (!window.currentUser) {
    diagMsg('⚠️ Sin sesión — no se guarda', '#f5a623');
    return;
  }
  try {
    showSync('Guardando...');
    const s = window.state;
    const data = JSON.parse(JSON.stringify(s));
    delete data.selectedColor;
    delete data.filterEmpId;
    if (Array.isArray(data.compatibleRoles)) {
      data.compatibleRoles = JSON.stringify(data.compatibleRoles);
    }
    await DOC_REF.set(data);
    diagMsg('✅ Guardado en Firebase', '#4ade80');
    setTimeout(hideSync, 1200);
    setTimeout(() => {
      const d = document.getElementById('firebase-diag');
      if (d) d.style.display = 'none';
    }, 3000);
  } catch(e) {
    diagMsg('❌ Error al guardar: ' + e.message, '#ff6666');
    console.error('Firebase save error:', e);
    hideSync();
  }
};

function mergeRemoteState(remote) {
  if (!remote) return;
  isSyncing = true;
  if (remote.employees) state.employees = remote.employees;
  if (remote.marks) state.marks = remote.marks;
  if (remote.festivos) state.festivos = remote.festivos;
  if (remote.nextId) state.nextId = remote.nextId;
  if (remote.conflictThreshold) state.conflictThreshold = remote.conflictThreshold;
  if (remote.conflictThresholdTotal) state.conflictThresholdTotal = remote.conflictThresholdTotal;
  if (remote.customRoles) state.customRoles = remote.customRoles;
  if (remote.compatibleRoles) {
    try {
      state.compatibleRoles = typeof remote.compatibleRoles === 'string'
        ? JSON.parse(remote.compatibleRoles)
        : remote.compatibleRoles;
    } catch(e) { state.compatibleRoles = [['Encargado','Piker']]; }
  }
  if (remote.theme) { state.theme = remote.theme; if (window.applyTheme) window.applyTheme(); }
  window.state = state;
  localStorage.setItem('vac-app-v3', JSON.stringify(state));
  setTimeout(() => { isSyncing = false; }, 500);
}

async function startSync() {
  showSync('Conectando...');
  diagMsg('🔄 Conectando a Firestore...', '#f5a623');
  try {
    const snap = await DOC_REF.get();
    if (snap.exists) {
      mergeRemoteState(snap.data());
      if (window.showView) {
        window.showView(window._lastActiveView || 'dashboard');
      }
      diagMsg('✅ Datos cargados', '#4ade80');
    } else {
      diagMsg('✅ Conectado — base de datos vacía', '#4ade80');
    }
    hideSync();
    setTimeout(() => {
      const d = document.getElementById('firebase-diag');
      if (d) d.style.display = 'none';
    }, 4000);
  } catch(e) {
    diagMsg('❌ Error Firestore: ' + e.message, '#ff6666');
    hideSync();
  }

  DOC_REF.onSnapshot(snap => {
    if (!snap.exists || isSyncing) return;
    mergeRemoteState(snap.data());
    if (window.showView) {
      window.showView(window._lastActiveView || 'dashboard');
    }
    showSync('✓ Sincronizado');
    setTimeout(hideSync, 1500);
  }, err => {
    console.warn('Firestore error:', err);
    hideSync();
  });
}
