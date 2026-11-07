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
