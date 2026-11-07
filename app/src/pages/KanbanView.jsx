import React, { useState, useEffect } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { doc, updateDoc, deleteDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { logWork } from '../utils/worklog.js'
import Icon from '../components/Icons.jsx'

const COLUMNS = [
  { id: 'pendiente',   label: 'Pendiente',    icon: 'hourglass', color: 'var(--text-3)' },
  { id: 'en_progreso', label: 'En Progreso',  icon: 'timer',     color: 'var(--purple)' },
  { id: 'en_espera',   label: 'Espera Aprobación', icon: 'clock', color: 'var(--info)' },
  { id: 'en_revision', label: 'Correcciones', icon: 'wrench',    color: 'var(--warning)' },
  { id: 'completada',  label: 'Completada',   icon: 'check',     color: 'var(--success)' },
]

const PAGE_SIZE = 20

// Máximo de tareas simultáneas En Progreso por empleado
export const WIP_LIMIT = 2

// ¿El empleado ya alcanzó su límite de tareas en progreso?
export function wipLimitReached(allTasks, uid, excludeTaskId = null) {
  return allTasks.filter(t =>
    t.asignado === uid &&
    t.estado === 'en_progreso' &&
    t.id !== excludeTaskId
  ).length >= WIP_LIMIT
}

// Duplicar una tarea como plantilla: copia todo el contenido,
// resetea la ejecución (estado, timer, calificación, marcas)
export async function duplicateTask(task, byEmail) {
  const copy = {
    tarea: `${task.tarea} (copia)`,
    descripcion: task.descripcion || '',
    asignado: task.asignado || '',
    cliente: task.cliente || '',
    prioridad: task.prioridad || 'media',
    estado: 'pendiente',
    fechaRequerimiento: task.fechaRequerimiento || null,
    fechaVencimiento: task.fechaVencimiento || null,
    tiempoEstimadoMin: task.tiempoEstimadoMin || 0,
    links: task.links || '',
    linkTerminada: '', // el entregable pertenece a la ejecución original
    feedback: task.feedback || '',
    fechaInicio: null,
    fechaEntrega: null,
    timerStartedAt: null,
    timerPaused: false,
    pendingAcceptance: false,
    totalTimeSeconds: 0,
    rating: 0,
    completedBy: null,
    completedByEmail: null,
    createdAt: serverTimestamp(),
    createdBy: byEmail,
    lastEditedBy: byEmail,
    lastEditedAt: serverTimestamp(),
  }
  await addDoc(collection(db, 'tasks'), copy)
}

// Filtro por periodo sobre createdAt
export function inPeriod(task, period, monthVal, fromDate, toDate) {
  if (period === 'all') return true
  const ms = task.createdAt?.toMillis?.() || 0
  if (!ms) return true
  const d = new Date(ms)
  const now = new Date()
  if (period === 'week') {
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0,0,0,0)
    return ms >= weekStart.getTime()
  }
  if (period === 'month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }
  if (period === 'pickMonth' && monthVal) {
    const [y, m] = monthVal.split('-').map(Number)
    return d.getFullYear() === y && d.getMonth() === m - 1
  }
  if (period === 'range') {
    if (fromDate && ms < new Date(fromDate + 'T00:00:00').getTime()) return false
    if (toDate && ms > new Date(toDate + 'T23:59:59').getTime()) return false
    return true
  }
  return true
}

// Selector de periodo reutilizable
export function PeriodFilter({ period, setPeriod, monthVal, setMonthVal, fromDate, setFromDate, toDate, setToDate }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Icon name="calendar" size={14} style={{ color: 'var(--text-3)' }} />
      <select className="form-select" style={{ fontSize: 13, padding: '6px 10px', width: 'auto' }}
        value={period} onChange={e => setPeriod(e.target.value)}>
        <option value="all">Todo el tiempo</option>
        <option value="week">Esta semana</option>
        <option value="month">Este mes</option>
        <option value="pickMonth">Elegir mes</option>
        <option value="range">Rango de fechas</option>
      </select>
      {period === 'pickMonth' && (
        <input type="month" className="form-input" style={{ width: 'auto', padding: '5px 8px', fontSize: 13 }}
          value={monthVal} onChange={e => setMonthVal(e.target.value)} />
      )}
      {period === 'range' && (
        <>
          <input type="date" className="form-input" style={{ width: 'auto', padding: '5px 8px', fontSize: 13 }}
            value={fromDate} onChange={e => setFromDate(e.target.value)} title="Desde" />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>a</span>
          <input type="date" className="form-input" style={{ width: 'auto', padding: '5px 8px', fontSize: 13 }}
            value={toDate} onChange={e => setToDate(e.target.value)} title="Hasta" />
        </>
      )}
    </div>
  )
}

// Orden: prioridad más alta primero; a igual prioridad, la asignada primero (más vieja arriba)
const PRIORITY_ORDER = { urgente: 0, alta: 1, media: 2, baja: 3 }
export function sortByPriorityAndAge(list) {
  return [...list].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.prioridad] ?? 4
    const pb = PRIORITY_ORDER[b.prioridad] ?? 4
    if (pa !== pb) return pa - pb
    const ca = a.createdAt?.toMillis?.() || 0
    const cb = b.createdAt?.toMillis?.() || 0
    return ca - cb
  })
}

function fmtStamp(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }) +
    ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(seconds) {
  if (!seconds) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// Urgencia por fecha de vencimiento — mismos colores que las prioridades
export function dueInfo(task) {
  if (!task.fechaVencimiento || task.estado === 'completada') return null
  const ms = task.fechaVencimiento.toMillis ? task.fechaVencimiento.toMillis() : task.fechaVencimiento.seconds * 1000
  const days = (ms - Date.now()) / 86400000
  if (days < 0)  return { label: 'VENCIDA', color: 'var(--danger)', bg: 'rgba(239,68,68,0.12)' }
  if (days <= 1) return { label: 'Vence hoy', color: 'var(--danger)', bg: 'rgba(239,68,68,0.12)' }
  if (days <= 3) return { label: `Vence en ${Math.ceil(days)} días`, color: 'var(--warning)', bg: 'rgba(245,158,11,0.12)' }
  if (days <= 7) return { label: `Vence en ${Math.ceil(days)} días`, color: 'var(--info)', bg: 'rgba(59,130,246,0.12)' }
  return { label: `Vence en ${Math.ceil(days)} días`, color: 'var(--success)', bg: 'rgba(34,197,94,0.12)' }
}

export default function KanbanView() {
  const { tasks, users, agents, isAdmin, user, userProfile, showToast, openEditTask, sendNotification } = useApp()
  const [dragOver, setDragOver] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  // Filtro por miembro: '' = todo el equipo. Empleados arrancan viendo lo suyo.
  const [filterUid, setFilterUid] = useState(isAdmin ? '' : user.uid)
  // Filtro por periodo
  const [period, setPeriod] = useState('all')
  const [monthVal, setMonthVal] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  // "Cargar más" por columna
  const [visibleCounts, setVisibleCounts] = useState({})

  // Las tareas pueden estar asignadas a un empleado o a un agente de IA
  const getUserById = (uid) => users.find(u => u.uid === uid)
    || ((a) => a && { uid: a.id, name: `${a.name} (agente)`, color: a.look?.torso, photo: a.photo || '' })(agents.find(a => a.id === uid))
  const visibleTasks = tasks
    .filter(t => !filterUid || t.asignado === filterUid)
    .filter(t => inPeriod(t, period, monthVal, fromDate, toDate))

  const canMoveTask = (task) => {
    if (isAdmin) return true
    return task.asignado === user.uid
  }

  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('taskId', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, colId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(colId)
  }

  const handleDragLeave = () => setDragOver(null)

  const handleDrop = async (e, newStatus) => {
    e.preventDefault()
    setDragOver(null)
    const taskId = e.dataTransfer.getData('taskId')
    if (!taskId) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    await moveTask(task, newStatus)
  }

  // Mover tarea a un nuevo estado (usado por drag & drop Y por los botones ◀ ▶)
  const moveTask = async (task, newStatus) => {
    if (!task || task.estado === newStatus) return

    if (!canMoveTask(task)) {
      showToast('Solo puedes mover tus propias tareas', 'error')
      return
    }

    // Límite de tareas simultáneas: máximo 2 En Progreso por empleado
    if (newStatus === 'en_progreso' && wipLimitReached(tasks, task.asignado, task.id)) {
      showToast(`Máximo ${WIP_LIMIT} tareas En Progreso. Termina una o devuélvela a Pendiente antes de tomar otra`, 'error')
      return
    }

    const updates = {
      estado: newStatus,
      lastEditedBy: user.email,
      lastEditedAt: serverTimestamp(),
    }

    // Lógica de timer
    if (newStatus === 'en_progreso' && task.estado !== 'en_progreso') {
      const returnedFromReview = ['en_revision', 'en_espera'].includes(task.estado) && task.asignado !== user.uid
      if (returnedFromReview) {
        // El admin la devuelve desde Revisión: espera aceptación, sin timer
        updates.timerStartedAt = null
        updates.timerPaused = true
        updates.pendingAcceptance = true
        updates.returnedBy = userProfile?.name || user.email
      } else {
        // Cualquier otro caso: el timer arranca de inmediato
        updates.timerStartedAt = serverTimestamp()
        updates.timerPaused = false
        updates.pendingAcceptance = false
      }
      if (!task.fechaInicio) updates.fechaInicio = serverTimestamp()
    }
    if (task.estado === 'en_progreso' && newStatus !== 'en_progreso') {
      if (task.timerStartedAt && !task.timerPaused) {
        const elapsed = Math.floor(
          (Date.now() - (task.timerStartedAt.toMillis?.() || task.timerStartedAt.seconds * 1000)) / 1000
        )
        updates.totalTimeSeconds = (task.totalTimeSeconds || 0) + elapsed
        logWork(task.asignado, elapsed)
      }
      updates.timerStartedAt = null
      updates.timerPaused = false
    }
    // Marca de completado: quién, cuándo, cuánto demoró
    if (newStatus === 'completada') {
      updates.fechaEntrega = serverTimestamp()
      updates.completedBy = userProfile?.name || user.email
      updates.completedByEmail = user.email
      // Entregas de agentes: el motor copia la versión aprobada a Drive
      if (task.agentOutput) updates.driveSync = 'pendiente'
    }
    // Volver a pendiente: se conserva el tiempo trabajado para seguir acumulando
    if (newStatus === 'pendiente') {
      updates.fechaEntrega = null
      updates.timerStartedAt = null
      updates.timerPaused = false
      updates.completedBy = null
      updates.completedByEmail = null
    }

    try {
      await updateDoc(doc(db, 'tasks', task.id), updates)
      showToast(`Tarea movida a "${COLUMNS.find(c => c.id === newStatus)?.label}"`)
    } catch (err) {
      console.error(err)
      showToast('No se pudo mover la tarea — revisa tus permisos', 'error')
    }
  }

  // Mover a la columna anterior/siguiente con botones (funciona en móvil)
  const moveByStep = (task, dir) => {
    const idx = COLUMNS.findIndex(c => c.id === task.estado)
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= COLUMNS.length) return
    moveTask(task, COLUMNS[newIdx].id)
  }

  const handleDelete = async (task) => {
    if (!isAdmin) return
    if (!confirm(`¿Eliminar "${task.tarea}"? Esta acción no se puede deshacer.`)) return
    await deleteDoc(doc(db, 'tasks', task.id))
    showToast('Tarea eliminada', 'info')
  }

  // Auto-asignarse una tarea pendiente de otro (o sin asignar)
  const handleClaim = async (task) => {
    if (task.estado !== 'pendiente') { showToast('Solo puedes asignarte tareas pendientes', 'error'); return }
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        asignado: user.uid,
        lastEditedBy: user.email,
        lastEditedAt: serverTimestamp(),
      })
      showToast(`Te asignaste "${task.tarea}"`)
    } catch (e) {
      console.error(e)
      showToast('No se pudo asignar la tarea', 'error')
    }
  }

  const handleDuplicate = async (task) => {
    try {
      await duplicateTask(task, user.email)
      showToast(`Tarea duplicada: "${task.tarea} (copia)" quedó en Pendiente`)
    } catch (e) {
      console.error(e)
      showToast('No se pudo duplicar la tarea', 'error')
    }
  }

  // Pausar / reanudar timer de una tarea en progreso
  const handlePauseResume = async (task) => {
    if (!task.timerPaused) {
      const startMs = task.timerStartedAt?.toMillis?.() || (task.timerStartedAt?.seconds || 0) * 1000
      const elapsed = startMs ? Math.floor((Date.now() - startMs) / 1000) : 0
      await updateDoc(doc(db, 'tasks', task.id), {
        timerPaused: true,
        timerStartedAt: null,
        totalTimeSeconds: (task.totalTimeSeconds || 0) + elapsed,
        lastEditedBy: user.email,
        lastEditedAt: serverTimestamp(),
      })
      logWork(task.asignado, elapsed)
      showToast('⏸ Timer pausado')
    } else {
      await updateDoc(doc(db, 'tasks', task.id), {
        timerPaused: false,
        pendingAcceptance: false,
        timerStartedAt: serverTimestamp(),
        lastEditedBy: user.email,
        lastEditedAt: serverTimestamp(),
      })
      showToast('▶ Timer reanudado')
    }
  }

  const getColTasks = (colId) => sortByPriorityAndAge(visibleTasks.filter(t => t.estado === colId))

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Flujo de trabajo</span>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-subtitle">
            {isAdmin
              ? 'Arrastra cualquier tarea entre columnas para cambiar su estado'
              : 'Arrastra tus tareas entre columnas · Puedes ver las tareas de todos'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Filtro por miembro del equipo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>
              Ver:
            </span>
            <select
              className="form-select"
              style={{ fontSize: 13, padding: '6px 10px', width: 'auto', minWidth: 150 }}
              value={filterUid}
              onChange={e => setFilterUid(e.target.value)}
            >
              <option value="">Todo el equipo</option>
              <option value={user.uid}>Mis tareas</option>
              {users
                .filter(u => u.uid !== user.uid && u.role !== 'pending')
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map(u => (
                  <option key={u.uid} value={u.uid}>{u.name}</option>
                ))
              }
              {agents.length > 0 && (
                <optgroup label="Agentes de IA">
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          {/* Filtro por periodo */}
          <PeriodFilter
            period={period} setPeriod={setPeriod}
            monthVal={monthVal} setMonthVal={setMonthVal}
            fromDate={fromDate} setFromDate={setFromDate}
            toDate={toDate} setToDate={setToDate}
          />
          <div style={{ display: 'flex', gap: 10, fontSize: 13, color: 'var(--text-3)', alignItems: 'center' }}>
            {COLUMNS.map(c => (
              <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ color: c.color, display: 'inline-flex' }}><Icon name={c.icon} size={16} /></span>
                {getColTasks(c.id).length}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="kanban-board">
        {COLUMNS.map(col => {
          const colTasks = getColTasks(col.id)
          return (
            <div
              key={col.id}
              className={`kanban-col ${dragOver === col.id ? 'drag-over' : ''}`}
              onDragOver={e => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, col.id)}
            >
              <div className="kanban-col-header">
                <span className="kanban-col-title" style={{ color: col.color, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <Icon name={col.icon} size={20} strokeWidth={2.2} /> {col.label}
                </span>
                <span className="kanban-count">{colTasks.length}</span>
              </div>

              {colTasks.length === 0 && (
                <div style={{
                  textAlign: 'center', color: 'var(--text-3)', fontSize: 12,
                  padding: '20px 10px', borderRadius: 6,
                  border: '1px dashed var(--border)', marginTop: 4
                }}>
                  Suelta aquí
                </div>
              )}

              {colTasks.slice(0, visibleCounts[col.id] || PAGE_SIZE).map(task => (
                col.id === 'completada' ? (
                  <CompactCard
                    key={task.id}
                    task={task}
                    assignedUser={getUserById(task.asignado)}
                    draggable={canMoveTask(task)}
                    onDragStart={handleDragStart}
                    onEdit={openEditTask}
                    canDelete={isAdmin}
                    onDelete={handleDelete}
                    onDuplicate={handleDuplicate}
                  />
                ) : (
                  <KanbanCard
                    key={task.id}
                    task={task}
                    assignedUser={getUserById(task.asignado)}
                    draggable={canMoveTask(task)}
                    canEdit={isAdmin || task.asignado === user.uid}
                    canDelete={isAdmin}
                    canPause={task.asignado === user.uid || isAdmin}
                    expanded={expandedId === task.id}
                    onToggleExpand={() => setExpandedId(id => id === task.id ? null : task.id)}
                    onDragStart={handleDragStart}
                    onEdit={openEditTask}
                    onDelete={handleDelete}
                    onPauseResume={handlePauseResume}
                    onMoveStep={moveByStep}
                    onDuplicate={handleDuplicate}
                    canClaim={task.estado === 'pendiente' && task.asignado !== user.uid}
                    onClaim={handleClaim}
                    colIndex={COLUMNS.findIndex(c => c.id === col.id)}
                    totalCols={COLUMNS.length}
                  />
                )
              ))}

              {/* Cargar más */}
              {colTasks.length > (visibleCounts[col.id] || PAGE_SIZE) && (
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
                  onClick={() => setVisibleCounts(v => ({ ...v, [col.id]: (v[col.id] || PAGE_SIZE) + PAGE_SIZE }))}
                >
                  Cargar más ({colTasks.length - (visibleCounts[col.id] || PAGE_SIZE)} restantes)
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Tiempo trabajado acumulado de una tarea; cuenta en vivo si el timer corre
function WorkedTime({ task }) {
  const running = task.estado === 'en_progreso' && task.timerStartedAt && !task.timerPaused
  const calc = () => {
    const base = task.totalTimeSeconds || 0
    if (!running) return base
    const startMs = task.timerStartedAt.toMillis?.() || task.timerStartedAt.seconds * 1000
    return base + Math.floor((Date.now() - startMs) / 1000)
  }
  const [secs, setSecs] = useState(calc)
  useEffect(() => {
    setSecs(calc())
    if (!running) return
    const id = setInterval(() => setSecs(calc()), 30000)
    return () => clearInterval(id)
  }, [task.totalTimeSeconds, task.timerStartedAt?.seconds, task.timerPaused, task.estado])

  if (secs < 60) return null
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
      display: 'inline-flex', alignItems: 'center', gap: 3,
      color: 'var(--purple)', background: 'var(--purple-light)',
    }} title="Tiempo trabajado acumulado en esta tarea">
      <Icon name="clock" size={10} /> {fmtDuration(secs)} trabajado
    </span>
  )
}

// Tarjeta compacta para tareas COMPLETADAS: mitad de tamaño, solo lo esencial
function CompactCard({ task, assignedUser, draggable, onDragStart, onEdit, canDelete, onDelete, onDuplicate }) {
  return (
    <div
      className="kanban-card"
      draggable={draggable}
      onDragStart={draggable ? e => onDragStart(e, task.id) : undefined}
      style={{ padding: '8px 10px', cursor: 'pointer' }}
      onClick={() => onEdit(task)}
      title="Clic para ver detalle"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: 'var(--success)', display: 'inline-flex' }}><Icon name="check" size={13} /></span>
        <span style={{ fontSize: 12, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.tarea}
        </span>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          style={{ width: 22, height: 22, padding: 0 }}
          onClick={e => { e.stopPropagation(); onDuplicate(task) }}
          title="Duplicar como plantilla"
        >
          <Icon name="copy" size={12} />
        </button>
        {canDelete && (
          <button
            className="btn btn-ghost btn-sm btn-icon"
            style={{ width: 22, height: 22, padding: 0, color: 'var(--danger)' }}
            onClick={e => { e.stopPropagation(); onDelete(task) }}
            title="Eliminar"
          >
            <Icon name="trash" size={12} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 10.5, color: 'var(--text-3)', flexWrap: 'wrap' }}>
        <span>{assignedUser?.name?.split(' ')[0] || 'Sin asignar'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <Icon name="calendar" size={10} /> {fmtStamp(task.fechaEntrega).split(' · ')[0] || 'Sin fecha'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'Space Mono' }}>
          <Icon name="clock" size={10} /> {fmtDuration(task.totalTimeSeconds)}
        </span>
        {/* Calificación del super admin */}
        {task.rating > 0 && (
          <span style={{ display: 'inline-flex', gap: 1, color: 'var(--warning)' }} title={`Calificación: ${task.rating}/5`}>
            {Array.from({ length: task.rating }, (_, i) => <Icon key={i} name="star" size={10} filled />)}
          </span>
        )}
      </div>
    </div>
  )
}

function KanbanCard({ task, assignedUser, draggable, canEdit, canDelete, canPause, expanded, onToggleExpand, onDragStart, onEdit, onDelete, onPauseResume, onMoveStep, onDuplicate, canClaim, onClaim, colIndex, totalCols }) {
  const isPausedActive = task.timerPaused && task.estado === 'en_progreso'
  const due = dueInfo(task)
  // Colapsar/expandir la tarjeta completa (en cualquier etapa)
  const [collapsed, setCollapsed] = useState(false)

  if (collapsed) {
    return (
      <div
        className="kanban-card"
        draggable={draggable}
        onDragStart={draggable ? e => onDragStart(e, task.id) : undefined}
        style={{ padding: '8px 10px', cursor: draggable ? 'grab' : 'default' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {task.tarea}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {assignedUser?.name || 'Sin asignar'}
            </div>
          </div>
          {due && <span style={{ width: 8, height: 8, borderRadius: '50%', background: due.color, flexShrink: 0 }} title={due.label} />}
          <button
            className="btn btn-ghost btn-sm btn-icon"
            style={{ width: 24, height: 24, padding: 0 }}
            onClick={() => setCollapsed(false)}
            title="Expandir tarjeta"
          >
            <Icon name="chevronDown" size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="kanban-card"
      draggable={draggable}
      onDragStart={draggable ? e => onDragStart(e, task.id) : undefined}
      style={{ cursor: draggable ? 'grab' : 'default' }}
      title={draggable ? 'Arrastra para mover' : undefined}
    >
      {/* Vencimiento + colapsar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: due ? 6 : 0 }}>
        {due ? (
          <div style={{
            fontSize: 10.5, fontWeight: 700, color: due.color,
            background: due.bg, borderRadius: 6,
            padding: '3px 8px', display: 'inline-block'
          }}>
            {due.label}
          </div>
        ) : <span />}
        <button
          className="btn btn-ghost btn-sm btn-icon"
          style={{ width: 24, height: 24, padding: 0, flexShrink: 0 }}
          onClick={() => setCollapsed(true)}
          title="Colapsar tarjeta"
        >
          <Icon name="chevronUp" size={14} />
        </button>
      </div>
      {/* Botones mover ◀ ▶ — la forma principal de mover en móvil */}
      {draggable && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 12px', fontSize: 13, opacity: colIndex === 0 ? 0.25 : 1 }}
            disabled={colIndex === 0}
            onClick={() => onMoveStep(task, -1)}
            title="Mover a la columna anterior"
          >
            <Icon name="chevronL" size={14} />
          </button>
          <button
            className="btn btn-secondary btn-sm"
            style={{ padding: '4px 12px', fontSize: 13, opacity: colIndex === totalCols - 1 ? 0.25 : 1 }}
            disabled={colIndex === totalCols - 1}
            onClick={() => onMoveStep(task, 1)}
            title="Mover a la siguiente columna"
          >
            <Icon name="chevronR" size={14} />
          </button>
        </div>
      )}

      <div className="kanban-card-title">{task.tarea}</div>

      <div className="kanban-card-meta">
        <span className={`badge badge-${task.prioridad}`} style={{ fontSize: 10 }}>
          {task.prioridad}
        </span>
        <WorkedTime task={task} />
        {task.tiempoEstimadoMin > 0 && (() => {
          const overrun = (task.totalTimeSeconds || 0) > task.tiempoEstimadoMin * 60
          return (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
              display: 'inline-flex', alignItems: 'center', gap: 3,
              color: overrun ? 'var(--danger)' : 'var(--text-3)',
              background: overrun ? 'rgba(239,68,68,0.12)' : 'var(--bg-2)',
            }} title={overrun ? 'Superó el tiempo estimado' : 'Tiempo estimado'}>
              <Icon name="timer" size={10} />
              {task.tiempoEstimadoMin < 60 ? `${task.tiempoEstimadoMin}m` : `${(task.tiempoEstimadoMin / 60).toFixed(task.tiempoEstimadoMin % 60 ? 1 : 0)}h`}
              {overrun && ' excedido'}
            </span>
          )
        })()}
        {task.cliente && (
          <span style={{ fontSize: 11, color: 'var(--text-3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.cliente}
          </span>
        )}
      </div>

      {/* Asignado + estado timer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
        {assignedUser?.photo
          ? <img src={assignedUser.photo} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
          : <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: assignedUser?.color || '#4700E0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 9, fontWeight: 700, color: '#fff'
            }}>
              {(assignedUser?.name || '?')[0].toUpperCase()}
            </div>
        }
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
          {assignedUser?.name?.split(' ')[0] || '—'}
        </span>
        {task.estado === 'en_progreso' && (
          <span style={{
            marginLeft: 'auto', fontSize: 10,
            color: task.pendingAcceptance ? 'var(--warning)' : isPausedActive ? 'var(--danger)' : 'var(--purple)',
            background: task.pendingAcceptance ? 'rgba(245,158,11,0.12)' : isPausedActive ? 'rgba(239,68,68,0.1)' : 'var(--purple-light)',
            padding: '1px 5px', borderRadius: 4
          }}>
            {task.pendingAcceptance ? 'por aceptar' : isPausedActive ? 'pausado' : 'activo'}
          </span>
        )}
      </div>

      {/* Marca de completado */}
      {task.estado === 'completada' && task.fechaEntrega && (
        <div style={{
          marginTop: 8, padding: '6px 8px', borderRadius: 6,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          fontSize: 10.5, color: 'var(--success)', lineHeight: 1.5
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="check" size={11} /> <strong>{task.completedBy || task.lastEditedBy || '—'}</strong></span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="clock" size={11} /> Duración: {fmtDuration(task.totalTimeSeconds)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="calendar" size={11} /> {fmtStamp(task.fechaEntrega)}</span>
        </div>
      )}

      {/* Detalle expandido */}
      {expanded && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 6,
          background: 'var(--bg-2)', fontSize: 12, lineHeight: 1.6, color: 'var(--text-2)'
        }}>
          {task.descripcion
            ? <p style={{ margin: 0, fontSize: 12 }}>{task.descripcion}</p>
            : <p style={{ margin: 0, fontSize: 12, fontStyle: 'italic', color: 'var(--text-3)' }}>Sin descripción</p>}
          {task.linkTerminada && (
            <div style={{ marginTop: 6 }}>
              <a href={task.linkTerminada} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                <Icon name="check" size={11} /> Tarea terminada: {task.linkTerminada}
              </a>
            </div>
          )}
          {task.links && (
            <div style={{ marginTop: 6 }}>
              <a href={task.links} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Icon name="link" size={11} /> {task.links}
              </a>
            </div>
          )}
          {task.createdAt?.toDate && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="clock" size={11} /> Asignada: {fmtStamp(task.createdAt)}
            </div>
          )}
          {task.feedback && (
            <div style={{ marginTop: 6, fontSize: 11.5, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <Icon name="info" size={11} style={{ marginTop: 2 }} /> {task.feedback}
            </div>
          )}
          {task.fechaRequerimiento && (
            <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="calendar" size={11} /> Requerida: {fmtStamp(task.fechaRequerimiento).split(' · ')[0]}
            </div>
          )}
        </div>
      )}

      {/* Auto-asignarse tarea pendiente */}
      {canClaim && (
        <button
          className="btn btn-secondary btn-sm"
          style={{ width: '100%', justifyContent: 'center', marginTop: 8, fontSize: 11.5 }}
          onClick={() => onClaim(task)}
          title="Tomar esta tarea para ti"
        >
          <Icon name="user" size={12} /> Asignármela
        </button>
      )}

      {/* Botones de acción */}
      <div style={{ display: 'flex', gap: 4, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
        {/* Pausa/Play para tareas en progreso */}
        {task.estado === 'en_progreso' && canPause && !task.pendingAcceptance && (
          <button
            className="btn btn-ghost btn-sm"
            style={{
              flex: 1, fontSize: 11, padding: '3px 6px', justifyContent: 'center',
              color: isPausedActive ? 'var(--success)' : 'var(--danger)'
            }}
            onClick={() => onPauseResume(task)}
            title={isPausedActive ? 'Reanudar timer' : 'Pausar timer'}
          >
            <Icon name={isPausedActive ? 'play' : 'pause'} size={11} /> {isPausedActive ? 'Reanudar' : 'Pausar'}
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1, fontSize: 11, padding: '3px 6px', justifyContent: 'center' }}
          onClick={onToggleExpand}
          title={expanded ? 'Cerrar detalle' : 'Ver detalle'}
        >
          <Icon name={expanded ? 'chevronUp' : 'eye'} size={11} /> {expanded ? 'Cerrar' : 'Ver'}
        </button>
        {canEdit && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ flex: 1, fontSize: 11, padding: '3px 6px', justifyContent: 'center' }}
            onClick={() => onEdit(task)}
            title="Editar tarea"
          >
            <Icon name="edit" size={11} /> Editar
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm"
          style={{ flex: 1, fontSize: 11, padding: '3px 6px', justifyContent: 'center' }}
          onClick={() => onDuplicate(task)}
          title="Duplicar tarea como plantilla"
        >
          <Icon name="copy" size={11} /> Duplicar
        </button>
        {canDelete && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ flex: 1, fontSize: 11, padding: '3px 6px', justifyContent: 'center', color: 'var(--danger)' }}
            onClick={() => onDelete(task)}
            title="Eliminar tarea"
          >
            <Icon name="trash" size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
