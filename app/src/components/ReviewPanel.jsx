import React, { useState } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore'

// Revisión de una entrega de agente: brief vs entrega, notas del agente revisor, versiones
// y las decisiones del equipo (Aprobar / Corregir / Rechazar). Las correcciones pueden quedar
// como aprendizaje en la ficha del cliente.
export default function ReviewPanel({ task, onDone }) {
  const { user, userProfile, isAdmin, showToast, clientDocs, taskTypes, agents } = useApp()
  const versiones = task.versiones || []
  const [verIdx, setVerIdx] = useState(versiones.length ? versiones.length - 1 : -1)
  const [mode, setMode] = useState(null) // 'corregir' | 'rechazar'
  const [nota, setNota] = useState('')
  const [guardarAprendizaje, setGuardarAprendizaje] = useState(true)
  const [leccionAgente, setLeccionAgente] = useState(false)
  const [busy, setBusy] = useState(false)

  const status = task.agentStatus
  if (!status && !task.agentOutput) return null

  const info = {
    running: { text: 'El agente está trabajando en esta tarea…', color: 'var(--purple)' },
    reviewing: { text: 'Otro agente está revisando la entrega…', color: 'var(--purple)' },
    queued: { text: 'En cola: el agente la tomará en cuanto termine lo que está haciendo', color: 'var(--text-3)' },
    needs_info: { text: 'El agente necesita información para continuar', color: 'var(--warning)' },
    error: { text: 'El agente tuvo un problema con esta tarea', color: 'var(--danger)' },
    done: { text: 'Entrega lista para tu aprobación', color: 'var(--success)' },
  }[status] || { text: 'Resultado del agente', color: 'var(--text-2)' }

  const showing = verIdx >= 0 && versiones[verIdx] ? versiones[verIdx].output : task.agentOutput
  const body = status === 'needs_info' ? task.agentQuestion : status === 'error' ? task.agentError : showing
  const cliente = clientDocs.find(c => c.id === task.clienteId) || clientDocs.find(c => c.nombre === task.cliente)
  const tipo = taskTypes.find(t => t.id === task.tipoTareaId)
  const agente = agents.find(a => a.id === task.asignado)
  const rev = task.revisionAgente
  const canDecide = isAdmin && task.estado === 'en_espera' && status === 'done'

  const copy = async () => {
    try { await navigator.clipboard.writeText(body || ''); showToast('Copiado') } catch { showToast('No se pudo copiar', 'error') }
  }

  const approve = async () => {
    setBusy(true)
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        estado: 'completada', fechaEntrega: serverTimestamp(),
        completedBy: userProfile?.name || user.email, completedByEmail: user.email,
        lastEditedBy: user.email, lastEditedAt: serverTimestamp(),
        // El motor copia la versión aprobada a Drive (Aprobados) y escribe driveUrl
        driveSync: 'pendiente',
      })
      showToast('Entrega aprobada')
      onDone?.()
    } catch (e) {
      console.error(e)
      showToast('No se pudo aprobar', 'error')
    }
    setBusy(false)
  }

  const sendBack = async () => {
    const texto = nota.trim()
    if (!texto) { showToast('Escribe qué hay que cambiar', 'error'); return }
    setBusy(true)
    const stamp = new Date().toLocaleString('es-CO')
    const quien = userProfile?.name || user.email
    const rechazo = mode === 'rechazar'
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        feedback: `${task.feedback ? task.feedback + '\n\n' : ''}${rechazo ? 'RECHAZADA' : 'Corrección'} de ${quien} (${stamp}): ${texto}`,
        estado: 'en_revision', agentStatus: 'queued', rehacerDesdeCero: rechazo,
        lastEditedBy: user.email, lastEditedAt: serverTimestamp(),
      })
      if (guardarAprendizaje && cliente) {
        await updateDoc(doc(db, 'clients', cliente.id), {
          aprendizajes: arrayUnion({ texto, origenTaskId: task.id, fecha: new Date().toISOString() }),
        })
      }
      if (leccionAgente && agente) {
        await updateDoc(doc(db, 'agents', agente.id), {
          aprendizajes: arrayUnion({ texto, origenTaskId: task.id, fecha: new Date().toISOString() }),
        })
      }
      showToast(rechazo ? 'Rechazada: el agente la rehace desde cero' : 'Enviada a correcciones')
      onDone?.()
    } catch (e) {
      console.error(e)
      showToast('No se pudo enviar', 'error')
    }
    setBusy(false)
  }

  const b = task.brief || {}
  const hasBrief = b.objetivo || b.resultadoEsperado || b.criteriosAceptacion?.length || task.descripcion

  return (
    <div className="agent-result">
      <div className="agent-result-head">
        <span style={{ color: info.color, fontWeight: 700 }}>{info.text}</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {versiones.length > 1 && status !== 'needs_info' && status !== 'error' && (
            <select className="form-select" style={{ padding: '3px 8px', fontSize: 12, width: 'auto' }} value={verIdx} onChange={e => setVerIdx(Number(e.target.value))}>
              {versiones.map((v, i) => <option key={i} value={i}>Versión {v.n}{i === versiones.length - 1 ? ' (última)' : ''}</option>)}
            </select>
          )}
          {body && <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>Copiar</button>}
        </span>
      </div>

      {rev && status === 'done' && (
        <div style={{ margin: '8px 0', padding: '8px 12px', borderRadius: 8, fontSize: 12.5,
          background: rev.estado === 'ok' ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.12)' }}>
          <strong>{rev.estado === 'ok' ? '✓ Revisada por ' : '⚠ Observaciones de '}{rev.agenteNombre || 'el agente revisor'}</strong>
          {rev.corregida && ' · ya se aplicó una corrección automática'}
          {rev.notas?.length > 0 && <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{rev.notas.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </div>
      )}

      {body && (status === 'done' && hasBrief ? (
        <div className="review-grid">
          <div className="review-col">
            <p className="form-label" style={{ marginTop: 0 }}>Brief{cliente ? ` · ${cliente.nombre}` : ''}{tipo ? ` · ${tipo.nombre}` : ''}</p>
            <pre>{[
              b.objetivo && `Objetivo: ${b.objetivo}`,
              b.resultadoEsperado && `Resultado esperado: ${b.resultadoEsperado}`,
              b.criteriosAceptacion?.length && `Criterios:\n${b.criteriosAceptacion.map(c => '• ' + c).join('\n')}`,
              task.descripcion && `Descripción: ${task.descripcion}`,
            ].filter(Boolean).join('\n\n')}</pre>
          </div>
          <div className="review-col">
            <p className="form-label" style={{ marginTop: 0 }}>Entrega</p>
            <pre>{body}</pre>
          </div>
        </div>
      ) : <pre className="agent-result-body">{body}</pre>)}

      {(task.driveUrl || task.drivePath) && (
        <p style={{ fontSize: 12, marginTop: 8 }}>
          Drive: {task.driveUrl ? <a href={task.driveUrl} target="_blank" rel="noreferrer">abrir carpeta del cliente</a> : null}
          {task.drivePath && <span style={{ color: 'var(--text-3)' }}> · {task.drivePath}</span>}
        </p>
      )}

      {canDecide && !mode && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={approve} disabled={busy}>✓ Aprobar</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMode('corregir')} disabled={busy}>Pedir corrección</button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setMode('rechazar')} disabled={busy}>Rechazar</button>
        </div>
      )}
      {canDecide && mode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          <textarea className="form-textarea" rows={3} value={nota} onChange={e => setNota(e.target.value)} autoFocus
            placeholder={mode === 'rechazar' ? '¿Por qué se rechaza? El agente la rehace desde cero.' : '¿Qué hay que cambiar?'} />
          {cliente && (
            <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={guardarAprendizaje} onChange={e => setGuardarAprendizaje(e.target.checked)} />
              Guardar como aprendizaje de {cliente.nombre} (desmarca si es solo para esta tarea)
            </label>
          )}
          {agente && (
            <label style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={leccionAgente} onChange={e => setLeccionAgente(e.target.checked)} />
              Guardar como lección de {agente.name} (aplica a todos sus clientes)
            </label>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={sendBack} disabled={busy}>
              {mode === 'rechazar' ? 'Rechazar y rehacer' : 'Enviar corrección'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setMode(null); setNota('') }}>Cancelar</button>
          </div>
        </div>
      )}
      {status === 'needs_info' && (
        <p className="agent-result-hint">
          Agrega lo que pide en la descripción o en Link de recursos y muévela a Correcciones para que la retome.
        </p>
      )}
    </div>
  )
}
