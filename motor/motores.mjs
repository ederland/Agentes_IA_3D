// Motores de agente además de Claude Code: Codex CLI (cuenta de ChatGPT) y Gemini CLI (clave de API de Gemini).
// Desde el 18 de junio de 2026 Gemini CLI ya no atiende el plan gratis con cuenta de Google ni AI Pro/Ultra
// (Google los pasó a Antigravity CLI); sigue funcionando con claves de API y licencias de empresa. Cada adaptador recibe la misma instrucción que Claude y devuelve el mismo formato:
//   { code, json: { result, total_cost_usd, num_turns }, raw, err, limite }
// "limite" = el proveedor respondió que se acabó la cuota: el motor prueba con el siguiente motor de respaldo.
//
// Seguridad: los dos trabajan con la carpeta de la tarea como raíz de escritura.
// - Codex: sandbox "workspace-write" (escribe solo en la carpeta de la tarea; sin red salvo búsqueda web).
// - Gemini: modo "auto_edit" (aprueba solo editar archivos dentro del espacio de trabajo; los comandos quedan
//   sin aprobar y por eso no se ejecutan en modo sin ventana).

import { spawn, execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import os from 'node:os'

const LIMITE = /usage limit|rate.?limit|quota|exhausted|RESOURCE_EXHAUSTED|\b429\b|hit your limit|too many requests|insufficient_quota/i
const IS_WIN = process.platform === 'win32'

export function crearMotores({ ROOT, log, timeoutMs = 25 * 60 * 1000 }) {
  const bin = (name) => {
    const local = join(ROOT, 'node_modules', '.bin', IS_WIN ? `${name}.cmd` : name)
    return existsSync(local) ? local : name
  }

  function correr(cmd, args, { cwd, input, env = {} }) {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { cwd, windowsHide: true, shell: IS_WIN, env: { ...process.env, ...env, NO_COLOR: '1' } })
      let out = '', err = ''
      const timer = setTimeout(() => { err += '\nTiempo máximo agotado.'; child.kill() }, timeoutMs)
      child.stdout.on('data', d => { out += d })
      child.stderr.on('data', d => { err += d })
      child.on('error', e => { clearTimeout(timer); resolve({ code: -1, out, err: err + e.message }) })
      child.on('close', code => { clearTimeout(timer); resolve({ code, out, err }) })
      child.stdin.end(input || '')
    })
  }

  // Codex CLI: codex exec, instrucción por stdin, respuesta final en un archivo
  async function codex(prompt, cwd, { web = false, env } = {}) {
    const final = join(cwd, '.codex-respuesta.md')
    rmSync(final, { force: true })
    const args = [
      'exec', '--skip-git-repo-check', '--ephemeral', '--color', 'never',
      '--sandbox', 'workspace-write', '-C', cwd, '-o', final,
      ...(web ? ['-c', 'web_search="live"'] : []),
      '-',
    ]
    const r = await correr(bin('codex'), args, { cwd, input: prompt, env })
    const result = existsSync(final) ? readFileSync(final, 'utf8').trim() : ''
    rmSync(final, { force: true })
    const texto = r.err + r.out
    return {
      code: result ? r.code : (r.code || 1), json: result ? { result, total_cost_usd: 0, num_turns: 0 } : null,
      raw: r.out, err: r.err.slice(-4000), limite: !result && LIMITE.test(texto),
    }
  }

  // Gemini CLI: -p en modo sin ventana, salida JSON { response, stats }
  async function gemini(prompt, cwd, { env } = {}) {
    const args = ['-p', 'Sigue exactamente las instrucciones que recibes por la entrada estándar.', '--output-format', 'json', '--approval-mode', 'auto_edit', '--skip-trust']
    const r = await correr(bin('gemini'), args, { cwd, input: prompt, env })
    let j = null
    try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))) } catch {}
    const result = String(j?.response || '').trim()
    const turnos = Object.values(j?.stats?.models || {}).reduce((n, m) => n + (m?.api?.totalRequests || 0), 0)
    return {
      code: result ? 0 : (r.code || 1), json: result ? { result, total_cost_usd: 0, num_turns: turnos } : null,
      raw: r.out, err: (j?.error?.message || r.err).slice(-4000), limite: !result && LIMITE.test(r.err + r.out + (j?.error?.message || '')),
    }
  }

  // Antigravity CLI (agy, Google AI Pro/Ultra; reemplazo de Gemini CLI). No lee la entrada estándar en modo -p:
// la instrucción va en un archivo de la carpeta de la tarea. Permisos en un archivo de ajustes (fuera de salida/,
// así el agente no puede cambiarlos): solo escribe en salida/ y la terminal está bloqueada.
// Si intenta algo sin permiso, agy corta el turno y devuelve la respuesta vacía con "denied_actions".
const agyBin = () => {
  if (process.env.AGY_PATH) return process.env.AGY_PATH
  const local = join(os.homedir(), '.local', 'bin', IS_WIN ? 'agy.exe' : 'agy')
  return existsSync(local) ? local : 'agy'
}
async function antigravity(prompt, cwd, { modelo, env } = {}) {
  const salida = resolve(cwd, 'salida')
  mkdirSync(salida, { recursive: true })
  const instr = join(cwd, '.instrucciones-agente.md')
  const ajustes = join(cwd, '.agy-ajustes.json')
  writeFileSync(instr, prompt)
  writeFileSync(ajustes, JSON.stringify({ permissions: { allow: [`write_file(${salida})`], deny: ['command(*)'] } }))
  const args = [
    '--output-format', 'json', '--sandbox', '--settings', ajustes,
    ...(modelo ? ['--model', modelo] : []),
    '-p=Lee el archivo .instrucciones-agente.md de esta carpeta y sigue sus instrucciones al pie de la letra. Tu respuesta final es el entregable.',
  ]
  const r = await correrAgy(args, cwd, env)
  rmSync(instr, { force: true }); rmSync(ajustes, { force: true })
  let j = null
  try { j = JSON.parse(r.out.slice(r.out.indexOf('{'))) } catch {}
  const result = String(j?.response || '').trim()
  const negadas = (j?.denied_actions || []).map(d => d.display_name || d.action)
  const err = negadas.length && !result
    ? `Antigravity intentó usar ${[...new Set(negadas)].join(', ')} sin permiso y se detuvo (solo puede escribir en salida/ y no puede usar la terminal).`
    : (r.err || j?.status || '').slice(-4000)
  return {
    code: result ? 0 : (r.code || 1), json: result ? { result, total_cost_usd: 0, num_turns: j?.num_turns || 0 } : null,
    raw: r.out, err, limite: !result && LIMITE.test(r.err + r.out), permisoDenegado: !result && negadas.length > 0,
  }
}
function correrAgy(args, cwd, env) {
  return new Promise((done) => {
    const child = spawn(agyBin(), args, { cwd, windowsHide: true, env: { ...process.env, ...(env || {}), NO_COLOR: '1' } })
    let out = '', err = ''
    const timer = setTimeout(() => { err += '\nTiempo máximo agotado.'; child.kill() }, timeoutMsAgy)
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d })
    child.on('error', e => { clearTimeout(timer); done({ code: -1, out, err: err + (e.code === 'ENOENT' ? 'Antigravity CLI no está instalado' : e.message) }) })
    child.on('close', code => { clearTimeout(timer); done({ code, out, err }) })
    child.stdin.end()
  })
}
const timeoutMsAgy = timeoutMs
// Sesión y modelos disponibles (agy models) para el panel
function estadoAntigravity() {
  return new Promise((resolve) => {
    const token = existsSync(join(os.homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token'))
    execFile(agyBin(), ['models'], { timeout: 30_000, windowsHide: true }, (e, so) => {
      if (e && e.code === 'ENOENT') return resolve({ instalado: false, conectado: false, detalle: 'No está instalado' })
      const modelos = String(so || '').split('\n').map(l => l.split('\t')).filter(p => p.length >= 2 && /^[a-z0-9.-]+$/.test(p[0].trim()))
        .map(([id, nombre]) => ({ id: id.trim(), nombre: nombre.trim() })).slice(0, 40)
      const conectado = token && modelos.length > 0
      resolve({ instalado: true, conectado, modelos, detalle: conectado ? `Sesión de Google · ${modelos.length} modelos` : 'Falta iniciar sesión: agy' })
    })
  })
}

// Estado de cada motor para el panel: ¿está instalado y con sesión iniciada?
  function estadoCodex() {
    return new Promise((resolve) => {
      execFile(bin('codex'), ['login', 'status'], { timeout: 20_000, windowsHide: true, shell: IS_WIN }, (e, so, se) => {
        const t = `${so}${se}`.trim()
        if (e && !t) return resolve({ instalado: false, conectado: false, detalle: 'No está instalado (npm install en motor/)' })
        const conectado = /logged in/i.test(t) && !/not logged in/i.test(t)
        resolve({ instalado: true, conectado, detalle: conectado ? t.split('\n')[0].slice(0, 120) : 'Falta iniciar sesión: codex login' })
      })
    })
  }
  function estadoGemini(envMotor = {}) {
    const home = os.homedir()
    const oauth = existsSync(join(home, '.gemini', 'oauth_creds.json'))
    const clave = !!(envMotor.GEMINI_API_KEY || process.env.GEMINI_API_KEY)
    const instalado = existsSync(bin('gemini')) || bin('gemini') === 'gemini'
    return {
      instalado, conectado: oauth || clave,
      detalle: clave ? 'Clave de API de Gemini (GEMINI_API_KEY)' : oauth ? 'Sesión de Google (solo sirve con licencia Gemini Code Assist de empresa)' : 'Falta la clave: GEMINI_API_KEY en motor/.env',
      gratis: true, // una clave sin facturación es plan gratis y puede usar los datos para entrenar (negocio.json → geminiDePago)
    }
  }

  return { codex, gemini, antigravity, estadoCodex, estadoGemini, estadoAntigravity, esLimite: (s) => LIMITE.test(String(s || '')) }
}
