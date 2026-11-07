import React, { useState, useRef } from 'react'
import { db } from '../firebase.js'
import { doc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import Icon from './Icons.jsx'
import LookEditor, { DEFAULT_LOOK } from './LookEditor.jsx'
import CATALOGO from '../../../roles/catalogo.json'
import { useApp } from '../App.jsx'
import { toLines, fromLines } from '../agencia.js'

export { STYLES } from './LookEditor.jsx'

// Foto del agente: se recorta cuadrada y se guarda pequeña (JPG 256 px) dentro del documento del agente
function resizeImage(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen no válida')) }
    img.src = url
  })
}

// Avatar 2D del agente: su foto, o un círculo con su color e inicial
export function AgentAvatar({ agent, size = 40 }) {
  const color = agent?.look?.torso || '#4700E0'
  if (agent?.photo) {
    return <img src={agent.photo} alt={agent.name} className="agent-avatar" style={{ width: size, height: size }} />
  }
  return (
    <span className="agent-avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}>
      {(agent?.name || '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

export default function AgentModal({ agent, nextOrder, onClose, showToast, userEmail }) {
  const { departments, clientDocs } = useApp()
  const [form, setForm] = useState({
    departamentoId: agent?.departamentoId || '',
    instrucciones: toLines(agent?.instrucciones),
    ejemplos: (agent?.ejemplos || []).map(e => ({ ...e })),
    maxTurnos: agent?.presupuesto?.maxTurnos || '',
    todosClientes: !Array.isArray(agent?.clientesPermitidos),
    clientesPermitidos: Array.isArray(agent?.clientesPermitidos) ? agent.clientesPermitidos : [],
    proveedor: agent?.modelo?.proveedor || 'claude',
    modeloNombre: agent?.modelo?.nombre || '',
    name: agent?.name || '',
    role: agent?.role || '',
    rol: agent?.rol || '',
    bio: agent?.bio || '',
    mission: agent?.mission || '',
    photo: agent?.photo || '',
    look: { ...DEFAULT_LOOK, ...(agent?.look || {}) },
  })
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  // Al elegir un rol se proponen especialidad y misión base (se pueden editar)
  const pickRol = (id) => setForm(f => {
    const r = CATALOGO.roles[id]
    if (!r) return { ...f, rol: id }
    const prev = CATALOGO.roles[f.rol]
    return {
      ...f, rol: id,
      role: !f.role || f.role === prev?.nombre ? r.nombre : f.role,
      mission: !f.mission || f.mission === prev?.mision ? r.mision : f.mission,
      bio: !f.bio || f.bio === prev?.descripcion ? r.descripcion : f.bio,
    }
  })

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { showToast('Elige una imagen (JPG, PNG o WebP)', 'error'); return }
    try {
      const photo = await resizeImage(file)
      setForm(f => ({ ...f, photo }))
    } catch {
      showToast('No se pudo leer la imagen', 'error')
    }
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.role.trim()) { showToast('Nombre y especialidad son obligatorios', 'error'); return }
    setSaving(true)
    const look = { ...form.look }
    if (!look.emblem) delete look.emblem
    const data = {
      name: form.name.trim(), role: form.role.trim(), bio: form.bio.trim(),
      rol: form.rol || 'personalizado', ...(CATALOGO.roles[form.rol]?.coordinador ? { kind: 'coordinador' } : {}),
      mission: form.mission.trim(), photo: form.photo || '', look,
      departamentoId: form.departamentoId || CATALOGO.roles[form.rol]?.departamento || '',
      instrucciones: fromLines(form.instrucciones),
      ejemplos: form.ejemplos.filter(e => e.texto?.trim()).map(e => ({ titulo: (e.titulo || '').trim(), texto: e.texto.trim() })),
      presupuesto: { maxTurnos: Number(form.maxTurnos) || null },
      clientesPermitidos: form.todosClientes ? 'todos' : form.clientesPermitidos,
      modelo: { proveedor: form.proveedor, nombre: form.proveedor === 'alterno' ? form.modeloNombre.trim() : '' },
    }
    try {
      if (agent) {
        await updateDoc(doc(db, 'agents', agent.id), data)
        showToast('Agente actualizado')
      } else {
        await addDoc(collection(db, 'agents'), {
          ...data,
          active: false, order: nextOrder, breakUntil: null, breakType: null,
          createdAt: serverTimestamp(), createdBy: userEmail,
        })
        showToast(`${form.name} quedó en reserva. Actívalo cuando lo necesites`)
      }
      onClose()
    } catch (e) {
      console.error(e)
      showToast('No se pudo guardar el agente', 'error')
    }
    setSaving(false)
  }


  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h2 className="modal-title">{agent ? `Editar: ${agent.name}` : 'Nuevo agente'}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Foto de perfil */}
          <div className="agent-photo-row">
            <AgentAvatar agent={{ ...form, look: form.look }} size={72} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="form-label" style={{ margin: 0 }}>Foto de perfil</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                  <Icon name="download" size={12} /> {form.photo ? 'Cambiar foto' : 'Subir foto'}
                </button>
                {form.photo && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(f => ({ ...f, photo: '' }))}>
                    Quitar
                  </button>
                )}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Se recorta cuadrada. Se ve en Team, Pipeline y la Oficina.</span>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Rol (habilidades)</label>
            <select className="form-select" value={form.rol} onChange={e => pickRol(e.target.value)}>
              <option value="">Elige qué hará este agente…</option>
              {Object.entries(CATALOGO.roles).map(([id, r]) => <option key={id} value={id}>{r.nombre}</option>)}
            </select>
            {CATALOGO.roles[form.rol] && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {CATALOGO.roles[form.rol].descripcion}
                {CATALOGO.roles[form.rol].conectores?.length ? ` · Usa: ${CATALOGO.roles[form.rol].conectores.join(', ')}` : ''}
              </span>
            )}
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej. Wanda Maximoff" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Especialidad</label>
              <input className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="Ej. Creación de imágenes" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descripción corta</label>
            <input className="form-input" maxLength={140} value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              placeholder="Una línea que se muestra en su tarjeta" />
          </div>
          <div className="form-group">
            <label className="form-label">Misión e instrucciones</label>
            <textarea className="form-textarea" rows={5} value={form.mission}
              onChange={e => setForm(f => ({ ...f, mission: e.target.value }))}
              placeholder="Qué hace este agente, qué tono usa, qué entrega..." />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              Es lo que el agente lee antes de cada tarea: define cómo trabaja y qué entrega.
            </span>
          </div>
          <div className="form-group">
            <label className="form-label">Instrucciones adicionales</label>
            <textarea className="form-textarea" rows={3} value={form.instrucciones}
              onChange={e => setForm(f => ({ ...f, instrucciones: e.target.value }))}
              placeholder="Una por línea. Ej. Siempre entrega 3 variantes" />
          </div>
          <div className="form-group">
            <label className="form-label">Ejemplos de buen trabajo</label>
            {form.ejemplos.map((ej, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="form-input" placeholder="Título del ejemplo" value={ej.titulo || ''}
                    onChange={e => setForm(f => ({ ...f, ejemplos: f.ejemplos.map((x, j) => j === i ? { ...x, titulo: e.target.value } : x) }))} />
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                    onClick={() => setForm(f => ({ ...f, ejemplos: f.ejemplos.filter((_, j) => j !== i) }))}>✕</button>
                </div>
                <textarea className="form-textarea" rows={3} placeholder="Pega aquí una entrega que te haya gustado" value={ej.texto || ''}
                  onChange={e => setForm(f => ({ ...f, ejemplos: f.ejemplos.map((x, j) => j === i ? { ...x, texto: e.target.value } : x) }))} />
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}
              onClick={() => setForm(f => ({ ...f, ejemplos: [...f.ejemplos, { titulo: '', texto: '' }] }))}>+ Ejemplo</button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Departamento</label>
              <select className="form-select" value={form.departamentoId} onChange={e => setForm(f => ({ ...f, departamentoId: e.target.value }))}>
                <option value="">{CATALOGO.roles[form.rol]?.departamento ? `Según su rol (${departments.find(d => d.id === CATALOGO.roles[form.rol].departamento)?.nombre || CATALOGO.roles[form.rol].departamento})` : '—'}</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Máximo de pasos por tarea</label>
              <input className="form-input" type="number" min={1} value={form.maxTurnos} placeholder={`Según su rol (${CATALOGO.roles[form.rol]?.maxTurns || 40})`}
                onChange={e => setForm(f => ({ ...f, maxTurnos: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Modelo de IA</label>
            <select className="form-select" value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))}>
              <option value="claude">Claude Code (con herramientas)</option>
              <option value="alterno">Modelo alterno (solo texto, sin herramientas)</option>
            </select>
            {form.proveedor === 'alterno' && (
              <>
                <input className="form-input" style={{ marginTop: 6 }} value={form.modeloNombre} placeholder="Nombre del modelo (vacío = el de motor/.env)"
                  onChange={e => setForm(f => ({ ...f, modeloNombre: e.target.value }))} />
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  Útil para ideas, copies o revisión. No busca en internet ni maneja archivos. Muchos planes gratis usan lo que reciben para entrenar: no lo uses con datos confidenciales de clientes.
                </span>
              </>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Clientes que atiende</label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={form.todosClientes} onChange={e => setForm(f => ({ ...f, todosClientes: e.target.checked }))} /> Todos
            </label>
            {!form.todosClientes && (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {clientDocs.map(c => (
                  <label key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                    <input type="checkbox" checked={form.clientesPermitidos.includes(c.id)}
                      onChange={() => setForm(f => ({ ...f, clientesPermitidos: f.clientesPermitidos.includes(c.id) ? f.clientesPermitidos.filter(x => x !== c.id) : [...f.clientesPermitidos, c.id] }))} />
                    {c.nombre}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Personaje en la Oficina 3D</label>
            <LookEditor look={form.look} onChange={look => setForm(f => ({ ...f, look }))} showLipstick={false} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  )
}
