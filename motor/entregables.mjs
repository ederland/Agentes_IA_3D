// Entregables con vista previa: el agente deja HTML en ./salida y el motor (no el agente) lo convierte a PDF
// y saca imágenes de cada página para revisarlas en el panel antes de aprobar.
// Seguridad: el HTML se abre sin JavaScript y solo puede cargar archivos de su carpeta salida/
// e imágenes, fuentes y hojas de estilo por https.

import { createRequire } from 'node:module'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, basename, sep } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import os from 'node:os'

const require = createRequire(import.meta.url)
const A4 = { width: 794, height: 1123 } // 210 x 297 mm a 96 ppp
const MAX_PAGINAS = 8
const MAX_PREVIEW_BYTES = 850_000 // un documento de Firestore admite ~1 MB

// Chromium sin ventana: media-config.json → navegador, CHROME_PATH, el de Playwright/Puppeteer o Chrome/Edge del sistema
export function buscarNavegador(preferido) {
  const candidatos = [preferido, process.env.CHROME_PATH].filter(Boolean)
  const home = os.homedir()
  for (const base of [join(home, '.cache', 'ms-playwright'), join(home, 'AppData', 'Local', 'ms-playwright'), join(home, 'Library', 'Caches', 'ms-playwright')]) {
    let dirs = []
    try { dirs = readdirSync(base).filter(d => d.startsWith('chromium')).sort().reverse() } catch {}
    for (const d of dirs) {
      candidatos.push(
        join(base, d, 'chrome-linux', 'headless_shell'), join(base, d, 'chrome-linux', 'chrome'),
        join(base, d, 'chrome-win', 'headless_shell.exe'), join(base, d, 'chrome-win', 'chrome.exe'),
        join(base, d, 'chrome-mac', 'headless_shell'), join(base, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'))
    }
  }
  candidatos.push(
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  return candidatos.find(p => { try { return existsSync(p) } catch { return false } }) || null
}

export function crearEntregables({ log, config = () => ({}) }) {
  let puppeteer = null
  const cargar = () => {
    if (!puppeteer) puppeteer = require('puppeteer-core')
    return puppeteer
  }

  // HTML nuevos o cambiados en salida/ desde que empezó la tarea
  const htmlsDe = (salida, desdeMs) => {
    try {
      return readdirSync(salida).filter(n => /\.html?$/i.test(n))
        .map(n => join(salida, n)).filter(p => statSync(p).mtimeMs >= desdeMs - 1000)
    } catch { return [] }
  }

  async function capturar(page, calidad) {
    // Con secciones .pagina (210 x 297 mm) se captura cada una; si no, la página en tramos de A4
    const secciones = await page.$$('.pagina')
    const out = []
    if (secciones.length) {
      for (const s of secciones.slice(0, MAX_PAGINAS)) out.push(await s.screenshot({ type: 'jpeg', quality: calidad, encoding: 'base64' }))
    } else {
      const alto = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => A4.height)
      for (let y = 0; y < Math.min(alto, A4.height * MAX_PAGINAS); y += A4.height) {
        out.push(await page.screenshot({ type: 'jpeg', quality: calidad, encoding: 'base64', clip: { x: 0, y, width: A4.width, height: Math.min(A4.height, alto - y) }, captureBeyondViewport: true }))
      }
    }
    return out
  }

  // Convierte cada HTML de salida/ en PDF (mismo nombre) y devuelve las vistas previas
  async function convertir(cwd, desdeMs) {
    const salida = join(cwd, 'salida')
    const htmls = htmlsDe(salida, desdeMs)
    if (!htmls.length) return { pdfs: [], previews: [] }
    const exe = buscarNavegador(config().navegador)
    if (!exe) return { pdfs: [], previews: [], error: 'No encontré un navegador para crear el PDF (instala Chrome o define navegador en media-config.json)' }
    const raiz = resolve(salida) + sep
    let browser
    try {
      browser = await cargar().launch({
        executablePath: exe, headless: /headless_shell/.test(exe) ? 'shell' : true,
        args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
      })
    } catch (e) {
      const libs = [...String(e.message).matchAll(/(lib[\w.+-]+\.so[\w.]*)/g)].map(m => m[1])
      return {
        pdfs: [], previews: [],
        error: libs.length
          ? `Al navegador le faltan librerías del sistema (${[...new Set(libs)].join(', ')}). En Linux/WSL: sudo apt-get install -y libnss3 libnspr4 libasound2t64`
          : `No pude abrir el navegador para crear el PDF: ${String(e.message).split('\n')[0].slice(0, 200)}`,
      }
    }
    const pdfs = [], previews = []
    try {
      for (const html of htmls) {
        const page = await browser.newPage()
        try {
          await page.setJavaScriptEnabled(false)
          await page.setRequestInterception(true)
          page.on('request', req => {
            const url = req.url()
            if (url.startsWith('data:')) return req.continue()
            if (url.startsWith('file:')) {
              let p = ''
              try { p = resolve(fileURLToPath(url)) } catch {}
              return p.startsWith(raiz) ? req.continue() : req.abort()
            }
            if (url.startsWith('https:') && ['image', 'font', 'stylesheet'].includes(req.resourceType())) return req.continue()
            return req.abort()
          })
          await page.setViewport({ ...A4, deviceScaleFactor: 1 })
          await page.goto(pathToFileURL(html).href, { waitUntil: 'networkidle0', timeout: 60_000 })
          const pdf = html.replace(/\.html?$/i, '.pdf')
          await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true, timeout: 60_000 })
          pdfs.push(basename(pdf))
          // La vista previa cabe en un documento de Firestore: baja la calidad si hace falta
          let paginas = []
          for (const calidad of [70, 50, 35]) {
            paginas = await capturar(page, calidad)
            if (paginas.reduce((n, p) => n + p.length, 0) < MAX_PREVIEW_BYTES / Math.max(1, htmls.length)) break
          }
          previews.push({ archivo: basename(pdf), paginas: paginas.map(b => 'data:image/jpeg;base64,' + b) })
        } catch (e) {
          log(`No pude convertir ${basename(html)} a PDF:`, e.message)
        } finally {
          await page.close().catch(() => {})
        }
      }
    } finally {
      await browser.close().catch(() => {})
    }
    // Recorta para no pasar el límite del documento
    let total = 0
    for (const p of previews) {
      p.paginas = p.paginas.filter(img => (total += img.length) < MAX_PREVIEW_BYTES)
    }
    return { pdfs, previews }
  }

  return { convertir }
}
