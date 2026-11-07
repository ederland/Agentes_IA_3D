// Pruebas de las funciones de contexto de la Agencia:  node --test
import test from 'node:test'
import assert from 'node:assert/strict'
import { clientContext, briefSection, criteriosDe, parseReview, safeName } from './agencia.mjs'

const saor = {
  nombre: 'SAOR', negocio: { descripcion: 'Plomería en Cali', servicios: ['Destapes', 'Fugas'], zona: 'Cali', publico: 'Hogares' },
  marca: { tono: 'cercano', colores: ['#0055AA'], palabrasSi: ['servicio 24 horas'], palabrasNo: ['barato'] },
  objetivos: ['Más llamadas en Cali'], aprendizajes: [{ texto: 'No usar emojis' }],
}
const praxiuz = {
  nombre: 'Praxiuz', negocio: { descripcion: 'Desarrollo de software' },
  marca: { tono: 'formal, de usted', palabrasNo: ['gratis'] }, objetivos: ['Clientes en toda Colombia'],
}

test('la ficha de un cliente no contiene datos de otro', () => {
  const a = clientContext(saor), b = clientContext(praxiuz)
  assert.match(a, /Plomería en Cali/)
  assert.match(a, /PROHIBIDAS: barato/)
  assert.match(a, /No usar emojis/)
  for (const s of ['Praxiuz', 'software', 'de usted', 'gratis']) assert.doesNotMatch(a, new RegExp(s))
  for (const s of ['SAOR', 'Plomería', 'barato', 'emojis']) assert.doesNotMatch(b, new RegExp(s))
})

test('ficha vacía o ausente no rompe', () => {
  assert.equal(clientContext(null), '')
  assert.match(clientContext({ nombre: 'Nuevo' }), /Ficha del cliente: Nuevo/)
})

test('el brief incluye campos de la plantilla y criterios del tipo', () => {
  const tipo = { nombre: 'Ideas de posts', formatoEntrega: 'texto', checklist: ['Respeta el tono'],
    plantillaBrief: [{ campo: 'cantidad', etiqueta: 'Cuántas ideas' }] }
  const t = { brief: { objetivo: 'Llamadas', criteriosAceptacion: ['3 ideas'] }, briefCampos: { cantidad: '3' } }
  const out = briefSection(t, tipo)
  assert.match(out, /Tipo de tarea: Ideas de posts/)
  assert.match(out, /Cuántas ideas: 3/)
  assert.match(out, /- 3 ideas\n- Respeta el tono/)
  assert.deepEqual(criteriosDe(t, tipo), ['3 ideas', 'Respeta el tono'])
  assert.equal(briefSection({}, null), '')
})

test('lee el JSON del revisor aunque venga con texto alrededor', () => {
  assert.deepEqual(parseReview('Listo:\n```json\n{"estado":"ok","notas":[]}\n```'), { estado: 'ok', notas: [] })
  assert.deepEqual(parseReview('{"estado":"observaciones","notas":["Falta CTA"]}'), { estado: 'observaciones', notas: ['Falta CTA'] })
  assert.equal(parseReview('sin json'), null)
})

test('nombres de carpeta seguros', () => {
  assert.equal(safeName('a/b:c*?'), 'abc')
  assert.equal(safeName(''), 'Sin nombre')
})
