// Agentes Media: herramientas locales para los agentes (servidor MCP por stdio).
// - Clint: transcribir videos, cortar silencios, subtitular, recortar, unir, pasar a vertical.
// - Wanda y Clint: guardar imágenes y videos crudos (JPG, PNG, MP4) en su carpeta de entregas.
// Todo corre en el PC con ffmpeg y Whisper; no se sube nada a servicios externos.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import ffmpegPath from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, basename, extname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dns from 'node:dns'
import net from 'node:net'

dns.setDefaultResultOrder('ipv4first')
net.setDefaultAutoSelectFamilyAttemptTimeout(5000)

const ROOT = dirname(fileURLToPath(import.meta.url))

// ---------- carpetas ----------
// Si Google Drive para escritorio está instalado, las entregas van directo a "Agentes Vengadores"
// (ruta en media-config.json → driveLocal). Si no, quedan en ./entregas/<agente>.
function config() {
  try { return JSON.parse(readFileSync(join(ROOT, 'media-config.json'), 'utf8')) } catch { return {} }
}
function baseDir() {
  const d = config().driveLocal
  return d && existsSync(d) ? d : join(ROOT, 'entregas')
}
const safe = (s) => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120)
function agentDir(agente) {
  const name = safe(agente || process.env.AGENTES_AGENTE || 'General')
  const dir = join(baseDir(), name)
  mkdirSync(dir, { recursive: true })
  return dir
}
function outPath(agente, nombre, ext) {
  const fecha = new Date().toISOString().slice(0, 10)
  // Quita fechas que ya traiga el nombre (evita "2026-10-13 2026-10-13 …" al encadenar ediciones)
  const base = safe(String(nombre || '').replace(/(\d{4}-\d{2}-\d{2}\s*)+/g, '')) || 'archivo'
  let p = join(agentDir(agente), `${fecha} ${base}${ext}`)
  for (let i = 2; existsSync(p); i++) p = join(agentDir(agente), `${fecha} ${base} (${i})${ext}`)
  return p
}

// Busca un archivo: ruta absoluta, nombre dentro de la carpeta Entrada del agente, o en toda la carpeta de entregas
function findInput(archivo, agente) {
  if (!archivo) throw new Error('Falta el archivo')
  if (isAbsolute(archivo) && existsSync(archivo)) return archivo
  const candidates = [join(agentDir(agente), 'Entrada', archivo), join(agentDir(agente), archivo), resolve(baseDir(), archivo)]
  for (const c of candidates) if (existsSync(c)) return c
  const target = archivo.toLowerCase()
  const walk = (dir, depth = 0) => {
    if (depth > 3) return null
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      let st; try { st = statSync(p) } catch { continue }
      if (st.isDirectory()) { const r = walk(p, depth + 1); if (r) return r }
      else if (f.toLowerCase() === target || f.toLowerCase().includes(target)) return p
    }
    return null
  }
  const found = walk(baseDir())
  if (found) return found
  throw new Error(`No encontré "${archivo}". Pídele al dueño que lo deje en la carpeta Entrada de tu carpeta, o usa una URL.`)
}

async function download(url, dest) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10 * 60 * 1000) })
  if (!r.ok) throw new Error(`No pude descargar (${r.status})`)
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
  return dest
}

// Acepta URL o archivo; las URL se descargan a una carpeta temporal del agente
async function resolveInput(archivo, agente) {
  if (/^https?:\/\//i.test(archivo)) {
    const tmp = join(ROOT, 'trabajos', '_descargas')
    mkdirSync(tmp, { recursive: true })
    const ext = extname(new URL(archivo).pathname) || '.mp4'
    return download(archivo, join(tmp, `${Date.now()}${ext}`))
  }
  return findInput(archivo, agente)
}

// ---------- ffmpeg ----------
function ffmpeg(args, { cwd, raw = false } = {}) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpegPath, ['-hide_banner', '-y', ...args], { cwd, windowsHide: true })
    const out = [], err = []
    p.stdout.on('data', d => out.push(d))
    p.stderr.on('data', d => err.push(d))
    p.on('close', code => {
      const stderr = Buffer.concat(err).toString()
      if (code !== 0 && !raw) return rej(new Error('ffmpeg: ' + stderr.split('\n').slice(-6).join(' ')))
      res({ stdout: Buffer.concat(out), stderr })
    })
  })
}

async function duration(file) {
  const { stderr } = await ffmpeg(['-i', file], { raw: true })
  const m = stderr.match(/Duration: (\d+):(\d+):([\d.]+)/)
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0
}

// ---------- Whisper ----------
let asrPromise = null
async function asr() {
  if (!asrPromise) {
    asrPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.cacheDir = join(ROOT, 'modelos')
      // Variante "timestamped": da el tiempo exacto de cada palabra (cortes y subtítulos precisos)
      return pipeline('automatic-speech-recognition', 'onnx-community/whisper-small_timestamped', { dtype: 'q8' })
    })().catch(e => { asrPromise = null; throw e })
  }
  return asrPromise
}

const LANG = { es: 'spanish', en: 'english', pt: 'portuguese', fr: 'french', it: 'italian', de: 'german' }

// Devuelve palabras con tiempo [inicio, fin] en segundos
async function transcribeFile(file, idioma = 'es') {
  const { stdout } = await ffmpeg(['-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'])
  const audio = new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4))
  const model = await asr()
  const r = await model(audio, {
    language: LANG[idioma] || 'spanish', task: 'transcribe',
    chunk_length_s: 30, stride_length_s: 5, return_timestamps: 'word',
  })
  const words = (r.chunks || [])
    .map(c => ({ w: c.text.trim(), s: c.timestamp?.[0] ?? 0, e: c.timestamp?.[1] ?? (c.timestamp?.[0] ?? 0) + 0.3 }))
    .filter(x => x.w)
  return { text: (r.text || '').trim(), words }
}

// Agrupa palabras en frases: corta en pausas, puntuación o al llegar al máximo de palabras
function groupWords(words, maxWords = 5, maxGap = 0.45) {
  const groups = []
  let cur = []
  for (const w of words) {
    const prev = cur[cur.length - 1]
    if (cur.length && (cur.length >= maxWords || w.s - prev.e > maxGap || /[.?!]$/.test(prev.w))) { groups.push(cur); cur = [] }
    cur.push(w)
  }
  if (cur.length) groups.push(cur)
  return groups.map(g => ({ s: g[0].s, e: g[g.length - 1].e, text: g.map(x => x.w).join(' ') }))
}

const srtTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000))
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0')
  const m = String(Math.floor(ms / 60000) % 60).padStart(2, '0')
  const sec = String(Math.floor(ms / 1000) % 60).padStart(2, '0')
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, '0')}`
}

function toSrt(words, maxWords = 5) {
  return groupWords(words, maxWords).map((g, i) => `${i + 1}\n${srtTime(g.s)} --> ${srtTime(g.e + 0.05)}\n${g.text}\n`).join('\n')
}

// Lista legible de frases con tiempos para que el agente decida cortes en una sola pasada
function timeline(words) {
  const f = (s) => s.toFixed(2)
  return groupWords(words, 14, 0.6).map(g => `[${f(g.s)} - ${f(g.e)}] ${g.text}`).join('\n')
}

// Partes a conservar dados los fragmentos a quitar (ordenados y fusionados)
function keepRanges(total, remove) {
  const rs = remove.map(r => [Math.max(0, +r.inicio), Math.min(total, +r.fin)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const keep = []
  let cur = 0
  for (const [a, b] of rs) { if (a - cur > 0.05) keep.push([cur, a]); cur = Math.max(cur, b) }
  if (total - cur > 0.05) keep.push([cur, total])
  return keep
}

async function renderKeep(f, keep, dest) {
  const parts = keep.map(([a, b], i) =>
    `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[v${i}];[0:a]atrim=start=${a.toFixed(3)}:end=${b.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`)
  const concat = keep.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${keep.length}:v=1:a=1[v][a]`
  const filterFile = join(ROOT, 'trabajos', '_descargas', `cortes-${Date.now()}.txt`)
  mkdirSync(dirname(filterFile), { recursive: true })
  writeFileSync(filterFile, parts.join(';') + ';' + concat)
  await ffmpeg(['-i', f, '-filter_complex_script', filterFile, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', dest])
}

const ok = (text) => ({ content: [{ type: 'text', text }] })
const fail = (e) => ({ content: [{ type: 'text', text: 'Error: ' + (e?.message || e) }], isError: true })
const agenteParam = z.string().optional().describe('Nombre del agente (carpeta de entregas). Si no se indica, se usa el agente actual.')

// ---------- servidor ----------
const server = new McpServer({ name: 'agentes-media', version: '1.0.0' })

server.tool('carpeta_entregas',
  'Muestra la carpeta donde se guardan tus entregas y lista los archivos de tu carpeta Entrada (videos o imágenes que el dueño te dejó).',
  { agente: agenteParam },
  async ({ agente }) => {
    try {
      const dir = agentDir(agente)
      const entrada = join(dir, 'Entrada')
      mkdirSync(entrada, { recursive: true })
      const files = readdirSync(entrada)
      return ok(`Entregas: ${dir}\nEntrada: ${entrada}\nArchivos en Entrada: ${files.length ? files.join(', ') : '(vacía)'}\nGoogle Drive local: ${config().driveLocal && existsSync(config().driveLocal) ? 'sí' : 'no (se guarda en el PC)'}`)
    } catch (e) { return fail(e) }
  })

server.tool('guardar_imagen',
  'Descarga una imagen (por ejemplo de Magnific) y la guarda como archivo JPG o PNG en tu carpeta de entregas. Úsala para entregar imágenes crudas, sin documentos.',
  {
    url: z.string().describe('URL de la imagen'),
    nombre: z.string().describe('Nombre descriptivo del archivo, sin extensión'),
    formato: z.enum(['jpg', 'png']).default('jpg'),
    agente: agenteParam,
  },
  async ({ url, nombre, formato, agente }) => {
    try {
      const tmp = join(ROOT, 'trabajos', '_descargas')
      mkdirSync(tmp, { recursive: true })
      const src = await download(url, join(tmp, `${Date.now()}${extname(new URL(url).pathname) || '.img'}`))
      const dest = outPath(agente, nombre, '.' + formato)
      await ffmpeg(['-i', src, ...(formato === 'jpg' ? ['-q:v', '2'] : []), '-frames:v', '1', dest])
      return ok(`Imagen guardada: ${dest}`)
    } catch (e) { return fail(e) }
  })

server.tool('guardar_archivo',
  'Descarga un archivo (video, audio, PDF…) desde una URL y lo guarda tal cual en tu carpeta de entregas.',
  { url: z.string(), nombre: z.string().describe('Nombre sin extensión'), agente: agenteParam },
  async ({ url, nombre, agente }) => {
    try {
      const ext = extname(new URL(url).pathname) || '.mp4'
      const dest = await download(url, outPath(agente, nombre, ext))
      return ok(`Archivo guardado: ${dest}`)
    } catch (e) { return fail(e) }
  })

server.tool('guardar_texto',
  'Guarda un archivo de texto (HTML de una landing, CSS, Markdown, SRT, JSON…) en tu carpeta de entregas.',
  {
    nombre: z.string().describe('Nombre sin extensión'),
    extension: z.enum(['html', 'css', 'js', 'md', 'txt', 'srt', 'json', 'csv']),
    contenido: z.string(),
    agente: agenteParam,
  },
  async ({ nombre, extension, contenido, agente }) => {
    try {
      const dest = outPath(agente, nombre, '.' + extension)
      writeFileSync(dest, contenido)
      return ok(`Archivo guardado: ${dest}`)
    } catch (e) { return fail(e) }
  })

async function videoSize(f) {
  const { stderr } = await ffmpeg(['-i', f], { raw: true })
  const m = stderr.match(/Stream.*Video.*?(\d{2,5})x(\d{2,5})/)
  return m ? [+m[1], +m[2]] : [1080, 1920]
}

server.tool('quitar_fragmentos',
  'Quita de una sola vez varios fragmentos del video (tomas falsas, repeticiones, muletillas) usando los tiempos de transcribir. Más preciso y rápido que recortar muchas veces.',
  {
    archivo: z.string(),
    fragmentos: z.array(z.object({ inicio: z.number(), fin: z.number() })).min(1).describe('Fragmentos a eliminar, en segundos del video original'),
    agente: agenteParam,
  },
  async ({ archivo, fragmentos, agente }) => {
    try {
      const f = await resolveInput(archivo, agente)
      const total = await duration(f)
      const keep = keepRanges(total, fragmentos)
      if (!keep.length) return fail('Esos fragmentos cubren todo el video')
      const dest = outPath(agente, `${basename(f, extname(f))} editado`, '.mp4')
      await renderKeep(f, keep, dest)
      return ok(`Video editado: ${dest}\nDuración: ${total.toFixed(1)} s → ${(await duration(dest)).toFixed(1)} s (${fragmentos.length} fragmentos quitados)`)
    } catch (e) { return fail(e) }
  })

server.tool('insertar_imagenes',
  'Inserta imágenes de apoyo (B-roll) sobre el video en tiempos dados, con zoom suave y aparición/desaparición. El audio sigue igual. Úsala después de cortar y antes de subtitular.',
  {
    archivo: z.string(),
    imagenes: z.array(z.object({
      imagen: z.string().describe('URL o ruta de la imagen'),
      inicio: z.number().describe('Segundo en que aparece'),
      fin: z.number().describe('Segundo en que desaparece'),
      modo: z.enum(['pantalla', 'arriba', 'tarjeta']).default('tarjeta')
        .describe('pantalla = cubre todo; arriba = mitad superior; tarjeta = recuadro centrado en el tercio superior'),
      zoom: z.boolean().default(true),
    })).min(1),
    agente: agenteParam,
  },
  async ({ archivo, imagenes, agente }) => {
    try {
      const f = await resolveInput(archivo, agente)
      const [W, H] = await videoSize(f)
      const inputs = ['-i', f]
      const chains = []
      let last = '0:v'
      for (const [i, im] of imagenes.entries()) {
        const src = await resolveInput(im.imagen, agente)
        const dur = Math.max(0.5, im.fin - im.inicio)
        const box = { pantalla: [W, H, 0, 0], arriba: [W, Math.round(H / 2), 0, 0],
          tarjeta: [Math.round(W * 0.84), Math.round(W * 0.84), Math.round(W * 0.08), Math.round(H * 0.12)] }[im.modo]
        const [bw, bh, bx, by] = box.map(n => n - (n % 2))
        inputs.push('-loop', '1', '-framerate', '30', '-t', dur.toFixed(2), '-i', src)
        const zoom = im.zoom
          ? `scale=${bw * 2}:${bh * 2}:force_original_aspect_ratio=increase,crop=${bw * 2}:${bh * 2},zoompan=z='min(zoom+0.0012,1.12)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${bw}x${bh}:fps=30`
          : `scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh}`
        const fd = Math.min(0.3, dur / 4).toFixed(2)
        chains.push(`[${i + 1}:v]${zoom},format=rgba,fade=t=in:st=0:d=${fd}:alpha=1,fade=t=out:st=${(dur - fd).toFixed(2)}:d=${fd}:alpha=1,setpts=PTS+${im.inicio.toFixed(3)}/TB[im${i}]`)
        chains.push(`[${last}][im${i}]overlay=${bx}:${by}:eof_action=pass:enable='between(t,${im.inicio.toFixed(3)},${im.fin.toFixed(3)})'[v${i}]`)
        last = `v${i}`
      }
      const filterFile = join(ROOT, 'trabajos', '_descargas', `broll-${Date.now()}.txt`)
      mkdirSync(dirname(filterFile), { recursive: true })
      writeFileSync(filterFile, chains.join(';'))
      const dest = outPath(agente, `${basename(f, extname(f))} con imagenes`, '.mp4')
      await ffmpeg([...inputs, '-filter_complex_script', filterFile, '-map', `[${last}]`, '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'copy', dest])
      return ok(`Video con ${imagenes.length} imágenes de apoyo: ${dest}`)
    } catch (e) { return fail(e) }
  })

server.tool('texto_en_pantalla',
  'Agrega textos animados (títulos, palabras clave, llamados a la acción) en momentos dados, con aparición tipo "pop" y caja de color de marca.',
  {
    archivo: z.string(),
    textos: z.array(z.object({
      texto: z.string(),
      inicio: z.number(),
      fin: z.number(),
      posicion: z.enum(['arriba', 'centro', 'abajo']).default('arriba'),
    })).min(1),
    color_caja: z.string().default((process.env.AGENTES_COLOR || '#4700E0').replace('#', '')).describe('Color de la caja detrás del texto (hex sin #). Vacío = sin caja, solo borde.'),
    color_texto: z.string().default('FFFFFF'),
    tamano: z.number().default(0).describe('Tamaño de letra en px; 0 = automático según el video'),
    agente: agenteParam,
  },
  async ({ archivo, textos, color_caja, color_texto, tamano, agente }) => {
    try {
      const f = await resolveInput(archivo, agente)
      const [W, H] = await videoSize(f)
      const size = tamano || Math.round(Math.min(W, H) * 0.075)
      const bgr = (hex) => { const h = hex.replace('#', '').padStart(6, '0'); return h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2) }
      const boxed = !!color_caja
      const t = (s) => { const cs = Math.round(s * 100); return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}` }
      const align = { arriba: 8, centro: 5, abajo: 2 }
      const ass = [
        '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${W}`, `PlayResY: ${H}`, '',
        '[V4+ Styles]',
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
        `Style: T,Montserrat,${size},&H00${bgr(color_texto)},&H00FFFFFF,&H00${boxed ? bgr(color_caja) : '000000'},&H00000000,1,0,0,0,100,100,0,0,${boxed ? 3 : 1},${boxed ? Math.round(size * 0.35) : 4},0,8,${Math.round(W * 0.08)},${Math.round(W * 0.08)},${Math.round(H * 0.14)},1`,
        '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
        ...textos.map(x => `Dialogue: 0,${t(x.inicio)},${t(x.fin)},T,,0,0,${x.posicion === 'abajo' ? Math.round(H * 0.24) : 0},,{\\an${align[x.posicion]}\\fad(150,150)\\fscx70\\fscy70\\t(0,180,\\fscx108\\fscy108)\\t(180,300,\\fscx100\\fscy100)}${x.texto.replace(/\n/g, '\\N')}`),
      ].join('\n')
      const work = join(ROOT, 'trabajos', '_descargas')
      mkdirSync(work, { recursive: true })
      const assName = `textos-${Date.now()}.ass`
      writeFileSync(join(work, assName), ass)
      const dest = outPath(agente, `${basename(f, extname(f))} con textos`, '.mp4')
      await ffmpeg(['-i', f, '-vf', `subtitles=${assName}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'copy', dest], { cwd: work })
      return ok(`Video con ${textos.length} textos animados: ${dest}`)
    } catch (e) { return fail(e) }
  })

server.tool('limpiar_audio',
  'Limpia el audio del video: quita zumbidos graves, reduce ruido de fondo y normaliza el volumen al estándar de redes (-16 LUFS). El video no se recodifica.',
  {
    archivo: z.string(),
    ruido: z.enum(['suave', 'medio', 'fuerte']).default('medio').describe('Cuánto ruido de fondo quitar'),
    agente: agenteParam,
  },
  async ({ archivo, ruido, agente }) => {
    try {
      const f = await resolveInput(archivo, agente)
      const nr = { suave: 8, medio: 14, fuerte: 22 }[ruido]
      const af = `highpass=f=80,afftdn=nr=${nr}:nf=-30:tn=1,acompressor=threshold=-20dB:ratio=3:attack=10:release=150,loudnorm=I=-16:TP=-1.5:LRA=11`
      const dest = outPath(agente, `${basename(f, extname(f))} audio limpio`, '.mp4')
      await ffmpeg(['-i', f, '-af', af, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', dest])
      return ok(`Audio limpio: ${dest}`)
    } catch (e) { return fail(e) }
  })

// ---------- HyperFrames: HTML + GSAP → MP4 ----------
function hyperframes(args, cwd) {
  return new Promise((res, rej) => {
    const bin = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'hyperframes.cmd' : 'hyperframes')
    // ffmpeg-static y ffprobe-static en el PATH (HyperFrames necesita los dos);
    // HYPERFRAMES_NO_TELEMETRY y CI evitan preguntas interactivas
    const sep = process.platform === 'win32' ? ';' : ':'
    const env = { ...process.env, PATH: [dirname(ffmpegPath), dirname(ffprobeStatic.path), process.env.PATH].join(sep), CI: '1', HYPERFRAMES_NO_TELEMETRY: '1' }
    const p = spawn(`"${bin}"`, args, { cwd, env, shell: true, windowsHide: true })
    let out = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { out += d })
    p.stdin.end()
    const timer = setTimeout(() => p.kill(), 20 * 60 * 1000)
    p.on('close', code => { clearTimeout(timer); code === 0 ? res(out) : rej(new Error(out.split('\n').filter(l => /error|✖|✗|failed|not found/i.test(l)).slice(-8).join('\n') || out.slice(-1500))) })
  })
}

server.tool('render_animacion',
  'Renderiza a MP4 una composición HyperFrames (HTML + GSAP) escrita por ti siguiendo las skills hyperframes / hyperframes-core / hyperframes-animation. Úsala SOLO cuando la tarea pida efectos, animaciones o motion graphics. Los archivos que referencies en el HTML (video base, imágenes, audio) se copian a la carpeta del proyecto con su mismo nombre de archivo.',
  {
    proyecto: z.string().describe('Nombre corto del proyecto (carpeta de trabajo; reutilízalo para corregir y volver a renderizar)'),
    html: z.string().describe('index.html completo de la composición'),
    archivos: z.array(z.string()).default([]).describe('Rutas o URLs de medios usados en el HTML; en el HTML refiérelos solo por su nombre de archivo'),
    nombre: z.string().describe('Nombre del MP4 final, sin extensión'),
    formato: z.enum(['mp4', 'webm']).default('mp4').describe('webm = con transparencia para superponer'),
    agente: agenteParam,
  },
  async ({ proyecto, html, archivos, nombre, formato, agente }) => {
    try {
      const dir = join(ROOT, 'trabajos', '_hyperframes', safe(proyecto) || 'proyecto')
      mkdirSync(dir, { recursive: true })
      for (const a of archivos) {
        const src = await resolveInput(a, agente)
        const target = join(dir, /^https?:/i.test(a) ? basename(new URL(a).pathname) : basename(src))
        if (resolve(src) !== resolve(target)) writeFileSync(target, readFileSync(src))
      }
      writeFileSync(join(dir, 'index.html'), html)
      let lint = ''
      try { lint = await hyperframes(['lint'], dir) } catch (e) { lint = e.message }
      const dest = outPath(agente, nombre, '.' + formato)
      await hyperframes(['render', '--output', `"${dest}"`, ...(formato === 'webm' ? ['--format', 'webm'] : [])], dir)
      if (!existsSync(dest)) return fail('El render terminó sin archivo de salida. Revisa la composición.\n' + lint.slice(-1500))
      return ok(`Animación renderizada: ${dest}\nDuración: ${(await duration(dest)).toFixed(1)} s\nProyecto: ${dir}\nLint: ${lint.split('\n').filter(l => /error|warning/i.test(l)).slice(0, 6).join(' | ') || 'sin observaciones'}`)
    } catch (e) { return fail(e) }
  })

server.tool('info_video',
  'Duración, resolución y formato de un video o audio.',
  { archivo: z.string().describe('Ruta, nombre del archivo en tu carpeta Entrada, o URL'), agente: agenteParam },
  async ({ archivo, agente }) => {
    try {
      const f = await resolveInput(archivo, agente)
      const { stderr } = await ffmpeg(['-i', f], { raw: true })
      const lines = stderr.split('\n').filter(l => /Duration|Stream/.test(l)).map(l => l.trim())
      return ok(`${f}\n${lines.join('\n')}`)
    } catch (e) { return fail(e) }
  })

server.tool('transcribir',
  'Transcribe a texto el audio de un video o audio con Whisper (local). Guarda un .txt y un .srt con tiempos en tus entregas y devuelve el texto.',
  {
    archivo: z.string().describe('Ruta, nombre del archivo en tu carpeta Entrada, o URL'),
    idioma: z.enum(['es', 'en', 'pt', 'fr', 'it', 'de']).default('es'),
    agente: agenteParam,
  },
  async ({ archivo, idioma, agente }) => {
    try {
      const f = await resolveInput(archivo, agente)
      const { text, words } = await transcribeFile(f, idioma)
      const name = basename(f, extname(f))
      const txt = outPath(agente, `${name} transcripcion`, '.txt')
      writeFileSync(txt, text)
      const srt = txt.replace(/\.txt$/, '.srt')
      writeFileSync(srt, toSrt(words))
      return ok(`Transcripción guardada en:\n${txt}\n${srt}\n\nFrases con tiempos exactos en segundos (úsalas para decidir cortes con quitar_fragmentos, sin volver a transcribir):\n${timeline(words).slice(0, 30000)}`)
    } catch (e) { return fail(e) }
  })

server.tool('cortar_silencios',
  'Quita los silencios y pausas largas de un video (jump cuts). Devuelve el video nuevo en tus entregas.',
  {
    archivo: z.string(),
    umbral_db: z.number().default(-35).describe('Volumen bajo el cual se considera silencio (más bajo = más estricto)'),
    silencio_min: z.number().default(0.5).describe('Segundos mínimos de silencio para cortarlo'),
    margen: z.number().default(0.12).describe('Segundos que se dejan antes y después de cada frase'),
    agente: agenteParam,
  },
  async ({ archivo, umbral_db, silencio_min, margen, agente }) => {
    try {
      const f = await resolveInput(archivo, agente)
      const total = await duration(f)
      const { stderr } = await ffmpeg(['-i', f, '-af', `silencedetect=noise=${umbral_db}dB:d=${silencio_min}`, '-f', 'null', '-'], { raw: true })
      const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map(m => +m[1])
      const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map(m => +m[1])
      const keep = []
      let cursor = 0
      starts.forEach((s, i) => {
        const a = cursor, b = Math.min(total, s + margen)
        if (b - a > 0.15) keep.push([a, b])
        cursor = Math.max(0, (ends[i] ?? total) - margen)
      })
      if (total - cursor > 0.15) keep.push([cursor, total])
      if (!keep.length) return ok('No encontré partes con voz; revisa el umbral.')
      const dest = outPath(agente, `${basename(f, extname(f))} sin silencios`, '.mp4')
      await renderKeep(f, keep, dest)
      const nueva = await duration(dest)
      return ok(`Video sin silencios: ${dest}\nDuración: ${total.toFixed(1)} s → ${nueva.toFixed(1)} s (${keep.length} tomas)`)
    } catch (e) { return fail(e) }
  })

server.tool('subtitular',
  'Agrega subtítulos quemados al video. Si no das un .srt, transcribe el audio automáticamente. Estilo para reels: letras grandes, borde negro.',
  {
    archivo: z.string(),
    srt: z.string().optional().describe('Ruta de un .srt (opcional). Si no, se transcribe.'),
    idioma: z.enum(['es', 'en', 'pt', 'fr', 'it', 'de']).default('es'),
    tamano: z.number().default(20).describe('Tamaño de letra (20 se ve bien en reels; 14-16 para horizontal)'),
    color: z.string().default('FFFFFF').describe('Color del texto en hex, sin #'),
    posicion: z.enum(['abajo', 'centro', 'arriba']).default('abajo'),
    mayusculas: z.boolean().default(false),
    agente: agenteParam,
  },
  async ({ archivo, srt, idioma, tamano, color, posicion, mayusculas, agente }) => {
    try {
      const f = await resolveInput(archivo, agente)
      const work = join(ROOT, 'trabajos', '_descargas')
      mkdirSync(work, { recursive: true })
      let srtText
      if (srt) srtText = readFileSync(findInput(srt, agente), 'utf8')
      else srtText = toSrt((await transcribeFile(f, idioma)).words, 4)
      if (mayusculas) srtText = srtText.split('\n').map(l => /-->|^\d+$/.test(l) ? l : l.toUpperCase()).join('\n')
      const srtName = `subs-${Date.now()}.srt`
      writeFileSync(join(work, srtName), srtText)
      const align = { abajo: 2, centro: 10, arriba: 8 }[posicion]
      const hex = color.replace('#', '').padStart(6, '0')
      const bgr = hex.slice(4, 6) + hex.slice(2, 4) + hex.slice(0, 2)
      const style = `FontName=Montserrat,Bold=1,FontSize=${tamano},PrimaryColour=&H00${bgr},OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=${align},MarginV=60`
      const dest = outPath(agente, `${basename(f, extname(f))} subtitulado`, '.mp4')
      // ffmpeg corre dentro de la carpeta de trabajo para evitar problemas de rutas de Windows en el filtro
      await ffmpeg(['-i', f, '-vf', `subtitles=${srtName}:force_style='${style}'`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'copy', dest], { cwd: work })
      const srtOut = dest.replace(/\.mp4$/, '.srt')
      writeFileSync(srtOut, srtText)
      return ok(`Video subtitulado: ${dest}\nSubtítulos: ${srtOut}`)
    } catch (e) { return fail(e) }
  })

server.tool('recortar_video',
  'Corta un fragmento del video entre dos tiempos (segundos o mm:ss).',
  { archivo: z.string(), inicio: z.string(), fin: z.string(), agente: agenteParam },
  async ({ archivo, inicio, fin, agente }) => {
    try {
      const f = await resolveInput(archivo, agente)
      const dest = outPath(agente, `${basename(f, extname(f))} recorte`, '.mp4')
      await ffmpeg(['-ss', inicio, '-to', fin, '-i', f, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', dest])
      return ok(`Recorte guardado: ${dest}`)
    } catch (e) { return fail(e) }
  })

server.tool('unir_videos',
  'Une varios videos en uno, en el orden dado (los normaliza a la misma resolución).',
  {
    archivos: z.array(z.string()).min(2),
    nombre: z.string().default('video unido'),
    formato: z.enum(['vertical', 'horizontal', 'cuadrado']).default('vertical'),
    agente: agenteParam,
  },
  async ({ archivos, nombre, formato, agente }) => {
    try {
      const files = []
      for (const a of archivos) files.push(await resolveInput(a, agente))
      const [W, H] = { vertical: [1080, 1920], horizontal: [1920, 1080], cuadrado: [1080, 1080] }[formato]
      const norm = files.map((_, i) =>
        `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}];[${i}:a]aresample=48000[a${i}]`).join(';')
      const concat = files.map((_, i) => `[v${i}][a${i}]`).join('') + `concat=n=${files.length}:v=1:a=1[v][a]`
      const dest = outPath(agente, nombre, '.mp4')
      await ffmpeg([...files.flatMap(f => ['-i', f]), '-filter_complex', `${norm};${concat}`, '-map', '[v]', '-map', '[a]',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', dest])
      return ok(`Video unido: ${dest}`)
    } catch (e) { return fail(e) }
  })

server.tool('formato_video',
  'Cambia el formato del video a vertical 9:16, cuadrado 1:1 u horizontal 16:9, recortando al centro o agregando bordes.',
  {
    archivo: z.string(),
    formato: z.enum(['vertical', 'cuadrado', 'horizontal']).default('vertical'),
    modo: z.enum(['recortar', 'bordes']).default('recortar'),
    agente: agenteParam,
  },
  async ({ archivo, formato, modo, agente }) => {
    try {
      const f = await resolveInput(archivo, agente)
      const [W, H] = { vertical: [1080, 1920], horizontal: [1920, 1080], cuadrado: [1080, 1080] }[formato]
      const vf = modo === 'recortar'
        ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`
        : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`
      const dest = outPath(agente, `${basename(f, extname(f))} ${formato}`, '.mp4')
      await ffmpeg(['-i', f, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'copy', dest])
      return ok(`Video en formato ${formato}: ${dest}`)
    } catch (e) { return fail(e) }
  })

server.tool('extraer_audio',
  'Extrae el audio de un video como MP3.',
  { archivo: z.string(), agente: agenteParam },
  async ({ archivo, agente }) => {
    try {
      const f = await resolveInput(archivo, agente)
      const dest = outPath(agente, `${basename(f, extname(f))} audio`, '.mp3')
      await ffmpeg(['-i', f, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', dest])
      return ok(`Audio: ${dest}`)
    } catch (e) { return fail(e) }
  })

await server.connect(new StdioServerTransport())
