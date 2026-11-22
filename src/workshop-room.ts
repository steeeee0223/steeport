import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  SpotLight,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

import type { Point } from './visitor'
import {
  workshopBench,
  workshopBounds,
  workshopChairs,
  workshopDesks,
  workshopDoor,
  workshopDoorWidth,
  workshopHinge,
} from './workshop-layout'

type Dimensions = [number, number, number]

function paintedMaterial(
  width: number,
  height: number,
  paint: (context: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Workshop material unavailable')
  paint(context)
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 4
  return new MeshStandardMaterial({ map, roughness: 0.94 })
}

function concrete() {
  return paintedMaterial(1024, 512, (context) => {
    let seed = 4217
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 0x100000000
    }
    context.fillStyle = '#817b70'
    context.fillRect(0, 0, 1024, 512)
    for (let i = 0; i < 14000; i++) {
      const light = random() < 0.52
      context.fillStyle = light ? '#e4d8c518' : '#3b352917'
      const size = 1 + random() * random() * 8
      context.fillRect(random() * 1024, random() * 512, size, size * 0.7)
    }
    const splash = context.createLinearGradient(0, 440, 0, 512)
    splash.addColorStop(0, '#4b423500')
    splash.addColorStop(1, '#4b423576')
    context.fillStyle = splash
    context.fillRect(0, 440, 1024, 72)
    for (let i = 0; i < 85; i++) {
      const x = random() * 1024
      const y = random() * 36
      const length = 20 + random() * 160
      const streak = context.createLinearGradient(0, y, 0, y + length)
      streak.addColorStop(0, '#54463848')
      streak.addColorStop(1, '#54463800')
      context.fillStyle = streak
      context.fillRect(x, y, 1 + random() * 4, length)
    }
    for (const y of [153, 337]) {
      context.fillStyle = '#4d463735'
      context.fillRect(0, y, 1024, 1)
      context.fillStyle = '#ded2c234'
      context.fillRect(0, y + 1, 1024, 1)
    }
  })
}

export function workshopRoom(hasModeledProps: boolean) {
  const root = new Group()
  const roof = new Group()
  const front = new Group()
  const back = new Group()
  const left = new Group()
  const right = new Group()
  const pavement = new Group()
  root.add(roof, front, back, left, right)
  const unit = new BoxGeometry()
  const face = new PlaneGeometry()
  const shade = new CylinderGeometry(0.085, 0.14, 0.075, 16)
  const upholstery = new RoundedBoxGeometry(1, 1, 1, 2, 0.15)
  const caster = new CylinderGeometry(0.043, 0.043, 0.043, 12)
  const facadePanels: PlaneGeometry[] = []
  const materials = new Map<string, MeshStandardMaterial>()
  const masonry = concrete()
  const painted = [masonry]

  const shadowCanvas = document.createElement('canvas')
  shadowCanvas.width = shadowCanvas.height = 64
  const shadowContext = shadowCanvas.getContext('2d')
  if (!shadowContext) throw new Error('Workshop shadow unavailable')
  const fade = shadowContext.createRadialGradient(32, 32, 6, 32, 32, 32)
  fade.addColorStop(0, '#160e0a55')
  fade.addColorStop(1, '#160e0a00')
  shadowContext.fillStyle = fade
  shadowContext.fillRect(0, 0, 64, 64)
  const floorShadow = new MeshBasicMaterial({
    map: new CanvasTexture(shadowCanvas),
    transparent: true,
    depthWrite: false,
  })

  function contactShadow(x: number, z: number, width: number, depth: number) {
    const mesh = new Mesh(face, floorShadow)
    mesh.position.set(x, 0.003, z)
    mesh.scale.set(width, depth, 1)
    mesh.rotation.x = -Math.PI / 2
    root.add(mesh)
    return mesh
  }

  function solid(color: string) {
    let material = materials.get(color)
    if (!material) {
      material = new MeshStandardMaterial({ color, roughness: 0.78 })
      materials.set(color, material)
    }
    return material
  }

  function box(
    parent: Group,
    surface: string | MeshStandardMaterial,
    position: Dimensions,
    size: Dimensions,
  ) {
    const material = typeof surface === 'string' ? solid(surface) : surface
    const mesh = new Mesh(unit, material)
    mesh.position.set(...position)
    mesh.scale.set(...size)
    mesh.castShadow = mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  function spot(
    parent: Group,
    position: Dimensions,
    target: Dimensions,
    intensity: number,
    range: number,
  ) {
    const light = new SpotLight(0xffd5a2, intensity, range, 0.9, 0.8)
    light.position.set(...position)
    light.target.position.set(...target)
    parent.add(light, light.target)
  }

  function tabletopPaint(
    material: MeshStandardMaterial,
    position: Dimensions,
    width: number,
    depth: number,
    rotation: number,
  ) {
    const mesh = new Mesh(face, material)
    mesh.position.set(...position)
    mesh.scale.set(width, depth, 1)
    mesh.rotation.set(-Math.PI / 2, 0, rotation)
    mesh.receiveShadow = true
    root.add(mesh)
  }

  const { left: x0, right: x1, front: z0, back: z1 } = workshopBounds
  const width = x1 - x0
  const depth = z1 - z0
  const midX = (x0 + x1) / 2
  const midZ = (z0 + z1) / 2
  const doorWidth = workshopDoor.right - workshopDoor.left
  const doorX = (workshopDoor.left + workshopDoor.right) / 2
  const plaster = '#a49a8a'
  const interior = '#3e4748'
  const steel = '#393d39'
  const wood = '#7b644d'
  const diffuser = new MeshStandardMaterial({
    color: '#c3ab89',
    emissive: '#e5b780',
    emissiveIntensity: 0.9,
  })

  function facadePanel(x: number, y: number, span: number, height: number) {
    box(front, interior, [x, y, z0], [span, height, 0.24])
    const panel = face.clone()
    const uv = panel.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
      const localX = (uv.getX(i) - 0.5) * span
      const localY = (uv.getY(i) - 0.5) * height
      uv.setXY(i, (x1 - x + localX) / width, (y + localY) / 2.86)
    }
    facadePanels.push(panel)
    const mesh = new Mesh(panel, masonry)
    mesh.position.set(x, y, z0 - 0.122)
    mesh.scale.set(span, height, 1)
    mesh.rotation.y = Math.PI
    mesh.receiveShadow = true
    front.add(mesh)
  }

  box(pavement, '#ae9c83', [-3.3, -0.094, -3.65], [17.8, 0.188, 0.32])
  box(
    pavement,
    '#6f7068',
    [-3.3, -0.19, -5.23],
    [17.8, 0.19, 3.15],
  ).castShadow = false
  box(root, '#766f64', [midX, -0.065, midZ], [width, 0.13, depth])
  box(roof, '#797165', [midX, 2.92, midZ], [width + 0.16, 0.18, depth + 0.18])
  box(back, plaster, [midX, 1.43, z1], [width, 2.86, 0.18])
  box(left, plaster, [x0, 1.43, midZ], [0.18, 2.86, depth])
  box(right, plaster, [x1, 1.43, midZ], [0.18, 2.86, depth])
  box(back, interior, [midX, 1.43, z1 - 0.09], [width, 2.86, 0.025])
  box(left, interior, [x0 + 0.09, 1.43, midZ], [0.025, 2.86, depth])
  box(right, interior, [x1 - 0.09, 1.43, midZ], [0.025, 2.86, depth])
  for (const [from, to] of [
    [x0, workshopDoor.left],
    [workshopDoor.right, x1],
  ] as const) {
    const x = (from + to) / 2
    facadePanel(x, 1.43, to - from, 2.86)
    box(front, '#666055', [x, 0.11, z0 - 0.13], [to - from, 0.22, 0.05])
  }
  facadePanel(doorX, 2.61, doorWidth, 0.5)
  box(front, '#726d62', [midX, 2.82, z0 - 0.135], [width, 0.11, 0.052])
  box(front, '#746e63', [doorX, 0.012, z0], [doorWidth, 0.022, 0.34])

  for (const x of [workshopDoor.left + 0.028, workshopDoor.right - 0.028])
    box(front, steel, [x, 1.17, z0], [0.056, 2.34, 0.31])
  box(front, steel, [doorX, 2.32, z0], [doorWidth, 0.055, 0.31])
  const door = new Group()
  door.position.set(workshopHinge.x, 0, workshopHinge.z)
  front.add(door)
  const leafWidth = workshopDoorWidth
  const latchX = -leafWidth + 0.14
  const doorPaint = paintedMaterial(256, 512, (context) => {
    context.fillStyle = '#444842'
    context.fillRect(0, 0, 256, 512)
    const wear = context.createRadialGradient(226, 285, 0, 226, 285, 42)
    wear.addColorStop(0, '#9a8e6b46')
    wear.addColorStop(1, '#9a8e6b00')
    context.fillStyle = wear
    context.fillRect(180, 243, 76, 84)
    context.fillStyle = '#756e575c'
    for (const [x, y, length] of [
      [211, 277, 16],
      [206, 293, 12],
      [228, 306, 19],
      [233, 267, 18],
    ] as const)
      context.fillRect(x, y, length, 1)
  })
  painted.push(doorPaint)
  box(door, doorPaint, [-leafWidth / 2, 1.17, 0], [leafWidth, 2.27, 0.06])
  box(
    door,
    '#50544b',
    [-leafWidth / 2, 0.16, -0.032],
    [leafWidth - 0.04, 0.21, 0.007],
  )
  for (const z of [-0.041, 0.041]) {
    box(door, '#646454', [latchX, 1.035, z], [0.072, 0.16, 0.018])
    box(
      door,
      '#a19b85',
      [latchX + 0.048, 1.06, z * 1.62],
      [0.145, 0.032, 0.045],
    )
  }
  for (const y of [0.24, 2.08])
    box(door, '#787568', [-0.003, y, -0.041], [0.035, 0.12, 0.041])

  const keypad = new Group()
  keypad.position.set(workshopDoor.left - 0.24, 1.24, z0 - 0.14)
  front.add(keypad)
  box(keypad, '#181d20', [0, 0, 0], [0.148, 0.238, 0.055])
  box(keypad, '#555f61', [0, 0, -0.033], [0.132, 0.222, 0.015])
  box(keypad, '#0a1719', [0, 0.075, -0.044], [0.092, 0.033, 0.01])
  const accessLight = new MeshStandardMaterial({
    color: '#c55d41',
    emissive: '#c55d41',
    emissiveIntensity: 1.2,
  })
  box(keypad, accessLight, [-0.026, 0.075, -0.051], [0.017, 0.008, 0.008])
  const keypadLabels = paintedMaterial(192, 244, (context) => {
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.font = '600 28px monospace'
    for (const [index, key] of [...'123456789*0#'].entries()) {
      const column = index % 3
      const row = Math.floor(index / 3)
      context.fillStyle = '#292f31'
      context.fillRect(4 + column * 64, 5 + row * 61, 56, 51)
      context.fillStyle = '#d8d8c5'
      context.fillText(key, 32 + column * 64, 31 + row * 61)
    }
  })
  painted.push(keypadLabels)
  const buttonLabels = new Mesh(face, keypadLabels)
  keypadLabels.transparent = true
  buttonLabels.position.set(0, -0.026, -0.056)
  buttonLabels.rotation.y = Math.PI
  buttonLabels.scale.set(0.108, 0.135, 1)
  keypad.add(buttonLabels)
  for (let column = -1; column <= 1; column++)
    for (let row = 0; row < 4; row++)
      box(
        keypad,
        '#202527',
        [column * 0.036, 0.025 - row * 0.034, -0.05],
        [0.032, 0.029, 0.011],
      )

  const plate = paintedMaterial(192, 112, (context) => {
    context.fillStyle = '#454940'
    context.fillRect(0, 0, 192, 112)
    context.strokeStyle = '#777668'
    context.strokeRect(5, 5, 182, 102)
    context.fillStyle = '#c7bfa9'
    context.font = '63px monospace'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('08', 96, 60)
  })
  painted.push(plate)
  const number = box(
    front,
    plate,
    [workshopDoor.left - 0.24, 1.59, z0 - 0.133],
    [0.24, 0.14, 0.023],
  )
  number.rotation.y = Math.PI
  const lampX = workshopDoor.left + 0.22
  box(front, steel, [lampX, 2.52, z0 - 0.21], [0.37, 0.17, 0.22])
  box(
    front,
    diffuser,
    [lampX, 2.442, z0 - 0.225],
    [0.28, 0.016, 0.15],
  ).castShadow = false
  spot(front, [lampX, 2.421, z0 - 0.23], [lampX, 1.03, z0 - 0.08], 5.5, 2.3)

  box(back, steel, [midX, 0.085, z1 - 0.1], [width, 0.14, 0.04])
  box(back, '#736f63', [midX, 2.12, z1 - 0.12], [width - 0.21, 0.037, 0.046])
  box(back, '#615f54', [midX, 2.41, z1 - 0.125], [0.68, 0.32, 0.07])
  box(back, '#3a3b35', [midX, 2.41, z1 - 0.165], [0.6, 0.24, 0.014])
  for (let row = 0; row < 6; row++)
    box(
      back,
      '#777569',
      [midX, 2.312 + row * 0.039, z1 - 0.181],
      [0.6, 0.016, 0.028],
    )

  box(roof, steel, [midX, 2.8, midZ], [1.22, 0.07, 0.19])
  box(roof, diffuser, [midX, 2.757, midZ], [1.13, 0.02, 0.145]).castShadow =
    false
  const ceilingLight = new PointLight(0xffe7ca, 0, 5)
  ceilingLight.position.set(midX, 2.56, midZ)
  root.add(ceilingLight)

  const { x, z, width: benchWidth, depth: benchDepth } = workshopBench
  contactShadow(x, z, 1.07, 1.83)
  if (!hasModeledProps) {
    box(root, wood, [x, 0.86, z], [benchWidth, 0.083, benchDepth])
    for (const legX of [x - 0.28, x + 0.28])
      for (const legZ of [z - 0.69, z + 0.69])
        box(root, steel, [legX, 0.43, legZ], [0.055, 0.86, 0.055])
  }

  function deskLamp([x, y, z]: Dimensions, target: Dimensions) {
    box(root, steel, [x, y + 0.018, z], [0.21, 0.033, 0.19])
    box(root, steel, [x, y + 0.206, z], [0.031, 0.39, 0.031])
    box(root, steel, [x, y + 0.396, z - 0.065], [0.032, 0.03, 0.16])
    const hood = new Mesh(shade, solid(steel))
    hood.position.set(x, y + 0.376, z - 0.14)
    root.add(hood)
    box(
      root,
      diffuser,
      [x, y + 0.338, z - 0.14],
      [0.15, 0.012, 0.15],
    ).castShadow = false
    spot(root, [x, y + 0.325, z - 0.14], target, 2.1, 1.4)
  }
  if (hasModeledProps)
    spot(root, [x + 0.045, 1.67, z + 0.59], [x + 0.02, 0.9, z + 0.17], 3.8, 1.8)
  else deskLamp([x - 0.18, 0.903, z + 0.58], [x + 0.06, 0.9, z + 0.08])
  deskLamp([-8.24, 0.79, 0.96], [-7.97, 0.78, 0.56])

  const keyboard = paintedMaterial(512, 224, (context) => {
    context.fillStyle = '#383835'
    context.fillRect(0, 0, 512, 224)
    context.font = '13px monospace'
    for (const [row, keys] of [
      '1234567890-=',
      'QWERTYUIOP[]',
      "ASDFGHJKL;'",
      'ZXCVBNM,./',
    ].entries()) {
      for (const [column, key] of [...keys].entries()) {
        const x = 10 + column * 36 + row * 8
        const y = 13 + row * 40
        context.fillStyle = 'WASD'.includes(key) ? '#68665d' : '#4a4943'
        context.fillRect(x, y, 33, 33)
        context.fillStyle = '#c8c2ae'
        context.fillText(key, x + 6, y + 14)
      }
    }
    for (const [x, width] of [
      [15, 55],
      [74, 47],
      [125, 228],
      [357, 58],
      [419, 77],
    ] as const) {
      context.fillStyle = '#4a4943'
      context.fillRect(x, 174, width, 32)
    }
  })
  painted.push(keyboard)

  function deskEquipment(x: number, z: number) {
    box(root, '#363831', [x + 0.11, 0.792, z - 0.16], [0.72, 0.008, 0.38])
    if (!hasModeledProps) {
      box(root, '#383835', [x + 0.14, 0.816, z - 0.17], [0.52, 0.043, 0.21])
      tabletopPaint(keyboard, [x + 0.14, 0.838, z - 0.17], 0.52, 0.21, Math.PI)
    }
    box(root, steel, [x - 0.77, 0.295, z + 0.13], [0.27, 0.54, 0.45])
    box(root, '#595a50', [x - 0.77, 0.295, z - 0.103], [0.24, 0.5, 0.025])
    for (let row = 0; row < 5; row++)
      box(
        root,
        '#343732',
        [x - 0.77, 0.141 + row * 0.022, z - 0.117],
        [0.18, 0.008, 0.006],
      )
    box(root, '#8c9569', [x - 0.688, 0.45, z - 0.117], [0.019, 0.013, 0.006])
    box(root, '#3a3a33', [x, 0.701, z + 0.31], [1.53, 0.075, 0.13])
    box(root, '#4a4b42', [x - 0.77, 0.6, z + 0.32], [0.041, 0.2, 0.041])
  }
  for (const { x, z } of workshopDesks) deskEquipment(x, z)

  function deskChair(x: number, z: number) {
    const chair = new Group()
    chair.position.set(x, 0, z)
    root.add(chair)
    const fabric = solid('#4c4d43')
    const seat = new Mesh(upholstery, fabric)
    seat.position.y = 0.47
    seat.scale.set(0.54, 0.1, 0.49)
    const back = new Mesh(upholstery, fabric)
    back.position.set(0, 0.78, -0.25)
    back.scale.set(0.48, 0.45, 0.095)
    back.rotation.x = -0.14
    seat.castShadow =
      seat.receiveShadow =
      back.castShadow =
      back.receiveShadow =
        true
    chair.add(seat, back)
    box(chair, steel, [0, 0.25, 0], [0.083, 0.36, 0.083])
    box(chair, steel, [0, 0.57, -0.21], [0.083, 0.27, 0.059]).rotation.x = -0.14
    for (let spoke = 0; spoke < 5; spoke++) {
      const arm = new Group()
      arm.rotation.y = (spoke * 2 * Math.PI) / 5
      chair.add(arm)
      box(arm, steel, [0, 0.076, 0.145], [0.044, 0.036, 0.29])
      const wheel = new Mesh(caster, solid('#292b27'))
      wheel.position.set(0, 0.043, 0.255)
      wheel.rotation.z = Math.PI / 2
      arm.add(wheel)
    }
    return { chair, shadow: contactShadow(x, z, 0.91, 0.91) }
  }
  const chairs = workshopChairs.map(({ x, z }) => deskChair(x, z))

  function updateVisitor(
    positions: readonly Point[],
    inside: boolean,
    doorAngle: number,
    unlocked: boolean,
  ) {
    for (const [index, { chair, shadow }] of chairs.entries()) {
      const point = positions[index]
      if (!point) continue
      chair.position.set(point.x, 0, point.z)
      shadow.position.set(point.x, 0.003, point.z)
    }
    door.rotation.y = doorAngle
    const status = unlocked ? '#78b28a' : '#c55d41'
    accessLight.color.set(status)
    accessLight.emissive.set(status)
    ceilingLight.intensity = inside || doorAngle < 0 ? 16 : 0
  }

  function dispose() {
    unit.dispose()
    face.dispose()
    for (const panel of facadePanels) panel.dispose()
    shade.dispose()
    upholstery.dispose()
    caster.dispose()
    accessLight.dispose()
    diffuser.dispose()
    floorShadow.map?.dispose()
    floorShadow.dispose()
    for (const material of materials.values()) material.dispose()
    for (const material of painted) {
      material.map?.dispose()
      material.dispose()
    }
  }

  return {
    root,
    roof,
    front,
    back,
    left,
    right,
    pavement,
    box,
    door,
    keypad,
    chairs: chairs.map(({ chair }) => chair),
    updateVisitor,
    dispose,
  }
}
