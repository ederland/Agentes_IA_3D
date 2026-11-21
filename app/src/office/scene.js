import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { createMinifig } from './minifig.js'
import { NavGrid } from './navgrid.js'
import { woodTexture, tileTexture, carpetTexture } from './textures.js'
import { BRAND } from '../config.js'

// Tonos de la marca para la Oficina (tela, neón y alfombra del laboratorio de agentes)
const BRAND_COLOR = new THREE.Color(BRAND.color)
const brandShade = (k) => '#' + BRAND_COLOR.clone().multiplyScalar(k).getHexString()
const brandTint = (k) => '#' + BRAND_COLOR.clone().lerp(new THREE.Color('#ffffff'), k).getHexString()
const BRAND_GLOW = brandTint(0.3)

// ===== Planta (metros). x: oeste(-) a este(+); z: norte(-) a sur(+) =====
// Franja norte: 3 oficinas privadas, sala de reuniones, cocina y baño.
// Oeste: área abierta del equipo. Centro: jardín. Este: laboratorio de agentes.
const B = { x0: -16, x1: 16, z0: -11, z1: 11 }
const NORTH_WALL_Z = -6.5
const ROOMS = [
  { id: 'office0', x0: -16, x1: -10.6, door: -12.0 },
  { id: 'office1', x0: -10.6, x1: -5.2, door: -6.6 },
  { id: 'office2', x0: -5.2, x1: 0.2, door: -1.2 },
  { id: 'meeting', x0: 0.2, x1: 6.6, door: 5.0 },
  { id: 'kitchen', x0: 6.6, x1: 12, door: 7.6 },
  { id: 'bath', x0: 12, x1: 16, door: 13.0 },
]
const LAB = { x0: 5.0, z0: -3.6, doorZ0: 2.3, doorZ1: 3.8 }
const GARDEN = { x0: -3.2, x1: 3.2, z0: -1.5, z1: 4.5 }
const SEAT_Y = 0.4
const WALK_SPEED = 2.6
const DOOR_W = 1.4

const ISO_DIR = new THREE.Vector3(1, 1.15, 1).normalize()
const UP = new THREE.Vector3(0, 1, 0)

// ===== Materiales =====
const MAT = {}
function mats() {
  if (MAT.ready) return MAT
  Object.assign(MAT, {
    ready: true,
    wall: new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.92 }),
    wallCap: new THREE.MeshStandardMaterial({ color: '#7d838d', roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: '#cfe8f2', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.18, depthWrite: false }),
    frame: new THREE.MeshStandardMaterial({ color: '#3c424c', roughness: 0.45, metalness: 0.6 }),
    deskTop: new THREE.MeshStandardMaterial({ color: '#f7f7f5', roughness: 0.35 }),
    deskWood: new THREE.MeshStandardMaterial({ color: '#b98a5a', roughness: 0.55 }),
    metal: new THREE.MeshStandardMaterial({ color: '#9aa1ab', roughness: 0.3, metalness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: '#23262d', roughness: 0.5 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#2f3440', roughness: 0.85 }),
    fabricPurple: new THREE.MeshStandardMaterial({ color: brandShade(0.8), roughness: 0.8 }),
    leather: new THREE.MeshStandardMaterial({ color: '#1f2229', roughness: 0.45 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#3f8f45', roughness: 0.7, flatShading: true }),
    leaf2: new THREE.MeshStandardMaterial({ color: '#5aa95e', roughness: 0.7, flatShading: true }),
    pot: new THREE.MeshStandardMaterial({ color: '#e8e4dc', roughness: 0.6 }),
    soil: new THREE.MeshStandardMaterial({ color: '#4a3524', roughness: 1 }),
    grass: new THREE.MeshStandardMaterial({ color: '#6fae55', roughness: 0.95 }),
    water: new THREE.MeshStandardMaterial({ color: '#5aa7d6', roughness: 0.08, metalness: 0.2 }),
    white: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }),
    counter: new THREE.MeshStandardMaterial({ color: '#2e3138', roughness: 0.25 }),
    steel: new THREE.MeshStandardMaterial({ color: '#c9ced6', roughness: 0.25, metalness: 0.9 }),
    tv: new THREE.MeshStandardMaterial({ color: '#0f1115', roughness: 0.2, emissive: '#16233a', emissiveIntensity: 0.6 }),
    purpleGlow: new THREE.MeshStandardMaterial({ color: BRAND_GLOW, emissive: BRAND_GLOW, emissiveIntensity: 1.2 }),
  })
  return MAT
}

// ===== Construcción =====
class Builder {
  constructor(scene, nav) {
    this.group = new THREE.Group()
    scene.add(this.group)
    this.nav = nav
    this.seats = { team: [], lab: [], office: [], garden: [], kitchen: [], bathroom: [], coordinator: [] }
  }

  mesh(geo, mat, x, y, z, { ry = 0, shadow = true, parent } = {}) {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(x, y, z)
    m.rotation.y = ry
    m.castShadow = shadow
    m.receiveShadow = true
    ;(parent || this.group).add(m)
    return m
  }
  box(w, h, d, mat, x, y, z, opts) { return this.mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, opts) }
  block(x, z, w, d, ry = 0, pad) { this.nav.blockRect(x, z, w, d, ry, pad) }

  // Muro sólido con remate superior (efecto de corte arquitectónico)
  wall(x0, z0, x1, z1, h = 1.8, t = 0.14) {
    const M = mats()
    const len = Math.hypot(x1 - x0, z1 - z0)
    const ry = -Math.atan2(z1 - z0, x1 - x0)
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    this.mesh(new THREE.BoxGeometry(len, h, t), M.wall, cx, h / 2, cz, { ry })
    this.mesh(new THREE.BoxGeometry(len, 0.03, t + 0.02), M.wallCap, cx, h + 0.015, cz, { ry, shadow: false })
    this.block(cx, cz, len, t, ry, 0.25)
  }

  // Muro de vidrio con perfilería y base
  glassWall(x0, z0, x1, z1, h = 2.2, step = 1.5) {
    const M = mats()
    const len = Math.hypot(x1 - x0, z1 - z0)
    const ry = -Math.atan2(z1 - z0, x1 - x0)
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2
    this.mesh(new THREE.BoxGeometry(len, h, 0.03), M.glass, cx, h / 2, cz, { ry, shadow: false })
    this.mesh(new THREE.BoxGeometry(len, 0.08, 0.08), M.frame, cx, 0.04, cz, { ry })
    this.mesh(new THREE.BoxGeometry(len, 0.06, 0.08), M.frame, cx, h, cz, { ry })
    const n = Math.max(1, Math.round(len / step))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      this.box(0.06, h, 0.06, M.frame, x0 + (x1 - x0) * t, h / 2, z0 + (z1 - z0) * t)
    }
    this.block(cx, cz, len, 0.05, ry, 0.25)
  }

  floor(x0, z0, x1, z1, tex, y = 0.005, rough = 0.6) {
    const w = x1 - x0, d = z1 - z0
    const t = tex.clone()
    t.needsUpdate = true
    t.repeat.set(w / 4, d / 4)
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: rough }))
    m.rotation.x = -Math.PI / 2
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2)
    m.receiveShadow = true
    this.group.add(m)
  }

  officeChair(x, z, ry, seatMat) {
    const M = mats()
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = ry
    this.group.add(g)
    const p = { parent: g }
    this.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), M.metal, 0, 0.2, 0, p)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const leg = this.mesh(new THREE.BoxGeometry(0.26, 0.025, 0.04), M.dark, Math.cos(a) * 0.13, 0.05, Math.sin(a) * 0.13, p)
      leg.rotation.y = -a
    }
    this.mesh(new THREE.BoxGeometry(0.44, 0.06, 0.42), seatMat, 0, SEAT_Y - 0.03, 0, p)
    this.mesh(new THREE.BoxGeometry(0.42, 0.46, 0.05), seatMat, 0, SEAT_Y + 0.25, -0.22, p)
  }

  laptop(x, y, z, ry = 0) {
    const M = mats()
    const g = new THREE.Group()
    g.position.set(x, y, z)
    g.rotation.y = ry
    this.group.add(g)
    this.mesh(new THREE.BoxGeometry(0.36, 0.015, 0.25), M.metal, 0, 0.008, 0, { parent: g })
    const screenMat = new THREE.MeshStandardMaterial({ color: '#16181d', roughness: 0.2, emissive: '#000000' })
    const screen = this.mesh(new THREE.BoxGeometry(0.36, 0.23, 0.012), screenMat, 0, 0.12, -0.13, { parent: g })
    screen.rotation.x = -0.22
    return screenMat
  }

  plant(x, z, s = 1) {
    const M = mats()
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.scale.setScalar(s)
    this.group.add(g)
    const p = { parent: g }
    this.mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.42, 16), M.pot, 0, 0.21, 0, p)
    this.mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16), M.soil, 0, 0.41, 0, p)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      const leaf = this.mesh(new THREE.ConeGeometry(0.07, 0.7, 5), i % 2 ? M.leaf : M.leaf2,
        Math.cos(a) * 0.08, 0.72, Math.sin(a) * 0.08, p)
      leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5)
    }
    this.block(x, z, 0.4 * s, 0.4 * s, 0, 0.15)
  }

  bookshelf(x, z, ry = 0, w = 1.4) {
    const M = mats()
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = ry
    this.group.add(g)
    const p = { parent: g }
    this.mesh(new THREE.BoxGeometry(w, 1.6, 0.35), M.deskWood, 0, 0.8, 0, p)
    const colors = ['#c0392b', '#2c3e50', '#16a085', '#f39c12', '#8e44ad', '#ecf0f1']
    for (let row = 0; row < 4; row++) {
      this.mesh(new THREE.BoxGeometry(w - 0.06, 0.03, 0.3), M.white, 0, 0.18 + row * 0.38, 0.03, p)
      let bx = -w / 2 + 0.08
      let k = row * 7
      while (bx < w / 2 - 0.12) {
        const bw = 0.04 + ((k * 37) % 5) * 0.012
        const bh = 0.2 + ((k * 13) % 4) * 0.03
        this.mesh(new THREE.BoxGeometry(bw, bh, 0.22), new THREE.MeshStandardMaterial({ color: colors[k % colors.length], roughness: 0.7 }),
          bx + bw / 2, 0.2 + row * 0.38 + bh / 2, 0.05, p)
        bx += bw + 0.008
        k++
      }
    }
    this.block(x, z, w, 0.35, ry, 0.2)
  }

  sofa(x, z, ry, mat, w = 2.2) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = ry
    this.group.add(g)
    const p = { parent: g }
    this.mesh(new THREE.BoxGeometry(w, 0.38, 0.85), mat, 0, 0.19, 0, p)
    this.mesh(new THREE.BoxGeometry(w, 0.5, 0.22), mat, 0, 0.55, -0.33, p)
    this.mesh(new THREE.BoxGeometry(0.2, 0.55, 0.85), mat, -w / 2 + 0.1, 0.3, 0, p)
    this.mesh(new THREE.BoxGeometry(0.2, 0.55, 0.85), mat, w / 2 - 0.1, 0.3, 0, p)
    this.block(x, z, w, 0.85, ry, 0.2)
  }

  // Mesa larga de trabajo con 4 puestos (2 por lado) y separador central
  pod(px, pz, chairMat, zone) {
    const M = mats()
    this.box(3.1, 0.05, 1.4, M.deskTop, px, 0.62, pz)
    for (const sx of [-1.45, 1.45]) this.box(0.06, 0.6, 1.3, M.metal, px + sx, 0.31, pz)
    this.box(3.0, 0.32, 0.04, zone === 'lab' ? M.fabricPurple : M.fabric, px, 0.8, pz)
    this.block(px, pz, 3.1, 1.4, 0, 0.22)
    for (const side of [-1, 1]) for (const dx of [-0.78, 0.78]) {
      const sz = pz + side * 1.02
      const ry = side < 0 ? 0 : Math.PI
      this.officeChair(px + dx, sz, ry, chairMat)
      const screen = this.laptop(px + dx, 0.645, pz + side * 0.42, ry + Math.PI)
      this.seats[zone].push({ x: px + dx, z: sz, rot: ry, seat: true, screen })
    }
  }

  // Escritorio de mando del coordinador: mesa en L, dos pantallas y un anillo holográfico
  coordinatorDesk(x, z) {
    const M = mats()
    this.box(2.4, 0.06, 0.95, M.deskTop, x, 0.64, z)
    this.box(0.9, 0.06, 0.8, M.deskTop, x + 1.6, 0.64, z + 0.45)
    for (const [dx, dz] of [[-1.15, 0], [1.15, 0], [1.98, 0.45]]) this.box(0.08, 0.62, 0.8, M.metal, x + dx, 0.31, z + dz)
    this.block(x + 0.3, z + 0.2, 3.3, 1.3, 0, 0.22)
    this.officeChair(x, z + 1.0, Math.PI, M.fabricPurple)
    const screen = this.laptop(x - 0.35, 0.67, z + 0.1, 0)
    this.laptop(x + 0.35, 0.67, z + 0.1, 0)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 10, 40), M.purpleGlow)
    ring.rotation.x = Math.PI / 2
    ring.position.set(x + 1.6, 0.95, z + 0.45)
    this.group.add(ring)
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 18, 14), M.water)
    core.position.set(x + 1.6, 0.95, z + 0.45)
    this.group.add(core)
    this.coordinatorRing = ring
    this.seats.coordinator.push({ x, z: z + 1.0, rot: Math.PI, seat: true, screen })
  }

  bench(x, z, ry, n = 3) {
    const M = mats()
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = ry
    this.group.add(g)
    const p = { parent: g }
    this.mesh(new THREE.BoxGeometry(2.3, 0.06, 0.48), M.deskWood, 0, SEAT_Y - 0.03, 0, p)
    this.mesh(new THREE.BoxGeometry(2.3, 0.42, 0.06), M.deskWood, 0, SEAT_Y + 0.22, -0.23, p)
    for (const sx of [-1.0, 1.0]) this.mesh(new THREE.BoxGeometry(0.06, SEAT_Y - 0.03, 0.42), M.frame, sx, (SEAT_Y - 0.03) / 2, 0, p)
    this.block(x, z, 2.3, 0.48, ry, 0.1)
    const c = Math.cos(ry), s = Math.sin(ry)
    for (let i = 0; i < n; i++) {
      const lx = (i - (n - 1) / 2) * 0.75
      this.seats.garden.push({ x: x + lx * c, z: z - lx * s, rot: ry, seat: true })
    }
  }
}

function buildOffice(scene, nav) {
  const M = mats()
  const b = new Builder(scene, nav)
  const wood = woodTexture('#c49466')
  const darkWood = woodTexture('#8a6242', 1, 1, 21)
  const tile = tileTexture('#e3e6ea', '#c3c8cf', 4)
  const plaza = tileTexture('#cfd3d8', '#b3b8bf', 2, 1, 1, 9)
  const carpet = carpetTexture('#6b6f7c')
  const labCarpet = carpetTexture(brandShade(0.35), 1, 1, 17)

  // Exterior y pisos
  b.floor(-28, -22, 28, 22, plaza, -0.02, 0.85)
  b.box(B.x1 - B.x0 + 0.4, 0.2, B.z1 - B.z0 + 0.4, M.frame, 0, -0.1, 0, { shadow: false })
  b.floor(B.x0, B.z0, B.x1, B.z1, tile, 0.003)
  b.floor(-15.8, -4.4, -5.0, 10.8, wood, 0.006)                       // área abierta
  b.floor(LAB.x0, LAB.z0, 15.8, 10.8, labCarpet, 0.006, 0.95)        // laboratorio
  b.floor(-16, -11, 0.2, NORTH_WALL_Z, carpet, 0.006, 0.95)          // oficinas privadas
  b.floor(0.2, -11, 6.6, NORTH_WALL_Z, darkWood, 0.006)              // sala de reuniones

  // Jardineras exteriores (como en la referencia)
  for (const [x, z, w, d] of [[-21, 4, 2, 10], [4, 15, 16, 2]]) {
    b.box(w, 0.5, d, M.frame, x, 0.25, z)
    b.box(w - 0.2, 0.05, d - 0.2, M.soil, x, 0.5, z, { shadow: false })
    for (let i = 0; i < Math.max(w, d) / 1.6; i++) {
      const t = (i + 0.5) / Math.ceil(Math.max(w, d) / 1.6)
      const bx = w > d ? x - w / 2 + t * w : x, bz = w > d ? z : z - d / 2 + t * d
      const shrub = b.mesh(new THREE.IcosahedronGeometry(0.55, 1), M.leaf, bx, 0.95, bz)
      shrub.scale.y = 1.15
    }
  }

  // Envolvente: norte y oeste sólidos; sur y este fachada de vidrio
  b.wall(B.x0, B.z0, B.x1, B.z0, 2.8, 0.25)
  b.wall(B.x0, B.z0, B.x0, B.z1, 2.8, 0.25)
  b.glassWall(B.x0, B.z1, B.x1, B.z1, 2.6, 1.6)
  b.glassWall(B.x1, B.z0, B.x1, B.z1, 2.6, 1.6)
  for (const x of [-13.3, -7.9, -2.5, 3.4, 9.3]) b.box(1.8, 1.2, 0.05, M.glass, x, 1.6, B.z0 + 0.14, { shadow: false })

  // Franja norte de salas: divisiones sólidas bajas y frente de vidrio con puerta
  for (const r of ROOMS.slice(1)) b.wall(r.x0, B.z0, r.x0, NORTH_WALL_Z, 1.8)
  for (const r of ROOMS) {
    const d0 = r.door - DOOR_W / 2, d1 = r.door + DOOR_W / 2
    if (d0 > r.x0 + 0.05) b.glassWall(r.x0, NORTH_WALL_Z, d0, NORTH_WALL_Z, 2.0, 1.2)
    if (d1 < r.x1 - 0.05) b.glassWall(d1, NORTH_WALL_Z, r.x1, NORTH_WALL_Z, 2.0, 1.2)
  }

  // Oficinas privadas: escritorio ejecutivo, biblioteca, sofá y planta
  ROOMS.slice(0, 3).forEach((r, i) => {
    const cx = (r.x0 + r.x1) / 2 - 0.4
    b.box(1.7, 0.06, 0.8, M.deskWood, cx, 0.62, -9.1)
    b.box(1.6, 0.6, 0.06, M.deskWood, cx, 0.31, -8.75)
    for (const sx of [-0.8, 0.8]) b.box(0.06, 0.6, 0.75, M.deskWood, cx + sx, 0.31, -9.1)
    b.block(cx, -9.1, 1.7, 0.8, 0, 0.22)
    b.officeChair(cx, -9.85, 0, M.leather)
    const screen = b.laptop(cx, 0.65, -9.25, Math.PI)
    b.box(0.08, 0.35, 0.08, M.dark, cx + 0.65, 0.82, -9.3)
    b.mesh(new THREE.ConeGeometry(0.12, 0.12, 16, 1, true), M.white, cx + 0.65, 1.02, -9.3)
    b.seats.office.push({ x: cx, z: -9.85, rot: 0, seat: true, screen })
    b.officeChair(cx - 0.45, -7.95, Math.PI, M.fabric)
    b.officeChair(cx + 0.45, -7.95, Math.PI, M.fabric)
    b.bookshelf(r.x1 - 0.35, -9.3, -Math.PI / 2, 1.6)
    b.plant(r.x0 + 0.45, -10.5, 1.1)
    b.sofa(r.x0 + 0.55, -8.2, Math.PI / 2, i === 0 ? M.fabricPurple : M.fabric, 1.5)
  })

  // Sala de reuniones
  const mr = ROOMS[3]
  const mcx = (mr.x0 + mr.x1) / 2
  b.box(3.4, 0.06, 1.3, M.deskWood, mcx, 0.62, -8.9)
  b.box(0.5, 0.6, 0.5, M.metal, mcx, 0.3, -8.9)
  b.block(mcx, -8.9, 3.4, 1.3, 0, 0.22)
  for (const dx of [-1.1, 0, 1.1]) {
    b.officeChair(mcx + dx, -9.9, 0, M.fabric)
    b.officeChair(mcx + dx, -7.9, Math.PI, M.fabric)
  }
  b.box(2.4, 1.3, 0.06, M.tv, mcx, 1.45, B.z0 + 0.17)
  b.plant(mr.x1 - 0.45, -10.5)

  // Cocina
  const k = ROOMS[4]
  b.box(5.2, 0.9, 0.7, M.white, (k.x0 + k.x1) / 2, 0.45, -10.5)
  b.box(5.2, 0.05, 0.74, M.counter, (k.x0 + k.x1) / 2, 0.92, -10.5)
  b.box(5.2, 0.7, 0.4, M.white, (k.x0 + k.x1) / 2, 2.0, -10.7)
  b.block((k.x0 + k.x1) / 2, -10.5, 5.2, 0.7, 0, 0.2)
  b.box(0.85, 2.0, 0.7, M.steel, k.x1 - 0.5, 1.0, -10.45)
  b.box(0.42, 0.48, 0.38, M.dark, 9.0, 1.19, -10.55)
  b.mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3b30' }), 9.1, 1.33, -10.35, { shadow: false })
  b.box(0.5, 0.05, 0.35, M.steel, 10.4, 0.95, -10.5)
  b.box(1.6, 0.06, 0.9, M.white, 9.3, 0.95, -8.1)
  b.box(1.5, 0.9, 0.8, M.counter, 9.3, 0.46, -8.1)
  b.block(9.3, -8.1, 1.6, 0.9, 0, 0.2)
  for (const x of [7.4, 8.4, 10.2, 11.2]) b.seats.kitchen.push({ x, z: -9.6, rot: Math.PI, seat: false })

  // Baño
  const bt = ROOMS[5]
  for (const x of [13.2, 15.0]) {
    b.box(0.45, 0.42, 0.6, M.white, x, 0.21, -10.55)
    b.box(0.05, 1.6, 1.4, M.wall, x + 0.9, 0.8, -10.3)
  }
  b.box(1.0, 0.1, 0.45, M.white, 14.1, 0.85, NORTH_WALL_Z - 0.35)
  for (const x of [13.2, 15.0]) b.seats.bathroom.push({ x, z: -9.7, rot: Math.PI, seat: false })
  b.block(14.1, -10.55, bt.x1 - bt.x0, 0.7, 0, 0.1)

  // Área abierta del equipo
  for (const pz of [-0.6, 4.8]) for (const px of [-12.6, -8.2]) b.pod(px, pz, M.fabric, 'team')
  b.sofa(-12.0, 9.8, Math.PI, M.fabricPurple, 2.6)
  b.box(1.2, 0.36, 0.6, M.deskWood, -12.0, 0.18, 8.6)
  b.block(-12.0, 8.6, 1.2, 0.6, 0, 0.2)
  b.box(0.05, 1.3, 2.6, M.white, B.x0 + 0.16, 1.4, 2.2)
  b.plant(-15.3, -3.6, 1.2)
  b.plant(-5.6, 10.3, 1.2)

  // Jardín central: jardinera de madera elevada con césped, árbol y estanque
  const gw = GARDEN.x1 - GARDEN.x0, gd = GARDEN.z1 - GARDEN.z0
  const gcx = (GARDEN.x0 + GARDEN.x1) / 2, gcz = (GARDEN.z0 + GARDEN.z1) / 2
  b.box(gw, 0.42, gd, M.deskWood, gcx, 0.21, gcz)
  b.box(gw - 0.24, 0.05, gd - 0.24, M.grass, gcx, 0.44, gcz, { shadow: false })
  b.block(gcx, gcz, gw, gd, 0, 0.25)
  b.mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.7, 10), new THREE.MeshStandardMaterial({ color: '#6b4a2d', roughness: 0.9 }), gcx - 0.8, 1.3, gcz - 0.5)
  b.mesh(new THREE.IcosahedronGeometry(1.25, 1), M.leaf, gcx - 0.8, 2.55, gcz - 0.5)
  b.mesh(new THREE.IcosahedronGeometry(0.8, 1), M.leaf2, gcx - 0.2, 2.95, gcz - 0.1)
  b.mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.04, 32), M.water, gcx + 1.4, 0.47, gcz + 1.4, { shadow: false })
  ;[[-2.4, -0.8], [2.4, -0.9], [-2.3, 3.6], [0.8, 3.7], [2.5, 1.3]].forEach(([x, z], i) => {
    b.mesh(new THREE.IcosahedronGeometry(0.42, 1), i % 2 ? M.leaf : M.leaf2, x, 0.78, z)
  })
  b.bench(gcx, GARDEN.z0 - 0.75, 0)
  b.bench(gcx, GARDEN.z1 + 0.75, Math.PI)
  b.bench(GARDEN.x0 - 0.75, gcz, Math.PI / 2)
  b.bench(GARDEN.x1 + 0.75, gcz, -Math.PI / 2)

  // Lounge sur
  b.sofa(0, 9.9, Math.PI, M.fabric, 2.6)
  b.box(1.4, 0.32, 0.7, M.deskWood, 0, 0.16, 8.6)
  b.block(0, 8.6, 1.4, 0.7, 0, 0.2)
  b.plant(-3.2, 10.2)
  b.plant(3.2, 10.2)

  // Laboratorio de agentes: vidrio con puerta, alfombra oscura y racks
  b.glassWall(LAB.x0, LAB.z0, LAB.x0, LAB.doorZ0, 2.2, 1.2)
  b.glassWall(LAB.x0, LAB.doorZ1, LAB.x0, B.z1, 2.2, 1.2)
  b.glassWall(LAB.x0, LAB.z0, B.x1, LAB.z0, 2.2, 1.2)
  b.box(0.04, 0.04, B.z1 - LAB.z0, M.purpleGlow, LAB.x0 + 0.1, 0.02, (LAB.z0 + B.z1) / 2, { shadow: false })
  for (const pz of [0.2, 5.8]) for (const px of [8.3, 12.6]) b.pod(px, pz, M.fabricPurple, 'lab')
  b.coordinatorDesk(9.6, 8.7)
  for (const z of [8.6, 9.8]) {
    b.box(0.7, 2.0, 0.9, M.dark, 15.3, 1.0, z)
    for (let i = 0; i < 6; i++) b.box(0.02, 0.03, 0.5, i % 2 ? M.purpleGlow : M.water, 14.94, 0.4 + i * 0.25, z, { shadow: false })
    b.block(15.3, z, 0.7, 0.9, 0, 0.2)
  }
  b.plant(5.6, -3.0, 1.1)

  return b
}

// ===== Escena =====
export class OfficeScene {
  constructor(container, { onHover, onSelect } = {}) {
    this.container = container
    this.onHover = onHover
    this.onSelect = onSelect
    this.chars = new Map()
    this.selectedId = null
    this.clock = new THREE.Clock()
    this.keys = new Set()

    const w = container.clientWidth, h = container.clientHeight
    this.highQuality = window.innerWidth > 900

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.highQuality ? 2 : 1.5))
    this.renderer.setSize(w, h)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    container.appendChild(this.renderer.domElement)

    this.labels = new CSS2DRenderer()
    this.labels.setSize(w, h)
    Object.assign(this.labels.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' })
    container.appendChild(this.labels.domElement)

    this.scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.55
    pmrem.dispose()

    // Cámara isométrica fija (sin rotación)
    this.viewSize = 22
    const aspect = w / h
    this.camera = new THREE.OrthographicCamera(
      -this.viewSize * aspect / 2, this.viewSize * aspect / 2, this.viewSize / 2, -this.viewSize / 2, 0.1, 300)
    this.camera.position.copy(ISO_DIR).multiplyScalar(60)
    this.camera.zoom = 1.25
    this.camera.updateProjectionMatrix()
    this.camera.lookAt(0, 0, 0)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableRotate = false
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.screenSpacePanning = false
    this.controls.zoomToCursor = true
    this.controls.minZoom = 0.7
    this.controls.maxZoom = 5
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
    this.controls.target.set(0, 0, 0)
    this.targetFocus = null

    // Iluminación: cielo suave + sol con sombras + entorno para reflejos
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c8bfae', 0.45))
    const sun = new THREE.DirectionalLight('#fff4e5', 2.6)
    sun.position.set(14, 26, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(this.highQuality ? 4096 : 2048, this.highQuality ? 4096 : 2048)
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 20, bottom: -20, near: 1, far: 80 })
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.02
    this.scene.add(sun)

    this.nav = new NavGrid(B.x0, B.z0, B.x1, B.z1, 0.2)
    this.builder = buildOffice(this.scene, this.nav)
    this.seats = this.builder.seats
    this.charGroup = new THREE.Group()
    this.scene.add(this.charGroup)

    // Post-proceso: oclusión ambiental para sombras de contacto
    this.composer = new EffectComposer(this.renderer)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    if (this.highQuality) {
      this.gtao = new GTAOPass(this.scene, this.camera, w, h)
      this.gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1, scale: 1 })
      this.gtao.blendIntensity = 0.85
      this.composer.addPass(this.gtao)
    }
    this.composer.addPass(new OutputPass())

    // Interacción
    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.downAt = null
    const el = this.renderer.domElement
    this._onMove = (e) => this.handlePointer(e, false)
    this._onDown = (e) => { this.downAt = [e.clientX, e.clientY] }
    this._onUp = (e) => {
      if (e.button === 0 && this.downAt && Math.hypot(e.clientX - this.downAt[0], e.clientY - this.downAt[1]) < 6) this.handlePointer(e, true)
      this.downAt = null
    }
    this._onLeave = () => this.onHover?.(null)
    this._onContext = (e) => e.preventDefault()
    el.addEventListener('pointermove', this._onMove)
    el.addEventListener('pointerdown', this._onDown)
    el.addEventListener('pointerup', this._onUp)
    el.addEventListener('pointerleave', this._onLeave)
    el.addEventListener('contextmenu', this._onContext)

    // Teclado estilo juego: WASD / flechas para moverse, Q/E para alejar/acercar
    const typing = () => {
      const a = document.activeElement
      return a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable) || document.querySelector('.modal-overlay')
    }
    const KEYS = { w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', q: 'rotL', e: 'rotR', '+': 'in', '=': 'in', '-': 'out' }
    this._onKeyDown = (e) => {
      const k = KEYS[e.key.toLowerCase()]
      if (!k || typing()) return
      this.keys.add(k)
      if (e.key.startsWith('Arrow')) e.preventDefault()
    }
    this._onKeyUp = (e) => { const k = KEYS[e.key.toLowerCase()]; if (k) this.keys.delete(k) }
    this._onBlur = () => this.keys.clear()
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    window.addEventListener('blur', this._onBlur)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)

    this.running = true
    this.animate = this.animate.bind(this)
    requestAnimationFrame(this.animate)
  }

  seatFor(place) {
    const pick = (arr) => arr.length ? arr[((place.index || 0) % arr.length + arr.length) % arr.length] : { x: 0, z: 8, rot: 0, seat: false }
    switch (place.type) {
      case 'desk': return pick(place.zone === 'lab' ? this.seats.lab : this.seats.team)
      case 'office': return pick(this.seats.office)
      case 'kitchen': return pick(this.seats.kitchen)
      case 'bathroom': return pick(this.seats.bathroom)
      case 'coordinator': return pick(this.seats.coordinator)
      case 'visit': {
        // De pie al lado del puesto de otro personaje, mirándolo
        const target = this.chars.get(place.targetId)?.spot || { x: 0, z: 0, rot: 0 }
        const side = place.side || 1
        const ox = Math.cos(target.rot) * 0.75 * side, oz = -Math.sin(target.rot) * 0.75 * side
        let x = target.x + ox, z = target.z + oz
        if (this.nav && !this.nav.free(...this.nav.toCell(x, z))) { x = target.x - ox; z = target.z - oz }
        return { x, z, rot: Math.atan2(target.x - x, target.z - z), seat: false }
      }
      default: return pick(this.seats.garden)
    }
  }

  hitCharacter(e) {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hits = this.raycaster.intersectObjects(this.charGroup.children, true)
    for (const h of hits) {
      let o = h.object
      while (o && !o.userData.charId) o = o.parent
      if (o) return o.userData.charId
    }
    return null
  }

  handlePointer(e, isClick) {
    if (!isClick && e.buttons) return
    const id = this.hitCharacter(e)
    this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
    if (isClick) { if (id) this.onSelect?.(id) }
    else this.onHover?.(id, e.clientX, e.clientY)
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight
    if (!w || !h) return
    const aspect = w / h
    Object.assign(this.camera, {
      left: -this.viewSize * aspect / 2, right: this.viewSize * aspect / 2,
      top: this.viewSize / 2, bottom: -this.viewSize / 2,
    })
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.composer.setSize(w, h)
    this.labels.setSize(w, h)
  }

  // list: [{ id, name, look, place: {type, zone, index}, activity, statusColor }]
  setCharacters(list) {
    const seen = new Set()
    for (const c of list) {
      seen.add(c.id)
      let ch = this.chars.get(c.id)
      const lookKey = JSON.stringify(c.look)
      if (ch && ch.lookKey !== lookKey) { this.removeChar(c.id); ch = null }
      const spot = this.seatFor(c.place)
      const placeKey = `${c.place.type}:${c.place.zone || ''}:${c.place.index}:${c.place.targetId || ''}`

      if (!ch) {
        const root = createMinifig(c.look)
        root.userData.charId = c.id
        const labelEl = document.createElement('div')
        labelEl.className = 'office-label'
        const label = new CSS2DObject(labelEl)
        label.position.set(0, 1.3, 0)
        root.add(label)
        root.position.set(spot.x, 0, spot.z)
        root.rotation.y = spot.rot
        this.charGroup.add(root)
        ch = { root, labelEl, lookKey, placeKey, spot, route: [], phase: Math.random() * 6 }
        this.chars.set(c.id, ch)
      } else if (ch.placeKey !== placeKey) {
        ch.placeKey = placeKey
        ch.spot = spot
        ch.route = this.nav.findPath([ch.root.position.x, ch.root.position.z], [spot.x, spot.z])
      }
      ch.activity = c.activity
      ch.place = c.place
      ch.labelEl.innerHTML = `<span class="office-dot" style="background:${c.statusColor}"></span>${c.name}`
    }
    for (const id of [...this.chars.keys()]) if (!seen.has(id)) this.removeChar(id)
    this.applySelection()
  }

  // ¿Ya llegó a su destino? (lo usa la Oficina para encadenar entregas)
  arrived(id) {
    const ch = this.chars.get(id)
    if (!ch) return true
    return !ch.route.length && Math.hypot(ch.root.position.x - ch.spot.x, ch.root.position.z - ch.spot.z) < 0.2
  }

  removeChar(id) {
    const ch = this.chars.get(id)
    if (!ch) return
    ch.labelEl.remove()
    this.charGroup.remove(ch.root)
    ch.root.traverse(o => {
      if (o.isMesh) {
        o.geometry.dispose()
        ;(Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose(); m.dispose() })
      }
    })
    this.chars.delete(id)
  }

  select(id, focus = true) {
    this.selectedId = id
    this.applySelection()
    const ch = id && this.chars.get(id)
    if (ch && focus) this.targetFocus = new THREE.Vector3(ch.root.position.x, 0, ch.root.position.z)
  }

  applySelection() {
    for (const [id, ch] of this.chars) ch.root.userData.parts.ring.visible = id === this.selectedId
  }

  resetView() {
    // Vuelve a la vista isométrica original
    const t = this.controls.target
    this.camera.position.copy(t).add(ISO_DIR.clone().multiplyScalar(60))
    this.camera.lookAt(t)
    this.orbitVel = 0
    this.targetFocus = new THREE.Vector3(0, 0, 0)
    this.camera.zoom = 1.25
    this.camera.updateProjectionMatrix()
  }

  // Mueve cámara y objetivo juntos sobre el piso, sin salirse de la oficina
  panBy(dx, dz) {
    const t = this.controls.target
    const nx = Math.min(B.x1 + 4, Math.max(B.x0 - 4, t.x + dx))
    const nz = Math.min(B.z1 + 4, Math.max(B.z0 - 4, t.z + dz))
    const mx = nx - t.x, mz = nz - t.z
    t.x += mx; t.z += mz
    this.camera.position.x += mx; this.camera.position.z += mz
  }

  handleKeys(dt) {
    // Órbita suave con Q / E: acelera y frena, gira alrededor del punto que se mira
    const want = (this.keys.has('rotR') ? 1 : 0) - (this.keys.has('rotL') ? 1 : 0)
    this.orbitVel = (this.orbitVel || 0) + (want * 0.9 - (this.orbitVel || 0)) * Math.min(1, dt * 5)
    if (Math.abs(this.orbitVel) > 0.002) {
      const t = this.controls.target
      const off = this.camera.position.clone().sub(t).applyAxisAngle(UP, this.orbitVel * dt)
      this.camera.position.copy(t).add(off)
      this.camera.lookAt(t)
    }
    if (!this.keys.size) return
    const speed = 12 * dt / this.camera.zoom
    // Adelante y derecha según hacia dónde mira la cámara (sirve aunque se haya girado)
    const fwd = this.controls.target.clone().sub(this.camera.position).setY(0).normalize()
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x)
    const v = new THREE.Vector3()
    if (this.keys.has('up')) v.add(fwd)
    if (this.keys.has('down')) v.sub(fwd)
    if (this.keys.has('right')) v.add(right)
    if (this.keys.has('left')) v.sub(right)
    if (v.lengthSq()) { v.normalize().multiplyScalar(speed); this.panBy(v.x, v.z); this.targetFocus = null }
    if (this.keys.has('in') || this.keys.has('out')) {
      const f = this.keys.has('in') ? 1 + 1.6 * dt : 1 / (1 + 1.6 * dt)
      this.camera.zoom = Math.min(this.controls.maxZoom, Math.max(this.controls.minZoom, this.camera.zoom * f))
      this.camera.updateProjectionMatrix()
    }
  }

  animateChar(ch, dt, t) {
    const { body, legL, legR, armL, armR, cup, doc } = ch.root.userData.parts
    const carrying = ch.activity === 'carry'
    if (doc) doc.visible = carrying
    const p = ch.root.position
    let walking = false

    if (ch.route.length) {
      const [tx, tz] = ch.route[0]
      const dx = tx - p.x, dz = tz - p.z
      const d = Math.hypot(dx, dz)
      const step = WALK_SPEED * dt
      if (d <= step) { p.x = tx; p.z = tz; ch.route.shift() }
      else { p.x += (dx / d) * step; p.z += (dz / d) * step }
      if (d > 0.001) {
        // Giro suave hacia la dirección de marcha
        const target = Math.atan2(dx, dz)
        let diff = target - ch.root.rotation.y
        diff = Math.atan2(Math.sin(diff), Math.cos(diff))
        ch.root.rotation.y += diff * Math.min(1, dt * 12)
      }
      walking = ch.route.length > 0
    }

    const arrived = !ch.route.length
    if (arrived) {
      let diff = ch.spot.rot - ch.root.rotation.y
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      ch.root.rotation.y += diff * Math.min(1, dt * 10)
    }
    const sitting = arrived && ch.spot.seat
    cup.visible = arrived && ch.activity === 'drink'

    if (walking) {
      const s = Math.sin(t * 10 + ch.phase)
      legL.rotation.x = s * 0.55
      legR.rotation.x = -s * 0.55
      armL.rotation.x = -s * 0.45
      armR.rotation.x = carrying ? -0.95 : s * 0.45
      body.position.y = Math.abs(s) * 0.022
      return
    }
    if (sitting) {
      body.position.y = SEAT_Y - 0.33
      legL.rotation.x = legR.rotation.x = -Math.PI / 2
    } else {
      body.position.y = 0
      legL.rotation.x = legR.rotation.x = 0
    }
    switch (ch.activity) {
      case 'typing':
        armL.rotation.x = -1.2 + Math.sin(t * 16 + ch.phase) * 0.09
        armR.rotation.x = -1.2 + Math.sin(t * 16 + ch.phase + 1.7) * 0.09
        break
      case 'drink':
        armL.rotation.x = -0.15
        armR.rotation.x = -2.1 + Math.sin(t * 1.4 + ch.phase) * 0.22
        break
      case 'relax':
        armL.rotation.x = armR.rotation.x = -0.35 + Math.sin(t * 1.1 + ch.phase) * 0.05
        break
      case 'carry':
        armL.rotation.x = Math.sin(t * 1.4 + ch.phase) * 0.06
        armR.rotation.x = -0.95
        break
      case 'paused':
        armL.rotation.x = -0.6
        armR.rotation.x = -0.2 + Math.sin(t * 0.8 + ch.phase) * 0.05
        break
      default:
        armL.rotation.x = Math.sin(t * 1.4 + ch.phase) * 0.06
        armR.rotation.x = -Math.sin(t * 1.4 + ch.phase) * 0.06
    }
  }

  animate() {
    if (!this.running) return
    requestAnimationFrame(this.animate)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    const t = this.clock.elapsedTime
    this.handleKeys(dt)

    const allScreens = [...this.seats.team, ...this.seats.lab, ...this.seats.office, ...this.seats.coordinator].filter(s => s.screen)
    for (const s of allScreens) s.screen.emissive.set('#000000')
    for (const ch of this.chars.values()) {
      this.animateChar(ch, dt, t)
      if (!ch.route.length && ch.spot.screen && ch.activity === 'typing') {
        ch.spot.screen.emissive.set(ch.place?.zone === 'lab' || ch.place?.type === 'coordinator' ? BRAND_GLOW : '#3aa0ff')
      }
    }
    // Anillo holográfico del escritorio del coordinador
    const ring = this.builder?.coordinatorRing
    if (ring) { ring.rotation.z += dt * 0.8; ring.position.y = 0.95 + Math.sin(t * 1.6) * 0.03 }

    if (this.targetFocus) {
      const t0 = this.controls.target
      const nx = t0.x + (this.targetFocus.x - t0.x) * 0.12
      const nz = t0.z + (this.targetFocus.z - t0.z) * 0.12
      this.panBy(nx - t0.x, nz - t0.z)
      if (Math.hypot(this.targetFocus.x - t0.x, this.targetFocus.z - t0.z) < 0.05) this.targetFocus = null
    }
    this.controls.update()
    this.composer.render()
    this.labels.render(this.scene, this.camera)
  }

  dispose() {
    this.running = false
    this.resizeObserver.disconnect()
    const el = this.renderer.domElement
    el.removeEventListener('pointermove', this._onMove)
    el.removeEventListener('pointerdown', this._onDown)
    el.removeEventListener('pointerup', this._onUp)
    el.removeEventListener('pointerleave', this._onLeave)
    el.removeEventListener('contextmenu', this._onContext)
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    window.removeEventListener('blur', this._onBlur)
    this.controls.dispose()
    this.scene.traverse(o => {
      if (o.isMesh) {
        o.geometry.dispose()
        ;(Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose(); m.dispose() })
      }
    })
    this.scene.environment?.dispose()
    for (const k of Object.keys(MAT)) delete MAT[k]
    this.composer.dispose?.()
    this.renderer.dispose()
    el.remove()
    this.labels.domElement.remove()
  }
}
