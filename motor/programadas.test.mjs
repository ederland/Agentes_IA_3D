// Pruebas de las tareas programadas:  node --test
import test from 'node:test'
import assert from 'node:assert/strict'
import { proximaEjecucion, describirRegla, reglaValida, diasDesdeTexto, tituloConFecha, fechaLocal } from './programadas.mjs'

const BOG = 'America/Bogota' // UTC-5 todo el año
const utc = (s) => Date.parse(s)

test('diaria: hoy si la hora no pasó, mañana si ya pasó (hora de Bogotá)', () => {
  const r = { frecuencia: 'diaria', hora: '08:00', zona: BOG }
  assert.equal(proximaEjecucion(r, utc('2026-11-09T12:00:00Z')), utc('2026-11-09T13:00:00Z')) // 7:00 Bogotá → 8:00 hoy
  assert.equal(proximaEjecucion(r, utc('2026-11-09T13:00:00Z')), utc('2026-11-10T13:00:00Z')) // justo a las 8 → mañana
})

test('semanal: lunes y jueves', () => {
  const r = { frecuencia: 'semanal', hora: '09:30', dias: [1, 4], zona: BOG }
  // Martes 10 nov 2026 → jueves 12
  assert.equal(proximaEjecucion(r, utc('2026-11-10T15:00:00Z')), utc('2026-11-12T14:30:00Z'))
  // Jueves después de la hora → lunes 16
  assert.equal(proximaEjecucion(r, utc('2026-11-12T20:00:00Z')), utc('2026-11-16T14:30:00Z'))
})

test('mensual: día fijo y último día (febrero)', () => {
  assert.equal(proximaEjecucion({ frecuencia: 'mensual', hora: '07:00', diaMes: 15, zona: BOG }, utc('2026-11-20T00:00:00Z')), utc('2026-12-15T12:00:00Z'))
  assert.equal(proximaEjecucion({ frecuencia: 'mensual', hora: '18:00', diaMes: 'ultimo', zona: BOG }, utc('2027-02-01T00:00:00Z')), utc('2027-02-28T23:00:00Z'))
})

test('zona con horario de verano (Madrid)', () => {
  const r = { frecuencia: 'diaria', hora: '10:00', zona: 'Europe/Madrid' }
  assert.equal(proximaEjecucion(r, utc('2026-07-01T00:00:00Z')), utc('2026-07-01T08:00:00Z')) // verano UTC+2
  assert.equal(proximaEjecucion(r, utc('2026-12-01T00:00:00Z')), utc('2026-12-01T09:00:00Z')) // invierno UTC+1
})

test('cuando el PC estuvo apagado, la próxima se calcula desde ahora (no se acumulan atrasadas)', () => {
  const r = { frecuencia: 'diaria', hora: '08:00', zona: BOG }
  const ahora = utc('2026-11-20T15:00:00Z') // 10:00 del 20; las del 15 al 20 se perdieron
  assert.equal(proximaEjecucion(r, ahora), utc('2026-11-21T13:00:00Z'))
})

test('validación y textos', () => {
  assert.equal(reglaValida({ frecuencia: 'semanal', hora: '08:00', dias: [] }), 'Elige al menos un día de la semana')
  assert.equal(reglaValida({ frecuencia: 'diaria', hora: '25:00' }), 'La hora debe ser HH:MM')
  assert.equal(proximaEjecucion({ frecuencia: 'mensual', hora: '08:00', diaMes: 31 }), null)
  assert.equal(describirRegla({ frecuencia: 'semanal', hora: '08:00', dias: [4, 1] }), 'Cada lunes y jueves a las 08:00')
  assert.equal(describirRegla({ frecuencia: 'mensual', hora: '07:00', diaMes: 'ultimo' }), 'El último día de cada mes a las 07:00')
  assert.deepEqual(diasDesdeTexto(['Lunes', 'miércoles', 'MIERCOLES', 'domingo', 'otro']), [1, 3, 7])
  assert.equal(tituloConFecha('Ideas de posts', utc('2026-11-09T13:00:00Z'), BOG), 'Ideas de posts · lun, 9 nov')
  assert.equal(fechaLocal(utc('2026-11-10T03:00:00Z'), BOG, 2), '2026-11-11') // 22:00 del 9 en Bogotá + 2 días
})
