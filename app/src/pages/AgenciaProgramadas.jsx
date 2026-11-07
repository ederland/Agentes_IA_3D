import React, { useMemo, useState } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { doc, addDoc, updateDoc, deleteDoc, collection, serverTimestamp, Timestamp, onSnapshot } from 'firebase/firestore'
import Icon from '../components/Icons.jsx'
import PermisosPicker from '../components/PermisosPicker.jsx'
import CATALOGO from '../../../roles/catalogo.json'
import { DEPT_PREFIX } from '../agencia.js'
import { proximaEjecucion, describirRegla, reglaValida, DIAS } from '../../../motor/programadas.mjs'

const ZONA = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
const toMs = (ts) => ts?.toMillis?.() || (ts?.seconds ? ts.seconds * 1000 : 0)
const fmt = (ms, zona = ZONA) => ms ? new Date(ms).toLocaleString('es', { timeZone: zona, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

// Agencia → Programadas: rutinas que crean una tarea en cada fecha (como el cron de Hermes, pero con aprobación)
export default function AgenciaProgramadas() {
  const { tasks, users, agents, departments, showToast, openEditTask } = useApp()
  const [schedules, setSchedules] = useState([])
  const [editando, setEditando] = useState(null)

  React.useEffect(() => onSnapshot(collection(db, 'schedules'),
    s => setSchedules(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))),
    e => console.warn('schedules:', e.code)), [])

  const quien = (p) => {
    if (p?.paraDepartamento) return `${departments.find(d => d.id === p.departamentoId)?.nombre || 'Departamento'} (lo toma cualquiera)`
    return users.find(u => u.uid === p?.asignado)?.name || agents.find(a => a.id === p?.asignado)?.name || 'Sin asignar'
  }
  const tareasDe = (id) => tasks.filter(t => t.programadaId === id).slice(0, 5)

  const accion = async (s, cambios, msg) => {
    try { await updateDoc(doc(db, 'schedules', s.id), cambios); if (msg) showToast(msg) } catch (e) { showToast('No se pudo actualizar', 'error') }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={() => setEditando({})}><Icon name="plus" size={12} /> Nueva rutina</button>
        <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
          Crean una tarea en cada fecha. También puedes pedírselas al coordinador: "cada lunes a las 8, 5 ideas de posts para PlomerosSAOR".
          Si la tarea anterior sigue pendiente, esa vez se salta para no apilar trabajo.
        </span>
      </div>
      {schedules.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aún no hay rutinas.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {schedules.map(s => (
          <div key={s.id} style={{ padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 10, opacity: s.activo ? 1 : 0.6 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <strong style={{ fontSize: 14 }}>{s.nombre}</strong>{!s.activo && <span className="badge" style={{ marginLeft: 6, fontSize: 10.5 }}>Pausada</span>}
                <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {describirRegla(s.regla)} · {quien(s.plantilla)}{s.plantilla?.cliente ? ` · ${s.plantilla.cliente}` : ''}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  Próxima: {s.activo ? fmt(toMs(s.proximaEjecucion), s.regla?.zona) : '—'} · {s.totalCreadas || 0} creadas
                  {s.creadaPor ? ` · creada por ${s.creadaPor}` : ''}
                </div>
                {s.aviso && <div style={{ fontSize: 11.5, color: 'var(--warning, #f59e0b)' }}>{s.aviso}</div>}
                {s.error && <div style={{ fontSize: 11.5, color: 'var(--danger)' }}>Error: {s.error}</div>}
              </div>
              <button className="btn btn-secondary btn-sm" disabled={!s.activo || s.ejecutarAhora}
                onClick={() => accion(s, { ejecutarAhora: true }, 'El motor crea la tarea en menos de un minuto')}>
                {s.ejecutarAhora ? 'Creando…' : 'Ejecutar ahora'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => accion(s, s.activo
                ? { activo: false }
                : { activo: true, proximaEjecucion: Timestamp.fromMillis(proximaEjecucion(s.regla) || Date.now()), aviso: null, error: null },
              s.activo ? 'Rutina pausada' : 'Rutina activada')}>
                {s.activo ? 'Pausar' : 'Activar'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setEditando(s)}>Editar</button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                onClick={async () => { if (confirm(`¿Eliminar la rutina "${s.nombre}"? Las tareas que ya creó se conservan.`)) { await deleteDoc(doc(db, 'schedules', s.id)); showToast('Rutina eliminada', 'info') } }}>
                <Icon name="trash" size={12} />
              </button>
            </div>
            {tareasDe(s.id).length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {tareasDe(s.id).map(t => (
                  <button key={t.id} className="btn btn-ghost btn-sm" style={{ fontSize: 11.5 }} onClick={() => openEditTask(t)}>
                    {t.tarea} · {t.estado}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {editando && <RutinaModal rutina={editando} onClose={() => setEditando(null)} />}
    </div>
  )
}

function RutinaModal({ rutina, onClose }) {
  const { user, users, agents, departments, clients, clientDocs, taskTypes, showToast } = useApp()
  const p = rutina.plantilla || {}
  const r = rutina.regla || {}
  const [f, setF] = useState({
    nombre: rutina.nombre || '', tarea: p.tarea || '', descripcion: p.descripcion || '',
    asignado: p.paraDepartamento ? DEPT_PREFIX + p.departamentoId : (p.asignado || ''),
    cliente: p.cliente || '', tipoTareaId: p.tipoTareaId || '', prioridad: p.prioridad || 'media',
    diasParaVencer: p.diasParaVencer ?? 1, links: p.links || '', permisosExtra: p.permisosExtra || [],
    frecuencia: r.frecuencia || 'semanal', hora: r.hora || '08:00', dias: r.dias || [1], diaMes: r.diaMes ?? 1,
    activo: rutina.activo !== false,
  })
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const deptId = f.asignado.startsWith(DEPT_PREFIX) ? f.asignado.slice(DEPT_PREFIX.length) : ''
  const agente = agents.find(a => a.id === f.asignado)
  const tipo = taskTypes.find(t => t.id === f.tipoTareaId)
  const regla = useMemo(() => ({
    frecuencia: f.frecuencia, hora: f.hora, zona: r.zona || ZONA,
    ...(f.frecuencia === 'semanal' ? { dias: [...f.dias].sort() } : {}),
    ...(f.frecuencia === 'mensual' ? { diaMes: f.diaMes === 'ultimo' ? 'ultimo' : Number(f.diaMes) } : {}),
  }), [f.frecuencia, f.hora, f.dias, f.diaMes])
  const errorRegla = reglaValida(regla)
  const proxima = errorRegla ? null : proximaEjecucion(regla)

  const save = async () => {
    if (!f.nombre.trim() || !f.tarea.trim()) { showToast('Ponle nombre a la rutina y título a la tarea', 'error'); return }
    if (!f.asignado) { showToast('Elige a quién se asigna', 'error'); return }
    if (errorRegla) { showToast(errorRegla, 'error'); return }
    const cliente = clientDocs.find(c => c.nombre === f.cliente)
    const data = {
      nombre: f.nombre.trim(), activo: f.activo, regla,
      plantilla: {
        tarea: f.tarea.trim(), descripcion: f.descripcion.trim(), links: f.links.trim(),
        asignado: deptId ? '' : f.asignado, paraDepartamento: !!deptId,
        departamentoId: deptId || tipo?.departamento || agente?.departamentoId || CATALOGO.roles[agente?.rol]?.departamento || '',
        cliente: f.cliente, clienteId: cliente?.id || '', tipoTareaId: f.tipoTareaId, prioridad: f.prioridad,
        diasParaVencer: Math.max(0, Math.min(60, Number(f.diasParaVencer) || 0)),
        permisosExtra: deptId || agente ? f.permisosExtra : [],
      },
      proximaEjecucion: f.activo && proxima ? Timestamp.fromMillis(proxima) : null,
      aviso: null, error: null,
    }
    try {
      if (rutina.id) await updateDoc(doc(db, 'schedules', rutina.id), data)
      else await addDoc(collection(db, 'schedules'), { ...data, totalCreadas: 0, creadaPor: 'panel', createdBy: user.email, createdAt: serverTimestamp() })
      showToast('Rutina guardada')
      onClose()
    } catch (e) {
      console.error(e)
      showToast(`No se pudo guardar${e.code === 'permission-denied' ? ' (sin permisos: publica las reglas)' : ''}`, 'error')
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h2 className="modal-title">{rutina.id ? 'Editar rutina' : 'Nueva rutina'}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Nombre de la rutina</label>
            <input className="form-input" value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej. Ideas de posts semanales PlomerosSAOR" autoFocus />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Frecuencia</label>
              <select className="form-select" value={f.frecuencia} onChange={e => set('frecuencia', e.target.value)}>
                <option value="diaria">Todos los días</option>
                <option value="semanal">Ciertos días de la semana</option>
                <option value="mensual">Una vez al mes</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Hora ({regla.zona})</label>
              <input className="form-input" type="time" value={f.hora} onChange={e => set('hora', e.target.value)} />
            </div>
          </div>
          {f.frecuencia === 'semanal' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {DIAS.map((d, i) => (
                <label key={d} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12.5 }}>
                  <input type="checkbox" checked={f.dias.includes(i + 1)}
                    onChange={() => set('dias', f.dias.includes(i + 1) ? f.dias.filter(x => x !== i + 1) : [...f.dias, i + 1])} />
                  {d}
                </label>
              ))}
            </div>
          )}
          {f.frecuencia === 'mensual' && (
            <div className="form-group">
              <label className="form-label">Día del mes</label>
              <select className="form-select" value={f.diaMes} onChange={e => set('diaMes', e.target.value === 'ultimo' ? 'ultimo' : Number(e.target.value))}>
                {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                <option value="ultimo">Último día del mes</option>
              </select>
            </div>
          )}
          <p style={{ fontSize: 12.5, margin: 0, color: errorRegla ? 'var(--danger)' : 'var(--text-2)' }}>
            {errorRegla || `${describirRegla(regla)} · primera vez: ${fmt(proxima, regla.zona)}`}
          </p>

          <div className="form-group">
            <label className="form-label">Título de la tarea (se le agrega la fecha)</label>
            <input className="form-input" value={f.tarea} onChange={e => set('tarea', e.target.value)} placeholder="Ej. 5 ideas de posts para la semana" />
          </div>
          <div className="form-group">
            <label className="form-label">Descripción / brief</label>
            <textarea className="form-textarea" rows={3} value={f.descripcion} onChange={e => set('descripcion', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Asignado a</label>
              <select className="form-select" value={f.asignado} onChange={e => set('asignado', e.target.value)}>
                <option value="">— Selecciona —</option>
                {departments.some(d => d.activo !== false) && (
                  <optgroup label="Departamento (lo toma cualquiera)">
                    {departments.filter(d => d.activo !== false).map(d => <option key={d.id} value={DEPT_PREFIX + d.id}>{d.nombre} · todo el equipo</option>)}
                  </optgroup>
                )}
                <optgroup label="Equipo">
                  {users.filter(u => u.role !== 'pending').map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
                </optgroup>
                <optgroup label="Agentes de IA">
                  {agents.filter(a => a.active !== false).map(a => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
                </optgroup>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Cliente</label>
              <select className="form-select" value={f.cliente} onChange={e => set('cliente', e.target.value)}>
                <option value="">— Interno —</option>
                {(clients || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tipo de tarea</label>
              <select className="form-select" value={f.tipoTareaId} onChange={e => set('tipoTareaId', e.target.value)}>
                <option value="">Libre (sin plantilla)</option>
                {taskTypes.filter(t => !deptId || t.departamento === deptId).map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Prioridad · vence en (días)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <select className="form-select" value={f.prioridad} onChange={e => set('prioridad', e.target.value)}>
                  {['urgente', 'alta', 'media', 'baja'].map(x => <option key={x} value={x}>{x}</option>)}
                </select>
                <input className="form-input" type="number" min="0" max="60" style={{ width: 80 }} value={f.diasParaVencer} onChange={e => set('diasParaVencer', e.target.value)} />
              </div>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Link de recursos (opcional)</label>
            <input className="form-input" value={f.links} onChange={e => set('links', e.target.value)} placeholder="https://…" />
          </div>
          {(agente || deptId) && (
            <details open={f.permisosExtra.length > 0} style={{ padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 10 }}>
              <summary className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Permisos del agente para estas tareas</summary>
              <div style={{ marginTop: 10 }}>
                <PermisosPicker value={f.permisosExtra} onChange={v => set('permisosExtra', v)} base={{
                  ...Object.fromEntries((tipo?.herramientas || []).map(g => [g, 'del tipo de tarea'])),
                  ...Object.fromEntries((agente ? CATALOGO.roles[agente.rol]?.herramientas || [] : []).map(g => [g, 'ya lo tiene el rol'])),
                }} />
              </div>
            </details>
          )}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={f.activo} onChange={e => set('activo', e.target.checked)} /> Activa
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
