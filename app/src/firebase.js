import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { FIREBASE_CONFIG } from './config.js'

if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
  console.error('Falta la configuración de Firebase en app/.env. Ejecuta /instalar en Claude Code.')
}

const app = initializeApp(FIREBASE_CONFIG)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const googleProvider = new GoogleAuthProvider()
// Siempre mostrar el selector de cuentas de Google
googleProvider.setCustomParameters({ prompt: 'select_account' })
