import * as THREE from 'three'
import { torsoPrint } from './textures.js'
import { BRAND } from '../config.js'

// Personaje estilo minifigura de bloques, diseño propio.
// Altura total ~1.0 con los pies en y=0; mira hacia +z.
const SKIN = '#f6c445'

// Plástico inyectado: brillo con capa transparente encima
const plastic = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.32, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18, ...extra,
})

function torsoGeometry() {
  const g = new THREE.BoxGeometry(0.3, 0.32, 0.16)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setX(i, pos.getX(i) * 0.78)
  }
  g.computeVertexNormals()
  return g
}

function makeArm(side, look) {
  const pivot = new THREE.Group()
  pivot.position.set(side * 0.16, 0.655, 0)
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 10), plastic(look.arms))
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.05, 0.22, 14), plastic(look.arms))
  arm.position.set(side * 0.022, -0.11, 0.0)
  arm.rotation.z = side * 0.14
  // Mano en forma de "C" como las piezas de bloque
  const hand = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.016, 10, 16, Math.PI * 1.45), plastic(look.skin || SKIN))
  hand.position.set(side * 0.04, -0.245, 0.018)
  hand.rotation.set(Math.PI / 2, 0, Math.PI * 0.27)
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.04, 8), plastic(look.skin || SKIN))
  wrist.position.set(side * 0.036, -0.225, 0.005)
  for (const m of [shoulder, arm, hand, wrist]) m.castShadow = true
  pivot.add(shoulder, arm, wrist, hand)
  return pivot
}

function makeLeg(side, look) {
  const pivot = new THREE.Group()
  pivot.position.set(side * 0.071, 0.33, 0)
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.27, 0.15), plastic(look.legs))
  leg.position.set(0, -0.15, 0)
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.06, 0.19), plastic(look.legs))
  foot.position.set(0, -0.3, 0.02)
  leg.castShadow = foot.castShadow = true
  pivot.add(leg, foot)
  return pivot
}

function makeFace(look) {
  const g = new THREE.Group()
  const ink = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.5 })
  const shine = new THREE.MeshBasicMaterial({ color: '#ffffff' })
  for (const x of [-0.038, 0.038]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), ink)
    eye.scale.set(1, 1.25, 0.45)
    eye.position.set(x, 0.018, 0.104)
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 6, 4), shine)
    glint.position.set(x + 0.005, 0.026, 0.111)
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.007, 0.006), ink)
    brow.position.set(x, 0.05, 0.104)
    brow.rotation.z = x > 0 ? -0.12 : 0.12
    g.add(eye, glint, brow)
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0065, 6, 16, Math.PI * 0.9), ink)
  smile.position.set(0, -0.018, 0.104)
  smile.rotation.z = Math.PI * 1.05
  g.add(smile)
  if (look.lipstick) {
    const lips = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.006), new THREE.MeshStandardMaterial({ color: '#c0392b' }))
    lips.position.set(0, -0.046, 0.104)
    g.add(lips)
  }
  return g
}

function addAccessory(head, body, look) {
  const hairMat = plastic(look.hair || '#4b2e1a', { clearcoat: 0.3, roughness: 0.45 })
  const accent = look.accent || look.hair || '#999999'
  const cap = (y = 0.045) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.127, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), hairMat)
    m.position.y = y
    m.scale.set(1, 0.85, 1.04)
    return m
  }
  switch (look.style) {
    case 'casco': {
      const helmet = new THREE.Mesh(new THREE.CylinderGeometry(0.126, 0.122, 0.21, 24), plastic(look.hair, { metalness: 0.55, roughness: 0.25 }))
      helmet.position.y = 0.01
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.126, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), plastic(look.hair, { metalness: 0.55, roughness: 0.25 }))
      dome.position.y = 0.11
      dome.scale.y = 0.45
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.03), plastic(accent, { metalness: 0.6, roughness: 0.2 }))
      visor.position.set(0, -0.005, 0.115)
      const eyeSlit = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.014, 0.01), new THREE.MeshBasicMaterial({ color: '#bff3ff' }))
      eyeSlit.position.set(0, 0.022, 0.132)
      head.add(helmet, dome, visor, eyeSlit)
      head.userData.hideFace = true
      break
    }
    case 'pelo-largo': {
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.27, 0.09), hairMat)
      back.position.set(0, -0.07, -0.075)
      const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.15), hairMat)
      sideL.position.set(-0.115, -0.04, -0.01)
      const sideR = sideL.clone()
      sideR.position.x = 0.115
      head.add(cap(0.04), back, sideL, sideR)
      break
    }
    case 'gorra': {
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.016, 0.11), hairMat)
      visor.position.set(0, 0.06, 0.12)
      head.add(cap(0.05), visor)
      break
    }
    case 'capa': {
      const cape = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.45, 0.014), plastic(accent, { clearcoat: 0.2, roughness: 0.6 }))
      cape.position.set(0, 0.47, -0.09)
      cape.rotation.x = 0.1
      cape.castShadow = true
      body.add(cape)
      head.add(cap(0.04))
      break
    }
    case 'ninguno':
      break
    default: { // pelo corto con copete
      const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.05), hairMat)
      fringe.position.set(0.02, 0.07, 0.09)
      fringe.rotation.z = -0.15
      head.add(cap(0.045), fringe)
    }
  }
}

export function createMinifig(look = {}) {
  const l = { torso: BRAND.color, legs: '#1f2937', hair: '#4b2e1a', style: 'pelo', ...look }
  if (!look.arms) l.arms = l.torso

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const legL = makeLeg(-1, l), legR = makeLeg(1, l)
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.15), plastic(l.legs))
  hips.position.y = 0.345
  const crotch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 10), plastic(l.legs))
  crotch.rotation.x = Math.PI / 2
  crotch.position.y = 0.32

  // Torso con estampado frontal (material 4 = cara +z de la caja)
  const side = plastic(l.torso)
  const front = plastic('#ffffff', { map: torsoPrint(l.torso, { emblem: l.emblem, seed: (l.torso || '').length }) })
  const torso = new THREE.Mesh(torsoGeometry(), [side, side, side, side, front, side])
  torso.position.y = 0.53
  torso.castShadow = true

  const armL = makeArm(-1, l), armR = makeArm(1, l)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.03, 14), plastic(l.skin || SKIN))
  neck.position.y = 0.705

  const head = new THREE.Group()
  head.position.y = 0.81
  const headMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.104, 0.104, 0.165, 28), plastic(l.skin || SKIN))
  headMesh.castShadow = true
  const rimTop = new THREE.Mesh(new THREE.TorusGeometry(0.096, 0.009, 8, 28), plastic(l.skin || SKIN))
  rimTop.rotation.x = Math.PI / 2
  rimTop.position.y = 0.082
  const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.035, 18), plastic(l.skin || SKIN))
  stud.position.y = 0.1
  head.add(headMesh, rimTop, stud)
  addAccessory(head, body, l)
  if (!head.userData.hideFace) head.add(makeFace(l))

  // Taza de café (visible solo al tomar café)
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.065, 14), plastic('#ffffff'))
  cup.position.set(0.04, -0.27, 0.06)
  cup.visible = false
  armR.add(cup)

  // Carpeta con la tarea (visible cuando el personaje entrega o recibe trabajo)
  const doc = new THREE.Group()
  const folder = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.21), plastic(BRAND.color))
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.006, 0.19), plastic('#ffffff'))
  paper.position.y = 0.009
  doc.add(folder, paper)
  doc.position.set(0.04, -0.27, 0.1)
  doc.rotation.x = -0.35
  doc.visible = false
  armR.add(doc)

  body.add(legL, legR, hips, crotch, torso, armL, armR, neck, head)

  // Anillo de selección en el piso
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.37, 40),
    new THREE.MeshBasicMaterial({ color: BRAND.color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }))
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.025
  ring.visible = false
  root.add(ring)

  root.userData.parts = { body, legL, legR, armL, armR, head, cup, ring, doc }
  return root
}
