import React, { useMemo, useState } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import Icon from '../components/Icons.jsx'
import CATALOGO from '../../../roles/catalogo.json'
import { esDeDepartamento, deptDeAgente } from '../agencia.js'

const ESTADOS = {
  pendiente:   { label: 'Pendiente',          color: 'var(--text-3)' },
  en_progreso: { label: 'En progreso',        color: 'var(--info, #2563eb)' },
  en_espera:   { label: 'Espera aprobación',  color: 'var(--warning, #f59e0b)' },
  en_revision: { label: 'Correcciones',       color: 'var(--danger)' },
  completada:  { label: 'Completada',         color: 'var(--success)' },
}

// Agencia → Tareas: la MISMA colección de tareas que la pestaña Tareas y el Pipeline,
// agrupada por departamento. Las tareas "de departamento" esperan a que alguien las tome.
export default function AgenciaTareas() {
  const { tasks, users, agents, departments, clients, user, showToast, openNewTask, openEditTask } = useApp()
  const [cliente, setCliente] = useState('')
  const [verCompletadas, setVerCompletadas] = useState(false)

  const nombreDe = (id) => users.find(u => u.uid === id)?.name || (agents.find(a => a.id === id)?.name ?? '')
  const visibles = useMemo(() => tasks.filter(t =>
    (!cliente || t.cliente === cliente) && (verCompletadas || t.estado !== 'completada')), [tasks, cliente, verCompletadas])

  const grupos = useMemo(() => {
    const out = departments.filter(d => d.activo !== false).map(d => ({ dept: d, tareas: visibles.filter(t => t.departamentoId === d.id) }))
    const sinDepto = visibles.filter(t => !t.departamentoId || !departments.some(d => d.id === t.departamentoId))
    if (sinDepto.length) out.push({ dept: { id: '', nombre: 'Sin departamento', color: 'var(--text-3)' }, tareas: sinDepto })
    return out
  }, [departments, visibles])

  const asignar = async (t, uid, msg) => {
    try {
      await updateDoc(doc(db, 'tasks', t.id), { asignado: uid, lastEditedBy: user.email, lastEditedAt: serverTimestamp() })
      showToast(msg)
    } catch (e) {
      console.error(e)
      showToast('No se pudo asignar la tarea', 'error')
    }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="btn btn-primary btn-sm" onClick={openNewTask}><Icon name="plus" size={12} /> Nueva tarea</button>
        <select className="form-select" style={{ width: 'auto', minWidth: 160 }} value={cliente} onChange={e => setCliente(e.target.value)}>
          <option value="">Todos los clientes</option>
          {(clients || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5 }}>
          <input type="checkbox" checked={verCompletadas} onChange={e => setVerCompletadas(e.target.checked)} /> Ver completadas
        </label>
        <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>
          Son las mismas tareas de la pestaña Tareas y del Pipeline
        </span>
      </div>

      {grupos.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Crea departamentos para ver aquí sus tareas.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {grupos.map(({ dept, tareas }) => {
          const agentesDepto = agents.filter(a => a.active !== false && deptDeAgente(a, CATALOGO) === dept.id)
          const personasDepto = users.filter(u => u.departamentoId === dept.id && u.role !== 'pending')
          return (
            <div key={dept.id || '_sin'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: dept.color || 'var(--purple)' }} />
                <strong style={{ fontSize: 14 }}>{dept.nombre}</strong>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  {tareas.length} tareas
                  {dept.id && ` · equipo: ${[...personasDepto.map(u => u.name?.split(' ')[0]), ...agentesDepto.map(a => a.name)].join(', ') || 'nadie todavía'}`}
                </span>
              </div>
              {tareas.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 0 18px' }}>Sin tareas.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tareas.map(t => {
                  const porTomar = esDeDepartamento(t)
                  const est = ESTADOS[t.estado] || { label: t.estado, color: 'var(--text-3)' }
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 180, cursor: 'pointer' }} onClick={() => openEditTask(t)}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{t.tarea}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                          {t.cliente || 'Sin cliente'} · {porTomar ? <strong style={{ color: dept.color || 'var(--purple)' }}>por tomar (todo el departamento)</strong> : (nombreDe(t.asignado) || 'Sin asignar')}
                        </div>
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: est.color }}>{est.label}</span>
                      {porTomar && t.estado === 'pendiente' && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => asignar(t, user.uid, `Tomaste "${t.tarea}"`)}>
                            <Icon name="user" size={12} /> Tomarla
                          </button>
                          {agentesDepto.length > 0 && (
                            <select className="form-select" style={{ width: 'auto', fontSize: 12, padding: '4px 8px' }} value=""
                              onChange={e => { const a = agents.find(x => x.id === e.target.value); if (a) asignar(t, a.id, `"${t.tarea}" pasó a ${a.name}`) }}>
                              <option value="">Dar a un agente…</option>
                              {agentesDepto.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
