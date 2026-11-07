import React, { useState } from 'react'
import { useApp, APP_VERSION, SUPER_ADMIN_EMAIL } from '../App.jsx'
import Icon from './Icons.jsx'
import { BRAND } from '../config.js'

const EMPLOYEE_NAV = [
  { id: 'dashboard', icon: 'grid',        label: 'Mi Panel' },
  { id: 'office',    icon: 'office',      label: 'Oficina' },
  { id: 'pipeline',  icon: 'columns',     label: 'Pipeline' },
  { id: 'tasks',     icon: 'checkSquare', label: 'Tareas' },
  { id: 'team',      icon: 'users',       label: 'Team' },
]

const ADMIN_NAV = [
  { id: 'dashboard', icon: 'grid',        label: 'Mi Panel' },
  { id: 'office',    icon: 'office',      label: 'Oficina' },
  { id: 'pipeline',  icon: 'columns',     label: 'Pipeline' },
  { id: 'tasks',     icon: 'checkSquare', label: 'Tareas' },
  { id: 'team',      icon: 'users',       label: 'Team' },
]

// Solo el Super Admin gestiona clientes (usuarios vive dentro de Team)
const SUPER_NAV = [
  { id: 'agents',  icon: 'star',     label: 'Agentes' },
  { id: 'clients', icon: 'building', label: 'Clientes' },
  { id: 'agencia', icon: 'columns',  label: 'Agencia' },
]

export default function Header({ page, setPage, onLogout }) {
  const { userProfile, isAdmin, isSuperAdmin, theme, setTheme, openNewTask, user, tasks, openEditTask } = useApp()
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  const items = isAdmin
    ? (isSuperAdmin ? [...ADMIN_NAV, ...SUPER_NAV] : ADMIN_NAV)
    : EMPLOYEE_NAV
  const mobileMain = items.slice(0, 4)
  const mobileMore = items.slice(4)

  const logoSrc = theme === 'dark' ? BRAND.logoDark : BRAND.logo

  // Notificaciones: mis tareas en correcciones + esperando mi aceptación
  const myCorrections = tasks.filter(t => t.asignado === user.uid && t.estado === 'en_revision')
  const myPendingAccept = tasks.filter(t => t.asignado === user.uid && t.pendingAcceptance)
  const notifCount = myCorrections.length + myPendingAccept.length

  return (
    <>
    <header className="header">
      {/* Logo + versión */}
      <div className="header-logo" style={{ cursor: 'pointer', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}
        onClick={() => setPage(isAdmin ? 'dashboard' : 'pipeline')}>
        <img
          src={logoSrc}
          alt={BRAND.company}
          style={{ height: 24, objectFit: 'contain' }}
          onError={e => {
            e.target.style.display = 'none'
            e.target.nextSibling.style.display = 'flex'
          }}
        />
        <div style={{
          display: 'none', width: 24, height: 24, borderRadius: 6,
          background: 'var(--purple)', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 900, color: '#fff'
        }}>E</div>
        <span style={{ fontSize: 8.5, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
          {BRAND.appName} v{APP_VERSION}
        </span>
      </div>

      {/* Nav escritorio */}
      <nav className="header-nav">
        {items.map(item => (
          <button
            key={item.id}
            className={`nav-btn ${page === item.id ? 'active' : ''}`}
            onClick={() => setPage(item.id)}
          >
            <Icon name={item.icon} size={15} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Acciones */}
      <div className="header-actions">
        <button className="btn btn-primary btn-sm" onClick={openNewTask}>
          <Icon name="plus" size={14} /> Nueva tarea
        </button>

        {/* Campana de notificaciones */}
        <div className="dropdown-wrap">
          <button
            className="icon-btn"
            onClick={() => setNotifOpen(v => !v)}
            title="Notificaciones"
            style={{ position: 'relative' }}
          >
            <Icon name="bell" size={16} />
            {notifCount > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -5,
                minWidth: 17, height: 17, borderRadius: 99,
                background: 'var(--danger)', color: '#fff',
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px', border: '2px solid var(--card)'
              }}>{notifCount}</span>
            )}
          </button>

          {notifOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setNotifOpen(false)} />
              <div className="dropdown-menu" style={{ zIndex: 200, minWidth: 300, maxWidth: 340 }}>
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="bell" size={14} /> Notificaciones
                </div>

                {notifCount === 0 && (
                  <div style={{ padding: '18px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                    Sin notificaciones pendientes
                  </div>
                )}

                {/* Tareas devueltas esperando aceptación */}
                {myPendingAccept.map(t => (
                  <button key={t.id} className="dropdown-item"
                    onClick={() => { openEditTask(t); setNotifOpen(false) }}
                    style={{ alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--purple)', marginTop: 2 }}><Icon name="alert" size={15} /></span>
                    <span>
                      <strong style={{ display: 'block', fontSize: 12.5 }}>Tarea por aceptar</strong>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.tarea}</span>
                    </span>
                  </button>
                ))}

                {/* Tareas en correcciones */}
                {myCorrections.map(t => (
                  <button key={t.id} className="dropdown-item"
                    onClick={() => { openEditTask(t); setNotifOpen(false) }}
                    style={{ alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--warning)', marginTop: 2 }}><Icon name="bulb" size={15} /></span>
                    <span>
                      <strong style={{ display: 'block', fontSize: 12.5 }}>Correcciones solicitadas</strong>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.tarea}</span>
                      {t.feedback && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', fontStyle: 'italic' }}>
                          "{t.feedback.slice(0, 60)}{t.feedback.length > 60 ? '…' : ''}"
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          className="icon-btn"
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          title="Cambiar tema"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>

        {/* Menú usuario */}
        <div className="dropdown-wrap">
          <div className="user-chip" onClick={() => setMenuOpen(v => !v)}>
            {userProfile?.photo
              ? <img src={userProfile.photo} alt="" />
              : <div style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: userProfile?.color || '#4700E0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#fff'
                }}>
                  {(userProfile?.name || '?')[0].toUpperCase()}
                </div>
            }
            <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userProfile?.name?.split(' ')[0] || 'Yo'}
            </span>
            <Icon name="chevronDown" size={12} style={{ color: 'var(--text-3)' }} />
          </div>

          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setMenuOpen(false)} />
              <div className="dropdown-menu" style={{ zIndex: 200 }}>
                <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{userProfile?.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{userProfile?.email}</div>
                  <div style={{ marginTop: 6 }}>
                    <span className={`badge ${userProfile?.role === 'admin' ? 'badge-admin' : 'badge-empleado'}`}>
                      {userProfile?.email === SUPER_ADMIN_EMAIL ? 'Super Admin'
                        : userProfile?.role === 'admin' ? 'Manager' : 'Empleado'}
                    </span>
                  </div>
                </div>
                <button className="dropdown-item" onClick={() => { setPage('profile'); setMenuOpen(false) }}>
                  <Icon name="user" size={14} /> Mi perfil
                </button>
                <button className="dropdown-item" onClick={() => {
                  localStorage.removeItem(`tutorial_${userProfile?.uid}`)
                  window.location.reload()
                }}>
                  <Icon name="question" size={14} /> Ver tutorial
                </button>
                <div className="dropdown-divider" />
                <button className="dropdown-item danger" onClick={onLogout}>
                  <Icon name="logout" size={14} /> Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>

    </header>

    {/* Nav inferior móvil: FUERA del header — el backdrop-filter del header
        rompía el position:fixed y el menú se iba con el scroll */}
      <nav className="mobile-nav">
        {mobileMain.map(item => (
          <button
            key={item.id}
            className={`mobile-nav-btn ${page === item.id ? 'active' : ''}`}
            onClick={() => { setPage(item.id); setMoreOpen(false) }}
          >
            <Icon name={item.icon} size={19} />
            <span className="mobile-nav-label">{item.label}</span>
          </button>
        ))}
        {mobileMore.length > 0 && (
          <button
            className={`mobile-nav-btn ${mobileMore.some(i => i.id === page) ? 'active' : ''}`}
            onClick={() => setMoreOpen(v => !v)}
          >
            <Icon name="menu" size={19} />
            <span className="mobile-nav-label">Más</span>
          </button>
        )}
      </nav>

      {/* Hoja "Más" móvil */}
      {moreOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 290, background: 'rgba(0,0,0,0.4)' }}
            onClick={() => setMoreOpen(false)} />
          <div className="mobile-more-sheet">
            {mobileMore.map(item => (
              <button key={item.id} className="dropdown-item"
                style={{ fontSize: 15, padding: '12px 16px' }}
                onClick={() => { setPage(item.id); setMoreOpen(false) }}>
                <Icon name={item.icon} size={16} /> {item.label}
              </button>
            ))}
            <button className="dropdown-item"
              style={{ fontSize: 15, padding: '12px 16px' }}
              onClick={() => { setPage('profile'); setMoreOpen(false) }}>
              <Icon name="user" size={16} /> Mi perfil
            </button>
          </div>
        </>
      )}
    </>
  )
}
