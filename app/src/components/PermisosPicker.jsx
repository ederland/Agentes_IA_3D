import React from 'react'
import { PERMISOS } from '../agencia.js'

// Casillas de grupos de permisos. "base" son los que el agente ya tiene (por su rol o por el tipo de tarea):
// se muestran marcados y bloqueados, con el motivo.
export default function PermisosPicker({ value = [], onChange, base = {}, disabled = false }) {
  const toggle = (id) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6 }}>
      {PERMISOS.map(p => {
        const motivo = base[p.id]
        const checked = !!motivo || value.includes(p.id)
        return (
          <label key={p.id} title={p.ayuda || ''}
            style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12.5, opacity: motivo ? 0.65 : 1, color: p.sensible ? 'var(--danger)' : undefined }}>
            <input type="checkbox" checked={checked} disabled={disabled || !!motivo} onChange={() => toggle(p.id)} />
            <span>{p.label}{motivo && <span style={{ color: 'var(--text-3)' }}> · {motivo}</span>}</span>
          </label>
        )
      })}
    </div>
  )
}
