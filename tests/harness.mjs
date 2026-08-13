// ── tests/harness.mjs ─────────────────────────────────────────
// Los ficheros de la app son scripts de navegador sueltos (sin módulos): dan
// por hecho que existen `window`, `document` y `localStorage`, y se comunican
// entre ellos por variables globales. Para poder probarlos en Node sin
// navegador se cargan aquí dentro de un contexto de `node:vm` con lo mínimo
// simulado.
//
// La gracia es que así se prueba EL CÓDIGO REAL del repo. Copiar las funciones
// al fichero de test sería más fácil, pero entonces el test seguiría pasando
// aunque alguien rompiera la app.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Elemento de pantalla falso: devuelve algo inofensivo para cualquier cosa que
// el código toque. Los tests de aquí no comprueban interfaz, solo lógica.
function fakeElement() {
  return {
    style: {}, classList: { toggle(){}, add(){}, remove(){}, contains(){ return false; } },
    textContent: '', innerHTML: '', value: '', checked: false,
    appendChild(){}, addEventListener(){}, remove(){},
  };
}

/**
 * Crea un contexto de navegador simulado y carga en él los ficheros indicados,
 * en orden (comparten globales igual que en el navegador).
 * @param {string[]} files      ficheros del repo, p.ej. ['state.js']
 * @param {object}  extraGlobals globales adicionales (p.ej. un firebase falso)
 */
export function loadApp(files, extraGlobals = {}) {
  const store = new Map();
  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: () => store.clear(),
    },
    document: {
      getElementById: () => fakeElement(),
      querySelector: () => fakeElement(),
      querySelectorAll: () => [],
      createElement: () => fakeElement(),
      body: fakeElement(),
      addEventListener(){},
    },
    location: { replace(){}, href: '' },
    navigator: { serviceWorker: { register: () => Promise.resolve() } },
    ...extraGlobals,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  for (const f of files) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  // `evaluate` permite alcanzar también las declaraciones `let`/`const` del
  // nivel superior, que no quedan colgando del objeto global.
  return { ctx, evaluate: expr => vm.runInContext(`(${expr})`, ctx) };
}

/** Sustituye el estado de la app por uno controlado, para partir de algo conocido. */
export function setState(app, partial) {
  const s = app.evaluate('window.state');
  Object.assign(s, partial);
  return s;
}
