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

import { type Cafe, layout } from './cafe'
import { laptopScreen } from './laptop-screen'
import { misoVisuals } from './miso-visuals'
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
import { position } from './visitor'
import { visitorVisuals } from './visitor-visuals'
import { windowBreeze } from './window-breeze'

async function loadModel(loader: GLTFLoader, url: string) {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`Could not load café model (${response.status}): ${url}`)
  if (response.body && typeof DecompressionStream === 'function') {
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'))
    return loader.parseAsync(await new Response(stream).arrayBuffer(), '')
  }
  const { gunzipSync } = await import('three/addons/libs/fflate.module.js')
  const compressed = new Uint8Array(await response.arrayBuffer())
  return loader.parseAsync(Uint8Array.from(gunzipSync(compressed)).buffer, '')
}

export async function loadView(viewport: HTMLElement, onFailure: () => void) {
  const loader = new GLTFLoader()
  const immersive = document.body.classList.contains('immersive')
  const base = import.meta.env.BASE_URL
  const useDepthStreet =
    new URLSearchParams(location.search).get('street') === 'depth'
  const [gltf, exterior, irradiance] = await Promise.all([
    loadModel(loader, base + 'cafe.glbz'),
    loadModel(
      loader,
      base + (useDepthStreet ? 'studies/street-depth.glbz' : 'street.glbz'),
    ).catch(() => null),
    new TextureLoader()
      .loadAsync(base + 'room-irradiance.png')
      .catch(() => null),
  ])
  const room = gltf.scene
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
  const walls = [front, node('WallBack'), node('WallLeft'), node('WallRight')]
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
  scene.add(room, ring)
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
        (animated.has(parent) && !liveShadows.includes(parent))
      )
        object.castShadow = false
      if (parent === props.carriedJournal) interactives.set(object, 'atlas')
      for (const id of propIds) {
        if (parent === props.targets[id]) interactives.set(object, id)
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

  const miso = misoVisuals(node)
  const breeze = windowBreeze(street)
  const first = new PerspectiveCamera(62, 1, 0.035, 64)
  first.rotation.order = 'YXZ'
  const pixel = new OrthographicCamera(-1, 1, 1, -1, 0.1, 60)
  const pixelBackground = new Color('#c2a783')
  const realisticBackground = new Color('#b7d1dc')
  const indicator = new Vector3()
  const ray = new Raycaster()
  const clearanceRay = new Raycaster()
  const down = new Vector3(0, -1, 0)
  const click = new Vector2()
  let plasterOpacity = 1
  let activeCamera: PerspectiveCamera | OrthographicCamera = first
  let shadowPose = ''
  let seatBlend = 1
  let crouchBlend = 0
  let laptopBlend = 0
  const screenView = new Vector3(
    layout.props.laptop.x,
    0.99,
    layout.props.laptop.z + 0.38,
  )
  let focusedProp: PropId | undefined

  function draw(
    cafe: Cafe,
    now: number,
    dt: number,
    stride: number,
    reduce: boolean,
  ) {
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
    const targetLaptop = cafe.laptopFocus ? 1 : 0
    const settleCamera = (from: number, to: number) =>
      reduce || Math.abs(to - from) < 0.004
        ? to
        : MathUtils.damp(from, to, 12, dt || 1 / 60)
    crouchBlend = settleCamera(crouchBlend, targetCrouch)
    laptopBlend = settleCamera(laptopBlend, targetLaptop)
    seatBlend =
      reduce || Math.abs(targetPose - seatBlend) < 0.004
        ? targetPose
        : MathUtils.damp(seatBlend, targetPose, 14, dt || 1 / 60)
    visitor.visible = ring.visible = retro
    ring.position.set(p.x, 0.012, p.z)
    const cat = miso.update(cafe, now, dt, reduce)
    const hand = petHand(cafe.props)
    const pet =
      retro &&
      targetCrouch &&
      hand !== undefined &&
      cat.pet > 0 &&
      stride === 0 &&
      inReach(cafe, 'cat')
        ? {
            point: miso.petPoint(p.x, p.z, cat.upright, now),
            amount: cat.pet,
            side: hand,
            yaw: Math.atan2(p.x - cafe.miso.x, p.z - cafe.miso.z),
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
    const wind = breeze.update(now, !retro && !reduce && !cafe.laptopFocus)
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

    plasterOpacity = retro
      ? MathUtils.lerp(
          1,
          0.13,
          MathUtils.smoothstep(Math.cos(cafe.orbit), 0.05, 0.55),
        )
      : 1
    for (const fade of fadePlaster) fade(plasterOpacity)

    if (retro) {
      const x = Math.sin(cafe.orbit)
      const z = -Math.cos(cafe.orbit)
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
      const halfHeight = cafe.pixelZoom
        ? 2.88
        : Math.max(4.38, 6.05 / Math.max(aspect, 0.93))
      const projectedRoom =
        (layout.room.width * Math.abs(z) + layout.room.depth * Math.abs(x)) / 2
      const followLimit = Math.max(
        0,
        projectedRoom + 0.24 - halfHeight * aspect,
      )
      const follow = MathUtils.clamp(
        p.x * z - p.z * x,
        -followLimit,
        followLimit,
      )
      const centerX = cafe.pixelZoom ? p.x : z * follow
      const centerZ = cafe.pixelZoom ? p.z : -x * follow
      pixel.position.set(
        x * 14 + centerX,
        0.92 + 14 / Math.SQRT2,
        z * 14 + centerZ,
      )
      pixel.lookAt(centerX, 0.92, centerZ)
      pixel.top = halfHeight
      pixel.bottom = -halfHeight
      pixel.left = -halfHeight * aspect
      pixel.right = -pixel.left
      pixel.updateProjectionMatrix()
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
      first.aspect = width / height
      first.fov = MathUtils.lerp(
        width / height < 1.1 ? 85 : immersive ? 76 : 62,
        51,
        laptopBlend,
      )
      first.updateProjectionMatrix()
      activeCamera = first
    }

    // Reuse the shadow map until a visible caster or the cutaway changes.
    const nextShadowPose = [
      retro,
      plasterOpacity >= 0.8,
      props.doorAngle(),
      cafe.props.laptopOpen,
      props.notebookShadowPose(),
      cafe.props.pluggedIn,
      ...(cafe.chairPositions?.flatMap(({ x, z }) => [x, z]) ?? []),
      ...walls.map((wall) => wall.visible),
    ].join()
    renderer.shadowMap.needsUpdate =
      shadowPose !== nextShadowPose || (!retro && propsMoving)
    shadowPose = nextShadowPose
    renderer.render(scene, activeCamera)

    focusedProp = undefined
    let best = Infinity
    const focusHeight = {
      laptop: cafe.props.laptopOpen ? 0.24 : 0.08,
      notebook: 0.08,
      charger: 0.08,
      shelf: 0.19,
      journal: 0.12,
      water: 0.3,
      cat: 0.36 + cat.upright * 0.2,
      door: 0,
      cup: 0.11,
      atlas: 0.07,
    }
    for (const id of propIds) {
      if (cafe.laptopFocus || !inReach(cafe, id)) continue
      const spot =
        id === 'cup' || id === 'atlas'
          ? placed(cafe.props, id)
          : id === 'cat'
            ? cafe.miso
            : layout.props[id]
      if (!spot) continue
      const offsetX = id === 'charger' ? -0.1 : id === 'notebook' ? 0.1 : 0
      const offsetZ = id === 'laptop' ? 0.16 : id === 'charger' ? -0.06 : 0
      indicator.set(
        spot.x + offsetX,
        spot.y + focusHeight[id],
        spot.z + offsetZ,
      )
      indicator.project(activeCamera)
      const onScreen =
        Math.abs(indicator.x) < 0.94 &&
        Math.abs(indicator.y) < 0.9 &&
        Math.abs(indicator.z) < 1
      if (!onScreen) continue
      const centerDistance = Math.hypot(indicator.x, indicator.y)
      if (centerDistance < best) {
        best = centerDistance
        focusedProp = id
      }
    }

    return {
      moving:
        propsMoving ||
        cat.moving ||
        wind.moving ||
        avatarMoving ||
        armsMoving ||
        seatBlend !== targetPose ||
        crouchBlend !== targetCrouch ||
        laptopBlend !== targetLaptop,
      wakeAt: Math.min(cat.wakeAt, wind.wakeAt),
    }
  }

  function hittable(object: Object3D) {
    if (plasterOpacity < 0.4 && plasterMeshes.has(object)) return false
    for (let parent: Object3D | null = object; parent; parent = parent.parent) {
      if (
        !parent.visible ||
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

  function aim(event: PointerEvent) {
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
    miso.dispose()
    breeze.dispose()
    reflections.dispose()
    renderer.dispose()
    canvas.remove()
  }

  return {
    canvas,
    draw,
    pick,
    pickChair,
    useScreen,
    readScreen: screen.draw,
    screenSelection: screen.selected,
    findPlacement,
    dispose,
    animate: (id: 'cat' | 'water', now: number) =>
      id === 'cat' ? miso.pet(now) : props.pour(now),
    turnNotebook: props.turnNotebook,
    sip: props.sip,
    focused: () => focusedProp,
  }
}
