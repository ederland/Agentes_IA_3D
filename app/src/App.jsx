import React, { useState, useEffect, useRef, createContext, useContext } from 'react'
import { auth, db, googleProvider } from './firebase.js'
import { onAuthStateChanged, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, onSnapshot, orderBy, query, getDocs } from 'firebase/firestore'

import LoginPage from './pages/LoginPage.jsx'
import Dashboard from './pages/Dashboard.jsx'
import TeamPage from './pages/TeamPage.jsx'
import TasksView from './pages/TasksView.jsx'
import KanbanView from './pages/KanbanView.jsx'
import UsersAdmin from './pages/UsersAdmin.jsx'
import ClientsAdmin from './pages/ClientsAdmin.jsx'
import AgentsAdmin from './pages/AgentsAdmin.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import PendingApproval from './pages/PendingApproval.jsx'
import Header from './components/Header.jsx'
import PomodoroWidget from './components/PomodoroWidget.jsx'
import ActivityWatchdog from './components/ActivityWatchdog.jsx'
import Tutorial from './components/Tutorial.jsx'
import TaskForm from './components/TaskForm.jsx'
import { logOnline } from './utils/worklog.js'

// La oficina 3D carga Three.js: se descarga solo al abrir esa pestaña
const OfficeView = React.lazy(() => import('./pages/OfficeView.jsx'))

export const AppContext = createContext()
export const useApp = () => useContext(AppContext)

import { SUPER_ADMIN_EMAIL, BRAND } from './config.js'
export { SUPER_ADMIN_EMAIL }
// Versión leída del package.json — se actualiza sola en cada build
import pkg from '../package.json'
export const APP_VERSION = pkg.version

const RANDOM_COLORS = [
  '#4700E0','#7c3aed','#db2777','#0891b2','#059669',
  '#d97706','#dc2626','#2563eb','#16a34a','#9333ea'
]

// Clientes iniciales: se administran en la sección Clientes
const DEFAULT_CLIENTS = []

export default function App() {
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [agents, setAgents] = useState([])
  const [clients, setClients] = useState(DEFAULT_CLIENTS)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(null) // null hasta conocer el rol
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light')
  const [toast, setToast] = useState(null)
  const [showTutorial, setShowTutorial] = useState(false)
  const [taskFormOpen, setTaskFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [viewAsEmployee, setViewAsEmployee] = useState(false) // admin viendo como empleado
  const [chatTargetUid, setChatTargetUid] = useState(null) // abrir chat con alguien específico
  const toastTimer = useRef(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    // Inicio de sesión por redirección (sin ventana emergente): al volver de Google, mostrar errores si los hubo
    getRedirectResult(auth)
      .then((res) => { if (res) requestNotifPermission() })
      .catch((e) => { console.error('Inicio de sesión:', e.code, e.message); showToast(`Error al iniciar sesión (${e.code})`, 'error') })
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u)
        await loadOrCreateProfile(u)
        const seen = localStorage.getItem(`tutorial_${u.uid}`)
        if (!seen) setShowTutorial(true)
      } else {
        setUser(null)
        setUserProfile(null)
        setPage(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  // Página inicial según rol: empleados → pipeline, admin → dashboard
  useEffect(() => {
    if (userProfile && page === null) {
      setPage(userProfile.role === 'admin' ? 'dashboard' : 'pipeline')
    }
  }, [userProfile, page])

  // Real-time listeners
  useEffect(() => {
    if (!user) return
    const qTasks = query(collection(db, 'tasks'), orderBy('createdAt', 'desc'))
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })))
    })
    const unsubClients = onSnapshot(doc(db, 'config', 'clients'), (snap) => {
      if (snap.exists() && snap.data().list) setClients(snap.data().list)
    })
    // Perfil propio en tiempo real: cambios de rol aplican al instante sin re-login
    const unsubMyProfile = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setUserProfile({ uid: user.uid, ...snap.data() })
    })
    // Agentes de IA (catálogo activo y en reserva)
    const unsubAgents = onSnapshot(collection(db, 'agents'),
      (snap) => setAgents(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      (err) => console.warn('agents:', err.code))
    return () => { unsubTasks(); unsubUsers(); unsubClients(); unsubMyProfile(); unsubAgents() }
  }, [user])

  // Presencia + tiempo de conexión. Corre SOLO cuando el perfil ya existe,
  // para no crear docs fantasma (sin email/rol) antes que loadOrCreateProfile.
  useEffect(() => {
    if (!user || !userProfile) return
    const isActive = userProfile.role === 'admin' || userProfile.role === 'empleado'
    const updatePresence = () => {
      setDoc(doc(db, 'users', user.uid), { lastSeen: serverTimestamp() }, { merge: true })
    }
    updatePresence()
    const presenceInterval = setInterval(() => {
      updatePresence()
      if (isActive) logOnline(user.uid, 60) // 1 min conectado
    }, 60000)
    return () => clearInterval(presenceInterval)
  }, [user, userProfile?.role])

  const loadOrCreateProfile = async (u) => {
    const ref = doc(db, 'users', u.uid)
    const snap = await getDoc(ref)
    // Doc "fantasma": creado por el heartbeat de presencia antes que el perfil
    // (solo tiene lastSeen, sin email/nombre/rol). Tratarlo como cuenta nueva.
    const isGhost = snap.exists() && !snap.data().email
    if (snap.exists() && !isGhost) {
      const data = snap.data()
      // El super admin SIEMPRE es admin — corrige roles viejos automáticamente
      if (u.email === SUPER_ADMIN_EMAIL && data.role !== 'admin') {
        await setDoc(ref, { role: 'admin' }, { merge: true })
        data.role = 'admin'
      }
      // Normalizar roles: solo existen admin/empleado/pending.
      // Limpia mayúsculas/espacios sin degradar roles válidos. Un rol
      // desconocido o AUSENTE vuelve a 'pending' (requiere tu aprobación).
      const validRoles = ['admin', 'empleado', 'pending']
      const cleaned = String(data.role || '').trim().toLowerCase()
      if (validRoles.includes(cleaned)) {
        if (data.role !== cleaned) {
          await setDoc(ref, { role: cleaned }, { merge: true })
          data.role = cleaned
        }
      } else {
        const fallback = u.email === SUPER_ADMIN_EMAIL ? 'admin' : 'pending'
        await setDoc(ref, { role: fallback }, { merge: true })
        data.role = fallback
      }
      setUserProfile({ uid: u.uid, ...data })
      return
    }

    // ¿Es el super admin?
    const isSuperAdmin = u.email === SUPER_ADMIN_EMAIL

    // ¿Fue invitado por un admin? (colección invites, doc id = email)
    let invitedRole = null
    try {
      const inviteSnap = await getDoc(doc(db, 'invites', u.email.toLowerCase()))
      if (inviteSnap.exists()) {
        invitedRole = inviteSnap.data().role || 'empleado'
      }
    } catch (e) { /* sin invitación */ }

    // Datos previos si el doc existía incompleto (fantasma): conservar
    // nombre/foto/bio pero SIEMPRE forzar identidad y quedar pendiente
    // de aprobación (salvo super admin o invitado).
    const old = isGhost ? snap.data() : {}

    const color = RANDOM_COLORS[Math.floor(Math.random() * RANDOM_COLORS.length)]
    const profile = {
      email: u.email,
      name: old.name || u.displayName || u.email.split('@')[0],
      photo: old.photo || u.photoURL || '',
      // Super admin entra directo. Invitados entran con su rol asignado.
      // Todos los demás (incluyendo cuentas fantasma reparadas) quedan pendientes.
      role: isSuperAdmin ? 'admin' : (invitedRole || 'pending'),
      phone: old.phone || '',
      bio: old.bio || '',
      position: old.position || '',
      color: old.color || color,
      createdAt: old.createdAt || serverTimestamp(),
      lastSeen: serverTimestamp(),
    }
    await setDoc(ref, profile, { merge: true })
    // La invitación se borra DESPUÉS de crear el perfil: las reglas la consultan para validar el rol
    if (invitedRole) {
      try { await deleteDoc(doc(db, 'invites', u.email.toLowerCase())) } catch (e) { /* ya no existe */ }
    }
    setUserProfile({ uid: u.uid, ...profile })
  }

  const showToast = (msg, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, type, id: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 3800)
  }

  const requestNotifPermission = () => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }

  const sendNotification = (title, body) => {
    // try/catch obligatorio: en Chrome de Android `new Notification()` lanza
    // TypeError aunque haya permiso — no debe romper el flujo que la llama
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: BRAND.logo })
      }
    } catch (e) { /* notificación no soportada en este dispositivo */ }
  }

  const handleLogin = async () => {
    try {
      await signInWithRedirect(auth, googleProvider)
    } catch (e) {
      console.error('Inicio de sesión:', e.code, e.message)
      showToast(`Error al iniciar sesión (${e.code})`, 'error')
    }
  }

  const handleLogout = async () => {
    await signOut(auth)
    setPage(null)
    setTasks([])
    setUsers([])
    setViewAsEmployee(false)
  }

  const openEditTask = (task) => { setEditingTask(task); setTaskFormOpen(true) }
  const openNewTask = () => { setEditingTask(null); setTaskFormOpen(true) }
  const closeTaskForm = () => { setTaskFormOpen(false); setEditingTask(null) }

  if (loading || (user && userProfile && page === null)) {
    return (
      <div className="loading-screen">
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage onLogin={handleLogin} theme={theme} />

  const realIsAdmin = userProfile?.role === 'admin'
  const isPending = userProfile?.role === 'pending'
  // Super admin: el dueño (email fijo) o cualquiera a quien él le otorgue el flag
  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL || userProfile?.isSuper === true

  if (isPending) {
    return <PendingApproval userProfile={userProfile} onLogout={handleLogout} theme={theme} />
  }

  // Modo "ver como empleado": el admin ve la plataforma sin privilegios
  const isAdmin = realIsAdmin && !viewAsEmployee

  const ctxValue = {
    user, userProfile, setUserProfile,
    tasks, users, agents, clients, setClients,
    isAdmin, realIsAdmin, isSuperAdmin,
    isManager: isAdmin && !isSuperAdmin,
    viewAsEmployee, setViewAsEmployee,
    chatTargetUid, setChatTargetUid,
    page, setPage,
    showToast, sendNotification,
    theme, setTheme,
    openEditTask, openNewTask, closeTaskForm,
    taskFormOpen, editingTask,
    setTaskFormOpen, setEditingTask,
  }

  return (
    <AppContext.Provider value={ctxValue}>
      <div className="app-layout">
        {/* Banner modo empleado */}
        {viewAsEmployee && (
          <div style={{
            background: 'var(--warning)', color: '#000', textAlign: 'center',
            padding: '6px 12px', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12
          }}>
            👁 Estás viendo la plataforma como EMPLEADO
            <button
              onClick={() => { setViewAsEmployee(false); setPage('dashboard') }}
              style={{
                background: '#000', color: '#fff', border: 'none', borderRadius: 6,
                padding: '3px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}
            >
              Volver a modo Admin
            </button>
          </div>
        )}

        <Header page={page} setPage={setPage} onLogout={handleLogout} />
        <div className="app-body">
          <main className="app-main">
            {page === 'dashboard' && <Dashboard />}
            {page === 'team'      && <TeamPage />}
            {page === 'tasks'     && <TasksView />}
            {page === 'pipeline'  && <KanbanView />}
            {page === 'office'    && (
              <React.Suspense fallback={<div className="office-loading"><div className="spinner" /> Cargando la oficina...</div>}>
                <OfficeView />
              </React.Suspense>
            )}
            {page === 'profile'   && <ProfilePage />}
            {page === 'users'     && isAdmin && isSuperAdmin && <UsersAdmin />}
            {page === 'clients'   && isAdmin && isSuperAdmin && <ClientsAdmin />}
            {page === 'agents'    && isAdmin && isSuperAdmin && <AgentsAdmin />}
          </main>
        </div>

        {/* Footer */}
        <footer className="app-footer">
          <span>{BRAND.appName} v{APP_VERSION}</span>
          <span><strong>{BRAND.company}</strong> © {new Date().getFullYear()} · Hecho con <a href="https://github.com/ederland/Agentes_IA_3D" target="_blank" rel="noreferrer">Agentes IA 3D</a> (código abierto)</span>
        </footer>

        <PomodoroWidget />
        <ActivityWatchdog />

        {toast && (
          <div className={`toast toast-${toast.type}`} key={toast.id}>
            <span>{toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}</span>
            {toast.msg}
          </div>
        )}

        {showTutorial && (
          <Tutorial
            isAdmin={isAdmin}
            onClose={() => {
              localStorage.setItem(`tutorial_${user.uid}`, '1')
              setShowTutorial(false)
            }}
          />
        )}

        {taskFormOpen && <TaskForm />}
      </div>
    </AppContext.Provider>
  )
}
