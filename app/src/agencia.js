// Agencia: departamentos, fichas de clientes y tipos de tarea (colecciones departments, clients, taskTypes)

// Departamentos con los que arranca la agencia (se pueden editar en Agencia → Departamentos)
export const DEFAULT_DEPARTMENTS = [
  { id: 'marketing',   nombre: 'Marketing y Contenido', descripcion: 'Copies, video, imágenes, SEO y estrategia.', color: '#db2777', orden: 0 },
  { id: 'desarrollo',  nombre: 'Desarrollo',            descripcion: 'Webs, automatizaciones y software.',         color: '#2563eb', orden: 1 },
  { id: 'seguridad',   nombre: 'Seguridad',             descripcion: 'Auditorías dentro del alcance autorizado.',  color: '#dc2626', orden: 2 },
  { id: 'operaciones', nombre: 'Operaciones',           descripcion: 'Coordinación, investigación y métricas.',    color: '#059669', orden: 3 },
]

// Tipos de tarea de ejemplo (Agencia → Tipos de tarea → "Cargar ejemplos")
export const EXAMPLE_TASK_TYPES = [
  {
    id: 'brochure_pdf', departamento: 'marketing', rol: 'diseno_grafico', nombre: 'Brochure o portafolio (PDF)',
    descripcion: 'Pieza en PDF (brochure, portafolio de servicios, propuesta o flyer) con vista previa para aprobar.',
    plantillaBrief: [
      { campo: 'pieza', etiqueta: 'Qué pieza (brochure, portafolio, propuesta, flyer)', tipo: 'texto', requerido: true },
      { campo: 'paginas', etiqueta: 'Cuántas páginas', tipo: 'numero', requerido: false },
      { campo: 'contenido', etiqueta: 'Contenido o de dónde sacarlo (web, documento)', tipo: 'texto', requerido: true },
    ],
    checklist: ['Usa la identidad del cliente (colores, logo, tono)', 'Cada página cabe en A4 sin cortes', 'No inventa precios, cifras ni testimonios', 'Datos de contacto completos y correctos'],
    revisor: 'revisor_calidad', formatoEntrega: 'archivos',
  },
  {
    id: 'ideas_posts', departamento: 'marketing', rol: 'copies_redes', nombre: 'Ideas de posts',
    descripcion: 'Ideas de publicaciones para redes con gancho y llamado a la acción.',
    plantillaBrief: [
      { campo: 'cantidad', etiqueta: 'Cuántas ideas', tipo: 'numero', requerido: true },
      { campo: 'redes', etiqueta: 'Redes (Instagram, TikTok…)', tipo: 'texto', requerido: false },
    ],
    checklist: ['Respeta el tono y las palabras prohibidas del cliente', 'Cada idea tiene gancho y llamado a la acción', 'No inventa precios, cifras ni testimonios'],
    revisor: 'revisor_calidad', formatoEntrega: 'texto',
  },
  {
    id: 'copy_redes', departamento: 'marketing', rol: 'copies_redes', nombre: 'Copy para redes',
    descripcion: 'Caption o carrusel listo para publicar.',
    plantillaBrief: [
      { campo: 'formato', etiqueta: 'Formato (caption, carrusel, guion de reel)', tipo: 'texto', requerido: true },
      { campo: 'tema', etiqueta: 'Tema o producto', tipo: 'texto', requerido: true },
    ],
    checklist: ['Respeta el tono del cliente', 'Incluye 3 opciones de gancho', 'Llamado a la acción claro'],
    revisor: 'revisor_calidad', formatoEntrega: 'texto',
  },
  {
    id: 'articulo_blog', departamento: 'marketing', rol: 'textos_seo', nombre: 'Artículo de blog',
    descripcion: 'Artículo optimizado para una palabra clave.',
    plantillaBrief: [
      { campo: 'palabraClave', etiqueta: 'Palabra clave principal', tipo: 'texto', requerido: true },
      { campo: 'extension', etiqueta: 'Extensión aproximada (palabras)', tipo: 'numero', requerido: false },
    ],
    checklist: ['Título de máximo 60 caracteres', 'Meta descripción de máximo 160 caracteres', 'Un solo H1 y jerarquía de encabezados correcta', 'No inventa datos'],
    revisor: 'revisor_calidad', formatoEntrega: 'texto',
  },
  {
    id: 'investigacion', departamento: 'operaciones', rol: 'investigacion', nombre: 'Informe de investigación',
    descripcion: 'Investigación con fuentes sobre un tema, mercado o competencia.',
    plantillaBrief: [
      { campo: 'pregunta', etiqueta: 'Pregunta a responder', tipo: 'texto_largo', requerido: true },
    ],
    checklist: ['Cada dato importante tiene su fuente', 'Termina con conclusiones accionables'],
    revisor: null, formatoEntrega: 'reporte',
  },
  {
    id: 'edicion_video', departamento: 'marketing', rol: 'editor_video', nombre: 'Edición de video',
    descripcion: 'Limpieza de un video: silencios, tomas falsas y audio.',
    plantillaBrief: [
      { campo: 'video', etiqueta: 'Video de entrada (nombre en la carpeta Entrada o ruta en Drive)', tipo: 'texto', requerido: true },
      { campo: 'extras', etiqueta: 'Extras (subtítulos, formato vertical…)', tipo: 'texto', requerido: false },
    ],
    checklist: ['El MP4 final existe y se reproduce', 'No quedan silencios largos ni tomas falsas'],
    revisor: null, formatoEntrega: 'video',
  },
]

export const FIELD_TYPES = [
  { id: 'texto', label: 'Texto corto' },
  { id: 'texto_largo', label: 'Texto largo' },
  { id: 'numero', label: 'Número' },
  { id: 'url', label: 'Link' },
]

export const DELIVERY_FORMATS = [
  { id: 'texto', label: 'Texto' },
  { id: 'archivos', label: 'Archivos' },
  { id: 'video', label: 'Video' },
  { id: 'reporte', label: 'Reporte' },
  { id: 'pr', label: 'Pull request' },
]

// Ficha vacía de un cliente
export const emptyClient = (nombre = '') => ({
  nombre, slug: slugify(nombre), activo: true, interno: false, orden: 0,
  negocio: { descripcion: '', servicios: [], zona: '', publico: '' },
  marca: { tono: '', colores: [], logoUrl: '', palabrasSi: [], palabrasNo: [] },
  objetivos: [],
  activos: { web: '', redes: '', repos: [], driveFolderId: '', bibliotecaPath: '' },
  alcanceAutorizado: { dominios: [], repos: [], notas: '', autorizadoPor: '', fecha: '' },
  departamentos: [],
  aprendizajes: [],
})

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

// Listas editadas como "una por línea"
export const toLines = (arr) => (arr || []).join('\n')
export const fromLines = (s) => String(s || '').split('\n').map(x => x.trim()).filter(Boolean)

// Proveedores de modelos con API compatible con OpenAI. Los nombres de modelos cambian seguido:
// son sugerencias; "Probar conexión" trae la lista real desde el proveedor.
export const PROVIDER_PRESETS = [
  { id: 'gemini', nombre: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', modelos: ['gemini-2.5-flash', 'gemini-2.5-pro'], ayuda: 'Clave gratis en aistudio.google.com. El plan gratis puede usar tus datos para mejorar sus productos.' },
  { id: 'groq', nombre: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', modelos: ['llama-3.3-70b-versatile'], ayuda: 'Clave en console.groq.com. Muy rápido, con plan gratis limitado.' },
  { id: 'deepseek', nombre: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', modelos: ['deepseek-chat', 'deepseek-reasoner'], ayuda: 'Clave en platform.deepseek.com. De pago, muy barato.' },
  { id: 'xai', nombre: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', modelos: [], ayuda: 'Clave en console.x.ai. Usa "Probar conexión" para ver los modelos.' },
  { id: 'openrouter', nombre: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', modelos: [], ayuda: 'Una clave para muchos modelos; los que terminan en ":free" son gratis.' },
  { id: 'ollama', nombre: 'Ollama (en tu PC)', baseUrl: 'http://localhost:11434/v1', modelos: [], ayuda: 'Modelos locales: no sale nada de tu PC. No necesita clave.' },
]

// Tareas para un departamento completo: quedan sin asignado (asignado = '') con paraDepartamento = true
// hasta que una persona del departamento la toma o el motor se la da a uno de sus agentes.
export const DEPT_PREFIX = 'dept:'
export const esDeDepartamento = (t) => !!t?.paraDepartamento && !t?.asignado
export const deptDeAgente = (a, catalogo) => a?.departamentoId || catalogo?.roles?.[a?.rol]?.departamento || ''
