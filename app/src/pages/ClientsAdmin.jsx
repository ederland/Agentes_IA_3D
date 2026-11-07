import React, { useState, useEffect } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { doc, setDoc, getDocs, query, where, collection, writeBatch } from 'firebase/firestore'
import ClientProfile from '../components/ClientProfile.jsx'
import { emptyClient, slugify } from '../agencia.js'

export default function ClientsAdmin() {
  const { clients, clientList, clientDocs, departments, tasks, users, user, showToast } = useApp()

  const tsToMs = (ts) => ts ? (ts.toMillis ? ts.toMillis() : ts.seconds * 1000) : 0

  // Informe por cliente: tareas, horas, equipo asignado, antigüedad y estado
  const clientStats = clients.map(c => {
    const clientTasks = tasks.filter(t => t.cliente === c)
    const done = clientTasks.filter(t => t.estado === 'completada')
    const seconds = clientTasks.reduce((a, t) => a + (t.totalTimeSeconds || 0), 0)

    // Empleados que trabajan (o trabajaron) en este cliente
    const workerUids = [...new Set(clientTasks.map(t => t.asignado).filter(Boolean))]
    const workers = workerUids.map(uid => users.find(u => u.uid === uid)).filter(Boolean)

    // Antigüedad: primera tarea registrada del cliente
    const firstMs = Math.min(...clientTasks.map(t => tsToMs(t.createdAt)).filter(Boolean), Infinity)
    const since = firstMs !== Infinity ? new Date(firstMs) : null

    // Estado: activo si tiene tareas abiertas o actividad en los últimos 30 días
    const hasOpen = clientTasks.some(t => t.estado !== 'completada')
    const lastMs = Math.max(...clientTasks.map(t => tsToMs(t.lastEditedAt) || tsToMs(t.createdAt)), 0)
    const active = hasOpen || (Date.now() - lastMs < 30 * 24 * 3600 * 1000)

    return { name: c, total: clientTasks.length, done: done.length, hours: seconds / 3600, workers, since, active }
  }).filter(s => s.total > 0).sort((a, b) => b.hours - a.hours)
  const maxHours = Math.max(...clientStats.map(s => s.hours), 0.1)

  const fmtSince = (d) => d ? d.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }) : 'Sin datos'
  const [newClient, setNewClient] = useState('')
  const [saving, setSaving] = useState(false)
  const [profileOf, setProfileOf] = useState(null)
  const docByName = new Map(clientDocs.map(c => [c.nombre, c]))

  // La lista vieja (config/clients) se mantiene en sincronía para las pantallas que solo usan nombres
  const saveClients = (list) => setDoc(doc(db, 'config', 'clients'), { list })

  const newId = (nombre) => {
    const ids = new Set(clientDocs.map(c => c.id))
    let id = slugify(nombre) || 'cliente', n = 2
    while (ids.has(id)) id = `${slugify(nombre)}-${n++}`
    return id
  }

  const createProfile = async (nombre) => {
    const id = newId(nombre)
    await setDoc(doc(db, 'clients', id), { ...emptyClient(nombre), orden: clientDocs.length })
    return id
  }

  // Migración: los clientes de la lista vieja reciben su ficha (vacía) automáticamente
  useEffect(() => {
    const missing = clientList.filter(n => n && !docByName.has(n))
    if (!missing.length) return
    Promise.all(missing.map(createProfile)).catch(e => console.warn('migración de clientes:', e.code || e.message))
  }, [clientList.join('|'), clientDocs.length])

  const handleAdd = async () => {
    const name = newClient.trim()
    if (!name) return
    if (clients.includes(name)) { showToast('Ese cliente ya existe', 'error'); return }
    setSaving(true)
    try {
      await createProfile(name)
      await saveClients([...clientList, name])
      setNewClient('')
      showToast(`Cliente "${name}" agregado. Completa su ficha para darle contexto a los agentes`)
    } catch (e) {
      console.error(e)
      showToast('No se pudo agregar el cliente', 'error')
    }
    setSaving(false)
  }

  // Al renombrar: lista vieja y tareas con el nombre anterior
  const handleRenamed = async (oldName, newName) => {
    await saveClients(clientList.map(n => n === oldName ? newName : n))
    const snap = await getDocs(query(collection(db, 'tasks'), where('cliente', '==', oldName)))
    const batch = writeBatch(db)
    snap.forEach(d => batch.update(d.ref, { cliente: newName }))
    if (!snap.empty) await batch.commit()
  }

  // Desactivar en vez de borrar: las tareas viejas conservan su contexto
  const toggleActive = async (c) => {
    await setDoc(doc(db, 'clients', c.id), { activo: c.activo === false }, { merge: true })
    showToast(c.activo === false ? `"${c.nombre}" reactivado` : `"${c.nombre}" quedó inactivo`, 'info')
  }

  const move = async (idx, dir) => {
    const list = [...clientDocs]
    const j = idx + dir
    if (j < 0 || j >= list.length) return
    ;[list[idx], list[j]] = [list[j], list[idx]]
    const batch = writeBatch(db)
    list.forEach((c, i) => batch.update(doc(db, 'clients', c.id), { orden: i }))
    await batch.commit()
  }

  // Qué tan completa está la ficha (para recordar llenarla)
  const completeness = (c) => {
    const checks = [c.negocio?.descripcion, c.negocio?.publico, c.marca?.tono, c.objetivos?.length, c.negocio?.servicios?.length]
    return Math.round(checks.filter(Boolean).length / checks.length * 100)
  }

  const handleMoveDown = async (idx) => {
    if (idx === clients.length - 1) return
    const updated = [...clients]
    ;[updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]]
    await saveClients(updated)
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Administración</span>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">Cada cliente tiene su ficha de contexto: es lo que leen los agentes en sus tareas</p>
        </div>
      </div>

      <div className="clients-layout">

      {/* ===== Columna derecha: informe por cliente ===== */}
      <div className="card clients-report">
        <p className="section-title">Tiempo y tareas por cliente</p>
        {clientStats.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aún no hay tareas registradas con cliente</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {clientStats.map(s => (
              <div key={s.name} style={{ padding: '12px 14px', background: 'var(--bg-2)', borderRadius: 10 }}>
                {/* Fila 1: nombre + estado + antigüedad + métricas */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{s.name}</span>
                  <span className="badge" style={{
                    fontSize: 10,
                    background: s.active ? 'rgba(34,197,94,0.12)' : 'rgba(144,144,184,0.15)',
                    color: s.active ? 'var(--success)' : 'var(--text-3)',
                  }}>
                    {s.active ? 'Activo' : 'Inactivo'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    Cliente desde {fmtSince(s.since)}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, fontFamily: 'Space Mono', color: 'var(--purple)', fontWeight: 700 }}>
                    {s.hours.toFixed(1)}h
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                    {s.done}/{s.total} completadas
                  </span>
                </div>
                {/* Fila 2: barra de horas */}
                <div className="bar-track" style={{ marginBottom: 8 }}>
                  <div className="bar-fill" style={{ width: `${Math.round((s.hours / maxHours) * 100)}%` }} />
                </div>
                {/* Fila 3: equipo que trabaja en el cliente */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>
                    Equipo:
                  </span>
                  {s.workers.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Sin asignaciones</span>}
                  {s.workers.map(w => (
                    <span key={w.uid} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: 'var(--card)', border: '1px solid var(--border)',
                      borderRadius: 99, padding: '2px 9px 2px 3px', fontSize: 11.5
                    }}>
                      {w.photo
                        ? <img src={w.photo} alt="" style={{ width: 18, height: 18, borderRadius: '50%' }} />
                        : <span style={{
                            width: 18, height: 18, borderRadius: '50%', background: w.color || '#4700E0',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, color: '#fff'
                          }}>{(w.name || '?')[0].toUpperCase()}</span>
                      }
                      {w.name?.split(' ')[0]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===== Columna izquierda: gestión de la lista ===== */}
      <div className="clients-left">

      {/* Add new */}
      <div className="card" style={{ marginBottom: 18 }}>
        <p className="section-title">Agregar cliente</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            className="form-input"
            value={newClient}
            onChange={e => setNewClient(e.target.value)}
            placeholder="Nombre del cliente..."
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button className="btn btn-primary" onClick={handleAdd} disabled={saving || !newClient.trim()}>
            + Agregar
          </button>
        </div>
      </div>

      {/* Client list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--card-2)' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>
            {clientDocs.length} clientes
          </span>
        </div>
        {clientDocs.map((c, idx) => {
          const pct = completeness(c)
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
              borderBottom: '1px solid var(--border)', opacity: c.activo === false ? 0.55 : 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <button className="btn btn-ghost" style={{ padding: '1px 4px', fontSize: 10, lineHeight: 1 }}
                  onClick={() => move(idx, -1)} disabled={idx === 0}>▲</button>
                <button className="btn btn-ghost" style={{ padding: '1px 4px', fontSize: 10, lineHeight: 1 }}
                  onClick={() => move(idx, 1)} disabled={idx === clientDocs.length - 1}>▼</button>
              </div>
              <button type="button" onClick={() => setProfileOf(c)}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{c.nombre}</span>
                {c.interno && <span className="badge" style={{ fontSize: 10, marginLeft: 6 }}>Propio</span>}
                <br />
                <span style={{ fontSize: 11, color: pct < 60 ? 'var(--warning)' : 'var(--text-3)' }}>
                  Ficha {pct}% completa{c.aprendizajes?.length ? ` · ${c.aprendizajes.length} aprendizajes` : ''}
                </span>
              </button>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setProfileOf(c)}>Ficha</button>
                <button className="btn btn-ghost btn-sm" title={c.activo === false ? 'Reactivar' : 'Desactivar'}
                  onClick={() => toggleActive(c)}>{c.activo === false ? '↺' : '⏸'}</button>
              </div>
            </div>
          )
        })}
      </div>

      </div>{/* /clients-left */}
      </div>{/* /clients-layout */}

      {profileOf && (
        <ClientProfile client={profileOf} departments={departments} onClose={() => setProfileOf(null)}
          onRenamed={handleRenamed} showToast={showToast} userEmail={user.email} />
      )}
    </div>
  )
}
