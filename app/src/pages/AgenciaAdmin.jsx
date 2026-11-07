import React, { useState } from 'react'
import { useApp } from '../App.jsx'
import { db } from '../firebase.js'
import { doc, setDoc, deleteDoc, writeBatch, serverTimestamp } from 'firebase/firestore'
import Icon from '../components/Icons.jsx'
import AgenciaTareas from './AgenciaTareas.jsx'
import AgenciaSkills from './AgenciaSkills.jsx'
import CATALOGO from '../../../roles/catalogo.json'
import { DEFAULT_DEPARTMENTS, EXAMPLE_TASK_TYPES, FIELD_TYPES, DELIVERY_FORMATS, PROVIDER_PRESETS, slugify, toLines, fromLines } from '../agencia.js'

// Agencia: departamentos y tipos de tarea (plantillas de brief con su checklist y su revisor)
export default function AgenciaAdmin() {
  const { departments, taskTypes, agents, providers, users, showToast } = useApp()
  const [tab, setTab] = useState('tareas')
  const [editDept, setEditDept] = useState(null)
  const [editType, setEditType] = useState(null)
  const [editProv, setEditProv] = useState(null)

  const seedDepartments = async () => {
    const batch = writeBatch(db)
    for (const d of DEFAULT_DEPARTMENTS) {
      if (departments.some(x => x.id === d.id)) continue
      const { id, ...data } = d
      batch.set(doc(db, 'departments', id), { ...data, icono: '', activo: true })
    }
    await batch.commit()
    showToast('Departamentos creados')
  }

  const seedTypes = async () => {
    const batch = writeBatch(db)
    let n = 0
    for (const t of EXAMPLE_TASK_TYPES) {
      if (taskTypes.some(x => x.id === t.id)) continue
      const { id, ...data } = t
      batch.set(doc(db, 'taskTypes', id), { ...data, capacidad: data.formatoEntrega === 'video' ? 'video' : 'general', createdAt: serverTimestamp() })
      n++
    }
    if (n) await batch.commit()
    showToast(n ? `${n} tipos de tarea de ejemplo agregados` : 'Los ejemplos ya estaban cargados', 'info')
  }

  const deptName = (id) => departments.find(d => d.id === id)?.nombre || id || '—'
  const agentsOf = (deptId) => agents.filter(a => (a.departamentoId || CATALOGO.roles[a.rol]?.departamento) === deptId)

  return (
    <div>
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Administración</span>
          <h1 className="page-title">Agencia</h1>
          <p className="page-subtitle">Tareas por departamento, tipos de tarea, modelos de IA y skills de los agentes</p>
        </div>
      </div>

      <div className="tab-row" style={{ marginBottom: 18 }}>
        <button className={`btn btn-sm ${tab === 'tareas' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('tareas')}>Tareas</button>
        <button className={`btn btn-sm ${tab === 'departamentos' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('departamentos')}>Departamentos</button>
        <button className={`btn btn-sm ${tab === 'tipos' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('tipos')}>Tipos de tarea</button>
        <button className={`btn btn-sm ${tab === 'modelos' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('modelos')}>Modelos de IA</button>
        <button className={`btn btn-sm ${tab === 'skills' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab('skills')}>Skills</button>
      </div>

      {tab === 'tareas' && <AgenciaTareas />}
      {tab === 'skills' && <AgenciaSkills />}

      {tab === 'departamentos' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => setEditDept({})}>+ Departamento</button>
            {departments.length < DEFAULT_DEPARTMENTS.length && (
              <button className="btn btn-secondary btn-sm" onClick={seedDepartments}>Crear los 4 departamentos base</button>
            )}
          </div>
          {departments.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aún no hay departamentos.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {departments.map(d => (
              <div key={d.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 10, opacity: d.activo === false ? 0.55 : 1 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: d.color || 'var(--purple)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{d.nombre}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{d.descripcion}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 3 }}>
                    Personas: {users.filter(u => u.departamentoId === d.id && u.role !== 'pending').map(u => u.name).join(', ') || 'ninguna (asígnalas en Team → editar persona)'}
                    {' · '}Agentes: {agentsOf(d.id).map(a => a.name).join(', ') || 'ninguno'}
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditDept(d)}>Editar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'tipos' && (
        <div className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => setEditType({})}>+ Tipo de tarea</button>
            <button className="btn btn-secondary btn-sm" onClick={seedTypes}>Cargar ejemplos</button>
          </div>
          {taskTypes.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aún no hay tipos de tarea. Carga los ejemplos para empezar.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {taskTypes.map(t => (
              <div key={t.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{t.nombre}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {deptName(t.departamento)} · {CATALOGO.roles[t.rol]?.nombre || 'cualquier rol'}
                    {' · '}{(t.plantillaBrief || []).length} campos · revisa: {t.revisor ? (CATALOGO.roles[t.revisor]?.nombre || t.revisor) : 'nadie'}
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditType(t)}>Editar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'modelos' && (
        <div className="card">
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 0 }}>
            Claude Code siempre está disponible. Aquí agregas otros modelos (solo texto, sin herramientas) para los agentes que no necesitan
            buscar en la web ni manejar archivos. Las claves quedan guardadas en tu Firebase y <strong>nadie puede volver a leerlas desde el panel</strong>: solo el motor de tu PC.
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {PROVIDER_PRESETS.filter(p => !providers.some(x => x.id === p.id)).map(p => (
              <button key={p.id} className="btn btn-secondary btn-sm" onClick={() => setEditProv({ ...p, nuevo: true })}>+ {p.nombre}</button>
            ))}
            <button className="btn btn-secondary btn-sm" onClick={() => setEditProv({ nuevo: true, modelos: [] })}>+ Otro (compatible con OpenAI)</button>
          </div>
          {providers.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aún no hay modelos adicionales.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {providers.map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 14px', background: 'var(--bg-2)', borderRadius: 10, opacity: p.activo === false ? 0.55 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 14 }}>{p.nombre}</strong>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {p.tieneClave ? 'Clave guardada' : p.id === 'ollama' ? 'Sin clave (local)' : 'Sin clave'}
                    {' · '}{(p.modelos || []).length} modelos
                    {p.prueba === 'pendiente' && ' · probando… (el motor debe estar encendido)'}
                    {p.prueba === 'ok' && <span style={{ color: 'var(--success)' }}> · conexión OK</span>}
                    {p.prueba === 'error' && <span style={{ color: 'var(--danger)' }}> · error: {p.pruebaMensaje}</span>}
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setDoc(doc(db, 'providers', p.id), { prueba: 'pendiente' }, { merge: true })}>Probar conexión</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditProv(p)}>Editar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {editProv && <ProviderModal prov={editProv} onClose={() => setEditProv(null)} showToast={showToast} />}
      {editDept && <DeptModal dept={editDept} onClose={() => setEditDept(null)} showToast={showToast} />}
      {editType && <TypeModal type={editType} departments={departments} onClose={() => setEditType(null)} showToast={showToast} />}
    </div>
  )
}

function DeptModal({ dept, onClose, showToast }) {
  const [form, setForm] = useState({
    nombre: dept.nombre || '', descripcion: dept.descripcion || '', color: dept.color || '#4700E0',
    orden: dept.orden ?? 99, activo: dept.activo !== false,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const save = async () => {
    if (!form.nombre.trim()) { showToast('Ponle un nombre', 'error'); return }
    const id = dept.id || slugify(form.nombre)
    await setDoc(doc(db, 'departments', id), { ...form, nombre: form.nombre.trim(), orden: Number(form.orden) || 0, icono: dept.icono || '' }, { merge: true })
    showToast('Departamento guardado')
    onClose()
  }
  const remove = async () => {
    if (!confirm(`¿Eliminar "${dept.nombre}"? Las tareas y agentes que lo usan quedan sin departamento.`)) return
    await deleteDoc(doc(db, 'departments', dept.id))
    onClose()
  }
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{dept.id ? 'Editar departamento' : 'Nuevo departamento'}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Nombre</label>
            <input className="form-input" value={form.nombre} onChange={e => set('nombre', e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input className="form-input" value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Color</label>
              <input className="form-input" type="color" value={form.color} onChange={e => set('color', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Orden</label>
              <input className="form-input" type="number" value={form.orden} onChange={e => set('orden', e.target.value)} />
            </div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} /> Activo
          </label>
        </div>
        <div className="modal-footer">
          {dept.id && <button className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={remove}>Eliminar</button>}
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

function TypeModal({ type, departments, onClose, showToast }) {
  const [form, setForm] = useState({
    nombre: type.nombre || '', descripcion: type.descripcion || '',
    departamento: type.departamento || departments[0]?.id || '',
    rol: type.rol || '', revisor: type.revisor || '',
    formatoEntrega: type.formatoEntrega || 'texto',
    checklist: toLines(type.checklist),
    campos: (type.plantillaBrief || []).map(c => ({ ...c })),
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setCampo = (i, k, v) => set('campos', form.campos.map((c, j) => j === i ? { ...c, [k]: v } : c))
  const addCampo = () => set('campos', [...form.campos, { campo: '', etiqueta: '', tipo: 'texto', requerido: false }])
  const delCampo = (i) => set('campos', form.campos.filter((_, j) => j !== i))

  const save = async () => {
    if (!form.nombre.trim()) { showToast('Ponle un nombre', 'error'); return }
    const plantillaBrief = form.campos.filter(c => c.etiqueta.trim())
      .map(c => ({ campo: c.campo || slugify(c.etiqueta).replace(/-/g, '_'), etiqueta: c.etiqueta.trim(), tipo: c.tipo, requerido: !!c.requerido }))
    const id = type.id || slugify(form.nombre).replace(/-/g, '_')
    await setDoc(doc(db, 'taskTypes', id), {
      nombre: form.nombre.trim(), descripcion: form.descripcion.trim(), departamento: form.departamento,
      rol: form.rol || null, revisor: form.revisor || null, formatoEntrega: form.formatoEntrega,
      capacidad: form.formatoEntrega === 'video' ? 'video' : form.formatoEntrega === 'pr' ? 'dev' : 'general',
      checklist: fromLines(form.checklist), plantillaBrief,
    }, { merge: true })
    showToast('Tipo de tarea guardado')
    onClose()
  }
  const remove = async () => {
    if (!confirm(`¿Eliminar el tipo "${type.nombre}"? Las tareas ya creadas no cambian.`)) return
    await deleteDoc(doc(db, 'taskTypes', type.id))
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h2 className="modal-title">{type.id ? 'Editar tipo de tarea' : 'Nuevo tipo de tarea'}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input className="form-input" value={form.nombre} onChange={e => set('nombre', e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Departamento</label>
              <select className="form-select" value={form.departamento} onChange={e => set('departamento', e.target.value)}>
                <option value="">—</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input className="form-input" value={form.descripcion} onChange={e => set('descripcion', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Rol que lo hace</label>
              <select className="form-select" value={form.rol} onChange={e => set('rol', e.target.value)}>
                <option value="">Cualquiera</option>
                {Object.entries(CATALOGO.roles).map(([id, r]) => <option key={id} value={id}>{r.nombre}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Rol que revisa</label>
              <select className="form-select" value={form.revisor} onChange={e => set('revisor', e.target.value)}>
                <option value="">Sin revisión entre agentes</option>
                {Object.entries(CATALOGO.roles).map(([id, r]) => <option key={id} value={id}>{r.nombre}</option>)}
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Cada revisión gasta otra ejecución del modelo.</span>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Formato de entrega</label>
            <select className="form-select" value={form.formatoEntrega} onChange={e => set('formatoEntrega', e.target.value)}>
              {DELIVERY_FORMATS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Checklist de revisión</label>
            <textarea className="form-textarea" rows={3} value={form.checklist} onChange={e => set('checklist', e.target.value)} />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Un criterio por línea. Se suma a los criterios de cada tarea.</span>
          </div>
          <div className="form-group">
            <label className="form-label">Campos del brief</label>
            {form.campos.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                <input className="form-input" style={{ flex: '2 1 180px' }} placeholder="Pregunta, ej. Palabra clave" value={c.etiqueta} onChange={e => setCampo(i, 'etiqueta', e.target.value)} />
                <select className="form-select" style={{ flex: '1 1 110px' }} value={c.tipo} onChange={e => setCampo(i, 'tipo', e.target.value)}>
                  {FIELD_TYPES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
                <label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}>
                  <input type="checkbox" checked={!!c.requerido} onChange={e => setCampo(i, 'requerido', e.target.checked)} /> Obligatorio
                </label>
                <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => delCampo(i)}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={addCampo}>+ Campo</button>
          </div>
        </div>
        <div className="modal-footer">
          {type.id && <button className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={remove}>Eliminar</button>}
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  )
}

// Proveedor de modelos: los datos públicos van en providers/{id}; la clave, en providerSecrets/{id},
// que las reglas dejan escribir a administradores pero solo leer al motor.
function ProviderModal({ prov, onClose, showToast }) {
  const [form, setForm] = useState({
    nombre: prov.nombre || '', baseUrl: prov.baseUrl || '',
    modelos: toLines(prov.modelos), apiKey: '', activo: prov.activo !== false,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const disponibles = (prov.modelosDisponibles || []).filter(m => !fromLines(form.modelos).includes(m))

  const save = async () => {
    if (!form.nombre.trim() || !/^https?:\/\//.test(form.baseUrl.trim())) { showToast('Nombre y URL base (https://…) son obligatorios', 'error'); return }
    const id = prov.id || slugify(form.nombre)
    try {
      if (form.apiKey.trim()) await setDoc(doc(db, 'providerSecrets', id), { apiKey: form.apiKey.trim(), updatedAt: serverTimestamp() })
      await setDoc(doc(db, 'providers', id), {
        nombre: form.nombre.trim(), baseUrl: form.baseUrl.trim().replace(/\/+$/, ''), modelos: fromLines(form.modelos),
        activo: form.activo, ayuda: prov.ayuda || '',
        tieneClave: !!(form.apiKey.trim() || prov.tieneClave),
        ...(form.apiKey.trim() ? { prueba: 'pendiente' } : {}),
      }, { merge: true })
      showToast(form.apiKey.trim() ? 'Guardado. El motor está probando la conexión' : 'Guardado')
      onClose()
    } catch (e) {
      console.error(e)
      showToast('No se pudo guardar', 'error')
    }
  }
  const remove = async () => {
    if (!confirm(`¿Quitar ${prov.nombre}? Los agentes que lo usan vuelven a Claude Code.`)) return
    await deleteDoc(doc(db, 'providerSecrets', prov.id)).catch(() => {})
    await deleteDoc(doc(db, 'providers', prov.id))
    onClose()
  }
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{prov.nuevo ? `Agregar ${prov.nombre || 'proveedor'}` : `Editar ${prov.nombre}`}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        {prov.ayuda && <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: -8 }}>{prov.ayuda}</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input className="form-input" value={form.nombre} onChange={e => set('nombre', e.target.value)} disabled={!!prov.id && !prov.nuevo} />
            </div>
            <div className="form-group">
              <label className="form-label">URL base (compatible con OpenAI)</label>
              <input className="form-input" value={form.baseUrl} onChange={e => set('baseUrl', e.target.value)} placeholder="https://…/v1" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Clave de API</label>
            <input className="form-input" type="password" autoComplete="off" value={form.apiKey} onChange={e => set('apiKey', e.target.value)}
              placeholder={prov.tieneClave ? 'Guardada. Escribe una nueva solo para reemplazarla' : 'Pega aquí la clave'} />
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Después de guardarla no se puede volver a ver; solo reemplazar.</span>
          </div>
          <div className="form-group">
            <label className="form-label">Modelos que ofreces a los agentes</label>
            <textarea className="form-textarea" rows={3} value={form.modelos} onChange={e => set('modelos', e.target.value)} placeholder="Uno por línea" />
            {disponibles.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6, maxHeight: 120, overflowY: 'auto' }}>
                {disponibles.slice(0, 60).map(m => (
                  <button key={m} type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                    onClick={() => set('modelos', [...fromLines(form.modelos), m].join('\n'))}>+ {m}</button>
                ))}
              </div>
            )}
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} /> Activo
          </label>
        </div>
        <div className="modal-footer">
          {prov.id && !prov.nuevo && <button className="btn btn-ghost" style={{ color: 'var(--danger)', marginRight: 'auto' }} onClick={remove}>Quitar</button>}
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar</button>
        </div>
      </div>
    </div>
  )
}
