// ── tests/ajustes.test.mjs ────────────────────────────────────
// Interruptor "Permitir marcar 'Otros' sin cupo" (state.js): confirma que
// nace desactivado y que un estado guardado ANTES de que este campo
// existiera se migra a `false` en vez de quedar `undefined`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './harness.mjs';

test('allowOtroSinCupo empieza desactivado en una instalación nueva', () => {
  const app = loadApp(['state.js']);
  assert.equal(app.evaluate('window.state.allowOtroSinCupo'), false);
});

test('un estado guardado sin allowOtroSinCupo se migra a false', () => {
  // Tal cual quedaba guardado un estado real antes de este campo: sin él.
  const guardado = JSON.stringify({
    employees: [{ id: 1, name: 'Ana', role: 'Piker', color: '#000', totalDays: 20, email: '' }],
    nextId: 2, marks: {}, festivos: {}, currentYear: 2026,
    conflictThreshold: 2, conflictThresholdTotal: 99, customRoles: [],
    compatibleRoles: [['Encargado', 'Piker']], wtAllowVacationAssign: false,
  });
  const store = new Map([['vac-app-v3', guardado]]);
  const app = loadApp(['state.js'], {
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
  });
  assert.equal(app.evaluate('window.state.allowOtroSinCupo'), false);
});
