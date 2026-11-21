// Configuración del negocio. Todo sale de app/.env (lo genera el asistente /instalar).
const env = import.meta.env

export const BRAND = {
  appName: env.VITE_APP_NAME || 'Agentes IA 3D',
  company: env.VITE_COMPANY_NAME || 'Mi empresa',
  color: env.VITE_BRAND_COLOR || '#4700E0',
  logo: env.VITE_LOGO_URL || '/logo.svg',
  logoDark: env.VITE_LOGO_DARK_URL || env.VITE_LOGO_URL || '/logo.svg',
  url: env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : ''),
}

// Dueño de la cuenta: acceso total y oficina principal en la Oficina 3D
export const SUPER_ADMIN_EMAIL = (env.VITE_SUPER_ADMIN_EMAIL || '').toLowerCase()

export const FIREBASE_CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

// Aplica el color de marca a toda la interfaz (variables CSS --purple*)
export function applyBrand() {
  const hex = BRAND.color.replace('#', '')
  const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16)
  if (Number.isNaN(n)) return
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const root = document.documentElement.style
  root.setProperty('--purple', `rgb(${r}, ${g}, ${b})`)
  root.setProperty('--purple-hover', `rgb(${Math.min(255, r + 19)}, ${Math.min(255, g + 26)}, ${Math.min(255, b + 15)})`)
  root.setProperty('--purple-light', `rgba(${r}, ${g}, ${b}, 0.12)`)
  root.setProperty('--purple-mid', `rgba(${r}, ${g}, ${b}, 0.25)`)
  root.setProperty('--brand-rgb', `${r}, ${g}, ${b}`)
  // Matiz de la marca (0-360): tiñe los grises de fondo y los textos para que combinen con el color
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  if (d > 0) {
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h = Math.round(h * 60); if (h < 0) h += 360
    root.setProperty('--brand-h', String(h))
  }
  document.title = BRAND.appName
}
