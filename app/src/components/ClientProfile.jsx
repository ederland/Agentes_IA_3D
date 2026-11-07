import React, { useState } from 'react'
import { db } from '../firebase.js'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import Icon from './Icons.jsx'
import { emptyClient, slugify, toLines, fromLines } from '../agencia.js'

const TABS = [
  { id: 'negocio', label: 'Negocio' },
  { id: 'marca', label: 'Marca' },
  { id: 'objetivos', label: 'Objetivos' },
  { id: 'activos', label: 'Activos' },
  { id: 'alcance', label: 'Alcance' },
  { id: 'aprendizajes', label: 'Aprendizajes' },
]

// Ficha de contexto de un cliente: es lo que leen los agentes en cada tarea de ese cliente (y de ningún otro)
export default function ClientProfile({ client, departments, onClose, onRenamed, showToast, userEmail }) {
  const base = emptyClient(client?.nombre || '')
  const c = client || {}
  const [tab, setTab] = useState('negocio')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    nombre: c.nombre || '',
    activo: c.activo !== false,
    interno: !!c.interno,
    permiteModelosGratis: c.permiteModelosGratis === true,
    departamentos: c.departamentos || [],
    descripcion: c.negocio?.descripcion || '',
    servicios: toLines(c.negocio?.servicios),
    zona: c.negocio?.zona || '',
    publico: c.negocio?.publico || '',
    tono: c.marca?.tono || '',
    colores: (c.marca?.colores || []).join(', '),
    logoUrl: c.marca?.logoUrl || '',
    palabrasSi: toLines(c.marca?.palabrasSi),
    palabrasNo: toLines(c.marca?.palabrasNo),
    objetivos: toLines(c.objetivos),
    web: c.activos?.web || '',
    redes: c.activos?.redes || '',
    repos: toLines(c.activos?.repos),
    driveFolderId: c.activos?.driveFolderId || '',
    bibliotecaPath: c.activos?.bibliotecaPath || '',
    dominios: toLines(c.alcanceAutorizado?.dominios),
    alcanceRepos: toLines(c.alcanceAutorizado?.repos),
    alcanceNotas: c.alcanceAutorizado?.notas || '',
    autorizadoPor: c.alcanceAutorizado?.autorizadoPor || '',
    alcanceFecha: c.alcanceAutorizado?.fecha || '',
    aprendizajes: c.aprendizajes || [],
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const toggleDept = (id) => set('departamentos',
    form.departamentos.includes(id) ? form.departamentos.filter(d => d !== id) : [...form.departamentos, id])

  const removeLearning = (i) => set('aprendizajes', form.aprendizajes.filter((_, j) => j !== i))

  const handleSave = async () => {
    const nombre = form.nombre.trim()
    if (!nombre) { showToast('El cliente necesita un nombre', 'error'); return }
    setSaving(true)
    // Link de Drive o ID: se guarda solo el ID de la carpeta
    const folderId = (form.driveFolderId.match(/folders\/([\w-]+)/)?.[1] || form.driveFolderId).trim()
    const data = {
      ...base, ...c,
      nombre, slug: slugify(nombre), activo: form.activo, interno: form.interno, permiteModelosGratis: form.permiteModelosGratis,
      departamentos: form.departamentos,
      negocio: { descripcion: form.descripcion.trim(), servicios: fromLines(form.servicios), zona: form.zona.trim(), publico: form.publico.trim() },
      marca: {
        tono: form.tono.trim(), logoUrl: form.logoUrl.trim(),
        colores: form.colores.split(',').map(x => x.trim()).filter(Boolean),
        palabrasSi: fromLines(form.palabrasSi), palabrasNo: fromLines(form.palabrasNo),
      },
      objetivos: fromLines(form.objetivos),
      activos: { web: form.web.trim(), redes: form.redes.trim(), repos: fromLines(form.repos), driveFolderId: folderId, bibliotecaPath: form.bibliotecaPath.trim() },
      alcanceAutorizado: {
        dominios: fromLines(form.dominios), repos: fromLines(form.alcanceRepos), notas: form.alcanceNotas.trim(),
        autorizadoPor: form.autorizadoPor.trim(), fecha: form.alcanceFecha,
      },
      aprendizajes: form.aprendizajes,
      updatedAt: serverTimestamp(), updatedBy: userEmail,
    }
    delete data.id
    try {
      await setDoc(doc(db, 'clients', c.id), data)
      if (c.nombre && c.nombre !== nombre) await onRenamed?.(c.nombre, nombre)
      showToast('Ficha del cliente guardada')
      onClose()
    } catch (e) {
      console.error(e)
      showToast('No se pudo guardar la ficha', 'error')
    }
    setSaving(false)
  }

  const field = (label, k, { area = false, rows = 3, placeholder = '', hint = '', type = 'text' } = {}) => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {area
        ? <textarea className="form-textarea" rows={rows} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} />
        : <input className="form-input" type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={placeholder} />}
      {hint && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{hint}</span>}
    </div>
  )

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h2 className="modal-title">Ficha de {c.nombre || 'cliente'}</h2>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: -8, marginBottom: 14 }}>
          Los agentes leen esta ficha en cada tarea de este cliente. Nunca ven la de otro cliente.
        </p>

        <div className="tab-row">
          {TABS.map(t => (
            <button key={t.id} type="button" className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(t.id)}>
              {t.label}{t.id === 'aprendizajes' && form.aprendizajes.length ? ` (${form.aprendizajes.length})` : ''}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          {tab === 'negocio' && <>
            <div className="form-row">
              {field('Nombre', 'nombre')}
              <div className="form-group">
                <label className="form-label">Estado</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={form.activo} onChange={e => set('activo', e.target.checked)} /> Cliente activo
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" checked={form.interno} onChange={e => set('interno', e.target.checked)} /> Proyecto propio (interno)
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}
                  title="Los planes gratis (Gemini con cuenta personal, claves gratis) pueden usar lo que reciben para entrenar sus modelos">
                  <input type="checkbox" checked={form.permiteModelosGratis} onChange={e => set('permiteModelosGratis', e.target.checked)} />
                  <span>Permite modelos gratis <span style={{ fontSize: 11, color: 'var(--text-3)' }}>(pueden entrenar con los datos)</span></span>
                </label>
              </div>
            </div>
            {field('A qué se dedica', 'descripcion', { area: true, placeholder: 'Qué vende, cómo trabaja, qué lo diferencia…' })}
            {field('Servicios o productos', 'servicios', { area: true, hint: 'Uno por línea.' })}
            <div className="form-row">
              {field('Zona', 'zona', { placeholder: 'Ej. Cali, Colombia' })}
              {field('Público', 'publico', { placeholder: 'A quién le vende' })}
            </div>
            {departments.length > 0 && (
              <div className="form-group">
                <label className="form-label">Servicios contratados (departamentos)</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {departments.map(d => (
                    <label key={d.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                      <input type="checkbox" checked={form.departamentos.includes(d.id)} onChange={() => toggleDept(d.id)} /> {d.nombre}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>}

          {tab === 'marca' && <>
            {field('Tono de comunicación', 'tono', { area: true, rows: 2, placeholder: 'Ej. formal, de usted, sereno' })}
            <div className="form-row">
              {field('Colores', 'colores', { placeholder: '#2B3480, #2DC97E', hint: 'Separados por coma.' })}
              {field('Logo (URL)', 'logoUrl', { placeholder: 'https://…' })}
            </div>
            <div className="form-row">
              {field('Palabras o frases que sí', 'palabrasSi', { area: true, hint: 'Una por línea.' })}
              {field('Palabras o frases prohibidas', 'palabrasNo', { area: true, hint: 'Una por línea.' })}
            </div>
          </>}

          {tab === 'objetivos' && field('Objetivos de este trimestre', 'objetivos', { area: true, rows: 6, hint: 'Uno por línea. Los agentes orientan cada entrega a estos objetivos.' })}

          {tab === 'activos' && <>
            <div className="form-row">
              {field('Sitio web', 'web', { placeholder: 'https://…' })}
              {field('Redes', 'redes', { placeholder: '@usuario en Instagram, TikTok…' })}
            </div>
            {field('Repositorios', 'repos', { area: true, rows: 2, hint: 'Uno por línea.' })}
            {field('Carpeta de Google Drive', 'driveFolderId', { placeholder: 'Link o ID de la carpeta', hint: 'Se usa para el link de las entregas aprobadas.' })}
            {field('Biblioteca de fotos (ruta en el PC)', 'bibliotecaPath', { placeholder: 'Ej. SAOR/Biblioteca', hint: 'Relativa a la carpeta de la agencia en Drive.' })}
          </>}

          {tab === 'alcance' && <>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: 0 }}>
              Solo para Seguridad y QA: los agentes se niegan a revisar algo que no esté en esta lista.
            </p>
            <div className="form-row">
              {field('Dominios autorizados', 'dominios', { area: true, rows: 3, hint: 'Uno por línea.' })}
              {field('Repositorios autorizados', 'alcanceRepos', { area: true, rows: 3, hint: 'Uno por línea.' })}
            </div>
            {field('Notas del alcance', 'alcanceNotas', { area: true, rows: 2 })}
            <div className="form-row">
              {field('Autorizado por', 'autorizadoPor')}
              {field('Fecha de autorización', 'alcanceFecha', { type: 'date' })}
            </div>
          </>}

          {tab === 'aprendizajes' && (
            form.aprendizajes.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aún no hay aprendizajes. Se agregan cuando pides correcciones en una tarea de este cliente.</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {form.aprendizajes.map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 12px', background: 'var(--bg-2)', borderRadius: 8 }}>
                      <span style={{ flex: 1, fontSize: 13 }}>{a.texto}<br />
                        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.fecha ? new Date(a.fecha).toLocaleDateString('es-CO') : ''}</span>
                      </span>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => removeLearning(i)} title="Quitar">✕</button>
                    </div>
                  ))}
                </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar ficha'}</button>
        </div>
      </div>
    </div>
  )
}
