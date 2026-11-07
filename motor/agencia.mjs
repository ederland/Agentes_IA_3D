// Agencia: funciones puras para armar el contexto de cada tarea (sin Firebase, se pueden probar solas)

export const lista = (arr) => (Array.isArray(arr) ? arr : []).filter(Boolean)
export const safeName = (s) => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Sin nombre'

// Contexto de UN cliente. Nunca se arma con datos de otros clientes.
export function clientContext(c) {
  if (!c) return ''
  const n = c.negocio || {}, m = c.marca || {}, a = c.activos || {}
  const aprendizajes = lista(c.aprendizajes).slice(-15)
  return [
    `## Ficha del cliente: ${c.nombre}`,
    'Este es el único cliente de esta tarea: usa solo este contexto.',
    n.descripcion && `A qué se dedica: ${n.descripcion}`,
    lista(n.servicios).length && `Servicios: ${n.servicios.join(', ')}`,
    n.zona && `Zona: ${n.zona}`,
    n.publico && `Público: ${n.publico}`,
    m.tono && `Tono: ${m.tono}`,
    lista(m.colores).length && `Colores de marca: ${m.colores.join(', ')}`,
    lista(m.palabrasSi).length && `Palabras o frases que sí usa: ${m.palabrasSi.join('; ')}`,
    lista(m.palabrasNo).length && `Palabras o frases PROHIBIDAS: ${m.palabrasNo.join('; ')}`,
    lista(c.objetivos).length && `Objetivos actuales:\n${c.objetivos.map(o => '- ' + o).join('\n')}`,
    (a.web || a.redes) && `Activos: ${[a.web, a.redes].filter(Boolean).join(' · ')}`,
    aprendizajes.length && `Aprendizajes de correcciones anteriores (respétalos siempre):\n${aprendizajes.map(x => '- ' + x.texto).join('\n')}`,
  ].filter(Boolean).join('\n')
}

// Criterios con los que se revisa la entrega: los de la tarea + el checklist del tipo
export function criteriosDe(t, tipo) {
  return [...lista(t.brief?.criteriosAceptacion), ...lista(tipo?.checklist)]
}

export function briefSection(t, tipo) {
  const b = t.brief || {}
  const etiqueta = (k) => tipo?.plantillaBrief?.find(c => c.campo === k)?.etiqueta || k
  const campos = Object.entries(t.briefCampos || {}).filter(([, v]) => v)
  const criterios = criteriosDe(t, tipo)
  return [
    tipo && `Tipo de tarea: ${tipo.nombre}${tipo.formatoEntrega ? ` (formato de entrega: ${tipo.formatoEntrega})` : ''}`,
    b.objetivo && `Objetivo: ${b.objetivo}`,
    b.resultadoEsperado && `Resultado esperado: ${b.resultadoEsperado}`,
    ...campos.map(([k, v]) => `${etiqueta(k)}: ${v}`),
    b.contexto && `Contexto: ${b.contexto}`,
    criterios.length && `Criterios de aceptación (tu entrega se revisa contra estos):\n${criterios.map(c => '- ' + c).join('\n')}`,
  ].filter(Boolean).join('\n')
}

export function parseReview(text) {
  try {
    const j = JSON.parse((text.match(/\{[\s\S]*\}/) || [])[0])
    const estado = j.estado === 'ok' ? 'ok' : 'observaciones'
    return { estado, notas: lista(j.notas).map(String).slice(0, 15) }
  } catch { return null }
}

// Grupos de permisos que suma una tarea: los de su tipo de tarea y los que un admin marcó en ella.
// Solo se aceptan nombres de grupos del catálogo (nunca herramientas sueltas como Bash).
export function permisosDeTarea(tipo, t, grupos = {}) {
  return [...new Set([...lista(tipo?.herramientas), ...lista(t?.permisosExtra)])].filter(g => Object.hasOwn(grupos, g))
}
