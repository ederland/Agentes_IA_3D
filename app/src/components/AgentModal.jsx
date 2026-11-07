import React, { useState, useRef, useEffect } from 'react'
import { db } from '../firebase.js'
import { doc, updateDoc, addDoc, collection, serverTimestamp, getDoc } from 'firebase/firestore'
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
  const { departments, clientDocs, providers } = useApp()
  // Skills instaladas en el PC del motor (las publica el motor en config/agentWorker)
  const [skillsPC, setSkillsPC] = useState([])
  const [motoresPC, setMotoresPC] = useState({})
  useEffect(() => {
    getDoc(doc(db, 'config', 'agentWorker')).then(s => { setSkillsPC(s.data()?.skills || []); setMotoresPC(s.data()?.motores || {}) }).catch(() => {})
  }, [])
  const [form, setForm] = useState({
    departamentoId: agent?.departamentoId || '',
    instrucciones: toLines(agent?.instrucciones),
    ejemplos: (agent?.ejemplos || []).map(e => ({ ...e })),
    maxTurnos: agent?.presupuesto?.maxTurnos || '',
    todosClientes: !Array.isArray(agent?.clientesPermitidos),
    clientesPermitidos: Array.isArray(agent?.clientesPermitidos) ? agent.clientesPermitidos : [],
    proveedor: agent?.modelo?.proveedor === 'api' ? agent.modelo.proveedorId : ['codex', 'gemini', 'antigravity'].includes(agent?.modelo?.proveedor) ? agent.modelo.proveedor : 'claude',
    modeloNombre: agent?.modelo?.nombre || '',
    skills: agent?.skills || [],
    aprendizajes: agent?.aprendizajes || [],
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

  const rolModelo = CATALOGO.roles[form.rol]?.modelo
  const requiereHerramientas = !!rolModelo?.requiereHerramientas
  const provSel = providers.find(p => p.id === form.proveedor)
  // Roles con herramientas de servidores MCP (video, imágenes, Gmail, Drive…) solo funcionan con Claude Code
  const GRUPOS_MCP = ['entregas', 'editor_video', 'magnific_imagenes', 'gmail', 'calendario', 'drive_lectura', 'drive_crear']
  const soloClaude = (CATALOGO.roles[form.rol]?.herramientas || []).some(g => GRUPOS_MCP.includes(g) && g !== 'drive_lectura')
  const esCli = ['codex', 'gemini', 'antigravity'].includes(form.proveedor)
  const motorSel = motoresPC[form.proveedor]

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
      modelo: form.proveedor === 'claude' || (esCli && soloClaude) || (!esCli && requiereHerramientas)
        ? { proveedor: 'claude' }
        : form.proveedor === 'antigravity' ? { proveedor: 'antigravity', nombre: form.modeloNombre.trim() }
        : esCli ? { proveedor: form.proveedor }
        : { proveedor: 'api', proveedorId: form.proveedor, nombre: form.modeloNombre.trim() },
      skills: form.skills,
      aprendizajes: form.aprendizajes,
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
            {rolModelo && (
              <span style={{ fontSize: 11.5, color: 'var(--text-2)', marginBottom: 4 }}>
                Recomendado para este rol: <strong>{rolModelo.recomendado === 'claude' ? 'Claude Code' : 'un modelo de texto (API)'}</strong>. {rolModelo.nota}
              </span>
            )}
            <div className="form-row">
              <select className="form-select" value={soloClaude ? 'claude' : form.proveedor} disabled={soloClaude}
                onChange={e => setForm(f => ({ ...f, proveedor: e.target.value, modeloNombre: providers.find(p => p.id === e.target.value)?.modelos?.[0] || '' }))}>
                <optgroup label="Agentes con herramientas">
                  <option value="claude">Claude Code</option>
                  <option value="antigravity">Antigravity · Google AI Pro</option>
                  <option value="codex">Codex · cuenta de ChatGPT</option>
                  <option value="gemini">Gemini CLI · clave de API</option>
                </optgroup>
                {!requiereHerramientas && providers.some(p => p.activo !== false) && (
                  <optgroup label="Solo texto (API)">
                    {providers.filter(p => p.activo !== false).map(p => <option key={p.id} value={p.id}>{p.nombre}{p.gratis ? ' · gratis' : ''}</option>)}
                  </optgroup>
                )}
              </select>
              {!soloClaude && form.proveedor === 'antigravity' && (
                <select className="form-select" value={form.modeloNombre} onChange={e => setForm(f => ({ ...f, modeloNombre: e.target.value }))}>
                  <option value="">Modelo por defecto</option>
                  {(motoresPC.antigravity?.modelos || []).map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                  {form.modeloNombre && !(motoresPC.antigravity?.modelos || []).some(m => m.id === form.modeloNombre) && <option value={form.modeloNombre}>{form.modeloNombre}</option>}
                </select>
              )}
              {!requiereHerramientas && provSel && (
                <select className="form-select" value={form.modeloNombre} onChange={e => setForm(f => ({ ...f, modeloNombre: e.target.value }))}>
                  {!(provSel.modelos || []).includes(form.modeloNombre) && <option value={form.modeloNombre}>{form.modeloNombre || '— Elige un modelo —'}</option>}
                  {(provSel.modelos || []).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
            </div>
            {soloClaude && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Este rol usa herramientas que solo tiene Claude Code (video, imágenes, correo o Drive).</span>
            )}
            {!soloClaude && esCli && (
              <span style={{ fontSize: 11, color: motorSel?.conectado ? 'var(--success)' : 'var(--danger)' }}>
                {motorSel ? (motorSel.conectado ? `Conectado en el PC del motor · ${motorSel.detalle}` : motorSel.detalle) : 'Enciende el motor para ver si tiene sesión.'}
                {form.proveedor === 'gemini' && ' · Plan gratis: solo recibe tareas internas o de clientes con "permite modelos gratis".'}
                {' '}Si se acaba su cuota, la tarea pasa sola al siguiente motor disponible.
              </span>
            )}
            {!requiereHerramientas && providers.length === 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Para usar Gemini, Groq, DeepSeek u otros, agrégalos en Agencia → Modelos de IA.</span>
            )}
            {!requiereHerramientas && provSel && (
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                Solo texto: no busca en internet ni maneja archivos. Las tareas de video, archivos o código siempre se hacen con Claude Code. Revisa si el plan gratis usa tus datos para entrenar antes de enviarle información de clientes.
              </span>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Skills que debe usar</label>
            {skillsPC.length === 0
              ? <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>No hay skills instaladas en el PC del motor (o el motor está apagado). Se instalan en motor/.claude/skills.</span>
              : <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {skillsPC.map(sk => (
                    <label key={sk.nombre} title={sk.descripcion} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                      <input type="checkbox" checked={form.skills.includes(sk.nombre)}
                        onChange={() => setForm(f => ({ ...f, skills: f.skills.includes(sk.nombre) ? f.skills.filter(x => x !== sk.nombre) : [...f.skills, sk.nombre] }))} />
                      {sk.nombre}
                    </label>
                  ))}
                </div>}
            {provSel && !requiereHerramientas && form.skills.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--warning)' }}>Las skills solo funcionan con Claude Code.</span>
            )}
          </div>
          {form.aprendizajes.length > 0 && (
            <div className="form-group">
              <label className="form-label">Lecciones aprendidas ({form.aprendizajes.length})</label>
              {form.aprendizajes.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '6px 10px', background: 'var(--bg-2)', borderRadius: 8, marginBottom: 4 }}>
                  <span style={{ flex: 1 }}>{a.texto}</span>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }}
                    onClick={() => setForm(f => ({ ...f, aprendizajes: f.aprendizajes.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              ))}
            </div>
          )}
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
