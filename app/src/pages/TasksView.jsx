import React, { useState, useMemo } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { logWork } from '../utils/worklog.js'
import { dueInfo, duplicateTask, wipLimitReached, WIP_LIMIT } from './KanbanView.jsx'
import Icon from '../components/Icons.jsx'
import { esDeDepartamento } from '../agencia.js'

function fmtDate(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtDuration(seconds) {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function TasksView() {
  const { tasks, users, agents, departments, clients: CLIENTES, isAdmin, user, userProfile, showToast, openEditTask, openNewTask } = useApp()
  const [filters, setFilters] = useState({ member: '', status: '', client: '', month: '', priority: '', dept: '' })
  const [sortBy, setSortBy] = useState('createdAt')
  const [sortDir, setSortDir] = useState('desc')
  // Empleados arrancan viendo solo sus tareas
  const [filterMine, setFilterMine] = useState(!isAdmin)

  // Las tareas pueden estar asignadas a un empleado o a un agente de IA
  const getUserById = (uid) => users.find(u => u.uid === uid)
    || ((a) => a && { uid: a.id, name: `${a.name} (agente)`, color: a.look?.torso, photo: a.photo || '' })(agents.find(a => a.id === uid))
  // Tarea de departamento sin tomar: se muestra el departamento en lugar de "Sin asignar"
  const getAssignee = (task) => {
    if (esDeDepartamento(task)) {
      const d = departments.find(x => x.id === task.departamentoId)
      return { uid: '', name: `${d?.nombre || 'Departamento'} (por tomar)`, color: d?.color || 'var(--purple)', photo: '' }
    }
    return getUserById(task.asignado)
  }

  // Apply filters
  const filtered = useMemo(() => {
    // "Mis tareas" incluye las de mi departamento que nadie ha tomado
    const base = filterMine
      ? tasks.filter(t => t.asignado === user.uid || (esDeDepartamento(t) && t.departamentoId && t.departamentoId === userProfile?.departamentoId))
      : tasks
    return base.filter(t => {
      if (filters.member && t.asignado !== filters.member) return false
      if (filters.dept === '_sin_tomar') { if (!esDeDepartamento(t)) return false }
      else if (filters.dept && t.departamentoId !== filters.dept) return false
      if (filters.status && t.estado !== filters.status) return false
      if (filters.client && t.cliente !== filters.client) return false
      if (filters.priority && t.prioridad !== filters.priority) return false
      if (filters.month) {
        const d = t.createdAt?.toDate?.() || new Date()
        const m = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
        if (m !== filters.month) return false
      }
      return true
    }).sort((a, b) => {
      let av = a[sortBy], bv = b[sortBy]
      if (av?.toMillis) av = av.toMillis()
      if (bv?.toMillis) bv = bv.toMillis()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
  }, [tasks, filters, sortBy, sortDir, filterMine, userProfile])

  const setFilter = (key, val) => setFilters(f => ({ ...f, [key]: val }))
  const clearFilters = () => setFilters({ member: '', status: '', client: '', month: '', priority: '', dept: '' })

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('asc') }
  }

  // Quick status change
  const handleStatusChange = async (task, newStatus) => {
    if (!isAdmin && task.asignado !== user.uid) {
      showToast('Solo puedes cambiar el estado de tus tareas', 'error')
      return
    }
    const updates = {
      estado: newStatus,
      lastEditedBy: user.email,
      lastEditedAt: serverTimestamp(),
    }
    if (newStatus === 'en_progreso' && task.estado !== 'en_progreso') {
      // Límite de tareas simultáneas
      if (wipLimitReached(tasks, task.asignado, task.id)) {
        showToast(`Máximo ${WIP_LIMIT} tareas En Progreso. Termina una o devuélvela a Pendiente antes de tomar otra`, 'error')
        return
      }
      const returnedFromReview = ['en_revision', 'en_espera'].includes(task.estado) && task.asignado !== user.uid
      if (returnedFromReview) {
        // Admin devuelve desde Revisión: espera aceptación del empleado
        updates.timerStartedAt = null
        updates.timerPaused = true
        updates.pendingAcceptance = true
        updates.returnedBy = userProfile?.name || user.email
      } else {
        updates.timerStartedAt = serverTimestamp()
        updates.timerPaused = false
        updates.pendingAcceptance = false
      }
      if (!task.fechaInicio) updates.fechaInicio = serverTimestamp()
    }
    if (task.estado === 'en_progreso' && newStatus !== 'en_progreso') {
      if (task.timerStartedAt && !task.timerPaused) {
        const elapsed = Math.floor((Date.now() - (task.timerStartedAt.toMillis?.() || task.timerStartedAt.seconds * 1000)) / 1000)
        updates.totalTimeSeconds = (task.totalTimeSeconds || 0) + elapsed
        logWork(task.asignado, elapsed)
      }
      updates.timerStartedAt = null
      updates.timerPaused = false
    }
    if (newStatus === 'completada') {
      updates.fechaEntrega = serverTimestamp()
      updates.completedBy = userProfile?.name || user.email
      updates.completedByEmail = user.email
    }
    // Volver a pendiente: se conserva el tiempo trabajado para seguir acumulando
    if (newStatus === 'pendiente') {
      updates.fechaEntrega = null
      updates.timerStartedAt = null
      updates.timerPaused = false
      updates.completedBy = null
      updates.completedByEmail = null
    }
    await updateDoc(doc(db, 'tasks', task.id), updates)
    showToast('Estado actualizado')
  }

  const handleDelete = async (task) => {
    if (!isAdmin) return
    if (!confirm(`¿Eliminar "${task.tarea}"?`)) return
    await deleteDoc(doc(db, 'tasks', task.id))
    showToast('Tarea eliminada', 'info')
  }

  // CSV Export
  const exportCSV = () => {
    const headers = ['Tarea','Descripción','Asignado','Cliente','Prioridad','Estado','Inicio','Entrega','Duración (hrs)','Creado por']
    const rows = filtered.map(t => {
      const u = getAssignee(t)
      const dur = t.totalTimeSeconds ? (t.totalTimeSeconds / 3600).toFixed(2) : ''
      return [
        t.tarea, t.descripcion, u?.name || t.asignado, t.cliente,
        t.prioridad, t.estado,
        fmtDate(t.fechaInicio), fmtDate(t.fechaEntrega),
        dur, t.createdBy
      ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',')
    })
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `tareas-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exportado ✓')
  }

  // Months from task list
  const months = useMemo(() => {
    const set = new Set()
    tasks.forEach(t => {
      if (t.createdAt?.toDate) {
        const d = t.createdAt.toDate()
        set.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
      }
    })
    return [...set].sort().reverse()
  }, [tasks])

  const activeFilters = Object.values(filters).filter(Boolean).length

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Gestión</span>
          <h1 className="page-title">Tareas</h1>
          <p className="page-subtitle">{filtered.length} de {tasks.length} tareas</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Mis tareas / Todas */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--card-2)', borderRadius: 8, padding: 3 }}>
            <button className="btn btn-sm"
              style={{ background: filterMine ? 'var(--purple)' : 'transparent', color: filterMine ? '#fff' : 'var(--text-2)', padding: '5px 12px', fontSize: 12.5 }}
              onClick={() => setFilterMine(true)}>
              Mis tareas
            </button>
            <button className="btn btn-sm"
              style={{ background: !filterMine ? 'var(--purple)' : 'transparent', color: !filterMine ? '#fff' : 'var(--text-2)', padding: '5px 12px', fontSize: 12.5 }}
              onClick={() => setFilterMine(false)}>
              Todas
            </button>
          </div>
          <button className="btn btn-primary btn-sm" onClick={openNewTask}>+ Nueva tarea</button>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="filter-group">
          <span className="filter-label">Miembro</span>
          <select className="form-select" value={filters.member} onChange={e => setFilter('member', e.target.value)}>
            <option value="">Todos</option>
            {users.map(u => <option key={u.uid} value={u.uid}>{u.name}</option>)}
            {agents.length > 0 && (
              <optgroup label="Agentes de IA">
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        {departments.length > 0 && (
          <div className="filter-group">
            <span className="filter-label">Departamento</span>
            <select className="form-select" value={filters.dept} onChange={e => setFilter('dept', e.target.value)}>
              <option value="">Todos</option>
              <option value="_sin_tomar">Por tomar (de departamento)</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
        )}
        <div className="filter-group">
          <span className="filter-label">Estado</span>
          <select className="form-select" value={filters.status} onChange={e => setFilter('status', e.target.value)}>
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_progreso">En progreso</option>
            <option value="en_espera">Espera aprobación</option>
            <option value="en_revision">Correcciones</option>
            <option value="completada">Completada</option>
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Cliente</span>
          <select className="form-select" value={filters.client} onChange={e => setFilter('client', e.target.value)}>
            <option value="">Todos</option>
            {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Prioridad</span>
          <select className="form-select" value={filters.priority} onChange={e => setFilter('priority', e.target.value)}>
            <option value="">Todas</option>
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Mes</span>
          <select className="form-select" value={filters.month} onChange={e => setFilter('month', e.target.value)}>
            <option value="">Todos</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        {activeFilters > 0 && (
          <div style={{ alignSelf: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              ✕ Limpiar ({activeFilters})
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>Sin tareas</h3>
          <p>Ajusta los filtros o crea una nueva tarea</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh label="Tarea" col="tarea" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th>Asignado</th>
                <th>Cliente</th>
                <SortTh label="Prioridad" col="prioridad" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th>Estado</th>
                <SortTh label="Vence" col="fechaVencimiento" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Inicio" col="fechaInicio" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <SortTh label="Entrega" col="fechaEntrega" sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                <th>Duración</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(task => {
                const assignedUser = getAssignee(task)
                const canEdit = isAdmin || (task.asignado === user.uid)
                return (
                  <tr key={task.id} style={{ cursor: 'pointer' }} onClick={() => openEditTask(task)}>
                    <td style={{ maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.tarea}
                      </div>
                      {task.descripcion && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.descripcion}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {assignedUser?.photo
                          ? <img src={assignedUser.photo} alt="" style={{ width: 22, height: 22, borderRadius: '50%' }} />
                          : <div style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: assignedUser?.color || '#4700E0',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700, color: '#fff'
                            }}>
                              {(assignedUser?.name || '?')[0].toUpperCase()}
                            </div>
                        }
                        <span style={{ fontSize: 13 }}>{assignedUser?.name?.split(' ')[0] || '—'}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>{task.cliente}</td>
                    <td><span className={`badge badge-${task.prioridad}`}>{task.prioridad}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      {canEdit ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <select
                            className="form-select"
                            style={{ fontSize: 12, padding: '3px 6px', width: 'auto' }}
                            value={task.estado}
                            onChange={e => handleStatusChange(task, e.target.value)}
                          >
                            <option value="pendiente">Pendiente</option>
                            <option value="en_progreso">En progreso</option>
                            <option value="en_espera">Espera aprobación</option>
                            <option value="en_revision">Correcciones</option>
                            <option value="completada">Completada</option>
                          </select>
                          {task.timerPaused && task.estado === 'en_progreso' && (
                            <span className="badge badge-paused" style={{ fontSize: 10 }}>⏸</span>
                          )}
                        </div>
                      ) : (
                        <span className={`badge ${task.timerPaused && task.estado === 'en_progreso' ? 'badge-paused' : `badge-${task.estado}`}`}>
                          {task.timerPaused && task.estado === 'en_progreso' ? '⏸ En pausa' : task.estado.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                    <td>
                      {(() => {
                        const due = dueInfo(task)
                        if (!due) return <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{fmtDate(task.fechaVencimiento)}</span>
                        return (
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: due.color,
                            background: due.bg, borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap'
                          }}>
                            {fmtDate(task.fechaVencimiento)}
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{fmtDate(task.fechaInicio)}</td>
                    <td style={{ fontSize: 12.5, color: 'var(--text-3)' }}
                      title={task.completedBy ? `Completada por ${task.completedBy}` : undefined}>
                      {fmtDate(task.fechaEntrega)}
                      {task.completedBy && (
                        <div style={{ fontSize: 10.5, color: 'var(--success)' }}>✅ {task.completedBy.split(' ')[0]}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, fontFamily: 'Space Mono' }}>
                      {fmtDuration(task.totalTimeSeconds)}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {canEdit && (
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={() => openEditTask(task)}
                            title="Editar"
                          ><Icon name="edit" size={13} /></button>
                        )}
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={async () => {
                            try {
                              await duplicateTask(task, user.email)
                              showToast(`Tarea duplicada: "${task.tarea} (copia)"`)
                            } catch (e) { showToast('No se pudo duplicar', 'error') }
                          }}
                          title="Duplicar como plantilla"
                        ><Icon name="copy" size={13} /></button>
                        {isAdmin && (
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => handleDelete(task)}
                            title="Eliminar"
                          >✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SortTh({ label, col, sortBy, sortDir, onSort }) {
  const active = sortBy === col
  return (
    <th
      style={{ cursor: 'pointer', userSelect: 'none' }}
      onClick={() => onSort(col)}
    >
      {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  )
}
