import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  CanvasTexture,
  Group,
  InterleavedBufferAttribute,
  Material,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three'

import { htmlInCanvas } from './html-in-canvas'
import type { Point } from './visitor'
import {
  type WorkshopMonitor,
  insideWorkshop,
  workshopDesks,
  workshopMonitorIds,
  workshopMonitors,
} from './workshop-layout'
import { workshopRoom } from './workshop-room'

function frameDisplay(display: Object3D) {
  const geometry: unknown = display instanceof Mesh && display.geometry
  if (!(geometry instanceof BufferGeometry))
    throw new Error('Missing workshop display geometry')
  display.updateWorldMatrix(true, false)
  const bounds = new Box3().setFromObject(display, true)
  const size = bounds.getSize(new Vector3())
  const outward = new Vector3()
  const normals: unknown = geometry.getAttribute('normal')
  if (
    !(normals instanceof BufferAttribute) &&
    !(normals instanceof InterleavedBufferAttribute)
  )
    throw new Error('Missing workshop display normals')
  for (let i = 0; i < normals.count; i++) {
    outward.x += normals.getX(i)
    outward.y += normals.getY(i)
    outward.z += normals.getZ(i)
  }
  const position: unknown = geometry.getAttribute('position')
  if (
    !(position instanceof BufferAttribute) &&
    !(position instanceof InterleavedBufferAttribute)
  )
    throw new Error('Missing workshop display positions')
  const points = Array.from({ length: position.count }, (_, index) =>
    new Vector3()
      .fromBufferAttribute(position, index)
      .applyMatrix4(display.matrixWorld),
  )
  const projected = new Vector3()
  const projectedBounds = new Box3()
  function project(camera: Camera, viewport: DOMRect) {
    const bounds = projectedBounds.makeEmpty()
    for (const point of points)
      bounds.expandByPoint(projected.copy(point).project(camera))
    return new DOMRect(
      viewport.left + ((bounds.min.x + 1) * viewport.width) / 2,
      viewport.top + ((1 - bounds.max.y) * viewport.height) / 2,
      ((bounds.max.x - bounds.min.x) * viewport.width) / 2,
      ((bounds.max.y - bounds.min.y) * viewport.height) / 2,
    )
  }
  return {
    center: bounds.getCenter(new Vector3()),
    outward: outward.transformDirection(display.matrixWorld),
    frameWidth: Math.hypot(size.x, size.z) * 1.24,
    frameHeight: size.y * 1.38,
    project,
  }
}

export function workshopVisuals(
  requestDraw: () => void,
  source?: Object3D,
  props?: Object3D,
) {
  const room = workshopRoom(Boolean(props))
  const { root, box } = room
  if (props) {
    props.traverse((part) => {
      if (part instanceof Mesh) part.castShadow = part.receiveShadow = true
    })
    root.add(props)
  }
  const safe = props?.getObjectByName('Steel_office_safe')
  const safeDoor = safe?.getObjectByName('Workshop_safe_door')
  const safePoint = safe?.getWorldPosition(new Vector3())
  const plane = new PlaneGeometry()
  const disposePreviews = new Set<() => void>()

  const displays: { texture: CanvasTexture; material: MeshBasicMaterial }[] = []
  function displayTexture(
    canvasWidth: number,
    canvasHeight: number,
    gltf = false,
  ) {
    const canvas = document.createElement('canvas')
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Workshop display unavailable')
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    texture.flipY = !gltf
    texture.anisotropy = 4
    const material = new MeshBasicMaterial({ map: texture, toneMapped: false })
    displays.push({ texture, material })
    return { canvas, context, material, texture }
  }

  interface Screen {
    mesh: Mesh
    monitor: Object3D
    frame: ReturnType<typeof frameDisplay>
    width: number
    height: number
    idle: MeshBasicMaterial
    live?: ReturnType<typeof displayTexture>
  }

  const metal = '#353b39'
  const wood = '#805f45'

  function fallbackScreens() {
    for (const { x, z, width, depth } of workshopDesks) {
      box(root, wood, [x, 0.76, z], [width, 0.075, depth])
      for (const dx of [-1, 1])
        for (const dz of [-1, 1])
          box(
            root,
            metal,
            [x + dx * (width / 2 - 0.1), 0.36, z + dz * 0.29],
            [0.07, 0.72, 0.07],
          )
      box(root, metal, [x + 0.33, 0.815, z - 0.23], [0.09, 0.035, 0.11])
    }
    return workshopMonitors.map(({ x, y, z }) => {
      const monitor = new Group()
      root.add(monitor)
      box(monitor, metal, [x, y, z + 0.085], [0.82, 0.52, 0.18])
      box(monitor, metal, [x, 0.93, z + 0.1], [0.11, 0.29, 0.11])
      box(monitor, metal, [x, 0.81, z + 0.06], [0.36, 0.033, 0.24])
      const width = 960
      const height = 552
      const idle = displayTexture(width, height)
      const mesh = new Mesh(plane, idle.material)
      mesh.position.set(x, y, z - 0.009)
      mesh.scale.set(0.73, 0.42, 1)
      mesh.rotation.y = Math.PI
      monitor.add(mesh)
      return {
        mesh,
        monitor,
        frame: frameDisplay(mesh),
        width,
        height,
        idle,
      }
    })
  }

  function modeledScreens(model: Object3D) {
    const stations = workshopDesks.map(({ x, z }, index) => {
      const station = model.clone()
      station.position.set(x, 0, z)
      for (const name of [
        'Chair',
        'Computer',
        'Desk_mat',
        'Keyboard',
        'Left_speaker',
        'Right_speaker',
      ])
        station.getObjectByName(name)?.removeFromParent()
      if (index === 0) {
        for (const name of [
          'Portrait_monitor',
          'Monitor_arm_A',
          'Monitor_arm_B',
        ])
          station.getObjectByName(name)?.removeFromParent()
      }
      station.traverse((part) => {
        if (part instanceof Mesh && !part.name.endsWith('_display'))
          part.castShadow = part.receiveShadow = true
      })
      root.add(station)
      return station
    })
    return (
      [
        [stations[0], 'Landscape', 1320, 546],
        [stations[1], 'Landscape', 1320, 546],
        [stations[1], 'Portrait', 636, 1140],
      ] as const
    ).map(([station, orientation, width, height]) => {
      const monitor = station?.getObjectByName(orientation + '_monitor')
      const mesh = monitor?.getObjectByName(orientation + '_display')
      if (
        !monitor ||
        !(mesh instanceof Mesh) ||
        !(mesh.material instanceof Material)
      )
        throw new Error('Missing workshop display ' + orientation)
      return {
        mesh,
        monitor,
        frame: frameDisplay(mesh),
        width,
        height,
        idle: displayTexture(width, height, true),
      }
    })
  }

  const idleWindows = [
    [
      'bench@steeport — zsh',
      'bench@steeport ~ % ./check-device',
      '',
      '12:41  adapter detected on usb0',
      '12:41  firmware build 042',
      '12:41  reading sensor data…',
      '',
      'bench@steeport ~ % ▍',
    ],
    [
      'bench@steeport — device.ts',
      "import { readFrame } from './serial'",
      '',
      'const port = await connect(115200)',
      'for await (const frame of port) {',
      '  const sample = readFrame(frame)',
      '  if (sample.valid) log(sample)',
      '}',
    ],
    [
      'bench@steeport — test results',
      '12:41  Power-on   OK',
      '12:41  USB link   OK',
      '12:42  Serial I/O OK',
      '',
      'Voltage      3.31 V',
      'Samples         128',
      'Frame errors      0',
      '',
      'Waiting for next run…',
    ],
  ] as const
  const screens: Screen[] = (
    source ? modeledScreens(source) : fallbackScreens()
  ).map(({ idle, ...screen }, index) => {
    const [title, ...lines] = idleWindows[index] ?? idleWindows[0]
    const { canvas, context, texture, material } = idle
    context.fillStyle = '#18181e'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#33313b'
    context.fillRect(0, 0, canvas.width, 62)
    context.font = '27px ui-monospace, Menlo, monospace'
    context.textBaseline = 'top'
    context.fillStyle = '#e6e6ec'
    context.fillText(title, 25, 16)
    for (const [row, line] of lines.entries())
      context.fillText(line, 25, 84 + row * 38, canvas.width - 50)
    texture.needsUpdate = true

    canvas.className = 'workshop-texture-source'
    canvas.inert = true
    const terminal = document.createElement('div')
    terminal.className = 'terminal-window'
    const bar = document.createElement('header')
    bar.className = 'terminal-bar'
    const icon = document.createElement('span')
    icon.className = 'terminal-icon'
    icon.textContent = '>_'
    const heading = document.createElement('h2')
    heading.textContent = title
    bar.append(icon, heading)
    const body = document.createElement('div')
    body.className = 'terminal-body'
    const output = document.createElement('pre')
    output.className = 'terminal-output'
    output.textContent = lines.join('\n')
    body.append(output)
    terminal.append(bar, body)
    function disposePreview() {
      capture?.dispose()
      terminal.remove()
      canvas.remove()
      disposePreviews.delete(disposePreview)
    }
    const capture = htmlInCanvas(canvas, terminal, () => {
      texture.needsUpdate = true
      disposePreview()
      requestDraw()
    })
    if (capture) {
      canvas.style.width = `${canvas.width / 2}px`
      canvas.style.height = `${canvas.height / 2}px`
      canvas.append(terminal)
      document.body.append(canvas)
      disposePreviews.add(disposePreview)
      capture.requestPaint()
    }
    return { ...screen, idle: material }
  })

  function showScreen(active?: WorkshopMonitor) {
    for (const [index, { mesh, idle, live }] of screens.entries())
      mesh.material = index === active ? (live?.material ?? idle) : idle
  }

  function updateScreen(
    index: WorkshopMonitor,
    sourceCanvas: HTMLCanvasElement,
  ) {
    const screen = screens[index]
    if (!screen) return
    screen.live ??= displayTexture(screen.width, screen.height, Boolean(source))
    const { context, canvas, texture } = screen.live
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height)
    texture.needsUpdate = true
  }

  function dispose() {
    for (const disposePreview of disposePreviews) disposePreview()
    room.dispose()
    plane.dispose()
    const resources = new Set<{ dispose(): void }>()
    for (const model of [source, props])
      model?.traverse((part) => {
        if (!(part instanceof Mesh)) return
        const geometry: unknown = part.geometry
        if (geometry instanceof BufferGeometry) resources.add(geometry)
        const materials: unknown[] = Array.isArray(part.material)
          ? part.material
          : [part.material]
        for (const material of materials) {
          if (!(material instanceof Material)) continue
          resources.add(material)
          const values: unknown[] = Object.values(material)
          for (const value of values)
            if (value instanceof Texture) resources.add(value)
        }
      })
    for (const resource of resources) resource.dispose()
    for (const { texture, material } of displays) {
      texture.dispose()
      material.dispose()
    }
  }

  function monitorFor(object: Object3D): WorkshopMonitor | undefined {
    for (let part: Object3D | null = object; part; part = part.parent) {
      const id = workshopMonitorIds.find((id) => screens[id]?.monitor === part)
      if (id !== undefined) return id
    }
  }

  function isDoorControl(object: Object3D) {
    for (let part: Object3D | null = object; part; part = part.parent)
      if (part === room.keypad || part === room.door) return true
    return false
  }

  function nearSafe(point: Point) {
    return Boolean(
      safeDoor &&
      safePoint &&
      insideWorkshop(point) &&
      point.x > safePoint.x + 0.2 &&
      Math.hypot(point.x - safePoint.x - 0.17, point.z - safePoint.z) < 1.24,
    )
  }

  function isSafeControl(object: Object3D) {
    if (!safeDoor) return false
    for (let part: Object3D | null = object; part; part = part.parent)
      if (part === safe) return true
    return false
  }

  function updateSafe(open: boolean, dt: number, reduce: boolean) {
    if (!safeDoor) return false
    const target = open ? MathUtils.degToRad(-105) : 0
    const current = safeDoor.rotation.y
    safeDoor.rotation.y =
      reduce || Math.abs(target - current) < 0.004
        ? target
        : MathUtils.damp(current, target, 10, dt || 1 / 60)
    return safeDoor.rotation.y !== target
  }

  function chairFor(object: Object3D) {
    for (let part: Object3D | null = object; part; part = part.parent) {
      const index = room.chairs.findIndex((chair) => chair === part)
      if (index !== -1) return index
    }
  }

  return {
    root,
    roof: room.roof,
    front: room.front,
    back: room.back,
    left: room.left,
    right: room.right,
    pavement: room.pavement,
    isDoorControl,
    isSafeControl,
    nearSafe,
    updateSafe,
    safeAngle: () => safeDoor?.rotation.y,
    chairFor,
    updateVisitor: room.updateVisitor,
    frames: screens.map(({ frame }) => frame),
    updateScreen,
    showScreen,
    dispose,
    monitorFor,
  }
}
