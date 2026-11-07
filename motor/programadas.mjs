// Tareas programadas: cálculo de la próxima ejecución y texto legible de la regla.
// Funciones puras (sin Firebase): las usan el motor y el panel. Pruebas: npm test en motor/.
//
// regla = {
//   frecuencia: 'diaria' | 'semanal' | 'mensual',
//   hora: 'HH:MM',                 // hora local de la zona
//   dias: [1..7],                  // semanal: 1 = lunes … 7 = domingo
//   diaMes: 1..28 | 'ultimo',      // mensual
//   zona: 'America/Bogota',        // zona horaria IANA
// }

export const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const DIAS_SIN_TILDE = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo']

// Desfase de la zona (ms) en un instante: hora local - UTC
function desfase(ms, zona) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms)).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

// Fecha y hora "de pared" en la zona → instante UTC
function aUtc(y, m, d, hh, mm, zona) {
  const guess = Date.UTC(y, m, d, hh, mm)
  let t = guess - desfase(guess, zona)
  t = guess - desfase(t, zona) // segunda pasada por cambios de horario
  return t
}

// Partes de la fecha local en la zona
function partes(ms, zona) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(new Date(ms)).filter(x => x.type !== 'literal').map(x => [x.type, x.value]))
  const wd = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday]
  return { y: Number(p.year), m: Number(p.month) - 1, d: Number(p.day), wd }
}

const diasDelMes = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()

export function reglaValida(r) {
  if (!r || !['diaria', 'semanal', 'mensual'].includes(r.frecuencia)) return 'Elige la frecuencia'
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.hora || '')) return 'La hora debe ser HH:MM'
  if (r.frecuencia === 'semanal' && !(Array.isArray(r.dias) && r.dias.length && r.dias.every(d => d >= 1 && d <= 7))) return 'Elige al menos un día de la semana'
  if (r.frecuencia === 'mensual' && !(r.diaMes === 'ultimo' || (Number.isInteger(r.diaMes) && r.diaMes >= 1 && r.diaMes <= 28))) return 'El día del mes va de 1 a 28, o "último"'
  try { new Intl.DateTimeFormat('en-US', { timeZone: r.zona || 'UTC' }) } catch { return 'Zona horaria inválida' }
  return null
}

// Próxima ejecución estrictamente después de "desde" (ms). Devuelve ms o null si la regla no es válida.
export function proximaEjecucion(regla, desde = Date.now()) {
  if (reglaValida(regla)) return null
  const zona = regla.zona || 'UTC'
  const [hh, mm] = regla.hora.split(':').map(Number)
  const hoy = partes(desde, zona)
  // Recorre hasta 400 días locales desde hoy y toma el primero que cumple y queda en el futuro
  for (let i = 0; i < 400; i++) {
    const base = Date.UTC(hoy.y, hoy.m, hoy.d + i)
    const f = new Date(base)
    const y = f.getUTCFullYear(), m = f.getUTCMonth(), d = f.getUTCDate()
    const wd = ((f.getUTCDay() + 6) % 7) + 1
    let cumple = regla.frecuencia === 'diaria'
    if (regla.frecuencia === 'semanal') cumple = regla.dias.includes(wd)
    if (regla.frecuencia === 'mensual') cumple = d === (regla.diaMes === 'ultimo' ? diasDelMes(y, m) : regla.diaMes)
    if (!cumple) continue
    const t = aUtc(y, m, d, hh, mm, zona)
    if (t > desde) return t
  }
  return null
}

export function describirRegla(r) {
  if (!r || reglaValida(r)) return 'Regla incompleta'
  const hora = `a las ${r.hora}`
  if (r.frecuencia === 'diaria') return `Todos los días ${hora}`
  if (r.frecuencia === 'semanal') {
    const ds = [...r.dias].sort().map(d => DIAS[d - 1])
    const lista = ds.length > 1 ? ds.slice(0, -1).join(', ') + ' y ' + ds[ds.length - 1] : ds[0]
    return ds.length === 7 ? `Todos los días ${hora}` : `Cada ${lista} ${hora}`
  }
  return r.diaMes === 'ultimo' ? `El último día de cada mes ${hora}` : `El día ${r.diaMes} de cada mes ${hora}`
}

// Días escritos por el coordinador ("lunes", "Miércoles", 3) → números 1..7
export function diasDesdeTexto(dias) {
  return [...new Set((Array.isArray(dias) ? dias : [dias]).map(d => {
    if (Number.isInteger(d)) return d
    const t = String(d || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    return DIAS_SIN_TILDE.indexOf(t) + 1
  }).filter(d => d >= 1 && d <= 7))].sort()
}

// Título de la tarea creada: "Ideas de posts · lun 10 nov"
export function tituloConFecha(titulo, ms, zona = 'UTC') {
  const f = new Intl.DateTimeFormat('es', { timeZone: zona, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ms)).replace(/\./g, '')
  return `${String(titulo || 'Tarea').slice(0, 170)} · ${f}`
}

// Fecha AAAA-MM-DD en la zona, n días después de ms
export function fechaLocal(ms, zona = 'UTC', masDias = 0) {
  const p = partes(ms, zona)
  return new Date(Date.UTC(p.y, p.m, p.d + masDias)).toISOString().slice(0, 10)
}
