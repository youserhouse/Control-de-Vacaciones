// ── tests/quota.test.mjs ──────────────────────────────────────
// Cupo anual de vacaciones (state.js). Reglas que se comprueban aquí:
//   · 'V' consume cupo, 'O' no.
//   · El cupo se cuenta por año, no en total.
//   · Quitar un día siempre se permite, incluso a quien ya esté pasado de
//     cupo por datos antiguos — si no, quedaría bloqueado sin salida.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, setState } from './harness.mjs';

// Estado de partida: dos empleados con cupos distintos y ningún día marcado.
function appConCupos() {
  const app = loadApp(['state.js']);
  setState(app, {
    employees: [
      { id: 1, name: 'Ana',    role: 'Piker', color: '#000', totalDays: 3, email: '' },
      { id: 2, name: 'Carlos', role: 'Piker', color: '#111', totalDays: 2, email: '' },
    ],
    marks: {},
    festivos: {},
  });
  return app;
}

test('countVacDays cuenta solo los días "V" del año pedido', () => {
  const app = appConCupos();
  setState(app, { marks: {
    '2026-01-02': { 1: 'V' },
    '2026-01-03': { 1: 'V', 2: 'V' },
    '2026-01-04': { 1: 'O' },   // "otros" no cuenta
    '2025-01-02': { 1: 'V' },   // otro año no cuenta
  }});
  const countVacDays = app.evaluate('countVacDays');
  assert.equal(countVacDays(1, 2026), 2);
  assert.equal(countVacDays(2, 2026), 1);
  assert.equal(countVacDays(1, 2025), 1);
});

test('getVacQuota informa de días usados y restantes', () => {
  const app = appConCupos();
  setState(app, { marks: { '2026-01-02': { 1: 'V' }, '2026-01-03': { 1: 'V' } } });
  const q = app.evaluate('getVacQuota')(1, 2026);
  assert.equal(q.totalDays, 3);
  assert.equal(q.used, 2);
  assert.equal(q.left, 1);
});

test('getVacQuota devuelve "left" negativo si hay datos heredados por encima del cupo', () => {
  const app = appConCupos();
  setState(app, { marks: {
    '2026-01-02': { 2: 'V' }, '2026-01-03': { 2: 'V' }, '2026-01-04': { 2: 'V' },
  }});
  const q = app.evaluate('getVacQuota')(2, 2026);   // cupo 2, marcados 3
  assert.equal(q.left, -1, 'no debe recortarse a 0: quien pinta decide');
});

test('canMarkVacation bloquea al llegar al cupo', () => {
  const app = appConCupos();
  setState(app, { marks: { '2026-01-02': { 2: 'V' }, '2026-01-03': { 2: 'V' } } });
  const canMarkVacation = app.evaluate('canMarkVacation');
  assert.equal(canMarkVacation(2, '2026-01-07'), false, 'cupo agotado (2 de 2)');
  assert.equal(canMarkVacation(1, '2026-01-07'), true,  'a Ana le quedan días');
});

test('canMarkVacation permite mantener un día que YA era "V" aunque esté pasado de cupo', () => {
  const app = appConCupos();
  setState(app, { marks: {
    '2026-01-02': { 2: 'V' }, '2026-01-03': { 2: 'V' }, '2026-01-04': { 2: 'V' },
  }});
  const canMarkVacation = app.evaluate('canMarkVacation');
  // Pasado de cupo (3 de 2), pero sus días existentes siguen siendo tocables:
  // si no, no podría ni quitárselos para volver a estar dentro.
  assert.equal(canMarkVacation(2, '2026-01-04'), true);
  assert.equal(canMarkVacation(2, '2026-01-09'), false, 'pero no puede añadir uno nuevo');
});

test('un día marcado como "O" no gasta cupo', () => {
  const app = appConCupos();
  setState(app, { marks: {
    '2026-01-02': { 2: 'O' }, '2026-01-03': { 2: 'O' }, '2026-01-04': { 2: 'O' },
  }});
  assert.equal(app.evaluate('getVacQuota')(2, 2026).used, 0);
  assert.equal(app.evaluate('canMarkVacation')(2, '2026-01-07'), true);
});

test('validateVacProposals no se queja si todo cabe', () => {
  const app = appConCupos();
  const violations = app.evaluate('validateVacProposals')([
    { empId: 1, date: '2026-03-02' },
    { empId: 1, date: '2026-03-03' },
  ]);
  assert.equal(violations.length, 0);
});

test('validateVacProposals detecta el exceso y dice en cuánto se pasa', () => {
  const app = appConCupos();
  const violations = app.evaluate('validateVacProposals')([
    { empId: 2, date: '2026-03-02' },
    { empId: 2, date: '2026-03-03' },
    { empId: 2, date: '2026-03-04' },   // cupo de Carlos es 2
  ]);
  assert.equal(violations.length, 1);
  assert.equal(violations[0].name, 'Carlos');
  assert.equal(violations[0].over, 1);
});

test('re-guardar un día que ya era "V" no vuelve a gastar cupo', () => {
  const app = appConCupos();
  setState(app, { marks: { '2026-03-02': { 2: 'V' }, '2026-03-03': { 2: 'V' } } });
  // Se reenvían los dos días que ya estaban marcados: no es consumo nuevo.
  const violations = app.evaluate('validateVacProposals')([
    { empId: 2, date: '2026-03-02' },
    { empId: 2, date: '2026-03-03' },
  ]);
  assert.equal(violations.length, 0, 'guardar sin cambios no debe fallar por cupo');
});

test('el mismo empleado y día repetidos cuentan una sola vez', () => {
  const app = appConCupos();
  const violations = app.evaluate('validateVacProposals')([
    { empId: 2, date: '2026-03-02' },
    { empId: 2, date: '2026-03-02' },
    { empId: 2, date: '2026-03-03' },
  ]);
  assert.equal(violations.length, 0, '2 días distintos caben en el cupo de 2');
});

test('cada año se valida contra su propio cupo', () => {
  const app = appConCupos();
  const violations = app.evaluate('validateVacProposals')([
    { empId: 2, date: '2026-03-02' }, { empId: 2, date: '2026-03-03' },
    { empId: 2, date: '2027-03-02' }, { empId: 2, date: '2027-03-03' },
  ]);
  assert.equal(violations.length, 0, '2 en 2026 y 2 en 2027 caben: no se suman entre años');
});

test('validateVacProposals ignora entradas con fecha o empleado inválidos', () => {
  const app = appConCupos();
  const violations = app.evaluate('validateVacProposals')([
    { empId: 'x',  date: '2026-03-02' },
    { empId: 2,    date: '02/03/2026' },
    { empId: 2,    date: null },
    null,
  ]);
  assert.equal(violations.length, 0);
});
