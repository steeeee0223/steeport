import {
  ACESFilmicToneMapping,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  OrthographicCamera,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  Plane,
  Raycaster,
  SRGBColorSpace,
  Scene,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import {
  type Annex,
  type BuildCamera,
  type BuildPreview,
  type BuildTool,
  annexEdge,
  annexFront,
  annexSize,
  cafeEntryOpen,
  cellPoint,
  edgeAt,
  isEdgeTool,
  pointCell,
  starterFront,
  starterSize,
} from './annex'
import { annexVisuals } from './annex-visuals'
import { type Cafe, layout } from './cafe'
import { laptopScreen } from './laptop-screen'
import { leoVisuals } from './leo-visuals'
import { loadModel } from './load-model'
import { notebookCover } from './notebook-cover'
import { propVisuals } from './prop-visuals'
import {
  type Placeable,
  type PropId,
  canReachSurface,
  inReach,
  petHand,
  placed,
  propIds,
} from './props'
import { televisionModel } from './television'
import { type Point, position } from './visitor'
import { visitorVisuals } from './visitor-visuals'
import { windowBreeze } from './window-breeze'

export async function loadView(
  viewport: HTMLElement,
  onFailure: () => void,
  requestDraw: () => void,
) {
  const loader = new GLTFLoader()
  const immersive = document.body.classList.contains('immersive')
  const base = import.meta.env.BASE_URL
  const useDepthStreet =
    new URLSearchParams(location.search).get('street') === 'depth'
  const [gltf, exterior, irradiance, leoAsset] = await Promise.all([
    loadModel(loader, base + 'cafe.glbz'),
    loadModel(
      loader,
      base + (useDepthStreet ? 'studies/street-depth.glbz' : 'street.glbz'),
    ).catch(() => null),
    new TextureLoader()
      .loadAsync(base + 'room-irradiance.png')
      .catch(() => null),
    loadModel(loader, base + 'models/leo.glbz'),
  ])
  const room = gltf.scene
  const catRoot = new Group()
  catRoot.name = 'Leo'
  room.add(catRoot)
  const leo = leoVisuals(catRoot, leoAsset.scene)
  const lightMaps = [irradiance, irradiance?.clone()]
  for (const [index, map] of lightMaps.entries()) {
    if (!map) continue
    map.channel = index + 1
    map.colorSpace = SRGBColorSpace
    map.flipY = false
    map.needsUpdate = true
  }
  function node(name: string) {
    const object = room.getObjectByName(name)
    if (!object) throw new Error('Missing café model node ' + name)
    return object
  }

  const front = node('WallFront')
  const plaster = node('FrontPlaster')
  const rightWall = node('WallRight')
  const rightPanels = {
    plaster: node('Right_plaster'),
    baseboard: node('Baseboard001'),
  }
  const walls = [front, node('WallBack'), node('WallLeft'), rightWall]
  const ceiling = node('Ceiling')
  const street = node('Street')
  if (useDepthStreet && exterior) {
    exterior.scene.traverse((object) => {
      if (
        object instanceof Mesh &&
        object.material instanceof MeshStandardMaterial
      ) {
        object.material = new MeshBasicMaterial({
          map: object.material.map,
          alphaTest: 0.42,
          toneMapped: false,
        })
      }
    })
  }
  if (exterior) street.add(exterior.scene)

  const avatar = visitorVisuals(node)
  const visitor = avatar.root
  const art = node('Framed_print')
  const props = propVisuals(node)
  const television = televisionModel(node('Window_desk'), requestDraw)
  viewport.append(television.video)
  const tvSpot = layout.props.television
  television.root.position.set(tvSpot.x, tvSpot.y, tvSpot.z)
  television.root.rotation.y = MathUtils.degToRad(20)
  node('Window_plant').removeFromParent()
  room.add(television.root)
  const targets = { ...props.targets, television: television.root }
  const screen = laptopScreen()
  node('LaptopHinge').add(screen.mesh)
  const animated = new Set(props.dynamic)
  const ring = new Mesh(
    new CircleGeometry(0.32, 16),
    new MeshBasicMaterial({
      color: '#e5b56d',
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
    }),
  )
  ring.rotation.x = -Math.PI / 2

  const renderer = new WebGLRenderer({ antialias: true, alpha: false })
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  const canvas = renderer.domElement
  canvas.setAttribute('aria-label', 'Café view. Drag to turn the camera.')
  canvas.setAttribute('role', 'img')
  canvas.addEventListener('webglcontextlost', onFailure)
  viewport.prepend(canvas)

  const scene = new Scene()
  const annex = annexVisuals(node, rightPanels)
  scene.add(room, ring, annex.root)
  const studio = new RoomEnvironment()
  const pmrem = new PMREMGenerator(renderer)
  const reflections = pmrem.fromScene(studio, 0.12, 0.1, 100, { size: 64 })
  studio.dispose()
  pmrem.dispose()
  scene.environment = reflections.texture
  const ambient = new HemisphereLight(0xfff2e3, 0x9c8068, 0.84)
  scene.add(ambient)
  const sunlight = new DirectionalLight(0xffe4c6, 3.1)
  sunlight.position.set(-5, 8.6, -9)
  sunlight.target.position.set(0, 0, 1)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(1536, 1536)
  sunlight.shadow.camera.left = -9
  sunlight.shadow.camera.right = 9
  sunlight.shadow.camera.top = 8
  sunlight.shadow.camera.bottom = -7
  sunlight.shadow.normalBias = 0.022
  sunlight.shadow.bias = -0.0002
  scene.add(sunlight, sunlight.target)

  const meshes: Object3D[] = []
  const bounceMaterials = new Map<
    MeshStandardMaterial,
    Map<number, MeshStandardMaterial>
  >()
  function withBounce(material: MeshStandardMaterial, channel: number) {
    const map = lightMaps[channel - 1]
    if (!map) return material
    let variants = bounceMaterials.get(material)
    if (!variants) {
      variants = new Map()
      bounceMaterials.set(material, variants)
    }
    const cached = variants.get(channel)
    if (cached) return cached
    const lit = material.clone()
    lit.lightMap = map
    lit.lightMapIntensity = 4.6
    variants.set(channel, lit)
    return lit
  }
  let bounceEnabled = true
  const liveShadows = [
    props.targets.laptop,
    props.targets.notebook,
    props.targets.charger,
  ]
  const plasterMeshes = new Set<Object3D>()
  const plasterMaterials = new Map<MeshStandardMaterial, MeshStandardMaterial>()
  const fadedPlaster = new Group()
  const fadePlaster: ((opacity: number) => void)[] = []
  const interactives = new Map<Object3D, PropId>()
  const shelfBook = node('ShelfAtlas')
  const chairMeshes = new Map<Object3D, number>()
  const chairs = new Map<number, Object3D>()
  room.traverse((object) => {
    if (!(object instanceof Mesh)) return
    meshes.push(object)
    object.castShadow = true
    object.receiveShadow = true
    const channel: unknown =
      object.userData.irradianceUv ?? object.parent?.userData.irradianceUv
    const geometry: unknown = object.geometry
    const original: unknown = object.material
    if (
      typeof channel === 'number' &&
      (channel === 1 || channel === 2) &&
      geometry instanceof BufferGeometry &&
      geometry.hasAttribute(channel === 1 ? 'uv1' : 'uv2')
    ) {
      if (
        Array.isArray(original) &&
        original.every(
          (material): material is Material => material instanceof Material,
        )
      ) {
        object.material = original.map((material) =>
          material instanceof MeshStandardMaterial
            ? withBounce(material, channel)
            : material,
        )
      } else if (original instanceof MeshStandardMaterial) {
        object.material = withBounce(original, channel)
      }
    }
    const materials: unknown[] = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial && material.aoMap)
        material.aoMapIntensity = 0.58
    }
    for (let parent = object.parent; parent; parent = parent.parent) {
      if (parent === plaster) plasterMeshes.add(object)
      const seatIndex: unknown = parent.userData.seatIndex
      if (typeof seatIndex === 'number') {
        chairMeshes.set(object, seatIndex)
        chairs.set(seatIndex, parent)
      }
      if (
        parent === visitor ||
        parent === catRoot ||
        (animated.has(parent) && !liveShadows.includes(parent))
      )
        object.castShadow = false
      if (parent === shelfBook) interactives.set(object, 'shelf')
      if (parent === props.carriedJournal) interactives.set(object, 'atlas')
      for (const id of propIds) {
        if (parent === targets[id]) interactives.set(object, id)
      }
      if (useDepthStreet && parent === exterior?.scene)
        object.castShadow = false
    }
    if (
      plasterMeshes.has(object) &&
      object.material instanceof MeshStandardMaterial
    ) {
      const original = object.material
      let faded = plasterMaterials.get(original)
      if (!faded) {
        faded = original.clone()
        faded.lightMapIntensity = 0
        faded.transparent = true
        faded.depthWrite = false
        plasterMaterials.set(original, faded)
      }
      const transparent = faded
      fadedPlaster.add(new Mesh(object.geometry, transparent))
      fadePlaster.push((opacity) => {
        transparent.opacity = opacity
        object.material = opacity === 1 ? original : transparent
        object.castShadow = opacity >= 0.8
      })
    }
  })

  const disposeNotebookCover = notebookCover(node('NotebookCover'))
  const breeze = windowBreeze(street)
  const first = new PerspectiveCamera(62, 1, 0.035, 64)
  first.rotation.order = 'YXZ'
  const pixel = new OrthographicCamera(-1, 1, 1, -1, 0.1, 60)
  const pixelBackground = new Color('#c2a783')
  const realisticBackground = new Color('#b7d1dc')
  // This field of view belongs to the visitor, so orbiting or zooming the room
  // does not change which nearby props the visitor can operate.
  const facingLimit = Math.cos(MathUtils.degToRad(60))
  const sightMeshes = meshes.filter((mesh) => {
    for (let parent: Object3D | null = mesh; parent; parent = parent.parent) {
      if (parent === visitor || parent === street || parent === ceiling)
        return false
    }
    return true
  })
  const sightRay = new Raycaster()
  const eye = new Vector3(Infinity, Infinity, Infinity)
  const sightPoint = new Vector3()
  const sightDirection = new Vector3()
  const sightResults = new Map<PropId, boolean>()
  let sightPose = ''
  const ray = new Raycaster()
  const clearanceRay = new Raycaster()
  const down = new Vector3(0, -1, 0)
  const click = new Vector2()
  const annexGround = new Plane(new Vector3(0, 1, 0))
  const annexHit = new Vector3()
  const buildCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 60)
  let framedFloor: Annex['floor'] | undefined
  let roomBounds = measureRoom([])
  let plasterOpacity = 1
  let activeCamera: PerspectiveCamera | OrthographicCamera = first
  let shadowPose = ''
  let seatBlend = 1
  let crouchBlend = 0
  let laptopBlend = 0
  let televisionBlend = 0
  const televisionCenter = television.root.localToWorld(
    new Vector3(-0.035, 0.17, 0.19),
  )
  const televisionEye = television.root.localToWorld(
    new Vector3(-0.035, 0.4, 0.82),
  )
  const televisionViewingDistance = televisionEye.distanceTo(televisionCenter)
  const televisionDirection = televisionEye
    .clone()
    .sub(televisionCenter)
    .normalize()
  const televisionFraming = new Vector3()
  const televisionRotation = first.rotation.clone()
  first.position.copy(televisionEye)
  first.lookAt(televisionCenter)
  televisionRotation.copy(first.rotation)
  const screenView = new Vector3(
    layout.props.laptop.x,
    0.99,
    layout.props.laptop.z + 0.38,
  )
  // The points sit just above small props so the supporting surface does not
  // block the ray. The door's point follows the moving door leaf.
  const sightOffsets: Record<
    Exclude<PropId, 'door'>,
    [number, number, number]
  > = {
    laptop: [0, 0.085, 0.16],
    television: [0, 0.17, 0],
    notebook: [0.1, 0.08, 0],
    charger: [-0.1, 0.06, -0.06],
    shelf: [0, 0.065, 0],
    journal: [0, 0.065, 0],
    water: [0, 0.12, 0],
    cat: [0, 0.19, 0],
    cup: [0, 0.085, 0],
    atlas: [0, 0.055, 0],
  }

  function clearSight(id: PropId, distance: number) {
    const cached = sightResults.get(id)
    if (cached !== undefined) return cached
    sightRay.set(eye, sightDirection.divideScalar(distance))
    sightRay.far = distance
    const obstacle = sightRay
      .intersectObjects(sightMeshes, false)
      .find(({ object, face }) => {
        if (!(object instanceof Mesh) || !hittable(object, true)) return false
        if (interactives.get(object) === id || plasterMeshes.has(object))
          return true
        const material: unknown = object.material
        const surface: unknown = Array.isArray(material)
          ? material[face?.materialIndex ?? 0]
          : material
        return (
          surface instanceof Material &&
          (!surface.transparent || surface.opacity >= 0.5)
        )
      })
    const clear = !obstacle || interactives.get(obstacle.object) === id
    sightResults.set(id, clear)
    return clear
  }

  function facingScore(cafe: Cafe, id: PropId) {
    const { visitor } = cafe
    const { x, z } = position(visitor)
    const eyeHeight =
      visitor.kind === 'seated' ? layout.seat.eye : layout.stand.eye
    const y = eyeHeight - (cafe.crouched ? 0.72 : 0)
    if (eye.x !== x || eye.y !== y || eye.z !== z) {
      eye.set(x, y, z)
      sightResults.clear()
    }
    if (id === 'door') {
      targets.door.localToWorld(sightPoint.set(0.5, 1.38, 0))
    } else {
      const spot =
        id === 'cup' || id === 'atlas'
          ? placed(cafe.props, id)
          : id === 'cat'
            ? cafe.leo
            : layout.props[id]
      if (!spot) return
      const [dx, dy, dz] = sightOffsets[id]
      sightPoint.set(spot.x + dx, spot.y + dy, spot.z + dz)
    }
    const direction = sightDirection.subVectors(sightPoint, eye)
    const horizontalDistance = Math.hypot(direction.x, direction.z)
    const alignment =
      horizontalDistance > 0.025
        ? (-direction.x * Math.sin(visitor.yaw) -
            direction.z * Math.cos(visitor.yaw)) /
          horizontalDistance
        : 1
    if (alignment < facingLimit) return
    const distance = direction.length()
    if (distance < 0.025 || clearSight(id, distance)) return alignment
  }

  function focused(cafe: Cafe, availableProps: Iterable<PropId>) {
    let best: PropId | undefined
    let alignment = -Infinity
    for (const id of availableProps) {
      const score = facingScore(cafe, id)
      if (score === undefined || score <= alignment) continue
      alignment = score
      best = id
    }
    return best
  }

  function measureRoom(floor: Annex['floor']) {
    const left = -layout.room.width / 2
    let near = -layout.room.depth / 2
    let right = floor.length ? annexEdge + starterSize : annexEdge
    let far = floor.length ? starterFront + starterSize : layout.room.depth / 2
    for (const cell of floor) {
      const { x, z } = cellPoint(cell)
      right = Math.max(right, x + 0.5)
      near = Math.min(near, z - 0.5)
      far = Math.max(far, z + 0.5)
    }
    return {
      spanX: right - left,
      spanZ: far - near,
      midX: (right + left) / 2,
      midZ: (far + near) / 2,
    }
  }

  function initialBuildCamera(): BuildCamera {
    return {
      center: {
        x:
          annexEdge +
          (viewport.clientWidth < viewport.clientHeight ? 1.75 : 0.7),
        z: starterFront + 2,
      },
      orbit: Math.PI / 4,
      zoom: 1,
    }
  }

  function buildHalfHeight(aspect: number, zoom: number) {
    return Math.max(3.5, 3.2 / aspect) / zoom
  }

  function framePixel(
    camera: OrthographicCamera,
    orbit: number,
    center: Point,
    halfHeight: number,
    aspect: number,
  ) {
    camera.position.set(
      Math.sin(orbit) * 14 + center.x,
      0.92 + 14 / Math.SQRT2,
      -Math.cos(orbit) * 14 + center.z,
    )
    camera.lookAt(center.x, 0.92, center.z)
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.left = -halfHeight * aspect
    camera.right = -camera.left
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
  }

  function frameBuilder(
    camera: OrthographicCamera,
    build: BuildCamera,
    aspect: number,
  ) {
    framePixel(
      camera,
      build.orbit,
      build.center,
      buildHalfHeight(aspect, build.zoom),
      aspect,
    )
  }

  function framePixelVisit(
    cafe: Cafe,
    p: Point,
    {
      orbit,
      aspect,
      x,
      z,
    }: { orbit: number; aspect: number; x: number; z: number },
  ) {
    const expanded = cafe.annex.floor.length > 0
    const zoomed = cafe.pixelZoom
    if (cafe.annex.floor !== framedFloor) {
      roomBounds = measureRoom(cafe.annex.floor)
      framedFloor = cafe.annex.floor
    }
    const { spanX, spanZ, midX, midZ } = roomBounds
    const extraHeight = expanded
      ? (Math.max(0, spanX - layout.room.width - starterSize) * Math.abs(x) +
          Math.max(
            0,
            spanZ - (starterFront + starterSize + layout.room.depth / 2),
          ) *
            Math.abs(z)) /
        (2 * Math.sqrt(3))
      : 0
    const halfHeight = zoomed
      ? 2.88
      : Math.max(4.38, 6.05 / Math.max(aspect, 0.93)) +
        (expanded ? 1.2 : 0) +
        extraHeight
    const projectedRoom = (spanX * Math.abs(z) + spanZ * Math.abs(x)) / 2
    const followLimit = Math.max(0, projectedRoom + 0.24 - halfHeight * aspect)
    const follow = MathUtils.clamp(
      (p.x - midX) * z - (p.z - midZ) * x,
      -followLimit,
      followLimit,
    )
    const center = {
      x: zoomed ? p.x : midX + z * follow,
      z: zoomed ? p.z : midZ - x * follow,
    }
    framePixel(pixel, orbit, center, halfHeight, aspect)
  }

  function draw(
    cafe: Cafe,
    now: number,
    dt: number,
    stride: number,
    reduce: boolean,
    buildPreview: BuildPreview | undefined,
  ) {
    const televisionMoving = television.update(now, dt, reduce)
    const retro = cafe.view === 'pixel'
    const width = viewport.clientWidth
    const height = viewport.clientHeight
    if (!width || !height) return { moving: false, wakeAt: Infinity }

    const density = retro
      ? Math.min(0.86, 560 / width)
      : Math.min(devicePixelRatio, 1.65)
    const bufferWidth = Math.floor(width * density)
    const bufferHeight = Math.floor(height * density)
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      renderer.setSize(bufferWidth, bufferHeight, false)
    }

    const p = position(cafe.visitor)
    const seated = cafe.visitor.kind === 'seated'
    const targetPose = seated ? 1 : 0
    const targetCrouch = cafe.crouched ? 1 : 0
    const targetLaptop = cafe.screenFocus?.kind === 'laptop' ? 1 : 0
    const targetTelevision = cafe.screenFocus?.kind === 'television' ? 1 : 0
    const settleCamera = (from: number, to: number) =>
      reduce || Math.abs(to - from) < 0.004
        ? to
        : MathUtils.damp(from, to, 12, dt || 1 / 60)
    crouchBlend = settleCamera(crouchBlend, targetCrouch)
    laptopBlend = settleCamera(laptopBlend, targetLaptop)
    televisionBlend = settleCamera(televisionBlend, targetTelevision)
    seatBlend =
      reduce || Math.abs(targetPose - seatBlend) < 0.004
        ? targetPose
        : MathUtils.damp(seatBlend, targetPose, 14, dt || 1 / 60)
    visitor.visible = ring.visible = retro
    ring.position.set(p.x, 0.012, p.z)
    const cat = leo.update(cafe, now, dt, reduce)
    const hand = petHand(cafe.props)
    const pet =
      retro &&
      targetCrouch &&
      hand !== undefined &&
      cat.pet > 0 &&
      stride === 0 &&
      inReach(cafe, 'cat')
        ? {
            point: leo.petPoint(p.x, p.z, cat.backHeight, now),
            amount: cat.pet,
            side: hand,
            yaw: Math.atan2(p.x - cafe.leo.x, p.z - cafe.leo.z),
          }
        : undefined
    const avatarMoving = avatar.body(
      cafe.visitor,
      Boolean(cafe.crouched),
      retro ? stride : 0,
      dt,
      reduce || !retro,
      pet,
    )
    const wind = breeze.update(now, !retro && !reduce && !cafe.screenFocus)
    const propsMoving = props.update(
      cafe,
      now,
      dt,
      reduce,
      retro
        ? {
            carry: avatar.carryHeight(),
            sip: avatar.sipHeight(),
            yaw: avatar.heading(),
          }
        : null,
    )
    const armsMoving =
      retro && avatar.arms(props.leftGrip(), props.rightGrip(), dt, reduce, pet)
    for (const [index, chair] of chairs) {
      const spot = cafe.chairPositions?.[index]
      if (spot) chair.position.set(spot.x, 0, spot.z)
    }

    ceiling.visible = street.visible = !retro
    scene.background = retro ? pixelBackground : realisticBackground
    renderer.toneMappingExposure = retro ? 1.15 : 1.24
    ambient.intensity = retro ? 1.9 : irradiance ? 0.67 : 1.35
    scene.environmentIntensity = retro ? 0.16 : 0.22
    if (bounceEnabled === retro) {
      bounceEnabled = !retro
      for (const variants of bounceMaterials.values()) {
        for (const material of variants.values()) {
          material.lightMapIntensity = bounceEnabled ? 4.6 : 0
        }
      }
    }

    const orbit = buildPreview?.camera.orbit ?? cafe.orbit
    plasterOpacity = retro
      ? MathUtils.lerp(
          1,
          0.13,
          MathUtils.smoothstep(Math.cos(orbit), 0.05, 0.55),
        )
      : 1
    for (const fade of fadePlaster) fade(plasterOpacity)

    const x = Math.sin(orbit)
    const z = -Math.cos(orbit)
    if (retro) {
      for (const [i, visible] of [
        true,
        z < 0.14,
        x > -0.14,
        x < 0.14,
      ].entries()) {
        const wall = walls[i]
        if (wall) wall.visible = visible
      }
      art.visible = z < 0.14
      const aspect = width / height
      if (buildPreview) frameBuilder(pixel, buildPreview.camera, aspect)
      else framePixelVisit(cafe, p, { orbit, aspect, x, z })
      activeCamera = pixel
    } else {
      for (const wall of walls) wall.visible = true
      art.visible = true
      first.position.set(
        p.x,
        MathUtils.lerp(layout.stand.eye, layout.seat.eye, seatBlend) -
          0.72 * crouchBlend,
        p.z,
      )
      first.position.lerp(screenView, laptopBlend)
      const yaw = cafe.visitor.yaw
      const angle = Math.atan2(Math.sin(yaw), Math.cos(yaw))
      first.rotation.set(
        cafe.visitor.pitch * (1 - laptopBlend),
        angle * (1 - laptopBlend),
        0,
      )
      const televisionFov = width / height < 1.1 ? 56 : 37
      const televisionDistance = Math.max(
        televisionViewingDistance,
        0.55 /
          (2 *
            Math.tan(MathUtils.degToRad(televisionFov / 2)) *
            (width / height)),
      )
      televisionFraming
        .copy(televisionCenter)
        .addScaledVector(televisionDirection, televisionDistance)
      first.position.lerp(televisionFraming, televisionBlend)
      first.rotation.x = MathUtils.lerp(
        first.rotation.x,
        televisionRotation.x,
        televisionBlend,
      )
      first.rotation.y = MathUtils.lerp(
        first.rotation.y,
        televisionRotation.y,
        televisionBlend,
      )
      first.aspect = width / height
      first.fov = MathUtils.lerp(
        width / height < 1.1 ? 85 : immersive ? 76 : 62,
        51,
        laptopBlend,
      )
      first.fov = MathUtils.lerp(first.fov, televisionFov, televisionBlend)
      first.updateProjectionMatrix()
      activeCamera = first
    }
    const annexChanged = annex.draw(
      cafe.annex,
      buildPreview,
      retro ? { x, z } : undefined,
      rightWall.visible,
    )
    rightPanels.plaster.visible = rightPanels.baseboard.visible =
      !cafeEntryOpen(cafe.annex)

    const furniturePose = [
      props.doorAngle(),
      cafe.props.laptopOpen,
      props.notebookShadowPose(),
      cafe.props.pluggedIn,
      ...(cafe.chairPositions?.flatMap(({ x, z }) => [x, z]) ?? []),
    ].join()

    // Reuse the shadow map until a visible caster or the cutaway changes.
    const nextShadowPose = [
      retro,
      plasterOpacity >= 0.8,
      furniturePose,
      ...walls.map((wall) => wall.visible),
      cafe.annex.partitions.length > 0 && (buildPreview ? '' : orbit),
    ].join()
    renderer.shadowMap.needsUpdate =
      annexChanged || shadowPose !== nextShadowPose || (!retro && propsMoving)
    shadowPose = nextShadowPose
    renderer.render(scene, activeCamera)

    // Ignore distant animation and changes to the render camera when nearby
    // geometry has stayed put. Movement of the visitor's eye is checked above.
    const catIsNearby = Math.hypot(cafe.leo.x - p.x, cafe.leo.z - p.z) < 2.8
    const sightGeometryMoving = propsMoving || (catIsNearby && cat.moving)
    const cup = placed(cafe.props, 'cup')
    const book = placed(cafe.props, 'atlas')
    const nextSightPose = [
      furniturePose,
      cafe.props.water.kind,
      cup?.x,
      cup?.y,
      cup?.z,
      cafe.props.shelfBook.kind,
      book?.x,
      book?.y,
      book?.z,
      catIsNearby,
      sightGeometryMoving,
    ].join()
    if (nextSightPose !== sightPose || sightGeometryMoving) {
      sightPose = nextSightPose
      sightResults.clear()
    }

    return {
      moving:
        televisionMoving ||
        propsMoving ||
        cat.moving ||
        wind.moving ||
        avatarMoving ||
        armsMoving ||
        seatBlend !== targetPose ||
        crouchBlend !== targetCrouch ||
        laptopBlend !== targetLaptop ||
        televisionBlend !== targetTelevision,
      wakeAt: Math.min(cat.wakeAt, wind.wakeAt),
    }
  }

  function hittable(object: Object3D, visitorSight = false) {
    if (!visitorSight && plasterOpacity < 0.4 && plasterMeshes.has(object))
      return false
    for (let parent: Object3D | null = object; parent; parent = parent.parent) {
      if (
        (!parent.visible &&
          !(visitorSight && (walls.includes(parent) || parent === art))) ||
        parent === props.carried ||
        props.flyingBooks.has(parent)
      )
        return false
    }
    return true
  }

  function firstHit(caster: Raycaster, placing = false) {
    return caster
      .intersectObjects(meshes, false)
      .find(
        ({ object }) =>
          hittable(object) && !(placing && object.userData.placement_ignore),
      )
  }

  type PointerPosition = Pick<PointerEvent, 'clientX' | 'clientY'>

  function aim(event: PointerPosition) {
    const bounds = canvas.getBoundingClientRect()
    return click.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    )
  }

  function pick(event: PointerEvent) {
    ray.setFromCamera(aim(event), activeCamera)
    const hit = firstHit(ray)
    if (hit) return interactives.get(hit.object)
  }

  function aimBuild(
    camera: BuildCamera,
    event: PointerPosition,
    bounded: boolean,
  ) {
    const pointer = aim(event)
    if (bounded && (Math.abs(pointer.x) > 1 || Math.abs(pointer.y) > 1))
      return false
    const aspect = viewport.clientWidth / viewport.clientHeight
    frameBuilder(buildCamera, camera, aspect)
    ray.setFromCamera(pointer, buildCamera)
    return true
  }

  function pickBuildTarget(
    camera: BuildCamera,
    event: PointerEvent,
    tool: BuildTool,
  ) {
    if (!aimBuild(camera, event, true)) return
    if (tool === 'remove') {
      const cell = annex.pickFurniture(ray)
      if (cell !== undefined) return cell
    }
    if (tool === 'erase-wall') {
      const edge = annex.pickPartition(ray)
      if (edge !== undefined) return edge
    }
    const point = ray.ray.intersectPlane(annexGround, annexHit)
    if (point) return isEdgeTool(tool) ? edgeAt(point) : pointCell(point)
  }

  function buildGround(
    camera: BuildCamera,
    event: PointerPosition,
    bounded = true,
  ): Point | undefined {
    if (!aimBuild(camera, event, bounded)) return
    const hit = ray.ray.intersectPlane(annexGround, annexHit)
    return hit ? { x: hit.x, z: hit.z } : undefined
  }

  function offsetBuild(
    camera: BuildCamera,
    start: Point,
    end: Point,
  ): BuildCamera {
    const { center } = camera
    return {
      ...camera,
      center: {
        x: MathUtils.clamp(
          center.x + start.x - end.x,
          annexEdge + 0.5,
          annexEdge + annexSize - 0.5,
        ),
        z: MathUtils.clamp(
          center.z + start.z - end.z,
          annexFront + 0.5,
          annexFront + annexSize - 0.5,
        ),
      },
    }
  }

  function panBuild(
    camera: BuildCamera,
    from: PointerPosition,
    to: PointerPosition,
  ) {
    const start = buildGround(camera, from, false)
    const end = buildGround(camera, to, false)
    return start && end ? offsetBuild(camera, start, end) : camera
  }

  function zoomBuild(
    camera: BuildCamera,
    factor: number,
    at?: PointerPosition,
  ) {
    const zoom = MathUtils.clamp(camera.zoom * factor, 0.36, 2.8)
    if (zoom === camera.zoom) return camera
    const next = { ...camera, zoom }
    const start = at && buildGround(camera, at)
    const end = at && buildGround(next, at)
    return start && end ? offsetBuild(next, start, end) : next
  }

  function revealBuildPoint(camera: BuildCamera, point: Point) {
    const aspect = viewport.clientWidth / viewport.clientHeight
    frameBuilder(buildCamera, camera, aspect)
    const projected = annexHit.set(point.x, 0, point.z).project(buildCamera)
    return Math.abs(projected.x) > 0.8 ||
      projected.y < -0.48 ||
      projected.y > 0.78
      ? { ...camera, center: point }
      : camera
  }

  function useTelevision(event: PointerEvent) {
    ray.setFromCamera(aim(event), activeCamera)
    const hit = firstHit(ray)
    if (!hit || interactives.get(hit.object) !== 'television') return false
    if (!television.dialAction(hit.object)) television.togglePlayback()
    return true
  }

  function useScreen(event: PointerEvent) {
    ray.setFromCamera(aim(event), activeCamera)
    const hit = firstHit(ray)
    if (hit?.object !== screen.mesh) return false
    if (hit.uv) screen.choose(hit.uv)
    return true
  }

  function pickChair(event: PointerEvent) {
    ray.setFromCamera(aim(event), activeCamera)
    const hit = firstHit(ray)
    return hit && chairMeshes.get(hit.object)
  }

  function findPlacement(cafe: Cafe, item: Placeable, event?: PointerEvent) {
    const halfX = item === 'cup' ? 0.058 : 0.086
    const halfZ = item === 'cup' ? 0.058 : 0.124
    const offsets = event
      ? [aim(event)]
      : [
          new Vector2(),
          ...[-0.25, 0.25, -0.5, 0.5].flatMap((y) =>
            [0, -0.22, 0.22, -0.44, 0.44].map((x) => new Vector2(x, y)),
          ),
        ]
    for (const offset of offsets) {
      ray.setFromCamera(offset, activeCamera)
      const hit = firstHit(ray, true)
      if (!hit?.object.userData.placement_surface || !hit.face) continue
      if (
        hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y <
        0.97
      )
        continue
      const spot = hit.point
      if (!canReachSurface(cafe, spot)) continue
      const footprint = [-1, -0.5, 0, 0.5, 1]
      const clear = footprint.every((x) =>
        footprint.every((z) => {
          clearanceRay.set(
            new Vector3(spot.x + x * halfX, spot.y + 0.33, spot.z + z * halfZ),
            down,
          )
          const ground = firstHit(clearanceRay, true)
          return (
            ground?.object === hit.object &&
            Math.abs(ground.point.y - spot.y) < 0.003
          )
        }),
      )
      if (clear) return spot
    }
  }

  const shaderWarmup = window.requestIdleCallback?.(() => {
    if (activeCamera === pixel) return
    void renderer.compileAsync(scene, pixel)
    // The transparent cutaway material is absent from the first-person scene.
    void renderer.compileAsync(fadedPlaster, pixel, scene)
  })

  function dispose() {
    if (shaderWarmup !== undefined) window.cancelIdleCallback(shaderWarmup)
    canvas.removeEventListener('webglcontextlost', onFailure)
    for (const map of lightMaps) map?.dispose()
    for (const variants of bounceMaterials.values()) {
      for (const material of variants.values()) material.dispose()
    }
    screen.dispose()
    television.dispose()
    disposeNotebookCover?.()
    leo.dispose()
    breeze.dispose()
    annex.dispose()
    reflections.dispose()
    renderer.dispose()
    canvas.remove()
  }

  return {
    canvas,
    television,
    draw,
    pick,
    pickBuildTarget,
    buildGround,
    initialBuildCamera,
    panBuild,
    zoomBuild,
    revealBuildPoint,
    pickChair,
    useScreen,
    useTelevision,
    readScreen: screen.draw,
    screenSelection: screen.selected,
    findPlacement,
    dispose,
    animate: (id: 'cat' | 'water', now: number) =>
      id === 'cat' ? leo.pet(now) : props.pour(now),
    turnNotebook: props.turnNotebook,
    sip: props.sip,
    canSee: (cafe: Cafe, id: PropId) => facingScore(cafe, id) !== undefined,
    focused,
  }
}
