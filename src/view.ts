import {
  ACESFilmicToneMapping,
  CircleGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
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
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { type Cafe, layout } from './cafe'
import { propVisuals } from './prop-visuals'
import {
  type Placeable,
  type PropId,
  canReachSurface,
  inReach,
  placed,
  propIds,
} from './props'
import { position } from './visitor'

export async function loadView(
  viewport: HTMLElement,
  markers: Map<PropId, HTMLElement>,
  onFailure: () => void,
) {
  const loader = new GLTFLoader()
  const base = import.meta.env.BASE_URL
  const useDepthStreet =
    new URLSearchParams(location.search).get('street') === 'depth'
  const [gltf, exterior] = await Promise.all([
    loader.loadAsync(base + 'cafe.glb'),
    loader
      .loadAsync(
        base + (useDepthStreet ? 'studies/street-depth.glb' : 'street.glb'),
      )
      .catch(() => null),
  ])
  const room = gltf.scene
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

  const visitor = node('Visitor')
  const torso = node('VisitorTorso')
  const legs = [node('VisitorLeg0'), node('VisitorLeg1')]
  const art = node('Framed_print')
  const props = propVisuals(node)
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
  const ambient = new HemisphereLight(0xfff0dc, 0xb89e8f, 1.35)
  scene.add(ambient)
  const sunlight = new DirectionalLight(0xffe0ba, 3.1)
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
  const plasterMeshes = new Set<Object3D>()
  const plasterMaterials = new Map<MeshStandardMaterial, MeshStandardMaterial>()
  const fadePlaster: ((opacity: number) => void)[] = []
  const interactives = new Map<Object3D, PropId>()
  room.traverse((object) => {
    if (!(object instanceof Mesh)) return
    meshes.push(object)
    object.castShadow = true
    object.receiveShadow = true
    const materials: unknown[] = Array.isArray(object.material)
      ? object.material
      : [object.material]
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial && material.aoMap)
        material.aoMapIntensity = 0.58
    }
    for (let parent = object.parent; parent; parent = parent.parent) {
      if (parent === plaster) plasterMeshes.add(object)
      if (parent === visitor || animated.has(parent)) object.castShadow = false
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
        faded.transparent = true
        faded.depthWrite = false
        plasterMaterials.set(original, faded)
      }
      const transparent = faded
      fadePlaster.push((opacity) => {
        transparent.opacity = opacity
        object.material = opacity === 1 ? original : transparent
        object.castShadow = opacity >= 0.8
      })
    }
  })

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
  let gait = 0
  let swing = 0
  let seatBlend = 1
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
    if (!width || !height) return false

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
    seatBlend =
      reduce || Math.abs(targetPose - seatBlend) < 0.004
        ? targetPose
        : MathUtils.damp(seatBlend, targetPose, 14, dt || 1 / 60)
    visitor.visible = ring.visible = retro
    ring.position.set(p.x, 0.012, p.z)
    visitor.position.set(p.x, 0, p.z)
    visitor.rotation.y = cafe.visitor.yaw
    gait += stride * 8.8
    const walk = stride > 0.0001 && retro && !reduce
    swing = walk ? Math.sin(gait) * 0.39 : retro && !reduce ? swing * 0.67 : 0
    if (Math.abs(swing) < 0.009) swing = 0
    torso.position.set(0, -0.28 * seatBlend + Math.abs(swing) * 0.076, 0)
    for (const [i, leg] of legs.entries()) {
      leg.position.y = MathUtils.lerp(0.73, 0.47, seatBlend)
      leg.rotation.x = MathUtils.lerp(
        i === 0 ? swing : -swing,
        Math.PI * 0.37,
        seatBlend,
      )
    }
    const propsMoving = props.update(cafe, now, dt, reduce)

    ceiling.visible = street.visible = !retro
    scene.background = retro ? pixelBackground : realisticBackground
    renderer.toneMappingExposure = retro ? 1.15 : 1.27
    ambient.intensity = retro ? 1.9 : 1.35
    scene.environmentIntensity = retro ? 0.16 : 0.3

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
      pixel.position.set(x * 14 + centerX, 10.2, z * 14 + centerZ)
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
        MathUtils.lerp(layout.stand.eye, layout.seat.eye, seatBlend),
        p.z,
      )
      first.rotation.set(cafe.visitor.pitch, cafe.visitor.yaw, 0)
      first.aspect = width / height
      first.fov = width / height < 1.1 ? 81 : 62
      first.updateProjectionMatrix()
      activeCamera = first
    }

    // Only the walls and the swinging door change the cached shadow map.
    const nextShadowPose = [
      retro,
      plasterOpacity >= 0.8,
      props.doorAngle(),
      ...walls.map((wall) => wall.visible),
    ].join()
    renderer.shadowMap.needsUpdate = shadowPose !== nextShadowPose
    shadowPose = nextShadowPose
    renderer.render(scene, activeCamera)

    focusedProp = undefined
    let best = Infinity
    const markerHeight = {
      laptop: cafe.props.laptopOpen ? 0.24 : 0.08,
      notebook: 0.08,
      charger: 0.08,
      shelf: 0.19,
      water: 0.3,
      cat: 0.36,
      door: 0,
      cup: 0.11,
      atlas: 0.07,
    }
    const occupied: Vector2[] = []
    const gap = width < 540 ? 27 : 25
    for (const [id, marker] of markers) {
      const spot =
        id === 'cup' || id === 'atlas'
          ? placed(cafe.props, id)
          : layout.props[id]
      if (
        !spot ||
        (id === 'water' && cafe.props.water.kind === 'placed') ||
        (id === 'shelf' && cafe.props.shelfBook.kind === 'placed')
      ) {
        marker.hidden = true
        continue
      }
      const markerX = id === 'charger' ? -0.1 : id === 'notebook' ? 0.1 : 0
      const markerZ = id === 'laptop' ? 0.16 : id === 'charger' ? -0.06 : 0
      indicator.set(
        spot.x + markerX,
        spot.y + markerHeight[id],
        spot.z + markerZ,
      )
      indicator.project(activeCamera)
      const reachable = inReach(cafe, id)
      const onScreen =
        Math.abs(indicator.x) < 0.94 &&
        Math.abs(indicator.y) < 0.9 &&
        Math.abs(indicator.z) < 1
      marker.hidden = !onScreen || (!retro && !reachable)
      if (marker.hidden) continue
      marker.classList.toggle('nearby', reachable)
      const x = ((indicator.x + 1) * width) / 2
      const y = ((1 - indicator.y) * height) / 2 - (retro ? 13 : 0)
      const badge = new Vector2(x, y)
      if (retro) {
        for (const offset of [0, -gap, gap, -2 * gap, 2 * gap]) {
          badge.y = y + offset
          if (
            badge.y > 24 &&
            badge.y < height - 24 &&
            occupied.every(
              (other) => badge.distanceToSquared(other) >= gap * gap,
            )
          )
            break
        }
        occupied.push(badge)
      }
      marker.style.left = badge.x + 'px'
      marker.style.top = badge.y + 'px'
      if (reachable) {
        const centerDistance = Math.hypot(indicator.x, indicator.y)
        if (centerDistance < best) {
          best = centerDistance
          focusedProp = id
        }
      }
    }

    return propsMoving || swing !== 0 || seatBlend !== targetPose
  }

  function hittable(object: Object3D) {
    if (plasterOpacity < 0.4 && plasterMeshes.has(object)) return false
    for (let parent: Object3D | null = object; parent; parent = parent.parent) {
      if (!parent.visible || parent === props.carried) return false
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

  function dispose() {
    canvas.removeEventListener('webglcontextlost', onFailure)
    reflections.dispose()
    renderer.dispose()
    canvas.remove()
  }

  return {
    canvas,
    draw,
    pick,
    findPlacement,
    dispose,
    animate: props.animate,
    focused: () => focusedProp,
  }
}
