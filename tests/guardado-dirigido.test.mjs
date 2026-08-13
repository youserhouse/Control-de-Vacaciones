// ── tests/guardado-dirigido.test.mjs ──────────────────────────
// Guardado por campos (firebase.js) y detección de edición simultánea
// (calendar.js). Es lo que evita que un guardado hecho sobre una copia
// desfasada pise los cambios de otra persona.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, setState } from './harness.mjs';

// Firestore falso que apunta cada escritura en vez de enviarla a ningún sitio.
function firebaseFalso({ updateFalla = false } = {}) {
  const escrituras = [];
  const BORRAR = { __op: 'delete' };
  class FieldPath {
    constructor(...segments) { this.segments = segments; }
  }
  const docRef = {
    async set(data)      { escrituras.push({ op: 'set', data }); },
    async update(...args){
      if (updateFalla) throw new Error('NOT_FOUND: el documento no existe');
      escrituras.push({ op: 'update', args });
    },
    async get()          { return { exists: false }; },
    onSnapshot()         {},
  };
  const firestore = () => ({ collection: () => ({ doc: () => docRef }) });
  firestore.FieldPath = FieldPath;
  firestore.FieldValue = { delete: () => BORRAR };
  return {
    escrituras, BORRAR, FieldPath,
    globals: {
      firebase: {
        initializeApp() {},
        firestore,
        auth: () => ({ onAuthStateChanged() {}, signOut() {} }),
      },
      diagMsg() {}, showSync() {}, hideSync() {},
    },
  };
}

function appConFirebase(opts) {
  const fb = firebaseFalso(opts);
  const app = loadApp(['state.js', 'firebase.js'], fb.globals);
  app.ctx.currentUser = { email: 'ana@ejemplo.com' };   // sesión iniciada
  setState(app, {
    employees: [{ id: 1, name: 'Ana', role: 'Piker', color: '#000', totalDays: 10, email: '' }],
    marks: { '2026-05-10': { 1: 'V' } },
    festivos: { '2026-05-10': true },
  });
  return { app, fb };
}

// Convierte los argumentos variádicos de update(campo, valor, campo, valor…)
// en algo cómodo de comprobar: { 'marks.2026-05-10': valor, … }
function camposEscritos(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 2) out[args[i].segments.join('.')] = args[i + 1];
  return out;
}

test('escribe SOLO las rutas indicadas, no el documento entero', async () => {
  const { app, fb } = appConFirebase();
  await app.ctx.savePathsToFirebase([['marks', '2026-05-10']]);

  assert.equal(fb.escrituras.length, 1);
  assert.equal(fb.escrituras[0].op, 'update', 'debe ser update(), nunca set()');
  const campos = camposEscritos(fb.escrituras[0].args);
  assert.deepEqual(Object.keys(campos), ['marks.2026-05-10']);
  assert.equal(campos['marks.2026-05-10'][1], 'V');
});

test('un día quitado del estado local se BORRA en remoto, no se escribe como nulo', async () => {
  const { app, fb } = appConFirebase();
  delete app.evaluate('window.state').marks['2026-05-10'];   // el usuario lo desmarcó
  await app.ctx.savePathsToFirebase([['marks', '2026-05-10']]);

  const campos = camposEscritos(fb.escrituras[0].args);
  assert.equal(campos['marks.2026-05-10'], fb.BORRAR,
    'escribir null dejaría un día fantasma en la base de datos');
});

test('marcas y festivos del mismo día viajan juntos', async () => {
  const { app, fb } = appConFirebase();
  await app.ctx.savePathsToFirebase([['marks', '2026-05-10'], ['festivos', '2026-05-10']]);

  const campos = camposEscritos(fb.escrituras[0].args);
  assert.deepEqual(Object.keys(campos).sort(), ['festivos.2026-05-10', 'marks.2026-05-10']);
  assert.equal(campos['festivos.2026-05-10'], true);
});

test('sin rutas cae al guardado completo de siempre', async () => {
  const { app, fb } = appConFirebase();
  await app.ctx.savePathsToFirebase([]);
  assert.equal(fb.escrituras[0].op, 'set');
});

test('si update() falla (documento inexistente) reintenta con el guardado completo', async () => {
  const { app, fb } = appConFirebase({ updateFalla: true });
  await app.ctx.savePathsToFirebase([['marks', '2026-05-10']]);

  assert.equal(fb.escrituras.length, 1);
  assert.equal(fb.escrituras[0].op, 'set', 'set() sí crea el documento');
});

test('sin sesión no escribe nada', async () => {
  const { app, fb } = appConFirebase();
  app.ctx.currentUser = null;
  await app.ctx.savePathsToFirebase([['marks', '2026-05-10']]);
  assert.equal(fb.escrituras.length, 0);
});

test('saveState() sin argumentos sigue guardando el documento entero', async () => {
  const { app, fb } = appConFirebase();
  app.evaluate('saveState')();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(fb.escrituras[0].op, 'set', 'las llamadas antiguas no deben cambiar de comportamiento');
});

test('saveState(rutas) usa el guardado dirigido', async () => {
  const { app, fb } = appConFirebase();
  app.evaluate('saveState')([['marks', '2026-05-10']]);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(fb.escrituras[0].op, 'update');
});

// ── Huella del día: detectar que alguien más lo tocó ──────────
function appConCalendario() {
  const fb = firebaseFalso();
  const app = loadApp(['state.js', 'firebase.js', 'calendar.js'], fb.globals);
  setState(app, {
    employees: [{ id: 1, name: 'Ana', role: 'Piker', color: '#000', totalDays: 10, email: '' }],
    marks: { '2026-05-10': { 1: 'V', 2: 'O' } },
    festivos: {},
  });
  return app;
}

test('la huella del día no depende del orden de las claves', () => {
  const app = appConCalendario();
  const daySignature = app.evaluate('daySignature');
  const antes = daySignature('2026-05-10');
  // Firestore no conserva el orden de inserción: al llegar por onSnapshot las
  // mismas marcas pueden venir al revés. Eso NO es un cambio real.
  app.evaluate('window.state').marks['2026-05-10'] = { 2: 'O', 1: 'V' };
  assert.equal(daySignature('2026-05-10'), antes);
});

test('la huella detecta que alguien cambió el tipo de una marca', () => {
  const app = appConCalendario();
  const daySignature = app.evaluate('daySignature');
  const antes = daySignature('2026-05-10');
  app.evaluate('window.state').marks['2026-05-10'] = { 1: 'O', 2: 'O' };
  assert.notEqual(daySignature('2026-05-10'), antes);
});

test('la huella detecta que alguien añadió o quitó a una persona', () => {
  const app = appConCalendario();
  const daySignature = app.evaluate('daySignature');
  const antes = daySignature('2026-05-10');
  app.evaluate('window.state').marks['2026-05-10'] = { 1: 'V' };
  assert.notEqual(daySignature('2026-05-10'), antes);
});

test('la huella detecta que alguien marcó el día como festivo', () => {
  const app = appConCalendario();
  const daySignature = app.evaluate('daySignature');
  const antes = daySignature('2026-05-10');
  app.evaluate('window.state').festivos['2026-05-10'] = true;
  assert.notEqual(daySignature('2026-05-10'), antes,
    'el festivo forma parte del día: si no, se pisaría sin avisar');
});

test('un día sin marcas ni festivo tiene huella estable', () => {
  const app = appConCalendario();
  const daySignature = app.evaluate('daySignature');
  assert.equal(daySignature('2026-07-01'), daySignature('2026-08-02'));
});
