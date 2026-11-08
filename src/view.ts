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
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import { type Cafe, layout, position } from './cafe'
import { propVisuals } from './prop-visuals'
import { type PropId, inReach, propIds } from './props'

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
  const ambient = new HemisphereLight(0xffefd8, 0xb89a87, 1.72)
  scene.add(ambient)
  const sunlight = new DirectionalLight(0xffd0a0, 2.82)
  sunlight.position.set(-4.5, 6, -8)
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
      if (parent === visitor || animated.has(parent)) object.castShadow = false
      for (const id of propIds) {
        if (parent === props.targets[id]) interactives.set(object, id)
      }
      if (useDepthStreet && parent === exterior?.scene)
        object.castShadow = false
    }
  })

  const first = new PerspectiveCamera(62, 1, 0.035, 64)
  first.rotation.order = 'YXZ'
  const pixel = new OrthographicCamera(-1, 1, 1, -1, 0.1, 60)
  const pixelBackground = new Color('#c2a783')
  const realisticBackground = new Color('#b7d1dc')
  const indicator = new Vector3()
  const ray = new Raycaster()
  const click = new Vector2()
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
      ? Math.min(0.7, 380 / width)
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
    ambient.intensity = retro ? 1.92 : 1.72

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
      // Leave a low sill to mark the window when the front wall is cut away.
      front.scale.y = z > -0.14 ? 1 : 0.24
      pixel.position.set(x * 14, 10.2, z * 14)
      pixel.lookAt(0, 0.97, 0)
      const halfHeight = Math.max(5.32, 6.96 / (width / height))
      pixel.top = halfHeight
      pixel.bottom = -halfHeight
      pixel.left = -halfHeight * (width / height)
      pixel.right = -pixel.left
      pixel.updateProjectionMatrix()
      activeCamera = pixel
    } else {
      for (const wall of walls) wall.visible = true
      front.scale.y = 1
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

    // Props and the visitor move under live light. Static casters only change
    // when the cutaway walls do, so walking never regenerates the shadow map.
    const nextShadowPose = [
      retro,
      front.scale.y,
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
    }
    const occupied: Vector2[] = []
    const gap = width < 540 ? 27 : 25
    for (const [id, marker] of markers) {
      const spot = layout.props[id]
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
      const y = ((1 - indicator.y) * height) / 2
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

  function pick(event: PointerEvent) {
    const bounds = canvas.getBoundingClientRect()
    click.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      1 - ((event.clientY - bounds.top) / bounds.height) * 2,
    )
    ray.setFromCamera(click, activeCamera)
    for (const { object } of ray.intersectObjects(meshes, false)) {
      let visible = true
      for (let parent = object.parent; parent; parent = parent.parent) {
        if (!parent.visible) visible = false
      }
      if (visible && object.visible) return interactives.get(object)
    }
  }

  function dispose() {
    canvas.removeEventListener('webglcontextlost', onFailure)
    renderer.dispose()
    canvas.remove()
  }

  return {
    canvas,
    draw,
    pick,
    dispose,
    animate: props.animate,
    focused: () => focusedProp,
  }
}
