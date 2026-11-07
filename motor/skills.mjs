// Buscador e instalador de skills para el panel (Agencia → Skills).
// El panel escribe pedidos en la colección skillOps; el motor los atiende aquí:
//   buscar      → consulta skills.sh (o lista las skills de un repo de GitHub)
//   revisar     → descarga el repo a una cuarentena y analiza la skill SIN ejecutar nada
//   instalar    → copia a motor/.claude/skills la skill ya revisada (mismo commit)
//   actualizar  → compara el commit instalado con el último del repo y, si cambió, la revisa de nuevo
//   desinstalar → borra la skill del motor
// Nunca se ejecuta código de una skill: solo se descarga, se lee y se copia.

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, rmSync, cpSync, writeFileSync } from 'node:fs'
import { join, relative, basename, extname, resolve, sep } from 'node:path'

const API = 'https://skills.sh/api/search'
// Fuentes conocidas: el panel las marca como confiables. negocio.json → fuentesSkills agrega más.
export const FUENTES_BASE = [
  'anthropics/skills', 'coreyhaines31/marketingskills', 'heygen-com/hyperframes', 'remotion-dev/skills',
  'vercel-labs/agent-skills', 'vercel-labs/skills',
]
const SCRIPT_EXT = new Set(['.py', '.js', '.mjs', '.cjs', '.ts', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd', '.rb', '.go', '.php', '.pl'])
const BINARIO_EXT = new Set(['.exe', '.dll', '.so', '.dylib', '.bin', '.jar', '.wasm', '.node'])
const RIESGOS = [
  [/curl[^\n|]*\|\s*(ba|z)?sh|wget[^\n|]*\|\s*(ba|z)?sh|iwr[^\n|]*\|\s*iex/i, 'Descarga y ejecuta código de internet (curl | sh)'],
  [/\beval\s*\(|new Function\s*\(|exec\s*\(\s*base64|base64\s+-d\s*\|/i, 'Ejecuta código armado en tiempo de ejecución (eval / base64)'],
  [/rm\s+-rf\s+[~/$]|Remove-Item\s+-Recurse\s+-Force\s+[~C]/i, 'Borra carpetas fuera de su espacio'],
  [/\.ssh\/|id_rsa|\.aws\/credentials|\.npmrc|\.git-credentials|Login Data|keychain/i, 'Toca archivos de credenciales del PC'],
  [/process\.env\b|os\.environ|\$env:/i, 'Lee variables de entorno (normal para claves de APIs como ElevenLabs; revisa cuáles)', 'info'],
  [/webhook\.site|ngrok\.io|requestbin|pastebin\.com|discord(app)?\.com\/api\/webhooks|transfer\.sh/i, 'Envía datos a servicios de captura (webhook, pastebin…)'],
  [/ignore (all |the )?(previous|prior) instructions|ignora (todas )?las instrucciones/i, 'Texto que intenta cambiar las instrucciones del agente'],
]
const MAX_BYTES = 60 * 1024 * 1024
const MAX_ARCHIVOS = 3000
const NOMBRE_OK = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const REPO_OK = /^[\w.-]{1,100}\/[\w.-]{1,100}$/

export function crearSkills({ ROOT, log, fuentesExtra = () => [] }) {
  const SKILLS = join(ROOT, '.claude', 'skills')
  const ORIGEN = join(ROOT, '.claude', 'skills-origen.json')
  const CUARENTENA = join(ROOT, '.skills-cuarentena')

  const fuentes = () => new Set([...FUENTES_BASE, ...fuentesExtra()].map(s => String(s).toLowerCase()))
  const esConfiable = (source) => fuentes().has(String(source || '').toLowerCase())

  const leerOrigen = () => { try { return JSON.parse(readFileSync(ORIGEN, 'utf8')) } catch { return [] } }
  const guardarOrigen = (lista) => { mkdirSync(join(ROOT, '.claude'), { recursive: true }); writeFileSync(ORIGEN, JSON.stringify(lista, null, 2) + '\n') }
  const instaladas = () => { try { return readdirSync(SKILLS).filter(n => existsSync(join(SKILLS, n, 'SKILL.md'))) } catch { return [] } }

  // Repo escrito como owner/repo o como link de GitHub
  function aRepo(texto) {
    const t = String(texto || '').trim().replace(/\.git$/, '').replace(/\/+$/, '')
    const m = t.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)/i)
    const r = m ? m[1] : t
    return REPO_OK.test(r) ? r : null
  }

  function git(args, cwd, timeoutMs = 180_000) {
    return new Promise((ok, fail) => {
      const p = spawn('git', args, { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' } })
      let out = '', err = ''
      const timer = setTimeout(() => { p.kill(); fail(new Error('git tardó demasiado')) }, timeoutMs)
      p.stdout.on('data', d => { out += d })
      p.stderr.on('data', d => { err += d })
      p.on('error', e => { clearTimeout(timer); fail(new Error(e.code === 'ENOENT' ? 'Falta instalar git en el PC del motor' : e.message)) })
      p.on('close', code => { clearTimeout(timer); code === 0 ? ok(out.trim()) : fail(new Error(err.trim().split('\n').pop() || `git salió con ${code}`)) })
    })
  }

  // Descarga (o vuelve a descargar) el repo completo a la cuarentena; devuelve carpeta y commit
  async function clonar(repo) {
    mkdirSync(CUARENTENA, { recursive: true })
    const dir = join(CUARENTENA, repo.replace('/', '__'))
    rmSync(dir, { recursive: true, force: true })
    await git(['clone', '--depth', '1', '--no-tags', `https://github.com/${repo}.git`, dir], CUARENTENA)
    const commit = await git(['rev-parse', 'HEAD'], dir)
    return { dir, commit }
  }

  function frontmatter(texto) {
    const m = texto.match(/^---\s*\n([\s\S]*?)\n---/)
    const fm = m ? m[1] : ''
    const campo = (k) => {
      const linea = fm.match(new RegExp(`^${k}:\\s*(.*)$`, 'm'))?.[1]?.trim() || ''
      if (/^[>|]-?$/.test(linea)) { // valor en varias líneas
        const resto = fm.split(new RegExp(`^${k}:.*$`, 'm'))[1] || ''
        return resto.split('\n').filter(l => /^\s+\S/.test(l)).map(l => l.trim()).join(' ')
      }
      return linea.replace(/^["']|["']$/g, '')
    }
    return { name: campo('name'), description: campo('description') }
  }

  // Todas las skills (carpetas con SKILL.md) dentro de un repo descargado
  function skillsDelRepo(repoDir) {
    const out = []
    const walk = (d, depth) => {
      if (depth > 7 || out.length > 300) return
      let entries = []
      try { entries = readdirSync(d, { withFileTypes: true }) } catch { return }
      if (entries.some(e => e.isFile() && e.name === 'SKILL.md')) {
        const fm = frontmatter(readFileSync(join(d, 'SKILL.md'), 'utf8').slice(0, 6000))
        out.push({ ruta: relative(repoDir, d).split(sep).join('/'), carpeta: basename(d), ...fm })
      }
      for (const e of entries) if (e.isDirectory() && !['.git', 'node_modules', 'template', 'templates'].includes(e.name)) walk(join(d, e.name), depth + 1)
    }
    walk(repoDir, 0)
    // Las copias en .claude/ o .agents/ del repo son duplicadas de las de skills/
    return out.sort((a, b) => (a.ruta.startsWith('.') - b.ruta.startsWith('.')) || a.ruta.localeCompare(b.ruta))
  }

  function encontrar(repoDir, skillId, ruta) {
    const todas = skillsDelRepo(repoDir)
    if (ruta) { const r = todas.find(s => s.ruta === ruta); if (r) return r }
    return todas.find(s => s.name === skillId) || todas.find(s => s.carpeta === skillId) || null
  }

  function analizar(dir) {
    const archivos = [], scripts = [], binarios = [], avisos = new Map(), hosts = new Set()
    let bytes = 0
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isSymbolicLink()) { avisos.set('Tiene enlaces simbólicos (podrían apuntar fuera de la skill)', { nivel: 'alto', en: [relative(dir, p)] }); continue }
        if (e.isDirectory()) { if (e.name !== '.git') walk(p); continue }
        const size = statSync(p).size
        bytes += size
        const rel = relative(dir, p).split(sep).join('/')
        archivos.push({ ruta: rel, bytes: size })
        const ext = extname(e.name).toLowerCase()
        if (BINARIO_EXT.has(ext)) binarios.push(rel)
        const esScript = SCRIPT_EXT.has(ext)
        if (esScript) scripts.push(rel)
        if ((esScript || ext === '.md' || ext === '') && size < 2_000_000) {
          const txt = readFileSync(p, 'utf8')
          for (const [re, msg, nivel = 'alto'] of RIESGOS) {
            if (re.test(txt)) avisos.set(msg, { nivel, en: [...(avisos.get(msg)?.en || []), rel].slice(0, 6) })
          }
          if (esScript) for (const h of txt.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) hosts.add(h[1].toLowerCase())
        }
      }
    }
    walk(dir)
    return {
      archivos: archivos.length, bytes, scripts: scripts.slice(0, 60), totalScripts: scripts.length, binarios: binarios.slice(0, 20),
      avisos: [...avisos.entries()].map(([mensaje, v]) => ({ mensaje, ...v })).sort((a, b) => (a.nivel === 'info') - (b.nivel === 'info')),
      hosts: [...hosts].filter(h => !/(example|localhost|\.test$|\.invalid$)/.test(h)).sort().slice(0, 40),
      lista: archivos.slice(0, 80).map(a => a.ruta),
    }
  }

  // ---------- operaciones ----------
  async function buscar(q) {
    const repo = /\//.test(q) ? aRepo(q) : null
    if (repo) { // Explorar un repo concreto
      const { dir, commit } = await clonar(repo)
      const ya = new Set(instaladas())
      return {
        modo: 'repo', repo, commit: commit.slice(0, 12),
        skills: skillsDelRepo(dir).filter(s => !s.ruta.startsWith('.')).slice(0, 80).map(s => ({
          source: repo, skillId: s.name || s.carpeta, ruta: s.ruta, name: s.name || s.carpeta, descripcion: s.description.slice(0, 220),
          confiable: esConfiable(repo), instalada: ya.has(s.name || s.carpeta), url: `https://github.com/${repo}/tree/HEAD/${s.ruta}`,
        })),
      }
    }
    const texto = String(q || '').trim().slice(0, 80)
    if (texto.length < 2) throw new Error('Escribe al menos 2 letras')
    const r = await fetch(`${API}?q=${encodeURIComponent(texto)}&limit=30`, { headers: { 'User-Agent': 'agentes-ia-3d-motor' }, signal: AbortSignal.timeout(20_000) })
    if (!r.ok) throw new Error(`skills.sh respondió ${r.status}`)
    const j = await r.json()
    const ya = new Set(instaladas())
    // Las fuentes confiables primero; después por instalaciones (el ranking solo mide popularidad)
    const skills = (j.skills || []).filter(s => REPO_OK.test(s.source || '')).map(s => ({
      source: s.source, skillId: s.skillId, name: s.name || s.skillId, installs: s.installs || 0,
      confiable: esConfiable(s.source), instalada: ya.has(s.skillId) || ya.has(s.name), url: `https://skills.sh/${s.source}/${s.skillId}`,
    })).sort((a, b) => (b.confiable - a.confiable) || (b.installs - a.installs))
    return { modo: 'busqueda', q: texto, skills }
  }

  async function revisar({ source, skillId, ruta }) {
    const repo = aRepo(source)
    if (!repo) throw new Error('Repo inválido')
    const { dir, commit } = await clonar(repo)
    const s = encontrar(dir, skillId, ruta)
    if (!s) throw new Error(`No encontré la skill "${skillId}" en ${repo}`)
    const carpeta = join(dir, s.ruta)
    const nombre = s.name || s.carpeta
    if (!NOMBRE_OK.test(nombre)) throw new Error(`El nombre "${nombre}" no es válido para una carpeta`)
    const a = analizar(carpeta)
    if (a.bytes > MAX_BYTES) a.avisos.unshift({ mensaje: `Pesa ${(a.bytes / 1048576).toFixed(1)} MB (máximo ${MAX_BYTES / 1048576} MB)`, nivel: 'alto', en: [] })
    if (a.archivos > MAX_ARCHIVOS) a.avisos.unshift({ mensaje: `Tiene ${a.archivos} archivos (máximo ${MAX_ARCHIVOS})`, nivel: 'alto', en: [] })
    return {
      source: repo, skillId, ruta: s.ruta, nombre, descripcion: s.description.slice(0, 600), commit,
      confiable: esConfiable(repo), yaInstalada: instaladas().includes(nombre),
      skillMd: readFileSync(join(carpeta, 'SKILL.md'), 'utf8').slice(0, 9000),
      instalable: a.bytes <= MAX_BYTES && a.archivos <= MAX_ARCHIVOS,
      ...a,
    }
  }

  // Instala exactamente lo que se revisó: si el repo cambió desde la revisión, se pide revisar de nuevo
  async function instalar(rev, { reemplazar = false } = {}) {
    if (!rev?.commit || !rev?.ruta || !NOMBRE_OK.test(rev?.nombre || '')) throw new Error('Primero revisa la skill')
    if (!rev.instalable) throw new Error('La skill supera los límites de tamaño')
    const repo = aRepo(rev.source)
    const dir = join(CUARENTENA, repo.replace('/', '__'))
    let commit = ''
    try { commit = await git(['rev-parse', 'HEAD'], dir) } catch {}
    if (commit !== rev.commit) {
      ({ commit } = await clonar(repo))
      if (commit !== rev.commit) throw new Error('El repo cambió desde la revisión: revísala otra vez')
    }
    const origen = resolve(dir, rev.ruta)
    if (!origen.startsWith(resolve(dir) + sep) && origen !== resolve(dir)) throw new Error('Ruta inválida')
    const destino = join(SKILLS, rev.nombre)
    if (existsSync(destino) && !reemplazar) throw new Error(`Ya hay una skill llamada "${rev.nombre}"`)
    mkdirSync(SKILLS, { recursive: true })
    rmSync(destino, { recursive: true, force: true })
    cpSync(origen, destino, { recursive: true, dereference: false, verbatimSymlinks: true, filter: (src) => !src.split(sep).includes('.git') })
    const lista = leerOrigen().filter(o => o.nombre !== rev.nombre)
    lista.push({ nombre: rev.nombre, repo, ruta: rev.ruta, skillId: rev.skillId, commit: commit.slice(0, 12), instalada: new Date().toISOString().slice(0, 10) })
    guardarOrigen(lista)
    log(`Skill instalada: ${rev.nombre} (${repo}@${commit.slice(0, 7)})`)
    return { nombre: rev.nombre, commit: commit.slice(0, 12) }
  }

  async function actualizar(nombre) {
    const o = leerOrigen().find(x => x.nombre === nombre)
    if (!o) throw new Error('Esta skill no tiene origen registrado (se instaló a mano): reinstálala desde el buscador')
    const remoto = (await git(['ls-remote', `https://github.com/${o.repo}.git`, 'HEAD'], ROOT, 60_000)).split(/\s/)[0] || ''
    if (remoto && remoto.startsWith(o.commit)) return { alDia: true, nombre, commit: o.commit }
    const rev = await revisar({ source: o.repo, skillId: o.skillId || nombre, ruta: o.ruta })
    return { alDia: false, ...rev, commitAnterior: o.commit }
  }

  function desinstalar(nombre) {
    if (!NOMBRE_OK.test(nombre || '')) throw new Error('Nombre inválido')
    const destino = join(SKILLS, nombre)
    if (!existsSync(destino)) throw new Error('No está instalada')
    rmSync(destino, { recursive: true, force: true })
    guardarOrigen(leerOrigen().filter(o => o.nombre !== nombre))
    log(`Skill desinstalada: ${nombre}`)
    return { nombre }
  }

  return { buscar, revisar, instalar, actualizar, desinstalar, leerOrigen, esConfiable, fuentes: () => [...fuentes()] }
}
