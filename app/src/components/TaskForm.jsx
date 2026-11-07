import React, { useState, useEffect } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { doc, addDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore'
import { logWork } from '../utils/worklog.js'
import { sendTaskAssignedEmail } from '../utils/emailNotify.js'
import Icon from './Icons.jsx'
import ReviewPanel from './ReviewPanel.jsx'
import PermisosPicker from './PermisosPicker.jsx'
import CATALOGO from '../../../roles/catalogo.json'
import { toLines, fromLines, DEPT_PREFIX } from '../agencia.js'

export default function TaskForm() {
  const { user, users, agents, clients, clientDocs, departments, taskTypes, userProfile, editingTask, closeTaskForm, showToast, sendNotification, isAdmin, isSuperAdmin } = useApp()
  const CLIENTES = clients || []
  const isEdit = !!editingTask

  const [form, setForm] = useState({
    tarea: '',
    descripcion: '',
    asignado: user.uid,
    cliente: '',
    prioridad: 'media',
    estado: 'pendiente',
    fechaRequerimiento: '',
    fechaVencimiento: '',
    tiempoEstimadoMin: 0,
    links: '',
    linkTerminada: '',
    feedback: '',
    rating: 0,
  })
  // Brief estructurado (Agencia): se guarda aparte del resto de campos de la tarea
  const [brief, setBrief] = useState({
    departamentoId: '', tipoTareaId: '',
    objetivo: '', resultadoEsperado: '', criterios: '', contexto: '', archivos: '', campos: {},
  })
  // Permisos extra del agente solo para esta tarea (grupos del catálogo; solo un admin los cambia)
  const [permisosExtra, setPermisosExtra] = useState([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const setB = (k, v) => { setBrief(b => ({ ...b, [k]: v })); setDirty(true) }
  const tipo = taskTypes.find(t => t.id === brief.tipoTareaId)
  const tiposVisibles = taskTypes.filter(t => !brief.departamentoId || t.departamento === brief.departamentoId)

  // Al elegir un tipo: fija su departamento y, en tareas nuevas, propone al agente con ese rol
  const pickTipo = (id) => {
    const t = taskTypes.find(x => x.id === id)
    setBrief(b => ({ ...b, tipoTareaId: id, departamentoId: t?.departamento || b.departamentoId }))
    if (t && !isEdit) {
      const a = agents.find(a => a.active && a.rol === t.rol)
      setForm(f => ({ ...f, asignado: a ? a.id : f.asignado, tarea: f.tarea || t.nombre }))
    }
    setDirty(true)
  }

  // Populate form for editing
  useEffect(() => {
    if (editingTask) {
      setForm({
        tarea: editingTask.tarea || '',
        descripcion: editingTask.descripcion || '',
        asignado: editingTask.asignado || (editingTask.paraDepartamento && editingTask.departamentoId ? DEPT_PREFIX + editingTask.departamentoId : user.uid),
        cliente: editingTask.cliente || '',
        prioridad: editingTask.prioridad || 'media',
        estado: editingTask.estado || 'pendiente',
        fechaRequerimiento: editingTask.fechaRequerimiento
          ? toDateInputValue(editingTask.fechaRequerimiento)
          : '',
        fechaVencimiento: editingTask.fechaVencimiento
          ? toDateInputValue(editingTask.fechaVencimiento)
          : '',
        tiempoEstimadoMin: editingTask.tiempoEstimadoMin || 0,
        links: editingTask.links || '',
        linkTerminada: editingTask.linkTerminada || '',
        feedback: editingTask.feedback || '',
        rating: editingTask.rating || 0,
      })
      setPermisosExtra(editingTask.permisosExtra || [])
      const b = editingTask.brief || {}
      setBrief({
        departamentoId: editingTask.departamentoId || '', tipoTareaId: editingTask.tipoTareaId || '',
        objetivo: b.objetivo || '', resultadoEsperado: b.resultadoEsperado || '',
        criterios: toLines(b.criteriosAceptacion), contexto: b.contexto || '', archivos: toLines(b.archivos),
        campos: editingTask.briefCampos || {},
      })
    }
  }, [editingTask])

  // Campos de Agencia que se guardan en la tarea
  const deptAsignado = form.asignado.startsWith(DEPT_PREFIX) ? form.asignado.slice(DEPT_PREFIX.length) : ''
  const agencyFields = () => ({
    ...(isAdmin ? { permisosExtra } : {}),
    asignado: deptAsignado ? '' : form.asignado,
    paraDepartamento: !!deptAsignado,
    clienteId: clientDocs.find(c => c.nombre === form.cliente)?.id || '',
    departamentoId: deptAsignado || brief.departamentoId || tipo?.departamento || '',
    tipoTareaId: brief.tipoTareaId || '',
    capacidad: tipo?.capacidad || 'general',
    brief: {
      objetivo: brief.objetivo.trim(), resultadoEsperado: brief.resultadoEsperado.trim(),
      criteriosAceptacion: fromLines(brief.criterios), contexto: brief.contexto.trim(), archivos: fromLines(brief.archivos),
    },
    briefCampos: Object.fromEntries((tipo?.plantillaBrief || []).map(c => [c.campo, String(brief.campos[c.campo] ?? '').trim()])),
  })

  function toDateInputValue(ts) {
    if (!ts) return ''
    const d = ts.toDate ? ts.toDate() : new Date(ts)
    return d.toISOString().split('T')[0]
  }

  const setField = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setDirty(true)
  }

  const canChangeStatus = isAdmin || (editingTask?.asignado === user.uid)

  const computeTimerUpdates = (oldTask, newStatus) => {
    const updates = {}
    if (!oldTask) return updates

    // Starting timer
    if (newStatus === 'en_progreso' && oldTask.estado !== 'en_progreso') {
      updates.timerStartedAt = serverTimestamp()
      updates.timerPaused = false
      if (!oldTask.fechaInicio) updates.fechaInicio = serverTimestamp()
    }
    // Stopping timer
    if (oldTask.estado === 'en_progreso' && newStatus !== 'en_progreso') {
      if (oldTask.timerStartedAt && !oldTask.timerPaused) {
        const elapsed = Math.floor(
          (Date.now() - (oldTask.timerStartedAt.toMillis?.() || oldTask.timerStartedAt.seconds * 1000)) / 1000
        )
        updates.totalTimeSeconds = (oldTask.totalTimeSeconds || 0) + elapsed
        logWork(oldTask.asignado, elapsed)
      }
      updates.timerStartedAt = null
      updates.timerPaused = false
    }
    // Completing: marca de quién y cuándo
    if (newStatus === 'completada') {
      updates.fechaEntrega = serverTimestamp()
      updates.completedBy = userProfile?.name || user.email
      updates.completedByEmail = user.email
      // Entregas de agentes: el motor copia la versión aprobada a Drive
      if (oldTask.agentOutput) updates.driveSync = 'pendiente'
    }
    // Volver a pendiente: el tiempo trabajado se CONSERVA para seguir
    // acumulando al retomarla; solo se limpian las marcas de entrega
    if (newStatus === 'pendiente') {
      updates.fechaEntrega = null
      updates.timerStartedAt = null
      updates.timerPaused = false
      updates.completedBy = null
      updates.completedByEmail = null
    }
    return updates
  }

  // Tarea para todo un departamento: aviso por correo a cada persona que pertenece a él
  const avisarDepartamento = (deptId) => {
    const nombre = departments.find(d => d.id === deptId)?.nombre || deptId
    users.filter(u => u.departamentoId === deptId && u.role !== 'pending' && u.uid !== user.uid && u.email).forEach(u =>
      sendTaskAssignedEmail({
        toEmail: u.email, toName: u.name, taskName: `${form.tarea} (para ${nombre}: la toma quien llegue primero)`,
        cliente: form.cliente, prioridad: form.prioridad, vencimiento: form.fechaVencimiento || '',
        assignedBy: userProfile?.name || user.email,
      }))
  }

  const handleSave = async () => {
    if (!form.tarea.trim()) { showToast('Ingresa el nombre de la tarea', 'error'); return }
    const falta = (tipo?.plantillaBrief || []).find(c => c.requerido && !String(brief.campos[c.campo] ?? '').trim())
    if (falta) { showToast(`Falta "${falta.etiqueta}" en el brief`, 'error'); return }
    if (deptAsignado && form.estado !== 'pendiente') {
      showToast('Una tarea de departamento queda "Pendiente" hasta que alguien la tome', 'error'); return
    }
    setSaving(true)
    try {
      if (isEdit) {
        const timerUpdates = computeTimerUpdates(editingTask, form.estado)
        const updates = {
          ...form,
          ...agencyFields(),
          fechaRequerimiento: form.fechaRequerimiento
            ? new Date(form.fechaRequerimiento + 'T12:00:00')
            : null,
          fechaVencimiento: form.fechaVencimiento
            ? new Date(form.fechaVencimiento + 'T23:59:00')
            : null,
          lastEditedBy: user.email,
          lastEditedAt: serverTimestamp(),
          ...timerUpdates,
        }
        await updateDoc(doc(db, 'tasks', editingTask.id), updates)
        showToast('Tarea actualizada')

        // Notify on timer start
        if (form.estado === 'en_progreso' && editingTask.estado !== 'en_progreso') {
          const assignedUser = users.find(u => u.uid === form.asignado)
          if (form.asignado === user.uid) {
            showToast(`⏱️ ¡Timer iniciado para "${form.tarea}"!`, 'info')
            sendNotification('⏱️ ¡El tiempo está corriendo!', `Tarea: "${form.tarea}"`)
          }
        }

        if (deptAsignado && !(editingTask.paraDepartamento && !editingTask.asignado)) avisarDepartamento(deptAsignado)
        // Notify if newly assigned to someone else
        if (!deptAsignado && form.asignado !== editingTask.asignado) {
          const assignedUser = users.find(u => u.uid === form.asignado)
          if (assignedUser && form.asignado !== user.uid) {
            sendNotification('📋 Nueva tarea asignada', `"${form.tarea}" fue asignada a ${assignedUser.name}`)
            // Email al asignado (fire-and-forget)
            if (assignedUser.email) {
              sendTaskAssignedEmail({
                toEmail: assignedUser.email,
                toName: assignedUser.name,
                taskName: form.tarea,
                cliente: form.cliente,
                prioridad: form.prioridad,
                vencimiento: form.fechaVencimiento || '',
                assignedBy: userProfile?.name || user.email,
              })
            }
          }
        }
      } else {
        const newTask = {
          ...form,
          ...agencyFields(),
          creadaPor: 'equipo',
          fechaRequerimiento: form.fechaRequerimiento
            ? new Date(form.fechaRequerimiento + 'T12:00:00')
            : null,
          fechaVencimiento: form.fechaVencimiento
            ? new Date(form.fechaVencimiento + 'T23:59:00')
            : null,
          fechaInicio: null,
          fechaEntrega: null,
          timerStartedAt: null,
          totalTimeSeconds: 0,
          createdAt: serverTimestamp(),
          createdBy: user.email,
          lastEditedBy: user.email,
          lastEditedAt: serverTimestamp(),
        }
        if (form.estado === 'en_progreso') {
          newTask.timerStartedAt = serverTimestamp()
          newTask.fechaInicio = serverTimestamp()
        }
        await addDoc(collection(db, 'tasks'), newTask)
        showToast('Tarea creada ✓')
        if (deptAsignado) avisarDepartamento(deptAsignado)

        // Email si la tarea es para otra persona
        if (!deptAsignado && form.asignado !== user.uid) {
          const assignedUser = users.find(u => u.uid === form.asignado)
          if (assignedUser?.email) {
            sendTaskAssignedEmail({
              toEmail: assignedUser.email,
              toName: assignedUser.name,
              taskName: form.tarea,
              cliente: form.cliente,
              prioridad: form.prioridad,
              vencimiento: form.fechaVencimiento || '',
              assignedBy: userProfile?.name || user.email,
            })
          }
        }
      }
      closeTaskForm()
    } catch (e) {
      console.error(e)
      const detail = e?.code === 'permission-denied' ? 'sin permisos' : (e?.code || e?.message || '')
      showToast(`Error al guardar${detail ? ` (${detail})` : ''}`, 'error')
    }
    setSaving(false)
  }

  // Empleados: pueden ver tareas de otros pero no editarlas
  const readOnly = isEdit && !isAdmin && editingTask.asignado !== user.uid

  // Cerrar solo con Cancelar (o la X); si hay cambios sin guardar, confirmar
  const handleCancel = () => {
    if (dirty && !readOnly && !confirm('Tienes cambios sin guardar. ¿Descartarlos y cerrar?')) return
    closeTaskForm()
  }

  // Tiempo trabajado acumulado (incluye la sesión en curso si el timer corre)
  const liveSeconds = (() => {
    if (!isEdit) return 0
    const base = editingTask.totalTimeSeconds || 0
    if (editingTask.estado === 'en_progreso' && editingTask.timerStartedAt && !editingTask.timerPaused) {
      const startMs = editingTask.timerStartedAt.toMillis?.() || editingTask.timerStartedAt.seconds * 1000
      return base + Math.floor((Date.now() - startMs) / 1000)
    }
    return base
  })()
  const fmtWorked = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    // Clic afuera NO cierra el formulario: evita perder lo que se está escribiendo
    <div className="modal-overlay">
      <div className={`modal ${isEdit && editingTask.agentOutput ? 'modal-wide' : ''}`}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? 'Editar tarea' : 'Nueva tarea'}</h2>
          <button className="icon-btn" onClick={handleCancel} title="Cerrar">✕</button>
        </div>

        {/* Tiempo trabajado acumulado en esta tarea */}
        {isEdit && liveSeconds > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '10px 14px', borderRadius: 10, marginBottom: 16,
            background: 'var(--purple-light)', border: '1px solid var(--purple-mid)'
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Tiempo trabajado acumulado</span>
            <span style={{ fontFamily: 'Space Mono', fontWeight: 700, color: 'var(--purple)' }}>
              {fmtWorked(liveSeconds)}
              {editingTask.tiempoEstimadoMin > 0 && (
                <span style={{ color: 'var(--text-3)', fontWeight: 400 }}> / {fmtWorked(editingTask.tiempoEstimadoMin * 60)} estimado</span>
              )}
            </span>
          </div>
        )}

        {isEdit && <ReviewPanel task={editingTask} onDone={closeTaskForm} />}

        {readOnly ? (
          <ReadOnlyTask task={editingTask} users={users} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Tarea */}
            <div className="form-group">
              <label className="form-label">Nombre de la tarea *</label>
              <input
                className="form-input"
                value={form.tarea}
                onChange={e => setField('tarea', e.target.value)}
                placeholder="¿Qué hay que hacer?"
                autoFocus
              />
            </div>

            {/* Link de la tarea terminada */}
            <div className="form-group">
              <label className="form-label">Link de la tarea terminada</label>
              <input
                className="form-input"
                value={form.linkTerminada}
                onChange={e => setField('linkTerminada', e.target.value)}
                placeholder="https://... (entregable final)"
              />
            </div>

            {/* Link de recursos */}
            <div className="form-group">
              <label className="form-label">Link de recursos</label>
              <input
                className="form-input"
                value={form.links}
                onChange={e => setField('links', e.target.value)}
                placeholder="https://... (materiales, referencias)"
              />
            </div>

            {/* Descripción */}
            <div className="form-group">
              <label className="form-label">Descripción</label>
              <textarea
                className="form-textarea"
                value={form.descripcion}
                onChange={e => setField('descripcion', e.target.value)}
                placeholder="Detalles, contexto, instrucciones..."
                rows={3}
              />
            </div>

            <div className="form-row">
              {/* Asignado */}
              <div className="form-group">
                <label className="form-label">Asignado a</label>
                <select
                  className="form-select"
                  value={form.asignado}
                  onChange={e => {
                    const v = e.target.value
                    setField('asignado', v)
                    if (v.startsWith(DEPT_PREFIX)) setB('departamentoId', v.slice(DEPT_PREFIX.length))
                  }}
                  disabled={!isAdmin}
                >
                  {departments.some(d => d.activo !== false) && (
                    <optgroup label="Departamento (lo toma cualquiera)">
                      {departments.filter(d => d.activo !== false).map(d => (
                        <option key={d.id} value={DEPT_PREFIX + d.id}>{d.nombre} · todo el equipo</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Equipo">
                    {users.filter(u => u.role !== 'pending').map(u => (
                      <option key={u.uid} value={u.uid}>{u.name}</option>
                    ))}
                  </optgroup>
                  {agents.some(a => a.active || a.id === form.asignado) && (
                    <optgroup label="Agentes de IA">
                      {agents.filter(a => a.active || a.id === form.asignado).map(a => (
                        <option key={a.id} value={a.id}>{a.name} · {a.role}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Cliente */}
              <div className="form-group">
                <label className="form-label">Cliente</label>
                <select
                  className="form-select"
                  value={form.cliente}
                  onChange={e => setField('cliente', e.target.value)}
                >
                  <option value="">— Selecciona —</option>
                  {CLIENTES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Agencia: departamento, tipo de tarea y brief */}
            {(departments.length > 0 || taskTypes.length > 0) && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Departamento</label>
                  <select className="form-select" value={brief.departamentoId} onChange={e => setB('departamentoId', e.target.value)}>
                    <option value="">— Selecciona —</option>
                    {departments.filter(d => d.activo !== false).map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de tarea</label>
                  <select className="form-select" value={brief.tipoTareaId} onChange={e => pickTipo(e.target.value)}>
                    <option value="">Libre (sin plantilla)</option>
                    {tiposVisibles.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                  </select>
                </div>
              </div>
            )}
            {isAdmin && (agents.some(a => a.id === form.asignado) || deptAsignado) && (() => {
              const ag = agents.find(a => a.id === form.asignado)
              const base = {
                ...Object.fromEntries((tipo?.herramientas || []).map(g => [g, 'del tipo de tarea'])),
                ...Object.fromEntries((ag ? CATALOGO.roles[ag.rol]?.herramientas || [] : []).map(g => [g, 'ya lo tiene el rol'])),
              }
              return (
                <details open={permisosExtra.length > 0} style={{ padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 10 }}>
                  <summary className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                    Permisos del agente para esta tarea{permisosExtra.length ? ` (${permisosExtra.length} extra)` : ''}
                  </summary>
                  <div style={{ marginTop: 10 }}>
                    <PermisosPicker value={permisosExtra} onChange={v => { setPermisosExtra(v); setDirty(true) }} base={base} />
                    <p style={{ fontSize: 11, color: 'var(--text-3)', margin: '8px 0 0' }}>
                      Solo para esta tarea. Los marcados en rojo dan acceso a tus datos personales. Nunca se le da al agente la terminal (Bash).
                    </p>
                  </div>
                </details>
              )
            })()}
            {tipo?.plantillaBrief?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 10 }}>
                <span className="form-label" style={{ margin: 0 }}>Brief: {tipo.nombre}</span>
                {tipo.plantillaBrief.map(c => (
                  <div className="form-group" key={c.campo}>
                    <label className="form-label">{c.etiqueta}{c.requerido ? ' *' : ''}</label>
                    {c.tipo === 'texto_largo'
                      ? <textarea className="form-textarea" rows={3} value={brief.campos[c.campo] ?? ''} onChange={e => setB('campos', { ...brief.campos, [c.campo]: e.target.value })} />
                      : <input className="form-input" type={c.tipo === 'numero' ? 'number' : c.tipo === 'url' ? 'url' : 'text'}
                          value={brief.campos[c.campo] ?? ''} onChange={e => setB('campos', { ...brief.campos, [c.campo]: e.target.value })} />}
                  </div>
                ))}
              </div>
            )}
            <details open={!!(brief.objetivo || brief.criterios || brief.resultadoEsperado)}>
              <summary className="form-label" style={{ cursor: 'pointer' }}>Brief detallado (objetivo, resultado esperado, criterios, archivos)</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
                <div className="form-group">
                  <label className="form-label">Objetivo</label>
                  <input className="form-input" value={brief.objetivo} onChange={e => setB('objetivo', e.target.value)} placeholder="¿Para qué es esta tarea?" />
                </div>
                <div className="form-group">
                  <label className="form-label">Resultado esperado</label>
                  <input className="form-input" value={brief.resultadoEsperado} onChange={e => setB('resultadoEsperado', e.target.value)} placeholder="¿Qué se entrega exactamente?" />
                </div>
                <div className="form-group">
                  <label className="form-label">Criterios de aceptación</label>
                  <textarea className="form-textarea" rows={3} value={brief.criterios} onChange={e => setB('criterios', e.target.value)} placeholder="Uno por línea. El agente revisor los verifica." />
                </div>
                <div className="form-group">
                  <label className="form-label">Contexto adicional</label>
                  <textarea className="form-textarea" rows={2} value={brief.contexto} onChange={e => setB('contexto', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Archivos</label>
                  <textarea className="form-textarea" rows={2} value={brief.archivos} onChange={e => setB('archivos', e.target.value)}
                    placeholder="Uno por línea: links, o rutas dentro de la carpeta de la agencia en Drive (ej. SAOR/fotos/obra1.jpg)" />
                </div>
              </div>
            </details>

            <div className="form-row">
              {/* Prioridad */}
              <div className="form-group">
                <label className="form-label">Prioridad</label>
                <select
                  className="form-select"
                  value={form.prioridad}
                  onChange={e => setField('prioridad', e.target.value)}
                >
                  <option value="urgente">🔴 Urgente</option>
                  <option value="alta">🟠 Alta</option>
                  <option value="media">🔵 Media</option>
                  <option value="baja">🟢 Baja</option>
                </select>
              </div>

              {/* Estado */}
              <div className="form-group">
                <label className="form-label">Estado</label>
                <select
                  className="form-select"
                  value={form.estado}
                  onChange={e => setField('estado', e.target.value)}
                  disabled={!canChangeStatus}
                >
                  <option value="pendiente">⏳ Pendiente</option>
                  <option value="en_progreso">⚡ En Progreso</option>
                  <option value="en_espera">🕓 Espera Aprobación</option>
                  <option value="en_revision">🔧 Correcciones</option>
                  <option value="completada">✅ Completada</option>
                </select>
              </div>
            </div>

            {/* Fechas */}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha de requerimiento</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.fechaRequerimiento}
                  onChange={e => setField('fechaRequerimiento', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de vencimiento</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.fechaVencimiento}
                  onChange={e => setField('fechaVencimiento', e.target.value)}
                />
              </div>
            </div>

            {/* Tiempo estimado de ejecución */}
            <div className="form-group">
              <label className="form-label">Tiempo estimado de ejecución</label>
              <select
                className="form-select"
                value={form.tiempoEstimadoMin || 0}
                onChange={e => setField('tiempoEstimadoMin', Number(e.target.value))}
              >
                <option value={0}>Sin límite definido</option>
                {[15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480].map(m => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minutos` : `${m / 60} hora${m > 60 ? 's' : ''}${m % 60 ? ` ${m % 60} min` : ''}`}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Si el empleado supera este tiempo, recibirá un aviso de que está tardando más de lo previsto.
              </span>
            </div>

            {/* Feedback */}
            <div className="form-group">
              <label className="form-label">Feedback / Notas del cliente</label>
              <textarea
                className="form-textarea"
                value={form.feedback}
                onChange={e => setField('feedback', e.target.value)}
                placeholder="Comentarios, observaciones..."
                rows={2}
              />
            </div>

            {/* Calificación (solo tareas completadas; edita solo el Super Admin) */}
            {isEdit && (editingTask.estado === 'completada' || form.estado === 'completada') && (
              <div className="form-group">
                <label className="form-label">Calificación del trabajo</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      disabled={!isSuperAdmin}
                      onClick={() => isSuperAdmin && setField('rating', form.rating === n ? 0 : n)}
                      style={{
                        background: 'transparent', border: 'none', padding: 2,
                        cursor: isSuperAdmin ? 'pointer' : 'default',
                        color: (form.rating || 0) >= n ? 'var(--warning)' : 'var(--text-3)',
                      }}
                      title={isSuperAdmin ? `Calificar con ${n} estrella${n > 1 ? 's' : ''}` : 'Solo el Super Admin califica'}
                    >
                      <Icon name="star" size={26} filled={(form.rating || 0) >= n} />
                    </button>
                  ))}
                  <span style={{ fontSize: 12.5, color: 'var(--text-3)', marginLeft: 8 }}>
                    {form.rating
                      ? ['', 'Necesita mejorar', 'Regular', 'Bien', 'Muy bien', 'Excelente'][form.rating]
                      : isSuperAdmin ? 'Sin calificar' : 'Aún sin calificación'}
                  </span>
                </div>
                {!isSuperAdmin && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    La calificación la asigna la dirección al revisar tu trabajo.
                  </span>
                )}
              </div>
            )}

            {/* Edit info */}
            {isEdit && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', paddingTop: 4, borderTop: '1px solid var(--border)', lineHeight: 1.7 }}>
                {editingTask.createdAt?.toDate && (
                  <div>
                    Creada: {editingTask.createdAt.toDate().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {' a las '}
                    {editingTask.createdAt.toDate().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    {editingTask.createdBy && <> · por {editingTask.createdBy}</>}
                  </div>
                )}
                {editingTask.lastEditedBy && <div>Última edición: {editingTask.lastEditedBy}</div>}
              </div>
            )}
          </div>
        )}

        {!readOnly && (
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={handleCancel}>Cancelar</button>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear tarea'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ReadOnlyTask({ task, users }) {
  const u = users.find(u => u.uid === task.asignado)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ fontSize: 17, fontWeight: 700 }}>{task.tarea}</h3>
      {task.descripcion && <p style={{ fontSize: 14 }}>{task.descripcion}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span className={`badge badge-${task.estado}`}>{task.estado.replace('_', ' ')}</span>
        <span className={`badge badge-${task.prioridad}`}>{task.prioridad}</span>
        {task.cliente && <span className="badge" style={{ background: 'var(--card-2)', color: 'var(--text-2)' }}>{task.cliente}</span>}
      </div>
      {u && (
        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
          Asignada a: <strong>{u.name}</strong>
        </div>
      )}
      {task.feedback && (
        <div>
          <p className="form-label">Feedback</p>
          <p style={{ fontSize: 13 }}>{task.feedback}</p>
        </div>
      )}
    </div>
  )
}
